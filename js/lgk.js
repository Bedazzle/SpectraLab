// LgK v1.1rs - ZX Spectrum Image Compressor/Decompressor
//
// Original C implementation: Lethargeek
// JavaScript port: Bedazzle, 2026
//
// Compress + Decompress only (no SFX generator)

(function (root) {
'use strict';

// ============================================================
// Constants
// ============================================================

const ZX_MONO = 6144;
const ZX_FULL = 6912;
const ZX_COLS = 256;
const ZX_ROWS = 192;
const BIT_BUF_SIZE = 102912;
const ATTR_ROW = 32;
const ZX_ATTRS = 768;

const INF = 100500;
const HIGH_COST = 9000;

// XOR prediction modes
const XRINV = 0;   // reference tile, inverted
const XREQU = 1;   // reference tile, equal
const XTINV = 2;   // tile inverted (no prediction)
const XHOR2 = 3;   // horizontal neighbor, offset 2
const XVER2 = 4;   // vertical neighbor, offset 2
const XHOR1 = 5;   // horizontal neighbor, offset 1
const XVER1 = 6;   // vertical neighbor, offset 1
const XTEQU = 7;   // tile as-is (no prediction)
const NUM_MODES = 8;

// Config parameter indices
const CFGRP   = 0;  // grouping mode
const CFREB   = 1;  // reference displacement bits
const CFRPR   = 2;  // reference prediction (reuse prev displacement)
const CFINV   = 3;  // invert pixel buffer
const CFVB1   = 4;  // vertical border row 1
const CFHB1   = 5;  // horizontal border col 1
const CFVB2   = 6;  // vertical border row 2
const CFHB2   = 7;  // horizontal border col 2
const CFVDIR  = 8;  // vertical direction (unused in JS)
const CFHDIR  = 9;  // horizontal direction (unused in JS)
const CFMOVE  = 10; // move mode (unused in JS)
const CFDIFA  = 11; // distinct attribute count
const CFFLASH = 12; // flash bit present
const CFAREM  = 13; // attribute prediction mode (3-mode or 5-mode)
const CFAREB  = 14; // attribute palette index bits
const CFARLEB = 15; // attribute RLE counter bits
const CFASEP  = 16; // attribute stream separate from pixel stream
const NUM_PARAMS = 17;

// Grouping modes
const CELLS = 0;  // 16 individual 2x2 cells
const QUARS = 1;  // 4 quarters (each 4 cells)
const TILES = 2;  // whole tile (all-or-nothing + cells)
const BOTH  = 3;  // tile → quarters → cells (3 levels)

const NO  = 0;
const YES = 1;

const NOREFS  = 0;
const RPRSEP  = 0;
const MAX_ATTR_BITS = 6;

// ============================================================
// Array helpers (kept for decompressor compatibility)
// ============================================================

function make2D(r, c) {
    const a = new Array(r);
    for (let i = 0; i < r; ++i) a[i] = new Array(c).fill(0);
    return a;
}

// ============================================================
// Context (replaces C global state)
// ============================================================

function createCtx(opts) {
    opts = opts || {};
    const rows = opts.rows || 24;
    const start = opts.start || 0;
    const PICROWS = rows * 8;
    const TILEROWS = PICROWS / 8 | 0;
    const TILECOLS = ZX_COLS / 8;

    return {
        PICROWS:  PICROWS,
        PICATTRS: rows * ATTR_ROW,
        SCROTATE: start,
        MAXREB:   10,
        SFXMUL:   0,

        // Flat typed arrays for pixel/xor buffers (row-major: buf[r * ZX_COLS + c])
        pixelBuf: new Int8Array(ZX_ROWS * ZX_COLS),
        xorBuf:   new Int8Array(ZX_ROWS * ZX_COLS),
        bitBuf:   new Int8Array(BIT_BUF_SIZE),
        bitPos:   0,

        zxBuf:    new Uint8Array(ZX_FULL),

        // Flat tile arrays (row-major: tile[r * 8 + c])
        tileA:    new Int8Array(64),
        tileB:    new Int8Array(64),
        tileXor:  new Int8Array(64),

        cfg:      new Array(NUM_PARAMS).fill(0),
        bestCfg:  new Array(NUM_PARAMS).fill(0),

        huffLen:   new Array(NUM_MODES).fill(0),
        huffCode:  new Array(NUM_MODES).fill(0),

        attrPalette: new Array((1 << MAX_ATTR_BITS) + 1).fill(0),
        attrFreq:    new Array(256).fill(0),

        pred3:   new Array(ZX_ATTRS).fill(0),
        pred5:   new Array(ZX_ATTRS).fill(0),

        modeTotals: new Array(NUM_MODES).fill(0),
        // Flat: modeCosts[rr * TILECOLS * NUM_MODES + cc * NUM_MODES + mode]
        modeCosts:  new Int32Array(TILEROWS * TILECOLS * NUM_MODES),
        // Flat: refEqu[rr * TILECOLS * 4 * 10 + cc * 4 * 10 + dim * 10 + b]
        refEqu:     new Int32Array(TILEROWS * TILECOLS * 4 * 10),
        refInv:     new Int32Array(TILEROWS * TILECOLS * 4 * 10),

        // Dimensional constants for indexing
        TILEROWS: TILEROWS,
        TILECOLS: TILECOLS,

        nonPackedTiles: 0,
        extraBits:      0,
        prevDisp:       [0, 0],
        ri:             0,
        re:             RPRSEP,
        repeatRefs:     0,

        prevPred:  0,
        rleCount:  0,
        rlePos:    0,

        modeTree:  new Array(16).fill(0),
        freeNode:  0
    };
}

// ============================================================
// Flat array index helpers
// ============================================================

// modeCosts: idx = (rr * TILECOLS + cc) * NUM_MODES + mode
function mcIdx(ctx, rr, cc, mode) {
    return (rr * ctx.TILECOLS + cc) * NUM_MODES + mode;
}

// refEqu/refInv: idx = (rr * TILECOLS + cc) * 40 + dim * 10 + b
function refIdx(ctx, rr, cc, dim, b) {
    return (rr * ctx.TILECOLS + cc) * 40 + dim * 10 + b;
}

// ============================================================
// Bit I/O
// ============================================================

function getBit(ctx) {
    return ctx.bitBuf[ctx.bitPos++];
}

function getBits(ctx, n) {
    let bits = 0;
    for (let i = 0; i < n; ++i) bits = bits * 2 + ctx.bitBuf[ctx.bitPos++];
    return bits;
}

function putBit(ctx, bit) {
    ctx.bitBuf[ctx.bitPos++] = bit;
}

function putBits(ctx, n, bits) {
    for (let i = n; i > 0; --i)
        ctx.bitBuf[ctx.bitPos++] = ((bits >> (i - 1)) & 1);
}

// ============================================================
// Utility functions
// ============================================================

function indexOfMin(n, a) {
    let idx = 0, min = INF;
    let i = n;
    while ((i--) > 0) if (a[i] < min) { min = a[i]; idx = i; }
    return idx;
}

function indexOfMax(n, a) {
    let idx = 0, max = -INF;
    let i = n;
    while ((i--) > 0) if (a[i] > max) { max = a[i]; idx = i; }
    return idx;
}

function bitsRequired(n) {
    if (n < 2)   return 1;
    if (n < 4)   return 2;
    if (n < 8)   return 3;
    if (n < 16)  return 4;
    if (n < 32)  return 5;
    if (n < 64)  return 6;
    if (n < 128) return 7;
    if (n < 256) return 8;
    if (n < 512) return 9;
    if (n < 768) return 10;
    return HIGH_COST;
}

// ============================================================
// Huffman
// ============================================================

function huffman(n, ss, cc) {
    let i, k1, k2, tmp, s, r, ctr, b;
    const pp = new Array(n - 1);
    for (i = 0; i < n - 1; ++i) pp[i] = [0, 0];

    for (i = 0; i < n - 1; ++i) {
        k1 = indexOfMin(n, ss);
        tmp = ss[k1];
        ss[k1] = INF;
        k2 = indexOfMin(n, ss);
        ss[k2] += tmp;
        pp[i][0] = k1;
        pp[i][1] = k2;
    }
    for (s = 0; s < n; ++s) {
        r = s; ctr = 0; cc[s] = 0; b = 0;
        for (i = 0; i < n - 1; ++i)
            if (r === pp[i][0] || r === pp[i][1]) {
                if (r === pp[i][1]) cc[s] += 1 << b;
                r = pp[i][1]; ++ctr; ++b;
            }
        ss[s] = ctr;
    }
}

// ============================================================
// Tile operations (flat Int8Array(64), row-major: tile[r*8+c])
// ============================================================

function clearTile(tile) {
    tile.fill(0);
}

function readTile(ctx, tile, buf, r, c, isPicbuf) {
    const PICROWS = ctx.PICROWS;
    const inv = ctx.cfg[CFINV] & (isPicbuf ? 1 : 0);

    // Fast path: tile fully within bounds
    if (r >= 0 && r + 8 <= PICROWS && c >= 0 && c + 8 <= ZX_COLS) {
        let bufBase = r * ZX_COLS + c;
        let tIdx = 0;
        for (let rr = 0; rr < 8; ++rr) {
            for (let cc = 0; cc < 8; ++cc) {
                tile[tIdx++] = buf[bufBase + cc] ^ inv;
            }
            bufBase += ZX_COLS;
        }
        return;
    }

    // Slow path: bounds checking
    const cfhb1 = ctx.cfg[CFHB1];
    const cfhb2 = ctx.cfg[CFHB2];
    const cfvb1 = ctx.cfg[CFVB1];
    const cfvb2 = ctx.cfg[CFVB2];
    let tIdx = 0;
    for (let rr = 0; rr < 8; ++rr) {
        const row = r + rr;
        for (let cc = 0; cc < 8; ++cc) {
            const col = c + cc;
            if (row >= 0 && row < PICROWS && col >= 0 && col < ZX_COLS) {
                tile[tIdx] = buf[row * ZX_COLS + col] ^ inv;
            } else {
                tile[tIdx] = 0;
                if (col === -1) tile[tIdx] = cfhb1;
                if (col === -2) tile[tIdx] = cfhb2;
                if (row === -1) tile[tIdx] = (cfvb1 >> (7 - cc)) & 1;
                if (row === -2) tile[tIdx] = (cfvb2 >> (7 - cc)) & 1;
            }
            ++tIdx;
        }
    }
}

function writeTile(ctx, tile, buf, r, c) {
    const PICROWS = ctx.PICROWS;
    // Fast path: tile fully within bounds
    if (r >= 0 && r + 8 <= PICROWS && c >= 0 && c + 8 <= ZX_COLS) {
        let bufBase = r * ZX_COLS + c;
        let tIdx = 0;
        for (let rr = 0; rr < 8; ++rr) {
            for (let cc = 0; cc < 8; ++cc) {
                buf[bufBase + cc] = tile[tIdx++];
            }
            bufBase += ZX_COLS;
        }
        return;
    }
    // Slow path
    let tIdx = 0;
    for (let rr = 0; rr < 8; ++rr) {
        const row = r + rr;
        for (let cc = 0; cc < 8; ++cc) {
            const col = c + cc;
            if (row >= 0 && row < PICROWS && col >= 0 && col < ZX_COLS)
                buf[row * ZX_COLS + col] = tile[tIdx];
            ++tIdx;
        }
    }
}

function invertTile(dst, src) {
    for (let i = 0; i < 64; ++i)
        dst[i] = 1 - src[i];
}

function invertBuffer(ctx, buf) {
    const len = ctx.PICROWS * ZX_COLS;
    for (let i = 0; i < len; ++i)
        buf[i] ^= 1;
}

function xorTiles(dst, src1, src2) {
    for (let i = 0; i < 64; ++i)
        dst[i] = src1[i] ^ src2[i];
}

function xorVertical(ctx, buf, r, c, n) {
    const border = [ctx.cfg[CFVB1], ctx.cfg[CFVB2]];
    for (let rr = r; rr < r + 8; ++rr)
        for (let cc = c; cc < c + 8; ++cc)
            if (rr > n - 1) buf[rr * ZX_COLS + cc] ^= buf[(rr - n) * ZX_COLS + cc];
            else            buf[rr * ZX_COLS + cc] ^= (border[n - 1 - rr] >> (7 - cc + c)) & 1;
}

function xorHorizontal(ctx, buf, r, c, n) {
    const border = [ctx.cfg[CFHB1], ctx.cfg[CFHB2]];
    for (let rr = r; rr < r + 8; ++rr)
        for (let cc = c; cc < c + 8; ++cc)
            if (cc > n - 1) buf[rr * ZX_COLS + cc] ^= buf[rr * ZX_COLS + cc - n];
            else            buf[rr * ZX_COLS + cc] ^= border[n - 1 - cc];
}

// ============================================================
// Cell encoding / cost calculation (flat tiles)
// ============================================================

function getCellCode(tile, r, c) {
    if (r < 0 || r > 6 || c < 0 || c > 6) return -1;
    return tile[r * 8 + c] * 8 + tile[r * 8 + c + 1] * 4 + tile[(r + 1) * 8 + c] * 2 + tile[(r + 1) * 8 + c + 1];
}

function getQuarterCode(tile, r, c) {
    if (r < 0 || r > 4 || c < 0 || c > 4) return -1;
    return getCellCode(tile, r, c) * 4096 + getCellCode(tile, r, c + 2) * 256 +
           getCellCode(tile, r + 2, c) * 16 + getCellCode(tile, r + 2, c + 2);
}

function areFourSame(tile, r, c) {
    const ulc = getCellCode(tile, r, c);
    if (ulc === getCellCode(tile, r + 2, c) &&
        ulc === getCellCode(tile, r, c + 2) &&
        ulc === getCellCode(tile, r + 2, c + 2)) return ulc;
    return 0;
}

function cellCost(tile, r, c) {
    switch (getCellCode(tile, r, c)) {
        case  0: return 1;
        case  1: return 4;
        case  2: return 4;
        case  4: return 4;
        case  8: return 4;
        case  7: return 7;
        case 11: return 7;
        case 13: return 7;
        case 14: return 7;
        default: return 5;
    }
}

function quarterCost(tile, r, c) {
    let n = cellCost(tile, r, c) + cellCost(tile, r, c + 2) +
            cellCost(tile, r + 2, c) + cellCost(tile, r + 2, c + 2);
    if (n === 4) n = 0;
    return n + 1;
}

function allQuartersCost(tile) {
    return quarterCost(tile, 0, 0) + quarterCost(tile, 0, 4) +
           quarterCost(tile, 4, 0) + quarterCost(tile, 4, 4);
}

function allGroupsCost(tile) {
    let n = quarterCost(tile, 0, 0) + quarterCost(tile, 0, 4) +
            quarterCost(tile, 4, 0) + quarterCost(tile, 4, 4);
    if (n === 4) n = 0;
    return n + 1;
}

function allCellsCost(tile) {
    let r, c, n = 0;
    for (r = 0; r < 7; r += 2)
        for (c = 0; c < 7; c += 2)
            n += cellCost(tile, r, c);
    return n;
}

function tileCost(ctx, tile) {
    let t;
    switch (ctx.cfg[CFGRP]) {
        case CELLS: return allCellsCost(tile);
        case QUARS: return allQuartersCost(tile);
        case TILES: t = allCellsCost(tile); return (t === 16 ? 1 : t + 1);
        default:    return allGroupsCost(tile);
    }
}

// ============================================================
// Inline tile cost from XOR (fused XOR + tileCost for buildRefTable)
// Computes XOR of tileA ^ tileB and returns tileCost, with early exit.
// ============================================================

// Cell cost lookup table (indexed by cell code 0-15)
const CELL_COST_LUT = new Int8Array([1,4,4,5,4,5,5,7,4,5,5,7,5,7,7,5]);

function fusedXorTileCostCells(tileA, offA, tileB, offB) {
    // allCellsCost for XOR result
    let n = 0;
    for (let r = 0; r < 7; r += 2) {
        const r8 = r * 8;
        const r18 = (r + 1) * 8;
        for (let c = 0; c < 7; c += 2) {
            const code = (tileA[offA + r8 + c] ^ tileB[offB + r8 + c]) * 8 +
                         (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1]) * 4 +
                         (tileA[offA + r18 + c] ^ tileB[offB + r18 + c]) * 2 +
                         (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]);
            n += CELL_COST_LUT[code];
        }
    }
    return n;
}

