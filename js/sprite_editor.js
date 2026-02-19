// ============================================================================
// Sprite Editor — multi-tile sprite editing with animation, mask, attributes
// ============================================================================

// ZX Spectrum standard colors (normal + bright)
const SPRITE_ZX_COLORS = [
  '#000000', '#0000D7', '#D70000', '#D700D7', '#00D700', '#00D7D7', '#D7D700', '#D7D7D7',
  '#000000', '#0000FF', '#FF0000', '#FF00FF', '#00FF00', '#00FFFF', '#FFFF00', '#FFFFFF'
];

// ---- State ----

/** @type {{sprites: Array, name: string}} */
let spriteSheet = { sprites: [], name: 'Untitled' };

/** @type {number} */
let selectedSpriteIndex = -1;

/** @type {number} */
let currentFrameIndex = 0;

/** @type {string} */
let currentSpriteTool = 'draw';

/** @type {boolean} */
let editingMask = false;

/** @type {boolean} */
let spriteEditorOpen = false;

/** @type {number|null} */
let spriteAnimTimer = null;

/** @type {boolean} */
let spriteAnimPlaying = false;

/** @type {number} */
let spriteInk = 7;

/** @type {number} */
let spritePaper = 0;

/** @type {boolean} */
let spriteBright = false;

// Drag state for floating panel
let spritePanelDragging = false;
let spritePanelDragX = 0;
let spritePanelDragY = 0;

// Drawing state
let spriteDrawing = false;
let spriteLineStartX = -1;
let spriteLineStartY = -1;
let spriteLastDrawX = -1;
let spriteLastDrawY = -1;

// Selection state
let spriteSelection = null; // {x, y, w, h} or null
let spriteSelectDragging = false;
let spriteSelectStartX = -1;
let spriteSelectStartY = -1;

// Grab mode state
let spriteGrabMode = false;
let spriteGrabOverlay = null;
let spriteGrabMouseDown = null;
let spriteGrabMouseMove = null;
let spriteGrabMouseUp = null;
let spriteGrabEscHandler = null;
let spriteGrabDragging = false;
let spriteGrabStartX = -1;
let spriteGrabStartY = -1;

// Undo stack per sprite editor session
let spriteUndoStack = [];
let spriteRedoStack = [];
const SPRITE_MAX_UNDO = 50;

// Brush integration
/** @type {object|null} */
let activeSpriteBrush = null;

// ---- DOM cache ----
let spriteDOM = {};

// ============================================================================
// Initialization
// ============================================================================

