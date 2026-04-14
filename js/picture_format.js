// @ts-check
"use strict";

// ============================================================================
// Internal Picture Format
// ============================================================================
// Linear-layout internal representation for ZX Spectrum screen data.
// Provides deinterleaved bitmap + attribute storage, import/export for all
// formats, and sync helpers for the legacy screenData buffer.
// ============================================================================

/**
 * @typedef {Object} PicturePlane
 * @property {Uint8Array} bitmap  - Linear bitmap: row-major, 1 bit per pixel, cols bytes per row
 * @property {Uint8Array} attrs   - Attributes: one byte per cell (cols * attrRows)
 */

/**
 * @typedef {Object} PictureBorder
 * @property {Uint8Array} top    - Top border: 64 lines x 24 bytes = 1536 bytes
 * @property {Uint8Array} sides  - Side borders: 192 lines x 8 bytes = 1536 bytes
 * @property {Uint8Array} bottom - Bottom border: 48 lines x 24 bytes = 1152 bytes
 */

/**
 * @typedef {Object} Picture
 * @property {string}  sourceFormat    - Original format id (e.g. 'scr', 'scr+', 'ifl', '53c')
 * @property {string}  fileName        - Original file name
 * @property {number}  width           - Width in pixels (256 for standard SCR)
 * @property {number}  height          - Height in pixels (192 for standard SCR)
 * @property {number}  cols            - Width in bytes (width / 8)
 * @property {number}  attrCellHeight  - Pixel rows per attribute cell (8 for SCR, 2 for IFL, 1 for MLT, 0 for no attrs)
 * @property {number}  attrRows        - Number of attribute rows (Math.ceil(height / attrCellHeight), or 0)
 * @property {number}  planeCount      - Number of planes (1 for SCR, 3 for RGB3, 2 for Gigascreen, 0 for text)
 * @property {PicturePlane[]} planes   - Plane data
 * @property {Uint8Array|null} palette - ULA+ palette (64 bytes GRB332) or null
 * @property {string}  contentMode     - 'pixel' | 'pattern' | 'text'
 * @property {string}  colorMode       - 'standard' | 'gigascreen' | 'rgb3'
 * @property {PictureBorder|null} border - Border data for BSC/BMC4, or null
 * @property {Uint8Array|null} pattern - 8-byte pattern tile for 53c, or null
 * @property {Uint8Array|null} chars       - Character grid for text mode (768 bytes), or null
 * @property {Uint8Array|null} cellColors  - Cell attribute grid for text mode (768 bytes), or null
 * @property {Uint8Array|null} cellMask    - Cell mask for text mode (768 bytes), or null
 * @property {Uint8Array|null} font        - Font data reference for text mode, or null (shared, not cloned)
 */

/**
 * Creates a new Picture with zeroed buffers.
 * @param {Object} opts
 * @param {string}  opts.sourceFormat
 * @param {string}  opts.fileName
 * @param {number}  [opts.width=256]
 * @param {number}  [opts.height=192]
 * @param {number}  [opts.attrCellHeight=8]
 * @param {number}  [opts.planeCount=1]
 * @param {Uint8Array|null} [opts.palette=null]
 * @param {string}  [opts.contentMode='pixel']
 * @param {string}  [opts.colorMode='standard']
 * @returns {Picture}
 */
function makePicture(opts) {
  const width = opts.width || 256;
  const height = opts.height || 192;
  const cols = width >> 3; // width / 8
  const attrCellHeight = (typeof opts.attrCellHeight === 'number') ? opts.attrCellHeight : 8;
  const attrRows = attrCellHeight > 0 ? Math.ceil(height / attrCellHeight) : 0;
  const planeCount = (typeof opts.planeCount === 'number') ? opts.planeCount : 1;
  const contentMode = opts.contentMode || 'pixel';
  const colorMode = opts.colorMode || 'standard';

  const bitmapSize = cols * height;
  const attrSize = cols * attrRows;

  /** @type {PicturePlane[]} */
  const planes = [];
  for (let i = 0; i < planeCount; i++) {
    planes.push({
      bitmap: new Uint8Array(bitmapSize),
      attrs: new Uint8Array(attrSize)
    });
  }

  return {
    sourceFormat: opts.sourceFormat,
    fileName: opts.fileName,
    width,
    height,
    cols,
    attrCellHeight,
    attrRows,
    planeCount,
    planes,
    palette: opts.palette || null,
    contentMode,
    colorMode,
    border: null,
    pattern: null,
    chars: null,
    cellColors: null,
    cellMask: null,
    font: null
  };
}

// ============================================================================
// SCR Interleave / Deinterleave
// ============================================================================
// ZX Spectrum SCR layout: 6144 bytes bitmap (interleaved) + 768 bytes attributes.
// The bitmap is divided into 3 "thirds" (0-63, 64-127, 128-191 pixel rows).
// Within each third, rows are interleaved:
//   address = thirdBase + col + charRow*32 + pixelLine*256
// where pixelLine = y % 8, charRow = (y % 64) >> 3, thirdBase = (y >> 6) * 2048
//
// Linear layout: simply row 0 bytes, row 1 bytes, ... row 191 bytes.
// Each row is 32 bytes (256 pixels / 8).

/**
 * Deinterleaves SCR bitmap (6144 bytes) into linear row-major layout.
 * @param {Uint8Array} fileBytes - Source buffer (at least bitmapOffset + 6144 bytes)
 * @param {number} bitmapOffset - Offset into fileBytes where bitmap starts
 * @param {number} [width=256]  - Width in pixels
 * @param {number} [height=192] - Height in pixels
 * @returns {Uint8Array} Linear bitmap (cols * height bytes)
 */
function deinterleaveBitmap(fileBytes, bitmapOffset, width, height) {
  width = width || 256;
  height = height || 192;
  const cols = width >> 3;
  const linear = new Uint8Array(cols * height);

  for (let y = 0; y < height; y++) {
    const third = (y >> 6);           // y / 64
    const charRow = (y >> 3) & 7;     // (y / 8) % 8
    const pixelLine = y & 7;          // y % 8
    const thirdBase = third * 2048;

    for (let col = 0; col < cols; col++) {
      const scrOffset = bitmapOffset + thirdBase + col + charRow * 32 + pixelLine * 256;
      linear[y * cols + col] = fileBytes[scrOffset];
    }
  }

  return linear;
}

/**
 * Interleaves linear row-major bitmap back into SCR interleaved layout.
 * @param {Uint8Array} linearBitmap - Linear bitmap (cols * height bytes)
 * @param {number} [width=256]  - Width in pixels
 * @param {number} [height=192] - Height in pixels
 * @returns {Uint8Array} SCR-interleaved bitmap (6144 bytes)
 */
function interleaveBitmap(linearBitmap, width, height) {
  width = width || 256;
  height = height || 192;
  const cols = width >> 3;
  const scrBitmap = new Uint8Array(6144);

  for (let y = 0; y < height; y++) {
    const third = (y >> 6);
    const charRow = (y >> 3) & 7;
    const pixelLine = y & 7;
    const thirdBase = third * 2048;

    for (let col = 0; col < cols; col++) {
      const scrOffset = thirdBase + col + charRow * 32 + pixelLine * 256;
      scrBitmap[scrOffset] = linearBitmap[y * cols + col];
    }
  }

  return scrBitmap;
}

// ============================================================================
// Border helpers
// ============================================================================

/**
 * Creates a new empty PictureBorder.
 * @returns {PictureBorder}
 */
function makeBorder() {
  return {
    top: new Uint8Array(1536),    // 64 lines x 24 bytes
    sides: new Uint8Array(1536),  // 192 lines x 8 bytes
    bottom: new Uint8Array(1152)  // 48 lines x 24 bytes
  };
}

