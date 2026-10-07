import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, CONTENT, FLOWERS, QUALITY } from "../static/js/config.js";
import { clamp, damp, seededRandom, windOffset, buildTypingSchedule, visibleCharacterCount, isIntentionalClick, visibleFlowerIds } from "../static/js/utils.js";

test("only three specific flowers are letter triggers", () => {
  assert.deepEqual(FLOWERS.filter(f => f.trigger).map(f => f.id), ["moonflower", "ivory", "blush"]);
  assert.ok(FLOWERS.some(f => !f.trigger));
  assert.equal(new Set(FLOWERS.map(f => f.id)).size, FLOWERS.length);
});

test("every quality tier retains all interactive flowers", () => {
  for (const quality of Object.values(QUALITY)) {
    assert.equal(FLOWERS.slice(0, quality.flowers).filter(f => f.trigger).length, 3);
  }
  assert.ok(QUALITY.high.flowers >= QUALITY.medium.flowers);
  assert.ok(QUALITY.medium.flowers >= QUALITY.low.flowers);
});

test("growth and bloom use positive, overlapping durations", () => {
  assert.ok(CONFIG.growth.bloomDelay < CONFIG.growth.duration);
  assert.ok(CONFIG.growth.leafDelay < CONFIG.growth.bloomDelay);
});

test("the approved message is preserved", () => {
  assert.ok(CONTENT.message.startsWith("I don\u2019t know if words can always explain everything."));
  assert.ok(CONTENT.message.endsWith("someone who thought of you in this much detail."));
});

test("typing is monotonic, begins empty and ends with the complete text", () => {
  const schedule = buildTypingSchedule(CONTENT.message);
  assert.equal(visibleCharacterCount(schedule.times, 0), 0);
  assert.equal(visibleCharacterCount(schedule.times, schedule.duration), schedule.segments.length);
  assert.equal(schedule.segments.join(""), CONTENT.message);
  schedule.times.slice(1).forEach((t,i) => assert.ok(t > schedule.times[i]));
});

test("typing preserves grapheme clusters", () => {
  const message = "A \uD83C\uDF38 for e\u0301.";
  const schedule = buildTypingSchedule(message);
  assert.equal(schedule.segments.join(""), message);
  assert.ok(schedule.segments.includes("\uD83C\uDF38"));
  assert.ok(schedule.segments.includes("e\u0301"));
});

test("punctuation introduces a reading pause", () => {
  const plain = buildTypingSchedule("abcd");
  const punctuation = buildTypingSchedule("ab.d");
  assert.ok(punctuation.duration > plain.duration);
});

test("a click is not a drag, long press, or another pointer", () => {
  const start = { id: 1, x: 10, y: 10, time: 100 };
  assert.equal(isIntentionalClick(start, { id: 1, x: 12, y: 13, time: 200 }), true);
  assert.equal(isIntentionalClick(start, { id: 1, x: 40, y: 10, time: 200 }), false);
  assert.equal(isIntentionalClick(start, { id: 2, x: 10, y: 10, time: 200 }), false);
  assert.equal(isIntentionalClick(start, { id: 1, x: 10, y: 10, time: 900 }), false);
  assert.equal(isIntentionalClick(null, { id: 1, x: 10, y: 10, time: 200 }), false);
});

test("wind is smooth, finite, and anchored when growth is zero", () => {
  const a = windOffset(100, 2, .04, 3.15);
  const b = windOffset(100.0001, 2, .04, 3.15);
  assert.ok(Math.abs(a.x-b.x) < .0001);
  assert.ok(Math.abs(a.z-b.z) < .0001);
  assert.deepEqual(windOffset(100,2,.04,3.15,0), { x: 0, z: 0 });
});

test("damping is independent of frame rate", () => {
  let sixty = 0, oneTwenty = 0;
  for (let i=0; i<60; i++) sixty = damp(sixty, 1, 3, 1/60);
  for (let i=0; i<120; i++) oneTwenty = damp(oneTwenty, 1, 3, 1/120);
  assert.ok(Math.abs(sixty-oneTwenty) < 1e-12);
});

test("random scene layout helpers are deterministic", () => {
  const a = seededRandom(8), b = seededRandom(8);
  for (let i=0;i<100;i++) assert.equal(a(),b());
  assert.equal(clamp(10,0,1),1);
  assert.equal(clamp(-1,0,1),0);
});


test("a drag returning to its starting point is never a click", () => {
  const start = { id: 1, x: 10, y: 10, time: 100, maxDistance: 80 };
  assert.equal(isIntentionalClick(start, { id: 1, x: 10, y: 10, time: 300 }), false);
});

test("a negative pointer duration is rejected", () => {
  assert.equal(isIntentionalClick({ id: 1, x: 0, y: 0, time: 100 }, { id: 1, x: 0, y: 0, time: 50 }), false);
});

test("quality retains triggers after the user reorders flowers", () => {
  const flowers = [{id: "a"}, {id: "b"}, {id: "c", trigger: true}, {id: "d", trigger: true}];
  const visible = visibleFlowerIds(flowers, 3);
  assert.equal(visible.size, 3);
  assert.ok(visible.has("c") && visible.has("d"));
});

test("quality budget never hides a trigger, even if all flowers become triggers", () => {
  const visible = visibleFlowerIds([{ id: "a", trigger: true }, { id: "b", trigger: true }], 1);
  assert.deepEqual([...visible], ["a", "b"]);
});

test("configuration contains editable heading, hint and positive typing durations", () => {
  assert.ok(CONTENT.heading && CONTENT.headingAccent && CONTENT.hint);
  assert.ok(CONFIG.letter.typing.baseMs > 0 && CONFIG.letter.openDuration > 0);
});
