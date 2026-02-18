// SpectraLab v1.38.0 - PNG/GIF Image Import
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
 * @param {number[]} rgb - RGB color [R, G, B] (0-255, will be clamped)
 * @returns {number[]} LAB color [L, a, b]
 */
function rgbToLabCached(rgb) {
  // Clamp values to 0-255 range (important for dithering which can produce out-of-range values)
  const r = Math.max(0, Math.min(255, Math.round(rgb[0])));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1])));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2])));

  // Use numeric key for faster lookup (R * 65536 + G * 256 + B)
  const key = (r << 16) | (g << 8) | b;
  let lab = labCache.get(key);
  if (!lab) {
    lab = rgbToLab([r, g, b]);
    labCache.set(key, lab);
  }
  return lab;
}

/**
 * Color distance using weighted RGB (classic method)
 * @param {number[]} rgb1 - First color [R, G, B] (0-255, will be clamped)
 * @param {number[]} rgb2 - Second color [R, G, B] (0-255)
 * @returns {number} Distance value
 */
function colorDistanceRgb(rgb1, rgb2) {
  // Clamp first color (may be out of range during dithering)
  const r1 = Math.max(0, Math.min(255, rgb1[0]));
  const g1 = Math.max(0, Math.min(255, rgb1[1]));
  const b1 = Math.max(0, Math.min(255, rgb1[2]));

  const rMean = (r1 + rgb2[0]) / 2;
  const dr = r1 - rgb2[0];
  const dg = g1 - rgb2[1];
  const db = b1 - rgb2[2];
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
      const globalX = cellX * 8 + dx;
      const globalY = cellY * 8 + dy;
      const srcIdx = (globalY * width + globalX) * 3;
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

      // Apply Bayer threshold using GLOBAL coordinates for seamless pattern across cells
      const threshold = (BAYER_4X4[globalY % 4][globalX % 4] + 0.5) / 16;
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

  // Add phase shift based on cell position to break up grid pattern
  // Use co-prime multipliers to ensure good distribution
  const phaseX = (cellX * 3) % 8;
  const phaseY = (cellY * 5) % 8;

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

      // Use clustered dot pattern with phase shift to avoid grid effect
      const patternY = (dy + phaseY) % 8;
      const patternX = (dx + phaseX) % 8;
      const threshold = (CLUSTER_8X8[patternY][patternX] + 0.5) / 64;
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
 * Uses luminance (perceived brightness) for better results with colored images
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} cellX - Cell X position (0-31)
 * @param {number} cellY - Cell Y position (0-23)
 * @param {number} width - Image width
 * @param {number[]} inkRgb - Ink color (black) - unused, kept for API compatibility
 * @param {number[]} paperRgb - Paper color (white) - unused, kept for API compatibility
 * @returns {{ink: number, paper: number, bright: boolean, bitmap: Uint8Array}}
 */
function analyzeCellMono(pixels, cellX, cellY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(8);

  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = cellX * 8 + dx;
      const py = cellY * 8 + dy;
      const idx = (py * width + px) * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // After dithering, pixels should be either ink (black) or paper (white)
      // Compare directly to determine which color the pixel is closer to
      // This avoids threshold issues with intermediate values
      const inkDist = (r - inkRgb[0]) ** 2 + (g - inkRgb[1]) ** 2 + (b - inkRgb[2]) ** 2;
      const paperDist = (r - paperRgb[0]) ** 2 + (g - paperRgb[1]) ** 2 + (b - paperRgb[2]) ** 2;

      // If closer to ink (black), set as ink
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

  // For mono output, convert to grayscale BEFORE dithering
  // This ensures dithering works on luminance values, not colors
  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
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

    // For mono output with error diffusion methods, use GLOBAL dithering first
    // to avoid visible cell seams (since there's no attribute clash concern)
    const errorDiffusionMethods = ['floyd', 'atkinson', 'sierra2', 'serpentine', 'riemersma'];
    const useGlobalDitherForMono = monoOutput && errorDiffusionMethods.includes(cellDitherMethod);

    if (useGlobalDitherForMono) {
      // Apply global dithering with mono palette for seamless results
      const monoPalette = [palette.bright[0], palette.bright[7]];
      switch (cellDitherMethod) {
        case 'floyd': floydSteinbergDither(floatPixels, 256, 192, monoPalette); break;
        case 'atkinson': atkinsonDither(floatPixels, 256, 192, monoPalette); break;
        case 'sierra2': sierra2Dither(floatPixels, 256, 192, monoPalette); break;
        case 'serpentine': serpentineDither(floatPixels, 256, 192, monoPalette); break;
        case 'riemersma': riemersmaDither(floatPixels, 256, 192, monoPalette); break;
      }

      // Now just analyze each cell to create bitmap (pixels already dithered)
      for (let cellY = 0; cellY < 24; cellY++) {
        for (let cellX = 0; cellX < 32; cellX++) {
          const cell = analyzeCellMono(floatPixels, cellX, cellY, 256, monoColors.inkRgb, monoColors.paperRgb);

          // Write bitmap bytes
          for (let line = 0; line < 8; line++) {
            const y = cellY * 8 + line;
            const offset = getBitmapOffset(y) + cellX;
            scr[offset] = cell.bitmap[line];
          }

          // Write attribute byte (mono: black ink on bright white paper)
          const attrOffset = 6144 + cellY * 32 + cellX;
          scr[attrOffset] = (7 << 3) | 0 | 0x40;
        }
      }
    } else {
      // Standard cell-aware dithering (pattern-based or non-mono)
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

// ============================================================================
// ULA+ FORMAT CONVERSION (64-color palette)
// ============================================================================

/**
 * Generate optimal ULA+ palette from image colors
 * @param {Float32Array} pixels - Float array of RGB values (256x192x3)
 * @returns {Uint8Array} 64-byte palette in GRB332 format
 */
function generateOptimalUlaPlusPalette(pixels) {
  // Count frequency of each GRB332 color
  const colorFreq = new Map();

  for (let i = 0; i < 256 * 192; i++) {
    const r = Math.round(pixels[i * 3]);
    const g = Math.round(pixels[i * 3 + 1]);
    const b = Math.round(pixels[i * 3 + 2]);
    const grb = rgbToGrb332(r, g, b);
    colorFreq.set(grb, (colorFreq.get(grb) || 0) + 1);
  }

  // Sort colors by frequency
  const sortedColors = Array.from(colorFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  // Analyze cells to find which color pairs are used together
  const cellColorPairs = [];
  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      const cellColors = new Map();
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = cellX * 8 + dx;
          const py = cellY * 8 + dy;
          const idx = (py * 256 + px) * 3;
          const r = Math.round(pixels[idx]);
          const g = Math.round(pixels[idx + 1]);
          const b = Math.round(pixels[idx + 2]);
          const grb = rgbToGrb332(r, g, b);
          cellColors.set(grb, (cellColors.get(grb) || 0) + 1);
        }
      }
      // Get top 2 colors for this cell
      const topColors = Array.from(cellColors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(e => e[0]);
      if (topColors.length >= 2) {
        cellColorPairs.push(topColors);
      }
    }
  }

  // Build 4 CLUTs using color clustering
  // Each CLUT has 8 ink colors (0-7) and 8 paper colors (8-15)
  const clutColors = [new Set(), new Set(), new Set(), new Set()];

  // Assign cell color pairs to CLUTs to minimize color overlap
  for (const pair of cellColorPairs) {
    // Find CLUT with most room that can accommodate both colors
    let bestClut = 0;
    let bestScore = -Infinity;

    for (let c = 0; c < 4; c++) {
      const has0 = clutColors[c].has(pair[0]);
      const has1 = clutColors[c].has(pair[1]);
      const size = clutColors[c].size;

      // Score: prefer CLUTs that already have these colors, or have room
      let score = 0;
      if (has0) score += 10;
      if (has1) score += 10;
      if (size < 16) score += (16 - size);  // Room available
      if (!has0 && !has1 && size >= 14) score = -100;  // No room for 2 new colors

      if (score > bestScore) {
        bestScore = score;
        bestClut = c;
      }
    }

    // Add colors to chosen CLUT if there's room
    if (clutColors[bestClut].size < 16) {
      clutColors[bestClut].add(pair[0]);
    }
    if (clutColors[bestClut].size < 16) {
      clutColors[bestClut].add(pair[1]);
    }
  }

  // Fill any remaining slots with most frequent colors not yet used
  const usedColors = new Set();
  for (const clut of clutColors) {
    for (const c of clut) usedColors.add(c);
  }

  for (const grb of sortedColors) {
    if (usedColors.has(grb)) continue;

    // Add to CLUT with most room
    let minSize = 17;
    let targetClut = -1;
    for (let c = 0; c < 4; c++) {
      if (clutColors[c].size < minSize) {
        minSize = clutColors[c].size;
        targetClut = c;
      }
    }
    if (targetClut >= 0 && clutColors[targetClut].size < 16) {
      clutColors[targetClut].add(grb);
      usedColors.add(grb);
    }
  }

  // Ensure each CLUT has at least black and white for fallback
  const black = rgbToGrb332(0, 0, 0);
  const white = rgbToGrb332(255, 255, 255);
  for (let c = 0; c < 4; c++) {
    if (clutColors[c].size < 15 && !clutColors[c].has(black)) {
      clutColors[c].add(black);
    }
    if (clutColors[c].size < 16 && !clutColors[c].has(white)) {
      clutColors[c].add(white);
    }
  }

  // Convert to palette array
  const palette = new Uint8Array(64);
  for (let c = 0; c < 4; c++) {
    const colors = Array.from(clutColors[c]);
    // Sort by brightness for consistent ordering
    colors.sort((a, b) => {
      const rgbA = grb332ToRgb(a);
      const rgbB = grb332ToRgb(b);
      const lumA = rgbA[0] * 0.299 + rgbA[1] * 0.587 + rgbA[2] * 0.114;
      const lumB = rgbB[0] * 0.299 + rgbB[1] * 0.587 + rgbB[2] * 0.114;
      return lumA - lumB;
    });

    // Fill ink (0-7) and paper (8-15) slots
    const baseIdx = c * 16;
    for (let i = 0; i < 8; i++) {
      const color = i < colors.length ? colors[i] : (i === 0 ? black : white);
      palette[baseIdx + i] = color;  // INK
    }
    for (let i = 0; i < 8; i++) {
      const color = (i + 8) < colors.length ? colors[i + 8] : colors[Math.min(i, colors.length - 1)];
      palette[baseIdx + 8 + i] = color;  // PAPER
    }
  }

  return palette;
}

