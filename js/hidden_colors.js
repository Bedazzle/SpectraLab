// SpectraLab - Hidden (disabled) colors
// @ts-check
"use strict";

// ============================================================================
// Hidden Colors — view-only palette filter
// ============================================================================
// Alt-clicking a palette swatch "hides" that color: every pixel that would be
// painted with it renders as the transparency checkerboard on the main editing
// canvas instead. This is purely a VIEW filter — screenData, the Picture and
// every export path are untouched, so a saved picture always contains all
// colors. The small preview panel deliberately keeps showing the true image.
//
// Hiding is scoped to one namespace per palette kind, because the different
// palette UIs index colors differently:
//   'zx'      ZX color index 0-7 (hides both the normal and BRIGHT variant)
//   'ulaplus' ULA+ palette index 0-63 (0-127 for dual-palette GAP)
//   'ulanext' ULANext palette index
//   'giga'    Gigascreen virtual palette index (blended frame1/frame2 pair)
//   'nxi'     Next Layer 2 / LoRes / Radastan palette index
//   'rgb3'    RGB3 virtual color 0-7
//   'attr53c' 53c pattern color, keyed by ZX attribute byte
//
// State is session-only on purpose: a hidden color that survived a reload would
// look like data loss. Toggling the same swatch again brings the color back.
// ============================================================================

/** @typedef {'zx'|'ulaplus'|'ulanext'|'giga'|'nxi'|'rgb3'|'attr53c'} HiddenColorNs */

/** @type {Record<HiddenColorNs, Set<number>>} */
const HIDDEN_COLORS = {
  zx: new Set(),
  ulaplus: new Set(),
  ulanext: new Set(),
  giga: new Set(),
  nxi: new Set(),
  rgb3: new Set(),
  attr53c: new Set()
};

/**
 * True only while renderScreen() paints the main canvas. Every other consumer
 * of getColorsRgb() — the preview panel, the attr preview, sprite thumbnails,
 * the SCA filmstrip, import previews — runs with this false and therefore sees
 * the unfiltered image.
 * @type {boolean}
 */
let colorHidingActive = false;

/**
 * Set while rendering to an offscreen canvas for PNG/GIF export, so exported
 * images always contain every color even if some are hidden in the editor.
 * @type {boolean}
 */
let colorHidingSuppressed = false;

/** @type {number} Total hidden entries across all namespaces (fast-path guard) */
let hiddenColorCount = 0;

/**
 * Tests whether a palette entry is currently hidden from the main canvas.
 * Returns false unless the main canvas is being painted, so the same render
 * helpers can be reused by previews without filtering.
 * @param {HiddenColorNs} ns - Palette namespace
 * @param {number} index - Palette index (or attribute byte for 'attr53c')
 * @returns {boolean}
 */
function isColorHidden(ns, index) {
  if (!colorHidingActive || hiddenColorCount === 0) return false;
  const set = HIDDEN_COLORS[ns];
  return set !== undefined && set.size > 0 && set.has(index);
}

/**
 * Tests whether a namespace has any hidden entries, ignoring the render gate.
 * Used by UI code (swatch crosses, the status bar) which must reflect the
 * hidden set at all times.
 * @param {HiddenColorNs} ns
 * @param {number} index
 * @returns {boolean}
 */
function isColorHiddenRaw(ns, index) {
  const set = HIDDEN_COLORS[ns];
  return set !== undefined && set.has(index);
}

/**
 * Recomputes the total hidden count used as the per-pixel fast-path guard.
 */
function refreshHiddenColorCount() {
  let n = 0;
  for (const key in HIDDEN_COLORS) n += HIDDEN_COLORS[key].size;
  hiddenColorCount = n;
}

/**
 * Toggles one palette entry's hidden state and refreshes the canvas + UI.
 * @param {HiddenColorNs} ns - Palette namespace
 * @param {number} index - Palette index (or attribute byte for 'attr53c')
 * @returns {boolean} New hidden state
 */
function toggleHiddenColor(ns, index) {
  const set = HIDDEN_COLORS[ns];
  if (!set) return false;
  const nowHidden = !set.has(index);
  if (nowHidden) set.add(index); else set.delete(index);
  refreshHiddenColorCount();
  applyHiddenColorChange();
  return nowHidden;
}

/**
 * Clears every hidden color in every namespace.
 */
