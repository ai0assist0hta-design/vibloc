/**
 * Singleton 30s preview player.
 *
 * Why a singleton?
 * ----------------
 * Multiple ▶ buttons may live in the same panel (RecommendedList +
 * future VibeDropFeed) and the new global NowPlayingBar at the
 * bottom of the viewport. When the user clicks one, ALL other
 * previews must stop instantly so we never have two tracks playing
 * on top of each other. The cleanest way to enforce that is a
 * single shared `<audio>` element managed by a tiny module-level
 * store and exposed via a hook.
 *
 * The audio element is created lazily (so SSR / pre-paint never
 * touches the DOM) and never unmounted — it follows the user across
 * the whole session, which is also what makes "click ▶ on track A,
 * close panel, open another building, ▶ track B" actually work.
 *
 * State carries enough metadata for the NowPlayingBar to render the
 * track without a separate lookup: title, artist, artwork URL, and
 * the canonical Apple Music URL for the "open in Apple Music" CTA.
 *
 * a11y: keyboard shortcut (Space) is wired in the consumer button
 * so focusable elements stay native and screen readers see real
 * `aria-pressed` state on each track row.
 */

import { useEffect, useState } from 'react';

type Listener = (state: PlayerState) => void;

export type TrackMeta = {
  title: string;
  artist: string;
  artworkUrl?: string;
  /** Canonical music.apple.com URL — wired to the NowPlayingBar's
   *  "Open in Apple Music" button. Falls back to a search URL inside
   *  the helper when missing. */
  appleUrl?: string;
  /** GenreKey — pulled from the source RecommendedTrack so the 3D
   *  scene can tint its EQ visualization in the genre's color
   *  (PreviewPlayer.getGenreRGB() routes this to OSMCity each
   *  frame). Optional because legacy queue entries / external play
   *  triggers may lack genre. */
  genre?: string;
};

export type PlayerState = {
  /** trackId currently loaded — null when idle. */
  currentId: string | null;
  /** True if `<audio>` is actively playing. */
  isPlaying: boolean;
  /** Metadata for the bottom bar. Null when idle. */
  meta: TrackMeta | null;
  /** Total preview duration in seconds (≈ 30 for iTunes previews). */
  duration: number;
  /** Current playhead position in seconds. */
  position: number;
  /** Optional queue (e.g. the building's #1 playlist) for prev / next
   *  navigation in the NowPlayingBar. Empty array = no nav, buttons
   *  render disabled. The current track index is derived from
   *  `queue.findIndex(t => t.id === currentId)`. */
  queue: QueueEntry[];
  /** Building this queue was scoped to — i.e. the building whose
   *  playlist seeded the current playback. Lets the NowPlayingBar's
   *  "+" know where to pin tracks even when the user has since
   *  deselected the building (track still plays, but no
   *  selectedBuildingId in the URL). */
  currentBuildingId: string | null;
  /** Apple Music-style playback modes. Affect prev / next routing
   *  and auto-advance: shuffle picks a random unplayed track,
   *  repeat:'one' restarts the current track, repeat:'all' wraps
   *  the queue at both ends. */
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  /** Output volume 0..1. Persisted to localStorage so reload keeps
   *  the user's level. */
  volume: number;
  /** Soft-mute toggle that preserves `volume`. Speaker-icon click
   *  pattern from Apple Music — flick to silent without losing
   *  whatever level was set. */
  muted: boolean;
};

/** Trimmed track shape for queue nav — a queue entry needs the URL
 *  to play and the meta to show in the bar. */
export type QueueEntry = {
  id: string;
  url: string;
  meta: TrackMeta;
};

let audioEl: HTMLAudioElement | null = null;
// Hydrate volume / mute from localStorage (best-effort — silently
// falls back to defaults on parse failure, SSR, etc.).
const VOL_KEY = 'vibloc.player.vol';
/** Default starts at 50 % so first-play isn't ear-blasting on
 *  laptops with the system volume already cranked. Saved preference
 *  takes priority once the user adjusts the slider. */
const DEFAULT_VOLUME = 0.5;
function loadVolPrefs(): { volume: number; muted: boolean } {
  if (typeof window === 'undefined') return { volume: DEFAULT_VOLUME, muted: false };
  try {
    const raw = window.localStorage.getItem(VOL_KEY);
    if (!raw) return { volume: DEFAULT_VOLUME, muted: false };
    const parsed = JSON.parse(raw);
    const v = typeof parsed?.volume === 'number'
      ? Math.max(0, Math.min(1, parsed.volume))
      : DEFAULT_VOLUME;
    const m = !!parsed?.muted;
    return { volume: v, muted: m };
  } catch {
    return { volume: DEFAULT_VOLUME, muted: false };
  }
}
const _initVol = loadVolPrefs();

