// SCA Editor v1.39.0 - Animation trimming, optimization, frame deletion, payload type 1, GIF/PNG export
// @ts-check
"use strict";

// ============================================================================
// SCA Editor State
// ============================================================================

/** @type {boolean} */
let editModeActive = false;

/** @type {number} */
let editTrimStart = 0;

/** @type {number} */
let editTrimEnd = 0;

/** @type {number} */
let editCurrentFrame = 0;

/** @type {boolean} */
let editPlaying = false;

/** @type {number|null} */
let editTimerId = null;

/** @type {boolean} */
let editPreviewTrimmedOnly = true;

/** @type {number} */
let editZoom = 2;

/** @type {Uint8Array|null} */
let editDelays = null;

/** @type {boolean} */
let delaysModified = false;

/** @type {Set<number>} */
let optimizedOutFrames = new Set();

/** @type {Set<number>} */
let manuallyDeletedFrames = new Set();

/** @type {boolean} */
let framesOptimized = false;

// ============================================================================
// DOM Elements
// ============================================================================

/** @type {HTMLElement|null} */
let editModeOverlay = null;

/** @type {HTMLElement|null} */
let filmstrip = null;

/** @type {HTMLCanvasElement|null} */
let editPreviewCanvas = null;

/** @type {HTMLElement|null} */
let editPreviewInfo = null;

/** @type {HTMLInputElement|null} */
let trimStartValue = null;

/** @type {HTMLInputElement|null} */
let trimEndValue = null;

/** @type {HTMLElement|null} */
let editOriginalCount = null;

/** @type {HTMLElement|null} */
let editTrimmedCount = null;

/** @type {HTMLElement|null} */
let editOriginalSize = null;

/** @type {HTMLElement|null} */
let editTrimmedSize = null;

/** @type {HTMLElement|null} */
let editOriginalDuration = null;

/** @type {HTMLElement|null} */
let editTrimmedDuration = null;

/** @type {HTMLElement|null} */
let editDuplicateCount = null;

/** @type {HTMLElement|null} */
let duplicateFramesRow = null;

/** @type {HTMLElement|null} */
let editFileName = null;

/** @type {HTMLButtonElement|null} */
let editPlayBtn = null;

/** @type {HTMLInputElement|null} */
let delayValueInput = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the SCA Editor
 */
function initScaEditor() {
  // Cache DOM elements
  editModeOverlay = document.getElementById('editModeOverlay');
  filmstrip = document.getElementById('filmstrip');
  editPreviewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editPreviewCanvas'));
  editPreviewInfo = document.getElementById('editPreviewInfo');
  trimStartValue = /** @type {HTMLInputElement} */ (document.getElementById('trimStartValue'));
  trimEndValue = /** @type {HTMLInputElement} */ (document.getElementById('trimEndValue'));
  editOriginalCount = document.getElementById('editOriginalCount');
  editTrimmedCount = document.getElementById('editTrimmedCount');
  editOriginalSize = document.getElementById('editOriginalSize');
  editTrimmedSize = document.getElementById('editTrimmedSize');
  editOriginalDuration = document.getElementById('editOriginalDuration');
  editTrimmedDuration = document.getElementById('editTrimmedDuration');
  editDuplicateCount = document.getElementById('editDuplicateCount');
  duplicateFramesRow = document.getElementById('duplicateFramesRow');
  editFileName = document.getElementById('editFileName');
  editPlayBtn = /** @type {HTMLButtonElement} */ (document.getElementById('editPlayBtn'));
  delayValueInput = /** @type {HTMLInputElement} */ (document.getElementById('delayValue'));

  // Event listeners
  document.getElementById('scaEditBtn')?.addEventListener('click', enterEditMode);
  document.getElementById('editBackBtn')?.addEventListener('click', exitEditMode);
  document.getElementById('editSaveBtn')?.addEventListener('click', handleScaSave);

  document.getElementById('trimStartDec')?.addEventListener('click', () => adjustTrim('start', -1));
  document.getElementById('trimStartInc')?.addEventListener('click', () => adjustTrim('start', 1));
  document.getElementById('trimEndDec')?.addEventListener('click', () => adjustTrim('end', -1));
  document.getElementById('trimEndInc')?.addEventListener('click', () => adjustTrim('end', 1));

  document.getElementById('editToStartBtn')?.addEventListener('click', editToStart);
  document.getElementById('editPrevBtn')?.addEventListener('click', editPrevFrame);
  document.getElementById('editPlayBtn')?.addEventListener('click', toggleEditPlayback);
  document.getElementById('editNextBtn')?.addEventListener('click', editNextFrame);
  document.getElementById('editToEndBtn')?.addEventListener('click', editToEnd);

  // Zoom dropdown
  const editZoomSelect = /** @type {HTMLSelectElement} */ (document.getElementById('editZoomSelect'));
  editZoomSelect?.addEventListener('change', function() {
    setEditZoom(parseInt(this.value, 10));
  });

  // Delay controls
  document.getElementById('delayDec')?.addEventListener('click', () => adjustDelayInput(-1));
  document.getElementById('delayInc')?.addEventListener('click', () => adjustDelayInput(1));
  document.getElementById('delayApplyCurrent')?.addEventListener('click', () => applyDelay(false));
  document.getElementById('delayApplyAll')?.addEventListener('click', () => applyDelay(true));

  // Optimize controls
  document.getElementById('optimizeFramesBtn')?.addEventListener('click', optimizeDuplicateFrames);
  document.getElementById('resetOptimizeBtn')?.addEventListener('click', resetOptimization);
  document.getElementById('removeLoopFrameCheckbox')?.addEventListener('change', (e) => {
    toggleLoopFrame(/** @type {HTMLInputElement} */ (e.target).checked);
  });

  delayValueInput?.addEventListener('change', () => {
    // Clamp value to valid range (1-255)
    if (delayValueInput) {
      let val = parseInt(delayValueInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 255) val = 255;
      delayValueInput.value = String(val);
    }
  });

  // Preview mode radio buttons
  document.querySelectorAll('input[name="previewMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      editPreviewTrimmedOnly = /** @type {HTMLInputElement} */ (e.target).value === 'trimmed';
      // Reset to valid frame when switching modes
      if (editPreviewTrimmedOnly && isFrameMarked(editCurrentFrame)) {
        editCurrentFrame = editTrimStart;
      }
      updateEditPreview();
      updateFilmstripSelection();
      // Save setting
      if (typeof saveSettings === 'function') {
        saveSettings();
      }
    });
  });

  // SCA Save dialog event listeners
  document.getElementById('scaSavePayloadType')?.addEventListener('change', updateScaSaveDialog);
  document.getElementById('scaSaveRegion')?.addEventListener('change', updateScaSaveDialog);
  document.getElementById('scaSaveFct')?.addEventListener('change', updateScaSaveDialog);
  document.getElementById('scaSaveCompression')?.addEventListener('change', updateScaSaveDialog);
  document.getElementById('scaSavePattern')?.addEventListener('change', updateScaSaveDialog);
  document.getElementById('scaSaveCancelBtn')?.addEventListener('click', () => {
    const dlg = document.getElementById('scaSaveDialog');
    if (dlg) dlg.style.display = 'none';
  });
  document.getElementById('scaSaveOkBtn')?.addEventListener('click', executeScaSave);

  // Load saved preview mode setting
  // @ts-ignore
  if (typeof window.savedEditPreviewTrimmedOnly !== 'undefined') {
    // @ts-ignore
    editPreviewTrimmedOnly = window.savedEditPreviewTrimmedOnly;
  }

  // Load saved zoom setting
  // @ts-ignore
  if (typeof window.savedEditZoom !== 'undefined') {
    // @ts-ignore
    editZoom = window.savedEditZoom;
  }

  // Keyboard shortcuts for edit mode
  document.addEventListener('keydown', function(event) {
    // Only handle when edit mode is active
    if (!editModeActive) return;

    // Ignore if typing in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        editPrevFrame();
        break;

      case 'ArrowRight':
        event.preventDefault();
        editNextFrame();
        break;

      case ' ':
        event.preventDefault();
        toggleEditPlayback();
        break;

      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        toggleFrameDeletion(editCurrentFrame);
        break;
    }
  });
}

// ============================================================================
// Edit Mode Control
// ============================================================================

/**
 * Enters the SCA Edit Mode
 */
function enterEditMode() {
  if (!scaHeader || currentFormat !== FORMAT.SCA) return;

  // Stop any running animation in viewer
  stopScaAnimation();

  // Reset edit state
  editTrimStart = 0;
  editTrimEnd = 0;
  editCurrentFrame = 0;
  editPlaying = false;

  // Copy delays array for editing
  editDelays = new Uint8Array(scaHeader.delays);
  delaysModified = false;

  // Reset optimization state
  optimizedOutFrames.clear();
  framesOptimized = false;

  // Reset manual deletions
  manuallyDeletedFrames.clear();

  // Use saved preview mode setting or default to trimmed
  // @ts-ignore
  if (typeof window.savedEditPreviewTrimmedOnly !== 'undefined') {
    // @ts-ignore
    editPreviewTrimmedOnly = window.savedEditPreviewTrimmedOnly;
  }

  // Use saved zoom setting or default to 2
  // @ts-ignore
  if (typeof window.savedEditZoom !== 'undefined') {
    // @ts-ignore
    editZoom = window.savedEditZoom;
  }

  // Set radio buttons to match current setting
  const radioValue = editPreviewTrimmedOnly ? 'trimmed' : 'all';
  const radio = /** @type {HTMLInputElement} */ (document.querySelector(`input[name="previewMode"][value="${radioValue}"]`));
  if (radio) radio.checked = true;

  // Update filename display
  if (editFileName) {
    editFileName.textContent = currentFileName || 'animation.sca';
  }

  // Generate filmstrip
  generateFilmstrip();

  // Update UI
  updateTrimControls();
  updateDuplicateInfo();
  updateZoomSelect();
  updateEditPreview();

  // Show overlay
  editModeActive = true;
  if (editModeOverlay) {
    editModeOverlay.classList.add('active');
  }
}

/**
 * Exits the SCA Edit Mode
 */
function exitEditMode() {
  // Stop any running playback
  stopEditPlayback();

  // Hide overlay
  editModeActive = false;
  if (editModeOverlay) {
    editModeOverlay.classList.remove('active');
  }
}

// ============================================================================
// Filmstrip
// ============================================================================

/**
 * Generates the filmstrip with frame thumbnails
 */
function generateFilmstrip() {
  if (!filmstrip || !scaHeader) return;

  filmstrip.innerHTML = '';

  const thumbWidth = 80;
  const thumbHeight = Math.round(thumbWidth * (SCREEN.HEIGHT / SCREEN.WIDTH));

  for (let i = 0; i < scaHeader.frameCount; i++) {
    const frameDiv = document.createElement('div');
    frameDiv.className = 'filmstrip-frame';
    frameDiv.dataset.frameIndex = String(i);

    // Create thumbnail canvas
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN.WIDTH;
    canvas.height = SCREEN.HEIGHT;
    renderScaFrameToCanvas(canvas, i);

    // Frame number label
    const label = document.createElement('div');
    label.className = 'filmstrip-frame-number';
    label.textContent = String(i + 1);

    frameDiv.appendChild(canvas);
    frameDiv.appendChild(label);

    // Click handler - Ctrl+click to toggle deletion, normal click to select
    frameDiv.addEventListener('click', (e) => {
      if (e.ctrlKey) {
        toggleFrameDeletion(i);
      } else {
        selectEditFrame(i);
      }
    });

    filmstrip.appendChild(frameDiv);
  }

  updateFilmstripMarkers();
  updateFilmstripSelection();
}

/**
 * Renders a specific SCA frame to a canvas
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} frameIndex - Frame index
 */
