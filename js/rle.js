// @ts-check
"use strict";
/*
 * RLE compression/decompression (PackBits-style)
 *
 * Control-byte based RLE (PackBits-style):
 *   0x00         = end of stream marker
 *   0x01..0x7F   = literal run: copy next N bytes as-is (1..127)
 *   0x80..0xFF   = repeat run: repeat next byte (N - 126) times (2..129)
 *
 * Z80 depacker is ~23 bytes: LDIR for literals (21 T/byte),
 * DJNZ for repeats (26 T/byte). Fast.
 *
 * Compressor uses backward-pass dynamic programming for optimal encoding.
 */
(function() {

/**
 * Compress data using optimal DP-based RLE.
 * @param {Uint8Array} inputData
 * @returns {{data: Uint8Array}}
 */
function compress(inputData) {
    const n = inputData.length;
    if (n === 0) return { data: new Uint8Array([0x00]) };

    // Precompute run lengths: runLen[i] = number of consecutive identical bytes starting at i (capped at 129)
    const runLen = new Uint16Array(n);
    runLen[n - 1] = 1;
    for (let i = n - 2; i >= 0; i--) {
        if (inputData[i] === inputData[i + 1]) {
            runLen[i] = Math.min(runLen[i + 1] + 1, 129);
        } else {
            runLen[i] = 1;
        }
    }

    // DP: cost[i] = minimum compressed bytes to encode inputData[i..n-1]
    // choice[i] = { type: 'lit'|'rep', len: number }
    const cost = new Uint32Array(n + 1);
    const choiceType = new Uint8Array(n); // 0 = literal, 1 = repeat
    const choiceLen = new Uint16Array(n);

    // cost[n] = 0 (nothing left to encode; end marker added separately)
    cost[n] = 0;

    for (let i = n - 1; i >= 0; i--) {
        let bestCost = 0xFFFFFFFF;
        let bestType = 0;
        let bestLen = 1;

        // Try literal runs of length 1..min(127, remaining)
        const maxLit = Math.min(127, n - i);
        for (let L = 1; L <= maxLit; L++) {
            const c = 1 + L + cost[i + L]; // 1 control byte + L data bytes
            if (c < bestCost) {
                bestCost = c;
                bestType = 0;
                bestLen = L;
            }
        }

        // Try repeat runs of length 2..min(129, runLen[i])
        const maxRep = Math.min(129, runLen[i]);
        if (maxRep >= 2) {
            for (let R = 2; R <= maxRep; R++) {
                const c = 2 + cost[i + R]; // 1 control byte + 1 data byte
                if (c < bestCost) {
                    bestCost = c;
                    bestType = 1;
                    bestLen = R;
                }
            }
        }

        cost[i] = bestCost;
        choiceType[i] = bestType;
        choiceLen[i] = bestLen;
    }

    // Emit compressed stream by tracing forward
    // Allocate output buffer (worst case: cost[0] + 1 for end marker)
    const out = new Uint8Array(cost[0] + 1);
    let oPos = 0;
    let i = 0;

    while (i < n) {
        const type = choiceType[i];
        const len = choiceLen[i];

        if (type === 0) {
            // Literal run: control byte = len (0x01..0x7F)
            out[oPos++] = len;
            for (let j = 0; j < len; j++) {
                out[oPos++] = inputData[i + j];
            }
        } else {
            // Repeat run: control byte = len + 126 (0x80..0xFF)
            out[oPos++] = len + 126;
            out[oPos++] = inputData[i];
        }
        i += len;
    }

    // End marker
    out[oPos++] = 0x00;

    return { data: out.subarray(0, oPos) };
}

/**
 * Decompress RLE data.
 * @param {Uint8Array} inputData
 * @returns {Uint8Array}
 */
function decompress(inputData) {
    const result = decompressTracked(inputData);
    return result.data;
}

/**
 * Decompress RLE data, tracking how many input bytes were consumed.
 * @param {Uint8Array} inputData
 * @returns {{data: Uint8Array, bytesRead: number}}
 */
function decompressTracked(inputData) {
    // First pass: determine output size
    let pos = 0;
    let outSize = 0;

    while (pos < inputData.length) {
        const ctrl = inputData[pos++];
        if (ctrl === 0x00) break; // end marker
        if (ctrl <= 0x7F) {
            // Literal run: N bytes
            outSize += ctrl;
            pos += ctrl;
        } else {
            // Repeat run: (ctrl - 126) bytes
            outSize += ctrl - 126;
            pos++; // skip the repeated byte
        }
    }

    const bytesRead = pos;

    // Second pass: decompress
    const out = new Uint8Array(outSize);
    pos = 0;
    let oPos = 0;

    while (pos < inputData.length) {
        const ctrl = inputData[pos++];
        if (ctrl === 0x00) break;
        if (ctrl <= 0x7F) {
            // Literal run
            for (let j = 0; j < ctrl; j++) {
                out[oPos++] = inputData[pos++];
            }
        } else {
            // Repeat run
            const count = ctrl - 126;
            const val = inputData[pos++];
            for (let j = 0; j < count; j++) {
                out[oPos++] = val;
            }
        }
    }

    return { data: out, bytesRead: bytesRead };
}

window.RLE = { compress, decompress, decompressTracked };

})();
