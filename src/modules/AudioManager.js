// ═══════════════════════════════════════════════════════════════
// AUDIO MANAGER
// Handles ambient background audio with:
//   - Deferred start (no autoplay — waits for user gesture)
//   - Smooth fade-in via GSAP (avoids jarring audio pop)
//   - Mute/unmute toggle with GSAP gain animation
//   - Loop: source.loop = true for seamless ambient loop
//
// Web Audio API notes:
//   - AudioContext must be created/resumed after a user gesture
//     (browser policy). We defer start until first scroll or click.
//   - GainNode sits between source and destination (speakers).
//     Animating gain.value smoothly crossfades the audio level.
//   - We use GSAP to tween gain because AudioParam scheduling
//     has tricky ramp timing; GSAP's ticker approach is simpler here.
// ═══════════════════════════════════════════════════════════════

import { gsap } from 'gsap';

export class AudioManager {
  /**
   * @param {string} audioPath - Path to ambient audio file (e.g. '/audio/ambient.mp3')
   * @param {HTMLButtonElement} muteButton - The #mute-toggle DOM element
   * @param {HTMLSpanElement} muteIcon - The #mute-icon span inside the button
   */
  constructor(audioPath, muteButton, muteIcon) {
    this.audioPath   = audioPath;
    this.muteButton  = muteButton;
    this.muteIcon    = muteIcon;

    this.context     = null;   // AudioContext — created on first user interaction
    this.gainNode    = null;   // GainNode — controls volume
    this.source      = null;   // AudioBufferSourceNode — the playing audio
    this.audioBuffer = null;   // Decoded PCM data — loaded via fetch

    this.isStarted   = false;  // Has audio been started yet?
    this.isMuted     = false;  // Current mute state

    // Target gain levels
    this.GAIN_NORMAL  = 0.4;   // Normal volume (0.0–1.0 range)
    this.GAIN_MUTED   = 0.0;   // Muted (silence)
    this.FADE_IN_SECS = 3.0;   // Duration of initial fade-in

    this._bindMuteButton();
  }

  /**
   * Load the audio file in the background.
   * Called during init — doesn't start playback yet.
   * AudioContext not created until first user gesture.
   */
  preload() {
    // Store the promise so start() can await it — the ambient file is large and
    // the user may hit ENTER before the fetch finishes.
    this._preloadPromise = this._load();
    return this._preloadPromise;
  }

  async _load() {
    try {
      // fetch the file as an ArrayBuffer (raw binary audio data)
      const response = await fetch(this.audioPath);

      if (!response.ok) {
        // Audio file not found (placeholder path) — fail gracefully
        console.warn(`[AudioManager] Audio file not found at ${this.audioPath}. Mute button disabled.`);
        this.muteButton.style.opacity = '0.2';
        this.muteButton.disabled = true;
        return;
      }

      // Store raw bytes — we'll decode them when AudioContext is created
      // (Can't decode without AudioContext, and AudioContext needs user gesture first)
      this._rawBuffer = await response.arrayBuffer();

    } catch (err) {
      console.warn('[AudioManager] Failed to load audio:', err.message);
    }
  }

  /**
   * Start audio playback — called on first user interaction (scroll or click).
   * Idempotent: safe to call multiple times, only starts once.
   */
  async start() {
    if (this.isStarted) return;
    // Wait for the (possibly still-in-flight) preload before giving up.
    if (!this._rawBuffer && this._preloadPromise) {
      try { await this._preloadPromise; } catch (e) { /* handled in _load */ }
    }
    if (!this._rawBuffer) return;
    this.isStarted = true;

    // Create AudioContext AFTER user gesture (browser policy)
    // AudioContext is the main entry point for Web Audio API
    this.context = new (window.AudioContext || window.webkitAudioContext)();

    // Resume in case browser suspended it (happens in some contexts)
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // SFX gain — created NOW, before the slow ambient decode below, so UI sfx
    // (incl. the ENTER click sound) can play immediately. Goes straight to the
    // speakers, bypassing the music gain → unaffected by the mute toggle.
    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.context.destination);

