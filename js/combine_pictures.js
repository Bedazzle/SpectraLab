// SpectraLab - Combine pictures into one chr$
// @ts-check
"use strict";

// ============================================================================
// Combine Pictures
// ============================================================================
// Joins several open pictures into one. Three outputs, chosen in the dialog:
//
//   mosaic     - lay them out side by side as one larger chr$ image
//   gigascreen - two screens become the two alternating .img frames
//   rgb3       - three screens become the red, green and blue bitplanes of a .3
//
// The two multi-plane outputs are the reason this exists at all: a Gigascreen or
// RGB3 picture is literally several standard screens stacked in one file, but
// until now there was no way to feed it the screens, only to draw one from
// scratch or import a raster image.
//
// Mosaic notes follow.
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

/** What the dialog produces. */
const COMBINE_MODE = {
  MOSAIC: 'mosaic',
  GIGASCREEN: 'gigascreen',
  RGB3: 'rgb3'
};

/**
 * How many sources each output needs. 0 means any number, which is only the
 * mosaic -- the plane count of .img and .3 is fixed by the format.
 * @type {Object<string, number>}
 */
const COMBINE_MODE_PLANES = {
  mosaic: 0,
  gigascreen: 2,
  rgb3: 3
};

/** What each source becomes, in list order, for the plane-per-screen outputs. */
const COMBINE_MODE_ROLES = {
  gigascreen: ['Frame 1', 'Frame 2'],
  rgb3: ['Red', 'Green', 'Blue']
};

/**
 * Chip colours for the outputs whose planes are colours in their own right.
 * Gigascreen frames are not, so they keep the default.
 */
const COMBINE_ROLE_TINTS = {
  // Lifted off the pure ZX primaries: #0000ff on the dark theme is barely
  // legible, and these still read as red / green / blue at chip size.
  rgb3: ['#ff5555', '#44cc44', '#5599ff']
};

/** One line of explanation per output. */
const COMBINE_MODE_HINTS = {
  mosaic: 'Joins open pictures into one chr$, copying cells unchanged.',
  gigascreen: 'Two screens become the two frames the Gigascreen alternates between. ' +
    'Both are copied whole \u2014 bitmap and attributes.',
  rgb3: 'Three screens become the red, green and blue bitplanes. RGB3 has no ' +
    'attributes, so only the bitmap of each screen is used.'
};

/** The selected output. */
let combineMode = COMBINE_MODE.MOSAIC;

/** A plane-per-screen output needs sources the size of a standard screen. */
const COMBINE_PLANE_WIDTH = 256;
const COMBINE_PLANE_HEIGHT = 192;

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
 * Only plain .scr qualifies for now — see the header comment. The
 * plane-per-screen outputs additionally need the standard 256x192, since .img
 * and .3 have no way to record any other size.
 * @param {any} p - an openPictures entry
 * @param {string} [mode] - which output to judge against; the selected one by default
 * @returns {string} reason, or '' when supported
 */
function combineUnsupportedReason(p, mode) {
  if (!p.picture) return 'no picture data';
  if (p.format !== FORMAT.SCR) return 'not a plain .scr (' + p.format + ')';
  if (p.ulaPlusPalette) return 'has a ULA+ palette';
  if (p.picture.palette) return 'has a palette';
  if (p.picture.colorMode !== 'standard') return p.picture.colorMode + ' colour mode';
  if (p.picture.planeCount !== 1) return 'multiple planes';
  if (p.picture.attrCellHeight !== COMBINE_CELL) return p.picture.attrCellHeight + '-line attributes';
  if (COMBINE_MODE_PLANES[mode || combineMode] > 0 &&
      (p.picture.width !== COMBINE_PLANE_WIDTH || p.picture.height !== COMBINE_PLANE_HEIGHT)) {
    return p.picture.width + 'x' + p.picture.height + ', not a full screen';
  }
  return '';
}

/**
 * How many open pictures a given output could take. Counts straight from
 * openPictures rather than the list, so it answers for outputs other than the
 * selected one.
 * @param {string} mode
 * @returns {number}
 */
function combineUsableCount(mode) {
  if (typeof openPictures === 'undefined') return 0;
  let n = 0;
  openPictures.forEach((p) => { if (combineUnsupportedReason(p, mode) === '') n++; });
  return n;
}

/**
 * Re-runs the gate over the existing list, keeping order and dropping anything
 * the current output cannot take. Used when the output changes, which is when
 * the gate itself changes.
 */