function fusedXorTileCostQuars(tileA, offA, tileB, offB) {
    // allQuartersCost for XOR result
    let total = 0;
    for (let qr = 0; qr < 8; qr += 4) {
        for (let qc = 0; qc < 8; qc += 4) {
            let qn = 0;
            for (let r = qr; r < qr + 4; r += 2) {
                const r8 = r * 8;
                const r18 = (r + 1) * 8;
                for (let c = qc; c < qc + 4; c += 2) {
                    const code = (tileA[offA + r8 + c] ^ tileB[offB + r8 + c]) * 8 +
                                 (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1]) * 4 +
                                 (tileA[offA + r18 + c] ^ tileB[offB + r18 + c]) * 2 +
                                 (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]);
                    qn += CELL_COST_LUT[code];
                }
            }
            if (qn === 4) qn = 0;
            total += qn + 1;
        }
    }
    return total;
}

function fusedXorTileCostTiles(tileA, offA, tileB, offB) {
    // TILES mode: t = allCellsCost; return (t===16 ? 1 : t+1)
    let n = 0;
    for (let r = 0; r < 7; r += 2) {
        const r8 = r * 8;
        const r18 = (r + 1) * 8;
        for (let c = 0; c < 7; c += 2) {
            const code = (tileA[offA + r8 + c] ^ tileB[offB + r8 + c]) * 8 +
                         (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1]) * 4 +
                         (tileA[offA + r18 + c] ^ tileB[offB + r18 + c]) * 2 +
                         (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]);
            n += CELL_COST_LUT[code];
        }
    }
    return (n === 16 ? 1 : n + 1);
}

function fusedXorTileCostBoth(tileA, offA, tileB, offB) {
    // allGroupsCost for XOR result
    let total = 0;
    for (let qr = 0; qr < 8; qr += 4) {
        for (let qc = 0; qc < 8; qc += 4) {
            let qn = 0;
            for (let r = qr; r < qr + 4; r += 2) {
                const r8 = r * 8;
                const r18 = (r + 1) * 8;
                for (let c = qc; c < qc + 4; c += 2) {
                    const code = (tileA[offA + r8 + c] ^ tileB[offB + r8 + c]) * 8 +
                                 (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1]) * 4 +
                                 (tileA[offA + r18 + c] ^ tileB[offB + r18 + c]) * 2 +
                                 (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]);
                    qn += CELL_COST_LUT[code];
                }
            }
            if (qn === 4) qn = 0;
            total += qn + 1;
        }
    }
    if (total === 4) total = 0;
    return total + 1;
}

// Inverted version: computes cost of ~(tileA ^ tileB) = invert of XOR
function fusedInvXorTileCostCells(tileA, offA, tileB, offB) {
    let n = 0;
    for (let r = 0; r < 7; r += 2) {
        const r8 = r * 8;
        const r18 = (r + 1) * 8;
        for (let c = 0; c < 7; c += 2) {
            const code = (1 - (tileA[offA + r8 + c] ^ tileB[offB + r8 + c])) * 8 +
                         (1 - (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1])) * 4 +
                         (1 - (tileA[offA + r18 + c] ^ tileB[offB + r18 + c])) * 2 +
                         (1 - (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]));
            n += CELL_COST_LUT[code];
        }
    }
    return n;
}

function fusedInvXorTileCostQuars(tileA, offA, tileB, offB) {
    let total = 0;
    for (let qr = 0; qr < 8; qr += 4) {
        for (let qc = 0; qc < 8; qc += 4) {
            let qn = 0;
            for (let r = qr; r < qr + 4; r += 2) {
                const r8 = r * 8;
                const r18 = (r + 1) * 8;
                for (let c = qc; c < qc + 4; c += 2) {
                    const code = (1 - (tileA[offA + r8 + c] ^ tileB[offB + r8 + c])) * 8 +
                                 (1 - (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1])) * 4 +
                                 (1 - (tileA[offA + r18 + c] ^ tileB[offB + r18 + c])) * 2 +
                                 (1 - (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]));
                    qn += CELL_COST_LUT[code];
                }
            }
            if (qn === 4) qn = 0;
            total += qn + 1;
        }
    }
    return total;
}

function fusedInvXorTileCostTiles(tileA, offA, tileB, offB) {
    let n = 0;
    for (let r = 0; r < 7; r += 2) {
        const r8 = r * 8;
        const r18 = (r + 1) * 8;
        for (let c = 0; c < 7; c += 2) {
            const code = (1 - (tileA[offA + r8 + c] ^ tileB[offB + r8 + c])) * 8 +
                         (1 - (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1])) * 4 +
                         (1 - (tileA[offA + r18 + c] ^ tileB[offB + r18 + c])) * 2 +
                         (1 - (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]));
            n += CELL_COST_LUT[code];
        }
    }
    return (n === 16 ? 1 : n + 1);
}

function fusedInvXorTileCostBoth(tileA, offA, tileB, offB) {
    let total = 0;
    for (let qr = 0; qr < 8; qr += 4) {
        for (let qc = 0; qc < 8; qc += 4) {
            let qn = 0;
            for (let r = qr; r < qr + 4; r += 2) {
                const r8 = r * 8;
                const r18 = (r + 1) * 8;
                for (let c = qc; c < qc + 4; c += 2) {
                    const code = (1 - (tileA[offA + r8 + c] ^ tileB[offB + r8 + c])) * 8 +
                                 (1 - (tileA[offA + r8 + c + 1] ^ tileB[offB + r8 + c + 1])) * 4 +
                                 (1 - (tileA[offA + r18 + c] ^ tileB[offB + r18 + c])) * 2 +
                                 (1 - (tileA[offA + r18 + c + 1] ^ tileB[offB + r18 + c + 1]));
                    qn += CELL_COST_LUT[code];
                }
            }
            if (qn === 4) qn = 0;
            total += qn + 1;
        }
    }
    if (total === 4) total = 0;
    return total + 1;
}

