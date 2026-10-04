export function cueTiming(text, config, chapterStart = false, last = false) {
  const wordCount = text.match(/\S+/gu)?.length || 0;
  const reveal = config.entranceSeconds + Math.max(0, wordCount - 1) * config.wordStaggerSeconds;
  const hold = Math.max(config.minimumReadSeconds, wordCount * 60 / config.wordsPerMinute - reveal * 0.45)
    + (chapterStart ? config.chapterPauseSeconds : 0) + (last ? config.finalHoldSeconds : 0);
  return { wordCount, reveal, hold, exitAt: reveal + hold,
    duration: reveal + hold + config.exitSeconds + config.silenceSeconds };
}

export function makeTimeline({ gsap, words, passage, timing, config, reduced, onUpdate, onComplete }) {
  const entrance = reduced ? 0.08 : config.entranceSeconds;
  const stagger = reduced ? 0 : config.wordStaggerSeconds;
  const exit = reduced ? 0.08 : config.exitSeconds;
  const distance = reduced ? 0 : 12;
  passage.style.opacity = '1';
  passage.style.transform = 'none';
  if (gsap) {
    const clock = { value: 0 };
    const tl = gsap.timeline({ paused: true, onUpdate: () => onUpdate(tl.time()), onComplete });
    tl.fromTo(words, { opacity: 0, y: distance },
      { opacity: 1, y: 0, duration: entrance, stagger, ease: 'power2.out' }, 0);
    tl.to(passage, { opacity: 0, y: reduced ? 0 : -8, duration: exit, ease: 'sine.inOut' }, timing.exitAt);
    tl.to(clock, { value: 1, duration: timing.duration, ease: 'none' }, 0);
    return tl;
  }
  const animations = words.map((word, i) => {
    const animation = word.animate([
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: entrance * 1000, delay: i * stagger * 1000,
      easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
    animation.pause();
    return animation;
  });
  const leave = passage.animate([
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: `translateY(${reduced ? 0 : -8}px)` },
  ], { duration: exit * 1000, delay: timing.exitAt * 1000, easing: 'ease-in-out', fill: 'forwards' });
  leave.pause();
  animations.push(leave);
  const clock = new Animation(new KeyframeEffect(null, [], { duration: timing.duration * 1000, fill: 'both' }), document.timeline);
  animations.push(clock);
  let frame = 0;
  let killed = false;
  let completed = false;
  let rate = 1;
  const update = () => {
    if (killed) return;
    const seconds = Number(clock.currentTime || 0) / 1000;
    onUpdate(Math.min(timing.duration, seconds));
    if (seconds >= timing.duration - 0.001) {
      if (!completed) { completed = true; onComplete(); }
      return;
    }
    frame = requestAnimationFrame(update);
  };
  return {
    play() {
      if (killed) return this;
      animations.forEach(animation => { animation.playbackRate = rate; animation.play(); });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
      return this;
    },
    pause() { animations.forEach(a => a.pause()); cancelAnimationFrame(frame); return this; },
    kill() { killed = true; cancelAnimationFrame(frame); animations.forEach(a => a.cancel()); },
    time() { return Number(clock.currentTime || 0) / 1000; },
    seek(seconds) { animations.forEach(a => { a.currentTime = seconds * 1000; }); onUpdate(seconds); return this; },
    timeScale(value) {
      if (value === undefined) return rate;
      rate = value;
      animations.forEach(a => a.updatePlaybackRate(value));
      return this;
    },
  };
}

export async function loadGsap(config) {
  if (window.gsap?.timeline) return window.gsap;
  if (window.__OPENING_NATIVE_ONLY__ || new URLSearchParams(location.search).has('native')) return null;
  const load = src => new Promise(resolve => {
    const script = document.createElement('script');
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (!value) script.remove();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), config.dependencyTimeoutMs);
    script.src = src;
    script.onload = () => finish(window.gsap?.timeline ? window.gsap : null);
    script.onerror = () => finish(null);
    document.head.append(script);
  });
  return await load(config.gsapLocal) || await load(config.gsapCdn);
}