/**
 * Extracts border data from screenData at the given offset.
 * Border layout: top (64*24=1536) + sides (192*8=1536) + bottom (48*24=1152) = 4224 bytes.
 * @param {Uint8Array} fileBytes
 * @param {number} offset - Start of border data in fileBytes
 * @returns {PictureBorder}
 */
function extractBorder(fileBytes, offset) {
  const border = makeBorder();
  border.top.set(fileBytes.subarray(offset, offset + 1536));
  border.sides.set(fileBytes.subarray(offset + 1536, offset + 1536 + 1536));
  border.bottom.set(fileBytes.subarray(offset + 1536 + 1536, offset + 1536 + 1536 + 1152));
  return border;
}

/**
 * Writes border data into a target buffer at the given offset.
 * @param {PictureBorder} border
 * @param {Uint8Array} target
 * @param {number} offset
 */
function writeBorder(border, target, offset) {
  target.set(border.top, offset);
  target.set(border.sides, offset + 1536);
  target.set(border.bottom, offset + 1536 + 1536);
}

// ============================================================================
// SCR Import / Export
// ============================================================================

/**
 * Imports a standard 6912-byte SCR file into a Picture.
 * @param {Uint8Array} fileBytes - File data (6912 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importScr(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'scr',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 1,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);

  const attrs = pic.planes[0].attrs;
  for (let i = 0; i < 768; i++) {
    attrs[i] = fileBytes[6144 + i];
  }

  return pic;
}

/**
 * Imports a 6976-byte SCR+ULA+ file into a Picture.
 * @param {Uint8Array} fileBytes - File data (6976 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importScrUlaPlus(fileBytes, fileName) {
  const palette = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    palette[i] = fileBytes[6912 + i];
  }

  const pic = makePicture({
    sourceFormat: 'scr+',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 1,
    palette: palette,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);

  const attrs = pic.planes[0].attrs;
  for (let i = 0; i < 768; i++) {
    attrs[i] = fileBytes[6144 + i];
  }

  return pic;
}

/**
 * Exports a Picture to a standard 6912-byte SCR file.
 * @param {Picture} picture
 * @returns {Uint8Array} 6912-byte SCR data
 */
function exportScr(picture) {
  const result = new Uint8Array(6912);

  const scrBitmap = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  result.set(scrBitmap, 0);

  const attrs = picture.planes[0].attrs;
  for (let i = 0; i < 768; i++) {
    result[6144 + i] = attrs[i];
  }

  return result;
}

/**
 * Exports a Picture to a 6976-byte SCR+ULA+ file.
 * @param {Picture} picture
 * @returns {Uint8Array} 6976-byte SCR+ULA+ data
 */
function exportScrUlaPlus(picture) {
  const result = new Uint8Array(6976);

  const scrData = exportScr(picture);
  result.set(scrData, 0);

  if (picture.palette) {
    result.set(picture.palette, 6912);
  }

  return result;
}

// ============================================================================
// IFL Import / Export (8x2 multicolor, 9216 bytes)
// ============================================================================

/**
 * Imports a 9216-byte IFL file into a Picture.
 * Layout: 6144 bytes interleaved bitmap + 3072 bytes attributes (96 rows x 32 cols).
 * @param {Uint8Array} fileBytes - File data (9216 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importIfl(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'ifl',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 2,
    planeCount: 1,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);

  // 3072 attrs at offset 6144
  const attrs = pic.planes[0].attrs;
  for (let i = 0; i < 3072; i++) {
    attrs[i] = fileBytes[6144 + i];
  }

  return pic;
}

/**
 * Exports a Picture to a 9216-byte IFL file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportIfl(picture) {
  const result = new Uint8Array(9216);

  const scrBitmap = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  result.set(scrBitmap, 0);

  const attrs = picture.planes[0].attrs;
  for (let i = 0; i < 3072; i++) {
    result[6144 + i] = attrs[i];
  }

  return result;
}

// ============================================================================
// MLT Import / Export (8x1 multicolor, 12288 bytes)
// ============================================================================

/**
 * Imports a 12288-byte MLT file into a Picture.
 * Layout: 6144 bytes interleaved bitmap + 6144 bytes attributes (192 rows x 32 cols).
 * @param {Uint8Array} fileBytes - File data (12288 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importMlt(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'mlt',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 1,
    planeCount: 1,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);

  // 6144 attrs at offset 6144 (linear: row y -> offset 6144 + y*32)
  const attrs = pic.planes[0].attrs;
  for (let i = 0; i < 6144; i++) {
    attrs[i] = fileBytes[6144 + i];
  }

  return pic;
}

/**
 * Exports a Picture to a 12288-byte MLT file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportMlt(picture) {
  const result = new Uint8Array(12288);

  const scrBitmap = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  result.set(scrBitmap, 0);

  const attrs = picture.planes[0].attrs;
  for (let i = 0; i < 6144; i++) {
    result[6144 + i] = attrs[i];
  }

  return result;
}

// ============================================================================
// Mono Import / Export (bitmap only, no attributes)
// ============================================================================

/**
 * Imports a monochrome bitmap file into a Picture.
 * @param {Uint8Array} fileBytes - File data (6144, 4096, or 2048 bytes)
 * @param {string} fileName - Original file name
 * @param {number} height - Height in pixels (192, 128, or 64)
 * @returns {Picture}
 */
