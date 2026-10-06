'use strict';
// @ts-check
/**
 * Eye-model error metric for choosing a cell's ink/paper pair.
 *
 * Ported from dizher (https://github.com/ruguevara/dizher, MIT, used with the author's
 * permission), `converter/eye.py` and `converter/energy.py`.
 *
 * Every other pair-fit strategy here scores a candidate pair pixel by pixel: how close is each
 * pixel to the nearer of the two colours, or to the line between them. That is not what the eye
 * does. Seen from a normal distance a fine mix of two colours reads as their average, so a pair
 * should be judged by the error that survives the eye's blur, not by the error at the pixel.
 * Judged that way a dithered blend of two colours the cell can paint may beat a flat colour that
 * is nominally closer, which is exactly the trade an artist makes by hand.
 *
 * The energy of a candidate is
 *
 *     E = sum_ch || h * (g (Y_ch - X_ch)) ||^2  +  sum_ch noise_ch || g (Y_ch - X_ch) ||^2
 *
 * in a linear opponent space (S-CIELAB's O1 luminance, O2 red-green, O3 blue-yellow), where X is
 * the target, Y the candidate as it would actually be dithered, h the eye's blur kernel and g a
 * per-pixel lightness gain. The second, unblurred term is what stops the metric calling blue
 * dots on yellow invisible: a pure low-pass model is blind to dot contrast the eye still sees at
 * the viewing distance, and without it a salmon target gets painted in the palette's largest
 * chroma contrast because the means agree.
 *
 * Two of dizher's hard-won tuning notes are kept here. Chroma must NOT get a heavier-tailed or
 * much wider kernel than luma: it then averages away block-scale alternation and starts rewarding
 * colour dithering that is plainly visible. And the opponent rows are rescaled so the ZX palette
 * spans the same range in each channel; over this palette red-green otherwise spans ~3x less than
 * luminance, which made chroma error nearly free.
 *
 * What is NOT ported: dizher solves pair selection as one energy over the whole picture, with a
 * cross-block seam term and a coherence prior, by dynamic programming. Here each block is still
 * scored on its own, with the eye kernel reflected at the block edge, so a candidate is judged by
 * what it does inside its own cell.
 */

/**
 * Linear sRGB to the opponent space the metric compares in, derived as in dizher's energy.py:
 * Poirson & Wandell's XYZ opponent matrix after sRGB->XYZ, with the neutral component removed
 * from both chroma rows so every grey has zero chroma, then each row scaled so the ZX palette's
 * spread is equal in all three channels (std 0.2859, 0.0995, 0.2416 before scaling).
 * Row 0 is luminance, row 1 red-green, row 2 blue-yellow.
 * @type {number[][]}
 */
const LRGB2OPP = [
  [0.266067, 0.601960, 0.000640],
  [-0.164997, 0.547536, -0.382538],
  [-0.108553, -0.422892, 0.531445]
];

/**
 * sRGB byte to linear light in 0..1. The importer's own srgbByteToLinear works on a 0..255 scale;
 * the eye model needs 0..1 because the lightness gain and the dot-noise weights are calibrated
 * against luminance as a fraction of white.
 * @param {number} v - sRGB channel value 0..255
 * @returns {number} linear light 0..1
 */
function eyeLinear(v) {
  return srgbByteToLinear(v) / 255;
}

/** Weight of the luminance channel; the chroma weight is the one worth exposing. */
const EYE_LUMA_WEIGHT = 1.0;

/** @type {number} Weight of both chroma channels against luma (UI: Chroma). */
let eyeChromaWeight = 1.0;

/** @type {number} Blur scale in pixels: k(r) = exp(-(r / scale)^2), so sigma = scale / sqrt(2). */
let eyeBlurScale = 1.4;

/** @type {number} Weight of the unblurred chroma error: dot contrast the blur would miss. */
let eyeChromaNoise = 0.05;

/**
 * @type {number} Weight of the unblurred luma error.
 * dizher leaves this at 0 and lets its direct-binary-search stage tidy up the dot placement
 * afterwards. There is no such stage here, so a metric that rates luma dithering free will
 * happily paint mid grey as a black-and-white checkerboard. Driven by the same slider as the
 * chroma term. Measured over four test pictures, moving it from dizher's 0 to 0.05 cut the
 * per-cell mean error by up to a third for about 2% more blurred error; 0.2 bought nothing more.
 */
