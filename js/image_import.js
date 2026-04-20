// SpectraLab - Image Import
// @ts-check
"use strict";

// ============================================================================
// Image Import Module
// Converts images (PNG/GIF/JPG/WebP/BMP) to ZX Spectrum screen formats
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
 * Perceptual luminance (ITU-R BT.709)
 * @param {number[]} rgb - Color as [R, G, B] (0-255)
 * @returns {number} Luminance value (0-255 range)
 */
function perceptualLuminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Apply paper color rule — swap ink/paper if needed so paper matches the rule.
 * For Uint8Array bitmaps, inverts all bytes. For single-byte bitmap (number), inverts the byte.
 * @param {object} colors - Object with ink, paper, bright, inkRgb, paperRgb properties
 * @param {Uint8Array|number|null} bitmap - Bitmap data (Uint8Array for multi-row, number for single-row, null if not yet generated)
 * @returns {{colors: object, bitmap: Uint8Array|number|null}} Potentially swapped result
 */
function applyPaperRule(colors, bitmap) {
  if (importPaperRule === 'auto') return { colors, bitmap };

  let needSwap = false;

  if (importPaperRule === 'first-pixel') {
    // Leftmost pixel (bit 7) should be paper. If bit 7 is 1 (ink), swap so that color becomes paper.
    if (bitmap == null) return { colors, bitmap };
    const firstByte = (bitmap instanceof Uint8Array) ? bitmap[0] : bitmap;
    needSwap = (firstByte & 0x80) !== 0;
  } else {
    const inkLum = perceptualLuminance(colors.inkRgb);
    const paperLum = perceptualLuminance(colors.paperRgb);
    if (inkLum === paperLum) {
      // Same color: check against midpoint
      needSwap = (importPaperRule === 'darker' && paperLum >= 128) ||
                 (importPaperRule === 'lighter' && paperLum < 128);
    } else {
      // Different colors: compare to each other
      needSwap = (importPaperRule === 'darker' && inkLum < paperLum) ||
                 (importPaperRule === 'lighter' && inkLum > paperLum);
    }
  }

  if (!needSwap) return { colors, bitmap };

  const swapped = {
    ...colors,
    ink: colors.paper,
    paper: colors.ink,
    inkRgb: colors.paperRgb,
    paperRgb: colors.inkRgb
  };

  let invertedBitmap = bitmap;
  if (bitmap instanceof Uint8Array) {
    invertedBitmap = bitmap.map(b => b ^ 0xFF);
  } else if (typeof bitmap === 'number') {
    invertedBitmap = bitmap ^ 0xFF;
  }

  return { colors: swapped, bitmap: invertedBitmap };
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

// ============================================================================
// Dithering strength + scan controls (set by UI before conversion runs)
// ditherStrength: 0.0..1.0 - fraction of error diffused (100% = classic)
//                 For ordered methods, >0 enables ordered+FS hybrid mode
// ditherSerpentine: when true, error-diffusion methods scan rows bidirectionally
// ============================================================================
let ditherStrength = 1.0;
let ditherSerpentine = false;

/**
 * Floyd-Steinberg kernel (shared with serpentine + hybrid)
 */
const FS_KERNEL = [
  [1, 0, 7/16],
  [-1, 1, 3/16], [0, 1, 5/16], [1, 1, 1/16]
];

/**
 * Atkinson kernel (1/8 to each of 6 neighbors; sum = 6/8, rest is "lost")
 */
const ATKINSON_KERNEL = [
  [1, 0, 1/8], [2, 0, 1/8],
  [-1, 1, 1/8], [0, 1, 1/8], [1, 1, 1/8],
  [0, 2, 1/8]
];

/**
 * Floyd-Steinberg dithering
 * @param {Float32Array} pixels - Floating point RGB pixels (width * height * 3)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number[][]} palette - Target palette colors
 */
function floydSteinbergDither(pixels, width, height, palette) {
  errorDiffusionDither(pixels, width, height, palette, FS_KERNEL, ditherStrength, ditherSerpentine);
}

/**
 * Atkinson dithering (lighter, more contrast)
 * @param {Float32Array} pixels - Floating point RGB pixels
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number[][]} palette - Target palette colors
 */
function atkinsonDither(pixels, width, height, palette) {
  errorDiffusionDither(pixels, width, height, palette, ATKINSON_KERNEL, ditherStrength, ditherSerpentine);
}

/**
 * Bayer 2x2 ordered dithering matrix (coarsest, most visible pattern)
 */
const BAYER_2X2 = [
  [0, 2],
  [3, 1]
];

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
 * Generic error diffusion dithering with strength + optional serpentine scan
 * @param {Float32Array} pixels - Floating point RGB pixels
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number[][]} palette - Target palette colors
 * @param {Array<[number, number, number]>} kernel - Error diffusion kernel [[dx, dy, weight], ...]
 * @param {number} [strength=1] - 0..1, scales how much error is diffused
 * @param {boolean} [serpentine=false] - alternate row direction
 */
function errorDiffusionDither(pixels, width, height, palette, kernel, strength = 1, serpentine = false) {
  for (let y = 0; y < height; y++) {
    const reverse = serpentine && (y % 2 === 1);
    const startX = reverse ? width - 1 : 0;
    const endX = reverse ? -1 : width;
    const stepX = reverse ? -1 : 1;
    const dir = reverse ? -1 : 1;

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

      const errR = (oldR - newColor[0]) * strength;
      const errG = (oldG - newColor[1]) * strength;
      const errB = (oldB - newColor[2]) * strength;

      if (strength === 0) continue;

      for (const [dx, dy, weight] of kernel) {
        const nx = x + dx * dir;
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
  errorDiffusionDither(pixels, width, height, palette, kernel, ditherStrength, ditherSerpentine);
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
  errorDiffusionDither(pixels, width, height, palette, kernel, ditherStrength, ditherSerpentine);
}

/**
 * Burkes dithering (simplified, faster)
 */
function burkesDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 8/32], [2, 0, 4/32],
    [-2, 1, 2/32], [-1, 1, 4/32], [0, 1, 8/32], [1, 1, 4/32], [2, 1, 2/32]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel, ditherStrength, ditherSerpentine);
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
  errorDiffusionDither(pixels, width, height, palette, kernel, ditherStrength, ditherSerpentine);
}

/**
 * Sierra Lite dithering (two-line, faster)
 */
function sierraLiteDither(pixels, width, height, palette) {
  const kernel = [
    [1, 0, 2/4],
    [-1, 1, 1/4], [0, 1, 1/4]
  ];
  errorDiffusionDither(pixels, width, height, palette, kernel, ditherStrength, ditherSerpentine);
}

/**
 * Apply a bias+error-diffusion hybrid pass: pick nearest to (pixel + threshold),
 * but diffuse the residual error (pixel - picked) to neighbors scaled by strength.
 * When strength === 0 this degrades to pure ordered dithering.
 * @param {Float32Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {number[][]} palette
 * @param {(x: number, y: number) => number} thresholdFn - returns bias for (x,y) in same units as pixel channels
 * @param {number} strength - 0..1
 * @param {boolean} serpentine
 */
function orderedHybridDither(pixels, width, height, palette, thresholdFn, strength, serpentine) {
  const kernel = FS_KERNEL;
  for (let y = 0; y < height; y++) {
    const reverse = serpentine && (y % 2 === 1);
    const startX = reverse ? width - 1 : 0;
    const endX = reverse ? -1 : width;
    const stepX = reverse ? -1 : 1;
    const dir = reverse ? -1 : 1;

    for (let x = startX; x !== endX; x += stepX) {
      const idx = (y * width + x) * 3;
      const threshold = thresholdFn(x, y);

      const oldR = pixels[idx];
      const oldG = pixels[idx + 1];
      const oldB = pixels[idx + 2];

      const r = clamp(oldR + threshold);
      const g = clamp(oldG + threshold);
      const b = clamp(oldB + threshold);

      const nearest = findNearestColor([r, g, b], palette);
      const newColor = palette[nearest];

      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];

      if (strength === 0) continue;

      // Diffuse the residual (original - quantized) scaled by strength
      const errR = (oldR - newColor[0]) * strength;
      const errG = (oldG - newColor[1]) * strength;
      const errB = (oldB - newColor[2]) * strength;

      for (const [dx, dy, weight] of kernel) {
        const nx = x + dx * dir;
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
 * Ordered (Bayer 2x2) dithering - coarsest pattern
 */
function ordered2Dither(pixels, width, height, palette) {
  orderedHybridDither(pixels, width, height, palette,
    (x, y) => (BAYER_2X2[y % 2][x % 2] / 4 - 0.5) * 64,
    ditherStrength, ditherSerpentine);
}

/**
 * Ordered (Bayer 4x4) dithering
 */
function orderedDither(pixels, width, height, palette) {
  orderedHybridDither(pixels, width, height, palette,
    (x, y) => (BAYER_4X4[y % 4][x % 4] / 16 - 0.5) * 64,
    ditherStrength, ditherSerpentine);
}

/**
 * Ordered (Bayer 8x8) dithering - finer pattern
 */
function ordered8Dither(pixels, width, height, palette) {
  orderedHybridDither(pixels, width, height, palette,
    (x, y) => (BAYER_8X8[y % 8][x % 8] / 64 - 0.5) * 64,
    ditherStrength, ditherSerpentine);
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
  errorDiffusionDither(pixels, width, height, palette, kernel, ditherStrength, ditherSerpentine);
}

/**
 * Serpentine error diffusion (alternating row direction, reduces banding)
 * Uses Floyd-Steinberg weights with bidirectional scanning
 * Note: always enables serpentine regardless of global flag; respects strength.
 */
function serpentineDither(pixels, width, height, palette) {
  errorDiffusionDither(pixels, width, height, palette, FS_KERNEL, ditherStrength, true);
}

/**
 * Dizzy dither (Liam Appelbe, 2023: https://liamappelbe.medium.com/dizzy-dithering-2ae76dbceba1)
 * Error diffusion with a dynamic denominator. For each pixel the algorithm
 * sums weights of in-bounds unprocessed neighbors (orthogonal = 1.0,
 * diagonal = 0.1) into `denom`, then distributes `error * weight / denom`
 * to each of those neighbors. No error is lost at image edges and the
 * resulting noise has a blue-noise-like character.
 * Honors ditherStrength and ditherSerpentine.
 */
function dizzyDither(pixels, width, height, palette) {
  // [dx, dy, weight] - unprocessed neighbors in forward raster order
  const kernel = [
    [1, 0, 1.0],   // right       (orthogonal)
    [-1, 1, 0.1],  // down-left   (diagonal)
    [0, 1, 1.0],   // down        (orthogonal)
    [1, 1, 0.1]    // down-right  (diagonal)
  ];

  for (let y = 0; y < height; y++) {
    const reverse = ditherSerpentine && (y % 2 === 1);
    const startX = reverse ? width - 1 : 0;
    const endX = reverse ? -1 : width;
    const stepX = reverse ? -1 : 1;
    const dir = reverse ? -1 : 1;

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

      const errR = (oldR - newColor[0]) * ditherStrength;
      const errG = (oldG - newColor[1]) * ditherStrength;
      const errB = (oldB - newColor[2]) * ditherStrength;

      if (ditherStrength === 0) continue;

      // Sum weights of in-bounds unprocessed neighbors
      let denom = 0;
      for (const [dx, dy, w] of kernel) {
        const nx = x + dx * dir;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) denom += w;
      }
      if (denom === 0) continue;

      // Distribute error proportionally
      for (const [dx, dy, w] of kernel) {
        const nx = x + dx * dir;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 3;
          const f = w / denom;
          pixels[nIdx] += errR * f;
          pixels[nIdx + 1] += errG * f;
          pixels[nIdx + 2] += errB * f;
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

    // Calculate error and push to queue (scaled by global dither strength)
    const errR = (oldR - newColor[0]) * ditherStrength;
    const errG = (oldG - newColor[1]) * ditherStrength;
    const errB = (oldB - newColor[2]) * ditherStrength;

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
 * Supports hybrid ordered+error-diffusion mode when ditherStrength > 0.
 */
function blueNoiseDither(pixels, width, height, palette) {
  orderedHybridDither(pixels, width, height, palette,
    (x, y) => (BLUE_NOISE_16[y % 16][x % 16] - 128) * 0.5,
    ditherStrength, ditherSerpentine);
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
  orderedHybridDither(pixels, width, height, palette,
    (x, y) => (CLUSTER_8X8[y % 8][x % 8] - 32) * 4,
    ditherStrength, ditherSerpentine);
}

/**
 * a-dither (arithmetic dither) - FFmpeg libswscale
 * A_DITHER(u,v) = ((u + v*236) * 119) & 0xff
 * Spatially stable, blue-noise-like, computed with pure bit arithmetic.
 * Behaves as an ordered threshold method; honors Strength / Serpentine
 * through the shared hybrid helper (strength > 0 enables ordered+diffusion).
 */
function aDither(pixels, width, height, palette) {
  orderedHybridDither(pixels, width, height, palette,
    (x, y) => (((((x + y * 236) >>> 0) * 119) & 0xff) - 128) * 0.5,
    ditherStrength, ditherSerpentine);
}

/**
 * Unified global dithering dispatcher.
 * Looks up the dithering method name and runs the matching algorithm.
 * All wrappers honor the module-level `ditherStrength` and `ditherSerpentine`.
 * Unknown/'none' methods are no-ops (raw quantization happens later per-cell).
 * @param {string} method - Method name (e.g. 'floyd-steinberg')
 * @param {Float32Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {number[][]} palette
 */
function applyGlobalDither(method, pixels, width, height, palette) {
  switch (method) {
    case 'floyd-steinberg': floydSteinbergDither(pixels, width, height, palette); break;
    case 'jarvis':          jarvisDither(pixels, width, height, palette); break;
    case 'stucki':          stuckiDither(pixels, width, height, palette); break;
    case 'burkes':          burkesDither(pixels, width, height, palette); break;
    case 'sierra':          sierraDither(pixels, width, height, palette); break;
    case 'sierra-lite':     sierraLiteDither(pixels, width, height, palette); break;
    case 'sierra2':         sierra2Dither(pixels, width, height, palette); break;
    case 'serpentine':      serpentineDither(pixels, width, height, palette); break;
    case 'dizzy':           dizzyDither(pixels, width, height, palette); break;
    case 'riemersma':       riemersmaDither(pixels, width, height, palette); break;
    case 'blue-noise':      blueNoiseDither(pixels, width, height, palette); break;
    case 'a-dither':        aDither(pixels, width, height, palette); break;
    case 'pattern':         patternDither(pixels, width, height, palette); break;
    case 'atkinson':        atkinsonDither(pixels, width, height, palette); break;
    case 'ordered2':        ordered2Dither(pixels, width, height, palette); break;
    case 'ordered':         orderedDither(pixels, width, height, palette); break;
    case 'ordered8':        ordered8Dither(pixels, width, height, palette); break;
    case 'noise':           noiseDither(pixels, width, height, palette); break;
    // 'none' - no dithering applied
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

  const bestPal = bestBright ? palette.bright : palette.regular;

  return {
    ink: bestInk,
    paper: bestPaper,
    bright: bestBright,
    inkRgb: bestPal[bestInk],
    paperRgb: bestPal[bestPaper],
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
 * Apply all image adjustments in standard order.
 * Used by all convert functions except convertTo53c (which uses different order).
 * @param {Uint8ClampedArray} pixels - RGBA pixel data (modified in place)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} adj - Adjustment parameters
 */
function applyImageAdjustments(pixels, width, height, adj) {
  if (adj.grayscale) {
    applyGrayscale(pixels);
  } else {
    if (adj.saturation !== 0) applySaturation(pixels, adj.saturation);
    if (adj.balanceR !== 0 || adj.balanceG !== 0 || adj.balanceB !== 0) {
      applyColorBalance(pixels, adj.balanceR, adj.balanceG, adj.balanceB);
    }
  }
  if (adj.gamma !== 1.0) applyGamma(pixels, adj.gamma);
  if (adj.blackPoint > 0 || adj.whitePoint < 255) applyLevels(pixels, adj.blackPoint, adj.whitePoint);
  if (adj.brightness !== 0 || adj.contrast !== 0) applyBrightnessContrast(pixels, adj.brightness, adj.contrast);
  if (adj.smoothing > 0) applyBilateralFilter(pixels, width, height, adj.smoothing);
  if (adj.sharpness > 0) applySharpening(pixels, width, height, adj.sharpness);
}

/**
 * Convert RGBA pixel data (Uint8ClampedArray) to float RGB array for dithering.
 * @param {Uint8ClampedArray} pixels - RGBA pixel data
 * @param {number} numPixels - Number of pixels (width * height)
 * @returns {Float32Array} Float RGB array (3 values per pixel)
 */
function rgbaToFloat(pixels, numPixels) {
  const floatPixels = new Float32Array(numPixels * 3);
  for (let i = 0; i < numPixels; i++) {
    floatPixels[i * 3] = pixels[i * 4];
    floatPixels[i * 3 + 1] = pixels[i * 4 + 1];
    floatPixels[i * 3 + 2] = pixels[i * 4 + 2];
  }
  return floatPixels;
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
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  // For mono output, convert to grayscale BEFORE dithering
  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = rgbaToFloat(pixels, 256 * 192);

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

          // Apply paper color rule
          const ruled = applyPaperRule(colors, bitmap);

          // Write bitmap bytes
          for (let line = 0; line < 8; line++) {
            const y = cellY * 8 + line;
            const offset = getBitmapOffset(y) + cellX;
            scr[offset] = ruled.bitmap[line];
          }

          // Write attribute byte
          const attrOffset = 6144 + cellY * 32 + cellX;
          let attr = (ruled.colors.paper << 3) | ruled.colors.ink;
          if (ruled.colors.bright) attr |= 0x40;
          scr[attrOffset] = attr;
        }
      }
    }
  } else {
    // Traditional global dithering approach
    // For mono output, use only black and white
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    applyGlobalDither(dithering, floatPixels, 256, 192, ditherPalette);

    // Process each 8x8 cell
    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        const cell = monoOutput
          ? analyzeCellMono(floatPixels, cellX, cellY, 256, palette.bright[0], palette.bright[7])
          : analyzeCell(floatPixels, cellX, cellY, 256);

        // Apply paper color rule (skip for mono)
        const ruled = monoOutput ? { colors: cell, bitmap: cell.bitmap } : applyPaperRule(cell, cell.bitmap);

        // Write bitmap bytes
        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = ruled.bitmap[line];
        }

        // Write attribute byte
        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
        scr[attrOffset] = attr;
      }
    }
  }

  return scr;
}

// ============================================================================
// ZXP FORMAT CONVERSION (linear bitmap + attributes, parametric dimensions)
// ============================================================================

/**
 * Convert source canvas to ZXP format (linear bitmap + attributes)
 * Same dithering/quantization as SCR but with parametric width/height and linear addressing.
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (dimensions define output size)
 * @param {string} dithering - Dithering method
 * @param {number} brightness - Brightness adjustment
 * @param {number} contrast - Contrast adjustment
 * @param {number} saturation - Saturation adjustment
 * @param {number} gamma - Gamma value
 * @param {boolean} grayscale - Grayscale mode
 * @param {number} sharpness - Sharpness adjustment
 * @param {number} smoothing - Smoothing adjustment
 * @param {number} blackPoint - Black point
 * @param {number} whitePoint - White point
 * @param {number} balanceR - Red balance
 * @param {number} balanceG - Green balance
 * @param {number} balanceB - Blue balance
 * @param {boolean} monoOutput - Mono output mode
 * @returns {Uint8Array} ZXP data (bitmap + attributes, linear layout)
 */
