// @ts-check
"use strict";

/**
 * ZGS Editor — ZX Graphics Script text editor with live preview.
 * Supports .zgs (binary) and .zgt (text) formats.
 */

// =============================================================================
// Constants & Palette
// =============================================================================

const ZGS_SCREEN_W = 256;
const ZGS_SCREEN_H = 192;

const ZX_NORMAL = [
  [0, 0, 0], [0, 0, 192], [192, 0, 0], [192, 0, 192],
  [0, 192, 0], [0, 192, 192], [192, 192, 0], [192, 192, 192],
];
const ZX_BRIGHT = [
  [0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255],
  [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255],
];

const ZGS_DEFAULT_PATTERNS = [
  [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF], // 0 solid
  [0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD], // 1 dots75
  [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55], // 2 checker
  [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22], // 3 dots 25%
  [0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00], // 4 dots 12%
  [0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00], // 5 horizontal
  [0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA], // 6 vertical
  [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81], // 7 diagonal
];

const ZGS_COLOUR_NAMES = ['black', 'blue', 'red', 'magenta', 'green', 'cyan', 'yellow', 'white'];
const ZGS_COLOUR_MAP = {};
ZGS_COLOUR_NAMES.forEach((n, i) => { ZGS_COLOUR_MAP[n] = i; });

const ZGS_PATTERN_NAMES = ['solid', 'dots75', 'checker', 'dots25', 'dots12', 'horizontal', 'vertical', 'diagonal'];

const ZGS_OPCODE_LIMIT = 1000000;

/** Map of absolute-coordinate mnemonics to their X and Y argument indices (0-based).
 *  Used for simple comma-separated argument instructions. */
const ZGS_NUDGE_MAP = {
  'move_abs':           { x: 0, y: 1 },
  'dot_abs':            { x: 0, y: 1 },
  'hline_abs':          { x: 0, y: 1 },
  'vline_abs':          { x: 0, y: 1 },
  'rect_outline_abs':   { x: 0, y: 1 },
  'rect_fill_abs':      { x: 0, y: 1 },
  'circle_outline_abs': { x: 0, y: 1 },
  'circle_fill_abs':    { x: 0, y: 1 },
  'ellipse_outline_abs': { x: 0, y: 1 },
  'ellipse_fill_abs':  { x: 0, y: 1 },
  'flood_abs':          { x: 0, y: 1 },
  'stamp_abs':          { x: 1, y: 2 },
};

/** Map of space-separated pair-format mnemonics.
 *  Each comma-separated group is split by whitespace into numbers.
 *  x/y are the indices within each group to nudge. */
const ZGS_NUDGE_PAIR_MAP = {
  'dot_batch':          { x: 0, y: 1 },
  'polygon_outline':    { x: 0, y: 1 },
  'polygon_fill':       { x: 0, y: 1 },
  'rect_outline_batch': { x: 0, y: 1 },
  'rect_fill_batch':    { x: 0, y: 1 },
};

// 6×8 font — derived from ROM font by shifting each byte left by 1 bit into bits 7-2.
// Characters Y and © are hand-crafted since they use bit 7 in the original ROM.
// Used for 42-column text mode (6 pixels per character).
const ZGS_FONT_6X8 = new Uint8Array([
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x20,0x20,0x20,0x20,0x00,0x20,0x00,
  0x00,0x48,0x48,0x00,0x00,0x00,0x00,0x00,0x00,0x48,0xfc,0x48,0x48,0xfc,0x48,0x00,
  0x00,0x10,0x7c,0x50,0x7c,0x14,0x7c,0x10,0x00,0xc4,0xc8,0x10,0x20,0x4c,0x8c,0x00,
  0x00,0x20,0x50,0x20,0x54,0x88,0x74,0x00,0x00,0x10,0x20,0x00,0x00,0x00,0x00,0x00,
  0x00,0x08,0x10,0x10,0x10,0x10,0x08,0x00,0x00,0x40,0x20,0x20,0x20,0x20,0x40,0x00,
  0x00,0x00,0x28,0x10,0x7c,0x10,0x28,0x00,0x00,0x00,0x10,0x10,0x7c,0x10,0x10,0x00,
  0x00,0x00,0x00,0x00,0x00,0x10,0x10,0x20,0x00,0x00,0x00,0x00,0x7c,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x30,0x30,0x00,0x00,0x00,0x04,0x08,0x10,0x20,0x40,0x00,
  0x00,0x78,0x8c,0x94,0xa4,0xc4,0x78,0x00,0x00,0x30,0x50,0x10,0x10,0x10,0x7c,0x00,
  0x00,0x78,0x84,0x04,0x78,0x80,0xfc,0x00,0x00,0x78,0x84,0x18,0x04,0x84,0x78,0x00,
  0x00,0x10,0x30,0x50,0x90,0xfc,0x10,0x00,0x00,0xfc,0x80,0xf8,0x04,0x84,0x78,0x00,
  0x00,0x78,0x80,0xf8,0x84,0x84,0x78,0x00,0x00,0xfc,0x04,0x08,0x10,0x20,0x20,0x00,
  0x00,0x78,0x84,0x78,0x84,0x84,0x78,0x00,0x00,0x78,0x84,0x84,0x7c,0x04,0x78,0x00,
  0x00,0x00,0x00,0x20,0x00,0x00,0x20,0x00,0x00,0x00,0x20,0x00,0x00,0x20,0x20,0x40,
  0x00,0x00,0x08,0x10,0x20,0x10,0x08,0x00,0x00,0x00,0x00,0x7c,0x00,0x7c,0x00,0x00,
  0x00,0x00,0x20,0x10,0x08,0x10,0x20,0x00,0x00,0x78,0x84,0x08,0x10,0x00,0x10,0x00,
  0x00,0x78,0x94,0xac,0xbc,0x80,0x78,0x00,0x00,0x78,0x84,0x84,0xfc,0x84,0x84,0x00,
  0x00,0xf8,0x84,0xf8,0x84,0x84,0xf8,0x00,0x00,0x78,0x84,0x80,0x80,0x84,0x78,0x00,
  0x00,0xf0,0x88,0x84,0x84,0x88,0xf0,0x00,0x00,0xfc,0x80,0xf8,0x80,0x80,0xfc,0x00,
  0x00,0xfc,0x80,0xf8,0x80,0x80,0x80,0x00,0x00,0x78,0x84,0x80,0x9c,0x84,0x78,0x00,
  0x00,0x84,0x84,0xfc,0x84,0x84,0x84,0x00,0x00,0x7c,0x10,0x10,0x10,0x10,0x7c,0x00,
  0x00,0x04,0x04,0x04,0x84,0x84,0x78,0x00,0x00,0x88,0x90,0xe0,0x90,0x88,0x84,0x00,
  0x00,0x80,0x80,0x80,0x80,0x80,0xfc,0x00,0x00,0x84,0xcc,0xb4,0x84,0x84,0x84,0x00,
  0x00,0x84,0xc4,0xa4,0x94,0x8c,0x84,0x00,0x00,0x78,0x84,0x84,0x84,0x84,0x78,0x00,
  0x00,0xf8,0x84,0x84,0xf8,0x80,0x80,0x00,0x00,0x78,0x84,0x84,0xa4,0x94,0x78,0x00,
  0x00,0xf8,0x84,0x84,0xf8,0x88,0x84,0x00,0x00,0x78,0x80,0x78,0x04,0x84,0x78,0x00,
  0x00,0xfc,0x20,0x20,0x20,0x20,0x20,0x00,0x00,0x84,0x84,0x84,0x84,0x84,0x78,0x00,
  0x00,0x84,0x84,0x84,0x84,0x48,0x30,0x00,0x00,0x84,0x84,0x84,0x84,0xb4,0x48,0x00,
  0x00,0x84,0x48,0x30,0x30,0x48,0x84,0x00,0x00,0x88,0x50,0x20,0x20,0x20,0x20,0x00,
  0x00,0xfc,0x08,0x10,0x20,0x40,0xfc,0x00,0x00,0x1c,0x10,0x10,0x10,0x10,0x1c,0x00,
  0x00,0x00,0x80,0x40,0x20,0x10,0x08,0x00,0x00,0xe0,0x20,0x20,0x20,0x20,0xe0,0x00,
  0x00,0x20,0x70,0xa8,0x20,0x20,0x20,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xfc,
  0x00,0x38,0x44,0xf0,0x40,0x40,0xfc,0x00,0x00,0x00,0x70,0x08,0x78,0x88,0x78,0x00,
  0x00,0x40,0x40,0x78,0x44,0x44,0x78,0x00,0x00,0x00,0x38,0x40,0x40,0x40,0x38,0x00,
  0x00,0x08,0x08,0x78,0x88,0x88,0x78,0x00,0x00,0x00,0x70,0x88,0xf0,0x80,0x78,0x00,
  0x00,0x18,0x20,0x30,0x20,0x20,0x20,0x00,0x00,0x00,0x78,0x88,0x88,0x78,0x08,0x70,
  0x00,0x80,0x80,0xf0,0x88,0x88,0x88,0x00,0x00,0x20,0x00,0x60,0x20,0x20,0x70,0x00,
  0x00,0x08,0x00,0x08,0x08,0x08,0x48,0x30,0x00,0x40,0x50,0x60,0x60,0x50,0x48,0x00,
  0x00,0x20,0x20,0x20,0x20,0x20,0x18,0x00,0x00,0x00,0xd0,0xa8,0xa8,0xa8,0xa8,0x00,
  0x00,0x00,0xf0,0x88,0x88,0x88,0x88,0x00,0x00,0x00,0x70,0x88,0x88,0x88,0x70,0x00,
  0x00,0x00,0xf0,0x88,0x88,0xf0,0x80,0x80,0x00,0x00,0x78,0x88,0x88,0x78,0x08,0x0c,
  0x00,0x00,0x38,0x40,0x40,0x40,0x40,0x00,0x00,0x00,0x70,0x80,0x70,0x08,0xf0,0x00,
  0x00,0x20,0x70,0x20,0x20,0x20,0x18,0x00,0x00,0x00,0x88,0x88,0x88,0x88,0x70,0x00,
  0x00,0x00,0x88,0x88,0x50,0x50,0x20,0x00,0x00,0x00,0x88,0xa8,0xa8,0xa8,0x50,0x00,
  0x00,0x00,0x88,0x50,0x20,0x50,0x88,0x00,0x00,0x00,0x88,0x88,0x88,0x78,0x08,0x70,
  0x00,0x00,0xf8,0x10,0x20,0x40,0xf8,0x00,0x00,0x1c,0x10,0x60,0x10,0x10,0x1c,0x00,
  0x00,0x10,0x10,0x10,0x10,0x10,0x10,0x00,0x00,0xe0,0x20,0x18,0x20,0x20,0xe0,0x00,
  0x00,0x28,0x50,0x00,0x00,0x00,0x00,0x00,0x78,0x84,0xb4,0xa4,0xa4,0xb4,0x84,0x78,
]);

// 4×8 condensed font — derived from ROM font by OR-ing each pair of columns.
// output_bit[n] = (input_bit[2n] | input_bit[2n+1]) for n=0..3, stored left-aligned in top nibble.
// Used for 64-column text mode (4 pixels per character).
const ZGS_FONT_4X8 = new Uint8Array([
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x40,0x40,0x40,0x40,0x00,0x40,0x00,
  0x00,0x60,0x60,0x00,0x00,0x00,0x00,0x00,0x00,0x60,0xf0,0x60,0x60,0xf0,0x60,0x00,
  0x00,0x20,0x70,0x60,0x70,0x30,0x70,0x20,0x00,0xd0,0xe0,0x20,0x40,0x70,0xb0,0x00,
  0x00,0x40,0x60,0x40,0x70,0xa0,0x70,0x00,0x00,0x20,0x40,0x00,0x00,0x00,0x00,0x00,
  0x00,0x20,0x20,0x20,0x20,0x20,0x20,0x00,0x00,0x40,0x40,0x40,0x40,0x40,0x40,0x00,
  0x00,0x00,0x60,0x20,0x70,0x20,0x60,0x00,0x00,0x00,0x20,0x20,0x70,0x20,0x20,0x00,
  0x00,0x00,0x00,0x00,0x00,0x20,0x20,0x40,0x00,0x00,0x00,0x00,0x70,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x60,0x60,0x00,0x00,0x00,0x10,0x20,0x20,0x40,0x40,0x00,
  0x00,0x60,0xb0,0xb0,0xd0,0xd0,0x60,0x00,0x00,0x60,0x60,0x20,0x20,0x20,0x70,0x00,
  0x00,0x60,0x90,0x10,0x60,0x80,0xf0,0x00,0x00,0x60,0x90,0x20,0x10,0x90,0x60,0x00,
  0x00,0x20,0x60,0x60,0xa0,0xf0,0x20,0x00,0x00,0xf0,0x80,0xe0,0x10,0x90,0x60,0x00,
  0x00,0x60,0x80,0xe0,0x90,0x90,0x60,0x00,0x00,0xf0,0x10,0x20,0x20,0x40,0x40,0x00,
  0x00,0x60,0x90,0x60,0x90,0x90,0x60,0x00,0x00,0x60,0x90,0x90,0x70,0x10,0x60,0x00,
  0x00,0x00,0x00,0x40,0x00,0x00,0x40,0x00,0x00,0x00,0x40,0x00,0x00,0x40,0x40,0x40,
  0x00,0x00,0x20,0x20,0x40,0x20,0x20,0x00,0x00,0x00,0x00,0x70,0x00,0x70,0x00,0x00,
  0x00,0x00,0x40,0x20,0x20,0x20,0x40,0x00,0x00,0x60,0x90,0x20,0x20,0x00,0x20,0x00,
  0x00,0x60,0xb0,0xf0,0xf0,0x80,0x60,0x00,0x00,0x60,0x90,0x90,0xf0,0x90,0x90,0x00,
  0x00,0xe0,0x90,0xe0,0x90,0x90,0xe0,0x00,0x00,0x60,0x90,0x80,0x80,0x90,0x60,0x00,
  0x00,0xe0,0xa0,0x90,0x90,0xa0,0xe0,0x00,0x00,0xf0,0x80,0xe0,0x80,0x80,0xf0,0x00,
  0x00,0xf0,0x80,0xe0,0x80,0x80,0x80,0x00,0x00,0x60,0x90,0x80,0xb0,0x90,0x60,0x00,
  0x00,0x90,0x90,0xf0,0x90,0x90,0x90,0x00,0x00,0x70,0x20,0x20,0x20,0x20,0x70,0x00,
  0x00,0x10,0x10,0x10,0x90,0x90,0x60,0x00,0x00,0xa0,0xa0,0xc0,0xa0,0xa0,0x90,0x00,
  0x00,0x80,0x80,0x80,0x80,0x80,0xf0,0x00,0x00,0x90,0xf0,0xf0,0x90,0x90,0x90,0x00,
  0x00,0x90,0xd0,0xd0,0xb0,0xb0,0x90,0x00,0x00,0x60,0x90,0x90,0x90,0x90,0x60,0x00,
  0x00,0xe0,0x90,0x90,0xe0,0x80,0x80,0x00,0x00,0x60,0x90,0x90,0xd0,0xb0,0x60,0x00,
  0x00,0xe0,0x90,0x90,0xe0,0xa0,0x90,0x00,0x00,0x60,0x80,0x60,0x10,0x90,0x60,0x00,
  0x00,0xf0,0x40,0x40,0x40,0x40,0x40,0x00,0x00,0x90,0x90,0x90,0x90,0x90,0x60,0x00,
  0x00,0x90,0x90,0x90,0x90,0x60,0x60,0x00,0x00,0x90,0x90,0x90,0x90,0xf0,0x60,0x00,
  0x00,0x90,0x60,0x60,0x60,0x60,0x90,0x00,0x00,0x90,0xa0,0x60,0x40,0x40,0x40,0x00,
  0x00,0xf0,0x20,0x20,0x40,0x40,0xf0,0x00,0x00,0x30,0x20,0x20,0x20,0x20,0x30,0x00,
  0x00,0x00,0x80,0x40,0x40,0x20,0x20,0x00,0x00,0xc0,0x40,0x40,0x40,0x40,0xc0,0x00,
  0x00,0x40,0x60,0xe0,0x40,0x40,0x40,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xf0,
  0x00,0x60,0x50,0xe0,0x40,0x40,0xf0,0x00,0x00,0x00,0x60,0x20,0x60,0xa0,0x60,0x00,
  0x00,0x40,0x40,0x60,0x50,0x50,0x60,0x00,0x00,0x00,0x60,0x40,0x40,0x40,0x60,0x00,
  0x00,0x20,0x20,0x60,0xa0,0xa0,0x60,0x00,0x00,0x00,0x60,0xa0,0xe0,0x80,0x60,0x00,
  0x00,0x20,0x40,0x60,0x40,0x40,0x40,0x00,0x00,0x00,0x60,0xa0,0xa0,0x60,0x20,0x60,
  0x00,0x80,0x80,0xe0,0xa0,0xa0,0xa0,0x00,0x00,0x40,0x00,0x40,0x40,0x40,0x60,0x00,
  0x00,0x20,0x00,0x20,0x20,0x20,0x60,0x60,0x00,0x40,0x60,0x40,0x40,0x60,0x60,0x00,
  0x00,0x40,0x40,0x40,0x40,0x40,0x20,0x00,0x00,0x00,0xe0,0xe0,0xe0,0xe0,0xe0,0x00,
  0x00,0x00,0xe0,0xa0,0xa0,0xa0,0xa0,0x00,0x00,0x00,0x60,0xa0,0xa0,0xa0,0x60,0x00,
  0x00,0x00,0xe0,0xa0,0xa0,0xe0,0x80,0x80,0x00,0x00,0x60,0xa0,0xa0,0x60,0x20,0x30,
  0x00,0x00,0x60,0x40,0x40,0x40,0x40,0x00,0x00,0x00,0x60,0x80,0x60,0x20,0xe0,0x00,
  0x00,0x40,0x60,0x40,0x40,0x40,0x20,0x00,0x00,0x00,0xa0,0xa0,0xa0,0xa0,0x60,0x00,
  0x00,0x00,0xa0,0xa0,0x60,0x60,0x40,0x00,0x00,0x00,0xa0,0xe0,0xe0,0xe0,0x60,0x00,
  0x00,0x00,0xa0,0x60,0x40,0x60,0xa0,0x00,0x00,0x00,0xa0,0xa0,0xa0,0x60,0x20,0x60,
  0x00,0x00,0xe0,0x20,0x40,0x40,0xe0,0x00,0x00,0x30,0x20,0x40,0x20,0x20,0x30,0x00,
  0x00,0x20,0x20,0x20,0x20,0x20,0x20,0x00,0x00,0xc0,0x40,0x20,0x40,0x40,0xc0,0x00,
  0x00,0x60,0x60,0x00,0x00,0x00,0x00,0x00,0x60,0x90,0xf0,0xd0,0xd0,0xf0,0x90,0x60,
]);

// ZX Spectrum ROM font — 96 characters (32–127), 8 bytes each = 768 bytes.
// Same data as at ROM address 0x3D00 on a real Spectrum.
const ZGS_ROM_FONT = new Uint8Array([
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0x00,0x10,0x10,0x10,0x10,0x00,0x10,0x00,
  0x00,0x24,0x24,0x00,0x00,0x00,0x00,0x00, 0x00,0x24,0x7E,0x24,0x24,0x7E,0x24,0x00,
  0x00,0x08,0x3E,0x28,0x3E,0x0A,0x3E,0x08, 0x00,0x62,0x64,0x08,0x10,0x26,0x46,0x00,
  0x00,0x10,0x28,0x10,0x2A,0x44,0x3A,0x00, 0x00,0x08,0x10,0x00,0x00,0x00,0x00,0x00,
  0x00,0x04,0x08,0x08,0x08,0x08,0x04,0x00, 0x00,0x20,0x10,0x10,0x10,0x10,0x20,0x00,
  0x00,0x00,0x14,0x08,0x3E,0x08,0x14,0x00, 0x00,0x00,0x08,0x08,0x3E,0x08,0x08,0x00,
  0x00,0x00,0x00,0x00,0x00,0x08,0x08,0x10, 0x00,0x00,0x00,0x00,0x3E,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00, 0x00,0x00,0x02,0x04,0x08,0x10,0x20,0x00,
  0x00,0x3C,0x46,0x4A,0x52,0x62,0x3C,0x00, 0x00,0x18,0x28,0x08,0x08,0x08,0x3E,0x00,
  0x00,0x3C,0x42,0x02,0x3C,0x40,0x7E,0x00, 0x00,0x3C,0x42,0x0C,0x02,0x42,0x3C,0x00,
  0x00,0x08,0x18,0x28,0x48,0x7E,0x08,0x00, 0x00,0x7E,0x40,0x7C,0x02,0x42,0x3C,0x00,
  0x00,0x3C,0x40,0x7C,0x42,0x42,0x3C,0x00, 0x00,0x7E,0x02,0x04,0x08,0x10,0x10,0x00,
  0x00,0x3C,0x42,0x3C,0x42,0x42,0x3C,0x00, 0x00,0x3C,0x42,0x42,0x3E,0x02,0x3C,0x00,
  0x00,0x00,0x00,0x10,0x00,0x00,0x10,0x00, 0x00,0x00,0x10,0x00,0x00,0x10,0x10,0x20,
  0x00,0x00,0x04,0x08,0x10,0x08,0x04,0x00, 0x00,0x00,0x00,0x3E,0x00,0x3E,0x00,0x00,
  0x00,0x00,0x10,0x08,0x04,0x08,0x10,0x00, 0x00,0x3C,0x42,0x04,0x08,0x00,0x08,0x00,
  0x00,0x3C,0x4A,0x56,0x5E,0x40,0x3C,0x00, 0x00,0x3C,0x42,0x42,0x7E,0x42,0x42,0x00,
  0x00,0x7C,0x42,0x7C,0x42,0x42,0x7C,0x00, 0x00,0x3C,0x42,0x40,0x40,0x42,0x3C,0x00,
  0x00,0x78,0x44,0x42,0x42,0x44,0x78,0x00, 0x00,0x7E,0x40,0x7C,0x40,0x40,0x7E,0x00,
  0x00,0x7E,0x40,0x7C,0x40,0x40,0x40,0x00, 0x00,0x3C,0x42,0x40,0x4E,0x42,0x3C,0x00,
  0x00,0x42,0x42,0x7E,0x42,0x42,0x42,0x00, 0x00,0x3E,0x08,0x08,0x08,0x08,0x3E,0x00,
  0x00,0x02,0x02,0x02,0x42,0x42,0x3C,0x00, 0x00,0x44,0x48,0x70,0x48,0x44,0x42,0x00,
  0x00,0x40,0x40,0x40,0x40,0x40,0x7E,0x00, 0x00,0x42,0x66,0x5A,0x42,0x42,0x42,0x00,
  0x00,0x42,0x62,0x52,0x4A,0x46,0x42,0x00, 0x00,0x3C,0x42,0x42,0x42,0x42,0x3C,0x00,
  0x00,0x7C,0x42,0x42,0x7C,0x40,0x40,0x00, 0x00,0x3C,0x42,0x42,0x52,0x4A,0x3C,0x00,
  0x00,0x7C,0x42,0x42,0x7C,0x44,0x42,0x00, 0x00,0x3C,0x40,0x3C,0x02,0x42,0x3C,0x00,
  0x00,0xFE,0x10,0x10,0x10,0x10,0x10,0x00, 0x00,0x42,0x42,0x42,0x42,0x42,0x3C,0x00,
  0x00,0x42,0x42,0x42,0x42,0x24,0x18,0x00, 0x00,0x42,0x42,0x42,0x42,0x5A,0x24,0x00,
  0x00,0x42,0x24,0x18,0x18,0x24,0x42,0x00, 0x00,0x82,0x44,0x28,0x10,0x10,0x10,0x00,
  0x00,0x7E,0x04,0x08,0x10,0x20,0x7E,0x00, 0x00,0x0E,0x08,0x08,0x08,0x08,0x0E,0x00,
  0x00,0x00,0x40,0x20,0x10,0x08,0x04,0x00, 0x00,0x70,0x10,0x10,0x10,0x10,0x70,0x00,
  0x00,0x10,0x38,0x54,0x10,0x10,0x10,0x00, 0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF,
  0x00,0x1C,0x22,0x78,0x20,0x20,0x7E,0x00, 0x00,0x00,0x38,0x04,0x3C,0x44,0x3C,0x00,
  0x00,0x20,0x20,0x3C,0x22,0x22,0x3C,0x00, 0x00,0x00,0x1C,0x20,0x20,0x20,0x1C,0x00,
  0x00,0x04,0x04,0x3C,0x44,0x44,0x3C,0x00, 0x00,0x00,0x38,0x44,0x78,0x40,0x3C,0x00,
  0x00,0x0C,0x10,0x18,0x10,0x10,0x10,0x00, 0x00,0x00,0x3C,0x44,0x44,0x3C,0x04,0x38,
  0x00,0x40,0x40,0x78,0x44,0x44,0x44,0x00, 0x00,0x10,0x00,0x30,0x10,0x10,0x38,0x00,
  0x00,0x04,0x00,0x04,0x04,0x04,0x24,0x18, 0x00,0x20,0x28,0x30,0x30,0x28,0x24,0x00,
  0x00,0x10,0x10,0x10,0x10,0x10,0x0C,0x00, 0x00,0x00,0x68,0x54,0x54,0x54,0x54,0x00,
  0x00,0x00,0x78,0x44,0x44,0x44,0x44,0x00, 0x00,0x00,0x38,0x44,0x44,0x44,0x38,0x00,
  0x00,0x00,0x78,0x44,0x44,0x78,0x40,0x40, 0x00,0x00,0x3C,0x44,0x44,0x3C,0x04,0x06,
  0x00,0x00,0x1C,0x20,0x20,0x20,0x20,0x00, 0x00,0x00,0x38,0x40,0x38,0x04,0x78,0x00,
  0x00,0x10,0x38,0x10,0x10,0x10,0x0C,0x00, 0x00,0x00,0x44,0x44,0x44,0x44,0x38,0x00,
  0x00,0x00,0x44,0x44,0x28,0x28,0x10,0x00, 0x00,0x00,0x44,0x54,0x54,0x54,0x28,0x00,
  0x00,0x00,0x44,0x28,0x10,0x28,0x44,0x00, 0x00,0x00,0x44,0x44,0x44,0x3C,0x04,0x38,
  0x00,0x00,0x7C,0x08,0x10,0x20,0x7C,0x00, 0x00,0x0E,0x08,0x30,0x08,0x08,0x0E,0x00,
  0x00,0x08,0x08,0x08,0x08,0x08,0x08,0x00, 0x00,0x70,0x10,0x0C,0x10,0x10,0x70,0x00,
  0x00,0x14,0x28,0x00,0x00,0x00,0x00,0x00, 0x3C,0x42,0x99,0xA1,0xA1,0x99,0x42,0x3C,
]);

