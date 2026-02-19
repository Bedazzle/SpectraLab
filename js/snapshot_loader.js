// ============================================================================
// Snapshot Loader — SNA/Z80 parsers, memory viewer, grab-to-sprites, ASM export
// ============================================================================
// @ts-check
"use strict";

// ============================================================================
// Global snapshot state
// ============================================================================

/** @type {{machineType: string, border: number, pagingByte: number, banks: Uint8Array[]}|null} */
let snapshotMemory = null;

// ============================================================================
// SNA Parser
// ============================================================================

/**
 * Check if a file is a snapshot file (.sna or .z80)
 * @param {string} fileName
 * @returns {boolean}
 */
function isSnapshotFile(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'sna' || ext === 'z80';
}

/**
 * Parse a .sna snapshot file.
 * @param {Uint8Array} data - Raw file bytes
 * @returns {{machineType: string, border: number, pagingByte: number, banks: Uint8Array[]}}
 */
function parseSnaFile(data) {
  // Use subarray() — zero-cost views into the file buffer (no data copy)
  const banks = new Array(8);
  for (let i = 0; i < 8; i++) banks[i] = new Uint8Array(16384);

  const border = data[26] & 0x07;

  if (data.length === 49179) {
    // 48K SNA
    banks[5] = data.subarray(27, 27 + 16384);
    banks[2] = data.subarray(27 + 16384, 27 + 32768);
    banks[0] = data.subarray(27 + 32768, 27 + 49152);
    return { machineType: '48K', border, pagingByte: 0, banks };
  }

  // 128K SNA (131103 or 147487 bytes)
  banks[5] = data.subarray(27, 27 + 16384);
  banks[2] = data.subarray(27 + 16384, 27 + 32768);

  // Extension at offset 49179: PC(2), pagingByte(1), TR-DOS(1)
  const pagingByte = data[49181];
  const currentBank = pagingByte & 0x07;

  // First 48K block: the third 16K is the currently paged-in bank
  banks[currentBank] = data.subarray(27 + 32768, 27 + 49152);

  // Remaining banks at offset 49183
  const remainingBanks = [0, 1, 2, 3, 4, 5, 6, 7].filter(b => b !== 5 && b !== 2 && b !== currentBank);
  let offset = 49183;
  for (const bankNum of remainingBanks) {
    if (offset + 16384 <= data.length) {
      banks[bankNum] = data.subarray(offset, offset + 16384);
      offset += 16384;
    }
  }

  return { machineType: '128K', border, pagingByte, banks };
}

// ============================================================================
// Z80 Parser
// ============================================================================

/**
 * Decompress a Z80 block using ED ED nn xx RLE scheme.
 * @param {Uint8Array} data - Compressed data
 * @param {number} maxLen - Maximum output length
 * @param {boolean} compressed - Whether block is compressed
 * @returns {Uint8Array}
 */
function decompressZ80Block(data, maxLen, compressed) {
  if (!compressed) {
    return data.slice(0, maxLen);
  }

  const out = new Uint8Array(maxLen);
  let inPos = 0;
  let outPos = 0;

  while (inPos < data.length && outPos < maxLen) {
    if (inPos + 3 < data.length && data[inPos] === 0xED && data[inPos + 1] === 0xED) {
      const count = data[inPos + 2];
      const value = data[inPos + 3];
      for (let i = 0; i < count && outPos < maxLen; i++) {
        out[outPos++] = value;
      }
      inPos += 4;
    } else {
      out[outPos++] = data[inPos++];
    }
  }

  return out;
}

/**
 * Parse a .z80 snapshot file.
 * @param {Uint8Array} data - Raw file bytes
 * @returns {{machineType: string, border: number, pagingByte: number, banks: Uint8Array[]}}
 */
