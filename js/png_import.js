// SpectraLab v1.20.0 - PNG/GIF Image Import
// @ts-check
"use strict";

// ============================================================================
// PNG Import Module
// Converts PNG/GIF/JPG images to ZX Spectrum SCR format (6912 bytes)
// ============================================================================

/**
 * Perceptual color distance using weighted RGB
 * @param {number[]} rgb1 - First color [R, G, B]
 * @param {number[]} rgb2 - Second color [R, G, B]
 * @returns {number} Distance value
 */
function colorDistance(rgb1, rgb2) {
  const rMean = (rgb1[0] + rgb2[0]) / 2;
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  const rWeight = 2 + rMean / 256;
  const gWeight = 4;
  const bWeight = 2 + (255 - rMean) / 256;
  return Math.sqrt(rWeight * dr * dr + gWeight * dg * dg + bWeight * db * db);
}

/**
 * Find nearest palette color index
 * @param {number[]} rgb - Target color [R, G, B]
 * @param {number[][]} palette - Array of [R, G, B] colors
 * @returns {number} Nearest color index
 */
function findNearestColor(rgb, palette) {
  let minDist = Infinity;
  let nearest = 0;
  for (let i = 0; i < palette.length; i++) {
    const dist = colorDistance(rgb, palette[i]);
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }
  return nearest;
}

/**
 * Clamp value to 0-255 range
 * @param {number} val - Value to clamp
 * @returns {number} Clamped value
 */
function clamp(val) {
  return Math.max(0, Math.min(255, Math.round(val)));
}

/**
 * Apply brightness and contrast adjustment
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 * @param {number} brightness - Brightness adjustment (-100 to 100)
 * @param {number} contrast - Contrast adjustment (-100 to 100)
 */
function applyBrightnessContrast(pixels, brightness, contrast) {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp(factor * (pixels[i] - 128 + brightness) + 128);
    pixels[i + 1] = clamp(factor * (pixels[i + 1] - 128 + brightness) + 128);
    pixels[i + 2] = clamp(factor * (pixels[i + 2] - 128 + brightness) + 128);
  }
}

/**
 * Convert pixels to grayscale
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 */
function applyGrayscale(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
  }
}

/**
 * Apply saturation adjustment
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 * @param {number} saturation - Saturation adjustment (-100 to 100)
 */
function applySaturation(pixels, saturation) {
  const factor = (saturation + 100) / 100; // 0 to 2
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    pixels[i] = clamp(gray + factor * (r - gray));
    pixels[i + 1] = clamp(gray + factor * (g - gray));
    pixels[i + 2] = clamp(gray + factor * (b - gray));
  }
}

/**
 * Apply gamma correction
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 * @param {number} gamma - Gamma value (0.2 to 3.0, 1.0 = no change)
 */
function applyGamma(pixels, gamma) {
  const invGamma = 1 / gamma;
  // Build lookup table for performance
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(255 * Math.pow(i / 255, invGamma));
  }
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = lut[pixels[i]];
    pixels[i + 1] = lut[pixels[i + 1]];
    pixels[i + 2] = lut[pixels[i + 2]];
  }
}

/**
 * Apply color balance (RGB channel adjustment)
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 * @param {number} r - Red adjustment (-50 to 50)
 * @param {number} g - Green adjustment (-50 to 50)
 * @param {number} b - Blue adjustment (-50 to 50)
 */
function applyColorBalance(pixels, r, g, b) {
  if (r === 0 && g === 0 && b === 0) return;

  // Scale adjustments to a reasonable range
  const rAdj = r * 2.55; // -127.5 to 127.5
  const gAdj = g * 2.55;
  const bAdj = b * 2.55;

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp(pixels[i] + rAdj);
    pixels[i + 1] = clamp(pixels[i + 1] + gAdj);
    pixels[i + 2] = clamp(pixels[i + 2] + bAdj);
  }
}

/**
 * Apply levels adjustment (black point / white point)
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 * @param {number} blackPoint - Input black point (0-127)
 * @param {number} whitePoint - Input white point (128-255)
 */
function applyLevels(pixels, blackPoint, whitePoint) {
  if (blackPoint === 0 && whitePoint === 255) return;

  // Build lookup table for performance
  const range = whitePoint - blackPoint;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (i <= blackPoint) {
      lut[i] = 0;
    } else if (i >= whitePoint) {
      lut[i] = 255;
    } else {
      lut[i] = clamp(((i - blackPoint) / range) * 255);
    }
  }

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = lut[pixels[i]];
    pixels[i + 1] = lut[pixels[i + 1]];
    pixels[i + 2] = lut[pixels[i + 2]];
  }
}

/**
 * Apply sharpening using unsharp mask technique
 * @param {Uint8ClampedArray} pixels - Image data pixels (RGBA)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} amount - Sharpening amount (0-100)
 */
function applySharpening(pixels, width, height, amount) {
  if (amount <= 0) return;

  const strength = amount / 100; // 0 to 1

  // Create copy of original pixels
  const original = new Uint8ClampedArray(pixels);

  // Sharpening kernel (3x3 Laplacian-based)
  // Center = 5, neighbors = -1, diagonals = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) { // R, G, B channels
        const center = original[idx + c];
        const top = original[((y - 1) * width + x) * 4 + c];
        const bottom = original[((y + 1) * width + x) * 4 + c];
        const left = original[(y * width + (x - 1)) * 4 + c];
        const right = original[(y * width + (x + 1)) * 4 + c];

        // High-pass filter: center * 5 - neighbors
        const sharp = center * 5 - top - bottom - left - right;
        // Blend original with sharpened based on strength
        const blended = center + (sharp - center) * strength;
        pixels[idx + c] = clamp(blended);
      }
    }
  }
}

/**
 * Floyd-Steinberg dithering
 * @param {Float32Array} pixels - Floating point RGB pixels (width * height * 3)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number[][]} palette - Target palette colors
 */
function floydSteinbergDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const oldR = pixels[idx];
      const oldG = pixels[idx + 1];
      const oldB = pixels[idx + 2];

      const nearest = findNearestColor([oldR, oldG, oldB], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];

      const errR = oldR - newColor[0];
      const errG = oldG - newColor[1];
      const errB = oldB - newColor[2];

      // Distribute error to neighbors
      if (x + 1 < width) {
        const i = idx + 3;
        pixels[i] += errR * 7 / 16;
        pixels[i + 1] += errG * 7 / 16;
        pixels[i + 2] += errB * 7 / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          const i = ((y + 1) * width + (x - 1)) * 3;
          pixels[i] += errR * 3 / 16;
          pixels[i + 1] += errG * 3 / 16;
          pixels[i + 2] += errB * 3 / 16;
        }
        {
          const i = ((y + 1) * width + x) * 3;
          pixels[i] += errR * 5 / 16;
          pixels[i + 1] += errG * 5 / 16;
          pixels[i + 2] += errB * 5 / 16;
        }
        if (x + 1 < width) {
          const i = ((y + 1) * width + (x + 1)) * 3;
          pixels[i] += errR * 1 / 16;
          pixels[i + 1] += errG * 1 / 16;
          pixels[i + 2] += errB * 1 / 16;
        }
      }
    }
  }
}

/**
 * Atkinson dithering (lighter, more contrast)
 * @param {Float32Array} pixels - Floating point RGB pixels
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number[][]} palette - Target palette colors
 */
function atkinsonDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const oldR = pixels[idx];
      const oldG = pixels[idx + 1];
      const oldB = pixels[idx + 2];

      const nearest = findNearestColor([oldR, oldG, oldB], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];

      const errR = (oldR - newColor[0]) / 8;
      const errG = (oldG - newColor[1]) / 8;
      const errB = (oldB - newColor[2]) / 8;

      // Atkinson: 1/8 to each of 6 neighbors
      const neighbors = [
        [x + 1, y], [x + 2, y],
        [x - 1, y + 1], [x, y + 1], [x + 1, y + 1],
        [x, y + 2]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const i = (ny * width + nx) * 3;
          pixels[i] += errR;
          pixels[i + 1] += errG;
          pixels[i + 2] += errB;
        }
      }
    }
  }
}

/**
 * Bayer 4x4 ordered dithering matrix
 */
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

/**
 * Bayer 8x8 ordered dithering matrix
 */
const BAYER_8X8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];

/**
 * Generic error diffusion dithering
 * @param {Float32Array} pixels - Floating point RGB pixels
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number[][]} palette - Target palette colors
 * @param {Array<[number, number, number]>} kernel - Error diffusion kernel [[dx, dy, weight], ...]
 */
function errorDiffusionDither(pixels, width, height, palette, kernel) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const oldR = pixels[idx];
      const oldG = pixels[idx + 1];
      const oldB = pixels[idx + 2];

      const nearest = findNearestColor([oldR, oldG, oldB], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];

      const errR = oldR - newColor[0];
      const errG = oldG - newColor[1];
      const errB = oldB - newColor[2];

      for (const [dx, dy, weight] of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 3;
          pixels[nIdx] += errR * weight;
          pixels[nIdx + 1] += errG * weight;
          pixels[nIdx + 2] += errB * weight;
        }
      }
    }
  }
}

