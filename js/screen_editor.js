// SpectraLab Screen Editor v1.18.0
// Tools for editing ZX Spectrum .scr files
// Works like Art Studio / Artist 2 - simple attribute-per-cell model
// @ts-check
"use strict";

// ============================================================================
// Editor Constants
// ============================================================================

const EDITOR = {
  TOOL_PIXEL: 'pixel',
  TOOL_LINE: 'line',
  TOOL_RECT: 'rect',
  TOOL_FILL_CELL: 'fillcell',
  TOOL_RECOLOR: 'recolor',
  TOOL_SELECT: 'select'
};

const COLOR_NAMES = ['Black', 'Blue', 'Red', 'Magenta', 'Green', 'Cyan', 'Yellow', 'White'];

// ============================================================================
// Editor State
// ============================================================================

/** @type {boolean} */
let editorActive = false;

/** @type {string} */
let currentTool = EDITOR.TOOL_PIXEL;

/** @type {number} - Current ink color (0-7) */
let editorInkColor = 7;

/** @type {number} - Current paper color (0-7) */
let editorPaperColor = 0;

/** @type {boolean} */
let editorBright = false;

/** @type {boolean} */
let editorFlash = false;

/** @type {number} - Brush size (1-16) */
let brushSize = 1;

/** @type {string} - Brush shape: 'square', 'round', 'hline', 'vline', 'stroke', 'bstroke', 'custom' */
let brushShape = 'square';

/** @type {Array<{width:number, height:number, data:Uint8Array}|null>} - 5 custom brush bitmaps (variable size, max 64×64) */
let customBrushes = [null, null, null, null, null];

/** @type {number} - Active custom brush slot (0-4), or -1 for built-in shapes */
let activeCustomBrush = -1;

/** @type {boolean} - True when waiting for click(s) to capture region */
let capturingBrush = false;

/** @type {number} - Slot being captured into (0-4) */
let captureSlot = 0;

/** @type {{x:number, y:number}|null} - First corner of brush capture rectangle */
let captureStartPoint = null;

/** @type {string} - Custom brush paint mode: 'set', 'invert', 'replace' */
let brushPaintMode = localStorage.getItem('spectraLabBrushPaintMode') || 'replace';

/** @type {{x: number, y: number}|null} - Start point for line/rect */
let toolStartPoint = null;

/** @type {boolean} */
let isDrawing = false;

/** @type {{x: number, y: number}|null} */
let lastDrawnPixel = null;

/** @type {Uint8Array[]} - Undo stack (multi-level) */
let undoStack = [];

/** @type {Uint8Array[]} - Redo stack */
let redoStack = [];

/** @type {number} - Maximum undo levels */
const MAX_UNDO_LEVELS = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.MAX_UNDO_LEVELS) || 32;

/** @type {number} - Preview zoom level */
let previewZoom = 1;

/** @type {HTMLCanvasElement|null} */
let previewCanvas = null;

// ============================================================================
// Selection / Clipboard State
// ============================================================================

/** @type {{x:number, y:number}|null} - First corner of selection */
let selectionStartPoint = null;

/** @type {{x:number, y:number}|null} - Second corner of selection */
let selectionEndPoint = null;

/** @type {boolean} - Dragging to define selection */
let isSelecting = false;

/** @type {string} - Snap mode: 'grid', 'zero', 'brush', 'off' */
let snapMode = localStorage.getItem('spectraLabSnapMode') || 'grid';

/** @type {{x:number, y:number}|null} - Origin for 'brush' snap mode (set on first paste) */
let brushSnapOrigin = null;

/**
 * Whether selection corners should snap to 8x8 cell boundaries.
 * Any snap mode (grid/zero/brush) implies selection snapping. Always true for .53c.
 * @returns {boolean}
 */
function isSnapActive() {
  return snapMode !== 'off' || currentFormat === FORMAT.ATTR_53C;
}

/**
 * Snaps a paste position according to the current snap mode.
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 */
function snapPastePosition(x, y) {
  const effectiveMode = currentFormat === FORMAT.ATTR_53C ? 'grid' : snapMode;

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

  const hasBrush = activeCustomBrush >= 0 && customBrushes[activeCustomBrush];

  if (snapMode === 'grid' || !hasBrush) {
    return { x: Math.floor(x / 8) * 8, y: Math.floor(y / 8) * 8 };
  }

  const bw = customBrushes[activeCustomBrush].width;
  const bh = customBrushes[activeCustomBrush].height;

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
  const third = Math.floor(y / 64);
  const charRow = Math.floor((y % 64) / 8);
  const pixelLine = y % 8;
  const charCol = Math.floor(x / 8);
  return third * 2048 + pixelLine * 256 + charRow * 32 + charCol;
}

/**
 * Calculates attribute address for a pixel's cell
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 * @returns {number} Byte offset (6144-6911)
 */
