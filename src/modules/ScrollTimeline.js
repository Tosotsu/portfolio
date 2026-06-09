// ═══════════════════════════════════════════════════════════════
// SCROLL TIMELINE — 6 cinematic beats
//
//   1 INTRO   (0%–13%):  Sparse mountains & valleys — the GROUND packs the
//                        lower half of the frame (no empty void). Camera low.
//   2 UNRAVEL (13%–24%): Camera sweeps sideways past the surrounding peaks.
//   3 HAND    (24%–38%): A HAND forms FAST out of the ground particles below
//                        and stays intact (terrain + hand both present).
//   4 SKY     (38%–55%): Fairy dust is thrown UP out of the ground; camera
//                        follows it up into the night sky — a few glowing stars.
//   5 CARDS   (55%–80%): The terrain flips into the card section — start
//                        terrain on the bottom, mirrored on top — and the
//                        scroll reveals the project cards ONE AT A TIME (zoom).
//   6 VOID    (80%–100%): Back to normal — everything fades to a dark void;
//                        the final message.
//
// Camera driven procedurally (keyframe lerp). No upside-down roll — the sky
// beat simply tilts the look UP; the ending is upright/normal.
// ═══════════════════════════════════════════════════════════════

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase }    from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, CustomEase);

// SHORT opening (kinder to mobile) then long, well-framed later beats so the
// night-sky text has room to be read.
const P_INTRO_END   = 0.08;   // intro      0.00→0.08
const P_UNRAVEL_END = 0.16;   // unravel    0.08→0.16  (start is brief now)
const P_HAND_END    = 0.30;   // hand       0.16→0.30
const P_ROT_END     = 0.42;   // rotate     0.30→0.42
const P_SKY_END     = 0.72;   // night sky  0.42→0.72 (LONG — text fully readable)
const P_CARDS_END   = 0.94;   // cards      0.72→0.94; void 0.94→1.0

// Camera dolly-back factor. FOV dropped 60→42 (~1.5× tele), so push the
// camera back along its view direction by the same factor → identical framing
// with a flat rectilinear lens (no fish-eye bulge).
const DOLLY = 1.5;

// Orbit geometry for the "form sideways + rotate into it" hand reveal.
const ORBIT_R  = 22.0;
const ORBIT_A0 = Math.PI * 0.4;   // hand-formed side angle

