import { gsap } from 'gsap';

// ═══════════════════════════════════════════════════════════════
// AUTO-SCROLL
// ═══════════════════════════════════════════════════════════════

// Total seconds for full scroll at normal speed (excluding dwells)
const SCROLL_DURATION = 75;

// Seconds to pause on each fully-rendered card
const DWELL_SECS = 1.2;

// Cinematic scrub lag for manual scroll (mirrors ScrollTimeline.js scrub:7).
const MANUAL_SCRUB = 7;
// Tight scrub during autoscroll — timeline tracks the programmatic scroll
// near-instantly so dwells land on the centered card with no settling lag.
const AUTO_SCRUB = 0.2;

// Scroll distance before each peak where the entry slide-in begins.
// During entry, we scroll slower so the slide-in + type effect is visible.
const ENTRY_LEAD = 0.015;

// Forced minimum seconds for that entry segment so slide-in is always visible.
const ENTRY_DUR = 1.1;

// Cap any single sweep so the long intro doesn't take forever.
const SWEEP_MAX = 8;

// ── ScrollTimeline card-section constants (must match ScrollTimeline.js) ──
const P_SKY_END    = 0.72;
const P_CARDS_END  = 0.94;
const MORPH_BUFFER = 0.35;
const NUM_CARDS    = 5;
const ENTER_FRAC   = 0.25;
const EXIT_START   = 0.80;

export class AutoScroller {
  constructor(btn, icon, masterTimeline) {
    this.btn   = btn;
    this.icon  = icon;
    this.tl    = masterTimeline;
    this.tween = null;
    this.active = false;

    // ── Compute card peaks dynamically from the actual timeline ──
    const totalDur   = masterTimeline.duration();
    const cardsStart = P_SKY_END + (P_CARDS_END - P_SKY_END) * MORPH_BUFFER;
    const cardsEnd   = P_CARDS_END - 0.01;
    const cardsSpan  = cardsEnd - cardsStart;
    const per        = cardsSpan / NUM_CARDS;
    const holdMid    = (ENTER_FRAC + EXIT_START) / 2;

    this.cardPeaks = [];
    for (let i = 0; i < NUM_CARDS; i++) {
      const at = cardsStart + i * per;
      const peakTime = at + per * holdMid;
      this.cardPeaks.push(peakTime / totalDur);
    }

    btn.addEventListener('click', () => this.toggle());

    window.addEventListener('wheel', () => { if (this.active) this.pause(); }, { passive: true });
    window.addEventListener('touchstart', (e) => {
      if (this.active && !btn.contains(e.target)) this.pause();
    }, { passive: true });
  }

  get _st()       { return this.tl && this.tl.scrollTrigger; }
  get maxScroll() { return Math.max(0, document.body.scrollHeight - window.innerHeight); }

  _setScrub(secs) {
    const st = this._st;
    if (!st || !st.getTween) return;
    const t = st.getTween();
    if (t) t.duration(secs);
  }

  toggle() { this.active ? this.pause() : this.play(); }

  play() {
    if (this.maxScroll <= 0) return;
    const currentFrac = window.scrollY / this.maxScroll;
    if (1.0 - currentFrac <= 0.001) return;

    this.active = true;
    this.icon.textContent = '■';
    this.btn.classList.add('is-playing');

    this._setScrub(AUTO_SCRUB);

    // Build waypoints: for each card peak, insert a waypoint just before it
    // to switch to 'entry' speed, then a waypoint AT the peak to freeze & dwell.
    const waypoints = [];
    for (const p of this.cardPeaks) {
      if (p <= currentFrac + 0.001) continue;
      
      const entryStart = p - ENTRY_LEAD;
      if (entryStart > currentFrac + 0.001) {
        waypoints.push({ frac: entryStart, kind: 'sweep' });
      }
      waypoints.push({ frac: p, kind: 'entry' });
    }
    
    // Add final void
    waypoints.push({ frac: 1.0, kind: 'end' });

    this._tweenTo(currentFrac, waypoints, 0);
  }

  pause() {
    this.active = false;
    this.icon.textContent = '▶';
    this.btn.classList.remove('is-playing');
    if (this.tween) { this.tween.kill(); this.tween = null; }
    this._setScrub(MANUAL_SCRUB);
  }

  _tweenTo(fromFrac, waypoints, idx) {
    if (!this.active || idx >= waypoints.length) return;

    const wp = waypoints[idx];
    const { frac: toFrac, kind } = wp;
    const max = this.maxScroll;

    const distance = toFrac - fromFrac;
    if (distance <= 0.001) {
      this._tweenTo(toFrac, waypoints, idx + 1);
      return;
    }

    const base = distance * SCROLL_DURATION;
    let duration, ease;

    if (kind === 'entry') {
      duration = Math.max(base, ENTRY_DUR);
      ease     = 'power2.out';
    } else if (kind === 'end') {
      duration = Math.min(base, 3.0);
      ease     = 'power1.in';
    } else {
      // Don't cap the sweep duration artificially (used to be capped at 8s),
      // which caused long sections to fly by way too fast. 
      // Let it take its natural time (distance * SCROLL_DURATION).
      duration = base;
      ease     = 'none';
    }

    const proxy = { f: fromFrac };

    this.tween = gsap.to(proxy, {
      f:        toFrac,
      duration,
      ease,
      onUpdate: () => { window.scrollTo(0, proxy.f * max); },
      onComplete: () => {
        if (!this.active) return;
        this.tween = null;

        if (kind === 'end') {
          this._onComplete();
          return;
        }

        if (kind === 'entry') {
          // Reached card peak → freeze for DWELL_SECS
          this.tween = gsap.delayedCall(DWELL_SECS, () => {
            if (!this.active) return;
            this.tween = null;
            this._tweenTo(toFrac, waypoints, idx + 1);
          });
        } else {
          // Reached sweep waypoint → immediately proceed
          this._tweenTo(toFrac, waypoints, idx + 1);
        }
      },
    });
  }

  _onComplete() {
    this.active = false;
    this.icon.textContent = '▶';
    this.btn.classList.remove('is-playing');
    this.tween = null;

    const max   = this.maxScroll;
    const proxy = { f: 1.0 };

    gsap.to(proxy, {
      f:        0,
      duration: 2.5,
      ease:     'power2.inOut',
      onUpdate: () => { window.scrollTo(0, proxy.f * max); },
      onComplete: () => {
        this._setScrub(MANUAL_SCRUB);
        // show end hint
        const hint = document.getElementById('scroll-hint');
        if (hint) gsap.to(hint, { opacity: 1, duration: 1, delay: 0.4 });
      },
    });
  }
}

