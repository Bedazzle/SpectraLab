// ============================================================================
// ASM Export Utilities — shared helpers for all ASM export modules
// ============================================================================

/**
 * Format byte array as sjasmplus DB lines.
 * @param {number[]} data - Array of byte values
 * @param {number} bytesPerLine - Number of bytes per DB line
 * @returns {string} Formatted DB lines
 */
function formatDbLines(data, bytesPerLine) {
  const lines = [];
  for (let i = 0; i < data.length; i += bytesPerLine) {
    const chunk = data.slice(i, Math.min(i + bytesPerLine, data.length));
    lines.push('    DB ' + chunk.map(b => '#' + b.toString(16).toUpperCase().padStart(2, '0')).join(','));
  }
  return lines.join('\n');
}

/**
 * Convert bytes to visual binary representation using █ for 1, · for 0.
 * @param {number[]} bytes - Array of byte values
 * @returns {string} Visual representation
 */
function bytesToVisualBin(bytes) {
  return bytes.map(b => {
    let v = '';
    for (let bit = 7; bit >= 0; bit--) {
      v += (b & (1 << bit)) ? '\u2588' : '\u00B7';
    }
    return v;
  }).join('');
}

/**
 * Format byte array as sjasmplus DB lines with visual binary comments.
 * @param {number[]} data - Array of byte values
 * @param {number} bytesPerLine - Number of bytes per DB line
 * @returns {string} Formatted DB lines with visual comments
 */
function formatDbLinesVisual(data, bytesPerLine) {
  const lines = [];
  for (let i = 0; i < data.length; i += bytesPerLine) {
    const chunk = data.slice(i, Math.min(i + bytesPerLine, data.length));
    const hex = chunk.map(b => '#' + b.toString(16).toUpperCase().padStart(2, '0')).join(',');
    const visual = bytesToVisualBin(chunk);
    lines.push('    DB ' + hex + ' ; ' + visual);
  }
  return lines.join('\n');
}

/**
 * Strip the extension from a filename (the trailing ".xxx").
 * Returns '' for null/empty input so callers can apply their own default via `|| 'foo'`.
 * @param {string|null|undefined} fileName
 * @returns {string} Filename without its extension
 */
function stripFileExtension(fileName) {
  return fileName ? fileName.replace(/\.[^.]+$/, '') : '';
}

/**
 * Extract base filename from path (handles zip paths like "archive.zip/image.scr").
 * @param {string|null} fileName - Current file name or null
 * @param {string} defaultName - Default base name if no file loaded
 * @returns {string} Base name without extension
 */
function getAsmBaseName(fileName, defaultName) {
  if (!fileName) return defaultName;
  const name = fileName.includes('/')
    ? fileName.substring(fileName.lastIndexOf('/') + 1)
    : fileName;
  return stripFileExtension(name);
}

/**
 * Read embed data checkbox state.
 * @returns {boolean} Whether to embed data as DB lines
 */
function getAsmEmbedData() {
  const chk = document.getElementById('editorEmbedDataChk');
  return chk ? /** @type {HTMLInputElement} */ (chk).checked : true;
}

/**
 * Generate default RGB332→RGB333 identity palette in NEXTREG format.
 * Each entry is 2 bytes: byte1 = RRRGGGBB (high bit of blue), byte2 = 0000000B (low bit of blue).
 * @param {number} [count=256] - Number of entries (256 for 8bpp, 16 for 4bpp)
 * @returns {number[]} Flat array of palette bytes (count * 2 elements)
 */
function generateRgb332PaletteBytes(count = 256) {
  const palette = [];
  for (let i = 0; i < count; i++) {
    const r3 = (i >> 5) & 7;
    const g3 = (i >> 2) & 7;
    const b2 = i & 3;
    const b3 = (b2 << 1) | (b2 >> 1);
    const byte1 = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    const byte2 = b3 & 1;
    palette.push(byte1, byte2);
  }
  return palette;
}

/**
 * Download content as a file.
 * @param {string|Blob} content - File content (string or Blob)
 * @param {string} fileName - Download file name
 * @param {string} [mimeType='text/plain'] - MIME type (used when content is string)
 */
function downloadFile(content, fileName, mimeType = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Runs a standard ASM export: derive base name, call generator, download as .asm.
 * Generator receives (baseName, embedData) and returns `{ asm }` or a falsy value to abort.
 * @param {string} defaultName - Fallback base name used when no file is loaded
 * @param {(baseName: string, embedData: boolean) => ({asm: string}|null|undefined)} generate
 */
function runAsmExport(defaultName, generate) {
  const baseName = getAsmBaseName(currentFileName, defaultName);
  const result = generate(baseName, getAsmEmbedData());
  if (!result) return;
  downloadFile(result.asm, baseName + '.asm');
}
