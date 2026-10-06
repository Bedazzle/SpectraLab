'use strict';
// @ts-check
/**
 * Gigascreen blend colours measured from a real ZX Spectrum on a CRT.
 *
 * Two attribute frames alternating on the same bitmap at 50 Hz read as one blended colour. The
 * obvious model -- average the two sRGB values -- is wrong twice over: the average belongs in
 * linear light, and a real machine's phosphors and the 50 Hz flicker do not give the linear
 * result either. These are the blends as captured by Jari Komppa (img2spectrum, 2015) and
 * tabulated in dizher (https://github.com/ruguevara/dizher, MIT, used with the author's
 * permission) as `PAL3X64_MEASURED`.
 *
 * Worth knowing before trusting the theoretical palette: measured black is (16, 13, 17) and
 * measured bright white (216, 210, 206), so neither end of the range is where you would put it.
 *
 * Indexed exactly like the blended palette built by `precomputeGigaQuads()`, i.e. by
 * `gigaBlendIndex(a, b)` over palette indexes 0..15 (0..7 not bright, 8..15 bright).
 * @type {number[][]}
 */
const GIGA_BLEND_MEASURED = [
  [ 16,  13,  17], [ 15,  17, 106], [105,   8,  20], [110,  10, 102],  // 0 + 0..
  [ 14,  97,  17], [  8, 102, 100], [ 98,  92,  12], [ 98,  94,  94],
  [ 14,  12,  15], [ 11,  14, 101], [102,   9,  22], [114,  14, 105],
  [ 24, 104,  27], [ 18, 116, 111], [110, 110,  25], [119, 116, 111],
  [ 13,  21, 200], [108,  11, 110], [109,  14, 196], [ 12, 100, 106],  // 1 + 1..
  [  6, 107, 193], [ 95,  96,  99], [ 96,  97, 185], [  7,   8,  92],
  [  8,  17, 192], [ 98,  12, 116], [112,  17, 196], [ 23, 107, 121],
  [ 16, 120, 203], [108, 114, 119], [116, 119, 203],
  [197,   2,  19], [201,   4, 106], [102,  91,  13], [ 96,  96,  99],  // 2 + 2..
  [188,  85,  10], [188,  87,  95], [ 96,   4,  10], [106,   8, 100],
  [197,   3,  21], [208,   7, 104], [120,  96,  26], [114, 109, 111],
  [204, 102,  23], [213, 107, 109],
  [205,   5, 193], [103,  92, 100], [ 97,  98, 186], [188,  88,  95],  // 3 + 3..
  [192,  89, 182], [ 99,   3,  91], [105,  10, 189], [194,   5, 112],
  [208,   9, 194], [121,  98, 120], [114, 112, 200], [203, 104, 115],
  [212, 110, 199],
  [  7, 183,  11], [  4, 188,  99], [ 90, 178,   8], [ 92, 178,  90],  // 4 + 4..
  [  8,  91,  11], [  4, 102,  94], [ 91,  97,  16], [102, 102,  97],
  [ 15, 192,  22], [  9, 203, 105], [100, 198,  18], [108, 203, 104],
  [  0, 193, 185], [ 84, 182,  90], [ 87, 183, 178], [  6,  94,  91],  // 5 + 5..
  [  5, 104, 187], [ 89,  98, 109], [101, 103, 191], [ 16, 193, 117],
  [  8, 205, 196], [ 97, 199, 112], [106, 203, 196],
  [178, 170,   3], [179, 172,  84], [ 92,  84,  10], [ 95,  92,  88],  // 6 + 6..
  [185,  86,  11], [196,  91,  93], [108, 180,  17], [101, 192, 100],
  [193, 186,  14], [201, 191,  99],
  [179, 174, 169], [ 90,  86,  87], [ 91,  93, 178], [180,  88, 101],  // 7 + 7..
  [193,  92, 182], [105, 181, 106], [ 98, 194, 188], [188, 188, 103],
  [197, 192, 186],
  [ 14,  11,  16], [  8,  10,  96], [ 98,   6,  18], [110,  10, 101],  // 8 + 8..
  [ 18, 100,  22], [ 16, 110, 107], [106, 102,  19], [112, 108, 106],
  [  9,  17, 192], [107,  12, 108], [112,  16, 196], [ 20, 107, 114],  // 9 + 9..
  [ 14, 116, 202], [108, 109, 112], [112, 113, 199],
  [202,   6,  25], [208,  12, 114], [114, 101,  22], [110, 110, 113],  // 10 + 10..
  [205, 102,  24], [208, 108, 115],
  [216,  17, 202], [119, 106, 113], [115, 115, 202], [208, 107, 115],  // 11 + 11..
  [215, 112, 204],
  [ 25, 201,  31], [ 24, 208, 121], [116, 202,  28], [120, 206, 118],  // 12 + 12..
  [ 21, 216, 210], [110, 209, 118], [118, 214, 208],  // 13 + 13..
  [208, 202,  22], [212, 206, 113],  // 14 + 14..
  [216, 210, 206],  // 15 + 15..
];

/** How the two gigascreen frames are combined into the colour the eye sees. */
const GIGA_BLEND_MODES = {
  MEASURED: 'measured',
  LINEAR: 'linear',
  SRGB: 'srgb'
};

/**
 * Blend two palette colours the way the chosen mode says the eye sees them.
 * @param {number[]} ca - first frame colour as [r, g, b] 0..255
 * @param {number[]} cb - second frame colour as [r, g, b] 0..255
 * @param {number} ia - first frame palette index 0..15, or -1 if it is not a ZX palette colour
 * @param {number} ib - second frame palette index 0..15, or -1 if it is not a ZX palette colour
 * @param {string} mode - one of GIGA_BLEND_MODES
 * @returns {number[]} blended [r, g, b] 0..255
 */
function gigaBlendColor(ca, cb, ia, ib, mode) {
  if (mode === GIGA_BLEND_MODES.MEASURED && ia >= 0 && ib >= 0) {
    const lo = ia < ib ? ia : ib;
    const hi = ia < ib ? ib : ia;
    const entry = GIGA_BLEND_MEASURED[lo * 16 + hi - ((lo * (lo + 1)) >> 1)];
    if (entry) return [entry[0], entry[1], entry[2]];
  }
  if (mode === GIGA_BLEND_MODES.SRGB) {
    return [
      Math.round((ca[0] + cb[0]) / 2),
      Math.round((ca[1] + cb[1]) / 2),
      Math.round((ca[2] + cb[2]) / 2)
    ];
  }
  // Linear, and measured where there is no measurement (ULA+ colours are not the ZX 16):
  // average the emitted light and re-encode, which is what two alternating frames really add to
  const mix = (/** @type {number} */ x, /** @type {number} */ y) =>
    Math.round(255 * Math.pow((Math.pow(x / 255, 2.2) + Math.pow(y / 255, 2.2)) / 2, 1 / 2.2));
  return [mix(ca[0], cb[0]), mix(ca[1], cb[1]), mix(ca[2], cb[2])];
}
