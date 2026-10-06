// SpectraLab - 8x1 multicolour (MLT) attribute player ASM export
// @ts-check
"use strict";

// ============================================================================
// What this emits
// ============================================================================
// The unrolled attribute-writing body for an 8x1 multicolour picture on
// Pentagon 128K -- the same instruction sequences `js/mlt_timing.js` costs when
// it decides whether the picture can be shown at all. Nothing here re-decides
// anything: every row's method, register allocation and instruction order come
// straight out of `mltRowPlan()`, so what the checker measured is what comes
// out of the file.
//
// It is a routine body, not a player. There is no interrupt handling, no border
// code and no frame loop, because the checker never modelled any of that and
// inventing it here would mean shipping timing nobody verified. What the file
// does carry is an exact contract -- when to call it, what must already be in
// memory, what it destroys -- so it can be dropped into a player that provides
// those things.
//
// Layout
// ------
// The body is 192 slots of exactly 320 T, one per pixel row, in row order. Slot
// y holds the writes that put pixel row y's attributes in place, which in real
// time happens while the beam is still on row y-1; `MLT_PHASE` below is what
// ties the two together.
//
// Within a slot: pad, then the row's preload, then its write block, then pad.
// The block's position is not free -- the ULA latches the attribute byte for
// cell pair k at 8k T into each line, so each write has a window it must land
// in, and `mltScheduleBlock()` reports that window's two ends. The block is
// placed inside it.
//
// One row in eight (y % 8 == 0) is different. Its attribute line is not being
// read at all while the beam is in the character row above, so it has no
// deadlines and no line of its own: its writes are cut into chunks and dropped
// into the gaps the other seven rows leave. Each chunk is a self-contained
// block with its own `ld sp,nn` and its own register loads -- which is exactly
// what the checker charges for a resumed lead-in, so the emitted code is never
// more expensive than the budget it was measured against.
//
// Row 0 is not written here at all. Its attribute line is prepared during the
// top border, where there is time to spare; the contract says so.

const MLT_ASM = {
  /** Symbol the generated source uses for the attribute area base. */
  ATTR: 'MLT_ATTR',
  ROWS: 192,
  /** Padding instructions, longest first. None of them has to preserve anything. */
  /** Shortest wait worth spending two instructions and a loop on. */
  LOOP_MIN: 40,
  /** Pentagon 128K frame: 320 scanlines. */
  FRAME_LINES: 320,
  /**
   * T-states from the interrupt to the ULA latching the attribute byte for
   * cell 0 of pixel row 0. 80 lines: 16 of blanking before the visible area
   * (the figure the BSC export races the border against) plus a 64-line top
   * border. It is emitted as an equate because it is the one number in the
   * file that depends on the machine rather than on the picture.
   */
  INT_TO_SCREEN_LINES: 80,
  /**
   * Left border and blanking, from the start of a scanline to the latch of its
   * first cell. Measured, not assumed: tests/attr_latch.asm wrote cells 14, 22
   * and 30 at the times mltAttrReadT() claims they are latched, plus a swept
   * offset, and all three stopped arriving in time at the same offset -- +63 T.
   * Three cells 32 T apart in the model staying 32 T apart on hardware is what
   * says the shape is right and only the origin was out.
   *
   * Without it the body runs 63 T early, so the opening writes of a row land
   * before the previous line's latch of the same cell and corrupt the row
   * above -- which bites hardest on the rows that use their whole window.
   */
  ATTR_LATCH_OFFSET: 63,
  /** IM2 acknowledge (19) + EI/RETI in the handler (18) + DI (4). */
  INT_OVERHEAD: 41,
  PAD_PARTS: [
    { t: 10, line: 'jp $+3', why: 'jump to the next instruction' },
    { t: 9, line: 'ld a,r' },
    { t: 8, line: 'bit 0,b' },
    { t: 7, line: 'ld a,0' },
    { t: 6, line: 'inc bc' },
    { t: 4, line: 'nop' }
  ]
};

/**
 * Whether a delay of exactly `t` T-states can be built from MLT_ASM.PAD_PARTS.
 * 4 and 6 are the two shortest pieces, so everything from 6 up is reachable and
 * 1, 2, 3 and 5 are not.
 * @param {number} t
 * @returns {boolean}
 */
function mltAsmPadOk(t) {
  return t === 0 || t === 4 || t >= 6;
}

/**
 * Builds a delay of exactly `t` T-states.
 *
 * Greedy, but only over pieces that leave a remainder which is itself
 * reachable -- taking the longest piece every time would strand a remainder of
 * 5 and there is no 5 T-state instruction on a Z80.
 *
 * Nothing in a gap has to survive it: every block begins with a preload that
 * loads every register it uses, including SP, so the padding is free to clobber
 * whatever is cheapest.
 *
 * @param {number} t
 * @returns {string[]} instruction lines, or [] when t is 0
 */
function mltAsmPad(t) {
  /** @type {string[]} */
  const lines = [];
  let rem = t;

  // A long wait is a counted loop, not a wall of nops: `ld b,n` + `djnz $` is
  // 13n + 2 T-states in two instructions. The biggest n whose remainder is
  // still expressible wins.
  if (rem >= MLT_ASM.LOOP_MIN) {
    for (let n = Math.min(255, Math.floor((rem - 2) / 13)); n >= 1; n--) {
      const cost = 13 * n + 2;
      if (cost <= rem && mltAsmPadOk(rem - cost)) {
        lines.push('ld b,' + n, 'djnz $');
        rem -= cost;
        break;
      }
    }
  }

  while (rem > 0) {
    let picked = null;
    for (const part of MLT_ASM.PAD_PARTS) {
      if (part.t <= rem && mltAsmPadOk(rem - part.t)) { picked = part; break; }
    }
    if (!picked) break; // unreachable for a value mltAsmPadOk() accepted
    lines.push(picked.line);
    rem -= picked.t;
  }
  return lines;
}

