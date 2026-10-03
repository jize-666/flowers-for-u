import { CONFIG, CONTENT } from "./config.js";
import { buildTypingSchedule, visibleCharacterCount } from "./utils.js";

/** One owner for the dialog, its timelines, typing, and focus restoration. */
export class LetterController {
  constructor({ gsap = null, reducedMotion = false, onFocus = () => {}, onBlur = () => {}, onState = () => {} } = {}) {
    this.gsap = gsap;
    this.reducedMotion = reducedMotion;
    this.onFocus = onFocus;
    this.onBlur = onBlur;
    this.onState = onState;
    this.status = "closed";
    this.cycle = 0;
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.frame = 0;
    this.dialog = document.querySelector("#letter-dialog");
    this.paper = this.dialog.querySelector(".letter-paper");
    this.backdrop = this.dialog.querySelector(".letter-backdrop");
    this.text = this.dialog.querySelector("#typed-message");
    this.cursor = this.dialog.querySelector(".typing-cursor");
    this.skip = this.dialog.querySelector("#skip-typing");
    this.closeButton = this.dialog.querySelector("#close-letter");
    this.dialog.querySelector("#letter-title").textContent = CONTENT.letterTitle;
    this.dialog.querySelector("#letter-full-message").textContent = CONTENT.message;
    this.dialog.querySelector(".letter-layout").textContent = CONTENT.message;
    this.dialog.querySelector(".letter-signature").textContent = CONTENT.signature;
    this.schedule = buildTypingSchedule(CONTENT.message, CONFIG.letter.characterSeconds);
    this.closeButton.addEventListener("click", () => this.close(), options);
    this.skip.addEventListener("click", () => this.finishTyping(), options);
    this.dialog.addEventListener("cancel", event => { event.preventDefault(); this.close(); }, options);
    this.backdrop.addEventListener("click", () => this.close(), options);
  }

  setState(status) {
    this.status = status;
    this.onState(status);
    this.dialog.dataset.state = status;
  }

  open(flower, triggerElement = null) {
    // This method is called only from designated flower clicks or their keyboard equivalents.
    if (this.status !== "closed") return false;
    this.cycle += 1;
    this.previousFocus = triggerElement || document.activeElement;
    this.stopAnimations();
    this.text.textContent = "";
    this.cursor.style.opacity = "0";
    this.skip.hidden = false;
    this.skip.disabled = true;
    this.paper.classList.remove("is-typing");
    this.dialog.showModal();
    this.paper.scrollTop = 0;
    this.setState("opening");
    this.closeButton.focus({ preventScroll: true });
    document.body.classList.add("reading-letter");
    if (!this.gsap) { this.openNative(flower); return true; }
    const duration = this.reducedMotion ? 0.14 : CONFIG.letter.openDuration;
    this.openTimeline = this.gsap.timeline({
      onComplete: () => { if (this.status === "opening") this.setState("open"); },
    });
    this.onFocus(this.openTimeline, flower);
    this.openTimeline.fromTo(this.backdrop, { opacity: 0 }, { opacity: 1, duration: this.reducedMotion ? 0.14 : 0.65, ease: "sine.out" }, 0);
    this.openTimeline.fromTo(this.paper,
      { autoAlpha: 0, y: this.reducedMotion ? 0 : 66, z: this.reducedMotion ? 0 : -80, scale: this.reducedMotion ? 1 : 0.94, rotationX: this.reducedMotion ? 0 : 7, rotationZ: this.reducedMotion ? 0 : -1.2 },
      { autoAlpha: 1, y: 0, z: 0, scale: 1, rotationX: 0, rotationZ: 0, duration, ease: "power3.out" }, 0.08);
    this.openTimeline.call(() => this.beginTyping(), [], duration + 0.08 + (this.reducedMotion ? 0 : CONFIG.letter.typingDelay));
    return true;
  }