let eyeLumaNoise = 0.05;

/** Stray light on the screen, in units of white; flattens the gain towards plain linear light. */
const EYE_FLARE = 0.1;

/** Mid grey's luminance: an error there keeps gain 1. */
const EYE_LIGHTNESS_REF = 0.18;

/** How many pairs survive the cheap prescreen and get scored by the eye model. */
const EYE_CANDIDATES = 12;

/** Tail of the kernel that is dropped; dizher notes 0.1% costs double the time for <0.5% energy. */
const EYE_KERNEL_CUTOFF = 0.01;

/** @type {{scale: number, radius: number, k: Float32Array}|null} Cached 1-D kernel. */
let _eyeKernelCache = null;

/**
 * Half of the separable Gaussian the eye model blurs with, normalised over the 1-D support.
 * The 2-D kernel exp(-(r/scale)^2) is separable exactly, so one 1-D pass per axis is not an
 * approximation of it.
 * @param {number} scale - blur scale in pixels
 * @param {number} maxRadius - support cap; dizher caps at half the shortest cell dimension
 * @returns {{radius: number, k: Float32Array}} kernel of length 2*radius+1
 */
function eyeKernel1D(scale, maxRadius) {
  let radius = Math.max(1, Math.ceil(scale * Math.sqrt(-Math.log(EYE_KERNEL_CUTOFF))));
  if (radius > maxRadius) radius = maxRadius;
  if (_eyeKernelCache && _eyeKernelCache.scale === scale && _eyeKernelCache.radius === radius) {
    return { radius, k: _eyeKernelCache.k };
  }
  const k = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i / scale) * (i / scale));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  _eyeKernelCache = { scale, radius, k };
  return { radius, k };
}

/**
 * Per-pixel gain of the error, dL* / dY at the target's luminance over mid grey's: how sensitive
 * the eye is to an error in linear light. In CIELAB terms roughly 7x higher at black than at mid
 * grey and 3x lower at white, so a brown patch in a black shadow costs about what it looks like
 * instead of its few percent of luminance. Chroma takes the same gain, as CIELAB's a* b* do.
 * @param {number} luminance - linear-light luminance 0..1
 * @returns {number} gain, 1 at mid grey
 */
function eyeLightnessGain(luminance) {
  const slope = (/** @type {number} */ y) => (y > 0.008856451679035631)
    ? Math.pow(Math.cbrt(Math.max(y, 1e-6)), -2) / 3
    : 23.361111111111111 / 3;   // (29/6)^2 / 3, the linear segment of L*
  return slope(luminance + EYE_FLARE) / slope(EYE_LIGHTNESS_REF + EYE_FLARE);
}

// Scratch buffers, sized for the largest ZX attribute block (8x8). Reused across every block
// and every candidate so scoring a picture allocates nothing.
const _EYE_MAX = 64;
const _eyeGain = new Float32Array(_EYE_MAX);          // g
const _eyeX = [new Float32Array(_EYE_MAX), new Float32Array(_EYE_MAX), new Float32Array(_EYE_MAX)];
const _eyeG = new Float32Array(_EYE_MAX);            // blur(g)
const _eyeXB = [new Float32Array(_EYE_MAX), new Float32Array(_EYE_MAX), new Float32Array(_EYE_MAX)];
const _eyeLevel = new Float32Array(_EYE_MAX);
const _eyeBits = new Uint8Array(_EYE_MAX);
const _eyeBG = new Float32Array(_EYE_MAX);           // blur(b * g)
const _eyeTmp = new Float32Array(_EYE_MAX);
const _eyeTmp2 = new Float32Array(_EYE_MAX);

/** Reflect an index back into 0..n-1 the way OpenCV's BORDER_REFLECT_101 does (-1 -> 1). */
function _reflect101(i, n) {
  if (n === 1) return 0;
  while (i < 0 || i >= n) {
    if (i < 0) i = -i;
    if (i >= n) i = 2 * (n - 1) - i;
  }
  return i;
}