// Module-level flag tracking whether the user has ever issued an
// EXPLICIT play gesture in this session. The auto-play effect in
// App.tsx checks this before kicking off the first track on building
// select — so a fresh visitor lands on /map and DOESN'T get
// surprise audio (Apple Music web behavior). Once the user clicks ▶
// anywhere (track row, NowPlayingBar play, TopTaggerCard rank row),
// this flips true and subsequent building changes auto-play normally.
let _userHasPlayed = false;
export function userHasPlayedOnce(): boolean { return _userHasPlayed; }

// ── Beat-reactive visualization (selected building's windows) ──────
//
// Web Audio analyser graph wired ONCE (lazy on first play) so the
// `<audio>` element streams through:
//
//   audio → MediaElementAudioSource → AnalyserNode → destination
//
// We sum bass-band FFT bins (~40-150 Hz, where kick/sub-bass live)
// each frame, EMA the running mean (≈1 s window), and run a Schmitt
// trigger gate (Otto Schmitt 1938) — open at 1.35× mean, close at
// 1.10×. When the gate fires, we set an envelope to 1.0 and let it
// decay exponentially with τ = 250 ms. That envelope, exposed via
// `getBeatLevel()`, is the single signal the 3D scene consumes.
//
// References: Patin "Beat Detection Algorithms" (GameDev.net 2003)
// for the energy-variance baseline; Schmitt trigger for hysteresis;
// research recommendation: hybrid Approach C+B (occupancy modulation
// with per-window phase wave) — implemented in OSMCity shader.
//
// CORS: iTunes preview hosts (mzstatic / audio-ssl.itunes.apple.com)
// return Access-Control-Allow-Origin: *, so AnalyserNode produces
// non-zero data with crossOrigin="anonymous" set above. Silent-fail
// detection lives at the consumer side (idle = 0 envelope = no
// reactivity, app still functions).
let _audioCtx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _audioGraphWired = false;
let _freqData: Uint8Array<ArrayBuffer> | null = null;
let _beatRafId: number | null = null;
let _beatEnv = 0;
let _beatMean = 0;
let _beatGateOpen = false;
let _beatPrevTs = 0;
const BEAT_TAU = 0.25;            // envelope decay time constant (s)
const BEAT_T_ON = 1.35;           // Schmitt open: energy / mean
const BEAT_T_OFF = 1.10;          // Schmitt close
const BEAT_MEAN_ALPHA = 0.04;     // EMA α @ 60 fps ≈ 1 s window

function ensureAudioGraph(): void {
  if (_audioGraphWired) return;
  const a = audioEl;
  if (!a) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!Ctx) return;
    _audioCtx = new Ctx();
    const src = _audioCtx.createMediaElementSource(a);
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 2048;
    _analyser.smoothingTimeConstant = 0.4;
    _freqData = new Uint8Array(_analyser.frequencyBinCount);
    src.connect(_analyser);
    _analyser.connect(_audioCtx.destination);
    _audioGraphWired = true;
  } catch {
    // Browser blocked it (Safari pre-gesture, etc.) — leave unwired,
    // beat envelope stays at 0, app still plays normally through the
    // <audio> element's own pipeline.
    _audioGraphWired = false;
  }
}

