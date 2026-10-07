// @ts-check
"use strict";

// ============================================================================
// Magnifier
//
// A floating window showing the picture around the cursor, blown up, with the
// pixel under the cursor marked. It is for placing single pixels, which at
// editor zoom 1 or 2 is otherwise guesswork.
//
// It SAMPLES THE EDITOR CANVAS rather than re-rendering the picture. Every
// format, every display filter, the grid and the brush preview then come
// through for free, and the magnifier can never disagree with what is on
// screen. The cost is that it shows the canvas as drawn -- including overlays
// -- which for this purpose is the right answer anyway.
// ============================================================================

/** Side of the magnifier canvas in CSS pixels. Fixed, so the panel never jumps. */
const MAGNIFIER_SIZE = 160;

/** How many screen pixels one picture pixel becomes. */
const MAGNIFIER_ZOOMS = [4, 8, 16, 20];

/** localStorage key for zoom and position. */
const MAGNIFIER_KEY = 'spectraLabMagnifier';

/** @type {boolean} */
let magnifierVisible = false;

/** @type {number} */
let magnifierZoom = 8;

/** Picture pixel the magnifier is centred on, or null when the cursor is away. */
let magnifierAt = /** @type {{x: number, y: number}|null} */ (null);

/** @type {boolean} */
let isDraggingMagnifier = false;

/** Copy of the editor canvas taken before the overlays, or null. */
let magnifierSource = /** @type {HTMLCanvasElement|null} */ (null);

/**
 * Takes the copy the magnifier reads from.
 *
 * Called by renderScreenInner() after the display filters and before the first
 * grid, so what lands here is the picture as it is seen but without the grid,
 * the reference overlay or the multicolour timing marks. Only while the
 * magnifier is open: otherwise it would cost a full canvas copy per render for
 * nothing at all.
 */
function captureMagnifierSource() {
  if (!magnifierVisible || !screenCanvas) return;
  if (!magnifierSource) magnifierSource = document.createElement('canvas');
  if (magnifierSource.width !== screenCanvas.width ||
      magnifierSource.height !== screenCanvas.height) {
    magnifierSource.width = screenCanvas.width;
    magnifierSource.height = screenCanvas.height;
  }
  const sctx = magnifierSource.getContext('2d');
  if (!sctx) return;
  sctx.clearRect(0, 0, magnifierSource.width, magnifierSource.height);
  sctx.drawImage(screenCanvas, 0, 0);
}

/** @type {{x: number, y: number}} */
let magnifierDragOffset = { x: 0, y: 0 };

/**
 * Where picture pixel (x, y) sits on the editor canvas.
 *
 * The inverse of canvasToScreenCoords(): same border inset, same zoom, same
 * scroll offset when the canvas is viewport-capped and rendering goes through a
 * scroll transform. Kept next to that function in spirit -- if one changes the
 * other has to.
 *
 * @param {number} x - picture pixel
 * @param {number} y - picture pixel
 * @returns {{x: number, y: number, w: number, h: number}|null}
 */
function magnifierPixelRect(x, y) {
  if (!screenCanvas) return null;
  const container = document.getElementById('canvasContainer');
  const wrapper = document.getElementById('canvasWrapper');
  const isViewportCapped = !!(wrapper && container &&
    (screenCanvas.width < wrapper.offsetWidth || screenCanvas.height < wrapper.offsetHeight));
  const scrollX = isViewportCapped && container ? container.scrollLeft : 0;
  const scrollY = isViewportCapped && container ? container.scrollTop : 0;

  const borderPixels = borderSize * zoom;
  const w = zoom * getPixelScaleX();
  const h = zoom * getPixelScaleY();
  return {
    x: x * w + borderPixels - scrollX,
    y: y * h + borderPixels - scrollY,
    w: w,
    h: h
  };
}

/**
 * Repaints the magnifier from the editor canvas.
 *
 * Nothing is drawn when the cursor has not been over the picture yet; a blank
 * window is better than a stale one that looks current.
 */
