import test from "node:test";
import assert from "node:assert/strict";
import { MultiverseModel } from "../static/js/multiverse-model.js";
import { StableFollower,smoothRotation } from "../static/js/multiverse-motion.js";
import { handFeatures } from "../static/js/hand-features.js";
import { CONFIG,FLOWERS } from "../static/js/config.js";

const advance=(model,seconds)=>{for(let t=0;t<seconds;t+=1/60)model.update(1/60);};
test("A12: High/Medium/Gentle have 10/8/7 dormant universes across exactly three clusters",()=>{
  for(const [quality,count] of [["high",10],["medium",8],["low",7]]){
    const model=new MultiverseModel([0,0,-70],quality),s=model.snapshot();
    assert.equal(s.baseUniverses,count);assert.equal(s.orbs.length,count);
    assert.equal(new Set(s.orbs.map(o=>o.cluster)).size,3);
    assert.ok(s.orbs.every(o=>!o.awake&&FLOWERS.some(f=>f.id===o.sourceFlower)));
  }
});
test("A13: nearest orb awakens; grab/release branches into 2–3 adjacent possibilities",()=>{
  const model=new MultiverseModel([0,0,-70]);
  for(const id of [0,1]){
    const orb=model.orbs[id];assert.equal(model.awaken(orb.base).id,id);assert.equal(orb.awake,true);
    assert.equal(model.grab(orb.base).id,id);assert.equal(model.splitHeld(),true);
    assert.equal(model.held,null);assert.equal(orb.children.length,2+id);
    advance(model,2);assert.equal(orb.split,1);
    const child=model.orbs[orb.children[1]],p=child.follow.position;assert.ok(Math.hypot(...p.map((v,i)=>v-orb.follow.position[i]))<orb.radius*3);
    assert.equal(child.lineage,orb.lineage);assert.equal(child.sourceFlower,orb.sourceFlower);
  }
});
test("A13: each child can be grabbed and split again; no silent no-op on repeated splitting",()=>{
  const model=new MultiverseModel([0,0,-70]),orb=model.orbs[0];
  let selected=orb;
  for(let i=0;i<12;i++){
    assert.equal(model.grab(selected.follow.position).id,selected.id);
    const before=model.orbs.length;assert.equal(model.splitHeld(),true);advance(model,2);
    assert.ok(model.orbs.length>=before+2);assert.ok(selected.children.length>=2&&selected.children.length<=3);
    selected=model.orbs[selected.children[0]];
  }
  assert.ok(model.orbs.length>32);assert.equal(selected.sourceFlower,orb.sourceFlower);
});
test("A13: held universe collapses preferentially and remains a retained singularity",()=>{
  const model=new MultiverseModel([0,0,-70]),orb=model.orbs[0];model.grab(orb.base);
  model.collapseNearest(model.orbs[8].base);assert.equal(orb.collapsing,true);assert.equal(model.orbs[8].collapsing,false);
  advance(model,3);assert.equal(orb.collapse,1);assert.equal(model.orbs.length,10);
  assert.equal(model.visibleLineages.has(0),true);assert.notEqual(model.nearest(orb.base)?.id,0);
});
test("A13: loss freezes grabbed orb and rotation while independent world time continues",()=>{
  const model=new MultiverseModel([0,0,-70]),orb=model.orbs[0];model.grab(orb.base);
  model.moveHeld([12,4,-68],[0,1,0,0]);advance(model,.2);model.lose();
  const position=[...orb.follow.position],rotation=[...orb.rotation],time=model.time;
  advance(model,3);assert.deepEqual(orb.follow.position,position);assert.deepEqual(orb.rotation,rotation);
  assert.equal(orb.children.length,0);assert.equal(orb.collapse,0);assert.ok(model.time>time+2.9);
});
test("A13: quality switch preserves held universe; all clusters stay represented",()=>{
  const model=new MultiverseModel([0,0,-70]);model.grab(model.orbs[9].base);model.setQuality("low");
  assert.equal(model.visibleLineages.size,7);assert.ok(model.visibleLineages.has(9));
  assert.equal(new Set([...model.visibleLineages].map(i=>model.orbs[i].cluster)).size,3);
});
test("A13: swipe cycles three clusters; tear selects farther existing region",()=>{
  const model=new MultiverseModel([0,0,-70]);
  assert.equal(model.shift(-1),2);assert.equal(model.shift(1),0);assert.equal(model.shift(1),1);
  const camera=[...model.centers[1]];camera[2]+=14;
  assert.equal(model.tear(camera),2);assert.equal(model.centers.length,3);
});
test("A14 numerical: sub-deadband stationary jitter gives exactly unchanged position",()=>{
  const follow=new StableFollower([0,0,0]);
  for(let i=0;i<600;i++){follow.setTarget([Math.sin(i)*.01,Math.cos(i)*.01,0]);follow.update(1/60);}
  assert.deepEqual(follow.position,[0,0,0]);
});
test("A14 numerical: hand jump and long render gap are bounded by velocity, not teleport",()=>{
  for(const dt of [1/144,1/60,1/30,.3]){
    const follow=new StableFollower([0,0,0]);follow.setTarget([100,-30,-45]);
    for(let i=0;i<100;i++){const before=[...follow.position];follow.update(dt);const step=Math.hypot(...follow.position.map((v,j)=>v-before[j]));assert.ok(step<=CONFIG.multiverse.maxGrabSpeed*Math.min(dt,.05)+1e-10);}
  }
});
test("A14 numerical: palm quaternion jitter/hemisphere flips stay stable; turn speed bounded",()=>{
  const q=[0,0,0,1];assert.deepEqual(smoothRotation(q,[0,0,0,-1],1/60),q);
  assert.deepEqual(smoothRotation(q,[0,Math.sin(.005),0,Math.cos(.005)],1/60),q);
  const next=smoothRotation(q,[0,1,0,0],1/60);
  assert.ok(Math.abs(Math.hypot(...next)-1)<1e-12);
  assert.ok(2*Math.acos(next[3])<=CONFIG.multiverse.maxAngularSpeed/60+1e-10);
});
test("A14: hand features use palm-relative pinch, mirrored position and normalized 3D rotation",()=>{
  const points=Array.from({length:21},()=>({x:.5,y:.8,z:0}));
  points[5]={x:.4,y:.5,z:0};points[9]={x:.5,y:.48,z:0};points[13]={x:.56,y:.51,z:0};points[17]={x:.62,y:.54,z:0};
  points[4]={x:.44,y:.38,z:.02};points[8]={x:.46,y:.38,z:.02};
  const a=handFeatures(points,7);assert.equal(a.id,7);assert.ok(Math.abs(Math.hypot(...a.rotation)-1)<1e-12);
  const b=handFeatures(points.map(p=>({x:p.x*2,y:p.y*2,z:p.z*2})),7);
  assert.ok(Math.abs(a.pinch-b.pinch)<1e-12);assert.ok(a.pinch<.35);
  assert.equal(handFeatures(points.map(p=>({...p,z:NaN})),7),null);
  assert.equal(handFeatures(Array(21).fill({x:0,y:0,z:0}),7),null);
});