function startBeatLoop(): void {
  if (_beatRafId !== null) return;
  if (!_analyser || !_freqData) return;
  _beatPrevTs = performance.now();
  const tick = (ts: number) => {
    _beatRafId = requestAnimationFrame(tick);
    if (!_analyser || !_freqData) return;
    _analyser.getByteFrequencyData(_freqData);

    // Volume-compensation gain — the analyser is wired AFTER the
    // <audio> element's volume control, so cranking the slider
    // saturates every FFT bin to 255 and the visualiser flatlines.
    // The user explicitly asked for the low-volume "musical wave"
    // look to PERSIST when volume is raised, so we scale the
    // visualiser-input bytes by `min(1, ceiling / userVolume)`.
    //
    //   userVolume ≤ ceiling → compensation = 1  (no change, low-vol look)
    //   userVolume = 1.0     → compensation ≈ 0.4 (signal feels like vol 0.4)
    //
    // Only affects the visualiser pipeline (spectrum + beat); actual
    // playback loudness is whatever .volume / GainNode is doing.
    // Locked at 0.5 — the user explicitly approved the EQ wave shape
    // at the default volume (0.5). Anything ≤ 0.5 plays unchanged;
    // anything above is proportionally scaled down on the visualiser
    // side so the wave always LOOKS like volume 0.5 even at 1.0.
    // Audible playback loudness is unaffected.
    const VISUAL_VOL_CEILING = 0.5;
    const userVol = Math.max(0.05, state.volume || 1);
    const visComp = Math.min(1, VISUAL_VOL_CEILING / userVol);

    // Bass band: FFT bins 40-150 Hz at 44.1 kHz sample rate, fftSize
    // 2048 → bin width ≈ 21.5 Hz → bins 2..7 cover the band.
    let sum = 0;
    for (let i = 2; i <= 7; i++) sum += _freqData[i];
    const energy = (sum / 6 / 255) * visComp;  // 0..1, vol-compensated

    // Running mean (EMA) — adaptive baseline so loud and quiet songs
    // both produce visible reactivity.
    _beatMean += BEAT_MEAN_ALPHA * (energy - _beatMean);

    // Schmitt trigger — fire envelope on RISING above T_ON only.
    const ratio = _beatMean > 0.001 ? energy / _beatMean : 0;
    if (!_beatGateOpen && ratio > BEAT_T_ON) {
      _beatGateOpen = true;
      _beatEnv = 1.0;
    } else if (_beatGateOpen && ratio < BEAT_T_OFF) {
      _beatGateOpen = false;
    }

    // Exponential decay (frame-rate independent).
    const dt = Math.max(0, (ts - _beatPrevTs) / 1000);
    _beatPrevTs = ts;
    _beatEnv *= Math.exp(-dt / BEAT_TAU);

    // 32-band spectrum (log-spaced). Three-stage processing brings
    // varied highs/lows when music plays:
    //   (1) FREQUENCY TILT — gentle high-frequency boost to
    //       compensate the natural pink-noise rolloff so top
    //       columns visibly participate without saturating.
    //   (2) GLOBAL AGC — single running peak shared across ALL
    //       bands. Per-band AGC was equalizing every band to ~1.0
    //       so bars looked uniform; global AGC preserves NATURAL
    //       energy ratios (bass tall, mid medium, high small)
    //       while still adapting to song loudness.
    //   (3) PERCEPTUAL GAMMA — pow(x, 0.6) for mid-range
    //       expansion so subtle moves are visible.
    // Pass 1: compute tilted values + this-frame global max.
    // visComp (computed above) shrinks the input proportionally to
    // user volume, so the wave shape stays the way it looks at
    // volume ≤ VISUAL_VOL_CEILING.
    let globalMaxThisFrame = 0;
    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      const { lo, hi } = _bandRanges[b];
      let sum = 0; let n = 0;
      for (let i = lo; i < hi && i < _freqData.length; i++) { sum += _freqData[i]; n++; }
      const rawMean = (n > 0 ? (sum / n) / 255 : 0) * visComp;
      const tilt = 1.0 + (b / SPECTRUM_BANDS) * 1.5;
      const tilted = Math.min(1, rawMean * tilt);
      _tiltedScratch[b] = tilted;
      if (tilted > globalMaxThisFrame) globalMaxThisFrame = tilted;
    }
    // Update the single shared peak (slow decay).
    const decayedGlobal = _globalPeak * BAND_PEAK_DECAY;
    _globalPeak = globalMaxThisFrame > decayedGlobal ? globalMaxThisFrame : decayedGlobal;
    const globalDenom = Math.max(BAND_PEAK_FLOOR, _globalPeak);
    // Pass 2: normalize each band by the SAME global denom,
    // preserving inter-band energy ratios.
    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      const normalized = Math.min(1, _tiltedScratch[b] / globalDenom);
      const perceptual = Math.pow(normalized, 0.6);
      const cur = _spectrumEnv[b];
      const a = perceptual > cur ? 0.6 : 0.10;
      const next = cur + a * (perceptual - cur);
      _spectrumEnv[b] = next;
      _spectrumData[b] = Math.max(0, Math.min(255, Math.round(next * 255)));
    }
  };
  _beatRafId = requestAnimationFrame(tick);
}

function stopBeatLoop(): void {
  if (_beatRafId !== null) {
    cancelAnimationFrame(_beatRafId);
    _beatRafId = null;
  }
  _beatEnv = 0;
  _globalPeak = 0;
  for (let b = 0; b < SPECTRUM_BANDS; b++) {
    _spectrumEnv[b] = 0;
    _spectrumData[b] = 0;
  }
}

/** Current beat envelope value, 0..1. 0 = idle / between beats; 1 =
 *  just-fired bass kick, decaying exponentially with τ=250ms.
 *  Consumed by OSMCity to modulate the selected building's window
 *  occupancy. Safe to call every frame from useFrame; reads a
 *  module-local number, no allocation. */
export function getBeatLevel(): number { return _beatEnv; }

/** True when an audio source is currently playing (post-`play()`,
 *  pre-`pause()` / `ended`). Read every frame by the city shader to
 *  decide whether to render the selected building's EQ bars at all
 *  — when nothing is playing we want a calm, fully un-lit facade
 *  (no baseline glow tint). */
export function getIsPlaying(): boolean { return state.isPlaying; }