function renderScaFrameToCanvas(canvas, frameIndex) {
  if (!scaHeader) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const frameOffset = (typeof getScaFrameOffset === 'function')
    ? getScaFrameOffset(frameIndex)
    : scaHeader.frameDataStart + (frameIndex * scaHeader.frameSize);
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  if (scaHeader.payloadType === 2 && scaHeader.region && scaHeader.frames) {
    // Payload type 2: packed frames with FCT + region
    renderScaType2FrameToCanvas(data, frameOffset, scaHeader);
  } else if (scaHeader.payloadType === 1 && scaHeader.fillPattern) {
    // Payload type 1: attribute-only frames with fill pattern
    const fillPattern = (typeof getSelectedPattern === 'function')
      ? getSelectedPattern(scaHeader.fillPattern)
      : scaHeader.fillPattern;

    for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const attrOffset = frameOffset + col + row * 32;
        const attr = screenData[attrOffset];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        // Draw 8x8 cell using fill pattern
        const cellX = col * 8;
        const cellY = row * 8;

        for (let py = 0; py < 8; py++) {
          const patternByte = fillPattern[py];
          for (let px = 0; px < 8; px++) {
            const bit = 7 - px; // MSB first
            const isInk = (patternByte & (1 << bit)) !== 0;
            const rgb = isInk ? inkRgb : paperRgb;

            const pixelIndex = ((cellY + py) * SCREEN.WIDTH + cellX + px) * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  } else {
    // Payload type 0: full screen frames
    // Process all three screen thirds
    const sections = [
      { bitmapAddr: 0, attrAddr: 6144, yOffset: 0 },
      { bitmapAddr: 2048, attrAddr: 6400, yOffset: 64 },
      { bitmapAddr: 4096, attrAddr: 6656, yOffset: 128 }
    ];

    for (const section of sections) {
      const { bitmapAddr, attrAddr, yOffset } = section;

      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
            const bitmapOffset = frameOffset + bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const attrOffset = frameOffset + attrAddr + col + row * 32;
            const attr = screenData[attrOffset];
            const { inkRgb, paperRgb } = getColorsRgb(attr);

            const x = col * 8;
            const y = yOffset + row * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const rgb = isBitSet(byte, bit) ? inkRgb : paperRgb;
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
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Renders a type 2 SCA frame into imageData pixel array (editor/filmstrip version).
 * @param {Uint8ClampedArray} data - ImageData pixel array
 * @param {number} frameOffset - Byte offset in screenData
 * @param {object} header - Parsed SCA header
 */
function renderScaType2FrameToCanvas(data, frameOffset, header) {
  const fct = header.fct;
  const region = header.region;
  const startRow = region.startRow;
  const charRows = region.charRows;
  const hasBitmap = (fct === 0 || fct === 1);
  const hasAttrs = (fct === 1 || fct === 2);

  let bitmapOffset = frameOffset;
  let attrOffset = frameOffset + (hasBitmap ? region.bitmapSize : 0);

  if (hasBitmap) {
    // Bitmap region — ZX Spectrum screen memory layout, scoped to region
    const numSections = charRows / 8;
    for (let s = 0; s < numSections; s++) {
      const sectionStartRow = startRow + s * 8;
      const sectionBitmapBase = bitmapOffset + s * 2048;
      const sectionAttrBase = hasAttrs ? (attrOffset + s * 256) : 0;

      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
            const bmpOff = sectionBitmapBase + col + row * 32 + line * 256;
            const byte = screenData[bmpOff];

            let inkRgb, paperRgb;
            if (hasAttrs) {
              const attr = screenData[sectionAttrBase + col + row * 32];
              ({ inkRgb, paperRgb } = getColorsRgb(attr));
            } else {
              inkRgb = [0, 0, 0];
              paperRgb = [255, 255, 255];
            }

            const x = col * 8;
            const y = (sectionStartRow + row) * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const rgb = isBitSet(byte, bit) ? inkRgb : paperRgb;
              const pixelIndex = (y * SCREEN.WIDTH + x + bit) * 4;
              data[pixelIndex] = rgb[0];
              data[pixelIndex + 1] = rgb[1];
              data[pixelIndex + 2] = rgb[2];
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else if (fct === 2 && header.fillPattern) {
    // Attrs-only with fill pattern, scoped to region
    const fillPattern = (typeof getSelectedPattern === 'function')
      ? getSelectedPattern(header.fillPattern)
      : header.fillPattern;

    for (let r = 0; r < charRows; r++) {
      const row = startRow + r;
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const attr = screenData[attrOffset + col + r * 32];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        const cellX = col * 8;
        const cellY = row * 8;

        for (let py = 0; py < 8; py++) {
          const patternByte = fillPattern[py];
          for (let px = 0; px < 8; px++) {
            const bit = 7 - px;
            const isInk = (patternByte & (1 << bit)) !== 0;
            const rgb = isInk ? inkRgb : paperRgb;
            const pixelIndex = ((cellY + py) * SCREEN.WIDTH + cellX + px) * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  }
}

/**
 * Updates filmstrip markers for trimmed, optimized, and manually deleted frames
 */
function updateFilmstripMarkers() {
  if (!filmstrip || !scaHeader) return;

  const frames = filmstrip.querySelectorAll('.filmstrip-frame');
  frames.forEach((frame, index) => {
    const isTrimmed = index < editTrimStart || index >= scaHeader.frameCount - editTrimEnd;
    const isOptimized = optimizedOutFrames.has(index);
    const isManuallyDeleted = manuallyDeletedFrames.has(index);

    frame.classList.toggle('marked-delete', isTrimmed || isManuallyDeleted);
    frame.classList.toggle('marked-optimized', isOptimized && !isTrimmed && !isManuallyDeleted);

    if (isTrimmed) {
      frame.title = 'Trimmed — excluded from saved file';
    } else if (isManuallyDeleted) {
      frame.title = 'Marked for deletion (Ctrl+Click or Delete to restore) — excluded from saved file';
    } else if (isOptimized) {
      frame.title = 'Duplicate — excluded from saved file';
    } else {
      frame.title = '';
    }
  });
}

/**
 * Updates filmstrip selection highlight
 */
function updateFilmstripSelection() {
  if (!filmstrip) return;

  const frames = filmstrip.querySelectorAll('.filmstrip-frame');
  frames.forEach((frame, index) => {
    if (index === editCurrentFrame) {
      frame.classList.add('selected');
      // Scroll filmstrip container only (not the whole page)
      const fl = frame.offsetLeft;
      const fw = frame.offsetWidth;
      const sl = filmstrip.scrollLeft;
      const sw = filmstrip.clientWidth;
      if (fl < sl || fl + fw > sl + sw) {
        filmstrip.scrollLeft = fl - (sw - fw) / 2;
      }
    } else {
      frame.classList.remove('selected');
    }
  });
}

// ============================================================================
// Frame Selection and Navigation
// ============================================================================

/**
 * Checks if a frame is marked for deletion (by trim, optimization, or manual)
 * @param {number} frameIndex - Frame index
 * @returns {boolean}
 */
function isFrameMarked(frameIndex) {
  if (!scaHeader) return false;
  if (frameIndex < editTrimStart || frameIndex >= scaHeader.frameCount - editTrimEnd) {
    return true;
  }
  return optimizedOutFrames.has(frameIndex) || manuallyDeletedFrames.has(frameIndex);
}

/**
 * Gets the total count of remaining frames (after trim, optimization, and manual deletion)
 * @returns {number}
 */
function getTrimmedFrameCount() {
  if (!scaHeader) return 0;
  const afterTrim = scaHeader.frameCount - editTrimStart - editTrimEnd;
  // Subtract optimized and manually deleted frames that are within the trim range
  let removedInRange = 0;
  for (const idx of optimizedOutFrames) {
    if (idx >= editTrimStart && idx < scaHeader.frameCount - editTrimEnd) {
      removedInRange++;
    }
  }
  for (const idx of manuallyDeletedFrames) {
    if (idx >= editTrimStart && idx < scaHeader.frameCount - editTrimEnd) {
      removedInRange++;
    }
  }
  return Math.max(0, afterTrim - removedInRange);
}

/**
 * Compares two frames for equality
 * @param {number} frameIndex1 - First frame index
 * @param {number} frameIndex2 - Second frame index
 * @returns {boolean} True if frames are identical
 */
function compareFrames(frameIndex1, frameIndex2) {
  if (!scaHeader || !screenData) return false;

  const frameSize = scaHeader.frameSize;
  const offset1 = scaHeader.frameDataStart + (frameIndex1 * frameSize);
  const offset2 = scaHeader.frameDataStart + (frameIndex2 * frameSize);

  for (let i = 0; i < frameSize; i++) {
    if (screenData[offset1 + i] !== screenData[offset2 + i]) {
      return false;
    }
  }
  return true;
}

/**
 * Counts consecutive duplicate frames without modifying anything
 * @returns {number} Number of duplicate frames that can be removed
 */
function countDuplicateFrames() {
  if (!scaHeader || !screenData) return 0;

  let count = 0;
  let i = 0;

  while (i < scaHeader.frameCount - 1) {
    let j = i + 1;
    while (j < scaHeader.frameCount && compareFrames(i, j)) {
      count++;
      j++;
    }
    i = j;
  }

  return count;
}

/**
 * Checks if first and last frames are identical (loop frame)
 * @returns {boolean}
 */
function hasLoopFrame() {
  if (!scaHeader || scaHeader.frameCount < 2) return false;
  const firstFrame = editTrimStart;
  const lastFrame = scaHeader.frameCount - editTrimEnd - 1;
  if (firstFrame >= lastFrame) return false;
  // Don't count if last frame is already optimized out
  if (optimizedOutFrames.has(lastFrame)) return false;
  return compareFrames(firstFrame, lastFrame);
}

/**
 * Toggles removal of the loop frame (last frame matching first)
 * @param {boolean} remove - Whether to remove or restore
 */
function toggleLoopFrame(remove) {
  if (!scaHeader || !editDelays) return;

  const firstFrame = editTrimStart;
  const lastFrame = scaHeader.frameCount - editTrimEnd - 1;

  if (remove) {
    // Mark last frame for removal, add its delay to first frame
    if (!optimizedOutFrames.has(lastFrame) && compareFrames(firstFrame, lastFrame)) {
      optimizedOutFrames.add(lastFrame);
      const newDelay = Math.min(255, editDelays[firstFrame] + editDelays[lastFrame]);
      editDelays[firstFrame] = newDelay;
      framesOptimized = true;
      delaysModified = true;
    }
  } else {
    // Restore last frame if it was removed as loop frame
    if (optimizedOutFrames.has(lastFrame)) {
      // Restore original delays
      if (scaHeader.delays) {
        editDelays[firstFrame] = scaHeader.delays[firstFrame];
        editDelays[lastFrame] = scaHeader.delays[lastFrame];
      }
      optimizedOutFrames.delete(lastFrame);
      if (optimizedOutFrames.size === 0) {
        framesOptimized = false;
      }
    }
  }

  updateTrimControls();
  updateDuplicateInfo();
  updateFilmstripMarkers();
  updateEditPreview();
}

/**
 * Updates the duplicate frames display
 */
function updateDuplicateInfo() {
  const removedCount = optimizedOutFrames.size;
  const potentialCount = countDuplicateFrames();

  if (editDuplicateCount) {
    if (removedCount > 0) {
      editDuplicateCount.textContent = `${removedCount} removed`;
    } else if (potentialCount > 0) {
      editDuplicateCount.textContent = `${potentialCount} found`;
    } else {
      editDuplicateCount.textContent = 'no duplicate frames';
    }
  }

  // Always show the row
  if (duplicateFramesRow) {
    duplicateFramesRow.style.display = '';
  }

  // Show/hide loop frame option
  const loopFrameOption = document.getElementById('loopFrameOption');
  const loopFrameCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('removeLoopFrameCheckbox'));
  if (loopFrameOption && loopFrameCheckbox) {
    const hasLoop = hasLoopFrame();
    const lastFrame = scaHeader ? scaHeader.frameCount - editTrimEnd - 1 : -1;
    const isLoopFrameRemoved = optimizedOutFrames.has(lastFrame);

    // Show option if loop frame exists or was already removed
    loopFrameOption.style.display = (hasLoop || isLoopFrameRemoved) ? '' : 'none';
    loopFrameCheckbox.checked = isLoopFrameRemoved;
  }
}

/**
 * Toggles manual deletion of a frame
 * @param {number} frameIndex - Frame index to toggle
 */
function toggleFrameDeletion(frameIndex) {
  if (!scaHeader) return;

  // Don't allow toggling trimmed frames
  if (frameIndex < editTrimStart || frameIndex >= scaHeader.frameCount - editTrimEnd) {
    return;
  }

  // Don't allow toggling optimized frames (use reset instead)
  if (optimizedOutFrames.has(frameIndex)) {
    return;
  }

  // Toggle manual deletion
  if (manuallyDeletedFrames.has(frameIndex)) {
    manuallyDeletedFrames.delete(frameIndex);
  } else {
    // Ensure at least one frame remains
    if (getTrimmedFrameCount() <= 1) {
      return;
    }
    manuallyDeletedFrames.add(frameIndex);
  }

  // If current frame is now marked, move to next valid frame
  if (isFrameMarked(editCurrentFrame)) {
    const nextValid = findNextValidFrame(editCurrentFrame);
    if (nextValid !== -1) {
      editCurrentFrame = nextValid;
    }
  }

  updateTrimControls();
  updateDuplicateInfo();
  updateFilmstripMarkers();
  updateEditPreview();
  updateFilmstripSelection();
}

/**
 * Finds next valid (unmarked) frame from given index, with wrap-around
 * @param {number} fromIndex - Starting frame index
 * @returns {number} Next valid frame index or -1 if none
 */
function findNextValidFrame(fromIndex) {
  if (!scaHeader) return -1;

  // Search forward with wrap-around
  for (let i = 1; i < scaHeader.frameCount; i++) {
    const idx = (fromIndex + i) % scaHeader.frameCount;
    if (!isFrameMarked(idx)) {
      return idx;
    }
  }
  return -1;
}

/**
 * Finds previous valid (unmarked) frame from given index, with wrap-around
 * @param {number} fromIndex - Starting frame index
 * @returns {number} Previous valid frame index or -1 if none
 */
function findPrevValidFrame(fromIndex) {
  if (!scaHeader) return -1;

  // Search backward with wrap-around
  for (let i = 1; i < scaHeader.frameCount; i++) {
    const idx = (fromIndex - i + scaHeader.frameCount) % scaHeader.frameCount;
    if (!isFrameMarked(idx)) {
      return idx;
    }
  }
  return -1;
}

/**
 * Optimizes animation by removing consecutive duplicate frames
 * and accumulating their delays
 */
function optimizeDuplicateFrames() {
  if (!scaHeader || !editDelays) return;

  const startFrame = editTrimStart;
  const endFrame = scaHeader.frameCount - editTrimEnd;

  // Clear previous optimization
  optimizedOutFrames.clear();

  let removedCount = 0;
  let i = startFrame;

  while (i < endFrame - 1) {
    // Skip already optimized frames
    if (optimizedOutFrames.has(i)) {
      i++;
      continue;
    }

    // Find consecutive identical frames
    let j = i + 1;
    while (j < endFrame && compareFrames(i, j)) {
      // Mark frame j for removal and add its delay to frame i
      optimizedOutFrames.add(j);
      const addedDelay = editDelays[j];
      const newDelay = Math.min(255, editDelays[i] + addedDelay);
      editDelays[i] = newDelay;
      removedCount++;
      j++;
    }
    i = j;
  }

  if (removedCount > 0) {
    framesOptimized = true;
    delaysModified = true;

    // Update UI
    updateTrimControls();
    updateDuplicateInfo();
    updateFilmstripMarkers();
    updateEditPreview();
    updateFilmstripSelection();

    alert(`Optimization complete: ${removedCount} duplicate frame(s) removed.`);
  } else {
    alert('No consecutive duplicate frames found.');
  }
}

/**
 * Resets frame optimization and manual deletions
 */
function resetOptimization() {
  if (!scaHeader) return;

  optimizedOutFrames.clear();
  framesOptimized = false;
  manuallyDeletedFrames.clear();

  // Restore original delays
  if (scaHeader.delays) {
    editDelays = new Uint8Array(scaHeader.delays);
    delaysModified = false;
  }

  updateTrimControls();
  updateDuplicateInfo();
  updateFilmstripMarkers();
  updateEditPreview();
  updateFilmstripSelection();
}

/**
 * Selects a frame for preview
 * @param {number} frameIndex - Frame index to select
 */
function selectEditFrame(frameIndex) {
  if (!scaHeader) return;

  // In trimmed-only mode, skip marked frames
  if (editPreviewTrimmedOnly && isFrameMarked(frameIndex)) {
    return;
  }

  editCurrentFrame = frameIndex;
  updateEditPreview();
  updateFilmstripSelection();
}

/**
 * Goes to first valid frame
 */
function editToStart() {
  if (!scaHeader) return;

  if (editPreviewTrimmedOnly) {
    // Find first non-marked frame
    for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
      if (!isFrameMarked(i)) {
        selectEditFrame(i);
        return;
      }
    }
  } else {
    selectEditFrame(0);
  }
}

/**
 * Goes to last valid frame
 */
function editToEnd() {
  if (!scaHeader) return;

  if (editPreviewTrimmedOnly) {
    // Find last non-marked frame
    for (let i = scaHeader.frameCount - editTrimEnd - 1; i >= editTrimStart; i--) {
      if (!isFrameMarked(i)) {
        selectEditFrame(i);
        return;
      }
    }
  } else {
    selectEditFrame(scaHeader.frameCount - 1);
  }
}

/**
 * Goes to previous frame with wrap-around
 */
function editPrevFrame() {
  if (!scaHeader) return;

  if (editPreviewTrimmedOnly) {
    const prevValid = findPrevValidFrame(editCurrentFrame);
    if (prevValid !== -1) {
      selectEditFrame(prevValid);
    }
  } else {
    let newFrame = editCurrentFrame - 1;
    if (newFrame < 0) {
      newFrame = scaHeader.frameCount - 1;
    }
    selectEditFrame(newFrame);
  }
}

/**
 * Goes to next frame with wrap-around (first to last)
 */
function editNextFrame() {
  if (!scaHeader) return;

  if (editPreviewTrimmedOnly) {
    const nextValid = findNextValidFrame(editCurrentFrame);
    if (nextValid !== -1) {
      selectEditFrame(nextValid);
    }
  } else {
    let newFrame = editCurrentFrame + 1;
    if (newFrame >= scaHeader.frameCount) {
      newFrame = 0;
    }
    selectEditFrame(newFrame);
  }
}

// ============================================================================
// Trim Controls
// ============================================================================

/**
 * Adjusts trim start or end value
 * @param {'start'|'end'} type - Which trim to adjust
 * @param {number} delta - Amount to adjust (+1 or -1)
 */
function adjustTrim(type, delta) {
  if (!scaHeader) return;

  const isStart = type === 'start';
  const currentValue = isStart ? editTrimStart : editTrimEnd;
  const otherValue = isStart ? editTrimEnd : editTrimStart;
  const newValue = currentValue + delta;
  const maxTrim = scaHeader.frameCount - otherValue - 1; // Keep at least 1 frame

  if (newValue >= 0 && newValue <= maxTrim) {
    if (isStart) {
      editTrimStart = newValue;
    } else {
      editTrimEnd = newValue;
    }

    // If current frame is now marked, move to valid frame
    if (isFrameMarked(editCurrentFrame)) {
      editCurrentFrame = isStart ? editTrimStart : scaHeader.frameCount - editTrimEnd - 1;
    }

    updateTrimControls();
    updateDuplicateInfo();
    updateFilmstripMarkers();
    updateEditPreview();
    updateFilmstripSelection();
  }
}

/**
 * Formats file size in bytes to human readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Formats duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Calculates SCA file size for given frame count
 * @param {number} frameCount - Number of frames
 * @returns {number} File size in bytes
 */
function calculateScaFileSize(frameCount) {
  if (!scaHeader) {
    // Default to type 0 if no header
    return SCA.HEADER_SIZE + frameCount + (frameCount * SCA.FRAME_SIZE);
  }
  if (scaHeader.payloadType === 2 && scaHeader.region) {
    // Type 2: Header + FCT byte + optional fill pattern + per-frame (header + blocks + delay)
    const fct = scaHeader.fct;
    const region = scaHeader.region;
    const hasBitmap = (fct === 0 || fct === 1);
    const hasAttrs = (fct === 1 || fct === 2);
    const blockDataSize = (hasBitmap ? region.bitmapSize : 0) + (hasAttrs ? region.attrSize : 0);
    const fillPatternSize = (fct === 2) ? SCA.FILL_PATTERN_SIZE : 0;
    return SCA.HEADER_SIZE + 1 + fillPatternSize + (frameCount * (1 + blockDataSize + 1));
  }
  if (scaHeader.payloadType === 1) {
    // Type 1: Header + delays + fill pattern (8 bytes) + attributes per frame (768 bytes)
    return SCA.HEADER_SIZE + frameCount + SCA.FILL_PATTERN_SIZE + (frameCount * SCA.ATTR_FRAME_SIZE);
  }
  // Type 0: Header + delays + full frames (6912 bytes)
  return SCA.HEADER_SIZE + frameCount + (frameCount * SCA.FRAME_SIZE);
}

/**
 * Updates the trim control displays
 */
function updateTrimControls() {
  if (!scaHeader) return;

  if (trimStartValue) {
    trimStartValue.value = String(editTrimStart);
  }
  if (trimEndValue) {
    trimEndValue.value = String(editTrimEnd);
  }
  if (editOriginalCount) {
    editOriginalCount.textContent = String(scaHeader.frameCount);
  }
  if (editTrimmedCount) {
    editTrimmedCount.textContent = String(getTrimmedFrameCount());
  }

  // Calculate durations
  let originalDurationMs = 0;
  let trimmedDurationMs = 0;
  for (let i = 0; i < scaHeader.frameCount; i++) {
    const delayMs = getFrameDelay(i) * SCA.DELAY_UNIT_MS;
    originalDurationMs += delayMs;
    if (!isFrameMarked(i)) {
      trimmedDurationMs += delayMs;
    }
  }

  if (editOriginalDuration) {
    editOriginalDuration.textContent = formatDuration(originalDurationMs);
  }
  if (editTrimmedDuration) {
    editTrimmedDuration.textContent = formatDuration(trimmedDurationMs);
  }

  // Update file sizes
  const originalSize = calculateScaFileSize(scaHeader.frameCount);
  const trimmedSize = calculateScaFileSize(getTrimmedFrameCount());

  if (editOriginalSize) {
    editOriginalSize.textContent = formatFileSize(originalSize);
  }
  if (editTrimmedSize) {
    editTrimmedSize.textContent = formatFileSize(trimmedSize);
  }
}

// ============================================================================
// Delay Controls
// ============================================================================

/**
 * Gets the delay for a frame (from edited delays or original)
 * @param {number} frameIndex - Frame index
 * @returns {number} Delay value (1-255)
 */
function getFrameDelay(frameIndex) {
  if (editDelays && frameIndex < editDelays.length) {
    return editDelays[frameIndex];
  }
  if (scaHeader && frameIndex < scaHeader.delays.length) {
    return scaHeader.delays[frameIndex];
  }
  return 1;
}

/**
 * Adjusts the delay input value
 * @param {number} delta - Amount to adjust (+1 or -1)
 */
function adjustDelayInput(delta) {
  if (!delayValueInput) return;

  let val = parseInt(delayValueInput.value, 10);
  if (isNaN(val)) val = 1;

  val += delta;
  if (val < 1) val = 1;
  if (val > 255) val = 255;

  delayValueInput.value = String(val);
}

/**
 * Updates the delay input to show current frame's delay
 */
function updateDelayDisplay() {
  if (!delayValueInput || !scaHeader) return;

  const delay = getFrameDelay(editCurrentFrame);
  delayValueInput.value = String(delay);
}

/**
 * Sets the edit preview zoom level
 * @param {number} newZoom - Zoom level (1, 2, or 3)
 */
function setEditZoom(newZoom) {
  editZoom = newZoom;
  updateZoomSelect();
  updateEditPreview();
  // Save setting
  if (typeof saveSettings === 'function') {
    saveSettings();
  }
}

/**
 * Updates zoom dropdown to match current zoom level
 */
function updateZoomSelect() {
  const editZoomSelect = /** @type {HTMLSelectElement} */ (document.getElementById('editZoomSelect'));
  if (editZoomSelect) {
    editZoomSelect.value = String(editZoom);
  }
}

/**
 * Applies the current delay input value to frames
 * @param {boolean} [toAll=false] - If true, apply to all frames; otherwise only current frame
 */
function applyDelay(toAll = false) {
  if (!editDelays || !delayValueInput || !scaHeader) return;

  let val = parseInt(delayValueInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 255) val = 255;

  if (toAll) {
    for (let i = 0; i < editDelays.length; i++) {
      editDelays[i] = val;
    }
  } else {
    editDelays[editCurrentFrame] = val;
  }
  delaysModified = true;
  updateTrimControls();
  updateEditPreview();
}

// ============================================================================
// Preview
// ============================================================================

/**
 * Updates the edit preview display
 */
function updateEditPreview() {
  if (!editPreviewCanvas || !scaHeader) return;

  // Set canvas size based on zoom
  const zoomedWidth = SCREEN.WIDTH * editZoom;
  const zoomedHeight = SCREEN.HEIGHT * editZoom;
  editPreviewCanvas.width = zoomedWidth;
  editPreviewCanvas.height = zoomedHeight;

  // Create temporary canvas at 1x for rendering
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = SCREEN.WIDTH;
  tempCanvas.height = SCREEN.HEIGHT;
  renderScaFrameToCanvas(tempCanvas, editCurrentFrame);

  // Scale up to preview canvas
  const ctx = editPreviewCanvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, zoomedWidth, zoomedHeight);
  }

  // Update delay display for current frame
  updateDelayDisplay();

  // Update info text
  if (editPreviewInfo) {
    const isMarked = isFrameMarked(editCurrentFrame);
    const delayMs = getFrameDelay(editCurrentFrame) * SCA.DELAY_UNIT_MS;

    editPreviewInfo.textContent = `Frame ${editCurrentFrame + 1} of ${scaHeader.frameCount} - ${delayMs}ms`;
    if (isMarked) {
      editPreviewInfo.style.color = '#ff6666';
    } else {
      editPreviewInfo.style.color = '';
    }
  }
}

// ============================================================================
// Playback
// ============================================================================

/**
 * Toggles edit mode playback
 */
function toggleEditPlayback() {
  if (editPlaying) {
    stopEditPlayback();
  } else {
    startEditPlayback();
  }
}

/**
 * Starts edit mode playback
 */
function startEditPlayback() {
  if (!scaHeader || editPlaying) return;

  editPlaying = true;
  if (editPlayBtn) {
    editPlayBtn.textContent = '⏸';
  }
  scheduleNextEditFrame();
}

/**
 * Stops edit mode playback
 */
function stopEditPlayback() {
  editPlaying = false;
  if (editTimerId !== null) {
    clearTimeout(editTimerId);
    editTimerId = null;
  }
  if (editPlayBtn) {
    editPlayBtn.textContent = '▶';
  }
}

/**
 * Schedules the next frame in edit playback
 */
function scheduleNextEditFrame() {
  if (!scaHeader || !editPlaying) return;

  const delay = getFrameDelay(editCurrentFrame) * SCA.DELAY_UNIT_MS;

  editTimerId = setTimeout(() => {
    // Find next frame
    let nextFrame = editCurrentFrame + 1;

    if (editPreviewTrimmedOnly) {
      // Skip marked frames
      while (nextFrame < scaHeader.frameCount && isFrameMarked(nextFrame)) {
        nextFrame++;
      }
      // Loop back to start - find first valid frame
      if (nextFrame >= scaHeader.frameCount || isFrameMarked(nextFrame)) {
        nextFrame = -1;
        for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
          if (!isFrameMarked(i)) {
            nextFrame = i;
            break;
          }
        }
        if (nextFrame === -1) return; // No valid frames
      }
    } else {
      // Loop back to start
      if (nextFrame >= scaHeader.frameCount) {
        nextFrame = 0;
      }
    }

    selectEditFrame(nextFrame);

    if (editPlaying) {
      scheduleNextEditFrame();
    }
  }, delay || SCA.DELAY_UNIT_MS);
}

// ============================================================================
// Save
// ============================================================================

/**
 * Saves the trimmed SCA file
 */
/**
 * Builds trimmed SCA data from current editor state
 * @returns {{ data: Uint8Array, trimmedCount: number } | null}
 */
function buildTrimmedScaData() {
  if (!scaHeader || !screenData) return null;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) return null;

  if (scaHeader.payloadType === 2) {
    return buildTrimmedScaType2Data(trimmedCount);
  }

  const isType1 = scaHeader.payloadType === 1;
  const frameSize = scaHeader.frameSize;

  // Calculate new file size
  let newSize;
  if (isType1) {
    // Type 1: Header + delays + fill pattern (8 bytes) + attributes per frame (768 bytes)
    newSize = SCA.HEADER_SIZE + trimmedCount + SCA.FILL_PATTERN_SIZE + (trimmedCount * SCA.ATTR_FRAME_SIZE);
  } else {
    // Type 0: Header + delays + full frames (6912 bytes)
    newSize = SCA.HEADER_SIZE + trimmedCount + (trimmedCount * SCA.FRAME_SIZE);
  }
  const newData = new Uint8Array(newSize);

  // Copy and modify header
  newData[0] = 0x53; // 'S'
  newData[1] = 0x43; // 'C'
  newData[2] = 0x41; // 'A'
  newData[3] = scaHeader.version;
  newData[4] = scaHeader.width & 0xFF;
  newData[5] = (scaHeader.width >> 8) & 0xFF;
  newData[6] = scaHeader.height & 0xFF;
  newData[7] = (scaHeader.height >> 8) & 0xFF;
  newData[8] = scaHeader.borderColor;
  newData[9] = trimmedCount & 0xFF;
  newData[10] = (trimmedCount >> 8) & 0xFF;
  newData[11] = scaHeader.payloadType; // preserve payload type
  newData[12] = SCA.HEADER_SIZE & 0xFF; // payload offset
  newData[13] = (SCA.HEADER_SIZE >> 8) & 0xFF;

  // Copy delay table for remaining frames (skip optimized and manually deleted)
  let offset = SCA.HEADER_SIZE;
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      newData[offset++] = getFrameDelay(i);
    }
  }

  // For type 1, copy the fill pattern after delays
  if (isType1 && scaHeader.fillPattern) {
    for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) {
      newData[offset++] = scaHeader.fillPattern[i];
    }
  }

  // Copy frame data for remaining frames (skip optimized and manually deleted)
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      const srcOffset = scaHeader.frameDataStart + (i * frameSize);
      for (let j = 0; j < frameSize; j++) {
        newData[offset++] = screenData[srcOffset + j];
      }
    }
  }

  return { data: newData, trimmedCount };
}