function initSpriteEditor() {
  // Cache DOM elements
  const ids = [
    'spriteList', 'spriteAddBtn', 'spriteDeleteBtn', 'spriteProps', 'spriteName',
    'spriteCellsW', 'spriteCellsH', 'spriteMode', 'spriteFrameBar', 'spriteEditBtn',
    'spriteGrabBtn', 'spriteGrabStatus', 'spriteGrabConfig', 'spriteGrabMode',
    'spriteGrabGridOpts', 'spriteGrabSizeBy', 'spriteGrabByCells', 'spriteGrabByCount',
    'spriteGrabW', 'spriteGrabH', 'spriteGrabCols', 'spriteGrabRows', 'spriteGrabOrder',
    'spriteGrabAttrMode', 'spriteGrabStopBtn',
    'spriteUseBrushBtn', 'spriteSaveBtn', 'spriteLoadBtn', 'spriteExportAsmBtn',
    'spriteExportBinBtn', 'spriteFileInput', 'spriteEditorPanel', 'spriteEditorTitle',
    'spriteEditorClose', 'spriteEditorCanvas', 'spritePreviewCanvas',
    'spriteToolDraw', 'spriteToolErase', 'spriteToolFill', 'spriteToolLine',
    'spriteToolRect', 'spriteToolSelect', 'spriteToolMask', 'spriteAttrControls',
    'spriteInkPalette', 'spritePaperPalette', 'spriteBrightChk',
    'spriteOnionSkin', 'spriteShowGrid', 'spriteShowMask',
    'spriteFramePrev', 'spriteFrameInfo', 'spriteFrameNext', 'spriteFrameAdd',
    'spriteFrameDup', 'spriteFrameDel', 'spritePlayBtn', 'spriteAnimSpeed',
    'spriteFlipH', 'spriteFlipV', 'spriteRotCW', 'spriteRotCCW',
    'spriteShiftL', 'spriteShiftR', 'spriteShiftU', 'spriteShiftD',
    'spriteInvert', 'spriteClear'
  ];
  for (const id of ids) {
    spriteDOM[id] = document.getElementById(id);
  }

  // Sprite list click/dblclick via delegation (list items get rebuilt on selection)
  spriteDOM.spriteList?.addEventListener('click', function(e) {
    const item = e.target.closest('.sprite-list-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index);
    if (!isNaN(idx)) selectSprite(idx);
  });
  spriteDOM.spriteList?.addEventListener('dblclick', function(e) {
    const item = e.target.closest('.sprite-list-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index);
    if (!isNaN(idx)) { selectSprite(idx); openSpriteEditor(); }
  });

  // Sidebar buttons
  spriteDOM.spriteAddBtn?.addEventListener('click', () => addSprite());
  spriteDOM.spriteDeleteBtn?.addEventListener('click', deleteSelectedSprite);
  spriteDOM.spriteEditBtn?.addEventListener('click', () => openSpriteEditor());
  spriteDOM.spriteGrabBtn?.addEventListener('click', toggleGrabMode);
  spriteDOM.spriteGrabStopBtn?.addEventListener('click', cancelGrabMode);
  spriteDOM.spriteGrabMode?.addEventListener('change', () => {
    const mode = spriteDOM.spriteGrabMode.value;
    const isGrid = mode === 'grid' || mode === 'gridphases';
    if (spriteDOM.spriteGrabGridOpts) spriteDOM.spriteGrabGridOpts.style.display = isGrid ? '' : 'none';
  });
  spriteDOM.spriteGrabSizeBy?.addEventListener('change', () => {
    const byCount = spriteDOM.spriteGrabSizeBy.value === 'count';
    if (spriteDOM.spriteGrabByCells) spriteDOM.spriteGrabByCells.style.display = byCount ? 'none' : 'flex';
    if (spriteDOM.spriteGrabByCount) spriteDOM.spriteGrabByCount.style.display = byCount ? 'flex' : 'none';
  });
  spriteDOM.spriteUseBrushBtn?.addEventListener('click', useAsBrush);

  // Name change
  spriteDOM.spriteName?.addEventListener('input', () => {
    const sprite = getSelectedSprite();
    if (sprite) {
      sprite.name = spriteDOM.spriteName.value;
      updateSpriteList();
    }
  });

  // Size/mode change
  spriteDOM.spriteCellsW?.addEventListener('change', onSpriteSizeChange);
  spriteDOM.spriteCellsH?.addEventListener('change', onSpriteSizeChange);
  spriteDOM.spriteMode?.addEventListener('change', onSpriteModeChange);

  // Editor panel close
  spriteDOM.spriteEditorClose?.addEventListener('click', closeSpriteEditor);

  // Editor panel drag
  const titlebar = spriteDOM.spriteEditorPanel?.querySelector('.sprite-editor-titlebar');
  if (titlebar) {
    titlebar.addEventListener('mousedown', onPanelDragStart);
  }
  document.addEventListener('mousemove', onPanelDragMove);
  document.addEventListener('mouseup', onPanelDragEnd);

  // Tool buttons
  const toolMap = {
    spriteToolDraw: 'draw', spriteToolErase: 'erase', spriteToolFill: 'fill',
    spriteToolLine: 'line', spriteToolRect: 'rect', spriteToolSelect: 'select'
  };
  for (const [domId, tool] of Object.entries(toolMap)) {
    spriteDOM[domId]?.addEventListener('click', () => setSpriteTool(tool));
  }
  spriteDOM.spriteToolMask?.addEventListener('click', toggleMaskEditing);

  // Canvas mouse events
  const canvas = spriteDOM.spriteEditorCanvas;
  if (canvas) {
    canvas.addEventListener('mousedown', onSpriteCanvasMouseDown);
    canvas.addEventListener('mousemove', onSpriteCanvasMouseMove);
    canvas.addEventListener('mouseup', onSpriteCanvasMouseUp);
    canvas.addEventListener('mouseleave', onSpriteCanvasMouseUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Frame controls
  spriteDOM.spriteFramePrev?.addEventListener('click', () => navigateFrame(-1));
  spriteDOM.spriteFrameNext?.addEventListener('click', () => navigateFrame(1));
  spriteDOM.spriteFrameAdd?.addEventListener('click', addFrame);
  spriteDOM.spriteFrameDup?.addEventListener('click', duplicateFrame);
  spriteDOM.spriteFrameDel?.addEventListener('click', deleteFrame);
  spriteDOM.spritePlayBtn?.addEventListener('click', toggleAnimation);

  // Checkbox changes trigger re-render
  spriteDOM.spriteOnionSkin?.addEventListener('change', () => renderSpriteEditor());
  spriteDOM.spriteShowGrid?.addEventListener('change', () => renderSpriteEditor());
  spriteDOM.spriteShowMask?.addEventListener('change', () => renderSpriteEditor());

  // Transform buttons
  spriteDOM.spriteFlipH?.addEventListener('click', () => transformCurrentFrame('flipH'));
  spriteDOM.spriteFlipV?.addEventListener('click', () => transformCurrentFrame('flipV'));
  spriteDOM.spriteRotCW?.addEventListener('click', () => transformCurrentFrame('rotCW'));
  spriteDOM.spriteRotCCW?.addEventListener('click', () => transformCurrentFrame('rotCCW'));
  spriteDOM.spriteShiftL?.addEventListener('click', () => transformCurrentFrame('shiftL'));
  spriteDOM.spriteShiftR?.addEventListener('click', () => transformCurrentFrame('shiftR'));
  spriteDOM.spriteShiftU?.addEventListener('click', () => transformCurrentFrame('shiftU'));
  spriteDOM.spriteShiftD?.addEventListener('click', () => transformCurrentFrame('shiftD'));
  spriteDOM.spriteInvert?.addEventListener('click', () => transformCurrentFrame('invert'));
  spriteDOM.spriteClear?.addEventListener('click', () => transformCurrentFrame('clear'));

  // Save/Load/Export
  spriteDOM.spriteSaveBtn?.addEventListener('click', saveSpriteSheet);
  spriteDOM.spriteLoadBtn?.addEventListener('click', () => spriteDOM.spriteFileInput?.click());
  spriteDOM.spriteFileInput?.addEventListener('change', onSpriteFileLoad);
  spriteDOM.spriteExportAsmBtn?.addEventListener('click', exportSpriteAsm);
  spriteDOM.spriteExportBinBtn?.addEventListener('click', exportSpriteBin);

  // Build color palettes
  buildColorPalettes();

  // Keyboard shortcuts (only when editor panel is focused)
  document.addEventListener('keydown', onSpriteKeyDown);
}

// ============================================================================
// Sprite Management
// ============================================================================

function createEmptyFrame(cellsW, cellsH, mode) {
  const pixelW = cellsW * 8;
  const pixelH = cellsH * 8;
  const bitmapSize = pixelH * Math.ceil(pixelW / 8);
  const frame = {
    bitmap: new Uint8Array(bitmapSize),
    mask: null,
    attrs: null
  };
  if (mode === 'attr') {
    frame.attrs = new Uint8Array(cellsW * cellsH);
    // Default: ink 7, paper 0, bright 0 = 0b00_000_111 = 7
    frame.attrs.fill(7);
  }
  return frame;
}

function addSprite(name, cellsW, cellsH, mode) {
  name = name || 'Sprite' + (spriteSheet.sprites.length + 1);
  cellsW = cellsW || 1;
  cellsH = cellsH || 1;
  mode = mode || 'mono';

  const sprite = {
    name: name,
    cellsW: cellsW,
    cellsH: cellsH,
    mode: mode,
    frames: [createEmptyFrame(cellsW, cellsH, mode)]
  };

  spriteSheet.sprites.push(sprite);
  selectedSpriteIndex = spriteSheet.sprites.length - 1;
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
}

function deleteSelectedSprite() {
  if (selectedSpriteIndex < 0 || selectedSpriteIndex >= spriteSheet.sprites.length) return;
  spriteSheet.sprites.splice(selectedSpriteIndex, 1);
  if (selectedSpriteIndex >= spriteSheet.sprites.length) {
    selectedSpriteIndex = spriteSheet.sprites.length - 1;
  }
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
  if (spriteEditorOpen) {
    if (selectedSpriteIndex >= 0) {
      renderSpriteEditor();
    } else {
      closeSpriteEditor();
    }
  }
}

function selectSprite(index) {
  if (index < 0 || index >= spriteSheet.sprites.length) return;
  selectedSpriteIndex = index;
  currentFrameIndex = 0;
  spriteUndoStack = [];
  spriteRedoStack = [];
  // Update selection visuals without rebuilding DOM (preserves dblclick)
  const items = spriteDOM.spriteList?.querySelectorAll('.sprite-list-item');
  if (items) {
    items.forEach((item, i) => item.classList.toggle('selected', i === index));
  }
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
}

function getSelectedSprite() {
  if (selectedSpriteIndex < 0 || selectedSpriteIndex >= spriteSheet.sprites.length) return null;
  return spriteSheet.sprites[selectedSpriteIndex];
}

function getCurrentFrame() {
  const sprite = getSelectedSprite();
  if (!sprite || currentFrameIndex < 0 || currentFrameIndex >= sprite.frames.length) return null;
  return sprite.frames[currentFrameIndex];
}

// ============================================================================
// Sidebar UI
// ============================================================================

function updateSpriteList() {
  const list = spriteDOM.spriteList;
  if (!list) return;
  list.innerHTML = '';

  for (let i = 0; i < spriteSheet.sprites.length; i++) {
    const sprite = spriteSheet.sprites[i];
    const item = document.createElement('div');
    item.className = 'sprite-list-item' + (i === selectedSpriteIndex ? ' selected' : '');

    // Thumbnail canvas
    const thumbCanvas = document.createElement('canvas');
    const thumbSize = 24;
    thumbCanvas.width = thumbSize;
    thumbCanvas.height = thumbSize;
    renderSpriteThumbnail(thumbCanvas, sprite, 0);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = sprite.name + ' (' + (sprite.cellsW * 8) + 'x' + (sprite.cellsH * 8) + ')';
    nameSpan.style.flex = '1';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';

    item.appendChild(thumbCanvas);
    item.appendChild(nameSpan);
    item.dataset.index = String(i);
    list.appendChild(item);
  }
}

function updateSpriteProps() {
  const props = spriteDOM.spriteProps;
  if (!props) return;

  const sprite = getSelectedSprite();
  if (!sprite) {
    props.style.display = 'none';
    return;
  }
  props.style.display = '';

  spriteDOM.spriteName.value = sprite.name;
  spriteDOM.spriteCellsW.value = String(sprite.cellsW);
  spriteDOM.spriteCellsH.value = String(sprite.cellsH);
  spriteDOM.spriteMode.value = sprite.mode;

  updateFrameBar();
}

function updateFrameBar() {
  const bar = spriteDOM.spriteFrameBar;
  if (!bar) return;
  const sprite = getSelectedSprite();
  if (!sprite) { bar.innerHTML = ''; return; }

  bar.innerHTML = '';
  for (let i = 0; i < sprite.frames.length; i++) {
    const thumb = document.createElement('canvas');
    thumb.width = 20;
    thumb.height = 20;
    thumb.style.border = '2px solid ' + (i === currentFrameIndex ? 'var(--accent-primary)' : 'var(--border-secondary)');
    thumb.style.cursor = 'pointer';
    thumb.style.imageRendering = 'pixelated';
    renderSpriteThumbnail(thumb, sprite, i);
    thumb.addEventListener('click', () => { currentFrameIndex = i; updateFrameBar(); renderSpriteEditor(); });
    bar.appendChild(thumb);
  }
}

// ============================================================================
// Resize / Mode Change
// ============================================================================

function onSpriteSizeChange() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  const newW = parseInt(spriteDOM.spriteCellsW.value) || 1;
  const newH = parseInt(spriteDOM.spriteCellsH.value) || 1;
  if (newW === sprite.cellsW && newH === sprite.cellsH) return;
  resizeSprite(sprite, newW, newH);
  updateSpriteList();
  if (spriteEditorOpen) renderSpriteEditor();
}

function resizeSprite(sprite, newW, newH) {
  const oldW = sprite.cellsW;
  const oldH = sprite.cellsH;
  const oldPixW = oldW * 8;
  const newPixW = newW * 8;
  const oldPixH = oldH * 8;
  const newPixH = newH * 8;

  for (let fi = 0; fi < sprite.frames.length; fi++) {
    const frame = sprite.frames[fi];
    const oldBytesPerRow = Math.ceil(oldPixW / 8);
    const newBytesPerRow = Math.ceil(newPixW / 8);

    // Resize bitmap
    const newBitmap = new Uint8Array(newPixH * newBytesPerRow);
    const copyRows = Math.min(oldPixH, newPixH);
    const copyBytes = Math.min(oldBytesPerRow, newBytesPerRow);
    for (let y = 0; y < copyRows; y++) {
      for (let b = 0; b < copyBytes; b++) {
        newBitmap[y * newBytesPerRow + b] = frame.bitmap[y * oldBytesPerRow + b];
      }
    }
    frame.bitmap = newBitmap;

    // Resize mask
    if (frame.mask) {
      const newMask = new Uint8Array(newPixH * newBytesPerRow);
      for (let y = 0; y < copyRows; y++) {
        for (let b = 0; b < copyBytes; b++) {
          newMask[y * newBytesPerRow + b] = frame.mask[y * oldBytesPerRow + b];
        }
      }
      frame.mask = newMask;
    }

    // Resize attrs
    if (frame.attrs) {
      const newAttrs = new Uint8Array(newW * newH);
      const copyCellsW = Math.min(oldW, newW);
      const copyCellsH = Math.min(oldH, newH);
      for (let cy = 0; cy < copyCellsH; cy++) {
        for (let cx = 0; cx < copyCellsW; cx++) {
          newAttrs[cy * newW + cx] = frame.attrs[cy * oldW + cx];
        }
      }
      // Fill new cells with default attr
      for (let cy = 0; cy < newH; cy++) {
        for (let cx = 0; cx < newW; cx++) {
          if (cy >= copyCellsH || cx >= copyCellsW) {
            newAttrs[cy * newW + cx] = 7; // ink 7, paper 0, bright 0
          }
        }
      }
      frame.attrs = newAttrs;
    }
  }

  sprite.cellsW = newW;
  sprite.cellsH = newH;
}

function onSpriteModeChange() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  const newMode = spriteDOM.spriteMode.value;
  if (newMode === sprite.mode) return;

  sprite.mode = newMode;
  for (const frame of sprite.frames) {
    if (newMode === 'attr' && !frame.attrs) {
      frame.attrs = new Uint8Array(sprite.cellsW * sprite.cellsH);
      frame.attrs.fill(7);
    } else if (newMode === 'mono') {
      frame.attrs = null;
    }
  }

  // Show/hide attr controls in editor
  if (spriteEditorOpen) {
    updateAttrControlsVisibility();
    renderSpriteEditor();
  }
}

// ============================================================================
// Floating Editor Panel
// ============================================================================

function openSpriteEditor() {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  spriteEditorOpen = true;
  spriteUndoStack = [];
  spriteRedoStack = [];
  spriteSelection = null;

  spriteDOM.spriteEditorPanel.style.display = '';
  spriteDOM.spriteEditorTitle.textContent = 'Sprite: ' + sprite.name;

  updateAttrControlsVisibility();
  resizeEditorCanvas();
  renderSpriteEditor();
  updateFrameInfo();
}

function closeSpriteEditor() {
  spriteEditorOpen = false;
  stopAnimation();
  spriteDOM.spriteEditorPanel.style.display = 'none';
}

function resizeEditorCanvas() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;
  // Calculate zoom to fit in ~256px but be a power-of-2-ish integer
  const maxDim = Math.max(pixW, pixH);
  let zoom = Math.max(1, Math.floor(256 / maxDim));
  if (zoom > 32) zoom = 32;

  const canvas = spriteDOM.spriteEditorCanvas;
  canvas.width = pixW * zoom;
  canvas.height = pixH * zoom;
  canvas._zoom = zoom;
  canvas._pixW = pixW;
  canvas._pixH = pixH;

  // Preview canvas
  const prev = spriteDOM.spritePreviewCanvas;
  const prevZoom = Math.max(1, Math.floor(64 / maxDim));
  prev.width = pixW * prevZoom;
  prev.height = pixH * prevZoom;
  prev._zoom = prevZoom;
}

function updateAttrControlsVisibility() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  const show = sprite.mode === 'attr';
  if (spriteDOM.spriteAttrControls) {
    spriteDOM.spriteAttrControls.style.display = show ? '' : 'none';
  }
}

