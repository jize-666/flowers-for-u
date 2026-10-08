import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { HandTracker } from "../static/js/hand-tracker.js";
import { CONFIG } from "../static/js/config.js";

test("MediaPipe worker is a classic script and receives the unchanged tracking settings", async t => {
  const workerSource = readFileSync(new URL("../static/js/hand-worker.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => new vm.Script(workerSource)); // Top-level module imports would fail.
  const originals = [];
  const video = { play: async () => {}, pause() {} };
  const track = Object.assign(new EventTarget(), { stop() {} });
  let construction, init;
  const values = { document: Object.assign(new EventTarget(), { hidden: false, createElement: () => video }),
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } }, isSecureContext: true,
    OffscreenCanvas: class {}, createImageBitmap() {}, Worker: class {
      constructor(url, options) { construction = { url, options }; }
      postMessage(message) { init = structuredClone(message); }
      terminate() {}
    } };
  for (const [name, value] of Object.entries(values)) { originals.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]); Object.defineProperty(globalThis, name, { value, configurable: true }); }
  const tracker = new HandTracker({ onSample() {}, onReady() {}, onLost() {}, onError(code) { assert.fail(code); } });
  t.after(() => { tracker.dispose(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  await tracker.start();
  assert.equal(construction.options?.type ?? "classic", "classic");
  assert.equal(init.type, "init");
  assert.deepEqual(init.settings, CONFIG.handTracking);
});
