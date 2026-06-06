// ═══════════════════════════════════════════════════════════════
// MORPH TARGETS — Procedural geometry generators
// Generates Float32Array position buffers for:
//   1. Hand shape (palm + 5 fingers, parametric)
//   2. Canyon shape (two vertical walls + scattered stars)
//
// NO external model loading — all positions computed with math.
// Each function returns a Float32Array of length (count * 3)
// matching the interleaved [x, y, z, x, y, z, ...] layout
// that THREE.BufferAttribute expects.
// ═══════════════════════════════════════════════════════════════

/**
 * generateHandPositions(count)
 *
 * Builds a convincing upward-reaching open hand:
 *   - Palm: curved concave dish, ~8 units wide × 6 deep
 *   - Thumb: angled out and slightly down from palm left side
 *   - Index: tall, angled slightly right, pointing most directly up
 *   - Middle: tallest finger, center-top of palm
 *   - Ring: slightly shorter, angled slightly right
 *   - Pinky: shortest, most angled outward right
 *
 * Hand coordinate system:
 *   - Center of palm at world (0, 2, 0)
 *   - Fingers extend upward (positive Y)
 *   - Y reaches up to ~15 at fingertips
 *   - Hand faces roughly toward camera (negative Z)
 *
 * @param {number} count - Total particle count (matches main geometry count)
 * @returns {Float32Array} Interleaved XYZ positions, length = count * 3
 */
