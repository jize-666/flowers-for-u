import * as THREE from "three";
import { isIntentionalClick } from "./utils.js";

export class FlowerInteraction {
  constructor({ canvas, camera, garden, canInteract, onChoose, gsap }) {
    Object.assign(this, { canvas, camera, garden, canInteract, onChoose, gsap });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(10, 10);
    this.mouse = { x: -100, y: -100 };
    this.projected = new THREE.Vector3();
    this.hovered = null;
    this.down = null;
    this.pointers = new Set();
    this.multiTouch = false;
    this.blockUntil = 0;
    this.abortController = new AbortController();
    const options = { signal: this.abortController.signal };
    canvas.addEventListener("pointerdown", event => this.pointerDown(event), options);
    canvas.addEventListener("pointerup", event => this.pointerUp(event), options);
    canvas.addEventListener("pointermove", event => {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
      if (this.down?.id === event.pointerId) {
        this.down.maxDistance = Math.max(this.down.maxDistance,
          Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y));
      }
    }, options);
    canvas.addEventListener("pointerleave", () => { this.mouse.x = -100; this.mouse.y = -100; this.setHover(null); }, options);
    canvas.addEventListener("pointercancel", event => { this.pointers.delete(event.pointerId); this.down = null; if (!this.pointers.size) this.multiTouch = false; }, options);
    canvas.addEventListener("wheel", () => { this.blockUntil = performance.now() + 350; }, { ...options, passive: true });
    window.addEventListener("pointerup", event => {
      if (event.target !== canvas) { this.pointers.delete(event.pointerId); this.down = null; }
      if (!this.pointers.size) this.multiTouch = false;
    }, options);
    this.buttons = new Map();
    const container = document.querySelector("#flower-accessibility");
    garden.flowers.filter(flower => flower.definition.trigger).forEach(flower => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flower-accessible";
      button.textContent = "Read the hidden note";
      button.setAttribute("aria-label", `Open the letter hidden in the ${flower.definition.id} flower`);
      button.disabled = true;
      button.addEventListener("click", () => {
        if (this.canInteract() && flower.proxy.userData.pickable) this.onChoose(flower, button);
      }, options);
      container.append(button);
      this.buttons.set(flower.definition.id, button);
    });
  }

  pick(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.garden.pickTargets.filter(target => target.userData.pickable), false);
    // Decorative flowers occlude triggers too. Do not click through the first hit.
    return hits[0]?.object.userData.flower ?? null;
  }

  pointerDown(event) {
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) { this.multiTouch = true; this.down = null; return; }
    if (event.button !== 0 || !this.canInteract()) return;
    this.down = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), maxDistance: 0, flower: this.pick(event.clientX, event.clientY) };
  }

  pointerUp(event) {
    const hadMultipleTouches = this.multiTouch;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) this.multiTouch = false;
    const end = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    const start = this.down;
    this.down = null;
    const threshold = event.pointerType === "touch" ? 12 : 7;
    if (hadMultipleTouches || !this.canInteract() || end.time < this.blockUntil || !isIntentionalClick(start, end, threshold)) return;
    const chosen = this.pick(end.x, end.y);
    if (chosen?.definition.trigger && chosen === start.flower) {
      this.setHover(null);
      this.onChoose(chosen, this.canvas);
    }
  }

  setHover(flower) {
    const target = flower?.definition.trigger ? flower : null;
    if (target === this.hovered) return;
    this.hovered = target;
    this.garden.hover(target, this.gsap);
    this.canvas.style.cursor = target ? "pointer" : "grab";
    document.querySelector("#cursor-glow").classList.toggle("is-visible", Boolean(target));
  }

  update() {
    const available = this.canInteract();
    if (matchMedia("(pointer: fine)").matches) this.setHover(available ? this.pick(this.mouse.x, this.mouse.y) : null);
    const glow = document.querySelector("#cursor-glow");
    glow.style.transform = `translate(${this.mouse.x}px, ${this.mouse.y}px)`;
    for (const flower of this.garden.flowers) {
      const button = this.buttons.get(flower.definition.id);
      if (!button) continue;
      flower.proxy.getWorldPosition(this.projected);
      this.projected.project(this.camera);
      button.disabled = !available || !flower.proxy.userData.pickable || (this.projected.z > 1 || this.projected.z < -1) || Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1;
      button.style.left = `${(this.projected.x * 0.5 + 0.5) * innerWidth}px`;
      button.style.top = `${(-this.projected.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }

  dispose() {
    this.abortController.abort();
    this.buttons.forEach(button => button.remove());
  }
}
