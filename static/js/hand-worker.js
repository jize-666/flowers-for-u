import { CONFIG } from "./config.js";
let tracker;
let lastTimestamp = -Infinity;
const epochNow = () => performance.timeOrigin + performance.now();
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      if (typeof OffscreenCanvas === "undefined") throw new Error("OffscreenCanvas unavailable");
      const { HandLandmarker, FilesetResolver } = await import(CONFIG.handTracking.moduleUrl);
      const files = await FilesetResolver.forVisionTasks(CONFIG.handTracking.wasmRoot);
      tracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: CONFIG.handTracking.modelUrl, delegate: "CPU" },
        canvas: new OffscreenCanvas(1, 1), runningMode: "VIDEO", numHands: 2,
        minHandDetectionConfidence: CONFIG.handTracking.confidence,
        minHandPresenceConfidence: CONFIG.handTracking.confidence,
        minTrackingConfidence: CONFIG.handTracking.confidence,
      });
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
    if (timestamp <= lastTimestamp || epochNow() - timestamp > CONFIG.handTracking.staleMs) {
      self.postMessage({ type: "dropped", timestamp, id }); return;
    }
    lastTimestamp = timestamp;
    const result = tracker.detectForVideo(bitmap, timestamp);
    self.postMessage({ type: "result", timestamp, id, landmarks: result.landmarks, handedness: result.handedness });
  } catch (error) {
    self.postMessage({ type: "error", code: "TRACKER_INFERENCE", detail: String(error.message) });
  } finally { bitmap?.close(); }
};