// =============================================================================
// Packed Text Dictionaries
// =============================================================================

/** @type {{bigrams: string[], trigrams: string[], words: string[]}} */
const ZGS_DEFAULT_DICT_LOWER = {
  bigrams: [
    " t", "e ", "th", "he", " a", "s ", "in", " s", "er", "re",
    " i", "on", "an", "d ", " w", "t ", "en", "n ", "or", " o",
    "at", " c", " b", "te", "nd", " d", "es", "ti", " h", "is",
    "ou", "it", "ar", "ha", "r ", "al", "le", " m", " f", "se",
    "ng", "st", "ed", " p", "to", "nt", " y", "ve", "of", "y ",
    "me", "no", "ne", "co", "ce", "de", " l", "ro", "io", "li",
    " n", " r", "ll", "ri", " e", "ge", "ow", "hi", "as", "ot",
    "be", " g", "ra", "ur", "el", "ma", "la", "ta", "ol", "ea",
    "wi", "ut", "wa", "ch", "si", "om", "ca", "ho", "lo", "do",
    "pe", "ke", "wo", "fo", "go", "da",
  ],
  trigrams: [
    "the", " th", "he ", "and", "ing", " to", " a ", "er ", "nd ",
    "you", "ion", "ed ", " in", " is", "tio", "ere", "her", "hat",
    "ent", " an", "ter", " of", "for", "all", "ver", " co", " it",
    " yo", "his", " be", "are", " no",
  ],
  words: [
    " the", " and", " you", " is ", " to ", " of ", " in ", " are",
    " it ", " not", " can", " was", " for", " on ", " with", " from",
    " have", " that", " this", " there", " here", " but", " all ",
    " your", " what", " will", " do ", " an ", " or ", " at ", " see",
  ],
};

/** @type {{bigrams: string[], trigrams: string[], words: string[]}} */
const ZGS_DEFAULT_DICT_UPPER = {
  bigrams: ZGS_DEFAULT_DICT_LOWER.bigrams.map(s => s.toUpperCase()),
  trigrams: ZGS_DEFAULT_DICT_LOWER.trigrams.map(s => s.toUpperCase()),
  words: ZGS_DEFAULT_DICT_LOWER.words.map(s => s.toUpperCase()),
};

/** @type {{bigrams: string[], trigrams: string[], words: string[]}|null} */
let zgsUserDict = null;

/**
 * Parse a .zdict binary (Uint8Array) into a dictionary object.
 * Format: 3-byte header (N,M,W) + N*2 bigram pairs + M*3 trigram triples
 *         + W*2 word offsets (16-bit LE) + W null-terminated word strings.
 * @param {Uint8Array} data
 * @returns {{bigrams: string[], trigrams: string[], words: string[]}}
 */
function zgsLoadZdict(data) {
  if (data.length < 3) throw new Error('Invalid .zdict: too short');
  const n = data[0]; // bigram count
  const m = data[1]; // trigram count
  const w = data[2]; // word count
  let pos = 3;
  const bigrams = [];
  for (let i = 0; i < n; i++) {
    bigrams.push(String.fromCharCode(data[pos], data[pos + 1]));
    pos += 2;
  }
  const trigrams = [];
  for (let i = 0; i < m; i++) {
    trigrams.push(String.fromCharCode(data[pos], data[pos + 1], data[pos + 2]));
    pos += 3;
  }
  // Word offsets (16-bit LE, relative to word data start)
  const wordOffsets = [];
  for (let i = 0; i < w; i++) {
    wordOffsets.push(data[pos] | (data[pos + 1] << 8));
    pos += 2;
  }
  // Word strings (null-terminated) start at current pos
  const wordDataStart = pos;
  const words = [];
  for (const off of wordOffsets) {
    let s = '';
    let p = wordDataStart + off;
    while (p < data.length && data[p] !== 0) {
      s += String.fromCharCode(data[p]);
      p++;
    }
    words.push(s);
  }
  return { bigrams, trigrams, words };
}

/**
 * Pack a string using the given dictionary (greedy encoder).
 * Words are tried longest-first, then trigrams, then bigrams, then literal.
 * @param {string} str
 * @param {{bigrams: string[], trigrams: string[], words: string[]}} dict
 * @returns {number[]}
 */
