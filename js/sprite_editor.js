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

/** @type {Set<number>} */
let selectedSpriteIndices = new Set();

/** @type {number} */
let spriteSelectionAnchor = -1;

/** @type {HTMLElement|null} */
let spriteContextMenu = null;

/** @type {number} */
let currentFrameIndex = 0;

/** @type {Set<number>} */
let selectedFrameIndices = new Set();

/** @type {number} */
let frameSelectionAnchor = -1;

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
let spriteDrawRight = false;
let spriteRenderPending = false;
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

// Attr scroll state
let spriteAttrScrollEnabled = false;
let attrScrollAccum = { dx: 0, dy: 0 };

// ---- Helpers ----

/** Get the pixel height of one attribute cell for a sprite */
function getAttrCellH(sprite) {
  if (sprite.mode === 'multicolour') return sprite.attrCellH || 2;
  if (sprite.mode === 'attr') return 8;
  return 8;
}

/** Get the number of attribute rows per 8x8 cell */
function getAttrRowsPerCell(sprite) {
  return 8 / getAttrCellH(sprite);
}

/** Set a single sprite as active (updates index, selection set, and anchor). */
function setActiveSprite(index) {
  selectedSpriteIndex = index;
  selectedSpriteIndices.clear();
  if (index >= 0) {
    selectedSpriteIndices.add(index);
    spriteSelectionAnchor = index;
  } else {
    spriteSelectionAnchor = -1;
  }
  attrScrollAccum = { dx: 0, dy: 0 };
}

// ---- DOM cache ----
let spriteDOM = {};

// ============================================================================
// Initialization
// ============================================================================

function initSpriteEditor() {
  // Cache DOM elements
  const ids = [
    'spriteList', 'spriteAddBtn', 'spriteDeleteBtn', 'spriteClearAllBtn',
    'spriteProps', 'spriteName',
    'spriteCellsW', 'spriteCellsH', 'spriteMode', 'spriteFrameBar', 'spriteEditBtn',
    'spriteGrabBtn', 'spriteGrabStatus', 'spriteGrabConfig', 'spriteGrabMode',
    'spriteGrabGridOpts', 'spriteGrabSizeBy', 'spriteGrabByCount',
    'spriteGrabCols', 'spriteGrabRows', 'spriteGrabOrder',
    'spriteGrabStopBtn',
    'spriteUseBrushBtn', 'spriteSaveBtn', 'spriteLoadBtn', 'spriteExportFormat',
    'spriteExportAsmBtn', 'spriteExportBinBtn', 'spriteFileInput',
    'spriteEditorPanel', 'spriteEditorTitle',
    'spriteEditorClose', 'spriteEditorCanvas', 'spritePreviewCanvas',
    'spriteToolDraw', 'spriteToolErase', 'spriteToolFill', 'spriteToolLine',
    'spriteToolRect', 'spriteToolSelect', 'spriteToolMask', 'spriteAttrControls',
    'spriteColorPalette', 'spriteBrightChk',
    'spriteOnionSkin', 'spriteShowGrid', 'spriteShowAttrs', 'spriteShowMask',
    'spriteFramePrev', 'spriteFrameInfo', 'spriteFrameNext', 'spriteFrameAdd',
    'spriteFrameDup', 'spriteFrameDel', 'spriteFrameMoveL', 'spriteFrameMoveR',
    'spritePlayBtn', 'spriteAnimSpeed',
    'spriteFlipH', 'spriteFlipV', 'spriteRotCW', 'spriteRotCCW',
    'spriteAttrScroll', 'spriteAttrScrollLabel',
    'spriteShiftL', 'spriteShiftR', 'spriteShiftU', 'spriteShiftD',
    'spriteInvert', 'spriteClear'
  ];
  for (const id of ids) {
    spriteDOM[id] = document.getElementById(id);
  }

  // Sprite list click/dblclick via delegation
  spriteDOM.spriteList?.addEventListener('click', function(e) {
    const item = e.target.closest('.sprite-list-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index);
    if (isNaN(idx)) return;
    if (e.ctrlKey || e.metaKey) {
      ctrlClickSprite(idx);
    } else if (e.shiftKey) {
      shiftClickSprite(idx);
    } else {
      plainClickSprite(idx);
    }
  });
  spriteDOM.spriteList?.addEventListener('dblclick', function(e) {
    const item = e.target.closest('.sprite-list-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index);
    if (!isNaN(idx)) { plainClickSprite(idx); openSpriteEditor(); }
  });

  // Right-click context menu on sprite list
  spriteDOM.spriteList?.addEventListener('contextmenu', function(e) {
    const item = e.target.closest('.sprite-list-item');
    if (!item) return;
    e.preventDefault();
    const idx = parseInt(item.dataset.index);
    if (isNaN(idx)) return;
    // If right-clicked sprite is not in selection, plain-select it first
    if (!selectedSpriteIndices.has(idx)) {
      plainClickSprite(idx);
    }
    showSpriteContextMenu(e.clientX, e.clientY);
  });

  // Global dismiss for context menu
  document.addEventListener('click', dismissSpriteContextMenu);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') dismissSpriteContextMenu();
  });

  // Sidebar buttons
  spriteDOM.spriteAddBtn?.addEventListener('click', () => addSprite());
  spriteDOM.spriteDeleteBtn?.addEventListener('click', deleteSelectedSprites);
  spriteDOM.spriteClearAllBtn?.addEventListener('click', clearAllSprites);
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
  spriteDOM.spriteFrameDel?.addEventListener('click', deleteSelectedFrames);
  spriteDOM.spriteFrameMoveL?.addEventListener('click', () => moveSelectedFrames(-1));
  spriteDOM.spriteFrameMoveR?.addEventListener('click', () => moveSelectedFrames(1));
  spriteDOM.spritePlayBtn?.addEventListener('click', toggleAnimation);

  // Checkbox changes trigger re-render
  spriteDOM.spriteOnionSkin?.addEventListener('change', () => renderSpriteEditor());
  spriteDOM.spriteShowGrid?.addEventListener('change', () => renderSpriteEditor());
  spriteDOM.spriteShowAttrs?.addEventListener('change', () => renderSpriteEditor());
  spriteDOM.spriteShowMask?.addEventListener('change', () => renderSpriteEditor());

  // Transform buttons
  spriteDOM.spriteFlipH?.addEventListener('click', () => transformCurrentFrame('flipH'));
  spriteDOM.spriteFlipV?.addEventListener('click', () => transformCurrentFrame('flipV'));
  spriteDOM.spriteRotCW?.addEventListener('click', () => transformCurrentFrame('rotCW'));
  spriteDOM.spriteRotCCW?.addEventListener('click', () => transformCurrentFrame('rotCCW'));
  spriteDOM.spriteAttrScroll?.addEventListener('change', () => {
    spriteAttrScrollEnabled = spriteDOM.spriteAttrScroll.checked;
    attrScrollAccum = { dx: 0, dy: 0 };
  });
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

function createEmptyFrame(cellsW, cellsH, mode, attrCellH) {
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
  } else if (mode === 'multicolour') {
    const rowsPerCell = 8 / (attrCellH || 2);
    frame.attrs = new Uint8Array(cellsW * cellsH * rowsPerCell);
    frame.attrs.fill(7);
  }
  return frame;
}

function addSprite(name, cellsW, cellsH, mode, attrCellH) {
  name = name || 'Sprite' + (spriteSheet.sprites.length + 1);
  cellsW = cellsW || 1;
  cellsH = cellsH || 1;
  mode = mode || 'mono';

  const sprite = {
    name: name,
    cellsW: cellsW,
    cellsH: cellsH,
    mode: mode,
    attrCellH: mode === 'multicolour' ? (attrCellH || 2) : undefined,
    frames: [createEmptyFrame(cellsW, cellsH, mode, attrCellH)]
  };

  spriteSheet.sprites.push(sprite);
  setActiveSprite(spriteSheet.sprites.length - 1);
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
}

