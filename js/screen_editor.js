// SpectraLab Screen Editor v1.41.0
// Tools for editing ZX Spectrum .scr files
// Works like Art Studio / Artist 2 - simple attribute-per-cell model
// @ts-check
"use strict";

// ============================================================================
// Theme Helpers
// ============================================================================

/**
 * Read a CSS custom property from :root, with fallback.
 * @param {string} name - e.g. '--bg-primary'
 * @param {string} fallback
 * @returns {string}
 */
function getCSSVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return v ? v.trim() : fallback;
}

// ============================================================================
// Format Helpers
// ============================================================================

/**
 * Returns true if currentFormat is a gigascreen-compatible editable format
 * (standard .img gigascreen or mg8 multiartist gigascreen).
 * @returns {boolean}
 */
function isGigascreenEditable() {
  if (currentFormat === FORMAT.GIGASCREEN) return true;
  // MGH: all modes (mg1/mg2/mg4/mg8) use interleaved layout in screenData
  if (currentFormat === FORMAT.MGH && currentPicture) {
    return true;
  }
  // HLR (Gigascreen lowres): uses same gigascreen layout in screenData with fixed bitmap
  if (currentFormat === FORMAT.HLR && currentPicture) {
    return true;
  }
  // STL (Stellar): gigascreen layout with attrCellHeight=4 and fixed 0x0F bitmap
  if (currentFormat === FORMAT.STL && currentPicture) {
    return true;
  }
  // BSP gigascreen
  if (currentFormat === FORMAT.BSP && currentPicture && currentPicture.colorMode === 'gigascreen') {
    return true;
  }
  return false;
}

/**
 * Returns the attribute cell height for the current gigascreen picture.
 * mg8/.img = 8, mg4 = 4. Defaults to 8.
 * @returns {number}
 */
function getGigaAttrCellHeight() {
  return (currentPicture && currentPicture.attrCellHeight) || 8;
}

/**
 * Returns the attribute section size for one gigascreen frame.
 * mg8/.img = 768, mg4 = 1536.
 * @returns {number}
 */
function getGigaAttrSize() {
  return Math.ceil(192 / getGigaAttrCellHeight()) * 32;
}

/**
 * Returns the total size of one gigascreen frame (bitmap + attrs).
 * mg8/.img = 6912, mg4 = 7680.
 * @returns {number}
 */
function getGigaFrameSize() {
  return 6144 + getGigaAttrSize();
}

/**
 * Returns gigascreen-paste info for the current target format. Used by copy/paste
 * to mirror data into plane[1] so both frames stay consistent.
 *
 * Handles two dual-plane cases that share the same linear [bm1][at1][bm2][at2]
 * layout in screenData when attrCellHeight === 8:
 *   1. isGigascreenEditable() formats (FORMAT.GIGASCREEN / MGH / HLR) with
 *      mg8/.img frame size (6912).
 *   2. FORMAT.CHR pictures whose colorMode === 'gigascreen' — same linear
 *      layout but with variable frame size based on currentPicture dimensions.
 *
 * Returns { isGiga, frameSize }. When isGiga is false, frameSize is 0.
 * @returns {{isGiga: boolean, frameSize: number}}
 */
function getGigaPasteInfo() {
  if (isGigascreenEditable() && getGigaAttrCellHeight() === 8) {
    return { isGiga: true, frameSize: getGigaFrameSize() };
  }
  if (currentFormat === FORMAT.CHR && currentPicture &&
      currentPicture.colorMode === 'gigascreen' &&
      (currentPicture.attrCellHeight || 8) === 8) {
    const cols = currentPicture.width >> 3;
    const bitmapSize = cols * currentPicture.height;
    const attrSize = cols * Math.ceil(currentPicture.height / 8);
    return { isGiga: true, frameSize: bitmapSize + attrSize };
  }
  return { isGiga: false, frameSize: 0 };
}

/**
 * Returns the attribute row index for a given pixel Y coordinate.
 * mg8/.img = y/8, mg4 = y/4.
 * @param {number} y
 * @returns {number}
 */
function getGigaAttrRow(y) {
  return Math.floor(y / getGigaAttrCellHeight());
}

/**
 * For mg1 format, checks if a column is in the outer region (8×8 attrs).
 * Outer columns: 0-7 and 24-31. Inner columns: 8-23 (8×1 attrs).
 * @param {number} col - Character column (0-31)
 * @returns {boolean}
 */
function isMg1OuterColumn(col) {
  return getGigaAttrCellHeight() === 1 && (col < 8 || col >= 24);
}

/**
 * For mg1 outer columns, replicates an attribute value across all 8 rows in the
 * 8-pixel block containing the given Y coordinate. This ensures WYSIWYG editing
 * since mg1 outer columns are stored as 8×8 cells in the file format.
 * @param {Uint8Array} data - Screen data or attr array
 * @param {number} baseOffset - Offset to start of attr section
 * @param {number} y - Pixel Y coordinate
 * @param {number} col - Character column (0-31)
 * @param {number} attr - Attribute value to replicate
 */
function replicateMg1OuterAttr(data, baseOffset, y, col, attr) {
  const blockStart = Math.floor(y / 8) * 8;
  for (let dy = 0; dy < 8; dy++) {
    data[baseOffset + (blockStart + dy) * 32 + col] = attr;
  }
}

// ============================================================================
// Editor Constants
// ============================================================================

const EDITOR = {
  TOOL_PIXEL: 'pixel',
  TOOL_LINE: 'line',
  TOOL_RECT: 'rect',
  TOOL_CIRCLE: 'circle',
  TOOL_FLOOD_FILL: 'floodfill',
  TOOL_FILL_CELL: 'fillcell',
  TOOL_RECOLOR: 'recolor',
  TOOL_SELECT: 'select',
  TOOL_ERASER: 'eraser',
  TOOL_TEXT: 'text',
  TOOL_AIRBRUSH: 'airbrush',
  TOOL_GRADIENT: 'gradient',
  TOOL_COLOR_PICKER: 'colorpicker'
};

const GRADIENT_TYPE = {
  LINEAR: 'linear',
  RADIAL: 'radial',
  DIAMOND: 'diamond',
  CONICAL: 'conical',
  SQUARE: 'square',
  SPIRAL: 'spiral'
};

const DITHER_METHOD = {
  BAYER: 'bayer',
  NOISE: 'noise'
};

const COLOR_NAMES = ['Black', 'Blue', 'Red', 'Magenta', 'Green', 'Cyan', 'Yellow', 'White'];

// ============================================================================
// Editor State
// ============================================================================

/** @type {boolean} */
let editorActive = false;

/** @type {string} */
let currentTool = EDITOR.TOOL_PIXEL;

/** @type {number} - Transparent color constant */
const COLOR_TRANSPARENT = -1;

/** @type {number} - Transparent color for barcodes (stored in Uint8Array, so use 255) */
const BARCODE_TRANSPARENT = 255;

/** @type {number} - Current ink color (0-7, or -1 for transparent) */
let editorInkColor = parseInt(localStorage.getItem('spectraLabInkColor') || '0', 10);

/** @type {number} - Current paper color (0-7, or -1 for transparent) */
let editorPaperColor = parseInt(localStorage.getItem('spectraLabPaperColor') || '7', 10);

/** @type {boolean} */
let editorBright = false;

/** @type {boolean} */
let editorFlash = false;

/** @type {number} - Brush size (1-16) */
let brushSize = 1;

/** @type {string} - Brush shape: 'square', 'round', 'hline', 'vline', 'stroke', 'bstroke', 'custom' */
let brushShape = 'square';

/** @type {Array<{width:number, height:number, data:Uint8Array, mask?:Uint8Array}|null>} - 12 custom brush bitmaps with optional transparency mask (variable size, max 64×64) */
let customBrushes = [null, null, null, null, null, null, null, null, null, null, null, null];

/** @type {number} - Active custom brush slot (0-11), or -1 for built-in shapes, or -2 for tile brush */
let activeCustomBrush = -1;

/**
 * @typedef {Object} BrushTab
 * @property {string} name - Tab display name
 * @property {'brushset'|'tileset'} type - Tab type
 * @property {Uint8Array} [data] - Tileset data (for tileset type)
 * @property {number} [tileCount] - Number of tiles (for tileset type)
 * @property {Array<{width:number, height:number, data:Uint8Array, mask?:Uint8Array}|null>} [brushes] - Brush array (for brushset type)
 */

/** @type {Array<BrushTab>} - Array of brush/tileset tabs */
let brushTabs = [];

/** @type {number} - Active brush tab index (0=Custom, 1=ROM, 2+=user loaded) */
let activeBrushTab = 0;

/** @type {number} - Selected tile index in current tileset (-1 = none) */
let selectedTileIndex = -1;

/** @type {{width:number, height:number, data:Uint8Array}|null} - Currently active tile brush */
let activeTileBrush = null;

/** @type {boolean} - True when waiting for click(s) to capture region */
let capturingBrush = false;

/** @type {number} - Slot being captured into (0-11) */
let captureSlot = 0;

/** @type {{x:number, y:number}|null} - First corner of brush capture rectangle */
let captureStartPoint = null;

/** @type {boolean} - True when capturing tileset from screen */
let capturingTileset = false;

/** @type {{x:number, y:number}|null} - First corner of tileset capture rectangle */
let tilesetCaptureStart = null;

/** @type {string} - Custom brush paint mode: 'set', 'invert', 'replace' */
let brushPaintMode = localStorage.getItem('spectraLabBrushPaintMode') || 'replace';

/** @type {Array<{width:number, height:number, colors:Uint8Array}|null>} - 8 barcode patterns for border */
let barcodes = [null, null, null, null, null, null, null, null];

/** @type {number} - Active barcode slot (0-7), or -1 for none */
let activeBarcode = -1;

/** @type {boolean} - True when barcode mode is active for border drawing */
let barcodeMode = false;

/** @type {{x: number, y: number}|null} - Stroke origin for masked+ mode */
let maskStrokeOrigin = null;

/** @type {boolean} - Fullscreen editor mode */
let fullscreenMode = false;

/** @type {number|null} - Saved zoom level before fullscreen (restored on exit) */
let fullscreenSavedZoom = null;

/** @type {number} - Airbrush spray radius (4-32 pixels) */
let airbrushRadius = 8;

/** @type {number} - Airbrush density (0.03-1.0, probability per spray point) */
let airbrushDensity = 0.3;

/** @type {number|null} - Airbrush continuous spray interval ID */
let airbrushIntervalId = null;

/** @type {{x: number, y: number, isInk: boolean}|null} - Current airbrush position */
let airbrushCurrentPos = null;

/** @type {number} - Airbrush falloff power (1 = uniform, higher = more center-concentrated) */
let airbrushFalloff = 1;

/** @type {string} - Current gradient type */
let gradientType = GRADIENT_TYPE.LINEAR;

/** @type {string} - Current dithering method */
let ditherMethod = DITHER_METHOD.BAYER;

/** @type {boolean} - Gradient direction: false = ink to paper, true = paper to ink */
let gradientReverse = false;

// ============================================================================
// Gigascreen Editor State
// ============================================================================

/** @type {number} - Virtual ink color index into gigascreenVirtualPalette */
let gigascreenVirtualInk = 0;

/** @type {number} - Virtual paper color index into gigascreenVirtualPalette */
let gigascreenVirtualPaper = 135; // White+ + White+ (bright white solid)

/** @type {number} - Primary Gigascreen paint color for left-click (0-3): 0=ink+ink, 1=ink+paper, 2=paper+ink, 3=paper+paper */
let gigascreenPrimaryColor = 0;

/** @type {number} - Secondary Gigascreen paint color for right-click (0-3) */
let gigascreenSecondaryColor = 3;

/**
 * @typedef {Object} VirtualColor
 * @property {number} frame1Color - Color index (0-15) for frame 1 (0-7 normal, 8-15 bright)
 * @property {number} frame2Color - Color index (0-15) for frame 2
 * @property {number[]} rgb - Blended RGB values [r, g, b]
 * @property {string} name - Display name
 */

/** @type {VirtualColor[]} - Virtual palette (136 unique color blends) */
let gigascreenVirtualPalette = [];

/** @type {string[]} - Full color names for virtual palette (16 colors) */
const GIGASCREEN_COLOR_NAMES = [
  'Black', 'Blue', 'Red', 'Magenta', 'Green', 'Cyan', 'Yellow', 'White',
  'Black+', 'Blue+', 'Red+', 'Magenta+', 'Green+', 'Cyan+', 'Yellow+', 'White+'
];

/**
 * Generates the virtual palette for Gigascreen editing.
 * Creates 136 unique color blends: 16 solid + 120 blended pairs.
 * Uses current palette from screen_viewer.js.
 */
function generateGigascreenVirtualPalette() {
  gigascreenVirtualPalette = [];

  // Get RGB values for all 16 colors from current palette
  const colors = [];
  for (let i = 0; i < 8; i++) {
    colors.push(ZX_PALETTE_RGB.REGULAR[i]);
  }
  for (let i = 0; i < 8; i++) {
    colors.push(ZX_PALETTE_RGB.BRIGHT[i]);
  }

  // Generate all unique blends (including solid colors where frame1 == frame2)
  // Solid colors first (16), then blends (120) = 136 total
  for (let c1 = 0; c1 < 16; c1++) {
    for (let c2 = c1; c2 < 16; c2++) {
      const rgb1 = colors[c1];
      const rgb2 = colors[c2];
      const blendedRgb = [
        Math.round((rgb1[0] + rgb2[0]) / 2),
        Math.round((rgb1[1] + rgb2[1]) / 2),
        Math.round((rgb1[2] + rgb2[2]) / 2)
      ];

      let name;
      if (c1 === c2) {
        name = GIGASCREEN_COLOR_NAMES[c1];
      } else {
        name = GIGASCREEN_COLOR_NAMES[c1] + ' + ' + GIGASCREEN_COLOR_NAMES[c2];
      }

      gigascreenVirtualPalette.push({
        frame1Color: c1,
        frame2Color: c2,
        rgb: blendedRgb,
        name: name
      });
    }
  }
}

// ============================================================================
// 53c Pattern Color Palette
// ============================================================================

/**
 * @typedef {Object} Attr53cColor
 * @property {number} attr - ZX attribute byte (ink | paper<<3 | bright<<6)
 * @property {number[]} inkRgb - Ink RGB [r,g,b]
 * @property {number[]} paperRgb - Paper RGB [r,g,b]
 * @property {number[]} blendRgb - Blended (perceived) RGB [r,g,b]
 * @property {string} name - Display name
 */

/** @type {Attr53cColor[]} */
let attr53cVirtualPalette = [];

/** @type {number} */
let attr53cSelectedIndex = 0;

/** @type {'hue'|'rgb'|'attr'} */
let attr53cSortMode = 'hue';

/** @type {boolean} */
let attr53cSortReverse = false;

/**
 * Returns the current 53c pattern array from APP_CONFIG based on the select dropdown.
 * @returns {number[]}
 */
function getCurrent53cPatternArray() {
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('pattern53cSelect'));
  const pattern = sel ? sel.value : 'checker';
  if (pattern === 'stripes') return APP_CONFIG.PATTERN_53C_STRIPES;
  if (pattern === 'dd77') return APP_CONFIG.PATTERN_53C_DD77;
  return APP_CONFIG.PATTERN_53C_CHECKER;
}

/**
 * Converts RGB to HSL. Returns [h (0-360), s (0-1), l (0-1)].
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number[]}
 */
function rgb2hsl53c(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/**
 * Generates the virtual palette for 53c editing.
 * Deduplicates by blended (perceived) color — this gives the canonical counts:
 * Checker/Stripes (50/50) → 53, DD77 (75/25) → 127.
 * @param {number[]} patternArray - 8-byte dither pattern
 */
function generate53cVirtualPalette(patternArray) {
  // Save selected attr before clearing — index will be stale after rebuild
  const prevSelectedAttr = attr53cVirtualPalette.length > 0 && attr53cSelectedIndex < attr53cVirtualPalette.length
    ? attr53cVirtualPalette[attr53cSelectedIndex].attr : -1;

  attr53cVirtualPalette = [];

  // Compute ink ratio from pattern
  let inkBitCount = 0;
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      if (patternArray[py] & (1 << (7 - px))) inkBitCount++;
    }
  }
  const inkRatio = inkBitCount / 64;

  const seen = new Map(); // blended RGB key → index in palette array

  for (let bright = 0; bright <= 1; bright++) {
    const palette = bright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        const inkRgb = palette[ink];
        const paperRgb = palette[paper];

        // Compute blended (perceived) color
        const br = Math.round(inkRgb[0] * inkRatio + paperRgb[0] * (1 - inkRatio));
        const bg = Math.round(inkRgb[1] * inkRatio + paperRgb[1] * (1 - inkRatio));
        const bb = Math.round(inkRgb[2] * inkRatio + paperRgb[2] * (1 - inkRatio));
        const key = `${br},${bg},${bb}`;

        if (seen.has(key)) continue;

        const attr = (ink & 0x07) | ((paper & 0x07) << 3) | (bright ? 0x40 : 0);
        const brightLabel = bright ? ' Bright' : '';
        const name = ink === paper
          ? `${COLOR_NAMES[ink]}${brightLabel}`
          : `${COLOR_NAMES[ink]}/${COLOR_NAMES[paper]}${brightLabel}`;

        seen.set(key, attr53cVirtualPalette.length);
        attr53cVirtualPalette.push({
          attr, inkRgb, paperRgb, name,
          blendRgb: [br, bg, bb]
        });
      }
    }
  }

  sort53cVirtualPalette();

  // Restore selection by attr saved before rebuild
  if (prevSelectedAttr >= 0) {
    const idx = attr53cVirtualPalette.findIndex(c => c.attr === prevSelectedAttr);
    if (idx >= 0) attr53cSelectedIndex = idx;
  }
}

/**
 * Sorts attr53cVirtualPalette in place according to attr53cSortMode and attr53cSortReverse.
 * Preserves the currently selected attribute (not index) across re-sorts.
 */
function sort53cVirtualPalette() {
  // Remember selected attr so we can restore it after re-sort
  const selectedAttr = attr53cVirtualPalette.length > 0 && attr53cSelectedIndex < attr53cVirtualPalette.length
    ? attr53cVirtualPalette[attr53cSelectedIndex].attr
    : -1;

  /** @type {(a: Attr53cColor, b: Attr53cColor) => number} */
  let cmp;

  if (attr53cSortMode === 'rgb') {
    cmp = (a, b) => {
      const va = a.blendRgb[0] * 65536 + a.blendRgb[1] * 256 + a.blendRgb[2];
      const vb = b.blendRgb[0] * 65536 + b.blendRgb[1] * 256 + b.blendRgb[2];
      return va - vb;
    };
  } else if (attr53cSortMode === 'attr') {
    cmp = (a, b) => a.attr - b.attr;
  } else {
    // 'hue' — default: achromatic first by luminance, then hue bucket (30°) then luminance
    cmp = (a, b) => {
      const hslA = rgb2hsl53c(a.blendRgb[0], a.blendRgb[1], a.blendRgb[2]);
      const hslB = rgb2hsl53c(b.blendRgb[0], b.blendRgb[1], b.blendRgb[2]);

      const aGray = hslA[1] < 0.05;
      const bGray = hslB[1] < 0.05;
      if (aGray && !bGray) return -1;
      if (!aGray && bGray) return 1;
      if (aGray && bGray) return hslA[2] - hslB[2];

      const hueBucketA = Math.floor(hslA[0] / 30);
      const hueBucketB = Math.floor(hslB[0] / 30);
      if (hueBucketA !== hueBucketB) return hueBucketA - hueBucketB;
      return hslA[2] - hslB[2];
    };
  }

  const dir = attr53cSortReverse ? -1 : 1;
  attr53cVirtualPalette.sort((a, b) => cmp(a, b) * dir);

  // Restore selected index by attr value
  if (selectedAttr >= 0) {
    const newIdx = attr53cVirtualPalette.findIndex(c => c.attr === selectedAttr);
    attr53cSelectedIndex = newIdx >= 0 ? newIdx : 0;
  }

  // Clamp selected index
  if (attr53cSelectedIndex >= attr53cVirtualPalette.length) {
    attr53cSelectedIndex = 0;
  }
}

/**
 * Renders an 8x8 pattern swatch onto a canvas at 2x scale (16x16 pixels).
 * No CSS scaling — canvas size matches display size 1:1.
 * @param {HTMLCanvasElement} canvas - 16x16 canvas element
 * @param {number[]} patternArray - 8-byte dither pattern
 * @param {number[]} inkRgb - [r,g,b]
 * @param {number[]} paperRgb - [r,g,b]
 */
function render53cSwatch(canvas, patternArray, inkRgb, paperRgb) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = 2;
  const size = 8 * scale;
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;

  if (typeof attr53cBlend !== 'undefined' && attr53cBlend) {
    // Blend mode: solid averaged color
    let inkBitCount = 0;
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        if (patternArray[py] & (1 << (7 - px))) inkBitCount++;
      }
    }
    const ratio = inkBitCount / 64;
    const br = Math.round(inkRgb[0] * ratio + paperRgb[0] * (1 - ratio));
    const bg = Math.round(inkRgb[1] * ratio + paperRgb[1] * (1 - ratio));
    const bb = Math.round(inkRgb[2] * ratio + paperRgb[2] * (1 - ratio));
    for (let i = 0; i < size * size; i++) {
      const off = i * 4;
      d[off] = br;
      d[off + 1] = bg;
      d[off + 2] = bb;
      d[off + 3] = 255;
    }
  } else {
    // Pattern mode: original checkerboard swatch
    for (let y = 0; y < 8; y++) {
      const patByte = patternArray[y];
      for (let x = 0; x < 8; x++) {
        const isInk = (patByte & (1 << (7 - x))) !== 0;
        const rgb = isInk ? inkRgb : paperRgb;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const off = ((y * scale + sy) * size + (x * scale + sx)) * 4;
            d[off] = rgb[0];
            d[off + 1] = rgb[1];
            d[off + 2] = rgb[2];
            d[off + 3] = 255;
          }
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Builds the 53c pattern color palette grid in the DOM.
 */
function build53cPalette() {
  const container = document.getElementById('attr53cPaletteGrid');
  if (!container) return;

  const patternArray = getCurrent53cPatternArray();
  generate53cVirtualPalette(patternArray);

  container.innerHTML = '';

  attr53cVirtualPalette.forEach((vc, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.className = 'attr53c-palette-cell';
    canvas.title = vc.name;
    canvas.dataset.index = String(index);

    render53cSwatch(canvas, patternArray, vc.inkRgb, vc.paperRgb);

    canvas.addEventListener('click', (e) => {
      e.preventDefault();
      attr53cSelectedIndex = index;
      update53cPaletteSelection();
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    container.appendChild(canvas);
  });

  update53cPaletteSelection();
}

/**
 * Updates the selection marker in the 53c palette grid.
 */
function update53cPaletteSelection() {
  const container = document.getElementById('attr53cPaletteGrid');
  if (!container) return;

  const cells = container.querySelectorAll('.attr53c-palette-cell');
  cells.forEach((cell, index) => {
    cell.classList.toggle('selected', index === attr53cSelectedIndex);
  });
}

/**
 * Toggles the 53c pattern color picker visibility.
 * @param {boolean} show
 */
function toggle53cColorPicker(show) {
  const section = document.getElementById('attr53cColorSection');
  if (section) section.style.display = show ? '' : 'none';
  if (show) {
    const s = document.getElementById('editorColorSection');
    const g = document.getElementById('gigascreenColorSection');
    const r = document.getElementById('rgb3ColorSection');
    if (s) s.style.display = 'none';
    if (g) g.style.display = 'none';
    if (r) r.style.display = 'none';
  }
}

/**
 * Updates editor color pickers to match current format.
 * Call after format conversions or undo/redo that changes format.
 */
function updateEditorColorPickers() {
  if (!editorActive) return;
  const isNext = currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD;
  toggle53cColorPicker(currentFormat === FORMAT.ATTR_53C);
  toggleGigascreenColorPicker(isGigascreenEditable());
  toggleRgb3ColorPicker(currentFormat === FORMAT.RGB3);
  toggleNxiColorPicker(isNext);
  // Restore standard palette when no specialized section is active
  if (currentFormat !== FORMAT.ATTR_53C && !isGigascreenEditable() && currentFormat !== FORMAT.RGB3 && !isNext) {
    const s = document.getElementById('editorColorSection');
    if (s) s.style.display = '';
  }
  if (currentFormat === FORMAT.ATTR_53C) build53cPalette();
  if (isGigascreenEditable()) {
    generateGigascreenVirtualPalette();
    updateGigascreenColorPickerUI();
  }
  if (currentFormat === FORMAT.RGB3) buildRgb3Palette();
  if (isNext) buildNxiPalette();
}

/**
 * Toggle NXI/SL2 color picker visibility.
 * Hides standard editor color section and bright/flash controls when active.
 * @param {boolean} show
 */
function toggleNxiColorPicker(show) {
  const nxiSection = document.getElementById('nxiColorSection');
  if (nxiSection) nxiSection.style.display = show ? '' : 'none';
  if (show) {
    const s = document.getElementById('editorColorSection');
    if (s) s.style.display = 'none';
    const bright = document.getElementById('editorBrightCheckbox');
    if (bright && bright.parentElement) bright.parentElement.style.display = 'none';
    const flash = document.getElementById('editorFlashCheckbox');
    if (flash && flash.parentElement) flash.parentElement.style.display = 'none';
  }
  // SL2 has no embedded palette — hide load button
  const nxiLoadBtn = document.getElementById('nxiLoadPalBtn');
  if (nxiLoadBtn) {
    nxiLoadBtn.style.display = (show && currentFormat === FORMAT.SL2) ? 'none' : '';
  }
}

/**
 * Build the 16×16 NXI/SL2 palette grid from nxiResolvedPalette.
 */
function buildNxiPalette() {
  const grid = document.getElementById('nxiPaletteGrid');
  if (!grid || !nxiResolvedPalette) return;
  grid.innerHTML = '';
  const palCount = (nxiLayer2Mode === '640x256' || currentFormat === FORMAT.LORES_RAD) ? 16 : 256;
  for (let i = 0; i < palCount; i++) {
    const cell = document.createElement('div');
    cell.className = 'nxi-palette-cell';
    const rgb = nxiResolvedPalette[i];
    cell.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    cell.dataset.index = String(i);
    cell.title = `#${i} (${rgb[0]},${rgb[1]},${rgb[2]})`;
    cell.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 0) {
        editorInkColor = i;
      } else if (e.button === 2) {
        editorPaperColor = i;
      }
      updateNxiPaletteHighlight();
      updateColorPreview();
    });
    cell.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.appendChild(cell);
  }
  updateNxiPaletteHighlight();
}

/**
 * Update CSS classes on NXI palette cells to highlight ink/paper selection.
 */
function updateNxiPaletteHighlight() {
  const grid = document.getElementById('nxiPaletteGrid');
  if (!grid) return;
  const cells = grid.querySelectorAll('.nxi-palette-cell');
  cells.forEach((cell) => {
    const idx = parseInt(/** @type {HTMLElement} */ (cell).dataset.index || '0', 10);
    cell.classList.toggle('ink-selected', idx === editorInkColor);
    cell.classList.toggle('paper-selected', idx === editorPaperColor);
  });
  // Update preview swatches and index display
  if (nxiResolvedPalette) {
    const inkPreview = document.getElementById('nxiInkPreview');
    const paperPreview = document.getElementById('nxiPaperPreview');
    const indexSpan = document.getElementById('nxiColorIndex');
    if (inkPreview) {
      const c = nxiResolvedPalette[editorInkColor] || [0,0,0];
      inkPreview.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    if (paperPreview) {
      const c = nxiResolvedPalette[editorPaperColor] || [0,0,0];
      paperPreview.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    if (indexSpan) {
      indexSpan.textContent = `I:${editorInkColor} P:${editorPaperColor}`;
    }
  }
}

/**
 * Gets the 4 available cell colors based on current virtual ink/paper selection.
 * @returns {{rgb: number[], name: string, frame1Set: boolean, frame2Set: boolean}[]} Array of 4 color options
 */
function getGigascreen4Colors() {
  if (gigascreenVirtualPalette.length === 0) {
    generateGigascreenVirtualPalette();
  }

  const inkEntry = gigascreenVirtualPalette[gigascreenVirtualInk];
  const paperEntry = gigascreenVirtualPalette[gigascreenVirtualPaper];

  // Get the frame colors
  const ink1 = inkEntry.frame1Color;    // Frame 1 ink (0-15)
  const ink2 = inkEntry.frame2Color;    // Frame 2 ink (0-15)
  const paper1 = paperEntry.frame1Color; // Frame 1 paper (0-15)
  const paper2 = paperEntry.frame2Color; // Frame 2 paper (0-15)

  // Get RGB values for all colors
  const getColorRgb = (colorIdx) => {
    if (colorIdx < 8) return ZX_PALETTE_RGB.REGULAR[colorIdx];
    return ZX_PALETTE_RGB.BRIGHT[colorIdx - 8];
  };

  const ink1Rgb = getColorRgb(ink1);
  const ink2Rgb = getColorRgb(ink2);
  const paper1Rgb = getColorRgb(paper1);
  const paper2Rgb = getColorRgb(paper2);

  // Calculate the 4 blended colors
  const blend = (rgb1, rgb2) => [
    Math.round((rgb1[0] + rgb2[0]) / 2),
    Math.round((rgb1[1] + rgb2[1]) / 2),
    Math.round((rgb1[2] + rgb2[2]) / 2)
  ];

  return [
    { rgb: blend(ink1Rgb, ink2Rgb), name: 'Ink+Ink', frame1Set: true, frame2Set: true },
    { rgb: blend(ink1Rgb, paper2Rgb), name: 'Ink+Paper', frame1Set: true, frame2Set: false },
    { rgb: blend(paper1Rgb, ink2Rgb), name: 'Paper+Ink', frame1Set: false, frame2Set: true },
    { rgb: blend(paper1Rgb, paper2Rgb), name: 'Paper+Paper', frame1Set: false, frame2Set: false }
  ];
}

/**
 * Gets Gigascreen virtual ink/paper colors for the specified frame
 * @param {number} frame - Frame index (0 or 1)
 * @returns {{inkColor: number, paperColor: number, bright: boolean}} Colors for the frame (0-7) and bright flag
 */
function getGigascreenFrameColors(frame) {
  if (gigascreenVirtualPalette.length === 0) {
    generateGigascreenVirtualPalette();
  }

  const inkEntry = gigascreenVirtualPalette[gigascreenVirtualInk];
  const paperEntry = gigascreenVirtualPalette[gigascreenVirtualPaper];

  // Get the appropriate color for this frame
  const inkFull = frame === 0 ? inkEntry.frame1Color : inkEntry.frame2Color;
  const paperFull = frame === 0 ? paperEntry.frame1Color : paperEntry.frame2Color;

  // Extract color (0-7) and brightness
  const inkColor = inkFull % 8;
  const paperColor = paperFull % 8;

  // If either ink or paper is bright, the cell is bright
  const bright = inkFull >= 8 || paperFull >= 8;

  return { inkColor, paperColor, bright };
}

/**
 * Sets a pixel in Gigascreen format (both frames simultaneously)
 * @param {Uint8Array} data - Screen data
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {boolean} isInk - true = ink pixel, false = paper pixel
 */
function setGigascreenPixel(data, x, y, isInk) {
  if (!data || data.length < getGigaFrameSize() * 2) return;

  // HLR (Gigascreen Lowres): bitmap is fixed; drawing only updates the relevant
  // half of the cell attribute (top 4 rows = ink portion, bottom 4 rows = paper
  // portion of both attribute frames).
  if (currentFormat === FORMAT.HLR) {
    setHlrHalfCellColor(data, x, y, isInk);
    return;
  }

  // STL (Stellar): bitmap is fixed 0x0F; drawing only updates attributes
  // with multicolor cell height (4 rows).
  if (currentFormat === FORMAT.STL) {
    setStlCellColor(data, x, y, isInk);
    return;
  }

  const bitmapAddr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);
  const width = SCREEN.WIDTH;

  // Frame 1 colors and attribute
  const frame1 = getGigascreenFrameColors(0);
  const attr1 = buildAttribute(frame1.inkColor, frame1.paperColor, frame1.bright, false);

  // Frame 2 colors and attribute
  const frame2 = getGigascreenFrameColors(1);
  const attr2 = buildAttribute(frame2.inkColor, frame2.paperColor, frame2.bright, false);

  // Calculate attribute address (8×8 or 8×4 cells)
  const charRow = getGigaAttrRow(y);
  const charCol = Math.floor(x / 8);
  const attrOffset = charRow * 32 + charCol;

  // Determine frame bit states based on selected color (0-3)
  // Left click uses primary color, right click uses secondary color
  const colorIdx = isInk ? gigascreenPrimaryColor : gigascreenSecondaryColor;
  const colors = getGigascreen4Colors();
  const activeColorInfo = colors[colorIdx];

  // When layers are enabled and on non-background layer, modify layer bitmaps
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer && layer.bitmap && layer.bitmap2) {
      const maskIdx = y * width + x;

      // Frame 1 bitmap
      if (activeColorInfo.frame1Set) {
        layer.bitmap[bitmapAddr] |= (1 << bit);
      } else {
        layer.bitmap[bitmapAddr] &= ~(1 << bit);
      }

      // Frame 2 bitmap
      if (activeColorInfo.frame2Set) {
        layer.bitmap2[bitmapAddr] |= (1 << bit);
      } else {
        layer.bitmap2[bitmapAddr] &= ~(1 << bit);
      }

      // Mark pixel as visible
      layer.mask[maskIdx] = 1;

      // Update layer attributes for this cell
      if (layer.attributes) {
        if (isMg1OuterColumn(charCol)) {
          const blockStart = Math.floor(y / 8) * 8;
          for (let dy = 0; dy < 8; dy++) {
            layer.attributes[(blockStart + dy) * 32 + charCol] = attr1;
          }
        } else {
          layer.attributes[attrOffset] = attr1;
        }
      }
      if (layer.attributesFrame2) {
        if (isMg1OuterColumn(charCol)) {
          const blockStart = Math.floor(y / 8) * 8;
          for (let dy = 0; dy < 8; dy++) {
            layer.attributesFrame2[(blockStart + dy) * 32 + charCol] = attr2;
          }
        } else {
          layer.attributesFrame2[attrOffset] = attr2;
        }
      }
    }
    return;
  }

  // Background layer or no layers - modify screenData directly
  const gigaFS = getGigaFrameSize();
  // Frame 1: bitmap at 0-6143, attributes at 6144+
  if (activeColorInfo.frame1Set) {
    data[bitmapAddr] |= (1 << bit);
  } else {
    data[bitmapAddr] &= ~(1 << bit);
  }
  if (isMg1OuterColumn(charCol)) {
    replicateMg1OuterAttr(data, 6144, y, charCol, attr1);
  } else {
    data[6144 + attrOffset] = attr1;
  }

  // Frame 2: bitmap at gigaFS+, attributes at gigaFS+6144+
  if (activeColorInfo.frame2Set) {
    data[gigaFS + bitmapAddr] |= (1 << bit);
  } else {
    data[gigaFS + bitmapAddr] &= ~(1 << bit);
  }
  if (isMg1OuterColumn(charCol)) {
    replicateMg1OuterAttr(data, gigaFS + 6144, y, charCol, attr2);
  } else {
    data[gigaFS + 6144 + attrOffset] = attr2;
  }

  // Also update background layer if layers are enabled
  if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
    const layer = layers[0];
    if (layer) {
      if (layer.bitmap) {
        if (activeColorInfo.frame1Set) {
          layer.bitmap[bitmapAddr] |= (1 << bit);
        } else {
          layer.bitmap[bitmapAddr] &= ~(1 << bit);
        }
      }
      if (layer.bitmap2) {
        if (activeColorInfo.frame2Set) {
          layer.bitmap2[bitmapAddr] |= (1 << bit);
        } else {
          layer.bitmap2[bitmapAddr] &= ~(1 << bit);
        }
      }
      if (layer.attributes) {
        layer.attributes[attrOffset] = attr1;
      }
      if (layer.attributesFrame2) {
        layer.attributesFrame2[attrOffset] = attr2;
      }
    }
  }
}

/**
 * Named preset fill patterns for HLR pictures. Each entry is 8 bytes, one per
 * scanline within an 8x8 character cell. Bit 7 is the leftmost pixel of the
 * cell, bit 0 the rightmost. A 1-bit marks a pixel that shows the cell's ink
 * color; a 0-bit marks a paper pixel.
 * @type {Object<string, number[]>}
 */
const HLR_PATTERN_PRESETS = {
  'top-bottom': [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00],
  'left-right': [0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0],
  'checker1':   [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55],
  'checker2':   [0xCC, 0xCC, 0x33, 0x33, 0xCC, 0xCC, 0x33, 0x33],
  'hstripe1':   [0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00],
  'vstripe1':   [0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA],
  'hstripe2':   [0xFF, 0xFF, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00],
  'vstripe2':   [0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC],
  'diag-dr':    [0x80, 0xC0, 0xE0, 0xF0, 0xF8, 0xFC, 0xFE, 0xFF],
  'diag-ur':    [0xFF, 0x7F, 0x3F, 0x1F, 0x0F, 0x07, 0x03, 0x01]
};

/**
 * Converts an 8-byte pattern to a whitespace-separated hex string.
 * @param {Uint8Array|number[]} bytes
 * @returns {string} e.g. "FF FF FF FF 00 00 00 00"
 */
function hlrPatternToHex(bytes) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const b = (bytes && bytes[i] != null) ? (bytes[i] & 0xFF) : 0;
    parts.push(b.toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

/**
 * Parses an 8-byte hex pattern from a string. Accepts whitespace, commas, and
 * 0x/# prefixes. Returns null if the string does not contain exactly 8 bytes.
 * @param {string} text
 * @returns {Uint8Array|null}
 */
function hlrPatternFromHex(text) {
  if (typeof text !== 'string') return null;
  const tokens = text.replace(/0x/gi, '').replace(/#/g, '').split(/[\s,]+/).filter(Boolean);
  if (tokens.length !== 8) return null;
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(tokens[i])) return null;
    out[i] = parseInt(tokens[i], 16) & 0xFF;
  }
  return out;
}

/**
 * Identifies which preset (if any) matches the given 8-byte pattern.
 * @param {Uint8Array|number[]} bytes
 * @returns {string} preset key, or 'custom' if no exact match
 */
function hlrPatternToPresetKey(bytes) {
  if (!bytes || bytes.length !== 8) return 'custom';
  for (const key of Object.keys(HLR_PATTERN_PRESETS)) {
    const preset = HLR_PATTERN_PRESETS[key];
    let match = true;
    for (let i = 0; i < 8; i++) {
      if ((bytes[i] & 0xFF) !== (preset[i] & 0xFF)) { match = false; break; }
    }
    if (match) return key;
  }
  return 'custom';
}

/**
 * Returns a new Uint8Array(8) containing the bytes for a preset key, or null
 * if the key is unknown or 'custom'.
 * @param {string} key
 * @returns {Uint8Array|null}
 */
function hlrPatternFromPresetKey(key) {
  const preset = HLR_PATTERN_PRESETS[key];
  if (!preset) return null;
  return new Uint8Array(preset);
}

/**
 * Renders an 8-byte HLR fill pattern into a canvas as a 32x32 preview (tiled
 * Renders a single 8x8 cell scaled to fill the canvas. White pixels mark ink,
 * black pixels mark paper.
 * @param {HTMLCanvasElement|null} canvas
 * @param {Uint8Array|number[]|null} bytes
 */
function renderHlrPatternPreview(canvas, bytes) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const pat = (bytes && bytes.length === 8) ? bytes : HLR_PATTERN_PRESETS['top-bottom'];
  // Scale a single 8x8 cell to fill the canvas (no tiling).
  for (let y = 0; y < h; y++) {
    const py = Math.min(7, (y * 8 / h) | 0);
    const row = pat[py] & 0xFF;
    for (let x = 0; x < w; x++) {
      const px = Math.min(7, (x * 8 / w) | 0);
      const ink = ((row >> (7 - px)) & 1) === 1;
      const v = ink ? 255 : 0;
      const idx = (y * w + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Returns the HLR fill-pattern byte for a given scanline within an 8x8 char.
 * Reads from currentPicture.pattern (8 bytes); falls back to the standard
 * pattern (top 4 rows ink, bottom 4 rows paper) if no pattern is stored.
 * @param {number} rowInChar - 0-7
 * @returns {number} Pattern byte (0x00-0xFF)
 */
function getHlrFillPatternByte(rowInChar) {
  const r = rowInChar & 7;
  if (currentPicture && currentPicture.pattern && currentPicture.pattern.length === 8) {
    return currentPicture.pattern[r];
  }
  return r < 4 ? 0xFF : 0x00;
}

/**
 * Returns true if the pixel at (x, y) shows the cell's INK color, false if
 * it shows the PAPER color, based on the HLR fill pattern bit at (x%8, y%8).
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function isHlrPixelInk(x, y) {
  const patternByte = getHlrFillPatternByte(y & 7);
  return ((patternByte >> (7 - (x & 7))) & 1) === 1;
}

/**
 * Replaces the fill pattern of the current HLR picture. Saves undo state,
 * updates the pattern on currentPicture, rebuilds both frames' bitmaps in
 * screenData and in the plane bitmaps, and re-renders the canvas.
 * Attribute banks are left untouched — only which pixels in each cell show
 * ink vs paper changes.
 * @param {Uint8Array|number[]} newPattern - 8 bytes, one per scanline
 */
function applyHlrPatternChange(newPattern) {
  if (currentFormat !== FORMAT.HLR) return;
  if (!newPattern || newPattern.length !== 8) return;
  if (!screenData || screenData.length < getGigaFrameSize() * 2) return;

  // Capture current state for undo (includes the old pattern)
  saveUndoState();

  const pattern = new Uint8Array(newPattern);
  if (currentPicture) currentPicture.pattern = new Uint8Array(pattern);

  // Rewrite both frames' bitmaps in screenData (interleaved SCR layout).
  // Each third is 2048 bytes; within a third, rows are interleaved so that
  // pixelLine (the scanline within an 8-px char) advances by 256 bytes and
  // charRow advances by 32 bytes.
  const gigaFS = getGigaFrameSize();
  for (let third = 0; third < 3; third++) {
    const thirdBase = third * 2048;
    for (let pixelLine = 0; pixelLine < 8; pixelLine++) {
      const fill = pattern[pixelLine] & 0xFF;
      for (let charRow = 0; charRow < 8; charRow++) {
        const rowOff = thirdBase + charRow * 32 + pixelLine * 256;
        for (let col = 0; col < 32; col++) {
          screenData[rowOff + col] = fill;
          screenData[gigaFS + rowOff + col] = fill;
        }
      }
    }
  }

  // Rewrite plane bitmaps (linear row-major, 32 bytes per row).
  if (currentPicture && currentPicture.planes) {
    for (let p = 0; p < currentPicture.planes.length; p++) {
      const bm = currentPicture.planes[p] && currentPicture.planes[p].bitmap;
      if (!bm) continue;
      for (let y = 0; y < 192; y++) {
        const fill = pattern[y & 7] & 0xFF;
        const rowOff = y * 32;
        for (let col = 0; col < 32; col++) {
          bm[rowOff + col] = fill;
        }
      }
    }
  }

  markPictureModified();
  if (typeof editorRender === 'function') editorRender();
}

/**
 * HLR (Gigascreen Lowres): updates one or both components (ink/paper) of
 * both attribute frames at the given pixel coordinate.
 *
 * Which component is updated depends on the HLR fill pattern: where the
 * pattern bit at (x%8, y%8) is 1 the pixel shows the cell's ink color, where
 * it is 0 the pixel shows the cell's paper color, so drawing targets the
 * matching attribute nibble. With the standard pattern (top 4 rows ink,
 * bottom 4 rows paper) this matches the original "half cell" semantics.
 *
 * The HLR bitmap is loader-tiled from the 8-byte pattern, so drawing never
 * touches bitmap bytes -- only the two attribute banks change.
 *
 * @param {Uint8Array} data - Screen data (interleaved gigascreen layout)
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @param {boolean} isInk - true = use virtual ink color, false = use virtual paper color
 * @param {boolean} [solid=false] - If true, set BOTH ink and paper of the cell to the chosen color
 */
function setHlrHalfCellColor(data, x, y, isInk, solid) {
  if (x < 0 || x >= 256 || y < 0 || y >= 192) return;

  const charCol = Math.floor(x / 8);
  const charRow = Math.floor(y / 8);
  const attrOffset = charRow * 32 + charCol;
  const isInkComponent = solid ? null : isHlrPixelInk(x, y);

  // Resolve virtual color via the 4-color picker selection. For HLR only
  // indices 0 (Ink+Ink → virtual ink) and 3 (Paper+Paper → virtual paper)
  // are physically displayable. Indices 1 and 2 (mixed) snap to nearest.
  if (gigascreenVirtualPalette.length === 0) {
    generateGigascreenVirtualPalette();
  }
  const cellColorIdx = isInk ? gigascreenPrimaryColor : gigascreenSecondaryColor;
  const usePaperEntry = cellColorIdx >= 2;
  const entry = usePaperEntry
    ? gigascreenVirtualPalette[gigascreenVirtualPaper]
    : gigascreenVirtualPalette[gigascreenVirtualInk];
  if (!entry) return;

  const f1Full = entry.frame1Color; // 0-15 (includes bright bit)
  const f2Full = entry.frame2Color;
  const f1 = f1Full & 7;
  const f2 = f2Full & 7;
  const bright = (f1Full >= 8) || (f2Full >= 8);
  const brightBit = bright ? 0x40 : 0;

  /**
   * Composes a new attribute byte by replacing the relevant component(s)
   * (ink only, paper only, or both) of an existing attribute and applying
   * the bright bit. The flash bit (0x80) is preserved from the existing.
   * @param {number} existing - Current attribute byte
   * @param {number} colorBits - 3-bit color (0-7)
   * @returns {number}
   */
  const composeAttr = (existing, colorBits) => {
    const flash = existing & 0x80;
    const cb = colorBits & 7;
    if (isInkComponent === null) {
      // Solid mode: set both ink and paper to the same color
      return cb | (cb << 3) | brightBit | flash;
    }
    if (isInkComponent) {
      const paper = existing & 0x38; // bits 3-5 (paper)
      return cb | paper | brightBit | flash;
    }
    const ink = existing & 0x07; // bits 0-2 (ink)
    return ink | (cb << 3) | brightBit | flash;
  };

  const gigaFS = getGigaFrameSize();
  const attrAddr1 = 6144 + attrOffset;
  const attrAddr2 = gigaFS + 6144 + attrOffset;

  // Layer mode (non-background): write to layer attributes only
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      const maskIdx = y * 256 + x;
      if (layer.mask) layer.mask[maskIdx] = 1;
      if (layer.attributes) {
        layer.attributes[attrOffset] = composeAttr(layer.attributes[attrOffset] || 0, f1);
      }
      if (layer.attributesFrame2) {
        layer.attributesFrame2[attrOffset] = composeAttr(layer.attributesFrame2[attrOffset] || 0, f2);
      }
    }
    return;
  }

  // Background layer or no layers: modify screenData directly
  data[attrAddr1] = composeAttr(data[attrAddr1], f1);
  data[attrAddr2] = composeAttr(data[attrAddr2], f2);

  // Mirror to background layer if layers enabled
  if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
    const layer = layers[0];
    if (layer) {
      if (layer.attributes) {
        layer.attributes[attrOffset] = data[attrAddr1];
      }
      if (layer.attributesFrame2) {
        layer.attributesFrame2[attrOffset] = data[attrAddr2];
      }
    }
  }
}

// ============================================================================
// STL (Stellar) Helpers
// ============================================================================

/**
 * Returns true if the pixel at (x, y) shows the cell's INK color in STL format.
 * STL uses fixed bitmap 0x0F: left 4 pixels = paper, right 4 pixels = ink.
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function isStlPixelInk(x, y) {
  return (x & 7) >= 4;
}

/**
 * STL (Stellar): updates one or both components (ink/paper) of both attribute
 * frames at the given pixel coordinate. Uses multicolor cell height (4 rows)
 * via getGigaAttrRow() and the fixed 0x0F pattern: left 4 pixels = paper,
 * right 4 pixels = ink.
 *
 * @param {Uint8Array} data - Screen data (interleaved gigascreen layout)
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @param {boolean} isInk - true = use virtual ink color, false = use virtual paper color
 * @param {boolean} [solid=false] - If true, set BOTH ink and paper of the cell to the chosen color
 */
function setStlCellColor(data, x, y, isInk, solid) {
  if (x < 0 || x >= 256 || y < 0 || y >= 192) return;

  const charCol = Math.floor(x / 8);
  const charRow = getGigaAttrRow(y);
  const attrOffset = charRow * 32 + charCol;
  const isInkComponent = solid ? null : isStlPixelInk(x, y);

  if (gigascreenVirtualPalette.length === 0) {
    generateGigascreenVirtualPalette();
  }
  const cellColorIdx = isInk ? gigascreenPrimaryColor : gigascreenSecondaryColor;
  const usePaperEntry = cellColorIdx >= 2;
  const entry = usePaperEntry
    ? gigascreenVirtualPalette[gigascreenVirtualPaper]
    : gigascreenVirtualPalette[gigascreenVirtualInk];
  if (!entry) return;

  const f1Full = entry.frame1Color;
  const f2Full = entry.frame2Color;
  const f1 = f1Full & 7;
  const f2 = f2Full & 7;
  const bright = (f1Full >= 8) || (f2Full >= 8);
  const brightBit = bright ? 0x40 : 0;

  const composeAttr = (existing, colorBits) => {
    const flash = existing & 0x80;
    const cb = colorBits & 7;
    if (isInkComponent === null) {
      return cb | (cb << 3) | brightBit | flash;
    }
    if (isInkComponent) {
      const paper = existing & 0x38;
      return cb | paper | brightBit | flash;
    }
    const ink = existing & 0x07;
    return ink | (cb << 3) | brightBit | flash;
  };

  const gigaFS = getGigaFrameSize();
  const attrAddr1 = 6144 + attrOffset;
  const attrAddr2 = gigaFS + 6144 + attrOffset;

  // Layer mode (non-background): write to layer attributes only
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      const maskIdx = y * 256 + x;
      if (layer.mask) layer.mask[maskIdx] = 1;
      if (layer.attributes) {
        layer.attributes[attrOffset] = composeAttr(layer.attributes[attrOffset] || 0, f1);
      }
      if (layer.attributesFrame2) {
        layer.attributesFrame2[attrOffset] = composeAttr(layer.attributesFrame2[attrOffset] || 0, f2);
      }
    }
    return;
  }

  // Background layer or no layers: modify screenData directly
  data[attrAddr1] = composeAttr(data[attrAddr1], f1);
  data[attrAddr2] = composeAttr(data[attrAddr2], f2);

  // Mirror to background layer if layers enabled
  if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
    const layer = layers[0];
    if (layer) {
      if (layer.attributes) {
        layer.attributes[attrOffset] = data[attrAddr1];
      }
      if (layer.attributesFrame2) {
        layer.attributesFrame2[attrOffset] = data[attrAddr2];
      }
    }
  }
}

// ============================================================================
// PNG/GIF Export
// ============================================================================

/**
 * Returns true if current format is a gigascreen-family format (two alternating frames).
 * @returns {boolean}
 */
function isGigascreenExportFormat() {
  if (currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH ||
      currentFormat === FORMAT.HLR || currentFormat === FORMAT.STL) return true;
  if (currentFormat === FORMAT.BSP && currentPicture && currentPicture.colorMode === 'gigascreen') return true;
  if (currentFormat === FORMAT.CHR && currentPicture && currentPicture.colorMode === 'gigascreen') return true;
  return false;
}

/**
 * Show the export image dialog. For gigascreen formats shows mode selector,
 * for all formats shows computed output dimensions using current view settings.
 */
function showExportImageDialog() {
  const dialog = document.getElementById('exportImageDialog');
  if (!dialog) return;

  const isGiga = isGigascreenExportFormat();
  const hasFlash = !isGiga && typeof hasFlashingAttributes === 'function' && hasFlashingAttributes();

  // Show/hide gigascreen row
  const gigaRow = document.getElementById('exportImageGigaRow');
  if (gigaRow) gigaRow.style.display = isGiga ? '' : 'none';

  // Show/hide flash row (only for non-gigascreen formats with flash attributes)
  const flashRow = document.getElementById('exportImageFlashRow');
  if (flashRow) flashRow.style.display = hasFlash ? '' : 'none';

  updateExportImageDims();
  dialog.style.display = '';
}

/**
 * Update the displayed output dimensions in the export dialog.
 * Uses current view settings (zoom, borderSize) directly.
 */
function updateExportImageDims() {
  const info = document.getElementById('exportImageDimsInfo');
  if (!info) return;

  const isBscLike = currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border);

  let w, h;
  if (isBscLike) {
    w = BSC.FRAME_WIDTH * zoom;
    h = BSC.FRAME_HEIGHT * zoom;
  } else {
    const dims = getFormatDimensions(currentFormat);
    const picW = currentPicture ? currentPicture.width : dims.width;
    const picH = currentPicture ? currentPicture.height : dims.height;
    const scaleY = getPixelScaleY();
    const borderPixels = borderSize * zoom;
    w = picW * zoom + borderPixels * 2;
    h = picH * scaleY * zoom + borderPixels * 2;
  }

  const gigaModeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('exportImageGigaMode'));
  const isFlickerGif = isGigascreenExportFormat() && gigaModeSel && gigaModeSel.value === 'flicker';

  const flashModeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('exportImageFlashMode'));
  const isFlashGif = !isGigascreenExportFormat() &&
    typeof hasFlashingAttributes === 'function' && hasFlashingAttributes() &&
    flashModeSel && flashModeSel.value === 'animated';

  const isAnimated = isFlickerGif || isFlashGif;
  info.textContent = w + ' \u00D7 ' + h + (isAnimated ? ' (animated GIF)' : ' (PNG)');
}

/**
 * Render current screen to an offscreen canvas for export.
 * Uses all current view settings (zoom, border, grid, palette, filters).
 * Only overrides: screenCanvas (offscreen), showReference (off), flashPhase,
 * and gigascreen mode when rendering individual flicker frames.
 * @param {number} [gigaFrameIndex] - For gigascreen flicker: 0 or 1; undefined = use current mode
 * @param {boolean} [flashPhaseOverride] - Flash phase to use (false = normal, true = swapped); default false
 * @returns {HTMLCanvasElement} - The rendered offscreen canvas
 */
function renderToExportCanvas(gigaFrameIndex, flashPhaseOverride) {
  // Save globals that we must override
  const savedScreenCanvas = screenCanvas;
  const savedScreenCanvasCtx = screenCanvasCtx;
  const savedShowReference = showReference;
  const savedFlashPhase = flashPhase;
  const savedFlashEnabled = flashEnabled;
  const savedGigascreenMode = gigascreenMode;
  const savedGigascreenFlickerPhase = gigascreenFlickerPhase;
  const savedGigascreenFlickerFrameId = gigascreenFlickerFrameId;
  const savedLastCanvasWidth = lastCanvasWidth;
  const savedLastCanvasHeight = lastCanvasHeight;

  // Create temp canvas
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // Swap canvas to offscreen; keep all view settings (zoom, border, grid, filters, palette)
  screenCanvas = tempCanvas;
  screenCanvasCtx = tempCtx;
  showReference = false;
  flashPhase = flashPhaseOverride || false;
  if (flashPhaseOverride) flashEnabled = true; // Ensure flash renders even if disabled in View

  // Configure gigascreen mode for this render
  if (gigaFrameIndex !== undefined) {
    gigascreenMode = GIGASCREEN_MODE.FLICKER;
    gigascreenFlickerPhase = gigaFrameIndex;
    gigascreenFlickerFrameId = -1; // Non-null so flicker path is taken
  }

  // For non-BSC formats, pre-size the temp canvas
  const isBscLike = currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border);
  if (!isBscLike) {
    const dims = getFormatDimensions(currentFormat);
    const picW = currentPicture ? currentPicture.width : dims.width;
    const picH = currentPicture ? currentPicture.height : dims.height;
    const scaleY = getPixelScaleY();
    const borderPixels = borderSize * zoom;
    tempCanvas.width = picW * zoom + borderPixels * 2;
    tempCanvas.height = picH * scaleY * zoom + borderPixels * 2;
  }

  // Render
  renderScreen();

  // Restore overridden globals
  screenCanvas = savedScreenCanvas;
  screenCanvasCtx = savedScreenCanvasCtx;
  showReference = savedShowReference;
  flashPhase = savedFlashPhase;
  flashEnabled = savedFlashEnabled;
  gigascreenMode = savedGigascreenMode;
  gigascreenFlickerPhase = savedGigascreenFlickerPhase;
  gigascreenFlickerFrameId = savedGigascreenFlickerFrameId;
  lastCanvasWidth = savedLastCanvasWidth;
  lastCanvasHeight = savedLastCanvasHeight;

  return tempCanvas;
}

/**
 * Export current screen to PNG or animated GIF file.
 * Uses current view settings; only gigascreen mode is chosen via dialog.
 */
async function exportImageToFile() {
  const baseName = currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'screen';
  const isGiga = isGigascreenExportFormat();
  const gigaModeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('exportImageGigaMode'));
  const wantFlicker = isGiga && gigaModeSel && gigaModeSel.value === 'flicker';

  const flashModeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('exportImageFlashMode'));
  const wantFlashGif = !isGiga &&
    typeof hasFlashingAttributes === 'function' && hasFlashingAttributes() &&
    flashModeSel && flashModeSel.value === 'animated';

  if (wantFlicker) {
    // GIF path: two frames alternating at ~50fps (gigascreen)
    const canvas0 = renderToExportCanvas(0);
    const canvas1 = renderToExportCanvas(1);
    const w = canvas0.width;
    const h = canvas0.height;
    const ctx0 = canvas0.getContext('2d');
    const ctx1 = canvas1.getContext('2d');
    if (!ctx0 || !ctx1) return;
    const frame0 = ctx0.getImageData(0, 0, w, h);
    const frame1 = ctx1.getImageData(0, 0, w, h);

    const gif = new GifEncoder(w, h);
    gif.addFrame(frame0.data, 2); // 2 centiseconds = 20ms ≈ 50fps
    gif.addFrame(frame1.data, 2);
    const gifData = gif.finish();

    downloadFile(new Blob([gifData], { type: 'image/gif' }), baseName + '.gif');
  } else if (wantFlashGif) {
    // GIF path: two frames for flash animation (normal + swapped phase)
    const flashDelay = Math.round((typeof FLASH_INTERVAL !== 'undefined' ? FLASH_INTERVAL : 320) / 10);
    const canvas0 = renderToExportCanvas(undefined, false);
    const canvas1 = renderToExportCanvas(undefined, true);
    const w = canvas0.width;
    const h = canvas0.height;
    const ctx0 = canvas0.getContext('2d');
    const ctx1 = canvas1.getContext('2d');
    if (!ctx0 || !ctx1) return;
    const frame0 = ctx0.getImageData(0, 0, w, h);
    const frame1 = ctx1.getImageData(0, 0, w, h);

    const gif = new GifEncoder(w, h);
    gif.addFrame(frame0.data, flashDelay);
    gif.addFrame(frame1.data, flashDelay);
    const gifData = gif.finish();

    downloadFile(new Blob([gifData], { type: 'image/gif' }), baseName + '.gif');
  } else {
    // PNG path (standard or blended gigascreen)
    const canvas = renderToExportCanvas();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      downloadFile(blob, baseName + '.png');
    }
  }

  // Close dialog
  const dialog = document.getElementById('exportImageDialog');
  if (dialog) dialog.style.display = 'none';

  // Restore display
  renderScreen();
}

// ============================================================================
// Text Tool State
// ============================================================================

/** @type {string} - Current text to render */
let textToolInput = '';

/** @type {string} - Font type: 'spectrum' or 'ttf' */
let textFontType = 'spectrum';

/** @type {Uint8Array} - Current .768 Spectrum font data (768 bytes) */
let textFont768Data = new Uint8Array(768);

/** @type {string} - Current .768 font name */
let textFont768Name = 'ROM';

/** @type {string} - Current TTF font family */
let textFontTTF = 'Arial';

/** @type {number} - TTF font size in pixels */
let textFontSize = 8;

/** @type {boolean} - Whether text tool is in placement mode */
let isPlacingText = false;

/** @type {{x: number, y: number}|null} - Text preview position */
let textPreviewPos = null;

/** @type {Array<{name: string, data: Uint8Array}>} - Loaded .768 fonts */
let loaded768Fonts = [];

/** @type {Array<string>} - Loaded TTF font names */
let loadedTTFFonts = [];

/** @type {{x: number, y: number}|null} - Start point for line/rect */
let toolStartPoint = null;

/** @type {boolean} */
let isDrawing = false;

/** @type {{x: number, y: number}|null} */
let lastDrawnPixel = null;

// Deferred stroke for big pictures (>512px in either dimension).
// Mouse path is collected during drawing, smooth curve drawn on mouse-up.
/** @type {{x: number, y: number}[]|null} */
let deferredStrokePath = null;
/** @type {boolean} */
let deferredStrokeIsInk = true;
/** @type {number|null} */
let deferredStrokeTool = null;

/** @type {number|null} - Pending render frame ID for throttling */
let pendingRenderFrame = null;

/**
 * Schedules a throttled render using requestAnimationFrame.
 * Multiple calls before the next frame will only result in one render.
 * Skips preview rendering for performance during continuous drawing.
 */
function scheduleRender() {
  if (pendingRenderFrame === null) {
    pendingRenderFrame = requestAnimationFrame(() => {
      pendingRenderFrame = null;
      // Flatten layers before render for real-time visual feedback on non-background layers
      if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
        flattenLayersToScreen();
      }
      editorRender(true); // Skip preview during continuous drawing
    });
  }
}

/** @type {Uint8Array[]} - Undo stack (multi-level) */
let undoStack = [];

/** @type {Uint8Array[]} - Redo stack */
let redoStack = [];

/** @type {number} - Maximum undo levels */
const MAX_UNDO_LEVELS = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.MAX_UNDO_LEVELS) || 32;

/** @type {HTMLImageElement|null} - Reference image for tracing */
let referenceImage = null;

/** @type {boolean} - Show reference image overlay */
let showReference = true;

/** @type {number} - Reference image opacity (0-1) */
let referenceOpacity = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.REFERENCE_DEFAULT_OPACITY) || 0.3;

/** @type {number} - Reference image X offset in pixels */
let referenceOffsetX = 0;

/** @type {number} - Reference image Y offset in pixels */
let referenceOffsetY = 0;

/** @type {number|null} - Reference image custom width (null = auto from format) */
let referenceWidth = null;

/** @type {number|null} - Reference image custom height (null = auto from format) */
let referenceHeight = null;

// ============================================================================
// Layer System
// ============================================================================

/**
 * @typedef {Object} Layer
 * @property {string} name - Layer name
 * @property {Uint8Array} bitmap - Bitmap data (same size as format requires)
 * @property {Uint8Array} mask - Transparency mask (1=visible, 0=transparent)
 * @property {boolean} visible - Layer visibility
 * @property {Uint8Array} [attributes] - Attribute data (size varies by format: 768/3072/6144 bytes)
 * @property {Uint8Array} [attributes2] - Second attribute bank (BMC4 only, 768 bytes for lines 4-7)
 * @property {Uint8Array} [borderData] - Border color data (for BSC/BMC4 formats)
 * @property {Uint8Array} [borderMask] - Border transparency mask (for BSC/BMC4 formats)
 * @property {Uint8Array} [bitmap2] - Second frame bitmap (Gigascreen only)
 * @property {Uint8Array} [attributesFrame2] - Second frame attributes (Gigascreen only)
 */

/** @type {Layer[]} - Array of layers (index 0 = background) */
let layers = [];

/** @type {number} - Currently active layer index */
let activeLayerIndex = 0;

/** @type {boolean} - Whether layer system is enabled (for formats that support it) */
let layersEnabled = false;

/** @type {boolean} - When true, flattenLayersToScreen() is deferred (for bulk pixel operations) */
let batchFlattenDeferred = false;

/** @type {Uint8Array|null} - Transparency mask for flattened result (1=has content, 0=transparent) */
let screenTransparencyMask = null;

/** @type {Uint8Array|null} - Border transparency mask for BSC/BMC4 (1=has content, 0=transparent), 2 slots per byte */
let borderTransparencyMask = null;

// ============================================================================
// SPECSCII Editor State
// ============================================================================

/** @type {Uint8Array|null} - SPECSCII character grid (768 = 32×24, codes 0x20-0x8F) */
let specsciiCharGrid = null;

/** @type {Uint8Array|null} - SPECSCII attribute grid (768 = 32×24, ink|paper<<3|bright<<6|flash<<7) */
let specsciiAttrGrid = null;

/** @type {Uint8Array|null} - SPECSCII mask grid (768 = 32×24, 1=user-placed content, 0=empty/transparent) */
let specsciiMask = null;

/** @type {number} - Currently selected SPECSCII character for drawing (0x20-0x8F) */
let specsciiSelectedChar = 0x20;

/** @type {number} - Preview zoom level */
let previewZoom = 1;

/** @type {boolean} - Preview panel visibility */
let previewVisible = true;

/** @type {HTMLCanvasElement|null} */
let previewCanvas = null;

/** @type {CanvasRenderingContext2D|null} - Cached screen canvas 2D context */
let screenCtx = null;

// ============================================================================
// Cached DOM Element Collections
// ============================================================================

/** @type {NodeListOf<Element>|null} */
let editorToolButtons = null;

/** @type {NodeListOf<Element>|null} */
let editorShapeButtons = null;

/** @type {NodeListOf<Element>|null} */
let customBrushSlots = null;

// ============================================================================
// Reusable Temporary Canvas (for preview rendering)
// ============================================================================

/** @type {HTMLCanvasElement|null} - Reusable temp canvas for preview */
let tempPreviewCanvas = null;

/** @type {CanvasRenderingContext2D|null} - Reusable temp canvas context */
let tempPreviewCtx = null;

/**
 * Get or create the reusable temp canvas for preview rendering
 * @param {number} width - Required width
 * @param {number} height - Required height
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}|null}
 */
function getTempPreviewCanvas(width, height) {
  if (!tempPreviewCanvas) {
    tempPreviewCanvas = document.createElement('canvas');
    tempPreviewCtx = tempPreviewCanvas.getContext('2d');
  }
  // Resize only if needed
  if (tempPreviewCanvas.width !== width || tempPreviewCanvas.height !== height) {
    tempPreviewCanvas.width = width;
    tempPreviewCanvas.height = height;
  }
  if (!tempPreviewCtx) return null;
  return { canvas: tempPreviewCanvas, ctx: tempPreviewCtx };
}

// ============================================================================
// Selection / Clipboard State
// ============================================================================

/** @type {{x:number, y:number}|null} - First corner of selection */
let selectionStartPoint = null;

/** @type {{x:number, y:number}|null} - Second corner of selection */
let selectionEndPoint = null;

/** @type {boolean} - Dragging to define selection */
let isSelecting = false;

/** @type {string} - Snap mode: 'grid', 'grid-center', 'subgrid', 'subgrid-center', 'zero', 'brush', 'off' */
let snapMode = localStorage.getItem('spectraLabSnapMode') || 'grid-center';

/** @type {{x:number, y:number}|null} - Origin for 'brush' snap mode (set on first paste) */
let brushSnapOrigin = null;

/** @type {boolean} - Transform tab selection mode active */
let transformSelectActive = false;

/** @type {boolean} - Grid snapping for transform selection */
let transformSnapToGrid = true;

/** @type {{left:number, top:number, right:number, bottom:number}|null} - Current transform selection rect */
let transformSelectionRect = null;

/**
 * Whether selection corners should snap to 8x8 cell boundaries.
 * Any snap mode (grid/zero/brush) implies selection snapping. Always true for .53c.
 * @returns {boolean}
 */
function isSnapActive() {
  return snapMode !== 'off' || currentFormat === FORMAT.ATTR_53C || currentFormat === FORMAT.SPECSCII;
}

/**
 * Gets the width of the current format in pixels
 * @returns {number}
 */
function getFormatWidth() {
  if (currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD) return LORES.WIDTH;
  if ((currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) && nxiLayer2Mode === '320x256') return 320;
  if ((currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) && nxiLayer2Mode === '640x256') return 640;
  if (currentPicture) return currentPicture.width;
  return 256;
}

/**
 * Gets the height of the current format in pixels
 * @returns {number}
 */
function getFormatHeight() {
  if (currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD) return LORES.HEIGHT;
  if ((currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) && nxiLayer2Mode !== '256x192') return 256;
  if (currentPicture) return currentPicture.height;
  if (currentFormat === FORMAT.MONO_1_3) return 64;
  if (currentFormat === FORMAT.MONO_2_3) return 128;
  return 192;
}

/**
 * Snaps a paste position according to the current snap mode.
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 */
function snapPastePosition(x, y) {
  const effectiveMode = (currentFormat === FORMAT.ATTR_53C || currentFormat === FORMAT.SPECSCII) ? 'grid' : snapMode;

  if (effectiveMode === 'grid') {
    return { x: Math.floor(x / 8) * 8, y: Math.floor(y / 8) * 8 };
  }

  if (effectiveMode === 'zero' && clipboardData) {
    const w = clipboardData.format === 'scr' ? clipboardData.width : clipboardData.cellCols * 8;
    const h = clipboardData.format === 'scr' ? clipboardData.height : clipboardData.cellRows * 8;
    return { x: Math.floor(x / w) * w, y: Math.floor(y / h) * h };
  }

  if (effectiveMode === 'brush' && clipboardData) {
    const w = clipboardData.format === 'scr' ? clipboardData.width : clipboardData.cellCols * 8;
    const h = clipboardData.format === 'scr' ? clipboardData.height : clipboardData.cellRows * 8;
    if (brushSnapOrigin) {
      const ox = brushSnapOrigin.x % w;
      const oy = brushSnapOrigin.y % h;
      return {
        x: Math.floor((x - ox) / w) * w + ox,
        y: Math.floor((y - oy) / h) * h + oy
      };
    }
    // No origin yet — first paste will set it, no snap for now
    return { x, y };
  }

  // 'off'
  return { x, y };
}

/**
 * Snaps draw coordinates when snap is active.
 * Grid mode: snaps to 8x8 cells.
 * Zero/Brush modes with custom brush: snaps to brush dimensions.
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 */
function snapDrawCoords(x, y) {
  if (!isSnapActive()) return { x, y };

  const brush = getActiveBrush();
  const hasBrush = brush !== null;

  if (snapMode === 'grid' || (!hasBrush && snapMode !== 'subgrid' && snapMode !== 'subgrid-center' && snapMode !== 'grid-center')) {
    // Use gridSize from View tab (default 8)
    const gs = (typeof gridSize !== 'undefined' && gridSize > 0) ? gridSize : 8;
    return { x: Math.floor(x / gs) * gs, y: Math.floor(y / gs) * gs };
  }

  if (snapMode === 'grid-center') {
    // Snap to grid cell centers (brush center aligns with grid cell center)
    const gs = (typeof gridSize !== 'undefined' && gridSize > 0) ? gridSize : 8;
    const halfGs = Math.floor(gs / 2);
    return { x: Math.floor(x / gs) * gs + halfGs, y: Math.floor(y / gs) * gs + halfGs };
  }

  if (snapMode === 'subgrid') {
    // Use subgridSize from View tab (default 4 if not set)
    const sgs = (typeof subgridSize !== 'undefined' && subgridSize > 0) ? subgridSize : 4;
    return { x: Math.floor(x / sgs) * sgs, y: Math.floor(y / sgs) * sgs };
  }

  if (snapMode === 'subgrid-center') {
    // Snap to subgrid cell centers
    const sgs = (typeof subgridSize !== 'undefined' && subgridSize > 0) ? subgridSize : 4;
    const halfSgs = Math.floor(sgs / 2);
    return { x: Math.floor(x / sgs) * sgs + halfSgs, y: Math.floor(y / sgs) * sgs + halfSgs };
  }

  const bw = brush.width;
  const bh = brush.height;

  if (snapMode === 'zero') {
    return { x: Math.floor(x / bw) * bw, y: Math.floor(y / bh) * bh };
  }

  if (snapMode === 'brush') {
    if (brushSnapOrigin) {
      const ox = brushSnapOrigin.x % bw;
      const oy = brushSnapOrigin.y % bh;
      return {
        x: Math.floor((x - ox) / bw) * bw + ox,
        y: Math.floor((y - oy) / bh) * bh + oy
      };
    }
    // No origin yet — snap to brush-sized grid from zero
    return { x: Math.floor(x / bw) * bw, y: Math.floor(y / bh) * bh };
  }

  return { x, y };
}

/** @type {{format:string, width?:number, height?:number, cellCols:number, cellRows:number, bitmap?:Uint8Array, attrs:Uint8Array}|null} */
let clipboardData = null;

/** @type {boolean} - Paste preview mode active */
let isPasting = false;

/** @type {{x:number, y:number}} - Current cursor position during paste */
let pasteCursorPos = { x: 0, y: 0 };

/** @type {boolean} - Brush preview cursor mode active */
let brushPreviewMode = false;

/** @type {{x:number, y:number}|null} - Current cursor position for brush preview (main screen) */
let brushPreviewPos = null;

/** @type {{frameX:number, frameY:number}|null} - Current cursor position for border brush preview */
let borderPreviewPos = null;

// ============================================================================
// Multi-Picture Management
// ============================================================================

/**
 * @typedef {{
 *   id: number,
 *   fileName: string,
 *   format: string,
 *   screenData: Uint8Array,
 *   undoStack: Uint8Array[],
 *   redoStack: Uint8Array[],
 *   layers: Layer[],
 *   activeLayerIndex: number,
 *   layersEnabled: boolean,
 *   modified: boolean,
 *   zoom: number,
 *   inkColor: number,
 *   paperColor: number,
 *   bright: boolean,
 *   flash: boolean,
 *   currentTool: string,
 *   brushSize: number,
 *   brushShape: string,
 *   scrollTop: number,
 *   scrollLeft: number,
 *   ulaPlusPalette: Uint8Array|null,
 *   nxiResolvedPalette: number[][]|null,
 *   picture: Picture|null|undefined
 * }} PictureState
 */

/** @type {PictureState[]} - Array of open pictures */
let openPictures = [];

/** @type {number} - Index of currently active picture (-1 if none) */
let activePictureIndex = -1;

/** @type {number} - Next unique ID for new pictures */
let nextPictureId = 1;

/** @type {number} - Maximum number of pictures that can be open */
const MAX_PICTURES = 15;

/**
 * Deep clones a layer array including all Uint8Array data
 * @param {Layer[]} layerArray - Array of layers to clone
 * @returns {Layer[]} Cloned array
 */
function deepCloneLayers(layerArray) {
  return layerArray.map(layer => {
    /** @type {Layer} */
    const cloned = {
      name: layer.name,
      bitmap: layer.bitmap.slice(),
      mask: layer.mask.slice(),
      visible: layer.visible
    };
    if (layer.attributes) {
      cloned.attributes = layer.attributes.slice();
    }
    if (layer.attributes2) {
      cloned.attributes2 = layer.attributes2.slice();
    }
    if (layer.borderData) {
      cloned.borderData = layer.borderData.slice();
    }
    if (layer.borderMask) {
      cloned.borderMask = layer.borderMask.slice();
    }
    // Gigascreen: clone frame 2 data
    if (layer.bitmap2) {
      cloned.bitmap2 = layer.bitmap2.slice();
    }
    if (layer.attributesFrame2) {
      cloned.attributesFrame2 = layer.attributesFrame2.slice();
    }
    return cloned;
  });
}

/**
 * Saves the current picture state to the openPictures array.
 * Call this before switching to a different picture.
 */
function saveCurrentPictureState() {
  if (activePictureIndex < 0 || activePictureIndex >= openPictures.length) return;

  // Don't save SCA animation data over a picture
  if (currentFormat === FORMAT.SCA) return;

  const pic = openPictures[activePictureIndex];
  pic.screenData = screenData.slice();
  // Clone undo/redo stacks (each entry is {screenData, layers, activeLayerIndex, specsciiCharGrid?, specsciiAttrGrid?, specsciiMask?})
  pic.undoStack = undoStack.map(s => {
    const clone = { screenData: s.screenData.slice(), layers: deepCloneLayers(s.layers), activeLayerIndex: s.activeLayerIndex };
    if (s.specsciiCharGrid) clone.specsciiCharGrid = new Uint8Array(s.specsciiCharGrid);
    if (s.specsciiAttrGrid) clone.specsciiAttrGrid = new Uint8Array(s.specsciiAttrGrid);
    if (s.specsciiMask) clone.specsciiMask = new Uint8Array(s.specsciiMask);
    return clone;
  });
  pic.redoStack = redoStack.map(s => {
    const clone = { screenData: s.screenData.slice(), layers: deepCloneLayers(s.layers), activeLayerIndex: s.activeLayerIndex };
    if (s.specsciiCharGrid) clone.specsciiCharGrid = new Uint8Array(s.specsciiCharGrid);
    if (s.specsciiAttrGrid) clone.specsciiAttrGrid = new Uint8Array(s.specsciiAttrGrid);
    if (s.specsciiMask) clone.specsciiMask = new Uint8Array(s.specsciiMask);
    return clone;
  });
  pic.layers = deepCloneLayers(layers);
  pic.activeLayerIndex = activeLayerIndex;
  pic.layersEnabled = layersEnabled;
  pic.fileName = currentFileName;
  pic.format = currentFormat;
  // Save zoom level (zoom is defined in screen_viewer.js)
  if (typeof zoom !== 'undefined') {
    pic.zoom = zoom;
  }
  // Save editor colors and tool settings
  pic.inkColor = editorInkColor;
  pic.paperColor = editorPaperColor;
  pic.bright = editorBright;
  pic.flash = editorFlash;
  pic.currentTool = currentTool;
  pic.brushSize = brushSize;
  pic.brushShape = brushShape;
  // Save canvas scroll position
  const container = document.getElementById('canvasContainer');
  if (container) {
    pic.scrollTop = container.scrollTop;
    pic.scrollLeft = container.scrollLeft;
  }
  // Save ULA+ palette if active
  pic.ulaPlusPalette = ulaPlusPalette ? ulaPlusPalette.slice() : null;
  // Save ULANext state if active
  pic.ulaNextMode = isUlaNextMode;
  pic.ulaNextInkMask = ulaNextInkMask;
  pic.ulaNextInkBits = ulaNextInkBits;
  pic.ulaNextInkCount = ulaNextInkCount;
  pic.ulaNextPaperCount = ulaNextPaperCount;
  pic.ulaNextIs9bit = ulaNextIs9bit;
  pic.ulaNextPalette = ulaNextPalette ? ulaNextPalette.map(c => [...c]) : null;
  // Save NXI/SL2 palette and Layer 2 mode if present
  pic.nxiResolvedPalette = nxiResolvedPalette ? nxiResolvedPalette.map(c => [...c]) : null;
  pic.nxiLayer2Mode = nxiLayer2Mode;
  // Save internal picture format (deep clone to avoid shared references)
  pic.picture = clonePicture(currentPicture);
  // Save SPECSCII grids if active
  pic.specsciiCharGrid = specsciiCharGrid ? new Uint8Array(specsciiCharGrid) : null;
  pic.specsciiAttrGrid = specsciiAttrGrid ? new Uint8Array(specsciiAttrGrid) : null;
  pic.specsciiMask = specsciiMask ? new Uint8Array(specsciiMask) : null;
}

/**
 * Loads picture state from the openPictures array at the given index.
 * @param {number} index - Index of picture to load
 */
function loadPictureState(index) {
  if (index < 0 || index >= openPictures.length) return;

  const pic = openPictures[index];
  screenData = pic.screenData.slice();
  currentFileName = pic.fileName;
  currentFormat = pic.format;
  // Clone undo/redo stacks (each entry is {screenData, layers, activeLayerIndex, specsciiCharGrid?, specsciiAttrGrid?, specsciiMask?})
  undoStack = pic.undoStack.map(s => {
    const clone = { screenData: s.screenData.slice(), layers: deepCloneLayers(s.layers), activeLayerIndex: s.activeLayerIndex };
    if (s.specsciiCharGrid) clone.specsciiCharGrid = new Uint8Array(s.specsciiCharGrid);
    if (s.specsciiAttrGrid) clone.specsciiAttrGrid = new Uint8Array(s.specsciiAttrGrid);
    if (s.specsciiMask) clone.specsciiMask = new Uint8Array(s.specsciiMask);
    return clone;
  });
  redoStack = pic.redoStack.map(s => {
    const clone = { screenData: s.screenData.slice(), layers: deepCloneLayers(s.layers), activeLayerIndex: s.activeLayerIndex };
    if (s.specsciiCharGrid) clone.specsciiCharGrid = new Uint8Array(s.specsciiCharGrid);
    if (s.specsciiAttrGrid) clone.specsciiAttrGrid = new Uint8Array(s.specsciiAttrGrid);
    if (s.specsciiMask) clone.specsciiMask = new Uint8Array(s.specsciiMask);
    return clone;
  });
  layers = deepCloneLayers(pic.layers);
  activeLayerIndex = pic.activeLayerIndex;
  layersEnabled = pic.layersEnabled;
  activePictureIndex = index;

  // Restore zoom level
  if (typeof pic.zoom !== 'undefined' && typeof zoom !== 'undefined') {
    zoom = pic.zoom;
    // Update zoom dropdown UI
    const zoomSelect = document.getElementById('zoomSelect');
    if (zoomSelect) {
      /** @type {HTMLSelectElement} */ (zoomSelect).value = String(zoom);
    }
  }

  // Restore editor colors and tool settings
  if (typeof pic.inkColor !== 'undefined') {
    editorInkColor = pic.inkColor;
    editorPaperColor = pic.paperColor;
    editorBright = pic.bright;
    editorFlash = pic.flash;

    // Update color UI
    updateColorSelectors();

    // Restore tool (update UI state without rendering — caller will render)
    // Hide sections of the previous tool first
    showTextToolSection(false);
    showAirbrushSection(false);
    showGradientSection(false);
    currentTool = pic.currentTool;
    (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
      btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.tool === currentTool);
    });
    // Show section for the restored tool
    if (currentTool === EDITOR.TOOL_TEXT) showTextToolSection(true);
    else if (currentTool === EDITOR.TOOL_AIRBRUSH) showAirbrushSection(true);
    else if (currentTool === EDITOR.TOOL_GRADIENT) showGradientSection(true);

    // Update brush UI using existing functions
    setBrushSize(pic.brushSize);
    setBrushShape(pic.brushShape);
  }

  // Restore canvas scroll position (defer to allow canvas resize)
  if (typeof pic.scrollTop !== 'undefined') {
    setTimeout(() => {
      const container = document.getElementById('canvasContainer');
      if (container) {
        container.scrollTop = pic.scrollTop;
        container.scrollLeft = pic.scrollLeft;
      }
    }, 0);
  }

  // Restore ULA+ palette
  if (pic.ulaPlusPalette) {
    ulaPlusPalette = pic.ulaPlusPalette.slice();
    isUlaPlusMode = true;
    resetUlaPlusColors();
  } else {
    ulaPlusPalette = null;
    isUlaPlusMode = false;
  }

  // Restore ULANext state
  if (pic.ulaNextMode && pic.ulaNextPalette) {
    isUlaNextMode = true;
    ulaNextInkMask = pic.ulaNextInkMask;
    ulaNextInkBits = pic.ulaNextInkBits;
    ulaNextInkCount = pic.ulaNextInkCount;
    ulaNextPaperCount = pic.ulaNextPaperCount;
    ulaNextIs9bit = pic.ulaNextIs9bit || false;
    ulaNextPalette = pic.ulaNextPalette.map(c => [...c]);
  } else {
    resetUlaNextMode();
  }

  // Restore NXI/SL2 palette and Layer 2 mode
  if (pic.nxiResolvedPalette) {
    nxiResolvedPalette = pic.nxiResolvedPalette.map(c => [...c]);
  } else {
    nxiResolvedPalette = null;
  }
  nxiLayer2Mode = pic.nxiLayer2Mode || '256x192';

  // Restore internal picture format (deep clone to avoid shared references)
  currentPicture = clonePicture(pic.picture);

  // Restore SPECSCII grids
  if (pic.specsciiCharGrid) {
    specsciiCharGrid = new Uint8Array(pic.specsciiCharGrid);
    specsciiAttrGrid = pic.specsciiAttrGrid ? new Uint8Array(pic.specsciiAttrGrid) : null;
    specsciiMask = pic.specsciiMask ? new Uint8Array(pic.specsciiMask) : null;
  } else {
    specsciiCharGrid = null;
    specsciiAttrGrid = null;
    specsciiMask = null;
  }
}

/**
 * Marks the current picture as modified.
 * Called when any change is made to the picture.
 */
function markPictureModified() {
  if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
    openPictures[activePictureIndex].modified = true;
    updatePictureTabBar();
  }
}

/**
 * Adds a new picture to the open pictures array.
 * @param {string} fileName - File name
 * @param {string} format - File format
 * @param {Uint8Array} data - Screen data
 * @param {Picture|null} [internalPicture=null] - Internal picture format (pass here instead of setting currentPicture before calling)
 * @returns {number} Index of the new picture
 */
function addPicture(fileName, format, data, internalPicture, skipSave) {
  if (openPictures.length >= MAX_PICTURES) {
    alert('Maximum ' + MAX_PICTURES + ' pictures. Close one to open another.');
    return -1;
  }

  // Save current picture state before adding new one
  // (caller may have already saved before clobbering globals like ULA+ palette)
  if (!skipSave) {
    saveCurrentPictureState();
  }

  // Now set currentPicture to the new picture (after old state is saved)
  currentPicture = internalPicture || null;

  // Inherit current zoom, or use default if no pictures open yet
  const inheritedZoom = (typeof zoom !== 'undefined' && zoom > 0) ? zoom :
    ((typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_ZOOM) || 2);

  /** @type {PictureState} */
  const newPicture = {
    id: nextPictureId++,
    fileName: fileName,
    format: format,
    screenData: data.slice(),
    undoStack: [],
    redoStack: [],
    layers: [],
    activeLayerIndex: 0,
    layersEnabled: false,
    modified: false,
    zoom: inheritedZoom,
    // Use current editor settings (not hardcoded defaults)
    inkColor: editorInkColor,
    paperColor: editorPaperColor,
    bright: editorBright,
    flash: editorFlash,
    currentTool: currentTool,
    brushSize: brushSize,
    brushShape: brushShape,
    scrollTop: 0,
    scrollLeft: 0,
    ulaPlusPalette: ulaPlusPalette ? ulaPlusPalette.slice() : null,
    ulaNextMode: isUlaNextMode,
    ulaNextInkMask: ulaNextInkMask,
    ulaNextInkBits: ulaNextInkBits,
    ulaNextInkCount: ulaNextInkCount,
    ulaNextPaperCount: ulaNextPaperCount,
    ulaNextIs9bit: ulaNextIs9bit,
    ulaNextPalette: ulaNextPalette ? ulaNextPalette.map(c => [...c]) : null,
    nxiResolvedPalette: nxiResolvedPalette ? nxiResolvedPalette.map(c => [...c]) : null,
    nxiLayer2Mode: nxiLayer2Mode,
    // Internal picture format (deep clone to avoid shared references)
    picture: clonePicture(currentPicture),
    // Grids will be parsed from screenData when editor is activated
    specsciiCharGrid: null,
    specsciiAttrGrid: null,
    specsciiMask: null
  };

  openPictures.push(newPicture);
  const newIndex = openPictures.length - 1;

  // Switch to the new picture (skip save — already done above)
  switchToPicture(newIndex, true);

  return newIndex;
}

/**
 * Closes a picture at the given index.
 * @param {number} index - Index of picture to close
 * @returns {boolean} True if picture was closed
 */
function closePicture(index) {
  if (index < 0 || index >= openPictures.length) return false;

  const pic = openPictures[index];

  // Confirm if modified
  if (pic.modified) {
    if (!confirm('Picture "' + pic.fileName + '" has unsaved changes. Close anyway?')) {
      return false;
    }
  }

  // Remove the picture
  openPictures.splice(index, 1);

  // Handle active picture index after removal
  if (openPictures.length === 0) {
    // No more pictures - reset to empty state
    activePictureIndex = -1;
    screenData = new Uint8Array(0);
    currentFileName = '';
    currentFormat = FORMAT.UNKNOWN;
    currentPicture = null;
    undoStack = [];
    redoStack = [];
    layers = [];
    activeLayerIndex = 0;
    layersEnabled = false;
    specsciiCharGrid = null;
    specsciiAttrGrid = null;
    specsciiMask = null;
    renderScreen();
    updateFileInfo();
  } else {
    // Adjust active index if needed
    if (activePictureIndex >= openPictures.length) {
      activePictureIndex = openPictures.length - 1;
    } else if (activePictureIndex > index) {
      activePictureIndex--;
    } else if (activePictureIndex === index) {
      // Was viewing the closed picture - load adjacent
      if (activePictureIndex >= openPictures.length) {
        activePictureIndex = openPictures.length - 1;
      }
    }

    // Load the new active picture
    loadPictureState(activePictureIndex);
    renderScreen();
    updateFileInfo();

    // Update UI components
    if (typeof updateConvertOptions === 'function') {
      updateConvertOptions();
    }
    if (typeof toggleLayerSectionVisibility === 'function') {
      toggleLayerSectionVisibility();
    }
    if (typeof updateLayerPanel === 'function') {
      updateLayerPanel();
    }
    if (typeof updateEditorState === 'function') {
      updateEditorState();
    }
    if (editorActive && typeof renderPreview === 'function') {
      renderPreview();
    }
  }

  updatePictureTabBar();
  return true;
}

/**
 * Switches to a different picture.
 * @param {number} index - Index of picture to switch to
 */
function switchToPicture(index, skipSave) {
  if (index < 0 || index >= openPictures.length) return;
  if (index === activePictureIndex) return;

  // Stop SCA animation if switching from SCA to a picture
  if (typeof resetScaState === 'function') {
    resetScaState();
  }

  // Save current state (skip when caller already saved, e.g. addPicture)
  if (!skipSave) {
    saveCurrentPictureState();
  }

  // Load new picture
  loadPictureState(index);

  // SPECSCII: parse stream into grids/layers before first render
  // so the grid-based multi-layer XOR renderer can be used immediately
  if (currentFormat === FORMAT.SPECSCII && !specsciiCharGrid && screenData) {
    specsciiStreamToGrids();
  }

  // Update UI
  renderScreen();
  updateFileInfo();
  updatePictureTabBar();

  // Update format-specific controls
  if (typeof toggleScaControlsVisibility === 'function') {
    toggleScaControlsVisibility();
  }
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }

  // Update layer panel
  if (typeof toggleLayerSectionVisibility === 'function') {
    toggleLayerSectionVisibility();
  }
  if (typeof updateLayerPanel === 'function') {
    updateLayerPanel();
  }
  // Update editor state (handles convert options, gigascreen picker, preview, export button)
  if (typeof updateEditorState === 'function') {
    updateEditorState();
  }

  // Reset selection and paste states (without triggering another render)
  selectionStartPoint = null;
  selectionEndPoint = null;
  isSelecting = false;
  isPasting = false;
  brushSnapOrigin = null;
}

/**
 * Updates the picture tab bar UI.
 * Shows the tab bar only when 2+ pictures are open.
 */
function updatePictureTabBar() {
  const tabBar = document.getElementById('pictureTabBar');
  const tabList = document.getElementById('pictureTabList');

  if (!tabBar || !tabList) return;

  // Show tab bar only when 2+ pictures open
  if (openPictures.length < 2) {
    tabBar.style.display = 'none';
    return;
  }

  tabBar.style.display = 'block';
  tabList.innerHTML = '';

  openPictures.forEach((pic, index) => {
    const tab = document.createElement('div');
    tab.className = 'picture-tab' +
      (index === activePictureIndex ? ' active' : '') +
      (pic.modified ? ' modified' : '');
    tab.dataset.index = String(index);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'picture-tab-name';
    nameSpan.textContent = pic.fileName || 'Untitled';
    nameSpan.title = pic.fileName || 'Untitled';

    const closeBtn = document.createElement('span');
    closeBtn.className = 'picture-tab-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';

    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);
    tabList.appendChild(tab);

    // Click tab to switch
    tab.addEventListener('click', (e) => {
      if (e.target === closeBtn) return;
      switchToPicture(index);
    });

    // Click close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePicture(index);
    });
  });
}

// ============================================================================
// ZX Spectrum Screen Address Calculation
// ============================================================================

/**
 * Calculates bitmap byte address for a pixel
 * ZX Spectrum screen has interleaved layout:
 * - 3 thirds (64 lines each)
 * - Within each third, lines are interleaved by character row
 *
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @returns {number} Byte offset (0-6143)
 */
function getBitmapAddress(x, y) {
  const charCol = Math.floor(x / 8);
  // ZXP/chr$: linear layout (row-major, no interleaving)
  if (currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) {
    const cols = getFormatWidth() >> 3;
    return y * cols + charCol;
  }
  // Standard ZX Spectrum interleaved layout
  const third = Math.floor(y / 64);
  const charRow = Math.floor((y % 64) / 8);
  const pixelLine = y % 8;
  return third * 2048 + pixelLine * 256 + charRow * 32 + charCol;
}

/**
 * Calculates attribute address for a pixel's cell
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @returns {number} Byte offset (6144-6911)
 */
function getAttributeAddress(x, y) {
  const charCol = Math.floor(x / 8);
  // ZXP/chr$: linear attrs after bitmap, using picture's attrCellHeight
  if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    const cols = currentPicture.width >> 3;
    const bitmapSize = cols * currentPicture.height;
    const attrCellH = currentPicture.attrCellHeight || 8;
    const attrRow = Math.floor(y / attrCellH);
    return bitmapSize + attrRow * cols + charCol;
  }
  const charRow = Math.floor(y / 8);
  return SCREEN.BITMAP_SIZE + charRow * 32 + charCol;
}

/**
 * Calculates IFL attribute address for a pixel (8×2 blocks, 96 attribute rows)
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @returns {number} Byte offset (6144-9215)
 */
function getIflAttributeAddress(x, y) {
  const attrRow = Math.floor(y / 2);  // 96 attribute rows (vs 24 for SCR)
  const charCol = Math.floor(x / 8);
  return IFL.BITMAP_SIZE + attrRow * 32 + charCol;
}

/**
 * Calculates MLT attribute address for a pixel (8×1 blocks, 192 attribute rows)
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @returns {number} Byte offset (6144-12287)
 */
function getMltAttributeAddress(x, y) {
  const charCol = Math.floor(x / 8);
  return MLT.BITMAP_SIZE + y * 32 + charCol;  // One attr row per pixel line
}

/**
 * Calculates BMC4 attribute address for a pixel (8×4 blocks, 48 attribute rows)
 * BMC4 has two attribute banks: attr1 for lines 0-3, attr2 for lines 4-7 of each char cell
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @returns {number} Byte offset
 */
function getBmc4AttributeAddress(x, y) {
  const charRow = Math.floor(y / 8);
  const charCol = Math.floor(x / 8);
  const pixelLine = y % 8;
  // Lines 0-3 use attr1, lines 4-7 use attr2
  const attrOffset = (pixelLine < 4) ? BMC4.ATTR1_OFFSET : BMC4.ATTR2_OFFSET;
  return attrOffset + charRow * 32 + charCol;
}

/**
 * Gets bit position within byte (MSB first - bit 7 = leftmost)
 * @param {number} x
 * @returns {number}
 */
function getBitPosition(x) {
  return 7 - (x % 8);
}

// ============================================================================
// Pixel and Attribute Operations
// ============================================================================

/**
 * Gets pixel value at coordinate
 * @param {Uint8Array} data
 * @param {number} x
 * @param {number} y
 * @returns {number} 0 (paper) or 1 (ink)
 */
function getPixel(data, x, y) {
  if (x < 0 || x >= getFormatWidth() || y < 0 || y >= getFormatHeight()) return 0;
  const addr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);
  return (data[addr] >> bit) & 1;
}

/**
 * Sets a pixel and updates the cell's attribute to current ink/paper
 * This is how real ZX Spectrum art programs work:
 * - Drawing sets the pixel bit AND sets the cell's attribute
 *
 * @param {Uint8Array} data
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk - true = set pixel (ink), false = clear pixel (paper)
 */
function setPixel(data, x, y, isInk) {
  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  // 53c attribute-only format: set cell attribute, no bitmap
  if (currentFormat === FORMAT.ATTR_53C) {
    recolorCell53c(x, y);
    return;
  }

  // LoRes: write palette index directly (128×96, row-major)
  if (currentFormat === FORMAT.LORES) {
    const color = isInk ? editorInkColor : editorPaperColor;
    const flatIdx = y * LORES.WIDTH + x;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[flatIdx] = color & 0xFF;
        layer.mask[flatIdx] = 1;
        flattenLayersToScreen();
      }
    } else {
      data[flatIdx] = color & 0xFF;
    }
    return;
  }

  // LoRes Radastan: write 4bpp packed nibble (128×96, 16-color)
  if (currentFormat === FORMAT.LORES_RAD) {
    const color = (isInk ? editorInkColor : editorPaperColor) & 0x0F;
    const flatIdx = y * LORES_RAD.WIDTH + x;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[flatIdx] = color;
        layer.mask[flatIdx] = 1;
        flattenLayersToScreen();
      }
    } else {
      // Pack into nibble in screenData
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      let byteVal = data[byteOffset] || 0;
      if ((x & 1) === 0) {
        byteVal = (color << 4) | (byteVal & 0x0F);
      } else {
        byteVal = (byteVal & 0xF0) | color;
      }
      data[byteOffset] = byteVal;
    }
    return;
  }

  // NXI/SL2: write palette index directly
  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    const color = isInk ? editorInkColor : editorPaperColor;
    const w = getFormatWidth();
    const flatIdx = y * w + x;  // row-major index for layers
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[flatIdx] = color & (nxiLayer2Mode === '640x256' ? 0x0F : 0xFF);
        layer.mask[flatIdx] = 1;
        flattenLayersToScreen();
      }
    } else {
      const pixOff = getNxiPixelOffset();
      if (nxiLayer2Mode === '640x256') {
        const byteIdx = pixOff + getNxiPixelIndex(x, y);
        const oldByte = data[byteIdx] || 0;
        data[byteIdx] = (x & 1) ? ((oldByte & 0xF0) | (color & 0x0F)) : ((oldByte & 0x0F) | ((color & 0x0F) << 4));
      } else {
        data[pixOff + getNxiPixelIndex(x, y)] = color & 0xFF;
      }
    }
    return;
  }

  // Check Y bounds for partial monochrome formats
  if (currentFormat === FORMAT.MONO_2_3 && y >= 128) return;
  if (currentFormat === FORMAT.MONO_1_3 && y >= 64) return;

  // Check if painting with transparent color (not available in ULA+ mode)
  const isTransparent = isInk ? isInkTransparent() : isPaperTransparent();
  if (isTransparent) {
    // Transparent: clear the mask on non-background layers
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        const maskIdx = y * width + x;
        layer.mask[maskIdx] = 0; // Make pixel transparent
        flattenLayersToScreen();
      }
    }
    // On background layer, transparent does nothing (can't erase background)
    return;
  }

  // Get current color for format-specific handling
  const color = isInk ? getCurrentInkColor() : getCurrentPaperColor();

  // RGB3 format: set bits in all 3 color channels based on ink/paper color
  if (currentFormat === FORMAT.RGB3) {
    const bitmapAddr = getBitmapAddress(x, y);
    const bit = getBitPosition(x);
    // ZX color index bits: bit0=Blue, bit1=Red, bit2=Green
    const hasBlue = (color & 1) !== 0;
    const hasRed = (color & 2) !== 0;
    const hasGreen = (color & 4) !== 0;
    // Set/clear bits in each channel
    if (hasRed) {
      data[RGB3.RED_OFFSET + bitmapAddr] |= (1 << bit);
    } else {
      data[RGB3.RED_OFFSET + bitmapAddr] &= ~(1 << bit);
    }
    if (hasGreen) {
      data[RGB3.GREEN_OFFSET + bitmapAddr] |= (1 << bit);
    } else {
      data[RGB3.GREEN_OFFSET + bitmapAddr] &= ~(1 << bit);
    }
    if (hasBlue) {
      data[RGB3.BLUE_OFFSET + bitmapAddr] |= (1 << bit);
    } else {
      data[RGB3.BLUE_OFFSET + bitmapAddr] &= ~(1 << bit);
    }
    return;
  }

  // Gigascreen format: set pixels and attributes in both frames
  if (isGigascreenEditable()) {
    setGigascreenPixel(data, x, y, isInk);
    return;
  }

  // Set the pixel bit
  const bitmapAddr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);

  // When layers are enabled and on non-background layer, only modify the layer bitmap
  // screenData will be updated via flattenLayersToScreen() after drawing completes
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      const maskIdx = y * width + x;
      if (isInk) {
        layer.bitmap[bitmapAddr] |= (1 << bit);
      } else {
        layer.bitmap[bitmapAddr] &= ~(1 << bit);
      }
      layer.mask[maskIdx] = 1; // Mark pixel as visible
    }
  } else {
    // No layers, or on background layer - modify screenData directly
    if (isInk) {
      data[bitmapAddr] |= (1 << bit);
    } else {
      data[bitmapAddr] &= ~(1 << bit);
    }

    // Also update background layer bitmap if layers are enabled
    if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
      const layer = layers[0];
      if (layer) {
        if (isInk) {
          layer.bitmap[bitmapAddr] |= (1 << bit);
        } else {
          layer.bitmap[bitmapAddr] &= ~(1 << bit);
        }
      }
    }
  }

  // Monochrome formats have no attributes
  if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    return;
  }

  // Set the attribute for this cell to current ink/paper/bright
  const attr = getCurrentDrawingAttribute();

  // MLT uses 8×1 blocks (192 rows), IFL uses 8×2 blocks (96 rows), BMC4 uses 8×4 blocks (48 rows), SCR uses 8×8 cells (24 rows)
  const attrAddr = currentFormat === FORMAT.MLT ? getMltAttributeAddress(x, y) :
                   currentFormat === FORMAT.IFL ? getIflAttributeAddress(x, y) :
                   currentFormat === FORMAT.BMC4 ? getBmc4AttributeAddress(x, y) :
                   getAttributeAddress(x, y);

  // When layers are enabled and on non-background layer, only update layer attributes
  // screenData attributes will be updated via flattenAttributesToScreen()
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer && layer.attributes) {
      if (currentFormat === FORMAT.BMC4) {
        const pixelLine = y % 8;
        const charRow = Math.floor(y / 8);
        const charCol = Math.floor(x / 8);
        const attrIdx = charRow * 32 + charCol;
        if (pixelLine < 4) {
          layer.attributes[attrIdx] = attr;
        } else if (layer.attributes2) {
          layer.attributes2[attrIdx] = attr;
        }
      } else if (currentFormat === FORMAT.MLT) {
        const attrIdx = y * 32 + Math.floor(x / 8);
        layer.attributes[attrIdx] = attr;
      } else if (currentFormat === FORMAT.IFL) {
        const attrRow = Math.floor(y / 2);
        const attrIdx = attrRow * 32 + Math.floor(x / 8);
        layer.attributes[attrIdx] = attr;
      } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
        const cols = currentPicture.width >> 3;
        const attrCellH = currentPicture.attrCellHeight || 8;
        const attrRow = Math.floor(y / attrCellH);
        const attrIdx = attrRow * cols + Math.floor(x / 8);
        layer.attributes[attrIdx] = attr;
      } else {
        const charRow = Math.floor(y / 8);
        const charCol = Math.floor(x / 8);
        const attrIdx = charRow * 32 + charCol;
        layer.attributes[attrIdx] = attr;
      }
    }
  } else {
    // No layers, or on background layer - modify screenData directly
    data[attrAddr] = attr;

    // Also update background layer attributes if layers are enabled
    if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
      const layer = layers[0];
      if (layer && layer.attributes) {
        if (currentFormat === FORMAT.BMC4) {
          const pixelLine = y % 8;
          const charRow = Math.floor(y / 8);
          const charCol = Math.floor(x / 8);
          const attrIdx = charRow * 32 + charCol;
          if (pixelLine < 4) {
            layer.attributes[attrIdx] = attr;
          } else if (layer.attributes2) {
            layer.attributes2[attrIdx] = attr;
          }
        } else if (currentFormat === FORMAT.MLT) {
          const attrIdx = y * 32 + Math.floor(x / 8);
          layer.attributes[attrIdx] = attr;
        } else if (currentFormat === FORMAT.IFL) {
          const attrRow = Math.floor(y / 2);
          const attrIdx = attrRow * 32 + Math.floor(x / 8);
          layer.attributes[attrIdx] = attr;
        } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
          const cols = currentPicture.width >> 3;
          const attrCellH = currentPicture.attrCellHeight || 8;
          const attrRow = Math.floor(y / attrCellH);
          const attrIdx = attrRow * cols + Math.floor(x / 8);
          layer.attributes[attrIdx] = attr;
        } else {
          const charRow = Math.floor(y / 8);
          const charCol = Math.floor(x / 8);
          const attrIdx = charRow * 32 + charCol;
          layer.attributes[attrIdx] = attr;
        }
      }
    }
  }
}

/**
 * Sets only the pixel bit without updating attributes (Retouch mode)
 * @param {Uint8Array} data
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk - true = set pixel (ink), false = clear pixel (paper)
 */
function setPixelBitmapOnly(data, x, y, isInk) {
  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  // HLR: bitmap is loader-tiled from the picture's 8-byte fill pattern
  // and never edited directly -- only attributes change.
  if (currentFormat === FORMAT.HLR) return;

  // STL: bitmap is fixed 0x0F -- only attributes change.
  if (currentFormat === FORMAT.STL) return;

  if (currentFormat === FORMAT.MONO_2_3 && y >= 128) return;
  if (currentFormat === FORMAT.MONO_1_3 && y >= 64) return;

  // RGB3 format: set bits in all 3 color channels
  if (currentFormat === FORMAT.RGB3) {
    const bitmapAddr = getBitmapAddress(x, y);
    const bit = getBitPosition(x);
    const color = isInk ? getCurrentInkColor() : getCurrentPaperColor();
    const hasBlue = (color & 1) !== 0;
    const hasRed = (color & 2) !== 0;
    const hasGreen = (color & 4) !== 0;
    if (hasRed) {
      data[RGB3.RED_OFFSET + bitmapAddr] |= (1 << bit);
    } else {
      data[RGB3.RED_OFFSET + bitmapAddr] &= ~(1 << bit);
    }
    if (hasGreen) {
      data[RGB3.GREEN_OFFSET + bitmapAddr] |= (1 << bit);
    } else {
      data[RGB3.GREEN_OFFSET + bitmapAddr] &= ~(1 << bit);
    }
    if (hasBlue) {
      data[RGB3.BLUE_OFFSET + bitmapAddr] |= (1 << bit);
    } else {
      data[RGB3.BLUE_OFFSET + bitmapAddr] &= ~(1 << bit);
    }
    return;
  }

  // Set only the pixel bit, no attribute change
  const bitmapAddr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);

  // When layers are enabled and on non-background layer, only modify layer data
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      const maskIdx = y * width + x;
      if (isInk) {
        layer.bitmap[bitmapAddr] |= (1 << bit);
      } else {
        layer.bitmap[bitmapAddr] &= ~(1 << bit);
      }
      layer.mask[maskIdx] = 1;
    }
  } else {
    // No layers or on background layer - modify screenData directly
    if (isInk) {
      data[bitmapAddr] |= (1 << bit);
    } else {
      data[bitmapAddr] &= ~(1 << bit);
    }

    // Also update background layer if layers enabled
    if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
      const layer = layers[0];
      if (layer) {
        if (isInk) {
          layer.bitmap[bitmapAddr] |= (1 << bit);
        } else {
          layer.bitmap[bitmapAddr] &= ~(1 << bit);
        }
      }
    }
  }
}

/**
 * Sets only the cell attribute without changing bitmap (Recolor mode)
 * @param {Uint8Array} data
 * @param {number} x
 * @param {number} y
 */
function setPixelAttributeOnly(data, x, y) {
  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  // Monochrome and RGB3 formats have no attributes
  if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 ||
      currentFormat === FORMAT.MONO_1_3 || currentFormat === FORMAT.RGB3) {
    return;
  }

  // HLR: drawing equals recoloring the half-cell (no separate bitmap)
  if (currentFormat === FORMAT.HLR) {
    setHlrHalfCellColor(data, x, y, true);
    return;
  }

  // STL: drawing equals recoloring the cell (no separate bitmap)
  if (currentFormat === FORMAT.STL) {
    setStlCellColor(data, x, y, true);
    return;
  }

  const attr = getCurrentDrawingAttribute();
  const attrAddr = currentFormat === FORMAT.MLT ? getMltAttributeAddress(x, y) :
                   currentFormat === FORMAT.IFL ? getIflAttributeAddress(x, y) :
                   currentFormat === FORMAT.BMC4 ? getBmc4AttributeAddress(x, y) :
                   getAttributeAddress(x, y);

  // Helper to update layer attributes
  const updateLayerAttr = (layer) => {
    if (!layer || !layer.attributes) return;
    if (currentFormat === FORMAT.BMC4) {
      const pixelLine = y % 8;
      const charRow = Math.floor(y / 8);
      const charCol = Math.floor(x / 8);
      const attrIdx = charRow * 32 + charCol;
      if (pixelLine < 4) {
        layer.attributes[attrIdx] = attr;
      } else if (layer.attributes2) {
        layer.attributes2[attrIdx] = attr;
      }
    } else if (currentFormat === FORMAT.MLT) {
      const attrIdx = y * 32 + Math.floor(x / 8);
      layer.attributes[attrIdx] = attr;
    } else if (currentFormat === FORMAT.IFL) {
      const attrRow = Math.floor(y / 2);
      const attrIdx = attrRow * 32 + Math.floor(x / 8);
      layer.attributes[attrIdx] = attr;
    } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
      const cols = currentPicture.width >> 3;
      const attrCellH = currentPicture.attrCellHeight || 8;
      const attrRow = Math.floor(y / attrCellH);
      const attrIdx = attrRow * cols + Math.floor(x / 8);
      layer.attributes[attrIdx] = attr;
    } else {
      const charRow = Math.floor(y / 8);
      const charCol = Math.floor(x / 8);
      const attrIdx = charRow * 32 + charCol;
      layer.attributes[attrIdx] = attr;
    }
  };

  // When layers are enabled and on non-background layer, only modify layer data
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    updateLayerAttr(layers[activeLayerIndex]);
  } else {
    // No layers or on background layer - modify screenData directly
    data[attrAddr] = attr;

    // Also update background layer if layers enabled
    if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
      updateLayerAttr(layers[0]);
    }
  }
}

/**
 * Builds attribute byte
 * @param {number} ink
 * @param {number} paper
 * @param {boolean} bright
 * @param {boolean} flash
 * @returns {number}
 */
function buildAttribute(ink, paper, bright, flash) {
  // Handle transparent colors (use 0/black for attributes)
  const safeInk = ink === COLOR_TRANSPARENT ? 0 : ink;
  const safePaper = paper === COLOR_TRANSPARENT ? 0 : paper;
  return (safeInk & 0x07) | ((safePaper & 0x07) << 3) | (bright ? 0x40 : 0) | (flash ? 0x80 : 0);
}

/**
 * Builds attribute byte for ULA+ mode from selected palette indices
 * Uses CLUT from ink selection, ink/paper positions from their respective indices
 * @returns {number} Attribute byte
 */
function buildUlaPlusAttribute() {
  // Handle transparent - use defaults (0 for ink, 7 for paper)
  const inkIdx = ulaPlusInkIndex === ULAPLUS_TRANSPARENT ? 0 : ulaPlusInkIndex;
  const paperIdx = ulaPlusPaperIndex === ULAPLUS_TRANSPARENT ? 15 : ulaPlusPaperIndex;

  // Extract CLUT from ink index (0-63 → CLUT 0-3)
  const clut = Math.floor(inkIdx / 16);

  // Extract ink position (0-7) from index
  // Indices 0-7, 16-23, 32-39, 48-55 are INK positions
  const inkPos = inkIdx % 8;

  // Extract paper position (0-7) from paper index
  // Indices 8-15, 24-31, 40-47, 56-63 are PAPER positions
  // We take just the 0-7 part regardless of which CLUT the paper was selected from
  const paperPos = paperIdx % 8;

  // CLUT is encoded as: bit 6 = BRIGHT, bit 7 = FLASH
  const bright = (clut & 1) !== 0;
  const flash = (clut & 2) !== 0;

  return (inkPos & 0x07) | ((paperPos & 0x07) << 3) | (bright ? 0x40 : 0) | (flash ? 0x80 : 0);
}

/**
 * Gets the current drawing attribute based on mode (ULA+ or standard)
 * @returns {number} Attribute byte for drawing
 */
function getCurrentDrawingAttribute() {
  if (currentFormat === FORMAT.ATTR_53C && attr53cVirtualPalette.length > 0) {
    return attr53cVirtualPalette[attr53cSelectedIndex].attr;
  }
  if (isUlaPlusMode) {
    return buildUlaPlusAttribute();
  }
  const attrInk = editorInkColor === COLOR_TRANSPARENT ? 0 : editorInkColor;
  const attrPaper = editorPaperColor === COLOR_TRANSPARENT ? 0 : editorPaperColor;
  return buildAttribute(attrInk, attrPaper, editorBright, editorFlash);
}

/**
 * Gets the current ink color for drawing (0-7 for standard, 0-7 within CLUT for ULA+)
 * Returns COLOR_TRANSPARENT (-1) if transparent is selected
 * @returns {number} Ink color index
 */
function getCurrentInkColor() {
  if (isUlaPlusMode) {
    if (ulaPlusInkIndex === ULAPLUS_TRANSPARENT) return COLOR_TRANSPARENT;
    return ulaPlusInkIndex % 8;
  }
  return editorInkColor;
}

/**
 * Gets the current paper color for drawing (0-7 for standard, 0-7 within CLUT for ULA+)
 * Returns COLOR_TRANSPARENT (-1) if transparent is selected
 * @returns {number} Paper color index
 */
function getCurrentPaperColor() {
  if (isUlaPlusMode) {
    if (ulaPlusPaperIndex === ULAPLUS_TRANSPARENT) return COLOR_TRANSPARENT;
    return ulaPlusPaperIndex % 8;
  }
  return editorPaperColor;
}

/**
 * Checks if ink is set to transparent
 * @returns {boolean}
 */
function isInkTransparent() {
  if (isUlaPlusMode) {
    return ulaPlusInkIndex === ULAPLUS_TRANSPARENT;
  }
  return editorInkColor === COLOR_TRANSPARENT;
}

/**
 * Checks if paper is set to transparent
 * @returns {boolean}
 */
function isPaperTransparent() {
  if (isUlaPlusMode) {
    return ulaPlusPaperIndex === ULAPLUS_TRANSPARENT;
  }
  return editorPaperColor === COLOR_TRANSPARENT;
}

/**
 * Parses attribute byte
 * @param {number} attr
 * @returns {{ink: number, paper: number, bright: boolean, flash: boolean}}
 */
function parseAttribute(attr) {
  return {
    ink: attr & 0x07,
    paper: (attr >> 3) & 0x07,
    bright: (attr & 0x40) !== 0,
    flash: (attr & 0x80) !== 0
  };
}

// ============================================================================
// Layer Management Functions
// ============================================================================

/**
 * Gets the bitmap size for the current format
 * @returns {number}
 */
function getLayerBitmapSize() {
  // BSC/BSP use same 6144-byte bitmap as SCR
  if (currentFormat === FORMAT.BSC || currentFormat === FORMAT.BSP) return SCREEN.BITMAP_SIZE;
  if (currentFormat === FORMAT.BMC4) return BMC4.BITMAP_SIZE;
  if (currentFormat === FORMAT.IFL) return IFL.BITMAP_SIZE;
  if (currentFormat === FORMAT.MLT) return MLT.BITMAP_SIZE;
  if (isGigascreenEditable()) return SCREEN.BITMAP_SIZE; // Per-frame bitmap size
  if (currentFormat === FORMAT.SPECSCII) return 768; // 32×24 character grid
  if (currentFormat === FORMAT.ATTR_53C) return 768; // 32×24 attribute grid (no bitmap)
  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD) return getFormatWidth() * getFormatHeight(); // 1 entry per pixel (row-major layer bitmap)
  if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    return (currentPicture.width >> 3) * currentPicture.height;
  }
  return SCREEN.BITMAP_SIZE; // Default for SCR
}

/**
 * Checks if the current format has border data (BSC or BMC4)
 * @returns {boolean}
 */
function formatHasBorder() {
  return currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border);
}

/**
 * Gets the border data size for the current format
 * @returns {number} Border size in bytes (4224 for BSC/BMC4, 0 for others)
 */
function getLayerBorderSize() {
  if (currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
      (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border)) {
    return BSC.BORDER_SIZE; // 4224 bytes
  }
  return 0;
}

/**
 * Gets the attribute data size for the current format (for per-layer attributes)
 * @returns {number} Attribute size in bytes (0 for formats without attributes)
 */
function getLayerAttributeSize() {
  if (currentFormat === FORMAT.SCR || currentFormat === FORMAT.SCR_ULAPLUS || currentFormat === FORMAT.SCR_ULANEXT || currentFormat === FORMAT.BSC || currentFormat === FORMAT.BSP) {
    return SCREEN.ATTR_SIZE; // 768 bytes (8×8 cells)
  }
  if (currentFormat === FORMAT.BMC4) {
    return BMC4.ATTR1_SIZE + BMC4.ATTR2_SIZE; // 768 + 768 = 1536 bytes (8×4 cells, 2 banks)
  }
  if (currentFormat === FORMAT.IFL) {
    return IFL.ATTR_SIZE; // 3072 bytes (8×2 cells)
  }
  if (currentFormat === FORMAT.MLT) {
    return MLT.ATTR_SIZE; // 6144 bytes (8×1 cells)
  }
  if (isGigascreenEditable()) {
    return getGigaAttrSize(); // 768 bytes for mg8/.img, 1536 for mg4 (per frame, stored separately)
  }
  if (currentFormat === FORMAT.SPECSCII) {
    return 768; // 32×24 attribute grid
  }
  if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    const cols = currentPicture.width >> 3;
    const attrRows = currentPicture.attrRows || Math.ceil(currentPicture.height / (currentPicture.attrCellHeight || 8));
    return cols * attrRows;
  }
  // MONO, RGB3, ATTR_53C, SCA have no layer attributes
  return 0;
}

/**
 * Initializes the layer system for the current image.
 * Creates a background layer from the current screenData.
 */
function initLayers() {
  if (!screenData || (screenData.length === 0 && currentFormat !== FORMAT.SPECSCII)) {
    layers = [];
    activeLayerIndex = 0;
    layersEnabled = false;
    return;
  }

  // SPECSCII: if layers were already parsed from stream (OVER sections), keep them
  if (currentFormat === FORMAT.SPECSCII && layersEnabled && layers.length > 1) {
    return;
  }

  // Only enable layers for editable formats (not SCA)
  if (!isFormatEditable()) {
    layersEnabled = false;
    layers = [];
    return;
  }

  layersEnabled = true;
  const bitmapSize = getLayerBitmapSize();
  const borderSize = getLayerBorderSize();
  const hasBorder = formatHasBorder();
  const attrSize = getLayerAttributeSize();

  // Create background layer from current bitmap
  const bgBitmap = new Uint8Array(bitmapSize);
  const isPerCell = currentFormat === FORMAT.SPECSCII || currentFormat === FORMAT.ATTR_53C;
  const isPerPixelBitmap = currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD;
  const maskSize = isPerCell ? bitmapSize : isPerPixelBitmap ? bitmapSize : bitmapSize * 8;
  const bgMask = new Uint8Array(maskSize); // SPECSCII/53c: 1 per cell; NXI/SL2: 1 per pixel (=bitmapSize); SCR: 1 per pixel (bitmap*8)

  // Copy current bitmap to background layer
  if (currentFormat === FORMAT.SPECSCII && specsciiCharGrid) {
    // SPECSCII: layer bitmap stores charGrid, attributes store attrGrid
    // Copy mask to track user-placed content
    for (let i = 0; i < bitmapSize; i++) {
      bgBitmap[i] = specsciiCharGrid[i];
      bgMask[i] = specsciiMask ? specsciiMask[i] : 1;
    }
  } else if (currentFormat === FORMAT.ATTR_53C) {
    // 53c: layer bitmap stores attribute bytes (768), mask is per-cell
    bgMask.fill(1); // Background is fully opaque
    for (let i = 0; i < bitmapSize; i++) {
      bgBitmap[i] = screenData[i];
    }
  } else if (currentFormat === FORMAT.LORES) {
    bgMask.fill(1);
    for (let i = 0; i < bitmapSize; i++) {
      bgBitmap[i] = screenData[i];
    }
  } else if (currentFormat === FORMAT.LORES_RAD) {
    // Unpack 4bpp nibbles to 1-byte-per-pixel layer bitmap
    bgMask.fill(1);
    for (let y = 0; y < LORES_RAD.HEIGHT; y++) {
      for (let x = 0; x < LORES_RAD.WIDTH; x++) {
        const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
        const byteVal = screenData[byteOffset] || 0;
        bgBitmap[y * LORES_RAD.WIDTH + x] = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      }
    }
  } else if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    bgMask.fill(1);
    const pixOff = getNxiPixelOffset();
    const w = getFormatWidth();
    const h = getFormatHeight();
    if (nxiLayer2Mode === '640x256') {
      // 4bpp column-major: unpack 2 pixels per byte into row-major layer bitmap
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x += 2) {
          const byteVal = screenData[pixOff + (x >> 1) * 256 + y] || 0;
          bgBitmap[y * w + x] = (byteVal >> 4) & 0x0F;
          bgBitmap[y * w + x + 1] = byteVal & 0x0F;
        }
      }
    } else if (nxiLayer2Mode === '320x256') {
      // 8bpp column-major → row-major
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          bgBitmap[y * w + x] = screenData[pixOff + x * 256 + y];
        }
      }
    } else {
      // 256×192 row-major: direct copy
      for (let i = 0; i < bitmapSize; i++) {
        bgBitmap[i] = screenData[pixOff + i];
      }
    }
  } else {
    bgMask.fill(1); // Non-SPECSCII: background is fully opaque
    for (let i = 0; i < bitmapSize; i++) {
      bgBitmap[i] = screenData[i];
    }
  }

  /** @type {Layer} */
  const bgLayer = {
    name: 'Background',
    bitmap: bgBitmap,
    mask: bgMask,
    visible: true
  };

  // Initialize per-layer attributes from screenData
  if (attrSize > 0) {
    if (currentFormat === FORMAT.SPECSCII && specsciiAttrGrid) {
      bgLayer.attributes = new Uint8Array(attrSize);
      for (let i = 0; i < attrSize; i++) {
        bgLayer.attributes[i] = specsciiAttrGrid[i];
      }
    } else if (currentFormat === FORMAT.BMC4) {
      // BMC4: two attribute banks (768 bytes each)
      bgLayer.attributes = new Uint8Array(BMC4.ATTR1_SIZE);
      bgLayer.attributes2 = new Uint8Array(BMC4.ATTR2_SIZE);
      for (let i = 0; i < BMC4.ATTR1_SIZE; i++) {
        bgLayer.attributes[i] = screenData[BMC4.ATTR1_OFFSET + i];
      }
      for (let i = 0; i < BMC4.ATTR2_SIZE; i++) {
        bgLayer.attributes2[i] = screenData[BMC4.ATTR2_OFFSET + i];
      }
    } else if (isGigascreenEditable()) {
      // Gigascreen: two separate attribute arrays for each frame
      const gigaAS = getGigaAttrSize();
      const gigaFS = getGigaFrameSize();
      bgLayer.attributes = new Uint8Array(gigaAS);
      bgLayer.attributesFrame2 = new Uint8Array(gigaAS);
      // Frame 1 attributes at offset 6144
      for (let i = 0; i < gigaAS; i++) {
        bgLayer.attributes[i] = screenData[SCREEN.BITMAP_SIZE + i];
      }
      // Frame 2 attributes at offset gigaFS + 6144
      for (let i = 0; i < gigaAS; i++) {
        bgLayer.attributesFrame2[i] = screenData[gigaFS + SCREEN.BITMAP_SIZE + i];
      }
      // Frame 2 bitmap
      bgLayer.bitmap2 = new Uint8Array(bitmapSize);
      for (let i = 0; i < bitmapSize; i++) {
        bgLayer.bitmap2[i] = screenData[gigaFS + i];
      }
    } else {
      // SCR/BSC/IFL/MLT: single attribute bank
      bgLayer.attributes = new Uint8Array(attrSize);
      for (let i = 0; i < attrSize; i++) {
        bgLayer.attributes[i] = screenData[bitmapSize + i];
      }
    }
  }

  // Initialize border data for BSC/BMC4 formats
  if (hasBorder && borderSize > 0) {
    const borderOffset = getBorderDataOffset();
    const bgBorderData = new Uint8Array(borderSize);
    const bgBorderMask = new Uint8Array(borderSize * 2); // 2 color slots per byte
    bgBorderMask.fill(1); // Background border is fully opaque

    // Copy current border data to background layer
    for (let i = 0; i < borderSize; i++) {
      bgBorderData[i] = screenData[borderOffset + i];
    }

    bgLayer.borderData = bgBorderData;
    bgLayer.borderMask = bgBorderMask;
  }

  layers = [bgLayer];
  activeLayerIndex = 0;

  updateLayerPanel();
}

/**
 * Adds a new empty layer above the current layer
 * @param {string} [name] - Optional layer name
 */
function addLayer(name) {
  if (!layersEnabled) return;

  // Save undo state before adding layer
  saveUndoState();

  const bitmapSize = getLayerBitmapSize();
  const borderSize = getLayerBorderSize();
  const hasBorder = formatHasBorder();
  const attrSize = getLayerAttributeSize();
  const width = getFormatWidth();
  const height = getFormatHeight();

  /** @type {Layer} */
  const newLayer = {
    name: name || `Layer ${layers.length}`,
    bitmap: new Uint8Array(bitmapSize), // Empty (all zeros = paper)
    mask: new Uint8Array((currentFormat === FORMAT.SPECSCII || currentFormat === FORMAT.ATTR_53C) ? bitmapSize : width * height), // SPECSCII/53c: 1 mask entry per cell
    visible: true
  };

  // SPECSCII: fill bitmap with spaces (0x20) instead of zeros
  if (currentFormat === FORMAT.SPECSCII) {
    newLayer.bitmap.fill(0x20);
  }

  // Add default attributes (ink=7, paper=0) for formats that support them
  if (attrSize > 0) {
    const defaultAttr = buildAttribute(7, 0, false, false); // ink=7 (white), paper=0 (black)
    if (currentFormat === FORMAT.BMC4) {
      // BMC4: two attribute banks
      newLayer.attributes = new Uint8Array(BMC4.ATTR1_SIZE);
      newLayer.attributes2 = new Uint8Array(BMC4.ATTR2_SIZE);
      newLayer.attributes.fill(defaultAttr);
      newLayer.attributes2.fill(defaultAttr);
    } else if (isGigascreenEditable()) {
      // Gigascreen: two separate attribute arrays for each frame
      // Use current virtual colors for default attributes
      const gigaAS = getGigaAttrSize();
      const frame1 = getGigascreenFrameColors(0);
      const frame2 = getGigascreenFrameColors(1);
      const attr1 = buildAttribute(frame1.inkColor, frame1.paperColor, frame1.bright, false);
      const attr2 = buildAttribute(frame2.inkColor, frame2.paperColor, frame2.bright, false);
      newLayer.attributes = new Uint8Array(gigaAS);
      newLayer.attributesFrame2 = new Uint8Array(gigaAS);
      newLayer.attributes.fill(attr1);
      newLayer.attributesFrame2.fill(attr2);
      // Frame 2 bitmap
      newLayer.bitmap2 = new Uint8Array(bitmapSize);
    } else {
      // SCR/BSC/IFL/MLT: single attribute bank
      newLayer.attributes = new Uint8Array(attrSize);
      newLayer.attributes.fill(defaultAttr);
    }
  }

  // Add border data for BSC/BMC4 formats
  if (hasBorder && borderSize > 0) {
    newLayer.borderData = new Uint8Array(borderSize); // Empty (all zeros = black)
    newLayer.borderMask = new Uint8Array(borderSize * 2); // All transparent (2 slots per byte)
  }

  // Insert above current layer
  layers.splice(activeLayerIndex + 1, 0, newLayer);
  activeLayerIndex = activeLayerIndex + 1;

  updateLayerPanel();
  flattenLayersToScreen();
  editorRender();
}

/**
 * Removes the currently active layer (cannot remove background)
 */
function removeLayer() {
  if (!layersEnabled || layers.length <= 1 || activeLayerIndex === 0) return;

  // Save undo state before removing layer
  saveUndoState();

  layers.splice(activeLayerIndex, 1);
  if (activeLayerIndex >= layers.length) {
    activeLayerIndex = layers.length - 1;
  }

  updateLayerPanel();
  flattenLayersToScreen();
  editorRender();
}

/**
 * Moves the active layer up (towards front)
 */
function moveLayerUp() {
  if (!layersEnabled || activeLayerIndex >= layers.length - 1) return;

  // Save undo state before reordering layers
  saveUndoState();

  const temp = layers[activeLayerIndex];
  layers[activeLayerIndex] = layers[activeLayerIndex + 1];
  layers[activeLayerIndex + 1] = temp;
  activeLayerIndex++;

  updateLayerPanel();
  flattenLayersToScreen();
  editorRender();
}

/**
 * Moves the active layer down (towards back)
 */
function moveLayerDown() {
  if (!layersEnabled || activeLayerIndex <= 1) return; // Can't move below background

  // Save undo state before reordering layers
  saveUndoState();

  const temp = layers[activeLayerIndex];
  layers[activeLayerIndex] = layers[activeLayerIndex - 1];
  layers[activeLayerIndex - 1] = temp;
  activeLayerIndex--;

  updateLayerPanel();
  flattenLayersToScreen();
  editorRender();
}

/**
 * Sets the active layer by index
 * @param {number} index
 */
function setActiveLayer(index) {
  if (!layersEnabled || index < 0 || index >= layers.length) return;
  activeLayerIndex = index;

  // SPECSCII: sync charGrid/attrGrid/mask from newly active layer so pick/info works correctly
  if (currentFormat === FORMAT.SPECSCII && specsciiCharGrid && specsciiAttrGrid) {
    const layer = layers[index];
    if (layer && layer.bitmap) {
      const cellCount = 768;
      for (let i = 0; i < cellCount; i++) {
        specsciiCharGrid[i] = layer.bitmap[i];
        specsciiAttrGrid[i] = layer.attributes ? layer.attributes[i] : 0x38;
        if (specsciiMask && layer.mask) specsciiMask[i] = layer.mask[i];
      }
    }
  }

  // Update visual state without rebuilding DOM (preserves double-click)
  const layerList = document.getElementById('layerList');
  if (layerList) {
    layerList.querySelectorAll('.layer-item').forEach(item => {
      const itemIndex = parseInt(/** @type {HTMLElement} */ (item).dataset.index || '', 10);
      item.classList.toggle('active', itemIndex === index);
    });
  }

  // Update button states
  updateLayerButtonStates();
}

/**
 * Toggles visibility of a layer
 * @param {number} index
 */
function toggleLayerVisibility(index) {
  if (!layersEnabled || index < 0 || index >= layers.length) return;
  layers[index].visible = !layers[index].visible;
  updateLayerPanel();
  flattenLayersToScreen();
  editorRender();
}

/**
 * Syncs the internal picture format from screenData.
 * Called after any operation that modifies screenData (draw, undo, redo, fill, paste, flatten).
 */
function syncCurrentPicture() {
  if (currentPicture && typeof syncPictureFromScreenData === 'function') {
    syncPictureFromScreenData(screenData, currentPicture);
  }
}

/**
 * Flattens all visible layers to screenData for rendering/export.
 * Background provides base, upper layers composite on top where mask=1.
 */
function flattenLayersToScreen() {
  if (batchFlattenDeferred) return;
  if (!layersEnabled || layers.length === 0) return;

  // SPECSCII: flatten layers into charGrid/attrGrid
  // Upper layers use OVER (XOR) compositing — the renderer handles visual XOR,
  // and the stream encoder emits OVER 1 control codes for multi-layer output.
  if (currentFormat === FORMAT.SPECSCII && specsciiCharGrid && specsciiAttrGrid) {
    const cellCount = 768; // 32×24
    // Copy active layer data into grids for editing (pick, info display)
    const activeIdx = typeof activeLayerIndex !== 'undefined' ? activeLayerIndex : 0;
    const activeLayer = layers[activeIdx];
    if (activeLayer && activeLayer.bitmap) {
      for (let i = 0; i < cellCount; i++) {
        specsciiCharGrid[i] = activeLayer.bitmap[i];
        specsciiAttrGrid[i] = activeLayer.attributes ? activeLayer.attributes[i] : 0x38;
        if (specsciiMask && activeLayer.mask) specsciiMask[i] = activeLayer.mask[i];
      }
    }
    // Sync to stream: encode all layers with OVER control codes
    specsciiSyncToStream();
    return;
  }

  // 53c: flatten attribute-only layers into screenData
  // Layer bitmap stores attribute bytes, mask tracks per-cell ownership
  if (currentFormat === FORMAT.ATTR_53C) {
    const cellCount = 768; // 32×24
    // Start with background layer
    if (layers[0].visible) {
      for (let i = 0; i < cellCount; i++) {
        screenData[i] = layers[0].bitmap[i];
      }
    } else {
      screenData.fill(0, 0, cellCount);
    }
    // Composite upper layers: top-down, mask=1 means cell is painted
    for (let layerIdx = 1; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (!layer.visible) continue;
      for (let i = 0; i < cellCount; i++) {
        if (layer.mask[i]) {
          screenData[i] = layer.bitmap[i];
        }
      }
    }
    return;
  }

  // LoRes: flatten indexed-color layers (row-major bitmap → screenData, direct copy)
  if (currentFormat === FORMAT.LORES) {
    const pixelCount = LORES.WIDTH * LORES.HEIGHT;
    const composited = new Uint8Array(pixelCount);
    if (layers[0].visible) {
      composited.set(layers[0].bitmap.subarray(0, pixelCount));
    }
    for (let layerIdx = 1; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (!layer.visible) continue;
      for (let i = 0; i < pixelCount; i++) {
        if (layer.mask[i]) composited[i] = layer.bitmap[i];
      }
    }
    for (let i = 0; i < pixelCount; i++) {
      screenData[i] = composited[i];
    }
    return;
  }

  // LoRes Radastan: flatten indexed-color layers, repack to 4bpp nibbles
  if (currentFormat === FORMAT.LORES_RAD) {
    const pixelCount = LORES_RAD.WIDTH * LORES_RAD.HEIGHT;
    const composited = new Uint8Array(pixelCount);
    if (layers[0].visible) {
      composited.set(layers[0].bitmap.subarray(0, pixelCount));
    }
    for (let layerIdx = 1; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (!layer.visible) continue;
      for (let i = 0; i < pixelCount; i++) {
        if (layer.mask[i]) composited[i] = layer.bitmap[i];
      }
    }
    // Repack to 4bpp nibbles
    for (let y = 0; y < LORES_RAD.HEIGHT; y++) {
      for (let x = 0; x < LORES_RAD.WIDTH; x += 2) {
        const left = composited[y * LORES_RAD.WIDTH + x] & 0x0F;
        const right = composited[y * LORES_RAD.WIDTH + x + 1] & 0x0F;
        screenData[y * LORES_RAD.BYTES_PER_ROW + (x >> 1)] = (left << 4) | right;
      }
    }
    return;
  }

  // NXI/SL2: flatten indexed-color layers (row-major bitmap → screenData format)
  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    const pixelOffset = getNxiPixelOffset();
    const w = getFormatWidth();
    const h = getFormatHeight();
    const pixelCount = w * h;

    // First, composite all layers into a flat row-major buffer
    const composited = new Uint8Array(pixelCount);
    if (layers[0].visible) {
      composited.set(layers[0].bitmap.subarray(0, pixelCount));
    }
    for (let layerIdx = 1; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (!layer.visible) continue;
      for (let i = 0; i < pixelCount; i++) {
        if (layer.mask[i]) composited[i] = layer.bitmap[i];
      }
    }

    // Write composited row-major data to screenData in the correct layout
    if (nxiLayer2Mode === '640x256') {
      // Pack row-major 4bpp pixels into column-major bytes
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x += 2) {
          const hi = composited[y * w + x] & 0x0F;
          const lo = composited[y * w + x + 1] & 0x0F;
          screenData[pixelOffset + (x >> 1) * 256 + y] = (hi << 4) | lo;
        }
      }
    } else if (nxiLayer2Mode === '320x256') {
      // Row-major → column-major 8bpp
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          screenData[pixelOffset + x * 256 + y] = composited[y * w + x];
        }
      }
    } else {
      // 256×192 row-major: direct copy
      for (let i = 0; i < pixelCount; i++) {
        screenData[pixelOffset + i] = composited[i];
      }
    }
    return;
  }

  const bitmapSize = getLayerBitmapSize();
  const width = getFormatWidth();
  const height = getFormatHeight();
  const pixelCount = width * height;

  // Initialize or resize transparency mask
  if (!screenTransparencyMask || screenTransparencyMask.length !== pixelCount) {
    screenTransparencyMask = new Uint8Array(pixelCount);
  }

  // Start with background layer bitmap (frame 1)
  for (let i = 0; i < bitmapSize; i++) {
    if (layers[0].visible) {
      screenData[i] = layers[0].bitmap[i];
    } else {
      screenData[i] = 0;
    }
  }

  // Gigascreen: also copy frame 2 bitmap from background layer
  const flattenGigaFS = isGigascreenEditable() ? getGigaFrameSize() : 0;
  if (isGigascreenEditable() && layers[0].bitmap2) {
    for (let i = 0; i < bitmapSize; i++) {
      if (layers[0].visible) {
        screenData[flattenGigaFS + i] = layers[0].bitmap2[i];
      } else {
        screenData[flattenGigaFS + i] = 0;
      }
    }
  }

  // Initialize transparency mask based on background layer visibility
  // Background layer has content everywhere if visible
  const bgHasContent = layers[0].visible ? 1 : 0;
  for (let i = 0; i < pixelCount; i++) {
    screenTransparencyMask[i] = bgHasContent;
  }

  // Composite upper layers (bitmap)
  for (let layerIdx = 1; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    if (!layer.visible) continue;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        if (layer.mask[maskIdx]) {
          // This pixel is visible on this layer - copy it
          const bitmapAddr = getBitmapAddress(x, y);
          const bitMask = 0x80 >> (x % 8);

          // Frame 1
          if (layer.bitmap[bitmapAddr] & bitMask) {
            screenData[bitmapAddr] |= bitMask;
          } else {
            screenData[bitmapAddr] &= ~bitMask & 0xFF;
          }

          // Gigascreen: also composite frame 2
          if (isGigascreenEditable() && layer.bitmap2) {
            if (layer.bitmap2[bitmapAddr] & bitMask) {
              screenData[flattenGigaFS + bitmapAddr] |= bitMask;
            } else {
              screenData[flattenGigaFS + bitmapAddr] &= ~bitMask & 0xFF;
            }
          }

          // Mark this pixel as having content
          screenTransparencyMask[maskIdx] = 1;
        }
      }
    }
  }

  // Flatten border data for BSC/BMC4 formats
  if (formatHasBorder()) {
    flattenBorderLayersToScreen();
  }

  // Flatten attributes from layers based on cell ownership
  flattenAttributesToScreen();

  // Sync internal picture format from updated screenData
  syncCurrentPicture();
}

/**
 * Flattens border data from all visible layers to screenData.
 * Each border byte contains two 3-bit color values (bits 0-2 and 3-5).
 */
function flattenBorderLayersToScreen() {
  const borderSize = getLayerBorderSize();
  if (borderSize === 0) return;

  const borderOffset = getBorderDataOffset();
  const bgLayer = layers[0];
  const maskSize = borderSize * 2; // 2 color slots per byte

  // Initialize or resize border transparency mask
  if (!borderTransparencyMask || borderTransparencyMask.length !== maskSize) {
    borderTransparencyMask = new Uint8Array(maskSize);
  }

  // Start with background layer border data
  if (bgLayer.borderData && bgLayer.visible) {
    for (let i = 0; i < borderSize; i++) {
      screenData[borderOffset + i] = bgLayer.borderData[i];
    }
    // Background border is fully opaque when visible
    borderTransparencyMask.fill(1);
  } else {
    // No background border data or not visible - fill with black
    for (let i = 0; i < borderSize; i++) {
      screenData[borderOffset + i] = 0;
    }
    // Background hidden - all transparent initially
    borderTransparencyMask.fill(0);
  }

  // Composite upper layers (border)
  for (let layerIdx = 1; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    if (!layer.visible || !layer.borderData || !layer.borderMask) continue;

    for (let i = 0; i < borderSize; i++) {
      // Each byte has 2 color slots, so mask index is i*2 and i*2+1
      const maskIdx0 = i * 2;
      const maskIdx1 = i * 2 + 1;

      let byte = screenData[borderOffset + i];

      // First color slot (bits 0-2)
      if (layer.borderMask[maskIdx0]) {
        const color0 = layer.borderData[i] & 0x07;
        byte = (byte & 0xF8) | color0;
        borderTransparencyMask[maskIdx0] = 1; // Has content
      }

      // Second color slot (bits 3-5)
      if (layer.borderMask[maskIdx1]) {
        const color1 = (layer.borderData[i] >> 3) & 0x07;
        byte = (byte & 0xC7) | (color1 << 3);
        borderTransparencyMask[maskIdx1] = 1; // Has content
      }

      screenData[borderOffset + i] = byte;
    }
  }
}

/**
 * Flattens attributes from all visible layers to screenData.
 * For each attribute cell, use the topmost visible layer that has any pixel content.
 */
function flattenAttributesToScreen() {
  const attrSize = getLayerAttributeSize();
  if (attrSize === 0) return; // No attributes for this format

  // SPECSCII attributes are flattened in flattenLayersToScreen()
  if (currentFormat === FORMAT.SPECSCII) return;

  const width = getFormatWidth();
  const height = getFormatHeight();
  const bitmapSize = getLayerBitmapSize();

  if (currentFormat === FORMAT.BMC4) {
    // BMC4: two attribute banks (8×4 cells)
    flattenBmc4Attributes();
    return;
  }

  if (isGigascreenEditable()) {
    // Gigascreen: two separate attribute arrays (one per frame)
    flattenGigascreenAttributes();
    return;
  }

  // SCR/BSC/IFL/MLT: single attribute bank
  // Calculate cell dimensions based on format
  let cellHeight;
  if (currentFormat === FORMAT.MLT) {
    cellHeight = 1; // 8×1 cells
  } else if (currentFormat === FORMAT.IFL) {
    cellHeight = 2; // 8×2 cells
  } else {
    cellHeight = 8; // 8×8 cells (SCR/BSC)
  }
  const cellWidth = 8;
  const attrCols = 32;
  const attrRows = height / cellHeight;

  for (let attrRow = 0; attrRow < attrRows; attrRow++) {
    for (let attrCol = 0; attrCol < attrCols; attrCol++) {
      const cellStartX = attrCol * cellWidth;
      const cellStartY = attrRow * cellHeight;
      const attrIdx = attrRow * attrCols + attrCol;

      // Find topmost visible layer with content AND attributes in this cell
      const ownerLayer = findLayerOwnerForRegionWithAttributes(cellStartX, cellStartY, cellWidth, cellHeight);

      if (ownerLayer && ownerLayer.attributes && attrIdx < ownerLayer.attributes.length) {
        screenData[bitmapSize + attrIdx] = ownerLayer.attributes[attrIdx];
      } else if (layers[0].visible && layers[0].attributes && attrIdx < layers[0].attributes.length) {
        // Fallback to background layer
        screenData[bitmapSize + attrIdx] = layers[0].attributes[attrIdx];
      } else {
        // No owner found - use default (ink=7, paper=0)
        screenData[bitmapSize + attrIdx] = buildAttribute(7, 0, false, false);
      }
    }
  }
}

/**
 * Flattens BMC4 attributes from layers to screenData.
 * BMC4 has two attribute banks: top 4 lines use attributes, bottom 4 lines use attributes2.
 */
function flattenBmc4Attributes() {
  const cellWidth = 8;
  const attrCols = 32;
  const attrRows = 24; // 192 / 8 = 24 character rows

  for (let charRow = 0; charRow < attrRows; charRow++) {
    for (let attrCol = 0; attrCol < attrCols; attrCol++) {
      const cellStartX = attrCol * cellWidth;
      const attrIdx = charRow * attrCols + attrCol;

      // Top half (lines 0-3 of the 8-pixel cell)
      const topStartY = charRow * 8;
      const topOwner = findLayerOwnerForRegionWithAttributes(cellStartX, topStartY, cellWidth, 4);
      if (topOwner && topOwner.attributes && attrIdx < topOwner.attributes.length) {
        screenData[BMC4.ATTR1_OFFSET + attrIdx] = topOwner.attributes[attrIdx];
      } else if (layers[0].visible && layers[0].attributes && attrIdx < layers[0].attributes.length) {
        screenData[BMC4.ATTR1_OFFSET + attrIdx] = layers[0].attributes[attrIdx];
      } else {
        screenData[BMC4.ATTR1_OFFSET + attrIdx] = buildAttribute(7, 0, false, false);
      }

      // Bottom half (lines 4-7 of the 8-pixel cell)
      const bottomStartY = charRow * 8 + 4;
      const bottomOwner = findLayerOwnerForRegionWithAttributes(cellStartX, bottomStartY, cellWidth, 4);
      if (bottomOwner && bottomOwner.attributes2 && attrIdx < bottomOwner.attributes2.length) {
        screenData[BMC4.ATTR2_OFFSET + attrIdx] = bottomOwner.attributes2[attrIdx];
      } else if (layers[0].visible && layers[0].attributes2 && attrIdx < layers[0].attributes2.length) {
        screenData[BMC4.ATTR2_OFFSET + attrIdx] = layers[0].attributes2[attrIdx];
      } else {
        screenData[BMC4.ATTR2_OFFSET + attrIdx] = buildAttribute(7, 0, false, false);
      }
    }
  }
}

/**
 * Flattens Gigascreen attributes from layers to screenData.
 * Each layer has separate attributes for frame 1 and frame 2.
 */
function flattenGigascreenAttributes() {
  const cellWidth = 8;
  const cellHeight = getGigaAttrCellHeight();
  const attrCols = 32;
  const attrRows = Math.ceil(192 / cellHeight);
  const gigaFS = getGigaFrameSize();

  for (let attrRow = 0; attrRow < attrRows; attrRow++) {
    for (let attrCol = 0; attrCol < attrCols; attrCol++) {
      const cellStartX = attrCol * cellWidth;
      const cellStartY = attrRow * cellHeight;
      const attrIdx = attrRow * attrCols + attrCol;

      // Find topmost visible layer with content in this cell
      const ownerLayer = findLayerOwnerForRegionWithAttributes(cellStartX, cellStartY, cellWidth, cellHeight);

      // Frame 1 attributes
      if (ownerLayer && ownerLayer.attributes && attrIdx < ownerLayer.attributes.length) {
        screenData[SCREEN.BITMAP_SIZE + attrIdx] = ownerLayer.attributes[attrIdx];
      } else if (layers[0].visible && layers[0].attributes && attrIdx < layers[0].attributes.length) {
        screenData[SCREEN.BITMAP_SIZE + attrIdx] = layers[0].attributes[attrIdx];
      } else {
        screenData[SCREEN.BITMAP_SIZE + attrIdx] = buildAttribute(7, 0, false, false);
      }

      // Frame 2 attributes
      if (ownerLayer && ownerLayer.attributesFrame2 && attrIdx < ownerLayer.attributesFrame2.length) {
        screenData[gigaFS + 6144 + attrIdx] = ownerLayer.attributesFrame2[attrIdx];
      } else if (layers[0].visible && layers[0].attributesFrame2 && attrIdx < layers[0].attributesFrame2.length) {
        screenData[gigaFS + 6144 + attrIdx] = layers[0].attributesFrame2[attrIdx];
      } else {
        screenData[gigaFS + 6144 + attrIdx] = buildAttribute(7, 0, false, false);
      }
    }
  }
}

/**
 * Finds the topmost visible layer that has any pixel content in a region.
 * Searches from top layer down to background.
 * @param {number} startX - Region start X
 * @param {number} startY - Region start Y
 * @param {number} regionWidth - Region width in pixels
 * @param {number} regionHeight - Region height in pixels
 * @returns {Layer|null} - The owning layer, or null if no layer has content
 */
function findLayerOwnerForRegion(startX, startY, regionWidth, regionHeight) {
  const width = getFormatWidth();

  // Search from top layer down to background
  for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx--) {
    const layer = layers[layerIdx];
    if (!layer.visible) continue;

    // Check if this layer has any visible pixel in the region
    for (let dy = 0; dy < regionHeight; dy++) {
      const y = startY + dy;
      if (y >= getFormatHeight()) continue;

      for (let dx = 0; dx < regionWidth; dx++) {
        const x = startX + dx;
        if (x >= width) continue;

        const maskIdx = y * width + x;
        if (layer.mask[maskIdx]) {
          // Found a visible pixel on this layer
          return layer;
        }
      }
    }
  }

  return null;
}

/**
 * Finds the topmost visible layer that has content AND attributes in a region.
 * This ensures the returned layer can provide attributes for the cell.
 * @param {number} startX
 * @param {number} startY
 * @param {number} regionWidth
 * @param {number} regionHeight
 * @returns {Layer|null}
 */
function findLayerOwnerForRegionWithAttributes(startX, startY, regionWidth, regionHeight) {
  const width = getFormatWidth();

  // Search from top layer down to background
  for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx--) {
    const layer = layers[layerIdx];
    if (!layer.visible) continue;
    if (!layer.attributes) continue; // Skip layers without attributes

    // Check if this layer has any visible pixel in the region
    for (let dy = 0; dy < regionHeight; dy++) {
      const y = startY + dy;
      if (y >= getFormatHeight()) continue;

      for (let dx = 0; dx < regionWidth; dx++) {
        const x = startX + dx;
        if (x >= width) continue;

        const maskIdx = y * width + x;
        if (layer.mask[maskIdx]) {
          // Found a visible pixel on this layer (which has attributes)
          return layer;
        }
      }
    }
  }

  return null;
}

/**
 * Gets the active layer
 * @returns {Layer|null}
 */
function getActiveLayer() {
  if (!layersEnabled || activeLayerIndex < 0 || activeLayerIndex >= layers.length) {
    return null;
  }
  return layers[activeLayerIndex];
}

/**
 * Sets a pixel on the active layer (with mask)
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk - true for ink, false for paper
 */
function setLayerPixel(x, y, isInk) {
  const layer = getActiveLayer();
  if (!layer) return;

  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const bitmapAddr = getBitmapAddress(x, y);
  const bitMask = 0x80 >> (x % 8);
  const maskIdx = y * width + x;

  // Set pixel in layer bitmap
  if (isInk) {
    layer.bitmap[bitmapAddr] |= bitMask;
  } else {
    layer.bitmap[bitmapAddr] &= ~bitMask & 0xFF;
  }

  // Mark pixel as visible
  layer.mask[maskIdx] = 1;
}

/**
 * Erases a pixel on the active layer (makes it transparent)
 * On background layer, paints with paper instead.
 * @param {number} x
 * @param {number} y
 */
function eraseLayerPixel(x, y) {
  const layer = getActiveLayer();
  if (!layer) return;

  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const maskIdx = y * width + x;

  if (activeLayerIndex === 0) {
    // Background layer: paint with paper (can't be transparent)
    const bitmapAddr = getBitmapAddress(x, y);
    const bitMask = 0x80 >> (x % 8);
    layer.bitmap[bitmapAddr] &= ~bitMask & 0xFF;

    // Gigascreen: also clear frame 2 bitmap
    if (isGigascreenEditable() && layer.bitmap2) {
      layer.bitmap2[bitmapAddr] &= ~bitMask & 0xFF;
    }
  } else {
    // Non-background layer: make transparent
    layer.mask[maskIdx] = 0;
  }
}

/**
 * Updates the layer panel UI
 */
function updateLayerPanel() {
  const panel = document.getElementById('layerList');
  const flattenBtn = document.getElementById('flattenLayersBtn');

  // Update button states
  const removeBtn = document.getElementById('removeLayerBtn');
  const moveUpBtn = document.getElementById('moveLayerUpBtn');
  const moveDownBtn = document.getElementById('moveLayerDownBtn');
  const saveProjectBtn = document.getElementById('saveProjectBtn');

  const hasLayers = layersEnabled && layers.length > 0;
  const hasMultipleLayers = layersEnabled && layers.length > 1;

  if (removeBtn) removeBtn.disabled = !hasMultipleLayers || activeLayerIndex === 0;
  if (moveUpBtn) moveUpBtn.disabled = !hasMultipleLayers || activeLayerIndex >= layers.length - 1;
  if (moveDownBtn) moveDownBtn.disabled = !hasMultipleLayers || activeLayerIndex <= 1;
  if (flattenBtn) flattenBtn.disabled = !hasMultipleLayers;
  if (saveProjectBtn) saveProjectBtn.disabled = !hasLayers;

  if (!panel) return;

  if (!hasLayers) {
    panel.innerHTML = '<div style="color: var(--text-tertiary); font-size: 10px; padding: 4px;">Click "+ Add" to create layers</div>';
    return;
  }

  let html = '';
  // Render from top to bottom (highest index first)
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const isActive = i === activeLayerIndex;
    const isBackground = i === 0;

    html += `<div class="layer-item${isActive ? ' active' : ''}" data-index="${i}">
      <span class="layer-visibility${layer.visible ? ' visible' : ''}" data-index="${i}" title="Toggle visibility">
        ${layer.visible ? '👁' : '○'}
      </span>
      <span class="layer-name">${layer.name}${isBackground ? ' (BG)' : ''}</span>
    </div>`;
  }
  panel.innerHTML = html;
}

/**
 * Updates only the layer button states (without rebuilding DOM)
 */
function updateLayerButtonStates() {
  const removeBtn = document.getElementById('removeLayerBtn');
  const moveUpBtn = document.getElementById('moveLayerUpBtn');
  const moveDownBtn = document.getElementById('moveLayerDownBtn');
  const flattenBtn = document.getElementById('flattenLayersBtn');

  const hasMultipleLayers = layersEnabled && layers.length > 1;

  if (removeBtn) removeBtn.disabled = !hasMultipleLayers || activeLayerIndex === 0;
  if (moveUpBtn) moveUpBtn.disabled = !hasMultipleLayers || activeLayerIndex >= layers.length - 1;
  if (moveDownBtn) moveDownBtn.disabled = !hasMultipleLayers || activeLayerIndex <= 1;
  if (flattenBtn) flattenBtn.disabled = !hasMultipleLayers;
}

/**
 * Shows or hides the layer section based on layers state
 */
function toggleLayerSectionVisibility() {
  const layerSection = document.getElementById('layerSection');
  if (layerSection) {
    // Show layer section for all editable formats
    const supportsLayers = isFormatEditable();
    layerSection.style.display = supportsLayers ? '' : 'none';
  }
}

/**
 * Flattens all layers into screenData, then resets layer system to initial state
 */
function flattenAllLayers() {
  if (!layersEnabled || layers.length === 0) return;

  // First flatten to screenData
  flattenLayersToScreen();

  // Reset layer system completely - back to "no layers" state
  layers = [];
  activeLayerIndex = 0;
  layersEnabled = false;

  // Collapse the layer controls
  const controls = document.getElementById('layerControls');
  const icon = document.getElementById('layerExpandIcon');
  if (controls) controls.style.display = 'none';
  if (icon) icon.textContent = '▶';

  updateLayerPanel();
}

/**
 * Saves project with layers to a .slp file (SpectraLab Project)
 */
function saveProject() {
  if (!screenData || !isFormatEditable()) {
    alert('No screen data to save');
    return;
  }

  // Ensure layers are flattened to screenData for rendering
  if (layersEnabled && layers.length > 0) {
    flattenLayersToScreen();
  }

  const hasBorder = formatHasBorder();
  const borderSize = getLayerBorderSize();
  const attrSize = getLayerAttributeSize();
  const bitmapSize = getLayerBitmapSize();

  const project = {
    version: 3, // Version 3: per-layer attributes
    format: currentFormat,
    fileName: currentFileName,
    width: getFormatWidth(),
    height: getFormatHeight(),
    hasBorder: hasBorder,
    layers: []
  };

  if (layersEnabled && layers.length > 0) {
    // Save all layers with per-layer attributes
    for (const layer of layers) {
      const layerData = {
        name: layer.name,
        visible: layer.visible,
        bitmap: arrayToBase64(layer.bitmap),
        mask: arrayToBase64(layer.mask)
      };

      // Include per-layer attributes if format supports them
      if (attrSize > 0 && layer.attributes) {
        layerData.attributes = arrayToBase64(layer.attributes);
        // BMC4 has second attribute bank
        if (currentFormat === FORMAT.BMC4 && layer.attributes2) {
          layerData.attributes2 = arrayToBase64(layer.attributes2);
        }
      }

      // Include border data if format supports it
      if (hasBorder && layer.borderData && layer.borderMask) {
        layerData.borderData = arrayToBase64(layer.borderData);
        layerData.borderMask = arrayToBase64(layer.borderMask);
      }

      project.layers.push(layerData);
    }
  } else {
    // No layers - save screenData as single background layer
    const width = getFormatWidth();
    const height = getFormatHeight();
    const mask = new Uint8Array(width * height);
    mask.fill(1);

    const layerData = {
      name: 'Background',
      visible: true,
      bitmap: arrayToBase64(screenData.slice(0, bitmapSize)),
      mask: arrayToBase64(mask)
    };

    // Include attributes if format supports them
    if (attrSize > 0) {
      if (currentFormat === FORMAT.BMC4) {
        // BMC4: two attribute banks
        layerData.attributes = arrayToBase64(screenData.slice(BMC4.ATTR1_OFFSET, BMC4.ATTR1_OFFSET + BMC4.ATTR1_SIZE));
        layerData.attributes2 = arrayToBase64(screenData.slice(BMC4.ATTR2_OFFSET, BMC4.ATTR2_OFFSET + BMC4.ATTR2_SIZE));
      } else {
        // SCR/BSC/IFL/MLT: single attribute bank
        layerData.attributes = arrayToBase64(screenData.slice(bitmapSize, bitmapSize + attrSize));
      }
    }

    // Include border data if format supports it
    if (hasBorder && borderSize > 0) {
      const borderOffset = getBorderDataOffset();
      const borderData = screenData.slice(borderOffset, borderOffset + borderSize);
      const borderMask = new Uint8Array(borderSize * 2);
      borderMask.fill(1);
      layerData.borderData = arrayToBase64(borderData);
      layerData.borderMask = arrayToBase64(borderMask);
    }

    project.layers.push(layerData);
  }

  // Include sprite sheet if available
  if (typeof getSpriteSheetForProject === 'function') {
    const spriteData = getSpriteSheetForProject();
    if (spriteData) {
      project.spriteSheet = spriteData;
    }
  }

  const json = JSON.stringify(project, null, 2);
  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'project';
  downloadFile(json, baseName + '.slp', 'application/json');

  // Reset modified flag after successful save
  if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
    openPictures[activePictureIndex].modified = false;
    updatePictureTabBar();
  }
}

/**
 * Loads project from a .slp file
 * @param {File} file
 */
function loadProject(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    try {
      const json = /** @type {string} */ (event.target?.result);
      const project = JSON.parse(json);

      if (!project.version || !project.format || !project.layers || project.layers.length === 0) {
        alert('Invalid project file');
        return;
      }

      // Stop any existing timers/animations
      if (typeof stopFlashTimer === 'function') stopFlashTimer();
      if (typeof resetScaState === 'function') resetScaState();

      // Restore format
      currentFormat = project.format;
      currentFileName = project.fileName || 'project.scr';

      // Calculate sizes based on format
      const bitmapSize = getLayerBitmapSize();
      const attrSize = getLayerAttributeSize();
      const hasBorder = project.hasBorder || formatHasBorder();
      const borderSize = hasBorder ? getLayerBorderSize() : 0;
      const borderOffset = hasBorder ? getBorderDataOffset() : 0;

      // Calculate total size based on format
      let totalSize;
      if (currentFormat === FORMAT.BMC4) {
        totalSize = BMC4.TOTAL_SIZE;
      } else if (currentFormat === FORMAT.BSC) {
        totalSize = BSC.TOTAL_SIZE;
      } else if (currentFormat === FORMAT.IFL) {
        totalSize = IFL.TOTAL_SIZE;
      } else if (currentFormat === FORMAT.MLT) {
        totalSize = MLT.TOTAL_SIZE;
      } else {
        totalSize = bitmapSize + attrSize;
      }
      if (hasBorder && borderSize > 0) {
        totalSize = Math.max(totalSize, borderOffset + borderSize);
      }

      // Create screenData
      screenData = new Uint8Array(totalSize);

      // Version 2 backward compatibility: restore global attributes from project
      // (will be overwritten by flattenAttributesToScreen if layers have attributes)
      if (project.version <= 2 && project.attributes) {
        const attrs = base64ToArray(project.attributes);
        if (currentFormat === FORMAT.BMC4) {
          // For BMC4, old format stored attrs at bitmapSize
          screenData.set(attrs.slice(0, BMC4.ATTR1_SIZE), BMC4.ATTR1_OFFSET);
          if (attrs.length > BMC4.ATTR1_SIZE) {
            screenData.set(attrs.slice(BMC4.ATTR1_SIZE, BMC4.ATTR1_SIZE + BMC4.ATTR2_SIZE), BMC4.ATTR2_OFFSET);
          }
        } else {
          screenData.set(attrs, bitmapSize);
        }
      }

      // Restore layers
      layers = [];
      const defaultAttr = buildAttribute(7, 0, false, false);
      const isVersion3 = project.version >= 3;

      for (let layerIdx = 0; layerIdx < project.layers.length; layerIdx++) {
        const layerData = project.layers[layerIdx];
        const isBackgroundLayer = layerIdx === 0;

        /** @type {Layer} */
        const layer = {
          name: layerData.name,
          visible: layerData.visible,
          bitmap: base64ToArray(layerData.bitmap),
          mask: base64ToArray(layerData.mask)
        };

        // Restore per-layer attributes
        if (attrSize > 0) {
          if (isVersion3 && layerData.attributes) {
            // Version 3: load per-layer attributes
            layer.attributes = base64ToArray(layerData.attributes);
            if (currentFormat === FORMAT.BMC4 && layerData.attributes2) {
              layer.attributes2 = base64ToArray(layerData.attributes2);
            } else if (currentFormat === FORMAT.BMC4) {
              // BMC4 missing attributes2 - create default
              layer.attributes2 = new Uint8Array(BMC4.ATTR2_SIZE);
              layer.attributes2.fill(defaultAttr);
            }
          } else {
            // Version 1/2: put global attributes in background layer only, default for others
            if (currentFormat === FORMAT.BMC4) {
              if (isBackgroundLayer && project.attributes) {
                const attrs = base64ToArray(project.attributes);
                layer.attributes = attrs.slice(0, BMC4.ATTR1_SIZE);
                layer.attributes2 = attrs.length > BMC4.ATTR1_SIZE
                  ? attrs.slice(BMC4.ATTR1_SIZE, BMC4.ATTR1_SIZE + BMC4.ATTR2_SIZE)
                  : new Uint8Array(BMC4.ATTR2_SIZE);
                if (!layer.attributes2 || layer.attributes2.length !== BMC4.ATTR2_SIZE) {
                  layer.attributes2 = new Uint8Array(BMC4.ATTR2_SIZE);
                  layer.attributes2.fill(defaultAttr);
                }
              } else {
                layer.attributes = new Uint8Array(BMC4.ATTR1_SIZE);
                layer.attributes.fill(defaultAttr);
                layer.attributes2 = new Uint8Array(BMC4.ATTR2_SIZE);
                layer.attributes2.fill(defaultAttr);
              }
            } else {
              if (isBackgroundLayer && project.attributes) {
                layer.attributes = base64ToArray(project.attributes);
              } else {
                layer.attributes = new Uint8Array(attrSize);
                layer.attributes.fill(defaultAttr);
              }
            }
          }
        }

        // Restore border data if available (version 2+)
        if (hasBorder && borderSize > 0) {
          if (layerData.borderData && layerData.borderMask) {
            layer.borderData = base64ToArray(layerData.borderData);
            layer.borderMask = base64ToArray(layerData.borderMask);
          } else {
            // Version 1 file or missing border data - create empty border
            layer.borderData = new Uint8Array(borderSize);
            layer.borderMask = new Uint8Array(borderSize * 2);
            // For background layer, mark as opaque
            if (isBackgroundLayer) {
              layer.borderMask.fill(1);
            }
          }
        }

        layers.push(layer);
      }

      activeLayerIndex = 0;
      layersEnabled = layers.length > 0;

      // Create internal picture format for SCR/ULA+ projects
      let projectPicture = null;
      if (typeof makePicture === 'function') {
        if (currentFormat === FORMAT.SCR || currentFormat === FORMAT.SCR_ULAPLUS || currentFormat === FORMAT.SCR_ULANEXT) {
          const sf = currentFormat === FORMAT.SCR_ULAPLUS ? 'scr+' : currentFormat === FORMAT.SCR_ULANEXT ? 'scr_ulanext' : 'scr';
          projectPicture = makePicture({
            sourceFormat: sf,
            fileName: currentFileName,
            width: 256,
            height: 192,
            attrCellHeight: 8,
            planeCount: 1,
            palette: (currentFormat === FORMAT.SCR_ULAPLUS && ulaPlusPalette)
              ? ulaPlusPalette.slice() : null
          });
          // Sync from screenData to populate the linear bitmap
          if (typeof syncPictureFromScreenData === 'function') {
            syncPictureFromScreenData(screenData, projectPicture);
          }
        }
      }

      // Flatten to screenData for rendering
      if (layersEnabled) {
        // Temporarily set currentPicture for flattenLayersToScreen's syncCurrentPicture call
        currentPicture = projectPicture;
        flattenLayersToScreen();
        projectPicture = currentPicture; // pick up synced version
      } else if (projectPicture) {
        syncPictureFromScreenData(screenData, projectPicture);
      }

      // Reset undo/redo
      undoStack = [];
      redoStack = [];

      // Update UI
      if (typeof toggleScaControlsVisibility === 'function') toggleScaControlsVisibility();
      if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
      if (typeof updateFileInfo === 'function') updateFileInfo();

      toggleLayerSectionVisibility();
      updateLayerPanel();

      // Expand layer controls if we have layers
      if (layersEnabled && layers.length > 1) {
        const controls = document.getElementById('layerControls');
        const icon = document.getElementById('layerExpandIcon');
        if (controls) controls.style.display = '';
        if (icon) icon.textContent = '▼';
      }

      // Add to multi-picture system
      const result = addPicture(currentFileName, currentFormat, screenData, projectPicture);
      if (result >= 0) {
        // Update the picture's layers in the openPictures array
        openPictures[result].layers = deepCloneLayers(layers);
        openPictures[result].activeLayerIndex = activeLayerIndex;
        openPictures[result].layersEnabled = layersEnabled;
      }

      // Restore sprite sheet if present
      if (project.spriteSheet && typeof restoreSpriteSheetFromProject === 'function') {
        restoreSpriteSheetFromProject(project.spriteSheet);
      }

      renderScreen();
      updatePictureTabBar();
      if (typeof updateEditorState === 'function') updateEditorState();

    } catch (e) {
      alert('Error loading project: ' + e.message);
    }
  });

  reader.readAsText(file);
}

/**
 * Converts Uint8Array to base64 string
 * @param {Uint8Array} arr
 * @returns {string}
 */
function arrayToBase64(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

/**
 * Converts base64 string to Uint8Array
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64ToArray(base64) {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

// ============================================================================
// Workspace Save/Load (All Open Pictures)
// ============================================================================

/**
 * Saves all open pictures to a workspace file (.slw)
 */
function saveWorkspace() {
  if (openPictures.length === 0) {
    alert('No pictures open to save');
    return;
  }

  // Save current picture state first
  saveCurrentPictureState();

  const workspace = {
    version: 2,
    type: 'workspace',
    activePictureIndex: activePictureIndex,
    pictures: [],
    // Workspace-level settings (from screen_viewer.js)
    settings: {
      currentPaletteId: typeof currentPaletteId !== 'undefined' ? currentPaletteId : 'default',
      borderColor: typeof borderColor !== 'undefined' ? borderColor : 0,
      borderSize: typeof borderSize !== 'undefined' ? borderSize : 24,
      gridSize: typeof gridSize !== 'undefined' ? gridSize : 8,
      subgridSize: typeof subgridSize !== 'undefined' ? subgridSize : 0,
      borderGridSize: typeof borderGridSize !== 'undefined' ? borderGridSize : 0,
      borderSubgridSize: typeof borderSubgridSize !== 'undefined' ? borderSubgridSize : 0,
      showAttributes: typeof showAttributes !== 'undefined' ? showAttributes : true,
      // Display filter settings
      displayFilters: typeof getFilterSettings === 'function' ? getFilterSettings() : undefined,
      // Reference image settings
      referenceImage: getReferenceImageDataURL(),
      referenceOpacity: referenceOpacity,
      referenceOffsetX: referenceOffsetX,
      referenceOffsetY: referenceOffsetY,
      referenceWidth: referenceWidth,
      referenceHeight: referenceHeight,
      showReference: showReference
    }
  };

  // Save each picture
  for (const pic of openPictures) {
    const picData = {
      fileName: pic.fileName,
      format: pic.format,
      screenData: arrayToBase64(pic.screenData),
      zoom: pic.zoom,
      modified: pic.modified,
      layersEnabled: pic.layersEnabled,
      activeLayerIndex: pic.activeLayerIndex,
      layers: [],
      // Per-picture editor settings
      inkColor: pic.inkColor,
      paperColor: pic.paperColor,
      bright: pic.bright,
      flash: pic.flash,
      currentTool: pic.currentTool,
      brushSize: pic.brushSize,
      brushShape: pic.brushShape,
      scrollTop: pic.scrollTop,
      scrollLeft: pic.scrollLeft
    };

    // Save layers if enabled
    if (pic.layers && pic.layers.length > 0) {
      for (const layer of pic.layers) {
        const layerData = {
          name: layer.name,
          visible: layer.visible,
          bitmap: arrayToBase64(layer.bitmap),
          mask: arrayToBase64(layer.mask)
        };
        // Save per-layer attributes
        if (layer.attributes) {
          layerData.attributes = arrayToBase64(layer.attributes);
        }
        if (layer.attributes2) {
          layerData.attributes2 = arrayToBase64(layer.attributes2);
        }
        if (layer.borderData) {
          layerData.borderData = arrayToBase64(layer.borderData);
        }
        if (layer.borderMask) {
          layerData.borderMask = arrayToBase64(layer.borderMask);
        }
        picData.layers.push(layerData);
      }
    }

    workspace.pictures.push(picData);
  }

  // Save sprite sheet
  if (typeof getSpriteSheetForProject === 'function') {
    const spriteData = getSpriteSheetForProject();
    if (spriteData) {
      workspace.spriteSheet = spriteData;
    }
  }

  const json = JSON.stringify(workspace, null, 2);
  downloadFile(json, 'workspace.slw', 'application/json');

  // Mark all pictures as unmodified after save
  for (const pic of openPictures) {
    pic.modified = false;
  }
  updatePictureTabBar();
}

/**
 * Loads a workspace file (.slw) containing multiple pictures
 * @param {File} file
 */
function loadWorkspace(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    try {
      const json = /** @type {string} */ (event.target?.result);
      const workspace = JSON.parse(json);

      if (!workspace.version || workspace.type !== 'workspace' || !workspace.pictures) {
        alert('Invalid workspace file');
        return;
      }

      if (workspace.pictures.length === 0) {
        alert('Workspace contains no pictures');
        return;
      }

      // Check if we have unsaved changes
      const hasModified = openPictures.some(p => p.modified);
      if (hasModified) {
        if (!confirm('Current pictures have unsaved changes. Load workspace anyway?')) {
          return;
        }
      }

      // Stop any existing timers/animations
      if (typeof stopFlashTimer === 'function') stopFlashTimer();
      if (typeof resetScaState === 'function') resetScaState();

      // Clear existing pictures
      openPictures = [];
      activePictureIndex = -1;

      // Load each picture
      for (const picData of workspace.pictures) {
        /** @type {PictureState} */
        const pic = {
          id: nextPictureId++,
          fileName: picData.fileName || 'untitled',
          format: picData.format || FORMAT.SCR,
          screenData: base64ToArray(picData.screenData),
          undoStack: [],
          redoStack: [],
          layers: [],
          activeLayerIndex: picData.activeLayerIndex || 0,
          layersEnabled: picData.layersEnabled || false,
          modified: false, // Fresh load = not modified
          zoom: picData.zoom || 2,
          // Per-picture editor settings with defaults
          inkColor: picData.inkColor !== undefined ? picData.inkColor : 7,
          paperColor: picData.paperColor !== undefined ? picData.paperColor : 0,
          bright: picData.bright !== undefined ? picData.bright : false,
          flash: picData.flash !== undefined ? picData.flash : false,
          currentTool: picData.currentTool || EDITOR.TOOL_PIXEL,
          brushSize: picData.brushSize || 1,
          brushShape: picData.brushShape || 'square',
          scrollTop: picData.scrollTop || 0,
          scrollLeft: picData.scrollLeft || 0
        };

        // Load layers if present
        if (picData.layers && picData.layers.length > 0) {
          for (const layerData of picData.layers) {
            /** @type {Layer} */
            const layer = {
              name: layerData.name,
              visible: layerData.visible,
              bitmap: base64ToArray(layerData.bitmap),
              mask: base64ToArray(layerData.mask)
            };
            // Load per-layer attributes
            if (layerData.attributes) {
              layer.attributes = base64ToArray(layerData.attributes);
            }
            if (layerData.attributes2) {
              layer.attributes2 = base64ToArray(layerData.attributes2);
            }
            if (layerData.borderData) {
              layer.borderData = base64ToArray(layerData.borderData);
            }
            if (layerData.borderMask) {
              layer.borderMask = base64ToArray(layerData.borderMask);
            }
            pic.layers.push(layer);
          }
        }

        openPictures.push(pic);
      }

      // Switch to the saved active picture index
      let targetIndex = workspace.activePictureIndex || 0;
      if (targetIndex >= openPictures.length) targetIndex = 0;

      // Load the active picture into globals
      const pic = openPictures[targetIndex];
      screenData = pic.screenData.slice();
      currentFileName = pic.fileName;
      currentFormat = pic.format;
      undoStack = [];
      redoStack = [];
      layers = deepCloneLayers(pic.layers);
      activeLayerIndex = pic.activeLayerIndex;
      layersEnabled = pic.layersEnabled;
      activePictureIndex = targetIndex;

      // Restore zoom
      if (typeof zoom !== 'undefined') {
        zoom = pic.zoom;
        const zoomSelect = document.getElementById('zoomSelect');
        if (zoomSelect) {
          /** @type {HTMLSelectElement} */ (zoomSelect).value = String(zoom);
        }
      }

      // Restore per-picture editor settings
      editorInkColor = pic.inkColor;
      editorPaperColor = pic.paperColor;
      editorBright = pic.bright;
      editorFlash = pic.flash;
      updateColorSelectors();
      setEditorTool(pic.currentTool);
      setBrushSize(pic.brushSize);
      setBrushShape(pic.brushShape);

      // Restore canvas scroll position (defer to allow canvas resize)
      setTimeout(() => {
        const container = document.getElementById('canvasContainer');
        if (container) {
          container.scrollTop = pic.scrollTop;
          container.scrollLeft = pic.scrollLeft;
        }
      }, 0);

      // Restore workspace-level settings (if present, version 2+)
      if (workspace.settings) {
        const s = workspace.settings;
        // Palette
        if (typeof currentPaletteId !== 'undefined' && s.currentPaletteId !== undefined) {
          currentPaletteId = s.currentPaletteId;
          const paletteSelect = document.getElementById('paletteSelect');
          if (paletteSelect) /** @type {HTMLSelectElement} */ (paletteSelect).value = currentPaletteId;
        }
        // Border color
        if (typeof borderColor !== 'undefined' && s.borderColor !== undefined) {
          borderColor = s.borderColor;
          const borderColorSel = document.getElementById('borderColorSelect');
          if (borderColorSel) /** @type {HTMLSelectElement} */ (borderColorSel).value = String(borderColor);
        }
        // Border size
        if (typeof borderSize !== 'undefined' && s.borderSize !== undefined) {
          borderSize = s.borderSize;
          const borderSizeSel = document.getElementById('borderSizeSelect');
          if (borderSizeSel) /** @type {HTMLSelectElement} */ (borderSizeSel).value = String(borderSize);
        }
        // Grid settings
        if (typeof gridSize !== 'undefined' && s.gridSize !== undefined) {
          gridSize = s.gridSize;
          const gridSizeSel = document.getElementById('gridSizeSelect');
          if (gridSizeSel) /** @type {HTMLSelectElement} */ (gridSizeSel).value = String(gridSize);
        }
        if (typeof subgridSize !== 'undefined' && s.subgridSize !== undefined) {
          subgridSize = s.subgridSize;
          const subgridSizeSel = document.getElementById('subgridSizeSelect');
          if (subgridSizeSel) /** @type {HTMLSelectElement} */ (subgridSizeSel).value = String(subgridSize);
        }
        // Border grid settings
        if (typeof borderGridSize !== 'undefined' && s.borderGridSize !== undefined) {
          borderGridSize = s.borderGridSize;
          const borderGridSizeSel = document.getElementById('borderGridSizeSelect');
          if (borderGridSizeSel) /** @type {HTMLSelectElement} */ (borderGridSizeSel).value = String(borderGridSize);
        }
        if (typeof borderSubgridSize !== 'undefined' && s.borderSubgridSize !== undefined) {
          borderSubgridSize = s.borderSubgridSize;
          const borderSubgridSizeSel = document.getElementById('borderSubgridSizeSelect');
          if (borderSubgridSizeSel) /** @type {HTMLSelectElement} */ (borderSubgridSizeSel).value = String(borderSubgridSize);
        }
        // Show attributes
        if (typeof showAttributes !== 'undefined' && s.showAttributes !== undefined) {
          showAttributes = s.showAttributes;
          const showAttrsCb = document.getElementById('showAttrsCheckbox');
          if (showAttrsCb) /** @type {HTMLInputElement} */ (showAttrsCb).checked = showAttributes;
        }
        // Display filter settings
        if (s.displayFilters && typeof applyFilterSettings === 'function') {
          applyFilterSettings(s.displayFilters);
        }
        // Reference image settings
        if (s.referenceOpacity !== undefined) {
          referenceOpacity = s.referenceOpacity;
        }
        if (s.referenceOffsetX !== undefined) {
          referenceOffsetX = s.referenceOffsetX;
        }
        if (s.referenceOffsetY !== undefined) {
          referenceOffsetY = s.referenceOffsetY;
        }
        if (s.referenceWidth !== undefined) {
          referenceWidth = s.referenceWidth;
        }
        if (s.referenceHeight !== undefined) {
          referenceHeight = s.referenceHeight;
        }
        if (s.showReference !== undefined) {
          showReference = s.showReference;
        }
        if (s.referenceImage) {
          loadReferenceImageFromDataURL(s.referenceImage);
        } else {
          referenceImage = null;
        }
        updateReferenceUI();
      }

      // Create internal picture format for SCR/ULA+ workspace pictures
      if (typeof makePicture === 'function') {
        if (currentFormat === FORMAT.SCR || currentFormat === FORMAT.SCR_ULAPLUS || currentFormat === FORMAT.SCR_ULANEXT) {
          const sf = currentFormat === FORMAT.SCR_ULAPLUS ? 'scr+' : currentFormat === FORMAT.SCR_ULANEXT ? 'scr_ulanext' : 'scr';
          currentPicture = makePicture({
            sourceFormat: sf,
            fileName: currentFileName,
            width: 256,
            height: 192,
            attrCellHeight: 8,
            planeCount: 1
          });
        } else {
          currentPicture = null;
        }
      }

      // Also set picture on all loaded PictureState objects
      for (const p of openPictures) {
        if (typeof importScr === 'function') {
          if (p.format === FORMAT.SCR || p.format === FORMAT.SCR_ULANEXT) {
            p.picture = importScr(p.screenData, p.fileName);
          } else if (p.format === FORMAT.SCR_ULAPLUS) {
            p.picture = importScrUlaPlus(p.screenData, p.fileName);
          } else {
            p.picture = null;
          }
        }
      }

      // Flatten layers to screenData if needed (also syncs currentPicture)
      if (layersEnabled && layers.length > 0) {
        flattenLayersToScreen();
      } else {
        syncCurrentPicture();
      }

      // Restore sprite sheet
      if (workspace.spriteSheet && typeof restoreSpriteSheetFromProject === 'function') {
        restoreSpriteSheetFromProject(workspace.spriteSheet);
      }

      // Update UI
      if (typeof toggleScaControlsVisibility === 'function') toggleScaControlsVisibility();
      if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
      if (typeof updateFileInfo === 'function') updateFileInfo();

      toggleLayerSectionVisibility();
      updateLayerPanel();
      updatePictureTabBar();
      renderScreen();

      if (typeof updateEditorState === 'function') updateEditorState();

    } catch (e) {
      alert('Error loading workspace: ' + e.message);
    }
  });

  reader.readAsText(file);
}

// ============================================================================
// Drawing Functions
// ============================================================================

/**
 * Stamps brush pattern centered on (x, y)
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {boolean} isInk
 */
function stampBrush(cx, cy, isInk) {
  // Custom brush: stamp variable-size pattern centered on cursor
  // Skip this path in masked mode - custom brush is only used as mask pattern, not brush shape
  const brush = getActiveBrush();
  if (brushShape === 'custom' && brush && brushPaintMode !== 'masked' && brushPaintMode !== 'masked+') {
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);
    const offsetX = Math.floor(bw / 2);
    const offsetY = Math.floor(bh / 2);
    const hasMask = brush.mask && brush.mask.length > 0;

    for (let r = 0; r < bh; r++) {
      for (let c = 0; c < bw; c++) {
        const px = cx + c - offsetX;
        const py = cy + r - offsetY;
        const byteIdx = r * bytesPerRow + Math.floor(c / 8);
        const bitIdx = 7 - (c % 8);
        const brushBit = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
        const maskBit = hasMask ? (brush.mask[byteIdx] & (1 << bitIdx)) !== 0 : true;

        // Skip transparent pixels (mask bit = 0)
        if (!maskBit) continue;

        if (brushPaintMode === 'masked' || brushPaintMode === 'masked+') {
          // Masked: paint through tiled mask pattern (ink where set, paper where not)
          const patternSet = getMaskPatternAt(px, py);
          if (patternSet === null) {
            // Transparent in mask - skip
          } else if (isGigascreenEditable()) {
            // Gigascreen: use mouse button for color, only paint where pattern is set
            if (patternSet) {
              setPixel(screenData, px, py, isInk);
            }
          } else if (patternSet) {
            setPixel(screenData, px, py, true);  // Ink
          } else {
            setPixel(screenData, px, py, false); // Paper
          }
        } else if (brushPaintMode === 'replace') {
          // Replace: overwrite every visible pixel in the brush
          // brushBit determines ink/paper at each pixel position
          setPixel(screenData, px, py, brushBit);
        } else if (brushPaintMode === 'invert') {
          // Invert: toggle screen pixel where brush bit is set
          if (brushBit) {
            const current = getPixel(screenData, px, py);
            setPixel(screenData, px, py, !current);
          }
        } else if (brushPaintMode === 'recolor') {
          // Recolor: only update attributes where brush bit is set
          if (brushBit) {
            setPixelAttributeOnly(screenData, px, py);
          }
        } else if (brushPaintMode === 'retouch') {
          // Retouch: only update bitmap where brush bit is set
          if (brushBit) {
            setPixelBitmapOnly(screenData, px, py, isInk);
          }
        } else {
          // Set (default): paint ink/paper where brush bit is set
          if (brushBit) {
            setPixel(screenData, px, py, isInk);
          }
        }
      }
    }
    return;
  }

  // Helper to apply pixel based on paint mode
  const applyPixel = (x, y, ink) => {
    // In masked mode, paint through tiled mask pattern (ink where set, paper where not)
    if (brushPaintMode === 'masked' || brushPaintMode === 'masked+') {
      const patternSet = getMaskPatternAt(x, y);
      if (patternSet === null) return; // Skip if transparent in mask
      // For Gigascreen: use mouse button (ink param) to select primary/secondary color,
      // mask pattern determines ink vs paper within that
      if (isGigascreenEditable()) {
        // In Gigascreen, paint with selected color (primary/secondary) where mask is set
        // Skip where mask is not set (patternSet === false)
        if (patternSet) {
          setPixel(screenData, x, y, ink);
        }
      } else {
        setPixel(screenData, x, y, patternSet); // true = ink, false = paper
      }
      return;
    }

    if (brushPaintMode === 'recolor') {
      setPixelAttributeOnly(screenData, x, y);
    } else if (brushPaintMode === 'retouch') {
      setPixelBitmapOnly(screenData, x, y, ink);
    } else {
      setPixel(screenData, x, y, ink);
    }
  };

  if (brushSize <= 1) {
    applyPixel(cx, cy, isInk);
    return;
  }

  const n = brushSize;
  // Center brush on cursor (for odd sizes: exact center; for even: cursor at center-bottom-right)
  const offset = Math.floor(n / 2);

  if (brushShape === 'stroke') {
    // Diagonal line from top-right to bottom-left (like /)
    for (let i = 0; i < n; i++) {
      applyPixel(cx + (n - 1 - i) - offset, cy + i - offset, isInk);
    }
  } else if (brushShape === 'bstroke') {
    // Mirrored diagonal line from top-left to bottom-right (like \)
    for (let i = 0; i < n; i++) {
      applyPixel(cx + i - offset, cy + i - offset, isInk);
    }
  } else if (brushShape === 'hline') {
    // Horizontal line, N pixels wide
    for (let dx = 0; dx < n; dx++) {
      applyPixel(cx + dx - offset, cy, isInk);
    }
  } else if (brushShape === 'vline') {
    // Vertical line, N pixels tall
    for (let dy = 0; dy < n; dy++) {
      applyPixel(cx, cy + dy - offset, isInk);
    }
  } else if (brushShape === 'round') {
    const radius = (n - 0.5) / 2;
    const centerOff = (n - 1) / 2;
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        const dist = Math.sqrt((dx - centerOff) ** 2 + (dy - centerOff) ** 2);
        if (dist <= radius) {
          applyPixel(cx + dx - offset, cy + dy - offset, isInk);
        }
      }
    }
  } else {
    // Square: fill NxN grid
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        applyPixel(cx + dx - offset, cy + dy - offset, isInk);
      }
    }
  }
}

/**
 * Stamps eraser brush centered on (x, y) - makes pixels transparent on non-background layers
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 */
function stampEraser(cx, cy) {
  if (!layersEnabled) {
    // Without layers, eraser just paints paper color
    stampBrush(cx, cy, false);
    return;
  }

  const width = getFormatWidth();
  const height = getFormatHeight();

  // Custom brush eraser
  const brush = getActiveBrush();
  if (brushShape === 'custom' && brush) {
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);
    const offsetX = Math.floor(bw / 2);
    const offsetY = Math.floor(bh / 2);
    const hasMask = brush.mask && brush.mask.length > 0;

    for (let r = 0; r < bh; r++) {
      for (let c = 0; c < bw; c++) {
        const px = cx + c - offsetX;
        const py = cy + r - offsetY;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const byteIdx = r * bytesPerRow + Math.floor(c / 8);
        const bitIdx = 7 - (c % 8);
        const brushBit = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
        const maskBit = hasMask ? (brush.mask[byteIdx] & (1 << bitIdx)) !== 0 : true;

        // Only erase where mask is visible and brush bit is set
        if (maskBit && brushBit) {
          eraseLayerPixel(px, py);
        }
      }
    }
    flattenLayersToScreen();
    return;
  }

  if (brushSize <= 1) {
    eraseLayerPixel(cx, cy);
    flattenLayersToScreen();
    return;
  }

  const n = brushSize;
  // Center brush on cursor (for odd sizes: exact center; for even: cursor at center-bottom-right)
  const offset = Math.floor(n / 2);

  if (brushShape === 'stroke') {
    for (let i = 0; i < n; i++) {
      eraseLayerPixel(cx + (n - 1 - i) - offset, cy + i - offset);
    }
  } else if (brushShape === 'bstroke') {
    for (let i = 0; i < n; i++) {
      eraseLayerPixel(cx + i - offset, cy + i - offset);
    }
  } else if (brushShape === 'hline') {
    for (let dx = 0; dx < n; dx++) {
      eraseLayerPixel(cx + dx - offset, cy);
    }
  } else if (brushShape === 'vline') {
    for (let dy = 0; dy < n; dy++) {
      eraseLayerPixel(cx, cy + dy - offset);
    }
  } else if (brushShape === 'round') {
    const radius = (n - 0.5) / 2;
    const centerOff = (n - 1) / 2;
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        const dist = Math.sqrt((dx - centerOff) ** 2 + (dy - centerOff) ** 2);
        if (dist <= radius) {
          eraseLayerPixel(cx + dx - offset, cy + dy - offset);
        }
      }
    }
  } else {
    // Square
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        eraseLayerPixel(cx + dx - offset, cy + dy - offset);
      }
    }
  }
  flattenLayersToScreen();
}

/**
 * Draws eraser at a single point
 * @param {number} x
 * @param {number} y
 */
function drawEraser(x, y) {
  if (!screenData || !isFormatEditable()) return;
  stampEraser(x, y);
}

/**
 * Draws eraser line using Bresenham's algorithm
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function drawEraserLine(x0, y0, x1, y1) {
  const brush = getActiveBrush();
  const hasCustomBrush = brushShape === 'custom' && brush;

  if (hasCustomBrush) {
    const ldx = x1 - x0;
    const ldy = y1 - y0;
    const dist = Math.sqrt(ldx * ldx + ldy * ldy);
    if (dist === 0) {
      drawEraser(x0, y0);
      return;
    }
    const stepSize = Math.abs(ldx) >= Math.abs(ldy) ? brush.width : brush.height;
    const steps = Math.max(1, Math.round(dist / stepSize));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + ldx * t);
      const y = Math.round(y0 + ldy * t);
      drawEraser(x, y);
    }
    return;
  }

  // Standard Bresenham pixel-by-pixel for regular brushes
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    drawEraser(x, y);

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Draws a single pixel with current settings
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk
 */
function drawPixel(x, y, isInk) {
  if (!screenData || !isFormatEditable()) return;
  stampBrush(x, y, isInk);
}

/**
 * Draws a line using Bresenham's algorithm
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {boolean} isInk
 */
function drawLine(x0, y0, x1, y1, isInk) {
  // For masked mode, ALWAYS use pixel-by-pixel Bresenham for continuous lines
  if (brushPaintMode === 'masked' || brushPaintMode === 'masked+') {
    // Skip to Bresenham below
  } else {
    // For custom brushes in non-masked modes, step at brush-sized intervals
    const brush = getActiveBrush();
    const hasCustomBrush = brushShape === 'custom' && brush;
    if (hasCustomBrush) {
      // Step at brush-sized intervals to avoid overlapping stamps destroying each other in replace mode
      const ldx = x1 - x0;
      const ldy = y1 - y0;
      const dist = Math.sqrt(ldx * ldx + ldy * ldy);
      if (dist === 0) {
        drawPixel(x0, y0, isInk);
        return;
      }
      // Use brush width for horizontal-ish lines, brush height for vertical-ish
      const stepSize = Math.abs(ldx) >= Math.abs(ldy) ? brush.width : brush.height;
      const steps = Math.max(1, Math.round(dist / stepSize));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(x0 + ldx * t);
        const y = Math.round(y0 + ldy * t);
        drawPixel(x, y, isInk);
      }
      return;
    }
  }

  // Standard Bresenham pixel-by-pixel for regular brushes and masked mode
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    drawPixel(x, y, isInk);

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Draws a rectangle outline
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {boolean} isInk
 */
function drawRect(x0, y0, x1, y1, isInk) {
  // Normalize coordinates
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  // Draw four lines
  drawLine(left, top, right, top, isInk);      // Top
  drawLine(left, bottom, right, bottom, isInk); // Bottom
  drawLine(left, top, left, bottom, isInk);     // Left
  drawLine(right, top, right, bottom, isInk);   // Right
}

/**
 * Draws an ellipse outline using midpoint ellipse algorithm
 * @param {number} x0 - Start X (corner of bounding box)
 * @param {number} y0 - Start Y (corner of bounding box)
 * @param {number} x1 - End X (corner of bounding box)
 * @param {number} y1 - End Y (corner of bounding box)
 * @param {boolean} isInk
 */
function drawCircle(x0, y0, x1, y1, isInk) {
  // Calculate center and radii from bounding box
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;

  if (rx < 0.5 || ry < 0.5) {
    // Too small, just draw a pixel
    drawPixel(Math.round(cx), Math.round(cy), isInk);
    return;
  }

  // Collect all unique ellipse outline pixels first
  const pixels = new Set();

  // Use parametric approach with enough steps to not miss any pixels
  // Step size based on larger radius to ensure we hit every pixel
  const maxRadius = Math.max(rx, ry);
  const steps = Math.ceil(maxRadius * 8); // 8 steps per pixel of radius ensures coverage

  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const px = Math.round(cx + rx * Math.cos(angle));
    const py = Math.round(cy + ry * Math.sin(angle));
    pixels.add(`${px},${py}`);
  }

  // Also use midpoint algorithm to catch any pixels the parametric might miss
  let x = 0;
  let y = Math.round(ry);
  const rx2 = rx * rx;
  const ry2 = ry * ry;

  const addSymmetric = (px, py) => {
    pixels.add(`${Math.round(cx + px)},${Math.round(cy + py)}`);
    pixels.add(`${Math.round(cx - px)},${Math.round(cy + py)}`);
    pixels.add(`${Math.round(cx + px)},${Math.round(cy - py)}`);
    pixels.add(`${Math.round(cx - px)},${Math.round(cy - py)}`);
  };

  // Region 1
  let dx = 2 * ry2 * x;
  let dy = 2 * rx2 * y;
  let d1 = ry2 - rx2 * ry + 0.25 * rx2;

  while (dx < dy) {
    addSymmetric(x, y);
    x++;
    dx += 2 * ry2;
    if (d1 < 0) {
      d1 += dx + ry2;
    } else {
      y--;
      dy -= 2 * rx2;
      d1 += dx - dy + ry2;
    }
  }

  // Region 2
  let d2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;

  while (y >= 0) {
    addSymmetric(x, y);
    y--;
    dy -= 2 * rx2;
    if (d2 > 0) {
      d2 += rx2 - dy;
    } else {
      x++;
      dx += 2 * ry2;
      d2 += dx - dy + rx2;
    }
  }

  // Now draw all collected pixels
  for (const key of pixels) {
    const [px, py] = key.split(',').map(Number);
    drawPixel(px, py, isInk);
  }
}

/**
 * Sprays random pixels within a circular radius using the current brush
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {boolean} isInk
 */
function drawAirbrush(cx, cy, isInk, prevPos) {
  const radius = airbrushRadius;
  const isMasked = brushPaintMode === 'masked' || brushPaintMode === 'masked+';

  // When prevPos is given and far enough, spread spray centers along the movement path.
  // Same point count — just distributed along the path to fill gaps.
  let pathDx = 0, pathDy = 0, spreadAlongPath = false;
  if (prevPos) {
    pathDx = cx - prevPos.x;
    pathDy = cy - prevPos.y;
    const pathLen = Math.sqrt(pathDx * pathDx + pathDy * pathDy);
    spreadAlongPath = pathLen > radius * 0.5;
  }

  // For masked mode, spray through mask pattern (only paint ink where mask is set)
  // This gives a "spray through stencil" effect - gradual buildup without overwriting
  if (isMasked) {
    const n = Math.max(1, brushSize);
    const offset = Math.floor(n / 2);
    const numPoints = Math.ceil(radius * radius * Math.PI * airbrushDensity / (n * n));

    for (let i = 0; i < numPoints; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), airbrushFalloff) * radius;
      let scx = cx, scy = cy;
      if (spreadAlongPath) {
        const t = Math.random();
        scx = prevPos.x + pathDx * t;
        scy = prevPos.y + pathDy * t;
      }
      const sprayX = Math.round(scx + dist * Math.cos(angle));
      const sprayY = Math.round(scy + dist * Math.sin(angle));

      // Stamp brush-shaped area, but only paint ink where mask pattern allows
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) {
          const px = sprayX + dx - offset;
          const py = sprayY + dy - offset;

          // For round brush, check if within circle
          if (brushShape === 'round') {
            const centerOff = (n - 1) / 2;
            const distFromCenter = Math.sqrt((dx - centerOff) ** 2 + (dy - centerOff) ** 2);
            if (distFromCenter > (n - 0.5) / 2) continue;
          }

          // Check mask pattern - only paint where mask is ink (true)
          const patternSet = getMaskPatternAt(px, py);
          if (patternSet === true) {
            setPixel(screenData, px, py, isInk);
          }
          // Skip if false or null - don't paint paper, leave existing pixels
        }
      }
    }
    return;
  }

  // Calculate number of points based on area and density, scaled by brush size
  const numPoints = Math.ceil(radius * radius * Math.PI * airbrushDensity / (brushSize * brushSize));

  for (let i = 0; i < numPoints; i++) {
    // Random angle and distance within circle
    const angle = Math.random() * Math.PI * 2;
    // Apply falloff: power > 1 concentrates particles toward center
    // power = 1: uniform, power = 2: soft falloff, power = 3: medium, power = 4: hard
    const dist = Math.pow(Math.random(), airbrushFalloff) * radius;
    let scx = cx, scy = cy;
    if (spreadAlongPath) {
      const t = Math.random();
      scx = prevPos.x + pathDx * t;
      scy = prevPos.y + pathDy * t;
    }
    const px = Math.round(scx + dist * Math.cos(angle));
    const py = Math.round(scy + dist * Math.sin(angle));
    // Use existing stampBrush to respect brush size and shape
    stampBrush(px, py, isInk);
  }
}

// ============================================================================
// Deferred Stroke for Big Pictures
// ============================================================================

/**
 * Returns true if deferred stroke mode should be used.
 * Needed when big picture is at fractional zoom — mouse events skip many image pixels.
 * At zoom >= 1, mouse events are close enough for immediate drawing.
 * Canvas clearing is viewport-clipped so high zoom on big pictures stays fast.
 * @returns {boolean}
 */
function useDeferredStroke() {
  if (!currentPicture) return false;
  if (currentPicture.width <= 512 && currentPicture.height <= 512) return false;
  return zoom < 1;
}

/**
 * Catmull-Rom spline interpolation between collected path points.
 * Generates a smooth curve through all control points.
 * @param {{x: number, y: number}[]} points
 * @returns {{x: number, y: number}[]}
 */
function interpolateStrokePath(points) {
  if (points.length < 2) return points.slice();
  if (points.length === 2) return points.slice();

  const result = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(segLen));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      result.push({ x: Math.round(x), y: Math.round(y) });
    }
  }

  return result;
}

/**
 * Draws a smooth Catmull-Rom preview of the deferred stroke path on the canvas.
 */
function drawDeferredStrokePreview() {
  if (!deferredStrokePath || deferredStrokePath.length < 2) return;
  const ctx = screenCanvas.getContext('2d');
  const bpx = borderSize * zoom;
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  // Interpolate for smooth preview
  const smooth = interpolateStrokePath(deferredStrokePath);

  ctx.save();
  ctx.strokeStyle = deferredStrokeIsInk ? '#ffffff' : '#000000';
  ctx.lineWidth = Math.max(1, zoom * 0.5);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(smooth[0].x * zoom + bpx + zoom / 2, smooth[0].y * zoomY + bpx + zoomY / 2);
  for (let i = 1; i < smooth.length; i++) {
    ctx.lineTo(smooth[i].x * zoom + bpx + zoom / 2, smooth[i].y * zoomY + bpx + zoomY / 2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a single new segment of the deferred stroke preview (incremental, no full re-render).
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 */
function drawDeferredStrokeSegment(from, to) {
  const ctx = screenCanvas.getContext('2d');
  const bpx = borderSize * zoom;
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  ctx.save();
  ctx.strokeStyle = deferredStrokeIsInk ? '#ffffff' : '#000000';
  ctx.lineWidth = Math.max(1, zoom * 0.5);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(from.x * zoom + bpx + zoom / 2, from.y * zoomY + bpx + zoomY / 2);
  ctx.lineTo(to.x * zoom + bpx + zoom / 2, to.y * zoomY + bpx + zoomY / 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Commits the deferred stroke — interpolates the path and draws actual pixels.
 */
function commitDeferredStroke() {
  if (!deferredStrokePath || deferredStrokePath.length === 0) return;

  const path = interpolateStrokePath(deferredStrokePath);
  const isInk = deferredStrokeIsInk;
  const tool = deferredStrokeTool;

  if (tool === EDITOR.TOOL_PIXEL) {
    for (let i = 0; i < path.length; i++) {
      if (i === 0) {
        drawPixel(path[0].x, path[0].y, isInk);
      } else {
        drawLine(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y, isInk);
      }
    }
  } else if (tool === EDITOR.TOOL_ERASER) {
    for (let i = 0; i < path.length; i++) {
      if (i === 0) {
        drawEraser(path[0].x, path[0].y);
      } else {
        drawEraserLine(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
      }
    }
  } else if (tool === EDITOR.TOOL_AIRBRUSH) {
    // Distribute spray along the smooth path
    const totalLen = pathTotalLength(path);
    // Spray density: same as if holding at one spot for (totalLen / radius) intervals
    const sprayCount = Math.max(1, Math.ceil(totalLen / Math.max(1, airbrushRadius)));
    for (let s = 0; s < sprayCount; s++) {
      // Pick random position along the path
      const targetDist = Math.random() * totalLen;
      const pt = pointAtDistance(path, targetDist);
      drawAirbrush(pt.x, pt.y, isInk);
    }
  }

  deferredStrokePath = null;
  deferredStrokeTool = null;
}

/**
 * Total length of a polyline path.
 * @param {{x: number, y: number}[]} path
 * @returns {number}
 */
function pathTotalLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/**
 * Returns the point at a given distance along a polyline path.
 * @param {{x: number, y: number}[]} path
 * @param {number} targetDist
 * @returns {{x: number, y: number}}
 */
function pointAtDistance(path, targetDist) {
  let accumulated = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + segLen >= targetDist && segLen > 0) {
      const t = (targetDist - accumulated) / segLen;
      return {
        x: Math.round(path[i - 1].x + dx * t),
        y: Math.round(path[i - 1].y + dy * t)
      };
    }
    accumulated += segLen;
  }
  return path[path.length - 1];
}

// ============================================================================
// Dithering Matrices
// ============================================================================

/** 8x8 Bayer ordered dithering matrix (normalized 0-63) */
const GRADIENT_BAYER_8X8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];

/** 16x16 Blue noise pattern (pre-generated, normalized 0-255) */
const BLUE_NOISE_16X16 = [
  [154, 73,211, 28,182,105, 62,233, 17,141,197, 89, 45,168,126,  8],
  [ 35,118,167, 91,142, 11,176, 82,159, 54,220,  3,134,241, 70,201],
  [188,  1,226, 56,214,128, 47,199,112, 27,175,100,187, 33,152, 85],
  [ 69,145, 99, 18,171, 70,244, 13,138,229, 67,148,  9,219, 58,236],
  [208, 41,179,124,  5,196, 95,162, 76,189, 38,114,206, 80,125,179],
  [ 14,161,255, 79,232,116, 34,217,  0,104,252,169, 50,146,  4,102],
  [108, 86, 22,139,155, 56,180,127,241, 61,192, 20,231, 93,212,163],
  [193,203,170, 48,201, 88,  7,146, 44,165, 87,136,  75,173, 28, 65],
  [ 52,130, 10,243,110, 26,223,103,194,120, 15,210,119, 40,245,140],
  [227, 71,186, 67,166,135,185, 59,246, 30,238, 53,181,157,  6, 96],
  [ 25,156,115,  2,218, 42, 78,158, 12,143,  98,164,  83, 66,200,133],
  [178, 92,248, 37,147, 97,249,122,207,177, 72,225,  2,123,221, 51],
  [ 63,137,172, 81,190,  8,  23,170,  85, 46,129,  31,250,106,160, 19],
  [222, 16,213, 53,121,237,204,  55,235,111,191,151, 84, 39,184,144],
  [101,151,  29,109,174, 68,140, 90,  5,153,  24,215, 60,202,  77,230],
  [ 43,195,240, 74,  9,228, 32,183,131,247,  69,107,132, 13,117,  57]
];

/**
 * Gets dither threshold for a pixel position
 * @param {number} x
 * @param {number} y
 * @param {string} method - 'bayer' or 'noise'
 * @returns {number} Threshold 0-1
 */
function getDitherThreshold(x, y, method) {
  if (method === DITHER_METHOD.NOISE) {
    // Offset by 0.5 and divide by 256 to get range (0, 1) exclusive
    // This avoids edge cases where threshold = 0 or 1
    return (BLUE_NOISE_16X16[y & 15][x & 15] + 0.5) / 256;
  }
  // Default to Bayer - offset by 0.5 and divide by 64 for range (0, 1) exclusive
  return (GRADIENT_BAYER_8X8[y & 7][x & 7] + 0.5) / 64;
}

// ============================================================================
// Gradient Functions
// ============================================================================

/**
 * Calculates gradient value (0-1) for a point based on gradient type
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} x0 - Start X
 * @param {number} y0 - Start Y
 * @param {number} x1 - End X
 * @param {number} y1 - End Y
 * @param {string} type - Gradient type
 * @returns {number} Gradient value 0-1
 */
function calculateGradientValue(px, py, x0, y0, x1, y1, type) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1) return 0;

  switch (type) {
    case GRADIENT_TYPE.LINEAR: {
      // Project point onto gradient line
      const t = ((px - x0) * dx + (py - y0) * dy) / (length * length);
      return Math.max(0, Math.min(1, t));
    }

    case GRADIENT_TYPE.RADIAL: {
      // Distance from start point
      const dist = Math.sqrt((px - x0) * (px - x0) + (py - y0) * (py - y0));
      return Math.max(0, Math.min(1, dist / length));
    }

    case GRADIENT_TYPE.DIAMOND: {
      // Manhattan distance normalized
      const adx = Math.abs(px - x0);
      const ady = Math.abs(py - y0);
      return Math.max(0, Math.min(1, (adx + ady) / length));
    }

    case GRADIENT_TYPE.CONICAL: {
      // Angle from start point, with end point defining 0 degrees
      const baseAngle = Math.atan2(y1 - y0, x1 - x0);
      const pointAngle = Math.atan2(py - y0, px - x0);
      let angle = pointAngle - baseAngle;
      // Normalize to 0-2PI
      while (angle < 0) angle += Math.PI * 2;
      while (angle >= Math.PI * 2) angle -= Math.PI * 2;
      return angle / (Math.PI * 2);
    }

    case GRADIENT_TYPE.SQUARE: {
      // Chebyshev distance (max of abs differences)
      const adx = Math.abs(px - x0);
      const ady = Math.abs(py - y0);
      return Math.max(0, Math.min(1, Math.max(adx, ady) / length));
    }

    case GRADIENT_TYPE.SPIRAL: {
      // Combination of radial and conical
      const dist = Math.sqrt((px - x0) * (px - x0) + (py - y0) * (py - y0));
      const baseAngle = Math.atan2(y1 - y0, x1 - x0);
      const pointAngle = Math.atan2(py - y0, px - x0);
      let angle = pointAngle - baseAngle;
      while (angle < 0) angle += Math.PI * 2;
      const radial = dist / length;
      const angular = angle / (Math.PI * 2);
      // Combine: spiral outward
      return Math.max(0, Math.min(1, (radial + angular) % 1));
    }

    default:
      return 0;
  }
}

/**
 * Draws a dithered gradient from (x0,y0) to (x1,y1)
 * @param {number} x0 - Start X
 * @param {number} y0 - Start Y
 * @param {number} x1 - End X
 * @param {number} y1 - End Y
 * @param {boolean} isInk - true = gradient from paper to ink, false = ink to paper
 */
function drawGradient(x0, y0, x1, y1, isInk) {
  if (!screenData) return;

  // Note: snap is already applied by caller (mousedown/mouseup handlers use snapDrawCoords)

  // Defer layer flattening during bulk pixel writes (flatten once at end)
  batchFlattenDeferred = true;

  // Determine screen bounds based on format
  let width = getFormatWidth();
  let height = getFormatHeight();

  const reverse = gradientReverse ? !isInk : isInk;

  // Check for custom brush
  const brush = getActiveBrush();
  const hasCustomBrush = brushShape === 'custom' && brush;
  const isMasked = brushPaintMode === 'masked' || brushPaintMode === 'masked+';

  // For masked+ mode, set stroke origin to gradient start
  if (brushPaintMode === 'masked+') {
    maskStrokeOrigin = { x: x0, y: y0 };
  }

  // Helper to apply a single pixel with current brush mode
  const applyGradientPixel = (px, py, shouldBeInk) => {
    if (isMasked) {
      // Masked mode: paint through mask pattern
      const patternSet = getMaskPatternAt(px, py);
      if (patternSet === null) return; // Transparent - skip
      // In masked mode, the mask pattern determines ink/paper, gradient determines where to apply
      if (shouldBeInk) {
        setPixel(screenData, px, py, patternSet);
      }
    } else if (brushPaintMode === 'invert') {
      // Invert: toggle pixel where gradient says ink
      if (shouldBeInk) {
        const current = getPixel(screenData, px, py);
        setPixel(screenData, px, py, !current);
      }
    } else if (brushPaintMode === 'recolor') {
      // Recolor: only update attributes where gradient says ink
      if (shouldBeInk) {
        setPixelAttributeOnly(screenData, px, py);
      }
    } else if (brushPaintMode === 'retouch') {
      // Retouch: only update bitmap where gradient says ink
      if (shouldBeInk) {
        setPixelBitmapOnly(screenData, px, py, isInk);
      }
    } else if (brushPaintMode === 'replace') {
      // Replace: always set pixel based on gradient
      setPixel(screenData, px, py, shouldBeInk);
    } else {
      // Set (default): only paint where gradient says ink
      if (shouldBeInk) {
        setPixel(screenData, px, py, isInk);
      }
    }
  };

  // Custom brush gradient: stamp brush pattern at gradient-determined positions
  if (hasCustomBrush && !isMasked) {
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);
    const offsetX = Math.floor(bw / 2);
    const offsetY = Math.floor(bh / 2);
    const hasMask = brush.mask && brush.mask.length > 0;

    // Iterate screen in brush-sized steps
    const stepX = Math.max(1, bw);
    const stepY = Math.max(1, bh);

    for (let cy = offsetY; cy < height; cy += stepY) {
      for (let cx = offsetX; cx < width; cx += stepX) {
        // Calculate gradient value at brush center
        let value = calculateGradientValue(cx, cy, x0, y0, x1, y1, gradientType);
        if (reverse) value = 1 - value;
        const threshold = getDitherThreshold(cx, cy, ditherMethod);
        const shouldStamp = value > threshold;

        if (!shouldStamp && brushPaintMode !== 'replace') continue;

        // Stamp brush at this position
        for (let r = 0; r < bh; r++) {
          for (let c = 0; c < bw; c++) {
            const px = cx + c - offsetX;
            const py = cy + r - offsetY;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            const byteIdx = r * bytesPerRow + Math.floor(c / 8);
            const bitIdx = 7 - (c % 8);
            const brushBit = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
            const maskBit = hasMask ? (brush.mask[byteIdx] & (1 << bitIdx)) !== 0 : true;

            if (!maskBit) continue; // Skip transparent brush pixels

            if (brushPaintMode === 'replace') {
              // Replace: stamp brush pattern (ink/paper based on brush bit)
              setPixel(screenData, px, py, shouldStamp ? brushBit : !brushBit);
            } else if (brushPaintMode === 'invert') {
              // Invert: toggle where brush bit is set
              if (brushBit) {
                const current = getPixel(screenData, px, py);
                setPixel(screenData, px, py, !current);
              }
            } else if (brushPaintMode === 'recolor') {
              // Recolor: update attributes where brush bit is set
              if (brushBit) {
                setPixelAttributeOnly(screenData, px, py);
              }
            } else if (brushPaintMode === 'retouch') {
              // Retouch: update bitmap where brush bit is set
              if (brushBit) {
                setPixelBitmapOnly(screenData, px, py, isInk);
              }
            } else {
              // Set: paint ink where brush bit is set
              if (brushBit) {
                setPixel(screenData, px, py, isInk);
              }
            }
          }
        }
      }
    }
    batchFlattenDeferred = false;
    flattenLayersToScreen();
    return;
  }

  // Standard pixel-by-pixel gradient with brush mode support
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // Calculate gradient value at this pixel
      let value = calculateGradientValue(px, py, x0, y0, x1, y1, gradientType);

      // Reverse if needed
      if (reverse) value = 1 - value;

      // Get dither threshold
      const threshold = getDitherThreshold(px, py, ditherMethod);

      // Compare and apply pixel with brush mode
      const shouldBeInk = value > threshold;
      applyGradientPixel(px, py, shouldBeInk);
    }
  }
  batchFlattenDeferred = false;
  flattenLayersToScreen();
}

/**
 * Fills a cell with current ink or paper
 * SCR: 8×8 cell with single attribute
 * IFL: 8×2 block with single attribute
 * MLT: 8×1 block with single attribute (single pixel row)
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk
 */
function fillCell(x, y, isInk) {
  if (currentFormat === FORMAT.RGB3) {
    // RGB3: 8×8 cells, fill with selected color
    if (!screenData || screenData.length < RGB3.TOTAL_SIZE) return;
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / 8) * 8;
    const color = isInk ? getCurrentInkColor() : getCurrentPaperColor();
    // ZX color index bits: bit0=Blue, bit1=Red, bit2=Green
    const redByte = (color & 2) ? 0xFF : 0x00;
    const greenByte = (color & 4) ? 0xFF : 0x00;
    const blueByte = (color & 1) ? 0xFF : 0x00;

    for (let py = 0; py < 8; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[RGB3.RED_OFFSET + bitmapAddr] = redByte;
      screenData[RGB3.GREEN_OFFSET + bitmapAddr] = greenByte;
      screenData[RGB3.BLUE_OFFSET + bitmapAddr] = blueByte;
    }
  } else if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    // Monochrome: 8×8 cells, no attributes
    const maxY = currentFormat === FORMAT.MONO_1_3 ? 64 : (currentFormat === FORMAT.MONO_2_3 ? 128 : 192);
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / 8) * 8;

    for (let py = 0; py < 8 && cellY + py < maxY; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
    }
  } else if (currentFormat === FORMAT.MLT) {
    if (!screenData || screenData.length < MLT.TOTAL_SIZE) return;

    // MLT: 8×1 blocks (single pixel row)
    const cellX = Math.floor(x / 8) * 8;

    // Set attribute for this 8×1 block
    const attrAddr = getMltAttributeAddress(cellX, y);
    screenData[attrAddr] = getCurrentDrawingAttribute();

    // Fill single pixel row
    const bitmapAddr = getBitmapAddress(cellX, y);
    screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
  } else if (currentFormat === FORMAT.IFL) {
    if (!screenData || screenData.length < IFL.TOTAL_SIZE) return;

    // IFL: 8×2 blocks
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / 2) * 2;  // Align to 2-pixel boundary

    // Set attribute for this 8×2 block
    const attrAddr = getIflAttributeAddress(cellX, cellY);
    screenData[attrAddr] = getCurrentDrawingAttribute();

    // Fill 2 pixel rows
    for (let py = 0; py < 2; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
    }
  } else if (currentFormat === FORMAT.BMC4) {
    if (!screenData || screenData.length < BMC4.TOTAL_SIZE) return;

    // BMC4: 8×4 blocks
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / 4) * 4;  // Align to 4-pixel boundary

    // Set attribute for this 8×4 block
    const attrAddr = getBmc4AttributeAddress(cellX, cellY);
    screenData[attrAddr] = getCurrentDrawingAttribute();

    // Fill 4 pixel rows
    for (let py = 0; py < 4; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
    }
  } else if (currentFormat === FORMAT.HLR) {
    // HLR: bitmap is loader-tiled from the picture's 8-byte fill pattern;
    // fill the entire 8x8 cell with one solid blended color by setting
    // both ink and paper of both attribute frames to the chosen virtual color.
    if (!screenData || screenData.length < getGigaFrameSize() * 2) return;
    setHlrHalfCellColor(screenData, x, y, isInk, true);
  } else if (currentFormat === FORMAT.STL) {
    // STL: bitmap is fixed 0x0F; fill the 8x4 cell with one solid blended
    // color by setting both ink and paper of both attribute frames.
    if (!screenData || screenData.length < getGigaFrameSize() * 2) return;
    setStlCellColor(screenData, x, y, isInk, true);
  } else if (isGigascreenEditable()) {
    // Gigascreen: fill both frames with virtual colors
    if (!screenData || screenData.length < getGigaFrameSize() * 2) return;

    const cellH = getGigaAttrCellHeight();
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / cellH) * cellH;

    // Get colors for both frames
    const frame1 = getGigascreenFrameColors(0);
    const attr1 = buildAttribute(frame1.inkColor, frame1.paperColor, frame1.bright, false);
    const frame2 = getGigascreenFrameColors(1);
    const attr2 = buildAttribute(frame2.inkColor, frame2.paperColor, frame2.bright, false);

    // Attribute offset
    const charRow = getGigaAttrRow(cellY);
    const charCol = Math.floor(cellX / 8);
    const attrOffset = charRow * 32 + charCol;
    const gigaFS = getGigaFrameSize();

    // Fill frame 1
    if (isMg1OuterColumn(charCol)) {
      replicateMg1OuterAttr(screenData, 6144, cellY, charCol, attr1);
    } else {
      screenData[6144 + attrOffset] = attr1;
    }
    for (let py = 0; py < cellH; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
    }

    // Fill frame 2
    if (isMg1OuterColumn(charCol)) {
      replicateMg1OuterAttr(screenData, gigaFS + 6144, cellY, charCol, attr2);
    } else {
      screenData[gigaFS + 6144 + attrOffset] = attr2;
    }
    for (let py = 0; py < cellH; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[gigaFS + bitmapAddr] = isInk ? 0xFF : 0x00;
    }
  } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    // ZXP/chr$: variable-size cells with linear layout
    if (!screenData) return;
    const attrCellH = currentPicture.attrCellHeight || 8;
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / attrCellH) * attrCellH;

    // Set attribute
    const attrAddr = getAttributeAddress(cellX, cellY);
    screenData[attrAddr] = getCurrentDrawingAttribute();

    // Fill all pixels in cell
    for (let py = 0; py < attrCellH && cellY + py < currentPicture.height; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
    }
  } else {
    // SCR/BSC: 8×8 cells
    if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / 8) * 8;

    // Set attribute
    const attrAddr = getAttributeAddress(cellX, cellY);
    screenData[attrAddr] = getCurrentDrawingAttribute();

    // Fill all pixels in cell
    for (let py = 0; py < 8; py++) {
      const bitmapAddr = getBitmapAddress(cellX, cellY + py);
      screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
    }
  }
}

/**
 * Gets the pixel state (ink=1, paper=0) at a given position
 * @param {number} x
 * @param {number} y
 * @returns {number} 1 for ink (set pixel), 0 for paper (clear pixel)
 */
function getPixelState(x, y) {
  if (!screenData) return 0;

  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;

  // 53c attribute-only: return the attribute byte as pixel state
  if (currentFormat === FORMAT.ATTR_53C) {
    const addr = Math.floor(x / 8) + Math.floor(y / 8) * 32;
    // When on non-background layer, read from active layer
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        if (!layer.mask[addr]) return -1; // transparent cell — unique state
        return layer.bitmap[addr];
      }
    }
    return screenData[addr];
  }

  // LoRes: return palette index (128×96, row-major)
  if (currentFormat === FORMAT.LORES) {
    const flatIdx = y * LORES.WIDTH + x;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        if (!layer.mask[flatIdx]) return -1;
        return layer.bitmap[flatIdx];
      }
    }
    return screenData[flatIdx];
  }

  // LoRes Radastan: return 4bpp palette index (128×96, packed nibbles)
  if (currentFormat === FORMAT.LORES_RAD) {
    const flatIdx = y * LORES_RAD.WIDTH + x;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        if (!layer.mask[flatIdx]) return -1;
        return layer.bitmap[flatIdx];
      }
    }
    const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
    const byteVal = screenData[byteOffset] || 0;
    return (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
  }

  // NXI/SL2: return palette index
  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    const w = getFormatWidth();
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        const flatIdx = y * w + x;
        if (!layer.mask[flatIdx]) return -1; // transparent pixel
        return layer.bitmap[flatIdx];
      }
    }
    const pixOff = getNxiPixelOffset();
    if (nxiLayer2Mode === '640x256') {
      const byteVal = screenData[pixOff + getNxiPixelIndex(x, y)] || 0;
      return (x & 1) ? (byteVal & 0x0F) : ((byteVal >> 4) & 0x0F);
    }
    return screenData[pixOff + getNxiPixelIndex(x, y)];
  }

  const bitmapAddr = getBitmapAddress(x, y);
  const bitMask = 0x80 >> (x % 8);

  // When layers are enabled and on non-background layer, read from layer bitmap
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      const maskIdx = y * width + x;
      // If pixel is transparent on this layer, treat as "paper" (0)
      if (!layer.mask[maskIdx]) return 0;

      // For Gigascreen, combine both frame states
      if (isGigascreenEditable() && layer.bitmap2) {
        const f1 = (layer.bitmap[bitmapAddr] & bitMask) !== 0 ? 1 : 0;
        const f2 = (layer.bitmap2[bitmapAddr] & bitMask) !== 0 ? 2 : 0;
        return f1 | f2; // 0-3 representing the 4 color states
      }

      return (layer.bitmap[bitmapAddr] & bitMask) !== 0 ? 1 : 0;
    }
  }

  // Background layer or no layers - read from screenData
  if (currentFormat === FORMAT.RGB3) {
    // RGB3: any channel set = ink pixel
    const r = (screenData[RGB3.RED_OFFSET + bitmapAddr] & bitMask) !== 0;
    const g = (screenData[RGB3.GREEN_OFFSET + bitmapAddr] & bitMask) !== 0;
    const b = (screenData[RGB3.BLUE_OFFSET + bitmapAddr] & bitMask) !== 0;
    return (r || g || b) ? 1 : 0;
  }

  // Gigascreen: combine both frame states
  if (isGigascreenEditable()) {
    const f1 = (screenData[bitmapAddr] & bitMask) !== 0 ? 1 : 0;
    const f2 = (screenData[getGigaFrameSize() + bitmapAddr] & bitMask) !== 0 ? 2 : 0;
    return f1 | f2; // 0-3 representing the 4 color states
  }

  return (screenData[bitmapAddr] & bitMask) !== 0 ? 1 : 0;
}

/**
 * Checks if brush pattern has a pixel set at given position (for tiled fill)
 * @param {number} x - X position in screen coordinates
 * @param {number} y - Y position in screen coordinates
 * @returns {boolean} true if brush has pixel set at this position
 */
function getBrushPatternAt(x, y) {
  // Custom brush: tile the pattern
  const brush = getActiveBrush();
  if (brushShape === 'custom' && brush) {
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);
    // Tile the brush pattern
    const bx = ((x % bw) + bw) % bw;
    const by = ((y % bh) + bh) % bh;
    const byteIdx = by * bytesPerRow + Math.floor(bx / 8);
    const bitIdx = 7 - (bx % 8);

    // Check mask - return null for transparent pixels
    if (brush.mask && brush.mask.length > 0) {
      const maskBit = (brush.mask[byteIdx] & (1 << bitIdx)) !== 0;
      if (!maskBit) return null; // Transparent - don't paint
    }

    return (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
  }
  // Standard brushes: all pixels are set (solid fill)
  return true;
}

/**
 * Gets the mask pattern at given position for masked drawing mode.
 * Always uses the custom brush pattern (if available), regardless of brushShape.
 * @param {number} x - X position in screen coordinates
 * @param {number} y - Y position in screen coordinates
 * @returns {boolean|null} true if mask has pixel set, false if not, null if transparent
 */
function getMaskPatternAt(x, y) {
  // Use custom brush or tile brush as mask pattern if available
  const brush = getActiveBrush();
  if (brush) {
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);

    // For masked+ mode, offset by stroke origin so pattern starts from first stamp
    let px = x;
    let py = y;
    if (brushPaintMode === 'masked+' && maskStrokeOrigin) {
      px = x - maskStrokeOrigin.x;
      py = y - maskStrokeOrigin.y;
    }

    // Compute tiled position
    const bx = ((px % bw) + bw) % bw;
    const by = ((py % bh) + bh) % bh;
    const byteIdx = by * bytesPerRow + Math.floor(bx / 8);
    const bitIdx = 7 - (bx % 8);

    // Check mask - return null for transparent pixels
    if (brush.mask && brush.mask.length > 0) {
      const maskBit = (brush.mask[byteIdx] & (1 << bitIdx)) !== 0;
      if (!maskBit) return null;
    }

    // Return whether this pixel is ink or paper in the brush pattern
    return (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
  }
  // No custom brush selected - no masking (paint all pixels)
  return true;
}

/**
 * Flood fill from a starting point, using current brush pattern
 * @param {number} startX
 * @param {number} startY
 * @param {boolean} isInk - true to fill with ink color, false for paper
 */
function floodFill(startX, startY, isInk) {
  if (!screenData) return;

  const width = getFormatWidth();
  const height = getFormatHeight();
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  // 53c attribute-only: flood fill on 32×24 cell grid
  if (currentFormat === FORMAT.ATTR_53C) {
    floodFill53c(Math.floor(startX / 8), Math.floor(startY / 8));
    return;
  }

  // Check if filling with transparent color (not available in ULA+ mode)
  const usingTransparent = isInk ? isInkTransparent() : isPaperTransparent();

  // Get the target pixel state (what we're replacing)
  const targetState = getPixelState(startX, startY);

  // Scanline flood fill algorithm for efficiency
  const visited = new Uint8Array(width * height);
  const stack = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const idx = y * width + x;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (visited[idx]) continue;
    if (getPixelState(x, y) !== targetState) continue;

    visited[idx] = 1;

    // Set the pixel based on brush pattern
    // If brush has pixel set at this position, use ink; otherwise use paper
    // If null, the pixel is transparent in the brush - don't paint
    const brushSet = getBrushPatternAt(x, y);
    if (brushSet === null) {
      // Transparent in brush pattern - don't paint
    } else if (brushSet) {
      setPixelDirect(x, y, isInk);
    } else {
      setPixelDirect(x, y, !isInk);
    }

    // Push neighbors
    stack.push([x - 1, y]);
    stack.push([x + 1, y]);
    stack.push([x, y - 1]);
    stack.push([x, y + 1]);
  }

  // Flatten layers if on non-background layer or used transparent color
  if (layersEnabled && layers.length > 0 && (activeLayerIndex > 0 || usingTransparent)) {
    flattenLayersToScreen();
  }

  // Sync internal picture format after flood fill
  syncCurrentPicture();
}

/**
 * Flood fill for 53c attribute-only format, operating on 32×24 cell grid.
 * @param {number} cellX - Cell column (0-31)
 * @param {number} cellY - Cell row (0-23)
 */
function floodFill53c(cellX, cellY) {
  const cols = 32;
  const rows = 24;
  if (cellX < 0 || cellX >= cols || cellY < 0 || cellY >= rows) return;

  // Read target state from active layer or screenData
  const startAddr = cellY * cols + cellX;
  let targetState;
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    targetState = (layer && layer.mask[startAddr]) ? layer.bitmap[startAddr] : -1;
  } else {
    targetState = screenData[startAddr];
  }

  const attr = getCurrentDrawingAttribute();
  // Don't fill if target is already the fill color (unless transparent)
  if (targetState === attr) return;

  const visited = new Uint8Array(cols * rows);
  const stack = [[cellX, cellY]];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;

    const addr = cy * cols + cx;
    if (visited[addr]) continue;

    // Check cell state
    let cellState;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      cellState = (layer && layer.mask[addr]) ? layer.bitmap[addr] : -1;
    } else {
      cellState = screenData[addr];
    }
    if (cellState !== targetState) continue;

    visited[addr] = 1;

    // Paint cell
    if (layersEnabled && layers.length > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[addr] = attr;
        layer.mask[addr] = 1;
      }
      resolve53cCellToScreen(addr);
    } else {
      screenData[addr] = attr;
    }

    // Push neighbors
    stack.push([cx - 1, cy]);
    stack.push([cx + 1, cy]);
    stack.push([cx, cy - 1]);
    stack.push([cx, cy + 1]);
  }
}

/**
 * Sets a pixel without brush logic - used by flood fill
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk
 */
function setPixelDirect(x, y, isInk) {
  const width = getFormatWidth();
  const height = getFormatHeight();
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  // 53c attribute-only format: set cell attribute, no bitmap
  if (currentFormat === FORMAT.ATTR_53C) {
    recolorCell53c(x, y);
    return;
  }

  // LoRes: write palette index directly (128×96, row-major)
  if (currentFormat === FORMAT.LORES) {
    const color = isInk ? editorInkColor : editorPaperColor;
    const flatIdx = y * LORES.WIDTH + x;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[flatIdx] = color & 0xFF;
        layer.mask[flatIdx] = 1;
      }
    } else {
      screenData[flatIdx] = color & 0xFF;
    }
    return;
  }

  // LoRes Radastan: write 4bpp packed nibble (128×96, 16-color)
  if (currentFormat === FORMAT.LORES_RAD) {
    const color = (isInk ? editorInkColor : editorPaperColor) & 0x0F;
    const flatIdx = y * LORES_RAD.WIDTH + x;
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[flatIdx] = color;
        layer.mask[flatIdx] = 1;
      }
    } else {
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      let byteVal = screenData[byteOffset] || 0;
      if ((x & 1) === 0) {
        byteVal = (color << 4) | (byteVal & 0x0F);
      } else {
        byteVal = (byteVal & 0xF0) | color;
      }
      screenData[byteOffset] = byteVal;
    }
    return;
  }

  // NXI/SL2: write palette index directly
  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    const color = isInk ? editorInkColor : editorPaperColor;
    const w = getFormatWidth();
    const flatIdx = y * w + x;  // row-major index for layers
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        layer.bitmap[flatIdx] = color & (nxiLayer2Mode === '640x256' ? 0x0F : 0xFF);
        layer.mask[flatIdx] = 1;
      }
    } else {
      const pixOff = getNxiPixelOffset();
      if (nxiLayer2Mode === '640x256') {
        const byteIdx = pixOff + getNxiPixelIndex(x, y);
        const oldByte = screenData[byteIdx] || 0;
        screenData[byteIdx] = (x & 1) ? ((oldByte & 0xF0) | (color & 0x0F)) : ((oldByte & 0x0F) | ((color & 0x0F) << 4));
      } else {
        screenData[pixOff + getNxiPixelIndex(x, y)] = color & 0xFF;
      }
    }
    return;
  }

  // Check if painting with transparent color (not available in ULA+ mode)
  const isTransparent = isInk ? isInkTransparent() : isPaperTransparent();
  if (isTransparent) {
    // Transparent: clear the mask on non-background layers
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        const maskIdx = y * width + x;
        layer.mask[maskIdx] = 0; // Make pixel transparent
      }
    }
    // On background layer, transparent does nothing
    return;
  }

  // Get current color for format-specific handling
  const color = isInk ? getCurrentInkColor() : getCurrentPaperColor();

  if (currentFormat === FORMAT.RGB3) {
    const addr = getBitmapAddress(x, y);
    const bitMask = 0x80 >> (x % 8);
    const invMask = ~bitMask & 0xFF;

    if (color & 2) screenData[RGB3.RED_OFFSET + addr] |= bitMask;
    else screenData[RGB3.RED_OFFSET + addr] &= invMask;

    if (color & 4) screenData[RGB3.GREEN_OFFSET + addr] |= bitMask;
    else screenData[RGB3.GREEN_OFFSET + addr] &= invMask;

    if (color & 1) screenData[RGB3.BLUE_OFFSET + addr] |= bitMask;
    else screenData[RGB3.BLUE_OFFSET + addr] &= invMask;
    return;
  }

  if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    const bitmapAddr = getBitmapAddress(x, y);
    const bitMask = 0x80 >> (x % 8);
    if (isInk) screenData[bitmapAddr] |= bitMask;
    else screenData[bitmapAddr] &= ~bitMask & 0xFF;
    return;
  }

  // Gigascreen: set pixel in both frames
  if (isGigascreenEditable()) {
    setGigascreenPixel(screenData, x, y, isInk);
    return;
  }

  // Standard formats with attributes (SCR, IFL, MLT, BMC4, BSC)
  const bitmapAddr = getBitmapAddress(x, y);
  const bitMask = 0x80 >> (x % 8);
  const attr = getCurrentDrawingAttribute();

  // Update attribute address based on format
  let attrAddr;
  if (currentFormat === FORMAT.MLT) {
    attrAddr = getMltAttributeAddress(x, y);
  } else if (currentFormat === FORMAT.IFL) {
    attrAddr = getIflAttributeAddress(x, y);
  } else if (currentFormat === FORMAT.BMC4) {
    attrAddr = getBmc4AttributeAddress(x, y);
  } else {
    attrAddr = getAttributeAddress(x, y);
  }

  // When layers are enabled and on non-background layer, only modify layer data
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      const maskIdx = y * width + x;
      if (isInk) layer.bitmap[bitmapAddr] |= bitMask;
      else layer.bitmap[bitmapAddr] &= ~bitMask & 0xFF;
      layer.mask[maskIdx] = 1;

      // Update layer attributes
      if (layer.attributes) {
        if (currentFormat === FORMAT.BMC4) {
          const pixelLine = y % 8;
          const charRow = Math.floor(y / 8);
          const charCol = Math.floor(x / 8);
          const attrIdx = charRow * 32 + charCol;
          if (pixelLine < 4) {
            layer.attributes[attrIdx] = attr;
          } else if (layer.attributes2) {
            layer.attributes2[attrIdx] = attr;
          }
        } else if (currentFormat === FORMAT.MLT) {
          const attrIdx = y * 32 + Math.floor(x / 8);
          layer.attributes[attrIdx] = attr;
        } else if (currentFormat === FORMAT.IFL) {
          const attrRow = Math.floor(y / 2);
          const attrIdx = attrRow * 32 + Math.floor(x / 8);
          layer.attributes[attrIdx] = attr;
        } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
          const cols = currentPicture.width >> 3;
          const attrCellH = currentPicture.attrCellHeight || 8;
          const attrRow = Math.floor(y / attrCellH);
          const attrIdx = attrRow * cols + Math.floor(x / 8);
          layer.attributes[attrIdx] = attr;
        } else {
          const charRow = Math.floor(y / 8);
          const charCol = Math.floor(x / 8);
          const attrIdx = charRow * 32 + charCol;
          layer.attributes[attrIdx] = attr;
        }
      }
    }
  } else {
    // No layers or on background layer - modify screenData directly
    if (isInk) screenData[bitmapAddr] |= bitMask;
    else screenData[bitmapAddr] &= ~bitMask & 0xFF;
    screenData[attrAddr] = attr;

    // Also update background layer if layers enabled
    if (layersEnabled && layers.length > 0 && activeLayerIndex === 0) {
      const layer = layers[0];
      if (layer) {
        if (isInk) layer.bitmap[bitmapAddr] |= bitMask;
        else layer.bitmap[bitmapAddr] &= ~bitMask & 0xFF;

        if (layer.attributes) {
          if (currentFormat === FORMAT.BMC4) {
            const pixelLine = y % 8;
            const charRow = Math.floor(y / 8);
            const charCol = Math.floor(x / 8);
            const attrIdx = charRow * 32 + charCol;
            if (pixelLine < 4) {
              layer.attributes[attrIdx] = attr;
            } else if (layer.attributes2) {
              layer.attributes2[attrIdx] = attr;
            }
          } else if (currentFormat === FORMAT.MLT) {
            const attrIdx = y * 32 + Math.floor(x / 8);
            layer.attributes[attrIdx] = attr;
          } else if (currentFormat === FORMAT.IFL) {
            const attrRow = Math.floor(y / 2);
            const attrIdx = attrRow * 32 + Math.floor(x / 8);
            layer.attributes[attrIdx] = attr;
          } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
            const cols = currentPicture.width >> 3;
            const attrCellH = currentPicture.attrCellHeight || 8;
            const attrRow = Math.floor(y / attrCellH);
            const attrIdx = attrRow * cols + Math.floor(x / 8);
            layer.attributes[attrIdx] = attr;
          } else {
            const charRow = Math.floor(y / 8);
            const charCol = Math.floor(x / 8);
            const attrIdx = charRow * 32 + charCol;
            layer.attributes[attrIdx] = attr;
          }
        }
      }
    }
  }
}

/**
 * Recolors a cell's attribute without modifying bitmap data
 * SCR: 8×8 cell
 * IFL: 8×2 block
 * MLT: 8×1 block (single pixel row)
 * @param {number} x
 * @param {number} y
 */
function recolorCell(x, y) {
  // Monochrome and RGB3 formats have no attributes to recolor
  if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3 || currentFormat === FORMAT.RGB3) {
    return;
  }

  if (currentFormat === FORMAT.MLT) {
    if (!screenData || screenData.length < MLT.TOTAL_SIZE) return;

    // MLT: 8×1 blocks - set single attribute for this pixel row
    const attrAddr = getMltAttributeAddress(x, y);
    screenData[attrAddr] = getCurrentDrawingAttribute();
  } else if (currentFormat === FORMAT.IFL) {
    if (!screenData || screenData.length < IFL.TOTAL_SIZE) return;

    // IFL: 8×2 blocks - set single attribute for this block
    const attrAddr = getIflAttributeAddress(x, y);
    screenData[attrAddr] = getCurrentDrawingAttribute();
  } else if (currentFormat === FORMAT.BMC4) {
    if (!screenData || screenData.length < BMC4.TOTAL_SIZE) return;

    // BMC4: 8×4 blocks - set attribute for this block
    const attrAddr = getBmc4AttributeAddress(x, y);
    screenData[attrAddr] = getCurrentDrawingAttribute();
  } else if (currentFormat === FORMAT.HLR) {
    // HLR: recolor entire 8x8 cell with the chosen virtual ink color by
    // setting both ink and paper of both attribute frames (solid mode).
    if (!screenData || screenData.length < getGigaFrameSize() * 2) return;
    setHlrHalfCellColor(screenData, x, y, true, true);
  } else if (currentFormat === FORMAT.STL) {
    // STL: recolor entire 8x4 cell with the chosen virtual ink color by
    // setting both ink and paper of both attribute frames (solid mode).
    if (!screenData || screenData.length < getGigaFrameSize() * 2) return;
    setStlCellColor(screenData, x, y, true, true);
  } else if (isGigascreenEditable()) {
    // Gigascreen: set attributes in both frames
    if (!screenData || screenData.length < getGigaFrameSize() * 2) return;

    const charRow = getGigaAttrRow(y);
    const charCol = Math.floor(x / 8);
    const attrOffset = charRow * 32 + charCol;

    // Get colors for both frames
    const frame1 = getGigascreenFrameColors(0);
    const attr1 = buildAttribute(frame1.inkColor, frame1.paperColor, frame1.bright, false);
    const frame2 = getGigascreenFrameColors(1);
    const attr2 = buildAttribute(frame2.inkColor, frame2.paperColor, frame2.bright, false);

    const gigaFS = getGigaFrameSize();
    if (isMg1OuterColumn(charCol)) {
      replicateMg1OuterAttr(screenData, 6144, y, charCol, attr1);
      replicateMg1OuterAttr(screenData, gigaFS + 6144, y, charCol, attr2);
    } else {
      screenData[6144 + attrOffset] = attr1;
      screenData[gigaFS + 6144 + attrOffset] = attr2;
    }
  } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    // ZXP/chr$: variable-size cells
    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / (currentPicture.attrCellHeight || 8)) * (currentPicture.attrCellHeight || 8);

    const attrAddr = getAttributeAddress(cellX, cellY);
    screenData[attrAddr] = getCurrentDrawingAttribute();
  } else {
    // SCR/BSC: 8×8 cells
    if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

    const cellX = Math.floor(x / 8) * 8;
    const cellY = Math.floor(y / 8) * 8;

    const attrAddr = getAttributeAddress(cellX, cellY);
    screenData[attrAddr] = getCurrentDrawingAttribute();
  }
}

/**
 * Recolors a cell in .53c attribute-only data (768 bytes, linear layout)
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 */
function recolorCell53c(x, y) {
  if (!screenData || screenData.length < 768) return;
  const addr = Math.floor(x / 8) + Math.floor(y / 8) * 32;
  const attr = getCurrentDrawingAttribute();
  if (layersEnabled && layers.length > 0) {
    const layer = layers[activeLayerIndex];
    if (layer && layer.bitmap) {
      layer.bitmap[addr] = attr;
      layer.mask[addr] = 1;
    }
    resolve53cCellToScreen(addr);
  } else {
    screenData[addr] = attr;
  }
}

/**
 * Erases a 53c cell: on non-background layer clears the mask (transparent),
 * on background layer resets to default attribute (ink=7, paper=0).
 */
function eraseCell53c(x, y) {
  if (!screenData || screenData.length < 768) return;
  const addr = Math.floor(x / 8) + Math.floor(y / 8) * 32;
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      layer.mask[addr] = 0;
      layer.bitmap[addr] = 0;
    }
    resolve53cCellToScreen(addr);
  } else {
    const defaultAttr = buildAttribute(7, 0, false, false);
    if (layersEnabled && layers.length > 0) {
      layers[0].bitmap[addr] = defaultAttr;
    }
    screenData[addr] = defaultAttr;
  }
}

/**
 * Resolves a single 53c cell in screenData from the layer stack.
 * Finds the topmost visible layer with content at this cell address.
 * @param {number} addr - Cell address (0-767)
 */
function resolve53cCellToScreen(addr) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible) continue;
    // Background layer (i===0) always has content; upper layers need mask
    if (i === 0 || l.mask[addr]) {
      screenData[addr] = l.bitmap[addr];
      return;
    }
  }
  // No visible layer has content at this cell
  screenData[addr] = 0;
}

// ============================================================================
// Selection / Clipboard Functions
// ============================================================================

/**
 * Normalizes selection start/end into a rectangle, snaps if enabled, clamps to screen
 * @returns {{left:number, top:number, right:number, bottom:number, width:number, height:number}|null}
 */
function getSelectionRect() {
  if (!selectionStartPoint || !selectionEndPoint) return null;

  let left = Math.min(selectionStartPoint.x, selectionEndPoint.x);
  let top = Math.min(selectionStartPoint.y, selectionEndPoint.y);
  let right = Math.max(selectionStartPoint.x, selectionEndPoint.x);
  let bottom = Math.max(selectionStartPoint.y, selectionEndPoint.y);

  // Use transform snap setting when in transform mode, otherwise use Edit tab snap
  const useSnap = transformSelectActive ? transformSnapToGrid : isSnapActive();
  if (useSnap) {
    left = Math.floor(left / 8) * 8;
    top = Math.floor(top / 8) * 8;
    right = Math.floor(right / 8) * 8 + 7;
    bottom = Math.floor(bottom / 8) * 8 + 7;
  }

  // Clamp to screen bounds
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(getFormatWidth() - 1, right);
  bottom = Math.min(getFormatHeight() - 1, bottom);

  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width <= 0 || height <= 0) return null;

  return { left, top, right, bottom, width, height };
}

/**
 * Copies pixel bitmap and attributes from the current selection into clipboardData
 */
function copySelection() {
  const infoEl = document.getElementById('editorPositionInfo');
  const rect = getSelectionRect();
  if (!rect) {
    if (infoEl) infoEl.innerHTML = 'No selection — use Select tool first';
    return;
  }

  if (currentFormat === FORMAT.SPECSCII) {
    // SPECSCII: copy character codes + attributes + mask
    if (!specsciiCharGrid || !specsciiAttrGrid) return;
    const cellLeft = Math.floor(rect.left / 8);
    const cellTop = Math.floor(rect.top / 8);
    const cellCols = Math.ceil(rect.width / 8);
    const cellRows = Math.ceil(rect.height / 8);
    const chars = new Uint8Array(cellCols * cellRows);
    const attrs = new Uint8Array(cellCols * cellRows);
    const mask = new Uint8Array(cellCols * cellRows);

    for (let cr = 0; cr < cellRows; cr++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const srcIdx = (cellTop + cr) * 32 + (cellLeft + cc);
        const dstIdx = cr * cellCols + cc;
        chars[dstIdx] = specsciiCharGrid[srcIdx];
        attrs[dstIdx] = specsciiAttrGrid[srcIdx];
        mask[dstIdx] = specsciiMask ? specsciiMask[srcIdx] : 1;
      }
    }

    clipboardData = { format: 'specscii', cellCols, cellRows, chars, attrs, mask };
  } else if (currentFormat === FORMAT.ATTR_53C) {
    // .53c: copy attributes only
    const cellLeft = Math.floor(rect.left / 8);
    const cellTop = Math.floor(rect.top / 8);
    const cellCols = Math.ceil(rect.width / 8);
    const cellRows = Math.ceil(rect.height / 8);
    const attrs = new Uint8Array(cellCols * cellRows);

    for (let cr = 0; cr < cellRows; cr++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const srcAddr = (cellLeft + cc) + (cellTop + cr) * 32;
        attrs[cr * cellCols + cc] = screenData[srcAddr];
      }
    }

    clipboardData = { format: '53c', cellCols, cellRows, attrs };
  } else if (currentFormat === FORMAT.IFL) {
    // .ifl: copy bitmap (linear packed) + attributes (8×2 blocks)
    const cellLeft = Math.floor(rect.left / 8);
    const attrTop = Math.floor(rect.top / 2);  // IFL: 2-pixel attr rows
    const cellCols = Math.ceil(rect.width / 8);
    const attrRows = Math.ceil(rect.height / 2);  // IFL: 96 rows total

    // Pack bitmap: one bit per pixel, row by row, MSB-first, linear (not ZX-interleaved)
    const bitmapBytesPerRow = Math.ceil(rect.width / 8);
    const bitmap = new Uint8Array(bitmapBytesPerRow * rect.height);

    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const sx = rect.left + px;
        const sy = rect.top + py;
        if (getPixel(screenData, sx, sy)) {
          const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
          const bitIdx = 7 - (px % 8);
          bitmap[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    // Copy IFL attributes (8×2 blocks)
    const attrs = new Uint8Array(cellCols * attrRows);
    for (let ar = 0; ar < attrRows; ar++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const srcAddr = IFL.BITMAP_SIZE + (cellLeft + cc) + (attrTop + ar) * 32;
        attrs[ar * cellCols + cc] = screenData[srcAddr];
      }
    }

    clipboardData = {
      format: 'ifl',
      width: rect.width,
      height: rect.height,
      cellCols,
      attrRows,
      bitmap,
      attrs
    };
  } else if (currentFormat === FORMAT.MLT) {
    // .mlt: copy bitmap (linear packed) + attributes (8×1 blocks)
    const cellLeft = Math.floor(rect.left / 8);
    const cellCols = Math.ceil(rect.width / 8);
    const attrRows = rect.height;  // MLT: one attr row per pixel line

    // Pack bitmap: one bit per pixel, row by row, MSB-first, linear (not ZX-interleaved)
    const bitmapBytesPerRow = Math.ceil(rect.width / 8);
    const bitmap = new Uint8Array(bitmapBytesPerRow * rect.height);

    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const sx = rect.left + px;
        const sy = rect.top + py;
        if (getPixel(screenData, sx, sy)) {
          const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
          const bitIdx = 7 - (px % 8);
          bitmap[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    // Copy MLT attributes (8×1 blocks - one per pixel line)
    const attrs = new Uint8Array(cellCols * attrRows);
    for (let ar = 0; ar < attrRows; ar++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const srcAddr = MLT.BITMAP_SIZE + (cellLeft + cc) + (rect.top + ar) * 32;
        attrs[ar * cellCols + cc] = screenData[srcAddr];
      }
    }

    clipboardData = {
      format: 'mlt',
      width: rect.width,
      height: rect.height,
      cellCols,
      attrRows,
      bitmap,
      attrs
    };
  } else {
    // .scr: copy bitmap (linear packed) + attributes
    const cellLeft = Math.floor(rect.left / 8);
    const cellTop = Math.floor(rect.top / 8);
    const cellCols = Math.ceil(rect.width / 8);
    const cellRows = Math.ceil(rect.height / 8);

    // Pack bitmap: one bit per pixel, row by row, MSB-first, linear (not ZX-interleaved)
    const bitmapBytesPerRow = Math.ceil(rect.width / 8);
    const bitmap = new Uint8Array(bitmapBytesPerRow * rect.height);

    // For dual-plane sources (pure gigascreen editables or chr$ with gigascreen
    // colorMode, both using 8-row attr cells), also capture plane[1].
    const gigaInfo = getGigaPasteInfo();
    const captureGiga = gigaInfo.isGiga;
    const gigaFS = gigaInfo.frameSize;
    const bitmap2 = captureGiga ? new Uint8Array(bitmapBytesPerRow * rect.height) : null;

    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const sx = rect.left + px;
        const sy = rect.top + py;
        if (getPixel(screenData, sx, sy)) {
          const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
          const bitIdx = 7 - (px % 8);
          bitmap[byteIdx] |= (1 << bitIdx);
        }
        if (captureGiga) {
          const bmAddr = getBitmapAddress(sx, sy);
          const bit = getBitPosition(sx);
          if ((screenData[gigaFS + bmAddr] >> bit) & 1) {
            const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
            const bitIdx = 7 - (px % 8);
            bitmap2[byteIdx] |= (1 << bitIdx);
          }
        }
      }
    }

    // Copy attributes
    const attrs = new Uint8Array(cellCols * cellRows);
    const attrs2 = captureGiga ? new Uint8Array(cellCols * cellRows) : null;
    for (let cr = 0; cr < cellRows; cr++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const srcAddr = getAttributeAddress((cellLeft + cc) * 8, (cellTop + cr) * 8);
        attrs[cr * cellCols + cc] = screenData[srcAddr];
        if (captureGiga) {
          attrs2[cr * cellCols + cc] = screenData[gigaFS + srcAddr];
        }
      }
    }

    clipboardData = {
      format: 'scr',
      width: rect.width,
      height: rect.height,
      cellCols,
      cellRows,
      bitmap,
      attrs,
      bitmap2,
      attrs2
    };
  }

  if (infoEl) {
    const fmt = clipboardData.format;
    const cols = clipboardData.cellCols;
    if (fmt === 'mlt') {
      const rows = clipboardData.attrRows;
      infoEl.innerHTML = `Copied ${fmt} region: ${cols}\u00d7${rows} blocks (8\u00d71)`;
    } else if (fmt === 'ifl') {
      const rows = clipboardData.attrRows;
      infoEl.innerHTML = `Copied ${fmt} region: ${cols}\u00d7${rows} blocks (8\u00d72)`;
    } else {
      const rows = clipboardData.cellRows;
      infoEl.innerHTML = `Copied ${fmt} region: ${cols}\u00d7${rows} cells`;
    }
  }
}

/**
 * Cuts selection: copies to clipboard and erases original region
 */
function cutSelection() {
  const rect = getSelectionRect();
  if (!rect) return;

  // First copy to clipboard
  copySelection();
  if (!clipboardData) return;

  // Save undo state before erasing
  saveUndoState();

  // Erase the selected region
  if (currentFormat === FORMAT.SPECSCII && specsciiCharGrid && specsciiAttrGrid) {
    // SPECSCII: clear cells to space with default attribute
    const cellLeft = Math.floor(rect.left / 8);
    const cellTop = Math.floor(rect.top / 8);
    const cellCols = Math.ceil(rect.width / 8);
    const cellRows = Math.ceil(rect.height / 8);
    for (let cr = 0; cr < cellRows; cr++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const col = cellLeft + cc;
        const row = cellTop + cr;
        if (col < 0 || col >= SPECSCII.CHAR_COLS || row < 0 || row >= SPECSCII.CHAR_ROWS) continue;
        const idx = row * 32 + col;
        specsciiCharGrid[idx] = 0x20;
        specsciiAttrGrid[idx] = 0x38;
        if (specsciiMask) specsciiMask[idx] = 0;
        if (layersEnabled && layers.length > 0) {
          const layer = layers[activeLayerIndex];
          if (layer) {
            if (layer.bitmap) layer.bitmap[idx] = 0x20;
            if (layer.attributes) layer.attributes[idx] = 0x38;
            if (layer.mask) layer.mask[idx] = 0;
          }
        }
      }
    }
    specsciiSyncToStream();
  } else {
    // Bitmap formats: fill with paper
    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const x = rect.left + px;
        const y = rect.top + py;
        setPixelDirect(x, y, false);  // false = paper (erase)
      }
    }
  }

  // Update info
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl && clipboardData) {
    const fmt = clipboardData.format;
    const cols = clipboardData.cellCols;
    if (fmt === 'mlt') {
      const rows = clipboardData.attrRows;
      infoEl.innerHTML = `Cut ${fmt} region: ${cols}\u00d7${rows} blocks (8\u00d71)`;
    } else if (fmt === 'ifl') {
      const rows = clipboardData.attrRows;
      infoEl.innerHTML = `Cut ${fmt} region: ${cols}\u00d7${rows} blocks (8\u00d72)`;
    } else {
      const rows = clipboardData.cellRows;
      infoEl.innerHTML = `Cut ${fmt} region: ${cols}\u00d7${rows} cells`;
    }
  }

  editorRender();
}

/**
 * Inverts pixels in the selected region (ink ↔ paper)
 */
function invertSelection() {
  const rect = getSelectionRect();
  if (!rect) {
    const infoEl = document.getElementById('editorPositionInfo');
    if (infoEl) infoEl.innerHTML = 'No selection — use Select tool first';
    return;
  }

  saveUndoState();

  if (currentFormat === FORMAT.RGB3) {
    // RGB3: XOR all channel bits within selection
    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const x = rect.left + px;
        const y = rect.top + py;
        const addr = getBitmapAddress(x, y);
        const bitMask = 0x80 >> (x % 8);
        screenData[RGB3.RED_OFFSET + addr] ^= bitMask;
        screenData[RGB3.GREEN_OFFSET + addr] ^= bitMask;
        screenData[RGB3.BLUE_OFFSET + addr] ^= bitMask;
      }
    }
  } else if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    // Monochrome: XOR bitmap bits
    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const x = rect.left + px;
        const y = rect.top + py;
        const addr = getBitmapAddress(x, y);
        const bitMask = 0x80 >> (x % 8);
        screenData[addr] ^= bitMask;
      }
    }
  } else if (currentFormat === FORMAT.ATTR_53C) {
    // .53c: swap ink and paper in attributes
    const cellLeft = Math.floor(rect.left / 8);
    const cellTop = Math.floor(rect.top / 8);
    const cellRight = Math.ceil((rect.left + rect.width) / 8);
    const cellBottom = Math.ceil((rect.top + rect.height) / 8);

    for (let cy = cellTop; cy < cellBottom; cy++) {
      for (let cx = cellLeft; cx < cellRight; cx++) {
        const addr = cx + cy * 32;
        const attr = screenData[addr];
        const ink = attr & 0x07;
        const paper = (attr >> 3) & 0x07;
        const flags = attr & 0xC0;  // bright and flash
        screenData[addr] = (ink << 3) | paper | flags;
      }
    }
  } else {
    // SCR/IFL/MLT/BMC4/BSC: XOR bitmap bits (attributes unchanged)
    for (let py = 0; py < rect.height; py++) {
      for (let px = 0; px < rect.width; px++) {
        const x = rect.left + px;
        const y = rect.top + py;
        const addr = getBitmapAddress(x, y);
        const bitMask = 0x80 >> (x % 8);
        screenData[addr] ^= bitMask;
      }
    }
  }

  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = `Inverted ${rect.width}×${rect.height} pixels`;
  }

  editorRender();
}

/**
 * Enters paste preview mode if clipboard has compatible data
 */
function startPasteMode() {
  const infoEl = document.getElementById('editorPositionInfo');
  if (!clipboardData) {
    if (infoEl) infoEl.innerHTML = 'Clipboard empty — copy a selection first';
    return;
  }

  // Validate format match
  const editorFormat = currentFormat === FORMAT.SPECSCII ? 'specscii' :
                       currentFormat === FORMAT.ATTR_53C ? '53c' :
                       currentFormat === FORMAT.IFL ? 'ifl' :
                       currentFormat === FORMAT.MLT ? 'mlt' : 'scr';
  if (clipboardData.format !== editorFormat) {
    if (infoEl) {
      infoEl.innerHTML = 'Clipboard format mismatch (' + clipboardData.format + ' vs ' + editorFormat + ')';
    }
    return;
  }

  isPasting = true;
  // Fully exit select mode — clear selection state and deselect tool
  isSelecting = false;
  selectionStartPoint = null;
  selectionEndPoint = null;
  currentTool = '';
  (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
    btn.classList.remove('selected');
  });
  if (infoEl) infoEl.innerHTML = 'Click to place — Escape to cancel';
  editorRender();
}

/**
 * Writes clipboard bitmap+attrs to screen at the given position
 * @param {number} x - Top-left X of paste destination (pixel coords)
 * @param {number} y - Top-left Y of paste destination (pixel coords)
 */
function executePaste(x, y) {
  if (!clipboardData || !screenData) return;

  // Snap paste position
  const snapped = snapPastePosition(x, y);
  x = snapped.x;
  y = snapped.y;

  // Record origin for 'brush' snap mode on first paste
  if (snapMode === 'brush' && !brushSnapOrigin) {
    brushSnapOrigin = { x, y };
  }

  saveUndoState();

  if (clipboardData.format === 'scr' && clipboardData.bitmap) {
    // For dual-plane targets (pure gigascreen editables or chr$ with gigascreen
    // colorMode, both using 8-row attr cells), mirror data to plane[1] too.
    // If the clipboard came from a gigascreen source it carries bitmap2/attrs2;
    // otherwise (SCR source) we mirror plane[0] data to make both frames identical.
    const pasteGigaInfo = getGigaPasteInfo();
    const targetGiga = pasteGigaInfo.isGiga;
    const gigaFS = pasteGigaInfo.frameSize;
    const clipBitmap2 = clipboardData.bitmap2 || clipboardData.bitmap;
    const clipAttrs2 = clipboardData.attrs2 || clipboardData.attrs;
    const setMode = brushPaintMode === 'set';
    const bitmapBytesPerRow = Math.ceil(clipboardData.width / 8);

    // In 'set' mode, precompute which source cells contain any ink pixel.
    // Used by both the bitmap loop (to mirror plane[0]->plane[1] inside touched
    // cells on gigascreen targets, so paper pixels stay consistent between the
    // two frames instead of showing stale plane[1] data) and the attr loop
    // (to skip attr updates for cells with no source ink, which would otherwise
    // paint new colors over old pixels and produce a "blended" look).
    let cellHasInk = null;
    if (setMode) {
      cellHasInk = new Uint8Array(clipboardData.cellRows * clipboardData.cellCols);
      for (let cr = 0; cr < clipboardData.cellRows; cr++) {
        for (let cc = 0; cc < clipboardData.cellCols; cc++) {
          const cellTopPx = cr * 8;
          const cellLeftPx = cc * 8;
          let hasInk = 0;
          for (let cy = 0; cy < 8 && !hasInk; cy++) {
            const py = cellTopPx + cy;
            if (py >= clipboardData.height) break;
            for (let cx = 0; cx < 8; cx++) {
              const px = cellLeftPx + cx;
              if (px >= clipboardData.width) break;
              const byteIdx = py * bitmapBytesPerRow + (px >> 3);
              const bitIdx = 7 - (px & 7);
              if ((clipboardData.bitmap[byteIdx] & (1 << bitIdx)) !== 0) {
                hasInk = 1;
                break;
              }
            }
          }
          cellHasInk[cr * clipboardData.cellCols + cc] = hasInk;
        }
      }
    }

    // Write bitmap pixels — respects brushPaintMode (skip for recolor mode)
    if (brushPaintMode !== 'recolor') {
      const pasteW = getFormatWidth();
      const pasteH = getFormatHeight();
      for (let py = 0; py < clipboardData.height; py++) {
        for (let px = 0; px < clipboardData.width; px++) {
          const dx = x + px;
          const dy = y + py;
          if (dx < 0 || dx >= pasteW || dy < 0 || dy >= pasteH) continue;

          const byteIdx = py * bitmapBytesPerRow + (px >> 3);
          const bitIdx = 7 - (px & 7);
          const clipBit = (clipboardData.bitmap[byteIdx] & (1 << bitIdx)) !== 0;
          const clipBit2 = targetGiga ? (clipBitmap2[byteIdx] & (1 << bitIdx)) !== 0 : false;

          const bitmapAddr = getBitmapAddress(dx, dy);
          const bit = getBitPosition(dx);
          const mask = 1 << bit;

          if (brushPaintMode === 'invert') {
            // XOR: toggle screen pixel where clipboard has ink
            if (clipBit) {
              screenData[bitmapAddr] ^= mask;
            }
            if (targetGiga && clipBit2) {
              screenData[gigaFS + bitmapAddr] ^= mask;
            }
          } else if (setMode) {
            // Set: only write ink pixels, leave paper pixels untouched
            if (clipBit) {
              screenData[bitmapAddr] |= mask;
            }
            if (targetGiga) {
              // Inside cells that receive source ink, force plane[1] to mirror
              // plane[0]'s post-write bit so the two frames don't show mismatched
              // paper pixels through the blend. Cells with no source ink are
              // left untouched in both planes.
              const srcCellIdx = (py >> 3) * clipboardData.cellCols + (px >> 3);
              if (cellHasInk[srcCellIdx]) {
                if ((screenData[bitmapAddr] >> bit) & 1) {
                  screenData[gigaFS + bitmapAddr] |= mask;
                } else {
                  screenData[gigaFS + bitmapAddr] &= ~mask;
                }
              }
            }
          } else {
            // Replace (default): overwrite every pixel from clipboard
            if (clipBit) {
              screenData[bitmapAddr] |= mask;
            } else {
              screenData[bitmapAddr] &= ~mask;
            }
            if (targetGiga) {
              if (clipBit2) {
                screenData[gigaFS + bitmapAddr] |= mask;
              } else {
                screenData[gigaFS + bitmapAddr] &= ~mask;
              }
            }
          }
        }
      }
    }

    // Write attributes from clipboard (skip for retouch mode)
    if (brushPaintMode !== 'retouch') {
      const cellLeft = Math.floor(x / 8);
      const cellTop = Math.floor(y / 8);
      const fmtCols = getFormatWidth() >> 3;
      const fmtRows = Math.ceil(getFormatHeight() / 8);
      for (let cr = 0; cr < clipboardData.cellRows; cr++) {
        for (let cc = 0; cc < clipboardData.cellCols; cc++) {
          const destCol = cellLeft + cc;
          const destRow = cellTop + cr;
          if (destCol < 0 || destCol >= fmtCols || destRow < 0 || destRow >= fmtRows) continue;
          const srcIdx = cr * clipboardData.cellCols + cc;
          if (setMode && !cellHasInk[srcIdx]) continue;
          const destAddr = getAttributeAddress(destCol * 8, destRow * 8);
          screenData[destAddr] = clipboardData.attrs[srcIdx];
          if (targetGiga) {
            screenData[gigaFS + destAddr] = clipAttrs2[srcIdx];
          }
        }
      }
    }
  } else if (clipboardData.format === 'ifl' && clipboardData.bitmap) {
    // IFL: write bitmap pixels (skip for recolor mode)
    if (brushPaintMode !== 'recolor') {
      const bitmapBytesPerRow = Math.ceil(clipboardData.width / 8);
      for (let py = 0; py < clipboardData.height; py++) {
        for (let px = 0; px < clipboardData.width; px++) {
          const dx = x + px;
          const dy = y + py;
          if (dx < 0 || dx >= SCREEN.WIDTH || dy < 0 || dy >= SCREEN.HEIGHT) continue;

          const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
          const bitIdx = 7 - (px % 8);
          const clipBit = (clipboardData.bitmap[byteIdx] & (1 << bitIdx)) !== 0;

          const bitmapAddr = getBitmapAddress(dx, dy);
          const bit = getBitPosition(dx);

          if (brushPaintMode === 'invert') {
            if (clipBit) {
              screenData[bitmapAddr] ^= (1 << bit);
            }
          } else if (brushPaintMode === 'set') {
            if (clipBit) {
              screenData[bitmapAddr] |= (1 << bit);
            }
          } else {
            if (clipBit) {
              screenData[bitmapAddr] |= (1 << bit);
            } else {
              screenData[bitmapAddr] &= ~(1 << bit);
            }
          }
        }
      }
    }

    // Write IFL attributes (8×2 blocks) - skip for retouch mode
    if (brushPaintMode !== 'retouch') {
      const cellLeft = Math.floor(x / 8);
      const attrTop = Math.floor(y / 2);  // IFL: 2-pixel attr rows
      for (let ar = 0; ar < clipboardData.attrRows; ar++) {
        for (let cc = 0; cc < clipboardData.cellCols; cc++) {
          const destCol = cellLeft + cc;
          const destRow = attrTop + ar;
          if (destCol < 0 || destCol >= IFL.ATTR_COLS || destRow < 0 || destRow >= IFL.ATTR_ROWS) continue;
          const destAddr = IFL.BITMAP_SIZE + destCol + destRow * 32;
          screenData[destAddr] = clipboardData.attrs[ar * clipboardData.cellCols + cc];
        }
      }
    }
  } else if (clipboardData.format === 'mlt' && clipboardData.bitmap) {
    // MLT: write bitmap pixels (skip for recolor mode)
    if (brushPaintMode !== 'recolor') {
      const bitmapBytesPerRow = Math.ceil(clipboardData.width / 8);
      for (let py = 0; py < clipboardData.height; py++) {
        for (let px = 0; px < clipboardData.width; px++) {
          const dx = x + px;
          const dy = y + py;
          if (dx < 0 || dx >= SCREEN.WIDTH || dy < 0 || dy >= SCREEN.HEIGHT) continue;

          const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
          const bitIdx = 7 - (px % 8);
          const clipBit = (clipboardData.bitmap[byteIdx] & (1 << bitIdx)) !== 0;

          const bitmapAddr = getBitmapAddress(dx, dy);
          const bit = getBitPosition(dx);

          if (brushPaintMode === 'invert') {
            if (clipBit) {
              screenData[bitmapAddr] ^= (1 << bit);
            }
          } else if (brushPaintMode === 'set') {
            if (clipBit) {
              screenData[bitmapAddr] |= (1 << bit);
            }
          } else {
            if (clipBit) {
              screenData[bitmapAddr] |= (1 << bit);
            } else {
              screenData[bitmapAddr] &= ~(1 << bit);
            }
          }
        }
      }
    }

    // Write MLT attributes (8×1 blocks - one per pixel line) - skip for retouch mode
    if (brushPaintMode !== 'retouch') {
      const cellLeft = Math.floor(x / 8);
      for (let ar = 0; ar < clipboardData.attrRows; ar++) {
        for (let cc = 0; cc < clipboardData.cellCols; cc++) {
          const destCol = cellLeft + cc;
          const destRow = y + ar;  // MLT: one attr row per pixel line
          if (destCol < 0 || destCol >= MLT.ATTR_COLS || destRow < 0 || destRow >= MLT.ATTR_ROWS) continue;
          const destAddr = MLT.BITMAP_SIZE + destCol + destRow * 32;
          screenData[destAddr] = clipboardData.attrs[ar * clipboardData.cellCols + cc];
        }
      }
    }
  } else if (clipboardData.format === '53c') {
    // .53c: write attributes only (skip for retouch mode since 53c has no bitmap)
    if (brushPaintMode !== 'retouch') {
      const cellLeft = Math.floor(x / 8);
      const cellTop = Math.floor(y / 8);
      for (let cr = 0; cr < clipboardData.cellRows; cr++) {
        for (let cc = 0; cc < clipboardData.cellCols; cc++) {
          const destCol = cellLeft + cc;
          const destRow = cellTop + cr;
          if (destCol < 0 || destCol >= SCREEN.CHAR_COLS || destRow < 0 || destRow >= SCREEN.CHAR_ROWS) continue;
          const destAddr = destCol + destRow * 32;
          screenData[destAddr] = clipboardData.attrs[cr * clipboardData.cellCols + cc];
        }
      }
    }
  } else if (clipboardData.format === 'specscii') {
    // SPECSCII: write character codes + attributes + mask to grids
    if (!specsciiCharGrid || !specsciiAttrGrid) { isPasting = false; return; }
    const cellLeft = Math.floor(x / 8);
    const cellTop = Math.floor(y / 8);
    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const destCol = cellLeft + cc;
        const destRow = cellTop + cr;
        if (destCol < 0 || destCol >= SPECSCII.CHAR_COLS || destRow < 0 || destRow >= SPECSCII.CHAR_ROWS) continue;
        const destIdx = destRow * 32 + destCol;
        const srcIdx = cr * clipboardData.cellCols + cc;

        if (brushPaintMode === 'invert') {
          // Swap ink/paper of destination cell
          const old = specsciiAttrGrid[destIdx];
          const oldInk = old & 0x07;
          const oldPaper = (old >> 3) & 0x07;
          specsciiAttrGrid[destIdx] = (oldPaper & 0x07) | ((oldInk & 0x07) << 3) | (old & 0xC0);
        } else if (brushPaintMode === 'recolor') {
          // Change attribute only, keep existing character
          specsciiAttrGrid[destIdx] = clipboardData.attrs[srcIdx];
        } else {
          // Replace: write both character and attribute
          specsciiCharGrid[destIdx] = clipboardData.chars[srcIdx];
          specsciiAttrGrid[destIdx] = clipboardData.attrs[srcIdx];
        }
        if (specsciiMask) specsciiMask[destIdx] = clipboardData.mask ? clipboardData.mask[srcIdx] : 1;

        // Sync to layer if layers enabled
        if (layersEnabled && layers.length > 0) {
          const layer = layers[activeLayerIndex];
          if (layer) {
            if (layer.bitmap) layer.bitmap[destIdx] = specsciiCharGrid[destIdx];
            if (layer.attributes) layer.attributes[destIdx] = specsciiAttrGrid[destIdx];
            if (layer.mask) layer.mask[destIdx] = specsciiMask ? specsciiMask[destIdx] : 1;
          }
        }
      }
    }
    specsciiSyncToStream();
  }

  // Sync internal picture format after paste
  syncCurrentPicture();

  isPasting = false;
  editorRender();
}

/**
 * Draws a cyan dashed rectangle while dragging to define selection
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function drawSelectionPreview(x0, y0, x1, y1) {
  const ctx = screenCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  let left = Math.min(x0, x1);
  let top = Math.min(y0, y1);
  let right = Math.max(x0, x1);
  let bottom = Math.max(y0, y1);

  if (isSnapActive()) {
    left = Math.floor(left / 8) * 8;
    top = Math.floor(top / 8) * 8;
    right = Math.floor(right / 8) * 8 + 7;
    bottom = Math.floor(bottom / 8) * 8 + 7;
  }

  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(getFormatWidth() - 1, right);
  bottom = Math.min(getFormatHeight() - 1, bottom);

  const borderPixels = getMainScreenOffset();
  const w = right - left + 1;
  const h = bottom - top + 1;
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SELECTION_COLOR) || 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + left * zoom,
    borderPixels + top * zoomY,
    w * zoom,
    h * zoomY
  );
  ctx.setLineDash([]);
}

/**
 * Draws a cyan dashed rectangle for the committed (finalized) selection
 */
function drawFinalizedSelectionOverlay() {
  const rect = getSelectionRect();
  if (!rect) return;

  const ctx = screenCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SELECTION_COLOR) || 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + rect.left * zoom,
    borderPixels + rect.top * zoomY,
    rect.width * zoom,
    rect.height * zoomY
  );
  ctx.setLineDash([]);
}

/**
 * Draws a semi-transparent preview of clipboard content at the cursor position
 * @param {number} x - Top-left X (pixel coords)
 * @param {number} y - Top-left Y (pixel coords)
 */
function drawPastePreview(x, y) {
  if (!clipboardData) return;

  const ctx = screenCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  const snapped = snapPastePosition(x, y);
  x = snapped.x;
  y = snapped.y;

  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  ctx.save();
  ctx.globalAlpha = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.PASTE_PREVIEW_OPACITY) || 0.5;

  if (clipboardData.format === 'scr' && clipboardData.bitmap) {
    // Draw bitmap pixels
    const bitmapBytesPerRow = Math.ceil(clipboardData.width / 8);
    for (let py = 0; py < clipboardData.height; py++) {
      for (let px = 0; px < clipboardData.width; px++) {
        const dx = x + px;
        const dy = y + py;
        if (dx < 0 || dx >= getFormatWidth() || dy < 0 || dy >= getFormatHeight()) continue;

        const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
        const bitIdx = 7 - (px % 8);
        const isSet = (clipboardData.bitmap[byteIdx] & (1 << bitIdx)) !== 0;

        // Determine color from clipboard attributes
        const cellCol = Math.floor(px / 8);
        const cellRow = Math.floor(py / 8);
        const attrIdx = cellRow * clipboardData.cellCols + cellCol;
        const attr = clipboardData.attrs[attrIdx];
        const { inkRgb, paperRgb } = getColorsRgb(attr);
        const rgb = isSet ? inkRgb : paperRgb;

        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(
          borderPixels + dx * zoom,
          borderPixels + dy * zoomY,
          zoom,
          zoomY
        );
      }
    }
  } else if (clipboardData.format === '53c') {
    // Draw attribute cells as colored blocks
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('pattern53cSelect'));
    const patternName = select?.value || 'checker';

    // Get pattern array from config (8 bytes, one per row, MSB = leftmost pixel)
    let patternArray;
    if (patternName === 'stripes') {
      patternArray = APP_CONFIG.PATTERN_53C_STRIPES;
    } else if (patternName === 'dd77') {
      patternArray = APP_CONFIG.PATTERN_53C_DD77;
    } else {
      patternArray = APP_CONFIG.PATTERN_53C_CHECKER;
    }

    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const cellX = x + cc * 8;
        const cellY = y + cr * 8;
        const attr = clipboardData.attrs[cr * clipboardData.cellCols + cc];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        for (let py = 0; py < 8; py++) {
          const patternByte = patternArray[py];
          for (let px = 0; px < 8; px++) {
            const dx = cellX + px;
            const dy = cellY + py;
            if (dx < 0 || dx >= getFormatWidth() || dy < 0 || dy >= getFormatHeight()) continue;

            const isInk = (patternByte & (1 << (7 - px))) !== 0;
            const rgb = isInk ? inkRgb : paperRgb;

            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(
              borderPixels + dx * zoom,
              borderPixels + dy * zoomY,
              zoom,
              zoomY
            );
          }
        }
      }
    }
  } else if (clipboardData.format === 'specscii') {
    // SPECSCII: draw characters with attributes using font data
    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const cellX = x + cc * 8;
        const cellY = y + cr * 8;
        const srcIdx = cr * clipboardData.cellCols + cc;
        const ch = clipboardData.chars[srcIdx];
        const attr = clipboardData.attrs[srcIdx];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        for (let py = 0; py < 8; py++) {
          const glyphByte = typeof specsciiGetGlyphByte === 'function' ? specsciiGetGlyphByte(ch, py) : 0;
          for (let px = 0; px < 8; px++) {
            const dx = cellX + px;
            const dy = cellY + py;
            if (dx < 0 || dx >= getFormatWidth() || dy < 0 || dy >= getFormatHeight()) continue;

            const isInk = (glyphByte & (1 << (7 - px))) !== 0;
            const rgb = isInk ? inkRgb : paperRgb;

            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(
              borderPixels + dx * zoom,
              borderPixels + dy * zoomY,
              zoom,
              zoomY
            );
          }
        }
      }
    }
  }

  ctx.restore();

  // Draw outline around paste region
  const pw = clipboardData.format === 'scr' ? clipboardData.width : clipboardData.cellCols * 8;
  const ph = clipboardData.format === 'scr' ? clipboardData.height : clipboardData.cellRows * 8;

  ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SELECTION_COLOR) || 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + x * zoom,
    borderPixels + y * zoomY,
    pw * zoom,
    ph * zoomY
  );
  ctx.setLineDash([]);
}

/**
 * Clears all selection and paste state
 */
function cancelSelection() {
  selectionStartPoint = null;
  selectionEndPoint = null;
  isSelecting = false;
  isPasting = false;
  brushSnapOrigin = null;
  editorRender();
}

// ============================================================================
// Mouse Handling
// ============================================================================

/**
 * Converts canvas coords to screen coords
 * @param {HTMLCanvasElement} canvas
 * @param {MouseEvent} event
 * @returns {{x: number, y: number}|null}
 */
function canvasToScreenCoords(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // When canvas is viewport-capped (sticky mode), rendering uses a scroll transform,
  // so we must add scroll offsets. When canvas is full logical size,
  // getBoundingClientRect already accounts for scroll — don't add offsets.
  const container = document.getElementById('canvasContainer');
  const wrapper = document.getElementById('canvasWrapper');
  const isViewportCapped = wrapper && container &&
    (canvas.width < wrapper.offsetWidth || canvas.height < wrapper.offsetHeight);
  const scrollX = isViewportCapped && container ? container.scrollLeft : 0;
  const scrollY = isViewportCapped && container ? container.scrollTop : 0;

  const borderPixels = borderSize * zoom;
  const scaleY = getPixelScaleY();
  const screenX = Math.floor((canvasX + scrollX - borderPixels) / zoom);
  const screenY = Math.floor((canvasY + scrollY - borderPixels) / (zoom * scaleY));

  if (screenX < 0 || screenX >= getFormatWidth() || screenY < 0 || screenY >= getFormatHeight()) {
    return null;
  }

  return { x: screenX, y: screenY };
}

/**
 * @param {MouseEvent} event
 */
function handleEditorMouseDown(event) {
  if (!editorActive) return;
  if (document.getElementById('spriteGrabOverlay')) return;
  event.preventDefault();

  // Ensure canvas has focus for keyboard shortcuts
  if (screenCanvas && document.activeElement !== screenCanvas) {
    screenCanvas.focus();
  }

  // BSC/BMC4 dispatch: route to main screen or border handler
  if (isBorderFormatEditor()) {
    const bsc = canvasToBscCoords(screenCanvas, event);
    if (!bsc) return;

    if (bsc.type === 'main') {
      bscDrawRegion = 'main';
      // Fall through to existing SCR logic with translated coords
      const coords = { x: bsc.x, y: bsc.y };
      _handleEditorMouseDownCoords(event, coords);
    } else if (isBorderEditable()) {
      // Border editing for BSC and BMC4
      bscDrawRegion = 'border';
      handleBorderMouseDown(event, bsc);
    }
    return;
  }

  const coords = canvasToScreenCoords(screenCanvas, event);
  if (!coords) return;
  _handleEditorMouseDownCoords(event, coords);
}

/**
 * Core mouse-down logic shared by SCR and BSC (main area).
 * @param {MouseEvent} event
 * @param {{x:number, y:number}} coords
 */
function _handleEditorMouseDownCoords(event, coords) {
  // Intercept for brush capture (two-click rectangle selection)
  if (capturingBrush) {
    if (!captureStartPoint) {
      // First click: set start corner
      captureStartPoint = { x: coords.x, y: coords.y };
      const infoEl = document.getElementById('editorPositionInfo');
      if (infoEl) {
        infoEl.innerHTML = 'Click second corner (max 64\u00d764)';
      }
    } else {
      // Second click: capture the rectangle
      finishBrushCapture(captureStartPoint.x, captureStartPoint.y, coords.x, coords.y);
    }
    return;
  }

  // Intercept for tileset capture (two-click rectangle selection)
  if (capturingTileset) {
    if (!tilesetCaptureStart) {
      // First click: set start corner (snap to 8px grid)
      tilesetCaptureStart = { x: coords.x, y: coords.y };
      const infoEl = document.getElementById('editorPositionInfo');
      if (infoEl) {
        infoEl.innerHTML = 'Click second corner (will snap to 8px grid)';
      }
    } else {
      // Second click: capture the rectangle as tileset
      finishTilesetCapture(tilesetCaptureStart.x, tilesetCaptureStart.y, coords.x, coords.y);
    }
    return;
  }

  // Alt+click: color picker (eyedropper) - picks both ink and paper from cell
  // Skip for tools that use Alt as modifier (rect, circle, gradient use Alt for "from center")
  const toolUsesAlt = currentTool === EDITOR.TOOL_RECT ||
                      currentTool === EDITOR.TOOL_CIRCLE ||
                      currentTool === EDITOR.TOOL_GRADIENT;
  if (event.altKey && !toolUsesAlt) {
    const pickInk = event.button !== 2;
    if (pickColorFromCanvas(coords.x, coords.y, pickInk)) {
      editorRender();
    }
    return;
  }

  // Color picker tool: pick color from canvas
  if (currentTool === EDITOR.TOOL_COLOR_PICKER) {
    const pickInk = event.button !== 2;
    if (pickColorFromCanvas(coords.x, coords.y, pickInk)) {
      editorRender();
    }
    return;
  }

  // Paste mode: click to execute paste
  if (isPasting) {
    executePaste(coords.x, coords.y);
    return;
  }

  // Text tool: click to stamp text
  if (currentTool === EDITOR.TOOL_TEXT && isPlacingText) {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('textToolInput'));
    textToolInput = input?.value || '';
    if (textToolInput.length > 0) {
      if (isSpecsciiEditor()) {
        // SPECSCII text: place characters directly into grid
        // Respects paint mode: set=place char+attr, recolor=attr only, invert=swap ink/paper
        saveUndoState();
        const g = specsciiPixelToGrid(coords.x, coords.y);
        let col = g.col;
        let row = g.row;
        for (let i = 0; i < textToolInput.length; i++) {
          if (col >= SPECSCII.CHAR_COLS) { col = 0; row++; }
          if (row >= SPECSCII.CHAR_ROWS) break;
          const charCode = textToolInput.charCodeAt(i);
          if ((charCode >= 0x20 && charCode <= 0x7F) || (charCode >= 0x80 && charCode <= 0x8F)) {
            const idx = row * 32 + col;
            let ch, attr;
            if (brushPaintMode === 'invert') {
              const old = specsciiAttrGrid[idx];
              const oldInk = old & 0x07;
              const oldPaper = (old >> 3) & 0x07;
              attr = (oldPaper & 0x07) | ((oldInk & 0x07) << 3) | (old & 0xC0);
              ch = specsciiCharGrid[idx];
            } else if (brushPaintMode === 'recolor') {
              attr = getCurrentDrawingAttribute();
              ch = specsciiCharGrid[idx];
            } else {
              attr = getCurrentDrawingAttribute();
              ch = charCode;
            }
            specsciiCharGrid[idx] = ch;
            specsciiAttrGrid[idx] = attr;
            if (specsciiMask) specsciiMask[idx] = 1;
            // Update layer data when layers are enabled
            if (layersEnabled && layers.length > 0) {
              const layer = layers[activeLayerIndex];
              if (layer) {
                if (layer.bitmap) layer.bitmap[idx] = ch;
                if (layer.attributes) layer.attributes[idx] = attr;
                if (layer.mask) layer.mask[idx] = 1;
              }
            }
            col++;
          }
        }
        specsciiSyncToStream();
        editorRender();
      } else {
        stampText(coords.x, coords.y);
      }
    }
    return;
  }

  // Transform tab selection mode: start selection drag
  if (transformSelectActive) {
    const snapped = transformSnapToGrid ? { x: Math.floor(coords.x / 8) * 8, y: Math.floor(coords.y / 8) * 8 } : coords;
    selectionStartPoint = { x: snapped.x, y: snapped.y };
    selectionEndPoint = null;
    isSelecting = true;
    editorRender();
    return;
  }

  // Select tool: start selection drag (works in both .scr and .53c)
  if (currentTool === EDITOR.TOOL_SELECT) {
    // Snap selection to grid when snap is active
    const snapped = isSnapActive() ? { x: Math.floor(coords.x / 8) * 8, y: Math.floor(coords.y / 8) * 8 } : coords;
    selectionStartPoint = { x: snapped.x, y: snapped.y };
    selectionEndPoint = null;
    isSelecting = true;
    editorRender();
    updateEditorInfo(snapped.x, snapped.y);
    return;
  }

  // .53c attribute editor: free-draw tools paint cells directly
  if (isAttrEditor() && (currentTool === EDITOR.TOOL_PIXEL || currentTool === EDITOR.TOOL_RECOLOR ||
      currentTool === EDITOR.TOOL_ERASER)) {
    saveUndoState();
    isDrawing = true;
    if (currentTool === EDITOR.TOOL_ERASER) {
      eraseCell53c(coords.x, coords.y);
    } else {
      recolorCell53c(coords.x, coords.y);
    }
    editorRender();
    updateEditorInfo(coords.x, coords.y);
    return;
  }

  // SPECSCII editor: all tools operate on character grid
  if (isSpecsciiEditor()) {
    const g = specsciiPixelToGrid(coords.x, coords.y);

    // Right-click: pick character + attribute from cell
    if (event.button === 2) {
      specsciiPickFromCell(g.col, g.row);
      updateEditorInfo(coords.x, coords.y);
      return;
    }

    saveUndoState();
    isDrawing = true;
    lastDrawnPixel = { x: g.col, y: g.row };

    switch (currentTool) {
      case EDITOR.TOOL_LINE:
      case EDITOR.TOOL_RECT:
      case EDITOR.TOOL_CIRCLE:
        toolStartPoint = { x: g.col, y: g.row };
        break;

      case EDITOR.TOOL_PIXEL:
        specsciiPlotCell(g.col, g.row);
        specsciiSyncToStream();
        editorRender();
        break;

      case EDITOR.TOOL_FILL_CELL:
      case EDITOR.TOOL_RECOLOR:
        specsciiRecolorCell(g.col, g.row);
        specsciiSyncToStream();
        editorRender();
        break;

      case EDITOR.TOOL_FLOOD_FILL:
        specsciiFloodFill(g.col, g.row);
        specsciiSyncToStream();
        editorRender();
        break;

      case EDITOR.TOOL_ERASER:
        specsciiEraseCell(g.col, g.row);
        specsciiSyncToStream();
        editorRender();
        break;

      case EDITOR.TOOL_TEXT:
        // Text handled separately above
        break;
    }

    updateEditorInfo(coords.x, coords.y);
    return;
  }

  // Auto-show hidden layer when drawing on it
  if (layersEnabled && layers.length > 0 && layers[activeLayerIndex] && !layers[activeLayerIndex].visible) {
    layers[activeLayerIndex].visible = true;
    updateLayerPanel();
    flattenLayersToScreen();
  }

  saveUndoState();
  isDrawing = true;

  const snapped = snapDrawCoords(coords.x, coords.y);

  // Set stroke origin for masked+ mode
  if (brushPaintMode === 'masked+') {
    maskStrokeOrigin = { x: snapped.x, y: snapped.y };
  }
  lastDrawnPixel = snapped;

  // Left click = ink, Right click = paper
  const isInk = event.button !== 2;

  // Deferred stroke for big pictures: collect path, draw on release
  const deferred = useDeferredStroke() &&
    (currentTool === EDITOR.TOOL_PIXEL || currentTool === EDITOR.TOOL_ERASER || currentTool === EDITOR.TOOL_AIRBRUSH);
  if (deferred) {
    deferredStrokePath = [{ x: snapped.x, y: snapped.y }];
    deferredStrokeIsInk = isInk;
    deferredStrokeTool = currentTool;
    editorRender();
    return;
  }

  switch (currentTool) {
    case EDITOR.TOOL_LINE:
    case EDITOR.TOOL_RECT:
    case EDITOR.TOOL_CIRCLE:
    case EDITOR.TOOL_GRADIENT:
      toolStartPoint = snapped;
      break;

    case EDITOR.TOOL_PIXEL:
      drawPixel(snapped.x, snapped.y, isInk);
      editorRender();
      break;

    case EDITOR.TOOL_FILL_CELL:
      fillCell(coords.x, coords.y, isInk);
      editorRender();
      break;

    case EDITOR.TOOL_FLOOD_FILL:
      floodFill(coords.x, coords.y, isInk);
      editorRender();
      break;

    case EDITOR.TOOL_RECOLOR:
      recolorCell(coords.x, coords.y);
      editorRender();
      break;

    case EDITOR.TOOL_ERASER:
      drawEraser(snapped.x, snapped.y);
      editorRender();
      break;

    case EDITOR.TOOL_AIRBRUSH:
      drawAirbrush(snapped.x, snapped.y, isInk);
      editorRender();
      // Start continuous spray interval
      airbrushCurrentPos = { x: snapped.x, y: snapped.y, isInk };
      if (airbrushIntervalId) clearInterval(airbrushIntervalId);
      airbrushIntervalId = setInterval(() => {
        if (airbrushCurrentPos) {
          drawAirbrush(airbrushCurrentPos.x, airbrushCurrentPos.y, airbrushCurrentPos.isInk);
          scheduleRender();
        }
      }, 50);
      break;
  }

  updateEditorInfo(coords.x, coords.y);
}

/**
 * @param {MouseEvent} event
 */
function handleEditorMouseMove(event) {
  if (!editorActive) return;

  // BSC/BMC4 dispatch
  if (isBorderFormatEditor()) {
    const bsc = canvasToBscCoords(screenCanvas, event);
    if (!bsc) return;

    if (bsc.type === 'main') {
      // If drawing border rectangle, show preview even when over main area
      if (bscDrawRegion === 'border' && currentTool === EDITOR.TOOL_RECT && borderRectStart && isBorderDrawing) {
        const frameX = bsc.x + 64; // Convert main coords to frame coords
        const frameY = bsc.y + 64;
        editorRender();
        drawBorderRectPreview(borderRectStart.frameX, borderRectStart.frameY, frameX, frameY);
        updateEditorInfo(bsc.x, bsc.y);
        return;
      }
      // Ignore other operations if mouseDown started in border
      if (bscDrawRegion === 'border') {
        updateEditorInfo(bsc.x, bsc.y);
        return;
      }
      const coords = { x: bsc.x, y: bsc.y };
      _handleEditorMouseMoveCoords(event, coords);
    } else {
      // Ignore if mouseDown started in main
      if (bscDrawRegion === 'main') {
        updateBscEditorInfo(bsc);
        return;
      }
      // Border handling for BSC and BMC4
      if (isBorderEditable()) {
        handleBorderMouseMove(event, bsc);
      }
      // Handle brush preview on border (or barcode preview)
      const needsBorderPreview = brushPreviewMode || barcodeCaptureSlot >= 0 ||
                                  (barcodeMode && activeBarcode >= 0 && barcodes[activeBarcode]);
      if (needsBorderPreview) {
        brushPreviewPos = null;
        borderPreviewPos = { frameX: bsc.frameX, frameY: bsc.frameY };
        if (event.buttons === 0) {
          editorRender();
          drawBorderBrushPreview();
        }
      }
    }
    return;
  }

  const coords = canvasToScreenCoords(screenCanvas, event);
  _handleEditorMouseMoveCoords(event, coords);
}

/**
 * Core mouse-move logic shared by SCR and BSC (main area).
 * @param {MouseEvent} event
 * @param {{x:number, y:number}|null} coords
 */
function _handleEditorMouseMoveCoords(event, coords) {
  if (coords) {
    updateEditorInfo(coords.x, coords.y);
    pasteCursorPos = { x: coords.x, y: coords.y };
    brushPreviewPos = { x: coords.x, y: coords.y };
    borderPreviewPos = null;  // Clear border preview when on main area
  } else if (brushPreviewMode) {
    // Cursor moved outside main screen area - clear brush preview
    brushPreviewPos = null;
    editorRender();  // Clear stale preview
  }

  // Brush preview mode: show overlay when no buttons pressed
  if (brushPreviewMode && coords && event.buttons === 0) {
    // No buttons pressed - show preview, reset any stuck isDrawing state
    stopAirbrushInterval();
    isDrawing = false;
    editorRender();
    drawBrushPreview();
    return;
  }

  // Paste preview: redraw with paste overlay at cursor
  if (isPasting && coords) {
    editorRender();
    drawPastePreview(coords.x, coords.y);
    return;
  }

  // Text tool preview: show text at cursor position
  if (currentTool === EDITOR.TOOL_TEXT && isPlacingText && coords) {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('textToolInput'));
    textToolInput = input?.value || '';
    textPreviewPos = { x: coords.x, y: coords.y };
    editorRender();
    if (textToolInput.length > 0) {
      drawTextPreview(coords.x, coords.y);
    }
    return;
  }

  // Show capture selection rectangle preview
  if (capturingBrush && captureStartPoint && coords) {
    editorRender();
    drawCapturePreview(captureStartPoint.x, captureStartPoint.y, coords.x, coords.y);
    return;
  }

  // Show tileset capture selection rectangle preview
  if (capturingTileset && tilesetCaptureStart && coords) {
    editorRender();
    drawTilesetCapturePreview(tilesetCaptureStart.x, tilesetCaptureStart.y, coords.x, coords.y);
    return;
  }

  // Selection drag: update preview (for both Edit tab select tool and Transform tab selection)
  if (isSelecting && selectionStartPoint && coords) {
    editorRender();
    // Use transform snap setting when in transform mode, otherwise use Edit tab snap
    const useSnap = transformSelectActive ? transformSnapToGrid : isSnapActive();
    if (useSnap) {
      const endX = Math.ceil((coords.x + 1) / 8) * 8 - 1;
      const endY = Math.ceil((coords.y + 1) / 8) * 8 - 1;
      drawSelectionPreview(selectionStartPoint.x, selectionStartPoint.y, endX, endY);
    } else {
      drawSelectionPreview(selectionStartPoint.x, selectionStartPoint.y, coords.x, coords.y);
    }
    return;
  }

  if (!coords) return;

  // .53c attribute editor: drag-paint cells for free-draw tools
  if (isAttrEditor() && (currentTool === EDITOR.TOOL_PIXEL || currentTool === EDITOR.TOOL_RECOLOR ||
      currentTool === EDITOR.TOOL_ERASER)) {
    if (isDrawing) {
      if (currentTool === EDITOR.TOOL_ERASER) {
        eraseCell53c(coords.x, coords.y);
      } else {
        recolorCell53c(coords.x, coords.y);
      }
      scheduleRender();
    }
    return;
  }

  // SPECSCII editor: drag handling
  if (isSpecsciiEditor() && currentTool !== EDITOR.TOOL_SELECT) {
    const g = specsciiPixelToGrid(coords.x, coords.y);

    if (isDrawing) {
      switch (currentTool) {
        case EDITOR.TOOL_PIXEL:
          // Draw continuous line from last cell
          if (lastDrawnPixel && (lastDrawnPixel.x !== g.col || lastDrawnPixel.y !== g.row)) {
            specsciiDrawLine(lastDrawnPixel.x, lastDrawnPixel.y, g.col, g.row);
          } else {
            specsciiPlotCell(g.col, g.row);
          }
          lastDrawnPixel = { x: g.col, y: g.row };
          specsciiSyncToStream();
          scheduleRender();
          break;

        case EDITOR.TOOL_FILL_CELL:
        case EDITOR.TOOL_RECOLOR:
          specsciiRecolorCell(g.col, g.row);
          specsciiSyncToStream();
          scheduleRender();
          break;

        case EDITOR.TOOL_ERASER:
          if (lastDrawnPixel && (lastDrawnPixel.x !== g.col || lastDrawnPixel.y !== g.row)) {
            // Erase along line
            const dx = Math.abs(g.col - lastDrawnPixel.x);
            const dy = Math.abs(g.row - lastDrawnPixel.y);
            const sx = lastDrawnPixel.x < g.col ? 1 : -1;
            const sy = lastDrawnPixel.y < g.row ? 1 : -1;
            let err = dx - dy;
            let c = lastDrawnPixel.x, r = lastDrawnPixel.y;
            while (true) {
              specsciiEraseCell(c, r);
              if (c === g.col && r === g.row) break;
              const e2 = 2 * err;
              if (e2 > -dy) { err -= dy; c += sx; }
              if (e2 < dx) { err += dx; r += sy; }
            }
          } else {
            specsciiEraseCell(g.col, g.row);
          }
          lastDrawnPixel = { x: g.col, y: g.row };
          specsciiSyncToStream();
          scheduleRender();
          break;

        case EDITOR.TOOL_LINE:
        case EDITOR.TOOL_RECT:
        case EDITOR.TOOL_CIRCLE:
          // Preview — render then draw overlay
          editorRender();
          if (toolStartPoint) {
            drawToolPreview(toolStartPoint.x * 8 + 4, toolStartPoint.y * 8 + 4, g.col * 8 + 4, g.row * 8 + 4);
          }
          break;
      }
    }
    return;
  }

  if (!isDrawing) return;

  // Deferred stroke for big pictures: collect path and draw smooth preview
  if (deferredStrokePath) {
    const snapped = snapDrawCoords(coords.x, coords.y);
    const last = deferredStrokePath[deferredStrokePath.length - 1];
    if (last.x !== snapped.x || last.y !== snapped.y) {
      deferredStrokePath.push({ x: snapped.x, y: snapped.y });
      // Throttle preview redraws to ~30fps to keep big-picture rendering smooth
      const now = performance.now();
      if (!deferredStrokePath._lastPreview || now - deferredStrokePath._lastPreview > 33) {
        deferredStrokePath._lastPreview = now;
        editorRender();
        drawDeferredStrokePreview();
      }
    }
    return;
  }

  const isInk = (event.buttons & 2) === 0; // Left = ink, Right = paper
  const snapped = snapDrawCoords(coords.x, coords.y);

  switch (currentTool) {
    case EDITOR.TOOL_PIXEL:
      // When snap is active and NOT in masked mode, only stamp at discrete snapped positions
      // (drawLine's Bresenham would stamp at intermediate pixels, overwriting previous stamps in replace mode)
      // For masked mode, always draw lines for continuous strokes through the mask
      if (isSnapActive() && brushPaintMode !== 'masked' && brushPaintMode !== 'masked+') {
        if (!lastDrawnPixel || lastDrawnPixel.x !== snapped.x || lastDrawnPixel.y !== snapped.y) {
          drawPixel(snapped.x, snapped.y, isInk);
          lastDrawnPixel = snapped;
          scheduleRender();
        }
      } else {
        // Draw continuous line from last point
        if (lastDrawnPixel) {
          drawLine(lastDrawnPixel.x, lastDrawnPixel.y, snapped.x, snapped.y, isInk);
        } else {
          drawPixel(snapped.x, snapped.y, isInk);
        }
        lastDrawnPixel = snapped;
        scheduleRender();
      }
      break;

    case EDITOR.TOOL_LINE:
    case EDITOR.TOOL_RECT:
    case EDITOR.TOOL_CIRCLE:
    case EDITOR.TOOL_GRADIENT:
      // Preview - restore and draw preview (needs synchronous render for overlay)
      editorRender();
      if (toolStartPoint) {
        drawToolPreview(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, event.ctrlKey, event.altKey);
      }
      break;

    case EDITOR.TOOL_FILL_CELL:
      fillCell(coords.x, coords.y, isInk);
      scheduleRender();
      break;

    case EDITOR.TOOL_RECOLOR:
      recolorCell(coords.x, coords.y);
      scheduleRender();
      break;

    case EDITOR.TOOL_ERASER:
      if (isSnapActive()) {
        if (!lastDrawnPixel || lastDrawnPixel.x !== snapped.x || lastDrawnPixel.y !== snapped.y) {
          drawEraser(snapped.x, snapped.y);
          lastDrawnPixel = snapped;
          scheduleRender();
        }
      } else {
        // Draw continuous eraser line from last point
        if (lastDrawnPixel) {
          drawEraserLine(lastDrawnPixel.x, lastDrawnPixel.y, snapped.x, snapped.y);
        } else {
          drawEraser(snapped.x, snapped.y);
        }
        lastDrawnPixel = snapped;
        scheduleRender();
      }
      break;

    case EDITOR.TOOL_AIRBRUSH:
      airbrushCurrentPos = { x: snapped.x, y: snapped.y, isInk };
      drawAirbrush(snapped.x, snapped.y, isInk, lastDrawnPixel);
      lastDrawnPixel = snapped;
      scheduleRender();
      break;
  }
}

/**
 * Stops the airbrush continuous spray interval
 */
function stopAirbrushInterval() {
  if (airbrushIntervalId) {
    clearInterval(airbrushIntervalId);
    airbrushIntervalId = null;
  }
  airbrushCurrentPos = null;
}

/**
 * @param {MouseEvent} event
 */
function handleEditorMouseUp(event) {
  if (!editorActive) return;

  // BSC/BMC4 dispatch
  if (isBorderFormatEditor()) {
    if (bscDrawRegion === 'border' && isBorderEditable()) {
      handleBorderMouseUp(event);
      bscDrawRegion = null;
      return;
    }
    // Main area or no region — fall through to normal logic
    bscDrawRegion = null;
    const bsc = canvasToBscCoords(screenCanvas, event);
    const coords = (bsc && bsc.type === 'main') ? { x: bsc.x, y: bsc.y } : null;
    _handleEditorMouseUpCoords(event, coords);
    return;
  }

  const coords = canvasToScreenCoords(screenCanvas, event);
  _handleEditorMouseUpCoords(event, coords);
}

/**
 * Core mouse-up logic shared by SCR and BSC (main area).
 * @param {MouseEvent} event
 * @param {{x:number, y:number}|null} coords
 */
function _handleEditorMouseUpCoords(event, coords) {
  // Finalize selection rectangle on mouse release
  if (isSelecting && selectionStartPoint) {
    if (coords) {
      // Use transform snap setting when in transform mode, otherwise use Edit tab snap
      const useSnap = transformSelectActive ? transformSnapToGrid : isSnapActive();
      if (useSnap) {
        const endX = Math.ceil((coords.x + 1) / 8) * 8 - 1;
        const endY = Math.ceil((coords.y + 1) / 8) * 8 - 1;
        selectionEndPoint = { x: endX, y: endY };
      } else {
        selectionEndPoint = { x: coords.x, y: coords.y };
      }
    }
    isSelecting = false;

    // Handle transform tab selection vs regular edit tab selection
    if (transformSelectActive) {
      completeTransformSelection();
    } else {
      copySelection();
    }
    editorRender();
    return;
  }

  if (!isDrawing) return;

  // .53c attribute editor: reset drawing state for free-draw tools
  if (isAttrEditor() && (currentTool === EDITOR.TOOL_PIXEL || currentTool === EDITOR.TOOL_RECOLOR ||
      currentTool === EDITOR.TOOL_ERASER)) {
    stopAirbrushInterval();
    isDrawing = false;
    editorRender();
    return;
  }

  // SPECSCII editor: finalize shape tools
  if (isSpecsciiEditor()) {
    if (toolStartPoint && coords) {
      const g = specsciiPixelToGrid(coords.x, coords.y);
      switch (currentTool) {
        case EDITOR.TOOL_LINE:
          specsciiDrawLine(toolStartPoint.x, toolStartPoint.y, g.col, g.row);
          break;
        case EDITOR.TOOL_RECT:
          specsciiDrawRect(toolStartPoint.x, toolStartPoint.y, g.col, g.row);
          break;
        case EDITOR.TOOL_CIRCLE:
          specsciiDrawCircle(toolStartPoint.x, toolStartPoint.y, g.col, g.row);
          break;
      }
      specsciiSyncToStream();
    }
    editorRender();
    isDrawing = false;
    toolStartPoint = null;
    lastDrawnPixel = null;
    return;
  }

  // Deferred stroke for big pictures: commit the collected path
  if (deferredStrokePath) {
    commitDeferredStroke();

    // Flatten layers to screen when drawing ends on non-background layer
    if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
      flattenLayersToScreen();
    }

    syncCurrentPicture();
    editorRender();
    isDrawing = false;
    lastDrawnPixel = null;
    maskStrokeOrigin = null;
    return;
  }

  const isInk = event.button !== 2;

  if (toolStartPoint && coords) {
    const snapped = snapDrawCoords(coords.x, coords.y);
    switch (currentTool) {
      case EDITOR.TOOL_LINE:
        drawLine(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, isInk);
        break;

      case EDITOR.TOOL_RECT: {
        // Apply shape modifiers (Ctrl = square, Alt = from center)
        const mod = applyShapeModifiers(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, event.ctrlKey, event.altKey);
        drawRect(mod.x0, mod.y0, mod.x1, mod.y1, isInk);
        break;
      }

      case EDITOR.TOOL_CIRCLE: {
        // Apply shape modifiers (Ctrl = circle, Alt = from center)
        const mod = applyShapeModifiers(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, event.ctrlKey, event.altKey);
        drawCircle(mod.x0, mod.y0, mod.x1, mod.y1, isInk);
        break;
      }

      case EDITOR.TOOL_GRADIENT:
        drawGradient(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, isInk);
        break;
    }
  }

  // Flatten layers to screen when drawing ends on non-background layer
  if (layersEnabled && layers.length > 0 && activeLayerIndex > 0) {
    flattenLayersToScreen();
  }

  // Sync internal picture format after drawing stroke
  syncCurrentPicture();

  // Always do a full render (with preview) when drawing ends
  editorRender();

  // Stop airbrush continuous spray
  stopAirbrushInterval();

  isDrawing = false;
  toolStartPoint = null;
  lastDrawnPixel = null;
  maskStrokeOrigin = null;
}

/**
 * Applies shape modifier keys (Ctrl = square/circle, Alt = from center)
 * @param {number} x0 - Start X
 * @param {number} y0 - Start Y
 * @param {number} x1 - End X
 * @param {number} y1 - End Y
 * @param {boolean} ctrlKey - Constrain to 1:1 aspect ratio
 * @param {boolean} altKey - Draw from center instead of corner
 * @returns {{x0: number, y0: number, x1: number, y1: number}}
 */
function applyShapeModifiers(x0, y0, x1, y1, ctrlKey, altKey) {
  let dx = x1 - x0;
  let dy = y1 - y0;

  // Ctrl: constrain to square (equal width and height)
  if (ctrlKey) {
    const maxDim = Math.max(Math.abs(dx), Math.abs(dy));
    dx = maxDim * Math.sign(dx) || maxDim;
    dy = maxDim * Math.sign(dy) || maxDim;
    x1 = x0 + dx;
    y1 = y0 + dy;
  }

  // Alt: draw from center (x0,y0 becomes center)
  if (altKey) {
    x0 = x0 - dx;
    y0 = y0 - dy;
    // x1, y1 stay the same (they define the opposite corner from the new x0, y0)
  }

  return { x0, y0, x1, y1 };
}

/**
 * Draws preview for line/rect/circle tools
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {boolean} [ctrlKey] - Constrain to 1:1 aspect ratio
 * @param {boolean} [altKey] - Draw from center
 */
function drawToolPreview(x0, y0, x1, y1, ctrlKey, altKey) {
  const ctx = screenCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TOOL_PREVIEW_COLOR) || 'rgba(255, 255, 0, 0.8)';
  ctx.lineWidth = Math.max(1, zoom / 2);

  ctx.beginPath();
  if (currentTool === EDITOR.TOOL_LINE || currentTool === EDITOR.TOOL_GRADIENT) {
    ctx.moveTo(borderPixels + x0 * zoom + zoom / 2, borderPixels + y0 * zoomY + zoomY / 2);
    ctx.lineTo(borderPixels + x1 * zoom + zoom / 2, borderPixels + y1 * zoomY + zoomY / 2);
  } else if (currentTool === EDITOR.TOOL_RECT) {
    // Apply shape modifiers (Ctrl = square, Alt = from center)
    const mod = applyShapeModifiers(x0, y0, x1, y1, ctrlKey, altKey);
    const left = Math.min(mod.x0, mod.x1);
    const top = Math.min(mod.y0, mod.y1);
    const width = Math.abs(mod.x1 - mod.x0) + 1;
    const height = Math.abs(mod.y1 - mod.y0) + 1;
    ctx.rect(borderPixels + left * zoom, borderPixels + top * zoomY, width * zoom, height * zoomY);
  } else if (currentTool === EDITOR.TOOL_CIRCLE) {
    // Apply shape modifiers (Ctrl = circle, Alt = from center)
    const mod = applyShapeModifiers(x0, y0, x1, y1, ctrlKey, altKey);
    const left = Math.min(mod.x0, mod.x1);
    const top = Math.min(mod.y0, mod.y1);
    const width = Math.abs(mod.x1 - mod.x0) + 1;
    const height = Math.abs(mod.y1 - mod.y0) + 1;
    const cx = borderPixels + left * zoom + width * zoom / 2;
    const cy = borderPixels + top * zoomY + height * zoomY / 2;
    const rx = width * zoom / 2;
    const ry = height * zoomY / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
}

/**
 * Prevent context menu on canvas
 * @param {MouseEvent} event
 */
function handleContextMenu(event) {
  if (editorActive) {
    event.preventDefault();
  }
}

// ============================================================================
// Undo / Redo
// ============================================================================

function saveUndoState() {
  if (screenData && isFormatEditable()) {
    // Push current state to undo stack (screenData + layers + SPECSCII grids)
    const state = {
      screenData: new Uint8Array(screenData),
      layers: deepCloneLayers(layers),
      activeLayerIndex: activeLayerIndex,
      layersEnabled: layersEnabled,
      format: currentFormat,
      fileName: currentFileName
    };
    // Include ULA+ palette if present
    if (ulaPlusPalette) state.ulaPlusPalette = new Uint8Array(ulaPlusPalette);
    // Include SPECSCII grids if present
    if (specsciiCharGrid) state.specsciiCharGrid = new Uint8Array(specsciiCharGrid);
    if (specsciiAttrGrid) state.specsciiAttrGrid = new Uint8Array(specsciiAttrGrid);
    if (specsciiMask) state.specsciiMask = new Uint8Array(specsciiMask);
    // Include HLR fill pattern if present (so "Change HLR pattern..." is undoable)
    if (currentPicture && currentPicture.pattern && currentPicture.pattern.length === 8) {
      state.hlrPattern = new Uint8Array(currentPicture.pattern);
    }
    // Include NXI/SL2 resolved palette if present
    if (nxiResolvedPalette) state.nxiResolvedPalette = nxiResolvedPalette.map(c => [...c]);

    undoStack.push(state);

    // Limit stack size
    if (undoStack.length > MAX_UNDO_LEVELS) {
      undoStack.shift();
    }

    // Clear redo stack on new action
    redoStack = [];

    // Mark picture as modified
    markPictureModified();
  }
}

function undo() {
  if (undoStack.length === 0) return;

  // Save current state to redo stack
  const state = {
    screenData: new Uint8Array(screenData),
    layers: deepCloneLayers(layers),
    activeLayerIndex: activeLayerIndex,
    layersEnabled: layersEnabled,
    format: currentFormat,
    fileName: currentFileName
  };
  if (ulaPlusPalette) state.ulaPlusPalette = new Uint8Array(ulaPlusPalette);
  if (specsciiCharGrid) state.specsciiCharGrid = new Uint8Array(specsciiCharGrid);
  if (specsciiAttrGrid) state.specsciiAttrGrid = new Uint8Array(specsciiAttrGrid);
  if (specsciiMask) state.specsciiMask = new Uint8Array(specsciiMask);
  if (currentPicture && currentPicture.pattern && currentPicture.pattern.length === 8) {
    state.hlrPattern = new Uint8Array(currentPicture.pattern);
  }
  if (nxiResolvedPalette) state.nxiResolvedPalette = nxiResolvedPalette.map(c => [...c]);
  redoStack.push(state);

  // Restore previous state
  const previousState = undoStack.pop();
  if (previousState) {
    screenData = previousState.screenData;
    layers = previousState.layers;
    activeLayerIndex = previousState.activeLayerIndex;
    if (typeof previousState.layersEnabled !== 'undefined') {
      layersEnabled = previousState.layersEnabled;
    }

    // Restore format and filename if saved (format conversions)
    if (previousState.format) {
      const formatChanged = currentFormat !== previousState.format;
      currentFormat = previousState.format;
      currentFileName = previousState.fileName;
      if (formatChanged) {
        // Re-initialize ULA+ mode based on restored format
        if (typeof initUlaPlusMode === 'function') {
          initUlaPlusMode(screenData, currentFormat);
        }
        // Re-create currentPicture for the restored format using unified importer
        if (typeof importPicture === 'function') {
          const importOpts = (currentFormat === FORMAT.ATTR_53C && typeof getSelectedPattern === 'function')
            ? { pattern: getSelectedPattern() }
            : undefined;
          currentPicture = importPicture(currentFormat, screenData, currentFileName, importOpts);
        } else {
          currentPicture = null;
        }
      }
    }

    // Restore ULA+ palette if present
    if (previousState.ulaPlusPalette) {
      ulaPlusPalette = new Uint8Array(previousState.ulaPlusPalette);
      if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();
    } else if (previousState.format && previousState.format !== FORMAT.SCR_ULAPLUS) {
      ulaPlusPalette = null;
    }

    // Restore SPECSCII grids if present
    if (previousState.specsciiCharGrid) specsciiCharGrid = previousState.specsciiCharGrid;
    if (previousState.specsciiAttrGrid) specsciiAttrGrid = previousState.specsciiAttrGrid;
    if (previousState.specsciiMask) specsciiMask = previousState.specsciiMask;

    // Restore NXI/SL2 palette if present
    if (previousState.nxiResolvedPalette) {
      nxiResolvedPalette = previousState.nxiResolvedPalette;
      if (typeof buildNxiPalette === 'function') buildNxiPalette();
    }

    // Re-flatten layers to update transparency masks (borderTransparencyMask, screenTransparencyMask)
    if (layersEnabled && layers.length > 0) {
      flattenLayersToScreen();
    }

    // Sync internal picture format from restored screenData
    syncCurrentPicture();

    // Restore HLR fill pattern onto currentPicture (syncCurrentPicture does not
    // touch the pattern field, so it is safe to overwrite it here).
    if (previousState.hlrPattern && currentPicture) {
      currentPicture.pattern = new Uint8Array(previousState.hlrPattern);
    }

    updateLayerPanel();
    // Re-expand layer controls if layers were restored
    if (layersEnabled && layers.length > 1) {
      const controls = document.getElementById('layerControls');
      const icon = document.getElementById('layerExpandIcon');
      if (controls) controls.style.display = '';
      if (icon) icon.textContent = '▼';
    }
    // Update UI for format change
    if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
    updateEditorColorPickers();
    if (typeof updateConvertOptions === 'function') updateConvertOptions();
    if (typeof updateFileInfo === 'function') updateFileInfo();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    editorRender();
  }
}

function redo() {
  if (redoStack.length === 0) return;

  // Save current state to undo stack
  const state = {
    screenData: new Uint8Array(screenData),
    layers: deepCloneLayers(layers),
    activeLayerIndex: activeLayerIndex,
    layersEnabled: layersEnabled,
    format: currentFormat,
    fileName: currentFileName
  };
  if (ulaPlusPalette) state.ulaPlusPalette = new Uint8Array(ulaPlusPalette);
  if (specsciiCharGrid) state.specsciiCharGrid = new Uint8Array(specsciiCharGrid);
  if (specsciiAttrGrid) state.specsciiAttrGrid = new Uint8Array(specsciiAttrGrid);
  if (specsciiMask) state.specsciiMask = new Uint8Array(specsciiMask);
  if (currentPicture && currentPicture.pattern && currentPicture.pattern.length === 8) {
    state.hlrPattern = new Uint8Array(currentPicture.pattern);
  }
  if (nxiResolvedPalette) state.nxiResolvedPalette = nxiResolvedPalette.map(c => [...c]);
  undoStack.push(state);

  // Restore redo state
  const redoState = redoStack.pop();
  if (redoState) {
    screenData = redoState.screenData;
    layers = redoState.layers;
    activeLayerIndex = redoState.activeLayerIndex;
    if (typeof redoState.layersEnabled !== 'undefined') {
      layersEnabled = redoState.layersEnabled;
    }

    // Restore format and filename if saved (format conversions)
    if (redoState.format) {
      const formatChanged = currentFormat !== redoState.format;
      currentFormat = redoState.format;
      currentFileName = redoState.fileName;
      if (formatChanged) {
        if (typeof initUlaPlusMode === 'function') {
          initUlaPlusMode(screenData, currentFormat);
        }
        // Re-create currentPicture for the restored format using unified importer
        if (typeof importPicture === 'function') {
          const importOpts = (currentFormat === FORMAT.ATTR_53C && typeof getSelectedPattern === 'function')
            ? { pattern: getSelectedPattern() }
            : undefined;
          currentPicture = importPicture(currentFormat, screenData, currentFileName, importOpts);
        } else {
          currentPicture = null;
        }
      }
    }

    // Restore ULA+ palette if present
    if (redoState.ulaPlusPalette) {
      ulaPlusPalette = new Uint8Array(redoState.ulaPlusPalette);
      if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();
    } else if (redoState.format && redoState.format !== FORMAT.SCR_ULAPLUS) {
      ulaPlusPalette = null;
    }

    // Restore SPECSCII grids if present
    if (redoState.specsciiCharGrid) specsciiCharGrid = redoState.specsciiCharGrid;
    if (redoState.specsciiAttrGrid) specsciiAttrGrid = redoState.specsciiAttrGrid;
    if (redoState.specsciiMask) specsciiMask = redoState.specsciiMask;

    // Restore NXI/SL2 palette if present
    if (redoState.nxiResolvedPalette) {
      nxiResolvedPalette = redoState.nxiResolvedPalette;
      if (typeof buildNxiPalette === 'function') buildNxiPalette();
    }

    // Re-flatten layers to update transparency masks (borderTransparencyMask, screenTransparencyMask)
    if (layersEnabled && layers.length > 0) {
      flattenLayersToScreen();
    }

    // Sync internal picture format from restored screenData
    syncCurrentPicture();

    // Restore HLR fill pattern onto currentPicture
    if (redoState.hlrPattern && currentPicture) {
      currentPicture.pattern = new Uint8Array(redoState.hlrPattern);
    }

    updateLayerPanel();
    // Re-expand or collapse layer controls based on restored state
    if (layersEnabled && layers.length > 1) {
      const controls = document.getElementById('layerControls');
      const icon = document.getElementById('layerExpandIcon');
      if (controls) controls.style.display = '';
      if (icon) icon.textContent = '▼';
    }
    // Update UI for format change
    if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
    updateEditorColorPickers();
    if (typeof updateConvertOptions === 'function') updateConvertOptions();
    if (typeof updateFileInfo === 'function') updateFileInfo();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    editorRender();
  }
}

/**
 * Clears the screen to current paper color
 */
function clearScreen() {
  if (!isFormatEditable()) return;

  saveUndoState();

  if (currentFormat === FORMAT.ATTR_53C) {
    // .53c: fill all 768 attribute bytes with current color
    const attr = getCurrentDrawingAttribute();
    for (let i = 0; i < 768; i++) {
      screenData[i] = attr;
    }
    editorRender();
    return;
  }

  // SPECSCII: clear grids and sync
  if (currentFormat === FORMAT.SPECSCII) {
    const attr = getCurrentDrawingAttribute();
    specsciiInitGrids(0x20, attr);
    specsciiSyncToStream();
    editorRender();
    return;
  }

  // Monochrome formats: just clear bitmap, no attributes
  if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    const bitmapSize = currentFormat === FORMAT.MONO_1_3 ? 2048 :
                       currentFormat === FORMAT.MONO_2_3 ? 4096 : 6144;
    for (let i = 0; i < bitmapSize; i++) {
      screenData[i] = 0;
    }
    if (layersEnabled) initLayers();
    editorRender();
    return;
  }

  // RGB3: clear all 3 bitmaps to paper color
  if (currentFormat === FORMAT.RGB3) {
    const paperColor = editorPaperColor;
    const redByte = (paperColor & 2) ? 0xFF : 0x00;
    const greenByte = (paperColor & 4) ? 0xFF : 0x00;
    const blueByte = (paperColor & 1) ? 0xFF : 0x00;
    for (let i = 0; i < RGB3.BITMAP_SIZE; i++) {
      screenData[RGB3.RED_OFFSET + i] = redByte;
      screenData[RGB3.GREEN_OFFSET + i] = greenByte;
      screenData[RGB3.BLUE_OFFSET + i] = blueByte;
    }
    if (layersEnabled) initLayers();
    editorRender();
    return;
  }

  // ULA+: clear bitmap, reset palette to default, reset colors
  if (currentFormat === FORMAT.SCR_ULAPLUS) {
    // Clear bitmap
    for (let i = 0; i < SCREEN.BITMAP_SIZE; i++) {
      screenData[i] = 0;
    }
    // Set attributes to black ink (0) on black paper (0) in CLUT 0
    const clearAttr = 0; // ink=0, paper=0, bright=0, flash=0
    for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
      screenData[i] = clearAttr;
    }
    // Reset palette to default
    const defaultPalette = generateDefaultUlaPlusPalette();
    screenData.set(defaultPalette, ULAPLUS.PALETTE_OFFSET);
    ulaPlusPalette = defaultPalette;
    // Reset selected colors to CLUT 0
    resetUlaPlusColors();
    // Reinitialize layers
    if (layersEnabled) initLayers();
    // Sync internal picture format after clear
    syncCurrentPicture();
    // Update palette display
    if (typeof updateUlaPlusPalette === 'function') {
      updateUlaPlusPalette();
    }
    editorRender();
    return;
  }

  // Gigascreen: clear both frames with selected virtual colors
  if (isGigascreenEditable()) {
    // Get attributes for both frames from virtual colors
    const frame1 = getGigascreenFrameColors(0);
    const frame2 = getGigascreenFrameColors(1);
    const attr1 = buildAttribute(frame1.inkColor, frame1.paperColor, frame1.bright, false);
    const attr2 = buildAttribute(frame2.inkColor, frame2.paperColor, frame2.bright, false);
    const gigaFS = getGigaFrameSize();
    const gigaAS = getGigaAttrSize();

    // Clear bitmap in both frames (all pixels = paper)
    for (let i = 0; i < SCREEN.BITMAP_SIZE; i++) {
      screenData[i] = 0;
      screenData[gigaFS + i] = 0;
    }
    // Set attributes in both frames
    for (let i = 0; i < gigaAS; i++) {
      screenData[SCREEN.BITMAP_SIZE + i] = attr1;
      screenData[gigaFS + SCREEN.BITMAP_SIZE + i] = attr2;
    }
    if (layersEnabled) initLayers();
    editorRender();
    return;
  }

  // ZXP/chr$: clear with dynamic dimensions
  if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    const cols = currentPicture.width >> 3;
    const bitmapSize = cols * currentPicture.height;
    const attrRows = currentPicture.attrRows || Math.ceil(currentPicture.height / (currentPicture.attrCellHeight || 8));
    const attrSize = cols * attrRows;
    for (let i = 0; i < bitmapSize; i++) screenData[i] = 0;
    const attr = getCurrentDrawingAttribute();
    for (let i = 0; i < attrSize; i++) screenData[bitmapSize + i] = attr;
    if (layersEnabled) initLayers();
    syncCurrentPicture();
    editorRender();
    return;
  }

  // SCR / BSC / IFL / MLT / BMC4: Clear all bitmap data (all pixels become paper)
  for (let i = 0; i < SCREEN.BITMAP_SIZE; i++) {
    screenData[i] = 0;
  }

  // Set all attributes to current ink/paper/bright/flash
  const attr = getCurrentDrawingAttribute();
  if (currentFormat === FORMAT.MLT) {
    // MLT: 6144 attribute bytes (192 rows × 32 columns)
    for (let i = MLT.BITMAP_SIZE; i < MLT.TOTAL_SIZE; i++) {
      screenData[i] = attr;
    }
  } else if (currentFormat === FORMAT.IFL) {
    // IFL: 3072 attribute bytes (96 rows × 32 columns)
    for (let i = IFL.BITMAP_SIZE; i < IFL.TOTAL_SIZE; i++) {
      screenData[i] = attr;
    }
  } else if (currentFormat === FORMAT.BMC4) {
    // BMC4: 768 + 768 attribute bytes (attr1 and attr2)
    for (let i = BMC4.ATTR1_OFFSET; i < BMC4.ATTR1_OFFSET + BMC4.ATTR1_SIZE; i++) {
      screenData[i] = attr;
    }
    for (let i = BMC4.ATTR2_OFFSET; i < BMC4.ATTR2_OFFSET + BMC4.ATTR1_SIZE; i++) {
      screenData[i] = attr;
    }
  } else {
    // SCR / BSC: 768 attribute bytes (24 rows × 32 columns)
    for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
      screenData[i] = attr;
    }
  }

  // BSC: clear border data to selected border color
  if (currentFormat === FORMAT.BSC ||
      (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border && !isGigascreenEditable())) {
    // Border bytes have two 3-bit colors: bits 0-2 and bits 3-5
    // Use borderColor from screen_viewer.js (0-7), default to 0 if not defined
    const bc = (typeof borderColor !== 'undefined') ? (borderColor & 0x07) : 0;
    const borderByte = bc | (bc << 3); // Same color in both slots
    for (let i = BSC.BORDER_OFFSET; i < BSC.TOTAL_SIZE; i++) {
      screenData[i] = borderByte;
    }
  }

  // BMC4: clear border data to selected border color
  if (currentFormat === FORMAT.BMC4) {
    const bc = (typeof borderColor !== 'undefined') ? (borderColor & 0x07) : 0;
    const borderByte = bc | (bc << 3);
    for (let i = BMC4.BORDER_OFFSET; i < BMC4.TOTAL_SIZE; i++) {
      screenData[i] = borderByte;
    }
  }

  // Reinitialize layers to match cleared screenData
  if (layersEnabled) {
    initLayers();
  }

  // Sync internal picture format after clear
  syncCurrentPicture();

  editorRender();
}

// ============================================================================
// Preview Panel
// ============================================================================

/**
 * Renders the preview canvas
 */
function renderPreview() {
  if (!previewCanvas) return;
  // SPECSCII can render from grids even with empty screenData
  if (!screenData && !(currentFormat === FORMAT.SPECSCII && specsciiCharGrid)) return;

  const ctx = previewCanvas.getContext('2d');
  if (!ctx) return;

  // BSC / BSP non-giga with border: render full frame including borders (border in screenData)
  if ((currentFormat === FORMAT.BSC || (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border && currentPicture.colorMode !== 'gigascreen')) && screenData.length >= BSC.TOTAL_SIZE) {
    renderBscPreview(ctx);
    return;
  }

  // BSP giga+border: render border from picture.border + gigascreen main screen
  if (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border && currentPicture.colorMode === 'gigascreen') {
    renderBspGigaBorderPreview(ctx);
    return;
  }

  // Set canvas size based on preview zoom, capping for large images
  const prevW = getFormatWidth();
  const prevH = getFormatHeight();
  const prevScaleY = getPixelScaleY();
  // For large images, scale down so preview fits within 256px on the longest side
  const maxPreviewPx = 256;
  const baseScale = Math.min(1, maxPreviewPx / Math.max(prevW, prevH * prevScaleY));
  const effectiveZoom = baseScale * previewZoom;
  previewCanvas.width = Math.round(prevW * effectiveZoom);
  previewCanvas.height = Math.round(prevH * prevScaleY * effectiveZoom);

  // Create 1:1 image
  const imageData = ctx.createImageData(prevW, prevH);
  const data = imageData.data;

  if (currentFormat === FORMAT.ATTR_53C && screenData.length >= SCREEN.ATTR_SIZE) {
    // .53c: render attribute pattern
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('pattern53cSelect'));
    const patternName = select?.value || 'checker';

    // Get pattern array from config (8 bytes, one per row, MSB = leftmost pixel)
    let patternArray;
    if (patternName === 'stripes') {
      patternArray = APP_CONFIG.PATTERN_53C_STRIPES;
    } else if (patternName === 'dd77') {
      patternArray = APP_CONFIG.PATTERN_53C_DD77;
    } else {
      patternArray = APP_CONFIG.PATTERN_53C_CHECKER;
    }

    for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const attr = screenData[col + row * 32];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        for (let py = 0; py < 8; py++) {
          const patternByte = patternArray[py];
          for (let px = 0; px < 8; px++) {
            const isInk = (patternByte & (1 << (7 - px))) !== 0;
            const rgb = isInk ? inkRgb : paperRgb;
            const pixelIndex = (((row * 8 + py) * prevW) + col * 8 + px) * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  } else if (currentFormat === FORMAT.SPECSCII && specsciiCharGrid && specsciiAttrGrid) {
    // SPECSCII: render characters from grids (with multi-layer XOR compositing)
    const hasLayers = typeof layersEnabled !== 'undefined' && layersEnabled &&
                      typeof layers !== 'undefined' && layers.length > 1;
    if (hasLayers) {
      // Build pixel buffer with XOR compositing from all layers
      const W = prevW, H = prevH;
      const pixBuf = new Uint8Array(W * H);
      const cellAttr = new Uint8Array(768);
      cellAttr.fill(0x38); // ink 0 (black), paper 7 (white)

      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        const layer = layers[layerIdx];
        if (!layer.visible || !layer.bitmap) continue;

        for (let crow = 0; crow < SPECSCII.CHAR_ROWS; crow++) {
          for (let ccol = 0; ccol < SPECSCII.CHAR_COLS; ccol++) {
            const ci = crow * 32 + ccol;
            if (layerIdx > 0 && (!layer.mask || !layer.mask[ci])) continue;

            const ch = layer.bitmap[ci];
            const attr = layer.attributes ? layer.attributes[ci] : 0x38;
            cellAttr[ci] = attr;

            for (let line = 0; line < 8; line++) {
              const glyphByte = specsciiGetGlyphByte(ch, line);
              for (let bit = 0; bit < 8; bit++) {
                if (glyphByte & (0x80 >> bit)) {
                  const pi = (crow * 8 + line) * W + ccol * 8 + bit;
                  if (layerIdx === 0) {
                    pixBuf[pi] = 1;
                  } else {
                    pixBuf[pi] ^= 1; // XOR — OVER mode
                  }
                }
              }
            }
          }
        }
      }

      // Render composited buffer to ImageData
      for (let crow = 0; crow < SPECSCII.CHAR_ROWS; crow++) {
        for (let ccol = 0; ccol < SPECSCII.CHAR_COLS; ccol++) {
          const ci = crow * 32 + ccol;
          const attr = cellAttr[ci];
          const aInk = attr & 0x07, aPaper = (attr >> 3) & 0x07;
          const aBright = (attr & 0x40) !== 0, aFlash = (attr & 0x80) !== 0;
          const pal = aBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
          let inkRgb, paperRgb;
          if (aFlash && flashPhase && flashEnabled) {
            inkRgb = pal[aPaper]; paperRgb = pal[aInk];
          } else {
            inkRgb = pal[aInk]; paperRgb = pal[aPaper];
          }
          for (let line = 0; line < 8; line++) {
            for (let bit = 0; bit < 8; bit++) {
              const pi = (crow * 8 + line) * W + ccol * 8 + bit;
              const rgb = pixBuf[pi] ? inkRgb : paperRgb;
              const offset = pi * 4;
              data[offset] = rgb[0];
              data[offset + 1] = rgb[1];
              data[offset + 2] = rgb[2];
              data[offset + 3] = 255;
            }
          }
        }
      }
    } else {
      // Single layer: render directly from grids
      for (let row = 0; row < SPECSCII.CHAR_ROWS; row++) {
        for (let col = 0; col < SPECSCII.CHAR_COLS; col++) {
          const idx = row * 32 + col;
          specsciiRenderGlyph(data, prevW, specsciiCharGrid[idx], specsciiAttrGrid[idx], col * 8, row * 8);
        }
      }
    }
  } else if (currentFormat === FORMAT.IFL && screenData.length >= IFL.TOTAL_SIZE) {
    // IFL: render bitmap with 8×2 multicolor attributes
    const sections = [
      { bitmapAddr: 0, yOffset: 0 },
      { bitmapAddr: 2048, yOffset: 64 },
      { bitmapAddr: 4096, yOffset: 128 }
    ];

    for (const section of sections) {
      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const x = col * 8;
            const y = section.yOffset + row * 8 + line;

            // IFL: attribute per 8×2 block (96 rows total)
            const attrRow = Math.floor(y / 2);
            const attrOffset = IFL.BITMAP_SIZE + attrRow * 32 + col;
            const attr = screenData[attrOffset];

            let inkIndex = attr & 0x07;
            let paperIndex = (attr >> 3) & 0x07;
            const isBright = (attr & 0x40) !== 0;
            const isFlash = (attr & 0x80) !== 0;

            if (isFlash && flashPhase && flashEnabled) {
              const tmp = inkIndex;
              inkIndex = paperIndex;
              paperIndex = tmp;
            }

            const palette = isBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;
              if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
                const checker = getCheckerboardColor(px, y);
                data[pixelIndex] = checker[0];
                data[pixelIndex + 1] = checker[1];
                data[pixelIndex + 2] = checker[2];
              } else {
                const isSet = (byte & (0x80 >> bit)) !== 0;
                const rgb = isSet ? palette[inkIndex] : palette[paperIndex];
                data[pixelIndex] = rgb[0];
                data[pixelIndex + 1] = rgb[1];
                data[pixelIndex + 2] = rgb[2];
              }
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else if (currentFormat === FORMAT.MLT && screenData.length >= MLT.TOTAL_SIZE) {
    // MLT: render bitmap with 8×1 multicolor attributes (one per pixel line)
    const sections = [
      { bitmapAddr: 0, yOffset: 0 },
      { bitmapAddr: 2048, yOffset: 64 },
      { bitmapAddr: 4096, yOffset: 128 }
    ];

    for (const section of sections) {
      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const x = col * 8;
            const y = section.yOffset + row * 8 + line;

            // MLT: attribute per 8×1 block (192 rows total, one per pixel line)
            const attrOffset = MLT.BITMAP_SIZE + y * 32 + col;
            const attr = screenData[attrOffset];

            // Use getColorsRgb to support ULA+ mode
            const colors = getColorsRgb(attr);
            let inkRgb = colors.inkRgb;
            let paperRgb = colors.paperRgb;

            const isFlash = (attr & 0x80) !== 0;
            if (isFlash && flashPhase && flashEnabled) {
              const tmp = inkRgb;
              inkRgb = paperRgb;
              paperRgb = tmp;
            }

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;
              if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
                const checker = getCheckerboardColor(px, y);
                data[pixelIndex] = checker[0];
                data[pixelIndex + 1] = checker[1];
                data[pixelIndex + 2] = checker[2];
              } else {
                const isSet = (byte & (0x80 >> bit)) !== 0;
                const rgb = isSet ? inkRgb : paperRgb;
                data[pixelIndex] = rgb[0];
                data[pixelIndex + 1] = rgb[1];
                data[pixelIndex + 2] = rgb[2];
              }
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else if (currentFormat === FORMAT.BMC4 && screenData.length >= BMC4.TOTAL_SIZE) {
    // BMC4: render bitmap with 8×4 multicolor attributes
    const sections = [
      { bitmapAddr: 0, yOffset: 0 },
      { bitmapAddr: 2048, yOffset: 64 },
      { bitmapAddr: 4096, yOffset: 128 }
    ];

    for (const section of sections) {
      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const x = col * 8;
            const y = section.yOffset + row * 8 + line;

            // BMC4: attribute per 8×4 block (lines 0-3 use attr1, lines 4-7 use attr2)
            const charRow = Math.floor(y / 8);
            const pixelLine = y % 8;
            const attrOffset = (pixelLine < 4) ? BMC4.ATTR1_OFFSET : BMC4.ATTR2_OFFSET;
            const attr = screenData[attrOffset + charRow * 32 + col];

            let inkIndex = attr & 0x07;
            let paperIndex = (attr >> 3) & 0x07;
            const isBright = (attr & 0x40) !== 0;
            const isFlash = (attr & 0x80) !== 0;

            if (isFlash && flashPhase && flashEnabled) {
              const tmp = inkIndex;
              inkIndex = paperIndex;
              paperIndex = tmp;
            }

            const palette = isBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;
              if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
                const checker = getCheckerboardColor(px, y);
                data[pixelIndex] = checker[0];
                data[pixelIndex + 1] = checker[1];
                data[pixelIndex + 2] = checker[2];
              } else {
                const isSet = (byte & (0x80 >> bit)) !== 0;
                const rgb = isSet ? palette[inkIndex] : palette[paperIndex];
                data[pixelIndex] = rgb[0];
                data[pixelIndex + 1] = rgb[1];
                data[pixelIndex + 2] = rgb[2];
              }
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else if (currentFormat === FORMAT.RGB3 && screenData.length >= RGB3.TOTAL_SIZE) {
    // RGB3: render tricolor bitmap using same LUT as main canvas
    const palBlue = ZX_PALETTE_RGB.BRIGHT[1];
    const palRed = ZX_PALETTE_RGB.BRIGHT[2];
    const palGreen = ZX_PALETTE_RGB.BRIGHT[4];
    const prevLut = new Array(8);
    if (rgb3Mode === 'blend_dark') {
      const black = ZX_PALETTE_RGB.BRIGHT[0];
      for (let i = 0; i < 8; i++) {
        const fR = (i & 2) ? palRed : black;
        const fG = (i & 4) ? palGreen : black;
        const fB = (i & 1) ? palBlue : black;
        prevLut[i] = [
          Math.round((fR[0] + fG[0] + fB[0]) / 3 * CRT_DARK_FACTOR),
          Math.round((fR[1] + fG[1] + fB[1]) / 3 * CRT_DARK_FACTOR),
          Math.round((fR[2] + fG[2] + fB[2]) / 3 * CRT_DARK_FACTOR)
        ];
      }
    } else {
      for (let i = 0; i < 8; i++) {
        prevLut[i] = [
          (i & 2) ? palRed[0] : 0,
          (i & 4) ? palGreen[1] : 0,
          (i & 1) ? palBlue[2] : 0
        ];
      }
    }

    const sections = [
      { bitmapAddr: 0, yOffset: 0 },
      { bitmapAddr: 2048, yOffset: 64 },
      { bitmapAddr: 4096, yOffset: 128 }
    ];

    for (const section of sections) {
      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
            const redByte = screenData[RGB3.RED_OFFSET + bitmapOffset];
            const greenByte = screenData[RGB3.GREEN_OFFSET + bitmapOffset];
            const blueByte = screenData[RGB3.BLUE_OFFSET + bitmapOffset];

            const x = col * 8;
            const y = section.yOffset + row * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;
              if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
                const checker = getCheckerboardColor(px, y);
                data[pixelIndex] = checker[0];
                data[pixelIndex + 1] = checker[1];
                data[pixelIndex + 2] = checker[2];
              } else {
                const colorIdx = ((redByte & (0x80 >> bit)) ? 2 : 0) |
                                 ((greenByte & (0x80 >> bit)) ? 4 : 0) |
                                 ((blueByte & (0x80 >> bit)) ? 1 : 0);
                const c = prevLut[colorIdx];
                data[pixelIndex] = c[0];
                data[pixelIndex + 1] = c[1];
                data[pixelIndex + 2] = c[2];
              }
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    // Monochrome: render bitmap only (no attributes), use editor's selected colors
    const thirds = currentFormat === FORMAT.MONO_1_3 ? 1 : (currentFormat === FORMAT.MONO_2_3 ? 2 : 3);
    const palette = editorBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
    const ink = palette[editorInkColor];
    const paper = palette[editorPaperColor];

    for (let third = 0; third < thirds; third++) {
      const bitmapAddr = third * 2048;
      const yOffset = third * 64;

      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const x = col * 8;
            const y = yOffset + row * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;
              if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
                const checker = getCheckerboardColor(px, y);
                data[pixelIndex] = checker[0];
                data[pixelIndex + 1] = checker[1];
                data[pixelIndex + 2] = checker[2];
              } else {
                const isSet = (byte & (0x80 >> bit)) !== 0;
                const rgb = isSet ? ink : paper;
                data[pixelIndex] = rgb[0];
                data[pixelIndex + 1] = rgb[1];
                data[pixelIndex + 2] = rgb[2];
              }
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }

    // Fill remaining area with paper for partial screens
    if (thirds < 3) {
      const startY = thirds * 64;
      for (let y = startY; y < 192; y++) {
        for (let x = 0; x < 256; x++) {
          const pixelIndex = (y * prevW + x) * 4;
          data[pixelIndex] = paper[0];
          data[pixelIndex + 1] = paper[1];
          data[pixelIndex + 2] = paper[2];
          data[pixelIndex + 3] = 255;
        }
      }
    }
  } else if (isGigascreenEditable() && screenData.length >= getGigaFrameSize() * 2) {
    // Gigascreen: render blended average of both frames
    const gigaFS = getGigaFrameSize();
    const gigaCellH = getGigaAttrCellHeight();
    const sections = [
      { bitmapAddr: 0, yOffset: 0 },
      { bitmapAddr: 2048, yOffset: 64 },
      { bitmapAddr: 4096, yOffset: 128 }
    ];

    for (const section of sections) {
      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
            const y = section.yOffset + row * 8 + line;
            const attrOffset = 6144 + Math.floor(y / gigaCellH) * 32 + col;

            // Frame 1 data
            const byte1 = screenData[bitmapOffset];
            const attr1 = screenData[attrOffset];
            const ink1Idx = attr1 & 0x07;
            const paper1Idx = (attr1 >> 3) & 0x07;
            const bright1 = (attr1 & 0x40) !== 0;
            const palette1 = bright1 ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;

            // Frame 2 data
            const byte2 = screenData[gigaFS + bitmapOffset];
            const attr2 = screenData[gigaFS + attrOffset];
            const ink2Idx = attr2 & 0x07;
            const paper2Idx = (attr2 >> 3) & 0x07;
            const bright2 = (attr2 & 0x40) !== 0;
            const palette2 = bright2 ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;

            const x = col * 8;

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;

              // Get color from each frame
              const isSet1 = (byte1 & (0x80 >> bit)) !== 0;
              const rgb1 = isSet1 ? palette1[ink1Idx] : palette1[paper1Idx];

              const isSet2 = (byte2 & (0x80 >> bit)) !== 0;
              const rgb2 = isSet2 ? palette2[ink2Idx] : palette2[paper2Idx];

              // Blend by averaging
              data[pixelIndex] = Math.round((rgb1[0] + rgb2[0]) / 2);
              data[pixelIndex + 1] = Math.round((rgb1[1] + rgb2[1]) / 2);
              data[pixelIndex + 2] = Math.round((rgb1[2] + rgb2[2]) / 2);
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture && screenData) {
    // ZXP/chr$: linear bitmap + linear attributes
    const cols = currentPicture.width >> 3;
    const bitmapSize = cols * prevH;
    const attrCellH = currentPicture.attrCellHeight || 8;

    for (let y = 0; y < prevH; y++) {
      const bitmapRowBase = y * cols;
      const attrRow = Math.floor(y / attrCellH);
      const attrRowBase = bitmapSize + attrRow * cols;

      for (let col = 0; col < cols; col++) {
        const byte = screenData[bitmapRowBase + col];
        const attr = screenData[attrRowBase + col];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const maskIdx = y * prevW + px;
          const pixelIndex = maskIdx * 4;
          if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
            const checker = getCheckerboardColor(px, y);
            data[pixelIndex] = checker[0];
            data[pixelIndex + 1] = checker[1];
            data[pixelIndex + 2] = checker[2];
          } else {
            const isSet = (byte & (0x80 >> bit)) !== 0;
            const rgb = isSet ? inkRgb : paperRgb;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
          }
          data[pixelIndex + 3] = 255;
        }
      }
    }
  } else if (currentFormat === FORMAT.LORES && nxiResolvedPalette) {
    // LoRes: render 128×96 indexed pixels using resolved palette
    for (let y = 0; y < prevH; y++) {
      for (let x = 0; x < prevW; x++) {
        const colorIdx = screenData[y * LORES.WIDTH + x] || 0;
        const rgb = nxiResolvedPalette[colorIdx] || [0, 0, 0];
        const dstIdx = (y * prevW + x) * 4;
        data[dstIdx] = rgb[0];
        data[dstIdx + 1] = rgb[1];
        data[dstIdx + 2] = rgb[2];
        data[dstIdx + 3] = 255;
      }
    }
  } else if (currentFormat === FORMAT.LORES_RAD && nxiResolvedPalette) {
    // LoRes Radastan: render 128×96 4bpp packed nibbles using 16-entry palette
    for (let y = 0; y < prevH; y++) {
      for (let x = 0; x < prevW; x++) {
        const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
        const byteVal = screenData[byteOffset] || 0;
        const colorIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
        const rgb = nxiResolvedPalette[colorIdx] || [0, 0, 0];
        const dstIdx = (y * prevW + x) * 4;
        data[dstIdx] = rgb[0];
        data[dstIdx + 1] = rgb[1];
        data[dstIdx + 2] = rgb[2];
        data[dstIdx + 3] = 255;
      }
    }
  } else if ((currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) && nxiResolvedPalette) {
    // NXI/SL2: render indexed pixels using resolved palette (handles all modes)
    const pixelOffset = getNxiPixelOffset();
    for (let y = 0; y < prevH; y++) {
      for (let x = 0; x < prevW; x++) {
        let colorIdx;
        if (nxiLayer2Mode === '640x256') {
          const byteVal = screenData[pixelOffset + getNxiPixelIndex(x, y)] || 0;
          colorIdx = (x & 1) ? (byteVal & 0x0F) : ((byteVal >> 4) & 0x0F);
        } else {
          colorIdx = screenData[pixelOffset + getNxiPixelIndex(x, y)] || 0;
        }
        const rgb = nxiResolvedPalette[colorIdx] || [0, 0, 0];
        const dstIdx = (y * prevW + x) * 4;
        data[dstIdx] = rgb[0];
        data[dstIdx + 1] = rgb[1];
        data[dstIdx + 2] = rgb[2];
        data[dstIdx + 3] = 255;
      }
    }
  } else if (screenData.length >= SCREEN.TOTAL_SIZE) {
    // SCR: render bitmap + attributes
    const sections = [
      { bitmapAddr: 0, attrAddr: 6144, yOffset: 0 },
      { bitmapAddr: 2048, attrAddr: 6400, yOffset: 64 },
      { bitmapAddr: 4096, attrAddr: 6656, yOffset: 128 }
    ];

    for (const section of sections) {
      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 32; col++) {
            const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const attrOffset = section.attrAddr + col + row * 32;
            const attr = screenData[attrOffset];

            // Use getColorsRgb to support ULA+ mode
            const colors = getColorsRgb(attr);
            let ink = colors.inkRgb;
            let paper = colors.paperRgb;

            // Flash only applies in standard mode (in ULA+/ULANext all 8 attribute bits are palette indices)
            if (!isUlaPlusMode && !isUlaNextMode) {
              const isFlash = (attr & 0x80) !== 0;
              if (isFlash && flashPhase && flashEnabled) {
                const tmp = ink;
                ink = paper;
                paper = tmp;
              }
            }

            const x = col * 8;
            const y = section.yOffset + row * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const px = x + bit;
              const maskIdx = y * prevW + px;
              const pixelIndex = maskIdx * 4;
              // Check for transparency
              if (typeof isPixelTransparent === 'function' && isPixelTransparent(maskIdx)) {
                const checker = getCheckerboardColor(px, y);
                data[pixelIndex] = checker[0];
                data[pixelIndex + 1] = checker[1];
                data[pixelIndex + 2] = checker[2];
              } else {
                const isSet = (byte & (0x80 >> bit)) !== 0;
                const rgb = isSet ? ink : paper;
                data[pixelIndex] = rgb[0];
                data[pixelIndex + 1] = rgb[1];
                data[pixelIndex + 2] = rgb[2];
              }
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else {
    return;
  }

  // Draw at 1:1 then scale (reuse temp canvas for performance)
  const temp = getTempPreviewCanvas(prevW, prevH);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, 0, 0, Math.round(prevW * effectiveZoom), Math.round(prevH * prevScaleY * effectiveZoom));
}

/**
 * Renders BSC preview showing full 384x304 frame with border data
 * @param {CanvasRenderingContext2D} ctx
 */
function renderBscPreview(ctx) {
  const fw = BSC.FRAME_WIDTH;   // 384
  const fh = BSC.FRAME_HEIGHT;  // 304

  previewCanvas.width = fw * previewZoom;
  previewCanvas.height = fh * previewZoom;

  const imageData = ctx.createImageData(fw, fh);
  const pixels = imageData.data;

  const mainLeft = BSC.BORDER_LEFT_PX;        // 64
  const mainTop = BSC.BORDER_TOP_PX;          // 64
  const mainRight = mainLeft + SCREEN.WIDTH;  // 320
  const mainBottom = mainTop + SCREEN.HEIGHT; // 256

  // --- Render border regions ---
  const pxPerColor = BSC.PIXELS_PER_COLOR; // 8

  /**
   * @param {number} frameY
   * @param {number} lineOffset
   * @param {number} byteCount
   * @param {number} startX
   */
  function renderBorderLine(frameY, lineOffset, byteCount, startX) {
    let x = startX;
    for (let b = 0; b < byteCount; b++) {
      const byte = screenData[lineOffset + b];
      const c1 = byte & 0x07;
      const c2 = (byte >> 3) & 0x07;
      const rgb1 = ZX_PALETTE_RGB.REGULAR[c1];
      const rgb2 = ZX_PALETTE_RGB.REGULAR[c2];

      for (let p = 0; p < pxPerColor && x < fw; p++, x++) {
        const idx = (frameY * fw + x) * 4;
        pixels[idx] = rgb1[0]; pixels[idx + 1] = rgb1[1]; pixels[idx + 2] = rgb1[2]; pixels[idx + 3] = 255;
      }
      for (let p = 0; p < pxPerColor && x < fw; p++, x++) {
        const idx = (frameY * fw + x) * 4;
        pixels[idx] = rgb2[0]; pixels[idx + 1] = rgb2[1]; pixels[idx + 2] = rgb2[2]; pixels[idx + 3] = 255;
      }
    }
  }

  // Top border: 64 lines, 24 bytes each, full width
  for (let line = 0; line < 64; line++) {
    const offset = BSC.BORDER_OFFSET + line * BSC.BYTES_PER_FULL_LINE;
    renderBorderLine(line, offset, BSC.BYTES_PER_FULL_LINE, 0);
  }

  // Side borders: 192 lines, 8 bytes each (4 left + 4 right)
  const sideBase = BSC.BORDER_OFFSET + 64 * BSC.BYTES_PER_FULL_LINE;
  for (let line = 0; line < 192; line++) {
    const frameY = mainTop + line;
    const offset = sideBase + line * BSC.BYTES_PER_SIDE_LINE;
    // Left 4 bytes (64px)
    renderBorderLine(frameY, offset, 4, 0);
    // Right 4 bytes (64px)
    renderBorderLine(frameY, offset + 4, 4, mainRight);
  }

  // Bottom border: 48 lines, 24 bytes each, full width
  const bottomBase = sideBase + 192 * BSC.BYTES_PER_SIDE_LINE;
  for (let line = 0; line < 48; line++) {
    const frameY = mainBottom + line;
    const offset = bottomBase + line * BSC.BYTES_PER_FULL_LINE;
    renderBorderLine(frameY, offset, BSC.BYTES_PER_FULL_LINE, 0);
  }

  // --- Render main screen (bitmap + attributes) at (64, 64) ---
  const sections = [
    { bitmapAddr: 0, attrAddr: 6144, yOffset: 0 },
    { bitmapAddr: 2048, attrAddr: 6400, yOffset: 64 },
    { bitmapAddr: 4096, attrAddr: 6656, yOffset: 128 }
  ];

  for (const section of sections) {
    for (let line = 0; line < 8; line++) {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 32; col++) {
          const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
          const byte = screenData[bitmapOffset];
          const attrOffset = section.attrAddr + col + row * 32;
          const attr = screenData[attrOffset];

          let inkIndex = attr & 0x07;
          let paperIndex = (attr >> 3) & 0x07;
          const isBright = (attr & 0x40) !== 0;
          const isFlash = (attr & 0x80) !== 0;

          if (isFlash && flashPhase && flashEnabled) {
            const tmp = inkIndex;
            inkIndex = paperIndex;
            paperIndex = tmp;
          }

          const palette = isBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
          const sx = col * 8;
          const sy = section.yOffset + row * 8 + line;
          const frameY = mainTop + sy;
          const frameXBase = mainLeft + sx;

          for (let bit = 0; bit < 8; bit++) {
            const isSet = (byte & (0x80 >> bit)) !== 0;
            const rgb = isSet ? palette[inkIndex] : palette[paperIndex];
            const idx = (frameY * fw + frameXBase + bit) * 4;
            pixels[idx] = rgb[0]; pixels[idx + 1] = rgb[1]; pixels[idx + 2] = rgb[2]; pixels[idx + 3] = 255;
          }
        }
      }
    }
  }

  // Draw at 1:1 then scale (reuse temp canvas for performance)
  const temp = getTempPreviewCanvas(fw, fh);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, 0, 0, fw * previewZoom, fh * previewZoom);
}

/**
 * Renders BSP gigascreen+border preview: border from picture.border, main screen as gigascreen blend.
 * @param {CanvasRenderingContext2D} ctx
 */
function renderBspGigaBorderPreview(ctx) {
  if (!currentPicture || !currentPicture.border) return;
  const fw = BSC.FRAME_WIDTH;   // 384
  const fh = BSC.FRAME_HEIGHT;  // 304

  previewCanvas.width = fw * previewZoom;
  previewCanvas.height = fh * previewZoom;

  const imageData = ctx.createImageData(fw, fh);
  const pixels = imageData.data;

  const mainLeft = BSC.BORDER_LEFT_PX;        // 64
  const mainTop = BSC.BORDER_TOP_PX;          // 64
  const mainRight = mainLeft + SCREEN.WIDTH;   // 320
  const border = currentPicture.border;
  const pxPerColor = BSC.PIXELS_PER_COLOR;     // 8

  // Helper: render border line from buffer
  function renderBorderLine(frameY, buf, bufOffset, byteCount, startX) {
    let x = startX;
    for (let byteIdx = 0; byteIdx < byteCount; byteIdx++) {
      const byte = buf[bufOffset + byteIdx];
      const c1 = byte & 0x07;
      const c2 = (byte >> 3) & 0x07;
      const rgb1 = ZX_PALETTE_RGB.REGULAR[c1];
      const rgb2 = ZX_PALETTE_RGB.REGULAR[c2];
      for (let p = 0; p < pxPerColor && x < fw; p++, x++) {
        const idx = (frameY * fw + x) * 4;
        pixels[idx] = rgb1[0]; pixels[idx + 1] = rgb1[1]; pixels[idx + 2] = rgb1[2]; pixels[idx + 3] = 255;
      }
      for (let p = 0; p < pxPerColor && x < fw; p++, x++) {
        const idx = (frameY * fw + x) * 4;
        pixels[idx] = rgb2[0]; pixels[idx + 1] = rgb2[1]; pixels[idx + 2] = rgb2[2]; pixels[idx + 3] = 255;
      }
    }
  }

  // Top border: 64 lines × 24 bytes
  for (let line = 0; line < 64; line++) {
    renderBorderLine(line, border.top, line * 24, 24, 0);
  }
  // Side borders: 192 lines × 8 bytes (4 left + 4 right)
  for (let line = 0; line < 192; line++) {
    renderBorderLine(64 + line, border.sides, line * 8, 4, 0);
    renderBorderLine(64 + line, border.sides, line * 8 + 4, 4, mainRight);
  }
  // Bottom border: 48 lines × 24 bytes
  for (let line = 0; line < 48; line++) {
    renderBorderLine(256 + line, border.bottom, line * 24, 24, 0);
  }

  // Main screen: gigascreen blend from screenData (interleaved layout)
  const gigaFS = getGigaFrameSize();
  const sections = [
    { bitmapAddr: 0, yOffset: 0 },
    { bitmapAddr: 2048, yOffset: 64 },
    { bitmapAddr: 4096, yOffset: 128 }
  ];
  for (const section of sections) {
    for (let line = 0; line < 8; line++) {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 32; col++) {
          const bitmapOffset = section.bitmapAddr + col + row * 32 + line * 256;
          const sy = section.yOffset + row * 8 + line;
          const attrOffset = 6144 + Math.floor(sy / 8) * 32 + col;

          const byte1 = screenData[bitmapOffset];
          const attr1 = screenData[attrOffset];
          const byte2 = screenData[gigaFS + bitmapOffset];
          const attr2 = screenData[gigaFS + attrOffset];

          const pal1 = (attr1 & 0x40) ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
          const pal2 = (attr2 & 0x40) ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
          const ink1 = pal1[attr1 & 7], paper1 = pal1[(attr1 >> 3) & 7];
          const ink2 = pal2[attr2 & 7], paper2 = pal2[(attr2 >> 3) & 7];

          const frameY = mainTop + sy;
          const frameXBase = mainLeft + col * 8;
          for (let bit = 0; bit < 8; bit++) {
            const rgb1 = (byte1 & (0x80 >> bit)) ? ink1 : paper1;
            const rgb2 = (byte2 & (0x80 >> bit)) ? ink2 : paper2;
            const idx = (frameY * fw + frameXBase + bit) * 4;
            pixels[idx] = Math.round((rgb1[0] + rgb2[0]) / 2);
            pixels[idx + 1] = Math.round((rgb1[1] + rgb2[1]) / 2);
            pixels[idx + 2] = Math.round((rgb1[2] + rgb2[2]) / 2);
            pixels[idx + 3] = 255;
          }
        }
      }
    }
  }

  const temp = getTempPreviewCanvas(fw, fh);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, 0, 0, fw * previewZoom, fh * previewZoom);
}

/**
 * Sets preview zoom level
 * @param {number} newZoom
 */
function setPreviewZoom(newZoom) {
  previewZoom = Math.max(1, Math.min(4, newZoom));
  const label = document.getElementById('previewZoomLevel');
  if (label) label.textContent = 'x' + previewZoom;
  renderPreview();
}

/**
 * Shows the preview panel
 */
function showPreviewPanel() {
  const panel = document.getElementById('editorPreviewPanel');
  if (panel) panel.classList.add('active');
  renderPreview();
}

/**
 * Hides the preview panel
 */
function hidePreviewPanel() {
  const panel = document.getElementById('editorPreviewPanel');
  if (panel) panel.classList.remove('active');
}

/**
 * Toggles preview panel visibility
 */
function togglePreviewPanel() {
  previewVisible = !previewVisible;
  const panel = document.getElementById('editorPreviewPanel');
  const checkbox = document.getElementById('showPreviewCheckbox');

  if (panel) {
    if (previewVisible) {
      panel.classList.add('active');
      renderPreview();
    } else {
      panel.classList.remove('active');
    }
  }

  if (checkbox) {
    /** @type {HTMLInputElement} */ (checkbox).checked = previewVisible;
  }
}

/**
 * Sets preview panel visibility
 * @param {boolean} visible
 */
function setPreviewVisible(visible) {
  previewVisible = visible;
  const panel = document.getElementById('editorPreviewPanel');

  if (panel) {
    if (previewVisible) {
      panel.classList.add('active');
      renderPreview();
    } else {
      panel.classList.remove('active');
    }
  }
}

// ============================================================================
// Preview Panel Dragging
// ============================================================================

/** @type {boolean} */
let isDraggingPreview = false;

/** @type {{x: number, y: number}} */
let dragOffset = { x: 0, y: 0 };

/**
 * Initializes preview panel drag functionality
 */
function initPreviewDrag() {
  const panel = document.getElementById('editorPreviewPanel');
  const header = panel?.querySelector('.editor-preview-header');

  if (!panel || !header) return;

  header.addEventListener('mousedown', (e) => {
    isDraggingPreview = true;
    const rect = panel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingPreview) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    // Allow panel to go 3/4 outside viewport (keep 1/4 visible)
    const minX = -panel.offsetWidth * 0.75;
    const minY = -panel.offsetHeight * 0.75;
    const maxX = window.innerWidth - panel.offsetWidth * 0.25;
    const maxY = window.innerHeight - panel.offsetHeight * 0.25;

    panel.style.left = Math.max(minX, Math.min(x, maxX)) + 'px';
    panel.style.top = Math.max(minY, Math.min(y, maxY)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDraggingPreview = false;
  });
}

// ============================================================================
// Fullscreen Editor Mode
// ============================================================================

/** @type {boolean} */
let isDraggingPalette = false;

/** @type {{x: number, y: number}} */
let paletteDragOffset = { x: 0, y: 0 };

/**
 * Toggles fullscreen editor mode
 */
function toggleFullscreenEditor() {
  fullscreenMode = !fullscreenMode;

  if (fullscreenMode) {
    enterFullscreenEditor();
  } else {
    exitFullscreenEditor();
  }
}

/**
 * Enters fullscreen editor mode
 */
function enterFullscreenEditor() {
  fullscreenMode = true;
  document.body.classList.add('fullscreen-editor');

  // Save current zoom and calculate fill zoom
  fullscreenSavedZoom = zoom;
  const totalW = getFormatWidth() + borderSize * 2;
  const totalH = getFormatHeight() + borderSize * 2;
  const margin = 40; // 20px margin on each side
  const rawFit = Math.min(
    (window.innerWidth - margin) / totalW,
    (window.innerHeight - margin) / totalH
  );
  // Snap to nearest available zoom level that fits
  const zoomLevels = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 20];
  let fitZoom = zoomLevels[0];
  for (const z of zoomLevels) {
    if (z <= rawFit) fitZoom = z;
  }
  zoom = fitZoom;
  const zs = document.getElementById('zoomSelect');
  if (zs) /** @type {HTMLSelectElement} */ (zs).value = String(zoom);

  // Request browser fullscreen
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  // Show floating palette only when Edit tab is active
  const palette = document.getElementById('floatingPalette');
  const editTabActive = document.querySelector('.panel-tab[data-tab="edit"]')?.classList.contains('active');
  if (editorActive && editTabActive) {
    document.body.classList.add('fullscreen-with-tools');
    if (palette) { palette.classList.add('active'); palette.style.display = ''; }
    updateFloatingPalette();
  } else {
    if (palette) { palette.classList.remove('active'); palette.style.display = 'none'; }
  }

  // Re-render with fill zoom
  if (editorActive) {
    editorRender();
  } else {
    renderScreen();
  }
}

/**
 * Toggles floating palette visibility in fullscreen mode
 */
function toggleFloatingPalette() {
  if (!fullscreenMode) return;
  const palette = document.getElementById('floatingPalette');
  if (palette) {
    palette.classList.toggle('active');
  }
}

/**
 * Exits fullscreen editor mode
 */
function exitFullscreenEditor() {
  fullscreenMode = false;
  document.body.classList.remove('fullscreen-editor');
  document.body.classList.remove('fullscreen-with-tools');

  // Restore saved zoom
  if (fullscreenSavedZoom !== null) {
    zoom = fullscreenSavedZoom;
    fullscreenSavedZoom = null;
    const zs = document.getElementById('zoomSelect');
    if (zs) /** @type {HTMLSelectElement} */ (zs).value = String(zoom);
  }

  // Exit browser fullscreen
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }

  // Hide floating palette and clear inline style override
  const palette = document.getElementById('floatingPalette');
  if (palette) { palette.classList.remove('active'); palette.style.display = ''; }

  // Re-render
  if (editorActive) {
    editorRender();
  } else {
    renderScreen();
  }
}

/**
 * Updates the floating palette to match current editor state
 */
function updateFloatingPalette() {
  // Update tool selection
  const floatingTools = document.querySelectorAll('.floating-tool');
  floatingTools.forEach(btn => {
    const tool = btn.getAttribute('data-tool');
    btn.classList.toggle('selected', tool === currentTool);
  });

  // Update color palette
  const colorsContainer = document.getElementById('floatingColors');
  if (colorsContainer && colorsContainer.children.length === 0) {
    // Initialize color buttons
    for (let i = 0; i < 8; i++) {
      const colorBtn = document.createElement('div');
      colorBtn.className = 'floating-palette-color';
      colorBtn.dataset.color = String(i);
      colorBtn.title = COLOR_NAMES[i];
      colorsContainer.appendChild(colorBtn);

      colorBtn.addEventListener('click', (e) => {
        editorInkColor = i;
        updateColorPreview();
        updateFloatingPalette();
      });

      colorBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        editorPaperColor = i;
        updateColorPreview();
        updateFloatingPalette();
      });
    }
  }

  // Update color button styles and markers based on current palette
  // Show bright color on top half, normal color on bottom half
  const colorBtns = colorsContainer?.querySelectorAll('.floating-palette-color');
  colorBtns?.forEach((btn, i) => {
    const normalRgb = ZX_PALETTE_RGB.REGULAR[i];
    const brightRgb = ZX_PALETTE_RGB.BRIGHT[i];
    const normalColor = `rgb(${normalRgb[0]},${normalRgb[1]},${normalRgb[2]})`;
    const brightColor = `rgb(${brightRgb[0]},${brightRgb[1]},${brightRgb[2]})`;
    /** @type {HTMLElement} */ (btn).style.background =
      `linear-gradient(to bottom, ${brightColor} 0%, ${brightColor} 50%, ${normalColor} 50%, ${normalColor} 100%)`;

    // Remove existing markers
    const existing = btn.querySelectorAll('.editor-palette-marker');
    existing.forEach(m => m.remove());

    // Add I/P markers
    if (i === editorInkColor) {
      const m = document.createElement('span');
      m.className = 'editor-palette-marker ink-marker';
      m.textContent = 'I';
      btn.appendChild(m);
    }
    if (i === editorPaperColor) {
      const m = document.createElement('span');
      m.className = 'editor-palette-marker paper-marker';
      m.textContent = 'P';
      btn.appendChild(m);
    }
  });

  // Update bright checkbox
  const brightCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('floatingBright'));
  if (brightCheckbox) brightCheckbox.checked = editorBright;
}

/**
 * Initializes floating palette interactions
 */
function initFloatingPalette() {
  const palette = document.getElementById('floatingPalette');
  const header = palette?.querySelector('.floating-palette-header');

  if (!palette || !header) return;

  // Drag functionality
  header.addEventListener('mousedown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).tagName === 'BUTTON') return;
    isDraggingPalette = true;
    const rect = palette.getBoundingClientRect();
    paletteDragOffset.x = e.clientX - rect.left;
    paletteDragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingPalette) return;

    const x = e.clientX - paletteDragOffset.x;
    const y = e.clientY - paletteDragOffset.y;

    // Keep palette within viewport
    const maxX = window.innerWidth - palette.offsetWidth;
    const maxY = window.innerHeight - palette.offsetHeight;

    palette.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    palette.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDraggingPalette = false;
  });

  // Exit fullscreen button
  const exitBtn = document.getElementById('exitFullscreenBtn');
  exitBtn?.addEventListener('click', exitFullscreenEditor);

  // Tool buttons
  const toolBtns = document.querySelectorAll('.floating-tool');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-tool');
      if (tool === 'cut') {
        if (selectionStartPoint && selectionEndPoint) cutSelection();
        updateFloatingPalette();
      } else if (tool === 'paste') {
        startPasteMode();
        updateFloatingPalette();
      } else if (tool === 'invert') {
        if (selectionStartPoint && selectionEndPoint) invertSelection();
        updateFloatingPalette();
      } else if (tool) {
        setEditorTool(tool);
        // setEditorTool already calls updateFloatingPalette if in fullscreen
      }
    });
  });

  // Bright checkbox
  const brightCheckbox = document.getElementById('floatingBright');
  brightCheckbox?.addEventListener('change', () => {
    editorBright = /** @type {HTMLInputElement} */ (brightCheckbox).checked;
    updateColorPreview();
    updateFloatingPalette();
  });
}

/**
 * Renders main screen and updates preview if editor is active
 * @param {boolean} [skipPreview=false] - Skip preview rendering for performance during continuous drawing
 */
function editorRender(skipPreview = false) {
  // Cancel any pending scheduled render to avoid overwriting this render
  if (!skipPreview && pendingRenderFrame !== null) {
    cancelAnimationFrame(pendingRenderFrame);
    pendingRenderFrame = null;
  }

  renderScreen();

  if (editorActive) {
    if (!skipPreview) {
      renderPreview();
    }
    updateFlashTimer();

    // Draw selection overlay (finalized selection rectangle)
    if (selectionStartPoint && selectionEndPoint && !isSelecting && !isPasting) {
      drawFinalizedSelectionOverlay();
    }

    // Draw paste preview at last cursor position
    if (isPasting && clipboardData) {
      drawPastePreview(pasteCursorPos.x, pasteCursorPos.y);
    }

    // Draw brush preview at cursor position
    if (brushPreviewMode && brushPreviewPos && !isPasting && !isSelecting) {
      drawBrushPreview();
    }

    // Draw border brush/barcode preview
    const needsBorderPreview = brushPreviewMode || barcodeCaptureSlot >= 0 ||
                                (barcodeMode && activeBarcode >= 0 && barcodes[activeBarcode]);
    if (needsBorderPreview && borderPreviewPos && !isPasting && !isSelecting) {
      drawBorderBrushPreview();
    }
  }
}

/**
 * Draws reference image overlay on the canvas
 */
function drawReferenceOverlay() {
  if (!referenceImage) return;

  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('screenCanvas'));
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const formatWidth = getFormatWidth();
  const formatHeight = getFormatHeight();

  // Use custom size or default to full logical size (including border)
  const borderPx = (typeof borderSize !== 'undefined' ? borderSize : 0);
  const scaleY = getPixelScaleY();
  const fullWidth = formatWidth + borderPx * 2;
  const fullHeight = formatHeight * scaleY + borderPx * 2;
  const drawWidth = (referenceWidth !== null ? referenceWidth : fullWidth) * zoom;
  const drawHeight = (referenceHeight !== null ? referenceHeight : fullHeight) * zoom;

  // Apply offset (scaled by zoom) - starts from canvas origin to cover border too
  const drawX = referenceOffsetX * zoom;
  const drawY = referenceOffsetY * zoom;

  ctx.save();
  ctx.globalAlpha = referenceOpacity;
  ctx.drawImage(
    referenceImage,
    0, 0, referenceImage.width, referenceImage.height,
    drawX, drawY, drawWidth, drawHeight
  );
  ctx.restore();
}

/**
 * Loads a reference image from a file
 * @param {File} file
 */
function loadReferenceImage(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      referenceImage = img;
      showReference = true;
      updateReferenceUI();
      editorRender();
    };
    img.src = /** @type {string} */ (e.target?.result);
  };
  reader.readAsDataURL(file);
}

/**
 * Clears the reference image
 */
function clearReferenceImage() {
  referenceImage = null;
  showReference = false;
  referenceOffsetX = 0;
  referenceOffsetY = 0;
  referenceWidth = null;
  referenceHeight = null;
  updateReferenceUI();
  editorRender();
}

/**
 * Gets reference image as data URL for saving
 * @returns {string|null}
 */
function getReferenceImageDataURL() {
  if (!referenceImage) return null;

  // Draw image to canvas to get data URL
  const canvas = document.createElement('canvas');
  canvas.width = referenceImage.width;
  canvas.height = referenceImage.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(referenceImage, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Loads reference image from data URL
 * @param {string} dataURL
 */
function loadReferenceImageFromDataURL(dataURL) {
  const img = new Image();
  img.onload = function() {
    referenceImage = img;
    updateReferenceUI();
    editorRender();
  };
  img.src = dataURL;
}

/**
 * Updates the reference image UI controls
 */
function updateReferenceUI() {
  const toggle = /** @type {HTMLInputElement|null} */ (document.getElementById('refShowCheckbox'));
  const opacityEl = /** @type {HTMLInputElement|null} */ (document.getElementById('refOpacitySlider'));
  const offsetXEl = /** @type {HTMLInputElement|null} */ (document.getElementById('refOffsetX'));
  const offsetYEl = /** @type {HTMLInputElement|null} */ (document.getElementById('refOffsetY'));
  const widthEl = /** @type {HTMLInputElement|null} */ (document.getElementById('refWidth'));
  const heightEl = /** @type {HTMLInputElement|null} */ (document.getElementById('refHeight'));

  if (toggle) toggle.checked = showReference;
  if (opacityEl) opacityEl.value = String(Math.round(referenceOpacity * 100));
  if (offsetXEl) offsetXEl.value = String(referenceOffsetX);
  if (offsetYEl) offsetYEl.value = String(referenceOffsetY);
  if (widthEl) widthEl.value = referenceWidth !== null ? String(referenceWidth) : '';
  if (heightEl) heightEl.value = referenceHeight !== null ? String(referenceHeight) : '';
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Saves current screen as .scr file
 * @param {string} [filename]
 */
function saveScrFile(filename) {
  if (!isFormatEditable()) {
    alert('No screen data to save');
    return;
  }

  // Flatten layers before saving (ensures screenData has final composite)
  if (layersEnabled && layers.length > 0) {
    flattenLayersToScreen();
  }

  /** @type {Uint8Array} */
  let saveData;
  /** @type {string} */
  let defaultExt;

  // Determine file extension based on format
  const formatExtMap = {
    [FORMAT.ATTR_53C]: '.53c', [FORMAT.BSC]: '.bsc', [FORMAT.IFL]: '.ifl',
    [FORMAT.MLT]: '.mlt', [FORMAT.BMC4]: '.bmc4', [FORMAT.RGB3]: '.3',
    [FORMAT.GIGASCREEN]: '.img', [FORMAT.MGH]: '.mg8', [FORMAT.HLR]: '.hlr', [FORMAT.STL]: '.stl', [FORMAT.BSP]: '.bsp', [FORMAT.SPECSCII]: '.specscii',
    [FORMAT.MONO_FULL]: '.scr', [FORMAT.MONO_2_3]: '.scr', [FORMAT.MONO_1_3]: '.scr',
    [FORMAT.SCR_ULAPLUS]: '.scr', [FORMAT.SCR_ULANEXT]: '.scr', [FORMAT.SCR]: '.scr',
    [FORMAT.ZXP]: '.zxp',
    [FORMAT.CHR]: '.ch$',
    [FORMAT.NXI]: '.nxi',
    [FORMAT.SL2]: '.sl2',
    [FORMAT.LORES]: '.slr',
    [FORMAT.LORES_RAD]: '.rad'
  };
  defaultExt = formatExtMap[currentFormat] || '.scr';

  if (currentFormat === FORMAT.CHR && currentPicture && typeof exportChrFile === 'function') {
    // chr$: binary format export (interleaved cells)
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const chrData = exportChrFile(currentPicture);
    if (!filename) {
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited.ch$';
      } else {
        filename = 'screen.ch$';
      }
    }
    downloadFile(new Blob([chrData], { type: 'application/octet-stream' }), filename);
    if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
      openPictures[activePictureIndex].modified = false;
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    }
    return;
  }

  if (currentFormat === FORMAT.ZXP && currentPicture && currentPicture.nirvanaTileInfo) {
    // Nirvana btile/wtile: convert linear bitmap+attrs back to tile format
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const ti = currentPicture.nirvanaTileInfo;
    const tCellsW = ti.cellsW;
    const tCellsH = ti.cellsH;
    const tPixW = tCellsW * 8;
    const tPixH = tCellsH * 8;
    const tBitmapSize = tPixH * tCellsW;
    const tAttrSize = tCellsW * tCellsH * 4;
    const tTileSize = tBitmapSize + tAttrSize;
    const tCols = currentPicture.cols;
    const tAttrRowsPerTile = tCellsH * 4;
    const tileData = new Uint8Array(ti.tileCount * tTileSize);
    const picBitmap = currentPicture.planes[0].bitmap;
    const picAttrs = currentPicture.planes[0].attrs;

    for (let t = 0; t < ti.tileCount; t++) {
      const col = t % ti.tilesPerRow;
      const row = Math.floor(t / ti.tilesPerRow);
      const tileOff = t * tTileSize;

      // Export bitmap: linear row-major → tile bytes
      for (let ty = 0; ty < tPixH; ty++) {
        const srcY = row * tPixH + ty;
        const srcByteCol = col * tCellsW;
        for (let bx = 0; bx < tCellsW; bx++) {
          tileData[tileOff + ty * tCellsW + bx] = picBitmap[srcY * tCols + srcByteCol + bx];
        }
      }

      // Export attrs: row-major → btile column-major or wtile row-major
      for (let ay = 0; ay < tAttrRowsPerTile; ay++) {
        for (let ax = 0; ax < tCellsW; ax++) {
          const srcAddr = (row * tAttrRowsPerTile + ay) * tCols + col * tCellsW + ax;
          const dstIdx = ti.isBtile ? (ax * tAttrRowsPerTile + ay) : (ay * tCellsW + ax);
          tileData[tileOff + tBitmapSize + dstIdx] = picAttrs[srcAddr];
        }
      }
    }

    if (!filename) {
      const tileExt = ti.isBtile ? '.btile' : '.wtile';
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited' + tileExt;
      } else {
        filename = 'tiles' + tileExt;
      }
    }
    downloadFile(new Blob([tileData], { type: 'application/octet-stream' }), filename);
    if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
      openPictures[activePictureIndex].modified = false;
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    }
    return;
  }

  if (currentFormat === FORMAT.ZXP && currentPicture && typeof exportZxp === 'function') {
    // ZXP: text format export
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const zxpText = exportZxp(currentPicture);
    if (!filename) {
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited.zxp';
      } else {
        filename = 'screen.zxp';
      }
    }
    downloadFile(new Blob([zxpText], { type: 'text/plain' }), filename);
    if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
      openPictures[activePictureIndex].modified = false;
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    }
    return;
  }

  if (currentFormat === FORMAT.MGH && currentPicture && typeof exportMgh === 'function') {
    // MGH: sync screenData (gigascreen layout) back to picture, then export with header
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const mghData = exportMgh(currentPicture);
    const mghExt = currentPicture.attrCellHeight === 1 ? '.mg1' : currentPicture.attrCellHeight === 2 ? '.mg2' : currentPicture.attrCellHeight === 4 ? '.mg4' : '.mg8';
    if (!filename) {
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited' + mghExt;
      } else {
        filename = 'screen' + mghExt;
      }
    }
    downloadFile(new Blob([mghData], { type: 'application/octet-stream' }), filename);
    if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
      openPictures[activePictureIndex].modified = false;
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    }
    return;
  }

  if (currentFormat === FORMAT.HLR && currentPicture && typeof exportHlr === 'function') {
    // HLR: sync screenData (gigascreen layout) back to picture, then export with Z80 loader prefix
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const hlrData = exportHlr(currentPicture);
    if (!filename) {
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited.hlr';
      } else {
        filename = 'screen.hlr';
      }
    }
    downloadFile(new Blob([hlrData], { type: 'application/octet-stream' }), filename);
    if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
      openPictures[activePictureIndex].modified = false;
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    }
    return;
  }

  if (currentFormat === FORMAT.STL && currentPicture && typeof exportStl === 'function') {
    // STL: sync screenData back to picture, then export interleaved attrs
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const stlData = exportStl(currentPicture);
    if (!filename) {
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited.stl';
      } else {
        filename = 'screen.stl';
      }
    }
    downloadFile(new Blob([stlData], { type: 'application/octet-stream' }), filename);
    if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
      openPictures[activePictureIndex].modified = false;
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
    }
    return;
  }

  if (currentFormat === FORMAT.BSP && currentPicture && typeof exportBsp === 'function') {
    // BSP: sync screenData back to picture, then export with header + RLE border
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, currentPicture);
    }
    const bspData = exportBsp(currentPicture);
    if (!filename) {
      if (currentFileName) {
        const baseName = currentFileName.replace(/\.[^.]+$/, '');
        filename = baseName + '_edited.bsp';
      } else {
        filename = 'screen.bsp';
      }
    }
    if (bspData) {
      downloadFile(new Blob([bspData], { type: 'application/octet-stream' }), filename);
      if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
        openPictures[activePictureIndex].modified = false;
        if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
      }
    }
    return;
  }

  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    // NXI/SL2: save complete file (palette+pixels or raw pixels)
    saveData = new Uint8Array(screenData);
  } else if (currentFormat === FORMAT.LORES) {
    // LoRes: save first 12288 bytes (128×96 pixel data)
    saveData = screenData.slice(0, LORES.PIXEL_DATA_SIZE);
  } else if (currentFormat === FORMAT.LORES_RAD) {
    // LoRes Radastan: save 6144 bytes (128×96 4bpp packed nibbles)
    saveData = screenData.slice(0, LORES_RAD.PIXEL_DATA_SIZE);
  } else if (currentFormat === FORMAT.SPECSCII) {
    // SPECSCII: sync grids to stream and save (special case — stream format)
    if (specsciiCharGrid && specsciiAttrGrid) {
      specsciiSyncToStream();
    }
    saveData = screenData ? new Uint8Array(screenData) : new Uint8Array(0);
  } else if (currentFormat === FORMAT.SCR_ULAPLUS && currentPicture) {
    // ULA+ format: ensure palette is current before export
    if (ulaPlusPalette) currentPicture.palette = ulaPlusPalette.slice();
    saveData = (typeof exportScrUlaPlus === 'function') ? exportScrUlaPlus(currentPicture)
      : screenData.slice(0, ULAPLUS.TOTAL_SIZE);
  } else if (currentFormat === FORMAT.SCR_ULANEXT && isUlaNextMode && ulaNextPalette) {
    // ULANext: 6912 SCR + 1 mask byte + palette entries
    // Preserve original format (1-byte 8-bit or 2-byte 9-bit)
    const scrData = screenData.slice(0, SCREEN.TOTAL_SIZE);
    const totalEntries = ulaNextInkCount + ulaNextPaperCount;
    let palBytes;
    if (ulaNextInkMask === 0xFF && ulaNextIs9bit) {
      // 9-bit: 256 ink × 2 bytes + 1 paper × 1 byte = 513
      palBytes = new Uint8Array(513);
      for (let i = 0; i < 256; i++) {
        const [r, g, b] = ulaNextPalette[i] || [0, 0, 0];
        const r3 = Math.round(r * 7 / 255);
        const g3 = Math.round(g * 7 / 255);
        const b3 = Math.round(b * 7 / 255);
        palBytes[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
        palBytes[i * 2 + 1] = b3 & 1;
      }
      const [r, g, b] = ulaNextPalette[256] || [0, 0, 0];
      const r3 = Math.round(r * 7 / 255);
      const g3 = Math.round(g * 7 / 255);
      const b2 = Math.round(b * 3 / 255);
      palBytes[512] = (r3 << 5) | (g3 << 2) | b2;
    } else if (ulaNextIs9bit) {
      // 9-bit: all entries × 2 bytes (RRRGGGBB + B_lsb)
      palBytes = new Uint8Array(totalEntries * 2);
      for (let i = 0; i < totalEntries; i++) {
        const [r, g, b] = ulaNextPalette[i] || [0, 0, 0];
        const r3 = Math.round(r * 7 / 255);
        const g3 = Math.round(g * 7 / 255);
        const b3 = Math.round(b * 7 / 255);
        palBytes[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
        palBytes[i * 2 + 1] = b3 & 1;
      }
    } else {
      // 8-bit: all entries × 1 byte (RRRGGGBB)
      palBytes = new Uint8Array(totalEntries);
      for (let i = 0; i < totalEntries; i++) {
        const [r, g, b] = ulaNextPalette[i] || [0, 0, 0];
        const r3 = Math.round(r * 7 / 255);
        const g3 = Math.round(g * 7 / 255);
        const b2 = Math.round(b * 3 / 255);
        palBytes[i] = (r3 << 5) | (g3 << 2) | b2;
      }
    }
    saveData = new Uint8Array(SCREEN.TOTAL_SIZE + 1 + palBytes.length);
    saveData.set(scrData, 0);
    saveData[SCREEN.TOTAL_SIZE] = ulaNextInkMask;
    saveData.set(palBytes, SCREEN.TOTAL_SIZE + 1);
  } else if (currentPicture && typeof exportPicture === 'function') {
    // Use internal picture format export for all formats with currentPicture
    const exported = exportPicture(currentPicture);
    saveData = exported || screenData.slice(0, SCREEN.TOTAL_SIZE);
  } else {
    // Legacy fallback: slice screenData by format size
    const formatSizeMap = {
      [FORMAT.ATTR_53C]: 768, [FORMAT.BSC]: BSC.TOTAL_SIZE, [FORMAT.IFL]: IFL.TOTAL_SIZE,
      [FORMAT.MLT]: MLT.TOTAL_SIZE, [FORMAT.BMC4]: BMC4.TOTAL_SIZE, [FORMAT.RGB3]: RGB3.TOTAL_SIZE,
      [FORMAT.GIGASCREEN]: GIGASCREEN.TOTAL_SIZE, [FORMAT.HLR]: GIGASCREEN.TOTAL_SIZE, [FORMAT.STL]: 15360, [FORMAT.MONO_FULL]: 6144,
      [FORMAT.MONO_2_3]: 4096, [FORMAT.MONO_1_3]: 2048, [FORMAT.SCR_ULAPLUS]: ULAPLUS.TOTAL_SIZE,
      [FORMAT.SCR]: SCREEN.TOTAL_SIZE
    };
    const size = formatSizeMap[currentFormat] || SCREEN.TOTAL_SIZE;
    saveData = screenData.slice(0, size);
  }

  if (!filename) {
    if (currentFileName) {
      const baseName = currentFileName.replace(/\.[^.]+$/, '');
      filename = baseName + '_edited' + defaultExt;
    } else {
      filename = currentFormat === FORMAT.ATTR_53C ? 'attributes.53c' :
                 currentFormat === FORMAT.BSC ? 'screen.bsc' :
                 currentFormat === FORMAT.IFL ? 'screen.ifl' :
                 currentFormat === FORMAT.MLT ? 'screen.mlt' :
                 currentFormat === FORMAT.BMC4 ? 'screen.bmc4' :
                 currentFormat === FORMAT.GIGASCREEN ? 'screen.img' :
                 currentFormat === FORMAT.MGH ? (currentPicture && currentPicture.attrCellHeight === 1 ? 'screen.mg1' : currentPicture && currentPicture.attrCellHeight === 2 ? 'screen.mg2' : currentPicture && currentPicture.attrCellHeight === 4 ? 'screen.mg4' : 'screen.mg8') :
                 currentFormat === FORMAT.HLR ? 'screen.hlr' :
                 currentFormat === FORMAT.STL ? 'screen.stl' :
                 currentFormat === FORMAT.BSP ? 'screen.bsp' :
                 currentFormat === FORMAT.SPECSCII ? 'screen.specscii' :
                 currentFormat === FORMAT.ZXP ? 'screen.zxp' :
                 currentFormat === FORMAT.NXI ? 'screen.nxi' :
                 currentFormat === FORMAT.SL2 ? 'screen.sl2' :
                 currentFormat === FORMAT.LORES ? 'screen.slr' :
                 currentFormat === FORMAT.LORES_RAD ? 'screen.rad' :
                 currentFormat === FORMAT.CHR ? 'screen.ch$' : 'screen.scr';
    }
  }

  downloadFile(new Blob([saveData], { type: 'application/octet-stream' }), filename);

  // Reset modified flag after successful save
  if (activePictureIndex >= 0 && activePictureIndex < openPictures.length) {
    openPictures[activePictureIndex].modified = false;
    updatePictureTabBar();
  }
}


/**
 * Creates a new blank screen
 * @param {number} ink
 * @param {number} paper
 * @param {boolean} bright
 */
function createNewScreen(ink, paper, bright) {
  screenData = new Uint8Array(SCREEN.TOTAL_SIZE);

  // Fill all attributes
  const attr = buildAttribute(ink, paper, bright, false);
  for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
    screenData[i] = attr;
  }

  currentFormat = FORMAT.SCR;
  currentFileName = 'new_screen.scr';

  if (typeof updateFileInfo === 'function') {
    updateFileInfo();
  }

  editorRender();
}

/**
 * Creates a new picture of the given format and enters the editor.
 * Extensible — add new format cases as needed.
 * @param {string} format - 'scr', 'atr', 'zxp', etc.
 * @param {Object} [params] - Optional parameters (used by ZXP: width, height, palette)
 */
function createNewPicture(format, params) {
  // Exit editor first if active
  if (editorActive) {
    setEditorEnabled(false);
  }

  // Stop any SCA animation and reset state
  if (typeof resetScaState === 'function') {
    resetScaState();
  }

  // Reset ULA+ mode (will be re-enabled if creating ULA+ format)
  if (typeof resetUlaPlusMode === 'function') {
    resetUlaPlusMode();
  }

  // Build new screen data
  let newData;
  let newFormat;
  let newFileName;

  // Use current editor colors (use standard mode for new attribute)
  // For ULA+ format, we'll set up the mode after creating the data
  const newAttr = buildAttribute(
    editorInkColor === COLOR_TRANSPARENT ? 0 : editorInkColor,
    editorPaperColor === COLOR_TRANSPARENT ? 7 : editorPaperColor,
    editorBright,
    editorFlash
  );

  // Border color for BSC/BMC4 (from screen_viewer.js, default to 7/white)
  const bc = (typeof borderColor !== 'undefined') ? (borderColor & 0x07) : 7;
  const borderByte = bc | (bc << 3); // Same color in both slots

  let newInternalPicture = null;

  switch (format) {
    case 'zxp': {
      let w = (params && params.width) || 256;
      let h = (params && params.height) || 192;
      w = Math.max(8, Math.min(2048, Math.round(w / 8) * 8));
      h = Math.max(8, Math.min(2048, Math.round(h / 8) * 8));
      const cols = w >> 3;
      const attrCellH = 8;
      const attrRows = Math.ceil(h / attrCellH);
      const bitmapSize = cols * h;
      const attrSize = cols * attrRows;

      newData = new Uint8Array(bitmapSize + attrSize);
      for (let i = bitmapSize; i < bitmapSize + attrSize; i++) {
        newData[i] = newAttr;
      }

      let palette = null;
      if (params && params.palette === 'ulaplus') {
        palette = generateDefaultUlaPlusPalette();
        ulaPlusPalette = palette.slice();
        isUlaPlusMode = true;
        resetUlaNextMode();
        resetUlaPlusColors();
      }

      newFormat = FORMAT.ZXP;
      newFileName = 'new_screen.zxp';

      const bitmap = newData.subarray(0, bitmapSize);
      const attrs = newData.subarray(bitmapSize);
      newInternalPicture = importZxp(bitmap, attrs, newFileName, w, h, attrCellH, palette);
      break;
    }

    case 'ch$':
    case 'ch$giga': {
      // chr$: variable-size (8..2040 px per axis, max 255 cells) with 8×8
      // attribute cells. Mono (bpc=9) uses a single plane; gigascreen (bpc=18)
      // uses two planes. No ULA+ support.
      let w = (params && params.width) || 256;
      let h = (params && params.height) || 192;
      w = Math.max(8, Math.min(2040, Math.round(w / 8) * 8));
      h = Math.max(8, Math.min(2040, Math.round(h / 8) * 8));
      const chrCols = w >> 3;
      const chrRows = h >> 3;
      const chrBitmapSize = chrCols * h;
      const chrAttrSize = chrCols * chrRows;
      const chrFrameSize = chrBitmapSize + chrAttrSize;
      const chrIsGigascreen = format === 'ch$giga';
      const chrFrameCount = chrIsGigascreen ? 2 : 1;

      newData = new Uint8Array(chrFrameSize * chrFrameCount);
      for (let f = 0; f < chrFrameCount; f++) {
        const attrOff = f * chrFrameSize + chrBitmapSize;
        for (let i = 0; i < chrAttrSize; i++) {
          newData[attrOff + i] = newAttr;
        }
      }

      newFormat = FORMAT.CHR;
      newFileName = 'new_screen.ch$';

      if (chrIsGigascreen) {
        if (typeof makePicture === 'function') {
          newInternalPicture = makePicture({
            sourceFormat: 'ch$',
            fileName: newFileName,
            width: w,
            height: h,
            attrCellHeight: 8,
            planeCount: 2,
            contentMode: 'pixel',
            colorMode: 'gigascreen'
          });
          newInternalPicture.planes[0].bitmap.set(newData.subarray(0, chrBitmapSize));
          newInternalPicture.planes[0].attrs.set(newData.subarray(chrBitmapSize, chrFrameSize));
          newInternalPicture.planes[1].bitmap.set(newData.subarray(chrFrameSize, chrFrameSize + chrBitmapSize));
          newInternalPicture.planes[1].attrs.set(newData.subarray(chrFrameSize + chrBitmapSize, chrFrameSize * 2));
        }
        if (typeof generateGigascreenVirtualPalette === 'function') {
          generateGigascreenVirtualPalette();
        }
      } else {
        const chrBitmap = newData.subarray(0, chrBitmapSize);
        const chrAttrs = newData.subarray(chrBitmapSize);
        if (typeof importZxp === 'function') {
          newInternalPicture = importZxp(chrBitmap, chrAttrs, newFileName, w, h, 8, null);
        }
        if (newInternalPicture) {
          newInternalPicture.sourceFormat = 'ch$';
        }
      }
      break;
    }

    case 'atr':
      newData = new Uint8Array(SCREEN.ATTR_SIZE);
      for (let i = 0; i < SCREEN.ATTR_SIZE; i++) {
        newData[i] = newAttr;
      }
      newFormat = FORMAT.ATTR_53C;
      newFileName = 'new_screen.atr';
      break;

    case 'bsc':
      newData = new Uint8Array(BSC.TOTAL_SIZE);
      // Fill attributes with current ink/paper
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
      }
      // Fill border with current border color
      for (let i = BSC.BORDER_OFFSET; i < BSC.TOTAL_SIZE; i++) {
        newData[i] = borderByte;
      }
      newFormat = FORMAT.BSC;
      newFileName = 'new_screen.bsc';
      break;

    case 'bsp':
      // BSP non-giga + border: same screenData layout as BSC (11136 bytes)
      newData = new Uint8Array(BSC.TOTAL_SIZE);
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
      }
      for (let i = BSC.BORDER_OFFSET; i < BSC.TOTAL_SIZE; i++) {
        newData[i] = borderByte;
      }
      newFormat = FORMAT.BSP;
      newFileName = 'new_screen.bsp';
      if (typeof makePicture === 'function') {
        newInternalPicture = makePicture({
          sourceFormat: 'bsp',
          fileName: newFileName,
          width: 256,
          height: 192,
          attrCellHeight: 8,
          planeCount: 1,
          contentMode: 'pixel',
          colorMode: 'standard'
        });
        for (let i = 0; i < 768; i++) {
          newInternalPicture.planes[0].attrs[i] = newAttr;
        }
        if (typeof extractBorder === 'function') {
          newInternalPicture.border = extractBorder(newData, BSC.BORDER_OFFSET);
        }
        newInternalPicture.bspTitle = (params && params.title) || '';
        newInternalPicture.bspAuthor = (params && params.author) || '';
        newInternalPicture.bspConfig = 0x40; // hasBorder
        newInternalPicture.bspBorderColor = bc;
      }
      break;

    case 'bsp_giga': {
      // BSP gigascreen + border: 13824-byte IMG layout + border on picture object
      const bspGigaData = new Uint8Array(SCREEN.TOTAL_SIZE * 2); // 13824
      // Fill both frames' attrs
      if (typeof gigascreenVirtualPalette !== 'undefined' && gigascreenVirtualPalette.length === 0 &&
          typeof generateGigascreenVirtualPalette === 'function') {
        generateGigascreenVirtualPalette();
      }
      let bspAttr1 = newAttr;
      let bspAttr2 = newAttr;
      if (typeof gigascreenVirtualPalette !== 'undefined' && gigascreenVirtualPalette.length > 0) {
        const bspInkEntry = gigascreenVirtualPalette[typeof gigascreenVirtualInk !== 'undefined' ? gigascreenVirtualInk : 0];
        const bspPaperEntry = gigascreenVirtualPalette[typeof gigascreenVirtualPaper !== 'undefined' ? gigascreenVirtualPaper : 0];
        if (bspInkEntry && bspPaperEntry) {
          const f1ink = bspInkEntry.frame1Color & 7;
          const f1paper = bspPaperEntry.frame1Color & 7;
          const f1bright = bspInkEntry.frame1Color >= 8 || bspPaperEntry.frame1Color >= 8;
          const f2ink = bspInkEntry.frame2Color & 7;
          const f2paper = bspPaperEntry.frame2Color & 7;
          const f2bright = bspInkEntry.frame2Color >= 8 || bspPaperEntry.frame2Color >= 8;
          bspAttr1 = buildAttribute(f1ink, f1paper, f1bright, false);
          bspAttr2 = buildAttribute(f2ink, f2paper, f2bright, false);
        }
      }
      for (let i = 0; i < 768; i++) {
        bspGigaData[6144 + i] = bspAttr1;
        bspGigaData[6912 + 6144 + i] = bspAttr2;
      }
      newData = bspGigaData;
      newFormat = FORMAT.BSP;
      newFileName = 'new_screen.bsp';
      if (typeof makePicture === 'function') {
        newInternalPicture = makePicture({
          sourceFormat: 'bsp',
          fileName: newFileName,
          width: 256,
          height: 192,
          attrCellHeight: 8,
          planeCount: 2,
          contentMode: 'pixel',
          colorMode: 'gigascreen'
        });
        for (let i = 0; i < 768; i++) {
          newInternalPicture.planes[0].attrs[i] = bspAttr1;
          newInternalPicture.planes[1].attrs[i] = bspAttr2;
        }
        // Create border filled with border color
        if (typeof makeBorder === 'function') {
          newInternalPicture.border = makeBorder();
          newInternalPicture.border.top.fill(borderByte);
          newInternalPicture.border.sides.fill(borderByte);
          newInternalPicture.border.bottom.fill(borderByte);
        }
        newInternalPicture.bspTitle = (params && params.title) || '';
        newInternalPicture.bspAuthor = (params && params.author) || '';
        newInternalPicture.bspConfig = 0xC0; // hasGiga + hasBorder
        newInternalPicture.bspBorderColor = bc;
      }
      if (typeof generateGigascreenVirtualPalette === 'function') {
        generateGigascreenVirtualPalette();
      }
      break;
    }

    case 'ifl':
      newData = new Uint8Array(IFL.TOTAL_SIZE);
      // Fill attributes with current ink/paper
      for (let i = IFL.BITMAP_SIZE; i < IFL.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
      }
      newFormat = FORMAT.IFL;
      newFileName = 'new_screen.ifl';
      break;

    case 'mlt':
      newData = new Uint8Array(MLT.TOTAL_SIZE);
      // Fill attributes with current ink/paper
      for (let i = MLT.BITMAP_SIZE; i < MLT.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
      }
      newFormat = FORMAT.MLT;
      newFileName = 'new_screen.mlt';
      break;

    case 'bmc4':
      newData = new Uint8Array(BMC4.TOTAL_SIZE);
      // Fill attr1 and attr2 with current ink/paper
      for (let i = BMC4.ATTR1_OFFSET; i < BMC4.ATTR1_OFFSET + BMC4.ATTR1_SIZE; i++) {
        newData[i] = newAttr;
      }
      for (let i = BMC4.ATTR2_OFFSET; i < BMC4.ATTR2_OFFSET + BMC4.ATTR2_SIZE; i++) {
        newData[i] = newAttr;
      }
      // Fill border with current border color
      for (let i = BMC4.BORDER_OFFSET; i < BMC4.TOTAL_SIZE; i++) {
        newData[i] = borderByte;
      }
      newFormat = FORMAT.BMC4;
      newFileName = 'new_screen.bmc4';
      break;

    case 'mono_full':
      newData = new Uint8Array(6144);
      newFormat = FORMAT.MONO_FULL;
      newFileName = 'new_screen.scr';
      break;

    case 'mono_2_3':
      newData = new Uint8Array(4096);
      newFormat = FORMAT.MONO_2_3;
      newFileName = 'new_screen.scr';
      break;

    case 'mono_1_3':
      newData = new Uint8Array(2048);
      newFormat = FORMAT.MONO_1_3;
      newFileName = 'new_screen.scr';
      break;

    case 'rgb3':
      // RGB3: 3 separate bitmaps for R, G, B channels
      // All zeros = black screen
      newData = new Uint8Array(RGB3.TOTAL_SIZE);
      newFormat = FORMAT.RGB3;
      newFileName = 'new_screen.3';
      break;

    case 'ulaplus':
      // ULA+: standard SCR + 64-byte palette
      newData = new Uint8Array(ULAPLUS.TOTAL_SIZE);
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
      }
      // Append default ULA+ palette
      const defaultPalette = generateDefaultUlaPlusPalette();
      newData.set(defaultPalette, ULAPLUS.PALETTE_OFFSET);
      newFormat = FORMAT.SCR_ULAPLUS;
      newFileName = 'new_screen.scr';
      // Enable ULA+ mode
      ulaPlusPalette = defaultPalette.slice();
      isUlaPlusMode = true;
      resetUlaNextMode();
      resetUlaPlusColors();
      break;

    case 'gigascreen':
      // Gigascreen: two SCR frames (6912 * 2 = 13824 bytes)
      newData = new Uint8Array(GIGASCREEN.TOTAL_SIZE);
      // Fill attributes in both frames
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
        newData[GIGASCREEN.FRAME_SIZE + i] = newAttr;
      }
      newFormat = FORMAT.GIGASCREEN;
      newFileName = 'new_screen.img';
      // Initialize virtual palette
      generateGigascreenVirtualPalette();
      break;

    case 'mg8':
    case 'mg4':
    case 'mg2':
    case 'mg1': {
      // MGH gigascreen: interleaved layout with variable attr cell height
      const cellH = format === 'mg8' ? 8 : format === 'mg4' ? 4 : format === 'mg2' ? 2 : 1;
      const attrRows = Math.ceil(192 / cellH);
      const attrSize = attrRows * 32;
      const frameSize = 6144 + attrSize;
      newData = new Uint8Array(frameSize * 2);
      // Fill attributes in both frames
      for (let i = 0; i < attrSize; i++) {
        newData[6144 + i] = newAttr;
        newData[frameSize + 6144 + i] = newAttr;
      }
      newFormat = FORMAT.MGH;
      newFileName = 'new_screen.' + format;
      // Create internal picture with correct attrCellHeight
      if (typeof makePicture === 'function') {
        newInternalPicture = makePicture({
          sourceFormat: 'mgh',
          fileName: newFileName,
          width: 256,
          height: 192,
          attrCellHeight: cellH,
          planeCount: 2,
          contentMode: 'pixel',
          colorMode: 'gigascreen'
        });
        // Fill attrs in picture planes too
        for (let i = 0; i < attrSize; i++) {
          newInternalPicture.planes[0].attrs[i] = newAttr;
          newInternalPicture.planes[1].attrs[i] = newAttr;
        }
      }
      // Initialize virtual palette
      generateGigascreenVirtualPalette();
      break;
    }

    case 'hlr': {
      // HLR (Gigascreen Lowres): gigascreen layout with a loader-tiled bitmap
      // and two attribute banks. New pictures use the caller-supplied 8-byte
      // fill pattern (or the standard top/bottom halves pattern if none was
      // provided); the pattern is stored on the internal picture so drawing
      // and export use the same bytes.
      newData = new Uint8Array(GIGASCREEN.TOTAL_SIZE);
      const hlrDefaultPattern = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00]);
      const hlrPattern = (params && params.hlrPattern && params.hlrPattern.length === 8)
        ? new Uint8Array(params.hlrPattern)
        : hlrDefaultPattern;
      // Fill both frames' bitmap with the pattern (interleaved SCR layout)
      for (let third = 0; third < 3; third++) {
        const thirdBase = third * 2048;
        for (let pixelLine = 0; pixelLine < 8; pixelLine++) {
          const fill = hlrPattern[pixelLine];
          for (let charRow = 0; charRow < 8; charRow++) {
            const rowOff = thirdBase + charRow * 32 + pixelLine * 256;
            for (let col = 0; col < 32; col++) {
              newData[rowOff + col] = fill;
              newData[GIGASCREEN.FRAME_SIZE + rowOff + col] = fill;
            }
          }
        }
      }
      // Build per-frame attributes from the current gigascreen virtual ink/paper
      // selection so the new HLR picture reflects the colors picked in the
      // gigascreen palette grid (not the unrelated standard editor ink/paper).
      if (gigascreenVirtualPalette.length === 0) {
        generateGigascreenVirtualPalette();
      }
      let hlrAttr1 = newAttr;
      let hlrAttr2 = newAttr;
      const hlrInkEntry = gigascreenVirtualPalette[gigascreenVirtualInk];
      const hlrPaperEntry = gigascreenVirtualPalette[gigascreenVirtualPaper];
      if (hlrInkEntry && hlrPaperEntry) {
        const f1ink = hlrInkEntry.frame1Color & 7;
        const f1paper = hlrPaperEntry.frame1Color & 7;
        const f1bright = hlrInkEntry.frame1Color >= 8 || hlrPaperEntry.frame1Color >= 8;
        const f2ink = hlrInkEntry.frame2Color & 7;
        const f2paper = hlrPaperEntry.frame2Color & 7;
        const f2bright = hlrInkEntry.frame2Color >= 8 || hlrPaperEntry.frame2Color >= 8;
        hlrAttr1 = buildAttribute(f1ink, f1paper, f1bright, false);
        hlrAttr2 = buildAttribute(f2ink, f2paper, f2bright, false);
      }
      // Fill the two attribute banks with the per-frame attributes
      for (let i = 0; i < 768; i++) {
        newData[6144 + i] = hlrAttr1;
        newData[GIGASCREEN.FRAME_SIZE + 6144 + i] = hlrAttr2;
      }
      newFormat = FORMAT.HLR;
      newFileName = 'new_screen.hlr';
      // Create internal picture with sourceFormat='hlr' and the default pattern
      if (typeof makePicture === 'function') {
        newInternalPicture = makePicture({
          sourceFormat: 'hlr',
          fileName: newFileName,
          width: 256,
          height: 192,
          attrCellHeight: 8,
          planeCount: 2,
          contentMode: 'pixel',
          colorMode: 'gigascreen'
        });
        // Store the 8-byte fill pattern on the picture so drawing/export use it
        newInternalPicture.pattern = new Uint8Array(hlrPattern);
        // Tile the pattern into both plane bitmaps (linear row-major)
        const planeAttrs = [hlrAttr1, hlrAttr2];
        for (let p = 0; p < 2; p++) {
          const bm = newInternalPicture.planes[p].bitmap;
          for (let y = 0; y < 192; y++) {
            const fill = hlrPattern[y & 7];
            const rowOff = y * 32;
            for (let col = 0; col < 32; col++) {
              bm[rowOff + col] = fill;
            }
          }
          for (let i = 0; i < 768; i++) {
            newInternalPicture.planes[p].attrs[i] = planeAttrs[p];
          }
        }
      }
      break;
    }

    case 'stl': {
      // STL (Stellar): gigascreen layout with fixed 0x0F bitmap and
      // attrCellHeight=4. Two frames of 7680 bytes each (6144 bitmap + 1536 attrs).
      const stlAttrSize = 1536; // 32 cols × 48 rows
      const stlFrameSize = 6144 + stlAttrSize; // 7680
      newData = new Uint8Array(stlFrameSize * 2); // 15360
      // Fill both frames' bitmap with fixed 0x0F (interleaved SCR layout)
      for (let third = 0; third < 3; third++) {
        const thirdBase = third * 2048;
        for (let pixelLine = 0; pixelLine < 8; pixelLine++) {
          for (let charRow = 0; charRow < 8; charRow++) {
            const rowOff = thirdBase + charRow * 32 + pixelLine * 256;
            for (let col = 0; col < 32; col++) {
              newData[rowOff + col] = 0x0F;
              newData[stlFrameSize + rowOff + col] = 0x0F;
            }
          }
        }
      }
      // Build per-frame attributes from the current gigascreen virtual ink/paper
      if (gigascreenVirtualPalette.length === 0) {
        generateGigascreenVirtualPalette();
      }
      let stlAttr1 = newAttr;
      let stlAttr2 = newAttr;
      const stlInkEntry = gigascreenVirtualPalette[gigascreenVirtualInk];
      const stlPaperEntry = gigascreenVirtualPalette[gigascreenVirtualPaper];
      if (stlInkEntry && stlPaperEntry) {
        const f1ink = stlInkEntry.frame1Color & 7;
        const f1paper = stlPaperEntry.frame1Color & 7;
        const f1bright = stlInkEntry.frame1Color >= 8 || stlPaperEntry.frame1Color >= 8;
        const f2ink = stlInkEntry.frame2Color & 7;
        const f2paper = stlPaperEntry.frame2Color & 7;
        const f2bright = stlInkEntry.frame2Color >= 8 || stlPaperEntry.frame2Color >= 8;
        stlAttr1 = buildAttribute(f1ink, f1paper, f1bright, false);
        stlAttr2 = buildAttribute(f2ink, f2paper, f2bright, false);
      }
      // Fill the two attribute banks
      for (let i = 0; i < stlAttrSize; i++) {
        newData[6144 + i] = stlAttr1;
        newData[stlFrameSize + 6144 + i] = stlAttr2;
      }
      newFormat = FORMAT.STL;
      newFileName = 'new_screen.stl';
      // Create internal picture
      if (typeof makePicture === 'function') {
        newInternalPicture = makePicture({
          sourceFormat: 'stl',
          fileName: newFileName,
          width: 256,
          height: 192,
          attrCellHeight: 4,
          planeCount: 2,
          contentMode: 'pixel',
          colorMode: 'gigascreen'
        });
        // Fill both plane bitmaps with 0x0F (linear row-major)
        const stlPlaneAttrs = [stlAttr1, stlAttr2];
        for (let p = 0; p < 2; p++) {
          const bm = newInternalPicture.planes[p].bitmap;
          for (let y = 0; y < 192; y++) {
            const rowOff = y * 32;
            for (let col = 0; col < 32; col++) {
              bm[rowOff + col] = 0x0F;
            }
          }
          for (let i = 0; i < stlAttrSize; i++) {
            newInternalPicture.planes[p].attrs[i] = stlPlaneAttrs[p];
          }
        }
      }
      break;
    }

    case 'nxi':
    case 'nxi320':
    case 'nxi640': {
      // NXI: palette + pixel data; size depends on mode
      const nxiIs320 = format === 'nxi320';
      const nxiIs640 = format === 'nxi640';
      const nxiTotalSize = nxiIs320 ? NXI.TOTAL_SIZE_320 : nxiIs640 ? NXI.TOTAL_SIZE_640 : NXI.TOTAL_SIZE;
      const nxiPalEntries = nxiIs640 ? 16 : 256;
      newData = new Uint8Array(nxiTotalSize);
      // Generate default RGB332 palette encoded as RGB333
      const nxiPal = nxiIs640 ? generateDefaultNext4bppPalette() : generateDefaultNextPalette();
      for (let i = 0; i < nxiPalEntries; i++) {
        const r3 = Math.round(nxiPal[i][0] * 7 / 255);
        const g3 = Math.round(nxiPal[i][1] * 7 / 255);
        const b3 = Math.round(nxiPal[i][2] * 7 / 255);
        newData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
        newData[i * 2 + 1] = b3 & 1;
      }
      // Pixel data is all zeros (palette index 0 = black)
      nxiLayer2Mode = nxiIs320 ? '320x256' : nxiIs640 ? '640x256' : '256x192';
      nxiResolvedPalette = nxiPal;
      newFormat = FORMAT.NXI;
      newFileName = 'new_screen.nxi';
      break;
    }

    case 'sl2':
    case 'sl2_320':
    case 'sl2_640': {
      // SL2: raw pixel bytes, no palette; size depends on mode
      const sl2Is320 = format === 'sl2_320';
      const sl2Is640 = format === 'sl2_640';
      const sl2DataSize = (sl2Is320 || sl2Is640) ? SL2.EXT_SIZE : SL2.RAW_SIZE;
      newData = new Uint8Array(sl2DataSize);
      // Pixel data is all zeros (color 0 = black in default palette)
      nxiLayer2Mode = sl2Is320 ? '320x256' : sl2Is640 ? '640x256' : '256x192';
      nxiResolvedPalette = sl2Is640 ? generateDefaultNext4bppPalette() : generateDefaultNextPalette();
      newFormat = FORMAT.SL2;
      newFileName = 'new_screen.sl2';
      break;
    }

    case 'lores': {
      // LoRes: 128×96 256-color, raw pixel dump (12288 bytes)
      newData = new Uint8Array(LORES.PIXEL_DATA_SIZE);
      // Pixel data is all zeros (color 0 = black in default palette)
      nxiResolvedPalette = generateDefaultNextPalette();
      newFormat = FORMAT.LORES;
      newFileName = 'new_screen.slr';
      break;
    }

    case 'lores_rad': {
      // LoRes Radastan: 128×96 16-color 4bpp, packed nibbles (6144 bytes)
      newData = new Uint8Array(LORES_RAD.PIXEL_DATA_SIZE);
      nxiResolvedPalette = generateDefaultNext4bppPalette();
      newFormat = FORMAT.LORES_RAD;
      newFileName = 'new_screen.rad';
      break;
    }

    case 'specscii':
      // SPECSCII: initialize empty grids, create minimal stream
      specsciiInitGrids(0x20, newAttr);
      newData = specsciiGridsToStream();
      if (newData.length === 0) {
        // Empty stream if all spaces — create at least 1 byte placeholder
        newData = new Uint8Array(0);
      }
      newFormat = FORMAT.SPECSCII;
      newFileName = 'new_screen.specscii';
      break;

    case 'scr':
    default:
      newData = new Uint8Array(SCREEN.TOTAL_SIZE);
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        newData[i] = newAttr;
      }
      newFormat = FORMAT.SCR;
      newFileName = 'new_screen.scr';
      break;
  }

  // Create internal picture for SCR/ULA+ formats (skip if already set, e.g. ZXP)
  if (!newInternalPicture) {
    if (newFormat === FORMAT.SCR && typeof importScr === 'function') {
      newInternalPicture = importScr(newData, newFileName);
    } else if (newFormat === FORMAT.SCR_ULAPLUS && typeof importScrUlaPlus === 'function') {
      newInternalPicture = importScrUlaPlus(newData, newFileName);
    }
  }

  // Use multi-picture system
  const result = addPicture(newFileName, newFormat, newData, newInternalPicture);
  if (result >= 0) {
    // addPicture -> switchToPicture handles all rendering and UI updates
    return;
  }

  // Max pictures reached - fall through to direct load
  screenData = newData;
  currentFormat = newFormat;
  currentFileName = newFileName;

  // Reset undo/redo stacks
  undoStack = [];
  redoStack = [];

  // Reset layer system (start fresh with no layers)
  layers = [];
  activeLayerIndex = 0;
  layersEnabled = false;

  if (typeof toggleScaControlsVisibility === 'function') {
    toggleScaControlsVisibility();
  }
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  if (typeof updateFileInfo === 'function') {
    updateFileInfo();
  }
  // Update ULA+ palette UI if in ULA+ mode
  if (isUlaPlusMode) {
    if (typeof buildUlaPlusGrid === 'function') buildUlaPlusGrid();
    if (typeof buildUlaPlusClassic === 'function') buildUlaPlusClassic();
    if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();
  }

  toggleLayerSectionVisibility();
  updateLayerPanel();
  renderScreen();
  updatePictureTabBar();

  // Enable editor for new picture
  updateEditorState();
}

// ============================================================================
// Editor UI
// ============================================================================

/**
 * Updates position info display
 * @param {number} x
 * @param {number} y
 */
function updateEditorInfo(x, y) {
  const infoEl = document.getElementById('editorPositionInfo');
  if (!infoEl) return;

  if (!screenData) {
    infoEl.textContent = 'No screen loaded';
    return;
  }

  const cellX = Math.floor(x / 8);
  const cellY = Math.floor(y / 8);

  // SPECSCII: show cell coordinates and character info
  if (currentFormat === FORMAT.SPECSCII && specsciiCharGrid && specsciiAttrGrid) {
    const g = specsciiPixelToGrid(x, y);
    const cell = specsciiGetCell(g.col, g.row);
    if (cell) {
      const hex = cell.char.toString(16).toUpperCase().padStart(2, '0');
      const charName = cell.char === 0x20 ? 'Space' :
                       cell.char <= 0x7F ? String.fromCharCode(cell.char) :
                       'Block';
      const ink = cell.attr & 0x07;
      const paper = (cell.attr >> 3) & 0x07;
      const bright = (cell.attr & 0x40) ? ' Bright' : '';
      const flash = (cell.attr & 0x80) ? ' Flash' : '';
      infoEl.innerHTML =
        `Cell: (${g.col}, ${g.row})<br>` +
        `Char: 0x${hex} (${charName})<br>` +
        `Ink: ${ink} (${COLOR_NAMES[ink]}) Paper: ${paper} (${COLOR_NAMES[paper]})${bright}${flash}`;
    }
    return;
  }

  /** @type {number} */
  let attr;
  if (currentFormat === FORMAT.ATTR_53C) {
    if (screenData.length < 768) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    const addr = cellX + cellY * 32;
    attr = screenData[addr];
  } else if (currentFormat === FORMAT.IFL) {
    if (screenData.length < IFL.TOTAL_SIZE) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    attr = screenData[getIflAttributeAddress(x, y)];
  } else if (currentFormat === FORMAT.MLT) {
    if (screenData.length < MLT.TOTAL_SIZE) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    attr = screenData[getMltAttributeAddress(x, y)];
  } else if (currentFormat === FORMAT.BMC4) {
    if (screenData.length < BMC4.TOTAL_SIZE) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    attr = screenData[getBmc4AttributeAddress(x, y)];
  } else if (currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) {
    // Monochrome: no attributes, just show pixel info
    const maxY = currentFormat === FORMAT.MONO_1_3 ? 64 : (currentFormat === FORMAT.MONO_2_3 ? 128 : 192);
    const pixelValue = y < maxY ? getPixel(screenData, x, y) : false;
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Cell: (${cellX}, ${cellY})<br>` +
      `Monochrome<br>` +
      `Pixel: ${pixelValue ? 'set' : 'clear'}`;
    return;
  } else if (currentFormat === FORMAT.RGB3) {
    // RGB3: show pixel color from R, G, B channels
    if (screenData.length < RGB3.TOTAL_SIZE) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    const bitmapAddr = getBitmapAddress(x, y);
    const bit = getBitPosition(x);
    const hasRed = (screenData[RGB3.RED_OFFSET + bitmapAddr] & (1 << bit)) !== 0;
    const hasGreen = (screenData[RGB3.GREEN_OFFSET + bitmapAddr] & (1 << bit)) !== 0;
    const hasBlue = (screenData[RGB3.BLUE_OFFSET + bitmapAddr] & (1 << bit)) !== 0;
    // ZX color index: bit0=Blue, bit1=Red, bit2=Green
    const colorIndex = (hasBlue ? 1 : 0) | (hasRed ? 2 : 0) | (hasGreen ? 4 : 0);
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Cell: (${cellX}, ${cellY})<br>` +
      `RGB3 Tricolor<br>` +
      `Pixel: ${COLOR_NAMES[colorIndex]}`;
    return;
  } else if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && currentPicture) {
    attr = screenData[getAttributeAddress(x, y)];
  } else {
    if (screenData.length < SCREEN.TOTAL_SIZE) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    attr = screenData[getAttributeAddress(x, y)];
  }

  const parsed = parseAttribute(attr);

  if (currentFormat === FORMAT.ATTR_53C) {
    // No bitmap data for .53c — skip pixel value
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Cell: (${cellX}, ${cellY})<br>` +
      `Cell: ${COLOR_NAMES[parsed.ink]}/${COLOR_NAMES[parsed.paper]}` +
      `${parsed.bright ? ' BRIGHT' : ''}`;
  } else if (currentFormat === FORMAT.IFL) {
    // IFL: 8×2 blocks
    const attrRow = Math.floor(y / 2);
    const pixelValue = getPixel(screenData, x, y);
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Block: (${cellX}, ${attrRow})<br>` +
      `8\u00d72: ${COLOR_NAMES[parsed.ink]}/${COLOR_NAMES[parsed.paper]}` +
      `${parsed.bright ? ' BRIGHT' : ''}<br>` +
      `Pixel: ${pixelValue ? 'ink' : 'paper'}`;
  } else if (currentFormat === FORMAT.MLT) {
    // MLT: 8×1 blocks (one per pixel line)
    const pixelValue = getPixel(screenData, x, y);
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Block: (${cellX}, ${y})<br>` +
      `8\u00d71: ${COLOR_NAMES[parsed.ink]}/${COLOR_NAMES[parsed.paper]}` +
      `${parsed.bright ? ' BRIGHT' : ''}<br>` +
      `Pixel: ${pixelValue ? 'ink' : 'paper'}`;
  } else if (currentFormat === FORMAT.BMC4) {
    // BMC4: 8×4 blocks
    const blockY = Math.floor(y / 4);
    const pixelValue = getPixel(screenData, x, y);
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Block: (${cellX}, ${blockY})<br>` +
      `8\u00d74: ${COLOR_NAMES[parsed.ink]}/${COLOR_NAMES[parsed.paper]}` +
      `${parsed.bright ? ' BRIGHT' : ''}<br>` +
      `Pixel: ${pixelValue ? 'ink' : 'paper'}`;
  } else {
    const pixelValue = getPixel(screenData, x, y);
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Cell: (${cellX}, ${cellY})<br>` +
      `Cell: ${COLOR_NAMES[parsed.ink]}/${COLOR_NAMES[parsed.paper]}` +
      `${parsed.bright ? ' BRIGHT' : ''}<br>` +
      `Pixel: ${pixelValue ? 'ink' : 'paper'}`;
  }
}

// ============================================================================
// Brush Preview Cursor
// ============================================================================

/**
 * Toggles brush preview cursor mode
 */
function toggleBrushPreview() {
  brushPreviewMode = !brushPreviewMode;

  if (screenCanvas) {
    screenCanvas.style.cursor = brushPreviewMode ? 'none' : 'crosshair';
  }

  editorRender();
}

/**
 * Draws the brush preview overlay at the current cursor position
 */
function drawBrushPreview() {
  // Use brushPreviewPos, fall back to pasteCursorPos if not set yet
  const pos = brushPreviewPos || pasteCursorPos;
  if (!brushPreviewMode || !pos || !screenCanvas) return;

  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const opacity = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BRUSH_PREVIEW_OPACITY) || 0.5;
  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  // Apply snap mode to preview position
  const snapped = snapDrawCoords(pos.x, pos.y);
  const x = snapped.x;
  const y = snapped.y;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Determine brush color (use ink color, or red tint for transparent/eraser)
  const isTransparent = isInkTransparent();
  let color;
  if (isTransparent) {
    color = '#ff4444';
  } else if (isUlaPlusMode) {
    const rgb = getUlaPlusColor(ulaPlusInkIndex);
    color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  } else {
    color = editorBright ? ZX_PALETTE.BRIGHT[editorInkColor] : ZX_PALETTE.REGULAR[editorInkColor];
  }

  // Check for custom brush
  const brush = getActiveBrush();
  if (brushShape === 'custom' && brush) {
    const hw = Math.floor(brush.width / 2);
    const hh = Math.floor(brush.height / 2);
    const hasMask = brush.mask && brush.mask.length > 0;

    for (let by = 0; by < brush.height; by++) {
      for (let bx = 0; bx < brush.width; bx++) {
        const byteIdx = by * Math.ceil(brush.width / 8) + Math.floor(bx / 8);
        const bitIdx = 7 - (bx % 8);
        const isSet = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
        const isVisible = hasMask ? (brush.mask[byteIdx] & (1 << bitIdx)) !== 0 : true;

        // Only show visible ink pixels in cursor preview
        if (isVisible && isSet) {
          const px = x - hw + bx;
          const py = y - hh + by;
          ctx.fillStyle = color;
          ctx.fillRect(borderPixels + px * zoom, borderPixels + py * zoomY, zoom, zoomY);
        }
      }
    }
  } else if (brushSize <= 1) {
    // Single pixel brush
    ctx.fillStyle = color;
    ctx.fillRect(borderPixels + x * zoom, borderPixels + y * zoomY, zoom, zoomY);
  } else {
    // Built-in brush shapes
    const n = brushSize;
    // Center brush on cursor (for odd sizes: exact center; for even: cursor at center-bottom-right)
    const half = Math.floor(n / 2);

    if (brushShape === 'stroke') {
      // Diagonal line from top-right to bottom-left (like /)
      for (let i = 0; i < n; i++) {
        const px = x + (n - 1 - i) - half;
        const py = y + i - half;
        ctx.fillStyle = color;
        ctx.fillRect(borderPixels + px * zoom, borderPixels + py * zoomY, zoom, zoomY);
      }
    } else if (brushShape === 'bstroke') {
      // Diagonal line from top-left to bottom-right (like \)
      for (let i = 0; i < n; i++) {
        const px = x + i - half;
        const py = y + i - half;
        ctx.fillStyle = color;
        ctx.fillRect(borderPixels + px * zoom, borderPixels + py * zoomY, zoom, zoomY);
      }
    } else if (brushShape === 'hline') {
      // Horizontal line
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = color;
        ctx.fillRect(borderPixels + (x - half + i) * zoom, borderPixels + y * zoomY, zoom, zoomY);
      }
    } else if (brushShape === 'vline') {
      // Vertical line
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = color;
        ctx.fillRect(borderPixels + x * zoom, borderPixels + (y - half + i) * zoomY, zoom, zoomY);
      }
    } else if (brushShape === 'round') {
      // Circle brush
      const r = half;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r) {
            ctx.fillStyle = color;
            ctx.fillRect(borderPixels + (x + dx) * zoom, borderPixels + (y + dy) * zoomY, zoom, zoomY);
          }
        }
      }
    } else {
      // Square brush (default)
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) {
          ctx.fillStyle = color;
          ctx.fillRect(borderPixels + (x - half + dx) * zoom, borderPixels + (y - half + dy) * zoomY, zoom, zoomY);
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Draws border brush preview overlay for BSC/BMC4 formats
 */
function drawBorderBrushPreview() {
  if (!borderPreviewPos || !screenCanvas) return;
  if (!isBorderFormatEditor()) return;

  // In barcode capture mode, show crosshair only (no preview)
  if (barcodeCaptureSlot >= 0) {
    screenCanvas.style.cursor = 'crosshair';
    return;
  }

  // In barcode stamp mode, draw barcode preview instead of brush
  if (barcodeMode && activeBarcode >= 0 && barcodes[activeBarcode]) {
    drawBarcodeStampPreview();
    return;
  }

  // Normal brush preview
  if (!brushPreviewMode) return;

  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const frameX = borderPreviewPos.frameX;
  const frameY = borderPreviewPos.frameY;

  // Calculate which cells would be painted (same logic as paintBscBorderCell)
  const snappedX = Math.floor(frameX / 8) * 8;
  const bounds = getBorderRegionBounds(frameY, frameX);

  const leftCell = bounds.left / 8;
  const rightCell = bounds.right / 8;
  const cellCount = rightCell - leftCell;
  const clickedCell = Math.floor(snappedX / 8) - leftCell;
  const pixelInCell = frameX % 8;

  // Use sub-cell position at edges to allow 8/16/24px options
  let paintStartCell, paintEndCell;
  if (clickedCell === 0 && pixelInCell < 6) {
    // Left edge, most of cell 0 → 8px
    paintStartCell = 0;
    paintEndCell = 0;
  } else if (clickedCell === 1 && pixelInCell < 6) {
    // Left edge, most of cell 1 → 16px
    paintStartCell = 0;
    paintEndCell = 1;
  } else {
    // Normal 24px brush, clamped to bounds
    paintStartCell = clickedCell;
    paintEndCell = Math.min(clickedCell + 2, cellCount - 1);
  }

  const opacity = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BRUSH_PREVIEW_OPACITY) || 0.5;
  const isTransparent = isInkTransparent();
  let color;
  if (isTransparent) {
    color = '#ff4444';
  } else if (isUlaPlusMode) {
    const rgb = getUlaPlusColor(ulaPlusInkIndex);
    color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  } else {
    color = editorBright ? ZX_PALETTE.BRIGHT[editorInkColor] : ZX_PALETTE.REGULAR[editorInkColor];
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;

  // Draw preview for each cell that would be painted
  for (let i = paintStartCell; i <= paintEndCell; i++) {
    const cellX = bounds.left + i * 8;
    // Draw 8px wide rectangle at frame position
    ctx.fillRect(cellX * zoom, frameY * zoom, 8 * zoom, zoom);
  }

  ctx.restore();
}

/**
 * Draws a preview of the barcode that will be stamped at the current position.
 */
function drawBarcodeStampPreview() {
  if (!borderPreviewPos || !screenCanvas) return;
  if (!barcodes[activeBarcode]) return;

  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const barcode = barcodes[activeBarcode];
  const widthCells = barcode.width / 8;

  // Snap to 8px grid
  const snappedX = Math.floor(borderPreviewPos.frameX / 8) * 8;
  const frameY = borderPreviewPos.frameY;

  const opacity = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BRUSH_PREVIEW_OPACITY) || 0.5;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Draw each row of the barcode
  for (let y = 0; y < barcode.height; y++) {
    const stampY = frameY + y;
    if (stampY >= BSC.FRAME_HEIGHT) break;

    for (let c = 0; c < widthCells; c++) {
      const color = barcode.colors[y * widthCells + c];

      // Skip transparent pixels
      if (color === BARCODE_TRANSPARENT) continue;

      const rgb = ZX_PALETTE_RGB.REGULAR[color] || [0, 0, 0];
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect((snappedX + c * 8) * zoom, stampY * zoom, 8 * zoom, zoom);
    }
  }

  ctx.restore();
}

/**
 * @param {string} tool
 */
function setEditorTool(tool) {
  // Cancel selection/paste when switching away from Select
  if (currentTool === EDITOR.TOOL_SELECT && tool !== EDITOR.TOOL_SELECT) {
    selectionStartPoint = null;
    selectionEndPoint = null;
    isSelecting = false;
    isPasting = false;
  }
  // Hide text tool section when switching away
  if (currentTool === EDITOR.TOOL_TEXT && tool !== EDITOR.TOOL_TEXT) {
    showTextToolSection(false);
  }
  // Hide airbrush section when switching away
  if (currentTool === EDITOR.TOOL_AIRBRUSH && tool !== EDITOR.TOOL_AIRBRUSH) {
    showAirbrushSection(false);
  }
  // Hide gradient section when switching away
  if (currentTool === EDITOR.TOOL_GRADIENT && tool !== EDITOR.TOOL_GRADIENT) {
    showGradientSection(false);
  }
  currentTool = tool;
  (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
    btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.tool === tool);
  });
  // Show text tool section when switching to text
  if (tool === EDITOR.TOOL_TEXT) {
    showTextToolSection(true);
  }
  // Show airbrush section when switching to airbrush
  if (tool === EDITOR.TOOL_AIRBRUSH) {
    showAirbrushSection(true);
  }
  // Show gradient section when switching to gradient
  if (tool === EDITOR.TOOL_GRADIENT) {
    showGradientSection(true);
  }
  editorRender();

  // Update floating palette if in fullscreen mode
  if (fullscreenMode) {
    updateFloatingPalette();
  }
}

/**
 * Sets brush size (1-16) and updates the UI dropdown
 * @param {number} size
 */
function setBrushSize(size) {
  brushSize = Math.max(1, Math.min(16, size));
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorBrushSize'));
  if (sel) sel.value = String(brushSize);

  // Update brush preview if active
  if (brushPreviewMode && brushPreviewPos) {
    editorRender();
    drawBrushPreview();
  }

  // Update floating palette if in fullscreen mode
  if (fullscreenMode) {
    updateFloatingPalette();
  }
}

/**
 * Sets brush shape and updates shape button selection
 * @param {string} shape - 'square', 'round', 'hline', 'vline', 'stroke', or 'bstroke'
 */
function setBrushShape(shape) {
  brushShape = shape;
  // In masked mode, preserve activeCustomBrush as the mask pattern source
  if (brushPaintMode !== 'masked' && brushPaintMode !== 'masked+') {
    activeCustomBrush = -1;
    // Clear tile brush selection
    clearTileBrushSelection();
    // Deselect custom brush slots only when not in masked mode
    (customBrushSlots || document.querySelectorAll('.custom-brush-slot')).forEach(el => {
      el.classList.remove('selected');
    });
  }
  (editorShapeButtons || document.querySelectorAll('.editor-shape-btn')).forEach(btn => {
    btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.shape === shape);
  });
}

/**
 * Sets airbrush spray radius (4-32)
 * @param {number} r
 */
function setAirbrushRadius(r) {
  airbrushRadius = Math.max(4, Math.min(32, r));
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('airbrushRadiusSelect'));
  if (sel) sel.value = String(airbrushRadius);
}

/**
 * Sets airbrush density (0.03-1.0)
 * @param {number} d
 */
function setAirbrushDensity(d) {
  airbrushDensity = Math.max(0.03, Math.min(1.0, d));
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('airbrushDensitySelect'));
  if (sel) sel.value = String(airbrushDensity);
}

/**
 * Sets airbrush falloff (1 = uniform, higher = more center-concentrated)
 * @param {number} f
 */
function setAirbrushFalloff(f) {
  airbrushFalloff = Math.max(1, Math.min(5, f));
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('airbrushFalloffSelect'));
  if (sel) sel.value = String(airbrushFalloff);
}

/**
 * Sets gradient type
 * @param {string} type
 */
function setGradientType(type) {
  gradientType = type;
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('gradientTypeSelect'));
  if (sel) sel.value = type;
}

/**
 * Sets dithering method
 * @param {string} method
 */
function setDitherMethod(method) {
  ditherMethod = method;
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('ditherMethodSelect'));
  if (sel) sel.value = method;
}

/**
 * Sets gradient reverse option
 * @param {boolean} reverse
 */
function setGradientReverse(reverse) {
  gradientReverse = reverse;
  const cb = /** @type {HTMLInputElement|null} */ (document.getElementById('gradientReverseCheckbox'));
  if (cb) cb.checked = reverse;
}

function updateColorPreview() {
  // NXI/SL2: update dedicated palette highlight instead of standard palette
  if ((currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD) && nxiResolvedPalette) {
    updateNxiPaletteHighlight();
    updateAttrPreview();
    return;
  }

  // Update palette cell backgrounds and selection markers
  const container = document.getElementById('editorPalette');
  if (container) {
    const cells = container.querySelectorAll('.editor-palette-cell');
    cells.forEach((cell) => {
      const colorIdx = parseInt(/** @type {HTMLElement} */ (cell).dataset.color || '0', 10);
      const isTransparent = colorIdx === COLOR_TRANSPARENT;

      // Set background color (skip for transparent cell - it has CSS background)
      // Show bright color on top half, normal color on bottom half
      if (!isTransparent) {
        const normalRgb = ZX_PALETTE_RGB.REGULAR[colorIdx];
        const brightRgb = ZX_PALETTE_RGB.BRIGHT[colorIdx];
        if (normalRgb && brightRgb) {
          const normalColor = `rgb(${normalRgb[0]},${normalRgb[1]},${normalRgb[2]})`;
          const brightColor = `rgb(${brightRgb[0]},${brightRgb[1]},${brightRgb[2]})`;
          /** @type {HTMLElement} */ (cell).style.background =
            `linear-gradient(to bottom, ${brightColor} 0%, ${brightColor} 50%, ${normalColor} 50%, ${normalColor} 100%)`;
        }
      }

      cell.classList.toggle('ink-selected', colorIdx === editorInkColor);
      cell.classList.toggle('paper-selected', colorIdx === editorPaperColor);

      // Update markers
      const existing = cell.querySelectorAll('.editor-palette-marker');
      existing.forEach(m => m.remove());

      if (colorIdx === editorInkColor) {
        const m = document.createElement('span');
        m.className = 'editor-palette-marker ink-marker';
        m.textContent = 'I';
        cell.appendChild(m);
      }
      if (colorIdx === editorPaperColor) {
        const m = document.createElement('span');
        m.className = 'editor-palette-marker paper-marker';
        m.textContent = 'P';
        cell.appendChild(m);
      }
    });
  }

  updateAttrPreview();
}

// Toggle variable for attr preview flash — flipped by the rAF loop every 320ms.
// Controls CSS transform to slide the double-width canvas between normal/swapped halves.
var attrPreviewFlashSwap = false;

/**
 * Updates visibility of the attr preview row and renders.
 */
function updateAttrPreview() {
  var row = document.getElementById('attrPreviewRow');
  if (!row) return;

  var isAttr = (currentFormat === FORMAT.ATTR_53C);
  row.style.display = isAttr ? '' : 'none';
  if (!isAttr) return;

  renderAttrPreview();
}

/**
 * Draws the attr preview canvas with current settings.
 * Flash phase uses attrPreviewFlashSwap toggle (flipped by permanent setInterval).
 */
function renderAttrPreview() {
  var canvas = document.getElementById('attrPreviewCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var select = document.getElementById('pattern53cSelect');
  var patternName = (select && select.value) || 'checker';
  var patternArray;
  if (patternName === 'stripes') {
    patternArray = APP_CONFIG.PATTERN_53C_STRIPES;
  } else if (patternName === 'dd77') {
    patternArray = APP_CONFIG.PATTERN_53C_DD77;
  } else {
    patternArray = APP_CONFIG.PATTERN_53C_CHECKER;
  }

  var attr = getCurrentDrawingAttribute();
  var colors = getColorsRgb(attr);
  var inkRgb = colors.inkRgb;
  var paperRgb = colors.paperRgb;

  // Canvas is 128x8: left half = normal, right half = ink/paper swapped.
  // Flash animation uses CSS transform to slide between halves (compositor-level,
  // immune to main-thread rendering blocking canvas repaints).
  var halfW = 64;
  var h = canvas.height;
  var imageData = ctx.createImageData(canvas.width, h);
  var data = imageData.data;
  for (var y = 0; y < h; y++) {
    var patternByte = patternArray[y % 8];
    for (var x = 0; x < halfW; x++) {
      var isInk = (patternByte & (1 << (7 - (x % 8)))) !== 0;
      // Left half: normal
      var rgb = isInk ? inkRgb : paperRgb;
      var idx = (y * canvas.width + x) * 4;
      data[idx] = rgb[0]; data[idx + 1] = rgb[1]; data[idx + 2] = rgb[2]; data[idx + 3] = 255;
      // Right half: swapped
      var rgbS = isInk ? paperRgb : inkRgb;
      var idxS = (y * canvas.width + halfW + x) * 4;
      data[idxS] = rgbS[0]; data[idxS + 1] = rgbS[1]; data[idxS + 2] = rgbS[2]; data[idxS + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function updateColorSelectors() {
  const brightCb = /** @type {HTMLInputElement} */ (document.getElementById('editorBrightCheckbox'));
  const flashCb = /** @type {HTMLInputElement} */ (document.getElementById('editorFlashCheckbox'));
  if (brightCb) brightCb.checked = editorBright;
  if (flashCb) flashCb.checked = editorFlash;

  updateColorPreview();

  // Update floating palette if in fullscreen mode
  if (fullscreenMode) {
    updateFloatingPalette();
  }
}

// ============================================================================
// Gigascreen Virtual Color Picker
// ============================================================================

/**
 * Shows or hides the Gigascreen virtual color picker
 * @param {boolean} show - Whether to show the picker
 */
function toggleGigascreenColorPicker(show) {
  const section = document.getElementById('gigascreenColorSection');
  if (section) section.style.display = show ? '' : 'none';
  if (show) {
    const s = document.getElementById('editorColorSection');
    const a = document.getElementById('attr53cColorSection');
    const r = document.getElementById('rgb3ColorSection');
    if (s) s.style.display = 'none';
    if (a) a.style.display = 'none';
    if (r) r.style.display = 'none';
  }
  // The "Edit HLR fill pattern..." button only applies to HLR pictures.
  const hlrBtnRow = document.getElementById('hlrPatternButtonRow');
  if (hlrBtnRow) {
    hlrBtnRow.style.display = (show && currentFormat === FORMAT.HLR) ? '' : 'none';
  }
}

/**
 * Shows or hides the RGB3 color picker
 * @param {boolean} show - Whether to show the picker
 */
function toggleRgb3ColorPicker(show) {
  const section = document.getElementById('rgb3ColorSection');
  if (section) section.style.display = show ? '' : 'none';
  if (show) {
    const s = document.getElementById('editorColorSection');
    const a = document.getElementById('attr53cColorSection');
    const g = document.getElementById('gigascreenColorSection');
    if (s) s.style.display = 'none';
    if (a) a.style.display = 'none';
    if (g) g.style.display = 'none';
  }
}

/**
 * Computes the 8 perceived RGB3 colors from the current palette.
 * Each bitplane is displayed as a separate frame (R/G/B channel against black),
 * so the perceived color is the average of 3 frames using palette colors.
 * Frame 1: Red bitplane → palette color 2 (Red) or 0 (Black)
 * Frame 2: Green bitplane → palette color 4 (Green) or 0 (Black)
 * Frame 3: Blue bitplane → palette color 1 (Blue) or 0 (Black)
 * @returns {Array<[number, number, number]>}
 */
function computeRgb3Colors() {
  const black = ZX_PALETTE_RGB.BRIGHT[0];
  const blue = ZX_PALETTE_RGB.BRIGHT[1];
  const red = ZX_PALETTE_RGB.BRIGHT[2];
  const green = ZX_PALETTE_RGB.BRIGHT[4];
  const colors = /** @type {Array<[number, number, number]>} */ ([]);

  for (let i = 0; i < 8; i++) {
    const hasR = (i & 2) !== 0;
    const hasG = (i & 4) !== 0;
    const hasB = (i & 1) !== 0;
    const frameR = hasR ? red : black;
    const frameG = hasG ? green : black;
    const frameB = hasB ? blue : black;
    colors.push([
      Math.round((frameR[0] + frameG[0] + frameB[0]) / 3),
      Math.round((frameR[1] + frameG[1] + frameB[1]) / 3),
      Math.round((frameR[2] + frameG[2] + frameB[2]) / 3)
    ]);
  }
  return colors;
}

/**
 * Builds the RGB3 color palette grid (8 pure colors, L/R selection)
 */
function buildRgb3Palette() {
  const container = document.getElementById('rgb3PaletteGrid');
  if (!container) return;

  container.innerHTML = '';
  const rgb3Colors = computeRgb3Colors();

  for (let i = 0; i < 8; i++) {
    const rgb = rgb3Colors[i];
    const cell = document.createElement('div');
    cell.className = 'editor-palette-cell';
    cell.dataset.color = String(i);
    const r = (i & 2) ? 1 : 0;
    const g = (i & 4) ? 1 : 0;
    const b = (i & 1) ? 1 : 0;
    cell.title = `${COLOR_NAMES[i]} (R=${r} G=${g} B=${b})`;
    cell.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    cell.style.position = 'relative';

    // Left click = set primary (L) drawing color
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      editorInkColor = i;
      localStorage.setItem('spectraLabInkColor', String(i));
      updateRgb3PaletteSelection();
    });

    // Right click = set secondary (R) drawing color
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      editorPaperColor = i;
      localStorage.setItem('spectraLabPaperColor', String(i));
      updateRgb3PaletteSelection();
    });

    container.appendChild(cell);
  }

  updateRgb3PaletteSelection();
}

/**
 * Updates L/R selection markers on the RGB3 palette grid
 */
function updateRgb3PaletteSelection() {
  const container = document.getElementById('rgb3PaletteGrid');
  if (!container) return;

  const cells = container.querySelectorAll('.editor-palette-cell');
  cells.forEach((cell) => {
    const colorIdx = parseInt(/** @type {HTMLElement} */ (cell).dataset.color || '0', 10);

    // Remove existing markers
    cell.querySelectorAll('.editor-palette-marker').forEach(m => m.remove());

    if (colorIdx === editorInkColor) {
      const m = document.createElement('span');
      m.className = 'editor-palette-marker ink-marker';
      m.textContent = 'L';
      cell.appendChild(m);
    }
    if (colorIdx === editorPaperColor) {
      const m = document.createElement('span');
      m.className = 'editor-palette-marker paper-marker';
      m.textContent = 'R';
      cell.appendChild(m);
    }

    cell.classList.toggle('ink-selected', colorIdx === editorInkColor);
    cell.classList.toggle('paper-selected', colorIdx === editorPaperColor);
  });
}

/**
 * Updates the Gigascreen virtual color picker UI with current selections
 */
function updateGigascreenColorPickerUI() {
  const inkPreview = document.getElementById('gigascreenInkPreview');
  const paperPreview = document.getElementById('gigascreenPaperPreview');

  if (gigascreenVirtualPalette.length === 0) return;

  const inkColor = gigascreenVirtualPalette[gigascreenVirtualInk];
  const paperColor = gigascreenVirtualPalette[gigascreenVirtualPaper];

  if (inkPreview && inkColor) {
    inkPreview.style.background = `rgb(${inkColor.rgb[0]},${inkColor.rgb[1]},${inkColor.rgb[2]})`;
    inkPreview.title = inkColor.name;
  }
  if (paperPreview && paperColor) {
    paperPreview.style.background = `rgb(${paperColor.rgb[0]},${paperColor.rgb[1]},${paperColor.rgb[2]})`;
    paperPreview.title = paperColor.name;
  }

  // Update palette grid selection markers
  updateGigascreenPaletteSelection();

  // Update the 4-color picker
  update4ColorPicker();
}

/**
 * Updates the 4-color picker UI to show the 4 available colors for current ink/paper selection
 */
function update4ColorPicker() {
  const container = document.getElementById('gigascreen4ColorPicker');
  if (!container) return;

  const colors = getGigascreen4Colors();

  container.innerHTML = '';

  // For HLR (Gigascreen Lowres) the bitmap is fixed, so only colors 0
  // (Ink+Ink, top half) and 3 (Paper+Paper, bottom half) are physically
  // displayable. Filter the picker to those two cells and clamp the active
  // primary/secondary selection to a valid index.
  const isHlr = (typeof FORMAT !== 'undefined' && (currentFormat === FORMAT.HLR || currentFormat === FORMAT.STL));
  if (isHlr) {
    if (gigascreenPrimaryColor !== 0 && gigascreenPrimaryColor !== 3) {
      gigascreenPrimaryColor = 0;
    }
    if (gigascreenSecondaryColor !== 0 && gigascreenSecondaryColor !== 3) {
      gigascreenSecondaryColor = 3;
    }
  }
  const visibleIndices = isHlr ? [0, 3] : [0, 1, 2, 3];

  visibleIndices.forEach((index) => {
    const color = colors[index];
    const isPrimary = index === gigascreenPrimaryColor;
    const isSecondary = index === gigascreenSecondaryColor;
    const textColor = (color.rgb[0] + color.rgb[1] + color.rgb[2]) > 384 ? '#000' : '#fff';

    // Determine border style based on selection
    let borderStyle = '2px solid var(--border-color)';
    if (isPrimary && isSecondary) {
      borderStyle = '2px solid var(--accent-color)';
    } else if (isPrimary) {
      borderStyle = '2px solid ' + getCSSVar('--accent-color', '#4a9eff'); // Blue for left/primary
    } else if (isSecondary) {
      borderStyle = '2px solid ' + getCSSVar('--danger-hover', '#ff6b6b'); // Red for right/secondary
    }

    // Build label showing L/R assignment
    let label = '';
    if (isPrimary) label += 'L';
    if (isSecondary) label += (label ? '+R' : 'R');

    const cell = document.createElement('div');
    cell.style.cssText = `
      width: 36px;
      height: 28px;
      border: ${borderStyle};
      border-radius: 3px;
      cursor: pointer;
      background: rgb(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]});
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: ${textColor};
      font-weight: ${(isPrimary || isSecondary) ? 'bold' : 'normal'};
      position: relative;
    `;
    cell.title = `${color.name}\nLeft click = set as Left button\nRight click = set as Right button`;
    cell.textContent = label || (index + 1).toString();

    // Left click = set primary color
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      gigascreenPrimaryColor = index;
      update4ColorPicker();
    });

    // Right click = set secondary color
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      gigascreenSecondaryColor = index;
      update4ColorPicker();
    });

    container.appendChild(cell);
  });
}

/**
 * Updates selection markers in the Gigascreen palette grid
 */
function updateGigascreenPaletteSelection() {
  const container = document.getElementById('gigascreenPaletteGrid');
  if (!container) return;

  const cells = container.querySelectorAll('.gigascreen-palette-cell');
  cells.forEach((cell, index) => {
    cell.classList.toggle('ink-selected', index === gigascreenVirtualInk);
    cell.classList.toggle('paper-selected', index === gigascreenVirtualPaper);
  });
}

/**
 * Builds the Gigascreen virtual palette grid
 */
function buildGigascreenPalette() {
  const container = document.getElementById('gigascreenPaletteGrid');
  if (!container) return;

  if (gigascreenVirtualPalette.length === 0) {
    generateGigascreenVirtualPalette();
  }

  container.innerHTML = '';

  gigascreenVirtualPalette.forEach((vc, index) => {
    const cell = document.createElement('div');
    cell.className = 'gigascreen-palette-cell';
    cell.style.background = `rgb(${vc.rgb[0]},${vc.rgb[1]},${vc.rgb[2]})`;
    cell.title = vc.name;
    cell.dataset.index = String(index);

    // Left click = set ink
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      gigascreenVirtualInk = index;
      updateGigascreenColorPickerUI();
    });

    // Right click = set paper
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      gigascreenVirtualPaper = index;
      updateGigascreenColorPickerUI();
    });

    container.appendChild(cell);
  });

  updateGigascreenPaletteSelection();
}

/**
 * Builds the visual color palette
 */
function buildPalette() {
  const container = document.getElementById('editorPalette');
  if (!container) return;

  container.innerHTML = '';

  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('div');
    cell.className = 'editor-palette-cell';
    cell.dataset.color = String(i);
    cell.title = COLOR_NAMES[i];

    // Left click = set ink
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      editorInkColor = i;
      localStorage.setItem('spectraLabInkColor', String(i));
      updateColorPreview();
    });

    // Right click = set paper
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      editorPaperColor = i;
      localStorage.setItem('spectraLabPaperColor', String(i));
      updateColorPreview();
    });

    container.appendChild(cell);
  }

  // Add transparent color cell
  const transCell = document.createElement('div');
  transCell.className = 'editor-palette-cell transparent-cell';
  transCell.dataset.color = String(COLOR_TRANSPARENT);
  transCell.title = 'Transparent (erases on non-background layers)';
  transCell.innerHTML = '<span style="font-size:9px;color:#888;">T</span>';

  transCell.addEventListener('click', (e) => {
    e.preventDefault();
    editorInkColor = COLOR_TRANSPARENT;
    updateColorPreview();
  });

  transCell.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    editorPaperColor = COLOR_TRANSPARENT;
    updateColorPreview();
  });

  container.appendChild(transCell);

  updateColorPreview();
}

// ============================================================================
// ULA+ Palette UI
// ============================================================================

/** @type {number} - Currently selected CLUT for classic mode (0-3) */
let ulaPlusSelectedClut = 0;

/** @type {boolean} - ULA+ palette view mode: true = grid, false = classic */
let ulaPlusGridView = true;

/** @type {number} - Selected ULA+ ink color index (0-63, or -1 for transparent) */
let ulaPlusInkIndex = 0;

/** @type {number} - Selected ULA+ paper color index (0-63, or -1 for transparent) */
let ulaPlusPaperIndex = 15; // Default to paper 7 (white) in CLUT 0

/** @type {number} - Transparent color for ULA+ mode */
const ULAPLUS_TRANSPARENT = -1;

/** @type {number} - ULA+ palette copy/swap source index (-1 = none) */
let ulaPlusCopySource = -1;

/**
 * Clears the ULA+ palette copy source selection
 */
function ulaPlusClearCopySource() {
  ulaPlusCopySource = -1;
  document.querySelectorAll('.ulaplus-grid-cell.copy-source, .ulaplus-classic-cell.copy-source')
    .forEach((el) => el.classList.remove('copy-source'));
  const status = document.getElementById('ulaPlusCopyStatus');
  if (status) status.textContent = '';
}

/**
 * Copies ULA+ palette color from source to destination
 * @param {number} srcIdx - Source palette index (0-63)
 * @param {number} dstIdx - Destination palette index (0-63)
 */
function ulaPlusCopyColor(srcIdx, dstIdx) {
  if (!ulaPlusPalette || !screenData) return;
  saveUndoState();
  ulaPlusPalette[dstIdx] = ulaPlusPalette[srcIdx];
  if (screenData.length >= ULAPLUS.TOTAL_SIZE) {
    screenData[ULAPLUS.PALETTE_OFFSET + dstIdx] = ulaPlusPalette[dstIdx];
  }
  ulaPlusClearCopySource();
  buildUlaPlusGrid();
  buildUlaPlusClassic();
  updateUlaPlusPalette();
  editorRender();
  if (typeof renderPreview === 'function') renderPreview();
}

/**
 * Swaps two ULA+ palette colors
 * @param {number} idx1 - First palette index (0-63)
 * @param {number} idx2 - Second palette index (0-63)
 */
function ulaPlusSwapColors(idx1, idx2) {
  if (!ulaPlusPalette || !screenData) return;
  saveUndoState();
  const tmp = ulaPlusPalette[idx1];
  ulaPlusPalette[idx1] = ulaPlusPalette[idx2];
  ulaPlusPalette[idx2] = tmp;
  if (screenData.length >= ULAPLUS.TOTAL_SIZE) {
    screenData[ULAPLUS.PALETTE_OFFSET + idx1] = ulaPlusPalette[idx1];
    screenData[ULAPLUS.PALETTE_OFFSET + idx2] = ulaPlusPalette[idx2];
  }
  ulaPlusClearCopySource();
  buildUlaPlusGrid();
  buildUlaPlusClassic();
  updateUlaPlusPalette();
  editorRender();
  if (typeof renderPreview === 'function') renderPreview();
}

/**
 * Handles Shift+click on a ULA+ palette cell for copy/swap workflow
 * @param {number} idx - Palette index clicked (0-63)
 * @param {boolean} isSwap - True for swap (Shift+click on target), false for copy (plain click)
 * @returns {boolean} True if the event was handled (caller should return early)
 */
function ulaPlusHandleCopySwapClick(idx, isSwap) {
  if (ulaPlusCopySource < 0) {
    // No source selected yet — set source
    ulaPlusCopySource = idx;
    // Highlight the source cell
    document.querySelectorAll('.ulaplus-grid-cell, .ulaplus-classic-cell').forEach((el) => {
      if (parseInt(/** @type {HTMLElement} */ (el).dataset.index || '-1', 10) === idx) {
        el.classList.add('copy-source');
      }
    });
    const status = document.getElementById('ulaPlusCopyStatus');
    if (status) status.textContent = `Source: #${idx} — click to copy, Shift+click to swap, Esc to cancel`;
    return true;
  }
  // Source already selected
  if (idx === ulaPlusCopySource) {
    // Same cell — cancel
    ulaPlusClearCopySource();
    return true;
  }
  if (isSwap) {
    ulaPlusSwapColors(ulaPlusCopySource, idx);
  } else {
    ulaPlusCopyColor(ulaPlusCopySource, idx);
  }
  return true;
}

/**
 * Resets ULA+ ink/paper selection to CLUT 0 defaults
 * Called on image load or new picture creation
 */
function resetUlaPlusColors() {
  ulaPlusInkIndex = 0;       // INK 0 (black) in CLUT 0
  ulaPlusPaperIndex = 15;    // PAPER 7 (white) in CLUT 0
  ulaPlusSelectedClut = 0;

  // Update CLUT button selection
  const buttons = document.querySelectorAll('.ulaplus-clut-btn');
  buttons.forEach((btn) => {
    const btnClut = parseInt(/** @type {HTMLElement} */ (btn).dataset.clut || '0', 10);
    btn.classList.toggle('selected', btnClut === 0);
  });

  // Rebuild palettes with new selection
  if (typeof buildUlaPlusGrid === 'function') buildUlaPlusGrid();
  if (typeof buildUlaPlusClassic === 'function') buildUlaPlusClassic();
  if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();
}

/**
 * Picks ink and paper colors from ULA+ canvas at given coordinates
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} - true if colors were picked successfully
 */
function pickUlaPlusColorFromCanvas(x, y) {
  if (!screenData || currentFormat !== FORMAT.SCR_ULAPLUS) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  // Get attribute for this cell
  const attrAddr = getAttributeAddress(x, y);
  const attr = screenData[attrAddr];

  // Decode ULA+ attribute:
  // bits 0-2: ink color (0-7)
  // bits 3-5: paper color (0-7)
  // bits 6-7: CLUT (0-3)
  const inkColor = attr & 0x07;
  const paperColor = (attr >> 3) & 0x07;
  const clut = (attr >> 6) & 0x03;

  // Calculate palette indices
  // Ink colors are at positions 0-7 in each CLUT
  // Paper colors are at positions 8-15 in each CLUT
  ulaPlusInkIndex = clut * 16 + inkColor;
  ulaPlusPaperIndex = clut * 16 + 8 + paperColor;

  // Switch to the correct CLUT in classic view
  ulaPlusSelectedClut = clut;

  // Update CLUT button selection
  const buttons = document.querySelectorAll('.ulaplus-clut-btn');
  buttons.forEach((btn) => {
    const btnClut = parseInt(/** @type {HTMLElement} */ (btn).dataset.clut || '0', 10);
    btn.classList.toggle('selected', btnClut === clut);
  });

  // Update palette UI
  buildUlaPlusGrid();
  buildUlaPlusClassic();
  updateUlaPlusPalette();

  return true;
}

/**
 * Picks ink and paper colors from standard SCR canvas at given coordinates
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} - true if colors were picked successfully
 */
function pickScrColorFromCanvas(x, y) {
  if (!screenData) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  // Get attribute for this cell
  const attrAddr = getAttributeAddress(x, y);
  const attr = screenData[attrAddr];

  // Decode standard attribute:
  // bits 0-2: ink color (0-7)
  // bits 3-5: paper color (0-7)
  // bit 6: bright
  // bit 7: flash
  editorInkColor = attr & 0x07;
  editorPaperColor = (attr >> 3) & 0x07;
  editorBright = (attr & 0x40) !== 0;
  editorFlash = (attr & 0x80) !== 0;

  // Update checkboxes
  const brightCheckbox = document.getElementById('brightCheckbox');
  if (brightCheckbox) {
    /** @type {HTMLInputElement} */ (brightCheckbox).checked = editorBright;
  }
  const flashCheckbox = document.getElementById('editorFlashCheckbox');
  if (flashCheckbox) {
    /** @type {HTMLInputElement} */ (flashCheckbox).checked = editorFlash;
  }

  // Update palette UI
  updateColorPreview();

  return true;
}

/**
 * Picks Gigascreen virtual colors from canvas at pixel position
 * Left-click picks ink, Right-click picks paper
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {boolean} pickInk - true to pick ink, false to pick paper
 * @returns {boolean} true if color was picked
 */
function pickGigascreenColorFromCanvas(x, y, pickInk) {
  if (!screenData || screenData.length < getGigaFrameSize() * 2) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  // Get attributes from both frames
  const charRow = getGigaAttrRow(y);
  const charCol = Math.floor(x / 8);
  const attrOffset = charRow * 32 + charCol;
  const attr1 = screenData[6144 + attrOffset];
  const attr2 = screenData[getGigaFrameSize() + 6144 + attrOffset];

  // Decode attributes to get ink/paper colors (0-15 including bright)
  const ink1 = (attr1 & 0x07) + ((attr1 & 0x40) ? 8 : 0);
  const paper1 = ((attr1 >> 3) & 0x07) + ((attr1 & 0x40) ? 8 : 0);
  const ink2 = (attr2 & 0x07) + ((attr2 & 0x40) ? 8 : 0);
  const paper2 = ((attr2 >> 3) & 0x07) + ((attr2 & 0x40) ? 8 : 0);

  // Find matching virtual color indices for ink and paper
  if (gigascreenVirtualPalette.length === 0) {
    generateGigascreenVirtualPalette();
  }

  // Find virtual ink (frame1Color matches ink1, frame2Color matches ink2)
  let foundInkIdx = -1;
  let foundPaperIdx = -1;
  for (let i = 0; i < gigascreenVirtualPalette.length; i++) {
    const vc = gigascreenVirtualPalette[i];
    if (vc.frame1Color === ink1 && vc.frame2Color === ink2) {
      foundInkIdx = i;
    }
    if (vc.frame1Color === paper1 && vc.frame2Color === paper2) {
      foundPaperIdx = i;
    }
  }

  // Set the virtual ink/paper
  if (foundInkIdx >= 0) {
    gigascreenVirtualInk = foundInkIdx;
  }
  if (foundPaperIdx >= 0) {
    gigascreenVirtualPaper = foundPaperIdx;
  }

  // Now determine which of the 4 cell colors this pixel is
  const bitmapAddr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);
  const pixel1Set = (screenData[bitmapAddr] & (1 << bit)) !== 0;
  const pixel2Set = (screenData[getGigaFrameSize() + bitmapAddr] & (1 << bit)) !== 0;

  // Map to color index: 0=ink+ink, 1=ink+paper, 2=paper+ink, 3=paper+paper
  let colorIdx = 0;
  if (pixel1Set && pixel2Set) colorIdx = 0;      // ink+ink
  else if (pixel1Set && !pixel2Set) colorIdx = 1; // ink+paper
  else if (!pixel1Set && pixel2Set) colorIdx = 2; // paper+ink
  else colorIdx = 3;                              // paper+paper

  // Assign to primary (left) or secondary (right) based on pickInk
  if (pickInk) {
    gigascreenPrimaryColor = colorIdx;
  } else {
    gigascreenSecondaryColor = colorIdx;
  }

  // Update UI
  updateGigascreenColorPickerUI();

  return true;
}

/**
 * Picks RGB3 pixel color from canvas at given coordinates.
 * Reads the 3-bit color from R/G/B bitmaps and sets ink or paper.
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @param {boolean} isInk - true to set ink, false to set paper
 * @returns {boolean} true if color was picked
 */
function pickRgb3ColorFromCanvas(x, y, isInk) {
  if (!screenData || screenData.length < RGB3.TOTAL_SIZE) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  const bitmapAddr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);
  const bitMask = 1 << bit;

  const hasRed = (screenData[RGB3.RED_OFFSET + bitmapAddr] & bitMask) !== 0;
  const hasGreen = (screenData[RGB3.GREEN_OFFSET + bitmapAddr] & bitMask) !== 0;
  const hasBlue = (screenData[RGB3.BLUE_OFFSET + bitmapAddr] & bitMask) !== 0;

  // ZX color index: bit2=Green, bit1=Red, bit0=Blue
  const color = (hasGreen ? 4 : 0) | (hasRed ? 2 : 0) | (hasBlue ? 1 : 0);

  if (isInk) {
    editorInkColor = color;
  } else {
    editorPaperColor = color;
  }
  updateRgb3PaletteSelection();
  return true;
}

/**
 * Picks color from 53c format canvas at given coordinates.
 * Finds matching palette entry in attr53cVirtualPalette.
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} true if color was picked
 */
function pick53cColorFromCanvas(x, y) {
  if (!screenData || attr53cVirtualPalette.length === 0) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  // 53c is attribute-only: 768 bytes, 32x24 cells
  const col = Math.floor(x / 8);
  const row = Math.floor(y / 8);
  const attr = screenData[row * 32 + col];

  // Find matching entry in virtual palette
  for (let i = 0; i < attr53cVirtualPalette.length; i++) {
    if (attr53cVirtualPalette[i].attr === attr) {
      attr53cSelectedIndex = i;
      update53cPaletteSelection();
      return true;
    }
  }
  return false;
}

/**
 * Picks ink/paper colors from IFL format canvas (8x2 attribute blocks).
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} true if colors were picked
 */
function pickIflColorFromCanvas(x, y) {
  if (!screenData || screenData.length < IFL.TOTAL_SIZE) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  const attrAddr = getIflAttributeAddress(x, y);
  const attr = screenData[attrAddr];

  editorInkColor = attr & 0x07;
  editorPaperColor = (attr >> 3) & 0x07;
  editorBright = (attr & 0x40) !== 0;
  editorFlash = (attr & 0x80) !== 0;

  updateColorSelectors();
  return true;
}

/**
 * Picks ink/paper colors from MLT format canvas (8x1 attribute blocks).
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} true if colors were picked
 */
function pickMltColorFromCanvas(x, y) {
  if (!screenData || screenData.length < MLT.TOTAL_SIZE) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  const attrAddr = getMltAttributeAddress(x, y);
  const attr = screenData[attrAddr];

  editorInkColor = attr & 0x07;
  editorPaperColor = (attr >> 3) & 0x07;
  editorBright = (attr & 0x40) !== 0;
  editorFlash = (attr & 0x80) !== 0;

  updateColorSelectors();
  return true;
}

/**
 * Picks ink/paper colors from BMC4 format canvas (8x4 dual attribute blocks).
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} true if colors were picked
 */
function pickBmc4ColorFromCanvas(x, y) {
  if (!screenData || screenData.length < BMC4.TOTAL_SIZE) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  const attrAddr = getBmc4AttributeAddress(x, y);
  const attr = screenData[attrAddr];

  editorInkColor = attr & 0x07;
  editorPaperColor = (attr >> 3) & 0x07;
  editorBright = (attr & 0x40) !== 0;
  editorFlash = (attr & 0x80) !== 0;

  updateColorSelectors();
  return true;
}

/**
 * Picks ink/paper colors from SPECSCII format canvas.
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @returns {boolean} true if colors were picked
 */
function pickSpecsciiColorFromCanvas(x, y) {
  if (!specsciiAttrGrid) return false;
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return false;

  const g = specsciiPixelToGrid(x, y);
  const idx = g.row * 32 + g.col;
  const attr = specsciiAttrGrid[idx];

  editorInkColor = attr & 0x07;
  editorPaperColor = (attr >> 3) & 0x07;
  editorBright = (attr & 0x40) !== 0;
  editorFlash = (attr & 0x80) !== 0;

  updateColorSelectors();
  return true;
}

/**
 * Unified color picker: dispatches to format-specific picker function.
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @param {boolean} isInk - true for ink/primary (left-click), false for paper/secondary (right-click)
 * @returns {boolean} true if a color was picked
 */
function pickColorFromCanvas(x, y, isInk) {
  if (!screenData) return false;
  if (x < 0 || x >= getFormatWidth() || y < 0 || y >= getFormatHeight()) return false;

  switch (currentFormat) {
    case FORMAT.SCR:
    case FORMAT.SCR_ULANEXT:
    case FORMAT.BSC:
      return pickScrColorFromCanvas(x, y);

    case FORMAT.SCR_ULAPLUS:
      return pickUlaPlusColorFromCanvas(x, y);

    case FORMAT.GIGASCREEN:
    case FORMAT.MGH:
    case FORMAT.HLR:
    case FORMAT.STL:
      return pickGigascreenColorFromCanvas(x, y, isInk);

    case FORMAT.RGB3:
      return pickRgb3ColorFromCanvas(x, y, isInk);

    case FORMAT.ATTR_53C:
      return pick53cColorFromCanvas(x, y);

    case FORMAT.NXI:
    case FORMAT.SL2:
      return pickNxiColorFromCanvas(x, y, isInk);

    case FORMAT.IFL:
      return pickIflColorFromCanvas(x, y);

    case FORMAT.MLT:
      return pickMltColorFromCanvas(x, y);

    case FORMAT.BMC4:
      return pickBmc4ColorFromCanvas(x, y);

    case FORMAT.SPECSCII:
      return pickSpecsciiColorFromCanvas(x, y);

    case FORMAT.MONO_FULL:
    case FORMAT.MONO_2_3:
    case FORMAT.MONO_1_3:
      return false;

    default:
      return false;
  }
}

/**
 * Pick color from NXI/SL2 canvas — reads palette index at (x, y).
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk
 * @returns {boolean}
 */
function pickNxiColorFromCanvas(x, y, isInk) {
  if (!screenData || !nxiResolvedPalette) return false;
  let idx;
  const pixOff = getNxiPixelOffset();
  if (nxiLayer2Mode === '640x256') {
    const byteVal = screenData[pixOff + getNxiPixelIndex(x, y)] || 0;
    idx = (x & 1) ? (byteVal & 0x0F) : ((byteVal >> 4) & 0x0F);
  } else {
    idx = screenData[pixOff + getNxiPixelIndex(x, y)];
  }
  if (isInk) {
    editorInkColor = idx;
  } else {
    editorPaperColor = idx;
  }
  updateNxiPaletteHighlight();
  updateColorPreview();
  return true;
}

/**
 * Saves the current ULA+ palette to a 64-byte .pal file
 */
function saveUlaPlusPalette() {
  if (!isUlaPlusMode || !ulaPlusPalette) {
    alert('No ULA+ palette to save');
    return;
  }

  // Get palette data from screenData or ulaPlusPalette
  const palette = screenData.length >= ULAPLUS.TOTAL_SIZE
    ? screenData.slice(ULAPLUS.PALETTE_OFFSET, ULAPLUS.PALETTE_OFFSET + 64)
    : ulaPlusPalette;

  const baseName = currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'palette';
  downloadFile(new Blob([palette], { type: 'application/octet-stream' }), baseName + '.pal');
}

/**
 * Loads a ULA+ palette from a 64-byte .pal file
 * @param {File} file - The palette file to load
 */
function loadUlaPlusPalette(file) {
  if (!isUlaPlusMode) {
    alert('Switch to ULA+ mode first');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(/** @type {ArrayBuffer} */ (e.target?.result));

    // Extract 64-byte GRB332 palette from .pal (64 bytes) or .tap (176 bytes)
    let palette;
    if (data.length === 64) {
      palette = data;
    } else if (data.length === 176) {
      // .tap ULA+ palette loader (BASIC + MC): 64-byte palette at offset 110,
      // followed by BASIC line terminator (0x0D) and TAP checksum byte
      palette = data.subarray(110, 174);
    } else {
      alert('Invalid palette file: expected 64-byte .pal or 176-byte .tap ULA+ palette loader, got ' + data.length + ' bytes');
      return;
    }

    // Save undo state before applying
    saveUndoState();

    // Apply palette to screenData and ulaPlusPalette
    if (screenData.length >= ULAPLUS.TOTAL_SIZE) {
      for (let i = 0; i < 64; i++) {
        screenData[ULAPLUS.PALETTE_OFFSET + i] = palette[i];
      }
    }
    ulaPlusPalette = new Uint8Array(palette);

    // Rebuild palette UI
    if (typeof buildUlaPlusGrid === 'function') buildUlaPlusGrid();
    if (typeof buildUlaPlusClassic === 'function') buildUlaPlusClassic();
    if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();

    // Re-render
    editorRender();
    if (typeof renderPreview === 'function') renderPreview();
  };

  reader.onerror = () => {
    alert('Failed to read palette file');
  };

  reader.readAsArrayBuffer(file);
}

/**
 * Saves the current NXI/SL2 palette to a 512-byte .nxp file (256 entries × 2 bytes RGB333).
 */
function saveNxiPalette() {
  if ((currentFormat !== FORMAT.NXI && currentFormat !== FORMAT.SL2) || !nxiResolvedPalette) {
    alert('No NXI/SL2 palette to save');
    return;
  }

  let paletteBytes;
  if (currentFormat === FORMAT.NXI && screenData && screenData.length >= NXI.TOTAL_SIZE) {
    // NXI: extract the embedded 512-byte palette directly
    paletteBytes = screenData.slice(0, NXI.PALETTE_SIZE);
  } else {
    // SL2 or fallback: encode nxiResolvedPalette back to RGB333 binary
    paletteBytes = new Uint8Array(NXI.PALETTE_SIZE);
    for (let i = 0; i < 256; i++) {
      const rgb = nxiResolvedPalette[i] || [0, 0, 0];
      const r3 = Math.round(rgb[0] * 7 / 255);
      const g3 = Math.round(rgb[1] * 7 / 255);
      const b3 = Math.round(rgb[2] * 7 / 255);
      paletteBytes[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
      paletteBytes[i * 2 + 1] = b3 & 1;
    }
  }

  const baseName = currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'palette';
  downloadFile(new Blob([paletteBytes], { type: 'application/octet-stream' }), baseName + '.nxp');
}

/**
 * Loads an NXI palette from a 512-byte .nxp/.pal file.
 * @param {File} file - The palette file to load
 */
function loadNxiPalette(file) {
  if (currentFormat !== FORMAT.NXI) {
    alert('Load an NXI file first');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(/** @type {ArrayBuffer} */ (e.target?.result));

    if (data.length !== NXI.PALETTE_SIZE) {
      alert('Invalid palette file: expected ' + NXI.PALETTE_SIZE + ' bytes, got ' + data.length + ' bytes');
      return;
    }

    saveUndoState();

    // Parse palette and write into screenData[0..511]
    nxiResolvedPalette = parseNxiPalette(data);
    for (let i = 0; i < NXI.PALETTE_SIZE; i++) {
      screenData[i] = data[i];
    }

    // Rebuild palette grid and re-render
    buildNxiPalette();
    editorRender();
    if (typeof renderPreview === 'function') renderPreview();
  };

  reader.onerror = () => {
    alert('Failed to read palette file');
  };

  reader.readAsArrayBuffer(file);
}

// ============================================================================
// ULA+ Color Picker Dialog
// ============================================================================

/** @type {number} - Index of color being edited (0-63) */
let ulaPlusEditingColorIndex = -1;

/** @type {number} - Original GRB332 value before editing */
let ulaPlusOriginalGrb = 0;

/**
 * Opens the ULA+ color picker dialog for a specific palette index
 * @param {number} index - Palette index (0-63)
 */
function openUlaPlusColorPicker(index) {
  if (index < 0 || index >= 64) return;
  if (!ulaPlusPalette) return;

  ulaPlusEditingColorIndex = index;
  ulaPlusOriginalGrb = ulaPlusPalette[index];

  const dialog = document.getElementById('ulaPlusColorDialog');
  if (!dialog) return;

  // Get current color components from GRB332
  const g3 = (ulaPlusOriginalGrb >> 5) & 0x07;
  const r3 = (ulaPlusOriginalGrb >> 2) & 0x07;
  const b2 = ulaPlusOriginalGrb & 0x03;

  // Set slider values
  const rSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorR'));
  const gSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorG'));
  const bSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorB'));

  if (rSlider) rSlider.value = String(r3);
  if (gSlider) gSlider.value = String(g3);
  if (bSlider) bSlider.value = String(b2);

  // Update labels
  const rVal = document.getElementById('ulaPlusColorRVal');
  const gVal = document.getElementById('ulaPlusColorGVal');
  const bVal = document.getElementById('ulaPlusColorBVal');
  if (rVal) rVal.textContent = String(r3);
  if (gVal) gVal.textContent = String(g3);
  if (bVal) bVal.textContent = String(b2);

  // Update index info
  const indexLabel = document.getElementById('ulaPlusColorIndex');
  const grbLabel = document.getElementById('ulaPlusColorGRB');
  const clut = Math.floor(index / 16);
  const pos = index % 16;
  const isInk = pos < 8;
  if (indexLabel) indexLabel.textContent = `CLUT ${clut}, ${isInk ? 'INK' : 'PAPER'} ${pos % 8}`;
  if (grbLabel) grbLabel.textContent = `GRB: ${g3}${r3}${b2}`;

  // Update color previews
  updateUlaPlusColorPreview();

  // Show original color
  const origPreview = document.getElementById('ulaPlusColorOriginal');
  const rgb = grb332ToRgb(ulaPlusOriginalGrb);
  if (origPreview) origPreview.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  // Show dialog
  dialog.style.display = '';
}

/**
 * Updates the color preview in the dialog based on current slider values
 */
function updateUlaPlusColorPreview() {
  const rSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorR'));
  const gSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorG'));
  const bSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorB'));

  const r3 = parseInt(rSlider?.value || '0', 10);
  const g3 = parseInt(gSlider?.value || '0', 10);
  const b2 = parseInt(bSlider?.value || '0', 10);

  // Update labels
  const rVal = document.getElementById('ulaPlusColorRVal');
  const gVal = document.getElementById('ulaPlusColorGVal');
  const bVal = document.getElementById('ulaPlusColorBVal');
  if (rVal) rVal.textContent = String(r3);
  if (gVal) gVal.textContent = String(g3);
  if (bVal) bVal.textContent = String(b2);

  // Build GRB332 and convert to RGB
  const grb = (g3 << 5) | (r3 << 2) | b2;
  const rgb = grb332ToRgb(grb);

  // Update preview
  const preview = document.getElementById('ulaPlusColorPreview');
  if (preview) preview.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  // Update GRB label
  const grbLabel = document.getElementById('ulaPlusColorGRB');
  if (grbLabel) grbLabel.textContent = `GRB: ${g3}${r3}${b2}`;
}

/**
 * Applies the edited color to the palette
 */
function applyUlaPlusColor() {
  if (ulaPlusEditingColorIndex < 0 || ulaPlusEditingColorIndex >= 64) return;

  const rSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorR'));
  const gSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorG'));
  const bSlider = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusColorB'));

  const r3 = parseInt(rSlider?.value || '0', 10);
  const g3 = parseInt(gSlider?.value || '0', 10);
  const b2 = parseInt(bSlider?.value || '0', 10);

  const grb = (g3 << 5) | (r3 << 2) | b2;

  // If called from import context, route to import callback
  if (importUlaPlusApplyCallback) {
    importUlaPlusApplyCallback(grb);
    closeUlaPlusColorPicker();
    return;
  }

  // Save undo state
  saveUndoState();

  // Apply to palette
  if (ulaPlusPalette) {
    ulaPlusPalette[ulaPlusEditingColorIndex] = grb;
  }

  // Apply to screenData if ULA+ file
  if (screenData && screenData.length >= ULAPLUS.TOTAL_SIZE) {
    screenData[ULAPLUS.PALETTE_OFFSET + ulaPlusEditingColorIndex] = grb;
  }

  // Close dialog
  closeUlaPlusColorPicker();

  // Rebuild palette UI
  buildUlaPlusGrid();
  buildUlaPlusClassic();
  updateUlaPlusPalette();

  // Re-render
  editorRender();
  if (typeof renderPreview === 'function') renderPreview();
}

/**
 * Closes the ULA+ color picker dialog without applying changes
 */
function closeUlaPlusColorPicker() {
  const dialog = document.getElementById('ulaPlusColorDialog');
  if (dialog) {
    dialog.style.display = 'none';
    dialog.style.zIndex = '';
  }
  ulaPlusEditingColorIndex = -1;
  // Clean up import state if cancel was pressed during import context
  if (importUlaPlusApplyCallback) {
    // Restore editor palette that was temporarily swapped
    if (importUlaPlusSavedEditorPalette !== null) {
      ulaPlusPalette = importUlaPlusSavedEditorPalette;
      importUlaPlusSavedEditorPalette = null;
    }
    importUlaPlusApplyCallback = null;
  }
}

/**
 * Initializes the ULA+ color picker dialog event listeners
 */
function initUlaPlusColorPicker() {
  const rSlider = document.getElementById('ulaPlusColorR');
  const gSlider = document.getElementById('ulaPlusColorG');
  const bSlider = document.getElementById('ulaPlusColorB');

  rSlider?.addEventListener('input', updateUlaPlusColorPreview);
  gSlider?.addEventListener('input', updateUlaPlusColorPreview);
  bSlider?.addEventListener('input', updateUlaPlusColorPreview);

  const applyBtn = document.getElementById('ulaPlusColorApplyBtn');
  const cancelBtn = document.getElementById('ulaPlusColorCancelBtn');
  const closeBtn = document.getElementById('ulaPlusColorCloseBtn');

  applyBtn?.addEventListener('click', applyUlaPlusColor);
  cancelBtn?.addEventListener('click', closeUlaPlusColorPicker);
  closeBtn?.addEventListener('click', closeUlaPlusColorPicker);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const dialog = document.getElementById('ulaPlusColorDialog');
      if (dialog && dialog.style.display !== 'none') {
        closeUlaPlusColorPicker();
        e.preventDefault();
      }
    }
  });
}

/**
 * Shows or hides the ULA+ palette section and regular palette based on current mode
 */
function updateUlaPlusSectionVisibility() {
  const ulaPlusSection = document.getElementById('ulaPlusSection');
  const regularPalette = document.getElementById('editorPalette');
  const brightFlashRow = document.querySelector('.editor-color-row'); // First color row has bright/flash

  if (ulaPlusSection) {
    ulaPlusSection.style.display = isUlaPlusMode ? 'block' : 'none';
  }

  // Hide regular palette and bright/flash controls in ULA+ mode
  if (regularPalette) {
    regularPalette.style.display = isUlaPlusMode ? 'none' : 'flex';
  }

  // Find the bright/flash row (contains editorBrightCheckbox)
  const brightCheckbox = document.getElementById('editorBrightCheckbox');
  if (brightCheckbox) {
    const brightFlashContainer = brightCheckbox.closest('.editor-color-row');
    if (brightFlashContainer) {
      /** @type {HTMLElement} */ (brightFlashContainer).style.display = isUlaPlusMode ? 'none' : 'flex';
    }
  }
}

/**
 * Builds the ULA+ 8x8 grid palette (Mode A)
 * Layout: 4 CLUTs x 2 rows each (ink row + paper row per CLUT)
 */
function buildUlaPlusGrid() {
  const container = document.getElementById('ulaPlusGridMode');
  if (!container) return;

  container.innerHTML = '';

  for (let i = 0; i < 64; i++) {
    const cell = document.createElement('div');
    cell.className = 'ulaplus-grid-cell';
    cell.dataset.index = String(i);

    // Get color from palette
    const rgb = getUlaPlusColor(i);
    cell.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

    // Tooltip showing CLUT and position
    const clut = Math.floor(i / 16);
    const pos = i % 16;
    const isInk = pos < 8;
    cell.title = `CLUT ${clut}, ${isInk ? 'INK' : 'PAPER'} ${pos % 8} (#${i}) - Ctrl+click to edit`;

    // Add gap class to first row of each CLUT (except first CLUT)
    // CLUT 1 ink row: indices 16-23
    // CLUT 2 ink row: indices 32-39
    // CLUT 3 ink row: indices 48-55
    if ((i >= 16 && i <= 23) || (i >= 32 && i <= 39) || (i >= 48 && i <= 55)) {
      cell.classList.add('clut-gap');
    }

    // Left click = set ink (only allow ink colors: pos 0-7 within CLUT)
    // Ctrl+click = edit color, Shift+click = copy/swap source selection
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      if (ulaPlusCopySource >= 0) {
        ulaPlusHandleCopySwapClick(i, e.shiftKey);
        return;
      }
      if (e.shiftKey) {
        ulaPlusHandleCopySwapClick(i, false);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        openUlaPlusColorPicker(i);
        return;
      }
      if (pos >= 8) return; // Can't select paper as ink

      const newClut = clut;
      ulaPlusInkIndex = i;

      // Sync paper to same CLUT if it's not transparent
      if (ulaPlusPaperIndex !== ULAPLUS_TRANSPARENT) {
        const currentPaperClut = Math.floor(ulaPlusPaperIndex / 16);
        if (newClut !== currentPaperClut) {
          const paperPos = ulaPlusPaperIndex % 8; // Paper color 0-7
          ulaPlusPaperIndex = newClut * 16 + 8 + paperPos; // Same color in new CLUT
        }
      }

      updateUlaPlusPalette();
    });

    // Right click = set paper (only allow paper colors: pos 8-15 within CLUT)
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (pos < 8) return; // Can't select ink as paper

      const newClut = clut;
      ulaPlusPaperIndex = i;

      // Sync ink to same CLUT if it's not transparent
      if (ulaPlusInkIndex !== ULAPLUS_TRANSPARENT) {
        const currentInkClut = Math.floor(ulaPlusInkIndex / 16);
        if (newClut !== currentInkClut) {
          const inkPos = ulaPlusInkIndex % 8; // Ink color 0-7
          ulaPlusInkIndex = newClut * 16 + inkPos; // Same color in new CLUT
        }
      }

      updateUlaPlusPalette();
    });

    // Restore copy-source highlight if rebuilding while source is selected
    if (ulaPlusCopySource === i) {
      cell.classList.add('copy-source');
    }

    container.appendChild(cell);
  }

}

/**
 * Builds the ULA+ transparent cell row (separate from main grid)
 */
function buildUlaPlusTransparentRow() {
  const container = document.getElementById('ulaPlusTransparentRow');
  if (!container) return;

  container.innerHTML = '';

  const transCell = document.createElement('div');
  transCell.className = 'ulaplus-grid-cell ulaplus-transparent-cell';
  transCell.dataset.index = String(ULAPLUS_TRANSPARENT);
  transCell.title = 'Transparent (erases on non-background layers)';
  transCell.innerHTML = '<span style="font-size:9px;color:#888;">T</span>';

  transCell.addEventListener('click', (e) => {
    e.preventDefault();
    ulaPlusInkIndex = ULAPLUS_TRANSPARENT;
    updateUlaPlusPalette();
  });

  transCell.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ulaPlusPaperIndex = ULAPLUS_TRANSPARENT;
    updateUlaPlusPalette();
  });

  container.appendChild(transCell);
}

/**
 * Builds the ULA+ classic 16-color palette for selected CLUT (Mode B)
 * Layout: Two rows - ink (0-7) on top, paper (8-15) on bottom
 */
function buildUlaPlusClassic() {
  const container = document.getElementById('ulaPlusClassicPalette');
  if (!container) return;

  container.innerHTML = '';
  const baseIdx = ulaPlusSelectedClut * 16;

  // First row: INK colors (0-7)
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('div');
    cell.className = 'ulaplus-classic-cell';
    const paletteIdx = baseIdx + i;
    cell.dataset.index = String(paletteIdx);

    // Get color from palette
    const rgb = getUlaPlusColor(paletteIdx);
    cell.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

    // Tooltip
    cell.title = `INK ${i} (#${paletteIdx}) - Ctrl+click to edit`;

    // Left click = set ink (allowed for ink colors)
    // Ctrl+click = edit color, Shift+click = copy/swap source selection
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      if (ulaPlusCopySource >= 0) {
        ulaPlusHandleCopySwapClick(paletteIdx, e.shiftKey);
        return;
      }
      if (e.shiftKey) {
        ulaPlusHandleCopySwapClick(paletteIdx, false);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        openUlaPlusColorPicker(paletteIdx);
        return;
      }
      ulaPlusInkIndex = paletteIdx;

      // Sync paper to same CLUT if it's not transparent
      if (ulaPlusPaperIndex !== ULAPLUS_TRANSPARENT) {
        const currentPaperClut = Math.floor(ulaPlusPaperIndex / 16);
        if (ulaPlusSelectedClut !== currentPaperClut) {
          const paperPos = ulaPlusPaperIndex % 8; // Paper color 0-7
          ulaPlusPaperIndex = ulaPlusSelectedClut * 16 + 8 + paperPos;
        }
      }

      updateUlaPlusPalette();
    });

    // Right click = set paper (NOT allowed for ink colors)
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Don't allow setting paper from ink row
    });

    // Restore copy-source highlight if rebuilding while source is selected
    if (ulaPlusCopySource === paletteIdx) {
      cell.classList.add('copy-source');
    }

    container.appendChild(cell);
  }

  // Second row: PAPER colors (8-15)
  for (let i = 8; i < 16; i++) {
    const cell = document.createElement('div');
    cell.className = 'ulaplus-classic-cell';
    const paletteIdx = baseIdx + i;
    cell.dataset.index = String(paletteIdx);

    // Get color from palette
    const rgb = getUlaPlusColor(paletteIdx);
    cell.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

    // Tooltip
    cell.title = `PAPER ${i % 8} (#${paletteIdx}) - Ctrl+click to edit`;

    // Left click = edit color (Ctrl+click), Shift+click = copy/swap source selection
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      if (ulaPlusCopySource >= 0) {
        ulaPlusHandleCopySwapClick(paletteIdx, e.shiftKey);
        return;
      }
      if (e.shiftKey) {
        ulaPlusHandleCopySwapClick(paletteIdx, false);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        openUlaPlusColorPicker(paletteIdx);
        return;
      }
      // Don't allow setting ink from paper row
    });

    // Right click = set paper (allowed for paper colors)
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ulaPlusPaperIndex = paletteIdx;

      // Sync ink to same CLUT if it's not transparent
      if (ulaPlusInkIndex !== ULAPLUS_TRANSPARENT) {
        const currentInkClut = Math.floor(ulaPlusInkIndex / 16);
        if (ulaPlusSelectedClut !== currentInkClut) {
          const inkPos = ulaPlusInkIndex % 8; // Ink color 0-7
          ulaPlusInkIndex = ulaPlusSelectedClut * 16 + inkPos;
        }
      }

      updateUlaPlusPalette();
    });

    // Restore copy-source highlight if rebuilding while source is selected
    if (ulaPlusCopySource === paletteIdx) {
      cell.classList.add('copy-source');
    }

    container.appendChild(cell);
  }
}

/**
 * Updates the ULA+ palette display (both modes)
 */
function updateUlaPlusPalette() {
  // Update grid mode colors and selection
  const gridContainer = document.getElementById('ulaPlusGridMode');
  if (gridContainer) {
    const cells = gridContainer.querySelectorAll('.ulaplus-grid-cell');
    cells.forEach((cell) => {
      const idx = parseInt(/** @type {HTMLElement} */ (cell).dataset.index || '0', 10);
      const isTransparent = idx === ULAPLUS_TRANSPARENT;

      // Update color (skip for transparent cell)
      if (!isTransparent) {
        const rgb = getUlaPlusColor(idx);
        /** @type {HTMLElement} */ (cell).style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      }

      // Position within CLUT (0-7 = ink, 8-15 = paper)
      const pos = idx % 16;
      const isInkPos = pos < 8;

      // Update selection
      cell.classList.toggle('ink-selected', idx === ulaPlusInkIndex);
      cell.classList.toggle('paper-selected', idx === ulaPlusPaperIndex);

      // Add disabled class for wrong click type (ink row can't be paper, paper row can't be ink)
      if (!isTransparent) {
        cell.classList.toggle('disabled', false); // Grid shows visual hint via opacity
      }

      // Remove old markers
      const oldMarkers = cell.querySelectorAll('.ulaplus-palette-marker');
      oldMarkers.forEach((m) => m.remove());

      // Add I marker for ink selection
      if (idx === ulaPlusInkIndex) {
        const marker = document.createElement('span');
        marker.className = 'ulaplus-palette-marker ink-marker';
        marker.textContent = 'I';
        cell.appendChild(marker);
      }

      // Add P marker for paper selection
      if (idx === ulaPlusPaperIndex) {
        const marker = document.createElement('span');
        marker.className = 'ulaplus-palette-marker paper-marker';
        marker.textContent = 'P';
        cell.appendChild(marker);
      }
    });
  }

  // Update classic mode colors and selection
  const classicContainer = document.getElementById('ulaPlusClassicPalette');
  if (classicContainer) {
    const cells = classicContainer.querySelectorAll('.ulaplus-classic-cell');
    cells.forEach((cell) => {
      const idx = parseInt(/** @type {HTMLElement} */ (cell).dataset.index || '0', 10);
      const isTransparent = idx === ULAPLUS_TRANSPARENT;

      // Update color (skip for transparent cell)
      if (!isTransparent) {
        const rgb = getUlaPlusColor(idx);
        /** @type {HTMLElement} */ (cell).style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      }

      // Update selection
      cell.classList.toggle('ink-selected', idx === ulaPlusInkIndex);
      cell.classList.toggle('paper-selected', idx === ulaPlusPaperIndex);

      // Remove old markers
      const oldMarkers = cell.querySelectorAll('.ulaplus-palette-marker');
      oldMarkers.forEach((m) => m.remove());

      // Add I marker for ink selection
      if (idx === ulaPlusInkIndex) {
        const marker = document.createElement('span');
        marker.className = 'ulaplus-palette-marker ink-marker';
        marker.textContent = 'I';
        cell.appendChild(marker);
      }

      // Add P marker for paper selection
      if (idx === ulaPlusPaperIndex) {
        const marker = document.createElement('span');
        marker.className = 'ulaplus-palette-marker paper-marker';
        marker.textContent = 'P';
        cell.appendChild(marker);
      }
    });
  }

  // Update transparent row
  const transContainer = document.getElementById('ulaPlusTransparentRow');
  if (transContainer) {
    const transCell = transContainer.querySelector('.ulaplus-transparent-cell');
    if (transCell) {
      // Update selection
      transCell.classList.toggle('ink-selected', ulaPlusInkIndex === ULAPLUS_TRANSPARENT);
      transCell.classList.toggle('paper-selected', ulaPlusPaperIndex === ULAPLUS_TRANSPARENT);

      // Remove old markers
      const oldMarkers = transCell.querySelectorAll('.ulaplus-palette-marker');
      oldMarkers.forEach((m) => m.remove());

      // Add I marker for ink selection
      if (ulaPlusInkIndex === ULAPLUS_TRANSPARENT) {
        const marker = document.createElement('span');
        marker.className = 'ulaplus-palette-marker ink-marker';
        marker.textContent = 'I';
        transCell.appendChild(marker);
      }

      // Add P marker for paper selection
      if (ulaPlusPaperIndex === ULAPLUS_TRANSPARENT) {
        const marker = document.createElement('span');
        marker.className = 'ulaplus-palette-marker paper-marker';
        marker.textContent = 'P';
        transCell.appendChild(marker);
      }
    }
  }
}

/**
 * Toggles between ULA+ grid and classic view modes
 */
function toggleUlaPlusViewMode() {
  ulaPlusGridView = !ulaPlusGridView;

  const gridMode = document.getElementById('ulaPlusGridMode');
  const classicMode = document.getElementById('ulaPlusClassicMode');
  const modeLabel = document.getElementById('ulaPlusModeLabel');
  const modeToggle = /** @type {HTMLInputElement} */ (document.getElementById('ulaPlusModeToggle'));

  if (gridMode && classicMode) {
    gridMode.style.display = ulaPlusGridView ? 'grid' : 'none';
    classicMode.style.display = ulaPlusGridView ? 'none' : 'block';
  }

  if (modeLabel) {
    modeLabel.textContent = ulaPlusGridView ? 'Grid' : 'Classic';
  }

  if (modeToggle) {
    modeToggle.checked = ulaPlusGridView;
  }

  // Rebuild classic palette when switching to it
  if (!ulaPlusGridView) {
    buildUlaPlusClassic();
  }

  updateUlaPlusPalette();
}

/**
 * Sets the selected CLUT for classic mode
 * @param {number} clut - CLUT index (0-3)
 */
function setUlaPlusClut(clut) {
  ulaPlusSelectedClut = clut;

  // Move ink to new CLUT (keep same color position 0-7)
  if (ulaPlusInkIndex !== ULAPLUS_TRANSPARENT) {
    const inkPos = ulaPlusInkIndex % 8;
    ulaPlusInkIndex = clut * 16 + inkPos;
  }

  // Move paper to new CLUT (keep same color position 0-7)
  if (ulaPlusPaperIndex !== ULAPLUS_TRANSPARENT) {
    const paperPos = ulaPlusPaperIndex % 8;
    ulaPlusPaperIndex = clut * 16 + 8 + paperPos;
  }

  // Update CLUT button selection
  const buttons = document.querySelectorAll('.ulaplus-clut-btn');
  buttons.forEach((btn) => {
    const btnClut = parseInt(/** @type {HTMLElement} */ (btn).dataset.clut || '0', 10);
    btn.classList.toggle('selected', btnClut === clut);
  });

  // Rebuild classic palette for new CLUT
  buildUlaPlusClassic();
  updateUlaPlusPalette();
}

/**
 * Initializes ULA+ palette UI event listeners
 */
function initUlaPlusPaletteUI() {
  // Mode toggle checkbox
  const modeToggle = document.getElementById('ulaPlusModeToggle');
  if (modeToggle) {
    modeToggle.addEventListener('change', () => {
      toggleUlaPlusViewMode();
    });
  }

  // CLUT buttons
  const clutButtons = document.querySelectorAll('.ulaplus-clut-btn');
  clutButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const clut = parseInt(/** @type {HTMLElement} */ (btn).dataset.clut || '0', 10);
      setUlaPlusClut(clut);
    });
  });

  // Save palette button
  const savePalBtn = document.getElementById('ulaPlusSavePalBtn');
  savePalBtn?.addEventListener('click', saveUlaPlusPalette);

  // Load palette button and file input
  const loadPalBtn = document.getElementById('ulaPlusLoadPalBtn');
  const palFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ulaPlusPalFileInput'));

  loadPalBtn?.addEventListener('click', () => {
    palFileInput?.click();
  });

  palFileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) {
      loadUlaPlusPalette(file);
    }
    // Reset input so same file can be loaded again
    if (palFileInput) palFileInput.value = '';
  });

  // Build initial palettes
  buildUlaPlusGrid();
  buildUlaPlusClassic();
  buildUlaPlusTransparentRow();

  // Initialize color picker dialog
  initUlaPlusColorPicker();
}

/**
 * Initializes the NXI/SL2 palette save/load UI buttons.
 */
function initNxiPaletteUI() {
  // Save palette button
  const nxiSaveBtn = document.getElementById('nxiSavePalBtn');
  nxiSaveBtn?.addEventListener('click', saveNxiPalette);

  // Load palette button and file input
  const nxiLoadBtn = document.getElementById('nxiLoadPalBtn');
  const nxiFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('nxiPalFileInput'));

  nxiLoadBtn?.addEventListener('click', () => {
    nxiFileInput?.click();
  });

  nxiFileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) {
      loadNxiPalette(file);
    }
    // Reset input so same file can be loaded again
    if (nxiFileInput) nxiFileInput.value = '';
  });
}

// ============================================================================
// SPECSCII Editor — Grid Management, Stream Parser/Encoder, Drawing, Palette
// ============================================================================

/**
 * Initializes empty SPECSCII grids (32×24)
 * @param {number} [fillChar=0x20] - Character to fill with (default: space)
 * @param {number} [fillAttr=0x38] - Attribute to fill with (default: white ink on black paper)
 */
function specsciiInitGrids(fillChar = 0x20, fillAttr = 0x38) {
  specsciiCharGrid = new Uint8Array(768);
  specsciiAttrGrid = new Uint8Array(768);
  specsciiMask = new Uint8Array(768);
  specsciiCharGrid.fill(fillChar);
  specsciiAttrGrid.fill(fillAttr);
  // mask starts at 0 — cells are empty/transparent until user places content
}

/**
 * Parses a SPECSCII stream (screenData) into the character and attribute grids.
 * Walk bytes, process control codes (INK, PAPER, BRIGHT, FLASH, AT, ENTER).
 * Printable chars (0x20-0x7F, 0x80-0x8F) placed into grid with current attribute.
 * Detects OVER 1 sections and creates separate layers for each OVER block.
 */
function specsciiStreamToGrids() {
  if (!screenData) return;

  // Initialize grids: space (0x20), white ink (7) on black paper (0) = attr 0x07
  specsciiInitGrids(0x20, 0x38);

  // Collect OVER layers: each entry is {charGrid, attrGrid, mask}
  /** @type {Array<{charGrid: Uint8Array, attrGrid: Uint8Array, mask: Uint8Array}>} */
  const overLayers = [];
  let overMode = 0;
  /** @type {Uint8Array|null} */
  let curCharGrid = specsciiCharGrid;
  /** @type {Uint8Array|null} */
  let curAttrGrid = specsciiAttrGrid;
  /** @type {Uint8Array|null} */
  let curMask = specsciiMask; // track which cells have user-placed content

  let ink = 7, paper = 0, bright = 0, flash = 0;
  let col = 0, row = 0;
  let i = 0;

  while (i < screenData.length) {
    const byte = screenData[i];

    if (byte === SPECSCII.CC_ENTER) {
      col = 0;
      row++;
      if (row >= SPECSCII.CHAR_ROWS) row = SPECSCII.CHAR_ROWS - 1;
      i++;
      continue;
    }

    if (byte === SPECSCII.CC_INK && i + 1 < screenData.length) {
      ink = screenData[i + 1] & 0x07;
      i += 2;
      continue;
    }
    if (byte === SPECSCII.CC_PAPER && i + 1 < screenData.length) {
      paper = screenData[i + 1] & 0x07;
      i += 2;
      continue;
    }
    if (byte === SPECSCII.CC_FLASH && i + 1 < screenData.length) {
      flash = screenData[i + 1] & 0x01;
      i += 2;
      continue;
    }
    if (byte === SPECSCII.CC_BRIGHT && i + 1 < screenData.length) {
      bright = screenData[i + 1] & 0x01;
      i += 2;
      continue;
    }
    if (byte === SPECSCII.CC_INVERSE && i + 1 < screenData.length) {
      i += 2; // Parse but don't track for grid (applied at render time in viewer)
      continue;
    }
    if (byte === SPECSCII.CC_OVER && i + 1 < screenData.length) {
      const newOver = screenData[i + 1] & 0x01;
      if (newOver && !overMode) {
        // Entering OVER mode: start a new layer
        const layerChars = new Uint8Array(768);
        layerChars.fill(0x20);
        const layerAttrs = new Uint8Array(768);
        layerAttrs.fill(0x38);
        const layerMask = new Uint8Array(768);
        overLayers.push({ charGrid: layerChars, attrGrid: layerAttrs, mask: layerMask });
        curCharGrid = layerChars;
        curAttrGrid = layerAttrs;
        curMask = layerMask;
        // Reset position for new layer section
        col = 0;
        row = 0;
      } else if (!newOver && overMode) {
        // Leaving OVER mode: switch back to background grids
        curCharGrid = specsciiCharGrid;
        curAttrGrid = specsciiAttrGrid;
        curMask = specsciiMask;
        col = 0;
        row = 0;
      }
      overMode = newOver;
      i += 2;
      continue;
    }
    if (byte === SPECSCII.CC_AT && i + 2 < screenData.length) {
      row = screenData[i + 1];
      col = screenData[i + 2];
      if (row >= SPECSCII.CHAR_ROWS) row = SPECSCII.CHAR_ROWS - 1;
      if (col >= SPECSCII.CHAR_COLS) col = SPECSCII.CHAR_COLS - 1;
      i += 3;
      continue;
    }
    if (byte === SPECSCII.CC_TAB && i + 1 < screenData.length) {
      col = screenData[i + 1];
      if (col >= SPECSCII.CHAR_COLS) col = SPECSCII.CHAR_COLS - 1;
      i += 2;
      continue;
    }

    // Skip non-printable bytes below 0x20 (other control codes)
    if (byte < 0x20) {
      i++;
      continue;
    }

    // Printable character: 0x20-0x7F (ROM font) or 0x80-0x8F (block graphics)
    // Characters above 0x8F are also valid block graphics on ZX Spectrum
    if (col < SPECSCII.CHAR_COLS && row < SPECSCII.CHAR_ROWS) {
      const idx = row * 32 + col;
      curCharGrid[idx] = byte;
      curAttrGrid[idx] = (ink & 0x07) | ((paper & 0x07) << 3) | (bright ? 0x40 : 0) | (flash ? 0x80 : 0);
      if (curMask) curMask[idx] = 1;
    }

    col++;
    if (col >= SPECSCII.CHAR_COLS) {
      col = 0;
      row++;
      if (row >= SPECSCII.CHAR_ROWS) row = SPECSCII.CHAR_ROWS - 1;
    }
    i++;
  }

  // If OVER layers were found, initialize the layer system with them
  if (overLayers.length > 0) {
    specsciiInitLayersFromStream(overLayers);
    // Update layer panel UI (may have been called before grids were parsed)
    if (typeof toggleLayerSectionVisibility === 'function') {
      toggleLayerSectionVisibility();
    }
    if (typeof updateLayerPanel === 'function') {
      updateLayerPanel();
    }
  }
}

/**
 * Initializes the layer system from parsed OVER sections in a SPECSCII stream.
 * Creates a background layer from specsciiCharGrid/specsciiAttrGrid, then adds
 * one layer for each OVER section found during parsing.
 * @param {Array<{charGrid: Uint8Array, attrGrid: Uint8Array, mask: Uint8Array}>} overLayers
 */
function specsciiInitLayersFromStream(overLayers) {
  const cellCount = 768;

  layersEnabled = true;
  layers = [];

  // Background layer from main grids (copy mask to track user-placed content)
  const bgBitmap = new Uint8Array(cellCount);
  const bgAttrs = new Uint8Array(cellCount);
  const bgMask = new Uint8Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    bgBitmap[i] = specsciiCharGrid[i];
    bgAttrs[i] = specsciiAttrGrid[i];
    bgMask[i] = specsciiMask ? specsciiMask[i] : 1;
  }
  layers.push({
    name: 'Background',
    bitmap: bgBitmap,
    attributes: bgAttrs,
    mask: bgMask,
    visible: true
  });

  // One layer per OVER section
  for (let li = 0; li < overLayers.length; li++) {
    const ol = overLayers[li];
    const layerBitmap = new Uint8Array(cellCount);
    const layerAttrs = new Uint8Array(cellCount);
    const layerMask = new Uint8Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      layerBitmap[i] = ol.charGrid[i];
      layerAttrs[i] = ol.attrGrid[i];
      layerMask[i] = ol.mask[i];
    }
    layers.push({
      name: `OVER ${li + 1}`,
      bitmap: layerBitmap,
      attributes: layerAttrs,
      mask: layerMask,
      visible: true
    });
  }

  activeLayerIndex = 0;
}

/**
 * Serializes SPECSCII character and attribute grids back to a stream.
 * Uses sticky attribute optimization — only emits control codes when attributes change.
 * Uses AT codes for each row to ensure correct positioning.
 * Skips trailing spaces for compactness.
 * @returns {Uint8Array} Variable-length stream
 */
function specsciiGridsToStream() {
  if (!specsciiCharGrid || !specsciiAttrGrid) return new Uint8Array(0);

  const buf = [];
  let curInk = -1, curPaper = -1, curBright = -1, curFlash = -1;
  const hasMask = specsciiMask !== null;

  for (let row = 0; row < SPECSCII.CHAR_ROWS; row++) {
    // Find last masked column in this row
    let lastCol = -1;
    for (let col = SPECSCII.CHAR_COLS - 1; col >= 0; col--) {
      const ci = row * 32 + col;
      if (hasMask ? specsciiMask[ci] : (specsciiCharGrid[ci] !== 0x20)) {
        lastCol = col;
        break;
      }
    }
    if (lastCol < 0) continue; // Skip rows with no user content

    let prevCol = -1;
    for (let col = 0; col <= lastCol; col++) {
      const idx = row * 32 + col;

      // Skip unmasked cells (empty/transparent)
      if (hasMask && !specsciiMask[idx]) continue;

      // Emit AT to position if not sequential
      if (col !== prevCol + 1) {
        buf.push(SPECSCII.CC_AT, row, col);
        // Reset attribute tracking after repositioning
        curInk = -1; curPaper = -1; curBright = -1; curFlash = -1;
      }

      const attr = specsciiAttrGrid[idx];
      const ch = specsciiCharGrid[idx];

      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr >> 6) & 0x01;
      const flash = (attr >> 7) & 0x01;

      // Emit attribute changes (sticky)
      if (ink !== curInk) {
        buf.push(SPECSCII.CC_INK, ink);
        curInk = ink;
      }
      if (paper !== curPaper) {
        buf.push(SPECSCII.CC_PAPER, paper);
        curPaper = paper;
      }
      if (bright !== curBright) {
        buf.push(SPECSCII.CC_BRIGHT, bright);
        curBright = bright;
      }
      if (flash !== curFlash) {
        buf.push(SPECSCII.CC_FLASH, flash);
        curFlash = flash;
      }

      buf.push(ch);
      prevCol = col;
    }
  }

  return new Uint8Array(buf);
}

/**
 * Places a character with current attribute at the given grid position.
 * Core drawing primitive for SPECSCII editor — used by all tools.
 * @param {number} col - Column (0-31)
 * @param {number} row - Row (0-23)
 */
function specsciiPlotCell(col, row) {
  if (!specsciiCharGrid || !specsciiAttrGrid) return;
  if (col < 0 || col >= SPECSCII.CHAR_COLS || row < 0 || row >= SPECSCII.CHAR_ROWS) return;

  const idx = row * 32 + col;

  let ch, attr;
  if (brushPaintMode === 'invert') {
    // Invert: swap ink and paper of existing cell, keep character
    const old = specsciiAttrGrid[idx];
    const ink = old & 0x07;
    const paper = (old >> 3) & 0x07;
    attr = (paper & 0x07) | ((ink & 0x07) << 3) | (old & 0xC0); // swap ink<->paper, keep bright+flash
    ch = specsciiCharGrid[idx];
  } else if (brushPaintMode === 'recolor') {
    // Recolor: change attribute only, keep character
    attr = getCurrentDrawingAttribute();
    ch = specsciiCharGrid[idx];
  } else {
    // Set: place selected char with current attribute
    attr = getCurrentDrawingAttribute();
    ch = specsciiSelectedChar;
  }

  specsciiCharGrid[idx] = ch;
  specsciiAttrGrid[idx] = attr;
  if (specsciiMask) specsciiMask[idx] = 1;

  // Update active layer if layers are enabled
  if (layersEnabled && layers.length > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      if (layer.bitmap) layer.bitmap[idx] = ch;
      if (layer.attributes) layer.attributes[idx] = attr;
      if (layer.mask) layer.mask[idx] = 1;
    }
  }
}

/**
 * Gets the character and attribute at a grid position.
 * @param {number} col
 * @param {number} row
 * @returns {{char: number, attr: number}|null}
 */
function specsciiGetCell(col, row) {
  if (!specsciiCharGrid || !specsciiAttrGrid) return null;
  if (col < 0 || col >= SPECSCII.CHAR_COLS || row < 0 || row >= SPECSCII.CHAR_ROWS) return null;
  const idx = row * 32 + col;
  return { char: specsciiCharGrid[idx], attr: specsciiAttrGrid[idx] };
}

/**
 * Converts pixel coordinates (from canvasToScreenCoords) to grid coordinates.
 * @param {number} x - Pixel X (0-255)
 * @param {number} y - Pixel Y (0-191)
 * @returns {{col: number, row: number}}
 */
function specsciiPixelToGrid(x, y) {
  return {
    col: Math.max(0, Math.min(31, Math.floor(x / 8))),
    row: Math.max(0, Math.min(23, Math.floor(y / 8)))
  };
}

/**
 * Bresenham line in grid coordinates, placing selected char at each cell.
 * @param {number} c0 - Start column
 * @param {number} r0 - Start row
 * @param {number} c1 - End column
 * @param {number} r1 - End row
 */
function specsciiDrawLine(c0, r0, c1, r1) {
  let dx = Math.abs(c1 - c0);
  let dy = Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1;
  const sy = r0 < r1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    specsciiPlotCell(c0, r0);
    if (c0 === c1 && r0 === r1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; c0 += sx; }
    if (e2 < dx) { err += dx; r0 += sy; }
  }
}

/**
 * Rectangle outline in grid coordinates.
 * @param {number} c0
 * @param {number} r0
 * @param {number} c1
 * @param {number} r1
 */
function specsciiDrawRect(c0, r0, c1, r1) {
  const left = Math.min(c0, c1);
  const right = Math.max(c0, c1);
  const top = Math.min(r0, r1);
  const bottom = Math.max(r0, r1);

  specsciiDrawLine(left, top, right, top);
  specsciiDrawLine(left, bottom, right, bottom);
  specsciiDrawLine(left, top, left, bottom);
  specsciiDrawLine(right, top, right, bottom);
}

/**
 * Ellipse outline in grid coordinates using midpoint algorithm.
 * @param {number} c0
 * @param {number} r0
 * @param {number} c1
 * @param {number} r1
 */
function specsciiDrawCircle(c0, r0, c1, r1) {
  const left = Math.min(c0, c1);
  const right = Math.max(c0, c1);
  const top = Math.min(r0, r1);
  const bottom = Math.max(r0, r1);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;

  if (rx < 0.5 && ry < 0.5) {
    specsciiPlotCell(Math.round(cx), Math.round(cy));
    return;
  }

  // Use parametric approach for small ellipses
  const steps = Math.max(16, Math.ceil(Math.PI * (rx + ry)));
  let prevC = -1, prevR = -1;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const c = Math.round(cx + rx * Math.cos(angle));
    const r = Math.round(cy + ry * Math.sin(angle));
    if (c !== prevC || r !== prevR) {
      specsciiPlotCell(c, r);
      prevC = c;
      prevR = r;
    }
  }
}

/**
 * Flood fill connected region of same character code with selected char + current attr.
 * @param {number} startCol
 * @param {number} startRow
 */
function specsciiFloodFill(startCol, startRow) {
  if (!specsciiCharGrid || !specsciiAttrGrid) return;
  if (startCol < 0 || startCol >= SPECSCII.CHAR_COLS || startRow < 0 || startRow >= SPECSCII.CHAR_ROWS) return;

  const startIdx = startRow * 32 + startCol;
  const targetChar = specsciiCharGrid[startIdx];
  const targetAttr = specsciiAttrGrid[startIdx];
  const newAttr = getCurrentDrawingAttribute();

  // Don't fill if same char and attr
  if (targetChar === specsciiSelectedChar && targetAttr === newAttr) return;

  const visited = new Uint8Array(768);
  const stack = [[startCol, startRow]];

  while (stack.length > 0) {
    const [c, r] = stack.pop();
    if (c < 0 || c >= SPECSCII.CHAR_COLS || r < 0 || r >= SPECSCII.CHAR_ROWS) continue;
    const idx = r * 32 + c;
    if (visited[idx]) continue;
    if (specsciiCharGrid[idx] !== targetChar || specsciiAttrGrid[idx] !== targetAttr) continue;

    visited[idx] = 1;
    specsciiCharGrid[idx] = specsciiSelectedChar;
    specsciiAttrGrid[idx] = newAttr;
    if (specsciiMask) specsciiMask[idx] = 1;

    if (layersEnabled && layers.length > 0) {
      const layer = layers[activeLayerIndex];
      if (layer) {
        if (layer.bitmap) layer.bitmap[idx] = specsciiSelectedChar;
        if (layer.attributes) layer.attributes[idx] = newAttr;
        if (layer.mask) layer.mask[idx] = 1;
      }
    }

    stack.push([c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]);
  }
}

/**
 * Recolor cell: change attribute only, preserving character.
 * @param {number} col
 * @param {number} row
 */
function specsciiRecolorCell(col, row) {
  if (!specsciiAttrGrid) return;
  if (col < 0 || col >= SPECSCII.CHAR_COLS || row < 0 || row >= SPECSCII.CHAR_ROWS) return;
  const idx = row * 32 + col;
  const attr = getCurrentDrawingAttribute();
  specsciiAttrGrid[idx] = attr;

  if (layersEnabled && layers.length > 0) {
    const layer = layers[activeLayerIndex];
    if (layer && layer.attributes) layer.attributes[idx] = attr;
  }
}

/**
 * Eraser: place space (0x20) with current attribute at cell.
 * @param {number} col
 * @param {number} row
 */
function specsciiEraseCell(col, row) {
  if (!specsciiCharGrid || !specsciiAttrGrid) return;
  if (col < 0 || col >= SPECSCII.CHAR_COLS || row < 0 || row >= SPECSCII.CHAR_ROWS) return;
  const idx = row * 32 + col;

  // Reset cell to space with default attribute and clear mask
  specsciiCharGrid[idx] = 0x20;
  specsciiAttrGrid[idx] = 0x38; // default: ink 0, paper 7
  if (specsciiMask) specsciiMask[idx] = 0;

  if (layersEnabled && layers.length > 0) {
    const layer = layers[activeLayerIndex];
    if (layer) {
      if (layer.bitmap) layer.bitmap[idx] = 0x20;
      if (layer.attributes) layer.attributes[idx] = 0x38;
      if (layer.mask) layer.mask[idx] = 0;
    }
  }
}

/**
 * Renders a single SPECSCII glyph into an ImageData at pixel (px, py).
 * Handles both ROM font (0x20-0x7F) and block graphics (0x80+).
 * @param {Uint8Array} imgData - RGBA pixel array (256×192 or similar)
 * @param {number} imgWidth - Image width in pixels
 * @param {number} charCode - Character code
 * @param {number} attr - Attribute byte
 * @param {number} px - Pixel X position
 * @param {number} py - Pixel Y position
 */
function specsciiRenderGlyph(imgData, imgWidth, charCode, attr, px, py) {
  const inkIdx = attr & 0x07;
  const paperIdx = (attr >> 3) & 0x07;
  const isBright = (attr & 0x40) !== 0;
  const isFlash = (attr & 0x80) !== 0;

  const palette = isBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;

  let inkRgb, paperRgb;
  if (isFlash && flashPhase && flashEnabled) {
    inkRgb = palette[paperIdx];
    paperRgb = palette[inkIdx];
  } else {
    inkRgb = palette[inkIdx];
    paperRgb = palette[paperIdx];
  }

  if (charCode >= 0x20 && charCode <= 0x7F) {
    // ROM font character
    const glyphIndex = charCode - SPECSCII.FIRST_CHAR;
    const glyphOffset = glyphIndex * 8;

    for (let line = 0; line < 8; line++) {
      const glyphByte = (fontData && glyphOffset + line < fontData.length) ? fontData[glyphOffset + line] : 0;
      for (let bit = 0; bit < 8; bit++) {
        const isSet = (glyphByte & (0x80 >> bit)) !== 0;
        const rgb = isSet ? inkRgb : paperRgb;
        const offset = ((py + line) * imgWidth + (px + bit)) * 4;
        imgData[offset] = rgb[0];
        imgData[offset + 1] = rgb[1];
        imgData[offset + 2] = rgb[2];
        imgData[offset + 3] = 255;
      }
    }
  } else if (charCode >= 0x80) {
    // Block graphics character
    const pattern = charCode & 0x0F;
    for (let line = 0; line < 8; line++) {
      for (let bit = 0; bit < 8; bit++) {
        const inTop = line < 4;
        const inLeft = bit < 4;
        let isSet = false;
        if (inTop && inLeft) isSet = (pattern & 0x02) !== 0;       // top-left
        else if (inTop && !inLeft) isSet = (pattern & 0x01) !== 0;  // top-right
        else if (!inTop && inLeft) isSet = (pattern & 0x08) !== 0;  // bottom-left
        else isSet = (pattern & 0x04) !== 0;                        // bottom-right

        const rgb = isSet ? inkRgb : paperRgb;
        const offset = ((py + line) * imgWidth + (px + bit)) * 4;
        imgData[offset] = rgb[0];
        imgData[offset + 1] = rgb[1];
        imgData[offset + 2] = rgb[2];
        imgData[offset + 3] = 255;
      }
    }
  } else {
    // Unknown char, render as paper
    for (let line = 0; line < 8; line++) {
      for (let bit = 0; bit < 8; bit++) {
        const offset = ((py + line) * imgWidth + (px + bit)) * 4;
        imgData[offset] = paperRgb[0];
        imgData[offset + 1] = paperRgb[1];
        imgData[offset + 2] = paperRgb[2];
        imgData[offset + 3] = 255;
      }
    }
  }
}

/**
 * Renders the SPECSCII character palette canvas (16×7 tiles = 112 chars).
 * Row 0-5: ROM chars 0x20-0x7F (96), Row 6: Block graphics 0x80-0x8F (16).
 */
/** SPECSCII palette layout constants */
const SPECSCII_PAL_COLS = 8;
const SPECSCII_PAL_ROM_ROWS = 12;  // 96 ROM chars / 8 cols
const SPECSCII_PAL_BLK_ROWS = 2;   // 16 block graphics / 8 cols
const SPECSCII_PAL_ROWS = SPECSCII_PAL_ROM_ROWS + SPECSCII_PAL_BLK_ROWS; // 14

/** Weight-sort mode state */
let specsciiPaletteSortByWeight = true;
/** @type {number[]|null} - Lazily built ROM char order sorted by pixel popcount */
let specsciiRomWeightOrder = null;

/** UDG block graphics in 5×3 symmetric grid (visually sorted, excludes full 0x8F) */
const SPECSCII_UDG_WEIGHT_GRID = [
  0x82, 0x8B, 0x83, 0x87, 0x81,
  0x89, 0x8A, 0x80, 0x85, 0x86,
  0x88, 0x8E, 0x8C, 0x8D, 0x84
];
const SPECSCII_PAL_WEIGHT_UDG_COLS = 5;
const SPECSCII_PAL_WEIGHT_UDG_ROWS = 3;

/**
 * Builds ROM character order sorted by pixel popcount (lightest→heaviest).
 * Ties broken by char code ascending. Requires fontData to be loaded.
 * @returns {number[]} Array of 96 char codes (0x20-0x7F) sorted by weight
 */
function buildSpecsciiRomWeightOrder() {
  const entries = [];
  for (let ch = 0x20; ch <= 0x7F; ch++) {
    let weight = 0;
    const glyphOffset = (ch - SPECSCII.FIRST_CHAR) * 8;
    if (typeof fontData !== 'undefined' && fontData && glyphOffset + 7 < fontData.length) {
      for (let line = 0; line < 8; line++) {
        let byte = fontData[glyphOffset + line];
        // Brian Kernighan's popcount
        while (byte) { byte &= byte - 1; weight++; }
      }
    }
    entries.push({ ch, weight });
  }
  entries.sort((a, b) => a.weight - b.weight || a.ch - b.ch);
  return entries.map(e => e.ch);
}

function renderSpecsciiPalette() {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('specsciiPaletteCanvas'));
  if (!canvas) return;

  const TILE = 8;
  const GAP = 1;
  const CELL = TILE + GAP; // 9px stride per character

  const weightMode = specsciiPaletteSortByWeight;
  const totalRows = weightMode
    ? SPECSCII_PAL_ROM_ROWS + SPECSCII_PAL_WEIGHT_UDG_ROWS  // 12 + 3 = 15
    : SPECSCII_PAL_ROWS;                                      // 14

  // Build weight order lazily on first use
  if (weightMode && !specsciiRomWeightOrder) {
    specsciiRomWeightOrder = buildSpecsciiRomWeightOrder();
  }

  // Canvas size: tiles + gaps (no trailing gap)
  canvas.width = SPECSCII_PAL_COLS * CELL - GAP;
  canvas.height = totalRows * CELL - GAP;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fill background with gap color
  ctx.fillStyle = getCSSVar('--bg-tertiary', '#333333');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- ROM characters section (rows 0-11) ---
  for (let tileRow = 0; tileRow < SPECSCII_PAL_ROM_ROWS; tileRow++) {
    for (let tileCol = 0; tileCol < SPECSCII_PAL_COLS; tileCol++) {
      const idx = tileRow * SPECSCII_PAL_COLS + tileCol;
      let charCode;
      if (weightMode) {
        if (idx >= specsciiRomWeightOrder.length) continue;
        charCode = specsciiRomWeightOrder[idx];
      } else {
        charCode = 0x20 + idx;
        if (charCode > 0x7F) continue;
      }

      const tileImg = ctx.createImageData(TILE, TILE);
      const attr = 0x07; // white ink, black paper
      specsciiRenderGlyph(tileImg.data, TILE, charCode, attr, 0, 0);
      ctx.putImageData(tileImg, tileCol * CELL, tileRow * CELL);
    }
  }

  // --- UDG block graphics section ---
  if (weightMode) {
    // 5×3 grid centered in 8-col canvas (offset by 1 column)
    const colOffset = 1;
    for (let r = 0; r < SPECSCII_PAL_WEIGHT_UDG_ROWS; r++) {
      for (let c = 0; c < SPECSCII_PAL_WEIGHT_UDG_COLS; c++) {
        const charCode = SPECSCII_UDG_WEIGHT_GRID[r * SPECSCII_PAL_WEIGHT_UDG_COLS + c];
        const tileImg = ctx.createImageData(TILE, TILE);
        specsciiRenderGlyph(tileImg.data, TILE, charCode, 0x07, 0, 0);
        ctx.putImageData(tileImg, (colOffset + c) * CELL, (SPECSCII_PAL_ROM_ROWS + r) * CELL);
      }
    }
  } else {
    // Code mode: 8×2 sequential grid
    for (let tileRow = SPECSCII_PAL_ROM_ROWS; tileRow < SPECSCII_PAL_ROWS; tileRow++) {
      for (let tileCol = 0; tileCol < SPECSCII_PAL_COLS; tileCol++) {
        const charCode = 0x80 + (tileRow - SPECSCII_PAL_ROM_ROWS) * SPECSCII_PAL_COLS + tileCol;
        const tileImg = ctx.createImageData(TILE, TILE);
        specsciiRenderGlyph(tileImg.data, TILE, charCode, 0x07, 0, 0);
        ctx.putImageData(tileImg, tileCol * CELL, tileRow * CELL);
      }
    }
  }

  // Highlight selected character
  specsciiHighlightSelected(ctx, CELL, SPECSCII_PAL_COLS);

  // Update zoomed preview
  renderSpecsciiCharPreview();
}

/**
 * Renders a zoomed preview of the currently selected SPECSCII character.
 */
function renderSpecsciiCharPreview() {
  const preview = /** @type {HTMLCanvasElement|null} */ (document.getElementById('specsciiCharPreview'));
  if (!preview) return;

  const BORDER = 2;
  const INNER = 32; // 8×8 glyph scaled 4×
  const SIZE = INNER + BORDER * 2;
  preview.width = SIZE;
  preview.height = SIZE;

  const ctx = preview.getContext('2d');
  if (!ctx) return;

  // Draw frame border
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Render glyph at 1:1 into a tiny ImageData
  const imgData = ctx.createImageData(8, 8);
  const attr = 0x07; // white on black
  specsciiRenderGlyph(imgData.data, 8, specsciiSelectedChar, attr, 0, 0);

  // Scale up to preview size inside the border
  const tmp = document.createElement('canvas');
  tmp.width = 8;
  tmp.height = 8;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, 8, 8, BORDER, BORDER, INNER, INNER);
}

/**
 * Highlights the currently selected character in the palette canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tileSize - Tile size in canvas pixels
 * @param {number} cols - Columns per row
 */
function specsciiHighlightSelected(ctx, cellSize, cols) {
  let tileCol, tileRow;
  const weightMode = specsciiPaletteSortByWeight;

  if (specsciiSelectedChar >= 0x80 && specsciiSelectedChar <= 0x8F) {
    if (weightMode) {
      const gridIdx = SPECSCII_UDG_WEIGHT_GRID.indexOf(specsciiSelectedChar);
      if (gridIdx < 0) return;
      tileRow = SPECSCII_PAL_ROM_ROWS + Math.floor(gridIdx / SPECSCII_PAL_WEIGHT_UDG_COLS);
      tileCol = 1 + (gridIdx % SPECSCII_PAL_WEIGHT_UDG_COLS); // centered offset
    } else {
      const idx = specsciiSelectedChar - 0x80;
      tileRow = SPECSCII_PAL_ROM_ROWS + Math.floor(idx / cols);
      tileCol = idx % cols;
    }
  } else if (specsciiSelectedChar >= 0x20 && specsciiSelectedChar <= 0x7F) {
    if (weightMode && specsciiRomWeightOrder) {
      const idx = specsciiRomWeightOrder.indexOf(specsciiSelectedChar);
      if (idx < 0) return;
      tileRow = Math.floor(idx / cols);
      tileCol = idx % cols;
    } else {
      const idx = specsciiSelectedChar - 0x20;
      tileRow = Math.floor(idx / cols);
      tileCol = idx % cols;
    }
  } else {
    return;
  }

  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 1;
  ctx.strokeRect(tileCol * cellSize + 0.5, tileRow * cellSize + 0.5, 7, 7);
}

/**
 * Handles click on the SPECSCII palette canvas to select a character.
 * @param {MouseEvent} event
 */
function handleSpecsciiPaletteClick(event) {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('specsciiPaletteCanvas'));
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const weightMode = specsciiPaletteSortByWeight;
  const totalRows = weightMode
    ? SPECSCII_PAL_ROM_ROWS + SPECSCII_PAL_WEIGHT_UDG_ROWS
    : SPECSCII_PAL_ROWS;

  // Convert display coordinates to tile coordinates
  const tileCol = Math.floor((event.clientX - rect.left) / rect.width * SPECSCII_PAL_COLS);
  const tileRow = Math.floor((event.clientY - rect.top) / rect.height * totalRows);

  if (tileCol < 0 || tileCol >= SPECSCII_PAL_COLS) return;

  let charCode;
  if (tileRow >= 0 && tileRow < SPECSCII_PAL_ROM_ROWS) {
    // ROM characters section
    if (weightMode && specsciiRomWeightOrder) {
      const idx = tileRow * SPECSCII_PAL_COLS + tileCol;
      if (idx >= specsciiRomWeightOrder.length) return;
      charCode = specsciiRomWeightOrder[idx];
    } else {
      charCode = 0x20 + tileRow * SPECSCII_PAL_COLS + tileCol;
      if (charCode > 0x7F) return;
    }
  } else if (tileRow >= SPECSCII_PAL_ROM_ROWS && tileRow < totalRows) {
    // UDG block graphics section
    if (weightMode) {
      const gridCol = tileCol - 1; // centered offset
      const gridRow = tileRow - SPECSCII_PAL_ROM_ROWS;
      if (gridCol < 0 || gridCol >= SPECSCII_PAL_WEIGHT_UDG_COLS) return;
      if (gridRow < 0 || gridRow >= SPECSCII_PAL_WEIGHT_UDG_ROWS) return;
      charCode = SPECSCII_UDG_WEIGHT_GRID[gridRow * SPECSCII_PAL_WEIGHT_UDG_COLS + gridCol];
    } else {
      charCode = 0x80 + (tileRow - SPECSCII_PAL_ROM_ROWS) * SPECSCII_PAL_COLS + tileCol;
    }
  } else {
    return;
  }

  specsciiSelectedChar = charCode;
  renderSpecsciiPalette();
  updateSpecsciiCharInfo();
}

/**
 * Updates the character info display below the palette.
 */
function updateSpecsciiCharInfo() {
  const info = document.getElementById('specsciiCharInfo');
  if (!info) return;
  const hex = specsciiSelectedChar.toString(16).toUpperCase().padStart(2, '0');
  const name = specsciiSelectedChar === 0x20 ? 'Space' :
               specsciiSelectedChar <= 0x7F ? String.fromCharCode(specsciiSelectedChar) :
               'Block 0x' + hex;
  info.textContent = 'Char: 0x' + hex + ' (' + name + ')';
  renderSpecsciiCharPreview();
}

/**
 * Right-click pick: copies character + attribute from cell under cursor.
 * @param {number} col
 * @param {number} row
 */
function specsciiPickFromCell(col, row) {
  const cell = specsciiGetCell(col, row);
  if (!cell) return;

  specsciiSelectedChar = cell.char;
  editorInkColor = cell.attr & 0x07;
  editorPaperColor = (cell.attr >> 3) & 0x07;
  editorBright = (cell.attr & 0x40) !== 0;
  editorFlash = (cell.attr & 0x80) !== 0;

  // Update UI
  updateColorPreview();
  const brightCb = /** @type {HTMLInputElement|null} */ (document.getElementById('editorBrightCheckbox'));
  const flashCb = /** @type {HTMLInputElement|null} */ (document.getElementById('editorFlashCheckbox'));
  if (brightCb) brightCb.checked = editorBright;
  if (flashCb) flashCb.checked = editorFlash;

  renderSpecsciiPalette();
  updateSpecsciiCharInfo();
}

/**
 * Syncs grids → stream (screenData) after editing.
 */
function specsciiSyncToStream() {
  // Multi-layer: encode all visible layers with OVER control codes
  if (typeof layersEnabled !== 'undefined' && layersEnabled &&
      typeof layers !== 'undefined' && layers.length > 1) {
    screenData = specsciiLayersToStream();
  } else {
    screenData = specsciiGridsToStream();
  }
}

/**
 * Serializes multiple SPECSCII layers into a stream with OVER control codes.
 * Background layer is printed normally. Upper layers are printed with OVER 1,
 * which causes the ZX Spectrum PRINT routine to XOR the glyph pixels.
 * @returns {Uint8Array} Variable-length stream
 */
function specsciiLayersToStream() {
  const buf = [];

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    if (!layer.visible || !layer.bitmap) continue;

    // Upper layers: enable OVER 1 (XOR mode)
    if (layerIdx > 0) {
      buf.push(SPECSCII.CC_OVER, 1);
    }

    let curInk = -1, curPaper = -1, curBright = -1, curFlash = -1;

    for (let row = 0; row < SPECSCII.CHAR_ROWS; row++) {
      // Find last masked column in this row
      let lastCol = -1;
      for (let col = SPECSCII.CHAR_COLS - 1; col >= 0; col--) {
        const ci = row * 32 + col;
        if (layer.mask && layer.mask[ci]) {
          lastCol = col;
          break;
        }
      }
      if (lastCol < 0) continue; // Skip rows with no user content

      let prevCol = -1;
      for (let col = 0; col <= lastCol; col++) {
        const ci = row * 32 + col;
        if (!layer.mask || !layer.mask[ci]) continue;

        // Position if not sequential
        if (col !== prevCol + 1) {
          buf.push(SPECSCII.CC_AT, row, col);
          // Reset attribute tracking after repositioning
          curInk = -1; curPaper = -1; curBright = -1; curFlash = -1;
        }

        const attr = layer.attributes ? layer.attributes[ci] : 0x38;
        const ink = attr & 0x07;
        const paper = (attr >> 3) & 0x07;
        const bright = (attr >> 6) & 0x01;
        const flash = (attr >> 7) & 0x01;

        if (ink !== curInk) { buf.push(SPECSCII.CC_INK, ink); curInk = ink; }
        if (paper !== curPaper) { buf.push(SPECSCII.CC_PAPER, paper); curPaper = paper; }
        if (bright !== curBright) { buf.push(SPECSCII.CC_BRIGHT, bright); curBright = bright; }
        if (flash !== curFlash) { buf.push(SPECSCII.CC_FLASH, flash); curFlash = flash; }

        buf.push(layer.bitmap[ci]);
        prevCol = col;
      }
    }

    // After upper layer, disable OVER
    if (layerIdx > 0) {
      buf.push(SPECSCII.CC_OVER, 0);
    }
  }

  return new Uint8Array(buf);
}

/**
 * Gets the glyph byte for a given character code and scan line.
 * @param {number} charCode - Character code (0x20-0x7F ROM font, 0x80+ block graphics)
 * @param {number} line - Scan line within glyph (0-7)
 * @returns {number} 8-bit glyph byte
 */
function specsciiGetGlyphByte(charCode, line) {
  if (charCode >= 0x20 && charCode <= 0x7F) {
    const glyphIndex = charCode - SPECSCII.FIRST_CHAR;
    const glyphOffset = glyphIndex * 8;
    if (fontData && glyphOffset + line < fontData.length) {
      return fontData[glyphOffset + line];
    }
    return 0;
  } else if (charCode >= 0x80) {
    const pattern = charCode & 0x0F;
    const inTop = line < 4;
    let leftSet = false, rightSet = false;
    if (inTop) {
      leftSet = (pattern & 0x02) !== 0;
      rightSet = (pattern & 0x01) !== 0;
    } else {
      leftSet = (pattern & 0x08) !== 0;
      rightSet = (pattern & 0x04) !== 0;
    }
    return (leftSet ? 0xF0 : 0x00) | (rightSet ? 0x0F : 0x00);
  }
  return 0;
}

/**
 * Exports SPECSCII grids to a standard 6912-byte .scr file.
 * Renders characters using font data into the ZX Spectrum bitmap layout.
 * When multiple layers exist, uses OVER (XOR) compositing for upper layers.
 * @returns {Uint8Array} 6912-byte SCR data
 */
function exportSpecsciiToScr() {
  const scrData = new Uint8Array(SCREEN.TOTAL_SIZE);

  const hasLayers = typeof layersEnabled !== 'undefined' && layersEnabled &&
                    typeof layers !== 'undefined' && layers.length > 1;

  if (hasLayers) {
    // Multi-layer XOR export
    const cellAttr = new Uint8Array(768);
    cellAttr.fill(0x07); // ink 7 (white), paper 0 (black)

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (!layer.visible || !layer.bitmap) continue;

      for (let row = 0; row < SPECSCII.CHAR_ROWS; row++) {
        for (let col = 0; col < SPECSCII.CHAR_COLS; col++) {
          const ci = row * 32 + col;
          if (layerIdx > 0 && (!layer.mask || !layer.mask[ci])) continue;

          const ch = layer.bitmap[ci];
          const attr = layer.attributes ? layer.attributes[ci] : 0x38;
          cellAttr[ci] = attr;

          const px = col * 8;
          const py = row * 8;
          for (let line = 0; line < 8; line++) {
            const glyphByte = specsciiGetGlyphByte(ch, line);
            const addr = getBitmapAddress(px, py + line);
            if (layerIdx === 0) {
              scrData[addr] = glyphByte;
            } else {
              scrData[addr] ^= glyphByte; // XOR — OVER mode
            }
          }
        }
      }
    }
    // Write composited attributes
    for (let i = 0; i < 768; i++) {
      scrData[SCREEN.BITMAP_SIZE + i] = cellAttr[i];
    }
  } else {
    // Single layer export from grids
    if (!specsciiCharGrid || !specsciiAttrGrid) return scrData;

    for (let row = 0; row < SPECSCII.CHAR_ROWS; row++) {
      for (let col = 0; col < SPECSCII.CHAR_COLS; col++) {
        const idx = row * 32 + col;
        const charCode = specsciiCharGrid[idx];
        const attr = specsciiAttrGrid[idx];

        scrData[SCREEN.BITMAP_SIZE + idx] = attr;

        const px = col * 8;
        const py = row * 8;
        for (let line = 0; line < 8; line++) {
          const addr = getBitmapAddress(px, py + line);
          scrData[addr] = specsciiGetGlyphByte(charCode, line);
        }
      }
    }
  }

  return scrData;
}

/**
 * Exports SPECSCII picture as a .TAP file containing a self-running BASIC program.
 * The program does: BORDER 7: PAPER 7: INK 0: BRIGHT 0: FLASH 0: CLS : PRINT "..."
 * The PRINT string contains embedded ZX Spectrum control codes (INK, PAPER, AT, etc.)
 * which the ROM PRINT routine interprets natively.
 * @returns {Uint8Array} TAP file data
 */
function exportSpecsciiToTap() {
  // --- Get SPECSCII stream ---
  /** @type {Uint8Array} */
  let stream;
  const hasLayers = typeof layersEnabled !== 'undefined' && layersEnabled &&
                    typeof layers !== 'undefined' && layers.length > 1;
  if (hasLayers) {
    stream = specsciiLayersToStream();
  } else {
    stream = specsciiGridsToStream();
  }

  // --- Helper: 5-byte FP for small non-negative integer ---
  function fpInt(n) {
    return [0x00, 0x00, n & 0xFF, (n >> 8) & 0xFF, 0x00];
  }

  // --- Helper: number literal (ASCII digits + 0x0E + 5-byte FP) ---
  function basicNum(n) {
    const digits = String(n).split('').map(c => c.charCodeAt(0));
    return [...digits, 0x0E, ...fpInt(n)];
  }

  // --- Helper: wrap content bytes as a BASIC line ---
  function basicLine(lineNum, content) {
    const len = content.length + 1; // +1 for 0x0D terminator
    return [
      (lineNum >> 8) & 0xFF, lineNum & 0xFF, // line number (big-endian)
      len & 0xFF, (len >> 8) & 0xFF,          // text length (little-endian)
      ...content,
      0x0D                                     // line terminator
    ];
  }

  // --- Helper: create a TAP block ---
  function tapBlock(flag, payload) {
    const blockLen = payload.length + 2; // +2 for flag + checksum
    let checksum = flag;
    for (let i = 0; i < payload.length; i++) checksum ^= payload[i];
    return [
      blockLen & 0xFF, (blockLen >> 8) & 0xFF, // block length (LE)
      flag,
      ...payload,
      checksum & 0xFF
    ];
  }

  // --- Build Line 10: BORDER 7: PAPER 7: INK 0: BRIGHT 0: FLASH 0: POKE 23659,0: CLS ---
  const TK_BORDER = 0xE7, TK_PAPER = 0xDA, TK_INK = 0xD9;
  const TK_BRIGHT = 0xDC, TK_FLASH = 0xDB, TK_CLS = 0xFB;
  const TK_PRINT = 0xF5, TK_CHRS = 0xC2;
  const TK_POKE = 0xF4, TK_PAUSE = 0xF2;

  const line10Content = [
    TK_BORDER, ...basicNum(7), 0x3A,       // BORDER 7:
    TK_PAPER, ...basicNum(7), 0x3A,        // PAPER 7:
    TK_INK, ...basicNum(0), 0x3A,          // INK 0:
    TK_BRIGHT, ...basicNum(0), 0x3A,       // BRIGHT 0:
    TK_FLASH, ...basicNum(0), 0x3A,        // FLASH 0:
    TK_CLS, 0x3A,                           // CLS:
    TK_POKE, ...basicNum(23659), 0x2C, ...basicNum(0) // POKE 23659,0
  ];
  const line10 = basicLine(10, line10Content);

  // --- Build Line 20: PRINT "...stream..." (split on 0x22 for embedded quotes) ---
  const line20Content = [];
  line20Content.push(TK_PRINT);

  // Split stream on 0x22 (double quote) bytes
  const segments = [];
  let segStart = 0;
  for (let i = 0; i <= stream.length; i++) {
    if (i === stream.length || stream[i] === 0x22) {
      segments.push(stream.slice(segStart, i));
      if (i < stream.length) {
        segments.push(null); // marker for a quote character
      }
      segStart = i + 1;
    }
  }

  let first = true;
  for (const seg of segments) {
    if (seg === null) {
      // Insert +CHR$ 34+ for the quote character
      if (!first) line20Content.push(0x2B); // +
      line20Content.push(TK_CHRS, ...basicNum(34));
      first = false;
    } else if (seg.length > 0 || first) {
      if (!first) line20Content.push(0x2B); // +
      line20Content.push(0x22); // opening quote
      for (let i = 0; i < seg.length; i++) {
        line20Content.push(seg[i]);
      }
      line20Content.push(0x22); // closing quote
      first = false;
    }
  }

  // If stream was empty, ensure we have at least PRINT ""
  if (first) {
    line20Content.push(0x22, 0x22); // ""
  }

  const line20 = basicLine(20, line20Content);

  // --- Build Line 30: PAUSE 0 ---
  const line30Content = [TK_PAUSE, ...basicNum(0)];
  const line30 = basicLine(30, line30Content);

  // --- Assemble BASIC program ---
  const program = [...line10, ...line20, ...line30];

  // --- TAP header block (17 bytes payload) ---
  const filename = 'SPECSCII  '; // 10 chars, space-padded
  const headerPayload = [
    0x00,                                              // Type: Program
    ...filename.split('').map(c => c.charCodeAt(0)),   // 10-char filename
    program.length & 0xFF, (program.length >> 8) & 0xFF, // Data length (LE)
    0x0A, 0x00,                                        // Autostart line 10 (LE)
    program.length & 0xFF, (program.length >> 8) & 0xFF  // Variable area offset = program length (LE)
  ];
  const headerBlock = tapBlock(0x00, headerPayload);

  // --- TAP data block ---
  const dataBlock = tapBlock(0xFF, program);

  // --- Combine ---
  return new Uint8Array([...headerBlock, ...dataBlock]);
}

/**
 * Checks if format is editable
 * @returns {boolean}
 */
function isFormatEditable() {
  if (currentFormat === FORMAT.SCR && screenData && screenData.length >= SCREEN.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.SCR_ULAPLUS && screenData && screenData.length >= SCREEN.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.SCR_ULANEXT && screenData && screenData.length >= SCREEN.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.ATTR_53C && screenData && screenData.length >= 768) return true;
  if (currentFormat === FORMAT.BSC && screenData && screenData.length >= BSC.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.IFL && screenData && screenData.length >= IFL.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.MLT && screenData && screenData.length >= MLT.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.BMC4 && screenData && screenData.length >= BMC4.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.RGB3 && screenData && screenData.length >= RGB3.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.GIGASCREEN && screenData && screenData.length >= GIGASCREEN.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.MGH && screenData && screenData.length >= GIGASCREEN.TOTAL_SIZE && isGigascreenEditable()) return true;
  if (currentFormat === FORMAT.HLR && screenData && screenData.length >= GIGASCREEN.TOTAL_SIZE && isGigascreenEditable()) return true;
  if (currentFormat === FORMAT.STL && screenData && screenData.length >= getGigaFrameSize() * 2 && isGigascreenEditable()) return true;
  if (currentFormat === FORMAT.MONO_FULL && screenData && screenData.length >= 6144) return true;
  if (currentFormat === FORMAT.MONO_2_3 && screenData && screenData.length >= 4096) return true;
  if (currentFormat === FORMAT.MONO_1_3 && screenData && screenData.length >= 2048) return true;
  if (currentFormat === FORMAT.SPECSCII && screenData) return true;
  if (currentFormat === FORMAT.NXI && screenData && screenData.length >= (nxiLayer2Mode === '640x256' ? NXI.TOTAL_SIZE_640 : nxiLayer2Mode === '320x256' ? NXI.TOTAL_SIZE_320 : NXI.TOTAL_SIZE)) return true;
  if (currentFormat === FORMAT.SL2 && screenData && screenData.length >= (nxiLayer2Mode !== '256x192' ? SL2.EXT_SIZE : SL2.RAW_SIZE)) return true;
  if (currentFormat === FORMAT.LORES && screenData && screenData.length >= LORES.PIXEL_DATA_SIZE) return true;
  if (currentFormat === FORMAT.LORES_RAD && screenData && screenData.length >= LORES_RAD.PIXEL_DATA_SIZE) return true;
  if ((currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) && screenData && currentPicture) return true;
  // BSP: non-giga (standard or with border) and giga variants
  if (currentFormat === FORMAT.BSP && screenData && currentPicture) {
    if (currentPicture.colorMode === 'gigascreen' && screenData.length >= GIGASCREEN.TOTAL_SIZE && isGigascreenEditable()) return true;
    if (currentPicture.colorMode !== 'gigascreen' && screenData.length >= SCREEN.TOTAL_SIZE) return true;
  }
  return false;
}

/**
 * Checks if we're in attribute-only editor mode (.53c)
 * @returns {boolean}
 */
function isAttrEditor() {
  return editorActive && currentFormat === FORMAT.ATTR_53C;
}

/**
 * Checks if we're in SPECSCII text editor mode
 * @returns {boolean}
 */
function isSpecsciiEditor() {
  return editorActive && currentFormat === FORMAT.SPECSCII;
}

/**
 * Checks if we're in BSC editor mode
 * @returns {boolean}
 */
function isBscEditor() {
  return editorActive && currentFormat === FORMAT.BSC;
}

/**
 * Checks if we're editing a format with border (BSC or BMC4)
 * These formats use the same frame dimensions and need border coordinate conversion
 * @returns {boolean}
 */
function isBorderFormatEditor() {
  return editorActive && (currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border));
}

/**
 * Checks if border editing is supported for the current format
 * Both BSC and BMC4 have the same border data structure
 * @returns {boolean}
 */
function isBorderEditable() {
  return editorActive && (currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border));
}

/**
 * Returns the canvas pixel offset for the main screen area.
 * BSC: 64 * zoom (border is the content, no padding).
 * SCR/53c: borderSize * zoom (user-configured border padding).
 * @returns {number}
 */
function getMainScreenOffset() {
  if (currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
      (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border)) {
    return BSC.BORDER_LEFT_PX * zoom;
  }
  return borderSize * zoom;
}

// ============================================================================
// BSC Border Editing
// ============================================================================

/** @type {string|null} - Tracks which region mouseDown started in ('main'|'border'|null) */
let bscDrawRegion = null;

/** @type {boolean} - Is border drawing in progress */
let isBorderDrawing = false;

/** @type {{frameX: number, frameY: number}|null} - Last border drawing position for interpolation */
let lastBorderPos = null;

/** @type {{frameX: number, frameY: number}|null} - Start point for border rectangle tool */
let borderRectStart = null;

/**
 * Converts canvas mouse event to BSC coordinates.
 * Returns {type:'main', x, y} for main screen area,
 * {type:'border', frameX, frameY, region, byteOffset, halfIndex} for border area,
 * or null if outside canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {MouseEvent} event
 * @returns {{type:'main', x:number, y:number}|{type:'border', frameX:number, frameY:number, region:string, byteOffset:number, halfIndex:number}|null}
 */
function canvasToBscCoords(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // BSC uses full-size canvas (not viewport-sized), so getBoundingClientRect()
  // already accounts for scroll — no scroll offset needed here.
  const frameX = Math.floor(canvasX / zoom);
  const frameY = Math.floor(canvasY / zoom);

  if (frameX < 0 || frameX >= BSC.FRAME_WIDTH || frameY < 0 || frameY >= BSC.FRAME_HEIGHT) {
    return null;
  }

  // Check if in main screen area (64–319 x, 64–255 y)
  if (frameX >= 64 && frameX < 320 && frameY >= 64 && frameY < 256) {
    return { type: 'main', x: frameX - 64, y: frameY - 64 };
  }

  // Border area — compute byte offset and half index
  const info = getBscBorderByteInfo(frameX, frameY);
  if (!info) return null;

  return {
    type: 'border',
    frameX: frameX,
    frameY: frameY,
    region: info.region,
    byteOffset: info.byteOffset,
    halfIndex: info.halfIndex
  };
}

/**
 * Gets the border data offset for the current format (BSC or BMC4).
 * @returns {number} Border offset in screenData
 */
function getBorderDataOffset() {
  return currentFormat === FORMAT.BMC4 ? BMC4.BORDER_OFFSET : BSC.BORDER_OFFSET;
}

/**
 * Maps frame pixel coords to border data byte offset + halfIndex.
 * Works for both BSC and BMC4 formats (same border structure, different offset).
 * halfIndex: 0 = bits 0–2 (first color), 1 = bits 3–5 (second color).
 * @param {number} frameX - Frame X coordinate (0–383)
 * @param {number} frameY - Frame Y coordinate (0–303)
 * @returns {{byteOffset:number, halfIndex:number, region:string}|null}
 */
function getBorderByteInfo(frameX, frameY) {
  const borderOffset = getBorderDataOffset();

  if (frameY < 64) {
    // Top border: full 384px width, 64 lines
    const byteOffset = borderOffset + frameY * BSC.BYTES_PER_FULL_LINE + Math.floor(frameX / 16);
    const halfIndex = Math.floor((frameX % 16) / 8);
    return { byteOffset, halfIndex, region: 'top' };
  } else if (frameY < 256) {
    // Side borders (main screen Y range)
    if (frameX < 64) {
      // Left side
      const byteOffset = borderOffset + 64 * BSC.BYTES_PER_FULL_LINE + (frameY - 64) * BSC.BYTES_PER_SIDE_LINE + Math.floor(frameX / 16);
      const halfIndex = Math.floor((frameX % 16) / 8);
      return { byteOffset, halfIndex, region: 'left' };
    } else if (frameX >= 320) {
      // Right side
      const byteOffset = borderOffset + 64 * BSC.BYTES_PER_FULL_LINE + (frameY - 64) * BSC.BYTES_PER_SIDE_LINE + 4 + Math.floor((frameX - 320) / 16);
      const halfIndex = Math.floor(((frameX - 320) % 16) / 8);
      return { byteOffset, halfIndex, region: 'right' };
    }
    return null; // Inside main screen area — not border
  } else if (frameY < 304) {
    // Bottom border: full 384px width, 48 lines
    const bottomOffset = borderOffset + 64 * BSC.BYTES_PER_FULL_LINE + 192 * BSC.BYTES_PER_SIDE_LINE;
    const byteOffset = bottomOffset + (frameY - 256) * BSC.BYTES_PER_FULL_LINE + Math.floor(frameX / 16);
    const halfIndex = Math.floor((frameX % 16) / 8);
    return { byteOffset, halfIndex, region: 'bottom' };
  }
  return null;
}

// Alias for backward compatibility
const getBscBorderByteInfo = getBorderByteInfo;

/**
 * Writes a 3-bit color (0–7) into the appropriate half of a border byte.
 * @param {number} byteOffset - Offset in screenData
 * @param {number} halfIndex - 0 = bits 0–2, 1 = bits 3–5
 * @param {number} color - Color value (0–7)
 */
function setBscBorderColor(byteOffset, halfIndex, color) {
  if (!screenData || byteOffset >= screenData.length) return;
  const c = color & 0x07;

  // Update screenData
  let byte = screenData[byteOffset];
  if (halfIndex === 0) {
    byte = (byte & 0xF8) | c;         // Clear bits 0–2, set color
  } else {
    byte = (byte & 0xC7) | (c << 3);  // Clear bits 3–5, set color
  }
  screenData[byteOffset] = byte;

  // Also update active layer's border data if layers are enabled
  if (layersEnabled && layers.length > 0) {
    const layer = layers[activeLayerIndex];
    if (layer && layer.borderData && layer.borderMask) {
      const borderOffset = getBorderDataOffset();
      const relativeOffset = byteOffset - borderOffset;

      if (relativeOffset >= 0 && relativeOffset < layer.borderData.length) {
        // Update layer border data
        let layerByte = layer.borderData[relativeOffset];
        if (halfIndex === 0) {
          layerByte = (layerByte & 0xF8) | c;
        } else {
          layerByte = (layerByte & 0xC7) | (c << 3);
        }
        layer.borderData[relativeOffset] = layerByte;

        // Mark this slot as visible in mask (2 slots per byte)
        const maskIdx = relativeOffset * 2 + halfIndex;

        // Only update transparency mask if this is actually new content on this layer
        const wasEmpty = !layer.borderMask[maskIdx];
        layer.borderMask[maskIdx] = 1;

        // Also update border transparency mask for rendering (only for new content)
        if (wasEmpty && borderTransparencyMask && maskIdx < borderTransparencyMask.length) {
          borderTransparencyMask[maskIdx] = 1;
        }
      }
    }
  }
}

/**
 * Gets the horizontal boundaries for a border region at given Y coordinate.
 * @param {number} frameY - Frame Y coordinate
 * @param {number} frameX - Frame X coordinate (to determine left vs right side)
 * @returns {{left: number, right: number}} Boundaries in pixels (right is exclusive)
 */
function getBorderRegionBounds(frameY, frameX) {
  if (frameY < 64 || frameY >= 256) {
    // Top or bottom border: full width
    return { left: 0, right: 384 };
  }
  // Side borders during main screen Y range
  if (frameX < 64) {
    return { left: 0, right: 64 };   // Left side border
  }
  return { left: 320, right: 384 };  // Right side border
}

/**
 * Gets the color of a border cell at given pixel position.
 * @param {number} px - X pixel position (must be 8px aligned)
 * @param {number} frameY - Frame Y coordinate
 * @returns {number} Color value (0–7) or -1 if outside border
 */
function getBorderCellColor(px, frameY) {
  const info = getBscBorderByteInfo(px, frameY);
  if (!info) return -1;
  const byte = screenData[info.byteOffset];
  return info.halfIndex === 0 ? (byte & 0x07) : ((byte >> 3) & 0x07);
}

/**
 * Sets the color of a single 8px border cell.
 * @param {number} cellX - Cell X (pixel X / 8)
 * @param {number} frameY - Frame Y coordinate
 * @param {number} color - Color value (0–7)
 */
function setBorderCellColor(cellX, frameY, color) {
  const px = cellX * 8;
  const info = getBscBorderByteInfo(px, frameY);
  if (!info) return;
  setBscBorderColor(info.byteOffset, info.halfIndex, color);
}

/**
 * Flood fill on border area - fills all connected 8px cells with same color.
 * @param {number} startFrameX - Starting frame X coordinate
 * @param {number} startFrameY - Starting frame Y coordinate
 * @param {number} fillColor - Color to fill with (0–7)
 */
function floodFillBorder(startFrameX, startFrameY, fillColor) {
  if (!screenData) return;

  // Get starting cell coordinates (8px units)
  const startCellX = Math.floor(startFrameX / 8);
  const startCellY = startFrameY;

  // Get the target color we're replacing
  const targetColor = getBorderCellColor(startCellX * 8, startCellY);
  if (targetColor === -1 || targetColor === fillColor) return;

  // Use a set to track visited cells (key = "cellX,cellY")
  const visited = new Set();
  const stack = [[startCellX, startCellY]];

  // Border bounds in cell coordinates
  const frameWidthCells = BSC.FRAME_WIDTH / 8; // 48 cells

  while (stack.length > 0) {
    const [cellX, cellY] = stack.pop();
    const key = `${cellX},${cellY}`;

    if (visited.has(key)) continue;

    // Check if this cell is in border area
    const info = getBscBorderByteInfo(cellX * 8, cellY);
    if (!info) continue;

    // Check if cell has target color
    const cellColor = getBorderCellColor(cellX * 8, cellY);
    if (cellColor !== targetColor) continue;

    visited.add(key);

    // Fill this cell
    setBorderCellColor(cellX, cellY, fillColor);

    // Add neighbors based on border region
    // Vertical neighbors (same X, Y±1)
    stack.push([cellX, cellY - 1]);
    stack.push([cellX, cellY + 1]);

    // Horizontal neighbors (X±1, same Y)
    if (cellX > 0) stack.push([cellX - 1, cellY]);
    if (cellX < frameWidthCells - 1) stack.push([cellX + 1, cellY]);
  }
}

/**
 * Paints a 24px-wide border cell with orphan segment validation.
 * After painting, checks if neighboring segments become orphaned (< 24px and not
 * touching a boundary). Orphaned segments are consumed by extending the painted color.
 * @param {number} frameX - Raw frame X coordinate
 * @param {number} frameY - Frame Y coordinate
 * @param {number} color - Color value (0–7)
 */
function paintBscBorderCell(frameX, frameY, color) {
  // Clamp frameX to valid border regions to prevent bleeding into main area
  if (frameY >= 64 && frameY < 256) {
    // Side border Y range - clamp to nearest border edge
    if (frameX >= 64 && frameX < 320) {
      // In main screen X range - clamp to nearest border
      if (frameX < 192) {
        frameX = 63;  // Clamp to left border edge
      } else {
        frameX = 320; // Clamp to right border edge
      }
    }
  }

  const snappedX = Math.floor(frameX / 8) * 8;
  const bounds = getBorderRegionBounds(frameY, frameX);

  // Convert to cell indices (each cell = 8px)
  const leftCell = bounds.left / 8;
  const rightCell = bounds.right / 8;  // exclusive
  const cellCount = rightCell - leftCell;

  // Get layer mask info for transparency-aware color comparison
  const activeLayer = layersEnabled && layers.length > 0 ? layers[activeLayerIndex] : null;
  const layerBorderMask = activeLayer && activeLayer.borderMask ? activeLayer.borderMask : null;
  const borderOffset = getBorderDataOffset();

  // Use -1 to represent "transparent/no content" for orphan handling
  const TRANSPARENT_COLOR = -1;

  // Read current colors for all cells in this region
  // For layers: transparent cells (mask=0) get TRANSPARENT_COLOR so they don't coalesce
  const cellColors = [];
  const originalColors = [];
  const cellHasContent = []; // Track which cells have actual content
  for (let i = 0; i < cellCount; i++) {
    const px = bounds.left + i * 8;
    const col = getBorderCellColor(px, frameY);

    // Check if this cell has content on the active layer
    let hasContent = true;
    if (layerBorderMask && activeLayerIndex > 0) {
      const info = getBscBorderByteInfo(px, frameY);
      if (info) {
        const relOffset = info.byteOffset - borderOffset;
        const maskIdx = relOffset * 2 + info.halfIndex;
        if (maskIdx >= 0 && maskIdx < layerBorderMask.length) {
          hasContent = layerBorderMask[maskIdx] === 1;
        }
      }
    }

    cellHasContent[i] = hasContent;
    // For orphan handling: transparent cells use special value so they don't coalesce
    cellColors[i] = hasContent ? col : TRANSPARENT_COLOR;
    originalColors[i] = hasContent ? col : TRANSPARENT_COLOR;
  }

  // Determine which cells we're painting
  // Use sub-cell position at edges to allow 8/16/24px options
  const clickedCell = Math.floor(snappedX / 8) - leftCell;
  const pixelInCell = frameX % 8;  // 0-7 position within the 8px cell
  let paintStartCell, paintEndCell;

  if (clickedCell === 0 && pixelInCell < 6) {
    // Left edge, most of cell 0 → 8px touching left edge
    paintStartCell = 0;
    paintEndCell = 0;
  } else if (clickedCell === 1 && pixelInCell < 6) {
    // Left edge, most of cell 1 → 16px touching left edge
    paintStartCell = 0;
    paintEndCell = 1;
  } else {
    // Normal 24px brush starting from clicked cell, clamped to bounds
    paintStartCell = clickedCell;
    paintEndCell = Math.min(clickedCell + 2, cellCount - 1);
  }

  // Apply paint to target cells
  for (let i = paintStartCell; i <= paintEndCell && i < cellCount; i++) {
    if (i >= 0) cellColors[i] = color;
  }

  // Check left side for orphaned segments
  let extendLeft = paintStartCell;
  while (extendLeft > 0) {
    const neighborColor = cellColors[extendLeft - 1];
    if (neighborColor === color) {
      // Same color - coalesce but don't modify
      extendLeft--;
      continue;
    }
    // Different color - find the run start
    let runStart = extendLeft - 1;
    while (runStart > 0 && cellColors[runStart - 1] === neighborColor) {
      runStart--;
    }
    const runLength = extendLeft - runStart;
    const touchesLeftBoundary = (runStart === 0);

    if (!touchesLeftBoundary && runLength < 3) {
      // Orphaned - extend paint color leftward
      for (let i = runStart; i < extendLeft; i++) {
        cellColors[i] = color;
      }
      extendLeft = runStart;
    } else {
      // Valid segment - stop checking
      break;
    }
  }

  // Check right side for orphaned segments
  let extendRight = paintEndCell;
  while (extendRight < cellCount - 1) {
    const neighborColor = cellColors[extendRight + 1];
    if (neighborColor === color) {
      // Same color - coalesce but don't modify
      extendRight++;
      continue;
    }
    // Different color - find the run end (inclusive)
    let runEnd = extendRight + 1;
    while (runEnd < cellCount - 1 && cellColors[runEnd + 1] === neighborColor) {
      runEnd++;
    }
    const runLength = runEnd - extendRight;  // Number of cells in neighbor run
    const touchesRightBoundary = (runEnd === cellCount - 1);

    if (!touchesRightBoundary && runLength < 3) {
      // Orphaned - extend paint color rightward
      for (let i = extendRight + 1; i <= runEnd; i++) {
        cellColors[i] = color;
      }
      extendRight = runEnd;
    } else {
      // Valid segment - stop checking
      break;
    }
  }

  // Write back cells that changed OR need mask update (for cells in paint range)
  // The painted range is from extendLeft to extendRight (after orphan handling)
  const paintRangeStart = extendLeft;
  const paintRangeEnd = extendRight;

  for (let i = 0; i < cellCount; i++) {
    const px = bounds.left + i * 8;
    const info = getBscBorderByteInfo(px, frameY);
    if (!info) continue;

    const colorChanged = cellColors[i] !== originalColors[i];

    // Only check mask for cells within the paint range
    const inPaintRange = i >= paintRangeStart && i <= paintRangeEnd;
    // Cell needs update if: color changed, OR it's in paint range and had no content
    const maskWasEmpty = inPaintRange && !cellHasContent[i];

    if (colorChanged || maskWasEmpty) {
      // Write the actual color (cellColors[i] is the paint color, not TRANSPARENT_COLOR)
      setBscBorderColor(info.byteOffset, info.halfIndex, cellColors[i]);
    }
  }
}

/**
 * Paints border area using current brush size.
 * Width is always 24px (3 cells), height = brushSize pixels.
 * @param {number} frameX - Center X coordinate
 * @param {number} frameY - Center Y coordinate
 * @param {number} color - Color value (0–7)
 */
function paintBorderWithBrush(frameX, frameY, color) {
  const halfHeight = Math.floor(brushSize / 2);

  // Paint multiple rows based on brush size
  for (let dy = -halfHeight; dy < brushSize - halfHeight; dy++) {
    const y = frameY + dy;
    // Use the original 24px-wide painting function for each row
    paintBscBorderCell(frameX, y, color);
  }
}

/**
 * Fills a rectangle on the border with a color.
 * Respects the 24px minimum width constraint (8/16px allowed at edges).
 * Skips main screen area automatically.
 * @param {number} x0 - Start X coordinate (frame coords)
 * @param {number} y0 - Start Y coordinate (frame coords)
 * @param {number} x1 - End X coordinate (frame coords)
 * @param {number} y1 - End Y coordinate (frame coords)
 * @param {number} color - Color value (0–7)
 */
function fillBorderRect(x0, y0, x1, y1, color) {
  // Normalize coordinates and snap to 8px grid
  const minX = Math.floor(Math.min(x0, x1) / 8) * 8;
  const maxX = Math.floor(Math.max(x0, x1) / 8) * 8;
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  // Fill each row in the rectangle
  for (let y = minY; y <= maxY; y++) {
    // Determine which border regions this row has
    let regions = [];
    if (y < 64 || y >= 256) {
      // Top or bottom border - full width
      regions.push({ left: 0, right: 384 });
    } else {
      // Side borders - left and right separately
      regions.push({ left: 0, right: 64 });    // Left border
      regions.push({ left: 320, right: 384 }); // Right border
    }

    // Paint each region that intersects with the rectangle
    for (const bounds of regions) {
      // Calculate intersection of rectangle with this region
      const regionMinX = Math.max(minX, bounds.left);
      const regionMaxX = Math.min(maxX, bounds.right - 8);

      // Skip if no intersection
      if (regionMinX > regionMaxX) continue;

      let paintMinX = regionMinX;
      let paintMaxX = regionMaxX;

      // Calculate width in cells
      const widthCells = (paintMaxX - paintMinX) / 8 + 1;

      // Apply 24px (3 cells) minimum, unless at boundary
      if (widthCells < 3) {
        const touchesLeft = (paintMinX <= bounds.left);
        const touchesRight = (paintMaxX >= bounds.right - 8);

        if (!touchesLeft && !touchesRight) {
          // Not at boundary - expand to 24px (3 cells)
          const centerX = (paintMinX + paintMaxX) / 2;
          const centerCell = Math.floor(centerX / 8);
          paintMinX = Math.max((centerCell - 1) * 8, bounds.left);
          paintMaxX = Math.min((centerCell + 1) * 8, bounds.right - 8);

          // Ensure we have at least 3 cells after clamping
          if ((paintMaxX - paintMinX) / 8 + 1 < 3) {
            if (paintMinX === bounds.left) {
              paintMaxX = Math.min(bounds.left + 16, bounds.right - 8);
            } else {
              paintMinX = Math.max(bounds.right - 24, bounds.left);
            }
          }
        }
      }

      // Paint each 8px cell in the range
      for (let x = paintMinX; x <= paintMaxX; x += 8) {
        const cellX = x / 8;
        setBorderCellColor(cellX, y, color);
      }
    }
  }
}

/**
 * Handles mouse down on BSC border area.
 * @param {MouseEvent} event
 * @param {{type:'border', frameX:number, frameY:number, region:string, byteOffset:number, halfIndex:number}} bscCoords
 */
function handleBorderMouseDown(event, bscCoords) {
  // Color picker on border: pick border cell color to ink or paper
  if (currentTool === EDITOR.TOOL_COLOR_PICKER || (event.altKey && currentTool !== EDITOR.TOOL_RECT)) {
    const color = getBorderCellColor(bscCoords.frameX, bscCoords.frameY);
    if (color >= 0) {
      if (event.button !== 2) {
        editorInkColor = color;
      } else {
        editorPaperColor = color;
      }
      updateColorSelectors();
      editorRender();
    }
    return;
  }

  // Handle barcode capture mode - start drag
  if (barcodeCaptureSlot >= 0) {
    barcodeCaptureStart = { frameX: bscCoords.frameX, frameY: bscCoords.frameY };
    isBorderDrawing = true;
    editorRender();
    updateBscEditorInfo(bscCoords);
    return;
  }

  saveUndoState();

  // Handle barcode stamp mode
  if (barcodeMode && activeBarcode >= 0 && barcodes[activeBarcode]) {
    isBorderDrawing = true;
    lastBorderPos = { frameX: bscCoords.frameX, frameY: bscCoords.frameY };
    stampBarcode(bscCoords.frameX, bscCoords.frameY, activeBarcode);
    editorRender();
    updateBscEditorInfo(bscCoords);
    return;
  }

  // Left click = ink color, Right click = paper color
  const color = event.button !== 2 ? editorInkColor : editorPaperColor;

  // Handle flood fill on border
  if (currentTool === EDITOR.TOOL_FLOOD_FILL) {
    floodFillBorder(bscCoords.frameX, bscCoords.frameY, color);
    editorRender();
    updateBscEditorInfo(bscCoords);
    return;
  }

  // Handle rectangle tool on border
  if (currentTool === EDITOR.TOOL_RECT) {
    borderRectStart = { frameX: bscCoords.frameX, frameY: bscCoords.frameY };
    isBorderDrawing = true;
    editorRender();
    updateBscEditorInfo(bscCoords);
    return;
  }

  // Normal drawing mode - use brush size
  isBorderDrawing = true;
  lastBorderPos = { frameX: bscCoords.frameX, frameY: bscCoords.frameY };
  paintBorderWithBrush(bscCoords.frameX, bscCoords.frameY, color);
  editorRender();
  updateBscEditorInfo(bscCoords);
}

/**
 * Handles mouse move on BSC border area during drawing.
 * Uses Bresenham-style interpolation for smooth lines.
 * @param {MouseEvent} event
 * @param {{type:'border', frameX:number, frameY:number, region:string, byteOffset:number, halfIndex:number}} bscCoords
 */
function handleBorderMouseMove(event, bscCoords) {
  if (isBorderDrawing) {
    // Barcode capture mode: show preview
    if (barcodeCaptureSlot >= 0 && barcodeCaptureStart) {
      editorRender();
      drawBarcodeCapturePreview(barcodeCaptureStart.frameX, barcodeCaptureStart.frameY, bscCoords.frameX, bscCoords.frameY);
      updateBscEditorInfo(bscCoords);
      return;
    }

    // Rectangle tool: just update preview, don't draw yet
    if (currentTool === EDITOR.TOOL_RECT && borderRectStart) {
      editorRender();
      drawBorderRectPreview(borderRectStart.frameX, borderRectStart.frameY, bscCoords.frameX, bscCoords.frameY);
      updateBscEditorInfo(bscCoords);
      return;
    }

    // Barcode stamp mode: stamp on drag
    if (barcodeMode && activeBarcode >= 0 && barcodes[activeBarcode]) {
      stampBarcode(bscCoords.frameX, bscCoords.frameY, activeBarcode);
      lastBorderPos = { frameX: bscCoords.frameX, frameY: bscCoords.frameY };
      editorRender();
      updateBscEditorInfo(bscCoords);
      return;
    }

    const color = (event.buttons & 2) !== 0 ? editorPaperColor : editorInkColor;

    if (lastBorderPos) {
      // Interpolate between last position and current position
      const x0 = lastBorderPos.frameX;
      const y0 = lastBorderPos.frameY;
      const x1 = bscCoords.frameX;
      const y1 = bscCoords.frameY;

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let x = x0;
      let y = y0;

      while (true) {
        paintBorderWithBrush(x, y, color);

        if (x === x1 && y === y1) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x += sx;
        }
        if (e2 < dx) {
          err += dx;
          y += sy;
        }
      }
    } else {
      paintBorderWithBrush(bscCoords.frameX, bscCoords.frameY, color);
    }

    lastBorderPos = { frameX: bscCoords.frameX, frameY: bscCoords.frameY };
    editorRender();
  }
  updateBscEditorInfo(bscCoords);
}

/**
 * Draws a preview rectangle on the border (overlay, not committed).
 * @param {number} x0 - Start X (frame coords)
 * @param {number} y0 - Start Y (frame coords)
 * @param {number} x1 - End X (frame coords)
 * @param {number} y1 - End Y (frame coords)
 */
function drawBorderRectPreview(x0, y0, x1, y1) {
  if (!screenCanvas) return;
  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  // Draw preview rectangle outline
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX * zoom + 0.5, minY * zoom + 0.5, (maxX - minX + 1) * zoom - 1, (maxY - minY + 1) * zoom - 1);
  ctx.setLineDash([]);

  // Draw semi-transparent fill preview
  ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
  ctx.fillRect(minX * zoom, minY * zoom, (maxX - minX + 1) * zoom, (maxY - minY + 1) * zoom);
}

/**
 * Handles mouse up on BSC border area.
 * @param {MouseEvent} [event] - Mouse event (optional, for getting button state)
 */
function handleBorderMouseUp(event) {
  // Handle barcode capture completion
  if (barcodeCaptureSlot >= 0 && barcodeCaptureStart && isBorderDrawing) {
    const bsc = event ? canvasToBscCoords(screenCanvas, event) : null;
    if (bsc && bsc.type === 'border') {
      captureBarcodeRegion(
        barcodeCaptureStart.frameX, barcodeCaptureStart.frameY,
        bsc.frameX, bsc.frameY,
        barcodeCaptureSlot
      );
      editorRender();
    }
    barcodeCaptureSlot = -1;
    barcodeCaptureStart = null;
    // Restore cursor after capture mode ends
    if (screenCanvas) {
      screenCanvas.style.cursor = brushPreviewMode ? 'none' : 'crosshair';
    }
  }

  // Handle rectangle tool completion
  if (currentTool === EDITOR.TOOL_RECT && borderRectStart && isBorderDrawing) {
    const bsc = event ? canvasToBscCoords(screenCanvas, event) : null;
    if (bsc) {
      // Get frame coordinates - works for both border and main area
      // fillBorderRect will skip main screen pixels automatically
      const endX = bsc.type === 'border' ? bsc.frameX : (bsc.x + 64);
      const endY = bsc.type === 'border' ? bsc.frameY : (bsc.y + 64);
      const color = (event && event.button === 2) ? editorPaperColor : editorInkColor;
      fillBorderRect(borderRectStart.frameX, borderRectStart.frameY, endX, endY, color);
      editorRender();
    }
    borderRectStart = null;
  }

  isBorderDrawing = false;
  lastBorderPos = null;
}

// ============================================================================
// Barcode Functions (Border Patterns)
// ============================================================================

/**
 * Captures a barcode pattern from a region on the border.
 * @param {number} x0 - Start X coordinate
 * @param {number} y0 - Start Y coordinate
 * @param {number} x1 - End X coordinate
 * @param {number} y1 - End Y coordinate
 * @param {number} slot - Barcode slot (0-7)
 */
function captureBarcodeRegion(x0, y0, x1, y1, slot) {
  if (slot < 0 || slot >= 8 || !screenData) return;

  // Use start position (x0, y0) as anchor for width calculation
  // Y coordinates are normalized (min/max) for the capture range
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  const height = maxY - minY + 1;
  if (height < 2) return; // Minimum 2 pixels height

  // Determine width based on START position (x0), not minX
  const bounds = getBorderRegionBounds(y0, x0);
  if (!bounds) return;

  const snappedX = Math.floor(x0 / 8) * 8;
  const cellX = snappedX / 8;
  const regionLeftCell = bounds.left / 8;
  const regionRightCell = bounds.right / 8;
  const posInRegion = cellX - regionLeftCell;
  const regionWidth = regionRightCell - regionLeftCell;

  // Determine width: 8px at edges, 24px in middle, 16px one cell from edge
  let widthCells;
  if (posInRegion === 0 || posInRegion === regionWidth - 1) {
    widthCells = 1; // 8px at edge
  } else if (posInRegion === 1 || posInRegion === regionWidth - 2) {
    widthCells = 2; // 16px one cell from edge
  } else {
    widthCells = 3; // 24px in middle
  }

  // Start capture from clicked cell (no centering)
  let startCellX = cellX;
  // Clamp to region bounds
  if (startCellX + widthCells > regionRightCell) {
    startCellX = regionRightCell - widthCells;
  }
  startCellX = Math.max(startCellX, regionLeftCell);

  const width = widthCells * 8;
  const colors = new Uint8Array(height * widthCells);

  // Capture colors for each row (with transparency support)
  const borderOffset = getBorderDataOffset();
  // Get the active layer for transparency detection and color reading
  const activeLayer = layersEnabled && layers.length > 0 ? layers[activeLayerIndex] : null;
  const layerBorderMask = activeLayer && activeLayer.borderMask ? activeLayer.borderMask : null;
  const layerBorderData = activeLayer && activeLayer.borderData ? activeLayer.borderData : null;
  const captureFromLayer = activeLayerIndex > 0 && layerBorderMask && layerBorderData;

  for (let y = 0; y < height; y++) {
    const captureY = minY + y;
    if (captureY >= BSC.FRAME_HEIGHT) break;

    for (let c = 0; c < widthCells; c++) {
      const px = (startCellX + c) * 8;
      const info = getBscBorderByteInfo(px, captureY);

      if (captureFromLayer && info) {
        // Capture from active layer (non-background)
        const relOffset = info.byteOffset - borderOffset;
        const maskIdx = relOffset * 2 + info.halfIndex;

        if (maskIdx >= 0 && maskIdx < layerBorderMask.length && layerBorderMask[maskIdx] === 0) {
          // Transparent pixel on this layer
          colors[y * widthCells + c] = BARCODE_TRANSPARENT;
          continue;
        }

        // Read color from layer's border data
        if (relOffset >= 0 && relOffset < layerBorderData.length) {
          const byte = layerBorderData[relOffset];
          const color = info.halfIndex === 0 ? (byte & 0x07) : ((byte >> 3) & 0x07);
          colors[y * widthCells + c] = color;
          continue;
        }
      }

      // Fallback: read from flattened screen data (background layer or no layers)
      const color = getBorderCellColor(px, captureY);
      colors[y * widthCells + c] = color >= 0 ? color : 0;
    }
  }

  barcodes[slot] = { width, height, colors };
  renderBarcodeSlot(slot);
  saveBarcodes(); // Persist to localStorage

  // Show info
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = `Captured barcode ${slot + 1}: ${width}×${height}px`;
  }
}

/**
 * Draws barcode capture preview rectangle.
 * @param {number} x0 - Start X
 * @param {number} y0 - Start Y
 * @param {number} x1 - End X
 * @param {number} y1 - End Y
 */
function drawBarcodeCapturePreview(x0, y0, x1, y1) {
  if (!screenCanvas) return;
  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  // Use start position (x0, y0) as anchor for width calculation
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  // Calculate actual capture width based on START position (x0), not minX
  const bounds = getBorderRegionBounds(y0, x0);
  if (!bounds) return;

  const snappedX = Math.floor(x0 / 8) * 8;
  const cellX = snappedX / 8;
  const regionLeftCell = bounds.left / 8;
  const regionRightCell = bounds.right / 8;
  const posInRegion = cellX - regionLeftCell;
  const regionWidth = regionRightCell - regionLeftCell;

  let widthCells;
  if (posInRegion === 0 || posInRegion === regionWidth - 1) {
    widthCells = 1;
  } else if (posInRegion === 1 || posInRegion === regionWidth - 2) {
    widthCells = 2;
  } else {
    widthCells = 3;
  }

  // Start capture from clicked cell (no centering)
  let startCellX = cellX;
  // Clamp to region bounds
  if (startCellX + widthCells > regionRightCell) {
    startCellX = regionRightCell - widthCells;
  }
  startCellX = Math.max(startCellX, regionLeftCell);

  const previewX = startCellX * 8;
  const previewWidth = widthCells * 8;

  // Draw preview rectangle (cyan for capture)
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(previewX * zoom + 0.5, minY * zoom + 0.5, previewWidth * zoom - 1, (maxY - minY + 1) * zoom - 1);
  ctx.setLineDash([]);

  // Draw semi-transparent fill
  ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
  ctx.fillRect(previewX * zoom, minY * zoom, previewWidth * zoom, (maxY - minY + 1) * zoom);
}

/**
 * Stamps a barcode pattern onto the border at the given position.
 * @param {number} frameX - Frame X coordinate
 * @param {number} frameY - Frame Y coordinate (top of stamp)
 * @param {number} slot - Barcode slot (0-7)
 */
function stampBarcode(frameX, frameY, slot) {
  if (slot < 0 || slot >= 8 || !barcodes[slot] || !screenData) return;

  const barcode = barcodes[slot];
  const widthCells = barcode.width / 8;

  // Snap to 8px grid
  const snappedX = Math.floor(frameX / 8) * 8;
  const startCellX = snappedX / 8;

  // Stamp each row
  for (let y = 0; y < barcode.height; y++) {
    const stampY = frameY + y;
    if (stampY >= BSC.FRAME_HEIGHT) break;

    for (let c = 0; c < widthCells; c++) {
      const cellX = startCellX + c;
      const color = barcode.colors[y * widthCells + c];
      // Skip transparent pixels
      if (color === BARCODE_TRANSPARENT) continue;
      setBorderCellColor(cellX, stampY, color);
    }
  }
}

/**
 * Renders a barcode slot preview.
 * @param {number} slot - Barcode slot (0-7)
 */
function renderBarcodeSlot(slot) {
  const canvas = document.getElementById(`barcode${slot}`);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear
  ctx.fillStyle = getCSSVar('--bg-tertiary', '#222');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const barcode = barcodes[slot];
  if (!barcode) return;

  const widthCells = barcode.width / 8;
  const cellWidth = canvas.width / 3; // Max 3 cells (24px)
  const scaleY = canvas.height / barcode.height;

  // Center if narrower than 3 cells
  const offsetX = (3 - widthCells) * cellWidth / 2;

  const cbLight = getCSSVar('--checkerboard-light', '#444');
  const cbDark = getCSSVar('--checkerboard-dark', '#333');

  // Draw each row
  for (let y = 0; y < barcode.height; y++) {
    for (let c = 0; c < widthCells; c++) {
      const color = barcode.colors[y * widthCells + c];
      const cellX = offsetX + c * cellWidth;
      const cellY = y * scaleY;

      if (color === BARCODE_TRANSPARENT) {
        // Draw checkerboard pattern for transparent pixels
        const checkSize = Math.max(2, Math.floor(cellWidth / 4));
        for (let cy = 0; cy < scaleY + 1; cy += checkSize) {
          for (let cx = 0; cx < cellWidth; cx += checkSize) {
            const isLight = ((Math.floor(cx / checkSize) + Math.floor(cy / checkSize)) % 2) === 0;
            ctx.fillStyle = isLight ? cbLight : cbDark;
            ctx.fillRect(cellX + cx, cellY + cy, checkSize, checkSize);
          }
        }
      } else {
        const rgb = ZX_PALETTE_RGB.REGULAR[color] || [0, 0, 0];
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(cellX, cellY, cellWidth, scaleY + 1);
      }
    }
  }
}

/**
 * Renders all barcode slot previews.
 */
function renderAllBarcodeSlots() {
  for (let i = 0; i < 8; i++) {
    renderBarcodeSlot(i);
  }
}

/**
 * Selects a barcode slot.
 * @param {number} slot - Barcode slot (0-7), or -1 to deselect
 */
function selectBarcode(slot) {
  activeBarcode = slot;
  barcodeMode = slot >= 0 && barcodes[slot] !== null;

  // Update cursor: hide when in barcode stamp mode to show barcode preview
  if (screenCanvas) {
    if (barcodeMode) {
      screenCanvas.style.cursor = 'none';
    } else {
      screenCanvas.style.cursor = brushPreviewMode ? 'none' : 'crosshair';
    }
  }

  // Update UI selection
  for (let i = 0; i < 8; i++) {
    const canvas = document.getElementById(`barcode${i}`);
    if (canvas) {
      canvas.classList.toggle('selected', i === slot);
    }
  }
}

/**
 * Clears a barcode slot.
 * @param {number} slot - Barcode slot (0-7)
 */
function clearBarcode(slot) {
  if (slot < 0 || slot >= 8) return;
  barcodes[slot] = null;
  renderBarcodeSlot(slot);
  saveBarcodes(); // Persist to localStorage
  if (activeBarcode === slot) {
    selectBarcode(-1);
  }
}

/**
 * Initializes the barcode UI.
 */
function initBarcodeUI() {
  // Collapsible header
  const header = document.getElementById('barcodeHeader');
  const controls = document.getElementById('barcodeControls');
  const expandIcon = document.getElementById('barcodeExpandIcon');

  header?.addEventListener('click', (e) => {
    // Don't toggle if clicking save/load buttons
    if (/** @type {HTMLElement} */ (e.target).closest('button')) return;

    const isHidden = controls?.style.display === 'none';
    if (controls) controls.style.display = isHidden ? '' : 'none';
    if (expandIcon) expandIcon.textContent = isHidden ? '▼' : '▶';
  });

  // Barcode slot click handlers
  for (let i = 0; i < 8; i++) {
    const canvas = document.getElementById(`barcode${i}`);
    canvas?.addEventListener('click', (e) => {
      if (e.shiftKey) {
        // Shift+click: start capture mode (need to click on border)
        startBarcodeCapture(i);
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl+click: clear slot
        clearBarcode(i);
      } else {
        // Normal click: select/deselect slot
        if (activeBarcode === i) {
          selectBarcode(-1); // Deselect if already selected
        } else {
          selectBarcode(i);
        }
      }
    });
  }

  // Save/load buttons
  document.getElementById('saveBarcodesBtn')?.addEventListener('click', exportBarcodes);
  document.getElementById('loadBarcodesBtn')?.addEventListener('click', () => {
    document.getElementById('barcodesFileInput')?.click();
  });
  document.getElementById('barcodesFileInput')?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) loadBarcodesFromFile(file);
  });

  // Load barcodes from localStorage or default file
  loadBarcodes();
}

/** @type {number} - Slot being captured for barcode */
let barcodeCaptureSlot = -1;

/** @type {{frameX: number, frameY: number}|null} - Start point for barcode capture drag */
let barcodeCaptureStart = null;

/**
 * Starts barcode capture mode.
 * @param {number} slot - Barcode slot (0-7)
 */
function startBarcodeCapture(slot) {
  barcodeCaptureSlot = slot;
  barcodeCaptureStart = null;
  // Set cursor to crosshair for capture mode
  if (screenCanvas) {
    screenCanvas.style.cursor = 'crosshair';
  }
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = `Drag on border to capture barcode ${slot + 1}`;
  }
}

/**
 * Saves barcodes to localStorage for persistence.
 */
function saveBarcodes() {
  const data = [];
  for (let i = 0; i < 8; i++) {
    if (barcodes[i]) {
      data.push({
        slot: i,
        width: barcodes[i].width,
        height: barcodes[i].height,
        colors: Array.from(barcodes[i].colors)
      });
    }
  }
  localStorage.setItem('spectraLabBarcodes', JSON.stringify(data));
}

/**
 * Exports all barcodes to a .slbc file.
 */
function exportBarcodes() {
  const data = [];
  for (let i = 0; i < 8; i++) {
    if (barcodes[i]) {
      data.push({
        slot: i,
        width: barcodes[i].width,
        height: barcodes[i].height,
        colors: Array.from(barcodes[i].colors)
      });
    }
  }

  if (data.length === 0) {
    alert('No barcodes to save');
    return;
  }

  const json = JSON.stringify(data);
  downloadFile(json, 'barcodes.slbc', 'application/json');
}

/**
 * Parses barcode data array and populates the barcodes slots.
 * @param {Array} data - Array of barcode objects
 */
function parseBarcodeArray(data) {
  if (!Array.isArray(data)) return;

  for (const item of data) {
    if (item.slot >= 0 && item.slot < 8 && item.colors) {
      barcodes[item.slot] = {
        width: item.width,
        height: item.height,
        colors: new Uint8Array(item.colors)
      };
    }
  }
}

/**
 * Loads barcodes from a .slbc file.
 * @param {File} file - The file to load
 */
function loadBarcodesFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(/** @type {string} */ (e.target?.result));
      parseBarcodeArray(data);
      saveBarcodes(); // Persist to localStorage
      renderAllBarcodeSlots();
    } catch (err) {
      alert('Failed to load barcodes: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/**
 * Loads barcodes from localStorage, or from brushes/barcodes.slbc if localStorage is empty
 */
function loadBarcodes() {
  const raw = localStorage.getItem('spectraLabBarcodes');
  if (raw) {
    // Load from localStorage
    try {
      const arr = JSON.parse(raw);
      parseBarcodeArray(arr);
    } catch (e) {
      // Ignore corrupt data
    }
    renderAllBarcodeSlots();
  } else {
    // Try to load default barcodes from file
    fetch('brushes/barcodes.slbc')
      .then(response => {
        if (!response.ok) throw new Error('Not found');
        return response.text();
      })
      .then(text => {
        const arr = JSON.parse(text);
        parseBarcodeArray(arr);
        renderAllBarcodeSlots();
      })
      .catch(() => {
        // No default barcodes file, that's fine
      });
  }
}

/**
 * Shows or hides barcode section based on format.
 */
function updateBarcodeVisibility() {
  const section = document.getElementById('barcodeSection');
  if (section) {
    section.style.display = isBorderFormatEditor() ? '' : 'none';
  }
}

/**
 * Updates info panel for BSC border coordinates.
 * @param {{type:'border', frameX:number, frameY:number, region:string, byteOffset:number, halfIndex:number}} bscCoords
 */
function updateBscEditorInfo(bscCoords) {
  const infoEl = document.getElementById('editorPositionInfo');
  if (!infoEl || !screenData) return;

  const byte = screenData[bscCoords.byteOffset];
  const segColor = bscCoords.halfIndex === 0 ? (byte & 0x07) : ((byte >> 3) & 0x07);

  infoEl.innerHTML =
    `Frame: (${bscCoords.frameX}, ${bscCoords.frameY})<br>` +
    `Border: ${bscCoords.region} — ${COLOR_NAMES[segColor]}`;
}

/**
 * Enables or disables the editor based on picture state and format.
 * Called automatically when pictures are loaded or created.
 */
function updateEditorState() {
  // SPECSCII stream can be empty (all spaces), so allow length 0 for that format
  const canEdit = screenData && (screenData.length > 0 || currentFormat === FORMAT.SPECSCII) && isFormatEditable();

  if (canEdit && !editorActive) {
    setEditorEnabled(true);
  } else if (!canEdit && editorActive) {
    setEditorEnabled(false);
  } else if (canEdit && editorActive) {
    // Editor already active but format may have changed — re-run full setup
    setEditorEnabled(true, true);
  }
}

/**
 * Sets the editor enabled state directly.
 * @param {boolean} active - Whether to enable the editor
 */
function setEditorEnabled(active, force) {
  if (active === editorActive && !force) return;

  editorActive = active;

  const overlay = document.getElementById('scrEditorOverlay');
  if (overlay) overlay.classList.toggle('active', editorActive);

  const inactiveHint = document.getElementById('editorInactiveHint');
  if (inactiveHint) inactiveHint.style.display = editorActive ? 'none' : '';

  // Transform tab controls
  const transformControls = document.getElementById('transformControls');
  const transformInactiveHint = document.getElementById('transformInactiveHint');
  if (transformControls) transformControls.style.display = editorActive ? '' : 'none';
  if (transformInactiveHint) transformInactiveHint.style.display = editorActive ? 'none' : '';

  // Hide Generate/QR section for formats that don't support it
  const generateSection = document.getElementById('generateSection');
  if (generateSection) {
    const hideGenerate = currentFormat === FORMAT.SPECSCII || currentFormat === FORMAT.ATTR_53C || currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD;
    generateSection.style.display = hideGenerate ? 'none' : '';
  }

  if (screenCanvas) {
    if (editorActive) {
      screenCanvas.style.cursor = brushPreviewMode ? 'none' : 'crosshair';
    } else {
      screenCanvas.style.cursor = 'default';
      brushPreviewMode = false;  // Reset brush preview when editor disabled
      brushPreviewPos = null;
      borderPreviewPos = null;
    }
  }

  const toolsSection = document.getElementById('editorToolsSection');
  const brushSection = document.getElementById('editorBrushSection');
  const clipboardSection = document.getElementById('editorClipboardSection');

  if (editorActive) {
    screenCanvas.addEventListener('mousedown', handleEditorMouseDown);
    screenCanvas.addEventListener('mousemove', handleEditorMouseMove);
    screenCanvas.addEventListener('mouseup', handleEditorMouseUp);
    screenCanvas.addEventListener('mouseleave', handleEditorMouseUp);
    screenCanvas.addEventListener('contextmenu', handleContextMenu);

    // Update palette swatches with current palette colors
    updateColorPreview();

    // Clipboard section: always visible when editor is active
    if (clipboardSection) clipboardSection.style.display = '';

    const snapSelect = document.getElementById('editorSnapMode');
    const exportAsmBtn = document.getElementById('editorExportAsmBtn');
    // SPECSCII palette section
    const specsciiSection = document.getElementById('editorSpecsciiSection');

    if (currentFormat === FORMAT.ATTR_53C) {
      // .53c editor: show tools, hide brush/snap (always grid)
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = 'none';
      if (snapSelect) snapSelect.parentElement.style.display = 'none';
      if (specsciiSection) specsciiSection.style.display = 'none';

      // Hide tools not applicable to 53c: airbrush, gradient, text
      const attr53cHiddenTools = ['airbrush', 'gradient', 'text', 'fillcell'];
      (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
        const tool = /** @type {HTMLElement} */ (btn).dataset.tool;
        if (attr53cHiddenTools.includes(tool)) {
          /** @type {HTMLElement} */ (btn).style.display = 'none';
        }
      });
      if (attr53cHiddenTools.includes(currentTool)) {
        setEditorTool(EDITOR.TOOL_PIXEL);
      }
    } else if (currentFormat === FORMAT.SPECSCII) {
      // SPECSCII editor: show tools, hide brush/snap, show character palette
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = 'none';
      if (snapSelect) snapSelect.parentElement.style.display = 'none';
      if (specsciiSection) specsciiSection.style.display = '';

      // Hide tools not applicable to SPECSCII: airbrush, gradient, fill cell
      const specsciiHiddenTools = ['airbrush', 'gradient', 'fillcell'];
      (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
        const tool = /** @type {HTMLElement} */ (btn).dataset.tool;
        if (specsciiHiddenTools.includes(tool)) {
          /** @type {HTMLElement} */ (btn).style.display = 'none';
        }
      });
      // If current tool is unavailable, switch to pixel
      if (specsciiHiddenTools.includes(currentTool)) {
        setEditorTool(EDITOR.TOOL_PIXEL);
      }

      // Limit brush paint modes to set/invert/recolor
      const paintMode = /** @type {HTMLSelectElement|null} */ (document.getElementById('brushPaintMode'));
      if (paintMode) {
        for (let i = 0; i < paintMode.options.length; i++) {
          const val = paintMode.options[i].value;
          paintMode.options[i].style.display = (val === 'set' || val === 'invert' || val === 'recolor') ? '' : 'none';
        }
        // If current mode is not available, switch to set
        if (paintMode.value !== 'set' && paintMode.value !== 'invert' && paintMode.value !== 'recolor') {
          paintMode.value = 'set';
          brushPaintMode = 'set';
        }
      }

      // Initialize grids from stream if needed (fallback — normally done in switchToPicture)
      if (!specsciiCharGrid) {
        specsciiStreamToGrids();
      }
      renderSpecsciiPalette();
      updateSpecsciiCharInfo();
    } else if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD) {
      // NXI/SL2/LoRes editor: show tools and brush section, hide inapplicable tools
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = '';
      if (snapSelect) snapSelect.parentElement.style.display = 'none';
      if (specsciiSection) specsciiSection.style.display = 'none';

      // Hide tools not applicable to indexed-color: fillcell, recolor, text, select
      const nxiHiddenTools = ['fillcell', 'recolor', 'text', 'select'];
      (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
        const tool = /** @type {HTMLElement} */ (btn).dataset.tool;
        /** @type {HTMLElement} */ (btn).style.display = nxiHiddenTools.includes(tool) ? 'none' : '';
      });
      if (nxiHiddenTools.includes(currentTool)) {
        setEditorTool(EDITOR.TOOL_PIXEL);
      }

      // Limit brush paint modes to set/replace
      const paintMode = /** @type {HTMLSelectElement|null} */ (document.getElementById('brushPaintMode'));
      if (paintMode) {
        for (let i = 0; i < paintMode.options.length; i++) {
          const val = paintMode.options[i].value;
          paintMode.options[i].style.display = (val === 'set' || val === 'replace') ? '' : 'none';
        }
        if (paintMode.value !== 'set' && paintMode.value !== 'replace') {
          paintMode.value = 'set';
          brushPaintMode = 'set';
        }
      }
    } else {
      // SCR editor: show everything
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = '';
      if (snapSelect) snapSelect.parentElement.style.display = '';
      if (specsciiSection) specsciiSection.style.display = 'none';

      // Restore all tool buttons (may have been hidden by SPECSCII mode)
      (editorToolButtons || document.querySelectorAll('.editor-tool-btn[data-tool]')).forEach(btn => {
        /** @type {HTMLElement} */ (btn).style.display = '';
      });

      // Restore all brush paint mode options
      const paintMode = /** @type {HTMLSelectElement|null} */ (document.getElementById('brushPaintMode'));
      if (paintMode) {
        for (let i = 0; i < paintMode.options.length; i++) {
          paintMode.options[i].style.display = '';
        }
      }
    }
    // Show Export ASM button for BSC, Gigascreen, and RGB3 formats
    updateExportAsmButton();

    // Gigascreen: initialize virtual palette and show virtual color picker
    if (isGigascreenEditable()) {
      generateGigascreenVirtualPalette();
      updateGigascreenColorPickerUI();
    }
    toggleGigascreenColorPicker(isGigascreenEditable());

    // 53c: initialize pattern color palette and show picker
    if (currentFormat === FORMAT.ATTR_53C) {
      build53cPalette();
    }
    toggle53cColorPicker(currentFormat === FORMAT.ATTR_53C);

    // RGB3: initialize dedicated color palette
    if (currentFormat === FORMAT.RGB3) {
      buildRgb3Palette();
    }
    toggleRgb3ColorPicker(currentFormat === FORMAT.RGB3);

    // Restore standard palette when no specialized section is active
    if (currentFormat !== FORMAT.ATTR_53C && !isGigascreenEditable() && currentFormat !== FORMAT.RGB3 &&
        currentFormat !== FORMAT.NXI && currentFormat !== FORMAT.SL2) {
      const s = document.getElementById('editorColorSection');
      if (s) s.style.display = '';
    }
    toggleNxiColorPicker(currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD);
    if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD) buildNxiPalette();

    // Update convert dropdown options
    updateConvertOptions();
    toggleLayerSectionVisibility();
    updateLayerPanel();
    showPreviewPanel();
  } else {
    // Cancel selection/paste on editor exit
    selectionStartPoint = null;
    selectionEndPoint = null;
    isSelecting = false;
    isPasting = false;

    // Clear transform selection state
    transformSelectActive = false;
    transformSelectionRect = null;
    const transformSelectBtn = document.getElementById('transformSelectBtn');
    if (transformSelectBtn) transformSelectBtn.classList.remove('selected');
    updateTransformSectionsVisibility();

    screenCanvas.removeEventListener('mousedown', handleEditorMouseDown);
    screenCanvas.removeEventListener('mousemove', handleEditorMouseMove);
    screenCanvas.removeEventListener('mouseup', handleEditorMouseUp);
    screenCanvas.removeEventListener('mouseleave', handleEditorMouseUp);
    screenCanvas.removeEventListener('contextmenu', handleContextMenu);

    // Restore all sections visibility
    if (toolsSection) toolsSection.style.display = '';
    if (brushSection) brushSection.style.display = '';
    if (clipboardSection) clipboardSection.style.display = '';
    const exportAsmBtn = document.getElementById('editorExportAsmBtn');
    if (exportAsmBtn) exportAsmBtn.style.display = 'none';
    const specsciiSection = document.getElementById('editorSpecsciiSection');
    if (specsciiSection) specsciiSection.style.display = 'none';
    hidePreviewPanel();
  }
}

// ============================================================================
// Custom Brushes
// ============================================================================

/**
 * Starts capturing a rectangular region from the screen into a custom brush slot
 * @param {number} slot - Slot index (0-11)
 */
function startBrushCapture(slot) {
  capturingBrush = true;
  captureSlot = slot;
  captureStartPoint = null;
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = 'Click first corner of brush region (max 64\u00d764)';
  }
}

/**
 * Finishes capturing a rectangular region from the screen
 * @param {number} x0 - First corner X
 * @param {number} y0 - First corner Y
 * @param {number} x1 - Second corner X
 * @param {number} y1 - Second corner Y
 */
function finishBrushCapture(x0, y0, x1, y1) {
  if (!screenData || !isFormatEditable()) return;

  // Normalize rectangle
  let left = Math.min(x0, x1);
  let top = Math.min(y0, y1);
  let right = Math.max(x0, x1);
  let bottom = Math.max(y0, y1);

  // Clamp to screen bounds
  const width = getFormatWidth();
  const height = getFormatHeight();
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(width - 1, right);
  bottom = Math.min(height - 1, bottom);

  // Limit to 64x64
  let bw = right - left + 1;
  let bh = bottom - top + 1;
  if (bw > 64) { right = left + 63; bw = 64; }
  if (bh > 64) { bottom = top + 63; bh = 64; }

  const bytesPerRow = Math.ceil(bw / 8);
  const data = new Uint8Array(bytesPerRow * bh);
  const mask = new Uint8Array(bytesPerRow * bh);

  // Check if we should capture from active layer with transparency
  const useLayerMask = layersEnabled && layers.length > 0 && activeLayerIndex > 0 && layers[activeLayerIndex];
  const layer = useLayerMask ? layers[activeLayerIndex] : null;

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      const px = left + c;
      const py = top + r;
      const byteIdx = r * bytesPerRow + Math.floor(c / 8);
      const bitIdx = 7 - (c % 8);

      if (useLayerMask && layer) {
        // Capture from layer with transparency
        const maskIdx = py * width + px;
        const bitmapAddr = getBitmapAddress(px, py);
        const bitmapBit = 0x80 >> (px % 8);

        // Copy bitmap bit
        if (layer.bitmap[bitmapAddr] & bitmapBit) {
          data[byteIdx] |= (1 << bitIdx);
        }
        // Copy mask bit (visible = 1)
        if (layer.mask[maskIdx]) {
          mask[byteIdx] |= (1 << bitIdx);
        }
      } else {
        // Capture from merged screen (no transparency, all visible)
        if (getPixel(screenData, px, py)) {
          data[byteIdx] |= (1 << bitIdx);
        }
        // All pixels visible when capturing from background or merged screen
        mask[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  // Only include mask if it has transparent pixels
  const hasTransparency = mask.some((byte, i) => byte !== 0xFF && (i < bytesPerRow * bh));
  customBrushes[captureSlot] = hasTransparency
    ? { width: bw, height: bh, data: data, mask: mask }
    : { width: bw, height: bh, data: data };

  capturingBrush = false;
  captureStartPoint = null;
  selectCustomBrush(captureSlot);
  renderCustomBrushPreview(captureSlot);
  saveCustomBrushes();
  updateCustomBrushIndicator();
}

/**
 * Starts capturing a tileset from a rectangular region on the screen
 */
function startTilesetCapture() {
  if (brushTabs.length >= 8) {
    alert('Maximum 8 tabs allowed. Please close a tab first.');
    return;
  }
  capturingTileset = true;
  tilesetCaptureStart = null;
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = 'Click first corner of tileset region (will snap to 8px grid)';
  }
}

/**
 * Finishes capturing a tileset from a rectangular region
 * @param {number} x0 - First corner X
 * @param {number} y0 - First corner Y
 * @param {number} x1 - Second corner X
 * @param {number} y1 - Second corner Y
 */
function finishTilesetCapture(x0, y0, x1, y1) {
  if (!screenData || !isFormatEditable()) return;

  // Normalize and snap to 8px grid
  let left = Math.floor(Math.min(x0, x1) / 8) * 8;
  let top = Math.floor(Math.min(y0, y1) / 8) * 8;
  let right = Math.ceil((Math.max(x0, x1) + 1) / 8) * 8 - 1;
  let bottom = Math.ceil((Math.max(y0, y1) + 1) / 8) * 8 - 1;

  // Clamp to screen bounds
  const screenWidth = getFormatWidth();
  const screenHeight = getFormatHeight();
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(screenWidth - 1, right);
  bottom = Math.min(screenHeight - 1, bottom);

  // Calculate dimensions in tiles
  const pixelWidth = right - left + 1;
  const pixelHeight = bottom - top + 1;
  const tilesX = Math.floor(pixelWidth / 8);
  const tilesY = Math.floor(pixelHeight / 8);
  const totalTiles = tilesX * tilesY;

  if (totalTiles === 0) {
    capturingTileset = false;
    tilesetCaptureStart = null;
    editorRender(); // Clear the capture preview rectangle
    const infoEl = document.getElementById('editorPositionInfo');
    if (infoEl) infoEl.innerHTML = '';
    return;
  }

  // Determine tileset size: 96 if <=96 tiles, 256 otherwise
  const tileCount = totalTiles > 96 ? 256 : 96;
  const tilesetData = new Uint8Array(tileCount * 8);

  // Grab tiles from top-left, reading horizontally
  let tileIdx = 0;
  for (let ty = 0; ty < tilesY && tileIdx < tileCount; ty++) {
    for (let tx = 0; tx < tilesX && tileIdx < tileCount; tx++) {
      const tileLeft = left + tx * 8;
      const tileTop = top + ty * 8;

      // Read 8 rows of 8 pixels for this tile
      for (let row = 0; row < 8; row++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const px = tileLeft + bit;
          const py = tileTop + row;
          if (getPixel(screenData, px, py)) {
            byte |= (0x80 >> bit);
          }
        }
        tilesetData[tileIdx * 8 + row] = byte;
      }
      tileIdx++;
    }
  }

  // Create new tileset tab
  const name = 'Grab' + (brushTabs.length - 1);
  brushTabs.push({
    name: name.substring(0, 10),
    type: 'tileset',
    data: tilesetData,
    tileCount: tileCount
  });

  capturingTileset = false;
  tilesetCaptureStart = null;

  saveBrushTabsToStorage();
  selectBrushTab(brushTabs.length - 1);
  updateBrushTabBar();
  editorRender(); // Clear the capture preview rectangle

  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = `Captured ${Math.min(totalTiles, tileCount)} tiles (${tilesX}\u00d7${tilesY})`;
  }
}

/**
 * Draws tileset capture selection rectangle preview on canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function drawTilesetCapturePreview(x0, y0, x1, y1) {
  const ctx = screenCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  // Snap to 8px grid
  const left = Math.floor(Math.min(x0, x1) / 8) * 8;
  const top = Math.floor(Math.min(y0, y1) / 8) * 8;
  const right = Math.ceil((Math.max(x0, x1) + 1) / 8) * 8;
  const bottom = Math.ceil((Math.max(y0, y1) + 1) / 8) * 8;
  const w = right - left;
  const h = bottom - top;

  const tilesX = w / 8;
  const tilesY = h / 8;
  const totalTiles = tilesX * tilesY;

  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  ctx.strokeStyle = 'rgba(255, 200, 0, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + left * zoom,
    borderPixels + top * zoomY,
    w * zoom,
    h * zoomY
  );
  ctx.setLineDash([]);

  // Show tile count in info
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    const tileCount = totalTiles > 96 ? 256 : 96;
    infoEl.innerHTML = `${tilesX}\u00d7${tilesY} = ${totalTiles} tiles \u2192 ${tileCount}-tile set`;
  }
}

/**
 * Draws capture selection rectangle preview on canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function drawCapturePreview(x0, y0, x1, y1) {
  const ctx = screenCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.min(Math.abs(x1 - x0) + 1, 64);
  const h = Math.min(Math.abs(y1 - y0) + 1, 64);

  ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BRUSH_CAPTURE_COLOR) || 'rgba(0, 255, 128, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + left * zoom,
    borderPixels + top * zoomY,
    w * zoom,
    h * zoomY
  );
  ctx.setLineDash([]);
}

/**
 * Rotates the active custom brush 90 degrees clockwise
 */
function rotateCustomBrush() {
  // Support both custom brush slots and tile brushes
  let brush;
  const isTileBrush = activeCustomBrush === -2 && activeTileBrush;
  if (isTileBrush) {
    brush = activeTileBrush;
  } else if (activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
    brush = customBrushes[activeCustomBrush];
  } else {
    return;
  }
  const ow = brush.width;
  const oh = brush.height;
  const oldBpr = Math.ceil(ow / 8);
  // Rotated: new width = old height, new height = old width
  const nw = oh;
  const nh = ow;
  const newBpr = Math.ceil(nw / 8);
  const newData = new Uint8Array(newBpr * nh);
  const hasMask = brush.mask && brush.mask.length > 0;
  const newMask = hasMask ? new Uint8Array(newBpr * nh) : null;

  for (let r = 0; r < oh; r++) {
    for (let c = 0; c < ow; c++) {
      const oldIdx = r * oldBpr + Math.floor(c / 8);
      const oldBit = 7 - (c % 8);
      // (r, c) -> (c, oh - 1 - r)
      const nr = c;
      const nc = oh - 1 - r;
      const newIdx = nr * newBpr + Math.floor(nc / 8);
      const newBit = 7 - (nc % 8);

      if (brush.data[oldIdx] & (1 << oldBit)) {
        newData[newIdx] |= (1 << newBit);
      }
      if (hasMask && newMask && (brush.mask[oldIdx] & (1 << oldBit))) {
        newMask[newIdx] |= (1 << newBit);
      }
    }
  }

  brush.width = nw;
  brush.height = nh;
  brush.data = newData;
  if (hasMask && newMask) {
    brush.mask = newMask;
  }
  // Only update preview and save for custom brush slots, not tile brushes
  if (!isTileBrush) {
    renderCustomBrushPreview(activeCustomBrush);
    saveCustomBrushes();
  }
}

/**
 * Mirrors the active custom brush horizontally (left-right flip)
 */
function mirrorCustomBrushH() {
  // Support both custom brush slots and tile brushes
  let brush;
  const isTileBrush = activeCustomBrush === -2 && activeTileBrush;
  if (isTileBrush) {
    brush = activeTileBrush;
  } else if (activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
    brush = customBrushes[activeCustomBrush];
  } else {
    return;
  }
  const bw = brush.width;
  const bh = brush.height;
  const bpr = Math.ceil(bw / 8);
  const newData = new Uint8Array(bpr * bh);
  const hasMask = brush.mask && brush.mask.length > 0;
  const newMask = hasMask ? new Uint8Array(bpr * bh) : null;

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      const oldIdx = r * bpr + Math.floor(c / 8);
      const oldBit = 7 - (c % 8);
      const nc = bw - 1 - c;
      const newIdx = r * bpr + Math.floor(nc / 8);
      const newBit = 7 - (nc % 8);

      if (brush.data[oldIdx] & (1 << oldBit)) {
        newData[newIdx] |= (1 << newBit);
      }
      if (hasMask && newMask && (brush.mask[oldIdx] & (1 << oldBit))) {
        newMask[newIdx] |= (1 << newBit);
      }
    }
  }

  brush.data = newData;
  if (hasMask && newMask) {
    brush.mask = newMask;
  }
  if (!isTileBrush) {
    renderCustomBrushPreview(activeCustomBrush);
    saveCustomBrushes();
  }
}

/**
 * Mirrors the active custom brush vertically (top-bottom flip)
 */
function mirrorCustomBrushV() {
  // Support both custom brush slots and tile brushes
  let brush;
  const isTileBrush = activeCustomBrush === -2 && activeTileBrush;
  if (isTileBrush) {
    brush = activeTileBrush;
  } else if (activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
    brush = customBrushes[activeCustomBrush];
  } else {
    return;
  }
  const bw = brush.width;
  const bh = brush.height;
  const bpr = Math.ceil(bw / 8);
  const newData = new Uint8Array(bpr * bh);
  const hasMask = brush.mask && brush.mask.length > 0;
  const newMask = hasMask ? new Uint8Array(bpr * bh) : null;

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      const oldIdx = r * bpr + Math.floor(c / 8);
      const oldBit = 7 - (c % 8);
      const nr = bh - 1 - r;
      const newIdx = nr * bpr + Math.floor(c / 8);
      const newBit = 7 - (c % 8);

      if (brush.data[oldIdx] & (1 << oldBit)) {
        newData[newIdx] |= (1 << newBit);
      }
      if (hasMask && newMask && (brush.mask[oldIdx] & (1 << oldBit))) {
        newMask[newIdx] |= (1 << newBit);
      }
    }
  }

  brush.data = newData;
  if (hasMask && newMask) {
    brush.mask = newMask;
  }
  if (!isTileBrush) {
    renderCustomBrushPreview(activeCustomBrush);
    saveCustomBrushes();
  }
}

/**
 * Rotates clipboard data 90 degrees clockwise
 */
function rotateClipboard() {
  if (!clipboardData) return;

  if (clipboardData.format === 'scr' && clipboardData.bitmap && clipboardData.width && clipboardData.height) {
    const ow = clipboardData.width;
    const oh = clipboardData.height;
    const nw = oh;
    const nh = ow;
    const oldBpr = Math.ceil(ow / 8);
    const newBpr = Math.ceil(nw / 8);
    const newBitmap = new Uint8Array(newBpr * nh);

    for (let r = 0; r < oh; r++) {
      for (let c = 0; c < ow; c++) {
        const oldIdx = r * oldBpr + Math.floor(c / 8);
        const oldBit = 7 - (c % 8);
        if (clipboardData.bitmap[oldIdx] & (1 << oldBit)) {
          const nr = c;
          const nc = oh - 1 - r;
          const newIdx = nr * newBpr + Math.floor(nc / 8);
          const newBit = 7 - (nc % 8);
          newBitmap[newIdx] |= (1 << newBit);
        }
      }
    }

    // Rotate attributes
    const oCols = clipboardData.cellCols;
    const oRows = clipboardData.cellRows;
    const nCols = oRows;
    const nRows = oCols;
    const newAttrs = new Uint8Array(nCols * nRows);
    for (let r = 0; r < oRows; r++) {
      for (let c = 0; c < oCols; c++) {
        newAttrs[c * nCols + (oRows - 1 - r)] = clipboardData.attrs[r * oCols + c];
      }
    }

    clipboardData.bitmap = newBitmap;
    clipboardData.width = nw;
    clipboardData.height = nh;
    clipboardData.cellCols = nCols;
    clipboardData.cellRows = nRows;
    clipboardData.attrs = newAttrs;
  } else if (clipboardData.format === '53c') {
    const oCols = clipboardData.cellCols;
    const oRows = clipboardData.cellRows;
    const nCols = oRows;
    const nRows = oCols;
    const newAttrs = new Uint8Array(nCols * nRows);
    for (let r = 0; r < oRows; r++) {
      for (let c = 0; c < oCols; c++) {
        newAttrs[c * nCols + (oRows - 1 - r)] = clipboardData.attrs[r * oCols + c];
      }
    }
    clipboardData.cellCols = nCols;
    clipboardData.cellRows = nRows;
    clipboardData.attrs = newAttrs;
  }
  editorRender();
}

/**
 * Mirrors clipboard data horizontally
 */
function mirrorClipboardH() {
  if (!clipboardData) return;

  if (clipboardData.format === 'scr' && clipboardData.bitmap && clipboardData.width && clipboardData.height) {
    const w = clipboardData.width;
    const h = clipboardData.height;
    const bpr = Math.ceil(w / 8);
    const newBitmap = new Uint8Array(bpr * h);

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const oldIdx = r * bpr + Math.floor(c / 8);
        const oldBit = 7 - (c % 8);
        if (clipboardData.bitmap[oldIdx] & (1 << oldBit)) {
          const nc = w - 1 - c;
          const newIdx = r * bpr + Math.floor(nc / 8);
          const newBit = 7 - (nc % 8);
          newBitmap[newIdx] |= (1 << newBit);
        }
      }
    }
    clipboardData.bitmap = newBitmap;

    // Mirror attributes horizontally
    const cols = clipboardData.cellCols;
    const rows = clipboardData.cellRows;
    const newAttrs = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newAttrs[r * cols + (cols - 1 - c)] = clipboardData.attrs[r * cols + c];
      }
    }
    clipboardData.attrs = newAttrs;
  } else if (clipboardData.format === '53c') {
    const cols = clipboardData.cellCols;
    const rows = clipboardData.cellRows;
    const newAttrs = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newAttrs[r * cols + (cols - 1 - c)] = clipboardData.attrs[r * cols + c];
      }
    }
    clipboardData.attrs = newAttrs;
  }
  editorRender();
}

/**
 * Mirrors clipboard data vertically
 */
function mirrorClipboardV() {
  if (!clipboardData) return;

  if (clipboardData.format === 'scr' && clipboardData.bitmap && clipboardData.width && clipboardData.height) {
    const w = clipboardData.width;
    const h = clipboardData.height;
    const bpr = Math.ceil(w / 8);
    const newBitmap = new Uint8Array(bpr * h);

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const oldIdx = r * bpr + Math.floor(c / 8);
        const oldBit = 7 - (c % 8);
        if (clipboardData.bitmap[oldIdx] & (1 << oldBit)) {
          const nr = h - 1 - r;
          const newIdx = nr * bpr + Math.floor(c / 8);
          const newBit = 7 - (c % 8);
          newBitmap[newIdx] |= (1 << newBit);
        }
      }
    }
    clipboardData.bitmap = newBitmap;

    // Mirror attributes vertically
    const cols = clipboardData.cellCols;
    const rows = clipboardData.cellRows;
    const newAttrs = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newAttrs[(rows - 1 - r) * cols + c] = clipboardData.attrs[r * cols + c];
      }
    }
    clipboardData.attrs = newAttrs;
  } else if (clipboardData.format === '53c') {
    const cols = clipboardData.cellCols;
    const rows = clipboardData.cellRows;
    const newAttrs = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newAttrs[(rows - 1 - r) * cols + c] = clipboardData.attrs[r * cols + c];
      }
    }
    clipboardData.attrs = newAttrs;
  }
  editorRender();
}

// ============================================================================
// Transform Tab Selection & Export
// ============================================================================

/**
 * Enters transform selection mode - user can drag to select area on canvas
 */
function enterTransformSelectMode() {
  transformSelectActive = true;
  selectionStartPoint = null;
  selectionEndPoint = null;
  transformSelectionRect = null;
  clipboardData = null;

  // Update UI
  const btn = document.getElementById('transformSelectBtn');
  if (btn) btn.classList.add('selected');

  const infoEl = document.getElementById('transformSelectionInfo');
  if (infoEl) infoEl.textContent = 'Drag on canvas to select area';

  // Hide transform/export sections until selection is made
  updateTransformSectionsVisibility();

  editorRender();
}

/**
 * Exits transform selection mode
 */
function exitTransformSelectMode() {
  transformSelectActive = false;

  const btn = document.getElementById('transformSelectBtn');
  if (btn) btn.classList.remove('selected');
}

/**
 * Updates visibility of transform and export sections based on selection state
 */
function updateTransformSectionsVisibility() {
  const hasClipboard = clipboardData && transformSelectionRect;
  const hasRect = !!transformSelectionRect;
  const opsSection = document.getElementById('transformOpsSection');
  const exportSection = document.getElementById('transformExportSection');

  if (opsSection) opsSection.style.display = hasClipboard ? '' : 'none';
  if (exportSection) exportSection.style.display = hasRect ? '' : 'none';
}

/**
 * Gets selection rect for transform mode (respects transform-specific snap setting)
 * @returns {{left:number, top:number, right:number, bottom:number, width:number, height:number}|null}
 */
function getTransformSelectionRect() {
  if (!selectionStartPoint || !selectionEndPoint) return null;

  let left = Math.min(selectionStartPoint.x, selectionEndPoint.x);
  let top = Math.min(selectionStartPoint.y, selectionEndPoint.y);
  let right = Math.max(selectionStartPoint.x, selectionEndPoint.x);
  let bottom = Math.max(selectionStartPoint.y, selectionEndPoint.y);

  if (transformSnapToGrid) {
    left = Math.floor(left / 8) * 8;
    top = Math.floor(top / 8) * 8;
    right = Math.floor(right / 8) * 8 + 7;
    bottom = Math.floor(bottom / 8) * 8 + 7;
  }

  // Clamp to screen bounds
  const maxHeight = getFormatHeight();
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(getFormatWidth() - 1, right);
  bottom = Math.min(maxHeight - 1, bottom);

  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width <= 0 || height <= 0) return null;

  return { left, top, right, bottom, width, height };
}

/**
 * Completes transform selection - copies data to clipboard and shows options
 */
function completeTransformSelection() {
  // Use transform-specific rect calculation
  const rect = getTransformSelectionRect();
  if (!rect) {
    const infoEl = document.getElementById('transformSelectionInfo');
    if (infoEl) infoEl.textContent = 'Selection too small';
    return;
  }

  // Store the rect for later operations
  transformSelectionRect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };

  // Copy to clipboard using existing function
  copySelection();

  // Update info display
  const infoEl = document.getElementById('transformSelectionInfo');
  if (infoEl) {
    const cellCols = Math.ceil(rect.width / 8);
    const cellRows = Math.ceil(rect.height / 8);
    infoEl.textContent = `${rect.width}×${rect.height} px (${cellCols}×${cellRows} cells)`;
  }

  // Show transform/export sections
  updateTransformSectionsVisibility();

  // Exit selection mode but keep selection visible
  exitTransformSelectMode();
}

/**
 * Transforms selection in place: rotate 90° CW
 */
function transformRotateSelection() {
  if (!clipboardData || !transformSelectionRect) return;

  saveUndoState();

  // Store original position
  const origLeft = transformSelectionRect.left;
  const origTop = transformSelectionRect.top;

  // Rotate the clipboard data
  rotateClipboard();

  // Paste back at original position
  executePasteAt(origLeft, origTop);

  // Update selection rect for new dimensions
  if (clipboardData) {
    transformSelectionRect = {
      left: origLeft,
      top: origTop,
      right: origLeft + (clipboardData.width || clipboardData.cellCols * 8) - 1,
      bottom: origTop + (clipboardData.height || clipboardData.cellRows * 8) - 1
    };

    // Update selection points to match
    selectionStartPoint = { x: transformSelectionRect.left, y: transformSelectionRect.top };
    selectionEndPoint = { x: transformSelectionRect.right, y: transformSelectionRect.bottom };
  }

  // Update info
  const infoEl = document.getElementById('transformSelectionInfo');
  if (infoEl && clipboardData) {
    const w = clipboardData.width || clipboardData.cellCols * 8;
    const h = clipboardData.height || clipboardData.cellRows * 8;
    infoEl.textContent = `${w}×${h} px (${clipboardData.cellCols}×${clipboardData.cellRows} cells)`;
  }

  editorRender();
}

/**
 * Transforms selection in place: mirror horizontal
 */
function transformMirrorSelectionH() {
  if (!clipboardData || !transformSelectionRect) return;

  saveUndoState();

  // Mirror the clipboard data
  mirrorClipboardH();

  // Paste back at original position
  executePasteAt(transformSelectionRect.left, transformSelectionRect.top);

  editorRender();
}

/**
 * Transforms selection in place: mirror vertical
 */
function transformMirrorSelectionV() {
  if (!clipboardData || !transformSelectionRect) return;

  saveUndoState();

  // Mirror the clipboard data
  mirrorClipboardV();

  // Paste back at original position
  executePasteAt(transformSelectionRect.left, transformSelectionRect.top);

  editorRender();
}

/**
 * Pastes clipboard at specific coordinates without entering paste mode
 * @param {number} x
 * @param {number} y
 */
function executePasteAt(x, y) {
  if (!clipboardData || !screenData) return;

  if (clipboardData.format === 'scr' && clipboardData.bitmap) {
    // Write bitmap pixels
    const bitmapBytesPerRow = Math.ceil(clipboardData.width / 8);
    for (let py = 0; py < clipboardData.height; py++) {
      for (let px = 0; px < clipboardData.width; px++) {
        const dx = x + px;
        const dy = y + py;
        if (dx < 0 || dx >= getFormatWidth() || dy < 0 || dy >= getFormatHeight()) continue;

        const byteIdx = py * bitmapBytesPerRow + Math.floor(px / 8);
        const bitIdx = 7 - (px % 8);
        const clipBit = (clipboardData.bitmap[byteIdx] & (1 << bitIdx)) !== 0;

        const bitmapAddr = getBitmapAddress(dx, dy);
        const bit = getBitPosition(dx);

        if (clipBit) {
          screenData[bitmapAddr] |= (1 << bit);
        } else {
          screenData[bitmapAddr] &= ~(1 << bit);
        }
      }
    }

    // Write attributes
    const cellLeft = Math.floor(x / 8);
    const cellTop = Math.floor(y / 8);
    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const destCol = cellLeft + cc;
        const destRow = cellTop + cr;
        if (destCol < 0 || destCol >= (getFormatWidth() >> 3) || destRow < 0 || destRow >= Math.ceil(getFormatHeight() / 8)) continue;
        const destAddr = SCREEN.BITMAP_SIZE + destCol + destRow * (getFormatWidth() >> 3);
        screenData[destAddr] = clipboardData.attrs[cr * clipboardData.cellCols + cc];
      }
    }
  } else if (clipboardData.format === '53c') {
    // Attribute-only paste
    const cellLeft = Math.floor(x / 8);
    const cellTop = Math.floor(y / 8);
    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const destCol = cellLeft + cc;
        const destRow = cellTop + cr;
        if (destCol < 0 || destCol >= 32 || destRow < 0 || destRow >= 24) continue;
        const destAddr = destCol + destRow * 32;
        screenData[destAddr] = clipboardData.attrs[cr * clipboardData.cellCols + cc];
      }
    }
  }
}

/**
 * Formats a byte value according to the specified numeric base
 * Uses sjasmplus-compatible prefixes: #XX for hex, 0qXXX for octal
 * @param {number} value - Byte value (0-255)
 * @param {string} base - 'hex', 'dec', or 'oct'
 * @returns {string}
 */
function formatAsmByte(value, base) {
  switch (base) {
    case 'dec':
      return value.toString(10);
    case 'oct':
      return '0q' + value.toString(8).padStart(3, '0');
    case 'hex':
    default:
      return '#' + value.toString(16).toUpperCase().padStart(2, '0');
  }
}

/**
 * Applies direction transformation to a row of bytes
 * @param {number[]} bytes - Array of byte values
 * @param {string} direction - 'lr', 'rl', 'zigzag-lr', 'zigzag-rl'
 * @param {number} rowIndex - Current row index (for zigzag)
 * @returns {number[]}
 */
function applyRowDirection(bytes, direction, rowIndex) {
  const shouldReverse =
    direction === 'rl' ||
    (direction === 'zigzag-lr' && rowIndex % 2 === 1) ||
    (direction === 'zigzag-rl' && rowIndex % 2 === 0);

  return shouldReverse ? [...bytes].reverse() : bytes;
}

/**
 * Splits an array into chunks of specified size
 * @param {number[]} arr - Array to split
 * @param {number} size - Chunk size
 * @returns {number[][]}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Generates ASM export text from current selection
 * @returns {string|null}
 */
function generateSelectionAsmText() {
  if (!clipboardData) {
    return null;
  }

  const includePalette = /** @type {HTMLInputElement} */ (document.getElementById('exportIncludePalette'))?.checked ?? true;
  const paletteMode = /** @type {HTMLSelectElement} */ (document.getElementById('exportPaletteMode'))?.value || 'after';
  const lineMode = /** @type {HTMLSelectElement} */ (document.getElementById('exportLineMode'))?.value || 'line';
  const direction = /** @type {HTMLSelectElement} */ (document.getElementById('exportDirection'))?.value || 'lr';
  const visualComments = /** @type {HTMLInputElement} */ (document.getElementById('exportVisualComments'))?.checked ?? false;

  // Get numeric bases from config
  const bitmapBase = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.ASM_BITMAP_BASE) || 'hex';
  const attrBase = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.ASM_ATTR_BASE) || 'hex';

  const asmLines = [];
  asmLines.push('; Selection export — SpectraLab v' + APP_VERSION);

  const w = clipboardData.width || clipboardData.cellCols * 8;
  const h = clipboardData.height || clipboardData.cellRows * 8;
  asmLines.push(`; Size: ${w}x${h} pixels`);
  asmLines.push(`; ${clipboardData.cellCols}x${clipboardData.cellRows} cells`);
  asmLines.push('');

  /**
   * Outputs bytes as DEFB lines according to lineMode setting
   * @param {number[]} bytes - Bytes to output
   * @param {string} base - Numeric base
   * @param {string} [comment] - Optional comment for the line
   * @param {boolean} [isBitmap] - Whether this is bitmap data (for visual comments)
   */
  const outputDefbLines = (bytes, base, comment, isBitmap = false) => {
    if (lineMode === 'block') {
      // Split into chunks of 8 bytes
      const chunks = chunkArray(bytes, 8);
      chunks.forEach((chunk, idx) => {
        const formatted = chunk.map(b => formatAsmByte(b, base)).join(',');
        let lineComment = '';
        if (visualComments && isBitmap) {
          lineComment = bytesToVisualBin(chunk);
        }
        if (comment && idx === chunks.length - 1) {
          lineComment = lineComment ? lineComment + ' ' + comment : comment;
        }
        if (lineComment) {
          asmLines.push('  DEFB ' + formatted + ' ; ' + lineComment);
        } else {
          asmLines.push('  DEFB ' + formatted);
        }
      });
    } else {
      // Line-based: all bytes on one line
      const formatted = bytes.map(b => formatAsmByte(b, base)).join(',');
      let lineComment = '';
      if (visualComments && isBitmap) {
        lineComment = bytesToVisualBin(bytes);
      }
      if (comment) {
        lineComment = lineComment ? lineComment + ' ' + comment : comment;
      }
      if (lineComment) {
        asmLines.push('  DEFB ' + formatted + ' ; ' + lineComment);
      } else {
        asmLines.push('  DEFB ' + formatted);
      }
    }
  };

  // For attribute-only formats, just export attrs
  if (clipboardData.format === '53c' || !clipboardData.bitmap) {
    asmLines.push('attrs:');
    for (let row = 0; row < clipboardData.cellRows; row++) {
      const attrBytes = [];
      for (let col = 0; col < clipboardData.cellCols; col++) {
        attrBytes.push(clipboardData.attrs[row * clipboardData.cellCols + col]);
      }
      const orderedBytes = applyRowDirection(attrBytes, direction, row);
      outputDefbLines(orderedBytes, attrBase);
    }
  } else if (paletteMode === 'interleaved' && includePalette) {
    // Output: 8 bitmap rows per cell row, then attrs for that row
    let globalRowIndex = 0;
    for (let cellRow = 0; cellRow < clipboardData.cellRows; cellRow++) {
      // 8 pixel rows per cell row
      for (let pixelRow = 0; pixelRow < 8; pixelRow++) {
        const y = cellRow * 8 + pixelRow;
        if (y >= (clipboardData.height || 0)) break;

        const rowBytes = [];
        const byteOffset = y * clipboardData.cellCols;
        for (let col = 0; col < clipboardData.cellCols; col++) {
          rowBytes.push(clipboardData.bitmap[byteOffset + col]);
        }
        const orderedBytes = applyRowDirection(rowBytes, direction, globalRowIndex);
        outputDefbLines(orderedBytes, bitmapBase, undefined, true);
        globalRowIndex++;
      }
      // Attrs for this cell row
      const attrBytes = [];
      for (let col = 0; col < clipboardData.cellCols; col++) {
        attrBytes.push(clipboardData.attrs[cellRow * clipboardData.cellCols + col]);
      }
      const orderedAttrs = applyRowDirection(attrBytes, direction, globalRowIndex);
      outputDefbLines(orderedAttrs, attrBase, 'attrs', false);
      globalRowIndex++;
    }
  } else {
    // Bitmap first, then attributes
    asmLines.push('bitmap:');
    for (let y = 0; y < (clipboardData.height || 0); y++) {
      const rowBytes = [];
      for (let col = 0; col < clipboardData.cellCols; col++) {
        rowBytes.push(clipboardData.bitmap[y * clipboardData.cellCols + col]);
      }
      const orderedBytes = applyRowDirection(rowBytes, direction, y);
      outputDefbLines(orderedBytes, bitmapBase, undefined, true);
    }

    if (includePalette) {
      asmLines.push('');
      asmLines.push('attrs:');
      for (let row = 0; row < clipboardData.cellRows; row++) {
        const attrBytes = [];
        for (let col = 0; col < clipboardData.cellCols; col++) {
          attrBytes.push(clipboardData.attrs[row * clipboardData.cellCols + col]);
        }
        const orderedAttrs = applyRowDirection(attrBytes, direction, row);
        outputDefbLines(orderedAttrs, attrBase, undefined, false);
      }
    }
  }

  return asmLines.join('\n');
}

/**
 * Exports the current selection to ASM file (DEFB format)
 */
function exportSelectionAsm() {
  const asmText = generateSelectionAsmText();
  if (!asmText) {
    const infoEl = document.getElementById('transformSelectionInfo');
    if (infoEl) infoEl.textContent = 'No selection to export';
    return;
  }

  // Download as .asm file
  downloadFile(asmText, 'selection.asm');
}

/**
 * Copies the current selection ASM to clipboard
 */
function copySelectionAsmToClipboard() {
  const asmText = generateSelectionAsmText();
  if (!asmText) {
    const infoEl = document.getElementById('transformSelectionInfo');
    if (infoEl) infoEl.textContent = 'No selection to copy';
    return;
  }

  navigator.clipboard.writeText(asmText).then(() => {
    const infoEl = document.getElementById('transformSelectionInfo');
    if (infoEl) {
      const origText = infoEl.textContent;
      infoEl.textContent = 'Copied to clipboard!';
      setTimeout(() => {
        if (infoEl.textContent === 'Copied to clipboard!') {
          infoEl.textContent = origText || '';
        }
      }, 1500);
    }
  }).catch(err => {
    console.error('Failed to copy ASM to clipboard:', err);
    const infoEl = document.getElementById('transformSelectionInfo');
    if (infoEl) infoEl.textContent = 'Copy failed - try Save file';
  });
}

/**
 * Clears a custom brush slot
 * @param {number} slot - Slot index (0-11)
 */
function clearCustomBrush(slot) {
  customBrushes[slot] = null;
  if (brushShape === 'custom' && activeCustomBrush === slot) {
    brushShape = 'square';
    activeCustomBrush = -1;
    (editorShapeButtons || document.querySelectorAll('.editor-shape-btn')).forEach(btn => {
      btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.shape === 'square');
    });
  }
  renderCustomBrushPreview(slot);
  const el = document.getElementById('customBrush' + slot);
  if (el) el.classList.remove('selected');
  saveCustomBrushes();
  updateCustomBrushIndicator();
}

/**
 * Selects a custom brush slot for painting
 * @param {number} slot - Slot index (0-11)
 */
function selectCustomBrush(slot) {
  // Get brushes from current tab
  const tab = brushTabs[activeBrushTab];
  const brushes = (activeBrushTab === 0) ? customBrushes : (tab?.brushes || customBrushes);

  if (!brushes[slot]) {
    // Only allow capture in Custom tab (index 0)
    if (activeBrushTab === 0) {
      startBrushCapture(slot);
    }
    return;
  }

  brushShape = 'custom';
  activeCustomBrush = slot;

  // Clear tile brush selection
  selectedTileIndex = -1;
  activeTileBrush = null;
  const tileContainer = document.getElementById('tileGridContainer');
  if (tileContainer) {
    tileContainer.querySelectorAll('.tile-cell').forEach(cell => cell.classList.remove('selected'));
  }

  // Deselect built-in shape buttons
  (editorShapeButtons || document.querySelectorAll('.editor-shape-btn')).forEach(btn => {
    btn.classList.remove('selected');
  });

  // Highlight selected custom brush slot
  if (customBrushSlots) {
    customBrushSlots.forEach((el, i) => {
      el.classList.toggle('selected', i === slot);
    });
  } else {
    for (let i = 0; i < 12; i++) {
      const el = document.getElementById('customBrush' + i);
      if (el) el.classList.toggle('selected', i === slot);
    }
  }
}

/**
 * Renders a custom brush preview into its canvas
 * @param {number} slot - Slot index (0-11)
 */
function renderCustomBrushPreview(slot) {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('customBrush' + slot));
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  if (!customBrushes[slot]) {
    // Draw "+" crosshair for empty slot
    ctx.fillStyle = getCSSVar('--bg-primary', '#1a1a1a');
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = getCSSVar('--border-primary', '#444');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw / 2, ch / 2 - 8);
    ctx.lineTo(cw / 2, ch / 2 + 8);
    ctx.moveTo(cw / 2 - 8, ch / 2);
    ctx.lineTo(cw / 2 + 8, ch / 2);
    ctx.stroke();
  } else {
    const brush = customBrushes[slot];
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);
    const hasMask = brush.mask && brush.mask.length > 0;
    // Scale to fit canvas, integer scale preferred
    const scale = Math.max(1, Math.min(Math.floor(cw / bw), Math.floor(ch / bh)));
    const ox = Math.floor((cw - bw * scale) / 2);
    const oy = Math.floor((ch - bh * scale) / 2);

    // Draw checkerboard background for transparency
    const bgPrimary = getCSSVar('--bg-primary', '#1a1a1a');
    ctx.fillStyle = bgPrimary;
    ctx.fillRect(0, 0, cw, ch);
    if (hasMask) {
      // Draw checkerboard in brush area to show transparency
      const cbL = getCSSVar('--bg-tertiary', '#2a2a2a');
      const checkSize = Math.max(2, scale);
      for (let y = oy; y < oy + bh * scale; y += checkSize) {
        for (let x = ox; x < ox + bw * scale; x += checkSize) {
          const isLight = ((Math.floor((x - ox) / checkSize) + Math.floor((y - oy) / checkSize)) % 2) === 0;
          ctx.fillStyle = isLight ? cbL : bgPrimary;
          ctx.fillRect(x, y, checkSize, checkSize);
        }
      }
    }

    for (let r = 0; r < bh; r++) {
      for (let c = 0; c < bw; c++) {
        const byteIdx = r * bytesPerRow + Math.floor(c / 8);
        const bitIdx = 7 - (c % 8);
        const isSet = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
        const isVisible = hasMask ? (brush.mask[byteIdx] & (1 << bitIdx)) !== 0 : true;

        if (isVisible) {
          // Visible pixel: ink (light) or paper (darker)
          ctx.fillStyle = isSet ? getCSSVar('--text-primary', '#e0e0e0') : getCSSVar('--text-tertiary', '#505050');
          ctx.fillRect(ox + c * scale, oy + r * scale, scale, scale);
        }
        // Transparent pixels show through to checkerboard background
      }
    }
  }
}

/**
 * Renders all custom brush preview canvases
 */
function renderAllCustomBrushPreviews() {
  for (let i = 0; i < 12; i++) {
    renderCustomBrushPreview(i);
  }
}

// ============================================================================
// Tileset / Brush Tab Management
// ============================================================================

/**
 * Parses tileset data from raw bytes, handling both 768-byte (linear) and 2048-byte (columnar) formats
 * @param {Uint8Array} data - Raw tileset data
 * @returns {{data: Uint8Array, tileCount: number}|null}
 */
function parseTileset(data) {
  if (data.length >= 2048) {
    // Columnar format: row R of tile T at R*256 + T
    // Convert to linear format for easier access
    const tiles = new Uint8Array(2048);
    for (let t = 0; t < 256; t++) {
      for (let r = 0; r < 8; r++) {
        tiles[t * 8 + r] = data[r * 256 + t];
      }
    }
    return { data: tiles, tileCount: 256 };
  } else if (data.length >= 768) {
    // Linear format: tile T at T*8
    return { data: data.slice(0, 768), tileCount: 96 };
  }
  return null;
}

/**
 * Initializes brush tabs with Custom tab
 */
function initBrushTabs() {
  brushTabs = [
    { name: 'Custom', type: 'brushset', brushes: customBrushes }
  ];
  activeBrushTab = 0;

  // Add ROM tab if font is already loaded
  if (typeof fontLoaded !== 'undefined' && fontLoaded && typeof fontData !== 'undefined' && fontData.length >= 768) {
    brushTabs.push({ name: 'ROM', type: 'tileset', data: fontData.slice(0, 768), tileCount: 96 });
  }
  // Otherwise ROM tab will be added when font loads via updateRomBrushTab()

  // Load user tabs from localStorage
  loadBrushTabsFromStorage();

  // Auto-load UDG tileset if present in fonts/ directory
  autoLoadUdgTileset();
}

/**
 * Updates or adds the ROM tab when font data becomes available
 * Called from screen_viewer.js after font loads
 */
function updateRomBrushTab() {
  if (typeof fontData === 'undefined' || typeof fontLoaded === 'undefined' || !fontLoaded) {
    return;
  }

  // Check if ROM tab already exists
  const romTabIndex = brushTabs.findIndex(tab => tab.name === 'ROM');

  if (romTabIndex >= 0) {
    // Update existing ROM tab data
    brushTabs[romTabIndex].data = fontData.slice(0, 768);
  } else {
    // Insert ROM tab at index 1 (after Custom)
    brushTabs.splice(1, 0, { name: 'ROM', type: 'tileset', data: fontData.slice(0, 768), tileCount: 96 });
  }

  updateBrushTabBar();
  // Re-render if ROM tab is active
  if (brushTabs[activeBrushTab]?.name === 'ROM') {
    renderBrushTabContent();
  }
}

/**
 * Saves user brush tabs to localStorage
 */
function saveBrushTabsToStorage() {
  // Only save user-added tabs (skip Custom, ROM, and built-in tabs like UDG)
  const userTabs = brushTabs.filter(tab => {
    return tab.name !== 'Custom' && tab.name !== 'ROM' && !tab.builtIn;
  }).map(tab => {
    if (tab.type === 'tileset') {
      return {
        name: tab.name,
        type: 'tileset',
        data: btoa(String.fromCharCode(...tab.data)),
        tileCount: tab.tileCount
      };
    } else {
      // brushset type
      return {
        name: tab.name,
        type: 'brushset',
        brushes: (tab.brushes || []).map(b => {
          if (!b) return null;
          const obj = { w: b.width, h: b.height, d: btoa(String.fromCharCode(...b.data)) };
          if (b.mask && b.mask.length > 0) {
            obj.m = btoa(String.fromCharCode(...b.mask));
          }
          return obj;
        })
      };
    }
  });
  localStorage.setItem('spectraLabBrushTabs', JSON.stringify(userTabs));
}

/**
 * Loads user brush tabs from localStorage
 */
function loadBrushTabsFromStorage() {
  const raw = localStorage.getItem('spectraLabBrushTabs');
  if (!raw) return;

  try {
    const userTabs = JSON.parse(raw);
    for (const tab of userTabs) {
      if (brushTabs.length >= 8) break; // Max 8 tabs

      if (tab.type === 'tileset') {
        const decoded = Uint8Array.from(atob(tab.data), c => c.charCodeAt(0));
        brushTabs.push({
          name: tab.name,
          type: 'tileset',
          data: decoded,
          tileCount: tab.tileCount
        });
      } else if (tab.type === 'brushset') {
        const brushes = (tab.brushes || []).map(b => {
          if (!b) return null;
          const decoded = Uint8Array.from(atob(b.d), c => c.charCodeAt(0));
          const brush = { width: b.w, height: b.h, data: decoded };
          if (b.m) {
            brush.mask = Uint8Array.from(atob(b.m), c => c.charCodeAt(0));
          }
          return brush;
        });
        // Pad to 12 slots
        while (brushes.length < 12) brushes.push(null);
        brushTabs.push({
          name: tab.name,
          type: 'brushset',
          brushes: brushes
        });
      }
    }
  } catch (e) {
    console.error('Failed to load brush tabs from storage:', e);
  }
}

/**
 * Auto-loads the UDG tileset from fonts/udg.768 if present
 * Called during initialization
 */
async function autoLoadUdgTileset() {
  // Check if UDG tab already exists (from localStorage)
  if (brushTabs.some(tab => tab.name === 'UDG')) {
    return;
  }

  try {
    const response = await fetch('./fonts/udg.768');
    if (!response.ok) {
      return; // File doesn't exist, silently skip
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    if (data.length < 768) {
      console.warn('UDG file too small:', data.length, 'bytes');
      return;
    }

    // Parse as tileset (768-byte linear format)
    const parsed = parseTileset(data);
    if (!parsed) {
      console.warn('Failed to parse UDG tileset');
      return;
    }

    // Insert UDG tab after ROM (index 2), or after Custom if ROM not present
    const insertIndex = brushTabs.findIndex(tab => tab.name === 'ROM');
    const idx = insertIndex >= 0 ? insertIndex + 1 : 1;

    brushTabs.splice(idx, 0, {
      name: 'UDG',
      type: 'tileset',
      data: parsed.data,
      tileCount: parsed.tileCount,
      builtIn: true  // Mark as built-in so it won't be saved to localStorage
    });

    updateBrushTabBar();
    console.log('Auto-loaded UDG tileset (' + parsed.tileCount + ' tiles)');
  } catch (e) {
    // Silently ignore - file probably doesn't exist
  }
}

/**
 * Handles loading a brush/tileset file and adding it as a new tab
 * @param {File} file - The file to load
 */
function loadBrushTabFile(file) {
  if (brushTabs.length >= 8) {
    alert('Maximum 8 tabs allowed. Please close a tab first.');
    return;
  }

  const reader = new FileReader();
  const ext = file.name.toLowerCase().split('.').pop();

  reader.onload = function(e) {
    const result = e.target?.result;

    if (ext === 'slb') {
      // JSON brush set file
      try {
        const arr = JSON.parse(/** @type {string} */ (result));
        const brushes = [];
        for (let i = 0; i < 12; i++) {
          if (!arr[i]) {
            brushes.push(null);
          } else {
            const decoded = Uint8Array.from(atob(arr[i].d), c => c.charCodeAt(0));
            const brush = { width: arr[i].w, height: arr[i].h, data: decoded };
            if (arr[i].m) {
              brush.mask = Uint8Array.from(atob(arr[i].m), c => c.charCodeAt(0));
            }
            brushes.push(brush);
          }
        }
        const name = file.name.replace(/\.slb$/i, '').substring(0, 10);
        brushTabs.push({ name, type: 'brushset', brushes });
        saveBrushTabsToStorage();
        selectBrushTab(brushTabs.length - 1);
        updateBrushTabBar();
      } catch (err) {
        alert('Failed to load brush set file.');
      }
    } else {
      // Binary tileset file
      const data = new Uint8Array(/** @type {ArrayBuffer} */ (result));
      const parsed = parseTileset(data);
      if (parsed) {
        const name = file.name.replace(/\.(768|ch8|bin)$/i, '').substring(0, 10);
        brushTabs.push({ name, type: 'tileset', data: parsed.data, tileCount: parsed.tileCount });
        saveBrushTabsToStorage();
        selectBrushTab(brushTabs.length - 1);
        updateBrushTabBar();
      } else {
        alert('Invalid tileset file. Expected 768 or 2048+ bytes.');
      }
    }
  };

  if (ext === 'slb') {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

/**
 * Removes a user tab (index must be >= 2)
 * @param {number} idx - Tab index to remove
 */
function removeBrushTab(idx) {
  if (idx < 0 || idx >= brushTabs.length) return;

  // Never allow removing Custom tab (index 0) or ROM tab
  const tab = brushTabs[idx];
  if (idx === 0 || tab.name === 'ROM') return;

  brushTabs.splice(idx, 1);

  // Adjust active tab if needed
  if (activeBrushTab >= idx) {
    activeBrushTab = Math.max(0, activeBrushTab - 1);
  }

  saveBrushTabsToStorage();
  updateBrushTabBar();
  renderBrushTabContent();
}

/**
 * Selects a brush tab
 * @param {number} idx - Tab index to select
 */
function selectBrushTab(idx) {
  if (idx < 0 || idx >= brushTabs.length) return;

  activeBrushTab = idx;
  selectedTileIndex = -1;
  activeTileBrush = null;

  // Clear tile brush selection when switching tabs
  if (activeCustomBrush === -2) {
    activeCustomBrush = -1;
  }

  updateBrushTabBar();
  renderBrushTabContent();
}

/**
 * Updates the brush tab bar UI
 */
function updateBrushTabBar() {
  const tabBar = document.getElementById('brushTabBar');
  if (!tabBar) return;

  tabBar.innerHTML = '';

  brushTabs.forEach((tab, idx) => {
    const tabEl = document.createElement('div');
    tabEl.className = 'brush-tab' + (idx === activeBrushTab ? ' active' : '');
    tabEl.title = tab.name;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'brush-tab-name';
    nameSpan.textContent = tab.name;
    tabEl.appendChild(nameSpan);

    // Add close button for user tabs (not Custom, ROM, or built-in)
    if (idx > 0 && tab.name !== 'ROM' && !tab.builtIn) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'brush-tab-close';
      closeBtn.textContent = '\u00d7';
      closeBtn.title = 'Close tab';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeBrushTab(idx);
      });
      tabEl.appendChild(closeBtn);
    }

    tabEl.addEventListener('click', () => selectBrushTab(idx));
    tabBar.appendChild(tabEl);
  });

  // Add "Grab" button to capture tileset from screen (if under tab limit)
  if (brushTabs.length < 8) {
    const grabBtn = document.createElement('button');
    grabBtn.className = 'brush-tab-add';
    grabBtn.textContent = '\u2316'; // Position indicator symbol
    grabBtn.title = 'Grab tileset from screen (select rectangular area)';
    grabBtn.addEventListener('click', () => {
      startTilesetCapture();
    });
    tabBar.appendChild(grabBtn);
  }
}

/**
 * Renders the content for the active brush tab
 */
function renderBrushTabContent() {
  const slotsContainer = document.getElementById('brushSlotsContainer');
  const tileContainer = document.getElementById('tileGridContainer');
  if (!slotsContainer || !tileContainer) return;

  const tab = brushTabs[activeBrushTab];
  if (!tab) return;

  if (tab.type === 'brushset') {
    // Show brush slots, hide tile grid
    slotsContainer.style.display = '';
    tileContainer.style.display = 'none';

    // For Custom tab (index 0), use main customBrushes
    // For loaded brushset tabs, use their brushes array
    if (activeBrushTab === 0) {
      // Main custom brushes - already rendered
      renderAllCustomBrushPreviews();
    } else {
      // Loaded brush set - render to canvases
      const brushes = tab.brushes || [];
      for (let i = 0; i < 12; i++) {
        renderCustomBrushPreviewFrom(i, brushes[i]);
      }
    }

    // Update slot selection highlights
    updateBrushSlotSelection();
  } else {
    // Show tile grid, hide brush slots
    slotsContainer.style.display = 'none';
    tileContainer.style.display = '';

    renderTileGrid(tab);
  }
}

/**
 * Renders a brush preview from a given brush object (for non-main brush sets)
 * @param {number} slot - Slot index (0-11)
 * @param {{width:number, height:number, data:Uint8Array, mask?:Uint8Array}|null} brush - Brush object
 */
function renderCustomBrushPreviewFrom(slot, brush) {
  const canvas = document.getElementById('customBrush' + slot);
  if (!canvas) return;

  const ctx = /** @type {HTMLCanvasElement} */ (canvas).getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, 64, 64);

  if (!brush) {
    ctx.fillStyle = getCSSVar('--bg-tertiary', '#333');
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = getCSSVar('--border-primary', '#555');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(64, 64);
    ctx.moveTo(64, 0);
    ctx.lineTo(0, 64);
    ctx.stroke();
    return;
  }

  const bw = brush.width;
  const bh = brush.height;
  const scale = Math.max(1, Math.min(Math.floor(64 / bw), Math.floor(64 / bh)));
  const ox = Math.floor((64 - bw * scale) / 2);
  const oy = Math.floor((64 - bh * scale) / 2);

  // Draw checkerboard background for transparent areas
  const tCbLight = getCSSVar('--checkerboard-dark', '#282828');
  const tCbDark = getCSSVar('--checkerboard-light', '#383838');
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = ((x + y) % 16 === 0) ? tCbLight : tCbDark;
      ctx.fillRect(x, y, 8, 8);
    }
  }

  const bytesPerRow = Math.ceil(bw / 8);
  const hasMask = brush.mask && brush.mask.length > 0;

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      const byteIdx = r * bytesPerRow + Math.floor(c / 8);
      const bitIdx = 7 - (c % 8);
      const isSet = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
      const isVisible = hasMask ? (brush.mask[byteIdx] & (1 << bitIdx)) !== 0 : true;

      if (isVisible) {
        ctx.fillStyle = isSet ? getCSSVar('--text-primary', '#e0e0e0') : getCSSVar('--text-tertiary', '#505050');
        ctx.fillRect(ox + c * scale, oy + r * scale, scale, scale);
      }
    }
  }
}

/**
 * Updates the selection highlight for brush slots
 */
function updateBrushSlotSelection() {
  const slots = document.querySelectorAll('.custom-brush-slot');
  slots.forEach((el, i) => {
    const isSelected = brushTabs[activeBrushTab]?.type === 'brushset' &&
                       activeCustomBrush >= 0 &&
                       activeCustomBrush === i;
    el.classList.toggle('selected', isSelected);
  });
}

/**
 * Renders the tile grid for a tileset tab
 * @param {BrushTab} tab - The tileset tab
 */
function renderTileGrid(tab) {
  const container = document.getElementById('tileGridContainer');
  if (!container || !tab.data) return;

  container.innerHTML = '';

  const tileCount = tab.tileCount || 96;

  for (let i = 0; i < tileCount; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.className = 'tile-cell' + (selectedTileIndex === i && activeBrushTab === brushTabs.indexOf(tab) ? ' selected' : '');
    canvas.dataset.tile = String(i);
    canvas.title = `Tile ${i}`;

    renderTileToCanvas(canvas, tab.data, i);

    canvas.addEventListener('click', () => selectTile(i));
    container.appendChild(canvas);
  }
}

/**
 * Renders a single tile to a canvas (2x scaled)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {Uint8Array} tiles - Tile data array
 * @param {number} idx - Tile index
 */
function renderTileToCanvas(canvas, tiles, idx) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = getCSSVar('--bg-primary', '#000');
  ctx.fillRect(0, 0, 16, 16);

  ctx.fillStyle = getCSSVar('--text-primary', '#e0e0e0');

  for (let row = 0; row < 8; row++) {
    const byte = tiles[idx * 8 + row];
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (0x80 >> bit)) {
        ctx.fillRect(bit * 2, row * 2, 2, 2);
      }
    }
  }
}

/**
 * Selects a tile from the current tileset tab
 * @param {number} idx - Tile index
 */
function selectTile(idx) {
  const tab = brushTabs[activeBrushTab];
  if (!tab || tab.type !== 'tileset' || !tab.data) return;

  selectedTileIndex = idx;

  // Create tile brush from tileset data
  const data = new Uint8Array(8);
  for (let r = 0; r < 8; r++) {
    data[r] = tab.data[idx * 8 + r];
  }
  activeTileBrush = { width: 8, height: 8, data };

  // Set brush shape to custom and mark as tile brush
  brushShape = 'custom';
  activeCustomBrush = -2; // Marker for tile brush

  // Deselect built-in shape buttons
  document.querySelectorAll('.editor-shape-btn').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Update tile grid selection
  const container = document.getElementById('tileGridContainer');
  if (container) {
    container.querySelectorAll('.tile-cell').forEach((cell, i) => {
      cell.classList.toggle('selected', i === idx);
    });
  }

  // Deselect custom brush slots
  document.querySelectorAll('.custom-brush-slot').forEach(el => {
    el.classList.remove('selected');
  });
}

/**
 * Gets the currently active brush (custom slot or tile)
 * @returns {{width:number, height:number, data:Uint8Array, mask?:Uint8Array}|null}
 */
function getActiveBrush() {
  if (activeCustomBrush === -3 && typeof activeSpriteBrush !== 'undefined' && activeSpriteBrush) {
    return activeSpriteBrush;
  }
  if (activeCustomBrush === -2 && activeTileBrush) {
    return activeTileBrush;
  }
  if (activeCustomBrush >= 0) {
    // Check if we're in a loaded brushset tab (not Custom tab)
    if (activeBrushTab > 0 && brushTabs[activeBrushTab]?.type === 'brushset') {
      return brushTabs[activeBrushTab].brushes?.[activeCustomBrush] || null;
    }
    return customBrushes[activeCustomBrush];
  }
  return null;
}

/**
 * Clears tile brush selection
 */
function clearTileBrushSelection() {
  if (activeCustomBrush === -2) {
    activeCustomBrush = -1;
    activeTileBrush = null;
    selectedTileIndex = -1;

    const container = document.getElementById('tileGridContainer');
    if (container) {
      container.querySelectorAll('.tile-cell').forEach(cell => {
        cell.classList.remove('selected');
      });
    }
  }
}

/**
 * Saves current tab's brushes to file (export)
 */
function exportCurrentTab() {
  const tab = brushTabs[activeBrushTab];
  if (!tab) return;

  if (tab.type === 'tileset') {
    // Export tileset as binary .768 or .bin file
    if (!tab.data || tab.data.length === 0) {
      alert('No tileset data to save.');
      return;
    }
    const ext = tab.tileCount > 96 ? '.bin' : '.768';
    downloadFile(new Blob([tab.data], { type: 'application/octet-stream' }), (tab.name || 'tileset') + ext);
    return;
  }

  // Export brushset as .slb file
  const brushes = activeBrushTab === 0 ? customBrushes : tab.brushes;
  const arr = (brushes || []).map(b => {
    if (!b) return null;
    const obj = { w: b.width, h: b.height, d: btoa(String.fromCharCode(...b.data)) };
    if (b.mask && b.mask.length > 0) {
      obj.m = btoa(String.fromCharCode(...b.mask));
    }
    return obj;
  });

  if (arr.every(b => b === null)) {
    alert('No brushes to save.');
    return;
  }

  const json = JSON.stringify(arr);
  downloadFile(json, (tab.name || 'brushes') + '.slb', 'application/json');
}

/**
 * Saves custom brushes to localStorage
 */
function saveCustomBrushes() {
  const arr = customBrushes.map(b => {
    if (!b) return null;
    const obj = {
      w: b.width,
      h: b.height,
      d: btoa(String.fromCharCode(...b.data))
    };
    // Include mask if brush has transparency
    if (b.mask && b.mask.length > 0) {
      obj.m = btoa(String.fromCharCode(...b.mask));
    }
    return obj;
  });
  localStorage.setItem('spectraLabCustomBrushes', JSON.stringify(arr));
}

/**
 * Parses brush array data (shared by localStorage and file loading)
 * @param {Array} arr
 */
function parseBrushArray(arr) {
  for (let i = 0; i < 12; i++) {
    if (!arr[i]) {
      customBrushes[i] = null;
    } else if (typeof arr[i] === 'string') {
      // Old format: base64 string of 32-byte Uint8Array (16×16)
      const data = new Uint8Array([...atob(arr[i])].map(c => c.charCodeAt(0)));
      customBrushes[i] = { width: 16, height: 16, data: data };
    } else {
      // New format: {w, h, d, m?}
      const data = new Uint8Array([...atob(arr[i].d)].map(c => c.charCodeAt(0)));
      const brush = { width: arr[i].w, height: arr[i].h, data: data };
      // Load mask if present
      if (arr[i].m) {
        brush.mask = new Uint8Array([...atob(arr[i].m)].map(c => c.charCodeAt(0)));
      }
      customBrushes[i] = brush;
    }
  }
}

/**
 * Loads custom brushes from localStorage, or from brushes/brushes.slb if localStorage is empty
 */
function loadCustomBrushes() {
  const raw = localStorage.getItem('spectraLabCustomBrushes');
  if (raw) {
    // Load from localStorage
    try {
      const arr = JSON.parse(raw);
      parseBrushArray(arr);
    } catch (e) {
      // Ignore corrupt data
    }
    updateCustomBrushIndicator();
  } else {
    // Try to load default brushes from file
    fetch('brushes/brushes.slb')
      .then(response => {
        if (!response.ok) throw new Error('Not found');
        return response.text();
      })
      .then(text => {
        const arr = JSON.parse(text);
        parseBrushArray(arr);
        renderAllCustomBrushPreviews();
        updateCustomBrushIndicator();
      })
      .catch(() => {
        // No default brushes file, that's fine
        updateCustomBrushIndicator();
      });
  }
}

/**
 * Exports custom brushes to a .slb file
 */
function exportBrushesToFile() {
  const arr = customBrushes.map(b => {
    if (!b) return null;
    const obj = {
      w: b.width,
      h: b.height,
      d: btoa(String.fromCharCode(...b.data))
    };
    // Include mask if brush has transparency
    if (b.mask && b.mask.length > 0) {
      obj.m = btoa(String.fromCharCode(...b.mask));
    }
    return obj;
  });

  // Check if there are any brushes to save
  if (arr.every(b => b === null)) {
    alert('No custom brushes to save.');
    return;
  }

  const json = JSON.stringify(arr);
  downloadFile(json, 'brushes.slb', 'application/json');
}

/**
 * Imports custom brushes from a .slb file
 * @param {File} file
 */
function importBrushesFromFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const arr = JSON.parse(/** @type {string} */ (e.target?.result));
      parseBrushArray(arr);
      saveCustomBrushes(); // Persist to localStorage
      renderAllCustomBrushPreviews();
      updateCustomBrushIndicator();
    } catch (err) {
      alert('Failed to load brushes file.');
    }
  };
  reader.readAsText(file);
}

/**
 * Updates the custom brush section indicator and auto-expands if brushes exist
 */
function updateCustomBrushIndicator() {
  const indicator = document.getElementById('customBrushIndicator');
  const controls = document.getElementById('customBrushControls');
  const icon = document.getElementById('customBrushExpandIcon');

  const count = customBrushes.filter(b => b !== null).length;

  if (indicator) {
    indicator.textContent = count > 0 ? `${count} defined` : 'None';
  }

  // Auto-expand if any brushes are defined, collapse if none
  if (controls && icon) {
    if (count > 0) {
      controls.style.display = '';
      icon.textContent = '▼';
    } else {
      controls.style.display = 'none';
      icon.textContent = '▶';
    }
  }
}

// ============================================================================
// Format Conversion
// ============================================================================

/**
 * Updates the convert dropdown options based on current format
 */
function updateConvertOptions() {
  const convertSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorConvertSelect'));
  if (!convertSelect) return;

  // Clear existing options except the placeholder
  convertSelect.innerHTML = '<option value="" disabled selected>Convert...</option>';

  if (currentFormat === FORMAT.SCR) {
    // SCR can convert to ATTR, BSC, ULA+, IFL, MLT, BMC4, Gigascreen, NXI
    convertSelect.innerHTML += '<option value="scr-to-attr">→ ATTR (.53c)</option>';
    convertSelect.innerHTML += '<option value="scr-to-bsc">→ BSC (add border)</option>';
    convertSelect.innerHTML += '<option value="scr-to-ulaplus">→ ULA+ (add palette)</option>';
    convertSelect.innerHTML += '<option value="scr-to-ifl">→ IFL (8×2 multicolor)</option>';
    convertSelect.innerHTML += '<option value="scr-to-mlt">→ MLT (8×1 multicolor)</option>';
    convertSelect.innerHTML += '<option value="scr-to-bmc4">→ BMC4 (8×4 + border)</option>';
    convertSelect.innerHTML += '<option value="scr-to-giga">→ Gigascreen (duplicate)</option>';
    convertSelect.innerHTML += '<option value="scr-to-nxi">→ NXI 256×192 (Next Layer 2)</option>';
    convertSelect.innerHTML += '<option value="scr-to-nxi320">→ NXI 320×256 (upscale)</option>';
    convertSelect.innerHTML += '<option value="scr-to-nxi640">→ NXI 640×256 (upscale)</option>';
    convertSelect.innerHTML += '<option value="scr-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    convertSelect.innerHTML += '<option value="scr-to-specscii">→ SPECSCII (character match)</option>';
  } else if (currentFormat === FORMAT.SCR_ULAPLUS) {
    // ULA+ can convert to SCR (strip palette) or NXI/SL2
    convertSelect.innerHTML += '<option value="ulaplus-to-scr">→ SCR (strip palette)</option>';
    convertSelect.innerHTML += '<option value="ulaplus-to-nxi">→ NXI 256×192 (Next Layer 2)</option>';
    convertSelect.innerHTML += '<option value="ulaplus-to-nxi320">→ NXI 320×256 (upscale)</option>';
    convertSelect.innerHTML += '<option value="ulaplus-to-nxi640">→ NXI 640×256 (upscale)</option>';
    convertSelect.innerHTML += '<option value="ulaplus-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
  } else if (currentFormat === FORMAT.ATTR_53C) {
    // ATTR can convert to SCR or BSC
    convertSelect.innerHTML += '<option value="attr-to-scr">→ SCR (add pattern)</option>';
    convertSelect.innerHTML += '<option value="attr-to-bsc">→ BSC (add pattern + border)</option>';
  } else if (currentFormat === FORMAT.BSC) {
    // BSC can convert to SCR, BSP, or BMC4
    convertSelect.innerHTML += '<option value="bsc-to-scr">→ SCR (strip border)</option>';
    convertSelect.innerHTML += '<option value="bsc-to-bsp">→ BSP (add header)</option>';
    convertSelect.innerHTML += '<option value="bsc-to-bmc4">→ BMC4 (8×4 multicolor)</option>';
  } else if (currentFormat === FORMAT.BSP) {
    // BSP can convert to SCR or BSC
    const isGiga = currentPicture && currentPicture.colorMode === 'gigascreen';
    const hasBorder = currentPicture && currentPicture.border;
    if (!isGiga) {
      convertSelect.innerHTML += '<option value="bsp-to-scr">→ SCR (strip header' + (hasBorder ? ' + border' : '') + ')</option>';
      if (hasBorder) {
        convertSelect.innerHTML += '<option value="bsp-to-bsc">→ BSC (strip header, keep border)</option>';
      }
    }
  } else if (currentFormat === FORMAT.IFL) {
    // IFL can convert to MLT
    convertSelect.innerHTML += '<option value="ifl-to-mlt">→ MLT (8×1 multicolor)</option>';
  } else if (currentFormat === FORMAT.GIGASCREEN) {
    // Gigascreen can convert to BSP
    convertSelect.innerHTML += '<option value="giga-to-bsp">→ BSP (add header)</option>';
  } else if (currentFormat === FORMAT.NXI) {
    if (nxiLayer2Mode === '256x192') {
      convertSelect.innerHTML += '<option value="nxi-to-sl2">→ SL2 256×192 (strip palette)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-nxi320">→ NXI 320×256 (upscale)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-nxi640">→ NXI 640×256 (upscale)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-scr">→ SCR (quantize to ZX)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    } else if (nxiLayer2Mode === '320x256') {
      convertSelect.innerHTML += '<option value="nxi320-to-sl2">→ SL2 320×256 (strip palette)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-nxi256">→ NXI 256×192 (downscale)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-nxi640">→ NXI 640×256 (rescale)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-scr">→ SCR (quantize to ZX)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    } else if (nxiLayer2Mode === '640x256') {
      convertSelect.innerHTML += '<option value="nxi640-to-sl2">→ SL2 640×256 (strip palette)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-nxi256">→ NXI 256×192 (downscale)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-nxi320">→ NXI 320×256 (rescale)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-scr">→ SCR (quantize to ZX)</option>';
      convertSelect.innerHTML += '<option value="nxi-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    }
  } else if (currentFormat === FORMAT.SL2) {
    if (nxiLayer2Mode === '256x192') {
      convertSelect.innerHTML += '<option value="sl2-to-nxi">→ NXI 256×192 (add palette)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-nxi320">→ NXI 320×256 (upscale)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-nxi640">→ NXI 640×256 (upscale)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-scr">→ SCR (quantize to ZX)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    } else if (nxiLayer2Mode === '320x256') {
      convertSelect.innerHTML += '<option value="sl2_320-to-nxi">→ NXI 320×256 (add palette)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-sl2_256">→ SL2 256×192 (downscale)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-nxi640">→ NXI 640×256 (rescale)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-scr">→ SCR (quantize to ZX)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    } else if (nxiLayer2Mode === '640x256') {
      convertSelect.innerHTML += '<option value="sl2_640-to-nxi">→ NXI 640×256 (add palette)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-sl2_256">→ SL2 256×192 (downscale)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-nxi320">→ NXI 320×256 (rescale)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-scr">→ SCR (quantize to ZX)</option>';
      convertSelect.innerHTML += '<option value="sl2-to-lores">→ SLR LoRes 128×96 (downscale)</option>';
    }
  } else if (currentFormat === FORMAT.LORES) {
    convertSelect.innerHTML += '<option value="lores-to-lores_rad">→ RAD Radastan 128×96 (quantize 16c)</option>';
    convertSelect.innerHTML += '<option value="lores-to-nxi">→ NXI 256×192 (upscale 2×)</option>';
    convertSelect.innerHTML += '<option value="lores-to-sl2">→ SL2 256×192 (upscale 2×)</option>';
    convertSelect.innerHTML += '<option value="lores-to-nxi320">→ NXI 320×256 (upscale)</option>';
    convertSelect.innerHTML += '<option value="lores-to-nxi640">→ NXI 640×256 (upscale)</option>';
    convertSelect.innerHTML += '<option value="lores-to-scr">→ SCR (quantize to ZX)</option>';
  } else if (currentFormat === FORMAT.LORES_RAD) {
    convertSelect.innerHTML += '<option value="lores_rad-to-lores">→ SLR LoRes 128×96 (expand 256c)</option>';
    convertSelect.innerHTML += '<option value="lores_rad-to-nxi">→ NXI 256×192 (upscale 2×)</option>';
    convertSelect.innerHTML += '<option value="lores_rad-to-sl2">→ SL2 256×192 (upscale 2×)</option>';
    convertSelect.innerHTML += '<option value="lores_rad-to-scr">→ SCR (quantize to ZX)</option>';
  }
}

/**
 * Handles conversion action from dropdown
 * @param {string} action - Conversion action identifier
 */
function handleConversion(action) {
  switch (action) {
    case 'scr-to-attr':
      convertScrToAttr();
      break;
    case 'scr-to-bsc':
      showBorderColorDialog(convertScrToBsc);
      break;
    case 'scr-to-ulaplus':
      convertScrToUlaPlus();
      break;
    case 'ulaplus-to-scr':
      convertUlaPlusToScr();
      break;
    case 'attr-to-scr':
      showPatternPicker(false);
      break;
    case 'attr-to-bsc':
      showPatternPicker(true);
      break;
    case 'bsc-to-scr':
      convertBscToScr();
      break;
    case 'bsc-to-bsp':
      convertBscToBsp();
      break;
    case 'bsp-to-scr':
      convertBspToScr();
      break;
    case 'bsp-to-bsc':
      convertBspToBsc();
      break;
    case 'scr-to-ifl':
      convertScrToIfl();
      break;
    case 'scr-to-mlt':
      convertScrToMlt();
      break;
    case 'scr-to-bmc4':
      showBorderColorDialog(convertScrToBmc4);
      break;
    case 'scr-to-giga':
      convertScrToGigascreen();
      break;
    case 'scr-to-nxi':
      convertScrToNxi();
      break;
    case 'scr-to-specscii':
      convertScrToSpecscii();
      break;
    case 'ifl-to-mlt':
      convertIflToMlt();
      break;
    case 'bsc-to-bmc4':
      convertBscToBmc4();
      break;
    case 'giga-to-bsp':
      convertGigascreenToBsp();
      break;
    case 'nxi-to-sl2':
      convertNxiToSl2();
      break;
    case 'sl2-to-nxi':
      convertSl2ToNxi();
      break;
    // Extended NXI/SL2 lossless conversions
    case 'nxi320-to-sl2':
      convertNxi320ToSl2();
      break;
    case 'sl2_320-to-nxi':
      convertSl2_320ToNxi();
      break;
    case 'nxi640-to-sl2':
      convertNxi640ToSl2();
      break;
    case 'sl2_640-to-nxi':
      convertSl2_640ToNxi();
      break;
    // Lossy conversions to NXI extended modes
    case 'scr-to-nxi320':
    case 'ulaplus-to-nxi320':
    case 'nxi-to-nxi320':
    case 'sl2-to-nxi320':
    case 'lores-to-nxi320':
      convertXformToNxi320();
      break;
    case 'scr-to-nxi640':
    case 'ulaplus-to-nxi640':
    case 'nxi-to-nxi640':
    case 'sl2-to-nxi640':
    case 'lores-to-nxi640':
      convertXformToNxi640();
      break;
    // Lossy conversions to NXI/SL2 256×192
    case 'nxi-to-nxi256':
      convertXformToNxi256();
      break;
    case 'sl2-to-sl2_256':
      convertXformToSl2_256();
      break;
    // Lossy conversions to SCR
    case 'nxi-to-scr':
    case 'sl2-to-scr':
    case 'lores-to-scr':
    case 'lores_rad-to-scr':
      convertAnyToScr();
      break;
    // ULA+ to NXI 256×192 (lossy: render ULA+ colors, quantize to Next palette)
    case 'ulaplus-to-nxi':
      convertXformToNxi256();
      break;
    // LoRes-specific conversions
    case 'lores-to-nxi':
      convertLoresToNxi();
      break;
    case 'lores-to-sl2':
      convertLoresToSl2();
      break;
    // Lossy conversions to LoRes (downscale + quantize to 256 RGB332 colors)
    case 'scr-to-lores':
    case 'ulaplus-to-lores':
    case 'nxi-to-lores':
    case 'sl2-to-lores':
      convertAnyToLores();
      break;
    // LoRes Radastan conversions
    case 'lores_rad-to-lores':
      convertLoresRadToLores();
      break;
    case 'lores_rad-to-nxi':
      convertLoresRadToNxi();
      break;
    case 'lores_rad-to-sl2':
      convertLoresRadToSl2();
      break;
    case 'lores-to-lores_rad':
    case 'scr-to-lores_rad':
    case 'ulaplus-to-lores_rad':
    case 'nxi-to-lores_rad':
    case 'sl2-to-lores_rad':
      convertAnyToLoresRad();
      break;
  }
}

/**
 * Convert SCR to ATTR (.53c) - extract attributes only
 */
function convertScrToAttr() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  // Extract attributes (last 768 bytes of SCR)
  const attrData = new Uint8Array(SCREEN.ATTR_SIZE);
  attrData.set(screenData.slice(SCREEN.BITMAP_SIZE, SCREEN.TOTAL_SIZE));

  // Update state
  screenData = attrData;
  currentFormat = FORMAT.ATTR_53C;
  currentPicture = null;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.53c');

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to SPECSCII (character match)
 * Analyzes each 8x8 cell bitmap and finds the best matching ROM font
 * character (0x20-0x7F) or block graphic (0x80-0x8F).
 * Preserves brightness and flash attributes.
 */
function convertScrToSpecscii() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  // --- Build glyph table: 112 entries, each 8 bytes ---
  // 96 ROM chars (0x20-0x7F) from fontData + 16 block graphics (0x80-0x8F)
  const GLYPH_COUNT = 112;
  const glyphs = new Uint8Array(GLYPH_COUNT * 8);

  // Copy ROM font data (96 chars × 8 bytes)
  if (typeof fontData !== 'undefined' && fontData.length >= 768) {
    glyphs.set(fontData.subarray(0, 768), 0);
  }

  // Generate block graphics (0x80-0x8F)
  // Encoding: bit0=top-right, bit1=top-left, bit2=bottom-right, bit3=bottom-left
  for (let code = 0; code < 16; code++) {
    const offset = 96 * 8 + code * 8;
    const topLeft  = (code & 0x02) ? 0xF0 : 0x00;
    const topRight = (code & 0x01) ? 0x0F : 0x00;
    const botLeft  = (code & 0x08) ? 0xF0 : 0x00;
    const botRight = (code & 0x04) ? 0x0F : 0x00;
    const topByte = topLeft | topRight;
    const botByte = botLeft | botRight;
    for (let line = 0; line < 4; line++) glyphs[offset + line] = topByte;
    for (let line = 4; line < 8; line++) glyphs[offset + line] = botByte;
  }

  // --- Popcount helper ---
  function popcnt8(v) {
    v = v - ((v >> 1) & 0x55);
    v = (v & 0x33) + ((v >> 2) & 0x33);
    return (v + (v >> 4)) & 0x0F;
  }

  // --- Initialize SPECSCII grids ---
  specsciiInitGrids(0x20, 0x38);

  // --- Process each 8x8 cell ---
  for (let cy = 0; cy < 24; cy++) {
    for (let cx = 0; cx < 32; cx++) {
      // Extract 8 bitmap bytes from SCR interleaved layout
      const cellBytes = new Uint8Array(8);
      for (let line = 0; line < 8; line++) {
        const y = cy * 8 + line;
        const third = y >> 6;
        const charRow = (y >> 3) & 7;
        const pixelLine = y & 7;
        const offset = third * 2048 + pixelLine * 256 + charRow * 32 + cx;
        cellBytes[line] = screenData[offset];
      }

      // Read attribute
      const attr = screenData[6144 + cy * 32 + cx];
      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr >> 6) & 0x01;
      const flash = (attr >> 7) & 0x01;
      const idx = cy * 32 + cx;

      // Hidden pixels check: if ink == paper, bitmap is invisible
      if (ink === paper) {
        specsciiCharGrid[idx] = 0x20; // space
        specsciiAttrGrid[idx] = attr;
        specsciiMask[idx] = 1;
        continue;
      }

      // Find best matching glyph
      let bestDist = 65; // max possible = 64 (8 bytes × 8 bits)
      let bestGlyph = 0;
      let bestInverted = false;

      for (let g = 0; g < GLYPH_COUNT; g++) {
        const gOff = g * 8;
        let normalDist = 0;
        let invertDist = 0;
        for (let line = 0; line < 8; line++) {
          normalDist += popcnt8(cellBytes[line] ^ glyphs[gOff + line]);
          invertDist += popcnt8(cellBytes[line] ^ (glyphs[gOff + line] ^ 0xFF));
        }
        // Prefer normal over inverted on tie (< not <=)
        if (normalDist < bestDist) {
          bestDist = normalDist;
          bestGlyph = g;
          bestInverted = false;
        }
        if (invertDist < bestDist) {
          bestDist = invertDist;
          bestGlyph = g;
          bestInverted = true;
        }
      }

      // Map glyph index to character code
      const charCode = bestGlyph < 96 ? (bestGlyph + 0x20) : (0x80 + (bestGlyph - 96));

      // Build output attribute
      let outAttr;
      if (bestInverted) {
        // Swap ink and paper, preserve bright and flash
        outAttr = (paper & 0x07) | ((ink & 0x07) << 3) | (bright << 6) | (flash << 7);
      } else {
        outAttr = attr;
      }

      specsciiCharGrid[idx] = charCode;
      specsciiAttrGrid[idx] = outAttr;
      specsciiMask[idx] = 1;
    }
  }

  // Generate SPECSCII stream from grids
  screenData = specsciiGridsToStream();

  // Switch format
  currentFormat = FORMAT.SPECSCII;
  currentPicture = null;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.specscii');

  // Standard UI updates
  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to ULA+ (add default palette)
 */
function convertScrToUlaPlus() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  // Create new screen data with palette appended
  const newData = new Uint8Array(ULAPLUS.TOTAL_SIZE);
  newData.set(screenData.slice(0, SCREEN.TOTAL_SIZE), 0);

  // Generate and append default ULA+ palette
  const defaultPalette = generateDefaultUlaPlusPalette();
  newData.set(defaultPalette, ULAPLUS.PALETTE_OFFSET);

  // Update state
  screenData = newData;
  currentFormat = FORMAT.SCR_ULAPLUS;
  ulaPlusPalette = defaultPalette.slice();
  isUlaPlusMode = true;
  resetUlaNextMode();
  resetUlaPlusColors();

  // Update internal picture format
  if (typeof importScrUlaPlus === 'function') {
    currentPicture = importScrUlaPlus(newData, currentFileName);
  }

  // Keep .scr extension (ULA+ files use same extension)

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert ULA+ to SCR (strip palette)
 */
function convertUlaPlusToScr() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid ULA+ data to convert');
    return;
  }

  saveUndoState();

  // Extract just the SCR data (first 6912 bytes)
  const newData = new Uint8Array(SCREEN.TOTAL_SIZE);
  newData.set(screenData.slice(0, SCREEN.TOTAL_SIZE), 0);

  // Update state
  screenData = newData;
  currentFormat = FORMAT.SCR;
  ulaPlusPalette = null;
  isUlaPlusMode = false;

  // Update internal picture format
  if (typeof importScr === 'function') {
    currentPicture = importScr(newData, currentFileName);
  }

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Updates Export dropdown options and visibility based on current format
 */
function updateExportAsmButton() {
  const exportSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorExportSelect'));
  const exportBtn = document.getElementById('editorExportBtn');
  const embedDataLabel = document.getElementById('editorEmbedDataLabel');
  const embedDataChk = document.getElementById('editorEmbedDataChk');
  if (!exportSelect || !exportBtn) return;

  const supportsAsm = currentFormat === FORMAT.BSC || currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH || currentFormat === FORMAT.RGB3 || currentFormat === FORMAT.IFL || currentFormat === FORMAT.SCR_ULAPLUS || currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD;
  const isSpecscii = currentFormat === FORMAT.SPECSCII;

  // Build export options based on current format
  const options = [];
  if (supportsAsm) {
    if (currentFormat === FORMAT.BSC) {
      options.push({ value: 'asm', label: 'ASM (Pentagon border)' });
    } else if (currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH) {
      options.push({ value: 'asm', label: 'ASM (Pentagon dual-screen)' });
    } else if (currentFormat === FORMAT.RGB3) {
      options.push({ value: 'asm', label: 'ASM (Pentagon RGB flicker)' });
    } else if (currentFormat === FORMAT.IFL) {
      options.push({ value: 'asm', label: 'ASM (Pentagon 8x2 multicolor)' });
    } else if (currentFormat === FORMAT.SCR_ULAPLUS) {
      options.push({ value: 'asm', label: 'ASM (ULA+ palette)' });
    } else if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
      options.push({ value: 'asm', label: 'ASM (Next Layer 2 .nex)' });
    } else if (currentFormat === FORMAT.LORES) {
      options.push({ value: 'asm', label: 'ASM (Next LoRes .nex)' });
    } else if (currentFormat === FORMAT.LORES_RAD) {
      options.push({ value: 'asm', label: 'ASM (Next LoRes Radastan .nex)' });
    }
  }
  if (isSpecscii) {
    options.push({ value: 'scr', label: '.scr (bitmap render)' });
    options.push({ value: 'tap', label: '.tap (BASIC program)' });
  }

  // Populate dropdown
  exportSelect.innerHTML = '';
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    exportSelect.appendChild(el);
  }

  const hasOptions = options.length > 0;
  exportSelect.style.display = hasOptions ? '' : 'none';
  exportBtn.style.display = hasOptions ? '' : 'none';

  // Embed checkbox: only for ASM formats (except RGB3 which always embeds)
  const supportsEmbed = supportsAsm && currentFormat !== FORMAT.RGB3;
  if (embedDataLabel) {
    embedDataLabel.style.display = supportsAsm ? 'inline' : 'none';
    embedDataLabel.style.opacity = supportsEmbed ? '1' : '0.5';
  }
  if (embedDataChk) {
    embedDataChk.disabled = !supportsEmbed;
  }
}

/**
 * Bitmap patterns for ATTR to SCR conversion
 */
const BITMAP_PATTERNS = {
  empty: { name: 'Empty', generate: () => 0x00 },
  solid: { name: 'Solid', generate: () => 0xFF },
  checker1: { name: 'Check 1px', generate: (x, y) => (y % 2 === 0) ? 0xAA : 0x55 },
  checker2: { name: 'Check 2px', generate: (x, y) => (Math.floor(y / 2) % 2 === 0) ? 0xCC : 0x33 },
  checker4: { name: 'Check 4px', generate: (x, y) => (Math.floor(y / 4) % 2 === 0) ? 0xF0 : 0x0F },
  hstripes1: { name: 'H-Strip 1', generate: (x, y) => (y % 2 === 0) ? 0xFF : 0x00 },
  hstripes2: { name: 'H-Strip 2', generate: (x, y) => (Math.floor(y / 2) % 2 === 0) ? 0xFF : 0x00 },
  hstripes4: { name: 'H-Strip 4', generate: (x, y) => (Math.floor(y / 4) % 2 === 0) ? 0xFF : 0x00 },
  vstripes1: { name: 'V-Strip 1', generate: () => 0xAA },
  vstripes2: { name: 'V-Strip 2', generate: () => 0xCC },
  vstripes4: { name: 'V-Strip 4', generate: () => 0xF0 },
  grid: { name: 'Grid', generate: (x, y) => (y % 8 === 0) ? 0xFF : 0x80 },
  dots: { name: 'Dots', generate: (x, y) => (y % 2 === 0) ? 0x88 : 0x22 },
  diagonal: { name: 'Diagonal', generate: (x, y) => (1 << (7 - (y % 8))) },
  brick: { name: 'Brick', generate: (x, y) => (y % 8 === 0) ? 0xFF : ((Math.floor(y / 4) % 2 === 0) ? 0x80 : 0x08) },
  dither25: { name: '25% Dith', generate: (x, y) => (y % 2 === 0) ? 0x88 : 0x00 },
  dither50: { name: '50% Dith', generate: (x, y) => (y % 2 === 0) ? 0xAA : 0x55 },
  dither75: { name: '75% Dith', generate: (x, y) => (y % 2 === 0) ? 0xEE : 0xBB }
};

/**
 * Generate bitmap data with pattern
 * @param {string} patternId - Pattern identifier
 * @returns {Uint8Array} 6144 bytes of bitmap data
 */
function generatePatternBitmap(patternId) {
  const pattern = BITMAP_PATTERNS[patternId] || BITMAP_PATTERNS.empty;
  const bitmap = new Uint8Array(SCREEN.BITMAP_SIZE);

  for (let y = 0; y < 192; y++) {
    // Use getBitmapAddress with x=0 to get line start offset
    const offset = getBitmapAddress(0, y);
    for (let x = 0; x < 32; x++) {
      bitmap[offset + x] = pattern.generate(x, y);
    }
  }

  return bitmap;
}

/**
 * Convert ATTR (.53c) to SCR - add pattern bitmap
 * @param {string} patternId - Pattern to use for bitmap
 */
function convertAttrToScr(patternId = 'empty') {
  if (!screenData || screenData.length < SCREEN.ATTR_SIZE) {
    alert('No valid ATTR data to convert');
    return;
  }

  saveUndoState();

  // Create new SCR with pattern bitmap + existing attributes
  const scrData = new Uint8Array(SCREEN.TOTAL_SIZE);
  // Generate bitmap pattern
  const bitmap = generatePatternBitmap(patternId);
  scrData.set(bitmap, 0);
  // Copy attributes
  scrData.set(screenData.slice(0, SCREEN.ATTR_SIZE), SCREEN.BITMAP_SIZE);

  // Update state
  screenData = scrData;
  currentFormat = FORMAT.SCR;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.scr');

  // Update internal picture format
  if (typeof importScr === 'function') {
    currentPicture = importScr(scrData, currentFileName);
  }

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert ATTR (.53c) to BSC - add pattern bitmap and border
 * @param {string} patternId - Pattern to use for bitmap
 * @param {number} borderColor - Border color index (0-7)
 */
function convertAttrToBsc(patternId, borderColor) {
  if (!screenData || screenData.length < SCREEN.ATTR_SIZE) {
    alert('No valid ATTR data to convert');
    return;
  }

  saveUndoState();

  // Create BSC data
  const bscData = new Uint8Array(BSC.TOTAL_SIZE);

  // Generate bitmap pattern
  const bitmap = generatePatternBitmap(patternId);
  bscData.set(bitmap, 0);

  // Copy attributes
  bscData.set(screenData.slice(0, SCREEN.ATTR_SIZE), SCREEN.BITMAP_SIZE);

  // Fill border data with solid color
  const borderByte = borderColor | (borderColor << 3);
  for (let i = BSC.BORDER_OFFSET; i < BSC.TOTAL_SIZE; i++) {
    bscData[i] = borderByte;
  }

  // Update state
  screenData = bscData;
  currentFormat = FORMAT.BSC;
  currentPicture = null;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bsc');

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  // Update Export ASM button visibility
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Show pattern picker dialog for ATTR to SCR/BSC conversion
 * @param {boolean} toBsc - If true, also ask for border color after pattern
 */
function showPatternPicker(toBsc) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex;
    justify-content: center; align-items: center; z-index: 10000;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: var(--bg-primary, #1e1e1e); padding: 16px; border-radius: 8px;
    border: 1px solid var(--border-color, #444); min-width: 360px;
  `;

  const title = document.createElement('div');
  title.textContent = 'Select bitmap pattern:';
  title.style.cssText = 'margin-bottom: 12px; font-size: 12px; color: var(--text-primary, #fff);';
  panel.appendChild(title);

  const patterns = document.createElement('div');
  patterns.style.cssText = 'display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;';

  for (const [id, pattern] of Object.entries(BITMAP_PATTERNS)) {
    const btn = document.createElement('button');
    btn.style.cssText = `
      padding: 6px 2px; font-size: 9px; cursor: pointer;
      background: var(--bg-secondary, #2d2d2d); border: 1px solid var(--border-primary, #666);
      color: var(--text-primary, #fff); white-space: nowrap;
    `;
    btn.textContent = pattern.name;
    btn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      if (toBsc) {
        // Show border color picker next
        showBorderColorPickerForAttr(id);
      } else {
        convertAttrToScr(id);
      }
    });
    patterns.appendChild(btn);
  }
  panel.appendChild(patterns);

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'margin-top: 12px; width: 100%; padding: 6px; font-size: 11px;';
  cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
  panel.appendChild(cancelBtn);

  dialog.appendChild(panel);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) document.body.removeChild(dialog);
  });

  document.body.appendChild(dialog);
}

/**
 * Show border color picker for ATTR to BSC conversion (after pattern selection)
 * @param {string} patternId - Previously selected pattern
 */
function showBorderColorPickerForAttr(patternId) {
  showBorderColorDialog(i => convertAttrToBsc(patternId, i));
}

/**
 * Convert BSC to SCR - strip border data
 */
function convertBscToScr() {
  if (!screenData || screenData.length < BSC.TOTAL_SIZE) {
    alert('No valid BSC data to convert');
    return;
  }

  saveUndoState();

  // Extract first 6912 bytes (SCR portion)
  const scrData = new Uint8Array(SCREEN.TOTAL_SIZE);
  scrData.set(screenData.slice(0, SCREEN.TOTAL_SIZE));

  // Update state
  screenData = scrData;
  currentFormat = FORMAT.SCR;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.scr');

  // Update internal picture format
  if (typeof importScr === 'function') {
    currentPicture = importScr(scrData, currentFileName);
  }

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  // Update Export ASM button visibility
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert BSC to BSP - add BSP header, keep border
 */
function convertBscToBsp() {
  if (!screenData || screenData.length < BSC.TOTAL_SIZE) {
    alert('No valid BSC data to convert');
    return;
  }

  saveUndoState();

  // screenData stays the same (BSC layout: screen + border at 6912)
  currentFormat = FORMAT.BSP;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bsp');

  // Create BSP picture
  if (typeof importBsc === 'function') {
    currentPicture = importBsc(screenData, currentFileName);
    if (currentPicture) {
      currentPicture.sourceFormat = 'bsp';
      currentPicture.bspTitle = '';
      currentPicture.bspAuthor = '';
      currentPicture.bspConfig = 0x40; // hasBorder
      currentPicture.bspBorderColor = 0;
    }
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert BSP to SCR - strip header and border, keep screen data
 */
function convertBspToScr() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid BSP data to convert');
    return;
  }

  saveUndoState();

  const scrData = new Uint8Array(SCREEN.TOTAL_SIZE);
  scrData.set(screenData.slice(0, SCREEN.TOTAL_SIZE));

  screenData = scrData;
  currentFormat = FORMAT.SCR;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.scr');

  if (typeof importScr === 'function') {
    currentPicture = importScr(scrData, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert BSP to BSC - strip BSP header metadata, keep border
 */
function convertBspToBsc() {
  if (!screenData || screenData.length < BSC.TOTAL_SIZE) {
    alert('No valid BSP data to convert');
    return;
  }

  saveUndoState();

  // screenData already in BSC layout, just change format
  currentFormat = FORMAT.BSC;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bsc');

  if (typeof importBsc === 'function') {
    currentPicture = importBsc(screenData, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to BSC - add solid border of chosen color
 * @param {number} borderColor - Border color index (0-7)
 */
function convertScrToBsc(borderColor) {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  // Create BSC data
  const bscData = new Uint8Array(BSC.TOTAL_SIZE);

  // Copy SCR data (first 6912 bytes)
  bscData.set(screenData.slice(0, SCREEN.TOTAL_SIZE));

  // Fill border data with solid color
  // Each byte stores 2 colors: bits 0-2 = first, bits 3-5 = second
  const borderByte = borderColor | (borderColor << 3);
  for (let i = BSC.BORDER_OFFSET; i < BSC.TOTAL_SIZE; i++) {
    bscData[i] = borderByte;
  }

  // Update state
  screenData = bscData;
  currentFormat = FORMAT.BSC;
  currentPicture = null;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bsc');

  // Mark picture as modified and sync state
  markPictureModified();
  saveCurrentPictureState();

  // Update UI
  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  // Update Export ASM button visibility
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Show border color picker dialog and invoke callback with selected color index
 * @param {function(number): void} callback - Called with color index 0-7
 */
function showBorderColorDialog(callback) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex;
    justify-content: center; align-items: center; z-index: 10000;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: var(--bg-primary, #1e1e1e); padding: 16px; border-radius: 8px;
    border: 1px solid var(--border-color, #444); min-width: 200px;
  `;

  const title = document.createElement('div');
  title.textContent = 'Select border color:';
  title.style.cssText = 'margin-bottom: 12px; font-size: 12px; color: var(--text-primary, #fff);';
  panel.appendChild(title);

  const colors = document.createElement('div');
  colors.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;';

  const colorNames = ['Black', 'Blue', 'Red', 'Magenta', 'Green', 'Cyan', 'Yellow', 'White'];
  const colorValues = ['#000', '#0000d7', '#d70000', '#d700d7', '#00d700', '#00d7d7', '#d7d700', '#d7d7d7'];

  for (let i = 0; i < 8; i++) {
    const btn = document.createElement('button');
    btn.style.cssText = `
      width: 32px; height: 32px; border: 2px solid var(--border-primary, #666); cursor: pointer;
      background: ${colorValues[i]};
    `;
    btn.title = colorNames[i];
    btn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      callback(i);
    });
    colors.appendChild(btn);
  }
  panel.appendChild(colors);

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'margin-top: 12px; width: 100%; padding: 6px; font-size: 11px;';
  cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
  panel.appendChild(cancelBtn);

  dialog.appendChild(panel);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) document.body.removeChild(dialog);
  });

  document.body.appendChild(dialog);
}

/**
 * Convert SCR to IFL - replicate 8×8 attrs to 8×2 (×4 per cell row)
 */
function convertScrToIfl() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  const iflData = new Uint8Array(IFL.TOTAL_SIZE);

  // Copy bitmap unchanged (6144 bytes)
  iflData.set(screenData.slice(0, SCREEN.BITMAP_SIZE));

  // Replicate each SCR attr row (24 rows) to 4 IFL attr rows (96 total)
  for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
    const srcOffset = SCREEN.BITMAP_SIZE + row * SCREEN.CHAR_COLS;
    for (let rep = 0; rep < 4; rep++) {
      const dstOffset = IFL.BITMAP_SIZE + (row * 4 + rep) * IFL.ATTR_COLS;
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        iflData[dstOffset + col] = screenData[srcOffset + col];
      }
    }
  }

  screenData = iflData;
  currentFormat = FORMAT.IFL;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.ifl');

  if (typeof importPicture === 'function') {
    currentPicture = importPicture(FORMAT.IFL, iflData, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to MLT - replicate 8×8 attrs to 8×1 (×8 per cell row)
 */
function convertScrToMlt() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  const mltData = new Uint8Array(MLT.TOTAL_SIZE);

  // Copy bitmap unchanged (6144 bytes)
  mltData.set(screenData.slice(0, SCREEN.BITMAP_SIZE));

  // Replicate each SCR attr row (24 rows) to 8 MLT attr rows (192 total)
  for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
    const srcOffset = SCREEN.BITMAP_SIZE + row * SCREEN.CHAR_COLS;
    for (let rep = 0; rep < 8; rep++) {
      const dstOffset = MLT.BITMAP_SIZE + (row * 8 + rep) * MLT.ATTR_COLS;
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        mltData[dstOffset + col] = screenData[srcOffset + col];
      }
    }
  }

  screenData = mltData;
  currentFormat = FORMAT.MLT;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.mlt');

  if (typeof importPicture === 'function') {
    currentPicture = importPicture(FORMAT.MLT, mltData, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to BMC4 - replicate 8×8 attrs to both 8×4 banks + border
 * @param {number} borderColor - Border color index (0-7)
 */
function convertScrToBmc4(borderColor) {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  const bmc4Data = new Uint8Array(BMC4.TOTAL_SIZE);

  // Copy bitmap (6144 bytes)
  bmc4Data.set(screenData.slice(0, SCREEN.BITMAP_SIZE));

  // Copy 768-byte attr block to both BMC4 attr banks
  const attrSrc = screenData.slice(SCREEN.BITMAP_SIZE, SCREEN.TOTAL_SIZE);
  bmc4Data.set(attrSrc, BMC4.ATTR1_OFFSET);
  bmc4Data.set(attrSrc, BMC4.ATTR2_OFFSET);

  // Fill border with selected color (same encoding as BSC)
  const borderByte = borderColor | (borderColor << 3);
  for (let i = BMC4.BORDER_OFFSET; i < BMC4.TOTAL_SIZE; i++) {
    bmc4Data[i] = borderByte;
  }

  screenData = bmc4Data;
  currentFormat = FORMAT.BMC4;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bmc4');

  if (typeof importPicture === 'function') {
    currentPicture = importPicture(FORMAT.BMC4, bmc4Data, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to Gigascreen - duplicate SCR to both frames
 */
function convertScrToGigascreen() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  const gigaData = new Uint8Array(GIGASCREEN.TOTAL_SIZE);

  // Copy 6912 bytes to frame1 (offset 0) and frame2 (offset 6912)
  const scrSlice = screenData.slice(0, SCREEN.TOTAL_SIZE);
  gigaData.set(scrSlice, GIGASCREEN.FRAME1_OFFSET);
  gigaData.set(scrSlice, GIGASCREEN.FRAME2_OFFSET);

  screenData = gigaData;
  currentFormat = FORMAT.GIGASCREEN;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.img');

  if (typeof importPicture === 'function') {
    currentPicture = importPicture(FORMAT.GIGASCREEN, gigaData, currentFileName);
  }

  if (typeof generateGigascreenVirtualPalette === 'function') {
    generateGigascreenVirtualPalette();
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SCR to NXI - convert 1-bit+attrs to 8-bit indexed with embedded palette
 */
function convertScrToNxi() {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) {
    alert('No valid SCR data to convert');
    return;
  }

  saveUndoState();

  const nxiData = new Uint8Array(NXI.TOTAL_SIZE);

  // Build 512-byte NXI palette: indices 0-7 = regular ZX colors, 8-15 = bright
  const zxRegular = [
    [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215],
    [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215]
  ];
  const zxBright = [
    [0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255],
    [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255]
  ];

  // Encode palette entries to RGB333 format
  for (let i = 0; i < 16; i++) {
    const rgb = i < 8 ? zxRegular[i] : zxBright[i - 8];
    const r3 = Math.round(rgb[0] * 7 / 255);
    const g3 = Math.round(rgb[1] * 7 / 255);
    const b3 = Math.round(rgb[2] * 7 / 255);
    // byte0 = RRRGGGBB (top 2 bits of blue), byte1 = P000000B (LSB of blue)
    nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxiData[i * 2 + 1] = b3 & 1;
  }
  // Remaining palette entries (16-255) stay at 0 (black)

  // Convert each pixel: read attr → determine ink/paper/bright → get palette index
  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    const attrRow = Math.floor(y / 8);
    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const attr = screenData[SCREEN.BITMAP_SIZE + attrRow * SCREEN.CHAR_COLS + col];
      const inkIndex = attr & 0x07;
      const paperIndex = (attr >> 3) & 0x07;
      const isBright = (attr & 0x40) !== 0;
      const inkPaletteIdx = isBright ? inkIndex + 8 : inkIndex;
      const paperPaletteIdx = isBright ? paperIndex + 8 : paperIndex;

      // Read bitmap byte
      const bitmapAddr = getBitmapAddress(col * 8, y);
      const bitmapByte = screenData[bitmapAddr];

      for (let bit = 0; bit < 8; bit++) {
        const x = col * 8 + bit;
        const isInk = (bitmapByte >> (7 - bit)) & 1;
        nxiData[NXI.PIXEL_OFFSET + y * NXI.WIDTH + x] = isInk ? inkPaletteIdx : paperPaletteIdx;
      }
    }
  }

  screenData = nxiData;
  currentFormat = FORMAT.NXI;
  nxiLayer2Mode = '256x192';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.nxi');
  currentPicture = null;

  if (typeof parseNxiPalette === 'function') {
    nxiResolvedPalette = parseNxiPalette(nxiData);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert IFL to MLT - replicate 8×2 attrs to 8×1 (×2 per IFL row)
 */
function convertIflToMlt() {
  if (!screenData || screenData.length < IFL.TOTAL_SIZE) {
    alert('No valid IFL data to convert');
    return;
  }

  saveUndoState();

  const mltData = new Uint8Array(MLT.TOTAL_SIZE);

  // Copy bitmap unchanged (6144 bytes)
  mltData.set(screenData.slice(0, IFL.BITMAP_SIZE));

  // Replicate each IFL attr row (96 rows) to 2 MLT attr rows (192 total)
  for (let row = 0; row < IFL.ATTR_ROWS; row++) {
    const srcOffset = IFL.BITMAP_SIZE + row * IFL.ATTR_COLS;
    for (let rep = 0; rep < 2; rep++) {
      const dstOffset = MLT.BITMAP_SIZE + (row * 2 + rep) * MLT.ATTR_COLS;
      for (let col = 0; col < IFL.ATTR_COLS; col++) {
        mltData[dstOffset + col] = screenData[srcOffset + col];
      }
    }
  }

  screenData = mltData;
  currentFormat = FORMAT.MLT;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.mlt');

  if (typeof importPicture === 'function') {
    currentPicture = importPicture(FORMAT.MLT, mltData, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert BSC to BMC4 - replicate 8×8 attrs to both 8×4 banks, keep border
 */
function convertBscToBmc4() {
  if (!screenData || screenData.length < BSC.TOTAL_SIZE) {
    alert('No valid BSC data to convert');
    return;
  }

  saveUndoState();

  const bmc4Data = new Uint8Array(BMC4.TOTAL_SIZE);

  // Copy bitmap (6144 bytes)
  bmc4Data.set(screenData.slice(0, SCREEN.BITMAP_SIZE));

  // Copy 768-byte attr block to both BMC4 attr banks
  const attrSrc = screenData.slice(SCREEN.BITMAP_SIZE, SCREEN.TOTAL_SIZE);
  bmc4Data.set(attrSrc, BMC4.ATTR1_OFFSET);
  bmc4Data.set(attrSrc, BMC4.ATTR2_OFFSET);

  // Copy border data (4224 bytes)
  bmc4Data.set(screenData.slice(BSC.BORDER_OFFSET, BSC.TOTAL_SIZE), BMC4.BORDER_OFFSET);

  screenData = bmc4Data;
  currentFormat = FORMAT.BMC4;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bmc4');

  if (typeof importPicture === 'function') {
    currentPicture = importPicture(FORMAT.BMC4, bmc4Data, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert Gigascreen to BSP - wrap gigascreen data with BSP metadata
 */
function convertGigascreenToBsp() {
  if (!screenData || screenData.length < GIGASCREEN.TOTAL_SIZE) {
    alert('No valid Gigascreen data to convert');
    return;
  }

  saveUndoState();

  // screenData stays unchanged (gigascreen layout: 2×6912)
  currentFormat = FORMAT.BSP;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.bsp');

  // Create BSP picture via importGigascreen
  if (typeof importGigascreen === 'function') {
    currentPicture = importGigascreen(screenData, currentFileName);
    if (currentPicture) {
      currentPicture.sourceFormat = 'bsp';
      currentPicture.bspTitle = '';
      currentPicture.bspAuthor = '';
      currentPicture.bspConfig = BSP.FLAG_GIGA; // 0x80 = hasGiga, no border
      currentPicture.bspBorderColor = 0;
    }
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert NXI to SL2 - strip 512-byte palette, keep pixel data
 */
function convertNxiToSl2() {
  if (!screenData || screenData.length < NXI.TOTAL_SIZE) {
    alert('No valid NXI data to convert');
    return;
  }

  saveUndoState();

  // Extract pixel data (49152 bytes after 512-byte palette)
  const sl2Data = new Uint8Array(SL2.RAW_SIZE);
  sl2Data.set(screenData.slice(NXI.PIXEL_OFFSET, NXI.TOTAL_SIZE));

  screenData = sl2Data;
  currentFormat = FORMAT.SL2;
  nxiLayer2Mode = '256x192';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.sl2');
  currentPicture = null;

  // Keep nxiResolvedPalette in memory for current session rendering

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SL2 to NXI - embed current palette (or default) as 512-byte header
 */
function convertSl2ToNxi() {
  if (!screenData) {
    alert('No valid SL2 data to convert');
    return;
  }

  saveUndoState();

  // Get pixel data offset (handles raw vs header SL2)
  const pixelOffset = typeof getNxiPixelOffset === 'function' ? getNxiPixelOffset() : 0;
  const pixelSize = screenData.length - pixelOffset;

  const nxiData = new Uint8Array(NXI.TOTAL_SIZE);

  // Encode current palette (or generate default) to 512-byte RGB333
  const palette = nxiResolvedPalette ||
    (typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null);

  if (palette) {
    for (let i = 0; i < NXI.PALETTE_ENTRIES; i++) {
      const rgb = palette[i] || [0, 0, 0];
      const r3 = Math.round(rgb[0] * 7 / 255);
      const g3 = Math.round(rgb[1] * 7 / 255);
      const b3 = Math.round(rgb[2] * 7 / 255);
      nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
      nxiData[i * 2 + 1] = b3 & 1;
    }
  }

  // Copy pixel data
  const copyLen = Math.min(pixelSize, SL2.RAW_SIZE);
  nxiData.set(screenData.slice(pixelOffset, pixelOffset + copyLen), NXI.PIXEL_OFFSET);

  screenData = nxiData;
  currentFormat = FORMAT.NXI;
  nxiLayer2Mode = '256x192';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.nxi');
  currentPicture = null;

  if (typeof parseNxiPalette === 'function') {
    nxiResolvedPalette = parseNxiPalette(nxiData);
  }

  markPictureModified();
  saveCurrentPictureState();

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

// ============================================================================
// Extended NXI/SL2 Conversions
// ============================================================================

/**
 * Convert NXI 320×256 to SL2 320×256 - strip 512-byte palette header
 */
function convertNxi320ToSl2() {
  if (!screenData || screenData.length < NXI.TOTAL_SIZE_320 || nxiLayer2Mode !== '320x256') {
    alert('No valid NXI 320×256 data to convert');
    return;
  }
  saveUndoState();
  const sl2Data = new Uint8Array(SL2.EXT_SIZE);
  sl2Data.set(screenData.slice(NXI.PIXEL_OFFSET, NXI.PIXEL_OFFSET + NXI.PIXEL_DATA_SIZE_EXT));
  screenData = sl2Data;
  currentFormat = FORMAT.SL2;
  nxiLayer2Mode = '320x256';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.sl2');
  currentPicture = null;
  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SL2 320×256 to NXI 320×256 - add 512-byte palette header
 */
function convertSl2_320ToNxi() {
  if (!screenData || screenData.length < SL2.EXT_SIZE || nxiLayer2Mode !== '320x256') {
    alert('No valid SL2 320×256 data to convert');
    return;
  }
  saveUndoState();
  const nxiData = new Uint8Array(NXI.TOTAL_SIZE_320);
  const palette = nxiResolvedPalette ||
    (typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null);
  if (palette) {
    for (let i = 0; i < NXI.PALETTE_ENTRIES; i++) {
      const rgb = palette[i] || [0, 0, 0];
      const r3 = Math.round(rgb[0] * 7 / 255);
      const g3 = Math.round(rgb[1] * 7 / 255);
      const b3 = Math.round(rgb[2] * 7 / 255);
      nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
      nxiData[i * 2 + 1] = b3 & 1;
    }
  }
  nxiData.set(screenData.slice(0, NXI.PIXEL_DATA_SIZE_EXT), NXI.PIXEL_OFFSET);
  screenData = nxiData;
  currentFormat = FORMAT.NXI;
  nxiLayer2Mode = '320x256';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.nxi');
  currentPicture = null;
  if (typeof parseNxiPalette === 'function') {
    nxiResolvedPalette = parseNxiPalette(nxiData);
  }
  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert NXI 640×256 to SL2 640×256 - strip 32-byte palette header
 */
function convertNxi640ToSl2() {
  if (!screenData || screenData.length < NXI.TOTAL_SIZE_640 || nxiLayer2Mode !== '640x256') {
    alert('No valid NXI 640×256 data to convert');
    return;
  }
  saveUndoState();
  const sl2Data = new Uint8Array(SL2.EXT_SIZE);
  sl2Data.set(screenData.slice(NXI.PIXEL_OFFSET_4BPP, NXI.PIXEL_OFFSET_4BPP + NXI.PIXEL_DATA_SIZE_EXT));
  screenData = sl2Data;
  currentFormat = FORMAT.SL2;
  nxiLayer2Mode = '640x256';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.sl2');
  currentPicture = null;
  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert SL2 640×256 to NXI 640×256 - add 32-byte palette header (16 entries)
 */
function convertSl2_640ToNxi() {
  if (!screenData || screenData.length < SL2.EXT_SIZE || nxiLayer2Mode !== '640x256') {
    alert('No valid SL2 640×256 data to convert');
    return;
  }
  saveUndoState();
  const nxiData = new Uint8Array(NXI.TOTAL_SIZE_640);
  const palette = nxiResolvedPalette ||
    (typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : null);
  if (palette) {
    const count = Math.min(palette.length, NXI.PALETTE_ENTRIES_4BPP);
    for (let i = 0; i < count; i++) {
      const rgb = palette[i] || [0, 0, 0];
      const r3 = Math.round(rgb[0] * 7 / 255);
      const g3 = Math.round(rgb[1] * 7 / 255);
      const b3 = Math.round(rgb[2] * 7 / 255);
      nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
      nxiData[i * 2 + 1] = b3 & 1;
    }
  }
  nxiData.set(screenData.slice(0, NXI.PIXEL_DATA_SIZE_EXT), NXI.PIXEL_OFFSET_4BPP);
  screenData = nxiData;
  currentFormat = FORMAT.NXI;
  nxiLayer2Mode = '640x256';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.nxi');
  currentPicture = null;
  if (typeof parseNxi4bppPalette === 'function') {
    nxiResolvedPalette = parseNxi4bppPalette(nxiData);
  }
  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Helper: render current screen content to an RGBA canvas (no border, no zoom, no grid).
 * Used for lossy format conversions via canvas re-rendering.
 * @returns {HTMLCanvasElement|null}
 */
function renderCurrentToRgbaCanvas() {
  const dims = getFormatDimensions(currentFormat);
  const w = currentPicture ? currentPicture.width : dims.width;
  const h = currentPicture ? currentPicture.height : dims.height;
  const scaleY = getPixelScaleY();

  // Save and override render globals
  const savedZoom = zoom;
  const savedBorder = borderSize;
  const savedGrid = gridSize;
  const savedSubgrid = subgridSize;
  const savedCanvas = screenCanvas;
  const savedCtx = screenCanvasCtx;
  const savedShowRef = showReference;
  const savedFlash = flashPhase;
  const savedLastW = lastCanvasWidth;
  const savedLastH = lastCanvasHeight;

  const tempCanvas = document.createElement('canvas');
  // Account for scaleY (640×256 mode has 2× vertical stretch)
  tempCanvas.width = w;
  tempCanvas.height = h * scaleY;
  const tempCtx = tempCanvas.getContext('2d');

  zoom = 1;
  borderSize = 0;
  gridSize = 0;
  subgridSize = 0;
  screenCanvas = tempCanvas;
  screenCanvasCtx = tempCtx;
  showReference = false;
  flashPhase = false;

  renderScreen();

  // Restore globals
  zoom = savedZoom;
  borderSize = savedBorder;
  gridSize = savedGrid;
  subgridSize = savedSubgrid;
  screenCanvas = savedCanvas;
  screenCanvasCtx = savedCtx;
  showReference = savedShowRef;
  flashPhase = savedFlash;
  lastCanvasWidth = savedLastW;
  lastCanvasHeight = savedLastH;

  // If scaleY > 1, the rendered image is vertically stretched.
  // For conversions we want the logical pixel dimensions, so scale back down.
  if (scaleY > 1) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d');
    outCtx.drawImage(tempCanvas, 0, 0, w, h);
    return outCanvas;
  }

  return tempCanvas;
}

/**
 * Helper: finalize state after a lossy conversion to NXI/SL2.
 * Sets globals, parses palette, updates UI.
 * @param {Uint8Array} data - new screenData
 * @param {string} format - FORMAT.NXI or FORMAT.SL2
 * @param {string} mode - '256x192' | '320x256' | '640x256'
 * @param {string} ext - file extension without dot
 */
function finishLossyConversion(data, format, mode, ext) {
  screenData = data;
  currentFormat = format;
  nxiLayer2Mode = mode;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.' + ext);
  currentPicture = null;

  if (format === FORMAT.NXI) {
    if (mode === '640x256' && typeof parseNxi4bppPalette === 'function') {
      nxiResolvedPalette = parseNxi4bppPalette(data);
    } else if (typeof parseNxiPalette === 'function') {
      nxiResolvedPalette = parseNxiPalette(data);
    }
  } else if (format === FORMAT.SL2) {
    if (mode === '640x256') {
      nxiResolvedPalette = typeof generateDefaultNext4bppPalette === 'function' ?
        generateDefaultNext4bppPalette() : null;
    } else {
      nxiResolvedPalette = typeof generateDefaultNextPalette === 'function' ?
        generateDefaultNextPalette() : null;
    }
  }

  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Helper: quantize RGBA canvas pixels to Next 8bpp palette, write column-major buffer.
 * @param {HTMLCanvasElement} canvas - source RGBA canvas (must be exact target dimensions)
 * @param {number} width - target width (256 or 320)
 * @param {number} height - target height (192 or 256)
 * @param {number[][]} palette - palette entries [r,g,b] (256 entries)
 * @returns {Uint8Array} pixel data, column-major for 320×256, row-major for 256×192
 */
function quantizeCanvasToNext8bpp(canvas, width, height, palette) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, width, height);
  const src = imgData.data;
  const pixelData = new Uint8Array(width * height);

  // Build lookup: find nearest palette entry for each pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const r = src[si], g = src[si + 1], b = src[si + 2];
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2];
        const dr = r - pr, dg = g - pg, db = b - pb;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      if (width === 320 && height === 256) {
        // Column-major for 320×256
        pixelData[x * height + y] = bestIdx;
      } else {
        // Row-major for 256×192
        pixelData[y * width + x] = bestIdx;
      }
    }
  }
  return pixelData;
}

/**
 * Helper: quantize RGBA canvas pixels to Next 4bpp palette, write column-major packed buffer.
 * @param {HTMLCanvasElement} canvas - source RGBA canvas (640×256)
 * @param {number[][]} palette - 16-color palette entries [r,g,b]
 * @returns {Uint8Array} pixel data (81920 bytes), column-major, 2 pixels per byte
 */
function quantizeCanvasToNext4bpp(canvas, palette) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, 640, 256);
  const src = imgData.data;
  const pixelData = new Uint8Array(NXI.PIXEL_DATA_SIZE_EXT);

  for (let x = 0; x < 640; x += 2) {
    const col = (x >> 1) * 256;
    for (let y = 0; y < 256; y++) {
      // Left pixel (even x)
      const si0 = (y * 640 + x) * 4;
      let best0 = 0, bestD0 = Infinity;
      for (let i = 0; i < 16; i++) {
        const dr = src[si0] - palette[i][0], dg = src[si0 + 1] - palette[i][1], db = src[si0 + 2] - palette[i][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD0) { bestD0 = d; best0 = i; }
      }
      // Right pixel (odd x+1)
      const si1 = (y * 640 + x + 1) * 4;
      let best1 = 0, bestD1 = Infinity;
      for (let i = 0; i < 16; i++) {
        const dr = src[si1] - palette[i][0], dg = src[si1 + 1] - palette[i][1], db = src[si1 + 2] - palette[i][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD1) { bestD1 = d; best1 = i; }
      }
      pixelData[col + y] = (best0 << 4) | best1;
    }
  }
  return pixelData;
}

/**
 * Convert any format → NXI 320×256 (lossy: render to canvas, scale, quantize)
 */
function convertXformToNxi320() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  // Scale to 320×256
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 320;
  scaledCanvas.height = 256;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 320, 256);

  const palette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!palette) return;

  const pixelData = quantizeCanvasToNext8bpp(scaledCanvas, 320, 256, palette);
  const nxiData = new Uint8Array(NXI.TOTAL_SIZE_320);

  // Write palette
  for (let i = 0; i < 256; i++) {
    const rgb = palette[i];
    const r3 = Math.round(rgb[0] * 7 / 255);
    const g3 = Math.round(rgb[1] * 7 / 255);
    const b3 = Math.round(rgb[2] * 7 / 255);
    nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxiData[i * 2 + 1] = b3 & 1;
  }
  nxiData.set(pixelData, NXI.PIXEL_OFFSET);

  finishLossyConversion(nxiData, FORMAT.NXI, '320x256', 'nxi');
}

/**
 * Convert any format → NXI 640×256 (lossy: render to canvas, scale, quantize to 4bpp)
 */
function convertXformToNxi640() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  // Scale to 640×256
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 640;
  scaledCanvas.height = 256;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 640, 256);

  const palette = typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : null;
  if (!palette) return;

  const pixelData = quantizeCanvasToNext4bpp(scaledCanvas, palette);
  const nxiData = new Uint8Array(NXI.TOTAL_SIZE_640);

  // Write 16-entry palette
  for (let i = 0; i < 16; i++) {
    const rgb = palette[i];
    const r3 = Math.round(rgb[0] * 7 / 255);
    const g3 = Math.round(rgb[1] * 7 / 255);
    const b3 = Math.round(rgb[2] * 7 / 255);
    nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxiData[i * 2 + 1] = b3 & 1;
  }
  nxiData.set(pixelData, NXI.PIXEL_OFFSET_4BPP);

  finishLossyConversion(nxiData, FORMAT.NXI, '640x256', 'nxi');
}

/**
 * Convert any format → SL2 320×256 (lossy: render to canvas, scale, quantize)
 */
function convertXformToSl2_320() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 320;
  scaledCanvas.height = 256;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 320, 256);

  const palette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!palette) return;

  const pixelData = quantizeCanvasToNext8bpp(scaledCanvas, 320, 256, palette);
  const sl2Data = new Uint8Array(SL2.EXT_SIZE);
  sl2Data.set(pixelData);

  finishLossyConversion(sl2Data, FORMAT.SL2, '320x256', 'sl2');
}

/**
 * Convert any format → SL2 640×256 (lossy: render to canvas, scale, quantize to 4bpp)
 */
function convertXformToSl2_640() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 640;
  scaledCanvas.height = 256;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 640, 256);

  const palette = typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : null;
  if (!palette) return;

  const pixelData = quantizeCanvasToNext4bpp(scaledCanvas, palette);
  const sl2Data = new Uint8Array(SL2.EXT_SIZE);
  sl2Data.set(pixelData);

  finishLossyConversion(sl2Data, FORMAT.SL2, '640x256', 'sl2');
}

/**
 * Convert NXI/SL2 any mode → NXI 256×192 (lossy for extended modes: render, scale down, quantize)
 */
function convertXformToNxi256() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 256;
  scaledCanvas.height = 192;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 256, 192);

  const palette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!palette) return;

  const pixelData = quantizeCanvasToNext8bpp(scaledCanvas, 256, 192, palette);
  const nxiData = new Uint8Array(NXI.TOTAL_SIZE);

  // Write palette
  for (let i = 0; i < 256; i++) {
    const rgb = palette[i];
    const r3 = Math.round(rgb[0] * 7 / 255);
    const g3 = Math.round(rgb[1] * 7 / 255);
    const b3 = Math.round(rgb[2] * 7 / 255);
    nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxiData[i * 2 + 1] = b3 & 1;
  }
  nxiData.set(pixelData, NXI.PIXEL_OFFSET);

  finishLossyConversion(nxiData, FORMAT.NXI, '256x192', 'nxi');
}

/**
 * Convert NXI/SL2 any mode → SL2 256×192 (lossy for extended modes: render, scale down, quantize)
 */
function convertXformToSl2_256() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 256;
  scaledCanvas.height = 192;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 256, 192);

  const palette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!palette) return;

  const pixelData = quantizeCanvasToNext8bpp(scaledCanvas, 256, 192, palette);
  const sl2Data = new Uint8Array(SL2.RAW_SIZE);
  sl2Data.set(pixelData);

  finishLossyConversion(sl2Data, FORMAT.SL2, '256x192', 'sl2');
}

/**
 * Convert any format → SCR (lossy: render to canvas, scale to 256×192, quantize to ZX attributes)
 */
function convertAnyToScr() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  // Scale to 256×192
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 256;
  scaledCanvas.height = 192;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 256, 192);

  const ctx = scaledCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, 256, 192);
  const src = imgData.data;

  // ZX Spectrum colors
  const zxColors = [
    [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215],
    [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215],
    [0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255],
    [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255]
  ];

  const scrData = new Uint8Array(SCREEN.TOTAL_SIZE);

  // Process each 8×8 character cell
  for (let charRow = 0; charRow < 24; charRow++) {
    for (let charCol = 0; charCol < 32; charCol++) {
      // Find average colors for ink and paper in this cell
      // Collect all pixel colors in the cell
      const cellPixels = [];
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = charCol * 8 + dx;
          const py = charRow * 8 + dy;
          const si = (py * 256 + px) * 4;
          cellPixels.push([src[si], src[si + 1], src[si + 2]]);
        }
      }

      // Find best 2-color pair (ink + paper) from ZX palette
      // Try all combinations of bright=0 and bright=1 pairs
      let bestInk = 0, bestPaper = 7, bestBright = 0, bestError = Infinity;

      for (let bright = 0; bright <= 1; bright++) {
        const base = bright ? 8 : 0;
        for (let ink = 0; ink < 8; ink++) {
          for (let paper = ink; paper < 8; paper++) {
            const inkRgb = zxColors[base + ink];
            const paperRgb = zxColors[base + paper];
            let totalError = 0;
            for (const px of cellPixels) {
              const dInk = (px[0] - inkRgb[0]) ** 2 + (px[1] - inkRgb[1]) ** 2 + (px[2] - inkRgb[2]) ** 2;
              const dPaper = (px[0] - paperRgb[0]) ** 2 + (px[1] - paperRgb[1]) ** 2 + (px[2] - paperRgb[2]) ** 2;
              totalError += Math.min(dInk, dPaper);
            }
            if (totalError < bestError) {
              bestError = totalError;
              bestInk = ink;
              bestPaper = paper;
              bestBright = bright;
            }
          }
        }
      }

      // Write attribute
      const attrOffset = SCREEN.BITMAP_SIZE + charRow * 32 + charCol;
      scrData[attrOffset] = bestInk | (bestPaper << 3) | (bestBright ? 0x40 : 0);

      // Write bitmap using chosen colors
      const inkRgb = zxColors[(bestBright ? 8 : 0) + bestInk];
      const paperRgb = zxColors[(bestBright ? 8 : 0) + bestPaper];

      for (let dy = 0; dy < 8; dy++) {
        let bitmapByte = 0;
        for (let dx = 0; dx < 8; dx++) {
          const px = cellPixels[dy * 8 + dx];
          const dInk = (px[0] - inkRgb[0]) ** 2 + (px[1] - inkRgb[1]) ** 2 + (px[2] - inkRgb[2]) ** 2;
          const dPaper = (px[0] - paperRgb[0]) ** 2 + (px[1] - paperRgb[1]) ** 2 + (px[2] - paperRgb[2]) ** 2;
          if (dInk <= dPaper) {
            bitmapByte |= (0x80 >> dx);
          }
        }
        const bitmapAddr = getBitmapAddress(charCol * 8, charRow * 8 + dy);
        scrData[bitmapAddr] = bitmapByte;
      }
    }
  }

  screenData = scrData;
  currentFormat = FORMAT.SCR;
  nxiLayer2Mode = '256x192';
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.scr');

  if (typeof importScr === 'function') {
    currentPicture = importScr(scrData, currentFileName);
  }

  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

// ============================================================================
// LoRes Cross-Format Conversions
// ============================================================================

/**
 * Convert any format → LoRes 128×96 (lossy: render to canvas, downscale, quantize to 256 RGB332 colors)
 */
function convertAnyToLores() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  // Downscale to 128×96
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 128;
  scaledCanvas.height = 96;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 128, 96);

  const palette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!palette) return;

  // Quantize to nearest RGB332 palette entry (row-major, 128×96)
  const ctx = scaledCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, 128, 96);
  const src = imgData.data;
  const pixelData = new Uint8Array(LORES.PIXEL_DATA_SIZE);

  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      const si = (y * 128 + x) * 4;
      const r = src[si], g = src[si + 1], b = src[si + 2];
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < 256; i++) {
        const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2];
        const dr = r - pr, dg = g - pg, db = b - pb;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      pixelData[y * 128 + x] = bestIdx;
    }
  }

  screenData = pixelData;
  currentFormat = FORMAT.LORES;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.slr');
  currentPicture = null;
  nxiResolvedPalette = palette;

  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert LoRes → NXI 256×192 (upscale 2×, build NXI with RGB332 palette)
 */
function convertLoresToNxi() {
  if (!screenData || screenData.length < LORES.PIXEL_DATA_SIZE) {
    alert('No valid LoRes data to convert');
    return;
  }

  saveUndoState();

  const palette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!palette) return;

  const nxiData = new Uint8Array(NXI.TOTAL_SIZE);

  // Write 256-entry RGB333 palette (512 bytes)
  for (let i = 0; i < 256; i++) {
    const rgb = palette[i];
    const r3 = Math.round(rgb[0] * 7 / 255);
    const g3 = Math.round(rgb[1] * 7 / 255);
    const b3 = Math.round(rgb[2] * 7 / 255);
    nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxiData[i * 2 + 1] = b3 & 1;
  }

  // Upscale 128×96 → 256×192 (2× nearest-neighbor)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      const palIdx = screenData[y * 128 + x];
      const dx = x * 2;
      const dy = y * 2;
      nxiData[NXI.PIXEL_OFFSET + dy * 256 + dx] = palIdx;
      nxiData[NXI.PIXEL_OFFSET + dy * 256 + dx + 1] = palIdx;
      nxiData[NXI.PIXEL_OFFSET + (dy + 1) * 256 + dx] = palIdx;
      nxiData[NXI.PIXEL_OFFSET + (dy + 1) * 256 + dx + 1] = palIdx;
    }
  }

  finishLossyConversion(nxiData, FORMAT.NXI, '256x192', 'nxi');
}

/**
 * Convert LoRes → SL2 256×192 (upscale 2×, quantize to default Next palette)
 */
function convertLoresToSl2() {
  if (!screenData || screenData.length < LORES.PIXEL_DATA_SIZE) {
    alert('No valid LoRes data to convert');
    return;
  }

  saveUndoState();

  const sl2Data = new Uint8Array(SL2.RAW_SIZE);

  // Upscale 128×96 → 256×192 (2× nearest-neighbor)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      const palIdx = screenData[y * 128 + x];
      const dx = x * 2;
      const dy = y * 2;
      sl2Data[dy * 256 + dx] = palIdx;
      sl2Data[dy * 256 + dx + 1] = palIdx;
      sl2Data[(dy + 1) * 256 + dx] = palIdx;
      sl2Data[(dy + 1) * 256 + dx + 1] = palIdx;
    }
  }

  finishLossyConversion(sl2Data, FORMAT.SL2, '256x192', 'sl2');
}

/**
 * Convert LoRes Radastan → LoRes 256-color (expand 4bpp→8bpp, preserve palette indices)
 */
function convertLoresRadToLores() {
  if (!screenData || screenData.length < LORES_RAD.PIXEL_DATA_SIZE) {
    alert('No valid Radastan data to convert');
    return;
  }

  saveUndoState();

  const pixelData = new Uint8Array(LORES.PIXEL_DATA_SIZE);

  // Unpack 4bpp nibbles to 8bpp bytes (palette index preserved)
  for (let y = 0; y < LORES_RAD.HEIGHT; y++) {
    for (let x = 0; x < LORES_RAD.WIDTH; x++) {
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      const byteVal = screenData[byteOffset] || 0;
      const colorIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      pixelData[y * LORES.WIDTH + x] = colorIdx;
    }
  }

  screenData = pixelData;
  currentFormat = FORMAT.LORES;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.slr');
  currentPicture = null;
  nxiResolvedPalette = generateDefaultNextPalette();

  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

/**
 * Convert LoRes Radastan → NXI 256×192 (render + upscale 2×)
 */
function convertLoresRadToNxi() {
  if (!screenData || screenData.length < LORES_RAD.PIXEL_DATA_SIZE) {
    alert('No valid Radastan data to convert');
    return;
  }

  saveUndoState();

  const palette = typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : null;
  if (!palette) return;

  // Build full 256-entry RGB333 palette for NXI (first 16 from Radastan, rest default)
  const fullPalette = typeof generateDefaultNextPalette === 'function' ? generateDefaultNextPalette() : null;
  if (!fullPalette) return;

  const nxiData = new Uint8Array(NXI.TOTAL_SIZE);

  // Write 256-entry RGB333 palette (512 bytes)
  for (let i = 0; i < 256; i++) {
    const rgb = fullPalette[i];
    const r3 = Math.round(rgb[0] * 7 / 255);
    const g3 = Math.round(rgb[1] * 7 / 255);
    const b3 = Math.round(rgb[2] * 7 / 255);
    nxiData[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxiData[i * 2 + 1] = b3 & 1;
  }

  // Unpack and upscale 128×96 → 256×192 (2× nearest-neighbor)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      const byteVal = screenData[byteOffset] || 0;
      const palIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      const dx = x * 2;
      const dy = y * 2;
      nxiData[NXI.PIXEL_OFFSET + dy * 256 + dx] = palIdx;
      nxiData[NXI.PIXEL_OFFSET + dy * 256 + dx + 1] = palIdx;
      nxiData[NXI.PIXEL_OFFSET + (dy + 1) * 256 + dx] = palIdx;
      nxiData[NXI.PIXEL_OFFSET + (dy + 1) * 256 + dx + 1] = palIdx;
    }
  }

  finishLossyConversion(nxiData, FORMAT.NXI, '256x192', 'nxi');
}

/**
 * Convert LoRes Radastan → SL2 256×192 (render + upscale 2×)
 */
function convertLoresRadToSl2() {
  if (!screenData || screenData.length < LORES_RAD.PIXEL_DATA_SIZE) {
    alert('No valid Radastan data to convert');
    return;
  }

  saveUndoState();

  const sl2Data = new Uint8Array(SL2.RAW_SIZE);

  // Unpack and upscale 128×96 → 256×192 (2× nearest-neighbor)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      const byteVal = screenData[byteOffset] || 0;
      const palIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      const dx = x * 2;
      const dy = y * 2;
      sl2Data[dy * 256 + dx] = palIdx;
      sl2Data[dy * 256 + dx + 1] = palIdx;
      sl2Data[(dy + 1) * 256 + dx] = palIdx;
      sl2Data[(dy + 1) * 256 + dx + 1] = palIdx;
    }
  }

  finishLossyConversion(sl2Data, FORMAT.SL2, '256x192', 'sl2');
}

/**
 * Convert any format → LoRes Radastan (render, downscale 128×96, quantize to 16 colors, pack nibbles)
 */
function convertAnyToLoresRad() {
  saveUndoState();
  const srcCanvas = renderCurrentToRgbaCanvas();
  if (!srcCanvas) return;

  // Downscale to 128×96
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = 128;
  scaledCanvas.height = 96;
  const sctx = scaledCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(srcCanvas, 0, 0, 128, 96);

  const palette = typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : null;
  if (!palette) return;

  // Quantize to nearest of 16 palette entries, then pack into 4bpp nibbles
  const ctx = scaledCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, 128, 96);
  const src = imgData.data;
  const pixelData = new Uint8Array(LORES_RAD.PIXEL_DATA_SIZE);

  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      const si = (y * 128 + x) * 4;
      const r = src[si], g = src[si + 1], b = src[si + 2];
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < 16; i++) {
        const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2];
        const dr = r - pr, dg = g - pg, db = b - pb;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      if ((x & 1) === 0) {
        pixelData[byteOffset] = (bestIdx << 4);
      } else {
        pixelData[byteOffset] |= bestIdx;
      }
    }
  }

  screenData = pixelData;
  currentFormat = FORMAT.LORES_RAD;
  currentFileName = currentFileName.replace(/\.[^.]+$/, '.rad');
  currentPicture = null;
  nxiResolvedPalette = palette;

  markPictureModified();
  saveCurrentPictureState();
  if (typeof toggleFormatControlsVisibility === 'function') toggleFormatControlsVisibility();
  updateEditorColorPickers();
  updateExportAsmButton();
  updateConvertOptions();
  updateFileInfo();
  updatePictureTabBar();
  renderScreen();
  editorRender();
}

// ============================================================================
// Text Tool
// ============================================================================

/**
 * Initializes text tool with ROM font data
 */
function initTextTool() {
  // Copy ROM font data from screen_viewer.js if available
  if (typeof fontData !== 'undefined' && fontData.length >= 768) {
    textFont768Data = fontData.slice(0, 768);
    textFont768Name = typeof currentFontName !== 'undefined' ? currentFontName : 'ROM';
  }
  // Add ROM font to loaded fonts list
  if (loaded768Fonts.length === 0) {
    loaded768Fonts.push({ name: 'ROM', data: textFont768Data });
  }
  updateTextFontSelect();
}

/**
 * Updates the font select dropdown with available fonts
 */
function updateTextFontSelect() {
  const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('textFontSelect'));
  if (!select) return;

  select.innerHTML = '';

  // Add .768 fonts
  for (const font of loaded768Fonts) {
    const option = document.createElement('option');
    option.value = `spectrum:${font.name}`;
    option.textContent = `${font.name} (Spectrum)`;
    select.appendChild(option);
  }

  // Add TTF fonts
  for (const fontName of loadedTTFFonts) {
    const option = document.createElement('option');
    option.value = `ttf:${fontName}`;
    option.textContent = `${fontName} (TTF)`;
    select.appendChild(option);
  }

  // Add system fonts
  const systemFonts = ['Arial', 'Courier New', 'Times New Roman', 'Georgia', 'Verdana'];
  for (const fontName of systemFonts) {
    if (!loadedTTFFonts.includes(fontName)) {
      const option = document.createElement('option');
      option.value = `ttf:${fontName}`;
      option.textContent = `${fontName} (System)`;
      select.appendChild(option);
    }
  }

  updateTextFontIndicator();
}

/**
 * Updates the text font indicator
 */
function updateTextFontIndicator() {
  const indicator = document.getElementById('textToolFontIndicator');
  if (indicator) {
    indicator.textContent = textFontType === 'spectrum' ? textFont768Name : `${textFontTTF} ${textFontSize}px`;
  }
}

/**
 * Loads a .768 Spectrum font file
 * @param {File} file
 */
function loadFont768File(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target?.result;
    if (buffer instanceof ArrayBuffer) {
      const data = new Uint8Array(buffer);
      if (data.length >= 768) {
        const fontData = data.slice(0, 768);
        const fontName = file.name.replace(/\.(768|ch8|bin)$/i, '');

        // Check if font already loaded
        const existing = loaded768Fonts.findIndex(f => f.name === fontName);
        if (existing >= 0) {
          loaded768Fonts[existing].data = fontData;
        } else {
          loaded768Fonts.push({ name: fontName, data: fontData });
        }

        // Select this font
        textFontType = 'spectrum';
        textFont768Data = fontData;
        textFont768Name = fontName;
        updateTextFontSelect();

        // Set dropdown to this font
        const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('textFontSelect'));
        if (select) select.value = `spectrum:${fontName}`;
      } else {
        alert(`Invalid font file: expected at least 768 bytes, got ${data.length}`);
      }
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Loads a TTF/OTF font file
 * @param {File} file
 */
async function loadFontTTFFile(file) {
  try {
    const fontName = file.name.replace(/\.(ttf|otf|woff2?)$/i, '');
    const buffer = await file.arrayBuffer();
    const font = new FontFace(fontName, buffer);
    await font.load();
    document.fonts.add(font);

    if (!loadedTTFFonts.includes(fontName)) {
      loadedTTFFonts.push(fontName);
    }

    // Select this font
    textFontType = 'ttf';
    textFontTTF = fontName;
    updateTextFontSelect();

    // Set dropdown to this font
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('textFontSelect'));
    if (select) select.value = `ttf:${fontName}`;

    // Show size selector for TTF
    const sizeSelect = document.getElementById('textFontSizeSelect');
    if (sizeSelect) sizeSelect.style.display = '';
  } catch (err) {
    alert(`Failed to load font: ${err}`);
  }
}

/**
 * Renders text using .768 Spectrum font to a bitmap array
 * @param {string} text - Text to render
 * @returns {{width: number, height: number, data: Uint8Array}} - Bitmap data
 */
function renderText768(text) {
  const charWidth = 8;
  const charHeight = 8;
  const width = text.length * charWidth;
  const height = charHeight;
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);

  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i);
    // Spectrum font starts at char 32 (space)
    if (charCode < 32 || charCode > 127) charCode = 32;
    const glyphIndex = charCode - 32;
    const glyphOffset = glyphIndex * 8;

    for (let row = 0; row < 8; row++) {
      const glyphByte = textFont768Data[glyphOffset + row] || 0;
      const destX = i * 8;

      for (let bit = 0; bit < 8; bit++) {
        if (glyphByte & (0x80 >> bit)) {
          const x = destX + bit;
          const byteIdx = row * bytesPerRow + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          data[byteIdx] |= (1 << bitIdx);
        }
      }
    }
  }

  return { width, height, data };
}

/**
 * Renders text using TTF font to a bitmap array
 * @param {string} text - Text to render
 * @returns {{width: number, height: number, data: Uint8Array}} - Bitmap data
 */
function renderTextTTF(text) {
  // Create temporary canvas to render text
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 0, height: 0, data: new Uint8Array(0) };

  // Measure text
  ctx.font = `${textFontSize}px "${textFontTTF}"`;
  const metrics = ctx.measureText(text);
  const width = Math.ceil(metrics.width);
  const height = textFontSize + 4; // Add some padding

  canvas.width = width;
  canvas.height = height;

  // Render text
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.font = `${textFontSize}px "${textFontTTF}"`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, 0, 2);

  // Convert to 1-bit bitmap
  const imageData = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const brightness = imageData.data[idx]; // Use red channel
      if (brightness > 127) {
        const byteIdx = y * bytesPerRow + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        data[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  return { width, height, data };
}

/**
 * Renders the current text to bitmap data
 * @returns {{width: number, height: number, data: Uint8Array}|null}
 */
function renderCurrentText() {
  if (!textToolInput || textToolInput.length === 0) return null;

  if (textFontType === 'spectrum') {
    return renderText768(textToolInput);
  } else {
    return renderTextTTF(textToolInput);
  }
}

/**
 * Draws text preview on the canvas
 * @param {number} x - X position
 * @param {number} y - Y position
 */
function drawTextPreview(x, y) {
  if (!screenCtx || !editorActive) return;

  const textBitmap = renderCurrentText();
  if (!textBitmap || textBitmap.width === 0) return;

  const borderPixels = getMainScreenOffset();
  const scaleY = getPixelScaleY();
  const zoomY = zoom * scaleY;

  // Draw semi-transparent preview
  const previewColor = 'rgba(255, 255, 0, 0.6)';
  screenCtx.fillStyle = previewColor;

  for (let ty = 0; ty < textBitmap.height; ty++) {
    for (let tx = 0; tx < textBitmap.width; tx++) {
      const byteIdx = ty * Math.ceil(textBitmap.width / 8) + Math.floor(tx / 8);
      const bitIdx = 7 - (tx % 8);
      if (textBitmap.data[byteIdx] & (1 << bitIdx)) {
        const px = x + tx;
        const py = y + ty;
        if (px >= 0 && px < getFormatWidth() && py >= 0 && py < getFormatHeight()) {
          screenCtx.fillRect(
            borderPixels + px * zoom,
            borderPixels + py * zoomY,
            zoom,
            zoomY
          );
        }
      }
    }
  }
}

/**
 * Stamps text onto the screen data
 * @param {number} x - X position
 * @param {number} y - Y position
 */
function stampText(x, y) {
  if (!screenData) return;

  const textBitmap = renderCurrentText();
  if (!textBitmap || textBitmap.width === 0) return;

  saveUndoState();

  for (let ty = 0; ty < textBitmap.height; ty++) {
    for (let tx = 0; tx < textBitmap.width; tx++) {
      const byteIdx = ty * Math.ceil(textBitmap.width / 8) + Math.floor(tx / 8);
      const bitIdx = 7 - (tx % 8);
      const isSet = (textBitmap.data[byteIdx] & (1 << bitIdx)) !== 0;

      const px = x + tx;
      const py = y + ty;

      if (px >= 0 && px < getFormatWidth() && py >= 0 && py < getFormatHeight()) {
        // Use current brush paint mode
        if (brushPaintMode === 'recolor') {
          if (isSet) setPixelAttributeOnly(screenData, px, py);
        } else if (brushPaintMode === 'retouch') {
          if (isSet) setPixelBitmapOnly(screenData, px, py, true);
        } else {
          // Normal mode: set ink pixels
          if (isSet) {
            setPixel(screenData, px, py, true);
          }
        }
      }
    }
  }

  editorRender();
}

/**
 * Shows/hides the text tool section
 * @param {boolean} show
 */
function showTextToolSection(show) {
  const section = document.getElementById('editorTextSection');
  if (section) {
    section.style.display = show ? '' : 'none';
  }
  if (show) {
    isPlacingText = true;
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('textToolInput'));
    if (input) input.focus();

    // SPECSCII: hide font/size selectors (characters come from the SPECSCII set)
    const isSpecscii = typeof currentFormat !== 'undefined' && currentFormat === FORMAT.SPECSCII;
    const fontSelectRow = document.getElementById('textFontSelect');
    const fontBtnRow = document.getElementById('loadFont768Btn');
    if (fontSelectRow) fontSelectRow.parentElement.style.display = isSpecscii ? 'none' : '';
    if (fontBtnRow) fontBtnRow.parentElement.style.display = isSpecscii ? 'none' : '';
  } else {
    isPlacingText = false;
    textPreviewPos = null;
  }
}

/**
 * Shows/hides the airbrush options section
 * @param {boolean} show
 */
function showAirbrushSection(show) {
  const section = document.getElementById('editorAirbrushSection');
  if (section) {
    section.style.display = show ? '' : 'none';
  }
}

/**
 * Shows/hides the gradient options section
 * @param {boolean} show
 */
function showGradientSection(show) {
  const section = document.getElementById('editorGradientSection');
  if (section) {
    section.style.display = show ? '' : 'none';
  }
}

// ============================================================================
// QR Code Generation
// ============================================================================

/** @type {Object|null} - Cached QR code data */
let qrCodeData = null;

/**
 * Opens the QR code generation dialog
 */
function openQrDialog() {
  const dialog = document.getElementById('qrCodeDialog');
  const input = document.getElementById('qrTextInput');
  if (dialog) {
    dialog.style.display = '';
    if (input) input.focus();
    updateQrPreview();
  }
}

/**
 * Closes the QR code dialog
 */
function closeQrDialog() {
  const dialog = document.getElementById('qrCodeDialog');
  if (dialog) dialog.style.display = 'none';
}

/**
 * Updates the QR code preview
 */
function updateQrPreview() {
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('qrTextInput'));
  const moduleSizeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('qrModuleSize'));
  const versionSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('qrVersionSelect'));
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('qrPreviewCanvas'));
  const hint = document.getElementById('qrPreviewHint');
  const info = document.getElementById('qrInfo');
  const applyBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('qrApplyBtn'));

  const text = input?.value?.trim() || '';

  if (!text) {
    if (canvas) canvas.style.display = 'none';
    if (hint) {
      hint.style.display = '';
      hint.textContent = 'Enter text to preview';
    }
    if (info) info.textContent = '';
    if (applyBtn) applyBtn.disabled = true;
    qrCodeData = null;
    return;
  }

  try {
    // Get module size (1, 2, 4, or 8 pixels - all divide evenly into 8x8 character cells)
    const defaultModuleSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.QR_DEFAULT_MODULE_SIZE) || 4;
    const moduleSize = parseInt(moduleSizeSelect?.value || String(defaultModuleSize), 10);
    // Get version (0 = auto, 1-20 = forced)
    const versionValue = versionSelect?.value || 'auto';
    const forceVersion = versionValue === 'auto' ? 0 : parseInt(versionValue, 10);

    // Check if forced version fits with selected module size
    if (forceVersion > 0) {
      const versionModules = 17 + forceVersion * 4;
      const requiredSize = versionModules * moduleSize;
      if (requiredSize > 192) {
        throw new Error(`V${forceVersion} needs ${requiredSize}px at ${moduleSize}px/module (max 192). Use smaller module size.`);
      }
    }

    // @ts-ignore - generateQR is defined in qrcode.js
    const qrResult = generateQR(text, moduleSize, 192, forceVersion);

    if (!qrResult) {
      throw new Error('Text too long for selected size');
    }

    const { modules, moduleCount, actualSize, version } = qrResult;

    // Draw to preview canvas
    if (canvas) {
      canvas.width = actualSize;
      canvas.height = actualSize;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, actualSize, actualSize);
        ctx.fillStyle = '#000000';

        for (let row = 0; row < moduleCount; row++) {
          for (let col = 0; col < moduleCount; col++) {
            if (modules[row][col]) {
              ctx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
            }
          }
        }
      }

      canvas.style.display = '';
      if (hint) hint.style.display = 'none';
    }

    // Store QR data for apply
    qrCodeData = {
      modules: modules,
      moduleCount: moduleCount,
      moduleSize: moduleSize,
      size: actualSize
    };

    if (info) info.textContent = `${actualSize}×${actualSize} px (v${version}, ${moduleCount}×${moduleCount} modules, ${moduleSize}px each)`;
    if (applyBtn) applyBtn.disabled = false;

  } catch (e) {
    if (canvas) canvas.style.display = 'none';
    if (hint) {
      hint.style.display = '';
      hint.textContent = 'Error: ' + (e instanceof Error ? e.message : String(e));
    }
    if (info) info.textContent = '';
    if (applyBtn) applyBtn.disabled = true;
    qrCodeData = null;
  }
}

/**
 * Applies the QR code to the canvas
 */
function applyQrCode() {
  if (!qrCodeData || !screenData) return;

  const posX = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('qrPosX'))?.value || '0', 10);
  const posY = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('qrPosY'))?.value || '0', 10);
  const { modules, moduleCount, moduleSize } = qrCodeData;

  // Save undo state
  saveUndoState();

  // Draw QR code to screen data
  // QR black = ink (1), QR white = paper (0)
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      const isDark = modules[row][col];
      const startX = posX + col * moduleSize;
      const startY = posY + row * moduleSize;

      // Fill module rectangle
      for (let py = 0; py < moduleSize; py++) {
        for (let px = 0; px < moduleSize; px++) {
          const x = startX + px;
          const y = startY + py;
          if (x >= 0 && x < 256 && y >= 0 && y < 192) {
            setPixel(screenData, x, y, isDark);
          }
        }
      }
    }
  }

  closeQrDialog();
  editorRender();
}

/**
 * Initializes QR dialog event handlers
 */
function initQrDialog() {
  const dialog = document.getElementById('qrCodeDialog');
  const input = document.getElementById('qrTextInput');
  const moduleSizeSelect = document.getElementById('qrModuleSize');
  const versionSelect = document.getElementById('qrVersionSelect');
  const cancelBtn = document.getElementById('qrCancelBtn');
  const applyBtn = document.getElementById('qrApplyBtn');
  const generateBtn = document.getElementById('qrGenerateBtn');

  // Open dialog button
  generateBtn?.addEventListener('click', openQrDialog);

  // Convert input to uppercase (QR alphanumeric mode only supports uppercase)
  input?.addEventListener('input', function() {
    const start = this.selectionStart;
    const end = this.selectionEnd;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(start, end);
    updateQrPreview();
  });

  // Update preview on settings change
  moduleSizeSelect?.addEventListener('change', updateQrPreview);
  versionSelect?.addEventListener('change', updateQrPreview);

  // Cancel button
  cancelBtn?.addEventListener('click', closeQrDialog);

  // Apply button
  applyBtn?.addEventListener('click', applyQrCode);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog?.style.display !== 'none') {
      closeQrDialog();
    }
  });

  // Close on overlay click
  dialog?.addEventListener('click', (e) => {
    if (e.target === dialog) closeQrDialog();
  });
}

// ============================================================================
// Initialization
// ============================================================================

function initEditor() {
  // Cache preview canvas
  previewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editorPreviewCanvas'));

  // Cache screen canvas context (screenCanvas is defined in screen_viewer.js)
  if (typeof screenCanvas !== 'undefined' && screenCanvas) {
    screenCtx = screenCanvas.getContext('2d');
  }

  // Cache element collections
  editorToolButtons = document.querySelectorAll('.editor-tool-btn[data-tool]');
  editorShapeButtons = document.querySelectorAll('.editor-shape-btn');
  customBrushSlots = document.querySelectorAll('.custom-brush-slot');

  // Tool buttons
  editorToolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = /** @type {HTMLElement} */ (btn).dataset.tool;
      if (tool) setEditorTool(tool);
    });
  });

  // Brush size select
  const brushSizeSelect = document.getElementById('editorBrushSize');
  if (brushSizeSelect) {
    brushSizeSelect.addEventListener('change', (e) => {
      setBrushSize(parseInt(/** @type {HTMLSelectElement} */ (e.target).value, 10));
    });
  }

  // Brush shape buttons
  editorShapeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const shape = /** @type {HTMLElement} */ (btn).dataset.shape;
      if (shape) setBrushShape(shape);
    });
  });

  // Custom brush slots
  customBrushSlots.forEach(canvas => {
    canvas.addEventListener('click', (e) => {
      const slot = parseInt(/** @type {HTMLElement} */ (canvas).dataset.slot, 10);
      if (/** @type {MouseEvent} */ (e).ctrlKey) {
        clearCustomBrush(slot);
      } else if (/** @type {MouseEvent} */ (e).shiftKey) {
        startBrushCapture(slot);
      } else {
        selectCustomBrush(slot);
      }
    });
  });

  // Brush paint mode select
  const paintModeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('brushPaintMode'));
  if (paintModeSelect) {
    paintModeSelect.value = brushPaintMode;
    paintModeSelect.addEventListener('change', (e) => {
      brushPaintMode = /** @type {HTMLSelectElement} */ (e.target).value;
      localStorage.setItem('spectraLabBrushPaintMode', brushPaintMode);
    });
  }

  // Airbrush radius select
  const airbrushRadiusSelect = document.getElementById('airbrushRadiusSelect');
  if (airbrushRadiusSelect) {
    airbrushRadiusSelect.addEventListener('change', (e) => {
      setAirbrushRadius(parseInt(/** @type {HTMLSelectElement} */ (e.target).value, 10));
    });
  }

  // Airbrush density select
  const airbrushDensitySelect = document.getElementById('airbrushDensitySelect');
  if (airbrushDensitySelect) {
    airbrushDensitySelect.addEventListener('change', (e) => {
      setAirbrushDensity(parseFloat(/** @type {HTMLSelectElement} */ (e.target).value));
    });
  }

  // Airbrush falloff select
  const airbrushFalloffSelect = document.getElementById('airbrushFalloffSelect');
  if (airbrushFalloffSelect) {
    airbrushFalloffSelect.addEventListener('change', (e) => {
      setAirbrushFalloff(parseFloat(/** @type {HTMLSelectElement} */ (e.target).value));
    });
  }

  // Gradient type select
  const gradientTypeSelect = document.getElementById('gradientTypeSelect');
  if (gradientTypeSelect) {
    gradientTypeSelect.addEventListener('change', (e) => {
      setGradientType(/** @type {HTMLSelectElement} */ (e.target).value);
    });
  }

  // Dither method select
  const ditherMethodSelect = document.getElementById('ditherMethodSelect');
  if (ditherMethodSelect) {
    ditherMethodSelect.addEventListener('change', (e) => {
      setDitherMethod(/** @type {HTMLSelectElement} */ (e.target).value);
    });
  }

  // Gradient reverse checkbox
  const gradientReverseCheckbox = document.getElementById('gradientReverseCheckbox');
  if (gradientReverseCheckbox) {
    gradientReverseCheckbox.addEventListener('change', (e) => {
      setGradientReverse(/** @type {HTMLInputElement} */ (e.target).checked);
    });
  }

  // Load custom brushes from localStorage and render previews
  loadCustomBrushes();
  renderAllCustomBrushPreviews();

  // Initialize brush/tileset tabs
  initBrushTabs();
  updateBrushTabBar();
  renderBrushTabContent();

  // Text tool initialization
  initTextTool();

  // QR code dialog initialization
  initQrDialog();

  // Helper function to setup collapsible with localStorage persistence
  /**
   * @param {string} headerId - ID of the header element
   * @param {string} contentId - ID of the content element
   * @param {string} iconId - ID of the expand icon element
   * @param {string} storageKey - localStorage key for this collapsible
   * @param {boolean} [defaultExpanded=false] - Default state if not in localStorage
   */
  function setupCollapsible(headerId, contentId, iconId, storageKey, defaultExpanded = false) {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    const icon = document.getElementById(iconId);
    if (!header || !content || !icon) return;

    // Restore state from localStorage
    const savedState = localStorage.getItem(storageKey);
    const isExpanded = savedState !== null ? savedState === 'true' : defaultExpanded;
    content.style.display = isExpanded ? 'block' : 'none';
    icon.textContent = isExpanded ? '▼' : '▶';

    // Add click handler
    header.addEventListener('click', () => {
      const nowHidden = content.style.display === 'none';
      content.style.display = nowHidden ? 'block' : 'none';
      icon.textContent = nowHidden ? '▼' : '▶';
      localStorage.setItem(storageKey, String(nowHidden));
    });
  }

  // Setup all collapsible sections
  setupCollapsible('textToolHeader', 'textToolControls', 'textToolExpandIcon', 'spectralab_collapse_textTool', true);
  setupCollapsible('refHeader', 'refControlsContent', 'refExpandIcon', 'spectralab_collapse_reference');
  setupCollapsible('viewSettingsHeader', 'viewSettingsContent', 'viewSettingsExpandIcon', 'spectralab_collapse_viewSettings');
  setupCollapsible('fileInfoHeader', 'fileInfoContent', 'fileInfoExpandIcon', 'spectralab_collapse_fileInfo');
  setupCollapsible('specsciiPalHeader', 'specsciiPalContent', 'specsciiPalExpandIcon', 'spectralab_collapse_specsciiPal', true);
  setupCollapsible('layerHeader', 'layerControls', 'layerExpandIcon', 'spectralab_collapse_layers');
  setupCollapsible('customBrushHeader', 'customBrushControls', 'customBrushExpandIcon', 'spectralab_collapse_customBrush');
  setupCollapsible('displayFiltersHeader', 'displayFiltersContent', 'displayFiltersExpandIcon', 'spectralab_collapse_displayFilters');

  const textToolInput = /** @type {HTMLInputElement|null} */ (document.getElementById('textToolInput'));
  textToolInput?.addEventListener('input', (e) => {
    textToolInput.value = /** @type {HTMLInputElement} */ (e.target).value;
    if (textPreviewPos) editorRender();
  });
  // Prevent keyboard shortcuts while typing in text input
  textToolInput?.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      textToolInput.blur();
    }
  });

  const textFontSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('textFontSelect'));
  textFontSelect?.addEventListener('change', (e) => {
    const value = /** @type {HTMLSelectElement} */ (e.target).value;
    const [type, name] = value.split(':');
    if (type === 'spectrum') {
      textFontType = 'spectrum';
      const font = loaded768Fonts.find(f => f.name === name);
      if (font) {
        textFont768Data = font.data;
        textFont768Name = name;
      }
      const sizeSelect = document.getElementById('textFontSizeSelect');
      if (sizeSelect) sizeSelect.style.display = 'none';
    } else {
      textFontType = 'ttf';
      textFontTTF = name;
      const sizeSelect = document.getElementById('textFontSizeSelect');
      if (sizeSelect) sizeSelect.style.display = '';
    }
    updateTextFontIndicator();
    if (textPreviewPos) editorRender();
  });

  const textFontSizeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('textFontSizeSelect'));
  textFontSizeSelect?.addEventListener('change', (e) => {
    textFontSize = parseInt(/** @type {HTMLSelectElement} */ (e.target).value, 10);
    updateTextFontIndicator();
    if (textPreviewPos) editorRender();
  });

  const font768FileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('font768FileInput'));
  document.getElementById('loadFont768Btn')?.addEventListener('click', () => {
    font768FileInput?.click();
  });
  font768FileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) loadFont768File(file);
    /** @type {HTMLInputElement} */ (e.target).value = '';
  });

  const fontTTFFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('fontTTFFileInput'));
  document.getElementById('loadFontTTFBtn')?.addEventListener('click', () => {
    fontTTFFileInput?.click();
  });
  fontTTFFileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) loadFontTTFFile(file);
    /** @type {HTMLInputElement} */ (e.target).value = '';
  });

  // Reference image controls
  const refFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('refFileInput'));
  document.getElementById('refLoadBtn')?.addEventListener('click', () => {
    refFileInput?.click();
  });
  refFileInput?.addEventListener('change', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const file = target.files?.[0];
    if (file) {
      loadReferenceImage(file);
    }
    target.value = '';  // Allow reloading same file
  });
  document.getElementById('refShowCheckbox')?.addEventListener('change', (e) => {
    showReference = /** @type {HTMLInputElement} */ (e.target).checked;
    editorRender();
  });
  const refOpacitySlider = /** @type {HTMLInputElement|null} */ (document.getElementById('refOpacitySlider'));
  const refOpacityValue = document.getElementById('refOpacityValue');
  // Set slider range from config
  if (refOpacitySlider) {
    const minOpacity = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.REFERENCE_MIN_OPACITY) || 5;
    const maxOpacity = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.REFERENCE_MAX_OPACITY) || 80;
    refOpacitySlider.min = String(minOpacity);
    refOpacitySlider.max = String(maxOpacity);
    refOpacitySlider.value = String(Math.round(referenceOpacity * 100));
  }
  refOpacitySlider?.addEventListener('input', (e) => {
    const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
    referenceOpacity = val / 100;
    if (refOpacityValue) refOpacityValue.textContent = val + '%';
    editorRender();
  });

  // Reference image clear button
  document.getElementById('refClearBtn')?.addEventListener('click', () => {
    clearReferenceImage();
  });

  // Reference image position/size controls
  const refOffsetX = /** @type {HTMLInputElement|null} */ (document.getElementById('refOffsetX'));
  const refOffsetY = /** @type {HTMLInputElement|null} */ (document.getElementById('refOffsetY'));
  const refWidth = /** @type {HTMLInputElement|null} */ (document.getElementById('refWidth'));
  const refHeight = /** @type {HTMLInputElement|null} */ (document.getElementById('refHeight'));

  refOffsetX?.addEventListener('input', (e) => {
    const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
    referenceOffsetX = isNaN(val) ? 0 : val;
    editorRender();
  });
  refOffsetY?.addEventListener('input', (e) => {
    const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
    referenceOffsetY = isNaN(val) ? 0 : val;
    editorRender();
  });
  // When mousedown on empty width/height fields, populate with current canvas size before spin action
  refWidth?.addEventListener('mousedown', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.value === '' && referenceWidth === null) {
      const canvas = document.getElementById('screenCanvas');
      if (canvas) {
        const size = Math.round(/** @type {HTMLCanvasElement} */ (canvas).width / zoom);
        input.value = String(size);
        referenceWidth = size;
      }
    }
  });
  refHeight?.addEventListener('mousedown', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.value === '' && referenceHeight === null) {
      const canvas = document.getElementById('screenCanvas');
      if (canvas) {
        const size = Math.round(/** @type {HTMLCanvasElement} */ (canvas).height / zoom);
        input.value = String(size);
        referenceHeight = size;
      }
    }
  });
  refWidth?.addEventListener('input', (e) => {
    const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
    referenceWidth = isNaN(val) || val <= 0 ? null : val;
    editorRender();
  });
  refHeight?.addEventListener('input', (e) => {
    const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
    referenceHeight = isNaN(val) || val <= 0 ? null : val;
    editorRender();
  });

  // Build color palette
  buildPalette();

  // Build Gigascreen virtual palette
  buildGigascreenPalette();

  // Initialize ULA+ palette UI
  initUlaPlusPaletteUI();

  // Initialize NXI/SL2 palette UI
  initNxiPaletteUI();

  // Initialize barcode UI (for border patterns)
  initBarcodeUI();

  const brightCb = document.getElementById('editorBrightCheckbox');
  if (brightCb) {
    brightCb.addEventListener('change', (e) => {
      editorBright = /** @type {HTMLInputElement} */ (e.target).checked;
      updateColorPreview();
    });
  }

  const flashCb = document.getElementById('editorFlashCheckbox');
  if (flashCb) {
    flashCb.addEventListener('change', (e) => {
      editorFlash = /** @type {HTMLInputElement} */ (e.target).checked;
      updateColorPreview();
    });
  }

  // Snap mode dropdown
  const snapSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorSnapMode'));
  if (snapSelect) {
    snapSelect.value = snapMode;
    snapSelect.addEventListener('change', (e) => {
      snapMode = /** @type {HTMLSelectElement} */ (e.target).value;
      brushSnapOrigin = null; // reset brush origin on mode change
      localStorage.setItem('spectraLabSnapMode', snapMode);
    });
  }

  // Cut button
  document.getElementById('editorCutBtn')?.addEventListener('click', () => {
    if (selectionStartPoint && selectionEndPoint) {
      cutSelection();
    }
  });

  // Invert button
  document.getElementById('editorInvertBtn')?.addEventListener('click', () => {
    if (selectionStartPoint && selectionEndPoint) {
      invertSelection();
    }
  });

  // Paste button
  document.getElementById('editorPasteBtn')?.addEventListener('click', () => {
    startPasteMode();
  });

  // Clipboard/brush transform buttons (auto-detect target)
  document.getElementById('clipboardRotateBtn')?.addEventListener('click', () => {
    if (isPasting && clipboardData) {
      rotateClipboard();
      editorRender();
    } else if (activeCustomBrush >= 0) {
      rotateCustomBrush();
    }
  });
  document.getElementById('clipboardFlipHBtn')?.addEventListener('click', () => {
    if (isPasting && clipboardData) {
      mirrorClipboardH();
      editorRender();
    } else if (activeCustomBrush >= 0) {
      mirrorCustomBrushH();
    }
  });
  document.getElementById('clipboardFlipVBtn')?.addEventListener('click', () => {
    if (isPasting && clipboardData) {
      mirrorClipboardV();
      editorRender();
    } else if (activeCustomBrush >= 0) {
      mirrorCustomBrushV();
    }
  });

  // Action buttons
  document.getElementById('editorSaveBtn')?.addEventListener('click', () => saveScrFile());
  document.getElementById('exportImageBtn')?.addEventListener('click', showExportImageDialog);
  document.getElementById('exportImageCancelBtn')?.addEventListener('click', () => {
    const dlg = document.getElementById('exportImageDialog');
    if (dlg) dlg.style.display = 'none';
  });
  document.getElementById('exportImageOkBtn')?.addEventListener('click', exportImageToFile);
  document.getElementById('exportImageGigaMode')?.addEventListener('change', updateExportImageDims);
  document.getElementById('exportImageFlashMode')?.addEventListener('change', updateExportImageDims);
  document.getElementById('editorExportBtn')?.addEventListener('click', () => {
    const exportSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorExportSelect'));
    if (!exportSelect) return;
    const value = exportSelect.value;

    if (value === 'asm') {
      if (currentFormat === FORMAT.BSC) exportBscAsm();
      else if (currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH) exportGigascreenAsm();
      else if (currentFormat === FORMAT.RGB3) exportRgb3Asm();
      else if (currentFormat === FORMAT.IFL) exportIflAsm();
      else if (currentFormat === FORMAT.SCR_ULAPLUS) exportUlaPlusAsm();
      else if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) exportNextL2Asm();
      else if (currentFormat === FORMAT.LORES) exportLoresAsm();
      else if (currentFormat === FORMAT.LORES_RAD) exportLoresRadAsm();
    } else if (value === 'scr') {
      if (currentFormat !== FORMAT.SPECSCII || !specsciiCharGrid) return;
      const scrData = exportSpecsciiToScr();
      const baseName = currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'screen';
      downloadFile(new Blob([scrData], { type: 'application/octet-stream' }), baseName + '.scr');
    } else if (value === 'tap') {
      if (currentFormat !== FORMAT.SPECSCII || !specsciiCharGrid) return;
      const tapData = exportSpecsciiToTap();
      const baseName = currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'screen';
      downloadFile(new Blob([tapData], { type: 'application/octet-stream' }), baseName + '.tap');
    }
  });

  // Convert dropdown
  const convertSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorConvertSelect'));
  if (convertSelect) {
    convertSelect.addEventListener('change', (e) => {
      const value = /** @type {HTMLSelectElement} */ (e.target).value;
      if (value) {
        handleConversion(value);
        // Reset dropdown to placeholder
        /** @type {HTMLSelectElement} */ (e.target).selectedIndex = 0;
      }
    });
  }
  document.getElementById('editorUndoBtn')?.addEventListener('click', undo);
  document.getElementById('editorRedoBtn')?.addEventListener('click', redo);
  document.getElementById('editorClearBtn')?.addEventListener('click', clearScreen);

  // SPECSCII palette click handler
  document.getElementById('specsciiPaletteCanvas')?.addEventListener('click', handleSpecsciiPaletteClick);

  // SPECSCII palette sort toggle
  const savedSort = localStorage.getItem('spectraLabSpecsciiSortWeight');
  specsciiPaletteSortByWeight = savedSort === null ? true : savedSort === '1';
  if (specsciiPaletteSortByWeight) document.getElementById('specsciiPalSortBtn')?.classList.add('selected');
  document.getElementById('specsciiPalSortBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    specsciiPaletteSortByWeight = !specsciiPaletteSortByWeight;
    document.getElementById('specsciiPalSortBtn')?.classList.toggle('selected', specsciiPaletteSortByWeight);
    localStorage.setItem('spectraLabSpecsciiSortWeight', specsciiPaletteSortByWeight ? '1' : '0');
    renderSpecsciiPalette();
  });

  // Reset to defaults button
  document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?\n\nThis will clear saved settings, brushes, and reload the page.')) {
      // Clear all SpectraLab keys from localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('spectraLab')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      // Reload page
      location.reload();
    }
  });

  // Transform tab selection and export buttons
  document.getElementById('transformSelectBtn')?.addEventListener('click', () => {
    if (transformSelectActive) {
      exitTransformSelectMode();
      selectionStartPoint = null;
      selectionEndPoint = null;
      transformSelectionRect = null;
      clipboardData = null;
      updateTransformSectionsVisibility();
      editorRender();
    } else {
      enterTransformSelectMode();
    }
  });

  const transformSnapCheckbox = /** @type {HTMLInputElement|null} */ (document.getElementById('transformSnapCheckbox'));
  if (transformSnapCheckbox) {
    transformSnapCheckbox.checked = transformSnapToGrid;
    transformSnapCheckbox.addEventListener('change', () => {
      transformSnapToGrid = transformSnapCheckbox.checked;
    });
  }

  document.getElementById('transformRotateBtn')?.addEventListener('click', () => {
    transformRotateSelection();
  });
  document.getElementById('transformMirrorHBtn')?.addEventListener('click', () => {
    transformMirrorSelectionH();
  });
  document.getElementById('transformMirrorVBtn')?.addEventListener('click', () => {
    transformMirrorSelectionV();
  });
  document.getElementById('transformExportAsmBtn')?.addEventListener('click', () => {
    exportSelectionAsm();
  });
  document.getElementById('transformCopyAsmBtn')?.addEventListener('click', () => {
    copySelectionAsmToClipboard();
  });

  // Preview zoom buttons
  document.getElementById('previewZoomIn')?.addEventListener('click', () => setPreviewZoom(previewZoom + 1));
  document.getElementById('previewZoomOut')?.addEventListener('click', () => setPreviewZoom(previewZoom - 1));

  // Initialize preview drag
  initPreviewDrag();

  // Initialize floating palette for fullscreen mode
  initFloatingPalette();

  // Sync fullscreen state when browser fullscreen changes
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && fullscreenMode) {
      // Browser exited fullscreen, sync our state
      fullscreenMode = false;
      document.body.classList.remove('fullscreen-editor');
      document.body.classList.remove('fullscreen-with-tools');
      // Restore saved zoom
      if (fullscreenSavedZoom !== null) {
        zoom = fullscreenSavedZoom;
        fullscreenSavedZoom = null;
        const zs = document.getElementById('zoomSelect');
        if (zs) /** @type {HTMLSelectElement} */ (zs).value = String(zoom);
      }
      const palette = document.getElementById('floatingPalette');
      if (palette) { palette.classList.remove('active'); palette.style.display = ''; }
      if (editorActive) {
        editorRender();
      } else {
        renderScreen();
      }
    }
  });

  // Layer panel buttons
  document.getElementById('addLayerBtn')?.addEventListener('click', () => {
    if (layersEnabled) {
      addLayer();
    } else if (isFormatEditable() && screenData && screenData.length > 0) {
      // Initialize layers if not already enabled
      initLayers();
      addLayer();
      toggleLayerSectionVisibility();
    }
    // Auto-expand layer controls when adding layers
    const controls = document.getElementById('layerControls');
    const icon = document.getElementById('layerExpandIcon');
    if (controls && controls.style.display === 'none') {
      controls.style.display = '';
      if (icon) icon.textContent = '▼';
    }
  });
  document.getElementById('removeLayerBtn')?.addEventListener('click', removeLayer);
  document.getElementById('moveLayerUpBtn')?.addEventListener('click', moveLayerUp);
  document.getElementById('moveLayerDownBtn')?.addEventListener('click', moveLayerDown);
  document.getElementById('flattenLayersBtn')?.addEventListener('click', () => {
    if (layersEnabled && layers.length > 1) {
      saveUndoState();
      flattenAllLayers();
      editorRender();
    }
  });

  // Layer list click delegation
  const layerList = document.getElementById('layerList');
  if (layerList) {
    layerList.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      // Check if visibility toggle was clicked
      if (target.classList.contains('layer-visibility')) {
        const index = parseInt(target.dataset.index || '', 10);
        if (!isNaN(index)) {
          toggleLayerVisibility(index);
        }
        return;
      }
      // Check if layer item was clicked
      const layerItem = target.closest('.layer-item');
      if (layerItem) {
        const index = parseInt(/** @type {HTMLElement} */ (layerItem).dataset.index || '', 10);
        if (!isNaN(index)) {
          setActiveLayer(index);
        }
      }
    });

    // Double-click to rename layer
    layerList.addEventListener('dblclick', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      // Only trigger on layer-name span or layer-item itself
      const layerItem = target.closest('.layer-item');
      if (!layerItem) return;

      const index = parseInt(/** @type {HTMLElement} */ (layerItem).dataset.index || '', 10);
      if (isNaN(index) || !layers[index]) return;

      const currentName = layers[index].name;
      const newName = prompt('Rename layer:', currentName);
      if (newName !== null && newName.trim() !== '') {
        layers[index].name = newName.trim();
        updateLayerPanel();
      }
    });
  }

  // Project save/load buttons (stopPropagation to prevent collapsing header)
  document.getElementById('saveProjectBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveProject();
  });

  const projectFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('projectFileInput'));
  document.getElementById('loadProjectBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    projectFileInput?.click();
  });
  projectFileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) {
      loadProject(file);
    }
    // Reset so same file can be loaded again
    if (projectFileInput) projectFileInput.value = '';
  });

  // Workspace save/load buttons
  document.getElementById('saveWorkspaceBtn')?.addEventListener('click', saveWorkspace);

  const workspaceFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('workspaceFileInput'));
  document.getElementById('loadWorkspaceBtn')?.addEventListener('click', () => {
    workspaceFileInput?.click();
  });
  workspaceFileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) {
      loadWorkspace(file);
    }
    // Reset so same file can be loaded again
    if (workspaceFileInput) workspaceFileInput.value = '';
  });

  // Brushes save/load buttons (stopPropagation to prevent collapsing header)
  document.getElementById('saveBrushesBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportCurrentTab();
  });

  const brushesFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('brushesFileInput'));
  document.getElementById('loadBrushesBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    brushesFileInput?.click();
  });
  brushesFileInput?.addEventListener('change', (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) {
      const ext = file.name.toLowerCase().split('.').pop();
      // If on Custom tab and loading .slb file, replace main custom brushes (existing behavior)
      // Otherwise, load as new tab (tileset or brushset)
      if (ext === 'slb' && activeBrushTab === 0) {
        importBrushesFromFile(file);
      } else {
        loadBrushTabFile(file);
      }
    }
    // Reset so same file can be loaded again
    if (brushesFileInput) brushesFileInput.value = '';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    // F11: Toggle fullscreen mode (works in both viewer and editor)
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreenEditor();
      return;
    }

    // Escape: exit fullscreen (works in both viewer and editor)
    if (e.key === 'Escape' && fullscreenMode) {
      e.preventDefault();
      exitFullscreenEditor();
      return;
    }

    // Tab: Toggle floating palette in fullscreen mode (editor only)
    if (e.key === 'Tab' && fullscreenMode && editorActive) {
      e.preventDefault();
      toggleFloatingPalette();
      return;
    }

    if (!editorActive) return;

    // Use e.code for Ctrl+key combinations (layout-independent)
    if (e.ctrlKey && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
    }
    if (e.ctrlKey && e.code === 'KeyY') {
      e.preventDefault();
      redo();
    }
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      saveScrFile();
    }
    if (e.ctrlKey && e.code === 'KeyC') {
      e.preventDefault();
      copySelection();
      // Clear selection visuals after manual copy
      selectionStartPoint = null;
      selectionEndPoint = null;
      isSelecting = false;
      editorRender();
    }
    if (e.ctrlKey && e.code === 'KeyX') {
      e.preventDefault();
      if (selectionStartPoint && selectionEndPoint) {
        cutSelection();
        // Clear selection visuals after cut
        selectionStartPoint = null;
        selectionEndPoint = null;
        isSelecting = false;
      }
    }
    if (e.ctrlKey && e.code === 'KeyV') {
      e.preventDefault();
      startPasteMode();
    }

    // ~: Toggle preview panel (Shift+Backquote for layout independence)
    if (e.shiftKey && e.code === 'Backquote') {
      e.preventDefault();
      togglePreviewPanel();
      return;
    }

    // Brush preview toggle (configurable hotkey, default backtick) - must be without Shift
    const brushPreviewKey = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BRUSH_PREVIEW_HOTKEY) || '`';
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === brushPreviewKey) {
      e.preventDefault();
      toggleBrushPreview();
      return;  // Don't process further key handlers
    }

    // Use e.code for layout-independent shortcuts (works with non-Latin keyboards)
    if (!e.ctrlKey && !e.altKey) {
      switch (e.code) {
        case 'KeyP': setEditorTool(EDITOR.TOOL_PIXEL); break;
        case 'KeyL': setEditorTool(EDITOR.TOOL_LINE); break;
        case 'KeyR':
          if (isPasting && clipboardData) {
            rotateClipboard();
          } else if (getActiveBrush()) {
            rotateCustomBrush();
          } else {
            setEditorTool(EDITOR.TOOL_RECT);
          }
          break;
        case 'KeyH':
          if (isPasting && clipboardData) {
            mirrorClipboardH();
          } else if (getActiveBrush()) {
            mirrorCustomBrushH();
          }
          break;
        case 'KeyV':
          if (isPasting && clipboardData) {
            mirrorClipboardV();
          } else if (getActiveBrush()) {
            mirrorCustomBrushV();
          }
          break;
        case 'KeyC': setEditorTool(EDITOR.TOOL_FILL_CELL); break;
        case 'KeyA': setEditorTool(EDITOR.TOOL_RECOLOR); break;
        case 'KeyO': setEditorTool(EDITOR.TOOL_CIRCLE); break;
        case 'KeyI': setEditorTool(EDITOR.TOOL_FLOOD_FILL); break;
        case 'KeyG': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_AIRBRUSH); break;
        case 'KeyD': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_GRADIENT); break;
        case 'KeyE': setEditorTool(EDITOR.TOOL_ERASER); break;
        case 'KeyT': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_TEXT); break;
        case 'KeyK': setEditorTool(EDITOR.TOOL_COLOR_PICKER); break;
        case 'KeyN':
          if (selectionStartPoint && selectionEndPoint) {
            invertSelection();
          }
          break;
        case 'KeyS': setEditorTool(EDITOR.TOOL_SELECT); break;
        case 'KeyB':
          editorBright = !editorBright;
          updateColorSelectors();
          break;
        case 'KeyF':
          editorFlash = !editorFlash;
          updateColorSelectors();
          break;
        case 'KeyX':
          // Swap ink and paper colors
          const tempColor = editorInkColor;
          editorInkColor = editorPaperColor;
          editorPaperColor = tempColor;
          updateColorSelectors();
          break;
      }
    }

    // Escape: cancel ULA+ copy source, paste/selection, then brush capture
    if (e.key === 'Escape') {
      if (ulaPlusCopySource >= 0) {
        ulaPlusClearCopySource();
        e.preventDefault();
        return;
      }
      if (isPasting || selectionStartPoint || selectionEndPoint || isSelecting) {
        e.preventDefault();
        cancelSelection();
        return;
      }
      if (capturingBrush) {
        capturingBrush = false;
        captureStartPoint = null;
        editorRender();
        const infoEl = document.getElementById('editorPositionInfo');
        if (infoEl) infoEl.innerHTML = '';
      }
      if (capturingTileset) {
        capturingTileset = false;
        tilesetCaptureStart = null;
        editorRender();
        const infoEl = document.getElementById('editorPositionInfo');
        if (infoEl) infoEl.innerHTML = '';
      }
    }

    // Brush size shortcuts — skip for .53c and SPECSCII editors (no brush concept)
    if (!isAttrEditor() && !isSpecsciiEditor()) {
      if (e.key === '[') {
        setBrushSize(brushSize - 1);
      }
      if (e.key === ']') {
        setBrushSize(brushSize + 1);
      }
    }
  });

  // HLR fill pattern dialog wiring
  (function initHlrPatternDialog() {
    const editBtn = document.getElementById('hlrPatternEditBtn');
    const dialog = document.getElementById('hlrPatternDialog');
    const presetSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('hlrPatternPreset'));
    const hexInput = /** @type {HTMLInputElement|null} */ (document.getElementById('hlrPatternHex'));
    const previewCv = /** @type {HTMLCanvasElement|null} */ (document.getElementById('hlrPatternPreview'));
    const okBtn = document.getElementById('hlrPatternOkBtn');
    const cancelBtn = document.getElementById('hlrPatternCancelBtn');
    if (!editBtn || !dialog || !presetSel || !hexInput || !previewCv || !okBtn || !cancelBtn) return;

    function renderPreview(bytes) {
      if (typeof renderHlrPatternPreview === 'function') {
        renderHlrPatternPreview(previewCv, bytes);
      }
    }

    function syncFromPreset() {
      const key = presetSel.value;
      if (key === 'custom') {
        hexInput.disabled = false;
        const bytes = (typeof hlrPatternFromHex === 'function') ? hlrPatternFromHex(hexInput.value) : null;
        renderPreview(bytes);
        return;
      }
      hexInput.disabled = true;
      if (typeof hlrPatternFromPresetKey === 'function') {
        const bytes = hlrPatternFromPresetKey(key);
        if (bytes) {
          if (typeof hlrPatternToHex === 'function') hexInput.value = hlrPatternToHex(bytes);
          renderPreview(bytes);
        }
      }
    }

    presetSel.addEventListener('change', syncFromPreset);
    hexInput.addEventListener('input', function() {
      if (typeof hlrPatternFromHex !== 'function') return;
      const bytes = hlrPatternFromHex(hexInput.value);
      if (bytes) renderPreview(bytes);
    });

    function openDialog() {
      if (currentFormat !== FORMAT.HLR) return;
      // Pre-fill dialog with current picture's pattern
      let current = null;
      if (currentPicture && currentPicture.pattern && currentPicture.pattern.length === 8) {
        current = new Uint8Array(currentPicture.pattern);
      } else if (typeof hlrPatternFromPresetKey === 'function') {
        current = hlrPatternFromPresetKey('top-bottom');
      }
      if (!current) current = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00]);
      const key = (typeof hlrPatternToPresetKey === 'function') ? hlrPatternToPresetKey(current) : 'custom';
      presetSel.value = key;
      if (typeof hlrPatternToHex === 'function') hexInput.value = hlrPatternToHex(current);
      hexInput.disabled = (key !== 'custom');
      renderPreview(current);
      dialog.style.display = '';
    }

    function closeDialog() {
      dialog.style.display = 'none';
    }

    editBtn.addEventListener('click', openDialog);
    cancelBtn.addEventListener('click', closeDialog);

    // Close on ESC when the dialog is open
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && dialog.style.display !== 'none') {
        closeDialog();
      }
    });

    okBtn.addEventListener('click', function() {
      // Resolve final pattern (preset > hex > fallback)
      const key = presetSel.value;
      let bytes = null;
      if (key !== 'custom' && typeof hlrPatternFromPresetKey === 'function') {
        bytes = hlrPatternFromPresetKey(key);
      }
      if (!bytes && typeof hlrPatternFromHex === 'function') {
        bytes = hlrPatternFromHex(hexInput.value);
      }
      if (!bytes) {
        // Invalid hex — leave dialog open so the user can correct it
        return;
      }
      closeDialog();
      applyHlrPatternChange(bytes);
    });
  })();

  updateColorSelectors();

  // Attr preview flash animation via CSS transform (compositor-level).
  // The canvas has both normal and swapped states side by side.
  // Every 320ms, slide between halves using translateX — this bypasses
  // the main-thread paint pipeline that gets blocked by the flash timer's renderScreen().
  var _apLastSwapTime = 0;
  (function _apFlashLoop(timestamp) {
    if (currentFormat === FORMAT.ATTR_53C && editorFlash) {
      if (timestamp - _apLastSwapTime >= 320) {
        _apLastSwapTime = timestamp;
        attrPreviewFlashSwap = !attrPreviewFlashSwap;
        // Slide canvas via CSS transform (compositor-level, always repaints).
        // Left half = normal, right half = swapped.
        var apCanvas = document.getElementById('attrPreviewCanvas');
        if (apCanvas) {
          apCanvas.style.transform = attrPreviewFlashSwap ? 'translateX(-50%)' : 'translateX(0)';
        }
      }
    } else {
      // Reset position when flash is off
      var apCanvas2 = document.getElementById('attrPreviewCanvas');
      if (apCanvas2 && apCanvas2.style.transform) {
        apCanvas2.style.transform = '';
        attrPreviewFlashSwap = false;
      }
    }
    requestAnimationFrame(_apFlashLoop);
  })(performance.now());
}

// ============================================================================
// Nirvana Tile File Import (.btile / .wtile)
// ============================================================================

/**
 * Imports a Nirvana .btile or .wtile file.
 * Creates an IFL picture with tiles laid out in a grid, and a spriteset
 * with each tile as a multicolour sprite frame.
 * @param {File} file - The tile file to import
 */
function importNirvanaTileFile(file) {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const isBtile = ext === 'btile';
  const cellsW = isBtile ? 2 : 3;   // 2 for btile, 3 for wtile
  const cellsH = 2;                  // both are 2 cells high
  const tilePixW = cellsW * 8;       // 16 or 24
  const tilePixH = cellsH * 8;       // 16
  const tileBitmapSize = tilePixH * cellsW;      // 32 or 48 bytes per tile
  const tileAttrSize = cellsW * cellsH * 4;      // 16 or 24 bytes per tile (8x2 attrs)
  const tileSize = tileBitmapSize + tileAttrSize; // 48 or 72 bytes

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(/** @type {ArrayBuffer} */ (e.target?.result));

    // Validate file size
    if (data.length === 0 || data.length % tileSize !== 0) {
      alert('Invalid ' + ext + ' file: size ' + data.length + ' is not a multiple of ' + tileSize + ' bytes.');
      return;
    }

    const tileCount = data.length / tileSize;

    // Prompt for tiles per row (no cap — single image can be any size)
    const defaultPerRow = Math.min(tileCount, 16);
    const input = window.prompt(
      'File contains ' + tileCount + ' tile' + (tileCount !== 1 ? 's' : '') +
      ' (' + tilePixW + '×' + tilePixH + ' each).\n' +
      'Tiles per row (1–' + tileCount + ', default ' + defaultPerRow + '):',
      String(defaultPerRow)
    );
    if (input === null) return; // cancelled

    let tilesPerRow = parseInt(input, 10);
    if (isNaN(tilesPerRow) || tilesPerRow < 1) tilesPerRow = defaultPerRow;
    if (tilesPerRow > tileCount) tilesPerRow = tileCount;

    // Compute image dimensions
    const rowCount = Math.ceil(tileCount / tilesPerRow);
    const pixelWidth = tilesPerRow * tilePixW;
    const pixelHeight = rowCount * tilePixH;
    const cols = pixelWidth >> 3;  // byte columns

    // Create linear bitmap + attrs buffers
    const bitmapSize = cols * pixelHeight;
    const attrSize = cols * (pixelHeight >> 1);  // one attr per 8x2 cell
    const bitmap = new Uint8Array(bitmapSize);
    const attrs = new Uint8Array(attrSize);

    // Fill buffers from tile data
    for (let t = 0; t < tileCount; t++) {
      const col = t % tilesPerRow;
      const row = Math.floor(t / tilesPerRow);
      const tileOffset = t * tileSize;
      const tileBitmap = data.subarray(tileOffset, tileOffset + tileBitmapSize);
      const tileAttrs = data.subarray(tileOffset + tileBitmapSize, tileOffset + tileSize);

      // Copy bitmap: linear row-major addressing
      for (let ty = 0; ty < tilePixH; ty++) {
        const destY = row * tilePixH + ty;
        const destByteCol = col * cellsW;
        for (let bx = 0; bx < cellsW; bx++) {
          bitmap[destY * cols + destByteCol + bx] = tileBitmap[ty * cellsW + bx];
        }
      }

      // Copy attrs: 8 attr sub-rows (for 16px height at 8x2 resolution)
      // btile stores attrs column-major; wtile stores attrs row-major
      const attrRowsPerTile = cellsH * 4;  // 8 attr rows per tile
      for (let ay = 0; ay < attrRowsPerTile; ay++) {
        for (let ax = 0; ax < cellsW; ax++) {
          const srcIdx = isBtile ? (ax * attrRowsPerTile + ay) : (ay * cellsW + ax);
          const destAttrAddr = (row * attrRowsPerTile + ay) * cols + col * cellsW + ax;
          attrs[destAttrAddr] = tileAttrs[srcIdx];
        }
      }
    }

    // Create Picture via importZxp with attrCellHeight=2 (8x2 multicolor)
    const screenData = new Uint8Array(bitmapSize + attrSize);
    screenData.set(bitmap, 0);
    screenData.set(attrs, bitmapSize);
    const pic = importZxp(bitmap, attrs, file.name, pixelWidth, pixelHeight, 2, null);
    // Store Nirvana tile metadata so save can export as .btile/.wtile
    pic.nirvanaTileInfo = {
      isBtile: isBtile,
      cellsW: cellsW,
      cellsH: cellsH,
      tileCount: tileCount,
      tilesPerRow: tilesPerRow
    };
    addPicture(file.name, FORMAT.ZXP, screenData, pic);

    // Add tiles as sprites (append to existing)
    spriteSheet.name = file.name;
    const firstNewIndex = spriteSheet.sprites.length;
    currentFrameIndex = 0;

    for (let t = 0; t < tileCount; t++) {
      const tileOffset = t * tileSize;
      const tileBitmap = data.subarray(tileOffset, tileOffset + tileBitmapSize);
      const tileAttrs = data.subarray(tileOffset + tileBitmapSize, tileOffset + tileSize);

      // btile: convert attrs from column-major to row-major (internal)
      // wtile: attrs already row-major, direct copy
      let spriteAttrs;
      if (isBtile) {
        const attrRowsPerCol = cellsH * 4;
        spriteAttrs = new Uint8Array(tileAttrs.length);
        for (let ay = 0; ay < attrRowsPerCol; ay++) {
          for (let ax = 0; ax < cellsW; ax++) {
            spriteAttrs[ay * cellsW + ax] = tileAttrs[ax * attrRowsPerCol + ay];
          }
        }
      } else {
        spriteAttrs = new Uint8Array(tileAttrs);
      }
      const sprite = {
        name: 'Tile' + (firstNewIndex + t + 1),
        cellsW: cellsW,
        cellsH: cellsH,
        mode: 'multicolour',
        frames: [{
          bitmap: new Uint8Array(tileBitmap),
          mask: null,
          attrs: spriteAttrs
        }]
      };
      spriteSheet.sprites.push(sprite);
    }

    selectedSpriteIndex = firstNewIndex;
    currentFrameIndex = 0;
    updateSpriteList();
    updateSpriteProps();

    // Auto-select Nirvana export format
    const exportFmt = document.getElementById('spriteExportFormat');
    if (exportFmt) exportFmt.value = 'nirvana';

    // Switch to Sprites tab
    const spritesTab = document.querySelector('.panel-tab[data-tab="sprites"]');
    if (spritesTab) {
      /** @type {HTMLElement} */ (spritesTab).click();
    }
  };

  reader.readAsArrayBuffer(file);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditor);
} else {
  setTimeout(initEditor, 100);
}