// ── Multi-band spectrum (selected building's facade = EQ analyzer)
//
// 32 log-spaced bands across the audible-relevant range (~30 Hz to
// ~14 kHz). Each band has its own envelope follower (fast attack
// 0.6, slow release 0.10) so bars rise instantly on transients and
// fall back gracefully — this is what makes a Winamp-style spectrum
// analyzer feel "musical" instead of jittery. Output is byte-scaled
// 0..255 so it can be uploaded directly into a DataTexture R8 of
// length 32 every frame for the GLSL shader.
//
// Log spacing because human hearing AND the kick→snare→hat→cymbal
// instrument layout are both log-frequency. Linear bands waste 90%
// of the bars on inaudible high frequencies.
const SPECTRUM_BANDS = 32;
const _spectrumData = new Uint8Array(SPECTRUM_BANDS);
// Fractional internal state so smoothing is per-frame stable.
const _spectrumEnv = new Float32Array(SPECTRUM_BANDS);
// GLOBAL running peak for auto-leveling — shared across all bands.
// Earlier per-band AGC equalized every band to roughly the same
// dynamic range, which destroyed the inter-band variation that
// makes a spectrum analyzer look like music (bass tall, mid
// medium, high small). With a single shared denominator each band
// retains its NATURAL relative energy — bass and kick still
// dominate, but the whole spectrum still adapts to song loudness.
let _globalPeak = 0;
// Floor for the peak so the AGC doesn't divide by tiny numbers
// and blow up dead-quiet passages. ≈ -52 dB FS.
const BAND_PEAK_FLOOR = 0.05;
// Decay rate per frame for the peak — 0.9985 ≈ 1.5 s half-life @
// 60 fps.
const BAND_PEAK_DECAY = 0.9985;
// Scratch buffer for tilted values inside tick() so we can compute
// the global max in one pass before normalizing.
const _tiltedScratch = new Float32Array(SPECTRUM_BANDS);
// Pre-computed log-spaced bin ranges. fftSize 2048 → 1024 bins,
// bin width ≈ 21.5 Hz at 44.1 kHz. We map band b → [lo, hi) FFT
// bins via `bin = round(2^(b/SPECTRUM_BANDS * log2(maxBin)))`.
const _bandRanges: { lo: number; hi: number }[] = (() => {
  const ranges: { lo: number; hi: number }[] = [];
  const minBin = 2;       // skip DC + sub-rumble (~21 Hz)
  const maxBin = 600;     // ~12.9 kHz (most musical content)
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  for (let b = 0; b < SPECTRUM_BANDS; b++) {
    const lo = Math.round(Math.exp(logMin + (logMax - logMin) * (b     / SPECTRUM_BANDS)));
    const hi = Math.round(Math.exp(logMin + (logMax - logMin) * ((b+1) / SPECTRUM_BANDS)));
    ranges.push({ lo, hi: Math.max(hi, lo + 1) });
  }
  return ranges;
})();

/** Snapshot of the 32-band spectrum, byte-scaled 0..255 with
 *  per-band attack/release envelope applied. The buffer is reused
 *  every frame — callers should NOT cache the reference past the
 *  current frame. Used by OSMCity to upload into a DataTexture
 *  driving the selected building's window-grid EQ visualization. */
export function getSpectrumData(): Uint8Array { return _spectrumData; }

// Dev-time debug introspection. Surfaces the entire audio analysis
// state on `window.__viblocAudio` so we can verify the pipeline
// from a browser console without reading source. Removed in prod
// build by tree-shaking on `import.meta.env.DEV`.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __viblocAudio?: object }).__viblocAudio = {
    state: () => ({
      audioEl: !!audioEl,
      audioElSrc: audioEl?.src?.slice(-40),
      audioElPaused: audioEl?.paused,
      audioCtx: !!_audioCtx,
      audioCtxState: _audioCtx?.state,
      analyser: !!_analyser,
      audioGraphWired: _audioGraphWired,
      beatRafRunning: _beatRafId !== null,
      beatEnv: _beatEnv,
      beatMean: _beatMean,
      spectrum: Array.from(_spectrumData),
      genreRGB: [..._genreRGB],
      currentId: state.currentId,
      currentMeta: state.meta,
    }),
  };
}

// ── Genre tint for EQ visualization ────────────────────────────────
//
// The shader paints the selected building's EQ bars in the playing
// track's genre color (jazz → blue, pop → pink, electronic → teal,
// etc.). This module owns the current track's resolved RGB and
// exposes it via `getGenreRGB()` for the per-frame uniform push.
//
// Default = neutral white so unknown-genre tracks fall back to a
// non-tinted analyzer. Each component is in [0, 1] for direct
// shader consumption.
//
// Smoothing model — the visualisation never SNAPS to a new genre.
//
//   _curTrackRGB → pure color of the currently-playing track.
//   _nextTrackRGB → pure color of the QUEUED next track (for
//                   pre-mixing during the tail of the current
//                   preview). White when none.
//   _genreTarget → desired output, computed every frame as
//                  lerp(cur, next, blendFactor) where blendFactor
//                  ramps from 0 → 1 over the last `BLEND_WINDOW_S`
//                  seconds of the preview. So 5 s before the track
//                  ends, the EQ + rain start drifting toward the
//                  next song's color so the handover is invisible.
//   _genreRGB    → smoothed actual output, lerped toward target
//                  with τ ≈ 350 ms (matches OSMCity's audio-active
//                  envelope so all music-reactive surfaces share
//                  one settle time).
const _curTrackRGB:  [number, number, number] = [1, 1, 1];
const _nextTrackRGB: [number, number, number] = [1, 1, 1];
const _genreTarget:  [number, number, number] = [1, 1, 1];
const _genreRGB:     [number, number, number] = [1, 1, 1];