function importMono(fileBytes, fileName, height) {
  const pic = makePicture({
    sourceFormat: height === 192 ? 'mono_full' : height === 128 ? 'mono_2_3' : 'mono_1_3',
    fileName: fileName,
    width: 256,
    height: height,
    attrCellHeight: 0,
    planeCount: 1,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, height);

  return pic;
}

/**
 * Exports a Picture to a monochrome bitmap file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportMono(picture) {
  const scrBitmap = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  // Only return the portion that matches the height
  const bitmapSize = (picture.width >> 3) * picture.height;
  // interleaveBitmap always returns 6144 bytes; for partial screens, the data
  // sits at the beginning of the interleaved buffer for the covered thirds
  if (picture.height === 192) return scrBitmap.slice(0, 6144);
  if (picture.height === 128) return scrBitmap.slice(0, 4096);
  if (picture.height === 64) return scrBitmap.slice(0, 2048);
  return scrBitmap.slice(0, bitmapSize);
}

// ============================================================================
// BSC Import / Export (SCR + 4224-byte border, 11136 bytes)
// ============================================================================

/**
 * Imports an 11136-byte BSC file into a Picture.
 * Layout: standard SCR (6912 bytes) + border data (4224 bytes).
 * @param {Uint8Array} fileBytes - File data (11136 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importBsc(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'bsc',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 1,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);

  const attrs = pic.planes[0].attrs;
  for (let i = 0; i < 768; i++) {
    attrs[i] = fileBytes[6144 + i];
  }

  // Border at offset 6912
  pic.border = extractBorder(fileBytes, 6912);

  return pic;
}

/**
 * Exports a Picture to an 11136-byte BSC file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportBsc(picture) {
  const result = new Uint8Array(11136);

  // SCR part
  const scrData = exportScr(picture);
  result.set(scrData, 0);

  // Border at offset 6912
  if (picture.border) {
    writeBorder(picture.border, result, 6912);
  }

  return result;
}

// ============================================================================
// BMC4 Import / Export (bitmap + 2 attr banks + border, 11904 bytes)
// ============================================================================

/**
 * Imports an 11904-byte BMC4 file into a Picture.
 * Layout: 6144 bitmap + 768 attr1 (lines 0-3) + 768 attr2 (lines 4-7) + 4224 border.
 * Internally stored as attrCellHeight=4 with interleaved attr banks:
 * bank1[r*32+c] -> attrs[(r*2)*32+c], bank2[r*32+c] -> attrs[(r*2+1)*32+c].
 * @param {Uint8Array} fileBytes - File data (11904 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importBmc4(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'bmc4',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 4,
    planeCount: 1,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);

  // Interleave two 768-byte attr banks into 1536-byte attrs (48 rows x 32 cols)
  // bank1 at offset 6144, bank2 at offset 6912
  const attrs = pic.planes[0].attrs; // 48 rows x 32 cols = 1536 bytes
  for (let r = 0; r < 24; r++) {
    for (let c = 0; c < 32; c++) {
      attrs[(r * 2) * 32 + c] = fileBytes[6144 + r * 32 + c];      // bank1 -> even rows
      attrs[(r * 2 + 1) * 32 + c] = fileBytes[6912 + r * 32 + c];  // bank2 -> odd rows
    }
  }

  // Border at offset 7680
  pic.border = extractBorder(fileBytes, 7680);

  return pic;
}

/**
 * Exports a Picture to an 11904-byte BMC4 file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportBmc4(picture) {
  const result = new Uint8Array(11904);

  // Bitmap
  const scrBitmap = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  result.set(scrBitmap, 0);

  // De-interleave attrs back into two 768-byte banks
  const attrs = picture.planes[0].attrs;
  for (let r = 0; r < 24; r++) {
    for (let c = 0; c < 32; c++) {
      result[6144 + r * 32 + c] = attrs[(r * 2) * 32 + c];      // even rows -> bank1
      result[6912 + r * 32 + c] = attrs[(r * 2 + 1) * 32 + c];  // odd rows -> bank2
    }
  }

  // Border at offset 7680
  if (picture.border) {
    writeBorder(picture.border, result, 7680);
  }

  return result;
}

// ============================================================================
// Gigascreen Import / Export (2 x SCR frames, 13824 bytes)
// ============================================================================

/**
 * Imports a 13824-byte Gigascreen file into a Picture.
 * Two complete SCR frames (6912 bytes each) at offsets 0 and 6912.
 * @param {Uint8Array} fileBytes - File data (13824 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importGigascreen(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'img',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 2,
    contentMode: 'pixel',
    colorMode: 'gigascreen'
  });

  // Frame 1: offset 0
  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);
  for (let i = 0; i < 768; i++) {
    pic.planes[0].attrs[i] = fileBytes[6144 + i];
  }

  // Frame 2: offset 6912
  pic.planes[1].bitmap = deinterleaveBitmap(fileBytes, 6912, 256, 192);
  for (let i = 0; i < 768; i++) {
    pic.planes[1].attrs[i] = fileBytes[6912 + 6144 + i];
  }

  return pic;
}

/**
 * Exports a Picture to a 13824-byte Gigascreen file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportGigascreen(picture) {
  const result = new Uint8Array(13824);

  // Frame 1 at offset 0
  const bm1 = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  result.set(bm1, 0);
  for (let i = 0; i < 768; i++) {
    result[6144 + i] = picture.planes[0].attrs[i];
  }

  // Frame 2 at offset 6912
  const bm2 = interleaveBitmap(picture.planes[1].bitmap, picture.width, picture.height);
  result.set(bm2, 6912);
  for (let i = 0; i < 768; i++) {
    result[6912 + 6144 + i] = picture.planes[1].attrs[i];
  }

  return result;
}

// ============================================================================
// MGH Import / Export (Multiartist multicolor gigascreen)
// ============================================================================

/**
 * Imports a parsed MGH result into a 2-plane Picture.
 * @param {{bitmap1: Uint8Array, attrs1: Uint8Array, bitmap2: Uint8Array, attrs2: Uint8Array, cellHeight: number, border0: number, border1: number}} parseResult
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importMgh(parseResult, fileName) {
  const { bitmap1, attrs1, bitmap2, attrs2, cellHeight } = parseResult;

  const pic = makePicture({
    sourceFormat: 'mgh',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: cellHeight,
    planeCount: 2,
    contentMode: 'pixel',
    colorMode: 'gigascreen'
  });

  pic.planes[0].bitmap.set(bitmap1);
  pic.planes[0].attrs.set(attrs1);
  pic.planes[1].bitmap.set(bitmap2);
  pic.planes[1].attrs.set(attrs2);

  return pic;
}

/**
 * Exports a Picture to an MGH file with 256-byte header.
 * Supports all modes: mg1 (split inner/outer attrs), mg2, mg4, mg8.
 * mg2/mg4/mg8 layout: header(256) + bitmap1(6144) + bitmap2(6144) + attrs1 + attrs2
 * mg1 layout: header(256) + bitmap1(6144) + bitmap2(6144) + innerAttrs1(3072) + innerAttrs2(3072) + outerAttrs1(384) + outerAttrs2(384)
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportMgh(picture) {
  const cellH = picture.attrCellHeight || 8;
  const mode = cellH;

  // Bitmap interleave
  const bm1 = interleaveBitmap(picture.planes[0].bitmap, 256, 192);
  const bm2 = interleaveBitmap(picture.planes[1].bitmap, 256, 192);

  const border1 = (typeof borderColor !== 'undefined' ? borderColor : 0) & 7;
  const border2 = border1;

  if (mode === 1) {
    // mg1: split attrs into inner (cols 8-23, per row) + outer (cols 0-7 & 24-31, per 8-row block)
    const innerSize = 3072; // 192 × 16
    const outerSize = 384;  // 24 blocks × 16 cols
    const totalSize = 256 + 6144 * 2 + innerSize * 2 + outerSize * 2;
    const result = new Uint8Array(totalSize);

    // Header
    result[0] = 0x4D; result[1] = 0x47; result[2] = 0x48;
    result[3] = 1; result[4] = 1;
    result[5] = border1; result[6] = border2;

    result.set(bm1, 256);
    result.set(bm2, 256 + 6144);

    let offset = 256 + 6144 * 2;

    // Inner attrs: extract cols 8-23 for each row
    for (let p = 0; p < 2; p++) {
      const attrs = picture.planes[p].attrs;
      for (let y = 0; y < 192; y++) {
        for (let col = 8; col < 24; col++) {
          result[offset++] = attrs[y * 32 + col];
        }
      }
    }

    // Outer attrs: extract cols 0-7 then 24-31, one attr per 8-row block (take first row of block)
    for (let p = 0; p < 2; p++) {
      const attrs = picture.planes[p].attrs;
      for (let yBlock = 0; yBlock < 192; yBlock += 8) {
        for (let col = 0; col < 8; col++) {
          result[offset++] = attrs[yBlock * 32 + col];
        }
        for (let col = 24; col < 32; col++) {
          result[offset++] = attrs[yBlock * 32 + col];
        }
      }
    }

    return result;
  }

  // mg2/mg4/mg8: straightforward attrs
  const attrSize = picture.planes[0].attrs.length;
  const totalSize = 256 + 6144 * 2 + attrSize * 2;
  const result = new Uint8Array(totalSize);

  // Header
  result[0] = 0x4D; result[1] = 0x47; result[2] = 0x48;
  result[3] = 1; result[4] = mode;
  result[5] = border1; result[6] = border2;

  result.set(bm1, 256);
  result.set(bm2, 256 + 6144);
  result.set(picture.planes[0].attrs.subarray(0, attrSize), 256 + 6144 * 2);
  result.set(picture.planes[1].attrs.subarray(0, attrSize), 256 + 6144 * 2 + attrSize);

  return result;
}

// ============================================================================
// HLR Import / Export (Gigascreen Lowres, 1628 bytes)
// ============================================================================
//
// HLR ("Half Low Res") is a self-extracting Z80 program that displays a
// gigascreen image with a fixed bitmap pattern and two alternating attribute
// banks. The bitmap is filled by the loader from an 8-byte pattern stored
// in the file (one byte per scanline within a char). The standard pattern
// is FF FF FF FF 00 00 00 00 (top 4 rows solid, bottom 4 rows clear), but
// other patterns are valid -- the loader doesn't care.
//
// When the two attribute banks flip at 50Hz, each pixel where the pattern
// bit is 1 shows a blend of the two frames' inks, and each pixel where the
// pattern bit is 0 shows a blend of the two frames' papers. With the standard
// pattern this gives a 32 x 48 grid of half-cells; with a different pattern
// the visible regions can take any 8 x 8 shape.
//
// File layout (1628 bytes total):
//   0x00-0x53 (84 bytes)  : Z80 loader code
//   0x54-0x5B  (8 bytes)  : bitmap pattern (one byte per scanline)
//   0x5C-0x35B (768 bytes): attribute set 1 (standard 32x24 layout)
//   0x35C-0x65B(768 bytes): attribute set 2 (standard 32x24 layout)

/** @type {number[]} 84-byte HLR Z80 loader code (no pattern -- pattern is per-file) */
const HLR_LOADER = [
  0x76, 0xaf, 0xd3, 0xfe, 0x21, 0x00, 0x58, 0x11, 0x01, 0x58, 0x01, 0xff, 0x02, 0x75, 0xed, 0xb0,
  0x21, 0x00, 0x40, 0xcd, 0x43, 0x80, 0x21, 0x00, 0x48, 0xcd, 0x43, 0x80, 0x21, 0x00, 0x50, 0xcd,
  0x43, 0x80, 0x76, 0x21, 0x5c, 0x80, 0x11, 0x00, 0x58, 0x01, 0x00, 0x03, 0xed, 0xb0, 0x76, 0x21,
  0x5c, 0x83, 0x11, 0x00, 0x58, 0x01, 0x00, 0x03, 0xed, 0xb0, 0xaf, 0xdb, 0xfe, 0xf6, 0xe0, 0x3c,
  0x28, 0xe0, 0xc9, 0x11, 0x54, 0x80, 0x06, 0x08, 0x4c, 0x1a, 0x77, 0x13, 0x24, 0x10, 0xfa, 0x61,
  0x2c, 0x20, 0xf0, 0xc9
];

const HLR_TOTAL_SIZE = 1628;
const HLR_LOADER_SIZE = 84;
const HLR_PATTERN_OFFSET = 84;  // 0x54
const HLR_PATTERN_SIZE = 8;
const HLR_ATTRS1_OFFSET = 92;   // 0x5C
const HLR_ATTRS2_OFFSET = 860;  // 0x35C
const HLR_ATTRS_SIZE = 768;

/** @type {number[]} Default HLR bitmap pattern: top 4 rows ink, bottom 4 rows paper */
const HLR_DEFAULT_PATTERN = [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00];

/**
 * Builds the 6144-byte linear bitmap for an HLR picture from its 8-byte pattern.
 * Every 8x8 char cell is filled with the pattern (one byte per scanline).
 * @param {Uint8Array|number[]|null} [pattern] - 8-byte pattern, or null/missing for default
 * @returns {Uint8Array}
 */
function makeHlrFixedBitmap(pattern) {
  const bitmap = new Uint8Array(6144); // 32 cols x 192 rows
  const usePattern = (pattern && pattern.length === HLR_PATTERN_SIZE) ? pattern : HLR_DEFAULT_PATTERN;
  for (let y = 0; y < 192; y++) {
    const rowInChar = y & 7;
    const fill = usePattern[rowInChar];
    const rowOffset = y * 32;
    for (let col = 0; col < 32; col++) {
      bitmap[rowOffset + col] = fill;
    }
  }
  return bitmap;
}

/**
 * Imports a 1628-byte HLR file into a 2-plane gigascreen Picture.
 * The 8-byte fill pattern is read from offset 0x54 and stored on pic.pattern;
 * the bitmap planes are filled from that pattern, and the two attribute banks
 * are read from offsets 0x5C and 0x35C.
 * @param {Uint8Array} fileBytes - File data (1628 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importHlr(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'hlr',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 2,
    contentMode: 'pixel',
    colorMode: 'gigascreen'
  });

  // Read the 8-byte fill pattern from the file
  const pattern = new Uint8Array(HLR_PATTERN_SIZE);
  for (let i = 0; i < HLR_PATTERN_SIZE; i++) {
    pattern[i] = fileBytes[HLR_PATTERN_OFFSET + i];
  }
  pic.pattern = pattern;

  // Tile the pattern into both bitmap planes
  const fixedBitmap = makeHlrFixedBitmap(pattern);
  pic.planes[0].bitmap.set(fixedBitmap);
  pic.planes[1].bitmap.set(fixedBitmap);

  for (let i = 0; i < HLR_ATTRS_SIZE; i++) {
    pic.planes[0].attrs[i] = fileBytes[HLR_ATTRS1_OFFSET + i];
    pic.planes[1].attrs[i] = fileBytes[HLR_ATTRS2_OFFSET + i];
  }

  return pic;
}

/**
 * Exports a Picture to a 1628-byte HLR file.
 * The picture's bitmap is ignored on export (the loader fills it from the
 * 8-byte pattern); only picture.pattern (or the default pattern if missing)
 * and the two attribute banks from planes[0] and planes[1] are written.
 * @param {Picture} picture
 * @returns {Uint8Array} 1628-byte HLR data
 */
function exportHlr(picture) {
  const result = new Uint8Array(HLR_TOTAL_SIZE);

  // Loader code (84 bytes)
  for (let i = 0; i < HLR_LOADER.length; i++) {
    result[i] = HLR_LOADER[i];
  }

  // Bitmap pattern (8 bytes) -- use picture.pattern if present, else default
  const pattern = (picture.pattern && picture.pattern.length === HLR_PATTERN_SIZE)
    ? picture.pattern : HLR_DEFAULT_PATTERN;
  for (let i = 0; i < HLR_PATTERN_SIZE; i++) {
    result[HLR_PATTERN_OFFSET + i] = pattern[i];
  }

  // Attribute banks
  const attrs1 = picture.planes[0].attrs;
  const attrs2 = picture.planes[1].attrs;
  for (let i = 0; i < HLR_ATTRS_SIZE; i++) {
    result[HLR_ATTRS1_OFFSET + i] = attrs1[i] || 0;
    result[HLR_ATTRS2_OFFSET + i] = attrs2[i] || 0;
  }

  return result;
}

// ============================================================================
// STL Import / Export (Stellar 64×48 multicolor + gigascreen, 3072 bytes)
// ============================================================================
//
// STL ("Stellar") is a compact gigascreen multicolor format with 64×48 fat
// pixels (each 4×4 real pixels). Two attribute frames (1536 bytes each) are
// interleaved in 4-byte groups: [f1_a, f1_b, f2_a, f2_b]. The bitmap is a
// fixed pattern 0x0F for every byte: left 4 pixels = paper, right 4 pixels =
// ink, giving each 8×4 multicolor cell two independently colorable halves.
//
// File layout (3072 bytes total):
//   Interleaved attrs: for each pair index j (0..1535 step 2):
//     byte[j*2+0] = frame1[j], byte[j*2+1] = frame1[j+1],
//     byte[j*2+2] = frame2[j], byte[j*2+3] = frame2[j+1]

const STL_TOTAL_SIZE = 3072;
const STL_ATTRS_PER_FRAME = 1536;  // 32 cols × 48 rows

/**
 * Imports a 3072-byte STL file into a 2-plane gigascreen Picture with
 * attrCellHeight=4.
 * De-interleaves 4-byte groups into two 1536-byte attribute frames;
 * both plane bitmaps are filled with the fixed 0x0F pattern.
 * @param {Uint8Array} fileBytes - File data (3072 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importStl(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'stl',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 4,
    planeCount: 2,
    contentMode: 'pixel',
    colorMode: 'gigascreen'
  });

  // De-interleave 4-byte groups into two 1536-byte attr frames
  const frame1 = new Uint8Array(STL_ATTRS_PER_FRAME);
  const frame2 = new Uint8Array(STL_ATTRS_PER_FRAME);
  for (let i = 0, j = 0; i < STL_TOTAL_SIZE; i += 4, j += 2) {
    frame1[j]     = fileBytes[i];
    frame1[j + 1] = fileBytes[i + 1];
    frame2[j]     = fileBytes[i + 2];
    frame2[j + 1] = fileBytes[i + 3];
  }

  // Fill both plane bitmaps with fixed 0x0F pattern
  for (let y = 0; y < 192; y++) {
    const rowOff = y * 32;
    for (let col = 0; col < 32; col++) {
      pic.planes[0].bitmap[rowOff + col] = 0x0F;
      pic.planes[1].bitmap[rowOff + col] = 0x0F;
    }
  }

  pic.planes[0].attrs.set(frame1);
  pic.planes[1].attrs.set(frame2);

  return pic;
}

/**
 * Exports a Picture to a 3072-byte STL file.
 * Re-interleaves two 1536-byte attr frames into 4-byte groups.
 * The bitmap is ignored on export (fixed 0x0F pattern).
 * @param {Picture} picture
 * @returns {Uint8Array} 3072-byte STL data
 */
function exportStl(picture) {
  const result = new Uint8Array(STL_TOTAL_SIZE);
  const attrs1 = picture.planes[0].attrs;
  const attrs2 = picture.planes[1].attrs;

  for (let j = 0, i = 0; j < STL_ATTRS_PER_FRAME; j += 2, i += 4) {
    result[i]     = attrs1[j]     || 0;
    result[i + 1] = attrs1[j + 1] || 0;
    result[i + 2] = attrs2[j]     || 0;
    result[i + 3] = attrs2[j + 1] || 0;
  }

  return result;
}

// ============================================================================
// BSP Import / Export (header + screen + optional border + optional gigascreen)
// ============================================================================

/**
 * Imports a BSP file into a Picture.
 * Supports 4 variants: screen-only, screen+border, gigascreen, gigascreen+border.
 * @param {Uint8Array} fileBytes - Raw BSP file data
 * @param {string} fileName - Original file name
 * @returns {Picture|null}
 */
function importBsp(fileBytes, fileName) {
  if (typeof parseBspHeader !== 'function') return null;
  const header = parseBspHeader(fileBytes);
  if (!header) return null;

  const dataOffset = 70; // BSP.HEADER_SIZE
  const hasGiga = header.hasGiga;
  const hasBorder = header.hasBorder;

  if (hasGiga) {
    // Gigascreen: 2 planes
    const pic = makePicture({
      sourceFormat: 'bsp',
      fileName: fileName,
      width: 256,
      height: 192,
      attrCellHeight: 8,
      planeCount: 2,
      contentMode: 'pixel',
      colorMode: 'gigascreen'
    });

    if (hasBorder) {
      // Giga+border layout: [header:70][secondBorderOffset:2][screen1:6912][screen2:6912][border1_RLE][border2_RLE]
      const secondBorderOffset = fileBytes[dataOffset] | (fileBytes[dataOffset + 1] << 8);
      const screensStart = dataOffset + 2; // offset 72

      // Frame 1: offset 72
      pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, screensStart, 256, 192);
      for (let i = 0; i < 768; i++) {
        pic.planes[0].attrs[i] = fileBytes[screensStart + 6144 + i];
      }
      // Frame 2: offset 72 + 6912
      pic.planes[1].bitmap = deinterleaveBitmap(fileBytes, screensStart + 6912, 256, 192);
      for (let i = 0; i < 768; i++) {
        pic.planes[1].attrs[i] = fileBytes[screensStart + 6912 + 6144 + i];
      }

      // Decode borders from RLE
      const border1Start = screensStart + 6912 * 2; // after both screens
      if (typeof decodeBspBorder === 'function') {
        const border1Len = secondBorderOffset > 0 ? secondBorderOffset - border1Start : fileBytes.length - border1Start;
        const rawBorder1 = decodeBspBorder(fileBytes, border1Start, border1Len);
        pic.border = extractBorder(rawBorder1, 0);
        // Second border stored as bspBorder2 for gigascreen flicker
        if (secondBorderOffset > 0 && secondBorderOffset < fileBytes.length) {
          const rawBorder2 = decodeBspBorder(fileBytes, secondBorderOffset, fileBytes.length - secondBorderOffset);
          pic.bspBorder2 = extractBorder(rawBorder2, 0);
        }
      }
    } else {
      // Giga without border: [header:70][screen1:6912][screen2:6912]
      // Frame 1: offset 70
      pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, dataOffset, 256, 192);
      for (let i = 0; i < 768; i++) {
        pic.planes[0].attrs[i] = fileBytes[dataOffset + 6144 + i];
      }
      // Frame 2: offset 70 + 6912
      pic.planes[1].bitmap = deinterleaveBitmap(fileBytes, dataOffset + 6912, 256, 192);
      for (let i = 0; i < 768; i++) {
        pic.planes[1].attrs[i] = fileBytes[dataOffset + 6912 + 6144 + i];
      }
    }

    pic.bspTitle = header.title;
    pic.bspAuthor = header.author;
    pic.bspConfig = header.config;
    pic.bspBorderColor = header.borderColor;

    return pic;

  } else {
    // Single screen: 1 plane
    const pic = makePicture({
      sourceFormat: 'bsp',
      fileName: fileName,
      width: 256,
      height: 192,
      attrCellHeight: 8,
      planeCount: 1,
      contentMode: 'pixel',
      colorMode: 'standard'
    });

    pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, dataOffset, 256, 192);
    for (let i = 0; i < 768; i++) {
      pic.planes[0].attrs[i] = fileBytes[dataOffset + 6144 + i];
    }

    if (hasBorder && typeof decodeBspBorder === 'function') {
      const borderRleStart = dataOffset + 6912;
      const rawBorder = decodeBspBorder(fileBytes, borderRleStart, fileBytes.length - borderRleStart);
      pic.border = extractBorder(rawBorder, 0);
    }

    pic.bspTitle = header.title;
    pic.bspAuthor = header.author;
    pic.bspConfig = header.config;
    pic.bspBorderColor = header.borderColor;

    return pic;
  }
}

