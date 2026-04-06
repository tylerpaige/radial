/**
 * Composable radial ray stage: wedges from the origin, selection emphasis, labels, and interaction.
 * @module radial-rays-base
 */

export const TEXT_ORIENTATION = {
  /** Label rotated to match wedge bisector (clock-style). */
  RADIAL: 'radial',
  /** Label upright in screen space. */
  HORIZONTAL: 'horizontal',
  /** Perpendicular to bisector (tangent to arc). */
  TANGENT: 'tangent',
};

const svgNS = 'http://www.w3.org/2000/svg';

/** First hit of a ray from (0,0) at angle (from +x axis, clockwise/y-down) with the rect [0,w]×[0,h]. */
export const rayToRectBoundary = (w, h, angle) => {
  if (angle <= 1e-10) return { x: w, y: 0 };
  if (angle >= Math.PI / 2 - 1e-10) return { x: 0, y: h };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tBottom = h / sin;
  const xAtBottom = tBottom * cos;
  if (xAtBottom <= w + 1e-9) return { x: xAtBottom, y: h };
  const tRight = w / cos;
  return { x: w, y: tRight * sin };
};

/** Wedge from angle a1 to a2 (radians), covering the viewport from the origin. */
export const wedgePolygon = (w, h, a1, a2) => {
  const p1 = rayToRectBoundary(w, h, a1);
  const p2 = rayToRectBoundary(w, h, a2);
  const corners = [
    { x: w, y: 0, a: 0 },
    { x: w, y: h, a: Math.atan2(h, w) },
    { x: 0, y: h, a: Math.PI / 2 },
  ];
  const mid = corners.filter((c) => c.a > a1 + 1e-9 && c.a < a2 - 1e-9);
  mid.sort((u, v) => u.a - v.a);
  return [{ x: 0, y: 0 }, p1, ...mid.map((c) => ({ x: c.x, y: c.y })), p2];
};

