import test from "node:test";
import assert from "node:assert/strict";
import { CollapseTrigger, ExperienceState, SCENE_STATES, TransitionReadiness } from "../static/js/experience-state.js";
import { CONFIG } from "../static/js/config.js";
import { classifyHand } from "../static/js/hand-gesture.js";

function fixture() {
  const scene = new ExperienceState();
  const readiness = new TransitionReadiness();
  for (const key of Object.keys(readiness.snapshot())) readiness.set(key, true);
  const trigger = new CollapseTrigger({ ...CONFIG.collapse, staleMs: CONFIG.handTracking.staleMs, ready: () => readiness.ready, commit: () => scene.commit() });
  const sample = (gesture, timestamp, now = timestamp, handId = 1) => trigger.sample({ gesture, timestamp, handId }, now);
  const hold = (start, duration) => { for (let t = start; t <= start + duration; t += 40) sample("FIST", t); };
  return { scene, readiness, trigger, sample, hold };
}

test("A4: exactly five states, no skip/reverse, single commit", () => {
  const scene = new ExperienceState();
  assert.equal(SCENE_STATES.length, 5);
  assert.equal(scene.advance("garden_break"), false);
  assert.equal(scene.advance("void_fall"), false);
  assert.equal(scene.commit(), true);
  assert.equal(scene.commit(), false);
  assert.equal(scene.advance("multiverse_arrival"), false);
  for (const next of SCENE_STATES.slice(2)) assert.equal(scene.advance(next), true);
  assert.equal(scene.advance("garden_intro"), false);
  assert.equal(scene.commits, 1);
});

test("A5: readiness, camera, loading/time and bare fist cannot commit", () => {
  const f = fixture();
  f.hold(0, 3000);
  f.trigger.tick(100000);
  assert.equal(f.scene.commits, 0);
  f.sample("OPEN_PALM", 100040);
  for (let t = 100080; t < 102000; t += 40) f.sample("OPEN_PALM", t);
  assert.equal(f.scene.commits, 0);
});

test("A5: 999ms is insufficient; exactly 1000ms commits once", () => {
  const f = fixture();
  f.sample("OPEN_PALM", 0);
  f.hold(40, 960);
  f.sample("FIST", 1039);
  assert.equal(f.scene.commits, 0);
  f.sample("FIST", 1040);
  assert.equal(f.scene.state, "garden_break");
  f.hold(1080, 3000);
  f.sample("OPEN_PALM", 5000);
  f.hold(5040, 1040);
  assert.equal(f.scene.commits, 1);
  assert.equal(f.trigger.status, "committed");
});

test("A5: 24, 30, 60Hz and irregular timestamps use elapsed time", () => {
  for (const interval of [1000 / 24, 1000 / 30, 1000 / 60, 71]) {
    const f = fixture(); f.sample("OPEN_PALM", 0);
    const start = 40;
    for (let t = start; t < start + 1000; t += interval) {
      f.sample("FIST", t); assert.equal(f.scene.commits, 0);
    }
    f.sample("FIST", start + 1000);
    assert.equal(f.scene.commits, 1);
  }
});

test("A5: all four readiness gates independently block and cancel", () => {
  for (const key of Object.keys(new TransitionReadiness().snapshot())) {
    const f = fixture(); f.sample("OPEN_PALM", 0); f.hold(40, 800);
    f.readiness.set(key, false); f.trigger.tick(850);
    assert.equal(f.trigger.status, "unarmed");
    f.readiness.set(key, true); f.hold(880, 2000);
    assert.equal(f.scene.commits, 0);
  }
});

test("A5: an interrupted fist resets duration entirely", () => {
  for (const gesture of ["UNKNOWN", "NONE", "OPEN_PALM"]) {
    const f = fixture(); f.sample("OPEN_PALM", 0); f.hold(40, 800);
    f.sample(gesture, 880); f.hold(920, 800);
    assert.equal(f.scene.commits, 0);
    f.sample("OPEN_PALM", 1760); f.hold(1800, 1000);
    assert.equal(f.scene.commits, 1);
  }
});

test("A5: sample older than 120ms cancels; 120ms is still fresh", () => {
  const f = fixture();
  f.sample("OPEN_PALM", 0, 120); assert.equal(f.trigger.status, "armed");
  f.sample("FIST", 40, 161); assert.equal(f.trigger.status, "unarmed");
  f.hold(200, 1040); assert.equal(f.scene.commits, 0);
});

test("A5: fresh result after a >120ms sampling gap cannot bridge hold", () => {
  const f = fixture(); f.sample("OPEN_PALM", 0); f.hold(40, 800);
  f.sample("FIST", 961); f.hold(1000, 1200);
  assert.equal(f.scene.commits, 0);
});

test("A5: loss watchdog resets arming even without another result", () => {
  const f = fixture(); f.sample("OPEN_PALM", 0);
  f.trigger.tick(120); assert.equal(f.trigger.status, "armed");
  f.trigger.tick(121); assert.equal(f.trigger.status, "unarmed");
});

