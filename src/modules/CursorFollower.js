// ═══════════════════════════════════════════════════════════════
// CURSOR FOLLOWER
// A small glowing dot tracks the pointer 1:1, and a literal LINE trail (drawn
// on a full-screen canvas) streaks behind it — a continuous tapering glowing
// stroke, NOT a string of dots. No ring/circle around the cursor.
//
// Skipped entirely on touch / no-hover devices (keeps the native touch UX).
// ═══════════════════════════════════════════════════════════════

export class CursorFollower {
  constructor() {
    // Bail on touch devices — a trailing line makes no sense without a pointer.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    this.dot  = document.getElementById('cursor-dot');
    if (!this.dot) return;

    // Remove the circle/ring entirely — user wants no ring around the cursor.
    const ring = document.getElementById('cursor-ring');
    if (ring) ring.style.display = 'none';

    document.body.classList.add('has-custom-cursor');

    // ── LINE-TRAIL CANVAS ────────────────────────────────────────
    // Full-screen, fixed, never intercepts input. We redraw a polyline through
    // the recent cursor positions every frame → a real line that follows.
    this.dpr    = Math.min(window.devicePixelRatio, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'cursor-trail';
    Object.assign(this.canvas.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '9998',
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this._resize = this._resize.bind(this);
    this._resize();
    window.addEventListener('resize', this._resize, { passive: true });

    // Pointer target (instant) + a lagged head that eases toward it (so the
    // trail follows slightly behind the cursor, not locked to it).
    this.tx = window.innerWidth / 2;
    this.ty = window.innerHeight / 2;
    this.hx = this.tx;       // lagged head position
    this.hy = this.ty;
    this.points    = [];     // recent {x,y}, newest first
    this.maxPoints = 11;     // SHORT tail

    // Elements that should trigger the hover state.
    this.hoverSelector = 'a, button, [data-hover]';

    this._onMove = this._onMove.bind(this);
    this._onOver = this._onOver.bind(this);
    this._onOut  = this._onOut.bind(this);
    this._tick   = this._tick.bind(this);

    window.addEventListener('mousemove', this._onMove, { passive: true });
    document.addEventListener('mouseover', this._onOver, { passive: true });
    document.addEventListener('mouseout',  this._onOut,  { passive: true });

    requestAnimationFrame(this._tick);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width  = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _onMove(e) {
    this.tx = e.clientX;
    this.ty = e.clientY;
    // Dot tracks the pointer exactly — no lag.
    this.dot.style.transform = `translate(${this.tx}px, ${this.ty}px) translate(-50%, -50%)`;
  }

  _hoverableFrom(el) {
    return el && el.closest ? el.closest(this.hoverSelector) : null;
  }

  _onOver(e) {
    const target = this._hoverableFrom(e.target);
    if (target) {
      document.body.classList.add('cursor-hover');
      target.classList.add('is-hovered');
    }
  }

  _onOut(e) {
    const target = this._hoverableFrom(e.target);
    if (target) {
      const to = e.relatedTarget;
      if (!to || !target.contains(to)) {
        document.body.classList.remove('cursor-hover');
        target.classList.remove('is-hovered');
      }
    }
  }

  _tick() {
    const ctx = this.ctx;
    const w = window.innerWidth, h = window.innerHeight;

    // Ease the head toward the pointer → trail lags slightly behind the cursor.
    this.hx += (this.tx - this.hx) * 0.55;
    this.hy += (this.ty - this.hy) * 0.55;
    this.points.unshift({ x: this.hx, y: this.hy });
    if (this.points.length > this.maxPoints) this.points.pop();

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(120, 195, 255, 0.7)';

    // Draw the trail as connected line segments — newest = thick + bright,
    // tapering to thin + transparent at the tail → a comet-like line streak.
    const p = this.points;
    for (let i = 0; i < p.length - 1; i++) {
      const t = 1 - i / p.length;          // 1 at head → 0 at tail
      ctx.beginPath();
      ctx.moveTo(p[i].x, p[i].y);
      ctx.lineTo(p[i + 1].x, p[i + 1].y);
      ctx.strokeStyle = `rgba(180, 222, 255, ${(t * 0.7).toFixed(3)})`;
      ctx.lineWidth   = 3.2 * t;
      ctx.shadowBlur  = 9 * t;
      ctx.stroke();
    }

    requestAnimationFrame(this._tick);
  }
}