export function generateHandPositions(count) {
  const positions = new Float32Array(count * 3);

  // ── BUDGET ──────────────────────────────────────────────────
  // Palm faces camera (XY plane at Z≈0). Reduced to 14% so it
  // doesn't blob-out with additive blending.
  const wristCount  = Math.floor(count * 0.07);
  const palmCount   = Math.floor(count * 0.14);
  const thumbCount  = Math.floor(count * 0.11);
  const indexCount  = Math.floor(count * 0.16);
  const middleCount = Math.floor(count * 0.18);
  const ringCount   = Math.floor(count * 0.14);
  const pinkyCount  = count - wristCount - palmCount - thumbCount
                    - indexCount - middleCount - ringCount;

  let idx = 0;

  // Tapered finger cylinder — same API as before but Z offsets now
  // place fingers near Z=0 (palm faces camera along -Z axis).
  // Tighter, denser finger cylinder → reads as a CLEAN finger, not a fuzzy
  // cloud. Radial spread is mostly uniform (low randomness) and the Z (depth)
  // is squashed so the hand stays a face-on silhouette. A slight knuckle bulge
  // and rounded tip make it read anatomically.
  function fillFinger(n, baseX, baseY, baseZ, length, tiltX, tiltZ, baseRadius, tipRadius) {
    for (let i = 0; i < n; i++) {
      const t      = Math.random();
      // ease radius so fingertip rounds off instead of a flat cut
      const tip    = 1.0 - (1.0 - t) * (1.0 - t);
      const radius = baseRadius + (tipRadius - baseRadius) * tip;
      const angle  = Math.random() * Math.PI * 2;
      const rr     = Math.sqrt(Math.random());           // fill, denser toward edge
      const rx     = Math.cos(angle) * radius * rr;
      const rz     = Math.sin(angle) * radius * rr * 0.5; // squash depth → flat hand
      const x      = baseX + rx + Math.sin(tiltX) * t * length;
      const y      = baseY + t * length;
      const z      = baseZ + rz + Math.sin(tiltZ) * t * length;
      positions[idx++] = x;
      positions[idx++] = y;
      positions[idx++] = z;
    }
  }

  // ── WRIST ────────────────────────────────────────────────────
  // Narrow cylinder reaching up from below screen.
  // Creates the "hand emerging from below" silhouette.
  for (let i = 0; i < wristCount; i++) {
    const t     = Math.random();
    const angle = Math.random() * Math.PI * 2;
    const r     = 1.4 + t * 0.8;  // widens toward palm junction
    positions[idx++] = Math.cos(angle) * r * (0.7 + Math.random() * 0.3);
    positions[idx++] = -3.5 + t * 3.2;  // Y: -3.5 → -0.3 (below palm)
    positions[idx++] = Math.sin(angle) * r * 0.45 + (Math.random() - 0.5) * 0.3;
  }

  // ── PALM ─────────────────────────────────────────────────────
  // Trapezoidal XY face-on plane: narrow at wrist, wide at knuckles.
  // Camera at (0,6,28) looks along -Z → sees this face-on.
  // Z depth ±0.7 keeps it thin so individual particles visible.
  // Flatter, denser palm with a gentle cup. Rounded top knuckle line so the
  // fingers sprout from a believable hand, squared bottom toward the wrist.
  for (let i = 0; i < palmCount; i++) {
    const t         = Math.random();
    const halfWidth = 2.4 + t * 2.3;  // 2.4 at wrist → 4.7 at knuckles
    let   x         = (Math.random() - 0.5) * 2.0 * halfWidth;
    const y         = -0.3 + t * 5.4;
    // cupped palm: pull surface back (+ -z) toward the middle, thin shell
    const cup       = -(1.0 - Math.abs(x) / 4.7) * 0.8;
    const z         = (Math.random() - 0.5) * 1.0 + cup;
    // Clear the thumb side (left) to avoid merging with thumb
    if (x < -3.8 && y < 2.5) x += 1.2;
    positions[idx++] = x;
    positions[idx++] = y;
    positions[idx++] = z;
  }

  // ── THUMB ────────────────────────────────────────────────────
  // Lower-left, angled out and down across the palm base.
  fillFinger(thumbCount,  -4.2, 0.8, 0.9,  5.6, -0.55, -0.42, 0.50, 0.24);

  // ── INDEX ─────────────────────────────────────────────────────
  // Knuckle top-left of palm, fans slightly left.
  fillFinger(indexCount,  -2.7, 5.1, 0.2,  8.6, -0.10, -0.05, 0.34, 0.15);

  // ── MIDDLE ───────────────────────────────────────────────────
  // Center, tallest, vertical.
  fillFinger(middleCount, -0.3, 5.4, 0.0,  9.6,  0.0,   0.00, 0.36, 0.16);

  // ── RING ─────────────────────────────────────────────────────
  // Fans slightly right.
  fillFinger(ringCount,    2.1, 5.1, 0.2,  8.2,  0.10,  0.04, 0.33, 0.15);

  // ── PINKY ────────────────────────────────────────────────────
  // Rightmost, lower knuckle, fans out right.
  fillFinger(pinkyCount,   4.1, 4.4, 0.4,  6.2,  0.22,  0.10, 0.25, 0.11);

  // ── CENTER + SCALE THE HAND ──────────────────────────────────
  // Hand sits CENTER (like the reference). Slight scale so it fills the frame.
  const HAND_SCALE = 0.92;
  const HCX = 0.0, HCY = 0.0, HCZ = 0.0;
  for (let i = 0; i < count; i++) {
    positions[i * 3]     = positions[i * 3]     * HAND_SCALE + HCX;
    positions[i * 3 + 1] = positions[i * 3 + 1] * HAND_SCALE + HCY;
    positions[i * 3 + 2] = positions[i * 3 + 2] * HAND_SCALE + HCZ;
  }

  // ── UPWARD FOUNTAIN COLUMN ───────────────────────────────────
  // The signature reference visual: a dense vertical jet of particles rising
  // straight up out of the palm. Overwrite the first slice (the wrist budget)
  // with a tall thin column above the palm center. Radius widens slightly with
  // height so the top feathers out like falling/rising sand.
  const fountainCount = Math.floor(count * 0.08);
  for (let i = 0; i < fountainCount; i++) {
    const t      = Math.random();              // 0 at palm → 1 at top
    const radius = 0.5 + t * 2.2;              // narrow at base, feathered top
    const angle  = Math.random() * Math.PI * 2;
    positions[i * 3]     = Math.cos(angle) * radius * (0.4 + Math.random() * 0.6);
    positions[i * 3 + 1] = 4.0 + t * 20.0;     // Y: 4 → 24, tall jet
    positions[i * 3 + 2] = Math.sin(angle) * radius * (0.4 + Math.random() * 0.6);
  }

  return positions;
}


