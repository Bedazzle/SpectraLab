// SpectraLab v1.21.0 - PNG/GIF Image Import
// @ts-check
"use strict";

// ============================================================================
// PNG Import Module
// Converts PNG/GIF/JPG images to ZX Spectrum SCR format (6912 bytes)
// ============================================================================

// ============================================================================
// LAB Color Space Conversion
// More perceptually accurate color matching than RGB
// ============================================================================

/**
 * Convert sRGB to linear RGB
 * @param {number} c - sRGB component (0-255)
 * @returns {number} Linear RGB component (0-1)
 */
function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convert RGB to XYZ color space (D65 illuminant)
 * @param {number[]} rgb - RGB color [R, G, B] (0-255)
 * @returns {number[]} XYZ color [X, Y, Z]
 */
function rgbToXyz(rgb) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);

  // sRGB to XYZ matrix (D65 illuminant)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  return [x * 100, y * 100, z * 100];
}

/**
 * Convert XYZ to LAB color space
 * @param {number[]} xyz - XYZ color [X, Y, Z]
 * @returns {number[]} LAB color [L, a, b]
 */
function xyzToLab(xyz) {
  // D65 reference white
  const refX = 95.047;
  const refY = 100.000;
  const refZ = 108.883;

  let x = xyz[0] / refX;
  let y = xyz[1] / refY;
  let z = xyz[2] / refZ;

  const epsilon = 0.008856;
  const kappa = 903.3;

  x = x > epsilon ? Math.pow(x, 1/3) : (kappa * x + 16) / 116;
  y = y > epsilon ? Math.pow(y, 1/3) : (kappa * y + 16) / 116;
  z = z > epsilon ? Math.pow(z, 1/3) : (kappa * z + 16) / 116;

  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const b = 200 * (y - z);

  return [L, a, b];
}

/**
 * Convert RGB to LAB color space
 * @param {number[]} rgb - RGB color [R, G, B] (0-255)
 * @returns {number[]} LAB color [L, a, b]
 */
function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

/** @type {Map<number, number[]>} Cache for RGB to LAB conversions */
const labCache = new Map();

/** @type {boolean} Cached useLab setting - updated at start of each conversion */
let useLabMode = true;

/**
 * Update the useLab mode from checkbox (call once at start of conversion)
 */
function updateColorDistanceMode() {
  // Use cached element if available, fallback to DOM lookup
  const useLabCheckbox = importElements.useLab || /** @type {HTMLInputElement} */ (document.getElementById('importUseLab'));
  useLabMode = useLabCheckbox ? useLabCheckbox.checked : true;
}

/**
 * Convert RGB to LAB with caching (for palette colors)
 * @param {number[]} rgb - RGB color [R, G, B] (0-255)
 * @returns {number[]} LAB color [L, a, b]
 */
function rgbToLabCached(rgb) {
  // Use numeric key for faster lookup (R * 65536 + G * 256 + B)
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  let lab = labCache.get(key);
  if (!lab) {
    lab = rgbToLab(rgb);
    labCache.set(key, lab);
  }
  return lab;
}

/**
 * Color distance using weighted RGB (classic method)
 * @param {number[]} rgb1 - First color [R, G, B] (0-255)
 * @param {number[]} rgb2 - Second color [R, G, B] (0-255)
 * @returns {number} Distance value
 */
function colorDistanceRgb(rgb1, rgb2) {
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
 * Color distance using LAB color space (CIE76 Delta E)
 * @param {number[]} rgb1 - First color [R, G, B] (0-255)
 * @param {number[]} rgb2 - Second color [R, G, B] (0-255)
 * @returns {number} Delta E distance value
 */
function colorDistanceLab(rgb1, rgb2) {
  const lab1 = rgbToLabCached(rgb1);
  const lab2 = rgbToLabCached(rgb2);

  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];

  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Perceptual color distance - uses LAB or RGB based on cached setting
 * Call updateColorDistanceMode() once before batch operations
 * @param {number[]} rgb1 - First color [R, G, B] (0-255)
 * @param {number[]} rgb2 - Second color [R, G, B] (0-255)
 * @returns {number} Distance value
 */
function colorDistance(rgb1, rgb2) {
  return useLabMode ? colorDistanceLab(rgb1, rgb2) : colorDistanceRgb(rgb1, rgb2);
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
 * Apply bilateral filter for edge-preserving smoothing
 * Reduces noise while keeping edges sharp
 * @param {Uint8ClampedArray} pixels - RGBA pixels
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} amount - Smoothing amount (0-100)
 */
function applyBilateralFilter(pixels, width, height, amount) {
  if (amount <= 0) return;

  // Scale parameters based on amount (0-100)
  const spatialSigma = 2 + (amount / 100) * 4; // 2-6 pixels
  const rangeSigma = 20 + (amount / 100) * 60; // 20-80 intensity

  // Kernel radius (2-3 sigma covers most of the gaussian)
  const radius = Math.ceil(spatialSigma * 2);

  // Pre-compute spatial gaussian weights
  const spatialWeights = [];
  for (let dy = -radius; dy <= radius; dy++) {
    spatialWeights[dy + radius] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      spatialWeights[dy + radius][dx + radius] = Math.exp(-dist2 / (2 * spatialSigma * spatialSigma));
    }
  }

  // Pre-compute range gaussian lookup table (0-441 for max RGB distance sqrt(255²*3))
  const rangeWeights = new Float32Array(442);
  for (let i = 0; i < 442; i++) {
    rangeWeights[i] = Math.exp(-(i * i) / (2 * rangeSigma * rangeSigma));
  }

  // Create copy of original pixels
  const original = new Uint8ClampedArray(pixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const centerR = original[idx];
      const centerG = original[idx + 1];
      const centerB = original[idx + 2];

      let sumR = 0, sumG = 0, sumB = 0;
      let weightSum = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;

        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const nidx = (ny * width + nx) * 4;
          const nr = original[nidx];
          const ng = original[nidx + 1];
          const nb = original[nidx + 2];

          // Color distance (Euclidean in RGB)
          const dr = nr - centerR;
          const dg = ng - centerG;
          const db = nb - centerB;
          const colorDist = Math.sqrt(dr * dr + dg * dg + db * db) | 0;

          // Combined weight: spatial * range
          const spatialW = spatialWeights[dy + radius][dx + radius];
          const rangeW = rangeWeights[Math.min(colorDist, 441)];
          const weight = spatialW * rangeW;

          sumR += nr * weight;
          sumG += ng * weight;
          sumB += nb * weight;
          weightSum += weight;
        }
      }

      if (weightSum > 0) {
        pixels[idx] = clamp(sumR / weightSum);
        pixels[idx + 1] = clamp(sumG / weightSum);
        pixels[idx + 2] = clamp(sumB / weightSum);
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
 * Two-row Sierra dithering (Sierra-2, faster than full Sierra)
 */
function sierra2Dither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 4/16], [2, 0, 3/16],
    [-2, 1, 1/16], [-1, 1, 2/16], [0, 1, 3/16], [1, 1, 2/16], [2, 1, 1/16]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel);
}