function getAttributeAddress(x, y) {
  const charRow = Math.floor(y / 8);
  const charCol = Math.floor(x / 8);
  return SCREEN.BITMAP_SIZE + charRow * 32 + charCol;
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
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return 0;
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
  if (x < 0 || x >= SCREEN.WIDTH || y < 0 || y >= SCREEN.HEIGHT) return;

  // Set the pixel bit
  const bitmapAddr = getBitmapAddress(x, y);
  const bit = getBitPosition(x);

  if (isInk) {
    data[bitmapAddr] |= (1 << bit);
  } else {
    data[bitmapAddr] &= ~(1 << bit);
  }

  // Set the attribute for this cell to current ink/paper/bright
  const attrAddr = getAttributeAddress(x, y);
  data[attrAddr] = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);
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
  return (ink & 0x07) | ((paper & 0x07) << 3) | (bright ? 0x40 : 0) | (flash ? 0x80 : 0);
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
  if (brushShape === 'custom' && activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
    const brush = customBrushes[activeCustomBrush];
    const bw = brush.width;
    const bh = brush.height;
    const bytesPerRow = Math.ceil(bw / 8);
    const offsetX = Math.floor((bw - 1) / 2);
    const offsetY = Math.floor((bh - 1) / 2);
    for (let r = 0; r < bh; r++) {
      for (let c = 0; c < bw; c++) {
        const px = cx + c - offsetX;
        const py = cy + r - offsetY;
        const byteIdx = r * bytesPerRow + Math.floor(c / 8);
        const bitIdx = 7 - (c % 8);
        const brushBit = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;

        if (brushPaintMode === 'replace') {
          // Replace: overwrite every pixel in the brush rectangle
          setPixel(screenData, px, py, brushBit);
        } else if (brushPaintMode === 'invert') {
          // Invert: toggle screen pixel where brush bit is set
          if (brushBit) {
            const current = getPixel(screenData, px, py);
            setPixel(screenData, px, py, !current);
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

  if (brushSize <= 1) {
    setPixel(screenData, cx, cy, isInk);
    return;
  }

  const n = brushSize;
  const offset = Math.floor((n - 1) / 2);

  if (brushShape === 'stroke') {
    // Diagonal line from top-right to bottom-left (like /)
    for (let i = 0; i < n; i++) {
      setPixel(screenData, cx + (n - 1 - i) - offset, cy + i - offset, isInk);
    }
  } else if (brushShape === 'bstroke') {
    // Mirrored diagonal line from top-left to bottom-right (like \)
    for (let i = 0; i < n; i++) {
      setPixel(screenData, cx + i - offset, cy + i - offset, isInk);
    }
  } else if (brushShape === 'hline') {
    // Horizontal line, N pixels wide
    for (let dx = 0; dx < n; dx++) {
      setPixel(screenData, cx + dx - offset, cy, isInk);
    }
  } else if (brushShape === 'vline') {
    // Vertical line, N pixels tall
    for (let dy = 0; dy < n; dy++) {
      setPixel(screenData, cx, cy + dy - offset, isInk);
    }
  } else if (brushShape === 'round') {
    const radius = (n - 0.5) / 2;
    const centerOff = (n - 1) / 2;
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        const dist = Math.sqrt((dx - centerOff) ** 2 + (dy - centerOff) ** 2);
        if (dist <= radius) {
          setPixel(screenData, cx + dx - offset, cy + dy - offset, isInk);
        }
      }
    }
  } else {
    // Square: fill NxN grid
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        setPixel(screenData, cx + dx - offset, cy + dy - offset, isInk);
      }
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
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;
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
  const hasCustomBrush = brushShape === 'custom' && activeCustomBrush >= 0 && customBrushes[activeCustomBrush];

  if (hasCustomBrush) {
    // Step at brush-sized intervals to avoid overlapping stamps destroying each other in replace mode
    const brush = customBrushes[activeCustomBrush];
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

  // Standard Bresenham pixel-by-pixel for regular brushes
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
 * Fills an 8x8 cell with current ink or paper
 * @param {number} x
 * @param {number} y
 * @param {boolean} isInk
 */
function fillCell(x, y, isInk) {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

  const cellX = Math.floor(x / 8) * 8;
  const cellY = Math.floor(y / 8) * 8;

  // Set attribute
  const attrAddr = getAttributeAddress(cellX, cellY);
  screenData[attrAddr] = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);

  // Fill all pixels in cell
  for (let py = 0; py < 8; py++) {
    const bitmapAddr = getBitmapAddress(cellX, cellY + py);
    screenData[bitmapAddr] = isInk ? 0xFF : 0x00;
  }
}

/**
 * Recolors an 8x8 cell's attribute without modifying bitmap data
 * @param {number} x
 * @param {number} y
 */
function recolorCell(x, y) {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

  const cellX = Math.floor(x / 8) * 8;
  const cellY = Math.floor(y / 8) * 8;

  const attrAddr = getAttributeAddress(cellX, cellY);
  screenData[attrAddr] = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);
}

/**
 * Recolors a cell in .53c attribute-only data (768 bytes, linear layout)
 * @param {number} x - X coordinate (0-255)
 * @param {number} y - Y coordinate (0-191)
 */
function recolorCell53c(x, y) {
  if (!screenData || screenData.length < 768) return;
  const addr = Math.floor(x / 8) + Math.floor(y / 8) * 32;
  screenData[addr] = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);
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

  if (isSnapActive()) {
    left = Math.floor(left / 8) * 8;
    top = Math.floor(top / 8) * 8;
    right = Math.floor(right / 8) * 8 + 7;
    bottom = Math.floor(bottom / 8) * 8 + 7;
  }

  // Clamp to screen bounds
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(SCREEN.WIDTH - 1, right);
  bottom = Math.min(SCREEN.HEIGHT - 1, bottom);

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

  if (currentFormat === FORMAT.ATTR_53C) {
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
  } else {
    // .scr: copy bitmap (linear packed) + attributes
    const cellLeft = Math.floor(rect.left / 8);
    const cellTop = Math.floor(rect.top / 8);
    const cellCols = Math.ceil(rect.width / 8);
    const cellRows = Math.ceil(rect.height / 8);

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

    // Copy attributes
    const attrs = new Uint8Array(cellCols * cellRows);
    for (let cr = 0; cr < cellRows; cr++) {
      for (let cc = 0; cc < cellCols; cc++) {
        const srcAddr = SCREEN.BITMAP_SIZE + (cellLeft + cc) + (cellTop + cr) * 32;
        attrs[cr * cellCols + cc] = screenData[srcAddr];
      }
    }

    clipboardData = {
      format: 'scr',
      width: rect.width,
      height: rect.height,
      cellCols,
      cellRows,
      bitmap,
      attrs
    };
  }

  if (infoEl) {
    const fmt = clipboardData.format;
    const cols = clipboardData.cellCols;
    const rows = clipboardData.cellRows;
    infoEl.innerHTML = `Copied ${fmt} region: ${cols}\u00d7${rows} cells`;
  }
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
  const editorFormat = currentFormat === FORMAT.ATTR_53C ? '53c' : 'scr';
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
  document.querySelectorAll('.editor-tool-btn[data-tool]').forEach(btn => {
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
    // Write bitmap pixels — respects brushPaintMode
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
          // XOR: toggle screen pixel where clipboard has ink
          if (clipBit) {
            screenData[bitmapAddr] ^= (1 << bit);
          }
        } else if (brushPaintMode === 'set') {
          // Set: only write ink pixels, leave paper pixels untouched
          if (clipBit) {
            screenData[bitmapAddr] |= (1 << bit);
          }
        } else {
          // Replace (default): overwrite every pixel from clipboard
          if (clipBit) {
            screenData[bitmapAddr] |= (1 << bit);
          } else {
            screenData[bitmapAddr] &= ~(1 << bit);
          }
        }
      }
    }

    // Write attributes from clipboard (preserving original colors)
    const cellLeft = Math.floor(x / 8);
    const cellTop = Math.floor(y / 8);
    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const destCol = cellLeft + cc;
        const destRow = cellTop + cr;
        if (destCol < 0 || destCol >= SCREEN.CHAR_COLS || destRow < 0 || destRow >= SCREEN.CHAR_ROWS) continue;
        const destAddr = SCREEN.BITMAP_SIZE + destCol + destRow * 32;
        screenData[destAddr] = clipboardData.attrs[cr * clipboardData.cellCols + cc];
      }
    }
  } else if (clipboardData.format === '53c') {
    // .53c: write attributes only
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
  const ctx = screenCanvas.getContext('2d');
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
  right = Math.min(SCREEN.WIDTH - 1, right);
  bottom = Math.min(SCREEN.HEIGHT - 1, bottom);

  const borderPixels = getMainScreenOffset();
  const w = right - left + 1;
  const h = bottom - top + 1;

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + left * zoom,
    borderPixels + top * zoom,
    w * zoom,
    h * zoom
  );
  ctx.setLineDash([]);
}

/**
 * Draws a cyan dashed rectangle for the committed (finalized) selection
 */