    // Decode the raw ArrayBuffer into PCM audio data (AudioBuffer)
    // This is CPU-intensive but happens once — PCM is ready to loop
    this.audioBuffer = await this.context.decodeAudioData(
      this._rawBuffer.slice(0)  // slice(0) prevents detached buffer issues on re-decode
    );

    // GainNode: the volume control
    // gain.value = 0 → silence, 1 → full volume
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 0;  // Start silent — will fade in

    // Connect audio graph: source → gain → speakers
    this.gainNode.connect(this.context.destination);

    // AudioBufferSourceNode: plays the decoded buffer
    this.source = this.context.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.loop   = true;    // Seamless loop for ambient audio
    this.source.connect(this.gainNode);
    this.source.start(0);         // Start immediately (but gain is 0 = silent)

    // Instant gain on start — music plays the moment ENTER is clicked.
    this.gainNode.gain.setValueAtTime(this.GAIN_NORMAL, this.context.currentTime);
  }

  /**
   * Smoothly animate AudioParam gain to a target value.
   * Uses requestAnimationFrame polling instead of AudioParam scheduling
   * for compatibility with GSAP's timing model.
   *
   * @param {number} targetValue - Destination gain [0, 1]
   * @param {number} duration    - Seconds for the tween
   */
  _tweenGain(targetValue, duration) {
    if (!this.gainNode) return;

    const startTime  = this.context.currentTime;
    const startValue = this.gainNode.gain.value;

    // cancelScheduledValues clears any pending AudioParam automations
    this.gainNode.gain.cancelScheduledValues(startTime);
    this.gainNode.gain.setValueAtTime(startValue, startTime);

    // linearRampToValueAtTime: built-in linear interpolation in AudioParam
    // More accurate than JS polling because it runs on the audio thread
    this.gainNode.gain.linearRampToValueAtTime(targetValue, startTime + duration);
  }

  /**
   * Toggle mute state with smooth gain animation.
   * Updates button aria-label and visual state class.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      // Muting: fade out over 0.5s (quick but not instant — avoids click)
      this._tweenGain(this.GAIN_MUTED, 0.5);
      this.muteButton.classList.add('is-muted');
      this.muteButton.setAttribute('aria-label', 'Unmute audio');
      this.muteIcon.textContent = '◇';  // Empty diamond = muted
    } else {
      // Unmuting: fade in over 1.0s (slightly slower than mute for feel)
      this._tweenGain(this.GAIN_NORMAL, 1.0);
      this.muteButton.classList.remove('is-muted');
      this.muteButton.setAttribute('aria-label', 'Mute audio');
      this.muteIcon.textContent = '◈';  // Filled diamond = playing
    }
  }

  /**
   * Load a short SFX clip for UI hover/click feedback.
   * Requires AudioContext to be ready (call after start()).
   */
  async loadSfx(url) {
    let retries = 0;
    while (!this.context && retries++ < 30) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!this.context) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      this.sfxBuffer = await this.context.decodeAudioData(buf);
    } catch (e) { /* sfx.mp3 not present — skip silently */ }
  }

  /** Play the loaded SFX once. No-op if buffer absent. Routes through the
   *  dedicated sfxGain so it is NEVER affected by the music mute toggle. */
  playSfx() {
    if (!this.sfxBuffer || !this.context || !this.sfxGain) return;
    try {
      const src = this.context.createBufferSource();
      src.buffer = this.sfxBuffer;
      src.connect(this.sfxGain);
      src.start(0);
    } catch (e) { /* ignore play errors */ }
  }

  _bindMuteButton() {
    this.muteButton.addEventListener('click', () => {
      // First click also starts audio (in case scroll didn't trigger it)
      if (!this.isStarted) {
        this.start();
      }
      this.toggleMute();
    });
  }
}