/**
 * A delay of exactly `t` T-states, for the thousands of them between frames.
 *
 * A nested `djnz` costs 13*in*out + 18*out + 2 and fits in six instructions;
 * whatever it cannot reach exactly is topped up by mltAsmPad(). B, D and the
 * flags are destroyed, which costs nothing here: every block in the body loads
 * every register it uses.
 *
 * @param {number} t
 * @param {string} tag - makes the two labels unique
 * @returns {string[]|null} lines, or null when t cannot be hit exactly
 */
function mltAsmLongDelay(t, tag) {
  if (t < 0) return null;
  // Short waits are a straight run of instructions; mltAsmPad() carries a single
  // djnz, which is nowhere near enough for the thousands of T-states here
  if (t <= 400 && mltAsmPadOk(t)) {
    const flat = mltAsmPad(t);
    if (flat.length) return flat;
  }
  let best = null;
  for (let out = 1; out <= 255; out++) {
    let inner = Math.floor((t - 18 * out - 2) / (13 * out));
    if (inner > 255) inner = 255;
    // Walk down a little: the largest inner count is not always the one whose
    // remainder can be expressed exactly
    for (let k = 0; k < 4 && inner - k >= 1; k++) {
      const n = inner - k;
      const cost = 13 * n * out + 18 * out + 2;
      if (cost > t) continue;
      if (!mltAsmPadOk(t - cost)) continue;
      if (!best || cost > best.cost) best = { out, inner: n, cost };
      break;
    }
  }
  if (!best) return null;
  const lines = [
    'ld d,' + best.out,
    '.' + tag + '_outer:',
    'ld b,' + best.inner,
    '.' + tag + '_inner:',
    'djnz .' + tag + '_inner',
    'dec d',
    'jr nz,.' + tag + '_outer'
  ];
  return lines.concat(mltAsmPad(t - best.cost));
}

