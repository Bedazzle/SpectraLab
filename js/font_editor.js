// Font Editor v1.0.0 - SpectraLab font editor application
// @ts-check
"use strict";

// ============================================================================
// Constants
// ============================================================================

const FONT_CONST = {
  SIZE_96_GLYPHS: 96,
  SIZE_256_GLYPHS: 256,
  SIZE_96_BYTES: 768,
  SIZE_256_BYTES: 2048,
  BYTES_PER_GLYPH: 8,
  GLYPH_HEIGHT: 8,
  EXPLODED_ROW_LENGTH: 256
};

const PREVIEW = {
  SCALE: 50,
  SIZE: 400
};

const GRID_DISPLAY = {
  CANVAS_SIZE: 32,
  SCALE: 4
};

const WIDTH_MODES = {
  FULL: '8',
  SIX_HIGH: '6-high',
  SIX_LOW: '6-low',
  FOUR_HIGH: '4-high',
  FOUR_LOW: '4-low',
  VARIABLE: 'variable'
};

const FONT_TOOL = { PIXEL: 'pixel', LINE: 'line', RECT: 'rect', CIRCLE: 'circle', ERASER: 'eraser' };

/**
 * Download binary data as a file.
 * @param {Uint8Array|ArrayBuffer|string} data
 * @param {string} name
 * @param {string} [mimeType='application/octet-stream']
 */
function downloadBinary(data, name, mimeType = 'application/octet-stream') {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Theme-aware colors
// ============================================================================

function getThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const get = (v) => style.getPropertyValue(v).trim();
  return {
    background: get('--bg-primary') || '#1a1a1a',
    backgroundInactive: get('--bg-tertiary') || '#2a2a2a',
    foreground: get('--text-primary') || '#e0e0e0',
    foregroundInactive: get('--text-tertiary') || '#707070',
    grid: get('--border-secondary') || '#333',
    overlayHigh: 'rgba(0, 100, 255, 0.3)',
    overlayLow: 'rgba(255, 100, 0, 0.3)'
  };
}

// ============================================================================
// State
// ============================================================================

/** @type {Uint8Array|null} */
let glyphData = null;
/** @type {number} */
let numGlyphs = 256;
/** @type {Array<Array<{char: string, width: string}>>} */
let glyphMapping = [];
/** @type {Object<string, {glyph: number, width: string}>} */
let charToGlyphIndex = {};
/** @type {Object<string, string>} */
let charRemap = {};
/** @type {string} */
let currentFontFileName = '';
/** @type {number|null} */
let currentGlyphIndex = null;

// Drawing state
let isDrawing = false;
let toggledPixels = new Set();
let currentFontTool = FONT_TOOL.PIXEL;
let toolStartCol = -1, toolStartRow = -1;
let lastEraserCol = -1, lastEraserRow = -1;
let isRightButton = false;

// Exploded (interlaced) font format flag
let isExploded = false;

// FZX mode state
let isFzxMode = false;
/** @type {{height: number, tracking: number, lastchar: number, glyphs: Array<{width: number, shift: number, kern: number, bitmap: Uint8Array}>}|null} */
let fzxFont = null;

// Undo/redo
/** @type {Array<Object>} */
const undoStack = [];
/** @type {Array<Object>} */
const redoStack = [];
const MAX_UNDO = 50;

// Glyph clipboard
/** @type {{type: 'fixed', bytes: Uint8Array}|{type: 'fzx', width: number, shift: number, kern: number, bitmap: Uint8Array}|null} */
let glyphClipboard = null;

// ============================================================================
// Undo / Redo
// ============================================================================

/** Deep-copy the current font state into a snapshot object. */
function snapshotState() {
  if (isFzxMode && fzxFont) {
    return {
      type: 'fzx',
      fzxFont: {
        height: fzxFont.height,
        tracking: fzxFont.tracking,
        lastchar: fzxFont.lastchar,
        glyphs: fzxFont.glyphs.map(g => ({
          width: g.width,
          shift: g.shift,
          kern: g.kern,
          bitmap: g.bitmap.slice()
        }))
      }
    };
  }
  return {
    type: 'fixed',
    glyphData: glyphData ? glyphData.slice() : null,
    numGlyphs
  };
}

/** Restore a previously saved snapshot, switching mode if necessary. */
function restoreState(snapshot) {
  if (snapshot.type === 'fzx') {
    const s = snapshot.fzxFont;
    fzxFont = {
      height: s.height,
      tracking: s.tracking,
      lastchar: s.lastchar,
      glyphs: s.glyphs.map(g => ({
        width: g.width,
        shift: g.shift,
        kern: g.kern,
        bitmap: g.bitmap.slice()
      }))
    };
    glyphData = null;
    if (!isFzxMode) enterFzxMode();
    // Update FZX controls
    dom.fzxHeight.value = String(fzxFont.height);
    dom.fzxTracking.value = String(fzxFont.tracking);
    dom.glyphCountInput.value = String(fzxFont.glyphs.length);
    if (currentGlyphIndex !== null && currentGlyphIndex >= fzxFont.glyphs.length) {
      resetGlyphSelection();
    }
    renderFzxGrid();
    if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
  } else {
    glyphData = snapshot.glyphData ? snapshot.glyphData.slice() : null;
    numGlyphs = snapshot.numGlyphs;
    if (isFzxMode) exitFzxMode();

    updateFileDisplay();
    if (currentGlyphIndex !== null && currentGlyphIndex >= numGlyphs) {
      resetGlyphSelection();
    }
    renderFontGrid();
    if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  }
}

/** Save current state to the undo stack. Call BEFORE each modification. */
function pushUndo() {
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

/** Undo the last modification (Ctrl+Z). */
function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(snapshotState());
  restoreState(undoStack.pop());
}

/** Redo a previously undone modification (Ctrl+Y / Ctrl+Shift+Z). */
function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(snapshotState());
  restoreState(redoStack.pop());
}

/** Clear both undo and redo stacks (e.g. after loading a new file). */
function clearUndoHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
}

// ============================================================================
// DOM refs
// ============================================================================

const dom = {
  grid: document.getElementById('grid'),
  previewCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('previewCanvas')),
  previewColumn: document.getElementById('previewColumn'),
  glyphInfo: document.getElementById('glyphInfo'),
  fontFile: /** @type {HTMLInputElement} */ (document.getElementById('fontFile')),
  loadFontBtn: document.getElementById('loadFontBtn'),
  saveFontBtn: document.getElementById('saveFontBtn'),
  fileDisplay: document.getElementById('fileDisplay'),
  fontWidthSelect: /** @type {HTMLSelectElement} */ (document.getElementById('fontWidth')),
  glyphWidthInput: /** @type {HTMLInputElement} */ (document.getElementById('glyphWidthInput')),
  charInput: /** @type {HTMLInputElement} */ (document.getElementById('charInput')),
  mapCharBtn: document.getElementById('mapCharBtn'),
  clearMapBtn: document.getElementById('clearMapBtn'),
  remapFromInput: /** @type {HTMLInputElement} */ (document.getElementById('remapFrom')),
  remapToInput: /** @type {HTMLInputElement} */ (document.getElementById('remapTo')),
  shiftUpBtn: document.getElementById('shiftUpBtn'),
  shiftDownBtn: document.getElementById('shiftDownBtn'),
  shiftLeftBtn: document.getElementById('shiftLeftBtn'),
  shiftRightBtn: document.getElementById('shiftRightBtn'),
  invertGlyphBtn: document.getElementById('invertGlyphBtn'),
  clearGlyphBtn: document.getElementById('clearGlyphBtn'),
  wholeFontCheckbox: /** @type {HTMLInputElement} */ (document.getElementById('wholeFontCheckbox')),
  showGridCheckbox: /** @type {HTMLInputElement} */ (document.getElementById('showGridCheckbox')),
  showLabelsCheckbox: /** @type {HTMLInputElement} */ (document.getElementById('showLabelsCheckbox')),
  transformSelect: /** @type {HTMLSelectElement} */ (document.getElementById('transformSelect')),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  helpBtn: document.getElementById('helpBtn'),
  saveMappingBtn: document.getElementById('saveMappingBtn'),
  loadMappingBtn: document.getElementById('loadMappingBtn'),
  loadMappingFile: /** @type {HTMLInputElement} */ (document.getElementById('loadMappingFile')),
  // FZX
  fzxSection: document.getElementById('fzxSection'),
  fzxGlyphSection: document.getElementById('fzxGlyphSection'),
  fzxHeight: /** @type {HTMLInputElement} */ (document.getElementById('fzxHeight')),
  fzxTracking: /** @type {HTMLInputElement} */ (document.getElementById('fzxTracking')),
  fzxGlyphWidth: /** @type {HTMLInputElement} */ (document.getElementById('fzxGlyphWidth')),
  fzxGlyphShift: /** @type {HTMLInputElement} */ (document.getElementById('fzxGlyphShift')),
  fzxGlyphKern: /** @type {HTMLInputElement} */ (document.getElementById('fzxGlyphKern')),
  newFzxBtn: document.getElementById('newFzxBtn'),
  newBtn: document.getElementById('newBtn'),
  newType: /** @type {HTMLSelectElement} */ (document.getElementById('newType')),
  headerFileName: document.getElementById('headerFileName'),
  textSampleCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('textSampleCanvas')),
  textSampleZoom: /** @type {HTMLSelectElement} */ (document.getElementById('textSampleZoom')),
  textSampleGrid: /** @type {HTMLInputElement} */ (document.getElementById('textSampleGrid')),
  textSampleUppercase: /** @type {HTMLInputElement} */ (document.getElementById('textSampleUppercase')),
  textSampleTimex: /** @type {HTMLInputElement} */ (document.getElementById('textSampleTimex')),
  // Glyph count controls
  hideWidthByte: /** @type {HTMLInputElement} */ (document.getElementById('hideWidthByte')),
  hideWidthByteLabel: document.getElementById('hideWidthByteLabel'),
  glyphCountSection: document.getElementById('glyphCountSection'),
  glyphCountInput: /** @type {HTMLInputElement} */ (document.getElementById('glyphCountInput')),
  convertFontBtn: document.getElementById('convertFontBtn'),
  fontToolBar: document.getElementById('fontToolBar'),
  appendFontBtn: document.getElementById('appendFontBtn'),
  appendFontFile: /** @type {HTMLInputElement} */ (document.getElementById('appendFontFile'))
};


// ============================================================================
// Grid renderer
// ============================================================================

function renderFontGrid() {
  dom.grid.innerHTML = '';
  if (!glyphData) return;

  const colors = getThemeColors();
  const showGrid = dom.showGridCheckbox.checked;
  const pixelSize = showGrid ? GRID_DISPLAY.SCALE - 1 : GRID_DISPLAY.SCALE;
  const hideW = dom.fontWidthSelect.value === 'variable' && dom.hideWidthByte.checked;
  const showLabels = dom.showLabelsCheckbox.checked;

  for (let glyph = 0; glyph < numGlyphs; glyph++) {
    const offset = glyph * FONT_CONST.BYTES_PER_GLYPH;

    const glyphContainer = document.createElement('div');
    glyphContainer.className = 'glyph';
    if (showLabels) glyphContainer.classList.add('with-label');
    if (glyph === currentGlyphIndex) glyphContainer.classList.add('selected');
    glyphContainer.dataset.glyphIndex = String(glyph);

    // Tooltip: index, char, hex code
    const mappings = glyphMapping[glyph];
    const ch = (mappings && mappings.length > 0) ? mappings[0].char : (glyph >= 32 && glyph < 127 ? String.fromCharCode(glyph) : '');
    const hex = '0x' + glyph.toString(16).toUpperCase().padStart(2, '0');
    glyphContainer.title = ch ? `#${glyph} (${hex}) "${ch}"` : `#${glyph} (${hex})`;

    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = GRID_DISPLAY.CANVAS_SIZE;
    glyphCanvas.height = GRID_DISPLAY.CANVAS_SIZE;
    const ctx = glyphCanvas.getContext('2d');

    const startRow = hideW ? 1 : 0;
    for (let row = startRow; row < FONT_CONST.GLYPH_HEIGHT; row++) {
      const byte = glyphData[offset + row];
      for (let col = 0; col < FONT_CONST.GLYPH_HEIGHT; col++) {
        if ((byte >> (7 - col)) & 1) {
          ctx.fillStyle = colors.foreground;
          ctx.fillRect(col * GRID_DISPLAY.SCALE, row * GRID_DISPLAY.SCALE, pixelSize, pixelSize);
        }
      }
    }

    // Dim inactive columns for non-8 width modes
    const wm = dom.fontWidthSelect.value;
    if (wm !== '8') {
      const s = GRID_DISPLAY.SCALE;
      const sz = GRID_DISPLAY.CANVAS_SIZE;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      if (wm === '4-high') {
        ctx.fillRect(4 * s, 0, 4 * s, sz);
      } else if (wm === '4-low') {
        ctx.fillRect(0, 0, 4 * s, sz);
      } else if (wm === '6-high') {
        ctx.fillRect(6 * s, 0, 2 * s, sz);
      } else if (wm === '6-low') {
        ctx.fillRect(0, 0, 2 * s, sz);
      }
    }

    glyphContainer.appendChild(glyphCanvas);
    if (showLabels) {
      const label = document.createElement('div');
      label.className = 'glyph-label';
      label.textContent = ch || '';
      glyphContainer.appendChild(label);
    }
    glyphContainer.addEventListener('click', handleGlyphClick);
    dom.grid.appendChild(glyphContainer);
  }

  renderTextSample();
}

// ============================================================================
// Preview / pixel editor
// ============================================================================

/**
 * Returns the set of active (editable) column indices for a glyph,
 * based on the current width mode and per-glyph variable width.
 * @param {number} glyphIndex
 * @returns {number[]}
 */
function getActiveColumns(glyphIndex) {
  const wm = dom.fontWidthSelect.value;
  if (wm === '6-high') return [0,1,2,3,4,5];
  if (wm === '6-low')  return [2,3,4,5,6,7];
  if (wm === '4-high') return [0,1,2,3];
  if (wm === '4-low')  return [4,5,6,7];
  if (wm === 'variable') {
    if (glyphData) {
      const width = Math.min(glyphData[glyphIndex * FONT_CONST.BYTES_PER_GLYPH], 8);
      const cols = [];
      for (let i = 0; i < width; i++) cols.push(8 - width + i);
      return cols;
    }
  }
  return [0,1,2,3,4,5,6,7];
}

/**
 * Set a fixed width on the preview column so controls don't shift
 * when the preview canvas resizes for different glyph widths.
 */
function updatePreviewColumnWidth() {
  if (isFzxMode && fzxFont) {
    // Worst-case FZX canvas width: max glyph width (16) at computed scale, with max margins
    const maxGW = 16;
    const scaleX = Math.floor(400 / maxGW);
    const scaleY = Math.floor(400 / fzxFont.height);
    const scale = Math.max(4, Math.min(scaleX, scaleY, 32));
    // Use max margins (shift > 0 → marginLeft=40, marginRight=44)
    const maxCanvasW = 40 + maxGW * scale + 44;
    dom.previewColumn.style.width = maxCanvasW + 'px';
  } else {
    dom.previewColumn.style.width = PREVIEW.SIZE + 'px';
  }
}

