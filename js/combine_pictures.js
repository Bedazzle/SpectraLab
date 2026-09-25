// SpectraLab - Combine pictures into one chr$
// @ts-check
"use strict";

// ============================================================================
// Combine Pictures
// ============================================================================
// Joins several open pictures into one larger chr$ image.
//
// This is a LOSSLESS operation: the layout is expressed in 8x8 character cells
// and each cell is copied byte-for-byte (8 bitmap bytes + 1 attribute byte), so
// nothing is re-quantized, re-dithered or re-paletted. That is only possible
// while every source shares chr$'s own colour model, which for now means plain
// 256x192 .scr with 8x8 attributes and no ULA+ palette. Anything else is
// listed but refused — the user converts it first.
//
// Sources that overhang the canvas are clipped at its edge, which covers the
// common "fill an odd canvas size from standard screens" case without needing a
// per-source crop rectangle.

/** Cell size — chr$ stores one attribute byte per 8x8 cell and nothing else. */
const COMBINE_CELL = 8;

/** chr$ header stores widthCells / heightCells in one byte each. */
const COMBINE_MAX_CELLS = 255;

/**
 * @typedef {Object} CombineSource
 * @property {number} index      - index into openPictures
 * @property {string} fileName
 * @property {boolean} supported
 * @property {string} reason     - why it is unsupported (empty when supported)
 * @property {number} cols       - source width in cells
 * @property {number} rows       - source height in cells
 * @property {boolean} included  - checkbox state
 * @property {number} dstCol     - destination column in cells
 * @property {number} dstRow     - destination row in cells
 */

/** @type {CombineSource[]} */
let combineSources = [];

/** @type {{cols:number, rows:number}} */
let combineCanvas = { cols: 0, rows: 0 };

/**
 * How many pictures per row. 0 = pick automatically (roughly square).
 * This is the only layout control: 1 stacks them, N puts them side by side.
 */
let combineGridCols = 0;

/** Attribute byte used for cells no source covers. */
let combineFillAttr = 0x07; // white ink on black paper

/**
 * Describes why a picture cannot take part in a combine, or '' when it can.
 * Only plain .scr qualifies for now — see the header comment.
 * @param {any} p - an openPictures entry
 * @returns {string} reason, or '' when supported
 */
function combineUnsupportedReason(p) {
  if (!p.picture) return 'no picture data';
  if (p.format !== FORMAT.SCR) return 'not a plain .scr (' + p.format + ')';
  if (p.ulaPlusPalette) return 'has a ULA+ palette';
  if (p.picture.palette) return 'has a palette';
  if (p.picture.colorMode !== 'standard') return p.picture.colorMode + ' colour mode';
  if (p.picture.planeCount !== 1) return 'multiple planes';
  if (p.picture.attrCellHeight !== COMBINE_CELL) return p.picture.attrCellHeight + '-line attributes';
  return '';
}

/**
 * Rebuilds the source list from the currently open pictures.
 */
function refreshCombineSources() {
  combineSources = [];
  if (typeof openPictures === 'undefined') return;
  openPictures.forEach((p, i) => {
    const reason = combineUnsupportedReason(p);
    const pic = p.picture;
    combineSources.push({
      index: i,
      fileName: p.fileName,
      supported: reason === '',
      reason: reason,
      cols: pic ? pic.cols : 0,
      rows: pic ? Math.ceil(pic.height / COMBINE_CELL) : 0,
      included: reason === '',
      dstCol: 0,
      dstRow: 0
    });
  });
}

/**
 * Returns the sources taking part in the combine, in list order.
 * @returns {CombineSource[]}
 */
function combineIncluded() {
  return combineSources.filter(s => s.supported && s.included);
}

/**
 * Lays the included sources out according to the current arrangement and
 * resizes the canvas to fit. 'custom' leaves positions alone and only grows the
 * canvas to the bounding box.
 */
