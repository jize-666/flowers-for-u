import test from "node:test";
import assert from "node:assert/strict";
import { audioPlan,normalizeBuffer } from "../static/js/audio-plan.js";
import { CONFIG } from "../static/js/config.js";
import { CRITICAL_CUES } from "../static/js/transition-audio.js";
import { collapseSchedule } from "../static/js/collapse-core.js";
test("A15: four audio needs share cinematic boundaries with overlapping tails and one loop",()=>{
  const cues=audioPlan(),s=collapseSchedule(),byName=Object.fromEntries(cues.map(c=>[c.name,c]));
  assert.equal(new Set(cues.map(c=>c.name)).size,cues.length);
  assert.equal(byName.voidFall.at,s.voidStart);assert.equal(byName.arrivalReveal.at,s.end);assert.equal(byName.multiverseAmbience.at,s.end);
  assert.equal(cues.filter(c=>c.loop).length,1);
  for(const [a,b] of [["materialFailure","finalPull"],["finalPull","voidFall"],["voidFall","arrivalReveal"]]){
    assert.ok(byName[a].at+CRITICAL_CUES[a]-byName[b].at>=CONFIG.audioEngine.tail-1e-6);
  }
});
test("A15: conservative peak bound for simultaneous cues plus existing garden is below full scale",()=>{
  const cues=audioPlan(),c=CONFIG.audioEngine;let peakBound=0;
  for(let at=0;at<65;at+=.01){
    const garden=CONFIG.audio.volume*Math.max(0,1-at/.8);
    const bound=cues.reduce((sum,cue)=>sum+(at>=cue.at&&(cue.loop||at<cue.at+CRITICAL_CUES[cue.name])?c.peak*cue.volume*c.buses[cue.bus]:0),0);
    // Master may still be fading from 1 to .8 in the first .3s.
    peakBound=Math.max(peakBound,(garden+bound)*(at<.3?1:c.master));
  }
  assert.ok(peakBound<.8,`peak bound ${peakBound}`);
});
test("A15: decoded overrides have headroom; silent and nonfinite critical audio fail closed",()=>{
  const channels=[new Float32Array([2,-1]),new Float32Array([1,-2])];
  const buffer={numberOfChannels:2,getChannelData:i=>channels[i]};normalizeBuffer(buffer);
  assert.ok(Math.abs(channels[0][0]-.65)<1e-6);assert.ok(Math.abs(channels[1][1]+.65)<1e-6);
  assert.throws(()=>normalizeBuffer({numberOfChannels:1,getChannelData:()=>new Float32Array([0,0])}));
  assert.throws(()=>normalizeBuffer({numberOfChannels:1,getChannelData:()=>new Float32Array([NaN,1])}));
});