function drawFinalizedSelectionOverlay() {
  const rect = getSelectionRect();
  if (!rect) return;

  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const borderPixels = getMainScreenOffset();

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + rect.left * zoom,
    borderPixels + rect.top * zoom,
    rect.width * zoom,
    rect.height * zoom
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

  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const snapped = snapPastePosition(x, y);
  x = snapped.x;
  y = snapped.y;

  const borderPixels = getMainScreenOffset();

  ctx.globalAlpha = 0.5;

  if (clipboardData.format === 'scr' && clipboardData.bitmap) {
    // Draw bitmap pixels
    const bitmapBytesPerRow = Math.ceil(clipboardData.width / 8);
    for (let py = 0; py < clipboardData.height; py++) {
      for (let px = 0; px < clipboardData.width; px++) {
        const dx = x + px;
        const dy = y + py;
        if (dx < 0 || dx >= SCREEN.WIDTH || dy < 0 || dy >= SCREEN.HEIGHT) continue;

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
          borderPixels + dy * zoom,
          zoom,
          zoom
        );
      }
    }
  } else if (clipboardData.format === '53c') {
    // Draw attribute cells as colored blocks
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('pattern53cSelect'));
    const pattern = select?.value || 'checker';
    for (let cr = 0; cr < clipboardData.cellRows; cr++) {
      for (let cc = 0; cc < clipboardData.cellCols; cc++) {
        const cellX = x + cc * 8;
        const cellY = y + cr * 8;
        const attr = clipboardData.attrs[cr * clipboardData.cellCols + cc];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const dx = cellX + px;
            const dy = cellY + py;
            if (dx < 0 || dx >= SCREEN.WIDTH || dy < 0 || dy >= SCREEN.HEIGHT) continue;

            let isInk;
            if (pattern === 'stripes') {
              isInk = (Math.floor(px / 2) % 2 + py % 2) % 2 === 0;
            } else if (pattern === 'dd77') {
              const patternByte = (py % 2 === 0) ? 0xDD : 0x77;
              isInk = (patternByte & (1 << (7 - px))) !== 0;
            } else {
              isInk = (px + py) % 2 === 0;
            }
            const rgb = isInk ? inkRgb : paperRgb;

            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(
              borderPixels + dx * zoom,
              borderPixels + dy * zoom,
              zoom,
              zoom
            );
          }
        }
      }
    }
  }

  ctx.globalAlpha = 1.0;

  // Draw outline around paste region
  const pw = clipboardData.format === 'scr' ? clipboardData.width : clipboardData.cellCols * 8;
  const ph = clipboardData.format === 'scr' ? clipboardData.height : clipboardData.cellRows * 8;

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + x * zoom,
    borderPixels + y * zoom,
    pw * zoom,
    ph * zoom
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

  const borderPixels = borderSize * zoom;
  const screenX = Math.floor((canvasX - borderPixels) / zoom);
  const screenY = Math.floor((canvasY - borderPixels) / zoom);

  if (screenX < 0 || screenX >= SCREEN.WIDTH || screenY < 0 || screenY >= SCREEN.HEIGHT) {
    return null;
  }

  return { x: screenX, y: screenY };
}

/**
 * @param {MouseEvent} event
 */
