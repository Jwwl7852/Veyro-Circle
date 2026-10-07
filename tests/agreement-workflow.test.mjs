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
  if("nullValue" in v)return null;
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
      const old=docs.get(w.update?.name??w.verify), p=w.currentDocument;
      if(p?.exists===false && old || p?.updateTime && old?.updateTime!==p.updateTime) throw new Error("IDENTITY_CONFLICT");
    }
    for(const w of writes) {
      if(w.verify)continue;
      const old=docs.get(w.update.name);
      docs.set(w.update.name,{name:w.update.name,fields:w.updateMask ? {...old.fields,...w.update.fields} : w.update.fields,updateTime:`version-${++version}`});
    }
  };
  const profile={name:"Real person",email:"real@example.test",phone:"12345678",street:"Real Street 1",country:"DK",place:{id:"1",country:"DK",postcode:"4174",city:"Jystrup",lat:55,lon:12},subscriptionPlan:"plus",stripeCustomerId:"must-not-leak"};
  const profiles=new Map();
  const server={
    verifyFirebaseRequest:async request=>{const uid=request.headers.get("authorization");if(!["owner","borrower","stranger"].includes(uid))throw new Error("Du skal være logget ind");return {localId:uid};},
    getFirestoreDocument:async path=>structuredClone(docs.get(path) ?? null),
    getServerProfile:async uid=>profiles.get(uid)??profile,
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
        if(path.split("/").length !== 2 || path.split("/")[0] !== body.structuredQuery.from[0].collectionId) return false;
        const data=decode({mapValue:{fields:d.fields}});
        const value=f.field.fieldPath.split(".").reduce((v,key)=>v?.[key],data);
        return f.op==="ARRAY_CONTAINS" ? value?.includes(f.value.stringValue) : value===(f.value.stringValue??f.value.booleanValue);
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
  const pushes=[];
  const dependencies={"@/lib/search-alerts":{notifyListingMatches:async()=>{}},"@/lib/push-server":{sendCirclePush:async(...args)=>pushes.push(args)},"next/server":{after:fn=>fn(),NextResponse:{json:(data,options)=>Response.json(data,options)}},"@/lib/firebase-server":server,"@/lib/server-config":{serverConfig:()=>"test"},"@/lib/agreement-workflow":policy,"@/lib/marketplace":market,"@/lib/agreement-photos":photoPolicy};
  const calendarPolicy=load("../lib/listing-calendar.ts",{"./marketplace":market});
  dependencies["@/lib/listing-calendar"]=calendarPolicy;
  const calendarServer=load("../lib/listing-calendar-server.ts",dependencies);
  dependencies["@/lib/listing-calendar-server"]=calendarServer;
  dependencies["@/lib/agreement-schedule"]=load("../lib/agreement-schedule.ts");
  dependencies["@/lib/firestore-values"]=load("../lib/firestore-values.ts");
  dependencies["@/lib/community-server"]=load("../lib/community-server.ts",dependencies);
  dependencies["@/lib/discovery"]=load("../lib/discovery.ts",{"./marketplace":market});
  const communityApis=Object.fromEntries(["listings/feed","profile","reviews","preferences","wanted","agreement-changes"].map(name=>[name,load(`../app/api/${name}/route.ts`,dependencies)]));
  const communityCall=(api,method,uid,body,query="")=>communityApis[api][method](new Request("https://circle.test/api/"+api+query,{method,headers:{...(uid?{authorization:uid}:{}),"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}));
  const calendarApi=load("../app/api/availability/route.ts",dependencies);
  const api=load("../app/api/agreements/route.ts",dependencies);
  dependencies["@/lib/listing-details"]=load("../lib/listing-details.ts");
  const listingApi=load("../app/api/listings/route.ts",dependencies);
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
  const listingCall=(uid,listing)=>listingApi.POST(new Request("https://circle.test/api/listings",{method:"POST",headers:{authorization:uid,"content-type":"application/json"},body:JSON.stringify({listing})}));
  const calendarCall=(uid,body)=>calendarApi.POST(new Request("https://circle.test/api/availability",{method:"POST",headers:{authorization:uid,"content-type":"application/json"},body:JSON.stringify(body)}));
  const publicCalendar=(ids)=>calendarApi.GET(new Request("https://circle.test/api/availability?ids="+ids));
  const contactCall=uid=>listingApi.GET(new Request("https://circle.test/api/listings?id="+base.item.id,{headers:{authorization:uid}}));
  return {profiles,profile,contactCall,communityCall,docs,put,value,call,photoCall,images,listingCall,pushes,calendarCall,publicCalendar};
}
test("only listing owner sets deposit; old clients preserve it and invalid amounts fail",async()=>{
  const s=setup();
  const draft={...base.item,description:"Trailer",place:{id:"1",country:"DK",city:"Jystrup",postcode:"4174"},photos:[],deposit:25000};
  assert.equal((await s.listingCall("borrower",draft)).status,403);
  assert.equal((await s.listingCall("owner",draft)).status,200);
  assert.equal(s.value("listings/"+base.item.id).deposit,25000);
  assert.equal((await s.listingCall("owner",{...draft,deposit:undefined})).status,200);
  assert.equal(s.value("listings/"+base.item.id).deposit,25000);
  for(const deposit of [-1,1.5,10000001,"100"]) assert.equal((await s.listingCall("owner",{...draft,deposit})).status,400);
  assert.equal((await s.listingCall("owner",{...draft,deposit:0})).status,200);
  assert.equal(s.value("listings/"+base.item.id).deposit,0);
});
test("agreement uses owner deposit; stale or forged terms fail and saved terms stay unchanged",async()=>{
  const s=setup();s.put("listings/"+base.item.id,{...base.item,ownerUid:"owner",active:true,deposit:25000});
  assert.equal((await s.call("POST","borrower",{agreement:base})).status,409);
  const draft={...base,deposit:25000};
  const response=await s.call("POST","borrower",{agreement:draft});
  assert.equal(response.status,200);assert.equal((await response.json()).agreement.deposit,25000);
  s.put("listings/"+base.item.id,{...base.item,ownerUid:"owner",active:true,deposit:90000});
  const retry=await s.call("POST","borrower",{agreement:draft});
  assert.equal(retry.status,200);assert.equal((await retry.json()).agreement.deposit,25000);
  assert.equal(s.value("agreements/"+base.id).deposit,25000);
});
test("owner-first signatures support the second account at both handover and return",async()=>{
  const s=setup();s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  for(const phase of ["handover","return"]) {
    assert.equal((await s.call("PATCH","owner",{id:base.id,action:"note",phase,note:"Aftalt stand"})).status,200);
    for(const [role,uid] of [["lender","owner"],["borrower","borrower"]]) {
      assert.equal((await s.call("PATCH",uid,{id:base.id,action:"signature",phase,role,seenNote:"Aftalt stand",seenPhotoIds:[],signature:{dataUrl:"data:image/png;base64,AAA",signedAt:new Date().toISOString()}})).status,200);
    }
  }
  assert.equal(policy.agreementStage(s.value("agreements/"+base.id)),"returned");
});
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

test("push goes only to the counterpart after saved requests/messages, retries do not duplicate",async()=>{
  const s=setup();
  assert.equal((await s.call("POST","borrower",{agreement:base})).status,200);
  assert.deepEqual(s.pushes,[["owner","requested",base.id]]);
  await s.call("POST","borrower",{agreement:base});assert.equal(s.pushes.length,1);
  const body={id:base.id,action:"message",text:"Hej",messageId:"message-123456"};
  assert.equal((await s.call("PATCH","borrower",body)).status,200);
  assert.deepEqual(s.pushes[1],["owner","message",base.id]);
  await s.call("PATCH","borrower",body);assert.equal(s.pushes.length,2);
  assert.equal((await s.call("PATCH","stranger",{...body,messageId:"other-message"})).status,403);
  assert.equal(s.pushes.length,2);
});

test("public calendar exposes only dates and private blocks prevent requests and approval",async()=>{
  const s=setup();const today=policy.circleToday();
  const body={id:base.item.id,action:"add",from:today,to:today};
  assert.equal((await s.calendarCall("stranger",body)).status,403);
  assert.equal((await s.calendarCall("owner",body)).status,200);
  const publicData=await (await s.publicCalendar(base.item.id)).json();
  assert.deepEqual(publicData,{periods:{[base.item.id]:[{from:today,to:today}]}});
  assert.equal((await s.call("POST","borrower",{agreement:{...base,from:today,to:today}})).status,409);
  s.put("agreements/"+base.id,{...base,from:today,to:today,requestStatus:"requested"});
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"accept"})).status,409);
  const block=s.value("listingCalendars/"+base.item.id).blocks[0];
  assert.equal((await s.calendarCall("borrower",{id:base.item.id,action:"remove",blockId:block.id})).status,403);
  assert.equal((await s.calendarCall("owner",{id:base.item.id,action:"remove",blockId:block.id})).status,200);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"accept"})).status,200);
  assert.equal((await s.calendarCall("owner",body)).status,409);
});
test("owner block and booking approval cannot both win a concurrent race",async()=>{
  const s=setup();const today=policy.circleToday();s.put("agreements/"+base.id,{...base,from:today,to:today,requestStatus:"requested"});
  const results=await Promise.all([s.call("PATCH","owner",{id:base.id,action:"accept"}),s.calendarCall("owner",{id:base.item.id,action:"add",from:today,to:today})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});

test("reviews require completed loan, actual participant and one review per party",async()=>{
  const s=setup(),send=(uid,body={})=>s.communityCall("reviews","POST",uid,{id:base.id,stars:4,text:"God oplevelse",...body});
  s.put("agreements/"+base.id,{...base,requestStatus:"accepted"});
  assert.equal((await send("anonymous")).status,401);
  assert.equal((await send("stranger")).status,403);
  assert.equal((await send("borrower")).status,409);
  s.put("agreements/"+base.id,{...base,returnedAt:new Date().toISOString(),borrowerSignature:{},lenderSignature:{},borrowerReturnSignature:{},lenderReturnSignature:{}});
  assert.equal((await send("borrower",{stars:7})).status,400);
  assert.equal((await send("borrower",{stars:6,subjectUid:"stranger",author:"Fake"})).status,200);
  assert.equal((await send("borrower")).status,409);
  assert.equal((await send("owner")).status,200);
  const record=s.value(`reviews/${base.id}_borrower`);assert.equal(record.subjectUid,"owner");assert.equal(record.author,"Real");
  const publicData=await (await s.communityCall("reviews","GET",null,null,"?listingId="+base.item.id)).json();
  assert.equal(publicData.count,1);assert.equal(publicData.average,6);assert.equal(publicData.reviews[0].maxStars,6);
  assert.equal(publicData.reviews[0].authorUid,undefined);assert.equal(publicData.reviews[0].agreementId,undefined);
  const own=await (await s.communityCall("reviews","GET","owner",null,"?agreementId="+base.id)).json();assert.equal(own.reviews.length,2);assert.equal(own.reviewed,true);
  assert.equal((await s.communityCall("reviews","GET","stranger",null,"?agreementId="+base.id)).status,403);
});
test("preferences are scoped to authentication and preserve concurrent edits",async()=>{
  const s=setup(),send=(uid,body)=>s.communityCall("preferences","POST",uid,body);
  assert.equal((await s.communityCall("preferences","GET","anonymous")).status,401);
  assert.equal((await send("borrower",{action:"favorite",id:base.item.id,enabled:true,uid:"owner"})).status,200);
  assert.deepEqual(s.value("circlePreferences/borrower").favorites,[base.item.id]);assert.equal(s.docs.has("circlePreferences/owner"),false);
  const filter={query:"trailer",country:"DK",category:"transport",price:"paid",radius:"all",placeId:""};
  const outcomes=await Promise.all([1,2].map(()=>send("borrower",{action:"saveSearch",filter,alerts:true})));
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);assert.equal(s.value("circlePreferences/borrower").searches.length,1);
  assert.equal((await send("borrower",{action:"saveSearch",filter:{...filter,radius:"100",placeId:"invalid"}})).status,409);
  assert.equal((await send("borrower",{action:"favorite",id:base.item.id,enabled:false})).status,200);
  assert.deepEqual(s.value("circlePreferences/borrower").favorites,[]);
});
test("category fields are allowlisted and saved with the listing",async()=>{
  const s=setup();assert.equal((await s.listingCall("owner",{...base.item,description:"Trailer",place:{id:"1",country:"DK",city:"Jystrup",postcode:"4174"},photos:[],details:{payload:" 750 kg ",connection:"7-polet",secret:"drop",model:"wrong category"}})).status,200);
  assert.deepEqual(s.value("listings/"+base.item.id).details,{payload:"750 kg",connection:"7-polet"});
});
function scheduledBase(){const from=policy.circleToday();const to=new Date(Date.parse(from)+2*86400000).toISOString().slice(0,10);return {...base,from,to,days:3,total:15000,requestStatus:"accepted",pickupTime:"10:00",returnTime:"17:00"};}
function later(date,days){return new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);}
test("pickup and return times are validated, persisted and covered by idempotency",async()=>{
  const s=setup(),a=scheduledBase();a.to=a.from;
  assert.equal((await s.call("POST","borrower",{agreement:{...a,pickupTime:"18:00",returnTime:"17:00"}})).status,400);
  assert.equal((await s.call("POST","borrower",{agreement:{...a,pickupTime:"25:00"}})).status,400);
  assert.equal((await s.call("POST","borrower",{agreement:a})).status,200);assert.equal(s.value("agreements/"+a.id).pickupTime,"10:00");
  assert.equal((await s.call("POST","borrower",{agreement:{...a,pickupTime:"11:00"}})).status,409);
});
test("extension requires other party approval, server price, and preserves original signed terms",async()=>{
  const s=setup(),a=scheduledBase();a.borrowerSignature={dataUrl:"original"};a.lenderSignature={dataUrl:"original"};s.put("agreements/"+a.id,a);
  const act=(uid,body)=>s.communityCall("agreement-changes","POST",uid,{id:a.id,...body});
  assert.equal((await act("stranger",{action:"propose",to:later(a.to,2),returnTime:"18:00"})).status,403);
  assert.equal((await act("borrower",{action:"propose",to:later(a.to,2),returnTime:"18:00",total:1,acceptedBy:"owner"})).status,200);
  const proposal=s.value("agreements/"+a.id).changeProposal;assert.equal(proposal.total,25000);assert.equal(proposal.acceptedBy,undefined);
  assert.equal((await act("borrower",{action:"accept",proposalId:proposal.id})).status,409);
  assert.equal((await act("owner",{action:"accept",proposalId:"wrong"})).status,409);
  assert.equal((await act("owner",{action:"accept",proposalId:proposal.id})).status,200);
  const saved=s.value("agreements/"+a.id);assert.equal(saved.originalTo,a.to);assert.equal(saved.originalTotal,15000);assert.equal(saved.to,proposal.to);assert.equal(saved.total,25000);assert.equal(saved.deposit,a.deposit);assert.equal(saved.changeProposal,null);assert.equal(saved.extensions[0].acceptedBy,"owner");assert.deepEqual(saved.borrowerSignature,a.borrowerSignature);
  assert.equal((await act("owner",{action:"accept",proposalId:proposal.id})).status,409);
});
test("extension conflicts with calendar blocks and racing accepted bookings",async()=>{
  const s=setup(),a=scheduledBase();s.put("agreements/"+a.id,a);
  const to=later(a.to,2),act=(uid,body)=>s.communityCall("agreement-changes","POST",uid,{id:a.id,...body});
  await act("borrower",{action:"propose",to,returnTime:"17:00"});const proposal=s.value("agreements/"+a.id).changeProposal;
  assert.equal((await s.calendarCall("owner",{id:base.item.id,action:"add",from:to,to})).status,200);
  assert.equal((await act("owner",{action:"accept",proposalId:proposal.id})).status,409);
  const blocks=s.value("listingCalendars/"+base.item.id).blocks;const block=Object.values(blocks)[0];
  assert.equal((await s.calendarCall("owner",{id:base.item.id,action:"remove",blockId:block.id})).status,200);
  const other={...a,id:"VC-2099-OTHER123456",from:to,to,requestStatus:"requested"};s.put("agreements/"+other.id,other);
  const results=await Promise.all([act("owner",{action:"accept",proposalId:proposal.id}),s.call("PATCH","owner",{id:other.id,action:"accept"})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test("signatures from stale displayed terms cannot sign a newly extended agreement",async()=>{
  const s=setup(),a=scheduledBase();s.put("agreements/"+a.id,{...a,extensions:[{id:"accepted-extension"}]});
  const sign={id:a.id,action:"signature",role:"borrower",seenNote:"",seenPhotoIds:[],signature:{dataUrl:"data:image/png;base64,AAA",signedAt:new Date().toISOString()}};
  assert.equal((await s.call("PATCH","borrower",sign)).status,409);
  assert.equal((await s.call("PATCH","borrower",{...sign,seenTo:later(a.to,1)})).status,409);
  assert.equal((await s.call("PATCH","borrower",{...sign,seenTo:a.to})).status,200);
});
test("wanted posts expose postal area only, enforce ownership and link genuine owner listings",async()=>{
  const s=setup(),a=scheduledBase(),create={action:"create",title:"En trailer",description:"Til weekenden",from:a.from,to:a.to,ownerUid:"owner",author:"Fake"};
  assert.equal((await s.communityCall("wanted","POST","anonymous",create)).status,401);
  assert.equal((await s.communityCall("wanted","POST","borrower",create)).status,200);
  const id=[...s.docs.keys()].find(k=>k.startsWith("wanted/")).split("/")[1];const data=s.value("wanted/"+id);assert.equal(data.ownerUid,"borrower");assert.equal(data.author,"Real");
  assert.equal((await s.communityCall("wanted","POST","stranger",{action:"offer",id,listingId:base.item.id})).status,403);
  assert.equal((await s.communityCall("wanted","POST","owner",{action:"offer",id,listingId:base.item.id})).status,200);
  const pub=await (await s.communityCall("wanted","GET",null)).json();assert.equal(pub.items[0].ownerUid,undefined);assert.equal(pub.items[0].street,undefined);assert.deepEqual(pub.items[0].offers,[]);
  const mine=await (await s.communityCall("wanted","GET","borrower")).json();assert.equal(mine.items[0].offers.length,1);
  assert.equal((await s.communityCall("wanted","POST","owner",{action:"close",id})).status,403);
  assert.equal((await s.communityCall("wanted","POST","borrower",{action:"close",id})).status,200);
  assert.equal((await (await s.communityCall("wanted","GET",null)).json()).items.length,0);
});
test("wanted post limit remains safe under concurrent creates",async()=>{
  const s=setup(),a=scheduledBase(),create={action:"create",title:"En trailer",description:"Weekend",from:a.from,to:a.to};
  for(let i=0;i<4;i++)assert.equal((await s.communityCall("wanted","POST","borrower",create)).status,200);
  const results=await Promise.all([1,2].map(()=>s.communityCall("wanted","POST","borrower",create)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal([...s.docs.keys()].filter(k=>k.startsWith("wanted/")).length,5);
});

test("contact information is absent before approval and released atomically by the real owner",async()=>{
  const s=setup();assert.equal((await s.contactCall("borrower")).status,403);assert.equal((await s.contactCall("stranger")).status,403);assert.equal((await s.contactCall("owner")).status,200);
  const created=await s.call("POST","borrower",{agreement:{...base,lender:{street:"Forged",phone:"123"},contactsReleased:true}});assert.equal(created.status,200);
  const draft=(await created.json()).agreement;
  assert.equal(draft.lender.street,"");assert.equal(draft.lender.phone,"");assert.equal(draft.borrower.street,"");assert.equal(draft.borrower.phone,"");assert.equal(draft.borrower.email,"");assert.equal(draft.contactsReleased,undefined);
  assert.equal(s.value("agreements/"+base.id).lender.street,"");
  assert.equal((await s.call("PATCH","borrower",{id:base.id,action:"accept"})).status,403);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"accept"})).status,200);
  const approved=s.value("agreements/"+base.id);assert.equal(approved.contactsReleased,true);assert.equal(approved.lender.street,"Real Street 1");assert.equal(approved.lender.phone,"12345678");
  const shown=(await (await s.call("GET","borrower")).json()).agreements[0];assert.equal(shown.lender.street,"Real Street 1");
});
test("legacy pending contacts are redacted in lists and duplicate request responses",async()=>{
  const s=setup(),a={...base,borrower:{name:"Borrower",street:"Private B",phone:"111",email:"private@example.test",place:{}},lender:{name:"Owner",street:"Private O",phone:"222",place:{}}};s.put("agreements/"+base.id,a);
  const shown=(await (await s.call("GET","borrower")).json()).agreements[0];assert.equal(shown.lender.street,"");assert.equal(shown.borrower.email,"");
  const retry=await s.call("POST","borrower",{agreement:base});assert.equal(retry.status,200);assert.equal((await retry.json()).agreement.lender.phone,"");
  for(const requestStatus of ["declined","cancelled"]){s.put("agreements/"+base.id,{...a,requestStatus});const data=(await (await s.call("GET","borrower")).json()).agreements[0];assert.equal(data.lender.street,"");}
  assert.match(readFileSync(new URL("../firestore.rules",import.meta.url),"utf8"),/match \/agreements\/\{agreementId\} \{\s*\/\/[^\n]*\n\s*allow read: if false;/);
});

test("language changes update only the authenticated user's preference",async()=>{
  const s=setup();s.put("users/borrower",{preferredLanguage:"da",name:"Kept",subscriptionPlan:"free"});
  assert.equal((await s.communityCall("profile","PATCH","anonymous",{preferredLanguage:"sv"})).status,401);
  assert.equal((await s.communityCall("profile","PATCH","borrower",{preferredLanguage:"en"})).status,400);
  assert.equal((await s.communityCall("profile","PATCH","borrower",{preferredLanguage:"sv",uid:"owner",subscriptionPlan:"plus",name:"Changed"})).status,200);
  const user=s.value("users/borrower");assert.equal(user.preferredLanguage,"sv");assert.equal(user.subscriptionPlan,"free");assert.equal(user.name,"Kept");assert.equal(s.docs.has("users/owner"),false);
  assert.equal((await s.communityCall("profile","PATCH","borrower",{preferredLanguage:"da"})).status,200);
  assert.equal(s.value("users/borrower").preferredLanguage,"da");
  const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/\[configured, lang, user\?\.email, user\?\.emailVerified, user\?\.uid\]/);
});

test("no free advertisements: server rejects creation and editing but borrowers can request free",async()=>{
  const s=setup();s.profiles.set("borrower",{...s.profile,subscriptionPlan:"free"});
  const draft={...base.item,id:"new_listing_1234567890",description:"Trailer",place:s.profile.place,photos:[]};
  assert.equal((await s.listingCall("borrower",draft)).status,403);
  assert.equal((await s.call("POST","borrower",{agreement:base})).status,200);
  s.profiles.set("owner",{...s.profile,subscriptionPlan:"free"});
  assert.equal((await s.listingCall("owner",{...draft,id:base.item.id})).status,403);
  assert.equal((await s.call("PATCH","owner",{id:base.id,action:"accept"})).status,409);
  assert.equal((await s.call("POST","borrower",{agreement:{...base,id:"VC-2099-NEW123456789"}})).status,409);
});
test("paid listing limit cannot be exceeded by concurrent submissions",async()=>{
  const s=setup();for(let i=0;i<18;i++)s.put("listings/existing_listing_"+i,{...base.item,ownerUid:"owner",active:true});
  const draft={...base.item,description:"Trailer",place:s.profile.place,photos:[]};
  const results=await Promise.all([1,2].map(i=>s.listingCall("owner",{...draft,id:"new_listing_123456789"+i})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal([...s.docs.keys()].filter(p=>p.startsWith("listings/")).length,20);
  assert.equal((await s.listingCall("owner",{...draft,id:"new_listing_1234567893"})).status,409);
});
test("public feed pauses unpaid listings without deleting owners' items or exposing contacts",async()=>{
  const s=setup();s.put("users/owner",{subscriptionPlan:"free",street:"Private",phone:"123"});
  const read=async uid=>(await (await s.communityCall("listings/feed","GET",uid)).json()).listings;
  assert.equal((await read(null)).length,0);const own=await read("owner");assert.equal(own.length,1);assert.equal(own[0].publishable,false);
  s.put("users/owner",{subscriptionPlan:"plus",street:"Private",phone:"123"});
  const publicItems=await read(null);assert.equal(publicItems.length,1);assert.equal(publicItems[0].publishable,true);assert.equal(publicItems[0].street,undefined);assert.equal(publicItems[0].phone,undefined);
  s.put("users/owner",{subscriptionPlan:"free"});assert.equal((await read("borrower")).length,0);assert.equal(s.docs.has("listings/"+base.item.id),true);
});

test("lender reviews span listings, retain legacy scale and exclude borrower ratings",async()=>{
  const s=setup();s.put("agreements/legacy_review_123",{...base,lenderUid:"owner"});
  s.put("reviews/old_review_123",{agreementId:"legacy_review_123",listingId:"another_listing_123",subjectUid:"owner",author:"A",stars:5,text:"Godt",createdAt:"2026-01-01"});
  s.put("reviews/new_review_123",{subjectUid:"owner",subjectRole:"lender",author:"B",stars:6,maxStars:6,text:"Super",createdAt:"2026-10-01"});
  s.put("reviews/borrower_review_123",{subjectUid:"owner",subjectRole:"borrower",author:"C",stars:1,maxStars:6,text:"Not a lender review",createdAt:"2026-10-01"});
  const data=await (await s.communityCall("reviews","GET",null,null,"?listingId="+base.item.id)).json();
  assert.equal(data.count,2);assert.equal(data.average,6);assert.deepEqual(data.reviews.map(r=>r.maxStars).sort(),[5,6]);
});