/** @param {number} v @returns {string} */
function mltAsmHex2(v) {
  return '#' + (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

/** @param {number} v @returns {string} */
function mltAsmHex4(v) {
  return '#' + (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Renders one op as its instruction plus a comment.
 *
 * @param {MltOp} op
 * @param {number} charRow - attribute row the op writes into (y >> 3)
 * @returns {{text: string, note: string}}
 */
function mltAsmOpText(op, charRow) {
  const at = (/** @type {number} */ off) => MLT_ASM.ATTR + '+' + (charRow * 32 + off);
  switch (op.kind) {
    case 'sp':
      // push writes downwards, so SP sits just past the pair about to be written
      return { text: 'ld sp,' + at(op.pair * 2 + 2), note: 'write down from cell ' + (op.pair * 2 + 1) };
    case 'exx':
      return { text: 'exx', note: 'swap register sets' };
    case 'ld16':
      return {
        text: 'ld ' + op.reg + ',' + mltAsmHex4(op.value),
        note: mltAsmHex2(op.value & 0xff) + ' then ' + mltAsmHex2(op.value >> 8)
      };
    case 'push':
      return { text: 'push ' + op.reg, note: 'cells ' + (op.pair * 2) + ',' + (op.pair * 2 + 1) };
    case 'ldh':
      return { text: 'ld h,high (' + at(0) + ')', note: 'attribute line ' + charRow };
    case 'ldl':
      return { text: 'ld l,low (' + at(op.cell) + ')', note: 'cell ' + op.cell };
    case 'incl':
      return { text: 'inc l', note: 'next cell' };
    case 'ld8':
      return { text: 'ld ' + op.reg + ',' + mltAsmHex2(op.value), note: '' };
    case 'st':
      return { text: 'ld (hl),' + op.reg, note: 'cell ' + op.cells[0] };
    case 'sthln':
      // A colour used once never reaches a register: 10T here against 7T to
      // load one and 7T to store it
      return {
        text: 'ld (hl),' + mltAsmHex2(op.value),
        note: 'cell ' + op.cells[0] + ', used once'
      };
    default:
      return { text: '; unknown op', note: '' };
  }
}

/**
 * Whether a method writes through HL, and so needs H to hold its attribute line
 * before it starts.
 * @param {number} method
 * @returns {boolean}
 */
function mltAsmUsesPointer(method) {
  return method === MLT_METHOD.DIRECT || method === MLT_METHOD.MIXED;
}

/**
 * Picks the one phase the whole body runs at.
 *
 * Every slot is the same length, so a single number relates slot-local time to
 * the ULA's own clock: the first instruction of slot y runs `phase` T-states
 * after the ULA latches the attribute pair for cell 0 of pixel row y. Each row's
 * block then has to sit inside `[start, latest]` measured on that clock, which
 * turns into a range of legal offsets within the slot.
 *
 * The phase that leaves the most room on the tightest row is taken, because that
 * room is what later absorbs the rounding needed to make every pad a delay a Z80
 * can actually express.
 *
 * Rows the checker already rejected are left out of the choice -- they have no
 * legal placement at any phase, and letting them vote would only spoil the rows
 * that do.
 *
 * @param {Array<any>} plans - per-row plans, index = pixel row
 * @param {{over: Uint8Array}} analysis
 * @returns {{phase: number, slack: number}|null}
 */
function mltAsmChoosePhase(plans, analysis) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  let best = null;
  for (let phase = -2 * LINE; phase <= LINE; phase++) {
    let ok = true;
    let slack = Infinity;
    for (let y = 1; y < MLT_ASM.ROWS && ok; y++) {
      if (y % 8 === 0) continue;              // lead-in: written with no deadline
      if (analysis.over[y]) continue;
      const p = plans[y];
      if (p.method === MLT_METHOD.NONE) continue;
      const lo = Math.max(p.preload, p.start - phase);
      const hi = Math.min(LINE - p.blockCost, p.latest - phase);
      if (lo > hi) { ok = false; break; }
      if (hi - lo < slack) slack = hi - lo;
    }
    const nearNatural = Math.abs(phase + LINE);
    if (ok && (!best || slack > best.slack ||
               (slack === best.slack && nearNatural < Math.abs(best.phase + LINE)))) {
      best = { phase, slack };
    }
  }
  return best;
}

/**
 * Where each interior row's block sits inside its slot.
 *
 * @param {Array<any>} plans
 * @param {{over: Uint8Array}} analysis
 * @param {number} phase
 * @returns {{h: Int32Array, lo: Int32Array, hi: Int32Array, overrun: Int32Array}}
 */
function mltAsmPlaceRows(plans, analysis, phase) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  const h = new Int32Array(MLT_ASM.ROWS);
  const lo = new Int32Array(MLT_ASM.ROWS);
  const hi = new Int32Array(MLT_ASM.ROWS);
  const overrun = new Int32Array(MLT_ASM.ROWS);

  for (let y = 1; y < MLT_ASM.ROWS; y++) {
    if (y % 8 === 0) continue;
    const p = plans[y];
    if (p.method === MLT_METHOD.NONE) continue;
    let a = Math.max(p.preload, p.start - phase);
    let b = Math.min(LINE - p.blockCost, p.latest - phase);
    if (a > b) {
      // A row the checker rejected. Two different things can be wrong with it,
      // and only one of them is fatal to the rest of the picture.
      if (p.cost <= LINE) {
        // It fits the line, it just cannot beat the beam. Keep the slot exactly
        // one scanline long so every row after it stays in phase; only these
        // cells come out wrong.
        a = p.preload;
        b = LINE - p.blockCost;
        const want = p.start - phase;
        a = b = Math.min(Math.max(want, a), b);
      } else {
        // Genuinely longer than a scanline. Nothing can absorb that, so the
        // slot overruns and the overrun is reported.
        a = b = p.preload;
        overrun[y] = p.cost - LINE;
      }
    }
    lo[y] = a;
    hi[y] = b;
    // Earliest legal start leaves the most room behind the block, which is where
    // the lead-in chunks go
    h[y] = a;
  }
  return { h, lo, hi, overrun };
}

/**
 * The free runs inside one character row.
 *
 * Slots are contiguous in code, so the tail of one slot and the head of the next
 * are one unbroken run -- which is why a character row has eight gaps, not
 * sixteen, and why that matches the eight chunks the checker budgets a lead-in
 * against.
 *
 * @param {number} r - character row 0..23
 * @param {Array<any>} plans
 * @param {Int32Array} h
 * @returns {number[]} the eight gap lengths
 */
function mltAsmGaps(r, plans, h) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  const head = (/** @type {number} */ i) => {
    const y = r * 8 + i;
    const p = plans[y];
    if (i === 0 || p.method === MLT_METHOD.NONE) return 0;
    return h[y] - p.preload;
  };
  const tail = (/** @type {number} */ i) => {
    const y = r * 8 + i;
    const p = plans[y];
    if (i === 0 || p.method === MLT_METHOD.NONE) return 0;
    // A row longer than a scanline leaves no tail; it eats into the next slot,
    // which generateMltAsm() reports rather than pretends away
    return Math.max(0, LINE - h[y] - p.blockCost);
  };
  const whole = (/** @type {number} */ i) => {
    const p = plans[r * 8 + i];
    return i === 0 || p.method === MLT_METHOD.NONE;
  };

  const gaps = [];
  // Slot 0 writes nothing of its own, and neither does any row whose attributes
  // did not change, so those slots are free end to end
  let run = 0;
  for (let i = 0; i < 8; i++) {
    if (whole(i)) { run += LINE; continue; }
    run += head(i);
    gaps.push(run);
    run = tail(i);
  }
  gaps.push(run);
  // Always report eight, so the caller can index them without checking
  while (gaps.length < 8) gaps.push(0);
  return gaps.slice(0, 8);
}

/**
 * How much of each gap is spoken for before any delay is emitted.
 *
 * A gap followed by a direct row may have to end with `ld h,n`: a lead-in chunk
 * or a push block in between will have left H holding something other than this
 * character row's attribute line. Which gaps really need it is not known until
 * the lead-in chunks are placed, so every such gap reserves the room, and the
 * ones that turn out not to need it spend it on padding instead.
 *
 * @param {number} r
 * @param {Array<any>} plans
 * @returns {number[]} reserve per gap, indexed as mltAsmGaps()
 */
function mltAsmReserve(r, plans) {
  const reserve = [];
  for (let i = 0; i < 8; i++) {
    const p = plans[r * 8 + i];
    if (i === 0 || p.method === MLT_METHOD.NONE) continue;
    reserve.push(mltAsmUsesPointer(p.method) ? MLT_TIMING.LD_H_N : 0);
  }
  reserve.push(0); // the run after the last block has nothing following it
  return reserve;
}

/**
 * Whether gap `g` can hold what is reserved from it and still leave a delay
 * that can be built exactly.
 * @param {number} room
 * @param {number} reserve
 * @returns {boolean}
 */
function mltAsmGapOk(room, reserve) {
  return room >= reserve && mltAsmPadOk(room - reserve);
}

/**
 * Nudges block placements until every gap is a delay a Z80 can express.
 *
 * Moving one block later by d grows the gap before it by d and shrinks the one
 * after it by the same, so the slack can be walked along the character row until
 * no gap is left at 1, 2, 3 or 5 T-states.
 *
 * @param {number} r
 * @param {Array<any>} plans
 * @param {{h: Int32Array, lo: Int32Array, hi: Int32Array}} place
 * @param {number[]} reserve
 * @returns {boolean} true when every gap ended up expressible
 */
function mltAsmRepairGaps(r, plans, place, reserve) {
  const movable = [];
  for (let i = 1; i < 8; i++) {
    const y = r * 8 + i;
    if (plans[y].method !== MLT_METHOD.NONE) movable.push({ i, y });
  }

  for (let pass = 0; pass < 16; pass++) {
    const gaps = mltAsmGaps(r, plans, place.h);
    let bad = -1;
    for (let g = 0; g < gaps.length; g++) {
      if (!mltAsmGapOk(gaps[g], reserve[g] || 0)) { bad = g; break; }
    }
    if (bad < 0) return true;

    // Smallest amount that makes this gap work, searched rather than derived:
    // the reserve shifts which sizes are reachable
    let need = 1;
    while (need < 16 && !mltAsmGapOk(gaps[bad] + need, reserve[bad] || 0)) need++;
    // Gap g sits before the (g+1)-th block, so that block is the one to move
    // later; failing that, pull the block before it earlier.
    const after = movable[bad];
    const before = movable[bad - 1];
    let moved = false;
    if (after && place.h[after.y] + need <= place.hi[after.y]) {
      place.h[after.y] += need;
      moved = true;
    } else if (before && place.h[before.y] - need >= place.lo[before.y]) {
      place.h[before.y] -= need;
      moved = true;
    }
    if (!moved) return false;
  }
  const finalGaps = mltAsmGaps(r, plans, place.h);
  return finalGaps.every((room, g) => mltAsmGapOk(room, reserve[g] || 0));
}

/**
 * Cuts a lead-in row into chunks that fit the gaps it is given.
 *
 * Each chunk is rebuilt from scratch rather than sliced out of one long block,
 * so it carries its own `ld sp,nn` (or `ld h,n` / `ld l,n`) and its own register
 * loads and depends on nothing the previous chunk left behind. That is the same
 * thing the checker charges for a resume, and it means a chunk boundary can fall
 * anywhere without a correctness argument.
 *
 * @param {Uint8Array} attrs
 * @param {number} y - the lead-in row (y % 8 === 0)
 * @param {any} plan - its mltRowPlan
 * @param {number[]} gaps - the eight free runs of the character row above
 * @returns {{chunks: Array<{index: number, gap: number, ops: MltOp[], preloadOps: MltOp[], cost: number}>, placed: number, total: number}}
 */
function mltAsmSplitLeadIn(attrs, y, plan, gaps) {
  const base = y * MLT_TIMING.CELLS;
  const units = plan.cells.slice();          // pairs (push) or cells (direct)
  const total = units.length;
  const chunks = [];
  let at = 0;

  /** Builds a block for units[from..to), or null when it does not fit `room`. */
  const build = (/** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ room) => {
    const slice = units.slice(from, to);
    if (!slice.length) return null;
    let best = null;
    const total = (/** @type {any} */ b) =>
      b.preload + b.ops.reduce((t, o) => t + o.cost, 0);
    if (plan.method === MLT_METHOD.PUSH) {
      const values = slice.map(p => (attrs[base + p * 2 + 1] << 8) | attrs[base + p * 2]);
      for (const indexFirst of [true, false]) {
        const b = mltBuildPushBlock(slice, values, indexFirst);
        const cost = total(b);
        if (!best || cost < best.cost) best = { ops: b.ops, preloadOps: b.preloadOps, cost };
      }
    } else if (plan.method === MLT_METHOD.MIXED) {
      // Rebuild the chunk the way it was costed, or the code and the number
      // stop being the same thing
      for (const indexFirst of [false, true]) {
        const b = mltBuildMixedBlock(attrs, y, slice, true, indexFirst);
        const cost = total(b);
        if (!best || cost < best.cost) best = { ops: b.ops, preloadOps: b.preloadOps, cost };
      }
    } else {
      const values = slice.map(c => attrs[base + c]);
      const b = mltBuildDirectBlock(slice, values, true);
      best = { ops: b.ops, preloadOps: b.preloadOps, cost: total(b) };
    }
    return best && best.cost <= room ? best : null;
  };

  for (let g = 0; g < gaps.length && at < total; g++) {
    const room = gaps[g];
    // Largest prefix of what is left that still fits this gap. Costs are not
    // linear in the unit count -- a repeated colour is free, a new one is not --
    // so this grows one unit at a time rather than guessing.
    let take = 0;
    let chosen = null;
    for (let n = 1; at + n <= total; n++) {
      const b = build(at, at + n, room);
      if (!b) break;
      // What is left of the gap has to be a delay a Z80 can express, or those
      // T-states simply go missing and the character row comes up short
      if (!mltAsmPadOk(room - b.cost)) continue;
      take = n;
      chosen = b;
    }
    if (!take || !chosen) continue;
    chunks.push({
      index: chunks.length, gap: g,
      ops: chosen.ops, preloadOps: chosen.preloadOps, cost: chosen.cost
    });
    at += take;
  }

  return { chunks, placed: at, total };
}

