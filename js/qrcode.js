// SpectraLab QR Code Generator v1.30.0
// Minimal QR code implementation for URLs and alphanumeric text
// Based on public domain qrcode-generator algorithm
// @ts-check
"use strict";

/**
 * QR Code Generator
 * Supports alphanumeric and byte modes with error correction level M (15% recovery)
 */

// ============================================================================
// Constants
// ============================================================================

// Error correction level M (15% recovery) - codeword capacities per version
// Format: [total data codewords, EC codewords per block, block count group1, data cw group1, block count group2, data cw group2]
const EC_BLOCKS_M = [
  null, // Version 0 doesn't exist
  [16, 10, 1, 16, 0, 0],     // Version 1: 21x21
  [28, 16, 1, 28, 0, 0],     // Version 2: 25x25
  [44, 26, 1, 44, 0, 0],     // Version 3: 29x29
  [64, 18, 2, 32, 0, 0],     // Version 4: 33x33
  [86, 24, 2, 43, 0, 0],     // Version 5: 37x37
  [108, 16, 4, 27, 0, 0],    // Version 6: 41x41
  [124, 18, 4, 31, 0, 0],    // Version 7: 45x45
  [154, 22, 2, 38, 2, 39],   // Version 8: 49x49
  [182, 22, 3, 36, 2, 37],   // Version 9: 53x53
  [216, 26, 4, 43, 1, 44],   // Version 10: 57x57
  [254, 30, 1, 50, 4, 51],   // Version 11: 61x61
  [290, 22, 6, 36, 2, 37],   // Version 12: 65x65
  [334, 22, 8, 37, 1, 38],   // Version 13: 69x69
  [365, 24, 4, 40, 5, 41],   // Version 14: 73x73
  [415, 24, 5, 41, 5, 42],   // Version 15: 77x77
  [453, 28, 7, 45, 3, 46],   // Version 16: 81x81
  [507, 28, 10, 46, 1, 47],  // Version 17: 85x85
  [563, 26, 9, 43, 4, 44],   // Version 18: 89x89
  [627, 26, 3, 44, 11, 45],  // Version 19: 93x93
  [669, 26, 3, 41, 13, 42],  // Version 20: 97x97
];

// Character capacity for alphanumeric mode (level M)
const ALPHANUMERIC_CAPACITY_M = [
  0, 20, 38, 61, 90, 122, 154, 178, 221, 262, 311, 366, 419, 483, 528, 600, 656, 734, 816, 909, 970
];

// Character capacity for byte mode (level M)
const BYTE_CAPACITY_M = [
  0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666
];

// Alignment pattern positions per version
const ALIGNMENT_POSITIONS = [
  null,
  [],                           // Version 1
  [6, 18],                      // Version 2
  [6, 22],                      // Version 3
  [6, 26],                      // Version 4
  [6, 30],                      // Version 5
  [6, 34],                      // Version 6
  [6, 22, 38],                  // Version 7
  [6, 24, 42],                  // Version 8
  [6, 26, 46],                  // Version 9
  [6, 28, 50],                  // Version 10
  [6, 30, 54],                  // Version 11
  [6, 32, 58],                  // Version 12
  [6, 34, 62],                  // Version 13
  [6, 26, 46, 66],              // Version 14
  [6, 26, 48, 70],              // Version 15
  [6, 26, 50, 74],              // Version 16
  [6, 30, 54, 78],              // Version 17
  [6, 30, 56, 82],              // Version 18
  [6, 30, 58, 86],              // Version 19
  [6, 34, 62, 90],              // Version 20
];

// Alphanumeric encoding table
const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Generator polynomials for Reed-Solomon (precomputed for common EC codeword counts)
const RS_GENERATOR_POLY = {};

// ============================================================================
// Galois Field arithmetic (GF(2^8))
// ============================================================================

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfPow(x, power) {
  return GF_EXP[(GF_LOG[x] * power) % 255];
}

// ============================================================================
// Reed-Solomon encoding
// ============================================================================

function getRsGeneratorPoly(ecCodewords) {
  if (RS_GENERATOR_POLY[ecCodewords]) return RS_GENERATOR_POLY[ecCodewords];

  let poly = [1];
  for (let i = 0; i < ecCodewords; i++) {
    const newPoly = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= poly[j];
      newPoly[j + 1] ^= gfMul(poly[j], gfPow(2, i));
    }
    poly = newPoly;
  }

  RS_GENERATOR_POLY[ecCodewords] = poly;
  return poly;
}

