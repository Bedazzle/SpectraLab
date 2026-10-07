// SpectraLab - Pentagon 128K feasibility check for 8x1 multicolour (MLT)
// @ts-check
"use strict";

// ============================================================================
// What this module answers
// ============================================================================
// An 8x1 multicolour picture gives every pixel row its own 32 attribute bytes,
// but the hardware has only 24 attribute rows. A player therefore has to rewrite
// the attribute line the beam is about to read, every single scanline, in step
// with the beam. Whether that is possible depends on the picture: a row whose
// colours barely change is nearly free, a row of 32 unrelated colour pairs is
// not. This module computes, per pixel row, the cheapest instruction sequence
// that could put that row's attributes in place in time, and reports the rows
// where even the cheapest sequence does not fit.
//
// Pentagon 128K is the interesting target because it has NO memory contention:
// all 320 T-states of a scanline are usable, where a 48K/128K Spectrum loses
// a large part of the screen period to ULA wait states.
//
// The model, and what it assumes
// ------------------------------
// Timing. 320 T-states per scanline. The ULA latches the attribute bytes for an
// aligned cell pair (2k, 2k+1) at 8k T-states after the start of the screen
// period, so a write to cell c must land in the one-line-long window
//     8*(c>>1) - 320  <  t  <=  8*(c>>1)
// (after the ULA read it for the previous line, before the read for this one).
// The scheduler below places the write block as early as that window allows and
// then checks every write against its own deadline, so a sequence is rejected
// when it cannot keep up with the beam rather than merely when it is too long.
//
// Method P, the stack fill. SP is pointed into the attribute line and `push rr`
// writes two cells for 11 T -- 5.5 T a byte, which nothing else on a Z80 beats.
// Pushes descend, so they run right to left against the beam, which is what
// makes the deadline on the leftmost cells the binding constraint. Pairs where
// neither cell changed are skipped by repositioning SP (`ld sp,nn`, 10 T).
//
// There is no per-line loop in the model, and no per-line overhead beyond the
// one `ld sp,nn` that repositions SP. A player of this kind cannot read its
// colours from memory -- `pop` would fight the stack writes, and `ldi` costs 16 T
// a byte -- so the values arrive as immediate operands, which means the player IS
// the picture: ~12 KB of unrolled `ld rr,nn` / `push rr` for a whole screen. Code
// like that has nothing to count and nowhere to jump. The condition
//     preload + block <= 320
// is then exactly what makes consecutive lines repeat in phase: the preloads for
// the next line have to fit between the end of this line's block and the start of
// the next one.
//
// Method D, direct stores. `ld (hl),r` + `inc l` costs 11 T for ONE cell, so a
// full row is hopeless (32 x 11 = 352 T > 320), but it writes only the cells
// that actually changed. On a row that differs from the previous one in three
// places it wins by a mile. Writes ascend, following the beam.
//
// The cost taken for a row is the cheaper of the two.
//
// Registers. The values have to be in registers before the block starts, and
// they cannot be fetched from memory fast enough: `pop` would fight the stack
// writes, `ldi` is 16 T for one byte, and `ld bc,(nn)` is 20 T for two against
// 10 T for the immediate -- and it needs its address baked into the instruction
// just the same. So a player of this kind is unrolled code with immediate loads,
// which is why colour variety, not colour count, is what costs. Method P is given 8 word slots: BC, DE, HL,
// their shadows BC'/DE'/HL' (4 T an `exx` to reach), and IX/IY (push 15 T,
// load 14 T instead of 11/10). Method D is given 5 byte slots: A, B, C, D, E,
// with HL as the pointer. Which value sits in which slot is decided by optimal
// offline replacement (Belady's rule: evict whatever is needed furthest in the
// future), so the load count is the true minimum; the choice of WHICH free slot
// to fill is cost-ordered: the current register set first, then either the index
// pairs or the other set. Which of those two comes second is not obvious -- an
// index pair costs 4 T more on every push but needs no `exx`, the shadow trio is
// cheap to push but costs 4 T each time control crosses into it -- so Method P is
// costed both ways round and the cheaper answer taken.
//
// What the attribute line already holds. For pixel row y the attribute line is
// whatever row y-1 left there, except at the top of a character row (y%8 == 0),
// where the line belongs to a new character row and still holds row y+7 from the
// previous frame. That is what Method D diffs against, so it assumes a static
// picture in steady state.
//
// Lead time. The ULA reads attribute line r only while the beam is inside
// character row r, so that line sits idle for the whole of character row r-1 --
// eight scanlines, 2560 T. The first pixel row of a character row is therefore
// NOT bound to a single scanline: its 32 bytes can be written any time during the
// character row above, in whatever time the seven rows there do not use. Those
// seven rows get no such help; each is read one line after the last write to the
// same line, so each is stuck inside its own 320 T.
//
// That makes the real condition per character row r:
//     leadIn(row 8r+8) + sum of cost(8r+1 .. 8r+7) <= 2560
// where line 8r itself contributes a whole free 320 T, having had its own
// attributes written a character row earlier. That first chunk is the cheap one:
// a lead-in that fits inside it runs undisturbed. Spilling past it costs more
// than the 10 T to re-point SP, because the interior write sharing the next line
// has been using the same eight register pairs, so the lead-in's values have to
// be loaded again -- which is why a lead-in is charged its own preload every time
// it picks up.
//
// Row 0 is always reachable: its attribute line can be filled during the top
// border, which on Pentagon is tens of thousands of free T-states.
//
// Deliberately not modelled: `push af` with a constant F byte (real, but it only
// helps rows whose odd cells share a colour), the shadow byte registers for
// Method D, and any hybrid of P and D within one row. All three would move the
// verdict in the picture's favour, so a row reported as over budget may be worth
// a second look by hand -- but a row reported as fitting really does fit.

const MLT_TIMING = {
  LINE_TSTATES: 224,     // Pentagon 128K scanline (71680 T / 320 lines)
  CELLS: 32,
  LD_SP_NN: 10,
  PUSH_CHEAP: 11,        // push bc / de / hl, and the shadow trio
  PUSH_INDEX: 15,        // push ix / iy
  LOAD_CHEAP: 10,        // ld bc/de/hl,nn
  LOAD_INDEX: 14,        // ld ix/iy,nn
  EXX: 4,
  LD_L_N: 7,
  INC_L: 4,
  LD_H_N: 7,
  LD_R_N: 7,             // ld a/b/c/d/e,n
  STORE: 7,              // ld (hl),r
  LD_HL_N: 10,           // ld (hl),n -- a colour straight to memory, no register
  MIXED_PAIR_SLOTS: 4,   // BC, DE, IX, IY: HL is the byte pointer and exx would swap it
  WORD_SLOTS: 8,
  BYTE_SLOTS: 5,
  CHAR_ROW_LINES: 8,
  RESUME: 10          // ld sp,nn / ld hl,nn to re-point at a split lead-in
};

/** Which register set each word slot lives in: 0 = main, 1 = shadow, -1 = either (IX/IY). */
const MLT_WORD_SLOT_SET = [0, 0, 0, 1, 1, 1, -1, -1];

/**
 * The register each slot is. Slots 3..5 are the shadow set, so they carry the
 * same mnemonics as 0..2 and are told apart by the `exx` that reaches them.
 */
const MLT_WORD_SLOT_NAME = ['bc', 'de', 'hl', 'bc', 'de', 'hl', 'ix', 'iy'];

/** Method D's byte slots, with HL reserved as the pointer. */
const MLT_BYTE_SLOT_NAME = ['a', 'b', 'c', 'd', 'e'];

/** Method ids, as stored in the per-row result. */
const MLT_METHOD = { NONE: 0, PUSH: 1, DIRECT: 2, MIXED: 3 };

/**
 * Pair slots Method M may use, in the two orders it tries.
 *
 * HL is the byte pointer, so it cannot hold a pushed value, and `exx` would
 * swap the pointer away with it -- which is why the shadow set is not here.
 * BC and DE push for 11T but each one costs two byte slots; IX and IY push for
 * 15T and cost none. Which way round is cheaper depends on the row, so both are
 * costed.
 */
const MLT_MIXED_PAIRS_CHEAP = [
  { reg: 'bc', push: 11, load: 10, bytes: ['b', 'c'] },
  { reg: 'de', push: 11, load: 10, bytes: ['d', 'e'] },
  { reg: 'ix', push: 15, load: 14, bytes: [] },
  { reg: 'iy', push: 15, load: 14, bytes: [] }
];
const MLT_MIXED_PAIRS_INDEX = [
  MLT_MIXED_PAIRS_CHEAP[2], MLT_MIXED_PAIRS_CHEAP[3],
  MLT_MIXED_PAIRS_CHEAP[0], MLT_MIXED_PAIRS_CHEAP[1]
];

/**
 * What a row's budget is measured against: nothing (row 0, filled during the top
 * border), its own scanline, or the spare time of the character row above it.
 */
/**
 * Why a row is flagged. One flag could not say, and the readout guessed.
 *
 * ORDER - no arrangement of the writes stays ahead of the beam at all
 * BEAM  - the writes fit in the time, but not early enough to beat the beam
 * SPILL - the row itself is fine; its character row does not fit in eight lines
 */
const MLT_CAUSE = { FITS: 0, ORDER: 1, BEAM: 2, SPILL: 3 };

const MLT_ROW_KIND = { FREE: 0, INTERIOR: 1, LEAD_IN: 2 };

/**
 * One instruction, as both a cost and the thing to emit.
 *
 * `kind` says which instruction: `sp` (ld sp,nn), `exx`, `ld16` (ld rr,nn),
 * `push`, `ldl` / `ldh` (ld l,n / ld h,n), `incl`, `ld8` (ld r,n), `st`
 * (ld (hl),r). `cells` is what it writes, and stays empty for everything that
 * only consumes time -- which is what the scheduler keys on.
 *
 * @typedef {Object} MltOp
 * @property {number} cost
 * @property {number[]} cells
 * @property {string} [kind]
 * @property {string} [reg]
 * @property {number} [value]
 * @property {number} [lo] - low cell of a pushed pair, which may be odd
 * @property {number} [cell]
 */

/**
 * T-states, relative to the start of the screen period, at which the ULA latches
 * the attribute byte for a cell. Cells are fetched in aligned pairs, so both
 * halves of a pair share a deadline.
 * @param {number} cell - 0..31
 * @returns {number}
 */
function mltAttrReadT(cell) {
  return 8 * (cell >> 1);
}

/**
 * Next-use index for every element of a sequence, for Belady replacement.
 * @param {number[]} seq
 * @returns {number[]} nextUse[i] = smallest j > i with seq[j] === seq[i], else Infinity
 */
function mltNextUse(seq) {
  const n = seq.length;
  const nextUse = new Array(n);
  const seen = new Map();
  for (let i = n - 1; i >= 0; i--) {
    const v = seq[i];
    nextUse[i] = seen.has(v) ? seen.get(v) : Infinity;
    seen.set(v, i);
  }
  return nextUse;
}

/**
 * Places a write block as early as its ULA windows allow, then checks every
 * write against its own deadline.
 *
 * Writes are sequential, so the i-th one completes at `start + prefix(i)`. The
 * earliest legal start is the largest `windowStart(i) - prefix(i)`; feasibility
 * is then whether that start still meets every `windowEnd(i)`.
 *
 * `latest` is the other end of the same window: the last start at which every
 * write still meets its deadline. The ASM export needs it, because the emitted
 * code has one phase for the whole picture and each row has to be placed
 * somewhere inside its own window rather than always at the earliest point.
 *
 * @param {Array<{cost: number, cells: number[]}>} ops - in emission order; ops
 *   with no cells (register loads, `exx`, `ld sp,nn`) only consume time
 * @param {number} [lookback] - T-states since these cells were last read: one
 *   scanline for an interior row, and a whole character row for a lead-in, whose
 *   attribute line the beam has not touched since the frame before
 * @returns {{ok: boolean, blockCost: number, start: number, latest: number}}
 */
