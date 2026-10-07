import test, {afterEach} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
import sharp from "sharp";

const jpeg=await sharp({create:{width:40,height:30,channels:3,background:"#008eac"}}).jpeg().toBuffer();

function load(file, dependencies = {}) {
  const url = new URL(file,import.meta.url);
  const code = ts.transpileModule(readFileSync(url,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports = {};
  new Function("require","exports",code)(name=>dependencies[name] ?? createRequire(url)(name),exports);
  return exports;
}
const policy = load("../lib/agreement-workflow.ts");
const market = load("../lib/marketplace.ts");
const photoPolicy = load("../lib/agreement-photos.ts");
const base = {id:"VC-2099-ABCDEF123456",borrowerUid:"borrower",lenderUid:"owner",participantUids:["borrower","owner"],item:{id:"listing_123456789012345",name:"Trailer",dailyPrice:5000,category:"transport",country:"DK"},from:"2099-04-10",to:"2099-04-12",requestStatus:"requested",deposit:0,message:"Hej",handoverNote:"",returnNote:""};

test("private photos require verified participant and an accepted two-account agreement",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  assert.equal((await s.photoCall("POST","anonymous","handover",null,jpeg)).status,401);
  assert.equal((await s.photoCall("POST","stranger","handover",null,jpeg)).status,403);
  assert.equal((await s.photoCall("POST","borrower","handover",null,jpeg)).status,409);
  assert.equal(s.images.size,0);
  s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const result=await s.photoCall("POST","borrower","handover",null,jpeg);
  assert.equal(result.status,200);
  const photo=(await result.json()).photos[0];
  assert.equal(photo.uploadedBy,"borrower");assert.equal(photo.width,40);assert.equal(photo.height,30);
  assert.equal(photo.src,undefined);assert.equal(photo.storagePath,undefined);
  assert.equal((await s.photoCall("GET","stranger","handover",photo.id)).status,403);
  const own=await s.photoCall("GET","owner","handover",photo.id);
  assert.equal(own.status,200);assert.match(own.headers.get("cache-control"),/private, no-store/);
  assert.equal(own.headers.get("content-type"),"image/jpeg");
  assert.equal((await sharp(Buffer.from(await own.arrayBuffer())).metadata()).format,"jpeg");
  assert.equal((await s.photoCall("GET","owner","return",photo.id)).status,404);
  assert.equal((await s.photoCall("GET","owner","handover","../../users/owner")).status,400);
});
test("photo uploads validate decoded JPEG, maximum bytes/dimensions and two-photo limit",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  assert.equal((await s.photoCall("POST","borrower","handover",null,Buffer.from("not a jpeg"))).status,400);
  assert.equal((await s.photoCall("POST","borrower","handover",null,jpeg,{"content-type":"text/html"})).status,415);
  assert.equal((await s.photoCall("POST","borrower","handover",null,Buffer.alloc(900*1024+1))).status,413);
  const wide=await sharp({create:{width:1601,height:2,channels:3,background:"white"}}).jpeg().toBuffer();
  assert.equal((await s.photoCall("POST","borrower","handover",null,wide)).status,400);
  for(const uid of ["borrower","owner"]) assert.equal((await s.photoCall("POST",uid,"handover",null,jpeg)).status,200);
  assert.equal((await s.photoCall("POST","borrower","handover",null,jpeg)).status,409);
  assert.equal(s.images.size,2);
});
test("signature binds reviewed photo IDs and first signature locks both parties' photos",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const photo=(await (await s.photoCall("POST","borrower","handover",null,jpeg)).json()).photos[0];
  const sign={id:base.id,action:"signature",role:"borrower",signature:{dataUrl:"data:image/png;base64,AAA",signedAt:new Date().toISOString()},seenNote:""};
  assert.equal((await s.call("PATCH","borrower",sign)).status,409);
  assert.equal((await s.call("PATCH","borrower",{...sign,seenPhotoIds:[]})).status,409);
  assert.equal((await s.call("PATCH","borrower",{...sign,seenPhotoIds:["old-id"]})).status,409);
  assert.equal((await s.call("PATCH","borrower",{...sign,seenPhotoIds:[photo.id]})).status,200);
  assert.deepEqual(s.value("agreements/"+base.id).borrowerSignature.photoIds,[photo.id]);
  assert.equal((await s.photoCall("DELETE","borrower","handover",photo.id)).status,409);
  assert.equal((await s.photoCall("POST","owner","handover",null,jpeg)).status,409);
  assert.equal((await s.call("PATCH","owner",{...sign,role:"lender",seenPhotoIds:[photo.id]})).status,200);
  assert.equal(s.images.size,1);
});
test("only uploader can remove unsigned evidence and detached files cannot be read",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const photo=(await (await s.photoCall("POST","borrower","handover",null,jpeg)).json()).photos[0];
  assert.equal((await s.photoCall("DELETE","owner","handover",photo.id)).status,403);
  assert.equal((await s.photoCall("DELETE","borrower","handover",photo.id)).status,200);
  assert.equal(s.images.size,0);
  assert.deepEqual(s.value("agreements/"+base.id).handoverPhotos,[]);
  assert.equal((await s.photoCall("GET","owner","handover",photo.id)).status,404);
});
test("return photos open after both handover signatures and lock at first return signature",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted",borrowerSignature:{}});
  assert.equal((await s.photoCall("POST","owner","return",null,jpeg)).status,409);
  s.put("agreements/"+base.id,{...base,requestStatus:"accepted",borrowerSignature:{},lenderSignature:{}});
  const photo=(await (await s.photoCall("POST","owner","return",null,jpeg)).json()).photos[0];
  const sign={id:base.id,action:"signature",role:"lender",phase:"return",signature:{dataUrl:"data:image/png;base64,AAA",signedAt:new Date().toISOString()},seenNote:"",seenPhotoIds:[photo.id]};
  assert.equal((await s.call("PATCH","owner",sign)).status,200);
  assert.equal((await s.photoCall("DELETE","owner","return",photo.id)).status,409);
  assert.equal((await s.photoCall("POST","borrower","return",null,jpeg)).status,409);
  assert.equal((await s.call("PATCH","borrower",{...sign,role:"borrower"})).status,200);
  assert.equal((await s.photoCall("GET","borrower","return",photo.id)).status,200);
});
test("concurrent uploads preserve limit/version and clean losing upload",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  await s.photoCall("POST","borrower","handover",null,jpeg);
  const results=await Promise.all(["owner","borrower"].map(uid=>s.photoCall("POST",uid,"handover",null,jpeg)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(s.value("agreements/"+base.id).handoverPhotos.length,2);
  assert.equal(s.images.size,2);
});
test("racing photo upload and signature cannot create unreviewed signed evidence",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const sign={id:base.id,action:"signature",role:"borrower",signature:{dataUrl:"data:image/png;base64,AAA",signedAt:new Date().toISOString()},seenNote:"",seenPhotoIds:[]};
  const results=await Promise.all([s.photoCall("POST","owner","handover",null,jpeg),s.call("PATCH","borrower",sign)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const current=s.value("agreements/"+base.id);
  assert.ok(!(current.borrowerSignature && current.handoverPhotos?.length));
});
test("expired evidence is inaccessible and cannot be changed",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const photo=(await (await s.photoCall("POST","owner","handover",null,jpeg)).json()).photos[0];
  s.put("agreements/"+base.id,{...s.value("agreements/"+base.id),retentionUntil:"2000-01-01T00:00:00Z"});
  for(const method of ["GET","DELETE","POST"]) assert.equal((await s.photoCall(method,"owner","handover",photo.id,method === "POST" ? jpeg : undefined)).status,410);
});
test("only owner accepts/declines, participants cancel only before signatures",()=>{
  assert.equal(policy.decisionAllowed(base,"owner","accept"),true);
  for(const uid of ["borrower","stranger"]) assert.equal(policy.decisionAllowed(base,uid,"accept"),false);
  assert.equal(policy.decisionAllowed(base,"borrower","cancel"),true);
  assert.equal(policy.decisionAllowed({...base,requestStatus:"accepted",borrowerSignature:{}},"owner","cancel"),false);
  for(const requestStatus of ["cancelled","declined"]) assert.equal(policy.decisionAllowed({...base,requestStatus},"owner","accept"),false);
});
test("legacy signatures preserve progress and completed agreements stay archived",()=>{
  const legacy = {...base,requestStatus:undefined};
  assert.equal(policy.agreementStage(legacy),"requested");
  assert.equal(policy.agreementStage({...legacy,borrowerSignature:{}}),"accepted");
  assert.equal(policy.agreementStage({...legacy,borrowerSignature:{},lenderSignature:{}}),"handedOver");
  assert.equal(policy.isArchived({...legacy,returnedAt:"2099-04-12"}),true);
});
test("inclusive date overlap protects both boundary days",()=>{
  assert.equal(policy.overlaps(base,{from:"2099-04-12",to:"2099-04-14"}),true);
  assert.equal(policy.overlaps(base,{from:"2099-04-13",to:"2099-04-14"}),false);
  assert.equal(policy.reservesDates(base),false);
  assert.equal(policy.reservesDates({...base,requestStatus:"accepted"}),true);
});
test("notifications are personal, persistent, and newer activity stays unread",()=>{
  const a={...base,activityAt:"2099-04-01T12:00:00Z",activityBy:"borrower",activityKind:"requested"};
  assert.equal(policy.agreementNotices(a,"stranger").length,0);
  assert.equal(policy.agreementNotices(a,"borrower").length,0);
  const first=policy.agreementNotices(a,"owner")[0];
  const read={...a,notificationReads:{owner:[first.id]}};
  assert.equal(policy.agreementNotices(read,"owner")[0].read,true);
  assert.equal(policy.agreementNotices({...read,activityAt:"2099-04-02T12:00:00Z"},"owner")[0].read,false);
});
test("due/overdue reminders stop when own return signature is registered",()=>{
  const a={...base,requestStatus:"accepted",borrowerSignature:{},lenderSignature:{}};
  assert.equal(policy.agreementNotices(a,"borrower","2099-04-11").length,0);
  assert.equal(policy.agreementNotices(a,"borrower","2099-04-12")[0].kind,"returnDue");
  assert.equal(policy.agreementNotices(a,"borrower","2099-04-13")[0].kind,"overdue");
  assert.equal(policy.agreementNotices({...a,borrowerReturnSignature:{}},"borrower","2099-04-13").length,0);
});

// Exercise the actual route handlers against an in-memory Firestore REST double.
// The double implements atomic commit preconditions; no production records touched.
const originalFetch = globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function encode(v) {
  if(v===null) return {nullValue:null};
  if(typeof v === "string") return {stringValue:v};
  if(typeof v === "number") return {doubleValue:v};
  if(typeof v === "boolean") return {booleanValue:v};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]))}};
}
function decode(v) {
  if(v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields).map(([k,v])=>[k,decode(v)]));
  if(v.arrayValue) return v.arrayValue.values.map(decode);
  return v.stringValue ?? v.timestampValue ?? v.booleanValue ?? v.doubleValue ?? Number(v.integerValue);
}
function setup() {
  const docs=new Map(); let version=0;
  const put=(path,data)=>{docs.set(path,{name:path,fields:encode(data).mapValue.fields,updateTime:`version-${++version}`});};
  const value=path=>decode({mapValue:{fields:docs.get(path).fields}});
  const commit=async writes=>{
    for(const w of writes) {
      const old=docs.get(w.update.name), p=w.currentDocument;
      if(p?.exists===false && old || p?.updateTime && old?.updateTime!==p.updateTime) throw new Error("IDENTITY_CONFLICT");
    }
    for(const w of writes) {
      const old=docs.get(w.update.name);
      docs.set(w.update.name,{name:w.update.name,fields:w.updateMask ? {...old.fields,...w.update.fields} : w.update.fields,updateTime:`version-${++version}`});
    }
  };
  const profile={name:"Real person",email:"real@example.test",phone:"12345678",street:"Real Street 1",place:{id:"1",country:"DK",postcode:"4174",city:"Jystrup",lat:55,lon:12},subscriptionPlan:"plus",stripeCustomerId:"must-not-leak"};
  const server={
    verifyFirebaseRequest:async request=>{const uid=request.headers.get("authorization");if(!["owner","borrower","stranger"].includes(uid))throw new Error("Du skal være logget ind");return {localId:uid};},
    getFirestoreDocument:async path=>structuredClone(docs.get(path) ?? null),
    getServerProfile:async()=>profile,
    firestoreDocumentName:path=>path,
    firestoreDocumentUrl:path=>`https://fake.test/${path}`,
    serviceToken:async()=>"fake",
    commitFirestoreWrites:commit,
  };
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input); const body=init.body ? JSON.parse(init.body) : {};
    if(url.pathname.endsWith(":runQuery")) {
      const f=body.structuredQuery.where.fieldFilter;
      const rows=[...docs.entries()].filter(([path,d])=>{
        if(!/^agreements\/[^/]+$/.test(path)) return false;
        const data=decode({mapValue:{fields:d.fields}});
        const value=f.field.fieldPath.split(".").reduce((v,key)=>v?.[key],data);
        return f.op==="ARRAY_CONTAINS" ? value?.includes(f.value.stringValue) : value===f.value.stringValue;
      }).map(([,document])=>({document:structuredClone(document)}));
      return Response.json(rows);
    }
    const path=decodeURIComponent(url.pathname.slice(1));
    if(init.method==="PATCH") {
      const precondition=url.searchParams.has("currentDocument.exists") ? {exists:false} : {updateTime:url.searchParams.get("currentDocument.updateTime")};
      try { await commit([{update:{name:path,fields:body.fields},currentDocument:precondition,...(url.searchParams.has("updateMask.fieldPaths") ? {updateMask:{}} : {})}]);return Response.json({}); }
      catch {return Response.json({},{status:409});}
    }
    return docs.has(path) ? Response.json(structuredClone(docs.get(path))) : Response.json({},{status:404});
  };
  const dependencies={"next/server":{NextResponse:{json:(data,options)=>Response.json(data,options)}},"@/lib/firebase-server":server,"@/lib/server-config":{serverConfig:()=>"test"},"@/lib/agreement-workflow":policy,"@/lib/marketplace":market,"@/lib/agreement-photos":photoPolicy};
  const api=load("../app/api/agreements/route.ts",dependencies);
  const images=new Map();
  const photoApi=load("../app/api/agreements/photos/route.ts",{...dependencies,"@/lib/agreement-photo-storage":{
    agreementPhotoPath:(id,phase,photoId)=>`${id}/${phase}/${photoId}`,
    putAgreementPhoto:async(path,bytes)=>{images.set(path,bytes);},
    readAgreementPhoto:async path=>images.has(path) ? new Blob([images.get(path)]).stream() : null,
    deleteAgreementPhoto:async path=>{images.delete(path);},
  }});
  put("listings/"+base.item.id,{ownerUid:"owner",active:true,...base.item});
  const call=(method,uid,body,query="")=>api[method](new Request("https://circle.test/api/agreements"+query,{method,headers:{authorization:uid,"content-type":"application/json"},...(body ? {body:JSON.stringify(body)} : {})}));
  const photoCall=(method,uid,phase="handover",photoId,bytes,extra={})=>photoApi[method](new Request(`https://circle.test/api/agreements/photos?${new URLSearchParams({id:base.id,phase,...(photoId ? {photoId} : {})})}`,{method,headers:{authorization:uid,...(bytes ? {"content-type":"image/jpeg"} : {}),...extra},...(bytes ? {body:bytes} : {})}));
  return {docs,put,value,call,photoCall,images};
}
test("new request derives parties, price and requested status on server",async()=>{
  const s=setup();
  const res=await s.call("POST","borrower",{agreement:{...base,total:1,lenderUid:"stranger",participantUids:["stranger"],borrower:{name:"Fake"},borrowerSignature:{},requestStatus:"accepted",notificationReads:{owner:["forged"]}}});
  assert.equal(res.status,200);
  const a=(await res.json()).agreement;
  assert.equal(a.total,15000); assert.equal(a.lenderUid,"owner"); assert.equal(a.requestStatus,"requested");
  assert.deepEqual(a.participantUids,["borrower","owner"]); assert.equal(a.borrower.name,"Real person");
  assert.equal(a.borrowerSignature,undefined); assert.equal(a.borrower.stripeCustomerId,undefined); assert.equal(a.notificationReads,undefined);
});
test("duplicate delivery is idempotent but cannot overwrite an existing agreement",async()=>{
  const s=setup();
  const body={agreement:base};
  assert.equal((await s.call("POST","borrower",body)).status,200);
  assert.equal((await s.call("POST","borrower",body)).status,200);
  assert.equal((await s.call("POST","borrower",{agreement:{...base,deposit:900}})).status,409);
  assert.equal([...s.docs.keys()].filter(p=>p.startsWith("agreements/")).length,1);
});
test("invalid requests, path traversal and self lending are rejected",async()=>{
  const s=setup();
  for(const changed of [{id:"../../users/owner"},{from:"2099-02-30"},{to:"2098-01-01"},{deposit:-1},{message:"x".repeat(2001)}]) assert.ok((await s.call("POST","borrower",{agreement:{...base,...changed}})).status>=400);
  assert.equal((await s.call("POST","owner",{agreement:{...base,borrowerUid:"owner"}})).status,400);
  assert.ok((await s.call("GET","anonymous")).status>=400);
});
test("only participants read and only owner approves; stranger cannot chat",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  assert.deepEqual((await (await s.call("GET","stranger")).json()).agreements,[]);
  assert.equal((await s.call("PATCH","borrower",{id:base.id,action:"accept"})).status,403);
  assert.equal((await s.call("PATCH","stranger",{id:base.id,action:"message",text:"Hi",messageId:"message123456"})).status,403);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"accept"})).status,200);
});
test("simultaneous overlapping approvals commit exactly one reservation",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  const other={...base,id:"VC-2099-OTHER123456"};s.put("agreements/"+other.id,other);
  const res=await Promise.all([base,other].map(a=>s.call("PATCH","owner",{id:a.id,action:"accept"})));
  assert.deepEqual(res.map(r=>r.status).sort(),[200,409]);
  assert.equal([base,other].filter(a=>s.value("agreements/"+a.id).requestStatus==="accepted").length,1);
});
test("cancellation releases dates; signed agreements cannot be cancelled",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const other={...base,id:"VC-2099-OTHER123456"};s.put("agreements/"+other.id,other);
  assert.equal((await s.call("PATCH","owner",{id:other.id,action:"accept"})).status,409);
  assert.equal((await s.call("PATCH","borrower",{id:base.id,action:"cancel"})).status,200);
  assert.equal((await s.call("PATCH","owner",{id:other.id,action:"accept"})).status,200);
  s.put("agreements/"+other.id,{...other,requestStatus:"accepted",borrowerSignature:{}});
  assert.equal((await s.call("PATCH","owner",{id:other.id,action:"cancel"})).status,403);
});
test("signature requires acceptance, correct signer and the note actually viewed",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  const sign={id:base.id,action:"signature",role:"borrower",signature:{dataUrl:"data:image/png;base64,AAA",signedAt:"2099-01-01T00:00:00Z"},seenNote:""};
  assert.equal((await s.call("PATCH","borrower",sign)).status,409);
  s.put("agreements/"+base.id,{...base,requestStatus:"accepted",handoverNote:"Cracked plastic"});
  assert.equal((await s.call("PATCH","borrower",sign)).status,409);
  assert.equal((await s.call("PATCH","owner",{...sign,seenNote:"Cracked plastic"})).status,403);
  assert.equal((await s.call("PATCH","borrower",{...sign,seenNote:"Cracked plastic"})).status,200);
  assert.notEqual(s.value("agreements/"+base.id).borrowerSignature.signedAt,sign.signature.signedAt);
});
test("chat message and notification are committed together and sender cannot be forged",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  const body={id:base.id,action:"message",messageId:"message123456",text:"Hi",senderUid:"owner"};
  assert.equal((await s.call("PATCH","borrower",body)).status,200);
  assert.equal((await s.call("PATCH","borrower",body)).status,200);
  assert.equal(s.value(`agreements/${base.id}/messages/message123456`).senderUid,"borrower");
  assert.equal(s.value("agreements/"+base.id).activityKind,"message");
  assert.equal(s.value("agreements/"+base.id).activityBy,"borrower");
});
test("read acknowledgment cannot mark newer unseen activity read or write another user's state",async()=>{
  const s=setup();const a={...base,activityBy:"borrower",activityAt:"2099-01-01",activityKind:"requested"};s.put("agreements/"+base.id,a);
  const n=policy.agreementNotices(a,"owner")[0];
  await s.call("PATCH","owner",{id:base.id,action:"read",noticeIds:[n.id,"fake"],notificationReads:{borrower:["forged"]}});
  assert.deepEqual(s.value("agreements/"+base.id).notificationReads,{owner:[n.id]});
  const newer={...s.value("agreements/"+base.id),activityAt:"2099-01-02"};s.put("agreements/"+base.id,newer);
  await s.call("PATCH","owner",{id:base.id,action:"read",noticeIds:[n.id]});
  assert.equal(policy.agreementNotices(s.value("agreements/"+base.id),"owner")[0].read,false);
});
test("availability exposes dates only, never agreement IDs or participants",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  const res=await s.call("GET","stranger",null,`?listingId=${base.item.id}`);
  assert.equal(res.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(await res.json(),{periods:[{from:base.from,to:base.to}]});
});
test("two-party handover and return complete the lifecycle without editing signed notes",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  const signature={dataUrl:"data:image/png;base64,AAA",signedAt:new Date().toISOString()};
  await s.call("PATCH","owner",{id:base.id,action:"accept"});
  for(const [role,uid] of [["borrower","borrower"],["lender","owner"]]) {
    assert.equal((await s.call("PATCH",uid,{id:base.id,action:"signature",role,signature,phase:"handover",seenNote:""})).status,200);
  }
  assert.equal(policy.agreementStage(s.value("agreements/"+base.id)),"handedOver");
  assert.equal((await s.call("PATCH","borrower",{id:base.id,action:"note",phase:"handover",note:"changed"})).status,409);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"note",phase:"return",note:"New scratch"})).status,200);
  for(const [role,uid] of [["borrower","borrower"],["lender","owner"]]) {
    assert.equal((await s.call("PATCH",uid,{id:base.id,action:"signature",role,signature,phase:"return",seenNote:"New scratch"})).status,200);
  }
  const final=s.value("agreements/"+base.id);
  assert.equal(policy.agreementStage(final),"returned"); assert.equal(final.returnCondition,"remarks");
  assert.equal(final.activityKind,"returned"); assert.equal(policy.reservesDates(final),false);
});
test("declining moves the request into the archive and refuses later approval",async()=>{
  const s=setup();s.put("agreements/"+base.id,base);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"decline"})).status,200);
  assert.equal(policy.isArchived(s.value("agreements/"+base.id)),true);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"accept"})).status,403);
});