/** Last `BLEND_WINDOW_S` seconds of the current preview cross-mix
 *  toward the next track's color. iTunes previews are ~30 s so 5 s
 *  feels like a long, premonitory crossfade without dominating the
 *  current track's identity. */
const BLEND_WINDOW_S = 5;

function hexToRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function genreToRGB(key?: string): [number, number, number] {
  if (!key) return [1, 1, 1];
  try {
    const mod = (window as unknown as {
      __viblocGenreColors?: Record<string, { color: string }>;
    }).__viblocGenreColors;
    const hex = mod?.[key]?.color;
    if (hex) return hexToRGB(hex);
  } catch { /* ignore */ }
  return [1, 1, 1];
}

function setGenreFromKey(key?: string): void {
  // No longer snaps `_genreRGB` directly — it sets the CURRENT
  // track's pure color and lets `tickGenrePremix` lerp the visible
  // value over the next few frames. The crossfade tail (started
  // pre-track-end) means the visible value is already part-way
  // toward this color when the new track begins.
  const rgb = genreToRGB(key);
  _curTrackRGB[0] = rgb[0]; _curTrackRGB[1] = rgb[1]; _curTrackRGB[2] = rgb[2];
}

/** Look up the queued next track's genre color and cache it. Called
 *  every time the queue changes or the current track index moves so
 *  `tickGenrePremix` can pre-blend without re-scanning the queue. */
function refreshNextTrackRGB(): void {
  const idx = state.queue.findIndex((q) => q.id === state.currentId);
  let nextEntry: QueueEntry | undefined;
  if (idx >= 0) {
    if (state.shuffle) {
      // In shuffle mode the next pick is random; we can't predict
      // it so fall back to the current color (no pre-mix).
      nextEntry = state.queue[idx];
    } else if (idx + 1 < state.queue.length) {
      nextEntry = state.queue[idx + 1];
    } else if (state.repeat === 'all' && state.queue.length > 0) {
      nextEntry = state.queue[0];
    }
  } else if (state.queue.length > 0) {
    nextEntry = state.queue[0];
  }
  const rgb = genreToRGB(nextEntry?.meta.genre);
  _nextTrackRGB[0] = rgb[0]; _nextTrackRGB[1] = rgb[1]; _nextTrackRGB[2] = rgb[2];
}

/** Per-frame envelope step. Call from OSMCity's useFrame BEFORE
 *  reading `getGenreRGB()` so consumers see the freshly-smoothed
 *  value. Computes:
 *    1. blendFactor — 0 at the start of the preview, 1 at the end,
 *       only ramps during the last BLEND_WINDOW_S seconds.
 *    2. target = lerp(cur, next, blendFactor).
 *    3. visible = lerp(visible, target, 1 - exp(-dt/τ)).
 *  τ = 0.35 s gives a ~1 s perceived settle — fast enough to feel
 *  responsive on track change but slow enough to read as a
 *  "color tide" rather than a snap. */
export function tickGenrePremix(dt: number): void {
  const remaining = Math.max(0, state.duration - state.position);
  const blendT =
    state.duration > 0 && remaining > 0 && remaining < BLEND_WINDOW_S
      ? 1 - remaining / BLEND_WINDOW_S
      : 0;
  // Target = mix of current and next track colors based on tail
  // proximity. When blendT === 0 → pure current; → 1 → pure next.
  for (let i = 0; i < 3; i++) {
    _genreTarget[i] = _curTrackRGB[i] * (1 - blendT) + _nextTrackRGB[i] * blendT;
  }
  // Visible value chases target with a short exponential.
  const tau = 0.35;
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  for (let i = 0; i < 3; i++) {
    _genreRGB[i] += (_genreTarget[i] - _genreRGB[i]) * k;
  }
}

/** Current track's genre color as an [r, g, b] triple in [0, 1].
 *  Returns the same array reference each call — callers should
 *  consume it inline (e.g. push into a uniform.value) and not
 *  cache it. White ([1, 1, 1]) when no genre is known. The value
 *  is the SMOOTHED output — see `tickGenrePremix` for the
 *  cross-track pre-mix model. */
export function getGenreRGB(): [number, number, number] { return _genreRGB; }

