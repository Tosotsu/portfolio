// ═══════════════════════════════════════════════════════════════
// MOUSE TRACKER
// Converts raw mousemove events into normalized [-1,1] coordinates
// and smoothly lerps the shader uniform toward the target position.
//
// Two-stage smoothing:
//   1. Raw event → mouseTarget (instant, raw screen coords)
//   2. mouseTarget → uniforms.uMouse (GSAP ticker lerp, lag factor 0.05)
//
// The lag (0.05) creates the "trailing" effect — shader repulsion
// follows the cursor with a slight delay, feeling organic rather than rigid.
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { gsap } from 'gsap';

export class MouseTracker {
  /**
   * @param {Object} uniforms - The particle material's uniforms object.
   *                            Must contain uMouse: { value: THREE.Vector2 }
   */
  constructor(uniforms) {
    this.uniforms = uniforms;

    // mouseTarget: the "true" current mouse position in normalized coords.
    // Updated instantly on every mousemove event.
    // Separate from uMouse so we can lerp toward it smoothly.
    this.mouseTarget = new THREE.Vector2(0, 0);

    // Bind so we can remove the listener later if needed
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);

    this._init();
  }

  _init() {
    // Listen for mouse movement across the whole window
    window.addEventListener('mousemove', this._onMouseMove, { passive: true });

    // Touch support — maps touch position to same normalized coords
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });

    // GSAP ticker: runs every frame in sync with requestAnimationFrame.
    // Lerps uniforms.uMouse toward mouseTarget by factor 0.05 each frame.
    //
    // lerp(target, alpha): this.uMouse = this.uMouse + (target - this.uMouse) * alpha
    // alpha = 0.05: 5% of the gap closed per frame (slow, smooth lag)
    // Customize: increase to 0.1 for faster tracking, 0.02 for more lag
    gsap.ticker.add(() => {
      this.uniforms.uMouse.value.lerp(this.mouseTarget, 0.10);
    });
  }

  /**
   * Convert screen pixel coordinates to normalized [-1, 1] range.
   * WebGL convention: X increases right, Y increases UP (screen Y is inverted).
   *
   * @param {number} clientX - Raw screen X from event
   * @param {number} clientY - Raw screen Y from event
   */
  _updateFromClient(clientX, clientY) {
    // Map [0, window.innerWidth] → [-1, 1]
    this.mouseTarget.x = (clientX / window.innerWidth)  * 2 - 1;

    // Map [0, window.innerHeight] → [1, -1] (Y flipped for WebGL)
    // Top of screen = +1 (positive Y in WebGL world)
    // Bottom of screen = -1
    this.mouseTarget.y = -(clientY / window.innerHeight) * 2 + 1;
  }

  _onMouseMove(e) {
    this._updateFromClient(e.clientX, e.clientY);
  }

  _onTouchMove(e) {
    // Use first touch point
    if (e.touches.length > 0) {
      this._updateFromClient(e.touches[0].clientX, e.touches[0].clientY);
    }
  }

  /**
   * Clean up event listeners and GSAP ticker.
   * Call this if you ever need to dispose the scene.
   */
  destroy() {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('touchmove', this._onTouchMove);
    // Note: gsap.ticker.remove() would need a named reference to the tick fn
    // For simplicity in this portfolio, disposal is not typically needed
  }
}