// ============================================================
// Cell packing / unpacking (flat tiles)
// ============================================================

function packCell(ctx, tile, r, c) {
    switch (getCellCode(tile, r, c)) {
        case  0: putBit(ctx, 0); return;
        case  1: putBits(ctx, 4, 0x08); return;
        case  2: putBits(ctx, 4, 0x09); return;
        case  4: putBits(ctx, 4, 0x0A); return;
        case  8: putBits(ctx, 4, 0x0B); return;
        case  9: putBits(ctx, 5, 0x18); return;
        case  3: putBits(ctx, 5, 0x19); return;
        case  6: putBits(ctx, 5, 0x1A); return;
        case 12: putBits(ctx, 5, 0x1B); return;
        case 10: putBits(ctx, 5, 0x1C); return;
        case  5: putBits(ctx, 5, 0x1D); return;
        case 15: putBits(ctx, 5, 0x1E); return;
        case 14: putBits(ctx, 7, 0x7C); return;
        case 13: putBits(ctx, 7, 0x7D); return;
        case 11: putBits(ctx, 7, 0x7E); return;
        case  7: putBits(ctx, 7, 0x7F); return;
    }
}

function packQuarter(ctx, tile, r, c) {
    const n = cellCost(tile, r, c) + cellCost(tile, r, c + 2) +
            cellCost(tile, r + 2, c) + cellCost(tile, r + 2, c + 2);
    if (n === 4) { putBit(ctx, 0); return; }
    putBit(ctx, 1);
    packCell(ctx, tile, r, c); packCell(ctx, tile, r, c + 2);
    packCell(ctx, tile, r + 2, c); packCell(ctx, tile, r + 2, c + 2);
}

function packAllQuarters(ctx, tile) {
    packQuarter(ctx, tile, 0, 0); packQuarter(ctx, tile, 0, 4);
    packQuarter(ctx, tile, 4, 0); packQuarter(ctx, tile, 4, 4);
}

function packAllGroups(ctx, tile) {
    const n = quarterCost(tile, 0, 0) + quarterCost(tile, 0, 4) +
            quarterCost(tile, 4, 0) + quarterCost(tile, 4, 4);
    if (n === 4) { putBit(ctx, 0); return; }
    putBit(ctx, 1); packAllQuarters(ctx, tile);
}

function packAllCells(ctx, tile) {
    packCell(ctx, tile, 0, 0); packCell(ctx, tile, 0, 2);
    packCell(ctx, tile, 2, 0); packCell(ctx, tile, 2, 2);
    packCell(ctx, tile, 0, 4); packCell(ctx, tile, 0, 6);
    packCell(ctx, tile, 2, 4); packCell(ctx, tile, 2, 6);
    packCell(ctx, tile, 4, 0); packCell(ctx, tile, 4, 2);
    packCell(ctx, tile, 6, 0); packCell(ctx, tile, 6, 2);
    packCell(ctx, tile, 4, 4); packCell(ctx, tile, 4, 6);
    packCell(ctx, tile, 6, 4); packCell(ctx, tile, 6, 6);
}

function unpackCell(ctx, tile, r, c) {
    if (getBit(ctx) === 0) return;
    if (getBit(ctx))
        switch (getBits(ctx, 3)) {
            case 0: tile[r * 8 + c] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
            case 1: tile[(r + 1) * 8 + c] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
            case 2: tile[r * 8 + c + 1] = 1; tile[(r + 1) * 8 + c] = 1; return;
            case 3: tile[r * 8 + c] = 1; tile[r * 8 + c + 1] = 1; return;
            case 4: tile[r * 8 + c] = 1; tile[(r + 1) * 8 + c] = 1; return;
            case 5: tile[r * 8 + c + 1] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
            case 6: tile[r * 8 + c] = 1; tile[r * 8 + c + 1] = 1; tile[(r + 1) * 8 + c] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
            case 7: switch (getBits(ctx, 2)) {
                        case 0: tile[r * 8 + c] = 1; tile[r * 8 + c + 1] = 1; tile[(r + 1) * 8 + c] = 1; return;
                        case 1: tile[r * 8 + c] = 1; tile[r * 8 + c + 1] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
                        case 2: tile[r * 8 + c] = 1; tile[(r + 1) * 8 + c] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
                        case 3: tile[r * 8 + c + 1] = 1; tile[(r + 1) * 8 + c] = 1; tile[(r + 1) * 8 + c + 1] = 1; return;
                    }
        }
    else switch (getBits(ctx, 2)) {
            case 0: tile[(r + 1) * 8 + c + 1] = 1; return;
            case 1: tile[(r + 1) * 8 + c] = 1; return;
            case 2: tile[r * 8 + c + 1] = 1; return;
            case 3: tile[r * 8 + c] = 1; return;
        }
}

function unpackQuarter(ctx, tile, r, c) {
    if (getBit(ctx)) {
        unpackCell(ctx, tile, r, c); unpackCell(ctx, tile, r, c + 2);
        unpackCell(ctx, tile, r + 2, c); unpackCell(ctx, tile, r + 2, c + 2);
    }
}

function unpackAllQuarters(ctx, tile) {
    clearTile(tile);
    unpackQuarter(ctx, tile, 0, 0); unpackQuarter(ctx, tile, 0, 4);
    unpackQuarter(ctx, tile, 4, 0); unpackQuarter(ctx, tile, 4, 4);
}

function unpackAllGroups(ctx, tile) {
    if (getBit(ctx)) unpackAllQuarters(ctx, tile); else clearTile(tile);
}

function unpackAllCells(ctx, tile) {
    clearTile(tile);
    unpackCell(ctx, tile, 0, 0); unpackCell(ctx, tile, 0, 2);
    unpackCell(ctx, tile, 2, 0); unpackCell(ctx, tile, 2, 2);
    unpackCell(ctx, tile, 0, 4); unpackCell(ctx, tile, 0, 6);
    unpackCell(ctx, tile, 2, 4); unpackCell(ctx, tile, 2, 6);
    unpackCell(ctx, tile, 4, 0); unpackCell(ctx, tile, 4, 2);
    unpackCell(ctx, tile, 6, 0); unpackCell(ctx, tile, 6, 2);
    unpackCell(ctx, tile, 4, 4); unpackCell(ctx, tile, 4, 6);
    unpackCell(ctx, tile, 6, 4); unpackCell(ctx, tile, 6, 6);
}

function writeHuffCode(ctx, mode) {
    putBits(ctx, ctx.huffLen[mode], ctx.huffCode[mode]);
}

// ============================================================
// Attribute helpers
// ============================================================

function getAttr(ctx, a) {
    if (a < 0 || a >= ctx.PICATTRS) return -1;
    return ctx.zxBuf[ZX_MONO + a] & 0xFF;
}

function skipSearchLeft(ctx, a) {
    for (let i = a - 2; i >= 0; --i)
        if (getAttr(ctx, i) !== getAttr(ctx, a - 1))
            return getAttr(ctx, i);
    return -1;
}

function skipSearchRight(ctx, a) {
    if (a < ATTR_ROW) return -1;
    for (let i = a - ATTR_ROW + 1; i < a; ++i)
        if (getAttr(ctx, i) !== getAttr(ctx, a - ATTR_ROW))
            return getAttr(ctx, i);
    return -1;
}

// ============================================================
// Attribute prediction set fill
// ============================================================

function build3Predictions(ctx, pset) {
    let a, p;
    for (a = 0; a < ctx.PICATTRS; ++a) {
        p = 0;
        if (getAttr(ctx, a) === getAttr(ctx, a - 1))        p += 1;
        if (getAttr(ctx, a) === getAttr(ctx, a - ATTR_ROW))  p += 2;
        pset[a] = p;
    }
    for (a = 1; a < ctx.PICATTRS; ++a)
        if ((p = (pset[a] & pset[a - 1])) > 0) pset[a] = p;
    // a == PICATTRS after loop
    if (pset[a - 1] === 3) pset[a - 1] = 1;
    for (a = ctx.PICATTRS - 2; a > 0; --a) {
        p = (pset[a + 1] === 0 ? 1 : pset[a + 1]);
        if ((p = (pset[a] & p)) > 0) pset[a] = p;
    }
}

function build5Predictions(ctx, pset) {
    let a, p;
    for (a = 0; a < ctx.PICATTRS; ++a) {
        p = 0;
        if (getAttr(ctx, a) === getAttr(ctx, a - 1))        p += 1;
        if (getAttr(ctx, a) === getAttr(ctx, a - ATTR_ROW))  p += 2;
        if (getAttr(ctx, a) === skipSearchLeft(ctx, a))       p += 4;
        if (getAttr(ctx, a) === skipSearchRight(ctx, a))      p += 8;
        pset[a] = p;
    }
    for (a = 1; a < ctx.PICATTRS; ++a)
        if ((p = (pset[a] & pset[a - 1])) > 0) pset[a] = p;
    for (a = ctx.PICATTRS - 2; a > 0; --a)
        if ((p = (pset[a] & pset[a + 1])) > 0) pset[a] = p;
    for (a = 1; a < ctx.PICATTRS; ++a)
        if ((pset[a - 1] & pset[a]) === 0) {
            if ((pset[a] & 1) > 0) pset[a] = 1;
            if ((pset[a] & 2) > 0) pset[a] = 2;
            if ((pset[a] & 4) > 0) pset[a] = 4;
        }
    for (a = 1; a < ctx.PICATTRS; ++a)
        if ((p = (pset[a] & pset[a - 1])) > 0) pset[a] = p;
}

// ============================================================
// Attribute cost calculation
// ============================================================