function mltScheduleBlock(ops, lookback) {
  const back = (typeof lookback === 'number') ? lookback : MLT_TIMING.LINE_TSTATES;
  const prefix = new Array(ops.length);
  let total = 0;
  let start = -Infinity;
  for (let i = 0; i < ops.length; i++) {
    total += ops[i].cost;
    prefix[i] = total;
    const cells = ops[i].cells;
    if (!cells.length) continue;
    // Latest of this op's cells decides how early it may run without
    // overwriting the line currently on screen
    let latestRead = -Infinity;
    for (let c = 0; c < cells.length; c++) {
      const r = mltAttrReadT(cells[c]);
      if (r > latestRead) latestRead = r;
    }
    const earliest = latestRead - back + 1;
    if (earliest - prefix[i] > start) start = earliest - prefix[i];
  }
  if (start === -Infinity) start = 0;

  let latest = Infinity;
  for (let i = 0; i < ops.length; i++) {
    const cells = ops[i].cells;
    if (!cells.length) continue;
    // Earliest of this op's cells decides the deadline
    let earliestRead = Infinity;
    for (let c = 0; c < cells.length; c++) {
      const r = mltAttrReadT(cells[c]);
      if (r < earliestRead) earliestRead = r;
    }
    if (earliestRead - prefix[i] < latest) latest = earliestRead - prefix[i];
  }
  // Same test as checking every write one by one, written as the one window
  const ok = start <= latest;
  return { ok, blockCost: total, start, latest };
}

/**
 * Orders in which a row's pairs can be pushed.
 *
 * Pushes descend, so a single run writes the pair the beam wants FIRST (pair 0)
 * LAST. Cutting the run into parts and emitting the parts lowest-first gives
 * each part its own window, at 10 T a part for re-pointing SP. Two parts is
 * usually enough; more buys ordering room at a price that soon outweighs it.
 *
 * @param {number[]} pairs - pairs to write, descending
 * @returns {number[][]} candidate orders, the plain descent first
 */
function mltPushOrders(pairs) {
  const orders = [pairs];
  for (let parts = 2; parts <= 4 && parts <= pairs.length; parts++) {
    const size = Math.ceil(pairs.length / parts);
    /** @type {number[][]} */
    const blocks = [];
    for (let i = 0; i < pairs.length; i += size) blocks.push(pairs.slice(i, i + size));
    // blocks[0] holds the highest pairs, so reverse: lowest pairs go first
    blocks.reverse();
    orders.push([].concat.apply([], blocks));
  }
  return orders;
}

/**
 * Builds the instruction block for Method P (stack fill) over one pixel row.
 *
 * @param {number[]} pairs - aligned cell-pair indices to write, in DESCENDING
 *   order (pushes walk backwards because `push` decrements SP)
 * @param {number[]} values - pairs[i]'s 16-bit register value
 * @param {boolean} indexFirst - true to spend IX/IY before reaching into the
 *   shadow register set, false for the other way round
 * @returns {{ops: MltOp[], preload: number, preloadOps: MltOp[]}}
 */
function mltBuildPushBlock(lows, values, indexFirst) {
  /** @type {MltOp[]} */
  const ops = [];
  // First fills, kept apart so the preload can be emitted in an order that
  // brackets the shadow loads in the one pair of `exx` the cost assumes
  /** @type {Array<{slot: number, value: number}>} */
  const fills = [];
  // SP has to be positioned before the first push; every later reposition is a
  // skipped run of unchanged pairs and happens inside the block
  let preload = MLT_TIMING.LD_SP_NN;

  const nextUse = mltNextUse(values);
  /** @type {Array<number|null>} */
  const slotVal = new Array(MLT_TIMING.WORD_SLOTS).fill(null);
  const slotNext = new Array(MLT_TIMING.WORD_SLOTS).fill(Infinity);
  let activeSet = 0;
  let shadowPreloaded = false;

  /** Emits the `exx` needed to reach a slot, if any. */
  const reachSlot = (slot) => {
    const set = MLT_WORD_SLOT_SET[slot];
    if (set === -1 || set === activeSet) return;
    ops.push({ cost: MLT_TIMING.EXX, cells: [], kind: 'exx' });
    activeSet = set;
  };

  for (let i = 0; i < lows.length; i++) {
    // Any break in the descent needs SP re-pointing: a gap over pairs we are
    // not rewriting, or a jump back up to start another run. 10 T either way,
    // against 11 T for every pair we would otherwise push past. Adjacent pairs
    // are two cells apart, whatever the alignment.
    if (i > 0 && lows[i - 1] - lows[i] !== 2) {
      ops.push({ cost: MLT_TIMING.LD_SP_NN, cells: [], kind: 'sp', lo: lows[i] });
    }

    const value = values[i];
    let slot = -1;
    for (let s = 0; s < MLT_TIMING.WORD_SLOTS; s++) {
      if (slotVal[s] === value) { slot = s; break; }
    }

    if (slot < 0) {
      // Free slots in cost order: this register set first, then the index pairs
      // and the other set in whichever order this pass is trying
      const order = indexFirst ? [activeSet, -1, 1 - activeSet] : [activeSet, 1 - activeSet, -1];
      for (let o = 0; o < order.length && slot < 0; o++) {
        for (let s = 0; s < MLT_TIMING.WORD_SLOTS && slot < 0; s++) {
          if (slotVal[s] === null && MLT_WORD_SLOT_SET[s] === order[o]) slot = s;
        }
      }

      const isFirstFill = slot >= 0;
      if (!isFirstFill) {
        // Belady: evict whatever is needed furthest in the future, preferring a
        // slot already reachable so the eviction does not also cost an exx
        let best = -1, bestNext = -Infinity, bestReachable = false;
        for (let s = 0; s < MLT_TIMING.WORD_SLOTS; s++) {
          const reachable = MLT_WORD_SLOT_SET[s] === -1 || MLT_WORD_SLOT_SET[s] === activeSet;
          if (slotNext[s] > bestNext || (slotNext[s] === bestNext && reachable && !bestReachable)) {
            best = s; bestNext = slotNext[s]; bestReachable = reachable;
          }
        }
        slot = best;
      }

      const loadCost = MLT_WORD_SLOT_SET[slot] === -1
        ? MLT_TIMING.LOAD_INDEX : MLT_TIMING.LOAD_CHEAP;
      if (isFirstFill) {
        // Filling an untouched slot can be hoisted out of the block entirely --
        // there is time before the first push of the line
        preload += loadCost;
        fills.push({ slot: slot, value: value });
        if (MLT_WORD_SLOT_SET[slot] === 1 && !shadowPreloaded) {
          shadowPreloaded = true;
          preload += 2 * MLT_TIMING.EXX; // exx in, exx back out
        }
      } else {
        reachSlot(slot);
        ops.push({
          cost: loadCost, cells: [], kind: 'ld16',
          reg: MLT_WORD_SLOT_NAME[slot], value: value
        });
      }
      slotVal[slot] = value;
    }

    reachSlot(slot);
    slotNext[slot] = nextUse[i];
    const cell = lows[i];
    ops.push({
      cost: MLT_WORD_SLOT_SET[slot] === -1 ? MLT_TIMING.PUSH_INDEX : MLT_TIMING.PUSH_CHEAP,
      cells: [cell, cell + 1],
      kind: 'push', reg: MLT_WORD_SLOT_NAME[slot], lo: cell
    });
  }

  return { ops, preload, preloadOps: mltPushPreloadOps(lows, fills) };
}

/**
 * Spells the push preload out as instructions.
 *
 * Order is not the order the allocator discovered the fills in: every first fill
 * is a different slot holding a different value, so any order leaves the same
 * registers loaded, and emitting the shadow ones together lets a single pair of
 * `exx` bracket them -- which is exactly the 2 x EXX the cost assumes. The block
 * is entered with the main set active, as its own bookkeeping expects.
 *
 * @param {number[]} pairs - the pairs to be pushed, descending
 * @param {Array<{slot: number, value: number}>} fills
 * @returns {MltOp[]}
 */
function mltPushPreloadOps(lows, fills) {
  /** @type {MltOp[]} */
  const out = [];
  // `push` writes downwards from SP, so SP starts just past the first pair
  out.push({ cost: MLT_TIMING.LD_SP_NN, cells: [], kind: 'sp', lo: lows.length ? lows[0] : 0 });

  const load = (/** @type {{slot: number, value: number}} */ f) => ({
    cost: MLT_WORD_SLOT_SET[f.slot] === -1 ? MLT_TIMING.LOAD_INDEX : MLT_TIMING.LOAD_CHEAP,
    cells: [], kind: 'ld16', reg: MLT_WORD_SLOT_NAME[f.slot], value: f.value
  });

  fills.filter(f => MLT_WORD_SLOT_SET[f.slot] !== 1).forEach(f => out.push(load(f)));
  const shadow = fills.filter(f => MLT_WORD_SLOT_SET[f.slot] === 1);
  if (shadow.length) {
    out.push({ cost: MLT_TIMING.EXX, cells: [], kind: 'exx' });
    shadow.forEach(f => out.push(load(f)));
    out.push({ cost: MLT_TIMING.EXX, cells: [], kind: 'exx' });
  }
  return out;
}

/**
 * Builds the instruction block for Method D (direct stores of changed cells).
 *
 * @param {number[]} cells - changed cell indices, ASCENDING (stores follow the beam)
 * @param {number[]} values - cells[i]'s attribute byte
 * @param {boolean} newCharRow - true when the pointer's high byte also changes
 * @returns {{ops: MltOp[], preload: number, preloadOps: MltOp[]}}
 */
function mltBuildDirectBlock(cells, values, newCharRow) {
  /** @type {MltOp[]} */
  const ops = [];
  /** @type {MltOp[]} */
  const preloadOps = [];
  if (newCharRow) {
    preloadOps.push({ cost: MLT_TIMING.LD_H_N, cells: [], kind: 'ldh' });
  }
  preloadOps.push({
    cost: MLT_TIMING.LD_L_N, cells: [], kind: 'ldl', cell: cells.length ? cells[0] : 0
  });
  // The pointer's first position is set before the block; H only moves when the
  // attribute line itself changes, which is once per character row
  let preload = MLT_TIMING.LD_L_N + (newCharRow ? MLT_TIMING.LD_H_N : 0);

  const nextUse = mltNextUse(values);
  /** @type {Array<number|null>} */
  const slotVal = new Array(MLT_TIMING.BYTE_SLOTS).fill(null);
  const slotNext = new Array(MLT_TIMING.BYTE_SLOTS).fill(Infinity);

  for (let i = 0; i < cells.length; i++) {
    if (i > 0) {
      // One step forward is `inc l`; any further jump is a fresh `ld l,n`, which
      // beats two `inc l` by a T-state
      const step = cells[i] - cells[i - 1];
      ops.push(step === 1
        ? { cost: MLT_TIMING.INC_L, cells: [], kind: 'incl' }
        : { cost: MLT_TIMING.LD_L_N, cells: [], kind: 'ldl', cell: cells[i] });
    }

    const value = values[i];
    let slot = -1;
    for (let s = 0; s < MLT_TIMING.BYTE_SLOTS; s++) {
      if (slotVal[s] === value) { slot = s; break; }
    }
    if (slot < 0) {
      let firstFill = -1;
      for (let s = 0; s < MLT_TIMING.BYTE_SLOTS && firstFill < 0; s++) {
        if (slotVal[s] === null) firstFill = s;
      }
      if (firstFill >= 0) {
        slot = firstFill;
        preload += MLT_TIMING.LD_R_N;
        preloadOps.push({
          cost: MLT_TIMING.LD_R_N, cells: [], kind: 'ld8',
          reg: MLT_BYTE_SLOT_NAME[slot], value: value
        });
      } else {
        let best = 0, bestNext = -Infinity;
        for (let s = 0; s < MLT_TIMING.BYTE_SLOTS; s++) {
          if (slotNext[s] > bestNext) { best = s; bestNext = slotNext[s]; }
        }
        slot = best;
        ops.push({
          cost: MLT_TIMING.LD_R_N, cells: [], kind: 'ld8',
          reg: MLT_BYTE_SLOT_NAME[slot], value: value
        });
      }
      slotVal[slot] = value;
    }
    slotNext[slot] = nextUse[i];
    ops.push({
      cost: MLT_TIMING.STORE, cells: [cells[i]],
      kind: 'st', reg: MLT_BYTE_SLOT_NAME[slot]
    });
  }

  return { ops, preload, preloadOps };
}