function rsEncode(data, ecCodewords) {
  const gen = getRsGeneratorPoly(ecCodewords);
  const result = new Uint8Array(ecCodewords);

  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ result[0];
    for (let j = 0; j < ecCodewords - 1; j++) {
      result[j] = result[j + 1] ^ gfMul(gen[j + 1], coef);
    }
    result[ecCodewords - 1] = gfMul(gen[ecCodewords], coef);
  }

  return result;
}

// ============================================================================
// Data encoding
// ============================================================================

function isAlphanumeric(text) {
  for (let i = 0; i < text.length; i++) {
    if (ALPHANUMERIC_CHARS.indexOf(text.charAt(i).toUpperCase()) === -1) {
      return false;
    }
  }
  return true;
}

function getMinVersionForText(text) {
  const len = text.length;
  const isAlpha = isAlphanumeric(text);
  const capacity = isAlpha ? ALPHANUMERIC_CAPACITY_M : BYTE_CAPACITY_M;

  for (let v = 1; v <= 20; v++) {
    if (len <= capacity[v]) return v;
  }
  return -1; // Text too long
}

function getMaxVersionForSize(moduleSize, maxPixels) {
  // Find the largest version that fits within maxPixels
  for (let v = 20; v >= 1; v--) {
    const moduleCount = 17 + v * 4;
    if (moduleCount * moduleSize <= maxPixels) return v;
  }
  return -1; // Even version 1 doesn't fit
}

function encodeData(text, version) {
  const isAlpha = isAlphanumeric(text);
  const bits = [];

  // Mode indicator
  if (isAlpha) {
    bits.push(0, 0, 1, 0); // Alphanumeric mode = 0010
  } else {
    bits.push(0, 1, 0, 0); // Byte mode = 0100
  }

  // Character count indicator
  const ccBits = version <= 9 ? (isAlpha ? 9 : 8) : (isAlpha ? 11 : 16);
  const textLen = text.length;
  for (let i = ccBits - 1; i >= 0; i--) {
    bits.push((textLen >> i) & 1);
  }

  // Encode data
  if (isAlpha) {
    const upper = text.toUpperCase();
    for (let i = 0; i < upper.length; i += 2) {
      if (i + 1 < upper.length) {
        const val = ALPHANUMERIC_CHARS.indexOf(upper[i]) * 45 + ALPHANUMERIC_CHARS.indexOf(upper[i + 1]);
        for (let j = 10; j >= 0; j--) bits.push((val >> j) & 1);
      } else {
        const val = ALPHANUMERIC_CHARS.indexOf(upper[i]);
        for (let j = 5; j >= 0; j--) bits.push((val >> j) & 1);
      }
    }
  } else {
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code > 255) code = 63; // Replace non-Latin1 with '?'
      for (let j = 7; j >= 0; j--) bits.push((code >> j) & 1);
    }
  }

  // Add terminator (up to 4 zeros)
  const ecInfo = EC_BLOCKS_M[version];
  const totalDataBits = ecInfo[0] * 8;
  const termLen = Math.min(4, totalDataBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad with 0xEC and 0x11 alternately
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    const padByte = padBytes[padIdx++ % 2];
    for (let j = 7; j >= 0; j--) bits.push((padByte >> j) & 1);
  }

  // Convert to bytes
  const dataBytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < dataBytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i * 8 + j];
    }
    dataBytes[i] = byte;
  }

  return dataBytes;
}

function addErrorCorrection(dataBytes, version) {
  const ecInfo = EC_BLOCKS_M[version];
  const ecCodewords = ecInfo[1];
  const blocks1 = ecInfo[2];
  const dataCw1 = ecInfo[3];
  const blocks2 = ecInfo[4];
  const dataCw2 = ecInfo[5];

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  // Split data into blocks and generate EC for each
  for (let i = 0; i < blocks1; i++) {
    const block = dataBytes.slice(offset, offset + dataCw1);
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, ecCodewords));
    offset += dataCw1;
  }
  for (let i = 0; i < blocks2; i++) {
    const block = dataBytes.slice(offset, offset + dataCw2);
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, ecCodewords));
    offset += dataCw2;
  }

  // Interleave data codewords
  const result = [];
  const maxDataLen = Math.max(dataCw1, dataCw2);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }

  // Interleave EC codewords
  for (let i = 0; i < ecCodewords; i++) {
    for (const block of ecBlocks) {
      result.push(block[i]);
    }
  }

  return new Uint8Array(result);
}

// ============================================================================
// Module placement
// ============================================================================

function createMatrix(version) {
  const size = 17 + version * 4;
  const matrix = [];
  const reserved = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array(size).fill(null));
    reserved.push(new Array(size).fill(false));
  }
  return { matrix, reserved, size };
}

