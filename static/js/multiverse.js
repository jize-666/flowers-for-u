import * as THREE from "three";
import { CONFIG } from "./config.js";
import { trackingNow } from "./hand-tracker.js";
import { MultiverseGestures } from "./multiverse-gestures.js";
import { MultiverseModel } from "./multiverse-model.js";
import { MultiverseWorld } from "./multiverse-world.js";
import { StableFollower, appendArrivalTimeline } from "./multiverse-motion.js";

export function inheritCurves(entries){
  const roots=[],stems=[];
  for(const entry of entries){
    if(entry.kind!==0&&entry.kind!==5)continue;
    const source=entry.source,attribute=entry.geometry.attributes.position,points=[];
    const first=new THREE.Vector3().fromBufferAttribute(attribute,source[0]);
    for(let j=0;j<9;j++){
      const index=source[Math.min(source.length-1,Math.floor(j/8*(source.length-1)))];
      const p=new THREE.Vector3().fromBufferAttribute(attribute,index).sub(first);points.push(p.toArray());
    }
    (entry.kind===5?roots:stems).push(points);
    if(roots.length>=12&&stems.length>=12)break;
  }
  if(!roots.length||!stems.length)throw new Error("Multiverse requires inherited root and stem geometry");
  return {roots:roots.slice(0,12),stems:stems.slice(0,12)};
}