function calcAttrCost(ctx) {
    let i, a, freqal = 0, loads = 0;
    let b = ctx.PICATTRS, prevPred = 0;
    const maxRefs = (1 << ctx.cfg[CFAREB]);
    const maxRle = (1 << ctx.cfg[CFARLEB]) - 1;
    let rleCount = maxRle;

    for (i = 0; i < 256; ++i) ctx.attrFreq[i] = 0;

    if (ctx.cfg[CFAREM] < 2) {
        for (a = 0; a < ctx.PICATTRS; ++a) {
            switch (ctx.pred3[a]) {
                case 0: ++loads; ++(ctx.attrFreq[getAttr(ctx, a)]); if (prevPred !== 0) ++b; break;
                case 1: if (prevPred !== 1) ++b; break;
                case 2: if (prevPred !== 2) ++b; break;
            }
            if (ctx.cfg[CFARLEB] > 1) {
                if (ctx.pred3[a] !== prevPred) rleCount = maxRle;
                else if (rleCount < maxRle) { --b; ++rleCount; }
                else { b += ctx.cfg[CFARLEB]; rleCount = 0; }
            }
            prevPred = ctx.pred3[a];
        }
    } else {
        for (a = 0; a < ctx.PICATTRS; ++a) {
            switch (ctx.pred5[a]) {
                case 0: ++loads; ++(ctx.attrFreq[getAttr(ctx, a)]); if (prevPred !== 0) b += 2; break;
                case 1: if (prevPred !== 1) b += 2; break;
                case 2: if (prevPred !== 2) b += 2; break;
                case 4: if (prevPred !== 4) b += 2; break;
                case 8: if (prevPred !== 8) b += 2; break;
            }
            if (ctx.cfg[CFARLEB] > 1) {
                if (ctx.pred5[a] !== prevPred) rleCount = maxRle;
                else if (rleCount < maxRle) { --b; ++rleCount; }
                else { b += ctx.cfg[CFARLEB]; rleCount = 0; }
            }
            prevPred = ctx.pred5[a];
        }
    }

    if (ctx.cfg[CFAREB] === 0) return b + loads * (7 + ctx.cfg[CFFLASH]);
    if (ctx.cfg[CFDIFA] <= maxRefs) {
        for (a = 0; a < maxRefs; ++a) { i = indexOfMax(256, ctx.attrFreq); freqal += ctx.attrFreq[i]; ctx.attrFreq[i] *= -1; ctx.attrPalette[a] = i; }
        return b + loads * ctx.cfg[CFAREB] + ctx.cfg[CFDIFA] * 8;
    }

    if (ctx.cfg[CFAREM] & 1) {
        for (a = 0; a < maxRefs - 1; ++a) { i = indexOfMax(256, ctx.attrFreq); freqal += ctx.attrFreq[i]; ctx.attrFreq[i] *= -1; ctx.attrPalette[a] = i; }
        return b + freqal * ctx.cfg[CFAREB] + (loads - freqal) * (ctx.cfg[CFAREB] + 7 + ctx.cfg[CFFLASH]) + (maxRefs - 1) * 8;
    } else {
        for (a = 0; a < maxRefs; ++a) { i = indexOfMax(256, ctx.attrFreq); freqal += ctx.attrFreq[i]; ctx.attrFreq[i] *= -1; ctx.attrPalette[a] = i; }
        return b + freqal * (ctx.cfg[CFAREB] + 1) + (loads - freqal) * (8 + ctx.cfg[CFFLASH]) + maxRefs * 8;
    }
}

// ============================================================
// Attribute value encode / decode
// ============================================================

function findInPalette(ctx, a, n) {
    for (let i = 0; i < n; ++i)
        if (getAttr(ctx, a) === ctx.attrPalette[i]) return i;
    return n + 1;
}

function writeAttrValue(ctx, a) {
    let i;
    const maxRefs = (1 << ctx.cfg[CFAREB]);
    if (ctx.cfg[CFAREB] > 0) {
        i = findInPalette(ctx, a, maxRefs);
        if (ctx.cfg[CFAREM] & 1) {
            if (ctx.cfg[CFDIFA] <= maxRefs) { putBits(ctx, ctx.cfg[CFAREB], i); return; }
            if (i < maxRefs - 1) { putBits(ctx, ctx.cfg[CFAREB], i + 1); return; }
            putBits(ctx, ctx.cfg[CFAREB], 0);
        } else {
            if (i < maxRefs) { putBit(ctx, 1); putBits(ctx, ctx.cfg[CFAREB], i); return; }
            else putBit(ctx, 0);
        }
    }
    if (ctx.cfg[CFFLASH] === YES) putBits(ctx, 8, getAttr(ctx, a));
    else putBits(ctx, 7, getAttr(ctx, a));
}

function readAttrValue(ctx, a) {
    let i;
    const maxRefs = (1 << ctx.cfg[CFAREB]);
    if (ctx.cfg[CFAREB] > 0) {
        if (ctx.cfg[CFAREM] & 1) {
            i = getBits(ctx, ctx.cfg[CFAREB]);
            if (ctx.cfg[CFDIFA] <= maxRefs) return ctx.attrPalette[i];
            if (i > 0) return ctx.attrPalette[i - 1];
        } else {
            if (getBit(ctx)) return ctx.attrPalette[getBits(ctx, ctx.cfg[CFAREB])];
        }
    }
    if (ctx.cfg[CFFLASH] === YES) return getBits(ctx, 8);
    else return getBits(ctx, 7);
}

// ============================================================
// Attribute RLE
// ============================================================

function flushRle(ctx) {
    const saved = ctx.bitPos;
    ctx.bitPos = ctx.rlePos;
    putBits(ctx, ctx.cfg[CFARLEB], ctx.rleCount);
    ctx.bitPos = saved;
    ctx.rleCount = 256;
}

function rleWriteBit(ctx) {
    if (ctx.cfg[CFARLEB] < 2) { putBit(ctx, 0); return; }
    if (ctx.rleCount < ((1 << ctx.cfg[CFARLEB]) - 1)) { ++ctx.rleCount; return; }
    if (ctx.rleCount === ((1 << ctx.cfg[CFARLEB]) - 1)) flushRle(ctx);
    putBit(ctx, 0); ctx.rlePos = ctx.bitPos; ctx.rleCount = 0;
    putBits(ctx, ctx.cfg[CFARLEB], 0);
}

function rleReadBit(ctx) {
    if (ctx.cfg[CFARLEB] < 2) return getBit(ctx);
    if (ctx.rleCount > 0) { --ctx.rleCount; return 0; }
    if (getBit(ctx) === 1) return 1;
    ctx.rleCount = getBits(ctx, ctx.cfg[CFARLEB]); return 0;
}

// ============================================================
// Attribute pack / unpack (3-mode and 5-mode)
// ============================================================

function packAttr3(ctx, r, c) {
    const a = r * ATTR_ROW + c;
    if (ctx.cfg[CFARLEB] > 1 && ctx.prevPred !== ctx.pred3[a] && ctx.rleCount < 256) flushRle(ctx);
    switch ((ctx.prevPred << 2) + ctx.pred3[a]) {
        case  0: rleWriteBit(ctx); writeAttrValue(ctx, a); break;
        case  1: putBits(ctx, 2, 2); ctx.prevPred = 1; break;
        case  2: putBits(ctx, 2, 3); ctx.prevPred = 2; break;

        case  4: putBits(ctx, 2, 2); writeAttrValue(ctx, a); ctx.prevPred = 0; break;
        case  5: rleWriteBit(ctx); break;
        case  6: putBits(ctx, 2, 3); ctx.prevPred = 2; break;

        case  8: putBits(ctx, 2, 3); writeAttrValue(ctx, a); ctx.prevPred = 0; break;
        case  9: putBits(ctx, 2, 2); ctx.prevPred = 1; break;
        case 10: rleWriteBit(ctx); break;
    }
}

function unpackAttr3(ctx, r, c) {
    const a = r * ATTR_ROW + c;
    if (rleReadBit(ctx) === 0) switch (ctx.prevPred) {
        case 0: return readAttrValue(ctx, a);
        case 1: return getAttr(ctx, a - 1);
        case 2: return getAttr(ctx, a - ATTR_ROW);
    }
    switch ((ctx.prevPred << 1) + getBit(ctx)) {
        case 0: ctx.prevPred = 1; return getAttr(ctx, a - 1);
        case 1: ctx.prevPred = 2; return getAttr(ctx, a - ATTR_ROW);
        case 2: ctx.prevPred = 0; return readAttrValue(ctx, a);
        case 3: ctx.prevPred = 2; return getAttr(ctx, a - ATTR_ROW);
        case 4: ctx.prevPred = 1; return getAttr(ctx, a - 1);
        case 5: ctx.prevPred = 0; return readAttrValue(ctx, a);
    }
    return 0; // should not reach
}

function packAttr5(ctx, r, c) {
    const a = r * ATTR_ROW + c;
    if (ctx.cfg[CFARLEB] > 1 && ctx.prevPred !== ctx.pred5[a] && ctx.rleCount < 256) flushRle(ctx);
    switch ((ctx.prevPred << 4) + ctx.pred5[a]) {
        case   0: rleWriteBit(ctx); writeAttrValue(ctx, a); break;
        case   1: putBits(ctx, 3, 4); ctx.prevPred = 1; break;
        case   2: putBits(ctx, 3, 5); ctx.prevPred = 2; break;
        case   4: putBits(ctx, 3, 6); ctx.prevPred = 4; break;
        case   8: putBits(ctx, 3, 7); ctx.prevPred = 8; break;

        case  16: putBits(ctx, 3, 4); writeAttrValue(ctx, a); ctx.prevPred = 0; break;
        case  17: rleWriteBit(ctx); break;
        case  18: putBits(ctx, 3, 5); ctx.prevPred = 2; break;
        case  20: putBits(ctx, 3, 6); ctx.prevPred = 4; break;
        case  24: putBits(ctx, 3, 7); ctx.prevPred = 8; break;

        case  32: putBits(ctx, 3, 5); writeAttrValue(ctx, a); ctx.prevPred = 0; break;
        case  33: putBits(ctx, 3, 4); ctx.prevPred = 1; break;
        case  34: rleWriteBit(ctx); break;
        case  36: putBits(ctx, 3, 6); ctx.prevPred = 4; break;
        case  40: putBits(ctx, 3, 7); ctx.prevPred = 8; break;

        case  64: putBits(ctx, 3, 6); writeAttrValue(ctx, a); ctx.prevPred = 0; break;
        case  65: putBits(ctx, 3, 4); ctx.prevPred = 1; break;
        case  66: putBits(ctx, 3, 5); ctx.prevPred = 2; break;
        case  68: rleWriteBit(ctx); break;
        case  72: putBits(ctx, 3, 7); ctx.prevPred = 8; break;

        case 128: putBits(ctx, 3, 7); writeAttrValue(ctx, a); ctx.prevPred = 0; break;
        case 129: putBits(ctx, 3, 4); ctx.prevPred = 1; break;
        case 130: putBits(ctx, 3, 5); ctx.prevPred = 2; break;
        case 132: putBits(ctx, 3, 6); ctx.prevPred = 4; break;
        case 136: rleWriteBit(ctx); break;
    }
}