/**
 * Exports a Picture to BSP file format.
 * @param {Picture} picture
 * @returns {Uint8Array|null}
 */
function exportBsp(picture) {
  const hasGiga = picture.colorMode === 'gigascreen' && picture.planeCount >= 2;
  const hasBorder = !!picture.border;
  const config = (hasGiga ? 0x80 : 0) | (hasBorder ? 0x40 : 0);

  // Build header (70 bytes)
  const header = new Uint8Array(70);
  header[0] = 0x62; header[1] = 0x73; header[2] = 0x70; // "bsp"
  header[3] = config;
  header[4] = 0; // reserved
  header[5] = (picture.bspBorderColor != null) ? (picture.bspBorderColor & 7) : 0;

  // Title
  const title = picture.bspTitle || '';
  for (let i = 0; i < 32 && i < title.length; i++) {
    header[6 + i] = title.charCodeAt(i) & 0x7F;
  }
  // Author
  const author = picture.bspAuthor || '';
  for (let i = 0; i < 32 && i < author.length; i++) {
    header[38 + i] = author.charCodeAt(i) & 0x7F;
  }

  // Build data sections
  const screen1 = exportScr(picture);

  if (!hasGiga && !hasBorder) {
    // Screen only
    const result = new Uint8Array(70 + 6912);
    result.set(header, 0);
    result.set(screen1, 70);
    return result;
  }

  if (!hasGiga && hasBorder) {
    // Screen + border RLE
    const rawBorder = new Uint8Array(4224);
    writeBorder(picture.border, rawBorder, 0);
    let borderRle;
    if (typeof encodeBspBorder === 'function') {
      borderRle = encodeBspBorder(rawBorder);
    } else {
      borderRle = new Uint8Array(0);
    }
    const result = new Uint8Array(70 + 6912 + borderRle.length);
    result.set(header, 0);
    result.set(screen1, 70);
    result.set(borderRle, 70 + 6912);
    return result;
  }

  // Build screen2 for gigascreen
  const screen2Bm = interleaveBitmap(picture.planes[1].bitmap, picture.width, picture.height);
  const screen2 = new Uint8Array(6912);
  screen2.set(screen2Bm, 0);
  for (let i = 0; i < 768; i++) {
    screen2[6144 + i] = picture.planes[1].attrs[i];
  }

  if (hasGiga && !hasBorder) {
    // Gigascreen: 2 × 6912
    const result = new Uint8Array(70 + 6912 * 2);
    result.set(header, 0);
    result.set(screen1, 70);
    result.set(screen2, 70 + 6912);
    return result;
  }

  // Gigascreen + border: [header][screen1][screen2][secondBorderOffset:2LE][border1_RLE][border2_RLE]
  const rawBorder1 = new Uint8Array(4224);
  writeBorder(picture.border, rawBorder1, 0);
  let border1Rle;
  if (typeof encodeBspBorder === 'function') {
    border1Rle = encodeBspBorder(rawBorder1);
  } else {
    border1Rle = new Uint8Array(0);
  }

  let border2Rle = new Uint8Array(0);
  if (picture.bspBorder2) {
    const rawBorder2 = new Uint8Array(4224);
    writeBorder(picture.bspBorder2, rawBorder2, 0);
    if (typeof encodeBspBorder === 'function') {
      border2Rle = encodeBspBorder(rawBorder2);
    }
  }

  // Layout: [header:70][secondBorderOffset:2][screen1:6912][screen2:6912][border1_RLE][border2_RLE]
  const border1Start = 70 + 2 + 6912 * 2;
  const secondBorderOffset = border1Start + border1Rle.length;
  const totalSize = secondBorderOffset + border2Rle.length;
  const result = new Uint8Array(totalSize);
  result.set(header, 0);
  result[70] = secondBorderOffset & 0xFF;
  result[71] = (secondBorderOffset >> 8) & 0xFF;
  result.set(screen1, 72);
  result.set(screen2, 72 + 6912);
  result.set(border1Rle, border1Start);
  result.set(border2Rle, secondBorderOffset);
  return result;
}

