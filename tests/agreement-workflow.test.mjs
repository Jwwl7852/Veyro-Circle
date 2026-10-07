import test, {afterEach} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";

function load(file, dependencies = {}) {
  const url = new URL(file,import.meta.url);
  const code = ts.transpileModule(readFileSync(url,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports = {};
  new Function("require","exports",code)(name=>dependencies[name] ?? createRequire(url)(name),exports);
  return exports;
}
const policy = load("../lib/agreement-workflow.ts");
const market = load("../lib/marketplace.ts");
const base = {id:"VC-2099-ABCDEF123456",borrowerUid:"borrower",lenderUid:"owner",participantUids:["borrower","owner"],item:{id:"listing_123456789012345",name:"Trailer",dailyPrice:5000,category:"transport",country:"DK"},from:"2099-04-10",to:"2099-04-12",requestStatus:"requested",deposit:0,message:"Hej",handoverNote:"",returnNote:""};
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
  const api=load("../app/api/agreements/route.ts",{"next/server":{NextResponse:{json:(data,options)=>Response.json(data,options)}},"@/lib/firebase-server":server,"@/lib/server-config":{serverConfig:()=>"test"},"@/lib/agreement-workflow":policy,"@/lib/marketplace":market});
  put("listings/"+base.item.id,{ownerUid:"owner",active:true,...base.item});
  const call=(method,uid,body,query="")=>api[method](new Request("https://circle.test/api/agreements"+query,{method,headers:{authorization:uid,"content-type":"application/json"},...(body ? {body:JSON.stringify(body)} : {})}));
  return {docs,put,value,call};
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