function unpackAttr5(ctx, r, c) {
    const a = r * ATTR_ROW + c;
    if (rleReadBit(ctx) === 0) switch (ctx.prevPred) {
        case 0: return readAttrValue(ctx, a);
        case 1: return getAttr(ctx, a - 1);
        case 2: return getAttr(ctx, a - ATTR_ROW);
        case 4: return skipSearchLeft(ctx, a);
        case 8: return skipSearchRight(ctx, a);
    }
    switch ((ctx.prevPred << 2) + getBits(ctx, 2)) {
        case  0: ctx.prevPred = 1; return getAttr(ctx, a - 1);
        case  1: ctx.prevPred = 2; return getAttr(ctx, a - ATTR_ROW);
        case  2: ctx.prevPred = 4; return skipSearchLeft(ctx, a);
        case  3: ctx.prevPred = 8; return skipSearchRight(ctx, a);

        case  4: ctx.prevPred = 0; return readAttrValue(ctx, a);
        case  5: ctx.prevPred = 2; return getAttr(ctx, a - ATTR_ROW);
        case  6: ctx.prevPred = 4; return skipSearchLeft(ctx, a);
        case  7: ctx.prevPred = 8; return skipSearchRight(ctx, a);

        case  8: ctx.prevPred = 1; return getAttr(ctx, a - 1);
        case  9: ctx.prevPred = 0; return readAttrValue(ctx, a);
        case 10: ctx.prevPred = 4; return skipSearchLeft(ctx, a);
        case 11: ctx.prevPred = 8; return skipSearchRight(ctx, a);

        case 16: ctx.prevPred = 1; return getAttr(ctx, a - 1);
        case 17: ctx.prevPred = 2; return getAttr(ctx, a - ATTR_ROW);
        case 18: ctx.prevPred = 0; return readAttrValue(ctx, a);
        case 19: ctx.prevPred = 8; return skipSearchRight(ctx, a);

        case 32: ctx.prevPred = 1; return getAttr(ctx, a - 1);
        case 33: ctx.prevPred = 2; return getAttr(ctx, a - ATTR_ROW);
        case 34: ctx.prevPred = 4; return skipSearchLeft(ctx, a);
        case 35: ctx.prevPred = 0; return readAttrValue(ctx, a);
    }
    return 0; // should not reach
}

function packAttr(ctx, r, c) {
    if (ctx.cfg[CFAREM] < 2) packAttr3(ctx, r, c);
    else packAttr5(ctx, r, c);
}

function unpackAttr(ctx, r, c) {
    if (ctx.cfg[CFAREM] < 2) return unpackAttr3(ctx, r, c);
    else return unpackAttr5(ctx, r, c);
}

// ============================================================
// Reference search (optimized with pre-computed tiles)
// ============================================================

function buildRefTable(ctx) {
    let r, c, begc, dr, dc, t, b, mi, me, disp;
    const PICROWS = ctx.PICROWS;
    const TILECOLS = ctx.TILECOLS;
    const inv = ctx.cfg[CFINV];
    const grpMode = ctx.cfg[CFGRP];

    // Select fused cost functions based on grouping mode
    let fusedEqu, fusedInv;
    switch (grpMode) {
        case CELLS: fusedEqu = fusedXorTileCostCells; fusedInv = fusedInvXorTileCostCells; break;
        case QUARS: fusedEqu = fusedXorTileCostQuars; fusedInv = fusedInvXorTileCostQuars; break;
        case TILES: fusedEqu = fusedXorTileCostTiles; fusedInv = fusedInvXorTileCostTiles; break;
        default:    fusedEqu = fusedXorTileCostBoth;  fusedInv = fusedInvXorTileCostBoth;  break;
    }

    // Initialize first tile ref costs
    const baseIdx0 = 3 * 10; // dim=3, b=0..9
    for (b = 0; b < 10; ++b) {
        ctx.refEqu[baseIdx0 + b] = HIGH_COST;
        ctx.refInv[baseIdx0 + b] = HIGH_COST;
    }

    // Pre-compute all tiles into a flat array
    const numTileRows = (PICROWS - 7 + 7) / 8 | 0; // = PICROWS/8
    const numTileCols = (ZX_COLS - 7 + 7) / 8 | 0; // = 32
    const totalTiles = numTileRows * numTileCols;
    const allTiles = new Int8Array(totalTiles * 64);

    // Read all tiles from pixelBuf
    const pixelBuf = ctx.pixelBuf;
    for (let tr = 0; tr < numTileRows; ++tr) {
        const tileR = tr * 8;
        for (let tc = 0; tc < numTileCols; ++tc) {
            const tileC = tc * 8;
            const tileOff = (tr * numTileCols + tc) * 64;
            // All tiles in the main area are within bounds (r>=0, c>=0, r+8<=PICROWS, c+8<=256)
            let bufBase = tileR * ZX_COLS + tileC;
            let tIdx = tileOff;
            for (let rr = 0; rr < 8; ++rr) {
                for (let cc = 0; cc < 8; ++cc) {
                    allTiles[tIdx++] = pixelBuf[bufBase + cc] ^ inv;
                }
                bufBase += ZX_COLS;
            }
        }
    }

    for (r = 0, begc = 8; r < PICROWS - 7; r += 8)
        for (c = begc, begc = 0; c < ZX_COLS - 7; c += 8) {
            mi = me = HIGH_COST;
            const curTileIdx = ((r / 8 | 0) * numTileCols + (c / 8 | 0));
            const curOff = curTileIdx * 64;
            const rr_idx = r / 8 | 0;
            const cc_idx = c / 8 | 0;
            const refBaseIdx = (rr_idx * TILECOLS + cc_idx) * 40;

            disp = 0; dr = r; dc = c - 8;
            while (dr >= 0) {
                while (dc >= 0) {
                    ++disp;
                    const refTileIdx = ((dr / 8 | 0) * numTileCols + (dc / 8 | 0));
                    const refOff = refTileIdx * 64;

                    t = fusedEqu(allTiles, curOff, allTiles, refOff);
                    if (t < me) {
                        me = t;
                        for (b = bitsRequired(disp - 1) - 1; b < 10; ++b) {
                            ctx.refEqu[refBaseIdx + 0 * 10 + b] = dr;
                            ctx.refEqu[refBaseIdx + 1 * 10 + b] = dc;
                            ctx.refEqu[refBaseIdx + 2 * 10 + b] = disp - 1;
                            ctx.refEqu[refBaseIdx + 3 * 10 + b] = me;
                        }
                    }
                    t = fusedInv(allTiles, curOff, allTiles, refOff);
                    if (t < mi) {
                        mi = t;
                        for (b = bitsRequired(disp - 1) - 1; b < 10; ++b) {
                            ctx.refInv[refBaseIdx + 0 * 10 + b] = dr;
                            ctx.refInv[refBaseIdx + 1 * 10 + b] = dc;
                            ctx.refInv[refBaseIdx + 2 * 10 + b] = disp - 1;
                            ctx.refInv[refBaseIdx + 3 * 10 + b] = mi;
                        }
                    }
                    dc -= 8;
                }
                dc = ZX_COLS - 8; dr -= 8;
            }
        }
}

// ============================================================
// Cost calculation
// ============================================================

function buildModeCosts(ctx, onlytop) {
    let r, c, rr, cc;
    const reb = ctx.cfg[CFREB] + ctx.cfg[CFRPR] + NOREFS;
    let ROWS = ctx.PICROWS - 7;
    if (onlytop) ROWS = 1;
    const TILECOLS = ctx.TILECOLS;

    for (r = 0; r < ROWS; r += 8)
        for (c = 0, rr = r / 8 | 0; c < ZX_COLS - 7; c += 8) {
            cc = c / 8 | 0;
            const mcBase = (rr * TILECOLS + cc) * NUM_MODES;
            const refBase = (rr * TILECOLS + cc) * 40;

            readTile(ctx, ctx.tileA, ctx.pixelBuf, r, c, true);

            readTile(ctx, ctx.tileB, ctx.pixelBuf, r - 2, c, true);
            xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB);
            ctx.modeCosts[mcBase + XVER2] = tileCost(ctx, ctx.tileXor);

            readTile(ctx, ctx.tileB, ctx.pixelBuf, r - 1, c, true);
            xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB);
            ctx.modeCosts[mcBase + XVER1] = tileCost(ctx, ctx.tileXor);

            if (onlytop && (ctx.cfg[CFVB1] + ctx.cfg[CFVB2] > 0)) continue;

            ctx.modeCosts[mcBase + XTEQU] = tileCost(ctx, ctx.tileA);
            ctx.modeCosts[mcBase + XREQU] = ctx.refEqu[refBase + 3 * 10 + ctx.cfg[CFREB] - 1] + reb;

            readTile(ctx, ctx.tileB, ctx.pixelBuf, r, c - 2, true);
            xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB);
            ctx.modeCosts[mcBase + XHOR2] = tileCost(ctx, ctx.tileXor);

            readTile(ctx, ctx.tileB, ctx.pixelBuf, r, c - 1, true);
            xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB);
            ctx.modeCosts[mcBase + XHOR1] = tileCost(ctx, ctx.tileXor);

            invertTile(ctx.tileA, ctx.tileA);
            ctx.modeCosts[mcBase + XTINV] = tileCost(ctx, ctx.tileA);
            ctx.modeCosts[mcBase + XRINV] = ctx.refInv[refBase + 3 * 10 + ctx.cfg[CFREB] - 1] + reb;
        }
}

function findBestMode(ctx, r, c, tc) {
    const sreb = ctx.cfg[CFREB];
    const mcBase = (r * ctx.TILECOLS + c) * NUM_MODES;
    const refBase = (r * ctx.TILECOLS + c) * 40;
    for (let i = 0; i < NUM_MODES; ++i) tc[i] = ctx.modeCosts[mcBase + i] + ctx.huffLen[i];
    if (ctx.cfg[CFRPR] === YES) {
        if (ctx.refInv[refBase + 2 * 10 + ctx.cfg[CFREB] - 1] === ctx.prevDisp[ctx.ri]) tc[XRINV] -= sreb;
        if (ctx.refEqu[refBase + 2 * 10 + ctx.cfg[CFREB] - 1] === ctx.prevDisp[ctx.re]) tc[XREQU] -= sreb;
    }
    return indexOfMin(NUM_MODES, tc);
}

function calcTotalCost(ctx, onlytop) {
    let r, c, i, m, n = 0;
    const tc = new Array(NUM_MODES);
    let ROWS = ctx.PICROWS / 8 | 0;
    if (onlytop) ROWS = 1;
    ctx.prevDisp[ctx.ri] = -1; ctx.prevDisp[ctx.re] = -1; ctx.repeatRefs = 0;
    ctx.nonPackedTiles = 0; ctx.extraBits = 0;
    for (i = 0; i < NUM_MODES; ++i) ctx.modeTotals[i] = 0;
    const TILECOLS = ctx.TILECOLS;

    for (r = 0; r < ROWS; ++r)
        for (c = 0; c < TILECOLS; ++c) {
            m = findBestMode(ctx, r, c, tc);
            n += tc[m];

            if (onlytop) continue;

            ++ctx.modeTotals[m];
            if (tc[m] > 64) { ++ctx.nonPackedTiles; ctx.extraBits += tc[m] - 64; }
            const refBase = (r * TILECOLS + c) * 40;
            if (m === XRINV) {
                if (ctx.prevDisp[ctx.ri] === ctx.refInv[refBase + 2 * 10 + ctx.cfg[CFREB] - 1]) ++ctx.repeatRefs;
                else ctx.prevDisp[ctx.ri] = ctx.refInv[refBase + 2 * 10 + ctx.cfg[CFREB] - 1];
            }
            if (m === XREQU) {
                if (ctx.prevDisp[ctx.re] === ctx.refEqu[refBase + 2 * 10 + ctx.cfg[CFREB] - 1]) ++ctx.repeatRefs;
                else ctx.prevDisp[ctx.re] = ctx.refEqu[refBase + 2 * 10 + ctx.cfg[CFREB] - 1];
            }
        }
    return n;
}

