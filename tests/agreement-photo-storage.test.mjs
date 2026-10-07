import test,{afterEach} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const fetchOriginal=globalThis.fetch;
afterEach(()=>{globalThis.fetch=fetchOriginal;});
function storage() {
  const code=ts.transpileModule(readFileSync(new URL("../lib/agreement-photo-storage.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const result={};const scopes=[];
  new Function("require","exports",code)(name=>{
    if(name==="@/lib/firebase-server")return {serviceToken:async scope=>{scopes.push(scope);return "server-only-token";}};
    if(name==="@/lib/server-config")return {serverConfig:()=>"test-bucket"};
    throw new Error(name);
  },result);
  return {...result,scopes};
}
test("evidence upload uses immutable private metadata and narrowly scoped server credentials",async()=>{
  const s=storage();let body="";
  globalThis.fetch=async(url,init)=>{
    assert.equal(new URL(url).searchParams.get("ifGenerationMatch"),"0");
    assert.equal(new URL(url).searchParams.get("uploadType"),"multipart");
    assert.equal(init.headers.authorization,"Bearer server-only-token");
    body=await init.body.text();return Response.json({});
  };
  await s.putAgreementPhoto(s.agreementPhotoPath("ticket","handover","photo"),new Uint8Array([1,2,3]));
  assert.deepEqual(s.scopes,["storage"]);
  assert.match(body,/agreement-evidence\/ticket\/handover\/photo\.jpg/);
  assert.match(body,/private, no-store, max-age=0/);
  assert.doesNotMatch(body,/firebaseStorageDownloadTokens|publicRead|signedUrl/);
});
test("permission failure is explicit and storage read/delete never create public URLs",async()=>{
  const s=storage();globalThis.fetch=async()=>new Response(null,{status:403});
  await assert.rejects(()=>s.putAgreementPhoto("private",new Uint8Array([1])),/PHOTO_STORAGE_ACCESS/);
  await assert.rejects(()=>s.readAgreementPhoto("private"),/PHOTO_STORAGE_ACCESS/);
  await assert.rejects(()=>s.deleteAgreementPhoto("private"),/PHOTO_STORAGE_ACCESS/);
  globalThis.fetch=async(url,init)=>{
    assert.equal(init.headers.authorization,"Bearer server-only-token");
    assert.doesNotMatch(url,/token=|signature=/i);
    if(init.method!=="DELETE")assert.equal(init.cache,"no-store");
    return new Response(null,{status:404});
  };
  assert.equal(await s.readAgreementPhoto("private"),null);
  await s.deleteAgreementPhoto("private");
});
test("direct client evidence access is denied and auth token caches are separated",()=>{
  const rules=readFileSync(new URL("../storage.rules",import.meta.url),"utf8");
  assert.match(rules,/match \/agreement-evidence\/\{allPaths=\*\*\}[^}]*allow read, write: if false/);
  const server=readFileSync(new URL("../lib/firebase-server.ts",import.meta.url),"utf8");
  assert.match(server,/cachedTokens.get\(scope\)/);assert.match(server,/cachedTokens.set\(scope/);
  const worker=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
  assert.doesNotMatch(worker,/agreement-evidence|agreements\/photos/);
});
