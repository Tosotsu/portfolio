// ═══════════════════════════════════════════════════════════════
// MAIN.JS — Core Orchestrator
// Initializes: Three.js renderer, scene, camera, particle system,
//              scroll timeline, mouse tracker, audio manager.
// Runs: render loop with idle drift and lookAt updates.
// Handles: window resize with proper camera/renderer/uniform updates.
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass  } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { createParticleSystem } from './modules/ParticleSystem.js';
import { initScrollTimeline   } from './modules/ScrollTimeline.js';
import { MouseTracker          } from './modules/MouseTracker.js';
import { AudioManager          } from './modules/AudioManager.js';
import { CursorFollower         } from './modules/CursorFollower.js';
import { AutoScroller           } from './modules/AutoScroll.js';
import { createStarField       } from './modules/StarField.js';

// ═══════════════════════════════════════════════════════════════
// DEVICE DETECTION
// ═══════════════════════════════════════════════════════════════
// pointer: coarse = touch device (phone/tablet). Used to tune render budget:
// DPR capped at 1 on mobile (9x fewer pixels than 3x retina), FilmPass skipped.
// Quality impact is negligible — screen is small, grain is invisible at 1x.
const isMobile = window.matchMedia('(pointer: coarse)').matches
  || /Android|iPhone|iPad/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad iOS 13+
const MAX_DPR  = isMobile ? 1 : 2;

gsap.registerPlugin(ScrollTrigger);

// Normalize scroll on mobile/tablet — stops iOS native momentum from fighting
// GSAP ScrollTrigger and causing jumps/overshoots. ignoreMobileResize prevents
// scroll position jumps when browser chrome appears/disappears.
if (isMobile) {
  ScrollTrigger.normalizeScroll(true);
  ScrollTrigger.config({ ignoreMobileResize: true });
}


// ═══════════════════════════════════════════════════════════════
// THREE.JS CORE SETUP
// ═══════════════════════════════════════════════════════════════

// ── RENDERER ─────────────────────────────────────────────────
// antialias: false — we handle softness in fragment shader via gaussian falloff
// alpha: false — opaque background for performance (no compositing with page)
// powerPreference: "high-performance" — requests dedicated GPU on laptops with dual-GPU
const renderer = new THREE.WebGLRenderer({
  canvas:          document.querySelector('#webgl'),
  antialias:       false,
  alpha:           false,
  powerPreference: 'high-performance',
});

// Mobile: cap at 1 — on a 390px 3x screen this cuts pixel count 9x with zero visible loss.
// Desktop: cap at 2 — diminishing returns beyond 2x.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
renderer.setSize(window.innerWidth, window.innerHeight);

// Pitch black — deep space atmosphere. CSS --bg also updated to #000000.
renderer.setClearColor(0x000000, 1);


// ── SCENE ────────────────────────────────────────────────────
const scene = new THREE.Scene();

// Exponential black fog — atmospheric depth haze for the film look. Tuned
// (0.0017) so distance reads as misty without swallowing the foreground/edges.
scene.fog = new THREE.FogExp2(0x000000, 0.0017);


// ── CAMERA ──────────────────────────────────────────────────
// 42° FOV: narrow rectilinear lens — kills the wide-angle fish-eye bulge.
// ScrollTimeline dollies the camera back (DOLLY factor) to keep framing.
// near: 0.1, far: 1000 — covers terrain (0–100 units) + canyon stars (400 units)
const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Starting position — will immediately be overridden by ScrollTimeline
// but set here as a fallback so first frame renders correctly
camera.position.set(0, 30, 96);
camera.lookAt(0, 0, 0);


// ── LOOKAT TARGET ─────────────────────────────────────────────
// Shared Vector3 between ScrollTimeline (writes) and render loop (reads).
// Avoids creating new Vector3 every frame.
// ScrollTimeline.js samples the lookAt spline and copies here.
// Render loop calls camera.lookAt(lookAtTarget) each frame.
const lookAtTarget = new THREE.Vector3(0, 0, 0);

// ── CAMERA BASE POSITION ──────────────────────────────────────
// ScrollTimeline writes the scroll-driven spline position HERE (not directly
// to camera.position). The render loop then composes the final camera position
// as: cameraBase + mouse parallax + idle drift. Keeping a separate base avoids
// the parallax/drift offsets accumulating frame-over-frame.
const cameraBase = new THREE.Vector3(0, 25, 60);

