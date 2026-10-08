// CAMERA FIX: classic Worker for the WASM importScripts loader; settings arrive from the parent.
let settings;
let tracker;
let lastTimestamp = -Infinity;
const epochNow = () => performance.timeOrigin + performance.now();
// HAPUS SETELAH DEBUG: enabled by the parent only for ?debug=cam.
let debugCam = false;
const debug = (stage, details = {}) => { if (debugCam) self.postMessage({ type: "debug", stage, workerAt: epochNow(), ...details }); };
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    settings = data.settings;
    debugCam = data.debugCam === true; // HAPUS SETELAH DEBUG
    try {
      if (typeof OffscreenCanvas === "undefined") throw new Error("OffscreenCanvas unavailable");
      debug("module.import", { url: settings.moduleUrl });
      const { HandLandmarker, FilesetResolver } = await import(settings.moduleUrl);
      debug("wasm.resolve", { url: settings.wasmRoot });
      const files = await FilesetResolver.forVisionTasks(settings.wasmRoot);
      debug("model.create", { url: settings.modelUrl });
      tracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: settings.modelUrl, delegate: "CPU" },
        canvas: new OffscreenCanvas(1, 1), runningMode: "VIDEO", numHands: 2,
        minHandDetectionConfidence: settings.confidence,
        minHandPresenceConfidence: settings.confidence,
        minTrackingConfidence: settings.confidence,
      });
      debug("initialized");
      self.postMessage({ type: "initialized" });
    } catch (error) {
      self.postMessage({ type: "error", code: "TRACKER_INIT", detail: String(error.message) });
    }
    return;
  }
  if (data.type !== "frame") return;
  const { bitmap, timestamp, id } = data;
  try {
    if (!tracker) throw new Error("Tracker not initialized");
    if (timestamp <= lastTimestamp || epochNow() - timestamp > settings.staleMs) {
      self.postMessage({ type: "dropped", timestamp, id }); return;
    }
    lastTimestamp = timestamp;
    const start = debugCam ? performance.now() : 0; // HAPUS SETELAH DEBUG
    const result = tracker.detectForVideo(bitmap, timestamp);
    self.postMessage({ type: "result", timestamp, id, landmarks: result.landmarks, handedness: result.handedness, ...(debugCam ? { durationMs: performance.now() - start } : {}) });
  } catch (error) {
    self.postMessage({ type: "error", code: "TRACKER_INFERENCE", detail: String(error.message) });
  } finally { bitmap?.close(); }
};
