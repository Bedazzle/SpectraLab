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
// Theme Management
// ============================================================================

const themeColorSets = {
  dark: {
    background: '#222',
    backgroundInactive: '#111',
    foreground: '#0f0',
    foregroundInactive: '#050',
    grid: '#444',
    labels: '#060',
    highlight: 'rgba(255, 0, 255, 0.7)',
    selectionSingle: '#f0f',
    selectionRange: '#f00'
  },
  light: {
    background: '#e0e0e0',
    backgroundInactive: '#d0d0d0',
    foreground: '#006600',
    foregroundInactive: '#99cc99',
    grid: '#bbb',
    labels: '#339933',
    highlight: 'rgba(160, 0, 200, 0.7)',
    selectionSingle: '#a000c8',
    selectionRange: '#cc0000'
  }
};

/** @type {typeof themeColorSets.dark} */
// @ts-ignore - global used by screen_viewer.js getThemeColors()
var themeColors = themeColorSets.dark;

/**
 * Returns the current theme name ('dark' or 'light')
 * @returns {'dark'|'light'}
 */
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Updates themeColors global from the current data-theme attribute
 */
function updateThemeColors() {
  themeColors = themeColorSets[getCurrentTheme()];
}

/**
 * Toggles theme between dark and light, saves to localStorage, updates button icon
 * @param {Element|null} btn
 */