/**
 * Serpentine error diffusion (alternating row direction, reduces banding)
 * Uses Floyd-Steinberg weights with bidirectional scanning
 */
function serpentineDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    const reverse = y % 2 === 1;
    const startX = reverse ? width - 1 : 0;
    const endX = reverse ? -1 : width;
    const stepX = reverse ? -1 : 1;

    for (let x = startX; x !== endX; x += stepX) {
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

      // Floyd-Steinberg weights, direction-aware
      const right = reverse ? -1 : 1;
      const left = reverse ? 1 : -1;

      if (x + right >= 0 && x + right < width) {
        const i = idx + right * 3;
        pixels[i] += errR * 7 / 16;
        pixels[i + 1] += errG * 7 / 16;
        pixels[i + 2] += errB * 7 / 16;
      }
      if (y + 1 < height) {
        if (x + left >= 0 && x + left < width) {
          const i = ((y + 1) * width + (x + left)) * 3;
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
        if (x + right >= 0 && x + right < width) {
          const i = ((y + 1) * width + (x + right)) * 3;
          pixels[i] += errR * 1 / 16;
          pixels[i + 1] += errG * 1 / 16;
          pixels[i + 2] += errB * 1 / 16;
        }
      }
    }
  }
}

/**
 * Generate Hilbert curve coordinates for given order
 * @param {number} order - Hilbert curve order (2^order x 2^order grid)
 * @returns {Array<{x: number, y: number}>} Array of coordinates in curve order
 */
function generateHilbertCurve(order) {
  const n = 1 << order;
  const coords = [];

  function d2xy(d) {
    let x = 0, y = 0;
    let rx, ry, s, t = d;
    for (s = 1; s < n; s *= 2) {
      rx = 1 & (t / 2);
      ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        [x, y] = [y, x];
      }
      x += s * rx;
      y += s * ry;
      t = Math.floor(t / 4);
    }
    return { x, y };
  }

  for (let d = 0; d < n * n; d++) {
    coords.push(d2xy(d));
  }
  return coords;
}

/**
 * Riemersma dithering (Hilbert curve based error diffusion)
 * Reduces directional artifacts by following space-filling curve
 */
function riemersmaDither(pixels, width, height, palette) {
  // Use queue-based error diffusion along Hilbert curve
  const queueSize = 16;
  const weights = [];
  let sum = 0;
  for (let i = 0; i < queueSize; i++) {
    weights[i] = Math.pow(2, -(i + 1) / 3);
    sum += weights[i];
  }
  // Normalize weights
  for (let i = 0; i < queueSize; i++) {
    weights[i] /= sum;
  }

  // Determine Hilbert curve order to cover image
  const maxDim = Math.max(width, height);
  const order = Math.ceil(Math.log2(maxDim));
  const hilbert = generateHilbertCurve(order);

  // Error queues for R, G, B
  const errQueueR = new Array(queueSize).fill(0);
  const errQueueG = new Array(queueSize).fill(0);
  const errQueueB = new Array(queueSize).fill(0);

  for (const { x, y } of hilbert) {
    if (x >= width || y >= height) continue;

    const idx = (y * width + x) * 3;

    // Add weighted error from queue
    let addErrR = 0, addErrG = 0, addErrB = 0;
    for (let i = 0; i < queueSize; i++) {
      addErrR += errQueueR[i] * weights[i];
      addErrG += errQueueG[i] * weights[i];
      addErrB += errQueueB[i] * weights[i];
    }

    const oldR = pixels[idx] + addErrR;
    const oldG = pixels[idx + 1] + addErrG;
    const oldB = pixels[idx + 2] + addErrB;

    const nearest = findNearestColor([clamp(oldR), clamp(oldG), clamp(oldB)], palette);
    const newColor = palette[nearest];

    pixels[idx] = newColor[0];
    pixels[idx + 1] = newColor[1];
    pixels[idx + 2] = newColor[2];

    // Calculate error and push to queue
    const errR = oldR - newColor[0];
    const errG = oldG - newColor[1];
    const errB = oldB - newColor[2];

    // Shift queue and add new error
    errQueueR.shift(); errQueueR.push(errR);
    errQueueG.shift(); errQueueG.push(errG);
    errQueueB.shift(); errQueueB.push(errB);
  }
}

/**
 * Blue noise threshold map (16x16 precomputed)
 */
const BLUE_NOISE_16 = [
  [106, 53, 174, 89, 219, 16, 142, 70, 195, 38, 162, 121, 8, 182, 65, 237],
  [231, 138, 21, 246, 115, 180, 56, 241, 108, 225, 82, 205, 145, 95, 213, 42],
  [76, 189, 98, 156, 46, 208, 130, 12, 167, 47, 134, 26, 239, 58, 156, 123],
  [152, 6, 217, 67, 136, 88, 252, 78, 193, 96, 177, 69, 113, 186, 31, 199],
  [249, 112, 165, 30, 185, 35, 163, 116, 29, 248, 147, 223, 4, 140, 86, 243],
  [59, 202, 83, 235, 101, 222, 50, 210, 144, 61, 17, 102, 172, 236, 51, 130],
  [133, 17, 143, 54, 149, 2, 126, 73, 186, 92, 196, 82, 41, 117, 192, 73],
  [228, 178, 92, 198, 170, 250, 183, 242, 22, 232, 125, 155, 214, 63, 160, 14],
  [44, 109, 254, 37, 79, 107, 40, 100, 150, 48, 173, 10, 253, 91, 229, 105],
  [148, 211, 64, 168, 122, 206, 158, 226, 69, 209, 77, 187, 135, 33, 176, 49],
  [18, 85, 188, 8, 238, 23, 62, 4, 119, 255, 99, 52, 234, 111, 216, 139],
  [234, 128, 227, 102, 146, 181, 134, 197, 161, 25, 139, 169, 72, 153, 81, 247],
  [57, 175, 44, 203, 55, 247, 86, 34, 83, 218, 194, 20, 245, 38, 190, 28],
  [201, 93, 161, 78, 166, 118, 220, 151, 240, 110, 58, 129, 97, 164, 114, 127],
  [11, 244, 120, 223, 15, 191, 42, 103, 66, 175, 148, 220, 184, 45, 230, 68],
  [137, 36, 183, 90, 141, 252, 75, 179, 13, 201, 88, 7, 254, 75, 141, 204]
];

/**
 * Blue noise dithering (visually pleasing, organic-looking pattern)
 */
function blueNoiseDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const threshold = BLUE_NOISE_16[y % 16][x % 16] - 128;
      const scale = 0.5; // Adjust strength

      const r = clamp(pixels[idx] + threshold * scale);
      const g = clamp(pixels[idx + 1] + threshold * scale);
      const b = clamp(pixels[idx + 2] + threshold * scale);

      const nearest = findNearestColor([r, g, b], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];
    }
  }
}

/**
 * Pattern dithering using clustered dot pattern (halftone-like)
 */
