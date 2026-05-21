// @ts-check
"use strict";
/*
 * ZXSC — LZF compression/decompression with ZX Spectrum screen-aware scanning
 *
 * Based on the ZXSC project by TomDDG (MIT license for depackers).
 * Compressor reimplemented from the LZF specification with optimal DP parsing.
 *
 * LZF format (3 instruction types):
 *   000LLLLL                    = literal: copy next L+1 bytes as-is (1..32)
 *   LLLPPPPP OOOOOOOO          = short match: copy LLL+2 bytes (3..8) from offset (P<<8|O)+1
 *   111PPPPP LLLLLLLL OOOOOOOO = long match: copy L+9 bytes (9..264) from offset (P<<8|O)+1
 *   0xFF (as control byte)     = end of stream marker
 *
 * Screen-scan reordering:
 *   Standard ZX Spectrum screen is 6912 bytes (6144 bitmap + 768 attrs) with
 *   interleaved memory layout. ZXSC's non-linear scan visits each character cell
 *   in order (top-left to bottom-right), emitting the attribute byte first, then
 *   8 pixel rows. This groups visually related bytes together, improving LZ matches
 *   by ~20% compared to linear memory order.
 *
 * Supports rectangular regions (character-cell aligned).
 *
 * Z80 depackers: 49 bytes (standard), 80 bytes (full screen), 92 bytes (static window).
 */
