import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createCollapseTimeline, collapseSchedule } from "../static/js/collapse-core.js";
import { appendArrivalTimeline } from "../static/js/multiverse-motion.js";
import { ExperienceState } from "../static/js/experience-state.js";
const require=createRequire(import.meta.url);
let gsap;
try { gsap=require(process.env.GSAP_TEST_PATH||"gsap/dist/gsap.js").gsap; }
catch {
  try { gsap=require("../static/vendor/gsap/gsap.min.js").gsap; }
  catch { /* Report a real dependency gate, never fake GSAP. */ }
}
test("A7/A11: real GSAP executes one clock, fracture then disposal/void then handoff",{skip:!gsap?"GSAP package not installed":false},()=>{
  assert.equal(gsap.version,"3.13.0");
  const events=[],clock={time:0},s=collapseSchedule();
  const timeline=createCollapseTimeline(gsap,{clock,onCue:name=>events.push(name),onDestruction:()=>events.push("fracture"),onVoid:()=>events.push("dispose-and-void"),onEnd:()=>events.push("handoff")});
  assert.equal(timeline.duration(),s.end);
  timeline.totalTime(13.49,false);assert.ok(!events.includes("fracture"));
  timeline.totalTime(13.51,false);assert.equal(events.filter(e=>e==="fracture").length,1);
  timeline.totalTime(29.49,false);assert.ok(!events.includes("dispose-and-void"));
  timeline.totalTime(29.51,false);assert.equal(events.filter(e=>e==="dispose-and-void").length,1);
  timeline.totalTime(s.end,false);assert.equal(clock.time,s.end);
  assert.deepEqual(events,["tension","dimensionSlash","gravityBed","energyRelease","fracture","materialFailure","finalPull","dispose-and-void","voidFall","handoff"]);
  timeline.kill();gsap.ticker.sleep();
});
test("A4/A12: same real GSAP timeline enters arrival at 34.5s and interaction at 38.5s once",{skip:!gsap?"GSAP package not installed":false},()=>{
  const scene=new ExperienceState(),clock={time:0},arrival={value:0},events=[];
  scene.commit();
  const timeline=createCollapseTimeline(gsap,{clock,onCue:()=>{},onDestruction:()=>{},onVoid:()=>scene.advance("void_fall"),onEnd:()=>{scene.advance("multiverse_arrival");events.push("arrival");}});
  appendArrivalTimeline(timeline,arrival,()=>{scene.advance("multiverse_interaction");events.push("interaction");},collapseSchedule().end);
  assert.equal(timeline.duration(),38.5);
  timeline.totalTime(34.49,false);assert.equal(scene.state,"void_fall");
  timeline.totalTime(34.5,false);assert.equal(scene.state,"multiverse_arrival");assert.equal(arrival.value,0);
  timeline.totalTime(36.5,false);assert.ok(Math.abs(arrival.value-.5)<1e-6);assert.equal(scene.state,"multiverse_arrival");
  timeline.totalTime(38.5,false);assert.equal(scene.state,"multiverse_interaction");assert.equal(arrival.value,1);
  timeline.totalTime(100,false);assert.deepEqual(events,["arrival","interaction"]);assert.equal(scene.commits,1);
  timeline.kill();gsap.ticker.sleep();
});