/**
 * Generates the ASM body for an 8x1 multicolour picture.
 *
 * @param {Uint8Array} attrs - 192 x 32 attribute bytes, row-major
 * @param {string} baseName
 * @param {Uint8Array} [bitmap] - the 6144-byte interleaved bitmap
 * @param {boolean} [embedData=true] - false to INCBIN the .mlt instead of DB lines
 * @param {number} [borderColour=0]
 * @param {string} [fileBase] - name for SAVESNA / INCBIN; defaults to baseName
 * @returns {{asm: string, over: number[], unplaced: number[], ragged: number[], drifted: number[], clock: number, residual: number, tailT: number, dropped: Array<{row: number, cells: number}>}|null}
 */
function generateMltAsm(attrs, baseName, bitmap, embedData, borderColour, fileBase) {
  if (typeof embedData === 'undefined') embedData = true;
  if (typeof borderColour !== 'number') borderColour = 0;
  // baseName has to be a legal label; the file on disk keeps its real name
  if (!fileBase) fileBase = baseName;
  if (!attrs || attrs.length < MLT_ASM.ROWS * MLT_TIMING.CELLS) return null;
  const LINE = MLT_TIMING.LINE_TSTATES;

  const analysis = mltAnalyzePicture(attrs);
  const plans = new Array(MLT_ASM.ROWS);
  for (let y = 0; y < MLT_ASM.ROWS; y++) {
    plans[y] = mltRowPlan(attrs, y, y % 8 !== 0);
  }

  const chosen = mltAsmChoosePhase(plans, analysis);
  if (!chosen) return null;
  const phase = chosen.phase;
  const place = mltAsmPlaceRows(plans, analysis, phase);

  /** Rows the checker says cannot be written in time. */
  const over = [];
  for (let y = 0; y < MLT_ASM.ROWS; y++) if (analysis.over[y]) over.push(y);
  /** Lead-in rows whose chunks did not all fit the gaps above them. */
  const unplaced = [];
  /** Character rows whose gaps could not all be turned into exact delays. */
  const ragged = [];

  const out = [];
  const push = (/** @type {string} */ line) => out.push(line);
  /** Emits one instruction with an aligned trailing comment. */
  const emit = (/** @type {string} */ text, /** @type {string} */ note) => {
    push(note ? '    ' + text.padEnd(28) + '; ' + note : '    ' + text);
  };

  // ------------------------------------------------------------------ header
  const frameT = MLT_ASM.FRAME_LINES * LINE;
  const bodyT = MLT_ASM.ROWS * LINE;
  const intToScreen = MLT_ASM.INT_TO_SCREEN_LINES * LINE + MLT_ASM.ATTR_LATCH_OFFSET;

  push('; ============================================================================');
  push('; 8x1 multicolour (MLT) viewer for Pentagon 128K');
  push('; Generated by SpectraLab v' + APP_VERSION + ' from ' + baseName);
  push('; sjasmplus compatible source');
  push('; ============================================================================');
  push('; Pentagon 128K only: ' + LINE + ' T-states per scanline, ' + MLT_ASM.FRAME_LINES +
       ' lines, ' + frameT + 'T per frame,');
  push('; and no memory contention. On a contended 48K/128K none of this timing holds.');
  push(';');
  push('; Assemble with sjasmplus; it writes ' + fileBase + '.sna, which runs as is.');
  push(';');
  push('; THE ONE NUMBER TO CHECK');
  push(';   MLT_INT_TO_SCREEN is the gap from the interrupt to the moment the ULA');
  push(';   latches the attribute byte for cell 0 of pixel row 0. It is set to');
  push(';   ' + intToScreen + 'T: ' + MLT_ASM.INT_TO_SCREEN_LINES + ' lines x ' + LINE +
       'T (16 of blanking, then a 64-line top border),');
  push(';   plus ' + MLT_ASM.ATTR_LATCH_OFFSET + 'T of left border and blanking within the ' +
       'line -- measured on');
  push(';   hardware, not assumed.');
  push(';   Everything else is derived from it, so if the picture sits a line or two');
  push(';   off on your machine, adjust that equate and nothing else.');
  push(';');
  push('; HOW IT WORKS');
  push(';   The attribute area has 24 rows and the picture wants 192, so the player');
  push(';   rewrites the attribute line the beam is about to read, every scanline, in');
  push(';   step with the beam. The body is ' + MLT_ASM.ROWS + ' slots of exactly ' +
       LINE + ' T, one per pixel');
  push(';   row, in row order; slot y writes row y\'s attributes while the beam is');
  push(';   still on row y-1.');
  push(';');
  push(';   Each row uses whichever is cheaper: pushing whole cell pairs onto the');
  push(';   attribute line, or storing only the cells that changed. One row in eight');
  push(';   starts a new character row, and nothing reads its attribute line while the');
  push(';   beam is in the character row above, so its writes are split into chunks');
  push(';   dropped into the gaps the other seven leave.');
  push(';');
  push(';   Colours travel as immediate operands -- they cannot be fetched fast enough');
  push(';   any other way -- which is why this file is large, and why repeating a');
  push(';   colour within a row is free while each new one costs a register load.');
  push(';');
  push(';   Between frames the loop puts pixel row 0\'s attributes back. At the end of');
  push(';   a frame that line holds row 7, the last thing written to it, so without');
  push(';   the restore every frame after the first would start with the wrong colours.');
  push(';');
  push(';   One HALT catches the interrupt at startup; after that the loop is exactly');
  push(';   ' + frameT + 'T and keeps phase by itself, with interrupts off.');
  push(';');

  if (over.length) {
    push('; !! ' + over.length + ' ROW' + (over.length === 1 ? '' : 'S') +
         ' CANNOT BE WRITTEN IN TIME');
    push(';   Their code is here and marked "OVER BUDGET" where it appears, but the');
    push(';   beam reaches those cells before the writes do, so they show the colours');
    push(';   of the row above. The picture still plays; those lines are wrong.');
    push(';   Rows: ' + over.join(', '));
    push(';   Fix them in SpectraLab (Settings -> Analysis marks them on the border,');
    push(';   File Info says what to change) and export again.');
    push(';');
  } else {
    push('; Every row fits. The whole picture plays in time.');
    push(';');
  }
  push('; ============================================================================');
  push('');
  push('    DEVICE ZXSPECTRUM128');
  push('    ORG #8000');
  push('');
  push(MLT_ASM.ATTR + '          equ #5800   ; attribute area of the displayed screen');
  push('MLT_LINE          equ ' + LINE + '     ; Pentagon scanline');
  push('MLT_FRAME         equ ' + frameT + '   ; ' + MLT_ASM.FRAME_LINES + ' scanlines');
  push('MLT_INT_TO_SCREEN equ ' + intToScreen + '   ; INT -> attribute latch of pixel row 0');
  push('MLT_PHASE         equ ' + phase + '     ; body entry, relative to that latch');
  push('');

  // --------------------------------------------------------------- startup
  push('; ============================================================================');
  push('; Startup');
  push('; ============================================================================');
  push('Start:');
  push('    DI');
  push('    LD SP,#7FFE');
  push('');
  push('    ; Standard 128K paging: bank 0 at #C000, screen bank 5 displayed');
  push('    XOR A');
  push('    LD BC,#7FFD');
  push('    OUT (C),A');
  push('');
  push('    ; The bitmap never changes; only attributes are rewritten per scanline');
  push('    LD HL,' + baseName + '_bitmap');
  push('    LD DE,#4000');
  push('    LD BC,' + (MLT_TIMING.CELLS * 192) + '');
  push('    LDIR');
  push('');
  push('    LD A,' + borderColour + '');
  push('    OUT (#FE),A                   ; border');
  push('');
  push('    ; IM2 vector table at #FE00, handler at #FDFD (EI + RETI)');
  push('    LD HL,#FE00');
  push('    LD DE,#FE01');
  push('    LD BC,256');
  push('    LD (HL),#FD');
  push('    LDIR');
  push('    LD A,#FB');
  push('    LD (#FDFD),A                  ; EI');
  push('    LD A,#ED');
  push('    LD (#FDFE),A                  ; RETI');
  push('    LD A,#4D');
  push('    LD (#FDFF),A');
  push('    LD A,#FE');
  push('    LD I,A');
  push('    IM 2');
  push('');

  // --------------------------------------------------------------- sync
  // From the interrupt: IM2 acknowledge + the handler + the DI below. What is
  // left of the run-up to the body is spent in a counted delay, and the JP that
  // enters the loop is part of it.
  const syncT = intToScreen + phase - MLT_ASM.INT_OVERHEAD - 10;
  const syncLines = mltAsmLongDelay(syncT, 'sync');
  push('; ============================================================================');
  push('; Catch the interrupt once, then run free');
  push('; ============================================================================');
  push('    EI');
  push('    HALT                          ; one-time sync, 0-3T of jitter');
  push('    DI');
  push('');
  push('    ; INT -> body entry = MLT_INT_TO_SCREEN + MLT_PHASE = ' +
       (intToScreen + phase) + 'T');
  push('    ; minus ' + MLT_ASM.INT_OVERHEAD + 'T of interrupt overhead and the 10T JP below');
  if (syncLines) {
    syncLines.forEach((l, i) => {
      if (l.startsWith('.')) push(l);
      else emit(l, i === 0 ? 'delay ' + syncT + 'T' : '');
    });
  } else {
    push('    ; !! ' + syncT + 'T could not be built exactly; adjust MLT_INT_TO_SCREEN');
  }
  push('    JP ' + baseName + '_frame      ; 10T');
  push('');

  // ------------------------------------------------------------------ body
  push('; ============================================================================');
  push('; Frame loop -- exactly ' + frameT + 'T per iteration');
  push('; ============================================================================');
  push(baseName + '_frame:');
  push('; --- body begins (' + bodyT + 'T) ---');

  // T-states emitted so far, and how far behind schedule that leaves us. A row
  // too long for its scanline is the only thing that creates drift; the first
  // gap with slack in it gives the time back.
  let clock = 0;
  let drift = 0;
  /** Attribute line H is known to hold, or -1 when it holds something else. */
  let hLine = -1;
  /** Character rows that were still late when the picture ended. */
  const drifted = [];
  /** Rows whose tail had to be cut off at the slot boundary. */
  const dropped = [];

  for (let r = 0; r < 24; r++) {
    const leadRow = (r + 1) * 8;
    const leadPlan = leadRow < MLT_ASM.ROWS ? plans[leadRow] : null;

    const reserve = mltAsmReserve(r, plans);
    if (!mltAsmRepairGaps(r, plans, place, reserve)) ragged.push(r);
    const gaps = mltAsmGaps(r, plans, place.h);

    const split = (leadPlan && leadPlan.method !== MLT_METHOD.NONE)
      ? mltAsmSplitLeadIn(attrs, leadRow, leadPlan,
          gaps.map((room, g) => Math.max(0, room - (reserve[g] || 0))))
      : { chunks: [], placed: 0, total: 0 };
    if (split.placed < split.total) unplaced.push(leadRow);

    push('');
    push('; ----------------------------------------------------------------------------');
    push('; character row ' + r + '  (pixel rows ' + (r * 8) + '..' + (r * 8 + 7) +
         '), attribute line ' + MLT_ASM.ATTR + '+' + (r * 32));
    if (leadPlan && leadPlan.method !== MLT_METHOD.NONE) {
      push('; lead-in for row ' + leadRow + ' is spread through the gaps below: ' +
           split.chunks.length + ' chunk(s), ' + split.placed + '/' + split.total + ' written');
    }
    push('; ----------------------------------------------------------------------------');

    /**
     * Emits gap g: its lead-in chunks, the delay that is left, and finally the
     * `ld h,n` the block after it needs when H can no longer be trusted. The
     * reload comes out of the gap so the block itself still starts where it was
     * placed; if the gap is too tight for it the body simply runs 7 T late and
     * the next gap with slack gives that back.
     *
     * @param {number} g
     * @param {number} room
     * @param {number} [needH] - attribute line the next block needs in H, or -1
     */
    const emitGap = (/** @type {number} */ g, /** @type {number} */ room, needH) => {
      let used = 0;
      for (const chunk of split.chunks) {
        if (chunk.gap !== g) continue;
        push('');
        push('    ; row ' + leadRow + ' lead-in, chunk ' + (chunk.index + 1) + ' of ' +
             split.chunks.length + ' (' + chunk.cost + 'T) -- written while the beam is');
        push('    ; still in character row ' + r + ', which never reads this attribute line');
        if (analysis.over[leadRow] && chunk.index === 0) {
          push('    ; !! OVER BUDGET: the check rejects row ' + leadRow + '. It budgets a full');
          push('    ; !! reload for every resumed chunk, while the split below reloads only');
          push('    ; !! what each chunk uses -- so this code does fit the gaps it is given.');
          push('    ; !! Verify on hardware before relying on it.');
        }
        if (chunk.index === 0) push(baseName + '_mlt_row' + leadRow + ':');
        for (const op of chunk.preloadOps.concat(chunk.ops)) {
          const t = mltAsmOpText(op, leadRow >> 3);
          emit(t.text, t.note);
        }
        used += chunk.cost;
        clock += chunk.cost;
        // A direct chunk sets H to the next character row's line; a push chunk
        // puts a colour in HL. Either way H is not this row's line any more.
        hLine = mltAsmUsesPointer(leadPlan.method) ? (leadRow >> 3) : -1;
      }

      const fixH = (typeof needH === 'number' && needH >= 0);
      const hCost = fixH ? MLT_TIMING.LD_H_N : 0;

      // Give back as much of the drift as this gap's slack allows, keeping the
      // remaining delay one a Z80 can actually express
      const want = Math.max(0, room - used - hCost);
      let give = Math.min(drift, want);
      while (give > 0 && !mltAsmPadOk(want - give)) give--;
      drift -= give;
      let padT = want - give;
      // Round UP to something expressible, never down: emitting a few T-states
      // too many only makes the next block late, and a later gap takes them
      // back, while emitting too few would put writes ahead of the beam.
      if (!isFinite(padT) || padT < 0) padT = 0;
      for (let guard = 0; !mltAsmPadOk(padT) && guard < 8; guard++) { padT++; drift++; }

      if (padT > 0) {
        const lines = mltAsmPad(padT);
        lines.forEach((l, i) => emit(l, i === 0
          ? 'pad ' + padT + 'T' + (give ? ' (' + give + 'T short, catching up)' : '')
          : ''));
        clock += padT;
      }
      if (fixH) {
        emit('ld h,high (' + MLT_ASM.ATTR + '+' + (needH * 32) + ')',
             'H is no longer attribute line ' + needH);
        clock += hCost;
        hLine = needH;
      }
    };

    // Slots, in code order, with the gaps between the mandatory blocks
    let gapIndex = 0;
    for (let i = 0; i < 8; i++) {
      const y = r * 8 + i;
      const p = plans[y];
      if (i === 0 || p.method === MLT_METHOD.NONE) continue; // its time is part of a gap
      // A direct row writes through HL and only reloads L; H has to be right
      // before it starts, and it is not when a lead-in or a push block has been
      // through since the last direct write to this line.
      const needH = (mltAsmUsesPointer(p.method) && hLine !== r) ? r : -1;
      emitGap(gapIndex, gaps[gapIndex], needH);
      gapIndex++;

      push('');
      push('    ; row ' + y + '  ' + mltAsmMethodName(p.method) +
           '  preload ' + p.preload + 'T + block ' + p.blockCost + 'T = ' + p.cost +
           'T of ' + LINE + 'T   at +' + place.h[y] +
           '  (' + p.changed + ' cell' + (p.changed === 1 ? '' : 's') + ' changed vs row ' + p.prevRow + ')');
      if (analysis.over[y]) {
        if (place.overrun[y] > 0) {
          push('    ; !! OVER BUDGET by ' + place.overrun[y] + 'T -- this row is longer than a');
          push('    ; !! scanline, so it runs into the next one. The following gaps give the');
          push('    ; !! time back, but these cells are written after the beam has passed.');
        } else {
          push('    ; !! OVER BUDGET -- it fits the line but not the beam: these writes land');
          push('    ; !! after the ULA has already read the cells, so they show row ' +
               p.prevRow + '\'s colours.');
        }
      }
      push(baseName + '_mlt_row' + y + ':');

      // Everything the slot can hold. A row that fits uses all of it; one that
      // does not is cut here rather than running into the next slot.
      const room = LINE - place.h[y];
      /** @type {MltOp[]} */
      const kept = [];
      let used = 0, droppedCells = 0;
      for (const op of p.ops) {
        if (used + op.cost <= room) { kept.push(op); used += op.cost; }
        else { droppedCells += op.cells.length; }
      }
      if (droppedCells) {
        dropped.push({ row: y, cells: droppedCells });
        push('    ; !! ' + droppedCells + ' cell write(s) dropped here: they would have run');
        push('    ; !! past the end of this scanline, where the beam has already gone, and');
        push('    ; !! pushed every row after them out of step.');
      }
      for (const op of p.preloadOps.concat(kept)) {
        const t = mltAsmOpText(op, y >> 3);
        emit(t.text, t.note);
      }
      clock += p.preload + used;

      // What the cut left behind has to be spent here, or the slot is short and
      // everything after it runs early
      if (droppedCells) {
        let slack = room - used;
        // Round up to something expressible: a few T-states late is recoverable,
        // early is not
        while (slack > 0 && !mltAsmPadOk(slack)) { slack++; drift++; }
        if (slack > 0) {
          mltAsmPad(slack).forEach((l, i) => emit(l, i === 0 ? 'pad ' + slack + 'T (cut)' : ''));
          clock += slack;
        }
      }
      // Neither method puts a value in HL -- Method M's push bank is BC, DE,
      // IX, IY -- so H still holds this line afterwards
      hLine = mltAsmUsesPointer(p.method) ? r : -1;
    }
    // Everything after the last block of the character row
    emitGap(gapIndex, gaps[gapIndex], -1);

    if (drift > 0) drifted.push(r);
  }
  /** What the body overran a screen by, after every gap had its chance. */
  const residual = clock - bodyT;

  push('; --- body ends (' + clock + 'T emitted, ' + bodyT + 'T expected) ---');
  push('');

  // ----------------------------------------------------------- frame tail
  // Row 0's attribute line currently holds row 7, the last thing written to it.
  // Put row 0 back while the beam is in the border, where nothing reads it.
  const restoreT = 10 + 10 + 10 + (21 * 31 + 16);   // ld hl / ld de / ld bc / ldir
  // `clock` is what the body really came to, which is `bodyT` plus any overrun
  // the gaps could not give back. Closing on that keeps the loop a frame long
  // even when the picture itself does not fit.
  const tailT = frameT - clock - restoreT - 10;      // 10 for the JP back
  const tailLines = tailT >= 0 ? mltAsmLongDelay(tailT, 'tail') : null;

  push('; ----------------------------------------------------------------------------');
  push('; Border and retrace: ' + (frameT - clock) + 'T');
  if (clock !== bodyT) {
    push('; The body ran ' + (clock - bodyT) + 'T over a screen -- rows longer than a');
    push('; scanline that the gaps could not absorb. Taken off the tail here, so the');
    push('; loop is still exactly one frame and the picture does not walk.');
  }
  push('; ----------------------------------------------------------------------------');
  push('    ; Pixel row 0 is written here, not in the body: at this point its');
  push('    ; attribute line still holds row 7 from the frame just drawn.');
  emit('LD HL,' + baseName + '_mlt_row0', 'restore ' + restoreT + 'T');
  emit('LD DE,' + MLT_ASM.ATTR, '');
  emit('LD BC,' + MLT_TIMING.CELLS, '');
  emit('LDIR', '');
  push('');
  if (tailLines) {
    tailLines.forEach((l, i) => {
      if (l.startsWith('.')) push(l);
      else emit(l, i === 0 ? 'delay ' + tailT + 'T' : '');
    });
  } else if (tailT < 0) {
    push('    ; !! The body is ' + (-tailT) + 'T longer than a whole frame. There is');
    push('    ; !! nothing left to delay; this picture cannot play at this size.');
  } else {
    push('    ; !! ' + tailT + 'T could not be built exactly');
  }
  push('    JP ' + baseName + '_frame      ; 10T -- loop is ' + frameT + 'T exactly');
  push('');

  // ----------------------------------------------------------------- data
  push('; ============================================================================');
  push('; Data');
  push('; ============================================================================');
  push('; Pixel row 0\'s 32 attribute bytes, copied into place once per frame');
  push(baseName + '_mlt_row0:');
  if (embedData) {
    push(formatDbLines(Array.from(attrs.slice(0, 32)), 16));
  } else {
    push('    INCBIN "' + fileBase + '.mlt",' + MLT_TIMING.CELLS * 192 + ',' + MLT_TIMING.CELLS);
  }
  push('');
  push('; The bitmap, in the usual ZX interleaved layout, copied to #4000 at startup');
  push(baseName + '_bitmap:');
  if (embedData && bitmap) {
    push(formatDbLines(Array.from(bitmap.slice(0, MLT_TIMING.CELLS * 192)), 16));
  } else {
    push('    INCBIN "' + fileBase + '.mlt",0,' + MLT_TIMING.CELLS * 192);
  }
  push('');
  push('    SAVESNA "' + fileBase + '.sna",Start');

  return { asm: out.join('\n'), over, unplaced, ragged, drifted, clock, residual, tailT, dropped };
}

