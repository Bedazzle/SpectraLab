(function(){
/*
 * asc-js — ASC screen compressor v2.9 (LZSS + RLE) in JavaScript
 * Original "ASC v2.9" ZX Spectrum screen compressor by Andrew Strikes Code
 * (Andrey Sendetsky), 1997 — the author's "LZSS/PACK method". Format
 * reconstructed from a byte-exact disassembly. JavaScript port by Bedazzle, 2026.
 * License: MIT — see LICENSE file.
 *
 * ASC compresses a standard 6912-byte ZX Spectrum screen (6144 bitmap + 768
 * attributes) into a self-extracting block: a 194-byte depacker stub followed
 * by an LZSS+RLE token stream. Before matching, the bitmap is reorganised into
 * 8x8-character-cell order so a cell's 8 (normally 256-bytes-apart) pixel rows
 * become 8 contiguous bytes; the 768 attribute bytes are appended unchanged.
 *
 * Token stream (exactly what the original depacker consumes):
 *   lead byte b
 *     b == $80                      END (an empty literal-run header)
 *     bit7 = 0   ($00..$7F)         MATCH  len = ((b>>3)&$0F)+3  (3..18)
 *                                          off = ((b&7)<<8)|next (1..2047)
 *                                          copy len bytes from (out-off)
 *     $81..$BF   (bit7=1,bit6=0)    LITERAL run of (b&$3F) bytes (1..63 follow)
 *     $C0..$FF   (bit7=1,bit6=1)    RLE: next byte repeated (b&$3F)+3 (3..66)
 */

var SCREEN_SIZE = 6912;     // 6144 bitmap + 768 attributes
var BITMAP_SIZE = 6144;
var MIN_MATCH   = 3;
var MAX_MATCH   = 18;       // length field is 4 bits + 3
var MAX_OFFSET  = 2047;     // 11-bit back-reference distance
var MIN_RLE     = 3;
var MAX_RLE     = 66;       // count field is 6 bits + 3
var MAX_LIT_RUN = 63;       // literal-run count is 6 bits ($81..$BF)
var STUB_SIZE   = 194;      // self-extracting depacker prepended to every block

// The 194-byte v2.9 self-extracting depacker stub ($CDF3 variant), prepended
// verbatim by the original `compress` ($714F) ahead of every token stream.
// handler_decompress copies the block to $C000 and `call $C000`s it; the stub
// is position-independent (self-locates via call $0052 / pop) and writes the
// screen back to $4000 through its block-order `writer`.
var STUB = new Uint8Array([
    0xF3,0xCD,0x52,0x00,0x3B,0x3B,0xC1,0x21,0x97,0x00,0x09,0xEB,0x21,0x66,0x00,0x09,
    0x73,0x23,0x72,0x21,0x7B,0x00,0x09,0x73,0x23,0x72,0x21,0x89,0x00,0x09,0x73,0x23,
    0x72,0x21,0xBE,0x00,0x09,0x11,0x00,0x40,0xD5,0xD9,0x08,0x3E,0x03,0xB7,0x06,0x08,
    0x48,0xE1,0x08,0xD9,0x7E,0xCB,0x7F,0x20,0x3A,0xE6,0x07,0x4F,0x7E,0x0F,0x0F,0x0F,
    0xE6,0x0F,0xC6,0x03,0x47,0x23,0x7B,0x96,0x23,0xE5,0x6F,0x7A,0x99,0x67,0xE5,0x7C,
    0xE6,0x58,0xFE,0x58,0x28,0x12,0x4F,0x7D,0xE6,0x07,0xB1,0x4F,0x29,0x29,0x7C,0xE6,
    0x1F,0x67,0x7D,0xE6,0xE0,0xB4,0x6F,0x61,0x7E,0xCD,0xA6,0x74,0xE1,0x23,0x10,0xDE,
    0xE1,0x18,0xC1,0xE6,0x7F,0x28,0x1D,0x23,0xCB,0x77,0x20,0x0A,0x47,0x7E,0xCD,0xA6,
    0x74,0x23,0x10,0xF9,0x18,0xAE,0xE6,0x3F,0xC6,0x03,0x47,0x7E,0xCD,0xA6,0x74,0x10,
    0xFB,0x23,0x18,0xA0,0xD9,0x21,0x58,0x27,0xD9,0xFB,0xC9,0x13,0xD9,0x77,0x08,0x28,
    0x19,0x24,0x10,0x1B,0x11,0x20,0xF8,0x19,0x0D,0x20,0x12,0x11,0x01,0xFF,0x19,0xC6,
    0x08,0x30,0x08,0x11,0xE0,0x07,0x19,0x3D,0x18,0x01,0x23,0x0E,0x08,0x06,0x08,0x08,
    0xD9,0xC9
]);

// ---------------------------------------------------------------------------
// Block-order reorganisation (de-interleave the ZX bitmap into cell order)
// ---------------------------------------------------------------------------
// blockIndex(seq) -> source bitmap offset. Walk third (0-2) -> column (0-31) ->
// char row (0-7) -> pixel row (0-7); each cell's 8 pixel rows land contiguous.
// This is the exact mapping built by compress ($714F) and inverted by the
// depacker's writer ($74A6).
var REORG = (function() {
    var map = new Int32Array(BITMAP_SIZE);
    var seq = 0;
    for (var t = 0; t < 3; t++)
        for (var col = 0; col < 32; col++)
            for (var cr = 0; cr < 8; cr++)
                for (var pr = 0; pr < 8; pr++)
                    map[seq++] = t * 2048 + pr * 256 + cr * 32 + col;
    return map;
})();

// screen (standard ZX layout) -> block-order buffer
function reorganise(screen) {
    var block = new Uint8Array(SCREEN_SIZE);
    for (var i = 0; i < BITMAP_SIZE; i++) block[i] = screen[REORG[i]];
    for (var a = BITMAP_SIZE; a < SCREEN_SIZE; a++) block[a] = screen[a]; // attrs linear
    return block;
}

// block-order buffer -> screen (standard ZX layout)
function unreorganise(block) {
    var screen = new Uint8Array(SCREEN_SIZE);
    for (var i = 0; i < BITMAP_SIZE; i++) screen[REORG[i]] = block[i];
    for (var a = BITMAP_SIZE; a < SCREEN_SIZE; a++) screen[a] = block[a];
    return screen;
}

// ---------------------------------------------------------------------------
// Match / run analysis over the block-order buffer
// ---------------------------------------------------------------------------

// For every position, the longest back-reference (len 3..18, offset 1..2047)
// found via 3-byte hash chains. maxLen[i]=0 means "no usable match".
function buildMatches(buf, maxChain) {
    var n = buf.length;
    var maxLen = new Uint8Array(n);
    var offset = new Uint16Array(n);
    var HASH_BITS = 16, HASH_SIZE = 1 << HASH_BITS;
    var head = new Int32Array(HASH_SIZE);
    var prev = new Int32Array(n);
    var i;
    for (i = 0; i < HASH_SIZE; i++) head[i] = -1;
    for (i = 0; i < n; i++) prev[i] = -1;

    for (i = 0; i + MIN_MATCH <= n; i++) {
        var h = ((buf[i] * 263 + buf[i + 1]) * 263 + buf[i + 2]) & (HASH_SIZE - 1);
        var best = 0, bestOff = 0, tries = maxChain;
        var cand = head[h];
        var limit = i - MAX_OFFSET;
        var maxL = n - i; if (maxL > MAX_MATCH) maxL = MAX_MATCH;
        while (cand >= 0 && cand >= limit && tries-- > 0) {
            if (buf[cand + best] === buf[i + best]) { // cheap reject on the frontier
                var l = 0;
                while (l < maxL && buf[cand + l] === buf[i + l]) l++;
                if (l > best) { best = l; bestOff = i - cand; if (l >= maxL) break; }
            }
            cand = prev[cand];
        }
        if (best >= MIN_MATCH) { maxLen[i] = best; offset[i] = bestOff; }
        prev[i] = head[h];
        head[h] = i;
    }
    return { maxLen: maxLen, offset: offset };
}

// run[i] = length (capped 66) of the byte buf[i] repeated from i onward.
function buildRuns(buf) {
    var n = buf.length;
    var run = new Uint8Array(n);
    for (var i = n - 1; i >= 0; i--) {
        if (i + 1 < n && buf[i] === buf[i + 1]) {
            var r = run[i + 1] + 1;
            run[i] = r > MAX_RLE ? MAX_RLE : r;
        } else {
            run[i] = 1;
        }
    }
    return run;
}

// ---------------------------------------------------------------------------
// Token emitters
// ---------------------------------------------------------------------------

function Emitter() { this.out = []; }
Emitter.prototype.literalRun = function(buf, from, count) { // count 1..63
    this.out.push(0x80 | count);
    for (var i = 0; i < count; i++) this.out.push(buf[from + i]);
};
Emitter.prototype.match = function(len, off) {            // len 3..18, off 1..2047
    this.out.push(((len - 3) << 3) | ((off >> 8) & 0x07));
    this.out.push(off & 0xFF);
};
Emitter.prototype.rle = function(count, value) {          // count 3..66
    this.out.push(0xC0 | (count - 3));
    this.out.push(value & 0xFF);
};
Emitter.prototype.end = function() { this.out.push(0x80); };

// Flush a pending span of literals [start, pos) as 1..63-byte runs.
function flushLiterals(em, buf, start, pos) {
    while (start < pos) {
        var n = pos - start;
        if (n > MAX_LIT_RUN) n = MAX_LIT_RUN;
        em.literalRun(buf, start, n);
        start += n;
    }
}

// ---------------------------------------------------------------------------
// Parsers — greedy (1-3), lazy (4-6), optimal DP (7-9)
// ---------------------------------------------------------------------------

function parseGreedy(buf, m, run, lazy) {
    var n = buf.length, em = new Emitter();
    var i = 0, litStart = 0;
    while (i < n) {
        var ml = m.maxLen[i], rl = run[i];
        var useMatch = ml >= MIN_MATCH && ml >= rl;
        if (useMatch && lazy && i + 1 < n && m.maxLen[i + 1] > ml) {
            i++;                 // defer: a longer match starts at i+1
            continue;
        }
        if (useMatch) {
            flushLiterals(em, buf, litStart, i);
            em.match(ml, m.offset[i]); i += ml; litStart = i;
        } else if (rl >= MIN_RLE) {
            flushLiterals(em, buf, litStart, i);
            em.rle(rl, buf[i]); i += rl; litStart = i;
        } else {
            i++;                 // accumulate literal
        }
    }
    flushLiterals(em, buf, litStart, n);
    em.end();
    return em.out;
}

// Cost-optimal parse. cost[i] = min bytes to encode buf[i..]. A literal run of
// k bytes costs 1 (header) + k; a match or RLE token costs 2.
function parseOptimal(buf, m, run) {
    var n = buf.length;
    var cost = new Int32Array(n + 1);
    var op   = new Uint8Array(n + 1);   // 0=literal-run, 1=match, 2=rle
    var arg  = new Int32Array(n + 1);   // run/match/rle length
    cost[n] = 0;
    for (var i = n - 1; i >= 0; i--) {
        var best = 0x7FFFFFFF, bop = 0, barg = 1, k, c;

        // literal runs of 1..63 bytes
        var kmax = n - i; if (kmax > MAX_LIT_RUN) kmax = MAX_LIT_RUN;
        for (k = 1; k <= kmax; k++) {
            c = 1 + k + cost[i + k];
            if (c < best) { best = c; bop = 0; barg = k; }
        }
        // matches of 3..maxLen
        var ml = m.maxLen[i];
        for (k = MIN_MATCH; k <= ml; k++) {
            c = 2 + cost[i + k];
            if (c < best) { best = c; bop = 1; barg = k; }
        }
        // RLE of 3..run
        var rl = run[i];
        for (k = MIN_RLE; k <= rl; k++) {
            c = 2 + cost[i + k];
            if (c < best) { best = c; bop = 2; barg = k; }
        }
        cost[i] = best; op[i] = bop; arg[i] = barg;
    }

    var em = new Emitter();
    var p = 0;
    while (p < n) {
        if (op[p] === 1)      { em.match(arg[p], m.offset[p]); p += arg[p]; }
        else if (op[p] === 2) { em.rle(arg[p], buf[p]);       p += arg[p]; }
        else                  { em.literalRun(buf, p, arg[p]); p += arg[p]; }
    }
    em.end();
    return em.out;
}

// ---------------------------------------------------------------------------
// Token stream <-> screen
// ---------------------------------------------------------------------------

// Encode a block-order buffer into the token stream (no stub).
function encodeTokens(buf, level) {
    var run = buildRuns(buf);
    if (level >= 7) {
        return parseOptimal(buf, buildMatches(buf, 1 << 20), run);
    } else if (level >= 4) {
        return parseGreedy(buf, buildMatches(buf, 64), run, true);
    } else {
        return parseGreedy(buf, buildMatches(buf, 16), run, false);
    }
}

// Decode a token stream (starting at `pos`) back into the block-order buffer.
function decodeTokens(stream, pos) {
    var out = [];
    var n = stream.length;
    while (pos < n) {
        var b = stream[pos++];
        if (b === 0x80) break;                       // END
        if ((b & 0x80) === 0) {                      // MATCH
            var len = ((b >> 3) & 0x0F) + 3;
            var off = ((b & 0x07) << 8) | stream[pos++];
            var src = out.length - off;
            if (src < 0) throw new Error('ASC: match offset before start');
            for (var i = 0; i < len; i++) out.push(out[src + i]);
        } else if ((b & 0x40) === 0) {               // LITERAL run ($81..$BF)
            var c = b & 0x3F;
            while (c-- > 0) out.push(stream[pos++]);
        } else {                                     // RLE ($C0..$FF)
            var rc = (b & 0x3F) + 3;
            var v = stream[pos++];
            while (rc-- > 0) out.push(v);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function toBytes(data) {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

// Compress a 6912-byte screen into a self-extracting ASC block (stub + tokens).
function compress(screen, level) {
    screen = toBytes(screen);
    if (screen.length !== SCREEN_SIZE)
        throw new Error('ASC: input must be a ' + SCREEN_SIZE + '-byte screen (got ' + screen.length + ')');
    if (level === undefined) level = 9;

    var tokens = encodeTokens(reorganise(screen), level);
    var block = new Uint8Array(STUB_SIZE + tokens.length);
    block.set(STUB, 0);
    block.set(tokens, STUB_SIZE);
    return block;
}

// Compress to a bare token stream (no self-extracting stub).
function compressTokens(screen, level) {
    screen = toBytes(screen);
    if (screen.length !== SCREEN_SIZE)
        throw new Error('ASC: input must be a ' + SCREEN_SIZE + '-byte screen (got ' + screen.length + ')');
    if (level === undefined) level = 9;
    return new Uint8Array(encodeTokens(reorganise(screen), level));
}

// True if `block` begins with the recognised v2.9 self-extracting stub.
function hasStub(block) {
    return block.length > STUB_SIZE && block[0] === 0xF3 && block[1] === 0xCD;
}

// Decompress an ASC block (auto-skipping the v2.9 stub if present) to a screen.
function decompress(block) {
    block = toBytes(block);
    var start = hasStub(block) ? STUB_SIZE : 0;
    var buf = decodeTokens(block, start);
    if (buf.length !== SCREEN_SIZE)
        throw new Error('ASC: decoded ' + buf.length + ' bytes, expected ' + SCREEN_SIZE);
    return unreorganise(buf);
}

// Decompress a bare token stream (no stub) to a screen.
function decompressTokens(tokens) {
    tokens = toBytes(tokens);
    var buf = decodeTokens(tokens, 0);
    if (buf.length !== SCREEN_SIZE)
        throw new Error('ASC: decoded ' + buf.length + ' bytes, expected ' + SCREEN_SIZE);
    return unreorganise(buf);
}

var api = {
    compress: compress,
    decompress: decompress,
    compressTokens: compressTokens,
    decompressTokens: decompressTokens,
    hasStub: hasStub,
    STUB: STUB,
    SCREEN_SIZE: SCREEN_SIZE,
    STUB_SIZE: STUB_SIZE,
    MAX_OFFSET: MAX_OFFSET,
    MAX_MATCH: MAX_MATCH,
    MIN_MATCH: MIN_MATCH,
    MAX_RLE: MAX_RLE,
    MAX_LIT_RUN: MAX_LIT_RUN
};

if (typeof window !== 'undefined') window.ASC = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

})();
