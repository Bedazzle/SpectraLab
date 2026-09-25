// SpectraLab - Editor settings (mouse interaction)
// @ts-check
"use strict";

// ============================================================================
// Mouse interaction settings
// ============================================================================
// Mouse conventions differ between graphics editors, so the wheel/modifier
// bindings are configurable instead of hard-coded. This module owns:
//   - the settings object + localStorage persistence
//   - the Settings dialog wiring (gear button next to Help)
//   - middle-button drag panning of the canvas
// The wheel dispatch lives in screen_viewer_ui.js and the Alt+click dispatch in
// screen_editor.js; both ask resolveWheelAction() / getMouseSetting() here.

/**
 * Wheel actions: 'zoom' | 'panV' | 'panH' | 'none'
 * Alt-click actions: 'pickInk' | 'pickPaper' | 'recolor' | 'none'
 * Arrow keys: 'scroll' | 'cursor'
 * Cursor style: 'corners' | 'dots' | 'box'
 * Fullscreen preview: 'auto' | 'show' | 'hide'
 * @type {{wheel:string, ctrlWheel:string, shiftWheel:string, middleDrag:string, altLeft:string, altRight:string, arrowKeys:string, cursorStyle:string, fullscreenPreview:string}}
 */
const MOUSE_SETTINGS_DEFAULTS = {
  wheel: 'zoom',
  ctrlWheel: 'panH',
  shiftWheel: 'panV',
  middleDrag: 'pan',
  altLeft: 'pickInk',
  altRight: 'recolor',
  arrowKeys: 'scroll',
  cursorStyle: 'corners',
  fullscreenPreview: 'auto'
};

const MOUSE_SETTINGS_KEY = 'spectraLabMouseSettings';

/** @type {{wheel:string, ctrlWheel:string, shiftWheel:string, middleDrag:string, altLeft:string, altRight:string, arrowKeys:string, cursorStyle:string, fullscreenPreview:string}} */
let mouseSettings = Object.assign({}, MOUSE_SETTINGS_DEFAULTS);

/**
 * Reads one mouse setting.
 * @param {string} name - key of mouseSettings
 * @returns {string} the configured action, or the default if unknown
 */
function getMouseSetting(name) {
  const v = mouseSettings[name];
  return typeof v === 'string' ? v : MOUSE_SETTINGS_DEFAULTS[name];
}

/**
 * Loads mouse settings from localStorage, ignoring unknown keys so an old or
 * hand-edited entry can never leave the app in an unusable state.
 */
function loadMouseSettings() {
  mouseSettings = Object.assign({}, MOUSE_SETTINGS_DEFAULTS);
  try {
    const raw = localStorage.getItem(MOUSE_SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return;
    Object.keys(MOUSE_SETTINGS_DEFAULTS).forEach((k) => {
      if (typeof saved[k] === 'string') mouseSettings[k] = saved[k];
    });
  } catch (e) {
    // Corrupt entry — keep defaults
  }
}

/**
 * Persists the current mouse settings.
 */
function saveMouseSettings() {
  try {
    localStorage.setItem(MOUSE_SETTINGS_KEY, JSON.stringify(mouseSettings));
  } catch (e) {
    // Storage full or blocked — settings still apply for this session
  }
}

/**
 * Decides what a wheel event over the canvas should do, based on its modifiers.
 * Ctrl wins over Shift when both are held.
 * @param {WheelEvent} event
 * @returns {string} 'zoom' | 'panV' | 'panH' | 'none'
 */
function resolveWheelAction(event) {
  if (event.ctrlKey) return getMouseSetting('ctrlWheel');
  if (event.shiftKey) return getMouseSetting('shiftWheel');
  return getMouseSetting('wheel');
}

/**
 * Resolves the Alt+click action for a mouse button.
 * @param {number} button - MouseEvent.button (0 = left, 2 = right)
 * @returns {string} 'pickInk' | 'pickPaper' | 'recolor' | 'none'
 */
function resolveAltClickAction(button) {
  return getMouseSetting(button === 2 ? 'altRight' : 'altLeft');
}

// ============================================================================
// Middle-button drag panning
// ============================================================================

/** @type {{startX:number, startY:number, scrollLeft:number, scrollTop:number}|null} */
let middlePanState = null;

/**
 * Wires middle-button drag panning on the canvas container. Runs in the capture
 * phase so it claims the event before the editor's canvas handlers see it.
 */
function initMiddleDragPan() {
  const container = document.getElementById('canvasContainer');
  if (!container) return;

  container.addEventListener('mousedown', (event) => {
    const e = /** @type {MouseEvent} */ (event);
    if (e.button !== 1) return;
    if (getMouseSetting('middleDrag') !== 'pan') return;
    // Suppresses the browser's middle-click autoscroll as well
    e.preventDefault();
    e.stopPropagation();
    middlePanState = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop
    };
    container.style.cursor = 'grabbing';
  }, true);

  window.addEventListener('mousemove', (event) => {
    if (!middlePanState) return;
    const e = /** @type {MouseEvent} */ (event);
    container.scrollLeft = middlePanState.scrollLeft - (e.clientX - middlePanState.startX);
    container.scrollTop = middlePanState.scrollTop - (e.clientY - middlePanState.startY);
  });

  window.addEventListener('mouseup', (event) => {
    if (!middlePanState) return;
    if (/** @type {MouseEvent} */ (event).button !== 1) return;
    middlePanState = null;
    container.style.cursor = '';
  });

  // Middle-click on a link/canvas would otherwise fire auxclick after the drag
  container.addEventListener('auxclick', (event) => {
    const e = /** @type {MouseEvent} */ (event);
    if (e.button === 1 && getMouseSetting('middleDrag') === 'pan') e.preventDefault();
  }, true);
}