// ── CAMERA UP VECTOR ──────────────────────────────────────────
// ScrollTimeline writes the camera roll here. Default (0,1,0). During the
// sky beat it rolls toward (0,-1,0) so the world flips "upside down" as we
// pan up into the night sky, then returns to (0,1,0) for the card corridor.
const cameraUp = new THREE.Vector3(0, 1, 0);

// Reused temp so the lookAt parallax shift allocates nothing per frame.
const _finalLookAt = new THREE.Vector3();

// ── CURSOR → WORLD RAYCAST ────────────────────────────────────
// Projects the cursor onto the terrain plane (y=0) so particle repulsion
// happens exactly under the cursor regardless of where the camera orbits.
const _raycaster   = new THREE.Raycaster();
const _terrainPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
const _hitPoint    = new THREE.Vector3();


// ── CLOCK ────────────────────────────────────────────────────
// THREE.Clock for elapsed time — passed to uTime uniform each frame.
// Drives the simplex noise animation in the vertex shader.
const clock = new THREE.Clock();


// ═══════════════════════════════════════════════════════════════
// POSTPROCESSING
// ═══════════════════════════════════════════════════════════════

const composer = new EffectComposer(renderer);

// Base scene render
composer.addPass(new RenderPass(scene, camera));

// Bloom — aggressive settings for maximum contrast against pitch black.
// High threshold keeps dark areas pure black; high strength makes bright
// clusters violently punch through the darkness (Interstellar lens effect).
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,  // strength — reduced: particles glow, bloom doesn't fog HTML text
  0.3,   // radius — tighter halo
  0.82   // threshold — higher: only hottest particle cores bloom
);
composer.addPass(bloomPass);

// Film grain — heavy high-ISO grain for a gritty cinematic film look.
// Skipped on mobile: grain is invisible at 1x DPR on small screens, but costs a full render pass.
const filmPass = new FilmPass(0.9);
if (!isMobile) composer.addPass(filmPass);

