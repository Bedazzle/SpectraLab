// @ts-check
"use strict";

/**
 * SpectraLab Script UI — Floating script editor panel with drag, resize, and output log.
 * Depends on: script_engine.js, script_commands.js, screen_editor.js
 */

const EXAMPLE_SCRIPTS = {
  'Diagonal Line': `# Draw a diagonal line across the screen
SETINK 7
LINE 0 0 255 191
RENDER`,

  'Starfield': `# Random starfield
SETINK 7
SETPAPER 0
CLEAR 7 0
REPEAT 200
  PIXEL RANDOM(256) RANDOM(192)
ENDREPEAT
RENDER`,

  'Gradient Bars': `# Vertical color bars with all ink colors
FOR c = 0 TO 7
  SETINK c
  LET x0 = c * 32
  FOR y = 0 TO 191
    FOR x = x0 TO x0 + 31
      PIXEL x y
    NEXT
  NEXT
NEXT
RENDER`,

  'Checkerboard': `# 8x8 checkerboard pattern
SETINK 0
SETPAPER 7
CLEAR 0 7
FOR row = 0 TO 23
  FOR col = 0 TO 31
    IF (row + col) % 2 = 0 THEN
      SETATTR col row 0 7 0 0
    ELSE
      SETATTR col row 7 0 0 0
    ENDIF
  NEXT
NEXT
RENDER`,

  'Sine Wave': `# Draw a sine wave
SETINK 6
LET cy = 96
FOR x = 0 TO 255
  LET y = cy + FLOOR(SIN(x * PI / 32) * 60)
  PIXEL x y
NEXT
RENDER`,

  'Circles': `# Concentric circles
SETINK 5
FOR r = 10 TO 90 STEP 10
  CIRCLE 128 96 r r
NEXT
RENDER`,

  'Sierpinski': `# Sierpinski triangle via chaos game
SETINK 4
LET x = 128
LET y = 10
LET ax = 128
LET ay = 10
LET bx = 10
LET by = 180
LET cx = 246
LET cy = 180
REPEAT 10000
  LET r = RANDOM(3)
  IF r = 0 THEN
    LET x = FLOOR((x + ax) / 2)
    LET y = FLOOR((y + ay) / 2)
  ENDIF
  IF r = 1 THEN
    LET x = FLOOR((x + bx) / 2)
    LET y = FLOOR((y + by) / 2)
  ENDIF
  IF r = 2 THEN
    LET x = FLOOR((x + cx) / 2)
    LET y = FLOOR((y + cy) / 2)
  ENDIF
  PIXEL x y
ENDREPEAT
RENDER`
};

