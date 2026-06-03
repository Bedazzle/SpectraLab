// ============================================================================
// Plugin Manager — custom format support via JSON descriptors and JS plugins
// ============================================================================
// @ts-check
"use strict";

// ============================================================================
// Global plugin state
// ============================================================================

/** @type {Object<string, Object>} Loaded plugins keyed by id */
let pluginRegistry = {};

/** @type {string|null} Currently active plugin session */
let activePluginId = null;

/** @type {Uint8Array|null} Original file bytes for save-back (deep copy) */
let pluginOriginalFileBytes = null;

/** @type {Map<number, Object>} Maps PictureState.id → plugin picture entry */
let pluginPictureMap = new Map();

/** @type {string} Original file name for download */
let pluginOriginalFileName = '';

// ============================================================================
// Persistence
// ============================================================================

const PLUGIN_STORAGE_KEY = 'spectraLabPlugins';

/** Restore plugins from localStorage */
function loadPluginsFromStorage() {
  try {
    const raw = localStorage.getItem(PLUGIN_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const desc of arr) {
          if (desc && desc.id) {
            pluginRegistry[desc.id] = desc;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Plugin storage load error:', e);
  }
}

/** Persist plugins to localStorage */
function savePluginsToStorage() {
  try {
    const arr = Object.values(pluginRegistry);
    localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('Plugin storage save error:', e);
  }
}

// ============================================================================
// Numeric parsing
// ============================================================================

/**
 * Parse a numeric value that may be hex string "0x4000" or plain number.
 * @param {string|number} val
 * @returns {number}
 */
function parseNumericValue(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s.startsWith('0x') || s.startsWith('0X')) {
      return parseInt(s, 16);
    }
    return parseInt(s, 10);
  }
  return NaN;
}

// ============================================================================
// Address resolution
// ============================================================================

/**
 * Default Z80 address → bank mapping.
 * 0x0000-0x3FFF → ROM (not accessible), 0x4000-0x7FFF → bank 5,
 * 0x8000-0xBFFF → bank 2, 0xC000-0xFFFF → paged bank (from pagingByte).
 * @param {number} addr - Z80 logical address
 * @param {number|undefined} bankOverride - explicit bank number
 * @param {{pagingByte: number}} snapshot
 * @returns {number} bank number
 */
function z80AddrToBank(addr, bankOverride, snapshot) {
  if (bankOverride !== undefined && bankOverride !== null) {
    return bankOverride;
  }
  if (addr >= 0x4000 && addr <= 0x7FFF) return 5;
  if (addr >= 0x8000 && addr <= 0xBFFF) return 2;
  if (addr >= 0xC000 && addr <= 0xFFFF) {
    return snapshot ? (snapshot.pagingByte & 0x07) : 0;
  }
  return -1;
}

/**
 * Read bytes from snapshot bank memory at a Z80 address, handling bank boundaries.
 * @param {{banks: Uint8Array[]}} snapshot
 * @param {number} startAddr - Z80 logical address
 * @param {number} length
 * @param {number|undefined} bankOverride
 * @returns {Uint8Array}
 */
function readZ80Bytes(snapshot, startAddr, length, bankOverride) {
  const result = new Uint8Array(length);
  let remaining = length;
  let pos = 0;
  let addr = startAddr;

  while (remaining > 0) {
    const bank = z80AddrToBank(addr, bankOverride, snapshot);
    if (bank < 0 || bank > 7 || !snapshot.banks[bank]) {
      break;
    }
    // Offset within the 16K bank
    const bankBase = (addr < 0x4000) ? 0 : (addr & 0xC000);
    const offsetInBank = addr - bankBase;
    const available = 16384 - offsetInBank;
    const chunk = Math.min(remaining, available);

    result.set(snapshot.banks[bank].subarray(offsetInBank, offsetInBank + chunk), pos);
    pos += chunk;
    remaining -= chunk;
    addr += chunk;

    // If we had an explicit bank override, don't cross into next bank
    if (bankOverride !== undefined && bankOverride !== null) break;
  }
  return result;
}