function parseZ80File(data) {
  const banks = new Array(8);
  for (let i = 0; i < 8; i++) banks[i] = new Uint8Array(16384);

  const border = (data[12] >> 1) & 0x07;
  const pc = data[6] | (data[7] << 8);

  if (pc !== 0) {
    // V1 format — 48K only
    const compressed = (data[12] & 0x20) !== 0;
    let blockData;
    if (compressed) {
      // Find end marker 00 ED ED 00
      let endPos = data.length;
      for (let i = 30; i < data.length - 3; i++) {
        if (data[i] === 0x00 && data[i + 1] === 0xED && data[i + 2] === 0xED && data[i + 3] === 0x00) {
          endPos = i;
          break;
        }
      }
      blockData = decompressZ80Block(data.subarray(30, endPos), 49152, true);
    } else {
      blockData = data.subarray(30, 30 + 49152);
    }

    banks[5] = blockData.subarray(0, 16384);
    banks[2] = blockData.subarray(16384, 32768);
    banks[0] = blockData.subarray(32768, 49152);

    return { machineType: '48K', border, pagingByte: 0, banks };
  }

  // V2/V3 format
  const extHeaderLen = data[30] | (data[31] << 8);
  const headerEnd = 32 + extHeaderLen;

  // Detect hardware mode
  const hwMode = data[34];
  let is128K = false;
  if (extHeaderLen === 23) {
    // V2
    is128K = (hwMode === 3 || hwMode === 4);
  } else {
    // V3+
    is128K = (hwMode === 4 || hwMode === 5 || hwMode === 6);
  }

  const machineType = is128K ? '128K' : '48K';
  const pagingByte = is128K ? data[35] : 0;

  // Parse paged memory blocks
  let offset = headerEnd;
  while (offset + 3 <= data.length) {
    const blockLen = data[offset] | (data[offset + 1] << 8);
    const page = data[offset + 2];
    offset += 3;

    if (offset + (blockLen === 0xFFFF ? 16384 : blockLen) > data.length) break;

    const compressed = blockLen !== 0xFFFF;
    const actualLen = compressed ? blockLen : 16384;
    const rawBlock = data.subarray(offset, offset + actualLen);
    const decompressed = decompressZ80Block(rawBlock, 16384, compressed);

    // Page mapping
    let bankNum = -1;
    if (is128K) {
      // 128K: page 3 → bank 0, page 4 → bank 1, ..., page 10 → bank 7
      if (page >= 3 && page <= 10) {
        bankNum = page - 3;
      }
    } else {
      // 48K: page 8 → bank 5, page 4 → bank 2, page 5 → bank 0
      if (page === 8) bankNum = 5;
      else if (page === 4) bankNum = 2;
      else if (page === 5) bankNum = 0;
    }

    if (bankNum >= 0 && bankNum <= 7) {
      banks[bankNum] = decompressed;
    }

    offset += actualLen;
  }

  return { machineType, border, pagingByte, banks };
}

/**
 * Check if screen data is all zeros (empty black picture).
 * @param {Uint8Array} data
 * @returns {boolean}
 */
function isScreenEmpty(data) {
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0) return false;
  }
  return true;
}

// ============================================================================
// Screen Extraction
// ============================================================================

/**
 * Extract screen(s) from a parsed snapshot.
 * @param {{machineType: string, border: number, pagingByte: number, banks: Uint8Array[]}} snapshot
 * @returns {{name: string, data: Uint8Array}[]}
 */
function extractScreensFromSnapshot(snapshot) {
  const screens = [];

  // Normal screen is always in bank 5, first 6912 bytes
  screens.push({
    name: 'screen',
    data: snapshot.banks[5].subarray(0, 6912)
  });

  // Shadow screen from bank 7 (128K only)
  if (snapshot.machineType === '128K') {
    screens.push({
      name: 'shadow',
      data: snapshot.banks[7].subarray(0, 6912)
    });
  }

  return screens;
}

// ============================================================================
// File Loading Integration
// ============================================================================

/**
 * Load a snapshot file (.sna or .z80), extract screens and store memory.
 * @param {File} file
 */
function loadSnapshotFile(file) {
  const reader = new FileReader();
  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const data = new Uint8Array(buffer);
    const ext = file.name.toLowerCase().split('.').pop();

    let snapshot;
    try {
      if (ext === 'sna') {
        snapshot = parseSnaFile(data);
      } else if (ext === 'z80') {
        snapshot = parseZ80File(data);
      } else {
        return;
      }
    } catch (e) {
      alert('Error parsing snapshot: ' + e.message);
      return;
    }

    // Store snapshot for memory viewer
    snapshotMemory = snapshot;

    // Set border color directly (avoid re-render from setBorderColor)
    if (typeof borderColor !== 'undefined') {
      borderColor = snapshot.border;
      if (typeof borderColorSelect !== 'undefined' && borderColorSelect) {
        borderColorSelect.value = String(snapshot.border);
      }
    }

    // Extract screens and add as pictures
    const screens = extractScreensFromSnapshot(snapshot);
    const baseName = file.name.replace(/\.[^.]+$/, '');

    // Filter out empty screens (all zeros — blank black picture)
    const nonEmpty = screens.filter(s => !isScreenEmpty(s.data));

    for (let i = 0; i < nonEmpty.length; i++) {
      const screenInfo = nonEmpty[i];
      const picName = nonEmpty.length > 1
        ? baseName + (screenInfo.name === 'shadow' ? ' (shadow)' : '')
        : baseName;

      if (typeof addPicture === 'function') {
        addPicture(picName, FORMAT.SCR, screenInfo.data);
      }
    }

    // Show memory viewer button
    const memSection = document.getElementById('memViewerSection');
    if (memSection) memSection.style.display = '';
  });

  reader.readAsArrayBuffer(file);
}