// --- Help overlay content ---
const SCRIPT_HELP_HTML = `
<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
  <b style="font-size:13px;">Script Language Reference</b>
  <button id="scriptHelpCloseBtn" style="background:none; border:none; color:var(--text-primary); font-size:18px; cursor:pointer; padding:0 4px; line-height:1;" title="Close">&times;</button>
</div>
<div style="overflow-y:auto; max-height:calc(100% - 30px); font-size:11px; line-height:1.45;">
<table style="width:100%; border-collapse:collapse;">
<tr><td colspan="2" style="padding:4px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Control Flow</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>LET</b> var = expr</td><td style="padding:1px 4px;">Assign variable</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>FOR</b> v = a <b>TO</b> b [<b>STEP</b> s]<br>&nbsp;&nbsp;...<br><b>NEXT</b></td><td style="padding:1px 4px;">Counted loop</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>IF</b> cond <b>THEN</b><br>&nbsp;&nbsp;...<br>[<b>ELSE</b><br>&nbsp;&nbsp;...]<br><b>ENDIF</b></td><td style="padding:1px 4px;">Conditional</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>REPEAT</b> n<br>&nbsp;&nbsp;...<br><b>ENDREPEAT</b></td><td style="padding:1px 4px;">Repeat n times</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>WHILE</b> cond<br>&nbsp;&nbsp;...<br><b>ENDWHILE</b></td><td style="padding:1px 4px;">While loop</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>FUNC</b> name(args)<br>&nbsp;&nbsp;...<br><b>ENDFUNC</b></td><td style="padding:1px 4px;">Define function</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>CALL</b> name(args)</td><td style="padding:1px 4px;">Call function</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>RETURN</b> [expr]</td><td style="padding:1px 4px;">Return from function</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>PRINT</b> expr, ...</td><td style="padding:1px 4px;">Print to output log</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>REM</b> / <b>#</b></td><td style="padding:1px 4px;">Comment (rest of line)</td></tr>

<tr><td colspan="2" style="padding:6px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Drawing</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>PIXEL</b> x y</td><td style="padding:1px 4px;">Set pixel (ink)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>PIXELPAPER</b> x y</td><td style="padding:1px 4px;">Set pixel (paper/erase)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>PLOT</b> x y</td><td style="padding:1px 4px;">Same as PIXEL</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>LINE</b> x0 y0 x1 y1</td><td style="padding:1px 4px;">Draw line</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>RECT</b> x0 y0 x1 y1</td><td style="padding:1px 4px;">Draw rectangle outline</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>FILLRECT</b> x y w h</td><td style="padding:1px 4px;">Filled rectangle</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>CIRCLE</b> cx cy rx [ry]</td><td style="padding:1px 4px;">Circle/ellipse</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>FILL</b> x y</td><td style="padding:1px 4px;">Flood fill from point</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>CLEAR</b> [ink paper]</td><td style="padding:1px 4px;">Clear screen</td></tr>

<tr><td colspan="2" style="padding:6px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Attributes</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SETINK</b> c</td><td style="padding:1px 4px;">Set ink color (0-7)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SETPAPER</b> c</td><td style="padding:1px 4px;">Set paper color (0-7)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SETBRIGHT</b> b</td><td style="padding:1px 4px;">Set bright (0/1)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SETFLASH</b> f</td><td style="padding:1px 4px;">Set flash (0/1)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SETATTR</b> col row ink paper bright flash</td><td style="padding:1px 4px;">Set cell attribute</td></tr>

<tr><td colspan="2" style="padding:6px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Screen Operations</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>RENDER</b></td><td style="padding:1px 4px;">Refresh display</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>UNDO</b> / <b>REDO</b></td><td style="padding:1px 4px;">Undo/redo last action</td></tr>

<tr><td colspan="2" style="padding:6px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Query Functions</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>GETPIXEL</b>(x, y)</td><td style="padding:1px 4px;">Returns 1/0</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>GETINK</b>(col, row)</td><td style="padding:1px 4px;">Ink color of cell</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>GETPAPER</b>(col, row)</td><td style="padding:1px 4px;">Paper color of cell</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>GETBRIGHT</b>(col, row)</td><td style="padding:1px 4px;">Bright flag of cell</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>WIDTH</b> / <b>HEIGHT</b></td><td style="padding:1px 4px;">Screen dimensions</td></tr>

<tr><td colspan="2" style="padding:6px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Math Functions</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SIN</b> COS TAN</td><td style="padding:1px 4px;">Trigonometry (radians)</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>SQRT</b> ABS</td><td style="padding:1px 4px;">Square root, absolute value</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>FLOOR</b> CEIL ROUND</td><td style="padding:1px 4px;">Rounding</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>MIN</b>(a, b) <b>MAX</b>(a, b)</td><td style="padding:1px 4px;">Min/max of two values</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>RANDOM</b>(n)</td><td style="padding:1px 4px;">Random int 0..n-1</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>PI</b></td><td style="padding:1px 4px;">3.14159...</td></tr>

<tr><td colspan="2" style="padding:6px 2px 2px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">Operators</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);">+ - * / %</td><td style="padding:1px 4px;">Arithmetic</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);">= &lt;&gt; != &lt; &gt; &lt;= &gt;=</td><td style="padding:1px 4px;">Comparison</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);"><b>AND</b> <b>OR</b> <b>NOT</b></td><td style="padding:1px 4px;">Logical</td></tr>
<tr><td style="padding:1px 4px; white-space:nowrap; color:var(--text-secondary);">+ (strings)</td><td style="padding:1px 4px;">String concatenation</td></tr>
</table>
</div>
`;

// --- Drag state ---
let scriptPanelDragging = false;
let scriptPanelDragX = 0;
let scriptPanelDragY = 0;

// --- Resize state ---
let scriptPanelResizing = false;
let scriptResizeStartX = 0;
let scriptResizeStartY = 0;
let scriptResizeStartW = 0;
let scriptResizeStartH = 0;

const SCRIPT_PANEL_STORAGE_KEY = 'spectraLabScriptPanel';