/**
 * Write bytes into snapshot bank memory at a Z80 address.
 * @param {{banks: Uint8Array[], pagingByte: number}} snapshot
 * @param {number} startAddr
 * @param {Uint8Array} data
 * @param {number|undefined} bankOverride
 */
function writeZ80Bytes(snapshot, startAddr, data, bankOverride) {
  let remaining = data.length;
  let pos = 0;
  let addr = startAddr;

  while (remaining > 0) {
    const bank = z80AddrToBank(addr, bankOverride, snapshot);
    if (bank < 0 || bank > 7 || !snapshot.banks[bank]) break;

    const bankBase = (addr < 0x4000) ? 0 : (addr & 0xC000);
    const offsetInBank = addr - bankBase;
    const available = 16384 - offsetInBank;
    const chunk = Math.min(remaining, available);

    snapshot.banks[bank].set(data.subarray(pos, pos + chunk), offsetInBank);
    pos += chunk;
    remaining -= chunk;
    addr += chunk;

    if (bankOverride !== undefined && bankOverride !== null) break;
  }
}

/**
 * Resolve a plugin source descriptor to raw bytes from a file.
 * @param {Object} source - Plugin picture source descriptor
 * @param {Uint8Array} fileBytes - Raw file bytes
 * @param {Object|null} snapshot - Parsed snapshot or null
 * @returns {{bytes: Uint8Array, addressMode: string, address: number, bank: number|undefined}}
 */