function updatePreview(glyphIndex) {
  if (glyphIndex === null) return;
  if (!glyphData) return;
  const glyphOff = glyphIndex * FONT_CONST.BYTES_PER_GLYPH;

  const ctx = dom.previewCanvas.getContext('2d');
  if (!ctx) return;

  const colors = getThemeColors();
  const wm = dom.fontWidthSelect.value;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, PREVIEW.SIZE, PREVIEW.SIZE);

  const activeColumns = getActiveColumns(glyphIndex);
  const isVariable = wm === 'variable';
  const hideW = isVariable && dom.hideWidthByte.checked;

  // Draw inactive column/row background
  const scale = PREVIEW.SCALE;
  for (let col = 0; col < 8; col++) {
    if (!activeColumns.includes(col)) {
      ctx.fillStyle = colors.backgroundInactive;
      ctx.fillRect(col * scale, 0, scale, PREVIEW.SIZE);
    }
  }
  // In variable mode, row 0 is the width byte — dim it (unless fully hidden)
  if (isVariable && !hideW) {
    ctx.fillStyle = colors.backgroundInactive;
    ctx.fillRect(0, 0, PREVIEW.SIZE, scale);
  }

  // Draw glyph pixels
  for (let row = 0; row < 8; row++) {
    if (hideW && row === 0) continue;
    const byte = glyphData[glyphOff + row];
    const rowActive = !(isVariable && row === 0);
    for (let col = 0; col < 8; col++) {
      if ((byte >> (7 - col)) & 1) {
        ctx.fillStyle = (activeColumns.includes(col) && rowActive) ? colors.foreground : colors.foregroundInactive;
        ctx.fillRect(col * scale, row * scale, scale, scale);
      }
    }
  }

  // Draw grid
  if (dom.showGridCheckbox.checked) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * scale, 0);
      ctx.lineTo(i * scale, PREVIEW.SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * scale);
      ctx.lineTo(PREVIEW.SIZE, i * scale);
      ctx.stroke();
    }
  }

  // Update info
  const mappings = glyphMapping[glyphIndex];
  let info = `Glyph ${glyphIndex}`;
  if (mappings && mappings.length > 0) {
    info += ': ' + mappings.map(m => `"${m.char}" (${m.width})`).join(', ');
  } else {
    info += ': unmapped';
  }
  dom.glyphInfo.textContent = info;

  // Update char input
  const existingMapping = mappings ? mappings.find(m => m.width === wm) : null;
  if (existingMapping) {
    let chars = existingMapping.char;
    for (let i = glyphIndex + 1; i < numGlyphs; i++) {
      const nm = glyphMapping[i];
      const next = nm ? nm.find(m => m.width === wm && m.char.charCodeAt(0) === chars.charCodeAt(chars.length - 1) + 1) : null;
      if (next) chars += next.char; else break;
    }
    dom.charInput.value = chars;
  } else {
    dom.charInput.value = '';
  }

  // Update width input
  if (wm === 'variable') {
    dom.glyphWidthInput.disabled = false;
    dom.glyphWidthInput.value = String(glyphData[glyphOff]);
  } else {
    dom.glyphWidthInput.disabled = true;
    dom.glyphWidthInput.value = wm === '8' ? '8' : (wm.startsWith('6') ? '6' : '4');
  }
}

// ============================================================================
// Font format choice modal
// ============================================================================

/**
 * Render a sample of font glyphs onto a canvas.
 * Shows printable ASCII chars 32-95 (glyphs 32-95), 2 rows of 32 chars.
 * @param {HTMLCanvasElement} canvas
 * @param {Uint8Array} fontBytes - linear 8-bytes-per-glyph data
 */
function renderFontSample(canvas, fontBytes) {
  const scale = 2;
  const cols = 16;
  const rows = 4;
  const startGlyph = 32;
  canvas.width = cols * 8 * scale;
  canvas.height = rows * 8 * scale;
  const ctx = canvas.getContext('2d');
  const colors = getThemeColors();
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.foreground;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = startGlyph + r * cols + c;
      if (gi >= fontBytes.length / FONT_CONST.BYTES_PER_GLYPH) continue;
      const off = gi * FONT_CONST.BYTES_PER_GLYPH;
      const dx = c * 8 * scale;
      const dy = r * 8 * scale;
      for (let row = 0; row < 8; row++) {
        const byte = fontBytes[off + row];
        for (let bit = 0; bit < 8; bit++) {
          if ((byte >> (7 - bit)) & 1) {
            ctx.fillRect(dx + bit * scale, dy + row * scale, scale, scale);
          }
        }
      }
    }
  }
}

/**
 * Show a modal letting the user choose between normal and interlaced font.
 * @param {Uint8Array} buffer - raw file bytes (2048)
 * @returns {Promise<boolean>} resolves to true if interlaced chosen
 */
function showFormatChoiceModal(buffer) {
  const normalData = buffer.slice();
  const interlacedData = convertExplodedFont(buffer, 256);

  const normalCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('previewNormal'));
  const interlacedCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('previewInterlaced'));
  renderFontSample(normalCanvas, normalData);
  renderFontSample(interlacedCanvas, interlacedData);

  const overlay = document.getElementById('formatModal');
  overlay.classList.add('active');

  return new Promise((resolve) => {
    function choose(value) {
      overlay.classList.remove('active');
      document.getElementById('choiceNormal').removeEventListener('click', onNormal);
      document.getElementById('choiceInterlaced').removeEventListener('click', onInterlaced);
      resolve(value);
    }
    function onNormal() { choose(false); }
    function onInterlaced() { choose(true); }
    document.getElementById('choiceNormal').addEventListener('click', onNormal);
    document.getElementById('choiceInterlaced').addEventListener('click', onInterlaced);
  });
}

// ============================================================================
// Save modal helpers
// ============================================================================

/**
 * Show a generic modal dialog for save options. Returns a Promise that
 * resolves to a value chosen by the user, or null if cancelled.
 * @param {string} title
 * @param {function(HTMLElement, function(*)): void} populate - receives content div and resolve fn
 * @returns {Promise<*>}
 */
function showSaveModal(title, populate) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('saveModal');
    const titleEl = document.getElementById('saveModalTitle');
    const content = document.getElementById('saveModalContent');
    titleEl.textContent = title;
    content.innerHTML = '';

    let resolved = false;
    function done(value) {
      if (resolved) return;
      resolved = true;
      overlay.classList.remove('active');
      overlay.removeEventListener('click', onOverlayClick);
      resolve(value);
    }
    function onOverlayClick(e) {
      if (e.target === overlay) done(null);
    }

    populate(content, done);
    overlay.addEventListener('click', onOverlayClick);
    overlay.classList.add('active');
  });
}

/**
 * 256-glyph save dialog: Normal or Interlaced.
 * Pre-selects Interlaced if the font is currently exploded.
 * @returns {Promise<'normal'|'interlaced'|null>}
 */
function showSave256Dialog() {
  return showSaveModal('Save 256-glyph font', (content, done) => {
    const div = document.createElement('div');
    div.className = 'save-modal-btns';

    const btnNormal = document.createElement('button');
    btnNormal.textContent = 'Normal (.ch8)';
    if (!isExploded) btnNormal.className = 'primary';
    btnNormal.addEventListener('click', () => done('normal'));

    const btnInterlaced = document.createElement('button');
    btnInterlaced.textContent = 'Interlaced (.ch8)';
    if (isExploded) btnInterlaced.className = 'primary';
    btnInterlaced.addEventListener('click', () => done('interlaced'));

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => done(null));

    div.appendChild(btnNormal);
    div.appendChild(btnInterlaced);
    div.appendChild(btnCancel);
    content.appendChild(div);
  });
}

/**
 * 117-glyph (96 font + 21 UDG) save dialog.
 * @returns {Promise<'single'|'font-udg'|'udg-font'|null>}
 */
function showSave117Dialog() {
  return showSaveModal('Save 117-glyph font (96 + 21 UDG)', (content, done) => {
    const div = document.createElement('div');
    div.className = 'save-modal-btns';

    const btn1 = document.createElement('button');
    btn1.textContent = 'Single file \u2014 117 glyphs (.bin)';
    btn1.className = 'primary';
    btn1.addEventListener('click', () => done('single'));

    const btn2 = document.createElement('button');
    btn2.textContent = 'Font + UDG \u2014 768 + 168 bytes (.bin)';
    btn2.addEventListener('click', () => done('font-udg'));

    const btn3 = document.createElement('button');
    btn3.textContent = 'UDG + Font \u2014 168 + 768 bytes (.bin)';
    btn3.addEventListener('click', () => done('udg-font'));

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => done(null));

    div.appendChild(btn1);
    div.appendChild(btn2);
    div.appendChild(btn3);
    div.appendChild(btnCancel);
    content.appendChild(div);
  });
}

/**
 * Range export dialog for fonts with >256 glyphs.
 * @returns {Promise<{start: number, count: number}|null>}
 */
function showSaveRangeDialog() {
  return showSaveModal('Export glyph range (' + numGlyphs + ' glyphs total)', (content, done) => {
    const div = document.createElement('div');
    div.className = 'save-modal-btns';

    const row1 = document.createElement('div');
    row1.className = 'save-range-row';
    const labelStart = document.createElement('label');
    labelStart.textContent = 'First glyph: ';
    const inputStart = document.createElement('input');
    inputStart.type = 'number';
    inputStart.min = '0';
    inputStart.max = String(numGlyphs - 1);
    inputStart.value = '0';
    labelStart.appendChild(inputStart);
    row1.appendChild(labelStart);

    const row2 = document.createElement('div');
    row2.className = 'save-range-row';
    const labelCount = document.createElement('label');
    labelCount.textContent = 'Count: ';
    const inputCount = document.createElement('input');
    inputCount.type = 'number';
    inputCount.min = '1';
    inputCount.max = String(numGlyphs);
    inputCount.value = String(numGlyphs);
    labelCount.appendChild(inputCount);
    row2.appendChild(labelCount);

    const btnExport = document.createElement('button');
    btnExport.textContent = 'Export';
    btnExport.className = 'primary';
    btnExport.addEventListener('click', () => {
      const start = parseInt(inputStart.value) || 0;
      let count = parseInt(inputCount.value) || numGlyphs;
      if (start < 0 || start >= numGlyphs) { alert('Invalid start index'); return; }
      if (count < 1 || start + count > numGlyphs) count = numGlyphs - start;
      done({ start, count });
    });

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => done(null));

    div.appendChild(row1);
    div.appendChild(row2);
    div.appendChild(btnExport);
    div.appendChild(btnCancel);
    content.appendChild(div);
  });
}

// ============================================================================
// Font data utilities
// ============================================================================

function convertExplodedFont(buffer, nGlyphs) {
  const converted = new Uint8Array(nGlyphs * FONT_CONST.BYTES_PER_GLYPH);
  for (let glyph = 0; glyph < nGlyphs; glyph++) {
    for (let row = 0; row < FONT_CONST.GLYPH_HEIGHT; row++) {
      converted[glyph * FONT_CONST.BYTES_PER_GLYPH + row] = buffer[glyph + row * FONT_CONST.EXPLODED_ROW_LENGTH];
    }
  }
  return converted;
}

function convertToExplodedFont(buffer, nGlyphs) {
  const exploded = new Uint8Array(FONT_CONST.SIZE_256_BYTES);
  for (let glyph = 0; glyph < nGlyphs; glyph++) {
    for (let row = 0; row < FONT_CONST.GLYPH_HEIGHT; row++) {
      exploded[glyph + row * FONT_CONST.EXPLODED_ROW_LENGTH] = buffer[glyph * FONT_CONST.BYTES_PER_GLYPH + row];
    }
  }
  return exploded;
}

function validateFontFileSize(size, name) {
  if (size === 0 || size % FONT_CONST.BYTES_PER_GLYPH !== 0) {
    throw new Error(`Invalid font file size: ${size} bytes (must be a multiple of ${FONT_CONST.BYTES_PER_GLYPH}). File: ${name}`);
  }
}

// ============================================================================
// Mapping system
// ============================================================================

function createDefaultMapping(nGlyphs) {
  const ranges = [];
  if (nGlyphs === 96) {
    // Map ASCII 32-127 to glyphs 0-95
    let chars = '';
    for (let i = 32; i < 128; i++) chars += String.fromCharCode(i);
    ranges.push({ start: 0, chars, width: '8' });
  } else {
    const count = Math.min(nGlyphs, 256);
    let chars = '';
    for (let i = 0; i < count; i++) chars += String.fromCharCode(i);
    ranges.push({ start: 0, chars, width: '8' });
  }
  return ranges;
}

function applyMapping(ranges, widthMode) {
  // Reset
  glyphMapping = [];
  for (let i = 0; i < numGlyphs; i++) glyphMapping.push([]);
  charToGlyphIndex = {};

  if (!ranges || !Array.isArray(ranges)) return;

  for (const range of ranges) {
    const width = widthMode || range.width || '8';
    for (let i = 0; i < range.chars.length; i++) {
      const glyph = range.start + i;
      if (glyph < numGlyphs) {
        const char = range.chars[i];
        glyphMapping[glyph].push({ char, width });
        charToGlyphIndex[char] = { glyph, width };
      }
    }
  }
}

function updateGlyphDisplay() {
  // Re-select currently selected glyph visual in grid
  document.querySelectorAll('.glyph').forEach(el => {
    el.classList.toggle('selected', parseInt(/** @type {HTMLElement} */(el).dataset.glyphIndex) === currentGlyphIndex);
  });
}

function buildCharRemap() {
  charRemap = {};
  const from = dom.remapFromInput.value;
  const to = dom.remapToInput.value;
  const len = Math.min(from.length, to.length);
  for (let i = 0; i < len; i++) {
    charRemap[from[i]] = to[i];
  }
}

// ============================================================================
// Transform dispatch
// ============================================================================

function applyGlyphTransform(transformFn, glyphIndex) {
  if (!glyphData) return;
  pushUndo();

  if (glyphIndex !== null) {
    transformFn(glyphData, glyphIndex * FONT_CONST.BYTES_PER_GLYPH);
  } else {
    for (let g = 0; g < numGlyphs; g++) {
      transformFn(glyphData, g * FONT_CONST.BYTES_PER_GLYPH);
    }
  }

  renderFontGrid();
  if (currentGlyphIndex !== null) {
    updatePreview(currentGlyphIndex);
  }
}

/** @type {Object<string, function(Uint8Array, number): void>} */
const TRANSFORM_MAP = {
  'bold-right': glyphBoldRight,
  'bold-left': glyphBoldLeft,
  'bold-down': glyphBoldDown,
  'italic1-right': glyphItalic1Right,
  'italic1-left': glyphItalic1Left,
  'italic2-right': glyphItalic2Right,
  'italic2-left': glyphItalic2Left,
  'italic3-right': glyphItalic3Right,
  'italic3-left': glyphItalic3Left,
  'shift-right-fill0': glyphShiftRight,
  'shift-left-fill0': glyphShiftLeft,
  'shift-up-fill0': glyphShiftUp,
  'shift-down-fill0': glyphShiftDown,
  'align-left': glyphAlignLeft,
  'align-right': glyphAlignRight,
  'align-top': glyphAlignTop,
  'align-bottom': glyphAlignBottom,
  'flip-horizontal': glyphMirrorHorizontal,
  'flip-vertical': glyphMirrorVertical,
  'rotate-90-cw': glyphRotate90CW,
  'rotate-90-ccw': glyphRotate90CCW,
  'rotate-180': glyphRotate180
};

// ============================================================================
// FZX format support
// ============================================================================

/**
 * Parse an FZX font file.
 * @param {Uint8Array} buffer - Raw file bytes
 * @returns {{height: number, tracking: number, lastchar: number, glyphs: Array<{width: number, shift: number, kern: number, bitmap: Uint8Array}>}}
 */
function parseFzxFile(buffer) {
  if (buffer.length < 3) throw new Error('FZX file too small');

  const height = buffer[0];
  const tracking = buffer[1] > 127 ? buffer[1] - 256 : buffer[1]; // signed byte
  const lastchar = buffer[2];

  if (height < 1) throw new Error(`Invalid FZX height: ${height}`);
  if (lastchar < 32) throw new Error(`Invalid FZX lastchar: ${lastchar}`);

  const numChars = lastchar - 32 + 1;
  const tableStart = 3;
  const tableSize = numChars * 3; // 3 bytes per char entry
  const sentinelOff = tableStart + tableSize; // 2-byte sentinel word after table

  if (buffer.length < sentinelOff + 2) {
    throw new Error('FZX file too small for character table');
  }

  // Parse character table entries — offset is relative to entry's own position
  const entries = [];
  for (let i = 0; i < numChars; i++) {
    const entryOff = tableStart + i * 3;
    const word = buffer[entryOff] | (buffer[entryOff + 1] << 8);
    const kern = (word >> 14) & 3;
    const offset = entryOff + (word & 0x3FFF); // absolute = entryPos + relOffset
    const infoByte = buffer[entryOff + 2];
    const shift = (infoByte >> 4) & 0xF;
    const width = (infoByte & 0xF) + 1;
    entries.push({ kern, offset, shift, width });
  }

  // Sentinel: 2-byte word giving end-of-data offset (relative to its own position)
  const sentinelWord = buffer[sentinelOff] | (buffer[sentinelOff + 1] << 8);
  const sentinelOffset = sentinelOff + (sentinelWord & 0x3FFF);
  entries.push({ offset: sentinelOffset });

  // Read bitmap data using offset differences
  const glyphs = [];
  for (let i = 0; i < numChars; i++) {
    const { kern, offset, shift, width } = entries[i];
    const nextOffset = entries[i + 1].offset;
    const bytesPerRow = width > 8 ? 2 : 1;
    const maxBitmapSize = Math.max(0, height - shift) * bytesPerRow;

    // Internal bitmap is always height rows (shift empty rows prepended)
    const fullBitmapSize = height * bytesPerRow;
    const bitmap = new Uint8Array(fullBitmapSize);

    // Actual data from offset difference (may be less than max if trailing zeros omitted)
    const offsetDiff = nextOffset - offset;
    const fileBitmapSize = (offsetDiff >= 0 && offsetDiff <= maxBitmapSize)
      ? offsetDiff
      : maxBitmapSize;

    if (fileBitmapSize > 0 && offset < buffer.length) {
      const available = Math.min(fileBitmapSize, buffer.length - offset);
      const fileData = buffer.slice(offset, offset + available);
      bitmap.set(fileData, shift * bytesPerRow);
    }

    glyphs.push({ width, shift, kern, bitmap });
  }

  return { height, tracking, lastchar, glyphs };
}

