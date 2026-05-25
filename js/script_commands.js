// @ts-check
"use strict";

/**
 * SpectraLab Script Commands — Maps script commands to SpectraLab drawing APIs.
 * Depends on: script_engine.js, screen_editor.js, screen_viewer.js
 */

(function() {

  // --- Drawing commands ---

  ScriptEngine.registerCommand('PIXEL', function(args) {
    const x = Math.floor(args[0] || 0);
    const y = Math.floor(args[1] || 0);
    setPixel(screenData, x, y, true);
  });

  ScriptEngine.registerCommand('PIXELPAPER', function(args) {
    const x = Math.floor(args[0] || 0);
    const y = Math.floor(args[1] || 0);
    setPixel(screenData, x, y, false);
  });

  ScriptEngine.registerCommand('PLOT', function(args) {
    const x = Math.floor(args[0] || 0);
    const y = Math.floor(args[1] || 0);
    setPixel(screenData, x, y, true);
  });

  ScriptEngine.registerCommand('LINE', function(args) {
    const x0 = Math.floor(args[0] || 0);
    const y0 = Math.floor(args[1] || 0);
    const x1 = Math.floor(args[2] || 0);
    const y1 = Math.floor(args[3] || 0);
    drawLine(x0, y0, x1, y1, true);
  });

  ScriptEngine.registerCommand('RECT', function(args) {
    const x0 = Math.floor(args[0] || 0);
    const y0 = Math.floor(args[1] || 0);
    const x1 = Math.floor(args[2] || 0);
    const y1 = Math.floor(args[3] || 0);
    drawRect(x0, y0, x1, y1, true);
  });

  ScriptEngine.registerCommand('FILLRECT', function(args) {
    const x0 = Math.floor(args[0] || 0);
    const y0 = Math.floor(args[1] || 0);
    const w  = Math.floor(args[2] || 0);
    const h  = Math.floor(args[3] || 0);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setPixel(screenData, x0 + dx, y0 + dy, true);
      }
    }
  });

  ScriptEngine.registerCommand('CIRCLE', function(args) {
    const cx = Math.floor(args[0] || 0);
    const cy = Math.floor(args[1] || 0);
    const rx = Math.floor(args[2] || 0);
    const ry = args[3] !== undefined ? Math.floor(args[3]) : rx;
    // drawCircle expects bounding box corners
    drawCircle(cx - rx, cy - ry, cx + rx, cy + ry, true);
  });

  ScriptEngine.registerCommand('FILL', function(args) {
    const x = Math.floor(args[0] || 0);
    const y = Math.floor(args[1] || 0);
    floodFill(x, y, true);
  });

  ScriptEngine.registerCommand('CLEAR', function(args) {
    if (args.length >= 2) {
      editorInkColor = Math.floor(args[0]) & 7;
      editorPaperColor = Math.floor(args[1]) & 7;
    }
    clearScreen();
  });

  // --- Attribute commands ---

  ScriptEngine.registerCommand('SETINK', function(args) {
    editorInkColor = Math.floor(args[0] || 0);
  });

  ScriptEngine.registerCommand('SETPAPER', function(args) {
    editorPaperColor = Math.floor(args[0] || 0);
  });

  ScriptEngine.registerCommand('SETBRIGHT', function(args) {
    editorBright = !!(args[0]);
  });

  ScriptEngine.registerCommand('SETFLASH', function(args) {
    editorFlash = !!(args[0]);
  });

  ScriptEngine.registerCommand('SETATTR', function(args) {
    const col = Math.floor(args[0] || 0);
    const row = Math.floor(args[1] || 0);
    const ink = Math.floor(args[2] || 0);
    const paper = Math.floor(args[3] || 0);
    const bright = !!(args[4]);
    const flash = !!(args[5]);
    const addr = getAttributeAddress(col * 8, row * 8);
    if (addr >= 0 && addr < screenData.length) {
      screenData[addr] = ATTR.make(ink, paper, bright, flash);
    }
  });

  // --- Screen operations ---

  ScriptEngine.registerCommand('RENDER', function() {
    editorRender();
  });

  ScriptEngine.registerCommand('UNDO', function() {
    undo();
  });

  ScriptEngine.registerCommand('REDO', function() {
    redo();
  });

  // --- Query functions (return values) ---

  ScriptEngine.registerFunction('GETPIXEL', function(args) {
    const x = Math.floor(args[0] || 0);
    const y = Math.floor(args[1] || 0);
    return getPixelState(x, y) ? 1 : 0;
  });

  ScriptEngine.registerFunction('GETINK', function(args) {
    const col = Math.floor(args[0] || 0);
    const row = Math.floor(args[1] || 0);
    const addr = getAttributeAddress(col * 8, row * 8);
    if (addr >= 0 && addr < screenData.length) {
      return ATTR.ink(screenData[addr]);
    }
    return 0;
  });

  ScriptEngine.registerFunction('GETPAPER', function(args) {
    const col = Math.floor(args[0] || 0);
    const row = Math.floor(args[1] || 0);
    const addr = getAttributeAddress(col * 8, row * 8);
    if (addr >= 0 && addr < screenData.length) {
      return ATTR.paper(screenData[addr]);
    }
    return 0;
  });

  ScriptEngine.registerFunction('GETBRIGHT', function(args) {
    const col = Math.floor(args[0] || 0);
    const row = Math.floor(args[1] || 0);
    const addr = getAttributeAddress(col * 8, row * 8);
    if (addr >= 0 && addr < screenData.length) {
      return ATTR.bright(screenData[addr]) ? 1 : 0;
    }
    return 0;
  });

  // --- Screen dimension queries ---

  ScriptEngine.registerFunction('WIDTH', function() {
    return getFormatWidth();
  });

  ScriptEngine.registerFunction('HEIGHT', function() {
    return getFormatHeight();
  });

})();
