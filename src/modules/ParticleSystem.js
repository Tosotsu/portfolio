// ═══════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// Creates Three.js Points geometry with all attribute buffers,
// sets up ShaderMaterial with all required uniforms,
// and exposes the resulting mesh + uniforms to the rest of the app.
//
// Performance decisions:
//   - BufferGeometry: no legacy Geometry overhead
//   - Float32Array: GPU-native format, no conversion needed
//   - All animation in GLSL: zero JS per-frame position updates
//   - frustumCulled = false: particles span 200+ world units,
//     frustum check would incorrectly cull valid particles
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { generateHandPositions, generateCanyonPositions, generateCardPositions } from './MorphTargets.js';
import { loadHandPositions } from './HandLoader.js';
import vertexShader   from '../shaders/particle.vert.glsl?raw';
import fragmentShader from '../shaders/particle.frag.glsl?raw';

// Particle count: 180,000 for high-end GPUs, 120,000 fallback.
// The WebGL renderer is tested for high-performance mode in main.js.
// Customize: lower to 80,000 for < 30fps debugging on weak hardware.
// Bumped back up: most of these are packed into the GROUND/foreground so the
// lower half of the screen reads as solid terrain (not an empty void), while
// the grain still stays fine and fluid.
// Screen-responsive: large desktops were too dense/noisy (and ran worse),
// while phones read cleaner with fewer grains. Scale DOWN as the screen grows.
export const PARTICLE_COUNT = (() => {
  if (typeof window === 'undefined') return 120_000;
  const w = Math.max(window.innerWidth, window.innerHeight); // longest edge
  if (w < 768)  return 85_000;    // phones
  if (w < 1280) return 110_000;   // tablets / small laptops
  if (w < 1920) return 130_000;   // standard desktop — was 200k, too dense
  return 120_000;                 // large / 4K — fewest, keep density sane
})();

// Fraction of the eligible central-ground particles that form the HAND.
// The hand emerges FROM ground particles below; rim/mountain particles never
// join. See spawn loop + particle.vert.glsl.
export const HAND_FRACTION = 0.26;

/**
 * Creates and returns the particle system.
 *
 * @param {THREE.WebGLRenderer} renderer - Used to check GPU capabilities
 * @returns {{
 *   points: THREE.Points,
 *   uniforms: Object,
 *   material: THREE.ShaderMaterial
 * }}
 */