export class MultiverseExperience {
  constructor({scene,collapse,audio,quality,onInteractive}){
    Object.assign(this,{scene,collapse,audio,onInteractive});
    const h=CONFIG.collapse.hole;
    // This is the end of the existing void path, not a replacement camera.
    const end=[h.x-.9,h.y+.2,h.z-CONFIG.collapse.voidDepth];
    this.model=new MultiverseModel([end[0],end[1],end[2]-CONFIG.multiverse.viewDistance],quality);
    this.world=new MultiverseWorld(this.model,inheritCurves(collapse.fragments.entries));
    this.gestures=new MultiverseGestures();this.arrival={value:0};this.active=false;this.interactive=false;this.disposed=false;
    this.cameraFollow=new StableFollower(end,{...CONFIG.multiverse,positionRate:CONFIG.multiverse.cameraRate,maxGrabSpeed:CONFIG.multiverse.cameraSpeed,positionDeadband:.0001});
    this.events=new AbortController();
    document.addEventListener("visibilitychange",()=>this.lose(),{signal:this.events.signal});
  }
  async prewarm(){
    const staging=new THREE.Scene();staging.add(this.world.root);this.world.root.visible=true;
    this.model.update(.05);this.world.update(0,this.scene.camera,0,true);
    const renderer=this.scene.renderer,target=new THREE.WebGLRenderTarget(16,16),previous=renderer.getRenderTarget();
    try{
      if(renderer.compileAsync)await renderer.compileAsync(staging,this.scene.camera);else renderer.compile(staging,this.scene.camera);
      if(!this.disposed){renderer.setRenderTarget(target);renderer.render(staging,this.scene.camera);}
    }finally{renderer.setRenderTarget(previous);target.dispose();staging.remove(this.world.root);this.world.root.visible=false;if(!this.disposed)this.scene.scene.add(this.world.root);}
  }
  connectTimeline(timeline){
    appendArrivalTimeline(timeline,this.arrival,()=>this.completeArrival(),this.collapse.schedule.end);
  }
  beginArrival(){
    if(this.active||this.disposed)return;this.active=true;this.world.root.visible=true;
    this.startCamera=this.scene.camera.position.clone();
    this.arrivalCamera=new THREE.Vector3(...this.model.centers[0]).add(new THREE.Vector3(0,0,CONFIG.multiverse.viewDistance-1.5));
    this.oldMaterials=new Map();this.collapse.world.root.traverse(object=>{if(object.material){object.material.depthWrite=false;if(!object.material.isShaderMaterial)this.oldMaterials.set(object.material,object.material.opacity);}});
    try{this.audio.playTransitionCue("arrivalReveal","effects",.27);}catch(error){console.warn("Arrival audio:",error.message);}
    try{this.audio.startMultiverseAmbience();}catch(error){console.warn("Multiverse ambience:",error.message);}
  }
  completeArrival(){
    if(this.disposed||this.interactive)return;
    this.beginArrival();this.arrival.value=1;this.update(0);
    this.interactive=true;this.gestures.activate();this.cameraFollow.position=this.scene.camera.position.toArray();this.cameraFollow.target=[...this.cameraFollow.position];
    this.collapse.retireVoid();this.oldMaterials.clear();this.onInteractive();
    const hint=document.querySelector("#garden-hint");hint.style.opacity="1";hint.style.visibility="visible";
  }
  point(hand,z){
    const p=new THREE.Vector3(hand.position.x*2-1,hand.position.y*2-1,.5).unproject(this.scene.camera);
    const direction=p.sub(this.scene.camera.position).normalize();
    const distance=(z-this.scene.camera.position.z)/Math.min(-.01,direction.z);
    return this.scene.camera.position.clone().addScaledVector(direction,distance).toArray();
  }
  sample(frame,now){
    if(!this.interactive||this.disposed)return;
    const result=this.gestures.sample(frame,now);
    // If validation cancelled the gesture epoch, freeze an existing grab too.
    if(!this.gestures.primed){this.model.lose();this.anchor=null;return;}
    const action=result.action;
    if(action){
      const hand=action.hand,z=this.model.centers[this.model.cluster][2],point=hand?this.point(hand,z):null;
      if(action.type==="awaken")this.model.awaken(point);
      if(action.type==="grab"){
        const orb=this.model.grab(point);
        if(orb)this.anchor={position:[...orb.follow.position],hand:this.point(hand,orb.follow.position[2]),z:orb.follow.position[2],width:hand.width};
      }
      if(action.type==="split"){this.model.splitHeld();this.anchor=null;}
      if(action.type==="collapse"){this.model.collapseNearest(point);this.anchor=null;}
      if(action.type==="swipe"){this.model.shift(action.direction);this.shiftCamera();}
      if(action.type==="tear"){
        const midpoint={position:{x:(action.hands[0].position.x+action.hands[1].position.x)/2,y:(action.hands[0].position.y+action.hands[1].position.y)/2}};
        this.world.openTear(this.point(midpoint,this.scene.camera.position.z-6));
        this.model.tear(this.scene.camera.position.toArray());this.shiftCamera();
      }
    }
    if(result.drag&&this.anchor&&this.model.held!==null){
      const hand=result.drag,a=this.anchor,point=this.point(hand,a.z);
      const target=point.map((v,i)=>a.position[i]+v-a.hand[i]);
      target[2]=a.z+Math.max(-2,Math.min(2,Math.log(hand.width/a.width)*1.2));
      this.model.moveHeld(target,hand.rotation);
    }
  }
  shiftCamera(){
    const c=this.model.centers[this.model.cluster];this.cameraFollow.setTarget([c[0],c[1],c[2]+CONFIG.multiverse.viewDistance-1.5]);
    this.model.lose();this.anchor=null;
  }
  lose(){this.gestures.lose();this.model.lose();this.anchor=null;}
  update(dt){
    if(!this.active||this.disposed||document.hidden)return;
    this.gestures.tick(trackingNow());if(!this.gestures.primed&&this.interactive){this.model.lose();this.anchor=null;}
    if(!this.interactive){
      this.scene.camera.position.copy(this.startCamera).lerp(this.arrivalCamera,this.arrival.value);
      this.collapse.animateHandoff(dt);
      this.collapse.uniforms.uArrivalFade.value=1-this.arrival.value;
      this.oldMaterials.forEach((opacity,material)=>{material.opacity=opacity*(1-this.arrival.value);});
    }else this.scene.camera.position.fromArray(this.cameraFollow.update(dt));
    this.model.update(dt);this.world.update(dt,this.scene.camera,this.arrival.value);
  }
  setQuality(name){this.model.setQuality(name);}
  snapshot(){return {active:this.active,interactive:this.interactive,arrival:this.arrival.value,gesturePrimed:this.gestures.primed,trackingFresh:this.gestures.last!==null&&trackingNow()-this.gestures.last<=CONFIG.handTracking.staleMs,instanceCapacity:this.world.capacity,...this.model.snapshot()};}
  dispose(){if(this.disposed)return;this.disposed=true;this.events.abort();this.gestures.enabled=false;this.world.dispose();this.oldMaterials?.clear();this.model.orbs=[];}
}