// ============================================================================
// Memory Viewer — state
// ============================================================================

let memViewerOpen = false;
let memCurrentBank = 5;
let memBaseAddr = 0;
let memWidthBytes = 2;    // sprite width in bytes (1 byte = 8 pixels)
let memHeightRows = 16;   // sprite height in pixel rows
let memInvert = false;
let memGrid = true;
let memCharMode = false;
let memZoom = 3;

// Dump layout constants
const MEM_DUMP_COLS = 16;        // bytes per row in dump
const MEM_DUMP_VISIBLE_ROWS = 192; // visible pixel rows in dump

// Selection position within dump (byte column, pixel row)
let memSelCol = 0;   // 0..MEM_DUMP_COLS-1 (byte column in dump)
let memSelRow = 0;   // 0..MEM_DUMP_VISIBLE_ROWS-1 (pixel row in dump)

// Mouse selection drag state
let memSelDragging = false;
let memSelAnchorCol = 0;  // click origin in byte columns
let memSelAnchorRow = 0;  // click origin in pixel rows

// Drag state (panel)
let memPanelDragging = false;
let memPanelDragX = 0;
let memPanelDragY = 0;

// DOM cache
let memDOM = {};

// ============================================================================
// Memory Viewer — initialization
// ============================================================================

function initMemViewer() {
  const ids = [
    'memViewerPanel', 'memViewerTitle', 'memViewerClose',
    'memDumpCanvas', 'memPreviewCanvas',
    'memBankSelect', 'memAddrInput',
    'memWidthInput', 'memHeightInput',
    'memInvertChk', 'memGridChk', 'memCharChk',
    'memZoom1', 'memZoom2', 'memZoom3', 'memZoom4',
    'memNavPrevByte', 'memNavNextByte',
    'memNavPrevLine', 'memNavNextLine',
    'memNavPrevRow', 'memNavNextRow',
    'memNavPrevSprite', 'memNavNextSprite',
    'memNavPrevPage', 'memNavNextPage',
    'memGrabBtn', 'memGrabStatus', 'memGrabModeSelect',
    'memGrabGridOpts', 'memGrabSizeBy', 'memGrabByCells', 'memGrabByCount',
    'memGrabCellsW', 'memGrabCellsH', 'memGrabCols', 'memGrabRows', 'memGrabOrder',
    'memAddrLabel', 'memScrollbar'
  ];
  ids.forEach(id => { memDOM[id] = document.getElementById(id); });

  // Titlebar drag
  const titlebar = memDOM.memViewerTitle;
  if (titlebar) {
    titlebar.addEventListener('mousedown', function(e) {
      memPanelDragging = true;
      const panel = memDOM.memViewerPanel;
      const rect = panel.getBoundingClientRect();
      memPanelDragX = e.clientX - rect.left;
      memPanelDragY = e.clientY - rect.top;
      e.preventDefault();
    });
  }

  document.addEventListener('mousemove', function(e) {
    if (!memPanelDragging) return;
    const panel = memDOM.memViewerPanel;
    if (!panel) return;
    panel.style.left = (e.clientX - memPanelDragX) + 'px';
    panel.style.top = (e.clientY - memPanelDragY) + 'px';
  });

  document.addEventListener('mouseup', function() {
    memPanelDragging = false;
  });

  // Close button
  if (memDOM.memViewerClose) {
    memDOM.memViewerClose.addEventListener('click', closeMemViewer);
  }

  // Bank selector
  if (memDOM.memBankSelect) {
    memDOM.memBankSelect.addEventListener('change', function() {
      memCurrentBank = parseInt(this.value, 10);
      renderMemDump();
      renderMemPreview();
    });
  }

  // Address input
  if (memDOM.memAddrInput) {
    memDOM.memAddrInput.addEventListener('change', function() {
      let val = parseInt(this.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 16383) val = 16383;
      memBaseAddr = val;
      this.value = String(memBaseAddr);
      memSelCol = 0;
      memSelRow = 0;
      memSyncScrollbar();
      renderMemDump();
      renderMemPreview();
    });
  }

  // Vertical scrollbar
  if (memDOM.memScrollbar) {
    memDOM.memScrollbar.addEventListener('input', function() {
      memBaseAddr = parseInt(this.value, 10);
      memSelCol = 0;
      memSelRow = 0;
      if (memDOM.memAddrInput) {
        memDOM.memAddrInput.value = String(memBaseAddr);
      }
      renderMemDump();
      renderMemPreview();
    });
  }

  // Width/Height spinners
  if (memDOM.memWidthInput) {
    memDOM.memWidthInput.addEventListener('change', function() {
      let val = parseInt(this.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 8) val = 8;
      memWidthBytes = val;
      this.value = String(val);
      renderMemDump();
      renderMemPreview();
    });
  }
  if (memDOM.memHeightInput) {
    memDOM.memHeightInput.addEventListener('change', function() {
      let val = parseInt(this.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 64) val = 64;
      memHeightRows = val;
      this.value = String(val);
      renderMemDump();
      renderMemPreview();
    });
  }

  // Checkboxes
  if (memDOM.memInvertChk) {
    memDOM.memInvertChk.addEventListener('change', function() {
      memInvert = this.checked;
      renderMemDump();
      renderMemPreview();
    });
  }
  if (memDOM.memGridChk) {
    memDOM.memGridChk.addEventListener('change', function() {
      memGrid = this.checked;
      renderMemDump();
      renderMemPreview();
    });
  }
  if (memDOM.memCharChk) {
    memDOM.memCharChk.addEventListener('change', function() {
      memCharMode = this.checked;
      renderMemDump();
      renderMemPreview();
    });
  }

  // Zoom radios
  ['memZoom1', 'memZoom2', 'memZoom3', 'memZoom4'].forEach(id => {
    if (memDOM[id]) {
      memDOM[id].addEventListener('change', function() {
        if (this.checked) {
          memZoom = parseInt(this.value, 10);
          renderMemDump();
        }
      });
    }
  });

  // Navigation buttons
  const navActions = {
    memNavPrevByte:   () => memNavigate(-1),
    memNavNextByte:   () => memNavigate(1),
    memNavPrevLine:   () => memNavigate(memCharMode ? -memWidthBytes : -MEM_DUMP_COLS),
    memNavNextLine:   () => memNavigate(memCharMode ? memWidthBytes : MEM_DUMP_COLS),
    memNavPrevRow:    () => memNavigate(memCharMode ? -memWidthBytes * 8 : -MEM_DUMP_COLS * 8),
    memNavNextRow:    () => memNavigate(memCharMode ? memWidthBytes * 8 : MEM_DUMP_COLS * 8),
    memNavPrevSprite: () => memNavigate(memCharMode ? -memWidthBytes * memHeightRows : -memWidthBytes * memHeightRows),
    memNavNextSprite: () => memNavigate(memCharMode ? memWidthBytes * memHeightRows : memWidthBytes * memHeightRows),
    memNavPrevPage:   () => memNavigate(memCharMode ? -memWidthBytes * 8 * 24 : -MEM_DUMP_COLS * MEM_DUMP_VISIBLE_ROWS),
    memNavNextPage:   () => memNavigate(memCharMode ? memWidthBytes * 8 * 24 : MEM_DUMP_COLS * MEM_DUMP_VISIBLE_ROWS)
  };

  for (const [id, fn] of Object.entries(navActions)) {
    if (memDOM[id]) {
      memDOM[id].addEventListener('click', fn);
    }
  }

  // Mouse wheel on dump canvas
  if (memDOM.memDumpCanvas) {
    memDOM.memDumpCanvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      const step = memCharMode ? memWidthBytes : MEM_DUMP_COLS;
      if (e.deltaY > 0) {
        memNavigate(step);
      } else {
        memNavigate(-step);
      }
    }, { passive: false });

    // Mouse handlers for selecting rectangle position and drag-resizing
    memDOM.memDumpCanvas.addEventListener('mousedown', function(e) {
      e.preventDefault();
      const rect = this.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / memZoom / 8); // byte column
      const row = Math.floor((e.clientY - rect.top) / memZoom);      // pixel row

      if (col < 0 || col >= MEM_DUMP_COLS || row < 0 || row >= MEM_DUMP_VISIBLE_ROWS) return;

      memSelDragging = true;
      memSelAnchorCol = col;
      memSelAnchorRow = row;

      // Position rectangle at click point
      memSelCol = col;
      memSelRow = memCharMode ? (Math.floor(row / 8) * 8) : row;

      // Clamp so rectangle stays within dump bounds
      if (memSelCol + memWidthBytes > MEM_DUMP_COLS) {
        memSelCol = MEM_DUMP_COLS - memWidthBytes;
      }
      if (memSelRow + memHeightRows > MEM_DUMP_VISIBLE_ROWS) {
        memSelRow = MEM_DUMP_VISIBLE_ROWS - memHeightRows;
      }
      if (memSelCol < 0) memSelCol = 0;
      if (memSelRow < 0) memSelRow = 0;

      memUpdateAddrLabel();
      renderMemDump();
      renderMemPreview();
    });

    memDOM.memDumpCanvas.addEventListener('mousemove', function(e) {
      if (!memSelDragging) return;
      e.preventDefault();
      const rect = this.getBoundingClientRect();
      let col = Math.floor((e.clientX - rect.left) / memZoom / 8);
      let row = Math.floor((e.clientY - rect.top) / memZoom);

      // Clamp to dump area
      if (col < 0) col = 0;
      if (col >= MEM_DUMP_COLS) col = MEM_DUMP_COLS - 1;
      if (row < 0) row = 0;
      if (row >= MEM_DUMP_VISIBLE_ROWS) row = MEM_DUMP_VISIBLE_ROWS - 1;

      // Calculate rectangle from anchor to current position
      const minCol = Math.min(memSelAnchorCol, col);
      const maxCol = Math.max(memSelAnchorCol, col);
      const minRow = Math.min(memSelAnchorRow, row);
      const maxRow = Math.max(memSelAnchorRow, row);

      memSelCol = minCol;
      memSelRow = memCharMode ? (Math.floor(minRow / 8) * 8) : minRow;

      // Update width/height from drag extent
      let newW = maxCol - minCol + 1;
      let newH;
      if (memCharMode) {
        const endCharRow = Math.floor(maxRow / 8);
        const startCharRow = Math.floor(minRow / 8);
        newH = (endCharRow - startCharRow + 1) * 8;
      } else {
        newH = maxRow - minRow + 1;
      }

      // Clamp dimensions
      if (newW > 8) newW = 8;
      if (newH > 64) newH = 64;
      if (newW < 1) newW = 1;
      if (newH < 1) newH = 1;

      memWidthBytes = newW;
      memHeightRows = newH;

      // Update UI inputs
      if (memDOM.memWidthInput) memDOM.memWidthInput.value = String(memWidthBytes);
      if (memDOM.memHeightInput) memDOM.memHeightInput.value = String(memHeightRows);

      memUpdateAddrLabel();
      renderMemDump();
      renderMemPreview();
    });

    document.addEventListener('mouseup', function() {
      if (memSelDragging) {
        memSelDragging = false;
      }
    });
  }

  // Grab to sprites
  if (memDOM.memGrabBtn) {
    memDOM.memGrabBtn.addEventListener('click', grabMemToSprites);
  }

  // Grab mode toggles
  if (memDOM.memGrabModeSelect) {
    memDOM.memGrabModeSelect.addEventListener('change', function() {
      const isGrid = this.value === 'grid' || this.value === 'gridphases';
      if (memDOM.memGrabGridOpts) memDOM.memGrabGridOpts.style.display = isGrid ? 'flex' : 'none';
    });
  }
  if (memDOM.memGrabSizeBy) {
    memDOM.memGrabSizeBy.addEventListener('change', function() {
      const byCount = this.value === 'count';
      if (memDOM.memGrabByCells) memDOM.memGrabByCells.style.display = byCount ? 'none' : 'flex';
      if (memDOM.memGrabByCount) memDOM.memGrabByCount.style.display = byCount ? 'flex' : 'none';
    });
  }

  // Memory viewer button
  const memBtn = document.getElementById('memViewerBtn');
  if (memBtn) {
    memBtn.addEventListener('click', openMemViewer);
  }
}