function handleEditorMouseDown(event) {
  if (!editorActive) return;
  event.preventDefault();

  // BSC dispatch: route to main screen or border handler
  if (isBscEditor()) {
    const bsc = canvasToBscCoords(screenCanvas, event);
    if (!bsc) return;

    if (bsc.type === 'main') {
      bscDrawRegion = 'main';
      // Fall through to existing SCR logic with translated coords
      const coords = { x: bsc.x, y: bsc.y };
      _handleEditorMouseDownCoords(event, coords);
    } else {
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

  // Paste mode: click to execute paste
  if (isPasting) {
    executePaste(coords.x, coords.y);
    return;
  }

  // Select tool: start selection drag (works in both .scr and .53c)
  if (currentTool === EDITOR.TOOL_SELECT) {
    selectionStartPoint = { x: coords.x, y: coords.y };
    selectionEndPoint = null;
    isSelecting = true;
    editorRender();
    updateEditorInfo(coords.x, coords.y);
    return;
  }

  // .53c attribute editor: paint cell only
  if (isAttrEditor()) {
    saveUndoState();
    isDrawing = true;
    recolorCell53c(coords.x, coords.y);
    editorRender();
    updateEditorInfo(coords.x, coords.y);
    return;
  }

  saveUndoState();
  isDrawing = true;

  const snapped = snapDrawCoords(coords.x, coords.y);
  lastDrawnPixel = snapped;

  // Left click = ink, Right click = paper
  const isInk = event.button !== 2;

  switch (currentTool) {
    case EDITOR.TOOL_LINE:
    case EDITOR.TOOL_RECT:
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

    case EDITOR.TOOL_RECOLOR:
      recolorCell(coords.x, coords.y);
      editorRender();
      break;
  }

  updateEditorInfo(coords.x, coords.y);
}

/**
 * @param {MouseEvent} event
 */
function handleEditorMouseMove(event) {
  if (!editorActive) return;

  // BSC dispatch
  if (isBscEditor()) {
    const bsc = canvasToBscCoords(screenCanvas, event);
    if (!bsc) return;

    if (bsc.type === 'main') {
      // Ignore if mouseDown started in border
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
      handleBorderMouseMove(event, bsc);
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
  }

  // Paste preview: redraw with paste overlay at cursor
  if (isPasting && coords) {
    editorRender();
    drawPastePreview(coords.x, coords.y);
    return;
  }

  // Show capture selection rectangle preview
  if (capturingBrush && captureStartPoint && coords) {
    editorRender();
    drawCapturePreview(captureStartPoint.x, captureStartPoint.y, coords.x, coords.y);
    return;
  }

  // Selection drag: update preview
  if (isSelecting && selectionStartPoint && coords) {
    editorRender();
    drawSelectionPreview(selectionStartPoint.x, selectionStartPoint.y, coords.x, coords.y);
    return;
  }

  if (!coords) return;

  // .53c attribute editor: drag-paint cells (but not when Select tool is active)
  if (isAttrEditor() && currentTool !== EDITOR.TOOL_SELECT) {
    if (isDrawing) {
      recolorCell53c(coords.x, coords.y);
      editorRender();
    }
    return;
  }

  if (!isDrawing) return;

  const isInk = (event.buttons & 2) === 0; // Left = ink, Right = paper
  const snapped = snapDrawCoords(coords.x, coords.y);

  switch (currentTool) {
    case EDITOR.TOOL_PIXEL:
      // When snap is active, only stamp at discrete snapped positions
      // (drawLine's Bresenham would stamp at intermediate pixels, overwriting previous stamps in replace mode)
      if (isSnapActive()) {
        if (!lastDrawnPixel || lastDrawnPixel.x !== snapped.x || lastDrawnPixel.y !== snapped.y) {
          drawPixel(snapped.x, snapped.y, isInk);
          lastDrawnPixel = snapped;
          editorRender();
        }
      } else {
        // Draw continuous line from last point
        if (lastDrawnPixel) {
          drawLine(lastDrawnPixel.x, lastDrawnPixel.y, snapped.x, snapped.y, isInk);
        } else {
          drawPixel(snapped.x, snapped.y, isInk);
        }
        lastDrawnPixel = snapped;
        editorRender();
      }
      break;

    case EDITOR.TOOL_LINE:
    case EDITOR.TOOL_RECT:
      // Preview - restore and draw preview
      editorRender();
      if (toolStartPoint) {
        drawToolPreview(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y);
      }
      break;

    case EDITOR.TOOL_FILL_CELL:
      fillCell(coords.x, coords.y, isInk);
      editorRender();
      break;

    case EDITOR.TOOL_RECOLOR:
      recolorCell(coords.x, coords.y);
      editorRender();
      break;
  }
}

/**
 * @param {MouseEvent} event
 */
function handleEditorMouseUp(event) {
  if (!editorActive) return;

  // BSC dispatch
  if (isBscEditor()) {
    if (bscDrawRegion === 'border') {
      handleBorderMouseUp();
      bscDrawRegion = null;
      return;
    }
    // BSC main area or no region — fall through to normal logic
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
  // Finalize selection rectangle on mouse release — auto-copy
  if (isSelecting && selectionStartPoint) {
    if (coords) {
      selectionEndPoint = { x: coords.x, y: coords.y };
    }
    isSelecting = false;
    copySelection();
    editorRender();
    return;
  }

  if (!isDrawing) return;

  // .53c attribute editor: just reset drawing state
  if (isAttrEditor()) {
    isDrawing = false;
    return;
  }

  const isInk = event.button !== 2;

  if (toolStartPoint && coords) {
    const snapped = snapDrawCoords(coords.x, coords.y);
    switch (currentTool) {
      case EDITOR.TOOL_LINE:
        drawLine(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, isInk);
        editorRender();
        break;

      case EDITOR.TOOL_RECT:
        drawRect(toolStartPoint.x, toolStartPoint.y, snapped.x, snapped.y, isInk);
        editorRender();
        break;
    }
  }

  isDrawing = false;
  toolStartPoint = null;
  lastDrawnPixel = null;
}

/**
 * Draws preview for line/rect tools
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function drawToolPreview(x0, y0, x1, y1) {
  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const borderPixels = getMainScreenOffset();

  ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
  ctx.lineWidth = Math.max(1, zoom / 2);

  ctx.beginPath();
  if (currentTool === EDITOR.TOOL_LINE) {
    ctx.moveTo(borderPixels + x0 * zoom + zoom / 2, borderPixels + y0 * zoom + zoom / 2);
    ctx.lineTo(borderPixels + x1 * zoom + zoom / 2, borderPixels + y1 * zoom + zoom / 2);
  } else if (currentTool === EDITOR.TOOL_RECT) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0) + 1;
    const height = Math.abs(y1 - y0) + 1;
    ctx.rect(borderPixels + left * zoom, borderPixels + top * zoom, width * zoom, height * zoom);
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
    // Push current state to undo stack
    undoStack.push(new Uint8Array(screenData));

    // Limit stack size
    if (undoStack.length > MAX_UNDO_LEVELS) {
      undoStack.shift();
    }

    // Clear redo stack on new action
    redoStack = [];
  }
}

function undo() {
  if (undoStack.length === 0) return;

  // Save current state to redo stack
  redoStack.push(new Uint8Array(screenData));

  // Restore previous state
  const previousState = undoStack.pop();
  if (previousState) {
    screenData.set(previousState);
    editorRender();
  }
}

function redo() {
  if (redoStack.length === 0) return;

  // Save current state to undo stack
  undoStack.push(new Uint8Array(screenData));

  // Restore redo state
  const redoState = redoStack.pop();
  if (redoState) {
    screenData.set(redoState);
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
    const attr = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);
    for (let i = 0; i < 768; i++) {
      screenData[i] = attr;
    }
    editorRender();
    return;
  }

  // SCR / BSC: Clear all bitmap data (all pixels become paper)
  for (let i = 0; i < SCREEN.BITMAP_SIZE; i++) {
    screenData[i] = 0;
  }

  // Set all attributes to current ink/paper/bright/flash
  const attr = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);
  for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
    screenData[i] = attr;
  }

  // BSC: clear border data to zeros (all black)
  if (currentFormat === FORMAT.BSC) {
    for (let i = BSC.BORDER_OFFSET; i < BSC.TOTAL_SIZE; i++) {
      screenData[i] = 0;
    }
  }

  editorRender();
}

// ============================================================================
// Preview Panel
// ============================================================================

/**
 * Renders the preview canvas
 */
function renderPreview() {
  if (!previewCanvas || !screenData) return;

  const ctx = previewCanvas.getContext('2d');
  if (!ctx) return;

  // BSC: render full frame including borders
  if (currentFormat === FORMAT.BSC && screenData.length >= BSC.TOTAL_SIZE) {
    renderBscPreview(ctx);
    return;
  }

  // Set canvas size based on preview zoom
  previewCanvas.width = SCREEN.WIDTH * previewZoom;
  previewCanvas.height = SCREEN.HEIGHT * previewZoom;

  // Create 1:1 image
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  if (currentFormat === FORMAT.ATTR_53C && screenData.length >= SCREEN.ATTR_SIZE) {
    // .53c: render attribute pattern
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('pattern53cSelect'));
    const pattern = select?.value || 'checker';
    const patternDD = 0xDD;
    const pattern77 = 0x77;

    for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const attr = screenData[col + row * 32];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            let isInk;
            if (pattern === 'stripes') {
              isInk = (Math.floor(px / 2) % 2 + py % 2) % 2 === 0;
            } else if (pattern === 'dd77') {
              const patternByte = (py % 2 === 0) ? patternDD : pattern77;
              isInk = (patternByte & (1 << (7 - px))) !== 0;
            } else {
              isInk = (px + py) % 2 === 0;
            }
            const rgb = isInk ? inkRgb : paperRgb;
            const pixelIndex = (((row * 8 + py) * SCREEN.WIDTH) + col * 8 + px) * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
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

            const x = col * 8;
            const y = section.yOffset + row * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const isSet = (byte & (0x80 >> bit)) !== 0;
              const rgb = isSet ? palette[inkIndex] : palette[paperIndex];
              const pixelIndex = ((y * SCREEN.WIDTH) + x + bit) * 4;
              data[pixelIndex] = rgb[0];
              data[pixelIndex + 1] = rgb[1];
              data[pixelIndex + 2] = rgb[2];
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else {
    return;
  }

  // Draw at 1:1 then scale
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = SCREEN.WIDTH;
  tempCanvas.height = SCREEN.HEIGHT;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;
  tempCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, SCREEN.WIDTH * previewZoom, SCREEN.HEIGHT * previewZoom);
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

  // Draw at 1:1 then scale
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = fw;
  tempCanvas.height = fh;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;
  tempCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, fw * previewZoom, fh * previewZoom);
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

    // Keep panel within viewport
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;

    panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDraggingPreview = false;
  });
}

/**
 * Renders main screen and updates preview if editor is active
 */