/**
 * Build an FZX file from the current fzxFont state.
 * @returns {Uint8Array}
 */
function buildFzxFile() {
  if (!fzxFont) throw new Error('No FZX font data');

  const numChars = fzxFont.lastchar - 32 + 1;
  const headerSize = 3;
  const tableStart = headerSize;
  const tableSize = numChars * 3;       // 3 bytes per char entry
  const sentinelOff = tableStart + tableSize; // 2-byte sentinel word
  const dataStart = sentinelOff + 2;

  // Calculate effective data sizes per glyph (trimming trailing zero rows)
  const glyphDataSizes = [];
  for (let i = 0; i < numChars; i++) {
    const g = fzxFont.glyphs[i];
    const bytesPerRow = g.width > 8 ? 2 : 1;
    const bitmapRows = Math.max(0, fzxFont.height - g.shift);
    let effectiveRows = bitmapRows;
    for (let r = bitmapRows - 1; r >= 0; r--) {
      const rowOff = (g.shift + r) * bytesPerRow;
      let allZero = true;
      for (let b = 0; b < bytesPerRow; b++) {
        if (g.bitmap[rowOff + b] !== 0) { allZero = false; break; }
      }
      if (!allZero) break;
      effectiveRows = r;
    }
    glyphDataSizes.push(effectiveRows * bytesPerRow);
  }

  // Calculate absolute file offsets for bitmap data
  let totalBitmapSize = 0;
  const absOffsets = [];
  for (let i = 0; i < numChars; i++) {
    absOffsets.push(dataStart + totalBitmapSize);
    totalBitmapSize += glyphDataSizes[i];
  }
  absOffsets.push(dataStart + totalBitmapSize); // sentinel end-of-data

  const fileSize = dataStart + totalBitmapSize;
  const result = new Uint8Array(fileSize);

  // Header
  result[0] = fzxFont.height;
  result[1] = fzxFont.tracking < 0 ? fzxFont.tracking + 256 : fzxFont.tracking;
  result[2] = fzxFont.lastchar;

  // Character table — offset stored relative to entry's own position
  for (let i = 0; i < numChars; i++) {
    const entryOff = tableStart + i * 3;
    const relOffset = absOffsets[i] - entryOff;
    const g = fzxFont.glyphs[i];
    const word = (g.kern << 14) | (relOffset & 0x3FFF);
    result[entryOff] = word & 0xFF;
    result[entryOff + 1] = (word >> 8) & 0xFF;
    result[entryOff + 2] = (g.shift << 4) | (g.width - 1);
  }

  // Sentinel: 2-byte word, offset relative to its own position
  const sentinelRel = absOffsets[numChars] - sentinelOff;
  result[sentinelOff] = sentinelRel & 0xFF;
  result[sentinelOff + 1] = (sentinelRel >> 8) & 0xFF;

  // Bitmap data
  for (let i = 0; i < numChars; i++) {
    const dataSize = glyphDataSizes[i];
    if (dataSize > 0) {
      const g = fzxFont.glyphs[i];
      const bytesPerRow = g.width > 8 ? 2 : 1;
      const srcOffset = g.shift * bytesPerRow;
      result.set(g.bitmap.slice(srcOffset, srcOffset + dataSize), absOffsets[i]);
    }
  }

  return result;
}

/**
 * Render the FZX glyph grid with variable-width cells.
 */
function renderFzxGrid() {
  dom.grid.innerHTML = '';
  if (!fzxFont) return;

  const colors = getThemeColors();
  const showGrid = dom.showGridCheckbox.checked;
  const pixelSize = showGrid ? GRID_DISPLAY.SCALE - 1 : GRID_DISPLAY.SCALE;
  const showLabels = dom.showLabelsCheckbox.checked;

  for (let i = 0; i < fzxFont.glyphs.length; i++) {
    const g = fzxFont.glyphs[i];
    const charCode = 32 + i;

    const glyphContainer = document.createElement('div');
    glyphContainer.className = 'glyph';
    if (showLabels) glyphContainer.classList.add('with-label');
    if (i === currentGlyphIndex) glyphContainer.classList.add('selected');
    glyphContainer.dataset.glyphIndex = String(i);

    const ch = (charCode >= 32 && charCode < 127) ? String.fromCharCode(charCode) : '';
    const hex = '0x' + charCode.toString(16).toUpperCase().padStart(2, '0');
    glyphContainer.title = ch ? `#${charCode} (${hex}) "${ch}" w:${g.width} k:${g.kern} s:${g.shift}` : `#${charCode} (${hex}) w:${g.width}`;

    const canvasW = g.width * GRID_DISPLAY.SCALE;
    const canvasH = fzxFont.height * GRID_DISPLAY.SCALE;

    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = canvasW;
    glyphCanvas.height = canvasH;
    const ctx = glyphCanvas.getContext('2d');

    {
      const bytesPerRow = g.width > 8 ? 2 : 1;
      for (let row = 0; row < fzxFont.height; row++) {
        for (let col = 0; col < g.width; col++) {
          const byteIdx = row * bytesPerRow + Math.floor(col / 8);
          const bit = 7 - (col % 8);
          if (byteIdx < g.bitmap.length && (g.bitmap[byteIdx] >> bit) & 1) {
            ctx.fillStyle = colors.foreground;
            ctx.fillRect(col * GRID_DISPLAY.SCALE, row * GRID_DISPLAY.SCALE, pixelSize, pixelSize);
          }
        }
      }
    }

    glyphContainer.appendChild(glyphCanvas);
    if (showLabels) {
      const label = document.createElement('div');
      label.className = 'glyph-label';
      label.textContent = ch || '';
      glyphContainer.appendChild(label);
    }
    glyphContainer.addEventListener('click', handleGlyphClick);
    dom.grid.appendChild(glyphContainer);
  }
  renderTextSample();
}

/**
 * Update the preview canvas for an FZX glyph.
 * @param {number} glyphIndex - Index into fzxFont.glyphs array
 */
function updateFzxPreview(glyphIndex) {
  if (!fzxFont || glyphIndex === null || glyphIndex < 0 || glyphIndex >= fzxFont.glyphs.length) return;

  const g = fzxFont.glyphs[glyphIndex];
  const ctx = dom.previewCanvas.getContext('2d');
  if (!ctx) return;

  const colors = getThemeColors();

  // Calculate scale to fit glyph within ~400px, leaving room for annotations
  const scaleX = Math.floor(400 / g.width);
  const scaleY = Math.floor(400 / fzxFont.height);
  const scale = Math.max(4, Math.min(scaleX, scaleY, 32));

  const glyphW = g.width * scale;
  const glyphH = fzxFont.height * scale;

  // Margins for annotation labels and arrows
  const marginLeft = (g.shift > 0) ? 40 : 6;
  const marginTop = 16;
  const marginRight = 44;
  const marginBottom = (g.kern > 0 || fzxFont.tracking !== 0) ? 28 : 16;

  const canvasW = marginLeft + glyphW + marginRight;
  const canvasH = marginTop + glyphH + marginBottom;
  dom.previewCanvas.width = canvasW;
  dom.previewCanvas.height = canvasH;
  dom.previewCanvas.style.width = canvasW + 'px';
  dom.previewCanvas.style.height = canvasH + 'px';

  // Glyph origin
  const ox = marginLeft;
  const oy = marginTop;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw shift region (tinted area above glyph data)
  if (g.shift > 0) {
    ctx.fillStyle = (colors.foreground === '#e0e0e0') ? 'rgba(100,60,60,0.35)' : 'rgba(255,200,200,0.25)';
    ctx.fillRect(ox, oy, glyphW, g.shift * scale);
  }

  // Draw bitmap
  const bytesPerRow = g.width > 8 ? 2 : 1;
  for (let row = 0; row < fzxFont.height; row++) {
    for (let col = 0; col < g.width; col++) {
      const byteIdx = row * bytesPerRow + Math.floor(col / 8);
      const bit = 7 - (col % 8);
      if (byteIdx < g.bitmap.length && (g.bitmap[byteIdx] >> bit) & 1) {
        ctx.fillStyle = colors.foreground;
        ctx.fillRect(ox + col * scale, oy + row * scale, scale, scale);
      }
    }
  }

  // Draw grid
  if (dom.showGridCheckbox.checked) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let col = 0; col <= g.width; col++) {
      ctx.beginPath();
      ctx.moveTo(ox + col * scale, oy);
      ctx.lineTo(ox + col * scale, oy + glyphH);
      ctx.stroke();
    }
    for (let row = 0; row <= fzxFont.height; row++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + row * scale);
      ctx.lineTo(ox + glyphW, oy + row * scale);
      ctx.stroke();
    }
  }

  // --- Annotations ---
  const annotColor = (colors.foreground === '#e0e0e0') ? '#6ac' : '#2674a8';
  const dimColor = (colors.foreground === '#e0e0e0') ? '#777' : '#999';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';

  // Helper: draw arrow line with arrowheads
  function drawArrow(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 6) return;
    const ax = dx / len, ay = dy / len;
    const sz = 3;
    // Arrowhead at end
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ax * sz + ay * sz, y2 - ay * sz - ax * sz);
    ctx.lineTo(x2 - ax * sz - ay * sz, y2 - ay * sz + ax * sz);
    ctx.fill();
    // Arrowhead at start
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ax * sz + ay * sz, y1 + ay * sz - ax * sz);
    ctx.lineTo(x1 + ax * sz - ay * sz, y1 + ay * sz + ax * sz);
    ctx.fill();
  }

  // Width — horizontal bracket above the glyph
  {
    ctx.strokeStyle = annotColor;
    ctx.fillStyle = annotColor;
    ctx.lineWidth = 1;
    const y = oy - 4;
    drawArrow(ox, y, ox + glyphW, y);
    ctx.textAlign = 'center';
    ctx.fillText('width', ox + glyphW / 2, y - 6);
  }

  // Height — vertical bracket to the right
  {
    ctx.strokeStyle = annotColor;
    ctx.fillStyle = annotColor;
    ctx.lineWidth = 1;
    const x = ox + glyphW + 6;
    drawArrow(x, oy, x, oy + glyphH);
    ctx.save();
    ctx.translate(x + 10, oy + glyphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('height', 0, 0);
    ctx.restore();
  }

  // Shift — vertical bracket to the left (only if shift > 0)
  if (g.shift > 0) {
    ctx.strokeStyle = annotColor;
    ctx.fillStyle = annotColor;
    ctx.lineWidth = 1;
    const x = ox - 6;
    const shiftH = g.shift * scale;
    drawArrow(x, oy, x, oy + shiftH);
    ctx.save();
    ctx.translate(x - 8, oy + shiftH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('shift', 0, 0);
    ctx.restore();
  }

  // Kern — arrow pointing left below the glyph
  if (g.kern > 0) {
    ctx.strokeStyle = annotColor;
    ctx.fillStyle = annotColor;
    ctx.lineWidth = 1;
    const y = oy + glyphH + 8;
    const kernW = g.kern * scale;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox - kernW, y);
    ctx.stroke();
    // Arrowhead at left end
    ctx.beginPath();
    ctx.moveTo(ox - kernW, y);
    ctx.lineTo(ox - kernW + 4, y - 3);
    ctx.lineTo(ox - kernW + 4, y + 3);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillText('kern', ox - kernW, y + 10);
  }

  // Tracking — arrow pointing right below the glyph
  if (fzxFont.tracking !== 0) {
    ctx.strokeStyle = dimColor;
    ctx.fillStyle = dimColor;
    ctx.lineWidth = 1;
    const y = oy + glyphH + 8;
    const trackW = Math.abs(fzxFont.tracking) * scale;
    const dir = fzxFont.tracking > 0 ? 1 : -1;
    const startX = ox + glyphW;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + dir * trackW, y);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(startX + dir * trackW, y);
    ctx.lineTo(startX + dir * trackW - dir * 4, y - 3);
    ctx.lineTo(startX + dir * trackW - dir * 4, y + 3);
    ctx.fill();
    ctx.textAlign = dir > 0 ? 'left' : 'right';
    ctx.fillText('tracking', startX + dir * 2, y + 10);
  }

  // Update info
  const charCode = 32 + glyphIndex;
  const ch = (charCode >= 32 && charCode < 127) ? ` "${String.fromCharCode(charCode)}"` : '';
  dom.glyphInfo.textContent = `Char ${charCode}${ch} — w:${g.width} shift:${g.shift} kern:${g.kern}`;

  // Update FZX controls
  dom.fzxGlyphWidth.value = String(g.width);
  dom.fzxGlyphShift.value = String(g.shift);
  dom.fzxGlyphKern.value = String(g.kern);
}

/**
 * Get FZX preview scale factor for current glyph.
 * @returns {number}
 */
function getFzxPreviewScale() {
  if (!fzxFont || currentGlyphIndex === null) return 16;
  const g = fzxFont.glyphs[currentGlyphIndex];
  const scaleX = Math.floor(400 / g.width);
  const scaleY = Math.floor(400 / fzxFont.height);
  return Math.max(4, Math.min(scaleX, scaleY, 32));
}

/** Get the left/top margin of the glyph area within the FZX preview canvas. */
function getFzxPreviewMargins() {
  if (!fzxFont || currentGlyphIndex === null) return { left: 6, top: 16 };
  const g = fzxFont.glyphs[currentGlyphIndex];
  return { left: (g.shift > 0) ? 40 : 6, top: 16 };
}

/**
 * Toggle a pixel in the FZX preview canvas.
 * @param {number} x - Mouse X position
 * @param {number} y - Mouse Y position
 */
function toggleFzxPixel(x, y) {
  if (currentGlyphIndex === null || !fzxFont) return;
  const g = fzxFont.glyphs[currentGlyphIndex];
  const scale = getFzxPreviewScale();
  const margins = getFzxPreviewMargins();

  const col = Math.floor((x - margins.left) / scale);
  const row = Math.floor((y - margins.top) / scale);
  if (col < 0 || col >= g.width || row < 0 || row >= fzxFont.height) return;

  const key = `${row},${col}`;
  if (toggledPixels.has(key)) return;
  toggledPixels.add(key);

  if (dom.wholeFontCheckbox.checked) {
    for (let i = 0; i < fzxFont.glyphs.length; i++) {
      const gi = fzxFont.glyphs[i];
      if (col >= gi.width || row >= fzxFont.height) continue;
      const bpr = gi.width > 8 ? 2 : 1;
      const byteIdx = row * bpr + Math.floor(col / 8);
      const bit = 7 - (col % 8);
      gi.bitmap[byteIdx] ^= (1 << bit);
    }
  } else {
    const bytesPerRow = g.width > 8 ? 2 : 1;
    const byteIdx = row * bytesPerRow + Math.floor(col / 8);
    const bit = 7 - (col % 8);
    g.bitmap[byteIdx] ^= (1 << bit);
  }

  renderFzxGrid();
  updateFzxPreview(currentGlyphIndex);
}

/**
 * Enter FZX editing mode - show/hide appropriate UI controls.
 */
