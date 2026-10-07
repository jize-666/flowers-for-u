import test from "node:test";
import assert from "node:assert/strict";
import { HandTracker, trackingNow } from "../static/js/hand-tracker.js";

function environment(t, mode = "normal") {
  const names = ["document", "navigator", "Worker", "OffscreenCanvas", "createImageBitmap", "isSecureContext"];
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const document = new EventTarget();
  document.hidden = false;
  const track = new EventTarget();
  track.stops = 0; track.stop = () => track.stops++;
  const video = { readyState: 2, currentTime: 0, play: async () => {}, pause() {} };
  document.createElement = () => video;
  class FakeWorker {
    constructor() { FakeWorker.instance = this; this.messages = []; }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage({ data }); }
  }
  const values = { document, isSecureContext: true, Worker: FakeWorker, OffscreenCanvas: class {},
    createImageBitmap: async () => ({ close() { this.closed = true; } }),
    navigator: { mediaDevices: { getUserMedia: async constraints => {
      assert.equal(constraints.audio, false);
      if (mode === "denied") throw Object.assign(new Error(), { name: "NotAllowedError" });
      if (mode === "missing") throw Object.assign(new Error(), { name: "NotFoundError" });
      return { getTracks: () => [track] };
    } } },
  };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const samples = [], hands = [], errors = [], readiness = {};
  let losses = 0;
  const tracker = new HandTracker({ onSample: s => samples.push(s), onHands: s=>hands.push(s), onReady: (key, ready) => readiness[key] = ready, onLost: () => losses++, onError: code => errors.push(code) });
  t.after(() => { tracker.dispose(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  return { tracker, samples, hands, errors, readiness, track, video, document, worker: () => FakeWorker.instance, losses: () => losses };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("Worker adapter: camera denied/missing stay fail-closed with specific status", async t => {
  for (const [mode, expected] of [["denied", "CAMERA_DENIED"], ["missing", "CAMERA_MISSING"]]) {
    await t.test(mode, async t => { const f = environment(t, mode); await f.tracker.start(); assert.deepEqual(f.errors, [expected]); assert.equal(f.readiness.trackerReady, false); });
  }
});
test("Worker adapter: no fallback when Worker unsupported", async t => {
  const f = environment(t); globalThis.Worker = undefined;
  await f.tracker.start(); assert.deepEqual(f.errors, ["WORKER_UNSUPPORTED"]);
});
test("Worker adapter: model/inference failures stop camera and terminate Worker", async t => {
  const f = environment(t); await f.tracker.start();
  f.worker().emit({ type: "error", code: "TRACKER_INIT", detail: "model missing" });
  assert.deepEqual(f.errors, ["TRACKER_INIT"]);
  assert.ok(f.track.stops > 0 && f.worker().terminated);
  assert.equal(f.readiness.trackerReady, false);
});
test("Worker adapter: one frame in flight; stale results discarded; real result gates ready", async t => {
  const f = environment(t); await f.tracker.start();
  f.worker().emit({ type: "initialized" });
  assert.notEqual(f.readiness.trackerReady, true);
  f.tracker.tick(trackingNow()); await flush();
  f.video.currentTime = 1; f.tracker.tick(trackingNow() + 40); await flush();
  assert.equal(f.worker().messages.filter(m => m.type === "frame").length, 1);
  const frame = f.worker().messages.find(m => m.type === "frame");
  f.worker().emit({ type: "result", id: frame.id, timestamp: trackingNow() - 121, landmarks: [] });
  assert.equal(f.samples.length, 0);
  assert.notEqual(f.readiness.trackerReady, true);
  assert.equal(f.tracker.busy, false);
  f.tracker.lastCapture = -Infinity;
  f.tracker.tick(trackingNow()); await flush();
  const next = f.worker().messages.at(-1);
  f.worker().emit({ type: "result", id: next.id, timestamp: next.timestamp, landmarks: [] });
  assert.equal(f.readiness.trackerReady, true);
  assert.equal(f.samples.length, 0);
  assert.ok(f.losses() >= 2);
});
test("Worker adapter: duplicate video frames are not resubmitted", async t => {
  const f = environment(t); await f.tracker.start(); f.worker().emit({ type: "initialized" });
  f.tracker.tick(trackingNow()); await flush();
  const frame = f.worker().messages.at(-1);
  f.worker().emit({ type: "result", id: frame.id, timestamp: frame.timestamp, landmarks: [] });
  f.tracker.lastCapture = -Infinity; f.tracker.tick(trackingNow()); await flush();
  assert.equal(f.worker().messages.filter(m => m.type === "frame").length, 1);
});
test("Worker adapter: hide/show invalidates captured frame and cancels hold", async t => {
  const f = environment(t); await f.tracker.start(); f.worker().emit({ type: "initialized" });
  f.tracker.tick(trackingNow()); await flush();
  const frame = f.worker().messages.at(-1);
  f.document.hidden = true; f.document.dispatchEvent(new Event("visibilitychange"));
  f.document.hidden = false; f.document.dispatchEvent(new Event("visibilitychange"));
  f.worker().emit({ type: "result", id: frame.id, timestamp: frame.timestamp, landmarks: Array(1).fill([]) });
  assert.equal(f.samples.length, 0);
  assert.notEqual(f.readiness.trackerReady, true);
});
test("Worker adapter: disposal during bitmap creation closes frame, does not send", async t => {
  const f = environment(t); await f.tracker.start(); f.worker().emit({ type: "initialized" });
  let resolve; const bitmap = { closed: false, close() { this.closed = true; } };
  globalThis.createImageBitmap = () => new Promise(r => resolve = r);
  f.tracker.tick(trackingNow()); f.tracker.dispose(); resolve(bitmap); await flush();
  assert.equal(bitmap.closed, true);
  assert.equal(f.worker().messages.filter(m => m.type === "frame").length, 0);
});

const palmAt=x=>{
  const p=Array.from({length:21},()=>({x,y:.7,z:0}));
  for(const [i,dx] of [[5,-.06],[9,0],[13,.035],[17,.065]])for(let j=0;j<4;j++)p[i+j]={x:x+dx,y:.55-j*.045,z:0};
  for(let j=1;j<=4;j++)p[j]={x:x-.025*j,y:.69-.035*j,z:0};
  return p;
};
function deliver(f,landmarks,labels,timestamp=trackingNow()){
  const id=++f.tracker.sequence;f.tracker.pending=id;f.tracker.busy=true;
  f.worker().emit({type:"result",id,timestamp,landmarks,handedness:labels.map(categoryName=>[{categoryName,score:.99}])});
}
test("Worker adapter: two identities survive result order reversal; garden still rejects two hands",async t=>{
  const f=environment(t);await f.tracker.start();f.worker().emit({type:"initialized"});
  deliver(f,[palmAt(.3),palmAt(.7)],["Left","Right"]);
  const first=f.hands.at(-1).hands.map(h=>h.id);assert.equal(first.length,2);
  assert.equal(f.samples.at(-1).handId,null);
  deliver(f,[palmAt(.71),palmAt(.31)],["Right","Left"]);
  assert.deepEqual(f.hands.at(-1).hands.map(h=>h.id),[first[1],first[0]]);
  assert.ok(f.hands.at(-1).hands.every(h=>Math.abs(Math.hypot(...h.rotation)-1)<1e-10));
});
test("Worker adapter: epoch reset rejects old frame, keeps camera/worker, gives new identity",async t=>{
  const f=environment(t);await f.tracker.start();f.worker().emit({type:"initialized"});
  deliver(f,[palmAt(.4)],["Left"]);const id=f.hands.at(-1).hands[0].id;
  const before=trackingNow();f.tracker.resetEpoch();
  deliver(f,[palmAt(.4)],["Left"],before);assert.equal(f.hands.length,1);
  assert.equal(f.track.stops,0);assert.notEqual(f.worker().terminated,true);
  deliver(f,[palmAt(.4)],["Left"]);assert.notEqual(f.hands.at(-1).hands[0].id,id);
});