function renderMagnifier() {
  const canvas = /** @type {HTMLCanvasElement|null} */
    (document.getElementById('editorMagnifierCanvas'));
  if (!canvas || !magnifierVisible) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const readout = document.getElementById('editorMagnifierReadout');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!magnifierAt || !screenCanvas || !editorActive) {
    ctx.fillStyle = 'rgba(128,128,128,0.10)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (readout) readout.innerHTML = '&nbsp;';
    return;
  }

  // Odd cell count so there is a true middle pixel to mark
  let cells = Math.floor(MAGNIFIER_SIZE / magnifierZoom);
  if (cells % 2 === 0) cells--;
  const half = (cells - 1) / 2;
  const span = cells * magnifierZoom;
  const pad = Math.floor((MAGNIFIER_SIZE - span) / 2);

  const topLeft = magnifierPixelRect(magnifierAt.x - half, magnifierAt.y - half);
  const one = magnifierPixelRect(0, 0);
  if (!topLeft || !one) return;

  // Source rect may hang off the canvas near an edge; drawImage clips it, and
  // the gap stays as the cleared background rather than smearing edge pixels
  // The clean copy when there is one; the live canvas only until the first
  // render after being switched on
  const src = magnifierSource || screenCanvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src,
    topLeft.x, topLeft.y, one.w * cells, one.h * cells,
    pad, pad, span, span);

  // --- 8x8 attribute cells, which is what actually constrains a ZX picture ---
  const cellX = ((magnifierAt.x - half) % 8 + 8) % 8;
  const cellY = ((magnifierAt.y - half) % 8 + 8) % 8;
  // Black under white dashes: reads over any ZX colour, and cannot be taken for
  // the orange the timing check puts on rows it cannot write in time
  const cellPath = () => {
    ctx.beginPath();
    for (let i = (8 - cellX) % 8; i <= cells; i += 8) {
      const px = Math.round(pad + i * magnifierZoom) + 0.5;
      ctx.moveTo(px, pad);
      ctx.lineTo(px, pad + span);
    }
    for (let i = (8 - cellY) % 8; i <= cells; i += 8) {
      const py = Math.round(pad + i * magnifierZoom) + 0.5;
      ctx.moveTo(pad, py);
      ctx.lineTo(pad + span, py);
    }
  };
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  cellPath();
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  cellPath();
  ctx.stroke();
  ctx.setLineDash([]);

  // --- the pixel under the cursor ---
  const cx = pad + half * magnifierZoom;
  const cy = pad + half * magnifierZoom;
  // Drawn twice so it reads against both ink and paper, whatever they are
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeRect(cx - 1.5, cy - 1.5, magnifierZoom + 3, magnifierZoom + 3);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeRect(cx - 0.5, cy - 0.5, magnifierZoom + 1, magnifierZoom + 1);

  if (readout) {
    readout.textContent = magnifierAt.x + ', ' + magnifierAt.y +
      '   cell ' + (magnifierAt.x >> 3) + ', ' + (magnifierAt.y >> 3);
  }
}

/**
 * Points the magnifier at a picture pixel, or nowhere.
 * @param {{x: number, y: number}|null} pos
 */
function setMagnifierTarget(pos) {
  if (!magnifierVisible) return;
  magnifierAt = pos ? { x: pos.x, y: pos.y } : null;
  // Always repaint, even when the pixel has not moved: dragging a tool changes
  // what is under the cursor without the cursor going anywhere
  renderMagnifier();
}

/**
 * @param {number} newZoom
 */
function setMagnifierZoom(newZoom) {
  const i = MAGNIFIER_ZOOMS.indexOf(newZoom);
  magnifierZoom = i >= 0 ? newZoom : MAGNIFIER_ZOOMS[1];
  const label = document.getElementById('magnifierZoomLevel');
  if (label) label.textContent = 'x' + magnifierZoom;
  saveMagnifierState();
  renderMagnifier();
}

/** Steps the zoom along the allowed list. */
function stepMagnifierZoom(dir) {
  const i = MAGNIFIER_ZOOMS.indexOf(magnifierZoom);
  const next = MAGNIFIER_ZOOMS[Math.max(0, Math.min(MAGNIFIER_ZOOMS.length - 1, i + dir))];
  setMagnifierZoom(next);
}

/**
 * @param {boolean} visible
 */
