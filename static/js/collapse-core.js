import { CONFIG } from "./config.js";
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
export function collapseSchedule(c = CONFIG.collapse) {
  for (const key of ["freeze", "slash", "blackHole", "rapidExpansion", "destruction", "destructionOverlap", "finalPull", "voidFall"]) {
    if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`Invalid collapse duration: ${key}`);
  }
  if (c.destructionOverlap > c.blackHole || c.destructionOverlap > c.destruction || c.rapidExpansion > c.blackHole) throw new Error("Invalid collapse overlap");
  const slashStart = c.freeze;
  const sphereStart = slashStart + c.slash;
  const expansionStart = sphereStart + c.blackHole - c.rapidExpansion;
  const blackHoleEnd = sphereStart + c.blackHole;
  const destructionStart = blackHoleEnd - c.destructionOverlap;
  const pullStart = destructionStart + c.destruction;
  const voidStart = pullStart + c.finalPull;
  return Object.freeze({ slashStart, sphereStart, expansionStart, blackHoleEnd, destructionStart, pullStart, voidStart, end: voidStart + c.voidFall });
}
export function beatsAt(time, c = CONFIG.collapse) {
  const s = collapseSchedule(c);
  return {
    freeze: smooth(time / c.freeze),
    slash: smooth((time - s.slashStart) / c.slash),
    sphere: smooth((time - s.sphereStart) / 1.6),
    expansion: smooth((time - s.expansionStart) / c.rapidExpansion),
    destruction: clamp01((time - s.destructionStart) / c.destruction),
    pull: smooth((time - s.pullStart) / c.finalPull),
    void: clamp01((time - s.voidStart) / c.voidFall),
  };
}
/** Hermite path passes the state boundary with the SAME position and velocity. */
export function cameraPath(time, start, c = CONFIG.collapse) {
  const s = collapseSchedule(c), h = c.hole;
  const hermite = (a,b,v0,v1,p,duration) => (2*p*p*p-3*p*p+1)*a + (p*p*p-2*p*p+p)*v0*duration + (-2*p*p*p+3*p*p)*b + (p*p*p-p*p)*v1*duration;
  const crossing = { x: h.x, y: h.y, z: h.z - 0.35 };
  if (time <= s.voidStart) {
    const p = clamp01((time-s.pullStart)/c.finalPull);
    return { x: hermite(start.x,crossing.x,0,0,p,c.finalPull), y: hermite(start.y,crossing.y,0,0,p,c.finalPull), z: hermite(start.z,crossing.z,0,-6,p,c.finalPull) };
  }
  const p=clamp01((time-s.voidStart)/c.voidFall);
  return { x: hermite(crossing.x,h.x-.9,0,0,p,c.voidFall), y: hermite(crossing.y,h.y+.2,0,0,p,c.voidFall), z: hermite(crossing.z,h.z-c.voidDepth,-6,0,p,c.voidFall) };
}
export class FrameTimeRecorder {
  constructor(schedule = collapseSchedule(), limit = 7200) { this.schedule = schedule; this.limit = limit; this.samples = { peakCollapse: [], voidFall: [] }; }
  record(time, milliseconds, visible = true) {
    if (!visible || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    const s = this.schedule;
    const key = time >= s.voidStart && time < s.end ? "voidFall" : time >= s.destructionStart && time < s.pullStart ? "peakCollapse" : null;
    if (key && this.samples[key].length < this.limit) this.samples[key].push(milliseconds);
  }
  report(metadata = {}) {
    const summarize = values => {
      if (!values.length) return { status: "belum terukur", frames: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      return { status: "measured RAF intervals (not GPU timings)", frames: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length, p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)], maxMs: sorted.at(-1) };
    };
    return { metadata, peakCollapse: summarize(this.samples.peakCollapse), voidFall: summarize(this.samples.voidFall) };
  }
}

/** The only cinematic sequence owner. Callbacks are injectable for headless sequencing tests. */
export function createCollapseTimeline(gsap, { clock, onCue, onDestruction, onVoid, onEnd, ui = null }, c = CONFIG.collapse) {
  const s = collapseSchedule(c), timeline = gsap.timeline({ paused: true });
  if (ui) timeline.to(ui, { autoAlpha: 0, duration: c.freeze, ease: "sine.inOut" }, 0);
  timeline.to(clock, { time: s.end, duration: s.end, ease: "none" }, 0);
  timeline.call(() => onCue("tension", "soundscape", .3), [], 0);
  timeline.call(() => onCue("dimensionSlash", "effects", .26), [], s.slashStart);
  timeline.call(() => onCue("gravityBed", "soundscape", .28), [], s.sphereStart);
  timeline.call(() => onCue("energyRelease", "effects", .3), [], s.expansionStart);
  timeline.call(onDestruction, [], s.destructionStart);
  timeline.call(() => onCue("materialFailure", "effects", .32), [], s.destructionStart);
  timeline.call(() => onCue("finalPull", "soundscape", .32), [], s.pullStart);
  timeline.call(() => { onVoid(); onCue("voidFall", "soundscape", .3); }, [], s.voidStart);
  timeline.call(onEnd, [], s.end);
  return timeline;
}