function enterFzxMode() {
  isFzxMode = true;
  dom.fzxSection.style.display = '';
  dom.fzxGlyphSection.style.display = '';

  // Hide fixed-font controls
  dom.fontWidthSelect.closest('.editor-section').style.display = 'none';
  document.getElementById('charMappingSection').style.display = 'none';
  document.getElementById('metricsSection').style.display = 'none';

  dom.convertFontBtn.textContent = '\u2192 Fixed';

  // Update FZX font-level controls
  if (fzxFont) {
    dom.fzxHeight.value = String(fzxFont.height);
    dom.fzxTracking.value = String(fzxFont.tracking);
    dom.glyphCountInput.value = String(fzxFont.glyphs.length);
  }

  dom.grid.classList.add('fzx-grid');
  updatePreviewColumnWidth();
}

/**
 * Exit FZX editing mode - restore fixed-font UI controls.
 */
function exitFzxMode() {
  isFzxMode = false;
  fzxFont = null;
  dom.fzxSection.style.display = 'none';
  dom.fzxGlyphSection.style.display = 'none';

  // Restore fixed-font controls
  dom.fontWidthSelect.closest('.editor-section').style.display = '';
  document.getElementById('charMappingSection').style.display = '';
  document.getElementById('metricsSection').style.display = '';

  dom.convertFontBtn.textContent = '\u2192 FZX';

  dom.grid.classList.remove('fzx-grid');

  // Reset preview canvas to default size
  dom.previewCanvas.width = PREVIEW.SIZE;
  dom.previewCanvas.height = PREVIEW.SIZE;
  dom.previewCanvas.style.width = PREVIEW.SIZE + 'px';
  dom.previewCanvas.style.height = PREVIEW.SIZE + 'px';
  updatePreviewColumnWidth();
}

/**
 * Apply a transform to an FZX glyph (or all glyphs if glyphIndex is null).
 * @param {string} type - Transform type
 * @param {number|null} glyphIndex
 */
function applyFzxTransform(type, glyphIndex) {
  if (!fzxFont) return;
  pushUndo();

  const start = glyphIndex !== null ? glyphIndex : 0;
  const end = glyphIndex !== null ? glyphIndex + 1 : fzxFont.glyphs.length;

  for (let i = start; i < end; i++) {
    const g = fzxFont.glyphs[i];
    const bytesPerRow = g.width > 8 ? 2 : 1;
    const h = fzxFont.height;

    switch (type) {
      case 'invert':
        for (let b = 0; b < g.bitmap.length; b++) {
          g.bitmap[b] ^= 0xFF;
        }
        // Mask off unused bits in each row's last byte
        const usedBits = g.width % 8 || 8;
        const mask = (0xFF << (8 - usedBits)) & 0xFF;
        for (let row = 0; row < h; row++) {
          const lastByteIdx = row * bytesPerRow + bytesPerRow - 1;
          if (bytesPerRow === 1) {
            g.bitmap[lastByteIdx] &= mask;
          } else {
            // For 2-byte rows, mask the second byte
            const remainBits = g.width - 8;
            const mask2 = (0xFF << (8 - remainBits)) & 0xFF;
            g.bitmap[row * 2 + 1] &= mask2;
          }
        }
        break;

      case 'clear':
        g.bitmap.fill(0);
        break;

      case 'scroll-up': {
        const firstRow = new Uint8Array(bytesPerRow);
        for (let b = 0; b < bytesPerRow; b++) firstRow[b] = g.bitmap[b];
        for (let row = 0; row < h - 1; row++) {
          for (let b = 0; b < bytesPerRow; b++) {
            g.bitmap[row * bytesPerRow + b] = g.bitmap[(row + 1) * bytesPerRow + b];
          }
        }
        for (let b = 0; b < bytesPerRow; b++) g.bitmap[(h - 1) * bytesPerRow + b] = firstRow[b];
        break;
      }

      case 'scroll-down': {
        const lastRow = new Uint8Array(bytesPerRow);
        for (let b = 0; b < bytesPerRow; b++) lastRow[b] = g.bitmap[(h - 1) * bytesPerRow + b];
        for (let row = h - 1; row > 0; row--) {
          for (let b = 0; b < bytesPerRow; b++) {
            g.bitmap[row * bytesPerRow + b] = g.bitmap[(row - 1) * bytesPerRow + b];
          }
        }
        for (let b = 0; b < bytesPerRow; b++) g.bitmap[b] = lastRow[b];
        break;
      }

      case 'scroll-left': {
        for (let row = 0; row < h; row++) {
          if (bytesPerRow === 1) {
            const byte = g.bitmap[row];
            const leftBit = (byte >> 7) & 1;
            // Shift left, wrap MSB to bit position (8 - width)
            let newByte = ((byte << 1) & 0xFF) | (leftBit << (8 - g.width));
            // Mask unused bits
            const usedMask = (0xFF << (8 - g.width)) & 0xFF;
            g.bitmap[row] = newByte & usedMask;
          } else {
            // 2 bytes per row
            const b0 = g.bitmap[row * 2];
            const b1 = g.bitmap[row * 2 + 1];
            const leftBit = (b0 >> 7) & 1;
            const carry = (b1 >> 7) & 1;
            let newB0 = ((b0 << 1) & 0xFF) | carry;
            let newB1 = ((b1 << 1) & 0xFF);
            // Wrap leftmost bit to rightmost used position
            const remainBits = g.width - 8;
            newB1 |= (leftBit << (8 - remainBits));
            const mask2 = (0xFF << (8 - remainBits)) & 0xFF;
            g.bitmap[row * 2] = newB0;
            g.bitmap[row * 2 + 1] = newB1 & mask2;
          }
        }
        break;
      }

      case 'scroll-right': {
        for (let row = 0; row < h; row++) {
          if (bytesPerRow === 1) {
            const byte = g.bitmap[row];
            const rightBit = (byte >> (8 - g.width)) & 1;
            let newByte = (byte >> 1) | (rightBit << 7);
            const usedMask = (0xFF << (8 - g.width)) & 0xFF;
            g.bitmap[row] = newByte & usedMask;
          } else {
            const b0 = g.bitmap[row * 2];
            const b1 = g.bitmap[row * 2 + 1];
            const remainBits = g.width - 8;
            const rightBit = (b1 >> (8 - remainBits)) & 1;
            const carry = b0 & 1;
            let newB0 = (b0 >> 1) | (rightBit << 7);
            let newB1 = (b1 >> 1) | (carry << 7);
            const mask2 = (0xFF << (8 - remainBits)) & 0xFF;
            g.bitmap[row * 2] = newB0;
            g.bitmap[row * 2 + 1] = newB1 & mask2;
          }
        }
        break;
      }

      case 'flip-horizontal': {
        for (let row = 0; row < h; row++) {
          // Read all bits for this row
          const bits = [];
          for (let col = 0; col < g.width; col++) {
            const byteIdx = row * bytesPerRow + Math.floor(col / 8);
            bits.push((g.bitmap[byteIdx] >> (7 - (col % 8))) & 1);
          }
          // Write reversed
          bits.reverse();
          // Clear row
          for (let b = 0; b < bytesPerRow; b++) g.bitmap[row * bytesPerRow + b] = 0;
          for (let col = 0; col < g.width; col++) {
            if (bits[col]) {
              const byteIdx = row * bytesPerRow + Math.floor(col / 8);
              g.bitmap[byteIdx] |= (1 << (7 - (col % 8)));
            }
          }
        }
        break;
      }

      case 'align-left': {
        // Find leftmost set column
        let minCol = g.width;
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < g.width; col++) {
            const byteIdx = row * bytesPerRow + Math.floor(col / 8);
            if ((g.bitmap[byteIdx] >> (7 - (col % 8))) & 1) {
              if (col < minCol) minCol = col;
              break;
            }
          }
        }
        if (minCol > 0 && minCol < g.width) {
          for (let row = 0; row < h; row++) {
            // Read all bits
            const bits = [];
            for (let col = 0; col < g.width; col++) {
              const byteIdx = row * bytesPerRow + Math.floor(col / 8);
              bits.push((g.bitmap[byteIdx] >> (7 - (col % 8))) & 1);
            }
            // Clear and rewrite shifted
            for (let b = 0; b < bytesPerRow; b++) g.bitmap[row * bytesPerRow + b] = 0;
            for (let col = 0; col < g.width - minCol; col++) {
              if (bits[col + minCol]) {
                const byteIdx = row * bytesPerRow + Math.floor(col / 8);
                g.bitmap[byteIdx] |= (1 << (7 - (col % 8)));
              }
            }
          }
        }
        break;
      }

      case 'align-right': {
        // Find rightmost set column
        let maxCol = -1;
        for (let row = 0; row < h; row++) {
          for (let col = g.width - 1; col >= 0; col--) {
            const byteIdx = row * bytesPerRow + Math.floor(col / 8);
            if ((g.bitmap[byteIdx] >> (7 - (col % 8))) & 1) {
              if (col > maxCol) maxCol = col;
              break;
            }
          }
        }
        if (maxCol >= 0 && maxCol < g.width - 1) {
          const shift = g.width - 1 - maxCol;
          for (let row = 0; row < h; row++) {
            const bits = [];
            for (let col = 0; col < g.width; col++) {
              const byteIdx = row * bytesPerRow + Math.floor(col / 8);
              bits.push((g.bitmap[byteIdx] >> (7 - (col % 8))) & 1);
            }
            for (let b = 0; b < bytesPerRow; b++) g.bitmap[row * bytesPerRow + b] = 0;
            for (let col = 0; col < g.width; col++) {
              const srcCol = col - shift;
              if (srcCol >= 0 && bits[srcCol]) {
                const byteIdx = row * bytesPerRow + Math.floor(col / 8);
                g.bitmap[byteIdx] |= (1 << (7 - (col % 8)));
              }
            }
          }
        }
        break;
      }

      case 'align-top': {
        let firstRow = -1;
        for (let row = 0; row < h; row++) {
          let hasPixel = false;
          for (let b = 0; b < bytesPerRow; b++) {
            if (g.bitmap[row * bytesPerRow + b] !== 0) { hasPixel = true; break; }
          }
          if (hasPixel) { firstRow = row; break; }
        }
        if (firstRow > 0) {
          for (let row = 0; row < h; row++) {
            for (let b = 0; b < bytesPerRow; b++) {
              g.bitmap[row * bytesPerRow + b] = (row + firstRow < h) ? g.bitmap[(row + firstRow) * bytesPerRow + b] : 0;
            }
          }
        }
        break;
      }

      case 'align-bottom': {
        let lastRow = -1;
        for (let row = h - 1; row >= 0; row--) {
          let hasPixel = false;
          for (let b = 0; b < bytesPerRow; b++) {
            if (g.bitmap[row * bytesPerRow + b] !== 0) { hasPixel = true; break; }
          }
          if (hasPixel) { lastRow = row; break; }
        }
        if (lastRow >= 0 && lastRow < h - 1) {
          const shift = h - 1 - lastRow;
          for (let row = h - 1; row >= 0; row--) {
            for (let b = 0; b < bytesPerRow; b++) {
              g.bitmap[row * bytesPerRow + b] = (row - shift >= 0) ? g.bitmap[(row - shift) * bytesPerRow + b] : 0;
            }
          }
        }
        break;
      }

      case 'flip-vertical': {
        for (let row = 0; row < Math.floor(h / 2); row++) {
          const mirrorRow = h - 1 - row;
          for (let b = 0; b < bytesPerRow; b++) {
            const temp = g.bitmap[row * bytesPerRow + b];
            g.bitmap[row * bytesPerRow + b] = g.bitmap[mirrorRow * bytesPerRow + b];
            g.bitmap[mirrorRow * bytesPerRow + b] = temp;
          }
        }
        break;
      }
    }
  }

  renderFzxGrid();
  if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
}

/**
 * Resize an FZX glyph bitmap when width changes.
 * @param {number} glyphIndex
 * @param {number} newWidth
 */
function resizeFzxGlyphWidth(glyphIndex, newWidth) {
  if (!fzxFont) return;
  const g = fzxFont.glyphs[glyphIndex];
  const oldWidth = g.width;
  if (newWidth === oldWidth) return;

  const h = fzxFont.height;
  const oldBpr = oldWidth > 8 ? 2 : 1;
  const newBpr = newWidth > 8 ? 2 : 1;
  const newBitmap = new Uint8Array(h * newBpr);

  // Copy pixel data column by column, preserving existing bits
  const copyWidth = Math.min(oldWidth, newWidth);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < copyWidth; col++) {
      const oldByteIdx = row * oldBpr + Math.floor(col / 8);
      const oldBit = 7 - (col % 8);
      if ((g.bitmap[oldByteIdx] >> oldBit) & 1) {
        const newByteIdx = row * newBpr + Math.floor(col / 8);
        const newBit = 7 - (col % 8);
        newBitmap[newByteIdx] |= (1 << newBit);
      }
    }
  }

  g.width = newWidth;
  g.bitmap = newBitmap;
}

/**
 * Resize all FZX glyph bitmaps when font height changes.
 * @param {number} newHeight
 */
function resizeFzxFontHeight(newHeight) {
  if (!fzxFont) return;
  const oldHeight = fzxFont.height;
  if (newHeight === oldHeight) return;

  for (const g of fzxFont.glyphs) {
    const bpr = g.width > 8 ? 2 : 1;
    const newBitmap = new Uint8Array(newHeight * bpr);
    const copyRows = Math.min(oldHeight, newHeight);
    for (let row = 0; row < copyRows; row++) {
      for (let b = 0; b < bpr; b++) {
        newBitmap[row * bpr + b] = g.bitmap[row * bpr + b];
      }
    }
    g.bitmap = newBitmap;
    // Clamp shift if it now exceeds the font height
    if (g.shift >= newHeight) g.shift = Math.max(0, newHeight - 1);
  }

  fzxFont.height = newHeight;
}

/**
 * Change the lastchar value, adding or removing glyphs as needed.
 * @param {number} newLastChar
 */
function changeFzxLastChar(newLastChar) {
  if (!fzxFont) return;
  const oldCount = fzxFont.glyphs.length;
  const newCount = newLastChar - 32 + 1;

  if (newCount > oldCount) {
    // Add new empty glyphs
    for (let i = oldCount; i < newCount; i++) {
      const bpr = 1; // default width 8
      fzxFont.glyphs.push({
        width: 8, shift: 0, kern: 0,
        bitmap: new Uint8Array(fzxFont.height * bpr)
      });
    }
  } else if (newCount < oldCount) {
    fzxFont.glyphs.length = newCount;
  }

  fzxFont.lastchar = newLastChar;
}

/**
 * Create a new empty FZX font.
 */
function createNewFzxFont() {
  const height = 8;
  const tracking = 0;
  const lastchar = 127;
  const numChars = lastchar - 32 + 1;
  const glyphs = [];

  for (let i = 0; i < numChars; i++) {
    glyphs.push({
      width: 8,
      shift: 0,
      kern: 0,
      bitmap: new Uint8Array(height) // 1 byte per row × 8 rows
    });
  }

  fzxFont = { height, tracking, lastchar, glyphs };
  glyphData = null;
  clearUndoHistory();
  updateFileDisplay('font.fzx');

  resetGlyphSelection();
  enterFzxMode();
  renderFzxGrid();
}

// ============================================================================
// Font ↔ FZX Conversion
// ============================================================================

/**
 * Convert fixed-width font to FZX proportional font.
 * Auto-detects each glyph's actual width (rightmost set pixel).
 */
function convertFixedToFzx() {
  if (!glyphData || numGlyphs === 0) return;
  const maxGlyphs = Math.min(numGlyphs, 224); // lastchar max 255, first char 32
  const height = 8;
  const isVar = dom.fontWidthSelect.value === 'variable';
  const glyphs = [];

  for (let i = 0; i < maxGlyphs; i++) {
    const offset = i * FONT_CONST.BYTES_PER_GLYPH;
    const startRow = isVar ? 1 : 0;
    // Find bounding box: leftmost and rightmost set pixel columns
    let minCol = 8, maxCol = -1;
    for (let row = startRow; row < height; row++) {
      const byte = glyphData[offset + row];
      if (byte === 0) continue;
      for (let col = 0; col < 8; col++) {
        if ((byte >> (7 - col)) & 1) {
          if (col < minCol) minCol = col;
          if (col > maxCol) maxCol = col;
        }
      }
    }
    if (maxCol < 0) {
      // Empty glyph
      glyphs.push({ width: 1, shift: 0, kern: 0, bitmap: new Uint8Array(height) });
      continue;
    }
    const width = maxCol - minCol + 1;
    const bpr = Math.ceil(width / 8);
    const bitmap = new Uint8Array(height * bpr);
    for (let row = startRow; row < height; row++) {
      const byte = glyphData[offset + row];
      // Shift left by minCol so visual content is left-aligned in the FZX bitmap
      const shifted = (byte << minCol) & 0xFF;
      bitmap[row * bpr] = shifted;
    }
    glyphs.push({ width, shift: 0, kern: 0, bitmap });
  }

  fzxFont = { height, tracking: 0, lastchar: 31 + maxGlyphs, glyphs };
  glyphData = null;
  enterFzxMode();

  updateFileDisplay();
  renderFzxGrid();
}