/**
 * The pair low-cells covering a run at a given alignment.
 *
 * `off` 0 gives the usual (0,1) (2,3) ...; `off` 1 gives (1,2) (3,4) ..., which
 * is what a row whose colour runs start on odd cells wants. An odd alignment
 * reaches one cell past each end of the run, writing those their existing
 * colours -- harmless, and the caller costs the pair values that result.
 *
 * @param {number} start - first changed cell of the run
 * @param {number} end - last changed cell
 * @param {number} off - 0 or 1
 * @returns {number[]|null} low cells, or null when the alignment runs off the row
 */
function mltRunPairs(start, end, off) {
  const first = off + 2 * Math.floor((start - off) / 2);
  const last = off + 2 * Math.floor((end - off) / 2);
  if (first < 0 || last + 1 >= MLT_TIMING.CELLS) return null;
  /** @type {number[]} */
  const lows = [];
  for (let lo = first; lo <= last; lo += 2) lows.push(lo);
  return lows;
}

/**
 * The low cells of every pair a plan pushes, in ascending order.
 *
 * The plan knows its own alignment -- each push op carries the cell it writes
 * from -- so reading them back off it is the only way for the readout and the
 * swatch strip to describe what the player will really do.
 *
 * @param {{ops: Array<{kind?: string, lo?: number}>, preloadOps?: Array<{kind?: string, lo?: number}>}} plan
 * @returns {number[]}
 */
function mltPlanPairLows(plan) {
  const seen = new Set();
  const all = (plan.preloadOps || []).concat(plan.ops || []);
  for (const op of all) if (op.kind === 'push' && typeof op.lo === 'number') seen.add(op.lo);
  return [...seen].sort((a, b) => a - b);
}

/**
 * Splits a row's changed cells into runs of consecutive cells.
 * @param {number[]} cells - ascending
 * @returns {Array<{start: number, len: number, firstPair: number, lastPair: number}>}
 */
function mltRuns(cells) {
  const runs = [];
  for (let i = 0; i < cells.length; i++) {
    const start = cells[i];
    let j = i;
    while (j + 1 < cells.length && cells[j + 1] === cells[j] + 1) j++;
    const end = cells[j];
    runs.push({ start, len: end - start + 1, firstPair: start >> 1, lastPair: end >> 1 });
    i = j;
  }
  return runs;
}

/**
 * Builds the instruction block for Method M, which picks a strategy per run.
 *
 * Runs are visited left to right, which is the order the beam reads them in, so
 * the tightest deadlines are met first. Inside a push run the pushes still
 * descend -- that is what `push` does -- but a run is short, so the leftmost
 * cell of it waits only a few T-states.
 *
 * A push run rewrites whole aligned pairs, which can include cells that did not
 * change. That is harmless: the value pushed for such a cell is the one already
 * on screen, since the row and the previous row agree there.
 *
 * @param {Uint8Array} attrs
 * @param {number} y
 * @param {number[]} cells - changed cells, ascending
 * @param {boolean} newCharRow
 * @param {boolean} indexFirst - spend IX/IY before BC/DE
 * @param {boolean} [noPush] - store every run, however long. Pushing is cheaper
 *   per cell but needs the 16-bit PAIR in one of only four slots, and a row with
 *   several distinct pairs can spend more on loading them than the pushes save.
 * @returns {{ops: MltOp[], preload: number, preloadOps: MltOp[]}}
 */
function mltBuildMixedBlock(attrs, y, cells, newCharRow, indexFirst, noPush, perRunAlign) {
  const base = y * MLT_TIMING.CELLS;
  const runs = mltRuns(cells);

  // --- alignment, then push or byte-wise, per run ---------------------------
  // Each run picks where its pairs start. Greedy and in order, because what a
  // run costs depends on the values already loaded: sharing a pair value with an
  // earlier run saves a 10 T load, which outweighs saving a push.
  /** @type {Array<number[]>} chosen pair low-cells per run */
  const runLows = [];
  const loaded = new Set();
  runs.forEach((r) => {
    const end = r.start + r.len - 1;
    let best = null;
    for (const off of (perRunAlign ? [0, 1] : [0])) {
      const lows = mltRunPairs(r.start, end, off);
      if (!lows) continue;
      const vals = lows.map(lo => (attrs[base + lo + 1] << 8) | attrs[base + lo]);
      const fresh = new Set(vals.filter(v => !loaded.has(v)));
      const t = MLT_TIMING.LD_SP_NN + MLT_TIMING.PUSH_CHEAP * lows.length +
        MLT_TIMING.LOAD_CHEAP * fresh.size;
      if (!best || t < best.t) best = { t, lows, vals };
    }
    runLows.push(best);
    if (best) best.vals.forEach(v => loaded.add(v));
  });

  // Compared on store cost alone; the loads are allocated afterwards, and a run
  // too short to earn its `ld sp,nn` stays byte-wise whatever the colours.
  const usePush = runs.map((r, i) => {
    if (noPush || !runLows[i]) return false;
    const pushT = MLT_TIMING.LD_SP_NN + MLT_TIMING.PUSH_CHEAP * runLows[i].lows.length;
    const byteT = MLT_TIMING.LD_L_N + (MLT_TIMING.STORE + MLT_TIMING.INC_L) * r.len
      - MLT_TIMING.INC_L;
    return pushT < byteT;
  });

  // --- what has to live in a register ---------------------------------------
  /** @type {Map<number, number>} pair value -> how many pushes use it */
  const pairUse = new Map();
  /** @type {Map<number, number>} colour -> how many byte stores use it */
  const byteUse = new Map();
  runs.forEach((r, i) => {
    if (usePush[i]) {
      for (const v of runLows[i].vals) pairUse.set(v, (pairUse.get(v) || 0) + 1);
    } else {
      for (let c = r.start; c < r.start + r.len; c++) {
        const v = attrs[base + c];
        byteUse.set(v, (byteUse.get(v) || 0) + 1);
      }
    }
  });

  // Pair values take slots in order of how much they are used; a value that
  // does not get one is reloaded before each push.
  const pairOrder = [...pairUse.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const bank = indexFirst ? MLT_MIXED_PAIRS_INDEX : MLT_MIXED_PAIRS_CHEAP;
  /** @type {Map<number, any>} pair value -> slot */
  const pairSlot = new Map();
  for (let i = 0; i < pairOrder.length && i < MLT_TIMING.MIXED_PAIR_SLOTS; i++) {
    pairSlot.set(pairOrder[i], bank[i]);
  }

  // Byte slots are A plus whatever B, C, D, E the pairs left alone
  const taken = new Set();
  pairSlot.forEach((slot) => slot.bytes.forEach(b => taken.add(b)));
  const byteBank = ['a', 'b', 'c', 'd', 'e'].filter(r => !taken.has(r));
  // A colour only earns a register if loading it beats ld (hl),n every time:
  // 7 + 7k < 10k, which is k >= 3
  const byteOrder = [...byteUse.entries()]
    .filter(e => MLT_TIMING.LD_R_N + MLT_TIMING.STORE * e[1] < MLT_TIMING.LD_HL_N * e[1])
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);
  /** @type {Map<number, string>} colour -> byte register */
  const byteSlot = new Map();
  for (let i = 0; i < byteOrder.length && i < byteBank.length; i++) {
    byteSlot.set(byteOrder[i], byteBank[i]);
  }

  // --- preload ---------------------------------------------------------------
  /** @type {MltOp[]} */
  const preloadOps = [];
  let preload = 0;
  if (newCharRow) {
    preloadOps.push({ cost: MLT_TIMING.LD_H_N, cells: [], kind: 'ldh' });
    preload += MLT_TIMING.LD_H_N;
  }
  pairSlot.forEach((slot, value) => {
    preloadOps.push({ cost: slot.load, cells: [], kind: 'ld16', reg: slot.reg, value });
    preload += slot.load;
  });
  byteSlot.forEach((reg, value) => {
    preloadOps.push({ cost: MLT_TIMING.LD_R_N, cells: [], kind: 'ld8', reg, value });
    preload += MLT_TIMING.LD_R_N;
  });

  // --- the block -------------------------------------------------------------
  /** @type {MltOp[]} */
  const ops = [];
  let hl = -1;          // where L points, or -1 when it is not set yet
  let held = null;      // pair value currently in the slot we last loaded ad hoc

  runs.forEach((r, i) => {
    if (usePush[i]) {
      // SP sits just past the pair about to be written, and the pushes descend
      const lows = runLows[i].lows;
      ops.push({ cost: MLT_TIMING.LD_SP_NN, cells: [], kind: 'sp', lo: lows[lows.length - 1] });
      for (let k = lows.length - 1; k >= 0; k--) {
        const p = lows[k];
        const v = (attrs[base + p + 1] << 8) | attrs[base + p];
        let slot = pairSlot.get(v);
        if (!slot) {
          // No register of its own: borrow the last bank entry and reload it
          slot = bank[MLT_TIMING.MIXED_PAIR_SLOTS - 1];
          if (held !== v) {
            ops.push({ cost: slot.load, cells: [], kind: 'ld16', reg: slot.reg, value: v });
            held = v;
          }
        }
        ops.push({
          cost: slot.push, cells: [p, p + 1],
          kind: 'push', reg: slot.reg, lo: p
        });
      }
    } else {
      for (let c = r.start; c < r.start + r.len; c++) {
        if (hl < 0 || c - hl !== 1) {
          ops.push({ cost: MLT_TIMING.LD_L_N, cells: [], kind: 'ldl', cell: c });
        } else {
          ops.push({ cost: MLT_TIMING.INC_L, cells: [], kind: 'incl' });
        }
        hl = c;
        const v = attrs[base + c];
        const reg = byteSlot.get(v);
        if (reg) {
          ops.push({ cost: MLT_TIMING.STORE, cells: [c], kind: 'st', reg });
        } else {
          // Used once or twice: cheaper straight from the instruction
          ops.push({ cost: MLT_TIMING.LD_HL_N, cells: [c], kind: 'sthln', value: v });
        }
      }
    }
  });

  return { ops, preload, preloadOps };
}

/**
 * Costs one pixel row under both methods and returns the cheaper feasible one,
 * as the instruction sequence that produced the number.
 *
 * `inLine` is what separates the two kinds of row. An interior row is read one
 * line after the last write to the same attribute line, so it has to fit inside
 * 320 T AND keep ahead of the beam. The first row of a character row is written
 * while the beam is still a character row above, where nothing reads that line:
 * no deadlines, and no line budget of its own -- the caller fits it into the
 * spare time of the character row above instead.
 *
 * @param {Uint8Array} attrs - the whole 192x32 attribute plane, row-major
 * @param {number} y - pixel row 0..191
 * @param {boolean} inLine - true to enforce the 320 T line and the ULA deadlines
 * @returns {{ok: boolean, cost: number, method: number, preload: number,
 *            changed: number, distinct: number, blockCost: number,
 *            start: number, latest: number, ops: MltOp[], preloadOps: MltOp[],
 *            cells: number[], orderedCost: number, prevRow: number}}
 */
