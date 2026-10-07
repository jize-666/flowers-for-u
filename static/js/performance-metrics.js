import { CONFIG } from "./config.js";
export class PerformanceMetrics {
  constructor(){this.windows={};}
  record(stage,ms,{audioActive,trackingActive,visible=true}){
    const w=this.windows[stage]??={qualified:[],foreground:[],foregroundSeen:0,qualifiedSeen:0,excluded:0,reasons:{audio:0,tracking:0,hidden:0,invalid:0}};
    const valid=Number.isFinite(ms)&&ms>0;
    if(visible&&valid){w.foregroundSeen++;if(w.foreground.length<CONFIG.performance.maxMetricFrames)w.foreground.push(ms);}
    if(!visible||!audioActive||!trackingActive||!valid){
      w.excluded++;if(!visible)w.reasons.hidden++;if(!audioActive)w.reasons.audio++;if(!trackingActive)w.reasons.tracking++;if(!valid)w.reasons.invalid++;return;
    }
    w.qualifiedSeen++;
    if(w.qualified.length<CONFIG.performance.maxMetricFrames)w.qualified.push(ms);
  }
  report(metadata={}){
    const windows={};
    for(const [key,w] of Object.entries(this.windows)){
      const sorted=[...w.qualified].sort((a,b)=>a-b),n=sorted.length,mean=n?sorted.reduce((a,b)=>a+b,0)/n:null;
      const foreground=[...w.foreground].sort((a,b)=>a-b),allMean=foreground.length?foreground.reduce((a,b)=>a+b,0)/foreground.length:null;
      windows[key]={status:n?"RAF measured with audio and inference active":"belum terukur",frames:n,meanMs:mean,fps:mean?1000/mean:null,p95Ms:n?sorted[Math.floor((n-1)*.95)]:null,maxMs:n?sorted.at(-1):null,excluded:w.excluded,reasons:w.reasons,
        qualifiedCoverage:w.foregroundSeen?w.qualifiedSeen/w.foregroundSeen:0,
        allForeground:{frames:foreground.length,meanMs:allMean,fps:allMean?1000/allMean:null,p95Ms:foreground.length?foreground[Math.floor((foreground.length-1)*.95)]:null,maxMs:foreground.at(-1)??null},
        truncated:w.foregroundSeen>CONFIG.performance.maxMetricFrames||w.qualifiedSeen>CONFIG.performance.maxMetricFrames};
    }
    return {metadata,windows,note:"RAF intervals, not GPU timings. Active audio nodes are not proof of audible hardware output; inference results need not contain a hand."};
  }
}