function placeFinderPattern(matrix, reserved, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= matrix.length || cc < 0 || cc >= matrix.length) continue;

      let dark = false;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          dark = true;
        }
      }
      matrix[rr][cc] = dark;
      reserved[rr][cc] = true;
    }
  }
}

function placeAlignmentPattern(matrix, reserved, row, col) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = row + r;
      const cc = col + c;
      if (reserved[rr][cc]) return; // Skip if overlaps finder

      const dark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      matrix[rr][cc] = dark;
      reserved[rr][cc] = true;
    }
  }
}

function placeTimingPatterns(matrix, reserved, size) {
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!reserved[6][i]) {
      matrix[6][i] = dark;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      matrix[i][6] = dark;
      reserved[i][6] = true;
    }
  }
}

function reserveFormatAndVersion(reserved, version, size) {
  // Format info areas
  for (let i = 0; i < 9; i++) {
    reserved[i][8] = true;
    reserved[8][i] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[size - 1 - i][8] = true;
    reserved[8][size - 1 - i] = true;
  }

  // Dark module
  reserved[size - 8][8] = true;

  // Version info areas (version 7+)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[size - 11 + j][i] = true;
        reserved[i][size - 11 + j] = true;
      }
    }
  }
}

function placeDataBits(matrix, reserved, size, data) {
  let bitIdx = 0;
  let up = true;

  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // Skip vertical timing pattern

    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i;

      for (let dc = 0; dc <= 1; dc++) {
        const c = col - dc;
        if (!reserved[row][c]) {
          if (bitIdx < data.length * 8) {
            const byteIdx = Math.floor(bitIdx / 8);
            const bitPos = 7 - (bitIdx % 8);
            matrix[row][c] = ((data[byteIdx] >> bitPos) & 1) === 1;
            bitIdx++;
          } else {
            matrix[row][c] = false;
          }
        }
      }
    }
    up = !up;
  }
}

// ============================================================================
// Masking
// ============================================================================

const MASK_PATTERNS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(matrix, reserved, size, maskPattern) {
  const result = [];
  for (let r = 0; r < size; r++) {
    result.push([]);
    for (let c = 0; c < size; c++) {
      let val = matrix[r][c];
      if (!reserved[r][c] && MASK_PATTERNS[maskPattern](r, c)) {
        val = !val;
      }
      result[r].push(val);
    }
  }
  return result;
}

function calculatePenalty(matrix, size) {
  let penalty = 0;

  // Rule 1: Consecutive same-color modules in row/column
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        count++;
      } else {
        if (count >= 5) penalty += 3 + (count - 5);
        count = 1;
      }
    }
    if (count >= 5) penalty += 3 + (count - 5);
  }

  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        count++;
      } else {
        if (count >= 5) penalty += 3 + (count - 5);
        count = 1;
      }
    }
    if (count >= 5) penalty += 3 + (count - 5);
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = matrix[r][c];
      if (matrix[r][c + 1] === val && matrix[r + 1][c] === val && matrix[r + 1][c + 1] === val) {
        penalty += 3;
      }
    }
  }

  // Rule 3: Finder-like patterns (simplified check)
  const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      let match1 = true, match2 = true;
      for (let i = 0; i < 11; i++) {
        if (matrix[r][c + i] !== pattern1[i]) match1 = false;
        if (matrix[r][c + i] !== pattern2[i]) match2 = false;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      let match1 = true, match2 = true;
      for (let i = 0; i < 11; i++) {
        if (matrix[r + i][c] !== pattern1[i]) match1 = false;
        if (matrix[r + i][c] !== pattern2[i]) match2 = false;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  // Rule 4: Proportion of dark modules
  let dark = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) dark++;
    }
  }
  const percent = (dark * 100) / (size * size);
  const prev5 = Math.floor(percent / 5) * 5;
  const next5 = prev5 + 5;
  penalty += Math.min(Math.abs(prev5 - 50), Math.abs(next5 - 50)) * 2;

  return penalty;
}

function selectBestMask(matrix, reserved, size) {
  let bestMask = 0;
  let bestPenalty = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(matrix, reserved, size, mask);
    const penalty = calculatePenalty(masked, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
  }

  return bestMask;
}

// ============================================================================
// Format and version information
// ============================================================================

// Precomputed format strings for error correction level M (01) and masks 0-7
const FORMAT_STRINGS = [
  0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0
];