// Panel dragging
function onPanelDragStart(e) {
  if (e.target.closest('.sprite-editor-close')) return;
  spritePanelDragging = true;
  const panel = spriteDOM.spriteEditorPanel;
  const rect = panel.getBoundingClientRect();
  spritePanelDragX = e.clientX - rect.left;
  spritePanelDragY = e.clientY - rect.top;
  e.preventDefault();
}

function onPanelDragMove(e) {
  if (!spritePanelDragging) return;
  const panel = spriteDOM.spriteEditorPanel;
  panel.style.left = (e.clientX - spritePanelDragX) + 'px';
  panel.style.top = (e.clientY - spritePanelDragY) + 'px';
}

function onPanelDragEnd() {
  spritePanelDragging = false;
}

// ============================================================================
// Rendering
// ============================================================================

function renderSpriteEditor() {
  if (!spriteEditorOpen) return;
  renderSpriteCanvas();
  renderSpritePreview();
  updateFrameInfo();
  updateFrameBar();
}

function renderSpriteCanvas() {
  const canvas = spriteDOM.spriteEditorCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const sprite = getSelectedSprite();
  const frame = getCurrentFrame();
  if (!sprite || !frame) return;

  const zoom = canvas._zoom;
  const pixW = canvas._pixW;
  const pixH = canvas._pixH;
  const bytesPerRow = Math.ceil(pixW / 8);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Onion skinning: render previous frame faintly
  const showOnion = spriteDOM.spriteOnionSkin?.checked && currentFrameIndex > 0;
  if (showOnion) {
    const prevFrame = sprite.frames[currentFrameIndex - 1];
    ctx.globalAlpha = 0.25;
    renderFrameToCtx(ctx, sprite, prevFrame, zoom, pixW, pixH, bytesPerRow, false);
    ctx.globalAlpha = 1.0;
  }

  // Render current frame
  renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, bytesPerRow, true);

  // Mask overlay
  const showMask = spriteDOM.spriteShowMask?.checked && frame.mask;
  if (showMask) {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        if (spGetMaskPixel(frame, x, y, pixW)) {
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }
  }

  // Grid
  const showGrid = spriteDOM.spriteShowGrid?.checked;
  if (showGrid && zoom >= 4) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= pixW; x++) {
      ctx.beginPath();
      ctx.moveTo(x * zoom + 0.5, 0);
      ctx.lineTo(x * zoom + 0.5, pixH * zoom);
      ctx.stroke();
    }
    for (let y = 0; y <= pixH; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * zoom + 0.5);
      ctx.lineTo(pixW * zoom, y * zoom + 0.5);
      ctx.stroke();
    }
    // Cell boundaries (thicker)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    for (let cx = 0; cx <= sprite.cellsW; cx++) {
      ctx.beginPath();
      ctx.moveTo(cx * 8 * zoom + 0.5, 0);
      ctx.lineTo(cx * 8 * zoom + 0.5, pixH * zoom);
      ctx.stroke();
    }
    for (let cy = 0; cy <= sprite.cellsH; cy++) {
      ctx.beginPath();
      ctx.moveTo(0, cy * 8 * zoom + 0.5);
      ctx.lineTo(pixW * zoom, cy * 8 * zoom + 0.5);
      ctx.stroke();
    }
  }

  // Selection rectangle
  if (spriteSelection) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(
      spriteSelection.x * zoom + 0.5,
      spriteSelection.y * zoom + 0.5,
      spriteSelection.w * zoom,
      spriteSelection.h * zoom
    );
    ctx.setLineDash([]);
  }
}

function renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, bytesPerRow, isCurrentFrame) {
  if (sprite.mode === 'attr' && frame.attrs) {
    // Attributed mode: color per 8x8 cell
    for (let cy = 0; cy < sprite.cellsH; cy++) {
      for (let cx = 0; cx < sprite.cellsW; cx++) {
        const attr = frame.attrs[cy * sprite.cellsW + cx];
        const ink = attr & 7;
        const paper = (attr >> 3) & 7;
        const bright = (attr >> 6) & 1;
        const inkColor = SPRITE_ZX_COLORS[ink + (bright ? 8 : 0)];
        const paperColor = SPRITE_ZX_COLORS[paper + (bright ? 8 : 0)];

        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const x = cx * 8 + px;
            const y = cy * 8 + py;
            const set = spGetPixel(frame, x, y, pixW);
            ctx.fillStyle = set ? inkColor : paperColor;
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }
    }
  } else {
    // Monochrome mode
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        if (spGetPixel(frame, x, y, pixW)) {
          ctx.fillStyle = '#D7D7D7';
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }
  }
}

function renderSpritePreview() {
  const canvas = spriteDOM.spritePreviewCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const sprite = getSelectedSprite();
  const frame = getCurrentFrame();
  if (!sprite || !frame) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

  const zoom = canvas._zoom;
  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;
  const bytesPerRow = Math.ceil(pixW / 8);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, bytesPerRow, true);
}

function renderSpriteThumbnail(canvas, sprite, frameIndex) {
  const ctx = canvas.getContext('2d');
  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;
  const zoom = Math.max(1, Math.min(Math.floor(canvas.width / pixW), Math.floor(canvas.height / pixH)));
  const frame = sprite.frames[frameIndex];
  if (!frame) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Center the sprite in the thumbnail
  const offX = Math.floor((canvas.width - pixW * zoom) / 2);
  const offY = Math.floor((canvas.height - pixH * zoom) / 2);
  ctx.save();
  ctx.translate(offX, offY);
  renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, Math.ceil(pixW / 8), true);
  ctx.restore();
}

// ============================================================================
// Pixel Access
// ============================================================================

function spGetPixel(frame, x, y, pixW) {
  const bytesPerRow = Math.ceil(pixW / 8);
  const byteIdx = y * bytesPerRow + Math.floor(x / 8);
  const bitIdx = 7 - (x % 8);
  return (frame.bitmap[byteIdx] >> bitIdx) & 1;
}

function spSetPixel(frame, x, y, value, pixW) {
  const bytesPerRow = Math.ceil(pixW / 8);
  const byteIdx = y * bytesPerRow + Math.floor(x / 8);
  const bitIdx = 7 - (x % 8);
  if (value) {
    frame.bitmap[byteIdx] |= (1 << bitIdx);
  } else {
    frame.bitmap[byteIdx] &= ~(1 << bitIdx);
  }
}

function spGetMaskPixel(frame, x, y, pixW) {
  if (!frame.mask) return 0;
  const bytesPerRow = Math.ceil(pixW / 8);
  const byteIdx = y * bytesPerRow + Math.floor(x / 8);
  const bitIdx = 7 - (x % 8);
  return (frame.mask[byteIdx] >> bitIdx) & 1;
}

function spSetMaskPixel(frame, x, y, value, pixW) {
  if (!frame.mask) {
    const bytesPerRow = Math.ceil(pixW / 8);
    const pixH = frame.bitmap.length / bytesPerRow;
    frame.mask = new Uint8Array(frame.bitmap.length);
  }
  const bytesPerRow = Math.ceil(pixW / 8);
  const byteIdx = y * bytesPerRow + Math.floor(x / 8);
  const bitIdx = 7 - (x % 8);
  if (value) {
    frame.mask[byteIdx] |= (1 << bitIdx);
  } else {
    frame.mask[byteIdx] &= ~(1 << bitIdx);
  }
}

function spSetAttr(frame, cellX, cellY, ink, paper, bright, cellsW) {
  if (!frame.attrs) return;
  frame.attrs[cellY * cellsW + cellX] = (bright ? 64 : 0) | ((paper & 7) << 3) | (ink & 7);
}

// ============================================================================
// Drawing Tools
// ============================================================================

function spCanvasToPixel(e) {
  const canvas = spriteDOM.spriteEditorCanvas;
  const rect = canvas.getBoundingClientRect();
  const zoom = canvas._zoom;
  const x = Math.floor((e.clientX - rect.left) / zoom);
  const y = Math.floor((e.clientY - rect.top) / zoom);
  return { x, y };
}

