import test from "node:test";
import assert from "node:assert/strict";
import { MultiverseGestures } from "../static/js/multiverse-gestures.js";

const hand=(pose="OPEN_PALM",extra={})=>({id:1,pose,position:{x:.5,y:.5},width:.2,pinch:.8,rotation:[0,0,0,1],...extra});
function fixture(){
  const gestures=new MultiverseGestures();gestures.activate();const actions=[];
  const sample=(timestamp,hands=[hand()],now=timestamp)=>{const result=gestures.sample({hands,timestamp},now);if(result.action)actions.push(result.action.type);return result;};
  const fist=(start,duration)=>{for(let t=start;t<=start+duration;t+=40)sample(t,[hand("FIST",{pinch:.2})]);};
  return {gestures,actions,sample,fist};
}
test("A12: handoff discards garden fist; fresh open palm awakens once",()=>{
  const f=fixture();f.fist(0,2000);assert.deepEqual(f.actions,[]);
  f.sample(2040);f.sample(2080);assert.deepEqual(f.actions,["awaken"]);
  f.fist(2120,1000);assert.deepEqual(f.actions,["awaken","collapse"]);
});
test("A13: no additional palm arming gate for a new pinch or fist after a neutral baseline",()=>{
  const f=fixture();f.sample(0,[hand("UNKNOWN")]);
  assert.equal(f.sample(40,[hand("UNKNOWN",{pinch:.3})]).action.type,"grab");
  f.sample(80,[hand("UNKNOWN",{pinch:.6})]);f.fist(120,1000);
  assert.deepEqual(f.actions,["grab","split","collapse"]);
});
test("A13/A14: pinch hysteresis and release produce exactly one split, never awaken/swipe too",()=>{
  const f=fixture();f.sample(0);
  assert.equal(f.sample(40,[hand("UNKNOWN",{pinch:.35})]).action,null);
  assert.equal(f.sample(80,[hand("UNKNOWN",{pinch:.349})]).action.type,"grab");
  for(const [t,pinch] of [[120,.38],[160,.49],[200,.5]]){
    const result=f.sample(t,[hand("UNKNOWN",{pinch})]);assert.equal(result.action,null);assert.ok(result.drag);
  }
  const release=f.sample(240,[hand("OPEN_PALM",{pinch:.501,position:{x:.8,y:.5}})]);
  assert.equal(release.action.type,"split");assert.equal(release.drag,null);
  f.sample(280);assert.equal(f.actions.filter(x=>x==="split").length,1);
});
test("A13: held fist needs exactly 1000ms and fires once until released",()=>{
  const f=fixture();f.sample(0);f.fist(40,960);
  assert.equal(f.sample(1039,[hand("FIST")]).action,null);
  assert.equal(f.sample(1040,[hand("FIST")]).action.type,"collapse");
  f.fist(1080,1000);assert.equal(f.actions.filter(x=>x==="collapse").length,1);
});
test("A13: 24/30/60Hz and irregular sampling all measure elapsed fist duration",()=>{
  for(const step of [1000/24,1000/30,1000/60,71]){
    const f=fixture();f.sample(0);
    for(let t=40;t<1040;t+=step)assert.equal(f.sample(t,[hand("FIST")]).action,null);
    assert.equal(f.sample(1040,[hand("FIST")]).action.type,"collapse");
  }
});
test("A13: interrupted fist cancels its whole hold and never splits an earlier grab",()=>{
  const f=fixture();f.sample(0);f.sample(40,[hand("UNKNOWN",{pinch:.2})]);
  f.fist(80,800);f.sample(920,[hand("UNKNOWN")]);f.fist(960,800);
  assert.deepEqual(f.actions,["awaken","grab"]);
  f.sample(1920,[hand("FIST")]); // 160ms gap cannot complete that hold.
  assert.deepEqual(f.actions,["awaken","grab"]);
});
test("A13/A14: loss, empty hands, stale result and watchdog never synthesize actions",()=>{
  for(const loss of [f=>f.gestures.lose(),f=>f.sample(80,[]),f=>f.sample(80,[hand()],201),f=>f.gestures.tick(161)]){
    const f=fixture();f.sample(0);f.sample(40,[hand("UNKNOWN",{pinch:.2})]);loss(f);
    assert.deepEqual(f.actions,["awaken","grab"]);
    f.sample(240);assert.ok(!f.actions.includes("split")&&!f.actions.includes("collapse")&&!f.actions.includes("swipe"));
  }
});
test("A14: duplicate/out-of-order frames cannot add time; future/NaN frames invalidate",()=>{
  const f=fixture();f.sample(0);f.fist(40,800);
  for(let i=0;i<50;i++)f.sample(840,[hand("FIST")],850);
  f.sample(800,[hand("FIST")],850);assert.ok(!f.actions.includes("collapse"));
  f.sample(1000,[hand("FIST")],900);assert.equal(f.gestures.primed,false);
  f.sample(NaN);assert.equal(f.gestures.primed,false);
});
test("A14: continuous swipe >1.2 widths/sec for 150ms, direction and cooldown",()=>{
  for(const direction of [-1,1]){
    const f=fixture();f.sample(0);
    for(let t=50;t<=100;t+=50)assert.equal(f.sample(t,[hand("OPEN_PALM",{position:{x:.5+direction*.0004*t,y:.5}})]).action,null);
    const action=f.sample(150,[hand("OPEN_PALM",{position:{x:.5+direction*.06,y:.5}})]).action;
    assert.equal(action.type,"swipe");assert.equal(action.direction,direction);
    for(let t=200;t<=800;t+=50)f.sample(t,[hand("OPEN_PALM",{position:{x:.5+direction*.0004*t,y:.5}})]);
    assert.equal(f.actions.filter(x=>x==="swipe").length,1);
    for(let t=850;t<=1000;t+=50)f.sample(t,[hand("OPEN_PALM",{position:{x:.5+direction*.0004*t,y:.5}})]);
    assert.equal(f.actions.filter(x=>x==="swipe").length,2);
  }
});
test("A14: slow motion, short burst, direction reversal or pinched movement cannot swipe",()=>{
  const f=fixture();f.sample(0);
  for(let t=40;t<=400;t+=40)f.sample(t,[hand("OPEN_PALM",{position:{x:.5+t*.0001,y:.5}})]);
  f.sample(440,[hand("OPEN_PALM",{position:{x:.65,y:.5}})]);f.sample(480,[hand("OPEN_PALM",{position:{x:.55,y:.5}})]);
  f.sample(520,[hand("UNKNOWN",{pinch:.2})]);
  for(let t=560;t<=960;t+=40)f.sample(t,[hand("UNKNOWN",{pinch:.3,position:{x:.5+(t-520)*.002,y:.5}})]);
  assert.ok(!f.actions.includes("swipe"));
});
const pair=d=>[hand("OPEN_PALM",{position:{x:.5-d/2,y:.5}}),hand("OPEN_PALM",{id:2,position:{x:.5+d/2,y:.5}})];
test("A14: two valid hands separate >35% within 500ms; one tear, no other action",()=>{
  const f=fixture();f.sample(0,pair(.2));
  for(let t=100;t<=400;t+=100)assert.equal(f.sample(t,pair(.2)).action,null);
  assert.equal(f.sample(500,pair(.272)).action.type,"tear");
  f.sample(540,pair(.4));f.sample(580,pair(.5));assert.deepEqual(f.actions,["tear"]);
});
test("A14: tear rejects late growth, lost second hand, changed identity and malformed data",()=>{
  const f=fixture();f.sample(0,pair(.2));
  for(let t=100;t<=500;t+=100)f.sample(t,pair(.2));
  assert.equal(f.sample(501,pair(.4)).action,null);
  f.sample(540,[]);f.sample(580,pair(.6));assert.ok(!f.actions.includes("tear"));
  const changed=pair(.9);changed[1].id=3;assert.equal(f.sample(620,changed).action,null);
  for(const hands of [[hand("FIST",{rotation:[NaN,0,0,1]})],[hand(),hand()],pair(.2).map(h=>({...h,width:0}))]){
    assert.equal(f.sample(660,hands).action,null);assert.equal(f.gestures.primed,false);
  }
});
test("A13: new hand identity cannot inherit a hold or trigger release",()=>{
  const f=fixture();f.sample(0);f.fist(40,800);
  f.sample(880,[hand("FIST",{id:2})]);assert.equal(f.gestures.primed,false);
  f.fist(920,1040);assert.ok(!f.actions.includes("collapse"));
});