function resolvePluginSource(source, fileBytes, snapshot) {
  const mode = source.addressMode || 'offset';
  const length = parseNumericValue(source.length);

  if (mode === 'z80addr') {
    const addr = parseNumericValue(source.address);
    const bank = (source.bank !== undefined && source.bank !== null)
      ? parseNumericValue(source.bank) : undefined;
    if (!snapshot) {
      throw new Error('z80addr mode requires a snapshot file (.sna/.z80)');
    }
    const bytes = readZ80Bytes(snapshot, addr, length, bank);
    return { bytes, addressMode: mode, address: addr, bank };
  }

  // Raw offset mode
  const offset = parseNumericValue(source.offset);
  if (offset < 0 || offset + length > fileBytes.length) {
    throw new Error('Offset ' + offset + ' + length ' + length +
      ' exceeds file size ' + fileBytes.length);
  }
  const bytes = fileBytes.slice(offset, offset + length);
  return { bytes, addressMode: mode, address: offset, bank: undefined };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a plugin descriptor object.
 * @param {Object} desc
 * @returns {string|null} Error message, or null if valid
 */
function validateDescriptor(desc) {
  if (!desc || typeof desc !== 'object') return 'Descriptor must be an object';
  if (!desc.id || typeof desc.id !== 'string') return 'Missing or invalid "id"';
  if (!desc.name || typeof desc.name !== 'string') return 'Missing or invalid "name"';

  if (desc.type === 'js') {
    // JS plugin — jsSource may be a string or an array of strings (one per line)
    if (!desc.jsSource ||
        (typeof desc.jsSource !== 'string' && !Array.isArray(desc.jsSource))) {
      return 'JS plugin requires "jsSource" (string or array of strings)';
    }
  } else {
    // JSON descriptor
    if (!Array.isArray(desc.pictures) || desc.pictures.length === 0) {
      return 'Missing or empty "pictures" array';
    }
    for (let i = 0; i < desc.pictures.length; i++) {
      const pic = desc.pictures[i];
      if (!pic.name) return 'Picture ' + i + ': missing "name"';
      if (!pic.format) return 'Picture ' + i + ': missing "format"';
      if (!pic.source) return 'Picture ' + i + ': missing "source"';
      const mode = pic.source.addressMode || 'offset';
      if (mode !== 'z80addr' && mode !== 'offset') {
        return 'Picture ' + i + ': invalid addressMode "' + mode + '"';
      }
      if (mode === 'z80addr' && pic.source.address === undefined) {
        return 'Picture ' + i + ': z80addr mode requires "address"';
      }
      if (mode === 'offset' && pic.source.offset === undefined) {
        return 'Picture ' + i + ': offset mode requires "offset"';
      }
      if (pic.source.length === undefined) {
        return 'Picture ' + i + ': missing "length"';
      }
    }
  }

  if (desc.fixups && !Array.isArray(desc.fixups)) {
    return '"fixups" must be an array';
  }

  return null;
}

// ============================================================================
// Loading / unloading
// ============================================================================

/**
 * Check if a file name is a plugin descriptor.
 * @param {string} fileName
 * @returns {boolean}
 */
function isPluginDescriptorFile(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.slplugin') || lower.endsWith('.slpluginjs') ||
    (lower.endsWith('.json') && lower.includes('plugin'));
}

/**
 * Load and register a plugin descriptor from a File object.
 * @param {File} file
 */
function loadPluginDescriptorFile(file) {
  const reader = new FileReader();
  reader.addEventListener('load', function (event) {
    const text = event.target?.result;
    if (typeof text !== 'string') return;

    let desc;
    try {
      desc = JSON.parse(text);
    } catch (e) {
      alert('Plugin parse error: ' + e.message);
      return;
    }

    const err = validateDescriptor(desc);
    if (err) {
      alert('Plugin validation error: ' + err);
      return;
    }

    // Check for duplicate
    if (pluginRegistry[desc.id]) {
      if (!confirm('Plugin "' + desc.name + '" is already loaded. Replace it?')) {
        return;
      }
    }

    pluginRegistry[desc.id] = desc;
    savePluginsToStorage();
    updatePluginUI();
  });
  reader.readAsText(file);
}

/**
 * Remove a plugin by ID.
 * @param {string} pluginId
 */
function removePlugin(pluginId) {
  if (activePluginId === pluginId) {
    closePluginSession();
  }
  delete pluginRegistry[pluginId];
  savePluginsToStorage();
  updatePluginUI();
}

// ============================================================================
// JS plugin evaluation (Tier 2)
// ============================================================================

/**
 * Build the SL namespace object exposed to JS plugins.
 * Only includes modules that are actually loaded.
 * @returns {Object}
 */
function buildPluginContext() {
  const ctx = {};
  if (typeof ZX0  !== 'undefined') ctx.ZX0  = ZX0;
  if (typeof ZX7  !== 'undefined') ctx.ZX7  = ZX7;
  if (typeof RLE  !== 'undefined') ctx.RLE  = RLE;
  if (typeof ZXSC !== 'undefined') ctx.ZXSC = ZXSC;
  if (typeof LC   !== 'undefined') ctx.LC   = LC;
  if (typeof UPKR !== 'undefined') ctx.UPKR = UPKR;
  return ctx;
}

/**
 * Evaluate a JS plugin source and return the plugin object.
 * @param {Object} descriptor
 * @returns {{extract: Function, patch: Function|undefined}}
 */
function loadJsPlugin(descriptor) {
  // jsSource can be a single string or an array of lines (joined with newlines)
  const src = Array.isArray(descriptor.jsSource)
    ? descriptor.jsSource.join('\n')
    : descriptor.jsSource;
  const fn = new Function('SL', 'let plugin = null;\n' + src + '\nreturn plugin;');
  const plugin = fn(buildPluginContext());
  if (!plugin || typeof plugin.extract !== 'function') {
    throw new Error('JS plugin must define plugin.extract(fileBytes, snapshot)');
  }
  return plugin;
}

// ============================================================================
// File operations — extraction
// ============================================================================

/**
 * Open a file using a specific plugin, extract pictures and add to viewer.
 * @param {File} file
 * @param {string} pluginId
 */
function openFileWithPlugin(file, pluginId) {
  const desc = pluginRegistry[pluginId];
  if (!desc) {
    alert('Plugin not found: ' + pluginId);
    return;
  }

  const reader = new FileReader();
  reader.addEventListener('load', function (event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const fileBytes = new Uint8Array(buffer);

    // Try to parse as snapshot if applicable
    let snapshot = null;
    const ext = file.name.toLowerCase().split('.').pop();
    try {
      if (ext === 'sna' && typeof parseSnaFile === 'function') {
        snapshot = parseSnaFile(fileBytes);
      } else if (ext === 'z80' && typeof parseZ80File === 'function') {
        snapshot = parseZ80File(fileBytes);
      }
    } catch (e) {
      console.warn('Snapshot parse failed, using raw mode:', e);
    }

    // Determine whether this plugin needs a save-back session.
    // JSON descriptor plugins always get a session (they patch into container files).
    // JS plugins get a session only if "session": true is set in the descriptor
    // (for plugins that patch into .sna/.bin containers). Pure codecs like RLE
    // don't need a session — they use the Export button instead.
    const needsSession = desc.type !== 'js' || desc.session === true;

    // Close any existing plugin session
    if (activePluginId) {
      closePluginSession();
    }

    if (needsSession) {
      // Store original file for save-back
      activePluginId = pluginId;
      pluginOriginalFileBytes = fileBytes.slice(); // deep copy
      pluginOriginalFileName = file.name;
      pluginPictureMap.clear();
    }

    let extractedPictures;

    if (desc.type === 'js') {
      // JS plugin path — extract only, no session
      try {
        const jsPlugin = loadJsPlugin(desc);
        const snapshotInfo = snapshot ? {
          banks: snapshot.banks,
          machineType: snapshot.machineType,
          pagingByte: snapshot.pagingByte
        } : null;
        const results = jsPlugin.extract(fileBytes, snapshotInfo);
        if (!Array.isArray(results)) {
          throw new Error('extract() must return an array');
        }
        extractedPictures = results.map(function (r) {
          return {
            name: r.name,
            format: r.format,
            data: r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data),
            source: null
          };
        });
      } catch (e) {
        alert('JS plugin extract error: ' + e.message);
        return;
      }
    } else {
      // JSON descriptor path
      extractedPictures = [];
      for (let i = 0; i < desc.pictures.length; i++) {
        const picDesc = desc.pictures[i];
        try {
          const resolved = resolvePluginSource(picDesc.source, fileBytes, snapshot);
          extractedPictures.push({
            name: picDesc.name,
            format: picDesc.format,
            data: resolved.bytes,
            source: picDesc.source,
            index: i
          });
        } catch (e) {
          console.warn('Plugin picture "' + picDesc.name + '" extract error:', e);
          extractedPictures.push({
            name: picDesc.name + ' (ERROR)',
            format: picDesc.format,
            data: new Uint8Array(0),
            source: picDesc.source,
            index: i,
            error: e.message
          });
        }
      }
    }

    // Store snapshot for memory viewer if we have one
    if (snapshot && typeof snapshotMemory !== 'undefined') {
      snapshotMemory = snapshot;
    }

    // Add extracted pictures to the viewer
    const baseName = file.name.replace(/\.[^.]+$/, '');
    let addedCount = 0;
    for (const extracted of extractedPictures) {
      if (extracted.error) continue;
      if (extracted.data.length === 0) continue;

      const picName = baseName + ' — ' + extracted.name;
      const format = extracted.format;

      // Create internal picture via importPicture
      let internalPicture = null;
      if (typeof importPicture === 'function') {
        internalPicture = importPicture(format, extracted.data, picName);
      }
      // Fallback: try importScr for 'scr' format
      if (!internalPicture && format === FORMAT.SCR && typeof importScr === 'function') {
        internalPicture = importScr(extracted.data, picName);
      }

      if (typeof addPicture === 'function') {
        const idx = addPicture(picName, format, extracted.data, internalPicture);
        if (idx >= 0) {
          // Track this picture for save-back (only for session-based plugins)
          if (needsSession) {
            const picState = openPictures[idx];
            if (picState) {
              pluginPictureMap.set(picState.id, {
                pluginId: pluginId,
                source: extracted.source,
                index: extracted.index,
                format: format,
                name: extracted.name
              });
            }
          }
          addedCount++;
        }
      }
    }

    if (addedCount === 0) {
      alert('No pictures could be extracted with this plugin.');
      if (needsSession) closePluginSession();
      return;
    }

    updatePluginUI();
  });
  reader.readAsArrayBuffer(file);
}