function applyCombineLayout() {
  const list = combineIncluded();
  if (list.length === 0) {
    combineCanvas = { cols: 0, rows: 0 };
    return;
  }

  // Every slot is as big as the largest source, so mixed sizes stay aligned
  // instead of drifting out of step row by row.
  const slotW = list.reduce((m, s) => Math.max(m, s.cols), 0);
  const slotH = list.reduce((m, s) => Math.max(m, s.rows), 0);
  const cols = combineGridCols > 0 ? combineGridCols : Math.ceil(Math.sqrt(list.length));
  const rows = Math.ceil(list.length / cols);

  list.forEach((s, i) => {
    s.dstCol = (i % cols) * slotW;
    s.dstRow = Math.floor(i / cols) * slotH;
  });
  combineCanvas = { cols: cols * slotW, rows: rows * slotH };
}

/**
 * Keeps the column input in step with the automatic default.
 */
function syncCombineGridUI() {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('combineGridCols'));
  if (!inp) return;
  const n = combineIncluded().length;
  inp.value = String(combineGridCols > 0 ? combineGridCols : Math.ceil(Math.sqrt(n || 1)));
  inp.max = String(Math.max(1, n));
}

/**
 * Builds the combined picture.
 * Cells are copied verbatim; cells no source covers keep the fill attribute and
 * an empty bitmap. Sources are drawn in list order, so a later one wins on
 * overlap.
 * @returns {{picture:any, screenData:Uint8Array, covered:Uint8Array}|null}
 */
function buildCombinedPicture() {
  const list = combineIncluded();
  if (list.length === 0) return null;
  const dCols = combineCanvas.cols;
  const dRows = combineCanvas.rows;
  if (dCols <= 0 || dRows <= 0) return null;

  const width = dCols * COMBINE_CELL;
  const height = dRows * COMBINE_CELL;
  const bitmapSize = dCols * height;
  const attrSize = dCols * dRows;

  const bitmap = new Uint8Array(bitmapSize);
  const attrs = new Uint8Array(attrSize);
  attrs.fill(combineFillAttr);

  /** Tracks which cells a source actually covered, for the preview. */
  const covered = new Uint8Array(attrSize);

  list.forEach((s) => {
    const src = openPictures[s.index].picture;
    const sCols = src.cols;
    const sBitmap = src.planes[0].bitmap;
    const sAttrs = src.planes[0].attrs;

    for (let r = 0; r < s.rows; r++) {
      const tr = s.dstRow + r;
      if (tr < 0 || tr >= dRows) continue;
      for (let c = 0; c < sCols; c++) {
        const tc = s.dstCol + c;
        if (tc < 0 || tc >= dCols) continue;
        for (let line = 0; line < COMBINE_CELL; line++) {
          bitmap[(tr * COMBINE_CELL + line) * dCols + tc] =
            sBitmap[(r * COMBINE_CELL + line) * sCols + c];
        }
        attrs[tr * dCols + tc] = sAttrs[r * sCols + c];
        covered[tr * dCols + tc] = 1;
      }
    }
  });

  // screenData for chr$ is the linear [bitmap][attrs] layout loadChrFile produces
  const screenData = new Uint8Array(bitmapSize + attrSize);
  screenData.set(bitmap, 0);
  screenData.set(attrs, bitmapSize);

  const picture = importZxp(bitmap, attrs, 'combined.ch$', width, height, COMBINE_CELL, null);
  if (picture) picture.sourceFormat = 'ch$';

  return { picture, screenData, covered };
}

// ============================================================================
// "Open separately or combine?" branch for multi-file open
// ============================================================================
// Asked only when every selected file is a plain .scr and there are at least
// two of them — that is exactly the set Combine can currently handle, so the
// question is never a dead end. Anything else opens the way it always did.

/** @type {File[]|null} Files waiting on the user's answer. */
let pendingCombineFiles = null;

/**
 * The single-file loader, handed in by handleOpenFiles() because it lives in
 * initScreenViewerUI()'s scope and is not a global.
 * @type {((file: File) => void)|null}
 */