/**
 * Separable blur of a w*h field, reflected at the edges. src and dst may not be the same array.
 * @param {Float32Array} src - input, w*h values
 * @param {Float32Array} dst - output, w*h values
 * @param {number} w - width
 * @param {number} h - height
 * @param {Float32Array} k - 1-D kernel of length 2*radius+1
 * @param {number} radius - kernel radius
 * @param {Float32Array} tmp - scratch, at least w*h values
 */
function eyeBlurBlock(src, dst, w, h, k, radius, tmp) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        acc += k[i + radius] * src[row + _reflect101(x + i, w)];
      }
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        acc += k[i + radius] * tmp[_reflect101(y + i, h) * w + x];
      }
      dst[y * w + x] = acc;
    }
  }
}

/**
 * The threshold matrix candidates are halftoned with. dizher scores each pair as the chosen
 * halftoner would paint it, so that pairs are picked for the dots they will actually get; when
 * the halftoner is an error diffuser, void-and-cluster dispersed dots stand in for it (the same
 * stand-in dizher uses, being close to where a direct binary search would land).
 * @returns {{rows: number[][], mw: number, mh: number, divisor: number}}
 */
function eyeStandInMatrix() {
  if (typeof ORDERED_MATRICES !== 'undefined') {
    const picked = (typeof importOrderedMatrix !== 'undefined' && importOrderedMatrix !== 'auto')
      ? ORDERED_MATRICES[importOrderedMatrix] : null;
    const m = picked || ORDERED_MATRICES['void-dispersed-dots'];
    if (m) return { rows: m.rows, mw: m.rows[0].length, mh: m.rows.length, divisor: m.divisor };
  }
  return { rows: [[0]], mw: 1, mh: 1, divisor: 2 };   // plain 50% threshold
}

/**
 * Block state shared by eyeModelPrepare and eyeModelPairCost. `lastSpan2` is how far apart the
 * last scored pair's two colours are in weighted opponent space, which breaks ties.
 * @type {{w: number, h: number, n: number, radius: number, k: Float32Array, m: any, baseX: number, baseY: number, lastSpan2: number}}
 */
const _eyeState = { w: 8, h: 8, n: 64, radius: 3, k: new Float32Array(0), m: null, baseX: 0, baseY: 0, lastSpan2: 0 };

/**
 * Work out everything about a block that does not depend on the candidate pair: the target in
 * weighted opponent space, the lightness gain, and the blurred fields the per-pair cost needs.
 * @param {number[][]} colors - block pixels as [R, G, B] bytes, row-major, 8 per row
 * @param {number} blockW - block width in pixels
 * @param {number} blockH - block height in pixels
 * @param {number} baseX - block's left edge in the picture, for the threshold tile's phase
 * @param {number} baseY - block's top edge in the picture
 */
function eyeModelPrepare(colors, blockW, blockH, baseX, baseY) {
  const n = blockW * blockH;
  const wl = Math.sqrt(EYE_LUMA_WEIGHT), wc = Math.sqrt(Math.max(0, eyeChromaWeight));
  const sw = [wl, wc, wc];
  for (let i = 0; i < n; i++) {
    const c = colors[i];
    const r = eyeLinear(c[0]), g = eyeLinear(c[1]), b = eyeLinear(c[2]);
    _eyeGain[i] = eyeLightnessGain(0.2126 * r + 0.7152 * g + 0.0722 * b);
    for (let ch = 0; ch < 3; ch++) {
      const M = LRGB2OPP[ch];
      _eyeX[ch][i] = (M[0] * r + M[1] * g + M[2] * b) * sw[ch];
    }
  }
  // dizher caps the support at half the shortest cell dimension so that every interaction stays
  // inside the neighbouring cells; here it also keeps a 8x1 or 8x2 block from blurring to mush
  const cap = Math.max(1, Math.floor(Math.min(blockW, blockH) / 2));
  const { radius, k } = eyeKernel1D(eyeBlurScale, cap);
  eyeBlurBlock(_eyeGain, _eyeG, blockW, blockH, k, radius, _eyeTmp);
  for (let ch = 0; ch < 3; ch++) {
    for (let i = 0; i < n; i++) _eyeTmp2[i] = _eyeX[ch][i] * _eyeGain[i];
    eyeBlurBlock(_eyeTmp2, _eyeXB[ch], blockW, blockH, k, radius, _eyeTmp);
  }
  _eyeState.w = blockW;
  _eyeState.h = blockH;
  _eyeState.n = n;
  _eyeState.radius = radius;
  _eyeState.k = k;
  _eyeState.m = eyeStandInMatrix();
  _eyeState.baseX = baseX;
  _eyeState.baseY = baseY;
}

