// ═══════════════════════════════════════════════════════════════
// PARTICLE FRAGMENT SHADER
// Renders each particle as a soft glowing circle with:
//   - Gaussian (soft-edge) falloff — NOT a hard circle
//   - Slight blue tint at the bright core
//   - Mouse proximity glow — particles near cursor brighten
//   - AdditiveBlending in Three.js makes overlapping particles
//     accumulate brightness, creating the "glow cluster" effect
//
// gl_PointCoord: built-in UV within each point sprite, [0,1] range
//   (0,0) = bottom-left corner of point square
//   (0.5, 0.5) = center of point
//   (1,1) = top-right corner
// ═══════════════════════════════════════════════════════════════

// Varyings received from vertex shader
varying float vAlpha;         // Depth-attenuated + random alpha from vertex shader
varying float vDistToMouse;   // World-space distance to mouse cursor
varying float vSky;           // 1.0 for sky/void particles → red glowing tint
varying float vRise;          // 0→1 palm-pillar rise → cyan-blue tint

void main() {

  // ── STEP 1: RADIAL DISTANCE FROM SPRITE CENTER ──────────────
  // gl_PointCoord gives position within the point square [0,1].
  // Subtracting (0.5, 0.5) re-centers it to [-0.5, 0.5].
  // length() gives radial distance from center.
  //   dist = 0.0 at center (brightest)
  //   dist = 0.5 at edge of circle (where we hard-clip)
  //   dist > 0.5 = corners of the point square (discarded)
  float dist = length(gl_PointCoord - vec2(0.5));


  // ── STEP 2: GAUSSIAN SOFT FALLOFF ───────────────────────────
  // exp(-dist² * k) creates a bell-curve brightness falloff.
  //   At dist=0: exp(0) = 1.0 (full brightness at center)
  //   At dist=0.3: exp(-0.9 * 8) ≈ 0.07 (dim at edge)
  //   At dist=0.5: exp(-2.0 * 8) ≈ 0.0 (essentially black at boundary)
  //
  // k=8.0 controls how tight/wide the glow is:
  //   - Smaller k (e.g. 4.0): wider, softer glow
  //   - Larger k (e.g. 16.0): tighter, sharper core, less bloom
  //   Customize: change 8.0 to adjust particle softness
  // k=12 (was 8) — tighter falloff: crisp dots not blobs
  float circle = exp(-dist * dist * 12.0);


  // ── STEP 3: HARD CLIP AT CIRCLE BOUNDARY ────────────────────
  // step(edge, x) returns 1.0 if x >= edge, else 0.0.
  // step(dist, 0.5): returns 1.0 when dist < 0.5 (inside circle),
  //                  returns 0.0 when dist >= 0.5 (in square corners).
  // This prevents rendering corners of the point sprite square,
  // ensuring perfectly circular particles regardless of size.
  float hardClip = step(dist, 0.5);


  // ── STEP 4: COMBINED ALPHA ───────────────────────────────────
  // Multiply gaussian falloff × hard clip × depth alpha from vertex:
  //   circle: soft gaussian center brightness [0, 1]
  //   hardClip: binary inside/outside circle boundary
  //   vAlpha: depth fade + per-particle random variation
  float alpha = circle * hardClip * vAlpha;


  // ── STEP 5: COLOR — WHITE WITH BLUE-TINTED CORE ─────────────
  // mix(a, b, t) lerps between two colors based on circle brightness:
  //   t=0.0 (edge of particle): color = vec3(0.85, 0.90, 1.0)
  //     — a cool, slightly blue-white glow
  //   t=1.0 (center of particle): color = vec3(1.0, 1.0, 1.0)
  //     — pure white hot center
  // This mimics real light: hot core → cooler emission at edges
  // Customize: change the first vec3 for a different tint (e.g. warm amber: 1.0, 0.9, 0.7)
  // Neutral cool-gray edge → white core. Reference look = grayscale sand/dust grain,
  // NOT blue nebula. Removing blue cast makes terrain read as fine particulate.
  // Terrain grain: cyan / light-blue → bright cyan-white core.
  vec3 color = mix(vec3(0.30, 0.66, 0.92), vec3(0.82, 0.96, 1.0), circle);

  // ── SKY / VOID PARTICLES → FINE WHITE ───────────────────────
  // Fine, smooth, dispersed white points — stars at the start / in the night
  // sky, and the fine white dust of the final void.
  vec3 skyColor = mix(vec3(0.78, 0.84, 0.95), vec3(1.0, 1.0, 1.0), circle);
  color = mix(color, skyColor, vSky);

  // ── PALM PILLAR → BRIGHT RED EMBER ──────────────────────────
  // The particles rising from the middle of the hand glow as hot RED embers
  // (vRise 0→1): deep red edge → bright orange-hot core. They climb into the
  // night sky then burst outward into the text.
  // Hot GOLD: deep amber edge → bright gold-white core.
  vec3 ember = mix(vec3(1.0, 0.55, 0.05), vec3(1.0, 0.9, 0.55), circle);
  color = mix(color, ember, clamp(vRise, 0.0, 1.0));


  // ── STEP 6: MOUSE PROXIMITY GLOW ────────────────────────────
  // Particles close to the mouse cursor receive extra brightness.
  // vDistToMouse = world-space distance calculated in vertex shader.
  //
  // exp(-vDistToMouse * 0.3): exponential falloff from mouse position.
  //   At dist=0: glow = 0.5 (full bonus)
  //   At dist=5: glow = 0.5 * exp(-1.5) ≈ 0.11 (noticeable)
  //   At dist=15: glow = 0.5 * exp(-4.5) ≈ 0.006 (invisible)
  //
  // Customize: increase 0.5 multiplier for stronger glow effect
  //            decrease 0.3 decay for wider influence radius
  // 0.5 decay (was 0.3), 0.25 max (was 0.5) — much tighter, less bloom
  float mouseGlow = exp(-vDistToMouse * 0.5) * 0.25;

  // Add glow to color (brightens RGB channels — white/blue tint)
  color += vec3(mouseGlow * 0.8, mouseGlow * 0.85, mouseGlow);  // slight blue bias

  // Also boost alpha near mouse so particles become more visible
  alpha += mouseGlow * 0.3;


  // ── STEP 7: DISCARD FULLY TRANSPARENT FRAGMENTS ─────────────
  // Discard fragments with near-zero alpha to avoid overdraw cost.
  // This is especially important with 150K+ points — skipping
  // invisible fragments saves significant fragment shader invocations.
  if (alpha < 0.005) discard;


  // ── STEP 8: OUTPUT ──────────────────────────────────────────
  // THREE.AdditiveBlending on the material means:
  //   framebuffer_color = existing_color + new_color * alpha
  // This causes overlapping particles to ADD brightness together,
  // creating bright glowing clusters where many particles converge.
  // This is the key to the "nebula/dark matter" look.
  // Without additive blending: overlapping particles would occlude each other,
  // looking like a flat point cloud.
  gl_FragColor = vec4(color, alpha);
}