function convertToZxp(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  updateColorDistanceMode();

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const cols = w >> 3;
  const attrCellH = 8;
  const attrRows = Math.ceil(h / attrCellH);
  const bitmapSize = cols * h;
  const attrSize = cols * attrRows;

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, w, h, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = rgbaToFloat(pixels, w * h);

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  const zxp = new Uint8Array(bitmapSize + attrSize);

  const isCellAware = dithering.startsWith('cell-');

  if (isCellAware) {
    const cellDitherMethod = dithering.replace('cell-', '');

    const monoColors = monoOutput ? {
      ink: 0, paper: 7, bright: true,
      inkRgb: palette.bright[0], paperRgb: palette.bright[7]
    } : null;

    const errorDiffusionMethods = ['floyd', 'atkinson', 'sierra2', 'serpentine', 'riemersma'];
    const useGlobalDitherForMono = monoOutput && errorDiffusionMethods.includes(cellDitherMethod);

    if (useGlobalDitherForMono) {
      const monoPalette = [palette.bright[0], palette.bright[7]];
      switch (cellDitherMethod) {
        case 'floyd': floydSteinbergDither(floatPixels, w, h, monoPalette); break;
        case 'atkinson': atkinsonDither(floatPixels, w, h, monoPalette); break;
        case 'sierra2': sierra2Dither(floatPixels, w, h, monoPalette); break;
        case 'serpentine': serpentineDither(floatPixels, w, h, monoPalette); break;
        case 'riemersma': riemersmaDither(floatPixels, w, h, monoPalette); break;
      }

      for (let cellY = 0; cellY < attrRows; cellY++) {
        for (let cellX = 0; cellX < cols; cellX++) {
          const cell = analyzeCellMono(floatPixels, cellX, cellY, w, monoColors.inkRgb, monoColors.paperRgb);

          for (let line = 0; line < 8; line++) {
            const y = cellY * 8 + line;
            if (y >= h) break;
            const offset = y * cols + cellX;
            zxp[offset] = cell.bitmap[line];
          }

          const attrOffset = bitmapSize + cellY * cols + cellX;
          zxp[attrOffset] = (7 << 3) | 0 | 0x40;
        }
      }
    } else {
      for (let cellY = 0; cellY < attrRows; cellY++) {
        for (let cellX = 0; cellX < cols; cellX++) {
          const colors = monoColors || findCellColors(floatPixels, cellX, cellY, w, palette);

          let bitmap;
          switch (cellDitherMethod) {
            case 'floyd':
              bitmap = ditherCellFloydSteinberg(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'atkinson':
              bitmap = ditherCellAtkinson(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'ordered':
              bitmap = ditherCellOrdered(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'sierra2':
              bitmap = ditherCellSierra2(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'serpentine':
              bitmap = ditherCellSerpentine(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'riemersma':
              bitmap = ditherCellRiemersma(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'blue-noise':
              bitmap = ditherCellBlueNoise(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'pattern':
              bitmap = ditherCellPattern(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
            default:
              bitmap = ditherCellNone(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb);
              break;
          }

          const ruled = applyPaperRule(colors, bitmap);

          for (let line = 0; line < 8; line++) {
            const y = cellY * 8 + line;
            if (y >= h) break;
            const offset = y * cols + cellX;
            zxp[offset] = ruled.bitmap[line];
          }

          const attrOffset = bitmapSize + cellY * cols + cellX;
          let attr = (ruled.colors.paper << 3) | ruled.colors.ink;
          if (ruled.colors.bright) attr |= 0x40;
          zxp[attrOffset] = attr;
        }
      }
    }
  } else {
    // Global dithering
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    applyGlobalDither(dithering, floatPixels, w, h, ditherPalette);

    for (let cellY = 0; cellY < attrRows; cellY++) {
      for (let cellX = 0; cellX < cols; cellX++) {
        const cell = monoOutput
          ? analyzeCellMono(floatPixels, cellX, cellY, w, palette.bright[0], palette.bright[7])
          : analyzeCell(floatPixels, cellX, cellY, w);

        const ruled = monoOutput ? { colors: cell, bitmap: cell.bitmap } : applyPaperRule(cell, cell.bitmap);

        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          if (y >= h) break;
          const offset = y * cols + cellX;
          zxp[offset] = ruled.bitmap[line];
        }

        const attrOffset = bitmapSize + cellY * cols + cellX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
        zxp[attrOffset] = attr;
      }
    }
  }

  return zxp;
}

/**
 * Convert source canvas to Nirvana tile format (linear bitmap + 8×2 multicolor attributes).
 * Output layout: bitmap[cols * h] + attrs[cols * attrRows] (linear, row-major).
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (variable dimensions)
 * @param {number} dithering - Dithering algorithm
 * @param {number} brightness - Brightness adjustment
 * @param {number} contrast - Contrast adjustment
 * @param {number} saturation - Saturation adjustment
 * @param {number} gamma - Gamma correction factor
 * @param {boolean} grayscale - Grayscale conversion
 * @param {number} sharpness - Sharpness adjustment
 * @param {number} smoothing - Smoothing adjustment
 * @param {number} blackPoint - Black point for levels
 * @param {number} whitePoint - White point for levels
 * @param {number} balanceR - Red balance
 * @param {number} balanceG - Green balance
 * @param {number} balanceB - Blue balance
 * @param {boolean} monoOutput - Produce monochrome bitmap
 * @returns {Uint8Array} Linear bitmap + 8×2 attributes
 */
function convertToNirvanaTile(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  updateColorDistanceMode();

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const cols = w >> 3;
  const attrCellH = 2;
  const attrRows = Math.ceil(h / attrCellH);
  const bitmapSize = cols * h;
  const attrSize = cols * attrRows;

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, w, h, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = rgbaToFloat(pixels, w * h);

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  const buf = new Uint8Array(bitmapSize + attrSize);

  const isCellAware = dithering.startsWith('cell-');

  if (isCellAware) {
    const cellDitherMethod = dithering.replace('cell-', '');
    const monoColors = monoOutput ? {
      ink: 0, paper: 7, bright: true,
      inkRgb: palette.bright[0], paperRgb: palette.bright[7]
    } : null;

    const useGlobalDitherForMono = monoOutput && cellDitherMethod === 'floyd';

    if (useGlobalDitherForMono) {
      const monoPalette = [palette.bright[0], palette.bright[7]];
      floydSteinbergDither(floatPixels, w, h, monoPalette);

      for (let blockY = 0; blockY < attrRows; blockY++) {
        for (let blockX = 0; blockX < cols; blockX++) {
          const block = analyzeBlock2Mono(floatPixels, blockX, blockY, w, monoColors.inkRgb, monoColors.paperRgb);

          for (let line = 0; line < 2; line++) {
            const y = blockY * 2 + line;
            if (y >= h) break;
            buf[y * cols + blockX] = block.bitmap[line];
          }

          buf[bitmapSize + blockY * cols + blockX] = (7 << 3) | 0 | 0x40;
        }
      }
    } else {
      for (let blockY = 0; blockY < attrRows; blockY++) {
        for (let blockX = 0; blockX < cols; blockX++) {
          const colors = monoColors || findBlockColors2(floatPixels, blockX, blockY, w, palette);

          let bitmap;
          switch (cellDitherMethod) {
            case 'floyd':
              bitmap = ditherBlock2FloydSteinberg(floatPixels, blockX, blockY, w, colors.inkRgb, colors.paperRgb);
              break;
            case 'ordered':
              bitmap = ditherBlock2Ordered(floatPixels, blockX, blockY, w, colors.inkRgb, colors.paperRgb);
              break;
            default:
              bitmap = ditherBlock2None(floatPixels, blockX, blockY, w, colors.inkRgb, colors.paperRgb);
              break;
          }

          const ruled = applyPaperRule(colors, bitmap);

          for (let line = 0; line < 2; line++) {
            const y = blockY * 2 + line;
            if (y >= h) break;
            buf[y * cols + blockX] = ruled.bitmap[line];
          }

          let attr = (ruled.colors.paper << 3) | ruled.colors.ink;
          if (ruled.colors.bright) attr |= 0x40;
          buf[bitmapSize + blockY * cols + blockX] = attr;
        }
      }
    }
  } else {
    // Global dithering
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    applyGlobalDither(dithering, floatPixels, w, h, ditherPalette);

    for (let blockY = 0; blockY < attrRows; blockY++) {
      for (let blockX = 0; blockX < cols; blockX++) {
        const block = monoOutput
          ? analyzeBlock2Mono(floatPixels, blockX, blockY, w, palette.bright[0], palette.bright[7])
          : analyzeBlock2(floatPixels, blockX, blockY, w);

        const ruled = monoOutput ? { colors: block, bitmap: block.bitmap } : applyPaperRule(block, block.bitmap);

        for (let line = 0; line < 2; line++) {
          const y = blockY * 2 + line;
          if (y >= h) break;
          buf[y * cols + blockX] = ruled.bitmap[line];
        }

        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
        buf[bitmapSize + blockY * cols + blockX] = attr;
      }
    }
  }

  return buf;
}

/**
 * Generate optimal ULA+ palette from image pixels (parametric dimensions).
 * @param {Float32Array} pixels - Float array of RGB values (w*h*3)
 * @param {number} w - Image width
 * @param {number} h - Image height
 * @returns {Uint8Array} 64-byte palette in GRB332 format
 */
function generateOptimalUlaPlusPaletteParam(pixels, w, h) {
  const colorFreq = new Map();
  const totalPixels = w * h;
  for (let i = 0; i < totalPixels; i++) {
    const r = Math.round(pixels[i * 3]);
    const g = Math.round(pixels[i * 3 + 1]);
    const b = Math.round(pixels[i * 3 + 2]);
    const grb = rgbToGrb332(r, g, b);
    colorFreq.set(grb, (colorFreq.get(grb) || 0) + 1);
  }
  const sortedColors = Array.from(colorFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  const cols = w >> 3;
  const attrRows = Math.ceil(h / 8);
  const cellColorPairs = [];
  for (let cellY = 0; cellY < attrRows; cellY++) {
    for (let cellX = 0; cellX < cols; cellX++) {
      const cellColors = new Map();
      for (let dy = 0; dy < 8; dy++) {
        const py = cellY * 8 + dy;
        if (py >= h) break;
        for (let dx = 0; dx < 8; dx++) {
          const px = cellX * 8 + dx;
          const idx = (py * w + px) * 3;
          const r = Math.round(pixels[idx]);
          const g = Math.round(pixels[idx + 1]);
          const b = Math.round(pixels[idx + 2]);
          const grb = rgbToGrb332(r, g, b);
          cellColors.set(grb, (cellColors.get(grb) || 0) + 1);
        }
      }
      const topColors = Array.from(cellColors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(e => e[0]);
      if (topColors.length >= 2) {
        cellColorPairs.push(topColors);
      }
    }
  }

  const clutColors = [new Set(), new Set(), new Set(), new Set()];
  for (const pair of cellColorPairs) {
    let bestClut = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < 4; c++) {
      const has0 = clutColors[c].has(pair[0]);
      const has1 = clutColors[c].has(pair[1]);
      const size = clutColors[c].size;
      let score = 0;
      if (has0) score += 10;
      if (has1) score += 10;
      if (size < 16) score += (16 - size);
      if (!has0 && !has1 && size >= 14) score = -100;
      if (score > bestScore) { bestScore = score; bestClut = c; }
    }
    if (clutColors[bestClut].size < 16) clutColors[bestClut].add(pair[0]);
    if (clutColors[bestClut].size < 16) clutColors[bestClut].add(pair[1]);
  }

  const palette = new Uint8Array(64);
  for (let c = 0; c < 4; c++) {
    const colors = Array.from(clutColors[c]);
    for (let i = 0; i < 16; i++) {
      if (i < colors.length) {
        palette[c * 16 + i] = colors[i];
      } else if (i < sortedColors.length) {
        palette[c * 16 + i] = sortedColors[i % sortedColors.length];
      }
    }
  }
  return palette;
}

/**
 * Find best CLUT and ink/paper for a cell (parametric width).
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {number} w - Image width
 * @param {number} h - Image height
 * @param {Uint8Array} palette - ULA+ 64-byte palette
 * @returns {{clut: number, ink: number, paper: number, inkRgb: number[], paperRgb: number[]}}
 */
function findUlaPlusCellColorsParam(pixels, cellX, cellY, w, h, palette) {
  const cellColors = [];
  for (let dy = 0; dy < 8; dy++) {
    const py = cellY * 8 + dy;
    if (py >= h) break;
    for (let dx = 0; dx < 8; dx++) {
      const px = cellX * 8 + dx;
      const idx = (py * w + px) * 3;
      cellColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  let bestError = Infinity;
  let bestClut = 0, bestInk = 0, bestPaper = 0;
  for (let clut = 0; clut < 4; clut++) {
    const baseIdx = clut * 16;
    for (let ink = 0; ink < 8; ink++) {
      const inkRgb = grb332ToRgb(palette[baseIdx + ink]);
      for (let paper = 0; paper < 8; paper++) {
        const paperRgb = grb332ToRgb(palette[baseIdx + 8 + paper]);
        let totalError = 0;
        for (const color of cellColors) {
          totalError += Math.min(colorDistance(color, inkRgb), colorDistance(color, paperRgb));
        }
        if (totalError < bestError) {
          bestError = totalError;
          bestClut = clut; bestInk = ink; bestPaper = paper;
        }
      }
    }
  }

  const baseIdx = bestClut * 16;
  return {
    clut: bestClut, ink: bestInk, paper: bestPaper,
    inkRgb: grb332ToRgb(palette[baseIdx + bestInk]),
    paperRgb: grb332ToRgb(palette[baseIdx + 8 + bestPaper])
  };
}

/**
 * Convert source canvas to ZXP format with ULA+ palette (64-color, linear layout).
 * Output: bitmap (linear) + attributes (linear) + 64-byte palette.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @param {Uint8Array|null} externalPalette
 * @returns {{data: Uint8Array, palette: Uint8Array}} ZXP data + palette
 */
function convertToZxpUlaPlus(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, externalPalette = null) {
  updateColorDistanceMode();

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const cols = w >> 3;
  const attrCellH = 8;
  const attrRows = Math.ceil(h / attrCellH);
  const bitmapSize = cols * h;
  const attrSize = cols * attrRows;

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, w, h, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  const floatPixels = rgbaToFloat(pixels, w * h);

  const palette = externalPalette
    ? new Uint8Array(externalPalette)
    : generateOptimalUlaPlusPaletteParam(floatPixels, w, h);

  // Output: bitmap + attrs + 64-byte palette
  const output = new Uint8Array(bitmapSize + attrSize + 64);

  const isCellAware = dithering.startsWith('cell-');
  const cellDitherMethod = isCellAware ? dithering.replace('cell-', '') : dithering;

  for (let cellY = 0; cellY < attrRows; cellY++) {
    for (let cellX = 0; cellX < cols; cellX++) {
      const colors = findUlaPlusCellColorsParam(floatPixels, cellX, cellY, w, h, palette);

      let bitmap;
      if (isCellAware) {
        switch (cellDitherMethod) {
          case 'floyd': bitmap = ditherCellFloydSteinberg(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'atkinson': bitmap = ditherCellAtkinson(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'ordered': bitmap = ditherCellOrdered(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'sierra2': bitmap = ditherCellSierra2(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'serpentine': bitmap = ditherCellSerpentine(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'riemersma': bitmap = ditherCellRiemersma(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'blue-noise': bitmap = ditherCellBlueNoise(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          case 'pattern': bitmap = ditherCellPattern(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
          default: bitmap = ditherCellNone(floatPixels, cellX, cellY, w, colors.inkRgb, colors.paperRgb); break;
        }
      } else {
        bitmap = new Uint8Array(8);
        for (let dy = 0; dy < 8; dy++) {
          const py = cellY * 8 + dy;
          if (py >= h) break;
          for (let dx = 0; dx < 8; dx++) {
            const px = cellX * 8 + dx;
            const idx = (py * w + px) * 3;
            const color = [floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2]];
            const inkDist = colorDistance(color, colors.inkRgb);
            const paperDist = colorDistance(color, colors.paperRgb);
            if (inkDist < paperDist) {
              bitmap[dy] |= (0x80 >> dx);
            }
          }
        }
      }

      // Write bitmap (linear addressing)
      for (let line = 0; line < 8; line++) {
        const y = cellY * 8 + line;
        if (y >= h) break;
        output[y * cols + cellX] = bitmap[line];
      }

      // Write attribute: CLUT from FLASH+BRIGHT bits
      const flash = (colors.clut >> 1) & 1;
      const bright = colors.clut & 1;
      const attrOffset = bitmapSize + cellY * cols + cellX;
      output[attrOffset] = (flash << 7) | (bright << 6) | (colors.paper << 3) | colors.ink;
    }
  }

  // Write palette at end
  output.set(palette, bitmapSize + attrSize);

  return { data: output, palette: palette };
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
 * Find best CLUT and ink/paper for a cell (256x192 shortcut)
 * @param {Float32Array} pixels - Float array of RGB values
 * @param {number} cellX - Cell X position
 * @param {number} cellY - Cell Y position
 * @param {Uint8Array} palette - ULA+ 64-byte palette
 * @returns {{clut: number, ink: number, paper: number, inkRgb: number[], paperRgb: number[]}}
 */
function findUlaPlusCellColors(pixels, cellX, cellY, palette) {
  return findUlaPlusCellColorsParam(pixels, cellX, cellY, 256, 192, palette);
}

/**
 * Convert image to ULA+ format with optimal palette
 */
function convertToUlaPlus(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, externalPalette = null) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  const floatPixels = rgbaToFloat(pixels, 256 * 192);

  // Generate optimal palette or use external one
  const palette = externalPalette
    ? new Uint8Array(externalPalette)
    : generateOptimalUlaPlusPalette(floatPixels);

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
          case 'pattern':
            bitmap = ditherCellPattern(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
          default: // 'none' or unknown
            bitmap = ditherCellNone(floatPixels, cellX, cellY, 256, colors.inkRgb, colors.paperRgb);
            break;
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

      // ULA+ ink/paper indices map to independent CLUT halves — swapping them
      // would reference wrong palette entries, so skip paper rule for ULA+
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

  const bestPal = bestBright ? palette.bright : palette.regular;
  return {
    ink: bestInk,
    paper: bestPaper,
    bright: bestBright,
    inkRgb: bestPal[bestInk],
    paperRgb: bestPal[bestPaper],
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

  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = rgbaToFloat(pixels, 256 * 192);

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

          // Apply paper color rule
          const ruled = applyPaperRule(colors, bitmap);

          for (let line = 0; line < 2; line++) {
            const y = blockY * 2 + line;
            const offset = getBitmapOffset(y) + blockX;
            ifl[offset] = ruled.bitmap[line];
          }

          const attrOffset = 6144 + blockY * 32 + blockX;
          let attr = (ruled.colors.paper << 3) | ruled.colors.ink;
          if (ruled.colors.bright) attr |= 0x40;
          ifl[attrOffset] = attr;
        }
      }
    }
  } else {
    // Global dithering
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    applyGlobalDither(dithering, floatPixels, 256, 192, ditherPalette);

    // Process 96 attribute rows (8×2 blocks)
    for (let blockY = 0; blockY < 96; blockY++) {
      for (let blockX = 0; blockX < 32; blockX++) {
        const block = monoOutput
          ? analyzeBlock2Mono(floatPixels, blockX, blockY, 256, palette.bright[0], palette.bright[7])
          : analyzeBlock2(floatPixels, blockX, blockY, 256);

        // Apply paper color rule (skip for mono)
        const ruled = monoOutput ? { colors: block, bitmap: block.bitmap } : applyPaperRule(block, block.bitmap);

        // Write 2 bitmap bytes
        for (let line = 0; line < 2; line++) {
          const y = blockY * 2 + line;
          const offset = getBitmapOffset(y) + blockX;
          ifl[offset] = ruled.bitmap[line];
        }

        // Write attribute byte
        const attrOffset = 6144 + blockY * 32 + blockX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
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

  const bestPal = bestBright ? palette.bright : palette.regular;
  return {
    ink: bestInk,
    paper: bestPaper,
    bright: bestBright,
    inkRgb: bestPal[bestInk],
    paperRgb: bestPal[bestPaper],
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

  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  if (monoOutput && !grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = rgbaToFloat(pixels, 256 * 192);

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

        // Apply paper color rule
        const ruled = applyPaperRule(colors, bitmap);

        // Write bitmap byte
        const bitmapOffset = getBitmapOffset(y) + blockX;
        mlt[bitmapOffset] = ruled.bitmap;

        // Write attribute byte
        const attrOffset = 6144 + y * 32 + blockX;
        let attr = (ruled.colors.paper << 3) | ruled.colors.ink;
        if (ruled.colors.bright) attr |= 0x40;
        mlt[attrOffset] = attr;
      }
    }
  } else {
    // Global dithering
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    applyGlobalDither(dithering, floatPixels, 256, 192, ditherPalette);

    // Process 192 attribute rows (8×1 blocks)
    for (let y = 0; y < 192; y++) {
      for (let blockX = 0; blockX < 32; blockX++) {
        const block = monoOutput
          ? analyzeBlock1Mono(floatPixels, blockX, y, 256, palette.bright[0], palette.bright[7])
          : analyzeBlock1(floatPixels, blockX, y, 256);

        // Apply paper color rule (skip for mono)
        const ruled = monoOutput ? { colors: block, bitmap: block.bitmap } : applyPaperRule(block, block.bitmap);

        // Write bitmap byte
        const bitmapOffset = getBitmapOffset(y) + blockX;
        mlt[bitmapOffset] = ruled.bitmap;

        // Write attribute byte
        const attrOffset = 6144 + y * 32 + blockX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
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

  const bestPal = bestBright ? palette.bright : palette.regular;
  return {
    ink: bestInk,
    paper: bestPaper,
    bright: bestBright,
    inkRgb: bestPal[bestInk],
    paperRgb: bestPal[bestPaper],
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
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (384x304)
 */
function convertToBmc4(sourceCanvas, dithering, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, monoOutput = false) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 384, 304);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, 384, 304, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  // Extract main screen area (256x192 at offset 64,64)
  const mainPixels = new Uint8ClampedArray(256 * 192 * 4);
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const srcIdx = ((y + 64) * 384 + (x + 64)) * 4;
      const dstIdx = (y * 256 + x) * 4;
      mainPixels[dstIdx] = pixels[srcIdx];
      mainPixels[dstIdx + 1] = pixels[srcIdx + 1];
      mainPixels[dstIdx + 2] = pixels[srcIdx + 2];
      mainPixels[dstIdx + 3] = 255;
    }
  }

  // For mono output, convert to grayscale before dithering
  if (monoOutput && !grayscale) {
    applyGrayscale(mainPixels);
  }

  const floatPixels = rgbaToFloat(mainPixels, 256 * 192);

  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  // BMC4: 6144 bitmap + 768 attr1 + 768 attr2 + 4224 border = 11904 bytes
  const bmc4 = new Uint8Array(11904);

  const isCellAware = dithering.startsWith('cell-');

  if (!isCellAware) {
    // Apply global dithering first
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;
    applyGlobalDither(dithering, floatPixels, 256, 192, ditherPalette);
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

      // Apply paper color rule (skip for mono)
      const ruled = monoOutput ? { colors, bitmap } : applyPaperRule(colors, bitmap);

      // Write 4 bitmap bytes
      for (let line = 0; line < 4; line++) {
        const y = blockY * 4 + line;
        const offset = getBitmapOffset(y) + blockX;
        bmc4[offset] = ruled.bitmap[line];
      }

      // Write attribute byte to appropriate bank
      // attr1 (6144-6911) for top 4 lines, attr2 (6912-7679) for bottom 4 lines of each char cell
      const charRow = Math.floor(blockY / 2);
      const isTopHalf = (blockY % 2) === 0;
      const attrOffset = isTopHalf ? (6144 + charRow * 32 + blockX) : (6912 + charRow * 32 + blockX);
      let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
      bmc4[attrOffset] = attr;
    }
  }

  // Encode border data at offset 7680 (same layout as BSC)
  const regularPalette = palette.regular;
  let borderOffset = 7680;

  const encodeFullBorderLine = (y) => {
    // Calculate best color per 8px cell
    const segColors = new Array(48);
    for (let seg = 0; seg < 48; seg++) {
      segColors[seg] = findNearestBorderColor(getBlockAverageColor(pixels, 384, seg * 8, y, 8), regularPalette);
    }

    // Enforce 24px (3-cell) minimum run length for interior segments (3-44).
    // Edge segments 0-2 and 45-47 can be any width (they touch frame/paper edge).
    // A short interior run is OK if it touches an edge segment of the same color.
    // Merge remaining short runs into their longer neighbor; repeat until stable.
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 3; i < 45; ) {
        const color = segColors[i];
        let runEnd = i + 1;
        while (runEnd < 45 && segColors[runEnd] === color) runEnd++;
        const runLen = runEnd - i;
        if (runLen < 3) {
          let totalLen = runLen;
          for (let j = i - 1; j >= 0 && segColors[j] === color; j--) totalLen++;
          for (let j = runEnd; j < 48 && segColors[j] === color; j++) totalLen++;
          if (totalLen < 3) {
            const prevColor = segColors[i - 1];
            const nextColor = runEnd < 45 ? segColors[runEnd] : segColors[44];
            let prevLen = 0;
            for (let j = i - 1; j >= 0 && segColors[j] === prevColor; j--) prevLen++;
            let nextLen = 0;
            for (let j = runEnd; j < 48 && segColors[j] === nextColor; j++) nextLen++;
            const mergeColor = prevLen >= nextLen ? prevColor : nextColor;
            for (let j = i; j < runEnd; j++) segColors[j] = mergeColor;
            changed = true;
          }
        }
        i = runEnd;
      }
    }

    // Encode to bytes (2 segments per byte)
    for (let i = 0; i < 24; i++) {
      bmc4[borderOffset++] = segColors[i * 2] | (segColors[i * 2 + 1] << 3);
    }
  };

  const encodeSideBorderLine = (y) => {
    // Left border (64 pixels = 8 segments, 4 bytes)
    for (let i = 0; i < 4; i++) {
      const x = i * 16;
      const color1 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x, y, 8), regularPalette);
      const color2 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x + 8, y, 8), regularPalette);
      bmc4[borderOffset++] = color1 | (color2 << 3);
    }

    // Right border (64 pixels = 8 segments, 4 bytes)
    for (let i = 0; i < 4; i++) {
      const x = 320 + i * 16;
      const color1 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x, y, 8), regularPalette);
      const color2 = findNearestBorderColor(getBlockAverageColor(pixels, 384, x + 8, y, 8), regularPalette);
      bmc4[borderOffset++] = color1 | (color2 << 3);
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

  return bmc4;
}

// ============================================================================
// MONOCHROME FORMAT CONVERSION (bitmap only, no attributes)
// ============================================================================

/**
 * Map cell-aware dithering names to global equivalents.
 * Cell-aware dithering is only meaningful for attribute-cell formats (Spectrum, Gigascreen, etc).
 * For non-cell formats (RGB3, Mono, ULA+), strip the cell- prefix and fix name mismatches.
 * @param {string} dithering - Dithering mode name (possibly with cell- prefix)
 * @returns {string} Global dithering name for use in switch statements
 */
function mapCellDithering(dithering) {
  if (!dithering.startsWith('cell-')) return dithering;
  const stripped = dithering.substring(5);
  if (stripped === 'floyd') return 'floyd-steinberg';
  return stripped;  // 'none' falls through switch (no dithering), others match directly
}

/**
 * Dither for RGB3: each color channel independently as 1-bit.
 * RGB3 has 3 independent bitplanes, so per-channel dithering produces
 * better color blending than dithering against 8 whole colors.
 * @param {Float32Array} floatPixels - RGB pixel data (modified in place)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {function} ditherFn - Dithering function (pixels, width, height, palette)
 */
function ditherRgb3PerChannel(floatPixels, width, height, ditherFn) {
  const numPixels = width * height;
  const bwPalette = [[0, 0, 0], [255, 255, 255]];
  const channelBuf = new Float32Array(numPixels * 3);

  for (let ch = 0; ch < 3; ch++) {
    // Extract channel as grayscale image (R=G=B=channel value)
    for (let i = 0; i < numPixels; i++) {
      const val = floatPixels[i * 3 + ch];
      channelBuf[i * 3] = val;
      channelBuf[i * 3 + 1] = val;
      channelBuf[i * 3 + 2] = val;
    }

    // Dither as monochrome
    ditherFn(channelBuf, width, height, bwPalette);

    // Write dithered channel back
    for (let i = 0; i < numPixels; i++) {
      floatPixels[i * 3 + ch] = channelBuf[i * 3];
    }
  }
}

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

  applyImageAdjustments(pixels, 256, height, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  // For mono format, always convert to grayscale before dithering
  if (!grayscale) {
    applyGrayscale(pixels);
  }

  const floatPixels = rgbaToFloat(pixels, 256 * height);

  const palette = getCombinedPalette();
  // Monochrome uses only black and white
  const monoPalette = [palette.bright[0], palette.bright[7]];

  // Apply dithering
  // Map cell-aware names to global equivalents (mono has no attribute cells)
  const monoDithering = mapCellDithering(dithering);
  applyGlobalDither(monoDithering, floatPixels, 256, height, monoPalette);

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

  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  const floatPixels = rgbaToFloat(pixels, 256 * 192);

  // Apply dithering — each RGB channel independently as 1-bit.
  // RGB3 has 3 independent bitplanes, so per-channel dithering produces
  // better color blending than joint 8-color dithering (which looks like SCR).
  const rgb3Dithering = mapCellDithering(dithering);
  switch (rgb3Dithering) {
    case 'floyd-steinberg': ditherRgb3PerChannel(floatPixels, 256, 192, floydSteinbergDither); break;
    case 'jarvis': ditherRgb3PerChannel(floatPixels, 256, 192, jarvisDither); break;
    case 'stucki': ditherRgb3PerChannel(floatPixels, 256, 192, stuckiDither); break;
    case 'burkes': ditherRgb3PerChannel(floatPixels, 256, 192, burkesDither); break;
    case 'sierra': ditherRgb3PerChannel(floatPixels, 256, 192, sierraDither); break;
    case 'sierra-lite': ditherRgb3PerChannel(floatPixels, 256, 192, sierraLiteDither); break;
    case 'sierra2': ditherRgb3PerChannel(floatPixels, 256, 192, sierra2Dither); break;
    case 'serpentine': ditherRgb3PerChannel(floatPixels, 256, 192, serpentineDither); break;
    case 'dizzy': ditherRgb3PerChannel(floatPixels, 256, 192, dizzyDither); break;
    case 'riemersma': ditherRgb3PerChannel(floatPixels, 256, 192, riemersmaDither); break;
    case 'blue-noise': ditherRgb3PerChannel(floatPixels, 256, 192, blueNoiseDither); break;
    case 'a-dither': ditherRgb3PerChannel(floatPixels, 256, 192, aDither); break;
    case 'pattern': ditherRgb3PerChannel(floatPixels, 256, 192, patternDither); break;
    case 'atkinson': ditherRgb3PerChannel(floatPixels, 256, 192, atkinsonDither); break;
    case 'ordered2': ditherRgb3PerChannel(floatPixels, 256, 192, ordered2Dither); break;
    case 'ordered': ditherRgb3PerChannel(floatPixels, 256, 192, orderedDither); break;
    case 'ordered8': ditherRgb3PerChannel(floatPixels, 256, 192, ordered8Dither); break;
    case 'noise': ditherRgb3PerChannel(floatPixels, 256, 192, noiseDither); break;
    // 'none': no dithering applied
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

        // After per-channel dithering, each channel is 0 or 255
        // Threshold at 128 to set the corresponding bitplane bit
        if (floatPixels[idx] >= 128) redByte |= (0x80 >> bit);
        if (floatPixels[idx + 1] >= 128) greenByte |= (0x80 >> bit);
        if (floatPixels[idx + 2] >= 128) blueByte |= (0x80 >> bit);
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
function renderRgb3ToCanvas(rgb3Data, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;

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

  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
}

// ============================================================================
// GIGASCREEN / MGH FORMAT CONVERSION
// ============================================================================
// Gigascreen blends two SCR-style frames at ~50Hz to produce extra perceived
// colors. Each cell (8 × cellHeight) has two attribute bytes (one per frame),
// giving up to 4 distinct blended colors per cell.
//   cellHeight = 8 → standard gigascreen / mg8
//   cellHeight = 4 → mg4
//   cellHeight = 2 → mg2
//   cellHeight = 1 → mg1 (per-pixel-row attributes)

/**
 * Compute index in 136-blend palette for unordered pair of palette indices.
 * @param {number} a - palette index 0..15
 * @param {number} b - palette index 0..15
 * @returns {number} index 0..135
 */
function gigaBlendIndex(a, b) {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return lo * 16 + hi - ((lo * (lo + 1)) >> 1);
}

/**
 * Precompute lookup tables for Gigascreen attribute search.
 * For every (attr1, attr2) pair the 4 blend colors are deterministic. We dedupe
 * by canonicalising attr1 ≤ attr2 (swapping just exchanges the two frames) and
 * by canonicalising ink/paper inside each attr (swapping inverts the bitmap
 * bits — visually equivalent), yielding ~2628 unique quad shapes.
 *
 * Each attr byte: bit 6 = bright, bits 5-3 = paper, bits 2-0 = ink.
 *
 * @param {number[][]} allColors - 16 RGB colors (regular + bright)
 * @returns {{quads: Array<{attr1:number, attr2:number, idx:number[], colors:number[][]}>, blendedPalette:number[][]}}
 */
function precomputeGigaQuads(allColors) {
  // Build 136-color blend palette
  const blendedPalette = new Array(136);
  for (let c1 = 0; c1 < 16; c1++) {
    for (let c2 = c1; c2 < 16; c2++) {
      const bi = c1 * 16 + c2 - ((c1 * (c1 + 1)) >> 1);
      blendedPalette[bi] = [
        Math.round((allColors[c1][0] + allColors[c2][0]) / 2),
        Math.round((allColors[c1][1] + allColors[c2][1]) / 2),
        Math.round((allColors[c1][2] + allColors[c2][2]) / 2)
      ];
    }
  }

  // Generate canonical attrs (ink ≤ paper, both within same brightness).
  // Within an attr, swapping ink/paper just inverts the bitmap bit meaning, so
  // we can pick a single canonical encoding (ink is the smaller palette index).
  // Canonical attr byte: (bright<<6) | (paperRaw<<3) | inkRaw with inkRaw ≤ paperRaw.
  const canonAttrs = [];
  const seenColorPairs = new Set();
  for (let bright = 0; bright <= 1; bright++) {
    for (let inkRaw = 0; inkRaw < 8; inkRaw++) {
      for (let paperRaw = inkRaw; paperRaw < 8; paperRaw++) {
        const inkIdx = bright * 8 + inkRaw;
        const paperIdx = bright * 8 + paperRaw;
        const key = inkIdx * 16 + paperIdx;
        if (seenColorPairs.has(key)) continue;
        seenColorPairs.add(key);
        const attr = (bright << 6) | (paperRaw << 3) | inkRaw;
        canonAttrs.push({ attr, ink: inkIdx, paper: paperIdx });
      }
    }
  }

  // Build unique quads from canonical attr pairs (canon1 ≤ canon2)
  const quads = [];
  const seenQuads = new Set();
  for (let i = 0; i < canonAttrs.length; i++) {
    const c1 = canonAttrs[i];
    for (let j = i; j < canonAttrs.length; j++) {
      const c2 = canonAttrs[j];
      // Compute the 4 blend indices for this quad
      // c00 = paper1+paper2 (b1=0,b2=0)
      // c01 = paper1+ink2  (b1=0,b2=1)
      // c10 = ink1+paper2  (b1=1,b2=0)
      // c11 = ink1+ink2    (b1=1,b2=1)
      const idx00 = gigaBlendIndex(c1.paper, c2.paper);
      const idx01 = gigaBlendIndex(c1.paper, c2.ink);
      const idx10 = gigaBlendIndex(c1.ink, c2.paper);
      const idx11 = gigaBlendIndex(c1.ink, c2.ink);
      // Quad key: sorted blend indices to dedupe shape duplicates
      const sorted = [idx00, idx01, idx10, idx11].slice().sort((a, b) => a - b);
      const key = sorted.join(',');
      if (seenQuads.has(key)) continue;
      seenQuads.add(key);
      quads.push({
        attr1: c1.attr,
        attr2: c2.attr,
        ink1: c1.ink, paper1: c1.paper,
        ink2: c2.ink, paper2: c2.paper,
        idx: [idx00, idx01, idx10, idx11],
        colors: [
          blendedPalette[idx00],
          blendedPalette[idx01],
          blendedPalette[idx10],
          blendedPalette[idx11]
        ]
      });
    }
  }

  return { quads, blendedPalette };
}

/**
 * Find the best (attr1, attr2) pair for a single Gigascreen cell.
 * Brute-force over precomputed unique quads. Pixel-to-blend distances are
 * precomputed once per cell so per-quad cost is just 4 lookups + min per pixel.
 *
 * @param {Float32Array} floatPixels - Whole-image pixel buffer (R,G,B,...)
 * @param {number} cellCol - Cell column 0..31
 * @param {number} cellY - Top y of cell (in pixels)
 * @param {number} cellHeight - Cell height (1, 2, 4, or 8)
 * @param {number} width - Image width
 * @param {{quads:Array, blendedPalette:number[][]}} attrQuads - Precomputed quads
 * @param {number} [imgHeight=192] - Image height (defaults to 192 for ZX screen)
 * @returns {{attr1:number, attr2:number, quadColors:number[][], frame1Ink:number, frame1Paper:number, frame2Ink:number, frame2Paper:number}}
 */
function findGigaCellColors(floatPixels, cellCol, cellY, cellHeight, width, attrQuads, imgHeight = 192) {
  const quads = attrQuads.quads;
  const blendedPalette = attrQuads.blendedPalette;
  const cellH = Math.min(cellHeight, imgHeight - cellY);
  const numPx = cellH * 8;

  // Collect cell pixels
  const pxR = new Float32Array(numPx);
  const pxG = new Float32Array(numPx);
  const pxB = new Float32Array(numPx);
  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY + dy) * width + (cellCol * 8 + dx)) * 3;
      const li = dy * 8 + dx;
      pxR[li] = floatPixels[srcIdx];
      pxG[li] = floatPixels[srcIdx + 1];
      pxB[li] = floatPixels[srcIdx + 2];
    }
  }

  // Precompute distance from every cell pixel to every blended palette entry
  const dists = new Float32Array(numPx * 136);
  for (let p = 0; p < numPx; p++) {
    const pr = pxR[p], pg = pxG[p], pb = pxB[p];
    const base = p * 136;
    for (let b = 0; b < 136; b++) {
      const c = blendedPalette[b];
      const dr = pr - c[0];
      const dg = pg - c[1];
      const db = pb - c[2];
      dists[base + b] = dr * dr + dg * dg + db * db;
    }
  }

  // Iterate quads, find minimum total error
  let bestErr = Infinity;
  let bestQuad = quads[0];
  for (let qi = 0; qi < quads.length; qi++) {
    const q = quads[qi];
    const i00 = q.idx[0], i01 = q.idx[1], i10 = q.idx[2], i11 = q.idx[3];
    let totalErr = 0;
    for (let p = 0; p < numPx; p++) {
      const base = p * 136;
      const d0 = dists[base + i00];
      const d1 = dists[base + i01];
      const d2 = dists[base + i10];
      const d3 = dists[base + i11];
      let m = d0;
      if (d1 < m) m = d1;
      if (d2 < m) m = d2;
      if (d3 < m) m = d3;
      totalErr += m;
      if (totalErr >= bestErr) break;
    }
    if (totalErr < bestErr) {
      bestErr = totalErr;
      bestQuad = q;
    }
  }

  return {
    attr1: bestQuad.attr1,
    attr2: bestQuad.attr2,
    quadColors: bestQuad.colors,
    frame1Ink: bestQuad.ink1,
    frame1Paper: bestQuad.paper1,
    frame2Ink: bestQuad.ink2,
    frame2Paper: bestQuad.paper2
  };
}

// Mapping from quad color index → frame bits.
// Quad order: 0=(p1,p2), 1=(p1,i2), 2=(i1,p2), 3=(i1,i2)
const GIGA_QUAD_B1 = [0, 0, 1, 1];
const GIGA_QUAD_B2 = [0, 1, 0, 1];

/**
 * Apply cell-local dithering to a Gigascreen cell using its 4 quad colors.
 * Returns per-row bitmap bytes for both frames.
 *
 * @param {Float32Array} floatPixels - Whole-image pixel buffer
 * @param {number} cellCol - Cell column 0..31
 * @param {number} cellY - Top y of cell
 * @param {number} cellHeight - Cell height (1, 2, 4, or 8)
 * @param {number} width - Image width
 * @param {number[][]} quadColors - 4 RGB blend colors for the chosen quad
 * @param {string} method - 'floyd', 'atkinson', 'ordered', 'none'
 * @returns {{bitmap1:Uint8Array, bitmap2:Uint8Array}}
 */
function ditherGigaCell(floatPixels, cellCol, cellY, cellHeight, width, quadColors, method, imgHeight = 192) {
  const cellH = Math.min(cellHeight, imgHeight - cellY);
  const numPx = cellH * 8;
  const localR = new Float32Array(numPx);
  const localG = new Float32Array(numPx);
  const localB = new Float32Array(numPx);
  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcIdx = ((cellY + dy) * width + (cellCol * 8 + dx)) * 3;
      const li = dy * 8 + dx;
      localR[li] = floatPixels[srcIdx];
      localG[li] = floatPixels[srcIdx + 1];
      localB[li] = floatPixels[srcIdx + 2];
    }
  }

  const bitmap1 = new Uint8Array(cellH);
  const bitmap2 = new Uint8Array(cellH);

  // 4x4 Bayer matrix for ordered dither
  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const bayerScale = 1.0 / 16.0;

  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const i = dy * 8 + dx;
      let pr = localR[i], pg = localG[i], pb = localB[i];

      // Apply ordered bias before quantization (no error diffusion for ordered)
      if (method === 'ordered') {
        const t = (bayer4[dy & 3][dx & 3] - 7.5) * bayerScale * 64;
        pr += t; pg += t; pb += t;
      }

      // Find nearest of 4 quad colors
      let bestIdx = 0;
      let bestD = Infinity;
      for (let q = 0; q < 4; q++) {
        const c = quadColors[q];
        const dr = pr - c[0], dg = pg - c[1], db = pb - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; bestIdx = q; }
      }

      // Set frame bits
      if (GIGA_QUAD_B1[bestIdx]) bitmap1[dy] |= (0x80 >> dx);
      if (GIGA_QUAD_B2[bestIdx]) bitmap2[dy] |= (0x80 >> dx);

      // Error diffusion (Floyd-Steinberg / Atkinson)
      if (method === 'floyd' || method === 'atkinson') {
        const c = quadColors[bestIdx];
        const errR = localR[i] - c[0];
        const errG = localG[i] - c[1];
        const errB = localB[i] - c[2];

        if (method === 'floyd') {
          if (dx + 1 < 8) {
            const ni = dy * 8 + (dx + 1);
            localR[ni] += errR * 7 / 16;
            localG[ni] += errG * 7 / 16;
            localB[ni] += errB * 7 / 16;
          }
          if (dy + 1 < cellH) {
            if (dx > 0) {
              const ni = (dy + 1) * 8 + (dx - 1);
              localR[ni] += errR * 3 / 16;
              localG[ni] += errG * 3 / 16;
              localB[ni] += errB * 3 / 16;
            }
            const ni2 = (dy + 1) * 8 + dx;
            localR[ni2] += errR * 5 / 16;
            localG[ni2] += errG * 5 / 16;
            localB[ni2] += errB * 5 / 16;
            if (dx + 1 < 8) {
              const ni3 = (dy + 1) * 8 + (dx + 1);
              localR[ni3] += errR * 1 / 16;
              localG[ni3] += errG * 1 / 16;
              localB[ni3] += errB * 1 / 16;
            }
          }
        } else {
          // Atkinson — distribute 1/8 to 6 neighbors
          const f = 1 / 8;
          const er = errR * f, eg = errG * f, eb = errB * f;
          if (dx + 1 < 8) {
            const ni = dy * 8 + (dx + 1);
            localR[ni] += er; localG[ni] += eg; localB[ni] += eb;
          }
          if (dx + 2 < 8) {
            const ni = dy * 8 + (dx + 2);
            localR[ni] += er; localG[ni] += eg; localB[ni] += eb;
          }
          if (dy + 1 < cellH) {
            if (dx > 0) {
              const ni = (dy + 1) * 8 + (dx - 1);
              localR[ni] += er; localG[ni] += eg; localB[ni] += eb;
            }
            const ni0 = (dy + 1) * 8 + dx;
            localR[ni0] += er; localG[ni0] += eg; localB[ni0] += eb;
            if (dx + 1 < 8) {
              const ni = (dy + 1) * 8 + (dx + 1);
              localR[ni] += er; localG[ni] += eg; localB[ni] += eb;
            }
          }
          if (dy + 2 < cellH) {
            const ni = (dy + 2) * 8 + dx;
            localR[ni] += er; localG[ni] += eg; localB[ni] += eb;
          }
        }
      }
    }
  }

  return { bitmap1, bitmap2 };
}

/**
 * Find which of the 4 quad colors a pixel is nearest to, returning the
 * corresponding frame1/frame2 ink bits.
 * @param {number} pr
 * @param {number} pg
 * @param {number} pb
 * @param {number[][]} quadColors
 * @returns {{f1ink:number, f2ink:number}}
 */
function nearestGigaQuadBits(pr, pg, pb, quadColors) {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let q = 0; q < 4; q++) {
    const c = quadColors[q];
    const dr = pr - c[0], dg = pg - c[1], db = pb - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; bestIdx = q; }
  }
  return { f1ink: GIGA_QUAD_B1[bestIdx], f2ink: GIGA_QUAD_B2[bestIdx] };
}

/**
 * Convert image to Gigascreen / MGH format.
 * Output buffer layout: frame1_bitmap (6144) + frame1_attrs (attrSize)
 *                     + frame2_bitmap (6144) + frame2_attrs (attrSize)
 * For cellHeight = 8 this matches the standard 13824-byte .img layout.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @param {number} cellHeight - 8 (gigascreen/mg8), 4 (mg4), 2 (mg2), 1 (mg1)
 * @returns {Uint8Array}
 */
function convertToGigascreen(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, cellHeight) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');
  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;
  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });
  const floatPixels = rgbaToFloat(pixels, 256 * 192);

  const palette = getCombinedPalette();
  const allColors = [...palette.regular, ...palette.bright]; // 16 colors

  const attrQuads = precomputeGigaQuads(allColors);
  const blendedPalette = attrQuads.blendedPalette;

  const attrRows = Math.ceil(192 / cellHeight);
  const attrSize = attrRows * 32;
  const frameSize = 6144 + attrSize;
  const result = new Uint8Array(frameSize * 2);

  const isCellAware = dithering.startsWith('cell-');

  if (!isCellAware) {
    // Global dithering against the 136-color blended palette
    const gigaDithering = mapCellDithering(dithering);
    applyGlobalDither(gigaDithering, floatPixels, 256, 192, blendedPalette);
  }

  const cellDitherMethod = isCellAware ? dithering.replace('cell-', '') : null;

  // Process each cell
  for (let cellRow = 0; cellRow < attrRows; cellRow++) {
    const cellY = cellRow * cellHeight;
    if (cellY >= 192) break;
    const cellH = Math.min(cellHeight, 192 - cellY);

    for (let cellCol = 0; cellCol < 32; cellCol++) {
      const best = findGigaCellColors(floatPixels, cellCol, cellY, cellHeight, 256, attrQuads);

      if (isCellAware) {
        // Apply cell-local dithering using the 4 chosen quad colors
        const cellBitmaps = ditherGigaCell(floatPixels, cellCol, cellY, cellHeight, 256, best.quadColors, cellDitherMethod);
        for (let dy = 0; dy < cellH; dy++) {
          const y = cellY + dy;
          const bitmapAddr = getBitmapOffset(y) + cellCol;
          result[bitmapAddr] = cellBitmaps.bitmap1[dy];
          result[frameSize + bitmapAddr] = cellBitmaps.bitmap2[dy];
        }
      } else {
        // Re-map already-dithered pixels to nearest of the 4 quad colors
        for (let dy = 0; dy < cellH; dy++) {
          const y = cellY + dy;
          let byte1 = 0, byte2 = 0;
          for (let dx = 0; dx < 8; dx++) {
            const x = cellCol * 8 + dx;
            const idx = (y * 256 + x) * 3;
            const bits = nearestGigaQuadBits(floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2], best.quadColors);
            if (bits.f1ink) byte1 |= (0x80 >> dx);
            if (bits.f2ink) byte2 |= (0x80 >> dx);
          }
          const bitmapAddr = getBitmapOffset(y) + cellCol;
          result[bitmapAddr] = byte1;
          result[frameSize + bitmapAddr] = byte2;
        }
      }

      // Write attribute bytes (one per frame)
      const attrOffset = 6144 + cellRow * 32 + cellCol;
      result[attrOffset] = best.attr1;
      result[frameSize + attrOffset] = best.attr2;
    }
  }

  return result;
}