// ============================================================================
// File operations — save-back
// ============================================================================

/**
 * Apply fixup entries to file bytes.
 * @param {Array} fixups
 * @param {Uint8Array} fileBytes
 * @param {Object|null} snapshot
 */
function applyFixups(fixups, fileBytes, snapshot) {
  if (!fixups || !Array.isArray(fixups)) return;

  for (const fixup of fixups) {
    const mode = fixup.addressMode || 'offset';
    const values = fixup.value;
    if (!Array.isArray(values)) continue;

    if (mode === 'offset') {
      const offset = parseNumericValue(fixup.offset);
      for (let i = 0; i < values.length; i++) {
        if (offset + i < fileBytes.length) {
          fileBytes[offset + i] = values[i] & 0xFF;
        }
      }
    } else if (mode === 'z80addr' && snapshot) {
      const addr = parseNumericValue(fixup.address);
      const bank = (fixup.bank !== undefined && fixup.bank !== null)
        ? parseNumericValue(fixup.bank) : undefined;
      writeZ80Bytes(snapshot, addr, new Uint8Array(values), bank);
    }
  }
}

/**
 * Replace the currently active picture with a .scr file chosen by the user.
 */
function replacePictureFromFile() {
  if (!activePluginId) {
    alert('No active plugin session.');
    return;
  }
  if (typeof activePictureIndex === 'undefined' || activePictureIndex < 0 ||
      activePictureIndex >= openPictures.length) {
    alert('No active picture to replace.');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.scr';
  input.addEventListener('change', function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const data = new Uint8Array(/** @type {ArrayBuffer} */ (reader.result));
      if (data.length !== SCREEN.TOTAL_SIZE) {
        alert('Invalid .scr file: expected ' + SCREEN.TOTAL_SIZE + ' bytes, got ' + data.length + '.');
        return;
      }
      // Save current state, then replace data
      if (typeof saveCurrentPictureState === 'function') {
        saveCurrentPictureState();
      }
      const pic = openPictures[activePictureIndex];
      pic.screenData = data.slice();
      pic.undoStack = [];
      pic.redoStack = [];
      pic.modified = true;
      // Reload into viewer
      if (typeof loadPictureState === 'function') {
        loadPictureState(activePictureIndex);
      }
      if (typeof editorRender === 'function') {
        editorRender();
      } else if (typeof renderScreen === 'function') {
        renderScreen();
      }
      if (typeof updatePictureTabBar === 'function') {
        updatePictureTabBar();
      }
    };
    reader.readAsArrayBuffer(file);
  });
  input.click();
}