// ============================================================================
// RGB3 Import / Export (3 x bitmap planes, 18432 bytes)
// ============================================================================

/**
 * Imports an 18432-byte RGB3 file into a Picture.
 * Three separate interleaved bitmaps: R (0), G (6144), B (12288). No attributes.
 * @param {Uint8Array} fileBytes - File data (18432 bytes)
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importRgb3(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'rgb3',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 0,
    planeCount: 3,
    contentMode: 'pixel',
    colorMode: 'rgb3'
  });

  // Red plane at offset 0
  pic.planes[0].bitmap = deinterleaveBitmap(fileBytes, 0, 256, 192);
  // Green plane at offset 6144
  pic.planes[1].bitmap = deinterleaveBitmap(fileBytes, 6144, 256, 192);
  // Blue plane at offset 12288
  pic.planes[2].bitmap = deinterleaveBitmap(fileBytes, 12288, 256, 192);

  return pic;
}

/**
 * Exports a Picture to an 18432-byte RGB3 file.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportRgb3(picture) {
  const result = new Uint8Array(18432);

  const bmR = interleaveBitmap(picture.planes[0].bitmap, picture.width, picture.height);
  result.set(bmR, 0);

  const bmG = interleaveBitmap(picture.planes[1].bitmap, picture.width, picture.height);
  result.set(bmG, 6144);

  const bmB = interleaveBitmap(picture.planes[2].bitmap, picture.width, picture.height);
  result.set(bmB, 12288);

  return result;
}

// ============================================================================
// 53c/ATR Import / Export (768-byte attribute grid + pattern)
// ============================================================================

/**
 * Imports a 768-byte 53c/ATR attribute file into a Picture.
 * The bitmap is generated from a repeating 8-byte pattern tile.
 * @param {Uint8Array} fileBytes - File data (768 bytes)
 * @param {string} fileName - Original file name
 * @param {Uint8Array|number[]} pattern - 8-byte pattern tile
 * @returns {Picture}
 */
