// SpectraLab - Display Filters (CRT/retro post-processing)
// @ts-check
"use strict";

// ========== Filter State ==========
/** @type {number} Scanlines intensity 0-100 */
var filterScanlines = 0;
/** @type {number} Noise intensity 0-100 */
var filterNoise = 0;
/** @type {boolean} Animate noise */
var filterNoiseAnimate = false;
/** @type {number} Composite video blur radius 0-10 */
var filterComposite = 0;
/** @type {number} Phosphor glow intensity 0-100 */
var filterGlow = 0;
/** @type {number} Vignette intensity 0-100 */
var filterVignette = 0;
/** @type {number} CRT curvature intensity 0-100 */
var filterCurvature = 0;
/** @type {boolean} Pixel smoothing (bilinear interpolation) */
var filterSmoothing = false;
/** @type {boolean} Master enable for all filters */
var filtersEnabled = false;
/** @type {string} Current preset name */
var filterPreset = 'none';

// ========== Internal State ==========
/** @type {HTMLCanvasElement|null} */
var filterOverlayCanvas = null;
/** @type {CanvasRenderingContext2D|null} */
var filterOverlayCtx = null;
/** @type {number|null} Noise animation frame ID */
var noiseAnimFrameId = null;
/** @type {number} Last noise animation time */
var noiseAnimLastTime = 0;
/** @type {ImageData[]} Pre-generated noise frames */
var noiseFrames = [];
/** @type {number} Current noise frame index */
var noiseFrameIndex = 0;
/** @type {number} Noise frames width */
var noiseFramesW = 0;
/** @type {number} Noise frames height */
var noiseFramesH = 0;
/** @type {Float32Array|null} Barrel distortion LUT (x-offsets) */
var curvatureLutX = null;
/** @type {Float32Array|null} Barrel distortion LUT (y-offsets) */
var curvatureLutY = null;
/** @type {number} LUT width */
var curvatureLutW = 0;
/** @type {number} LUT height */
var curvatureLutH = 0;
/** @type {number} LUT curvature strength */
var curvatureLutStrength = 0;

// ========== Presets ==========
const FILTER_PRESETS = {
  none:      { scanlines: 0,  noise: 0,  composite: 0, glow: 0,  vignette: 0,  curvature: 0,  smoothing: false },
  crt_tv:    { scanlines: 25, noise: 5,  composite: 0, glow: 15, vignette: 30, curvature: 20, smoothing: false },
  composite: { scanlines: 10, noise: 8,  composite: 4, glow: 10, vignette: 20, curvature: 0,  smoothing: false },
  vhs:       { scanlines: 5,  noise: 15, composite: 7, glow: 5,  vignette: 15, curvature: 0,  smoothing: true },
  arcade:    { scanlines: 30, noise: 0,  composite: 0, glow: 20, vignette: 40, curvature: 10, smoothing: false }
};

// ========== Initialization ==========

/**
 * Initialize display filters: create overlay canvas, wire UI events
 */
function initDisplayFilters() {
  filterOverlayCanvas = document.getElementById('filterOverlayCanvas');
  if (filterOverlayCanvas) {
    filterOverlayCtx = filterOverlayCanvas.getContext('2d');
  }
  loadFilterSettings();
  wireFilterUI();
}

/**
 * Wire up filter UI controls (sliders, checkboxes, preset dropdown)
 */