/**
 * Save patched file — patches all plugin pictures back into the original file.
 */
function saveWithPlugin() {
  if (!activePluginId || !pluginOriginalFileBytes) {
    alert('No active plugin session.');
    return;
  }

  const desc = pluginRegistry[activePluginId];
  if (!desc) {
    alert('Plugin not found.');
    return;
  }

  // Ensure the currently active picture's state is saved to openPictures[]
  if (typeof saveCurrentPictureState === 'function') {
    saveCurrentPictureState();
  }

  // Work on a deep copy of the original file
  const patchedFile = pluginOriginalFileBytes.slice();

  // Parse snapshot from the copy so bank views point into patchedFile
  let snapshot = null;
  const ext = pluginOriginalFileName.toLowerCase().split('.').pop();
  try {
    if (ext === 'sna' && typeof parseSnaFile === 'function') {
      snapshot = parseSnaFile(patchedFile);
    } else if (ext === 'z80' && typeof parseZ80File === 'function') {
      // Z80 save-back is limited — decompression means we can't write back directly
      // Fall through to handle as raw offset only
    }
  } catch (e) {
    console.warn('Snapshot re-parse failed:', e);
  }

  if (desc.type === 'js') {
    // JS plugin save path
    try {
      const jsPlugin = loadJsPlugin(desc);
      if (typeof jsPlugin.patch !== 'function') {
        alert('This JS plugin does not support save-back (no patch function).');
        return;
      }
      // Collect current picture data
      const pictures = [];
      for (const [picId, entry] of pluginPictureMap) {
        const picState = openPictures.find(function (p) { return p.id === picId; });
        if (picState) {
          pictures.push({
            name: entry.name,
            format: entry.format,
            data: picState.screenData
          });
        }
      }
      const snapshotInfo = snapshot ? {
        banks: snapshot.banks,
        machineType: snapshot.machineType,
        pagingByte: snapshot.pagingByte
      } : null;
      const result = jsPlugin.patch(patchedFile, pictures, snapshotInfo);
      // Support both sync (Uint8Array) and async (Promise) patch results
      if (result && typeof result.then === 'function') {
        result.then(function (asyncResult) {
          if (asyncResult === null) return; // cancelled by user
          const finalBytes = asyncResult instanceof Uint8Array ? asyncResult : patchedFile;
          downloadFile(finalBytes, pluginOriginalFileName, 'application/octet-stream');
        }).catch(function (e) {
          alert('JS plugin patch error: ' + e.message);
        });
      } else {
        const finalBytes = result instanceof Uint8Array ? result : patchedFile;
        downloadFile(finalBytes, pluginOriginalFileName, 'application/octet-stream');
      }
    } catch (e) {
      alert('JS plugin patch error: ' + e.message);
    }
    return;
  }

  // JSON descriptor save path
  for (const [picId, entry] of pluginPictureMap) {
    const picState = openPictures.find(function (p) { return p.id === picId; });
    if (!picState) continue;

    // Get current screenData (the raw format bytes)
    const currentData = picState.screenData;
    if (!currentData || currentData.length === 0) continue;

    const source = entry.source;
    if (!source) continue;

    const mode = source.addressMode || 'offset';

    if (mode === 'z80addr' && snapshot) {
      const addr = parseNumericValue(source.address);
      const bank = (source.bank !== undefined && source.bank !== null)
        ? parseNumericValue(source.bank) : undefined;
      // Write directly into snapshot bank views (which point into patchedFile)
      writeZ80Bytes(snapshot, addr, currentData, bank);
    } else if (mode === 'offset') {
      const offset = parseNumericValue(source.offset);
      const len = Math.min(currentData.length, patchedFile.length - offset);
      if (offset >= 0 && len > 0) {
        patchedFile.set(currentData.subarray(0, len), offset);
      }
    } else if (mode === 'z80addr' && !snapshot) {
      // Z80 file without re-parse capability — warn user
      console.warn('Cannot save z80addr picture "' + entry.name +
        '" back to .z80 file (decompression prevents direct write-back)');
    }
  }

  // Apply fixups
  applyFixups(desc.fixups, patchedFile, snapshot);

  // Download
  if (typeof downloadFile === 'function') {
    downloadFile(patchedFile, pluginOriginalFileName, 'application/octet-stream');
  }
}

