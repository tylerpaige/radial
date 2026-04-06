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
  /** Opacity fade (ms) when swapping to the short “blurred” label; 0 to disable. */
  blurLabelFadeMs: 1000,
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
 * True when `logicalIndex` is the ray that represents the current local hour
 * (same rule as {@link logicalIndexForCurrentHour}).
 */
export function isLogicalIndexCurrentHour(n, rayLabels, logicalIndex) {
  return logicalIndex === logicalIndexForCurrentHour(n, rayLabels);
}

/**
 * Maps a ray’s logical index (0 = 12:00, 1 = 1:00, …) to clock hour 1–12.
 */
export function hour12FromLogicalIndex(logicalIndex) {
  const m = logicalIndex % 12;
  return m === 0 ? 12 : m;
}

/**
 * Full label shown while a ray is focused (not the “current hour” ray; that uses `Now, of course: …`).
 * Keys are 1–12 (twelve-hour clock).
 */
export const RAY_FOCUS_MESSAGES_BY_HOUR_12 = {
  12: 'Fitting that the day begins with a number out of sequence. 12:00',
  1: 'A good time to focus on your #1 priority. 1:00',
  2: 'A bad time to consider if you\'re double booked. 2:00',
  3: 'About now you should be clocking in to work. 3:00',
  4: 'A time to be even-tempered. 4:00',
  5: 'The first non-factor of twelve. 5:00',
  6: 'In some legacy systems, halfway through the day. 6:00',
  7: 'By cruel misfortune, it will never be 7:77. 7:00',
  8: 'About now you should be clocking in to work. 8:00',
  9: 'In some upside down systems, halfway through the day. 9:00',
  10: 'Toes down on the ground: 10:00',
  11: 'In heaven, the angels are on their first smoke break. 11:00',
};