function spIsInBounds(x, y) {
  const canvas = spriteDOM.spriteEditorCanvas;
  return x >= 0 && y >= 0 && x < canvas._pixW && y < canvas._pixH;
}

function pushUndo() {
  const frame = getCurrentFrame();
  if (!frame) return;
  spriteUndoStack.push({
    bitmap: new Uint8Array(frame.bitmap),
    mask: frame.mask ? new Uint8Array(frame.mask) : null,
    attrs: frame.attrs ? new Uint8Array(frame.attrs) : null,
    frameIndex: currentFrameIndex
  });
  if (spriteUndoStack.length > SPRITE_MAX_UNDO) spriteUndoStack.shift();
  spriteRedoStack = [];
}

function spriteUndo() {
  if (spriteUndoStack.length === 0) return;
  const frame = getCurrentFrame();
  if (!frame) return;

  // Push current to redo
  spriteRedoStack.push({
    bitmap: new Uint8Array(frame.bitmap),
    mask: frame.mask ? new Uint8Array(frame.mask) : null,
    attrs: frame.attrs ? new Uint8Array(frame.attrs) : null,
    frameIndex: currentFrameIndex
  });

  const state = spriteUndoStack.pop();
  if (state.frameIndex !== currentFrameIndex) {
    currentFrameIndex = state.frameIndex;
  }
  const targetFrame = getCurrentFrame();
  if (targetFrame) {
    targetFrame.bitmap.set(state.bitmap);
    if (state.mask) {
      if (!targetFrame.mask) targetFrame.mask = new Uint8Array(state.mask.length);
      targetFrame.mask.set(state.mask);
    }
    if (state.attrs) {
      if (!targetFrame.attrs) targetFrame.attrs = new Uint8Array(state.attrs.length);
      targetFrame.attrs.set(state.attrs);
    }
  }
  renderSpriteEditor();
}

function spriteRedo() {
  if (spriteRedoStack.length === 0) return;
  const frame = getCurrentFrame();
  if (!frame) return;

  spriteUndoStack.push({
    bitmap: new Uint8Array(frame.bitmap),
    mask: frame.mask ? new Uint8Array(frame.mask) : null,
    attrs: frame.attrs ? new Uint8Array(frame.attrs) : null,
    frameIndex: currentFrameIndex
  });

  const state = spriteRedoStack.pop();
  if (state.frameIndex !== currentFrameIndex) {
    currentFrameIndex = state.frameIndex;
  }
  const targetFrame = getCurrentFrame();
  if (targetFrame) {
    targetFrame.bitmap.set(state.bitmap);
    if (state.mask) {
      if (!targetFrame.mask) targetFrame.mask = new Uint8Array(state.mask.length);
      targetFrame.mask.set(state.mask);
    }
    if (state.attrs) {
      if (!targetFrame.attrs) targetFrame.attrs = new Uint8Array(state.attrs.length);
      targetFrame.attrs.set(state.attrs);
    }
  }
  renderSpriteEditor();
}

function onSpriteCanvasMouseDown(e) {
  const pos = spCanvasToPixel(e);
  if (!spIsInBounds(pos.x, pos.y)) return;

  const frame = getCurrentFrame();
  const sprite = getSelectedSprite();
  if (!frame || !sprite) return;

  const pixW = sprite.cellsW * 8;
  const rightButton = e.button === 2;

  if (currentSpriteTool === 'select') {
    // Start selection
    spriteSelectDragging = true;
    spriteSelectStartX = pos.x;
    spriteSelectStartY = pos.y;
    spriteSelection = { x: pos.x, y: pos.y, w: 1, h: 1 };
    renderSpriteEditor();
    return;
  }

  spriteDrawing = true;
  spriteLastDrawX = pos.x;
  spriteLastDrawY = pos.y;

  if (currentSpriteTool === 'draw' || currentSpriteTool === 'erase') {
    pushUndo();
    const value = currentSpriteTool === 'draw' ? (rightButton ? 0 : 1) : (rightButton ? 1 : 0);
    if (editingMask) {
      spSetMaskPixel(frame, pos.x, pos.y, value, pixW);
    } else {
      spSetPixel(frame, pos.x, pos.y, value, pixW);
      // In attr mode, set attribute for the cell
      if (sprite.mode === 'attr' && !rightButton && currentSpriteTool === 'draw') {
        const cellX = Math.floor(pos.x / 8);
        const cellY = Math.floor(pos.y / 8);
        spSetAttr(frame, cellX, cellY, spriteInk, spritePaper, spriteBright, sprite.cellsW);
      }
    }
    renderSpriteEditor();
  } else if (currentSpriteTool === 'fill') {
    pushUndo();
    if (editingMask) {
      const target = spGetMaskPixel(frame, pos.x, pos.y, pixW);
      spFloodFillMask(frame, pos.x, pos.y, target, target ? 0 : 1, pixW, sprite.cellsH * 8);
    } else {
      const target = spGetPixel(frame, pos.x, pos.y, pixW);
      spFloodFill(frame, pos.x, pos.y, target, target ? 0 : 1, pixW, sprite.cellsH * 8);
    }
    renderSpriteEditor();
  } else if (currentSpriteTool === 'line' || currentSpriteTool === 'rect') {
    pushUndo();
    spriteLineStartX = pos.x;
    spriteLineStartY = pos.y;
  }
}

function onSpriteCanvasMouseMove(e) {
  const pos = spCanvasToPixel(e);

  if (spriteSelectDragging) {
    const x = Math.min(spriteSelectStartX, pos.x);
    const y = Math.min(spriteSelectStartY, pos.y);
    const w = Math.abs(pos.x - spriteSelectStartX) + 1;
    const h = Math.abs(pos.y - spriteSelectStartY) + 1;
    spriteSelection = { x, y, w, h };
    renderSpriteEditor();
    return;
  }

  if (!spriteDrawing) return;
  if (!spIsInBounds(pos.x, pos.y)) return;

  const frame = getCurrentFrame();
  const sprite = getSelectedSprite();
  if (!frame || !sprite) return;
  const pixW = sprite.cellsW * 8;

  if (currentSpriteTool === 'draw' || currentSpriteTool === 'erase') {
    const value = currentSpriteTool === 'draw' ? 1 : 0;
    // Draw line from last position to current for smooth strokes
    spBresenhamLine(spriteLastDrawX, spriteLastDrawY, pos.x, pos.y, (x, y) => {
      if (spIsInBounds(x, y)) {
        if (editingMask) {
          spSetMaskPixel(frame, x, y, value, pixW);
        } else {
          spSetPixel(frame, x, y, value, pixW);
        }
      }
    });
    spriteLastDrawX = pos.x;
    spriteLastDrawY = pos.y;
    renderSpriteEditor();
  } else if (currentSpriteTool === 'line' || currentSpriteTool === 'rect') {
    // Preview: restore from undo then draw preview
    const undoState = spriteUndoStack[spriteUndoStack.length - 1];
    if (undoState) {
      frame.bitmap.set(undoState.bitmap);
      if (undoState.mask && frame.mask) frame.mask.set(undoState.mask);
    }
    if (currentSpriteTool === 'line') {
      spBresenhamLine(spriteLineStartX, spriteLineStartY, pos.x, pos.y, (x, y) => {
        if (spIsInBounds(x, y)) {
          if (editingMask) spSetMaskPixel(frame, x, y, 1, pixW);
          else spSetPixel(frame, x, y, 1, pixW);
        }
      });
    } else {
      spDrawRect(frame, spriteLineStartX, spriteLineStartY, pos.x, pos.y, 1, pixW);
    }
    renderSpriteEditor();
  }
}

function onSpriteCanvasMouseUp(e) {
  spriteSelectDragging = false;
  if (!spriteDrawing) return;
  spriteDrawing = false;

  // For line/rect: finalize
  if (currentSpriteTool === 'line' || currentSpriteTool === 'rect') {
    const pos = spCanvasToPixel(e);
    const frame = getCurrentFrame();
    const sprite = getSelectedSprite();
    if (frame && sprite) {
      const pixW = sprite.cellsW * 8;
      // Restore bitmap from undo state and redraw final
      const undoState = spriteUndoStack[spriteUndoStack.length - 1];
      if (undoState) {
        frame.bitmap.set(undoState.bitmap);
        if (undoState.mask && frame.mask) frame.mask.set(undoState.mask);
      }
      if (currentSpriteTool === 'line') {
        spBresenhamLine(spriteLineStartX, spriteLineStartY, pos.x, pos.y, (x, y) => {
          if (spIsInBounds(x, y)) {
            if (editingMask) spSetMaskPixel(frame, x, y, 1, pixW);
            else spSetPixel(frame, x, y, 1, pixW);
          }
        });
      } else {
        spDrawRect(frame, spriteLineStartX, spriteLineStartY, pos.x, pos.y, 1, pixW);
      }
    }
    renderSpriteEditor();
  }
}

// ============================================================================
// Drawing Primitives
// ============================================================================

function spBresenhamLine(x0, y0, x1, y1, plotFn) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    plotFn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function spDrawRect(frame, x0, y0, x1, y1, value, pixW) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  for (let x = minX; x <= maxX; x++) {
    if (spIsInBounds(x, minY)) { if (editingMask) spSetMaskPixel(frame, x, minY, value, pixW); else spSetPixel(frame, x, minY, value, pixW); }
    if (spIsInBounds(x, maxY)) { if (editingMask) spSetMaskPixel(frame, x, maxY, value, pixW); else spSetPixel(frame, x, maxY, value, pixW); }
  }
  for (let y = minY; y <= maxY; y++) {
    if (spIsInBounds(minX, y)) { if (editingMask) spSetMaskPixel(frame, minX, y, value, pixW); else spSetPixel(frame, minX, y, value, pixW); }
    if (spIsInBounds(maxX, y)) { if (editingMask) spSetMaskPixel(frame, maxX, y, value, pixW); else spSetPixel(frame, maxX, y, value, pixW); }
  }
}