/**
 * Convert source canvas to a chr$-style Gigascreen buffer at variable
 * dimensions. Output uses linear bitmap+attrs layout (matching ZXP / chr$
 * in-memory layout) rather than the ZX-interleaved layout used by
 * convertToGigascreen(). Two frames are concatenated:
 *   [bitmap1][attrs1][bitmap2][attrs2]
 * where bitmap is (w/8)*h bytes and attrs is (w/8)*ceil(h/8) bytes.
 * Cell height is always 8 (chr$ stores cell-aligned attrs).
 */
function convertToZxpGigascreen(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  updateColorDistanceMode();

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  applyImageAdjustments(pixels, w, h, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });
  const floatPixels = rgbaToFloat(pixels, w * h);

  const palette = getCombinedPalette();
  const allColors = [...palette.regular, ...palette.bright]; // 16 colors

  const attrQuads = precomputeGigaQuads(allColors);
  const blendedPalette = attrQuads.blendedPalette;

  const cellHeight = 8;
  const cellCols = w >> 3;
  const attrRows = Math.ceil(h / cellHeight);
  const bitmapSize = cellCols * h;
  const attrSize = cellCols * attrRows;
  const frameSize = bitmapSize + attrSize;
  const result = new Uint8Array(frameSize * 2);

  const isCellAware = dithering.startsWith('cell-');

  if (!isCellAware) {
    // Global dithering against the blended gigascreen palette
    const gigaDithering = mapCellDithering(dithering);
    applyGlobalDither(gigaDithering, floatPixels, w, h, blendedPalette);
  }

  const cellDitherMethod = isCellAware ? dithering.replace('cell-', '') : null;

  // Process each cell
  for (let cellRow = 0; cellRow < attrRows; cellRow++) {
    const cellY = cellRow * cellHeight;
    if (cellY >= h) break;
    const cellHActual = Math.min(cellHeight, h - cellY);

    for (let cellCol = 0; cellCol < cellCols; cellCol++) {
      const best = findGigaCellColors(floatPixels, cellCol, cellY, cellHeight, w, attrQuads, h);

      if (isCellAware) {
        const cellBitmaps = ditherGigaCell(floatPixels, cellCol, cellY, cellHeight, w, best.quadColors, cellDitherMethod, h);
        for (let dy = 0; dy < cellHActual; dy++) {
          const y = cellY + dy;
          const bitmapAddr = y * cellCols + cellCol; // linear (chr$/ZXP) layout
          result[bitmapAddr] = cellBitmaps.bitmap1[dy];
          result[frameSize + bitmapAddr] = cellBitmaps.bitmap2[dy];
        }
      } else {
        for (let dy = 0; dy < cellHActual; dy++) {
          const y = cellY + dy;
          let byte1 = 0, byte2 = 0;
          for (let dx = 0; dx < 8; dx++) {
            const x = cellCol * 8 + dx;
            const idx = (y * w + x) * 3;
            const bits = nearestGigaQuadBits(floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2], best.quadColors);
            if (bits.f1ink) byte1 |= (0x80 >> dx);
            if (bits.f2ink) byte2 |= (0x80 >> dx);
          }
          const bitmapAddr = y * cellCols + cellCol;
          result[bitmapAddr] = byte1;
          result[frameSize + bitmapAddr] = byte2;
        }
      }

      // Linear attribute layout (chr$/ZXP): attrs follow bitmap, no 6144 offset
      const attrOffset = bitmapSize + cellRow * cellCols + cellCol;
      result[attrOffset] = best.attr1;
      result[frameSize + attrOffset] = best.attr2;
    }
  }

  return result;
}

/**
 * Render a Gigascreen / MGH buffer to a canvas as a blended preview.
 * Output buffer layout matches convertToGigascreen().
 *
 * @param {Uint8Array} gigaData
 * @param {HTMLCanvasElement} canvas
 * @param {number} zoom
 * @param {number} cellHeight
 */
function renderGigascreenToCanvas(gigaData, canvas, zoom, cellHeight) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;

  const palette = getCombinedPalette();
  const allColors = [...palette.regular, ...palette.bright];

  const attrRows = Math.ceil(192 / cellHeight);
  const attrSize = attrRows * 32;
  const frameSize = 6144 + attrSize;

  const imageData = ctx.createImageData(256, 192);
  const data = imageData.data;

  for (let y = 0; y < 192; y++) {
    const cellRow = Math.floor(y / cellHeight);
    const bitmapOffset = getBitmapOffset(y);
    for (let col = 0; col < 32; col++) {
      const bm1 = gigaData[bitmapOffset + col];
      const bm2 = gigaData[frameSize + bitmapOffset + col];
      const attr1 = gigaData[6144 + cellRow * 32 + col];
      const attr2 = gigaData[frameSize + 6144 + cellRow * 32 + col];

      const ink1 = ((attr1 >> 6) & 1) * 8 + (attr1 & 7);
      const paper1 = ((attr1 >> 6) & 1) * 8 + ((attr1 >> 3) & 7);
      const ink2 = ((attr2 >> 6) & 1) * 8 + (attr2 & 7);
      const paper2 = ((attr2 >> 6) & 1) * 8 + ((attr2 >> 3) & 7);

      const c1Ink = allColors[ink1];
      const c1Paper = allColors[paper1];
      const c2Ink = allColors[ink2];
      const c2Paper = allColors[paper2];

      for (let bit = 0; bit < 8; bit++) {
        const x = col * 8 + bit;
        const mask = 0x80 >> bit;
        const useInk1 = (bm1 & mask) !== 0;
        const useInk2 = (bm2 & mask) !== 0;
        const f1 = useInk1 ? c1Ink : c1Paper;
        const f2 = useInk2 ? c2Ink : c2Paper;
        const r = (f1[0] + f2[0]) >> 1;
        const g = (f1[1] + f2[1]) >> 1;
        const b = (f1[2] + f2[2]) >> 1;
        const pixelIndex = (y * 256 + x) * 4;
        data[pixelIndex] = r;
        data[pixelIndex + 1] = g;
        data[pixelIndex + 2] = b;
        data[pixelIndex + 3] = 255;
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
 * Render a chr$-style Gigascreen buffer (linear bitmap+attrs, two frames)
 * at variable dimensions as a blended preview. Buffer layout matches
 * convertToZxpGigascreen():
 *   [bitmap1][attrs1][bitmap2][attrs2]
 *
 * @param {Uint8Array} gigaData
 * @param {HTMLCanvasElement} canvas
 * @param {number} zoom
 * @param {number} w
 * @param {number} h
 */
function renderZxpGigascreenToCanvas(gigaData, canvas, zoom, w, h) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = w * zoom;
  canvas.height = h * zoom;

  const palette = getCombinedPalette();
  const allColors = [...palette.regular, ...palette.bright];

  const cellHeight = 8;
  const cellCols = w >> 3;
  const attrRows = Math.ceil(h / cellHeight);
  const bitmapSize = cellCols * h;
  const attrSize = cellCols * attrRows;
  const frameSize = bitmapSize + attrSize;

  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y++) {
    const cellRow = Math.floor(y / cellHeight);
    const bitmapOffset = y * cellCols; // linear (chr$/ZXP) layout
    for (let col = 0; col < cellCols; col++) {
      const bm1 = gigaData[bitmapOffset + col];
      const bm2 = gigaData[frameSize + bitmapOffset + col];
      const attr1 = gigaData[bitmapSize + cellRow * cellCols + col];
      const attr2 = gigaData[frameSize + bitmapSize + cellRow * cellCols + col];

      const ink1 = ((attr1 >> 6) & 1) * 8 + (attr1 & 7);
      const paper1 = ((attr1 >> 6) & 1) * 8 + ((attr1 >> 3) & 7);
      const ink2 = ((attr2 >> 6) & 1) * 8 + (attr2 & 7);
      const paper2 = ((attr2 >> 6) & 1) * 8 + ((attr2 >> 3) & 7);

      const c1Ink = allColors[ink1];
      const c1Paper = allColors[paper1];
      const c2Ink = allColors[ink2];
      const c2Paper = allColors[paper2];

      for (let bit = 0; bit < 8; bit++) {
        const x = col * 8 + bit;
        const mask = 0x80 >> bit;
        const useInk1 = (bm1 & mask) !== 0;
        const useInk2 = (bm2 & mask) !== 0;
        const f1 = useInk1 ? c1Ink : c1Paper;
        const f2 = useInk2 ? c2Ink : c2Paper;
        const r = (f1[0] + f2[0]) >> 1;
        const g = (f1[1] + f2[1]) >> 1;
        const b = (f1[2] + f2[2]) >> 1;
        const pixelIndex = (y * w + x) * 4;
        data[pixelIndex] = r;
        data[pixelIndex + 1] = g;
        data[pixelIndex + 2] = b;
        data[pixelIndex + 3] = 255;
      }
    }
  }

  const temp = getImportTempCanvas(w, h);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, w * zoom, h * zoom);
  }
}

/**
 * Analyzes pre-adjusted RGB pixels and picks the HLR fill pattern preset
 * whose ink/paper partition minimizes within-group variance across all 8x8
 * cells. Called internally by convertToHlr() when no explicit pattern is
 * passed.
 *
 * @param {Float32Array} floatPixels  256x192 RGB float pixel data
 * @returns {Uint8Array} 8-byte pattern (a clone of the best preset)
 */
function findBestHlrPatternFromFloat(floatPixels) {
  const presets = (typeof HLR_PATTERN_PRESETS === 'object' && HLR_PATTERN_PRESETS) ? HLR_PATTERN_PRESETS : null;
  const fallback = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00]);
  if (!presets) return fallback;

  let bestPattern = fallback;
  let bestErr = Infinity;

  const keys = Object.keys(presets);
  for (let k = 0; k < keys.length; k++) {
    const pattern = presets[keys[k]];
    if (!pattern || pattern.length !== 8) continue;

    let totalVar = 0;

    for (let cellRow = 0; cellRow < 24; cellRow++) {
      const cellY = cellRow * 8;
      for (let cellCol = 0; cellCol < 32; cellCol++) {
        let nInk = 0, nPaper = 0;
        let sInkR = 0, sInkG = 0, sInkB = 0;
        let sInk2R = 0, sInk2G = 0, sInk2B = 0;
        let sPaperR = 0, sPaperG = 0, sPaperB = 0;
        let sPaper2R = 0, sPaper2G = 0, sPaper2B = 0;

        for (let dy = 0; dy < 8; dy++) {
          const row = pattern[dy] & 0xFF;
          const y = cellY + dy;
          for (let dx = 0; dx < 8; dx++) {
            const isInk = (row >> (7 - dx)) & 1;
            const x = cellCol * 8 + dx;
            const pi = (y * 256 + x) * 3;
            const r = floatPixels[pi];
            const g = floatPixels[pi + 1];
            const b = floatPixels[pi + 2];
            if (isInk) {
              sInkR += r; sInkG += g; sInkB += b;
              sInk2R += r * r; sInk2G += g * g; sInk2B += b * b;
              nInk++;
            } else {
              sPaperR += r; sPaperG += g; sPaperB += b;
              sPaper2R += r * r; sPaper2G += g * g; sPaper2B += b * b;
              nPaper++;
            }
          }
        }

        // variance = sum(x^2) - (sum(x))^2 / n
        if (nInk > 0) {
          totalVar += (sInk2R - (sInkR * sInkR) / nInk) +
                      (sInk2G - (sInkG * sInkG) / nInk) +
                      (sInk2B - (sInkB * sInkB) / nInk);
        }
        if (nPaper > 0) {
          totalVar += (sPaper2R - (sPaperR * sPaperR) / nPaper) +
                      (sPaper2G - (sPaperG * sPaperG) / nPaper) +
                      (sPaper2B - (sPaperB * sPaperB) / nPaper);
        }
      }
      if (totalVar >= bestErr) break; // early-out across rows
    }

    if (totalVar < bestErr) {
      bestErr = totalVar;
      bestPattern = pattern;
    }
  }

  return new Uint8Array(bestPattern);
}

/**
 * Resolves the HLR fill pattern currently selected in the import dialog's
 * pattern dropdown. Returns null when the user picked "Auto (best fit)", which
 * tells convertToHlr() to pick a pattern per image via findBestHlrPatternFromFloat.
 * @returns {Uint8Array|null}
 */
function getSelectedImportHlrPattern() {
  const key = importElements && importElements.hlrPattern ? importElements.hlrPattern.value : 'auto';
  if (!key || key === 'auto') return null;
  if (typeof hlrPatternFromPresetKey === 'function') {
    return hlrPatternFromPresetKey(key);
  }
  return null;
}

/**
 * Convert an image to an HLR (Gigascreen Lowres) buffer.
 *
 * HLR has a fixed 8-byte fill pattern replicated throughout the bitmap; only
 * attributes vary per cell. Each 8x8 cell uses two attribute bytes (one per
 * gigascreen frame). Cell pixels whose pattern bit is 1 see the blend of the
 * two ink colors; pixels whose pattern bit is 0 see the blend of the two
 * paper colors.
 *
 * The returned buffer is gigascreen-shaped (13824 bytes, two frames of 6912)
 * so it can be passed directly to renderGigascreenToCanvas() for preview.
 * The resolved 8-byte pattern is attached to the returned array as a
 * `hlrPattern` property so the caller can pack it into the .hlr file format.
 *
 * The `dithering` parameter is accepted for call-site uniformity with the
 * other converters but is unused: the HLR bitmap is fully determined by the
 * fill pattern so there is nothing to dither within a cell.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering  (unused)
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @param {Uint8Array|number[]|null} [patternBytes]  8-byte pattern, or null/undefined to auto-detect
 * @returns {Uint8Array} 13824-byte gigascreen-shaped buffer with `.hlrPattern` attached
 */
function convertToHlr(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, patternBytes) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');
  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;
  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });
  const floatPixels = rgbaToFloat(pixels, 256 * 192);

  const palette = getCombinedPalette();
  const allColors = [...palette.regular, ...palette.bright]; // 16 colors

  // Resolve fill pattern: explicit bytes or auto-detect from the adjusted image.
  let pattern;
  if (patternBytes && patternBytes.length === 8) {
    pattern = new Uint8Array(patternBytes);
  } else {
    pattern = findBestHlrPatternFromFloat(floatPixels);
  }

  // Gigascreen-shaped output: 2 frames of (6144 bitmap + 768 attrs).
  const frameSize = 6144 + 768;
  const result = new Uint8Array(frameSize * 2);

  // Fill both frames' bitmaps with the pattern (interleaved SCR bitmap layout).
  for (let y = 0; y < 192; y++) {
    const patByte = pattern[y & 7] & 0xFF;
    const bitmapAddr = getBitmapOffset(y);
    for (let col = 0; col < 32; col++) {
      result[bitmapAddr + col] = patByte;
      result[frameSize + bitmapAddr + col] = patByte;
    }
  }

  // Per-cell attribute search. For each 8x8 cell:
  //   1. Partition its 64 pixels into ink-position and paper-position groups
  //      based on the fill pattern.
  //   2. Compute the mean RGB of each group.
  //   3. Find the (bright1, bright2) combo plus (ink1, ink2) and (paper1, paper2)
  //      pairs whose blended colors are closest to the group means.
  // Ink and paper choices are independent given the two bright bits, so the
  // brute force is 4 * 2 * 64 = 512 candidates per cell.
  for (let cellRow = 0; cellRow < 24; cellRow++) {
    const cellY = cellRow * 8;
    for (let cellCol = 0; cellCol < 32; cellCol++) {
      let nInk = 0, nPaper = 0;
      let sumInkR = 0, sumInkG = 0, sumInkB = 0;
      let sumPaperR = 0, sumPaperG = 0, sumPaperB = 0;

      for (let dy = 0; dy < 8; dy++) {
        const row = pattern[dy] & 0xFF;
        const y = cellY + dy;
        for (let dx = 0; dx < 8; dx++) {
          const isInk = (row >> (7 - dx)) & 1;
          const x = cellCol * 8 + dx;
          const pi = (y * 256 + x) * 3;
          const r = floatPixels[pi];
          const g = floatPixels[pi + 1];
          const b = floatPixels[pi + 2];
          if (isInk) {
            sumInkR += r; sumInkG += g; sumInkB += b; nInk++;
          } else {
            sumPaperR += r; sumPaperG += g; sumPaperB += b; nPaper++;
          }
        }
      }

      const mInkR = nInk ? sumInkR / nInk : 0;
      const mInkG = nInk ? sumInkG / nInk : 0;
      const mInkB = nInk ? sumInkB / nInk : 0;
      const mPaperR = nPaper ? sumPaperR / nPaper : 0;
      const mPaperG = nPaper ? sumPaperG / nPaper : 0;
      const mPaperB = nPaper ? sumPaperB / nPaper : 0;

      let bestErr = Infinity, bestAttr1 = 0, bestAttr2 = 0;

      for (let b1 = 0; b1 < 2; b1++) {
        for (let b2 = 0; b2 < 2; b2++) {
          // Best (ink1, ink2) for this bright combo.
          let bestInkDist = Infinity, bi1 = 0, bi2 = 0;
          for (let i1 = 0; i1 < 8; i1++) {
            const c1 = allColors[b1 * 8 + i1];
            for (let i2 = 0; i2 < 8; i2++) {
              const c2 = allColors[b2 * 8 + i2];
              const br = (c1[0] + c2[0]) * 0.5;
              const bg = (c1[1] + c2[1]) * 0.5;
              const bb = (c1[2] + c2[2]) * 0.5;
              const dr = br - mInkR;
              const dg = bg - mInkG;
              const db = bb - mInkB;
              const d = dr * dr + dg * dg + db * db;
              if (d < bestInkDist) { bestInkDist = d; bi1 = i1; bi2 = i2; }
            }
          }

          // Best (paper1, paper2) for this bright combo.
          let bestPaperDist = Infinity, bp1 = 0, bp2 = 0;
          for (let p1 = 0; p1 < 8; p1++) {
            const c1 = allColors[b1 * 8 + p1];
            for (let p2 = 0; p2 < 8; p2++) {
              const c2 = allColors[b2 * 8 + p2];
              const br = (c1[0] + c2[0]) * 0.5;
              const bg = (c1[1] + c2[1]) * 0.5;
              const bb = (c1[2] + c2[2]) * 0.5;
              const dr = br - mPaperR;
              const dg = bg - mPaperG;
              const db = bb - mPaperB;
              const d = dr * dr + dg * dg + db * db;
              if (d < bestPaperDist) { bestPaperDist = d; bp1 = p1; bp2 = p2; }
            }
          }

          const combinedErr = nInk * bestInkDist + nPaper * bestPaperDist;
          if (combinedErr < bestErr) {
            bestErr = combinedErr;
            // ZX attr byte: bit 6 bright | bits 5-3 paper | bits 2-0 ink
            bestAttr1 = (b1 << 6) | (bp1 << 3) | bi1;
            bestAttr2 = (b2 << 6) | (bp2 << 3) | bi2;
          }
        }
      }

      const attrOffset = 6144 + cellRow * 32 + cellCol;
      result[attrOffset] = bestAttr1;
      result[frameSize + attrOffset] = bestAttr2;
    }
  }

  // Attach the resolved pattern so callers (doImport, tile import, etc.) can
  // pack the 1628-byte .hlr file and seed the internal Picture's .pattern.
  /** @type {any} */ (result).hlrPattern = pattern;
  return result;
}

/**
 * Packs a gigascreen-shaped HLR conversion buffer plus an 8-byte pattern into
 * the 1628-byte .hlr file format (84-byte Z80 loader + 8-byte pattern +
 * 768-byte attrs1 + 768-byte attrs2). Uses exportHlr() from picture_format.js
 * when available; otherwise constructs the file bytes locally.
 *
 * @param {Uint8Array} gigaData 13824-byte gigascreen-shaped buffer
 * @param {Uint8Array} pattern  8-byte fill pattern
 * @returns {Uint8Array} 1628-byte HLR file data
 */
function packHlrFileFromGiga(gigaData, pattern) {
  const HLR_SIZE = 1628;
  const HLR_PATTERN_OFFSET = 84;
  const HLR_ATTRS1_OFFSET = 92;
  const HLR_ATTRS2_OFFSET = 860;
  const ATTRS_SIZE = 768;
  const FRAME_SIZE = 6144 + 768;

  const out = new Uint8Array(HLR_SIZE);

  // Loader: try to copy from picture_format.js; fall back to zeros if missing.
  if (typeof HLR_LOADER !== 'undefined' && HLR_LOADER && HLR_LOADER.length === 84) {
    for (let i = 0; i < 84; i++) out[i] = HLR_LOADER[i];
  }

  for (let i = 0; i < 8; i++) out[HLR_PATTERN_OFFSET + i] = pattern[i] & 0xFF;
  for (let i = 0; i < ATTRS_SIZE; i++) {
    out[HLR_ATTRS1_OFFSET + i] = gigaData[6144 + i];
    out[HLR_ATTRS2_OFFSET + i] = gigaData[FRAME_SIZE + 6144 + i];
  }

  return out;
}

/**
 * Convert an image to an STL (Stellar) gigascreen-shaped buffer.
 *
 * STL has a fixed bitmap 0x0F for every byte: left 4 pixels = paper, right 4
 * pixels = ink. Each 8×4 multicolor cell has two attribute bytes (one per
 * gigascreen frame). The converter averages left-half and right-half pixel
 * colors to find the best (paper1,paper2) and (ink1,ink2) blended pairs.
 *
 * Returns a gigascreen-shaped buffer: [bm1(6144)][at1(1536)][bm2(6144)][at2(1536)]
 * = 15360 bytes, suitable for renderGigascreenToCanvas with cellH=4.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {number} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} 15360-byte gigascreen-shaped buffer
 */
function convertToStl(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');
  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;
  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });
  const floatPixels = rgbaToFloat(pixels, 256 * 192);

  const palette = getCombinedPalette();
  const allColors = [...palette.regular, ...palette.bright]; // 16 colors

  // Gigascreen-shaped output: 2 frames of (6144 bitmap + 1536 attrs).
  const attrSize = 1536; // 32 cols × 48 rows
  const frameSize = 6144 + attrSize; // 7680
  const result = new Uint8Array(frameSize * 2);

  // Fill both frames' bitmaps with fixed 0x0F (interleaved SCR bitmap layout).
  for (let y = 0; y < 192; y++) {
    const bitmapAddr = getBitmapOffset(y);
    for (let col = 0; col < 32; col++) {
      result[bitmapAddr + col] = 0x0F;
      result[frameSize + bitmapAddr + col] = 0x0F;
    }
  }

  // Per-cell attribute search: 8×4 multicolor cells (32 cols × 48 rows).
  // For each cell, left 4 pixels = paper positions, right 4 pixels = ink positions.
  for (let cellRow = 0; cellRow < 48; cellRow++) {
    const cellY = cellRow * 4;
    for (let cellCol = 0; cellCol < 32; cellCol++) {
      let nInk = 0, nPaper = 0;
      let sumInkR = 0, sumInkG = 0, sumInkB = 0;
      let sumPaperR = 0, sumPaperG = 0, sumPaperB = 0;

      for (let dy = 0; dy < 4; dy++) {
        const y = cellY + dy;
        for (let dx = 0; dx < 8; dx++) {
          const isInk = dx >= 4; // 0x0F: bits 0-3 set (right half = ink)
          const x = cellCol * 8 + dx;
          const pi = (y * 256 + x) * 3;
          const r = floatPixels[pi];
          const g = floatPixels[pi + 1];
          const b = floatPixels[pi + 2];
          if (isInk) {
            sumInkR += r; sumInkG += g; sumInkB += b; nInk++;
          } else {
            sumPaperR += r; sumPaperG += g; sumPaperB += b; nPaper++;
          }
        }
      }

      const mInkR = nInk ? sumInkR / nInk : 0;
      const mInkG = nInk ? sumInkG / nInk : 0;
      const mInkB = nInk ? sumInkB / nInk : 0;
      const mPaperR = nPaper ? sumPaperR / nPaper : 0;
      const mPaperG = nPaper ? sumPaperG / nPaper : 0;
      const mPaperB = nPaper ? sumPaperB / nPaper : 0;

      let bestErr = Infinity, bestAttr1 = 0, bestAttr2 = 0;

      for (let b1 = 0; b1 < 2; b1++) {
        for (let b2 = 0; b2 < 2; b2++) {
          let bestInkDist = Infinity, bi1 = 0, bi2 = 0;
          for (let i1 = 0; i1 < 8; i1++) {
            const c1 = allColors[b1 * 8 + i1];
            for (let i2 = 0; i2 < 8; i2++) {
              const c2 = allColors[b2 * 8 + i2];
              const br = (c1[0] + c2[0]) * 0.5;
              const bg = (c1[1] + c2[1]) * 0.5;
              const bb = (c1[2] + c2[2]) * 0.5;
              const dr = br - mInkR;
              const dg = bg - mInkG;
              const db = bb - mInkB;
              const d = dr * dr + dg * dg + db * db;
              if (d < bestInkDist) { bestInkDist = d; bi1 = i1; bi2 = i2; }
            }
          }

          let bestPaperDist = Infinity, bp1 = 0, bp2 = 0;
          for (let p1 = 0; p1 < 8; p1++) {
            const c1 = allColors[b1 * 8 + p1];
            for (let p2 = 0; p2 < 8; p2++) {
              const c2 = allColors[b2 * 8 + p2];
              const br = (c1[0] + c2[0]) * 0.5;
              const bg = (c1[1] + c2[1]) * 0.5;
              const bb = (c1[2] + c2[2]) * 0.5;
              const dr = br - mPaperR;
              const dg = bg - mPaperG;
              const db = bb - mPaperB;
              const d = dr * dr + dg * dg + db * db;
              if (d < bestPaperDist) { bestPaperDist = d; bp1 = p1; bp2 = p2; }
            }
          }

          const combinedErr = nInk * bestInkDist + nPaper * bestPaperDist;
          if (combinedErr < bestErr) {
            bestErr = combinedErr;
            bestAttr1 = (b1 << 6) | (bp1 << 3) | bi1;
            bestAttr2 = (b2 << 6) | (bp2 << 3) | bi2;
          }
        }
      }

      const attrOffset = 6144 + cellRow * 32 + cellCol;
      result[attrOffset] = bestAttr1;
      result[frameSize + attrOffset] = bestAttr2;
    }
  }

  return result;
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

  // Compute ink ratio from pattern (count set bits across all 8 bytes / 64)
  let inkBitCount = 0;
  for (let py = 0; py < 8; py++) {
    const patternByte = patternArray[py];
    for (let px = 0; px < 8; px++) {
      if (patternByte & (1 << (7 - px))) inkBitCount++;
    }
  }
  const inkRatio = inkBitCount / 64;

  // Process each 8x8 character cell
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 32; col++) {
      const cellX = col * 8;
      const cellY = row * 8;

      // Compute overall cell average color (all 64 pixels)
      let totalR = 0, totalG = 0, totalB = 0;

      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const pixelIdx = ((cellY + py) * 256 + (cellX + px)) * 4;
          totalR += pixels[pixelIdx];
          totalG += pixels[pixelIdx + 1];
          totalB += pixels[pixelIdx + 2];
        }
      }

      const cellAvg = [totalR / 64, totalG / 64, totalB / 64];

      // Find best ink/paper pair whose pattern-blended color is closest to cell average
      // Paper rule is NOT applied for 53c: this format has no per-cell bitmap to invert,
      // so swapping ink/paper without inverting the pattern would change the visual output.
      let bestInkIdx = 0, bestPaperIdx = 0, bestBright = 0;
      let bestTotalDist = Infinity;

      for (let bright = 0; bright <= 1; bright++) {
        const palette = bright ? combinedPalette.bright : combinedPalette.regular;

        for (let inkIdx = 0; inkIdx < 8; inkIdx++) {
          for (let paperIdx = 0; paperIdx < 8; paperIdx++) {
            const blended = [
              palette[inkIdx][0] * inkRatio + palette[paperIdx][0] * (1 - inkRatio),
              palette[inkIdx][1] * inkRatio + palette[paperIdx][1] * (1 - inkRatio),
              palette[inkIdx][2] * inkRatio + palette[paperIdx][2] * (1 - inkRatio)
            ];
            const dist = colorDistance(blended, cellAvg);

            if (dist < bestTotalDist) {
              bestTotalDist = dist;
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
 * Convert image to SPECSCII format (32×24 character grid).
 * For each 8×8 cell, finds best ink/paper via findCellColors(), then tests
 * all 112 characters (96 ROM font 0x20-0x7F + 16 block graphics 0x80-0x8F)
 * picking the glyph whose pixel pattern minimizes total color distance.
 *
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas (256×192)
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} [saturation=0]
 * @param {number} [gamma=1.0]
 * @param {boolean} [grayscale=false]
 * @param {number} [sharpness=0]
 * @param {number} [smoothing=0]
 * @param {number} [blackPoint=0]
 * @param {number} [whitePoint=255]
 * @param {number} [balanceR=0]
 * @param {number} [balanceG=0]
 * @param {number} [balanceB=0]
 * @returns {{stream: Uint8Array, charGrid: Uint8Array, attrGrid: Uint8Array, mask: Uint8Array}}
 */
function convertToSpecscii(sourceCanvas, brightness, contrast, saturation = 0, gamma = 1.0, grayscale = false, sharpness = 0, smoothing = 0, blackPoint = 0, whitePoint = 255, balanceR = 0, balanceG = 0, balanceB = 0, charset = 'full') {
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 256, 192);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, 256, 192, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  const floatPixels = rgbaToFloat(pixels, 256 * 192);
  const palette = getCombinedPalette();

  // Prepare font glyph bitmaps based on charset selection
  // Each entry: { code, rows[8] } where rows[i] is a byte (MSB=left)
  const glyphs = [];

  // ROM font characters 0x20-0x7F (included in 'full' and 'ascii' modes)
  if (charset === 'full' || charset === 'ascii') {
    for (let code = 0x20; code <= 0x7F; code++) {
      const glyphIndex = code - 0x20;
      const offset = glyphIndex * 8;
      const rows = new Uint8Array(8);
      for (let line = 0; line < 8; line++) {
        rows[line] = (typeof fontData !== 'undefined' && offset + line < fontData.length) ? fontData[offset + line] : 0;
      }
      glyphs.push({ code, rows });
    }
  }

  // Block graphics characters 0x80-0x8F (included in 'full' and 'udg' modes)
  if (charset === 'full' || charset === 'udg') {
    // In UDG-only mode, include space (0x20) as a solid-color fallback
    if (charset === 'udg') {
      const rows = new Uint8Array(8);
      for (let line = 0; line < 8; line++) {
        rows[line] = (typeof fontData !== 'undefined' && line < fontData.length) ? fontData[line] : 0;
      }
      glyphs.push({ code: 0x20, rows });
    }
    for (let code = 0x80; code <= 0x8F; code++) {
      const pattern = code & 0x0F;
      const rows = new Uint8Array(8);
      for (let line = 0; line < 8; line++) {
        const inTop = line < 4;
        let rowByte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const inLeft = bit < 4;
          let isSet = false;
          if (inTop && inLeft) isSet = (pattern & 0x02) !== 0;
          else if (inTop && !inLeft) isSet = (pattern & 0x01) !== 0;
          else if (!inTop && inLeft) isSet = (pattern & 0x08) !== 0;
          else isSet = (pattern & 0x04) !== 0;
          if (isSet) rowByte |= (0x80 >> bit);
        }
        rows[line] = rowByte;
      }
      glyphs.push({ code, rows });
    }
  }

  const charGrid = new Uint8Array(768);
  const attrGrid = new Uint8Array(768);
  const mask = new Uint8Array(768);

  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      const colors = findCellColors(floatPixels, cellX, cellY, 256, palette);
      const inkRgb = colors.inkRgb;
      const paperRgb = colors.paperRgb;

      // Precompute source pixel colors for this cell (64 pixels × RGB)
      const cellPixels = new Array(64);
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = cellX * 8 + dx;
          const py = cellY * 8 + dy;
          const idx = (py * 256 + px) * 3;
          cellPixels[dy * 8 + dx] = [floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2]];
        }
      }

      // Precompute per-pixel distance to ink and paper
      const inkDists = new Float64Array(64);
      const paperDists = new Float64Array(64);
      for (let i = 0; i < 64; i++) {
        inkDists[i] = colorDistance(cellPixels[i], inkRgb);
        paperDists[i] = colorDistance(cellPixels[i], paperRgb);
      }

      // Try all 112 glyphs, pick the one with lowest total error
      let bestCode = 0x20;
      let bestError = Infinity;

      for (let g = 0; g < glyphs.length; g++) {
        const glyph = glyphs[g];
        let totalError = 0;

        for (let line = 0; line < 8; line++) {
          const rowByte = glyph.rows[line];
          const lineOff = line * 8;
          for (let bit = 0; bit < 8; bit++) {
            const isInk = (rowByte & (0x80 >> bit)) !== 0;
            totalError += isInk ? inkDists[lineOff + bit] : paperDists[lineOff + bit];
          }
        }

        if (totalError < bestError) {
          bestError = totalError;
          bestCode = glyph.code;
        }
      }

      // Check if a single solid color gives lower error than the best character.
      // findCellColors() picks ink/paper assuming free per-pixel assignment, but
      // character shapes constrain which pixels get ink vs paper. For near-uniform
      // cells (thick lines, solid backgrounds), no character pattern matches well
      // and letters appear as artifacts. A solid fill avoids this.
      let useSolid = false;
      let solidColorIdx = 0;
      let solidBright = false;

      for (let bright = 0; bright <= 1; bright++) {
        const pal = bright ? palette.bright : palette.regular;
        for (let c = 0; c < 8; c++) {
          let totalDist = 0;
          for (let i = 0; i < 64; i++) {
            totalDist += colorDistance(cellPixels[i], pal[c]);
          }
          if (totalDist < bestError) {
            bestError = totalDist;
            solidColorIdx = c;
            solidBright = bright === 1;
            useSolid = true;
          }
        }
      }

      const idx = cellY * 32 + cellX;
      if (useSolid) {
        charGrid[idx] = 0x20;
        attrGrid[idx] = (solidBright ? 0x40 : 0) | (solidColorIdx << 3) | solidColorIdx;
      } else {
        charGrid[idx] = bestCode;
        attrGrid[idx] = (colors.bright ? 0x40 : 0) | (colors.paper << 3) | colors.ink;
      }
      mask[idx] = 1;
    }
  }

  // Serialize to SPECSCII stream via globals
  const savedChar = typeof specsciiCharGrid !== 'undefined' ? specsciiCharGrid : null;
  const savedAttr = typeof specsciiAttrGrid !== 'undefined' ? specsciiAttrGrid : null;
  const savedMask = typeof specsciiMask !== 'undefined' ? specsciiMask : null;

  specsciiCharGrid = charGrid;
  specsciiAttrGrid = attrGrid;
  specsciiMask = mask;

  const stream = (typeof specsciiGridsToStream === 'function') ? specsciiGridsToStream() : new Uint8Array(0);

  specsciiCharGrid = savedChar;
  specsciiAttrGrid = savedAttr;
  specsciiMask = savedMask;

  return { stream, charGrid, attrGrid, mask };
}