function mltRowPlan(attrs, y, inLine) {
  const base = y * MLT_TIMING.CELLS;
  const empty = {
    ok: true, cost: 0, method: MLT_METHOD.NONE, preload: 0, changed: 0, distinct: 0,
    blockCost: 0, start: 0, latest: 0, ops: [], preloadOps: [], cells: [],
    orderedCost: 0, prevRow: y
  };
  // Row 0's attribute line is filled during the top border, where there is no
  // shortage of time at all
  if (y === 0) return empty;

  // At the top of a character row the line has moved on to a new attribute row,
  // which still holds this character row's LAST pixel line from the frame before
  const prevRow = (y % 8 === 0) ? y + 7 : y - 1;
  const prevBase = prevRow * MLT_TIMING.CELLS;
  // A lead-in writes an attribute line the beam has not read since the previous
  // frame, so its window reaches back over the whole character row above.
  const lookback = inLine ? MLT_TIMING.LINE_TSTATES
                          : MLT_TIMING.CHAR_ROW_LINES * MLT_TIMING.LINE_TSTATES;

  /** @type {number[]} */
  const changedCells = [];
  for (let c = 0; c < MLT_TIMING.CELLS; c++) {
    if (attrs[base + c] !== attrs[prevBase + c]) changedCells.push(c);
  }
  const distinctSet = new Set();
  for (let c = 0; c < MLT_TIMING.CELLS; c++) distinctSet.add(attrs[base + c]);
  const distinct = distinctSet.size;

  if (!changedCells.length) {
    return Object.assign({}, empty, { distinct, prevRow });
  }

  const newCharRow = (y % 8) === 0;

  // --- Method P: push the pairs that contain a changed cell ---
  // Even alignment only. The odd one is built and costed correctly here, but
  // taking it makes row 44 of the Snatcher mock-up come out wrong under the
  // execution simulator: that row's own schedule is legal and the emitter places
  // its block inside the window, so the fault is downstream -- in the lead-in
  // chunking or the gap accounting, both of which change shape when a lead-in's
  // pairs move. Method M picks its alignment per RUN and is unaffected, which is
  // where nearly all of the gain was. Widen this back to [0, 1] once the
  // simulator agrees.
  const pairSets = [];
  for (const off of [0]) {
    const touched = new Set();
    let offRow = false;
    for (let i = 0; i < changedCells.length; i++) {
      const c = changedCells[i];
      const lo = off + 2 * Math.floor((c - off) / 2);
      if (lo < 0 || lo + 1 >= MLT_TIMING.CELLS) { offRow = true; break; }
      touched.add(lo);
    }
    if (offRow) continue;
    /** @type {number[]} */
    const lows = [...touched].sort((a, b) => b - a);   // descending, as push goes
    /** @type {number[]} */
    const vals = lows.map((lo) =>
      // `push rr` stores the high byte at the higher address, so the register
      // pair reads (upper cell << 8) | lower cell
      (attrs[base + lo + 1] << 8) | attrs[base + lo]);
    pairSets.push({ lows, vals });
  }
  // The even alignment always stays inside the row, so there is always one
  const pairs = pairSets[0].lows;
  const values = pairSets[0].vals;
  let pushBest = null;
  let pushCost = Infinity;
  let pushOk = false;
  // Cheapest arrangement the BEAM accepts, whatever it costs. When a row is
  // refused only on ordering, this is what ordering it would take.
  let orderedCost = Infinity;
  for (const set of pairSets) {
    const valueOf = new Map();
    for (let i = 0; i < set.lows.length; i++) valueOf.set(set.lows[i], set.vals[i]);
    for (const order of mltPushOrders(set.lows)) {
    const ordered = order.map(p => valueOf.get(p));
    for (const indexFirst of [true, false]) {
      const push = mltBuildPushBlock(order, ordered, indexFirst);
      const sched = mltScheduleBlock(push.ops, lookback);
      const cost = push.preload + sched.blockCost;
      if (sched.ok && cost < orderedCost) orderedCost = cost;
      const ok = sched.ok;
      // A sequence the beam accepts always beats one it does not, however short
      if ((ok && !pushOk) || (ok === pushOk && cost < pushCost)) {
        pushCost = cost;
        pushOk = ok;
        pushBest = { push, sched, cost };
      }
    }
    }
  }

  // --- Method D: store only the cells that changed ---
  const directValues = changedCells.map((c) => attrs[base + c]);
  const direct = mltBuildDirectBlock(changedCells, directValues, newCharRow);
  const directSched = mltScheduleBlock(direct.ops, lookback);
  const directCost = direct.preload + directSched.blockCost;
  if (directSched.ok && directCost < orderedCost) orderedCost = directCost;
  const directOk = directSched.ok;

  // --- Method M: a strategy per run of consecutive cells ---
  let mixedBest = null;
  let mixedCost = Infinity;
  let mixedOk = false;
  const alignTries = mltPerRunAlign ? [false, true] : [false];
  for (const noPush of [false, true]) {
    for (const perRunAlign of alignTries) {
    for (const indexFirst of [false, true]) {
      const m = mltBuildMixedBlock(attrs, y, changedCells, newCharRow, indexFirst,
        noPush, perRunAlign);
      const sched = mltScheduleBlock(m.ops, lookback);
      const cost = m.preload + sched.blockCost;
      if (sched.ok && cost < orderedCost) orderedCost = cost;
      const ok = sched.ok;
      if ((ok && !mixedOk) || (ok === mixedOk && cost < mixedCost)) {
        mixedCost = cost;
        mixedOk = ok;
        mixedBest = { build: m, sched };
      }
      // Without pushes the index order changes nothing
      if (noPush) break;
    }
    // ...nor does the alignment, since nothing is pushed
    if (noPush) break;
    }
  }

  /** Packs one candidate into the common shape. */
  const asPlan = (/** @type {number} */ method, /** @type {any} */ build,
                  /** @type {any} */ sched, /** @type {boolean} */ ok) => ({
    ok, cost: build.preload + sched.blockCost, method, preload: build.preload,
    changed: changedCells.length, distinct,
    blockCost: sched.blockCost, start: sched.start, latest: sched.latest,
    ops: build.ops, preloadOps: build.preloadOps,
    cells: method === MLT_METHOD.PUSH ? pairs : changedCells,
    runs: method === MLT_METHOD.MIXED ? mltRuns(changedCells).length : 0,
    orderedCost, prevRow
  });

  const candidates = [
    asPlan(MLT_METHOD.PUSH, pushBest.push, pushBest.sched, pushOk),
    asPlan(MLT_METHOD.DIRECT, direct, directSched, directOk),
    asPlan(MLT_METHOD.MIXED, mixedBest.build, mixedBest.sched, mixedOk)
  ];
  // One the beam accepts always beats one it does not, however short
  const fitting = candidates.filter(c => c.ok);
  const pool = fitting.length ? fitting : candidates;
  // Cheapest wins, but on a tie take the arrangement with the most room to be
  // placed in. Blocks are laid down one after another, so a plan that saves
  // nothing and can only sit in one place starves the rows that follow it.
  return pool.reduce((best, c) => {
    if (c.cost !== best.cost) return c.cost < best.cost ? c : best;
    return (c.latest - c.start) > (best.latest - best.start) ? c : best;
  });
}

/**
 * The cost of a row, without the instructions. A projection of mltRowPlan, so
 * the two can never disagree.
 *
 * @param {Uint8Array} attrs - the whole 192x32 attribute plane, row-major
 * @param {number} y - pixel row 0..191
 * @param {boolean} inLine - false for a lead-in, whose window reaches back over
 *   the character row above instead of over a single scanline
 * @returns {{ok: boolean, cost: number, method: number, preload: number, changed: number, distinct: number}}
 */
function mltAnalyzeRow(attrs, y, inLine) {
  const p = mltRowPlan(attrs, y, inLine);
  return {
    ok: p.ok, cost: p.cost, method: p.method, preload: p.preload,
    changed: p.changed, distinct: p.distinct
  };
}

/**
 * How much of a character row's spare time a lead-in write can actually reach.
 *
 * The spare time comes in one chunk per scanline. The first chunk is free -- line
 * 8r writes nothing of its own, so a lead-in that fits there runs undisturbed.
 * Every later chunk shares its line with an interior write, which means picking
 * up again costs more than the 10 T to re-point SP: the interior write has been
 * using the same eight register pairs, so the lead-in's own values have to go
 * back in. `resumeCost` covers both, and a chunk smaller than it is no use.
 *
 * @param {number[]} slacks - unused T-states on each of the 8 lines above
 * @param {number} [resumeCost] - cost of picking the lead-in up again
 * @returns {number} T-states a lead-in can spend there
 */
function mltUsableSlack(slacks, resumeCost) {
  const resume = (typeof resumeCost === 'number') ? resumeCost : MLT_TIMING.RESUME;
  // Which chunk to START in is a choice, not whichever happens to come first. A
  // small early chunk taken free makes every later one pay the resume, and
  // skipping it can be worth far more than it gave.
  let best = 0;
  for (let f = 0; f < slacks.length; f++) {
    if (slacks[f] <= 0) continue;
    let total = slacks[f];
    for (let i = f + 1; i < slacks.length; i++) {
      const usable = slacks[i] - resume;
      if (usable > 0) total += usable;
    }
    if (total > best) best = total;
  }
  return best;
}

/**
 * Fits a lead-in write into the spare time of the character row above it.
 * @param {number} need - the lead-in's cost in T-states
 * @param {number[]} slacks - unused T-states on each of the 8 lines above
 * @param {number} [resumeCost] - cost of picking the lead-in up again
 * @returns {boolean}
 */
function mltFitsInSlack(need, slacks, resumeCost) {
  return need <= mltUsableSlack(slacks, resumeCost);
}

/**
 * Where every block goes, in character-row-local code time.
 *
 * The one placement both the checker and the ASM export work from. It is the
 * emitter's job description -- lay the blocks of a character row out in eight
 * lines of code, leaving gaps a Z80 can actually wait -- and the checker's
 * question is the same one: did they fit.
 *
 * @param {Array<any>} plans - per-row plans, index = pixel row
 * @param {number} phase - T-states from a row's first attribute read to the
 *   start of its character row's code
 * @returns {{h: Int32Array, lo: Int32Array, hi: Int32Array, room: Int32Array,
 *   overrun: Int32Array, spill: Uint8Array, ragged: number[],
 *   rowGaps: number[][]}}
 */
function mltPlaceRows(plans, phase) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  const ROWS = 192;
  const h = new Int32Array(ROWS);
  const lo = new Int32Array(ROWS);
  const hi = new Int32Array(ROWS);
  const room = new Int32Array(ROWS);
  const overrun = new Int32Array(ROWS);   // T-states past the beam's deadline
  const spill = new Uint8Array(ROWS);     // charged for a character row that
                                          // does not fit in its eight lines
  /** @type {number[]} */
  const ragged = [];
  /** @type {number[][]} */
  const rowGaps = [];
  const usesPointer = (/** @type {number} */ method) =>
    (typeof mltAsmUsesPointer === 'function') ? mltAsmUsesPointer(method)
      : (method === MLT_METHOD.DIRECT || method === MLT_METHOD.MIXED);
  // Whether a wait of exactly g T-states can be built. Guarded, because the
  // checker runs without the exporter loaded.
  const padOk = (/** @type {number} */ g) =>
    (typeof mltAsmPadOk === 'function') ? mltAsmPadOk(g)
      : (g === 0 || (g >= 4 && g !== 5));
  const gapOk = (/** @type {number} */ g, /** @type {number} */ owed) =>
    (typeof mltAsmGapOk === 'function') ? mltAsmGapOk(g, owed)
      : (g >= owed && padOk(g - owed));

  for (let r = 0; r * 8 < ROWS; r++) {
    let prevEnd = 0;                   // slot 0 writes nothing of its own
    /** @type {number[]} */
    const placed = [];
    /** @type {number[]} */
    const gapsHere = [];

    for (let i = 1; i < 8; i++) {
      const y = r * 8 + i;
      const p = plans[y];
      if (p.method === MLT_METHOD.NONE) continue;
      const earliest = Math.max(i * LINE + p.start - phase, prevEnd + p.preload);
      const latest = i * LINE + p.latest - phase;
      const owed = usesPointer(p.method) ? MLT_TIMING.LD_H_N : 0;
      let at = earliest;
      // Slide later, inside the window, until the gap in front is a length a
      // Z80 can wait: there is no 1, 2, 3 or 5 T-state delay, and a pad rounded
      // up leaves everything after it late.
      for (let k = 0; k < 12 && at < latest; k++) {
        if (gapOk(at - p.preload - prevEnd, owed)) break;
        at++;
      }
      if (at > latest) overrun[y] = at - latest;
      h[y] = at;
      lo[y] = earliest;
      gapsHere.push(Math.max(0, at - p.preload - prevEnd - owed));
      prevEnd = at + p.blockCost;
      placed.push(y);
    }

    // The gap after the last block is whatever is left, and nothing has shaped
    // it. Moving that block by d changes the gap before it by +d and the one
    // after by -d, so one search settles both.
    if (placed.length) {
      const y = placed[placed.length - 1];
      const p = plans[y];
      const before = placed.length > 1
        ? h[placed[placed.length - 2]] + plans[placed[placed.length - 2]].blockCost : 0;
      const owed = usesPointer(p.method) ? MLT_TIMING.LD_H_N : 0;
      const latest = (y % 8) * LINE + p.latest - phase;
      const fits = (/** @type {number} */ at) =>
        gapOk(at - p.preload - before, owed) &&
        padOk(8 * LINE - (at + p.blockCost));
      if (!fits(h[y])) {
        let found = -1;
        for (let d = 1; d <= 16 && found < 0; d++) {
          if (h[y] + d <= latest && fits(h[y] + d)) found = h[y] + d;
          else if (h[y] - d >= lo[y] && fits(h[y] - d)) found = h[y] - d;
        }
        if (found >= 0) {
          gapsHere[gapsHere.length - 1] += found - h[y];
          h[y] = found;
          prevEnd = found + p.blockCost;
        } else {
          ragged.push(r);
        }
      }
    }

    // Eight lines and no more. Blocks that run past leave no trailing gap, the
    // lead-in below has nothing to be written in, and the rows that caused it
    // cannot go where the player would have to put them.
    gapsHere.push(Math.max(0, 8 * LINE - prevEnd));
    if (prevEnd > 8 * LINE) {
      let excess = prevEnd - 8 * LINE;
      for (let k = placed.length - 1; k >= 0 && excess > 0; k--) {
        const y = placed[k];
        excess -= plans[y].cost;
        spill[y] = 1;
      }
    }
    rowGaps.push(gapsHere);

    // How far each block may still move, and the space in front of the next one
    let limit = 8 * LINE;
    for (let k = placed.length - 1; k >= 0; k--) {
      const y = placed[k];
      const p = plans[y];
      room[y] = Math.max(limit - h[y], p.blockCost);
      const beamLatest = (y % 8) * LINE + p.latest - phase;
      hi[y] = Math.max(lo[y], Math.min(beamLatest, limit - p.blockCost));
      limit = h[y] - p.preload;
    }
  }
  return { h, lo, hi, room, overrun, spill, ragged, rowGaps };
}