/**
 * True while a middle-button pan drag is in progress.
 * @returns {boolean}
 */
function isMiddlePanning() {
  return middlePanState !== null;
}

// ============================================================================
// Settings dialog
// ============================================================================

/** Maps each select element id to the settings key it edits. */
const SETTINGS_SELECT_MAP = {
  settingsWheel: 'wheel',
  settingsCtrlWheel: 'ctrlWheel',
  settingsShiftWheel: 'shiftWheel',
  settingsMiddleDrag: 'middleDrag',
  settingsAltLeft: 'altLeft',
  settingsAltRight: 'altRight',
  settingsArrowKeys: 'arrowKeys',
  settingsCursorStyle: 'cursorStyle',
  settingsFullscreenPreview: 'fullscreenPreview'
};

/**
 * Pushes the current settings into the dialog's select elements.
 */
function syncSettingsDialog() {
  Object.keys(SETTINGS_SELECT_MAP).forEach((id) => {
    const el = /** @type {HTMLSelectElement|null} */ (document.getElementById(id));
    if (el) el.value = getMouseSetting(SETTINGS_SELECT_MAP[id]);
  });
}

/**
 * Opens the Settings dialog.
 */
function openSettingsDialog() {
  const dlg = document.getElementById('settingsDialog');
  if (!dlg) return;
  syncSettingsDialog();
  dlg.style.display = 'flex';
}

/**
 * Closes the Settings dialog.
 */
function closeSettingsDialog() {
  const dlg = document.getElementById('settingsDialog');
  if (dlg) dlg.style.display = 'none';
}

/**
 * Wires the gear button, the dialog's selects and its buttons.
 */
function initSettingsDialog() {
  document.getElementById('settingsBtn')?.addEventListener('click', openSettingsDialog);
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettingsDialog);
  document.getElementById('settingsDoneBtn')?.addEventListener('click', closeSettingsDialog);

  document.getElementById('settingsResetBtn')?.addEventListener('click', () => {
    mouseSettings = Object.assign({}, MOUSE_SETTINGS_DEFAULTS);
    saveMouseSettings();
    syncSettingsDialog();
  });

  Object.keys(SETTINGS_SELECT_MAP).forEach((id) => {
    const el = /** @type {HTMLSelectElement|null} */ (document.getElementById(id));
    el?.addEventListener('change', () => {
      mouseSettings[SETTINGS_SELECT_MAP[id]] = el.value;
      saveMouseSettings();
      // Reflect the change straight away, without closing the dialog
      if (typeof applyFullscreenPreviewSetting === 'function') {
        applyFullscreenPreviewSetting();
      }
      if (typeof editorActive !== 'undefined' && editorActive &&
          typeof editorRender === 'function') {
        editorRender();
      }
    });
  });

  // Click the backdrop to dismiss
  document.getElementById('settingsDialog')?.addEventListener('mousedown', (event) => {
    if (event.target === document.getElementById('settingsDialog')) closeSettingsDialog();
  });
}

/**
 * Entry point — called once on DOM ready.
 */
function initEditorSettings() {
  loadMouseSettings();
  initSettingsDialog();
  initMiddleDragPan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditorSettings);
} else {
  initEditorSettings();
}
