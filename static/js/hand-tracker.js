import { CONFIG } from "./config.js";
import { handFeatures } from "./hand-features.js";
import { camDebugEnabled, camLog, cameraSnapshot } from "./camera-debug.js"; // HAPUS SETELAH DEBUG
export const trackingNow = () => performance.timeOrigin + performance.now();

/** One in-flight frame. Camera pixels never leave the browser. No main-thread inference. */
export class HandTracker {
  constructor({ onSample, onReady, onError, onLost, onHands = () => {} }) {
    Object.assign(this, { onSample, onReady, onError, onLost, onHands });
    this.tracks = [];
    this.events = new AbortController();
    this.stopped = false;
    this.busy = false;
    this.sequence = 0;
    this.identity = 0;
    this.resultTimes=[];this.lastResultAt=null;this.completed=0;
    this.lastCapture = -Infinity;
    this.lastVideoTime = -1;
    this.previous = null;
    this.minimumTimestamp = -Infinity;
    this.settings = CONFIG.handTracking;
    this.cameraPermissionGranted = false;
    // HAPUS SETELAH DEBUG: independent heartbeat also shows a stalled render loop.
    if (camDebugEnabled) this.debugTimer = setInterval(() => camLog("tracker.heartbeat", { ...this.snapshot(), ...cameraSnapshot(this.stream, this.video), initialized: !!this.initialized, rawLastInferenceAgeMs: this.debugLastInference == null ? null : trackingNow() - this.debugLastInference, rawResultsLastSecond: (this.debugResults || []).filter(time => trackingNow() - time <= 1000).length }), 1000);
    document.addEventListener("visibilitychange", () => {
      this.previous = null;
      this.tracks = [];
      this.minimumTimestamp = trackingNow();
      this.onLost();
    }, { signal: this.events.signal });
  }
  async start() {
    if (this.started || this.stopped) return;
    this.started = true;
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { code: "CAMERA_UNAVAILABLE" });
      if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") throw Object.assign(new Error(), { code: "WORKER_UNSUPPORTED" });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
      if (this.stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.cameraPermissionGranted = true;
      this.video = document.createElement("video");
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", () => this.fail("CAMERA_ENDED"), { signal: this.events.signal });
        track.addEventListener("mute", () => { this.previous = null; this.tracks = []; this.onReady("cameraReady", false); this.onLost(); }, { signal: this.events.signal });
        track.addEventListener("unmute", () => this.onReady("cameraReady", true), { signal: this.events.signal });
      }
      // Also covers a camera/video implementation whose play promise never settles.
      this.startupTimer = setTimeout(() => this.fail("TRACKER_TIMEOUT", "startup: no accepted inference before deadline"), this.settings.startupTimeoutMs);
      await this.video.play();
      if (this.stopped) return;
      this.onReady("cameraReady", true);
      // CAMERA FIX: MediaPipe's WASM loader uses importScripts, which module Workers reject.
      this.worker = new Worker(new URL("./hand-worker.js", import.meta.url));
      this.worker.onerror = event => this.fail("WORKER_FAILED", `${event.message || "worker error"} ${event.filename || ""}:${event.lineno || ""}`);
      this.worker.onmessageerror = () => this.fail("WORKER_FAILED", "messageerror: worker response could not be decoded");
      this.worker.onmessage = event => this.receive(event.data);
      this.worker.postMessage({ type: "init", settings: this.settings, debugCam: camDebugEnabled }); // HAPUS SETELAH DEBUG: debugCam
    } catch (error) {
      const code = error.code || ({ NotAllowedError: "CAMERA_DENIED", NotFoundError: "CAMERA_MISSING", NotReadableError: "CAMERA_BUSY" }[error.name]) || "CAMERA_FAILED";
      this.fail(code, `${error.name}: ${error.message}`);
    }
  }
  receive(data) {
    if (this.stopped) return;
    if (data.type === "debug") { camLog("worker.stage", data); return; } // HAPUS SETELAH DEBUG
    if (data.type === "error") { this.fail(data.code, data.detail); return; }
    if (data.type === "initialized") {
      this.initialized = true;
      camLog("worker.initialized"); // HAPUS SETELAH DEBUG
      // Readiness requires a successful real inference, not just a loaded model.
      return;
    }
    if (!["result", "dropped"].includes(data.type) || data.id !== this.pending) return;
    this.busy = false;
    this.pending = null;
    clearTimeout(this.inferenceTimer);
    const now = trackingNow();
    // HAPUS SETELAH DEBUG: raw completions include stale/empty results, unlike trigger-ready samples.
    if (camDebugEnabled) {
      this.debugResults = (this.debugResults || []).filter(time => now - time <= 1000);
      this.debugResults.push(now); this.debugLastInference = now;
    }
    camLog("inference.result", { type: data.type, sampleAgeMs: now - data.timestamp, rawHands: data.landmarks?.length ?? 0, workerDurationMs: data.durationMs ?? null }); // HAPUS SETELAH DEBUG
    if (data.type === "dropped" || document.hidden || !Number.isFinite(data.timestamp) || data.timestamp > now || data.timestamp < this.minimumTimestamp || now - data.timestamp > this.settings.staleMs) {
      camLog("tracking.rejected", { sampleAgeMs: now - data.timestamp, handValid: false, gesture: "UNKNOWN", reason: "dropped/hidden/invalid timestamp/epoch/stale", hidden: document.hidden, minimumTimestamp: this.minimumTimestamp }); // HAPUS SETELAH DEBUG
      this.previous = null; this.tracks = []; this.onLost(); return;
    }
    clearTimeout(this.startupTimer);
    this.lastResultAt=now;this.completed++;this.resultTimes.push(now);
    while(this.resultTimes.length&&now-this.resultTimes[0]>1000)this.resultTimes.shift();
    this.onReady("trackerReady", true);
    const available = [];
    const nextTracks = [];
    for (let i=0;i<(data.landmarks?.length || 0);i++) {
      const points=data.landmarks[i], label=data.handedness?.[i]?.[0],wrist=points?.[0];
      if(!label||!Number.isFinite(label.score)||label.score<this.settings.confidence||!wrist)continue;
      const matches=this.tracks.filter(track=>track.label===label.categoryName && !nextTracks.some(next=>next.id===track.id) && data.timestamp-track.timestamp<=this.settings.staleMs)
        .map(track=>({track,d:Math.hypot(wrist.x-track.x,wrist.y-track.y)})).sort((a,b)=>a.d-b.d);
      const match=matches[0];
      const id=match&&match.d<=this.settings.identityMaxDistance?match.track.id:++this.identity;
      const hand=handFeatures(points,id);if(!hand)continue;
      nextTracks.push({id,label:label.categoryName,x:wrist.x,y:wrist.y,timestamp:data.timestamp});
      available.push(hand);
    }
    this.tracks=nextTracks;
    camLog("tracking.result", { sampleAgeMs: now - data.timestamp, handValid: available.length > 0, gesture: available.length === 1 ? available[0].pose : "UNKNOWN", validHands: available.length }); // HAPUS SETELAH DEBUG
    if(!available.length){this.previous=null;this.onLost();return;}
    this.onHands({hands:available,timestamp:data.timestamp},now);
    // Garden trigger still accepts exactly one hand; a second hand cannot inherit its hold.
    if(available.length===1){
      const hand=available[0];this.onSample({gesture:hand.pose,timestamp:data.timestamp,handId:hand.id},now);
    } else this.onSample({gesture:"UNKNOWN",timestamp:data.timestamp,handId:null},now);
  }
  resetEpoch() {
    this.tracks=[];this.previous=null;this.minimumTimestamp=trackingNow();this.onLost();
  }
  snapshot(now=trackingNow()) {
    const recent=this.resultTimes.filter(time=>now-time<=1000).length;
    return {running:!this.stopped&&Boolean(this.initialized&&this.stream),inferenceActive:!this.stopped&&this.lastResultAt!==null&&now-this.lastResultAt<=250,
      lastResultAgeMs:this.lastResultAt===null?null:now-this.lastResultAt,resultsLastSecond:recent,completed:this.completed,inFlight:this.busy,backend:"MediaPipe Worker"};
  }

  tick(now = trackingNow()) {
    if (this.stopped || !this.initialized || this.busy || document.hidden || this.video.readyState < 2) return;
    if (now - this.lastCapture < 1000 / this.settings.inferenceHz || this.video.currentTime === this.lastVideoTime) return;
    this.lastCapture = now;
    this.lastVideoTime = this.video.currentTime;
    this.busy = true;
    const id = ++this.sequence;
    this.pending = id;
    this.inferenceTimer = setTimeout(() => this.fail("TRACKER_TIMEOUT", "frame: inference deadline exceeded"), this.settings.inferenceTimeoutMs);
    createImageBitmap(this.video).then(bitmap => {
      if (this.stopped || document.hidden || trackingNow() - now > this.settings.staleMs) {
        bitmap.close(); this.busy = false; this.pending = null;
        clearTimeout(this.inferenceTimer);
        this.onLost(); return;
      }
      try { this.worker.postMessage({ type: "frame", id, timestamp: now, bitmap }, [bitmap]); }
      catch (error) { bitmap.close(); this.fail("WORKER_FAILED", error.message); }
    }).catch(error => this.fail("FRAME_FAILED", error.message));
  }
  fail(code, detail = "") {
    if (this.stopped) return;
    camLog("tracker.fail", { code, detail, ...cameraSnapshot(this.stream, this.video) }, true); // HAPUS SETELAH DEBUG
    this.onReady("cameraReady", false);
    this.onReady("trackerReady", false);
    this.onLost();
    this.onError(code, detail);
    this.dispose();
  }
  dispose() {
    if(this.cleaned)return;this.cleaned=true;
    camLog("tracker.dispose", {}, true); // HAPUS SETELAH DEBUG
    clearInterval(this.debugTimer); // HAPUS SETELAH DEBUG
    this.stopped = true;
    clearTimeout(this.startupTimer);
    clearTimeout(this.inferenceTimer);
    this.events.abort();
    this.worker?.terminate();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.previous = null;
    this.tracks=[];this.resultTimes=[];this.lastResultAt=null;this.busy=false;this.pending=null;
    this.stream=this.video=this.worker=null;
  }
}
