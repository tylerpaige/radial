/**
 * 12-hour clock presentation on top of {@link RadialRayStage}.
 * @module radial-clock
 */

import {
  RadialRayStage,
  prefersReducedMotion,
  TEXT_ORIENTATION,
} from './radial-rays-base.js';

export { TEXT_ORIENTATION };
export { RadialRayStage } from './radial-rays-base.js';

const defaultClockConfig = () => ({
  rayCount: 12,
  anglePeak: 20,
  angleSigma: 0.5,
  transitionMs: 420,
  introEachMs: 420,
  rayLabels: [
    '12:00',
    '1:00',
    '2:00',
    '3:00',
    '4:00',
    '5:00',
    '6:00',
    '7:00',
    '8:00',
    '9:00',
    '10:00',
    '11:00',
  ],
  rayInsetPx: 48,
  rayLabelFontSize: 15,
  rayLabelColor: '#ffffff',
  textOrientation: TEXT_ORIENTATION.RADIAL,
  rayColors: [
    '#dddddd',
    '#c8c8c8',
    '#b0b0b0',
    '#989898',
    '#808080',
    '#686868',
    '#505050',
    '#3d3d3d',
    '#2a2a2a',
    '#1a1a1a',
    '#111111',
    '#0a0a0a',
    '#050505',
    '#000000',
  ],
  showDebugReadout: false,
});

/**
 * Build `rays` array for the stage from flat clock config.
 * @param {ReturnType<typeof defaultClockConfig>} cfg
 */
export function raysFromClockConfig(cfg) {
  const n = Math.max(1, Math.floor(cfg.rayCount));
  const labels = Array.isArray(cfg.rayLabels) ? cfg.rayLabels : [];
  const palette = Array.isArray(cfg.rayColors) ? cfg.rayColors : ['#cccccc'];
  const rays = [];
  for (let i = 0; i < n; i++) {
    rays.push({
      color: palette[i % palette.length],
      label: labels.length ? String(labels[i % labels.length]) : '',
    });
  }
  return rays;
}

/**
 * Smallest logical index 0…n−1 whose repeating time label matches local 12-hour clock hour.
 * @param {number} n
 * @param {string[]} rayLabels
 */
export function logicalIndexForCurrentHour(n, rayLabels) {
  const m = Math.max(1, rayLabels.length);
  const h = new Date().getHours();
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  const target = hour12 % 12;
  for (let L = 0; L < n; L++) {
    if (L % m === target) return L;
  }
  return 0;
}

/**
 * @param {SVGElement|string} svg
 * @param {{ clock?: object, stage?: object, hooks?: object, debugElement?: HTMLElement|null }} [options]
 */
export function createRadialClock(svg, options = {}) {
  const clockCfg = { ...defaultClockConfig(), ...(options.clock || {}) };
  const rays = raysFromClockConfig(clockCfg);
  const stageHooks = { ...(options.hooks || {}) };

  const stage = new RadialRayStage(svg, {
    rays,
    hooks: {},
    config: {
      anglePeak: clockCfg.anglePeak,
      angleSigma: clockCfg.angleSigma,
      transitionMs: clockCfg.transitionMs,
      introEachMs: clockCfg.introEachMs,
      labelInsetPx: clockCfg.rayInsetPx,
      labelFontSize: clockCfg.rayLabelFontSize,
      labelColor: clockCfg.rayLabelColor,
      textOrientation: clockCfg.textOrientation,
      rayColors: clockCfg.rayColors,
      showDebugReadout: clockCfg.showDebugReadout,
      ...(options.stage || {}),
    },
  });

  const debugEl = options.debugElement ?? null;

  const updateDebug = () => {
    if (!debugEl || !clockCfg.showDebugReadout) return;
    const n = stage.count;
    const sigma = stage.getConfig().angleSigma;
    const peak = stage.getConfig().anglePeak;
    if (stage.activeIndex < 0) {
      debugEl.textContent = `no selection (equal) · σ=${Number(sigma).toFixed(2)}  peak=${Number(peak).toFixed(2)}`;
    } else {
      debugEl.textContent = `ray ${stage.activeIndex + 1} / ${n}  ·  taper σ=${Number(sigma).toFixed(2)}  peak=${Number(peak).toFixed(2)}`;
    }
  };

  const selectRayForCurrentHour = () => {
    const n = stage.count;
    const idx = logicalIndexForCurrentHour(n, clockCfg.rayLabels);
    stage.setActiveRay(idx);
  };

  stage.setHooks({
    ...stageHooks,
    afterInitialize: (...args) => {
      stageHooks.afterInitialize?.(...args);
      updateDebug();
    },
    afterRayFocus: (...args) => {
      stageHooks.afterRayFocus?.(...args);
      updateDebug();
    },
    afterRayBlur: (...args) => {
      stageHooks.afterRayBlur?.(...args);
      updateDebug();
    },
    afterBlurAll: (...args) => {
      stageHooks.afterBlurAll?.(...args);
      updateDebug();
    },
  });

  const start = () => {
    stage.initialize();
    if (debugEl) {
      debugEl.style.display = clockCfg.showDebugReadout ? '' : 'none';
    }
    stage.attachInteraction({ resize: true, keydown: true, pointer: true });
    if (prefersReducedMotion()) {
      stage.setIntroComplete(true);
      stage.blurAll({ immediate: true });
      selectRayForCurrentHour();
    } else {
      stage.setIntroComplete(false);
      stage.runIntro({
        eachMs: clockCfg.introEachMs,
        onDone: () => {
          selectRayForCurrentHour();
          updateDebug();
        },
      });
    }
    updateDebug();
  };

  return {
    stage,
    clockConfig: clockCfg,
    selectRayForCurrentHour,
    updateDebug,
    start,
  };
}