/**
 * Render SPECSCII character grid to a canvas for import preview.
 * Uses fontData for ROM glyphs and block graphics patterns, same as the editor renderer.
 *
 * @param {Uint8Array} charGrid - 768-byte character code grid
 * @param {Uint8Array} attrGrid - 768-byte attribute grid
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} [zoom=2] - Zoom factor
 */
function renderSpecsciiToCanvas(charGrid, attrGrid, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 256 * zoom;
  canvas.height = 192 * zoom;

  const imgData = ctx.createImageData(256, 192);
  const imgPixels = imgData.data;
  const palette = getCombinedPalette();

  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      const idx = cellY * 32 + cellX;
      const attr = attrGrid[idx];
      const charCode = charGrid[idx];

      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr & 0x40) !== 0;
      const pal = bright ? palette.bright : palette.regular;
      const inkRgb = pal[ink];
      const paperRgb = pal[paper];

      const px = cellX * 8;
      const py = cellY * 8;

      if (charCode >= 0x20 && charCode <= 0x7F) {
        // ROM font character
        const glyphIndex = charCode - 0x20;
        const glyphOffset = glyphIndex * 8;
        for (let line = 0; line < 8; line++) {
          const glyphByte = (typeof fontData !== 'undefined' && glyphOffset + line < fontData.length) ? fontData[glyphOffset + line] : 0;
          for (let bit = 0; bit < 8; bit++) {
            const isSet = (glyphByte & (0x80 >> bit)) !== 0;
            const rgb = isSet ? inkRgb : paperRgb;
            const off = ((py + line) * 256 + (px + bit)) * 4;
            imgPixels[off] = rgb[0];
            imgPixels[off + 1] = rgb[1];
            imgPixels[off + 2] = rgb[2];
            imgPixels[off + 3] = 255;
          }
        }
      } else if (charCode >= 0x80) {
        // Block graphics character
        const pattern = charCode & 0x0F;
        for (let line = 0; line < 8; line++) {
          const inTop = line < 4;
          for (let bit = 0; bit < 8; bit++) {
            const inLeft = bit < 4;
            let isSet = false;
            if (inTop && inLeft) isSet = (pattern & 0x02) !== 0;
            else if (inTop && !inLeft) isSet = (pattern & 0x01) !== 0;
            else if (!inTop && inLeft) isSet = (pattern & 0x08) !== 0;
            else isSet = (pattern & 0x04) !== 0;
            const rgb = isSet ? inkRgb : paperRgb;
            const off = ((py + line) * 256 + (px + bit)) * 4;
            imgPixels[off] = rgb[0];
            imgPixels[off + 1] = rgb[1];
            imgPixels[off + 2] = rgb[2];
            imgPixels[off + 3] = 255;
          }
        }
      } else {
        // Unknown char, render as paper
        for (let line = 0; line < 8; line++) {
          for (let bit = 0; bit < 8; bit++) {
            const off = ((py + line) * 256 + (px + bit)) * 4;
            imgPixels[off] = paperRgb[0];
            imgPixels[off + 1] = paperRgb[1];
            imgPixels[off + 2] = paperRgb[2];
            imgPixels[off + 3] = 255;
          }
        }
      }
    }
  }

  const temp = getImportTempCanvas(256, 192);
  if (temp) {
    temp.ctx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 256 * zoom, 192 * zoom);
  }
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
  updateColorDistanceMode();

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const imageData = ctx.getImageData(0, 0, 384, 304);
  const pixels = imageData.data;

  applyImageAdjustments(pixels, 384, 304, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

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
  // Then enforce 24-pixel minimum run length for interior segments
  const encodeFullBorderLine = (y) => {
    // 384 pixels = 48 segments of 8px each
    // Calculate best color per 8px cell
    const segColors = new Array(48);
    for (let seg = 0; seg < 48; seg++) {
      segColors[seg] = findNearestBorderColor(getBlockAverageColor(pixels, 384, seg * 8, y, 8), regularPalette);
    }

    // Enforce 24px (3-cell) minimum run length for interior segments (3-44).
    // Edge segments 0-2 and 45-47 can be any width (they touch frame/paper edge).
    // A short interior run is OK if it touches an edge segment of the same color
    // (the combined run across the boundary counts).
    // Merge remaining short runs into their longer neighbor; repeat until stable.
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 3; i < 45; ) {
        const color = segColors[i];
        let runEnd = i + 1;
        while (runEnd < 45 && segColors[runEnd] === color) runEnd++;
        const runLen = runEnd - i;
        if (runLen < 3) {
          // Count how far this color extends into edge/neighbor territory
          let totalLen = runLen;
          for (let j = i - 1; j >= 0 && segColors[j] === color; j--) totalLen++;
          for (let j = runEnd; j < 48 && segColors[j] === color; j++) totalLen++;
          if (totalLen < 3) {
            // Truly short — merge into the longer neighbor
            const prevColor = segColors[i - 1];
            const nextColor = runEnd < 45 ? segColors[runEnd] : segColors[44];
            let prevLen = 0;
            for (let j = i - 1; j >= 0 && segColors[j] === prevColor; j--) prevLen++;
            let nextLen = 0;
            for (let j = runEnd; j < 48 && segColors[j] === nextColor; j++) nextLen++;
            const mergeColor = prevLen >= nextLen ? prevColor : nextColor;
            for (let j = i; j < runEnd; j++) segColors[j] = mergeColor;
            changed = true;
          }
        }
        i = runEnd;
      }
    }

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

        // Apply paper color rule
        const ruled = applyPaperRule(colors, bitmap);

        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = ruled.bitmap[line];
        }

        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = (ruled.colors.paper << 3) | ruled.colors.ink;
        if (ruled.colors.bright) attr |= 0x40;
        scr[attrOffset] = attr;
      }
    }
  } else {
    // Traditional global dithering
    // For mono output, use only black and white
    const ditherPalette = monoOutput ? [palette.bright[0], palette.bright[7]] : fullPalette;

    applyGlobalDither(dithering, floatPixels, 256, 192, ditherPalette);

    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        const cell = monoOutput
          ? analyzeCellMono(floatPixels, cellX, cellY, 256, palette.bright[0], palette.bright[7])
          : analyzeCell(floatPixels, cellX, cellY, 256);

        // Apply paper color rule (skip for mono)
        const ruled = monoOutput ? { colors: cell, bitmap: cell.bitmap } : applyPaperRule(cell, cell.bitmap);

        for (let line = 0; line < 8; line++) {
          const y = cellY * 8 + line;
          const offset = getBitmapOffset(y) + cellX;
          scr[offset] = ruled.bitmap[line];
        }

        const attrOffset = 6144 + cellY * 32 + cellX;
        let attr = monoOutput ? ((7 << 3) | 0 | 0x40) : ((ruled.colors.paper << 3) | ruled.colors.ink | (ruled.colors.bright ? 0x40 : 0));
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
 * Render ZXP data to a canvas (linear bitmap + attributes, parametric dimensions)
 * @param {Uint8Array} zxpData - ZXP data (bitmap + attributes)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom factor
 * @param {number} w - Pixel width
 * @param {number} h - Pixel height
 */
function renderZxpToCanvas(zxpData, canvas, zoom, w, h, attrCellH) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Cap zoom so canvas dimensions don't exceed 2048px
  const maxDim = 2048;
  const effectiveZoom = Math.max(1, Math.min(zoom, Math.floor(maxDim / Math.max(w, h))) || 1);

  canvas.width = w * effectiveZoom;
  canvas.height = h * effectiveZoom;

  const cols = w >> 3;
  if (!attrCellH) attrCellH = 8;
  const bitmapSize = cols * h;

  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;
  const palette = getCombinedPalette();

  for (let y = 0; y < h; y++) {
    const attrRow = Math.floor(y / attrCellH);
    for (let x = 0; x < w; x++) {
      const col = x >> 3;
      const bitPos = x & 7;
      const byte = zxpData[y * cols + col];
      const attr = zxpData[bitmapSize + attrRow * cols + col];

      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr & 0x40) !== 0;

      const pal = bright ? palette.bright : palette.regular;
      const isInk = (byte & (0x80 >> bitPos)) !== 0;
      const color = isInk ? pal[ink] : pal[paper];

      const idx = (y * w + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(w, h);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, w * effectiveZoom, h * effectiveZoom);
  }
}

/**
 * Render ZXP ULA+ data to a canvas (linear bitmap + attrs + 64-byte palette).
 * @param {Uint8Array} zxpData - ZXP ULA+ data (bitmap + attrs + 64 palette)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom factor
 * @param {number} w - Pixel width
 * @param {number} h - Pixel height
 */
function renderZxpUlaPlusToCanvas(zxpData, canvas, zoom, w, h) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const maxDim = 2048;
  const effectiveZoom = Math.max(1, Math.min(zoom, Math.floor(maxDim / Math.max(w, h))) || 1);

  canvas.width = w * effectiveZoom;
  canvas.height = h * effectiveZoom;

  const cols = w >> 3;
  const attrCellH = 8;
  const attrRows = Math.ceil(h / attrCellH);
  const bitmapSize = cols * h;
  const attrSize = cols * attrRows;
  const palette = zxpData.subarray(bitmapSize + attrSize, bitmapSize + attrSize + 64);

  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;

  for (let y = 0; y < h; y++) {
    const attrRow = Math.floor(y / attrCellH);
    for (let x = 0; x < w; x++) {
      const col = x >> 3;
      const bitPos = x & 7;
      const byte = zxpData[y * cols + col];
      const attr = zxpData[bitmapSize + attrRow * cols + col];

      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr >> 6) & 1;
      const flash = (attr >> 7) & 1;
      const clut = (flash << 1) | bright;

      const isInk = (byte & (0x80 >> bitPos)) !== 0;
      const colorIdx = clut * 16 + (isInk ? ink : (8 + paper));
      const grb = palette[colorIdx];
      const color = grb332ToRgb(grb);

      const idx = (y * w + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(w, h);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, w * effectiveZoom, h * effectiveZoom);
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
 * Render BMC4 data to a canvas (8×4 multicolor attributes with border)
 */
function renderBmc4ToCanvas(bmc4Data, canvas, zoom = 2) {
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

      const idx = ((y + 64) * 384 + (x + 64)) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  // Render borders using regular palette only
  const regularPalette = palette.regular;
  let borderOffset = 7680;

  // Top border: 64 lines
  for (let y = 0; y < 64; y++) {
    for (let bx = 0; bx < 24; bx++) {
      const byte = bmc4Data[borderOffset++];
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
      const byte = bmc4Data[borderOffset++];
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
      const byte = bmc4Data[borderOffset++];
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
      const byte = bmc4Data[borderOffset++];
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

  const temp = getImportTempCanvas(384, 304);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, 384 * zoom, 304 * zoom);
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
// NXI / SL2 (ZX Spectrum Next Layer 2 — 256-color indexed, 256×192)
// ============================================================================

/**
 * Shared quantization helper for NXI/SL2 formats.
 * Applies image adjustments, builds palette, dithers pixels.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @param {boolean} optimizePalette - true: pick best 256 from RGB333; false: use default RGB332
 * @returns {{palette: number[][], paletteR3: Uint8Array, paletteG3: Uint8Array, paletteB3: Uint8Array, pixels: Uint8Array}}
 */
function quantizeNextPixels(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, optimizePalette) {
  const W = 256, H = 192;
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return { palette: [], paletteR3: new Uint8Array(256), paletteG3: new Uint8Array(256), paletteB3: new Uint8Array(256), pixels: new Uint8Array(W * H) };

  const imageData = ctx.getImageData(0, 0, W, H);
  const src = imageData.data;

  // Apply adjustments
  applyImageAdjustments(src, W, H, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  // Build palette
  const palette = new Array(256);
  const palR3 = new Uint8Array(256);
  const palG3 = new Uint8Array(256);
  const palB3 = new Uint8Array(256);

  if (optimizePalette) {
    // Count which RGB333 colors appear in the image (512 possible)
    const rgb333Count = new Uint32Array(512);
    for (let i = 0; i < W * H; i++) {
      const r3 = Math.min(7, Math.round(src[i * 4] * 7 / 255));
      const g3 = Math.min(7, Math.round(src[i * 4 + 1] * 7 / 255));
      const b3 = Math.min(7, Math.round(src[i * 4 + 2] * 7 / 255));
      rgb333Count[(r3 << 6) | (g3 << 3) | b3]++;
    }
    // Pick the 256 most frequent RGB333 colors
    const ranked = Array.from({ length: 512 }, (_, i) => i);
    ranked.sort((a, b) => rgb333Count[b] - rgb333Count[a]);
    for (let p = 0; p < 256; p++) {
      const c = ranked[p];
      const r3 = (c >> 6) & 7;
      const g3 = (c >> 3) & 7;
      const b3 = c & 7;
      palR3[p] = r3;
      palG3[p] = g3;
      palB3[p] = b3;
      palette[p] = [
        Math.round(r3 * 255 / 7),
        Math.round(g3 * 255 / 7),
        Math.round(b3 * 255 / 7)
      ];
    }
  } else {
    // Default RGB332 identity palette
    for (let i = 0; i < 256; i++) {
      const r3 = (i >> 5) & 7;
      const g3 = (i >> 2) & 7;
      const b2 = i & 3;
      const b3 = (b2 << 1) | (b2 >> 1);
      palR3[i] = r3;
      palG3[i] = g3;
      palB3[i] = b3;
      palette[i] = [
        Math.round(r3 * 255 / 7),
        Math.round(g3 * 255 / 7),
        Math.round(b3 * 255 / 7)
      ];
    }
  }

  // Find nearest palette entry
  function findNearest(r, g, b) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < 256; i++) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    return bestIdx;
  }

  // Working copy for dithering (float)
  const work = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    work[i * 3] = src[i * 4];
    work[i * 3 + 1] = src[i * 4 + 1];
    work[i * 3 + 2] = src[i * 4 + 2];
  }

  const pixels = new Uint8Array(W * H);
  const useDither = dithering !== 'none' && dithering !== 'ordered' && dithering !== 'ordered8';

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const r = Math.max(0, Math.min(255, Math.round(work[idx * 3])));
      const g = Math.max(0, Math.min(255, Math.round(work[idx * 3 + 1])));
      const b = Math.max(0, Math.min(255, Math.round(work[idx * 3 + 2])));

      const palIdx = findNearest(r, g, b);
      pixels[idx] = palIdx;

      if (useDither) {
        const er = r - palette[palIdx][0];
        const eg = g - palette[palIdx][1];
        const eb = b - palette[palIdx][2];
        // Floyd-Steinberg error diffusion
        if (x + 1 < W) {
          const n = idx + 1;
          work[n * 3] += er * 7 / 16;
          work[n * 3 + 1] += eg * 7 / 16;
          work[n * 3 + 2] += eb * 7 / 16;
        }
        if (y + 1 < H) {
          if (x > 0) {
            const n = idx + W - 1;
            work[n * 3] += er * 3 / 16;
            work[n * 3 + 1] += eg * 3 / 16;
            work[n * 3 + 2] += eb * 3 / 16;
          }
          {
            const n = idx + W;
            work[n * 3] += er * 5 / 16;
            work[n * 3 + 1] += eg * 5 / 16;
            work[n * 3 + 2] += eb * 5 / 16;
          }
          if (x + 1 < W) {
            const n = idx + W + 1;
            work[n * 3] += er * 1 / 16;
            work[n * 3 + 1] += eg * 1 / 16;
            work[n * 3 + 2] += eb * 1 / 16;
          }
        }
      }
    }
  }

  return { palette, paletteR3: palR3, paletteG3: palG3, paletteB3: palB3, pixels };
}

/**
 * Shared quantization helper for NXI/SL2 extended modes (320×256 8bpp, 640×256 4bpp).
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} W - Target width
 * @param {number} H - Target height
 * @param {number} paletteSize - 256 for 8bpp, 16 for 4bpp
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @param {boolean} optimizePalette
 * @returns {{palette: number[][], paletteR3: Uint8Array, paletteG3: Uint8Array, paletteB3: Uint8Array, pixels: Uint8Array}}
 */
function quantizeNextPixelsExt(sourceCanvas, W, H, paletteSize, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, optimizePalette) {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return { palette: [], paletteR3: new Uint8Array(paletteSize), paletteG3: new Uint8Array(paletteSize), paletteB3: new Uint8Array(paletteSize), pixels: new Uint8Array(W * H) };

  const imageData = ctx.getImageData(0, 0, W, H);
  const src = imageData.data;

  applyImageAdjustments(src, W, H, { brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB });

  const palette = new Array(paletteSize);
  const palR3 = new Uint8Array(paletteSize);
  const palG3 = new Uint8Array(paletteSize);
  const palB3 = new Uint8Array(paletteSize);

  if (optimizePalette) {
    const rgb333Count = new Uint32Array(512);
    for (let i = 0; i < W * H; i++) {
      const r3 = Math.min(7, Math.round(src[i * 4] * 7 / 255));
      const g3 = Math.min(7, Math.round(src[i * 4 + 1] * 7 / 255));
      const b3 = Math.min(7, Math.round(src[i * 4 + 2] * 7 / 255));
      rgb333Count[(r3 << 6) | (g3 << 3) | b3]++;
    }
    const ranked = Array.from({ length: 512 }, (_, i) => i);
    ranked.sort((a, b) => rgb333Count[b] - rgb333Count[a]);
    for (let p = 0; p < paletteSize; p++) {
      const c = ranked[p];
      const r3 = (c >> 6) & 7;
      const g3 = (c >> 3) & 7;
      const b3 = c & 7;
      palR3[p] = r3;
      palG3[p] = g3;
      palB3[p] = b3;
      palette[p] = [Math.round(r3 * 255 / 7), Math.round(g3 * 255 / 7), Math.round(b3 * 255 / 7)];
    }
  } else {
    // Default RGB332 identity palette (for 256 entries) or first 16 for 4bpp
    for (let i = 0; i < paletteSize; i++) {
      const r3 = (i >> 5) & 7;
      const g3 = (i >> 2) & 7;
      const b2 = i & 3;
      const b3 = (b2 << 1) | (b2 >> 1);
      palR3[i] = r3;
      palG3[i] = g3;
      palB3[i] = b3;
      palette[i] = [Math.round(r3 * 255 / 7), Math.round(g3 * 255 / 7), Math.round(b3 * 255 / 7)];
    }
  }

  function findNearest(r, g, b) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < paletteSize; i++) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    return bestIdx;
  }

  const work = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    work[i * 3] = src[i * 4];
    work[i * 3 + 1] = src[i * 4 + 1];
    work[i * 3 + 2] = src[i * 4 + 2];
  }

  const pixels = new Uint8Array(W * H);
  const useDither = dithering !== 'none' && dithering !== 'ordered' && dithering !== 'ordered8';

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const r = Math.max(0, Math.min(255, Math.round(work[idx * 3])));
      const g = Math.max(0, Math.min(255, Math.round(work[idx * 3 + 1])));
      const b = Math.max(0, Math.min(255, Math.round(work[idx * 3 + 2])));

      const palIdx = findNearest(r, g, b);
      pixels[idx] = palIdx;

      if (useDither) {
        const er = r - palette[palIdx][0];
        const eg = g - palette[palIdx][1];
        const eb = b - palette[palIdx][2];
        if (x + 1 < W) {
          const n = idx + 1;
          work[n * 3] += er * 7 / 16;
          work[n * 3 + 1] += eg * 7 / 16;
          work[n * 3 + 2] += eb * 7 / 16;
        }
        if (y + 1 < H) {
          if (x > 0) {
            const n = idx + W - 1;
            work[n * 3] += er * 3 / 16;
            work[n * 3 + 1] += eg * 3 / 16;
            work[n * 3 + 2] += eb * 3 / 16;
          }
          {
            const n = idx + W;
            work[n * 3] += er * 5 / 16;
            work[n * 3 + 1] += eg * 5 / 16;
            work[n * 3 + 2] += eb * 5 / 16;
          }
          if (x + 1 < W) {
            const n = idx + W + 1;
            work[n * 3] += er * 1 / 16;
            work[n * 3 + 1] += eg * 1 / 16;
            work[n * 3 + 2] += eb * 1 / 16;
          }
        }
      }
    }
  }

  return { palette, paletteR3: palR3, paletteG3: palG3, paletteB3: palB3, pixels };
}

/**
 * Convert source canvas to NXI 320×256 format (512-byte palette + 81920 column-major pixels).
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} NXI data (82432 bytes)
 */
function convertToNxi320(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const W = 320, H = 256;
  const q = quantizeNextPixelsExt(sourceCanvas, W, H, 256, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, true);

  const nxi = new Uint8Array(512 + W * H);
  // Write palette (256 entries, RGB333)
  for (let i = 0; i < 256; i++) {
    const r3 = q.paletteR3[i], g3 = q.paletteG3[i], b3 = q.paletteB3[i];
    nxi[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxi[i * 2 + 1] = b3 & 1;
  }
  // Write pixels in column-major order: address = x * 256 + y
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      nxi[512 + x * 256 + y] = q.pixels[y * W + x];
    }
  }
  return nxi;
}

/**
 * Convert source canvas to SL2 320×256 format (81920 column-major pixel bytes).
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} SL2 data (81920 bytes)
 */
function convertToSl2_320(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const W = 320, H = 256;
  const q = quantizeNextPixelsExt(sourceCanvas, W, H, 256, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, false);

  const sl2 = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      sl2[x * 256 + y] = q.pixels[y * W + x];
    }
  }
  return sl2;
}

/**
 * Convert source canvas to NXI 640×256 format (32-byte palette + 81920 column-major 4bpp pixels).
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} NXI data (81952 bytes)
 */
function convertToNxi640(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const W = 640, H = 256;
  const q = quantizeNextPixelsExt(sourceCanvas, W, H, 16, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, true);

  const PALETTE_SIZE = 32; // 16 entries × 2 bytes
  const PIXEL_DATA_SIZE = (W / 2) * H; // 81920
  const nxi = new Uint8Array(PALETTE_SIZE + PIXEL_DATA_SIZE);
  // Write palette (16 entries, RGB333)
  for (let i = 0; i < 16; i++) {
    const r3 = q.paletteR3[i], g3 = q.paletteG3[i], b3 = q.paletteB3[i];
    nxi[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    nxi[i * 2 + 1] = b3 & 1;
  }
  // Write pixels in column-major 4bpp: address = (x/2)*256 + y, high nibble = even x, low nibble = odd x
  for (let x = 0; x < W; x += 2) {
    const col = (x >> 1) * 256;
    for (let y = 0; y < H; y++) {
      const idx0 = q.pixels[y * W + x] & 0x0F;
      const idx1 = q.pixels[y * W + x + 1] & 0x0F;
      nxi[PALETTE_SIZE + col + y] = (idx0 << 4) | idx1;
    }
  }
  return nxi;
}

/**
 * Convert source canvas to SL2 640×256 format (81920 column-major 4bpp pixel bytes).
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} SL2 data (81920 bytes)
 */
function convertToSl2_640(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const W = 640, H = 256;
  const q = quantizeNextPixelsExt(sourceCanvas, W, H, 16, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, false);

  const sl2 = new Uint8Array((W / 2) * H);
  for (let x = 0; x < W; x += 2) {
    const col = (x >> 1) * 256;
    for (let y = 0; y < H; y++) {
      const idx0 = q.pixels[y * W + x] & 0x0F;
      const idx1 = q.pixels[y * W + x + 1] & 0x0F;
      sl2[col + y] = (idx0 << 4) | idx1;
    }
  }
  return sl2;
}

/**
 * Convert source canvas to NXI format (512-byte RGB333 palette + 49152 pixel bytes).
 * Generates an optimal 256-color palette from the image by picking the most
 * frequent RGB333 colors, then quantizes with error-diffusion dithering.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering - Dithering method
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} NXI data (49664 bytes: 512 palette + 49152 pixels)
 */
function convertToNxi(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const W = 256, H = 192;
  const q = quantizeNextPixels(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, true);

  // Build NXI output: 512-byte palette (RGB333) + 49152 pixel bytes
  const nxi = new Uint8Array(512 + W * H);
  for (let i = 0; i < 256; i++) {
    const r3 = q.paletteR3[i];
    const g3 = q.paletteG3[i];
    const b3 = q.paletteB3[i];
    // byte0 = RRRGGGBB (top 2 bits of blue)
    nxi[i * 2] = (r3 << 5) | (g3 << 2) | (b3 >> 1);
    // byte1 = P000000B (LSB of blue)
    nxi[i * 2 + 1] = b3 & 1;
  }
  nxi.set(q.pixels, 512);
  return nxi;
}

/**
 * Convert source canvas to SL2 format (raw 49152 pixel bytes, no header).
 * Uses the default RGB332 identity palette since SL2 has no embedded palette.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {string} dithering
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @param {number} gamma
 * @param {boolean} grayscale
 * @param {number} sharpness
 * @param {number} smoothing
 * @param {number} blackPoint
 * @param {number} whitePoint
 * @param {number} balanceR
 * @param {number} balanceG
 * @param {number} balanceB
 * @returns {Uint8Array} SL2 data (49152 bytes: raw pixels only)
 */
function convertToSl2(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const q = quantizeNextPixels(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, false);
  return q.pixels;
}

/**
 * Convert source image to LoRes 128×96 256-color (raw pixel bytes, default palette).
 * Uses quantizeNextPixelsExt with W=128, H=96, 256 colors.
 */
function convertToLores(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const q = quantizeNextPixelsExt(sourceCanvas, 128, 96, 256, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, false);
  return q.pixels;
}

/**
 * Render LoRes preview to canvas with zoom (128×96, default RGB332 palette).
 * @param {Uint8Array} data - Raw 12288-byte pixel data
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom level
 */
function renderLoresToCanvas(data, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = 128, H = 96;
  canvas.width = W * zoom;
  canvas.height = H * zoom;

  const imageData = ctx.createImageData(W, H);
  const pix = imageData.data;

  // Default RGB332 palette
  const palette = new Array(256);
  for (let i = 0; i < 256; i++) {
    const r3 = (i >> 5) & 7;
    const g3 = (i >> 2) & 7;
    const b2 = i & 3;
    const b3 = (b2 << 1) | (b2 >> 1);
    palette[i] = [
      Math.round(r3 * 255 / 7),
      Math.round(g3 * 255 / 7),
      Math.round(b3 * 255 / 7)
    ];
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const colorIdx = data[y * W + x] || 0;
      const rgb = palette[colorIdx];
      const dst = (y * W + x) * 4;
      pix[dst] = rgb[0];
      pix[dst + 1] = rgb[1];
      pix[dst + 2] = rgb[2];
      pix[dst + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(W, H);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, W * zoom, H * zoom);
  }
}

/**
 * Convert source image to LoRes Radastan 128×96 16-color 4bpp (packed nibbles).
 * Uses quantizeNextPixelsExt with W=128, H=96, 16 colors, then packs to 4bpp.
 */
function convertToLoresRad(sourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB) {
  const q = quantizeNextPixelsExt(sourceCanvas, 128, 96, 16, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, false);
  // Pack 1-byte-per-pixel into 4bpp nibbles (high nibble = left, low nibble = right)
  const packed = new Uint8Array(LORES_RAD.PIXEL_DATA_SIZE);
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x += 2) {
      const left = q.pixels[y * 128 + x] & 0x0F;
      const right = q.pixels[y * 128 + x + 1] & 0x0F;
      packed[y * LORES_RAD.BYTES_PER_ROW + (x >> 1)] = (left << 4) | right;
    }
  }
  return packed;
}

/**
 * Render LoRes Radastan preview to canvas with zoom (128×96, 16-color 4bpp).
 * @param {Uint8Array} data - 6144-byte packed pixel data
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom level
 */
function renderLoresRadToCanvas(data, canvas, zoom = 2) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = 128, H = 96;
  canvas.width = W * zoom;
  canvas.height = H * zoom;

  const imageData = ctx.createImageData(W, H);
  const pix = imageData.data;

  // First 16 entries of default RGB332 palette
  const palette = typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : null;
  if (!palette) return;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      const byteVal = data[byteOffset] || 0;
      const colorIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      const rgb = palette[colorIdx] || [0, 0, 0];
      const dst = (y * W + x) * 4;
      pix[dst] = rgb[0];
      pix[dst + 1] = rgb[1];
      pix[dst + 2] = rgb[2];
      pix[dst + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(W, H);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, W * zoom, H * zoom);
  }
}

/**
 * Render NXI/SL2 preview to canvas with zoom.
 * @param {Uint8Array} nxiData - Full NXI data (512+49152) or raw SL2 pixels (49152)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} zoom - Zoom level
 * @param {boolean} [isSl2=false] - If true, treat data as raw SL2 (no palette header)
 */
function renderNxiToCanvas(nxiData, canvas, zoom = 2, isSl2 = false) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = 256, H = 192;
  canvas.width = W * zoom;
  canvas.height = H * zoom;

  const imageData = ctx.createImageData(W, H);
  const pix = imageData.data;

  // Build palette from NXI header or use default RGB332
  const palette = new Array(256);
  if (!isSl2 && nxiData.length >= 512 + W * H) {
    // Parse NXI palette from first 512 bytes
    for (let i = 0; i < 256; i++) {
      const byte0 = nxiData[i * 2];
      const byte1 = nxiData[i * 2 + 1];
      const r3 = (byte0 >> 5) & 7;
      const g3 = (byte0 >> 2) & 7;
      const b3 = ((byte0 & 3) << 1) | (byte1 & 1);
      palette[i] = [
        Math.round(r3 * 255 / 7),
        Math.round(g3 * 255 / 7),
        Math.round(b3 * 255 / 7)
      ];
    }
  } else {
    // Default RGB332 palette
    for (let i = 0; i < 256; i++) {
      const r3 = (i >> 5) & 7;
      const g3 = (i >> 2) & 7;
      const b2 = i & 3;
      const b3 = (b2 << 1) | (b2 >> 1);
      palette[i] = [
        Math.round(r3 * 255 / 7),
        Math.round(g3 * 255 / 7),
        Math.round(b3 * 255 / 7)
      ];
    }
  }

  const pixelOffset = isSl2 ? 0 : 512;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = pixelOffset + y * W + x;
      const colorIdx = nxiData[idx] || 0;
      const rgb = palette[colorIdx];
      const dst = (y * W + x) * 4;
      pix[dst] = rgb[0];
      pix[dst + 1] = rgb[1];
      pix[dst + 2] = rgb[2];
      pix[dst + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(W, H);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, W * zoom, H * zoom);
  }
}

/**
 * Render NXI 320×256 preview to canvas. Data is column-major 8bpp with 512-byte palette header.
 * @param {Uint8Array} nxiData - Full NXI data (82432 bytes)
 * @param {HTMLCanvasElement} canvas
 * @param {number} zoom
 * @param {boolean} [isSl2=false] - If true, raw 81920 bytes (no palette), use default palette
 */
function renderNxi320ToCanvas(nxiData, canvas, zoom = 2, isSl2 = false) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = 320, H = 256;
  canvas.width = W * zoom;
  canvas.height = H * zoom;

  const palette = new Array(256);
  if (!isSl2 && nxiData.length >= 512 + W * H) {
    for (let i = 0; i < 256; i++) {
      const byte0 = nxiData[i * 2];
      const byte1 = nxiData[i * 2 + 1];
      const r3 = (byte0 >> 5) & 7, g3 = (byte0 >> 2) & 7, b3 = ((byte0 & 3) << 1) | (byte1 & 1);
      palette[i] = [Math.round(r3 * 255 / 7), Math.round(g3 * 255 / 7), Math.round(b3 * 255 / 7)];
    }
  } else {
    for (let i = 0; i < 256; i++) {
      const r3 = (i >> 5) & 7, g3 = (i >> 2) & 7, b2 = i & 3, b3 = (b2 << 1) | (b2 >> 1);
      palette[i] = [Math.round(r3 * 255 / 7), Math.round(g3 * 255 / 7), Math.round(b3 * 255 / 7)];
    }
  }

  const pixelOffset = isSl2 ? 0 : 512;
  const imageData = ctx.createImageData(W, H);
  const pix = imageData.data;
  for (let x = 0; x < W; x++) {
    const col = x * 256;
    for (let y = 0; y < H; y++) {
      const colorIdx = nxiData[pixelOffset + col + y] || 0;
      const rgb = palette[colorIdx];
      const dst = (y * W + x) * 4;
      pix[dst] = rgb[0]; pix[dst + 1] = rgb[1]; pix[dst + 2] = rgb[2]; pix[dst + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(W, H);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, W * zoom, H * zoom);
  }
}

/**
 * Render NXI 640×256 preview to canvas. Data is column-major 4bpp with 32-byte palette header.
 * Displayed at 640×512 (2× vertical stretch for correct aspect ratio).
 * @param {Uint8Array} nxiData - Full NXI data (81952 bytes)
 * @param {HTMLCanvasElement} canvas
 * @param {number} zoom
 * @param {boolean} [isSl2=false] - If true, raw 81920 bytes (no palette), use first 16 default colors
 */
