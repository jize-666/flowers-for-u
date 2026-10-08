// COLLAPSE INTEGRATION: existing garden retained; transition ownership and cleanup added.
import { applyContent } from "./content.js";
import * as THREE from "three";
import { GardenScene } from "./scene.js";
import { FlowerGarden } from "./flowers.js";
import { Atmosphere } from "./atmosphere.js";
import { FlowerInteraction } from "./interaction.js";
import { LetterController } from "./letter.js";
import { GardenAudio } from "./audio.js";
import { GardenExperience } from "./experience.js";
import { GardenCollapse } from "./collapse.js";
import { MultiverseExperience } from "./multiverse.js";
import { CONFIG } from "./config.js";
import { PerformanceMetrics } from "./performance-metrics.js";
import { camLog, watchState } from "./camera-debug.js"; // HAPUS SETELAH DEBUG

export async function start({ progress = () => {} } = {}) {
  const gsap = window.gsap;
  if (!gsap) throw new Error("GSAP was not loaded.");
  const canvas = document.querySelector("#garden-canvas");
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const state = { phase: "loading", quality: matchMedia("(pointer: coarse)").matches || innerWidth < 650 ? "low" : "high", automaticQuality: true, motion: !media.matches };
  watchState(state, "phase", "garden.phase"); // HAPUS SETELAH DEBUG
  let scene, garden, atmosphere, interaction, letter, audio, experience, collapse, multiverse;
  let frame = 0;
  let intro;
  let disposed = false;
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const qualitySelect = document.querySelector("#quality-select");
  const motionButton = document.querySelector("#motion-toggle");
  const replayButton = document.querySelector("#replay-intro");
  const skipButton = document.querySelector("#skip-intro");
  const hint = document.querySelector("#garden-hint");
  const announce = message => { document.querySelector("#status-announcement").textContent = message; };
  const world = new THREE.Vector3();
  const metrics = new PerformanceMetrics();
  let elapsed = 0;
  let last = performance.now();
  let qualityTime = 0;
  let sampleDuration = 0;
  let sampleCount = 0;
  let sampleWarmup = 0;

  function dispose() {
    if (disposed) return;
    camLog("app.dispose", {}, true); // HAPUS SETELAH DEBUG
    disposed = true;
    cancelAnimationFrame(frame);
    intro?.kill();
    listeners.abort();
    experience?.dispose();
    multiverse?.dispose();
    collapse?.dispose();
    interaction?.dispose();
    letter?.dispose();
    audio?.dispose();
    if (!collapse?.gardenDisposed) { garden?.dispose(); atmosphere?.dispose(); }
    scene?.dispose();
  }

  try {
    scene = new GardenScene(canvas, state.quality, media.matches);
    const templates = await FlowerGarden.load(value => progress(0.12 + value * 0.80));
    garden = new FlowerGarden(scene.scene, templates, state.quality, media.matches);
    atmosphere = new Atmosphere(scene.scene, state.quality);
    audio = new GardenAudio(gsap);
    letter = new LetterController({
      gsap, reducedMotion: media.matches,
      onFocus: (timeline, flower) => {
        state.phase = "letter-opening";
        interaction.setHover(null);
        flower.proxy.getWorldPosition(world);
        scene.focus(timeline, world);
        timeline.to(garden.wind, { multiplier: CONFIG.wind.focusMultiplier, duration: 0.8, ease: "sine.inOut" }, 0);
        timeline.to(atmosphere.uniforms.uFocus, { value: 0.45, duration: 0.7 }, 0);
        audio.focus(true);
        replayButton.disabled = true;
      },
      onBlur: timeline => {
        state.phase = "letter-closing";
        scene.restore(timeline);
        timeline.to(garden.wind, { multiplier: 1, duration: 0.8, ease: "sine.inOut" }, 0);
        timeline.to(atmosphere.uniforms.uFocus, { value: 1, duration: 0.8 }, 0);
        audio.focus(false);
      },
      onState: status => {
        if (status === "open") state.phase = "letter-open";
        if (status === "closed") {
          state.phase = "exploring";
          scene.controls.enabled = true;
          replayButton.disabled = false;
          interaction.update();
          announce("Back in the garden.");
        }
      },
    });
    interaction = new FlowerInteraction({
      canvas, camera: scene.camera, garden, gsap,
      canInteract: () => state.phase === "exploring" && !collapse?.active,
      onChoose: (flower, element) => {
        if (state.phase !== "exploring" || collapse?.active || !flower.definition.trigger) return;
        letter.open(flower, element);
      },
    });
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      state.phase = "context-lost";
      cancelAnimationFrame(frame);
      scene.controls.enabled = false;
      letter.dispose();
      // COLLAPSE INTEGRATION: release audio Worker/context on terminal WebGL loss.
      audio.dispose();
      experience?.dispose();
      multiverse?.dispose();
      collapse?.dispose();
      const notice = document.querySelector("#view-notice");
      notice.textContent = "The graphics connection paused. Refresh to return to the garden.";
      notice.hidden = false;
      announce(notice.textContent);
    }, options);
    canvas.addEventListener("webglcontextrestored", () => location.reload(), options);
    window.addEventListener("resize", () => { scene.resize(); if (!collapse?.gardenDisposed) atmosphere.setQuality(state.quality); }, options);
    window.addEventListener("pointermove", event => {
      scene.pointer.x = event.clientX / innerWidth * 2 - 1;
      scene.pointer.y = -(event.clientY / innerHeight * 2 - 1);
    }, { ...options, passive: true });
    window.addEventListener("blur", () => { scene.pointer.x = 0; scene.pointer.y = 0; }, options);
    document.addEventListener("visibilitychange", () => {
      last = performance.now();
      sampleDuration = 0;
      sampleCount = 0;
    }, options);
    window.addEventListener("pagehide", event => { if (!event.persisted) dispose(); }, options);

    function applyQuality(name, automatic = false) {
      state.quality = name;
      scene.setQuality(name);
      if (!collapse?.active) { garden.setQuality(name, gsap); atmosphere.setQuality(name); }
      collapse?.setQuality(name);
      multiverse?.setQuality(name);
      qualityTime = elapsed;
      sampleDuration = 0;
      sampleCount = 0;
      qualitySelect.querySelector('[value="auto"]').textContent = state.automaticQuality ? `Auto · ${name}` : "Auto";
      if (automatic) announce(`Using ${name} quality for a smoother garden.`);
    }

    qualitySelect.addEventListener("change", () => {
      state.automaticQuality = qualitySelect.value === "auto";
      const selected = state.automaticQuality ? (matchMedia("(pointer: coarse)").matches ? "low" : "high") : qualitySelect.value;
      applyQuality(selected);
    }, options);

    function updateMotionButton() {
      motionButton.setAttribute("aria-pressed", String(!state.motion));
      motionButton.setAttribute("aria-label", state.motion ? "Pause garden motion" : "Resume garden motion");
      motionButton.title = state.motion ? "Pause motion" : "Resume motion";
      letter.reducedMotion = media.matches || !state.motion;
    }
    motionButton.addEventListener("click", () => { state.motion = !state.motion; updateMotionButton(); }, options);
    media.addEventListener("change", event => {
      state.motion = !event.matches;
      garden.reducedMotion = event.matches;
      scene.reducedMotion = event.matches;
      updateMotionButton();
      if (event.matches && state.phase === "intro") intro?.progress(1);
    }, options);
    updateMotionButton();

    function finishIntro() {
      if (disposed || collapse?.active) return;
      camLog("bloom.finished", {}, true); // HAPUS SETELAH DEBUG
      state.phase = "exploring";
      scene.controls.enabled = true;
      replayButton.disabled = false;
      motionButton.disabled = false;
      skipButton.hidden = true;
      gsap.to(hint, { autoAlpha: 1, duration: media.matches ? 0.1 : 0.9 });
      announce("The garden is ready. Some flowers hold a hidden note. Explore with your mouse, or use Tab to find them.");
      sampleWarmup = elapsed;
    }

    function playIntro(replay = false) {
      if (disposed || collapse?.active) return;
      state.phase = "intro";
      scene.controls.enabled = false;
      replayButton.disabled = true;
      motionButton.disabled = true;
      skipButton.hidden = media.matches;
      gsap.set(hint, { autoAlpha: 0 });
      intro?.kill();
      intro = gsap.timeline({ onComplete: finishIntro });
      const start = replay ? 0.42 : 0;
      if (replay) {
        intro.to(canvas, { opacity: 0, duration: 0.35 }, 0);
        intro.call(() => {
          garden.flowers.forEach(flower => {
            flower.uniforms.uStem.value = 0.0001;
            flower.uniforms.uLeaves.value = 0;
            flower.uniforms.uBloom.value = 0;
          });
          atmosphere.grassGrowth.value = 0.001;
        }, [], 0.36);
        intro.to(canvas, { opacity: 1, duration: 0.8 }, start);
      } else {
        gsap.set(".hero-word, .hero-eyebrow, .hero-subtitle, .hero-rule", { autoAlpha: 0, y: media.matches ? 0 : 14 });
        intro.to(".hero-word", { autoAlpha: 1, y: 0, duration: 1.8, stagger: 0.18, ease: "power3.out" }, 0.35);
        intro.to(".hero-eyebrow, .hero-subtitle, .hero-rule", { autoAlpha: 1, y: 0, duration: 1.6, stagger: 0.13, ease: "sine.out" }, 0.65);
        if (!media.matches) {
          scene.camera.position.z += 1.0;
          intro.to(scene.camera.position, { z: CONFIG.camera.z, duration: 6.2, ease: "sine.inOut", onUpdate: () => scene.camera.lookAt(scene.controls.target) }, 0);
        }
      }
      garden.grow(intro, start + 0.20);
      intro.to(atmosphere.grassGrowth, { value: 1, duration: 3.8, ease: "sine.inOut" }, start + 0.3);
      intro.to(atmosphere.uniforms.uOpacity, { value: 1, duration: 3 }, start + 0.15);
      if (media.matches) intro.progress(1);
    }
    replayButton.addEventListener("click", () => { if (state.phase === "exploring") playIntro(true); }, options);
    skipButton.addEventListener("click", () => { if (state.phase === "intro") intro?.progress(1); }, options);

    function render(now) {
      if (disposed || state.phase === "context-lost") return;
      frame = requestAnimationFrame(render);
      const rawDelta = Math.max(0, (now - last) / 1000);
      last = now;
      experience?.tick();
      audio.update();
      collapse?.update(rawDelta * 1000);
      scene.observeFrame(rawDelta*1000,now,experience?.sceneState.state??"garden_intro");
      if (document.hidden) return;
      const delta = Math.min(rawDelta, 0.05);
      multiverse?.update(delta);
      if (state.motion && !collapse?.active) elapsed += delta;
      if (!collapse?.gardenDisposed) { garden.update(elapsed); atmosphere.update(elapsed, media.matches); }
      scene.update(delta, state.motion);
      if (!collapse?.active) interaction.update();
      scene.render(delta);
      if(experience){
        const audioStatus=audio.snapshot(),tracking=experience.tracker.snapshot();
        let stage=experience.sceneState.state;
        if(stage==="garden_break"&&collapse.clock.time>=collapse.schedule.destructionStart&&collapse.clock.time<collapse.schedule.pullStart)stage="peak_collapse";
        metrics.record(stage,rawDelta*1000,{audioActive:audioStatus.active,trackingActive:tracking.inferenceActive,visible:!document.hidden});
      }
      if (state.automaticQuality && state.motion && state.phase === "exploring" && elapsed - sampleWarmup > 8 && elapsed - qualityTime > 12) {
        sampleDuration += Math.min(rawDelta, 0.15);
        sampleCount += 1;
        if (sampleCount >= 180) {
          if (sampleDuration / sampleCount > 0.029 && state.quality !== "low") applyQuality(state.quality === "high" ? "medium" : "low", true);
          sampleDuration = 0;
          sampleCount = 0;
        }
      }
    }

    // Warm up materials before removing the loading veil.
    garden.update(0);
    scene.scene.updateMatrixWorld(true);
    if (scene.renderer.compileAsync) await scene.renderer.compileAsync(scene.scene, scene.camera);
    progress(1);
    applyContent();
    collapse = new GardenCollapse({
      scene, garden, atmosphere, audio, gsap, quality: state.quality,
      onState: next => { experience.sceneState.advance(next); },
      onGardenDisposed: () => { state.phase = "cinematic"; },
      onHandoff: () => { state.phase = "arrival"; multiverse.beginArrival(); },
    });
    multiverse = new MultiverseExperience({scene,collapse,audio,quality:state.quality,onInteractive:()=>{
      experience.sceneState.advance("multiverse_interaction");experience.tracker.resetEpoch();state.phase="multiverse";
    }});
    experience = new GardenExperience({ audio, hint,
      canCommit: () => state.phase === "exploring" && letter.status === "closed" && !collapse.active,
      onHands:(sample,now)=>multiverse.sample(sample,now),onTrackingLost:()=>multiverse.lose(),onCommit: () => {
      intro?.kill();
      gsap.killTweensOf(canvas); gsap.set(canvas, { opacity: 1 });
      // Stop conflicting garden/letter tweens while preserving the current camera pose.
      interaction.setHover(null);
      letter.dispose(); interaction.dispose();
      garden.flowers.forEach(flower => Object.values(flower.uniforms).forEach(uniform => gsap.killTweensOf(uniform)));
      gsap.killTweensOf(garden.wind); gsap.killTweensOf(scene.camera.position);
      gsap.killTweensOf(scene.controls.target); gsap.killTweensOf(scene.parallax);
      replayButton.disabled = true; motionButton.disabled = true; skipButton.hidden = true;
      state.phase = "cinematic";
      collapse.start();
      multiverse.connectTimeline(collapse.timeline);
    } });
    void experience.start(async () => { await collapse.prewarm(); await multiverse.prewarm(); });
    document.body.classList.remove("loading");
    gsap.to("#loading-screen", { autoAlpha: 0, duration: 0.65, onComplete: () => { document.querySelector("#loading-screen").hidden = true; } });
    playIntro();
    last = performance.now();
    frame = requestAnimationFrame(render);

    if (new URLSearchParams(location.search).has("debug")) {
      window.__FLOWERS_DEBUG__ = {
        getState: () => ({ ...state, experience: experience.snapshot(), collapse: collapse.snapshot(), multiverse: multiverse.snapshot(), audio:audio.snapshot(),tracking:experience.tracker.snapshot(),renderBudget:scene.performanceSnapshot(),letter: collapse.active ? "closed" : letter.status, drawCalls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles }),
        getPerformance: () => metrics.report({userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],quality:state.quality,render:scene.performanceSnapshot(),audio:audio.snapshot(),tracking:experience.tracker.snapshot()}),
        getTargets: () => collapse.gardenDisposed ? [] : garden.flowers.map(flower => {
          const p = flower.proxy.getWorldPosition(new THREE.Vector3()).project(scene.camera);
          return { id: flower.definition.id, trigger: Boolean(flower.definition.trigger), visible: flower.proxy.userData.pickable, x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
        }),
      };
    }
    return { dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