function deleteSelectedSprites() {
  if (selectedSpriteIndices.size === 0 && selectedSpriteIndex >= 0) {
    selectedSpriteIndices.add(selectedSpriteIndex);
  }
  if (selectedSpriteIndices.size === 0) return;
  // Delete in descending order so indices stay valid
  const sorted = Array.from(selectedSpriteIndices).sort((a, b) => b - a);
  for (const idx of sorted) {
    if (idx >= 0 && idx < spriteSheet.sprites.length) {
      spriteSheet.sprites.splice(idx, 1);
    }
  }
  selectedSpriteIndices.clear();
  // Adjust active index
  if (spriteSheet.sprites.length === 0) {
    setActiveSprite(-1);
  } else {
    const newIdx = Math.min(sorted[sorted.length - 1], spriteSheet.sprites.length - 1);
    setActiveSprite(newIdx);
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

function clearAllSprites() {
  if (spriteSheet.sprites.length === 0) return;
  if (!confirm('Delete all ' + spriteSheet.sprites.length + ' sprites?')) return;
  spriteSheet.sprites.length = 0;
  selectedSpriteIndices.clear();
  setActiveSprite(-1);
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
  if (spriteEditorOpen) closeSpriteEditor();
}

function deepCopyFrame(frame) {
  return {
    bitmap: new Uint8Array(frame.bitmap),
    mask: frame.mask ? new Uint8Array(frame.mask) : null,
    attrs: frame.attrs ? new Uint8Array(frame.attrs) : null
  };
}

function splitFramesToSprites() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  if (sprite.frames.length <= 1) {
    alert('This sprite has only 1 frame — nothing to split.');
    return;
  }
  const idx = selectedSpriteIndex;
  const newSprites = [];
  for (let i = 0; i < sprite.frames.length; i++) {
    newSprites.push({
      name: sprite.name + '_f' + (i + 1),
      cellsW: sprite.cellsW,
      cellsH: sprite.cellsH,
      mode: sprite.mode,
      frames: [deepCopyFrame(sprite.frames[i])]
    });
  }
  // Replace original sprite with the new ones
  spriteSheet.sprites.splice(idx, 1, ...newSprites);
  setActiveSprite(idx);
  currentFrameIndex = 0;
  updateSpriteList();
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
// Multi-Select & Context Menu
// ============================================================================

function plainClickSprite(idx) {
  stopAnimation();
  setActiveSprite(idx);
  currentFrameIndex = 0;
  spriteUndoStack = [];
  spriteRedoStack = [];
  updateSpriteListSelection();
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
}

function ctrlClickSprite(idx) {
  if (selectedSpriteIndices.has(idx)) {
    selectedSpriteIndices.delete(idx);
    if (selectedSpriteIndex === idx) {
      // Pick another selected index as active, or -1
      const remaining = Array.from(selectedSpriteIndices);
      selectedSpriteIndex = remaining.length > 0 ? remaining[remaining.length - 1] : -1;
    }
  } else {
    selectedSpriteIndices.add(idx);
    selectedSpriteIndex = idx;
  }
  spriteSelectionAnchor = idx;
  currentFrameIndex = 0;
  spriteUndoStack = [];
  spriteRedoStack = [];
  updateSpriteListSelection();
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
}

function shiftClickSprite(idx) {
  const anchor = spriteSelectionAnchor >= 0 ? spriteSelectionAnchor : 0;
  const lo = Math.min(anchor, idx);
  const hi = Math.max(anchor, idx);
  selectedSpriteIndices.clear();
  for (let i = lo; i <= hi; i++) selectedSpriteIndices.add(i);
  selectedSpriteIndex = idx;
  currentFrameIndex = 0;
  spriteUndoStack = [];
  spriteRedoStack = [];
  updateSpriteListSelection();
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
}

/** Update .selected / .multi-selected classes on existing list items without DOM rebuild. */
function updateSpriteListSelection() {
  const items = spriteDOM.spriteList?.querySelectorAll('.sprite-list-item');
  if (!items) return;
  items.forEach(item => {
    const idx = parseInt(item.dataset.index);
    item.classList.toggle('selected', idx === selectedSpriteIndex);
    item.classList.toggle('multi-selected', idx !== selectedSpriteIndex && selectedSpriteIndices.has(idx));
  });
}

// ---- Context Menu ----

function showSpriteContextMenu(x, y) {
  dismissSpriteContextMenu();
  const menu = document.createElement('div');
  menu.className = 'sprite-context-menu';

  const selCount = selectedSpriteIndices.size;
  const compatible = areSelectedSpritesCompatible();
  const activeSprite = getSelectedSprite();
  const hasMultiFrames = activeSprite && activeSprite.frames.length >= 2;

  // Merge selected to animation
  addContextMenuItem(menu, 'Merge selected to animation (' + selCount + ')',
    () => { dismissSpriteContextMenu(); mergeSelectedToAnimation(); },
    selCount < 2 || !compatible);

  // Add frames to… (submenu)
  addContextSubMenu(menu, 'Add frames to', selCount < 1, false);

  // Move frames to… (submenu)
  addContextSubMenu(menu, 'Move frames to', selCount < 1, true);

  addContextMenuSeparator(menu);

  // Split frames to sprites
  addContextMenuItem(menu, 'Split frames to sprites',
    () => { dismissSpriteContextMenu(); splitFramesToSprites(); },
    !hasMultiFrames);

  addContextMenuSeparator(menu);

  // Delete selected
  addContextMenuItem(menu, 'Delete selected (' + selCount + ')',
    () => { dismissSpriteContextMenu(); deleteSelectedSprites(); },
    selCount < 1);

  document.body.appendChild(menu);
  spriteContextMenu = menu;

  // Clamp to viewport
  const rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // Flip submenus to the left if they'd overflow the viewport
  const subs = menu.querySelectorAll('.sprite-context-submenu');
  for (const sub of subs) {
    if (x + rect.width + 160 > window.innerWidth) sub.classList.add('flip-left');
  }
}

function addContextMenuItem(menu, label, onClick, disabled) {
  const item = document.createElement('div');
  item.className = 'sprite-context-menu-item' + (disabled ? ' disabled' : '');
  item.textContent = label;
  if (!disabled) item.addEventListener('click', onClick);
  menu.appendChild(item);
}

function addContextSubMenu(menu, label, disabled, removeSource) {
  const targets = [];
  if (!disabled) {
    for (let i = 0; i < spriteSheet.sprites.length; i++) {
      if (!selectedSpriteIndices.has(i)) {
        targets.push({ index: i, sprite: spriteSheet.sprites[i] });
      }
    }
  }
  const noTargets = targets.length === 0;
  const item = document.createElement('div');
  item.className = 'sprite-context-menu-item' + ((disabled || noTargets) ? ' disabled' : ' has-submenu');
  item.textContent = label;
  if (!disabled && !noTargets) {
    const sub = document.createElement('div');
    sub.className = 'sprite-context-submenu';
    for (const t of targets) {
      const si = document.createElement('div');
      si.className = 'sprite-context-submenu-item';
      si.textContent = t.sprite.name + ' (' + (t.sprite.cellsW * 8) + '\u00D7' + (t.sprite.cellsH * 8) + ')';
      const targetIdx = t.index;
      si.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissSpriteContextMenu();
        addFramesToSprite(targetIdx, removeSource);
      });
      sub.appendChild(si);
    }
    item.appendChild(sub);
  }
  menu.appendChild(item);
}

function addContextMenuSeparator(menu) {
  const sep = document.createElement('div');
  sep.className = 'sprite-context-menu-separator';
  menu.appendChild(sep);
}

function dismissSpriteContextMenu() {
  if (spriteContextMenu) {
    spriteContextMenu.remove();
    spriteContextMenu = null;
  }
}

function areSelectedSpritesCompatible() {
  if (selectedSpriteIndices.size < 2) return false;
  let refW, refH, refMode;
  for (const idx of selectedSpriteIndices) {
    const s = spriteSheet.sprites[idx];
    if (!s) return false;
    if (refW === undefined) { refW = s.cellsW; refH = s.cellsH; refMode = s.mode; continue; }
    if (s.cellsW !== refW || s.cellsH !== refH || s.mode !== refMode) return false;
  }
  return true;
}

