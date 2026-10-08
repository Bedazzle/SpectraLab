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
  SHADOW: 'MLT_SHADOW',
  /** Port 0x7FFD, reached as #0FFD / #07FD via `out (n),a`. */
  PAGE_PORT: '#fd',
  /** bank 7 at 0xC000, display from bank 5 / from bank 7. */
  PAGE_A: 0x07,
  PAGE_B: 0x0f,
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
 * The two instructions that put one screen or the other on the display.
 *
 * `out (n),a` drives A onto the high half of the address bus, so A = #0F gives
 * #0FFD: A15 is 0 and A1 is 0, which is what decodes 0x7FFD, and the same byte
 * is the paging value. 18T the pair.
 *
 * @param {boolean} toShadow - true to show bank 7, false to show bank 5
 * @returns {{lines: string[], cost: number}}
 */
function mltAsmFlip(toShadow) {
  const v = toShadow ? MLT_ASM.PAGE_B : MLT_ASM.PAGE_A;
  // Body style, lower case with an upper-case hex pair, the same as every other
  // instruction in the frame loop
  return {
    lines: ['ld a,' + mltAsmHex2(v), 'out (' + MLT_ASM.PAGE_PORT + '),a'],
    cost: MLT_TIMING.LD_R_N + 11
  };
}

/**
 * When each flip has to happen, in character-row-local CODE time.
 *
 * A row's attributes are read over the first 128T of its scanline, so between
 * one row's last read and the next row's first there are 96T in which the
 * display may change without anything seeing it half-done. The flip to the
 * shadow screen goes in the window before the served row, the flip back in the
 * window before the row after it.
 *
 * @param {number} r - character row
 * @param {Uint8Array|null} served - 1 where a row is shown from the shadow screen
 * @param {number} phase - code clock against the ULA clock
 * @returns {Array<{at: number, until: number, toShadow: boolean, row: number}>}
 */
function mltAsmFlipTimes(r, served, phase) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  const READ = MLT_TIMING.CELLS * 4;        // 32 cells latched 4T apart
  /** @type {Array<{at: number, until: number, toShadow: boolean, row: number}>} */
  const events = [];
  if (!served) return events;
  for (let i = 0; i < 8; i++) {
    const y = r * 8 + i;
    if (!served[y]) continue;
    // show B: after row y-1's reads, before row y's
    events.push({ at: (i - 1) * LINE + READ - phase, until: i * LINE - phase,
                  toShadow: true, row: y });
    // and back to A before the row below is read
    events.push({ at: i * LINE + READ - phase, until: (i + 1) * LINE - phase,
                  toShadow: false, row: y });
  }
  events.sort((a, b) => a.at - b.at);
  return events;
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
      // `lo` is a cell, not a pair index: a run may be pushed at either
      // alignment, so this address can be odd
      return { text: 'ld sp,' + at(op.lo + 2), note: 'write down from cell ' + (op.lo + 1) };
    case 'exx':
      return { text: 'exx', note: 'swap register sets' };
    case 'ld16':
      return {
        text: 'ld ' + op.reg + ',' + mltAsmHex4(op.value),
        note: mltAsmHex2(op.value & 0xff) + ' then ' + mltAsmHex2(op.value >> 8)
      };
    case 'push':
      return { text: 'push ' + op.reg, note: 'cells ' + op.lo + ',' + (op.lo + 1) };
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
 * @returns {{phase: number, slack: number}|null}
 */
