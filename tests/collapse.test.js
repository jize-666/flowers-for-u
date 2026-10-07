import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, QUALITY } from "../static/js/config.js";
import { collapseSchedule, beatsAt, cameraPath, FrameTimeRecorder } from "../static/js/collapse-core.js";
import { bakeFlowerVertex, partitionFlower } from "../static/js/fracture-data.js";
import { readFileSync } from "node:fs";

test("A7: exact default overlap, five-second expansion and 34.5s through void",()=>{
  assert.deepEqual(collapseSchedule(),{slashStart:2.5,sphereStart:6.5,expansionStart:11.5,blackHoleEnd:16.5,destructionStart:13.5,pullStart:23.5,voidStart:29.5,end:34.5});
  const c={...CONFIG.collapse,freeze:3,slash:5,blackHole:12,rapidExpansion:5,destruction:10,finalPull:7};
  assert.equal(collapseSchedule(c).end,39);
  assert.throws(()=>collapseSchedule({...c,destructionOverlap:13}));
  assert.throws(()=>collapseSchedule({...c,voidFall:NaN}));
});
test("A7: each beat starts at zero without an early collapse or early destruction",()=>{
  const s=collapseSchedule();
  for(const [at,property] of [[s.slashStart,"slash"],[s.sphereStart,"sphere"],[s.expansionStart,"expansion"],[s.destructionStart,"destruction"],[s.pullStart,"pull"],[s.voidStart,"void"]]){
    assert.equal(beatsAt(at)[property],0);assert.equal(beatsAt(at-0.001)[property],0);assert.ok(beatsAt(at+0.01)[property]>0);
  }
  assert.equal(beatsAt(s.blackHoleEnd).expansion,1);
  assert.equal(beatsAt(s.pullStart).destruction,1);
});
test("A7-A11: camera path is position/velocity continuous across void boundary and never teleports",()=>{
  const s=collapseSchedule(), start={x:0,y:3.6,z:13.7},h=CONFIG.collapse.hole,e=1e-4;
  const a=cameraPath(s.voidStart-e,start),b=cameraPath(s.voidStart,start),c=cameraPath(s.voidStart+e,start);
  assert.ok(Math.abs(b.z-(h.z-.35))<1e-9);
  for(const axis of ["x","y","z"]){assert.ok(Math.abs((b[axis]-a[axis])/e-(c[axis]-b[axis])/e)<.002);}
  assert.deepEqual(cameraPath(0,start),start);
  let prev=cameraPath(s.pullStart,start);
  for(let t=s.pullStart+1/240;t<=s.end;t+=1/240){
    const p=cameraPath(t,start);assert.ok(Object.values(p).every(Number.isFinite));
    assert.ok(p.z<=prev.z+1e-8);
    assert.ok(Math.hypot(p.x-prev.x,p.y-prev.y,p.z-prev.z)<.1);
    prev=p;
  }
  assert.equal(cameraPath(s.end,start).z,h.z-CONFIG.collapse.voidDepth);
});
test("A8: palette is fixed and quality changes reduce only secondary counts",()=>{
  assert.equal(CONFIG.collapse.background,"#23212C");
  for(const key of ["dust","distantDebris","fog","secondaryArcs"]){assert.ok(QUALITY.high.collapse[key]>=QUALITY.medium.collapse[key]);assert.ok(QUALITY.medium.collapse[key]>=QUALITY.low.collapse[key]);}
  assert.equal(CONFIG.collapse.hole.radius,3.1);
});
test("A10: CPU freeze bake preserves grown GLB positions and authored closed morph",()=>{
  assert.deepEqual(bakeFlowerVertex([.3,2,.1],[0,1,0],[0,2,0],0,3,1,1,1),[.3,2,.1]);
  assert.deepEqual(bakeFlowerVertex([.3,2,.1],[0,1,0],[0,2,0],2,3,1,1,1),[.3,2,.1]);
  assert.deepEqual(bakeFlowerVertex([.3,2,.1],[0,1,0],[0,2,0],2,3,1,1,0),[0,1,0]);
  for(const stem of [0,.1,.5,1])assert.ok(bakeFlowerVertex([.3,2,.1],[0,1,0],[0,2,0],2,3,stem,.5,.5).every(Number.isFinite));
});
function glb(path){
  const raw=readFileSync(path),jsonLength=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonLength)),bin=raw.subarray(28+jsonLength);
  const accessor=id=>{const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type],size={5125:4,5123:2,5126:4}[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),values=[];for(let i=0;i<a.count*n;i++)values.push(a.componentType===5126?bin.readFloatLE(offset+i*size):a.componentType===5123?bin.readUInt16LE(offset+i*size):bin.readUInt32LE(offset+i*size));return values;};
  return {doc,accessor};
}
test("A10: real bundled GLB triangles retain provenance and split into structural fragments without loss",()=>{
  for(const filename of ["flower.glb","hero-flower.glb","tulip.glb"]){
    const {doc,accessor}=glb(new URL(`../static/models/${filename}`,import.meta.url));
    const kinds=new Set();let triangles=0;
    for(const node of doc.nodes.filter(n=>n.mesh!==undefined)){
      const primitive=doc.meshes[node.mesh].primitives[0];
      const positions=accessor(primitive.attributes.POSITION),indices=accessor(primitive.indices),part=node.extras.part,pivots=Array.from({length:positions.length/3},()=>node.extras.pivot).flat();
      const groups=partitionFlower({positions,indices,parts:Array(positions.length/3).fill(part),pivots,height:doc.nodes[0].extras.height});
      assert.equal(groups.reduce((n,g)=>n+g.indices.length,0),indices.length);
      for(const group of groups){kinds.add(group.kind);for(const i of group.indices)assert.ok(group.source[i]>=0&&group.source[i]<positions.length/3);}
      triangles+=indices.length/3;
    }
    assert.deepEqual([...kinds].sort(),[0,1,2,3]);assert.ok(triangles>1000);
  }
});
test("A16: metric windows exclude intro/final pull/hidden frames and preserve actual intervals",()=>{
  const m=new FrameTimeRecorder();assert.equal(m.report().voidFall.status,"belum terukur");
  for(const t of [0,12,25,35])m.record(t,17);
  m.record(14,16);m.record(15,24);m.record(30,20);m.record(31,999,false);
  const r=m.report({quality:"high"});assert.equal(r.peakCollapse.frames,2);assert.equal(r.peakCollapse.meanMs,20);assert.equal(r.voidFall.frames,1);assert.equal(r.voidFall.maxMs,20);
});