/**
 * Jarvis-Judice-Ninke dithering (larger kernel, smoother results)
 */
function jarvisDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 7/48], [2, 0, 5/48],
    [-2, 1, 3/48], [-1, 1, 5/48], [0, 1, 7/48], [1, 1, 5/48], [2, 1, 3/48],
    [-2, 2, 1/48], [-1, 2, 3/48], [0, 2, 5/48], [1, 2, 3/48], [2, 2, 1/48]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel);
}

/**
 * Stucki dithering (good edge preservation)
 */
function stuckiDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 8/42], [2, 0, 4/42],
    [-2, 1, 2/42], [-1, 1, 4/42], [0, 1, 8/42], [1, 1, 4/42], [2, 1, 2/42],
    [-2, 2, 1/42], [-1, 2, 2/42], [0, 2, 4/42], [1, 2, 2/42], [2, 2, 1/42]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel);
}

/**
 * Burkes dithering (simplified, faster)
 */
function burkesDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 8/32], [2, 0, 4/32],
    [-2, 1, 2/32], [-1, 1, 4/32], [0, 1, 8/32], [1, 1, 4/32], [2, 1, 2/32]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel);
}

/**
 * Sierra dithering (three-line kernel)
 */
function sierraDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 5/32], [2, 0, 3/32],
    [-2, 1, 2/32], [-1, 1, 4/32], [0, 1, 5/32], [1, 1, 4/32], [2, 1, 2/32],
    [-1, 2, 2/32], [0, 2, 3/32], [1, 2, 2/32]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel);
}

/**
 * Sierra Lite dithering (two-line, faster)
 */
function sierraLiteDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 2/4],
    [-1, 1, 1/4], [0, 1, 1/4]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel);
}

/**
 * Ordered (Bayer 4x4) dithering
 */
function orderedDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const threshold = (BAYER_4X4[y % 4][x % 4] / 16 - 0.5) * 64;

      const r = clamp(pixels[idx] + threshold);
      const g = clamp(pixels[idx + 1] + threshold);
      const b = clamp(pixels[idx + 2] + threshold);

      const nearest = findNearestColor([r, g, b], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];
    }
  }
}

/**
 * Ordered (Bayer 8x8) dithering - finer pattern
 */
function ordered8Dither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const threshold = (BAYER_8X8[y % 8][x % 8] / 64 - 0.5) * 64;

      const r = clamp(pixels[idx] + threshold);
      const g = clamp(pixels[idx + 1] + threshold);
      const b = clamp(pixels[idx + 2] + threshold);

      const nearest = findNearestColor([r, g, b], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];
    }
  }
}

/**
 * Random noise dithering
 */
function noiseDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const noise = (Math.random() - 0.5) * 64;

      const r = clamp(pixels[idx] + noise);
      const g = clamp(pixels[idx + 1] + noise);
      const b = clamp(pixels[idx + 2] + noise);

      const nearest = findNearestColor([r, g, b], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];
    }
  }
}

/**
 * Get combined palette (16 colors: 8 regular + 8 bright)
 * Uses the import dialog's selected palette
 * @returns {{regular: number[][], bright: number[][]}}
 */
function getCombinedPalette() {
  // Use import palette colors (set when palette dropdown changes)
  if (importPaletteColors.regular.length > 0) {
    return {
      regular: importPaletteColors.regular.slice(),
      bright: importPaletteColors.bright.slice()
    };
  }
  // Fallback to current display palette
  return {
    regular: ZX_PALETTE_RGB.REGULAR.slice(),
    bright: ZX_PALETTE_RGB.BRIGHT.slice()
  };
}

/**
 * Update crop input fields from importCrop state
 */
function updateCropInputs() {
  const cropX = /** @type {HTMLInputElement} */ (document.getElementById('importCropX'));
  const cropY = /** @type {HTMLInputElement} */ (document.getElementById('importCropY'));
  const cropW = /** @type {HTMLInputElement} */ (document.getElementById('importCropW'));
  const cropH = /** @type {HTMLInputElement} */ (document.getElementById('importCropH'));

  if (cropX) cropX.value = String(importCrop.x);
  if (cropY) cropY.value = String(importCrop.y);
  if (cropW) cropW.value = String(importCrop.w);
  if (cropH) cropH.value = String(importCrop.h);
}

/**
 * Read crop values from input fields
 */
function readCropInputs() {
  const cropX = /** @type {HTMLInputElement} */ (document.getElementById('importCropX'));
  const cropY = /** @type {HTMLInputElement} */ (document.getElementById('importCropY'));
  const cropW = /** @type {HTMLInputElement} */ (document.getElementById('importCropW'));
  const cropH = /** @type {HTMLInputElement} */ (document.getElementById('importCropH'));

  if (cropX) importCrop.x = Math.max(0, parseInt(cropX.value, 10) || 0);
  if (cropY) importCrop.y = Math.max(0, parseInt(cropY.value, 10) || 0);
  if (cropW) importCrop.w = Math.max(1, parseInt(cropW.value, 10) || 256);
  if (cropH) importCrop.h = Math.max(1, parseInt(cropH.value, 10) || 192);

  // Clamp to image bounds
  if (importImage) {
    importCrop.x = Math.min(importCrop.x, importImage.naturalWidth - 1);
    importCrop.y = Math.min(importCrop.y, importImage.naturalHeight - 1);
    importCrop.w = Math.min(importCrop.w, importImage.naturalWidth - importCrop.x);
    importCrop.h = Math.min(importCrop.h, importImage.naturalHeight - importCrop.y);
  }
}

/**
 * Apply palette by ID to import palette colors
 * @param {string} paletteId - Palette ID
 */
function applyImportPalette(paletteId) {
  const palette = PALETTES.find(p => p.id === paletteId);
  if (!palette) return;

  importPaletteId = paletteId;
  importPaletteColors.regular = [];
  importPaletteColors.bright = [];

  for (let i = 0; i < 8; i++) {
    importPaletteColors.regular.push(hexToRgb(palette.colors[i]));
    importPaletteColors.bright.push(hexToRgb(palette.colors[i + 8]));
  }
}

/**
 * Analyze 8x8 cell and find best ink/paper combination
 * @param {Float32Array} pixels - Dithered pixels array
 * @param {number} cellX - Cell X position (0-31)
 * @param {number} cellY - Cell Y position (0-23)
 * @param {number} width - Image width (256)
 * @returns {{ink: number, paper: number, bright: boolean, bitmap: Uint8Array}}
 */
function analyzeCell(pixels, cellX, cellY, width) {
  const palette = getCombinedPalette();

  // Collect all 64 pixel colors
  const cellColors = [];
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = cellX * 8 + dx;
      const py = cellY * 8 + dy;
      const idx = (py * width + px) * 3;
      cellColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  let bestError = Infinity;
  let bestInk = 0;
  let bestPaper = 7;
  let bestBright = false;
  let bestBitmap = new Uint8Array(8);

  // Try all ink/paper combinations for both brightness levels
  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;
        const bitmap = new Uint8Array(8);

        for (let i = 0; i < 64; i++) {
          const color = cellColors[i];
          const inkDist = colorDistance(color, pal[ink]);
          const paperDist = colorDistance(color, pal[paper]);

          const dy = Math.floor(i / 8);
          const dx = i % 8;

          if (inkDist < paperDist) {
            totalError += inkDist;
            bitmap[dy] |= (0x80 >> dx); // Set bit for ink
          } else {
            totalError += paperDist;
            // Paper is 0, no need to set bit
          }
        }

        if (totalError < bestError) {
          bestError = totalError;
          bestInk = ink;
          bestPaper = paper;
          bestBright = bright === 1;
          bestBitmap = bitmap;
        }
      }
    }
  }

  return {
    ink: bestInk,
    paper: bestPaper,
    bright: bestBright,
    bitmap: bestBitmap
  };
}

/**
 * Calculate bitmap offset for a pixel row
 * ZX Spectrum screen memory layout
 * @param {number} y - Pixel Y coordinate (0-191)
 * @returns {number} Byte offset in bitmap area
 */
function getBitmapOffset(y) {
  // Screen is divided into 3 thirds (0-63, 64-127, 128-191)
  // Each third has 8 character rows
  // Within each character row, lines are interleaved
  const third = Math.floor(y / 64);
  const charRow = Math.floor((y % 64) / 8);
  const line = y % 8;
  return third * 2048 + line * 256 + charRow * 32;
}

/**
 * Convert image to SCR format
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (256x192)
 * @param {string} dithering - Dithering method: 'none', 'floyd-steinberg', 'ordered', 'atkinson'
 * @param {number} brightness - Brightness adjustment (-100 to 100)
 * @param {number} contrast - Contrast adjustment (-100 to 100)
 * @param {number} saturation - Saturation adjustment (-100 to 100)
 * @param {number} gamma - Gamma correction (0.2 to 3.0)
 * @param {boolean} grayscale - Convert to grayscale
 * @param {number} sharpness - Sharpening amount (0-100)
 * @param {number} blackPoint - Levels black point (0-127)
 * @param {number} whitePoint - Levels white point (128-255)
 * @param {number} balanceR - Red channel adjustment (-50 to 50)
 * @param {number} balanceG - Green channel adjustment (-50 to 50)
 * @param {number} balanceB - Blue channel adjustment (-50 to 50)
 * @returns {Uint8Array} 6912-byte SCR data
 */