function import53c(fileBytes, fileName, pattern) {
  const pic = makePicture({
    sourceFormat: '53c',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 1,
    contentMode: 'pattern',
    colorMode: 'standard'
  });

  // Store pattern
  pic.pattern = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    pic.pattern[i] = pattern[i];
  }

  // Attrs at offset 0 (the entire file is attrs)
  const attrs = pic.planes[0].attrs;
  for (let i = 0; i < 768; i++) {
    attrs[i] = fileBytes[i];
  }

  // Generate bitmap from pattern tile
  const bitmap = pic.planes[0].bitmap;
  const cols = pic.cols; // 32
  for (let y = 0; y < 192; y++) {
    const patternByte = pic.pattern[y & 7]; // y % 8
    for (let col = 0; col < cols; col++) {
      bitmap[y * cols + col] = patternByte;
    }
  }

  return pic;
}

/**
 * Exports a Picture to a 768-byte 53c attribute file.
 * Only attributes are stored; bitmap is generated from pattern at load time.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function export53c(picture) {
  const result = new Uint8Array(768);
  const attrs = picture.planes[0].attrs;
  for (let i = 0; i < 768; i++) {
    const a = attrs[i];
    const ink = a & 0x07;
    const paper = (a >> 3) & 0x07;
    if (paper > ink) {
      // Normalize: swap ink/paper so ink >= paper (ChunkyPaint compatibility).
      // Checkerboard pattern is symmetric, so visual result is identical.
      result[i] = (a & 0xC0) | (ink << 3) | paper;
    } else {
      result[i] = a;
    }
  }
  return result;
}

// ============================================================================
// SPECSCII Import / Export (text mode, variable-length stream)
// ============================================================================
// SPECSCII import/export is handled by specsciiStreamToGrids() / specsciiGridsToStream()
// in screen_editor.js. The Picture object stores chars/cellColors/cellMask references.
// These functions create the Picture wrapper.

/**
 * Imports a SPECSCII stream into a Picture.
 * The actual stream parsing is done by specsciiStreamToGrids() in screen_editor.js;
 * this function creates the Picture wrapper with text mode fields.
 * @param {Uint8Array} fileBytes - Variable-length SPECSCII stream
 * @param {string} fileName - Original file name
 * @returns {Picture}
 */
function importSpecscii(fileBytes, fileName) {
  const pic = makePicture({
    sourceFormat: 'specscii',
    fileName: fileName,
    width: 256,
    height: 192,
    attrCellHeight: 8,
    planeCount: 0,
    contentMode: 'text',
    colorMode: 'standard'
  });

  // Allocate text mode grids
  pic.chars = new Uint8Array(768);
  pic.chars.fill(0x20); // spaces
  pic.cellColors = new Uint8Array(768);
  pic.cellColors.fill(0x38); // white paper, black ink
  pic.cellMask = new Uint8Array(768);

  return pic;
}