const CLUSTER_8X8 = [
  [24, 10, 12, 26, 35, 47, 49, 37],
  [8, 0, 2, 14, 45, 59, 61, 51],
  [22, 6, 4, 16, 43, 57, 63, 53],
  [30, 20, 18, 28, 33, 41, 55, 39],
  [34, 46, 48, 36, 25, 11, 13, 27],
  [44, 58, 60, 50, 9, 1, 3, 15],
  [42, 56, 62, 52, 23, 7, 5, 17],
  [32, 40, 54, 38, 31, 21, 19, 29]
];

function patternDither(pixels, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      // Threshold scaled to -32..+31 range
      const threshold = (CLUSTER_8X8[y % 8][x % 8] - 32) * 4;

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

// ============================================================================
// Cell-Aware Dithering
// Dithers within 8x8 cells using only the 2 selected colors per cell
// Prevents error diffusion across cell boundaries for cleaner results
// ============================================================================

/**
 * Find best ink/paper combination for a cell from original pixels (no dithering)
 * @param {Float32Array} pixels - Original pixels array (RGB)
 * @param {number} cellX - Cell X position (0-31)
 * @param {number} cellY - Cell Y position (0-23)
 * @param {number} width - Image width
 * @param {{regular: number[][], bright: number[][]}} palette - Color palette
 * @returns {{ink: number, paper: number, bright: boolean, inkRgb: number[], paperRgb: number[]}}
 */
function findCellColors(pixels, cellX, cellY, width, palette) {
  // Collect all 64 pixel colors from original image
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

  // Try all ink/paper combinations for both brightness levels
  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;

        for (let i = 0; i < 64; i++) {
          const color = cellColors[i];
          const inkDist = colorDistance(color, pal[ink]);
          const paperDist = colorDistance(color, pal[paper]);
          totalError += Math.min(inkDist, paperDist);
        }

        if (totalError < bestError) {
          bestError = totalError;
          bestInk = ink;
          bestPaper = paper;
          bestBright = bright === 1;
        }
      }
    }
  }

  const pal = bestBright ? palette.bright : palette.regular;
  return {
    ink: bestInk,
    paper: bestPaper,
    bright: bestBright,
    inkRgb: pal[bestInk],
    paperRgb: pal[bestPaper]
  };
}