function spFloodFill(frame, startX, startY, targetVal, replaceVal, pixW, pixH) {
  if (targetVal === replaceVal) return;
  const stack = [{ x: startX, y: startY }];
  const visited = new Set();

  while (stack.length > 0) {
    const { x, y } = stack.pop();
    if (x < 0 || y < 0 || x >= pixW || y >= pixH) continue;
    const key = y * pixW + x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (spGetPixel(frame, x, y, pixW) !== targetVal) continue;

    spSetPixel(frame, x, y, replaceVal, pixW);
    stack.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
  }
}

function spFloodFillMask(frame, startX, startY, targetVal, replaceVal, pixW, pixH) {
  if (targetVal === replaceVal) return;
  const stack = [{ x: startX, y: startY }];
  const visited = new Set();

  while (stack.length > 0) {
    const { x, y } = stack.pop();
    if (x < 0 || y < 0 || x >= pixW || y >= pixH) continue;
    const key = y * pixW + x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (spGetMaskPixel(frame, x, y, pixW) !== targetVal) continue;

    spSetMaskPixel(frame, x, y, replaceVal, pixW);
    stack.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
  }
}

// ============================================================================
// Tool Selection
// ============================================================================

function setSpriteTool(tool) {
  currentSpriteTool = tool;
  const toolBtns = ['spriteToolDraw', 'spriteToolErase', 'spriteToolFill',
                     'spriteToolLine', 'spriteToolRect', 'spriteToolSelect'];
  for (const id of toolBtns) {
    if (spriteDOM[id]) {
      spriteDOM[id].classList.toggle('active', id === 'spriteTool' + tool.charAt(0).toUpperCase() + tool.slice(1));
    }
  }
  // Update cursor
  const canvas = spriteDOM.spriteEditorCanvas;
  if (canvas) {
    canvas.style.cursor = tool === 'select' ? 'crosshair' : 'crosshair';
  }
}

function toggleMaskEditing() {
  editingMask = !editingMask;
  if (spriteDOM.spriteToolMask) {
    spriteDOM.spriteToolMask.classList.toggle('active', editingMask);
  }
  // Ensure mask array exists on current frame
  if (editingMask) {
    const frame = getCurrentFrame();
    const sprite = getSelectedSprite();
    if (frame && sprite && !frame.mask) {
      frame.mask = new Uint8Array(frame.bitmap.length);
    }
  }
  renderSpriteEditor();
}

// ============================================================================
// Color Palettes (Attributed Mode)
// ============================================================================

function buildColorPalettes() {
  buildPaletteRow(spriteDOM.spriteInkPalette, 'ink');
  buildPaletteRow(spriteDOM.spritePaperPalette, 'paper');
  spriteDOM.spriteBrightChk?.addEventListener('change', () => {
    spriteBright = spriteDOM.spriteBrightChk.checked;
    updatePaletteSelection();
  });
}

function buildPaletteRow(container, type) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('div');
    cell.className = 'sprite-color-cell';
    cell.style.background = SPRITE_ZX_COLORS[i];
    cell.dataset.color = String(i);
    cell.addEventListener('click', () => {
      if (type === 'ink') spriteInk = i;
      else spritePaper = i;
      updatePaletteSelection();
    });
    container.appendChild(cell);
  }
  updatePaletteSelection();
}

function updatePaletteSelection() {
  // Update ink palette selection
  if (spriteDOM.spriteInkPalette) {
    const cells = spriteDOM.spriteInkPalette.querySelectorAll('.sprite-color-cell');
    cells.forEach((cell, i) => {
      cell.classList.toggle('selected', i === spriteInk);
      cell.style.background = SPRITE_ZX_COLORS[i + (spriteBright ? 8 : 0)];
    });
  }
  // Update paper palette selection
  if (spriteDOM.spritePaperPalette) {
    const cells = spriteDOM.spritePaperPalette.querySelectorAll('.sprite-color-cell');
    cells.forEach((cell, i) => {
      cell.classList.toggle('selected', i === spritePaper);
      cell.style.background = SPRITE_ZX_COLORS[i + (spriteBright ? 8 : 0)];
    });
  }
}

// ============================================================================
// Transforms
// ============================================================================

function transformCurrentFrame(type) {
  const sprite = getSelectedSprite();
  const frame = getCurrentFrame();
  if (!sprite || !frame) return;

  pushUndo();

  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;
  const bytesPerRow = Math.ceil(pixW / 8);

  switch (type) {
    case 'flipH': spFlipHorizontal(frame, pixW, pixH); break;
    case 'flipV': spFlipVertical(frame, pixW, pixH); break;
    case 'rotCW': spRotateCW(sprite, frame); break;
    case 'rotCCW': spRotateCCW(sprite, frame); break;
    case 'shiftL': spShiftPixels(frame, pixW, pixH, -1, 0); break;
    case 'shiftR': spShiftPixels(frame, pixW, pixH, 1, 0); break;
    case 'shiftU': spShiftPixels(frame, pixW, pixH, 0, -1); break;
    case 'shiftD': spShiftPixels(frame, pixW, pixH, 0, 1); break;
    case 'invert': spInvertPixels(frame); break;
    case 'clear': spClearFrame(frame); break;
  }

  renderSpriteEditor();
}

function spFlipHorizontal(frame, pixW, pixH) {
  const temp = new Uint8Array(frame.bitmap.length);
  const bytesPerRow = Math.ceil(pixW / 8);

  for (let y = 0; y < pixH; y++) {
    for (let x = 0; x < pixW; x++) {
      const srcBit = spGetPixel(frame, x, y, pixW);
      const destX = pixW - 1 - x;
      const byteIdx = y * bytesPerRow + Math.floor(destX / 8);
      const bitIdx = 7 - (destX % 8);
      if (srcBit) temp[byteIdx] |= (1 << bitIdx);
    }
  }
  frame.bitmap.set(temp);

  if (frame.mask) {
    const tempMask = new Uint8Array(frame.mask.length);
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        const srcBit = spGetMaskPixel(frame, x, y, pixW);
        const destX = pixW - 1 - x;
        const byteIdx = y * bytesPerRow + Math.floor(destX / 8);
        const bitIdx = 7 - (destX % 8);
        if (srcBit) tempMask[byteIdx] |= (1 << bitIdx);
      }
    }
    frame.mask.set(tempMask);
  }
}

function spFlipVertical(frame, pixW, pixH) {
  const bytesPerRow = Math.ceil(pixW / 8);
  const temp = new Uint8Array(frame.bitmap.length);
  for (let y = 0; y < pixH; y++) {
    const srcOff = y * bytesPerRow;
    const destOff = (pixH - 1 - y) * bytesPerRow;
    for (let b = 0; b < bytesPerRow; b++) {
      temp[destOff + b] = frame.bitmap[srcOff + b];
    }
  }
  frame.bitmap.set(temp);

  if (frame.mask) {
    const tempMask = new Uint8Array(frame.mask.length);
    for (let y = 0; y < pixH; y++) {
      const srcOff = y * bytesPerRow;
      const destOff = (pixH - 1 - y) * bytesPerRow;
      for (let b = 0; b < bytesPerRow; b++) {
        tempMask[destOff + b] = frame.mask[srcOff + b];
      }
    }
    frame.mask.set(tempMask);
  }
}

function spRotateCW(sprite, frame) {
  // Only works for square sprites (cellsW === cellsH)
  if (sprite.cellsW !== sprite.cellsH) {
    alert('Rotation only supported for square sprites (same W and H).');
    return;
  }
  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;
  const temp = new Uint8Array(frame.bitmap.length);
  const bytesPerRow = Math.ceil(pixW / 8);

  for (let y = 0; y < pixH; y++) {
    for (let x = 0; x < pixW; x++) {
      const srcBit = spGetPixel(frame, x, y, pixW);
      // CW: (x,y) -> (pixH-1-y, x)
      const newX = pixH - 1 - y;
      const newY = x;
      const byteIdx = newY * bytesPerRow + Math.floor(newX / 8);
      const bitIdx = 7 - (newX % 8);
      if (srcBit) temp[byteIdx] |= (1 << bitIdx);
    }
  }
  frame.bitmap.set(temp);

  if (frame.mask) {
    const tempMask = new Uint8Array(frame.mask.length);
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        const srcBit = spGetMaskPixel(frame, x, y, pixW);
        const newX = pixH - 1 - y;
        const newY = x;
        const byteIdx = newY * bytesPerRow + Math.floor(newX / 8);
        const bitIdx = 7 - (newX % 8);
        if (srcBit) tempMask[byteIdx] |= (1 << bitIdx);
      }
    }
    frame.mask.set(tempMask);
  }

  // Rotate attrs
  if (frame.attrs) {
    const cellsW = sprite.cellsW;
    const tempAttrs = new Uint8Array(frame.attrs.length);
    for (let cy = 0; cy < cellsW; cy++) {
      for (let cx = 0; cx < cellsW; cx++) {
        tempAttrs[cx * cellsW + (cellsW - 1 - cy)] = frame.attrs[cy * cellsW + cx];
      }
    }
    frame.attrs.set(tempAttrs);
  }
}

