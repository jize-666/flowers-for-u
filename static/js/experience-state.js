import { camLog } from "./camera-debug.js"; // HAPUS SETELAH DEBUG
/** Public scene states only. Loading, letter UI and readiness are separate. */
export const SCENE_STATES = Object.freeze([
  "garden_intro", "garden_break", "void_fall", "multiverse_arrival", "multiverse_interaction",
]);

export class ExperienceState {
  #index = 0;
  #commits = 0;
  constructor(onChange = () => {}) { this.onChange = onChange; }
  get state() { return SCENE_STATES[this.#index]; }
  get commits() { return this.#commits; }
  commit() {
    if (this.#index !== 0 || this.#commits !== 0) return false;
    this.#commits = 1;
    camLog("state", { owner: "ExperienceState", from: this.state, to: "garden_break", reason: "gesture commit" }, true); // HAPUS SETELAH DEBUG
    this.#index = 1;
    this.onChange(this.state);
    return true;
  }
  advance(next) {
    // Cinematic owner only; never skip, rewind, or commit via advance().
    if (this.#index === 0 || next !== SCENE_STATES[this.#index + 1]) return false;
    camLog("state", { owner: "ExperienceState", from: this.state, to: next, reason: "cinematic advance" }, true); // HAPUS SETELAH DEBUG
    this.#index += 1;
    this.onChange(this.state);
    return true;
  }
}

export class TransitionReadiness {
  #flags = { cameraReady: false, trackerReady: false, audioReady: false, transitionResourcesReady: false };
  #generation = 0;
  set(name, value) {
    if (!(name in this.#flags)) throw new Error(`Unknown readiness flag: ${name}`);
    this.#flags[name] = value === true;
  }
  get ready() { return Object.values(this.#flags).every(Boolean); }
  snapshot() { return { ...this.#flags }; }
  async prewarm(prepare) {
    const generation = ++this.#generation;
    this.set("transitionResourcesReady", false);
    await prepare();
    if (generation === this.#generation) this.set("transitionResourcesReady", true);
  }
  invalidate() {
    this.#generation += 1;
    for (const name of Object.keys(this.#flags)) this.#flags[name] = false;
  }
}

/** Timestamp-only trigger. No timer callback, click, or renderer can commit. */
export class CollapseTrigger {
  #status = "unarmed";
  #start = null;
  #last = null;
  #hand = null;
  constructor({ holdMs = 1000, staleMs = 120, ready, commit }) {
    Object.assign(this, { holdMs, staleMs, ready, commit });
  }
  get status() { return this.#status; }
  // HAPUS SETELAH DEBUG: preserves all original state assignments.
  setStatus(next, reason) {
    if (next !== this.#status) camLog("state", { owner: "CollapseTrigger", from: this.#status, to: next, reason }, true);
    this.#status = next;
  }
  // HAPUS SETELAH DEBUG: observational only; duration is based on accepted samples, never wall time.
  debugSnapshot(now) {
    return { substate: this.#status, currentHandValid: this.#hand !== null && this.#last !== null && now - this.#last <= this.staleMs,
      previouslyArmedByOpenPalm: this.#status !== "unarmed", continuousFistHoldMs: this.#start === null ? 0 : this.#last - this.#start };
  }
  cancel() {
    if (this.#status === "committed") return;
    this.setStatus("unarmed", "cancel: tracking/readiness/staleness; caller in stack");
    this.#start = this.#last = this.#hand = null;
  }
  tick(now) {
    if (this.#status === "committed") return;
    if (!this.ready() || (this.#last !== null && now - this.#last > this.staleMs)) this.cancel();
  }
  sample({ gesture, timestamp, handId }, now) {
    if (this.#status === "committed") return false;
    if (!Number.isFinite(now) || !Number.isFinite(timestamp) || timestamp > now || now - timestamp > this.staleMs || !this.ready()) {
      this.cancel(); return false;
    }
    if (this.#last !== null && timestamp <= this.#last) return false;
    if (this.#last !== null && (timestamp - this.#last > this.staleMs || handId !== this.#hand)) this.cancel();
    if (handId == null) { this.cancel(); return false; }
    if (!["OPEN_PALM", "FIST"].includes(gesture)) {
      // A valid hand may pass through an intermediate pose while closing.
      // Preserve arming only BEFORE a fist hold; unknown pose DURING hold cancels it.
      if (gesture === "UNKNOWN" && this.#status === "armed") this.#last = timestamp;
      else this.cancel();
      return false;
    }
    this.#last = timestamp;
    if (gesture === "OPEN_PALM") {
      this.#start = null;
      this.#hand = handId;
      this.setStatus("armed", "valid open palm");
      return false;
    }
    if (this.#status === "unarmed") return false;
    if (this.#status === "armed") { this.#start = timestamp; this.setStatus("holding_fist", "valid fist after palm"); }
    if (timestamp - this.#start < this.holdMs) return false;
    // Latch before calling downstream code: reentrant or repeated samples are harmless.
    this.setStatus("committed", "continuous fist duration satisfied");
    this.commit();
    return true;
  }
}