/**
 * Export individual plugin pictures as raw format files.
 */
function saveRawWithPlugin() {
  if (!activePluginId) {
    alert('No active plugin session.');
    return;
  }

  // Ensure the currently active picture's state is saved to openPictures[]
  if (typeof saveCurrentPictureState === 'function') {
    saveCurrentPictureState();
  }

  const baseName = pluginOriginalFileName.replace(/\.[^.]+$/, '');

  for (const [picId, entry] of pluginPictureMap) {
    const picState = openPictures.find(function (p) { return p.id === picId; });
    if (!picState || !picState.screenData || picState.screenData.length === 0) continue;

    const fileName = baseName + '_' + entry.name.replace(/[^a-zA-Z0-9_-]/g, '_') +
      '.' + entry.format;
    if (typeof downloadFile === 'function') {
      downloadFile(picState.screenData, fileName, 'application/octet-stream');
    }
  }
}

// ============================================================================
// Export — compress/encode the current picture via a plugin's patch()
// ============================================================================

/**
 * Export the currently active picture through a plugin's patch function.
 * Works independently of plugin sessions — any open picture can be exported.
 * @param {string} pluginId
 */
function exportWithPlugin(pluginId) {
  const desc = pluginRegistry[pluginId];
  if (!desc || desc.type !== 'js') {
    alert('Export requires a JS plugin with a patch() function.');
    return;
  }

  // Ensure the active picture state is up-to-date
  if (typeof saveCurrentPictureState === 'function') {
    saveCurrentPictureState();
  }

  // Get the current picture's data
  if (typeof activePictureIndex === 'undefined' || activePictureIndex < 0 ||
      typeof openPictures === 'undefined' || !openPictures.length) {
    alert('No picture is open.');
    return;
  }
  const picState = openPictures[activePictureIndex];
  if (!picState || !picState.screenData || picState.screenData.length === 0) {
    alert('Current picture has no data.');
    return;
  }

  let jsPlugin;
  try {
    jsPlugin = loadJsPlugin(desc);
  } catch (e) {
    alert('Plugin load error: ' + e.message);
    return;
  }
  if (typeof jsPlugin.patch !== 'function') {
    alert('This plugin does not support export (no patch function).');
    return;
  }

  try {
    const pictures = [{
      name: picState.fileName,
      format: picState.format,
      data: picState.screenData
    }];
    const result = jsPlugin.patch(new Uint8Array(0), pictures, null);
    if (result === null || result === undefined) {
      // Plugin handled its own output (e.g. custom dialog + download)
      return;
    }
    if (!(result instanceof Uint8Array) || result.length === 0) {
      alert('Plugin returned no data.');
      return;
    }

    // Derive file name from current picture name
    const baseName = picState.fileName.replace(/\.[^.]+$/, '');
    const exts = desc.fileExtensions || [];
    const ext = exts.length > 0 ? exts[0] : '.bin';
    const fileName = baseName + ext;

    if (typeof downloadFile === 'function') {
      downloadFile(result, fileName, 'application/octet-stream');
    }
  } catch (e) {
    alert('Plugin export error: ' + e.message);
  }
}