(function() {

// --- Constants ---
const MAX_OFFSET = 8192;       // 13-bit offset field: (5 bits << 8 | 8 bits) + 1 = 1..8192
const MAX_LIT_LEN = 32;        // 5-bit literal length field: 0..31 = 1..32
const MIN_MATCH = 3;
const MAX_SHORT_MATCH = 8;     // LLL = 001..110 → length 3..8
const MAX_LONG_MATCH = 264;    // L (8-bit) + 9 = 9..264
const END_MARKER = 0xFF;

// --- LZF Compression (optimal DP parsing) ---

/**
 * Compress data using optimal DP-based LZF.
 * @param {Uint8Array} inputData
 * @returns {{data: Uint8Array}}
 */
function compress(inputData) {
  const n = inputData.length;
  if (n === 0) return { data: new Uint8Array([END_MARKER]) };

  // Find all matches using hash chains
  const matches = findAllMatches(inputData);

  // DP: cost[i] = minimum compressed bytes to encode inputData[i..n-1]
  const cost = new Uint32Array(n + 1);
  const choiceType = new Uint8Array(n);   // 0=literal, 1=match
  const choiceLen = new Uint16Array(n);
  // For literals, choiceLen = literal run length
  // For matches, choiceLen = match length, choiceOff = match offset
  const choiceOff = new Uint16Array(n);

  cost[n] = 0;

  for (let i = n - 1; i >= 0; i--) {
    let bestCost = 0xFFFFFFFF;
    let bestType = 0;
    let bestLen = 1;
    let bestOff = 0;

    // Try literal runs of length 1..min(MAX_LIT_LEN, remaining)
    const maxLit = Math.min(MAX_LIT_LEN, n - i);
    for (let L = 1; L <= maxLit; L++) {
      const c = 1 + L + cost[i + L]; // 1 control byte + L data bytes
      if (c < bestCost) {
        bestCost = c;
        bestType = 0;
        bestLen = L;
      }
    }

    // Try matches at this position
    const posMatches = matches[i];
    if (posMatches) {
      for (let m = 0; m < posMatches.length; m += 2) {
        const offset = posMatches[m];
        const maxLen = posMatches[m + 1];

        // Short matches: length 3..8, cost = 2 bytes
        const shortMax = Math.min(MAX_SHORT_MATCH, maxLen);
        for (let len = MIN_MATCH; len <= shortMax; len++) {
          const c = 2 + cost[i + len];
          if (c < bestCost) {
            bestCost = c;
            bestType = 1;
            bestLen = len;
            bestOff = offset;
          }
        }

        // Long matches: length 9..264, cost = 3 bytes
        if (maxLen >= 9) {
          const longMax = Math.min(MAX_LONG_MATCH, maxLen);
          for (let len = 9; len <= longMax; len++) {
            const c = 3 + cost[i + len];
            if (c < bestCost) {
              bestCost = c;
              bestType = 1;
              bestLen = len;
              bestOff = offset;
            }
          }
        }
      }
    }

    cost[i] = bestCost;
    choiceType[i] = bestType;
    choiceLen[i] = bestLen;
    choiceOff[i] = bestOff;
  }

  // Emit compressed stream
  const out = new Uint8Array(cost[0] + 1); // +1 for end marker
  let oPos = 0;
  let i = 0;

  while (i < n) {
    if (choiceType[i] === 0) {
      // Literal run
      const len = choiceLen[i];
      out[oPos++] = len - 1; // 000LLLLL where L = len-1
      for (let j = 0; j < len; j++) {
        out[oPos++] = inputData[i + j];
      }
      i += len;
    } else {
      // Match
      const len = choiceLen[i];
      const off = choiceOff[i] - 1; // offset stored as (value - 1)
      const offHi = (off >> 8) & 0x1F;
      const offLo = off & 0xFF;

      if (len <= MAX_SHORT_MATCH) {
        // Short match: LLLPPPPP OOOOOOOO
        out[oPos++] = ((len - 2) << 5) | offHi;
        out[oPos++] = offLo;
      } else {
        // Long match: 111PPPPP LLLLLLLL OOOOOOOO
        out[oPos++] = (7 << 5) | offHi;
        out[oPos++] = len - 9;
        out[oPos++] = offLo;
      }
      i += len;
    }
  }

  out[oPos++] = END_MARKER;
  return { data: out.subarray(0, oPos) };
}

/**
 * Find all matches for every position using hash chains.
 * Returns array of arrays: matches[i] = [off1, len1, off2, len2, ...]
 * @param {Uint8Array} data
 * @returns {Array<Int32Array|null>}
 */
function findAllMatches(data) {
  const n = data.length;
  const result = new Array(n);

  if (n < MIN_MATCH) return result;

  // Hash chain approach
  const HASH_SIZE = 1 << 14; // 16384
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const chain = new Int32Array(n).fill(-1);

  for (let i = 0; i < n - 2; i++) {
    const h = hash3(data, i);
    chain[i] = head[h];
    head[h] = i;
  }

  // For each position, collect matches
  for (let i = 0; i < n - 2; i++) {
    const matchList = [];
    let prev = chain[i]; // first candidate is the chain link (positions before i with same hash)
    let checked = 0;

    while (prev >= 0 && checked < 64) { // limit chain walk
      const offset = i - prev;
      if (offset > MAX_OFFSET) break;

      // Verify and measure match length
      let len = 0;
      const maxLen = Math.min(MAX_LONG_MATCH, n - i);
      while (len < maxLen && data[i + len] === data[prev + len]) {
        len++;
      }

      if (len >= MIN_MATCH) {
        matchList.push(offset, len);
      }

      prev = chain[prev];
      checked++;
    }

    if (matchList.length > 0) {
      result[i] = new Int32Array(matchList);
    }
  }

  return result;
}

/**
 * Hash function for 3-byte sequence.
 * @param {Uint8Array} data
 * @param {number} pos
 * @returns {number}
 */
function hash3(data, pos) {
  return ((data[pos] << 8) ^ (data[pos + 1] << 4) ^ data[pos + 2]) & 0x3FFF;
}

// --- LZF Decompression ---

/**
 * Decompress LZF data.
 * @param {Uint8Array} inputData
 * @returns {Uint8Array}
 */
function decompress(inputData) {
  return decompressTracked(inputData).data;
}

/**
 * Decompress LZF data, tracking how many input bytes were consumed.
 * @param {Uint8Array} inputData
 * @returns {{data: Uint8Array, bytesRead: number}}
 */
function decompressTracked(inputData) {
  // First pass: determine output size
  let pos = 0;
  let outSize = 0;

  while (pos < inputData.length) {
    const ctrl = inputData[pos++];
    if (ctrl === END_MARKER) break;

    if (ctrl < 32) {
      // Literal: copy ctrl+1 bytes
      const len = ctrl + 1;
      outSize += len;
      pos += len;
    } else {
      // Match
      const lll = ctrl >> 5;
      if (lll === 7) {
        // Long match: length = extraByte + 9
        const len = inputData[pos++] + 9;
        pos++; // skip offset low byte
        outSize += len;
      } else {
        // Short match: length = lll + 2
        pos++; // skip offset low byte
        outSize += lll + 2;
      }
    }
  }

  const bytesRead = pos;

  // Second pass: decompress
  const out = new Uint8Array(outSize);
  pos = 0;
  let oPos = 0;

  while (pos < inputData.length) {
    const ctrl = inputData[pos++];
    if (ctrl === END_MARKER) break;

    if (ctrl < 32) {
      // Literal
      const len = ctrl + 1;
      for (let j = 0; j < len; j++) {
        out[oPos++] = inputData[pos++];
      }
    } else {
      // Match
      const lll = ctrl >> 5;
      const offHi = ctrl & 0x1F;
      let len, offLo;

      if (lll === 7) {
        // Long match
        len = inputData[pos++] + 9;
        offLo = inputData[pos++];
      } else {
        // Short match
        len = lll + 2;
        offLo = inputData[pos++];
      }

      const offset = (offHi << 8 | offLo) + 1;
      let srcPos = oPos - offset;
      for (let j = 0; j < len; j++) {
        out[oPos++] = out[srcPos++];
      }
    }
  }

  return { data: out, bytesRead: bytesRead };
}

// --- Screen-scan reordering ---

/**
 * Reorder SCR data (6912 bytes) to non-linear cell-scan order.
 * Visits each character cell top-left to bottom-right, emitting:
 * attribute byte, then 8 pixel rows.
 *
 * @param {Uint8Array} scrData - 6912-byte SCR (bitmap 6144 + attrs 768)
 * @param {{x: number, y: number, w: number, h: number}=} region -
 *   Optional rectangle in character cells (x,y = top-left col/row, w/h in cells).
 *   Defaults to full screen (0, 0, 32, 24).
 * @returns {Uint8Array} - Reordered bytes (region.w * region.h * 9 bytes)
 */
function screenReorder(scrData, region) {
  const x0 = region ? region.x : 0;
  const y0 = region ? region.y : 0;
  const w = region ? region.w : 32;
  const h = region ? region.h : 24;

  const out = new Uint8Array(w * h * 9);
  let oPos = 0;

  for (let cr = y0; cr < y0 + h; cr++) {
    for (let cc = x0; cc < x0 + w; cc++) {
      // Attribute byte
      out[oPos++] = scrData[6144 + cr * 32 + cc];

      // 8 pixel rows
      const third = (cr >> 3);           // 0, 1, or 2
      const cellRow = cr & 7;            // row within third (0-7)
      for (let line = 0; line < 8; line++) {
        const bitmapOffset = third * 2048 + line * 256 + cellRow * 32 + cc;
        out[oPos++] = scrData[bitmapOffset];
      }
    }
  }

  return out;
}

/**
 * Reverse screen-scan reordering: convert cell-scan ordered data back to linear SCR.
 *
 * @param {Uint8Array} data - Reordered bytes (w * h * 9 bytes)
 * @param {{x: number, y: number, w: number, h: number}=} region -
 *   Optional rectangle in character cells. Defaults to full screen.
 * @returns {Uint8Array} - 6912-byte SCR data (or partial if region specified —
 *   in that case only the region bytes are filled, rest is 0)
 */
function screenUnreorder(data, region) {
  const x0 = region ? region.x : 0;
  const y0 = region ? region.y : 0;
  const w = region ? region.w : 32;
  const h = region ? region.h : 24;

  const scr = new Uint8Array(6912);
  let pos = 0;

  for (let cr = y0; cr < y0 + h; cr++) {
    for (let cc = x0; cc < x0 + w; cc++) {
      // Attribute byte
      scr[6144 + cr * 32 + cc] = data[pos++];

      // 8 pixel rows
      const third = (cr >> 3);
      const cellRow = cr & 7;
      for (let line = 0; line < 8; line++) {
        const bitmapOffset = third * 2048 + line * 256 + cellRow * 32 + cc;
        scr[bitmapOffset] = data[pos++];
      }
    }
  }

  return scr;
}

/**
 * Compress screen data using non-linear cell-scan reordering + LZF.
 * Convenience wrapper: reorders then compresses.
 *
 * @param {Uint8Array} scrData - 6912-byte SCR data
 * @param {{x: number, y: number, w: number, h: number}=} region -
 *   Optional character-cell rectangle. Defaults to full screen.
 * @returns {{data: Uint8Array}}
 */
function compressScreen(scrData, region) {
  const reordered = screenReorder(scrData, region);
  return compress(reordered);
}

/**
 * Decompress screen data and un-reorder back to linear SCR layout.
 *
 * @param {Uint8Array} compressedData
 * @param {{x: number, y: number, w: number, h: number}=} region -
 *   Optional character-cell rectangle. Defaults to full screen.
 * @returns {Uint8Array} - 6912-byte SCR data
 */
function decompressScreen(compressedData, region) {
  const reordered = decompress(compressedData);
  return screenUnreorder(reordered, region);
}

window.ZXSC = {
  compress,
  decompress,
  decompressTracked,
  screenReorder,
  screenUnreorder,
  compressScreen,
  decompressScreen
};

})();
