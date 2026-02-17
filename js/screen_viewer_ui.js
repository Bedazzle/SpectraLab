// SpectraLab v1.30.0 - UI Event Handlers
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
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.slw')) {
        // SpectraLab Workspace file
        if (typeof loadWorkspace === 'function') {
          loadWorkspace(file);
        }
      } else if (lowerName.endsWith('.slp')) {
        // SpectraLab Project file
        if (typeof loadProject === 'function') {
          loadProject(file);
        }
      } else if (typeof isImageFile === 'function' && isImageFile(file.name)) {
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

  // Grid size dropdown handler
  document.getElementById('gridSizeSelect')?.addEventListener('change', function() {
    gridSize = parseInt(/** @type {HTMLSelectElement} */ (this).value, 10);
    if (typeof editorRender === 'function' && editorActive) {
      editorRender();
    } else {
      renderScreen();
    }
    saveSettings();
  });

  // Subgrid size dropdown handler
  document.getElementById('subgridSizeSelect')?.addEventListener('change', function() {
    subgridSize = parseInt(/** @type {HTMLSelectElement} */ (this).value, 10);
    if (typeof editorRender === 'function' && editorActive) {
      editorRender();
    } else {
      renderScreen();
    }
    saveSettings();
  });

  // Border grid size dropdown handler
  document.getElementById('borderGridSizeSelect')?.addEventListener('change', function() {
    borderGridSize = parseInt(/** @type {HTMLSelectElement} */ (this).value, 10);
    if (typeof editorRender === 'function' && editorActive) {
      editorRender();
    } else {
      renderScreen();
    }
    saveSettings();
  });

  // Border subgrid size dropdown handler
  document.getElementById('borderSubgridSizeSelect')?.addEventListener('change', function() {
    borderSubgridSize = parseInt(/** @type {HTMLSelectElement} */ (this).value, 10);
    if (typeof editorRender === 'function' && editorActive) {
      editorRender();
    } else {
      renderScreen();
    }
    saveSettings();
  });

  // Attrs checkbox handler
  document.getElementById('showAttrsCheckbox')?.addEventListener('change', function() {
    showAttributes = /** @type {HTMLInputElement} */ (this).checked;
    renderScreen();
    if (typeof renderPreview === 'function') renderPreview();
    saveSettings();
  });

  // Preview checkbox handler
  document.getElementById('showPreviewCheckbox')?.addEventListener('change', function() {
    if (typeof setPreviewVisible === 'function') {
      setPreviewVisible(/** @type {HTMLInputElement} */ (this).checked);
    }
  });

  // 53c pattern select handler
  document.getElementById('pattern53cSelect')?.addEventListener('change', function() {
    renderScreen();
    if (typeof renderPreview === 'function') renderPreview();
    saveSettings();
  });

  // RGB3 flicker checkbox handler
  document.getElementById('flickerRgb3Checkbox')?.addEventListener('change', function() {
    if (typeof setRgb3FlickerEnabled === 'function') {
      setRgb3FlickerEnabled(/** @type {HTMLInputElement} */ (this).checked);
    }
  });

  // Gigascreen mode select handler
  document.getElementById('gigascreenModeSelect')?.addEventListener('change', function() {
    if (typeof setGigascreenMode === 'function') {
      setGigascreenMode(/** @type {HTMLSelectElement} */ (this).value);
    }
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

  // New Picture dialog
  const newPictureDialogLocal = document.getElementById('newPictureDialog');
  const newPictureFormat = /** @type {HTMLSelectElement|null} */ (document.getElementById('newPictureFormat'));
  const newPictureOkBtn = document.getElementById('newPictureOkBtn');
  const newPictureCancelBtn = document.getElementById('newPictureCancelBtn');

  newPictureCancelBtn?.addEventListener('click', function() {
    if (newPictureDialogLocal) newPictureDialogLocal.style.display = 'none';
  });

  // New Picture button (next to Browse)
  const newPictureBtn = document.getElementById('newPictureBtn');
  newPictureBtn?.addEventListener('click', function() {
    if (newPictureDialogLocal) newPictureDialogLocal.style.display = '';
  });

  // Close on ESC key (handled globally), not on click outside

  newPictureOkBtn?.addEventListener('click', function() {
    if (newPictureDialogLocal) newPictureDialogLocal.style.display = 'none';
    const format = newPictureFormat ? newPictureFormat.value : 'scr';
    if (typeof createNewPicture === 'function') {
      createNewPicture(format);
    }
    // Switch to Edit tab after creating new picture
    const editTab = document.querySelector('.panel-tab[data-tab="edit"]');
    if (editTab) {
      /** @type {HTMLElement} */ (editTab).click();
    }
  });

  // Mouse wheel zoom handler
  const canvasContainer = document.getElementById('canvasContainer');
  canvasContainer?.addEventListener('wheel', function(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();

    // Available zoom levels matching the dropdown
    const zoomLevels = [1, 2, 3, 4, 5, 6, 8, 10, 20];
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

  // Help dialog
  const helpDialog = document.getElementById('helpDialog');
  const helpCloseBtn = document.getElementById('helpCloseBtn');
  const helpTabs = document.querySelectorAll('.help-tab');
  const helpTabContents = document.querySelectorAll('.help-tab-content');

  helpBtn?.addEventListener('click', function() {
    if (helpDialog) helpDialog.style.display = '';
  });

  helpCloseBtn?.addEventListener('click', function() {
    if (helpDialog) helpDialog.style.display = 'none';
  });

  // Tab switching
  helpTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      // Update active tab button
      helpTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      // Show corresponding content
      helpTabContents.forEach(content => {
        content.style.display = content.id === `helpTab-${tabName}` ? '' : 'none';
      });
    });
  });

  // Panel tab switching (View/Tools)
  const panelTabs = document.querySelectorAll('.panel-tab');
  const panelTabContents = document.querySelectorAll('.panel-tab-content');
  const newPictureDialog = document.getElementById('newPictureDialog');

  panelTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.dataset.tab;

      // If clicking Edit tab with SCA loaded, trigger SCA editor instead
      if (tabName === 'edit' && typeof currentFormat !== 'undefined' && currentFormat === FORMAT.SCA) {
        if (typeof enterEditMode === 'function') {
          enterEditMode();
        }
        return; // SCA editor handles its own UI
      }

      // If switching to Edit or Transform tab without an editable picture, show New Picture dialog
      if (tabName === 'edit' || tabName === 'transform') {
        const canEdit = typeof isFormatEditable === 'function' && isFormatEditable() &&
                        typeof screenData !== 'undefined' && screenData &&
                        (screenData.length > 0 || (typeof currentFormat !== 'undefined' && currentFormat === FORMAT.SPECSCII));
        if (!canEdit && newPictureDialog) {
          newPictureDialog.style.display = '';
          return; // Don't switch tab yet
        }
      }

      // Update active tab button
      panelTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      // Show corresponding content
      panelTabContents.forEach(content => {
        content.classList.toggle('active', content.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      });
    });
  });

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  document.addEventListener('keydown', function(event) {
    // Ignore if typing in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Use event.key for numbers, special chars, and control keys
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

      case 'Escape':
        // Close dialogs if open
        if (helpDialog && helpDialog.style.display !== 'none') {
          helpDialog.style.display = 'none';
          event.preventDefault();
        } else if (newPictureDialog && newPictureDialog.style.display !== 'none') {
          newPictureDialog.style.display = 'none';
          event.preventDefault();
        }
        break;
    }

    // Use event.code for layout-independent letter shortcuts (works with non-Latin keyboards)

    // ~: Toggle preview panel (Shift+Backquote for layout independence)
    if (event.shiftKey && event.code === 'Backquote') {
      // Skip if editor handles it
      if (typeof editorActive !== 'undefined' && editorActive) return;
      if (typeof togglePreviewPanel === 'function') {
        togglePreviewPanel();
      }
      return;
    }

    switch (event.code) {
      case 'KeyG':
        // Cycle grid size: 0 -> 8 -> 16 -> 24 -> 0
        const gridSizes = [0, 8, 16, 24];
        const currentIdx = gridSizes.indexOf(gridSize);
        gridSize = gridSizes[(currentIdx + 1) % gridSizes.length];
        if (gridSizeSelect) gridSizeSelect.value = String(gridSize);
        if (typeof editorRender === 'function' && editorActive) {
          editorRender();
        } else {
          renderScreen();
        }
        saveSettings();
        break;

      case 'KeyF':
        // Toggle flash
        if (flashCheckbox) {
          flashCheckbox.checked = !flashCheckbox.checked;
          setFlashEnabled(flashCheckbox.checked);
        }
        break;
    }
  });

  // Set app title with version
  const appTitle = document.getElementById('appTitle');
  if (appTitle && typeof APP_VERSION !== 'undefined') {
    appTitle.textContent = 'SpectraLab v' + APP_VERSION;
  }

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