let state: PlayerState = {
  currentId: null, isPlaying: false, meta: null, duration: 0, position: 0, queue: [],
  shuffle: false, repeat: 'off',
  currentBuildingId: null,
  volume: _initVol.volume,
  muted: _initVol.muted,
};
const listeners = new Set<Listener>();

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  if (typeof window === 'undefined') {
    return {} as HTMLAudioElement;
  }
  audioEl = new Audio();
  audioEl.preload = 'none';
  audioEl.crossOrigin = 'anonymous';
  // Hydrate audio element with the persisted volume / mute state.
  audioEl.volume = state.volume;
  audioEl.muted = state.muted;
  audioEl.addEventListener('ended', () => {
    state = { ...state, isPlaying: false, position: 0 };
    notify();
    // Auto-advance with mode-aware routing. Repeat 'one' replays the
    // same track; shuffle picks a random other entry; repeat 'all'
    // wraps to the start of the queue when we hit the end. Default
    // off → stop at the last track (existing behavior).
    const idx = state.queue.findIndex((q) => q.id === state.currentId);
    if (idx < 0) return;
    if (state.repeat === 'one') {
      const cur = state.queue[idx];
      playPreview(cur.id, cur.url, cur.meta);
      return;
    }
    if (state.shuffle && state.queue.length > 1) {
      let r = idx;
      while (r === idx) r = Math.floor(Math.random() * state.queue.length);
      const next = state.queue[r];
      playPreview(next.id, next.url, next.meta);
      return;
    }
    if (idx < state.queue.length - 1) {
      const next = state.queue[idx + 1];
      playPreview(next.id, next.url, next.meta);
    } else if (state.repeat === 'all' && state.queue.length > 0) {
      const first = state.queue[0];
      playPreview(first.id, first.url, first.meta);
    }
  });
  audioEl.addEventListener('pause', () => {
    if (audioEl && audioEl.currentTime < (audioEl.duration || Infinity)) {
      state = { ...state, isPlaying: false };
      notify();
    }
  });
  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl) return;
    state = {
      ...state,
      position: audioEl.currentTime || 0,
      duration: audioEl.duration || state.duration || 0,
    };
    notify();
  });
  audioEl.addEventListener('loadedmetadata', () => {
    if (!audioEl) return;
    state = { ...state, duration: audioEl.duration || 0 };
    notify();
  });
  return audioEl;
}

function notify() {
  // Recompute the queued-next color whenever any state mutation
  // could have changed it (queue mutation, currentId change, mode
  // flip). Cheap — single queue scan + palette lookup.
  refreshNextTrackRGB();
  for (const l of listeners) l(state);
}

/** Play (or restart) a preview by URL. If `id` is already current
 *  and playing, this acts as a toggle (pauses). Pass `force: true`
 *  to bypass the toggle — used when an explicit user intent (e.g.
 *  clicking a "My Music" item) means "always (re)start playing,
 *  never pause". When `force` is set on a same-id current track,
 *  the playhead seeks back to 0 and resumes from the start. */
export function playPreview(
  id: string,
  url: string,
  meta?: TrackMeta,
  opts?: { force?: boolean },
): void {
  const a = ensureAudio();
  if (!opts?.force && state.currentId === id && state.isPlaying) {
    a.pause();
    state = { ...state, isPlaying: false };
    notify();
    return;
  }
  if (state.currentId !== id) {
    a.src = url;
    state = {
      ...state,            // preserve queue
      currentId: id,
      isPlaying: false,
      meta: meta ?? null,
      duration: 0,
      position: 0,
    };
    setGenreFromKey(meta?.genre);
    notify();
  } else if (opts?.force) {
    // Force-replay of the same track — seek back to 0 so it actually
    // restarts instead of merely no-op'ing the play() promise.
    try { a.currentTime = 0; } catch { /* edge: not seekable yet */ }
    if (meta) state = { ...state, meta, position: 0 };
    else      state = { ...state, position: 0 };
    notify();
  } else if (meta) {
    state = { ...state, meta };
    notify();
  }
  void a.play().then(
    () => {
      _userHasPlayed = true;
      state = { ...state, currentId: id, isPlaying: true };
      notify();
      // Wire the analyser graph on first successful play (must happen
      // post-gesture so AudioContext isn't blocked) and start the beat
      // envelope loop driving the 3D building windows.
      ensureAudioGraph();
      if (_audioCtx && _audioCtx.state === 'suspended') void _audioCtx.resume();
      startBeatLoop();
      // Snapshot the just-started track so a reload lands on
      // "Continue Playing" with this exact track + queue.
      persistContinuePlaying();
    },
    () => {
      // Autoplay blocked or network failure. Keep currentId + meta
      // so the NowPlayingBar stays visible in a paused-and-ready
      // state — the user just clicks Play to resume. Previously we
      // wiped state to null which made the bar disappear on every
      // browser autoplay rejection (confusing on first load).
      state = { ...state, isPlaying: false, position: 0 };
      notify();
    },
  );
}

