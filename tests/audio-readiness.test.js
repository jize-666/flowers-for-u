import test from "node:test";
import assert from "node:assert/strict";
import { GardenAudio } from "../static/js/audio.js";
import { audioPlan } from "../static/js/audio-plan.js";
import { CONFIG } from "../static/js/config.js";
import { CRITICAL_CUES, synthesizeCue, encodeWave } from "../static/js/transition-audio.js";

function setup(t, decodeFails = false) {
  const names = ["Audio", "AudioContext", "document"];
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const button = new EventTarget(); button.setAttribute = () => {};
  const doc = new EventTarget(); doc.hidden = false;
  doc.querySelector = () => button;
  let contexts = 0, plays = 0, decodes = 0, sources = 0;
  const params = [],nodes=[];
  class Context {
    constructor() { contexts++; this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    createGain() { const gain = { value: 1, ramps: [], sets: [], cancelAndHoldAtTime() {}, cancelScheduledValues() {}, setValueAtTime(value,time) { this.value=value; this.sets.push([value,time]); }, linearRampToValueAtTime(...args) { this.ramps.push(args); } }; params.push(gain); return { gain, connect() {}, disconnect() {} }; }
    createBufferSource() { const node={starts:[],stops:[],disconnections:0,connect() {}, disconnect() {this.disconnections++;}, start(...args) { sources++;this.starts.push(args); }, stop(...args) {this.stops.push(args);} };nodes.push(node);return node; }
    createMediaElementSource() { return { connect() {}, disconnect() {} }; }
    async resume() { this.state = "running"; }
    async suspend() { this.state = "suspended"; }
    async close() { this.state = "closed"; }
    async decodeAudioData(bytes) { decodes++; assert.ok(bytes.byteLength > 44); if (decodeFails) throw new Error("decode failed"); const v=new DataView(bytes),length=v.getUint32(40,true)/4,rate=v.getUint32(24,true);const channels=[new Float32Array([.2,-.2]),new Float32Array([.1,-.1])];return { duration:length/rate,length,numberOfChannels:2,getChannelData:ch=>channels[ch] }; }
  }
  class Media { constructor(){this.paused=true;} async play() { plays++;this.paused=false; } pause() {this.paused=true;} }
  for (const [key, value] of Object.entries({ document: doc, Audio: Media, AudioContext: Context })) Object.defineProperty(globalThis, key, { value, configurable: true });
  // Inject PCM for engine unit tests; the production adapter is tested separately.
  const audio = new GardenAudio(null,{generate:async name=>encodeWave(synthesizeCue(name)),release(){},dispose(){}});
  t.after(() => { audio.dispose(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  return { audio, button, params, nodes, doc, sourceCount: () => sources, counts: () => ({ contexts, plays, decodes }) };
}
const until = async condition => {
  for (let n = 0; n < 100; n++) { if (condition()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail("condition did not resolve");
};
test("A5/A6: no initial playback/context; sound activates one context and actual decode gates readiness", async t => {
  const f = setup(t);
  assert.deepEqual(f.counts(), { contexts: 0, plays: 0, decodes: 0 });
  assert.equal(Boolean(f.audio.criticalReady), false);
  f.button.dispatchEvent(new Event("click"));
  await until(() => f.audio.criticalReady);
  assert.deepEqual(f.counts(), { contexts: 1, plays: 1, decodes: Object.keys(CRITICAL_CUES).length });
  assert.equal(f.audio.criticalBuffers.size, Object.keys(CRITICAL_CUES).length);
  await f.audio.toggle(); await f.audio.toggle();
  assert.equal(f.counts().contexts, 1);
  assert.ok(f.params.at(-1).ramps.length >= 3);
  f.audio.context.state = "suspended";
  assert.equal(f.audio.criticalReady, false);
});

test("A15: reveal and loop share the activated context; loop starts once and uses a gain ramp", async t => {
  const f=setup(t);
  assert.equal(f.audio.startMultiverseAmbience(),false);
  await f.audio.toggle();await until(()=>f.audio.criticalReady);
  assert.equal(f.audio.startMultiverseAmbience(),false);
  f.audio.beginCollapse();
  assert.equal(f.audio.playTransitionCue("arrivalReveal"),false);
  assert.equal(f.audio.startMultiverseAmbience(),false);
  assert.equal(f.audio.startMultiverseAmbience(),false);
  assert.equal(f.audio.ambienceSource.loop,true);
  assert.equal(f.sourceCount(),audioPlan().length);
  assert.equal(f.counts().contexts,1);
  assert.deepEqual(f.params.at(-1).ramps,[[CONFIG.audioEngine.ambience,38.51]]);
});
test("A5: decoder failure blocks commit readiness and surfaces audio status", async t => {
  const f = setup(t, true);
  await f.audio.toggle(); await until(() => f.audio.criticalError);
  assert.equal(f.audio.criticalReady, false);
  assert.equal(f.audio.criticalDecoded, false);
});

test("A15: destructive cue cannot play before commit; mute/unmute never restarts garden after collapse", async t => {
  const f=setup(t);
  assert.equal(f.audio.playTransitionCue("energyRelease"),false);
  await f.audio.toggle();await until(()=>f.audio.criticalReady);
  assert.equal(f.audio.playTransitionCue("energyRelease"),false);
  f.audio.beginCollapse();
  assert.equal(f.audio.playTransitionCue("energyRelease"),false); // already scheduled exactly once
  assert.equal(f.sourceCount(),audioPlan().length);
  const gardenPlays=f.counts().plays;
  await f.audio.toggle();await f.audio.toggle();
  assert.equal(f.counts().plays,gardenPlays);
  f.audio.context.state="suspended";
  assert.equal(f.audio.playTransitionCue("voidFall"),false);
});

test("A15: scheduled boundaries use one audio clock; ended cues release buffers and graph nodes",async t=>{
  const f=setup(t);await f.audio.toggle();await until(()=>f.audio.criticalReady);
  f.audio.context.currentTime=10;f.audio.beginCollapse();
  const plan=audioPlan();assert.equal(f.nodes.length,plan.length);
  plan.forEach((cue,i)=>assert.ok(Math.abs(f.nodes[i].starts[0][0]-(10.01+cue.at))<1e-9));
  assert.equal(f.audio.snapshot().active,false); // first scheduled sound has not started
  f.audio.context.currentTime=10.1;assert.equal(f.audio.snapshot().active,true);
  for(const node of f.nodes.slice(0,-1)){node.onended();assert.equal(node.buffer,null);assert.ok(node.disconnections>0);}
  assert.equal(f.audio.voices.size,1);assert.equal(f.audio.criticalBuffers.size,1);
  assert.ok(f.audio.criticalBuffers.has("multiverseAmbience"));
  f.audio.dispose();f.audio.dispose();assert.equal(f.audio.voices.size,0);assert.equal(f.audio.transitionSources.size,0);
});
test("A15: fallback AudioParam cancellation continues from the interpolated gain, not a stale value",async t=>{
  const f=setup(t);await f.audio.toggle();await until(()=>f.audio.criticalReady);
  const param=f.audio.buses.master.gain;param.cancelAndHoldAtTime=undefined;
  f.audio.beginCollapse();f.audio.context.currentTime=.15;f.audio.disable();
  assert.ok(Math.abs(param.sets.at(-1)[0]-.9)<1e-9);assert.equal(param.sets.at(-1)[1],.15);
  assert.equal(param.ramps.at(-1)[0],0);
});
test("A15: visibility suspends/resumes one context without re-scheduling cues or restarting garden",async t=>{
  const f=setup(t);await f.audio.toggle();await until(()=>f.audio.criticalReady);f.audio.beginCollapse();
  const before=f.counts();f.doc.hidden=true;f.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.audio.context.state,"suspended");
  f.doc.hidden=false;f.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.audio.context.state,"running");assert.deepEqual(f.counts(),before);assert.equal(f.sourceCount(),9);
});
test("A15: one scheduling failure does not stop remaining cues or undo committed audio state",async t=>{
  const f=setup(t);await f.audio.toggle();await until(()=>f.audio.criticalReady);
  t.mock.method(console,"warn",()=>{});
  const create=f.audio.context.createBufferSource.bind(f.audio.context);let once=true;
  f.audio.context.createBufferSource=()=>{if(once){once=false;throw new Error("device failure");}return create();};
  assert.doesNotThrow(()=>f.audio.beginCollapse());assert.equal(f.audio.cinematic,true);
  assert.equal(f.sourceCount(),8);assert.match(f.audio.runtimeError,/visual tetap berjalan/);
});
test("A15: garden media is reclaimed after audio-clock fade, not before a suspended fade finishes",async t=>{
  const f=setup(t);await f.audio.toggle();await until(()=>f.audio.criticalReady);f.audio.beginCollapse();
  f.audio.context.currentTime=.4;f.audio.context.state="suspended";f.audio.update();assert.notEqual(f.audio.gardenReleased,true);
  f.audio.context.state="running";f.audio.context.currentTime=.81;f.audio.update();
  assert.equal(f.audio.gardenReleased,true);assert.equal(f.audio.source,null);assert.equal(f.audio.audio.paused,true);
  const plays=f.counts().plays;await f.audio.toggle();await f.audio.toggle();assert.equal(f.counts().plays,plays);
});
