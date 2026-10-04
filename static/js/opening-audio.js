export class OpeningAudio {
  constructor(config, onStatus) {
    this.config = config;
    this.onStatus = onStatus;
    this.context = null;
    this.gain = null;
    this.source = null;
    this.buffer = null;
    this.loading = null;
    this.enabled = true;
    this.volume = config.audioVolume;
    this.offset = 0;
    this.startedAt = 0;
    this.ticket = 0;
    this.wantsPlayback = false;
  }

  prime() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is unavailable.');
      this.context = new Context();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
    }
    return this.context.resume();
  }

  async load() {
    if (this.buffer) return this.buffer;
    if (!this.loading) {
      this.loading = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(this.config.audioUrl, { signal: controller.signal });
          if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
          this.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          return this.buffer;
        } finally {
          clearTimeout(timeout);
        }
      })().catch(error => { this.loading = null; throw error; });
    }
    return this.loading;
  }

  async play() {
    if (!this.enabled) return;
    this.wantsPlayback = true;
    const ticket = ++this.ticket;
    try {
      const resumed = this.prime();
      await resumed;
      const buffer = await this.load();
      if (ticket !== this.ticket || !this.wantsPlayback || !this.enabled) return;
      if (this.source) return;
      this.source = this.context.createBufferSource();
      this.source.buffer = buffer;
      this.source.loop = true;
      this.source.connect(this.gain);
      this.startedAt = this.context.currentTime;
      this.source.start(0, this.offset % buffer.duration);
      this.gain.gain.cancelScheduledValues(this.context.currentTime);
      this.gain.gain.setValueAtTime(0, this.context.currentTime);
      this.gain.gain.linearRampToValueAtTime(this.volume, this.context.currentTime + this.config.audioFadeSeconds);
      this.onStatus('playing');
    } catch (error) {
      if (ticket === this.ticket) this.onStatus('unavailable');
    }
  }

  pause() {
    this.wantsPlayback = false;
    this.ticket += 1;
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    this.offset = (this.offset + this.context.currentTime - this.startedAt) % this.buffer.duration;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0, now, 0.025);
    source.stop(now + 0.12);
    source.onended = () => source.disconnect();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value)));
    if (this.context && this.source) {
      const now = this.context.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(this.volume, now, 0.12);
    }
  }

  reset() { this.pause(); this.offset = 0; }

  async dispose() {
    this.pause();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