/** Pre-load a track INTO the bar without starting playback. Used by
 *  the building-select effect when the user hasn't issued their
 *  first play gesture yet — the NowPlayingBar shows the
 *  paused-and-ready state so the play button is immediately
 *  visible, addressing the "where's the play button?" first-visit
 *  confusion. No AudioContext is touched; clicking Play later kicks
 *  off the full pipeline via resumePreview/playPreview. */
export function preloadPreview(id: string, url: string, meta?: TrackMeta): void {
  const a = ensureAudio();
  if (state.currentId === id) return;
  a.src = url;
  state = {
    ...state,
    currentId: id,
    isPlaying: false,
    meta: meta ?? null,
    duration: 0,
    position: 0,
  };
  setGenreFromKey(meta?.genre);
  notify();
}

/** Replace the prev/next queue without interrupting current playback.
 *  Called by surfaces that want the bar's nav buttons to work — e.g.
 *  the auto-play effect in App.tsx hands over the building's #1
 *  playlist as a queue right after starting the first track.
 *
 *  `buildingId` (optional) tags this queue with its source building
 *  so the NowPlayingBar's "+" can pin even after the user deselects
 *  the building. Pass `null` for queues that aren't building-scoped. */
export function setQueue(queue: QueueEntry[], buildingId: string | null = null): void {
  state = { ...state, queue, currentBuildingId: buildingId };
  notify();
}

/** Skip forward to the next track in the queue. Honors shuffle
 *  (random) and repeat:'all' (wraps to start at the end).
 *
 *  Bug fix (2026-05-04): when the user starts playback from a source
 *  that didn't seed the queue (e.g. an AddTrackComposer search
 *  result, a RecommendedList row, or a track popped in via the
 *  hovering callout) the current track isn't a member of `queue`.
 *  Previously `findIndex` returned -1 and the function silently
 *  no-op'd — the next button looked enabled but did nothing. We now
 *  fall through to queue[0] in that case so the user always gets
 *  forward motion as long as a queue exists. */
export function nextTrack(): void {
  if (state.queue.length === 0) return;
  const idx = state.queue.findIndex((q) => q.id === state.currentId);
  if (state.shuffle && state.queue.length > 1) {
    const base = idx < 0 ? -1 : idx;
    let r = base;
    while (r === base) r = Math.floor(Math.random() * state.queue.length);
    const next = state.queue[r];
    playPreview(next.id, next.url, next.meta);
    return;
  }
  if (idx < 0) {
    // Current track not in queue — start the queue from the top.
    const first = state.queue[0];
    playPreview(first.id, first.url, first.meta);
    return;
  }
  if (idx < state.queue.length - 1) {
    const next = state.queue[idx + 1];
    playPreview(next.id, next.url, next.meta);
    return;
  }
  if (state.repeat === 'all') {
    const first = state.queue[0];
    playPreview(first.id, first.url, first.meta);
  }
}

/** Synchronous read of the current player snapshot. Use ONLY from
 *  effect timeouts / event handlers where you can't subscribe via
 *  the `usePlayerState` hook. */
export function getPlayerStateSnapshot(): PlayerState {
  return state;
}

/** Set output volume in [0, 1]. Persists to localStorage. Auto-unmutes
 *  if the user drags the slider above 0 while muted (Apple Music
 *  behavior — touching the slider implies "I want to hear this"). */
export function setVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  const a = ensureAudio();
  a.volume = clamped;
  const wasMuted = state.muted;
  const nextMuted = wasMuted && clamped === 0; // unmute when raised
  a.muted = nextMuted;
  state = { ...state, volume: clamped, muted: nextMuted };
  persistVolPrefs();
  notify();
}

/** Toggle mute without losing the chosen volume. */
export function toggleMute(): void {
  const a = ensureAudio();
  const nextMuted = !state.muted;
  a.muted = nextMuted;
  state = { ...state, muted: nextMuted };
  persistVolPrefs();
  notify();
}

function persistVolPrefs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      VOL_KEY,
      JSON.stringify({ volume: state.volume, muted: state.muted }),
    );
  } catch { /* storage quota / private mode — silently ignore */ }
}

// ── Continue Playing snapshot ──────────────────────────────────────
//
// Apple Music macOS surfaces a "Continue Playing" rail on launch so
// the user resumes the last track they were on. VIBLOC mirrors that
// by writing the active track + queue + building anchor to
// localStorage on every track change. On boot we load it into state
// and pre-populate the bar — paused (autoplay policies forbid
// auto-starting audio without a gesture) so the user just hits play
// to resume from the same point.

// v2 (2026-05-04): bumped from `vibloc.player.cont` to invalidate
// old snapshots whose `meta` lacked the `genre` field. Without the
// bump, restored sessions render the EQ visualization in white
// (no genre tint) until the user manually changes tracks. Old
// snapshots are silently dropped on read; the localStorage entry
// itself is left for now (next write will overwrite).
const CONT_KEY = 'vibloc.player.cont.v2';

type ContSnapshot = {
  currentId: string;
  url: string;
  meta: TrackMeta;
  queue: QueueEntry[];
  currentBuildingId: string | null;
};

