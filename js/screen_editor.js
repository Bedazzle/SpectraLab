// SpectraLab Screen Editor v1.15.0
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
  TOOL_RECOLOR: 'recolor'
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

/** @type {Array<Uint8Array|null>} - 5 custom brush bitmaps (16 rows × 2 bytes = 32 bytes each) */
let customBrushes = [null, null, null, null, null];

/** @type {number} - Active custom brush slot (0-4), or -1 for built-in shapes */
let activeCustomBrush = -1;

/** @type {boolean} - True when waiting for click to capture 16x16 region */
let capturingBrush = false;

/** @type {number} - Slot being captured into (0-4) */
let captureSlot = 0;

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
  // Custom brush: stamp 16x16 pattern centered on cursor
  if (brushShape === 'custom' && activeCustomBrush >= 0 && customBrushes[activeCustomBrush]) {
    const data = customBrushes[activeCustomBrush];
    for (let r = 0; r < 16; r++) {
      const byte0 = data[r * 2];
      const byte1 = data[r * 2 + 1];
      for (let c = 0; c < 8; c++) {
        if (byte0 & (0x80 >> c)) {
          setPixel(screenData, cx + c - 7, cy + r - 7, isInk);
        }
      }
      for (let c = 0; c < 8; c++) {
        if (byte1 & (0x80 >> c)) {
          setPixel(screenData, cx + 8 + c - 7, cy + r - 7, isInk);
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

  // Intercept for brush capture
  if (capturingBrush) {
    finishBrushCapture(coords.x, coords.y);
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
  }

  if (!coords) return;

  // .53c attribute editor: drag-paint cells
  if (isAttrEditor()) {
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
  if (!editorActive || !isDrawing) return;

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
  if (currentFormat === FORMAT.ATTR_53C) return;
  if (!previewCanvas || !screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

  const ctx = previewCanvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size based on preview zoom
  previewCanvas.width = SCREEN.WIDTH * previewZoom;
  previewCanvas.height = SCREEN.HEIGHT * previewZoom;

  // Create 1:1 image
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  // Render all three screen thirds
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
  currentTool = tool;
  document.querySelectorAll('.editor-tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('selected', /** @type {HTMLElement} */(btn).dataset.tool === tool);
  });
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

  if (editorActive) {
    screenCanvas.addEventListener('mousedown', handleEditorMouseDown);
    screenCanvas.addEventListener('mousemove', handleEditorMouseMove);
    screenCanvas.addEventListener('mouseup', handleEditorMouseUp);
    screenCanvas.addEventListener('mouseleave', handleEditorMouseUp);
    screenCanvas.addEventListener('contextmenu', handleContextMenu);

    if (currentFormat === FORMAT.ATTR_53C) {
      // .53c editor: hide tools, brush, attrs checkbox; no preview panel
      if (toolsSection) toolsSection.style.display = 'none';
      if (brushSection) brushSection.style.display = 'none';
      if (attrsCheckbox) attrsCheckbox.parentElement.style.display = 'none';
    } else {
      // SCR editor: show everything + preview panel
      if (toolsSection) toolsSection.style.display = '';
      if (brushSection) brushSection.style.display = '';
      if (attrsCheckbox) attrsCheckbox.parentElement.style.display = '';
      showPreviewPanel();
    }
  } else {
    screenCanvas.removeEventListener('mousedown', handleEditorMouseDown);
    screenCanvas.removeEventListener('mousemove', handleEditorMouseMove);
    screenCanvas.removeEventListener('mouseup', handleEditorMouseUp);
    screenCanvas.removeEventListener('mouseleave', handleEditorMouseUp);
    screenCanvas.removeEventListener('contextmenu', handleContextMenu);

    // Restore all sections visibility
    if (toolsSection) toolsSection.style.display = '';
    if (brushSection) brushSection.style.display = '';
    if (attrsCheckbox) attrsCheckbox.parentElement.style.display = '';
    hidePreviewPanel();
  }
}

// ============================================================================
// Custom Brushes
// ============================================================================

/**
 * Starts capturing a 16x16 region from the screen into a custom brush slot
 * @param {number} slot - Slot index (0-3)
 */
function startBrushCapture(slot) {
  capturingBrush = true;
  captureSlot = slot;
  const infoEl = document.getElementById('editorPositionInfo');
  if (infoEl) {
    infoEl.innerHTML = 'Click on screen to capture 16\u00d716 brush';
  }
}

/**
 * Finishes capturing a 16x16 region from the screen
 * @param {number} x - Click X coordinate
 * @param {number} y - Click Y coordinate
 */
function finishBrushCapture(x, y) {
  if (!screenData || screenData.length < SCREEN.TOTAL_SIZE) return;

  // Clamp to screen bounds so 16x16 region fits
  x = Math.min(x, 240);
  y = Math.min(y, 176);

  const data = new Uint8Array(32);
  for (let r = 0; r < 16; r++) {
    let byte0 = 0;
    let byte1 = 0;
    for (let c = 0; c < 8; c++) {
      if (getPixel(screenData, x + c, y + r)) {
        byte0 |= (0x80 >> c);
      }
    }
    for (let c = 0; c < 8; c++) {
      if (getPixel(screenData, x + 8 + c, y + r)) {
        byte1 |= (0x80 >> c);
      }
    }
    data[r * 2] = byte0;
    data[r * 2 + 1] = byte1;
  }

  customBrushes[captureSlot] = data;
  capturingBrush = false;
  selectCustomBrush(captureSlot);
  renderCustomBrushPreview(captureSlot);
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
 * @param {number} slot - Slot index (0-3)
 */
function renderCustomBrushPreview(slot) {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('customBrush' + slot));
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, 32, 32);

  if (!customBrushes[slot]) {
    // Draw "+" crosshair for empty slot
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 32, 32);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 8);
    ctx.lineTo(16, 24);
    ctx.moveTo(8, 16);
    ctx.lineTo(24, 16);
    ctx.stroke();
  } else {
    const data = customBrushes[slot];
    for (let r = 0; r < 16; r++) {
      const byte0 = data[r * 2];
      const byte1 = data[r * 2 + 1];
      for (let c = 0; c < 8; c++) {
        const isSet = (byte0 & (0x80 >> c)) !== 0;
        ctx.fillStyle = isSet ? '#e0e0e0' : '#1a1a1a';
        ctx.fillRect(c * 2, r * 2, 2, 2);
      }
      for (let c = 0; c < 8; c++) {
        const isSet = (byte1 & (0x80 >> c)) !== 0;
        ctx.fillStyle = isSet ? '#e0e0e0' : '#1a1a1a';
        ctx.fillRect((8 + c) * 2, r * 2, 2, 2);
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
    return btoa(String.fromCharCode(...b));
  });
  localStorage.setItem('spectraLabCustomBrushes', JSON.stringify(arr));
}

/**
 * Loads custom brushes from localStorage
 */
function loadCustomBrushes() {
  const raw = localStorage.getItem('spectraLabCustomBrushes');
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    for (let i = 0; i < 5; i++) {
      if (arr[i]) {
        customBrushes[i] = new Uint8Array([...atob(arr[i])].map(c => c.charCodeAt(0)));
      } else {
        customBrushes[i] = null;
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

    if (!e.ctrlKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'p': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_PIXEL); break;
        case 'l': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_LINE); break;
        case 'r': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_RECT); break;
        case 'c': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_FILL_CELL); break;
        case 'a': if (!isAttrEditor()) setEditorTool(EDITOR.TOOL_RECOLOR); break;
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
