const loading = document.querySelector("#loading-screen");
const progressElement = document.querySelector("#asset-progress");
const progress = value => { progressElement.value = Math.max(progressElement.value, Math.min(1, value)); };

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error("Animation library could not be downloaded.")); };
    document.head.append(script);
  });
}

async function start() {
  try {
    if (new URLSearchParams(location.search).has("fallback")) throw new Error("Lightweight view requested.");
    let vendored = false;
    try {
      const response = await fetch("/static/vendor/manifest.json");
      if (response.ok) {
        const manifest = await response.json();
        vendored = manifest.installed === true && manifest.three === "0.180.0" && manifest.gsap === "3.13.0";
      }
    } catch { /* A CDN build does not require local vendor files. */ }
    const base = vendored ? "/static/vendor/three/" : "https://cdn.jsdelivr.net/npm/three@0.180.0/";
    const map = document.createElement("script");
    map.type = "importmap";
    map.textContent = JSON.stringify({ imports: { three: `${base}build/three.module.js`, "three/addons/": `${base}examples/jsm/` } });
    document.head.append(map);
    const gsapPath = vendored ? "/static/vendor/gsap/gsap.min.js" : "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js";
    await withTimeout(loadScript(gsapPath), 12000, "The animation library took too long to load.");
    progress(0.08);
    const app = await withTimeout(import("./main.js"), 20000, "The 3D library took too long to load.");
    await app.start({ progress });
  } catch (error) {
    console.warn("Flowers For You: starting the local lightweight view.", error.message);
    const fallback = await import("./fallback.js");
    await fallback.start({ reason: error.message, gsap: window.gsap ?? null });
    progress(1);
    loading.hidden = true;
  }
}

start().catch(error => {
  console.error(error);
  loading.querySelector(".loading-title").textContent = "The garden needs a fresh start.";
  loading.querySelector(".loading-caption").textContent = "PLEASE REFRESH THIS PAGE";
});