function zgsPackText(str, dict) {
  // Sort words longest-first for greedy matching
  const sortedWords = dict.words.map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.length - a.w.length || a.i - b.i);

  const output = [];
  let pos = 0;
  while (pos < str.length) {
    // Try word tokens (longest first) — codes 1-31
    let matched = false;
    for (const { w, i } of sortedWords) {
      if (str.startsWith(w, pos)) {
        output.push(i + 1); // codes 1-31
        pos += w.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Try trigrams — codes 224-255
    if (pos + 2 < str.length) {
      const tri = str.substring(pos, pos + 3);
      const idx = dict.trigrams.indexOf(tri);
      if (idx >= 0) {
        output.push(224 + idx);
        pos += 3;
        continue;
      }
    }

    // Try bigrams — codes 128-223
    if (pos + 1 < str.length) {
      const bi = str.substring(pos, pos + 2);
      const idx = dict.bigrams.indexOf(bi);
      if (idx >= 0) {
        output.push(128 + idx);
        pos += 2;
        continue;
      }
    }

    // Literal ASCII
    const code = str.charCodeAt(pos);
    output.push(code >= 32 && code <= 127 ? code : 32);
    pos += 1;
  }
  return output;
}

/**
 * Unpack a single packed byte back to string.
 * @param {number} code
 * @param {{bigrams: string[], trigrams: string[], words: string[]}} dict
 * @returns {string}
 */
function zgsUnpackByte(code, dict) {
  if (code === 0) return '\n';
  if (code >= 1 && code <= 31) return dict.words[code - 1] || '';
  if (code >= 32 && code <= 127) return String.fromCharCode(code);
  if (code >= 128 && code <= 223) return dict.bigrams[code - 128] || '';
  return dict.trigrams[code - 224] || ''; // 224-255
}

// =============================================================================
// ZgsVM — Virtual Machine
// =============================================================================

class ZgsVM {
  constructor() {
    /** @type {Uint8Array} */
    this.pixels = new Uint8Array(ZGS_SCREEN_W * ZGS_SCREEN_H);
    /** @type {Uint8Array} */
    this.attrs = new Uint8Array(32 * 24);
    this.penX = 0;
    this.penY = 0;
    this.patternIdx = 0;
    this.attr = 0x07; // white ink, black paper
    /** @type {number[]} */
    this.callStack = [];
    this.pc = 0;
    /** @type {Uint8Array} */
    this.data = new Uint8Array(0);
    /** @type {Array<{type: number, data: Uint8Array}>} */
    this.assets = [];
    /** @type {number[][]} */
    this.patterns = ZGS_DEFAULT_PATTERNS.map(r => r.slice());
    this.drawMode = 0; // 0 = SET, 1 = XOR
    this.cursorCol = 0;
    this.cursorRow = 0;
    this.cursorCol42 = 0;
    this.cursorRow42 = 0;
    this.cursorCol64 = 0;
    this.cursorRow64 = 0;
    this.dict = ZGS_DEFAULT_DICT_LOWER;
    this.opcodeCount = 0;
    this.halted = false;
    this.waitingKey = false;
  }

  /**
   * Load binary data and parse the header.
   * @param {Uint8Array} fileBytes
   */
  loadBinary(fileBytes) {
    this.data = new Uint8Array(fileBytes);
    this._parseHeader();
  }

  /**
   * Load raw scene bytecode (no header, for asset sub-scripts).
   * @param {Uint8Array} sceneBytes
   */
  loadScene(sceneBytes) {
    this.data = new Uint8Array(sceneBytes);
    this.pc = 0;
  }

  _parseHeader() {
    if (this.data.length < 10) throw new Error("File too small for ZGS header");
    if (this.data[0] !== 0x5A || this.data[1] !== 0x47) throw new Error("Bad magic");
    const version = this.data[2];
    if (version !== 0x01) throw new Error("Expected version 1, got " + version);
    const flags = this.data[3];
    const assetLibOff = this.data[6] | (this.data[7] << 8);
    const sceneOff = this.data[8] | (this.data[9] << 8);
    if (assetLibOff && (flags & 1)) {
      this._parseAssetLibrary(assetLibOff);
    }
    if (flags & 2) {
      this._decompressScene(sceneOff);
    } else {
      this.pc = sceneOff;
    }
  }

  /** @param {number} offset */
  _parseAssetLibrary(offset) {
    let pos = offset;
    const count = this.data[pos++];
    for (let i = 0; i < count; i++) {
      const assetType = this.data[pos++];
      const dataLen = this.data[pos] | (this.data[pos + 1] << 8);
      pos += 2;
      const assetData = this.data.slice(pos, pos + dataLen);
      pos += dataLen;
      this.assets.push({ type: assetType, data: assetData });
    }
  }

  /** @param {number} sceneOff */
  _decompressScene(sceneOff) {
    let pos = sceneOff;
    const uncompSize = this.data[pos] | (this.data[pos + 1] << 8);
    pos += 2;
    const output = [];
    while (output.length < uncompSize) {
      if (pos >= this.data.length) break;
      const control = this.data[pos++];
      for (let bit = 0; bit < 8; bit++) {
        if (output.length >= uncompSize) break;
        if ((control >> (7 - bit)) & 1) {
          if (pos + 1 >= this.data.length) break;
          const b0 = this.data[pos]; const b1 = this.data[pos + 1]; pos += 2;
          const matchOff = (b0 << 4) | (b1 >> 4);
          const matchLen = (b1 & 0x0F) + 3;
          const start = output.length - matchOff;
          for (let j = 0; j < matchLen; j++) {
            const idx = start + j;
            output.push(idx >= 0 && idx < output.length ? output[idx] : 0);
          }
        } else {
          if (pos >= this.data.length) break;
          output.push(this.data[pos++]);
        }
      }
    }
    const decompStart = this.data.length;
    const newData = new Uint8Array(this.data.length + output.length);
    newData.set(this.data);
    for (let i = 0; i < output.length; i++) newData[decompStart + i] = output[i];
    this.data = newData;
    this.pc = decompStart;
  }

  // --- Byte readers ---
  _u8() { return this.data[this.pc++]; }
  _s8() { const v = this.data[this.pc++]; return v < 128 ? v : v - 256; }
  _readAbs() { return [(this._u8() & 0x7F) * 2, (this._u8() & 0x7F) * 2]; }
  _readShortDelta() {
    const b = this._u8();
    let dx = (b >> 4) & 0xF, dy = b & 0xF;
    if (dx >= 8) dx -= 16;
    if (dy >= 8) dy -= 16;
    return [dx * 2, dy * 2];
  }
  _readMedDelta() { return [this._s8() * 2, this._s8() * 2]; }

  // --- Pixel helpers ---
  /** @param {number} x @param {number} y */
  _inBounds(x, y) { return x >= 0 && x < ZGS_SCREEN_W && y >= 0 && y < ZGS_SCREEN_H; }

  /** @param {number} x @param {number} y */
  _plot(x, y) {
    if (!this._inBounds(x, y)) return;
    const idx = y * ZGS_SCREEN_W + x;
    if (this.drawMode === 1) {
      this.pixels[idx] ^= 1;
    } else {
      this.pixels[idx] = 1;
    }
    const ax = x >> 3, ay = y >> 3;
    this.attrs[ay * 32 + ax] = this.attr;
  }

  /** @param {number} sx @param {number} sy */
  _patternTest(sx, sy) {
    const row = this.patterns[this.patternIdx][sy & 7];
    return (row >> (7 - (sx & 7))) & 1;
  }

  /** @param {number} x @param {number} y */
  _plotPat(x, y) {
    if (this._inBounds(x, y) && this._patternTest(x, y)) this._plot(x, y);
  }

  // --- Drawing primitives ---
  /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
  _line(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this._plot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  /** @param {number} x @param {number} y @param {number} w @param {number} h */
  _rectOutline(x, y, w, h) {
    this._line(x, y, x + w, y);
    this._line(x + w, y, x + w, y + h);
    this._line(x + w, y + h, x, y + h);
    this._line(x, y + h, x, y);
  }

  /** @param {number} x @param {number} y @param {number} w @param {number} h */
  _rectFill(x, y, w, h) {
    for (let sy = y; sy <= y + h; sy++)
      for (let sx = x; sx <= x + w; sx++)
        this._plotPat(sx, sy);
  }

  /** @param {number} cx @param {number} cy @param {number} r */
  _circleOutline(cx, cy, r) {
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      this._plot(cx + x, cy + y); this._plot(cx - x, cy + y);
      this._plot(cx + x, cy - y); this._plot(cx - x, cy - y);
      this._plot(cx + y, cy + x); this._plot(cx - y, cy + x);
      this._plot(cx + y, cy - x); this._plot(cx - y, cy - x);
      y++;
      if (err < 0) { err += 2 * y + 1; }
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  /** @param {number} cx @param {number} cy @param {number} r */
  _circleFill(cx, cy, r) {
    if (r <= 0) { this._plotPat(cx, cy); return; }
    // For each row, record the widest half-width, then draw once — avoids
    // XOR artifacts caused by double-plotting overlapping octant scanlines.
    const halfW = new Int16Array(r + 1);
    halfW.fill(-1);  // -1 = row not touched by circle
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      if (x > halfW[y]) halfW[y] = x;
      if (y > halfW[x]) halfW[x] = y;
      y++;
      if (err < 0) { err += 2 * y + 1; }
      else { x--; err += 2 * (y - x) + 1; }
    }
    for (let dy = 0; dy <= r; dy++) {
      const hw = halfW[dy];
      if (hw < 0) continue;
      for (let sx = cx - hw; sx <= cx + hw; sx++) this._plotPat(sx, cy + dy);
      if (dy !== 0) for (let sx = cx - hw; sx <= cx + hw; sx++) this._plotPat(sx, cy - dy);
    }
  }

  /** @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
  _ellipseOutline(cx, cy, rx, ry) {
    if (rx <= 0 && ry <= 0) { this._plot(cx, cy); return; }
    let x = 0, y = ry;
    const rx2 = rx * rx, ry2 = ry * ry;
    const twoRx2 = 2 * rx2, twoRy2 = 2 * ry2;
    let px = 0, py = twoRx2 * y;
    // Region 1: dy/dx < 1
    let err = ry2 - rx2 * ry + 0.25 * rx2;
    while (px < py) {
      this._plot(cx + x, cy + y); this._plot(cx - x, cy + y);
      this._plot(cx + x, cy - y); this._plot(cx - x, cy - y);
      x++; px += twoRy2;
      if (err < 0) { err += ry2 + px; }
      else { y--; py -= twoRx2; err += ry2 + px - py; }
    }
    // Region 2: dy/dx >= 1
    err = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
    while (y >= 0) {
      this._plot(cx + x, cy + y); this._plot(cx - x, cy + y);
      this._plot(cx + x, cy - y); this._plot(cx - x, cy - y);
      y--; py -= twoRx2;
      if (err > 0) { err += rx2 - py; }
      else { x++; px += twoRy2; err += rx2 - py + px; }
    }
  }

  /** @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
  _ellipseFill(cx, cy, rx, ry) {
    if (rx <= 0 && ry <= 0) { this._plotPat(cx, cy); return; }
    // Pre-compute halfW for each scanline row dy (0..ry)
    const halfW = new Int16Array(ry + 1);
    halfW.fill(-1);
    let x = 0, y = ry;
    const rx2 = rx * rx, ry2 = ry * ry;
    const twoRx2 = 2 * rx2, twoRy2 = 2 * ry2;
    let px = 0, py = twoRx2 * y;
    // Region 1
    let err = ry2 - rx2 * ry + 0.25 * rx2;
    while (px < py) {
      if (x > halfW[y]) halfW[y] = x;
      x++; px += twoRy2;
      if (err < 0) { err += ry2 + px; }
      else { y--; py -= twoRx2; err += ry2 + px - py; }
    }
    // Region 2
    err = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
    while (y >= 0) {
      if (x > halfW[y]) halfW[y] = x;
      y--; py -= twoRx2;
      if (err > 0) { err += rx2 - py; }
      else { x++; px += twoRy2; err += rx2 - py + px; }
    }
    // Draw spans
    for (let dy = 0; dy <= ry; dy++) {
      const hw = halfW[dy];
      if (hw < 0) continue;
      for (let sx = cx - hw; sx <= cx + hw; sx++) this._plotPat(sx, cy + dy);
      if (dy !== 0) for (let sx = cx - hw; sx <= cx + hw; sx++) this._plotPat(sx, cy - dy);
    }
  }

  /** @param {number} sx @param {number} sy */
  _floodFill(sx, sy) {
    if (!this._inBounds(sx, sy) || this.pixels[sy * ZGS_SCREEN_W + sx]) return;
    const visited = new Uint8Array(ZGS_SCREEN_W * ZGS_SCREEN_H);
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (!this._inBounds(x, y)) continue;
      const idx = y * ZGS_SCREEN_W + x;
      if (visited[idx] || this.pixels[idx]) continue;
      let lx = x;
      while (lx > 0 && !visited[y * ZGS_SCREEN_W + lx - 1] && !this.pixels[y * ZGS_SCREEN_W + lx - 1]) lx--;
      let rx = x;
      while (rx < ZGS_SCREEN_W - 1 && !visited[y * ZGS_SCREEN_W + rx + 1] && !this.pixels[y * ZGS_SCREEN_W + rx + 1]) rx++;
      for (let fx = lx; fx <= rx; fx++) {
        const fi = y * ZGS_SCREEN_W + fx;
        visited[fi] = 1;
        this._plotPat(fx, y);
        const ax = fx >> 3, ay = y >> 3;
        if (ax >= 0 && ax < 32 && ay >= 0 && ay < 24) this.attrs[ay * 32 + ax] = this.attr;
      }
      for (let fx = lx; fx <= rx; fx++) {
        if (y > 0 && !visited[(y - 1) * ZGS_SCREEN_W + fx] && !this.pixels[(y - 1) * ZGS_SCREEN_W + fx]) stack.push([fx, y - 1]);
        if (y < ZGS_SCREEN_H - 1 && !visited[(y + 1) * ZGS_SCREEN_W + fx] && !this.pixels[(y + 1) * ZGS_SCREEN_W + fx]) stack.push([fx, y + 1]);
      }
    }
  }

  /** @param {number} charCode */
  _printChar(charCode) {
    const ch = (charCode >= 32 && charCode <= 127) ? charCode - 32 : 0;
    const fontOff = ch * 8;
    const px = this.cursorCol * 8;
    const py = this.cursorRow * 8;
    for (let row = 0; row < 8; row++) {
      const fontByte = ZGS_ROM_FONT[fontOff + row];
      for (let bit = 0; bit < 8; bit++) {
        if (fontByte & (0x80 >> bit)) {
          this._plot(px + bit, py + row);
        }
      }
    }
    // Set attribute for the character cell
    if (this.cursorCol >= 0 && this.cursorCol < 32 && this.cursorRow >= 0 && this.cursorRow < 24) {
      this.attrs[this.cursorRow * 32 + this.cursorCol] = this.attr;
    }
    // Advance cursor
    this.cursorCol++;
    if (this.cursorCol >= 32) {
      this.cursorCol = 0;
      this.cursorRow++;
    }
  }

  /** @param {number} charCode */
  _printChar42(charCode) {
    const ch = (charCode >= 32 && charCode <= 127) ? charCode - 32 : 0;
    const fontOff = ch * 8;
    const pixelX = this.cursorCol42 * 6;
    const py = this.cursorRow42 * 8;
    for (let row = 0; row < 8; row++) {
      const fontByte = ZGS_FONT_6X8[fontOff + row]; // 6px wide font
      for (let bit = 0; bit < 6; bit++) {
        if (fontByte & (0x80 >> bit)) {
          this._plot(pixelX + bit, py + row);
        }
      }
    }
    // Set attr for all overlapping 8x8 cells (1 or 2 cells)
    const cellLeft = Math.floor(pixelX / 8);
    const cellRight = Math.floor((pixelX + 5) / 8);
    if (this.cursorRow42 >= 0 && this.cursorRow42 < 24) {
      if (cellLeft >= 0 && cellLeft < 32)
        this.attrs[this.cursorRow42 * 32 + cellLeft] = this.attr;
      if (cellRight !== cellLeft && cellRight >= 0 && cellRight < 32)
        this.attrs[this.cursorRow42 * 32 + cellRight] = this.attr;
    }
    // Advance cursor
    this.cursorCol42++;
    if (this.cursorCol42 >= 42) {
      this.cursorCol42 = 0;
      this.cursorRow42++;
    }
  }

  /** @param {number} charCode */
  _printChar64(charCode) {
    const ch = (charCode >= 32 && charCode <= 127) ? charCode - 32 : 0;
    const fontOff = ch * 8;
    const pixelX = this.cursorCol64 * 4;
    const py = this.cursorRow64 * 8;
    for (let row = 0; row < 8; row++) {
      const fontByte = ZGS_FONT_4X8[fontOff + row]; // top 4 bits
      for (let bit = 0; bit < 4; bit++) {
        if (fontByte & (0x80 >> bit)) {
          this._plot(pixelX + bit, py + row);
        }
      }
    }
    // Set attr for the 8x8 cell that contains this 4px column
    const cellCol = Math.floor(pixelX / 8); // col/2 — two 64-col chars share one attr cell
    if (this.cursorRow64 >= 0 && this.cursorRow64 < 24 && cellCol >= 0 && cellCol < 32) {
      this.attrs[this.cursorRow64 * 32 + cellCol] = this.attr;
    }
    // Advance cursor
    this.cursorCol64++;
    if (this.cursorCol64 >= 64) {
      this.cursorCol64 = 0;
      this.cursorRow64++;
    }
  }

  /** @param {Array<[number, number]>} verts */
  _polygonFill(verts) {
    if (verts.length < 3) return;
    const ys = verts.map(v => v[1]);
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(ZGS_SCREEN_H - 1, Math.max(...ys));
    const n = verts.length;
    for (let sy = minY; sy <= maxY; sy++) {
      const intersections = [];
      for (let i = 0; i < n; i++) {
        let [x0, y0] = verts[i];
        let [x1, y1] = verts[(i + 1) % n];
        if (y0 === y1) continue;
        if (y0 > y1) { [x0, y0, x1, y1] = [x1, y1, x0, y0]; }
        if (sy < y0 || sy >= y1) continue;
        intersections.push(x0 + (sy - y0) * (x1 - x0) / (y1 - y0));
      }
      intersections.sort((a, b) => a - b);
      for (let j = 0; j < intersections.length - 1; j += 2) {
        const sxStart = Math.max(0, Math.floor(intersections[j]));
        const sxEnd = Math.min(ZGS_SCREEN_W - 1, Math.floor(intersections[j + 1]));
        for (let sx = sxStart; sx <= sxEnd; sx++) this._plotPat(sx, sy);
      }
    }
  }

  /**
   * @param {Uint8Array} assetData
   * @param {number} x
   * @param {number} y
   */
  _stampSprite(assetData, x, y) {
    if (assetData.length < 2) return;
    const wChars = assetData[0], hRows = assetData[1];
    let pos = 2;
    for (let row = 0; row < hRows; row++) {
      for (let col = 0; col < wChars; col++) {
        if (pos >= assetData.length) return;
        const byte = assetData[pos++];
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (0x80 >> bit)) this._plot(x + col * 8 + bit, y + row);
        }
      }
    }
  }

  /**
   * @param {number} idx
   * @param {number} x
   * @param {number} y
   */
  _execAsset(idx, x, y) {
    if (idx >= this.assets.length) return;
    const asset = this.assets[idx];
    if (asset.type === 0x00) {
      // Sprite
      this._stampSprite(asset.data, x, y);
    } else if (asset.type === 0x01) {
      // Shape script — execute inline
      const savedPenX = this.penX, savedPenY = this.penY;
      this.penX = x; this.penY = y;
      const savedPc = this.pc, savedData = this.data;
      this.data = new Uint8Array(asset.data);
      this.pc = 0;
      while (this.pc < this.data.length) {
        if (this._runOneOpcode() === false) break;
      }
      this.data = savedData;
      this.pc = savedPc;
      this.penX = savedPenX;
      this.penY = savedPenY;
    }
  }

  /**
   * Execute one opcode. Returns false on END/halt, true otherwise.
   * @returns {boolean}
   */
  _runOneOpcode() {
    if (this.pc >= this.data.length) return false;
    this.opcodeCount++;
    if (this.opcodeCount > ZGS_OPCODE_LIMIT) { this.halted = true; return false; }
    const b = this._u8();

    // 0x00..0x0F: SET_INK
    if (b <= 0x0F) {
      const ink = b & 7, bright = (b >> 3) & 1;
      this.attr = (bright << 6) | (this.attr & 0x38) | ink;
    }
    // 0x10..0x17: SET_PATTERN
    else if (b <= 0x17) { this.patternIdx = b & 7; }
    // 0x18: END / RET
    else if (b === 0x18) {
      if (this.callStack.length) { this.pc = this.callStack.pop(); }
      else return false;
    }
    // 0x19: FLOOD_CHAIN
    else if (b === 0x19) { this._floodFill(this.penX, this.penY); }
    // 0x1A: DOT_CHAIN
    else if (b === 0x1A) { this._plot(this.penX, this.penY); }
    // 0x1B: SET_MODE
    else if (b === 0x1B) { this.drawMode = this._u8() & 1; }
    // 0x1C..0x1F: reserved
    else if (b <= 0x1F) { /* skip */ }
    // 0x20..0x5F: MOVE_SHORT
    else if (b <= 0x5F) {
      const val = b - 0x20;
      this.penX += (((val >> 3) & 7) - 4) * 2;
      this.penY += ((val & 7) - 4) * 2;
    }
    // 0x60: MOVE_ABS
    else if (b === 0x60) { [this.penX, this.penY] = this._readAbs(); }
    // 0x61: MOVE_DMED
    else if (b === 0x61) { const [dx, dy] = this._readMedDelta(); this.penX += dx; this.penY += dy; }
    // 0x62: DOT_ABS
    else if (b === 0x62) { const [x, y] = this._readAbs(); this.penX = x; this.penY = y; this._plot(x, y); }
    // 0x63: DOT_BATCH
    else if (b === 0x63) {
      const count = this._u8();
      for (let i = 0; i < count; i++) { const [x, y] = this._readAbs(); this.penX = x; this.penY = y; this._plot(x, y); }
    }
    // 0x64: LINE_DSHORT
    else if (b === 0x64) {
      const [dx, dy] = this._readShortDelta();
      const x2 = this.penX + dx, y2 = this.penY + dy;
      this._line(this.penX, this.penY, x2, y2); this.penX = x2; this.penY = y2;
    }
    // 0x65: LINE_DMED
    else if (b === 0x65) {
      const [dx, dy] = this._readMedDelta();
      const x2 = this.penX + dx, y2 = this.penY + dy;
      this._line(this.penX, this.penY, x2, y2); this.penX = x2; this.penY = y2;
    }
    // 0x66: LINE_BATCH
    else if (b === 0x66) {
      const count = this._u8();
      for (let i = 0; i < count; i++) {
        const [dx, dy] = this._readMedDelta();
        const x2 = this.penX + dx, y2 = this.penY + dy;
        this._line(this.penX, this.penY, x2, y2); this.penX = x2; this.penY = y2;
      }
    }
    // 0x67: HLINE_CHAIN
    else if (b === 0x67) {
      const len = this._s8() * 2; const x2 = this.penX + len;
      this._line(this.penX, this.penY, x2, this.penY); this.penX = x2;
    }
    // 0x68: HLINE_ABS
    else if (b === 0x68) {
      const [x, y] = this._readAbs(); const len = this._s8() * 2;
      this._line(x, y, x + len, y); this.penX = x + len; this.penY = y;
    }
    // 0x69: VLINE_CHAIN
    else if (b === 0x69) {
      const len = this._s8() * 2; const y2 = this.penY + len;
      this._line(this.penX, this.penY, this.penX, y2); this.penY = y2;
    }
    // 0x6A: VLINE_ABS
    else if (b === 0x6A) {
      const [x, y] = this._readAbs(); const len = this._s8() * 2;
      this._line(x, y, x, y + len); this.penX = x; this.penY = y + len;
    }
    // 0x6B: RECT_OUTLINE_ABS
    else if (b === 0x6B) {
      const [x, y] = this._readAbs(); const w = this._u8() * 2, h = this._u8() * 2;
      this._rectOutline(x, y, w, h); this.penX = x; this.penY = y;
    }
    // 0x6C: RECT_FILL_ABS
    else if (b === 0x6C) {
      const [x, y] = this._readAbs(); const w = this._u8() * 2, h = this._u8() * 2;
      this._rectFill(x, y, w, h); this.penX = x; this.penY = y;
    }
    // 0x6D: RECT_OUTLINE_CHAIN
    else if (b === 0x6D) {
      const w = this._u8() * 2, h = this._u8() * 2;
      this._rectOutline(this.penX, this.penY, w, h);
    }
    // 0x6E: RECT_FILL_CHAIN
    else if (b === 0x6E) {
      const w = this._u8() * 2, h = this._u8() * 2;
      this._rectFill(this.penX, this.penY, w, h);
    }
    // 0x6F: RECT_OUTLINE_BATCH
    else if (b === 0x6F) {
      const count = this._u8();
      for (let i = 0; i < count; i++) {
        const [x, y] = this._readAbs(); const w = this._u8() * 2, h = this._u8() * 2;
        this._rectOutline(x, y, w, h); this.penX = x; this.penY = y;
      }
    }
    // 0x70: RECT_FILL_BATCH
    else if (b === 0x70) {
      const count = this._u8();
      for (let i = 0; i < count; i++) {
        const [x, y] = this._readAbs(); const w = this._u8() * 2, h = this._u8() * 2;
        this._rectFill(x, y, w, h); this.penX = x; this.penY = y;
      }
    }
    // 0x71: POLYGON_OUTLINE
    else if (b === 0x71) {
      const count = this._u8();
      const v0 = this._readAbs();
      /** @type {Array<[number, number]>} */
      const verts = [[v0[0], v0[1]]];
      for (let i = 1; i < count; i++) {
        const [dx, dy] = this._readMedDelta();
        verts.push([verts[verts.length - 1][0] + dx, verts[verts.length - 1][1] + dy]);
      }
      for (let i = 0; i < verts.length; i++) {
        const [x1, y1] = verts[i]; const [x2, y2] = verts[(i + 1) % verts.length];
        this._line(x1, y1, x2, y2);
      }
      this.penX = verts[0][0]; this.penY = verts[0][1];
    }
    // 0x72: POLYGON_FILL
    else if (b === 0x72) {
      const count = this._u8();
      const v0 = this._readAbs();
      /** @type {Array<[number, number]>} */
      const verts = [[v0[0], v0[1]]];
      for (let i = 1; i < count; i++) {
        const [dx, dy] = this._readMedDelta();
        verts.push([verts[verts.length - 1][0] + dx, verts[verts.length - 1][1] + dy]);
      }
      this._polygonFill(verts);
      this.penX = verts[0][0]; this.penY = verts[0][1];
    }
    // 0x73: CIRCLE_OUTLINE_ABS
    else if (b === 0x73) {
      const [cx, cy] = this._readAbs(); const r = this._u8() * 2;
      this._circleOutline(cx, cy, r); this.penX = cx; this.penY = cy;
    }
    // 0x74: CIRCLE_FILL_ABS
    else if (b === 0x74) {
      const [cx, cy] = this._readAbs(); const r = this._u8() * 2;
      this._circleFill(cx, cy, r); this.penX = cx; this.penY = cy;
    }
    // 0x75: CIRCLE_OUTLINE_CHAIN
    else if (b === 0x75) { const r = this._u8() * 2; this._circleOutline(this.penX, this.penY, r); }
    // 0x76: CIRCLE_FILL_CHAIN
    else if (b === 0x76) { const r = this._u8() * 2; this._circleFill(this.penX, this.penY, r); }
    // 0x77: FLOOD_ABS
    else if (b === 0x77) {
      const [x, y] = this._readAbs(); this.penX = x; this.penY = y;
      this._floodFill(x, y);
    }
    // 0x78: STAMP_ABS
    else if (b === 0x78) {
      const idx = this._u8(); const [x, y] = this._readAbs();
      this.penX = x; this.penY = y; this._execAsset(idx, x, y);
    }
    // 0x79: STAMP_CHAIN
    else if (b === 0x79) {
      const idx = this._u8(); this._execAsset(idx, this.penX, this.penY);
    }
    // 0x7A: REPEAT
    else if (b === 0x7A) {
      const count = this._u8();
      const strideDx = this._s8() * 2, strideDy = this._s8() * 2;
      const bodyLen = this._u8();
      const bodyStart = this.pc, bodyEnd = this.pc + bodyLen;
      const baseX = this.penX, baseY = this.penY;
      for (let i = 0; i < count; i++) {
        this.penX = baseX + i * strideDx; this.penY = baseY + i * strideDy;
        this.pc = bodyStart;
        while (this.pc < bodyEnd) this._runOneOpcode();
      }
      this.pc = bodyEnd;
      this.penX = baseX + count * strideDx; this.penY = baseY + count * strideDy;
    }
    // 0x7B: CALL
    else if (b === 0x7B) {
      const idx = this._u8();
      if (idx < this.assets.length) {
        const asset = this.assets[idx];
        if (asset.type === 0x01) {
          const savedPc = this.pc, savedData = this.data;
          this.data = new Uint8Array(asset.data); this.pc = 0;
          while (this.pc < this.data.length) { if (this._runOneOpcode() === false) break; }
          this.data = savedData; this.pc = savedPc;
        } else if (asset.type === 0x00) {
          this._stampSprite(asset.data, this.penX, this.penY);
        }
      }
    }
    // 0x7C: SET_PAPER
    else if (b === 0x7C) {
      const val = this._u8();
      const paper = (val >> 3) & 7, bright = (val >> 6) & 1;
      this.attr = (bright << 6) | (paper << 3) | (this.attr & 0x07);
    }
    // 0x7D: SET_ATTR
    else if (b === 0x7D) { this.attr = this._u8(); }
    // 0x7E: CLEAR_REGION
    else if (b === 0x7E) {
      const col = this._u8(), row = this._u8(), w = this._u8(), h = this._u8(), a = this._u8();
      for (let cy = row; cy < Math.min(row + h, 24); cy++) {
        for (let cx = col; cx < Math.min(col + w, 32); cx++) {
          const px = cx * 8, py = cy * 8;
          for (let dy = 0; dy < 8; dy++)
            for (let dx = 0; dx < 8; dx++) {
              const sx = px + dx, sy = py + dy;
              if (sx >= 0 && sx < ZGS_SCREEN_W && sy >= 0 && sy < ZGS_SCREEN_H)
                this.pixels[sy * ZGS_SCREEN_W + sx] = 0;
            }
          this.attrs[cy * 32 + cx] = a;
        }
      }
    }
    // 0x7F: WAIT_KEY
    else if (b === 0x7F) { this.waitingKey = true; return false; }
    // 0x80: SET_CURSOR
    else if (b === 0x80) {
      this.cursorCol = this._u8() % 32;
      this.cursorRow = this._u8() % 24;
    }
    // 0x81: PRINT_TEXT
    else if (b === 0x81) {
      const len = this._u8();
      for (let i = 0; i < len; i++) {
        const ch = this._u8();
        this._printChar(ch);
      }
    }
    // 0x82: PRINT_PACKED
    else if (b === 0x82) {
      const len = this._u8();
      for (let i = 0; i < len; i++) {
        const code = this._u8();
        if (code === 0) {
          this.cursorCol = 0;
          this.cursorRow++;
        } else if (code >= 1 && code <= 31) {
          const word = this.dict.words[code - 1];
          if (word) for (const ch of word) this._printChar(ch.charCodeAt(0));
        } else if (code >= 32 && code <= 127) {
          this._printChar(code);
        } else if (code >= 128 && code <= 223) {
          const bi = this.dict.bigrams[code - 128];
          if (bi) { this._printChar(bi.charCodeAt(0)); this._printChar(bi.charCodeAt(1)); }
        } else {
          const tri = this.dict.trigrams[code - 224];
          if (tri) { this._printChar(tri.charCodeAt(0)); this._printChar(tri.charCodeAt(1)); this._printChar(tri.charCodeAt(2)); }
        }
      }
    }
    // 0x83: SET_CURSOR_42
    else if (b === 0x83) {
      this.cursorCol42 = this._u8() % 42;
      this.cursorRow42 = this._u8() % 24;
    }
    // 0x84: PRINT_TEXT_42
    else if (b === 0x84) {
      const len = this._u8();
      for (let i = 0; i < len; i++) {
        const ch = this._u8();
        this._printChar42(ch);
      }
    }
    // 0x85: PRINT_PACKED_42
    else if (b === 0x85) {
      const len = this._u8();
      for (let i = 0; i < len; i++) {
        const code = this._u8();
        if (code === 0) {
          this.cursorCol42 = 0;
          this.cursorRow42++;
        } else if (code >= 1 && code <= 31) {
          const word = this.dict.words[code - 1];
          if (word) for (const ch of word) this._printChar42(ch.charCodeAt(0));
        } else if (code >= 32 && code <= 127) {
          this._printChar42(code);
        } else if (code >= 128 && code <= 223) {
          const bi = this.dict.bigrams[code - 128];
          if (bi) { this._printChar42(bi.charCodeAt(0)); this._printChar42(bi.charCodeAt(1)); }
        } else {
          const tri = this.dict.trigrams[code - 224];
          if (tri) { this._printChar42(tri.charCodeAt(0)); this._printChar42(tri.charCodeAt(1)); this._printChar42(tri.charCodeAt(2)); }
        }
      }
    }
    // 0x86: SET_CURSOR_64
    else if (b === 0x86) {
      this.cursorCol64 = this._u8() % 64;
      this.cursorRow64 = this._u8() % 24;
    }
    // 0x87: PRINT_TEXT_64
    else if (b === 0x87) {
      const len = this._u8();
      for (let i = 0; i < len; i++) {
        const ch = this._u8();
        this._printChar64(ch);
      }
    }
    // 0x88: PRINT_PACKED_64
    else if (b === 0x88) {
      const len = this._u8();
      for (let i = 0; i < len; i++) {
        const code = this._u8();
        if (code === 0) {
          this.cursorCol64 = 0;
          this.cursorRow64++;
        } else if (code >= 1 && code <= 31) {
          const word = this.dict.words[code - 1];
          if (word) for (const ch of word) this._printChar64(ch.charCodeAt(0));
        } else if (code >= 32 && code <= 127) {
          this._printChar64(code);
        } else if (code >= 128 && code <= 223) {
          const bi = this.dict.bigrams[code - 128];
          if (bi) { this._printChar64(bi.charCodeAt(0)); this._printChar64(bi.charCodeAt(1)); }
        } else {
          const tri = this.dict.trigrams[code - 224];
          if (tri) { this._printChar64(tri.charCodeAt(0)); this._printChar64(tri.charCodeAt(1)); this._printChar64(tri.charCodeAt(2)); }
        }
      }
    }

    // 0x89: ELLIPSE_OUTLINE_ABS
    else if (b === 0x89) {
      const [cx, cy] = this._readAbs(); const rx = this._u8() * 2, ry = this._u8() * 2;
      this._ellipseOutline(cx, cy, rx, ry); this.penX = cx; this.penY = cy;
    }
    // 0x8A: ELLIPSE_FILL_ABS
    else if (b === 0x8A) {
      const [cx, cy] = this._readAbs(); const rx = this._u8() * 2, ry = this._u8() * 2;
      this._ellipseFill(cx, cy, rx, ry); this.penX = cx; this.penY = cy;
    }
    // 0x8B: ELLIPSE_OUTLINE_CHAIN
    else if (b === 0x8B) {
      const rx = this._u8() * 2, ry = this._u8() * 2;
      this._ellipseOutline(this.penX, this.penY, rx, ry);
    }
    // 0x8C: ELLIPSE_FILL_CHAIN
    else if (b === 0x8C) {
      const rx = this._u8() * 2, ry = this._u8() * 2;
      this._ellipseFill(this.penX, this.penY, rx, ry);
    }

    return true;
  }

  /** Run all opcodes to completion (wait_key is skipped). */
  run() {
    this.halted = false;
    while (!this.halted) {
      if (this._runOneOpcode() === false) {
        if (this.waitingKey) { this.waitingKey = false; continue; }
        break;
      }
    }
  }

  /**
   * Run one step (one opcode). Returns true if more opcodes remain.
   * @returns {boolean}
   */
  runStep() {
    if (this.halted) return false;
    if (this.waitingKey) { this.waitingKey = false; }
    const result = this._runOneOpcode();
    if (result === false && !this.waitingKey) this.halted = true;
    return !this.halted;
  }

  /**
   * Render pixels + attrs to a canvas.
   * @param {HTMLCanvasElement} canvas
   */
  render(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(ZGS_SCREEN_W, ZGS_SCREEN_H);
    const d = imgData.data;
    for (let sy = 0; sy < ZGS_SCREEN_H; sy++) {
      const ay = sy >> 3;
      for (let sx = 0; sx < ZGS_SCREEN_W; sx++) {
        const a = this.attrs[ay * 32 + (sx >> 3)];
        const ink = a & 7, paper = (a >> 3) & 7, bright = (a >> 6) & 1;
        const pal = bright ? ZX_BRIGHT : ZX_NORMAL;
        const colour = this.pixels[sy * ZGS_SCREEN_W + sx] ? pal[ink] : pal[paper];
        const off = (sy * ZGS_SCREEN_W + sx) * 4;
        d[off] = colour[0]; d[off + 1] = colour[1]; d[off + 2] = colour[2]; d[off + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }
}

// =============================================================================
// ZgsDisassembler
// =============================================================================

class ZgsDisassembler {
  /** @param {Uint8Array} data */
  constructor(data) {
    this.data = data;
    this.pc = 0;
    /** @type {string[]} */
    this.lines = [];
    this.indent = '';
  }

  _u8() { return this.data[this.pc++]; }
  _s8() { const v = this.data[this.pc++]; return v < 128 ? v : v - 256; }
  _readAbs() { return [this._u8() & 0x7F, this._u8() & 0x7F]; }
  _readShortDelta() {
    const b = this._u8();
    let dx = (b >> 4) & 0xF, dy = b & 0xF;
    if (dx >= 8) dx -= 16;
    if (dy >= 8) dy -= 16;
    return [dx, dy];
  }
  _readMedDelta() { return [this._s8(), this._s8()]; }

  /** @param {string} text */
  _emit(text) { this.lines.push(this.indent + text); }

  /** @param {number} idx */
  _colourName(idx) { return (idx >= 0 && idx < 8) ? ZGS_COLOUR_NAMES[idx] : String(idx); }

  /** @param {number} idx */
  _patternName(idx) { return (idx >= 0 && idx < 8) ? ZGS_PATTERN_NAMES[idx] : String(idx); }

  /**
   * Disassemble binary .zgs to text.
   * @returns {string}
   */
  disassemble() {
    if (this.data.length < 10 || this.data[0] !== 0x5A || this.data[1] !== 0x47)
      throw new Error("Not a valid ZGS file");
    const version = this.data[2];
    if (version !== 0x01) throw new Error("Expected version 1, got " + version);
    const flags = this.data[3];
    const assetLibOff = this.data[6] | (this.data[7] << 8);
    const sceneOff = this.data[8] | (this.data[9] << 8);

    this.lines.push('; ZGS text format v' + version);
    this.lines.push('');

    // Parse assets
    if (assetLibOff && (flags & 1)) {
      this.pc = assetLibOff;
      const count = this._u8();
      for (let i = 0; i < count; i++) {
        const assetType = this._u8();
        const dataLen = this.data[this.pc] | (this.data[this.pc + 1] << 8);
        this.pc += 2;
        const assetStart = this.pc;
        const assetEnd = this.pc + dataLen;

        if (assetType === 0x01) {
          this._emit('.sub ' + i);
          this.indent = '  ';
          while (this.pc < assetEnd) this._disasmOpcode();
          this.indent = '';
          this._emit('.endsub');
          this.lines.push('');
        } else if (assetType === 0x00) {
          this._emit('.sprite ' + i);
          this.indent = '  ';
          const w = this.data[assetStart], h = this.data[assetStart + 1];
          this._emit('size ' + w + ', ' + h);
          let pos = assetStart + 2;
          for (let row = 0; row < h; row++) {
            const rowBytes = [];
            for (let col = 0; col < w; col++) {
              if (pos < assetEnd) rowBytes.push('0x' + this.data[pos++].toString(16).padStart(2, '0'));
            }
            this._emit('db ' + rowBytes.join(', '));
          }
          this.pc = assetEnd;
          this.indent = '';
          this._emit('.endsprite');
          this.lines.push('');
        } else {
          this.pc = assetEnd;
        }
      }
    }

    // Parse scene — stop at END opcode (0x18) or EOF
    this.pc = sceneOff;
    this.lines.push('; scene');
    while (this.pc < this.data.length) {
      if (this.data[this.pc] === 0x18) {
        this._disasmOpcode();
        break;
      }
      this._disasmOpcode();
    }

    return this.lines.join('\n') + '\n';
  }

  _disasmOpcode() {
    const b = this._u8();

    if (b <= 0x0F) {
      const ink = b & 7, bright = (b >> 3) & 1;
      this._emit('set_ink ' + this._colourName(ink) + (bright ? ' bright' : ''));
    } else if (b <= 0x17) {
      this._emit('set_pattern ' + this._patternName(b & 7));
    } else if (b === 0x18) {
      this._emit('end');
    } else if (b === 0x19) {
      this._emit('flood_chain');
    } else if (b === 0x1A) {
      this._emit('dot_chain');
    } else if (b === 0x1B) {
      const mode = this._u8();
      this._emit('set_mode ' + (mode === 1 ? 'xor' : 'set'));
    } else if (b <= 0x1F) {
      this._emit('; reserved 0x' + b.toString(16).padStart(2, '0'));
    } else if (b <= 0x5F) {
      const val = b - 0x20;
      const dx = ((val >> 3) & 7) - 4, dy = (val & 7) - 4;
      this._emit('move_short ' + dx + ', ' + dy);
    } else if (b === 0x60) {
      const [x, y] = this._readAbs(); this._emit('move_abs ' + x + ', ' + y);
    } else if (b === 0x61) {
      const [dx, dy] = this._readMedDelta(); this._emit('move_dmed ' + dx + ', ' + dy);
    } else if (b === 0x62) {
      const [x, y] = this._readAbs(); this._emit('dot_abs ' + x + ', ' + y);
    } else if (b === 0x63) {
      const count = this._u8();
      const pts = [];
      for (let i = 0; i < count; i++) { const [x, y] = this._readAbs(); pts.push(x + ' ' + y); }
      this._emit('dot_batch ' + pts.join(', '));
    } else if (b === 0x64) {
      const [dx, dy] = this._readShortDelta(); this._emit('line_dshort ' + dx + ', ' + dy);
    } else if (b === 0x65) {
      const [dx, dy] = this._readMedDelta(); this._emit('line_dmed ' + dx + ', ' + dy);
    } else if (b === 0x66) {
      const count = this._u8();
      const pts = [];
      for (let i = 0; i < count; i++) { const [dx, dy] = this._readMedDelta(); pts.push(dx + ' ' + dy); }
      this._emit('line_batch ' + pts.join(', '));
    } else if (b === 0x67) {
      this._emit('hline_chain ' + this._s8());
    } else if (b === 0x68) {
      const [x, y] = this._readAbs(); const len = this._s8();
      this._emit('hline_abs ' + x + ', ' + y + ', ' + len);
    } else if (b === 0x69) {
      this._emit('vline_chain ' + this._s8());
    } else if (b === 0x6A) {
      const [x, y] = this._readAbs(); const len = this._s8();
      this._emit('vline_abs ' + x + ', ' + y + ', ' + len);
    } else if (b === 0x6B) {
      const [x, y] = this._readAbs(); const w = this._u8(), h = this._u8();
      this._emit('rect_outline_abs ' + x + ', ' + y + ', ' + w + ', ' + h);
    } else if (b === 0x6C) {
      const [x, y] = this._readAbs(); const w = this._u8(), h = this._u8();
      this._emit('rect_fill_abs ' + x + ', ' + y + ', ' + w + ', ' + h);
    } else if (b === 0x6D) {
      const w = this._u8(), h = this._u8();
      this._emit('rect_outline_chain ' + w + ', ' + h);
    } else if (b === 0x6E) {
      const w = this._u8(), h = this._u8();
      this._emit('rect_fill_chain ' + w + ', ' + h);
    } else if (b === 0x6F) {
      const count = this._u8(); const rects = [];
      for (let i = 0; i < count; i++) {
        const [x, y] = this._readAbs(); const w = this._u8(), h = this._u8();
        rects.push(x + ' ' + y + ' ' + w + ' ' + h);
      }
      this._emit('rect_outline_batch ' + rects.join(', '));
    } else if (b === 0x70) {
      const count = this._u8(); const rects = [];
      for (let i = 0; i < count; i++) {
        const [x, y] = this._readAbs(); const w = this._u8(), h = this._u8();
        rects.push(x + ' ' + y + ' ' + w + ' ' + h);
      }
      this._emit('rect_fill_batch ' + rects.join(', '));
    } else if (b === 0x71) {
      const count = this._u8();
      const [x0, y0] = this._readAbs();
      /** @type {Array<[number, number]>} */
      const verts = [[x0, y0]];
      for (let i = 1; i < count; i++) {
        const [dx, dy] = this._readMedDelta();
        verts.push([verts[verts.length - 1][0] + dx, verts[verts.length - 1][1] + dy]);
      }
      this._emit('polygon_outline ' + verts.map(v => v[0] + ' ' + v[1]).join(', '));
    } else if (b === 0x72) {
      const count = this._u8();
      const [x0, y0] = this._readAbs();
      /** @type {Array<[number, number]>} */
      const verts = [[x0, y0]];
      for (let i = 1; i < count; i++) {
        const [dx, dy] = this._readMedDelta();
        verts.push([verts[verts.length - 1][0] + dx, verts[verts.length - 1][1] + dy]);
      }
      this._emit('polygon_fill ' + verts.map(v => v[0] + ' ' + v[1]).join(', '));
    } else if (b === 0x73) {
      const [cx, cy] = this._readAbs(); const r = this._u8();
      this._emit('circle_outline_abs ' + cx + ', ' + cy + ', ' + r);
    } else if (b === 0x74) {
      const [cx, cy] = this._readAbs(); const r = this._u8();
      this._emit('circle_fill_abs ' + cx + ', ' + cy + ', ' + r);
    } else if (b === 0x75) {
      this._emit('circle_outline_chain ' + this._u8());
    } else if (b === 0x76) {
      this._emit('circle_fill_chain ' + this._u8());
    } else if (b === 0x77) {
      const [x, y] = this._readAbs(); this._emit('flood_abs ' + x + ', ' + y);
    } else if (b === 0x78) {
      const idx = this._u8(); const [x, y] = this._readAbs();
      this._emit('stamp_abs ' + idx + ', ' + x + ', ' + y);
    } else if (b === 0x79) {
      this._emit('stamp_chain ' + this._u8());
    } else if (b === 0x7A) {
      const count = this._u8(), strideDx = this._s8(), strideDy = this._s8(), bodyLen = this._u8();
      const bodyEnd = this.pc + bodyLen;
      this._emit('.repeat ' + count + ', ' + strideDx + ', ' + strideDy);
      const savedIndent = this.indent; this.indent += '  ';
      while (this.pc < bodyEnd) this._disasmOpcode();
      this.indent = savedIndent; this._emit('.endrepeat');
    } else if (b === 0x7B) {
      this._emit('call ' + this._u8());
    } else if (b === 0x7C) {
      const val = this._u8(); const paper = (val >> 3) & 7, bright = (val >> 6) & 1;
      this._emit('set_paper ' + this._colourName(paper) + (bright ? ' bright' : ''));
    } else if (b === 0x7D) {
      const val = this._u8(); this._emit('set_attr 0x' + val.toString(16).padStart(2, '0'));
    } else if (b === 0x7E) {
      const col = this._u8(), row = this._u8(), w = this._u8(), h = this._u8(), a = this._u8();
      this._emit('clear_region ' + col + ', ' + row + ', ' + w + ', ' + h + ', 0x' + a.toString(16).padStart(2, '0'));
    } else if (b === 0x7F) {
      this._emit('wait_key');
    } else if (b === 0x80) {
      const col = this._u8(), row = this._u8();
      this._emit('set_cursor ' + col + ', ' + row);
    } else if (b === 0x81) {
      const len = this._u8();
      let str = '';
      for (let i = 0; i < len; i++) {
        const ch = this._u8();
        if (ch === 0x22) str += '\\"';
        else if (ch === 0x5C) str += '\\\\';
        else if (ch >= 32 && ch <= 127) str += String.fromCharCode(ch);
        else str += '\\x' + ch.toString(16).padStart(2, '0');
      }
      this._emit('print_text "' + str + '"');
    } else if (b === 0x82) {
      const len = this._u8();
      const dict = ZGS_DEFAULT_DICT_LOWER;
      let str = '';
      for (let i = 0; i < len; i++) {
        const code = this._u8();
        const decoded = zgsUnpackByte(code, dict);
        for (const ch of decoded) {
          if (ch === '"') str += '\\"';
          else if (ch === '\\') str += '\\\\';
          else if (ch === '\n') str += '\\n';
          else str += ch;
        }
      }
      this._emit('print_packed "' + str + '"');
    } else if (b === 0x83) {
      const col = this._u8(), row = this._u8();
      this._emit('set_cursor_42 ' + col + ', ' + row);
    } else if (b === 0x84) {
      const len = this._u8();
      let str = '';
      for (let i = 0; i < len; i++) {
        const ch = this._u8();
        if (ch === 0x22) str += '\\"';
        else if (ch === 0x5C) str += '\\\\';
        else if (ch >= 32 && ch <= 127) str += String.fromCharCode(ch);
        else str += '\\x' + ch.toString(16).padStart(2, '0');
      }
      this._emit('print_text_42 "' + str + '"');
    } else if (b === 0x85) {
      const len = this._u8();
      const dict = ZGS_DEFAULT_DICT_LOWER;
      let str = '';
      for (let i = 0; i < len; i++) {
        const code = this._u8();
        const decoded = zgsUnpackByte(code, dict);
        for (const ch of decoded) {
          if (ch === '"') str += '\\"';
          else if (ch === '\\') str += '\\\\';
          else if (ch === '\n') str += '\\n';
          else str += ch;
        }
      }
      this._emit('print_packed_42 "' + str + '"');
    } else if (b === 0x86) {
      const col = this._u8(), row = this._u8();
      this._emit('set_cursor_64 ' + col + ', ' + row);
    } else if (b === 0x87) {
      const len = this._u8();
      let str = '';
      for (let i = 0; i < len; i++) {
        const ch = this._u8();
        if (ch === 0x22) str += '\\"';
        else if (ch === 0x5C) str += '\\\\';
        else if (ch >= 32 && ch <= 127) str += String.fromCharCode(ch);
        else str += '\\x' + ch.toString(16).padStart(2, '0');
      }
      this._emit('print_text_64 "' + str + '"');
    } else if (b === 0x88) {
      const len = this._u8();
      const dict = ZGS_DEFAULT_DICT_LOWER;
      let str = '';
      for (let i = 0; i < len; i++) {
        const code = this._u8();
        const decoded = zgsUnpackByte(code, dict);
        for (const ch of decoded) {
          if (ch === '"') str += '\\"';
          else if (ch === '\\') str += '\\\\';
          else if (ch === '\n') str += '\\n';
          else str += ch;
        }
      }
      this._emit('print_packed_64 "' + str + '"');
    } else if (b === 0x89) {
      const [cx, cy] = this._readAbs(); const rx = this._u8(), ry = this._u8();
      this._emit('ellipse_outline_abs ' + cx + ', ' + cy + ', ' + rx + ', ' + ry);
    } else if (b === 0x8A) {
      const [cx, cy] = this._readAbs(); const rx = this._u8(), ry = this._u8();
      this._emit('ellipse_fill_abs ' + cx + ', ' + cy + ', ' + rx + ', ' + ry);
    } else if (b === 0x8B) {
      const rx = this._u8(), ry = this._u8();
      this._emit('ellipse_outline_chain ' + rx + ', ' + ry);
    } else if (b === 0x8C) {
      const rx = this._u8(), ry = this._u8();
      this._emit('ellipse_fill_chain ' + rx + ', ' + ry);
    } else {
      this._emit('; unknown 0x' + b.toString(16).padStart(2, '0'));
    }
  }
}

// =============================================================================
// ZgsAssembler
// =============================================================================

class ZgsAssembler {
  /** @param {string} text */
  constructor(text) {
    this.text = text;
    /** @type {Uint8Array[]} */
    this.subs = [];
    /** @type {Uint8Array[]} */
    this.sprites = [];
    /** @type {Array<{kind: string, idx: number}>} */
    this.assets = [];
    /** @type {number[]} */
    this.scene = [];
    /** @type {Array<{line: number, msg: string}>} */
    this.errors = [];
    /** @type {Array<{byteOffset: number, lineNum: number}>} */
    this.sourceMap = [];
    /** @type {{bigrams: string[], trigrams: string[], words: string[]}} */
    this.dict = ZGS_DEFAULT_DICT_LOWER;
  }

  /** @param {string} name */
  _parseColour(name) {
    name = name.trim().toLowerCase();
    if (name in ZGS_COLOUR_MAP) return ZGS_COLOUR_MAP[name];
    return parseInt(name, 10) || 0;
  }

  /** @param {string} name */
  _parsePattern(name) {
    name = name.trim().toLowerCase();
    const idx = ZGS_PATTERN_NAMES.indexOf(name);
    return idx >= 0 ? idx : (parseInt(name, 10) || 0);
  }

  /** @param {string} s */
  _parseInt(s) {
    s = s.trim();
    if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
    return parseInt(s, 10);
  }

  /** @param {string} text */
  _splitArgs(text) {
    if (!text.trim()) return [];
    return text.split(',').map(a => a.trim());
  }

  /** @param {string} text */
  _splitPairArgs(text) {
    const groups = text.split(',').map(a => a.trim());
    return groups.map(g => {
      const parts = g.split(/\s+/);
      return parts.map(p => this._parseInt(p));
    });
  }

  /**
   * Parse a quoted string argument: "..." with \\, \", \n escapes.
   * @param {string} argText
   * @returns {string}
   */
  _parseString(argText) {
    const s = argText.trim();
    if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') {
      throw new Error('Expected quoted string: ' + argText);
    }
    let result = '';
    for (let i = 1; i < s.length - 1; i++) {
      if (s[i] === '\\' && i + 1 < s.length - 1) {
        const next = s[i + 1];
        if (next === '\\') { result += '\\'; i++; }
        else if (next === '"') { result += '"'; i++; }
        else if (next === 'n') { result += '\n'; i++; }
        else { result += s[i]; }
      } else {
        result += s[i];
      }
    }
    return result;
  }

  /** @param {number} v */
  _signedByte(v) { return v & 0xFF; }

  /**
   * @param {number} lx
   * @param {number} ly
   * @returns {number[]}
   */
  _absCoord(lx, ly) { return [lx & 0x7F, ly & 0x7F]; }

  /**
   * Assemble text to binary.
   * @returns {{data: Uint8Array, errors: Array<{line: number, msg: string}>}}
   */
  assemble() {
    this.errors = [];
    this.subs = [];
    this.sprites = [];
    this.assets = [];
    this.scene = [];
    this.sourceMap = [];

    const lines = this._parseLines();
    this._assembleBlock(lines, this.scene);

    // Append END opcode (0x18) if the scene doesn't already end with one.
    // The JS VM stops at data.length, but the Z80 ASM export has no
    // length guard — without END it reads past the scene into garbage.
    if (!this.scene.length || this.scene[this.scene.length - 1] !== 0x18) {
      this.scene.push(0x18);
    }

    if (this.errors.length) return { data: new Uint8Array(0), errors: this.errors };
    return { data: this._buildFile(), errors: this.errors };
  }

  /** @returns {Array<{num: number, text: string}>} */
  _parseLines() {
    const result = [];
    const raw = this.text.split('\n');
    for (let i = 0; i < raw.length; i++) {
      const line = raw[i].split(';')[0].trim();
      if (line) result.push({ num: i + 1, text: line });
    }
    return result;
  }

  /**
   * @param {Array<{num: number, text: string}>} lines
   * @param {number[]} target
   */
  _assembleBlock(lines, target) {
    let i = 0;
    while (i < lines.length) {
      const { num, text } = lines[i];
      const lower = text.toLowerCase();

      // .sub N
      if (lower.startsWith('.sub')) {
        /** @type {number[]} */
        const subBuf = [];
        i++;
        const subLines = [];
        while (i < lines.length) {
          if (lines[i].text.toLowerCase().trim() === '.endsub') { i++; break; }
          subLines.push(lines[i]);
          i++;
        }
        this._assembleBlock(subLines, subBuf);
        const idx = this.subs.length;
        this.subs.push(new Uint8Array(subBuf));
        this.assets.push({ kind: 'script', idx });
        continue;
      }

      // .sprite N
      if (lower.startsWith('.sprite')) {
        i++;
        let w = 0, h = 0;
        /** @type {number[]} */
        const rows = [];
        while (i < lines.length) {
          const ll = lines[i].text.toLowerCase().trim();
          if (ll === '.endsprite') { i++; break; }
          if (ll.startsWith('size')) {
            const args = this._splitArgs(ll.substring(4));
            w = this._parseInt(args[0]); h = this._parseInt(args[1]);
          } else if (ll.startsWith('db')) {
            const hexVals = this._splitArgs(ll.substring(2));
            for (const hv of hexVals) rows.push(this._parseInt(hv));
          }
          i++;
        }
        const spriteBuf = [w, h, ...rows];
        const idx = this.sprites.length;
        this.sprites.push(new Uint8Array(spriteBuf));
        this.assets.push({ kind: 'sprite', idx });
        continue;
      }

      // .repeat count, stride_dx, stride_dy
      if (lower.startsWith('.repeat')) {
        try {
          const args = this._splitArgs(text.substring(7));
          const count = this._parseInt(args[0]);
          const strideDx = this._parseInt(args[1]);
          const strideDy = this._parseInt(args[2]);
          i++;
          const bodyLines = [];
          let depth = 1;
          while (i < lines.length) {
            const ll = lines[i].text.toLowerCase().trim();
            if (ll.startsWith('.repeat')) depth++;
            else if (ll === '.endrepeat') { depth--; if (depth === 0) { i++; break; } }
            bodyLines.push(lines[i]);
            i++;
          }
          /** @type {number[]} */
          const bodyBuf = [];
          this._assembleBlock(bodyLines, bodyBuf);
          target.push(0x7A, count & 0xFF, this._signedByte(strideDx), this._signedByte(strideDy), bodyBuf.length & 0xFF);
          for (const b of bodyBuf) target.push(b);
        } catch (e) {
          this.errors.push({ line: num, msg: 'repeat: ' + e.message });
        }
        continue;
      }

      // .dict lower|upper|user (selects dictionary for print_packed encoding)
      if (lower.startsWith('.dict')) {
        const arg = text.substring(5).trim().toLowerCase();
        if (arg === 'upper') this.dict = ZGS_DEFAULT_DICT_UPPER;
        else if (arg === 'user') this.dict = zgsUserDict || ZGS_DEFAULT_DICT_LOWER;
        else this.dict = ZGS_DEFAULT_DICT_LOWER;
        i++;
        continue;
      }

      // Regular opcode — record source map entry
      if (target === this.scene) {
        this.sourceMap.push({ byteOffset: target.length, lineNum: num });
      }
      this._assembleOpcode(text, num, target);
      // Stop parsing scene after top-level `end` (lines after it are ignored)
      if (target === this.scene && text.split(';')[0].trim().toLowerCase() === 'end') {
        break;
      }
      i++;
    }
  }

  /**
   * @param {string} line
   * @param {number} lineNum
   * @param {number[]} target
   */
  _assembleOpcode(line, lineNum, target) {
    try {
      const parts = line.split(/\s+(.+)/);
      const mnemonic = parts[0].toLowerCase();
      const argText = parts[1] || '';

      if (mnemonic === 'set_ink') {
        const tokens = argText.toLowerCase().split(/\s+/);
        const colour = this._parseColour(tokens[0]);
        const bright = tokens.includes('bright');
        target.push((bright ? 0x08 : 0x00) | (colour & 7));
      } else if (mnemonic === 'set_pattern') {
        target.push(0x10 | (this._parsePattern(argText) & 7));
      } else if (mnemonic === 'end') {
        target.push(0x18);
      } else if (mnemonic === 'flood_chain') {
        target.push(0x19);
      } else if (mnemonic === 'dot_chain') {
        target.push(0x1A);
      } else if (mnemonic === 'set_mode') {
        const mode = argText.trim().toLowerCase();
        if (mode === 'xor') { target.push(0x1B, 1); }
        else if (mode === 'set') { target.push(0x1B, 0); }
        else { errors.push({ line: lineNum, msg: "Unknown mode: " + argText + " (expected 'set' or 'xor')" }); }
      } else if (mnemonic === 'move_short') {
        const args = this._splitArgs(argText);
        const dx = this._parseInt(args[0]), dy = this._parseInt(args[1]);
        target.push(0x20 + ((dx + 4) << 3) + (dy + 4));
      } else if (mnemonic === 'move_abs') {
        const args = this._splitArgs(argText);
        target.push(0x60, ...this._absCoord(this._parseInt(args[0]), this._parseInt(args[1])));
      } else if (mnemonic === 'move_dmed') {
        const args = this._splitArgs(argText);
        target.push(0x61, this._signedByte(this._parseInt(args[0])), this._signedByte(this._parseInt(args[1])));
      } else if (mnemonic === 'dot_abs') {
        const args = this._splitArgs(argText);
        target.push(0x62, ...this._absCoord(this._parseInt(args[0]), this._parseInt(args[1])));
      } else if (mnemonic === 'dot_batch') {
        const pairs = this._splitPairArgs(argText);
        target.push(0x63, pairs.length & 0xFF);
        for (const p of pairs) target.push(...this._absCoord(p[0], p[1]));
      } else if (mnemonic === 'line_dshort') {
        const args = this._splitArgs(argText);
        const dx = this._parseInt(args[0]), dy = this._parseInt(args[1]);
        target.push(0x64, ((dx & 0xF) << 4) | (dy & 0xF));
      } else if (mnemonic === 'line_dmed') {
        const args = this._splitArgs(argText);
        target.push(0x65, this._signedByte(this._parseInt(args[0])), this._signedByte(this._parseInt(args[1])));
      } else if (mnemonic === 'line_batch') {
        const pairs = this._splitPairArgs(argText);
        target.push(0x66, pairs.length & 0xFF);
        for (const p of pairs) { target.push(this._signedByte(p[0]), this._signedByte(p[1])); }
      } else if (mnemonic === 'hline_chain') {
        target.push(0x67, this._signedByte(this._parseInt(this._splitArgs(argText)[0])));
      } else if (mnemonic === 'hline_abs') {
        const args = this._splitArgs(argText);
        target.push(0x68, ...this._absCoord(this._parseInt(args[0]), this._parseInt(args[1])), this._signedByte(this._parseInt(args[2])));
      } else if (mnemonic === 'vline_chain') {
        target.push(0x69, this._signedByte(this._parseInt(this._splitArgs(argText)[0])));
      } else if (mnemonic === 'vline_abs') {
        const args = this._splitArgs(argText);
        target.push(0x6A, ...this._absCoord(this._parseInt(args[0]), this._parseInt(args[1])), this._signedByte(this._parseInt(args[2])));
      } else if (mnemonic === 'rect_outline_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x6B, ...this._absCoord(args[0], args[1]), args[2] & 0xFF, args[3] & 0xFF);
      } else if (mnemonic === 'rect_fill_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x6C, ...this._absCoord(args[0], args[1]), args[2] & 0xFF, args[3] & 0xFF);
      } else if (mnemonic === 'rect_outline_chain') {
        const args = this._splitArgs(argText);
        target.push(0x6D, this._parseInt(args[0]) & 0xFF, this._parseInt(args[1]) & 0xFF);
      } else if (mnemonic === 'rect_fill_chain') {
        const args = this._splitArgs(argText);
        target.push(0x6E, this._parseInt(args[0]) & 0xFF, this._parseInt(args[1]) & 0xFF);
      } else if (mnemonic === 'rect_outline_batch') {
        const quads = this._splitPairArgs(argText);
        target.push(0x6F, quads.length & 0xFF);
        for (const q of quads) target.push(...this._absCoord(q[0], q[1]), q[2] & 0xFF, q[3] & 0xFF);
      } else if (mnemonic === 'rect_fill_batch') {
        const quads = this._splitPairArgs(argText);
        target.push(0x70, quads.length & 0xFF);
        for (const q of quads) target.push(...this._absCoord(q[0], q[1]), q[2] & 0xFF, q[3] & 0xFF);
      } else if (mnemonic === 'polygon_outline') {
        const pairs = this._splitPairArgs(argText);
        target.push(0x71, pairs.length & 0xFF, ...this._absCoord(pairs[0][0], pairs[0][1]));
        for (let j = 1; j < pairs.length; j++) {
          target.push(this._signedByte(pairs[j][0] - pairs[j - 1][0]), this._signedByte(pairs[j][1] - pairs[j - 1][1]));
        }
      } else if (mnemonic === 'polygon_fill') {
        const pairs = this._splitPairArgs(argText);
        target.push(0x72, pairs.length & 0xFF, ...this._absCoord(pairs[0][0], pairs[0][1]));
        for (let j = 1; j < pairs.length; j++) {
          target.push(this._signedByte(pairs[j][0] - pairs[j - 1][0]), this._signedByte(pairs[j][1] - pairs[j - 1][1]));
        }
      } else if (mnemonic === 'circle_outline_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x73, ...this._absCoord(args[0], args[1]), args[2] & 0xFF);
      } else if (mnemonic === 'circle_fill_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x74, ...this._absCoord(args[0], args[1]), args[2] & 0xFF);
      } else if (mnemonic === 'circle_outline_chain') {
        target.push(0x75, this._parseInt(this._splitArgs(argText)[0]) & 0xFF);
      } else if (mnemonic === 'circle_fill_chain') {
        target.push(0x76, this._parseInt(this._splitArgs(argText)[0]) & 0xFF);
      } else if (mnemonic === 'flood_abs') {
        const args = this._splitArgs(argText);
        target.push(0x77, ...this._absCoord(this._parseInt(args[0]), this._parseInt(args[1])));
      } else if (mnemonic === 'stamp_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x78, args[0] & 0xFF, ...this._absCoord(args[1], args[2]));
      } else if (mnemonic === 'stamp_chain') {
        target.push(0x79, this._parseInt(this._splitArgs(argText)[0]) & 0xFF);
      } else if (mnemonic === 'call') {
        target.push(0x7B, this._parseInt(this._splitArgs(argText)[0]) & 0xFF);
      } else if (mnemonic === 'set_paper') {
        const tokens = argText.toLowerCase().split(/\s+/);
        const colour = this._parseColour(tokens[0]);
        const bright = tokens.includes('bright');
        target.push(0x7C, ((colour & 7) << 3) | (bright ? 0x40 : 0x00));
      } else if (mnemonic === 'set_attr') {
        target.push(0x7D, this._parseInt(this._splitArgs(argText)[0]) & 0xFF);
      } else if (mnemonic === 'clear_region') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x7E, args[0] & 0xFF, args[1] & 0xFF, args[2] & 0xFF, args[3] & 0xFF, args[4] & 0xFF);
      } else if (mnemonic === 'wait_key') {
        target.push(0x7F);
      } else if (mnemonic === 'set_cursor') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x80, args[0] & 0xFF, args[1] & 0xFF);
      } else if (mnemonic === 'print_text') {
        const str = this._parseString(argText);
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
          const c = str.charCodeAt(i);
          bytes.push(c >= 32 && c <= 127 ? c : 32);
        }
        target.push(0x81, bytes.length & 0xFF, ...bytes);
      } else if (mnemonic === 'print_packed') {
        const str = this._parseString(argText);
        const packed = zgsPackText(str, this.dict);
        target.push(0x82, packed.length & 0xFF, ...packed);
      } else if (mnemonic === 'set_cursor_42') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x83, args[0] & 0xFF, args[1] & 0xFF);
      } else if (mnemonic === 'print_text_42') {
        const str = this._parseString(argText);
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
          const c = str.charCodeAt(i);
          bytes.push(c >= 32 && c <= 127 ? c : 32);
        }
        target.push(0x84, bytes.length & 0xFF, ...bytes);
      } else if (mnemonic === 'print_packed_42') {
        const str = this._parseString(argText);
        const packed = zgsPackText(str, this.dict);
        target.push(0x85, packed.length & 0xFF, ...packed);
      } else if (mnemonic === 'set_cursor_64') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x86, args[0] & 0xFF, args[1] & 0xFF);
      } else if (mnemonic === 'print_text_64') {
        const str = this._parseString(argText);
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
          const c = str.charCodeAt(i);
          bytes.push(c >= 32 && c <= 127 ? c : 32);
        }
        target.push(0x87, bytes.length & 0xFF, ...bytes);
      } else if (mnemonic === 'print_packed_64') {
        const str = this._parseString(argText);
        const packed = zgsPackText(str, this.dict);
        target.push(0x88, packed.length & 0xFF, ...packed);
      } else if (mnemonic === 'ellipse_outline_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x89, ...this._absCoord(args[0], args[1]), args[2] & 0xFF, args[3] & 0xFF);
      } else if (mnemonic === 'ellipse_fill_abs') {
        const args = this._splitArgs(argText).map(a => this._parseInt(a));
        target.push(0x8A, ...this._absCoord(args[0], args[1]), args[2] & 0xFF, args[3] & 0xFF);
      } else if (mnemonic === 'ellipse_outline_chain') {
        const args = this._splitArgs(argText);
        target.push(0x8B, this._parseInt(args[0]) & 0xFF, this._parseInt(args[1]) & 0xFF);
      } else if (mnemonic === 'ellipse_fill_chain') {
        const args = this._splitArgs(argText);
        target.push(0x8C, this._parseInt(args[0]) & 0xFF, this._parseInt(args[1]) & 0xFF);
      } else {
        this.errors.push({ line: lineNum, msg: 'Unknown mnemonic: ' + mnemonic });
      }
    } catch (e) {
      this.errors.push({ line: lineNum, msg: e.message });
    }
  }

  /** @returns {Uint8Array} */
  _buildFile() {
    const hasAssets = this.assets.length > 0;

    // Build asset library blob
    /** @type {number[]} */
    const assetBlob = [];
    if (hasAssets) {
      assetBlob.push(this.assets.length & 0xFF);
      for (const { kind, idx } of this.assets) {
        if (kind === 'script') {
          assetBlob.push(0x01);
          const data = this.subs[idx];
          assetBlob.push(data.length & 0xFF, (data.length >> 8) & 0xFF);
          for (let j = 0; j < data.length; j++) assetBlob.push(data[j]);
        } else {
          assetBlob.push(0x00);
          const data = this.sprites[idx];
          assetBlob.push(data.length & 0xFF, (data.length >> 8) & 0xFF);
          for (let j = 0; j < data.length; j++) assetBlob.push(data[j]);
        }
      }
    }

    const headerSize = 10;
    const assetOffset = hasAssets ? headerSize : 0;
    const sceneOffset = headerSize + assetBlob.length;
    const totalSize = sceneOffset + this.scene.length;
    const flags = hasAssets ? 0x01 : 0x00;

    const result = new Uint8Array(totalSize);
    // Header
    result[0] = 0x5A; result[1] = 0x47; // ZG
    result[2] = 0x01; // version
    result[3] = flags;
    result[4] = totalSize & 0xFF; result[5] = (totalSize >> 8) & 0xFF;
    result[6] = assetOffset & 0xFF; result[7] = (assetOffset >> 8) & 0xFF;
    result[8] = sceneOffset & 0xFF; result[9] = (sceneOffset >> 8) & 0xFF;
    // Asset library
    for (let i = 0; i < assetBlob.length; i++) result[headerSize + i] = assetBlob[i];
    // Scene
    for (let i = 0; i < this.scene.length; i++) result[sceneOffset + i] = this.scene[i];

    // Adjust source map offsets to absolute positions in the binary
    for (const entry of this.sourceMap) {
      entry.byteOffset += sceneOffset;
    }

    return result;
  }
}