/**
 * Find best CLUT and ink/paper for a cell
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {Uint8Array} palette - ULA+ 64-byte palette
 * @returns {{clut: number, ink: number, paper: number, inkRgb: number[], paperRgb: number[]}}
 */
function findUlaPlusCellColors(pixels, cellX, cellY, palette) {
  // Collect cell colors
  const cellColors = [];
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = cellX * 8 + dx;
      const py = cellY * 8 + dy;
      const idx = (py * 256 + px) * 3;
      cellColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  let bestError = Infinity;
  let bestClut = 0;
  let bestInk = 0;
  let bestPaper = 0;

  // Try all CLUTs and all ink/paper combinations within each
  for (let clut = 0; clut < 4; clut++) {
    const baseIdx = clut * 16;

    for (let ink = 0; ink < 8; ink++) {
      const inkGrb = palette[baseIdx + ink];
      const inkRgb = grb332ToRgb(inkGrb);

      for (let paper = 0; paper < 8; paper++) {
        const paperGrb = palette[baseIdx + 8 + paper];
        const paperRgb = grb332ToRgb(paperGrb);

        let totalError = 0;
        for (const color of cellColors) {
          const inkDist = colorDistance(color, inkRgb);
          const paperDist = colorDistance(color, paperRgb);
          totalError += Math.min(inkDist, paperDist);
        }

        if (totalError < bestError) {
          bestError = totalError;
          bestClut = clut;
          bestInk = ink;
          bestPaper = paper;
        }
      }
    }
  }

  const baseIdx = bestClut * 16;
  return {
    clut: bestClut,
    ink: bestInk,
    paper: bestPaper,
    inkRgb: grb332ToRgb(palette[baseIdx + bestInk]),
    paperRgb: grb332ToRgb(palette[baseIdx + 8 + bestPaper])
  };
}

/**
 * Convert image to ULA+ format with optimal palette
 */
function convertToUlaPlus(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply image adjustments
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
  if (smoothing > 0) applyBilateralFilter(pixels, 256, 192, smoothing);
  if (sharpness > 0) applySharpening(pixels, 256, 192, sharpness);

  // Convert to float array
  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  // Generate optimal palette
  const palette = generateOptimalUlaPlusPalette(floatPixels);

  // Create output buffer (SCR + palette)
  const output = new Uint8Array(ULAPLUS.TOTAL_SIZE);

  // Check if using cell-aware dithering
  const isCellAware = dithering.startsWith('cell-');
  const cellDitherMethod = isCellAware ? dithering.replace('cell-', '') : dithering;

  // Convert each cell
  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      // Find best CLUT and colors for this cell
      const colors = findUlaPlusCellColors(floatPixels, cellX, cellY, palette);

      // Apply dithering within cell
      let bitmap;
      if (isCellAware) {
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
          default:
            bitmap = ditherCellOrdered(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
        }
      } else {
        // Simple nearest-color mapping
        bitmap = new Uint8Array(8);
        for (let dy = 0; dy < 8; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            const px = cellX * 8 + dx;
            const py = cellY * 8 + dy;
            const idx = (py * 256 + px) * 3;
            const color = [floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2]];
            const inkDist = colorDistance(color, colors.inkRgb);
            const paperDist = colorDistance(color, colors.paperRgb);
            if (inkDist < paperDist) {
              bitmap[dy] |= (0x80 >> dx);
            }
          }
        }
      }

      // Write bitmap
      for (let line = 0; line < 8; line++) {
        const y = cellY * 8 + line;
        const offset = getBitmapOffset(y) + cellX;
        output[offset] = bitmap[line];
      }

      // Write attribute: ULA+ uses standard format, CLUT selected by FLASH+BRIGHT bits
      // CLUT = (FLASH << 1) | BRIGHT
      const flash = (colors.clut >> 1) & 1;
      const bright = colors.clut & 1;
      const attrOffset = 6144 + cellY * 32 + cellX;
      output[attrOffset] = (flash << 7) | (bright << 6) | (colors.paper << 3) | colors.ink;
    }
  }

  // Write palette
  output.set(palette, ULAPLUS.PALETTE_OFFSET);

  return { data: output, palette: palette };
}

// ============================================================================
// IFL FORMAT CONVERSION (8×2 multicolor blocks)
// ============================================================================

/**
 * Find best ink/paper combination for an 8×2 block
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} blockX - Block X position (0-31)
 * @param {number} blockY - Block Y position (0-95)
 * @param {number} width - Image width
 * @param {Object} palette - Palette with regular and bright arrays
 * @returns {{ink: number, paper: number, bright: boolean, inkRgb: number[], paperRgb: number[]}}
 */
function findBlockColors2(pixels, blockX, blockY, width, palette) {
  // Collect all 16 pixel colors from 8×2 block
  const blockColors = [];
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 2 + dy;
      const idx = (py * width + px) * 3;
      blockColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
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

        for (let i = 0; i < 16; i++) {
          const color = blockColors[i];
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
 * Analyze an 8×2 block and return best colors and bitmap
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} blockX - Block X position (0-31)
 * @param {number} blockY - Block Y position (0-95)
 * @param {number} width - Image width
 * @returns {{ink: number, paper: number, bright: boolean, bitmap: Uint8Array}}
 */
function analyzeBlock2(pixels, blockX, blockY, width) {
  const palette = getCombinedPalette();

  // Collect all 16 pixel colors from 8×2 block
  const blockColors = [];
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 2 + dy;
      const idx = (py * width + px) * 3;
      blockColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  let bestError = Infinity;
  let bestInk = 0;
  let bestPaper = 7;
  let bestBright = false;
  let bestBitmap = new Uint8Array(2);

  // Try all ink/paper combinations for both brightness levels
  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;
        const bitmap = new Uint8Array(2);

        for (let i = 0; i < 16; i++) {
          const color = blockColors[i];
          const inkDist = colorDistance(color, pal[ink]);
          const paperDist = colorDistance(color, pal[paper]);

          const dy = Math.floor(i / 8);
          const dx = i % 8;

          if (inkDist < paperDist) {
            totalError += inkDist;
            bitmap[dy] |= (0x80 >> dx);
          } else {
            totalError += paperDist;
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
 * Analyze an 8×2 block for mono output using distance to ink/paper colors
 */
function analyzeBlock2Mono(pixels, blockX, blockY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(2);

  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 2 + dy;
      const idx = (py * width + px) * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // Compare distance to ink and paper colors
      const inkDist = (r - inkRgb[0]) ** 2 + (g - inkRgb[1]) ** 2 + (b - inkRgb[2]) ** 2;
      const paperDist = (r - paperRgb[0]) ** 2 + (g - paperRgb[1]) ** 2 + (b - paperRgb[2]) ** 2;

      if (inkDist < paperDist) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return {
    ink: 0,
    paper: 7,
    bright: true,
    bitmap: bitmap
  };
}

/**
 * Apply Floyd-Steinberg dithering within an 8×2 block
 */
function ditherBlock2FloydSteinberg(pixels, blockX, blockY, width, inkRgb, paperRgb) {
  const blockPixels = new Float32Array(8 * 2 * 3);
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((blockY * 2 + dy) * width + (blockX * 8 + dx)) * 3;
      const dstIdx = (dy * 8 + dx) * 3;
      blockPixels[dstIdx] = pixels[srcIdx];
      blockPixels[dstIdx + 1] = pixels[srcIdx + 1];
      blockPixels[dstIdx + 2] = pixels[srcIdx + 2];
    }
  }

  const bitmap = new Uint8Array(2);
  const twoColorPalette = [inkRgb, paperRgb];

  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = (y * 8 + x) * 3;
      const oldR = blockPixels[idx];
      const oldG = blockPixels[idx + 1];
      const oldB = blockPixels[idx + 2];

      const nearest = findNearestPaletteColor([oldR, oldG, oldB], twoColorPalette);
      const newR = twoColorPalette[nearest][0];
      const newG = twoColorPalette[nearest][1];
      const newB = twoColorPalette[nearest][2];

      if (nearest === 0) {
        bitmap[y] |= (0x80 >> x);
      }

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      // Distribute error within block
      if (x + 1 < 8) {
        const ni = (y * 8 + x + 1) * 3;
        blockPixels[ni] += errR * 7 / 16;
        blockPixels[ni + 1] += errG * 7 / 16;
        blockPixels[ni + 2] += errB * 7 / 16;
      }
      if (y + 1 < 2) {
        if (x > 0) {
          const ni = ((y + 1) * 8 + x - 1) * 3;
          blockPixels[ni] += errR * 3 / 16;
          blockPixels[ni + 1] += errG * 3 / 16;
          blockPixels[ni + 2] += errB * 3 / 16;
        }
        const ni = ((y + 1) * 8 + x) * 3;
        blockPixels[ni] += errR * 5 / 16;
        blockPixels[ni + 1] += errG * 5 / 16;
        blockPixels[ni + 2] += errB * 5 / 16;
        if (x + 1 < 8) {
          const ni2 = ((y + 1) * 8 + x + 1) * 3;
          blockPixels[ni2] += errR * 1 / 16;
          blockPixels[ni2 + 1] += errG * 1 / 16;
          blockPixels[ni2 + 2] += errB * 1 / 16;
        }
      }
    }
  }

  return bitmap;
}

/**
 * Apply ordered dithering within an 8×2 block
 */
