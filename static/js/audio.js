// COLLAPSE INTEGRATION: existing garden retained; transition ownership and cleanup added.
import { audioPlan, normalizeBuffer } from "./audio-plan.js";
import { CONFIG } from "./config.js";
import { CRITICAL_CUES } from "./transition-audio.js";
import { AudioPrewarm } from "./audio-prewarm.js";

export class GardenAudio {
  constructor(gsap = null, synthesis = new AudioPrewarm()) {
    this.gsap = gsap;
    this.synthesis=synthesis;
    this.context = null;
    this.transitionSources = new Set();
    this.voices = new Map(); this.played = new Set(); this.ramps = new WeakMap();
    this.cinematic = false;
    this.criticalBuffers = new Map();
    this.criticalDecoded = false;
    this.disposed = false;
    this.loads = new AbortController();
    this.enabled = false;
    this.requested = false;
    this.focused = false;
    this.generation = 0;
    this.events = new AbortController();
    this.audio = new Audio(CONFIG.audio.path);
    this.audio.loop = true;
    this.audio.preload = "none";
    this.audio.volume = 0;
    this.button = document.querySelector("#sound-toggle");
    this.button.addEventListener("click", () => this.toggle(), { signal: this.events.signal });
    this.onVisibility = () => {
      if (this.cinematic) {
        if (document.hidden) void this.context?.suspend().catch(() => {});
        else void this.context?.resume().catch(() => { this.runtimeError="Audio gagal dilanjutkan. Gunakan tombol sound; visual tetap berjalan."; });
        return;
      }
      if (document.hidden) this.audio.pause();
      else if (this.enabled) this.audio.play().catch(() => this.disable());
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get criticalReady() {
    return this.context?.state === "running" && this.criticalDecoded && !this.criticalError;
  }

  async activateContext() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio unavailable");
      this.context = new AudioContextClass();
      this.buses = {};
      for (const name of ["master", "music", "soundscape", "effects"]) this.buses[name] = this.context.createGain();
      this.buses.master.connect(this.context.destination);
      for (const name of ["music", "soundscape", "effects"]) { this.buses[name].gain.value=CONFIG.audioEngine.buses[name]; this.buses[name].connect(this.buses.master); }
      this.gardenGain = this.context.createGain();
      this.gardenGain.gain.value = 0;
      this.gardenGain.connect(this.buses.music);
      this.source = this.context.createMediaElementSource(this.audio);
      this.source.connect(this.gardenGain);
      this.audio.volume = 1;
      // Existing garden audio remains the only soundtrack. No destructive cue is played.

    }
    if(!this.preparing&&!this.criticalDecoded&&!this.cinematic)this.preparing=this.prepareCritical().finally(()=>{this.preparing=null;});
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("AudioContext not running");
  }

  async prepareCritical() {
    const paths = CONFIG.collapse.criticalAudioPaths;
    this.criticalDecoded = false;
    try {
      if (paths.length && paths.length !== Object.keys(CRITICAL_CUES).length) throw new Error("Provide every critical cue override in manifest order");
      let buffers;
      if (!paths.length) {
        buffers = [];
        for (const name of Object.keys(CRITICAL_CUES)) {
          if (this.disposed) return;
          const wave=await this.synthesis.generate(name);
          if(this.disposed)return;
          const buffer = await this.context.decodeAudioData(wave);
          buffers.push([name, buffer]);
        }
      } else buffers = await Promise.all(paths.map(async (path, index) => {
        const response = await fetch(path, { signal: this.loads.signal });
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        return [Object.keys(CRITICAL_CUES)[index], buffer];
      }));
      if (this.disposed) return;
      for(const [name,buffer] of buffers){
        if(buffer.duration+0.02<CRITICAL_CUES[name])throw new Error(`Audio too short: ${name}`);
        normalizeBuffer(buffer);
      }
      this.criticalBuffers = new Map(buffers);
      this.criticalDecoded = true;
      this.criticalError = null;
    } catch {
      if (!this.disposed) this.criticalError = "Audio kritis gagal disiapkan atau di-decode. Collapse tetap terkunci.";
    } finally { try{this.synthesis.release();}catch{ /* Cancellation already owns the pending job. */ } }
  }

  async toggle() {
    const generation = ++this.generation;
    this.requested = !this.requested;
    if (!this.requested) { this.disable(); return; }
    try {
      // The only initial play() call occurs inside this explicit audio-button gesture.
      // Create/resume within the sound-button activation; never from tracking.
      const activation = this.activateContext();
      await Promise.all([activation, this.cinematic ? Promise.resolve() : this.audio.play()]);
      if(this.disposed)return;
      this.activationError = null; this.runtimeError=null;
      if (generation !== this.generation) {
        if (!this.requested) this.audio.pause();
        return;
      }
      this.enabled = true;
      if (document.hidden) this.audio.pause();
      this.button.setAttribute("aria-pressed", "true");
      this.button.setAttribute("aria-label", "Mute garden ambience");
      if (this.cinematic) this.automate(this.buses.master.gain, CONFIG.audioEngine.master, .3);
      else this.fadeTo(this.focused ? CONFIG.audio.volume * 0.45 : CONFIG.audio.volume);
    } catch {
      if (this.disposed) return;
      this.activationError = "Audio gagal diaktifkan. Coba tombol sound lagi.";
      this.disable();
      document.querySelector("#status-announcement").textContent = "Audio could not start. Try the sound button again.";
    }
  }

  disable() {
    this.generation += 1;
    this.requested = false;
    this.enabled = false;
    this.button.setAttribute("aria-pressed", "false");
    this.button.setAttribute("aria-label", "Enable garden ambience");
    if (this.cinematic && this.buses) this.automate(this.buses.master.gain, 0, .3);
    this.fadeTo(0, () => { if (!this.enabled) this.audio.pause(); });
  }