// =============================================================================
// Editor State & UI (standalone page)
// =============================================================================

// --- Multi-scene data model ---

/** @typedef {Object} ZgsScene
 * @property {string} name
 * @property {string} sourceText
 * @property {Uint8Array|null} lastBinary
 * @property {Array<{text: string, selStart: number, selEnd: number}>} undoStack
 * @property {Array<{text: string, selStart: number, selEnd: number}>} redoStack
 * @property {number} scrollTop
 * @property {number} selStart
 * @property {number} selEnd
 * @property {HTMLImageElement|null} refImage
 * @property {string|null} refImageDataURL
 * @property {boolean} refShow
 * @property {number} refOpacity
 * @property {number} refOffsetX
 * @property {number} refOffsetY
 * @property {number|null} refWidth
 * @property {number|null} refHeight
 */

/**
 * Create a new blank scene object.
 * @param {string} name
 * @returns {ZgsScene}
 */
function zgsCreateScene(name) {
  return {
    name,
    sourceText: '',
    lastBinary: null,
    undoStack: [],
    redoStack: [],
    scrollTop: 0,
    selStart: 0,
    selEnd: 0,
    refImage: null,
    refImageDataURL: null,
    refShow: true,
    refOpacity: 0.3,
    refOffsetX: 0,
    refOffsetY: 0,
    refWidth: null,
    refHeight: null,
  };
}

/** @type {ZgsScene[]} */
let zgsScenes = [];
/** @type {number} */
let zgsActiveSceneIdx = 0;
/** @type {string} */
let zgsProjectName = 'untitled';
const ZGS_MAX_SCENES = 127; // scene_num is byte, add a,a limits to 127

/** @returns {ZgsScene} */
function zgsActiveScene() { return zgsScenes[zgsActiveSceneIdx]; }