function renderNxi640ToCanvas(nxiData, canvas, zoom = 2, isSl2 = false) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = 640, H = 256;
  canvas.width = W * zoom;
  canvas.height = H * 2 * zoom; // 2× vertical stretch

  const palette = new Array(16);
  if (!isSl2 && nxiData.length >= 32 + (W / 2) * H) {
    for (let i = 0; i < 16; i++) {
      const byte0 = nxiData[i * 2];
      const byte1 = nxiData[i * 2 + 1];
      const r3 = (byte0 >> 5) & 7, g3 = (byte0 >> 2) & 7, b3 = ((byte0 & 3) << 1) | (byte1 & 1);
      palette[i] = [Math.round(r3 * 255 / 7), Math.round(g3 * 255 / 7), Math.round(b3 * 255 / 7)];
    }
  } else {
    for (let i = 0; i < 16; i++) {
      const r3 = (i >> 5) & 7, g3 = (i >> 2) & 7, b2 = i & 3, b3 = (b2 << 1) | (b2 >> 1);
      palette[i] = [Math.round(r3 * 255 / 7), Math.round(g3 * 255 / 7), Math.round(b3 * 255 / 7)];
    }
  }

  const pixelOffset = isSl2 ? 0 : 32;
  const imageData = ctx.createImageData(W, H);
  const pix = imageData.data;
  for (let x = 0; x < W; x += 2) {
    const col = (x >> 1) * 256;
    for (let y = 0; y < H; y++) {
      const byteVal = nxiData[pixelOffset + col + y] || 0;
      const idx0 = (byteVal >> 4) & 0x0F;
      const idx1 = byteVal & 0x0F;
      const rgb0 = palette[idx0], rgb1 = palette[idx1];
      const dst0 = (y * W + x) * 4;
      const dst1 = (y * W + x + 1) * 4;
      pix[dst0] = rgb0[0]; pix[dst0 + 1] = rgb0[1]; pix[dst0 + 2] = rgb0[2]; pix[dst0 + 3] = 255;
      pix[dst1] = rgb1[0]; pix[dst1 + 1] = rgb1[1]; pix[dst1 + 2] = rgb1[2]; pix[dst1 + 3] = 255;
    }
  }

  const temp = getImportTempCanvas(W, H);
  if (temp) {
    temp.ctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp.canvas, 0, 0, W * zoom, H * 2 * zoom); // 2× vertical stretch
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
// Animated GIF Decoder & Import to SCA
// ============================================================================

/**
 * Quickly count the number of image frames in a GIF without full decoding.
 * Scans for 0x2C (Image Descriptor) blocks, skipping sub-blocks properly.
 * @param {Uint8Array} data - Raw GIF file bytes
 * @returns {number} Number of image frames found
 */
function countGifFrames(data) {
  if (data.length < 13) return 0;
  // Validate GIF signature
  const sig = String.fromCharCode(data[0], data[1], data[2]);
  if (sig !== 'GIF') return 0;

  let pos = 6; // skip signature + version
  // Skip Logical Screen Descriptor
  const packed = data[10];
  const hasGct = (packed >> 7) & 1;
  const gctSize = packed & 0x07;
  pos = 13;
  if (hasGct) pos += 3 * (2 << gctSize);

  let count = 0;
  while (pos < data.length) {
    const block = data[pos++];
    if (block === 0x3B) break; // Trailer
    if (block === 0x21) {
      // Extension — skip label + sub-blocks
      pos++; // label
      while (pos < data.length) {
        const sz = data[pos++];
        if (sz === 0) break;
        pos += sz;
      }
    } else if (block === 0x2C) {
      count++;
      // Skip Image Descriptor (9 bytes total, already read 1)
      const imgPacked = data[pos + 8];
      const hasLct = (imgPacked >> 7) & 1;
      const lctSize = imgPacked & 0x07;
      pos += 9;
      if (hasLct) pos += 3 * (2 << lctSize);
      pos++; // LZW minimum code size
      // Skip LZW sub-blocks
      while (pos < data.length) {
        const sz = data[pos++];
        if (sz === 0) break;
        pos += sz;
      }
    }
  }
  return count;
}

/**
 * GIF decoder class — parses GIF87a/GIF89a files and returns decoded RGBA frames.
 */
class GifDecoder {
  /**
   * @param {Uint8Array} data - Raw GIF file bytes
   */
  constructor(data) {
    this.data = data;
    this.pos = 0;
  }

  /**
   * Decode the GIF and return frames.
   * @returns {{ width: number, height: number, frames: Array<{ imageData: ImageData, delay: number }> }}
   */
  decode() {
    const d = this.data;
    // Validate signature
    const sig = String.fromCharCode(d[0], d[1], d[2], d[3], d[4], d[5]);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
      throw new Error('Not a valid GIF file');
    }
    this.pos = 6;

    // Logical Screen Descriptor
    const width = this._readU16();
    const height = this._readU16();
    const packed = d[this.pos++];
    const hasGct = (packed >> 7) & 1;
    const gctSizeBits = packed & 0x07;
    const bgColorIndex = d[this.pos++];
    this.pos++; // pixel aspect ratio

    // Global Color Table
    /** @type {Uint8Array|null} */
    let gct = null;
    if (hasGct) {
      const gctLen = 3 * (2 << gctSizeBits);
      gct = d.slice(this.pos, this.pos + gctLen);
      this.pos += gctLen;
    }

    // Composite buffer (RGBA)
    const compositeBuffer = new Uint8ClampedArray(width * height * 4);
    // Previous buffer for disposal method 3
    let previousBuffer = new Uint8ClampedArray(width * height * 4);

    /** @type {Array<{ imageData: ImageData, delay: number }>} */
    const frames = [];

    // Per-frame GCE state
    let disposalMethod = 0;
    let transparentFlag = false;
    let transparentIndex = 0;
    let delayCs = 0;

    // Previous frame's rect and disposal for applying BEFORE drawing next frame
    let prevDisposal = 0;
    let prevLeft = 0, prevTop = 0, prevWidth = 0, prevHeight = 0;

    while (this.pos < d.length) {
      const block = d[this.pos++];
      if (block === 0x3B) break; // Trailer

      if (block === 0x21) {
        // Extension
        const label = d[this.pos++];
        if (label === 0xF9) {
          // Graphic Control Extension
          const sz = d[this.pos++]; // should be 4
          const gcPacked = d[this.pos];
          disposalMethod = (gcPacked >> 2) & 0x07;
          transparentFlag = (gcPacked & 0x01) === 1;
          delayCs = d[this.pos + 1] | (d[this.pos + 2] << 8);
          transparentIndex = d[this.pos + 3];
          this.pos += sz;
          this.pos++; // block terminator
        } else {
          // Skip other extensions
          this._skipSubBlocks();
        }
      } else if (block === 0x2C) {
        // Image Descriptor
        const imgLeft = this._readU16();
        const imgTop = this._readU16();
        const imgWidth = this._readU16();
        const imgHeight = this._readU16();
        const imgPacked = d[this.pos++];
        const hasLct = (imgPacked >> 7) & 1;
        const interlaced = (imgPacked >> 6) & 1;
        const lctSizeBits = imgPacked & 0x07;

        /** @type {Uint8Array} */
        let colorTable = gct || new Uint8Array(768);
        if (hasLct) {
          const lctLen = 3 * (2 << lctSizeBits);
          colorTable = d.slice(this.pos, this.pos + lctLen);
          this.pos += lctLen;
        }

        // Apply previous frame's disposal BEFORE drawing this frame
        if (frames.length > 0) {
          if (prevDisposal === 2) {
            // Restore to background — clear previous frame's rect
            for (let y = prevTop; y < prevTop + prevHeight && y < height; y++) {
              for (let x = prevLeft; x < prevLeft + prevWidth && x < width; x++) {
                const idx = (y * width + x) * 4;
                compositeBuffer[idx] = 0;
                compositeBuffer[idx + 1] = 0;
                compositeBuffer[idx + 2] = 0;
                compositeBuffer[idx + 3] = 0;
              }
            }
          } else if (prevDisposal === 3) {
            // Restore to previous
            compositeBuffer.set(previousBuffer);
          }
        }

        // For disposal method 3 on THIS frame, save buffer before drawing
        if (disposalMethod === 3) {
          previousBuffer = new Uint8ClampedArray(compositeBuffer);
        }

        // LZW decode
        const lzwMinCodeSize = d[this.pos++];
        const pixels = this._lzwDecode(lzwMinCodeSize, imgWidth * imgHeight);

        // De-interlace if needed
        /** @type {Uint8Array} */
        let orderedPixels;
        if (interlaced) {
          orderedPixels = new Uint8Array(imgWidth * imgHeight);
          const passes = [
            { start: 0, step: 8 },
            { start: 4, step: 8 },
            { start: 2, step: 4 },
            { start: 1, step: 2 }
          ];
          let srcRow = 0;
          for (const pass of passes) {
            for (let y = pass.start; y < imgHeight; y += pass.step) {
              if (srcRow < pixels.length / imgWidth) {
                orderedPixels.set(
                  pixels.slice(srcRow * imgWidth, (srcRow + 1) * imgWidth),
                  y * imgWidth
                );
                srcRow++;
              }
            }
          }
        } else {
          orderedPixels = pixels;
        }

        // Composite frame onto buffer
        for (let y = 0; y < imgHeight; y++) {
          for (let x = 0; x < imgWidth; x++) {
            const px = y * imgWidth + x;
            if (px >= orderedPixels.length) continue;
            const ci = orderedPixels[px];
            if (transparentFlag && ci === transparentIndex) continue;
            const dx = imgLeft + x;
            const dy = imgTop + y;
            if (dx >= width || dy >= height) continue;
            const dstIdx = (dy * width + dx) * 4;
            const srcIdx = ci * 3;
            compositeBuffer[dstIdx] = colorTable[srcIdx];
            compositeBuffer[dstIdx + 1] = colorTable[srcIdx + 1];
            compositeBuffer[dstIdx + 2] = colorTable[srcIdx + 2];
            compositeBuffer[dstIdx + 3] = 255;
          }
        }

        // Capture frame
        const frameData = new ImageData(
          new Uint8ClampedArray(compositeBuffer),
          width, height
        );
        frames.push({
          imageData: frameData,
          delay: delayCs
        });

        // Save this frame's rect/disposal for next iteration
        prevDisposal = disposalMethod;
        prevLeft = imgLeft;
        prevTop = imgTop;
        prevWidth = imgWidth;
        prevHeight = imgHeight;

        // Reset GCE state for next frame (GCE applies to next image only)
        disposalMethod = 0;
        transparentFlag = false;
        transparentIndex = 0;
        delayCs = 0;
      }
    }

    return { width, height, frames };
  }

  /** @returns {number} */
  _readU16() {
    const v = this.data[this.pos] | (this.data[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }

  _skipSubBlocks() {
    while (this.pos < this.data.length) {
      const sz = this.data[this.pos++];
      if (sz === 0) break;
      this.pos += sz;
    }
  }

  /**
   * LZW decompression for GIF image data
   * @param {number} minCodeSize - LZW minimum code size
   * @param {number} pixelCount - Expected number of output pixels
   * @returns {Uint8Array} Decoded pixel indices
   */
  _lzwDecode(minCodeSize, pixelCount) {
    const d = this.data;
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    // Collect all sub-block data into a single buffer
    const subBlockData = [];
    let totalBytes = 0;
    while (this.pos < d.length) {
      const sz = d[this.pos++];
      if (sz === 0) break;
      subBlockData.push(d.slice(this.pos, this.pos + sz));
      totalBytes += sz;
      this.pos += sz;
    }
    const byteStream = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of subBlockData) {
      byteStream.set(chunk, offset);
      offset += chunk.length;
    }

    // Bit reader
    let bytePos = 0;
    let bitPos = 0;
    const readBits = (/** @type {number} */ numBits) => {
      let result = 0;
      let bitsRead = 0;
      while (bitsRead < numBits) {
        if (bytePos >= byteStream.length) return -1;
        const bitsAvail = 8 - bitPos;
        const bitsNeeded = numBits - bitsRead;
        const bitsToRead = Math.min(bitsAvail, bitsNeeded);
        const mask = (1 << bitsToRead) - 1;
        result |= ((byteStream[bytePos] >> bitPos) & mask) << bitsRead;
        bitsRead += bitsToRead;
        bitPos += bitsToRead;
        if (bitPos >= 8) {
          bytePos++;
          bitPos = 0;
        }
      }
      return result;
    };

    // Decode
    const output = new Uint8Array(pixelCount);
    let outPos = 0;

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const maxTableSize = 4096;

    // Code table: store as prefix + suffix for memory efficiency
    const prefix = new Int32Array(maxTableSize);
    const suffix = new Uint8Array(maxTableSize);
    const lengths = new Uint16Array(maxTableSize);

    // Initialize table
    const initTable = () => {
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
      for (let i = 0; i < clearCode; i++) {
        prefix[i] = -1;
        suffix[i] = i;
        lengths[i] = 1;
      }
    };

    // Output a code's string to the output buffer
    const outputCode = (/** @type {number} */ code) => {
      const len = lengths[code];
      if (outPos + len > output.length) {
        // Clamp to remaining space
        let c = code;
        const stack = [];
        while (c >= 0 && stack.length < output.length - outPos) {
          stack.push(suffix[c]);
          c = prefix[c];
        }
        for (let i = stack.length - 1; i >= 0; i--) {
          output[outPos++] = stack[i];
        }
        return;
      }
      // Walk the chain and write backwards
      let p = outPos + len - 1;
      let c = code;
      while (c >= 0) {
        output[p--] = suffix[c];
        c = prefix[c];
      }
      outPos += len;
    };

    // Get first character of a code's string
    const firstChar = (/** @type {number} */ code) => {
      let c = code;
      while (prefix[c] >= 0) c = prefix[c];
      return suffix[c];
    };

    initTable();

    let code = readBits(codeSize);
    if (code === clearCode) {
      initTable();
      code = readBits(codeSize);
    }
    if (code === eoiCode || code < 0) return output;

    outputCode(code);
    let prevCode = code;

    while (outPos < pixelCount) {
      code = readBits(codeSize);
      if (code < 0 || code === eoiCode) break;

      if (code === clearCode) {
        initTable();
        code = readBits(codeSize);
        if (code === eoiCode || code < 0) break;
        outputCode(code);
        prevCode = code;
        continue;
      }

      if (code < nextCode) {
        // Code is in the table
        outputCode(code);
        if (nextCode < maxTableSize) {
          prefix[nextCode] = prevCode;
          suffix[nextCode] = firstChar(code);
          lengths[nextCode] = lengths[prevCode] + 1;
          nextCode++;
        }
      } else {
        // Code is not yet in the table (code === nextCode)
        const fc = firstChar(prevCode);
        if (nextCode < maxTableSize) {
          prefix[nextCode] = prevCode;
          suffix[nextCode] = fc;
          lengths[nextCode] = lengths[prevCode] + 1;
          nextCode++;
        }
        outputCode(code < maxTableSize ? code : prevCode);
      }

      // Increase code size when table is full at current width
      if (nextCode >= (1 << codeSize) && codeSize < 12) {
        codeSize++;
      }

      prevCode = code;
    }

    return output;
  }
}

/**
 * Check if a GIF file is animated. If so, decode all frames and import as SCA animation.
 * If single-frame, fall back to the standard image import dialog.
 * @param {File} file - The GIF file
 */
async function importAnimatedGifOrFallback(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const frameCount = countGifFrames(data);
    if (frameCount > 1) {
      await importAnimatedGif(data, file.name);
    } else {
      openImportDialog(file);
    }
  } catch (e) {
    console.error('GIF detection failed, falling back to import dialog:', e);
    openImportDialog(file);
  }
}

/**
 * Decode an animated GIF and load it as an SCA animation.
 * @param {Uint8Array} data - Raw GIF file bytes
 * @param {string} fileName - Original file name
 */
