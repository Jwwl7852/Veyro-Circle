import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
function load(file,deps={}) {
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function("require","exports",code)(name=>deps[name],exports);return exports;
}
const server=load("../lib/push-server.ts",{"node:crypto":crypto});
test("push payloads contain generic translated text and an encoded ticket, no private content",()=>{
  assert.match(server.pushPayload("message","a/b","da").url,/a%2Fb/);
  assert.match(server.pushPayload("requested","ticket","sv").body,/låneförfrågan/);
  assert.deepEqual(Object.keys(server.pushPayload("message","id","da")).sort(),["body","tag","title","url"]);
  assert.equal(server.validPushToken("invalid/token"),false);
  assert.equal(server.validPushToken("a".repeat(5000)),false);
  assert.match(server.pushId("token"),/^[a-f0-9]{64}$/);
});
test("registration binds uid to authenticated identity, deletion cannot remove another user's token",async()=>{
  const writes=[];let old=null;
  const api=load("../app/api/push/route.ts",{"@/lib/push-server":server,"@/lib/firebase-server":{verifyFirebaseRequest:async r=>{if(r.headers.get("authorization")!=="ok")throw Error();return {localId:"actual"};},getFirestoreDocument:async()=>old,firestoreDocumentName:p=>p,commitFirestoreWrites:async w=>writes.push(...w)}});
  const call=(method,auth="ok",data={token:"a".repeat(100),uid:"forged",lang:"sv"})=>api[method](new Request("https://circle.test/api/push",{method,headers:{authorization:auth,"content-type":"application/json"},body:JSON.stringify(data)}));
  const previous=process.env.CIRCLE_PUSH_ENABLED;process.env.CIRCLE_PUSH_ENABLED="true";
  try {
    assert.equal((await call("POST","bad")).status,401);
    assert.equal((await call("POST","ok",{token:"bad"})).status,400);
    assert.equal((await call("POST")).status,200);
    assert.equal(writes[0].update.fields.uid.stringValue,"actual");
    assert.equal(writes[0].update.fields.lang.stringValue,"sv");
    old={fields:{uid:{stringValue:"other"}},updateTime:"v1"};
    await call("DELETE");assert.equal(writes.length,1);
    old.fields.uid.stringValue="actual";await call("DELETE");assert.equal(writes.length,2);
    assert.deepEqual(writes[1].currentDocument,{updateTime:"v1"});
    process.env.CIRCLE_PUSH_ENABLED="false";assert.equal((await call("POST")).status,503);
  } finally { if(previous===undefined)delete process.env.CIRCLE_PUSH_ENABLED;else process.env.CIRCLE_PUSH_ENABLED=previous; }
});
test("service worker displays data messages and refuses external navigation",async()=>{
  const listeners={};const shown=[];const opened=[];
  const self={location:{origin:"https://circle.test"},addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async u=>opened.push(u)}};
  vm.runInNewContext(readFileSync(new URL("../public/sw.js",import.meta.url),"utf8"),{self,URL});
  let pending;const event={data:{json:()=>({data:server.pushPayload("message","ticket","da")})},waitUntil:p=>pending=p};
  listeners.push(event);await pending;assert.equal(shown.length,1);
  event.data.json=()=>({data:{url:"https://evil.test/"}});listeners.push(event);assert.equal(shown.length,1);
  listeners.notificationclick({notification:{close(){},data:shown[0][1].data},waitUntil:p=>pending=p});await pending;
  assert.equal(opened[0],"https://circle.test/?ticket=ticket&push=message");
});

test("delivery excludes expired devices, removes invalid tokens and tolerates FCM failures",async()=>{
  const previous=process.env.CIRCLE_PUSH_ENABLED;const originalFetch=globalThis.fetch;
  const sent=[];const writes=[];
  const live={name:"pushDevices/live",updateTime:"version1",fields:{uid:{stringValue:"owner"},token:{stringValue:"a".repeat(30)},lang:{stringValue:"sv"},expiresAt:{timestampValue:new Date(Date.now()+100000).toISOString()}}};
  const api=load("../lib/push-server.ts",{"node:crypto":crypto,"@/lib/server-config":{serverConfig:()=>"project"},"@/lib/firebase-server":{serviceToken:async()=>"access",getFirestoreDocument:async()=>live,firestoreDocumentName:p=>p,commitFirestoreWrites:async w=>writes.push(...w)}});
  process.env.CIRCLE_PUSH_ENABLED="true";
  globalThis.fetch=async(url,options)=>{
    if(url.includes(":runQuery")) {
      assert.equal(JSON.parse(options.body).structuredQuery.where.fieldFilter.value.stringValue,"owner");
      return Response.json([{document:live},{document:{...live,fields:{...live.fields,expiresAt:{timestampValue:"2020-01-01T00:00:00Z"}}}}]);
    }
    sent.push(JSON.parse(options.body));
    return Response.json({error:{details:[{errorCode:"UNREGISTERED"}]}},{status:404});
  };
  try {
    await api.sendCirclePush("owner","message","ticket");
    assert.equal(sent.length,1);assert.match(sent[0].message.data.body,/meddelande/);
    assert.equal(writes.length,1);assert.deepEqual(writes[0].currentDocument,{updateTime:"version1"});
    globalThis.fetch=async()=>{throw Error("offline");};
    await assert.doesNotReject(()=>api.sendCirclePush("owner","message","ticket"));
    process.env.CIRCLE_PUSH_ENABLED="false";await api.sendCirclePush("owner","message","ticket");
  } finally {globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.CIRCLE_PUSH_ENABLED;else process.env.CIRCLE_PUSH_ENABLED=previous;}
});
