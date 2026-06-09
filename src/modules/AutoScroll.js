import { gsap } from 'gsap';

// ═══════════════════════════════════════════════════════════════
// AUTO-SCROLL — uniform per-card cadence
//
// Card peak positions are computed DYNAMICALLY from the master
// timeline's actual duration — no more hardcoded values that
// drift when timeline tweens change the totalDuration.
// ═══════════════════════════════════════════════════════════════

// Seconds to freeze on each fully-rendered card (reading time).
const DWELL_SECS = 1.2;

// Fixed seconds for the inter-card sweep.
const SWEEP_DUR = 1.0;

// Fixed seconds for the card entry slide-in.
const ENTRY_DUR = 1.5;

// Cap for the initial long sweep from page top → first card.
const INTRO_SWEEP_MAX = 7;

// Scroll distance before each peak where the entry slide-in begins.
const ENTRY_LEAD = 0.008;

// Cinematic scrub lag for manual scroll (mirrors ScrollTimeline.js scrub:7).
const MANUAL_SCRUB = 7;
// Near-zero scrub during autoscroll — virtually no lag between scroll and timeline.
const AUTO_SCRUB = 0.01;

// Final void scroll duration.
const END_DUR = 2.0;

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
    // GSAP's totalDuration is NOT 1.0 — it's determined by the last tween.
    // The scroll fraction maps to timeline progress (0→1), which maps to
    // time (0→totalDuration). Card tweens are placed at absolute time
    // positions, so we must divide by totalDuration to get scroll fractions.
    const totalDur   = masterTimeline.duration();
    const cardsStart = P_SKY_END + (P_CARDS_END - P_SKY_END) * MORPH_BUFFER;
    const cardsEnd   = P_CARDS_END - 0.01;
    const cardsSpan  = cardsEnd - cardsStart;
    const per        = cardsSpan / NUM_CARDS;
    const holdMid    = (ENTER_FRAC + EXIT_START) / 2;  // 0.525

    this.cardPeaks = [];
    for (let i = 0; i < NUM_CARDS; i++) {
      const at = cardsStart + i * per;
      const peakTime = at + per * holdMid;
      // Convert timeline time → scroll fraction
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

    // Build waypoints: for each card →
    //   sweep (fast scroll to entry start) → entry (slow slide-in) → dwell (read)
    // Every card gets the exact same entry + dwell duration.
    const waypoints = [];
    let isFirstCard = true;

    for (const peak of this.cardPeaks) {
      if (peak <= currentFrac + 0.001) continue;

      const entryStart = peak - ENTRY_LEAD;

      // Sweep: fast scroll to entry start
      if (entryStart > currentFrac + 0.001) {
        waypoints.push({
          frac: entryStart,
          kind: 'sweep',
          dur:  isFirstCard ? INTRO_SWEEP_MAX : SWEEP_DUR,
          ease: isFirstCard ? 'power1.inOut' : 'power1.out',
        });
      }

      // Entry: slow eased slide-in to card center
      waypoints.push({
        frac: peak,
        kind: 'entry',
        dur:  ENTRY_DUR,
        ease: 'power2.out',
      });

      isFirstCard = false;
    }

    // Final void section
    waypoints.push({
      frac: 1.0,
      kind: 'end',
      dur:  END_DUR,
      ease: 'power1.in',
    });

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

    const { frac: toFrac, kind, dur, ease } = waypoints[idx];
    const max      = this.maxScroll;
    const distance = toFrac - fromFrac;

    if (distance <= 0.001) {
      this._tweenTo(toFrac, waypoints, idx + 1);
      return;
    }

    const proxy = { f: fromFrac };

    this.tween = gsap.to(proxy, {
      f:        toFrac,
      duration: dur,
      ease,
      onUpdate: () => { window.scrollTo(0, proxy.f * max); },
      onComplete: () => {
        if (!this.active) return;
        this.tween = null;

        if (kind === 'end') { this._onComplete(); return; }
        if (kind !== 'entry') { this._tweenTo(toFrac, waypoints, idx + 1); return; }

        // Entry done → card centered. Dwell: freeze for reading.
        // Every card gets the exact same DWELL_SECS.
        this.tween = gsap.delayedCall(DWELL_SECS, () => {
          if (!this.active) return;
          this.tween = null;
          this._tweenTo(toFrac, waypoints, idx + 1);
        });
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
        const hint = document.getElementById('scroll-hint');
        if (hint) gsap.to(hint, { opacity: 1, duration: 1, delay: 0.4 });
      },
    });
  }
}