/**
 * Exports a SPECSCII Picture.
 * The actual stream serialization is done by specsciiGridsToStream() in screen_editor.js.
 * This returns an empty array — the caller should use the stream serializer directly.
 * @param {Picture} picture
 * @returns {Uint8Array}
 */
function exportSpecscii(picture) {
  // Serialization is handled by specsciiGridsToStream() which works from global grids.
  // Return empty — callers use the stream serializer directly.
  return new Uint8Array(0);
}

// ============================================================================
// ZXP variable-size import/export
// ============================================================================

/**
 * Imports a non-standard-size ZXP into a Picture.
 * Bitmap and attrs are already in linear layout from parseZxpFile.
 * @param {Uint8Array} bitmap - Linear row-major bitmap (cols * height bytes)
 * @param {Uint8Array} attrs - Linear attributes (cols * attrRows bytes)
 * @param {string} fileName - Original file name
 * @param {number} width - Width in pixels
 * @param {number} height - Height in pixels
 * @param {number} attrCellHeight - Pixels per attribute cell
 * @param {Uint8Array|null} palette - Optional ULA+ palette (64 bytes) or null
 * @returns {Picture}
 */
function importZxp(bitmap, attrs, fileName, width, height, attrCellHeight, palette) {
  const pic = makePicture({
    sourceFormat: 'zxp',
    fileName: fileName,
    width: width,
    height: height,
    attrCellHeight: attrCellHeight,
    planeCount: 1,
    palette: palette,
    contentMode: 'pixel',
    colorMode: 'standard'
  });

  pic.planes[0].bitmap.set(bitmap);
  pic.planes[0].attrs.set(attrs);

  return pic;
}

/**
 * Exports a ZXP Picture to ZXP text format string.
 * @param {Picture} picture
 * @returns {string} ZXP text content
 */