// ============================================================
// Iterative Huffman optimization
// ============================================================

function optimizeHuffman(ctx) {
    let i, n = INF, s;

    for (i = 0; i < NUM_MODES; ++i) ctx.huffLen[i] = NUM_MODES;

    while ((s = calcTotalCost(ctx, 0)) < n) {
        for (i = 0; i < NUM_MODES; ++i) {
            ctx.huffLen[i] = ctx.modeTotals[i];
        }
        huffman(NUM_MODES, ctx.huffLen, ctx.huffCode);
        n = s;
    }
    return n;
}

// ============================================================
// Apply XOR transforms to build xorBuf
// ============================================================

function buildXorBuffer(ctx) {
    let r, c;
    const tc = new Array(NUM_MODES);
    const TILECOLS = ctx.TILECOLS;
    ctx.prevDisp[ctx.ri] = -1; ctx.prevDisp[ctx.re] = -1;

    for (r = 0; r < ctx.PICROWS - 7; r += 8)
        for (c = 0; c < ZX_COLS - 7; c += 8) {
            readTile(ctx, ctx.tileA, ctx.pixelBuf, r, c, true);
            const rr = r / 8 | 0, cc = c / 8 | 0;
            const refBase = (rr * TILECOLS + cc) * 40;
            switch (findBestMode(ctx, rr, cc, tc)) {
                case XTINV:
                    invertTile(ctx.tileXor, ctx.tileA); break;
                case XTEQU:
                    readTile(ctx, ctx.tileXor, ctx.pixelBuf, r, c, true); break;
                case XHOR2:
                    readTile(ctx, ctx.tileB, ctx.pixelBuf, r, c - 2, true);
                    xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB); break;
                case XVER2:
                    readTile(ctx, ctx.tileB, ctx.pixelBuf, r - 2, c, true);
                    xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB); break;
                case XHOR1:
                    readTile(ctx, ctx.tileB, ctx.pixelBuf, r, c - 1, true);
                    xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB); break;
                case XVER1:
                    readTile(ctx, ctx.tileB, ctx.pixelBuf, r - 1, c, true);
                    xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB); break;
                case XREQU:
                    ctx.prevDisp[ctx.re] = ctx.refEqu[refBase + 2 * 10 + ctx.cfg[CFREB] - 1];
                    readTile(ctx, ctx.tileB, ctx.pixelBuf,
                        ctx.refEqu[refBase + 0 * 10 + ctx.cfg[CFREB] - 1],
                        ctx.refEqu[refBase + 1 * 10 + ctx.cfg[CFREB] - 1], true);
                    xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB); break;
                case XRINV:
                    ctx.prevDisp[ctx.ri] = ctx.refInv[refBase + 2 * 10 + ctx.cfg[CFREB] - 1];
                    readTile(ctx, ctx.tileB, ctx.pixelBuf,
                        ctx.refInv[refBase + 0 * 10 + ctx.cfg[CFREB] - 1],
                        ctx.refInv[refBase + 1 * 10 + ctx.cfg[CFREB] - 1], true);
                    invertTile(ctx.tileB, ctx.tileB);
                    xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB); break;
            }
            writeTile(ctx, ctx.tileXor, ctx.xorBuf, r, c);
        }
}

// ============================================================
// Huffman tree serialization
// ============================================================

function buildHuffTree(ctx, clen, code) {
    if (clen === 0) ctx.freeNode = 0;
    ++clen;
    if (clen > NUM_MODES) throw new Error('buildHuffTree overflow');
    let i, lob;
    const thisNode = ctx.freeNode;
    ctx.freeNode += 2; code *= 2;
    for (lob = 0; lob < 2; ++lob) {
        code += lob;
        ctx.modeTree[thisNode + lob] = 0xE0;
        for (i = 0; i < NUM_MODES; ++i)
            if (clen === ctx.huffLen[i] && code === ctx.huffCode[i])
                ctx.modeTree[thisNode + lob] = i;
        if (ctx.modeTree[thisNode + lob] === 0xE0) {
            ctx.modeTree[thisNode + lob] += (ctx.freeNode - thisNode - lob);
            buildHuffTree(ctx, clen, code);
        }
    }
}

// ============================================================
// zxdepcalc stub (SFX not ported)
// ============================================================

function zxdepcalc() { return 0; }

// ============================================================
// Exhaustive configuration search
// ============================================================

function findBestConfig(ctx) {
    let i, a, size, minsize = INF;

    ctx.cfg[CFDIFA] = 1;

    for (ctx.cfg[CFGRP] = CELLS; ctx.cfg[CFGRP] <= BOTH; ++ctx.cfg[CFGRP]) {
        buildRefTable(ctx);
        for (ctx.cfg[CFHB1] = 0; ctx.cfg[CFHB1] <= 1; ++ctx.cfg[CFHB1])
         for (ctx.cfg[CFHB2] = 0; ctx.cfg[CFHB2] <= 1; ++ctx.cfg[CFHB2])
          for (ctx.cfg[CFINV] = NO; ctx.cfg[CFINV] <= YES; ++ctx.cfg[CFINV])
           for (ctx.cfg[CFREB] = 1; ctx.cfg[CFREB] <= ctx.MAXREB; ++ctx.cfg[CFREB])
            for (ctx.cfg[CFRPR] = NO; ctx.cfg[CFRPR] <= YES; ++ctx.cfg[CFRPR]) {
                buildModeCosts(ctx, 0);
                for (ctx.cfg[CFVB1] = 0; ctx.cfg[CFVB1] <= 255; ctx.cfg[CFVB1] += 85)
                 for (ctx.cfg[CFVB2] = 0; ctx.cfg[CFVB2] <= 255; ctx.cfg[CFVB2] += 85) {
                    buildModeCosts(ctx, ctx.cfg[CFVB1] + ctx.cfg[CFVB2]);
                    size = optimizeHuffman(ctx) + ctx.SFXMUL * zxdepcalc();
                    if (size < minsize) {
                        minsize = size;
                        for (i = 0; i < NUM_PARAMS; ++i) ctx.bestCfg[i] = ctx.cfg[i];
                    }
                 }
            }
    }

    for (i = 0; i < NUM_PARAMS; ++i) ctx.cfg[i] = ctx.bestCfg[i];

    build3Predictions(ctx, ctx.pred3);
    build5Predictions(ctx, ctx.pred5);

    ctx.cfg[CFFLASH] = 0;
    for (i = ZX_MONO; i < ZX_FULL; ++i) ctx.cfg[CFFLASH] |= (ctx.zxBuf[i] >> 7) & 1;
    for (a = 0; a < 256; ++a) ctx.attrFreq[a] = 0;
    for (a = 0; a < ctx.PICATTRS; ++a) ++ctx.attrFreq[getAttr(ctx, a)];
    ctx.cfg[CFDIFA] = 0;
    for (a = 0; a < 256; ++a) if (ctx.attrFreq[a] > 0) ++ctx.cfg[CFDIFA];
    ctx.bestCfg[CFDIFA] = ctx.cfg[CFDIFA];
    ctx.bestCfg[CFFLASH] = ctx.cfg[CFFLASH];

    if (ctx.cfg[CFDIFA] > 1) {
        minsize = INF; ctx.bestCfg[CFAREB] = ctx.cfg[CFAREB];
        for (ctx.cfg[CFAREB] = 0; ctx.cfg[CFAREB] <= MAX_ATTR_BITS; ++ctx.cfg[CFAREB])
            for (ctx.cfg[CFAREM] = 0; ctx.cfg[CFAREM] <= 3; ++ctx.cfg[CFAREM])
                for (ctx.cfg[CFARLEB] = 8; ctx.cfg[CFARLEB] > 0; --ctx.cfg[CFARLEB]) {
                    size = calcAttrCost(ctx) + ctx.SFXMUL * zxdepcalc();
                    if (size <= minsize) {
                        minsize = size;
                        ctx.bestCfg[CFAREB]  = ctx.cfg[CFAREB];
                        ctx.bestCfg[CFAREM]  = ctx.cfg[CFAREM];
                        ctx.bestCfg[CFARLEB] = ctx.cfg[CFARLEB];
                    }
                }
    }

    for (i = 0; i < NUM_PARAMS; ++i) ctx.cfg[i] = ctx.bestCfg[i];
}

// ============================================================
// Header I/O
// ============================================================

function writeHeader(ctx) {
    const alzero = (ctx.cfg[CFDIFA] === 1) ||
                 ((ctx.cfg[CFAREM] & 1) && ((1 << ctx.cfg[CFAREB]) < ctx.cfg[CFDIFA]));
    let i;
    const palSize = (1 << ctx.cfg[CFAREB]);
    ctx.bitPos = 0;

    putBit(ctx, ctx.cfg[CFASEP] ? 0 : 1);
    putBit(ctx, ctx.cfg[CFDIFA] === 1 ? 1 : 0);
    putBits(ctx, 2, ctx.cfg[CFGRP]);
    putBits(ctx, 2, ctx.cfg[CFAREM]);
    putBit(ctx, alzero ? 1 : 0);
    putBit(ctx, ctx.cfg[CFFLASH]);
    if (ctx.cfg[CFDIFA] > 1)
        putBits(ctx, 8, ctx.cfg[CFAREB] + 1);
    else
        putBits(ctx, 8, getAttr(ctx, 0));
    if (ctx.cfg[CFARLEB] > 1)
        putBits(ctx, 8, ctx.cfg[CFARLEB] + 1);
    else
        putBits(ctx, 8, 1);
    putBits(ctx, 8, (ctx.cfg[CFINV] * 0xFF) ^ ctx.cfg[CFVB1]);
    putBits(ctx, 8, (ctx.cfg[CFINV] * 0xFF) ^ ctx.cfg[CFVB2]);
    putBits(ctx, 8, (ctx.cfg[CFINV] * 3) ^ (ctx.cfg[CFHB2] * 2 + ctx.cfg[CFHB1]));
    putBits(ctx, 8, ctx.cfg[CFREB] * 2 + ctx.cfg[CFRPR]);
    putBits(ctx, 8, 14);

    buildHuffTree(ctx, 0, 0);
    for (i = 0; i < 14; ++i)
        switch (ctx.modeTree[i]) {
            case 0: putBits(ctx, 8, XRINV); break;
            case 1: putBits(ctx, 8, XREQU); break;
            case 2: if (ctx.cfg[CFINV] === YES) putBits(ctx, 8, XTEQU);
                    else putBits(ctx, 8, XTINV); break;
            case 3: putBits(ctx, 8, XHOR2); break;
            case 4: putBits(ctx, 8, XVER2); break;
            case 5: putBits(ctx, 8, XHOR1); break;
            case 6: putBits(ctx, 8, XVER1); break;
            case 7: if (ctx.cfg[CFINV] === YES) putBits(ctx, 8, XTINV);
                    else putBits(ctx, 8, XTEQU); break;
            default: putBits(ctx, 8, ctx.modeTree[i]); break;
        }

    if (ctx.cfg[CFDIFA] > 1 && ctx.cfg[CFAREB] > 0) {
        if (palSize >= ctx.cfg[CFDIFA]) {
            putBits(ctx, 8, ctx.cfg[CFDIFA] + (alzero ? 1 : 0));
            for (i = 0; i < ctx.cfg[CFDIFA]; ++i)
                putBits(ctx, 8, ctx.attrPalette[i]);
        } else {
            putBits(ctx, 8, palSize - (ctx.cfg[CFAREM] & 1) + (alzero ? 1 : 0));
            for (i = 0; i < palSize - (ctx.cfg[CFAREM] & 1); ++i)
                putBits(ctx, 8, ctx.attrPalette[i]);
        }
    } else {
        putBits(ctx, 8, 1);
    }
}