/**
 * Builds trimmed SCA type 2 data (packed frames with per-frame headers)
 * @param {number} trimmedCount - Number of frames after trimming
 * @returns {{ data: Uint8Array, trimmedCount: number } | null}
 */
function buildTrimmedScaType2Data(trimmedCount) {
  if (!scaHeader || !scaHeader.frames || !scaHeader.region) return null;

  const fct = scaHeader.fct;
  const region = scaHeader.region;
  const hasBitmap = (fct === 0 || fct === 1);
  const hasAttrs = (fct === 1 || fct === 2);
  const blockDataSize = (hasBitmap ? region.bitmapSize : 0) + (hasAttrs ? region.attrSize : 0);
  // Per frame: 1 header byte + block data + 1 delay byte
  const perFrameSize = 1 + blockDataSize + 1;

  // Calculate new file size
  // Header + FCT byte + optional fill pattern + (perFrameSize * trimmedCount)
  const fctSize = 1;
  const fillPatternSize = (fct === 2) ? SCA.FILL_PATTERN_SIZE : 0;
  const newSize = SCA.HEADER_SIZE + fctSize + fillPatternSize + (perFrameSize * trimmedCount);
  const newData = new Uint8Array(newSize);

  // Write file header
  newData[0] = 0x53; // 'S'
  newData[1] = 0x43; // 'C'
  newData[2] = 0x41; // 'A'
  newData[3] = scaHeader.version;
  newData[4] = scaHeader.width & 0xFF;
  newData[5] = (scaHeader.width >> 8) & 0xFF;
  newData[6] = scaHeader.height & 0xFF;
  newData[7] = (scaHeader.height >> 8) & 0xFF;
  newData[8] = scaHeader.borderColor;
  newData[9] = trimmedCount & 0xFF;
  newData[10] = (trimmedCount >> 8) & 0xFF;
  newData[11] = scaHeader.payloadType;
  newData[12] = SCA.HEADER_SIZE & 0xFF;
  newData[13] = (SCA.HEADER_SIZE >> 8) & 0xFF;

  let offset = SCA.HEADER_SIZE;

  // Write FCT byte
  newData[offset++] = ((scaHeader.fct & 0x0F) << 4) | (scaHeader.regionCode & 0x0F);

  // Write fill pattern if FCT=2
  if (fct === 2 && scaHeader.fillPattern) {
    for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) {
      newData[offset++] = scaHeader.fillPattern[i];
    }
  }

  // Write frames (skip trimmed/deleted)
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (optimizedOutFrames.has(i) || manuallyDeletedFrames.has(i)) continue;

    const frame = scaHeader.frames[i];

    // Frame header byte: [CCCCC BBB]
    newData[offset++] = (frame.compressionType << 3) | frame.borderColor;

    // Block data (bitmap + attrs)
    const srcOffset = frame.offset;
    for (let j = 0; j < blockDataSize; j++) {
      newData[offset++] = screenData[srcOffset + j];
    }

    // Delay byte
    newData[offset++] = getFrameDelay(i);
  }

  return { data: newData, trimmedCount };
}

function saveTrimmedSca() {
  const result = buildTrimmedScaData();
  if (!result) {
    if (getTrimmedFrameCount() === 0) {
      alert('Cannot save: no frames remaining after trim.');
    }
    return;
  }

  // Generate filename
  const baseName = currentFileName.replace(/\.sca$/i, '');
  const hasTrim = editTrimStart > 0 || editTrimEnd > 0;
  const hasOptimized = optimizedOutFrames.size > 0;
  const hasDeleted = manuallyDeletedFrames.size > 0;
  let suffix = '';
  if (hasOptimized || hasDeleted) {
    suffix = '_edited';
  } else if (hasTrim) {
    suffix = '_trimmed';
  } else if (delaysModified) {
    suffix = '_edited';
  }
  const newFileName = `${baseName}${suffix}.sca`;

  downloadFile(new Blob([result.data], { type: 'application/octet-stream' }), newFileName);
}

/**
 * Exports remaining frames as a series of SCR files in a ZIP
 */
function exportToScrSeries() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot export: no frames remaining.');
    return;
  }

  const baseName = currentFileName.replace(/\.sca$/i, '');
  const isType1 = scaHeader.payloadType === 1;
  const frameSize = scaHeader.frameSize;

  // Determine padding width (3 digits for ≤1000 frames, 4 for more)
  const padWidth = trimmedCount > 1000 ? 4 : 3;

  // Collect files for ZIP
  const files = [];
  let exportIndex = 0;
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      // Create SCR data (6912 bytes)
      const scrData = new Uint8Array(SCA.FRAME_SIZE);

      if (isType1 && scaHeader.fillPattern) {
        // Type 1: generate bitmap from fill pattern, copy attributes
        const srcAttrOffset = scaHeader.frameDataStart + (i * frameSize);

        // Generate bitmap using fill pattern for all character cells
        // ZX Spectrum screen layout: 3 thirds, each with 8 character rows
        for (let third = 0; third < 3; third++) {
          const bitmapBase = third * 2048;
          for (let charRow = 0; charRow < 8; charRow++) {
            for (let line = 0; line < 8; line++) {
              for (let col = 0; col < 32; col++) {
                // ZX Spectrum interleaved address: base + col + charRow*32 + line*256
                const bitmapOffset = bitmapBase + col + charRow * 32 + line * 256;
                // Fill pattern is 8 bytes, one per line within the cell
                scrData[bitmapOffset] = scaHeader.fillPattern[line];
              }
            }
          }
        }

        // Copy attributes (768 bytes at offset 6144)
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) {
          scrData[6144 + j] = screenData[srcAttrOffset + j];
        }
      } else {
        // Type 0: direct copy
        const srcOffset = scaHeader.frameDataStart + (i * frameSize);
        for (let j = 0; j < SCA.FRAME_SIZE; j++) {
          scrData[j] = screenData[srcOffset + j];
        }
      }

      // Generate filename with zero-padded index
      const indexStr = String(exportIndex).padStart(padWidth, '0');
      files.push({ name: `${baseName}_${indexStr}.scr`, data: scrData });
      exportIndex++;
    }
  }

  const zipData = scaCreateZip(files);
  downloadFile(new Blob([zipData], { type: 'application/zip' }), `${baseName}_frames.zip`);
}

/**
 * Exports remaining frames as a series of 53c files in a ZIP
 */
