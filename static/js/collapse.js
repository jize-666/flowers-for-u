import * as THREE from "three";
import { CONFIG } from "./config.js";
import { collapseSchedule, beatsAt, cameraPath, FrameTimeRecorder, smooth, clamp01, createCollapseTimeline } from "./collapse-core.js";
import { GardenFragments } from "./collapse-fragments.js";
import { CollapseWorld } from "./collapse-world.js";

/** Sole collapse clock. GSAP controls one scalar; rendering is deterministic at that time. */
export class GardenCollapse {
  constructor({ scene, garden, atmosphere, audio, gsap, quality, onState, onGardenDisposed, onHandoff }) {
    Object.assign(this,{scene,garden,atmosphere,audio,gsap,onState,onGardenDisposed,onHandoff});
    this.schedule=collapseSchedule();this.clock={time:0};this.metrics=new FrameTimeRecorder(this.schedule);
    this.active=false;this.gardenDisposed=false;this.disposed=false;this.quality=quality;this.qualityHistory=[{time:0,quality}];
    this.uniforms={uTime:{value:0},uArrivalFade:{value:1},uCameraZ:{value:CONFIG.camera.z},uBreak:{value:0},uPull:{value:0},uVoid:{value:0},uTravel:{value:0},uFreeze:{value:0},uShowGarden:{value:0},uAccretion:{value:0},uTunnel:{value:0},uHole:{value:new THREE.Vector3(CONFIG.collapse.hole.x,CONFIG.collapse.hole.y,CONFIG.collapse.hole.z)}};
    this.world=new CollapseWorld(this.uniforms,atmosphere,quality);
    this.fragments=new GardenFragments(garden,atmosphere,this.uniforms);
    this.world.root.add(this.fragments.mesh);this.world.root.visible=false;
    this.background=new THREE.Color(CONFIG.collapse.background);
    this.initialBackground=scene.scene.background.clone();
    this.initialFog=scene.scene.fog.density;this.initialExposure=scene.renderer.toneMappingExposure;
    this.initialBloom={strength:scene.bloom.strength,threshold:scene.bloom.threshold,radius:scene.bloom.radius};
    this.vignette=document.querySelector(".scene-vignette");
    this.baseVignette=getComputedStyle(this.vignette).background;
    this.events=new AbortController();
    document.addEventListener("visibilitychange",()=>{
      if(!this.active||this.disposed)return;
      if(document.hidden){this.timeline.pause();this.pausedForVisibility=true;}
      else if(this.pausedForVisibility){this.pausedForVisibility=false;this.timeline.resume();}
    },{signal:this.events.signal});
  }
  async prewarm() {
    // Offscreen preparation owns the new group; it never renders into the live garden.
    const staging=new THREE.Scene();staging.fog=this.scene.scene.fog.clone();
    staging.add(this.world.root);
    this.scene.scene.children.filter(node=>node.isLight).forEach(light=>staging.add(light.clone()));
    this.garden.flowers.forEach(flower=>staging.add(flower.root.clone(true)));
    staging.add(this.atmosphere.grass.clone(),this.atmosphere.particles.clone());
    this.world.root.visible=true;this.world.slash.visible=true;this.world.hole.visible=true;this.world.voidGroup.visible=true;
    const target=new THREE.WebGLRenderTarget(16,16);
    const renderer=this.scene.renderer, previous=renderer.getRenderTarget();
    try {
      if(renderer.compileAsync) await renderer.compileAsync(staging,this.scene.camera);
      else renderer.compile(staging,this.scene.camera);
      if(this.disposed) return;
      renderer.setRenderTarget(target);renderer.render(staging,this.scene.camera);
    } finally {
      renderer.setRenderTarget(previous);target.dispose();
      staging.remove(this.world.root);this.world.root.visible=false;
      if(!this.disposed)this.scene.scene.add(this.world.root);
    }
  }
  start() {
    if(this.active||this.disposed)return false;
    this.active=true;
    // A foreground stall must not slow GSAP alone while scheduled Web Audio continues.
    // Visibility explicitly pauses both clocks instead.
    this.gsap.ticker.lagSmoothing(0);
    this.scene.cinematic=true;this.scene.controls.enabled=false;
    this.scene.resizeBloom();
    // Rebase the pre-existing parallax rig without changing the world camera pose.
    this.scene.camera.position.add(this.scene.rig.position);this.scene.rig.position.set(0,0,0);
    this.startCamera=this.scene.camera.position.clone();this.startQuaternion=this.scene.camera.quaternion.clone();
    const view=new THREE.Matrix4().lookAt(this.startCamera,this.uniforms.uHole.value,new THREE.Vector3(0,1,0));
    this.pullQuaternion=new THREE.Quaternion().setFromRotationMatrix(view);
    this.windStart=this.garden.wind.multiplier;
    this.world.root.visible=true;this.renderAt(0);
    const s=this.schedule;
    this.safeAudio(()=>this.audio.beginCollapse());
    this.timeline=createCollapseTimeline(this.gsap, {
      clock:this.clock,ui:".hero, #garden-hint",
      onCue:(name,bus,volume)=>this.safeAudio(()=>this.audio.playTransitionCue(name,bus,volume)),
      onDestruction:()=>this.beginDestruction(),
      onVoid:()=>{this.releaseGarden();this.onState("void_fall");},
      onEnd:()=>{this.renderAt(s.end);this.handedOff=true;this.onState("multiverse_arrival");this.onHandoff?.(this.world.root);},
    });
    this.timeline.play(0);
    return true;
  }
  safeAudio(action) { try { action(); } catch(error) { console.warn("Collapse audio failed; cinematic continues:",error.message); } }
  beginDestruction() {
    if(this.swapped||this.disposed)return;
    // Snapshot AFTER wind reaches zero, before hiding original geometry.
    this.fragments.capture();
    this.garden.flowers.forEach(f=>{f.root.visible=false;});
    this.atmosphere.grass.visible=false;this.atmosphere.particles.visible=false;
    this.uniforms.uShowGarden.value=1;this.swapped=true;
  }
  releaseGarden() {
    if(this.gardenDisposed)return;
    if(!this.swapped)this.beginDestruction();
    this.gardenDisposed=true;
    this.fragments.releaseSources();
    this.garden.dispose();this.atmosphere.dispose();
    this.onGardenDisposed?.();
  }
  renderAt(time) {
    if(!this.active||this.disposed)return;
    const b=beatsAt(time),c=CONFIG.collapse,s=this.schedule,u=this.uniforms;
    u.uTime.value=time;u.uFreeze.value=b.freeze;u.uBreak.value=b.destruction;u.uPull.value=b.pull;u.uVoid.value=b.void;
    u.uTravel.value=clamp01((time-s.pullStart)/(c.finalPull+c.voidFall));
    u.uTunnel.value=smooth((time-s.pullStart-.2)/2.4);
    this.scene.scene.background.copy(this.initialBackground).lerp(this.background,b.freeze);
    this.scene.scene.fog.color.copy(this.scene.scene.background);
    this.scene.scene.fog.density=THREE.MathUtils.lerp(this.initialFog,c.fogDensity,b.freeze);
    this.scene.renderer.toneMappingExposure=THREE.MathUtils.lerp(this.initialExposure,c.exposure,b.freeze);
    this.scene.bloom.strength=THREE.MathUtils.lerp(this.initialBloom.strength,c.bloom.strength,b.freeze);
    this.scene.bloom.threshold=THREE.MathUtils.lerp(this.initialBloom.threshold,c.bloom.threshold,b.freeze);
    this.scene.bloom.radius=THREE.MathUtils.lerp(this.initialBloom.radius,c.bloom.radius,b.freeze);
    if(!this.gardenDisposed) {
      this.garden.wind.multiplier=this.windStart*(1-b.freeze);
      this.garden.flowers.forEach(f=>{f.uniforms.uHover.value=.3*b.freeze;});
    }
    const color=this.scene.scene.background.clone().convertLinearToSRGB();
    const css=`${Math.round(color.r*255)},${Math.round(color.g*255)},${Math.round(color.b*255)}`;
    this.vignette.style.setProperty("--vignette-rgb",css);
    // One path function on both sides of finalPull/voidFall; never replace the camera.
    if(time>=s.pullStart) {
      const p=cameraPath(time,this.startCamera);this.scene.camera.position.set(p.x,p.y,p.z);
    }
    const forward=new THREE.Quaternion();
    forward.setFromRotationMatrix(new THREE.Matrix4().lookAt(this.scene.camera.position,this.scene.camera.position.clone().add(new THREE.Vector3(0,0,-1)),new THREE.Vector3(0,1,0)));
    this.scene.camera.quaternion.copy(this.startQuaternion).slerp(this.pullQuaternion,smooth((time-s.sphereStart)/c.blackHole));
    this.scene.camera.quaternion.slerp(forward,smooth((time-s.pullStart)/(c.finalPull*.8)));
    u.uCameraZ.value=this.scene.camera.position.z;
    this.world.update(time,b);
  }
  update(frameMs) {
    if(!this.active||this.disposed||this.handedOff)return;
    if(document.hidden) { if(!this.timeline.paused()) {this.timeline.pause();this.pausedForVisibility=true;} return; }
    if(this.pausedForVisibility){this.pausedForVisibility=false;this.timeline.resume();}
    this.renderAt(this.clock.time);this.metrics.record(this.clock.time,frameMs,true);
  }
  setQuality(name) { if(name!==this.quality)this.qualityHistory.push({time:this.clock.time,quality:name});this.quality=name;if(!this.visualDisposed)this.world.setQuality(name); }
  snapshot() {
    return {active:this.active,time:this.clock.time,camera:this.scene.camera.position.toArray(),gardenDisposed:this.gardenDisposed,voidDisposed:Boolean(this.visualDisposed),swapped:Boolean(this.swapped),schedule:this.schedule,originalGardenRoots:this.garden.flowers.filter(f=>f.root.parent===this.scene.scene).length,grassAttached:Boolean(this.atmosphere.grass?.parent),
      frameTimes:this.metrics.report({userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,quality:this.quality,qualityHistory:this.qualityHistory,source:"requestAnimationFrame intervals",note:"CPU/GPU/device model must be recorded by the operator"})};
  }
  retireVoid() {
    if(this.visualDisposed)return;this.visualDisposed=true;
    this.scene.scene.remove(this.world.root);this.fragments.dispose();this.world.dispose();
  }
  animateHandoff(dt) {
    if(!this.handedOff||this.visualDisposed)return;
    this.uniforms.uTime.value+=dt;
    this.uniforms.uCameraZ.value=this.scene.camera.position.z;
    this.world.update(this.uniforms.uTime.value,beatsAt(this.schedule.end));
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.events.abort();this.timeline?.kill();
    this.retireVoid();
  }
}