export function initScrollTimeline(uniforms, cameraBase, lookAtTarget, cameraUp, audioManager) {

  const lerp     = (a, b, t) => a + (b - a) * t;
  const smooth01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  CustomEase.create('morphEase', 'M0,0 C0.19,0 0.22,1 1,1');

  // Camera keyframes [px,py,pz, lx,ly,lz]. LOW camera + look near the ground so
  // the near terrain packs the bottom of the frame through the first half.
  // Hand is FORMED while the camera sits to the SIDE (K3), then the camera
  // rotates around it. K3 is the start point of the orbit circle (angle A0).
  const K0 = [-30, 12, 80,  -8, 3, 26];   // start: high wide left, looking down over terrain
  const K1 = [ 26,  8, 52,   8, 3, 16];   // sweep right, descending toward the hills
  const K2 = [-22,  6, 30,  -8, 3, 10];   // back left low — cinematic pendulum, near the hand
  const K3 = [ Math.sin(ORBIT_A0) * ORBIT_R, 6, Math.cos(ORBIT_A0) * ORBIT_R, 0, 4, 0 ];

  function updateScene(progress) {
    const t = Math.max(0, Math.min(1, progress));
    let px, py, pz, lx, ly, lz;

    if (t < P_INTRO_END) {
      const u = smooth01(t / P_INTRO_END);
      px = lerp(K0[0], K1[0], u); py = lerp(K0[1], K1[1], u); pz = lerp(K0[2], K1[2], u);
      lx = lerp(K0[3], K1[3], u); ly = lerp(K0[4], K1[4], u); lz = lerp(K0[5], K1[5], u);

    } else if (t < P_UNRAVEL_END) {
      const u = smooth01((t - P_INTRO_END) / (P_UNRAVEL_END - P_INTRO_END));
      px = lerp(K1[0], K2[0], u); py = lerp(K1[1], K2[1], u); pz = lerp(K1[2], K2[2], u);
      lx = lerp(K1[3], K2[3], u); ly = lerp(K1[4], K2[4], u); lz = lerp(K1[5], K2[5], u);

    } else if (t < P_HAND_END) {
      // Approach the SIDE of the forming hand.
      const u = smooth01((t - P_UNRAVEL_END) / (P_HAND_END - P_UNRAVEL_END));
      px = lerp(K2[0], K3[0], u); py = lerp(K2[1], K3[1], u); pz = lerp(K2[2], K3[2], u);
      lx = lerp(K2[3], K3[3], u); ly = lerp(K2[4], K3[4], u); lz = lerp(K2[5], K3[5], u);

    } else if (t < P_ROT_END) {
      // ROTATE around the hand (~0.75 turn), rising slightly.
      const u   = smooth01((t - P_HAND_END) / (P_ROT_END - P_HAND_END));
      const ang = ORBIT_A0 + u * Math.PI * 1.5;
      px = Math.sin(ang) * ORBIT_R; pz = Math.cos(ang) * ORBIT_R; py = lerp(6, 9, u);
      lx = 0; ly = 4; lz = 0;

    } else if (t < P_SKY_END) {
      // Follow the dust UP into the night sky (from the orbit-end position).
      // Long beat: camera rises early then HOLDS on the star field so the
      // particles fully render and the brand text types in.
      const angEnd = ORBIT_A0 + Math.PI * 1.5;
      const sx = Math.sin(angEnd) * ORBIT_R, sz = Math.cos(angEnd) * ORBIT_R;
      const u = smooth01(Math.min(1, (t - P_ROT_END) / ((P_SKY_END - P_ROT_END) * 0.5)));
      px = lerp(sx, 0, u);  py = lerp(9, 18, u);  pz = lerp(sz, 20, u);
      lx = 0;               ly = lerp(4, 52, u);  lz = lerp(0, -10, u);  // tilt up

    } else if (t < P_CARDS_END) {
      // CARD SECTION: level camera dollies forward through the mirrored terrain.
      const u = smooth01((t - P_SKY_END) / (P_CARDS_END - P_SKY_END));
      px = 0; py = 3; pz = lerp(-4, -34, u);
      lx = 0; ly = 3; lz = -46;

    } else {
      // VOID: upright, recede through the fine white floaters.
      const u = smooth01((t - P_CARDS_END) / (1.0 - P_CARDS_END));
      px = 0; py = lerp(3, 4, u); pz = lerp(-34, -54, u);
      lx = 0; ly = 3; lz = lerp(-46, -74, u);
    }

    // Dolly the camera back along its view direction (compensates narrow FOV).
    px = lx + (px - lx) * DOLLY;
    py = ly + (py - ly) * DOLLY;
    pz = lz + (pz - lz) * DOLLY;

    cameraBase.set(px, py, pz);
    lookAtTarget.set(lx, ly, lz);
    cameraUp.set(0, 1, 0);   // always upright — end is normal

    // Scroll hint is only for the very start — once the user scrolls, remove it
    // for good (display:none so it never returns on scroll-back).
    if (!hintRemoved && scrollHint && progress > 0.03) {
      hintRemoved = true;
      scrollHint.style.display = 'none';
    }

    // Thin line progress bar — fill width tracks scroll progress.
    if (progressFill) {
      progressFill.style.width = (Math.max(0, Math.min(1, progress)) * 100).toFixed(2) + '%';
    }
  }

  // ── UI REFERENCES ────────────────────────────────────────────
  const scrollHint  = document.getElementById('scroll-hint');
  const phase1Text  = document.getElementById('phase1-text');
  const lockinText  = document.getElementById('lockin-text');
  const craftText   = document.getElementById('craft-text');
  const awardText   = document.getElementById('award-text');
  const awardLines  = document.querySelectorAll('.award-line');
  const stepText    = document.getElementById('step-text');
  const finalText   = document.getElementById('final-text');
  const brandsSky   = document.getElementById('brands-sky');
  const brandStars  = document.querySelectorAll('.brand-star');
  const brandStmt   = document.querySelector('.brand-statement');
  const cardsWrap   = document.getElementById('cards');
  const cards       = Array.from(document.querySelectorAll('.project-card'));
  const progressFill = document.getElementById('scroll-progress-fill');
  let   hintRemoved = false;   // scroll hint is removed for good after first scroll

  gsap.set(cards, { xPercent: -50, yPercent: -50, scale: 1.0, opacity: 0 });

  const masterTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 7,
      // NO snap — snapping was auto-scrolling the page to the nearest beat after
      // the user stopped. Scroll is now fully manual.
      onUpdate: (self) => updateScene(self.progress),
      onEnter:  () => audioManager.start(),
    }
  });

  // Cinematic LEFT→RIGHT wipe reveal (like film titles being typed/printed).
  // Only animates clipPath + opacity so each element's CSS centering transform
  // is preserved.
  const wipe = (el, at, dur = 0.06, ease = 'power2.out') => {
    if (!el) return;
    masterTimeline.fromTo(el,
      { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: dur, ease }, at);
  };
  const fadeOut = (el, at, dur = 0.04) => {
    if (!el) return;
    masterTimeline.to(el, { opacity: 0, duration: dur, ease: 'power2.in' }, at);
  };

  // ── UNIFORM / SCENE TWEENS ───────────────────────────────────
  masterTimeline
    // BEAT 1 — intro
    .to(scrollHint, { opacity: 0, duration: 0.04, ease: 'power2.in' }, 0)
    .to(uniforms.uAmplitude, { value: 6.8, duration: P_INTRO_END, ease: 'power1.inOut' }, 0)

    // BEAT 3 — hand forms (from the side)
    .to(uniforms.uMorphToHand, {
      value: 1.0, duration: P_HAND_END - P_UNRAVEL_END, ease: 'morphEase',
    }, P_UNRAVEL_END)
    .to(uniforms.uAmplitude, {
      value: 5.4, duration: (P_HAND_END - P_UNRAVEL_END) * 0.7, ease: 'power2.out',
    }, P_UNRAVEL_END)

    // BEAT 3.5/4 — the BEAM ignites from the palm the moment the hand is formed
    // and travels UP while the camera rotates around the hand; then at the sky
    // beat (uNight) it EXPLODES into the text. The hand stays fully intact.
    .to(uniforms.uSnow, { value: 0.0, duration: 0.02 }, P_HAND_END)
    .to(uniforms.uDustRise, { value: 1.0, duration: P_ROT_END - P_HAND_END, ease: 'power1.out' }, P_HAND_END)
    .to(uniforms.uNight, { value: 1.0, duration: 0.07, ease: 'power2.inOut' }, P_ROT_END + 0.05)
    .to(uniforms.uSkyReveal, {
      value: 1.0, duration: (P_SKY_END - P_ROT_END) * 0.45, ease: 'power1.inOut',
    }, P_ROT_END + 0.02)
    // Retire the hand WHILE it's hidden under full night → the card section is
    // pure text→terrain, no leftover hand model morphing in.
    .to(uniforms.uMorphToHand, { value: 0.0, duration: 0.05, ease: 'power1.in' }, P_ROT_END + (P_SKY_END - P_ROT_END) * 0.6)

    // BEAT 5 — stars fall downward and the terrain bands BUILD FAST + FULLY
    // before the first card appears (morph completes in the first ~30% of the
    // beat → terrain is fully rendered when card 01 reveals).
    .to(uniforms.uSnow, { value: 1.0, duration: (P_CARDS_END - P_SKY_END) * 0.3, ease: 'power1.in' }, P_SKY_END)
    .to(uniforms.uNight, { value: 0.0, duration: (P_CARDS_END - P_SKY_END) * 0.25, ease: 'power2.out' }, P_SKY_END)
    .to(uniforms.uSkyReveal, { value: 0.0, duration: (P_CARDS_END - P_SKY_END) * 0.3, ease: 'power2.in' }, P_SKY_END + 0.02)
    .to(uniforms.uMorphToCards, { value: 1.0, duration: (P_CARDS_END - P_SKY_END) * 0.3, ease: 'power2.out' }, P_SKY_END)
    // The night-sky TEXT itself sinks DOWN + dissolves into the forming terrain
    // (it morphs into the ground — the hand model is NOT involved here).
    .to(brandsSky, { opacity: 0, y: 420, filter: 'blur(12px)', scale: 0.9, duration: (P_CARDS_END - P_SKY_END) * 0.3, ease: 'power2.in' }, P_SKY_END)
    // Cards wrapper must be visible BEFORE the first card starts animating.
    // Old position was P_SKY_END + 0.3*span = 0.786 — after card 1 already
    // started at 0.733. Now it fades in immediately at P_SKY_END so the
    // container is ready when card animations begin.
    .to(cardsWrap, { opacity: 1, duration: 0.01 }, P_SKY_END + 0.01)

    // BEAT 6 — void: terrain (incl. blue card bands) fully gone, white floaters
    // Cards clear, then the terrain dissolves SLOWLY into the void (unrushed) —
    // a long fade before the final line appears.
    .to(cardsWrap, { opacity: 0, duration: 0.03, ease: 'power2.in' }, P_CARDS_END - 0.02)
    .to(uniforms.uVoid, { value: 1.0, duration: 0.10, ease: 'sine.inOut' }, P_CARDS_END)
    .to(uniforms.uSkyReveal, { value: 1.0, duration: 0.12, ease: 'power1.out' }, P_CARDS_END);

  // ── TYPING EFFECT HELPER ─────────────────────────────────────
  // Wraps each character in a span, then staggers opacity 0→1 via scrub.
  // Creates a "being typed in space" feel as the user scrolls.
  // Only monospace/paragraph elements get this treatment; Cinzel display
  // headers keep the clipPath wipe (see below).
  function typeIn(el, at, dur = 0.06) {
    if (!el) return;
    const raw = el.innerHTML.trim();
    if (!raw) return;
    // Preserve <br> line breaks; strip any inner tags. Group chars per word so
    // wrapping moves the WHOLE word to next line (no mid-word breaks).
    const segs = raw.split(/<br\s*\/?>/i);
    el.innerHTML = segs.map(seg => {
      const text = seg.replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
      const tokens = text.split(/(\s+)/);
      return tokens.map(tok => {
        if (tok === '') return '';
        if (/^\s+$/.test(tok)) {
          return `<span class="char" style="opacity:0;display:inline-block">&nbsp;</span>`;
        }
        const chars = tok.split('').map(c =>
          `<span class="char" style="opacity:0;display:inline-block">${c}</span>`
        ).join('');
        return `<span class="word" style="display:inline-block;white-space:nowrap">${chars}</span>`;
      }).join('');
    }).join('<br>');
    const chars = el.querySelectorAll('.char');
    const perChar = dur / Math.max(chars.length, 1);
    masterTimeline
      .set(el, { opacity: 1 }, at)
      .to(chars, { opacity: 1, stagger: perChar, duration: 0.005, ease: 'none' }, at);
  }

  // ── TEXT — cinematic reveals ──────────────────────────────────
  // phase1-text: scroll-linked typing (monospace, terminal sci-fi feel)
  typeIn(phase1Text, 0.03, 0.06);           fadeOut(phase1Text, P_INTRO_END - 0.005);
  // lockin: TYPES OUT char-by-char (like step-text) over a long scroll window
  // so it's smaller + writes in smoothly instead of the laggy clipPath wipe.
  if (lockinText) lockinText.classList.add('type-target');
  typeIn(lockinText, P_INTRO_END + 0.005, 0.07); fadeOut(lockinText, P_UNRAVEL_END - 0.005);
  // craft: now TYPES out too (loses the inline crimson C, gains the typed feel)
  typeIn(craftText, P_UNRAVEL_END + 0.04, 0.07); fadeOut(craftText, P_HAND_END - 0.01);

  masterTimeline.to(awardText, { opacity: 1, duration: 0.01 }, P_HAND_END + 0.01);
  awardLines.forEach((ln, i) => typeIn(ln, P_HAND_END + 0.02 + i * 0.03, 0.05));
  // step-text: typing effect (monospace) — earlier start so it has a real
  // window to type out before the rotate beat fades it.
  typeIn(stepText, P_HAND_END + 0.005, 0.04);
  fadeOut(awardText, P_ROT_END + 0.04);    fadeOut(stepText, P_ROT_END + 0.06);

  // brand text appears ON TOP of the (still present) night sky — all TYPED
  masterTimeline.to(brandsSky, { opacity: 1, duration: 0.02 }, P_ROT_END + 0.08);
  brandStars.forEach((s, i) => typeIn(s, P_ROT_END + 0.08 + i * 0.012, 0.04));
  typeIn(brandStmt, P_ROT_END + 0.20, 0.07);

  // cards — ONE AT A TIME: slow fade in → text TYPES OUT char-by-char → hold →
  // slow fade out. Plenty of dwell time on each card.
  {
    // Start cards AFTER the terrain morph + cardsWrap fade-in have completed.
    // The morph takes ~30% of the sky→cards span. We start cards at 35% so
    // card 01 appears on a fully-rendered terrain with the wrapper already
    // visible — fixing the bug where card 1 was invisible.
    const MORPH_BUFFER = 0.35; // fraction of card-section span to wait
    const cardsStart = P_SKY_END + (P_CARDS_END - P_SKY_END) * MORPH_BUFFER;
    const cardsEnd   = P_CARDS_END - 0.01; // leave a tiny gap before void
    const cardsSpan  = cardsEnd - cardsStart;
    const per        = cardsSpan / cards.length;     // scroll window per card

    // Each card's scroll budget is split:
    //   0%  → 25%  : slide IN  (fade + translate)
    //   15% → 25%  : title/desc type-in finishes
    //   25% → 80%  : HOLD — card fully readable (~55% of per = ~4s at normal scroll)
    //   80% → 100% : slide OUT (fade + translate)
    const ENTER_FRAC = 0.25;   // entrance animation fraction
    const EXIT_START = 0.80;   // when exit begins
    const EXIT_FRAC  = 1.0 - EXIT_START;  // exit animation fraction

    // Cards enter AND exit from the SAME side (alternating L/R per card). The
    // exit overlaps the next card's entrance — as one card slides back out, the
    // next is already sliding in. Wide span + long eased tweens = slow & smooth.
    const SWEEP = 420;
    cards.forEach((card, i) => {
      const at    = cardsStart + i * per;
      const title = card.querySelector('.card-title');
      const desc  = card.querySelector('.card-desc');
      title && title.classList.add('type-target');
      desc  && desc.classList.add('type-target');
      const side  = (i % 2 === 0) ?  SWEEP : -SWEEP;   // same side for enter + exit
      const inner = card.querySelector('.card-inner');

      // ENTER: slide in + fade up
      masterTimeline
        .fromTo(card,
          { opacity: 0, x: side, scale: 0.62 },
          { opacity: 1, x: 0,    scale: 1.0,  duration: per * ENTER_FRAC, ease: 'power2.out' }, at)
        .set(inner, { pointerEvents: 'auto' }, at + per * ENTER_FRAC)
        .set(inner, { pointerEvents: 'none' }, at + per * EXIT_START);

      // Type-in: title and description type out during entrance
      typeIn(title, at, per * ENTER_FRAC);
      typeIn(desc,  at + per * 0.05, per * (ENTER_FRAC - 0.05));

      // EXIT: slide back out the SAME side after the long hold
      masterTimeline.to(card,
        { opacity: 0, x: side, scale: 0.62, duration: per * EXIT_FRAC, ease: 'power2.in' },
        at + per * EXIT_START);
    });

    // Click any visible card → open GitHub repo in new tab
    cards.forEach(card => {
      const href = card.dataset.href;
      if (!href) return;
      const inner = card.querySelector('.card-inner');
      if (!inner) return;
      inner.addEventListener('click', () => {
        window.open(href, '_blank', 'noopener,noreferrer');
      });
    });
  }

  // ── PER-CARD 3D PARALLAX TILT
  // Each card tracks LOCAL cursor position (only while hovered) and tilts in 3D.
  // Cards not hovered ease back to flat (--mx/--my → 0).
  {
    const innerEls = cards.map(c => c.querySelector('.card-inner')).filter(Boolean);
    const state = innerEls.map(() => ({ tx: 0, ty: 0, cx: 0, cy: 0 }));
    innerEls.forEach((el, i) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        state[i].tx = ((e.clientX - r.left) / r.width  - 0.5) * 2;
        state[i].ty = ((e.clientY - r.top)  / r.height - 0.5) * 2;
      }, { passive: true });
      el.addEventListener('mouseleave', () => {
        state[i].tx = 0;
        state[i].ty = 0;
      });
    });
    function tickCards() {
      for (let i = 0; i < innerEls.length; i++) {
        const s = state[i];
        s.cx += (s.tx - s.cx) * 0.14;
        s.cy += (s.ty - s.cy) * 0.14;
        innerEls[i].style.setProperty('--mx', s.cx.toFixed(3));
        innerEls[i].style.setProperty('--my', s.cy.toFixed(3));
      }
      requestAnimationFrame(tickCards);
    }
    tickCards();
  }

  // final-text: types out slowly AFTER the terrain has dissolved into the void
  // (not during the cards) — the closing line lands on emptiness, unrushed.
  typeIn(finalText, P_CARDS_END + 0.05, 0.07);

  updateScene(0);
  return masterTimeline;
}