function wireFilterUI() {
  // Sliders
  const sliderIds = [
    { id: 'filterScanlines', prop: 'scanlines' },
    { id: 'filterNoise', prop: 'noise' },
    { id: 'filterComposite', prop: 'composite' },
    { id: 'filterGlow', prop: 'glow' },
    { id: 'filterVignette', prop: 'vignette' },
    { id: 'filterCurvature', prop: 'curvature' }
  ];

  for (const s of sliderIds) {
    const slider = /** @type {HTMLInputElement|null} */ (document.getElementById(s.id));
    const label = document.getElementById(s.id + 'Value');
    if (!slider) continue;
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      switch (s.prop) {
        case 'scanlines': filterScanlines = val; break;
        case 'noise': filterNoise = val; invalidateNoiseFrames(); break;
        case 'composite': filterComposite = val; break;
        case 'glow': filterGlow = val; break;
        case 'vignette': filterVignette = val; break;
        case 'curvature': filterCurvature = val; invalidateCurvatureLut(); break;
      }
      if (label) label.textContent = String(val);
      setPresetDropdown('none');
      updateNoiseAnimation();
      renderScreen();
      saveSettings();
    });
  }

  // Noise animate checkbox
  const noiseAnimCb = /** @type {HTMLInputElement|null} */ (document.getElementById('filterNoiseAnimate'));
  if (noiseAnimCb) {
    noiseAnimCb.addEventListener('change', () => {
      filterNoiseAnimate = noiseAnimCb.checked;
      updateNoiseAnimation();
      saveSettings();
    });
  }

  // Pixel smoothing checkbox
  const smoothCb = /** @type {HTMLInputElement|null} */ (document.getElementById('filterSmoothing'));
  if (smoothCb) {
    smoothCb.addEventListener('change', () => {
      filterSmoothing = smoothCb.checked;
      setPresetDropdown('none');
      renderScreen();
      saveSettings();
    });
  }

  // Preset dropdown
  const presetSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('filterPresetSelect'));
  if (presetSel) {
    presetSel.addEventListener('change', () => {
      applyFilterPreset(presetSel.value);
      saveSettings();
    });
  }

  // Master enable checkbox
  const enableCb = /** @type {HTMLInputElement|null} */ (document.getElementById('filtersEnabledCheckbox'));
  if (enableCb) {
    enableCb.addEventListener('change', () => {
      filtersEnabled = enableCb.checked;
      updateNoiseAnimation();
      renderScreen();
      saveSettings();
    });
  }

  // Note: collapsible section is set up by screen_editor.js via setupCollapsible()
}

// ========== Preset Logic ==========

/**
 * Apply a named preset
 * @param {string} name
 */
function applyFilterPreset(name) {
  const preset = FILTER_PRESETS[name];
  if (!preset) return;

  filterScanlines = preset.scanlines;
  filterNoise = preset.noise;
  filterComposite = preset.composite;
  filterGlow = preset.glow;
  filterVignette = preset.vignette;
  filterCurvature = preset.curvature;
  filterSmoothing = preset.smoothing;
  filterPreset = name;
  // Selecting any preset other than "none" auto-enables filters
  if (name !== 'none') filtersEnabled = true;

  invalidateNoiseFrames();
  invalidateCurvatureLut();


  // Update UI controls
  updateFilterUI();
  updateNoiseAnimation();
  renderScreen();
}

/**
 * Set preset dropdown value without triggering change event
 * @param {string} name
 */
function setPresetDropdown(name) {
  filterPreset = name;
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('filterPresetSelect'));
  if (sel) sel.value = name;
}

/**
 * Update all filter UI controls to reflect current state
 */
function updateFilterUI() {
  const controls = [
    { id: 'filterScanlines', val: filterScanlines },
    { id: 'filterNoise', val: filterNoise },
    { id: 'filterComposite', val: filterComposite },
    { id: 'filterGlow', val: filterGlow },
    { id: 'filterVignette', val: filterVignette },
    { id: 'filterCurvature', val: filterCurvature }
  ];
  for (const c of controls) {
    const slider = /** @type {HTMLInputElement|null} */ (document.getElementById(c.id));
    const label = document.getElementById(c.id + 'Value');
    if (slider) slider.value = String(c.val);
    if (label) label.textContent = String(c.val);
  }
  const enableCb = /** @type {HTMLInputElement|null} */ (document.getElementById('filtersEnabledCheckbox'));
  if (enableCb) enableCb.checked = filtersEnabled;
  const noiseAnimCb = /** @type {HTMLInputElement|null} */ (document.getElementById('filterNoiseAnimate'));
  if (noiseAnimCb) noiseAnimCb.checked = filterNoiseAnimate;
  const smoothCb = /** @type {HTMLInputElement|null} */ (document.getElementById('filterSmoothing'));
  if (smoothCb) smoothCb.checked = filterSmoothing;
  const presetSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('filterPresetSelect'));
  if (presetSel) presetSel.value = filterPreset;
}

