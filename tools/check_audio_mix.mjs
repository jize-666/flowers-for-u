/** Offline production PCM diagnostic. This is not a browser/audio-device listening test. */
import {writeFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {audioPlan} from "../static/js/audio-plan.js";
import {synthesizeCue} from "../static/js/transition-audio.js";
import {CONFIG} from "../static/js/config.js";
const rate=24000,duration=64,plan=audioPlan(),c=CONFIG.audioEngine;
const tracks=plan.map(cue=>({...cue,...synthesizeCue(cue.name,rate)}));
const boundaries=[23.5,29.5,34.5,38.5],energy=boundaries.map(()=>({sum:0,frames:0}));
const previous=[0,0];let peak=0,maxAdjacentStep=0,clippedSamples=0;
for(let i=0;i<duration*rate;i++){
  const t=i/rate;
  for(let side=0;side<2;side++){
    let value=0;
    for(const track of tracks){
      const age=t-track.at;if(age<0||(!track.loop&&age>=track.duration))continue;
      const index=Math.floor(age*rate)%track.channels[side].length;
      const envelope=track.loop?Math.min(1,age/CONFIG.multiverse.arrival):Math.max(0,Math.min(1,age/c.attack,(track.duration-age)/c.release));
      value+=track.channels[side][index]*track.volume*c.buses[track.bus]*envelope;
    }
    value*=c.master;peak=Math.max(peak,Math.abs(value));if(Math.abs(value)>=1)clippedSamples++;
    maxAdjacentStep=Math.max(maxAdjacentStep,Math.abs(value-previous[side]));previous[side]=value;
    boundaries.forEach((at,j)=>{if(Math.abs(t-at)<.1){energy[j].sum+=value*value;energy[j].frames++;}});
  }
}
assert.equal(clippedSamples,0);assert.ok(peak<1);
const rms=energy.map((e,i)=>({at:boundaries[i],rms:Math.sqrt(e.sum/e.frames)}));
assert.ok(rms.every(e=>e.rms>1e-5));
const report={method:"Offline mix of production synthesized Float32 PCM with configured linear envelopes/bus gains; garden file excluded, covered by conservative bound unit test",sampleRate:rate,channels:2,durationSeconds:duration,peak,headroomDb:-20*Math.log10(peak),clippedSamples,maxAdjacentStep,boundaryWindowRms:rms,browserDecodeVerified:false,deviceListeningVerified:false};
await writeFile(new URL("../docs/phase4-audio-mix.json",import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