/**
 * Analyses a whole 8x1 attribute plane.
 *
 * Two passes, because the two kinds of row are costed against different budgets:
 * the interior rows each against their own scanline, and the first row of each
 * character row against whatever the character row above has left over.
 *
 * @param {Uint8Array} attrs - 192x32 attribute bytes, row-major
 * @returns {{over: Uint8Array, cost: Int16Array, method: Uint8Array, overCount: number, worstRow: number, worstCost: number}}
 */
function mltAnalyzePicture(attrs) {
  // Both policies, better kept. Per-run alignment pairs a row's colours more
  // cheaply, but a cheaper block shifts every block after it, so the saving has
  // to be judged over the whole picture rather than the row that made it.
  mltPerRunAlign = false;
  const plain = mltAnalyzePictureOnce(attrs);
  mltPerRunAlign = true;
  const aligned = mltAnalyzePictureOnce(attrs);
  if (aligned.overCount <= plain.overCount) return aligned;
  mltPerRunAlign = false;
  return plain;
}

/**
 * One pass of the analysis, under whatever alignment policy is set.
 * @param {Uint8Array} attrs
 * @returns {*}
 */
function mltAnalyzePictureOnce(attrs) {
  const rows = 192;
  const lines = MLT_TIMING.CHAR_ROW_LINES;
  const LINE = MLT_TIMING.LINE_TSTATES;
  const over = new Uint8Array(rows);
  const cause = new Uint8Array(rows);
  const cost = new Int16Array(rows);
  const method = new Uint8Array(rows);
  const kind = new Uint8Array(rows);
  const budget = new Int32Array(rows);
  const raw = new Float64Array(rows);
  // What the cheapest beam-legal arrangement costs, for rows refused on order
  const ordered = new Int32Array(rows);
  // Where each block ended up, relative to the start of its own scanline
  const placedAt = new Int32Array(rows);
  // The spaces between blocks in each character row, which is what a lead-in
  // actually has to be split across
  /** @type {number[][]} */
  const rowGaps = [];
  // What each scanline has left once the blocks running through it are charged
  const spare = new Int32Array(rows);

  // The emitter's character-row code begins `phase` T-states before the row's
  // first scanline, and nothing can be placed before the code it lives in. The
  // checker has to respect the same floor or it measures time the player has no
  // way to reach.
  const plansForPhase = [];
  for (let y = 0; y < rows; y++) plansForPhase[y] = mltRowPlan(attrs, y, y % lines !== 0);
  const chosen = (typeof mltAsmChoosePhase === 'function')
    ? mltAsmChoosePhase(plansForPhase) : null;
  const phase = chosen ? chosen.phase : 0;

  // Pass 1 -- where every block actually goes. mltPlaceRows() is the single
  // answer, the same one the player is built from; this pass only translates it
  // into the readout's terms. Two placements that had to agree never did: the
  // floor, the gap nudge, the `ld h,n` reserve, the trailing gap and the
  // character-row overrun each had to be mirrored, and one more always appeared
  // behind the last.
  const place = mltPlaceRows(plansForPhase, phase);
  for (let top = 0; top < rows; top += lines) {
    const busy = new Int32Array(lines);
    for (let i = 1; i < lines; i++) {
      const y = top + i;
      const p = plansForPhase[y];
      ordered[y] = isFinite(p.orderedCost) ? p.orderedCost : 0;
      raw[y] = p.cost;
      cost[y] = Math.min(32767, p.cost);
      method[y] = p.method;
      kind[y] = MLT_ROW_KIND.INTERIOR;
      if (p.method === MLT_METHOD.NONE) { budget[y] = LINE; continue; }

      // Code-local to ULA time: a character row's code begins `phase` T-states
      // before its first attribute read.
      const origin = y * LINE;
      const writesAt = top * LINE + place.h[y] + phase;
      // The preload runs in front of the writes, so the row begins earlier
      const begin = writesAt - p.preload;
      // The room this row actually had: from where it begins to where it must be
      // finished. More than a scanline when neighbours left time over, less when
      // they took it. When nothing is schedulable, `latest` is behind `start` and
      // the figure means nothing -- fall back to the scanline so the readout and
      // the "to fit" advice still have a target.
      budget[y] = p.ok ? (origin + p.latest + p.blockCost - begin) : LINE;
      // The verdict is the placement's, not a second opinion about it
      over[y] = (p.ok && !place.overrun[y] && !place.spill[y]) ? 0 : 1;
      // Three different things used to arrive as one flag, and the readout had
      // to guess between them -- badly, for a row that fits on time and in
      // order and is only charged for its character row running long.
      cause[y] = !over[y] ? MLT_CAUSE.FITS
        : (!p.ok ? MLT_CAUSE.ORDER
          : (place.overrun[y] ? MLT_CAUSE.BEAM : MLT_CAUSE.SPILL));
      placedAt[y] = writesAt - origin;

      // Charge the row to every scanline it runs through, so the lead-in is
      // offered what is really left rather than 224 T minus each row's own cost
      const ends = writesAt + p.blockCost;
      for (let li = 0; li < lines; li++) {
        const lineFrom = (top + li) * LINE;
        const overlap = Math.min(ends, lineFrom + LINE) - Math.max(begin, lineFrom);
        if (overlap > 0) busy[li] += overlap;
      }
    }
    for (let i = 0; i < lines; i++) spare[top + i] = Math.max(0, LINE - busy[i]);
    rowGaps.push(place.rowGaps[top / lines]);
  }

  // Pass 2 -- the first row of each character row, written during the character
  // row above and split across whatever its scanlines have left. Row 0 is free:
  // the top border prepares it.
  for (let y = 0; y < rows; y += lines) {
    if (y === 0) { budget[y] = LINE; continue; }
    const lead = mltRowPlan(attrs, y, false);
    ordered[y] = isFinite(lead.orderedCost) ? lead.orderedCost : 0;
    raw[y] = lead.cost;
    cost[y] = Math.min(32767, lead.cost);
    method[y] = lead.method;
    kind[y] = MLT_ROW_KIND.LEAD_IN;
    // The gaps the character row above really leaves, in order
    const slacks = (rowGaps[(y / lines) - 1] || []).slice();
    // Resuming in a line an interior write also uses means reloading the values
    // that write took the registers for
    budget[y] = mltUsableSlack(slacks, MLT_TIMING.RESUME + lead.preload);
    over[y] = (lead.ok && lead.cost <= budget[y]) ? 0 : 1;
  }

  let overCount = 0, worstRow = -1, worstCost = 0;
  for (let y = 0; y < rows; y++) {
    if (!over[y]) continue;
    overCount++;
    if (raw[y] > worstCost) { worstCost = raw[y]; worstRow = y; }
  }
  return { phase, over, cause, cost, method, kind, budget, ordered, placedAt, spare,
           overCount, worstRow, worstCost };
}

// ============================================================================
// Per-row detail, for the hover readout
// ============================================================================

/**
 * Attributes a row's cost to individual cells.
 *
 * Two things make a cell cost anything. It has to **change** from what the
 * attribute line already holds, or it needs no write at all. And its colour has
 * to be **loaded into a register**, which is shared with every other cell in the
 * row using the same colour -- so a cell whose colour nothing else in the row
 * shares is paying for a register by itself. Those are the ones worth merging:
 * each is a `ld rr,nn` (10 T) under push, or a `ld r,n` (7 T) under direct
 * stores, that would simply vanish if some other cell already held the value.
 *
 * What counts as "the same colour" follows the method: push works two cells at a
 * time and shares a 16-bit register pair, direct stores work a cell at a time and
 * share a single byte. That is also why `changed` and `written` differ -- push
 * stores a whole aligned pair, so a cell that did not change is still rewritten
 * when its neighbour did, and it shares the blame for that pair's register.
 *
 * @param {Uint8Array} attrs - the whole 192x32 attribute plane
 * @param {number} y - pixel row
 * @param {number} method - the method this row was costed under
 * @returns {{changed: Uint8Array, written: Uint8Array, unshared: Uint8Array, changedCount: number, writtenCount: number, unsharedCount: number, unsharedLoads: number, distinct: number, unit: string, loadCost: number, prevRow: number, method: number}}
 */
