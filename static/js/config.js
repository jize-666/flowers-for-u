/** The creative controls. Change values here before changing the animation code. */
export const CONTENT = Object.freeze({
  title: "Flowers for you.",
  heading: "Flowers,",
  headingAccent: "for you.",
  eyebrow: "SOMETHING SMALL. SOMETHING JUST FOR YOU.",
  hint: "Some flowers keep a little secret.",
  subtitle: "Some things are better left blooming.",
  letterTitle: "Between the petals",
  message: "I don’t know if words can always explain everything. So I made this little place instead — a place you can return to whenever you want, and remember that there was once someone who thought of you in this much detail.",
  signature: "For you, always.",
});

export const CONFIG = Object.freeze({
  background: "#070e11",
  groundY: -1.08,
  modelPaths: {
    cosmos: "/static/models/hero-flower.glb",
    daisy: "/static/models/flower.glb",
    tulip: "/static/models/tulip.glb",
  },
  wind: { strength: 0.045, speed: 0.68, focusMultiplier: 0.22 },
  growth: { duration: 3.6, stagger: 0.10, leafDelay: 0.65, bloomDelay: 1.55 },
  letter: { openDuration: 1.15, closeDuration: 0.72, typingDelay: 0.28, characterSeconds: 0.029 },
  camera: { fov: 38, x: 0, y: 3.60, z: 13.7, targetY: 2.70, parallax: 0.13 },
  bloom: { strength: 0.28, radius: 0.48, threshold: 0.86 },
  audio: { path: "/static/audio/night-garden.mp3", volume: 0.13 },
});

/** First three are the only letter triggers. Keep IDs stable when repositioning. */
export const FLOWERS = [
  { id: "moonflower", model: "cosmos", x: 0.10, z: 0.12, scale: 1.13, yaw: -0.06, lean: -0.045, trigger: true, tint: "#fff0f4", delay: 0.0 },
  { id: "ivory", model: "daisy", x: -2.08, z: 0.23, scale: 0.94, yaw: 0.20, lean: 0.09, trigger: true, tint: "#fff5dd", delay: 0.24 },
  { id: "blush", model: "cosmos", x: 2.20, z: -0.10, scale: 0.90, yaw: -0.23, lean: -0.08, trigger: true, tint: "#f3d3e7", delay: 0.52 },
  { id: "d04", model: "tulip", x: -1.04, z: 0.80, scale: 0.75, yaw: 0.08, lean: -0.11, tint: "#ffe7f3", delay: 0.83 },
  { id: "d05", model: "tulip", x: 1.24, z: 0.97, scale: 0.62, yaw: -0.35, lean: 0.10, tint: "#ead4f2", delay: 0.95 },
  { id: "d06", model: "daisy", x: -3.53, z: -0.08, scale: 0.68, yaw: 0.09, lean: 0.14, tint: "#e9edf7", delay: 0.49 },
  { id: "d07", model: "cosmos", x: 3.60, z: 0.27, scale: 0.67, yaw: -0.15, lean: -0.11, tint: "#fff0f4", delay: 0.91 },
  { id: "d08", model: "tulip", x: -2.92, z: -1.55, scale: 0.86, yaw: 0.0, lean: 0.06, tint: "#f8d0de", delay: 1.15 },
  { id: "d09", model: "tulip", x: 3.11, z: -1.47, scale: 0.94, yaw: 0.35, lean: -0.10, tint: "#decbe7", delay: 1.32 },
  { id: "d10", model: "daisy", x: -4.74, z: -1.60, scale: 0.56, yaw: 0.17, lean: 0.12, tint: "#d1e1df", delay: 1.45 },
  { id: "d11", model: "cosmos", x: 4.87, z: -1.18, scale: 0.51, yaw: -0.30, lean: -0.14, tint: "#e2cddd", delay: 1.54 },
  { id: "d12", model: "daisy", x: -1.54, z: -2.80, scale: 0.84, yaw: 0.32, lean: 0.10, tint: "#d2e2d5", delay: 1.11 },
  { id: "d13", model: "tulip", x: 0.72, z: -2.60, scale: 0.90, yaw: -0.17, lean: -0.11, tint: "#e6c3d6", delay: 1.62 },
  { id: "d14", model: "cosmos", x: -4.31, z: 1.09, scale: 0.44, yaw: -0.20, lean: 0.22, tint: "#f4e2ed", delay: 1.75 },
  { id: "d15", model: "daisy", x: 4.36, z: 1.13, scale: 0.41, yaw: 0.17, lean: -0.18, tint: "#e5ead9", delay: 1.89 },
  { id: "d16", model: "tulip", x: -3.71, z: -2.68, scale: 0.78, yaw: 0.27, lean: 0.12, tint: "#dfcad4", delay: 1.32 },
  { id: "d17", model: "daisy", x: 4.20, z: -2.49, scale: 0.70, yaw: -0.31, lean: -0.08, tint: "#dbe1d3", delay: 2.02 },
  { id: "d18", model: "tulip", x: -0.37, z: 1.84, scale: 0.36, yaw: 0.41, lean: 0.08, tint: "#fde0e7", delay: 1.58 },
  { id: "d19", model: "tulip", x: 2.69, z: 1.78, scale: 0.39, yaw: 0.15, lean: -0.15, tint: "#edd3e7", delay: 1.99 },
];

export const QUALITY = Object.freeze({
  high: { dpr: 1.75, flowers: 19, particles: 160, grass: 100, bloom: true },
  medium: { dpr: 1.35, flowers: 16, particles: 95, grass: 70, bloom: true },
  low: { dpr: 1, flowers: 12, particles: 45, grass: 40, bloom: false },
});