/** @type {boolean} */
let zgsPlaying = false;
/** @type {number|null} */
let zgsAnimTimer = null;
/** @type {Function|null} */
let zgsWaitKeyHandler = null;
/** @type {ZgsVM|null} */
let zgsVM = null;
/** @type {number} */
let zgsAnimSpeed = 37;

// Interactive drawing state
/** @type {string} */
let zgsTool = 'dot';
/** @type {{lx:number,ly:number,px:number,py:number}|null} */
let zgsLastTextHover = null;
/** @type {{col: number, row: number, mode: number}|null} */
let zgsTextCursorPos = null;
/** @type {{[mode: number]: {col: number, row: number}}} Per-mode cursor memory */
const zgsTextCursorByMode = {};
/** @type {boolean} */
let zgsDrawing = false;
/** @type {{lx: number, ly: number}|null} */
let zgsDrawStart = null;
/** @type {{lx: number, ly: number}|null} */
let zgsDrawEnd = null;
/** @type {{lx: number, ly: number}|null} Polyline anchor for multi-segment line drawing */
let zgsPolylineAnchor = null;
/** @type {{lx:number, ly:number}|null} Current mouse position during polyline tracking (no button held) */
let zgsPolylineTrackPos = null;
/** @type {number} Mouse button that started current drag (0=left, 2=right) */
let zgsDrawButton = 0;
/** @type {{ctrl: boolean, alt: boolean}} Modifier keys during current drag */
let zgsDrawModifiers = { ctrl: false, alt: false };
/** @type {boolean} */
let zgsShowPen = true;
/** @type {boolean} */
let zgsShowGrid = false;

// Current color state (UI-side, synced to VM via instructions before drawing)
let zgsInkIdx = 7;    // 0-7 colour index (default: white)
let zgsPaperIdx = 0;  // 0-7 colour index (default: black)
let zgsBright = false;
let zgsFlash = false;
/** @type {boolean} Flag: color state needs to be synced to VM before next draw */
let zgsColorDirty = false;

// Undo/Redo state (per-scene, stored in zgsActiveScene())
const ZGS_MAX_UNDO = 50;
let zgsUndoTypingGroupOpen = false;
/** @type {number|null} */
let zgsUndoTypingTimer = null;
/** @type {Array<{byteOffset: number, lineNum: number}>|null} */
let zgsSourceMap = null;

// DOM refs
/** @type {HTMLTextAreaElement|null} */
let zgsTextarea = null;
/** @type {HTMLCanvasElement|null} */
let zgsCanvas = null;
/** @type {HTMLCanvasElement|null} */
let zgsOverlayCanvas = null;
/** @type {CanvasRenderingContext2D|null} */
let zgsOverlayCtx = null;
/** @type {HTMLElement|null} */
let zgsCoordTooltip = null;
/** @type {HTMLElement|null} */
let zgsCanvasContainer = null;
/** @type {HTMLElement|null} */
let zgsStatus = null;
/** @type {HTMLElement|null} */
let zgsFileNameEl = null;
/** @type {HTMLButtonElement|null} */
let zgsPlayBtn = null;
/** @type {number|null} */
let zgsDebounceTimer = null;
/** Current integer zoom factor */
let zgsZoomFactor = 2;

// =============================================================================
// Undo / Redo
// =============================================================================

/** Save current textarea state to undo stack (call before every programmatic modification). */
function zgsUndoPush() {
  if (!zgsTextarea) return;
  const scene = zgsActiveScene();
  const text = zgsTextarea.value;
  const selStart = zgsTextarea.selectionStart;
  const selEnd = zgsTextarea.selectionEnd;
  // Skip if identical to top of stack
  if (scene.undoStack.length > 0 && scene.undoStack[scene.undoStack.length - 1].text === text) return;
  scene.undoStack.push({ text, selStart, selEnd });
  if (scene.undoStack.length > ZGS_MAX_UNDO) scene.undoStack.shift();
  scene.redoStack.length = 0;
  zgsUndoTypingGroupOpen = false;
}

/** Undo — pop from undo stack, push current to redo, restore state. */
function zgsUndo() {
  const scene = zgsActiveScene();
  if (!zgsTextarea || scene.undoStack.length === 0) return;
  const cur = { text: zgsTextarea.value, selStart: zgsTextarea.selectionStart, selEnd: zgsTextarea.selectionEnd };
  scene.redoStack.push(cur);
  const prev = scene.undoStack.pop();
  zgsTextarea.value = prev.text;
  zgsTextarea.selectionStart = prev.selStart;
  zgsTextarea.selectionEnd = prev.selEnd;
  zgsUndoTypingGroupOpen = false;
  if (zgsUndoTypingTimer !== null) { clearTimeout(zgsUndoTypingTimer); zgsUndoTypingTimer = null; }
  // Re-render
  if (zgsDebounceTimer !== null) { clearTimeout(zgsDebounceTimer); zgsDebounceTimer = null; }
  zgsVM = null;
  zgsRenderInstant();
}

/** Redo — pop from redo stack, push current to undo, restore state. */
function zgsRedo() {
  const scene = zgsActiveScene();
  if (!zgsTextarea || scene.redoStack.length === 0) return;
  const cur = { text: zgsTextarea.value, selStart: zgsTextarea.selectionStart, selEnd: zgsTextarea.selectionEnd };
  scene.undoStack.push(cur);
  const next = scene.redoStack.pop();
  zgsTextarea.value = next.text;
  zgsTextarea.selectionStart = next.selStart;
  zgsTextarea.selectionEnd = next.selEnd;
  zgsUndoTypingGroupOpen = false;
  if (zgsUndoTypingTimer !== null) { clearTimeout(zgsUndoTypingTimer); zgsUndoTypingTimer = null; }
  // Re-render
  if (zgsDebounceTimer !== null) { clearTimeout(zgsDebounceTimer); zgsDebounceTimer = null; }
  zgsVM = null;
  zgsRenderInstant();
}

/** Clear both stacks for active scene (call on file open / new). */
function zgsUndoReset() {
  const scene = zgsActiveScene();
  scene.undoStack.length = 0;
  scene.redoStack.length = 0;
  zgsUndoTypingGroupOpen = false;
  if (zgsUndoTypingTimer !== null) { clearTimeout(zgsUndoTypingTimer); zgsUndoTypingTimer = null; }
}

/**
 * Nudge absolute coordinates in the selected source lines by (dx, dy).
 * Only instructions listed in ZGS_NUDGE_MAP are adjusted; all other lines
 * (comments, relative instructions, directives) are left untouched.
 * Coordinates are clamped to 0–127.
 * @param {number} dx  Horizontal shift (-1, 0, or +1)
 * @param {number} dy  Vertical shift (-1, 0, or +1)
 */
function zgsNudgeSelection(dx, dy) {
  if (!zgsTextarea) return;
  const val = zgsTextarea.value;
  let selStart = zgsTextarea.selectionStart;
  let selEnd = zgsTextarea.selectionEnd;
  if (selStart === selEnd) return; // nothing selected

  // Expand selection to full lines
  while (selStart > 0 && val[selStart - 1] !== '\n') selStart--;
  while (selEnd < val.length && val[selEnd] !== '\n') selEnd++;

  const selectedText = val.slice(selStart, selEnd);
  const lines = selectedText.split('\n');
  let changed = false;

  const newLines = lines.map(line => {
    // Preserve leading whitespace
    const leadMatch = line.match(/^(\s*)/);
    const leadingWS = leadMatch ? leadMatch[1] : '';
    const trimmed = line.slice(leadingWS.length);

    // Strip trailing comment
    const commentIdx = trimmed.indexOf(';');
    const code = commentIdx >= 0 ? trimmed.slice(0, commentIdx) : trimmed;
    const comment = commentIdx >= 0 ? trimmed.slice(commentIdx) : '';

    const codeTrimmed = code.trim();
    if (!codeTrimmed) return line; // blank or comment-only line

    // Split mnemonic from args
    const spaceIdx = codeTrimmed.search(/\s/);
    if (spaceIdx < 0) return line; // mnemonic only, no args
    const mnemonic = codeTrimmed.slice(0, spaceIdx);
    const argText = codeTrimmed.slice(spaceIdx).trim();

    const entry = ZGS_NUDGE_MAP[mnemonic];
    const pairEntry = ZGS_NUDGE_PAIR_MAP[mnemonic];
    if (!entry && !pairEntry) return line; // not a nudgeable instruction

    if (entry) {
      // Simple comma-separated args
      const args = argText.split(',').map(a => {
        const t = a.trim();
        return parseInt(t, t.startsWith('0x') || t.startsWith('0X') ? 16 : 10);
      });
      if (entry.x < args.length) {
        args[entry.x] = Math.max(0, Math.min(127, args[entry.x] + dx));
      }
      if (entry.y < args.length) {
        args[entry.y] = Math.max(0, Math.min(127, args[entry.y] + dy));
      }
      changed = true;
      return leadingWS + mnemonic + ' ' + args.join(', ') + (comment ? ' ' + comment : '');
    }

    // Pair-format: comma separates groups, whitespace separates values within a group
    const groups = argText.split(',').map(g => {
      const parts = g.trim().split(/\s+/);
      return parts.map(p => parseInt(p, p.startsWith('0x') || p.startsWith('0X') ? 16 : 10));
    });
    for (const g of groups) {
      if (pairEntry.x < g.length) {
        g[pairEntry.x] = Math.max(0, Math.min(127, g[pairEntry.x] + dx));
      }
      if (pairEntry.y < g.length) {
        g[pairEntry.y] = Math.max(0, Math.min(127, g[pairEntry.y] + dy));
      }
    }
    changed = true;
    return leadingWS + mnemonic + ' ' + groups.map(g => g.join(' ')).join(', ') + (comment ? ' ' + comment : '');
  });

  if (!changed) return;

  // Push undo before modification
  zgsUndoPush();

  const newText = newLines.join('\n');
  zgsTextarea.value = val.slice(0, selStart) + newText + val.slice(selEnd);

  // Restore selection to the same line range so user can nudge again
  zgsTextarea.selectionStart = selStart;
  zgsTextarea.selectionEnd = selStart + newText.length;

  // Sync and re-render
  zgsActiveScene().sourceText = zgsTextarea.value;
  if (zgsDebounceTimer !== null) { clearTimeout(zgsDebounceTimer); zgsDebounceTimer = null; }
  zgsVM = null;
  zgsRenderInstant();
}

/**
 * Load a ZGS/ZGT/ZGP file into the editor.
 * @param {File} file
 */
function zgsOpenFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    const result = /** @type {ArrayBuffer} */ (reader.result);
    const bytes = new Uint8Array(result);

    // Route .zgp files to project loader
    if (file.name.toLowerCase().endsWith('.zgp')) {
      try {
        const text = new TextDecoder().decode(bytes);
        zgsLoadProject(text);
      } catch (e) {
        zgsSetStatus('Error loading .zgp: ' + e.message, true);
      }
      return;
    }

    const sceneName = file.name.replace(/\.[^.]+$/, '');
    zgsProjectName = sceneName;
    if (zgsFileNameEl) zgsFileNameEl.textContent = zgsProjectName;

    // Check if active scene is empty or has default example text — reuse it
    zgsStoreActiveSceneState();
    const cur = zgsActiveScene();
    const isDefault = zgsIsDefaultScene(cur);

    /** @type {ZgsScene} */
    let scene;
    if (isDefault) {
      // Replace the current empty/default scene
      scene = cur;
      scene.name = sceneName;
    } else {
      // Open as new tab
      if (zgsScenes.length >= ZGS_MAX_SCENES) {
        zgsSetStatus('Maximum ' + ZGS_MAX_SCENES + ' scenes reached', true);
        return;
      }
      scene = zgsCreateScene(sceneName);
      zgsScenes.push(scene);
      zgsActiveSceneIdx = zgsScenes.length - 1;
    }

    // Detect binary vs text
    if (bytes.length >= 2 && bytes[0] === 0x5A && bytes[1] === 0x47) {
      // Binary .zgs — disassemble to text
      try {
        const dis = new ZgsDisassembler(bytes);
        scene.sourceText = dis.disassemble();
        scene.lastBinary = bytes;
      } catch (e) {
        scene.sourceText = '; Error disassembling: ' + e.message + '\n';
        scene.lastBinary = null;
      }
    } else {
      // Text .zgt
      scene.sourceText = new TextDecoder().decode(bytes);
      scene.lastBinary = null;
    }

    zgsRestoreActiveSceneState();
    zgsUndoReset();
    zgsRenderTabs();
    zgsSyncDictDropdown();
    zgsStopPlay();
    zgsVM = null;
    zgsRenderInstant();
  };
  reader.readAsArrayBuffer(file);
}

/** Render VM directly to display canvas at integer scale via putImageData. */
function zgsBlitVM(vm) {
  if (!zgsCanvas) return;
  const z = zgsZoomFactor;
  const ctx = zgsCanvas.getContext('2d');
  if (!ctx) return;
  const dw = ZGS_SCREEN_W * z, dh = ZGS_SCREEN_H * z;
  const dst = ctx.createImageData(dw, dh);
  const dd = dst.data;
  for (let sy = 0; sy < ZGS_SCREEN_H; sy++) {
    const ay = sy >> 3;
    for (let sx = 0; sx < ZGS_SCREEN_W; sx++) {
      const a = vm.attrs[ay * 32 + (sx >> 3)];
      const ink = a & 7, paper = (a >> 3) & 7, bright = (a >> 6) & 1;
      const pal = bright ? ZX_BRIGHT : ZX_NORMAL;
      const colour = vm.pixels[sy * ZGS_SCREEN_W + sx] ? pal[ink] : pal[paper];
      const r = colour[0], g = colour[1], b = colour[2];
      // Write z×z block in physical pixels
      for (let dy = 0; dy < z; dy++) {
        const rowOff = ((sy * z + dy) * dw + sx * z) << 2;
        for (let dx = 0; dx < z; dx++) {
          const di = rowOff + (dx << 2);
          dd[di] = r; dd[di + 1] = g; dd[di + 2] = b; dd[di + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(dst, 0, 0);
}

function zgsRenderInstant() {
  if (!zgsTextarea || !zgsCanvas) return;
  const scene = zgsActiveScene();
  scene.sourceText = zgsTextarea.value;
  const asm = new ZgsAssembler(scene.sourceText);
  const { data, errors } = asm.assemble();

  if (errors.length) {
    zgsSetStatus('Error(s): ' + errors.map(e => 'Line ' + e.line + ': ' + e.msg).join('; '), true);
    return;
  }

  scene.lastBinary = data;

  zgsSourceMap = asm.sourceMap;

  try {
    const vm = new ZgsVM();
    vm.dict = asm.dict;
    vm.loadBinary(data);
    vm.run();
    zgsBlitVM(vm);
    zgsDrawReferenceOverlay();
    zgsVM = vm;
    zgsSetStatus('OK \u2014 ' + data.length + ' bytes, ' + vm.opcodeCount + ' opcodes' +
      (vm.halted && vm.opcodeCount > ZGS_OPCODE_LIMIT ? ' (limit reached)' : ''));
    zgsRefreshOverlay();
  } catch (e) {
    zgsSetStatus('VM error: ' + e.message, true);
  }
}

function zgsTogglePlay() {
  if (zgsPlaying) { zgsStopPlay(); return; }
  if (!zgsTextarea || !zgsCanvas) return;
  const scene = zgsActiveScene();
  scene.sourceText = zgsTextarea.value;
  const asm = new ZgsAssembler(scene.sourceText);
  const { data, errors } = asm.assemble();
  if (errors.length) {
    zgsSetStatus('Error(s): ' + errors.map(e => 'Line ' + e.line + ': ' + e.msg).join('; '), true);
    return;
  }
  scene.lastBinary = data;
  zgsSourceMap = asm.sourceMap;

  const vm = new ZgsVM();
  vm.dict = asm.dict;
  vm.loadBinary(data);
  zgsVM = vm;
  zgsPlaying = true;
  if (zgsPlayBtn) zgsPlayBtn.textContent = 'Pause';
  zgsSetStatus('Playing...');
  zgsAnimTick();
}

function zgsAnimTick() {
  if (!zgsPlaying || !zgsVM || !zgsCanvas) return;
  const more = zgsVM.runStep();
  zgsBlitVM(zgsVM);
  zgsDrawReferenceOverlay();
  zgsRefreshOverlay();
  if (more) {
    if (zgsVM.waitingKey) {
      // Pause playback until user presses a key or clicks the canvas
      zgsSetStatus('Playing \u2014 press any key to continue...');
      zgsWaitKeyHandler = function(ev) {
        document.removeEventListener('keydown', zgsWaitKeyHandler);
        if (zgsCanvasContainer) zgsCanvasContainer.removeEventListener('click', zgsWaitKeyHandler);
        zgsWaitKeyHandler = null;
        if (!zgsPlaying || !zgsVM) return;
        zgsVM.waitingKey = false;
        zgsAnimTimer = window.setTimeout(zgsAnimTick, zgsAnimSpeed);
      };
      document.addEventListener('keydown', zgsWaitKeyHandler);
      if (zgsCanvasContainer) zgsCanvasContainer.addEventListener('click', zgsWaitKeyHandler);
    } else {
      zgsAnimTimer = window.setTimeout(zgsAnimTick, zgsAnimSpeed);
    }
  } else {
    const binary = zgsActiveScene().lastBinary;
    zgsStopPlay();
    zgsSetStatus('Done \u2014 ' + (binary ? binary.length : 0) + ' bytes, ' + zgsVM.opcodeCount + ' opcodes');
  }
}

function zgsStopPlay() {
  zgsPlaying = false;
  if (zgsAnimTimer !== null) { clearTimeout(zgsAnimTimer); zgsAnimTimer = null; }
  if (zgsWaitKeyHandler) {
    document.removeEventListener('keydown', zgsWaitKeyHandler);
    if (zgsCanvasContainer) zgsCanvasContainer.removeEventListener('click', zgsWaitKeyHandler);
    zgsWaitKeyHandler = null;
  }
  if (zgsPlayBtn) zgsPlayBtn.textContent = 'Play';
}

function zgsStep() {
  if (!zgsTextarea || !zgsCanvas) return;
  const scene = zgsActiveScene();
  if (!zgsVM || zgsVM.halted) {
    scene.sourceText = zgsTextarea.value;
    const asm = new ZgsAssembler(scene.sourceText);
    const { data, errors } = asm.assemble();
    if (errors.length) {
      zgsSetStatus('Error(s): ' + errors.map(e => 'Line ' + e.line + ': ' + e.msg).join('; '), true);
      return;
    }
    scene.lastBinary = data;
    zgsSourceMap = asm.sourceMap;
    const vm = new ZgsVM();
    vm.dict = asm.dict;
    vm.loadBinary(data);
    zgsVM = vm;
  }
  zgsStopPlay();
  const more = zgsVM.runStep();
  zgsBlitVM(zgsVM);
  zgsDrawReferenceOverlay();
  zgsRefreshOverlay();
  // Sync source line
  zgsSyncSourceLine(zgsVM.pc);
  if (!more) zgsSetStatus('Done \u2014 ' + (scene.lastBinary ? scene.lastBinary.length : 0) + ' bytes, ' + zgsVM.opcodeCount + ' opcodes');
  else zgsSetStatus('Step ' + zgsVM.opcodeCount);
}

/**
 * @param {string} msg
 * @param {boolean} [isError]
 */
function zgsSetStatus(msg, isError) {
  if (zgsStatus) {
    zgsStatus.textContent = msg;
    zgsStatus.style.color = isError ? 'var(--danger-color)' : '';
  }
}

/**
 * Get the currently selected dictionary from the Dict dropdown.
 * @returns {{bigrams: string[], trigrams: string[], words: string[]}}
 */
function zgsGetSelectedDict() {
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsDictSelect'));
  const val = sel ? sel.value : 'lower';
  if (val === 'user') return zgsUserDict || ZGS_DEFAULT_DICT_LOWER;
  return val === 'upper' ? ZGS_DEFAULT_DICT_UPPER : ZGS_DEFAULT_DICT_LOWER;
}

/**
 * Ensure a .dict directive exists in the source. Inserts one before the first
 * instruction if not already present. Disables the dropdown after first use.
 */
function zgsEnsureDictDirective() {
  if (!zgsTextarea) return;
  const src = zgsTextarea.value;
  if (/^\s*\.dict\s/m.test(src)) return; // already has one
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsDictSelect'));
  const val = sel ? sel.value : 'lower';
  // Insert .dict directive after leading comments, before first instruction
  const lines = src.split('\n');
  let insertIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith(';')) { insertIdx = i + 1; continue; }
    break;
  }
  lines.splice(insertIdx, 0, '.dict ' + val);
  zgsTextarea.value = lines.join('\n');
  // Disable the dropdown — dict is now locked for this file
  if (sel) sel.disabled = true;
}

/**
 * Update an existing .dict directive in the source when the dropdown changes.
 * Does not lock the dropdown — locking only happens when print_packed is first used.
 */
function zgsUpdateDictDirective() {
  if (!zgsTextarea) return;
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsDictSelect'));
  const val = sel ? sel.value : 'lower';
  // Show/hide Load button based on user selection
  const loadBtn = document.getElementById('zgsDictLoad');
  if (loadBtn) loadBtn.style.display = val === 'user' ? '' : 'none';
  const src = zgsTextarea.value;
  if (/^\s*\.dict\s/m.test(src)) {
    // Replace existing .dict line
    zgsTextarea.value = src.replace(/^(\s*)\.dict\s+\w+/m, '$1.dict ' + val);
    zgsRenderInstant();
  }
}

/**
 * Sync the Dict dropdown to match the source's .dict directive (e.g. on file open).
 * Locks the dropdown if the source already contains print_packed commands.
 */
function zgsSyncDictDropdown() {
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsDictSelect'));
  if (!sel || !zgsTextarea) return;
  const src = zgsTextarea.value;
  const match = src.match(/^\s*\.dict\s+(\w+)/m);
  if (match) {
    const v = match[1].toLowerCase();
    sel.value = v === 'upper' ? 'upper' : v === 'user' ? 'user' : 'lower';
  } else {
    sel.value = 'lower';
  }
  // Show/hide Load button based on user selection
  const loadBtn = document.getElementById('zgsDictLoad');
  if (loadBtn) loadBtn.style.display = sel.value === 'user' ? '' : 'none';
  // Lock if any print_packed instructions exist in source
  sel.disabled = /^\s*print_packed\s/m.test(src);
}

/**
 * Save active scene as .zgs or .zgt
 * @param {string} format
 */
function handleZgsSave(format) {
  if (!zgsTextarea) return;
  const scene = zgsActiveScene();
  scene.sourceText = zgsTextarea.value;
  const baseName = scene.name || 'scene';

  if (format === 'zgt') {
    const blob = new Blob([scene.sourceText], { type: 'text/plain' });
    zgsDownloadBlob(blob, baseName + '.zgt');
  } else {
    const asm = new ZgsAssembler(scene.sourceText);
    const { data, errors } = asm.assemble();
    if (errors.length) {
      zgsSetStatus('Cannot save: ' + errors.map(e => 'Line ' + e.line + ': ' + e.msg).join('; '), true);
      return;
    }
    const blob = new Blob([data], { type: 'application/octet-stream' });
    zgsDownloadBlob(blob, baseName + '.zgs');
  }
}

/**
 * Serialize a dict object to .zdict binary format.
 * Inverse of zgsLoadZdict().
 * @param {{bigrams: string[], trigrams: string[], words: string[]}} dict
 * @returns {Uint8Array}
 */
function zgsSerializeDictBinary(dict) {
  const n = dict.bigrams.length;
  const m = dict.trigrams.length;
  const w = dict.words.length;
  /** @type {number[]} */
  const buf = [n & 0xFF, m & 0xFF, w & 0xFF];
  // Bigrams: N*2 bytes
  for (let i = 0; i < n; i++) {
    buf.push(dict.bigrams[i].charCodeAt(0), dict.bigrams[i].charCodeAt(1));
  }
  // Trigrams: M*3 bytes
  for (let i = 0; i < m; i++) {
    buf.push(dict.trigrams[i].charCodeAt(0), dict.trigrams[i].charCodeAt(1), dict.trigrams[i].charCodeAt(2));
  }
  // Word offsets + word strings
  // First pass: compute offsets
  let strOffset = 0;
  const offsets = [];
  for (let i = 0; i < w; i++) {
    offsets.push(strOffset);
    strOffset += dict.words[i].length + 1; // null-terminated
  }
  // Write offsets (16-bit LE)
  for (let i = 0; i < w; i++) {
    buf.push(offsets[i] & 0xFF, (offsets[i] >> 8) & 0xFF);
  }
  // Write word strings (null-terminated)
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < dict.words[i].length; j++) {
      buf.push(dict.words[i].charCodeAt(j));
    }
    buf.push(0);
  }
  return new Uint8Array(buf);
}

/**
 * Generate a safe filename from a scene name.
 * @param {string} name
 * @returns {string}
 */
function zgsSafeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'scene';
}

/**
 * Save current textarea state into the active scene object.
 */
function zgsStoreActiveSceneState() {
  if (!zgsTextarea) return;
  const scene = zgsActiveScene();
  scene.sourceText = zgsTextarea.value;
  scene.scrollTop = zgsTextarea.scrollTop;
  scene.selStart = zgsTextarea.selectionStart;
  scene.selEnd = zgsTextarea.selectionEnd;
}

/**
 * Load the active scene's state into the textarea.
 */
function zgsRestoreActiveSceneState() {
  if (!zgsTextarea) return;
  const scene = zgsActiveScene();
  zgsTextarea.value = scene.sourceText;
  zgsTextarea.scrollTop = scene.scrollTop;
  zgsTextarea.selectionStart = scene.selStart;
  zgsTextarea.selectionEnd = scene.selEnd;
  zgsUpdateRefUI();
}

/**
 * Export all scenes as a complete .asm file with embedded ZGS player.
 * Downloads a ZIP containing .asm + N×.zgs + .zdict (if needed).
 */