function mltRowDetail(attrs, y, method) {
  const n = MLT_TIMING.CELLS;
  const base = y * n;
  const changed = new Uint8Array(n);
  const written = new Uint8Array(n);
  const unshared = new Uint8Array(n);
  const prevRow = y === 0 ? 0 : ((y % MLT_TIMING.CHAR_ROW_LINES === 0) ? y + 7 : y - 1);
  const empty = {
    changed, written, unshared, changedCount: 0, writtenCount: 0,
    unsharedCount: 0, unsharedLoads: 0, distinct: 0, unit: '', loadCost: 0, prevRow,
    method
  };
  if (y === 0) return empty;

  const prevBase = prevRow * n;
  let changedCount = 0;
  for (let c = 0; c < n; c++) {
    if (attrs[base + c] !== attrs[prevBase + c]) { changed[c] = 1; changedCount++; }
  }
  if (!changedCount) return empty;

  /** @type {Map<number, number>} */
  const uses = new Map();
  let distinct = 0, unit = '', loadCost = 0;
  let unsharedCount = 0, unsharedLoads = 0, writtenCount = 0;

  if (method === MLT_METHOD.DIRECT || method === MLT_METHOD.MIXED) {
    for (let c = 0; c < n; c++) {
      if (!changed[c]) continue;
      written[c] = 1;
      writtenCount++;
      uses.set(attrs[base + c], (uses.get(attrs[base + c]) || 0) + 1);
    }
    for (let c = 0; c < n; c++) {
      if (changed[c] && uses.get(attrs[base + c]) === 1) {
        unshared[c] = 1;
        unsharedCount++;
        unsharedLoads++;      // one `ld r,n` per unshared byte
      }
    }
    distinct = uses.size;
    unit = 'colours';
    // What a one-off colour really costs: a register load under Method D, but
    // only the 3T by which `ld (hl),n` beats a register it never takes under M
    loadCost = (method === MLT_METHOD.MIXED)
      ? MLT_TIMING.LD_HL_N - MLT_TIMING.STORE
      : MLT_TIMING.LD_R_N;
  } else {
    // Push writes whole pairs, so a pair counts as written when either half
    // changed, and shares a register pair with every identical pair in the row.
    // Which pairs those are depends on the alignment the row chose, so they come
    // from the plan rather than from an assumption about even cells.
    const plan = mltRowPlan(attrs, y, y % MLT_TIMING.CHAR_ROW_LINES !== 0);
    const lows = (plan.method === MLT_METHOD.PUSH || plan.method === MLT_METHOD.MIXED)
      ? mltPlanPairLows(plan)
      : [];
    for (const lo of lows) {
      if (written[lo]) continue;        // a cell can only be written once
      written[lo] = 1;
      written[lo + 1] = 1;
      writtenCount += 2;
      const w = (attrs[base + lo + 1] << 8) | attrs[base + lo];
      uses.set(w, (uses.get(w) || 0) + 1);
    }
    for (const lo of lows) {
      const w = (attrs[base + lo + 1] << 8) | attrs[base + lo];
      if (uses.get(w) !== 1) continue;
      unshared[lo] = 1;
      unshared[lo + 1] = 1;
      unsharedCount += 2;
      unsharedLoads++;        // one `ld rr,nn` per unshared pair, covering 2 cells
    }
    distinct = uses.size;
    unit = 'colour pairs';
    loadCost = MLT_TIMING.LOAD_CHEAP;
  }

  return {
    changed, written, unshared, changedCount, writtenCount,
    unsharedCount, unsharedLoads, distinct, unit, loadCost, prevRow, method
  };
}

/**
 * The two ways out of an over-budget row.
 *
 * A row costs time for two separable reasons: how many cells it has to write,
 * and how many different colours those cells need. So there are two ways to
 * bring it back inside its time, and they ask for completely different edits:
 *
 *   - **reuse a colour** -- recolour a cell to one the row already uses. A colour
 *     is paid for once however many cells share it, so this removes a load
 *   - **match the row above** -- let a cell keep the colour the attribute line
 *     already holds. Nothing has to be written there at all, so this removes a
 *     store and, if that cell was the only user of its colour, a load with it
 *
 * Which is gentler depends entirely on the row, and the difference can be large.
 * On a row of 32 cells in 16 colour pairs, reuse has to fold 13 colours together
 * and repaints 26 cells; matching the row above needs 6. Both are measured by
 * making the edit and re-costing, never by dividing the overshoot -- the cost
 * does not fall in even steps, because the index registers, the shadow set and
 * the gaps SP has to skip all have prices of their own.
 *
 * For a lead-in row the budget is held fixed, although in truth it grows a little
 * as the row gets cheaper to prepare; the answers are then slightly pessimistic,
 * which is the safe direction for advice.
 */

/**
 * How many colours have to be folded together before the row fits.
 * @param {Uint8Array} attrs - the whole attribute plane
 * @param {number} y - pixel row
 * @param {*} result - the analysis this row came from
 * @returns {{colours: number, cells: number}|null} null when no amount of reuse helps
 */
function mltSuggestReuse(attrs, y, result) {
  const n = MLT_TIMING.CELLS;
  const base = y * n;
  const inLine = result.kind[y] !== MLT_ROW_KIND.LEAD_IN;
  const budget = result.budget[y];
  const scratch = new Uint8Array(attrs.length);
  scratch.set(attrs);
  let cells = 0;

  for (let k = 1; k <= n; k++) {
    /** @type {Map<number, number>} */
    const uses = new Map();
    for (let c = 0; c < n; c++) {
      uses.set(scratch[base + c], (uses.get(scratch[base + c]) || 0) + 1);
    }
    if (uses.size <= 1) return null;
    // Target first, then the victim from what is left. Picking both by a single
    // sweep makes them the same value when every colour is used once, and the
    // fold then quietly does nothing at all.
    let most = 0, mostUses = -1;
    uses.forEach((count, value) => {
      if (count > mostUses) { mostUses = count; most = value; }
    });
    let least = 0, leastUses = Infinity;
    uses.forEach((count, value) => {
      if (value !== most && count < leastUses) { leastUses = count; least = value; }
    });
    for (let c = 0; c < n; c++) {
      if (scratch[base + c] === least) { scratch[base + c] = most; cells++; }
    }
    if (mltTrialFits(scratch, y, inLine, budget, result.phase)) return { colours: k, cells };
  }
  return null;
}

/**
 * Whether a trial edit actually makes the row fit.
 *
 * An interior row is measured against the room that edit would leave it, because
 * shortening a row moves where it sits. A lead-in keeps the budget the analysis
 * worked out from the character row above.
 *
 * @param {Uint8Array} scratch - the trial plane
 * @param {number} y - pixel row
 * @param {boolean} inLine - false for a lead-in
 * @param {number} budget - the lead-in's budget from the analysis
 * @returns {boolean}
 */
function mltTrialFits(scratch, y, inLine, budget, phase) {
  if (!inLine) {
    const lead = mltAnalyzeRow(scratch, y, false);
    return lead.ok && lead.cost <= budget;
  }
  // Both alignment policies, because mltAnalyzePicture() keeps the better of the
  // two. Judging a trial under only the current one makes the advice disagree
  // with the verdict the panel will show once the edit is made.
  const was = mltPerRunAlign;
  let fits = false;
  for (const policy of [false, true]) {
    mltPerRunAlign = policy;
    const t = mltCharRowRoom(scratch, y, phase);
    // `ok` already carries the placement's verdict -- if the beam is met, it fits
    if (t.ok) { fits = true; break; }
  }
  mltPerRunAlign = was;
  return fits;
}

/**
 * What a row would really be given, for a trial edit of the attribute plane.
 *
 * The seven interior rows of a character row share one run of code, so a row's
 * room depends on its neighbours and on its own length. The advice therefore
 * cannot test a trial against the room the row started with; it has to replay
 * the placement, which is seven row plans.
 *
 * @param {Uint8Array} attrs - the plane to measure, which may be a trial copy
 * @param {number} y - pixel row
 * @returns {{ok: boolean, cost: number, room: number}}
 */
function mltCharRowRoom(attrs, y, phase) {
  const lines = MLT_TIMING.CHAR_ROW_LINES;
  const LINE = MLT_TIMING.LINE_TSTATES;
  const top = y - (y % lines);
  // The same placement the verdict comes from. Only this character row matters,
  // because a run of code never crosses one, so the rest are left empty.
  /** @type {Array<any>} */
  const plans = new Array(192).fill({ method: MLT_METHOD.NONE });
  for (let i = 1; i < lines; i++) plans[top + i] = mltRowPlan(attrs, top + i, true);
  const place = mltPlaceRows(plans, phase || 0);
  const p = plans[y];
  if (p.method === MLT_METHOD.NONE) return { ok: true, cost: 0, room: LINE };
  const origin = y * LINE;
  const begin = top * LINE + place.h[y] + (phase || 0) - p.preload;
  return {
    // Every reason the verdict uses, or the advice promises a fit the panel
    // then refuses: a trial can shorten this row and still leave the character
    // row over eight lines.
    ok: p.ok && !place.overrun[y] && !place.spill[y],
    cost: p.cost,
    room: p.ok ? (origin + p.latest + p.blockCost - begin) : LINE
  };
}

/**
 * How many cells have to go back to the colour the row above already holds.
 *
 * Greedy on the measured cost rather than on a rule of thumb, because where a
 * cell sits matters: giving back a pair at the end of the run simply removes it,
 * while giving one back in the middle leaves a gap SP still has to skip over.
 *
 * @param {Uint8Array} attrs - the whole attribute plane
 * @param {number} y - pixel row
 * @param {*} result - the analysis this row came from
 * @returns {{cells: number}|null}
 */
function mltSuggestMatch(attrs, y, result) {
  const n = MLT_TIMING.CELLS;
  const base = y * n;
  const prevBase = ((y % MLT_TIMING.CHAR_ROW_LINES === 0) ? y + 7 : y - 1) * n;
  const inLine = result.kind[y] !== MLT_ROW_KIND.LEAD_IN;
  const budget = result.budget[y];
  // Push cannot give back half a pair, so there the unit is the pair
  const step = result.method[y] === MLT_METHOD.DIRECT ? 1 : 2;
  const scratch = new Uint8Array(attrs.length);
  scratch.set(attrs);
  let cells = 0;

  for (let round = 0; round <= n; round++) {
    let bestAt = -1, bestCost = Infinity;
    for (let c = 0; c < n; c += step) {
      let differs = false;
      for (let i = 0; i < step; i++) {
        if (scratch[base + c + i] !== attrs[prevBase + c + i]) differs = true;
      }
      if (!differs) continue;
      /** @type {number[]} */
      const saved = [];
      for (let i = 0; i < step; i++) {
        saved.push(scratch[base + c + i]);
        scratch[base + c + i] = attrs[prevBase + c + i];
      }
      const trial = mltAnalyzeRow(scratch, y, inLine);
      for (let i = 0; i < step; i++) scratch[base + c + i] = saved[i];
      if (trial.cost < bestCost) { bestCost = trial.cost; bestAt = c; }
    }
    if (bestAt < 0) return null;
    for (let i = 0; i < step; i++) {
      if (scratch[base + bestAt + i] !== attrs[prevBase + bestAt + i]) cells++;
      scratch[base + bestAt + i] = attrs[prevBase + bestAt + i];
    }
    if (mltTrialFits(scratch, y, inLine, budget, result.phase)) return { cells };
  }
  return null;
}

// ============================================================================
// Hooking into the viewer
// ============================================================================

/** Orange is not a ZX colour, so the marks cannot be mistaken for picture data. */
const MLT_TIMING_MARK_COLOR = '#ff7a00';

/** The hovered row's own marker: white, to read against the orange cost marks. */
const MLT_TIMING_HOVER_COLOR = 'rgba(255, 255, 255, 0.65)';

/**
 * True when the last repaint managed to put the swatch strip in the bottom
 * border. The small copy in the side panel only appears when it did not.
 */
let mltStripInBorder = false;

/**
 * Paints one band of 32 cells: for each, its ink on the left and its paper on the
 * right. Side by side rather than stacked, so that in the two-band strip an ink
 * sits directly above an ink and a paper above a paper, and a colour change is a
 * break in a vertical pair rather than something to hunt for.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 - left edge
 * @param {number} y0 - top edge
 * @param {number} cellW - pitch of one cell, gap included
 * @param {number} h - band height
 * @param {Uint8Array} attrs - the whole attribute plane
 * @param {number} base - offset of the row to draw
 * @param {Uint8Array} lit - 1 where the cell matters; the rest are veiled
 * @param {Uint8Array|null} frame - 1 where the cell's colour is its own, and so
 *   costs a register load of its own. Passing it also outlines every written
 *   cell in white: veiling the others is no help on a row of black swatches,
 *   where a veiled cell and a lit one look exactly alike, so the cells the beam
 *   has to write could not be counted at all.
 */
function mltPaintSwatchBand(ctx, x0, y0, cellW, h, attrs, base, lit, frame) {
  const gap = cellW >= 12 ? 1 : 0;
  const w = Math.max(1, cellW - gap);
  const half = Math.max(1, Math.floor(w / 2));
  const stroke = cellW >= 12 ? 2 : 1;
  const rgb = (v) => 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')';
  for (let c = 0; c < MLT_TIMING.CELLS; c++) {
    const colors = typeof getColorsRgb === 'function'
      ? getColorsRgb(attrs[base + c]) : { inkRgb: [0, 0, 0], paperRgb: [0, 0, 0] };
    const x = x0 + c * cellW;
    ctx.fillStyle = rgb(colors.inkRgb);
    ctx.fillRect(x, y0, half, h);
    ctx.fillStyle = rgb(colors.paperRgb);
    ctx.fillRect(x + half, y0, w - half, h);
    if (!lit[c]) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fillRect(x, y0, w, h);
    }
    if (frame && lit[c]) {
      // Orange for a colour this cell alone uses, white for the rest: the same
      // mark in two weights, so the written cells can be counted and the
      // expensive ones still stand out among them.
      ctx.strokeStyle = frame[c] ? MLT_TIMING_MARK_COLOR : MLT_TIMING_HOVER_COLOR;
      ctx.lineWidth = stroke;
      ctx.strokeRect(x + stroke / 2, y0 + stroke / 2, w - stroke, h - stroke);
    }
  }
}