// ========== Settings Persistence ==========

/**
 * Get filter settings object for inclusion in saveSettings
 * @returns {Object}
 */
function getFilterSettings() {
  return {
    filtersEnabled: filtersEnabled,
    filterScanlines: filterScanlines,
    filterNoise: filterNoise,
    filterNoiseAnimate: filterNoiseAnimate,
    filterComposite: filterComposite,
    filterGlow: filterGlow,
    filterVignette: filterVignette,
    filterCurvature: filterCurvature,
    filterSmoothing: filterSmoothing,
    filterPreset: filterPreset
  };
}

/**
 * Apply filter settings from loaded settings object
 * @param {Object} settings
 */
function applyFilterSettings(settings) {
  if (settings.filtersEnabled !== undefined) filtersEnabled = settings.filtersEnabled;
  if (settings.filterScanlines !== undefined) filterScanlines = settings.filterScanlines;
  if (settings.filterNoise !== undefined) filterNoise = settings.filterNoise;
  if (settings.filterNoiseAnimate !== undefined) filterNoiseAnimate = settings.filterNoiseAnimate;
  if (settings.filterComposite !== undefined) filterComposite = settings.filterComposite;
  if (settings.filterGlow !== undefined) filterGlow = settings.filterGlow;
  if (settings.filterVignette !== undefined) filterVignette = settings.filterVignette;
  if (settings.filterCurvature !== undefined) filterCurvature = settings.filterCurvature;
  if (settings.filterSmoothing !== undefined) filterSmoothing = settings.filterSmoothing;
  if (settings.filterPreset !== undefined) filterPreset = settings.filterPreset;

  invalidateNoiseFrames();
  invalidateCurvatureLut();

  updateFilterUI();
  updateNoiseAnimation();
}

/**
 * Load filter settings from localStorage (called during init)
 */
function loadFilterSettings() {
  try {
    const stored = localStorage.getItem('screenViewerSettings');
    if (!stored) return;
    const settings = JSON.parse(stored);
    applyFilterSettings(settings);
  } catch (e) {
    // Ignore
  }
}

// ========== Overlay Canvas Management ==========

/**
 * Resize the filter overlay canvas to match screenCanvas dimensions
 */
function resizeFilterOverlay() {
  if (!filterOverlayCanvas || !screenCanvas) return;
  if (filterOverlayCanvas.width !== screenCanvas.width || filterOverlayCanvas.height !== screenCanvas.height) {
    filterOverlayCanvas.width = screenCanvas.width;
    filterOverlayCanvas.height = screenCanvas.height;
    // Invalidate cached patterns/frames since size changed
  
    invalidateNoiseFrames();
  }
}

// ========== Rendering Hooks ==========

/**
 * Apply pixel smoothing to a context (replaces ctx.imageSmoothingEnabled = false)
 * @param {CanvasRenderingContext2D} ctx
 */
function applyRenderSmoothing(ctx) {
  if (filtersEnabled && filterSmoothing) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  } else {
    ctx.imageSmoothingEnabled = false;
  }
}

/**
 * Apply post-process filters directly on screenCanvas pixels.
 * Called after format rendering, before grid overlays.
 * Handles: CRT curvature, composite video blur, scanlines.
 */
function applyPostProcessFilters() {
  if (!filtersEnabled) return;
  if (filterComposite <= 0 && filterCurvature <= 0 && filterScanlines <= 0) return;
  if (!screenCanvas) return;
  const ctx = screenCanvasCtx || screenCanvas.getContext('2d');
  if (!ctx) return;

  const w = screenCanvas.width;
  const h = screenCanvas.height;
  if (w === 0 || h === 0) return;

  if (filterCurvature > 0) {
    applyCurvatureFilter(ctx, w, h);
  }
  if (filterComposite > 0) {
    applyCompositeFilter(ctx, w, h);
  }
  // Scanlines applied last — they need to see final pixel brightness
  if (filterScanlines > 0) {
    applyScanlineFilter();
  }
}