function ditherBlock2Ordered(pixels, blockX, blockY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(2);

  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const globalX = blockX * 8 + dx;
      const globalY = blockY * 2 + dy;
      const idx = (globalY * width + globalX) * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      const inkDist = colorDistance([r, g, b], inkRgb);
      const paperDist = colorDistance([r, g, b], paperRgb);
      const totalDist = inkDist + paperDist;
      const inkRatio = totalDist > 0 ? paperDist / totalDist : 0.5;

      // Use Bayer 4x4 with GLOBAL coordinates for seamless pattern across blocks
      const t = (BAYER_4X4[globalY % 4][globalX % 4] + 0.5) / 16;
      if (inkRatio > t) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return bitmap;
}

/**
 * No dithering for 8×2 block - nearest color only
 */
function ditherBlock2None(pixels, blockX, blockY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(2);

  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 2 + dy;
      const idx = (py * width + px) * 3;

      const inkDist = colorDistance([pixels[idx], pixels[idx + 1], pixels[idx + 2]], inkRgb);
      const paperDist = colorDistance([pixels[idx], pixels[idx + 1], pixels[idx + 2]], paperRgb);

      if (inkDist < paperDist) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return bitmap;
}

/**
 * Convert image to IFL format (8×2 multicolor blocks)
 */
function convertToIfl(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply image adjustments (same as SCR)
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
  if (smoothing > 0) applyBilateralFilter(pixels, 256, 192, smoothing);
  if (sharpness > 0) applySharpening(pixels, 256, 192, sharpness);

  // For mono output, convert to grayscale before dithering
  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  // Convert to float array for processing
  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  // Create IFL buffer: 6144 bitmap + 3072 attributes = 9216 bytes
  const ifl = new Uint8Array(9216);

  const isCellAware = dithering.startsWith('cell-');

  if (isCellAware) {
    const cellDitherMethod = dithering.replace('cell-', '');
    const monoColors = monoOutput ? {
      ink: 0, paper: 7, bright: true,
      inkRgb: palette.bright[0], paperRgb: palette.bright[7]
    } : null;

    // For mono output with error diffusion, use global dithering for seamless results
    const useGlobalDitherForMono = monoOutput && cellDitherMethod === 'floyd';

    if (useGlobalDitherForMono) {
      // Apply global Floyd-Steinberg with mono palette
      const monoPalette = [palette.bright[0], palette.bright[7]];
      floydSteinbergDither(floatPixels, 256, 192, monoPalette);

      // Analyze blocks (pixels already dithered)
      for (let blockY = 0; blockY < 96; blockY++) {
        for (let blockX = 0; blockX < 32; blockX++) {
          const block = analyzeBlock2Mono(floatPixels, blockX, blockY, 256, monoColors.inkRgb, monoColors.paperRgb);

          for (let line = 0; line < 2; line++) {
            const y = blockY * 2 + line;
            const offset = getBitmapOffset(y) + blockX;
            ifl[offset] = block.bitmap[line];
          }

          const attrOffset = 6144 + blockY * 32 + blockX;
          ifl[attrOffset] = (7 << 3) | 0 | 0x40;
        }
      }
    } else {
      // Standard cell-aware dithering
      for (let blockY = 0; blockY < 96; blockY++) {
        for (let blockX = 0; blockX < 32; blockX++) {
          const colors = monoColors || findBlockColors2(floatPixels, blockX, blockY, 256, palette);

          let bitmap;
          switch (cellDitherMethod) {
            case 'floyd':
              bitmap = ditherBlock2FloydSteinberg(floatPixels, blockX, blockY, 256, colors.inkRgb, colors.paperRgb);
              break;
            case 'ordered':
              bitmap = ditherBlock2Ordered(floatPixels, blockX, blockY, 256, colors.inkRgb, colors.paperRgb);
              break;
            default:
              bitmap = ditherBlock2None(floatPixels, blockX, blockY, 256, colors.inkRgb, colors.paperRgb);
              break;
          }

          for (let line = 0; line < 2; line++) {
            const y = blockY * 2 + line;
            const offset = getBitmapOffset(y) + blockX;
            ifl[offset] = bitmap[line];
          }

          const attrOffset = 6144 + blockY * 32 + blockX;
          let attr = (colors.paper << 3) | colors.ink;
          if (colors.bright) attr |= 0x40;
          ifl[attrOffset] = attr;
        }
      }
    }
  } else {
    // Global dithering
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
    }

    // Process 96 attribute rows (8×2 blocks)
    for (let blockY = 0; blockY < 96; blockY++) {
      for (let blockX = 0; blockX < 32; blockX++) {
        const block = monoOutput
          ? analyzeBlock2Mono(floatPixels, blockX, blockY, 256, palette.bright[0], palette.bright[7])
          : analyzeBlock2(floatPixels, blockX, blockY, 256);

        // Write 2 bitmap bytes
        for (let line = 0; line < 2; line++) {
          const y = blockY * 2 + line;
          const offset = getBitmapOffset(y) + blockX;
          ifl[offset] = block.bitmap[line];
        }

        // Write attribute byte
        const attrOffset = 6144 + blockY * 32 + blockX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((block.paper << 3) | block.ink | (block.bright ? 0x40 : 0));
        ifl[attrOffset] = attr;
      }
    }
  }

  return ifl;
}

// ============================================================================
// MLT FORMAT CONVERSION (8×1 multicolor blocks - per pixel line)
// ============================================================================

/**
 * Find best ink/paper combination for an 8×1 block (single pixel row)
 */