let pendingCombineOpener = null;

/**
 * True when this selection should prompt.
 * @param {File[]} files
 * @returns {boolean}
 */
function shouldAskAboutCombine(files) {
  if (!files || files.length < 2) return false;
  return files.every(f => /\.scr$/i.test(f.name));
}

/**
 * Shows the open-or-combine prompt. The caller opens nothing; whichever button
 * is pressed does it.
 * @param {File[]} files
 * @param {(file: File) => void} opener
 */
function askAboutCombine(files, opener) {
  pendingCombineFiles = files;
  pendingCombineOpener = opener;
  const countEl = document.getElementById('combineAskCount');
  if (countEl) countEl.textContent = String(files.length);
  const dlg = document.getElementById('combineAskDialog');
  if (dlg) dlg.style.display = 'flex';
}

/**
 * Opens the pending files normally, without combining.
 */
function combineAskOpenSeparately() {
  const files = pendingCombineFiles || [];
  pendingCombineFiles = null;
  const dlg = document.getElementById('combineAskDialog');
  if (dlg) dlg.style.display = 'none';
  files.forEach(f => openSingleFileForCombine(f));
}

/**
 * Opens the pending files, then opens the Combine dialog once they have landed.
 * The loaders are FileReader-based with no completion callback, so this waits
 * for openPictures to grow by the expected amount, giving up after a few
 * seconds and opening with whatever arrived.
 */
function combineAskCombine() {
  const files = pendingCombineFiles || [];
  pendingCombineFiles = null;
  const dlg = document.getElementById('combineAskDialog');
  if (dlg) dlg.style.display = 'none';
  if (files.length === 0) return;

  const want = openPictures.length + files.length;
  files.forEach(f => openSingleFileForCombine(f));

  const deadline = Date.now() + 5000;
  const wait = () => {
    if (openPictures.length >= want || Date.now() > deadline) {
      openCombineDialog();
      return;
    }
    setTimeout(wait, 50);
  };
  setTimeout(wait, 50);
}

/**
 * Routes one file through the loader handleOpenFiles() handed us.
 * @param {File} file
 */
function openSingleFileForCombine(file) {
  if (pendingCombineOpener) pendingCombineOpener(file);
}

/**
 * Entry point used by handleOpenFiles(). Returns true when the prompt was shown
 * and the caller must not open anything itself.
 * @param {File[]} files
 * @param {(file: File) => void} opener - the caller's single-file loader
 * @returns {boolean}
 */
function maybeAskAboutCombine(files, opener) {
  if (!shouldAskAboutCombine(files)) return false;
  askAboutCombine(files, opener);
  return true;
}

// ============================================================================
// Dialog
// ============================================================================

/**
 * Moves a source within the list. Order is what the grid lays out, so this is
 * how the user decides which picture goes where.
 * @param {number} from
 * @param {number} to
 */
function moveCombineSource(from, to) {
  if (from < 0 || from >= combineSources.length) return;
  if (to < 0 || to >= combineSources.length) return;
  const moved = combineSources.splice(from, 1)[0];
  combineSources.splice(to, 0, moved);
  applyCombineLayout();
  updateCombineUI();
}

/**
 * Builds one move-up / move-down button.
 * @param {string} glyph
 * @param {string} title
 * @param {boolean} disabled
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function makeCombineMoveButton(glyph, title, disabled, onClick) {
  const b = document.createElement('button');
  b.className = 'combine-move';
  b.textContent = glyph;
  b.title = title;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Renders the source rows.
 */