/**
 * Apply overlay filters on the filter overlay canvas.
 * Called at the very end of renderScreen().
 * Handles: noise, phosphor glow, vignette.
 */
function applyOverlayFilters() {
  resizeFilterOverlay();
  if (!filterOverlayCanvas || !filterOverlayCtx) return;

  const w = filterOverlayCanvas.width;
  const h = filterOverlayCanvas.height;
  if (w === 0 || h === 0) return;

  const hasAnyOverlay = filtersEnabled && (filterNoise > 0 || filterGlow > 0 || filterVignette > 0);
  if (!hasAnyOverlay) {
    filterOverlayCtx.clearRect(0, 0, w, h);
    return;
  }

  filterOverlayCtx.clearRect(0, 0, w, h);

  // Draw phosphor glow first (screen blend)
  if (filterGlow > 0 && screenCanvas) {
    drawPhosphorGlow(filterOverlayCtx, w, h);
  }

  // Scanlines are now applied as post-process (applyScanlineFilter) not overlay

  // Draw noise
  if (filterNoise > 0) {
    drawNoise(filterOverlayCtx, w, h);
  }

  // Draw vignette
  if (filterVignette > 0) {
    drawVignette(filterOverlayCtx, w, h);
  }
}

// ========== Filter Implementations ==========

// ----- Scanlines -----

/**
 * Apply CRT-style scanlines with Gaussian beam profile and brightness-dependent
 * beam width, modeled after crt-geom / crt-lottes emulator shaders.
 *
 * On a real CRT the electron beam has a Gaussian-like vertical profile.
 * Bright pixels drive the beam harder, widening it so scanline gaps nearly
 * disappear, while dark pixels produce a narrow beam with visible gaps.
 *
 * Applied directly to screenCanvas pixels (post-process, not overlay) so that
 * per-pixel brightness can be sampled.
 */