function exportZxp(picture) {
  const width = picture.width;
  const height = picture.height;
  const cols = picture.cols;
  const bitmap = picture.planes[0].bitmap;
  const attrs = picture.planes[0].attrs;

  const lines = [];
  // Header
  lines.push('ZX-Paintbrush extended image');
  lines.push(''); // empty line after header

  // Bitmap lines: each pixel row as binary digits
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let byteCol = 0; byteCol < cols; byteCol++) {
      const b = bitmap[y * cols + byteCol];
      for (let bit = 7; bit >= 0; bit--) {
        line += (b >> bit) & 1 ? '1' : '0';
      }
    }
    lines.push(line);
  }

  // Empty separator
  lines.push('');

  // Attribute lines: hex values separated by spaces
  const attrRows = picture.attrRows;
  for (let row = 0; row < attrRows; row++) {
    const parts = [];
    for (let col = 0; col < cols; col++) {
      parts.push(attrs[row * cols + col].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(parts.join(' '));
  }

  // Optional palette
  if (picture.palette) {
    lines.push('');
    const palParts = [];
    for (let i = 0; i < 64; i++) {
      palParts.push(picture.palette[i].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(palParts.join(' '));
  }

  lines.push(''); // trailing newline
  return lines.join('\n');
}

// ============================================================================
// Clone helper
// ============================================================================

/**
 * Deep-clones a Picture (all typed arrays are copied, not shared).
 * Returns null if input is null/undefined.
 * @param {Picture|null|undefined} picture
 * @returns {Picture|null}
 */
function clonePicture(picture) {
  if (!picture) return null;
  return {
    sourceFormat: picture.sourceFormat,
    fileName: picture.fileName,
    width: picture.width,
    height: picture.height,
    cols: picture.cols,
    attrCellHeight: picture.attrCellHeight,
    attrRows: picture.attrRows,
    planeCount: picture.planeCount,
    planes: picture.planes.map(p => ({
      bitmap: new Uint8Array(p.bitmap),
      attrs: new Uint8Array(p.attrs)
    })),
    palette: picture.palette ? new Uint8Array(picture.palette) : null,
    contentMode: picture.contentMode || 'pixel',
    colorMode: picture.colorMode || 'standard',
    border: picture.border ? {
      top: new Uint8Array(picture.border.top),
      sides: new Uint8Array(picture.border.sides),
      bottom: new Uint8Array(picture.border.bottom)
    } : null,
    pattern: picture.pattern ? new Uint8Array(picture.pattern) : null,
    chars: picture.chars ? new Uint8Array(picture.chars) : null,
    cellColors: picture.cellColors ? new Uint8Array(picture.cellColors) : null,
    cellMask: picture.cellMask ? new Uint8Array(picture.cellMask) : null,
    font: picture.font, // shared reference, not cloned
    nirvanaTileInfo: picture.nirvanaTileInfo ? Object.assign({}, picture.nirvanaTileInfo) : undefined
  };
}

// ============================================================================
// Format descriptor table
// ============================================================================
// Maps sourceFormat string -> layout parameters for the sync bridge.

/** @type {Object<string, Object>} */
const FORMAT_DESCRIPTORS = {
  'scr':       { bitmapOffset: 0, attrOffset: 6144, attrSize: 768 },
  'scr+':      { bitmapOffset: 0, attrOffset: 6144, attrSize: 768 },
  'ifl':       { bitmapOffset: 0, attrOffset: 6144, attrSize: 3072 },
  'mlt':       { bitmapOffset: 0, attrOffset: 6144, attrSize: 6144 },
  'bsc':       { bitmapOffset: 0, attrOffset: 6144, attrSize: 768, borderOffset: 6912 },
  'bmc4':      { bitmapOffset: 0, attrBank1Offset: 6144, attrBank2Offset: 6912, borderOffset: 7680 },
  'img':       { frame1Offset: 0, frame2Offset: 6912 },
  'rgb3':      { redOffset: 0, greenOffset: 6144, blueOffset: 12288 },
  'mono_full': { bitmapOffset: 0, height: 192 },
  'mono_2_3':  { bitmapOffset: 0, height: 128 },
  'mono_1_3':  { bitmapOffset: 0, height: 64 },
  '53c':       { attrOffset: 0, attrSize: 768, isPattern: true },
  'specscii':  { isText: true },
  'zxp':       { isLinear: true },
  'ch$':       { isLinear: true },
  'mgh':       { isLinear: true }
};

// ============================================================================
// Generalized sync bridge (screenData <-> Picture)
// ============================================================================

/**
 * Syncs screenData (format-specific interleaved layout) into an existing Picture.
 * Dispatches based on picture.sourceFormat to handle each format's data layout.
 * @param {Uint8Array} scrData - screenData buffer
 * @param {Picture} picture - Target picture to update
 */
function syncPictureFromScreenData(scrData, picture) {
  const fmt = picture.sourceFormat;
  const cols = picture.cols;
  const height = picture.height;

  if (fmt === '53c') {
    // Pattern mode: attrs at offset 0, regenerate bitmap from pattern
    const attrs = picture.planes[0].attrs;
    for (let i = 0; i < 768; i++) {
      attrs[i] = scrData[i];
    }
    // Regenerate bitmap from pattern
    if (picture.pattern) {
      const bitmap = picture.planes[0].bitmap;
      for (let y = 0; y < height; y++) {
        const patternByte = picture.pattern[y & 7];
        for (let col = 0; col < cols; col++) {
          bitmap[y * cols + col] = patternByte;
        }
      }
    }
    return;
  }

  if (fmt === 'specscii') {
    // Text mode: copy from global specscii grids if they exist
    if (picture.chars && typeof specsciiCharGrid !== 'undefined' && specsciiCharGrid) {
      picture.chars.set(specsciiCharGrid);
    }
    if (picture.cellColors && typeof specsciiAttrGrid !== 'undefined' && specsciiAttrGrid) {
      picture.cellColors.set(specsciiAttrGrid);
    }
    if (picture.cellMask && typeof specsciiMask !== 'undefined' && specsciiMask) {
      picture.cellMask.set(specsciiMask);
    }
    return;
  }

  if (fmt === 'img' || fmt === 'mgh' || fmt === 'hlr' || fmt === 'stl' ||
      (fmt === 'bsp' && picture.colorMode === 'gigascreen')) {
    // Gigascreen / MGH / HLR / STL / BSP-giga: two complete frames in interleaved layout
    const attrSize = picture.planes[0].attrs.length; // 768 for mg8/.img/.hlr/bsp, 1536 for mg4/stl, 3072 for mg2, 6144 for mg1
    const frameSize = 6144 + attrSize;
    picture.planes[0].bitmap = deinterleaveBitmap(scrData, 0, 256, 192);
    for (let i = 0; i < attrSize; i++) {
      picture.planes[0].attrs[i] = scrData[6144 + i];
    }
    picture.planes[1].bitmap = deinterleaveBitmap(scrData, frameSize, 256, 192);
    for (let i = 0; i < attrSize; i++) {
      picture.planes[1].attrs[i] = scrData[frameSize + 6144 + i];
    }
    // BSP giga+border: border is stored on picture.border, NOT in screenData
    // (screenData only has the 13824-byte IMG layout for giga)
    return;
  }

  if (fmt === 'rgb3') {
    // RGB3: three separate bitmaps, no attrs
    picture.planes[0].bitmap = deinterleaveBitmap(scrData, 0, 256, 192);
    picture.planes[1].bitmap = deinterleaveBitmap(scrData, 6144, 256, 192);
    picture.planes[2].bitmap = deinterleaveBitmap(scrData, 12288, 256, 192);
    return;
  }

  if (fmt === 'zxp' || fmt === 'ch$' || fmt === 'mgh') {
    // ZXP/chr$/MGH: linear layout — bitmap at offset 0, attrs at offset cols*height
    const bitmapSize = cols * height;
    const attrSize = picture.planes[0].attrs.length;
    const frameSize = bitmapSize + attrSize;
    const frameCount = picture.planeCount;
    for (let f = 0; f < frameCount; f++) {
      const off = f * frameSize;
      const bitmap = picture.planes[f].bitmap;
      for (let i = 0; i < bitmapSize; i++) {
        bitmap[i] = scrData[off + i];
      }
      const attrs = picture.planes[f].attrs;
      for (let i = 0; i < attrSize; i++) {
        attrs[i] = scrData[off + bitmapSize + i];
      }
    }
    return;
  }

  if (fmt === 'bmc4') {
    // BMC4: bitmap + two attr banks + border
    picture.planes[0].bitmap = deinterleaveBitmap(scrData, 0, 256, 192);
    const attrs = picture.planes[0].attrs;
    for (let r = 0; r < 24; r++) {
      for (let c = 0; c < 32; c++) {
        attrs[(r * 2) * 32 + c] = scrData[6144 + r * 32 + c];
        attrs[(r * 2 + 1) * 32 + c] = scrData[6912 + r * 32 + c];
      }
    }
    if (picture.border) {
      picture.border = extractBorder(scrData, 7680);
    }
    return;
  }

  // Standard pixel formats: scr, scr+, ifl, mlt, bsc, mono_*
  // Deinterleave bitmap from offset 0
  const bitmap = picture.planes[0].bitmap;
  for (let y = 0; y < height; y++) {
    const third = (y >> 6);
    const charRow = (y >> 3) & 7;
    const pixelLine = y & 7;
    const thirdBase = third * 2048;

    for (let col = 0; col < cols; col++) {
      const scrOffset = thirdBase + col + charRow * 32 + pixelLine * 256;
      bitmap[y * cols + col] = scrData[scrOffset];
    }
  }

  // Copy attributes based on format
  if (fmt === 'ifl') {
    const attrs = picture.planes[0].attrs;
    for (let i = 0; i < 3072; i++) {
      attrs[i] = scrData[6144 + i];
    }
  } else if (fmt === 'mlt') {
    const attrs = picture.planes[0].attrs;
    for (let i = 0; i < 6144; i++) {
      attrs[i] = scrData[6144 + i];
    }
  } else if (picture.attrCellHeight > 0) {
    // SCR, SCR+, BSC: 768 attrs at offset 6144
    const attrs = picture.planes[0].attrs;
    for (let i = 0; i < attrs.length; i++) {
      attrs[i] = scrData[6144 + i];
    }
  }

  // Copy border for BSC / BSP (non-giga with border)
  if ((fmt === 'bsc' || fmt === 'bsp') && picture.border) {
    picture.border = extractBorder(scrData, 6912);
  }
}

// ============================================================================
// Import dispatcher (format string -> import function)
// ============================================================================

/**
 * Imports file bytes into a Picture based on format string.
 * Returns null for formats that don't support Picture import (SCA, UNKNOWN).
 * @param {string} format - FORMAT constant value (e.g. 'scr', 'ifl', '53c')
 * @param {Uint8Array} fileBytes - File data
 * @param {string} fileName - Original file name
 * @param {Object} [opts] - Extra options
 * @param {Uint8Array|number[]} [opts.pattern] - Pattern for 53c format
 * @returns {Picture|null}
 */
function importPicture(format, fileBytes, fileName, opts) {
  switch (format) {
    case 'scr':       return importScr(fileBytes, fileName);
    case 'scr+':      return importScrUlaPlus(fileBytes, fileName);
    case 'scr_ulanext': return importScr(fileBytes, fileName);
    case 'ifl':       return importIfl(fileBytes, fileName);
    case 'mlt':       return importMlt(fileBytes, fileName);
    case 'mono_full': return importMono(fileBytes, fileName, 192);
    case 'mono_2_3':  return importMono(fileBytes, fileName, 128);
    case 'mono_1_3':  return importMono(fileBytes, fileName, 64);
    case 'bsc':       return importBsc(fileBytes, fileName);
    case 'bmc4':      return importBmc4(fileBytes, fileName);
    case 'img':       return importGigascreen(fileBytes, fileName);
    case 'hlr':       return importHlr(fileBytes, fileName);
    case 'stl':       return importStl(fileBytes, fileName);
    case 'bsp':       return importBsp(fileBytes, fileName);
    case 'rgb3':      return importRgb3(fileBytes, fileName);
    case '53c': {
      const pat = (opts && opts.pattern) || [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55];
      return import53c(fileBytes, fileName, pat);
    }
    case 'specscii':  return importSpecscii(fileBytes, fileName);
    case 'zxp':       return null; // ZXP import uses importZxp() directly with parsed dimensions
    default:          return null;
  }
}

/**
 * Exports a Picture to file bytes based on its sourceFormat.
 * Returns null for formats that don't support Picture export.
 * @param {Picture} picture
 * @returns {Uint8Array|null}
 */
function exportPicture(picture) {
  switch (picture.sourceFormat) {
    case 'scr':       return exportScr(picture);
    case 'scr+':      return exportScrUlaPlus(picture);
    case 'ifl':       return exportIfl(picture);
    case 'mlt':       return exportMlt(picture);
    case 'mono_full':
    case 'mono_2_3':
    case 'mono_1_3':  return exportMono(picture);
    case 'bsc':       return exportBsc(picture);
    case 'bmc4':      return exportBmc4(picture);
    case 'img':       return exportGigascreen(picture);
    case 'mgh':       return exportMgh(picture);
    case 'hlr':       return exportHlr(picture);
    case 'stl':       return exportStl(picture);
    case 'bsp':       return exportBsp(picture);
    case 'rgb3':      return exportRgb3(picture);
    case '53c':       return export53c(picture);
    case 'specscii':  return exportSpecscii(picture);
    case 'zxp':       return null; // ZXP export uses exportZxp() which returns string, not Uint8Array
    default:          return null;
  }
}
