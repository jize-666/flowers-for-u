import { OPENING } from './opening-config.js';
import { PARAGRAPHS, CHAPTERS } from './opening-content.js';
import { cueTiming, makeTimeline, loadGsap } from './opening-motion.js';
import { OpeningAudio } from './opening-audio.js';

const $ = id => document.getElementById(id);
const timeText = seconds => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const chapterFor = index => CHAPTERS.reduce((current, chapter) => chapter.start <= index ? chapter : current, CHAPTERS[0]);

class OpeningPlayer {
  constructor() {
    this.gsap = null;
    this.debug = Boolean(window.__OPENING_DEBUG__ || new URLSearchParams(location.search).has('debug'));
    this.state = 'cover';
    this.index = 0;
    this.cycle = 0;
    this.timeline = null;
    this.speed = OPENING.defaultSpeed;
    this.events = new AbortController();
    this.reducedMedia = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.reducedMedia.matches;
    this.resumeAfterTranscript = false;
    this.disposed = false;
    this.frameSamples = [];
    this.lastFrameAt = 0;
    this.lastSecond = -1;
    this.timings = PARAGRAPHS.map((text, index) => cueTiming(text, OPENING,
      CHAPTERS.some(chapter => chapter.start === index), index === PARAGRAPHS.length - 1));
    this.starts = [];
    let total = 0;
    this.timings.forEach(timing => { this.starts.push(total); total += timing.duration; });
    this.total = total;
    this.audio = new OpeningAudio(OPENING, state => {
      if (state === 'unavailable') this.announce('Ambience could not load. The story can continue without sound.');
    });
    this.bind();
    this.buildTranscript();
    this.populateChapters();
    this.updateTime(0);
    $('opening-title').textContent = OPENING.title;
    $('cover-subtitle').textContent = OPENING.subtitle;
    $('cover-duration').textContent = `${PARAGRAPHS.length} passages. ${timeText(this.total)} at a quiet pace.`;
    $('audio-volume').value = String(OPENING.audioVolume * 100);
    document.querySelectorAll('.garden-link').forEach(link => { link.href = OPENING.gardenUrl; });
    this.savedIndex = this.readProgress();
    if (OPENING.showResume && this.savedIndex > 0 && this.savedIndex < PARAGRAPHS.length - 1) {
      $('resume-opening').hidden = false;
      $('resume-opening').textContent = `Continue from passage ${this.savedIndex + 1}`;
    }
  }

  async init() {
    this.gsap = await loadGsap(OPENING);
    if (this.disposed) return;
    $('engine-status').textContent = this.gsap ? 'GSAP / a quiet cinematic prologue' : 'Native animation / GSAP unavailable or native preview selected';
    $('begin-opening').disabled = false;
    $('begin-opening').textContent = 'Begin the story';
    if (this.debug) {
      window.__OPENING__ = {
        player: this,
        getState: () => ({ state: this.state, index: this.index, count: PARAGRAPHS.length,
          engine: this.gsap ? 'gsap' : 'native', duration: this.total,
          visibleText: $('passage').textContent, reduced: this.reduced,
          audio: this.audio.context?.state || 'not-started', audioSource: Boolean(this.audio.source) }),
      };
    }
  }