/**
 * Apply Floyd-Steinberg dithering within a single 8x8 cell using only 2 colors
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellFloydSteinberg(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  // Copy cell pixels to local buffer for dithering
  const cellPixels = new Float32Array(8 * 8 * 3);
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const dstIdx = (dy * 8 + dx) * 3;
      cellPixels[dstIdx] = pixels[srcIdx];
      cellPixels[dstIdx + 1] = pixels[srcIdx + 1];
      cellPixels[dstIdx + 2] = pixels[srcIdx + 2];
    }
  }

  const bitmap = new Uint8Array(8);
  const twoColorPalette = [inkRgb, paperRgb];

  // Apply Floyd-Steinberg within cell
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = (y * 8 + x) * 3;
      const oldR = cellPixels[idx];
      const oldG = cellPixels[idx + 1];
      const oldB = cellPixels[idx + 2];

      // Find nearest of the two colors
      const inkDist = colorDistance([oldR, oldG, oldB], inkRgb);
      const paperDist = colorDistance([oldR, oldG, oldB], paperRgb);
      const useInk = inkDist < paperDist;
      const newColor = useInk ? inkRgb : paperRgb;

      if (useInk) {
        bitmap[y] |= (0x80 >> x);
      }

      // Calculate error
      const errR = oldR - newColor[0];
      const errG = oldG - newColor[1];
      const errB = oldB - newColor[2];

      // Distribute error to neighbors (within cell only)
      if (x + 1 < 8) {
        const i = idx + 3;
        cellPixels[i] += errR * 7 / 16;
        cellPixels[i + 1] += errG * 7 / 16;
        cellPixels[i + 2] += errB * 7 / 16;
      }
      if (y + 1 < 8) {
        if (x > 0) {
          const i = ((y + 1) * 8 + (x - 1)) * 3;
          cellPixels[i] += errR * 3 / 16;
          cellPixels[i + 1] += errG * 3 / 16;
          cellPixels[i + 2] += errB * 3 / 16;
        }
        {
          const i = ((y + 1) * 8 + x) * 3;
          cellPixels[i] += errR * 5 / 16;
          cellPixels[i + 1] += errG * 5 / 16;
          cellPixels[i + 2] += errB * 5 / 16;
        }
        if (x + 1 < 8) {
          const i = ((y + 1) * 8 + (x + 1)) * 3;
          cellPixels[i] += errR * 1 / 16;
          cellPixels[i + 1] += errG * 1 / 16;
          cellPixels[i + 2] += errB * 1 / 16;
        }
      }
    }
  }

  return bitmap;
}

/**
 * Apply Atkinson dithering within a single 8x8 cell using only 2 colors
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellAtkinson(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  // Copy cell pixels to local buffer
  const cellPixels = new Float32Array(8 * 8 * 3);
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const dstIdx = (dy * 8 + dx) * 3;
      cellPixels[dstIdx] = pixels[srcIdx];
      cellPixels[dstIdx + 1] = pixels[srcIdx + 1];
      cellPixels[dstIdx + 2] = pixels[srcIdx + 2];
    }
  }

  const bitmap = new Uint8Array(8);

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = (y * 8 + x) * 3;
      const oldR = cellPixels[idx];
      const oldG = cellPixels[idx + 1];
      const oldB = cellPixels[idx + 2];

      const inkDist = colorDistance([oldR, oldG, oldB], inkRgb);
      const paperDist = colorDistance([oldR, oldG, oldB], paperRgb);
      const useInk = inkDist < paperDist;
      const newColor = useInk ? inkRgb : paperRgb;

      if (useInk) {
        bitmap[y] |= (0x80 >> x);
      }

      // Atkinson: 1/8 error to 6 neighbors
      const errR = (oldR - newColor[0]) / 8;
      const errG = (oldG - newColor[1]) / 8;
      const errB = (oldB - newColor[2]) / 8;

      const neighbors = [
        [x + 1, y], [x + 2, y],
        [x - 1, y + 1], [x, y + 1], [x + 1, y + 1],
        [x, y + 2]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
          const i = (ny * 8 + nx) * 3;
          cellPixels[i] += errR;
          cellPixels[i + 1] += errG;
          cellPixels[i + 2] += errB;
        }
      }
    }
  }

  return bitmap;
}

/**
 * Apply ordered dithering within a single 8x8 cell using only 2 colors
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellOrdered(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const r = pixels[srcIdx];
      const g = pixels[srcIdx + 1];
      const b = pixels[srcIdx + 2];

      // Calculate luminance difference between ink and paper
      const inkLum = 0.299 * inkRgb[0] + 0.587 * inkRgb[1] + 0.114 * inkRgb[2];
      const paperLum = 0.299 * paperRgb[0] + 0.587 * paperRgb[1] + 0.114 * paperRgb[2];
      const pixelLum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Normalize to 0-1 range between paper and ink
      const range = Math.abs(inkLum - paperLum);
      let t = range > 0 ? (pixelLum - Math.min(inkLum, paperLum)) / range : 0.5;
      t = Math.max(0, Math.min(1, t));

      // Apply Bayer threshold
      const threshold = (BAYER_4X4[dy % 4][dx % 4] + 0.5) / 16;
      const useInk = inkLum < paperLum ? (t < threshold) : (t >= (1 - threshold));

      if (useInk) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return bitmap;
}

/**
 * No dithering - just find nearest color for each pixel
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellNone(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const r = pixels[srcIdx];
      const g = pixels[srcIdx + 1];
      const b = pixels[srcIdx + 2];

      const inkDist = colorDistance([r, g, b], inkRgb);
      const paperDist = colorDistance([r, g, b], paperRgb);

      if (inkDist < paperDist) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return bitmap;
}

/**
 * Two-row Sierra dithering within an 8x8 cell
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellSierra2(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);
  // Work with a local copy for error diffusion
  const local = new Float32Array(8 * 8 * 3);
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const localIdx = (dy * 8 + dx) * 3;
      local[localIdx] = pixels[srcIdx];
      local[localIdx + 1] = pixels[srcIdx + 1];
      local[localIdx + 2] = pixels[srcIdx + 2];
    }
  }

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const localIdx = (dy * 8 + dx) * 3;
      const r = local[localIdx];
      const g = local[localIdx + 1];
      const b = local[localIdx + 2];

      const inkDist = colorDistance([r, g, b], inkRgb);
      const paperDist = colorDistance([r, g, b], paperRgb);
      const useInk = inkDist < paperDist;

      if (useInk) {
        bitmap[dy] |= (0x80 >> dx);
      }

      const newColor = useInk ? inkRgb : paperRgb;
      const errR = r - newColor[0];
      const errG = g - newColor[1];
      const errB = b - newColor[2];

      // Two-row Sierra: /16 scale
      const diffuse = (ddx, ddy, weight) => {
        const nx = dx + ddx, ny = dy + ddy;
        if (nx >= 0 && nx < 8 && ny < 8) {
          const idx = (ny * 8 + nx) * 3;
          local[idx] += errR * weight / 16;
          local[idx + 1] += errG * weight / 16;
          local[idx + 2] += errB * weight / 16;
        }
      };
      diffuse(1, 0, 4); diffuse(2, 0, 3);
      diffuse(-2, 1, 1); diffuse(-1, 1, 2); diffuse(0, 1, 3); diffuse(1, 1, 2); diffuse(2, 1, 1);
    }
  }
  return bitmap;
}

/**
 * Serpentine (bidirectional) Floyd-Steinberg within an 8x8 cell
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellSerpentine(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);
  const local = new Float32Array(8 * 8 * 3);
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const localIdx = (dy * 8 + dx) * 3;
      local[localIdx] = pixels[srcIdx];
      local[localIdx + 1] = pixels[srcIdx + 1];
      local[localIdx + 2] = pixels[srcIdx + 2];
    }
  }

  for (let dy = 0; dy < 8; dy++) {
    const leftToRight = (dy % 2 === 0);
    for (let i = 0; i < 8; i++) {
      const dx = leftToRight ? i : (7 - i);
      const localIdx = (dy * 8 + dx) * 3;
      const r = local[localIdx];
      const g = local[localIdx + 1];
      const b = local[localIdx + 2];

      const inkDist = colorDistance([r, g, b], inkRgb);
      const paperDist = colorDistance([r, g, b], paperRgb);
      const useInk = inkDist < paperDist;

      if (useInk) {
        bitmap[dy] |= (0x80 >> dx);
      }

      const newColor = useInk ? inkRgb : paperRgb;
      const errR = r - newColor[0];
      const errG = g - newColor[1];
      const errB = b - newColor[2];

      const diffuse = (ddx, ddy, weight) => {
        const nx = dx + (leftToRight ? ddx : -ddx), ny = dy + ddy;
        if (nx >= 0 && nx < 8 && ny < 8) {
          const idx = (ny * 8 + nx) * 3;
          local[idx] += errR * weight / 16;
          local[idx + 1] += errG * weight / 16;
          local[idx + 2] += errB * weight / 16;
        }
      };
      diffuse(1, 0, 7);
      diffuse(-1, 1, 3); diffuse(0, 1, 5); diffuse(1, 1, 1);
    }
  }
  return bitmap;
}

/**
 * Riemersma-style dithering within an 8x8 cell using Z-order curve
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellRiemersma(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);
  const local = new Float32Array(8 * 8 * 3);
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const localIdx = (dy * 8 + dx) * 3;
      local[localIdx] = pixels[srcIdx];
      local[localIdx + 1] = pixels[srcIdx + 1];
      local[localIdx + 2] = pixels[srcIdx + 2];
    }
  }

  // Generate Z-order (Morton) curve for 8x8
  const curve = [];
  for (let i = 0; i < 64; i++) {
    let x = 0, y = 0;
    for (let b = 0; b < 3; b++) {
      x |= ((i >> (2 * b)) & 1) << b;
      y |= ((i >> (2 * b + 1)) & 1) << b;
    }
    curve.push({ x, y });
  }

  // Error buffer along the curve
  const histLen = 16;
  const errHist = new Float32Array(histLen * 3);
  let histIdx = 0;

  for (const pt of curve) {
    const localIdx = (pt.y * 8 + pt.x) * 3;
    // Add accumulated error
    let errSum = [0, 0, 0];
    for (let h = 0; h < histLen; h++) {
      const weight = (histLen - h) / ((histLen * (histLen + 1)) / 2);
      errSum[0] += errHist[h * 3] * weight;
      errSum[1] += errHist[h * 3 + 1] * weight;
      errSum[2] += errHist[h * 3 + 2] * weight;
    }
    const r = local[localIdx] + errSum[0];
    const g = local[localIdx + 1] + errSum[1];
    const b = local[localIdx + 2] + errSum[2];

    const inkDist = colorDistance([r, g, b], inkRgb);
    const paperDist = colorDistance([r, g, b], paperRgb);
    const useInk = inkDist < paperDist;

    if (useInk) {
      bitmap[pt.y] |= (0x80 >> pt.x);
    }

    const newColor = useInk ? inkRgb : paperRgb;
    errHist[histIdx * 3] = r - newColor[0];
    errHist[histIdx * 3 + 1] = g - newColor[1];
    errHist[histIdx * 3 + 2] = b - newColor[2];
    histIdx = (histIdx + 1) % histLen;
  }
  return bitmap;
}

/**
 * Blue noise dithering within an 8x8 cell
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellBlueNoise(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const r = pixels[srcIdx];
      const g = pixels[srcIdx + 1];
      const b = pixels[srcIdx + 2];

      const inkLum = 0.299 * inkRgb[0] + 0.587 * inkRgb[1] + 0.114 * inkRgb[2];
      const paperLum = 0.299 * paperRgb[0] + 0.587 * paperRgb[1] + 0.114 * paperRgb[2];
      const pixelLum = 0.299 * r + 0.587 * g + 0.114 * b;

      const range = Math.abs(inkLum - paperLum);
      let t = range > 0 ? (pixelLum - Math.min(inkLum, paperLum)) / range : 0.5;
      t = Math.max(0, Math.min(1, t));

      // Use blue noise pattern (tile from global 16x16)
      const globalX = cellX * 8 + dx;
      const globalY = cellY * 8 + dy;
      const threshold = BLUE_NOISE_16[globalY % 16][globalX % 16] / 255;
      const useInk = inkLum < paperLum ? (t < threshold) : (t >= (1 - threshold));

      if (useInk) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }
  return bitmap;
}

/**
 * Clustered dot (pattern) dithering within an 8x8 cell
 * @param {Float32Array} pixels - Source pixels (full image)
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color RGB
 * @param {number[]} paperRgb - Paper color RGB
 * @returns {Uint8Array} 8-byte bitmap for the cell
 */