function revalidateCombineSources() {
  if (typeof openPictures === 'undefined') return;
  combineSources.forEach((s) => {
    const reason = combineUnsupportedReason(openPictures[s.index]);
    s.supported = reason === '';
    s.reason = reason;
  });
}

/**
 * Picks a sensible selection for the current output: everything the mosaic can
 * take, or the first N for a plane-per-screen output, so the dialog opens on a
 * buildable state instead of an error.
 */
function applyCombineModeSelection() {
  revalidateCombineSources();
  const need = COMBINE_MODE_PLANES[combineMode];
  let kept = 0;
  combineSources.forEach((s) => {
    if (!s.supported) { s.included = false; return; }
    s.included = need === 0 || kept < need;
    if (s.included) kept++;
  });
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
  // A plane-per-screen output has no layout: every source covers the whole
  // screen, and the list order alone says which plane it becomes.
  if (COMBINE_MODE_PLANES[combineMode] > 0) {
    combineCanvas = { cols: COMBINE_PLANE_WIDTH / COMBINE_CELL, rows: COMBINE_PLANE_HEIGHT / COMBINE_CELL };
    return;
  }

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
 * @typedef {Object} CombineResult
 * @property {string} kind              - the COMBINE_MODE that produced it
 * @property {any} picture              - internal Picture
 * @property {Uint8Array} screenData    - bytes in the output format's own layout
 * @property {string} format            - FORMAT.* for addPicture
 * @property {string} fileName
 * @property {string} info              - one line for the Output readout
 * @property {Uint8Array|null} covered  - mosaic only: which cells a source filled
 */

/**
 * Builds whatever the selected output is.
 * @returns {CombineResult|null}
 */
function buildCombinedPicture() {
  if (combineMode === COMBINE_MODE.GIGASCREEN) return buildGigascreenCombine();
  if (combineMode === COMBINE_MODE.RGB3) return buildRgb3Combine();
  return buildMosaicCombine();
}

/**
 * The included sources' raw screen bytes, in list order, or null when the count
 * is not the one the output needs. Reads openPictures[].screenData rather than
 * the Picture planes because that is the buffer the editor writes to, so it is
 * never a repaint behind — and for a plain .scr it is already the 6912-byte
 * frame layout both .img and .3 want.
 * @param {number} need - how many sources the output takes
 * @param {number} minBytes - how much of each one it reads
 * @returns {Uint8Array[]|null}
 */
function combineSourceScreens(need, minBytes) {
  const list = combineIncluded();
  if (list.length !== need) return null;
  /** @type {Uint8Array[]} */
  const out = [];
  for (const s of list) {
    const data = openPictures[s.index].screenData;
    if (!data || data.length < minBytes) return null;
    out.push(data);
  }
  return out;
}

/**
 * Two screens into one Gigascreen: the file is the two frames back to back, and
 * a plain .scr is already exactly one frame, so each is copied whole.
 * @returns {CombineResult|null}
 */
function buildGigascreenCombine() {
  const screens = combineSourceScreens(2, SCREEN.TOTAL_SIZE);
  if (!screens) return null;

  const screenData = new Uint8Array(GIGASCREEN.TOTAL_SIZE);
  for (let f = 0; f < 2; f++) {
    const frame = screens[f].subarray(0, SCREEN.TOTAL_SIZE);
    screenData.set(frame, f * GIGASCREEN.FRAME_SIZE);
  }

  const fileName = 'combined.img';
  const picture = importPicture(FORMAT.GIGASCREEN, screenData, fileName);
  if (!picture) return null;

  return {
    kind: COMBINE_MODE.GIGASCREEN,
    picture: picture,
    screenData: screenData,
    format: FORMAT.GIGASCREEN,
    fileName: fileName,
    info: 'Gigascreen ' + COMBINE_PLANE_WIDTH + '×' + COMBINE_PLANE_HEIGHT +
      ' — ' + GIGASCREEN.TOTAL_SIZE + ' bytes',
    covered: null
  };
}

/**
 * Three screens into one RGB3: only the bitmaps travel, since RGB3 spends its
 * whole file on three bitplanes and keeps no attributes at all. Each source's
 * attributes are therefore dropped, which the dialog says in as many words.
 * @returns {CombineResult|null}
 */
function buildRgb3Combine() {
  const screens = combineSourceScreens(3, RGB3.BITMAP_SIZE);
  if (!screens) return null;

  const screenData = new Uint8Array(RGB3.TOTAL_SIZE);
  for (let p = 0; p < 3; p++) {
    screenData.set(screens[p].subarray(0, RGB3.BITMAP_SIZE), p * RGB3.BITMAP_SIZE);
  }

  const fileName = 'combined.3';
  const picture = importPicture(FORMAT.RGB3, screenData, fileName);
  if (!picture) return null;

  return {
    kind: COMBINE_MODE.RGB3,
    picture: picture,
    screenData: screenData,
    format: FORMAT.RGB3,
    fileName: fileName,
    info: 'RGB3 ' + COMBINE_PLANE_WIDTH + '×' + COMBINE_PLANE_HEIGHT +
      ' — ' + RGB3.TOTAL_SIZE + ' bytes',
    covered: null
  };
}

/**
 * Builds the mosaic.
 * Cells are copied verbatim; cells no source covers keep the fill attribute and
 * an empty bitmap. Sources are drawn in list order, so a later one wins on
 * overlap.
 * @returns {CombineResult|null}
 */
function buildMosaicCombine() {
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

  const fileName = 'combined.ch$';
  const picture = importZxp(bitmap, attrs, fileName, width, height, COMBINE_CELL, null);
  if (!picture) return null;
  picture.sourceFormat = 'ch$';

  let uncovered = 0;
  for (let i = 0; i < covered.length; i++) if (!covered[i]) uncovered++;

  return {
    kind: COMBINE_MODE.MOSAIC,
    picture: picture,
    screenData: screenData,
    format: FORMAT.CHR,
    fileName: fileName,
    info: 'chr$ ' + width + '×' + height + ' — ' + (7 + attrSize * 9) + ' bytes' +
      (uncovered ? ' — ' + uncovered + ' cell(s) filled' : ''),
    covered: covered
  };
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

  // Which plane each included source becomes, by its position among the
  // included ones rather than its position in the list.
  const roles = COMBINE_MODE_ROLES[combineMode] || null;
  const included = combineIncluded();

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
    } else if (roles) {
      // Only the rows actually taking part get a chip; a row waiting to be
      // ticked has no plane to name yet.
      const slot = included.indexOf(s);
      if (slot >= 0 && slot < roles.length) {
        const role = document.createElement('span');
        role.className = 'combine-role';
        role.textContent = roles[slot];
        const tint = COMBINE_ROLE_TINTS[combineMode];
        if (tint) role.style.color = tint[slot];
        row.appendChild(role);
      }
    }

    row.appendChild(makeCombineMoveButton('▲', 'Move up', i === 0,
      () => { moveCombineSource(i, i - 1); }));
    row.appendChild(makeCombineMoveButton('▼', 'Move down', i === combineSources.length - 1,
      () => { moveCombineSource(i, i + 1); }));

    host.appendChild(row);
  });
}

