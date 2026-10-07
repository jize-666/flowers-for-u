import test from "node:test";
import assert from "node:assert/strict";
import { GardenExperience } from "../static/js/experience.js";

function setup(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = new EventTarget();
  document.hidden = false;
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  let allowed = false, commits = 0;
  const experience = new GardenExperience({
    audio: {}, hint: { querySelector: () => ({ textContent: "" }) },
    canCommit: () => allowed,
    onCommit: () => { commits++; },
  });
  for (const flag of Object.keys(experience.readiness.snapshot())) experience.readiness.set(flag, true);
  t.after(() => {
    experience.dispose();
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  });
  const sample = (gesture, now) => experience.trigger.sample({ gesture, timestamp: now, handId: 1 }, now);
  const gestureSequence = start => {
    sample("OPEN_PALM", start);
    for (let now = start + 50; now <= start + 1050; now += 50) sample("FIST", now);
  };
  return { experience, document, sample, gestureSequence, allow: value => { allowed = value; }, commits: () => commits };
}

test("integration: intro/letter gate blocks collapse; fresh palm and one-second fist commit once when exploring", t => {
  const f = setup(t);
  f.gestureSequence(0);
  assert.equal(f.commits(), 0);
  f.allow(true);
  f.gestureSequence(2000);
  assert.equal(f.commits(), 1);
  assert.equal(f.experience.sceneState.state, "garden_break");
  f.gestureSequence(4000);
  assert.equal(f.commits(), 1);
});

test("integration: opening a letter mid-hold cancels arming and requires a new palm", t => {
  const f = setup(t);
  f.allow(true);
  f.sample("OPEN_PALM", 0);
  f.sample("FIST", 50);
  f.allow(false);
  f.experience.trigger.tick(60);
  f.allow(true);
  for (let now = 100; now <= 1500; now += 50) f.sample("FIST", now);
  assert.equal(f.commits(), 0);
  f.gestureSequence(2000);
  assert.equal(f.commits(), 1);
});

test("integration: hidden or disposed experience cannot accept a collapse gesture", t => {
  const f = setup(t);
  f.allow(true);
  f.document.hidden = true;
  f.gestureSequence(0);
  assert.equal(f.commits(), 0);
  f.document.hidden = false;
  f.experience.dispose();
  f.gestureSequence(2000);
  assert.equal(f.commits(), 0);
});
