import { CONFIG, QUALITY, FLOWERS } from "./config.js";
import { StableFollower, smoothRotation } from "./multiverse-motion.js";
import { smooth, clamp01 } from "./collapse-core.js";
export class MultiverseModel {
  constructor(center,quality="high"){
    this.center=[...center];this.cluster=0;this.held=null;this.time=0;this.actions=[];
    this.centers=[[...center],[center[0]+CONFIG.multiverse.clusterSpacing,center[1]+.5,center[2]-5],[center[0]-CONFIG.multiverse.clusterSpacing,center[1]-.5,center[2]-12]];
    this.orbs=Array.from({length:QUALITY.high.universes},(_,i)=>{
      const cluster=i%3,c=this.centers[cluster],angle=i*2.399;
      const base=[c[0]+Math.cos(angle)*(2.1+(i%2)*1.4),c[1]+Math.sin(angle)*2.3,c[2]+Math.sin(i*1.7)*1.1];
      return this.makeOrb(i,i,cluster,base,.57+(i%3)*.13);
    });
    this.setQuality(quality);
  }
  makeOrb(id,lineage,cluster,base,radius){
    return {id,lineage,sourceFlower:FLOWERS[lineage].id,cluster,base:[...base],follow:new StableFollower(base),rotation:[0,0,0,1],targetRotation:[0,0,0,1],radius,
      awake:false,energy:0,children:[],birth:1,split:0,branching:false,collapse:0,collapsing:false,visibility:0};
  }
  setQuality(name){
    this.quality=name;const ids=Array.from({length:QUALITY.high.universes},(_,i)=>i);
    if(this.held!==null){const lineage=this.orbs[this.held].lineage;ids.splice(ids.indexOf(lineage),1);ids.unshift(lineage);}
    this.visibleLineages=new Set(ids.slice(0,QUALITY[name].universes));
  }
  nearest(point){
    let best=null,d=Infinity;
    for(const orb of this.orbs){if(!this.visibleLineages.has(orb.lineage)||orb.collapsing||orb.branching)continue;
      const distance=Math.hypot(...orb.follow.position.map((v,i)=>v-point[i]));if(distance<d){d=distance;best=orb;}
    }
    return best;
  }
  awaken(point){const orb=this.nearest(point);if(orb){orb.awake=true;this.orbs[orb.lineage].awake=true;this.record("awaken",orb.id);}return orb;}
  grab(point){const orb=this.held!==null?this.orbs[this.held]:this.nearest(point);if(!orb||orb.collapsing||orb.branching)return null;this.held=orb.id;orb.follow.freeze();this.record("grab",orb.id);return orb;}
  moveHeld(position,rotation){const orb=this.orbs[this.held];if(!orb)return;orb.follow.setTarget(position);orb.targetRotation=[...rotation];}
  lose(){const orb=this.orbs[this.held];if(orb){orb.follow.freeze();orb.targetRotation=[...orb.rotation];}}
  splitHeld(){
    const orb=this.orbs[this.held];if(!orb||orb.collapsing||orb.branching)return false;
    orb.follow.freeze();orb.branching=true;this.held=null;
    const count=2+(orb.id%2),origin=[...orb.follow.position];
    for(let branch=0;branch<count;branch++){
      const side=count===2?(branch===0?-1:1):branch-1;
      const target=[origin[0]+side*orb.radius*1.8,origin[1]+(branch===1?.35:-.1),origin[2]-branch*.25];
      const child=this.makeOrb(this.orbs.length,orb.lineage,orb.cluster,target,Math.max(.22,orb.radius*.78));
      child.birth=0;child.origin=origin;child.parent=orb.id;child.follow=new StableFollower(origin);
      child.awake=orb.awake;child.energy=orb.energy;child.rotation=[...orb.rotation];child.targetRotation=[...orb.rotation];
      this.orbs.push(child);orb.children.push(child.id);
    }
    this.record("split",orb.id);return true;
  }
  collapseNearest(point){const orb=this.held!==null?this.orbs[this.held]:this.nearest(point);if(!orb||orb.collapsing||orb.branching)return false;orb.follow.freeze();orb.base=[...orb.follow.position];orb.collapsing=true;this.held=null;this.record("collapse",orb.id);return true;}
  shift(direction){this.cluster=(this.cluster+direction+3)%3;this.record("swipe",this.cluster);return this.cluster;}
  tear(camera){let far=this.cluster,d=-1;this.centers.forEach((c,i)=>{const distance=Math.hypot(...c.map((v,k)=>v-camera[k]));if(i!==this.cluster&&distance>d){d=distance;far=i;}});this.cluster=far;this.record("tear",far);return far;}
  record(type,id){this.actions.push({type,id,time:this.time});if(this.actions.length>48)this.actions.shift();}
  update(dt){
    dt=Math.max(0,Math.min(dt,.05));this.time+=dt;
    for(const orb of this.orbs){
      orb.energy+=(Number(orb.awake)-orb.energy)*(1-Math.exp(-2.2*dt));
      orb.visibility+=(Number(this.visibleLineages.has(orb.lineage))-orb.visibility)*(1-Math.exp(-4*dt));
      if(orb.branching)orb.split=clamp01(orb.split+dt/CONFIG.multiverse.splitDuration);
      if(orb.collapsing)orb.collapse=clamp01(orb.collapse+dt/CONFIG.multiverse.orbCollapseDuration);
      orb.birth=clamp01(orb.birth+dt/CONFIG.multiverse.splitDuration);
      if(this.held===orb.id){orb.follow.update(dt);orb.rotation=smoothRotation(orb.rotation,orb.targetRotation,dt);}
      else if(!orb.collapsing&&!orb.branching){
        if(orb.birth<1){const p=smooth(orb.birth),target=orb.base.map((v,i)=>orb.origin[i]+(v-orb.origin[i])*p);target[1]+=Math.sin(Math.PI*p)*.25;orb.follow.setTarget(target);}
        else orb.follow.setTarget([orb.base[0]+Math.sin(this.time*.21+orb.id)*.07,orb.base[1]+Math.sin(this.time*.29+orb.id*1.7)*.08,orb.base[2]]);
        orb.follow.update(dt);
      }
    }
  }
  snapshot(){return {cluster:this.cluster,baseUniverses:this.visibleLineages.size,held:this.held,actions:[...this.actions],orbs:this.orbs.filter(o=>this.visibleLineages.has(o.lineage)&&!(o.branching&&o.split===1)).map(o=>({id:o.id,lineage:o.lineage,sourceFlower:o.sourceFlower,cluster:o.cluster,awake:o.awake,children:[...o.children],collapse:o.collapse,position:[...o.follow.position]}))};}
}