function exportTo53cSeries() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot export: no frames remaining.');
    return;
  }

  const baseName = currentFileName.replace(/\.sca$/i, '');
  const isType1 = scaHeader.payloadType === 1;
  const frameSize = scaHeader.frameSize;

  // Determine padding width (3 digits for ≤1000 frames, 4 for more)
  const padWidth = trimmedCount > 1000 ? 4 : 3;

  // Collect files for ZIP
  const files = [];
  let exportIndex = 0;
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      // Create 53c data (768 bytes - attributes only)
      const attrData = new Uint8Array(SCA.ATTR_FRAME_SIZE);

      if (isType1) {
        // Type 1: frame data is already attributes only
        const srcOffset = scaHeader.frameDataStart + (i * frameSize);
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) {
          attrData[j] = screenData[srcOffset + j];
        }
      } else {
        // Type 0: extract attributes from full frame (offset 6144)
        const srcOffset = scaHeader.frameDataStart + (i * frameSize) + 6144;
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) {
          attrData[j] = screenData[srcOffset + j];
        }
      }

      // Generate filename with zero-padded index
      const indexStr = String(exportIndex).padStart(padWidth, '0');
      files.push({ name: `${baseName}_${indexStr}.53c`, data: attrData });
      exportIndex++;
    }
  }

  const zipData = scaCreateZip(files);
  downloadFile(new Blob([zipData], { type: 'application/zip' }), `${baseName}_attrs.zip`);
}

// ============================================================================
// SCA Save Config Dialog
// ============================================================================

/** Standard fill patterns (8 bytes each, one per pixel line in a char cell) */
const SCA_FILL_PATTERNS = {
  checker: new Uint8Array([0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55]),
  stripes: new Uint8Array([0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00]),
  solid:   new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
};

/**
 * Shows the SCA save configuration dialog
 */
function showScaSaveDialog() {
  if (!scaHeader) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot save: no frames remaining after trim.');
    return;
  }

  const dialog = document.getElementById('scaSaveDialog');
  if (!dialog) return;

  // Set defaults from current file
  const payloadSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSavePayloadType'));
  const regionSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSaveRegion'));
  const fctSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSaveFct'));
  const patternSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSavePattern'));

  if (payloadSel) payloadSel.value = String(scaHeader.payloadType);
  if (regionSel) regionSel.value = String(scaHeader.regionCode || 5);
  if (fctSel) fctSel.value = String(scaHeader.fct || 1);

  // Set pattern default
  if (patternSel) {
    if (scaHeader.fillPattern) {
      // Check if file pattern matches a known preset
      const filePatternMatch = matchFillPattern(scaHeader.fillPattern);
      patternSel.value = filePatternMatch || 'file';
      // Show "From file" option only if file has a pattern
      const fileOption = patternSel.querySelector('option[value="file"]');
      if (fileOption) {
        /** @type {HTMLOptionElement} */ (fileOption).style.display = scaHeader.fillPattern ? '' : 'none';
      }
    } else {
      patternSel.value = 'checker';
      const fileOption = patternSel.querySelector('option[value="file"]');
      if (fileOption) /** @type {HTMLOptionElement} */ (fileOption).style.display = 'none';
    }
  }

  updateScaSaveDialog();
  dialog.style.display = '';
}

/**
 * Matches a fill pattern against known presets
 * @param {Uint8Array} pattern
 * @returns {string|null}
 */
function matchFillPattern(pattern) {
  for (const [name, preset] of Object.entries(SCA_FILL_PATTERNS)) {
    let match = true;
    for (let i = 0; i < 8; i++) {
      if (pattern[i] !== preset[i]) { match = false; break; }
    }
    if (match) return name;
  }
  return null;
}

/**
 * Updates the SCA save dialog state (visibility, warnings, size estimate)
 */
function updateScaSaveDialog() {
  const payloadType = parseInt(/** @type {HTMLSelectElement} */ (document.getElementById('scaSavePayloadType')).value, 10);
  const patternSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSavePattern'));
  const regionSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSaveRegion'));
  const fctSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSaveFct'));

  // Show/hide conditional rows
  const regionRow = document.getElementById('scaSaveRegionRow');
  const fctRow = document.getElementById('scaSaveFctRow');
  const compressionRow = document.getElementById('scaSaveCompressionRow');
  const patternRow = document.getElementById('scaSavePatternRow');

  const isType2 = payloadType === 2;
  const compressionType = parseInt(/** @type {HTMLSelectElement} */ (document.getElementById('scaSaveCompression')).value, 10);
  const isChunks = (compressionType === 4 || compressionType === 5);

  // For chunks compression: force FCT=0 (bitmap only), region is user-selectable
  if (isType2 && isChunks) {
    if (fctSel) { fctSel.value = '0'; fctSel.disabled = true; }
    if (regionSel) regionSel.disabled = false;
  } else {
    if (regionSel) regionSel.disabled = false;
    if (fctSel) fctSel.disabled = false;
  }

  // Read fct and regionCode after potential chunks override
  const regionCode = parseInt(regionSel ? regionSel.value : '5', 10);
  const fct = parseInt(fctSel ? fctSel.value : '1', 10);

  if (regionRow) regionRow.style.display = isType2 ? '' : 'none';
  if (fctRow) fctRow.style.display = isType2 ? '' : 'none';
  if (compressionRow) compressionRow.style.display = isType2 ? '' : 'none';

  // Fill pattern visible for type 1, or type 2 with FCT=2 (attrs only) — not needed for chunks
  const needsPattern = payloadType === 1 || (isType2 && fct === 2 && !isChunks);
  if (patternRow) patternRow.style.display = needsPattern ? '' : 'none';

  // Update warnings
  const warnings = getScaSaveWarnings(payloadType, fct, regionCode);
  const warningDiv = document.getElementById('scaSaveWarning');
  if (warningDiv) {
    if (warnings.length > 0) {
      warningDiv.innerHTML = warnings.map(w => '\u26A0 ' + w).join('<br>');
      warningDiv.style.display = '';
    } else {
      warningDiv.style.display = 'none';
    }
  }

  // Update size estimate
  const trimmedCount = getTrimmedFrameCount();
  const size = calculateTargetScaFileSize(trimmedCount, payloadType, fct, regionCode);
  const sizeSpan = document.getElementById('scaSaveSize');
  if (sizeSpan) {
    if (isType2 && compressionType !== 0) {
      // Compressed size is variable; show uncompressed as upper bound
      const sizeKB = size / 1024;
      sizeSpan.textContent = '\u2264 ' + (sizeKB >= 1024
        ? (sizeKB / 1024).toFixed(1) + ' MB'
        : sizeKB.toFixed(1) + ' KB') + ' (compressed)';
    } else if (size >= 1024 * 1024) {
      sizeSpan.textContent = (size / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
      sizeSpan.textContent = (size / 1024).toFixed(1) + ' KB';
    }
  }

  // Update pattern preview
  updateScaSavePatternPreview();
}

/**
 * Updates the fill pattern preview canvas
 */
function updateScaSavePatternPreview() {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('scaSavePatternPreview'));
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pattern = getSelectedFillPattern();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 16, 16);

  // Draw 2x2 chars (8x8 pixels each, scaled to fit 16x16)
  for (let line = 0; line < 8; line++) {
    const byte = pattern[line];
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (0x80 >> bit)) {
        ctx.fillStyle = '#fff';
      } else {
        ctx.fillStyle = '#000';
      }
      ctx.fillRect(bit * 2, line * 2, 2, 2);
    }
  }
}

/**
 * Gets the currently selected fill pattern bytes
 * @returns {Uint8Array}
 */
function getSelectedFillPattern() {
  const patternSel = /** @type {HTMLSelectElement} */ (document.getElementById('scaSavePattern'));
  const patternName = patternSel ? patternSel.value : 'checker';

  if (patternName === 'file' && scaHeader && scaHeader.fillPattern) {
    return scaHeader.fillPattern;
  }
  return SCA_FILL_PATTERNS[patternName] || SCA_FILL_PATTERNS.checker;
}

/**
 * Gets conversion warnings for the current dialog settings
 * @param {number} targetType
 * @param {number} targetFct
 * @param {number} targetRegionCode
 * @returns {string[]}
 */
function getScaSaveWarnings(targetType, targetFct, targetRegionCode) {
  if (!scaHeader) return [];
  const warnings = [];

  const srcType = scaHeader.payloadType;
  const srcFct = scaHeader.fct || 1;
  const srcRegionCode = scaHeader.regionCode || 5;

  // Determine what data source has
  const srcHasBitmap = srcType === 0 || (srcType === 2 && (srcFct === 0 || srcFct === 1));
  const srcHasAttrs = srcType === 0 || srcType === 1 || (srcType === 2 && (srcFct === 1 || srcFct === 2));

  // Determine what target needs
  const targetHasBitmap = targetType === 0 || (targetType === 2 && (targetFct === 0 || targetFct === 1));
  const targetHasAttrs = targetType === 0 || targetType === 1 || (targetType === 2 && (targetFct === 1 || targetFct === 2));

  // Bitmap loss
  if (srcHasBitmap && !targetHasBitmap) {
    warnings.push('Bitmap data will be discarded.');
  }

  // Attr loss
  if (srcHasAttrs && !targetHasAttrs) {
    warnings.push('Attribute data will be discarded.');
  }

  // Bitmap generation from pattern
  if (!srcHasBitmap && targetHasBitmap) {
    warnings.push('Bitmap will be generated from fill pattern.');
  }

  // Region reduction (only relevant when target is type 2)
  if (targetType === 2) {
    const srcRegion = (srcType === 2) ? (SCA.REGIONS[srcRegionCode] || SCA.REGIONS[5]) : SCA.REGIONS[5];
    const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];

    // Check if target region is smaller than source
    if (targetRegion.charRows < srcRegion.charRows ||
        targetRegion.startRow > srcRegion.startRow ||
        (targetRegion.startRow + targetRegion.charRows) < (srcRegion.startRow + srcRegion.charRows)) {
      warnings.push('Data outside the selected region will be discarded.');
    }
  } else if (srcType === 2 && targetType !== 2) {
    // Converting from partial region to full-screen type 0/1
    const srcRegion = SCA.REGIONS[srcRegionCode] || SCA.REGIONS[5];
    if (srcRegion.charRows < 24) {
      warnings.push('Source has partial region; missing areas will use fill pattern or zeros.');
    }
  }

  return warnings;
}

/**
 * Calculates the target SCA file size for given parameters
 * @param {number} frameCount
 * @param {number} targetType
 * @param {number} targetFct
 * @param {number} targetRegionCode
 * @returns {number}
 */
function calculateTargetScaFileSize(frameCount, targetType, targetFct, targetRegionCode) {
  if (targetType === 2) {
    const region = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
    const hasBitmap = (targetFct === 0 || targetFct === 1);
    const hasAttrs = (targetFct === 1 || targetFct === 2);
    const blockDataSize = (hasBitmap ? region.bitmapSize : 0) + (hasAttrs ? region.attrSize : 0);
    const fillPatternSize = (targetFct === 2) ? SCA.FILL_PATTERN_SIZE : 0;
    return SCA.HEADER_SIZE + 1 + fillPatternSize + (frameCount * (1 + blockDataSize + 1));
  }
  if (targetType === 1) {
    return SCA.HEADER_SIZE + frameCount + SCA.FILL_PATTERN_SIZE + (frameCount * SCA.ATTR_FRAME_SIZE);
  }
  // Type 0
  return SCA.HEADER_SIZE + frameCount + (frameCount * SCA.FRAME_SIZE);
}

/**
 * Shows/hides the save progress UI in the dialog and disables/enables controls.
 * @param {boolean} show
 * @param {string} [text]
 * @param {number} [percent]
 */
function updateScaSaveProgress(show, text, percent) {
  const row = document.getElementById('scaSaveProgressRow');
  const textEl = document.getElementById('scaSaveProgressText');
  const bar = document.getElementById('scaSaveProgressBar');
  const okBtn = document.getElementById('scaSaveOkBtn');
  const cancelBtn = document.getElementById('scaSaveCancelBtn');
  if (row) row.style.display = show ? '' : 'none';
  if (textEl && text !== undefined) textEl.textContent = text;
  if (bar && percent !== undefined) bar.style.width = percent + '%';
  if (okBtn) /** @type {HTMLButtonElement} */ (okBtn).disabled = show;
  if (cancelBtn) /** @type {HTMLButtonElement} */ (cancelBtn).disabled = show;
  // Disable/enable all select controls during processing
  const selectIds = ['scaSavePayloadType', 'scaSaveRegion', 'scaSaveFct', 'scaSaveCompression', 'scaSavePattern', 'scaSaveOutput'];
  for (const id of selectIds) {
    const el = document.getElementById(id);
    if (el) /** @type {HTMLSelectElement} */ (el).disabled = show;
  }
}

/**
 * Executes the SCA save with the configured settings
 */
async function executeScaSave() {
  if (!scaHeader || !screenData) return;

  const targetType = parseInt(/** @type {HTMLSelectElement} */ (document.getElementById('scaSavePayloadType')).value, 10);
  const targetRegionCode = parseInt(/** @type {HTMLSelectElement} */ (document.getElementById('scaSaveRegion')).value, 10);
  const targetFct = parseInt(/** @type {HTMLSelectElement} */ (document.getElementById('scaSaveFct')).value, 10);
  const compressionType = parseInt(/** @type {HTMLSelectElement} */ (document.getElementById('scaSaveCompression')).value, 10);
  const fillPattern = getSelectedFillPattern();

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot save: no frames remaining after trim.');
    return;
  }

  // If no conversion needed, use existing fast path
  const noConversion = targetType === scaHeader.payloadType &&
    compressionType === 0 &&
    (targetType !== 2 || (targetFct === scaHeader.fct && targetRegionCode === scaHeader.regionCode));

  /** @type {{data: Uint8Array, trimmedCount: number}|null} */
  let result;
  if (noConversion) {
    result = buildTrimmedScaData();
  } else {
    // Show progress for conversion/compression
    updateScaSaveProgress(true, 'Processing frames...', 0);
    await new Promise(r => setTimeout(r, 0)); // yield for UI update

    /** @param {number} current @param {number} total */
    const onProgress = async (current, total) => {
      const pct = Math.round((current / total) * 100);
      const compLabel = compressionType !== 0 ? 'Compressing' : 'Converting';
      updateScaSaveProgress(true, `${compLabel} frame ${current}/${total}...`, pct);
      await new Promise(r => setTimeout(r, 0));
    };

    result = await buildConvertedScaDataAsync(targetType, targetFct, targetRegionCode, fillPattern, compressionType, onProgress);
    updateScaSaveProgress(false);
  }

  if (!result) {
    updateScaSaveProgress(false);
    return;
  }

  // Generate filename
  const baseName = currentFileName.replace(/\.sca$/i, '');
  const hasTrim = editTrimStart > 0 || editTrimEnd > 0;
  const hasOptimized = optimizedOutFrames.size > 0;
  const hasDeleted = manuallyDeletedFrames.size > 0;
  let suffix = '';
  if (noConversion) {
    if (hasOptimized || hasDeleted) {
      suffix = '_edited';
    } else if (hasTrim) {
      suffix = '_trimmed';
    } else if (delaysModified) {
      suffix = '_edited';
    }
  } else {
    suffix = '_converted';
  }

  const outputFormat = /** @type {HTMLSelectElement} */ (document.getElementById('scaSaveOutput')).value;

  if (outputFormat === 'asm') {
    // ASM + SCA zip output
    const scaFileName = `${baseName}${suffix}.sca`;
    // Warn if SCA data + player code won't fit in 64K at ORG 25000
    const estimatedEnd = 25000 + 300 + result.data.length; // ORG + ~code + data
    if (estimatedEnd > 0x10000) {
      const overBy = estimatedEnd - 0x10000;
      alert(`Warning: SCA data (${result.data.length} bytes) is too large to fit in 64K at ORG 25000 — overflows by ~${overBy} bytes. The exported ASM player may not work correctly on real hardware.`);
    }
    const asmSource = generateScaPlayerAsm(
      baseName + suffix,
      result.trimmedCount,
      targetType,
      scaHeader.borderColor,
      targetFct,
      targetRegionCode,
      compressionType,
      fillPattern
    );
    const asmBytes = new TextEncoder().encode(asmSource);
    const files = [
      { name: scaFileName, data: result.data },
      { name: `${baseName}${suffix}.asm`, data: asmBytes }
    ];
    const zipData = scaCreateZip(files);
    downloadFile(new Blob([zipData], { type: 'application/zip' }), `${baseName}${suffix}_asm.zip`);
  } else {
    // SCA binary output
    const newFileName = `${baseName}${suffix}.sca`;
    downloadFile(new Blob([result.data], { type: 'application/octet-stream' }), newFileName);
  }

  // Close dialog
  const dialog = document.getElementById('scaSaveDialog');
  if (dialog) dialog.style.display = 'none';
}

