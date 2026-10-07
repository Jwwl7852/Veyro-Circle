import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/map-wheel.ts",import.meta.url),"utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const wheelModule = {};
new Function("exports",compiled)(wheelModule);

function fixture() {
  const document = new EventTarget();
  document.defaultView = new EventTarget();
  const node = new EventTarget();
  node.ownerDocument = document;
  node.contains = target=>target===node;
  const zooms=[]; const active=[]; const options=[];
  const add = node.addEventListener.bind(node);
  node.addEventListener=(type,callback,option)=>{options.push({type,option});add(type,callback,option);};
  const cleanup=wheelModule.bindMapWheel(node,direction=>zooms.push(direction),value=>active.push(value));
  const dispatch=(target,type,props={})=>{
    const event=new Event(type,{cancelable:true});
    for (const [key,value] of Object.entries(props)) Object.defineProperty(event,key,{value});
    target.dispatchEvent(event);
    return event;
  };
  return {node,document,zooms,active,options,cleanup,dispatch};
}

test("wheel only zooms and cancels page scrolling after clicking the map",()=>{
  const f=fixture();
  assert.equal(f.options.find(entry=>entry.type==='wheel').option.passive,false);
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:-100,timeStamp:100}).defaultPrevented,false);
  assert.deepEqual(f.zooms,[]);
  f.dispatch(f.node,'pointerdown');
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:-100,timeStamp:200}).defaultPrevented,true);
  assert.deepEqual(f.zooms,[1]);
  // Rapid events must remain cancelled even while zoom changes are throttled.
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:-100,timeStamp:220}).defaultPrevented,true);
  assert.deepEqual(f.zooms,[1]);
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100,timeStamp:400}).defaultPrevented,true);
  assert.deepEqual(f.zooms,[1,-1]);
  f.cleanup();
});

test("outside click, keyboard exit and cleanup restore ordinary scrolling",()=>{
  const f=fixture();
  f.dispatch(f.node,'pointerdown');
  f.dispatch(f.document,'pointerdown');
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100}).defaultPrevented,false);
  f.dispatch(f.node,'keydown',{key:'Enter'});
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100}).defaultPrevented,true);
  f.dispatch(f.node,'keydown',{key:'Escape'});
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100}).defaultPrevented,false);
  f.dispatch(f.node,'pointerdown');
  f.dispatch(f.document,'focusin');
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100}).defaultPrevented,false);
  f.dispatch(f.node,'pointerdown');
  f.dispatch(f.document.defaultView,'blur');
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100}).defaultPrevented,false);
  f.dispatch(f.node,'pointerdown');
  f.cleanup();
  assert.equal(f.dispatch(f.node,'wheel',{deltaY:100}).defaultPrevented,false);
});
