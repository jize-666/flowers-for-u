import { CONFIG } from "./config.js";
import { ExperienceState, TransitionReadiness, CollapseTrigger } from "./experience-state.js";
import { HandTracker, trackingNow } from "./hand-tracker.js";
import { camDebugEnabled, camLog } from "./camera-debug.js"; // HAPUS SETELAH DEBUG

const errors = {
  CAMERA_DENIED: "Izin kamera ditolak. Izinkan kamera di pengaturan situs lalu refresh.",
  CAMERA_MISSING: "Kamera tidak ditemukan. Hubungkan kamera lalu refresh.",
  CAMERA_BUSY: "Kamera tidak dapat dibaca atau sedang dipakai aplikasi lain.",
  CAMERA_UNAVAILABLE: "Kamera membutuhkan HTTPS atau localhost dan browser yang mendukungnya.",
  CAMERA_ENDED: "Kamera terputus. Garden tetap aman; refresh untuk mencoba lagi.",
  CAMERA_FAILED: "Kamera gagal dimulai. Periksa izin kamera lalu refresh.",
  WORKER_UNSUPPORTED: "Browser tidak mendukung tracking Worker. Garden tetap aman.",
  WORKER_FAILED: "Worker tracking gagal. Inferensi tidak dipindahkan ke main thread.",
  TRACKER_INIT: "Model atau Worker tracker gagal dimuat. Periksa jaringan/browser lalu refresh.",
  TRACKER_INFERENCE: "Inferensi tracker gagal di Worker. Garden tetap aman.",
  TRACKER_TIMEOUT: "Tracker tidak merespons tepat waktu. Periksa jaringan/browser lalu refresh.",
  FRAME_FAILED: "Frame kamera tidak dapat dibaca. Garden tetap aman.",
};
const instruction = "Izinkan kamera. Buka telapak untuk bersiap, lalu kepalkan dan tahan 1 detik untuk menghancurkan garden menuju multiverse.";

