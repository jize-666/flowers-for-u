export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const damp = (current, target, speed, delta) => current + (target - current) * (1 - Math.exp(-speed * delta));

export function seededRandom(seed = 2026) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** Keep this identical to flowerVertexShader in flowers.js for accurate picking. */
export function windOffset(time, phase, amplitude, height, growth = 1) {
  if (growth === 0 || amplitude === 0 || height === 0) return { x: 0, z: 0 };
  const a = Math.sin(time * 0.68 + phase) + 0.34 * Math.sin(time * 1.07 + phase * 1.8);
  const b = Math.sin(time * 0.47 + phase * 0.8) + 0.18 * Math.sin(time * 0.91 + phase);
  return { x: a * amplitude * height * growth * growth, z: b * amplitude * height * 0.4 * growth * growth };
}

export function buildTypingSchedule(message, secondsPerCharacter = 0.029) {
  const segments = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(message), part => part.segment)
    : Array.from(message);
  let elapsed = 0;
  const times = segments.map(char => {
    elapsed += secondsPerCharacter;
    const visibleAt = elapsed;
    elapsed += /[,;:]/u.test(char) ? 0.10 : /[.!?\u2014]/u.test(char) ? 0.22 : 0;
    return visibleAt;
  });
  return { segments, times, duration: elapsed };
}

export function visibleCharacterCount(times, elapsed) {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] <= elapsed) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function isIntentionalClick(start, end, threshold = 7) {
  return Boolean(start) && start.id === end.id &&
    (start.maxDistance ?? 0) <= threshold &&
    Math.hypot(end.x - start.x, end.y - start.y) <= threshold &&
    end.time >= start.time && end.time - start.time < 650;
}

/** All trigger flowers survive lower quality, even after reordering the config. */
export function visibleFlowerIds(flowers, budget) {
  const visible = new Set(flowers.filter(flower => flower.trigger).map(flower => flower.id));
  for (const flower of flowers) {
    if (visible.size >= budget) break;
    visible.add(flower.id);
  }
  return visible;
}
