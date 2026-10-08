import test from "node:test";
import assert from "node:assert/strict";
import { GardenExperience } from "../static/js/experience.js";
import { trackingNow } from "../static/js/hand-tracker.js";
import { camDebugEnabled } from "../static/js/camera-debug.js";

// Simulation only: does not certify a physical camera, MediaPipe, or Safari.
function setup(t) {
  const values = { document: new EventTarget(), isSecureContext: true, OffscreenCanvas: class {},
    createImageBitmap: async () => ({ close() {} }) };
  const tracks = [], workers = [];
  let requests = 0, deny = false, commits = 0;
  values.document.hidden = false;
  values.document.createElement = () => ({ readyState: 2, currentTime: 0, play: async () => {}, pause() {} });
  values.Worker = class {
    constructor() { workers.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage({ data }); }
  };
  values.navigator = { mediaDevices: { getUserMedia: async () => {
    requests++;
    if (deny) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const track = new EventTarget();
    Object.assign(track, { readyState: "live", enabled: true, muted: false, stops: 0,
      stop() { this.stops++; this.readyState = "ended"; } });
    tracks.push(track);
    return { get active() { return track.readyState === "live"; }, getTracks: () => [track] };
  } } };
  const descriptors = Object.keys(values).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, value] of Object.entries(values)) Object.defineProperty(globalThis, k, { value, configurable: true });
  const hint = { textContent: "" };
  const experience = new GardenExperience({ audio: { criticalReady: true, context: {} }, hint: { querySelector: () => hint }, onCommit: () => commits++ });
  experience.readiness.set("audioReady", true);
  experience.readiness.set("transitionResourcesReady", true);
  t.after(() => { experience.dispose(); for (const [k, d] of descriptors) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  function result() {
    const tracker = experience.tracker;
    const worker = workers.at(-1);
    worker.emit({ type: "initialized" });
    tracker.pending = ++tracker.sequence;
    worker.emit({ type: "result", id: tracker.pending, timestamp: trackingNow(), landmarks: [] });
  }
  const sample = (gesture, timestamp) => experience.trigger.sample({ gesture, timestamp, handId: 1 }, timestamp);
  const hold = (start, duration = 1000) => { for (let n = start; n <= start + duration; n += 50) sample("FIST", n); };
  const end = () => { const track = tracks.at(-1); track.readyState = "ended"; track.dispatchEvent(new Event("ended")); };
  return { experience, tracks, workers, hint, result, sample, hold, end, document: values.document,
    requests: () => requests, commits: () => commits, deny: () => { deny = true; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("T01: debug instrumentation is disabled without ?debug=cam", () => assert.equal(camDebugEnabled, false));
test("T02: camera permission and model initialization alone never commit", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.experience.tick(); assert.equal(f.commits(), 0);
});
test("T03: palm then continuous 1000ms fist commits exactly once", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.sample("OPEN_PALM", 0); f.hold(50); f.hold(1100); assert.equal(f.commits(), 1);
});
test("T04: bare fist cannot commit", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.hold(0, 3000); assert.equal(f.commits(), 0);
});
test("T05: short hold cannot commit", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.sample("OPEN_PALM", 0); f.hold(50, 950); assert.equal(f.commits(), 0);
});
test("T06: stale result cancels hold without changing the 120ms threshold", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.sample("OPEN_PALM", 0); f.hold(50, 800); f.experience.trigger.tick(971); assert.equal(f.experience.trigger.status, "unarmed"); assert.equal(f.commits(), 0);
});
test("T07: camera ends after garden ready: cleanup, one restart, no automatic collapse", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.sample("OPEN_PALM", 0); f.hold(50, 800); f.end();
  assert.equal(f.experience.trigger.status, "unarmed"); assert.equal(f.tracks[0].stops, 1); assert.equal(f.workers[0].terminated, true);
  await flush(); assert.equal(f.requests(), 2); assert.equal(f.commits(), 0); assert.equal(f.experience.readiness.snapshot().trackerReady, false);
  f.result(); f.hold(1000, 2000); assert.equal(f.commits(), 0);
  f.sample("OPEN_PALM", 4000); f.hold(4050); assert.equal(f.commits(), 1);
});
test("T08: repeated ended never creates an infinite retry loop", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.end(); await flush(); f.end(); await flush();
  assert.equal(f.requests(), 2); assert.match(f.hint.textContent, /refresh/); assert.equal(f.commits(), 0);
});
test("T09: permission rejection during recovery remains fail-closed", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.deny(); f.end(); await flush();
  assert.equal(f.requests(), 2); assert.match(f.hint.textContent, /ditolak/); assert.equal(f.experience.readiness.ready, false);
});
test("T10: hidden tab defers recovery until visible and never revives disposed experience", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.document.hidden = true; f.end(); await flush(); assert.equal(f.requests(), 1);
  f.document.hidden = false; f.document.dispatchEvent(new Event("visibilitychange")); await flush(); assert.equal(f.requests(), 2);
  f.experience.dispose(); f.document.dispatchEvent(new Event("visibilitychange")); await flush(); assert.equal(f.requests(), 2);
});
test("T11: terminal disposal before queued retry cancels recovery", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.end(); f.experience.dispose(); await flush(); assert.equal(f.requests(), 1);
});
test("T12: worker init failure preserves cleanup and is not retried as camera loss", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.workers[0].emit({ type: "error", code: "TRACKER_INIT", detail: "module HTTP 404" }); await flush();
  assert.equal(f.requests(), 1); assert.equal(f.tracks[0].stops, 1); assert.equal(f.workers[0].terminated, true); assert.equal(f.commits(), 0);
});
test("T13: mute cancels hold; unmute and recovered worker require fresh intentional palm", async t => {
  const f = setup(t); await f.experience.tracker.start(); f.result(); f.sample("OPEN_PALM", 0); f.hold(50, 800);
  f.tracks[0].dispatchEvent(new Event("mute")); f.tracks[0].dispatchEvent(new Event("unmute"));
  f.hold(900, 1500); assert.equal(f.commits(), 0); assert.equal(f.requests(), 1);
});