function clearHiddenColors() {
  for (const key in HIDDEN_COLORS) HIDDEN_COLORS[key].clear();
  hiddenColorCount = 0;
  applyHiddenColorChange();
}

/**
 * Re-renders the main canvas and refreshes all palette swatch crosses plus the
 * "N colors hidden" bar. Called after any change to the hidden set.
 */
function applyHiddenColorChange() {
  if (typeof updateHiddenColorUI === 'function') updateHiddenColorUI();
  if (typeof editorRender === 'function' && typeof editorActive !== 'undefined' && editorActive) {
    editorRender();
  } else if (typeof renderScreen === 'function') {
    renderScreen();
  }
}

/**
 * True when the Gigascreen virtual color formed by blending base color `c1`
 * (frame 1) with `c2` (frame 2) is hidden.
 * @param {number} c1 - Frame 1 base color index (0-15, BRIGHT adds 8)
 * @param {number} c2 - Frame 2 base color index
 * @returns {boolean}
 */
function isGigaPairHidden(c1, c2) {
  if (!colorHidingActive || HIDDEN_COLORS.giga.size === 0) return false;
  if (typeof gigascreenVirtualIndex !== 'function') return false;
  const vi = gigascreenVirtualIndex(c1, c2);
  return vi >= 0 && HIDDEN_COLORS.giga.has(vi);
}

/**
 * Builds a per-index lookup of hidden palette entries for indexed-color
 * renderers (NXI / SL2 / LoRes / Radastan), avoiding a Set lookup per pixel.
 * Returns null when nothing is hidden so callers can skip the check entirely.
 * @param {HiddenColorNs} ns - Palette namespace
 * @param {number} length - Palette entry count
 * @returns {Uint8Array|null}
 */
function buildHiddenIndexFlags(ns, length) {
  if (!colorHidingActive) return null;
  const set = HIDDEN_COLORS[ns];
  if (!set || set.size === 0) return null;
  const flags = new Uint8Array(length);
  set.forEach((i) => { if (i >= 0 && i < length) flags[i] = 1; });
  return flags;
}

/** @type {number} Packed 0xAABBGGRR (or 0xRRGGBBAA) checkerboard light square */
let checkerLight32 = 0;
/** @type {number} Packed checkerboard dark square */
let checkerDark32 = 0;
/** @type {number} Checkerboard square size the packed values were built for */
let checkerSize32 = 0;

/**
 * Transparency-checkerboard color as a packed 32-bit pixel, for renderers that
 * write through a Uint32Array view (NXI / SL2 fast path).
 * @param {number} x - Pixel X
 * @param {number} y - Pixel Y
 * @returns {number} Packed pixel in the platform's ImageData byte order
 */
function checkerColor32(x, y) {
  const size = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_CELL_SIZE) || 4;
  if (size !== checkerSize32) {
    const light = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_LIGHT_COLOR) || 68;
    const dark = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_DARK_COLOR) || 34;
    const pack = (/** @type {number} */ g) => (typeof nxiIsLE !== 'undefined' && nxiIsLE)
      ? ((0xFF000000 | (g << 16) | (g << 8) | g) >>> 0)
      : (((g << 24) | (g << 16) | (g << 8) | 0xFF) >>> 0);
    checkerLight32 = pack(light);
    checkerDark32 = pack(dark);
    checkerSize32 = size;
  }
  return ((Math.floor(x / checkerSize32) + Math.floor(y / checkerSize32)) & 1) ? checkerDark32 : checkerLight32;
}

/**
 * Resolves a pixel's RGB, substituting the transparency checkerboard when the
 * side it would use (ink or paper) is hidden.
 * @param {boolean} isInk - True when the bitmap bit selects ink
 * @param {{inkRgb: number[], paperRgb: number[], inkHidden?: boolean, paperHidden?: boolean}} colors
 * @param {number} x - Source pixel X (for the checkerboard phase)
 * @param {number} y - Source pixel Y (for the checkerboard phase)
 * @returns {number[]} RGB triple
 */
function pixelRgbHidden(isInk, colors, x, y) {
  if (isInk) {
    return colors.inkHidden ? getCheckerboardColor(x, y) : colors.inkRgb;
  }
  return colors.paperHidden ? getCheckerboardColor(x, y) : colors.paperRgb;
}