/**
 * generateCanyonPositions(count)
 *
 * Builds a dramatic canyon corridor:
 *   - Left wall:  X = -42 ±8, scattered Y: [-25, +40], Z: [-100, +30]
 *   - Right wall: X = +42 ±8, scattered Y: [-25, +40], Z: [-100, +30]
 *   - Remaining particles scatter far away as "stars" in the void
 *
 * The "stars" are important: when morphing from hand → canyon,
 * some particles need to visually dissolve/scatter. Placing 30% of
 * them at very large distances causes them to disappear from view,
 * giving the effect of particles flying away into darkness.
 *
 * @param {number} count - Total particle count
 * @returns {Float32Array} Interleaved XYZ positions, length = count * 3
 */
export function generateCanyonPositions(count) {
  const positions = new Float32Array(count * 3);

  // SKY / VOID VOLUME — a big sparse FULL sphere of points around the scene.
  // Only the dedicated aSky particles ever sit here (the rest of the field is
  // terrain). When looking UP it reads as a night sky; in the void, looking
  // forward, the same points are sparse floaters drifting around the camera.
  let idx = 0;
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2.0 * Math.random() - 1.0);   // full sphere
    const r     = 50.0 + Math.random() * 180.0;
    positions[idx++] = r * Math.sin(phi) * Math.cos(theta);
    positions[idx++] = r * Math.cos(phi);                       // centered → bottom = top
    positions[idx++] = r * Math.sin(phi) * Math.sin(theta) - 20.0;
  }

  return positions;
}


/**
 * generateCardPositions(count)
 *
 * The CARD-SECTION frame: the night sky settles back to ground level and the
 * valleys/mountains re-form, but now DUPLICATED + pushed out to the far LEFT
 * and RIGHT, leaving a dark corridor down the centre where the HTML project
 * cards float. The walls are faded (alpha dimmed in-shader via uMorphToCards)
 * so they read as a soft terrain backdrop, not the hero subject.
 *
 *   - ~88% : two flanking terrain walls (mirrored ridges, X ±55..110)
 *   - ~12% : faint floor mist running down the corridor
 *
 * Camera for this phase sits at ~(0,6,-20) looking forward to ~(0,4,-40),
 * so z is laid out negative (in front of the camera) → corridor depth.
 *
 * @param {number} count - Total particle count
 * @returns {Float32Array} Interleaved XYZ positions, length = count * 3
 */
export function generateCardPositions(count) {
  const positions = new Float32Array(count * 3);

  // Cinematic mirror: terrain runs along the BOTTOM of the frame and a second
  // copy is FLIPPED upside-down across the TOP, leaving a dark band through the
  // middle where the HTML project cards float. Half the particles per band.
  const half = Math.floor(count / 2);

  let idx = 0;
  for (let i = 0; i < count; i++) {
    const top = i >= half;                          // top band = flipped copy

    const x = (Math.random() - 0.5) * 300.0;        // wide → fills full width
    const z = -6.0 - Math.random() * 130.0;         // in front of the camera

    // DEFINED mountains + valleys, but SHORT — each band hugs the very top /
    // very bottom edge (~20% of the frame each = ~40% total), leaving a big
    // dark middle for the card. Pushed far out so only the silhouette shows.
    const ridge = ((Math.sin(x * 0.05) * 0.5 + 0.5) * 8.0      // rolling peaks
                +  Math.abs(Math.sin(z * 0.08)) * 4.0           // valleys
                +  (Math.random() - 0.5) * 1.5) * 0.6;

    // Symmetric bands: top +28, bottom -28 (mirror), ridge points inward both.
    const y = top ? (28.0 - ridge) : (-28.0 + ridge);

    positions[idx++] = x;
    positions[idx++] = y;
    positions[idx++] = z;
  }

  return positions;
}