function ditherCellPattern(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY * 8 + dy) * width + (cellX * 8 + dx)) * 3;
      const r = pixels[srcIdx];
      const g = pixels[srcIdx + 1];
      const b = pixels[srcIdx + 2];

      const inkLum = 0.299 * inkRgb[0] + 0.587 * inkRgb[1] + 0.114 * inkRgb[2];
      const paperLum = 0.299 * paperRgb[0] + 0.587 * paperRgb[1] + 0.114 * paperRgb[2];
      const pixelLum = 0.299 * r + 0.587 * g + 0.114 * b;

      const range = Math.abs(inkLum - paperLum);
      let t = range > 0 ? (pixelLum - Math.min(inkLum, paperLum)) / range : 0.5;
      t = Math.max(0, Math.min(1, t));

      // Use clustered dot pattern
      const threshold = (CLUSTER_8X8[dy][dx] + 0.5) / 64;
      const useInk = inkLum < paperLum ? (t < threshold) : (t >= (1 - threshold));

      if (useInk) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }
  return bitmap;
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
  const { cropX, cropY, cropW, cropH } = importElements;

  if (cropX) cropX.value = String(importCrop.x);
  if (cropY) cropY.value = String(importCrop.y);
  if (cropW) cropW.value = String(importCrop.w);
  if (cropH) cropH.value = String(importCrop.h);
}

/**
 * Read crop values from input fields
 */
function readCropInputs() {
  const { cropX, cropY, cropW, cropH } = importElements;

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
 * Analyze cell for mono output (black ink on white paper)
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} cellX - Cell X position (0-31)
 * @param {number} cellY - Cell Y position (0-23)
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color (black)
 * @param {number[]} paperRgb - Paper color (white)
 * @returns {{ink: number, paper: number, bright: boolean, bitmap: Uint8Array}}
 */