export const polygonToPath = (pts) => {
  if (pts.length < 3) return '';
  const [p0, ...rest] = pts;
  let d = `M ${p0.x} ${p0.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  d += ' Z';
  return d;
};

const pickColor = (i, palette) => {
  if (!palette.length) return '#888888';
  return palette[i % palette.length];
};

/**
 * Per-ray angular widths (radians) summing to halfPi, peaked at activeGeoIndex with Gaussian taper.
 */
export const angularWidths = (activeGeoIndex, n, halfPi, peak, sigma) => {
  const raw = [];
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - activeGeoIndex);
    const g = Math.exp(-(d * d) / (2 * sigma * sigma));
    raw.push(1 + peak * g);
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => (halfPi * r) / sum);
};

export const cumulativeAngles = (widths, halfPi) => {
  const b = [0];
  let acc = 0;
  for (let i = 0; i < widths.length; i++) {
    acc += widths[i];
    b.push(acc);
  }
  b[b.length - 1] = halfPi;
  return b;
};

export const cumulativeAnglesPartial = (widths) => {
  const b = [0];
  let acc = 0;
  for (let i = 0; i < widths.length; i++) {
    acc += Math.max(0, widths[i]);
    b.push(acc);
  }
  return b;
};

export const normalizeWidths = (raw, halfPi) => {
  const safe = raw.map((x) => Math.max(1e-12, x));
  const s = safe.reduce((a, b) => a + b, 0);
  return safe.map((w) => (halfPi * w) / s);
};

export const equalAngularWidths = (n, halfPi) =>
  normalizeWidths(new Array(Math.max(1, n)).fill(1), halfPi);

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export const clamp01 = (t) => Math.min(1, Math.max(0, t));

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function parseHexColor(s) {
  const m = String(s).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerpColor(a, b, t) {
  const A = parseHexColor(a);
  const B = parseHexColor(b);
  if (!A || !B) return b;
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bch = Math.round(A.b + (B.b - A.b) * t);
  return `#${[r, g, bch].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @typedef {Object} RadialRayHooks
 * @property {(detail?: object) => void} [beforeInitialize]
 * @property {(detail?: object) => void} [afterInitialize]
 * @property {(detail?: object) => void} [beforeAnimateIn]
 * @property {(detail?: object) => void} [afterAnimateIn]
 * @property {(detail?: object) => void} [beforeAnimateOut]
 * @property {(detail?: object) => void} [afterAnimateOut]
 * @property {(detail?: { logicalIndex: number }) => void} [beforeRayFocus]
 * @property {(detail?: { logicalIndex: number }) => void} [afterRayFocus]
 * @property {(detail?: { logicalIndex: number }) => void} [beforeRayBlur]
 * @property {(detail?: { logicalIndex: number }) => void} [afterRayBlur]
 * @property {(detail?: object) => void} [beforeBlurAll]
 * @property {(detail?: object) => void} [afterBlurAll]
 * @property {(detail?: { logicalIndex: number, ray: object }) => void} [beforeRayInsert]
 * @property {(detail?: { logicalIndex: number, ray: object }) => void} [afterRayInsert]
 * @property {(detail?: { logicalIndex: number, ray: object }) => void} [beforeRayRemove]
 * @property {(detail?: { logicalIndex: number, ray: object }) => void} [afterRayRemove]
 * @property {(detail?: { logicalIndex: number, clientX: number, clientY: number }) => void} [rayClick]
 * @property {(detail?: object) => void} [next]
 * @property {(detail?: object) => void} [previous]
 * @property {(detail?: object) => void} [swipeLeft]
 * @property {(detail?: object) => void} [swipeRight]
 */

const defaultConfig = () => ({
  anglePeak: 20,
  angleSigma: 0.5,
  transitionMs: 420,
  introEachMs: 420,
  labelInsetPx: 48,
  labelFontSize: 15,
  labelColor: '#ffffff',
  /** @type {keyof typeof TEXT_ORIENTATION} */
  textOrientation: TEXT_ORIENTATION.RADIAL,
  colorTransitionMs: 320,
  /** Fallback palette when a ray has no color */
  rayColors: ['#cccccc'],
  showDebugReadout: false,
  /** If true, pointer handlers call preventDefault on handled events */
  preventDefaultOnNavigate: true,
});

/**
 * Point along wedge bisector, inset from the viewport boundary along that ray by `insetPx`.
 */
export function labelPlacement(w, h, a1, a2, insetPx) {
  const alpha = (a1 + a2) / 2;
  const B = rayToRectBoundary(w, h, alpha);
  const dist = Math.hypot(B.x, B.y);
  const d = Math.max(0, dist - insetPx);
  const x = d * Math.cos(alpha);
  const y = d * Math.sin(alpha);
  const rotationDeg = (alpha * 180) / Math.PI;
  return { x, y, rotationDeg, alpha };
}

function rotationForOrientation(orientation, bisectorDeg, globalDefault) {
  const o = orientation ?? globalDefault;
  if (o === TEXT_ORIENTATION.HORIZONTAL) return 0;
  if (o === TEXT_ORIENTATION.TANGENT) return bisectorDeg + 90;
  return bisectorDeg;
}

export class RadialRayStage {
  /**
   * @param {SVGElement|string} container
   * @param {{ hooks?: RadialRayHooks, rays?: Array<{ id?: string|number, color?: string, label?: string, textOrientation?: string|null }>, config?: object }} [options]
   */
  constructor(container, options = {}) {
    this.svg =
      typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.svg || this.svg.namespaceURI !== svgNS) {
      throw new Error('RadialRayStage: container must be an SVG element');
    }
    this._hooks = { ...(options.hooks || {}) };
    this._config = { ...defaultConfig(), ...(options.config || {}) };
    this._rays = Array.isArray(options.rays) ? options.rays.map((r) => ({ ...r })) : [];
    this._halfPi = Math.PI / 2;
    /** @type {number} -1 = none, else logical index 0..n-1 */
    this._activeIndex = -1;
    this._lastW = 0;
    this._lastH = 0;
    this._groups = [];
    this._paths = [];
    this._clipPathPaths = [];
    this._labels = [];
    this._currentWidths = [];
    this._animRaf = null;
    this._introRaf = null;
    this._colorAnimRaf = null;
    this._fromColors = [];
    this._pointerStart = null;
    this._tapMaxMovePx = 22;
    this._swipeMinPx = 44;
    this._introComplete = true;
    this._pendingFocusLogical = null;
    this._boundOnKeydown = this._onKeydown.bind(this);
    this._boundOnPointerDown = this._onPointerDown.bind(this);
    this._boundOnPointerFinish = this._onPointerFinish.bind(this);
    this._boundOnLostCapture = this._onLostCapture.bind(this);
    this._resizeRaf = 0;
    this._boundOnResize = () => {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = requestAnimationFrame(() => this.resizeContainer());
    };
  }

  _emit(name, detail) {
    const fn = this._hooks[name];
    if (typeof fn === 'function') fn(detail);
  }

  /** Geo index 0…n-1 (+x toward +y) from logical index (user order). */
  geoFromLogical(logical) {
    return this.count - 1 - logical;
  }

  /** Logical index from geo index. */
  logicalFromGeo(geo) {
    return this.count - 1 - geo;
  }

  get count() {
    return this._rays.length;
  }

  get activeIndex() {
    return this._activeIndex;
  }

  get introComplete() {
    return this._introComplete;
  }

  setIntroComplete(value) {
    this._introComplete = !!value;
  }

  /**
   * Merge configuration (does not replace the rays list unless `rays` key is provided).
   * @param {object} partial
   */
  setConfig(partial) {
    if (partial && typeof partial === 'object') {
      if (Array.isArray(partial.rays)) {
        this._rays = partial.rays.map((r) => ({ ...r }));
      }
      const { rays: _, ...rest } = partial;
      Object.assign(this._config, rest);
    }
    return this;
  }

  getConfig() {
    return { ...this._config, rays: this._rays.map((r) => ({ ...r })) };
  }

  setHooks(hooks) {
    Object.assign(this._hooks, hooks || {});
    return this;
  }

  /**
   * Append or insert a ray.
   * @param {{ id?: string|number, color?: string, label?: string, textOrientation?: string|null }} ray
   * @param {number} [index] insert position in logical order (default: end)
   */
  addRay(ray, index) {
    const r = { ...ray };
    const i = index == null ? this._rays.length : Math.max(0, Math.min(this._rays.length, index));
    this._emit('beforeRayInsert', { logicalIndex: i, ray: r });
    this._rays.splice(i, 0, r);
    this._rebuildDom();
    this._emit('afterRayInsert', { logicalIndex: i, ray: r });
    return this;
  }

  /**
   * @param {number|string} indexOrId logical index or `id` field
   */
  removeRay(indexOrId) {
    let i = -1;
    if (typeof indexOrId === 'number' && Number.isInteger(indexOrId)) {
      i = indexOrId;
    } else {
      i = this._rays.findIndex((r) => r.id === indexOrId);
    }
    if (i < 0 || i >= this._rays.length) return this;
    const removed = this._rays[i];
    this._emit('beforeRayRemove', { logicalIndex: i, ray: { ...removed } });
    this._rays.splice(i, 1);
    if (this._activeIndex >= this._rays.length) {
      this._activeIndex = this._rays.length > 0 ? this._rays.length - 1 : -1;
    } else if (this._activeIndex > i) {
      this._activeIndex -= 1;
    }
    this._rebuildDom();
    this._emit('afterRayRemove', { logicalIndex: i, ray: removed });
    return this;
  }

  /**
   * @param {number} logicalIndex -1 for unfocused
   * @param {{ immediate?: boolean }} [opts]
   */
  setActiveRay(logicalIndex, opts = {}) {
    const idx = Math.min(this.count - 1, Math.max(-1, logicalIndex));
    if (opts.immediate) {
      this._snapToState(idx);
      return this;
    }
    this._animateToState(idx);
    return this;
  }

  blurAll(opts = {}) {
    return this.setActiveRay(-1, opts);
  }

  next(opts = {}) {
    const n = this.count;
    if (n < 1) return this;
    let nextIdx;
    if (this._activeIndex === -1) nextIdx = 0;
    else if (this._activeIndex === n - 1) nextIdx = -1;
    else nextIdx = this._activeIndex + 1;
    this._emit('next', { from: this._activeIndex, to: nextIdx, ...opts });
    return this.setActiveRay(nextIdx, opts);
  }

  previous(opts = {}) {
    const n = this.count;
    if (n < 1) return this;
    let nextIdx;
    if (this._activeIndex === -1) nextIdx = n - 1;
    else if (this._activeIndex === 0) nextIdx = -1;
    else nextIdx = this._activeIndex - 1;
    this._emit('previous', { from: this._activeIndex, to: nextIdx, ...opts });
    return this.setActiveRay(nextIdx, opts);
  }

  /**
   * Update fill colors; optionally animate from current fills.
   * @param {string[]|function(number, object): string} colorsOrFn - per-ray colors or (logicalIndex, ray) => color
   * @param {{ animate?: boolean }} [opts]
   */
  updateColors(colorsOrFn, opts = {}) {
    const animate = opts.animate !== false && this._config.colorTransitionMs > 0;
    const n = this.count;
    if (n < 1) return this;
    const nextColors = [];
    for (let i = 0; i < n; i++) {
      if (typeof colorsOrFn === 'function') {
        nextColors.push(colorsOrFn(i, this._rays[i]));
      } else {
        nextColors.push(pickColor(i, colorsOrFn));
      }
    }
    if (!animate) {
      for (let i = 0; i < n; i++) {
        this._rays[i].color = nextColors[i];
        if (this._paths[i]) this._paths[i].setAttribute('fill', nextColors[i]);
      }
      return this;
    }
    this._fromColors = this._paths.map((p) => p.getAttribute('fill') || '#888888');
    const duration = Math.max(1, this._config.colorTransitionMs);
    const start = performance.now();
    if (this._colorAnimRaf != null) cancelAnimationFrame(this._colorAnimRaf);
    const tick = (now) => {
      const t = clamp01((now - start) / duration);
      const e = easeOutCubic(t);
      for (let i = 0; i < n; i++) {
        const c = lerpColor(this._fromColors[i], nextColors[i], e);
        this._paths[i].setAttribute('fill', c);
      }
      if (t < 1) {
        this._colorAnimRaf = requestAnimationFrame(tick);
      } else {
        this._colorAnimRaf = null;
        for (let i = 0; i < n; i++) {
          this._rays[i].color = nextColors[i];
          this._paths[i].setAttribute('fill', nextColors[i]);
        }
      }
    };
    this._colorAnimRaf = requestAnimationFrame(tick);
    return this;
  }

  /**
   * Set default text orientation for all rays; optional per-ray override via ray.textOrientation.
   * @param {string} orientation - TEXT_ORIENTATION.*
   */
  setTextOrientation(orientation) {
    this._config.textOrientation = orientation;
    this._applyWidths(this._currentWidths.length === this.count ? this._currentWidths : this._widthsForState(this._activeIndex), {
      normalize: true,
    });
    return this;
  }

  /**
   * @param {number} logicalIndex
   * @param {string|null} orientation - null clears override
   */
  setRayTextOrientation(logicalIndex, orientation) {
    if (logicalIndex < 0 || logicalIndex >= this.count) return this;
    this._rays[logicalIndex].textOrientation = orientation;
    this._applyWidths(this._currentWidths.length === this.count ? this._currentWidths : this._widthsForState(this._activeIndex), {
      normalize: true,
    });
    return this;
  }

  /**
   * Resize to container (or window) dimensions. Rebuilds wedge geometry.
   * @param {number} [width]
   * @param {number} [height]
   */
  resizeContainer(width, height) {
    const w = width != null ? width : window.innerWidth;
    const h = height != null ? height : window.innerHeight;
    if (w < 1 || h < 1) return this;
    this._lastW = w;
    this._lastH = h;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('preserveAspectRatio', 'none');
    const target =
      this._currentWidths.length === this.count
        ? this._currentWidths
        : this._widthsForState(this._activeIndex);
    this._applyWidths(target, { normalize: true });
    return this;
  }

  /**
   * Full DOM rebuild from `_rays` (e.g. after add/remove). Preserves active index when possible.
   */
  _rebuildDom() {
    this._cancelWidthAnimation();
    const w = this._lastW || window.innerWidth;
    const h = this._lastH || window.innerHeight;
    this._lastW = w;
    this._lastH = h;
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this._groups.length = 0;
    this._paths.length = 0;
    this._clipPathPaths.length = 0;
    this._labels.length = 0;
    const n = this.count;
    if (n === 0) {
      this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      this.svg.setAttribute('preserveAspectRatio', 'none');
      this._currentWidths = [];
      this._activeIndex = -1;
      return this;
    }
    const colors = this._rays.map((r, i) => r.color || pickColor(i, this._config.rayColors));
    const half = this._halfPi;
    for (let geo = 0; geo < n; geo++) {
      const a1 = n > 0 ? (geo / n) * half : 0;
      const a2 = n > 0 ? ((geo + 1) / n) * half : half;
      const pts = wedgePolygon(w, h, a1, a2);
      const path = document.createElementNS(svgNS, 'path');
      const d0 = polygonToPath(pts);
      path.setAttribute('d', d0);
      path.setAttribute('fill', colors[geo]);
      path.setAttribute('stroke', 'none');
      path.style.cursor = 'pointer';

      const defs = document.createElementNS(svgNS, 'defs');
      const clipEl = document.createElementNS(svgNS, 'clipPath');
      const clipId = `ray-clip-${geo}-${Math.random().toString(36).slice(2, 9)}`;
      clipEl.setAttribute('id', clipId);
      const clipPathPath = document.createElementNS(svgNS, 'path');
      clipPathPath.setAttribute('d', d0);
      clipEl.appendChild(clipPathPath);
      defs.appendChild(clipEl);

      const textEl = document.createElementNS(svgNS, 'text');
      textEl.setAttribute('class', 'ray-label');
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');

      const labelLayer = document.createElementNS(svgNS, 'g');
      labelLayer.setAttribute('clip-path', `url(#${clipId})`);
      labelLayer.appendChild(textEl);

      const g = document.createElementNS(svgNS, 'g');
      g.classList.add('ray');
      const logical = this.logicalFromGeo(geo);
      g.setAttribute('data-ray-index', String(logical));
      g.setAttribute('data-ray-active', 'false');
      g.appendChild(defs);
      g.appendChild(path);
      g.appendChild(labelLayer);
      this.svg.appendChild(g);
      this._groups.push(g);
      this._paths.push(path);
      this._clipPathPaths.push(clipPathPath);
      this._labels.push(textEl);
    }
    this._snapToState(this._activeIndex);
    return this;
  }

  /**
   * Attach input handlers and optional window resize.
   * @param {{ resize?: boolean, keydown?: boolean, pointer?: boolean }} [options]
   */
  attachInteraction(options = {}) {
    const { resize = true, keydown = true, pointer = true } = options;
    if (keydown) window.addEventListener('keydown', this._boundOnKeydown, true);
    if (pointer) {
      this.svg.addEventListener('pointerdown', this._boundOnPointerDown);
      this.svg.addEventListener('pointerup', this._boundOnPointerFinish);
      this.svg.addEventListener('pointercancel', this._boundOnPointerFinish);
      this.svg.addEventListener('lostpointercapture', this._boundOnLostCapture);
    }
    if (resize) window.addEventListener('resize', this._boundOnResize);
    return this;
  }

  detachInteraction() {
    window.removeEventListener('keydown', this._boundOnKeydown, true);
    this.svg.removeEventListener('pointerdown', this._boundOnPointerDown);
    this.svg.removeEventListener('pointerup', this._boundOnPointerFinish);
    this.svg.removeEventListener('pointercancel', this._boundOnPointerFinish);
    this.svg.removeEventListener('lostpointercapture', this._boundOnLostCapture);
    window.removeEventListener('resize', this._boundOnResize);
    return this;
  }

  /**
   * Initialize: build DOM, layout, optional intro handled by caller or `runIntro`.
   */
  initialize() {
    this._emit('beforeInitialize', { stage: this });
    this._lastW = window.innerWidth;
    this._lastH = window.innerHeight;
    this._rebuildDom();
    this._emit('afterInitialize', { stage: this });
    return this;
  }

  /**
   * Staggered intro: rays appear in order along the fan (geo n-1 … 0).
   * @param {{ eachMs?: number, onDone?: () => void }} [opts]
   */
  runIntro(opts = {}) {
    const n = this.count;
    if (n < 1 || this._paths.length !== n) return this;
    this._cancelWidthAnimation();
    const each = Math.max(1, opts.eachMs != null ? opts.eachMs : this._config.introEachMs);
    this._activeIndex = -1;
    this._reorderDom();
    const introGeoOrder = Array.from({ length: n }, (_, i) => n - 1 - i);
    const introWidthsForStep = (visibleCount) => {
      const eff = new Array(n).fill(0);
      if (visibleCount <= 0) return eff;
      const w = this._halfPi / visibleCount;
      for (let i = 0; i < visibleCount; i++) {
        eff[introGeoOrder[i]] = w;
      }
      return eff;
    };
    let step = 0;
    let phaseStart = performance.now();
    const totalSteps = n;
    this._emit('beforeAnimateIn', { step: 0, total: totalSteps, stage: this });

    const tick = (now) => {
      const fromW = introWidthsForStep(step);
      const toW = introWidthsForStep(step + 1);
      const t = clamp01((now - phaseStart) / each);
      const e = easeOutCubic(t);
      const eff = fromW.map((f, i) => f + (toW[i] - f) * e);
      const newGeo = introGeoOrder[step];
      const labelOpacities = new Array(n);
      for (let i = 0; i < n; i++) {
        if (eff[i] < 1e-9) labelOpacities[i] = 0;
        else if (i === newGeo) labelOpacities[i] = e;
        else labelOpacities[i] = 1;
      }
      this._applyWidths(eff, { normalize: false, labelOpacities });

      if (t < 1 - 1e-6) {
        this._introRaf = requestAnimationFrame(tick);
        return;
      }

      this._emit('afterAnimateIn', { step, total: totalSteps, stage: this });

      if (step === n - 1) {
        this._introRaf = null;
        this._introComplete = true;
        this._emit('beforeAnimateOut', { stage: this });
        this._snapToState(-1);
        this._emit('afterAnimateOut', { stage: this });
        if (typeof opts.onDone === 'function') opts.onDone();
        return;
      }

      step += 1;
      phaseStart = now;
      this._emit('beforeAnimateIn', { step, total: totalSteps, stage: this });
      this._introRaf = requestAnimationFrame(tick);
    };

    this._introRaf = requestAnimationFrame(tick);
    return this;
  }

  _cancelWidthAnimation() {
    if (this._introRaf != null) {
      cancelAnimationFrame(this._introRaf);
      this._introRaf = null;
    }
    if (this._animRaf != null) {
      cancelAnimationFrame(this._animRaf);
      this._animRaf = null;
    }
  }

  _widthsForState(activeLogical) {
    const n = this.count;
    const halfPi = this._halfPi;
    if (n < 1) return [];
    const peak = Math.max(0, this._config.anglePeak);
    const sigma = Math.max(0.35, this._config.angleSigma);
    if (activeLogical === -1) return equalAngularWidths(n, halfPi);
    return angularWidths(this.geoFromLogical(activeLogical), n, halfPi, peak, sigma);
  }

  _applyWidths(widths, opts = {}) {
    const normalize = opts.normalize !== false;
    const skipLabels = opts.skipLabels === true;
    const labelOpacities = opts.labelOpacities;
    const w = this._lastW;
    const h = this._lastH;
    const n = this.count;
    if (w < 1 || h < 1 || this._paths.length !== n || n < 1) return;
    const halfPi = this._halfPi;
    const norm = normalize ? normalizeWidths(widths, halfPi) : widths.map((x) => Math.max(0, x));
    if (normalize) this._currentWidths = norm;
    const bounds = normalize ? cumulativeAngles(norm, halfPi) : cumulativeAnglesPartial(norm);
    const labelInsetPx = Math.max(0, this._config.labelInsetPx);
    const labelFontSize = Math.max(6, this._config.labelFontSize);
    const labelColor = this._config.labelColor || '#ffffff';
    const globalOrient = this._config.textOrientation || TEXT_ORIENTATION.RADIAL;

    for (let i = 0; i < n; i++) {
      const a1 = bounds[i];
      const a2 = bounds[i + 1];
      if (a2 - a1 < 1e-9) {
        this._paths[i].setAttribute('d', '');
        this._clipPathPaths[i].setAttribute('d', '');
      } else {
        const pts = wedgePolygon(w, h, a1, a2);
        const d = polygonToPath(pts);
        this._paths[i].setAttribute('d', d);
        this._clipPathPaths[i].setAttribute('d', d);
      }
    }
    if (skipLabels) {
      for (let i = 0; i < n; i++) this._labels[i].setAttribute('display', 'none');
    } else {
      for (let i = 0; i < n; i++) {
        const logical = this.logicalFromGeo(i);
        const str = this._rays[logical].label != null ? String(this._rays[logical].label) : '';
        const a1 = bounds[i];
        const a2 = bounds[i + 1];
        const { x, y, rotationDeg } = labelPlacement(w, h, a1, a2, labelInsetPx);
        const te = this._labels[i];
        te.textContent = str;
        const op =
          labelOpacities != null && labelOpacities.length === n ? labelOpacities[i] : 1;
        if (bounds[i + 1] - bounds[i] < 1e-9 || op < 1e-4 || str === '') {
          te.setAttribute('display', 'none');
          te.removeAttribute('opacity');
        } else {
          te.removeAttribute('display');
          if (labelOpacities != null && labelOpacities.length === n && op < 1 - 1e-6) {
            te.setAttribute('opacity', String(op));
          } else {
            te.removeAttribute('opacity');
          }
          te.setAttribute('x', x);
          te.setAttribute('y', y);
          const orient = this._rays[logical].textOrientation;
          const rot = rotationForOrientation(orient, rotationDeg, globalOrient);
          te.setAttribute('transform', `rotate(${rot}, ${x}, ${y})`);
          te.setAttribute('fill', labelColor);
          te.setAttribute('font-size', labelFontSize);
        }
      }
    }
  }

  _reorderDom() {
    const n = this.count;
    if (this._activeIndex < 0) {
      this._groups.forEach((g) => {
        g.setAttribute('data-ray-active', 'false');
        this.svg.appendChild(g);
      });
      return;
    }
    const gSel = this.geoFromLogical(this._activeIndex);
    this._groups.forEach((g, i) => {
      g.setAttribute('data-ray-active', i === gSel ? 'true' : 'false');
      if (i !== gSel) this.svg.appendChild(g);
    });
    this.svg.appendChild(this._groups[gSel]);
  }

  _snapToState(index) {
    this._cancelWidthAnimation();
    this._activeIndex = index;
    const target = this._widthsForState(this._activeIndex);
    this._applyWidths(target, { normalize: true, skipLabels: false });
    this._reorderDom();
  }

  _animateToState(index) {
    if (!this._introComplete) return;
    const n = this.count;
    if (this._paths.length !== n || n < 1) return;

    const prev = this._activeIndex;
    if (prev === index) return;

    if (prev >= 0 && index === -1) {
      this._emit('beforeRayBlur', { logicalIndex: prev });
      this._emit('beforeBlurAll', {});
    } else if (prev === -1 && index >= 0) {
      this._emit('beforeRayFocus', { logicalIndex: index });
    } else if (prev >= 0 && index >= 0 && prev !== index) {
      this._emit('beforeRayBlur', { logicalIndex: prev });
      this._emit('beforeRayFocus', { logicalIndex: index });
    }

    this._cancelWidthAnimation();
    this._activeIndex = index;
    const toW = this._widthsForState(this._activeIndex);
    const fromW =
      this._currentWidths.length === n ? this._currentWidths.slice() : toW.slice();
    this._reorderDom();

    const transitionMs = Math.max(0, this._config.transitionMs);

    const finish = () => {
      if (prev >= 0 && index === -1) {
        this._emit('afterRayBlur', { logicalIndex: prev });
        this._emit('afterBlurAll', {});
      } else if (prev === -1 && index >= 0) {
        this._emit('afterRayFocus', { logicalIndex: index });
      } else if (prev >= 0 && index >= 0 && prev !== index) {
        this._emit('afterRayBlur', { logicalIndex: prev });
        this._emit('afterRayFocus', { logicalIndex: index });
      }
    };

    if (transitionMs <= 0) {
      this._applyWidths(toW);
      finish();
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / transitionMs);
      const e = easeOutCubic(t);
      const blended = fromW.map((f, i) => f + (toW[i] - f) * e);
      this._applyWidths(blended);
      if (t < 1) {
        this._animRaf = requestAnimationFrame(tick);
      } else {
        this._animRaf = null;
        this._applyWidths(toW);
        finish();
      }
    };
    this._animRaf = requestAnimationFrame(tick);
  }

  _logicalIndexFromClientXY(cx, cy) {
    const w = this._lastW;
    const h = this._lastH;
    if (w < 1 || h < 1) return -1;
    const angle = Math.atan2(cy, cx);
    if (angle < -1e-6 || angle > this._halfPi + 1e-6) return -1;
    const bounds = cumulativeAngles(this._currentWidths, this._halfPi);
    for (let geo = 0; geo < this.count; geo++) {
      if (angle >= bounds[geo] - 1e-9 && angle < bounds[geo + 1] - 1e-9) {
        return this.logicalFromGeo(geo);
      }
    }
    return this.logicalFromGeo(this.count - 1);
  }

  _onKeydown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      return;
    }
    if (!this._introComplete) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      if (this._config.preventDefaultOnNavigate) e.preventDefault();
      this.next();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      if (this._config.preventDefaultOnNavigate) e.preventDefault();
      this.previous();
    }
  }

  _onPointerDown(e) {
    if (!this._introComplete) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  _onPointerFinish(e) {
    if (!this._pointerStart || e.pointerId !== this._pointerStart.id) return;
    try {
      this.svg.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const sx = this._pointerStart.x;
    const sy = this._pointerStart.y;
    this._pointerStart = null;
    if (!this._introComplete) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const dist = Math.hypot(dx, dy);
    const w = window.innerWidth;
    if (dist < this._tapMaxMovePx) {
      const third = w / 3;
      if (e.clientX < third) {
        this.next({ via: 'tap' });
      } else if (e.clientX > w - third) {
        this.previous({ via: 'tap' });
      } else {
        const rect = this.svg.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        const logical = this._logicalIndexFromClientXY(lx, ly);
        if (logical >= 0) {
          this._emit('rayClick', {
            logicalIndex: logical,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }
      }
      return;
    }
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= this._swipeMinPx) {
      if (dx < 0) {
        this._emit('swipeLeft', {});
        this.next({ via: 'swipe' });
      } else {
        this._emit('swipeRight', {});
        this.previous({ via: 'swipe' });
      }
    }
  }

  _onLostCapture(e) {
    if (this._pointerStart && this._pointerStart.id === e.pointerId) {
      this._pointerStart = null;
    }
  }
}