/**
 * Eye-model energy of one candidate pair for the block last passed to eyeModelPrepare().
 * @param {number[]} paperRgb - paper colour as [R, G, B] bytes
 * @param {number[]} inkRgb - ink colour as [R, G, B] bytes
 * @returns {number} energy; lower is better
 */
function eyeModelPairCost(paperRgb, inkRgb) {
  const st = _eyeState, n = st.n, w = st.w, m = st.m;
  const wl = Math.sqrt(EYE_LUMA_WEIGHT), wc = Math.sqrt(Math.max(0, eyeChromaWeight));
  const sw = [wl, wc, wc];
  const pr = eyeLinear(paperRgb[0]), pg = eyeLinear(paperRgb[1]), pb = eyeLinear(paperRgb[2]);
  const ir = eyeLinear(inkRgb[0]), ig = eyeLinear(inkRgb[1]), ib = eyeLinear(inkRgb[2]);
  const paper = [0, 0, 0], span = [0, 0, 0];
  let len2 = 0;
  for (let ch = 0; ch < 3; ch++) {
    const M = LRGB2OPP[ch];
    paper[ch] = (M[0] * pr + M[1] * pg + M[2] * pb) * sw[ch];
    span[ch] = (M[0] * ir + M[1] * ig + M[2] * ib) * sw[ch] - paper[ch];
    len2 += span[ch] * span[ch];
  }
  st.lastSpan2 = len2;

  // Where each pixel sits on the paper-ink segment, clamped to it: what the cell can reach
  if (len2 > 1e-12) {
    for (let i = 0; i < n; i++) {
      let t = ((_eyeX[0][i] - paper[0]) * span[0] + (_eyeX[1][i] - paper[1]) * span[1] +
               (_eyeX[2][i] - paper[2]) * span[2]) / len2;
      _eyeLevel[i] = t < 0 ? 0 : (t > 1 ? 1 : t);
    }
  } else {
    for (let i = 0; i < n; i++) _eyeLevel[i] = 0;
  }

  // ... dithered as it really would be, so the pair is judged on the dots it will get
  for (let y = 0; y < st.h; y++) {
    const mRow = m.rows[(st.baseY + y) % m.mh];
    for (let x = 0; x < w; x++) {
      const thr = (mRow[(st.baseX + x) % m.mw] + 0.5) / m.divisor;
      _eyeBits[y * w + x] = _eyeLevel[y * w + x] > thr ? 1 : 0;
    }
  }

  // blur(e_ch) = paper_ch * blur(g) + span_ch * blur(b g) - blur(x_ch g), the blur being linear
  for (let i = 0; i < n; i++) _eyeTmp2[i] = _eyeBits[i] * _eyeGain[i];
  eyeBlurBlock(_eyeTmp2, _eyeBG, w, st.h, st.k, st.radius, _eyeTmp);

  const noise = [eyeLumaNoise, eyeChromaNoise, eyeChromaNoise];
  let energy = 0;
  for (let ch = 0; ch < 3; ch++) {
    const X = _eyeX[ch], XB = _eyeXB[ch], p = paper[ch], s = span[ch], nz = noise[ch];
    let blurred = 0, raw = 0;
    for (let i = 0; i < n; i++) {
      const eb = p * _eyeG[i] + s * _eyeBG[i] - XB[i];
      blurred += eb * eb;
      if (nz > 0) {
        const e = (p + _eyeBits[i] * s - X[i]) * _eyeGain[i];
        raw += e * e;
      }
    }
    energy += blurred + nz * raw;
  }
  return energy;
}