/**
 * Convert FZX proportional font to fixed-width 8×8 font.
 * Clips glyphs wider than 8 or taller than 8.
 * The internal bitmap already has shift baked in (empty rows 0..shift-1),
 * so we read directly by outRow without additional offset.
 */
function convertFzxToFixed() {
  if (!fzxFont) return;
  const count = Math.min(fzxFont.glyphs.length, 1024);
  const newData = new Uint8Array(count * FONT_CONST.BYTES_PER_GLYPH);

  for (let i = 0; i < count; i++) {
    const g = fzxFont.glyphs[i];
    const bpr = Math.ceil(g.width / 8);
    const outOffset = i * FONT_CONST.BYTES_PER_GLYPH;

    for (let outRow = 0; outRow < 8; outRow++) {
      if (outRow >= fzxFont.height) continue;
      // Take first byte of source row (leftmost 8 pixels)
      newData[outOffset + outRow] = g.bitmap[outRow * bpr];
    }
  }

  exitFzxMode();
  glyphData = newData;
  numGlyphs = count;
  isExploded = false;
  const defaultMapping = createDefaultMapping(numGlyphs);
  applyMapping(defaultMapping);

  updateFileDisplay();
  renderFontGrid();
}

// ============================================================================
// UI event handlers
// ============================================================================

function handleGlyphClick(event) {
  const container = event.currentTarget;
  const idx = parseInt(container.dataset.glyphIndex);
  currentGlyphIndex = idx;

  document.querySelectorAll('.glyph').forEach(el => el.classList.remove('selected'));
  container.classList.add('selected');

  if (isFzxMode) {
    updateFzxPreview(idx);
  } else {
    updatePreview(idx);
  }
}

function updateFileDisplay(name) {
  if (name !== undefined) {
    currentFontFileName = name;
    dom.headerFileName.textContent = name;
  }
  // Build info string with glyph counts
  const displayName = currentFontFileName || 'No font loaded';
  const parts = [];
  if (glyphData && numGlyphs > 0) parts.push(numGlyphs + ' glyphs' + (isExploded ? ' intrlcd' : ''));
  if (isFzxMode && fzxFont) parts.push(fzxFont.glyphs.length + ' FZX');
  dom.fileDisplay.textContent = parts.length ? displayName + ' (' + parts.join(' + ') + ')' : displayName;
  // Sync glyph count input
  if (isFzxMode && fzxFont) {
    dom.glyphCountInput.value = String(fzxFont.glyphs.length);
  } else {
    dom.glyphCountInput.value = String(glyphData ? numGlyphs : 0);
  }
}

function resetGlyphSelection() {
  currentGlyphIndex = null;
  document.querySelectorAll('.glyph').forEach(el => el.classList.remove('selected'));
  dom.glyphInfo.textContent = 'Click a glyph to edit';
  dom.charInput.value = '';
  const ctx = dom.previewCanvas.getContext('2d');
  if (ctx) {
    const colors = getThemeColors();
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, PREVIEW.SIZE, PREVIEW.SIZE);
  }
}

// --- File I/O ---

dom.loadFontBtn.addEventListener('click', () => dom.fontFile.click());

dom.fontFile.addEventListener('change', (e) => {
  const file = /** @type {HTMLInputElement} */ (e.target).files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const buffer = new Uint8Array(/** @type {ArrayBuffer} */ (evt.target.result));
    const fileSize = buffer.length;

    // Detect FZX file
    if (file.name.toLowerCase().endsWith('.fzx')) {
      resetGlyphSelection();
      clearUndoHistory();
      try {
        fzxFont = parseFzxFile(buffer);
        glyphData = null;
        enterFzxMode();
    
        updateFileDisplay(file.name);
        renderFzxGrid();
      } catch (err) {
        alert('Failed to load FZX file: ' + err.message);
      }
      return;
    }

    // Non-FZX file: exit FZX mode if active
    if (isFzxMode) exitFzxMode();

    // Validate: must be multiple of 8 bytes
    try {
      validateFontFileSize(fileSize, file.name);
    } catch (err) {
      alert(err.message);
      return;
    }

    // All non-FZX files load as N glyphs into glyphData
    resetGlyphSelection();
    clearUndoHistory();

    function finishLoadFont(exploded) {
      isExploded = exploded;
      if (isExploded) {
        glyphData = convertExplodedFont(buffer, numGlyphs);
      } else {
        glyphData = buffer.slice();
      }
      const defaultMapping = createDefaultMapping(numGlyphs);
      applyMapping(defaultMapping);
  
      updateFileDisplay(file.name);
      renderFontGrid();
    }

    if (fileSize === FONT_CONST.SIZE_96_BYTES) {
      numGlyphs = 96;
      finishLoadFont(false);
    } else if (fileSize === FONT_CONST.SIZE_256_BYTES) {
      numGlyphs = 256;
      showFormatChoiceModal(buffer).then(chosen => finishLoadFont(chosen));
    } else {
      numGlyphs = fileSize / FONT_CONST.BYTES_PER_GLYPH;
      finishLoadFont(false);
    }
  };
  reader.readAsArrayBuffer(file);
  dom.fontFile.value = '';
});

// --- Append file ---

dom.appendFontBtn.addEventListener('click', () => dom.appendFontFile.click());

dom.appendFontFile.addEventListener('change', (e) => {
  const file = /** @type {HTMLInputElement} */ (e.target).files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const buffer = new Uint8Array(/** @type {ArrayBuffer} */ (evt.target.result));
    const fileSize = buffer.length;

    if (fileSize === 0 || fileSize % FONT_CONST.BYTES_PER_GLYPH !== 0) {
      alert(`Invalid file size: ${fileSize} bytes (must be a multiple of ${FONT_CONST.BYTES_PER_GLYPH}).`);
      return;
    }

    if (isFzxMode) {
      alert('Append is not supported in FZX mode.');
      return;
    }

    const appendCount = fileSize / FONT_CONST.BYTES_PER_GLYPH;
    const newTotal = numGlyphs + appendCount;

    if (newTotal > 1024) {
      const allowed = 1024 - numGlyphs;
      if (allowed <= 0) {
        alert('Already at maximum 1024 glyphs.');
        return;
      }
      alert(`Only ${allowed} of ${appendCount} glyphs will be appended (max 1024 total).`);
    }

    const actualAppend = Math.min(appendCount, 1024 - numGlyphs);
    pushUndo();

    const newData = new Uint8Array((numGlyphs + actualAppend) * FONT_CONST.BYTES_PER_GLYPH);
    if (glyphData) {
      newData.set(glyphData.subarray(0, numGlyphs * FONT_CONST.BYTES_PER_GLYPH));
    }
    newData.set(buffer.subarray(0, actualAppend * FONT_CONST.BYTES_PER_GLYPH), numGlyphs * FONT_CONST.BYTES_PER_GLYPH);
    glyphData = newData;
    numGlyphs = numGlyphs + actualAppend;

    const defaultMapping = createDefaultMapping(numGlyphs);
    applyMapping(defaultMapping);

    updateFileDisplay();
    renderFontGrid();
  };
  reader.readAsArrayBuffer(file);
  dom.appendFontFile.value = '';
});

dom.saveFontBtn.addEventListener('click', async () => {
  // FZX mode — unchanged
  if (isFzxMode) {
    if (!fzxFont) { alert('No FZX font loaded'); return; }
    try {
      const exportData = buildFzxFile();
      const fileName = currentFontFileName || 'font.fzx';
      downloadBinary(exportData, fileName);
    } catch (err) {
      alert('Failed to save FZX: ' + err.message);
    }
    return;
  }

  if (!glyphData || numGlyphs === 0) { alert('No font loaded'); return; }

  const baseName = currentFontFileName
    ? currentFontFileName.replace(/\.[^.]+$/, '') : 'font';

  if (numGlyphs === 96) {
    // Standard font — save directly
    downloadBinary(glyphData.slice(0, 768), baseName + '.768');

  } else if (numGlyphs === 21) {
    // UDG — save directly
    downloadBinary(glyphData.slice(0, 168), baseName + '.udg');

  } else if (numGlyphs === 256) {
    // Ask: normal or interlaced
    const choice = await showSave256Dialog();
    if (choice === 'normal') {
      downloadBinary(glyphData.slice(0, 2048), baseName + '.ch8');
    } else if (choice === 'interlaced') {
      const exploded = convertToExplodedFont(glyphData, 256);
      downloadBinary(exploded, baseName + '.ch8');
    }

  } else if (numGlyphs === 117) {
    // Ask: single / font+udg / udg+font
    const choice = await showSave117Dialog();
    if (choice === 'single') {
      downloadBinary(glyphData.slice(0, 936), baseName + '.bin');
    } else if (choice === 'font-udg') {
      // font(0-95) + udg(96-116) — same byte order as internal storage
      downloadBinary(glyphData.slice(0, 936), baseName + '.bin');
    } else if (choice === 'udg-font') {
      // Rearrange: glyphs 96-116 first, then 0-95
      const udg = glyphData.slice(96 * 8, 117 * 8);
      const font = glyphData.slice(0, 96 * 8);
      const combined = new Uint8Array(936);
      combined.set(udg, 0);
      combined.set(font, 168);
      downloadBinary(combined, baseName + '.bin');
    }

  } else if (numGlyphs > 256) {
    // Dialog with first glyph + count inputs
    const range = await showSaveRangeDialog();
    if (range) {
      const { start, count } = range;
      const bytes = glyphData.slice(start * 8, (start + count) * 8);
      const ext = count === 96 ? '.768' : count === 21 ? '.udg' : '.bin';
      downloadBinary(bytes, baseName + ext);
    }

  } else {
    // Any other count — save directly as .bin
    downloadBinary(glyphData.slice(0, numGlyphs * 8), baseName + '.bin');
  }
});

// --- New button ---

dom.newBtn.addEventListener('click', () => {
  const type = dom.newType.value;

  if (type === 'custom') {
    const input = prompt('Number of glyphs (1–1024):', '96');
    if (input === null) return;
    const count = parseInt(input);
    if (isNaN(count) || count < 1 || count > 1024) {
      alert('Please enter a number between 1 and 1024.');
      return;
    }
    clearUndoHistory();
    resetGlyphSelection();
    if (isFzxMode) exitFzxMode();
    glyphData = new Uint8Array(count * FONT_CONST.BYTES_PER_GLYPH);
    numGlyphs = count;
    isExploded = false;
    const defaultMapping = createDefaultMapping(numGlyphs);
    applyMapping(defaultMapping);

    updateFileDisplay('new_font.bin');
    renderFontGrid();
    return;
  }

  clearUndoHistory();
  resetGlyphSelection();

  if (type === '96') {
    if (isFzxMode) exitFzxMode();
    glyphData = new Uint8Array(96 * FONT_CONST.BYTES_PER_GLYPH);
    numGlyphs = 96;
    isExploded = false;
    const defaultMapping = createDefaultMapping(numGlyphs);
    applyMapping(defaultMapping);
    updateFileDisplay('new_font.768');
  } else if (type === '256') {
    if (isFzxMode) exitFzxMode();
    glyphData = new Uint8Array(256 * FONT_CONST.BYTES_PER_GLYPH);
    numGlyphs = 256;
    isExploded = false;
    const defaultMapping = createDefaultMapping(numGlyphs);
    applyMapping(defaultMapping);
    updateFileDisplay('new_font.ch8');
  } else if (type === 'exploded') {
    if (isFzxMode) exitFzxMode();
    glyphData = new Uint8Array(256 * FONT_CONST.BYTES_PER_GLYPH);
    numGlyphs = 256;
    isExploded = true;
    const defaultMapping = createDefaultMapping(numGlyphs);
    applyMapping(defaultMapping);
    updateFileDisplay('new_font.ch8');
  } else if (type === 'fzx') {
    glyphData = null;
    createNewFzxFont();

    updateFileDisplay();
    return;
  }


  updateFileDisplay();
  renderFontGrid();
});

// --- Glyph count controls ---

dom.glyphCountInput.addEventListener('change', () => {
  const count = parseInt(dom.glyphCountInput.value);
  if (isNaN(count) || count < 1 || count > 1024) {
    dom.glyphCountInput.value = String(isFzxMode && fzxFont ? fzxFont.glyphs.length : numGlyphs);
    return;
  }

  if (isFzxMode && fzxFont) {
    // FZX mode: change lastchar via glyph count
    const newLastChar = 31 + count;
    if (newLastChar === fzxFont.lastchar) return;
    if (newLastChar < 32 || newLastChar > 255) {
      dom.glyphCountInput.value = String(fzxFont.glyphs.length);
      return;
    }
    pushUndo();
    changeFzxLastChar(newLastChar);
    if (currentGlyphIndex !== null && currentGlyphIndex >= fzxFont.glyphs.length) {
      resetGlyphSelection();
    }
    updateFileDisplay();
    renderFzxGrid();
    return;
  }

  // Fixed font mode
  if (count === numGlyphs) return;
  pushUndo();
  const newData = new Uint8Array(count * FONT_CONST.BYTES_PER_GLYPH);
  if (glyphData) {
    const copyBytes = Math.min(glyphData.length, newData.length);
    newData.set(glyphData.subarray(0, copyBytes));
  }
  glyphData = newData;
  const oldNumGlyphs = numGlyphs;
  numGlyphs = count;
  // Preserve existing mapping; only adjust for size change
  if (count > oldNumGlyphs) {
    // Extend glyphMapping for newly added glyphs (unmapped)
    for (let i = oldNumGlyphs; i < count; i++) glyphMapping.push([]);
  } else if (count < oldNumGlyphs) {
    // Truncate glyphMapping and remove stale charToGlyphIndex entries
    for (let i = count; i < oldNumGlyphs; i++) {
      if (glyphMapping[i]) {
        for (const entry of glyphMapping[i]) {
          if (charToGlyphIndex[entry.char] && charToGlyphIndex[entry.char].glyph === i) {
            delete charToGlyphIndex[entry.char];
          }
        }
      }
    }
    glyphMapping.length = count;
  }
  if (currentGlyphIndex !== null && currentGlyphIndex >= numGlyphs) {
    resetGlyphSelection();
  }

  updateFileDisplay();
  renderFontGrid();
  if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
});

// --- Convert button ---

dom.convertFontBtn.addEventListener('click', () => {
  if (isFzxMode && fzxFont) {
    pushUndo();
    resetGlyphSelection();
    convertFzxToFixed();
    dom.convertFontBtn.textContent = '\u2192 FZX';
  } else if (glyphData && numGlyphs > 0) {
    pushUndo();
    resetGlyphSelection();
    convertFixedToFzx();
    dom.convertFontBtn.textContent = '\u2192 Fixed';
  }
});

// --- Width mode ---

let prevWidthMode = '8';
dom.fontWidthSelect.addEventListener('change', () => {
  const newMode = dom.fontWidthSelect.value;
  const isVar = newMode === 'variable';
  // When switching to variable mode, initialize width byte from previous mode
  if (isVar && glyphData) {
    let defaultW = 8;
    if (prevWidthMode === '6-low') defaultW = 6;
    else if (prevWidthMode === '4-low') defaultW = 4;
    for (let g = 0; g < numGlyphs; g++) {
      const off = g * FONT_CONST.BYTES_PER_GLYPH;
      if (glyphData[off] === 0 || glyphData[off] > 8) glyphData[off] = defaultW;
    }
  }
  prevWidthMode = newMode;
  // Show/hide the "Hide W" checkbox
  dom.hideWidthByteLabel.style.display = isVar ? '' : 'none';
  if (glyphData) renderFontGrid();
  if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  renderTextSample();
});