/**
 * What to call each method in the generated source.
 * @param {number} method
 * @returns {string}
 */
function mltAsmMethodName(method) {
  if (method === MLT_METHOD.PUSH) return 'PUSH ';
  if (method === MLT_METHOD.DIRECT) return 'STORE';
  if (method === MLT_METHOD.MIXED) return 'MIXED';
  return 'NONE ';
}

/**
 * Export entry point: checks the picture is one the model covers, generates the
 * body and says plainly when the result will not play in time.
 */
function exportMltAsm() {
  if (typeof currentPicture !== 'undefined' && currentPicture &&
      typeof syncPictureFromScreenData === 'function' && typeof screenData !== 'undefined') {
    // The editor writes to screenData; the planes can be a repaint behind
    syncPictureFromScreenData(screenData, currentPicture);
  }
  if (!isMltTimingTarget()) {
    alert('ASM export is only available for plain 8x1 multicolour (.mlt) pictures at 256×192.');
    return;
  }
  const attrs = currentPicture.planes[0].attrs;
  // screenData holds the .mlt file layout: interleaved bitmap, then attributes
  const bitmap = (typeof screenData !== 'undefined' && screenData.length >= MLT.BITMAP_SIZE)
    ? screenData.subarray(0, MLT.BITMAP_SIZE) : null;
  const border = (typeof borderColor === 'number') ? borderColor : 0;

  runAsmExport('mlt', (baseName, embed) => {
    const safe = baseName.replace(/[^A-Za-z0-9_]/g, '_') || 'mlt';
    const result = generateMltAsm(attrs, safe, bitmap, embed && !!bitmap, border, baseName);
    if (!result) {
      alert('Could not generate the player body for this picture.');
      return null;
    }

    const notes = [];
    if (result.over.length) {
      notes.push(result.over.length + ' row' + (result.over.length === 1 ? '' : 's') +
        ' cannot be written in time on Pentagon:\n  ' + mltAsmRowList(result.over) +
        '\n\nTheir code is in the file and marked "OVER BUDGET", but the beam reaches ' +
        'those cells first, so they will show the previous row\'s colours.');
    }
    if (result.unplaced.length) {
      notes.push('The first row of ' + result.unplaced.length + ' character row' +
        (result.unplaced.length === 1 ? '' : 's') + ' did not fit the spare time above it:\n  ' +
        mltAsmRowList(result.unplaced));
    }
    if (result.dropped.length) {
      const cells = result.dropped.reduce((t, d) => t + d.cells, 0);
      notes.push(cells + ' cell write(s) across ' + result.dropped.length + ' row(s) were cut: ' +
        'they would have run past the end of their scanline. The beam has already passed ' +
        'those cells, so they were lost either way \u2014 cutting them keeps every other row ' +
        'in step.\n  Rows: ' + mltAsmRowList(result.dropped.map(d => d.row)));
    }
    if (result.drifted.length) {
      notes.push('Rows longer than a scanline pushed the body late in character row' +
        (result.drifted.length === 1 ? ' ' : 's ') + mltAsmRowList(result.drifted) +
        '. The gaps after them give the time back where there is room' +
        (result.residual > 0
          ? ', and the ' + result.residual + 'T still outstanding at the end comes off the border delay'
          : '') + '.');
    }
    if (result.tailT < 0) {
      notes.push('The body is ' + (-result.tailT) + 'T longer than a whole Pentagon frame. ' +
        'This picture cannot be played at all as it stands.');
    }
    if (result.ragged.length) {
      notes.push('Character row' + (result.ragged.length === 1 ? '' : 's') + ' ' +
        mltAsmRowList(result.ragged) + ' could not be padded to an exact line length.');
    }
    if (notes.length) {
      alert('Exported with warnings.\n\n' + notes.join('\n\n') +
        '\n\nTurn on Settings → Analysis → multicolour timing to see the rows on the ' +
        'border, and File Info will say what to change.');
    }
    return { asm: result.asm };
  });
}

/**
 * Formats a row list for a dialog, keeping it to one readable line.
 * @param {number[]} rows
 * @returns {string}
 */
function mltAsmRowList(rows) {
  if (rows.length <= 12) return rows.join(', ');
  return rows.slice(0, 12).join(', ') + ' and ' + (rows.length - 12) + ' more';
}