function spRotateCCW(sprite, frame) {
  if (sprite.cellsW !== sprite.cellsH) {
    alert('Rotation only supported for square sprites (same W and H).');
    return;
  }
  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;
  const temp = new Uint8Array(frame.bitmap.length);
  const bytesPerRow = Math.ceil(pixW / 8);

  for (let y = 0; y < pixH; y++) {
    for (let x = 0; x < pixW; x++) {
      const srcBit = spGetPixel(frame, x, y, pixW);
      // CCW: (x,y) -> (y, pixW-1-x)
      const newX = y;
      const newY = pixW - 1 - x;
      const byteIdx = newY * bytesPerRow + Math.floor(newX / 8);
      const bitIdx = 7 - (newX % 8);
      if (srcBit) temp[byteIdx] |= (1 << bitIdx);
    }
  }
  frame.bitmap.set(temp);

  if (frame.mask) {
    const tempMask = new Uint8Array(frame.mask.length);
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        const srcBit = spGetMaskPixel(frame, x, y, pixW);
        const newX = y;
        const newY = pixW - 1 - x;
        const byteIdx = newY * bytesPerRow + Math.floor(newX / 8);
        const bitIdx = 7 - (newX % 8);
        if (srcBit) tempMask[byteIdx] |= (1 << bitIdx);
      }
    }
    frame.mask.set(tempMask);
  }

  if (frame.attrs) {
    const cellsW = sprite.cellsW;
    const tempAttrs = new Uint8Array(frame.attrs.length);
    for (let cy = 0; cy < cellsW; cy++) {
      for (let cx = 0; cx < cellsW; cx++) {
        tempAttrs[(cellsW - 1 - cx) * cellsW + cy] = frame.attrs[cy * cellsW + cx];
      }
    }
    frame.attrs.set(tempAttrs);
  }
}

function spShiftPixels(frame, pixW, pixH, dx, dy) {
  const temp = new Uint8Array(frame.bitmap.length);
  const bytesPerRow = Math.ceil(pixW / 8);

  for (let y = 0; y < pixH; y++) {
    for (let x = 0; x < pixW; x++) {
      const srcX = ((x - dx) % pixW + pixW) % pixW;
      const srcY = ((y - dy) % pixH + pixH) % pixH;
      if (spGetPixel(frame, srcX, srcY, pixW)) {
        const byteIdx = y * bytesPerRow + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        temp[byteIdx] |= (1 << bitIdx);
      }
    }
  }
  frame.bitmap.set(temp);

  if (frame.mask) {
    const tempMask = new Uint8Array(frame.mask.length);
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        const srcX = ((x - dx) % pixW + pixW) % pixW;
        const srcY = ((y - dy) % pixH + pixH) % pixH;
        if (spGetMaskPixel(frame, srcX, srcY, pixW)) {
          const byteIdx = y * bytesPerRow + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          tempMask[byteIdx] |= (1 << bitIdx);
        }
      }
    }
    frame.mask.set(tempMask);
  }
}

function spInvertPixels(frame) {
  for (let i = 0; i < frame.bitmap.length; i++) {
    frame.bitmap[i] = ~frame.bitmap[i] & 0xFF;
  }
}

function spClearFrame(frame) {
  frame.bitmap.fill(0);
  if (frame.mask) frame.mask.fill(0);
}

// ============================================================================
// Frame Management
// ============================================================================

function navigateFrame(delta) {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  currentFrameIndex = Math.max(0, Math.min(sprite.frames.length - 1, currentFrameIndex + delta));
  spriteSelection = null;
  renderSpriteEditor();
}

function addFrame() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  sprite.frames.push(createEmptyFrame(sprite.cellsW, sprite.cellsH, sprite.mode));
  currentFrameIndex = sprite.frames.length - 1;
  renderSpriteEditor();
}

function duplicateFrame() {
  const sprite = getSelectedSprite();
  const frame = getCurrentFrame();
  if (!sprite || !frame) return;
  const dup = {
    bitmap: new Uint8Array(frame.bitmap),
    mask: frame.mask ? new Uint8Array(frame.mask) : null,
    attrs: frame.attrs ? new Uint8Array(frame.attrs) : null
  };
  sprite.frames.splice(currentFrameIndex + 1, 0, dup);
  currentFrameIndex++;
  renderSpriteEditor();
}

function deleteFrame() {
  const sprite = getSelectedSprite();
  if (!sprite || sprite.frames.length <= 1) return;
  sprite.frames.splice(currentFrameIndex, 1);
  if (currentFrameIndex >= sprite.frames.length) currentFrameIndex = sprite.frames.length - 1;
  renderSpriteEditor();
}

function updateFrameInfo() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  if (spriteDOM.spriteFrameInfo) {
    spriteDOM.spriteFrameInfo.textContent = (currentFrameIndex + 1) + '/' + sprite.frames.length;
  }
}

// ============================================================================
// Animation Playback
// ============================================================================

function toggleAnimation() {
  if (spriteAnimPlaying) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

function startAnimation() {
  const sprite = getSelectedSprite();
  if (!sprite || sprite.frames.length <= 1) return;

  spriteAnimPlaying = true;
  if (spriteDOM.spritePlayBtn) spriteDOM.spritePlayBtn.innerHTML = '&#9632; Stop';

  const speed = parseInt(spriteDOM.spriteAnimSpeed?.value || '10');
  const interval = Math.max(16, Math.floor(1000 / speed));

  spriteAnimTimer = setInterval(() => {
    currentFrameIndex = (currentFrameIndex + 1) % sprite.frames.length;
    renderSpritePreview();
    updateFrameInfo();
    // Update frame bar selection without rebuilding DOM
    const thumbs = spriteDOM.spriteFrameBar?.children;
    if (thumbs) {
      for (let i = 0; i < thumbs.length; i++) {
        thumbs[i].style.borderColor = i === currentFrameIndex ? 'var(--accent-primary)' : 'var(--border-secondary)';
      }
    }
  }, interval);
}

function stopAnimation() {
  spriteAnimPlaying = false;
  if (spriteDOM.spritePlayBtn) spriteDOM.spritePlayBtn.innerHTML = '&#9654; Play';
  if (spriteAnimTimer) {
    clearInterval(spriteAnimTimer);
    spriteAnimTimer = null;
  }
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function onSpriteKeyDown(e) {
  if (!spriteEditorOpen) return;
  // Don't intercept if typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // Only handle if panel is visible
  if (spriteDOM.spriteEditorPanel?.style.display === 'none') return;

  switch (e.key.toLowerCase()) {
    case 'd': setSpriteTool('draw'); e.preventDefault(); break;
    case 'e': setSpriteTool('erase'); e.preventDefault(); break;
    case 'f': setSpriteTool('fill'); e.preventDefault(); break;
    case 'l': setSpriteTool('line'); e.preventDefault(); break;
    case 'r': setSpriteTool('rect'); e.preventDefault(); break;
    case 's': setSpriteTool('select'); e.preventDefault(); break;
    case 'm': toggleMaskEditing(); e.preventDefault(); break;
    case 'z':
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) spriteRedo();
        else spriteUndo();
        e.preventDefault();
      }
      break;
    case 'y':
      if (e.ctrlKey || e.metaKey) { spriteRedo(); e.preventDefault(); }
      break;
  }
}

// ============================================================================
// Brush Integration
// ============================================================================

// ============================================================================
// Grab from Screen (rectangle-drag mode)
// ============================================================================

/**
 * Toggle grab mode on/off.
 */
function toggleGrabMode() {
  if (spriteGrabMode) {
    cancelGrabMode();
  } else {
    startGrabMode();
  }
}

/**
 * Enter grab mode: user drags a rectangle on the canvas to select sprites.
 * The rectangle is snapped to 8px grid. On mouse-up, the selected region is
 * split into cell-sized sprites (cellW×cellH from config) and added to the sheet.
 */