  async openNative(flower) {
    const cycle = this.cycle;
    this.onFocus(null, flower);
    const duration = this.reducedMotion ? 140 : 1000;
    this.paper.style.visibility = "visible";
    const backdrop = this.backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.65, fill: "forwards" });
    const paper = this.paper.animate([
      { opacity: 0, transform: this.reducedMotion ? "none" : "perspective(1100px) translateY(66px) rotateX(7deg) rotateZ(-1.2deg) scale(.94)" },
      { opacity: 1, transform: "perspective(1100px) translateY(0) rotateX(0) rotateZ(0) scale(1)" },
    ], { duration, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
    try {
      await Promise.all([paper.finished, backdrop.finished]);
      if (cycle !== this.cycle || this.status !== "opening") return;
      this.setState("open");
      this.nativeDelay = setTimeout(() => {
        if (cycle === this.cycle && this.status === "open") this.beginTyping();
      }, this.reducedMotion ? 0 : CONFIG.letter.typingDelay * 1000);
    } catch { /* Closing during entrance intentionally cancels the animation. */ }
  }

  beginTyping() {
    if (this.status !== "opening" && this.status !== "open") return;
    this.skip.disabled = false;
    if (this.reducedMotion) { this.finishTyping(); return; }
    this.paper.classList.add("is-typing");
    this.cursor.style.opacity = "0.65";
    const progress = { time: 0 };
    let previousCount = -1;
    const update = () => {
      const count = visibleCharacterCount(this.schedule.times, progress.time);
      if (count !== previousCount) {
        this.text.textContent = this.schedule.segments.slice(0, count).join("");
        previousCount = count;
      }
    };
    if (this.gsap) {
      this.typingTween = this.gsap.to(progress, {
        time: this.schedule.duration, duration: this.schedule.duration, ease: "none",
        onUpdate: update, onComplete: () => this.finishTyping(),
      });
    } else {
      const start = performance.now();
      const cycle = this.cycle;
      const frame = now => {
        if (cycle !== this.cycle || this.status === "closing" || this.status === "closed") return;
        progress.time = (now - start) / 1000;
        update();
        if (progress.time >= this.schedule.duration) this.finishTyping();
        else this.frame = requestAnimationFrame(frame);
      };
      this.frame = requestAnimationFrame(frame);
    }
  }

  finishTyping() {
    if (this.status === "closing" || this.status === "closed") return;
    this.typingTween?.kill();
    cancelAnimationFrame(this.frame);
    this.text.textContent = CONTENT.message;
    this.paper.classList.remove("is-typing");
    if (this.gsap) this.gsap.to(this.cursor, { opacity: 0, duration: 0.35, overwrite: true });
    else this.cursor.style.opacity = "0";
    if (document.activeElement === this.skip) this.closeButton.focus({ preventScroll: true });
    this.skip.hidden = true;
  }

  close() {
    if (this.status === "closed" || this.status === "closing") return;
    const nativeState = this.gsap ? null : {
      paperOpacity: getComputedStyle(this.paper).opacity,
      paperTransform: getComputedStyle(this.paper).transform,
      backdropOpacity: getComputedStyle(this.backdrop).opacity,
    };
    this.cycle += 1;
    this.stopAnimations();
    this.setState("closing");
    this.paper.classList.remove("is-typing");
    this.skip.disabled = true;
    if (!this.gsap) { this.closeNative(nativeState); return; }
    const duration = this.reducedMotion ? 0.14 : CONFIG.letter.closeDuration;
    this.closeTimeline = this.gsap.timeline({ onComplete: () => this.completeClose() });
    this.onBlur(this.closeTimeline);
    this.closeTimeline.to(this.paper, { autoAlpha: 0, y: this.reducedMotion ? 0 : 42, scale: this.reducedMotion ? 1 : 0.97, rotationX: this.reducedMotion ? 0 : -3, duration, ease: "power2.inOut" }, 0);
    this.closeTimeline.to(this.backdrop, { opacity: 0, duration: duration * 0.9, ease: "sine.inOut" }, duration * 0.15);
  }

  async closeNative(current) {
    this.onBlur(null);
    const duration = this.reducedMotion ? 140 : 650;
    const paper = this.paper.animate([{ opacity: current.paperOpacity, transform: current.paperTransform }, { opacity: 0, transform: this.reducedMotion ? "none" : "translateY(36px) scale(.97)" }], { duration, easing: "ease-in-out", fill: "forwards" });
    this.backdrop.animate([{ opacity: current.backdropOpacity }, { opacity: 0 }], { duration, fill: "forwards" });
    try { await paper.finished; } catch { /* A disposed page can cancel animations. */ }
    if (this.status === "closing") this.completeClose();
  }

  completeClose() {
    this.dialog.close();
    this.stopAnimations();
    this.paper.removeAttribute("style");
    this.backdrop.removeAttribute("style");
    document.body.classList.remove("reading-letter");
    this.setState("closed");
    this.previousFocus?.focus?.({ preventScroll: true });
  }

  stopAnimations() {
    this.openTimeline?.kill();
    this.closeTimeline?.kill();
    this.typingTween?.kill();
    clearTimeout(this.nativeDelay);
    cancelAnimationFrame(this.frame);
    this.paper.getAnimations().forEach(animation => animation.cancel());
    this.backdrop.getAnimations().forEach(animation => animation.cancel());
  }

  dispose() {
    this.events.abort();
    this.cycle += 1;
    this.stopAnimations();
    if (this.dialog.open) this.dialog.close();
    document.body.classList.remove("reading-letter");
    this.paper.removeAttribute("style");
    this.backdrop.removeAttribute("style");
  }
}
