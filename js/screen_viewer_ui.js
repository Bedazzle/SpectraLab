// SpectraLab v1.20.0 - UI Event Handlers
// @ts-check
"use strict";

// ============================================================================
// DOM Elements (local to UI)
// ============================================================================

const inputFile = document.getElementById('inputFile');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const helpBtn = document.getElementById('helpBtn');

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the SpectraLab UI
 */
function initScreenViewerUI() {
  // Cache elements from main script
  cacheElements();

  // Initialize theme colors (if theme_manager.js is loaded)
  if (typeof updateThemeColors === 'function') {
    updateThemeColors();
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // File input handler
  inputFile?.addEventListener('change', function(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const file = target.files?.[0];
    if (file) {
      if (typeof isImageFile === 'function' && isImageFile(file.name)) {
        openImportDialog(file);
      } else if (isZipFile(file.name)) {
        handleZipFile(file);
      } else {
        loadScreenFile(file);
      }
    }
    // Remove focus so keyboard shortcuts work immediately
    /** @type {HTMLElement} */ (document.activeElement)?.blur();
    screenCanvas?.focus();
  });

  // Zoom select handler
  zoomSelect?.addEventListener('change', function() {
    setZoom(parseInt(this.value, 10));
  });

  // Border color select handler
  borderColorSelect?.addEventListener('change', function() {
    setBorderColor(parseInt(this.value, 10));
  });

  // Border size select handler
  borderSizeSelect?.addEventListener('change', function() {
    setBorderSize(parseInt(this.value, 10));
  });

  // Grid checkbox handler
  showGridCheckbox?.addEventListener('change', function() {
    renderScreen();
    saveSettings();
  });

  // Attrs checkbox handler
  document.getElementById('showAttrsCheckbox')?.addEventListener('change', function() {
    showAttributes = /** @type {HTMLInputElement} */ (this).checked;
    renderScreen();
    if (typeof renderPreview === 'function') renderPreview();
    saveSettings();
  });

  // 53c pattern select handler
  document.getElementById('pattern53cSelect')?.addEventListener('change', function() {
    renderScreen();
    if (typeof renderPreview === 'function') renderPreview();
    saveSettings();
  });

  // Palette select handler
  document.getElementById('paletteSelect')?.addEventListener('change', function() {
    setPalette(/** @type {HTMLSelectElement} */ (this).value);
    saveSettings();
  });

  // Canvas click handler - focus canvas for keyboard shortcuts
  screenCanvas?.addEventListener('click', function() {
    screenCanvas.focus();
  });

  // New Picture button and dialog
  const newPictureBtn = document.getElementById('newPictureBtn');
  const newPictureDialog = document.getElementById('newPictureDialog');
  const newPictureFormat = /** @type {HTMLSelectElement|null} */ (document.getElementById('newPictureFormat'));
  const newPictureOkBtn = document.getElementById('newPictureOkBtn');
  const newPictureCancelBtn = document.getElementById('newPictureCancelBtn');

  newPictureBtn?.addEventListener('click', function() {
    if (newPictureDialog) newPictureDialog.style.display = '';
  });

  newPictureCancelBtn?.addEventListener('click', function() {
    if (newPictureDialog) newPictureDialog.style.display = 'none';
  });

  newPictureDialog?.addEventListener('click', function(e) {
    if (e.target === newPictureDialog) newPictureDialog.style.display = 'none';
  });

  newPictureOkBtn?.addEventListener('click', function() {
    if (newPictureDialog) newPictureDialog.style.display = 'none';
    const format = newPictureFormat ? newPictureFormat.value : 'scr';
    if (typeof createNewPicture === 'function') {
      createNewPicture(format);
    }
  });

  // Mouse wheel zoom handler
  const canvasContainer = document.getElementById('canvasContainer');
  canvasContainer?.addEventListener('wheel', function(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();

    // Available zoom levels matching the dropdown
    const zoomLevels = [1, 2, 3, 4, 5, 6, 8, 10];
    const currentIndex = zoomLevels.indexOf(zoom);
    let newIndex;
    if (event.deltaY < 0) {
      // Scroll up = zoom in
      newIndex = Math.min(currentIndex + 1, zoomLevels.length - 1);
    } else {
      // Scroll down = zoom out
      newIndex = Math.max(currentIndex - 1, 0);
    }
    if (zoomLevels[newIndex] !== zoom) {
      const newZoom = zoomLevels[newIndex];
      if (zoomSelect) zoomSelect.value = String(newZoom);
      setZoom(newZoom);
    }
  }, { passive: false });

  // Flash checkbox handler
  flashCheckbox?.addEventListener('change', function() {
    setFlashEnabled(this.checked);
  });

  // Font file input handler
  fontFileInput?.addEventListener('change', function(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const file = target.files?.[0];
    if (file) {
      loadFontFile(file);
    }
    // Remove focus so keyboard shortcuts work immediately
    /** @type {HTMLElement} */ (document.activeElement)?.blur();
    screenCanvas?.focus();
  });

  // Font browse button handler
  document.getElementById('fontBrowseBtn')?.addEventListener('click', function() {
    fontFileInput?.click();
  });

  // SCA animation controls
  document.getElementById('scaPlayBtn')?.addEventListener('click', toggleScaAnimation);
  document.getElementById('scaPrevBtn')?.addEventListener('click', prevScaFrame);
  document.getElementById('scaNextBtn')?.addEventListener('click', nextScaFrame);
  document.getElementById('scaFrameSlider')?.addEventListener('input', function() {
    goToScaFrame(parseInt(/** @type {HTMLInputElement} */ (this).value, 10));
  });

  // Theme toggle handler
  themeToggleBtn?.addEventListener('click', function() {
    toggleTheme(themeToggleBtn);
    renderScreen();
  });

  // Help button handler
  helpBtn?.addEventListener('click', function() {
    const helpText = `SpectraLab v1.20.0

Keyboard Shortcuts (Viewer):
  1-5        : Set zoom level (x1 to x5, x6/x8/x10 via menu)
  Ctrl+Wheel : Zoom in/out
  Arrows     : Pan canvas when zoomed in
  F          : Toggle flash animation
  G          : Toggle grid overlay
  Attrs      : Toggle monochrome view (all formats)
  Space      : Play/Pause animation (SCA)
  Left/Right : Previous/Next frame (SCA)

Keyboard Shortcuts (Screen Editor):
  P     : Pixel tool
  L     : Line tool
  R     : Rectangle tool
  C     : Fill cell tool
  A     : Recolor tool (attribute only)
  S     : Select tool (drag to select region)
  B     : Toggle bright
  [     : Decrease brush size
  ]     : Increase brush size
  Ctrl+C : Copy selection
  Ctrl+V : Paste (click to place)
  Ctrl+Z : Undo (${MAX_UNDO_LEVELS} levels)
  Ctrl+Y : Redo
  Ctrl+S : Save
  Escape : Cancel selection / paste

  Left click  = Draw with ink
  Right click = Draw with paper (erase)
  Brush: Size 1-16, shapes: Square, Round, H-line, V-line, Stroke, Back stroke
  Brush mode: Replace (default), Set, Invert — saved to localStorage
  Custom brushes: 5 slots for patterns captured from screen (max 64x64)
    Click slot = select (empty slot starts capture)
    Shift+click = capture/recapture (two clicks to select rectangle)
    Ctrl+click = clear slot
    R = Rotate 90° CW (when custom brush active, otherwise Rectangle tool)
    H = Mirror horizontal, V = Mirror vertical

  Copy/Paste:
    Select tool (S) — drag to select region (auto-copies on release)
    Ctrl+V or Paste button — enter paste mode with preview
    Click to place, Escape to cancel
    Paste respects brush mode (Replace/Set/Invert)
    Snap modes: Grid (8x8), Zero (tile from 0,0), Brush (tile from first paste), Off

Attribute Editor (.53c/.atr):
  Click/drag to paint cell attributes
  S     : Select tool (drag to select, Ctrl+V to paste)
  B     : Toggle bright
  F     : Toggle flash
  Ctrl+Z : Undo (${MAX_UNDO_LEVELS} levels)
  Ctrl+Y : Redo
  Ctrl+S : Save
  Pattern selector remains visible during editing

BSC Editor (Border Screen):
  Grid shows hidden zones (red overlay) — leftmost/rightmost 2 columns
    are typically not visible on real hardware
  Export ASM: generates sjasmplus-compatible source for Pentagon 128K

Keyboard Shortcuts (SCA Editor):
  Left/Right : Navigate frames (with wrap)
  Space      : Play/Pause
  Del/Backspace : Toggle frame deletion
  Ctrl+Click : Toggle frame deletion

Supported Formats:
  .scr      6912 bytes  Standard screen (editable)
  .scr      6144 bytes  Monochrome full
  .scr      4096 bytes  Monochrome 2/3
  .scr      2048 bytes  Monochrome 1/3
  .53c/.atr  768 bytes  Attributes only (editable)
  .bsc     11136 bytes  Border screen (editable)
  .ifl      9216 bytes  8x2 multicolor
  .bmc4    11904 bytes  Border + 8x4 multicolor
  .mlt/.mc 12288 bytes  8x1 multicolor
  .3       18432 bytes  Tricolor RGB
  .specscii  var bytes  Text mode with colors
  .sca       var bytes  Animation (frames)
  .zip                  Archive (auto-extract)

Import Formats:
  .png/.gif/.jpg/.webp/.bmp  Convert to SCR with dithering`;
    alert(helpText);
  });

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  document.addEventListener('keydown', function(event) {
    // Ignore if typing in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        // Quick zoom shortcuts
        const newZoom = parseInt(event.key, 10);
        zoomSelect.value = event.key;
        setZoom(newZoom);
        break;

      case 'g':
      case 'G':
        // Toggle grid
        showGridCheckbox.checked = !showGridCheckbox.checked;
        renderScreen();
        break;

      case 'f':
      case 'F':
        // Toggle flash
        if (flashCheckbox) {
          flashCheckbox.checked = !flashCheckbox.checked;
          setFlashEnabled(flashCheckbox.checked);
        }
        break;

      case ' ':
        // Space: Toggle SCA animation
        if (currentFormat === FORMAT.SCA) {
          event.preventDefault();
          toggleScaAnimation();
        }
        break;

      case 'ArrowLeft':
        if (currentFormat === FORMAT.SCA) {
          event.preventDefault();
          prevScaFrame();
        } else {
          // Pan canvas left
          event.preventDefault();
          const cl = document.getElementById('canvasContainer');
          if (cl) cl.scrollLeft -= 40;
        }
        break;

      case 'ArrowRight':
        if (currentFormat === FORMAT.SCA) {
          event.preventDefault();
          nextScaFrame();
        } else {
          // Pan canvas right
          event.preventDefault();
          const cr = document.getElementById('canvasContainer');
          if (cr) cr.scrollLeft += 40;
        }
        break;

      case 'ArrowUp':
        // Pan canvas up
        event.preventDefault();
        const cu = document.getElementById('canvasContainer');
        if (cu) cu.scrollTop -= 40;
        break;

      case 'ArrowDown':
        // Pan canvas down
        event.preventDefault();
        const cd = document.getElementById('canvasContainer');
        if (cd) cd.scrollTop += 40;
        break;
    }
  });

  // Load ROM font on startup
  loadRomFont();

  // Load palettes from JSON
  loadPalettes();

  // Initialize PNG import dialog
  if (typeof initPngImport === 'function') {
    initPngImport();
  }

  // Load saved settings
  loadSettings();

  // Hide format-specific controls on startup (no file loaded)
  toggleFormatControlsVisibility();

  // Initial render
  renderScreen();
}

// Initialize when DOM is ready
initScreenViewerUI();