/**
 * One plane's pixel colour, straight from the ZX palette.
 * @param {{bitmap:Uint8Array, attrs:Uint8Array}} plane
 * @param {number} cols
 * @param {number} x
 * @param {number} y
 * @returns {number[]} [r, g, b]
 */
function combinePlanePixel(plane, cols, x, y) {
  const col = x >> 3;
  const attr = plane.attrs[((y / COMBINE_CELL) | 0) * cols + col];
  const bit = (plane.bitmap[y * cols + col] >> (7 - (x & 7))) & 1;
  const pal = ATTR.bright(attr) ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
  return bit ? pal[ATTR.ink(attr)] : pal[ATTR.paper(attr)];
}

/**
 * Mosaic preview pixel — a checkerboard where no source reached, so gaps are
 * obvious before the picture is created.
 * @param {CombineResult} built
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function combineSampleMosaic(built, x, y) {
  const pic = built.picture;
  const cols = pic.cols;
  const cellIdx = ((y / COMBINE_CELL) | 0) * cols + ((x / COMBINE_CELL) | 0);
  if (built.covered && !built.covered[cellIdx]) {
    const chk = (((x >> 2) + (y >> 2)) & 1) ? 100 : 70;
    return [chk, chk, chk];
  }
  return combinePlanePixel(pic.planes[0], cols, x, y);
}

/**
 * Gigascreen preview pixel: the average of both frames, which is what the
 * viewer's default blend shows.
 * @param {CombineResult} built
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function combineSampleGigascreen(built, x, y) {
  const pic = built.picture;
  const cols = pic.cols;
  const a = combinePlanePixel(pic.planes[0], cols, x, y);
  const b = combinePlanePixel(pic.planes[1], cols, x, y);
  return [(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1];
}

/**
 * RGB3 preview pixel: one bitplane per channel, same mapping the viewer uses.
 * @param {CombineResult} built
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function combineSampleRgb3(built, x, y) {
  const pic = built.picture;
  const cols = pic.cols;
  const col = x >> 3;
  const mask = 0x80 >> (x & 7);
  const off = y * cols + col;
  return [
    (pic.planes[0].bitmap[off] & mask) ? ZX_PALETTE_RGB.BRIGHT[2][0] : 0,
    (pic.planes[1].bitmap[off] & mask) ? ZX_PALETTE_RGB.BRIGHT[4][1] : 0,
    (pic.planes[2].bitmap[off] & mask) ? ZX_PALETTE_RGB.BRIGHT[1][2] : 0
  ];
}

/**
 * Draws the result preview the way the viewer would show it.
 * @param {CombineResult|null} built
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
  const sample = built.kind === COMBINE_MODE.GIGASCREEN ? combineSampleGigascreen :
                 built.kind === COMBINE_MODE.RGB3 ? combineSampleRgb3 :
                 combineSampleMosaic;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rgb = sample(built, x, y);
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
  syncCombineModeUI();

  const list = combineIncluded();
  const need = COMBINE_MODE_PLANES[combineMode];
  const info = document.getElementById('combineOutputInfo');
  const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('combineOkBtn'));
  const warn = document.getElementById('combineWarning');

  let built = null;
  let problem = '';

  if (need > 0 && list.length !== need) {
    // Say which way it is wrong; the count alone leaves the user hunting.
    problem = list.length < need
      ? 'Select ' + (need - list.length) + ' more picture(s) — this output takes exactly ' + need + '.'
      : 'Clear ' + (list.length - need) + ' picture(s) — this output takes exactly ' + need + '.';
  } else if (list.length === 0) {
    problem = 'Select at least one picture.';
  } else if (need === 0 &&
             (combineCanvas.cols > COMBINE_MAX_CELLS || combineCanvas.rows > COMBINE_MAX_CELLS)) {
    problem = 'Too large: chr$ allows at most ' + (COMBINE_MAX_CELLS * 8) + ' pixels per side.';
  } else {
    built = buildCombinedPicture();
  }

  renderCombinePreview(built);

  if (info) info.textContent = built ? built.info : '—';

  if (warn) {
    warn.textContent = problem;
    warn.style.display = problem ? 'block' : 'none';
  }
  if (okBtn) okBtn.disabled = !built;
}

/**
 * Shows the output select's own state: the hint line, and the mosaic-only rows,
 * which mean nothing when every source covers the whole screen.
 */
