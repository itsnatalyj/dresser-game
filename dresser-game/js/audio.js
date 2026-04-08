/* ================================================================
   DRESSER DRAWER GAME — audio.js
   Background music, pickup, drop, and reset sounds.

   ── HOW TO USE YOUR OWN AUDIO FILES ──────────────────────────
   1. Put your files in the  assets/audio/  folder
   2. Update the file paths in AUDIO_FILES below
   3. Supported formats: .mp3  .ogg  .wav
   4. If a file isn't found, a gentle synthesized sound plays instead

   ── VOLUME GUIDE ─────────────────────────────────────────────
   All volumes are 0.0 (silent) → 1.0 (full).
   Music is intentionally quiet so it doesn't distract.
   ================================================================ */


// ══════════════════════════════════════════════════════════════
//   CONFIGURATION  ← the only section you need to edit
// ══════════════════════════════════════════════════════════════

const AUDIO_FILES = {
  music:  'assets/audio/music.mp3',    // background loop — any length, loops automatically
  pickup: 'assets/audio/pickup.mp3',   // played when an object is grabbed
  drop:   'assets/audio/drop.mp3',     // played when an object is released
  reset:  'assets/audio/reset.mp3',    // played when the Reset button is clicked
};

const VOLUMES = {
  music:  0.13,   // background music — intentionally low
  pickup: 0.42,
  drop:   0.38,
  reset:  0.40,
};


// ══════════════════════════════════════════════════════════════
//   INTERNAL STATE — no need to edit below this line
// ══════════════════════════════════════════════════════════════

let audioCtx     = null;   // Web Audio API context
let unlocked     = false;  // true after first user gesture
let musicStarted = false;  // prevent double-starting music
const sfxCache   = {};     // preloaded Audio elements for SFX files


// ══════════════════════════════════════════════════════════════
//   INIT
//   Call once when the page loads (already called at the bottom
//   of this file — no action needed from you).
// ══════════════════════════════════════════════════════════════
function initAudio() {
  // Pre-load SFX files in the background (silently, no errors if missing)
  preloadSFX();

  // Register a one-time listener for the first user interaction.
  // Browsers block audio until the user has clicked or typed something.
  // The listener fires on the first click/touch/keypress anywhere on the page.
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;

    // Remove the hint now that audio is ready
    const hint = document.getElementById('audio-hint');
    if (hint) {
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 500);
    }

    // Boot the audio engine
    _bootAudioContext();
    startMusic();
  };

  document.addEventListener('mousedown',  unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('keydown',    unlock, { once: true });
}


// ══════════════════════════════════════════════════════════════
//   PUBLIC FUNCTIONS
//   These are called from main.js at the right moments.
// ══════════════════════════════════════════════════════════════

// Called when an object is grabbed (pinch starts on an object)
function playPickup() {
  _playSFX('pickup', _synthPickup);
}

// Called when an object is dropped (pinch releases)
function playDrop() {
  _playSFX('drop', _synthDrop);
}

// Called when the Reset button is clicked
function playReset() {
  _playSFX('reset', _synthReset);
}


// ══════════════════════════════════════════════════════════════
//   BACKGROUND MUSIC
// ══════════════════════════════════════════════════════════════

function startMusic() {
  if (musicStarted || !unlocked) return;
  musicStarted = true;

  // Try loading the music file first
  const audio = new Audio(AUDIO_FILES.music);
  audio.loop   = true;
  audio.volume = VOLUMES.music;

  // File loaded successfully → play it
  audio.addEventListener('canplaythrough', () => {
    audio.play()
      .then(() => console.log('🎵 Background music playing from file.'))
      .catch(() => {
        // If play() still fails (shouldn't happen post-unlock), fall back
        _startGeneratedAmbient();
      });
  }, { once: true });

  // File not found → use synthesized ambient pad instead
  audio.addEventListener('error', () => {
    console.log('🎵 Music file not found — using generated ambient pad.');
    _startGeneratedAmbient();
  }, { once: true });

  audio.load();
}