// Vignette — forcefully darkens corners, pushing the eye to the bright centre.
// Operates in linear space (before OutputPass sRGB conversion) for accuracy.
const VignetteShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 uv = vUv - 0.5;
      // Gentle vignette — only a faint corner darkening. Never blacks out the
      // bottom/sides so the full terrain stays visible edge to edge.
      float vign = 1.0 - dot(uv * 1.1, uv * 1.1);
      vign = clamp(pow(vign, 1.1), 0.0, 1.0);
      vign = mix(0.82, 1.0, vign);   // floor at 0.82 → edges stay bright
      col.rgb *= vign;
      gl_FragColor = col;
    }`,
};
composer.addPass(new ShaderPass(VignetteShader));

// OutputPass — correct color space conversion (replaces manual sRGB workaround)
composer.addPass(new OutputPass());


// ═══════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════

// createParticleSystem() generates geometry, morph targets, and material.
// This is the most expensive initialization step (~50ms for 180K particles).
const { points, uniforms, material } = createParticleSystem(renderer);

if (isMobile) uniforms.uSize.value = 0.72;

scene.add(points);

// Static ambient star field — always visible overhead, no scroll dependency.
createStarField(scene);
// Embers removed — the warm particles drifted in front of the camera and
// blinded the view.


// ═══════════════════════════════════════════════════════════════
// ENTER SCREEN
// ═══════════════════════════════════════════════════════════════
// Lock scroll until user clicks ENTER. Loading screen (z-index:200)
// overlays the already-rendering scene. On click: fade out screen,
// unlock scroll, start audio.

const loadingScreen = document.getElementById('loading-screen');
const enterBtn      = document.getElementById('enter-btn');

document.body.style.overflow           = 'hidden';
document.documentElement.style.overflow = 'hidden';

enterBtn.addEventListener('click', () => {
  loadingScreen.classList.add('fade-out');
  document.body.style.overflow            = '';
  document.documentElement.style.overflow = '';
  // ENTER is a genuine user gesture → safe to start audio (autoplay policy).
  audioManager.start();
  // Load SFX, then play it once for the ENTER click itself (the buffer isn't
  // decoded until now, so this fires as soon as it's ready).
  audioManager.loadSfx('/audio/sfx.mp3').then(() => audioManager.playSfx());
  // Wire hover + click sounds to all interactive elements (incl. "Let's Talk").
  document.querySelectorAll('a, button, [data-hover]').forEach(el => {
    el.addEventListener('mouseenter', () => audioManager.playSfx());
    el.addEventListener('click',      () => audioManager.playSfx());
  });
  // Hide custom cursor elements once in the experience — user wants them only
  // on the enter screen, not during the scroll.
  const cursorDot  = document.getElementById('cursor-dot');
  const cursorRing = document.getElementById('cursor-ring');
  if (cursorDot)  cursorDot.style.display  = 'none';
  if (cursorRing) cursorRing.style.display = 'none';
  document.body.classList.remove('has-custom-cursor');
  // Remove from DOM after CSS transition completes
  setTimeout(() => { if (loadingScreen.parentNode) loadingScreen.remove(); }, 1400);
}, { once: true });


// ═══════════════════════════════════════════════════════════════
// AUDIO MANAGER
// ═══════════════════════════════════════════════════════════════

// Ambient audio path — user supplies the actual file at public/audio/ambient.mp3
// AudioManager handles missing file gracefully (disables button, logs warning)
const audioManager = new AudioManager(
  '/audio/ambient.mp3',
  document.getElementById('mute-toggle'),
  document.getElementById('mute-icon'),
);

// Preload (fetch + store raw bytes) but don't decode/play yet.
// Decode happens on first user interaction (browser autoplay policy).
audioManager.preload();

// ── READY GATE ───────────────────────────────────────────────
// Unblocks once first WebGL frame renders. Audio preloads in background —
// no need to wait for it since playback only starts on ENTER click.
let _firstFrameDone = false;

function _checkLoadReady() {
  if (!_firstFrameDone) return;
  enterBtn.textContent = 'ENTER IN';
  enterBtn.classList.remove('enter-btn--loading');
}

// Fallback: if audio fetch stalls (slow mobile/tablet network), unblock after 5s
setTimeout(() => { _audioReady = true; _checkLoadReady(); }, 5000);


// ═══════════════════════════════════════════════════════════════
// MOUSE TRACKER
// ═══════════════════════════════════════════════════════════════

// Initializes mousemove listener + GSAP ticker lerp.
// Writes smoothed mouse position to uniforms.uMouse each frame.
const mouseTracker = new MouseTracker(uniforms);

// Glowing cursor active immediately (shows on the enter screen).
// Removed on ENTER click — only lives on the loading overlay.
const cursorFollower = new CursorFollower();

// ═══════════════════════════════════════════════════════════════
// SCROLL TIMELINE
// ═══════════════════════════════════════════════════════════════

// Initializes GSAP ScrollTrigger master timeline.
// Passes uniforms (mutated directly), camera (position set each frame via spline),
// lookAtTarget (written by scroll update), and audioManager (started on first scroll).
// Force scroll to top on load — prevents stale scroll state from browser refresh.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const scrollTimeline = initScrollTimeline(uniforms, cameraBase, lookAtTarget, cameraUp, audioManager);

// ═══════════════════════════════════════════════════════════════
// AUTO-SCROLL (mobile-friendly cinematic playback)
// ═══════════════════════════════════════════════════════════════
// Must init AFTER scrollTimeline so we can pass masterTimeline reference.
// AutoScroller drives masterTimeline directly (bypassing scrub:7 lag).
const autoScroller = new AutoScroller(
  document.getElementById('autoscroll-toggle'),
  document.getElementById('autoscroll-icon'),
  scrollTimeline,
);


// ═══════════════════════════════════════════════════════════════
// RENDER LOOP
// ═══════════════════════════════════════════════════════════════

// Idle drift: a subtle breathing motion applied when not scrolling.
// The camera position set by ScrollTrigger is a "base" position.
// We add a tiny sinusoidal Y offset on top to make the scene feel alive.
// _lastCameraY: stores the ScrollTrigger base Y so we can add drift on top.
function tick() {
  // Signal that the first frame has rendered — unblocks the ENTER button
  // (once audio preload also resolves).
  if (!_firstFrameDone) {
    _firstFrameDone = true;
    _checkLoadReady();
  }

  const elapsedTime = clock.getElapsedTime();  // Seconds since start

  // ── UPDATE TIME UNIFORM ──────────────────────────────────
  // Drives simplex noise animation in vertex shader.
  // Multiplied by 0.15 in shader to control wave speed.
  uniforms.uTime.value = elapsedTime;

  // Hand breathing oscillation — subtle Y rise/fall on hand particles.
  uniforms.uHandBreath.value = Math.sin(elapsedTime * 0.45) * 0.35;

  // ── MOUSE PARALLAX ───────────────────────────────────────
  // uMouse is the smoothed cursor position [-1,1] (lerped in MouseTracker).
  // Offset the camera by it so moving the cursor swings the viewpoint —
  // pairs with the particle repulsion so the cursor pushes BOTH the field
  // and the camera. Kept modest so the scroll-driven orbit stays dominant.
  const m = uniforms.uMouse.value;
  const parallaxX = m.x * 3.5;
  const parallaxY = m.y * 2.0;

  // ── IDLE DRIFT ───────────────────────────────────────────
  // Slow sinusoidal breathing on Y so the scene never feels frozen.
  const idleDrift = Math.sin(elapsedTime * 0.3) * 0.18;

  // ── COMPOSE FINAL CAMERA POSITION ────────────────────────
  // base (scroll spline) + mouse parallax + drift. Set absolutely each frame
  // from cameraBase so offsets never accumulate.
  camera.position.set(
    cameraBase.x + parallaxX,
    cameraBase.y + parallaxY + idleDrift,
    cameraBase.z,
  );

  // ── CAMERA LOOKAT (with counter-parallax) ────────────────
  // Shift the lookAt slightly OPPOSITE the camera parallax → adds depth, the
  // foreground particles swim against the background as the cursor moves.
  _finalLookAt.copy(lookAtTarget);
  _finalLookAt.x -= parallaxX * 0.18;
  _finalLookAt.y -= parallaxY * 0.18;
  // Apply scroll-driven roll (set by ScrollTimeline) BEFORE lookAt so the
  // flip-into-sky orientation is respected this frame.
  camera.up.copy(cameraUp);
  camera.lookAt(_finalLookAt);

  // ── CURSOR REPULSION TARGET (raycast onto terrain plane) ─────
  // Done AFTER positioning so the camera matrix is current this frame.
  // setFromCamera expects NDC [-1,1]; uMouse already is (y up). Intersect the
  // y=0 plane → exact world point under the cursor → repulsion uniform.
  camera.updateMatrixWorld();
  _raycaster.setFromCamera(m, camera);
  if (_raycaster.ray.intersectPlane(_terrainPlane, _hitPoint)) {
    uniforms.uMouseWorld.value.set(_hitPoint.x, _hitPoint.z);
  }

  // ── RENDER ──────────────────────────────────────────────
  composer.render();

  // Schedule next frame
  window.requestAnimationFrame(tick);
}

tick();


// ═══════════════════════════════════════════════════════════════
// RESIZE HANDLER
// ═══════════════════════════════════════════════════════════════
// Must update: camera aspect + projection matrix, renderer size,
//              uPixelRatio uniform (point sizes depend on this).
//
// Debounced with requestAnimationFrame to avoid thrashing on every
// pixel of a drag resize (common in development).

let _resizeRAF = null;

function onResize() {
  // Cancel any pending resize frame
  if (_resizeRAF) cancelAnimationFrame(_resizeRAF);

  // Schedule resize for next available frame
  // This batches rapid resize events into a single update
  _resizeRAF = requestAnimationFrame(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Update camera aspect ratio — without this, scene stretches on resize
    camera.aspect = w / h;

    // Recompute projection matrix after changing aspect
    // Required after any camera property change
    camera.updateProjectionMatrix();

    // Update renderer output size — matches canvas to new window size
    renderer.setSize(w, h);

    // Update pixel ratio in case user dragged to a different monitor
    const newDPR = Math.min(window.devicePixelRatio, MAX_DPR);
    renderer.setPixelRatio(newDPR);

    // Composer must match renderer size — bloom pass uses resolution internally
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);

    // Sync uPixelRatio uniform — vertex shader uses this for point size
    // Without this update, particles appear wrong size after resize on retina
    uniforms.uPixelRatio.value = newDPR;

    // ScrollTrigger must recalculate scroll positions after resize
    ScrollTrigger.refresh();
  });
}

window.addEventListener('resize', onResize, { passive: true });


// ═══════════════════════════════════════════════════════════════
// SCENE READY — reveal the page
// ═══════════════════════════════════════════════════════════════
// CSS sets body { visibility: hidden } to prevent flash of unstyled
// content before Three.js initializes. We reveal it now.

document.body.classList.add('scene-ready');

// Animate body opacity from 0 to 1 for smooth reveal
gsap.fromTo('body', { opacity: 0 }, {
  opacity: 1,
  duration: 1.2,
  ease: 'power2.out',
  delay: 0.1,  // Tiny delay ensures first frame has rendered
});
