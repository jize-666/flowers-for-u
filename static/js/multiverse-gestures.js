import { CONFIG } from "./config.js";
const separation=(a,b)=>Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y);

/** One sample -> at most one discrete action. Continuous grab targets are separate data. */
export class MultiverseGestures {
  constructor(settings=CONFIG.handTracking){this.settings=settings;this.enabled=false;this.reset();}
  reset(){this.primed=false;this.previous=null;this.last=null;this.lastPose=null;this.primary=null;this.pinched=false;this.pinchBlocked=false;this.fistStart=null;this.fistLatched=false;this.swipe=null;this.swipeUntil=-Infinity;this.tear=null;}
  activate(){this.reset();this.enabled=true;}
  lose(){this.reset();} // Never synthesize a release, swipe, split or collapse on loss.
  tick(now){if(this.last!==null&&now-this.last>this.settings.staleMs)this.lose();}
  sample({hands,timestamp},now){
    const empty={action:null,drag:null};
    if(!this.enabled)return empty;
    if(!Number.isFinite(timestamp)||!Number.isFinite(now)||timestamp>now||now-timestamp>this.settings.staleMs){this.lose();return empty;}
    if(this.last!==null&&timestamp<=this.last)return empty;
    if(this.last!==null&&timestamp-this.last>this.settings.staleMs)this.lose();
    if(!Array.isArray(hands)||!hands.length||hands.length>2||new Set(hands.map(h=>h?.id)).size!==hands.length||hands.some(h=>!h||h.id==null||!h.position||![h.position.x,h.position.y,h.width,h.pinch].every(Number.isFinite)||h.width<=0||!Array.isArray(h.rotation)||h.rotation.length!==4||!h.rotation.every(Number.isFinite)||Math.abs(Math.hypot(...h.rotation)-1)>.01)){this.lose();return empty;}
    this.last=timestamp;
    // Establish a fresh baseline, not an extra arming gesture. An inherited fist
    // or pinch must first be released; open palm can awaken immediately.
    if(!this.primed){
      const hand=hands[0];
      this.primed=true;this.primary=hand.id;this.lastPose=hand.pose;
      this.previous={...hand,timestamp};
      this.fistLatched=hand.pose==="FIST";this.pinchBlocked=hand.pinch<this.settings.pinchRelease;
      if(hands.length===1)return hand.pose==="OPEN_PALM"&&hand.pinch>this.settings.pinchRelease?{action:{type:"awaken",hand},drag:null}:empty;
    }
    if(hands.length===2){
      this.pinched=false;this.fistStart=null;this.fistLatched=false;this.swipe=null;this.previous=null;this.lastPose=null;
      const ids=hands.map(h=>h.id).sort().join(":"),d=separation(...hands);
      if(!this.tear||this.tear.ids!==ids){this.tear={ids,d,time:timestamp,latched:false};return empty;}
      if(this.tear.latched){if(d<this.tear.d*1.05)this.tear={ids,d,time:timestamp,latched:false};return empty;}
      if(timestamp-this.tear.time>this.settings.tearWindowMs){this.tear={ids,d,time:timestamp,latched:false};return empty;}
      if(this.tear.d>.01&&d/this.tear.d>1+this.settings.tearIncrease){this.tear.latched=true;return {action:{type:"tear",hands},drag:null};}
      return empty;
    }
    if(this.tear){this.tear=null;this.previous=null;this.pinched=false;this.fistStart=null;this.lastPose=null;}
    const hand=hands[0],previous=this.previous;
    if(this.primary!==hand.id){this.lose();return empty;}
    const oldPose=this.lastPose;this.lastPose=hand.pose;
    this.previous={...hand,timestamp};
    if(hand.pose==="FIST"){
      this.pinched=false;this.swipe=null;
      if(this.fistLatched)return empty;
      if(this.fistStart===null)this.fistStart=timestamp;
      if(timestamp-this.fistStart>=CONFIG.collapse.holdMs){this.fistLatched=true;return {action:{type:"collapse",hand},drag:null};}
      return empty;
    }
    this.fistStart=null;this.fistLatched=false;
    if(this.pinchBlocked){if(hand.pinch>this.settings.pinchRelease)this.pinchBlocked=false;else return empty;}
    if(this.pinched){
      this.swipe=null;
      if(hand.pinch>this.settings.pinchRelease){this.pinched=false;return {action:{type:"split",hand},drag:null};}
      return {action:null,drag:hand};
    }
    if(hand.pinch<this.settings.pinchClose){this.pinched=true;this.swipe=null;return {action:{type:"grab",hand},drag:hand};}
    if(hand.pose==="OPEN_PALM"&&oldPose!=="OPEN_PALM"){this.swipe=null;return {action:{type:"awaken",hand},drag:null};}
    if(previous&&timestamp>previous.timestamp&&timestamp>=this.swipeUntil){
      const speed=(hand.position.x-previous.position.x)/((hand.width+previous.width)*.5)/((timestamp-previous.timestamp)/1000);
      const direction=Math.sign(speed);
      if(Math.abs(speed)>this.settings.swipeSpeed){
        if(!this.swipe||this.swipe.direction!==direction)this.swipe={direction,start:previous.timestamp};
        if(timestamp-this.swipe.start>=this.settings.swipeDurationMs){this.swipeUntil=timestamp+this.settings.swipeCooldownMs;this.swipe=null;return {action:{type:"swipe",direction,hand},drag:null};}
      }else this.swipe=null;
    }else this.swipe=null;
    return empty;
  }
}
