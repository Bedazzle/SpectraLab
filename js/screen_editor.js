// SpectraLab Screen Editor v1.16.0
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

/** @type {boolean} - Snap selection to 8x8 cell boundaries */
let selectionSnapToCell = true;

/**
 * Effective snap state — always true for .53c (attribute-only, cell granularity)
 * @returns {boolean}
 */
function isSnapActive() {
  return selectionSnapToCell || currentFormat === FORMAT.ATTR_53C;
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

  // Snap paste position if enabled
  if (isSnapActive()) {
    x = Math.floor(x / 8) * 8;
    y = Math.floor(y / 8) * 8;
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

  const borderPixels = borderSize * zoom;
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

  const borderPixels = borderSize * zoom;

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

  if (isSnapActive()) {
    x = Math.floor(x / 8) * 8;
    y = Math.floor(y / 8) * 8;
  }

  const borderPixels = borderSize * zoom;

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

  const coords = canvasToScreenCoords(screenCanvas, event);
  if (!coords) return;

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
  lastDrawnPixel = coords;

  // Left click = ink, Right click = paper
  const isInk = event.button !== 2;

  switch (currentTool) {
    case EDITOR.TOOL_LINE:
    case EDITOR.TOOL_RECT:
      toolStartPoint = coords;
      break;

    case EDITOR.TOOL_PIXEL:
      drawPixel(coords.x, coords.y, isInk);
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

  const coords = canvasToScreenCoords(screenCanvas, event);
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

  switch (currentTool) {
    case EDITOR.TOOL_PIXEL:
      // Draw continuous line from last point
      if (lastDrawnPixel) {
        drawLine(lastDrawnPixel.x, lastDrawnPixel.y, coords.x, coords.y, isInk);
      } else {
        drawPixel(coords.x, coords.y, isInk);
      }
      lastDrawnPixel = coords;
      editorRender();
      break;

    case EDITOR.TOOL_LINE:
    case EDITOR.TOOL_RECT:
      // Preview - restore and draw preview
      editorRender();
      if (toolStartPoint) {
        drawToolPreview(toolStartPoint.x, toolStartPoint.y, coords.x, coords.y);
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

  // Finalize selection rectangle on mouse release — auto-copy
  if (isSelecting && selectionStartPoint) {
    const coords = canvasToScreenCoords(screenCanvas, event);
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

  const coords = canvasToScreenCoords(screenCanvas, event);
  const isInk = event.button !== 2;

  if (toolStartPoint && coords) {
    switch (currentTool) {
      case EDITOR.TOOL_LINE:
        drawLine(toolStartPoint.x, toolStartPoint.y, coords.x, coords.y, isInk);
        editorRender();
        break;

      case EDITOR.TOOL_RECT:
        drawRect(toolStartPoint.x, toolStartPoint.y, coords.x, coords.y, isInk);
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

  const borderPixels = borderSize * zoom;

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

  // SCR: Clear all bitmap data (all pixels become paper)
  for (let i = 0; i < SCREEN.BITMAP_SIZE; i++) {
    screenData[i] = 0;
  }

  // Set all attributes to current ink/paper/bright/flash
  const attr = buildAttribute(editorInkColor, editorPaperColor, editorBright, editorFlash);
  for (let i = SCREEN.BITMAP_SIZE; i < SCREEN.TOTAL_SIZE; i++) {
    screenData[i] = attr;
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
      filename = currentFormat === FORMAT.ATTR_53C ? 'attributes.53c' : 'screen.scr';
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
  return false;
}

/**
 * Checks if we're in attribute-only editor mode (.53c)
 * @returns {boolean}
 */
function isAttrEditor() {
  return editorActive && currentFormat === FORMAT.ATTR_53C;
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
      alert('Editor only supports .scr (6912 bytes) and .53c/.atr (768 bytes) formats.\nCurrent format: ' + currentFormat);
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
  const attrsCheckbox = document.getElementById('editorShowAttrs');
  const clipboardSection = document.getElementById('editorClipboardSection');

  if (editorActive) {
    screenCanvas.addEventListener('mousedown', handleEditorMouseDown);
    screenCanvas.addEventListener('mousemove', handleEditorMouseMove);
    screenCanvas.addEventListener('mouseup', handleEditorMouseUp);
    screenCanvas.addEventListener('mouseleave', handleEditorMouseUp);
    screenCanvas.addEventListener('contextmenu', handleContextMenu);

    // Clipboard section: always visible when editor is active
    if (clipboardSection) clipboardSection.style.display = '';

    const snapCheckbox = document.getElementById('editorSnapCheckbox');
    if (currentFormat === FORMAT.ATTR_53C) {
      // .53c editor: hide tools, brush, attrs checkbox, snap (always snapped)
      if (toolsSection) toolsSection.style.display = 'none';
      if (brushSection) brushSection.style.display = 'none';
      if (attrsCheckbox) attrsCheckbox.parentElement.style.display = 'none';
      if (snapCheckbox) snapCheckbox.parentElement.style.display = 'none';
    } else {
      // SCR editor: show everything
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = '';
      if (attrsCheckbox) attrsCheckbox.parentElement.style.display = '';
      if (snapCheckbox) snapCheckbox.parentElement.style.display = '';
    }
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
    if (attrsCheckbox) attrsCheckbox.parentElement.style.display = '';
    if (clipboardSection) clipboardSection.style.display = '';
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

  const borderPixels = borderSize * zoom;
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
      if (/** @type {MouseEvent} */ (e).shiftKey) {
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

  const attrsCb = document.getElementById('editorShowAttrs');
  if (attrsCb) {
    attrsCb.addEventListener('change', (e) => {
      showAttributes = /** @type {HTMLInputElement} */ (e.target).checked;
      editorRender();
    });
  }

  // Snap checkbox
  const snapCb = document.getElementById('editorSnapCheckbox');
  if (snapCb) {
    snapCb.addEventListener('change', (e) => {
      selectionSnapToCell = /** @type {HTMLInputElement} */ (e.target).checked;
    });
  }

  // Paste button
  document.getElementById('editorPasteBtn')?.addEventListener('click', () => {
    startPasteMode();
  });

  // Action buttons
  document.getElementById('editorSaveBtn')?.addEventListener('click', () => saveScrFile());
  document.getElementById('editorUndoBtn')?.addEventListener('click', undo);
  document.getElementById('editorRedoBtn')?.addEventListener('click', redo);
  document.getElementById('editorClearBtn')?.addEventListener('click', clearScreen);
  document.getElementById('editorNewBtn')?.addEventListener('click', () => {
    createNewScreen(editorInkColor, editorPaperColor, editorBright);
  });
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
    }
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      startPasteMode();
    }

    if (!e.ctrlKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'p': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_PIXEL); break;
        case 'l': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_LINE); break;
        case 'r': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_RECT); break;
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