// ============================================================================
// Session management
// ============================================================================

/** Close the active plugin session and clean up state. */
function closePluginSession() {
  activePluginId = null;
  pluginOriginalFileBytes = null;
  pluginOriginalFileName = '';
  pluginPictureMap.clear();
  updatePluginUI();
}

// ============================================================================
// UI
// ============================================================================

/** Initialize plugin UI — wire DOM events, restore plugin list on startup. */
function initPluginUI() {
  loadPluginsFromStorage();

  const loadBtn = document.getElementById('pluginLoadBtn');
  const fileInput = document.getElementById('pluginFileInput');
  if (loadBtn && fileInput) {
    loadBtn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      const files = /** @type {HTMLInputElement} */ (fileInput).files;
      if (files && files.length > 0) {
        loadPluginDescriptorFile(files[0]);
        /** @type {HTMLInputElement} */ (fileInput).value = '';
      }
    });
  }

  // Session bar buttons
  const replaceBtn = document.getElementById('pluginReplaceBtn');
  if (replaceBtn) {
    replaceBtn.addEventListener('click', replacePictureFromFile);
  }

  const saveBtn = document.getElementById('pluginSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveWithPlugin);
  }

  const saveRawBtn = document.getElementById('pluginSaveRawBtn');
  if (saveRawBtn) {
    saveRawBtn.addEventListener('click', saveRawWithPlugin);
  }

  const closeBtn = document.getElementById('pluginCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePluginSession);
  }

  updatePluginUI();
}

