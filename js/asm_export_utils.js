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
  return name.replace(/\.[^.]+$/, '');
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