// ============================================================================
// Memory Viewer — open/close
// ============================================================================

function openMemViewer() {
  if (!snapshotMemory) return;
  const panel = memDOM.memViewerPanel || document.getElementById('memViewerPanel');
  if (!panel) return;
  panel.style.display = '';
  memViewerOpen = true;
  memSelCol = 0;
  memSelRow = 0;

  // Update bank selector: show for 128K, populate only non-empty banks
  const bankRow = document.getElementById('memBankRow');
  if (bankRow) {
    bankRow.style.display = snapshotMemory.machineType === '128K' ? '' : 'none';
  }
  if (memDOM.memBankSelect) {
    const sel = memDOM.memBankSelect;
    sel.innerHTML = '';
    let firstBank = -1;
    for (let i = 0; i < 8; i++) {
      const bank = snapshotMemory.banks[i];
      if (!bank || isScreenEmpty(bank)) continue;
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      sel.appendChild(opt);
      if (firstBank < 0) firstBank = i;
    }
    // Select bank 5 if available, otherwise first non-empty
    if (sel.querySelector('option[value="5"]')) {
      sel.value = '5';
      memCurrentBank = 5;
    } else if (firstBank >= 0) {
      sel.value = String(firstBank);
      memCurrentBank = firstBank;
    }
  }

  memSyncScrollbar();
  renderMemDump();
  renderMemPreview();
}