function handleZgsExportAsm() {
  if (!zgsTextarea) return;
  zgsStoreActiveSceneState();

  const baseName = zgsProjectName || 'project';

  // Compile ALL scenes to binary
  /** @type {Array<{name: string, safeName: string, data: Uint8Array, usesPacked: boolean, usesText42: boolean, usesText64: boolean}>} */
  const compiled = [];
  for (let i = 0; i < zgsScenes.length; i++) {
    const scene = zgsScenes[i];
    const asm = new ZgsAssembler(scene.sourceText);
    const { data, errors } = asm.assemble();
    if (errors.length) {
      zgsSetStatus('Scene "' + scene.name + '": ' + errors.map(e => 'Line ' + e.line + ': ' + e.msg).join('; '), true);
      return;
    }
    const usesPacked = /^\s*print_packed(_42|_64)?\s/m.test(scene.sourceText);
    const usesText = /^\s*(set_cursor|print_text|print_packed)\s/m.test(scene.sourceText);
    const usesText42 = /^\s*(set_cursor_42|print_text_42|print_packed_42)\s/m.test(scene.sourceText);
    const usesText64 = /^\s*(set_cursor_64|print_text_64|print_packed_64)\s/m.test(scene.sourceText);
    const usesEllipses = /^\s*ellipse_(outline|fill)_(abs|chain)\s/m.test(scene.sourceText);
    compiled.push({ name: scene.name, safeName: zgsSafeFilename(scene.name), data, usesPacked, usesText, usesText42, usesText64, usesEllipses });
  }

  const needsDict = compiled.some(c => c.usesPacked);
  const needsText = compiled.some(c => c.usesText);
  const needsText42 = compiled.some(c => c.usesText42);
  const needsText64 = compiled.some(c => c.usesText64);
  const needsEllipses = compiled.some(c => c.usesEllipses);
  const N = compiled.length;

  // Build scene labels and incbin lines
  const sceneLabels = compiled.map((c, i) => 'scene' + i + '_data');
  const sceneTableEntries = sceneLabels.map(l => '    dw ' + l).join('\n');
  const sceneIncbins = compiled.map((c, i) =>
    sceneLabels[i] + ':\n    incbin "' + c.safeName + '.zgs"'
  ).join('\n');

  // Build .asm text with new 4-JP config block
  let asmText = '; ZGS Player \u2014 generated by SpectraLab\n'
    + '; Build: sjasmplus ' + baseName + '.asm\n'
    + '; Scenes: ' + N + '\n'
    + '\n'
    + '; --- Feature selection (comment out unused features to reduce binary size) ---\n'
    + '    DEFINE ZGS_USE_LINES        ; ~443 bytes \u2014 line/hline/vline drawing (0x64-0x6A)\n'
    + '    DEFINE ZGS_USE_RECTS        ; ~636 bytes \u2014 rectangle outline/fill, clear_region (0x6B-0x70, 0x7E)\n'
    + '    DEFINE ZGS_USE_CIRCLES      ; ~612 bytes \u2014 circle outline/fill (0x73-0x76)\n'
    + (needsEllipses ? '    DEFINE ZGS_USE_ELLIPSES     ; ~800 bytes \u2014 ellipse outline/fill (0x89-0x8C)\n' : ';   DEFINE ZGS_USE_ELLIPSES     ; ~800 bytes \u2014 ellipse outline/fill (0x89-0x8C)\n')
    + '    DEFINE ZGS_USE_POLYGONS     ; ~666 bytes \u2014 polygon outline/fill (0x71-0x72)\n'
    + '    DEFINE ZGS_USE_FLOOD        ; ~2300 bytes \u2014 flood fill (0x19, 0x77) \u2014 includes 512-byte stack + 768-byte visited bitmap\n'
    + (needsText ? '    DEFINE ZGS_USE_TEXT         ; ~180 bytes \u2014 set_cursor, print_text (0x80-0x81)\n' : ';   DEFINE ZGS_USE_TEXT         ; ~180 bytes \u2014 set_cursor, print_text (0x80-0x81)\n')
    + (needsText42 ? '    DEFINE ZGS_USE_TEXT_42      ; ~200 bytes \u2014 42-col text (6px wide), set_cursor_42, print_text_42 (0x83-0x84)\n' : ';   DEFINE ZGS_USE_TEXT_42      ; ~200 bytes \u2014 42-col text (6px wide), set_cursor_42, print_text_42 (0x83-0x84)\n')
    + (needsText64 ? '    DEFINE ZGS_USE_TEXT_64      ; ~120 bytes \u2014 64-col text (4px wide), set_cursor_64, print_text_64 (0x86-0x87)\n' : ';   DEFINE ZGS_USE_TEXT_64      ; ~120 bytes \u2014 64-col text (4px wide), set_cursor_64, print_text_64 (0x86-0x87)\n')
    + '    DEFINE ZGS_USE_PACKED_TEXT  ; ~724 bytes \u2014 print_packed, dictionary-compressed text (0x82, requires ZGS_USE_TEXT) \u2014 includes ~520 byte dictionary\n'
    + '    DEFINE ZGS_USE_STAMPS       ; ~146 bytes \u2014 stamp_abs, stamp_chain (0x78-0x79)\n'
    + '\n'
    + '    DEVICE ZXSPECTRUM48\n'
    + '    ORG 0x8000\n'
    + '\n'
    + '; ==========================================================================\n'
    + '; ENTRY POINT \u2014 4 JP entry points + poke-friendly config block\n'
    + '; ==========================================================================\n'
    + 'main:\n'
    + '    jp show_from_addr           ; ORG+0x00: clear, draw scene at scene_addr, waitkey\n'
    + '    jp show_by_num              ; ORG+0x03: clear, draw scene_num from table, waitkey\n'
    + '    jp zgs_clear_screen         ; ORG+0x06: clear screen using clear_color attr\n'
    + '    jp zgs_wait_key             ; ORG+0x09: wait for keypress\n'
    + '    IFDEF ZGS_USE_TEXT\n'
    + 'zgs_font_addr:  dw font_8x8    ; ORG+0x0C: 32-col font address (chars 32-127)\n'
    + '    ELSE\n'
    + 'zgs_font_addr:  dw 0           ; ORG+0x0C: unused (32-col text disabled)\n'
    + '    ENDIF\n'
    + 'zgs_scene_addr: dw scene0_data ; ORG+0x0E: address for show_from_addr (patchable)\n'
    + '    IFDEF ZGS_USE_PACKED_TEXT\n'
    + 'zgs_dict_addr:  dw dict_data   ; ORG+0x10: packed text dictionary address\n'
    + '    ELSE\n'
    + 'zgs_dict_addr:  dw 0           ; ORG+0x10: unused (packed text disabled)\n'
    + '    ENDIF\n'
    + 'scene_num:      db 0           ; ORG+0x12: scene number for show_by_num (0-based, patchable)\n'
    + 'clear_color:    db 0           ; ORG+0x13: attribute byte for clear_screen (0 = black)\n'
    + '    IFDEF ZGS_USE_TEXT_42\n'
    + 'zgs_font_42_addr: dw font_6x8 ; ORG+0x14: 42-col font address (6px wide)\n'
    + '    ELSE\n'
    + 'zgs_font_42_addr: dw 0        ; ORG+0x14: unused (42-col text disabled)\n'
    + '    ENDIF\n'
    + '    IFDEF ZGS_USE_TEXT_64\n'
    + 'zgs_font_64_addr: dw font_4x8 ; ORG+0x16: 64-col font address (4x8 derived font)\n'
    + '    ELSE\n'
    + 'zgs_font_64_addr: dw 0        ; ORG+0x16: unused (64-col text disabled)\n'
    + '    ENDIF\n'
    + 'scene_count:    db ' + N + '            ; ORG+0x18: total scenes\n'
    + 'scene_table:                   ; ORG+0x19: scene address table (' + N + ' entries)\n'
    + sceneTableEntries + '\n'
    + '\n'
    + '; --------------------------------------------------------------------------\n'
    + '; show_from_addr \u2014 clear screen, draw scene at (zgs_scene_addr), wait key\n'
    + '; --------------------------------------------------------------------------\n'
    + 'show_from_addr:\n'
    + '    ld sp, hw_stack_top\n'
    + '    call zgs_clear_screen\n'
    + '    ld hl, (zgs_scene_addr)\n'
    + '    call zgs_draw\n'
    + '    call zgs_wait_key\n'
    + '    jr $                        ; halt \u2014 infinite loop after keypress\n'
    + '\n'
    + '; --------------------------------------------------------------------------\n'
    + '; show_by_num \u2014 clear screen, draw scene_num from table, wait key\n'
    + '; --------------------------------------------------------------------------\n'
    + 'show_by_num:\n'
    + '    ld sp, hw_stack_top\n'
    + '    call zgs_clear_screen\n'
    + '    ld a, (scene_num)\n'
    + '    add a, a                    ; x2 for word entries\n'
    + '    ld hl, scene_table\n'
    + '    add a, l\n'
    + '    ld l, a\n'
    + '    adc a, h\n'
    + '    sub l\n'
    + '    ld h, a\n'
    + '    ld a, (hl)\n'
    + '    inc hl\n'
    + '    ld h, (hl)\n'
    + '    ld l, a\n'
    + '    call zgs_draw\n'
    + '    call zgs_wait_key\n'
    + '    jr $                        ; halt \u2014 infinite loop after keypress\n'
    + '\n'
    + '; --------------------------------------------------------------------------\n'
    + '; start \u2014 default entry: show first scene and return\n'
    + '; --------------------------------------------------------------------------\n'
    + 'start:\n'
    + '    ld sp, hw_stack_top\n'
    + '    ei\n'
    + '    xor a\n'
    + '    out (0xFE), a               ; border = black\n'
    + '    call show_from_addr\n'
    + '    ret\n'
    + '\n'
    + '; ==========================================================================\n'
    + '; ZGS PLAYER LIBRARY\n'
    + '; ==========================================================================\n'
    + ZGS_ASM_PLAYER + '\n'
    + '\n';

  if (needsDict) {
    asmText += '    IFDEF ZGS_USE_PACKED_TEXT\n'
      + '; ==========================================================================\n'
      + '; PACKED TEXT DICTIONARY\n'
      + '; ==========================================================================\n'
      + 'dict_data:\n'
      + '    incbin "dict.zdict"\n'
      + '    ENDIF\n\n';
  } else {
    asmText += '    IFDEF ZGS_USE_PACKED_TEXT\n'
      + 'dict_data:\n'
      + '    incbin "dict.zdict"\n'
      + '    ENDIF\n\n';
  }

  // 8x8 font data for 32-col mode (768 bytes, IFDEF-guarded)
  asmText += '    IFDEF ZGS_USE_TEXT\n'
    + '; ==========================================================================\n'
    + '; 8x8 FONT (32-col mode) \u2014 768 bytes, 96 chars (32-127)\n'
    + '; ==========================================================================\n'
    + 'font_8x8:\n'
    + '    incbin "font_8x8.bin"\n'
    + '    ENDIF\n\n';

  // 6x8 font data for 42-col mode (768 bytes, IFDEF-guarded, incbin)
  asmText += '    IFDEF ZGS_USE_TEXT_42\n'
    + '; ==========================================================================\n'
    + '; 6x8 FONT (42-col mode) \u2014 768 bytes, 96 chars, top 6 bits\n'
    + '; ==========================================================================\n'
    + 'font_6x8:\n'
    + '    incbin "font_6x8.bin"\n'
    + '    ENDIF\n\n';

  // 4x8 font data for 64-col mode (768 bytes, IFDEF-guarded, incbin)
  asmText += '    IFDEF ZGS_USE_TEXT_64\n'
    + '; ==========================================================================\n'
    + '; 4x8 CONDENSED FONT (64-col mode) \u2014 768 bytes, 96 chars, top nibble\n'
    + '; ==========================================================================\n'
    + 'font_4x8:\n'
    + '    incbin "font_4x8.bin"\n'
    + '    ENDIF\n\n';

  asmText += '; ==========================================================================\n'
    + '; SCENE DATA\n'
    + '; ==========================================================================\n'
    + sceneIncbins + '\n'
    + '\n'
    + '; ==========================================================================\n'
    + '; BUFFERS (must be after all scene data)\n'
    + '; ==========================================================================\n'
    + '    IFDEF ZGS_USE_FLOOD\n'
    + 'flood_stack:    ds 512          ; 256 entries * 2 bytes (x, y)\n'
    + '    ENDIF\n'
    + '\n'
    + '; Z80 hardware stack (grows downward, so label is at TOP)\n'
    + '    ds 128                      ; 64 levels of call nesting\n'
    + 'hw_stack_top:\n'
    + '\n'
    + '    display "size: ", /A, $-main\n'
    + '    SAVESNA "' + baseName + '.sna", main\n';

  // Package into ZIP via JSZip
  if (typeof JSZip === 'undefined') {
    // Fallback: download individual files if JSZip not loaded
    const asmBlob = new Blob([asmText], { type: 'text/plain' });
    zgsDownloadBlob(asmBlob, baseName + '.asm');
    for (let i = 0; i < compiled.length; i++) {
      setTimeout(() => {
        const zgsBlob = new Blob([compiled[i].data], { type: 'application/octet-stream' });
        zgsDownloadBlob(zgsBlob, compiled[i].safeName + '.zgs');
      }, 200 * (i + 1));
    }
    // Font binaries
    setTimeout(() => {
      const fontBlob = new Blob([ZGS_ROM_FONT], { type: 'application/octet-stream' });
      zgsDownloadBlob(fontBlob, 'font_8x8.bin');
    }, 200 * (compiled.length + 1));
    setTimeout(() => {
      const fontBlob = new Blob([ZGS_FONT_6X8], { type: 'application/octet-stream' });
      zgsDownloadBlob(fontBlob, 'font_6x8.bin');
    }, 200 * (compiled.length + 2));
    setTimeout(() => {
      const fontBlob = new Blob([ZGS_FONT_4X8], { type: 'application/octet-stream' });
      zgsDownloadBlob(fontBlob, 'font_4x8.bin');
    }, 200 * (compiled.length + 3));
    zgsSetStatus('Exported (no JSZip) — download files individually');
    return;
  }

  const zip = new JSZip();
  zip.file(baseName + '.asm', asmText);
  for (const c of compiled) {
    zip.file(c.safeName + '.zgs', c.data);
  }
  // Always include dict.zdict so conditional incbin works
  const dict = zgsUserDict || ZGS_DEFAULT_DICT_LOWER;
  zip.file('dict.zdict', zgsSerializeDictBinary(dict));
  // Include font binaries
  zip.file('font_8x8.bin', ZGS_ROM_FONT);
  zip.file('font_6x8.bin', ZGS_FONT_6X8);
  zip.file('font_4x8.bin', ZGS_FONT_4X8);

  zip.generateAsync({ type: 'blob' }).then(function (blob) {
    zgsDownloadBlob(blob, baseName + '.zip');
    zgsSetStatus('Exported ' + baseName + '.zip (' + compiled.length + ' scene' + (compiled.length > 1 ? 's' : '') + ')');
  });
}

/**
 * @param {Blob} blob
 * @param {string} name
 */
function zgsDownloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// =============================================================================
// Reference Image
// =============================================================================

/**
 * Draw the reference image overlay on the preview canvas.
 * Called after zgsBlitVM() so the reference appears on top of the scene.
 */
function zgsDrawReferenceOverlay() {
  const scene = zgsScenes[zgsActiveSceneIdx];
  if (!scene || !scene.refImage || !scene.refShow) return;
  if (!zgsCanvas) return;
  const ctx = zgsCanvas.getContext('2d');
  if (!ctx) return;

  const z = zgsZoomFactor;
  const drawWidth = (scene.refWidth ?? ZGS_SCREEN_W) * z;
  const drawHeight = (scene.refHeight ?? ZGS_SCREEN_H) * z;
  const drawX = scene.refOffsetX * z;
  const drawY = scene.refOffsetY * z;

  ctx.save();
  ctx.globalAlpha = scene.refOpacity;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scene.refImage, 0, 0, scene.refImage.naturalWidth, scene.refImage.naturalHeight,
                drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

/**
 * Load a reference image from a File into the active scene.
 * @param {File} file
 */
function zgsLoadRefImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataURL = /** @type {string} */ (reader.result);
    const img = new Image();
    img.onload = () => {
      const scene = zgsActiveScene();
      scene.refImage = img;
      scene.refImageDataURL = dataURL;
      zgsUpdateRefUI();
      if (zgsVM) { zgsBlitVM(zgsVM); zgsDrawReferenceOverlay(); }
      zgsSetStatus('Reference image loaded: ' + file.name + ' (' + img.naturalWidth + '\u00d7' + img.naturalHeight + ')');
    };
    img.onerror = () => { zgsSetStatus('Failed to load reference image', true); };
    img.src = dataURL;
  };
  reader.readAsDataURL(file);
}

/**
 * Load a reference image from a data URL string into a scene object.
 * @param {ZgsScene} scene
 * @param {string} dataURL
 * @returns {Promise<void>}
 */
function zgsLoadRefImageFromDataURL(scene, dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      scene.refImage = img;
      scene.refImageDataURL = dataURL;
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to decode reference image'));
    img.src = dataURL;
  });
}

/** Clear the active scene's reference image. */
function zgsClearRefImage() {
  const scene = zgsActiveScene();
  scene.refImage = null;
  scene.refImageDataURL = null;
  zgsUpdateRefUI();
  if (zgsVM) { zgsBlitVM(zgsVM); zgsDrawReferenceOverlay(); }
}

/** Sync the reference image UI controls with the active scene's state. */
function zgsUpdateRefUI() {
  const scene = zgsActiveScene();
  const showCb = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefShowCb'));
  const opSlider = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefOpacity'));
  const opVal = document.getElementById('zgsRefOpacityVal');
  const xInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefX'));
  const yInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefY'));
  const wInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefW'));
  const hInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefH'));

  if (showCb) showCb.checked = scene.refShow;
  if (opSlider) opSlider.value = String(Math.round(scene.refOpacity * 100));
  if (opVal) opVal.textContent = Math.round(scene.refOpacity * 100) + '%';
  if (xInput) xInput.value = String(scene.refOffsetX);
  if (yInput) yInput.value = String(scene.refOffsetY);
  if (wInput) wInput.value = scene.refWidth !== null ? String(scene.refWidth) : '';
  if (hInput) hInput.value = scene.refHeight !== null ? String(scene.refHeight) : '';
}

// =============================================================================
// Tab Management
// =============================================================================

/** Rebuild the tab bar DOM from zgsScenes[]. */
function zgsRenderTabs() {
  const tabBar = document.getElementById('zgsTabBar');
  if (!tabBar) return;
  // Remove all tabs except the add button
  const addBtn = document.getElementById('zgsAddSceneBtn');
  while (tabBar.firstChild && tabBar.firstChild !== addBtn) {
    tabBar.removeChild(tabBar.firstChild);
  }
  for (let i = 0; i < zgsScenes.length; i++) {
    const tab = document.createElement('div');
    tab.className = 'zgs-tab' + (i === zgsActiveSceneIdx ? ' active' : '');
    tab.dataset.idx = String(i);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = zgsScenes[i].name;
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      zgsRenameScene(i);
    });
    tab.appendChild(nameSpan);
    // Close button (only if more than 1 scene)
    if (zgsScenes.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'zgs-tab-close';
      closeBtn.textContent = '\u00d7';
      closeBtn.title = 'Close scene';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zgsRemoveScene(i);
      });
      tab.appendChild(closeBtn);
    }
    tab.addEventListener('click', () => zgsSwitchScene(i));
    tabBar.insertBefore(tab, addBtn);
  }
}

/**
 * Switch to scene at index idx. Saves current state, loads target.
 * @param {number} idx
 */
function zgsSwitchScene(idx) {
  if (idx === zgsActiveSceneIdx || idx < 0 || idx >= zgsScenes.length) return;
  zgsStoreActiveSceneState();
  zgsActiveSceneIdx = idx;
  zgsRestoreActiveSceneState();
  zgsRenderTabs();
  zgsStopPlay();
  zgsVM = null;
  zgsSyncDictDropdown();
  zgsRenderInstant();
}

/** Add a new scene and switch to it. */
function zgsAddScene() {
  if (zgsScenes.length >= ZGS_MAX_SCENES) {
    zgsSetStatus('Maximum ' + ZGS_MAX_SCENES + ' scenes reached', true);
    return;
  }
  zgsStoreActiveSceneState();
  const prev = zgsActiveScene();
  const name = 'Scene ' + (zgsScenes.length + 1);
  const scene = zgsCreateScene(name);
  scene.sourceText = '; ' + name + '\n\nend\n';
  // Copy reference image from current scene
  if (prev.refImage && prev.refImageDataURL) {
    scene.refImage = prev.refImage;
    scene.refImageDataURL = prev.refImageDataURL;
    scene.refShow = prev.refShow;
    scene.refOpacity = prev.refOpacity;
    scene.refOffsetX = prev.refOffsetX;
    scene.refOffsetY = prev.refOffsetY;
    scene.refWidth = prev.refWidth;
    scene.refHeight = prev.refHeight;
  }
  zgsScenes.push(scene);
  zgsActiveSceneIdx = zgsScenes.length - 1;
  zgsRestoreActiveSceneState();
  zgsRenderTabs();
  zgsStopPlay();
  zgsVM = null;
  zgsRenderInstant();
}

/**
 * Remove a scene, with confirmation. At least 1 scene must remain.
 * @param {number} idx
 */
function zgsRemoveScene(idx) {
  if (zgsScenes.length <= 1) return;
  if (!confirm('Delete scene "' + zgsScenes[idx].name + '"?')) return;
  zgsStoreActiveSceneState();
  zgsScenes.splice(idx, 1);
  if (zgsActiveSceneIdx >= zgsScenes.length) {
    zgsActiveSceneIdx = zgsScenes.length - 1;
  } else if (zgsActiveSceneIdx > idx) {
    zgsActiveSceneIdx--;
  } else if (zgsActiveSceneIdx === idx) {
    zgsActiveSceneIdx = Math.min(idx, zgsScenes.length - 1);
  }
  zgsRestoreActiveSceneState();
  zgsRenderTabs();
  zgsStopPlay();
  zgsVM = null;
  zgsRenderInstant();
}

/**
 * Rename a scene via prompt.
 * @param {number} idx
 */
function zgsRenameScene(idx) {
  const name = prompt('Rename scene:', zgsScenes[idx].name);
  if (name !== null && name.trim()) {
    zgsScenes[idx].name = name.trim();
    zgsRenderTabs();
  }
}

// =============================================================================
// Project Save/Load (.zgp)
// =============================================================================

/** Save the multi-scene project as .zgp (JSON). */
function zgsSaveProject() {
  zgsStoreActiveSceneState();

  // Deduplicate reference images across scenes
  /** @type {string[]} */
  const referenceImages = [];
  /** @type {Map<string, number>} */
  const refMap = new Map();
  for (const s of zgsScenes) {
    if (s.refImageDataURL && !refMap.has(s.refImageDataURL)) {
      refMap.set(s.refImageDataURL, referenceImages.length);
      referenceImages.push(s.refImageDataURL);
    }
  }

  const project = {
    version: 2,
    type: 'zgs-project',
    name: zgsProjectName,
    activeScene: zgsActiveSceneIdx,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    scenes: zgsScenes.map(s => {
      /** @type {any} */
      const out = { name: s.name, sourceText: s.sourceText };
      if (s.refImageDataURL) {
        out.refImageIdx = refMap.get(s.refImageDataURL);
        out.refShow = s.refShow;
        out.refOpacity = s.refOpacity;
        out.refOffsetX = s.refOffsetX;
        out.refOffsetY = s.refOffsetY;
        out.refWidth = s.refWidth;
        out.refHeight = s.refHeight;
      }
      return out;
    }),
  };
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  zgsDownloadBlob(blob, (zgsProjectName || 'project') + '.zgp');
  zgsSetStatus('Saved ' + zgsProjectName + '.zgp (' + zgsScenes.length + ' scene' + (zgsScenes.length > 1 ? 's' : '') + ')');
}

/**
 * Load a project from .zgp JSON string.
 * @param {string} jsonText
 */
function zgsLoadProject(jsonText) {
  const project = JSON.parse(jsonText);
  if (!project || project.type !== 'zgs-project' || !Array.isArray(project.scenes) || project.scenes.length === 0) {
    throw new Error('Invalid .zgp project file');
  }
  const refImages = Array.isArray(project.referenceImages) ? project.referenceImages : [];

  zgsProjectName = project.name || 'untitled';
  zgsScenes = project.scenes.map((/** @type {any} */ s) => {
    const scene = zgsCreateScene(s.name || 'Scene');
    scene.sourceText = s.sourceText || '';
    // Restore reference image settings (v2+)
    if (typeof s.refImageIdx === 'number' && s.refImageIdx >= 0 && s.refImageIdx < refImages.length) {
      scene.refImageDataURL = refImages[s.refImageIdx];
      if (typeof s.refShow === 'boolean') scene.refShow = s.refShow;
      if (typeof s.refOpacity === 'number') scene.refOpacity = s.refOpacity;
      if (typeof s.refOffsetX === 'number') scene.refOffsetX = s.refOffsetX;
      if (typeof s.refOffsetY === 'number') scene.refOffsetY = s.refOffsetY;
      scene.refWidth = typeof s.refWidth === 'number' ? s.refWidth : null;
      scene.refHeight = typeof s.refHeight === 'number' ? s.refHeight : null;
    }
    return scene;
  });
  zgsActiveSceneIdx = Math.min(project.activeScene || 0, zgsScenes.length - 1);

  // Load reference images asynchronously, then finish init
  const loadPromises = zgsScenes
    .filter(s => s.refImageDataURL)
    .map(s => zgsLoadRefImageFromDataURL(s, /** @type {string} */ (s.refImageDataURL)).catch(() => {}));

  const finishLoad = () => {
    zgsRestoreActiveSceneState();
    if (zgsFileNameEl) zgsFileNameEl.textContent = zgsProjectName;
    zgsRenderTabs();
    zgsUndoReset();
    zgsSyncDictDropdown();
    zgsStopPlay();
    zgsVM = null;
    zgsRenderInstant();
    zgsSetStatus('Loaded project: ' + zgsProjectName + ' (' + zgsScenes.length + ' scene' + (zgsScenes.length > 1 ? 's' : '') + ')');
  };

  if (loadPromises.length > 0) {
    Promise.all(loadPromises).then(finishLoad);
  } else {
    finishLoad();
  }
}

/** @param {ZgsScene} s */
function zgsIsDefaultScene(s) {
  const t = s.sourceText.trim();
  return t === '' ||
    /^;\s*(New ZGS scene|Scene\s+\d+)\s*\n/.test(s.sourceText) &&
    s.undoStack.length === 0;
}