export function createParticleSystem(renderer) {

  // ── GEOMETRY ─────────────────────────────────────────────────
  const geometry = new THREE.BufferGeometry();
  const count = PARTICLE_COUNT;

  // Allocate all typed arrays upfront — avoids garbage collection later.
  // Float32Array is the correct type for GPU vertex attributes.
  const positions     = new Float32Array(count * 3);  // XYZ per particle
  const randomsArr    = new Float32Array(count);       // 1 float per particle
  const sizesArr      = new Float32Array(count);       // 1 float per particle
  const handMemberArr = new Float32Array(count);       // 1.0 = joins the hand
  const dustArr       = new Float32Array(count);       // 1.0 = dust from the hand
  const skyArr        = new Float32Array(count);       // 1.0 = generated sky/void particle

  // ── TERRAIN POSITIONS (initial layout) ──────────────────────
  // Wide flat plane, ~200 units wide (X), ~100 deep (Z).
  // Y is near-zero with minimal ±0.5 noise — the vertex shader
  // applies the actual terrain displacement via simplex noise.
  // Customize:
  //   - Change 200 / 100 to adjust terrain spread dimensions
  //   - Change 1.0 Y scatter for more/less initial height variation
  for (let i = 0; i < count; i++) {
    // Three zones so the terrain is dramatic AND always fills the bottom of the
    // frame (no empty space below the horizon):
    //   45% mountain rim ring   → tall surrounding peaks
    //   33% broad foreground carpet (wide X, near/under the camera in +Z) →
    //       guarantees the lower frame is always covered with terrain
    //   22% basin interior      → rolling valleys in the middle
    let x, z;
    let isRim = false;
    const zone = Math.random();
    if (zone < 0.45) {
      // DENSE mountain rim — 45% of all particles → sharply defined, clear
      // peaks from the very first frame (not a sparse fuzzy ridge).
      isRim = true;
      const r     = 55 + Math.random() * 95;        // 55..150 ring (mountains)
      const angle = Math.random() * Math.PI * 2;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r + 10;                 // basin center at z=+10
    } else if (zone < 0.80) {
      // DENSE ground carpet — concentrated where the camera looks through the
      // first half so the lower frame is packed solid terrain, no black voids.
      x = (Math.random() - 0.5) * 230.0;            // ±115
      z = -30.0 + Math.random() * 150.0;            // -30..120 (in/under view)
    } else {
      // DENSE central cluster around the hand — packed tight (√-distributed
      // radial fill) so a LOT of particles sit right where the hand forms and
      // pour into it. 20% of the whole field lives here.
      const r     = Math.sqrt(Math.random()) * 48.0;   // tight, denser toward edge
      const angle = Math.random() * Math.PI * 2;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r + 10.0;                  // basin centre at z=+10
    }
    const y = (Math.random() - 0.5) * 1.0;    // Minimal Y scatter before noise

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Per-particle random [0,1] — baked once, used in shader for variation
    // Affects alpha variation (creates twinkling effect in terrain)
    randomsArr[i] = Math.random();

    // Per-particle size multiplier [0.5, 2.5]
    // Creates natural variation: some particles are bigger "stars", most are small
    // Customize: change range for different density appearance
    sizesArr[i] = 0.5 + Math.random() * 2.0;

    // Hand membership: the hand forms ONLY from particles on the GROUND below /
    // near the centre — never the mountain rim — so it rises up out of the
    // valley. Sparse (~0.85 of the eligible central ground) → clear, fluid shape.
    const dx = x, dz = z - 10.0;
    const distC2 = dx * dx + dz * dz;
    const nearCenter = distC2 < 64.0 * 64.0;
    // SPARSE membership (~0.45) so the ground keeps roughly the SAME density
    // after the hand forms — the hand is part of the terrain, terrain shows
    // through it, no big hole left behind.
    handMemberArr[i] = (!isRim && nearCenter && Math.random() < 0.45) ? 1.0 : 0.0;

    // Dust = the BEAM emitters. A SEPARATE set of central particles that are NOT
    // part of the hand silhouette → the hand stays fully intact. These stream
    // continuously up out of the palm as a beam (see vert shader), then burst
    // into the text. ~22% of the non-hand central particles.
    dustArr[i] = (!isRim && nearCenter && handMemberArr[i] < 0.5 && Math.random() < 0.22) ? 1.0 : 0.0;

    // Sky/void particles: a SEPARATE sparse set (never terrain, hand, or beam)
    // that forms the stars/sky and the fine white void floaters.
    skyArr[i] = (handMemberArr[i] < 0.5 && dustArr[i] < 0.5 && Math.random() < 0.030) ? 1.0 : 0.0;
  }

  // ── MORPH TARGET POSITIONS ────────────────────────────────────
  const canyonPositions = generateCanyonPositions(count);
  const cardPositions   = generateCardPositions(count);
  // Hand starts as the procedural fallback; GLB replaces it async below.
  const fallbackHand    = generateHandPositions(count);

  // ── BUFFER ATTRIBUTES ────────────────────────────────────────
  geometry.setAttribute('position',
    new THREE.BufferAttribute(positions, 3)
  );

  const handAttr = new THREE.BufferAttribute(fallbackHand, 3);
  geometry.setAttribute('aTargetHand', handAttr);

  // aTargetCanyon: canyon morph destination
  geometry.setAttribute('aTargetCanyon',
    new THREE.BufferAttribute(canyonPositions, 3)
  );

  // aTargetCards: card-section frame (flanking faded terrain corridor)
  geometry.setAttribute('aTargetCards',
    new THREE.BufferAttribute(cardPositions, 3)
  );

  // aHandMember: 1.0 if this particle forms the hand, else 0.0
  geometry.setAttribute('aHandMember',
    new THREE.BufferAttribute(handMemberArr, 1)
  );

  // aDust: 1.0 if this particle lifts up out of the hand
  geometry.setAttribute('aDust',
    new THREE.BufferAttribute(dustArr, 1)
  );

  // aSky: 1.0 if this is a generated sky/void particle (hidden until reveal)
  geometry.setAttribute('aSky',
    new THREE.BufferAttribute(skyArr, 1)
  );

  // aRandom: per-particle random value for variation
  geometry.setAttribute('aRandom',
    new THREE.BufferAttribute(randomsArr, 1)
  );

  // aSize: per-particle size multiplier
  geometry.setAttribute('aSize',
    new THREE.BufferAttribute(sizesArr, 1)
  );

  // ── UNIFORMS ─────────────────────────────────────────────────
  // All values that change over time are uniforms — updated from JS
  // without re-uploading vertex data.
  //
  // Naming convention: u prefix for uniforms (GLSL convention)
  const uniforms = {
    // uTime: driven by THREE.Clock in render loop
    //   Range: 0 → infinity (never resets)
    uTime:          { value: 0.0 },

    // uAmplitude: terrain noise height multiplier
    //   Start at 6.0 so dramatic mountains/valleys are present from frame one.
    //   GSAP intro beat continues raising it.
    uAmplitude:     { value: 6.0 },

    // uMouse: normalized mouse position [-1, 1] on each axis
    //   Updated by MouseTracker.js with GSAP lerp smoothing
    uMouse:         { value: new THREE.Vector2(0, 0) },

    // uMouseWorld: ACTUAL cursor position projected onto the terrain plane
    //   (y=0) via raycast in main.js. XZ world coords. This is what the
    //   repulsion uses so the parting matches the real cursor even while the
    //   camera orbits — the old uMouse*30 screen hack no longer lined up.
    uMouseWorld:    { value: new THREE.Vector2(0, 0) },

    // uMouseRadius: repulsion field radius in world units
    //   Larger = particles pushed from further away
    //   Default 8.0 — adjust in concert with uMouseStrength
    uMouseRadius:   { value: 6.0 },

    // uMouseStrength: small — only a slight local nudge under the cursor, not a
    // hole. The whole-field motion comes from the global sway in the shader.
    uMouseStrength: { value: 1.3 },

    // uMorphToHand: blend from terrain → hand shape
    //   0.0 = terrain, 1.0 = hand. GSAP animates in ScrollTimeline.
    uMorphToHand:   { value: 0.0 },

    // uMorphToCanyon: blend from (terrain+hand) → canyon
    //   0.0 = previous, 1.0 = canyon. GSAP animates in ScrollTimeline.
    uMorphToCanyon: { value: 0.0 },

    // uMorphToCards: blend from (sky) → card-section corridor (flanking terrain)
    //   0.0 = previous, 1.0 = card frame. GSAP animates in ScrollTimeline.
    uMorphToCards:  { value: 0.0 },

    // uVoid: fades the terrain/hand out toward the empty void.
    uVoid:          { value: 0.0 },

    // uDustRise: 0→1 lifts the aDust particles up out of the hand (no explosion).
    uDustRise:      { value: 0.0 },

    // uSnow: 0→1 gentle downward snow drift on the sky particles.
    uSnow:          { value: 0.0 },

    // uSkyReveal: fades in the generated sky/void particles. Faint at the start
    //   (stars above the mountains), 0 through the card section, full for the
    //   final white void.
    uSkyReveal:     { value: 0.35 },

    // uNight: 0→1 fades ALL particles out for the night-sky beat so only the
    //   cyan text remains, emerging where the thrown particles were.
    uNight:         { value: 0.0 },

    // uPixelRatio: window.devicePixelRatio capped at 2
    //   Passed to vertex shader to compensate gl_PointSize on retina
    uPixelRatio:    { value: Math.min(window.devicePixelRatio, 2) },

    // uExplosion: (unused — hand no longer explodes)
    uExplosion:     { value: 0.0 },

    // uHandBreath: slow Y oscillation applied to hand particles (driven by main.js tick)
    uHandBreath:    { value: 0.0 },

    // uSize: global particle size multiplier
    uSize:          { value: 1.0 },
  };

  // ── MATERIAL ─────────────────────────────────────────────────
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,

    // AdditiveBlending: framebuffer += particle_color * particle_alpha
    // This is what creates the "glow cluster" / nebula effect:
    // Overlapping particles ADD brightness instead of occluding each other.
    // Stars/galaxies look lit from within because many dim particles sum to bright.
    // Changing to NormalBlending would make particles look flat and opaque.
    blending: THREE.AdditiveBlending,

    // depthWrite must be false with AdditiveBlending.
    // If true, particles write to depth buffer and occlude particles behind them,
    // breaking the additive accumulation that creates the glow.
    depthWrite: false,

    // transparent: true required for any material using blending or alpha < 1
    transparent: true,

    // vertexColors: false — we compute color entirely in fragment shader
    vertexColors: false,
  });

  // ── POINTS MESH ──────────────────────────────────────────────
  const points = new THREE.Points(geometry, material);

  // frustumCulled = false: Three.js frustum culling checks the bounding sphere.
  // With 200-unit wide terrain and camera flying through, culling would
  // incorrectly hide valid particles. Disable it — the GPU handles this better.
  points.frustumCulled = false;

  // ── ASYNC GLB HAND — hot-swap once loaded ────────────────────
  // The procedural fallback is already on the GPU. When the real GLB arrives,
  // we overwrite the buffer data in-place and mark it needsUpdate so Three.js
  // re-uploads just that attribute — no geometry rebuild, no stutter.
  loadHandPositions(count).then((glbPositions) => {
    if (!glbPositions) return;
    handAttr.array.set(glbPositions);
    handAttr.needsUpdate = true;
  });

  return { points, uniforms, material };
}