// ============================================================================
// SCA Conversion Helpers
// ============================================================================

/**
 * Extracts bitmap bytes for a target region from the current source frame.
 * Returns ZX-interleaved bitmap bytes for the specified region.
 * @param {number} frameIndex - Source frame index
 * @param {number} targetRegionCode - Target region code (0-5)
 * @param {Uint8Array} fillPattern - Fill pattern for generating bitmap if source lacks it
 * @returns {Uint8Array}
 */
function extractBitmapForRegion(frameIndex, targetRegionCode, fillPattern) {
  const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
  const targetBitmapSize = targetRegion.bitmapSize;
  const result = new Uint8Array(targetBitmapSize);

  const srcType = scaHeader.payloadType;
  const targetStartThird = targetRegion.startRow / 8;
  const targetThirdCount = targetRegion.charRows / 8;

  if (srcType === 0) {
    // Type 0: full 6912-byte frames, bitmap at offsets 0..6143
    const frameOffset = scaHeader.frameDataStart + (frameIndex * scaHeader.frameSize);
    let dstOffset = 0;
    for (let t = 0; t < targetThirdCount; t++) {
      const srcThird = targetStartThird + t;
      const srcBitmapStart = frameOffset + srcThird * 2048;
      for (let i = 0; i < 2048; i++) {
        result[dstOffset++] = screenData[srcBitmapStart + i];
      }
    }
  } else if (srcType === 1) {
    // Type 1: no bitmap data, generate from fill pattern
    return generateBitmapFromPattern(fillPattern, targetRegionCode);
  } else if (srcType === 2) {
    // Type 2: packed frames with region
    const srcFct = scaHeader.fct;
    const srcHasBitmap = (srcFct === 0 || srcFct === 1);
    const srcRegion = scaHeader.region;
    const srcRegionCode = scaHeader.regionCode || 5;

    if (!srcHasBitmap) {
      // Source has no bitmap, generate from pattern
      return generateBitmapFromPattern(fillPattern, targetRegionCode);
    }

    // Source has bitmap - extract overlapping portions
    const frame = scaHeader.frames[frameIndex];
    const srcStartThird = srcRegion.startRow / 8;
    const srcThirdCount = srcRegion.charRows / 8;

    let dstOffset = 0;
    for (let t = 0; t < targetThirdCount; t++) {
      const absThird = targetStartThird + t;
      const relInSrc = absThird - srcStartThird;

      if (relInSrc >= 0 && relInSrc < srcThirdCount) {
        // This third is in the source region - copy it
        const srcBitmapStart = frame.offset + relInSrc * 2048;
        for (let i = 0; i < 2048; i++) {
          result[dstOffset++] = screenData[srcBitmapStart + i];
        }
      } else {
        // This third is outside source region - fill with pattern
        const patternThird = generateBitmapFromPattern(fillPattern, 0); // single third
        for (let i = 0; i < 2048; i++) {
          result[dstOffset++] = patternThird[i];
        }
      }
    }
  }

  return result;
}

/**
 * Extracts attribute bytes for a target region from the current source frame.
 * @param {number} frameIndex - Source frame index
 * @param {number} targetRegionCode - Target region code (0-5)
 * @returns {Uint8Array|null} - null if source has no attrs
 */
function extractAttrsForRegion(frameIndex, targetRegionCode) {
  const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
  const targetAttrSize = targetRegion.attrSize;
  const result = new Uint8Array(targetAttrSize);

  const srcType = scaHeader.payloadType;
  const targetStartRow = targetRegion.startRow;
  const targetCharRows = targetRegion.charRows;

  if (srcType === 0) {
    // Type 0: full frames, attrs at offset 6144..6911
    const frameOffset = scaHeader.frameDataStart + (frameIndex * scaHeader.frameSize);
    const attrBase = frameOffset + 6144;
    const srcStartOffset = targetStartRow * 32;
    for (let i = 0; i < targetAttrSize; i++) {
      result[i] = screenData[attrBase + srcStartOffset + i];
    }
  } else if (srcType === 1) {
    // Type 1: frame data is 768 bytes of full-screen attrs
    const frameOffset = scaHeader.frameDataStart + (frameIndex * scaHeader.frameSize);
    const srcStartOffset = targetStartRow * 32;
    for (let i = 0; i < targetAttrSize; i++) {
      result[i] = screenData[frameOffset + srcStartOffset + i];
    }
  } else if (srcType === 2) {
    // Type 2: packed frames with region
    const srcFct = scaHeader.fct;
    const srcHasAttrs = (srcFct === 1 || srcFct === 2);
    const srcRegion = scaHeader.region;
    const srcHasBitmap = (srcFct === 0 || srcFct === 1);

    if (!srcHasAttrs) {
      // Source has no attrs - return zeros (white on black default)
      result.fill(0x38); // white paper, black ink
      return result;
    }

    // Source has attrs
    const frame = scaHeader.frames[frameIndex];
    const attrOffset = frame.offset + (srcHasBitmap ? srcRegion.bitmapSize : 0);
    const srcStartRow = srcRegion.startRow;
    const srcCharRows = srcRegion.charRows;

    for (let row = 0; row < targetCharRows; row++) {
      const absRow = targetStartRow + row;
      const relRow = absRow - srcStartRow;
      for (let col = 0; col < 32; col++) {
        if (relRow >= 0 && relRow < srcCharRows) {
          result[row * 32 + col] = screenData[attrOffset + relRow * 32 + col];
        } else {
          result[row * 32 + col] = 0x38; // default attr
        }
      }
    }
  }

  return result;
}

/**
 * Generates ZX-interleaved bitmap bytes by tiling the 8-byte fill pattern.
 * @param {Uint8Array} fillPattern - 8-byte fill pattern (one byte per pixel line)
 * @param {number} regionCode - Target region code (0-5)
 * @returns {Uint8Array}
 */
function generateBitmapFromPattern(fillPattern, regionCode) {
  const region = SCA.REGIONS[regionCode] || SCA.REGIONS[5];
  const bitmapSize = region.bitmapSize;
  const result = new Uint8Array(bitmapSize);
  const thirdCount = region.charRows / 8;

  let dstOffset = 0;
  for (let third = 0; third < thirdCount; third++) {
    // Each third: 2048 bytes, ZX interleaved: line*256 + charRow*32 + col
    for (let line = 0; line < 8; line++) {
      for (let charRow = 0; charRow < 8; charRow++) {
        for (let col = 0; col < 32; col++) {
          result[third * 2048 + line * 256 + charRow * 32 + col] = fillPattern[line];
        }
      }
    }
  }

  return result;
}

/**
 * Compresses a data block using the specified compression type.
 * @param {Uint8Array} data - Raw data to compress
 * @param {number} compressionType - 0=none, 1=ZX0, 2=LC, 3=RLE, 4=Chunks4x4, 5=Chunks4x2
 * @param {{startCharRow: number, charRows: number}} [region] - Region info for chunks (optional)
 * @returns {Uint8Array} - Compressed data (or original if uncompressed)
 */
function compressScaBlock(data, compressionType, region) {
  if (compressionType === 1) {
    // ZX0 forward mode, no skip, not backwards, not classic
    const result = ZX0.compress(data, 0, false, false, false);
    return result.data;
  } else if (compressionType === 2) {
    // Laser Compact
    const result = LC.compress(data);
    return result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
  } else if (compressionType === 3) {
    // RLE
    const result = RLE.compress(data);
    return result.data;
  } else if (compressionType === 4) {
    // Chunks 4×4 — store only encoded bytes, codebook/LUT are static preset
    const result = CHUNKS.compress(data, CHUNKS.MODE_4x4, undefined, region);
    return result.encoded;
  } else if (compressionType === 5) {
    // Chunks 4×2 — store only encoded bytes, codebook/LUT are static preset
    const result = CHUNKS.compress(data, CHUNKS.MODE_4x2, undefined, region);
    return result.encoded;
  }
  return data;
}

/**
 * Builds converted SCA data with a different payload type/FCT/region.
 * @param {number} targetType - Target payload type (0, 1, 2)
 * @param {number} targetFct - Target FCT (0, 1, 2) for type 2
 * @param {number} targetRegionCode - Target region code (0-5) for type 2
 * @param {Uint8Array} fillPattern - Fill pattern (8 bytes)
 * @param {number} [compressionType] - Compression type for type 2 (0=none, 1=ZX0, 2=LC)
 * @returns {{data: Uint8Array, trimmedCount: number}|null}
 */
function buildConvertedScaData(targetType, targetFct, targetRegionCode, fillPattern, compressionType) {
  if (!scaHeader || !screenData) return null;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) return null;

  compressionType = compressionType || 0;

  // For compressed type 2, build dynamically since sizes are variable
  if (targetType === 2 && compressionType !== 0) {
    return buildCompressedScaType2Data(trimmedCount, targetFct, targetRegionCode, fillPattern, compressionType);
  }

  // Calculate target file size (for uncompressed)
  const targetSize = calculateTargetScaFileSize(trimmedCount, targetType, targetFct, targetRegionCode);
  const newData = new Uint8Array(targetSize);

  // Write header
  writeScaHeader(newData, trimmedCount, targetType);

  let offset = SCA.HEADER_SIZE;

  if (targetType === 0) {
    // Type 0: delays followed by full 6912-byte frames
    // Write delay table
    for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
      if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
        newData[offset++] = getFrameDelay(i);
      }
    }

    // Write frames
    for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
      if (optimizedOutFrames.has(i) || manuallyDeletedFrames.has(i)) continue;

      // Build full 6912-byte frame: bitmap (6144) + attrs (768)
      const bitmap = extractBitmapForRegion(i, 5, fillPattern); // full screen
      const attrs = extractAttrsForRegion(i, 5);

      // Copy bitmap (6144 bytes)
      for (let j = 0; j < 6144; j++) {
        newData[offset + j] = bitmap[j];
      }
      // Copy attrs (768 bytes)
      if (attrs) {
        for (let j = 0; j < 768; j++) {
          newData[offset + 6144 + j] = attrs[j];
        }
      } else {
        // Default attrs
        for (let j = 0; j < 768; j++) {
          newData[offset + 6144 + j] = 0x38;
        }
      }
      offset += SCA.FRAME_SIZE;
    }
  } else if (targetType === 1) {
    // Type 1: delays + fill pattern (8 bytes) + attr frames (768 bytes each)
    // Write delay table
    for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
      if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
        newData[offset++] = getFrameDelay(i);
      }
    }

    // Write fill pattern
    for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) {
      newData[offset++] = fillPattern[i];
    }

    // Write attr frames
    for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
      if (optimizedOutFrames.has(i) || manuallyDeletedFrames.has(i)) continue;

      const attrs = extractAttrsForRegion(i, 5); // full screen attrs
      if (attrs) {
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) {
          newData[offset++] = attrs[j];
        }
      } else {
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) {
          newData[offset++] = 0x38;
        }
      }
    }
  } else if (targetType === 2) {
    // Type 2 uncompressed: FCT byte + optional fill pattern + per-frame (header + block + delay)
    const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
    const hasBitmap = (targetFct === 0 || targetFct === 1);
    const hasAttrs = (targetFct === 1 || targetFct === 2);

    // Write FCT byte (high nibble = FCT, low nibble = region code)
    newData[offset++] = ((targetFct & 0x0F) << 4) | (targetRegionCode & 0x0F);

    // Write fill pattern if FCT=2
    if (targetFct === 2) {
      for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) {
        newData[offset++] = fillPattern[i];
      }
    }

    // Write frames
    for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
      if (optimizedOutFrames.has(i) || manuallyDeletedFrames.has(i)) continue;

      // Frame header byte: [CCCCC BBB] - compression=0, border from source
      const borderColor = (scaHeader.payloadType === 2 && scaHeader.frames && scaHeader.frames[i])
        ? scaHeader.frames[i].borderColor
        : scaHeader.borderColor;
      newData[offset++] = (0 << 3) | (borderColor & 0x07);

      // Block data: bitmap then attrs
      if (hasBitmap) {
        const bitmap = extractBitmapForRegion(i, targetRegionCode, fillPattern);
        for (let j = 0; j < targetRegion.bitmapSize; j++) {
          newData[offset++] = bitmap[j];
        }
      }
      if (hasAttrs) {
        const attrs = extractAttrsForRegion(i, targetRegionCode);
        if (attrs) {
          for (let j = 0; j < targetRegion.attrSize; j++) {
            newData[offset++] = attrs[j];
          }
        } else {
          for (let j = 0; j < targetRegion.attrSize; j++) {
            newData[offset++] = 0x38;
          }
        }
      }

      // Delay byte
      newData[offset++] = getFrameDelay(i);
    }
  }

  return { data: newData, trimmedCount };
}

/**
 * Async version of buildConvertedScaData that yields to the browser periodically
 * and reports progress via callback.
 * @param {number} targetType
 * @param {number} targetFct
 * @param {number} targetRegionCode
 * @param {Uint8Array} fillPattern
 * @param {number} [compressionType]
 * @param {((current: number, total: number) => Promise<void>)|undefined} [onProgress]
 * @returns {Promise<{data: Uint8Array, trimmedCount: number}|null>}
 */
async function buildConvertedScaDataAsync(targetType, targetFct, targetRegionCode, fillPattern, compressionType, onProgress) {
  if (!scaHeader || !screenData) return null;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) return null;

  compressionType = compressionType || 0;

  // Build list of frame indices to process
  const frameIndices = [];
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      frameIndices.push(i);
    }
  }

  // For compressed type 2, use dynamic buffer
  if (targetType === 2 && compressionType !== 0) {
    return buildCompressedScaType2DataAsync(trimmedCount, targetFct, targetRegionCode, fillPattern, compressionType, frameIndices, onProgress);
  }

  // Uncompressed conversion — still async with yield points for large files
  const targetSize = calculateTargetScaFileSize(trimmedCount, targetType, targetFct, targetRegionCode);
  const newData = new Uint8Array(targetSize);
  writeScaHeader(newData, trimmedCount, targetType);

  let offset = SCA.HEADER_SIZE;

  if (targetType === 0) {
    // Write delay table
    for (const idx of frameIndices) {
      newData[offset++] = getFrameDelay(idx);
    }
    // Write frames with progress
    for (let f = 0; f < frameIndices.length; f++) {
      const i = frameIndices[f];
      const bitmap = extractBitmapForRegion(i, 5, fillPattern);
      const attrs = extractAttrsForRegion(i, 5);
      for (let j = 0; j < 6144; j++) newData[offset + j] = bitmap[j];
      if (attrs) {
        for (let j = 0; j < 768; j++) newData[offset + 6144 + j] = attrs[j];
      } else {
        for (let j = 0; j < 768; j++) newData[offset + 6144 + j] = 0x38;
      }
      offset += SCA.FRAME_SIZE;
      if (onProgress && f % 5 === 0) await onProgress(f + 1, frameIndices.length);
    }
  } else if (targetType === 1) {
    // Write delay table
    for (const idx of frameIndices) {
      newData[offset++] = getFrameDelay(idx);
    }
    // Write fill pattern
    for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) newData[offset++] = fillPattern[i];
    // Write attr frames
    for (let f = 0; f < frameIndices.length; f++) {
      const i = frameIndices[f];
      const attrs = extractAttrsForRegion(i, 5);
      if (attrs) {
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) newData[offset++] = attrs[j];
      } else {
        for (let j = 0; j < SCA.ATTR_FRAME_SIZE; j++) newData[offset++] = 0x38;
      }
      if (onProgress && f % 10 === 0) await onProgress(f + 1, frameIndices.length);
    }
  } else if (targetType === 2) {
    // Type 2 uncompressed
    const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
    const hasBitmap = (targetFct === 0 || targetFct === 1);
    const hasAttrs = (targetFct === 1 || targetFct === 2);
    newData[offset++] = ((targetFct & 0x0F) << 4) | (targetRegionCode & 0x0F);
    if (targetFct === 2) {
      for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) newData[offset++] = fillPattern[i];
    }
    for (let f = 0; f < frameIndices.length; f++) {
      const i = frameIndices[f];
      const borderColor = (scaHeader.payloadType === 2 && scaHeader.frames && scaHeader.frames[i])
        ? scaHeader.frames[i].borderColor : scaHeader.borderColor;
      newData[offset++] = (0 << 3) | (borderColor & 0x07);
      if (hasBitmap) {
        const bitmap = extractBitmapForRegion(i, targetRegionCode, fillPattern);
        for (let j = 0; j < targetRegion.bitmapSize; j++) newData[offset++] = bitmap[j];
      }
      if (hasAttrs) {
        const attrs = extractAttrsForRegion(i, targetRegionCode);
        if (attrs) {
          for (let j = 0; j < targetRegion.attrSize; j++) newData[offset++] = attrs[j];
        } else {
          for (let j = 0; j < targetRegion.attrSize; j++) newData[offset++] = 0x38;
        }
      }
      newData[offset++] = getFrameDelay(i);
      if (onProgress && f % 5 === 0) await onProgress(f + 1, frameIndices.length);
    }
  }

  return { data: newData, trimmedCount };
}