function zgsNewReset() {
  zgsProjectName = 'untitled';
  zgsScenes = [zgsCreateScene('Scene 1')];
  zgsActiveSceneIdx = 0;
  const scene = zgsActiveScene();
  scene.sourceText = '; New ZGS scene\n\nset_paper blue\nset_ink white\nclear_region 0, 0, 32, 24, 0x09\nmove_abs 10, 10\nrect_fill_abs 20, 20, 20, 15\nend\n';
  scene.lastBinary = null;
  if (zgsTextarea) zgsTextarea.value = scene.sourceText;
  zgsUndoReset();
  if (zgsFileNameEl) zgsFileNameEl.textContent = zgsProjectName;
  zgsRenderTabs();
  zgsSyncDictDropdown();
  zgsStopPlay();
  zgsVM = null;
  zgsRenderInstant();
}

function zgsNew() {
  // First call (startup) or all scenes empty/default — reset the whole project
  if (zgsScenes.length === 0) {
    zgsNewReset();
    return;
  }
  zgsStoreActiveSceneState();
  if (zgsScenes.some(s => !zgsIsDefaultScene(s))) {
    // Has real content — add a new blank tab instead of wiping
    zgsAddScene();
  } else {
    zgsNewReset();
  }
}

// =============================================================================
// Interactive Canvas — coordinate display, click-to-insert, shape tools,
//                      pen crosshair, source map sync
// =============================================================================

/**
 * Translate a mouse event on the canvas container to logical ZGS coordinates.
 * Returns {lx, ly, px, py} or null if out of bounds.
 * px/py are pixel coords (0-255 / 0-191), lx/ly are logical (0-127 / 0-95).
 * @param {MouseEvent} event
 * @returns {{lx: number, ly: number, px: number, py: number}|null}
 */
function zgsCanvasToLogical(event) {
  if (!zgsCanvas) return null;
  const rect = zgsCanvas.getBoundingClientRect();
  // Account for the 1px border on the canvas element
  const borderW = 1;
  const innerW = rect.width - borderW * 2;
  const innerH = rect.height - borderW * 2;
  const mx = event.clientX - rect.left - borderW;
  const my = event.clientY - rect.top - borderW;
  const px = Math.floor(mx / innerW * ZGS_SCREEN_W);
  const py = Math.floor(my / innerH * ZGS_SCREEN_H);
  if (px < 0 || px >= ZGS_SCREEN_W || py < 0 || py >= ZGS_SCREEN_H) return null;
  const lx = px >> 1;
  const ly = py >> 1;
  return { lx, ly, px, py };
}

/**
 * Insert text at the current cursor position in the textarea.
 * @param {string} text
 */
function zgsInsertTextAtCursor(text) {
  if (!zgsTextarea) return;
  zgsUndoPush();
  const start = zgsTextarea.selectionStart;
  const end = zgsTextarea.selectionEnd;
  const val = zgsTextarea.value;
  zgsTextarea.value = val.substring(0, start) + text + val.substring(end);
  zgsTextarea.selectionStart = zgsTextarea.selectionEnd = start + text.length;
  zgsTextarea.focus();
  // Fire input event to trigger debounced re-render
  zgsTextarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Insert a generated instruction before the last `end` statement so the VM
 * actually executes it. Falls back to appending at the end if no `end` found.
 * @param {string} text — one or more instruction lines (each ending with \n)
 */
function zgsInsertInstructionBeforeEnd(text) {
  if (!zgsTextarea) return;
  zgsUndoPush();
  const val = zgsTextarea.value;
  const lines = val.split('\n');

  // Find the last line that is `end` (ignoring leading whitespace and comments)
  let endLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const stripped = lines[i].split(';')[0].trim().toLowerCase();
    if (stripped === 'end') { endLineIdx = i; break; }
  }

  if (endLineIdx >= 0) {
    // Compute the character offset of the start of the `end` line
    let charPos = 0;
    for (let i = 0; i < endLineIdx; i++) charPos += lines[i].length + 1;
    // Insert before the `end` line
    zgsTextarea.value = val.substring(0, charPos) + text + val.substring(charPos);
    zgsTextarea.selectionStart = zgsTextarea.selectionEnd = charPos + text.length;
  } else {
    // No `end` found — append at end
    const suffix = val.endsWith('\n') ? '' : '\n';
    zgsTextarea.value = val + suffix + text;
    zgsTextarea.selectionStart = zgsTextarea.selectionEnd = zgsTextarea.value.length;
  }

  zgsTextarea.focus();
  // Render immediately — cancel any pending debounce so we don't double-render
  if (zgsDebounceTimer !== null) { clearTimeout(zgsDebounceTimer); zgsDebounceTimer = null; }
  zgsVM = null;
  zgsRenderInstant();
}

/**
 * Set the active drawing tool.
 * @param {string} tool
 */
function zgsSetTool(tool) {
  zgsTool = tool;
  // Cancel any active polyline
  if (zgsPolylineAnchor) {
    zgsPolylineAnchor = null;
    zgsPolylineTrackPos = null;
    document.removeEventListener('mousemove', zgsDocMouseMoveDuringDrag);
  }
  // Update toolbar button active states
  const buttons = document.querySelectorAll('.zgs-tool-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
  });
  // Set cursor style on container
  if (zgsCanvasContainer) {
    zgsCanvasContainer.style.cursor = 'crosshair';
  }
  // Show/hide text toolbar
  const textTb = document.getElementById('zgsTextToolbar');
  if (textTb) textTb.style.display = (tool === 'text') ? 'flex' : 'none';
  // Clear text cursor indicator when switching away from text tool
  if (tool !== 'text') {
    zgsTextCursorPos = null;
    zgsLastTextHover = null;
    delete zgsTextCursorByMode[32];
    delete zgsTextCursorByMode[42];
    delete zgsTextCursorByMode[64];
  }
  zgsDrawOverlay();
}

/**
 * Generate ZGS instruction text for a shape drawn from start to end.
 * @param {string} tool
 * @param {{lx: number, ly: number}} start
 * @param {{lx: number, ly: number}} end
 * @returns {string}
 */
/**
 * Build the 8-colour swatch palette inside #zgsColorPalette.
 * Left-click sets ink, right-click sets paper.
 */
function zgsBuildPalette() {
  const container = document.getElementById('zgsColorPalette');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('div');
    cell.className = 'zgs-palette-cell';
    cell.dataset.color = String(i);
    cell.title = ZGS_COLOUR_NAMES[i] + ' — LMB=ink, RMB=paper';
    const nr = ZX_NORMAL[i], br = ZX_BRIGHT[i];
    cell.style.background = 'linear-gradient(to bottom, rgb(' + br + ') 50%, rgb(' + nr + ') 50%)';
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      zgsInkIdx = i;
      zgsColorDirty = true;
      zgsUpdatePalette();
    });
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      zgsPaperIdx = i;
      zgsColorDirty = true;
      zgsUpdatePalette();
    });
    container.appendChild(cell);
  }
  zgsUpdatePalette();
}

/** Update ink/paper selection markers on the palette swatches. */
function zgsUpdatePalette() {
  const container = document.getElementById('zgsColorPalette');
  if (!container) return;
  const cells = container.querySelectorAll('.zgs-palette-cell');
  cells.forEach((cell) => {
    const idx = parseInt(/** @type {HTMLElement} */ (cell).dataset.color, 10);
    cell.classList.toggle('ink-selected', idx === zgsInkIdx);
    cell.classList.toggle('paper-selected', idx === zgsPaperIdx);
    // Remove old markers
    cell.querySelectorAll('.zgs-palette-marker').forEach(m => m.remove());
    if (idx === zgsInkIdx) {
      const m = document.createElement('span');
      m.className = 'zgs-palette-marker ink-marker';
      m.textContent = 'I';
      cell.appendChild(m);
    }
    if (idx === zgsPaperIdx) {
      const m = document.createElement('span');
      m.className = 'zgs-palette-marker paper-marker';
      m.textContent = 'P';
      cell.appendChild(m);
    }
  });
}

/**
 * If the UI colour state has changed since the last draw, insert the
 * necessary set_ink / set_paper / set_attr instructions before the drawing
 * command. Called right before each drawing instruction is inserted.
 */
function zgsSyncColorBeforeDraw() {
  if (!zgsColorDirty) return;
  zgsColorDirty = false;
  // Build the full attr byte: FBPPPIII
  const attr = (zgsFlash ? 0x80 : 0) | (zgsBright ? 0x40 : 0) | (zgsPaperIdx << 3) | zgsInkIdx;
  zgsInsertInstructionBeforeEnd('set_attr 0x' + attr.toString(16).padStart(2, '0') + '\n');
}

/**
 * Apply shape modifier keys to start/end coordinates.
 * Ctrl: constrain to 1:1 ratio (square/circle)
 * Alt: draw from center (mirror start around original start point)
 * @param {{lx:number,ly:number}} s  Start point
 * @param {{lx:number,ly:number}} e  End point
 * @param {boolean} ctrl
 * @param {boolean} alt
 * @returns {{s:{lx:number,ly:number}, e:{lx:number,ly:number}}}
 */
function zgsApplyShapeModifiers(s, e, ctrl, alt) {
  let sx = s.lx, sy = s.ly, ex = e.lx, ey = e.ly;
  let dx = ex - sx, dy = ey - sy;
  if (ctrl) {
    const maxDim = Math.max(Math.abs(dx), Math.abs(dy));
    dx = maxDim * Math.sign(dx || 1);
    dy = maxDim * Math.sign(dy || 1);
    ex = sx + dx;
    ey = sy + dy;
  }
  if (alt) {
    sx = s.lx - dx;
    sy = s.ly - dy;
  }
  return { s: { lx: sx, ly: sy }, e: { lx: ex, ly: ey } };
}

function zgsGenerateInstruction(tool, start, end) {
  switch (tool) {
    case 'dot':
      return 'dot_abs ' + start.lx + ', ' + start.ly + '\n';
    case 'line':
      return 'move_abs ' + start.lx + ', ' + start.ly + '\n' +
             'line_dmed ' + (end.lx - start.lx) + ', ' + (end.ly - start.ly) + '\n';
    case 'rect': {
      const x = Math.min(start.lx, end.lx), y = Math.min(start.ly, end.ly);
      const w = Math.abs(end.lx - start.lx), h = Math.abs(end.ly - start.ly);
      return 'rect_outline_abs ' + x + ', ' + y + ', ' + w + ', ' + h + '\n';
    }
    case 'rectfill': {
      const x = Math.min(start.lx, end.lx), y = Math.min(start.ly, end.ly);
      const w = Math.abs(end.lx - start.lx), h = Math.abs(end.ly - start.ly);
      return 'rect_fill_abs ' + x + ', ' + y + ', ' + w + ', ' + h + '\n';
    }
    case 'circle': {
      const dx = end.lx - start.lx, dy = end.ly - start.ly;
      const r = Math.round(Math.sqrt(dx * dx + dy * dy));
      return 'circle_outline_abs ' + start.lx + ', ' + start.ly + ', ' + r + '\n';
    }
    case 'circlefill': {
      const dx = end.lx - start.lx, dy = end.ly - start.ly;
      const r = Math.round(Math.sqrt(dx * dx + dy * dy));
      return 'circle_fill_abs ' + start.lx + ', ' + start.ly + ', ' + r + '\n';
    }
    case 'ellipse': {
      const rx = Math.abs(end.lx - start.lx), ry = Math.abs(end.ly - start.ly);
      return 'ellipse_outline_abs ' + start.lx + ', ' + start.ly + ', ' + rx + ', ' + ry + '\n';
    }
    case 'ellipsefill': {
      const rx = Math.abs(end.lx - start.lx), ry = Math.abs(end.ly - start.ly);
      return 'ellipse_fill_abs ' + start.lx + ', ' + start.ly + ', ' + rx + ', ' + ry + '\n';
    }
    case 'flood':
      return 'flood_abs ' + start.lx + ', ' + start.ly + '\n';
    case 'clearrect': {
      // Convert logical coords to character cell coords (8x8 pixel blocks)
      // lx 0-127 → col 0-31 (lx/4), ly 0-95 → row 0-23 (ly/4)
      const col = Math.min(start.lx, end.lx) >> 2;
      const row = Math.min(start.ly, end.ly) >> 2;
      const col2 = Math.max(start.lx, end.lx) >> 2;
      const row2 = Math.max(start.ly, end.ly) >> 2;
      const w = col2 - col + 1;
      const h = row2 - row + 1;
      const attr = zgsVM ? zgsVM.attr : 0x07;
      return 'clear_region ' + col + ', ' + row + ', ' + w + ', ' + h + ', 0x' + attr.toString(16).padStart(2, '0') + '\n';
    }
    default:
      return '';
  }
}

/**
 * Draw rubber-band shape preview on the overlay canvas.
 */
function zgsDrawOverlay() {
  if (!zgsOverlayCtx) return;
  zgsOverlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  zgsOverlayCtx.clearRect(0, 0, zgsOverlayCanvas.width, zgsOverlayCanvas.height);
  zgsOverlayCtx.scale(zgsZoomFactor, zgsZoomFactor);
  if (zgsShowGrid) zgsDrawGrid();

  // Draw rubber-band shape if dragging
  if (zgsDrawing && zgsDrawStart && zgsDrawEnd) {
    zgsOverlayCtx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
    zgsOverlayCtx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    zgsOverlayCtx.lineWidth = 1;
    // Apply shape modifiers for applicable tools
    let drawS = zgsDrawStart, drawE = zgsDrawEnd;
    if (['rect', 'rectfill', 'ellipse', 'ellipsefill', 'circle', 'circlefill'].includes(zgsTool)) {
      const mod = zgsApplyShapeModifiers(zgsDrawStart, zgsDrawEnd, zgsDrawModifiers.ctrl, zgsDrawModifiers.alt);
      drawS = mod.s;
      drawE = mod.e;
    }
    const sx = drawS.lx * 2, sy = drawS.ly * 2;
    const ex = drawE.lx * 2, ey = drawE.ly * 2;

    switch (zgsTool) {
      case 'dot':
        zgsOverlayCtx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        zgsOverlayCtx.fillRect(sx, sy, 2, 2);
        break;
      case 'line':
        zgsOverlayCtx.beginPath();
        zgsOverlayCtx.moveTo(sx + 1, sy + 1);
        zgsOverlayCtx.lineTo(ex + 1, ey + 1);
        zgsOverlayCtx.stroke();
        break;
      case 'rect': {
        const x = Math.min(sx, ex), y = Math.min(sy, ey);
        const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
        zgsOverlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
        break;
      }
      case 'rectfill': {
        const x = Math.min(sx, ex), y = Math.min(sy, ey);
        const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
        zgsOverlayCtx.fillRect(x, y, w, h);
        zgsOverlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
        break;
      }
      case 'circle':
      case 'circlefill': {
        const dx = ex - sx, dy = ey - sy;
        const r = Math.sqrt(dx * dx + dy * dy);
        zgsOverlayCtx.beginPath();
        zgsOverlayCtx.arc(sx + 1, sy + 1, r, 0, Math.PI * 2);
        if (zgsTool === 'circlefill') zgsOverlayCtx.fill();
        zgsOverlayCtx.stroke();
        break;
      }
      case 'ellipse':
      case 'ellipsefill': {
        const erx = Math.abs(ex - sx), ery = Math.abs(ey - sy);
        zgsOverlayCtx.beginPath();
        zgsOverlayCtx.ellipse(sx + 1, sy + 1, erx, ery, 0, 0, Math.PI * 2);
        if (zgsTool === 'ellipsefill') zgsOverlayCtx.fill();
        zgsOverlayCtx.stroke();
        break;
      }
      case 'flood':
        // Flood is click-only, show a small marker
        zgsOverlayCtx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        zgsOverlayCtx.fillRect(sx - 1, sy - 1, 4, 4);
        break;
      case 'clearrect': {
        // Snap to 8x8 character cell grid
        const col1 = (Math.min(sx, ex) >> 3) << 3;
        const row1 = (Math.min(sy, ey) >> 3) << 3;
        const col2 = ((Math.max(sx, ex) >> 3) + 1) << 3;
        const row2 = ((Math.max(sy, ey) >> 3) + 1) << 3;
        zgsOverlayCtx.fillStyle = 'rgba(255, 80, 80, 0.25)';
        zgsOverlayCtx.fillRect(col1, row1, col2 - col1, row2 - row1);
        zgsOverlayCtx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
        zgsOverlayCtx.setLineDash([2, 2]);
        zgsOverlayCtx.strokeRect(col1 + 0.5, row1 + 0.5, col2 - col1 - 1, row2 - row1 - 1);
        zgsOverlayCtx.setLineDash([]);
        break;
      }
    }
  }

  // Text tool: persistent cursor position indicator
  if (zgsTool === 'text' && zgsTextCursorPos) {
    const cMode = zgsTextCursorPos.mode;
    const cCharW = cMode === 64 ? 4 : cMode === 42 ? 6 : 8;
    const cx = zgsTextCursorPos.col * cCharW, cy = zgsTextCursorPos.row * 8;
    zgsOverlayCtx.strokeStyle = 'rgba(0, 255, 120, 0.8)';
    zgsOverlayCtx.setLineDash([]);
    zgsOverlayCtx.strokeRect(cx + 0.5, cy + 0.5, cCharW - 1, 7);
  }

  // Text tool hover preview — show character cell cursor (mode-aware)
  if (zgsTool === 'text' && zgsLastTextHover && !zgsDrawing) {
    const modeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsTextModeSelect'));
    const textMode = modeSel ? parseInt(modeSel.value, 10) : 32;
    const charW = textMode === 64 ? 4 : textMode === 42 ? 6 : 8;
    const maxCol = textMode === 64 ? 64 : textMode === 42 ? 42 : 32;
    const col = Math.min(Math.floor(zgsLastTextHover.px / charW), maxCol - 1);
    const row = Math.floor(zgsLastTextHover.py / 8);
    const hx = col * charW, hy = row * 8;
    zgsOverlayCtx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
    zgsOverlayCtx.setLineDash([2, 2]);
    zgsOverlayCtx.strokeRect(hx + 0.5, hy + 0.5, charW - 1, 7);
    zgsOverlayCtx.setLineDash([]);
  }

  // Draw pen crosshair (hide during playback)
  if (zgsShowPen && !zgsPlaying) zgsDrawPenCrosshair();
}

/**
 * Draw 8x8 character cell grid and screen third separators on the overlay canvas.
 */
function zgsDrawGrid() {
  if (!zgsOverlayCtx) return;
  zgsOverlayCtx.lineWidth = 1;
  // Character cell grid (8×8 px)
  zgsOverlayCtx.strokeStyle = 'rgba(255, 160, 0, 0.15)';
  zgsOverlayCtx.beginPath();
  for (let x = 8; x < ZGS_SCREEN_W; x += 8) {
    zgsOverlayCtx.moveTo(x + 0.5, 0);
    zgsOverlayCtx.lineTo(x + 0.5, ZGS_SCREEN_H);
  }
  for (let y = 8; y < ZGS_SCREEN_H; y += 8) {
    zgsOverlayCtx.moveTo(0, y + 0.5);
    zgsOverlayCtx.lineTo(ZGS_SCREEN_W, y + 0.5);
  }
  zgsOverlayCtx.stroke();
  // Screen third separators at y=64 and y=128
  zgsOverlayCtx.strokeStyle = 'rgba(255, 80, 0, 0.4)';
  zgsOverlayCtx.beginPath();
  zgsOverlayCtx.moveTo(0, 64 + 0.5);
  zgsOverlayCtx.lineTo(ZGS_SCREEN_W, 64 + 0.5);
  zgsOverlayCtx.moveTo(0, 128 + 0.5);
  zgsOverlayCtx.lineTo(ZGS_SCREEN_W, 128 + 0.5);
  zgsOverlayCtx.stroke();
}

/**
 * Draw pen position crosshair on the overlay canvas.
 */
function zgsDrawPenCrosshair() {
  if (!zgsOverlayCtx || !zgsVM) return;
  const px = zgsVM.penX, py = zgsVM.penY;
  if (px < 0 || px >= ZGS_SCREEN_W || py < 0 || py >= ZGS_SCREEN_H) return;

  const arm = 8; // half-length of each crosshair arm in pixels
  zgsOverlayCtx.strokeStyle = 'rgba(0, 255, 0, 0.35)';
  zgsOverlayCtx.lineWidth = 1;

  // Horizontal arms (gap at center)
  zgsOverlayCtx.beginPath();
  zgsOverlayCtx.moveTo(Math.max(0, px - arm), py + 0.5);
  zgsOverlayCtx.lineTo(px - 1, py + 0.5);
  zgsOverlayCtx.moveTo(px + 2, py + 0.5);
  zgsOverlayCtx.lineTo(Math.min(ZGS_SCREEN_W, px + arm + 1), py + 0.5);
  zgsOverlayCtx.stroke();

  // Vertical arms (gap at center)
  zgsOverlayCtx.beginPath();
  zgsOverlayCtx.moveTo(px + 0.5, Math.max(0, py - arm));
  zgsOverlayCtx.lineTo(px + 0.5, py - 1);
  zgsOverlayCtx.moveTo(px + 0.5, py + 2);
  zgsOverlayCtx.lineTo(px + 0.5, Math.min(ZGS_SCREEN_H, py + arm + 1));
  zgsOverlayCtx.stroke();

  // Small dot at pen position
  zgsOverlayCtx.fillStyle = 'rgba(0, 255, 0, 0.45)';
  zgsOverlayCtx.fillRect(px, py, 1, 1);
}

/**
 * Update the overlay (clear + redraw pen crosshair + rubber-band).
 */
function zgsRefreshOverlay() {
  if (!zgsOverlayCtx) return;
  // If a drag is in progress, use full overlay (includes rubber band)
  if (zgsDrawing && zgsDrawStart && zgsDrawEnd) {
    zgsDrawOverlay();
    return;
  }
  zgsOverlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  zgsOverlayCtx.clearRect(0, 0, zgsOverlayCanvas.width, zgsOverlayCanvas.height);
  zgsOverlayCtx.scale(zgsZoomFactor, zgsZoomFactor);
  if (zgsShowGrid) zgsDrawGrid();
  // Polyline tracking rubber band (no button held, anchor set)
  if (zgsPolylineAnchor && zgsPolylineTrackPos) {
    zgsOverlayCtx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
    zgsOverlayCtx.lineWidth = 1;
    const sx = zgsPolylineAnchor.lx * 2, sy = zgsPolylineAnchor.ly * 2;
    const ex = zgsPolylineTrackPos.lx * 2, ey = zgsPolylineTrackPos.ly * 2;
    zgsOverlayCtx.beginPath();
    zgsOverlayCtx.moveTo(sx + 1, sy + 1);
    zgsOverlayCtx.lineTo(ex + 1, ey + 1);
    zgsOverlayCtx.stroke();
  }
  if (zgsShowPen && !zgsPlaying) zgsDrawPenCrosshair();
}

/**
 * Handle mousemove on the canvas container: update tooltip and status bar.
 * @param {MouseEvent} e
 */
function zgsCanvasMouseMove(e) {
  const coords = zgsCanvasToLogical(e);
  if (!coords) {
    if (zgsCoordTooltip) zgsCoordTooltip.style.display = 'none';
    return;
  }
  // Update tooltip
  if (zgsCoordTooltip) {
    if (zgsTool === 'text') {
      const modeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsTextModeSelect'));
      const textMode = modeSel ? parseInt(modeSel.value, 10) : 32;
      const charW = textMode === 64 ? 4 : textMode === 42 ? 6 : 8;
      const maxCol = textMode === 64 ? 64 : textMode === 42 ? 42 : 32;
      const col = Math.min(Math.floor(coords.px / charW), maxCol - 1);
      const row = Math.floor(coords.py / 8);
      zgsCoordTooltip.textContent = 'col ' + col + ', row ' + row + ' (' + textMode + '-col)';
    } else {
      zgsCoordTooltip.textContent = coords.lx + ', ' + coords.ly;
    }
    zgsCoordTooltip.style.display = 'block';
  }
  // Update status with coordinates
  if (zgsStatus && !zgsPlaying) {
    const base = zgsStatus.textContent.split('  |')[0];
    zgsStatus.textContent = base + '  |  x: ' + coords.lx + '  y: ' + coords.ly + '  (px: ' + coords.px + ', ' + coords.py + ')';
  }
  // Text tool hover preview
  if (zgsTool === 'text' && !zgsDrawing) {
    zgsLastTextHover = coords;
    zgsDrawOverlay();
  }
  // Rubber-band update during drag
  if (zgsDrawing && zgsDrawStart) {
    zgsDrawEnd = { lx: coords.lx, ly: coords.ly };
    zgsDrawOverlay();
  }
}

/**
 * Handle mouseleave on the canvas container.
 */
function zgsCanvasMouseLeave() {
  if (zgsCoordTooltip) zgsCoordTooltip.style.display = 'none';
  if (zgsLastTextHover) { zgsLastTextHover = null; zgsDrawOverlay(); }
}

/**
 * Handle mousedown on the canvas container.
 * @param {MouseEvent} e
 */
function zgsCanvasMouseDown(e) {
  const coords = zgsCanvasToLogical(e);
  if (!coords) return;

  // Right-drag: polyline mode for line tool
  if (e.button === 2 && zgsTool === 'line') {
    e.preventDefault();
    zgsDrawing = true;
    zgsDrawButton = 2;
    // Continue from anchor if active, otherwise start fresh
    if (zgsPolylineAnchor) {
      zgsDrawStart = { lx: zgsPolylineAnchor.lx, ly: zgsPolylineAnchor.ly };
    } else {
      zgsDrawStart = { lx: coords.lx, ly: coords.ly };
    }
    zgsDrawEnd = { lx: coords.lx, ly: coords.ly };
    // Track mousemove at document level so rubber band updates even outside canvas
    document.addEventListener('mousemove', zgsDocMouseMoveDuringDrag);
    zgsDrawOverlay();
    return;
  }

  if (e.button !== 0) return;
  e.preventDefault();

  // Left click while polyline active: finish polyline
  if (zgsTool === 'line' && zgsPolylineAnchor) {
    zgsPolylineAnchor = null;
    zgsPolylineTrackPos = null;
    document.removeEventListener('mousemove', zgsDocMouseMoveDuringDrag);
    zgsSetStatus('Polyline finished');
    zgsRefreshOverlay();
    return;
  }

  if (zgsTool === 'flood') {
    zgsSyncColorBeforeDraw();
    const instr = zgsGenerateInstruction('flood', coords, coords);
    zgsInsertInstructionBeforeEnd(instr);
    return;
  }

  if (zgsTool === 'dot') {
    zgsSyncColorBeforeDraw();
    const instr = zgsGenerateInstruction('dot', coords, coords);
    zgsInsertInstructionBeforeEnd(instr);
    return;
  }

  if (zgsTool === 'text') {
    // Click sets cursor position — mode-aware
    const modeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsTextModeSelect'));
    const textMode = modeSel ? parseInt(modeSel.value, 10) : 32;
    const charW = textMode === 64 ? 4 : textMode === 42 ? 6 : 8;
    const maxCol = textMode === 64 ? 64 : textMode === 42 ? 42 : 32;
    const col = Math.min(Math.floor(coords.px / charW), maxCol - 1);
    const row = Math.floor(coords.py / 8);
    const suffix = textMode === 32 ? '' : '_' + textMode;
    zgsSyncColorBeforeDraw();
    zgsInsertInstructionBeforeEnd('set_cursor' + suffix + ' ' + col + ', ' + row + '\n');
    zgsTextCursorPos = { col, row, mode: textMode };
    zgsTextCursorByMode[textMode] = { col, row };
    const info = document.getElementById('zgsTextCursorInfo');
    if (info) info.textContent = 'Cursor: col ' + col + ', row ' + row + ' (' + textMode + '-col)';
    zgsDrawOverlay();
    return;
  }

  // Begin drag for line/rect/circle tools (left button)
  zgsDrawing = true;
  zgsDrawButton = 0;
  zgsDrawStart = { lx: coords.lx, ly: coords.ly };
  zgsDrawEnd = { lx: coords.lx, ly: coords.ly };
  document.addEventListener('mousemove', zgsDocMouseMoveDuringDrag);
}

