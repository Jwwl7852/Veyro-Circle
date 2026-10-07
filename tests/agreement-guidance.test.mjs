import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(file,deps={}) {
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function("require","exports",code)(name=>deps[name],exports);return exports;
}
const policy=load("../lib/agreement-workflow.ts");
const {agreementGuidance:guide}=load("../lib/agreement-guidance.ts",{"./agreement-workflow":policy});
const a={id:"ticket",borrowerUid:"borrower",lenderUid:"lender",from:"2026-10-08",to:"2026-10-09",requestStatus:"requested"};
const names={borrower:"Jørn",lender:"Mikkel"};
test("guidance distinguishes owner approval from borrower waiting",()=>{
  assert.match(guide(a,"lender","da",names).title,/Du skal svare/);
  assert.match(guide(a,"borrower","da",names).title,/Afventer svar fra Mikkel/);
  assert.equal(guide(a,"borrower","da",names).current,0);
});
test("handover guidance names missing signer and explains the locked note",()=>{
  const loan={...a,requestStatus:"accepted",borrowerSignature:{}};
  const borrower=guide(loan,"borrower","da",names);
  assert.match(borrower.title,/Mikkels underskrift/);assert.match(borrower.detail,/låst/);assert.equal(borrower.target,null);
  assert.equal(guide(loan,"lender","da",names).target,"handover");
  assert.equal(guide({...loan,lenderSignature:{}},"lender","da",names).current,2);
});
test("return guidance waits for the other person and completes only after both sign",()=>{
  const loan={...a,borrowerSignature:{},lenderSignature:{},borrowerReturnSignature:{}};
  assert.equal(guide(loan,"borrower","da",names).current,3);
  assert.match(guide(loan,"borrower","da",names).title,/Mikkels returunderskrift/);
  assert.equal(guide(loan,"lender","da",names).target,"return");
  const done=guide({...loan,lenderReturnSignature:{}},"borrower","sv",names);
  assert.equal(done.complete,true);assert.equal(done.target,null);assert.match(done.title,/avslutad/);
});
test("unlinked legacy agreements are explained without labelling all of them as demos",()=>{
  for(const lenderUid of [undefined,"borrower"]) {
    const info=guide({...a,lenderUid,borrowerSignature:{}},"borrower","da",names);
    assert.equal(info.connected,false);assert.equal(info.target,null);assert.equal(info.current,-1);
    assert.match(info.detail,/Det kan være en gammel prøveaftale/);
  }
});
test("declined, cancelled and unauthorized views never ask the viewer to sign",()=>{
  for(const requestStatus of ["declined","cancelled"]) {
    const info=guide({...a,requestStatus},"borrower","sv",names);
    assert.equal(info.stopped,true);assert.equal(info.target,null);assert.match(info.detail,/arkivet/);
  }
  assert.equal(guide({...a,requestStatus:"accepted"},"stranger","da",names).target,null);
});