function convertToScr(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0) {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply grayscale first (if enabled, skip saturation and color balance)
  if (grayscale) {
    applyGrayscale(pixels);
  } else {
    // Apply saturation
    if (saturation !== 0) {
      applySaturation(pixels, saturation);
    }
    // Apply color balance
    if (balanceR !== 0 || balanceG !== 0 || balanceB !== 0) {
      applyColorBalance(pixels, balanceR, balanceG, balanceB);
    }
  }

  // Apply gamma correction
  if (gamma !== 1.0) {
    applyGamma(pixels, gamma);
  }

  // Apply levels adjustment
  if (blackPoint > 0 || whitePoint < 255) {
    applyLevels(pixels, blackPoint, whitePoint);
  }

  // Apply brightness/contrast
  if (brightness !== 0 || contrast !== 0) {
    applyBrightnessContrast(pixels, brightness, contrast);
  }

  // Apply sharpening
  if (sharpness > 0) {
    applySharpening(pixels, 256, 192, sharpness);
  }

  // Convert to float array for dithering
  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  // Apply dithering
  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  switch (dithering) {
    case 'floyd-steinberg':
      floydSteinbergDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'jarvis':
      jarvisDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'stucki':
      stuckiDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'burkes':
      burkesDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'sierra':
      sierraDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'sierra-lite':
      sierraLiteDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'atkinson':
      atkinsonDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'ordered':
      orderedDither(floatPixels, 256, 192, fullPalette);
      break;
    case 'ordered8':
      ordered8Dither(floatPixels, 256, 192, fullPalette);
      break;
    case 'noise':
      noiseDither(floatPixels, 256, 192, fullPalette);
      break;
    // 'none' - no dithering applied
  }

  // Create SCR buffer
  const scr = new Uint8Array(6912);

  // Process each 8x8 cell
  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      const cell = analyzeCell(floatPixels, cellX, cellY, 256);

      // Write bitmap bytes
      for (let line = 0; line < 8; line++) {
        const y = cellY * 8 + line;
        const offset = getBitmapOffset(y) + cellX;
        scr[offset] = cell.bitmap[line];
      }

      // Write attribute byte
      const attrOffset = 6144 + cellY * 32 + cellX;
      let attr = (cell.paper << 3) | cell.ink;
      if (cell.bright) attr |= 0x40;
      scr[attrOffset] = attr;
    }
  }

  return scr;
}

// BSC format constants
const BSC_CONST = {
  TOTAL_SIZE: 11136,
  BORDER_OFFSET: 6912,
  FRAME_WIDTH: 384,
  FRAME_HEIGHT: 304,
  BORDER_LEFT_PX: 64,
  BORDER_TOP_PX: 64,
  BORDER_BOTTOM_PX: 48,
  BYTES_PER_FULL_LINE: 24,
  BYTES_PER_SIDE_LINE: 8,
  PIXELS_PER_COLOR: 8
};

/**
 * Find nearest color from regular palette only (for border)
 * @param {number[]} rgb - Target color [R, G, B]
 * @param {number[][]} regularPalette - Regular palette colors (8 colors)
 * @returns {number} Nearest color index (0-7)
 */
function findNearestBorderColor(rgb, regularPalette) {
  let minDist = Infinity;
  let nearest = 0;
  for (let i = 0; i < 8; i++) {
    const dist = colorDistance(rgb, regularPalette[i]);
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }
  return nearest;
}

/**
 * Get average color of N-pixel horizontal block
 * @param {Uint8ClampedArray} pixels - Image pixels (RGBA)
 * @param {number} width - Image width
 * @param {number} x - Start X
 * @param {number} y - Y coordinate
 * @param {number} blockWidth - Number of pixels to average (default 32 for border timing)
 * @returns {number[]} Average [R, G, B]
 */
function getBlockAverageColor(pixels, width, x, y, blockWidth = 32) {
  let r = 0, g = 0, b = 0;
  const actualWidth = Math.min(blockWidth, width - x); // Don't read past image edge
  for (let dx = 0; dx < actualWidth; dx++) {
    const idx = (y * width + x + dx) * 4;
    r += pixels[idx];
    g += pixels[idx + 1];
    b += pixels[idx + 2];
  }
  return [r / actualWidth, g / actualWidth, b / actualWidth];
}

/**
 * Convert image to BSC format (384x304 with borders)
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (384x304)
 * @param {string} dithering - Dithering method
 * @param {number} brightness - Brightness adjustment
 * @param {number} contrast - Contrast adjustment
 * @param {number} saturation - Saturation adjustment
 * @param {number} gamma - Gamma correction
 * @param {boolean} grayscale - Convert to grayscale
 * @param {number} sharpness - Sharpening amount
 * @param {number} blackPoint - Levels black point
 * @param {number} whitePoint - Levels white point
 * @param {number} balanceR - Red channel adjustment
 * @param {number} balanceG - Green channel adjustment
 * @param {number} balanceB - Blue channel adjustment
 * @returns {Uint8Array} 11136-byte BSC data
 */
function convertToBsc(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0) {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 384, 304);
  const pixels = imageData.data;

  // Apply adjustments to full image
  if (grayscale) {
    applyGrayscale(pixels);
  } else {
    if (saturation !== 0) applySaturation(pixels, saturation);
    if (balanceR !== 0 || balanceG !== 0 || balanceB !== 0) {
      applyColorBalance(pixels, balanceR, balanceG, balanceB);
    }
  }
  if (gamma !== 1.0) applyGamma(pixels, gamma);
  if (blackPoint > 0 || whitePoint < 255) applyLevels(pixels, blackPoint, whitePoint);
  if (brightness !== 0 || contrast !== 0) applyBrightnessContrast(pixels, brightness, contrast);
  if (sharpness > 0) applySharpening(pixels, 384, 304, sharpness);

  // Extract main screen area (256x192 at offset 64,64)
  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = 256;
  mainCanvas.height = 192;
  const mainCtx = mainCanvas.getContext('2d');
  if (!mainCtx) throw new Error('Cannot get main canvas context');

  // Copy main area with adjustments applied
  const mainImageData = mainCtx.createImageData(256, 192);
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const srcIdx = ((y + 64) * 384 + (x + 64)) * 4;
      const dstIdx = (y * 256 + x) * 4;
      mainImageData.data[dstIdx] = pixels[srcIdx];
      mainImageData.data[dstIdx + 1] = pixels[srcIdx + 1];
      mainImageData.data[dstIdx + 2] = pixels[srcIdx + 2];
      mainImageData.data[dstIdx + 3] = 255;
    }
  }
  mainCtx.putImageData(mainImageData, 0, 0);

  // Convert main screen using SCR conversion (without re-applying adjustments)
  const scrData = convertMainAreaToScr(mainCanvas, dithering);

  // Create BSC buffer
  const bsc = new Uint8Array(BSC_CONST.TOTAL_SIZE);

  // Copy SCR data (first 6912 bytes)
  bsc.set(scrData, 0);

  // Convert border areas
  // ZX Spectrum border timing: OUT takes 12 T-states = 24 pixels minimum per color change
  // Edge segments (touching screen edge or paper) can be shorter (8 or 16 pixels)
  const palette = getCombinedPalette();
  const regularPalette = palette.regular;

  let borderOffset = BSC_CONST.BORDER_OFFSET;

  // Pre-calculate colors for 48 segments (8px each) for a line
  // Then encode to bytes respecting 24-pixel minimum for interior
  const encodeFullBorderLine = (y) => {
    // 384 pixels = 48 segments of 8px = 16 blocks of 24px (3 segments each)
    // Edge blocks (first and last) can have finer detail
    const segColors = new Array(48);

    // First block (segments 0-2): edge, can be 8px granularity
    segColors[0] = findNearestBorderColor(getBlockAverageColor(pixels, 384, 0, y, 8), regularPalette);
    segColors[1] = findNearestBorderColor(getBlockAverageColor(pixels, 384, 8, y, 8), regularPalette);
    segColors[2] = findNearestBorderColor(getBlockAverageColor(pixels, 384, 16, y, 8), regularPalette);

    // Interior blocks (segments 3-44): 24px granularity (14 blocks)
    for (let block = 1; block < 15; block++) {
      const x = block * 24;
      const color = findNearestBorderColor(getBlockAverageColor(pixels, 384, x, y, 24), regularPalette);
      segColors[block * 3] = color;
      segColors[block * 3 + 1] = color;
      segColors[block * 3 + 2] = color;
    }

    // Last block (segments 45-47): edge, can be 8px granularity
    segColors[45] = findNearestBorderColor(getBlockAverageColor(pixels, 384, 360, y, 8), regularPalette);
    segColors[46] = findNearestBorderColor(getBlockAverageColor(pixels, 384, 368, y, 8), regularPalette);
    segColors[47] = findNearestBorderColor(getBlockAverageColor(pixels, 384, 376, y, 8), regularPalette);

    // Encode to bytes (2 segments per byte)
    for (let i = 0; i < 24; i++) {
      bsc[borderOffset++] = segColors[i * 2] | (segColors[i * 2 + 1] << 3);
    }
  };

  // Side border: 64 pixels = 8 segments of 8px each
  // Entire side border touches screen edge on one side and paper on the other
  // So ALL segments can use 8px granularity (no true "interior")
  const encodeSideBorderLine = (y) => {
    // Left border (64 pixels = 8 segments, 4 bytes)
    for (let i = 0; i < 4; i++) {
      const x = i * 16;
      const color1 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x, y, 8), regularPalette);
      const color2 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x + 8, y, 8), regularPalette);
      bsc[borderOffset++] = color1 | (color2 << 3);
    }

    // Right border (64 pixels = 8 segments, 4 bytes)
    for (let i = 0; i < 4; i++) {
      const x = 320 + i * 16;
      const color1 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x, y, 8), regularPalette);
      const color2 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x + 8, y, 8), regularPalette);
      bsc[borderOffset++] = color1 | (color2 << 3);
    }
  };

  // Top border: 64 lines × 24 bytes
  for (let y = 0; y < 64; y++) {
    encodeFullBorderLine(y);
  }

  // Side borders: 192 lines × 8 bytes
  for (let y = 0; y < 192; y++) {
    encodeSideBorderLine(y + 64);
  }

  // Bottom border: 48 lines × 24 bytes
  for (let y = 0; y < 48; y++) {
    encodeFullBorderLine(y + 256);
  }

  return bsc;
}