function applyScanlineFilter() {
  if (filterScanlines <= 0) return;
  if (!screenCanvas) return;
  const ctx = screenCanvasCtx || screenCanvas.getContext('2d');
  if (!ctx) return;
  const w = screenCanvas.width;
  const h = screenCanvas.height;
  if (w === 0 || h === 0) return;

  const z = (typeof zoom !== 'undefined') ? zoom : 2;
  const pitch = z; // one source pixel row = z canvas rows = one scanline pitch

  const intensity = filterScanlines / 100;
  const sigmaMin = 0.20;
  const sigmaMax = 0.55;
  const gapFloor = 0.08;

  // Build LUT: factorLut[row_in_pitch][luminance] = multiply factor (0..256 fixed-point)
  // Only `pitch` distinct d-values × 256 luminance entries — eliminates all per-pixel math
  const lutSize = pitch * 256;
  const factorLut = new Uint16Array(lutSize);
  for (let row = 0; row < pitch; row++) {
    const d = (row / pitch) - 0.5;
    const base = row * 256;
    for (let lum = 0; lum < 256; lum++) {
      const lumNorm = lum / 255;
      const sigma = sigmaMin + (sigmaMax - sigmaMin) * Math.pow(lumNorm, 0.33);
      const ratio = d / sigma;
      let beam = Math.exp(-ratio * ratio);
      if (beam < gapFloor) beam = gapFloor;
      const factor = 1.0 - intensity * (1.0 - beam);
      factorLut[base + lum] = (factor * 256 + 0.5) | 0; // fixed-point 8.8
    }
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y++) {
    const lutRow = (y % pitch) * 256;
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = rowOffset + x * 4;
      const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      const f = factorLut[lutRow + lum];
      data[i]     = (data[i] * f) >> 8;
      data[i + 1] = (data[i + 1] * f) >> 8;
      data[i + 2] = (data[i + 2] * f) >> 8;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ----- Noise -----

function invalidateNoiseFrames() {
  noiseFrames = [];
  noiseFramesW = 0;
  noiseFramesH = 0;
}

/**
 * Generate noise frames for current canvas size
 * @param {number} w
 * @param {number} h
 */
function generateNoiseFrames(w, h) {
  // Use lower resolution for performance (every 2 pixels)
  const nw = Math.ceil(w / 2);
  const nh = Math.ceil(h / 2);
  noiseFrames = [];
  noiseFramesW = nw;
  noiseFramesH = nh;

  const frameCount = 6;
  for (let f = 0; f < frameCount; f++) {
    const imgData = new ImageData(nw, nh);
    const data32 = new Uint32Array(imgData.data.buffer);
    for (let i = 0; i < data32.length; i++) {
      const v = (Math.random() * 255) | 0;
      // RGBA: white pixel with random alpha
      data32[i] = (v << 24) | 0x00FFFFFF; // alpha in high byte (little-endian: ABGR)
    }
    noiseFrames.push(imgData);
  }
}

/**
 * Draw noise overlay
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
/** @type {HTMLCanvasElement|null} Reusable temp canvas for noise */
var noiseTempCanvas = null;
/** @type {CanvasRenderingContext2D|null} */
var noiseTempCtx = null;

function drawNoise(ctx, w, h) {
  const nw = Math.ceil(w / 2);
  const nh = Math.ceil(h / 2);
  if (noiseFrames.length === 0 || noiseFramesW !== nw || noiseFramesH !== nh) {
    generateNoiseFrames(w, h);
  }
  const frame = noiseFrames[noiseFrameIndex % noiseFrames.length];
  if (!frame) return;

  // Reuse temp canvas for noise rendering
  if (!noiseTempCanvas || noiseTempCanvas.width !== nw || noiseTempCanvas.height !== nh) {
    noiseTempCanvas = document.createElement('canvas');
    noiseTempCanvas.width = nw;
    noiseTempCanvas.height = nh;
    noiseTempCtx = noiseTempCanvas.getContext('2d');
  }
  const tctx = noiseTempCtx;
  if (!tctx) return;
  tctx.putImageData(frame, 0, 0);

  ctx.save();
  ctx.globalAlpha = filterNoise / 100 * 0.5; // Scale down — full noise is too intense
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseTempCanvas, 0, 0, w, h);
  ctx.restore();
}

/**
 * Start or stop noise animation loop
 */
function updateNoiseAnimation() {
  if (filtersEnabled && filterNoise > 0 && filterNoiseAnimate) {
    if (noiseAnimFrameId === null) {
      noiseAnimLastTime = performance.now();
      noiseAnimLoop(noiseAnimLastTime);
    }
  } else {
    if (noiseAnimFrameId !== null) {
      cancelAnimationFrame(noiseAnimFrameId);
      noiseAnimFrameId = null;
    }
  }
}

/**
 * Noise animation loop (~12fps)
 * @param {number} time
 */
function noiseAnimLoop(time) {
  const elapsed = time - noiseAnimLastTime;
  if (elapsed >= 83) { // ~12fps
    noiseAnimLastTime = time;
    noiseFrameIndex = (noiseFrameIndex + 1) % Math.max(1, noiseFrames.length);
    // Only redraw overlay (not full render for performance)
    applyOverlayFilters();
  }
  noiseAnimFrameId = requestAnimationFrame(noiseAnimLoop);
}

// ----- Composite Video -----

/**
 * Apply composite video color bleed effect
 * Converts to YCbCr, horizontally blurs chroma, converts back
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function applyCompositeFilter(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const radius = filterComposite;

  // Pre-allocate buffers (reused across rows to avoid GC pressure)
  const cb = new Float32Array(w);
  const cr = new Float32Array(w);
  const yArr = new Float32Array(w);
  const cbBlur = new Float32Array(w);
  const crBlur = new Float32Array(w);

  for (let y = 0; y < h; y++) {
    const rowStart = y * w * 4;

    for (let x = 0; x < w; x++) {
      const i = rowStart + x * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      yArr[x] = 0.299 * r + 0.587 * g + 0.114 * b;
      cb[x] = -0.169 * r - 0.331 * g + 0.500 * b + 128;
      cr[x] = 0.500 * r - 0.419 * g - 0.081 * b + 128;
    }

    boxBlurRowInPlace(cb, cbBlur, w, radius);
    boxBlurRowInPlace(cr, crBlur, w, radius);

    for (let x = 0; x < w; x++) {
      const i = rowStart + x * 4;
      const yVal = yArr[x];
      const cbVal = cbBlur[x] - 128;
      const crVal = crBlur[x] - 128;
      let rv = (yVal + 1.402 * crVal) | 0;
      let gv = (yVal - 0.344 * cbVal - 0.714 * crVal) | 0;
      let bv = (yVal + 1.772 * cbVal) | 0;
      data[i]     = rv < 0 ? 0 : rv > 255 ? 255 : rv;
      data[i + 1] = gv < 0 ? 0 : gv > 255 ? 255 : gv;
      data[i + 2] = bv < 0 ? 0 : bv > 255 ? 255 : bv;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Box blur a single row into pre-allocated output buffer
 * @param {Float32Array} arr - input
 * @param {Float32Array} out - output (must be same length)
 * @param {number} len
 * @param {number} radius
 */
function boxBlurRowInPlace(arr, out, len, radius) {
  const diam = radius * 2 + 1;
  const invDiam = 1.0 / diam;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    sum += arr[i < 0 ? 0 : i >= len ? len - 1 : i];
  }
  out[0] = sum * invDiam;
  for (let x = 1; x < len; x++) {
    const addIdx = x + radius;
    const remIdx = x - radius - 1;
    sum += arr[addIdx >= len ? len - 1 : addIdx] - arr[remIdx < 0 ? 0 : remIdx];
    out[x] = sum * invDiam;
  }
}