function placeFormatInfo(matrix, size, maskPattern) {
  const formatBits = FORMAT_STRINGS[maskPattern];

  // Place around top-left finder
  for (let i = 0; i < 6; i++) {
    matrix[8][i] = ((formatBits >> (14 - i)) & 1) === 1;
    matrix[i][8] = ((formatBits >> i) & 1) === 1;
  }
  matrix[8][7] = ((formatBits >> 8) & 1) === 1;
  matrix[8][8] = ((formatBits >> 7) & 1) === 1;
  matrix[7][8] = ((formatBits >> 6) & 1) === 1;

  // Place around other finders
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = ((formatBits >> i) & 1) === 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = ((formatBits >> (14 - i)) & 1) === 1;
  }

  // Dark module
  matrix[size - 8][8] = true;
}

// Version information for versions 7-20 (precomputed)
const VERSION_INFO = [
  null, null, null, null, null, null, null,
  0x07C94, 0x085BC, 0x09A99, 0x0A4D3, 0x0BBF6, 0x0C762, 0x0D847, 0x0E60D,
  0x0F928, 0x10B78, 0x1145D, 0x12A17, 0x13532, 0x149A6
];

function placeVersionInfo(matrix, version, size) {
  if (version < 7) return;

  const versionBits = VERSION_INFO[version];
  let bitIdx = 0;

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      const bit = ((versionBits >> bitIdx) & 1) === 1;
      matrix[size - 11 + j][i] = bit;
      matrix[i][size - 11 + j] = bit;
      bitIdx++;
    }
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generates a QR code from text with fixed module size
 * @param {string} text - Text to encode (URL or alphanumeric)
 * @param {number} moduleSize - Size of each QR module in pixels (1, 2, 4, or 8 for grid alignment)
 * @param {number} [maxPixels=192] - Maximum size in pixels (default: 192 for ZX Spectrum screen height)
 * @param {number} [forceVersion=0] - Force specific QR version (1-20), or 0 for auto
 * @returns {{modules: boolean[][], moduleCount: number, moduleSize: number, actualSize: number, version: number}|null}
 */
function generateQR(text, moduleSize, maxPixels, forceVersion) {
  if (!text || text.length === 0) return null;
  if (!maxPixels) maxPixels = 192;

  // Find minimum version that can hold the text
  const minVersion = getMinVersionForText(text);
  if (minVersion < 1) return null; // Text too long for any QR version

  // Find maximum version that fits within maxPixels with this moduleSize
  const maxVersion = getMaxVersionForSize(moduleSize, maxPixels);
  if (maxVersion < 1) return null; // Module size too large

  // Determine version to use
  let version;
  if (forceVersion && forceVersion >= 1 && forceVersion <= 20) {
    // Forced version - check if text fits and size fits
    if (forceVersion < minVersion) return null; // Text too long for this version
    if (forceVersion > maxVersion) return null; // Version too large for screen
    version = forceVersion;
  } else {
    // Auto: use minimum version if it fits, otherwise fail
    if (minVersion > maxVersion) return null; // Text requires more modules than can fit
    version = minVersion;
  }
  const moduleCount = 17 + version * 4;
  const actualSize = moduleCount * moduleSize;

  // Encode data
  const dataBytes = encodeData(text, version);
  const codewords = addErrorCorrection(dataBytes, version);

  // Create matrix
  const { matrix, reserved, size } = createMatrix(version);

  // Place finder patterns
  placeFinderPattern(matrix, reserved, 0, 0);
  placeFinderPattern(matrix, reserved, 0, size - 7);
  placeFinderPattern(matrix, reserved, size - 7, 0);

  // Place alignment patterns
  const alignPos = ALIGNMENT_POSITIONS[version];
  if (alignPos && alignPos.length > 0) {
    for (const r of alignPos) {
      for (const c of alignPos) {
        // Skip if overlapping with finder patterns
        if ((r < 9 && c < 9) || (r < 9 && c > size - 10) || (r > size - 10 && c < 9)) continue;
        placeAlignmentPattern(matrix, reserved, r, c);
      }
    }
  }

  // Place timing patterns
  placeTimingPatterns(matrix, reserved, size);

  // Reserve format and version info areas
  reserveFormatAndVersion(reserved, version, size);

  // Place data
  placeDataBits(matrix, reserved, size, codewords);

  // Find best mask and apply
  const bestMask = selectBestMask(matrix, reserved, size);
  const maskedMatrix = applyMask(matrix, reserved, size, bestMask);

  // Place format info
  placeFormatInfo(maskedMatrix, size, bestMask);

  // Place version info
  placeVersionInfo(maskedMatrix, version, size);

  return {
    modules: maskedMatrix,
    moduleCount: moduleCount,
    moduleSize: moduleSize,
    actualSize: actualSize,
    version: version
  };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.generateQR = generateQR;
}
