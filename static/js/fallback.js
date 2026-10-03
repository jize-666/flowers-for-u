import { applyContent } from "./content.js";
import { FLOWERS } from "./config.js";
import { LetterController } from "./letter.js";
import { GardenAudio } from "./audio.js";

/** Local fallback: deliberately labelled, usable without WebGL or CDN access. */
export async function start({ reason = "", gsap = null } = {}) {
  const canvas = document.querySelector("#garden-canvas");
  const stage = document.querySelector("#fallback-stage");
  const image = document.querySelector("#fallback-image");
  canvas.hidden = true;
  stage.hidden = false;
  const positions = await fetch("/static/models/fallback-positions.json").then(response => {
    if (!response.ok) throw new Error("The local garden preview is missing.");
    return response.json();
  });
  const audio = new GardenAudio(gsap);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const letter = new LetterController({ gsap, reducedMotion: motion.matches, onFocus: () => audio.focus(true), onBlur: () => audio.focus(false) });
  const onMotionChange = event => { letter.reducedMotion = event.matches; };
  motion.addEventListener("change", onMotionChange);
  const hotspots = [];
  for (const flower of FLOWERS.filter(item => item.trigger)) {
    const button = document.createElement("button");
    button.className = "fallback-hotspot";
    button.type = "button";
    button.setAttribute("aria-label", `Open the letter hidden in the ${flower.id} flower`);
    button.addEventListener("click", () => letter.open(flower, button));
    document.body.append(button);
    hotspots.push({ button, id: flower.id });
  }

  function resize() {
    const portrait = innerWidth <= 700;
    const preset = positions[portrait ? "mobile" : "desktop"];
    const scale = Math.max(innerWidth / preset.width, innerHeight / preset.height);
    const left = (innerWidth - preset.width * scale) / 2;
    const top = (innerHeight - preset.height * scale) / 2;
    for (const { button, id } of hotspots) {
      const target = preset.flowers.find(item => item.id === id);
      const x = left + target.x * scale;
      const y = top + target.y * scale;
      const size = Math.max(portrait ? 46 : 60, target.radius * scale * 1.75);
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.hidden = x < 0 || x > innerWidth || y < 0 || y > innerHeight;
    }
  }
  window.addEventListener("resize", resize);
  image.addEventListener("load", resize);
  resize();
  applyContent();
  document.body.classList.remove("loading");
  document.body.classList.add("fallback-ready");
  document.querySelector("#skip-intro").hidden = true;
  document.querySelector("#garden-hint").style.visibility = "visible";
  const notice = document.querySelector("#view-notice");
  notice.hidden = false;
  notice.textContent = "Lightweight view · the hidden flowers still hold your letter";
  notice.title = reason;
  const quality = document.querySelector("#quality-select");
  quality.innerHTML = '<option value="fallback">Lightweight</option>';
  quality.disabled = true;
  const pause = document.querySelector("#motion-toggle");
  pause.disabled = true;
  pause.title = "The lightweight garden uses a still image";
  const replay = document.querySelector("#replay-intro");
  replay.disabled = true;
  replay.title = "Growth replay is available in the 3D view";
  document.querySelector("#status-announcement").textContent = "The lightweight garden is ready. The 3D libraries were unavailable, but you can still click the special flowers to read the letter.";
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    window.removeEventListener("resize", resize);
    image.removeEventListener("load", resize);
    motion.removeEventListener("change", onMotionChange);
    letter.dispose();
    audio.dispose();
    hotspots.forEach(({ button }) => button.remove());
  });
  if (new URLSearchParams(location.search).has("debug")) {
    window.__FLOWERS_DEBUG__ = {
      getState: () => ({ phase: letter.status === "closed" ? "exploring" : "letter-open", letter: letter.status, fallback: true }),
      getTargets: () => hotspots.map(({ button, id }) => {
        const rect = button.getBoundingClientRect();
        return { id, trigger: true, visible: !button.hidden, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }),
    };
  }
}