function syncCombineModeUI() {
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('combineModeSelect'));
  if (sel) {
    // Offer only what the open pictures could actually produce: two screens can
    // never make an RGB3, so that option is dead weight and picking it only
    // lands the user in an error they cannot clear from here.
    Array.from(sel.options).forEach((opt) => {
      const need = COMBINE_MODE_PLANES[opt.value] || 0;
      const have = need > 0 ? combineUsableCount(opt.value) : 0;
      const short = need > 0 && have < need;
      opt.disabled = short;
      opt.title = short
        ? 'Needs ' + need + ' full 256\u00d7192 .scr pictures open; ' + have + ' open'
        : '';
    });
    sel.value = combineMode;
  }

  const hint = document.getElementById('combineHint');
  if (hint) hint.textContent = COMBINE_MODE_HINTS[combineMode] || '';

  const mosaicOnly = COMBINE_MODE_PLANES[combineMode] === 0;
  ['combineGridRow', 'combineFillRow'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = mosaicOnly ? '' : 'none';
  });
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
  // Start on the mosaic every time, the way the column count starts automatic:
  // the output is a decision about this one combine, not a lasting preference.
  combineMode = COMBINE_MODE.MOSAIC;
  applyCombineModeSelection();
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

  if (typeof addPicture === 'function') {
    const idx = addPicture(built.fileName, built.format, built.screenData, built.picture, false);
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

  document.getElementById('combineModeSelect')?.addEventListener('change', (e) => {
    const sel = /** @type {HTMLSelectElement} */ (e.target);
    combineMode = sel.value;
    // The gate and the selection both depend on the output, so redo them here
    // rather than leaving a source marked usable that the new output refuses.
    applyCombineModeSelection();
    applyCombineLayout();
    updateCombineUI();
  });

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