dom.hideWidthByte.addEventListener('change', () => {
  if (glyphData) renderFontGrid();
  if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  renderTextSample();
});

dom.glyphWidthInput.addEventListener('change', () => {
  if (currentGlyphIndex === null || !glyphData) return;
  if (dom.fontWidthSelect.value !== 'variable') return;

  const width = parseInt(dom.glyphWidthInput.value);
  if (isNaN(width) || width < 1 || width > 8) {
    alert('Width must be between 1 and 8');
    dom.glyphWidthInput.value = String(glyphData[currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH]);
    return;
  }
  pushUndo();
  glyphData[currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH] = width;
  renderFontGrid();
  updatePreview(currentGlyphIndex);
});

// --- Grid checkbox ---

dom.showGridCheckbox.addEventListener('change', () => {
  if (isFzxMode) {
    renderFzxGrid();
    if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
  } else {
    if (glyphData) renderFontGrid();
    if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  }
});

dom.showLabelsCheckbox.addEventListener('change', () => {
  if (isFzxMode) {
    renderFzxGrid();
  } else {
    if (glyphData) renderFontGrid();
  }
});

// --- Scroll buttons (wrap) ---

dom.shiftUpBtn.addEventListener('click', () => {
  if (isFzxMode) {
    applyFzxTransform('scroll-up', dom.wholeFontCheckbox.checked ? null : currentGlyphIndex);
  } else if (dom.wholeFontCheckbox.checked) {
    applyGlyphTransform(glyphScrollUp, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(glyphScrollUp, currentGlyphIndex);
  }
});

dom.shiftDownBtn.addEventListener('click', () => {
  if (isFzxMode) {
    applyFzxTransform('scroll-down', dom.wholeFontCheckbox.checked ? null : currentGlyphIndex);
  } else if (dom.wholeFontCheckbox.checked) {
    applyGlyphTransform(glyphScrollDown, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(glyphScrollDown, currentGlyphIndex);
  }
});

dom.shiftLeftBtn.addEventListener('click', () => {
  if (isFzxMode) {
    applyFzxTransform('scroll-left', dom.wholeFontCheckbox.checked ? null : currentGlyphIndex);
  } else if (dom.wholeFontCheckbox.checked) {
    applyGlyphTransform(glyphScrollLeft, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(glyphScrollLeft, currentGlyphIndex);
  }
});

dom.shiftRightBtn.addEventListener('click', () => {
  if (isFzxMode) {
    applyFzxTransform('scroll-right', dom.wholeFontCheckbox.checked ? null : currentGlyphIndex);
  } else if (dom.wholeFontCheckbox.checked) {
    applyGlyphTransform(glyphScrollRight, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(glyphScrollRight, currentGlyphIndex);
  }
});

// --- Invert / Clear ---

dom.invertGlyphBtn.addEventListener('click', () => {
  if (isFzxMode) {
    applyFzxTransform('invert', dom.wholeFontCheckbox.checked ? null : currentGlyphIndex);
  } else if (dom.wholeFontCheckbox.checked) {
    if (glyphData) applyGlyphTransform(glyphInvert, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(glyphInvert, currentGlyphIndex);
  }
});

dom.clearGlyphBtn.addEventListener('click', () => {
  if (isFzxMode) {
    if (dom.wholeFontCheckbox.checked) {
      if (fzxFont && confirm('Clear all glyphs?')) applyFzxTransform('clear', null);
    } else {
      applyFzxTransform('clear', currentGlyphIndex);
    }
  } else if (dom.wholeFontCheckbox.checked) {
    if (glyphData && confirm('Clear all glyphs?')) applyGlyphTransform(glyphClear, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(glyphClear, currentGlyphIndex);
  }
});

// --- Transform dropdown ---

/** @type {Object<string, string>} FZX transform key map from transform select values to FZX transform types */
const FZX_TRANSFORM_MAP = {
  'flip-horizontal': 'flip-horizontal',
  'flip-vertical': 'flip-vertical',
  'shift-right-fill0': 'scroll-right',
  'shift-left-fill0': 'scroll-left',
  'shift-up-fill0': 'scroll-up',
  'shift-down-fill0': 'scroll-down',
  'align-left': 'align-left',
  'align-right': 'align-right',
  'align-top': 'align-top',
  'align-bottom': 'align-bottom'
};

dom.transformSelect.addEventListener('change', () => {
  const key = dom.transformSelect.value;
  if (!key) return;

  if (isFzxMode) {
    const fzxKey = FZX_TRANSFORM_MAP[key];
    if (fzxKey) {
      applyFzxTransform(fzxKey, dom.wholeFontCheckbox.checked ? null : currentGlyphIndex);
    }
    dom.transformSelect.value = '';
    return;
  }

  const fn = TRANSFORM_MAP[key];
  if (!fn) { dom.transformSelect.value = ''; return; }

  if (dom.wholeFontCheckbox.checked) {
    applyGlyphTransform(fn, null);
  } else if (currentGlyphIndex !== null) {
    applyGlyphTransform(fn, currentGlyphIndex);
  }
  dom.transformSelect.value = '';
});

// --- Character mapping ---

dom.mapCharBtn.addEventListener('click', () => {
  if (currentGlyphIndex === null) { alert('Select a glyph first'); return; }
  const chars = dom.charInput.value;
  if (!chars) { alert('Enter character(s) to map'); return; }

  const wm = dom.fontWidthSelect.value;
  for (let i = 0; i < chars.length; i++) {
    const glyph = currentGlyphIndex + i;
    if (glyph >= numGlyphs) break;
    // Remove existing mapping for this width
    const existing = glyphMapping[glyph].findIndex(m => m.width === wm);
    if (existing !== -1) {
      delete charToGlyphIndex[glyphMapping[glyph][existing].char];
      glyphMapping[glyph].splice(existing, 1);
    }
    glyphMapping[glyph].push({ char: chars[i], width: wm });
    charToGlyphIndex[chars[i]] = { glyph, width: wm };
  }
  renderFontGrid();
  updatePreview(currentGlyphIndex);
});

dom.clearMapBtn.addEventListener('click', () => {
  if (currentGlyphIndex === null) { alert('Select a glyph first'); return; }
  const wm = dom.fontWidthSelect.value;
  const mappings = glyphMapping[currentGlyphIndex];
  const idx = mappings.findIndex(m => m.width === wm);
  if (idx === -1) return;

  const charCode = mappings[idx].char.charCodeAt(0);
  delete charToGlyphIndex[mappings[idx].char];
  mappings.splice(idx, 1);

  // Remove consecutive
  for (let i = currentGlyphIndex + 1; i < numGlyphs; i++) {
    const nm = glyphMapping[i];
    const ni = nm.findIndex(m => m.width === wm && m.char.charCodeAt(0) === charCode + (i - currentGlyphIndex));
    if (ni !== -1) {
      delete charToGlyphIndex[nm[ni].char];
      nm.splice(ni, 1);
    } else break;
  }
  renderFontGrid();
  updatePreview(currentGlyphIndex);
});

// --- Remap ---

dom.remapFromInput.addEventListener('input', buildCharRemap);
dom.remapToInput.addEventListener('input', buildCharRemap);

// --- Metrics export/import ---

dom.saveMappingBtn.addEventListener('click', () => {
  if (!glyphData) { alert('No font loaded'); return; }

  // Build ranges
  const mappingsByWidth = {};
  for (let i = 0; i < numGlyphs; i++) {
    if (glyphMapping[i]) {
      for (const m of glyphMapping[i]) {
        if (!mappingsByWidth[m.width]) mappingsByWidth[m.width] = [];
        mappingsByWidth[m.width].push({ glyph: i, char: m.char });
      }
    }
  }

  const ranges = [];
  for (const width in mappingsByWidth) {
    let cur = null;
    for (const entry of mappingsByWidth[width]) {
      if (!cur) {
        cur = { start: entry.glyph, chars: entry.char, width };
      } else if (entry.glyph === cur.start + cur.chars.length) {
        cur.chars += entry.char;
      } else {
        ranges.push(cur);
        cur = { start: entry.glyph, chars: entry.char, width };
      }
    }
    if (cur) ranges.push(cur);
  }

  const metricsData = {
    fontFile: currentFontFileName,
    glyphs: numGlyphs,
    exploded: isExploded,
    fontWidth: dom.fontWidthSelect.value,
    mapping: ranges,
    remap: { from: dom.remapFromInput.value, to: dom.remapToInput.value }
  };

  const metricsName = (currentFontFileName || 'font').replace(/\.[^.]+$/, '') + '.metrics';
  downloadBinary(JSON.stringify(metricsData, null, 2), metricsName, 'application/json');
});

dom.loadMappingBtn.addEventListener('click', () => dom.loadMappingFile.click());

dom.loadMappingFile.addEventListener('change', (e) => {
  const file = /** @type {HTMLInputElement} */ (e.target).files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(/** @type {string} */ (evt.target.result));
      if (data.glyphs !== numGlyphs) {
        alert(`Metrics file is for ${data.glyphs} glyphs, current font has ${numGlyphs}`);
        return;
      }
      isExploded = data.exploded || false;
      dom.fontWidthSelect.value = data.fontWidth || '8';
      applyMapping(data.mapping, data.fontWidth || '8');
      if (data.remap) {
        dom.remapFromInput.value = data.remap.from || '';
        dom.remapToInput.value = data.remap.to || '';
        buildCharRemap();
      }
      renderFontGrid();
      if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
    } catch (err) {
      alert('Failed to load metrics: ' + err.message);
    }
  };
  reader.readAsText(file);
  dom.loadMappingFile.value = '';
});

// --- Drawing tools ---

// Tool selection
function setFontTool(tool) {
  currentFontTool = tool;
  toolStartCol = -1;
  toolStartRow = -1;
  if (dom.fontToolBar) {
    dom.fontToolBar.querySelectorAll('.font-tool-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.fontTool === tool);
    });
  }
}

if (dom.fontToolBar) {
  dom.fontToolBar.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-font-tool]');
    if (btn) setFontTool(btn.dataset.fontTool);
  });
}

// Coordinate conversion: mouse offset → grid {col, row} or null
function mouseToGridCoords(x, y) {
  if (currentGlyphIndex === null) return null;
  if (isFzxMode && fzxFont) {
    const g = fzxFont.glyphs[currentGlyphIndex];
    if (!g) return null;
    const scale = getFzxPreviewScale();
    const margins = getFzxPreviewMargins();
    const col = Math.floor((x - margins.left) / scale);
    const row = Math.floor((y - margins.top) / scale);
    if (col < 0 || col >= g.width || row < 0 || row >= fzxFont.height) return null;
    return { col, row };
  } else {
    const col = Math.floor(x / PREVIEW.SCALE);
    const row = Math.floor(y / PREVIEW.SCALE);
    if (col < 0 || col >= 8 || row < 0 || row >= 8) return null;
    return { col, row };
  }
}

// Clamped version — always returns valid coords (for shape tools that need edge-to-edge dragging)
function clampToGridCoords(x, y) {
  if (currentGlyphIndex === null) return null;
  if (isFzxMode && fzxFont) {
    const g = fzxFont.glyphs[currentGlyphIndex];
    if (!g) return null;
    const scale = getFzxPreviewScale();
    const margins = getFzxPreviewMargins();
    const col = Math.max(0, Math.min(g.width - 1, Math.floor((x - margins.left) / scale)));
    const row = Math.max(0, Math.min(fzxFont.height - 1, Math.floor((y - margins.top) / scale)));
    return { col, row };
  } else {
    const col = Math.max(0, Math.min(7, Math.floor(x / PREVIEW.SCALE)));
    const row = Math.max(0, Math.min(7, Math.floor(y / PREVIEW.SCALE)));
    return { col, row };
  }
}

// Pixel set/clear helpers (non-toggling)
function setFontPixel(col, row) {
  if (currentGlyphIndex === null) return;
  if (isFzxMode) { setFzxPixelValue(col, row, true); return; }
  if (!glyphData) return;
  const active = getActiveColumns(currentGlyphIndex);
  if (!active.includes(col)) return;
  const wm = dom.fontWidthSelect.value;
  if (wm === 'variable' && row === 0) return;
  const bit = 1 << (7 - col);
  if (dom.wholeFontCheckbox.checked) {
    for (let g = 0; g < numGlyphs; g++) {
      if (wm === 'variable' && row === 0) continue;
      if (wm === 'variable') {
        const gw = Math.min(Math.max(glyphData[g * FONT_CONST.BYTES_PER_GLYPH], 1), 8);
        if (col < 8 - gw) continue;
      }
      glyphData[g * FONT_CONST.BYTES_PER_GLYPH + row] |= bit;
    }
  } else {
    glyphData[currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH + row] |= bit;
  }
}

function clearFontPixel(col, row) {
  if (currentGlyphIndex === null) return;
  if (isFzxMode) { setFzxPixelValue(col, row, false); return; }
  if (!glyphData) return;
  const active = getActiveColumns(currentGlyphIndex);
  if (!active.includes(col)) return;
  const wm = dom.fontWidthSelect.value;
  if (wm === 'variable' && row === 0) return;
  const bit = 1 << (7 - col);
  if (dom.wholeFontCheckbox.checked) {
    for (let g = 0; g < numGlyphs; g++) {
      if (wm === 'variable' && row === 0) continue;
      if (wm === 'variable') {
        const gw = Math.min(Math.max(glyphData[g * FONT_CONST.BYTES_PER_GLYPH], 1), 8);
        if (col < 8 - gw) continue;
      }
      glyphData[g * FONT_CONST.BYTES_PER_GLYPH + row] &= ~bit;
    }
  } else {
    glyphData[currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH + row] &= ~bit;
  }
}

function setFzxPixelValue(col, row, isSet) {
  if (!fzxFont || currentGlyphIndex === null) return;
  if (dom.wholeFontCheckbox.checked) {
    for (let i = 0; i < fzxFont.glyphs.length; i++) {
      const gi = fzxFont.glyphs[i];
      if (col >= gi.width || row >= fzxFont.height) continue;
      const bpr = gi.width > 8 ? 2 : 1;
      const byteIdx = row * bpr + Math.floor(col / 8);
      const bit = 7 - (col % 8);
      if (isSet) gi.bitmap[byteIdx] |= (1 << bit);
      else gi.bitmap[byteIdx] &= ~(1 << bit);
    }
  } else {
    const g = fzxFont.glyphs[currentGlyphIndex];
    const bytesPerRow = g.width > 8 ? 2 : 1;
    const byteIdx = row * bytesPerRow + Math.floor(col / 8);
    const bit = 7 - (col % 8);
    if (isSet) g.bitmap[byteIdx] |= (1 << bit);
    else g.bitmap[byteIdx] &= ~(1 << bit);
  }
}

function refreshPreview() {
  if (isFzxMode) {
    renderFzxGrid();
    if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
  } else {
    renderFontGrid();
    if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  }
}

// Drawing algorithms
function bresenhamCollect(c0, r0, c1, r1, callback) {
  let dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0);
  let sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    callback(c0, r0);
    if (c0 === c1 && r0 === r1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; c0 += sx; }
    if (e2 < dx) { err += dx; r0 += sy; }
  }
}

function circleCollect(c0, r0, c1, r1, callback) {
  // Midpoint ellipse from bounding box defined by two corners
  const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
  const w = maxC - minC, h = maxR - minR;
  if (w === 0 && h === 0) { callback(minC, minR); return; }
  if (w === 0) { for (let r = minR; r <= maxR; r++) callback(minC, r); return; }
  if (h === 0) { for (let c = minC; c <= maxC; c++) callback(c, minR); return; }

  // Midpoint ellipse algorithm
  const a = w / 2, b = h / 2;
  const cx = minC + a, cy = minR + b;
  const a2 = a * a, b2 = b * b;
  const plotSet = new Set();
  function plot(x, y) {
    const px = Math.round(x), py = Math.round(y);
    const key = px + ',' + py;
    if (!plotSet.has(key)) { plotSet.add(key); callback(px, py); }
  }
  function plot4(x, y) {
    plot(cx + x, cy + y);
    plot(cx - x, cy + y);
    plot(cx + x, cy - y);
    plot(cx - x, cy - y);
  }

  let x = a, y = 0;
  plot4(x, y);
  let dx = 2 * b2 * x, dy = 0;
  let p1 = b2 - a2 * b + 0.25 * a2;
  while (dx > dy) {
    y++;
    dy += 2 * a2;
    if (p1 < 0) {
      p1 += b2 + dy;
    } else {
      x--;
      dx -= 2 * b2;
      p1 += b2 + dy - dx;
    }
    plot4(x, y);
  }
  let p2 = b2 * (x - 0.5) * (x - 0.5) + a2 * (y + 1) * (y + 1) - a2 * b2;
  while (x >= 0) {
    x--;
    dx -= 2 * b2;
    if (p2 > 0) {
      p2 += a2 - dx;
    } else {
      y++;
      dy += 2 * a2;
      p2 += a2 - dx + dy;
    }
    plot4(x, y);
  }
}