/**
 * Async version of buildCompressedScaType2Data with progress reporting.
 * @param {number} trimmedCount
 * @param {number} targetFct
 * @param {number} targetRegionCode
 * @param {Uint8Array} fillPattern
 * @param {number} compressionType
 * @param {number[]} frameIndices
 * @param {((current: number, total: number) => Promise<void>)|undefined} [onProgress]
 * @returns {Promise<{data: Uint8Array, trimmedCount: number}|null>}
 */
async function buildCompressedScaType2DataAsync(trimmedCount, targetFct, targetRegionCode, fillPattern, compressionType, frameIndices, onProgress) {
  const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
  const isChunks = (compressionType === 4 || compressionType === 5);
  const hasBitmap = isChunks ? true : (targetFct === 0 || targetFct === 1);
  const hasAttrs = isChunks ? false : (targetFct === 1 || targetFct === 2);

  const chunks = [];
  let totalSize = 0;

  // Header
  const header = new Uint8Array(SCA.HEADER_SIZE);
  writeScaHeader(header, trimmedCount, 2);
  chunks.push(header);
  totalSize += SCA.HEADER_SIZE;

  // FCT byte
  const fctByte = new Uint8Array([((targetFct & 0x0F) << 4) | (targetRegionCode & 0x0F)]);
  chunks.push(fctByte);
  totalSize += 1;

  // Fill pattern if FCT=2
  if (targetFct === 2) {
    const fp = new Uint8Array(SCA.FILL_PATTERN_SIZE);
    for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) fp[i] = fillPattern[i];
    chunks.push(fp);
    totalSize += SCA.FILL_PATTERN_SIZE;
  }

  // Process frames with progress
  for (let f = 0; f < frameIndices.length; f++) {
    const i = frameIndices[f];

    // Frame header byte: [CCCCC BBB]
    const borderColor = (scaHeader.payloadType === 2 && scaHeader.frames && scaHeader.frames[i])
      ? scaHeader.frames[i].borderColor : scaHeader.borderColor;
    const frameHeader = new Uint8Array([(compressionType << 3) | (borderColor & 0x07)]);
    chunks.push(frameHeader);
    totalSize += 1;

    // Compress bitmap and attrs as separate blocks for direct-to-screen decompression
    const chunksRegion = isChunks ? { startCharRow: targetRegion.startRow, charRows: targetRegion.charRows } : undefined;
    if (hasBitmap) {
      const bitmapData = extractBitmapForRegion(i, targetRegionCode, fillPattern);
      const compressedBitmap = compressScaBlock(bitmapData, compressionType, chunksRegion);
      chunks.push(compressedBitmap);
      totalSize += compressedBitmap.length;
    }
    if (hasAttrs) {
      const attrsData = extractAttrsForRegion(i, targetRegionCode) || new Uint8Array(targetRegion.attrSize).fill(0x38);
      const compressedAttrs = compressScaBlock(attrsData, compressionType);
      chunks.push(compressedAttrs);
      totalSize += compressedAttrs.length;
    }

    // Delay byte
    const delayByte = new Uint8Array([getFrameDelay(i)]);
    chunks.push(delayByte);
    totalSize += 1;

    // Report progress (yield every frame for compressed, since each frame is slow)
    if (onProgress) await onProgress(f + 1, frameIndices.length);
  }

  // Assemble
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }

  return { data: result, trimmedCount };
}

/**
 * Writes the standard 14-byte SCA header.
 * @param {Uint8Array} data
 * @param {number} frameCount
 * @param {number} payloadType
 */
function writeScaHeader(data, frameCount, payloadType) {
  data[0] = 0x53; // 'S'
  data[1] = 0x43; // 'C'
  data[2] = 0x41; // 'A'
  data[3] = scaHeader.version;
  data[4] = scaHeader.width & 0xFF;
  data[5] = (scaHeader.width >> 8) & 0xFF;
  data[6] = scaHeader.height & 0xFF;
  data[7] = (scaHeader.height >> 8) & 0xFF;
  data[8] = scaHeader.borderColor;
  data[9] = frameCount & 0xFF;
  data[10] = (frameCount >> 8) & 0xFF;
  data[11] = payloadType;
  data[12] = SCA.HEADER_SIZE & 0xFF;
  data[13] = (SCA.HEADER_SIZE >> 8) & 0xFF;
}

/**
 * Builds compressed SCA type 2 data using dynamic buffer (since frame sizes vary).
 * @param {number} trimmedCount
 * @param {number} targetFct
 * @param {number} targetRegionCode
 * @param {Uint8Array} fillPattern
 * @param {number} compressionType - 1=ZX0, 2=LC
 * @returns {{data: Uint8Array, trimmedCount: number}|null}
 */
function buildCompressedScaType2Data(trimmedCount, targetFct, targetRegionCode, fillPattern, compressionType) {
  const targetRegion = SCA.REGIONS[targetRegionCode] || SCA.REGIONS[5];
  const isChunks = (compressionType === 4 || compressionType === 5);
  const hasBitmap = isChunks ? true : (targetFct === 0 || targetFct === 1);
  const hasAttrs = isChunks ? false : (targetFct === 1 || targetFct === 2);

  // Build output dynamically using array of chunks
  const chunks = [];
  let totalSize = 0;

  // Header (14 bytes)
  const header = new Uint8Array(SCA.HEADER_SIZE);
  writeScaHeader(header, trimmedCount, 2);
  chunks.push(header);
  totalSize += SCA.HEADER_SIZE;

  // FCT byte
  const fctByte = new Uint8Array([((targetFct & 0x0F) << 4) | (targetRegionCode & 0x0F)]);
  chunks.push(fctByte);
  totalSize += 1;

  // Fill pattern if FCT=2
  if (targetFct === 2) {
    const fp = new Uint8Array(SCA.FILL_PATTERN_SIZE);
    for (let i = 0; i < SCA.FILL_PATTERN_SIZE; i++) fp[i] = fillPattern[i];
    chunks.push(fp);
    totalSize += SCA.FILL_PATTERN_SIZE;
  }

  // Frames
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (optimizedOutFrames.has(i) || manuallyDeletedFrames.has(i)) continue;

    // Frame header byte: [CCCCC BBB]
    const borderColor = (scaHeader.payloadType === 2 && scaHeader.frames && scaHeader.frames[i])
      ? scaHeader.frames[i].borderColor
      : scaHeader.borderColor;
    const frameHeader = new Uint8Array([(compressionType << 3) | (borderColor & 0x07)]);
    chunks.push(frameHeader);
    totalSize += 1;

    // Compress bitmap and attrs as separate blocks so the player can
    // decompress each directly to its screen address (no buffer needed)
    const chunksRegion = isChunks ? { startCharRow: targetRegion.startRow, charRows: targetRegion.charRows } : undefined;
    if (hasBitmap) {
      const bitmapData = extractBitmapForRegion(i, targetRegionCode, fillPattern);
      const compressedBitmap = compressScaBlock(bitmapData, compressionType, chunksRegion);
      chunks.push(compressedBitmap);
      totalSize += compressedBitmap.length;
    }
    if (hasAttrs) {
      const attrsData = extractAttrsForRegion(i, targetRegionCode) || new Uint8Array(targetRegion.attrSize).fill(0x38);
      const compressedAttrs = compressScaBlock(attrsData, compressionType);
      chunks.push(compressedAttrs);
      totalSize += compressedAttrs.length;
    }

    // Delay byte
    const delayByte = new Uint8Array([getFrameDelay(i)]);
    chunks.push(delayByte);
    totalSize += 1;
  }

  // Assemble final buffer
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return { data: result, trimmedCount };
}

// ============================================================================
// Save dispatcher
// ============================================================================

function handleScaSave() {
  const sel = document.getElementById('editSaveFormat');
  const fmt = sel ? /** @type {HTMLSelectElement} */ (sel).value : 'sca';
  switch (fmt) {
    case 'sca': showScaSaveDialog(); break;
    case 'scr': exportToScrSeries(); break;
    case '53c': exportTo53cSeries(); break;
    case 'gif': exportToGif(); break;
    case 'png': exportToPngSeries(); break;
  }
}

// ============================================================================
// CRC32 and ZIP utilities
// ============================================================================

/** @type {Uint32Array|null} */
let scaCrc32Table = null;

/**
 * Compute CRC32 checksum
 * @param {Uint8Array} data
 * @returns {number}
 */
function scaCrc32(data) {
  if (!scaCrc32Table) {
    scaCrc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      scaCrc32Table[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = scaCrc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Create a ZIP file (store method, no compression)
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Uint8Array}
 */
function scaCreateZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = file.data;
    const crc = scaCrc32(data);

    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    // Central directory header
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localHeaders.push({ header: localHeader, data: data });
    centralHeaders.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    centralDirSize += ch.length;
  }

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const lh of localHeaders) {
    result.set(lh.header, pos);
    pos += lh.header.length;
    result.set(lh.data, pos);
    pos += lh.data.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(endRecord, pos);

  return result;
}

// ============================================================================
// GIF Encoder (256-color, LZW compression)
// ============================================================================

class GifEncoder {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {Array<{palette: Uint8Array, indexed: Uint8Array, delay: number}>} */
    this.frames = [];
  }

  /**
   * @param {Uint8ClampedArray} rgba - RGBA pixel data
   * @param {number} delay - Delay in centiseconds
   */
  addFrame(rgba, delay) {
    const { palette, indexed } = this._quantize(rgba);
    this.frames.push({ palette, indexed, delay });
  }

  /**
   * Popularity-based quantization to 256 colors
   * @param {Uint8ClampedArray} rgba
   * @returns {{palette: Uint8Array, indexed: Uint8Array}}
   */
  _quantize(rgba) {
    const colorCounts = new Map();
    const pixels = [];

    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i] & 0xF8;
      const g = rgba[i + 1] & 0xFC;
      const b = rgba[i + 2] & 0xF8;
      const key = (r << 16) | (g << 8) | b;
      pixels.push(key);
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    const sorted = [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 256);

    const palette = new Uint8Array(256 * 3);
    const colorToIndex = new Map();

    for (let i = 0; i < sorted.length; i++) {
      const [color] = sorted[i];
      palette[i * 3] = (color >> 16) & 0xFF;
      palette[i * 3 + 1] = (color >> 8) & 0xFF;
      palette[i * 3 + 2] = color & 0xFF;
      colorToIndex.set(color, i);
    }

    const indexed = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      indexed[i] = colorToIndex.get(pixels[i]) || 0;
    }

    return { palette, indexed };
  }

  /**
   * Encode all frames into GIF89a binary
   * @returns {Uint8Array}
   */
  finish() {
    const out = [];

    // GIF89a header
    out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

    // Logical Screen Descriptor
    out.push(this.width & 0xFF, (this.width >> 8) & 0xFF);
    out.push(this.height & 0xFF, (this.height >> 8) & 0xFF);
    out.push(0xF7); // Global color table flag, 256 colors
    out.push(0);    // Background color index
    out.push(0);    // Pixel aspect ratio

    // Global Color Table (placeholder — each frame uses local color table)
    for (let i = 0; i < 256 * 3; i++) {
      out.push(0);
    }

    // Netscape Extension for looping
    out.push(0x21, 0xFF, 0x0B);
    out.push(0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30); // NETSCAPE2.0
    out.push(0x03, 0x01, 0x00, 0x00, 0x00); // Loop forever

    for (const frame of this.frames) {
      // Graphics Control Extension
      out.push(0x21, 0xF9, 0x04);
      out.push(0x00); // Disposal method
      out.push(frame.delay & 0xFF, (frame.delay >> 8) & 0xFF);
      out.push(0x00); // Transparent color index
      out.push(0x00); // Block terminator

      // Image Descriptor
      out.push(0x2C);
      out.push(0, 0, 0, 0); // Left, Top
      out.push(this.width & 0xFF, (this.width >> 8) & 0xFF);
      out.push(this.height & 0xFF, (this.height >> 8) & 0xFF);
      out.push(0x87); // Local color table, 256 colors

      // Local Color Table
      for (let i = 0; i < 256 * 3; i++) {
        out.push(frame.palette[i] || 0);
      }

      // LZW Compressed Image Data
      const lzw = this._lzwEncode(frame.indexed, 8);
      out.push(8); // LZW minimum code size

      let pos = 0;
      while (pos < lzw.length) {
        const blockSize = Math.min(255, lzw.length - pos);
        out.push(blockSize);
        for (let i = 0; i < blockSize; i++) {
          out.push(lzw[pos++]);
        }
      }
      out.push(0x00); // Block terminator
    }

    // GIF Trailer
    out.push(0x3B);

    return new Uint8Array(out);
  }

  /**
   * Standard LZW encoder
   * @param {Uint8Array} data
   * @param {number} minCodeSize
   * @returns {number[]}
   */
  _lzwEncode(data, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const maxCode = 4096;

    const table = new Map();
    for (let i = 0; i < clearCode; i++) {
      table.set(String.fromCharCode(i), i);
    }

    const output = [];
    let bitBuffer = 0;
    let bitCount = 0;

    const writeBits = (code, size) => {
      bitBuffer |= code << bitCount;
      bitCount += size;
      while (bitCount >= 8) {
        output.push(bitBuffer & 0xFF);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    writeBits(clearCode, codeSize);

    let current = '';
    for (let i = 0; i < data.length; i++) {
      const char = String.fromCharCode(data[i]);
      const next = current + char;

      if (table.has(next)) {
        current = next;
      } else {
        writeBits(table.get(current), codeSize);

        if (nextCode < maxCode) {
          table.set(next, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          writeBits(clearCode, codeSize);
          table.clear();
          for (let j = 0; j < clearCode; j++) {
            table.set(String.fromCharCode(j), j);
          }
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }

        current = char;
      }
    }

    if (current.length > 0) {
      writeBits(table.get(current), codeSize);
    }

    writeBits(eoiCode, codeSize);

    if (bitCount > 0) {
      output.push(bitBuffer & 0xFF);
    }

    return output;
  }
}

// ============================================================================
// GIF export
// ============================================================================

async function exportToGif() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot export: no frames remaining.');
    return;
  }

  const baseName = currentFileName.replace(/\.sca$/i, '');
  const savedText = editFileName ? editFileName.textContent : '';

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 256;
  tempCanvas.height = 192;
  const gif = new GifEncoder(256, 192);

  let exported = 0;
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      renderScaFrameToCanvas(tempCanvas, i);
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) continue;
      const imageData = ctx.getImageData(0, 0, 256, 192);
      // SCA delay unit = 20ms, GIF delay unit = 10ms (centiseconds), minimum 2cs
      const gifDelay = Math.max(2, getFrameDelay(i) * 2);
      gif.addFrame(imageData.data, gifDelay);
      exported++;
      if (exported % 10 === 0 && editFileName) {
        editFileName.textContent = `Exporting GIF... ${exported}/${trimmedCount}`;
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  const gifData = gif.finish();
  downloadFile(new Blob([gifData], { type: 'image/gif' }), `${baseName}.gif`);

  if (editFileName) {
    editFileName.textContent = savedText || '';
  }
}

// ============================================================================
// PNG zip export
// ============================================================================