function renderCombineList() {
  const host = document.getElementById('combineList');
  if (!host) return;
  host.innerHTML = '';

  if (combineSources.length === 0) {
    host.innerHTML = '<div class="combine-empty">No pictures are open.</div>';
    return;
  }

  combineSources.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'combine-row' + (s.supported ? '' : ' combine-row-bad');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = s.included && s.supported;
    cb.disabled = !s.supported;
    cb.addEventListener('change', () => {
      combineSources[i].included = cb.checked;
      applyCombineLayout();
      updateCombineUI();
    });
    row.appendChild(cb);

    const name = document.createElement('span');
    name.className = 'combine-name';
    name.textContent = s.fileName;
    name.title = s.fileName;
    row.appendChild(name);

    if (!s.supported) {
      const why = document.createElement('span');
      why.className = 'combine-why';
      why.textContent = 'not supported — ' + s.reason;
      row.appendChild(why);
    }

    row.appendChild(makeCombineMoveButton('▲', 'Move up', i === 0,
      () => { moveCombineSource(i, i - 1); }));
    row.appendChild(makeCombineMoveButton('▼', 'Move down', i === combineSources.length - 1,
      () => { moveCombineSource(i, i + 1); }));

    host.appendChild(row);
  });
}

/**
 * Draws the layout preview, showing uncovered cells as a checkerboard.
 * @param {{picture:any, covered:Uint8Array}|null} built
 */
function renderCombinePreview(built) {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('combinePreview'));
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (!built || !built.picture) {
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = '0';
    return;
  }

  const pic = built.picture;
  const w = pic.width;
  const h = pic.height;
  canvas.width = w;
  canvas.height = h;

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const cols = pic.cols;
  const bitmap = pic.planes[0].bitmap;
  const attrs = pic.planes[0].attrs;

  for (let y = 0; y < h; y++) {
    const cellRow = (y / COMBINE_CELL) | 0;
    for (let x = 0; x < w; x++) {
      const cellCol = (x / COMBINE_CELL) | 0;
      const cellIdx = cellRow * cols + cellCol;
      const attr = attrs[cellIdx];
      const bit = (bitmap[y * cols + cellCol] >> (7 - (x & 7))) & 1;
      let rgb;
      if (!built.covered[cellIdx]) {
        // Uncovered: checkerboard so gaps are obvious before export
        const chk = (((x >> 2) + (y >> 2)) & 1) ? 100 : 70;
        rgb = [chk, chk, chk];
      } else {
        const pal = ATTR.bright(attr) ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
        rgb = bit ? pal[ATTR.ink(attr)] : pal[ATTR.paper(attr)];
      }
      const o = (y * w + x) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Fit inside the preview box, never magnifying past 1:1
  const box = 300;
  const scale = Math.min(1, box / w, 150 / h);
  canvas.style.width = Math.max(1, Math.round(w * scale)) + 'px';
  canvas.style.height = Math.max(1, Math.round(h * scale)) + 'px';
}

/**
 * Recomputes derived state and refreshes every part of the dialog.
 */
function updateCombineUI() {
  renderCombineList();
  syncCombineGridUI();

  const list = combineIncluded();
  const info = document.getElementById('combineOutputInfo');
  const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('combineOkBtn'));
  const warn = document.getElementById('combineWarning');

  let built = null;
  let problem = '';

  if (list.length === 0) {
    problem = 'Select at least one picture.';
  } else if (combineCanvas.cols > COMBINE_MAX_CELLS || combineCanvas.rows > COMBINE_MAX_CELLS) {
    problem = 'Too large: chr$ allows at most ' + (COMBINE_MAX_CELLS * 8) + ' pixels per side.';
  } else {
    built = buildCombinedPicture();
  }

  renderCombinePreview(built);

  if (info) {
    if (built) {
      const cells = combineCanvas.cols * combineCanvas.rows;
      let uncovered = 0;
      for (let i = 0; i < built.covered.length; i++) if (!built.covered[i]) uncovered++;
      info.textContent = 'chr$ ' + (combineCanvas.cols * 8) + '×' + (combineCanvas.rows * 8) +
        ' — ' + (7 + cells * 9) + ' bytes' +
        (uncovered ? ' — ' + uncovered + ' cell(s) filled' : '');
    } else {
      info.textContent = '—';
    }
  }

  if (warn) {
    warn.textContent = problem;
    warn.style.display = problem ? 'block' : 'none';
  }
  if (okBtn) okBtn.disabled = !built;
}

