import { CONFIG } from "./config.js";
export function appendArrivalTimeline(timeline,arrival,onComplete,at){
  timeline.to(arrival,{value:1,duration:CONFIG.multiverse.arrival,ease:"sine.inOut"},at);
  timeline.call(onComplete,[],at+CONFIG.multiverse.arrival);
}
export class StableFollower {
  constructor(position,settings=CONFIG.multiverse){this.position=[...position];this.target=[...position];this.settings=settings;}
  setTarget(value){if(value.length!==3||!value.every(Number.isFinite))return;const d=Math.hypot(...value.map((v,i)=>v-this.target[i]));if(d>this.settings.positionDeadband)this.target=[...value];}
  freeze(){this.target=[...this.position];}
  update(dt){
    dt=Math.max(0,Math.min(dt,.05));const d=this.target.map((v,i)=>v-this.position[i]),length=Math.hypot(...d);
    const alpha=1-Math.exp(-this.settings.positionRate*dt),step=Math.min(length*alpha,this.settings.maxGrabSpeed*dt);
    if(length>1e-9)this.position=this.position.map((v,i)=>v+d[i]/length*step);
    return this.position;
  }
}
export function smoothRotation(current,target,dt,settings=CONFIG.multiverse){
  let dot=current.reduce((n,v,i)=>n+v*target[i],0),q=[...target];if(dot<0){q=q.map(v=>-v);dot=-dot;}
  dot=Math.max(-1,Math.min(1,dot));const angle=2*Math.acos(dot);
  if(angle<settings.rotationDeadband)return [...current];
  const alpha=Math.min(1-Math.exp(-settings.rotationRate*Math.min(dt,.05)),settings.maxAngularSpeed*Math.min(dt,.05)/angle);
  const half=Math.acos(dot),sin=Math.sin(half);
  const a=sin<1e-5?1-alpha:Math.sin((1-alpha)*half)/sin,b=sin<1e-5?alpha:Math.sin(alpha*half)/sin;
  const result=current.map((v,i)=>v*a+q[i]*b),length=Math.hypot(...result);
  return result.map(v=>v/length);
}