/**
 * Convert main screen area to SCR (without applying adjustments - already applied)
 * @param {HTMLCanvasElement} sourceCanvas - 256x192 canvas with adjustments applied
 * @param {string} dithering - Dithering method
 * @returns {Uint8Array} 6912-byte SCR data
 */
function convertMainAreaToScr(sourceCanvas, dithering) {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Convert to float array for dithering
  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  // Apply dithering
  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  switch (dithering) {
    case 'floyd-steinberg': floydSteinbergDither(floatPixels, 256, 192, fullPalette); break;
    case 'jarvis': jarvisDither(floatPixels, 256, 192, fullPalette); break;
    case 'stucki': stuckiDither(floatPixels, 256, 192, fullPalette); break;
    case 'burkes': burkesDither(floatPixels, 256, 192, fullPalette); break;
    case 'sierra': sierraDither(floatPixels, 256, 192, fullPalette); break;
    case 'sierra-lite': sierraLiteDither(floatPixels, 256, 192, fullPalette); break;
    case 'atkinson': atkinsonDither(floatPixels, 256, 192, fullPalette); break;
    case 'ordered': orderedDither(floatPixels, 256, 192, fullPalette); break;
    case 'ordered8': ordered8Dither(floatPixels, 256, 192, fullPalette); break;
    case 'noise': noiseDither(floatPixels, 256, 192, fullPalette); break;
  }

  // Create SCR buffer
  const scr = new Uint8Array(6912);

  // Process each 8x8 cell
  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      const cell = analyzeCell(floatPixels, cellX, cellY, 256);

      for (let line = 0; line < 8; line++) {
        const y = cellY * 8 + line;
        const offset = getBitmapOffset(y) + cellX;
        scr[offset] = cell.bitmap[line];
      }

      const attrOffset = 6144 + cellY * 32 + cellX;
      let attr = (cell.paper << 3) | cell.ink;
      if (cell.bright) attr |= 0x40;
      scr[attrOffset] = attr;
    }
  }

  return scr;
}

/**
 * Render BSC preview to canvas with zoom
 * @param {Uint8Array} bscData - BSC data (11136 bytes)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom level (1 or 2)
 */
function renderBscToCanvas(bscData, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 384 * zoom;
  canvas.height = 304 * zoom;

  const imageData = ctx.createImageData(384, 304);
  const pixels = imageData.data;
  const palette = getCombinedPalette();

  // Render main screen area (256x192 at offset 64,64)
  for (let y = 0; y < 192; y++) {
    const bitmapOffset = getBitmapOffset(y);
    for (let x = 0; x < 256; x++) {
      const cellX = Math.floor(x / 8);
      const cellY = Math.floor(y / 8);
      const bitPos = x % 8;

      const byte = bscData[bitmapOffset + cellX];
      const attrOffset = 6144 + cellY * 32 + cellX;
      const attr = bscData[attrOffset];

      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr & 0x40) !== 0;

      const pal = bright ? palette.bright : palette.regular;
      const isInk = (byte & (0x80 >> bitPos)) !== 0;
      const color = isInk ? pal[ink] : pal[paper];

      const idx = ((y + 64) * 384 + (x + 64)) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  // Render borders using regular palette only
  const regularPalette = palette.regular;
  let borderOffset = BSC_CONST.BORDER_OFFSET;

  // Top border: 64 lines
  for (let y = 0; y < 64; y++) {
    for (let bx = 0; bx < 24; bx++) {
      const byte = bscData[borderOffset++];
      const color1 = byte & 0x07;
      const color2 = (byte >> 3) & 0x07;
      for (let px = 0; px < 8; px++) {
        const idx = (y * 384 + bx * 16 + px) * 4;
        pixels[idx] = regularPalette[color1][0];
        pixels[idx + 1] = regularPalette[color1][1];
        pixels[idx + 2] = regularPalette[color1][2];
        pixels[idx + 3] = 255;
      }
      for (let px = 0; px < 8; px++) {
        const idx = (y * 384 + bx * 16 + 8 + px) * 4;
        pixels[idx] = regularPalette[color2][0];
        pixels[idx + 1] = regularPalette[color2][1];
        pixels[idx + 2] = regularPalette[color2][2];
        pixels[idx + 3] = 255;
      }
    }
  }

  // Side borders: 192 lines
  for (let y = 0; y < 192; y++) {
    const screenY = y + 64;
    // Left border
    for (let bx = 0; bx < 4; bx++) {
      const byte = bscData[borderOffset++];
      const color1 = byte & 0x07;
      const color2 = (byte >> 3) & 0x07;
      for (let px = 0; px < 8; px++) {
        const idx = (screenY * 384 + bx * 16 + px) * 4;
        pixels[idx] = regularPalette[color1][0];
        pixels[idx + 1] = regularPalette[color1][1];
        pixels[idx + 2] = regularPalette[color1][2];
        pixels[idx + 3] = 255;
      }
      for (let px = 0; px < 8; px++) {
        const idx = (screenY * 384 + bx * 16 + 8 + px) * 4;
        pixels[idx] = regularPalette[color2][0];
        pixels[idx + 1] = regularPalette[color2][1];
        pixels[idx + 2] = regularPalette[color2][2];
        pixels[idx + 3] = 255;
      }
    }
    // Right border
    for (let bx = 0; bx < 4; bx++) {
      const byte = bscData[borderOffset++];
      const color1 = byte & 0x07;
      const color2 = (byte >> 3) & 0x07;
      for (let px = 0; px < 8; px++) {
        const idx = (screenY * 384 + 320 + bx * 16 + px) * 4;
        pixels[idx] = regularPalette[color1][0];
        pixels[idx + 1] = regularPalette[color1][1];
        pixels[idx + 2] = regularPalette[color1][2];
        pixels[idx + 3] = 255;
      }
      for (let px = 0; px < 8; px++) {
        const idx = (screenY * 384 + 320 + bx * 16 + 8 + px) * 4;
        pixels[idx] = regularPalette[color2][0];
        pixels[idx + 1] = regularPalette[color2][1];
        pixels[idx + 2] = regularPalette[color2][2];
        pixels[idx + 3] = 255;
      }
    }
  }

  // Bottom border: 48 lines
  for (let y = 0; y < 48; y++) {
    const screenY = y + 256;
    for (let bx = 0; bx < 24; bx++) {
      const byte = bscData[borderOffset++];
      const color1 = byte & 0x07;
      const color2 = (byte >> 3) & 0x07;
      for (let px = 0; px < 8; px++) {
        const idx = (screenY * 384 + bx * 16 + px) * 4;
        pixels[idx] = regularPalette[color1][0];
        pixels[idx + 1] = regularPalette[color1][1];
        pixels[idx + 2] = regularPalette[color1][2];
        pixels[idx + 3] = 255;
      }
      for (let px = 0; px < 8; px++) {
        const idx = (screenY * 384 + bx * 16 + 8 + px) * 4;
        pixels[idx] = regularPalette[color2][0];
        pixels[idx + 1] = regularPalette[color2][1];
        pixels[idx + 2] = regularPalette[color2][2];
        pixels[idx + 3] = 255;
      }
    }
  }

  // Draw at 1x then scale up
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 384;
  tempCanvas.height = 304;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, 384 * zoom, 304 * zoom);
  }
}