function closeMemViewer() {
  const panel = memDOM.memViewerPanel || document.getElementById('memViewerPanel');
  if (panel) panel.style.display = 'none';
  memViewerOpen = false;
}

// ============================================================================
// Memory Viewer — navigation
// ============================================================================

function memNavigate(delta) {
  memBaseAddr += delta;
  // Clamp to bank range
  if (memBaseAddr < 0) memBaseAddr = 0;
  if (memBaseAddr > 16383) memBaseAddr = 16383;
  // Reset selection position on navigation
  memSelCol = 0;
  memSelRow = 0;

  if (memDOM.memAddrInput) {
    memDOM.memAddrInput.value = String(memBaseAddr);
  }
  memSyncScrollbar();
  renderMemDump();
  renderMemPreview();
}

/** Sync scrollbar thumb to current memBaseAddr */
function memSyncScrollbar() {
  if (memDOM.memScrollbar) {
    memDOM.memScrollbar.value = String(memBaseAddr);
  }
}

// ============================================================================
// Memory Viewer — effective address from selection position
// ============================================================================

/**
 * Compute the effective base address for preview/grab, accounting for
 * the selection rectangle's position within the dump viewport.
 * @returns {number}
 */
function memEffectiveAddr() {
  let offset;
  if (memCharMode) {
    const charRow = Math.floor(memSelRow / 8);
    offset = (charRow * MEM_DUMP_COLS + memSelCol) * 8;
  } else {
    offset = memSelRow * MEM_DUMP_COLS + memSelCol;
  }
  return (memBaseAddr + offset) & 0x3FFF;
}