/**
 * Opens the Combine Pictures dialog.
 */
function openCombineDialog() {
  const dlg = document.getElementById('combineDialog');
  if (!dlg) return;
  if (typeof saveCurrentPictureState === 'function') saveCurrentPictureState();
  refreshCombineSources();
  combineGridCols = 0;
  applyCombineLayout();
  syncCombineFillUI();
  updateCombineUI();
  dlg.style.display = 'flex';
}

/**
 * Closes the dialog.
 */
function closeCombineDialog() {
  const dlg = document.getElementById('combineDialog');
  if (dlg) dlg.style.display = 'none';
}

/**
 * Pushes the fill attribute into its two selects.
 */
function syncCombineFillUI() {
  const ink = /** @type {HTMLSelectElement|null} */ (document.getElementById('combineFillInk'));
  const paper = /** @type {HTMLSelectElement|null} */ (document.getElementById('combineFillPaper'));
  if (ink) ink.value = String(ATTR.ink(combineFillAttr));
  if (paper) paper.value = String(ATTR.paper(combineFillAttr));
}

/**
 * Creates the combined picture and opens it as a new chr$ tab.
 */
function doCombine() {
  // Build first — this is the last point the sources are still needed
  const built = buildCombinedPicture();
  if (!built || !built.picture) return;

  const closeBox = /** @type {HTMLInputElement|null} */ (document.getElementById('combineCloseSources'));
  if (!closeBox || closeBox.checked) {
    // Descending, so each splice leaves the lower indices valid. Closing before
    // adding also frees picture slots, so combining a full set still fits.
    combineIncluded()
      .map(s => s.index)
      .sort((a, b) => b - a)
      .forEach((i) => { closePicture(i); });
  }

  const name = 'combined.ch$';
  if (typeof addPicture === 'function') {
    const idx = addPicture(name, FORMAT.CHR, built.screenData, built.picture, false);
    if (idx < 0) return; // addPicture already explained why
  }
  closeCombineDialog();
}

/**
 * Wires the Combine button and dialog.
 */
function initCombineDialog() {
  document.getElementById('combineBtn')?.addEventListener('click', openCombineDialog);
  document.getElementById('combineCloseBtn')?.addEventListener('click', closeCombineDialog);
  document.getElementById('combineCancelBtn')?.addEventListener('click', closeCombineDialog);
  document.getElementById('combineOkBtn')?.addEventListener('click', doCombine);

  document.getElementById('combineGridCols')?.addEventListener('change', (e) => {
    const inp = /** @type {HTMLInputElement} */ (e.target);
    const v = parseInt(inp.value, 10);
    combineGridCols = (isNaN(v) || v < 1) ? 0 : v;
    applyCombineLayout();
    updateCombineUI();
  });

  const onFill = () => {
    const ink = /** @type {HTMLSelectElement|null} */ (document.getElementById('combineFillInk'));
    const paper = /** @type {HTMLSelectElement|null} */ (document.getElementById('combineFillPaper'));
    combineFillAttr = ATTR.make(
      ink ? parseInt(ink.value, 10) : 7,
      paper ? parseInt(paper.value, 10) : 0,
      false, false);
    updateCombineUI();
  };
  document.getElementById('combineFillInk')?.addEventListener('change', onFill);
  document.getElementById('combineFillPaper')?.addEventListener('change', onFill);

  document.getElementById('combineDialog')?.addEventListener('mousedown', (event) => {
    if (event.target === document.getElementById('combineDialog')) closeCombineDialog();
  });

  document.getElementById('combineAskSeparateBtn')?.addEventListener('click', combineAskOpenSeparately);
  document.getElementById('combineAskCombineBtn')?.addEventListener('click', combineAskCombine);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCombineDialog);
} else {
  initCombineDialog();
}