  fadeTo(volume, onComplete = () => {}) {
    clearTimeout(this.fadeTimer);
    if (this.gardenGain && this.context?.state !== "closed") {
      this.automate(this.gardenGain.gain,volume,.8);
      // Cleanup only; audible crossfade is entirely AudioParam automation.
      this.fadeTimer = setTimeout(onComplete, 810);
    } else { this.audio.volume = volume; onComplete(); }
  }

  automate(param, value, seconds) {
    const now=this.context.currentTime,old=this.ramps.get(param);
    const held=old?old.from+(old.to-old.from)*Math.max(0,Math.min(1,(now-old.start)/Math.max(.000001,old.end-old.start))):param.value;
    if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
    else {param.cancelScheduledValues(now);param.setValueAtTime(held,now);}
    param.linearRampToValueAtTime(value,now+seconds);
    this.ramps.set(param,{from:held,to:value,start:now,end:now+seconds});
  }

  beginCollapse() {
    if(this.cinematic||this.disposed)return;
    this.cinematic=true;this.fadeTo(0);
    if(!this.context)return;
    this.gardenReleaseAt=this.context.currentTime+.8;
    this.automate(this.buses.master.gain,this.enabled?CONFIG.audioEngine.master:0,.3);
    this.audioOrigin=this.context.currentTime+.01;
    // All cues share one audio clock derived from the sole GSAP schedule.
    // GSAP callbacks may request the same cue later; played prevents duplicates.
    for(const cue of audioPlan())try{this.scheduleVoice(cue,this.audioOrigin+cue.at);}catch(error){
      this.runtimeError="Audio transisi gagal; visual tetap berjalan.";console.warn(this.runtimeError,error.message);
    }
  }

  scheduleVoice({name,bus,volume,loop=false},at=this.context?.currentTime) {
    if(this.disposed||!this.cinematic||!this.context||this.context.state!=="running"||this.played.has(name)||!Number.isFinite(volume)||!Number.isFinite(at))return false;
    const buffer=this.criticalBuffers.get(name);if(!buffer||!this.buses[bus])return false;
    const source=this.context.createBufferSource(),gain=this.context.createGain(),c=CONFIG.audioEngine;
    source.buffer=buffer;source.loop=loop;source.connect(gain);gain.connect(this.buses[bus]);
    volume=Math.max(0,Math.min(c.maxVoice,volume));const end=loop?Infinity:at+buffer.duration;
    gain.gain.setValueAtTime(0,this.context.currentTime);gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(volume,at+(loop?CONFIG.multiverse.arrival:c.attack));
    if(!loop){gain.gain.setValueAtTime(volume,Math.max(at+c.attack,end-c.release));gain.gain.linearRampToValueAtTime(0,end);}
    const voice={name,source,gain,at,end,volume,bus,loop};this.voices.set(name,voice);this.transitionSources.add(source);
    const release=()=>{
      source.onended=null;source.disconnect();gain.disconnect();source.buffer=null;
      this.transitionSources.delete(source);this.voices.delete(name);this.criticalBuffers.delete(name);
      if(this.ambienceSource===source)this.ambienceSource=null;
    };
    source.onended=release;
    try{source.start(at);if(!loop)source.stop(end+.02);}catch(error){release();throw error;}
    this.played.add(name);if(loop)this.ambienceSource=source;
    return true;
  }

  playTransitionCue(name,bus="effects",volume=.3){return this.scheduleVoice({name,bus,volume});}
  startMultiverseAmbience(){return this.scheduleVoice({name:"multiverseAmbience",bus:"music",volume:CONFIG.audioEngine.ambience,loop:true});}

  update(){
    // Reclaim the old media only after its AUDIO-clock fade, including tab suspension.
    if(!this.cinematic||this.gardenReleased||!this.context||this.context.currentTime<this.gardenReleaseAt)return;
    this.gardenReleased=true;this.audio.pause();this.source?.disconnect();this.source=null;
    this.audio.removeAttribute?.("src");this.audio.load?.();
  }

  snapshot(){
    const now=this.context?.currentTime??0;
    const active=[...this.voices.values()].filter(v=>now>=v.at&&now<v.end);
    return {contextState:this.context?.state??"not-created",enabled:this.enabled,cinematic:this.cinematic,
      activeSources:active.length,scheduledSources:this.voices.size,decodedBuffers:this.criticalBuffers.size,gardenReleased:Boolean(this.gardenReleased),
      decodedBytes:[...this.criticalBuffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),
      active:this.enabled&&this.context?.state==="running"&&(this.cinematic?active.length>0:!this.audio.paused),
      currentTime:now,audioOrigin:this.audioOrigin??null,error:this.runtimeError||this.activationError||this.criticalError||null};
  }

  focus(active) {
    this.focused = active;
    if (this.enabled && !this.cinematic) this.fadeTo(CONFIG.audio.volume * (active ? 0.45 : 1));
  }

  dispose() {
    if(this.disposed)return;
    this.disposed = true;
    this.loads.abort();
    this.synthesis.dispose();
    clearTimeout(this.fadeTimer);
    this.transitionSources.forEach(source=>{try{source.stop();source.disconnect();}catch{}});
    this.transitionSources.clear();
    this.voices.forEach(({source,gain})=>{source.onended=null;source.buffer=null;gain.disconnect();});this.voices.clear();
    this.ambienceSource=null;
    this.source?.disconnect();this.gardenGain?.disconnect();
    Object.values(this.buses||{}).forEach(bus=>bus.disconnect());
    this.criticalBuffers.clear();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.events.abort();
    this.requested = false;
    this.generation += 1;
    this.fade?.kill();
    this.audio.pause();
    this.audio.src = "";
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