/** @type {number} - Current import dialog zoom level */
let importZoom = 2;

/**
 * Render preview to canvas with zoom
 * @param {Uint8Array} scrData - SCR data (6912 bytes)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom level (1, 2, or 3)
 */
function renderScrToCanvas(scrData, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;

  const imageData = ctx.createImageData(256, 192);
  const pixels = imageData.data;
  const palette = getCombinedPalette();

  for (let y = 0; y < 192; y++) {
    const bitmapOffset = getBitmapOffset(y);

    for (let x = 0; x < 256; x++) {
      const cellX = Math.floor(x / 8);
      const cellY = Math.floor(y / 8);
      const bitPos = x % 8;

      const byte = scrData[bitmapOffset + cellX];
      const attrOffset = 6144 + cellY * 32 + cellX;
      const attr = scrData[attrOffset];

      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr & 0x40) !== 0;

      const pal = bright ? palette.bright : palette.regular;
      const isInk = (byte & (0x80 >> bitPos)) !== 0;
      const color = isInk ? pal[ink] : pal[paper];

      const idx = (y * 256 + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  // Draw at 1x then scale up
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 256;
  tempCanvas.height = 192;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

// ============================================================================
// Import Dialog Management
// ============================================================================

/** @type {HTMLCanvasElement|null} */
let importSourceCanvas = null;

/** @type {HTMLCanvasElement|null} */
let importSourceCanvasBsc = null;

/** @type {HTMLCanvasElement|null} */
let importPreviewCanvas = null;

/** @type {HTMLCanvasElement|null} */
let importOriginalCanvas = null;

/** @type {File|null} */
let importFile = null;

/** @type {{width: number, height: number}} - Original image dimensions before scaling */
let importOriginalSize = { width: 0, height: 0 };

/** @type {{x: number, y: number, w: number, h: number}} - Crop rectangle */
let importCrop = { x: 0, y: 0, w: 256, h: 192 };

/** @type {string} - Fit mode: 'stretch', 'fit', 'fill' */
let importFitMode = 'stretch';

/** @type {HTMLImageElement|null} - Loaded source image */
let importImage = null;

/** @type {string} - Selected palette ID for import */
let importPaletteId = 'default';

/** @type {{regular: number[][], bright: number[][]}} - Cached import palette colors */
let importPaletteColors = { regular: [], bright: [] };

/** @type {Function|null} - Reference to updatePreview for mouse handlers */
let updateImportPreview = null;

/**
 * Apply crop and fit mode to source canvas
 */
function applyCropAndFit() {
  if (!importImage || !importSourceCanvas) return;

  const ctx = importSourceCanvas.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 192);

  const srcX = importCrop.x;
  const srcY = importCrop.y;
  const srcW = importCrop.w;
  const srcH = importCrop.h;

  // Calculate destination based on fit mode
  let destX = 0, destY = 0, destW = 256, destH = 192;
  const srcAspect = srcW / srcH;

  if (importFitMode === 'stretch') {
    // Stretch source region to fill 256x192
    destX = 0; destY = 0; destW = 256; destH = 192;
  } else if (importFitMode === 'fit') {
    // Fit source region inside 256x192, maintaining aspect ratio (letterbox)
    const destAspect = 256 / 192;
    if (srcAspect > destAspect) {
      // Source is wider - fit to width
      destW = 256;
      destH = 256 / srcAspect;
      destX = 0;
      destY = (192 - destH) / 2;
    } else {
      // Source is taller - fit to height
      destH = 192;
      destW = 192 * srcAspect;
      destX = (256 - destW) / 2;
      destY = 0;
    }
  } else if (importFitMode === 'fill') {
    // Fill 256x192 with source region, cropping excess (center crop)
    const destAspect = 256 / 192;
    if (srcAspect > destAspect) {
      // Source is wider - fit to height, crop sides
      destH = 192;
      destW = 192 * srcAspect;
      destX = (256 - destW) / 2;
      destY = 0;
    } else {
      // Source is taller - fit to width, crop top/bottom
      destW = 256;
      destH = 256 / srcAspect;
      destX = 0;
      destY = (192 - destH) / 2;
    }
  } else if (importFitMode === 'fit-width') {
    // Scale to fit width (256), center vertically
    destW = 256;
    destH = 256 / srcAspect;
    destX = 0;
    destY = (192 - destH) / 2;
  } else if (importFitMode === 'fit-height') {
    // Scale to fit height (192), center horizontally
    destH = 192;
    destW = 192 * srcAspect;
    destX = (256 - destW) / 2;
    destY = 0;
  }

  ctx.drawImage(importImage, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

  // Also fill BSC canvas (384x304)
  if (importSourceCanvasBsc) {
    const ctxBsc = importSourceCanvasBsc.getContext('2d');
    if (ctxBsc) {
      ctxBsc.fillStyle = '#000';
      ctxBsc.fillRect(0, 0, 384, 304);

      // Calculate destination for BSC (384x304 with aspect ratio handling)
      let destXBsc = 0, destYBsc = 0, destWBsc = 384, destHBsc = 304;
      const bscAspect = 384 / 304;

      if (importFitMode === 'stretch') {
        destXBsc = 0; destYBsc = 0; destWBsc = 384; destHBsc = 304;
      } else if (importFitMode === 'fit') {
        if (srcAspect > bscAspect) {
          destWBsc = 384;
          destHBsc = 384 / srcAspect;
          destXBsc = 0;
          destYBsc = (304 - destHBsc) / 2;
        } else {
          destHBsc = 304;
          destWBsc = 304 * srcAspect;
          destXBsc = (384 - destWBsc) / 2;
          destYBsc = 0;
        }
      } else if (importFitMode === 'fill') {
        if (srcAspect > bscAspect) {
          destHBsc = 304;
          destWBsc = 304 * srcAspect;
          destXBsc = (384 - destWBsc) / 2;
          destYBsc = 0;
        } else {
          destWBsc = 384;
          destHBsc = 384 / srcAspect;
          destXBsc = 0;
          destYBsc = (304 - destHBsc) / 2;
        }
      } else if (importFitMode === 'fit-width') {
        destWBsc = 384;
        destHBsc = 384 / srcAspect;
        destXBsc = 0;
        destYBsc = (304 - destHBsc) / 2;
      } else if (importFitMode === 'fit-height') {
        destHBsc = 304;
        destWBsc = 304 * srcAspect;
        destXBsc = (384 - destWBsc) / 2;
        destYBsc = 0;
      }

      ctxBsc.drawImage(importImage, srcX, srcY, srcW, srcH, destXBsc, destYBsc, destWBsc, destHBsc);
    }
  }
}

/**
 * Render original canvas with crop rectangle overlay
 */
function renderOriginalWithCrop() {
  if (!importImage || !importOriginalCanvas) return;

  const ctx = importOriginalCanvas.getContext('2d');
  if (!ctx) return;

  const w = importImage.naturalWidth;
  const h = importImage.naturalHeight;

  // Calculate scale to fit in canvas while showing full image
  const maxSize = 256 * importZoom;
  const scale = Math.min(maxSize / w, maxSize / h, importZoom);

  importOriginalCanvas.width = Math.round(w * scale);
  importOriginalCanvas.height = Math.round(h * scale);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(importImage, 0, 0, importOriginalCanvas.width, importOriginalCanvas.height);

  // Draw crop rectangle
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    importCrop.x * scale,
    importCrop.y * scale,
    importCrop.w * scale,
    importCrop.h * scale
  );

  // Dim area outside crop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  // Top
  ctx.fillRect(0, 0, importOriginalCanvas.width, importCrop.y * scale);
  // Bottom
  ctx.fillRect(0, (importCrop.y + importCrop.h) * scale, importOriginalCanvas.width, importOriginalCanvas.height - (importCrop.y + importCrop.h) * scale);
  // Left
  ctx.fillRect(0, importCrop.y * scale, importCrop.x * scale, importCrop.h * scale);
  // Right
  ctx.fillRect((importCrop.x + importCrop.w) * scale, importCrop.y * scale, importOriginalCanvas.width - (importCrop.x + importCrop.w) * scale, importCrop.h * scale);

  // Draw resize handles
  ctx.fillStyle = '#0ff';
  const handleSize = 6;
  const corners = [
    [importCrop.x, importCrop.y],
    [importCrop.x + importCrop.w, importCrop.y],
    [importCrop.x, importCrop.y + importCrop.h],
    [importCrop.x + importCrop.w, importCrop.y + importCrop.h]
  ];
  for (const [cx, cy] of corners) {
    ctx.fillRect(cx * scale - handleSize / 2, cy * scale - handleSize / 2, handleSize, handleSize);
  }
}

// ============================================================================
// Crop Rectangle Mouse Interaction
// ============================================================================

/** @type {'none'|'move'|'resize-tl'|'resize-tr'|'resize-bl'|'resize-br'|'resize-t'|'resize-b'|'resize-l'|'resize-r'} */
let cropDragMode = 'none';

/** @type {{x: number, y: number}} */
let cropDragStart = { x: 0, y: 0 };

/** @type {{x: number, y: number, w: number, h: number}} */
let cropDragInitial = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Get current scale factor for original canvas
 * @returns {number}
 */
function getOriginalCanvasScale() {
  if (!importImage || !importOriginalCanvas) return 1;
  const w = importImage.naturalWidth;
  const maxSize = 256 * importZoom;
  return Math.min(maxSize / w, maxSize / importImage.naturalHeight, importZoom);
}

/**
 * Determine what part of crop rectangle is at position
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @returns {'none'|'move'|'resize-tl'|'resize-tr'|'resize-bl'|'resize-br'|'resize-t'|'resize-b'|'resize-l'|'resize-r'}
 */
function getCropHitZone(x, y) {
  const scale = getOriginalCanvasScale();
  const margin = 8; // Hit margin in canvas pixels

  const left = importCrop.x * scale;
  const right = (importCrop.x + importCrop.w) * scale;
  const top = importCrop.y * scale;
  const bottom = (importCrop.y + importCrop.h) * scale;

  const nearLeft = Math.abs(x - left) < margin;
  const nearRight = Math.abs(x - right) < margin;
  const nearTop = Math.abs(y - top) < margin;
  const nearBottom = Math.abs(y - bottom) < margin;

  // Corners first (higher priority)
  if (nearTop && nearLeft) return 'resize-tl';
  if (nearTop && nearRight) return 'resize-tr';
  if (nearBottom && nearLeft) return 'resize-bl';
  if (nearBottom && nearRight) return 'resize-br';

  // Edges
  if (nearTop && x > left && x < right) return 'resize-t';
  if (nearBottom && x > left && x < right) return 'resize-b';
  if (nearLeft && y > top && y < bottom) return 'resize-l';
  if (nearRight && y > top && y < bottom) return 'resize-r';

  // Inside - move
  if (x > left && x < right && y > top && y < bottom) return 'move';

  return 'none';
}

/**
 * Get cursor style for crop hit zone
 * @param {'none'|'move'|'resize-tl'|'resize-tr'|'resize-bl'|'resize-br'|'resize-t'|'resize-b'|'resize-l'|'resize-r'} zone
 * @returns {string}
 */
function getCropCursor(zone) {
  switch (zone) {
    case 'move': return 'move';
    case 'resize-tl': case 'resize-br': return 'nwse-resize';
    case 'resize-tr': case 'resize-bl': return 'nesw-resize';
    case 'resize-t': case 'resize-b': return 'ns-resize';
    case 'resize-l': case 'resize-r': return 'ew-resize';
    default: return 'default';
  }
}

/**
 * Initialize crop mouse handlers
 */
function initCropMouseHandlers() {
  if (!importOriginalCanvas) return;

  importOriginalCanvas.addEventListener('mousedown', (e) => {
    const rect = importOriginalCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    cropDragMode = getCropHitZone(x, y);
    if (cropDragMode !== 'none') {
      cropDragStart = { x, y };
      cropDragInitial = { ...importCrop };
      e.preventDefault();
    }
  });

  importOriginalCanvas.addEventListener('mousemove', (e) => {
    const rect = importOriginalCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (cropDragMode === 'none') {
      // Update cursor based on hover position
      const zone = getCropHitZone(x, y);
      importOriginalCanvas.style.cursor = getCropCursor(zone);
      return;
    }

    const scale = getOriginalCanvasScale();
    const dx = (x - cropDragStart.x) / scale;
    const dy = (y - cropDragStart.y) / scale;

    const imgW = importImage?.naturalWidth || 256;
    const imgH = importImage?.naturalHeight || 192;

    if (cropDragMode === 'move') {
      importCrop.x = Math.max(0, Math.min(imgW - importCrop.w, Math.round(cropDragInitial.x + dx)));
      importCrop.y = Math.max(0, Math.min(imgH - importCrop.h, Math.round(cropDragInitial.y + dy)));
    } else {
      // Resize modes - extract direction suffix (e.g., 'tl', 'br', 't', 'l')
      const dir = cropDragMode.replace('resize-', '');
      let newX = cropDragInitial.x;
      let newY = cropDragInitial.y;
      let newW = cropDragInitial.w;
      let newH = cropDragInitial.h;

      if (dir.includes('l')) {
        newX = Math.max(0, Math.min(cropDragInitial.x + cropDragInitial.w - 8, Math.round(cropDragInitial.x + dx)));
        newW = cropDragInitial.w - (newX - cropDragInitial.x);
      }
      if (dir.includes('r')) {
        newW = Math.max(8, Math.min(imgW - cropDragInitial.x, Math.round(cropDragInitial.w + dx)));
      }
      if (dir.includes('t')) {
        newY = Math.max(0, Math.min(cropDragInitial.y + cropDragInitial.h - 8, Math.round(cropDragInitial.y + dy)));
        newH = cropDragInitial.h - (newY - cropDragInitial.y);
      }
      if (dir.includes('b')) {
        newH = Math.max(8, Math.min(imgH - cropDragInitial.y, Math.round(cropDragInitial.h + dy)));
      }

      importCrop.x = newX;
      importCrop.y = newY;
      importCrop.w = newW;
      importCrop.h = newH;
    }

    updateCropInputs();
    renderOriginalWithCrop();
  });

  const endDrag = () => {
    if (cropDragMode !== 'none') {
      cropDragMode = 'none';
      // Update preview after drag ends
      if (typeof updateImportPreview === 'function') {
        updateImportPreview();
      }
    }
  };

  importOriginalCanvas.addEventListener('mouseup', endDrag);
  importOriginalCanvas.addEventListener('mouseleave', endDrag);
}

/**
 * Try to detect 256x192 screen region in a larger image (e.g., bordered screenshot)
 * Looks for common border patterns
 */
function detectScreenRegion() {
  if (!importImage) return;

  const w = importImage.naturalWidth;
  const h = importImage.naturalHeight;

  // Common ZX Spectrum screenshot sizes with borders
  // Standard emulator: 320x240 (32px border each side, 24px top/bottom)
  // Full border: 352x296 (48px sides, 52px top/bottom)
  // Pentagon: 384x304 (64px sides, 56px top/48px bottom)

  if (w === 320 && h === 240) {
    importCrop = { x: 32, y: 24, w: 256, h: 192 };
  } else if (w === 352 && h === 296) {
    importCrop = { x: 48, y: 52, w: 256, h: 192 };
  } else if (w === 384 && h === 304) {
    importCrop = { x: 64, y: 64, w: 256, h: 192 };  // BSC format
  } else if (w === 384 && h === 288) {
    importCrop = { x: 64, y: 48, w: 256, h: 192 };
  } else if (w >= 256 && h >= 192) {
    // Generic: center a 256x192 region
    importCrop = {
      x: Math.floor((w - 256) / 2),
      y: Math.floor((h - 192) / 2),
      w: 256,
      h: 192
    };
  } else {
    // Image smaller than 256x192 - use full image
    importCrop = { x: 0, y: 0, w: w, h: h };
  }

  updateCropInputs();
}

/**
 * Initialize PNG import dialog
 */
function initPngImport() {
  const dialog = document.getElementById('pngImportDialog');
  if (!dialog) return;

  // Get canvas elements
  importOriginalCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('importOriginalCanvas'));
  importPreviewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('importPreviewCanvas'));
  importSourceCanvas = document.createElement('canvas');
  importSourceCanvas.width = 256;
  importSourceCanvas.height = 192;

  // BSC format canvas (384x304 with borders)
  importSourceCanvasBsc = document.createElement('canvas');
  importSourceCanvasBsc.width = BSC_CONST.FRAME_WIDTH;
  importSourceCanvasBsc.height = BSC_CONST.FRAME_HEIGHT;

  // Tab switching
  const tabImage = document.getElementById('importTabImage');
  const tabAdjust = document.getElementById('importTabAdjust');
  const panelImage = document.getElementById('importPanelImage');
  const panelAdjust = document.getElementById('importPanelAdjust');

  const switchTab = (tab) => {
    if (tab === 'image') {
      tabImage.style.background = 'var(--bg-primary)';
      tabAdjust.style.background = 'var(--bg-secondary)';
      panelImage.style.display = 'flex';
      panelAdjust.style.display = 'none';
    } else {
      tabImage.style.background = 'var(--bg-secondary)';
      tabAdjust.style.background = 'var(--bg-primary)';
      panelImage.style.display = 'none';
      panelAdjust.style.display = 'block';
    }
  };

  tabImage?.addEventListener('click', () => switchTab('image'));
  tabAdjust?.addEventListener('click', () => switchTab('adjust'));

  // Get controls
  const ditheringSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importDithering'));
  const contrastSlider = /** @type {HTMLInputElement} */ (document.getElementById('importContrast'));
  const brightnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBrightness'));
  const zoomSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importZoom'));
  const paletteSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importPalette'));
  const formatSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importFormat'));
  const cancelBtn = document.getElementById('importCancelBtn');
  const importBtn = document.getElementById('importOkBtn');

  // Populate palette dropdown
  if (paletteSelect) {
    paletteSelect.innerHTML = '';
    PALETTES.forEach(palette => {
      const option = document.createElement('option');
      option.value = palette.id;
      option.textContent = palette.name;
      if (palette.id === 'default') option.selected = true;
      paletteSelect.appendChild(option);
    });
  }

  // Get crop and fit controls
  const cropXInput = /** @type {HTMLInputElement} */ (document.getElementById('importCropX'));
  const cropYInput = /** @type {HTMLInputElement} */ (document.getElementById('importCropY'));
  const cropWInput = /** @type {HTMLInputElement} */ (document.getElementById('importCropW'));
  const cropHInput = /** @type {HTMLInputElement} */ (document.getElementById('importCropH'));
  const cropResetBtn = document.getElementById('importCropReset');
  const cropFullBtn = document.getElementById('importCropFull');
  const cropDetectBtn = document.getElementById('importCropDetect');
  const fitModeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importFitMode'));

  // Get additional controls
  const grayscaleCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('importGrayscale'));
  const saturationSlider = /** @type {HTMLInputElement} */ (document.getElementById('importSaturation'));
  const gammaSlider = /** @type {HTMLInputElement} */ (document.getElementById('importGamma'));
  const sharpnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('importSharpness'));
  const blackPointSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBlackPoint'));
  const whitePointSlider = /** @type {HTMLInputElement} */ (document.getElementById('importWhitePoint'));
  const balanceRSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceR'));
  const balanceGSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceG'));
  const balanceBSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceB'));

  // Update preview on control change
  const updatePreview = () => {
    if (!importSourceCanvas || !importPreviewCanvas) return;

    // Apply crop and fit to source canvas
    applyCropAndFit();

    const dithering = ditheringSelect?.value || 'floyd-steinberg';
    const contrast = parseInt(contrastSlider?.value || '0', 10);
    const brightness = parseInt(brightnessSlider?.value || '0', 10);
    const saturation = parseInt(saturationSlider?.value || '0', 10);
    const gamma = parseInt(gammaSlider?.value || '100', 10) / 100;
    const grayscale = grayscaleCheckbox?.checked || false;
    const sharpness = parseInt(sharpnessSlider?.value || '0', 10);
    const blackPoint = parseInt(blackPointSlider?.value || '0', 10);
    const whitePoint = parseInt(whitePointSlider?.value || '255', 10);
    const balanceR = parseInt(balanceRSlider?.value || '0', 10);
    const balanceG = parseInt(balanceGSlider?.value || '0', 10);
    const balanceB = parseInt(balanceBSlider?.value || '0', 10);
    const format = formatSelect?.value || 'scr';

    if (format === 'bsc' && importSourceCanvasBsc) {
      const bscData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderBscToCanvas(bscData, importPreviewCanvas, importZoom);
    } else {
      const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderScrToCanvas(scrData, importPreviewCanvas, importZoom);
    }
  };

  // Set global reference for mouse handlers
  updateImportPreview = updatePreview;

  // Update both canvases (original with crop overlay + preview)
  const updateAll = () => {
    renderOriginalWithCrop();
    updatePreview();
  };

  // Crop input handlers
  const onCropChange = () => {
    readCropInputs();
    updateAll();
  };

  cropXInput?.addEventListener('change', onCropChange);
  cropYInput?.addEventListener('change', onCropChange);
  cropWInput?.addEventListener('change', onCropChange);
  cropHInput?.addEventListener('change', onCropChange);

  // Crop buttons
  cropResetBtn?.addEventListener('click', () => {
    // Reset to 256x192 centered (or full image if smaller)
    if (!importImage) return;
    const imgW = importImage.naturalWidth;
    const imgH = importImage.naturalHeight;
    if (imgW <= 256 && imgH <= 192) {
      importCrop = { x: 0, y: 0, w: imgW, h: imgH };
    } else {
      const cropW = Math.min(256, imgW);
      const cropH = Math.min(192, imgH);
      importCrop = {
        x: Math.floor((imgW - cropW) / 2),
        y: Math.floor((imgH - cropH) / 2),
        w: cropW,
        h: cropH
      };
    }
    updateCropInputs();
    updateAll();
  });

  cropFullBtn?.addEventListener('click', () => {
    if (importImage) {
      importCrop = { x: 0, y: 0, w: importImage.naturalWidth, h: importImage.naturalHeight };
      updateCropInputs();
      updateAll();
    }
  });

  cropDetectBtn?.addEventListener('click', () => {
    detectScreenRegion();
    updateAll();
  });

  // Fit mode - some modes adjust the crop rectangle to image dimensions
  fitModeSelect?.addEventListener('change', function() {
    importFitMode = this.value;

    if (!importImage) {
      updatePreview();
      return;
    }

    const imgW = importImage.naturalWidth;
    const imgH = importImage.naturalHeight;
    const targetAspect = 256 / 192; // 4:3

    if (importFitMode === 'fit-width') {
      // Use full image width, calculate proportional height for 4:3 aspect
      const newW = imgW;
      const newH = Math.round(imgW / targetAspect);
      const newX = 0;
      // Center vertically
      const newY = Math.max(0, Math.round((imgH - newH) / 2));
      importCrop.x = newX;
      importCrop.y = newY;
      importCrop.w = newW;
      importCrop.h = Math.min(newH, imgH);
      updateCropInputs();
      updateAll();
    } else if (importFitMode === 'fit-height') {
      // Use full image height, calculate proportional width for 4:3 aspect
      const newH = imgH;
      const newW = Math.round(imgH * targetAspect);
      const newY = 0;
      // Center horizontally
      const newX = Math.max(0, Math.round((imgW - newW) / 2));
      importCrop.x = newX;
      importCrop.y = newY;
      importCrop.w = Math.min(newW, imgW);
      importCrop.h = newH;
      updateCropInputs();
      updateAll();
    } else {
      updatePreview();
    }
  });

  ditheringSelect?.addEventListener('change', updatePreview);
  formatSelect?.addEventListener('change', updatePreview);
  contrastSlider?.addEventListener('input', updatePreview);
  brightnessSlider?.addEventListener('input', updatePreview);
  saturationSlider?.addEventListener('input', function() {
    const saturationValueLabel = document.getElementById('importSaturationValue');
    if (saturationValueLabel) {
      saturationValueLabel.textContent = this.value;
    }
    updatePreview();
  });
  gammaSlider?.addEventListener('input', function() {
    const gammaValueLabel = document.getElementById('importGammaValue');
    if (gammaValueLabel) {
      gammaValueLabel.textContent = (parseInt(this.value, 10) / 100).toFixed(1);
    }
    updatePreview();
  });
  sharpnessSlider?.addEventListener('input', function() {
    const sharpnessValueLabel = document.getElementById('importSharpnessValue');
    if (sharpnessValueLabel) {
      sharpnessValueLabel.textContent = this.value;
    }
    updatePreview();
  });

  // Levels sliders with combined value display
  const updateLevelsLabel = () => {
    const levelsValueLabel = document.getElementById('importLevelsValue');
    if (levelsValueLabel) {
      const bp = blackPointSlider?.value || '0';
      const wp = whitePointSlider?.value || '255';
      levelsValueLabel.textContent = `${bp}-${wp}`;
    }
  };
  blackPointSlider?.addEventListener('input', function() {
    updateLevelsLabel();
    updatePreview();
  });
  whitePointSlider?.addEventListener('input', function() {
    updateLevelsLabel();
    updatePreview();
  });

  // Color balance sliders with combined value display
  const updateColorBalanceLabel = () => {
    const colorBalanceValueLabel = document.getElementById('importColorBalanceValue');
    if (colorBalanceValueLabel) {
      const r = balanceRSlider?.value || '0';
      const g = balanceGSlider?.value || '0';
      const b = balanceBSlider?.value || '0';
      colorBalanceValueLabel.textContent = `${r}/${g}/${b}`;
    }
  };
  balanceRSlider?.addEventListener('input', function() {
    updateColorBalanceLabel();
    updatePreview();
  });
  balanceGSlider?.addEventListener('input', function() {
    updateColorBalanceLabel();
    updatePreview();
  });
  balanceBSlider?.addEventListener('input', function() {
    updateColorBalanceLabel();
    updatePreview();
  });

  grayscaleCheckbox?.addEventListener('change', updatePreview);

  // Zoom control
  zoomSelect?.addEventListener('change', function() {
    importZoom = parseInt(this.value, 10);
    updateAll();
  });

  // Palette control
  paletteSelect?.addEventListener('change', function() {
    applyImportPalette(this.value);
    updatePreview();
  });

  // Cancel button
  cancelBtn?.addEventListener('click', () => {
    closeImportDialog();
  });

  // Import button
  importBtn?.addEventListener('click', () => {
    if (!importSourceCanvas) return;

    const dithering = ditheringSelect?.value || 'floyd-steinberg';
    const contrast = parseInt(contrastSlider?.value || '0', 10);
    const brightness = parseInt(brightnessSlider?.value || '0', 10);
    const saturation = parseInt(saturationSlider?.value || '0', 10);
    const gamma = parseInt(gammaSlider?.value || '100', 10) / 100;
    const grayscale = grayscaleCheckbox?.checked || false;
    const sharpness = parseInt(sharpnessSlider?.value || '0', 10);
    const blackPoint = parseInt(blackPointSlider?.value || '0', 10);
    const whitePoint = parseInt(whitePointSlider?.value || '255', 10);
    const balanceR = parseInt(balanceRSlider?.value || '0', 10);
    const balanceG = parseInt(balanceGSlider?.value || '0', 10);
    const balanceB = parseInt(balanceBSlider?.value || '0', 10);
    const format = formatSelect?.value || 'scr';

    let outputData;
    let outputFormat;
    let fileExt;

    if (format === 'bsc' && importSourceCanvasBsc) {
      outputData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.BSC;
      fileExt = '.bsc';
    } else {
      outputData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.SCR;
      fileExt = '.scr';
    }

    // Set as current screen data
    screenData = outputData;
    currentFormat = outputFormat;

    // Generate filename from imported file
    if (importFile) {
      const baseName = importFile.name.replace(/\.[^.]+$/, '');
      currentFileName = baseName + fileExt;
    } else {
      currentFileName = 'imported' + fileExt;
    }

    // Close dialog and render
    closeImportDialog();

    // Apply selected palette to main display
    if (typeof setPalette === 'function' && importPaletteId) {
      const paletteDropdown = /** @type {HTMLSelectElement} */ (document.getElementById('paletteSelect'));
      if (paletteDropdown) paletteDropdown.value = importPaletteId;
      setPalette(importPaletteId);
    }

    // Update UI
    updateFileInfo();
    toggleFormatControlsVisibility();
    renderScreen();

    // Enter editor mode
    if (typeof toggleEditorMode === 'function') {
      toggleEditorMode();
    }
  });

  // Close on overlay click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeImportDialog();
    }
  });

  // Initialize crop rectangle mouse handlers
  initCropMouseHandlers();
}