test("A5: duplicate, out-of-order, future and NaN timestamps cannot add hold", () => {
  const f = fixture(); f.sample("OPEN_PALM", 0); f.sample("FIST", 40);
  for (let i = 0; i < 200; i++) f.sample("FIST", 40, 100);
  f.sample("FIST", 20, 100);
  assert.equal(f.scene.commits, 0);
  f.sample("FIST", 10000, 200); assert.equal(f.trigger.status, "unarmed");
  f.sample("OPEN_PALM", NaN, 200); assert.equal(f.trigger.status, "unarmed");
});

test("A5: another hand cannot inherit the armed hold", () => {
  const f = fixture(); f.sample("OPEN_PALM", 0); f.hold(40, 800);
  f.sample("FIST", 880, 880, 2);
  assert.equal(f.trigger.status, "unarmed");
  assert.equal(f.scene.commits, 0);
});

test("A5: after commit, camera/audio loss never rolls scene back", () => {
  const f = fixture(); f.sample("OPEN_PALM", 0); f.hold(40, 1000);
  f.readiness.invalidate(); f.trigger.cancel(); f.trigger.tick(100000);
  assert.equal(f.scene.state, "garden_break");
  assert.equal(f.trigger.status, "committed");
});

test("A5: prewarm must resolve; rejected/cancelled work never reports ready", async () => {
  const readiness = new TransitionReadiness();
  let resolve;
  const pending = readiness.prewarm(() => new Promise(r => { resolve = r; }));
  assert.equal(readiness.snapshot().transitionResourcesReady, false);
  resolve(); await pending;
  assert.equal(readiness.snapshot().transitionResourcesReady, true);
  await assert.rejects(readiness.prewarm(async () => { throw new Error("compile"); }));
  assert.equal(readiness.snapshot().transitionResourcesReady, false);
  const cancelled = readiness.prewarm(() => new Promise(r => { resolve = r; }));
  readiness.invalidate(); resolve(); await cancelled;
  assert.equal(readiness.snapshot().transitionResourcesReady, false);
  assert.throws(() => readiness.set("loading", true));
});

test("A5: reentrant commit callbacks cannot commit twice", () => {
  let count = 0;
  const trigger = new CollapseTrigger({ ready: () => true, commit: () => { count++; trigger.sample({ gesture: "FIST", timestamp: 1080, handId: 1 }, 1080); } });
  trigger.sample({ gesture: "OPEN_PALM", timestamp: 0, handId: 1 }, 0);
  for (let t = 40; t <= 1040; t += 40) trigger.sample({ gesture: "FIST", timestamp: t, handId: 1 }, t);
  assert.equal(count, 1);
});

test("A5: absent/invalid landmarks never count as a gesture", () => {
  for (const data of [null, [], Array(21).fill({ x: 0, y: 0, z: 0 }), Array(21).fill({ x: NaN, y: 0, z: 0 })]) assert.equal(classifyHand(data), "UNKNOWN");
});

test("A5: intermediate valid pose can close an armed palm, but cannot extend a fist hold", () => {
  const f = fixture(); f.sample("OPEN_PALM", 0); f.sample("UNKNOWN", 40);
  assert.equal(f.trigger.status, "armed");
  f.hold(80, 1000); assert.equal(f.scene.commits, 1);
});

test("pose classifier: synthetic palm/fist remain stable under rotation and scaling", () => {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[1] = { x: -0.35, y: 0.25, z: 0 };
  points[2] = { x: -0.55, y: 0.5, z: 0 };
  points[3] = { x: -0.8, y: 0.75, z: 0 };
  points[4] = { x: -1.05, y: 1, z: 0 };
  for (const [mcp, x] of [[5, -0.45], [9, 0], [13, 0.35], [17, 0.65]]) {
    for (let j = 0; j < 4; j++) points[mcp + j] = { x, y: 1 + j * 0.4, z: 0 };
  }
  assert.equal(classifyHand(points), "OPEN_PALM");
  const fist = structuredClone(points);
  for (const mcp of [5, 9, 13, 17]) {
    fist[mcp + 2].y = 1.2;
    fist[mcp + 3].y = 1.05;
    fist[mcp + 3].z = 0.15;
  }
  fist[4] = { x: 0.05, y: 1, z: 0.1 };
  assert.equal(classifyHand(fist), "FIST");
  const transform = data => data.map(({ x, y, z }) => ({ x: 5 + 2 * (x * Math.cos(0.8) - y * Math.sin(0.8)), y: 3 + 2 * (x * Math.sin(0.8) + y * Math.cos(0.8)), z: z * 2 }));
  assert.equal(classifyHand(transform(points)), "OPEN_PALM");
  assert.equal(classifyHand(transform(fist)), "FIST");
});
