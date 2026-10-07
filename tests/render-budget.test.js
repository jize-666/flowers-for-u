import test from "node:test";
import assert from "node:assert/strict";
import { RenderBudget,sphereVisible } from "../static/js/render-budget.js";
import { PerformanceMetrics } from "../static/js/performance-metrics.js";
import { CONFIG } from "../static/js/config.js";

function trace(budget,start,duration,ms,phase="multiverse_interaction"){
  let now=start;for(;now<start+duration;now+=ms)budget.observe(ms,now,phase);return now;
}
test("A3: slow garden does not change secondary resolution through the new controller",()=>{
  const b=new RenderBudget();trace(b,0,40000,33,"garden_intro");assert.equal(b.scale,1);assert.equal(b.history.length,0);
});
test("A3: sustained pressure steps bloom down within bounds, with cooldown; stable recovery is slower",()=>{
  const b=new RenderBudget();let now=trace(b,0,60000,30);
  assert.equal(b.scale,.55);assert.equal(b.history.length,3);
  for(let i=1;i<b.history.length;i++)assert.ok(b.history[i].now-b.history[i-1].now>=CONFIG.performance.cooldownMs);
  const lowAt=now;now=trace(b,now,3000,16);assert.equal(b.scale,.55);
  trace(b,now,80000,16);assert.equal(b.scale,1);
  assert.ok(b.history[3].now-lowAt>=6000);
});
test("A3: threshold noise, isolated stalls, hidden tab and state changes do not make resolution oscillate",()=>{
  const b=new RenderBudget();let now=0;
  for(let i=0;i<2000;i++){const ms=i%2?20:22;now+=ms;b.observe(ms,now,"garden_break");}
  assert.equal(b.history.length,0);
  b.observe(900,now+=900,"garden_break");b.observe(40,now+=40,"garden_break",false);
  b.observe(33,now+=33,"void_fall");assert.equal(b.history.length,0);
  trace(b,now,800,33,"void_fall");assert.equal(b.history.length,0);
});
test("A12: conservative culling keeps on-screen spheres and edge/deformation margin",()=>{
  const box=[[1,0,0,5],[-1,0,0,5],[0,1,0,5],[0,-1,0,5],[0,0,1,5],[0,0,-1,5]];
  assert.equal(sphereVisible(box,[0,0,0],1),true);
  assert.equal(sphereVisible(box,[6.8,0,0],1),true);
  assert.equal(sphereVisible(box,[7.1,0,0],1),false);
  assert.equal(sphereVisible(box,[0,0,-8],.5),false);
  for(let x=-6;x<=6;x+=.1)assert.equal(sphereVisible(box,[x,0,0],1),true);
});
test("A16: FPS qualification requires active audio AND tracking; foreground stalls stay visible",()=>{
  const metrics=new PerformanceMetrics(),yes={audioActive:true,trackingActive:true};
  metrics.record("void_fall",20,yes);metrics.record("void_fall",500,yes);
  metrics.record("void_fall",1000,{...yes,trackingActive:false});metrics.record("void_fall",16,{...yes,audioActive:false});
  metrics.record("void_fall",1200,{...yes,visible:false});metrics.record("void_fall",NaN,yes);
  const w=metrics.report().windows.void_fall;
  assert.equal(w.frames,2);assert.equal(w.meanMs,260);assert.equal(w.maxMs,500);
  assert.equal(w.fps,1000/260);assert.equal(w.allForeground.maxMs,1000);
  assert.equal(w.allForeground.frames,4);assert.equal(w.qualifiedCoverage,.5);
  assert.equal(w.excluded,4);assert.equal(w.reasons.tracking,1);
});
test("A16: no qualified samples never reports fabricated FPS",()=>{
  const m=new PerformanceMetrics();m.record("peak_collapse",16,{audioActive:false,trackingActive:true});
  const w=m.report().windows.peak_collapse;assert.equal(w.status,"belum terukur");assert.equal(w.fps,null);assert.equal(w.frames,0);
});