function editorRender() {
  renderScreen();
  if (editorActive) {
    renderPreview();
    updateFlashTimer();

    // Draw selection overlay (finalized selection rectangle)
    if (selectionStartPoint && selectionEndPoint && !isSelecting && !isPasting) {
      drawFinalizedSelectionOverlay();
    }

    // Draw paste preview at last cursor position
    if (isPasting && clipboardData) {
      drawPastePreview(pasteCursorPos.x, pasteCursorPos.y);
    }
  }
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

  /** @type {Uint8Array} */
  let saveData;
  /** @type {string} */
  let defaultExt;

  if (currentFormat === FORMAT.ATTR_53C) {
    saveData = screenData.slice(0, 768);
    defaultExt = '.53c';
  } else if (currentFormat === FORMAT.BSC) {
    saveData = screenData.slice(0, BSC.TOTAL_SIZE);
    defaultExt = '.bsc';
  } else {
    saveData = screenData.slice(0, SCREEN.TOTAL_SIZE);
    defaultExt = '.scr';
  }

  const blob = new Blob([saveData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;

  if (!filename) {
    if (currentFileName) {
      const baseName = currentFileName.replace(/\.[^.]+$/, '');
      filename = baseName + '_edited' + defaultExt;
    } else {
      filename = currentFormat === FORMAT.ATTR_53C ? 'attributes.53c' :
                 currentFormat === FORMAT.BSC ? 'screen.bsc' : 'screen.scr';
    }
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
 * @param {string} format - 'scr', 'atr', etc.
 */
function createNewPicture(format) {
  // Exit editor first if active
  if (editorActive) {
    toggleEditorMode();
  }

  switch (format) {
    case 'atr':
      screenData = new Uint8Array(SCREEN.ATTR_SIZE);
      const atrAttr = buildAttribute(7, 0, false, false);
      for (let i = 0; i < SCREEN.ATTR_SIZE; i++) {
        screenData[i] = atrAttr;
      }
      currentFormat = FORMAT.ATTR_53C;
      currentFileName = 'new_screen.atr';
      break;

    case 'bsc':
      screenData = new Uint8Array(BSC.TOTAL_SIZE);
      // Fill attributes (bytes 6144–6911) with white ink on black paper
      const bscAttr = buildAttribute(7, 0, false, false);
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        screenData[i] = bscAttr;
      }
      // Border data (bytes 6912–11135) starts as zeros (all black)
      currentFormat = FORMAT.BSC;
      currentFileName = 'new_screen.bsc';
      break;

    case 'scr':
    default:
      screenData = new Uint8Array(SCREEN.TOTAL_SIZE);
      const scrAttr = buildAttribute(7, 0, false, false);
      for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
        screenData[i] = scrAttr;
      }
      currentFormat = FORMAT.SCR;
      currentFileName = 'new_screen.scr';
      break;
  }

  if (typeof toggleFormatControlsVisibility === 'function') {
    toggleFormatControlsVisibility();
  }
  if (typeof updateFileInfo === 'function') {
    updateFileInfo();
  }
  renderScreen();

  // Enter editor
  toggleEditorMode();
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

  /** @type {number} */
  let attr;
  if (currentFormat === FORMAT.ATTR_53C) {
    if (screenData.length < 768) {
      infoEl.textContent = 'No screen loaded';
      return;
    }
    const addr = cellX + cellY * 32;
    attr = screenData[addr];
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
  } else {
    const pixelValue = getPixel(screenData, x, y);
    infoEl.innerHTML =
      `Pos: (${x}, ${y}) Cell: (${cellX}, ${cellY})<br>` +
      `Cell: ${COLOR_NAMES[parsed.ink]}/${COLOR_NAMES[parsed.paper]}` +
      `${parsed.bright ? ' BRIGHT' : ''}<br>` +
      `Pixel: ${pixelValue ? 'ink' : 'paper'}`;
  }
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
  currentTool = tool;
  document.querySelectorAll('.editor-tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.tool === tool);
  });
  editorRender();
}

/**
 * Sets brush size (1-16) and updates the UI dropdown
 * @param {number} size
 */
function setBrushSize(size) {
  brushSize = Math.max(1, Math.min(16, size));
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('editorBrushSize'));
  if (sel) sel.value = String(brushSize);
}

/**
 * Sets brush shape and updates shape button selection
 * @param {string} shape - 'square', 'round', 'hline', 'vline', 'stroke', or 'bstroke'
 */
function setBrushShape(shape) {
  brushShape = shape;
  activeCustomBrush = -1;
  document.querySelectorAll('.editor-shape-btn').forEach(btn => {
    btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.shape === shape);
  });
  // Deselect custom brush slots
  document.querySelectorAll('.custom-brush-slot').forEach(el => {
    el.classList.remove('selected');
  });
}

function updateColorPreview() {
  const pal = editorBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
  const inkRgb = pal[editorInkColor];
  const paperRgb = pal[editorPaperColor];

  // Update palette cell backgrounds and selection markers
  const container = document.getElementById('editorPalette');
  if (container) {
    const cells = container.querySelectorAll('.editor-palette-cell');
    cells.forEach((cell, i) => {
      const rgb = pal[i];
      /** @type {HTMLElement} */ (cell).style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

      cell.classList.toggle('ink-selected', i === editorInkColor);
      cell.classList.toggle('paper-selected', i === editorPaperColor);

      // Update markers
      const existing = cell.querySelectorAll('.editor-palette-marker');
      existing.forEach(m => m.remove());

      if (i === editorInkColor) {
        const m = document.createElement('span');
        m.className = 'editor-palette-marker ink-marker';
        m.textContent = 'I';
        cell.appendChild(m);
      }
      if (i === editorPaperColor) {
        const m = document.createElement('span');
        m.className = 'editor-palette-marker paper-marker';
        m.textContent = 'P';
        cell.appendChild(m);
      }
    });
  }

}

function updateColorSelectors() {
  const brightCb = /** @type {HTMLInputElement} */ (document.getElementById('editorBrightCheckbox'));
  const flashCb = /** @type {HTMLInputElement} */ (document.getElementById('editorFlashCheckbox'));
  if (brightCb) brightCb.checked = editorBright;
  if (flashCb) flashCb.checked = editorFlash;

  updateColorPreview();
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
      updateColorPreview();
    });

    // Right click = set paper
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      editorPaperColor = i;
      updateColorPreview();
    });

    container.appendChild(cell);
  }

  updateColorPreview();
}

/**
 * Checks if format is editable
 * @returns {boolean}
 */
