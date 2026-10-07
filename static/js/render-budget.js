import { CONFIG } from "./config.js";
/** Only secondary post-processing resolution changes. Native scene DPR is never adjusted here. */
export class RenderBudget {
  constructor(settings=CONFIG.performance){this.settings=settings;this.level=0;this.started=null;this.phase=null;this.changed=-Infinity;this.history=[];this.resetWindow();}
  resetWindow(){this.sum=0;this.samples=0;this.slow=0;this.fast=0;}
  observe(ms,now,phase,visible=true){
    const c=this.settings;
    if(!visible||!Number.isFinite(ms)||ms<=0||ms>250){this.resetWindow();this.windowAt=now;return null;}
    if(this.started===null){this.started=now;this.windowAt=now;}
    if(phase!==this.phase){this.phase=phase;this.phaseAt=now;this.windowAt=now;this.resetWindow();}
    if(phase==="garden_intro"||now-this.started<c.warmupMs||now-this.phaseAt<c.stateWarmupMs||now-this.changed<c.cooldownMs){this.windowAt=now;return null;}
    this.sum+=ms;this.samples++;
    if(now-this.windowAt<c.windowMs||this.samples<c.minSamples)return null;
    const mean=this.sum/this.samples;this.sum=0;this.samples=0;this.windowAt=now;
    this.slow=mean>c.downMs?this.slow+1:0;this.fast=mean<c.upMs?this.fast+1:0;
    const before=this.level;
    if(this.slow>=c.downWindows)this.level=Math.min(c.bloomScales.length-1,this.level+1);
    else if(this.fast>=c.upWindows)this.level=Math.max(0,this.level-1);
    if(this.level===before)return null;
    this.changed=now;this.resetWindow();this.history.push({now,phase,meanMs:mean,scale:this.scale});
    if(this.history.length>100)this.history.shift();return this.scale;
  }
  get scale(){return this.settings.bloomScales[this.level];}
}

/** Conservative world-sphere plane test; near-edge glow/deformation receives padding. */
export function sphereVisible(planes,position,radius,margin=CONFIG.performance.cullMargin){
  return planes.every(p=>p[0]*position[0]+p[1]*position[1]+p[2]*position[2]+p[3]>=-radius-margin);
}