async function importAnimatedGif(data, fileName) {
  let gif;
  try {
    gif = new GifDecoder(data).decode();
  } catch (e) {
    console.error('GIF decode error:', e);
    alert('Failed to decode animated GIF: ' + e.message);
    return;
  }

  if (gif.frames.length === 0) {
    alert('No frames found in GIF file.');
    return;
  }

  const frameCount = gif.frames.length;
  const frameSize = 6912;
  const headerSize = 14;
  const scaSize = headerSize + frameCount + frameCount * frameSize;
  const scaBinary = new Uint8Array(scaSize);

  // SCA Header (14 bytes)
  scaBinary[0] = 0x53; // 'S'
  scaBinary[1] = 0x43; // 'C'
  scaBinary[2] = 0x41; // 'A'
  scaBinary[3] = 0;    // version 0
  scaBinary[4] = 0;    // width low (256 & 0xFF = 0)
  scaBinary[5] = 1;    // width high (256 >> 8 = 1)
  scaBinary[6] = 0xC0; // height low (192 & 0xFF = 0xC0)
  scaBinary[7] = 0;    // height high (192 >> 8 = 0)
  scaBinary[8] = 0;    // border color
  scaBinary[9] = frameCount & 0xFF;         // frame count low
  scaBinary[10] = (frameCount >> 8) & 0xFF; // frame count high
  scaBinary[11] = 0;   // payload type 0 (full frames)
  scaBinary[12] = headerSize & 0xFF;         // payload offset low
  scaBinary[13] = (headerSize >> 8) & 0xFF;  // payload offset high

  // Delay table
  for (let i = 0; i < frameCount; i++) {
    let gifDelay = gif.frames[i].delay;
    if (gifDelay === 0) gifDelay = 10; // treat 0 as 100ms
    const scaDelay = Math.max(1, Math.min(255, Math.round(gifDelay / 2)));
    scaBinary[headerSize + i] = scaDelay;
  }

  // Convert each frame to SCR using fast batch path
  // Build RGB→palette index LUT once (avoids per-pixel colorDistance in inner loop)
  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];
  // 32×32×32 quantized LUT (32768 entries) — map each 5-bit-quantized RGB to nearest palette index
  const palLut = new Uint8Array(32768);
  for (let ri = 0; ri < 32; ri++) {
    const r = (ri << 3) | 4; // center of bin
    for (let gi = 0; gi < 32; gi++) {
      const g = (gi << 3) | 4;
      for (let bi = 0; bi < 32; bi++) {
        const b = (bi << 3) | 4;
        let bestDist = Infinity;
        let bestIdx = 0;
        for (let p = 0; p < fullPalette.length; p++) {
          const pc = fullPalette[p];
          const dr = r - pc[0], dg = g - pc[1], db = b - pc[2];
          const dist = dr * dr + dg * dg + db * db; // fast squared RGB distance for LUT
          if (dist < bestDist) { bestDist = dist; bestIdx = p; }
        }
        palLut[(ri << 10) | (gi << 5) | bi] = bestIdx;
      }
    }
  }

  const nativeSize = (gif.width === 256 && gif.height === 192);

  const frameDataStart = headerSize + frameCount;

  for (let i = 0; i < frameCount; i++) {
    const frame = gif.frames[i];

    // Get 256×192 RGBA pixels
    /** @type {Uint8ClampedArray} */
    let rgba;
    if (nativeSize) {
      rgba = frame.imageData.data;
    } else {
      const srcData = frame.imageData.data;
      const srcW = frame.imageData.width;
      const srcH = frame.imageData.height;
      rgba = new Uint8ClampedArray(256 * 192 * 4);
      for (let dy = 0; dy < 192; dy++) {
        const sy = Math.floor(dy * srcH / 192);
        for (let dx = 0; dx < 256; dx++) {
          const sx = Math.floor(dx * srcW / 256);
          const si = (sy * srcW + sx) * 4;
          const di = (dy * 256 + dx) * 4;
          rgba[di]     = srcData[si];
          rgba[di + 1] = srcData[si + 1];
          rgba[di + 2] = srcData[si + 2];
          rgba[di + 3] = srcData[si + 3];
        }
      }
    }

    // Fast SCR conversion: for each 8×8 cell, find best ink/paper and build bitmap
    const linearBmp = new Uint8Array(6144);
    const frameAttrs = new Uint8Array(768);

    for (let cellY = 0; cellY < 24; cellY++) {
      for (let cellX = 0; cellX < 32; cellX++) {
        // Collect palette indices for 64 pixels in cell via LUT
        const cellIndices = new Uint8Array(64);
        for (let dy = 0; dy < 8; dy++) {
          const py = cellY * 8 + dy;
          for (let dx = 0; dx < 8; dx++) {
            const px = cellX * 8 + dx;
            const si = (py * 256 + px) * 4;
            const ri = rgba[si] >> 3;
            const gi = rgba[si + 1] >> 3;
            const bi = rgba[si + 2] >> 3;
            cellIndices[dy * 8 + dx] = palLut[(ri << 10) | (gi << 5) | bi];
          }
        }

        // Count occurrences of each palette color in this cell
        const counts = new Uint8Array(16);
        for (let j = 0; j < 64; j++) counts[cellIndices[j]]++;

        // Find the two most common palette indices
        let best1 = 0, best2 = 0;
        let max1 = 0, max2 = 0;
        for (let p = 0; p < 16; p++) {
          if (counts[p] > max1) {
            max2 = max1; best2 = best1;
            max1 = counts[p]; best1 = p;
          } else if (counts[p] > max2) {
            max2 = counts[p]; best2 = p;
          }
        }

        // Both must be from same brightness group
        // best1 and best2 are indices in fullPalette (0-7 regular, 8-15 bright)
        const bright1 = best1 >= 8;
        const bright2 = best2 >= 8;
        let inkIdx, paperIdx, bright;
        if (bright1 === bright2) {
          bright = bright1;
          inkIdx = best1 % 8;
          paperIdx = best2 % 8;
        } else {
          // Use the brightness of the more common color
          bright = bright1;
          inkIdx = best1 % 8;
          paperIdx = best2 >= 8 === bright ? best2 % 8 : best1 % 8;
          if (inkIdx === paperIdx) paperIdx = (paperIdx + 1) % 8;
        }

        const inkPalIdx = bright ? 8 + inkIdx : inkIdx;
        const paperPalIdx = bright ? 8 + paperIdx : paperIdx;

        // Build bitmap: for each pixel, pick ink or paper (whichever is closer)
        const inkColor = fullPalette[inkPalIdx];
        const paperColor = fullPalette[paperPalIdx];

        for (let dy = 0; dy < 8; dy++) {
          let byte = 0;
          const py = cellY * 8 + dy;
          for (let dx = 0; dx < 8; dx++) {
            const px = cellX * 8 + dx;
            const si = (py * 256 + px) * 4;
            const r = rgba[si], g = rgba[si + 1], b = rgba[si + 2];
            const dInk = (r - inkColor[0]) ** 2 + (g - inkColor[1]) ** 2 + (b - inkColor[2]) ** 2;
            const dPaper = (r - paperColor[0]) ** 2 + (g - paperColor[1]) ** 2 + (b - paperColor[2]) ** 2;
            if (dInk < dPaper) byte |= (0x80 >> dx);
          }
          // Write to linear bitmap (row-major)
          linearBmp[py * 32 + cellX] = byte;
        }

        // Write attribute
        frameAttrs[cellY * 32 + cellX] = (paperIdx << 3) | inkIdx | (bright ? 0x40 : 0);
      }
    }

    // Interleave linear bitmap into SCR format and combine with attributes
    const scrInterleaved = interleaveBitmap(linearBmp, 256, 192);
    const scr = new Uint8Array(6912);
    scr.set(scrInterleaved);
    scr.set(frameAttrs, 6144);
    scaBinary.set(scr, frameDataStart + i * frameSize);

    // Yield every frame for UI responsiveness and progress
    if (i % 4 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Load as SCA — mirror screen_viewer.js loadScreenFile SCA handling
  stopFlashTimer();
  resetScaState();

  if (typeof activePictureIndex !== 'undefined') {
    activePictureIndex = -1;
  }

  screenData = scaBinary;
  currentFileName = fileName.replace(/\.gif$/i, '') + '.sca';
  currentFormat = FORMAT.SCA;
  currentPicture = null;
  scaHeader = parseScaHeader(screenData);

  if (scaHeader) {
    borderColor = scaHeader.borderColor;
    if (borderColorSelect) {
      borderColorSelect.value = String(borderColor);
    }
    startScaAnimation();
  } else {
    currentFormat = FORMAT.UNKNOWN;
  }

  if (typeof updatePictureTabBar === 'function') {
    updatePictureTabBar();
  }

  toggleScaControlsVisibility();
  toggleFormatControlsVisibility();
  updateScaControls();
  updateFileInfo();
  renderScreen();

  if (typeof updateExportAsmButton === 'function') {
    updateExportAsmButton();
  }
  if (typeof updateEditorState === 'function') {
    updateEditorState();
  }
}

/**
 * Import a 2-frame animated GIF as a single SCR with FLASH attributes.
 * Identical cells get standard ink/paper; differing cells use FLASH bit (0x80)
 * so the ZX Spectrum alternates ink↔paper to simulate two frames.
 * @param {Uint8Array} data - Raw GIF file bytes
 * @param {string} fileName - Original file name
 */
async function importGifAsFlash(data, fileName) {
  let gif;
  try {
    gif = new GifDecoder(data).decode();
  } catch (e) {
    console.error('GIF decode error:', e);
    alert('Failed to decode GIF: ' + (e instanceof Error ? e.message : String(e)));
    return;
  }

  if (gif.frames.length < 2) {
    alert('GIF must have exactly 2 frames for flash import.');
    return;
  }

  // Build palette (regular 0-7, bright 8-15)
  const palette = getCombinedPalette();
  const fullPalette = [...palette.regular, ...palette.bright];

  // Resize helper: get 256×192 RGBA from a frame
  const nativeSize = (gif.width === 256 && gif.height === 192);

  /**
   * @param {number} frameIdx
   * @returns {Uint8ClampedArray}
   */
  function getFrameRgba(frameIdx) {
    const frame = gif.frames[frameIdx];
    if (nativeSize) return frame.imageData.data;
    const srcData = frame.imageData.data;
    const srcW = frame.imageData.width;
    const srcH = frame.imageData.height;
    const result = new Uint8ClampedArray(256 * 192 * 4);
    for (let dy = 0; dy < 192; dy++) {
      const sy = Math.floor(dy * srcH / 192);
      for (let dx = 0; dx < 256; dx++) {
        const sx = Math.floor(dx * srcW / 256);
        const si = (sy * srcW + sx) * 4;
        const di = (dy * 256 + dx) * 4;
        result[di]     = srcData[si];
        result[di + 1] = srcData[si + 1];
        result[di + 2] = srcData[si + 2];
        result[di + 3] = srcData[si + 3];
      }
    }
    return result;
  }

  const rgba1 = getFrameRgba(0);
  const rgba2Raw = getFrameRgba(1);

  // GIF disposal method 2 (restore to background) can clear areas not redrawn
  // by frame 2 to transparent (alpha=0). For flash comparison, those pixels
  // should inherit from frame 1 — they represent unchanged content.
  const rgba2 = new Uint8ClampedArray(rgba2Raw.length);
  for (let i = 0; i < rgba2Raw.length; i += 4) {
    if (rgba2Raw[i + 3] === 0) {
      // Transparent pixel in frame 2 → copy from frame 1
      rgba2[i]     = rgba1[i];
      rgba2[i + 1] = rgba1[i + 1];
      rgba2[i + 2] = rgba1[i + 2];
      rgba2[i + 3] = 255;
    } else {
      rgba2[i]     = rgba2Raw[i];
      rgba2[i + 1] = rgba2Raw[i + 1];
      rgba2[i + 2] = rgba2Raw[i + 2];
      rgba2[i + 3] = rgba2Raw[i + 3];
    }
  }

  // Build linear bitmap (row-major: y * 32 + col) and attributes, then interleave
  const linearBitmap = new Uint8Array(6144);
  const attrs = new Uint8Array(768);

  for (let cellY = 0; cellY < 24; cellY++) {
    for (let cellX = 0; cellX < 32; cellX++) {
      const baseY = cellY * 8;
      const baseX = cellX * 8;

      // --- Step 1: Always compute the best static (no-flash) result ---
      // Brute-force all (ink, paper, bright) using frame 1 only
      let staticError = Infinity;
      let staticInk = 0, staticPaper = 0, staticBright = false;
      let staticBitmap = new Uint8Array(8);

      for (let br = 0; br < 2; br++) {
        const brightFlag = br === 1;
        for (let ink = 0; ink < 8; ink++) {
          for (let paper = 0; paper < 8; paper++) {
            if (ink === paper) continue;
            const inkPIdx = brightFlag ? 8 + ink : ink;
            const paperPIdx = brightFlag ? 8 + paper : paper;
            const ic = fullPalette[inkPIdx];
            const pc = fullPalette[paperPIdx];

            let totalError = 0;
            const tmpBitmap = new Uint8Array(8);

            for (let dy = 0; dy < 8; dy++) {
              let byte = 0;
              const py = baseY + dy;
              for (let dx = 0; dx < 8; dx++) {
                const si = (py * 256 + (baseX + dx)) * 4;
                const r = rgba1[si], g = rgba1[si + 1], b = rgba1[si + 2];
                const dInk = (r - ic[0]) ** 2 + (g - ic[1]) ** 2 + (b - ic[2]) ** 2;
                const dPaper = (r - pc[0]) ** 2 + (g - pc[1]) ** 2 + (b - pc[2]) ** 2;
                if (dInk < dPaper) {
                  byte |= (0x80 >> dx);
                  totalError += dInk;
                } else {
                  totalError += dPaper;
                }
              }
              tmpBitmap[dy] = byte;
            }

            if (totalError < staticError) {
              staticError = totalError;
              staticInk = ink;
              staticPaper = paper;
              staticBright = brightFlag;
              staticBitmap.set(tmpBitmap);
            }
          }
        }
      }

      // --- Step 2: Check if cell genuinely differs between frames ---
      // Use per-channel threshold to ignore GIF encoding artifacts
      let diffPixelCount = 0;
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const si = ((baseY + dy) * 256 + (baseX + dx)) * 4;
          if (Math.abs(rgba1[si] - rgba2[si]) > 24 ||
              Math.abs(rgba1[si + 1] - rgba2[si + 1]) > 24 ||
              Math.abs(rgba1[si + 2] - rgba2[si + 2]) > 24) {
            diffPixelCount++;
          }
        }
      }

      let useFlash = false;
      let flashInk = 0, flashPaper = 0, flashBright = false;
      let flashBitmap = new Uint8Array(8);

      if (diffPixelCount >= 4) {
        // --- Step 3: Compute the best flash result ---
        // Normal phase: bit=1 → ink, bit=0 → paper
        // Flash phase:  bit=1 → paper, bit=0 → ink  (colors swap)
        let bestFlashError = Infinity;

        for (let br = 0; br < 2; br++) {
          const brightFlag = br === 1;
          for (let ink = 0; ink < 8; ink++) {
            for (let paper = 0; paper < 8; paper++) {
              if (ink === paper) continue;
              const inkPIdx = brightFlag ? 8 + ink : ink;
              const paperPIdx = brightFlag ? 8 + paper : paper;
              const ic = fullPalette[inkPIdx];
              const pc = fullPalette[paperPIdx];

              let totalError = 0;
              const tmpBitmap = new Uint8Array(8);

              for (let dy = 0; dy < 8; dy++) {
                let byte = 0;
                const py = baseY + dy;
                for (let dx = 0; dx < 8; dx++) {
                  const si = (py * 256 + (baseX + dx)) * 4;
                  const r1 = rgba1[si], g1 = rgba1[si + 1], b1 = rgba1[si + 2];
                  const r2 = rgba2[si], g2 = rgba2[si + 1], b2 = rgba2[si + 2];

                  // bit=1: normal=ink, flash=paper
                  const err1 = ((r1 - ic[0]) ** 2 + (g1 - ic[1]) ** 2 + (b1 - ic[2]) ** 2) +
                               ((r2 - pc[0]) ** 2 + (g2 - pc[1]) ** 2 + (b2 - pc[2]) ** 2);
                  // bit=0: normal=paper, flash=ink
                  const err0 = ((r1 - pc[0]) ** 2 + (g1 - pc[1]) ** 2 + (b1 - pc[2]) ** 2) +
                               ((r2 - ic[0]) ** 2 + (g2 - ic[1]) ** 2 + (b2 - ic[2]) ** 2);

                  if (err1 < err0) {
                    byte |= (0x80 >> dx);
                    totalError += err1;
                  } else {
                    totalError += err0;
                  }
                }
                tmpBitmap[dy] = byte;
              }

              if (totalError < bestFlashError) {
                bestFlashError = totalError;
                flashInk = ink;
                flashPaper = paper;
                flashBright = brightFlag;
                flashBitmap.set(tmpBitmap);
              }
            }
          }
        }

        // --- Step 4: Compare flash vs static across BOTH frames ---
        // Static error on both frames: same bitmap shown in both phases
        let staticBothError = 0;
        const sInkPIdx = staticBright ? 8 + staticInk : staticInk;
        const sPaperPIdx = staticBright ? 8 + staticPaper : staticPaper;
        const sic = fullPalette[sInkPIdx];
        const spc = fullPalette[sPaperPIdx];
        for (let dy = 0; dy < 8; dy++) {
          const py = baseY + dy;
          const bit = staticBitmap[dy];
          for (let dx = 0; dx < 8; dx++) {
            const si = (py * 256 + (baseX + dx)) * 4;
            const isInk = (bit & (0x80 >> dx)) !== 0;
            const color = isInk ? sic : spc;
            // Same rendering in both frames (no flash)
            const r1 = rgba1[si], g1 = rgba1[si + 1], b1 = rgba1[si + 2];
            const r2 = rgba2[si], g2 = rgba2[si + 1], b2 = rgba2[si + 2];
            staticBothError += (r1 - color[0]) ** 2 + (g1 - color[1]) ** 2 + (b1 - color[2]) ** 2;
            staticBothError += (r2 - color[0]) ** 2 + (g2 - color[1]) ** 2 + (b2 - color[2]) ** 2;
          }
        }

        // Use flash only if it produces lower combined error
        useFlash = bestFlashError < staticBothError;
      }

      // --- Step 5: Write the chosen result to linear bitmap + attrs ---
      const chosenBitmap = useFlash ? flashBitmap : staticBitmap;
      const chosenInk = useFlash ? flashInk : staticInk;
      const chosenPaper = useFlash ? flashPaper : staticPaper;
      const chosenBright = useFlash ? flashBright : staticBright;

      for (let dy = 0; dy < 8; dy++) {
        linearBitmap[(baseY + dy) * 32 + cellX] = chosenBitmap[dy];
      }
      attrs[cellY * 32 + cellX] = (chosenPaper << 3) | chosenInk | (chosenBright ? 0x40 : 0) | (useFlash ? 0x80 : 0);
    }

    // Yield every row for UI responsiveness
    if (cellY % 4 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Interleave linear bitmap into SCR format and combine with attributes
  const interleavedBitmap = interleaveBitmap(linearBitmap, 256, 192);
  const scr = new Uint8Array(6912);
  scr.set(interleavedBitmap);
  scr.set(attrs, 6144);

  // Load result as SCR
  const newFileName = fileName.replace(/\.gif$/i, '') + '.scr';
  const picture = (typeof importScr === 'function') ? importScr(scr, newFileName) : null;

  let needsManualRender = false;
  if (typeof addPicture === 'function') {
    const result = addPicture(newFileName, FORMAT.SCR, scr, picture, true);
    if (result < 0) {
      // Max pictures reached — set globals directly
      screenData = scr;
      currentFormat = FORMAT.SCR;
      currentFileName = newFileName;
      currentPicture = picture;
      needsManualRender = true;
    }
  } else {
    screenData = scr;
    currentFormat = FORMAT.SCR;
    currentFileName = newFileName;
    currentPicture = picture;
    needsManualRender = true;
  }

  if (needsManualRender) {
    // Fallback: addPicture wasn't called or failed, so do UI updates manually
    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateFileInfo();
    renderScreen();
  }

  if (typeof updateExportAsmButton === 'function') {
    updateExportAsmButton();
  }
  if (typeof updateFlashTimer === 'function') {
    updateFlashTimer();
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
let importSourceCanvasZxp = null;

/** @type {HTMLCanvasElement|null} */
let importPreviewCanvas = null;

/** @type {HTMLCanvasElement|null} */
let importOriginalCanvas = null;

/** @type {File|null} */
let importFile = null;

/** @type {File[]} - Remaining images queued for batch "Add All" import */
let importQueue = [];

/** @type {boolean} - True while a batch "Add All" import is in progress */
let importBatchActive = false;

/** @type {Function|null} - Resolves when the current single import completes */
let importBatchResolve = null;

/**
 * Set the queue of additional files to import via "Add All".
 * Called by the file-routing layer before opening the import dialog.
 * @param {File[]} files
 */
function setImportQueue(files) {
  importQueue = Array.isArray(files) ? files.slice() : [];
}

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

/** @type {string} - Paper color rule: 'darker', 'lighter', 'first-pixel' */
let importPaperRule = 'darker';

/** @type {string} - Alignment within fitted area */
let importAlign = 'center';

/** @type {boolean} - Whether tile-to-screens mode is enabled */
let importTileEnabled = false;

/** @type {number} - Currently previewed tile column (0-based) */
let importTileCol = 0;

/** @type {number} - Currently previewed tile row (0-based) */
let importTileRow = 0;

/** @type {HTMLImageElement|null} - Loaded source image */
let importImage = null;

/** @type {string} - Selected palette ID for import */
let importPaletteId = 'default';

/** @type {{regular: number[][], bright: number[][]}} - Cached import palette colors */
let importPaletteColors = { regular: [], bright: [] };

/** @type {Function|null} - Reference to updatePreview for mouse handlers */
let updateImportPreview = null;

/** @type {Uint8Array|null} - External ULA+ palette (64 bytes GRB332) for import, null = auto */
let importUlaPlusPalette = null;

/** @type {Function|null} - Callback for color picker integration from import context */
let importUlaPlusApplyCallback = null;

/** @type {Uint8Array|null} - Saved editor palette while import color picker is open */
let importUlaPlusSavedEditorPalette = null;

/** @type {Uint8Array|null} - Last auto-generated ULA+ palette from preview render */
let lastImportUlaPlusAutoPalette = null;

/**
 * Cached DOM elements for import dialog - populated in initImageImport()
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
  /** @type {HTMLSelectElement|null} */ align: null,
  /** @type {HTMLSelectElement|null} */ paperRule: null,
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
  /** @type {HTMLElement|null} */ dialog: null,
  // ZXP palette type (ULA / ULA+)
  /** @type {HTMLElement|null} */ zxpPaletteTypeRow: null,
  /** @type {HTMLSelectElement|null} */ zxpPaletteType: null,
  // HLR (Gigascreen Lowres) fill pattern selector
  /** @type {HTMLElement|null} */ hlrPatternRow: null,
  /** @type {HTMLSelectElement|null} */ hlrPattern: null,
  // ULA+ palette import
  /** @type {HTMLSelectElement|null} */ ulaPlusPaletteSource: null,
  /** @type {HTMLElement|null} */ ulaPlusPaletteRow: null,
  /** @type {HTMLElement|null} */ ulaPlusPaletteGrid: null,
  /** @type {HTMLElement|null} */ ulaPlusPalettePreview: null,
  /** @type {HTMLButtonElement|null} */ ulaPlusPaletteReset: null,
  /** @type {HTMLInputElement|null} */ ulaPlusPalFile: null,
  /** @type {HTMLInputElement|null} */ ulaPlusScrFile: null,
  // Standard palette row (hidden when ULA+ is selected)
  /** @type {HTMLElement|null} */ paletteRow: null,
  // Tile to screens
  /** @type {HTMLInputElement|null} */ tile: null,
  /** @type {HTMLElement|null} */ tileInfo: null,
  /** @type {HTMLElement|null} */ tileGrid: null,
  /** @type {HTMLElement|null} */ tileCount: null,
  /** @type {HTMLButtonElement|null} */ tilePrev: null,
  /** @type {HTMLButtonElement|null} */ tileNext: null,
  /** @type {HTMLElement|null} */ tileLabel: null,
  // Import mode dropdown (picture / flash / animation)
  /** @type {HTMLSelectElement|null} */ modeSelect: null,
  // "Add All" button — imports queued files with current settings
  /** @type {HTMLButtonElement|null} */ addAllBtn: null
};

/**
 * Get horizontal and vertical alignment factors from importAlign.
 * Returns { h, v } where 0 = start, 0.5 = center, 1 = end.
 */
function getAlignFactors() {
  const h = importAlign.includes('left') ? 0 : importAlign.includes('right') ? 1 : 0.5;
  const v = importAlign.includes('top') ? 0 : importAlign.includes('bottom') ? 1 : 0.5;
  return { h, v };
}

/**
 * Get output dimensions for a given format.
 * @param {string} format - Format identifier
 * @returns {{w: number, h: number}}
 */
function getImportFormatDimensions(format) {
  if (format === 'bsc' || format === 'bsp' || format === 'bmc4') return { w: 384, h: 304 };
  if (format === 'zxp' || format === 'ch$' || format === 'btile' || format === 'wtile') return { w: importSize.w, h: importSize.h };
  if (format === 'mono_2_3') return { w: 256, h: 128 };
  if (format === 'mono_1_3') return { w: 256, h: 64 };
  if (format === 'nxi320' || format === 'sl2_320') return { w: 320, h: 256 };
  if (format === 'nxi640' || format === 'sl2_640') return { w: 640, h: 256 };
  if (format === 'lores' || format === 'lores_rad') return { w: 128, h: 96 };
  return { w: 256, h: 192 };
}

/**
 * Calculate tile grid dimensions for covering a source area with tiles.
 * @param {number} sourceW - Source crop width
 * @param {number} sourceH - Source crop height
 * @param {number} tileW - Single tile width (output format width)
 * @param {number} tileH - Single tile height (output format height)
 * @returns {{cols: number, rows: number, total: number}}
 */
function calculateTileGrid(sourceW, sourceH, tileW, tileH) {
  const cols = Math.max(1, Math.ceil(sourceW / tileW));
  const rows = Math.max(1, Math.ceil(sourceH / tileH));
  return { cols, rows, total: cols * rows };
}

/**
 * Update tile info display text based on current crop and format.
 */
function updateTileInfo() {
  if (!importTileEnabled || !importElements.tileGrid || !importElements.tileCount) return;
  if (!importImage) return;

  const format = importElements.format?.value || 'scr';
  const dims = getImportFormatDimensions(format);
  const grid = calculateTileGrid(importCrop.w, importCrop.h, dims.w, dims.h);

  importElements.tileGrid.textContent = grid.cols + '\u00d7' + grid.rows;
  importElements.tileCount.textContent = String(grid.total);

  // Clamp tile preview index if grid shrank
  if (importTileCol >= grid.cols) importTileCol = grid.cols - 1;
  if (importTileRow >= grid.rows) importTileRow = grid.rows - 1;
  updateTileLabel();

  // Warn if exceeds available picture slots
  const available = (typeof MAX_PICTURES !== 'undefined' && typeof openPictures !== 'undefined')
    ? MAX_PICTURES - openPictures.length : 8;
  if (grid.total > available) {
    importElements.tileCount.style.color = 'var(--text-warning, #f80)';
    importElements.tileCount.textContent = grid.total + ' (max ' + available + ')';
  } else {
    importElements.tileCount.style.color = '';
  }
}

/**
 * Update tile navigation label text.
 */
function updateTileLabel() {
  if (importElements.tileLabel) {
    importElements.tileLabel.textContent = importTileCol + '_' + importTileRow;
  }
}

/**
 * Apply crop and fit mode to source canvas
 */
function applyCropAndFit() {
  if (!importImage || !importSourceCanvas) return;

  // Resize source canvas for extended NXI/SL2 modes
  const format = importElements.format?.value || 'scr';
  const fmtDims = getImportFormatDimensions(format);
  // For BSC/ZXP/chr$/btile/wtile use their own canvases; standard canvas handles the rest
  const canvasW = (format === 'bsc' || format === 'bsp' || format === 'bmc4' || format === 'zxp' || format === 'ch$' || format === 'btile' || format === 'wtile') ? 256 : fmtDims.w;
  const canvasH = (format === 'bsc' || format === 'bsp' || format === 'bmc4' || format === 'zxp' || format === 'ch$' || format === 'btile' || format === 'wtile') ? 192 : fmtDims.h;
  if (importSourceCanvas.width !== canvasW) importSourceCanvas.width = canvasW;
  if (importSourceCanvas.height !== canvasH) importSourceCanvas.height = canvasH;

  const ctx = importSourceCanvas.getContext('2d');
  if (!ctx) return;

  // Disable image smoothing to preserve pixel-perfect patterns (important for 53c)
  ctx.imageSmoothingEnabled = false;

  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const srcX = importCrop.x;
  const srcY = importCrop.y;
  const srcW = importCrop.w;
  const srcH = importCrop.h;

  // Use user-specified size (clamped to available area after offset)
  const availW = Math.min(importSize.w, canvasW - importOffset.x);
  const availH = Math.min(importSize.h, canvasH - importOffset.y);

  // Calculate destination based on fit mode (fit within available area)
  let destX = importOffset.x, destY = importOffset.y, destW = availW, destH = availH;
  const srcAspect = srcW / srcH;
  const { h: alignH, v: alignV } = getAlignFactors();

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
      destY = importOffset.y + (availH - destH) * alignV;
    } else {
      // Source is taller - fit to height
      destH = availH;
      destW = availH * srcAspect;
      destX = importOffset.x + (availW - destW) * alignH;
      destY = importOffset.y;
    }
  } else if (importFitMode === 'fill') {
    // Fill available area with source region, cropping excess
    const destAspect = availW / availH;
    if (srcAspect > destAspect) {
      // Source is wider - fit to height, crop sides
      destH = availH;
      destW = availH * srcAspect;
      destX = importOffset.x + (availW - destW) * alignH;
      destY = importOffset.y;
    } else {
      // Source is taller - fit to width, crop top/bottom
      destW = availW;
      destH = availW / srcAspect;
      destX = importOffset.x;
      destY = importOffset.y + (availH - destH) * alignV;
    }
  } else if (importFitMode === 'fit-width') {
    // Scale to fit width, clamp height to available area
    destW = availW;
    destH = availW / srcAspect;
    if (destH > availH) {
      destH = availH;
      destW = availH * srcAspect;
    }
    destX = importOffset.x + (availW - destW) * alignH;
    destY = importOffset.y + (availH - destH) * alignV;
  } else if (importFitMode === 'fit-height') {
    // Scale to fit height, clamp width to available area
    destH = availH;
    destW = availH * srcAspect;
    if (destW > availW) {
      destW = availW;
      destH = availW / srcAspect;
    }
    destX = importOffset.x + (availW - destW) * alignH;
    destY = importOffset.y + (availH - destH) * alignV;
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
          destYBsc = bscOffsetY + (bscAvailH - destHBsc) * alignV;
        } else {
          destHBsc = bscAvailH;
          destWBsc = bscAvailH * srcAspect;
          destXBsc = bscOffsetX + (bscAvailW - destWBsc) * alignH;
          destYBsc = bscOffsetY;
        }
      } else if (importFitMode === 'fill') {
        if (srcAspect > bscAspect) {
          destHBsc = bscAvailH;
          destWBsc = bscAvailH * srcAspect;
          destXBsc = bscOffsetX + (bscAvailW - destWBsc) * alignH;
          destYBsc = bscOffsetY;
        } else {
          destWBsc = bscAvailW;
          destHBsc = bscAvailW / srcAspect;
          destXBsc = bscOffsetX;
          destYBsc = bscOffsetY + (bscAvailH - destHBsc) * alignV;
        }
      } else if (importFitMode === 'fit-width') {
        destWBsc = bscAvailW;
        destHBsc = bscAvailW / srcAspect;
        if (destHBsc > bscAvailH) {
          destHBsc = bscAvailH;
          destWBsc = bscAvailH * srcAspect;
        }
        destXBsc = bscOffsetX + (bscAvailW - destWBsc) * alignH;
        destYBsc = bscOffsetY + (bscAvailH - destHBsc) * alignV;
      } else if (importFitMode === 'fit-height') {
        destHBsc = bscAvailH;
        destWBsc = bscAvailH * srcAspect;
        if (destWBsc > bscAvailW) {
          destWBsc = bscAvailW;
          destHBsc = bscAvailW / srcAspect;
        }
        destXBsc = bscOffsetX + (bscAvailW - destWBsc) * alignH;
        destYBsc = bscOffsetY + (bscAvailH - destHBsc) * alignV;
      }

      ctxBsc.drawImage(importImage, srcX, srcY, srcW, srcH, destXBsc, destYBsc, destWBsc, destHBsc);
    }
  }

  // Also fill ZXP canvas (user-specified dimensions)
  if (importSourceCanvasZxp) {
    const zxpW = importSize.w;
    const zxpH = importSize.h;
    if (importSourceCanvasZxp.width !== zxpW) importSourceCanvasZxp.width = zxpW;
    if (importSourceCanvasZxp.height !== zxpH) importSourceCanvasZxp.height = zxpH;
    const ctxZxp = importSourceCanvasZxp.getContext('2d');
    if (ctxZxp) {
      ctxZxp.imageSmoothingEnabled = false;
      ctxZxp.fillStyle = '#000';
      ctxZxp.fillRect(0, 0, zxpW, zxpH);

      // Scale offset for ZXP dimensions; available area is the full ZXP canvas
      const zxpOffsetX = Math.round(importOffset.x * zxpW / 256);
      const zxpOffsetY = Math.round(importOffset.y * zxpH / 192);
      const zxpAvailW = Math.min(zxpW, zxpW - zxpOffsetX);
      const zxpAvailH = Math.min(zxpH, zxpH - zxpOffsetY);

      let destXZxp = zxpOffsetX, destYZxp = zxpOffsetY, destWZxp = zxpAvailW, destHZxp = zxpAvailH;
      const zxpAspect = zxpAvailW / zxpAvailH;

      if (importFitMode === 'stretch') {
        destXZxp = zxpOffsetX; destYZxp = zxpOffsetY; destWZxp = zxpAvailW; destHZxp = zxpAvailH;
      } else if (importFitMode === 'fit') {
        if (srcAspect > zxpAspect) {
          destWZxp = zxpAvailW;
          destHZxp = zxpAvailW / srcAspect;
          destXZxp = zxpOffsetX;
          destYZxp = zxpOffsetY + (zxpAvailH - destHZxp) * alignV;
        } else {
          destHZxp = zxpAvailH;
          destWZxp = zxpAvailH * srcAspect;
          destXZxp = zxpOffsetX + (zxpAvailW - destWZxp) * alignH;
          destYZxp = zxpOffsetY;
        }
      } else if (importFitMode === 'fill') {
        if (srcAspect > zxpAspect) {
          destHZxp = zxpAvailH;
          destWZxp = zxpAvailH * srcAspect;
          destXZxp = zxpOffsetX + (zxpAvailW - destWZxp) * alignH;
          destYZxp = zxpOffsetY;
        } else {
          destWZxp = zxpAvailW;
          destHZxp = zxpAvailW / srcAspect;
          destXZxp = zxpOffsetX;
          destYZxp = zxpOffsetY + (zxpAvailH - destHZxp) * alignV;
        }
      } else if (importFitMode === 'fit-width') {
        destWZxp = zxpAvailW;
        destHZxp = zxpAvailW / srcAspect;
        if (destHZxp > zxpAvailH) {
          destHZxp = zxpAvailH;
          destWZxp = zxpAvailH * srcAspect;
        }
        destXZxp = zxpOffsetX + (zxpAvailW - destWZxp) * alignH;
        destYZxp = zxpOffsetY + (zxpAvailH - destHZxp) * alignV;
      } else if (importFitMode === 'fit-height') {
        destHZxp = zxpAvailH;
        destWZxp = zxpAvailH * srcAspect;
        if (destWZxp > zxpAvailW) {
          destWZxp = zxpAvailW;
          destHZxp = zxpAvailW / srcAspect;
        }
        destXZxp = zxpOffsetX + (zxpAvailW - destWZxp) * alignH;
        destYZxp = zxpOffsetY + (zxpAvailH - destHZxp) * alignV;
      }

      ctxZxp.drawImage(importImage, srcX, srcY, srcW, srcH, destXZxp, destYZxp, destWZxp, destHZxp);
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

  // Draw tile grid overlay when tiling is enabled
  if (importTileEnabled) {
    const format = importElements.format?.value || 'scr';
    const dims = getImportFormatDimensions(format);
    const grid = calculateTileGrid(importCrop.w, importCrop.h, dims.w, dims.h);

    if (grid.total > 1) {
      ctx.save();
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
      ctx.textBaseline = 'top';

      const cropStartX = importCrop.x * scale;
      const cropStartY = importCrop.y * scale;

      // Vertical tile lines
      for (let col = 1; col < grid.cols; col++) {
        const x = cropStartX + col * dims.w * scale;
        ctx.beginPath();
        ctx.moveTo(x, cropStartY);
        ctx.lineTo(x, cropStartY + importCrop.h * scale);
        ctx.stroke();
      }
      // Horizontal tile lines
      for (let row = 1; row < grid.rows; row++) {
        const y = cropStartY + row * dims.h * scale;
        ctx.beginPath();
        ctx.moveTo(cropStartX, y);
        ctx.lineTo(cropStartX + importCrop.w * scale, y);
        ctx.stroke();
      }
      // Highlight the currently previewed tile
      const curCol = Math.min(importTileCol, grid.cols - 1);
      const curRow = Math.min(importTileRow, grid.rows - 1);
      const hlX = cropStartX + curCol * dims.w * scale;
      const hlY = cropStartY + curRow * dims.h * scale;
      const hlW = Math.min(dims.w, importCrop.w - curCol * dims.w) * scale;
      const hlH = Math.min(dims.h, importCrop.h - curRow * dims.h) * scale;
      ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';
      ctx.fillRect(hlX, hlY, hlW, hlH);
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(hlX, hlY, hlW, hlH);

      // Labels in each cell
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
          const lx = cropStartX + col * dims.w * scale + 3;
          const ly = cropStartY + row * dims.h * scale + 2;
          ctx.fillText(col + '_' + row, lx, ly);
        }
      }
      ctx.restore();
    }
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
  if (format === 'bsc' || format === 'bsp' || format === 'bmc4') {
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
 * Build the 8x8 palette grid for the import ULA+ palette preview
 */
function buildImportUlaPlusPaletteGrid() {
  const container = importElements.ulaPlusPaletteGrid;
  if (!container || !importUlaPlusPalette) return;

  container.innerHTML = '';

  for (let i = 0; i < 64; i++) {
    const cell = document.createElement('div');
    cell.className = 'ulaplus-grid-cell';
    cell.dataset.index = String(i);

    const rgb = grb332ToRgb(importUlaPlusPalette[i]);
    cell.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

    const clut = Math.floor(i / 16);
    const pos = i % 16;
    const isInk = pos < 8;
    cell.title = `CLUT ${clut}, ${isInk ? 'INK' : 'PAPER'} ${pos % 8} (#${i}) - Ctrl+click to edit`;

    // Add gap class for CLUT separation
    if ((i >= 16 && i <= 23) || (i >= 32 && i <= 39) || (i >= 48 && i <= 55)) {
      cell.classList.add('clut-gap');
    }

    cell.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        openImportUlaPlusColorPicker(i);
      }
    });

    container.appendChild(cell);
  }
}

/**
 * Show the import palette grid
 */
function showImportPaletteGrid() {
  if (importElements.ulaPlusPalettePreview) {
    importElements.ulaPlusPalettePreview.style.display = '';
  }
}

/**
 * Hide the import palette grid
 */
function hideImportPaletteGrid() {
  if (importElements.ulaPlusPalettePreview) {
    importElements.ulaPlusPalettePreview.style.display = 'none';
  }
}

/**
 * Open ULA+ color picker from import context for a specific palette index
 * @param {number} index - Palette index (0-63)
 */
function openImportUlaPlusColorPicker(index) {
  if (!importUlaPlusPalette || index < 0 || index >= 64) return;

  // Save editor palette state
  importUlaPlusSavedEditorPalette = ulaPlusPalette;

  // Temporarily set ulaPlusPalette so the dialog reads import colors
  ulaPlusPalette = importUlaPlusPalette;

  // Set callback for apply
  importUlaPlusApplyCallback = (grb) => {
    importUlaPlusPalette[index] = grb;
    buildImportUlaPlusPaletteGrid();
    // Restore editor palette
    ulaPlusPalette = importUlaPlusSavedEditorPalette;
    importUlaPlusSavedEditorPalette = null;
    importUlaPlusApplyCallback = null;
    // Remove z-index override
    const dialog = document.getElementById('ulaPlusColorDialog');
    if (dialog) dialog.style.zIndex = '';
    updateImportPreview?.();
  };

  // Raise color picker above the import dialog
  const dialog = document.getElementById('ulaPlusColorDialog');
  if (dialog) dialog.style.zIndex = '10001';

  // Open the existing color picker
  openUlaPlusColorPicker(index);
}

/**
 * Initialize image import dialog
 */