/** 12-hour time with minutes, e.g. `12:05`, `3:42`. */
export function formatTimeToMinute(d = new Date()) {
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${mm}`;
}

function msUntilNextMinute() {
  const now = new Date();
  return 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
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

  const templateLabelForLogicalIndex = (logicalIndex) => {
    const m = Math.max(1, clockCfg.rayLabels.length);
    return String(clockCfg.rayLabels[logicalIndex % m]);
  };

  /** Tracks `Date#getHours()` for hour-change detection. */
  let lastTrackedHour = new Date().getHours();
  let minuteTimeoutId = null;
  let minuteIntervalId = null;

  const clearMinuteSchedule = () => {
    if (minuteTimeoutId != null) {
      clearTimeout(minuteTimeoutId);
      minuteTimeoutId = null;
    }
    if (minuteIntervalId != null) {
      clearInterval(minuteIntervalId);
      minuteIntervalId = null;
    }
  };

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

  const focusedLabelForLogicalIndex = (logicalIndex, now = new Date()) => {
    const n = stage.count;
    if (isLogicalIndexCurrentHour(n, clockCfg.rayLabels, logicalIndex)) {
      return `Presenting: ${formatTimeToMinute(now)}`;
    }
    const h12 = hour12FromLogicalIndex(logicalIndex);
    return RAY_FOCUS_MESSAGES_BY_HOUR_12[h12] ?? templateLabelForLogicalIndex(logicalIndex);
  };

  const blurredLabelForLogicalIndex = (logicalIndex, now = new Date()) => {
    const n = stage.count;
    if (isLogicalIndexCurrentHour(n, clockCfg.rayLabels, logicalIndex)) {
      return formatTimeToMinute(now);
    }
    return templateLabelForLogicalIndex(logicalIndex);
  };

  const applyFocusedLabel = (logicalIndex, now = new Date()) => {
    if (logicalIndex < 0 || logicalIndex >= stage.count) return;
    stage.setRayLabel(logicalIndex, focusedLabelForLogicalIndex(logicalIndex, now));
  };

  const applyBlurredLabel = (logicalIndex, now = new Date()) => {
    if (logicalIndex < 0 || logicalIndex >= stage.count) return;
    const fadeMs = clockCfg.blurLabelFadeMs;
    const fadeOpts =
      typeof fadeMs === 'number' && fadeMs > 0 ? { fadeInMs: fadeMs } : {};
    stage.setRayLabel(logicalIndex, blurredLabelForLogicalIndex(logicalIndex, now), fadeOpts);
  };

  /**
   * While a ray is focused: refresh its “focused” copy (live time for current-hour ray).
   */
  const refreshActiveRayFocusedLabel = (now = new Date()) => {
    const idx = stage.activeIndex;
    const n = stage.count;
    if (idx < 0 || n < 1) return;
    applyFocusedLabel(idx, now);
  };

  const onMinuteTick = () => {
    if (!stage.introComplete) return;
    const now = new Date();
    const h24 = now.getHours();

    if (h24 !== lastTrackedHour) {
      lastTrackedHour = h24;
      const newIdx = logicalIndexForCurrentHour(stage.count, clockCfg.rayLabels);
      const navOpts = { animate: !prefersReducedMotion() };
      stage.setActiveRay(newIdx, navOpts);
      updateDebug();
      return;
    }

    refreshActiveRayFocusedLabel(now);
  };

  const startMinuteSchedule = () => {
    clearMinuteSchedule();
    lastTrackedHour = new Date().getHours();
    refreshActiveRayFocusedLabel();
    minuteTimeoutId = setTimeout(() => {
      minuteTimeoutId = null;
      onMinuteTick();
      minuteIntervalId = setInterval(onMinuteTick, 60000);
    }, msUntilNextMinute());
  };

  /**
   * @param {{ animate?: boolean, immediate?: boolean }} [navOpts]
   */
  const selectRayForCurrentHour = (navOpts) => {
    const n = stage.count;
    const idx = logicalIndexForCurrentHour(n, clockCfg.rayLabels);
    stage.setActiveRay(idx, navOpts);
    applyFocusedLabel(idx);
  };

  stage.setHooks({
    ...stageHooks,
    afterInitialize: (...args) => {
      stageHooks.afterInitialize?.(...args);
      updateDebug();
    },
    beforeRayBlur: (detail) => {
      stageHooks.beforeRayBlur?.(detail);
      if (detail && typeof detail.logicalIndex === 'number') {
        applyBlurredLabel(detail.logicalIndex);
      }
    },
    afterRayFocus: (detail) => {
      stageHooks.afterRayFocus?.(detail);
      if (detail && typeof detail.logicalIndex === 'number') {
        applyFocusedLabel(detail.logicalIndex);
      }
      updateDebug();
    },
    afterRayBlur: (detail) => {
      stageHooks.afterRayBlur?.(detail);
      updateDebug();
    },
    afterBlurAll: (...args) => {
      stageHooks.afterBlurAll?.(...args);
      updateDebug();
    },
  });

  const beginClock = () => {
    stage.resizeContainer();
    const navOpts = { animate: !prefersReducedMotion() };
    selectRayForCurrentHour(navOpts);
    updateDebug();
    startMinuteSchedule();
  };

  const start = () => {
    stage.initialize();
    if (debugEl) {
      debugEl.style.display = clockCfg.showDebugReadout ? '' : 'none';
    }
    stage.attachInteraction({ resize: true, keydown: true, pointer: true });
    if (prefersReducedMotion()) {
      stage.setIntroComplete(true);
      stage.blurAll({ animate: false });
      beginClock();
    } else {
      stage.setIntroComplete(false);
      stage.runIntro({
        eachMs: clockCfg.introEachMs,
        onDone: () => {
          beginClock();
        },
      });
    }
    updateDebug();
  };

  const isActiveRayCurrentHour = () => {
    const n = stage.count;
    const idx = stage.activeIndex;
    return idx >= 0 && isLogicalIndexCurrentHour(n, clockCfg.rayLabels, idx);
  };

  return {
    stage,
    clockConfig: clockCfg,
    selectRayForCurrentHour,
    updateDebug,
    start,
    /** Stops the per-minute timer (e.g. before teardown). */
    stopMinuteSchedule: clearMinuteSchedule,
    /** Whether the focused ray is the one for the current local hour. */
    isActiveRayCurrentHour,
  };
}