function findBlockColors1(pixels, blockX, y, width, palette) {
  // Collect 8 pixel colors from 8×1 block
  const blockColors = [];
  for (let dx = 0; dx < 8; dx++) {
    const px = blockX * 8 + dx;
    const idx = (y * width + px) * 3;
    blockColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
  }

  let bestError = Infinity;
  let bestInk = 0;
  let bestPaper = 7;
  let bestBright = false;

  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;

        for (let i = 0; i < 8; i++) {
          const color = blockColors[i];
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
 * Analyze an 8×1 block and return best colors and bitmap byte
 */
function analyzeBlock1(pixels, blockX, y, width) {
  const palette = getCombinedPalette();

  const blockColors = [];
  for (let dx = 0; dx < 8; dx++) {
    const px = blockX * 8 + dx;
    const idx = (y * width + px) * 3;
    blockColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
  }

  let bestError = Infinity;
  let bestInk = 0;
  let bestPaper = 7;
  let bestBright = false;
  let bestBitmap = 0;

  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;
        let bitmap = 0;

        for (let dx = 0; dx < 8; dx++) {
          const color = blockColors[dx];
          const inkDist = colorDistance(color, pal[ink]);
          const paperDist = colorDistance(color, pal[paper]);

          if (inkDist < paperDist) {
            totalError += inkDist;
            bitmap |= (0x80 >> dx);
          } else {
            totalError += paperDist;
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
 * Analyze an 8×1 block for mono output using distance to ink/paper colors
 */
function analyzeBlock1Mono(pixels, blockX, y, width, inkRgb, paperRgb) {
  let bitmap = 0;

  for (let dx = 0; dx < 8; dx++) {
    const px = blockX * 8 + dx;
    const idx = (y * width + px) * 3;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];

    // Compare distance to ink and paper colors
    const inkDist = (r - inkRgb[0]) ** 2 + (g - inkRgb[1]) ** 2 + (b - inkRgb[2]) ** 2;
    const paperDist = (r - paperRgb[0]) ** 2 + (g - paperRgb[1]) ** 2 + (b - paperRgb[2]) ** 2;

    if (inkDist < paperDist) {
      bitmap |= (0x80 >> dx);
    }
  }

  return {
    ink: 0,
    paper: 7,
    bright: true,
    bitmap: bitmap
  };
}

/**
 * No dithering for 8×1 block - nearest color only (returns single byte)
 */
function ditherBlock1None(pixels, blockX, y, width, inkRgb, paperRgb) {
  let bitmap = 0;

  for (let dx = 0; dx < 8; dx++) {
    const px = blockX * 8 + dx;
    const idx = (y * width + px) * 3;

    const inkDist = colorDistance([pixels[idx], pixels[idx + 1], pixels[idx + 2]], inkRgb);
    const paperDist = colorDistance([pixels[idx], pixels[idx + 1], pixels[idx + 2]], paperRgb);

    if (inkDist < paperDist) {
      bitmap |= (0x80 >> dx);
    }
  }

  return bitmap;
}

/**
 * Ordered dithering for 8×1 block
 */
function ditherBlock1Ordered(pixels, blockX, y, width, inkRgb, paperRgb) {
  let bitmap = 0;

  for (let dx = 0; dx < 8; dx++) {
    const globalX = blockX * 8 + dx;
    const idx = (y * width + globalX) * 3;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];

    const inkDist = colorDistance([r, g, b], inkRgb);
    const paperDist = colorDistance([r, g, b], paperRgb);
    const totalDist = inkDist + paperDist;
    const inkRatio = totalDist > 0 ? paperDist / totalDist : 0.5;

    // Use Bayer 4x4 with GLOBAL coordinates for seamless pattern
    const t = (BAYER_4X4[y % 4][globalX % 4] + 0.5) / 16;
    if (inkRatio > t) {
      bitmap |= (0x80 >> dx);
    }
  }

  return bitmap;
}

/**
 * Convert image to MLT format (8×1 multicolor blocks - per pixel line)
 */
function convertToMlt(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply image adjustments (same as SCR)
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
  if (smoothing > 0) applyBilateralFilter(pixels, 256, 192, smoothing);
  if (sharpness > 0) applySharpening(pixels, 256, 192, sharpness);

  // For mono output, convert to grayscale before dithering
  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  // Convert to float array for processing
  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  // Create MLT buffer: 6144 bitmap + 6144 attributes = 12288 bytes
  const mlt = new Uint8Array(12288);

  const isCellAware = dithering.startsWith('cell-');

  if (isCellAware) {
    const cellDitherMethod = dithering.replace('cell-', '');
    const monoColors = monoOutput ? {
      ink: 0, paper: 7, bright: true,
      inkRgb: palette.bright[0], paperRgb: palette.bright[7]
    } : null;

    // Process 192 attribute rows (8×1 blocks - one per pixel line)
    for (let y = 0; y < 192; y++) {
      for (let blockX = 0; blockX < 32; blockX++) {
        const colors = monoColors || findBlockColors1(floatPixels, blockX, y, 256, palette);

        let bitmap;
        switch (cellDitherMethod) {
          case 'ordered':
            bitmap = ditherBlock1Ordered(floatPixels, blockX, y, 256, colors.inkRgb, colors.paperRgb);
            break;
          default:
            bitmap = ditherBlock1None(floatPixels, blockX, y, 256, colors.inkRgb, colors.paperRgb);
            break;
        }

        // Write bitmap byte
        const bitmapOffset = getBitmapOffset(y) + blockX;
        mlt[bitmapOffset] = bitmap;

        // Write attribute byte
        const attrOffset = 6144 + y * 32 + blockX;
        let attr = (colors.paper << 3) | colors.ink;
        if (colors.bright) attr |= 0x40;
        mlt[attrOffset] = attr;
      }
    }
  } else {
    // Global dithering
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
    }

    // Process 192 attribute rows (8×1 blocks)
    for (let y = 0; y < 192; y++) {
      for (let blockX = 0; blockX < 32; blockX++) {
        const block = monoOutput
          ? analyzeBlock1Mono(floatPixels, blockX, y, 256, palette.bright[0], palette.bright[7])
          : analyzeBlock1(floatPixels, blockX, y, 256);

        // Write bitmap byte
        const bitmapOffset = getBitmapOffset(y) + blockX;
        mlt[bitmapOffset] = block.bitmap;

        // Write attribute byte
        const attrOffset = 6144 + y * 32 + blockX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((block.paper << 3) | block.ink | (block.bright ? 0x40 : 0));
        mlt[attrOffset] = attr;
      }
    }
  }

  return mlt;
}

// ============================================================================
// BMC4 FORMAT CONVERSION (8×4 multicolor blocks with border)
// ============================================================================

/**
 * Find best ink/paper combination for an 8×4 block
 */
function findBlockColors4(pixels, blockX, blockY, width, palette) {
  // Collect all 32 pixel colors from 8×4 block
  const blockColors = [];
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 4 + dy;
      const idx = (py * width + px) * 3;
      blockColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  let bestError = Infinity;
  let bestInk = 0;
  let bestPaper = 7;
  let bestBright = false;

  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;

        for (let i = 0; i < 32; i++) {
          const color = blockColors[i];
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
 * Analyze an 8×4 block and return best colors and bitmap
 */
function analyzeBlock4(pixels, blockX, blockY, width) {
  const palette = getCombinedPalette();

  const blockColors = [];
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 4 + dy;
      const idx = (py * width + px) * 3;
      blockColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  let bestError = Infinity;
  let bestInk = 0;
  let bestPaper = 7;
  let bestBright = false;
  let bestBitmap = new Uint8Array(4);

  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;

    for (let ink = 0; ink < 8; ink++) {
      for (let paper = 0; paper < 8; paper++) {
        let totalError = 0;
        const bitmap = new Uint8Array(4);

        for (let i = 0; i < 32; i++) {
          const color = blockColors[i];
          const inkDist = colorDistance(color, pal[ink]);
          const paperDist = colorDistance(color, pal[paper]);

          const dy = Math.floor(i / 8);
          const dx = i % 8;

          if (inkDist < paperDist) {
            totalError += inkDist;
            bitmap[dy] |= (0x80 >> dx);
          } else {
            totalError += paperDist;
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
 * Analyze an 8×4 block for mono output using distance to ink/paper colors
 */
function analyzeBlock4Mono(pixels, blockX, blockY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(4);

  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 4 + dy;
      const idx = (py * width + px) * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // Compare distance to ink and paper colors
      const inkDist = (r - inkRgb[0]) ** 2 + (g - inkRgb[1]) ** 2 + (b - inkRgb[2]) ** 2;
      const paperDist = (r - paperRgb[0]) ** 2 + (g - paperRgb[1]) ** 2 + (b - paperRgb[2]) ** 2;

      if (inkDist < paperDist) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return {
    ink: 0,
    paper: 7,
    bright: true,
    bitmap: bitmap
  };
}

/**
 * No dithering for 8×4 block
 */
function ditherBlock4None(pixels, blockX, blockY, width, inkRgb, paperRgb) {
  const bitmap = new Uint8Array(4);

  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const px = blockX * 8 + dx;
      const py = blockY * 4 + dy;
      const idx = (py * width + px) * 3;

      const inkDist = colorDistance([pixels[idx], pixels[idx + 1], pixels[idx + 2]], inkRgb);
      const paperDist = colorDistance([pixels[idx], pixels[idx + 1], pixels[idx + 2]], paperRgb);

      if (inkDist < paperDist) {
        bitmap[dy] |= (0x80 >> dx);
      }
    }
  }

  return bitmap;
}

/**
 * Convert image to BMC4 format (8×4 multicolor blocks with border)
 * Note: Border is filled with black (0) - full border support would require BSC-style border sampling
 */
function convertToBmc4(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply image adjustments
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
  if (smoothing > 0) applyBilateralFilter(pixels, 256, 192, smoothing);
  if (sharpness > 0) applySharpening(pixels, 256, 192, sharpness);

  // For mono output, convert to grayscale before dithering
  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  // BMC4: 6144 bitmap + 768 attr1 + 768 attr2 + 4224 border = 11904 bytes
  const bmc4 = new Uint8Array(11904);

  const isCellAware = dithering.startsWith('cell-');

  if (!isCellAware) {
    // Apply global dithering first
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
  }

  // Process 48 attribute blocks (8×4 each, 24 char rows × 2 blocks per char)
  for (let blockY = 0; blockY < 48; blockY++) {
    for (let blockX = 0; blockX < 32; blockX++) {
      let colors, bitmap;

      if (isCellAware) {
        const cellDitherMethod = dithering.replace('cell-', '');
        colors = monoOutput ? {
          ink: 0, paper: 7, bright: true,
          inkRgb: palette.bright[0], paperRgb: palette.bright[7]
        } : findBlockColors4(floatPixels, blockX, blockY, 256, palette);
        bitmap = ditherBlock4None(floatPixels, blockX, blockY, 256, colors.inkRgb, colors.paperRgb);
      } else {
        const block = monoOutput
          ? analyzeBlock4Mono(floatPixels, blockX, blockY, 256, palette.bright[0], palette.bright[7])
          : analyzeBlock4(floatPixels, blockX, blockY, 256);
        colors = block;
        bitmap = block.bitmap;
      }

      // Write 4 bitmap bytes
      for (let line = 0; line < 4; line++) {
        const y = blockY * 4 + line;
        const offset = getBitmapOffset(y) + blockX;
        bmc4[offset] = bitmap[line];
      }

      // Write attribute byte to appropriate bank
      // attr1 (6144-6911) for top 4 lines, attr2 (6912-7679) for bottom 4 lines of each char cell
      const charRow = Math.floor(blockY / 2);
      const isTopHalf = (blockY % 2) === 0;
      const attrOffset = isTopHalf ? (6144 + charRow * 32 + blockX) : (6912 + charRow * 32 + blockX);
      let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((colors.paper << 3) | colors.ink | (colors.bright ? 0x40 : 0));
      bmc4[attrOffset] = attr;
    }
  }

  // Border data (7680-11903) is left as zeros (black)

  return bmc4;
}

// ============================================================================
// MONOCHROME FORMAT CONVERSION (bitmap only, no attributes)
// ============================================================================

/**
 * Convert image to monochrome format (bitmap only)
 * @param {number} thirds - Number of screen thirds (1, 2, or 3)
 */
function convertToMono(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, thirds = 3) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const height = thirds * 64;
  const imageData = ctx.getImageData(0, 0, 256, height);
  const pixels = imageData.data;

  // Apply image adjustments
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
  if (smoothing > 0) applyBilateralFilter(pixels, 256, height, smoothing);
  if (sharpness > 0) applySharpening(pixels, 256, height, sharpness);

  // For mono format, convert to grayscale before dithering (if not already done)
  // This ensures dithering works on luminance values, not colors
  if (!grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = new Float32Array(256 * height * 3);
  for (let i = 0; i < 256 * height; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  const palette = getCombinedPalette();
  // Monochrome uses only black and white
  const monoPalette = [palette.bright[0], palette.bright[7]];

  // Apply dithering
  switch (dithering) {
    case 'floyd-steinberg': floydSteinbergDither(floatPixels, 256, height, monoPalette); break;
    case 'jarvis': jarvisDither(floatPixels, 256, height, monoPalette); break;
    case 'stucki': stuckiDither(floatPixels, 256, height, monoPalette); break;
    case 'burkes': burkesDither(floatPixels, 256, height, monoPalette); break;
    case 'sierra': sierraDither(floatPixels, 256, height, monoPalette); break;
    case 'sierra-lite': sierraLiteDither(floatPixels, 256, height, monoPalette); break;
    case 'sierra2': sierra2Dither(floatPixels, 256, height, monoPalette); break;
    case 'serpentine': serpentineDither(floatPixels, 256, height, monoPalette); break;
    case 'riemersma': riemersmaDither(floatPixels, 256, height, monoPalette); break;
    case 'blue-noise': blueNoiseDither(floatPixels, 256, height, monoPalette); break;
    case 'pattern': patternDither(floatPixels, 256, height, monoPalette); break;
    case 'atkinson': atkinsonDither(floatPixels, 256, height, monoPalette); break;
    case 'ordered': orderedDither(floatPixels, 256, height, monoPalette); break;
    case 'ordered8': ordered8Dither(floatPixels, 256, height, monoPalette); break;
    case 'noise': noiseDither(floatPixels, 256, height, monoPalette); break;
  }

  // Create output buffer
  const bufferSize = thirds * 2048;
  const mono = new Uint8Array(bufferSize);

  // Get ink and paper colors for distance comparison
  const inkRgb = monoPalette[0];    // black
  const paperRgb = monoPalette[1];  // white

  // Process bitmap - determine if each pixel is ink (black) or paper (white)
  for (let y = 0; y < height; y++) {
    const bitmapOffset = getBitmapOffset(y);

    for (let col = 0; col < 32; col++) {
      let byte = 0;

      for (let bit = 0; bit < 8; bit++) {
        const x = col * 8 + bit;
        const idx = (y * 256 + x) * 3;
        const r = floatPixels[idx];
        const g = floatPixels[idx + 1];
        const b = floatPixels[idx + 2];

        // Compare distance to ink and paper colors
        const inkDist = (r - inkRgb[0]) ** 2 + (g - inkRgb[1]) ** 2 + (b - inkRgb[2]) ** 2;
        const paperDist = (r - paperRgb[0]) ** 2 + (g - paperRgb[1]) ** 2 + (b - paperRgb[2]) ** 2;

        // If closer to ink (black), set bit
        if (inkDist < paperDist) {
          byte |= (0x80 >> bit);
        }
      }

      mono[bitmapOffset + col] = byte;
    }
  }

  return mono;
}

// RGB3 format constants
const RGB3_CONST = {
  TOTAL_SIZE: 18432,
  BITMAP_SIZE: 6144,
  RED_OFFSET: 0,
  GREEN_OFFSET: 6144,
  BLUE_OFFSET: 12288
};

/**
 * Convert image to RGB3 format (tricolor RGB)
 * Three separate bitmaps for R, G, B channels
 * Each pixel can be one of 8 colors (RGB combinations)
 * @returns {Uint8Array} 18432-byte RGB3 data
 */
function convertToRgb3(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply image adjustments
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
  if (smoothing > 0) applyBilateralFilter(pixels, 256, 192, smoothing);
  if (sharpness > 0) applySharpening(pixels, 256, 192, sharpness);

  const floatPixels = new Float32Array(256 * 192 * 3);
  for (let i = 0; i < 256 * 192; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }

  // RGB3 uses 8 pure RGB colors (no bright variants)
  // Index 0=Black, 1=Blue, 2=Red, 3=Magenta, 4=Green, 5=Cyan, 6=Yellow, 7=White
  const rgb3Palette = [
    [0, 0, 0],       // 0: Black (000)
    [0, 0, 255],     // 1: Blue (001)
    [255, 0, 0],     // 2: Red (010) - note: ZX uses GRB order, bit1=red
    [255, 0, 255],   // 3: Magenta (011)
    [0, 255, 0],     // 4: Green (100) - note: bit2=green
    [0, 255, 255],   // 5: Cyan (101)
    [255, 255, 0],   // 6: Yellow (110)
    [255, 255, 255]  // 7: White (111)
  ];

  // Apply dithering with RGB3 palette
  switch (dithering) {
    case 'floyd-steinberg': floydSteinbergDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'jarvis': jarvisDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'stucki': stuckiDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'burkes': burkesDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'sierra': sierraDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'sierra-lite': sierraLiteDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'sierra2': sierra2Dither(floatPixels, 256, 192, rgb3Palette); break;
    case 'serpentine': serpentineDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'riemersma': riemersmaDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'blue-noise': blueNoiseDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'pattern': patternDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'atkinson': atkinsonDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'ordered': orderedDither(floatPixels, 256, 192, rgb3Palette); break;
    case 'ordered8': ordered8Dither(floatPixels, 256, 192, rgb3Palette); break;
    case 'noise': noiseDither(floatPixels, 256, 192, rgb3Palette); break;
  }

  // Create output buffer (3 × 6144 bytes)
  const rgb3 = new Uint8Array(RGB3_CONST.TOTAL_SIZE);

  // Process each pixel and set bits in R, G, B bitmaps
  for (let y = 0; y < 192; y++) {
    const bitmapOffset = getBitmapOffset(y);

    for (let col = 0; col < 32; col++) {
      let redByte = 0;
      let greenByte = 0;
      let blueByte = 0;

      for (let bit = 0; bit < 8; bit++) {
        const x = col * 8 + bit;
        const idx = (y * 256 + x) * 3;
        const r = floatPixels[idx];
        const g = floatPixels[idx + 1];
        const b = floatPixels[idx + 2];

        // Find nearest color from RGB3 palette
        let minDist = Infinity;
        let nearestIdx = 0;
        for (let i = 0; i < 8; i++) {
          const dist = colorDistance([r, g, b], rgb3Palette[i]);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }

        // Set bits based on color index
        // ZX color bits: bit0=Blue, bit1=Red, bit2=Green
        if (nearestIdx & 1) blueByte |= (0x80 >> bit);   // Blue
        if (nearestIdx & 2) redByte |= (0x80 >> bit);    // Red
        if (nearestIdx & 4) greenByte |= (0x80 >> bit);  // Green
      }

      rgb3[RGB3_CONST.RED_OFFSET + bitmapOffset + col] = redByte;
      rgb3[RGB3_CONST.GREEN_OFFSET + bitmapOffset + col] = greenByte;
      rgb3[RGB3_CONST.BLUE_OFFSET + bitmapOffset + col] = blueByte;
    }
  }

  return rgb3;
}

/**
 * Render RGB3 data to canvas for preview
 * @param {Uint8Array} rgb3Data - RGB3 screen data
 * @param {HTMLCanvasElement} canvas - Target canvas
 */
function renderRgb3ToCanvas(rgb3Data, canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256;
  canvas.height = 192;

  const imageData = ctx.createImageData(256, 192);
  const data = imageData.data;

  for (let y = 0; y < 192; y++) {
    const bitmapOffset = getBitmapOffset(y);

    for (let col = 0; col < 32; col++) {
      const redByte = rgb3Data[RGB3_CONST.RED_OFFSET + bitmapOffset + col];
      const greenByte = rgb3Data[RGB3_CONST.GREEN_OFFSET + bitmapOffset + col];
      const blueByte = rgb3Data[RGB3_CONST.BLUE_OFFSET + bitmapOffset + col];

      for (let bit = 0; bit < 8; bit++) {
        const x = col * 8 + bit;
        const r = (redByte & (0x80 >> bit)) ? 255 : 0;
        const g = (greenByte & (0x80 >> bit)) ? 255 : 0;
        const b = (blueByte & (0x80 >> bit)) ? 255 : 0;

        const pixelIndex = (y * 256 + x) * 4;
        data[pixelIndex] = r;
        data[pixelIndex + 1] = g;
        data[pixelIndex + 2] = b;
        data[pixelIndex + 3] = 255;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
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
 * Convert image to 53c format (attributes only, 768 bytes)
 * Analyzes each 8x8 cell using the specified pattern to separate ink/paper pixels
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (256x192)
 * @param {number} brightness - Brightness adjustment
 * @param {number} contrast - Contrast adjustment
 * @param {number} saturation - Saturation adjustment
 * @param {number} gamma - Gamma correction
 * @param {boolean} grayscale - Convert to grayscale
 * @param {number} sharpness - Sharpening amount
 * @param {number} smoothing - Smoothing amount
 * @param {number} blackPoint - Levels black point
 * @param {number} whitePoint - Levels white point
 * @param {number} balanceR - Red channel adjustment
 * @param {number} balanceG - Green channel adjustment
 * @param {number} balanceB - Blue channel adjustment
 * @param {string} pattern - Pattern type: 'checker', 'stripes', or 'dd77'
 * @returns {Uint8Array} 768-byte attribute data
 */
function convertTo53c(sourceCanvas, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, pattern = 'checker') {
  // Cache color distance mode setting once at start
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  // Apply adjustments
  if (grayscale) {
    applyGrayscale(pixels);
  }
  if (smoothing > 0) {
    applySmoothing(pixels, 256, 192, smoothing);
  }
  if (sharpness > 0) {
    applySharpening(pixels, 256, 192, sharpness);
  }
  if (contrast !== 0 || brightness !== 0) {
    applyBrightnessContrast(pixels, brightness, contrast);
  }
  if (saturation !== 0) {
    applySaturation(pixels, saturation);
  }
  if (gamma !== 1.0) {
    applyGamma(pixels, gamma);
  }
  if (blackPoint !== 0 || whitePoint !== 255) {
    applyLevels(pixels, blackPoint, whitePoint);
  }
  if (balanceR !== 0 || balanceG !== 0 || balanceB !== 0) {
    applyColorBalance(pixels, balanceR, balanceG, balanceB);
  }

  // Get pattern array from APP_CONFIG
  let patternArray;
  if (pattern === 'stripes') {
    patternArray = APP_CONFIG.PATTERN_53C_STRIPES;
  } else if (pattern === 'dd77') {
    patternArray = APP_CONFIG.PATTERN_53C_DD77;
  } else {
    patternArray = APP_CONFIG.PATTERN_53C_CHECKER;
  }

  // Create attribute data (768 bytes = 32 cols x 24 rows)
  const attrData = new Uint8Array(768);

  // Get combined palette once for all cells (matches rendering palette)
  const combinedPalette = getCombinedPalette();

  // Process each 8x8 character cell
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 32; col++) {
      const cellX = col * 8;
      const cellY = row * 8;

      // Collect ink and paper pixels based on pattern
      let inkR = 0, inkG = 0, inkB = 0, inkCount = 0;
      let paperR = 0, paperG = 0, paperB = 0, paperCount = 0;

      for (let py = 0; py < 8; py++) {
        const patternByte = patternArray[py];
        for (let px = 0; px < 8; px++) {
          const bit = 7 - px; // MSB first
          const isInk = (patternByte & (1 << bit)) !== 0;

          const pixelIdx = ((cellY + py) * 256 + (cellX + px)) * 4;
          const r = pixels[pixelIdx];
          const g = pixels[pixelIdx + 1];
          const b = pixels[pixelIdx + 2];

          if (isInk) {
            inkR += r;
            inkG += g;
            inkB += b;
            inkCount++;
          } else {
            paperR += r;
            paperG += g;
            paperB += b;
            paperCount++;
          }
        }
      }

      // Calculate average colors
      const avgInk = inkCount > 0 ? [inkR / inkCount, inkG / inkCount, inkB / inkCount] : [0, 0, 0];
      const avgPaper = paperCount > 0 ? [paperR / paperCount, paperG / paperCount, paperB / paperCount] : [255, 255, 255];

      // Find best matching ZX colors
      // Try both regular and bright palettes, pick best overall match
      let bestInkIdx = 0, bestPaperIdx = 0, bestBright = 0;
      let bestTotalDist = Infinity;

      for (let bright = 0; bright <= 1; bright++) {
        const palette = bright ? combinedPalette.bright : combinedPalette.regular;

        for (let inkIdx = 0; inkIdx < 8; inkIdx++) {
          const inkDist = colorDistance(avgInk, palette[inkIdx]);

          for (let paperIdx = 0; paperIdx < 8; paperIdx++) {
            const paperDist = colorDistance(avgPaper, palette[paperIdx]);
            const totalDist = inkDist + paperDist;

            if (totalDist < bestTotalDist) {
              bestTotalDist = totalDist;
              bestInkIdx = inkIdx;
              bestPaperIdx = paperIdx;
              bestBright = bright;
            }
          }
        }
      }

      // Build attribute byte: flash(0) | bright | paper(3) | ink(3)
      const attr = (bestBright << 6) | (bestPaperIdx << 3) | bestInkIdx;
      attrData[row * 32 + col] = attr;
    }
  }

  return attrData;
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

/**
 * Render ULA+ data to a canvas (64-color palette)
 * @param {Uint8Array} ulaPlusData - ULA+ data (6912 SCR + 64 palette)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom factor
 */
function renderUlaPlusToCanvas(ulaPlusData, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;

  const imageData = ctx.createImageData(256, 192);
  const pixels = imageData.data;

  // Extract palette from data
  const palette = ulaPlusData.slice(ULAPLUS.PALETTE_OFFSET, ULAPLUS.PALETTE_OFFSET + 64);

  for (let y = 0; y < 192; y++) {
    const bitmapOffset = getBitmapOffset(y);

    for (let x = 0; x < 256; x++) {
      const cellX = Math.floor(x / 8);
      const cellY = Math.floor(y / 8);
      const bitPos = x % 8;

      const byte = ulaPlusData[bitmapOffset + cellX];
      const attrOffset = 6144 + cellY * 32 + cellX;
      const attr = ulaPlusData[attrOffset];

      // ULA+ attribute: ink (0-7), paper (0-7), CLUT from FLASH+BRIGHT
      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr >> 6) & 1;
      const flash = (attr >> 7) & 1;
      const clut = (flash << 1) | bright;

      const isInk = (byte & (0x80 >> bitPos)) !== 0;
      const colorIdx = clut * 16 + (isInk ? ink : (8 + paper));
      const grb = palette[colorIdx];
      const color = grb332ToRgb(grb);

      const idx = (y * 256 + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  // Draw at 1x then scale up
  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

/**
 * Render IFL data to a canvas (8×2 multicolor attributes)
 */
function renderIflToCanvas(iflData, canvas, zoom = 2) {
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
      const attrRow = Math.floor(y / 2);  // 96 attribute rows for IFL
      const bitPos = x % 8;

      const byte = iflData[bitmapOffset + cellX];
      const attrOffset = 6144 + attrRow * 32 + cellX;
      const attr = iflData[attrOffset];

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

  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

/**
 * Render MLT data to a canvas (8×1 multicolor attributes - per pixel line)
 */
function renderMltToCanvas(mltData, canvas, zoom = 2) {
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
      const bitPos = x % 8;

      const byte = mltData[bitmapOffset + cellX];
      const attrOffset = 6144 + y * 32 + cellX;  // One attr row per pixel line for MLT
      const attr = mltData[attrOffset];

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

  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

/**
 * Render BMC4 data to a canvas (8×4 multicolor attributes)
 * Note: Only renders the main 256x192 area, not border
 */
function renderBmc4ToCanvas(bmc4Data, canvas, zoom = 2) {
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
      const charRow = Math.floor(y / 8);
      const pixelLine = y % 8;
      const bitPos = x % 8;

      const byte = bmc4Data[bitmapOffset + cellX];
      // attr1 (6144-6911) for lines 0-3, attr2 (6912-7679) for lines 4-7
      const attrOffset = (pixelLine < 4) ? (6144 + charRow * 32 + cellX) : (6912 + charRow * 32 + cellX);
      const attr = bmc4Data[attrOffset];

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

  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

/**
 * Render 53c attribute data to a canvas using pattern from APP_CONFIG
 * @param {Uint8Array} attrData - 768 bytes of attribute data
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom level
 * @param {string} pattern - Pattern type: 'checker', 'stripes', or 'dd77'
 */
function render53cToCanvas(attrData, canvas, zoom = 2, pattern = 'checker') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;

  const imageData = ctx.createImageData(256, 192);
  const pixels = imageData.data;
  const palette = getCombinedPalette();

  // Get pattern array from APP_CONFIG
  let patternArray;
  if (pattern === 'stripes') {
    patternArray = APP_CONFIG.PATTERN_53C_STRIPES;
  } else if (pattern === 'dd77') {
    patternArray = APP_CONFIG.PATTERN_53C_DD77;
  } else {
    patternArray = APP_CONFIG.PATTERN_53C_CHECKER;
  }

  // Render each 8x8 cell
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 32; col++) {
      const attr = attrData[row * 32 + col];
      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr & 0x40) !== 0;

      const pal = bright ? palette.bright : palette.regular;
      const inkColor = pal[ink];
      const paperColor = pal[paper];

      const cellX = col * 8;
      const cellY = row * 8;

      for (let py = 0; py < 8; py++) {
        const patternByte = patternArray[py];
        for (let px = 0; px < 8; px++) {
          const bit = 7 - px; // MSB first
          const isInk = (patternByte & (1 << bit)) !== 0;
          const color = isInk ? inkColor : paperColor;

          const idx = ((cellY + py) * 256 + (cellX + px)) * 4;
          pixels[idx] = color[0];
          pixels[idx + 1] = color[1];
          pixels[idx + 2] = color[2];
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

/**
 * Render monochrome data to a canvas (bitmap only)
 */
function renderMonoToCanvas(monoData, canvas, zoom = 2, thirds = 3) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const height = thirds * 64;
  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;  // Always 192 for display

  const imageData = ctx.createImageData(256, 192);
  const pixels = imageData.data;
  const palette = getCombinedPalette();
  const ink = palette.bright[0];   // Black
  const paper = palette.bright[7]; // White

  // Fill with paper first
  for (let i = 0; i < 256 * 192 * 4; i += 4) {
    pixels[i] = paper[0];
    pixels[i + 1] = paper[1];
    pixels[i + 2] = paper[2];
    pixels[i + 3] = 255;
  }

  // Render the bitmap data
  for (let y = 0; y < height; y++) {
    const bitmapOffset = getBitmapOffset(y);

    for (let x = 0; x < 256; x++) {
      const cellX = Math.floor(x / 8);
      const bitPos = x % 8;

      const byte = monoData[bitmapOffset + cellX];
      const isInk = (byte & (0x80 >> bitPos)) !== 0;
      const color = isInk ? ink : paper;

      const idx = (y * 256 + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

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

/** @type {{x: number, y: number}} - Output offset (where imported image is placed) */
let importOffset = { x: 0, y: 0 };

/** @type {{w: number, h: number}} - Output size (dimensions of imported image area) */
let importSize = { w: 256, h: 192 };

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
  /** @type {HTMLSelectElement|null} */ pattern53c: null,
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
  /** @type {HTMLInputElement|null} */ showGrid: null,
  // Offset inputs
  /** @type {HTMLInputElement|null} */ offsetX: null,
  /** @type {HTMLInputElement|null} */ offsetY: null,
  // Size inputs
  /** @type {HTMLInputElement|null} */ sizeW: null,
  /** @type {HTMLInputElement|null} */ sizeH: null,
  /** @type {HTMLInputElement|null} */ lockAspect: null,
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

  // Disable image smoothing to preserve pixel-perfect patterns (important for 53c)
  ctx.imageSmoothingEnabled = false;

  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 192);

  const srcX = importCrop.x;
  const srcY = importCrop.y;
  const srcW = importCrop.w;
  const srcH = importCrop.h;

  // Use user-specified size (clamped to available area after offset)
  const availW = Math.min(importSize.w, 256 - importOffset.x);
  const availH = Math.min(importSize.h, 192 - importOffset.y);

  // Calculate destination based on fit mode (fit within available area)
  let destX = importOffset.x, destY = importOffset.y, destW = availW, destH = availH;
  const srcAspect = srcW / srcH;

  if (importFitMode === 'stretch') {
    // Stretch source region to fill available area
    destX = importOffset.x; destY = importOffset.y; destW = availW; destH = availH;
  } else if (importFitMode === 'fit') {
    // Fit source region inside available area, maintaining aspect ratio (letterbox)
    const destAspect = availW / availH;
    if (srcAspect > destAspect) {
      // Source is wider - fit to width
      destW = availW;
      destH = availW / srcAspect;
      destX = importOffset.x;
      destY = importOffset.y + (availH - destH) / 2;
    } else {
      // Source is taller - fit to height
      destH = availH;
      destW = availH * srcAspect;
      destX = importOffset.x + (availW - destW) / 2;
      destY = importOffset.y;
    }
  } else if (importFitMode === 'fill') {
    // Fill available area with source region, cropping excess (center crop)
    const destAspect = availW / availH;
    if (srcAspect > destAspect) {
      // Source is wider - fit to height, crop sides
      destH = availH;
      destW = availH * srcAspect;
      destX = importOffset.x + (availW - destW) / 2;
      destY = importOffset.y;
    } else {
      // Source is taller - fit to width, crop top/bottom
      destW = availW;
      destH = availW / srcAspect;
      destX = importOffset.x;
      destY = importOffset.y + (availH - destH) / 2;
    }
  } else if (importFitMode === 'fit-width') {
    // Scale to fit width, clamp height to available area
    destW = availW;
    destH = availW / srcAspect;
    if (destH > availH) {
      destH = availH;
      destW = availH * srcAspect;
    }
    destX = importOffset.x + (availW - destW) / 2;
    destY = importOffset.y + (availH - destH) / 2;
  } else if (importFitMode === 'fit-height') {
    // Scale to fit height, clamp width to available area
    destH = availH;
    destW = availH * srcAspect;
    if (destW > availW) {
      destW = availW;
      destH = availW / srcAspect;
    }
    destX = importOffset.x + (availW - destW) / 2;
    destY = importOffset.y + (availH - destH) / 2;
  }

  ctx.drawImage(importImage, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

  // Also fill BSC canvas (384x304)
  if (importSourceCanvasBsc) {
    const ctxBsc = importSourceCanvasBsc.getContext('2d');
    if (ctxBsc) {
      ctxBsc.imageSmoothingEnabled = false;
      ctxBsc.fillStyle = '#000';
      ctxBsc.fillRect(0, 0, 384, 304);

      // Scale offset and size for BSC dimensions (384x304 vs 256x192)
      const bscOffsetX = Math.round(importOffset.x * 384 / 256);
      const bscOffsetY = Math.round(importOffset.y * 304 / 192);
      const bscSizeW = Math.round(importSize.w * 384 / 256);
      const bscSizeH = Math.round(importSize.h * 304 / 192);
      const bscAvailW = Math.min(bscSizeW, 384 - bscOffsetX);
      const bscAvailH = Math.min(bscSizeH, 304 - bscOffsetY);

      // Calculate destination for BSC (384x304 with aspect ratio handling)
      let destXBsc = bscOffsetX, destYBsc = bscOffsetY, destWBsc = bscAvailW, destHBsc = bscAvailH;
      const bscAspect = bscAvailW / bscAvailH;

      if (importFitMode === 'stretch') {
        destXBsc = bscOffsetX; destYBsc = bscOffsetY; destWBsc = bscAvailW; destHBsc = bscAvailH;
      } else if (importFitMode === 'fit') {
        if (srcAspect > bscAspect) {
          destWBsc = bscAvailW;
          destHBsc = bscAvailW / srcAspect;
          destXBsc = bscOffsetX;
          destYBsc = bscOffsetY + (bscAvailH - destHBsc) / 2;
        } else {
          destHBsc = bscAvailH;
          destWBsc = bscAvailH * srcAspect;
          destXBsc = bscOffsetX + (bscAvailW - destWBsc) / 2;
          destYBsc = bscOffsetY;
        }
      } else if (importFitMode === 'fill') {
        if (srcAspect > bscAspect) {
          destHBsc = bscAvailH;
          destWBsc = bscAvailH * srcAspect;
          destXBsc = bscOffsetX + (bscAvailW - destWBsc) / 2;
          destYBsc = bscOffsetY;
        } else {
          destWBsc = bscAvailW;
          destHBsc = bscAvailW / srcAspect;
          destXBsc = bscOffsetX;
          destYBsc = bscOffsetY + (bscAvailH - destHBsc) / 2;
        }
      } else if (importFitMode === 'fit-width') {
        destWBsc = bscAvailW;
        destHBsc = bscAvailW / srcAspect;
        if (destHBsc > bscAvailH) {
          destHBsc = bscAvailH;
          destWBsc = bscAvailH * srcAspect;
        }
        destXBsc = bscOffsetX + (bscAvailW - destWBsc) / 2;
        destYBsc = bscOffsetY + (bscAvailH - destHBsc) / 2;
      } else if (importFitMode === 'fit-height') {
        destHBsc = bscAvailH;
        destWBsc = bscAvailH * srcAspect;
        if (destWBsc > bscAvailW) {
          destWBsc = bscAvailW;
          destHBsc = bscAvailW / srcAspect;
        }
        destXBsc = bscOffsetX + (bscAvailW - destWBsc) / 2;
        destYBsc = bscOffsetY + (bscAvailH - destHBsc) / 2;
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

  // Calculate scale to fit in canvas while showing full image (fixed at x2, independent of preview zoom)
  const originalZoom = 2;
  const maxSize = 256 * originalZoom;
  const scale = Math.min(maxSize / w, maxSize / h, originalZoom);

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
  const originalZoom = 2;
  const maxSize = 256 * originalZoom;
  return Math.min(maxSize / w, maxSize / importImage.naturalHeight, originalZoom);
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
 * Draw 8x8 grid overlay on import preview canvas
 * @param {HTMLCanvasElement} canvas - Preview canvas
 * @param {number} zoom - Current zoom level
 * @param {string} format - Output format (for BSC which has different dimensions)
 */
function drawImportPreviewGrid(canvas, zoom, format) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Determine dimensions based on format
  let width, height;
  if (format === 'bsc') {
    width = 384;
    height = 304;
  } else if (format === 'mono_2_3') {
    width = 256;
    height = 128;
  } else if (format === 'mono_1_3') {
    width = 256;
    height = 64;
  } else {
    width = 256;
    height = 192;
  }

  const cellSize = 8 * zoom;
  const canvasW = width * zoom;
  const canvasH = height * zoom;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 165, 0, 0.6)';
  ctx.lineWidth = 1;

  // Vertical lines
  ctx.beginPath();
  for (let x = cellSize; x < canvasW; x += cellSize) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvasH);
  }
  ctx.stroke();

  // Horizontal lines
  ctx.beginPath();
  for (let y = cellSize; y < canvasH; y += cellSize) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvasW, y + 0.5);
  }
  ctx.stroke();

  ctx.restore();
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
  importElements.pattern53c = /** @type {HTMLSelectElement} */ (document.getElementById('import53cPattern'));
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
  importElements.showGrid = /** @type {HTMLInputElement} */ (document.getElementById('importShowGrid'));
  importElements.offsetX = /** @type {HTMLInputElement} */ (document.getElementById('importOffsetX'));
  importElements.offsetY = /** @type {HTMLInputElement} */ (document.getElementById('importOffsetY'));
  importElements.sizeW = /** @type {HTMLInputElement} */ (document.getElementById('importSizeW'));
  importElements.sizeH = /** @type {HTMLInputElement} */ (document.getElementById('importSizeH'));
  importElements.lockAspect = /** @type {HTMLInputElement} */ (document.getElementById('importLockAspect'));
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
  const showGridCheckbox = importElements.showGrid;
  const saturationSlider = importElements.saturation;
  const gammaSlider = importElements.gamma;
  const sharpnessSlider = importElements.sharpness;
  const smoothingSlider = importElements.smoothing;
  const blackPointSlider = importElements.blackPoint;
  const whitePointSlider = importElements.whitePoint;
  const balanceRSlider = importElements.balanceR;
  const balanceGSlider = importElements.balanceG;
  const balanceBSlider = importElements.balanceB;

  // Debounce timer for preview updates
  let previewDebounceTimer = null;

  // Update preview on control change (debounced to prevent rapid recalculations)
  const updatePreviewImmediate = () => {
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
    // Read zoom directly from element to ensure latest value for all formats
    const currentZoom = parseInt(importElements.zoom?.value || '2', 10);

    if (format === '53c') {
      const pattern = importElements.pattern53c?.value || 'checker';
      const attrData = convertTo53c(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, pattern);
      render53cToCanvas(attrData, importPreviewCanvas, currentZoom, pattern);
    } else if (format === 'bsc' && importSourceCanvasBsc) {
      const bscData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBscToCanvas(bscData, importPreviewCanvas, currentZoom);
    } else if (format === 'ifl') {
      const iflData = convertToIfl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderIflToCanvas(iflData, importPreviewCanvas, currentZoom);
    } else if (format === 'mlt') {
      const mltData = convertToMlt(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderMltToCanvas(mltData, importPreviewCanvas, currentZoom);
    } else if (format === 'bmc4') {
      const bmc4Data = convertToBmc4(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBmc4ToCanvas(bmc4Data, importPreviewCanvas, currentZoom);
    } else if (format === 'rgb3') {
      const rgb3Data = convertToRgb3(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderRgb3ToCanvas(rgb3Data, importPreviewCanvas);
    } else if (format === 'mono_full') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 3);
      renderMonoToCanvas(monoData, importPreviewCanvas, currentZoom, 3);
    } else if (format === 'mono_2_3') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 2);
      renderMonoToCanvas(monoData, importPreviewCanvas, currentZoom, 2);
    } else if (format === 'mono_1_3') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 1);
      renderMonoToCanvas(monoData, importPreviewCanvas, currentZoom, 1);
    } else if (format === 'ulaplus') {
      const result = convertToUlaPlus(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderUlaPlusToCanvas(result.data, importPreviewCanvas, currentZoom);
    } else {
      const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderScrToCanvas(scrData, importPreviewCanvas, currentZoom);
    }

    // Draw grid overlay if enabled
    if (showGridCheckbox?.checked && importPreviewCanvas) {
      drawImportPreviewGrid(importPreviewCanvas, currentZoom, format);
    }
  };

  // Debounced wrapper - allows UI to update before heavy calculation
  const updatePreview = () => {
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
    }
    // Small delay allows checkbox/UI to update visually before blocking calculation
    previewDebounceTimer = setTimeout(() => {
      previewDebounceTimer = null;
      updatePreviewImmediate();
    }, 50);
  };

  // Set global reference for mouse handlers
  updateImportPreview = updatePreview;

  // Update both canvases (original with crop overlay + preview)
  const updateAll = () => {
    renderOriginalWithCrop();
    // Force immediate update to ensure changes are applied
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
      previewDebounceTimer = null;
    }
    updatePreviewImmediate();
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
  formatSelect?.addEventListener('change', () => {
    // Update size defaults based on format
    const format = formatSelect?.value || 'scr';
    let defaultW = 256, defaultH = 192;
    if (format === 'bsc') {
      defaultW = 384; defaultH = 304;
    } else if (format === 'mono_2_3') {
      defaultH = 128;
    } else if (format === 'mono_1_3') {
      defaultH = 64;
    }
    importSize.w = defaultW;
    importSize.h = defaultH;
    if (importElements.sizeW) {
      importElements.sizeW.value = String(defaultW);
      importElements.sizeW.max = String(format === 'bsc' ? 384 : 256);
    }
    if (importElements.sizeH) {
      importElements.sizeH.value = String(defaultH);
      importElements.sizeH.max = String(format === 'bsc' ? 304 : 192);
    }
    // Also reset offset for format change
    importOffset.x = 0;
    importOffset.y = 0;
    if (importElements.offsetX) importElements.offsetX.value = '0';
    if (importElements.offsetY) importElements.offsetY.value = '0';
    // Show/hide 53c pattern selector
    const patternRow = document.getElementById('import53cPatternRow');
    if (patternRow) {
      patternRow.style.display = format === '53c' ? 'flex' : 'none';
    }
    updatePreview();
  });
  importElements.pattern53c?.addEventListener('change', updatePreview);
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

  // Function to update LAB checkbox state based on mono output
  const updateLabVisibility = () => {
    const labCheckbox = importElements.useLab;
    if (labCheckbox) {
      // Disable LAB checkbox when mono output is enabled (LAB has no effect in mono mode)
      const isMono = monoOutputCheckbox?.checked || false;
      labCheckbox.disabled = isMono;
      if (labCheckbox.parentElement) {
        labCheckbox.parentElement.style.opacity = isMono ? '0.5' : '';
      }
    }
  };

  monoOutputCheckbox?.addEventListener('change', () => {
    updateLabVisibility();
    updatePreview();
  });

  // Initialize LAB visibility on dialog setup
  updateLabVisibility();

  // Zoom control (only affects preview, not original)
  zoomSelect?.addEventListener('change', function() {
    importZoom = parseInt(this.value, 10);
    // Force immediate update to ensure zoom changes are applied
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
      previewDebounceTimer = null;
    }
    updatePreviewImmediate();
  });

  // Grid checkbox
  showGridCheckbox?.addEventListener('change', updatePreview);

  // Offset controls
  const onOffsetChange = () => {
    importOffset.x = Math.max(0, Math.min(248, parseInt(importElements.offsetX?.value || '0', 10) || 0));
    importOffset.y = Math.max(0, Math.min(184, parseInt(importElements.offsetY?.value || '0', 10) || 0));
    updateAll();
  };
  importElements.offsetX?.addEventListener('change', onOffsetChange);
  importElements.offsetY?.addEventListener('change', onOffsetChange);
  importElements.offsetX?.addEventListener('input', onOffsetChange);
  importElements.offsetY?.addEventListener('input', onOffsetChange);

  // Size controls with aspect ratio lock
  const getSourceAspect = () => importCrop.w / importCrop.h;
  const format = () => formatSelect?.value || 'scr';
  const maxW = () => format() === 'bsc' ? 384 : 256;
  const maxH = () => format() === 'bsc' ? 304 : 192;

  const onSizeWChange = () => {
    const newW = Math.max(8, Math.min(maxW(), parseInt(importElements.sizeW?.value || String(maxW()), 10) || maxW()));
    importSize.w = newW;
    if (importElements.lockAspect?.checked && importCrop.h > 0) {
      // Calculate height from width using source aspect ratio
      const aspect = getSourceAspect();
      const newH = Math.round(newW / aspect);
      importSize.h = Math.max(8, Math.min(maxH(), newH));
      if (importElements.sizeH) importElements.sizeH.value = String(importSize.h);
    }
    updateAll();
  };

  const onSizeHChange = () => {
    const newH = Math.max(8, Math.min(maxH(), parseInt(importElements.sizeH?.value || String(maxH()), 10) || maxH()));
    importSize.h = newH;
    if (importElements.lockAspect?.checked && importCrop.w > 0) {
      // Calculate width from height using source aspect ratio
      const aspect = getSourceAspect();
      const newW = Math.round(newH * aspect);
      importSize.w = Math.max(8, Math.min(maxW(), newW));
      if (importElements.sizeW) importElements.sizeW.value = String(importSize.w);
    }
    updateAll();
  };

  importElements.sizeW?.addEventListener('change', onSizeWChange);
  importElements.sizeH?.addEventListener('change', onSizeHChange);
  importElements.sizeW?.addEventListener('input', onSizeWChange);
  importElements.sizeH?.addEventListener('input', onSizeHChange);

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

    if (format === '53c') {
      const pattern = importElements.pattern53c?.value || 'checker';
      outputData = convertTo53c(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, pattern);
      outputFormat = FORMAT.ATTR_53C;
      fileExt = '.53c';
    } else if (format === 'bsc' && importSourceCanvasBsc) {
      outputData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.BSC;
      fileExt = '.bsc';
    } else if (format === 'ifl') {
      outputData = convertToIfl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.IFL;
      fileExt = '.ifl';
    } else if (format === 'mlt') {
      outputData = convertToMlt(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.MLT;
      fileExt = '.mlt';
    } else if (format === 'bmc4') {
      outputData = convertToBmc4(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.BMC4;
      fileExt = '.bmc4';
    } else if (format === 'rgb3') {
      outputData = convertToRgb3(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.RGB3;
      fileExt = '.3';
    } else if (format === 'mono_full') {
      outputData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 3);
      outputFormat = FORMAT.MONO_FULL;
      fileExt = '.scr';
    } else if (format === 'mono_2_3') {
      outputData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 2);
      outputFormat = FORMAT.MONO_2_3;
      fileExt = '.scr';
    } else if (format === 'mono_1_3') {
      outputData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 1);
      outputFormat = FORMAT.MONO_1_3;
      fileExt = '.scr';
    } else if (format === 'ulaplus') {
      // ULA+ format: SCR + 64-byte optimal palette
      const result = convertToUlaPlus(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputData = result.data;
      outputFormat = FORMAT.SCR_ULAPLUS;
      fileExt = '.scr';
      // Enable ULA+ mode with generated palette
      ulaPlusPalette = result.palette;
      isUlaPlusMode = true;
    } else {
      outputData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.SCR;
      fileExt = '.scr';
    }

    // Generate filename from imported file
    let newFileName;
    if (importFile) {
      const baseName = importFile.name.replace(/\.[^.]+$/, '');
      newFileName = baseName + fileExt;
    } else {
      newFileName = 'imported' + fileExt;
    }

    // Use multi-picture system if available
    if (typeof addPicture === 'function') {
      const result = addPicture(newFileName, outputFormat, outputData);
      if (result < 0) {
        // Max pictures reached - still update globals for direct use
        screenData = outputData;
        currentFormat = outputFormat;
        currentFileName = newFileName;
      }
    } else {
      // Editor not loaded - use direct assignment
      screenData = outputData;
      currentFormat = outputFormat;
      currentFileName = newFileName;
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

    // Update tab bar if available
    if (typeof updatePictureTabBar === 'function') {
      updatePictureTabBar();
    }

    // Update editor state for imported file
    if (typeof updateEditorState === 'function') {
      updateEditorState();
    }

    // Initialize layer system for the imported image
    if (typeof initLayers === 'function') {
      initLayers();
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

    // Reset offset to 0,0 for new image
    importOffset = { x: 0, y: 0 };
    if (importElements.offsetX) importElements.offsetX.value = '0';
    if (importElements.offsetY) importElements.offsetY.value = '0';

    // Reset size to defaults based on current format
    const format = importElements.format?.value || 'scr';
    let defaultW = 256, defaultH = 192;
    if (format === 'bsc') {
      defaultW = 384; defaultH = 304;
    } else if (format === 'mono_2_3') {
      defaultH = 128;
    } else if (format === 'mono_1_3') {
      defaultH = 64;
    }
    importSize = { w: defaultW, h: defaultH };
    if (importElements.sizeW) {
      importElements.sizeW.value = String(defaultW);
      importElements.sizeW.max = String(format === 'bsc' ? 384 : 256);
    }
    if (importElements.sizeH) {
      importElements.sizeH.value = String(defaultH);
      importElements.sizeH.max = String(format === 'bsc' ? 304 : 192);
    }

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

    // Render initial preview based on format
    if (format === 'ulaplus') {
      const result = convertToUlaPlus(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderUlaPlusToCanvas(result.data, importPreviewCanvas, importZoom);
    } else if (format === '53c') {
      const pattern = importElements.pattern53c?.value || 'checker';
      const attrData = convertTo53c(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, pattern);
      render53cToCanvas(attrData, importPreviewCanvas, importZoom, pattern);
    } else if (format === 'ifl') {
      const iflData = convertToIfl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderIflToCanvas(iflData, importPreviewCanvas, importZoom);
    } else if (format === 'mlt') {
      const mltData = convertToMlt(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderMltToCanvas(mltData, importPreviewCanvas, importZoom);
    } else if (format === 'bmc4') {
      const bmc4Data = convertToBmc4(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBmc4ToCanvas(bmc4Data, importPreviewCanvas, importZoom);
    } else if (format === 'rgb3') {
      const rgb3Data = convertToRgb3(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderRgb3ToCanvas(rgb3Data, importPreviewCanvas);
    } else if (format === 'mono_full') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 3);
      renderMonoToCanvas(monoData, importPreviewCanvas, importZoom, 3);
    } else if (format === 'mono_2_3') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 2);
      renderMonoToCanvas(monoData, importPreviewCanvas, importZoom, 2);
    } else if (format === 'mono_1_3') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 1);
      renderMonoToCanvas(monoData, importPreviewCanvas, importZoom, 1);
    } else {
      const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderScrToCanvas(scrData, importPreviewCanvas, importZoom);
    }

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