function fontDrawLine(c0, r0, c1, r1, isSet) {
  bresenhamCollect(c0, r0, c1, r1, (c, r) => {
    if (isSet) setFontPixel(c, r); else clearFontPixel(c, r);
  });
}

function fontDrawRect(c0, r0, c1, r1, isSet) {
  fontDrawLine(c0, r0, c1, r0, isSet);
  fontDrawLine(c1, r0, c1, r1, isSet);
  fontDrawLine(c1, r1, c0, r1, isSet);
  fontDrawLine(c0, r1, c0, r0, isSet);
}

function fontDrawCircle(c0, r0, c1, r1, isSet) {
  circleCollect(c0, r0, c1, r1, (c, r) => {
    if (isSet) setFontPixel(c, r); else clearFontPixel(c, r);
  });
}

function fontDrawFilledRect(c0, r0, c1, r1, isSet) {
  const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (isSet) setFontPixel(c, r); else clearFontPixel(c, r);
    }
  }
}

function filledCircleCollect(c0, r0, c1, r1, callback) {
  const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
  const w = maxC - minC, h = maxR - minR;
  if (w === 0 && h === 0) { callback(minC, minR); return; }
  if (w === 0) { for (let r = minR; r <= maxR; r++) callback(minC, r); return; }
  if (h === 0) { for (let c = minC; c <= maxC; c++) callback(c, minR); return; }
  const a = w / 2, b = h / 2;
  const cx = minC + a, cy = minR + b;
  const a2 = a * a, b2 = b * b;
  // Scanline fill: for each row, find the x extent of the ellipse
  for (let py = minR; py <= maxR; py++) {
    const dy = py - cy;
    const xSpan = a * Math.sqrt(Math.max(0, 1 - (dy * dy) / b2));
    const x0 = Math.round(cx - xSpan);
    const x1 = Math.round(cx + xSpan);
    for (let px = x0; px <= x1; px++) callback(px, py);
  }
}

function fontDrawFilledCircle(c0, r0, c1, r1, isSet) {
  filledCircleCollect(c0, r0, c1, r1, (c, r) => {
    if (isSet) setFontPixel(c, r); else clearFontPixel(c, r);
  });
}

// Tool preview overlay — redraws preview then draws semi-transparent shape on top
function drawFontToolPreview(startCol, startRow, endCol, endRow) {
  // Redraw base preview to clear previous overlay
  if (isFzxMode) {
    if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
  } else {
    if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  }

  const ctx = dom.previewCanvas.getContext('2d');
  if (!ctx) return;

  // Right-click on line/pixel = clear (red); right-click on rect/circle = filled (green); eraser rect = red
  if (isRightButton) {
    ctx.fillStyle = (currentFontTool === FONT_TOOL.RECT || currentFontTool === FONT_TOOL.CIRCLE)
      ? 'rgba(50, 220, 100, 0.4)' : 'rgba(255, 80, 80, 0.45)';
  } else {
    ctx.fillStyle = 'rgba(255, 220, 50, 0.45)';
  }

  const filledRectCollect = (c0, r0, c1, r1, cb) => {
    const mnC = Math.min(c0, c1), mxC = Math.max(c0, c1);
    const mnR = Math.min(r0, r1), mxR = Math.max(r0, r1);
    for (let r = mnR; r <= mxR; r++) for (let c = mnC; c <= mxC; c++) cb(c, r);
  };

  let collector;
  if (currentFontTool === FONT_TOOL.ERASER) {
    collector = filledRectCollect;
  } else if (currentFontTool === FONT_TOOL.LINE) {
    collector = bresenhamCollect;
  } else if (currentFontTool === FONT_TOOL.RECT) {
    collector = isRightButton
      ? filledRectCollect
      : ((c0, r0, c1, r1, cb) => {
          bresenhamCollect(c0, r0, c1, r0, cb);
          bresenhamCollect(c1, r0, c1, r1, cb);
          bresenhamCollect(c1, r1, c0, r1, cb);
          bresenhamCollect(c0, r1, c0, r0, cb);
        });
  } else {
    collector = isRightButton ? filledCircleCollect : circleCollect;
  }

  if (isFzxMode && fzxFont && currentGlyphIndex !== null) {
    const scale = getFzxPreviewScale();
    const margins = getFzxPreviewMargins();
    collector(startCol, startRow, endCol, endRow, (c, r) => {
      ctx.fillRect(margins.left + c * scale, margins.top + r * scale, scale, scale);
    });
  } else {
    const scale = PREVIEW.SCALE;
    collector(startCol, startRow, endCol, endRow, (c, r) => {
      ctx.fillRect(c * scale, r * scale, scale, scale);
    });
  }
}

// --- Canvas pixel editing ---

function togglePixel(x, y) {
  if (currentGlyphIndex === null) return;
  if (!glyphData) return;
  const col = Math.floor(x / PREVIEW.SCALE);
  const row = Math.floor(y / PREVIEW.SCALE);
  if (col < 0 || col >= 8 || row < 0 || row >= 8) return;

  // Block editing outside active columns
  const active = getActiveColumns(currentGlyphIndex);
  if (!active.includes(col)) return;

  const wm = dom.fontWidthSelect.value;
  const isVar = wm === 'variable';

  // In variable width mode, row 0 is the width byte — not editable as pixels
  if (isVar && row === 0) return;

  const key = `${row},${col}`;
  if (toggledPixels.has(key)) return;
  toggledPixels.add(key);

  const bit = 1 << (7 - col);

  if (dom.wholeFontCheckbox.checked) {
    for (let g = 0; g < numGlyphs; g++) {
      if (isVar && row === 0) continue;
      if (isVar) {
        const gw = Math.min(Math.max(glyphData[g * FONT_CONST.BYTES_PER_GLYPH], 1), 8);
        const colStart = 8 - gw;
        if (col < colStart) continue;
      }
      glyphData[g * FONT_CONST.BYTES_PER_GLYPH + row] ^= bit;
    }
  } else {
    glyphData[currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH + row] ^= bit;
  }

  renderFontGrid();
  updatePreview(currentGlyphIndex);
}

dom.previewCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

dom.previewCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  if (currentGlyphIndex === null) return;
  if (isFzxMode) { if (!fzxFont) return; }
  else { if (!glyphData) return; }
  isRightButton = (e.button === 2);

  const coords = mouseToGridCoords(e.offsetX, e.offsetY);
  if (!coords) return;

  isDrawing = true;
  toggledPixels.clear();

  if (currentFontTool === FONT_TOOL.PIXEL) {
    pushUndo();
    if (isRightButton) {
      clearFontPixel(coords.col, coords.row);
      refreshPreview();
    } else {
      if (isFzxMode) toggleFzxPixel(e.offsetX, e.offsetY);
      else togglePixel(e.offsetX, e.offsetY);
    }
  } else if (currentFontTool === FONT_TOOL.ERASER) {
    if (isRightButton) {
      // Right-click eraser: rect-erase shape tool mode
      toolStartCol = coords.col;
      toolStartRow = coords.row;
    } else {
      pushUndo();
      clearFontPixel(coords.col, coords.row);
      lastEraserCol = coords.col;
      lastEraserRow = coords.row;
      refreshPreview();
    }
  } else {
    // Shape tools: record start, no undo yet
    toolStartCol = coords.col;
    toolStartRow = coords.row;
  }
});

dom.previewCanvas.addEventListener('mousemove', (e) => {
  const coords = mouseToGridCoords(e.offsetX, e.offsetY);
  if (!isDrawing) return;
  if (!coords) return;

  if (currentFontTool === FONT_TOOL.PIXEL) {
    if (isRightButton) {
      clearFontPixel(coords.col, coords.row);
      refreshPreview();
    } else {
      if (isFzxMode) toggleFzxPixel(e.offsetX, e.offsetY);
      else togglePixel(e.offsetX, e.offsetY);
    }
  } else if (currentFontTool === FONT_TOOL.ERASER && !isRightButton) {
    // Bresenham interpolation from last position for smooth erasing
    if (lastEraserCol >= 0 && lastEraserRow >= 0) {
      bresenhamCollect(lastEraserCol, lastEraserRow, coords.col, coords.row, (c, r) => {
        clearFontPixel(c, r);
      });
    } else {
      clearFontPixel(coords.col, coords.row);
    }
    lastEraserCol = coords.col;
    lastEraserRow = coords.row;
    refreshPreview();
  } else if (toolStartCol >= 0 && toolStartRow >= 0) {
    // Shape tool preview — use clamped coords so preview extends to grid edges
    const clamped = coords || clampToGridCoords(e.offsetX, e.offsetY);
    if (clamped) drawFontToolPreview(toolStartCol, toolStartRow, clamped.col, clamped.row);
  }
});

dom.previewCanvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  // Use clamped coords for shape tools so releasing at grid edge still commits
  const coords = mouseToGridCoords(e.offsetX, e.offsetY) || clampToGridCoords(e.offsetX, e.offsetY);

  if (toolStartCol >= 0 && toolStartRow >= 0 && coords) {
    if (currentFontTool === FONT_TOOL.ERASER && isRightButton) {
      pushUndo();
      fontDrawFilledRect(toolStartCol, toolStartRow, coords.col, coords.row, false);
      refreshPreview();
    } else if (currentFontTool === FONT_TOOL.LINE || currentFontTool === FONT_TOOL.RECT || currentFontTool === FONT_TOOL.CIRCLE) {
      pushUndo();
      if (currentFontTool === FONT_TOOL.LINE) {
        fontDrawLine(toolStartCol, toolStartRow, coords.col, coords.row, !isRightButton);
      } else if (currentFontTool === FONT_TOOL.RECT) {
        if (isRightButton) fontDrawFilledRect(toolStartCol, toolStartRow, coords.col, coords.row, true);
        else fontDrawRect(toolStartCol, toolStartRow, coords.col, coords.row, true);
      } else {
        if (isRightButton) fontDrawFilledCircle(toolStartCol, toolStartRow, coords.col, coords.row, true);
        else fontDrawCircle(toolStartCol, toolStartRow, coords.col, coords.row, true);
      }
      refreshPreview();
    }
  }

  isDrawing = false;
  isRightButton = false;
  toggledPixels.clear();
  toolStartCol = -1;
  toolStartRow = -1;
  lastEraserCol = -1;
  lastEraserRow = -1;
});

dom.previewCanvas.addEventListener('mouseleave', () => {
  if (isDrawing && (currentFontTool === FONT_TOOL.LINE || currentFontTool === FONT_TOOL.RECT || currentFontTool === FONT_TOOL.CIRCLE
      || (currentFontTool === FONT_TOOL.ERASER && isRightButton))) {
    // Cancel shape — redraw to remove preview
    if (isFzxMode) { if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex); }
    else { if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex); }
  }
  isDrawing = false;
  isRightButton = false;
  toggledPixels.clear();
  toolStartCol = -1;
  toolStartRow = -1;
  lastEraserCol = -1;
  lastEraserRow = -1;
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  // Undo/Redo (use e.code for layout-independent physical keys)
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (e.code === 'KeyZ') {
      if (e.shiftKey) { redo(); } else { undo(); }
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyY') {
      redo();
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyC') {
      if (currentGlyphIndex === null) return;
      if (isFzxMode && fzxFont) {
        const g = fzxFont.glyphs[currentGlyphIndex];
        if (g) glyphClipboard = { type: 'fzx', width: g.width, shift: g.shift, kern: g.kern, bitmap: g.bitmap.slice() };
      } else {
        if (glyphData) {
          const off = currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH;
          glyphClipboard = { type: 'fixed', bytes: glyphData.slice(off, off + FONT_CONST.BYTES_PER_GLYPH) };
        }
      }
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyV') {
      if (currentGlyphIndex === null || !glyphClipboard) return;
      pushUndo();
      if (isFzxMode && fzxFont) {
        const g = fzxFont.glyphs[currentGlyphIndex];
        if (!g) return;
        if (glyphClipboard.type === 'fzx') {
          g.width = glyphClipboard.width;
          g.shift = glyphClipboard.shift;
          g.kern = glyphClipboard.kern;
          g.bitmap = glyphClipboard.bitmap.slice();
        } else {
          // Paste fixed glyph into FZX: copy 8 bytes as 8-wide, height-row bitmap
          g.width = 8;
          g.shift = 0;
          g.kern = 0;
          const h = fzxFont.height;
          g.bitmap = new Uint8Array(h);
          const copyRows = Math.min(h, FONT_CONST.GLYPH_HEIGHT);
          for (let r = 0; r < copyRows; r++) g.bitmap[r] = glyphClipboard.bytes[r];
        }
        dom.fzxGlyphWidth.value = String(g.width);
        dom.fzxGlyphShift.value = String(g.shift);
        dom.fzxGlyphKern.value = String(g.kern);
        renderFzxGrid();
        updateFzxPreview(currentGlyphIndex);
      } else {
        if (!glyphData) return;
        const off = currentGlyphIndex * FONT_CONST.BYTES_PER_GLYPH;
        if (glyphClipboard.type === 'fixed') {
          glyphData.set(glyphClipboard.bytes, off);
        } else {
          // Paste FZX glyph into fixed: take first byte per row, clipped to 8 rows
          const bpr = glyphClipboard.width > 8 ? 2 : 1;
          const h = glyphClipboard.bitmap.length / bpr;
          for (let r = 0; r < FONT_CONST.GLYPH_HEIGHT; r++) {
            const srcRow = r - glyphClipboard.shift;
            glyphData[off + r] = (srcRow >= 0 && srcRow < h) ? glyphClipboard.bitmap[srcRow * bpr] : 0;
          }
        }
        renderFontGrid();
        updatePreview(currentGlyphIndex);
      }
      e.preventDefault();
      return;
    }
  }

  // Drawing tool shortcuts (no modifier keys)
  if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    switch (e.code) {
      case 'KeyP': setFontTool(FONT_TOOL.PIXEL); e.preventDefault(); return;
      case 'KeyL': setFontTool(FONT_TOOL.LINE); e.preventDefault(); return;
      case 'KeyR': setFontTool(FONT_TOOL.RECT); e.preventDefault(); return;
      case 'KeyO': setFontTool(FONT_TOOL.CIRCLE); e.preventDefault(); return;
      case 'KeyE': setFontTool(FONT_TOOL.ERASER); e.preventDefault(); return;
    }
  }

  // Arrow key glyph navigation
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const maxIndex = isFzxMode ? (fzxFont ? fzxFont.glyphs.length - 1 : -1) : (numGlyphs - 1);
    if (maxIndex < 0) return;
    let idx = currentGlyphIndex !== null ? currentGlyphIndex : 0;
    if (e.key === 'ArrowLeft') {
      idx = Math.max(0, idx - 1);
    } else if (e.key === 'ArrowRight') {
      idx = Math.min(maxIndex, idx + 1);
    } else {
      // Up/Down: find the visually closest glyph in the adjacent row
      const glyphs = /** @type {HTMLElement[]} */ ([...dom.grid.querySelectorAll('.glyph')]);
      const cur = glyphs[idx];
      if (cur) {
        const curRect = cur.getBoundingClientRect();
        const curCenterX = curRect.left + curRect.width / 2;
        const curTop = cur.offsetTop;
        // Find all distinct visual row tops
        const rowTops = [...new Set(glyphs.map(g => g.offsetTop))].sort((a, b) => a - b);
        const curRowIdx = rowTops.indexOf(curTop);
        const targetRowIdx = e.key === 'ArrowUp' ? curRowIdx - 1 : curRowIdx + 1;
        if (targetRowIdx >= 0 && targetRowIdx < rowTops.length) {
          const targetTop = rowTops[targetRowIdx];
          // Find the glyph in the target row closest to current horizontal center
          let bestIdx = idx, bestDist = Infinity;
          for (let g = 0; g < glyphs.length; g++) {
            if (glyphs[g].offsetTop !== targetTop) continue;
            const r = glyphs[g].getBoundingClientRect();
            const dist = Math.abs(r.left + r.width / 2 - curCenterX);
            if (dist < bestDist) { bestDist = dist; bestIdx = g; }
          }
          idx = bestIdx;
        }
      }
    }
    currentGlyphIndex = idx;
    document.querySelectorAll('.glyph').forEach(el => el.classList.remove('selected'));
    const sel = dom.grid.querySelector(`[data-glyph-index="${idx}"]`);
    if (sel) { sel.classList.add('selected'); sel.scrollIntoView({ block: 'nearest' }); }
    if (isFzxMode) updateFzxPreview(idx); else updatePreview(idx);
    e.preventDefault();
    return;
  }

  const whole = dom.wholeFontCheckbox.checked;

  if (isFzxMode) {
    switch (e.key.toLowerCase()) {
      case 'i':
        applyFzxTransform('invert', whole ? null : currentGlyphIndex);
        e.preventDefault();
        break;
      case 'delete':
        if (whole) { if (fzxFont && confirm('Clear all glyphs?')) applyFzxTransform('clear', null); }
        else applyFzxTransform('clear', currentGlyphIndex);
        e.preventDefault();
        break;
    }
  } else {
    switch (e.key.toLowerCase()) {
      case 'b':
        if (whole) applyGlyphTransform(glyphBoldRight, null);
        else if (currentGlyphIndex !== null) applyGlyphTransform(glyphBoldRight, currentGlyphIndex);
        e.preventDefault();
        break;
      case 'i':
        if (whole) { if (glyphData) applyGlyphTransform(glyphInvert, null); }
        else if (currentGlyphIndex !== null) applyGlyphTransform(glyphInvert, currentGlyphIndex);
        e.preventDefault();
        break;
      case 'delete':
        if (whole) { if (glyphData && confirm('Clear all glyphs?')) applyGlyphTransform(glyphClear, null); }
        else if (currentGlyphIndex !== null) applyGlyphTransform(glyphClear, currentGlyphIndex);
        e.preventDefault();
        break;
    }
  }
});