/** Refresh plugin list and session bar UI. */
function updatePluginUI() {
  // Update plugin list in Tools tab
  const listEl = document.getElementById('pluginList');
  if (listEl) {
    const plugins = Object.values(pluginRegistry);
    if (plugins.length === 0) {
      listEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);padding:4px 0;">No plugins loaded</div>';
    } else {
      let html = '';
      for (const desc of plugins) {
        html += '<div class="plugin-row" style="display:flex;align-items:center;gap:4px;padding:3px 0;font-size:11px;">';
        html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' +
          escapeHtmlAttr(desc.description || desc.name) + '">' + escapeHtml(desc.name) + '</span>';
        html += '<button class="plugin-open-btn" data-plugin-id="' + escapeHtmlAttr(desc.id) +
          '" style="font-size:10px;padding:1px 6px;" title="Open file with this plugin">Open\u2026</button>';
        if (desc.type === 'js' && !desc.session) {
          html += '<button class="plugin-export-btn" data-plugin-id="' + escapeHtmlAttr(desc.id) +
            '" style="font-size:10px;padding:1px 6px;" title="Export current picture with this plugin">Export</button>';
        }
        html += '<button class="plugin-remove-btn" data-plugin-id="' + escapeHtmlAttr(desc.id) +
          '" style="font-size:10px;padding:1px 4px;color:var(--text-secondary);" title="Remove plugin">\u00D7</button>';
        html += '</div>';
      }
      listEl.innerHTML = html;

      // Wire open buttons — each triggers a file picker
      const openBtns = listEl.querySelectorAll('.plugin-open-btn');
      openBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const pid = btn.getAttribute('data-plugin-id');
          if (!pid) return;
          const desc = pluginRegistry[pid];
          if (!desc) return;

          // Create a temporary file input with plugin's accepted extensions
          const tmpInput = document.createElement('input');
          tmpInput.type = 'file';
          const exts = (desc.fileExtensions || []).join(',');
          if (exts) tmpInput.accept = exts;
          tmpInput.addEventListener('change', function () {
            if (tmpInput.files && tmpInput.files.length > 0) {
              openFileWithPlugin(tmpInput.files[0], pid);
            }
          });
          tmpInput.click();
        });
      });

      // Wire export buttons
      const exportBtns = listEl.querySelectorAll('.plugin-export-btn');
      exportBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const pid = btn.getAttribute('data-plugin-id');
          if (pid) exportWithPlugin(pid);
        });
      });

      // Wire remove buttons
      const removeBtns = listEl.querySelectorAll('.plugin-remove-btn');
      removeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const pid = btn.getAttribute('data-plugin-id');
          if (!pid) return;
          const desc = pluginRegistry[pid];
          const name = desc ? desc.name : pid;
          if (confirm('Remove plugin "' + name + '"?')) {
            removePlugin(pid);
          }
        });
      });
    }
  }

  // Update session bar
  const sessionBar = document.getElementById('pluginSessionBar');
  if (sessionBar) {
    if (activePluginId && pluginRegistry[activePluginId]) {
      sessionBar.style.display = 'flex';
      const nameEl = document.getElementById('pluginSessionName');
      if (nameEl) {
        nameEl.textContent = pluginOriginalFileName;
      }
      // Disable save button for .z80 files with z80addr pictures (can't write back)
      const saveBtn = document.getElementById('pluginSaveBtn');
      if (saveBtn) {
        const ext = pluginOriginalFileName.toLowerCase().split('.').pop();
        const hasZ80Addr = pluginRegistry[activePluginId].type !== 'js' &&
          (pluginRegistry[activePluginId].pictures || []).some(function (p) {
            return p.source && p.source.addressMode === 'z80addr';
          });
        const canSave = ext !== 'z80' || !hasZ80Addr;
        /** @type {HTMLButtonElement} */ (saveBtn).disabled = !canSave;
        saveBtn.title = canSave ? 'Save patched file' :
          'Save-back not supported for .z80 files with z80addr (decompression)';
      }
    } else {
      sessionBar.style.display = 'none';
    }
  }
}

/**
 * Escape HTML special characters.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape HTML attribute value.
 * @param {string} s
 * @returns {string}
 */
function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