function mltAsmChoosePhase(plans) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  let best = null;
  for (let phase = -2 * LINE; phase <= LINE; phase++) {
    let ok = true;
    let slack = Infinity;
    for (let y = 1; y < MLT_ASM.ROWS && ok; y++) {
      if (y % 8 === 0) continue;              // lead-in: written with no deadline
      const p = plans[y];
      if (p.method === MLT_METHOD.NONE) continue;
      // A row the beam cannot accept in any order has no legal placement at any
      // phase, so letting it vote would only spoil the rows that do have one.
      // Judged from the plan alone, NOT from the analysis: the analysis needs a
      // placement, a placement needs a phase, and a phase cannot need the
      // analysis as well or the three can never be made to agree.
      if (!p.ok) continue;
      // The checker pools time across a character row, so a row it passes may be
      // longer than a scanline. The emitter still works in slots, so such a row
      // cannot be placed inside one and must not veto the phase for the rest;
      // mltAsmPlaceRows() reports it as an overrun.
      if (p.cost > LINE) continue;
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
 * Where each interior row's block sits on its character row's clock.
 *
 * The seven interior rows are one continuous run of code, so a block is placed
 * as early as its own ULA window and the block before it allow, and may run past
 * its own scanline wherever the next row starts late enough. Positions are
 * character-row-local: 0 is the first T-state of pixel row 8r.
 *
 * `lo` and `hi` are how far the block may still be nudged without breaking the
 * beam or colliding with its neighbours.
 *
 * @param {Array<any>} plans
 * @param {{over: Uint8Array}} analysis
 * @param {number} phase
 * @returns {{h: Int32Array, lo: Int32Array, hi: Int32Array, room: Int32Array, overrun: Int32Array, ragged: number[]}}
 */
function mltAsmPlaceRows(plans, judged, phase) {
  return mltPlaceRows(plans, phase);
}

/**
 * The free runs inside one character row.
 *
 * One gap before every block and one after the last, measured on the character
 * row's own clock. A block that runs past its scanline simply leaves a smaller
 * gap behind it; there is no slot boundary left for it to cross.
 *
 * @param {number} r - character row 0..23
 * @param {Array<any>} plans
 * @param {Int32Array} h - character-row-local start of each row's writes
 * @returns {number[]} eight entries, so the caller can index without checking
 */
function mltAsmGaps(r, plans, h) {
  const LINE = MLT_TIMING.LINE_TSTATES;
  /** @type {number[]} */
  const gaps = [];
  let prevEnd = 0;
  for (let i = 1; i < 8; i++) {
    const y = r * 8 + i;
    const p = plans[y];
    if (p.method === MLT_METHOD.NONE) continue;   // its time belongs to a gap
    gaps.push(h[y] - p.preload - prevEnd);
    prevEnd = h[y] + p.blockCost;
  }
  gaps.push(8 * LINE - prevEnd);
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
  const units = plan.cells.slice();          // low cells (push) or cells (direct)
  const total = units.length;
  /** Builds a block for units[from..to), or null when it does not fit `room`. */
  const build = (/** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ room) => {
    const slice = units.slice(from, to);
    if (!slice.length) return null;
    let best = null;
    const total = (/** @type {any} */ b) =>
      b.preload + b.ops.reduce((t, o) => t + o.cost, 0);
    if (plan.method === MLT_METHOD.PUSH) {
      // `slice` holds low CELLS now, not pair indices, so the alignment the
      // row chose carries through to the lead-in chunks unchanged
      const values = slice.map(lo => (attrs[base + lo + 1] << 8) | attrs[base + lo]);
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

  /**
   * Fills from `startGap` onwards, leaving earlier gaps alone.
   * @param {number} startGap
   * @returns {{chunks: Array<any>, placed: number}}
   */
  const fillFrom = (startGap) => {
  const chunks = [];
  let at = 0;
  for (let g = startGap; g < gaps.length && at < total; g++) {
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
  return { chunks, placed: at };
  };

  // Starting in the first gap that happens to hold something is not always best:
  // a chunk there costs a whole preload and may carry only a unit or two, while
  // the same preload spent in a roomier gap later carries far more. Try each
  // starting point and keep whichever writes the most of the row.
  let best = { chunks: [], placed: -1 };
  for (let f = 0; f < gaps.length; f++) {
    const got = fillFrom(f);
    if (got.placed > best.placed) best = got;
    if (best.placed >= total) break;
  }
  return { chunks: best.chunks, placed: Math.max(0, best.placed), total };
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
function generateMltAsm(attrs, baseName, bitmap, embedData, borderColour, fileBase,
                        dropServed) {
  if (typeof embedData === 'undefined') embedData = true;
  if (typeof borderColour !== 'number') borderColour = 0;
  // baseName has to be a legal label; the file on disk keeps its real name
  if (!fileBase) fileBase = baseName;
  if (!attrs || attrs.length < MLT_ASM.ROWS * MLT_TIMING.CELLS) return null;
  const LINE = MLT_TIMING.LINE_TSTATES;

  const analysis = mltAnalyzePicture(attrs);
  // Rows the player shows from bank 7 instead of writing. Absent unless the
  // shadow screen is switched on and it actually cost fewer rows.
  // Rows a previous attempt could not flip in time are given up: a row shown
  // from bank 7 for only part of its line is worse than one written to A.
  let served = analysis.served ? analysis.served.slice() : null;
  if (served && dropServed) {
    for (const y of dropServed) served[y] = 0;
    let any = 0;
    for (let y = 1; y < MLT_ASM.ROWS; y++) any += served[y];
    if (!any) served = null;
  }
  // What screen A has to write. Where a row is shown from bank 7, A writes
  // nothing for it, and the row below diffs against the row above -- which is
  // what A goes on holding. The real colours stay in `attrs`, and that is what
  // the shadow lines are built from.
  const plane = served ? mltShadowPlane(attrs, served) : attrs;
  // The verdict has to describe the plane the player is really built from. After
  // a retry has given up a row, the shadow analysis is about a program that is no
  // longer being emitted -- it reported 25 rows for code that failed on 30.
  const judged = (plane === attrs) ? mltAnalyzeAlignments(attrs) : mltAnalyzeAlignments(plane);
  const plans = new Array(MLT_ASM.ROWS);
  for (let y = 0; y < MLT_ASM.ROWS; y++) {
    plans[y] = mltRowPlan(plane, y, y % 8 !== 0);
  }

  const chosen = mltAsmChoosePhase(plans);
  if (!chosen) return null;
  const phase = chosen.phase;
  const place = mltAsmPlaceRows(plans, judged, phase);

  /** Rows the checker says cannot be written in time. */
  const over = [];
  for (let y = 0; y < MLT_ASM.ROWS; y++) if (judged.over[y]) over.push(y);
  /** Lead-in rows whose chunks did not all fit the gaps above them. */
  const unplaced = [];
  /** Character rows whose gaps could not all be turned into exact delays. */
  const ragged = place.ragged;

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
  if (served) {
    push(MLT_ASM.SHADOW + '        equ #d800   ; the same, in bank 7 paged at #c000');
  }
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
  /** Display changes no gap could hold, which would show the wrong screen. */
  const flipsMissed = [];
  /** Where the body stood against the clock at the end of each character row. */
  const driftTrace = [];
  // Every display change the frame needs, in absolute code time and earliest
  // first. One list for the whole frame rather than one per character row: a
  // served row at the top of a character row has to be flipped TO during the
  // character row above, and a per-row list never offered that window to anyone.
  /** @type {Array<{at:number, until:number, toShadow:boolean, row:number}>} */
  const flipEvents = [];
  for (let fr = 0; fr < 24; fr++) {
    const top = fr * 8 * MLT_TIMING.LINE_TSTATES;
    for (const ev of mltAsmFlipTimes(fr, served, phase)) {
      flipEvents.push({ at: top + ev.at, until: top + ev.until,
                        toShadow: ev.toShadow, row: ev.row });
    }
  }
  flipEvents.sort((a, b) => a.at - b.at);
  let flipNext = 0;

  for (let r = 0; r < 24; r++) {
    const leadRow = (r + 1) * 8;
    const leadPlan = leadRow < MLT_ASM.ROWS ? plans[leadRow] : null;

    const reserve = mltAsmReserve(r, plans);
    const gaps = mltAsmGaps(r, plans, place.h);

    const split = (leadPlan && leadPlan.method !== MLT_METHOD.NONE)
      ? mltAsmSplitLeadIn(plane, leadRow, leadPlan,
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
        if (judged.over[leadRow] && chunk.index === 0) {
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

      // Flips due inside this delay replace part of it. The gap keeps its total
      // length, so every block after it stays where the placement put it.
      while (flipNext < flipEvents.length) {
        const ev = flipEvents[flipNext];
        const from = ev.at;
        const until = ev.until;
        if (until < clock) {                    // the window has gone by
          flipsMissed.push(ev);
          flipNext++;
          continue;
        }
        if (from > clock + padT) break;         // later than this gap reaches
        const f = mltAsmFlip(ev.toShadow);
        let pre = Math.max(0, from - clock);
        let placed = false;
        // As early in the window as the gap allows, then later a few T at a
        // time until both halves are delays that can actually be built
        for (let k = 0; k <= 32 && pre + f.cost <= padT; k++, pre++) {
          if (clock + pre + f.cost > until) break;
          if (mltAsmPadOk(pre) && mltAsmPadOk(padT - pre - f.cost)) { placed = true; break; }
        }
        if (!placed) break;
        if (pre > 0) {
          mltAsmPad(pre).forEach((l, i) => emit(l, i === 0 ? 'delay ' + pre + 'T' : ''));
        }
        f.lines.forEach((l, i) => emit(l, i === 0
          ? 'show ' + (ev.toShadow ? 'bank 7' : 'bank 5') + ' for pixel row ' + ev.row
          : ''));
        clock += pre + f.cost;
        padT -= pre + f.cost;
        flipNext++;
      }

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
           'T   at +' + place.h[y] + 'T of the character row' +
           '  (' + p.changed + ' cell' + (p.changed === 1 ? '' : 's') + ' changed vs row ' + p.prevRow + ')');
      if (judged.over[y]) {
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

      // Everything there is before the next block has to start. A row that fits
      // uses what it needs; one that does not is cut rather than pushing the
      // rest of the character row out of step.
      const room = place.room[y];
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
        push('    ; !! into the next block, where the beam has already gone, and pushed');
        push('    ; !! every row after them out of step.');
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

    // How far behind the clock this character row left us. `drift` is what the
    // gaps give back, a few T at a time, and nothing was ever feeding the real
    // overrun into it -- so a character row that ran long left the body late for
    // the rest of the frame. Enot stayed 193T behind from row 19 to the end,
    // writing rows the check had passed after the beam had read them.
    drift = Math.max(0, clock - (r + 1) * 8 * LINE);
    if (drift > 0) drifted.push(r);
    driftTrace.push({ r, clock, nominal: (r + 1) * 8 * MLT_TIMING.LINE_TSTATES, drift });
  }
  /** What the body overran a screen by, after every gap had its chance. */
  const residual = clock - bodyT;

  push('; --- body ends (' + clock + 'T emitted, ' + bodyT + 'T expected) ---');
  push('');

  // ----------------------------------------------------------- frame tail
  // Row 0's attribute line currently holds row 7, the last thing written to it.
  // Put row 0 back while the beam is in the border, where nothing reads it.
  const restoreT = 10 + 10 + 10 + (21 * 31 + 16);   // ld hl / ld de / ld bc / ldir
  // The shadow screen's lines, rebuilt every frame while the beam is outside the
  // picture. Long-hand rather than copied: the border has 28672T and this costs
  // about 450T a line, which the picture never sees.
  /** @type {string[]} */
  const shadowLines = [];
  let shadowT = 0;
  if (served) {
    for (let y = 1; y < MLT_ASM.ROWS; y++) {
      if (!served[y]) continue;
      const cr = y >> 3;
      shadowLines.push('    ; pixel row ' + y + ' is shown from bank 7, so its colours');
      shadowLines.push('    ; are built here, in the border, where nothing reads them');
      shadowLines.push('    ld h,high (' + MLT_ASM.SHADOW + '+' + (cr * 32) + ')');
      shadowLines.push('    ld l,low (' + MLT_ASM.SHADOW + '+' + (cr * 32) + ')');
      shadowT += MLT_TIMING.LD_H_N + MLT_TIMING.LD_L_N;
      for (let c = 0; c < MLT_TIMING.CELLS; c++) {
        if (c) { shadowLines.push('    inc l'); shadowT += MLT_TIMING.INC_L; }
        shadowLines.push('    ld (hl),' + mltAsmHex2(attrs[y * MLT_TIMING.CELLS + c]));
        shadowT += MLT_TIMING.LD_HL_N;
      }
    }
  }
  // `clock` is what the body really came to, which is `bodyT` plus any overrun
  // the gaps could not give back. Closing on that keeps the loop a frame long
  // even when the picture itself does not fit.
  const tailT = frameT - clock - restoreT - shadowT - 10;  // 10 for the JP back
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
  if (shadowLines.length) {
    push('    ; --- shadow screen, rebuilt every frame (' + shadowT + 'T) ---');
    shadowLines.forEach(l => push(l));
    push('');
  }
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

  // A flip with nowhere to go means that row would show the wrong screen for
  // part of its line. Give the row up and lay the frame out again without it.
  if (flipsMissed.length) {
    const give = new Set(dropServed || []);
    for (const f of flipsMissed) give.add(f.row);
    if (give.size > (dropServed ? dropServed.length : 0) && give.size <= 24) {
      return generateMltAsm(attrs, baseName, bitmap, embedData, borderColour, fileBase,
        Array.from(give));
    }
  }
  return { asm: out.join('\n'), over, unplaced, ragged, drifted, clock, residual,
    tailT, dropped, flipsMissed, served, driftTrace };
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
    // Rows the beam will beat are a different thing from the other warnings:
    // the file still assembles and still runs, and the only sign that anything
    // is wrong is the picture itself. So ask, and default to not writing it.
    const wrongRows = result.over.length + result.unplaced.length +
      result.dropped.length;
    if (wrongRows) {
      const ok = confirm('This picture does not fit a Pentagon frame.\n\n' +
        notes.join('\n\n') +
        '\n\nThe file will assemble and run, but those rows will show the wrong ' +
        'colours, and nothing in the player says so.\n\n' +
        'Press M to mark them on the border; File Info says what to change.\n\n' +
        'Export it anyway?');
      if (!ok) return null;
    } else if (notes.length) {
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