async function exportToPngSeries() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot export: no frames remaining.');
    return;
  }

  const baseName = currentFileName.replace(/\.sca$/i, '');
  const padWidth = trimmedCount > 1000 ? 4 : 3;
  const savedText = editFileName ? editFileName.textContent : '';

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 256;
  tempCanvas.height = 192;

  const files = [];
  let exportIndex = 0;
  for (let i = editTrimStart; i < scaHeader.frameCount - editTrimEnd; i++) {
    if (!optimizedOutFrames.has(i) && !manuallyDeletedFrames.has(i)) {
      renderScaFrameToCanvas(tempCanvas, i);
      // Convert canvas to PNG bytes
      const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
      if (!blob) continue;
      const arrayBuf = await blob.arrayBuffer();
      const indexStr = String(exportIndex).padStart(padWidth, '0');
      files.push({ name: `${baseName}_${indexStr}.png`, data: new Uint8Array(arrayBuf) });
      exportIndex++;
      if (exportIndex % 10 === 0 && editFileName) {
        editFileName.textContent = `Exporting PNG... ${exportIndex}/${trimmedCount}`;
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  const zipData = scaCreateZip(files);
  downloadFile(new Blob([zipData], { type: 'application/zip' }), `${baseName}_png.zip`);

  if (editFileName) {
    editFileName.textContent = savedText || '';
  }
}

// ============================================================================
// ASM (zip) export
// ============================================================================

/**
 * Generates SCA player ASM source for sjasmplus
 * @param {string} baseName - base filename (without extension)
 * @param {number} frameCount - number of frames
 * @param {number} payloadType - 0 = full frames, 1 = attr-only with fill pattern
 * @param {number} borderColor - border color (0-7)
 * @returns {string}
 */
/**
 * Generates Z80 assembly source for an SCA animation player.
 * Supports all payload types (0, 1, 2) and compression (ZX0, LC).
 * @param {string} baseName
 * @param {number} frameCount
 * @param {number} payloadType
 * @param {number} borderColor
 * @param {number} [fct] - Frame content type (for type 2)
 * @param {number} [regionCode] - Region code (for type 2)
 * @param {number} [compressionType] - 0=none, 1=ZX0, 2=LC
 * @param {Uint8Array} [fillPattern] - Fill pattern bytes
 * @returns {string}
 */
function generateScaPlayerAsm(baseName, frameCount, payloadType, borderColor, fct, regionCode, compressionType, fillPattern) {
  const scaFile = baseName + '.sca';
  const snaFile = baseName + '.sna';
  const isType1 = payloadType === 1;
  const isType2 = payloadType === 2;
  compressionType = compressionType || 0;
  fct = (fct !== undefined && fct !== null) ? fct : 1;
  regionCode = (regionCode !== undefined) ? regionCode : 5;

  let asm = '';
  asm += '; SCA animation player\n';
  asm += '; Generated by SpectraLab - https://github.com/nicklasio/SpectraLab\n';
  asm += '; Target: sjasmplus, ZX Spectrum 128K\n';
  asm += ';\n';
  asm += '; Frames: ' + frameCount + '\n';

  if (isType2) {
    const comprNames = ['uncompressed', 'ZX0', 'Laser Compact', 'RLE', 'Chunks 4×4', 'Chunks 4×2'];
    const fctNames = ['bitmap only', 'bitmap + attrs', 'attrs only'];
    const regionNames = ['top third', 'mid third', 'bot third', 'top+mid', 'mid+bot', 'full screen'];
    asm += '; Payload type: 2 (packed)\n';
    asm += '; FCT: ' + fct + ' (' + (fctNames[fct] || '?') + ')\n';
    asm += '; Region: ' + regionCode + ' (' + (regionNames[regionCode] || '?') + ')\n';
    asm += '; Compression: ' + compressionType + ' (' + (comprNames[compressionType] || '?') + ')\n';
  } else {
    asm += '; Payload type: ' + payloadType + (isType1 ? ' (attrs + fill pattern)' : ' (full 6912-byte frames)') + '\n';
  }
  asm += '; Border color: ' + borderColor + '\n';
  asm += '\n';
  asm += '  DEVICE ZXSPECTRUM128\n';
  asm += '  ORG 25000\n';
  asm += '\n';
  asm += 'FRAME_COUNT   EQU ' + frameCount + '\n';
  asm += 'BORDER_COLOR  EQU ' + borderColor + '\n';

  if (!isType2) {
    const frameSize = isType1 ? SCA.ATTR_FRAME_SIZE : SCA.FRAME_SIZE;
    asm += 'FRAME_SIZE    EQU ' + frameSize + '\n';
  } else {
    const region = SCA.REGIONS[regionCode] || SCA.REGIONS[5];
    const hasBitmap = (fct === 0 || fct === 1);
    const hasAttrs = (fct === 1 || fct === 2);
    const blockSize = (hasBitmap ? region.bitmapSize : 0) + (hasAttrs ? region.attrSize : 0);
    asm += 'BLOCK_SIZE    EQU ' + blockSize + '\n';
    if (hasBitmap) asm += 'BITMAP_SIZE   EQU ' + region.bitmapSize + '\n';
    if (hasAttrs) asm += 'ATTR_SIZE     EQU ' + region.attrSize + '\n';
    asm += 'SCREEN_BMP    EQU #4000 + ' + (region.startRow * 256) + '\n';
    asm += 'SCREEN_ATTR   EQU #5800 + ' + (region.startRow * 32) + '\n';
  }
  asm += '\n';

  asm += 'Start:\n';
  asm += '  DI\n';
  asm += '  LD SP,25000       ; stack grows down below our code\n';
  asm += '  ; Select 48K BASIC ROM + bank 0 at #C000 (safe IM 1 handler)\n';
  asm += '  LD A,#10           ; bit4=ROM1(48K), bits0-2=bank0\n';
  asm += '  LD BC,#7FFD\n';
  asm += '  OUT (C),A\n';
  asm += '  LD A,BORDER_COLOR\n';
  asm += '  OUT (#FE),A\n';
  asm += '\n';

  if (isType1 || (isType2 && fct === 2)) {
    // Fill bitmap for type 1 or type 2 attrs-only
    asm += '  ; Fill bitmap with fill pattern\n';
    asm += '  LD IX,FillPattern\n';
    asm += '  LD DE,#4000\n';
    asm += '  LD C,3           ; 3 thirds\n';
    asm += 'FillThird:\n';
    asm += '  LD B,8           ; 8 pixel lines per third\n';
    asm += '  PUSH IX\n';
    asm += 'FillLine:\n';
    asm += '  LD A,(IX+0)\n';
    asm += '  PUSH BC\n';
    asm += '  LD B,0           ; 256 bytes\n';
    asm += 'FillBlock:\n';
    asm += '  LD (DE),A\n';
    asm += '  INC DE\n';
    asm += '  DJNZ FillBlock\n';
    asm += '  INC IX\n';
    asm += '  POP BC\n';
    asm += '  DJNZ FillLine\n';
    asm += '  POP IX\n';
    asm += '  DEC C\n';
    asm += '  JR NZ,FillThird\n';
    asm += '\n';
  }

  if (isType2 && (compressionType === 4 || compressionType === 5)) {
    // Chunks is bitmap-only — set attrs to 0x38 (black on white) so bitmap is visible
    asm += '  ; Init screen attrs (chunks = bitmap only, no attr data)\n';
    asm += '  LD HL,#5800\n';
    asm += '  LD DE,#5801\n';
    asm += '  LD BC,767\n';
    asm += '  LD (HL),#38       ; ink=0 paper=7\n';
    asm += '  LDIR\n';
    asm += '\n';
  }

  if (isType2 && compressionType !== 0) {
    // Type 2 compressed player
    asm += generateType2CompressedPlayer(frameCount, fct, regionCode, compressionType);
  } else if (isType2) {
    // Type 2 uncompressed player
    asm += generateType2UncompressedPlayer(frameCount, fct, regionCode);
  } else {
    // Type 0/1 player (original logic)
    asm += '  IM 1\n';
    asm += '  EI\n';
    asm += '\n';
    asm += 'Restart:\n';
    asm += '  LD IX,DelayTable\n';
    asm += '  LD HL,FrameData\n';
    asm += '  LD A,FRAME_COUNT\n';
    asm += '  LD (FramesLeft),A\n';
    asm += '\n';
    asm += 'MainLoop:\n';

    if (isType1) {
      asm += '  LD DE,#5800\n';
      asm += '  LD BC,768\n';
    } else {
      asm += '  LD DE,#4000\n';
      asm += '  LD BC,6912\n';
    }

    asm += '  PUSH HL\n';
    asm += '  LDIR\n';
    asm += '  POP HL\n';
    asm += '\n';
    asm += '  LD A,(IX+0)\n';
    asm += '  OR A\n';
    asm += '  JR Z,.NoDelay\n';
    asm += '  LD B,A\n';
    asm += '.WaitLoop:\n';
    asm += '  HALT\n';
    asm += '  DJNZ .WaitLoop\n';
    asm += '.NoDelay:\n';
    asm += '\n';
    asm += '  LD BC,FRAME_SIZE\n';
    asm += '  ADD HL,BC\n';
    asm += '  INC IX\n';
    asm += '  LD A,(FramesLeft)\n';
    asm += '  DEC A\n';
    asm += '  LD (FramesLeft),A\n';
    asm += '  JR NZ,MainLoop\n';
    asm += '  JR Restart\n';
    asm += '\n';
    asm += 'FramesLeft:\n';
    asm += '  DB 0\n';
  }

  // Decompressor include for compressed type 2
  if (isType2 && compressionType === 1) {
    asm += '\n; --- ZX0 depacker (forward, standard) ---\n';
    asm += generateZx0Depacker();
  } else if (isType2 && compressionType === 2) {
    asm += '\n; --- Laser Compact 5.2 depacker ---\n';
    asm += generateLcDepacker();
  } else if (isType2 && compressionType === 3) {
    asm += '\n; --- RLE depacker ---\n';
    asm += generateRleDepacker();
  } else if (isType2 && (compressionType === 4 || compressionType === 5)) {
    asm += '\n; --- Chunks depacker ---\n';
    asm += compressionType === 4 ? CHUNKS.getDepacker4x4() : CHUNKS.getDepacker4x2();
    // Embed lookup table derived from static preset codebook
    const chunkMode = compressionType === 4 ? CHUNKS.MODE_4x4 : CHUNKS.MODE_4x2;
    const preset = CHUNKS.getPreset('standard', chunkMode);
    const lut = CHUNKS.generateLookupTable(preset, chunkMode);
    asm += '\n; --- Chunks lookup table (static preset) ---\n';
    asm += 'ChunksLUT:\n';
    const lutLines = [];
    for (let i = 0; i < lut.length; i += 8) {
      const slice = Array.from(lut.subarray(i, Math.min(i + 8, lut.length)));
      lutLines.push('  DB ' + slice.map(b => '#' + b.toString(16).toUpperCase().padStart(2, '0')).join(','));
    }
    asm += lutLines.join('\n') + '\n';
  }

  // Data section
  asm += '\n';

  if (isType2) {
    // Type 2: frame data starts after header + FCT byte + optional fill pattern
    const fctByteOffset = SCA.HEADER_SIZE;
    const fillPatternOfs = (fct === 2) ? fctByteOffset + 1 : 0;
    const frameStreamOffset = fctByteOffset + 1 + ((fct === 2) ? SCA.FILL_PATTERN_SIZE : 0);

    asm += 'ScaData:\n';
    asm += '  INCBIN "' + scaFile + '"\n';
    asm += '\n';
    asm += 'FrameStream EQU ScaData + ' + frameStreamOffset + '\n';
    if (fct === 2) {
      asm += 'FillPattern EQU ScaData + ' + fillPatternOfs + '\n';
    }
  } else {
    const delayTableOffset = SCA.HEADER_SIZE;
    const fillPatternOffset = isType1 ? SCA.HEADER_SIZE + frameCount : 0;
    const frameDataOffset = isType1
      ? SCA.HEADER_SIZE + frameCount + SCA.FILL_PATTERN_SIZE
      : SCA.HEADER_SIZE + frameCount;

    asm += 'ScaData:\n';
    asm += '  INCBIN "' + scaFile + '"\n';
    asm += '\n';
    asm += 'DelayTable EQU ScaData + ' + delayTableOffset + '\n';
    if (isType1) {
      asm += 'FillPattern EQU ScaData + ' + fillPatternOffset + '\n';
    }
    asm += 'FrameData  EQU ScaData + ' + frameDataOffset + '\n';
  }

  asm += '\n';
  asm += '  SAVESNA "' + snaFile + '", Start\n';

  return asm;
}

/**
 * Generates the main loop for type 2 uncompressed player.
 */
function generateType2UncompressedPlayer(frameCount, fct, regionCode) {
  const region = SCA.REGIONS[regionCode] || SCA.REGIONS[5];
  const hasBitmap = (fct === 0 || fct === 1);
  const hasAttrs = (fct === 1 || fct === 2);

  let asm = '';
  asm += '  IM 1\n';
  asm += '  EI\n';
  asm += '\n';
  asm += 'Restart:\n';
  asm += '  LD HL,FrameStream\n';
  asm += '  LD A,FRAME_COUNT\n';
  asm += '  LD (FramesLeft),A\n';
  asm += '\n';
  asm += 'MainLoop:\n';
  asm += '  ; Read frame header [CCCCC BBB]\n';
  asm += '  LD A,(HL)\n';
  asm += '  INC HL\n';
  asm += '  AND 7\n';
  asm += '  OUT (#FE),A         ; set border color\n';
  asm += '\n';

  if (hasBitmap) {
    asm += '  ; Copy bitmap to screen\n';
    asm += '  LD DE,SCREEN_BMP\n';
    asm += '  LD BC,BITMAP_SIZE\n';
    asm += '  LDIR\n';
  }
  if (hasAttrs) {
    asm += '  ; Copy attrs to screen\n';
    asm += '  LD DE,SCREEN_ATTR\n';
    asm += '  LD BC,ATTR_SIZE\n';
    asm += '  LDIR\n';
  }

  asm += '\n';
  asm += '  ; Read delay byte and wait\n';
  asm += '  LD A,(HL)\n';
  asm += '  INC HL\n';
  asm += '  OR A\n';
  asm += '  JR Z,.NoDelay\n';
  asm += '  LD B,A\n';
  asm += '.WaitLoop:\n';
  asm += '  HALT\n';
  asm += '  DJNZ .WaitLoop\n';
  asm += '.NoDelay:\n';
  asm += '\n';
  asm += '  LD A,(FramesLeft)\n';
  asm += '  DEC A\n';
  asm += '  LD (FramesLeft),A\n';
  asm += '  JR NZ,MainLoop\n';
  asm += '  JR Restart\n';
  asm += '\n';
  asm += 'FramesLeft:\n';
  asm += '  DB 0\n';

  return asm;
}

/**
 * Generates the main loop for type 2 compressed player.
 *
 * Bitmap and attrs are compressed as separate blocks in the SCA stream,
 * so each is decompressed directly to its screen address — no buffer needed.
 */
function generateType2CompressedPlayer(frameCount, fct, regionCode, compressionType) {
  const region = SCA.REGIONS[regionCode] || SCA.REGIONS[5];
  const isChunks = (compressionType === 4 || compressionType === 5);
  const hasBitmap = isChunks ? true : (fct === 0 || fct === 1);
  const hasAttrs = isChunks ? false : (fct === 1 || fct === 2);
  const depackCall = compressionType === 1 ? 'Dzx0' : compressionType === 3 ? 'DeRle' : 'DeLc';

  let asm = '';
  asm += '  IM 1\n';
  asm += '  EI\n';
  asm += '\n';
  asm += 'Restart:\n';
  asm += '  LD HL,FrameStream\n';
  asm += '  LD A,FRAME_COUNT\n';
  asm += '  LD (FramesLeft),A\n';
  asm += '\n';
  asm += 'MainLoop:\n';
  asm += '  ; Read frame header [CCCCC BBB]\n';
  asm += '  LD A,(HL)\n';
  asm += '  INC HL\n';
  asm += '  AND 7\n';
  asm += '  OUT (#FE),A         ; set border color\n';
  asm += '\n';

  if (isChunks) {
    // Chunks: per-frame data is just encoded bytes, LUT is embedded once
    const deChunksCall = compressionType === 4 ? 'DeChunks4x4' : 'DeChunks4x2';
    const thirdCount = region.charRows / 8;
    asm += '  DI\n';
    asm += '  LD IX,ChunksLUT\n';
    asm += '  LD DE,SCREEN_BMP\n';
    asm += '  LD C,' + thirdCount + '             ; number of thirds\n';
    asm += '  CALL ' + deChunksCall + '\n';
    asm += '  EI\n';
    asm += '  ; HL now past encoded data\n';
  } else {
    // Bitmap and attrs are compressed as separate blocks, so each can be
    // decompressed directly to its screen address — no intermediate buffer needed
    if (hasBitmap) {
      asm += '  ; Decompress bitmap directly to screen\n';
      asm += '  LD DE,SCREEN_BMP\n';
      asm += '  CALL ' + depackCall + '\n';
    }
    if (hasAttrs) {
      asm += '  ; Decompress attrs directly to screen\n';
      asm += '  LD DE,SCREEN_ATTR\n';
      asm += '  CALL ' + depackCall + '\n';
    }
  }
  asm += '  ; HL now past compressed data, pointing at delay byte\n';

  asm += '\n';
  asm += '  ; Read delay byte and wait\n';
  asm += '  LD A,(HL)\n';
  asm += '  INC HL\n';
  asm += '  OR A\n';
  asm += '  JR Z,.NoDelay\n';
  asm += '  LD B,A\n';
  asm += '.WaitLoop:\n';
  asm += '  HALT\n';
  asm += '  DJNZ .WaitLoop\n';
  asm += '.NoDelay:\n';
  asm += '\n';
  asm += '  LD A,(FramesLeft)\n';
  asm += '  DEC A\n';
  asm += '  LD (FramesLeft),A\n';
  asm += '  JR NZ,MainLoop\n';
  asm += '  JR Restart\n';
  asm += '\n';
  asm += 'FramesLeft:\n';
  asm += '  DB 0\n';

  return asm;
}

/**
 * Returns Z80 assembly source for the standard ZX0 depacker (forward mode).
 * Entry: HL = compressed data, DE = destination
 * Exit: HL = past end of compressed data
 * Based on the standard dzx0_standard.asm by Einar Saukas.
 */
function generateZx0Depacker() {
  // Canonical dzx0_standard.asm by Einar Saukas & Urusergi (68 bytes)
  // https://github.com/einar-saukas/ZX0/blob/main/z80/dzx0_standard.asm
  let asm = '';
  asm += '; dzx0_standard - ZX0 decompressor by Einar Saukas & Urusergi\n';
  asm += '; HL = source (compressed data), DE = destination\n';
  asm += '; Uses: A, BC, DE, HL, AF\', stack (2 bytes)\n';
  asm += '\n';
  asm += 'Dzx0:\n';
  asm += '        ld      bc, #ffff\n';
  asm += '        push    bc\n';
  asm += '        inc     bc\n';
  asm += '        ld      a, #80\n';
  asm += 'dzx0s_literals:\n';
  asm += '        call    dzx0s_elias\n';
  asm += '        ldir\n';
  asm += '        add     a, a\n';
  asm += '        jr      c, dzx0s_new_offset\n';
  asm += '        call    dzx0s_elias\n';
  asm += 'dzx0s_copy:\n';
  asm += '        ex      (sp), hl\n';
  asm += '        push    hl\n';
  asm += '        add     hl, de\n';
  asm += '        ldir\n';
  asm += '        pop     hl\n';
  asm += '        ex      (sp), hl\n';
  asm += '        add     a, a\n';
  asm += '        jr      nc, dzx0s_literals\n';
  asm += 'dzx0s_new_offset:\n';
  asm += '        pop     bc\n';
  asm += '        ld      c, #fe\n';
  asm += '        call    dzx0s_elias_loop\n';
  asm += '        inc     c\n';
  asm += '        ret     z\n';
  asm += '        ld      b, c\n';
  asm += '        ld      c, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        rr      b\n';
  asm += '        rr      c\n';
  asm += '        push    bc\n';
  asm += '        ld      bc, 1\n';
  asm += '        call    nc, dzx0s_elias_backtrack\n';
  asm += '        inc     bc\n';
  asm += '        jr      dzx0s_copy\n';
  asm += 'dzx0s_elias:\n';
  asm += '        inc     c\n';
  asm += 'dzx0s_elias_loop:\n';
  asm += '        add     a, a\n';
  asm += '        jr      nz, dzx0s_elias_skip\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        rla\n';
  asm += 'dzx0s_elias_skip:\n';
  asm += '        ret     c\n';
  asm += 'dzx0s_elias_backtrack:\n';
  asm += '        add     a, a\n';
  asm += '        rl      c\n';
  asm += '        rl      b\n';
  asm += '        jr      dzx0s_elias_loop\n';
  asm += '\n';
  return asm;
}

/**
 * Returns Z80 assembly source for the Laser Compact 5.2 depacker.
 * Entry: HL = compressed data, DE = destination
 * Exit: HL = past end of compressed data
 */
function generateLcDepacker() {
  // Laser Compact 5.2 depacker for Z80
  // Based on the decompression algorithm from lc.js by Hrumer
  //
  // Design:
  // - lc_bits (memory) holds the bit buffer with sentinel approach
  // - lc_getbit: loads buffer, shifts, stores back, returns bit in carry
  //   It TRASHES A but preserves all other registers.
  // - VLC and main loop use C to accumulate VLC data bits.
  // - HL = source stream pointer (saved to lc_src during match copy)
  // - DE = destination pointer
  //
  // Entry: HL = compressed data, DE = destination
  // Exit:  HL past compressed data, DE past decompressed data
  let asm = '';
  asm += '; Laser Compact 5.2 depacker\n';
  asm += '; Entry: HL = compressed data, DE = destination\n';
  asm += '; Exit:  HL past compressed data, DE past decompressed data\n';
  asm += '; Uses:  AF, BC, DE, HL\n';
  asm += '\n';
  asm += 'DeLc:\n';
  asm += '        ld      a, #80\n';
  asm += '        ld      (lc_bits), a    ; init bit buffer (sentinel)\n';
  asm += '        ; First byte is always literal\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        ld      (de), a\n';
  asm += '        inc     de\n';
  asm += '\n';
  asm += 'lc_main:\n';
  asm += '        call    lc_getbit       ; C=1: literal, C=0: match\n';
  asm += '        jr      nc, lc_match\n';
  asm += '        ; Literal\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        ld      (de), a\n';
  asm += '        inc     de\n';
  asm += '        jr      lc_main\n';
  asm += '\n';
  asm += 'lc_match:\n';
  asm += '        call    lc_vlc          ; A = VLC code (0..22)\n';
  asm += '        cp      6\n';
  asm += '        jr      nz, lc_not_ext\n';
  asm += '        ; Code 6: extended length or end marker\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        neg\n';
  asm += '        ret     z               ; end marker\n';
  asm += '        jr      lc_got_msize\n';
  asm += 'lc_not_ext:\n';
  asm += '        cp      6               ; only codes 0..5 need +1\n';
  asm += '        jr      nc, lc_got_msize ; codes 7..22 used as-is\n';
  asm += '        inc     a               ; codes 0..5 => 1..6\n';
  asm += 'lc_got_msize:\n';
  asm += '        ; A = extra match bytes (total copy = A + 1)\n';
  asm += '        ld      (lc_msize), a\n';
  asm += '        ; Offset high\n';
  asm += '        call    lc_vlc          ; A = mofsHi\n';
  asm += '        inc     a\n';
  asm += '        ld      b, a            ; B = offset high part\n';
  asm += '        ; Direction bit\n';
  asm += '        call    lc_getbit       ; carry = dir (0=fwd, 1=bwd)\n';
  asm += '        ld      a, 0\n';
  asm += '        rla\n';
  asm += '        ld      (lc_dir), a\n';
  asm += '        ; Offset low byte from stream\n';
  asm += '        ld      c, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        ; offset = B*256 - C\n';
  asm += '        ld      a, c\n';
  asm += '        neg                     ; A = (-C) & FF\n';
  asm += '        ld      c, a\n';
  asm += '        jr      z, lc_no_borr\n';
  asm += '        dec     b\n';
  asm += 'lc_no_borr:\n';
  asm += '        ; BC = offset value\n';
  asm += '        ; If offset > #300, msize++\n';
  asm += '        ld      a, b\n';
  asm += '        cp      4\n';
  asm += '        jr      nc, lc_extra\n';
  asm += '        cp      3\n';
  asm += '        jr      c, lc_do_copy\n';
  asm += '        ld      a, c\n';
  asm += '        or      a\n';
  asm += '        jr      z, lc_do_copy\n';
  asm += 'lc_extra:\n';
  asm += '        ld      a, (lc_msize)\n';
  asm += '        inc     a\n';
  asm += '        ld      (lc_msize), a\n';
  asm += '\n';
  asm += 'lc_do_copy:\n';
  asm += '        ; BC=offset, HL=stream, DE=dest\n';
  asm += '        ld      (lc_src), hl    ; save stream ptr\n';
  asm += '        ; HL = DE - BC (match base)\n';
  asm += '        ld      h, d\n';
  asm += '        ld      l, e\n';
  asm += '        or      a\n';
  asm += '        sbc     hl, bc\n';
  asm += '        ; Copy first byte\n';
  asm += '        ld      a, (hl)\n';
  asm += '        ld      (de), a\n';
  asm += '        inc     de\n';
  asm += '        ; Remaining\n';
  asm += '        ld      a, (lc_msize)\n';
  asm += '        or      a\n';
  asm += '        jr      z, lc_cdone\n';
  asm += '        ld      b, a\n';
  asm += '        ld      a, (lc_dir)\n';
  asm += '        or      a\n';
  asm += '        jr      nz, lc_cbwd\n';
  asm += 'lc_cfwd:\n';
  asm += '        inc     hl\n';
  asm += '        ld      a, (hl)\n';
  asm += '        ld      (de), a\n';
  asm += '        inc     de\n';
  asm += '        djnz    lc_cfwd\n';
  asm += '        jr      lc_cdone\n';
  asm += 'lc_cbwd:\n';
  asm += '        dec     hl\n';
  asm += '        ld      a, (hl)\n';
  asm += '        ld      (de), a\n';
  asm += '        inc     de\n';
  asm += '        djnz    lc_cbwd\n';
  asm += 'lc_cdone:\n';
  asm += '        ld      hl, (lc_src)\n';
  asm += '        jr      lc_main\n';
  asm += '\n';
  asm += '; ---- VLC reader ----\n';
  asm += '; Returns decoded value in A (0..22). Trashes C.\n';
  asm += '; VLC: 1=>0, 0d1=>2-d, 00dd1=>6-dd, 000dddd=>22-dddd\n';
  asm += '; Note: lc_getbit trashes A but preserves carry and all other regs.\n';
  asm += '; Strategy: after getbit, carry holds the bit. Load A from C, then RLA.\n';
  asm += 'lc_vlc:\n';
  asm += '        call    lc_getbit       ; carry = terminator/flag bit\n';
  asm += '        jr      nc, lc_v1\n';
  asm += '        xor     a               ; value = 0\n';
  asm += '        ret\n';
  asm += 'lc_v1:  ; 1st data bit\n';
  asm += '        call    lc_getbit       ; carry = data bit\n';
  asm += '        ld      a, 0\n';
  asm += '        rla                     ; A = carry = d0\n';
  asm += '        ld      c, a            ; C = accumulated (1 bit)\n';
  asm += '        call    lc_getbit       ; carry = terminator?\n';
  asm += '        jr      nc, lc_v2\n';
  asm += '        ; Terminated: value = 2 - C\n';
  asm += '        ld      a, 2\n';
  asm += '        sub     c\n';
  asm += '        ret                     ; 1..2\n';
  asm += 'lc_v2:  ; 2nd data bit\n';
  asm += '        call    lc_getbit       ; carry = data bit\n';
  asm += '        ld      a, c            ; A = prev accumulated\n';
  asm += '        rla                     ; shift carry in: A = d0:d1\n';
  asm += '        ld      c, a\n';
  asm += '        call    lc_getbit       ; carry = terminator?\n';
  asm += '        jr      nc, lc_v3\n';
  asm += '        ; Terminated: value = 6 - (C & 3)\n';
  asm += '        ld      a, c\n';
  asm += '        and     3\n';
  asm += '        ld      c, a\n';
  asm += '        ld      a, 6\n';
  asm += '        sub     c\n';
  asm += '        ret                     ; 3..6\n';
  asm += 'lc_v3:  ; 3rd data bit\n';
  asm += '        call    lc_getbit\n';
  asm += '        ld      a, c\n';
  asm += '        rla\n';
  asm += '        ld      c, a\n';
  asm += '        ; 4th data bit (no terminator for 4-bit group)\n';
  asm += '        call    lc_getbit\n';
  asm += '        ld      a, c\n';
  asm += '        rla\n';
  asm += '        ; value = 22 - (A & 15)\n';
  asm += '        and     15\n';
  asm += '        ld      c, a\n';
  asm += '        ld      a, 22\n';
  asm += '        sub     c\n';
  asm += '        ret                     ; 7..22\n';
  asm += '\n';
  asm += '; ---- Bit reader ----\n';
  asm += '; Returns bit in carry. Trashes A only.\n';
  asm += '; Bit buffer in memory (lc_bits), MSB-first, sentinel in bit 0.\n';
  asm += 'lc_getbit:\n';
  asm += '        ld      a, (lc_bits)\n';
  asm += '        add     a, a            ; shift out MSB to carry\n';
  asm += '        ld      (lc_bits), a\n';
  asm += '        ret     nz              ; sentinel still present\n';
  asm += '        ; Buffer exhausted, carry holds last valid bit\n';
  asm += '        ; Refill from stream: read byte, use it as next 8 bits\n';
  asm += '        ; Current carry is our result (was the sentinel bit)\n';
  asm += '        ; Wait - if A became 0 from the shift, that means the\n';
  asm += '        ; sentinel was just shifted out. The carry IS the bit.\n';
  asm += '        ; We need to refill for NEXT call, not this one.\n';
  asm += '        ; After add a,a: if result=0, the bit that went to carry\n';
  asm += '        ; was the sentinel (1). But that means we already consumed\n';
  asm += '        ; all real bits and the sentinel itself went to carry.\n';
  asm += '        ; That\'s wrong - sentinel should never be returned as data.\n';
  asm += '        ;\n';
  asm += '        ; Correct sentinel approach:\n';
  asm += '        ; Buffer byte: [d7 d6 d5 d4 d3 d2 d1 1] (sentinel=1 at end)\n';
  asm += '        ; Shift out d7 first. After 7 shifts: [1 0 0 0 0 0 0 0]\n';
  asm += '        ; 8th shift: carry=1 (sentinel), A=0 -> detect exhaustion\n';
  asm += '        ; So we should NOT return carry here (it\'s sentinel)\n';
  asm += '        ; Instead: refill and get first bit of new byte.\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        scf                     ; set sentinel\n';
  asm += '        rla                     ; bit7->carry(result), sentinel->bit0\n';
  asm += '                                ; A = [d6 d5 d4 d3 d2 d1 d0 1]\n';
  asm += '        ld      (lc_bits), a\n';
  asm += '        ret                     ; carry = bit7 of fresh byte\n';
  asm += '\n';
  asm += '; Variables\n';
  asm += 'lc_bits:  db 0\n';
  asm += 'lc_msize: db 0\n';
  asm += 'lc_dir:   db 0\n';
  asm += 'lc_src:   dw 0\n';
  asm += '\n';
  return asm;
}

/**
 * Generates Z80 RLE depacker (~23 bytes).
 * Entry: HL = compressed data, DE = destination
 * Exit:  HL past compressed data, DE past decompressed data
 */
function generateRleDepacker() {
  let asm = '';
  asm += '; RLE depacker (PackBits-style)\n';
  asm += '; Entry: HL = compressed data, DE = destination\n';
  asm += '; Exit:  HL past compressed data, DE past decompressed data\n';
  asm += '; Uses:  AF, BC, DE, HL\n';
  asm += '\n';
  asm += 'DeRle:\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '        or      a\n';
  asm += '        ret     z               ; end marker\n';
  asm += '        jp      m, .rle_rep     ; bit 7 = repeat\n';
  asm += '        ; Literal run: copy A bytes\n';
  asm += '        ld      c, a\n';
  asm += '        ld      b, 0\n';
  asm += '        ldir\n';
  asm += '        jr      DeRle\n';
  asm += '.rle_rep:\n';
  asm += '        sub     126             ; repeat count (2..129)\n';
  asm += '        ld      b, a\n';
  asm += '        ld      a, (hl)\n';
  asm += '        inc     hl\n';
  asm += '.rle_lp:\n';
  asm += '        ld      (de), a\n';
  asm += '        inc     de\n';
  asm += '        djnz    .rle_lp\n';
  asm += '        jr      DeRle\n';
  asm += '\n';
  return asm;
}

/**
 * Exports SCA as ZIP containing .sca file + .asm player source
 */
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initScaEditor);