function setMagnifierVisible(visible) {
  magnifierVisible = !!visible;
  // Dropped rather than kept: the next render refills it, and holding a canvas
  // the size of a zoomed picture for a hidden panel is wasteful
  if (!magnifierVisible) magnifierSource = null;
  const panel = document.getElementById('editorMagnifierPanel');
  if (panel) panel.classList.toggle('active', magnifierVisible);
  const box = /** @type {HTMLInputElement|null} */
    (document.getElementById('showMagnifierCheckbox'));
  if (box) box.checked = magnifierVisible;
  saveMagnifierState();
  if (magnifierVisible) renderMagnifier();
}

/** Flips the magnifier on or off. */
function toggleMagnifier() {
  setMagnifierVisible(!magnifierVisible);
}

/** Saves zoom, visibility and position. */
function saveMagnifierState() {
  const panel = document.getElementById('editorMagnifierPanel');
  try {
    localStorage.setItem(MAGNIFIER_KEY, JSON.stringify({
      zoom: magnifierZoom,
      visible: magnifierVisible,
      left: panel && panel.style.left ? panel.style.left : '',
      top: panel && panel.style.top ? panel.style.top : ''
    }));
  } catch (e) { /* private mode, or storage full: the magnifier still works */ }
}

/** Restores what saveMagnifierState() kept, ignoring anything unusable. */
function loadMagnifierState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(MAGNIFIER_KEY) || 'null');
  } catch (e) { saved = null; }
  // No saved state is still a state: establish the whole default, or a caller
  // that resets storage and reloads would keep whatever was on screen
  if (!saved || typeof saved !== 'object') {
    setMagnifierZoom(magnifierZoom);
    setMagnifierVisible(false);
    return;
  }

  if (MAGNIFIER_ZOOMS.indexOf(saved.zoom) >= 0) magnifierZoom = saved.zoom;
  const panel = document.getElementById('editorMagnifierPanel');
  if (panel && typeof saved.left === 'string' && saved.left &&
      typeof saved.top === 'string' && saved.top) {
    panel.style.left = saved.left;
    panel.style.top = saved.top;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  setMagnifierZoom(magnifierZoom);
  setMagnifierVisible(!!saved.visible);
}

/**
 * Wires the panel up: drag, zoom buttons, checkbox.
 */
function initMagnifier() {
  const panel = document.getElementById('editorMagnifierPanel');
  const header = panel ? panel.querySelector('.editor-preview-header') : null;
  const canvas = /** @type {HTMLCanvasElement|null} */
    (document.getElementById('editorMagnifierCanvas'));
  if (!panel || !header || !canvas) return;

  canvas.width = MAGNIFIER_SIZE;
  canvas.height = MAGNIFIER_SIZE;

  header.addEventListener('mousedown', (e) => {
    isDraggingMagnifier = true;
    const rect = panel.getBoundingClientRect();
    magnifierDragOffset.x = /** @type {MouseEvent} */ (e).clientX - rect.left;
    magnifierDragOffset.y = /** @type {MouseEvent} */ (e).clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingMagnifier) return;
    const c = clampPreviewPosition(e.clientX - magnifierDragOffset.x,
                                   e.clientY - magnifierDragOffset.y, panel);
    panel.style.left = c.x + 'px';
    panel.style.top = c.y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (!isDraggingMagnifier) return;
    isDraggingMagnifier = false;
    saveMagnifierState();
  });

  document.getElementById('magnifierZoomIn')?.addEventListener('click', () => stepMagnifierZoom(1));
  document.getElementById('magnifierZoomOut')?.addEventListener('click', () => stepMagnifierZoom(-1));
  document.getElementById('showMagnifierCheckbox')?.addEventListener('change', (e) => {
    setMagnifierVisible(/** @type {HTMLInputElement} */ (e.target).checked);
  });

  // A panel pinned near an edge must not be left off-screen by a window resize
  window.addEventListener('resize', () => {
    if (!panel.style.left || !magnifierVisible) return;
    const c = clampPreviewPosition(parseFloat(panel.style.left) || 0,
                                   parseFloat(panel.style.top) || 0, panel);
    panel.style.left = c.x + 'px';
    panel.style.top = c.y + 'px';
  });

  loadMagnifierState();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMagnifier);
  } else {
    initMagnifier();
  }
}
