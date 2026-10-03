import { CONFIG } from "./config.js";

export class GardenAudio {
  constructor(gsap = null) {
    this.gsap = gsap;
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
      if (document.hidden) this.audio.pause();
      else if (this.enabled) this.audio.play().catch(() => this.disable());
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  async toggle() {
    const generation = ++this.generation;
    this.requested = !this.requested;
    if (!this.requested) { this.disable(); return; }
    try {
      // The only initial play() call occurs inside this explicit audio-button gesture.
      await this.audio.play();
      if (generation !== this.generation) {
        if (!this.requested) this.audio.pause();
        return;
      }
      this.enabled = true;
      if (document.hidden) this.audio.pause();
      this.button.setAttribute("aria-pressed", "true");
      this.button.setAttribute("aria-label", "Mute garden ambience");
      this.fadeTo(this.focused ? CONFIG.audio.volume * 0.45 : CONFIG.audio.volume);
    } catch {
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
    this.fadeTo(0, () => { if (!this.enabled) this.audio.pause(); });
  }

  fadeTo(volume, onComplete = () => {}) {
    this.fade?.kill();
    if (this.gsap) this.fade = this.gsap.to(this.audio, { volume, duration: 0.8, onComplete });
    else { this.audio.volume = volume; onComplete(); }
  }

  focus(active) {
    this.focused = active;
    if (this.enabled) this.fadeTo(CONFIG.audio.volume * (active ? 0.45 : 1));
  }

  dispose() {
    this.events.abort();
    this.requested = false;
    this.generation += 1;
    this.fade?.kill();
    this.audio.pause();
    this.audio.src = "";
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