// --- Theme toggle ---

dom.themeToggleBtn.addEventListener('click', () => {
  const html = document.documentElement;
  const isCurrentlyDark = !html.hasAttribute('data-theme') || html.getAttribute('data-theme') !== 'light';

  if (isCurrentlyDark) {
    html.setAttribute('data-theme', 'light');
    localStorage.setItem('spectraLabTheme', 'light');
    dom.themeToggleBtn.innerHTML = '&#9788;';
  } else {
    html.removeAttribute('data-theme');
    localStorage.setItem('spectraLabTheme', 'dark');
    dom.themeToggleBtn.innerHTML = '&#9790;';
  }

  if (isFzxMode) {
    renderFzxGrid();
    if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
  } else {
    if (glyphData) renderFontGrid();
    if (currentGlyphIndex !== null) updatePreview(currentGlyphIndex);
  }
  if (currentGlyphIndex === null) {
    const ctx = dom.previewCanvas.getContext('2d');
    if (ctx) {
      const colors = getThemeColors();
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
    }
  }
});

// --- FZX property editors ---

dom.fzxHeight.addEventListener('change', () => {
  if (!fzxFont) return;
  const val = parseInt(dom.fzxHeight.value);
  if (isNaN(val) || val < 1 || val > 255) {
    dom.fzxHeight.value = String(fzxFont.height);
    return;
  }
  pushUndo();
  resizeFzxFontHeight(val);
  updatePreviewColumnWidth();
  renderFzxGrid();
  if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
});

dom.fzxTracking.addEventListener('change', () => {
  if (!fzxFont) return;
  const val = parseInt(dom.fzxTracking.value);
  if (isNaN(val) || val < -128 || val > 127) {
    dom.fzxTracking.value = String(fzxFont.tracking);
    return;
  }
  pushUndo();
  fzxFont.tracking = val;
  renderTextSample();
  if (currentGlyphIndex !== null) updateFzxPreview(currentGlyphIndex);
});

dom.fzxGlyphWidth.addEventListener('change', () => {
  if (!fzxFont || currentGlyphIndex === null) return;
  const val = parseInt(dom.fzxGlyphWidth.value);
  if (isNaN(val) || val < 1 || val > 16) {
    dom.fzxGlyphWidth.value = String(fzxFont.glyphs[currentGlyphIndex].width);
    return;
  }
  pushUndo();
  resizeFzxGlyphWidth(currentGlyphIndex, val);
  renderFzxGrid();
  updateFzxPreview(currentGlyphIndex);
});

dom.fzxGlyphShift.addEventListener('change', () => {
  if (!fzxFont || currentGlyphIndex === null) return;
  const val = parseInt(dom.fzxGlyphShift.value);
  if (isNaN(val) || val < 0 || val > 15 || val >= fzxFont.height) {
    dom.fzxGlyphShift.value = String(fzxFont.glyphs[currentGlyphIndex].shift);
    return;
  }
  pushUndo();
  const g = fzxFont.glyphs[currentGlyphIndex];
  const oldShift = g.shift;
  if (val !== oldShift) {
    const bpr = g.width > 8 ? 2 : 1;
    const newBitmap = new Uint8Array(fzxFont.height * bpr);
    // Move bitmap data: rows [oldShift..height-1] → [val..val+(height-oldShift)-1]
    const srcStart = oldShift * bpr;
    const dstStart = val * bpr;
    const srcRows = fzxFont.height - oldShift;
    const dstRows = fzxFont.height - val;
    const copyRows = Math.min(srcRows, dstRows);
    for (let i = 0; i < copyRows * bpr; i++) {
      newBitmap[dstStart + i] = g.bitmap[srcStart + i];
    }
    g.bitmap = newBitmap;
    g.shift = val;
  }
  renderFzxGrid();
  updateFzxPreview(currentGlyphIndex);
});

dom.fzxGlyphKern.addEventListener('change', () => {
  if (!fzxFont || currentGlyphIndex === null) return;
  const val = parseInt(dom.fzxGlyphKern.value);
  if (isNaN(val) || val < 0 || val > 3) {
    dom.fzxGlyphKern.value = String(fzxFont.glyphs[currentGlyphIndex].kern);
    return;
  }
  pushUndo();
  fzxFont.glyphs[currentGlyphIndex].kern = val;
  renderFzxGrid();
  updateFzxPreview(currentGlyphIndex);
});

dom.newFzxBtn.addEventListener('click', () => {
  createNewFzxFont();
});

// --- Text sample controls ---

dom.textSampleZoom.addEventListener('change', () => { renderTextSample(); });
dom.textSampleGrid.addEventListener('change', () => { renderTextSample(); });
dom.textSampleUppercase.addEventListener('change', () => { renderTextSample(); });
dom.textSampleTimex.addEventListener('change', () => { renderTextSample(); });
window.addEventListener('resize', () => { renderTextSample(); });

// --- Help ---

dom.helpBtn.addEventListener('click', () => {
  alert(`Font Editor - Keyboard Shortcuts\n\nCtrl+Z : Undo\nCtrl+Y / Ctrl+Shift+Z : Redo\nCtrl+C : Copy glyph\nCtrl+V : Paste glyph\nB : Bold right\nI : Invert\nDelete : Clear glyph\nArrow keys : Navigate glyphs\n\nDrawing Tools:\n  P : Pixel (toggle)\n  L : Line\n  R : Rectangle\n  O : Circle/Ellipse\n  E : Eraser\n\nMouse:\n  Click glyph in grid: Select\n  Pixel/Eraser: Click/drag to draw\n  Line/Rect/Circle: Drag to preview, release to commit\n  Leave canvas: Cancel shape\n\nUse "Whole font" checkbox to apply to all glyphs.\nCopy/paste works across fixed and FZX fonts.`);
});

// ============================================================================
// Text sample
// ============================================================================

const TEXT_SAMPLE_LINES = [
  'The quick brown fox jumps over the lazy dog',
  'Pack my box with five dozen liquor jugs',
  'Grumpy wizards make toxic brew for the evil queen and jack'
];

function renderTextSample() {
  const canvas = dom.textSampleCanvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const colors = getThemeColors();
  const scale = parseInt(dom.textSampleZoom.value) || 2;
  const showGrid = dom.textSampleGrid.checked;
  const timex = dom.textSampleTimex.checked;
  const lineGap = 2; // pixels between lines (unscaled)

  // Timex hi-res: 512x192 — pixels are half-width (2:1 aspect)
  const hScale = timex ? scale / 2 : scale;
  const vScale = scale;
  const hPixel = showGrid && scale > 1 ? hScale - (timex ? 0.5 : 1) : hScale;
  const vPixel = showGrid && scale > 1 ? vScale - 1 : vScale;
  const uppercase = dom.textSampleUppercase.checked;
  const lines = uppercase ? TEXT_SAMPLE_LINES.map(l => l.toUpperCase()) : TEXT_SAMPLE_LINES;

  // Available width in CSS pixels from the parent container
  const container = canvas.parentElement;
  const availableWidth = container ? container.clientWidth : 400;

  // Max width in font-pixels that fits the container
  const maxW = Math.max(Math.floor(availableWidth / hScale), 1);

  if (isFzxMode && fzxFont) {
    // --- FZX proportional rendering (character-wrapped) ---
    const h = fzxFont.height;

    // Build wrapped lines: each source line wraps independently
    /** @type {Array<Array<{ch: string, code: number, gi: number, w: number}>>} */
    const wrappedLines = [];

    for (let li = 0; li < lines.length; li++) {
      const srcLine = lines[li];
      let curLine = [];
      let curX = 0;

      for (let c = 0; c < srcLine.length; c++) {
        const code = srcLine.charCodeAt(c);
        const gi = code - 32;
        let gw = 4; // fallback for unknown glyphs
        let kern = 0;
        if (gi >= 0 && gi < fzxFont.glyphs.length) {
          const g = fzxFont.glyphs[gi];
          kern = g.kern;
          gw = g.width + fzxFont.tracking;
        }
        const advance = gw - kern;
        if (curLine.length > 0 && curX + advance > maxW) {
          wrappedLines.push(curLine);
          curLine = [];
          curX = 0;
        }
        curLine.push({ ch: srcLine[c], code, gi, w: gw });
        curX += advance;
      }
      if (curLine.length > 0) wrappedLines.push(curLine);
    }

    const totalH = wrappedLines.length * h + (wrappedLines.length - 1) * lineGap;

    const cw = availableWidth;
    const ch = totalH * vScale;
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, cw, ch);

    for (let li = 0; li < wrappedLines.length; li++) {
      const line = wrappedLines[li];
      let drawX = 0;
      const baseY = li * (h + lineGap);

      for (let i = 0; i < line.length; i++) {
        const { gi } = line[i];
        if (gi < 0 || gi >= fzxFont.glyphs.length) { drawX += 4; continue; }
        const g = fzxFont.glyphs[gi];
        const bytesPerRow = g.width > 8 ? 2 : 1;

        drawX -= g.kern;

        for (let row = 0; row < h; row++) {
          for (let col = 0; col < g.width; col++) {
            const byteIdx = row * bytesPerRow + Math.floor(col / 8);
            const bit = 7 - (col % 8);
            if (byteIdx < g.bitmap.length && (g.bitmap[byteIdx] >> bit) & 1) {
              ctx.fillStyle = colors.foreground;
              ctx.fillRect((drawX + col) * hScale, (baseY + row) * vScale, hPixel, vPixel);
            }
          }
        }
        drawX += g.width + fzxFont.tracking;
      }
    }
  } else if (glyphData) {
    // --- Fixed-width rendering (character-wrapped) ---
    const wm = dom.fontWidthSelect.value;
    const isVariable = wm === 'variable';
    let charW = 8;
    let colStart = 0;
    if (wm === '6-high') { charW = 6; colStart = 0; }
    else if (wm === '6-low') { charW = 6; colStart = 2; }
    else if (wm === '4-high') { charW = 4; colStart = 0; }
    else if (wm === '4-low') { charW = 4; colStart = 4; }
    const hideW = isVariable && dom.hideWidthByte.checked;
    const h = hideW ? FONT_CONST.GLYPH_HEIGHT - 1 : FONT_CONST.GLYPH_HEIGHT;
    const rowStart = hideW ? 1 : 0;

    function getGlyphWidth(code) {
      if (!isVariable) return charW;
      if (code < 0 || code >= numGlyphs) return charW;
      const w = glyphData[code * FONT_CONST.BYTES_PER_GLYPH];
      return Math.min(Math.max(w, 1), 8);
    }
    function resolveCode(ch) {
      const c = charRemap[ch] || ch;
      const mapping = charToGlyphIndex[c];
      if (mapping) return mapping.glyph;
      return c.charCodeAt(0);
    }

    // Build wrapped lines: each source line wraps independently
    /** @type {Array<Array<{code: number, gw: number}>>} */
    const wrappedLines = [];

    for (let li = 0; li < lines.length; li++) {
      const srcLine = lines[li];
      let curLine = [];
      let curX = 0;

      for (let c = 0; c < srcLine.length; c++) {
        const code = resolveCode(srcLine[c]);
        const gw = getGlyphWidth(code);
        if (curLine.length > 0 && curX + gw > maxW) {
          wrappedLines.push(curLine);
          curLine = [];
          curX = 0;
        }
        curLine.push({ code, gw });
        curX += gw;
      }
      if (curLine.length > 0) wrappedLines.push(curLine);
    }

    const totalH = wrappedLines.length * h + (wrappedLines.length - 1) * lineGap;

    const cw = availableWidth;
    const ch = totalH * vScale;
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, cw, ch);

    for (let li = 0; li < wrappedLines.length; li++) {
      const line = wrappedLines[li];
      const baseY = li * (h + lineGap);
      let drawX = 0;

      for (let i = 0; i < line.length; i++) {
        const { code, gw } = line[i];
        if (code < 0 || code >= numGlyphs) { drawX += charW; continue; }
        const offset = code * FONT_CONST.BYTES_PER_GLYPH;

        const cs = isVariable ? (8 - gw) : colStart;

        for (let row = 0; row < h; row++) {
          const byte = glyphData[offset + rowStart + row];
          for (let col = 0; col < gw; col++) {
            const srcCol = cs + col;
            if ((byte >> (7 - srcCol)) & 1) {
              ctx.fillStyle = colors.foreground;
              ctx.fillRect((drawX + col) * hScale, (baseY + row) * vScale, hPixel, vPixel);
            }
          }
        }
        drawX += gw;
      }
    }
  } else {
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = '0';
    canvas.style.height = '0';
    return;
  }
}

// ============================================================================
// Init
// ============================================================================

(function init() {
  // Apply saved theme
  const theme = localStorage.getItem('spectraLabTheme');
  if (theme === 'light') {
    dom.themeToggleBtn.innerHTML = '&#9788;';
  } else {
    dom.themeToggleBtn.innerHTML = '&#9790;';
  }

  // Start with empty 96-glyph font, then try to load ROM font
  numGlyphs = 96;
  glyphData = new Uint8Array(FONT_CONST.SIZE_96_BYTES);
  const defaultMapping = createDefaultMapping(numGlyphs);
  applyMapping(defaultMapping);
  updatePreviewColumnWidth();
  renderFontGrid();

  // Try to load ROM font from fonts directory
  fetch('fonts/rom_font.bin')
    .then(resp => { if (!resp.ok) throw new Error(resp.status); return resp.arrayBuffer(); })
    .then(buf => {
      const bytes = new Uint8Array(buf);
      if (bytes.length === 0 || bytes.length % FONT_CONST.BYTES_PER_GLYPH !== 0) return;
      numGlyphs = bytes.length / FONT_CONST.BYTES_PER_GLYPH;
      glyphData = bytes;
      isExploded = false;
      const mapping = createDefaultMapping(numGlyphs);
      applyMapping(mapping);
      updateFileDisplay('rom_font.bin');
      renderFontGrid();
    })
    .catch(() => { /* ROM font not available — keep empty 96-glyph font */ });
})();