/**
 * Auto-detect brightness from image
 */
function autoDetectBrightness() {
  if (!importSourceCanvas) return;

  const ctx = importSourceCanvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Calculate average luminance
  let totalLum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    totalLum += lum;
  }
  const avgLum = totalLum / (256 * 192);

  // Adjust brightness to target ~128 average
  const brightnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBrightness'));
  if (brightnessSlider) {
    const adjustment = Math.round((128 - avgLum) * 0.5);
    brightnessSlider.value = String(Math.max(-100, Math.min(100, adjustment)));
  }
}

/**
 * Open import dialog with image file
 * @param {File} file - Image file to import
 */
function openImportDialog(file) {
  importFile = file;
  const dialog = document.getElementById('pngImportDialog');
  if (!dialog) return;

  // Reset controls
  const ditheringSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importDithering'));
  const contrastSlider = /** @type {HTMLInputElement} */ (document.getElementById('importContrast'));
  const brightnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBrightness'));
  const zoomSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importZoom'));
  const paletteSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importPalette'));

  if (ditheringSelect) ditheringSelect.value = 'floyd-steinberg';
  if (contrastSlider) contrastSlider.value = '0';
  if (brightnessSlider) brightnessSlider.value = '0';
  if (zoomSelect) zoomSelect.value = '2';
  importZoom = 2;

  // Reset saturation, gamma, sharpness, and grayscale
  const saturationSlider = /** @type {HTMLInputElement} */ (document.getElementById('importSaturation'));
  if (saturationSlider) saturationSlider.value = '0';
  const gammaSlider = /** @type {HTMLInputElement} */ (document.getElementById('importGamma'));
  if (gammaSlider) gammaSlider.value = '100';
  const sharpnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('importSharpness'));
  if (sharpnessSlider) sharpnessSlider.value = '0';
  const grayscaleCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('importGrayscale'));
  if (grayscaleCheckbox) grayscaleCheckbox.checked = false;

  // Reset levels sliders
  const blackPointSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBlackPoint'));
  if (blackPointSlider) blackPointSlider.value = '0';
  const whitePointSlider = /** @type {HTMLInputElement} */ (document.getElementById('importWhitePoint'));
  if (whitePointSlider) whitePointSlider.value = '255';

  // Reset color balance sliders
  const balanceRSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceR'));
  if (balanceRSlider) balanceRSlider.value = '0';
  const balanceGSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceG'));
  if (balanceGSlider) balanceGSlider.value = '0';
  const balanceBSlider = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceB'));
  if (balanceBSlider) balanceBSlider.value = '0';

  // Reset value display labels
  const gammaValueLabel = document.getElementById('importGammaValue');
  if (gammaValueLabel) gammaValueLabel.textContent = '1.0';
  const sharpnessValueLabel = document.getElementById('importSharpnessValue');
  if (sharpnessValueLabel) sharpnessValueLabel.textContent = '0';
  const saturationValueLabel = document.getElementById('importSaturationValue');
  if (saturationValueLabel) saturationValueLabel.textContent = '0';
  const levelsValueLabel = document.getElementById('importLevelsValue');
  if (levelsValueLabel) levelsValueLabel.textContent = '0-255';
  const colorBalanceValueLabel = document.getElementById('importColorBalanceValue');
  if (colorBalanceValueLabel) colorBalanceValueLabel.textContent = '0/0/0';

  // Set palette to current display palette
  if (paletteSelect) paletteSelect.value = currentPaletteId;
  applyImportPalette(currentPaletteId);

  // Reset fit mode
  const fitModeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('importFitMode'));
  if (fitModeSelect) fitModeSelect.value = 'stretch';
  importFitMode = 'stretch';

  // Load image
  const img = new Image();
  img.onload = () => {
    if (!importSourceCanvas || !importOriginalCanvas || !importPreviewCanvas) return;

    // Store image reference
    importImage = img;

    // Store original dimensions
    importOriginalSize = { width: img.naturalWidth, height: img.naturalHeight };

    // Update dimension labels
    const origSizeLabel = document.getElementById('importOriginalSize');
    const prevSizeLabel = document.getElementById('importPreviewSize');
    if (origSizeLabel) origSizeLabel.textContent = `${img.naturalWidth}x${img.naturalHeight}`;
    if (prevSizeLabel) prevSizeLabel.textContent = '256x192';

    // Auto-detect crop region (or default to full image)
    if (img.naturalWidth === 256 && img.naturalHeight === 192) {
      // Perfect size - no crop needed
      importCrop = { x: 0, y: 0, w: 256, h: 192 };
    } else if (img.naturalWidth > 256 || img.naturalHeight > 192) {
      // Larger image - try to detect ZX screen region
      detectScreenRegion();
    } else {
      // Smaller image - use full image
      importCrop = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    }
    updateCropInputs();

    // Apply crop and render source
    applyCropAndFit();

    // Render original with crop overlay
    renderOriginalWithCrop();

    // Auto-detect brightness
    autoDetectBrightness();

    // Generate initial preview
    const dithering = ditheringSelect?.value || 'floyd-steinberg';
    const contrast = parseInt(contrastSlider?.value || '0', 10);
    const brightness = parseInt(brightnessSlider?.value || '0', 10);
    const saturationSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importSaturation'));
    const saturation = parseInt(saturationSliderInit?.value || '0', 10);
    const gammaSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importGamma'));
    const gamma = parseInt(gammaSliderInit?.value || '100', 10) / 100;
    const sharpnessSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importSharpness'));
    const sharpness = parseInt(sharpnessSliderInit?.value || '0', 10);
    const blackPointSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importBlackPoint'));
    const blackPoint = parseInt(blackPointSliderInit?.value || '0', 10);
    const whitePointSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importWhitePoint'));
    const whitePoint = parseInt(whitePointSliderInit?.value || '255', 10);
    const balanceRSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceR'));
    const balanceRInit = parseInt(balanceRSliderInit?.value || '0', 10);
    const balanceGSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceG'));
    const balanceGInit = parseInt(balanceGSliderInit?.value || '0', 10);
    const balanceBSliderInit = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceB'));
    const balanceBInit = parseInt(balanceBSliderInit?.value || '0', 10);
    const grayscaleCheckboxInit = /** @type {HTMLInputElement} */ (document.getElementById('importGrayscale'));
    const grayscale = grayscaleCheckboxInit?.checked || false;

    const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, blackPoint, whitePoint, balanceRInit, balanceGInit, balanceBInit);
    renderScrToCanvas(scrData, importPreviewCanvas, importZoom);

    // Show dialog
    dialog.style.display = '';
  };

  img.onerror = () => {
    alert('Failed to load image file');
  };

  // Load from file
  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      img.src = /** @type {string} */ (e.target.result);
    }
  };
  reader.readAsDataURL(file);
}

/**
 * Close import dialog
 */
function closeImportDialog() {
  const dialog = document.getElementById('pngImportDialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
  importFile = null;
}

/**
 * Check if file is an image file
 * @param {string} filename - File name to check
 * @returns {boolean} True if image file
 */
function isImageFile(filename) {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ['png', 'gif', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext);
}