function isFormatEditable() {
  if (currentFormat === FORMAT.SCR && screenData && screenData.length >= SCREEN.TOTAL_SIZE) return true;
  if (currentFormat === FORMAT.ATTR_53C && screenData && screenData.length >= 768) return true;
  if (currentFormat === FORMAT.BSC && screenData && screenData.length >= BSC.TOTAL_SIZE) return true;
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
 * Checks if we're in BSC editor mode
 * @returns {boolean}
 */
function isBscEditor() {
  return editorActive && currentFormat === FORMAT.BSC;
}

/**
 * Returns the canvas pixel offset for the main screen area.
 * BSC: 64 * zoom (border is the content, no padding).
 * SCR/53c: borderSize * zoom (user-configured border padding).
 * @returns {number}
 */
function getMainScreenOffset() {
  if (currentFormat === FORMAT.BSC) {
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

  // BSC canvas has no border padding — frame pixel coords directly
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
 * Maps frame pixel coords to border data byte offset + halfIndex.
 * halfIndex: 0 = bits 0–2 (first color), 1 = bits 3–5 (second color).
 * @param {number} frameX - Frame X coordinate (0–383)
 * @param {number} frameY - Frame Y coordinate (0–303)
 * @returns {{byteOffset:number, halfIndex:number, region:string}|null}
 */
function getBscBorderByteInfo(frameX, frameY) {
  if (frameY < 64) {
    // Top border: full 384px width, 64 lines
    const byteOffset = BSC.BORDER_OFFSET + frameY * BSC.BYTES_PER_FULL_LINE + Math.floor(frameX / 16);
    const halfIndex = Math.floor((frameX % 16) / 8);
    return { byteOffset, halfIndex, region: 'top' };
  } else if (frameY < 256) {
    // Side borders (main screen Y range)
    if (frameX < 64) {
      // Left side
      const byteOffset = BSC.BORDER_OFFSET + 64 * BSC.BYTES_PER_FULL_LINE + (frameY - 64) * BSC.BYTES_PER_SIDE_LINE + Math.floor(frameX / 16);
      const halfIndex = Math.floor((frameX % 16) / 8);
      return { byteOffset, halfIndex, region: 'left' };
    } else if (frameX >= 320) {
      // Right side
      const byteOffset = BSC.BORDER_OFFSET + 64 * BSC.BYTES_PER_FULL_LINE + (frameY - 64) * BSC.BYTES_PER_SIDE_LINE + 4 + Math.floor((frameX - 320) / 16);
      const halfIndex = Math.floor(((frameX - 320) % 16) / 8);
      return { byteOffset, halfIndex, region: 'right' };
    }
    return null; // Inside main screen area — not border
  } else if (frameY < 304) {
    // Bottom border: full 384px width, 48 lines
    const bottomOffset = BSC.BORDER_OFFSET + 64 * BSC.BYTES_PER_FULL_LINE + 192 * BSC.BYTES_PER_SIDE_LINE;
    const byteOffset = bottomOffset + (frameY - 256) * BSC.BYTES_PER_FULL_LINE + Math.floor(frameX / 16);
    const halfIndex = Math.floor((frameX % 16) / 8);
    return { byteOffset, halfIndex, region: 'bottom' };
  }
  return null;
}

/**
 * Writes a 3-bit color (0–7) into the appropriate half of a border byte.
 * @param {number} byteOffset - Offset in screenData
 * @param {number} halfIndex - 0 = bits 0–2, 1 = bits 3–5
 * @param {number} color - Color value (0–7)
 */
function setBscBorderColor(byteOffset, halfIndex, color) {
  if (!screenData || byteOffset >= screenData.length) return;
  const c = color & 0x07;
  let byte = screenData[byteOffset];
  if (halfIndex === 0) {
    byte = (byte & 0xF8) | c;         // Clear bits 0–2, set color
  } else {
    byte = (byte & 0xC7) | (c << 3);  // Clear bits 3–5, set color
  }
  screenData[byteOffset] = byte;
}

/**
 * Paints a 24px-wide border cell (3 consecutive 8px segments) at the given frame position.
 * The horizontal start is snapped to the nearest 8px boundary so the 24px block
 * always begins at a segment edge.
 * @param {number} frameX - Raw frame X coordinate
 * @param {number} frameY - Frame Y coordinate
 * @param {number} color - Color value (0–7)
 */
function paintBscBorderCell(frameX, frameY, color) {
  const snappedX = Math.floor(frameX / 8) * 8;
  for (let dx = 0; dx < 24; dx += 8) {
    const px = snappedX + dx;
    if (px < 0 || px >= BSC.FRAME_WIDTH) continue;
    const info = getBscBorderByteInfo(px, frameY);
    if (info) {
      setBscBorderColor(info.byteOffset, info.halfIndex, color);
    }
  }
}

/**
 * Handles mouse down on BSC border area.
 * @param {MouseEvent} event
 * @param {{type:'border', frameX:number, frameY:number, region:string, byteOffset:number, halfIndex:number}} bscCoords
 */
function handleBorderMouseDown(event, bscCoords) {
  saveUndoState();
  isBorderDrawing = true;
  // Left click = ink color, Right click = black (color 0)
  const color = event.button !== 2 ? editorInkColor : 0;
  paintBscBorderCell(bscCoords.frameX, bscCoords.frameY, color);
  editorRender();
  updateBscEditorInfo(bscCoords);
}

/**
 * Handles mouse move on BSC border area during drawing.
 * @param {MouseEvent} event
 * @param {{type:'border', frameX:number, frameY:number, region:string, byteOffset:number, halfIndex:number}} bscCoords
 */
function handleBorderMouseMove(event, bscCoords) {
  if (isBorderDrawing) {
    const color = (event.buttons & 2) !== 0 ? 0 : editorInkColor;
    paintBscBorderCell(bscCoords.frameX, bscCoords.frameY, color);
    editorRender();
  }
  updateBscEditorInfo(bscCoords);
}

/**
 * Handles mouse up on BSC border area.
 */
function handleBorderMouseUp() {
  isBorderDrawing = false;
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

function toggleEditorMode() {
  if (!editorActive) {
    if (!screenData || screenData.length === 0) {
      if (confirm('No screen loaded. Create a new blank screen?')) {
        createNewScreen(7, 0, false);
      } else {
        return;
      }
    } else if (!isFormatEditable()) {
      alert('Editor only supports .scr (6912 bytes), .53c/.atr (768 bytes) and .bsc (11136 bytes) formats.\nCurrent format: ' + currentFormat);
      return;
    }
  }

  editorActive = !editorActive;

  const overlay = document.getElementById('scrEditorOverlay');
  if (overlay) overlay.classList.toggle('active', editorActive);

  const btn = document.getElementById('scrEditBtn');
  if (btn) btn.style.display = editorActive ? 'none' : '';

  if (screenCanvas) {
    screenCanvas.style.cursor = editorActive ? 'crosshair' : 'default';
  }

  // Hide/show file info panel
  const infoPanel = document.querySelector('.info-panel');
  if (infoPanel) infoPanel.style.display = editorActive ? 'none' : '';

  const toolsSection = document.getElementById('editorToolsSection');
  const brushSection = document.getElementById('editorBrushSection');
  const clipboardSection = document.getElementById('editorClipboardSection');

  if (editorActive) {
    screenCanvas.addEventListener('mousedown', handleEditorMouseDown);
    screenCanvas.addEventListener('mousemove', handleEditorMouseMove);
    screenCanvas.addEventListener('mouseup', handleEditorMouseUp);
    screenCanvas.addEventListener('mouseleave', handleEditorMouseUp);
    screenCanvas.addEventListener('contextmenu', handleContextMenu);

    // Clipboard section: always visible when editor is active
    if (clipboardSection) clipboardSection.style.display = '';

    const snapSelect = document.getElementById('editorSnapMode');
    const exportAsmBtn = document.getElementById('editorExportAsmBtn');
    if (currentFormat === FORMAT.ATTR_53C) {
      // .53c editor: hide tools, brush, snap (always grid)
      if (toolsSection) toolsSection.style.display = 'none';
      if (brushSection) brushSection.style.display = 'none';
      if (snapSelect) snapSelect.parentElement.style.display = 'none';
    } else {
      // SCR editor: show everything
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = '';
      if (snapSelect) snapSelect.parentElement.style.display = '';
    }
    // Show Export ASM button only for BSC format
    if (exportAsmBtn) exportAsmBtn.style.display = (currentFormat === FORMAT.BSC) ? '' : 'none';
    showPreviewPanel();
  } else {
    // Cancel selection/paste on editor exit
    selectionStartPoint = null;
    selectionEndPoint = null;
    isSelecting = false;
    isPasting = false;

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
    hidePreviewPanel();
  }
}

// ============================================================================
// Custom Brushes
// ============================================================================

/**
 * Starts capturing a rectangular region from the screen into a custom brush slot
 * @param {number} slot - Slot index (0-4)
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
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

  // Normalize rectangle
  let left = Math.min(x0, x1);
  let top = Math.min(y0, y1);
  let right = Math.max(x0, x1);
  let bottom = Math.max(y0, y1);

  // Clamp to screen bounds
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(SCREEN.WIDTH - 1, right);
  bottom = Math.min(SCREEN.HEIGHT - 1, bottom);

  // Limit to 64x64
  let bw = right - left + 1;
  let bh = bottom - top + 1;
  if (bw > 64) { right = left + 63; bw = 64; }
  if (bh > 64) { bottom = top + 63; bh = 64; }

  const bytesPerRow = Math.ceil(bw / 8);
  const data = new Uint8Array(bytesPerRow * bh);

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      if (getPixel(screenData, left + c, top + r)) {
        const byteIdx = r * bytesPerRow + Math.floor(c / 8);
        const bitIdx = 7 - (c % 8);
        data[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  customBrushes[captureSlot] = { width: bw, height: bh, data: data };
  capturingBrush = false;
  captureStartPoint = null;
  selectCustomBrush(captureSlot);
  renderCustomBrushPreview(captureSlot);
  saveCustomBrushes();
}

/**
 * Draws capture selection rectangle preview on canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function drawCapturePreview(x0, y0, x1, y1) {
  const ctx = screenCanvas.getContext('2d');
  if (!ctx) return;

  const borderPixels = getMainScreenOffset();
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.min(Math.abs(x1 - x0) + 1, 64);
  const h = Math.min(Math.abs(y1 - y0) + 1, 64);

  ctx.strokeStyle = 'rgba(0, 255, 128, 0.9)';
  ctx.lineWidth = Math.max(1, zoom / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    borderPixels + left * zoom,
    borderPixels + top * zoom,
    w * zoom,
    h * zoom
  );
  ctx.setLineDash([]);
}

/**
 * Rotates the active custom brush 90 degrees clockwise
 */
function rotateCustomBrush() {
  if (activeCustomBrush < 0 || !customBrushes[activeCustomBrush]) return;
  const brush = customBrushes[activeCustomBrush];
  const ow = brush.width;
  const oh = brush.height;
  const oldBpr = Math.ceil(ow / 8);
  // Rotated: new width = old height, new height = old width
  const nw = oh;
  const nh = ow;
  const newBpr = Math.ceil(nw / 8);
  const newData = new Uint8Array(newBpr * nh);

  for (let r = 0; r < oh; r++) {
    for (let c = 0; c < ow; c++) {
      const oldIdx = r * oldBpr + Math.floor(c / 8);
      const oldBit = 7 - (c % 8);
      if (brush.data[oldIdx] & (1 << oldBit)) {
        // (r, c) -> (c, oh - 1 - r)
        const nr = c;
        const nc = oh - 1 - r;
        const newIdx = nr * newBpr + Math.floor(nc / 8);
        const newBit = 7 - (nc % 8);
        newData[newIdx] |= (1 << newBit);
      }
    }
  }

  brush.width = nw;
  brush.height = nh;
  brush.data = newData;
  renderCustomBrushPreview(activeCustomBrush);
  saveCustomBrushes();
}

/**
 * Mirrors the active custom brush horizontally (left-right flip)
 */
function mirrorCustomBrushH() {
  if (activeCustomBrush < 0 || !customBrushes[activeCustomBrush]) return;
  const brush = customBrushes[activeCustomBrush];
  const bw = brush.width;
  const bh = brush.height;
  const bpr = Math.ceil(bw / 8);
  const newData = new Uint8Array(bpr * bh);

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      const oldIdx = r * bpr + Math.floor(c / 8);
      const oldBit = 7 - (c % 8);
      if (brush.data[oldIdx] & (1 << oldBit)) {
        const nc = bw - 1 - c;
        const newIdx = r * bpr + Math.floor(nc / 8);
        const newBit = 7 - (nc % 8);
        newData[newIdx] |= (1 << newBit);
      }
    }
  }

  brush.data = newData;
  renderCustomBrushPreview(activeCustomBrush);
  saveCustomBrushes();
}

/**
 * Mirrors the active custom brush vertically (top-bottom flip)
 */
function mirrorCustomBrushV() {
  if (activeCustomBrush < 0 || !customBrushes[activeCustomBrush]) return;
  const brush = customBrushes[activeCustomBrush];
  const bw = brush.width;
  const bh = brush.height;
  const bpr = Math.ceil(bw / 8);
  const newData = new Uint8Array(bpr * bh);

  for (let r = 0; r < bh; r++) {
    for (let c = 0; c < bw; c++) {
      const oldIdx = r * bpr + Math.floor(c / 8);
      const oldBit = 7 - (c % 8);
      if (brush.data[oldIdx] & (1 << oldBit)) {
        const nr = bh - 1 - r;
        const newIdx = nr * bpr + Math.floor(c / 8);
        const newBit = 7 - (c % 8);
        newData[newIdx] |= (1 << newBit);
      }
    }
  }

  brush.data = newData;
  renderCustomBrushPreview(activeCustomBrush);
  saveCustomBrushes();
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

/**
 * Clears a custom brush slot
 * @param {number} slot - Slot index (0-4)
 */
function clearCustomBrush(slot) {
  customBrushes[slot] = null;
  if (brushShape === 'custom' && activeCustomBrush === slot) {
    brushShape = 'square';
    activeCustomBrush = -1;
    document.querySelectorAll('.editor-shape-btn').forEach(btn => {
      btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.shape === 'square');
    });
  }
  renderCustomBrushPreview(slot);
  const el = document.getElementById('customBrush' + slot);
  if (el) el.classList.remove('selected');
  saveCustomBrushes();
}

/**
 * Selects a custom brush slot for painting
 * @param {number} slot - Slot index (0-3)
 */
function selectCustomBrush(slot) {
  if (!customBrushes[slot]) {
    startBrushCapture(slot);
    return;
  }

  brushShape = 'custom';
  activeCustomBrush = slot;

  // Deselect built-in shape buttons
  document.querySelectorAll('.editor-shape-btn').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Highlight selected custom brush slot
  for (let i = 0; i < 5; i++) {
    const el = document.getElementById('customBrush' + i);
    if (el) el.classList.toggle('selected', i === slot);
  }
}

/**
 * Renders a custom brush preview into its canvas
 * @param {number} slot - Slot index (0-4)
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
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#444';
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
    // Scale to fit canvas, integer scale preferred
    const scale = Math.max(1, Math.min(Math.floor(cw / bw), Math.floor(ch / bh)));
    const ox = Math.floor((cw - bw * scale) / 2);
    const oy = Math.floor((ch - bh * scale) / 2);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, cw, ch);

    for (let r = 0; r < bh; r++) {
      for (let c = 0; c < bw; c++) {
        const byteIdx = r * bytesPerRow + Math.floor(c / 8);
        const bitIdx = 7 - (c % 8);
        const isSet = (brush.data[byteIdx] & (1 << bitIdx)) !== 0;
        if (isSet) {
          ctx.fillStyle = '#e0e0e0';
          ctx.fillRect(ox + c * scale, oy + r * scale, scale, scale);
        }
      }
    }
  }
}

/**
 * Renders all custom brush preview canvases
 */
function renderAllCustomBrushPreviews() {
  for (let i = 0; i < 5; i++) {
    renderCustomBrushPreview(i);
  }
}

/**
 * Saves custom brushes to localStorage
 */
function saveCustomBrushes() {
  const arr = customBrushes.map(b => {
    if (!b) return null;
    return {
      w: b.width,
      h: b.height,
      d: btoa(String.fromCharCode(...b.data))
    };
  });
  localStorage.setItem('spectraLabCustomBrushes', JSON.stringify(arr));
}

/**
 * Loads custom brushes from localStorage (with backward compatibility for old 16×16 format)
 */
function loadCustomBrushes() {
  const raw = localStorage.getItem('spectraLabCustomBrushes');
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    for (let i = 0; i < 5; i++) {
      if (!arr[i]) {
        customBrushes[i] = null;
      } else if (typeof arr[i] === 'string') {
        // Old format: base64 string of 32-byte Uint8Array (16×16)
        const data = new Uint8Array([...atob(arr[i])].map(c => c.charCodeAt(0)));
        customBrushes[i] = { width: 16, height: 16, data: data };
      } else {
        // New format: {w, h, d}
        const data = new Uint8Array([...atob(arr[i].d)].map(c => c.charCodeAt(0)));
        customBrushes[i] = { width: arr[i].w, height: arr[i].h, data: data };
      }
    }
  } catch (e) {
    // Ignore corrupt data
  }
}

// ============================================================================
// Initialization
// ============================================================================

function initEditor() {
  // Cache preview canvas
  previewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editorPreviewCanvas'));

  // Tool buttons
  document.querySelectorAll('.editor-tool-btn[data-tool]').forEach(btn => {
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
  document.querySelectorAll('.editor-shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const shape = /** @type {HTMLElement} */ (btn).dataset.shape;
      if (shape) setBrushShape(shape);
    });
  });

  // Custom brush slots
  document.querySelectorAll('.custom-brush-slot').forEach(canvas => {
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

  // Brush rotate/mirror buttons
  document.getElementById('brushRotateBtn')?.addEventListener('click', rotateCustomBrush);
  document.getElementById('brushMirrorHBtn')?.addEventListener('click', mirrorCustomBrushH);
  document.getElementById('brushMirrorVBtn')?.addEventListener('click', mirrorCustomBrushV);

  // Brush paint mode select
  const paintModeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('brushPaintMode'));
  if (paintModeSelect) {
    paintModeSelect.value = brushPaintMode;
    paintModeSelect.addEventListener('change', (e) => {
      brushPaintMode = /** @type {HTMLSelectElement} */ (e.target).value;
      localStorage.setItem('spectraLabBrushPaintMode', brushPaintMode);
    });
  }

  // Load custom brushes from localStorage and render previews
  loadCustomBrushes();
  renderAllCustomBrushPreviews();

  // Build color palette
  buildPalette();

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

  // Paste button
  document.getElementById('editorPasteBtn')?.addEventListener('click', () => {
    startPasteMode();
  });

  // Action buttons
  document.getElementById('editorSaveBtn')?.addEventListener('click', () => saveScrFile());
  document.getElementById('editorExportAsmBtn')?.addEventListener('click', exportBscAsm);
  document.getElementById('editorUndoBtn')?.addEventListener('click', undo);
  document.getElementById('editorRedoBtn')?.addEventListener('click', redo);
  document.getElementById('editorClearBtn')?.addEventListener('click', clearScreen);
  document.getElementById('scrEditBtn')?.addEventListener('click', toggleEditorMode);
  document.getElementById('scrExitBtn')?.addEventListener('click', toggleEditorMode);

  // Preview zoom buttons
  document.getElementById('previewZoomIn')?.addEventListener('click', () => setPreviewZoom(previewZoom + 1));
  document.getElementById('previewZoomOut')?.addEventListener('click', () => setPreviewZoom(previewZoom - 1));

  // Initialize preview drag
  initPreviewDrag();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!editorActive) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      redo();
    }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveScrFile();
    }
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      copySelection();
      // Clear selection visuals after manual copy
      selectionStartPoint = null;
      selectionEndPoint = null;
      isSelecting = false;
      editorRender();
    }
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      startPasteMode();
    }

    if (!e.ctrlKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'p': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_PIXEL); break;
        case 'l': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_LINE); break;
        case 'r':
          if (isPasting && clipboardData) {
            rotateClipboard();
          } else if (activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
            rotateCustomBrush();
          } else if (!isAttrEditor()) {
            setEditorTool(EDITOR.TOOL_RECT);
          }
          break;
        case 'h':
          if (isPasting && clipboardData) {
            mirrorClipboardH();
          } else if (activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
            mirrorCustomBrushH();
          }
          break;
        case 'v':
          if (isPasting && clipboardData) {
            mirrorClipboardV();
          } else if (activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
            mirrorCustomBrushV();
          }
          break;
        case 'c': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_FILL_CELL); break;
        case 'a': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_RECOLOR); break;
        case 's': setEditorTool(EDITOR.TOOL_SELECT); break;
        case 'b':
          editorBright = !editorBright;
          updateColorSelectors();
          break;
        case 'f':
          editorFlash = !editorFlash;
          updateColorSelectors();
          break;
      }
    }

    // Escape: cancel paste/selection first (higher priority), then brush capture
    if (e.key === 'Escape') {
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
    }

    // Brush size shortcuts — skip for .53c editor
    if (!isAttrEditor()) {
      if (e.key === '[') {
        setBrushSize(brushSize - 1);
      }
      if (e.key === ']') {
        setBrushSize(brushSize + 1);
      }
    }
  });

  updateColorSelectors();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditor);
} else {
  setTimeout(initEditor, 100);
}
