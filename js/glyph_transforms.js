// Glyph Transforms v1.0.0 - Shared glyph transformation functions
// @ts-check
"use strict";

/**
 * Core glyph transformation functions operating on byte arrays.
 * All functions take a Uint8Array and offset, modifying the 8-byte glyph at that position.
 * These are low-level operations without rendering - callers must trigger repaints.
 */

const GLYPH_HEIGHT = 8;

// ============================================================================
// Basic Operations
// ============================================================================

/**
 * Inverts all bits in a glyph (XOR with 0xFF)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphInvert(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] ^= 0xFF;
  }
}

/**
 * Clears all bits in a glyph (sets to 0)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphClear(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] = 0;
  }
}

// ============================================================================
// Scroll Operations (wrap-around)
// ============================================================================

/**
 * Scrolls glyph rows up with wrap-around
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphScrollUp(data, offset) {
  const firstRow = data[offset];
  for (let row = 0; row < GLYPH_HEIGHT - 1; row++) {
    data[offset + row] = data[offset + row + 1];
  }
  data[offset + GLYPH_HEIGHT - 1] = firstRow;
}

/**
 * Scrolls glyph rows down with wrap-around
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphScrollDown(data, offset) {
  const lastRow = data[offset + GLYPH_HEIGHT - 1];
  for (let row = GLYPH_HEIGHT - 1; row > 0; row--) {
    data[offset + row] = data[offset + row - 1];
  }
  data[offset] = lastRow;
}

/**
 * Scrolls glyph bits left with wrap-around
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphScrollLeft(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    const leftBit = (byte >> 7) & 1;
    data[offset + row] = ((byte << 1) & 0xFF) | leftBit;
  }
}

/**
 * Scrolls glyph bits right with wrap-around
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphScrollRight(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    const rightBit = byte & 1;
    data[offset + row] = (byte >> 1) | (rightBit << 7);
  }
}

// ============================================================================
// Shift Operations (zero-fill)
// ============================================================================

/**
 * Shifts glyph rows up, filling bottom with zeros
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphShiftUp(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT - 1; row++) {
    data[offset + row] = data[offset + row + 1];
  }
  data[offset + GLYPH_HEIGHT - 1] = 0;
}

/**
 * Shifts glyph rows down, filling top with zeros
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphShiftDown(data, offset) {
  for (let row = GLYPH_HEIGHT - 1; row > 0; row--) {
    data[offset + row] = data[offset + row - 1];
  }
  data[offset] = 0;
}

/**
 * Shifts glyph bits left, filling with zeros
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphShiftLeft(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] = (data[offset + row] << 1) & 0xFF;
  }
}

/**
 * Shifts glyph bits right, filling with zeros
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphShiftRight(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] = data[offset + row] >> 1;
  }
}

// ============================================================================
// Bold Operations
// ============================================================================

/**
 * Bold effect by OR-ing each byte with its right-shifted value
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphBoldRight(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    data[offset + row] = byte | (byte >> 1);
  }
}

/**
 * Bold effect by OR-ing each byte with its left-shifted value
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphBoldLeft(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    data[offset + row] = (byte | (byte << 1)) & 0xFF;
  }
}

/**
 * Bold effect by OR-ing each row with the row above
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphBoldDown(data, offset) {
  for (let row = GLYPH_HEIGHT - 2; row >= 0; row--) {
    data[offset + row + 1] |= data[offset + row];
  }
}

// ============================================================================
// Italic Operations
// ============================================================================

/**
 * Italic style 1 right - shifts top 4 rows 1 pixel right
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphItalic1Right(data, offset) {
  for (let row = 0; row <= 3; row++) {
    data[offset + row] = data[offset + row] >> 1;
  }
}

/**
 * Italic style 1 left - shifts top 4 rows 1 pixel left
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphItalic1Left(data, offset) {
  for (let row = 0; row <= 3; row++) {
    data[offset + row] = (data[offset + row] << 1) & 0xFF;
  }
}

/**
 * Italic style 2 right - progressive shift (3px, 2px, 1px)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphItalic2Right(data, offset) {
  data[offset + 0] = data[offset + 0] >> 3;
  data[offset + 1] = data[offset + 1] >> 3;
  data[offset + 2] = data[offset + 2] >> 2;
  data[offset + 3] = data[offset + 3] >> 2;
  data[offset + 4] = data[offset + 4] >> 1;
  data[offset + 5] = data[offset + 5] >> 1;
}

/**
 * Italic style 2 left - progressive shift (3px, 2px, 1px)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphItalic2Left(data, offset) {
  data[offset + 0] = (data[offset + 0] << 3) & 0xFF;
  data[offset + 1] = (data[offset + 1] << 3) & 0xFF;
  data[offset + 2] = (data[offset + 2] << 2) & 0xFF;
  data[offset + 3] = (data[offset + 3] << 2) & 0xFF;
  data[offset + 4] = (data[offset + 4] << 1) & 0xFF;
  data[offset + 5] = (data[offset + 5] << 1) & 0xFF;
}

/**
 * Italic style 3 right - 3-part italic (rows 0-2: +1, rows 5-7: -1)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphItalic3Right(data, offset) {
  data[offset + 0] = data[offset + 0] >> 1;
  data[offset + 1] = data[offset + 1] >> 1;
  data[offset + 2] = data[offset + 2] >> 1;
  // rows 3-4 stay the same
  data[offset + 5] = (data[offset + 5] << 1) & 0xFF;
  data[offset + 6] = (data[offset + 6] << 1) & 0xFF;
  data[offset + 7] = (data[offset + 7] << 1) & 0xFF;
}

/**
 * Italic style 3 left - progressive shift (2px, 1px)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphItalic3Left(data, offset) {
  data[offset + 0] = (data[offset + 0] << 2) & 0xFF;
  data[offset + 1] = (data[offset + 1] << 2) & 0xFF;
  data[offset + 2] = (data[offset + 2] << 2) & 0xFF;
  data[offset + 3] = (data[offset + 3] << 1) & 0xFF;
  data[offset + 4] = (data[offset + 4] << 1) & 0xFF;
}

// ============================================================================
// Mirror Operations
// ============================================================================

/**
 * Flips glyph horizontally (mirrors left-right)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphMirrorHorizontal(data, offset) {
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    let reversed = 0;
    for (let bit = 0; bit < GLYPH_HEIGHT; bit++) {
      reversed = (reversed << 1) | ((byte >> bit) & 1);
    }
    data[offset + row] = reversed;
  }
}

/**
 * Flips glyph vertically (mirrors top-bottom)
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphMirrorVertical(data, offset) {
  const halfHeight = GLYPH_HEIGHT / 2;
  for (let row = 0; row < halfHeight; row++) {
    const temp = data[offset + row];
    data[offset + row] = data[offset + GLYPH_HEIGHT - 1 - row];
    data[offset + GLYPH_HEIGHT - 1 - row] = temp;
  }
}

// ============================================================================
// Rotation Operations
// ============================================================================

/**
 * Rotates glyph 90 degrees clockwise
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphRotate90CW(data, offset) {
  const original = new Uint8Array(GLYPH_HEIGHT);
  for (let i = 0; i < GLYPH_HEIGHT; i++) {
    original[i] = data[offset + i];
  }
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    let newByte = 0;
    for (let col = 0; col < GLYPH_HEIGHT; col++) {
      const bit = (original[GLYPH_HEIGHT - 1 - col] >> (GLYPH_HEIGHT - 1 - row)) & 1;
      newByte |= (bit << (GLYPH_HEIGHT - 1 - col));
    }
    data[offset + row] = newByte;
  }
}

/**
 * Rotates glyph 90 degrees counter-clockwise
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphRotate90CCW(data, offset) {
  const original = new Uint8Array(GLYPH_HEIGHT);
  for (let i = 0; i < GLYPH_HEIGHT; i++) {
    original[i] = data[offset + i];
  }
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    let newByte = 0;
    for (let col = 0; col < GLYPH_HEIGHT; col++) {
      const bit = (original[col] >> row) & 1;
      newByte |= (bit << (GLYPH_HEIGHT - 1 - col));
    }
    data[offset + row] = newByte;
  }
}

/**
 * Rotates glyph 180 degrees
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphRotate180(data, offset) {
  glyphMirrorVertical(data, offset);
  glyphMirrorHorizontal(data, offset);
}

// ============================================================================
// Align Operations (shift until content touches edge)
// ============================================================================

/**
 * Aligns glyph to left edge — shifts left until leftmost set pixel is in bit 7
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphAlignLeft(data, offset) {
  // Find leftmost set column across all rows
  let minCol = 8;
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    if (byte === 0) continue;
    for (let col = 0; col < 8; col++) {
      if ((byte >> (7 - col)) & 1) {
        if (col < minCol) minCol = col;
        break;
      }
    }
  }
  if (minCol === 0 || minCol === 8) return; // already aligned or empty
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] = (data[offset + row] << minCol) & 0xFF;
  }
}

/**
 * Aligns glyph to right edge — shifts right until rightmost set pixel is in bit 0
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphAlignRight(data, offset) {
  // Find rightmost set column across all rows
  let maxCol = -1;
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const byte = data[offset + row];
    if (byte === 0) continue;
    for (let col = 7; col >= 0; col--) {
      if ((byte >> (7 - col)) & 1) {
        if (col > maxCol) maxCol = col;
        break;
      }
    }
  }
  if (maxCol === 7 || maxCol === -1) return; // already aligned or empty
  const shift = 7 - maxCol;
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] = data[offset + row] >> shift;
  }
}

/**
 * Aligns glyph to top edge — shifts up until topmost set row is row 0
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphAlignTop(data, offset) {
  // Find first non-zero row
  let firstRow = -1;
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    if (data[offset + row] !== 0) { firstRow = row; break; }
  }
  if (firstRow <= 0) return; // already aligned or empty
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    data[offset + row] = (row + firstRow < GLYPH_HEIGHT) ? data[offset + row + firstRow] : 0;
  }
}

/**
 * Aligns glyph to bottom edge — shifts down until bottommost set row is row 7
 * @param {Uint8Array} data - Font data array
 * @param {number} offset - Byte offset to glyph
 */
function glyphAlignBottom(data, offset) {
  // Find last non-zero row
  let lastRow = -1;
  for (let row = GLYPH_HEIGHT - 1; row >= 0; row--) {
    if (data[offset + row] !== 0) { lastRow = row; break; }
  }
  if (lastRow === GLYPH_HEIGHT - 1 || lastRow === -1) return; // already aligned or empty
  const shift = GLYPH_HEIGHT - 1 - lastRow;
  for (let row = GLYPH_HEIGHT - 1; row >= 0; row--) {
    data[offset + row] = (row - shift >= 0) ? data[offset + row - shift] : 0;
  }
}
