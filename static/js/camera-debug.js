// HAPUS SETELAH DEBUG: all instrumentation is disabled unless ?debug=cam.
export const camDebugEnabled = typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "cam";
const records = [];
export function camLog(event, details = {}, trace = false) {
  if (!camDebugEnabled) return;
  const entry = { at: new Date().toISOString(), ms: performance.now(), event, ...details };
  if (trace) entry.stack = new Error(event).stack;
  records.push(entry);
  if (records.length > 4000) records.shift();
  console.debug("[cam]", JSON.stringify(entry));
  if (trace) console.trace(`[cam] ${event}`);
}
export function cameraSnapshot(stream, video) {
  return { streamActive: stream?.active ?? null,
    tracks: stream?.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState, enabled: t.enabled, muted: t.muted })) ?? [],
    video: video ? { paused: video.paused, readyState: video.readyState, currentTime: video.currentTime, hasSrcObject: !!video.srcObject, srcObjectMatches: video.srcObject === stream } : null };
}
export function watchState(object, key, owner) {
  if (!camDebugEnabled) return;
  let value = object[key];
  Object.defineProperty(object, key, { enumerable: true, configurable: true,
    get: () => value, set: next => { if (value !== next) camLog("state", { owner, from: value, to: next, reason: `${key} assignment; caller in stack` }, true); value = next; } });
}
if (camDebugEnabled && typeof window !== "undefined") {
  window.__CAM_DEBUG__ = { export: () => JSON.stringify(records, null, 2) };
  camLog("environment", { userAgent: navigator.userAgent, secure: isSecureContext, iframe: window !== window.top,
    cameraPolicy: document.permissionsPolicy?.allowsFeature("camera") ?? document.featurePolicy?.allowsFeature("camera") ?? null });
  for (const name of ["visibilitychange", "pagehide", "resize", "orientationchange"]) {
    (name === "visibilitychange" ? document : window).addEventListener(name, event => camLog(name, { hidden: document.hidden, persisted: event.persisted ?? null, width: innerWidth, height: innerHeight }));
  }
  document.addEventListener("webglcontextlost", () => camLog("webglcontextlost", {}, true), true);
  window.addEventListener("error", event => camLog("window.error", { message: event.message, file: event.filename, line: event.lineno }));
  window.addEventListener("unhandledrejection", event => camLog("unhandledrejection", { error: String(event.reason) }));
  try {
    navigator.permissions?.query({ name: "camera" }).then(permission => {
      camLog("permission", { state: permission.state });
      permission.addEventListener("change", () => camLog("permission.change", { state: permission.state }));
    }).catch(error => camLog("permission.unsupported", { error: String(error) }));
  } catch (error) { camLog("permission.unsupported", { error: String(error) }); }
  const media = navigator.mediaDevices;
  if (media?.getUserMedia) {
    const original = media.getUserMedia;
    media.getUserMedia = async function (constraints) {
      camLog("getUserMedia.call", { constraints }, true);
      try {
        const stream = await original.call(this, constraints);
        camLog("getUserMedia.resolved", cameraSnapshot(stream));
        for (const name of ["ended", "inactive", "addtrack", "removetrack"]) stream.addEventListener(name, () => camLog(`stream.${name}`, cameraSnapshot(stream)));
        for (const track of stream.getTracks()) for (const name of ["ended", "mute", "unmute"]) track.addEventListener(name, () => camLog(`track.${name}`, cameraSnapshot(stream)));
        return stream;
      } catch (error) { camLog("getUserMedia.rejected", { name: error.name, message: error.message }); throw error; }
    };
  }
  if (typeof MediaStreamTrack !== "undefined") {
    const stop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function () {
      camLog("track.stop", { readyState: this.readyState, kind: this.kind }, true);
      return stop.call(this);
    };
  }
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    new PerformanceObserver(list => { for (const entry of list.getEntries()) camLog("main.longtask", { start: entry.startTime, duration: entry.duration }); }).observe({ type: "longtask", buffered: true });
  }
}