/**
 * Choose a block's ink/paper pair by the eye-model energy.
 *
 * Scoring all 72 same-brightness pairs this way costs about ten times what the line-projection
 * metrics do, so the pairs are first ranked by the plain line-projection residual and only the
 * best EYE_CANDIDATES of them are scored properly. The eye model reorders near-ties rather than
 * pulling up a pair the cheap metric thought hopeless, so the shortlist loses nothing visible
 * while keeping the preview interactive.
 *
 * @param {number[][]} colors - block pixels as [R, G, B] bytes, row-major, 8 per row
 * @param {{regular: number[][], bright: number[][]}} palette - the 8 regular and 8 bright colours
 * @param {number} [baseX=0] - block's left edge in the picture, for the threshold tile's phase
 * @param {number} [baseY=0] - block's top edge in the picture
 * @returns {{ink: number, paper: number, bright: boolean, inkRgb: number[], paperRgb: number[]}}
 */
function findBestPairEyeModel(colors, palette, baseX = 0, baseY = 0) {
  const n = colors.length;
  const blockW = 8, blockH = n / blockW;
  if (n === 0 || n > _EYE_MAX || blockH !== Math.floor(blockH)) {
    return findBestPairBlendFit(colors, palette);
  }

  // ---- cheap prescreen: line-projection residual in linear light, no grain penalty
  const lin = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = colors[i];
    lin[i] = [eyeLinear(c[0]), eyeLinear(c[1]), eyeLinear(c[2])];
  }
  /** @type {Array<{bright: number, ink: number, paper: number, score: number}>} */
  const cands = [];
  for (let bright = 0; bright <= 1; bright++) {
    const pal = bright ? palette.bright : palette.regular;
    for (let ink = 0; ink < 8; ink++) {
      if (importDisabledColors[bright][ink]) continue;
      for (let paper = ink; paper < 8; paper++) {
        if (importDisabledColors[bright][paper]) continue;
        const inkC = pal[ink], paperC = pal[paper];
        const ir = eyeLinear(inkC[0]), ig = eyeLinear(inkC[1]), ib = eyeLinear(inkC[2]);
        const dr = eyeLinear(paperC[0]) - ir;
        const dg = eyeLinear(paperC[1]) - ig;
        const db = eyeLinear(paperC[2]) - ib;
        const denom = dr * dr + dg * dg + db * db;
        let score = 0;
        for (let i = 0; i < n; i++) {
          const c = lin[i];
          const er = c[0] - ir, eg = c[1] - ig, eb = c[2] - ib;
          if (denom < 1e-12) {
            score += er * er + eg * eg + eb * eb;
          } else {
            let t = (er * dr + eg * dg + eb * db) / denom;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const pr = er - t * dr, pg2 = eg - t * dg, pb = eb - t * db;
            score += pr * pr + pg2 * pg2 + pb * pb;
          }
        }
        cands.push({ bright, ink, paper, score });
      }
    }
  }
  if (cands.length === 0) {
    return { ink: 0, paper: 7, bright: false, inkRgb: palette.regular[0], paperRgb: palette.regular[7] };
  }
  cands.sort((a, b) => a.score - b.score);
  const shortlist = cands.slice(0, Math.min(EYE_CANDIDATES, cands.length));

  // ---- score the shortlist properly
  eyeModelPrepare(colors, blockW, blockH, baseX, baseY);
  // Ties are common and meaningful: a flat block is reached exactly by the flat pair and by
  // every pair with that colour at one end, all with the same energy. Prefer the closer pair, so
  // flat areas come out as flat attributes rather than a dither that happens to cancel.
  let best = shortlist[0], bestCost = Infinity, bestSpan = Infinity;
  for (const c of shortlist) {
    const pal = c.bright ? palette.bright : palette.regular;
    const cost = eyeModelPairCost(pal[c.paper], pal[c.ink]);
    const span = _eyeState.lastSpan2;
    const tie = Math.abs(cost - bestCost) <= 1e-6 * (bestCost + 1e-12);
    if (cost < bestCost && !tie) {
      bestCost = cost; bestSpan = span; best = c;
    } else if (tie && span < bestSpan) {
      bestCost = Math.min(cost, bestCost); bestSpan = span; best = c;
    }
  }
  const pal = best.bright ? palette.bright : palette.regular;
  return {
    ink: best.ink, paper: best.paper, bright: best.bright === 1,
    inkRgb: pal[best.ink], paperRgb: pal[best.paper]
  };
}