function saveScriptPanelLayout() {
  const panel = document.getElementById('scriptEditorPanel');
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  localStorage.setItem(SCRIPT_PANEL_STORAGE_KEY, JSON.stringify({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }));
}

function restoreScriptPanelLayout() {
  const panel = document.getElementById('scriptEditorPanel');
  if (!panel) return;
  const saved = localStorage.getItem(SCRIPT_PANEL_STORAGE_KEY);
  if (!saved) return;
  try {
    const layout = JSON.parse(saved);
    if (typeof layout.left === 'number') panel.style.left = layout.left + 'px';
    if (typeof layout.top === 'number') panel.style.top = layout.top + 'px';
    if (typeof layout.width === 'number') panel.style.width = layout.width + 'px';
    if (typeof layout.height === 'number') panel.style.height = layout.height + 'px';
  } catch (e) {
    // ignore bad data
  }
}

function openScriptPanel() {
  const panel = document.getElementById('scriptEditorPanel');
  if (!panel) return;
  panel.style.display = '';
}

function closeScriptPanel() {
  const panel = document.getElementById('scriptEditorPanel');
  if (!panel) return;
  panel.style.display = 'none';
}

function initScriptUI() {
  const container = document.getElementById('scriptEditorBody');
  if (!container) return;

  // --- Build UI ---
  container.innerHTML = `
    <div style="display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; flex-shrink: 0;">
      <button id="scriptRunBtn" style="padding: 3px 10px; font-size: 11px; background: #2a7a2a; color: #fff; border: 1px solid #3a8a3a;" title="Run script (Ctrl+Enter)">&#9654; Run</button>
      <button id="scriptStopBtn" style="padding: 3px 10px; font-size: 11px; background: #7a2a2a; color: #fff; border: 1px solid #8a3a3a;" disabled title="Stop running script">&#9632; Stop</button>
      <button id="scriptClearLogBtn" style="padding: 3px 8px; font-size: 11px;" title="Clear output log">Clear Log</button>
      <button id="scriptLoadBtn" style="padding: 3px 8px; font-size: 11px;" title="Load .slscript file">Load</button>
      <button id="scriptSaveBtn" style="padding: 3px 8px; font-size: 11px;" title="Save as .slscript file">Save</button>
      <button id="scriptHelpBtn" style="padding: 3px 8px; font-size: 11px; font-weight: bold; margin-left: auto;" title="Language reference">?</button>
    </div>
    <div style="display: flex; gap: 4px; margin-bottom: 6px; align-items: center; flex-shrink: 0;">
      <label style="font-size: 11px; color: var(--text-secondary); white-space: nowrap;">Examples:</label>
      <select id="scriptExamplesSelect" style="flex: 1; font-size: 11px; padding: 2px 4px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color);">
        <option value="">-- Select --</option>
      </select>
    </div>
    <div id="scriptHelpOverlay" style="
      display: none; position: absolute; left: 0; top: 0; right: 0; bottom: 0;
      background: var(--bg-primary); border: 1px solid var(--border-color);
      padding: 8px; z-index: 10; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    "></div>
    <div style="position: relative; flex: 1; min-height: 80px;">
      <div id="scriptLineNumbers" style="
        position: absolute; left: 0; top: 0; bottom: 0; width: 30px;
        background: var(--bg-tertiary); border: 1px solid var(--border-color);
        border-right: none; font-family: monospace; font-size: 12px;
        line-height: 16px; padding: 4px 2px; color: var(--text-tertiary);
        text-align: right; overflow: hidden; user-select: none;
        box-sizing: border-box; white-space: pre;
      "></div>
      <textarea id="scriptTextarea" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off" style="
        width: 100%; height: 100%; box-sizing: border-box;
        font-family: monospace; font-size: 12px; line-height: 16px;
        padding: 4px 4px 4px 34px; resize: none;
        background: var(--bg-secondary); color: var(--text-primary);
        border: 1px solid var(--border-color); tab-size: 2;
        white-space: pre; overflow-x: auto;
      " placeholder="Enter script here..."></textarea>
    </div>
    <div style="margin-top: 6px; flex-shrink: 0;">
      <div style="font-size: 10px; font-weight: bold; color: var(--text-secondary); margin-bottom: 2px;">Output</div>
      <div id="scriptOutputLog" style="
        width: 100%; height: 80px; box-sizing: border-box;
        font-family: monospace; font-size: 11px; line-height: 15px;
        padding: 4px; overflow-y: auto; resize: none;
        background: var(--bg-secondary); color: var(--text-primary);
        border: 1px solid var(--border-color); white-space: pre-wrap;
        word-break: break-all;
      "></div>
    </div>
    <input type="file" id="scriptFileInput" accept=".slscript,.txt,.bas" style="display: none;">
  `;

  // --- Populate examples dropdown ---
  const examplesSelect = /** @type {HTMLSelectElement} */ (document.getElementById('scriptExamplesSelect'));
  for (const name of Object.keys(EXAMPLE_SCRIPTS)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    examplesSelect.appendChild(opt);
  }

  // --- Get references ---
  const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('scriptTextarea'));
  const outputLog = /** @type {HTMLDivElement} */ (document.getElementById('scriptOutputLog'));
  const lineNumbers = /** @type {HTMLDivElement} */ (document.getElementById('scriptLineNumbers'));
  const runBtn = /** @type {HTMLButtonElement} */ (document.getElementById('scriptRunBtn'));
  const stopBtn = /** @type {HTMLButtonElement} */ (document.getElementById('scriptStopBtn'));
  const clearLogBtn = /** @type {HTMLButtonElement} */ (document.getElementById('scriptClearLogBtn'));
  const loadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('scriptLoadBtn'));
  const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('scriptSaveBtn'));
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('scriptFileInput'));
  const helpBtn = /** @type {HTMLButtonElement} */ (document.getElementById('scriptHelpBtn'));
  const helpOverlay = /** @type {HTMLDivElement} */ (document.getElementById('scriptHelpOverlay'));

  // --- Help overlay ---
  helpOverlay.innerHTML = SCRIPT_HELP_HTML;

  helpBtn.addEventListener('click', function() {
    helpOverlay.style.display = helpOverlay.style.display === 'none' ? '' : 'none';
  });

  const helpCloseBtn = document.getElementById('scriptHelpCloseBtn');
  if (helpCloseBtn) {
    helpCloseBtn.addEventListener('click', function() {
      helpOverlay.style.display = 'none';
    });
  }

  // --- Line numbers ---
  function updateLineNumbers() {
    const lines = textarea.value.split('\n');
    const count = lines.length;
    let html = '';
    for (let i = 1; i <= count; i++) {
      html += i + '\n';
    }
    lineNumbers.textContent = html;
    // Sync scroll
    lineNumbers.scrollTop = textarea.scrollTop;
  }

  textarea.addEventListener('input', updateLineNumbers);
  textarea.addEventListener('scroll', function() {
    lineNumbers.scrollTop = textarea.scrollTop;
  });

  // Tab key inserts spaces
  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.selectionStart;
      const end = this.selectionEnd;
      this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
      this.selectionStart = this.selectionEnd = start + 2;
      updateLineNumbers();
    }
    // Ctrl+Enter runs script
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runScript();
    }
  });

  updateLineNumbers();

  // --- Script log ---
  function scriptLog(text, cls) {
    const line = document.createElement('div');
    line.textContent = text;
    if (cls === 'error') {
      line.style.color = 'var(--danger-color)';
    } else if (cls === 'info') {
      line.style.color = 'var(--accent-color)';
    }
    outputLog.appendChild(line);
    outputLog.scrollTop = outputLog.scrollHeight;
  }

  // --- Run / Stop ---
  function setRunning(isRunning) {
    runBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;
    textarea.readOnly = isRunning;
    if (isRunning) {
      runBtn.style.opacity = '0.5';
      stopBtn.style.opacity = '1';
    } else {
      runBtn.style.opacity = '1';
      stopBtn.style.opacity = '0.5';
    }
  }

  async function runScript() {
    const source = textarea.value.trim();
    if (!source) return;

    setRunning(true);
    scriptLog('--- Script started ---', 'info');

    // Save undo state once before script runs
    if (typeof saveUndoState === 'function') {
      saveUndoState();
    }

    // Save and force single-pixel brush
    const savedBrushSize = typeof brushSize !== 'undefined' ? brushSize : 1;
    const savedBrushShape = typeof brushShape !== 'undefined' ? brushShape : 'square';
    if (typeof brushSize !== 'undefined') brushSize = 1;
    if (typeof brushShape !== 'undefined') brushShape = 'square';

    await ScriptEngine.run(source, {
      onPrint: function(text) {
        scriptLog(text);
      },
      onError: function(msg) {
        scriptLog('Error: ' + msg, 'error');
      },
      onDone: function() {
        scriptLog('--- Script finished ---', 'info');
      },
      onStop: function() {
        scriptLog('--- Script stopped by user ---', 'info');
      }
    });

    // Restore brush settings
    if (typeof brushSize !== 'undefined') brushSize = savedBrushSize;
    if (typeof brushShape !== 'undefined') brushShape = savedBrushShape;

    // Render at end
    if (typeof editorRender === 'function') {
      editorRender();
    }

    setRunning(false);
  }

  runBtn.addEventListener('click', runScript);

  stopBtn.addEventListener('click', function() {
    ScriptEngine.stop();
  });

  clearLogBtn.addEventListener('click', function() {
    outputLog.innerHTML = '';
  });

  // --- Examples ---
  examplesSelect.addEventListener('change', function() {
    const name = this.value;
    if (name && EXAMPLE_SCRIPTS[name]) {
      textarea.value = EXAMPLE_SCRIPTS[name];
      updateLineNumbers();
    }
    this.value = '';
  });

  // --- Load / Save ---
  loadBtn.addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', function() {
    const file = this.files && this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      textarea.value = /** @type {string} */ (e.target.result);
      updateLineNumbers();
      scriptLog('Loaded: ' + file.name, 'info');
    };
    reader.readAsText(file);
    this.value = '';
  });

  saveBtn.addEventListener('click', function() {
    const source = textarea.value;
    if (!source.trim()) return;
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'script.slscript';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    scriptLog('Script saved', 'info');
  });

  // --- Load script from localStorage ---
  const saved = localStorage.getItem('spectraLabScript');
  if (saved) {
    textarea.value = saved;
    updateLineNumbers();
  }

  // Auto-save on changes
  textarea.addEventListener('input', function() {
    localStorage.setItem('spectraLabScript', textarea.value);
  });

  // --- Panel drag (titlebar) ---
  const panel = /** @type {HTMLElement} */ (document.getElementById('scriptEditorPanel'));
  const titlebar = panel.querySelector('.script-editor-titlebar');
  if (titlebar) {
    titlebar.addEventListener('mousedown', function(e) {
      if (/** @type {HTMLElement} */ (e.target).closest('.script-editor-close')) return;
      scriptPanelDragging = true;
      const rect = panel.getBoundingClientRect();
      scriptPanelDragX = e.clientX - rect.left;
      scriptPanelDragY = e.clientY - rect.top;
      e.preventDefault();
    });
  }

  // --- Panel resize (corner handle) ---
  const resizeHandle = panel.querySelector('.script-editor-resize');
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', function(e) {
      scriptPanelResizing = true;
      scriptResizeStartX = e.clientX;
      scriptResizeStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      scriptResizeStartW = rect.width;
      scriptResizeStartH = rect.height;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  document.addEventListener('mousemove', function(e) {
    if (scriptPanelDragging) {
      panel.style.left = (e.clientX - scriptPanelDragX) + 'px';
      panel.style.top = (e.clientY - scriptPanelDragY) + 'px';
    }
    if (scriptPanelResizing) {
      const newW = Math.max(300, scriptResizeStartW + (e.clientX - scriptResizeStartX));
      const newH = Math.max(200, scriptResizeStartH + (e.clientY - scriptResizeStartY));
      panel.style.width = newW + 'px';
      panel.style.height = newH + 'px';
    }
  });

  document.addEventListener('mouseup', function() {
    if (scriptPanelDragging || scriptPanelResizing) {
      scriptPanelDragging = false;
      scriptPanelResizing = false;
      saveScriptPanelLayout();
    }
  });

  // --- Open / Close wiring ---
  const closeBtn = document.getElementById('scriptEditorClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeScriptPanel);
  }

  const openLink = document.getElementById('openScriptEditor');
  if (openLink) {
    openLink.addEventListener('click', function(e) {
      e.preventDefault();
      openScriptPanel();
    });
  }

  // --- Restore layout from localStorage ---
  restoreScriptPanelLayout();
}

// Initialize directly — panel HTML is always in the DOM
initScriptUI();