function mergeSelectedToAnimation() {
  if (!areSelectedSpritesCompatible()) {
    alert('Selected sprites must have the same dimensions and mode to merge.');
    return;
  }
  const sorted = Array.from(selectedSpriteIndices).sort((a, b) => a - b);
  const first = spriteSheet.sprites[sorted[0]];
  const mergedFrames = [];
  for (const idx of sorted) {
    for (const frame of spriteSheet.sprites[idx].frames) {
      mergedFrames.push(deepCopyFrame(frame));
    }
  }
  const merged = {
    name: first.name,
    cellsW: first.cellsW,
    cellsH: first.cellsH,
    mode: first.mode,
    frames: mergedFrames
  };
  // Remove originals in descending order, then insert merged at first position
  for (let i = sorted.length - 1; i >= 0; i--) {
    spriteSheet.sprites.splice(sorted[i], 1);
  }
  spriteSheet.sprites.splice(sorted[0], 0, merged);
  setActiveSprite(sorted[0]);
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
}

function addFramesToSprite(targetIdx, removeSource) {
  const target = spriteSheet.sprites[targetIdx];
  if (!target) return;

  // Collect frames from selected sprites (sorted by index)
  const sorted = Array.from(selectedSpriteIndices).sort((a, b) => a - b);
  for (const idx of sorted) {
    const src = spriteSheet.sprites[idx];
    if (!src) continue;
    for (const frame of src.frames) {
      target.frames.push(deepCopyFrame(frame));
    }
  }

  if (removeSource) {
    // Remove source sprites in descending order
    for (let i = sorted.length - 1; i >= 0; i--) {
      spriteSheet.sprites.splice(sorted[i], 1);
    }
    // Find new index of target after removals
    let newTargetIdx = targetIdx;
    for (const idx of sorted) {
      if (idx < targetIdx) newTargetIdx--;
    }
    setActiveSprite(Math.min(newTargetIdx, spriteSheet.sprites.length - 1));
  } else {
    setActiveSprite(targetIdx);
  }
  currentFrameIndex = 0;
  updateSpriteList();
  updateSpriteProps();
  if (spriteEditorOpen) renderSpriteEditor();
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
    let cls = 'sprite-list-item';
    if (i === selectedSpriteIndex) cls += ' selected';
    else if (selectedSpriteIndices.has(i)) cls += ' multi-selected';
    item.className = cls;

    // Thumbnail canvas
    const thumbCanvas = document.createElement('canvas');
    const thumbSize = 24;
    thumbCanvas.width = thumbSize;
    thumbCanvas.height = thumbSize;
    renderSpriteThumbnail(thumbCanvas, sprite, 0);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = sprite.name + ' (' + (sprite.cellsW * 8) + 'x' + (sprite.cellsH * 8) +
      (sprite.frames.length > 1 ? ', ' + sprite.frames.length + 'f' : '') + ')';
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
  const nameRow = document.getElementById('spriteNameRow');
  const brushRow = document.getElementById('spriteUseBrushRow');

  if (!sprite) {
    // No spriteset selected — still show W/H/Mode for grab, hide Name and Use as Brush
    if (nameRow) nameRow.style.display = 'none';
    if (brushRow) brushRow.style.display = 'none';
    updateSpritePropLocks();
    updateFrameBar();
    return;
  }

  if (nameRow) nameRow.style.display = 'flex';
  if (brushRow) brushRow.style.display = 'flex';

  spriteDOM.spriteName.value = sprite.name;
  spriteDOM.spriteCellsW.value = String(sprite.cellsW);
  spriteDOM.spriteCellsH.value = String(sprite.cellsH);
  spriteDOM.spriteMode.value = sprite.mode === 'multicolour'
    ? 'multicolour_' + (sprite.attrCellH || 2)
    : sprite.mode;

  updateSpritePropLocks();
  updateFrameBar();
}

function updateFrameBar() {
  const bar = spriteDOM.spriteFrameBar;
  if (!bar) return;
  const sprite = getSelectedSprite();
  if (!sprite) { bar.innerHTML = ''; return; }

  bar.innerHTML = '';
  for (let i = 0; i < sprite.frames.length; i++) {
    const wrap = document.createElement('canvas');
    wrap.width = 20;
    wrap.height = 20;
    wrap.className = 'frame-thumb';
    wrap.dataset.index = i;
    if (i === currentFrameIndex) wrap.classList.add('current');
    else if (selectedFrameIndices.has(i)) wrap.classList.add('multi-selected');
    renderSpriteThumbnail(wrap, sprite, i);
    wrap.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) ctrlClickFrame(i);
      else if (e.shiftKey) shiftClickFrame(i);
      else plainClickFrame(i);
    });
    bar.appendChild(wrap);
  }
}

function updateFrameBarSelection() {
  const bar = spriteDOM.spriteFrameBar;
  if (!bar) return;
  const thumbs = bar.children;
  for (let i = 0; i < thumbs.length; i++) {
    thumbs[i].classList.toggle('current', i === currentFrameIndex);
    thumbs[i].classList.toggle('multi-selected', i !== currentFrameIndex && selectedFrameIndices.has(i));
  }
}

function plainClickFrame(idx) {
  selectedFrameIndices.clear();
  frameSelectionAnchor = idx;
  currentFrameIndex = idx;
  updateFrameBarSelection();
  renderSpriteEditor();
}

function ctrlClickFrame(idx) {
  if (idx === currentFrameIndex) {
    // clicking current: if there are other selected, move current to one of them
    if (selectedFrameIndices.size > 0) {
      const first = selectedFrameIndices.values().next().value;
      selectedFrameIndices.delete(first);
      currentFrameIndex = first;
    }
    // otherwise ignore — can't deselect the only current frame
  } else {
    if (selectedFrameIndices.has(idx)) {
      selectedFrameIndices.delete(idx);
    } else {
      selectedFrameIndices.add(idx);
    }
    // add old current to set, make clicked the new current
    selectedFrameIndices.add(currentFrameIndex);
    currentFrameIndex = idx;
    selectedFrameIndices.delete(idx);
  }
  frameSelectionAnchor = idx;
  updateFrameBarSelection();
  renderSpriteEditor();
}

function shiftClickFrame(idx) {
  const anchor = frameSelectionAnchor >= 0 ? frameSelectionAnchor : currentFrameIndex;
  const lo = Math.min(anchor, idx);
  const hi = Math.max(anchor, idx);
  selectedFrameIndices.clear();
  for (let i = lo; i <= hi; i++) {
    if (i !== currentFrameIndex) selectedFrameIndices.add(i);
  }
  // current stays where it was, but make sure it's in range
  if (currentFrameIndex < lo || currentFrameIndex > hi) {
    currentFrameIndex = idx;
  }
  updateFrameBarSelection();
  renderSpriteEditor();
}

function moveSelectedFrames(delta) {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  const frames = sprite.frames;

  // Collect all effective selected indices (include current)
  const sel = new Set(selectedFrameIndices);
  sel.add(currentFrameIndex);
  const sorted = [...sel].sort((a, b) => a - b);

  if (delta === -1) {
    if (sorted[0] <= 0) return;
    for (let k = 0; k < sorted.length; k++) {
      const i = sorted[k];
      const tmp = frames[i - 1];
      frames[i - 1] = frames[i];
      frames[i] = tmp;
    }
  } else {
    if (sorted[sorted.length - 1] >= frames.length - 1) return;
    for (let k = sorted.length - 1; k >= 0; k--) {
      const i = sorted[k];
      const tmp = frames[i + 1];
      frames[i + 1] = frames[i];
      frames[i] = tmp;
    }
  }

  // Update indices to follow moved positions
  selectedFrameIndices.clear();
  for (const i of sorted) {
    const newIdx = i + delta;
    if (i === currentFrameIndex) {
      currentFrameIndex = newIdx;
    } else {
      selectedFrameIndices.add(newIdx);
    }
  }
  frameSelectionAnchor = currentFrameIndex;

  updateFrameBar();
  renderSpriteEditor();
}