// ----- Phosphor Glow -----

/**
 * Draw phosphor glow effect (blurred copy of screen with screen blend)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawPhosphorGlow(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = filterGlow / 100;
  // Use CSS filter for blur — fast GPU path
  const blurRadius = Math.max(1, Math.round(filterGlow / 10));
  ctx.filter = 'blur(' + blurRadius + 'px)';
  ctx.drawImage(screenCanvas, 0, 0);
  ctx.filter = 'none';
  ctx.restore();
}

// ----- Vignette -----

/**
 * Draw vignette (dark edges) overlay
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawVignette(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const innerR = maxR * (1 - filterVignette / 100);

  const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, maxR);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.7)');

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ----- CRT Curvature -----

function invalidateCurvatureLut() {
  curvatureLutX = null;
  curvatureLutY = null;
}

/**
 * Build barrel distortion LUT
 * @param {number} w
 * @param {number} h
 * @param {number} strength
 */
function buildCurvatureLut(w, h, strength) {
  const k = strength / 100 * 0.3; // Max distortion factor
  curvatureLutX = new Float32Array(w * h);
  curvatureLutY = new Float32Array(w * h);
  curvatureLutW = w;
  curvatureLutH = h;
  curvatureLutStrength = strength;

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r2 = dx * dx + dy * dy;
      const factor = 1 + k * r2;
      curvatureLutX[y * w + x] = cx + dx * factor * maxR;
      curvatureLutY[y * w + x] = cy + dy * factor * maxR;
    }
  }
}

/**
 * Apply CRT curvature barrel distortion to screen pixels
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function applyCurvatureFilter(ctx, w, h) {
  // Rebuild LUT if needed
  if (!curvatureLutX || curvatureLutW !== w || curvatureLutH !== h || curvatureLutStrength !== filterCurvature) {
    buildCurvatureLut(w, h, filterCurvature);
  }
  if (!curvatureLutX || !curvatureLutY) return;

  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const srcData = new Uint32Array(src.data.buffer);
  const dstData = new Uint32Array(dst.data.buffer);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const sx = curvatureLutX[idx] | 0;
      const sy = curvatureLutY[idx] | 0;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        dstData[idx] = srcData[sy * w + sx];
      }
      // else: leave as 0 (transparent black) — edge void
    }
  }

  ctx.putImageData(dst, 0, 0);
}

// ========== Check if any filter is active ==========

/**
 * Returns true if any display filter is currently active
 * @returns {boolean}
 */
function hasActiveDisplayFilters() {
  return filterScanlines > 0 || filterNoise > 0 || filterComposite > 0 ||
         filterGlow > 0 || filterVignette > 0 || filterCurvature > 0 || filterSmoothing;
}