function analyzeCellMono(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = cellX * 8 + dx;
      const py = cellY * 8 + dy;
      const idx = (py * width + px) * 3;
      const color = [pixels[idx], pixels[idx + 1], pixels[idx + 2]];

      const inkDist = colorDistance(color, inkRgb);
      const paperDist = colorDistance(color, paperRgb);

      if (inkDist < paperDist) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return { ink: 0, paper: 7, bright: true, bitmap };
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
function convertToScr(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  // Cache color distance mode setting once at start
  updateColorDistanceMode();

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

  // Apply smoothing (bilateral filter) - before sharpening to reduce noise first
  if (smoothing > 0) {
    applyBilateralFilter(pixels, 256, 192, smoothing);
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

  // Get palette
  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  // Create SCR buffer
  const scr = new Uint8Array(6912);

  // Check if using cell-aware dithering
  const isCellAware = dithering.startsWith('cell-');

  if (isCellAware) {
    // Cell-aware dithering: process each cell independently
    // 1. Find best ink/paper for cell from original pixels
    // 2. Apply dithering within cell using only those 2 colors
    const cellDitherMethod = dithering.replace('cell-', '');

    // Mono output uses fixed black ink on white paper (bright)
    const monoColors = monoOutput ? {
      ink: 0, paper: 7, bright: true,
      inkRgb: palette.bright[0], paperRgb: palette.bright[7]
    } : null;

    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        // Find best ink/paper combination (or use mono if enabled)
        const colors = monoColors || findCellColors(floatPixels, cellX, cellY, 256, palette);

        // Apply cell-local dithering
        let bitmap;
        switch (cellDitherMethod) {
          case 'floyd':
            bitmap = ditherCellFloydSteinberg(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'atkinson':
            bitmap = ditherCellAtkinson(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'ordered':
            bitmap = ditherCellOrdered(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'sierra2':
            bitmap = ditherCellSierra2(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'serpentine':
            bitmap = ditherCellSerpentine(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'riemersma':
            bitmap = ditherCellRiemersma(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'blue-noise':
            bitmap = ditherCellBlueNoise(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'pattern':
            bitmap = ditherCellPattern(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          default: // 'none' or unknown
            bitmap = ditherCellNone(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
        }

        // Write bitmap bytes
        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = bitmap[line];
        }

        // Write attribute byte
        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = (colors.paper << 3) | colors.ink;
        if (colors.bright) attr |= 0x40;
        scr[attrOffset] = attr;
      }
    }
  } else {
    // Traditional global dithering approach
    // For mono output, use only black and white
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    switch (dithering) {
      case 'floyd-steinberg':
        floydSteinbergDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'jarvis':
        jarvisDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'stucki':
        stuckiDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'burkes':
        burkesDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'sierra':
        sierraDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'sierra-lite':
        sierraLiteDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'sierra2':
        sierra2Dither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'serpentine':
        serpentineDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'riemersma':
        riemersmaDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'blue-noise':
        blueNoiseDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'pattern':
        patternDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'atkinson':
        atkinsonDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'ordered':
        orderedDither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'ordered8':
        ordered8Dither(floatPixels, 256, 192, ditherPalette);
        break;
      case 'noise':
        noiseDither(floatPixels, 256, 192, ditherPalette);
        break;
      // 'none' - no dithering applied
    }

    // Process each 8x8 cell
    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        const cell = monoOutput
          ? analyzeCellMono(floatPixels, cellX, cellY, 256, palette.bright[0], palette.bright[7])
          : analyzeCell(floatPixels, cellX, cellY, 256);

        // Write bitmap bytes
        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = cell.bitmap[line];
        }

        // Write attribute byte
        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((cell.paper << 3) | cell.ink | (cell.bright ? 0x40 : 0));
        scr[attrOffset] = attr;
      }
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
function convertToBsc(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  // Cache color distance mode setting once at start
  updateColorDistanceMode();

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
  if (smoothing > 0) applyBilateralFilter(pixels, 384, 304, smoothing);
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
  const scrData = convertMainAreaToScr(mainCanvas, dithering, monoOutput);

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
function convertMainAreaToScr(sourceCanvas, dithering, monoOutput = false) {
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

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];
  const scr = new Uint8Array(6912);

  // Check if using cell-aware dithering
  const isCellAware = dithering.startsWith('cell-');

  if (isCellAware) {
    const cellDitherMethod = dithering.replace('cell-', '');

    // Mono output uses fixed black ink on white paper (bright)
    const monoColors = monoOutput ? {
      ink: 0, paper: 7, bright: true,
      inkRgb: palette.bright[0], paperRgb: palette.bright[7]
    } : null;

    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        const colors = monoColors || findCellColors(floatPixels, cellX, cellY, 256, palette);

        let bitmap;
        switch (cellDitherMethod) {
          case 'floyd':
            bitmap = ditherCellFloydSteinberg(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'atkinson':
            bitmap = ditherCellAtkinson(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'ordered':
            bitmap = ditherCellOrdered(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'sierra2':
            bitmap = ditherCellSierra2(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'serpentine':
            bitmap = ditherCellSerpentine(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'riemersma':
            bitmap = ditherCellRiemersma(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'blue-noise':
            bitmap = ditherCellBlueNoise(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          case 'pattern':
            bitmap = ditherCellPattern(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          default:
            bitmap = ditherCellNone(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
        }

        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = bitmap[line];
        }

        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = (colors.paper << 3) | colors.ink;
        if (colors.bright) attr |= 0x40;
        scr[attrOffset] = attr;
      }
    }
  } else {
    // Traditional global dithering
    // For mono output, use only black and white
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    switch (dithering) {
      case 'floyd-steinberg': floydSteinbergDither(floatPixels, 256, 192, ditherPalette); break;
      case 'jarvis': jarvisDither(floatPixels, 256, 192, ditherPalette); break;
      case 'stucki': stuckiDither(floatPixels, 256, 192, ditherPalette); break;
      case 'burkes': burkesDither(floatPixels, 256, 192, ditherPalette); break;
      case 'sierra': sierraDither(floatPixels, 256, 192, ditherPalette); break;
      case 'sierra-lite': sierraLiteDither(floatPixels, 256, 192, ditherPalette); break;
      case 'sierra2': sierra2Dither(floatPixels, 256, 192, ditherPalette); break;
      case 'serpentine': serpentineDither(floatPixels, 256, 192, ditherPalette); break;
      case 'riemersma': riemersmaDither(floatPixels, 256, 192, ditherPalette); break;
      case 'blue-noise': blueNoiseDither(floatPixels, 256, 192, ditherPalette); break;
      case 'pattern': patternDither(floatPixels, 256, 192, ditherPalette); break;
      case 'atkinson': atkinsonDither(floatPixels, 256, 192, ditherPalette); break;
      case 'ordered': orderedDither(floatPixels, 256, 192, ditherPalette); break;
      case 'ordered8': ordered8Dither(floatPixels, 256, 192, ditherPalette); break;
      case 'noise': noiseDither(floatPixels, 256, 192, ditherPalette); break;
    }

    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        const cell = monoOutput
          ? analyzeCellMono(floatPixels, cellX, cellY, 256, palette.bright[0], palette.bright[7])
          : analyzeCell(floatPixels, cellX, cellY, 256);

        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = cell.bitmap[line];
        }

        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((cell.paper << 3) | cell.ink | (cell.bright ? 0x40 : 0));
        scr[attrOffset] = attr;
      }
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

  // Draw at 1x then scale up (reuse temp canvas for performance)
  const temp = getImportTempCanvas(384, 304);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 384 * zoom, 304 * zoom);
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

  // Draw at 1x then scale up (reuse temp canvas for performance)
  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

// ============================================================================
// Reusable Temporary Canvas (for preview rendering)
// ============================================================================

/** @type {HTMLCanvasElement|null} - Reusable temp canvas for preview */
let importTempCanvas = null;

/** @type {CanvasRenderingContext2D|null} - Reusable temp canvas context */
let importTempCtx = null;

/**
 * Get or create the reusable temp canvas for import preview rendering
 * @param {number} width - Required width
 * @param {number} height - Required height
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}|null}
 */
function getImportTempCanvas(width, height) {
  if (!importTempCanvas) {
    importTempCanvas = document.createElement('canvas');
    importTempCtx = importTempCanvas.getContext('2d');
  }
  // Resize only if needed
  if (importTempCanvas.width !== width || importTempCanvas.height !== height) {
    importTempCanvas.width = width;
    importTempCanvas.height = height;
  }
  if (!importTempCtx) return null;
  return { canvas: importTempCanvas, ctx: importTempCtx };
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
 * Cached DOM elements for import dialog - populated in initPngImport()
 */
const importElements = {
  // Crop inputs
  /** @type {HTMLInputElement|null} */ cropX: null,
  /** @type {HTMLInputElement|null} */ cropY: null,
  /** @type {HTMLInputElement|null} */ cropW: null,
  /** @type {HTMLInputElement|null} */ cropH: null,
  /** @type {HTMLInputElement|null} */ cropLock43: null,
  // Selects
  /** @type {HTMLSelectElement|null} */ dithering: null,
  /** @type {HTMLSelectElement|null} */ format: null,
  /** @type {HTMLSelectElement|null} */ palette: null,
  /** @type {HTMLSelectElement|null} */ zoom: null,
  /** @type {HTMLSelectElement|null} */ fitMode: null,
  // Sliders
  /** @type {HTMLInputElement|null} */ contrast: null,
  /** @type {HTMLInputElement|null} */ brightness: null,
  /** @type {HTMLInputElement|null} */ saturation: null,
  /** @type {HTMLInputElement|null} */ gamma: null,
  /** @type {HTMLInputElement|null} */ sharpness: null,
  /** @type {HTMLInputElement|null} */ smoothing: null,
  /** @type {HTMLInputElement|null} */ blackPoint: null,
  /** @type {HTMLInputElement|null} */ whitePoint: null,
  /** @type {HTMLInputElement|null} */ balanceR: null,
  /** @type {HTMLInputElement|null} */ balanceG: null,
  /** @type {HTMLInputElement|null} */ balanceB: null,
  // Checkboxes
  /** @type {HTMLInputElement|null} */ grayscale: null,
  /** @type {HTMLInputElement|null} */ monoOutput: null,
  /** @type {HTMLInputElement|null} */ useLab: null,
  // Value labels
  /** @type {HTMLElement|null} */ saturationValue: null,
  /** @type {HTMLElement|null} */ gammaValue: null,
  /** @type {HTMLElement|null} */ sharpnessValue: null,
  /** @type {HTMLElement|null} */ smoothingValue: null,
  /** @type {HTMLElement|null} */ levelsValue: null,
  /** @type {HTMLElement|null} */ colorBalanceValue: null,
  // Dialog
  /** @type {HTMLElement|null} */ dialog: null
};

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

      // Check if 4:3 lock is enabled
      const isLocked = importElements.cropLock43?.checked || false;

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

      // Apply 4:3 aspect ratio lock
      if (isLocked) {
        const isCorner = dir.length === 2;
        const isHorizontal = dir === 'l' || dir === 'r';
        const isVertical = dir === 't' || dir === 'b';

        if (isCorner || isHorizontal) {
          // Width changed - adjust height
          const targetH = Math.round(newW * 3 / 4);
          if (dir.includes('t')) {
            // Top edge - adjust Y to maintain bottom position
            const bottomY = newY + newH;
            newH = targetH;
            newY = bottomY - newH;
            if (newY < 0) { newY = 0; newH = bottomY; newW = Math.round(newH * 4 / 3); }
          } else {
            // Bottom edge or no vertical - just adjust height
            newH = targetH;
            if (newY + newH > imgH) { newH = imgH - newY; newW = Math.round(newH * 4 / 3); }
          }
        } else if (isVertical) {
          // Height changed - adjust width
          const targetW = Math.round(newH * 4 / 3);
          if (dir.includes('l')) {
            const rightX = newX + newW;
            newW = targetW;
            newX = rightX - newW;
            if (newX < 0) { newX = 0; newW = rightX; newH = Math.round(newW * 3 / 4); }
          } else {
            newW = targetW;
            if (newX + newW > imgW) { newW = imgW - newX; newH = Math.round(newW * 3 / 4); }
          }
        }
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
  importElements.dialog = document.getElementById('pngImportDialog');
  if (!importElements.dialog) return;

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

  // Cache all DOM elements once
  importElements.cropX = /** @type {HTMLInputElement} */ (document.getElementById('importCropX'));
  importElements.cropY = /** @type {HTMLInputElement} */ (document.getElementById('importCropY'));
  importElements.cropW = /** @type {HTMLInputElement} */ (document.getElementById('importCropW'));
  importElements.cropH = /** @type {HTMLInputElement} */ (document.getElementById('importCropH'));
  importElements.cropLock43 = /** @type {HTMLInputElement} */ (document.getElementById('importCropLock43'));
  importElements.dithering = /** @type {HTMLSelectElement} */ (document.getElementById('importDithering'));
  importElements.contrast = /** @type {HTMLInputElement} */ (document.getElementById('importContrast'));
  importElements.brightness = /** @type {HTMLInputElement} */ (document.getElementById('importBrightness'));
  importElements.zoom = /** @type {HTMLSelectElement} */ (document.getElementById('importZoom'));
  importElements.palette = /** @type {HTMLSelectElement} */ (document.getElementById('importPalette'));
  importElements.format = /** @type {HTMLSelectElement} */ (document.getElementById('importFormat'));
  importElements.fitMode = /** @type {HTMLSelectElement} */ (document.getElementById('importFitMode'));
  importElements.grayscale = /** @type {HTMLInputElement} */ (document.getElementById('importGrayscale'));
  importElements.monoOutput = /** @type {HTMLInputElement} */ (document.getElementById('importMonoOutput'));
  importElements.saturation = /** @type {HTMLInputElement} */ (document.getElementById('importSaturation'));
  importElements.gamma = /** @type {HTMLInputElement} */ (document.getElementById('importGamma'));
  importElements.sharpness = /** @type {HTMLInputElement} */ (document.getElementById('importSharpness'));
  importElements.smoothing = /** @type {HTMLInputElement} */ (document.getElementById('importSmoothing'));
  importElements.blackPoint = /** @type {HTMLInputElement} */ (document.getElementById('importBlackPoint'));
  importElements.whitePoint = /** @type {HTMLInputElement} */ (document.getElementById('importWhitePoint'));
  importElements.balanceR = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceR'));
  importElements.balanceG = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceG'));
  importElements.balanceB = /** @type {HTMLInputElement} */ (document.getElementById('importBalanceB'));
  importElements.useLab = /** @type {HTMLInputElement} */ (document.getElementById('importUseLab'));
  importElements.saturationValue = document.getElementById('importSaturationValue');
  importElements.gammaValue = document.getElementById('importGammaValue');
  importElements.sharpnessValue = document.getElementById('importSharpnessValue');
  importElements.smoothingValue = document.getElementById('importSmoothingValue');
  importElements.levelsValue = document.getElementById('importLevelsValue');
  importElements.colorBalanceValue = document.getElementById('importColorBalanceValue');

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

  // Local references for closure (from cached elements)
  const ditheringSelect = importElements.dithering;
  const contrastSlider = importElements.contrast;
  const brightnessSlider = importElements.brightness;
  const zoomSelect = importElements.zoom;
  const paletteSelect = importElements.palette;
  const formatSelect = importElements.format;
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

  // Local references for crop controls (from cached elements)
  const cropXInput = importElements.cropX;
  const cropYInput = importElements.cropY;
  const cropWInput = importElements.cropW;
  const cropHInput = importElements.cropH;
  const cropLock43 = importElements.cropLock43;
  const cropResetBtn = document.getElementById('importCropReset');
  const cropFullBtn = document.getElementById('importCropFull');
  const cropDetectBtn = document.getElementById('importCropDetect');
  const fitModeSelect = importElements.fitMode;

  // Local references for additional controls (from cached elements)
  const grayscaleCheckbox = importElements.grayscale;
  const monoOutputCheckbox = importElements.monoOutput;
  const saturationSlider = importElements.saturation;
  const gammaSlider = importElements.gamma;
  const sharpnessSlider = importElements.sharpness;
  const smoothingSlider = importElements.smoothing;
  const blackPointSlider = importElements.blackPoint;
  const whitePointSlider = importElements.whitePoint;
  const balanceRSlider = importElements.balanceR;
  const balanceGSlider = importElements.balanceG;
  const balanceBSlider = importElements.balanceB;

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
    const monoOutput = monoOutputCheckbox?.checked || false;
    const sharpness = parseInt(sharpnessSlider?.value || '0', 10);
    const smoothing = parseInt(smoothingSlider?.value || '0', 10);
    const blackPoint = parseInt(blackPointSlider?.value || '0', 10);
    const whitePoint = parseInt(whitePointSlider?.value || '255', 10);
    const balanceR = parseInt(balanceRSlider?.value || '0', 10);
    const balanceG = parseInt(balanceGSlider?.value || '0', 10);
    const balanceB = parseInt(balanceBSlider?.value || '0', 10);
    const format = formatSelect?.value || 'scr';

    if (format === 'bsc' && importSourceCanvasBsc) {
      const bscData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBscToCanvas(bscData, importPreviewCanvas, importZoom);
    } else {
      const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
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

  // Width change - adjust height if 4:3 locked
  const onCropWChange = () => {
    if (cropLock43?.checked && cropWInput && cropHInput) {
      const w = Math.max(1, parseInt(cropWInput.value, 10) || 256);
      const h = Math.round(w * 3 / 4);
      cropHInput.value = String(h);
    }
    readCropInputs();
    updateAll();
  };

  // Height change - adjust width if 4:3 locked
  const onCropHChange = () => {
    if (cropLock43?.checked && cropWInput && cropHInput) {
      const h = Math.max(1, parseInt(cropHInput.value, 10) || 192);
      const w = Math.round(h * 4 / 3);
      cropWInput.value = String(w);
    }
    readCropInputs();
    updateAll();
  };

  cropXInput?.addEventListener('change', onCropChange);
  cropYInput?.addEventListener('change', onCropChange);
  cropWInput?.addEventListener('change', onCropWChange);
  cropHInput?.addEventListener('change', onCropHChange);

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
      const imgW = importImage.naturalWidth;
      const imgH = importImage.naturalHeight;

      if (cropLock43?.checked) {
        // Calculate maximum 4:3 region that fits
        const targetRatio = 4 / 3;
        const imgRatio = imgW / imgH;

        let cropW, cropH;
        if (imgRatio > targetRatio) {
          // Image is wider - fit by height
          cropH = imgH;
          cropW = Math.round(imgH * targetRatio);
        } else {
          // Image is taller - fit by width
          cropW = imgW;
          cropH = Math.round(imgW / targetRatio);
        }
        importCrop = {
          x: Math.floor((imgW - cropW) / 2),
          y: Math.floor((imgH - cropH) / 2),
          w: cropW,
          h: cropH
        };
      } else {
        importCrop = { x: 0, y: 0, w: imgW, h: imgH };
      }
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
    if (importElements.saturationValue) {
      importElements.saturationValue.textContent = this.value;
    }
    updatePreview();
  });
  gammaSlider?.addEventListener('input', function() {
    if (importElements.gammaValue) {
      importElements.gammaValue.textContent = (parseInt(this.value, 10) / 100).toFixed(1);
    }
    updatePreview();
  });
  sharpnessSlider?.addEventListener('input', function() {
    if (importElements.sharpnessValue) {
      importElements.sharpnessValue.textContent = this.value;
    }
    updatePreview();
  });
  smoothingSlider?.addEventListener('input', function() {
    if (importElements.smoothingValue) {
      importElements.smoothingValue.textContent = this.value;
    }
    updatePreview();
  });

  // Levels sliders with combined value display
  const updateLevelsLabel = () => {
    if (importElements.levelsValue) {
      const bp = blackPointSlider?.value || '0';
      const wp = whitePointSlider?.value || '255';
      importElements.levelsValue.textContent = `${bp}-${wp}`;
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
    if (importElements.colorBalanceValue) {
      const r = balanceRSlider?.value || '0';
      const g = balanceGSlider?.value || '0';
      const b = balanceBSlider?.value || '0';
      importElements.colorBalanceValue.textContent = `${r}/${g}/${b}`;
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
  monoOutputCheckbox?.addEventListener('change', updatePreview);

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

  // ESC key to close dialog
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && importElements.dialog && importElements.dialog.style.display !== 'none') {
      closeImportDialog();
    }
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
    const monoOutput = monoOutputCheckbox?.checked || false;
    const sharpness = parseInt(sharpnessSlider?.value || '0', 10);
    const smoothing = parseInt(smoothingSlider?.value || '0', 10);
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
      outputData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.BSC;
      fileExt = '.bsc';
    } else {
      outputData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
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

  // Prevent accidental close on overlay click
  importElements.dialog.addEventListener('click', (e) => {
    // Only close if clicking directly on overlay AND using Cancel button
    // (which is handled separately) - do nothing here to prevent accidental close
    e.stopPropagation();
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
  if (importElements.brightness) {
    const adjustment = Math.round((128 - avgLum) * 0.5);
    importElements.brightness.value = String(Math.max(-100, Math.min(100, adjustment)));
  }
}

/**
 * Open import dialog with image file
 * @param {File} file - Image file to import
 */
function openImportDialog(file) {
  importFile = file;
  if (!importElements.dialog) return;

  // Reset controls using cached elements
  if (importElements.dithering) importElements.dithering.value = 'floyd-steinberg';
  if (importElements.contrast) importElements.contrast.value = '0';
  if (importElements.brightness) importElements.brightness.value = '0';
  if (importElements.zoom) importElements.zoom.value = '2';
  importZoom = 2;

  // Reset saturation, gamma, sharpness, and grayscale
  if (importElements.saturation) importElements.saturation.value = '0';
  if (importElements.gamma) importElements.gamma.value = '100';
  if (importElements.sharpness) importElements.sharpness.value = '0';
  if (importElements.smoothing) importElements.smoothing.value = '0';
  if (importElements.grayscale) importElements.grayscale.checked = false;
  if (importElements.monoOutput) importElements.monoOutput.checked = false;

  // Reset levels sliders
  if (importElements.blackPoint) importElements.blackPoint.value = '0';
  if (importElements.whitePoint) importElements.whitePoint.value = '255';

  // Reset color balance sliders
  if (importElements.balanceR) importElements.balanceR.value = '0';
  if (importElements.balanceG) importElements.balanceG.value = '0';
  if (importElements.balanceB) importElements.balanceB.value = '0';

  // Reset value display labels using cached elements
  if (importElements.gammaValue) importElements.gammaValue.textContent = '1.0';
  if (importElements.sharpnessValue) importElements.sharpnessValue.textContent = '0';
  if (importElements.smoothingValue) importElements.smoothingValue.textContent = '0';
  if (importElements.saturationValue) importElements.saturationValue.textContent = '0';
  if (importElements.levelsValue) importElements.levelsValue.textContent = '0-255';
  if (importElements.colorBalanceValue) importElements.colorBalanceValue.textContent = '0/0/0';

  // Set palette to current display palette
  if (importElements.palette) importElements.palette.value = currentPaletteId;
  applyImportPalette(currentPaletteId);

  // Reset fit mode
  if (importElements.fitMode) importElements.fitMode.value = 'stretch';
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

    // Generate initial preview using cached elements
    const dithering = importElements.dithering?.value || 'floyd-steinberg';
    const contrast = parseInt(importElements.contrast?.value || '0', 10);
    const brightness = parseInt(importElements.brightness?.value || '0', 10);
    const saturation = parseInt(importElements.saturation?.value || '0', 10);
    const gamma = parseInt(importElements.gamma?.value || '100', 10) / 100;
    const sharpness = parseInt(importElements.sharpness?.value || '0', 10);
    const smoothing = parseInt(importElements.smoothing?.value || '0', 10);
    const blackPoint = parseInt(importElements.blackPoint?.value || '0', 10);
    const whitePoint = parseInt(importElements.whitePoint?.value || '255', 10);
    const balanceR = parseInt(importElements.balanceR?.value || '0', 10);
    const balanceG = parseInt(importElements.balanceG?.value || '0', 10);
    const balanceB = parseInt(importElements.balanceB?.value || '0', 10);
    const grayscale = importElements.grayscale?.checked || false;
    const monoOutput = importElements.monoOutput?.checked || false;

    const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
    renderScrToCanvas(scrData, importPreviewCanvas, importZoom);

    // Show dialog
    importElements.dialog.style.display = '';
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
  if (importElements.dialog) {
    importElements.dialog.style.display = 'none';
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
