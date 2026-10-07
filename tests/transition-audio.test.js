import test from "node:test";
import assert from "node:assert/strict";
import { CRITICAL_CUES, synthesizeCue, encodeWave } from "../static/js/transition-audio.js";

test("A15: critical synthesis yields finite stereo, headroom, tapered boundaries and valid PCM", () => {
  for (const [name, duration] of Object.entries(CRITICAL_CUES)) {
    const cue = synthesizeCue(name);
    let energy = 0, stereoDifference = 0;
    for (let i = 0; i < cue.channels[0].length; i++) {
      const left = cue.channels[0][i], right = cue.channels[1][i];
      assert.ok(Number.isFinite(left) && Number.isFinite(right));
      assert.ok(Math.abs(left) < 0.651 && Math.abs(right) < 0.651);
      energy += left * left;
      stereoDifference += Math.abs(left - right);
    }
    assert.ok(energy > 1 && stereoDifference > 1);
    if(name!=="multiverseAmbience")for (const channel of cue.channels) { assert.ok(Math.abs(channel[0]) === 0); assert.ok(Math.abs(channel.at(-1)) < 0.00001); }
    assert.equal(cue.channels[0].length, duration * cue.sampleRate);
    const wav = encodeWave(cue); const view = new DataView(wav);
    assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
    assert.equal(view.getUint32(4, true), wav.byteLength - 8);
    assert.equal(view.getUint16(22, true), 2);
    assert.equal(view.getUint32(24, true), cue.sampleRate);
    assert.equal(view.getUint32(40, true), cue.channels[0].length * 4);
  }
});
test("A15: ambience loop wraps with bounded amplitude and slope differences, without a silent seam",()=>{
  const {channels}=synthesizeCue("multiverseAmbience");
  for(const data of channels){
    let maxStep=0;for(let i=1;i<data.length;i++)maxStep=Math.max(maxStep,Math.abs(data[i]-data[i-1]));
    const seam=data[0]-data.at(-1),slopeBefore=data.at(-1)-data.at(-2),slopeAfter=data[1]-data[0];
    assert.ok(Math.abs(seam)<=maxStep);
    assert.ok(Math.abs(seam-slopeBefore)<.003&&Math.abs(slopeAfter-seam)<.003);
    const edgeEnergy=[...data.slice(0,2400),...data.slice(-2400)].reduce((n,x)=>n+x*x,0);
    assert.ok(edgeEnergy>1);
  }
});
test("A15: critical synthesis is deterministic and rejects unspecified cues", () => {
  assert.deepEqual(synthesizeCue("tension"), synthesizeCue("tension"));
  assert.throws(() => synthesizeCue("gesture-soundboard"));
});
