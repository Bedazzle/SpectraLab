// SCA Editor v1.38.0 - Animation trimming, optimization, frame deletion, payload type 1 support
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
  document.getElementById('editSaveBtn')?.addEventListener('click', saveTrimmedSca);
  document.getElementById('exportScrBtn')?.addEventListener('click', exportToScrSeries);
  document.getElementById('export53cBtn')?.addEventListener('click', exportTo53cSeries);

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

  const frameOffset = scaHeader.frameDataStart + (frameIndex * scaHeader.frameSize);
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  if (scaHeader.payloadType === 1 && scaHeader.fillPattern) {
    // Payload type 1: attribute-only frames with fill pattern
    const fillPattern = scaHeader.fillPattern;

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
      // Scroll into view
      frame.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
 * Gets the trimmed frame index for a given original frame index
 * @param {number} originalIndex - Original frame index
 * @returns {number} Trimmed frame index or -1 if marked
 */
function getTrimmedFrameIndex(originalIndex) {
  if (isFrameMarked(originalIndex)) return -1;
  return originalIndex - editTrimStart;
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
function saveTrimmedSca() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot save: no frames remaining after trim.');
    return;
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

  // Create download
  const blob = new Blob([newData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = newFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports remaining frames as a series of SCR files in a ZIP
 */
async function exportToScrSeries() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot export: no frames remaining.');
    return;
  }

  // Check if JSZip is available
  if (typeof JSZip === 'undefined') {
    alert('JSZip library not available for export.');
    return;
  }

  const zip = new JSZip();
  const baseName = currentFileName.replace(/\.sca$/i, '');
  const isType1 = scaHeader.payloadType === 1;
  const frameSize = scaHeader.frameSize;

  // Determine padding width (3 digits for ≤1000 frames, 4 for more)
  const padWidth = trimmedCount > 1000 ? 4 : 3;

  // Export each non-deleted frame
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
      const fileName = `${baseName}_${indexStr}.scr`;

      zip.file(fileName, scrData);
      exportIndex++;
    }
  }

  // Generate and download ZIP
  try {
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_frames.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error creating ZIP file: ' + error.message);
  }
}

/**
 * Exports remaining frames as a series of 53c files in a ZIP
 */
async function exportTo53cSeries() {
  if (!scaHeader || !screenData) return;

  const trimmedCount = getTrimmedFrameCount();
  if (trimmedCount === 0) {
    alert('Cannot export: no frames remaining.');
    return;
  }

  // Check if JSZip is available
  if (typeof JSZip === 'undefined') {
    alert('JSZip library not available for export.');
    return;
  }

  const zip = new JSZip();
  const baseName = currentFileName.replace(/\.sca$/i, '');
  const isType1 = scaHeader.payloadType === 1;
  const frameSize = scaHeader.frameSize;

  // Determine padding width (3 digits for ≤1000 frames, 4 for more)
  const padWidth = trimmedCount > 1000 ? 4 : 3;

  // Export each non-deleted frame
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
      const fileName = `${baseName}_${indexStr}.53c`;

      zip.file(fileName, attrData);
      exportIndex++;
    }
  }

  // Generate and download ZIP
  try {
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_attrs.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error creating ZIP file: ' + error.message);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initScaEditor);