function initImageImport() {
  importElements.dialog = document.getElementById('imageImportDialog');
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

  // ZXP format canvas (user-specified dimensions, default 256x192)
  importSourceCanvasZxp = document.createElement('canvas');
  importSourceCanvasZxp.width = 256;
  importSourceCanvasZxp.height = 192;

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
  importElements.align = /** @type {HTMLSelectElement} */ (document.getElementById('importAlign'));
  importElements.paperRule = /** @type {HTMLSelectElement} */ (document.getElementById('importPaperRule'));
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

  // ZXP palette type selector
  importElements.zxpPaletteTypeRow = document.getElementById('importZxpPaletteTypeRow');
  importElements.zxpPaletteType = /** @type {HTMLSelectElement} */ (document.getElementById('importZxpPaletteType'));
  // HLR fill pattern selector
  importElements.hlrPatternRow = document.getElementById('importHlrPatternRow');
  importElements.hlrPattern = /** @type {HTMLSelectElement} */ (document.getElementById('importHlrPattern'));
  // chr$ mode selector (standard / gigascreen)
  importElements.chrGigaRow = document.getElementById('importChrGigaRow');
  importElements.chrMode = /** @type {HTMLSelectElement} */ (document.getElementById('importChrMode'));
  importElements.specsciiCharsetRow = document.getElementById('importSpecsciiCharsetRow');
  importElements.specsciiCharset = /** @type {HTMLSelectElement} */ (document.getElementById('importSpecsciiCharset'));
  // ULA+ palette import elements
  importElements.paletteRow = document.getElementById('importPaletteRow');
  importElements.ulaPlusPaletteSource = /** @type {HTMLSelectElement} */ (document.getElementById('importUlaPlusPaletteSource'));
  importElements.ulaPlusPaletteRow = document.getElementById('importUlaPlusPaletteRow');
  importElements.ulaPlusPaletteGrid = document.getElementById('importUlaPlusPaletteGrid');
  importElements.ulaPlusPalettePreview = document.getElementById('importUlaPlusPalettePreview');
  importElements.ulaPlusPaletteReset = /** @type {HTMLButtonElement} */ (document.getElementById('importUlaPlusPaletteReset'));
  importElements.ulaPlusPalFile = /** @type {HTMLInputElement} */ (document.getElementById('importUlaPlusPalFile'));
  importElements.ulaPlusScrFile = /** @type {HTMLInputElement} */ (document.getElementById('importUlaPlusScrFile'));

  // Tile to screens elements
  importElements.tile = /** @type {HTMLInputElement} */ (document.getElementById('importTile'));
  importElements.tileInfo = document.getElementById('importTileInfo');
  importElements.tileGrid = document.getElementById('importTileGrid');
  importElements.tileCount = document.getElementById('importTileCount');
  importElements.tilePrev = /** @type {HTMLButtonElement} */ (document.getElementById('importTilePrev'));
  importElements.tileNext = /** @type {HTMLButtonElement} */ (document.getElementById('importTileNext'));
  importElements.tileLabel = document.getElementById('importTileLabel');
  importElements.adjustReset = /** @type {HTMLButtonElement|null} */ (document.getElementById('importAdjustReset'));

  // Tab switching
  const tabImage = document.getElementById('importTabImage');
  const tabAdjust = document.getElementById('importTabAdjust');
  const panelImage = document.getElementById('importPanelImage');
  const panelAdjust = document.getElementById('importPanelAdjust');

  const switchTab = (tab) => {
    if (tab === 'image') {
      tabImage.style.background = 'var(--bg-primary)';
      tabAdjust.style.background = 'var(--bg-secondary)';
      panelImage.style.visibility = 'visible';
      panelAdjust.style.visibility = 'hidden';
    } else {
      tabImage.style.background = 'var(--bg-secondary)';
      tabAdjust.style.background = 'var(--bg-primary)';
      panelImage.style.visibility = 'hidden';
      panelAdjust.style.visibility = 'visible';
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
  importElements.modeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('importModeSelect'));
  importElements.addAllBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('importAddAllBtn'));

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

    // When tiling is enabled, render the currently selected tile
    let tileSavedCrop, tileSavedFitMode, tileSavedOffset, tileSavedSize;
    if (importTileEnabled && importImage) {
      const fmt = formatSelect?.value || 'scr';
      const dims = getImportFormatDimensions(fmt);
      const grid = calculateTileGrid(importCrop.w, importCrop.h, dims.w, dims.h);
      // Clamp tile col/row to grid bounds
      if (importTileCol >= grid.cols) importTileCol = grid.cols - 1;
      if (importTileRow >= grid.rows) importTileRow = grid.rows - 1;

      tileSavedCrop = { ...importCrop };
      tileSavedFitMode = importFitMode;
      tileSavedOffset = { ...importOffset };
      tileSavedSize = { ...importSize };

      const tileX = importCrop.x + importTileCol * dims.w;
      const tileY = importCrop.y + importTileRow * dims.h;
      const tileW = Math.min(dims.w, importCrop.x + importCrop.w - tileX);
      const tileH = Math.min(dims.h, importCrop.y + importCrop.h - tileY);

      importCrop = { x: tileX, y: tileY, w: tileW, h: tileH };
      importSize = { w: tileW, h: tileH };
      importOffset = { x: 0, y: 0 };
      importFitMode = 'stretch';
    }

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
    } else if (format === 'specscii') {
      const specsciiCharset = importElements.specsciiCharset?.value || 'full';
      const result = convertToSpecscii(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, specsciiCharset);
      renderSpecsciiToCanvas(result.charGrid, result.attrGrid, importPreviewCanvas, currentZoom);
    } else if ((format === 'bsc' || format === 'bsp') && importSourceCanvasBsc) {
      const bscData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBscToCanvas(bscData, importPreviewCanvas, currentZoom);
    } else if (format === 'ifl') {
      const iflData = convertToIfl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderIflToCanvas(iflData, importPreviewCanvas, currentZoom);
    } else if (format === 'mlt') {
      const mltData = convertToMlt(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderMltToCanvas(mltData, importPreviewCanvas, currentZoom);
    } else if (format === 'bmc4' && importSourceCanvasBsc) {
      const bmc4Data = convertToBmc4(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBmc4ToCanvas(bmc4Data, importPreviewCanvas, currentZoom);
    } else if (format === 'rgb3') {
      const rgb3Data = convertToRgb3(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderRgb3ToCanvas(rgb3Data, importPreviewCanvas, currentZoom);
    } else if (format === 'gigascreen' || format === 'mg8' || format === 'mg4' || format === 'mg2' || format === 'mg1') {
      const cellH = format === 'mg4' ? 4 : format === 'mg2' ? 2 : format === 'mg1' ? 1 : 8;
      const gigaData = convertToGigascreen(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, cellH);
      renderGigascreenToCanvas(gigaData, importPreviewCanvas, currentZoom, cellH);
    } else if (format === 'hlr') {
      const hlrPattern = getSelectedImportHlrPattern();
      const hlrData = convertToHlr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, hlrPattern);
      renderGigascreenToCanvas(hlrData, importPreviewCanvas, currentZoom, 8);
    } else if (format === 'stl') {
      const stlData = convertToStl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderGigascreenToCanvas(stlData, importPreviewCanvas, currentZoom, 4);
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
      const result = convertToUlaPlus(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, importUlaPlusPalette);
      renderUlaPlusToCanvas(result.data, importPreviewCanvas, currentZoom);
      if (!importUlaPlusPalette) lastImportUlaPlusAutoPalette = result.palette;
    } else if (format === 'zxp' && importSourceCanvasZxp) {
      if (importElements.zxpPaletteType?.value === 'ulaplus') {
        const result = convertToZxpUlaPlus(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, importUlaPlusPalette);
        renderZxpUlaPlusToCanvas(result.data, importPreviewCanvas, currentZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
        if (!importUlaPlusPalette) lastImportUlaPlusAutoPalette = result.palette;
      } else {
        const zxpData = convertToZxp(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
        renderZxpToCanvas(zxpData, importPreviewCanvas, currentZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
      }
    } else if (format === 'ch$' && importSourceCanvasZxp) {
      // chr$ uses the same linear bitmap+attrs layout as ZXP. The cell-interleaved
      // re-packing happens at save time in exportChrFile(). Standard mode reuses
      // convertToZxp; gigascreen mode produces two flickering frames.
      const chrGiga = importElements.chrMode?.value === 'gigascreen';
      if (chrGiga) {
        const chrData = convertToZxpGigascreen(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
        renderZxpGigascreenToCanvas(chrData, importPreviewCanvas, currentZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
      } else {
        const chrData = convertToZxp(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
        renderZxpToCanvas(chrData, importPreviewCanvas, currentZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
      }
    } else if ((format === 'btile' || format === 'wtile') && importSourceCanvasZxp) {
      const tileData = convertToNirvanaTile(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderZxpToCanvas(tileData, importPreviewCanvas, currentZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height, 2);
    } else if (format === 'nxi') {
      const nxiData = convertToNxi(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderNxiToCanvas(nxiData, importPreviewCanvas, currentZoom, false);
    } else if (format === 'nxi320') {
      const nxiData = convertToNxi320(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderNxi320ToCanvas(nxiData, importPreviewCanvas, currentZoom, false);
    } else if (format === 'nxi640') {
      const nxiData = convertToNxi640(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderNxi640ToCanvas(nxiData, importPreviewCanvas, currentZoom, false);
    } else if (format === 'sl2') {
      const sl2Data = convertToSl2(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderNxiToCanvas(sl2Data, importPreviewCanvas, currentZoom, true);
    } else if (format === 'sl2_320') {
      const sl2Data = convertToSl2_320(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderNxi320ToCanvas(sl2Data, importPreviewCanvas, currentZoom, true);
    } else if (format === 'sl2_640') {
      const sl2Data = convertToSl2_640(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderNxi640ToCanvas(sl2Data, importPreviewCanvas, currentZoom, true);
    } else if (format === 'lores') {
      const loresData = convertToLores(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderLoresToCanvas(loresData, importPreviewCanvas, currentZoom);
    } else if (format === 'lores_rad') {
      const radData = convertToLoresRad(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderLoresRadToCanvas(radData, importPreviewCanvas, currentZoom);
    } else {
      const scrData = convertToScr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderScrToCanvas(scrData, importPreviewCanvas, currentZoom);
    }

    // Update preview size label to reflect actual output dimensions
    const fmtDims = getImportFormatDimensions(format);
    const prevSizeLabel = document.getElementById('importPreviewSize');
    if (prevSizeLabel) prevSizeLabel.textContent = `${fmtDims.w}x${fmtDims.h}`;

    // Draw grid overlay if enabled
    if (showGridCheckbox?.checked && importPreviewCanvas) {
      drawImportPreviewGrid(importPreviewCanvas, currentZoom, format);
    }

    // Restore state after tile preview
    if (tileSavedCrop) {
      importCrop = tileSavedCrop;
      importFitMode = tileSavedFitMode;
      importOffset = tileSavedOffset;
      importSize = tileSavedSize;
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
    updateTileInfo();
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

  // Alignment within fitted area
  importElements.align?.addEventListener('change', function() {
    importAlign = this.value;
    updateAll();
  });

  ditheringSelect?.addEventListener('change', updatePreview);

  // Error-diffusion strength slider and serpentine checkbox (global dither controls)
  const ditherStrengthSlider = /** @type {HTMLInputElement|null} */ (document.getElementById('importDitherStrength'));
  const ditherStrengthVal = document.getElementById('importDitherStrengthVal');
  const ditherSerpentineCheckbox = /** @type {HTMLInputElement|null} */ (document.getElementById('importDitherSerpentine'));
  const syncDitherControls = () => {
    const pct = ditherStrengthSlider ? Math.max(0, Math.min(100, parseInt(ditherStrengthSlider.value, 10) || 0)) : 100;
    ditherStrength = pct / 100;
    ditherSerpentine = !!(ditherSerpentineCheckbox && ditherSerpentineCheckbox.checked);
    if (ditherStrengthVal) ditherStrengthVal.textContent = String(pct);
  };
  // Sync globals with UI defaults on dialog init
  syncDitherControls();
  ditherStrengthSlider?.addEventListener('input', () => {
    syncDitherControls();
    updatePreview();
  });
  ditherSerpentineCheckbox?.addEventListener('change', () => {
    syncDitherControls();
    updatePreview();
  });

  importElements.paperRule?.addEventListener('change', function() {
    importPaperRule = this.value;
    updatePreview();
  });
  formatSelect?.addEventListener('change', () => {
    // Update size defaults based on format
    const format = formatSelect?.value || 'scr';
    const isVarSize = format === 'zxp' || format === 'ch$' || format === 'btile' || format === 'wtile';
    // Set defaults: btile 256×192 (divisible by 16), wtile 240×192 (divisible by 24)
    let defaultW, defaultH;
    if (format === 'btile') { defaultW = 256; defaultH = 192; }
    else if (format === 'wtile') { defaultW = 240; defaultH = 192; }
    else { const fmtDims = getImportFormatDimensions(format); defaultW = fmtDims.w; defaultH = fmtDims.h; }
    importSize.w = defaultW;
    importSize.h = defaultH;
    if (importElements.sizeW) {
      importElements.sizeW.value = String(defaultW);
      importElements.sizeW.max = String(
        (format === 'bsc' || format === 'bsp' || format === 'bmc4') ? 384 :
        isVarSize ? 2048 : defaultW
      );
    }
    if (importElements.sizeH) {
      importElements.sizeH.value = String(defaultH);
      importElements.sizeH.max = String(
        (format === 'bsc' || format === 'bsp' || format === 'bmc4') ? 304 :
        isVarSize ? 2048 : defaultH
      );
    }
    // Also reset offset for format change
    importOffset.x = 0;
    importOffset.y = 0;
    if (importElements.offsetX) importElements.offsetX.value = '0';
    if (importElements.offsetY) importElements.offsetY.value = '0';
    // Show/hide 53c pattern selector and dithering row
    const patternRow = document.getElementById('import53cPatternRow');
    if (patternRow) {
      patternRow.style.display = format === '53c' ? 'flex' : 'none';
    }
    // Show/hide HLR pattern selector
    if (importElements.hlrPatternRow) {
      importElements.hlrPatternRow.style.display = format === 'hlr' ? 'flex' : 'none';
    }
    // Show/hide chr$ mode selector
    if (importElements.chrGigaRow) {
      importElements.chrGigaRow.style.display = format === 'ch$' ? 'flex' : 'none';
    }
    if (importElements.specsciiCharsetRow) {
      importElements.specsciiCharsetRow.style.display = format === 'specscii' ? 'flex' : 'none';
    }
    const ditheringRow = document.getElementById('importDitheringRow');
    if (ditheringRow) {
      // HLR/STL have a fixed bitmap, so dithering does nothing — hide the row.
      // SPECSCII uses character shape matching instead of dithering.
      ditheringRow.style.display = (format === '53c' || format === 'hlr' || format === 'stl' || format === 'specscii') ? 'none' : 'flex';
    }
    // Hide cell-aware dithering for formats without attribute cells (RGB3, Mono)
    // and for HLR (bitmap is fixed so cell-aware methods don't apply either).
    const cellGroup = document.getElementById('importDitherCellGroup');
    const noCellFormats = format === 'rgb3' || format === 'mono' || format === 'mono_2_3' || format === 'mono_1_3' || format === 'hlr' || format === 'stl' || format === 'specscii' || format === 'nxi' || format === 'nxi320' || format === 'nxi640' || format === 'sl2' || format === 'sl2_320' || format === 'sl2_640' || format === 'lores' || format === 'lores_rad';
    if (cellGroup) {
      cellGroup.style.display = noCellFormats ? 'none' : '';
    }
    // If switching to non-cell format while a cell-aware method is selected, switch to global equivalent
    const ditherSelect = document.getElementById('importDithering');
    if (noCellFormats && ditherSelect && ditherSelect.value.startsWith('cell-')) {
      const mapped = mapCellDithering(ditherSelect.value);
      // Find matching option in global group, or fall back to floyd-steinberg
      const hasOption = Array.from(ditherSelect.options).some(o => o.value === mapped);
      ditherSelect.value = hasOption ? mapped : 'floyd-steinberg';
    }
    // Show/hide ZXP palette type selector
    const zxpUlaPlus = format === 'zxp' && importElements.zxpPaletteType?.value === 'ulaplus';
    if (importElements.zxpPaletteTypeRow) {
      importElements.zxpPaletteTypeRow.style.display = format === 'zxp' ? 'flex' : 'none';
    }
    // Show/hide ULA+ palette row and standard palette row
    const showUlaPlusRow = format === 'ulaplus' || zxpUlaPlus;
    if (importElements.ulaPlusPaletteRow) {
      importElements.ulaPlusPaletteRow.style.display = showUlaPlusRow ? 'flex' : 'none';
    }
    // Crosshair cursor on preview for ULA+ eyedropper
    if (importPreviewCanvas) {
      importPreviewCanvas.style.cursor = showUlaPlusRow ? 'crosshair' : '';
    }
    // Hide standard Palette: row for ULA+ and NXI/SL2 (they have their own palette systems)
    const isNextFormat = format === 'nxi' || format === 'nxi320' || format === 'nxi640' || format === 'sl2' || format === 'sl2_320' || format === 'sl2_640' || format === 'lores' || format === 'lores_rad';
    if (importElements.paletteRow) {
      importElements.paletteRow.style.display = (showUlaPlusRow || isNextFormat) ? 'none' : 'flex';
    }
    // Auto-set zoom to x1 for variable-size formats (dimensions can be very large)
    if ((format === 'zxp' || format === 'ch$' || format === 'btile' || format === 'wtile') && importElements.zoom) {
      importElements.zoom.value = '1';
      importZoom = 1;
    }
    // Reset ULA+ palette state when switching away; re-apply standard palette for safety
    if (format !== 'ulaplus' && !zxpUlaPlus) {
      applyImportPalette(importElements.palette?.value || importPaletteId || 'default');
      importUlaPlusPalette = null;
      lastImportUlaPlusAutoPalette = null;
      if (importElements.ulaPlusPaletteSource) importElements.ulaPlusPaletteSource.value = 'auto';
      hideImportPaletteGrid();
      if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = 'none';
    }
    updateTileInfo();
    updatePreview();
  });
  // ZXP palette type change: toggle ULA+ palette row and refresh preview
  importElements.zxpPaletteType?.addEventListener('change', () => {
    const format = formatSelect?.value || 'scr';
    const zxpUlaPlus = format === 'zxp' && importElements.zxpPaletteType?.value === 'ulaplus';
    const showUlaPlusRow = format === 'ulaplus' || zxpUlaPlus;
    if (importElements.ulaPlusPaletteRow) {
      importElements.ulaPlusPaletteRow.style.display = showUlaPlusRow ? 'flex' : 'none';
    }
    if (importPreviewCanvas) {
      importPreviewCanvas.style.cursor = showUlaPlusRow ? 'crosshair' : '';
    }
    if (importElements.paletteRow) {
      importElements.paletteRow.style.display = showUlaPlusRow ? 'none' : 'flex';
    }
    if (!showUlaPlusRow) {
      applyImportPalette(importElements.palette?.value || importPaletteId || 'default');
      importUlaPlusPalette = null;
      lastImportUlaPlusAutoPalette = null;
      if (importElements.ulaPlusPaletteSource) importElements.ulaPlusPaletteSource.value = 'auto';
      hideImportPaletteGrid();
      if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = 'none';
    }
    updatePreview();
  });
  importElements.pattern53c?.addEventListener('change', updatePreview);
  importElements.hlrPattern?.addEventListener('change', updatePreview);
  importElements.chrMode?.addEventListener('change', updatePreview);
  importElements.specsciiCharset?.addEventListener('change', updatePreview);
  contrastSlider?.addEventListener('input', function() {
    const contrastLabel = document.getElementById('importContrastValue');
    if (contrastLabel) contrastLabel.textContent = this.value;
    updatePreview();
  });
  brightnessSlider?.addEventListener('input', function() {
    const brightnessLabel = document.getElementById('importBrightnessValue');
    if (brightnessLabel) brightnessLabel.textContent = this.value;
    updatePreview();
  });
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

  // Reset adjustments button
  importElements.adjustReset?.addEventListener('click', () => {
    // Reset all adjustment sliders to defaults
    if (importElements.contrast) importElements.contrast.value = '0';
    if (importElements.brightness) importElements.brightness.value = '0';
    if (importElements.saturation) importElements.saturation.value = '0';
    if (importElements.gamma) importElements.gamma.value = '100';
    if (importElements.sharpness) importElements.sharpness.value = '0';
    if (importElements.smoothing) importElements.smoothing.value = '0';
    if (importElements.blackPoint) importElements.blackPoint.value = '0';
    if (importElements.whitePoint) importElements.whitePoint.value = '255';
    if (importElements.balanceR) importElements.balanceR.value = '0';
    if (importElements.balanceG) importElements.balanceG.value = '0';
    if (importElements.balanceB) importElements.balanceB.value = '0';
    // Update value labels
    const contrastLabel = document.getElementById('importContrastValue');
    const brightnessLabel = document.getElementById('importBrightnessValue');
    if (contrastLabel) contrastLabel.textContent = '0';
    if (brightnessLabel) brightnessLabel.textContent = '0';
    if (importElements.saturationValue) importElements.saturationValue.textContent = '0';
    if (importElements.gammaValue) importElements.gammaValue.textContent = '1.0';
    if (importElements.sharpnessValue) importElements.sharpnessValue.textContent = '0';
    if (importElements.smoothingValue) importElements.smoothingValue.textContent = '0';
    if (importElements.levelsValue) importElements.levelsValue.textContent = '0-255';
    if (importElements.colorBalanceValue) importElements.colorBalanceValue.textContent = '0/0/0';
    updatePreview();
  });

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

  // Eyedropper: click output preview to find and edit ULA+ palette color
  importPreviewCanvas?.addEventListener('click', (e) => {
    const fmt = importElements.format?.value || 'scr';
    if (fmt !== 'ulaplus') return;

    const palette = importUlaPlusPalette || lastImportUlaPlusAutoPalette;
    if (!palette) return;

    // Get click position on canvas, accounting for CSS scaling
    const rect = importPreviewCanvas.getBoundingClientRect();
    const scaleX = importPreviewCanvas.width / rect.width;
    const scaleY = importPreviewCanvas.height / rect.height;
    const canvasX = Math.floor((e.clientX - rect.left) * scaleX);
    const canvasY = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = importPreviewCanvas.getContext('2d');
    if (!ctx) return;
    const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;

    // Find closest matching palette entry
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < 64; i++) {
      const rgb = grb332ToRgb(palette[i]);
      const dr = rgb[0] - pixel[0];
      const dg = rgb[1] - pixel[1];
      const db = rgb[2] - pixel[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
        if (dist === 0) break;
      }
    }

    // If auto mode, promote auto palette to editable
    if (!importUlaPlusPalette) {
      importUlaPlusPalette = new Uint8Array(palette);
      buildImportUlaPlusPaletteGrid();
      showImportPaletteGrid();
      if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = '';
    }

    openImportUlaPlusColorPicker(bestIndex);
  });

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
  const isVariableSize = (f) => f === 'zxp' || f === 'ch$' || f === 'btile' || f === 'wtile';
  const maxW = () => { const f = format(); return (f === 'bsc' || f === 'bmc4') ? 384 : isVariableSize(f) ? 2048 : getImportFormatDimensions(f).w; };
  const maxH = () => { const f = format(); return (f === 'bsc' || f === 'bmc4') ? 304 : isVariableSize(f) ? 2048 : getImportFormatDimensions(f).h; };
  /** Snap width to tile-aligned value for btile/wtile */
  const snapW = (w) => { const f = format(); const tileW = f === 'btile' ? 16 : f === 'wtile' ? 24 : 0; return tileW ? Math.max(tileW, Math.round(w / tileW) * tileW) : w; };
  /** Snap height to 16px for btile/wtile (tile height) */
  const snapH = (h) => { const f = format(); return (f === 'btile' || f === 'wtile') ? Math.max(16, Math.round(h / 16) * 16) : h; };

  /** Committed size change: snap, clamp, write back, update linked dimension, re-render */
  const onSizeWCommit = () => {
    let newW = Math.max(8, Math.min(maxW(), parseInt(importElements.sizeW?.value || String(maxW()), 10) || maxW()));
    newW = snapW(newW);
    importSize.w = newW;
    if (importElements.sizeW && parseInt(importElements.sizeW.value, 10) !== newW) importElements.sizeW.value = String(newW);
    if (importElements.lockAspect?.checked && importCrop.h > 0) {
      const aspect = getSourceAspect();
      let newH = Math.round(newW / aspect);
      newH = snapH(Math.max(8, Math.min(maxH(), newH)));
      importSize.h = newH;
      if (importElements.sizeH) importElements.sizeH.value = String(importSize.h);
    }
    updateAll();
  };
  const onSizeHCommit = () => {
    let newH = Math.max(8, Math.min(maxH(), parseInt(importElements.sizeH?.value || String(maxH()), 10) || maxH()));
    newH = snapH(newH);
    importSize.h = newH;
    if (importElements.sizeH && parseInt(importElements.sizeH.value, 10) !== newH) importElements.sizeH.value = String(newH);
    if (importElements.lockAspect?.checked && importCrop.w > 0) {
      const aspect = getSourceAspect();
      let newW = Math.round(newH * aspect);
      newW = snapW(Math.max(8, Math.min(maxW(), newW)));
      importSize.w = newW;
      if (importElements.sizeW) importElements.sizeW.value = String(importSize.w);
    }
    updateAll();
  };

  /** Live input: update preview without snapping or rewriting the input field.
   *  Uses a debounce timer to avoid expensive re-renders on every keystroke. */
  let sizeInputTimer = null;
  const onSizeWInput = () => {
    const raw = parseInt(importElements.sizeW?.value, 10);
    if (!raw || raw < 8) return; // don't update while user is still typing
    const newW = Math.min(maxW(), raw);
    if (newW === importSize.w) return;
    importSize.w = newW;
    if (importElements.lockAspect?.checked && importCrop.h > 0) {
      const aspect = getSourceAspect();
      importSize.h = Math.max(8, Math.min(maxH(), Math.round(newW / aspect)));
      if (importElements.sizeH) importElements.sizeH.value = String(importSize.h);
    }
    clearTimeout(sizeInputTimer);
    sizeInputTimer = setTimeout(updateAll, 300);
  };
  const onSizeHInput = () => {
    const raw = parseInt(importElements.sizeH?.value, 10);
    if (!raw || raw < 8) return;
    const newH = Math.min(maxH(), raw);
    if (newH === importSize.h) return;
    importSize.h = newH;
    if (importElements.lockAspect?.checked && importCrop.w > 0) {
      const aspect = getSourceAspect();
      importSize.w = Math.max(8, Math.min(maxW(), Math.round(newH * aspect)));
      if (importElements.sizeW) importElements.sizeW.value = String(importSize.w);
    }
    clearTimeout(sizeInputTimer);
    sizeInputTimer = setTimeout(updateAll, 300);
  };

  importElements.sizeW?.addEventListener('change', onSizeWCommit);
  importElements.sizeH?.addEventListener('change', onSizeHCommit);
  importElements.sizeW?.addEventListener('input', onSizeWInput);
  importElements.sizeH?.addEventListener('input', onSizeHInput);

  // Tile to screens checkbox
  importElements.tile?.addEventListener('change', function() {
    importTileEnabled = this.checked;
    if (importElements.tileInfo) {
      importElements.tileInfo.style.visibility = importTileEnabled ? 'visible' : 'hidden';
    }
    // Disable Position/Size/FitMode/LockAspect when tiling (they're overridden)
    const disabled = importTileEnabled;
    if (importElements.offsetX) importElements.offsetX.disabled = disabled;
    if (importElements.offsetY) importElements.offsetY.disabled = disabled;
    if (importElements.sizeW) importElements.sizeW.disabled = disabled;
    if (importElements.sizeH) importElements.sizeH.disabled = disabled;
    if (importElements.lockAspect) importElements.lockAspect.disabled = disabled;
    if (importElements.fitMode) importElements.fitMode.disabled = disabled;
    if (importElements.align) importElements.align.disabled = disabled;
    // Dim the Position/Size labels
    const posLabel = importElements.offsetX?.closest('div')?.previousElementSibling;
    const sizeLabel = importElements.sizeW?.closest('div')?.previousElementSibling;
    if (posLabel) posLabel.style.opacity = disabled ? '0.4' : '';
    if (sizeLabel) sizeLabel.style.opacity = disabled ? '0.4' : '';

    importTileCol = 0;
    importTileRow = 0;
    if (importTileEnabled) {
      updateTileInfo();
    }
    updateTileLabel();
    updateAll();
  });

  // Tile navigation buttons
  importElements.tilePrev?.addEventListener('click', () => {
    if (!importTileEnabled || !importImage) return;
    const format = importElements.format?.value || 'scr';
    const dims = getImportFormatDimensions(format);
    const grid = calculateTileGrid(importCrop.w, importCrop.h, dims.w, dims.h);
    // Move to previous tile (col-major: col changes first)
    importTileCol--;
    if (importTileCol < 0) {
      importTileCol = grid.cols - 1;
      importTileRow--;
      if (importTileRow < 0) importTileRow = grid.rows - 1;
    }
    updateTileLabel();
    updateAll();
  });

  importElements.tileNext?.addEventListener('click', () => {
    if (!importTileEnabled || !importImage) return;
    const format = importElements.format?.value || 'scr';
    const dims = getImportFormatDimensions(format);
    const grid = calculateTileGrid(importCrop.w, importCrop.h, dims.w, dims.h);
    // Move to next tile (col-major: col changes first)
    importTileCol++;
    if (importTileCol >= grid.cols) {
      importTileCol = 0;
      importTileRow++;
      if (importTileRow >= grid.rows) importTileRow = 0;
    }
    updateTileLabel();
    updateAll();
  });

  // Palette control
  paletteSelect?.addEventListener('change', function() {
    applyImportPalette(this.value);
    updatePreview();
  });

  // ULA+ palette source dropdown
  importElements.ulaPlusPaletteSource?.addEventListener('change', function() {
    const val = this.value;
    if (val === 'auto') {
      importUlaPlusPalette = null;
      hideImportPaletteGrid();
      if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = 'none';
      updatePreview();
    } else if (val === 'file') {
      importElements.ulaPlusPalFile?.click();
    } else if (val === 'picture') {
      importElements.ulaPlusScrFile?.click();
    }
  });

  // .pal file input
  importElements.ulaPlusPalFile?.addEventListener('change', function() {
    const file = this.files?.[0];
    if (!file) {
      importElements.ulaPlusPaletteSource.value = 'auto';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(/** @type {ArrayBuffer} */ (e.target?.result));
      let palette;
      if (data.length === 64) {
        palette = data;
      } else if (data.length === 176) {
        // .tap ULA+ palette loader (BASIC + MC): 64-byte palette at offset 110,
        // followed by BASIC line terminator (0x0D) and TAP checksum byte
        palette = data.subarray(110, 174);
      } else {
        alert('Invalid palette file: expected 64-byte .pal or 176-byte .tap ULA+ palette loader, got ' + data.length + ' bytes');
        importElements.ulaPlusPaletteSource.value = 'auto';
        return;
      }
      importUlaPlusPalette = palette;
      buildImportUlaPlusPaletteGrid();
      showImportPaletteGrid();
      if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = '';
      updatePreview();
    };
    reader.onerror = () => {
      importElements.ulaPlusPaletteSource.value = 'auto';
    };
    reader.readAsArrayBuffer(file);
    this.value = '';
  });

  // .scr file input (ULA+ picture)
  importElements.ulaPlusScrFile?.addEventListener('change', function() {
    const file = this.files?.[0];
    if (!file) {
      importElements.ulaPlusPaletteSource.value = 'auto';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(/** @type {ArrayBuffer} */ (e.target?.result));
      if (data.length === ULAPLUS.TOTAL_SIZE) {
        // Extract last 64 bytes as palette
        importUlaPlusPalette = data.slice(ULAPLUS.PALETTE_OFFSET, ULAPLUS.PALETTE_OFFSET + 64);
      } else if (data.length === 64) {
        // Treat as raw palette
        importUlaPlusPalette = data;
      } else {
        alert('Invalid file: expected ULA+ .scr (6976 bytes) or .pal (64 bytes), got ' + data.length + ' bytes');
        importElements.ulaPlusPaletteSource.value = 'auto';
        return;
      }
      buildImportUlaPlusPaletteGrid();
      showImportPaletteGrid();
      if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = '';
      updatePreview();
    };
    reader.onerror = () => {
      importElements.ulaPlusPaletteSource.value = 'auto';
    };
    reader.readAsArrayBuffer(file);
    this.value = '';
  });

  // ULA+ palette reset button
  importElements.ulaPlusPaletteReset?.addEventListener('click', () => {
    importUlaPlusPalette = null;
    if (importElements.ulaPlusPaletteSource) importElements.ulaPlusPaletteSource.value = 'auto';
    hideImportPaletteGrid();
    if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = 'none';
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

  // Import button — dispatches based on mode dropdown
  importBtn?.addEventListener('click', async () => {
    const mode = importElements.modeSelect?.value || 'picture';

    // Flash / Animation modes: read GIF file and import directly
    if (mode === 'flash' || mode === 'animation') {
      if (!importFile) return;
      const file = importFile;
      closeImportDialog();
      try {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        if (mode === 'flash') {
          await importGifAsFlash(data, file.name);
        } else {
          await importAnimatedGif(data, file.name);
        }
      } catch (e) {
        const label = mode === 'flash' ? 'Flash' : 'Animated';
        console.error(label + ' GIF import failed:', e);
        alert('Failed to import ' + label + ' GIF: ' + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }

    // Picture mode: standard import via canvas conversion
    if (!importSourceCanvas) return;

    // --- Tile to screens path ---
    if (importTileEnabled && importImage && typeof addPicture === 'function') {
      const tileFormat = formatSelect?.value || 'scr';
      const dims = getImportFormatDimensions(tileFormat);
      const grid = calculateTileGrid(importCrop.w, importCrop.h, dims.w, dims.h);

      // Check available slots
      const available = (typeof MAX_PICTURES !== 'undefined' && typeof openPictures !== 'undefined')
        ? MAX_PICTURES - openPictures.length : 8;
      if (grid.total > available) {
        if (!confirm('Only ' + available + ' of ' + grid.total + ' tiles can be added (picture limit). Continue?')) {
          return;
        }
      }

      // Determine file extension
      let tileExt;
      if (tileFormat === '53c') tileExt = '.53c';
      else if (tileFormat === 'specscii') tileExt = '.specscii';
      else if (tileFormat === 'bsc') tileExt = '.bsc';
      else if (tileFormat === 'ifl') tileExt = '.ifl';
      else if (tileFormat === 'mlt') tileExt = '.mlt';
      else if (tileFormat === 'bmc4') tileExt = '.bmc4';
      else if (tileFormat === 'rgb3') tileExt = '.3';
      else if (tileFormat === 'gigascreen') tileExt = '.img';
      else if (tileFormat === 'mg8' || tileFormat === 'mg4' || tileFormat === 'mg2' || tileFormat === 'mg1') tileExt = '.' + tileFormat;
      else if (tileFormat === 'hlr') tileExt = '.hlr';
      else if (tileFormat === 'stl') tileExt = '.stl';
      else if (tileFormat === 'zxp') tileExt = '.zxp';
      else if (tileFormat === 'ch$') tileExt = '.ch$';
      else if (tileFormat === 'nxi') tileExt = '.nxi';
      else if (tileFormat === 'sl2') tileExt = '.sl2';
      else tileExt = '.scr';

      const baseName = importFile ? importFile.name.replace(/\.[^.]+$/, '') : 'imported';

      // Read current adjustment parameters
      const tileDithering = ditheringSelect?.value || 'floyd-steinberg';
      const tileContrast = parseInt(contrastSlider?.value || '0', 10);
      const tileBrightness = parseInt(brightnessSlider?.value || '0', 10);
      const tileSaturation = parseInt(saturationSlider?.value || '0', 10);
      const tileGamma = parseInt(gammaSlider?.value || '100', 10) / 100;
      const tileGrayscale = grayscaleCheckbox?.checked || false;
      const tileMonoOutput = monoOutputCheckbox?.checked || false;
      const tileSharpness = parseInt(sharpnessSlider?.value || '0', 10);
      const tileSmoothing = parseInt(smoothingSlider?.value || '0', 10);
      const tileBlackPoint = parseInt(blackPointSlider?.value || '0', 10);
      const tileWhitePoint = parseInt(whitePointSlider?.value || '255', 10);
      const tileBalanceR = parseInt(balanceRSlider?.value || '0', 10);
      const tileBalanceG = parseInt(balanceGSlider?.value || '0', 10);
      const tileBalanceB = parseInt(balanceBSlider?.value || '0', 10);

      // For ULA+ auto palette: generate once from full image, reuse for all tiles
      let tileUlaPlusPalette = importUlaPlusPalette;
      if (tileFormat === 'ulaplus' && !tileUlaPlusPalette) {
        // Render full crop to source canvas first to generate auto palette
        const savedCrop = { ...importCrop };
        const savedFitMode = importFitMode;
        const savedOffset = { ...importOffset };
        const savedSize = { ...importSize };
        importFitMode = 'stretch';
        importOffset = { x: 0, y: 0 };
        importSize = { w: dims.w, h: dims.h };
        applyCropAndFit();
        const fullResult = convertToUlaPlus(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, null);
        tileUlaPlusPalette = fullResult.palette;
        importCrop = savedCrop;
        importFitMode = savedFitMode;
        importOffset = savedOffset;
        importSize = savedSize;
      }

      // Save original state
      const savedCrop = { ...importCrop };
      const savedFitMode = importFitMode;
      const savedOffset = { ...importOffset };
      const savedSize = { ...importSize };

      // Force stretch mode with no offset for tiling
      importFitMode = 'stretch';
      importOffset = { x: 0, y: 0 };

      // chr$ gigascreen mode: applies to all tiles uniformly
      const tileChrIsGigascreen = tileFormat === 'ch$' && importElements.chrMode?.value === 'gigascreen';

      let stopped = false;
      for (let row = 0; row < grid.rows && !stopped; row++) {
        for (let col = 0; col < grid.cols && !stopped; col++) {
          // Calculate tile sub-region in source coordinates
          const tileX = savedCrop.x + col * dims.w;
          const tileY = savedCrop.y + row * dims.h;
          const tileW = Math.min(dims.w, savedCrop.x + savedCrop.w - tileX);
          const tileH = Math.min(dims.h, savedCrop.y + savedCrop.h - tileY);

          // Set crop to this tile's sub-region
          importCrop = { x: tileX, y: tileY, w: tileW, h: tileH };
          // Set size to actual tile dimensions (edge tiles may be smaller → black padding)
          importSize = { w: tileW, h: tileH };

          // Render this tile to source canvas
          applyCropAndFit();

          // Convert using the same format conversion chain
          let tileData;
          let tileOutputFormat;

          if (tileFormat === '53c') {
            const pattern = importElements.pattern53c?.value || 'checker';
            tileData = convertTo53c(importSourceCanvas, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, pattern);
            tileOutputFormat = FORMAT.ATTR_53C;
          } else if (tileFormat === 'specscii') {
            const tileSpecsciiCharset = importElements.specsciiCharset?.value || 'full';
            const specsciiResult = convertToSpecscii(importSourceCanvas, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileSpecsciiCharset);
            tileData = specsciiResult.stream;
            tileOutputFormat = FORMAT.SPECSCII;
          } else if (tileFormat === 'bsc' && importSourceCanvasBsc) {
            tileData = convertToBsc(importSourceCanvasBsc, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            tileOutputFormat = FORMAT.BSC;
          } else if (tileFormat === 'ifl') {
            tileData = convertToIfl(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            tileOutputFormat = FORMAT.IFL;
          } else if (tileFormat === 'mlt') {
            tileData = convertToMlt(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            tileOutputFormat = FORMAT.MLT;
          } else if (tileFormat === 'bmc4' && importSourceCanvasBsc) {
            tileData = convertToBmc4(importSourceCanvasBsc, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            tileOutputFormat = FORMAT.BMC4;
          } else if (tileFormat === 'rgb3') {
            tileData = convertToRgb3(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB);
            tileOutputFormat = FORMAT.RGB3;
          } else if (tileFormat === 'gigascreen' || tileFormat === 'mg8' || tileFormat === 'mg4' || tileFormat === 'mg2' || tileFormat === 'mg1') {
            const cellH = tileFormat === 'mg4' ? 4 : tileFormat === 'mg2' ? 2 : tileFormat === 'mg1' ? 1 : 8;
            tileData = convertToGigascreen(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, cellH);
            tileOutputFormat = (tileFormat === 'gigascreen') ? FORMAT.GIGASCREEN : FORMAT.MGH;
          } else if (tileFormat === 'hlr') {
            const hlrPattern = getSelectedImportHlrPattern();
            tileData = convertToHlr(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, hlrPattern);
            tileOutputFormat = FORMAT.HLR;
          } else if (tileFormat === 'stl') {
            tileData = convertToStl(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB);
            tileOutputFormat = FORMAT.STL;
          } else if (tileFormat === 'mono_full') {
            tileData = convertToMono(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, 3);
            tileOutputFormat = FORMAT.MONO_FULL;
          } else if (tileFormat === 'mono_2_3') {
            tileData = convertToMono(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, 2);
            tileOutputFormat = FORMAT.MONO_2_3;
          } else if (tileFormat === 'mono_1_3') {
            tileData = convertToMono(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, 1);
            tileOutputFormat = FORMAT.MONO_1_3;
          } else if (tileFormat === 'ulaplus') {
            const result = convertToUlaPlus(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileUlaPlusPalette);
            tileData = result.data;
            tileOutputFormat = FORMAT.SCR_ULAPLUS;
            // Set ULA+ palette from first tile
            if (row === 0 && col === 0) {
              ulaPlusPalette = result.palette;
              isUlaPlusMode = true;
            }
          } else if (tileFormat === 'zxp' && importSourceCanvasZxp) {
            if (importElements.zxpPaletteType?.value === 'ulaplus') {
              const result = convertToZxpUlaPlus(importSourceCanvasZxp, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, null);
              tileData = result.data;
              if (row === 0 && col === 0) {
                ulaPlusPalette = result.palette.slice();
                isUlaPlusMode = true;
              }
            } else {
              tileData = convertToZxp(importSourceCanvasZxp, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            }
            tileOutputFormat = FORMAT.ZXP;
          } else if (tileFormat === 'ch$' && importSourceCanvasZxp) {
            // chr$ shares the linear ZXP layout; cell-interleaving is done at save time.
            // Gigascreen mode produces two flickering frames concatenated.
            if (tileChrIsGigascreen) {
              tileData = convertToZxpGigascreen(importSourceCanvasZxp, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB);
            } else {
              tileData = convertToZxp(importSourceCanvasZxp, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            }
            tileOutputFormat = FORMAT.CHR;
          } else if (tileFormat === 'nxi') {
            tileData = convertToNxi(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB);
            tileOutputFormat = FORMAT.NXI;
          } else if (tileFormat === 'sl2') {
            tileData = convertToSl2(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB);
            tileOutputFormat = FORMAT.SL2;
          } else {
            tileData = convertToScr(importSourceCanvas, tileDithering, tileBrightness, tileContrast, tileSaturation, tileGamma, tileGrayscale, tileSharpness, tileSmoothing, tileBlackPoint, tileWhitePoint, tileBalanceR, tileBalanceG, tileBalanceB, tileMonoOutput);
            tileOutputFormat = FORMAT.SCR;
          }

          const tileFileName = baseName + '_' + col + '_' + row + tileExt;
          let tilePicture = null;
          if (tileOutputFormat === FORMAT.CHR && tileChrIsGigascreen && typeof makePicture === 'function' && importSourceCanvasZxp) {
            // chr$ gigascreen tile: 2-plane Picture with linear bitmap+attrs per frame.
            const tcgW = importSourceCanvasZxp.width;
            const tcgH = importSourceCanvasZxp.height;
            const tcgCols = tcgW >> 3;
            const tcgBitmapSize = tcgCols * tcgH;
            const tcgAttrRows = Math.ceil(tcgH / 8);
            const tcgAttrSize = tcgCols * tcgAttrRows;
            const tcgFrameSize = tcgBitmapSize + tcgAttrSize;
            tilePicture = makePicture({
              sourceFormat: 'ch$',
              fileName: tileFileName,
              width: tcgW,
              height: tcgH,
              attrCellHeight: 8,
              planeCount: 2,
              contentMode: 'pixel',
              colorMode: 'gigascreen'
            });
            tilePicture.planes[0].bitmap.set(tileData.subarray(0, tcgBitmapSize));
            tilePicture.planes[0].attrs.set(tileData.subarray(tcgBitmapSize, tcgFrameSize));
            tilePicture.planes[1].bitmap.set(tileData.subarray(tcgFrameSize, tcgFrameSize + tcgBitmapSize));
            tilePicture.planes[1].attrs.set(tileData.subarray(tcgFrameSize + tcgBitmapSize, tcgFrameSize * 2));
            if (typeof generateGigascreenVirtualPalette === 'function' && row === 0 && col === 0) {
              generateGigascreenVirtualPalette();
            }
          } else if ((tileOutputFormat === FORMAT.ZXP || tileOutputFormat === FORMAT.CHR) && typeof importZxp === 'function' && importSourceCanvasZxp) {
            const tW = importSourceCanvasZxp.width;
            const tH = importSourceCanvasZxp.height;
            const tCols = tW >> 3;
            const tBitmapSize = tCols * tH;
            const tAttrRows = Math.ceil(tH / 8);
            const tAttrSize = tCols * tAttrRows;
            const tBitmap = tileData.subarray(0, tBitmapSize);
            const tAttrs = tileData.subarray(tBitmapSize, tBitmapSize + tAttrSize);
            const tPalette = (tileOutputFormat === FORMAT.ZXP && importElements.zxpPaletteType?.value === 'ulaplus')
              ? tileData.subarray(tBitmapSize + tAttrSize, tBitmapSize + tAttrSize + 64)
              : null;
            tilePicture = importZxp(tBitmap, tAttrs, tileFileName, tW, tH, 8, tPalette);
            // chr$ shares the linear layout but needs the source format tagged.
            if (tilePicture && tileOutputFormat === FORMAT.CHR) {
              tilePicture.sourceFormat = 'ch$';
            }
          } else if (typeof importScr === 'function') {
            if (tileOutputFormat === FORMAT.SCR_ULAPLUS) {
              tilePicture = importScrUlaPlus(tileData, tileFileName);
            } else if (tileOutputFormat === FORMAT.SCR) {
              tilePicture = importScr(tileData, tileFileName);
            }
          }
          if ((tileOutputFormat === FORMAT.GIGASCREEN || tileOutputFormat === FORMAT.MGH) && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
            const cellH = tileFormat === 'mg4' ? 4 : tileFormat === 'mg2' ? 2 : tileFormat === 'mg1' ? 1 : 8;
            const tAttrSize = Math.ceil(192 / cellH) * 32;
            const tFSize = 6144 + tAttrSize;
            const isMgh = tileOutputFormat === FORMAT.MGH;
            tilePicture = makePicture({
              sourceFormat: isMgh ? 'mgh' : 'img',
              fileName: tileFileName,
              width: 256,
              height: 192,
              attrCellHeight: cellH,
              planeCount: 2,
              contentMode: 'pixel',
              colorMode: 'gigascreen'
            });
            tilePicture.planes[0].bitmap = deinterleaveBitmap(tileData, 0, 256, 192);
            for (let i = 0; i < tAttrSize; i++) {
              tilePicture.planes[0].attrs[i] = tileData[6144 + i];
            }
            tilePicture.planes[1].bitmap = deinterleaveBitmap(tileData, tFSize, 256, 192);
            for (let i = 0; i < tAttrSize; i++) {
              tilePicture.planes[1].attrs[i] = tileData[tFSize + 6144 + i];
            }
            if (typeof generateGigascreenVirtualPalette === 'function' && row === 0 && col === 0) {
              generateGigascreenVirtualPalette();
            }
          }
          if (tileOutputFormat === FORMAT.STL && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
            const stlAS = 1536;
            const stlFS = 6144 + stlAS;
            tilePicture = makePicture({
              sourceFormat: 'stl',
              fileName: tileFileName,
              width: 256,
              height: 192,
              attrCellHeight: 4,
              planeCount: 2,
              contentMode: 'pixel',
              colorMode: 'gigascreen'
            });
            tilePicture.planes[0].bitmap = deinterleaveBitmap(tileData, 0, 256, 192);
            for (let i = 0; i < stlAS; i++) {
              tilePicture.planes[0].attrs[i] = tileData[6144 + i];
            }
            tilePicture.planes[1].bitmap = deinterleaveBitmap(tileData, stlFS, 256, 192);
            for (let i = 0; i < stlAS; i++) {
              tilePicture.planes[1].attrs[i] = tileData[stlFS + 6144 + i];
            }
            if (typeof generateGigascreenVirtualPalette === 'function' && row === 0 && col === 0) {
              generateGigascreenVirtualPalette();
            }
          }
          if (tileOutputFormat === FORMAT.HLR && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
            tilePicture = makePicture({
              sourceFormat: 'hlr',
              fileName: tileFileName,
              width: 256,
              height: 192,
              attrCellHeight: 8,
              planeCount: 2,
              contentMode: 'pixel',
              colorMode: 'gigascreen'
            });
            if (tileData.hlrPattern && tileData.hlrPattern.length === 8) {
              tilePicture.pattern = new Uint8Array(tileData.hlrPattern);
            }
            tilePicture.planes[0].bitmap = deinterleaveBitmap(tileData, 0, 256, 192);
            for (let i = 0; i < 768; i++) {
              tilePicture.planes[0].attrs[i] = tileData[6144 + i];
            }
            tilePicture.planes[1].bitmap = deinterleaveBitmap(tileData, 6912, 256, 192);
            for (let i = 0; i < 768; i++) {
              tilePicture.planes[1].attrs[i] = tileData[6912 + 6144 + i];
            }
            if (typeof generateGigascreenVirtualPalette === 'function' && row === 0 && col === 0) {
              generateGigascreenVirtualPalette();
            }
          }
          const addResult = addPicture(tileFileName, tileOutputFormat, tileData, tilePicture);
          if (addResult < 0) {
            stopped = true;
          }
        }
      }

      // Restore original state
      importCrop = savedCrop;
      importFitMode = savedFitMode;
      importOffset = savedOffset;
      importSize = savedSize;

      // Set up NXI/SL2 palette and mode for viewer/editor after tile import
      if ((tileFormat === 'nxi' || tileFormat === 'sl2') && typeof generateDefaultNextPalette === 'function') {
        nxiLayer2Mode = '256x192';
        nxiResolvedPalette = generateDefaultNextPalette();
      }

      // Close dialog and update UI
      closeImportDialog();

      if (typeof setPalette === 'function' && importPaletteId) {
        const paletteDropdown = /** @type {HTMLSelectElement} */ (document.getElementById('paletteSelect'));
        if (paletteDropdown) paletteDropdown.value = importPaletteId;
        setPalette(importPaletteId);
      }

      updateFileInfo();
      toggleFormatControlsVisibility();
      renderScreen();
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
      if (typeof updateEditorState === 'function') updateEditorState();
      if (typeof initLayers === 'function') initLayers();
      return; // Skip single-import path
    }

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
    let chrIsGigascreen = false;

    if (format === '53c') {
      const pattern = importElements.pattern53c?.value || 'checker';
      outputData = convertTo53c(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, pattern);
      outputFormat = FORMAT.ATTR_53C;
      fileExt = '.53c';
    } else if (format === 'specscii') {
      const saveSpecsciiCharset = importElements.specsciiCharset?.value || 'full';
      const specsciiResult = convertToSpecscii(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, saveSpecsciiCharset);
      outputData = specsciiResult.stream;
      outputFormat = FORMAT.SPECSCII;
      fileExt = '.specscii';
    } else if (format === 'bsc' && importSourceCanvasBsc) {
      outputData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.BSC;
      fileExt = '.bsc';
    } else if (format === 'bsp' && importSourceCanvasBsc) {
      // BSP uses same conversion as BSC (384x304 with border)
      // screenData stays in BSC layout for rendering; BSP header is only used at save time
      outputData = convertToBsc(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.BSP;
      fileExt = '.bsp';
    } else if (format === 'ifl') {
      outputData = convertToIfl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.IFL;
      fileExt = '.ifl';
    } else if (format === 'mlt') {
      outputData = convertToMlt(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.MLT;
      fileExt = '.mlt';
    } else if (format === 'bmc4' && importSourceCanvasBsc) {
      outputData = convertToBmc4(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.BMC4;
      fileExt = '.bmc4';
    } else if (format === 'rgb3') {
      outputData = convertToRgb3(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.RGB3;
      fileExt = '.3';
    } else if (format === 'gigascreen' || format === 'mg8' || format === 'mg4' || format === 'mg2' || format === 'mg1') {
      const cellH = format === 'mg4' ? 4 : format === 'mg2' ? 2 : format === 'mg1' ? 1 : 8;
      outputData = convertToGigascreen(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, cellH);
      outputFormat = (format === 'gigascreen') ? FORMAT.GIGASCREEN : FORMAT.MGH;
      fileExt = format === 'gigascreen' ? '.img' : '.' + format;
    } else if (format === 'hlr') {
      const hlrPattern = getSelectedImportHlrPattern();
      outputData = convertToHlr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, hlrPattern);
      outputFormat = FORMAT.HLR;
      fileExt = '.hlr';
    } else if (format === 'stl') {
      outputData = convertToStl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.STL;
      fileExt = '.stl';
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
      const result = convertToUlaPlus(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, importUlaPlusPalette);
      outputData = result.data;
      outputFormat = FORMAT.SCR_ULAPLUS;
      fileExt = '.scr';
      // Enable ULA+ mode with generated palette
      ulaPlusPalette = result.palette;
      isUlaPlusMode = true;
    } else if (format === 'zxp' && importSourceCanvasZxp) {
      if (importElements.zxpPaletteType?.value === 'ulaplus') {
        const result = convertToZxpUlaPlus(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, importUlaPlusPalette);
        outputData = result.data;
        // Store palette for editor use
        ulaPlusPalette = result.palette.slice();
        isUlaPlusMode = true;
      } else {
        outputData = convertToZxp(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      }
      outputFormat = FORMAT.ZXP;
      fileExt = '.zxp';
    } else if (format === 'ch$' && importSourceCanvasZxp) {
      // chr$ uses the same linear bitmap+attrs layout as ZXP. Cell-interleaved
      // re-packing is done at save time by exportChrFile(). Gigascreen mode
      // produces two flickering frames concatenated.
      chrIsGigascreen = importElements.chrMode?.value === 'gigascreen';
      if (chrIsGigascreen) {
        outputData = convertToZxpGigascreen(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      } else {
        outputData = convertToZxp(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      }
      outputFormat = FORMAT.CHR;
      fileExt = '.ch$';
    } else if ((format === 'btile' || format === 'wtile') && importSourceCanvasZxp) {
      outputData = convertToNirvanaTile(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      outputFormat = FORMAT.ZXP;
      fileExt = format === 'btile' ? '.btile' : '.wtile';
    } else if (format === 'nxi') {
      outputData = convertToNxi(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.NXI;
      fileExt = '.nxi';
    } else if (format === 'nxi320') {
      outputData = convertToNxi320(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.NXI;
      fileExt = '.nxi';
    } else if (format === 'nxi640') {
      outputData = convertToNxi640(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.NXI;
      fileExt = '.nxi';
    } else if (format === 'sl2') {
      outputData = convertToSl2(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.SL2;
      fileExt = '.sl2';
    } else if (format === 'sl2_320') {
      outputData = convertToSl2_320(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.SL2;
      fileExt = '.sl2';
    } else if (format === 'sl2_640') {
      outputData = convertToSl2_640(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.SL2;
      fileExt = '.sl2';
    } else if (format === 'lores') {
      outputData = convertToLores(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.LORES;
      fileExt = '.slr';
    } else if (format === 'lores_rad') {
      outputData = convertToLoresRad(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      outputFormat = FORMAT.LORES_RAD;
      fileExt = '.rad';
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

    // Create internal picture format for SCR/ULA+/ZXP/chr$ (passed to addPicture, not set globally)
    let newInternalPicture = null;
    if (outputFormat === FORMAT.CHR && chrIsGigascreen && typeof makePicture === 'function' && importSourceCanvasZxp) {
      // chr$ gigascreen: 2-plane Picture with linear bitmap+attrs per frame.
      // Output buffer layout: [bitmap1][attrs1][bitmap2][attrs2]
      const cgW = importSourceCanvasZxp.width;
      const cgH = importSourceCanvasZxp.height;
      const cgCols = cgW >> 3;
      const cgBitmapSize = cgCols * cgH;
      const cgAttrRows = Math.ceil(cgH / 8);
      const cgAttrSize = cgCols * cgAttrRows;
      const cgFrameSize = cgBitmapSize + cgAttrSize;
      newInternalPicture = makePicture({
        sourceFormat: 'ch$',
        fileName: newFileName,
        width: cgW,
        height: cgH,
        attrCellHeight: 8,
        planeCount: 2,
        contentMode: 'pixel',
        colorMode: 'gigascreen'
      });
      newInternalPicture.planes[0].bitmap.set(outputData.subarray(0, cgBitmapSize));
      newInternalPicture.planes[0].attrs.set(outputData.subarray(cgBitmapSize, cgFrameSize));
      newInternalPicture.planes[1].bitmap.set(outputData.subarray(cgFrameSize, cgFrameSize + cgBitmapSize));
      newInternalPicture.planes[1].attrs.set(outputData.subarray(cgFrameSize + cgBitmapSize, cgFrameSize * 2));
      if (typeof generateGigascreenVirtualPalette === 'function') {
        generateGigascreenVirtualPalette();
      }
    } else if ((format === 'btile' || format === 'wtile') && outputFormat === FORMAT.ZXP && typeof importZxp === 'function' && importSourceCanvasZxp) {
      // Nirvana tile: 8×2 multicolor, linear layout
      const tW = importSourceCanvasZxp.width;
      const tH = importSourceCanvasZxp.height;
      const tCols = tW >> 3;
      const tBitmapSize = tCols * tH;
      const tAttrRows = Math.ceil(tH / 2);
      const tAttrSize = tCols * tAttrRows;
      const bitmap = outputData.subarray(0, tBitmapSize);
      const attrs = outputData.subarray(tBitmapSize, tBitmapSize + tAttrSize);
      newInternalPicture = importZxp(bitmap, attrs, newFileName, tW, tH, 2, null);
      if (newInternalPicture) {
        const isBtile = format === 'btile';
        const cellsW = isBtile ? 2 : 3;
        const tilePixW = cellsW * 8;
        const tilesPerRow = tW / tilePixW;
        const tilesPerCol = tH / 16;
        newInternalPicture.nirvanaTileInfo = {
          isBtile: isBtile,
          cellsW: cellsW,
          cellsH: 2,
          tileCount: tilesPerRow * tilesPerCol,
          tilesPerRow: tilesPerRow
        };
      }
    } else if ((outputFormat === FORMAT.ZXP || outputFormat === FORMAT.CHR) && typeof importZxp === 'function' && importSourceCanvasZxp) {
      const zxpW = importSourceCanvasZxp.width;
      const zxpH = importSourceCanvasZxp.height;
      const zxpCols = zxpW >> 3;
      const zxpBitmapSize = zxpCols * zxpH;
      const zxpAttrRows = Math.ceil(zxpH / 8);
      const zxpAttrSize = zxpCols * zxpAttrRows;
      const bitmap = outputData.subarray(0, zxpBitmapSize);
      const attrs = outputData.subarray(zxpBitmapSize, zxpBitmapSize + zxpAttrSize);
      // If ULA+ mode (ZXP only), extract palette from end of output data
      const zxpPalette = (outputFormat === FORMAT.ZXP && importElements.zxpPaletteType?.value === 'ulaplus')
        ? outputData.subarray(zxpBitmapSize + zxpAttrSize, zxpBitmapSize + zxpAttrSize + 64)
        : null;
      newInternalPicture = importZxp(bitmap, attrs, newFileName, zxpW, zxpH, 8, zxpPalette);
      // chr$ shares the linear ZXP layout internally; tag the source format so
      // sync/save uses exportChrFile() instead of ZXP serialization.
      if (newInternalPicture && outputFormat === FORMAT.CHR) {
        newInternalPicture.sourceFormat = 'ch$';
      }
    } else if (typeof importScr === 'function') {
      if (outputFormat === FORMAT.SCR_ULAPLUS) {
        newInternalPicture = importScrUlaPlus(outputData, newFileName);
      } else if (outputFormat === FORMAT.SCR) {
        newInternalPicture = importScr(outputData, newFileName);
      }
    }

    // Create internal picture for Gigascreen / MGH (2-plane gigascreen mode)
    if ((outputFormat === FORMAT.GIGASCREEN || outputFormat === FORMAT.MGH) && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
      const cellH = format === 'mg4' ? 4 : format === 'mg2' ? 2 : format === 'mg1' ? 1 : 8;
      const attrSize = Math.ceil(192 / cellH) * 32;
      const fSize = 6144 + attrSize;
      const isMgh = outputFormat === FORMAT.MGH;
      newInternalPicture = makePicture({
        sourceFormat: isMgh ? 'mgh' : 'img',
        fileName: newFileName,
        width: 256,
        height: 192,
        attrCellHeight: cellH,
        planeCount: 2,
        contentMode: 'pixel',
        colorMode: 'gigascreen'
      });
      newInternalPicture.planes[0].bitmap = deinterleaveBitmap(outputData, 0, 256, 192);
      for (let i = 0; i < attrSize; i++) {
        newInternalPicture.planes[0].attrs[i] = outputData[6144 + i];
      }
      newInternalPicture.planes[1].bitmap = deinterleaveBitmap(outputData, fSize, 256, 192);
      for (let i = 0; i < attrSize; i++) {
        newInternalPicture.planes[1].attrs[i] = outputData[fSize + 6144 + i];
      }
      if (typeof generateGigascreenVirtualPalette === 'function') {
        generateGigascreenVirtualPalette();
      }
    }

    // Create internal picture for STL (2-plane gigascreen, 8x4 attrs, fixed 0x0F bitmap)
    if (outputFormat === FORMAT.STL && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
      const stlAttrSize = 1536;
      const stlFrameSize = 6144 + stlAttrSize;
      newInternalPicture = makePicture({
        sourceFormat: 'stl',
        fileName: newFileName,
        width: 256,
        height: 192,
        attrCellHeight: 4,
        planeCount: 2,
        contentMode: 'pixel',
        colorMode: 'gigascreen'
      });
      newInternalPicture.planes[0].bitmap = deinterleaveBitmap(outputData, 0, 256, 192);
      for (let i = 0; i < stlAttrSize; i++) {
        newInternalPicture.planes[0].attrs[i] = outputData[6144 + i];
      }
      newInternalPicture.planes[1].bitmap = deinterleaveBitmap(outputData, stlFrameSize, 256, 192);
      for (let i = 0; i < stlAttrSize; i++) {
        newInternalPicture.planes[1].attrs[i] = outputData[stlFrameSize + 6144 + i];
      }
      if (typeof generateGigascreenVirtualPalette === 'function') {
        generateGigascreenVirtualPalette();
      }
    }

    // Create internal picture for HLR (2-plane gigascreen, 8x8 attrs, with fill pattern)
    if (outputFormat === FORMAT.HLR && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
      newInternalPicture = makePicture({
        sourceFormat: 'hlr',
        fileName: newFileName,
        width: 256,
        height: 192,
        attrCellHeight: 8,
        planeCount: 2,
        contentMode: 'pixel',
        colorMode: 'gigascreen'
      });
      // Attach fill pattern (set by convertToHlr on the returned buffer)
      if (outputData.hlrPattern && outputData.hlrPattern.length === 8) {
        newInternalPicture.pattern = new Uint8Array(outputData.hlrPattern);
      }
      newInternalPicture.planes[0].bitmap = deinterleaveBitmap(outputData, 0, 256, 192);
      for (let i = 0; i < 768; i++) {
        newInternalPicture.planes[0].attrs[i] = outputData[6144 + i];
      }
      newInternalPicture.planes[1].bitmap = deinterleaveBitmap(outputData, 6912, 256, 192);
      for (let i = 0; i < 768; i++) {
        newInternalPicture.planes[1].attrs[i] = outputData[6912 + 6144 + i];
      }
      if (typeof generateGigascreenVirtualPalette === 'function') {
        generateGigascreenVirtualPalette();
      }
    }

    // Create internal picture for BSP (non-giga + border, uses BSC screenData layout)
    if (outputFormat === FORMAT.BSP && !newInternalPicture && typeof makePicture === 'function' && typeof deinterleaveBitmap === 'function') {
      newInternalPicture = makePicture({
        sourceFormat: 'bsp',
        fileName: newFileName,
        width: 256,
        height: 192,
        attrCellHeight: 8,
        planeCount: 1,
        contentMode: 'pixel',
        colorMode: 'standard'
      });
      newInternalPicture.planes[0].bitmap = deinterleaveBitmap(outputData, 0, 256, 192);
      for (let i = 0; i < 768; i++) {
        newInternalPicture.planes[0].attrs[i] = outputData[6144 + i];
      }
      if (typeof extractBorder === 'function' && outputData.length >= 11136) {
        newInternalPicture.border = extractBorder(outputData, 6912);
      }
      newInternalPicture.bspTitle = '';
      newInternalPicture.bspAuthor = '';
      newInternalPicture.bspConfig = 0x40; // hasBorder
      newInternalPicture.bspBorderColor = 0;
    }

    // Use multi-picture system if available
    if (typeof addPicture === 'function') {
      const result = addPicture(newFileName, outputFormat, outputData, newInternalPicture);
      if (result < 0) {
        // Max pictures reached - still update globals for direct use
        screenData = outputData;
        currentFormat = outputFormat;
        currentFileName = newFileName;
        currentPicture = newInternalPicture;
      }
    } else {
      // Editor not loaded - use direct assignment
      screenData = outputData;
      currentFormat = outputFormat;
      currentFileName = newFileName;
      currentPicture = newInternalPicture;
    }

    // Set up NXI/SL2 palette and mode for viewer/editor after import
    if ((outputFormat === FORMAT.NXI || outputFormat === FORMAT.SL2) && typeof generateDefaultNextPalette === 'function') {
      if (format === 'nxi320' || format === 'sl2_320') {
        nxiLayer2Mode = '320x256';
      } else if (format === 'nxi640' || format === 'sl2_640') {
        nxiLayer2Mode = '640x256';
      } else {
        nxiLayer2Mode = '256x192';
      }
      if (format === 'nxi640') {
        nxiResolvedPalette = typeof parseNxi4bppPalette === 'function' ? parseNxi4bppPalette(outputData) : generateDefaultNext4bppPalette();
      } else if (format === 'nxi' || format === 'nxi320') {
        nxiResolvedPalette = typeof parseNxiPalette === 'function' ? parseNxiPalette(outputData) : generateDefaultNextPalette();
      } else if (format === 'sl2_640') {
        nxiResolvedPalette = typeof generateDefaultNext4bppPalette === 'function' ? generateDefaultNext4bppPalette() : generateDefaultNextPalette();
      } else {
        nxiResolvedPalette = generateDefaultNextPalette();
      }
    }

    // Set up LoRes palette after import
    if (outputFormat === FORMAT.LORES && typeof generateDefaultNextPalette === 'function') {
      nxiResolvedPalette = generateDefaultNextPalette();
    }
    if (outputFormat === FORMAT.LORES_RAD && typeof generateDefaultNext4bppPalette === 'function') {
      nxiResolvedPalette = generateDefaultNext4bppPalette();
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

    // Signal completion to any in-progress batch "Add All" loop.
    if (importBatchResolve) {
      const resolve = importBatchResolve;
      importBatchResolve = null;
      resolve(true);
    }
  });

  // "Add All" button — imports the current image plus every queued image
  // using the current dialog settings (one Picture per file).
  importElements.addAllBtn?.addEventListener('click', async () => {
    if (importBatchActive) return;
    if (!importFile || !importSourceCanvas) return;
    // Flash/animation modes are per-file choices; not applicable to batch import.
    const mode = importElements.modeSelect?.value || 'picture';
    if (mode !== 'picture') return;
    // Tile-to-screens already produces multiple pictures from a single file;
    // combining it with batch import would multiply picture output unexpectedly.
    if (importTileEnabled) {
      alert('Disable "Tile to screens" to use Add All.');
      return;
    }

    const runOne = () => new Promise((resolve) => {
      let resolved = false;
      const done = (ok) => {
        if (resolved) return;
        resolved = true;
        if (importBatchResolve === done) importBatchResolve = null;
        resolve(ok);
      };
      importBatchResolve = done;
      importBtn?.click();
      // Safety net: if the Import handler bails silently, unblock the batch.
      setTimeout(() => done(false), 30000);
    });

    importBatchActive = true;
    try {
      // Import the currently-displayed image first.
      await runOne();

      // Drain the queue, stopping if we run out of picture slots.
      while (importQueue.length > 0) {
        if (typeof MAX_PICTURES !== 'undefined' && typeof openPictures !== 'undefined'
            && openPictures.length >= MAX_PICTURES) {
          break;
        }
        const nextFile = importQueue.shift();
        if (!nextFile) break;
        try {
          await loadImageIntoDialog(nextFile);
        } catch (e) {
          console.error('Batch import: failed to load ' + nextFile.name + ':', e);
          continue;
        }
        await runOne();
      }
    } finally {
      importBatchActive = false;
      importBatchResolve = null;
      closeImportDialog();
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
    // Update the brightness label so the user sees the auto-detected value
    const brightnessLabel = document.getElementById('importBrightnessValue');
    if (brightnessLabel) brightnessLabel.textContent = String(Math.max(-100, Math.min(100, adjustment)));
  }
}

/**
 * Open import dialog with image file
 * @param {File} file - Image file to import
 */
function openImportDialog(file) {
  importFile = file;
  if (!importElements.dialog) return;

  // Configure "Add All" button — visible only when there are queued images
  // and at least one picture slot remains after adding the current one.
  if (importElements.addAllBtn) {
    let remainingSlots = Infinity;
    if (typeof MAX_PICTURES !== 'undefined' && typeof openPictures !== 'undefined') {
      // -1 accounts for the current image that will use a slot on "Import".
      remainingSlots = Math.max(0, MAX_PICTURES - openPictures.length - 1);
    }
    const queued = importQueue.length;
    const batchCount = Math.min(queued, remainingSlots);
    if (batchCount > 0) {
      importElements.addAllBtn.textContent = 'Add All (' + (batchCount + 1) + ')';
      importElements.addAllBtn.style.display = '';
      // Trim any excess files that won't fit.
      if (queued > batchCount) importQueue.length = batchCount;
    } else {
      importElements.addAllBtn.style.display = 'none';
      importQueue = [];
    }
  }

  // Configure import mode dropdown for animated GIFs
  if (importElements.modeSelect) {
    importElements.modeSelect.style.display = 'none';
    importElements.modeSelect.value = 'picture';
  }
  if (file.name.toLowerCase().endsWith('.gif')) {
    file.arrayBuffer().then(buf => {
      const data = new Uint8Array(buf);
      const frameCount = countGifFrames(data);
      if (frameCount > 1 && importElements.modeSelect) {
        // Show dropdown with available modes
        const sel = importElements.modeSelect;
        sel.innerHTML = '<option value="picture">Picture</option>';
        if (frameCount === 2) {
          sel.innerHTML += '<option value="flash">Flash</option>';
        }
        sel.innerHTML += '<option value="animation">Animation</option>';
        sel.style.display = '';
      }
    }).catch(() => {});
  }

  // Reset controls using cached elements
  if (importElements.dithering) importElements.dithering.value = 'none';
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
  const brightnessLabel = document.getElementById('importBrightnessValue');
  if (brightnessLabel) brightnessLabel.textContent = '0';
  const contrastLabel = document.getElementById('importContrastValue');
  if (contrastLabel) contrastLabel.textContent = '0';
  if (importElements.gammaValue) importElements.gammaValue.textContent = '1.0';
  if (importElements.sharpnessValue) importElements.sharpnessValue.textContent = '0';
  if (importElements.smoothingValue) importElements.smoothingValue.textContent = '0';
  if (importElements.saturationValue) importElements.saturationValue.textContent = '0';
  if (importElements.levelsValue) importElements.levelsValue.textContent = '0-255';
  if (importElements.colorBalanceValue) importElements.colorBalanceValue.textContent = '0/0/0';

  // Set palette to current display palette
  if (importElements.palette) importElements.palette.value = currentPaletteId;
  applyImportPalette(currentPaletteId);

  // Reset fit mode, alignment, and paper rule
  if (importElements.fitMode) importElements.fitMode.value = 'stretch';
  importFitMode = 'stretch';
  if (importElements.align) importElements.align.value = 'center';
  importAlign = 'center';
  if (importElements.paperRule) importElements.paperRule.value = 'darker';
  importPaperRule = 'darker';

  // Reset tile state
  importTileEnabled = false;
  importTileCol = 0;
  importTileRow = 0;
  if (importElements.tile) importElements.tile.checked = false;
  if (importElements.tileInfo) importElements.tileInfo.style.visibility = 'hidden';
  // Re-enable controls that tile mode disables
  if (importElements.offsetX) importElements.offsetX.disabled = false;
  if (importElements.offsetY) importElements.offsetY.disabled = false;
  if (importElements.sizeW) importElements.sizeW.disabled = false;
  if (importElements.sizeH) importElements.sizeH.disabled = false;
  if (importElements.lockAspect) importElements.lockAspect.disabled = false;
  if (importElements.fitMode) importElements.fitMode.disabled = false;
  if (importElements.align) importElements.align.disabled = false;

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
    const isVarSizeInit = format === 'zxp' || format === 'ch$' || format === 'btile' || format === 'wtile';
    let defaultW, defaultH;
    if (format === 'btile') { defaultW = 256; defaultH = 192; }
    else if (format === 'wtile') { defaultW = 240; defaultH = 192; }
    else { const fmtDimsInit = getImportFormatDimensions(format); defaultW = fmtDimsInit.w; defaultH = fmtDimsInit.h; }
    importSize = { w: defaultW, h: defaultH };
    if (importElements.sizeW) {
      importElements.sizeW.value = String(defaultW);
      importElements.sizeW.max = String(
        (format === 'bsc' || format === 'bsp' || format === 'bmc4') ? 384 :
        isVarSizeInit ? 2048 : defaultW
      );
    }
    if (importElements.sizeH) {
      importElements.sizeH.value = String(defaultH);
      importElements.sizeH.max = String(
        (format === 'bsc' || format === 'bsp' || format === 'bmc4') ? 304 :
        isVarSizeInit ? 2048 : defaultH
      );
    }

    // Apply crop and render source
    applyCropAndFit();

    // Render original with crop overlay
    renderOriginalWithCrop();

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
      const result = convertToUlaPlus(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, importUlaPlusPalette);
      renderUlaPlusToCanvas(result.data, importPreviewCanvas, importZoom);
      if (!importUlaPlusPalette) lastImportUlaPlusAutoPalette = result.palette;
    } else if (format === '53c') {
      const pattern = importElements.pattern53c?.value || 'checker';
      const attrData = convertTo53c(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, pattern);
      render53cToCanvas(attrData, importPreviewCanvas, importZoom, pattern);
    } else if (format === 'specscii') {
      const liveSpecsciiCharset = importElements.specsciiCharset?.value || 'full';
      const specsciiResult = convertToSpecscii(importSourceCanvas, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, liveSpecsciiCharset);
      renderSpecsciiToCanvas(specsciiResult.charGrid, specsciiResult.attrGrid, importPreviewCanvas, importZoom);
    } else if (format === 'ifl') {
      const iflData = convertToIfl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderIflToCanvas(iflData, importPreviewCanvas, importZoom);
    } else if (format === 'mlt') {
      const mltData = convertToMlt(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderMltToCanvas(mltData, importPreviewCanvas, importZoom);
    } else if (format === 'bmc4' && importSourceCanvasBsc) {
      const bmc4Data = convertToBmc4(importSourceCanvasBsc, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderBmc4ToCanvas(bmc4Data, importPreviewCanvas, importZoom);
    } else if (format === 'rgb3') {
      const rgb3Data = convertToRgb3(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderRgb3ToCanvas(rgb3Data, importPreviewCanvas, importZoom);
    } else if (format === 'mono_full') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 3);
      renderMonoToCanvas(monoData, importPreviewCanvas, importZoom, 3);
    } else if (format === 'mono_2_3') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 2);
      renderMonoToCanvas(monoData, importPreviewCanvas, importZoom, 2);
    } else if (format === 'mono_1_3') {
      const monoData = convertToMono(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, 1);
      renderMonoToCanvas(monoData, importPreviewCanvas, importZoom, 1);
    } else if (format === 'hlr') {
      const hlrPattern = getSelectedImportHlrPattern();
      const hlrData = convertToHlr(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, hlrPattern);
      renderGigascreenToCanvas(hlrData, importPreviewCanvas, importZoom, 8);
    } else if (format === 'stl') {
      const stlData = convertToStl(importSourceCanvas, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
      renderGigascreenToCanvas(stlData, importPreviewCanvas, importZoom, 4);
    } else if (format === 'zxp' && importSourceCanvasZxp) {
      if (importElements.zxpPaletteType?.value === 'ulaplus') {
        const result = convertToZxpUlaPlus(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, importUlaPlusPalette);
        renderZxpUlaPlusToCanvas(result.data, importPreviewCanvas, importZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
        if (!importUlaPlusPalette) lastImportUlaPlusAutoPalette = result.palette;
      } else {
        const zxpData = convertToZxp(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
        renderZxpToCanvas(zxpData, importPreviewCanvas, importZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
      }
    } else if (format === 'ch$' && importSourceCanvasZxp) {
      // chr$ uses the same linear bitmap+attrs layout as ZXP. Cell-interleaved
      // re-packing happens at save time in exportChrFile().
      const chrGiga = importElements.chrMode?.value === 'gigascreen';
      if (chrGiga) {
        const chrData = convertToZxpGigascreen(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB);
        renderZxpGigascreenToCanvas(chrData, importPreviewCanvas, importZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
      } else {
        const chrData = convertToZxp(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
        renderZxpToCanvas(chrData, importPreviewCanvas, importZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height);
      }
    } else if ((format === 'btile' || format === 'wtile') && importSourceCanvasZxp) {
      const tileData = convertToNirvanaTile(importSourceCanvasZxp, dithering, brightness, contrast, saturation, gamma, grayscale, sharpness, smoothing, blackPoint, whitePoint, balanceR, balanceG, balanceB, monoOutput);
      renderZxpToCanvas(tileData, importPreviewCanvas, importZoom, importSourceCanvasZxp.width, importSourceCanvasZxp.height, 2);
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
  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsDataURL(file);
}

/**
 * Close import dialog.
 * While a batch "Add All" import is active, the dialog stays open between
 * individual imports — the batch driver calls this itself once the queue
 * is drained.
 */
function closeImportDialog() {
  if (importBatchActive) return;

  if (importElements.dialog) {
    importElements.dialog.style.display = 'none';
  }
  if (importElements.modeSelect) importElements.modeSelect.style.display = 'none';
  if (importElements.addAllBtn) importElements.addAllBtn.style.display = 'none';
  importFile = null;
  importQueue = [];

  // Reset ULA+ palette import state
  importUlaPlusPalette = null;
  lastImportUlaPlusAutoPalette = null;
  if (importUlaPlusSavedEditorPalette !== null) {
    ulaPlusPalette = importUlaPlusSavedEditorPalette;
    importUlaPlusSavedEditorPalette = null;
  }
  importUlaPlusApplyCallback = null;
  if (importElements.ulaPlusPaletteSource) importElements.ulaPlusPaletteSource.value = 'auto';
  hideImportPaletteGrid();
  if (importElements.ulaPlusPaletteReset) importElements.ulaPlusPaletteReset.style.display = 'none';
  if (importPreviewCanvas) importPreviewCanvas.style.cursor = '';
}

/**
 * Load a new image file into the already-open import dialog without resetting
 * user-adjustable settings. Used by the batch "Add All" flow.
 * @param {File} file
 * @returns {Promise<void>} Resolves once the image is loaded and preview refreshed.
 */
function loadImageIntoDialog(file) {
  return new Promise((resolve, reject) => {
    importFile = file;
    const img = new Image();
    img.onload = () => {
      importImage = img;
      importOriginalSize = { width: img.naturalWidth, height: img.naturalHeight };

      const origSizeLabel = document.getElementById('importOriginalSize');
      if (origSizeLabel) origSizeLabel.textContent = `${img.naturalWidth}x${img.naturalHeight}`;

      // Auto-detect crop region (mirrors openImportDialog logic).
      if (img.naturalWidth === 256 && img.naturalHeight === 192) {
        importCrop = { x: 0, y: 0, w: 256, h: 192 };
      } else if (img.naturalWidth > 256 || img.naturalHeight > 192) {
        detectScreenRegion();
      } else {
        importCrop = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
      }
      updateCropInputs();

      // Apply crop and refresh preview using the user's current dialog settings.
      applyCropAndFit();
      renderOriginalWithCrop();
      if (typeof updateImportPreview === 'function') {
        updateImportPreview();
      }
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to load image: ' + file.name));

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        img.src = /** @type {string} */ (e.target.result);
      } else {
        reject(new Error('Failed to read image: ' + file.name));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}