export class GardenExperience {
  constructor({ audio, hint, canCommit = () => true, onCommit = () => {}, onHands = () => {}, onTrackingLost = () => {} }) {
    this.audio = audio;
    this.hint = hint.querySelector("span");
    this.readiness = new TransitionReadiness();
    this.sceneState = new ExperienceState();
    this.canCommit = canCommit;
    this.cameraRecoveries = 0;
    this.trigger = new CollapseTrigger({
      holdMs: CONFIG.collapse.holdMs, staleMs: CONFIG.handTracking.staleMs,
      ready: () => !this.disposed && !document.hidden && canCommit() && this.readiness.ready,
      commit: () => {
        if (this.sceneState.commit()) { this.tracker.resetEpoch(); onCommit(); }
      },
    });
    this.trackerCallbacks = {
      onSample: (sample, now) => {
        if (camDebugEnabled) this.debugHand = sample; // HAPUS SETELAH DEBUG
        if(this.sceneState.state === "garden_intro") this.trigger.sample(sample, now);
        // HAPUS SETELAH DEBUG
        camLog("tracking.sample", { sampleAgeMs: now - sample.timestamp, handValid: sample.handId !== null, gesture: sample.gesture, substate: this.trigger.status });
        this.debugConditions(now);
      },
      onHands: (sample, now) => { if(this.sceneState.state === "multiverse_interaction") onHands(sample, now); },
      onReady: (name, ready) => {
        this.readiness.set(name, ready); this.trigger.tick(trackingNow());
        if (name === "trackerReady" && ready && this.recoveringCamera) { this.recoveringCamera = false; this.error = null; }
        camLog("readiness", { name, ready }); // HAPUS SETELAH DEBUG
      },
      onLost: () => {
        this.debugHand = null; // HAPUS SETELAH DEBUG
        this.trigger.cancel(); onTrackingLost();
        camLog("tracking.lost", { handValid: false, gesture: "UNKNOWN", substate: this.trigger.status }); // HAPUS SETELAH DEBUG
      },
      onError: (code, detail) => {
        this.error = errors[code] || errors.WORKER_FAILED;
        console.warn("Flowers For You tracking:", code, detail);
        // CAMERA FIX: one controlled retry for an unexpectedly ended stream, never for model errors.
        // Run after HandTracker.fail has disposed the old instance. No timer or auto-collapse.
        if (code === "CAMERA_ENDED" && !this.disposed && this.cameraRecoveries === 0) {
          this.cameraRecoveries++;
          this.recoveryPending = true;
          this.error = "Kamera terputus. Mencoba menyambungkan kembali sekali.";
          queueMicrotask(() => this.recoverCamera());
        }
        this.updateHint();
      },
    };
    this.tracker = new HandTracker(this.trackerCallbacks);
    this.events = new AbortController();
    document.addEventListener("visibilitychange", () => { this.trigger.cancel(); this.recoverCamera(); }, { signal: this.events.signal });
    // HAPUS SETELAH DEBUG
    if (camDebugEnabled) this.debugTimer = setInterval(() => this.debugConditions(trackingNow(), true), 1000);
  }
  recoverCamera() {
    if (!this.recoveryPending || this.disposed || document.hidden) return;
    this.recoveryPending = false;
    this.recoveringCamera = true;
    this.trigger.cancel();
    this.tracker.dispose();
    this.tracker = new HandTracker(this.trackerCallbacks);
    camLog("camera.recovery", { attempt: this.cameraRecoveries }, true); // HAPUS SETELAH DEBUG
    void this.tracker.start();
  }
  // HAPUS SETELAH DEBUG
  debugConditions(now, force = false) {
    if (!camDebugEnabled) return;
    const flags = this.readiness.snapshot();
    const conditions = { sceneState: this.sceneState.state, cameraPermissionGranted: this.tracker.cameraPermissionGranted,
      ...flags, ...this.trigger.debugSnapshot(now), collapseAlreadyCommitted: this.sceneState.commits > 0,
      gardenLetterGate: this.canCommit(), visible: !document.hidden, disposed: !!this.disposed };
    conditions.currentHandValid = !!this.debugHand && this.debugHand.handId !== null && now - this.debugHand.timestamp <= CONFIG.handTracking.staleMs;
    conditions.fistHoldSatisfied = conditions.continuousFistHoldMs >= CONFIG.collapse.holdMs;
    const serialized = JSON.stringify(conditions);
    if (force || serialized !== this.debugLast) {
      camLog("canCommitCollapse", conditions);
      this.debugLast = serialized;
    }
  }
  async start(prepare) {
    this.updateHint();
    // Independent from garden loading: failures never trigger the fallback renderer.
    void this.tracker.start();
    try { await this.readiness.prewarm(prepare); }
    catch (error) { camLog("prewarm.error", { error: String(error), stack: error.stack }); this.error = "Prewarm transisi gagal. Garden tetap aman."; }
    if (!this.disposed) this.updateHint();
  }
  updateHint() {
    if (this.sceneState.state === "multiverse_interaction") {
      const text = this.error || this.audio.runtimeError || this.audio.activationError || "Buka telapak untuk membangunkan semesta. Pinch untuk menggenggam, lepas untuk bercabang; kepalkan 1 detik, swipe, atau jauhkan dua tangan.";
      if(this.hint.textContent!==text)this.hint.textContent=text;
      return;
    }
    if (this.sceneState.state !== "garden_intro") {
      const error=this.error||this.audio.runtimeError||this.audio.activationError;
      if(error){this.hint.textContent=error;this.hint.parentElement.style.opacity="1";this.hint.parentElement.style.visibility="visible";}
      return;
    }
    const status = this.error || this.audio.runtimeError || this.audio.activationError || this.audio.criticalError ||
      (!this.audio.context ? "Aktifkan audio melalui tombol sound." :
        !this.readiness.ready ? "Menyiapkan kamera, tracker, dan resource transisi." : "");
    const text = status ? `${instruction} ${status}` : instruction;
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }
  tick() {
    if (this.disposed) return;
    if(this.sceneState.state === "multiverse_interaction") { this.tracker.tick(trackingNow()); this.updateHint(); return; }
    if(this.sceneState.state !== "garden_intro") { this.tracker.tick(trackingNow());this.updateHint();return; }
    const now = trackingNow();
    this.readiness.set("audioReady", this.audio.criticalReady);
    this.trigger.tick(now);
    if (camDebugEnabled) this.debugConditions(now); // HAPUS SETELAH DEBUG
    this.tracker.tick(now);
    this.updateHint();
  }
  snapshot() {
    return { state: this.sceneState.state, trigger: this.trigger.status, commits: this.sceneState.commits, ...this.readiness.snapshot(), error: this.error || null };
  }
  dispose() {
    this.disposed = true;
    this.recoveryPending = false;
    clearInterval(this.debugTimer); // HAPUS SETELAH DEBUG
    this.events.abort();
    this.tracker.dispose();
    this.readiness.invalidate();
    this.trigger.cancel();
  }
}