function toggleTheme(btn) {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  if (next === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('spectraLabTheme', next);
  updateThemeColors();
  if (btn) btn.innerHTML = next === 'light' ? '&#9788;' : '&#9790;';
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the SpectraLab UI
 */
function initScreenViewerUI() {
  // Cache elements from main script
  cacheElements();

  // Initialize theme colors and button icon
  updateThemeColors();
  if (themeToggleBtn) {
    themeToggleBtn.innerHTML = getCurrentTheme() === 'light' ? '&#9788;' : '&#9790;';
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // Shared file-routing logic for input and drag-and-drop
  function handleOpenFile(file) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.slw')) {
      if (typeof loadWorkspace === 'function') {
        loadWorkspace(file);
      }
    } else if (lowerName.endsWith('.slp')) {
      if (typeof loadProject === 'function') {
        loadProject(file);
      }
    } else if (typeof isImageFile === 'function' && isImageFile(file.name)) {
      openImportDialog(file);
    } else if (typeof isSnapshotFile === 'function' && isSnapshotFile(file.name)) {
      loadSnapshotFile(file);
    } else if (typeof isNirvanaTileFile === 'function' && isNirvanaTileFile(file.name)) {
      importNirvanaTileFile(file);
    } else if (isZipFile(file.name)) {
      handleZipFile(file);
    } else if (typeof isZxpFile === 'function' && isZxpFile(file.name)) {
      loadZxpFile(file);
    } else {
      loadScreenFile(file);
    }
  }

  // File input handler
  inputFile?.addEventListener('change', function(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const file = target.files?.[0];
    if (file) {
      handleOpenFile(file);
    }
    // Remove focus so keyboard shortcuts work immediately
    /** @type {HTMLElement} */ (document.activeElement)?.blur();
    screenCanvas?.focus();
  });

  // Drag-and-drop handler
  document.body.addEventListener('dragover', function(e) {
    e.preventDefault();
  });
  document.body.addEventListener('drop', function(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) {
      handleOpenFile(file);
    }
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
    if (typeof updateAttrPreview === 'function') updateAttrPreview();
    if (typeof build53cPalette === 'function') build53cPalette();
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

  // Restore last used format in New Picture dialog
  function restoreNewPictureFormat() {
    const saved = localStorage.getItem('spectraLabNewPictureFormat');
    if (saved && newPictureFormat) {
      const option = newPictureFormat.querySelector('option[value="' + saved + '"]');
      if (option) newPictureFormat.value = saved;
    }
  }

  // New Picture button (next to Browse)
  const newPictureBtn = document.getElementById('newPictureBtn');
  newPictureBtn?.addEventListener('click', function() {
    restoreNewPictureFormat();
    if (newPictureDialogLocal) newPictureDialogLocal.style.display = '';
  });

  // Close on ESC key (handled globally), not on click outside

  newPictureOkBtn?.addEventListener('click', function() {
    if (newPictureDialogLocal) newPictureDialogLocal.style.display = 'none';
    const format = newPictureFormat ? newPictureFormat.value : 'scr';
    localStorage.setItem('spectraLabNewPictureFormat', format);
    if (typeof createNewPicture === 'function') {
      createNewPicture(format);
    }
    // Switch to Edit tab after creating new picture
    const editTab = document.querySelector('.panel-tab[data-tab="edit"]');
    if (editTab) {
      /** @type {HTMLElement} */ (editTab).click();
    }
  });

  // Mouse wheel zoom handler — intercepts Ctrl+wheel everywhere except the
  // left sidebar, so browser zoom only triggers over the controls panel
  const canvasContainer = document.getElementById('canvasContainer');
  const leftSidebar = document.querySelector('.left-sidebar');
  let wheelZoomAccum = 0;
  const WHEEL_ZOOM_THRESHOLD = 50;
  document.addEventListener('wheel', function(event) {
    if (!event.ctrlKey) return;
    // Allow browser default zoom on the left sidebar
    if (leftSidebar && leftSidebar.contains(/** @type {Node} */ (event.target))) return;
    event.preventDefault();

    // Accumulate deltaY — trackpads send many small events per gesture
    wheelZoomAccum += event.deltaY;
    if (Math.abs(wheelZoomAccum) < WHEEL_ZOOM_THRESHOLD) return;
    const direction = wheelZoomAccum > 0 ? 1 : -1;
    wheelZoomAccum = 0;

    // Available zoom levels matching the dropdown
    const zoomLevels = [1, 2, 3, 4, 5, 6, 8, 10, 20];
    const currentIndex = zoomLevels.indexOf(zoom);
    let newIndex;
    if (direction < 0) {
      // Scroll up = zoom in
      newIndex = Math.min((currentIndex < 0 ? 0 : currentIndex) + 1, zoomLevels.length - 1);
    } else {
      // Scroll down = zoom out
      newIndex = Math.max((currentIndex < 0 ? zoomLevels.length - 1 : currentIndex) - 1, 0);
    }
    if (zoomLevels[newIndex] !== zoom) {
      const newZoom = zoomLevels[newIndex];

      // Zoom toward cursor: keep the canvas point under the mouse stable
      if (canvasContainer) {
        const rect = canvasContainer.getBoundingClientRect();
        // Cursor position within the visible container area
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        // Canvas coordinate under cursor (in source pixels, accounting for border)
        const canvasX = (canvasContainer.scrollLeft + cursorX) / zoom;
        const canvasY = (canvasContainer.scrollTop + cursorY) / zoom;

        if (zoomSelect) zoomSelect.value = String(newZoom);
        setZoom(newZoom);

        // After zoom, adjust scroll so the same canvas point stays under cursor
        canvasContainer.scrollLeft = canvasX * newZoom - cursorX;
        canvasContainer.scrollTop = canvasY * newZoom - cursorY;
      } else {
        if (zoomSelect) zoomSelect.value = String(newZoom);
        setZoom(newZoom);
      }
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

      // If switching to Edit tab without an editable picture, show New Picture dialog
      if (tabName === 'edit') {
        const canEdit = typeof isFormatEditable === 'function' && isFormatEditable() &&
                        typeof screenData !== 'undefined' && screenData &&
                        (screenData.length > 0 || (typeof currentFormat !== 'undefined' && currentFormat === FORMAT.SPECSCII));
        if (!canEdit && newPictureDialog) {
          restoreNewPictureFormat();
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

  // Initialize image import dialog
  if (typeof initImageImport === 'function') {
    initImageImport();
  }

  // Initialize display filters
  if (typeof initDisplayFilters === 'function') {
    initDisplayFilters();
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