/**
 * Ticks under the picture marking where each aligned cell PAIR begins.
 *
 * `push` puts two cells down at once, so a pair is what the player actually
 * writes: a colour change inside one is free, one that straddles a boundary is
 * not. Every fourth tick is brighter, so a pair can be counted off against the
 * picture without counting all sixteen.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 - left edge of the strip
 * @param {number} y - centre line for the ticks
 * @param {number} cellW - pitch of one cell
 * @param {number} room - height of the gap, so a tick cannot touch its edges
 */
function mltPaintPairTicks(ctx, x0, y, cellW, room) {
  const fit = Math.max(1, Math.floor(room) - 4);
  const base = Math.min(fit, Math.max(2, Math.min(5, Math.round(cellW / 4))));
  for (let c = 0; c <= MLT_TIMING.CELLS; c += 2) {
    const major = (c % 8) === 0;
    const sz = major ? base + 1 : base;
    ctx.fillStyle = major ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.70)';
    ctx.fillRect(Math.round(x0 + c * cellW - sz / 2), Math.round(y - sz / 2), sz, sz);
  }
}

/**
 * Paints the swatch strip: the attribute line as it stands on top, what this row
 * needs underneath.
 *
 * Showing only the new colours says what the row wants but not what the beam has
 * to do about it. With both, the cells that need a write are the ones whose two
 * bands disagree -- and those are exactly the lit ones, so the picture reads the
 * same whether you follow the brightness or the colours. The bottom band carries
 * the orange frames, because it is this row's colours that need the registers.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 - left edge
 * @param {number} y0 - top edge
 * @param {number} cellW - pitch of one cell, gap included
 * @param {number} h - height of both bands and the rule between them
 * @param {Uint8Array} attrs - the whole attribute plane
 * @param {number} base - offset of this row
 * @param {{written: Uint8Array, unshared: Uint8Array, prevRow: number}} detail
 */
function mltPaintSwatches(ctx, x0, y0, cellW, h, attrs, base, detail) {
  const sep = Math.max(1, Math.round(h * 0.08));
  const bandH = Math.max(1, Math.floor((h - sep) / 2));
  const prevBase = detail.prevRow * MLT_TIMING.CELLS;
  mltPaintSwatchBand(ctx, x0, y0, cellW, bandH, attrs, prevBase, detail.written, null);
  // A rule between the bands, so the pair reads as before/after and not as a
  // sixty-four cell row
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(x0, y0 + bandH, MLT_TIMING.CELLS * cellW, sep);
  mltPaintSwatchBand(ctx, x0, y0 + bandH + sep, cellW, bandH, attrs, base,
    detail.written, detail.unshared);
}

/**
 * Whether a run may start its pairs on an odd cell.
 *
 * Set by mltAnalyzePicture(), which tries the picture both ways and leaves this
 * on whichever flagged fewer rows. Everything downstream -- the readout, the
 * advice, the ASM export -- then builds the plans the analysis actually judged.
 */
let mltPerRunAlign = false;

/** @type {{sig: string, result: *}|null} */
let mltTimingCache = null;

/** Pixel row the pointer is over, or -1. Drives the markers and the readout. */
let mltHoverRow = -1;

/**
 * True when the check is switched on in Settings.
 * @returns {boolean}
 */
function isMltTimingCheckEnabled() {
  return typeof getMouseSetting === 'function' && getMouseSetting('mltTiming') === 'on';
}

/**
 * True for pictures the check applies to: a plain 256x192 picture with one
 * attribute row per pixel row. Timex Hi-Colour is excluded -- there the 8x1
 * colour is in hardware, so there is no per-line CPU work to measure.
 * @param {*} [pic] - defaults to the current picture
 * @returns {boolean}
 */
function isMltTimingTarget(pic) {
  const p = pic || (typeof currentPicture !== 'undefined' ? currentPicture : null);
  if (!p || !p.planes || !p.planes[0] || !p.planes[0].attrs) return false;
  return p.attrCellHeight === 1 && p.width === 256 && p.height === 192 &&
    p.colorMode === 'standard' && p.contentMode === 'pixel' &&
    p.sourceFormat !== 'mlt_ula' &&
    p.planes[0].attrs.length >= 192 * 32;
}

/**
 * Analysis for the current picture, cached against the attribute bytes so an
 * edit invalidates it but a repaint does not.
 * @param {*} [pic] - defaults to the current picture
 * @returns {{over: Uint8Array, cost: Int16Array, method: Uint8Array, overCount: number, worstRow: number, worstCost: number}|null}
 */
function getMltTimingResult(pic) {
  const p = pic || (typeof currentPicture !== 'undefined' ? currentPicture : null);
  if (!isMltTimingTarget(p)) return null;
  const attrs = p.planes[0].attrs;
  // FNV-1a over the attribute bytes: ~6 KB to hash against ~200 KB of analysis
  let h = 0x811c9dc5;
  for (let i = 0; i < 192 * 32; i++) {
    h ^= attrs[i];
    h = (h * 0x01000193) >>> 0;
  }
  const sig = h + ':' + attrs.length;
  if (mltTimingCache && mltTimingCache.sig === sig) return mltTimingCache.result;
  const result = mltAnalyzePicture(attrs);
  mltTimingCache = { sig, result };
  return result;
}

/**
 * Explains what putting a row in a beam-legal order would cost.
 *
 * `push` descends while the ULA reads upwards, so one unbroken run can only span
 * twelve cell pairs. Covering more means cutting the run and re-pointing SP,
 * which buys the order for 10 T a cut. Often that is 10 T the line does not
 * have, and saying so by how much ends the question.
 *
 * @param {*} result - the analysis
 * @param {number} y - pixel row
 * @returns {string}
 */
function mltOrderingNote(result, y) {
  const ordered = result.ordered ? result.ordered[y] : 0;
  const budget = result.budget[y];
  if (!ordered || ordered <= budget) return '';
  return 'Putting it in an order the beam accepts means cutting the run of pushes and ' +
    're-pointing SP, which costs 10T a cut: ' + ordered + 'T in all, ' +
    (ordered - budget) + 'T more than this row has.';
}

/**
 * Sets the hovered row and repaints if it moved.
 * @param {number} y - pixel row, or -1 for none
 * @param {boolean} [repaint=true] - false while a drag is in progress; the
 *   editor's own render will pick the change up
 */
function setMltHoverRow(y, repaint) {
  const v = (typeof y === 'number' && y >= 0 && y < 192) ? Math.floor(y) : -1;
  if (v === mltHoverRow) return;
  mltHoverRow = v;
  if (repaint !== false && typeof renderScreen === 'function') renderScreen();
}

/**
 * Tracks the pointer over the picture so the readout can follow it.
 *
 * Uses the editor's own coordinate helper, which already undoes canvas rotation
 * and the scroll transform. It returns null outside the picture, so pointing at
 * the border alone does not select a row -- point at the row itself.
 */
function initMltTimingHover() {
  const cv = /** @type {HTMLCanvasElement|null} */ (document.getElementById('screenCanvas'));
  if (!cv) return;
  cv.addEventListener('mousemove', (event) => {
    const e = /** @type {MouseEvent} */ (event);
    if (!isMltTimingCheckEnabled() || !isMltTimingTarget()) { setMltHoverRow(-1); return; }
    if (typeof canvasToScreenCoords !== 'function') return;
    const p = canvasToScreenCoords(cv, e);
    setMltHoverRow(p ? p.y : -1, e.buttons === 0);
  });
  cv.addEventListener('mouseleave', () => setMltHoverRow(-1));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMltTimingHover);
} else {
  initMltTimingHover();
}

/**
 * Draws an orange border line against every pixel row that cannot be put in
 * place in time -- exactly where a player's own `out (#fe)` diagnostic would
 * show it -- plus, on the row under the pointer, a marker on each cell that
 * needs a write and a brighter one on each cell paying for a register alone.
 *
 * @param {CanvasRenderingContext2D} ctx - the main canvas context
 * @param {number} mainOffset - offset to the picture area in canvas pixels
 */
function drawMltTimingOverlay(ctx, mainOffset) {
  mltStripInBorder = false;
  if (!isMltTimingCheckEnabled()) return;
  // While editing, the live attribute bytes are in screenData and only reach the
  // picture at the end of the repaint, which would leave the marks a frame behind
  if (typeof editorActive !== 'undefined' && editorActive &&
      typeof syncPictureFromScreenData === 'function' &&
      typeof currentPicture !== 'undefined' && currentPicture &&
      typeof screenData !== 'undefined' && screenData && screenData.length > 0 &&
      isMltTimingTarget(currentPicture)) {
    syncPictureFromScreenData(screenData, currentPicture);
  }
  const result = getMltTimingResult();
  if (!result) return;
  if (!result.overCount && mltHoverRow < 0) return;

  const scaleY = typeof getPixelScaleY === 'function' ? getPixelScaleY() : 1;
  const zoomY = zoom * scaleY;
  const zoomX = zoom * (typeof getPixelScaleX === 'function' ? getPixelScaleX() : 1);
  const picW = 256 * zoomX;
  const mainRight = mainOffset + picW;
  const totalWidth = mainRight + mainOffset;

  // With the border hidden there is nowhere outside the picture to draw, so the
  // marks move just inside its edges rather than disappearing
  const inset = mainOffset <= 0;
  const markW = inset ? Math.max(2, Math.round(3 * zoom)) : mainOffset;
  const leftX = inset ? mainOffset : 0;
  const rightX = inset ? mainRight - markW : mainRight;
  const rightW = inset ? markW : totalWidth - mainRight;

  ctx.fillStyle = MLT_TIMING_MARK_COLOR;
  for (let y = 0; y < 192; y++) {
    if (!result.over[y]) continue;
    const py = mainOffset + y * zoomY;
    const h = Math.max(1, zoomY);
    ctx.fillRect(leftX, py, markW, h);
    ctx.fillRect(rightX, py, rightW, h);
  }

  if (mltHoverRow < 0) return;
  const pic = typeof currentPicture !== 'undefined' ? currentPicture : null;
  if (!pic) return;
  const detail = mltRowDetail(pic.planes[0].attrs, mltHoverRow, result.method[mltHoverRow]);
  const py = mainOffset + mltHoverRow * zoomY;
  const h = Math.max(1, zoomY);
  const cellW = 8 * zoomX;

  // A white guide in the border says which row the readout is describing, so it
  // cannot be confused with the orange over-budget marks
  ctx.fillStyle = MLT_TIMING_HOVER_COLOR;
  ctx.fillRect(leftX, py, markW, h);
  ctx.fillRect(rightX, py, rightW, h);

  for (let c = 0; c < MLT_TIMING.CELLS; c++) {
    if (!detail.written[c]) continue;
    ctx.fillStyle = detail.unshared[c] ? MLT_TIMING_MARK_COLOR : MLT_TIMING_HOVER_COLOR;
    ctx.fillRect(mainOffset + c * cellW, py, cellW, h);
  }

  mltStripInBorder = drawMltStripInBorder(ctx, mainOffset, cellW, zoomY,
    pic.planes[0].attrs, mltHoverRow * MLT_TIMING.CELLS, detail);
}

/**
 * Puts the swatch strip in the bottom border, one swatch per column and directly
 * under the column it describes, so a cell and its colour line up by eye.
 *
 * Returns false when there is nowhere to put it -- the border is hidden, too
 * thin, or scrolled off screen at high zoom -- and the side panel shows its own
 * small copy instead.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mainOffset - border thickness in canvas pixels
 * @param {number} cellW - width of one character cell on screen
 * @param {number} zoomY - height of one pixel row on screen
 * @param {Uint8Array} attrs
 * @param {number} base - offset of the hovered row
 * @param {{written: Uint8Array, unshared: Uint8Array}} detail
 * @returns {boolean}
 */
