import { CONFIG } from "./config.js";
/** Original deterministic layered PCM synthesis; no borrowed recordings or fake silent assets.
 * Phase 1 prepares/decodes these critical cues only. Playback belongs to the cinematic owner.
 * Tonal beds + independently filtered noise bands + decaying material resonances.
 */
export const CRITICAL_CUES = Object.freeze({ tension: CONFIG.collapse.freeze + CONFIG.audioEngine.tail, dimensionSlash: CONFIG.collapse.slash + CONFIG.audioEngine.tail, gravityBed: CONFIG.collapse.blackHole + CONFIG.audioEngine.tail, materialFailure: CONFIG.collapse.destruction + CONFIG.audioEngine.tail, energyRelease: 3, finalPull: CONFIG.collapse.finalPull + CONFIG.audioEngine.tail, voidFall: CONFIG.collapse.voidFall + CONFIG.audioEngine.tail, arrivalReveal: CONFIG.multiverse.arrival + CONFIG.audioEngine.tail, multiverseAmbience: 24 });
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

export function synthesizeCue(name, sampleRate = 24000) {
  if (!(name in CRITICAL_CUES)) throw new Error(`Unknown critical cue: ${name}`);
  const duration = CRITICAL_CUES[name];
  const count = Math.ceil(sampleRate * duration);
  const channels = [new Float32Array(count), new Float32Array(count)];
  if (name === "multiverseAmbience") {
    // Every carrier/envelope is an integer number of cycles per buffer. The loop
    // wraps as a continuous waveform, without a silence seam or runtime scheduling.
    for (let i=0;i<count;i++) for(let side=0;side<2;side++) {
      const cycle=2*Math.PI*i/count, space=side*.19;
      const pad=(.65+.14*Math.sin(cycle+space))*(.11*Math.sin(cycle*1320+space)+.065*Math.sin(cycle*1980-space)+.035*Math.sin(cycle*2640));
      const bowed=(.6+.2*Math.cos(cycle*2-space))*(.04*Math.sin(cycle*3956+.8*Math.sin(cycle*3))+ .024*Math.sin(cycle*5273+space));
      const bells=.052*Math.exp(2.8*(Math.cos(cycle*2+side*.2)-1))*(Math.sin(cycle*7920)+.3*Math.sin(cycle*11880+space));
      const distant=.027*Math.sin(cycle*6592+.7*Math.sin(cycle+space))*(.6+.4*Math.cos(cycle*3));
      channels[side][i]=pad+bowed+bells+distant;
    }
    return {channels,sampleRate,duration};
  }
  let seed = { tension: 7391, materialFailure: 17011, energyRelease: 9227, dimensionSlash: 771, gravityBed: 8821, finalPull: 6651, voidFall: 4249, arrivalReveal: 3187 }[name];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  const alpha = frequency => 1 - Math.exp(-2 * Math.PI * frequency / sampleRate);
  const low = [0, 0], mid = [0, 0], air = [0, 0];
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const p = t / duration;
    // Zero-valued endpoints and soft attack prevent buffer-edge discontinuities.
    const edge = smooth(t / 0.045) * smooth((duration - t - 1 / sampleRate) / 0.3);
    for (let side = 0; side < 2; side++) {
      const noise = random();
      low[side] += alpha(95) * (noise - low[side]);
      mid[side] += alpha(1100) * (noise - mid[side]);
      air[side] += alpha(4500) * (noise - air[side]);
      const phase = side * 0.18;
      let value;
      if (name === "tension") {
        const pressure = 0.18 + 0.82 * smooth(p);
        const beating = Math.sin(2 * Math.PI * 47 * t) + 0.48 * Math.sin(2 * Math.PI * 49.3 * t + phase);
        const bowed = Math.sin(2 * Math.PI * (173 * t + 7 * t * t) + phase) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * t));
        value = pressure * (0.18 * beating + 0.07 * bowed + 1.7 * low[side] + 0.12 * (mid[side] - low[side]));
      } else if (name === "materialFailure") {
        value = low[side] * (0.25+1.05*Math.exp(-t*.25));
        // Staggered fractures: inharmonic resonances with noisy contact transients.
        for (const [at, frequency, strength] of [[0.10, 283, 1], [0.34, 417, 0.65], [0.68, 631, 0.8], [1.16, 227, 0.55], [1.65, 809, 0.3], [3.4, 349, .45], [4.9, 713, .35], [6.6, 263, .5], [8.3, 487, .28]]) {
          const age = t - at - side * 0.002;
          if (age < 0) continue;
          const attack = smooth(age / 0.006);
          const ring = Math.sin(2 * Math.PI * frequency * age) + 0.42 * Math.sin(2 * Math.PI * frequency * 1.713 * age);
          value += strength * attack * (0.14 * ring * Math.exp(-age * 5) + 0.35 * (air[side] - low[side]) * Math.exp(-age * 24));
        }
      } else if (["dimensionSlash", "gravityBed", "finalPull", "voidFall"].includes(name)) {
        const acceleration = name === "finalPull" ? p*p : name === "dimensionSlash" ? smooth(p) : p*.3;
        const pressure = name === "dimensionSlash" ? Math.sin(Math.PI*p)*.7 : .3+.45*smooth(p);
        const spatial = .55+.45*Math.sin(t*(.9+side*.07)+phase);
        const harmonic = Math.sin(2*Math.PI*(38*t+12*t*acceleration))*.14 + Math.sin(2*Math.PI*(73*t+4*Math.sin(t*.35))+phase)*.07;
        const shear = (air[side]-mid[side])*.17*(.5+.5*Math.sin(t*13+side));
        value = pressure*(harmonic+low[side]*1.8+(mid[side]-low[side])*.65*spatial+shear);
      } else if (name === "arrivalReveal") {
        const rise=smooth(p/.4), tail=1-.55*smooth(p);
        const chord=[55,82.5,110,164.81,220].reduce((sum,f,j)=>sum+Math.sin(2*Math.PI*f*t+phase*(j+1))/(j+2),0);
        const shimmer=(mid[side]-low[side])*(.45+.3*Math.sin(t*1.8+phase));
        value=rise*tail*(chord*.24+shimmer*.18+low[side]*.35);
      } else {
        const decay = Math.exp(-t * 1.65);
        const subPhase = 2 * Math.PI * (34 * t + 37 * (1 - Math.exp(-t * 5)) / 5);
        const turbulence = (mid[side] - low[side]) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 3.7 * t + phase));
        const tail = Math.sin(2 * Math.PI * 97 * t + phase) * Math.exp(-t * 2.5);
        value = decay * (0.38 * Math.sin(subPhase) + 1.8 * low[side] + 0.65 * turbulence) + 0.08 * tail;
      }
      value *= edge;
      channels[side][i] = value;
      peak = Math.max(peak, Math.abs(value));
    }
  }
  const gain = peak > 0 ? 0.65 / peak : 0;
  channels.forEach(channel => { for (let i = 0; i < count; i++) channel[i] *= gain; });
  return { channels, sampleRate, duration };
}

export function encodeWave({ channels, sampleRate }) {
  const frames = channels[0].length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const text = (at, value) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < 2; channel++) view.setInt16(44 + i * 4 + channel * 2, Math.round(Math.max(-1, Math.min(1, channels[channel][i])) * 32767), true);
  return buffer;
}