function deleteSelectedFrames() {
  const sprite = getSelectedSprite();
  if (!sprite || sprite.frames.length <= 1) return;

  // Collect all indices to delete (selected + current)
  const toDelete = new Set(selectedFrameIndices);
  toDelete.add(currentFrameIndex);

  // Must keep at least 1 frame
  if (toDelete.size >= sprite.frames.length) {
    // Keep the lowest index that isn't selected, or frame 0
    let keep = -1;
    for (let i = 0; i < sprite.frames.length; i++) {
      if (!toDelete.has(i)) { keep = i; break; }
    }
    if (keep === -1) keep = 0;
    toDelete.delete(keep);
  }

  // Splice in descending order
  const descending = [...toDelete].sort((a, b) => b - a);
  for (const idx of descending) {
    sprite.frames.splice(idx, 1);
  }

  // Adjust currentFrameIndex
  if (currentFrameIndex >= sprite.frames.length) currentFrameIndex = sprite.frames.length - 1;
  selectedFrameIndices.clear();
  frameSelectionAnchor = currentFrameIndex;

  updateFrameBar();
  renderSpriteEditor();
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
      const attrRowsPerCell = getAttrRowsPerCell(sprite);
      const oldAttrRows = oldH * attrRowsPerCell;
      const newAttrRows = newH * attrRowsPerCell;
      const newAttrs = new Uint8Array(newW * newAttrRows);
      const copyCellsW = Math.min(oldW, newW);
      const copyAttrRows = Math.min(oldAttrRows, newAttrRows);
      for (let ay = 0; ay < copyAttrRows; ay++) {
        for (let cx = 0; cx < copyCellsW; cx++) {
          newAttrs[ay * newW + cx] = frame.attrs[ay * oldW + cx];
        }
      }
      // Fill new cells with default attr
      for (let ay = 0; ay < newAttrRows; ay++) {
        for (let cx = 0; cx < newW; cx++) {
          if (ay >= copyAttrRows || cx >= copyCellsW) {
            newAttrs[ay * newW + cx] = 7; // ink 7, paper 0, bright 0
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
  const dropdownVal = spriteDOM.spriteMode.value;

  // Parse dropdown value
  let newMode, newAttrCellH;
  if (dropdownVal.startsWith('multicolour_')) {
    newMode = 'multicolour';
    newAttrCellH = parseInt(dropdownVal.split('_')[1]) || 2;
  } else {
    newMode = dropdownVal;
    newAttrCellH = undefined;
  }

  const oldMode = sprite.mode;
  const oldAttrCellH = sprite.attrCellH || 2;

  // No change?
  if (newMode === oldMode && (newMode !== 'multicolour' || newAttrCellH === oldAttrCellH)) return;

  const cellsW = sprite.cellsW;
  const cellsH = sprite.cellsH;
  const oldRowsPerCell = oldMode === 'multicolour' ? (8 / oldAttrCellH) : 1;
  const newRowsPerCell = newMode === 'multicolour' ? (8 / newAttrCellH) : 1;

  sprite.mode = newMode;
  sprite.attrCellH = newMode === 'multicolour' ? newAttrCellH : undefined;

  for (const frame of sprite.frames) {
    if (oldMode === 'mono' && newMode === 'attr') {
      frame.attrs = new Uint8Array(cellsW * cellsH);
      frame.attrs.fill(7);
    } else if (oldMode === 'mono' && newMode === 'multicolour') {
      frame.attrs = new Uint8Array(cellsW * cellsH * newRowsPerCell);
      frame.attrs.fill(7);
    } else if (oldMode === 'attr' && newMode === 'multicolour') {
      // Replicate each 8x8 attr N times into sub-rows
      const oldAttrs = frame.attrs;
      const newAttrs = new Uint8Array(cellsW * cellsH * newRowsPerCell);
      for (let cy = 0; cy < cellsH; cy++) {
        for (let cx = 0; cx < cellsW; cx++) {
          const val = oldAttrs ? oldAttrs[cy * cellsW + cx] : 7;
          for (let sub = 0; sub < newRowsPerCell; sub++) {
            newAttrs[(cy * newRowsPerCell + sub) * cellsW + cx] = val;
          }
        }
      }
      frame.attrs = newAttrs;
    } else if (oldMode === 'multicolour' && newMode === 'attr') {
      // Take first of each group of sub-rows
      const oldAttrs = frame.attrs;
      const newAttrs = new Uint8Array(cellsW * cellsH);
      for (let cy = 0; cy < cellsH; cy++) {
        for (let cx = 0; cx < cellsW; cx++) {
          newAttrs[cy * cellsW + cx] = oldAttrs ? oldAttrs[(cy * oldRowsPerCell) * cellsW + cx] : 7;
        }
      }
      frame.attrs = newAttrs;
    } else if (oldMode === 'multicolour' && newMode === 'multicolour') {
      // Resample attrs: for each new attr row, pick from the old attr covering the same pixel row
      const oldAttrs = frame.attrs;
      const newAttrs = new Uint8Array(cellsW * cellsH * newRowsPerCell);
      for (let cy = 0; cy < cellsH; cy++) {
        for (let newSub = 0; newSub < newRowsPerCell; newSub++) {
          // Pixel row covered by this new attr sub-row
          const pixRow = cy * 8 + newSub * newAttrCellH;
          // Which old attr sub-row covers this pixel row
          const oldSub = Math.floor((pixRow - cy * 8) / oldAttrCellH);
          const clampedOldSub = Math.min(oldSub, oldRowsPerCell - 1);
          for (let cx = 0; cx < cellsW; cx++) {
            newAttrs[(cy * newRowsPerCell + newSub) * cellsW + cx] =
              oldAttrs ? oldAttrs[(cy * oldRowsPerCell + clampedOldSub) * cellsW + cx] : 7;
          }
        }
      }
      frame.attrs = newAttrs;
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
  const show = sprite.mode === 'attr' || sprite.mode === 'multicolour';
  if (spriteDOM.spriteAttrControls) {
    spriteDOM.spriteAttrControls.style.display = show ? '' : 'none';
  }
  if (spriteDOM.spriteExportFormat) {
    spriteDOM.spriteExportFormat.style.display = sprite.mode === 'multicolour' ? '' : 'none';
  }
  if (spriteDOM.spriteAttrScrollLabel) {
    spriteDOM.spriteAttrScrollLabel.style.display = sprite.mode === 'mono' ? 'none' : '';
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

/** Lightweight render during active drawing — skips frame bar rebuild, throttled by rAF */
function scheduleDrawingRender() {
  if (spriteRenderPending) return;
  spriteRenderPending = true;
  requestAnimationFrame(() => {
    spriteRenderPending = false;
    if (!spriteEditorOpen) return;
    renderSpriteCanvas();
    renderSpritePreview();
  });
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

  // Render current frame
  const showAttrs = spriteDOM.spriteShowAttrs?.checked !== false;
  renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, bytesPerRow, true, showAttrs);

  // Onion skinning: overlay previous frame's ink pixels on top
  const showOnion = spriteDOM.spriteOnionSkin?.checked && currentFrameIndex > 0;
  if (showOnion) {
    const prevFrame = sprite.frames[currentFrameIndex - 1];
    ctx.globalAlpha = 0.25;
    renderFrameToCtx(ctx, sprite, prevFrame, zoom, pixW, pixH, bytesPerRow, false, showAttrs);
    ctx.globalAlpha = 1.0;
  }

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
    const cellH = getAttrCellH(sprite);
    const hLines = pixH / cellH;
    for (let cy = 0; cy <= hLines; cy++) {
      ctx.beginPath();
      ctx.moveTo(0, cy * cellH * zoom + 0.5);
      ctx.lineTo(pixW * zoom, cy * cellH * zoom + 0.5);
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

function renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, bytesPerRow, isCurrentFrame, showAttrs) {
  if (showAttrs === false || sprite.mode === 'mono' || !frame.attrs) {
    // Monochrome / no-attrs view: black ink on transparent background
    for (let y = 0; y < pixH; y++) {
      for (let x = 0; x < pixW; x++) {
        if (spGetPixel(frame, x, y, pixW)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }
  } else if (sprite.mode === 'multicolour') {
    // Multicolour mode: color per attribute cell
    const attrCellH = getAttrCellH(sprite);
    const totalAttrRows = sprite.cellsH * getAttrRowsPerCell(sprite);
    for (let attrRow = 0; attrRow < totalAttrRows; attrRow++) {
      for (let cx = 0; cx < sprite.cellsW; cx++) {
        const attr = frame.attrs[attrRow * sprite.cellsW + cx];
        const ink = attr & 7;
        const paper = (attr >> 3) & 7;
        const bright = (attr >> 6) & 1;
        const inkColor = SPRITE_ZX_COLORS[ink + (bright ? 8 : 0)];
        const paperColor = SPRITE_ZX_COLORS[paper + (bright ? 8 : 0)];

        for (let py = 0; py < attrCellH; py++) {
          for (let px = 0; px < 8; px++) {
            const x = cx * 8 + px;
            const y = attrRow * attrCellH + py;
            const set = spGetPixel(frame, x, y, pixW);

            ctx.fillStyle = set ? inkColor : paperColor;
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }
    }
  } else if (sprite.mode === 'attr') {
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
  const showAttrs = spriteDOM.spriteShowAttrs?.checked !== false;
  renderFrameToCtx(ctx, sprite, frame, zoom, pixW, pixH, bytesPerRow, true, showAttrs);
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
      if (!targetFrame.attrs || targetFrame.attrs.length !== state.attrs.length)
        targetFrame.attrs = new Uint8Array(state.attrs.length);
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
      if (!targetFrame.attrs || targetFrame.attrs.length !== state.attrs.length)
        targetFrame.attrs = new Uint8Array(state.attrs.length);
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
  spriteDrawRight = rightButton;
  spriteLastDrawX = pos.x;
  spriteLastDrawY = pos.y;
  attrScrollAccum = { dx: 0, dy: 0 };

  if (currentSpriteTool === 'draw' || currentSpriteTool === 'erase') {
    pushUndo();
    const value = currentSpriteTool === 'draw' ? (rightButton ? 0 : 1) : (rightButton ? 1 : 0);
    if (editingMask) {
      spSetMaskPixel(frame, pos.x, pos.y, value, pixW);
    } else {
      spSetPixel(frame, pos.x, pos.y, value, pixW);
      // In attr/multicolour mode, set attribute for the cell
      if ((sprite.mode === 'attr' || sprite.mode === 'multicolour') && currentSpriteTool === 'draw') {
        const cellX = Math.floor(pos.x / 8);
        const cellY = Math.floor(pos.y / getAttrCellH(sprite));
        spSetAttr(frame, cellX, cellY, spriteInk, spritePaper, spriteBright, sprite.cellsW);
      }
    }
    renderSpriteEditor();
  } else if (currentSpriteTool === 'fill') {
    pushUndo();
    const fillValue = rightButton ? 0 : 1;
    if (editingMask) {
      const target = spGetMaskPixel(frame, pos.x, pos.y, pixW);
      if (target !== fillValue) spFloodFillMask(frame, pos.x, pos.y, target, fillValue, pixW, sprite.cellsH * 8);
    } else {
      const target = spGetPixel(frame, pos.x, pos.y, pixW);
      if (target !== fillValue) spFloodFill(frame, pos.x, pos.y, target, fillValue, pixW, sprite.cellsH * 8);
    }
    renderSpriteEditor();
    updateSpritePropLocks();
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
    const value = currentSpriteTool === 'draw' ? (spriteDrawRight ? 0 : 1) : (spriteDrawRight ? 1 : 0);
    // Draw line from last position to current for smooth strokes
    spBresenhamLine(spriteLastDrawX, spriteLastDrawY, pos.x, pos.y, (x, y) => {
      if (spIsInBounds(x, y)) {
        if (editingMask) {
          spSetMaskPixel(frame, x, y, value, pixW);
        } else {
          spSetPixel(frame, x, y, value, pixW);
          if ((sprite.mode === 'attr' || sprite.mode === 'multicolour') && currentSpriteTool === 'draw') {
            const cellX = Math.floor(x / 8);
            const cellY = Math.floor(y / getAttrCellH(sprite));
            spSetAttr(frame, cellX, cellY, spriteInk, spritePaper, spriteBright, sprite.cellsW);
          }
        }
      }
    });
    spriteLastDrawX = pos.x;
    spriteLastDrawY = pos.y;
    scheduleDrawingRender();
  } else if (currentSpriteTool === 'line' || currentSpriteTool === 'rect') {
    // Preview: restore from undo then draw preview
    const undoState = spriteUndoStack[spriteUndoStack.length - 1];
    if (undoState) {
      frame.bitmap.set(undoState.bitmap);
      if (undoState.mask && frame.mask) frame.mask.set(undoState.mask);
    }
    const drawValue = spriteDrawRight ? 0 : 1;
    if (currentSpriteTool === 'line') {
      spBresenhamLine(spriteLineStartX, spriteLineStartY, pos.x, pos.y, (x, y) => {
        if (spIsInBounds(x, y)) {
          if (editingMask) spSetMaskPixel(frame, x, y, drawValue, pixW);
          else spSetPixel(frame, x, y, drawValue, pixW);
        }
      });
    } else {
      spDrawRect(frame, spriteLineStartX, spriteLineStartY, pos.x, pos.y, drawValue, pixW);
    }
    renderSpriteEditor();
  }
}

function onSpriteCanvasMouseUp(e) {
  spriteSelectDragging = false;
  if (!spriteDrawing) return;
  spriteDrawing = false;

  // After draw/erase stroke, do a full render to update frame bar
  if (currentSpriteTool === 'draw' || currentSpriteTool === 'erase') {
    renderSpriteEditor();
    updateSpritePropLocks();
    return;
  }

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
      const drawValue = spriteDrawRight ? 0 : 1;
      if (currentSpriteTool === 'line') {
        spBresenhamLine(spriteLineStartX, spriteLineStartY, pos.x, pos.y, (x, y) => {
          if (spIsInBounds(x, y)) {
            if (editingMask) spSetMaskPixel(frame, x, y, drawValue, pixW);
            else spSetPixel(frame, x, y, drawValue, pixW);
          }
        });
      } else {
        spDrawRect(frame, spriteLineStartX, spriteLineStartY, pos.x, pos.y, drawValue, pixW);
      }
    }
    renderSpriteEditor();
    updateSpritePropLocks();
  }
}

/**
 * Enable/disable W/H/Mode controls based on whether sprite has non-empty frame data.
 */
function updateSpritePropLocks() {
  const sprite = getSelectedSprite();
  const hasContent = sprite ? sprite.frames.some(f => f.bitmap.some(b => b !== 0)) : false;
  if (spriteDOM.spriteCellsW) spriteDOM.spriteCellsW.disabled = hasContent;
  if (spriteDOM.spriteCellsH) spriteDOM.spriteCellsH.disabled = hasContent;
  if (spriteDOM.spriteMode) spriteDOM.spriteMode.disabled = hasContent;
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
  const container = spriteDOM.spriteColorPalette;
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('div');
    cell.className = 'sprite-color-cell';
    cell.style.background = SPRITE_ZX_COLORS[i];
    cell.dataset.color = String(i);
    // Left click = ink
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      spriteInk = i;
      updatePaletteSelection();
    });
    // Right click = paper
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      spritePaper = i;
      updatePaletteSelection();
    });
    container.appendChild(cell);
  }
  spriteDOM.spriteBrightChk?.addEventListener('change', () => {
    spriteBright = spriteDOM.spriteBrightChk.checked;
    updatePaletteSelection();
  });
  updatePaletteSelection();
}

function updatePaletteSelection() {
  const container = spriteDOM.spriteColorPalette;
  if (!container) return;
  const cells = container.querySelectorAll('.sprite-color-cell');
  cells.forEach((cell, i) => {
    cell.style.background = SPRITE_ZX_COLORS[i + (spriteBright ? 8 : 0)];
    cell.classList.toggle('ink-selected', i === spriteInk);
    cell.classList.toggle('paper-selected', i === spritePaper);
    // Remove old markers
    cell.querySelectorAll('.sprite-color-marker').forEach(m => m.remove());
    if (i === spriteInk) {
      const m = document.createElement('span');
      m.className = 'sprite-color-marker ink-marker';
      m.textContent = 'I';
      cell.appendChild(m);
    }
    if (i === spritePaper) {
      const m = document.createElement('span');
      m.className = 'sprite-color-marker paper-marker';
      m.textContent = 'P';
      cell.appendChild(m);
    }
  });
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
    case 'flipH': spFlipHorizontal(frame, pixW, pixH); attrScrollAccum = { dx: 0, dy: 0 }; break;
    case 'flipV': spFlipVertical(frame, pixW, pixH); attrScrollAccum = { dx: 0, dy: 0 }; break;
    case 'rotCW': spRotateCW(sprite, frame); attrScrollAccum = { dx: 0, dy: 0 }; break;
    case 'rotCCW': spRotateCCW(sprite, frame); attrScrollAccum = { dx: 0, dy: 0 }; break;
    case 'shiftL':
    case 'shiftR':
    case 'shiftU':
    case 'shiftD': {
      const dx = type === 'shiftL' ? -1 : type === 'shiftR' ? 1 : 0;
      const dy = type === 'shiftU' ? -1 : type === 'shiftD' ? 1 : 0;
      spShiftPixels(frame, pixW, pixH, dx, dy);
      if (spriteAttrScrollEnabled && frame.attrs && sprite.mode !== 'mono') {
        attrScrollAccum.dx += dx;
        attrScrollAccum.dy += dy;
        const cellW = 8;
        const cellH = getAttrCellH(sprite);
        const totalAttrRows = sprite.cellsH * getAttrRowsPerCell(sprite);
        let rollX = 0, rollY = 0;
        if (Math.abs(attrScrollAccum.dx) >= cellW) {
          rollX = Math.sign(attrScrollAccum.dx);
          attrScrollAccum.dx -= rollX * cellW;
        }
        if (Math.abs(attrScrollAccum.dy) >= cellH) {
          rollY = Math.sign(attrScrollAccum.dy);
          attrScrollAccum.dy -= rollY * cellH;
        }
        if (rollX || rollY) spShiftAttrs(frame, sprite.cellsW, totalAttrRows, rollX, rollY);
      }
      break;
    }
    case 'invert': spInvertPixels(frame); attrScrollAccum = { dx: 0, dy: 0 }; break;
    case 'clear': spClearFrame(frame); attrScrollAccum = { dx: 0, dy: 0 }; break;
  }

  renderSpriteEditor();
}

function spFlipHorizontal(frame, pixW, pixH) {
  const temp = new Uint8Array(frame.bitmap.length);
  const bytesPerRow = Math.ceil(pixW / 8);
  const cellsW = pixW / 8;

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

  // Flip attr rows horizontally (reverse each row)
  if (frame.attrs && cellsW > 0) {
    const attrRows = frame.attrs.length / cellsW;
    const tempAttrs = new Uint8Array(frame.attrs.length);
    for (let row = 0; row < attrRows; row++) {
      for (let cx = 0; cx < cellsW; cx++) {
        tempAttrs[row * cellsW + cx] = frame.attrs[row * cellsW + (cellsW - 1 - cx)];
      }
    }
    frame.attrs.set(tempAttrs);
  }
}

function spFlipVertical(frame, pixW, pixH) {
  const bytesPerRow = Math.ceil(pixW / 8);
  const cellsW = pixW / 8;
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

  // Flip attr rows vertically (reverse order of rows)
  if (frame.attrs && cellsW > 0) {
    const attrRows = frame.attrs.length / cellsW;
    const tempAttrs = new Uint8Array(frame.attrs.length);
    for (let row = 0; row < attrRows; row++) {
      const destRow = attrRows - 1 - row;
      for (let cx = 0; cx < cellsW; cx++) {
        tempAttrs[destRow * cellsW + cx] = frame.attrs[row * cellsW + cx];
      }
    }
    frame.attrs.set(tempAttrs);
  }
}

function spRotateCW(sprite, frame) {
  if (sprite.mode === 'multicolour') {
    alert('Rotation is not supported for multicolour mode (8x2 cells cannot be rotated 90°).');
    return;
  }
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
  if (sprite.mode === 'multicolour') {
    alert('Rotation is not supported for multicolour mode (8x2 cells cannot be rotated 90°).');
    return;
  }
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

function spShiftAttrs(frame, cellsW, totalAttrRows, dCellX, dCellY) {
  const temp = new Uint8Array(cellsW * totalAttrRows);
  for (let ay = 0; ay < totalAttrRows; ay++) {
    for (let ax = 0; ax < cellsW; ax++) {
      const srcX = ((ax - dCellX) % cellsW + cellsW) % cellsW;
      const srcY = ((ay - dCellY) % totalAttrRows + totalAttrRows) % totalAttrRows;
      temp[ay * cellsW + ax] = frame.attrs[srcY * cellsW + srcX];
    }
  }
  frame.attrs.set(temp);
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
  selectedFrameIndices.clear();
  frameSelectionAnchor = currentFrameIndex;
  spriteSelection = null;
  attrScrollAccum = { dx: 0, dy: 0 };
  renderSpriteEditor();
}

function addFrame() {
  const sprite = getSelectedSprite();
  if (!sprite) return;
  sprite.frames.push(createEmptyFrame(sprite.cellsW, sprite.cellsH, sprite.mode, sprite.attrCellH));
  currentFrameIndex = sprite.frames.length - 1;
  selectedFrameIndices.clear();
  frameSelectionAnchor = currentFrameIndex;
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
  selectedFrameIndices.clear();
  frameSelectionAnchor = currentFrameIndex;
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
  // Stop any existing animation first
  stopAnimation();

  const sprite = getSelectedSprite();
  if (!sprite || sprite.frames.length <= 1) return;

  spriteAnimPlaying = true;
  if (spriteDOM.spritePlayBtn) spriteDOM.spritePlayBtn.innerHTML = '&#9632; Stop';

  const speed = parseInt(spriteDOM.spriteAnimSpeed?.value || '10');
  const interval = Math.max(16, Math.floor(1000 / speed));

  spriteAnimTimer = setInterval(() => {
    const s = getSelectedSprite();
    if (!s || s.frames.length <= 1) { stopAnimation(); return; }
    currentFrameIndex = (currentFrameIndex + 1) % s.frames.length;
    renderSpriteCanvas();
    renderSpritePreview();
    updateFrameInfo();
    // Update frame bar selection without rebuilding DOM
    const thumbs = spriteDOM.spriteFrameBar?.children;
    if (thumbs) {
      for (let i = 0; i < thumbs.length; i++) {
        thumbs[i].classList.toggle('current', i === currentFrameIndex);
        thumbs[i].classList.remove('multi-selected');
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
  // Sync grid options visibility to current grab mode value
  if (spriteDOM.spriteGrabMode && spriteDOM.spriteGrabGridOpts) {
    const mode = spriteDOM.spriteGrabMode.value;
    const isGrid = mode === 'grid' || mode === 'gridphases';
    spriteDOM.spriteGrabGridOpts.style.display = isGrid ? '' : 'none';
  }
  if (spriteDOM.spriteGrabStatus) {
    spriteDOM.spriteGrabStatus.textContent = 'Drag on canvas...';
  }

  // Auto-set sprite mode based on source format
  const sel = spriteDOM.spriteMode;
  if (sel) {
    const isMulticolour = typeof currentFormat !== 'undefined' && typeof FORMAT !== 'undefined' &&
      (currentFormat === FORMAT.IFL || currentFormat === FORMAT.MLT || currentFormat === FORMAT.BMC4);
    if (isMulticolour && !sel.value.startsWith('multicolour_')) {
      sel.value = 'multicolour_2';
    }
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

  // Helper: get sprite cell dimensions in pixels for grab snapping
  function getGrabSnapSize() {
    const cw = parseInt(spriteDOM.spriteCellsW?.value) || 1;
    const ch = parseInt(spriteDOM.spriteCellsH?.value) || 1;
    return { sw: cw * 8, sh: ch * 8 };
  }

  // Helper: snap drag endpoint so region dimensions are multiples of sprite cell size
  function snapGrabRegion(startX, startY, endX, endY) {
    const { sw, sh } = getGrabSnapSize();
    const dirX = endX >= startX ? 1 : -1;
    const dirY = endY >= startY ? 1 : -1;
    const rawW = Math.abs(endX - startX) + 8;
    const rawH = Math.abs(endY - startY) + 8;
    const snappedW = Math.max(sw, Math.round(rawW / sw) * sw);
    const snappedH = Math.max(sh, Math.round(rawH / sh) * sh);
    const scrW = typeof getFormatWidth === 'function' ? getFormatWidth() : 256;
    const scrH = typeof getFormatHeight === 'function' ? getFormatHeight() : 192;
    const left = dirX > 0 ? startX : startX - snappedW + 8;
    const top = dirY > 0 ? startY : startY - snappedH + 8;
    // Clamp to screen bounds
    const clampedLeft = Math.max(0, Math.min(left, scrW - snappedW));
    const clampedTop = Math.max(0, Math.min(top, scrH - snappedH));
    return { x: clampedLeft, y: clampedTop, w: snappedW, h: snappedH };
  }

  // Helper: position overlay div from snapped grab region
  function positionOverlay(x1, y1, x2, y2) {
    const rect = canvas.getBoundingClientRect();
    const z = typeof zoom !== 'undefined' ? zoom : 2;
    const border = typeof borderSize !== 'undefined' ? borderSize : 0;
    const borderPx = border * z;
    const rgn = snapGrabRegion(x1, y1, x2, y2);
    spriteGrabOverlay.style.display = '';
    spriteGrabOverlay.style.left = (rect.left + borderPx + rgn.x * z) + 'px';
    spriteGrabOverlay.style.top = (rect.top + borderPx + rgn.y * z) + 'px';
    spriteGrabOverlay.style.width = (rgn.w * z) + 'px';
    spriteGrabOverlay.style.height = (rgn.h * z) + 'px';
  }

  spriteGrabMouseDown = function(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
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
    e.stopImmediatePropagation();
    spriteGrabDragging = false;

    const cell = clientToScreenCell(e);
    const rgn = snapGrabRegion(spriteGrabStartX, spriteGrabStartY, cell.x, cell.y);

    if (rgn.w < 8 || rgn.h < 8) {
      if (spriteGrabOverlay) spriteGrabOverlay.style.display = 'none';
      return;
    }

    grabRegionFromScreen(rgn.x, rgn.y, rgn.w, rgn.h);

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
  const dropdownVal = spriteDOM.spriteMode?.value || 'mono';
  let attrMode, grabAttrCellH;
  if (dropdownVal.startsWith('multicolour_')) {
    attrMode = 'multicolour';
    grabAttrCellH = parseInt(dropdownVal.split('_')[1]) || 2;
  } else {
    attrMode = dropdownVal;
    grabAttrCellH = undefined;
  }
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
      cellsW = parseInt(spriteDOM.spriteCellsW?.value) || 2;
      cellsH = parseInt(spriteDOM.spriteCellsH?.value) || 2;
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
            cellsW, cellsH, attrMode, grabAttrCellH));
    } else {
      // Left→Right, then Top→Bottom (reading order)
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++)
          frames.push(extractFrameFromScreen(
            regionX + col * cellsW * 8, regionY + row * cellsH * 8,
            cellsW, cellsH, attrMode, grabAttrCellH));
    }
  } else {
    cellsW = regionCellsW;
    cellsH = regionCellsH;
    frames.push(extractFrameFromScreen(regionX, regionY, cellsW, cellsH, attrMode, grabAttrCellH));
  }

  // Check if selected sprite is empty and can be reused
  const sel = getSelectedSprite();
  const selIsEmpty = sel && sel.frames.length === 1 && sel.frames[0].bitmap.every(b => b === 0)
    && sel.cellsW === cellsW && sel.cellsH === cellsH && sel.mode === attrMode;

  // Add to sprite sheet
  if (isPhases) {
    // phases / gridphases: create a new sprite with grabbed frames (or reuse empty)
    if (selIsEmpty) {
      sel.frames = frames;
    } else {
      spriteSheet.sprites.push({
        name: 'Grabbed_' + (spriteSheet.sprites.length + 1),
        cellsW: cellsW, cellsH: cellsH, mode: attrMode, attrCellH: grabAttrCellH, frames: frames
      });
      setActiveSprite(spriteSheet.sprites.length - 1);
    }
    currentFrameIndex = 0;
    if (spriteDOM.spriteGrabStatus)
      spriteDOM.spriteGrabStatus.textContent = frames.length + ' frame(s) added';
  } else if (isGrid) {
    // grid: each cell = separate sprite; reuse empty selected sprite for first one
    const baseNum = spriteSheet.sprites.length + 1;
    for (let i = 0; i < frames.length; i++) {
      if (i === 0 && selIsEmpty) {
        sel.frames = [frames[i]];
      } else {
        spriteSheet.sprites.push({
          name: 'Grabbed_' + (baseNum + i),
          cellsW: cellsW, cellsH: cellsH, mode: attrMode, attrCellH: grabAttrCellH, frames: [frames[i]]
        });
      }
    }
    setActiveSprite(spriteSheet.sprites.length - 1);
    currentFrameIndex = 0;
    if (spriteDOM.spriteGrabStatus)
      spriteDOM.spriteGrabStatus.textContent = frames.length + ' sprites grabbed';
  } else {
    // single: one new sprite (or reuse empty)
    if (selIsEmpty) {
      sel.frames = frames;
    } else {
      spriteSheet.sprites.push({
        name: 'Grabbed_' + (spriteSheet.sprites.length + 1),
        cellsW: cellsW, cellsH: cellsH, mode: attrMode, attrCellH: grabAttrCellH, frames: frames
      });
      setActiveSprite(spriteSheet.sprites.length - 1);
    }
    currentFrameIndex = 0;
    if (spriteDOM.spriteGrabStatus)
      spriteDOM.spriteGrabStatus.textContent = cellsW + 'x' + cellsH + ' sprite grabbed';
  }

  updateSpriteList();
  updateSpriteProps();
  if (spriteEditorOpen) {
    updateAttrControlsVisibility();
    renderSpriteEditor();
  }
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
function spGetScreenAttrAddress(x, y) {
  // Use the format-aware attribute address, matching screen_editor.js pattern
  if (typeof currentFormat !== 'undefined' && typeof FORMAT !== 'undefined') {
    if (currentFormat === FORMAT.MLT && typeof getMltAttributeAddress === 'function')
      return getMltAttributeAddress(x, y);
    if (currentFormat === FORMAT.IFL && typeof getIflAttributeAddress === 'function')
      return getIflAttributeAddress(x, y);
    if (currentFormat === FORMAT.BMC4 && typeof getBmc4AttributeAddress === 'function')
      return getBmc4AttributeAddress(x, y);
  }
  if (typeof getAttributeAddress === 'function')
    return getAttributeAddress(x, y);
  return -1;
}

function extractFrameFromScreen(startX, startY, cellsW, cellsH, mode, attrCellH) {
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
        const addr = screenData ? spGetScreenAttrAddress(scrX, scrY) : -1;
        attrs[cy * cellsW + cx] = (addr >= 0 && screenData[addr] != null) ? screenData[addr] : 7;
      }
    }
  } else if (mode === 'multicolour') {
    const extractAttrCellH = attrCellH || 2;
    const extractRowsPerCell = 8 / extractAttrCellH;
    const totalAttrRows = cellsH * extractRowsPerCell;
    attrs = new Uint8Array(cellsW * totalAttrRows);
    for (let attrRow = 0; attrRow < totalAttrRows; attrRow++) {
      for (let cx = 0; cx < cellsW; cx++) {
        const scrX = startX + cx * 8;
        const scrY = startY + attrRow * extractAttrCellH;
        const addr = screenData ? spGetScreenAttrAddress(scrX, scrY) : -1;
        attrs[attrRow * cellsW + cx] = (addr >= 0 && screenData[addr] != null) ? screenData[addr] : 7;
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
      attrCellH: sprite.attrCellH,
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
      attrCellH: spriteData.mode === 'multicolour' ? (spriteData.attrCellH || 2) : undefined,
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
      sprite.frames.push(createEmptyFrame(sprite.cellsW, sprite.cellsH, sprite.mode, sprite.attrCellH));
    }

    spriteSheet.sprites.push(sprite);
  }

  setActiveSprite(spriteSheet.sprites.length > 0 ? 0 : -1);
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
      attrCellH: sprite.attrCellH,
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

/** Convert internal row-major attrs to Nirvana column-major order */
function attrsToColumnMajor(attrs, cellsW, cellsH) {
  const rowsPerCol = cellsH * 4;
  const result = new Uint8Array(attrs.length);
  for (let ay = 0; ay < rowsPerCol; ay++) {
    for (let ax = 0; ax < cellsW; ax++) {
      result[ax * rowsPerCol + ay] = attrs[ay * cellsW + ax];
    }
  }
  return result;
}

function exportSpriteAsm() {
  if (spriteSheet.sprites.length === 0) {
    alert('No sprites to export.');
    return;
  }

  const exportFormat = spriteDOM.spriteExportFormat ? spriteDOM.spriteExportFormat.value : 'raw';

  let asm = '; SpectraLab Sprite Sheet: ' + spriteSheet.name + '\n';
  asm += '; Generated by SpectraLab v' + APP_VERSION + '\n\n';

  for (const sprite of spriteSheet.sprites) {
    const label = sprite.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const pixW = sprite.cellsW * 8;
    const pixH = sprite.cellsH * 8;
    asm += '; Sprite: ' + sprite.name + ' (' + pixW + 'x' + pixH;
    if (sprite.frames.length > 1) asm += ', ' + sprite.frames.length + ' frames';
    if (exportFormat === 'nirvana' && sprite.mode === 'multicolour') asm += ', Nirvana btile';
    asm += ')\n';

    for (let fi = 0; fi < sprite.frames.length; fi++) {
      const frame = sprite.frames[fi];
      const frameSuffix = sprite.frames.length > 1 ? '_f' + fi : '';

      if (exportFormat === 'nirvana' && sprite.mode === 'multicolour') {
        // Nirvana requires 8×2 multicolour (attrCellH === 2)
        if ((sprite.attrCellH || 2) !== 2) {
          asm += '; WARNING: ' + sprite.name + ' uses 8x' + (sprite.attrCellH || 2) + ' multicolour, Nirvana requires 8x2. Skipped.\n\n';
          continue;
        }
        // Nirvana: btile attrs are column-major, wtile attrs are row-major
        const isBtile = sprite.cellsW === 2 && sprite.cellsH === 2;
        const exportAttrs = isBtile ? attrsToColumnMajor(frame.attrs, sprite.cellsW, sprite.cellsH) : frame.attrs;
        const attrsPerLine = isBtile ? (sprite.cellsH * 4) : sprite.cellsW;
        asm += label + frameSuffix + ':\n';
        asm += formatDbLinesVisual(Array.from(frame.bitmap), sprite.cellsW) + '\n';
        asm += formatDbLines(Array.from(exportAttrs), attrsPerLine) + '\n';
        asm += '\n';
      } else {
        // Raw layout (original)
        asm += label + frameSuffix + ':\n';
        asm += formatDbLinesVisual(Array.from(frame.bitmap), sprite.cellsW) + '\n';

        if (frame.mask) {
          asm += label + '_mask' + frameSuffix + ':\n';
          asm += formatDbLinesVisual(Array.from(frame.mask), sprite.cellsW) + '\n';
        }

        if (frame.attrs) {
          const attrComment = sprite.mode === 'multicolour' ? ' ; 8x' + getAttrCellH(sprite) + ' multicolour attrs' : '';
          asm += label + '_attr' + frameSuffix + ':' + attrComment + '\n';
          asm += formatDbLines(Array.from(frame.attrs), sprite.cellsW) + '\n';
        }

        asm += '\n';
      }
    }
  }

  const baseName = spriteSheet.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprites';
  downloadFile(asm, baseName + '.asm', 'text/plain');
}

// ============================================================================
// Binary Export
// ============================================================================

function buildSpriteBinBuffer(sprites, exportFormat) {
  let totalSize = 0;
  for (const sprite of sprites) {
    for (const frame of sprite.frames) {
      if (exportFormat === 'nirvana' && sprite.mode === 'multicolour') {
        if ((sprite.attrCellH || 2) !== 2) continue; // skip non-8×2 sprites
        totalSize += frame.bitmap.length + (frame.attrs ? frame.attrs.length : 0);
      } else {
        totalSize += frame.bitmap.length;
        if (frame.mask) totalSize += frame.mask.length;
        if (frame.attrs) totalSize += frame.attrs.length;
      }
    }
  }

  const buffer = new Uint8Array(totalSize);
  let offset = 0;

  for (const sprite of sprites) {
    for (const frame of sprite.frames) {
      if (exportFormat === 'nirvana' && sprite.mode === 'multicolour') {
        if ((sprite.attrCellH || 2) !== 2) continue; // skip non-8×2 sprites
        const isBtile = sprite.cellsW === 2 && sprite.cellsH === 2;
        buffer.set(frame.bitmap, offset);
        offset += frame.bitmap.length;
        const exportAttrs = isBtile ? attrsToColumnMajor(frame.attrs, sprite.cellsW, sprite.cellsH) : frame.attrs;
        buffer.set(exportAttrs, offset);
        offset += exportAttrs.length;
      } else {
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
  }
  return buffer;
}

function getBinExtension(sprites, exportFormat) {
  if (exportFormat === 'nirvana') {
    const first = sprites.find(s => s.mode === 'multicolour');
    if (first && first.cellsW === 2 && first.cellsH === 2) return '.btile';
    if (first && first.cellsW === 3 && first.cellsH === 2) return '.wtile';
  }
  return '.bin';
}

function exportSpriteBin() {
  if (spriteSheet.sprites.length === 0) {
    alert('No sprites to export.');
    return;
  }

  const exportFormat = spriteDOM.spriteExportFormat ? spriteDOM.spriteExportFormat.value : 'raw';
  const baseName = spriteSheet.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprites';

  // Check if all sprites have the same dimensions and mode
  const ref = spriteSheet.sprites[0];
  const allSame = spriteSheet.sprites.every(s =>
    s.cellsW === ref.cellsW && s.cellsH === ref.cellsH && s.mode === ref.mode
  );

  if (!allSame) {
    // Different sizes or modes — warn and abort
    const seen = new Map();
    for (const s of spriteSheet.sprites) {
      const key = (s.cellsW * 8) + 'x' + (s.cellsH * 8) + ' ' + s.mode;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const list = [...seen.entries()].map(([k, n]) => '  • ' + n + '× ' + k).join('\n');
    alert('Cannot export: sprites have different sizes or color modes.\n\n' + list);
    return;
  }

  if (spriteSheet.sprites.length > 1) {
    // Multiple sprites with same size/mode — confirm, then ask join or split
    const desc = (ref.cellsW * 8) + 'x' + (ref.cellsH * 8) + ' ' + ref.mode;
    const n = spriteSheet.sprites.length;
    if (!confirm('Export ' + n + ' spritesets (' + desc + ')?')) return;
    if (confirm('Join all into one file?\n\nOK = join\nCancel = split into ' + n + ' separate files')) {
      const buffer = buildSpriteBinBuffer(spriteSheet.sprites, exportFormat);
      const binExt = getBinExtension(spriteSheet.sprites, exportFormat);
      downloadFile(new Blob([buffer], { type: 'application/octet-stream' }), baseName + binExt);
    } else {
      for (let i = 0; i < spriteSheet.sprites.length; i++) {
        const sprite = spriteSheet.sprites[i];
        const name = sprite.name.replace(/[^a-zA-Z0-9_-]/g, '_') || ('sprite_' + i);
        const buffer = buildSpriteBinBuffer([sprite], exportFormat);
        const binExt = getBinExtension([sprite], exportFormat);
        downloadFile(new Blob([buffer], { type: 'application/octet-stream' }), name + binExt);
      }
    }
  } else {
    // Single sprite — export directly
    const buffer = buildSpriteBinBuffer(spriteSheet.sprites, exportFormat);
    const binExt = getBinExtension(spriteSheet.sprites, exportFormat);
    downloadFile(new Blob([buffer], { type: 'application/octet-stream' }), baseName + binExt);
  }
}

// ============================================================================
// Init on DOMContentLoaded
// ============================================================================

document.addEventListener('DOMContentLoaded', initSpriteEditor);
