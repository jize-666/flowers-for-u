import test from "node:test";
import assert from "node:assert/strict";
import {AudioPrewarm} from "../static/js/audio-prewarm.js";
function fixture(t,settings={}){
  const original=Object.getOwnPropertyDescriptor(globalThis,"Worker");let created=0,worker;
  class FakeWorker{
    constructor(url,options){assert.ok(String(url).endsWith("audio-prewarm-worker.js"));assert.equal(options.type,"module");created++;worker=this;this.messages=[];}
    postMessage(data){this.messages.push(data);}
    terminate(){this.terminated=true;}
    send(data){this.onmessage({data});}
  }
  Object.defineProperty(globalThis,"Worker",{value:FakeWorker,configurable:true,writable:true});
  const warm=new AudioPrewarm(settings);
  t.after(()=>{warm.dispose();if(original)Object.defineProperty(globalThis,"Worker",original);else delete globalThis.Worker;});
  return {warm,worker:()=>worker,created:()=>created};
}
test("A15: synthesis Worker serializes jobs, drops old replies and releases after prewarm",async t=>{
  const f=fixture(t),first=f.warm.generate("tension");
  await assert.rejects(f.warm.generate("voidFall"),/one audio preparation/);
  f.worker().send({id:99,wave:new ArrayBuffer(48)});assert.ok(f.warm.pending);
  const wave=new ArrayBuffer(48);f.worker().send({id:1,wave});assert.equal(await first,wave);
  const second=f.warm.generate("voidFall");assert.equal(f.created(),1);f.worker().send({id:2,wave});await second;
  f.warm.release();assert.equal(f.worker().terminated,true);assert.equal(f.warm.worker,null);
});
test("A15: synthesis errors and missing Worker fail closed without a hidden fallback",async t=>{
  const f=fixture(t);const job=f.warm.generate("tension");f.worker().send({id:1,error:"synthesis failed"});await assert.rejects(job,/synthesis failed/);
  assert.equal(f.worker().terminated,true);globalThis.Worker=undefined;await assert.rejects(f.warm.generate("tension"));
});
test("A15: cancelled/timeout preparation settles pending job and terminates Worker",async t=>{
  const f=fixture(t,{timeoutMs:5});await assert.rejects(f.warm.generate("tension"),/timeout/);
  const next=f.warm.generate("voidFall");f.warm.dispose();await assert.rejects(next,/disposed/);assert.equal(f.worker().terminated,true);
  await assert.rejects(f.warm.generate("tension"),/disposed/);
});