/**
 * Document-level mousemove handler active during drags and polyline tracking.
 * @param {MouseEvent} e
 */
function zgsDocMouseMoveDuringDrag(e) {
  const coords = zgsCanvasToLogical(e);
  if (!coords) return;
  // Active drag: update rubber band end + modifiers
  if (zgsDrawing && zgsDrawStart) {
    zgsDrawEnd = { lx: coords.lx, ly: coords.ly };
    zgsDrawModifiers = { ctrl: e.ctrlKey, alt: e.altKey };
    zgsDrawOverlay();
    return;
  }
  // Polyline tracking: update tracking position (no button held)
  if (zgsPolylineAnchor) {
    zgsPolylineTrackPos = { lx: coords.lx, ly: coords.ly };
    zgsRefreshOverlay();
  }
}

function zgsCanvasMouseUp(e) {
  if (!zgsDrawing || !zgsDrawStart) return;
  const coords = zgsCanvasToLogical(e);
  if (coords) {
    zgsDrawEnd = { lx: coords.lx, ly: coords.ly };
  }
  if (zgsDrawEnd) {
    const dx = zgsDrawEnd.lx - zgsDrawStart.lx;
    const dy = zgsDrawEnd.ly - zgsDrawStart.ly;

    if (zgsTool === 'line' && zgsDrawButton === 2) {
      // Right-drag polyline segment
      if (dx !== 0 || dy !== 0) {
        zgsSyncColorBeforeDraw();
        if (zgsPolylineAnchor) {
          zgsInsertInstructionBeforeEnd('line_dmed ' + dx + ', ' + dy + '\n');
        } else {
          zgsInsertInstructionBeforeEnd(
            'move_abs ' + zgsDrawStart.lx + ', ' + zgsDrawStart.ly + '\n'
            + 'line_dmed ' + dx + ', ' + dy + '\n');
        }
        zgsPolylineAnchor = { lx: zgsDrawEnd.lx, ly: zgsDrawEnd.ly };
        zgsSetStatus('Polyline \u2014 right-click/drag: next segment, left click or Esc: finish');
      }
      // Transition to tracking mode: keep document mousemove, show rubber band from anchor
      zgsDrawing = false;
      zgsDrawStart = null;
      zgsDrawEnd = null;
      // Set initial tracking position to current mouse
      if (zgsPolylineAnchor && coords) {
        zgsPolylineTrackPos = { lx: coords.lx, ly: coords.ly };
      }
      zgsRefreshOverlay();
      return; // don't remove document mousemove — tracking continues
    } else {
      // Apply shape modifiers for applicable tools
      let finalS = zgsDrawStart, finalE = zgsDrawEnd;
      zgsDrawModifiers = { ctrl: e.ctrlKey, alt: e.altKey };
      if (['rect', 'rectfill', 'ellipse', 'ellipsefill', 'circle', 'circlefill'].includes(zgsTool)) {
        const mod = zgsApplyShapeModifiers(zgsDrawStart, zgsDrawEnd, zgsDrawModifiers.ctrl, zgsDrawModifiers.alt);
        finalS = mod.s;
        finalE = mod.e;
      }
      const instr = zgsGenerateInstruction(zgsTool, finalS, finalE);
      if (instr) { zgsSyncColorBeforeDraw(); zgsInsertInstructionBeforeEnd(instr); }
    }
  }
  document.removeEventListener('mousemove', zgsDocMouseMoveDuringDrag);
  zgsDrawing = false;
  zgsDrawStart = null;
  zgsDrawEnd = null;
  zgsDrawModifiers = { ctrl: false, alt: false };
  zgsRefreshOverlay();
}

/**
 * Handle contextmenu (right-click) on the canvas container.
 * @param {MouseEvent} e
 */
function zgsCanvasContextMenu(e) {
  e.preventDefault();
  // Line tool: context menu suppressed, right-click handled in mousedown
  if (zgsTool === 'line') return;
  // Other tools: copy coordinates to clipboard
  const coords = zgsCanvasToLogical(e);
  if (!coords) return;
  navigator.clipboard.writeText(coords.lx + ', ' + coords.ly).catch(() => {});
  if (zgsCoordTooltip) {
    zgsCoordTooltip.textContent = coords.lx + ', ' + coords.ly + ' (copied)';
  }
}

/**
 * Look up a VM program counter value in the source map and highlight the
 * corresponding line in the textarea.
 * @param {number} pc
 */
function zgsSyncSourceLine(pc) {
  if (!zgsSourceMap || !zgsTextarea) return;
  // Find the last source map entry whose byteOffset <= pc
  let best = null;
  for (const entry of zgsSourceMap) {
    if (entry.byteOffset <= pc) best = entry;
    else break;
  }
  if (!best) return;
  // Highlight the line in the textarea
  const lineNum = best.lineNum; // 1-based
  const lines = zgsTextarea.value.split('\n');
  let charStart = 0;
  for (let i = 0; i < lineNum - 1 && i < lines.length; i++) {
    charStart += lines[i].length + 1;
  }
  const charEnd = charStart + (lines[lineNum - 1] || '').length;
  zgsTextarea.setSelectionRange(charStart, charEnd);
  // Scroll the line into view
  zgsTextarea.blur();
  zgsTextarea.focus();
}

function initZgsEditor() {
  zgsTextarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('zgsTextarea'));
  zgsCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('zgsPreviewCanvas'));
  zgsOverlayCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('zgsOverlayCanvas'));
  zgsOverlayCtx = zgsOverlayCanvas ? zgsOverlayCanvas.getContext('2d') : null;
  zgsCoordTooltip = document.getElementById('zgsCoordTooltip');
  zgsCanvasContainer = document.getElementById('zgsCanvasContainer');
  zgsStatus = document.getElementById('zgsStatus');
  zgsFileNameEl = document.getElementById('zgsFileName');
  zgsPlayBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zgsPlayBtn'));

  // New button
  document.getElementById('zgsNewBtn')?.addEventListener('click', zgsNew);

  // Save dropdown
  const zgsSaveBtn = document.getElementById('zgsSaveBtn');
  const zgsSaveMenu = document.getElementById('zgsSaveMenu');
  if (zgsSaveBtn && zgsSaveMenu) {
    zgsSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zgsSaveMenu.classList.toggle('open');
    });
    zgsSaveMenu.addEventListener('click', (e) => {
      const item = /** @type {HTMLElement} */ (e.target).closest('.zgs-save-menu-item');
      if (!item) return;
      zgsSaveMenu.classList.remove('open');
      const fmt = item.dataset.format;
      if (fmt === 'zgs') handleZgsSave('zgs');
      else if (fmt === 'zgt') handleZgsSave('zgt');
      else if (fmt === 'zgp') zgsSaveProject();
      else if (fmt === 'asm') handleZgsExportAsm();
    });
    document.addEventListener('click', (e) => {
      if (!/** @type {HTMLElement} */ (e.target).closest('#zgsSaveGroup')) {
        zgsSaveMenu.classList.remove('open');
      }
    });
  }

  // Tab bar: Add scene button
  document.getElementById('zgsAddSceneBtn')?.addEventListener('click', () => zgsAddScene());

  // Render button
  document.getElementById('zgsRenderBtn')?.addEventListener('click', zgsRenderInstant);

  // Play/Pause
  zgsPlayBtn?.addEventListener('click', zgsTogglePlay);

  // Step
  document.getElementById('zgsStepBtn')?.addEventListener('click', zgsStep);

  // Speed slider
  const speedSlider = /** @type {HTMLInputElement} */ (document.getElementById('zgsSpeedSlider'));
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      zgsAnimSpeed = parseInt(speedSlider.value, 10);
    });
  }

  // Zoom selector
  const zoomSelect = /** @type {HTMLSelectElement} */ (document.getElementById('zgsZoomSelect'));
  if (zoomSelect) {
    const savedZoom = localStorage.getItem('zgsEditorZoom');
    if (savedZoom && ['1', '2', '3', '4', '5'].includes(savedZoom)) {
      zoomSelect.value = savedZoom;
    }
    const applyZoom = () => {
      const z = parseInt(zoomSelect.value, 10);
      zgsZoomFactor = z;
      const w = ZGS_SCREEN_W * z;
      const h = ZGS_SCREEN_H * z;
      zgsCanvas.width = w;
      zgsCanvas.height = h;
      zgsCanvas.style.width = w + 'px';
      zgsCanvas.style.height = h + 'px';
      if (zgsOverlayCanvas) {
        zgsOverlayCanvas.width = w;
        zgsOverlayCanvas.height = h;
        zgsOverlayCanvas.style.width = w + 'px';
        zgsOverlayCanvas.style.height = h + 'px';
      }
      // Re-render to fill resized canvas
      if (zgsVM) { zgsBlitVM(zgsVM); zgsDrawReferenceOverlay(); }
      zgsRefreshOverlay();
    };
    applyZoom();
    zoomSelect.addEventListener('change', () => {
      applyZoom();
      localStorage.setItem('zgsEditorZoom', zoomSelect.value);
    });
  }

  // Open file button
  const openBtn = document.getElementById('zgsOpenBtn');
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('zgsFileInput'));
  if (openBtn && fileInput) {
    openBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        zgsOpenFile(fileInput.files[0]);
        fileInput.value = '';
      }
    });
  }

  // Textarea: auto-render with debounce + tab key handling + undo/redo
  if (zgsTextarea) {
    // Capture pre-typing state for undo grouping
    zgsTextarea.addEventListener('beforeinput', () => {
      if (!zgsUndoTypingGroupOpen) {
        zgsUndoPush();
        zgsUndoTypingGroupOpen = true;
      }
    });

    zgsTextarea.addEventListener('input', () => {
      // Typing group debounce — pause > 1s starts a new undo group
      if (zgsUndoTypingTimer !== null) clearTimeout(zgsUndoTypingTimer);
      zgsUndoTypingTimer = window.setTimeout(() => {
        zgsUndoTypingGroupOpen = false;
        zgsUndoTypingTimer = null;
      }, 1000);
      // Debounced re-render
      if (zgsDebounceTimer !== null) clearTimeout(zgsDebounceTimer);
      zgsDebounceTimer = window.setTimeout(() => {
        zgsStopPlay();
        zgsVM = null;
        zgsRenderInstant();
      }, 500);
    });

    zgsTextarea.addEventListener('keydown', (e) => {
      // Tab inserts two spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        zgsUndoPush();
        const start = zgsTextarea.selectionStart;
        const end = zgsTextarea.selectionEnd;
        zgsTextarea.value = zgsTextarea.value.substring(0, start) + '  ' + zgsTextarea.value.substring(end);
        zgsTextarea.selectionStart = zgsTextarea.selectionEnd = start + 2;
      }
    });
  }

  // Drag & drop support
  document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) {
      zgsOpenFile(e.dataTransfer.files[0]);
    }
  });

  // Canvas interactive events
  if (zgsCanvasContainer) {
    zgsCanvasContainer.addEventListener('mousemove', zgsCanvasMouseMove);
    zgsCanvasContainer.addEventListener('mouseleave', zgsCanvasMouseLeave);
    zgsCanvasContainer.addEventListener('mousedown', zgsCanvasMouseDown);
    zgsCanvasContainer.addEventListener('contextmenu', zgsCanvasContextMenu);
    zgsCanvasContainer.style.cursor = 'crosshair';
  }
  // mouseup on document so drag completes even if mouse leaves the canvas
  document.addEventListener('mouseup', zgsCanvasMouseUp);

  // Escape key cancels active polyline
  document.addEventListener('keydown', (e) => {
    // Undo: Ctrl+Z (use e.code for layout-independent physical key)
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      zgsUndo();
      return;
    }
    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if ((e.code === 'KeyY' && (e.ctrlKey || e.metaKey) && !e.shiftKey) ||
        (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
      e.preventDefault();
      zgsRedo();
      return;
    }
    if (e.key === 'Escape' && zgsPolylineAnchor) {
      zgsPolylineAnchor = null;
      zgsPolylineTrackPos = null;
      document.removeEventListener('mousemove', zgsDocMouseMoveDuringDrag);
      zgsRefreshOverlay();
      zgsSetStatus('Polyline finished');
    }
    // Alt+Arrow: nudge selected coordinates
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      let dx = 0, dy = 0;
      if (e.code === 'ArrowLeft')  dx = -1;
      else if (e.code === 'ArrowRight') dx = 1;
      else if (e.code === 'ArrowUp')    dy = -1;
      else if (e.code === 'ArrowDown')  dy = 1;
      if (dx || dy) {
        e.preventDefault();
        zgsNudgeSelection(dx, dy);
      }
    }
  });

  // Drawing toolbar buttons
  document.querySelectorAll('.zgs-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      zgsSetTool(btn.getAttribute('data-tool') || 'dot');
    });
  });

  // Show Pen checkbox
  const showPenCb = /** @type {HTMLInputElement} */ (document.getElementById('zgsShowPen'));
  if (showPenCb) {
    showPenCb.addEventListener('change', () => {
      zgsShowPen = showPenCb.checked;
      zgsRefreshOverlay();
    });
  }

  // Show Grid checkbox
  const showGridCb = /** @type {HTMLInputElement} */ (document.getElementById('zgsShowGrid'));
  if (showGridCb) {
    const savedGrid = localStorage.getItem('zgsEditorGrid');
    if (savedGrid === 'true') {
      zgsShowGrid = true;
      showGridCb.checked = true;
    }
    showGridCb.addEventListener('change', () => {
      zgsShowGrid = showGridCb.checked;
      localStorage.setItem('zgsEditorGrid', zgsShowGrid ? 'true' : 'false');
      zgsRefreshOverlay();
    });
  }

  // Theme toggle button
  const themeBtn = document.getElementById('zgsThemeBtn');
  if (themeBtn) {
    const updateThemeBtn = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      themeBtn.textContent = isLight ? '\u2600' : '\u263E';
    };
    updateThemeBtn();
    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('spectraLabTheme');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('spectraLabTheme', 'light');
      }
      updateThemeBtn();
    });
  }

  // Color palette swatches
  zgsBuildPalette();

  // Bright / Flash checkboxes — mark color dirty so next draw syncs
  const brightCb = /** @type {HTMLInputElement} */ (document.getElementById('zgsBrightCheck'));
  if (brightCb) {
    brightCb.addEventListener('change', () => {
      zgsBright = brightCb.checked;
      zgsColorDirty = true;
    });
  }
  const flashCb = /** @type {HTMLInputElement} */ (document.getElementById('zgsFlashCheck'));
  if (flashCb) {
    flashCb.addEventListener('change', () => {
      zgsFlash = flashCb.checked;
      zgsColorDirty = true;
    });
  }

  const patternSelect = /** @type {HTMLSelectElement} */ (document.getElementById('zgsInsertPattern'));
  if (patternSelect) {
    patternSelect.addEventListener('change', () => {
      if (!patternSelect.value) return;
      zgsInsertInstructionBeforeEnd('set_pattern ' + patternSelect.value + '\n');
      patternSelect.options[0].textContent = 'Pat: ' + patternSelect.value;
      patternSelect.selectedIndex = 0;
    });
  }

  const xorBtn = document.getElementById('zgsInsertXor');
  xorBtn?.addEventListener('click', () => {
    const becoming = !xorBtn.classList.contains('toggled');
    zgsInsertInstructionBeforeEnd(becoming ? 'set_mode xor\n' : 'set_mode set\n');
    xorBtn.classList.toggle('toggled');
  });
  document.getElementById('zgsInsertClear')?.addEventListener('click', () => {
    const attr = zgsVM ? zgsVM.attr : 0x07;
    zgsInsertInstructionBeforeEnd('clear_region 0, 0, 32, 24, 0x' + attr.toString(16).padStart(2, '0') + '\n');
  });
  document.getElementById('zgsInsertWaitKey')?.addEventListener('click', () => {
    zgsInsertInstructionBeforeEnd('wait_key\n');
  });
  document.getElementById('zgsInsertEnd')?.addEventListener('click', () => {
    zgsInsertInstructionBeforeEnd('end\n');
  });
  document.getElementById('zgsInsertText')?.addEventListener('click', () => {
    const textInput = /** @type {HTMLInputElement} */ (document.getElementById('zgsTextInput'));
    const text = textInput ? textInput.value : '';
    if (!text) { zgsSetStatus('Enter text to print'); return; }
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const modeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsTextModeSelect'));
    const textMode = modeSel ? parseInt(modeSel.value, 10) : 32;
    const suffix = textMode === 32 ? '' : '_' + textMode;
    zgsInsertInstructionBeforeEnd('print_text' + suffix + ' "' + escaped + '"\n');
    // Update cursor from VM state (VM already ran the print instruction)
    if (zgsVM) {
      const col = textMode === 64 ? zgsVM.cursorCol64 : textMode === 42 ? zgsVM.cursorCol42 : zgsVM.cursorCol;
      const row = textMode === 64 ? zgsVM.cursorRow64 : textMode === 42 ? zgsVM.cursorRow42 : zgsVM.cursorRow;
      zgsTextCursorPos = { col, row, mode: textMode };
      zgsTextCursorByMode[textMode] = { col, row };
      zgsDrawOverlay();
    }
  });
  document.getElementById('zgsInsertPacked')?.addEventListener('click', () => {
    const textInput = /** @type {HTMLInputElement} */ (document.getElementById('zgsTextInput'));
    const text = textInput ? textInput.value : '';
    if (!text) { zgsSetStatus('Enter text to print'); return; }
    const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsDictSelect'));
    if (sel && sel.value === 'user' && !zgsUserDict) {
      zgsSetStatus('Load a .zdict file first (click "Load .zdict")');
      return;
    }
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const dict = zgsGetSelectedDict();
    const packed = zgsPackText(text, dict);
    // Ensure .dict directive is present in source
    zgsEnsureDictDirective();
    const modeSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsTextModeSelect'));
    const textMode = modeSel ? parseInt(modeSel.value, 10) : 32;
    const suffix = textMode === 32 ? '' : '_' + textMode;
    zgsInsertInstructionBeforeEnd('print_packed' + suffix + ' "' + escaped + '"\n');
    // Update cursor from VM state (VM already ran the print instruction)
    if (zgsVM) {
      const col = textMode === 64 ? zgsVM.cursorCol64 : textMode === 42 ? zgsVM.cursorCol42 : zgsVM.cursorCol;
      const row = textMode === 64 ? zgsVM.cursorRow64 : textMode === 42 ? zgsVM.cursorRow42 : zgsVM.cursorRow;
      zgsTextCursorPos = { col, row, mode: textMode };
      zgsTextCursorByMode[textMode] = { col, row };
      zgsDrawOverlay();
    }
    // Lock the dict dropdown — dict is committed for this file
    zgsSyncDictDropdown();
    zgsSetStatus('Packed: ' + text.length + ' chars \u2192 ' + packed.length + ' bytes (' + Math.round(100 - packed.length * 100 / text.length) + '% saved)');
  });

  // Text mode selector: restore per-mode cursor when switching modes
  document.getElementById('zgsTextModeSelect')?.addEventListener('change', () => {
    const modeSel = /** @type {HTMLSelectElement} */ (document.getElementById('zgsTextModeSelect'));
    const newMode = parseInt(modeSel.value, 10);
    const saved = zgsTextCursorByMode[newMode];
    if (saved) {
      zgsTextCursorPos = { col: saved.col, row: saved.row, mode: newMode };
      const info = document.getElementById('zgsTextCursorInfo');
      if (info) info.textContent = 'Cursor: col ' + saved.col + ', row ' + saved.row + ' (' + newMode + '-col)';
    } else if (zgsVM) {
      // Fall back to VM cursor state from the scene
      const col = newMode === 64 ? zgsVM.cursorCol64 : newMode === 42 ? zgsVM.cursorCol42 : zgsVM.cursorCol;
      const row = newMode === 64 ? zgsVM.cursorRow64 : newMode === 42 ? zgsVM.cursorRow42 : zgsVM.cursorRow;
      zgsTextCursorPos = { col, row, mode: newMode };
      zgsTextCursorByMode[newMode] = { col, row };
      const info = document.getElementById('zgsTextCursorInfo');
      if (info) info.textContent = 'Cursor: col ' + col + ', row ' + row + ' (' + newMode + '-col)';
    } else {
      zgsTextCursorPos = null;
      const info = document.getElementById('zgsTextCursorInfo');
      if (info) info.textContent = '';
    }
    zgsDrawOverlay();
  });

  // Dict selector: when changed, update the .dict directive in source and lock
  const dictSel = document.getElementById('zgsDictSelect');
  if (dictSel) {
    dictSel.addEventListener('change', () => {
      zgsUpdateDictDirective();
    });
  }

  // Load .zdict button → trigger file input
  document.getElementById('zgsDictLoad')?.addEventListener('click', () => {
    /** @type {HTMLInputElement|null} */
    const fi = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsDictFileInput'));
    if (fi) { fi.value = ''; fi.click(); }
  });

  // .zdict file input handler
  document.getElementById('zgsDictFileInput')?.addEventListener('change', (e) => {
    const fi = /** @type {HTMLInputElement} */ (e.target);
    const file = fi.files && fi.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(/** @type {ArrayBuffer} */ (reader.result));
        zgsUserDict = zgsLoadZdict(data);
        zgsSetStatus('Loaded user dict: ' + zgsUserDict.bigrams.length + ' bigrams, ' +
          zgsUserDict.trigrams.length + ' trigrams, ' + zgsUserDict.words.length + ' words (' + file.name + ')');
        // Re-render if already using user dict
        const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('zgsDictSelect'));
        if (sel && sel.value === 'user') zgsRenderInstant();
      } catch (err) {
        zgsSetStatus('Error loading .zdict: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Reference Image panel
  const refHeader = document.getElementById('zgsRefHeader');
  const refPanel = document.getElementById('zgsRefPanel');
  if (refHeader && refPanel) {
    const savedRefOpen = localStorage.getItem('zgsRefPanelOpen');
    if (savedRefOpen === 'true') {
      refPanel.style.display = '';
      refHeader.innerHTML = '&#9660; Reference Image';
    }
    refHeader.addEventListener('click', () => {
      const open = refPanel.style.display === 'none';
      refPanel.style.display = open ? '' : 'none';
      refHeader.innerHTML = (open ? '&#9660;' : '&#9654;') + ' Reference Image';
      localStorage.setItem('zgsRefPanelOpen', open ? 'true' : 'false');
    });
  }

  const refFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefFileInput'));
  document.getElementById('zgsRefLoadBtn')?.addEventListener('click', () => {
    if (refFileInput) { refFileInput.value = ''; refFileInput.click(); }
  });
  if (refFileInput) {
    refFileInput.addEventListener('change', () => {
      if (refFileInput.files && refFileInput.files[0]) {
        zgsLoadRefImage(refFileInput.files[0]);
      }
    });
  }

  document.getElementById('zgsRefClearBtn')?.addEventListener('click', () => {
    zgsClearRefImage();
    zgsSetStatus('Reference image cleared');
  });

  const refShowCb = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefShowCb'));
  if (refShowCb) {
    refShowCb.addEventListener('change', () => {
      zgsActiveScene().refShow = refShowCb.checked;
      if (zgsVM) { zgsBlitVM(zgsVM); zgsDrawReferenceOverlay(); zgsRefreshOverlay(); }
    });
  }

  const refOpSlider = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefOpacity'));
  const refOpVal = document.getElementById('zgsRefOpacityVal');
  if (refOpSlider) {
    refOpSlider.addEventListener('input', () => {
      const pct = parseInt(refOpSlider.value, 10);
      zgsActiveScene().refOpacity = pct / 100;
      if (refOpVal) refOpVal.textContent = pct + '%';
      if (zgsVM) { zgsBlitVM(zgsVM); zgsDrawReferenceOverlay(); zgsRefreshOverlay(); }
    });
  }

  const refXInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefX'));
  const refYInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefY'));
  const refWInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefW'));
  const refHInput = /** @type {HTMLInputElement|null} */ (document.getElementById('zgsRefH'));

  const refPosChanged = () => {
    const scene = zgsActiveScene();
    if (refXInput) scene.refOffsetX = parseInt(refXInput.value, 10) || 0;
    if (refYInput) scene.refOffsetY = parseInt(refYInput.value, 10) || 0;
    if (refWInput) { const w = parseInt(refWInput.value, 10); scene.refWidth = refWInput.value ? (w > 0 ? w : null) : null; }
    if (refHInput) { const h = parseInt(refHInput.value, 10); scene.refHeight = refHInput.value ? (h > 0 ? h : null) : null; }
    if (zgsVM) { zgsBlitVM(zgsVM); zgsDrawReferenceOverlay(); zgsRefreshOverlay(); }
  };
  refXInput?.addEventListener('input', refPosChanged);
  refYInput?.addEventListener('input', refPosChanged);
  refWInput?.addEventListener('input', refPosChanged);
  refHInput?.addEventListener('input', refPosChanged);

  // Start with template scene
  zgsNew();
}

document.addEventListener('DOMContentLoaded', initZgsEditor);