function startGrabMode() {
  if (typeof screenData === 'undefined' || !screenData || screenData.length === 0) {
    alert('No picture loaded to grab from.');
    return;
  }

  spriteGrabMode = true;
  if (spriteDOM.spriteGrabBtn) {
    spriteDOM.spriteGrabBtn.classList.add('active');
  }
  if (spriteDOM.spriteGrabStopBtn) {
    spriteDOM.spriteGrabStopBtn.style.display = '';
  }
  if (spriteDOM.spriteGrabConfig) {
    spriteDOM.spriteGrabConfig.style.display = '';
  }
  if (spriteDOM.spriteGrabStatus) {
    spriteDOM.spriteGrabStatus.textContent = 'Drag on canvas...';
  }

  const canvas = document.getElementById('screenCanvas');
  if (!canvas) { cancelGrabMode(); return; }

  // Create overlay div for the dragged rectangle
  spriteGrabOverlay = document.createElement('div');
  spriteGrabOverlay.id = 'spriteGrabOverlay';
  spriteGrabOverlay.style.cssText = 'position:fixed;z-index:8999;pointer-events:none;border:2px dashed #00ff00;background:rgba(0,255,0,0.08);display:none;';
  document.body.appendChild(spriteGrabOverlay);

  spriteGrabDragging = false;

  // Helper: convert client coords to screen pixel coords (snapped to 8px grid)
  function clientToScreenCell(e) {
    const rect = canvas.getBoundingClientRect();
    const z = typeof zoom !== 'undefined' ? zoom : 2;
    const border = typeof borderSize !== 'undefined' ? borderSize : 0;
    const borderPx = border * z;
    const px = (e.clientX - rect.left - borderPx) / z;
    const py = (e.clientY - rect.top - borderPx) / z;
    const scrW = typeof getFormatWidth === 'function' ? getFormatWidth() : 256;
    const scrH = typeof getFormatHeight === 'function' ? getFormatHeight() : 192;
    return {
      x: Math.max(0, Math.min(Math.floor(px / 8) * 8, scrW - 8)),
      y: Math.max(0, Math.min(Math.floor(py / 8) * 8, scrH - 8))
    };
  }

  // Helper: position overlay div from screen coords
  function positionOverlay(x1, y1, x2, y2) {
    const rect = canvas.getBoundingClientRect();
    const z = typeof zoom !== 'undefined' ? zoom : 2;
    const border = typeof borderSize !== 'undefined' ? borderSize : 0;
    const borderPx = border * z;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1) + 8; // +8 because coords are cell-snapped
    const h = Math.abs(y2 - y1) + 8;
    spriteGrabOverlay.style.display = '';
    spriteGrabOverlay.style.left = (rect.left + borderPx + left * z) + 'px';
    spriteGrabOverlay.style.top = (rect.top + borderPx + top * z) + 'px';
    spriteGrabOverlay.style.width = (w * z) + 'px';
    spriteGrabOverlay.style.height = (h * z) + 'px';
  }

  spriteGrabMouseDown = function(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const cell = clientToScreenCell(e);
    spriteGrabStartX = cell.x;
    spriteGrabStartY = cell.y;
    spriteGrabDragging = true;
    positionOverlay(cell.x, cell.y, cell.x, cell.y);
  };

  spriteGrabMouseMove = function(e) {
    if (!spriteGrabDragging) return;
    e.preventDefault();
    const cell = clientToScreenCell(e);
    positionOverlay(spriteGrabStartX, spriteGrabStartY, cell.x, cell.y);
  };

  spriteGrabMouseUp = function(e) {
    if (!spriteGrabDragging) return;
    e.preventDefault();
    e.stopPropagation();
    spriteGrabDragging = false;

    const cell = clientToScreenCell(e);
    const x1 = Math.min(spriteGrabStartX, cell.x);
    const y1 = Math.min(spriteGrabStartY, cell.y);
    const x2 = Math.max(spriteGrabStartX, cell.x) + 8;
    const y2 = Math.max(spriteGrabStartY, cell.y) + 8;
    const regionW = x2 - x1; // pixels
    const regionH = y2 - y1;

    if (regionW < 8 || regionH < 8) {
      // Too small, ignore
      if (spriteGrabOverlay) spriteGrabOverlay.style.display = 'none';
      return;
    }

    grabRegionFromScreen(x1, y1, regionW, regionH);

    // Hide overlay after grab but stay in grab mode for more grabs
    if (spriteGrabOverlay) spriteGrabOverlay.style.display = 'none';
  };

  canvas.addEventListener('mousedown', spriteGrabMouseDown, { capture: true });
  document.addEventListener('mousemove', spriteGrabMouseMove);
  document.addEventListener('mouseup', spriteGrabMouseUp);

  // Escape cancels
  spriteGrabEscHandler = function(e) {
    if (e.key === 'Escape') cancelGrabMode();
  };
  document.addEventListener('keydown', spriteGrabEscHandler);
}

/**
 * Cancel grab mode, remove all event listeners and overlay.
 */
function cancelGrabMode() {
  spriteGrabMode = false;
  spriteGrabDragging = false;

  if (spriteDOM.spriteGrabBtn) {
    spriteDOM.spriteGrabBtn.classList.remove('active');
  }
  if (spriteDOM.spriteGrabStopBtn) {
    spriteDOM.spriteGrabStopBtn.style.display = 'none';
  }
  if (spriteDOM.spriteGrabConfig) {
    spriteDOM.spriteGrabConfig.style.display = 'none';
  }
  if (spriteDOM.spriteGrabStatus) {
    spriteDOM.spriteGrabStatus.textContent = '';
  }

  const canvas = document.getElementById('screenCanvas');
  if (canvas && spriteGrabMouseDown) {
    canvas.removeEventListener('mousedown', spriteGrabMouseDown, { capture: true });
  }
  if (spriteGrabMouseMove) {
    document.removeEventListener('mousemove', spriteGrabMouseMove);
  }
  if (spriteGrabMouseUp) {
    document.removeEventListener('mouseup', spriteGrabMouseUp);
  }
  if (spriteGrabEscHandler) {
    document.removeEventListener('keydown', spriteGrabEscHandler);
  }

  if (spriteGrabOverlay) {
    spriteGrabOverlay.remove();
    spriteGrabOverlay = null;
  }
  spriteGrabMouseDown = null;
  spriteGrabMouseMove = null;
  spriteGrabMouseUp = null;
  spriteGrabEscHandler = null;
}

/**
 * Grab a rectangular region from the loaded screen and add as sprite(s).
 *
 * In "single" mode: the entire rectangle becomes one sprite.
 * In "grid" mode: the rectangle is split into a grid of cellW×cellH sprites.
 *
 * @param {number} regionX - Top-left X of the region (pixels, 8px-aligned)
 * @param {number} regionY - Top-left Y of the region (pixels, 8px-aligned)
 * @param {number} regionW - Width in pixels (multiple of 8)
 * @param {number} regionH - Height in pixels (multiple of 8)
 */
function grabRegionFromScreen(regionX, regionY, regionW, regionH) {
  const mode = spriteDOM.spriteGrabMode?.value || 'single';
  const attrMode = spriteDOM.spriteGrabAttrMode?.value || 'mono';
  const isGrid = mode === 'grid' || mode === 'gridphases';
  const isPhases = mode === 'phases' || mode === 'gridphases';

  const regionCellsW = Math.floor(regionW / 8);
  const regionCellsH = Math.floor(regionH / 8);
  if (regionCellsW <= 0 || regionCellsH <= 0) return;

  // Build list of extracted frames + determine sprite cell dimensions
  let frames = [];
  let cellsW, cellsH;

  if (isGrid) {
    const sizeBy = spriteDOM.spriteGrabSizeBy?.value || 'cells';
    const order = spriteDOM.spriteGrabOrder?.value || 'row';
    let cols, rows;

    if (sizeBy === 'count') {
      // Divide region evenly into N cols × M rows
      cols = parseInt(spriteDOM.spriteGrabCols?.value) || 4;
      rows = parseInt(spriteDOM.spriteGrabRows?.value) || 4;
      cellsW = Math.floor(regionCellsW / cols);
      cellsH = Math.floor(regionCellsH / rows);
      if (cellsW <= 0 || cellsH <= 0) {
        if (spriteDOM.spriteGrabStatus)
          spriteDOM.spriteGrabStatus.textContent = 'Region too small for ' + cols + 'x' + rows + ' grid';
        return;
      }
    } else {
      // Each sprite has fixed cell size
      cellsW = parseInt(spriteDOM.spriteGrabW?.value) || 2;
      cellsH = parseInt(spriteDOM.spriteGrabH?.value) || 2;
      cols = Math.floor(regionW / (cellsW * 8));
      rows = Math.floor(regionH / (cellsH * 8));
    }
    if (cols <= 0 || rows <= 0) {
      if (spriteDOM.spriteGrabStatus)
        spriteDOM.spriteGrabStatus.textContent = 'Region too small for ' + cellsW + 'x' + cellsH + ' cells';
      return;
    }

    if (order === 'col') {
      // Top→Bottom, then Left→Right
      for (let col = 0; col < cols; col++)
        for (let row = 0; row < rows; row++)
          frames.push(extractFrameFromScreen(
            regionX + col * cellsW * 8, regionY + row * cellsH * 8,
            cellsW, cellsH, attrMode));
    } else {
      // Left→Right, then Top→Bottom (reading order)
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++)
          frames.push(extractFrameFromScreen(
            regionX + col * cellsW * 8, regionY + row * cellsH * 8,
            cellsW, cellsH, attrMode));
    }
  } else {
    cellsW = regionCellsW;
    cellsH = regionCellsH;
    frames.push(extractFrameFromScreen(regionX, regionY, cellsW, cellsH, attrMode));
  }

  // Add to sprite sheet
  if (isPhases) {
    // phases / gridphases: append frame(s) to selected sprite, or create one
    const sprite = getSelectedSprite();
    if (sprite && sprite.cellsW === cellsW && sprite.cellsH === cellsH) {
      for (const f of frames) sprite.frames.push(f);
      currentFrameIndex = sprite.frames.length - 1;
    } else {
      if (sprite && (sprite.cellsW !== cellsW || sprite.cellsH !== cellsH)) {
        // Size mismatch — create new sprite for these phases
      }
      spriteSheet.sprites.push({
        name: 'Grabbed_' + (spriteSheet.sprites.length + 1),
        cellsW: cellsW, cellsH: cellsH, mode: attrMode, frames: frames
      });
      selectedSpriteIndex = spriteSheet.sprites.length - 1;
      currentFrameIndex = frames.length - 1;
    }
    if (spriteDOM.spriteGrabStatus)
      spriteDOM.spriteGrabStatus.textContent = frames.length + ' frame(s) added';
  } else if (isGrid) {
    // grid: each cell = separate sprite
    const baseNum = spriteSheet.sprites.length + 1;
    for (let i = 0; i < frames.length; i++)
      spriteSheet.sprites.push({
        name: 'Grabbed_' + (baseNum + i),
        cellsW: cellsW, cellsH: cellsH, mode: attrMode, frames: [frames[i]]
      });
    selectedSpriteIndex = spriteSheet.sprites.length - 1;
    currentFrameIndex = 0;
    if (spriteDOM.spriteGrabStatus)
      spriteDOM.spriteGrabStatus.textContent = frames.length + ' sprites grabbed';
  } else {
    // single: one new sprite
    spriteSheet.sprites.push({
      name: 'Grabbed_' + (spriteSheet.sprites.length + 1),
      cellsW: cellsW, cellsH: cellsH, mode: attrMode, frames: frames
    });
    selectedSpriteIndex = spriteSheet.sprites.length - 1;
    currentFrameIndex = 0;
    if (spriteDOM.spriteGrabStatus)
      spriteDOM.spriteGrabStatus.textContent = cellsW + 'x' + cellsH + ' sprite grabbed';
  }

  updateSpriteList();
  updateSpriteProps();
}