/** Update the address label below the dump canvas */
function memUpdateAddrLabel() {
  const addr = memEffectiveAddr();
  if (memDOM.memAddrLabel) {
    memDOM.memAddrLabel.textContent = 'Addr: ' + addr + ' ($' + addr.toString(16).toUpperCase().padStart(4, '0') + ')';
  }
}

// ============================================================================
// Memory Viewer — read byte from current bank
// ============================================================================

/**
 * Read a byte from the current memory bank (wrapping within 0-16383).
 * @param {number} addr
 * @returns {number}
 */
function memReadByte(addr) {
  if (!snapshotMemory) return 0;
  const bank = snapshotMemory.banks[memCurrentBank];
  if (!bank) return 0;
  return bank[addr & 0x3FFF];
}

// ============================================================================
// Memory Viewer — rendering
// ============================================================================

function renderMemDump() {
  const canvas = memDOM.memDumpCanvas;
  if (!canvas || !snapshotMemory) return;

  const pixelW = MEM_DUMP_COLS * 8;
  const pixelH = MEM_DUMP_VISIBLE_ROWS;

  canvas.width = pixelW * memZoom;
  canvas.height = pixelH * memZoom;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Draw to offscreen then scale
  const offCanvas = document.createElement('canvas');
  offCanvas.width = pixelW;
  offCanvas.height = pixelH;
  const offCtx = offCanvas.getContext('2d');
  const imgData = offCtx.createImageData(pixelW, pixelH);
  const pixels = imgData.data;

  const fg = memInvert ? [0, 0, 0] : [0, 200, 0];       // green on black
  const bg = memInvert ? [0, 200, 0] : [0, 0, 0];

  for (let row = 0; row < pixelH; row++) {
    for (let col = 0; col < MEM_DUMP_COLS; col++) {
      let addr;
      if (memCharMode) {
        const charRow = Math.floor(row / 8);
        const lineInChar = row % 8;
        addr = memBaseAddr + (charRow * MEM_DUMP_COLS + col) * 8 + lineInChar;
      } else {
        addr = memBaseAddr + row * MEM_DUMP_COLS + col;
      }

      const byte = memReadByte(addr);

      for (let bit = 7; bit >= 0; bit--) {
        const px = col * 8 + (7 - bit);
        const idx = (row * pixelW + px) * 4;
        const isSet = (byte & (1 << bit)) !== 0;
        const c = isSet ? fg : bg;
        pixels[idx] = c[0];
        pixels[idx + 1] = c[1];
        pixels[idx + 2] = c[2];
        pixels[idx + 3] = 255;
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(offCanvas, 0, 0, pixelW * memZoom, pixelH * memZoom);

  // Draw selection rectangle at current selection position
  const selX = memSelCol * 8 * memZoom;
  const selY = memSelRow * memZoom;
  const selW = memWidthBytes * 8 * memZoom;
  const selH = memHeightRows * memZoom;
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 1;
  ctx.strokeRect(selX + 0.5, selY + 0.5, selW - 1, selH - 1);

  // Grid overlay
  if (memGrid) {
    ctx.strokeStyle = 'rgba(100,100,100,0.3)';
    ctx.lineWidth = 1;
    // Vertical grid per byte
    for (let c = 1; c < MEM_DUMP_COLS; c++) {
      const x = c * 8 * memZoom;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, pixelH * memZoom);
      ctx.stroke();
    }
    // Horizontal grid per 8 rows
    for (let r = 8; r < pixelH; r += 8) {
      const y = r * memZoom;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(pixelW * memZoom, y + 0.5);
      ctx.stroke();
    }
  }
}

function renderMemPreview() {
  const canvas = memDOM.memPreviewCanvas;
  if (!canvas || !snapshotMemory) return;

  const prevZoom = 2;
  const pixelW = memWidthBytes * 8;
  const pixelH = memHeightRows;

  canvas.width = pixelW * prevZoom;
  canvas.height = pixelH * prevZoom;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = pixelW;
  offCanvas.height = pixelH;
  const offCtx = offCanvas.getContext('2d');
  const imgData = offCtx.createImageData(pixelW, pixelH);
  const pixels = imgData.data;

  const fg = memInvert ? [0, 0, 0] : [0, 200, 0];
  const bg = memInvert ? [0, 200, 0] : [0, 0, 0];

  const effAddr = memEffectiveAddr();

  for (let row = 0; row < pixelH; row++) {
    for (let col = 0; col < memWidthBytes; col++) {
      let addr;
      if (memCharMode) {
        const charRow = Math.floor(row / 8);
        const lineInChar = row % 8;
        addr = effAddr + (charRow * memWidthBytes + col) * 8 + lineInChar;
      } else {
        addr = effAddr + row * memWidthBytes + col;
      }

      const byte = memReadByte(addr);

      for (let bit = 7; bit >= 0; bit--) {
        const px = col * 8 + (7 - bit);
        const idx = (row * pixelW + px) * 4;
        const isSet = (byte & (1 << bit)) !== 0;
        const c = isSet ? fg : bg;
        pixels[idx] = c[0];
        pixels[idx + 1] = c[1];
        pixels[idx + 2] = c[2];
        pixels[idx + 3] = 255;
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(offCanvas, 0, 0, pixelW * prevZoom, pixelH * prevZoom);
}

// ============================================================================
// Grab to Sprites
// ============================================================================

/**
 * Extract a sprite frame from memory at a given base address.
 * @param {number} baseAddr - Start address in current bank
 * @param {number} cellsW - Width in 8px cells (= bytes per row)
 * @param {number} cellsH - Height in 8px cells
 * @returns {object} Frame object {bitmap, mask, attrs}
 */
function extractFrameFromMem(baseAddr, cellsW, cellsH) {
  const pixelH = cellsH * 8;
  const bitmap = new Uint8Array(pixelH * cellsW);

  for (let row = 0; row < pixelH; row++) {
    for (let col = 0; col < cellsW; col++) {
      let addr;
      if (memCharMode) {
        const charRow = Math.floor(row / 8);
        const lineInChar = row % 8;
        addr = baseAddr + (charRow * cellsW + col) * 8 + lineInChar;
      } else {
        addr = baseAddr + row * cellsW + col;
      }
      bitmap[row * cellsW + col] = memReadByte(addr);
    }
  }

  return { bitmap: bitmap, mask: null, attrs: null };
}

function grabMemToSprites() {
  if (!snapshotMemory) return;
  if (typeof spriteSheet === 'undefined') {
    alert('Sprite editor not available');
    return;
  }

  const grabAddr = memEffectiveAddr();
  const mode = memDOM.memGrabModeSelect ? memDOM.memGrabModeSelect.value : 'single';
  const isGrid = mode === 'grid' || mode === 'gridphases';
  const isPhases = mode === 'phases' || mode === 'gridphases';

  // Determine sprite cell dimensions and grid layout
  let cellsW, cellsH;
  let frames = [];

  if (isGrid) {
    const sizeBy = memDOM.memGrabSizeBy ? memDOM.memGrabSizeBy.value : 'cells';
    const order = memDOM.memGrabOrder ? memDOM.memGrabOrder.value : 'row';

    // Total region = current W/H selection
    const regionCellsW = memWidthBytes;
    const regionCellsH = Math.ceil(memHeightRows / 8);
    let cols, rows;

    if (sizeBy === 'count') {
      cols = parseInt(memDOM.memGrabCols?.value) || 4;
      rows = parseInt(memDOM.memGrabRows?.value) || 4;
      cellsW = Math.floor(regionCellsW / cols);
      cellsH = Math.floor(regionCellsH / rows);
      if (cellsW <= 0 || cellsH <= 0) {
        if (memDOM.memGrabStatus) memDOM.memGrabStatus.textContent = 'Region too small';
        return;
      }
    } else {
      cellsW = parseInt(memDOM.memGrabCellsW?.value) || 2;
      cellsH = parseInt(memDOM.memGrabCellsH?.value) || 2;
      cols = Math.floor(regionCellsW / cellsW);
      rows = Math.floor(regionCellsH / cellsH);
    }

    if (cols <= 0 || rows <= 0) {
      if (memDOM.memGrabStatus) memDOM.memGrabStatus.textContent = 'Region too small';
      return;
    }

    // Build frames in selected order
    const addFrame = (col, row) => {
      let addr;
      if (memCharMode) {
        addr = grabAddr + (row * cellsH * regionCellsW + col * cellsW) * 8;
      } else {
        addr = grabAddr + row * cellsH * 8 * regionCellsW + col * cellsW;
      }
      frames.push(extractFrameFromMem(addr, cellsW, cellsH));
    };

    if (order === 'col') {
      for (let col = 0; col < cols; col++)
        for (let row = 0; row < rows; row++)
          addFrame(col, row);
    } else {
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++)
          addFrame(col, row);
    }
  } else {
    // Single or Phases: one frame from current selection
    cellsW = memWidthBytes;
    cellsH = Math.ceil(memHeightRows / 8);
    frames.push(extractFrameFromMem(grabAddr, cellsW, cellsH));
  }

  // Add to sprite sheet (same logic as picture grab)
  if (isPhases) {
    // Append frame(s) to selected sprite if size matches, else create new
    const sprite = (selectedSpriteIndex >= 0 && selectedSpriteIndex < spriteSheet.sprites.length)
      ? spriteSheet.sprites[selectedSpriteIndex] : null;
    if (sprite && sprite.cellsW === cellsW && sprite.cellsH === cellsH) {
      for (const f of frames) sprite.frames.push(f);
      currentFrameIndex = sprite.frames.length - 1;
      if (memDOM.memGrabStatus) memDOM.memGrabStatus.textContent = frames.length + ' frame(s) added';
    } else {
      spriteSheet.sprites.push({
        name: 'Mem_' + memCurrentBank + '_' + grabAddr,
        cellsW: cellsW, cellsH: cellsH, mode: 'mono', frames: frames
      });
      selectedSpriteIndex = spriteSheet.sprites.length - 1;
      currentFrameIndex = frames.length - 1;
      if (memDOM.memGrabStatus) memDOM.memGrabStatus.textContent = frames.length + ' frame(s) grabbed';
    }
  } else if (isGrid) {
    // Each cell = separate sprite
    const baseNum = spriteSheet.sprites.length + 1;
    for (let i = 0; i < frames.length; i++) {
      spriteSheet.sprites.push({
        name: 'Mem_' + (baseNum + i),
        cellsW: cellsW, cellsH: cellsH, mode: 'mono', frames: [frames[i]]
      });
    }
    selectedSpriteIndex = spriteSheet.sprites.length - 1;
    currentFrameIndex = 0;
    if (memDOM.memGrabStatus) memDOM.memGrabStatus.textContent = frames.length + ' sprites grabbed';
  } else {
    // Single sprite
    spriteSheet.sprites.push({
      name: 'Mem_' + memCurrentBank + '_' + grabAddr,
      cellsW: cellsW, cellsH: cellsH, mode: 'mono', frames: frames
    });
    selectedSpriteIndex = spriteSheet.sprites.length - 1;
    currentFrameIndex = 0;
    if (memDOM.memGrabStatus) memDOM.memGrabStatus.textContent = cellsW + 'x' + cellsH + ' sprite grabbed';
  }

  if (typeof updateSpriteList === 'function') updateSpriteList();
  if (typeof updateSpriteProps === 'function') updateSpriteProps();
}

// ============================================================================
// Initialize on load
// ============================================================================

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMemViewer);
  } else {
    initMemViewer();
  }
}