// ══════════════════════════════════════════════════════════════
//   GENERATED AMBIENT PAD (fallback when music file is missing)
//   A soft, looping C-major chord made from gentle oscillators.
//   Warm and unobtrusive — fades in slowly over ~3 seconds.
// ══════════════════════════════════════════════════════════════
function _startGeneratedAmbient() {
  if (!audioCtx) return;

  // Master output gain — starts silent, ramps up gently
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(VOLUMES.music, audioCtx.currentTime + 3.5);
  master.connect(audioCtx.destination);

  // Low-pass filter softens the tone (removes harshness)
  const lpf = audioCtx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 700;
  lpf.Q.value = 0.5;
  lpf.connect(master);

  // C major chord: C3 · G3 · C4 · E4  (calm, open, cozy)
  const chord = [
    { freq: 130.81, detune: -4,  vol: 0.22 },  // C3
    { freq: 196.00, detune:  3,  vol: 0.20 },  // G3
    { freq: 261.63, detune: -2,  vol: 0.18 },  // C4
    { freq: 329.63, detune:  4,  vol: 0.14 },  // E4
  ];

  chord.forEach(({ freq, detune, vol }) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type          = 'sine';
    osc.frequency.value = freq;
    osc.detune.value  = detune;   // slight detuning = warmth
    gain.gain.value   = vol / chord.length;

    osc.connect(gain);
    gain.connect(lpf);
    osc.start();
    // These oscillators run indefinitely until the page closes
  });

  console.log('🎵 Generated ambient chord started.');
}


// ══════════════════════════════════════════════════════════════
//   SFX HELPERS
// ══════════════════════════════════════════════════════════════

// Pre-load SFX audio files silently (no errors if files are missing)
function preloadSFX() {
  ['pickup', 'drop', 'reset'].forEach(name => {
    const path = AUDIO_FILES[name];
    if (!path) return;

    const a = new Audio(path);
    a.volume = VOLUMES[name];
    a.addEventListener('canplaythrough', () => {
      sfxCache[name] = a;
    }, { once: true });
    a.load();
  });
}

// Play a named SFX (from file if loaded, otherwise use synthFn)
function _playSFX(name, synthFn) {
  if (!unlocked) return;

  if (sfxCache[name]) {
    // Clone the audio node so rapid successive plays don't cut each other off
    const clone = sfxCache[name].cloneNode();
    clone.volume = VOLUMES[name];
    clone.play().catch(() => {});
  } else if (audioCtx && synthFn) {
    synthFn();
  }
}

// Create the AudioContext (called on first user gesture)
function _bootAudioContext() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.warn('Web Audio API not available:', e);
  }
}


// ══════════════════════════════════════════════════════════════
//   SYNTHESIZED SOUNDS
//   Gentle placeholder sounds using Web Audio API oscillators.
//   Replace by adding real audio files to assets/audio/.
// ══════════════════════════════════════════════════════════════

// Pickup: a soft rising chime — two overlapping tones sweeping up
function _synthPickup() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  [
    { freq: 523, delay: 0.00, dur: 0.30, rise: 1.20 },  // C5 → rising
    { freq: 659, delay: 0.05, dur: 0.28, rise: 1.18 },  // E5 → rising
  ].forEach(({ freq, delay, dur, rise }) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + delay);
    osc.frequency.exponentialRampToValueAtTime(freq * rise, t + delay + 0.12);

    gain.gain.setValueAtTime(0, t + delay);
    gain.gain.linearRampToValueAtTime(VOLUMES.pickup * 0.50, t + delay + 0.020);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);

    osc.start(t + delay);
    osc.stop(t + delay + dur + 0.02);
  });
}

// Drop: a soft descending tone — like setting something down gently
function _synthDrop() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  [
    { freq: 300, delay: 0.00, dur: 0.22, fall: 0.62 },  // mid → falls
    { freq: 150, delay: 0.01, dur: 0.28, fall: 0.70 },  // low → falls slower
  ].forEach(({ freq, delay, dur, fall }) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + delay);
    osc.frequency.exponentialRampToValueAtTime(freq * fall, t + delay + dur);

    gain.gain.setValueAtTime(VOLUMES.drop * 0.52, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);

    osc.start(t + delay);
    osc.stop(t + delay + dur + 0.02);
  });
}

// Reset: a gentle ascending sparkle — three soft notes in sequence
function _synthReset() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  [
    { freq: 523, delay: 0.00 },  // C5
    { freq: 659, delay: 0.09 },  // E5
    { freq: 784, delay: 0.18 },  // G5
  ].forEach(({ freq, delay }) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, t + delay);
    gain.gain.linearRampToValueAtTime(VOLUMES.reset * 0.48, t + delay + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.42);

    osc.start(t + delay);
    osc.stop(t + delay + 0.46);
  });
}


// ══════════════════════════════════════════════════════════════
//   AUTO-INIT — runs when the file is loaded
// ══════════════════════════════════════════════════════════════
initAudio();