/**
 * Extract a single frame from screen data at the given position.
 *
 * @param {number} startX - Top-left X pixel
 * @param {number} startY - Top-left Y pixel
 * @param {number} cellsW - Width in 8px cells
 * @param {number} cellsH - Height in 8px cells
 * @param {string} mode - 'mono' or 'attr'
 * @returns {object} SpriteFrame object {bitmap, mask, attrs}
 */
function extractFrameFromScreen(startX, startY, cellsW, cellsH, mode) {
  const pixW = cellsW * 8;
  const pixH = cellsH * 8;
  const bytesPerRow = Math.ceil(pixW / 8);

  const bitmap = new Uint8Array(pixH * bytesPerRow);
  for (let y = 0; y < pixH; y++) {
    for (let x = 0; x < pixW; x++) {
      const scrX = startX + x;
      const scrY = startY + y;
      let pixVal = 0;
      if (typeof getPixel === 'function') {
        pixVal = getPixel(screenData, scrX, scrY);
      }
      if (pixVal) {
        const byteIdx = y * bytesPerRow + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        bitmap[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  let attrs = null;
  if (mode === 'attr') {
    attrs = new Uint8Array(cellsW * cellsH);
    for (let cy = 0; cy < cellsH; cy++) {
      for (let cx = 0; cx < cellsW; cx++) {
        const scrX = startX + cx * 8;
        const scrY = startY + cy * 8;
        if (typeof getAttributeAddress === 'function' && screenData) {
          const addr = getAttributeAddress(scrX, scrY);
          attrs[cy * cellsW + cx] = screenData[addr] || 7;
        } else {
          attrs[cy * cellsW + cx] = 7;
        }
      }
    }
  }

  return { bitmap: bitmap, mask: null, attrs: attrs };
}

// ============================================================================
// Brush Integration
// ============================================================================

function useAsBrush() {
  const sprite = getSelectedSprite();
  const frame = getCurrentFrame();
  if (!sprite || !frame) return;

  const pixW = sprite.cellsW * 8;
  const pixH = sprite.cellsH * 8;

  // Build brush data in the format screen_editor expects: {width, height, data, mask}
  // data is an array of pixel rows, each row is a set of bytes
  const bytesPerRow = Math.ceil(pixW / 8);
  const brushData = new Uint8Array(pixH * bytesPerRow);
  brushData.set(frame.bitmap);

  let brushMask = null;
  if (frame.mask) {
    brushMask = new Uint8Array(pixH * bytesPerRow);
    brushMask.set(frame.mask);
  }

  activeSpriteBrush = {
    width: pixW,
    height: pixH,
    data: brushData,
    mask: brushMask
  };

  // Set the screen editor to use this sprite brush
  if (typeof activeCustomBrush !== 'undefined') {
    activeCustomBrush = -3;
  }

  // Visual feedback
  if (spriteDOM.spriteUseBrushBtn) {
    const origText = spriteDOM.spriteUseBrushBtn.textContent;
    spriteDOM.spriteUseBrushBtn.textContent = 'Set!';
    setTimeout(() => { spriteDOM.spriteUseBrushBtn.textContent = origText; }, 600);
  }
}

// ============================================================================
// Save/Load Sprite Sheet (.sls)
// ============================================================================

function saveSpriteSheet() {
  if (spriteSheet.sprites.length === 0) {
    alert('No sprites to save.');
    return;
  }

  const data = {
    type: 'spectralab-sprites',
    version: 1,
    name: spriteSheet.name,
    sprites: spriteSheet.sprites.map(sprite => ({
      name: sprite.name,
      cellsW: sprite.cellsW,
      cellsH: sprite.cellsH,
      mode: sprite.mode,
      frames: sprite.frames.map(frame => ({
        bitmap: Array.from(frame.bitmap),
        mask: frame.mask ? Array.from(frame.mask) : null,
        attrs: frame.attrs ? Array.from(frame.attrs) : null
      }))
    }))
  };

  const json = JSON.stringify(data, null, 2);
  const baseName = spriteSheet.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprites';
  downloadFile(json, baseName + '.sls', 'application/json');
}

function onSpriteFileLoad(e) {
  const file = e.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener('load', function(event) {
    try {
      const json = /** @type {string} */ (event.target?.result);
      const data = JSON.parse(json);

      if (data.type !== 'spectralab-sprites' || !data.sprites || !Array.isArray(data.sprites)) {
        alert('Invalid sprite sheet file.');
        return;
      }

      loadSpriteSheetData(data);
    } catch (err) {
      alert('Error loading sprite sheet: ' + err.message);
    }
  });
  reader.readAsText(file);

  // Reset input so same file can be loaded again
  e.target.value = '';
}

function loadSpriteSheetData(data) {
  spriteSheet.name = data.name || 'Untitled';
  spriteSheet.sprites = [];

  for (const spriteData of data.sprites) {
    const sprite = {
      name: spriteData.name || 'Unnamed',
      cellsW: spriteData.cellsW || 1,
      cellsH: spriteData.cellsH || 1,
      mode: spriteData.mode || 'mono',
      frames: []
    };

    for (const frameData of spriteData.frames) {
      const frame = {
        bitmap: new Uint8Array(frameData.bitmap),
        mask: frameData.mask ? new Uint8Array(frameData.mask) : null,
        attrs: frameData.attrs ? new Uint8Array(frameData.attrs) : null
      };
      sprite.frames.push(frame);
    }

    if (sprite.frames.length === 0) {
      sprite.frames.push(createEmptyFrame(sprite.cellsW, sprite.cellsH, sprite.mode));
    }

    spriteSheet.sprites.push(sprite);
  }

  selectedSpriteIndex = spriteSheet.sprites.length > 0 ? 0 : -1;
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
}

// ============================================================================
// Project Save/Load Integration
// ============================================================================

/**
 * Returns sprite sheet data for inclusion in .slp project save.
 * Called from screen_editor.js saveProject().
 * @returns {object|null}
 */
function getSpriteSheetForProject() {
  if (spriteSheet.sprites.length === 0) return null;
  return {
    name: spriteSheet.name,
    sprites: spriteSheet.sprites.map(sprite => ({
      name: sprite.name,
      cellsW: sprite.cellsW,
      cellsH: sprite.cellsH,
      mode: sprite.mode,
      frames: sprite.frames.map(frame => ({
        bitmap: Array.from(frame.bitmap),
        mask: frame.mask ? Array.from(frame.mask) : null,
        attrs: frame.attrs ? Array.from(frame.attrs) : null
      }))
    }))
  };
}

/**
 * Restores sprite sheet from project data.
 * Called from screen_editor.js loadProject().
 * @param {object} data
 */
function restoreSpriteSheetFromProject(data) {
  if (!data || !data.sprites) return;
  loadSpriteSheetData({ type: 'spectralab-sprites', version: 1, ...data });
}

// ============================================================================
// ASM Export
// ============================================================================

function exportSpriteAsm() {
  if (spriteSheet.sprites.length === 0) {
    alert('No sprites to export.');
    return;
  }

  let asm = '; SpectraLab Sprite Sheet: ' + spriteSheet.name + '\n';
  asm += '; Generated by SpectraLab v' + APP_VERSION + '\n\n';

  for (const sprite of spriteSheet.sprites) {
    const label = sprite.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const pixW = sprite.cellsW * 8;
    const pixH = sprite.cellsH * 8;
    asm += '; Sprite: ' + sprite.name + ' (' + pixW + 'x' + pixH;
    if (sprite.frames.length > 1) asm += ', ' + sprite.frames.length + ' frames';
    asm += ')\n';

    for (let fi = 0; fi < sprite.frames.length; fi++) {
      const frame = sprite.frames[fi];
      const frameSuffix = sprite.frames.length > 1 ? '_f' + fi : '';

      // Bitmap with visual binary comments
      asm += label + frameSuffix + ':\n';
      asm += formatDbLinesVisual(Array.from(frame.bitmap), sprite.cellsW) + '\n';

      // Mask with visual binary comments (if exists)
      if (frame.mask) {
        asm += label + '_mask' + frameSuffix + ':\n';
        asm += formatDbLinesVisual(Array.from(frame.mask), sprite.cellsW) + '\n';
      }

      // Attrs (no visual — these are color values, not bitmaps)
      if (frame.attrs) {
        asm += label + '_attr' + frameSuffix + ':\n';
        asm += formatDbLines(Array.from(frame.attrs), sprite.cellsW) + '\n';
      }

      asm += '\n';
    }
  }

  const baseName = spriteSheet.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprites';
  downloadFile(asm, baseName + '.asm', 'text/plain');
}

// ============================================================================
// Binary Export
// ============================================================================

function exportSpriteBin() {
  if (spriteSheet.sprites.length === 0) {
    alert('No sprites to export.');
    return;
  }

  // Calculate total size
  let totalSize = 0;
  for (const sprite of spriteSheet.sprites) {
    for (const frame of sprite.frames) {
      totalSize += frame.bitmap.length;
      if (frame.mask) totalSize += frame.mask.length;
      if (frame.attrs) totalSize += frame.attrs.length;
    }
  }

  const buffer = new Uint8Array(totalSize);
  let offset = 0;

  for (const sprite of spriteSheet.sprites) {
    for (const frame of sprite.frames) {
      buffer.set(frame.bitmap, offset);
      offset += frame.bitmap.length;
      if (frame.mask) {
        buffer.set(frame.mask, offset);
        offset += frame.mask.length;
      }
      if (frame.attrs) {
        buffer.set(frame.attrs, offset);
        offset += frame.attrs.length;
      }
    }
  }

  const baseName = spriteSheet.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprites';
  downloadFile(new Blob([buffer], { type: 'application/octet-stream' }), baseName + '.bin');
}

// ============================================================================
// Init on DOMContentLoaded
// ============================================================================

document.addEventListener('DOMContentLoaded', initSpriteEditor);