function drawMltStripInBorder(ctx, mainOffset, cellW, zoomY, attrs, base, detail) {
  const pad = Math.max(2, Math.round(zoom));
  const room = mainOffset - pad * 2;
  if (room < 8) return false;

  // The gap under the picture is reserved FIRST. Sizing the strip from the cell
  // width and leaving it the remainder fails at high zoom, where that width
  // exceeds the whole border: the strip fills it and the gap disappears.
  let gapTop = Math.min(20, Math.max(8, Math.round(zoom * 3.5)));
  // Two bands and a rule between them, kept in proportion to the cells above but
  // well short of them: the swatches only have to read as colours, while the
  // ticks have to be counted off against the picture, which needs the room more
  let h = Math.min(room - gapTop, Math.round(cellW * 1.25));
  let showTicks = true;
  if (h < 10) {
    // Too thin a border for both. The strip is the useful half, so it keeps the
    // room and the ticks go without.
    showTicks = false;
    h = Math.min(room, Math.max(10, Math.round(cellW * 1.5)));
    gapTop = Math.max(pad, Math.round((mainOffset - h) / 2));
  }
  const picBottom = mainOffset + 192 * zoomY;
  const y0 = picBottom + gapTop;
  const tickY = picBottom + Math.round(gapTop / 2);

  // At high zoom the bottom border can be scrolled out of sight; the strip is no
  // use where it cannot be seen
  const container = document.getElementById('canvasContainer');
  if (container && container.clientHeight > 0) {
    const top = container.scrollTop;
    const bottom = top + container.clientHeight;
    if (y0 < top || y0 + h > bottom) return false;
  }

  const x0 = mainOffset;
  const width = MLT_TIMING.CELLS * cellW;
  // A dark sill under the swatches keeps them legible on a light border, and it
  // reaches up over the ticks so those stay readable too. It stops short of the
  // picture so it cannot be mistaken for part of it.
  const sillTop = showTicks ? Math.min(y0 - pad, picBottom + 2) : y0 - pad;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x0 - pad, sillTop, width + pad * 2, y0 + h + pad - sillTop);
  if (showTicks) mltPaintPairTicks(ctx, x0, tickY, cellW, gapTop);
  mltPaintSwatches(ctx, x0, y0, cellW, h, attrs, base, detail);
  return true;
}

/**
 * The hovered row for the File Info panel.
 *
 * Written for someone drawing a picture, not someone counting T-states: how full
 * the row is as a percentage, how its colours are spread, and what to change.
 * Every T-state, instruction and register in the model is still there, one hover
 * away, in the tooltips.
 *
 * @returns {{label: string, row: string, rowTitle: string, changes: string, changesTitle: string, colours: string, coloursTitle: string, fix: string, fixTitle: string}|null}
 */
function getMltRowReadout() {
  if (!isMltTimingCheckEnabled() || mltHoverRow < 0) return null;
  const result = getMltTimingResult();
  const pic = typeof currentPicture !== 'undefined' ? currentPicture : null;
  if (!result || !pic) return null;
  const attrs = pic.planes[0].attrs;
  const y = mltHoverRow;
  const detail = mltRowDetail(attrs, y, result.method[y]);
  const cost = result.cost[y];
  const budget = result.budget[y];
  const kind = result.kind[y];
  const method = result.method[y] === MLT_METHOD.PUSH ? 'push'
    : result.method[y] === MLT_METHOD.DIRECT ? 'direct stores' : 'nothing to do';
  const unit = detail.unit === 'colours' ? 'colour' : 'colour pair';

  // --- how full the row is ---
  let row, rowTitle;
  if (kind === MLT_ROW_KIND.FREE) {
    row = 'free';
    rowTitle = 'Row 0 is prepared during the top border, where there is no shortage of time.';
  } else if (!detail.changedCount) {
    row = 'nothing to do';
    rowTitle = 'Identical to row ' + detail.prevRow + ', so the colours are already in place ' +
      'and the beam has nothing to write.';
  } else {
    const pct = Math.round(cost / budget * 100);
    const excess = cost - budget;
    // The verdict follows the analysis, not the rounded percentage: 321T against
    // 320T still rounds to 100%, and a row can also be rejected with time to
    // spare when its writes cannot stay ahead of the beam
    if (result.over[y]) {
      // The analysis says which of the three it is. Guessing from the figures
      // called a row "wrong order" when its order was fine and it was only
      // carrying its character row's overflow.
      const why = result.cause ? result.cause[y] : MLT_CAUSE.ORDER;
      row = pct + '%, ' + (excess > 0 ? 'over ' + excess + 'T'
        : (why === MLT_CAUSE.SPILL ? 'row too full'
          : (why === MLT_CAUSE.BEAM ? 'too slow' : 'wrong order')));
    } else {
      row = pct + '%, ' + (pct >= 95 ? 'tight' : 'fits');
    }
    const lent = budget - MLT_TIMING.LINE_TSTATES;
    rowTitle = 'This row uses ' + pct + '% of the time it has: ' + cost + 'T of work by ' +
      method + ', against ' + budget + 'T available' +
      (kind === MLT_ROW_KIND.LEAD_IN
        ? ', because it is the first row of a character row and can be prepared during the ' +
          'character row above instead of in one scanline.'
        // The seven interior rows of a character row are one run of code, so an
        // interior row is not held to its own scanline: it gets what the rows
        // around it left, which may be more than a scanline or less.
        : (lent > 0
            ? ' -- a scanline is ' + MLT_TIMING.LINE_TSTATES + 'T, and the rows ' +
              'around it leave ' + lent + 'T of theirs over.'
            : (lent < 0
                ? ' -- less than the ' + MLT_TIMING.LINE_TSTATES + 'T of a scanline, ' +
                  'because the rows around it run ' + (-lent) + 'T into its time.'
                : ' in its own scanline.'))) +
      (result.over[y]
        ? (excess > 0
          ? ' It is ' + excess + 'T over.'
          : ' The total fits, but the order does not: the writes cannot stay ahead of the ' +
            'beam, which reads each cell at a fixed moment. ' + mltOrderingNote(result, y))
        : ' ' + (budget - cost) + 'T to spare.');
  }

  // --- how much of it has to be redrawn ---
  let changes, changesTitle;
  if (kind === MLT_ROW_KIND.FREE || !detail.changedCount) {
    changes = 'none';
    changesTitle = kind === MLT_ROW_KIND.FREE
      ? 'Nothing to write.'
      : 'Every cell already holds the colour it needs, so nothing has to be written.';
  } else {
    changes = detail.changedCount + (detail.changedCount === 1 ? ' cell' : ' cells');
    changesTitle = detail.changedCount + ' of this row’s 32 cells differ from row ' +
      detail.prevRow + ', so only those have to be written' +
      (detail.writtenCount > detail.changedCount
        ? ' — though push stores a whole aligned pair at a time, so ' +
          detail.writtenCount + ' are actually rewritten'
        : '') + '.';
  }

  // --- where the time goes: colours, and how many are used only once ---
  let colours, coloursTitle;
  if (!detail.changedCount) {
    colours = '—';
    coloursTitle = '';
  } else if (detail.unsharedLoads === 0) {
    colours = detail.distinct + ', all repeated';
    coloursTitle = 'The row needs ' + detail.distinct + ' different ' + unit +
      (detail.distinct === 1 ? '' : 's') + ', and every one of them is used by more than ' +
      'one cell. Nothing here is being spent on a one-off colour.';
  } else {
    colours = detail.distinct + ', ' + detail.unsharedLoads + ' used once';
    // Method M never puts a one-off colour in a register, so claiming a whole
    // register load there would overstate what reuse buys
    const why = (detail.method === MLT_METHOD.MIXED)
      ? 'a colour only one cell uses never reaches a register at all — it goes ' +
        'straight from the instruction, which costs ' + detail.loadCost + 'T more than ' +
        'storing one the row already holds'
      : 'each has to be loaded into a register once (' + detail.loadCost + 'T) however ' +
        'many cells then share it';
    coloursTitle = 'The row needs ' + detail.distinct + ' different ' + unit +
      (detail.distinct === 1 ? '' : 's') + ': ' + why + '. ' +
      detail.unsharedLoads + ' of them are used by a single cell (' + detail.unsharedCount +
      ' cells, marked orange), which is ' +
      (detail.unsharedLoads * detail.loadCost) + 'T spent on colours that pay for themselves ' +
      'and nothing else.';
  }

  // --- what to change: both routes, leading with the gentler one ---
  let fix = '', fixTitle = '';
  if (result.over[y]) {
    const reuse = mltSuggestReuse(attrs, y, result);
    const match = mltSuggestMatch(attrs, y, result);
    const reuseText = reuse
      ? 'reuse ' + reuse.colours + (reuse.colours === 1 ? ' colour' : ' colours')
      : '';
    const matchText = match
      ? 'match ' + match.cells + (match.cells === 1 ? ' cell' : ' cells') + ' above'
      : '';
    // Repainting fewer cells is the smaller change to the picture
    const preferMatch = match && (!reuse || match.cells < reuse.cells);
    fix = preferMatch ? matchText : reuseText;

    const cellsWord = (k) => k === 1 ? 'one cell' : k + ' cells';
    const ways = [];
    if (match) {
      ways.push('let ' + cellsWord(match.cells) + ' keep the colour the row above already ' +
        'has, so nothing has to be written there');
    }
    if (reuse) {
      ways.push('recolour ' + cellsWord(reuse.cells) + ' so that ' +
        (reuse.colours === 1 ? 'one of its colours becomes one' : reuse.colours +
          ' of its colours become ones') +
        ' the row already uses, since a colour is paid for once however many cells share it');
    }
    fixTitle = ways.length
      ? 'Two ways to bring this row inside its time: ' + ways.join('; or ') +
        '. The one shown repaints fewer cells.'
      : 'Nothing short of changing this row' + RQ + 's shape will fit it in the time.';
    if (!fix) fix = 'needs fewer changes';
  }

  return {
    label: 'Row ' + y + ':',
    row, rowTitle, changes, changesTitle, colours, coloursTitle, fix, fixTitle
  };
}

/**
 * The side panel's small copy of the swatch strip. It only appears when the
 * bottom-border strip could not be drawn, so the two never compete.
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean} false when there is nothing to show
 */
function drawMltRowStrip(canvas) {
  if (!canvas) return false;
  if (mltStripInBorder) return false;
  if (!isMltTimingCheckEnabled() || mltHoverRow < 0) return false;
  const result = getMltTimingResult();
  const pic = typeof currentPicture !== 'undefined' ? currentPicture : null;
  if (!result || !pic) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const attrs = pic.planes[0].attrs;
  const detail = mltRowDetail(attrs, mltHoverRow, result.method[mltHoverRow]);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  mltPaintSwatches(ctx, 0, 0, Math.floor(canvas.width / MLT_TIMING.CELLS),
    canvas.height, attrs, mltHoverRow * MLT_TIMING.CELLS, detail);
  return true;
}

/**
 * The verdict for the info panel. Kept to a couple of words -- the panel is a
 * narrow sidebar, and anything longer wraps across three lines.
 * @returns {string} '' when the check does not apply
 */
function getMltTimingSummary() {
  const result = getMltTimingResult();
  if (!result) return '';
  if (!result.overCount) return 'fits';
  return result.overCount + (result.overCount === 1 ? ' row over' : ' rows over');
}

/**
 * The same verdict in full, for the row's tooltip.
 * @returns {string}
 */
function getMltTimingTooltip() {
  const result = getMltTimingResult();
  if (!result) return '';
  if (!result.overCount) {
    return 'Every pixel row’s attributes can be rewritten in the time available ' +
      '(320 T-states a Pentagon 128K scanline, with no contention).';
  }
  return result.overCount + ' of 192 pixel rows cannot be rewritten in time, and are ' +
    'marked orange on the border. The worst is row ' + result.worstRow + ' at ' +
    result.worstCost + 'T. Point at a row to see where its time goes.';
}