function readHeader(ctx) {
    let i, t, x, palCount, alzero;
    ctx.bitPos = 0;
    ctx.cfg[CFINV] = NO;
    ctx.cfg[CFASEP] = 1 - getBit(ctx);
    if (getBit(ctx)) ctx.cfg[CFDIFA] = 1; else ctx.cfg[CFDIFA] = 256;
    ctx.cfg[CFGRP] = getBits(ctx, 2);
    ctx.cfg[CFAREM] = getBits(ctx, 2);
    alzero = getBit(ctx);
    ctx.cfg[CFFLASH] = getBit(ctx);
    if (ctx.cfg[CFDIFA] === 1) {
        ctx.prevPred = getBits(ctx, 8); ctx.cfg[CFAREB] = 0;
    } else {
        ctx.cfg[CFAREB] = getBits(ctx, 8) - 1;
    }
    ctx.cfg[CFARLEB] = getBits(ctx, 8) - 1;
    if (ctx.cfg[CFARLEB] === 0) ctx.cfg[CFARLEB] = 1;
    ctx.cfg[CFVB1] = getBits(ctx, 8);
    ctx.cfg[CFVB2] = getBits(ctx, 8);
    ctx.cfg[CFHB2] = getBits(ctx, 7) & 1;
    ctx.cfg[CFHB1] = getBit(ctx);
    ctx.cfg[CFREB] = getBits(ctx, 7);
    ctx.cfg[CFRPR] = getBit(ctx);
    t = getBits(ctx, 8);
    if (t > 14) throw new Error('invalid header: tree size ' + t);

    for (i = 0; i < t; ++i) {
        x = getBits(ctx, 8);
        switch (x) {
            case XRINV: ctx.modeTree[i] = XRINV; break;
            case XREQU: ctx.modeTree[i] = XREQU; break;
            case XTINV: ctx.modeTree[i] = (ctx.cfg[CFINV] === YES ? XTEQU : XTINV); break;
            case XHOR2: ctx.modeTree[i] = XHOR2; break;
            case XVER2: ctx.modeTree[i] = XVER2; break;
            case XHOR1: ctx.modeTree[i] = XHOR1; break;
            case XVER1: ctx.modeTree[i] = XVER1; break;
            case XTEQU: ctx.modeTree[i] = (ctx.cfg[CFINV] === YES ? XTINV : XTEQU); break;
            default:
                if (x < 0xE1 || (x - 0xE0 + i) > (t - 2))
                    throw new Error('invalid header: tree value ' + x);
                ctx.modeTree[i] = x;
                break;
        }
    }

    palCount = getBits(ctx, 8) - (alzero ? 1 : 0);
    if (palCount > (1 << MAX_ATTR_BITS)) throw new Error('invalid header: palette count ' + palCount);
    if (!alzero) ctx.cfg[CFDIFA] = palCount;
    for (i = 0; i < palCount; ++i) ctx.attrPalette[i] = getBits(ctx, 8);
}

// ============================================================
// Main compression pipeline
// ============================================================

function compressPicture(ctx) {
    findBestConfig(ctx);
    buildRefTable(ctx); buildModeCosts(ctx, 0);
    let minsize = optimizeHuffman(ctx);
    let asize = 0;
    buildXorBuffer(ctx);
    if (ctx.cfg[CFDIFA] > 1) asize = calcAttrCost(ctx);

    // Sequential refs quick-fix
    if (ctx.cfg[CFRPR] === YES)
        if ((ctx.repeatRefs * ctx.cfg[CFREB]) < (ctx.modeTotals[XREQU] + ctx.modeTotals[XRINV])) {
            ctx.cfg[CFRPR] = NO;
            buildModeCosts(ctx, 0);
            minsize = optimizeHuffman(ctx);
            buildXorBuffer(ctx);
            if (ctx.cfg[CFDIFA] > 1) asize = calcAttrCost(ctx);
        }

    ctx.prevPred = 0; ctx.rleCount = 256;
    writeHeader(ctx);

    ctx.prevDisp[ctx.ri] = -1; ctx.prevDisp[ctx.re] = -1;

    let r, c, mode;
    const tc = new Array(NUM_MODES);
    const TILECOLS = ctx.TILECOLS;

    for (r = 0; r < ctx.PICROWS - 7; r += 8)
        for (c = 0; c < ZX_COLS - 7; c += 8) {
            readTile(ctx, ctx.tileB, ctx.xorBuf, r, c, false);

            switch (ctx.cfg[CFGRP]) {
                case CELLS: packAllCells(ctx, ctx.tileB); break;
                case QUARS: packAllQuarters(ctx, ctx.tileB); break;
                case TILES:
                    if (tileCost(ctx, ctx.tileB) === 1) putBit(ctx, 0);
                    else { putBit(ctx, 1); packAllCells(ctx, ctx.tileB); }
                    break;
                default: packAllGroups(ctx, ctx.tileB); break;
            }

            const rr = r / 8 | 0, cc = c / 8 | 0;
            const refBase = (rr * TILECOLS + cc) * 40;
            mode = findBestMode(ctx, rr, cc, tc);
            writeHuffCode(ctx, mode);

            if (mode === XRINV) {
                if (ctx.refInv[refBase + 2 * 10 + ctx.cfg[CFREB] - 1] === ctx.prevDisp[ctx.ri] && ctx.cfg[CFRPR])
                    putBit(ctx, 1);
                else {
                    ctx.prevDisp[ctx.ri] = ctx.refInv[refBase + 2 * 10 + ctx.cfg[CFREB] - 1];
                    putBits(ctx, ctx.cfg[CFREB] + ctx.cfg[CFRPR], ctx.prevDisp[ctx.ri]);
                }
            }
            if (mode === XREQU) {
                if (ctx.refEqu[refBase + 2 * 10 + ctx.cfg[CFREB] - 1] === ctx.prevDisp[ctx.re] && ctx.cfg[CFRPR])
                    putBit(ctx, 1);
                else {
                    ctx.prevDisp[ctx.re] = ctx.refEqu[refBase + 2 * 10 + ctx.cfg[CFREB] - 1];
                    putBits(ctx, ctx.cfg[CFREB] + ctx.cfg[CFRPR], ctx.prevDisp[ctx.re]);
                }
            }
            if (ctx.cfg[CFDIFA] > 1 && ctx.cfg[CFASEP] === NO) packAttr(ctx, rr, cc);
        }

    if (ctx.cfg[CFDIFA] > 1) {
        if (ctx.cfg[CFASEP] === YES)
            for (r = 0; r < ctx.PICROWS - 7; r += 8)
                for (c = 0; c < ZX_COLS - 7; c += 8)
                    packAttr(ctx, r / 8 | 0, c / 8 | 0);
        if (ctx.cfg[CFARLEB] > 1 && ctx.rleCount < 256) flushRle(ctx);
    }
}

// ============================================================
// Main decompression pipeline
// ============================================================

function decompressPicture(ctx) {
    ctx.prevPred = 0; ctx.rleCount = 0;
    readHeader(ctx);

    ctx.prevDisp[ctx.ri] = -1; ctx.prevDisp[ctx.re] = -1;

    let r, c, mode, dd, rr, cc;

    for (r = 0; r < ctx.PICROWS - 7; r += 8)
        for (c = 0; c < ZX_COLS - 7; c += 8) {
            switch (ctx.cfg[CFGRP]) {
                case CELLS: unpackAllCells(ctx, ctx.tileB); break;
                case QUARS: unpackAllQuarters(ctx, ctx.tileB); break;
                case TILES:
                    if (getBit(ctx)) unpackAllCells(ctx, ctx.tileB);
                    else clearTile(ctx.tileB);
                    break;
                default: unpackAllGroups(ctx, ctx.tileB); break;
            }
            writeTile(ctx, ctx.tileB, ctx.xorBuf, r, c);

            // Huffman tree walker
            let treeOfs = 0;
            do {
                if (treeOfs > 13) throw new Error('huffman tree overflow');
                treeOfs += getBit(ctx);
                mode = ctx.modeTree[treeOfs];
                treeOfs += (mode & 0x1F);
            } while (mode > 0xE0);

            switch (mode) {
                case XTINV:
                    invertTile(ctx.tileXor, ctx.tileB);
                    writeTile(ctx, ctx.tileXor, ctx.xorBuf, r, c);
                    break;
                case XVER2: xorVertical(ctx, ctx.xorBuf, r, c, 2); break;
                case XHOR2: xorHorizontal(ctx, ctx.xorBuf, r, c, 2); break;
                case XVER1: xorVertical(ctx, ctx.xorBuf, r, c, 1); break;
                case XHOR1: xorHorizontal(ctx, ctx.xorBuf, r, c, 1); break;
            }

            if (mode === XRINV) {
                if (!ctx.cfg[CFRPR]) ctx.prevDisp[ctx.ri] = getBits(ctx, ctx.cfg[CFREB]);
                else if (!getBit(ctx)) ctx.prevDisp[ctx.ri] = getBits(ctx, ctx.cfg[CFREB]);
                dd = (r / 8 | 0) * (ZX_COLS / 8) + (c / 8 | 0);
                dd -= (ctx.prevDisp[ctx.ri] + 1);
                rr = dd / (ZX_COLS / 8) | 0;
                cc = dd % (ZX_COLS / 8);
                readTile(ctx, ctx.tileA, ctx.xorBuf, rr * 8, cc * 8, false);
                invertTile(ctx.tileA, ctx.tileA);
                xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB);
                writeTile(ctx, ctx.tileXor, ctx.xorBuf, r, c);
            }
            if (mode === XREQU) {
                if (!ctx.cfg[CFRPR]) ctx.prevDisp[ctx.re] = getBits(ctx, ctx.cfg[CFREB]);
                else if (!getBit(ctx)) ctx.prevDisp[ctx.re] = getBits(ctx, ctx.cfg[CFREB]);
                dd = (r / 8 | 0) * (ZX_COLS / 8) + (c / 8 | 0);
                dd -= (ctx.prevDisp[ctx.re] + 1);
                rr = dd / (ZX_COLS / 8) | 0;
                cc = dd % (ZX_COLS / 8);
                readTile(ctx, ctx.tileA, ctx.xorBuf, rr * 8, cc * 8, false);
                xorTiles(ctx.tileXor, ctx.tileA, ctx.tileB);
                writeTile(ctx, ctx.tileXor, ctx.xorBuf, r, c);
            }

            if (ctx.cfg[CFASEP] === NO)
                ctx.zxBuf[ZX_MONO + (r / 8 | 0) * (ZX_COLS / 8) + (c / 8 | 0)] =
                    (ctx.cfg[CFDIFA] > 1 ? unpackAttr(ctx, r / 8 | 0, c / 8 | 0) : ctx.prevPred);
        }

    if (ctx.cfg[CFASEP] === YES)
        for (r = 0; r < ctx.PICROWS - 7; r += 8)
            for (c = 0; c < ZX_COLS - 7; c += 8)
                ctx.zxBuf[ZX_MONO + (r / 8 | 0) * (ZX_COLS / 8) + (c / 8 | 0)] =
                    (ctx.cfg[CFDIFA] > 1 ? unpackAttr(ctx, r / 8 | 0, c / 8 | 0) : ctx.prevPred);
}