  bind() {
    const options = { signal: this.events.signal };
    $('begin-opening').addEventListener('click', () => this.begin(0), options);
    $('resume-opening').addEventListener('click', () => { if (!$('begin-opening').disabled) this.begin(this.savedIndex); }, options);
    $('replay-opening').addEventListener('click', () => this.begin(0), options);
    $('play-pause').addEventListener('click', () => this.state === 'playing' ? this.pause() : this.play(), options);
    $('previous-passage').addEventListener('click', () => this.navigate(-1), options);
    $('next-passage').addEventListener('click', () => this.navigate(1), options);
    $('chapter-select').addEventListener('change', event => this.showCue(Number(event.target.value), this.state === 'playing'), options);
    $('reading-speed').addEventListener('change', event => {
      this.speed = Number(event.target.value);
      this.timeline?.timeScale(this.speed);
      this.updateTime(this.timeline?.time() || 0);
    }, options);
    $('sound-choice').addEventListener('change', event => {
      this.audio.enabled = event.target.checked;
      this.updateAudioButton();
    }, options);
    $('audio-toggle').addEventListener('click', () => {
      this.audio.enabled = !this.audio.enabled;
      $('sound-choice').checked = this.audio.enabled;
      this.updateAudioButton();
      if (this.audio.enabled && this.state === 'playing') this.audio.play();
      else this.audio.pause();
    }, options);
    $('audio-volume').addEventListener('input', event => this.audio.setVolume(Number(event.target.value) / 100), options);
    $('read-all').addEventListener('click', () => {
      this.resumeAfterTranscript = this.state === 'playing';
      this.pause();
      $('transcript-dialog').showModal();
      $('close-transcript').focus();
    }, options);
    $('close-transcript').addEventListener('click', () => $('transcript-dialog').close(), options);
    $('transcript-dialog').addEventListener('close', () => {
      if (this.resumeAfterTranscript && !document.hidden) this.play();
      this.resumeAfterTranscript = false;
      $('read-all').focus();
    }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.pause(); this.audio.pause(); this.resumeAfterTranscript = false; }
    }, options);
    this.reducedMedia.addEventListener('change', event => {
      this.reduced = event.matches;
      if (this.state === 'playing' || this.state === 'paused') this.showCue(this.index, false);
    }, options);
    document.addEventListener('keydown', event => {
      if ($('transcript-dialog').open || !['playing', 'paused'].includes(this.state)) return;
      if (event.target.closest('button, a, select, input, textarea')) return;
      if (event.code === 'Space') { event.preventDefault(); this.state === 'playing' ? this.pause() : this.play(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); this.navigate(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.navigate(-1); }
    }, options);
    document.querySelectorAll('.garden-link').forEach(link => {
      link.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (this.state === 'leaving') return;
        if (window.__OPENING_PREVIEW__) {
          this.finish();
          $('engine-status').textContent = 'Standalone preview. Integrate with Flask to enter your existing garden.';
          return;
        }
        this.timeline?.pause();
        this.audio.pause();
        this.setState('leaving');
        const destination = link.href;
        if (this.reduced) { location.assign(destination); return; }
        if (this.gsap) this.gsap.to(document.body, { opacity: 0, duration: 0.6, ease: 'sine.inOut', onComplete: () => location.assign(destination) });
        else document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' })
          .finished.then(() => location.assign(destination)).catch(() => location.assign(destination));
      }, options);
    });
    window.addEventListener('pagehide', event => { this.pause(); if (!event.persisted) this.dispose(); }, options);
    window.addEventListener('pageshow', event => {
      if (event.persisted && this.state === 'leaving') {
        document.body.getAnimations().forEach(animation => animation.cancel());
        if (this.gsap) this.gsap.killTweensOf(document.body);
        document.body.style.opacity = '1';
        this.setState(this.timeline ? 'paused' : 'cover');
      }
    }, options);
  }

  populateChapters() {
    $('chapter-select').replaceChildren(...CHAPTERS.map(chapter => {
      const option = document.createElement('option');
      option.value = chapter.start;
      option.textContent = `${chapter.number}. ${chapter.title}`;
      return option;
    }));
  }

  buildTranscript() {
    const fragment = document.createDocumentFragment();
    PARAGRAPHS.forEach((text, index) => {
      const chapter = CHAPTERS.find(item => item.start === index);
      if (chapter) {
        const heading = document.createElement('h3');
        heading.textContent = `${chapter.number}. ${chapter.title}`;
        fragment.append(heading);
      }
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      paragraph.dataset.passage = index;
      fragment.append(paragraph);
    });
    $('transcript-content').append(fragment);
  }

  readProgress() {
    try {
      const value = Number(localStorage.getItem(OPENING.memoryKey));
      return Number.isInteger(value) && value >= 0 && value < PARAGRAPHS.length ? value : 0;
    } catch { return 0; }
  }

  saveProgress() {
    try { localStorage.setItem(OPENING.memoryKey, String(this.index)); } catch {}
  }

  announce(message) { $('opening-announcement').textContent = message; }

  updateAudioButton() {
    $('audio-toggle').setAttribute('aria-pressed', String(!this.audio.enabled));
    $('audio-toggle').setAttribute('aria-label', this.audio.enabled ? 'Mute ambience' : 'Enable ambience');
  }

  setState(state) {
    this.state = state;
    document.body.dataset.state = state;
    $('pause-label').hidden = state !== 'paused';
    $('play-pause').setAttribute('aria-label', state === 'playing' ? 'Pause story' : 'Resume story');
    const active = ['playing', 'paused'].includes(state);
    $('play-pause').disabled = !active;
    $('next-passage').disabled = !active;
    $('previous-passage').disabled = !active || this.index === 0;
    $('chapter-select').disabled = !active;
  }

  begin(index) {
    if (this.disposed || this.state === 'leaving') return;
    this.audio.enabled = $('sound-choice').checked;
    this.updateAudioButton();
    this.audio.reset();
    if (this.audio.enabled) this.audio.play();
    $('opening-cover').hidden = true;
    $('opening-end').hidden = true;
    $('opening-stage').hidden = false;
    this.showCue(index, true);
  }

  showCue(index, playing = true) {
    if (this.disposed || this.state === 'leaving') return;
    if (index >= PARAGRAPHS.length) { this.finish(); return; }
    this.index = Math.max(0, Math.min(PARAGRAPHS.length - 1, Math.floor(index)));
    this.cycle += 1;
    const cycle = this.cycle;
    this.timeline?.kill();
    this.lastFrameAt = 0;
    const text = PARAGRAPHS[this.index];
    const chapter = chapterFor(this.index);
    const passage = $('passage');
    passage.replaceChildren();
    passage.className = 'passage';
    const words = [];
    for (const token of text.match(/\S+|\s+/gu) || []) {
      if (/^\s+$/u.test(token)) passage.append(document.createTextNode(token));
      else {
        const span = document.createElement('span');
        span.className = 'passage-word';
        span.textContent = token;
        passage.append(span);
        words.push(span);
      }
    }
    passage.classList.toggle('is-long', words.length > 21);
    passage.classList.toggle('is-short', words.length < 7);
    passage.classList.toggle('is-prayer', this.index >= 23 && this.index <= 27);
    $('accessible-passage').textContent = text;
    $('chapter-number').textContent = chapter.number;
    $('chapter-title').textContent = chapter.title;
    $('chapter-select').value = String(chapter.start);
    $('paper-folio').textContent = `${String(this.index + 1).padStart(3, '0')} / ${PARAGRAPHS.length}`;
    $('paper-footer-middle').textContent = this.index < 44 ? 'Some beginnings are quiet.' : this.index < 92 ? 'Some feelings have no name.' : 'Some things are meant to be discovered.';
    this.saveProgress();
    this.timeline = makeTimeline({
      gsap: this.gsap, words, passage, timing: this.timings[this.index], config: OPENING, reduced: this.reduced,
      onUpdate: time => {
        if (cycle !== this.cycle) return;
        this.updateTime(time);
        const now = performance.now();
        if (this.debug && this.lastFrameAt && this.state === 'playing') {
          this.frameSamples.push(now - this.lastFrameAt);
          if (this.frameSamples.length > 1200) this.frameSamples.shift();
        }
        this.lastFrameAt = now;
      },
      onComplete: () => { if (cycle === this.cycle && this.state === 'playing') this.showCue(this.index + 1, true); },
    });
    this.timeline.timeScale(this.speed);
    this.setState(playing ? 'playing' : 'paused');
    this.updateTime(0);
    if (playing) this.timeline.play();
    else this.timeline.seek(this.timings[this.index].reveal + 0.01);
  }

  updateTime(local) {
    const elapsed = this.state === 'finished' ? this.total : Math.min(this.total, this.starts[this.index] + local);
    $('progress-fill').style.transform = `scaleX(${elapsed / this.total})`;
    const second = Math.floor(elapsed / this.speed);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      $('elapsed-time').textContent = timeText(second);
      document.querySelector('.opening-progress').setAttribute('aria-valuenow', String(Math.round(elapsed / this.total * 100)));
    }
    const totalLabel = timeText(this.total / this.speed);
    if ($('total-time').textContent !== totalLabel) $('total-time').textContent = totalLabel;
  }

  navigate(delta) { if (['playing', 'paused'].includes(this.state)) this.showCue(this.index + delta, this.state === 'playing'); }

  pause() {
    if (this.state !== 'playing') return;
    this.timeline?.pause();
    this.audio.pause();
    this.setState('paused');
    this.lastFrameAt = 0;
  }

  play() {
    if (this.state !== 'paused' || document.hidden) return;
    this.setState('playing');
    this.lastFrameAt = 0;
    this.timeline?.play();
    if (this.audio.enabled) this.audio.play();
  }

  finish() {
    this.cycle += 1;
    this.timeline?.kill();
    this.timeline = null;
    this.audio.pause();
    this.setState('finished');
    $('opening-stage').hidden = true;
    $('opening-end').hidden = false;
    $('paper-folio').textContent = 'THE END';
    this.updateTime(0);
    try { localStorage.removeItem(OPENING.memoryKey); } catch {}
    const end = $('opening-end');
    if (this.gsap) this.gsap.fromTo(end, { opacity: 0, y: this.reduced ? 0 : 10 }, { opacity: 1, y: 0, duration: this.reduced ? 0.1 : 1.3, ease: 'sine.out' });
    else end.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.reduced ? 100 : 1300, fill: 'forwards' });
    this.announce('The prologue is complete. Enter the garden when you are ready.');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cycle += 1;
    this.timeline?.kill();
    this.events.abort();
    this.audio.dispose().catch(() => {});
  }
}

const player = new OpeningPlayer();
player.init().catch(() => {
  $('engine-status').textContent = 'The cinematic player could not start. Use Read the full letter.';
});
