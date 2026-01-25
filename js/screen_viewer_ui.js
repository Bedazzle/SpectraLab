// SpectraLab v1.8.0 - UI Event Handlers
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
      if (isZipFile(file.name)) {
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

  // 53c pattern select handler
  document.getElementById('pattern53cSelect')?.addEventListener('change', function() {
    renderScreen();
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
    const helpText = `SpectraLab v1.10.0

Keyboard Shortcuts (Viewer):
  1-5   : Set zoom level (x1 to x5)
  F     : Toggle flash animation
  G     : Toggle grid overlay
  Space : Play/Pause animation (SCA)
  Left  : Previous frame (SCA)
  Right : Next frame (SCA)

Keyboard Shortcuts (SCA Editor):
  Left/Right : Navigate frames (with wrap)
  Space      : Play/Pause
  Del/Backspace : Toggle frame deletion
  Ctrl+Click : Toggle frame deletion

SCA Editor Features:
  - Trim frames from start/end
  - Delete individual frames (Ctrl+click)
  - Adjust frame delays (per-frame or all)
  - Remove consecutive duplicate frames
  - Remove loop frame (when last = first)

Supported Formats:
  .scr      6912 bytes  Standard screen
  .scr      6144 bytes  Monochrome full
  .scr      4096 bytes  Monochrome 2/3
  .scr      2048 bytes  Monochrome 1/3
  .53c/.atr  768 bytes  Attributes only
  .bsc     11136 bytes  Border screen
  .ifl      9216 bytes  8x2 multicolor
  .bmc4    11904 bytes  Border + 8x4 multicolor
  .mlt/.mc 12288 bytes  8x1 multicolor
  .3       18432 bytes  Tricolor RGB
  .specscii  var bytes  Text mode with colors
  .sca       var bytes  Animation (frames)
  .zip                  Archive (auto-extract)`;
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
        // Left arrow: Previous SCA frame
        if (currentFormat === FORMAT.SCA) {
          event.preventDefault();
          prevScaFrame();
        }
        break;

      case 'ArrowRight':
        // Right arrow: Next SCA frame
        if (currentFormat === FORMAT.SCA) {
          event.preventDefault();
          nextScaFrame();
        }
        break;
    }
  });

  // Load ROM font on startup
  loadRomFont();

  // Load palettes from JSON
  loadPalettes();

  // Load saved settings
  loadSettings();

  // Initial render
  renderScreen();
}

// Initialize when DOM is ready
initScreenViewerUI();