// ============================================================
// ZX screen format conversion
// ============================================================

function rotateScreen(ctx, count) {
    let a, c, l, r, s;
    const ns = [0, 0, 0];

    while (count > 0) {
        for (c = 0; c < 32; ++c) {
            for (l = 7; l >= 0; --l) {
                a = c + (l << 8);
                ns[0] = ctx.zxBuf[a + 0x0800];
                ns[1] = ctx.zxBuf[a + 0x1000];
                ns[2] = ctx.zxBuf[a];
                for (s = 0; s < 3; ++s) {
                    for (r = 0; r < 7; ++r) {
                        ctx.zxBuf[a] = ctx.zxBuf[a + 32];
                        a += 32;
                    }
                    ctx.zxBuf[a] = ns[s];
                    a += 0x720;
                }
            }
            s = ctx.zxBuf[a];
            for (r = 0; r < 23; ++r) {
                ctx.zxBuf[a] = ctx.zxBuf[a + 32];
                a += 32;
            }
            ctx.zxBuf[a] = s;
        }
        --count;
    }
}

function screenToPixels(ctx, buf) {
    let r, cc, b, bits;
    const bitmask = [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01];
    for (r = 0; r < ctx.PICROWS; ++r)
        for (cc = 0; cc < ZX_COLS / 8; ++cc) {
            bits = ctx.zxBuf[(r / 64 | 0) * 2048 + (((r % 64) / 8 | 0)) * 32 + (r % 8) * 256 + cc];
            for (b = 0; b < 8; ++b)
                buf[r * ZX_COLS + cc * 8 + b] = ((bits & bitmask[b]) === 0 ? 0 : 1);
        }
}

function pixelsToScreen(ctx, buf) {
    let r, cc, b, bits;
    const bitmask = [0x7F, 0xBF, 0xDF, 0xEF, 0xF7, 0xFB, 0xFD, 0xFE];
    for (r = 0; r < ctx.PICROWS; ++r)
        for (cc = 0; cc < ZX_COLS / 8; ++cc) {
            bits = 0xFF;
            for (b = 0; b < 8; ++b)
                bits = bits & (buf[r * ZX_COLS + cc * 8 + b] === 0 ? bitmask[b] : 0xFF);
            ctx.zxBuf[(r / 64 | 0) * 2048 + (((r % 64) / 8 | 0)) * 32 + (r % 8) * 256 + cc] = bits & 0xFF;
        }
}

// ============================================================
// Attribute optimization (boundary-match cell inversion)
// ============================================================

// Decide per-cell whether to invert bitmap + swap ink/paper based on
// boundary pixel matching with neighbors and attribute coherence.
//
// For LgK's shifted XOR prediction (XHOR1, XVER1), inverting a cell
// only changes the boundary pixels in the XOR residual — within-cell
// gradients are invariant to inversion.  We estimate whether inversion
// improves boundary matching with left/above neighbours and whether
// the attribute swap preserves or breaks attribute prediction runs.

function optimizeAttrsOnBuffer(zxBuf) {
    for (let charRow = 0; charRow < 24; ++charRow) {
        for (let charCol = 0; charCol < 32; ++charCol) {
            const attrAddr = 6144 + charRow * 32 + charCol;
            const attr = zxBuf[attrAddr];
            const ink = attr & 0x07;
            const paper = (attr >> 3) & 0x07;
            const flash = attr & 0x80;

            // skip hidden cells (ink === paper) and flashing cells
            if (ink === paper || flash) continue;

            // bitmap byte addresses: addr(line) = third*2048 + line*256 + crowInThird*32 + charCol
            const third = charRow >> 3;
            const crowInThird = charRow & 7;
            const baseAddr = third * 2048 + crowInThird * 32 + charCol;

            // --- Horizontal boundary: MSB(current) vs LSB(left) per row ---
            // For XHOR1 (1-pixel shift), only these 8 boundary pixels change
            // when the cell is inverted; columns 1-7 of the XOR residual are
            // within-cell gradients that are invariant to inversion.
            let hBoundaryMismatches = 0;
            if (charCol > 0) {
                for (let line = 0; line < 8; ++line) {
                    const addr = baseAddr + line * 256;
                    const curMSB = (zxBuf[addr] >> 7) & 1;
                    const leftLSB = zxBuf[addr - 1] & 1;
                    if (curMSB !== leftLSB) ++hBoundaryMismatches;
                }
            }

            // --- Vertical boundary: top row byte of current vs bottom row byte of above ---
            // For XVER1 (1-pixel shift), only these 8 boundary pixels change.
            let vBoundaryMismatches = 0;
            if (charRow > 0) {
                const aboveThird = (charRow - 1) >> 3;
                const aboveCrow  = (charRow - 1) & 7;
                const aboveBottom = aboveThird * 2048 + 7 * 256 + aboveCrow * 32 + charCol;
                const currentTop  = baseAddr; // line 0
                let v = zxBuf[currentTop] ^ zxBuf[aboveBottom];
                v = v - ((v >> 1) & 0x55);
                v = (v & 0x33) + ((v >> 2) & 0x33);
                vBoundaryMismatches = (v + (v >> 4)) & 0x0F;
            }

            // Inversion flips mismatches↔matches at the boundary:
            //   original mismatches  → 8 - mismatches  after inversion
            //   net improvement = 2 * mismatches - 8  (positive ⇒ inversion helps)
            const hBenefit = charCol > 0 ? 2 * hBoundaryMismatches - 8 : 0;
            const vBenefit = charRow > 0 ? 2 * vBoundaryMismatches - 8 : 0;
            const pixelBenefit = hBenefit + vBenefit;

            // --- Attribute coherence cost ---
            // Estimate how inversion affects the attribute prediction stream.
            // Breaking a match with left/above costs ~10/8 bits (state transition + raw value).
            // Gaining a match saves the same.
            const swappedAttr = (attr & 0xC0) | (ink << 3) | paper;
            let attrCost = 0;
            if (charCol > 0) {
                const leftAttr = zxBuf[attrAddr - 1];
                if (attr === leftAttr && swappedAttr !== leftAttr) attrCost += 10;
                else if (attr !== leftAttr && swappedAttr === leftAttr) attrCost -= 10;
            }
            if (charRow > 0) {
                const aboveAttr = zxBuf[attrAddr - 32];
                if (attr === aboveAttr && swappedAttr !== aboveAttr) attrCost += 8;
                else if (attr !== aboveAttr && swappedAttr === aboveAttr) attrCost -= 8;
            }

            // Invert only if the boundary pixel improvement outweighs attribute cost
            if (pixelBenefit > attrCost) {
                for (let line = 0; line < 8; ++line) {
                    zxBuf[baseAddr + line * 256] ^= 0xFF;
                }
                zxBuf[attrAddr] = swappedAttr;
            }
        }
    }
}

// ============================================================
// Bitstream <-> byte array conversion
// ============================================================

function bitsToBytes(ctx, bitsize) {
    const bytesize = ((bitsize + 7) / 8) | 0;
    const result = new Uint8Array(bytesize);
    const savedPos = ctx.bitPos;
    ctx.bitPos = 0;
    for (let i = 0; i < bytesize; ++i)
        result[i] = getBits(ctx, 8);
    ctx.bitPos = savedPos;
    return result;
}

function bytesToBits(ctx, data) {
    ctx.bitPos = 0;
    for (let i = 0; i < data.length; ++i)
        putBits(ctx, 8, data[i]);
}

// ============================================================
// Public API
// ============================================================

/**
 * Compress a ZX Spectrum screen file.
 * @param {Uint8Array} scrData - Input screen data (6912 bytes ZX format)
 * @param {Object} [options]
 * @param {number} [options.rows=24] - Number of character rows (1-24)
 * @param {number} [options.start=0] - Starting character row (0-23)
 * @param {boolean} [options.mixed=false] - Pack attributes mixed with pixel data
 * @param {boolean} [options.optimizeAttrs=false] - Swap ink/paper and invert pixels in cells where set bits are the majority, reducing set bits for better compression without changing visual appearance
 * @returns {Uint8Array} Compressed data
 */
function compress(scrData, options) {
    options = options || {};
    const ctx = createCtx(options);

    const len = Math.min(scrData.length, ZX_FULL);
    for (let i = 0; i < len; ++i) ctx.zxBuf[i] = scrData[i];

    if (options.optimizeAttrs) optimizeAttrsOnBuffer(ctx.zxBuf);

    ctx.cfg[CFASEP] = options.mixed ? NO : YES;

    rotateScreen(ctx, ctx.SCROTATE);
    screenToPixels(ctx, ctx.pixelBuf);

    compressPicture(ctx);

    return bitsToBytes(ctx, ctx.bitPos);
}

/**
 * Decompress a LgK compressed file back to ZX Spectrum screen format.
 * @param {Uint8Array} binData - Compressed data
 * @param {Object} [options]
 * @param {number} [options.rows=24] - Number of character rows (1-24)
 * @param {number} [options.start=0] - Starting character row (0-23)
 * @param {boolean} [options.mono=false] - Output mono only (6144 bytes, no attributes)
 * @returns {Uint8Array} Decompressed ZX screen data (6912 or 6144 bytes)
 */
function decompress(binData, options) {
    options = options || {};
    const ctx = createCtx(options);

    bytesToBits(ctx, binData);

    decompressPicture(ctx);

    pixelsToScreen(ctx, ctx.xorBuf);

    if (options.mono) {
        const result = new Uint8Array(ZX_MONO);
        for (let i = 0; i < ZX_MONO; ++i) result[i] = ctx.zxBuf[i];
        return result;
    }

    rotateScreen(ctx, 24 - ctx.SCROTATE);
    const full = new Uint8Array(ZX_FULL);
    for (let i = 0; i < ZX_FULL; ++i) full[i] = ctx.zxBuf[i];
    return full;
}

// ============================================================
// Export
// ============================================================

const LgK = { compress: compress, decompress: decompress };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LgK;
} else if (typeof root !== 'undefined') {
    root.LgK = LgK;
}

})(typeof self !== 'undefined' ? self : this);