export function persistContinuePlaying(): void {
  if (typeof window === 'undefined') return;
  if (!state.currentId || !state.meta) return;
  // Resolve the active queue entry's URL (we kept it on the entry,
  // not on the player state, since multiple tracks share the bar).
  const entry = state.queue.find((q) => q.id === state.currentId);
  if (!entry) return;
  const snap: ContSnapshot = {
    currentId: state.currentId,
    url: entry.url,
    meta: state.meta,
    queue: state.queue,
    currentBuildingId: state.currentBuildingId,
  };
  try {
    window.localStorage.setItem(CONT_KEY, JSON.stringify(snap));
  } catch { /* ignore */ }
}

/** Read the previously-saved snapshot (if any) and seed the player
 *  state — without auto-playing. The caller (typically the App's
 *  bootstrap effect) renders the bar in a paused state; the user's
 *  first play gesture will resume from the persisted track. */
export function restoreContinuePlaying(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CONT_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw) as ContSnapshot;
    if (!snap?.currentId || !snap?.meta || !Array.isArray(snap.queue)) return;
    const a = ensureAudio();
    a.src = snap.url;
    state = {
      ...state,
      currentId: snap.currentId,
      meta: snap.meta,
      queue: snap.queue,
      currentBuildingId: snap.currentBuildingId ?? null,
      isPlaying: false,
      duration: 0,
      position: 0,
    };
    // Restore genre tint from the snapshot's meta — without this the
    // EQ visualization would render in white on the first resume play
    // until the user manually changed tracks.
    setGenreFromKey(snap.meta.genre);
    notify();
  } catch { /* corrupted snapshot — ignore */ }
}

/** Toggle shuffle on / off. */
export function toggleShuffle(): void {
  state = { ...state, shuffle: !state.shuffle };
  notify();
}

/** Cycle repeat: off → all → one → off. Matches Apple Music. */
export function cycleRepeat(): void {
  const next: PlayerState['repeat'] =
    state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  state = { ...state, repeat: next };
  notify();
}

/** Step back to the previous track. If the playhead is past the
 *  3-second mark, restart the current track instead (Spotify /
 *  Apple Music convention) so the user can skip back to the start.
 *
 *  Mirror of nextTrack's queue-not-containing-current fix: when
 *  current track isn't in the queue, just seek the current track
 *  back to 0 (no useful "previous" exists). */
export function prevTrack(): void {
  if (state.position > 3) {
    seekPreview(0);
    return;
  }
  const idx = state.queue.findIndex((q) => q.id === state.currentId);
  if (idx <= 0) {
    seekPreview(0);
    return;
  }
  const prev = state.queue[idx - 1];
  playPreview(prev.id, prev.url, prev.meta);
}

/** Resume the currently-loaded track without reloading its src. Used
 *  by the NowPlayingBar's play button — saves a network round-trip
 *  vs. calling playPreview again. */
export function resumePreview(): void {
  const a = ensureAudio();
  if (!state.currentId) return;
  void a.play().then(() => {
    _userHasPlayed = true;
    state = { ...state, isPlaying: true };
    notify();
    ensureAudioGraph();
    if (_audioCtx && _audioCtx.state === 'suspended') void _audioCtx.resume();
    startBeatLoop();
  });
}

/** Pause without resetting playhead — Space-bar style toggle. */
export function pausePreview(): void {
  const a = ensureAudio();
  a.pause();
  state = { ...state, isPlaying: false };
  notify();
  stopBeatLoop();
}

/** Stop everything and clear track metadata so the NowPlayingBar
 *  fades out. */
export function stopPreview(): void {
  const a = ensureAudio();
  a.pause();
  a.currentTime = 0;
  stopBeatLoop();
  // Soft close — user's mental model for the × button is "hide for
  // now", not "wipe everything". We clear the active track so the
  // bar disappears, but PRESERVE the queue + shuffle / repeat
  // preferences so reopening (e.g. clicking a row in the rail)
  // resumes from the same context.
  state = {
    ...state,
    currentId: null, isPlaying: false, meta: null, duration: 0, position: 0,
    // currentBuildingId preserved — closing the bar shouldn't lose
    // the building anchor for the next + click on the same context.
  };
  notify();
}

/** Seek to a time (seconds). Clamped to [0, duration]. */
export function seekPreview(seconds: number): void {
  const a = ensureAudio();
  if (!a.duration) return;
  a.currentTime = Math.max(0, Math.min(a.duration, seconds));
  state = { ...state, position: a.currentTime };
  notify();
}

/** React hook — re-renders the consumer when the player state
 *  changes, so each ▶ button shows ▶ vs ⏸ correctly. */
export function usePlayerState(): PlayerState {
  const [snapshot, setSnapshot] = useState<PlayerState>(state);
  useEffect(() => {
    const l: Listener = (s) => setSnapshot(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snapshot;
}
