// SpectraLab v1.41.0 - Main application
// @ts-check
"use strict";

// Local theme colors - will be updated by getThemeColors() if theme_manager.js is loaded
const localThemeColors = {
  background: '#222',
  backgroundInactive: '#111',
  foreground: '#0f0',
  foregroundInactive: '#050',
  grid: '#444',
  labels: '#060',
  highlight: 'rgba(255, 0, 255, 0.7)',
  selectionSingle: '#f0f',
  selectionRange: '#f00'
};

/**
 * Gets theme colors, using global themeColors if available, otherwise local fallback
 * @returns {typeof localThemeColors}
 */
function getThemeColors() {
  // @ts-ignore - themeColors may be defined by theme_manager.js
  return (typeof themeColors !== 'undefined') ? themeColors : localThemeColors;
}

// Fallback for isBitSet if constants.js is not loaded
if (typeof isBitSet === 'undefined') {
  /**
   * Check if a bit is set in a byte (MSB first, bit 0 = leftmost pixel)
   * @param {number} byte - The byte to check
   * @param {number} bit - Bit position (0-7, where 0 is MSB/leftmost)
   * @returns {boolean} True if bit is set
   */
  // @ts-ignore - defining global fallback
  var isBitSet = function(byte, bit) {
    return (byte & (0x80 >> bit)) !== 0;
  };
}

/**
 * Gets checkerboard color for transparent pixel
 * @param {number} x - Pixel X coordinate
 * @param {number} y - Pixel Y coordinate
 * @returns {number[]} RGB array [r, g, b]
 */
function getCheckerboardColor(x, y) {
  const cellSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_CELL_SIZE) || 4;
  const lightColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_LIGHT_COLOR) || 68;
  const darkColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_DARK_COLOR) || 34;
  const checker = ((Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0);
  const gray = checker ? lightColor : darkColor;
  return [gray, gray, gray];
}

/**
 * Checks if a pixel should show transparency checkerboard
 * @param {number} maskIdx - Index into screenTransparencyMask
 * @returns {boolean} True if pixel is transparent and should show checkerboard
 */
function isPixelTransparent(maskIdx) {
  return typeof layersEnabled !== 'undefined' && layersEnabled &&
         typeof screenTransparencyMask !== 'undefined' && screenTransparencyMask &&
         !screenTransparencyMask[maskIdx];
}

/**
 * Draws checkerboard pattern for transparent border segment
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position in screen pixels
 * @param {number} y - Y position in screen pixels
 * @param {number} width - Width in screen pixels
 */
function drawBorderCheckerboard(ctx, x, y, width) {
  const cellSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_CELL_SIZE) || 4;
  const lightColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_LIGHT_COLOR) || 68;
  const darkColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_DARK_COLOR) || 34;

  // Draw pixel by pixel (respecting zoom)
  for (let px = 0; px < width; px++) {
    const screenX = x + px;
    const checker = ((Math.floor(screenX / cellSize) + Math.floor(y / cellSize)) % 2 === 0);
    const gray = checker ? lightColor : darkColor;
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.fillRect(screenX * zoom, y * zoom, zoom, zoom);
  }
}

// ============================================================================
// Constants
// ============================================================================

const SCREEN = {
  WIDTH: 256,
  HEIGHT: 192,
  BITMAP_SIZE: 6144,      // 256 * 192 / 8
  ATTR_SIZE: 768,         // 32 * 24
  TOTAL_SIZE: 6912,       // BITMAP_SIZE + ATTR_SIZE
  CHAR_ROWS: 24,
  CHAR_COLS: 32,
  BORDER_SIZE: 24
};

// ZX Spectrum attribute-byte layout helpers.
// Attribute byte layout: FBPPPIII
//   III  (bits 0-2): ink color index 0-7
//   PPP  (bits 3-5): paper color index 0-7
//   B    (bit 6):    bright flag (0x40)
//   F    (bit 7):    flash flag (0x80)
const ATTR = {
  INK_MASK:    0x07,
  PAPER_SHIFT: 3,
  PAPER_MASK:  0x07,
  BRIGHT_BIT:  0x40,
  FLASH_BIT:   0x80,
  /** @param {number} b */ ink:    (b) => b & 0x07,
  /** @param {number} b */ paper:  (b) => (b >> 3) & 0x07,
  /** @param {number} b */ bright: (b) => (b & 0x40) !== 0,
  /** @param {number} b */ flash:  (b) => (b & 0x80) !== 0,
  /** @param {number} ink @param {number} paper @param {boolean|number} bright @param {boolean|number} [flash] */
  make: (ink, paper, bright, flash) =>
    (ink & 0x07) | ((paper & 0x07) << 3) | (bright ? 0x40 : 0) | (flash ? 0x80 : 0)
};

// File format types
const FORMAT = {
  UNKNOWN: 'unknown',
  SCR: 'scr',             // Standard 6912-byte screen dump
  SCR_ULAPLUS: 'scr+',    // 6976-byte SCR with ULA+ palette (6912 + 64)
  ATTR_53C: '53c',        // 768-byte attribute-only with checkerboard
  BSC: 'bsc',             // 11136-byte border screen (SCR + border data)
  IFL: 'ifl',             // 9216-byte multicolor 8x2 (6144 pixels + 3072 attributes)
  BMC4: 'bmc4',           // 11904-byte border + 8x4 multicolor
  MLT: 'mlt',             // 12288-byte multicolor 8x1 (6144 pixels + 6144 attributes)
  RGB3: 'rgb3',           // 18432-byte tricolor RGB (3 × 6144 bitmaps)
  GIGASCREEN: 'img',      // 13824-byte Gigascreen (2 × 6912 SCR frames)
  MONO_FULL: 'mono_full', // 6144-byte monochrome (full screen)
  MONO_2_3: 'mono_2_3',   // 4096-byte monochrome (2/3 screen)
  MONO_1_3: 'mono_1_3',   // 2048-byte monochrome (1/3 screen)
  SPECSCII: 'specscii',   // 768-byte text screen (32x24 characters)
  SCA: 'sca',             // SCA animation (multiple frames with timing)
  ZXP: 'zxp',             // ZXP variable-size (non-standard dimensions)
  CHR: 'ch$',             // chr$ variable-size (interleaved cell format)
  MGH: 'mgh',             // Multiartist MGH multicolor gigascreen (.mg1/.mg2/.mg4/.mg8)
  HLR: 'hlr',             // Gigascreen Lowres (1628-byte self-extracting .hlr)
  STL: 'stl',             // Stellar (64×48 multicolor + gigascreen, 3072 bytes)
  BSP: 'bsp',             // BSP (header + screen + optional border + optional gigascreen)
  NXI: 'nxi',             // ZX Spectrum Next Layer 2 with embedded palette (49664 bytes)
  SL2: 'sl2',             // ZX Spectrum Next Layer 2 raw pixels (49152 or 49280 bytes)
  LORES: 'lores',          // ZX Spectrum Next LoRes 128×96 256-color (12288 bytes)
  LORES_RAD: 'lores_rad',  // ZX Spectrum Next LoRes Radastan 128×96 16-color 4bpp (6144 bytes)
  SCR_ULANEXT: 'scr_ulanext', // SCR with ULANext extended palette (6912 + 1 mask + RGB333 palette)
  GMX: 'gmx',               // Scorpion GMX 640×200 (32768 bytes)
  GMX160: 'gmx160'           // Scorpion GMX 160×200 attr-only (16128 bytes)
};

// SPECSCII format constants
// Stream format with embedded escape codes (ZX Spectrum BASIC control codes):
// - 0x0D = Enter (CR+LF) - move to start of next line
// - 0x10 XX = INK color (0-7)
// - 0x11 XX = PAPER color (0-7)
// - 0x12 XX = FLASH (0 or 1)
// - 0x13 XX = BRIGHT (0 or 1)
// - 0x14 XX = INVERSE (0 or 1) - swaps ink/paper
// - 0x15 XX = OVER (0 or 1) - XOR mode
// - 0x16 YY XX = AT row, col - position cursor
// - 0x17 XX = TAB to column
// - Other bytes = character codes (0x20-0x7F printable, 0x80-0xFF block graphics)
const SPECSCII = {
  CHAR_ROWS: 24,
  CHAR_COLS: 32,
  FIRST_CHAR: 32,         // Space character (ASCII 32)
  FONT_SIZE: 768,         // 96 characters × 8 bytes
  FONT_CHARS: 96,
  // Control codes (ZX Spectrum BASIC)
  CC_ENTER: 0x0D,         // Carriage return + line feed
  CC_INK: 0x10,           // Next byte is ink color
  CC_PAPER: 0x11,         // Next byte is paper color
  CC_FLASH: 0x12,         // Next byte is flash flag
  CC_BRIGHT: 0x13,        // Next byte is bright flag
  CC_INVERSE: 0x14,       // Next byte is inverse flag
  CC_OVER: 0x15,          // Next byte is over (XOR) flag
  CC_AT: 0x16,            // Next 2 bytes are row, col
  CC_TAB: 0x17            // Next byte is tab column
};

// IFL format constants (8x2 multicolor)
// Same pixel layout as SCR, but attributes are 8x2 instead of 8x8
// 96 attribute rows (192 pixel lines / 2) × 32 columns = 3072 bytes
const IFL = {
  TOTAL_SIZE: 9216,       // 6144 + 3072
  BITMAP_SIZE: 6144,      // Same as standard SCR
  ATTR_SIZE: 3072,        // 96 rows × 32 columns (one attr row per 2 pixel lines)
  ATTR_ROWS: 96,          // 192 / 2
  ATTR_COLS: 32
};

// MLT format constants (8x1 multicolor)
// Each pixel line has its own attribute row
// 192 attribute rows × 32 columns = 6144 bytes
const MLT = {
  TOTAL_SIZE: 12288,          // 6144 + 6144
  TOTAL_SIZE_ULAPLUS: 12352,  // 12288 + 64 (with ULA+ palette)
  BITMAP_SIZE: 6144,          // Same as standard SCR
  ATTR_SIZE: 6144,            // 192 rows × 32 columns (one attr row per pixel line)
  ATTR_ROWS: 192,
  ATTR_COLS: 32
};

// RGB3 format constants (tricolor RGB)
// Three bitmaps: Red, Green, Blue - combined additively
const RGB3 = {
  TOTAL_SIZE: 18432,      // 6144 × 3
  BITMAP_SIZE: 6144,
  RED_OFFSET: 0,
  GREEN_OFFSET: 6144,
  BLUE_OFFSET: 12288
};

// Gigascreen format constants (two alternating SCR frames)
// Creates more colors through persistence of vision at 50Hz
const GIGASCREEN = {
  TOTAL_SIZE: 13824,      // 6912 × 2
  FRAME_SIZE: 6912,       // Standard SCR size
  FRAME1_OFFSET: 0,
  FRAME2_OFFSET: 6912
};

// Gigascreen display modes
const GIGASCREEN_MODE = {
  AVERAGE: 'average',     // Blend colors by averaging RGB values
  FLICKER: 'flicker',     // Alternate frames at 50fps
  BLEND_DARK: 'blend_dark' // Blend using minimum (darker) RGB values
};

// MGH format constants (Multiartist multicolor gigascreen)
// 256-byte header + 2 interleaved bitmaps + 2 multicolor attr blocks
// Mode determines attr cell height: 1 (mg1), 2 (mg2), 4 (mg4), 8 (mg8)
const MGH = {
  HEADER_SIZE: 256,
  BITMAP_SIZE: 6144,
  SIGNATURE: 'MGH'
};

// HLR format constants (Gigascreen Lowres / "Half Low Res")
// 1628-byte self-extracting Z80 program that displays a two-frame gigascreen
// with a fixed 4-rows-on / 4-rows-off bitmap pattern and two alternating
// attribute banks. Each 8x4 half-cell shows a single blended color, giving
// a 32 x 48 grid of colored cells on a 256 x 192 display.
const HLR = {
  TOTAL_SIZE: 1628,        // 84 loader + 8 pattern + 2 * 768 attrs
  PREFIX_SIZE: 92,         // Loader (84) + bitmap pattern (8)
  PATTERN_OFFSET: 84,      // 0x54: 8-byte fill pattern (one byte per scanline)
  PATTERN_SIZE: 8,
  ATTRS1_OFFSET: 92,       // 0x5C
  ATTRS2_OFFSET: 860,      // 0x35C (ATTRS1_OFFSET + 768)
  ATTRS_SIZE: 768          // Standard 32x24 attribute layout
};

// STL (Stellar) format constants
// 64×48 lowres multicolor + gigascreen: 3072 bytes total
// Two gigascreen frames of 1536 attrs each (32 cols × 48 rows, 8×4 multicolor cells)
// Data is interleaved in 4-byte groups: [f1_a, f1_b, f2_a, f2_b]
// where (f1_a, f1_b) are consecutive frame-1 attrs and (f2_a, f2_b) are frame-2 attrs.
// Fixed bitmap pattern 0x0F per cell: left 4px = paper color, right 4px = ink color.
// Effective resolution: 64×48 fat pixels (each 4×4 real pixels).
const STL = {
  TOTAL_SIZE: 3072,
  ATTRS_PER_FRAME: 1536,  // 32 cols × 48 rows
  COLS: 32,               // Attribute columns (8px each)
  ROWS: 48,               // Attribute rows (4px each)
  FAT_COLS: 64,           // Fat-pixel columns (4px each)
  FAT_ROWS: 48,           // Fat-pixel rows (4px each)
  CELL_HEIGHT: 4           // Multicolor cell height in pixels
};

// BSP format constants (Border Screen with Header)
// Header (70 bytes): magic "bsp" + config + border color + title + author
// Config flags: bit7=hasGigaData, bit6=hasBorderData
// Data: screen(s) + optional RLE-compressed border(s)
// Border encoding: RLE "tacts" — each byte = (tactsCode<<3)|color
const BSP = {
  HEADER_SIZE: 70,
  MAGIC: [0x62, 0x73, 0x70],  // "bsp"
  FLAG_GIGA: 0x80,
  FLAG_BORDER: 0x40,
  CONFIG_OFFSET: 3,
  BORDER_COLOR_OFFSET: 5,
  TITLE_OFFSET: 6, TITLE_LENGTH: 32,
  AUTHOR_OFFSET: 38, AUTHOR_LENGTH: 32
};

// NXI format constants (ZX Spectrum Next Layer 2 with palette)
// 256×192: 512-byte palette (256×2 RGB333) + 49152 pixels = 49664 bytes, row-major
// 320×256: 512-byte palette (256×2 RGB333) + 81920 pixels = 82432 bytes, column-major
// 640×256:  32-byte palette (16×2  RGB333) + 81920 pixels = 81952 bytes, column-major, 4bpp
const NXI = {
  TOTAL_SIZE: 49664,
  TOTAL_SIZE_320: 82432,
  TOTAL_SIZE_640: 81952,
  PALETTE_SIZE: 512,
  PALETTE_SIZE_4BPP: 32,
  PALETTE_ENTRIES: 256,
  PALETTE_ENTRIES_4BPP: 16,
  PIXEL_OFFSET: 512,
  PIXEL_OFFSET_4BPP: 32,
  WIDTH: 256, HEIGHT: 192,
  WIDTH_320: 320, HEIGHT_320: 256,
  WIDTH_640: 640, HEIGHT_640: 256,
  PIXEL_DATA_SIZE_EXT: 81920
};

// SL2 format constants (ZX Spectrum Next Layer 2 raw pixels)
// No palette — uses default Next identity RGB332 mapping
// Raw = 49152 bytes; with 128-byte header = 49280 bytes
// Extended = 81920 bytes (ambiguous: 320×256 8bpp or 640×256 4bpp)
const SL2 = {
  RAW_SIZE: 49152,
  HEADER_SIZE: 49280,
  HEADER_OFFSET: 128,
  EXT_SIZE: 81920,
  PALETTE_SIZE: 512,              // 256 entries × 2 bytes (RGB333)
  PALETTE_SIZE_4BPP: 32,          // 16 entries × 2 bytes (RGB333) for 640×256 4bpp
  TOTAL_SIZE_WITH_PAL: 49664,     // 49152 + 512
  EXT_SIZE_WITH_PAL: 82432,       // 81920 + 512 (8bpp 320×256 with 256-entry palette)
  EXT_SIZE_WITH_PAL_4BPP: 81952,  // 81920 + 32 (4bpp 640×256 with 16-entry palette)
  WIDTH: 256, HEIGHT: 192,
  WIDTH_320: 320, HEIGHT_320: 256,
  WIDTH_640: 640, HEIGHT_640: 256
};

// LoRes format constants (ZX Spectrum Next LoRes 128×96 256-color)
// Raw pixel dump: 128 * 96 = 12288 bytes, no header, no palette
const LORES = {
  WIDTH: 128, HEIGHT: 96,
  PIXEL_DATA_SIZE: 12288,
  PALETTE_SIZE: 512,            // 256 entries × 2 bytes (RGB333), appended after pixel data
  TOTAL_SIZE_WITH_PAL: 12800    // 12288 + 512
};

// LoRes Radastan format constants (ZX Spectrum Next LoRes 128×96 16-color 4bpp)
// Packed 2 pixels/byte: high nibble = left pixel, low nibble = right pixel
// Contiguous row-major layout at $4000-$57FF (no gap)
const LORES_RAD = {
  WIDTH: 128, HEIGHT: 96,
  PIXEL_DATA_SIZE: 6144,
  GRB_PALETTE_SIZE: 16,       // 16 entries × 1 byte (GRB332), ZX-Uno Radastan format
  TOTAL_SIZE_WITH_GRB_PAL: 6160,  // 6144 + 16
  PALETTE_SIZE: 32,           // 16 entries × 2 bytes (RGB333), ZX Next format
  TOTAL_SIZE_WITH_PAL: 6176,  // 6144 + 32
  BYTES_PER_ROW: 64
};

// Scorpion GMX 640×200 format constants
// Layout: 16000 pixel bytes + 384 pad + 16000 attr bytes + 384 pad = 32768
// Linear row-major (no ZX interleaving), 80 bytes/line × 200 lines
// attrCellHeight = 1 (every pixel row has its own attr row)
// Display: pixels are half-width → stretch height 2× for correct aspect ratio
const GMX = {
  WIDTH: 640,
  HEIGHT: 200,
  COLS: 80,                 // 640 / 8
  LINE_BYTES: 80,           // bytes per line
  PIXEL_SIZE: 16000,        // 80 × 200
  ATTR_OFFSET: 16384,       // 16000 + 384 padding
  TOTAL_SIZE: 32768,        // 16384 × 2
  PADDING: 384              // zeros between sections
};

// Scorpion GMX 160×200 attr-only format constants
// Layout: 128-byte header ("GMX\x0F" + zero padding) + 16000 attr bytes = 16128
// Pixel data implied: every pixel byte = 0x0F (00001111)
// Effective resolution: 160 color columns × 200 rows
// Display at 320×200 (each color column = 2px)
const GMX160 = {
  HEADER_SIZE: 128,
  ATTR_SIZE: 16000,         // 80 × 200
  TOTAL_SIZE: 16128,        // 128 + 16000
  MAGIC: 'GMX',
  WIDTH: 320,               // display width (160 color pairs × 2px each)
  HEIGHT: 200,
  COLS: 40,                 // 320 / 8 (for Picture object)
  PIXEL_BYTE: 0x0F          // implied pixel pattern
};

/**
 * Returns the pixel data offset within screenData for NXI/SL2 formats.
 * @returns {number}
 */
function getNxiPixelOffset() {
  if (currentFormat === FORMAT.NXI) {
    return nxiLayer2Mode === '640x256' ? NXI.PIXEL_OFFSET_4BPP : NXI.PIXEL_OFFSET;
  }
  if (currentFormat === FORMAT.SL2) {
    if (nxiLayer2Mode !== '256x192') return 0; // extended SL2 has no header
    return screenData.length === SL2.HEADER_SIZE ? SL2.HEADER_OFFSET : 0;
  }
  return 0;
}

/**
 * Returns the flat pixel index within the pixel data area for NXI/SL2 formats.
 * Handles row-major (256×192) and column-major (320×256, 640×256) addressing.
 * For 640×256 4bpp, returns the BYTE index (each byte holds 2 pixels).
 * @param {number} x - pixel X coordinate
 * @param {number} y - pixel Y coordinate
 * @returns {number} byte offset within pixel data
 */
function getNxiPixelIndex(x, y) {
  if (nxiLayer2Mode === '320x256') return x * 256 + y;        // column-major 8bpp
  if (nxiLayer2Mode === '640x256') return (x >> 1) * 256 + y; // column-major 4bpp (byte index)
  return y * 256 + x;                                          // row-major 8bpp (256×192)
}

/**
 * Returns the vertical display scale factor for the current format.
 * Formats with half-width pixels (NXI 640×256, GMX 640×200) double the height
 * instead of halving the width, so all horizontal pixels are preserved.
 * @returns {number} 2 for GMX and NXI 640×256, 1 for all other formats
 */
function getPixelScaleY() {
  if ((currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) && nxiLayer2Mode === '640x256') return 2;
  if (currentFormat === FORMAT.GMX || currentFormat === FORMAT.GMX160) return 2;
  return 1;
}

/**
 * Returns the horizontal display scale factor for the current format.
 * @returns {number} Always 1 (no horizontal scaling)
 */
function getPixelScaleX() {
  return 1;
}

// BMC4 format constants (border + 8x4 multicolor)
// Layout: bitmap + attr1 + attr2 + border
// attr1 = attributes for top 4 lines of each char cell
// attr2 = attributes for bottom 4 lines of each char cell
const BMC4 = {
  TOTAL_SIZE: 11904,      // 6144 + 768 + 768 + 4224
  BITMAP_SIZE: 6144,      // Same as standard SCR
  ATTR1_OFFSET: 6144,     // First attributes (lines 0-3 of each char)
  ATTR1_SIZE: 768,        // 24 rows × 32 columns (same as standard SCR)
  ATTR2_OFFSET: 6912,     // Second attributes (lines 4-7 of each char)
  ATTR2_SIZE: 768,
  BORDER_OFFSET: 7680,    // 6144 + 768 + 768
  BORDER_SIZE: 4224       // Same as BSC
};

// SCA format constants (animation format)
// Header structure (14 bytes):
// - Bytes 0-2: "SCA" identifier
// - Byte 3: Format version number
// - Bytes 4-5: Frame width in pixels (little-endian)
// - Bytes 6-7: Frame height in pixels (little-endian, max 192)
// - Byte 8: Border color suggestion (0-7)
// - Bytes 9-10: Total frame count (little-endian)
// - Byte 11: Payload type identifier (0 = uncompressed)
// - Bytes 12-13: Payload starting position (little-endian)
// Payload type 0: delay table (1 byte per frame) + frames (6912 bytes each)
const SCA = {
  HEADER_SIZE: 14,
  SIGNATURE: 'SCA',
  FRAME_SIZE: 6912,           // Payload type 0: full SCREEN$ format per frame
  ATTR_FRAME_SIZE: 768,       // Payload type 1: attributes only per frame
  FILL_PATTERN_SIZE: 8,       // Payload type 1: 8-byte fill pattern
  DELAY_UNIT_MS: 20           // 1/50 second = 20ms per delay unit
};

// BSC format constants
// Full frame: 384x304 pixels
// Main screen: 256x192 pixels at offset (64, 64)
// Border color encoding: each byte has 2 colors (3 bits each)
// - Bits 2-0: first color (0-7) for 8 pixels
// - Bits 5-3: second color (0-7) for next 8 pixels
// - Bits 7-6: unused/ignored
// Border data: 4224 bytes total, 1:1 mapping with screen lines
// - Top border: 64 lines × 24 bytes = 1536 bytes (full 384px width)
// - Side borders: 192 lines × 8 bytes = 1536 bytes (4 bytes left + 4 bytes right, 64px each)
// - Bottom border: 48 lines × 24 bytes = 1152 bytes (full 384px width)
// Screen layout: 64px top border + 192px main + 48px bottom border = 304
const BSC = {
  TOTAL_SIZE: 11136,        // 6144 + 768 + 4224
  BORDER_OFFSET: 6912,      // Border data starts after standard SCR
  BORDER_SIZE: 4224,        // Total border data: 64*24 + 192*8 + 48*24 = 1536 + 1536 + 1152
  BYTES_PER_FULL_LINE: 24,  // Top/bottom border: 24 bytes per line (full 384px width)
  BYTES_PER_SIDE_LINE: 8,   // Side border: 8 bytes per line (4 left + 4 right)
  PIXELS_PER_COLOR: 8,      // Each 3-bit color covers 8 horizontal pixels
  FRAME_WIDTH: 384,         // Full frame width in pixels
  FRAME_HEIGHT: 304,        // Full frame height in pixels
  BORDER_LEFT_PX: 64,       // Left border width in pixels
  BORDER_TOP_PX: 64,        // Top border height in pixels (64 data lines, 1:1)
  BORDER_SIDE_PX: 192,      // Side border height in pixels (192 data lines, 1:1)
  BORDER_BOTTOM_PX: 48      // Bottom border height in pixels (48 data lines, 1:1)
};

// ULA+ format constants (64-color palette extension)
// Standard SCR (6912 bytes) + 64-byte palette
// Palette format: GRB332 (3 bits green, 3 bits red, 2 bits blue per entry)
// Palette organization: 4 CLUTs × 16 colors each
// - CLUT 0: FLASH=0, BRIGHT=0 (entries 0-15: 8 INK + 8 PAPER)
// - CLUT 1: FLASH=0, BRIGHT=1 (entries 16-31)
// - CLUT 2: FLASH=1, BRIGHT=0 (entries 32-47)
// - CLUT 3: FLASH=1, BRIGHT=1 (entries 48-63)
const ULAPLUS = {
  TOTAL_SIZE: 6976,         // 6912 + 64
  PALETTE_OFFSET: 6912,     // Palette starts after standard SCR
  PALETTE_SIZE: 64,         // 64 colors in GRB332 format
  CLUT_SIZE: 16,            // Colors per CLUT (8 INK + 8 PAPER)
  CLUT_COUNT: 4             // Number of CLUTs
};

/** @type {Uint8Array|null} - ULA+ 64-color palette (GRB332 format), null if not in ULA+ mode */
let ulaPlusPalette = null;

/** @type {boolean} - Whether current screen uses ULA+ mode */
let isUlaPlusMode = false;

// ULANext format constants (ZX Spectrum Next extended palette mode)
// File layout: 6912 (SCR) + 1 (ink mask byte) + palette entries (2 bytes each, RGB333)
// The ink mask determines how the attribute byte is split between ink and paper indices.
const ULANEXT = {
  MASK_OFFSET: 6912,      // Ink mask byte immediately after SCR data
  PALETTE_OFFSET: 6913,   // Palette starts after mask byte
  VALID_MASKS: [0x01, 0x03, 0x07, 0x0F, 0x1F, 0x3F, 0x7F, 0xFF],
  MIN_FILE_SIZE: 6945,    // Smallest valid: mask $0F → 32 entries × 1 byte + 6913
  MAX_FILE_SIZE: 7426     // Largest valid: mask $FF → 256×2 + 1×1 = 513 bytes + 6913
};

/** @type {boolean} - Whether current screen uses ULANext mode */
let isUlaNextMode = false;
/** @type {number} - ULANext ink mask byte (determines ink/paper bit split) */
let ulaNextInkMask = 0;
/** @type {number} - Number of ink bits (popcount of mask) */
let ulaNextInkBits = 0;
/** @type {number[][]} - ULANext palette as array of [r,g,b] entries (inkCount + paperCount) */
let ulaNextPalette = null;
/** @type {number} - Number of ink colors (2^inkBits) */
let ulaNextInkCount = 0;
/** @type {number} - Number of paper colors (2^paperBits) */
let ulaNextPaperCount = 0;
/** @type {boolean} - Whether ULANext palette uses 9-bit (2-byte) entries (false = 8-bit/1-byte) */
let ulaNextIs9bit = false;

/**
 * Converts GRB332 byte to RGB array
 * @param {number} grb332 - GRB332 byte (bits 7-5: G, bits 4-2: R, bits 1-0: B)
 * @returns {number[]} RGB array [r, g, b]
 */
function grb332ToRgb(grb332) {
  // Extract components
  const g3 = (grb332 >> 5) & 0x07;  // 3 bits green
  const r3 = (grb332 >> 2) & 0x07;  // 3 bits red
  const b2 = grb332 & 0x03;         // 2 bits blue

  // Scale to 8-bit: replicate bits to fill byte
  // 3-bit: ABC -> ABCABCAB (multiply by 36.43 ≈ 255/7)
  // 2-bit: AB -> ABABABAB (multiply by 85 = 255/3)
  const r = Math.round(r3 * 255 / 7);
  const g = Math.round(g3 * 255 / 7);
  const b = Math.round(b2 * 255 / 3);

  return [r, g, b];
}

/**
 * Converts RGB to GRB332 byte
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} GRB332 byte
 */
function rgbToGrb332(r, g, b) {
  const g3 = Math.round(g * 7 / 255) & 0x07;
  const r3 = Math.round(r * 7 / 255) & 0x07;
  const b2 = Math.round(b * 3 / 255) & 0x03;
  return (g3 << 5) | (r3 << 2) | b2;
}

/**
 * Generates default ULA+ palette matching standard ZX Spectrum colors
 * @returns {Uint8Array} 64-byte palette in GRB332 format
 */
function generateDefaultUlaPlusPalette() {
  const palette = new Uint8Array(64);

  // Standard ZX Spectrum colors in RGB
  const normalColors = [
    [0, 0, 0],       // 0 Black
    [0, 0, 215],     // 1 Blue
    [215, 0, 0],     // 2 Red
    [215, 0, 215],   // 3 Magenta
    [0, 215, 0],     // 4 Green
    [0, 215, 215],   // 5 Cyan
    [215, 215, 0],   // 6 Yellow
    [215, 215, 215]  // 7 White
  ];

  const brightColors = [
    [0, 0, 0],       // 0 Black (same)
    [0, 0, 255],     // 1 Blue
    [255, 0, 0],     // 2 Red
    [255, 0, 255],   // 3 Magenta
    [0, 255, 0],     // 4 Green
    [0, 255, 255],   // 5 Cyan
    [255, 255, 0],   // 6 Yellow
    [255, 255, 255]  // 7 White
  ];

  // Fill all 4 CLUTs
  for (let clut = 0; clut < 4; clut++) {
    const colors = (clut & 1) ? brightColors : normalColors;  // Odd CLUTs = bright
    const baseIdx = clut * 16;

    // 8 INK colors (0-7) + 8 PAPER colors (8-15) - same colors for both
    for (let i = 0; i < 8; i++) {
      const grb = rgbToGrb332(colors[i][0], colors[i][1], colors[i][2]);
      palette[baseIdx + i] = grb;       // INK
      palette[baseIdx + 8 + i] = grb;   // PAPER (same as INK for standard compatibility)
    }
  }

  return palette;
}

// RGB values for ZX Spectrum colors — single source of truth
// Format: [R, G, B] for each color index 0-7
const ZX_PALETTE_RGB = {
  BRIGHT: [
    [0, 0, 0],       // 0 Black
    [0, 0, 255],     // 1 Blue
    [255, 0, 0],     // 2 Red
    [255, 0, 255],   // 3 Magenta
    [0, 255, 0],     // 4 Green
    [0, 255, 255],   // 5 Cyan
    [255, 255, 0],   // 6 Yellow
    [255, 255, 255]  // 7 White
  ],
  REGULAR: [
    [0, 0, 0],       // 0 Black
    [0, 0, 215],     // 1 Blue
    [215, 0, 0],     // 2 Red
    [215, 0, 215],   // 3 Magenta
    [0, 215, 0],     // 4 Green
    [0, 215, 215],   // 5 Cyan
    [215, 215, 0],   // 6 Yellow
    [215, 215, 215]  // 7 White
  ]
};

// CSS rgb() strings derived from ZX_PALETTE_RGB (for canvas fillStyle usage)
const ZX_PALETTE = {
  BRIGHT: ZX_PALETTE_RGB.BRIGHT.map(c => `rgb(${c[0]},${c[1]},${c[2]})`),
  REGULAR: ZX_PALETTE_RGB.REGULAR.map(c => `rgb(${c[0]},${c[1]},${c[2]})`)
};

// Flash timing (ZX Spectrum flashes at ~1.56 Hz, roughly 320ms per phase)
const FLASH_INTERVAL = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.FLASH_INTERVAL) || 320;

// ============================================================================
// Palette Management
// ============================================================================

/** @type {{id: string, name: string, colors: string[]}[]} - Available palettes */
const PALETTES = [
  { id: "alone", name: "Alone", colors: ["#000000", "#0000A0", "#A00000", "#A000A0", "#00A000", "#00A0A0", "#A0A000", "#A0A0A0", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FF00", "#00FFFF", "#FFFF00", "#FFFFFF"] },
  { id: "art-schafft", name: "Art by Schafft", colors: ["#000000", "#1C0077", "#A2232A", "#8417A8", "#7B8707", "#2D91C3", "#DAA73E", "#BABABA", "#000000", "#2100A5", "#E02C35", "#B71BE8", "#A7BA08", "#42C2FF", "#FFD66D", "#FCFCFC"] },
  { id: "atm-turbo", name: "ATM-Turbo", colors: ["#000000", "#0000AA", "#AA0000", "#AA00AA", "#00AA00", "#00AAAA", "#AAAA00", "#AAAAAA", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FF00", "#00FFFF", "#FFFF00", "#FFFFFF"] },
  { id: "default", name: "Default", colors: ["#000000", "#0000D7", "#D70000", "#D700D7", "#00D700", "#00D7D7", "#D7D700", "#D7D7D7", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FF00", "#00FFFF", "#FFFF00", "#FFFFFF"] },
  { id: "emuzwin", name: "EmuzWin", colors: ["#000000", "#0000C4", "#C40000", "#C400C4", "#00B900", "#00C4C4", "#C4C400", "#C4C4C4", "#000000", "#0000ED", "#ED0000", "#ED00ED", "#00D900", "#00DFDB", "#EDEB00", "#EDEBEB"] },
  { id: "escale", name: "Escale (Grayscale)", colors: ["#3E414C", "#4E515F", "#5E6273", "#6E7386", "#7E839A", "#8E94AD", "#9EA4C1", "#AEB5D4", "#3E414C", "#525564", "#666A7C", "#7A7F94", "#8E93AD", "#A2A8C5", "#B5BCDD", "#C9D1F5"] },
  { id: "grey", name: "Grey", colors: ["#000000", "#1B1B1B", "#373636", "#525252", "#6E6D6D", "#898989", "#A5A4A4", "#C0C0C0", "#000000", "#242424", "#494949", "#6D6D6D", "#929292", "#B6B6B6", "#DBDBDB", "#FFFFFF"] },
  { id: "linear", name: "Linear", colors: ["#000000", "#0000BC", "#BC0000", "#BC00BC", "#00BC00", "#00BCBC", "#BCBC00", "#BCBCBC", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FF00", "#00FFFF", "#FFFF00", "#FFFFFF"] },
  { id: "mars", name: "Mars", colors: ["#000000", "#000090", "#BF3000", "#BF3090", "#009030", "#0090C0", "#BFC030", "#BFC0C0", "#000000", "#0000BF", "#FE3F00", "#FE3FBF", "#00BF3F", "#00BFFF", "#FEFF3F", "#FEFFFF"] },
  { id: "ocean", name: "Ocean", colors: ["#20201F", "#38389F", "#88201F", "#A0389F", "#20881F", "#38A09F", "#88881F", "#A0A09F", "#20201F", "#4444DF", "#BC201F", "#E044DF", "#20BC1F", "#44E0DF", "#BCBC1F", "#E0E0DF"] },
  { id: "orthodox", name: "Orthodox", colors: ["#000000", "#0000CD", "#A70000", "#A700CD", "#00B700", "#00B7CD", "#A7B700", "#A7B7CD", "#000000", "#0000FF", "#D00000", "#D000FF", "#00E400", "#00E4FF", "#D0E400", "#D0E4FF"] },
  { id: "pulsar", name: "Pulsar", colors: ["#000000", "#0000CD", "#CD0000", "#CD00CD", "#00CD00", "#00CDCD", "#CDCD00", "#CDCDCD", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FF00", "#00FFFF", "#FFFF00", "#FFFFFF"] },
  { id: "spectaculator", name: "Spectaculator", colors: ["#000000", "#0000CE", "#CE0000", "#CE00CE", "#00CB00", "#00CBCE", "#CECB00", "#CECBCE", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FB00", "#00FBFF", "#FFFB00", "#FFFBFF"] },
  { id: "spectaculator-bw", name: "Spectaculator b/w", colors: ["#101010", "#292C29", "#4A4D4A", "#6B6D6B", "#7B7D7B", "#9C9E9C", "#BDBEBD", "#DEDFDE", "#101010", "#313031", "#5A5D5A", "#7B7D7B", "#9C9E9C", "#BDBEBD", "#E7E3E7", "#FFFFFF"] },
  { id: "specemu", name: "SpecEmu", colors: ["#000000", "#0000B2", "#B20000", "#B200B2", "#00B200", "#00B2B2", "#B2B200", "#B2B2B2", "#050505", "#0505E6", "#E60505", "#E605E6", "#05E605", "#05E6E6", "#E6E605", "#E6E6E6"] },
  { id: "specemu-green", name: "SpecEmu (green)", colors: ["#000000", "#001400", "#002900", "#003D00", "#005200", "#006600", "#007A00", "#008F00", "#000000", "#001C00", "#003800", "#005400", "#007000", "#008C00", "#00A800", "#00C400"] },
  { id: "specemu-grey", name: "SpecEmu (grey)", colors: ["#000000", "#141414", "#292929", "#3D3D3D", "#525252", "#666666", "#7A7A7A", "#8F8F8F", "#000000", "#1C1C1C", "#383838", "#545454", "#707070", "#8C8C8C", "#A8A8A8", "#C4C4C4"] },
  { id: "wiki-1", name: "Wikipedia #1", colors: ["#000000", "#0100CE", "#CF0100", "#CF01CE", "#00CF15", "#01CFCF", "#CFCF15", "#CFCFCF", "#000000", "#0200FD", "#FF0201", "#FF02FD", "#00FF1C", "#02FFFF", "#FFFF1D", "#FFFFFF"] },
  { id: "wiki-2", name: "Wikipedia #2", colors: ["#000000", "#001DC8", "#D8240F", "#D530C9", "#00C721", "#00C9CB", "#CECA27", "#CBCBCB", "#000000", "#0027FB", "#FF3016", "#FF3FFC", "#00F92C", "#00FCFE", "#FFFD33", "#FFFFFF"] },
  { id: "zx-next-hdmi", name: "ZX Spectrum Next HDMI", colors: ["#000000", "#0000B0", "#B00000", "#B000B0", "#00B000", "#00B0B0", "#B0B000", "#B0B0B0", "#000000", "#0000FF", "#FF0000", "#FF00FF", "#00FF00", "#00FFFF", "#FFFF00", "#FFFFFF"] }
];

/** @type {string} - Current palette ID */
let currentPaletteId = 'default';

/**
 * Converts hex color string to RGB array
 * @param {string} hex - Hex color string (e.g., "#FF00FF")
 * @returns {number[]} RGB array [r, g, b]
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ];
  }
  return [0, 0, 0];
}

/**
 * Converts hex color string to CSS rgb() format
 * @param {string} hex - Hex color string (e.g., "#FF00FF")
 * @returns {string} CSS rgb string (e.g., "rgb(255,0,255)")
 */
function hexToRgbString(hex) {
  const rgb = hexToRgb(hex);
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/**
 * Applies a palette to the ZX_PALETTE and ZX_PALETTE_RGB constants
 * @param {{id: string, name: string, colors: string[]}} palette - Palette object
 */
function applyPalette(palette) {
  // Colors array: indices 0-7 are regular, 8-15 are bright
  for (let i = 0; i < 8; i++) {
    // Regular colors (indices 0-7)
    ZX_PALETTE.REGULAR[i] = hexToRgbString(palette.colors[i]);
    ZX_PALETTE_RGB.REGULAR[i] = hexToRgb(palette.colors[i]);

    // Bright colors (indices 8-15)
    ZX_PALETTE.BRIGHT[i] = hexToRgbString(palette.colors[i + 8]);
    ZX_PALETTE_RGB.BRIGHT[i] = hexToRgb(palette.colors[i + 8]);
  }
}

/**
 * Sets the current palette by ID and re-renders
 * @param {string} paletteId - Palette ID to set
 */
function setPalette(paletteId) {
  const palette = PALETTES.find(p => p.id === paletteId);
  if (palette) {
    currentPaletteId = paletteId;
    applyPalette(palette);
    renderScreen();
    // Update editor palette if editor is active
    if (typeof editorActive !== 'undefined' && editorActive && typeof updateColorPreview === 'function') {
      updateColorPreview();
    }
    // Rebuild 53c pattern palette with new palette colors
    if (typeof editorActive !== 'undefined' && editorActive && currentFormat === FORMAT.ATTR_53C && typeof build53cPalette === 'function') {
      build53cPalette();
    }
    // Rebuild RGB3 palette with new palette colors
    if (typeof editorActive !== 'undefined' && editorActive && currentFormat === FORMAT.RGB3 && typeof buildRgb3Palette === 'function') {
      buildRgb3Palette();
    }
  }
}

/**
 * Initializes palette selector with embedded palettes
 */
function loadPalettes() {
  const paletteSelect = /** @type {HTMLSelectElement} */ (document.getElementById('paletteSelect'));
  if (!paletteSelect) return;

  // Populate the select element from embedded PALETTES
  paletteSelect.innerHTML = '';
  PALETTES.forEach(palette => {
    const option = document.createElement('option');
    option.value = palette.id;
    option.textContent = palette.name;
    if (palette.id === 'default') {
      option.selected = true;
    }
    paletteSelect.appendChild(option);
  });

  // Apply default palette
  const defaultPalette = PALETTES.find(p => p.id === 'default');
  if (defaultPalette) {
    applyPalette(defaultPalette);
  }
}

/**
 * Parses a text file with 16 color definitions and applies as a custom palette.
 * Each line: #RRGGBB or R G B (0-255, space/comma separated).
 * Lines starting with ; or // and blank lines are skipped.
 * @param {string} text - Contents of the palette text file
 */
function loadPaletteFromText(text) {
  const lines = text.split(/\r?\n/);
  const colors = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('//')) continue;
    const hexMatch = /^#?(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})$/.exec(line);
    if (hexMatch) {
      // Hex format: #RRGGBB, RRGGBB, #AARRGGBB, AARRGGBB (alpha ignored)
      colors.push('#' + hexMatch[1].toUpperCase());
    } else {
      // Decimal R G B (space or comma separated)
      const parts = line.split(/[\s,]+/).map(Number);
      if (parts.length >= 3 && parts.slice(0, 3).every(v => !isNaN(v) && v >= 0 && v <= 255)) {
        const hex = '#' + parts.slice(0, 3).map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');
        colors.push(hex);
      }
    }
    if (colors.length >= 16) break;
  }
  if (colors.length < 15) {
    alert('Palette file must contain 15 or 16 valid color lines. Found: ' + colors.length);
    return;
  }
  // 15-color palette: prepend black (regular and bright black are the same)
  if (colors.length === 15) {
    colors.unshift('#000000');
  }
  const customPalette = { id: 'custom', name: 'Custom (loaded)', colors };
  // Remove previous custom entry if present
  const idx = PALETTES.findIndex(p => p.id === 'custom');
  if (idx !== -1) PALETTES.splice(idx, 1);
  PALETTES.push(customPalette);
  // Add/select option in dropdown
  const paletteSelect = /** @type {HTMLSelectElement} */ (document.getElementById('paletteSelect'));
  if (paletteSelect) {
    let opt = paletteSelect.querySelector('option[value="custom"]');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = 'custom';
      opt.textContent = 'Custom (loaded)';
      paletteSelect.appendChild(opt);
    }
    paletteSelect.value = 'custom';
  }
  currentPaletteId = 'custom';
  applyPalette(customPalette);
  renderScreen();
  // Update editor palettes if active
  if (typeof editorActive !== 'undefined' && editorActive && typeof updateColorPreview === 'function') {
    updateColorPreview();
  }
  if (typeof editorActive !== 'undefined' && editorActive && currentFormat === FORMAT.ATTR_53C && typeof build53cPalette === 'function') {
    build53cPalette();
  }
  if (typeof editorActive !== 'undefined' && editorActive && currentFormat === FORMAT.RGB3 && typeof buildRgb3Palette === 'function') {
    buildRgb3Palette();
  }
}

// ============================================================================
// State
// ============================================================================

/** @type {Uint8Array} */
let screenData = new Uint8Array(0);

/** @type {Picture|null} - Internal picture format (linear layout), null for non-SCR formats */
let currentPicture = null;

/** @type {number} */
let zoom = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_ZOOM) || 2;

/** @type {number} */
let borderColor = 7;

/** @type {number} */
let borderSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_BORDER_SIZE) || 24;

/** @type {number} - Last canvas width (for resize optimization) */
let lastCanvasWidth = 0;

/** @type {number} - Last canvas height (for resize optimization) */
let lastCanvasHeight = 0;

/** @type {string} */
let currentFileName = '';

/** @type {string} */
let currentFormat = FORMAT.UNKNOWN;

/** @type {number[][]|null} - Resolved NXI/SL2 palette (256 entries of [r,g,b], or 16 for 4bpp) */
let nxiResolvedPalette = null;

/** @type {'256x192'|'320x256'|'640x256'} - Current NXI/SL2 Layer 2 mode */
let nxiLayer2Mode = '256x192';

/** @type {0|16|32} - Original RAD palette size in bytes (0=none, 16=GRB332, 32=RGB333) */
let radPaletteSize = 0;

/** @type {boolean} - Current flash phase (false = normal, true = swapped) */
let flashPhase = false;

/** @type {number|null} - Flash timer ID */
let flashTimerId = null;

/** @type {boolean} - Whether flash animation is enabled */
let flashEnabled = true;

/** @type {boolean} - Whether to show attributes (false = monochrome white on black) */
let showAttributes = true;

/** @type {boolean} - When true, 53c/atr cells render as solid blended colors instead of patterns */
let attr53cBlend = false;


/** @type {Uint8Array} - Current font data (768 bytes = 96 chars × 8 bytes) */
// Embedded ZX Spectrum ROM font (0x20-0x7F, 96 chars × 8 bytes = 768 bytes)
// prettier-ignore
let fontData = new Uint8Array([
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x10,0x10,0x10,0x10,0x00,0x10,0x00,
0x00,0x24,0x24,0x00,0x00,0x00,0x00,0x00,0x00,0x24,0x7E,0x24,0x24,0x7E,0x24,0x00,
0x00,0x08,0x3E,0x28,0x3E,0x0A,0x3E,0x08,0x00,0x62,0x64,0x08,0x10,0x26,0x46,0x00,
0x00,0x10,0x28,0x10,0x2A,0x44,0x3A,0x00,0x00,0x08,0x10,0x00,0x00,0x00,0x00,0x00,
0x00,0x04,0x08,0x08,0x08,0x08,0x04,0x00,0x00,0x20,0x10,0x10,0x10,0x10,0x20,0x00,
0x00,0x00,0x14,0x08,0x3E,0x08,0x14,0x00,0x00,0x00,0x08,0x08,0x3E,0x08,0x08,0x00,
0x00,0x00,0x00,0x00,0x00,0x08,0x08,0x10,0x00,0x00,0x00,0x00,0x3E,0x00,0x00,0x00,
0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x02,0x04,0x08,0x10,0x20,0x00,
0x00,0x3C,0x46,0x4A,0x52,0x62,0x3C,0x00,0x00,0x18,0x28,0x08,0x08,0x08,0x3E,0x00,
0x00,0x3C,0x42,0x02,0x3C,0x40,0x7E,0x00,0x00,0x3C,0x42,0x0C,0x02,0x42,0x3C,0x00,
0x00,0x08,0x18,0x28,0x48,0x7E,0x08,0x00,0x00,0x7E,0x40,0x7C,0x02,0x42,0x3C,0x00,
0x00,0x3C,0x40,0x7C,0x42,0x42,0x3C,0x00,0x00,0x7E,0x02,0x04,0x08,0x10,0x10,0x00,
0x00,0x3C,0x42,0x3C,0x42,0x42,0x3C,0x00,0x00,0x3C,0x42,0x42,0x3E,0x02,0x3C,0x00,
0x00,0x00,0x00,0x10,0x00,0x00,0x10,0x00,0x00,0x00,0x10,0x00,0x00,0x10,0x10,0x20,
0x00,0x00,0x04,0x08,0x10,0x08,0x04,0x00,0x00,0x00,0x00,0x3E,0x00,0x3E,0x00,0x00,
0x00,0x00,0x10,0x08,0x04,0x08,0x10,0x00,0x00,0x3C,0x42,0x04,0x08,0x00,0x08,0x00,
0x00,0x3C,0x4A,0x56,0x5E,0x40,0x3C,0x00,0x00,0x3C,0x42,0x42,0x7E,0x42,0x42,0x00,
0x00,0x7C,0x42,0x7C,0x42,0x42,0x7C,0x00,0x00,0x3C,0x42,0x40,0x40,0x42,0x3C,0x00,
0x00,0x78,0x44,0x42,0x42,0x44,0x78,0x00,0x00,0x7E,0x40,0x7C,0x40,0x40,0x7E,0x00,
0x00,0x7E,0x40,0x7C,0x40,0x40,0x40,0x00,0x00,0x3C,0x42,0x40,0x4E,0x42,0x3C,0x00,
0x00,0x42,0x42,0x7E,0x42,0x42,0x42,0x00,0x00,0x3E,0x08,0x08,0x08,0x08,0x3E,0x00,
0x00,0x02,0x02,0x02,0x42,0x42,0x3C,0x00,0x00,0x44,0x48,0x70,0x48,0x44,0x42,0x00,
0x00,0x40,0x40,0x40,0x40,0x40,0x7E,0x00,0x00,0x42,0x66,0x5A,0x42,0x42,0x42,0x00,
0x00,0x42,0x62,0x52,0x4A,0x46,0x42,0x00,0x00,0x3C,0x42,0x42,0x42,0x42,0x3C,0x00,
0x00,0x7C,0x42,0x42,0x7C,0x40,0x40,0x00,0x00,0x3C,0x42,0x42,0x52,0x4A,0x3C,0x00,
0x00,0x7C,0x42,0x42,0x7C,0x44,0x42,0x00,0x00,0x3C,0x40,0x3C,0x02,0x42,0x3C,0x00,
0x00,0xFE,0x10,0x10,0x10,0x10,0x10,0x00,0x00,0x42,0x42,0x42,0x42,0x42,0x3C,0x00,
0x00,0x42,0x42,0x42,0x42,0x24,0x18,0x00,0x00,0x42,0x42,0x42,0x42,0x5A,0x24,0x00,
0x00,0x42,0x24,0x18,0x18,0x24,0x42,0x00,0x00,0x82,0x44,0x28,0x10,0x10,0x10,0x00,
0x00,0x7E,0x04,0x08,0x10,0x20,0x7E,0x00,0x00,0x0E,0x08,0x08,0x08,0x08,0x0E,0x00,
0x00,0x00,0x40,0x20,0x10,0x08,0x04,0x00,0x00,0x70,0x10,0x10,0x10,0x10,0x70,0x00,
0x00,0x10,0x38,0x54,0x10,0x10,0x10,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF,
0x00,0x1C,0x22,0x78,0x20,0x20,0x7E,0x00,0x00,0x00,0x38,0x04,0x3C,0x44,0x3C,0x00,
0x00,0x20,0x20,0x3C,0x22,0x22,0x3C,0x00,0x00,0x00,0x1C,0x20,0x20,0x20,0x1C,0x00,
0x00,0x04,0x04,0x3C,0x44,0x44,0x3C,0x00,0x00,0x00,0x38,0x44,0x78,0x40,0x3C,0x00,
0x00,0x0C,0x10,0x18,0x10,0x10,0x10,0x00,0x00,0x00,0x3C,0x44,0x44,0x3C,0x04,0x38,
0x00,0x40,0x40,0x78,0x44,0x44,0x44,0x00,0x00,0x10,0x00,0x30,0x10,0x10,0x38,0x00,
0x00,0x04,0x00,0x04,0x04,0x04,0x24,0x18,0x00,0x20,0x28,0x30,0x30,0x28,0x24,0x00,
0x00,0x10,0x10,0x10,0x10,0x10,0x0C,0x00,0x00,0x00,0x68,0x54,0x54,0x54,0x54,0x00,
0x00,0x00,0x78,0x44,0x44,0x44,0x44,0x00,0x00,0x00,0x38,0x44,0x44,0x44,0x38,0x00,
0x00,0x00,0x78,0x44,0x44,0x78,0x40,0x40,0x00,0x00,0x3C,0x44,0x44,0x3C,0x04,0x06,
0x00,0x00,0x1C,0x20,0x20,0x20,0x20,0x00,0x00,0x00,0x38,0x40,0x38,0x04,0x78,0x00,
0x00,0x10,0x38,0x10,0x10,0x10,0x0C,0x00,0x00,0x00,0x44,0x44,0x44,0x44,0x38,0x00,
0x00,0x00,0x44,0x44,0x28,0x28,0x10,0x00,0x00,0x00,0x44,0x54,0x54,0x54,0x28,0x00,
0x00,0x00,0x44,0x28,0x10,0x28,0x44,0x00,0x00,0x00,0x44,0x44,0x44,0x3C,0x04,0x38,
0x00,0x00,0x7C,0x08,0x10,0x20,0x7C,0x00,0x00,0x0E,0x08,0x30,0x08,0x08,0x0E,0x00,
0x00,0x08,0x08,0x08,0x08,0x08,0x08,0x00,0x00,0x70,0x10,0x0C,0x10,0x10,0x70,0x00,
0x00,0x14,0x28,0x00,0x00,0x00,0x00,0x00,0x3C,0x42,0x99,0xA1,0xA1,0x99,0x42,0x3C
]);

/** @type {boolean} - Whether font has been loaded */
let fontLoaded = true;

/** @type {string} - Current font file name */
let currentFontName = 'ROM';

// SCA animation state
/** @type {{version: number, width: number, height: number, borderColor: number, frameCount: number, payloadType: number, payloadOffset: number, frameDataStart: number, frameSize: number, delays: Uint8Array, fillPattern: Uint8Array|null}|null} */
let scaHeader = null;

/** @type {number} - Current frame index (0-based) */
let scaCurrentFrame = 0;

/** @type {boolean} - Whether animation is playing */
let scaPlaying = false;

/** @type {number|null} - Animation timer ID */
let scaTimerId = null;

// ============================================================================
// Reusable Temporary Canvas (for render operations)
// ============================================================================

/** @type {HTMLCanvasElement|null} - Reusable temp canvas for rendering */
let tempRenderCanvas = null;

/** @type {CanvasRenderingContext2D|null} - Reusable temp canvas context */
let tempRenderCtx = null;

/**
 * Get or create the reusable temp canvas for rendering
 * @param {number} width - Required width
 * @param {number} height - Required height
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}|null}
 */
function getTempRenderCanvas(width, height) {
  if (!tempRenderCanvas) {
    tempRenderCanvas = document.createElement('canvas');
    tempRenderCtx = tempRenderCanvas.getContext('2d');
  }
  // Resize only if needed
  if (tempRenderCanvas.width !== width || tempRenderCanvas.height !== height) {
    tempRenderCanvas.width = width;
    tempRenderCanvas.height = height;
  }
  if (!tempRenderCtx) return null;
  return { canvas: tempRenderCanvas, ctx: tempRenderCtx };
}

// ============================================================================
// Cached DOM Elements
// ============================================================================

/** @type {HTMLCanvasElement} */
let screenCanvas;

/** @type {CanvasRenderingContext2D|null} - Cached screen canvas 2D context */
let screenCanvasCtx = null;

/** @type {HTMLSelectElement} */
let zoomSelect;

/** @type {HTMLSelectElement} */
let gridSizeSelect;

/** @type {HTMLSelectElement} */
let subgridSizeSelect;

/** @type {number} - Grid cell size in pixels (0=none, 8, 16, 24) */
let gridSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_GRID_SIZE) || 8;

/** @type {number} - Subgrid cell size in pixels (0=none, 1, 2, 4) */
let subgridSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DEFAULT_SUBGRID_SIZE) || 0;

/** @type {HTMLSelectElement} */
let borderGridSizeSelect;

/** @type {HTMLSelectElement} */
let borderSubgridSizeSelect;

/** @type {number} - Border grid cell size in pixels (0=none, 8, 16, 24) */
let borderGridSize = 0;

/** @type {number} - Border subgrid cell size in pixels (0=none, 1, 2, 4) */
let borderSubgridSize = 0;

/** @type {string} - Grid color preset name ('default', 'white', 'gray', etc.) */
let gridColorPreset = 'default';

/** @type {Object<string, {grid: string, subgrid: string, border: string}>} */
const GRID_COLOR_PRESETS = {
  default: { grid: '', subgrid: '', border: '' },
  white:   { grid: 'rgba(255,255,255,0.8)', subgrid: 'rgba(255,255,255,0.35)', border: 'rgba(255,255,255,0.7)' },
  gray:    { grid: 'rgba(160,160,160,0.8)', subgrid: 'rgba(160,160,160,0.35)', border: 'rgba(160,160,160,0.7)' },
  black:   { grid: 'rgba(0,0,0,0.8)',       subgrid: 'rgba(0,0,0,0.35)',       border: 'rgba(0,0,0,0.7)' },
  orange:  { grid: 'rgba(255,165,0,0.8)',   subgrid: 'rgba(255,165,0,0.35)',   border: 'rgba(255,165,0,0.7)' },
  red:     { grid: 'rgba(255,0,0,0.8)',     subgrid: 'rgba(255,0,0,0.35)',     border: 'rgba(255,0,0,0.7)' },
  green:   { grid: 'rgba(0,200,0,0.8)',     subgrid: 'rgba(0,200,0,0.35)',     border: 'rgba(0,200,0,0.7)' }
};

/**
 * Returns the current grid color for the given role.
 * @param {'grid'|'subgrid'|'border'} role
 * @returns {string}
 */
function getGridColor(role) {
  const preset = GRID_COLOR_PRESETS[gridColorPreset];
  if (preset && preset[role]) return preset[role];
  // Fall back to APP_CONFIG defaults
  if (role === 'grid') return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.GRID_COLOR) || 'rgba(0, 160, 255, 0.4)';
  if (role === 'subgrid') return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUBGRID_COLOR) || 'rgba(128, 128, 128, 0.25)';
  return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BORDER_GRID_COLOR) || 'rgba(255, 160, 0, 0.35)';
}

/** @type {HTMLSelectElement} */
let borderColorSelect;

/** @type {HTMLSelectElement} */
let borderSizeSelect;

/** @type {HTMLElement} */
let fileInfo;

// Info panel elements
/** @type {HTMLElement} */
let infoFileName;
/** @type {HTMLElement} */
let infoFileSize;
/** @type {HTMLElement} */
let infoFormat;
/** @type {HTMLElement} */
let infoDimensions;
/** @type {HTMLElement} */
let infoAnimSection;
/** @type {HTMLElement} */
let infoFrameCount;
/** @type {HTMLElement} */
let infoPayloadType;
/** @type {HTMLElement} */
let infoFrameDelay;
/** @type {HTMLElement} */
let infoColorsRow;
/** @type {HTMLElement} */
let infoColorsUsed;
/** @type {HTMLElement} */
let infoHiddenRow;
/** @type {HTMLElement} */
let infoHiddenCells;

/** @type {HTMLInputElement} */
let flashCheckbox;

/** @type {HTMLInputElement} */
let fontFileInput;

/** @type {HTMLElement} */
let fontInfo;

/** @type {HTMLSelectElement} */
let pattern53cSelect;

/** @type {string} - RGB3 display mode: 'blend', 'flicker', or 'blend_dark' */
let rgb3Mode = 'blend_dark';

/** @type {number} - Current RGB3 flicker phase (0=R, 1=G, 2=B) */
let rgb3FlickerPhase = 0;

/** @type {number|null} - RGB3 flicker animation frame ID */
let rgb3FlickerFrameId = null;

/** @type {number} - Last RGB3 flicker frame timestamp */
let rgb3FlickerLastTime = 0;

/** @type {string} - Gigascreen display mode: 'average', 'flicker', or 'blend_dark' */
let gigascreenMode = GIGASCREEN_MODE.BLEND_DARK;

/** @type {number} - Current Gigascreen flicker phase (0 or 1) */
let gigascreenFlickerPhase = 0;

/** @type {number|null} - Gigascreen flicker animation frame ID */
let gigascreenFlickerFrameId = null;

/** @type {number} - Last Gigascreen flicker frame timestamp */
let gigascreenFlickerLastTime = 0;

/** @type {number} - Flicker frame interval in ms (20ms = 50Hz) */
const FLICKER_INTERVAL_MS = 20;

/**
 * CRT darkening factor for "blend dark" mode.
 * On real hardware each frame includes a vertical retrace period (~32 of 320
 * lines on Pentagon 128K) during which the beam is blanked. Over a multi-frame
 * cycle this reduces perceived brightness compared to an ideal static LCD.
 */
const CRT_DARK_FACTOR = 0.8;

/**
 * Caches DOM element references for performance
 */
function cacheElements() {
  screenCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('screenCanvas'));
  screenCanvasCtx = screenCanvas ? screenCanvas.getContext('2d') : null;
  zoomSelect = /** @type {HTMLSelectElement} */ (document.getElementById('zoomSelect'));
  gridSizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('gridSizeSelect'));
  subgridSizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('subgridSizeSelect'));
  borderGridSizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('borderGridSizeSelect'));
  borderSubgridSizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('borderSubgridSizeSelect'));
  borderColorSelect = /** @type {HTMLSelectElement} */ (document.getElementById('borderColorSelect'));
  borderSizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('borderSizeSelect'));
  fileInfo = /** @type {HTMLElement} */ (document.getElementById('fileInfo'));
  flashCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('flashCheckbox'));
  fontFileInput = /** @type {HTMLInputElement} */ (document.getElementById('fontFile'));
  fontInfo = /** @type {HTMLElement} */ (document.getElementById('fontInfo'));
  pattern53cSelect = /** @type {HTMLSelectElement} */ (document.getElementById('pattern53cSelect'));

  // Info panel elements
  infoFileName = /** @type {HTMLElement} */ (document.getElementById('infoFileName'));
  infoFileSize = /** @type {HTMLElement} */ (document.getElementById('infoFileSize'));
  infoFormat = /** @type {HTMLElement} */ (document.getElementById('infoFormat'));
  infoDimensions = /** @type {HTMLElement} */ (document.getElementById('infoDimensions'));
  infoAnimSection = /** @type {HTMLElement} */ (document.getElementById('infoAnimSection'));
  infoFrameCount = /** @type {HTMLElement} */ (document.getElementById('infoFrameCount'));
  infoPayloadType = /** @type {HTMLElement} */ (document.getElementById('infoPayloadType'));
  infoFrameDelay = /** @type {HTMLElement} */ (document.getElementById('infoFrameDelay'));
  infoColorsRow = /** @type {HTMLElement} */ (document.getElementById('infoColorsRow'));
  infoColorsUsed = /** @type {HTMLElement} */ (document.getElementById('infoColorsUsed'));
  infoHiddenRow = /** @type {HTMLElement} */ (document.getElementById('infoHiddenRow'));
  infoHiddenCells = /** @type {HTMLElement} */ (document.getElementById('infoHiddenCells'));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts color indices from attribute byte with flash handling
 * @param {number} attr - Attribute byte
 * @returns {{inkIndex: number, paperIndex: number, isBright: boolean}} Color indices and brightness
 */
function getColorIndices(attr) {
  let inkIndex = attr & 0x07;
  let paperIndex = (attr >> 3) & 0x07;
  const isBright = (attr & 0x40) !== 0;
  const isFlash = (attr & 0x80) !== 0;

  // Swap ink and paper if flash bit is set and we're in swapped phase
  if (isFlash && flashPhase && flashEnabled) {
    const temp = inkIndex;
    inkIndex = paperIndex;
    paperIndex = temp;
  }

  return { inkIndex, paperIndex, isBright };
}

// ============================================================================
// Font Loading Functions
// ============================================================================

/**
 * Loads the default ROM font from file
 */
async function loadRomFont() {
  try {
    const response = await fetch('./fonts/rom_font.bin');
    if (!response.ok) {
      throw new Error(`Failed to load ROM font: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    fontData = new Uint8Array(buffer);
    fontLoaded = true;
    currentFontName = 'ROM';
    updateFontInfo();
    renderScreen();
    // Update ROM brush tab if editor is initialized
    if (typeof updateRomBrushTab === 'function') {
      updateRomBrushTab();
    }
  } catch (error) {
    console.error('Error loading ROM font:', error);
    // Keep embedded font data if available, only reset if font is empty
    if (!fontLoaded) {
      fontData = new Uint8Array(SPECSCII.FONT_SIZE);
      currentFontName = 'No font';
      updateFontInfo();
    }
  }
}

/**
 * Loads a custom font from file
 * @param {File} file - The font file to load
 */
function loadFontFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (buffer instanceof ArrayBuffer) {
      const data = new Uint8Array(buffer);
      // Support both 768-byte (96 chars) and 2048-byte (256 chars) fonts
      if (data.length >= SPECSCII.FONT_SIZE) {
        fontData = data.slice(0, SPECSCII.FONT_SIZE);
        fontLoaded = true;
        currentFontName = file.name;
        updateFontInfo();
        renderScreen();
        // Update ROM brush tab if editor is initialized
        if (typeof updateRomBrushTab === 'function') {
          updateRomBrushTab();
        }
      } else {
        alert(`Invalid font file size: ${data.length} bytes. Expected at least 768 bytes.`);
      }
    }
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Updates the font info display
 */
function updateFontInfo() {
  if (fontInfo) {
    fontInfo.textContent = currentFontName;
  }
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Gets RGB color values from attribute byte (optimized for ImageData)
 * @param {number} attr - Attribute byte
 * @returns {{inkRgb: number[], paperRgb: number[]}} RGB color arrays
 */
function getColorsRgb(attr) {
  // ULANext mode: ink mask splits attribute into ink/paper indices
  if (isUlaNextMode && ulaNextPalette) {
    const inkIdx = attr & ulaNextInkMask;
    const paperIdx = (attr >>> ulaNextInkBits) + ulaNextInkCount;
    return {
      inkRgb: ulaNextPalette[inkIdx] || [0, 0, 0],
      paperRgb: ulaNextPalette[paperIdx] || [0, 0, 0]
    };
  }

  // ULA+ mode uses 64-color palette with CLUT selection
  if (isUlaPlusMode && ulaPlusPalette) {
    const inkIdx = getUlaPlusPaletteIndex(attr, true);
    const paperIdx = getUlaPlusPaletteIndex(attr, false);
    return { inkRgb: getUlaPlusColor(inkIdx), paperRgb: getUlaPlusColor(paperIdx) };
  }

  // Standard ZX Spectrum mode
  const { inkIndex, paperIndex, isBright } = getColorIndices(attr);
  const palette = isBright ? ZX_PALETTE_RGB.BRIGHT : ZX_PALETTE_RGB.REGULAR;
  return { inkRgb: palette[inkIndex], paperRgb: palette[paperIndex] };
}

/** @type {ImageData|null} Cached ImageData for renderScrFast (reused to avoid per-frame allocation) */
let scrFastImageData = null;

/**
 * Renders standard SCR format using ImageData for better performance
 * Creates a 256x192 image and scales it using the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderScrFast(ctx, borderOffset) {
  // Reuse cached ImageData (same size every frame)
  if (!scrFastImageData || scrFastImageData.width !== SCREEN.WIDTH || scrFastImageData.height !== SCREEN.HEIGHT) {
    scrFastImageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  }
  const imageData = scrFastImageData;
  const data = imageData.data;

  // Pre-compute transparency state (avoid per-pixel typeof checks)
  const hasMask = typeof layersEnabled !== 'undefined' && layersEnabled &&
                  typeof screenTransparencyMask !== 'undefined' && screenTransparencyMask;
  const mask = hasMask ? screenTransparencyMask : null;

  // Pre-compute checkerboard config (avoid per-pixel APP_CONFIG lookups)
  let checkerSize = 4, checkerLight = 68, checkerDark = 34;
  if (mask) {
    checkerSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_CELL_SIZE) || 4;
    checkerLight = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_LIGHT_COLOR) || 68;
    checkerDark = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TRANSPARENCY_DARK_COLOR) || 34;
  }

  // Process all three screen thirds
  const sections = [
    { bitmapAddr: 0, attrAddr: 6144, yOffset: 0 },       // Top third
    { bitmapAddr: 2048, attrAddr: 6400, yOffset: 64 },   // Middle third
    { bitmapAddr: 4096, attrAddr: 6656, yOffset: 128 }   // Bottom third
  ];

  for (const section of sections) {
    const { bitmapAddr, attrAddr, yOffset } = section;

    // line = pixel line within character cell (0-7)
    for (let line = 0; line < 8; line++) {
      // row = character row within this third (0-7)
      for (let row = 0; row < 8; row++) {
        // col = character column (0-31)
        for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
          // ZX Spectrum interleaved address calculation
          const bitmapOffset = bitmapAddr + col + row * 32 + line * 256;
          const byte = screenData[bitmapOffset];

          // Get attribute for this character cell
          const attrOffset = attrAddr + col + row * 32;
          const attr = screenData[attrOffset];
          let inkRgb, paperRgb;
          if (showAttributes) {
            ({ inkRgb, paperRgb } = getColorsRgb(attr));
          } else {
            inkRgb = [0, 0, 0];
            paperRgb = [255, 255, 255];
          }

          // Calculate Y position
          const x = col * 8;
          const y = yOffset + row * 8 + line;
          const rowBase = y * SCREEN.WIDTH;

          // Draw 8 pixels directly to ImageData
          for (let bit = 0; bit < 8; bit++) {
            const px = x + bit;
            const maskIdx = rowBase + px;
            const pixelIndex = maskIdx * 4;

            let r, g, b;
            if (mask && !mask[maskIdx]) {
              // Transparent pixel — inline checkerboard
              const gray = ((Math.floor(px / checkerSize) + Math.floor(y / checkerSize)) & 1) ? checkerDark : checkerLight;
              r = gray; g = gray; b = gray;
            } else {
              const rgb = (byte & (0x80 >> bit)) ? inkRgb : paperRgb;
              r = rgb[0]; g = rgb[1]; b = rgb[2];
            }
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  }

  // Put the 1:1 image onto a temporary canvas (reused for performance)
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;

  temp.ctx.putImageData(imageData, 0, 0);

  // Scale and draw to main canvas using drawImage (GPU accelerated)
  applyRenderSmoothing(ctx);
  ctx.drawImage(
    temp.canvas,
    0, 0, SCREEN.WIDTH, SCREEN.HEIGHT,
    borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom
  );
}

/**
 * Renders any single-plane Picture from the internal linear layout.
 * Covers SCR, SCR+/ULA+, IFL, MLT, 53c (pattern), and Mono formats.
 * Parametric on attrCellHeight: 8=SCR, 2=IFL, 1=MLT, 0=Mono/no-attrs.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {Picture} pic - The currentPicture to render
 */
function renderPictureStandard(ctx, borderOffset, pic, scrollInfo) {
  const cols = pic.cols;
  const height = pic.height;
  const width = pic.width;

  // ZXP/chr$: render directly from screenData (already linear layout, skip sync+copy)
  const isZxpDirect = (pic.sourceFormat === 'zxp' || pic.sourceFormat === 'ch$') && screenData && screenData.length > 0;
  if (!isZxpDirect) {
    // Sync from screenData so in-progress drawing is visible immediately
    if (typeof syncPictureFromScreenData === 'function') {
      syncPictureFromScreenData(screenData, pic);
    }
  }

  const bitmap = isZxpDirect ? screenData : pic.planes[0].bitmap;
  const bitmapSize = cols * height;
  const attrs = isZxpDirect ? null : pic.planes[0].attrs;
  const attrCellH = pic.attrCellHeight;

  // 53c blend mode: precompute ink ratio from pattern
  const use53cBlend = attr53cBlend && pic.pattern;
  let blendInkRatio = 0;
  if (use53cBlend) {
    let inkBitCount = 0;
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        if (pic.pattern[py] & (1 << (7 - px))) inkBitCount++;
      }
    }
    blendInkRatio = inkBitCount / 64;
  }

  // When canvas is viewport-capped (scrollInfo present), only render the visible region.
  // This avoids drawImage scaling the full source to a destination rect much larger than
  // the canvas, which causes rendering artifacts in some browsers at high zoom levels.
  let clipX0 = 0, clipY0 = 0, clipX1 = width, clipY1 = height;
  let useClipping = false;

  if (scrollInfo) {
    const { scrollX, scrollY, viewW, viewH } = scrollInfo;
    const clipScaleX = getPixelScaleX();
    const clipScaleY = getPixelScaleY();
    // Convert viewport to source pixel coordinates (accounting for border offset and PAR scaling)
    clipX0 = Math.max(0, Math.floor((scrollX - borderOffset) / (zoom * clipScaleX)));
    clipY0 = Math.max(0, Math.floor((scrollY - borderOffset) / (zoom * clipScaleY)));
    clipX1 = Math.min(width, Math.ceil((scrollX + viewW - borderOffset) / (zoom * clipScaleX)));
    clipY1 = Math.min(height, Math.ceil((scrollY + viewH - borderOffset) / (zoom * clipScaleY)));
    // Align to 8-pixel (char cell) boundaries for correct rendering
    clipX0 = Math.max(0, (clipX0 >> 3) << 3);
    clipY0 = Math.max(0, clipY0);
    clipX1 = Math.min(width, ((clipX1 + 7) >> 3) << 3);
    clipY1 = Math.min(height, clipY1);
    useClipping = clipX1 > clipX0 && clipY1 > clipY0;
  }

  const renderX0 = useClipping ? clipX0 : 0;
  const renderY0 = useClipping ? clipY0 : 0;
  const renderX1 = useClipping ? clipX1 : width;
  const renderY1 = useClipping ? clipY1 : height;
  const renderW = renderX1 - renderX0;
  const renderH = renderY1 - renderY0;
  const colStart = renderX0 >> 3;
  const colEnd = renderX1 >> 3;

  const imageData = ctx.createImageData(renderW, renderH);
  const data = imageData.data;

  // Mono mode: determine ink/paper colors
  let monoInk, monoPaper;
  if (attrCellH === 0) {
    if (typeof editorActive !== 'undefined' && editorActive &&
        typeof editorInkColor !== 'undefined' && typeof editorPaperColor !== 'undefined') {
      const editorBrightVal = (typeof editorBright !== 'undefined') ? editorBright : false;
      const palette = editorBrightVal ? ZX_PALETTE.BRIGHT : ZX_PALETTE.REGULAR;
      const ink = palette[editorInkColor];
      const paper = palette[editorPaperColor];
      const inkC = parseColorToRgb(ink);
      const paperC = parseColorToRgb(paper);
      monoInk = [inkC.r, inkC.g, inkC.b];
      monoPaper = [paperC.r, paperC.g, paperC.b];
    } else {
      monoInk = [255, 255, 255];
      monoPaper = [0, 0, 0];
    }
  }

  for (let y = renderY0; y < renderY1; y++) {
    const attrRow = attrCellH > 0 ? Math.floor(y / attrCellH) : -1;
    const localY = y - renderY0;
    for (let col = colStart; col < colEnd; col++) {
      const byte = bitmap[y * cols + col];

      let inkRgb, paperRgb;
      if (attrCellH === 0) {
        inkRgb = monoInk;
        paperRgb = monoPaper;
      } else if (showAttributes) {
        const attr = isZxpDirect ? screenData[bitmapSize + attrRow * cols + col] : attrs[attrRow * cols + col];
        ({ inkRgb, paperRgb } = getColorsRgb(attr));
      } else {
        inkRgb = [0, 0, 0];
        paperRgb = [255, 255, 255];
      }

      const x = (col - colStart) * 8;
      if (use53cBlend) {
        // Blend mode: solid averaged color per cell
        const br = Math.round(inkRgb[0] * blendInkRatio + paperRgb[0] * (1 - blendInkRatio));
        const bg = Math.round(inkRgb[1] * blendInkRatio + paperRgb[1] * (1 - blendInkRatio));
        const bb = Math.round(inkRgb[2] * blendInkRatio + paperRgb[2] * (1 - blendInkRatio));
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const srcPx = col * 8 + bit;
          const maskIdx = y * width + srcPx;
          const pixelIndex = (localY * renderW + px) * 4;
          const rgb = isPixelTransparent(maskIdx) ? getCheckerboardColor(srcPx, y) : null;
          data[pixelIndex] = rgb ? rgb[0] : br;
          data[pixelIndex + 1] = rgb ? rgb[1] : bg;
          data[pixelIndex + 2] = rgb ? rgb[2] : bb;
          data[pixelIndex + 3] = 255;
        }
      } else {
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const srcPx = col * 8 + bit;
          const maskIdx = y * width + srcPx;
          const pixelIndex = (localY * renderW + px) * 4;

          const rgb = isPixelTransparent(maskIdx)
            ? getCheckerboardColor(srcPx, y)
            : ((byte & (0x80 >> bit)) ? inkRgb : paperRgb);
          data[pixelIndex] = rgb[0];
          data[pixelIndex + 1] = rgb[1];
          data[pixelIndex + 2] = rgb[2];
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }

  const scaleX = getPixelScaleX();
  const scaleY = getPixelScaleY();
  if (useClipping) {
    // Render only the clipped region: putImageData to temp, then drawImage the region
    const temp = getTempRenderCanvas(renderW, renderH);
    if (!temp) return;
    temp.ctx.putImageData(imageData, 0, 0);
    applyRenderSmoothing(ctx);
    // Clear canvas first (border fill already done by caller), then draw visible portion
    ctx.drawImage(
      temp.canvas,
      0, 0, renderW, renderH,
      borderOffset + renderX0 * scaleX * zoom, borderOffset + renderY0 * scaleY * zoom,
      renderW * scaleX * zoom, renderH * scaleY * zoom
    );
  } else {
    const temp = getTempRenderCanvas(width, height);
    if (!temp) return;
    temp.ctx.putImageData(imageData, 0, 0);
    applyRenderSmoothing(ctx);
    ctx.drawImage(
      temp.canvas,
      0, 0, width, height,
      borderOffset, borderOffset, width * scaleX * zoom, height * scaleY * zoom
    );
  }
}

/**
 * Returns the selected fill pattern array (8 bytes) based on the pattern dropdown.
 * For SCA type 1 "file" option, returns the embedded fill pattern from the SCA header.
 * @param {Uint8Array|null} [fileFallback] - File-embedded pattern to use for "file" option
 * @returns {number[]|Uint8Array}
 */
function getSelectedPattern(fileFallback) {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('pattern53cSelect'));
  const patternName = select?.value || 'checker';
  if (patternName === 'file' && fileFallback) return fileFallback;
  if (patternName === 'stripes') return APP_CONFIG.PATTERN_53C_STRIPES;
  if (patternName === 'dd77') return APP_CONFIG.PATTERN_53C_DD77;
  return APP_CONFIG.PATTERN_53C_CHECKER;
}

function render53cScreen(ctx, borderOffset) {
  const patternArray = getSelectedPattern();

  // Fast path: render to 1:1 ImageData, then scale with drawImage (GPU accelerated)
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;
  const defaultInkRgb = [0, 0, 0];
  const defaultPaperRgb = [255, 255, 255];

  // Precompute ink ratio for blend mode
  let inkRatio = 0;
  if (attr53cBlend) {
    let inkBitCount = 0;
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        if (patternArray[py] & (1 << (7 - px))) inkBitCount++;
      }
    }
    inkRatio = inkBitCount / 64;
  }

  for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const attrIndex = col + row * 32;
      const attr = screenData[attrIndex];
      let inkRgb, paperRgb;
      if (showAttributes) {
        ({ inkRgb, paperRgb } = getColorsRgb(attr));
      } else {
        inkRgb = defaultInkRgb;
        paperRgb = defaultPaperRgb;
      }

      const cellX = col * 8;
      const cellY = row * 8;

      if (attr53cBlend) {
        // Blend mode: fill entire cell with solid averaged color
        const br = Math.round(inkRgb[0] * inkRatio + paperRgb[0] * (1 - inkRatio));
        const bg = Math.round(inkRgb[1] * inkRatio + paperRgb[1] * (1 - inkRatio));
        const bb = Math.round(inkRgb[2] * inkRatio + paperRgb[2] * (1 - inkRatio));
        for (let py = 0; py < 8; py++) {
          const rowOffset = (cellY + py) * SCREEN.WIDTH;
          for (let px = 0; px < 8; px++) {
            const pixelIndex = (rowOffset + cellX + px) * 4;
            data[pixelIndex] = br;
            data[pixelIndex + 1] = bg;
            data[pixelIndex + 2] = bb;
            data[pixelIndex + 3] = 255;
          }
        }
      } else {
        // Pattern mode: original checkerboard rendering
        for (let py = 0; py < 8; py++) {
          const patternByte = patternArray[py];
          const y = cellY + py;
          const rowOffset = y * SCREEN.WIDTH;
          for (let px = 0; px < 8; px++) {
            const isInk = (patternByte & (1 << (7 - px))) !== 0;
            const rgb = isInk ? inkRgb : paperRgb;
            const pixelIndex = (rowOffset + cellX + px) * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  }

  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);

  applyRenderSmoothing(ctx);
  ctx.drawImage(
    temp.canvas,
    0, 0, SCREEN.WIDTH, SCREEN.HEIGHT,
    borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom
  );
}

/**
 * Renders an IFL format screen (8x2 multicolor)
 * Same pixel layout as SCR, but each 8x2 block has its own attribute
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderIflScreen(ctx, borderOffset) {
  // IFL uses same interleaved pixel layout as SCR
  // But attributes are 8x2 instead of 8x8 (96 attribute rows instead of 24)

  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  for (let third = 0; third < 3; third++) {
    const bitmapBase = third * 2048;

    // line = pixel line within character cell (0-7)
    for (let line = 0; line < 8; line++) {
      // row = character row within this third (0-7)
      for (let row = 0; row < 8; row++) {
        // col = character column (0-31)
        for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
          // ZX Spectrum interleaved address calculation
          const bitmapOffset = bitmapBase + col + row * 32 + line * 256;
          const byte = screenData[bitmapOffset];

          // Calculate absolute Y position
          const y = third * 64 + row * 8 + line;

          // IFL attribute: one row per 2 pixel lines
          // Attribute row = y / 2 (0-95)
          const attrRow = Math.floor(y / 2);
          const attrOffset = IFL.BITMAP_SIZE + attrRow * 32 + col;
          const attr = screenData[attrOffset];
          let inkRgb, paperRgb;
          if (showAttributes) {
            ({ inkRgb, paperRgb } = getColorsRgb(attr));
          } else {
            inkRgb = [0, 0, 0];
            paperRgb = [255, 255, 255];
          }

          // Draw 8 pixels to ImageData
          const x = col * 8;
          for (let bit = 0; bit < 8; bit++) {
            const px = x + bit;
            const maskIdx = y * SCREEN.WIDTH + px;
            const rgb = isPixelTransparent(maskIdx)
              ? getCheckerboardColor(px, y)
              : (isBitSet(byte, bit) ? inkRgb : paperRgb);
            const pixelIndex = maskIdx * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders an MLT format screen (8x1 multicolor)
 * Each pixel line has its own attribute row
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderMltScreen(ctx, borderOffset) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;
  const isLinear = currentPicture && currentPicture.sourceFormat === 'mlt_linear';
  const isTimexHC = currentPicture && currentPicture.sourceFormat === 'mlt_ula';

  // Process each pixel line from 0 to 191
  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    let bitmapBase;
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const interleavedBase = third * 2048 + charRow * 32 + pixelLine * 256;
    if (isLinear) {
      // Linear bitmap: row-major layout
      bitmapBase = y * 32;
    } else {
      // ZX Spectrum interleaved layout
      bitmapBase = interleavedBase;
    }

    // MLT attribute: one row per pixel line
    // mlt_ula (Timex Hi-Colour): attrs also ZX-interleaved
    const attrBase = isTimexHC
      ? MLT.BITMAP_SIZE + interleavedBase
      : MLT.BITMAP_SIZE + y * 32;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const byte = screenData[bitmapBase + col];
      const attr = screenData[attrBase + col];
      let inkRgb, paperRgb;
      if (showAttributes) {
        ({ inkRgb, paperRgb } = getColorsRgb(attr));
      } else {
        inkRgb = [0, 0, 0];
        paperRgb = [255, 255, 255];
      }

      const x = col * 8;
      for (let bit = 0; bit < 8; bit++) {
        const px = x + bit;
        const maskIdx = y * SCREEN.WIDTH + px;
        const rgb = isPixelTransparent(maskIdx)
          ? getCheckerboardColor(px, y)
          : (isBitSet(byte, bit) ? inkRgb : paperRgb);
        const pixelIndex = maskIdx * 4;
        data[pixelIndex] = rgb[0];
        data[pixelIndex + 1] = rgb[1];
        data[pixelIndex + 2] = rgb[2];
        data[pixelIndex + 3] = 255;
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders an RGB3 format screen (tricolor RGB)
 * Three bitmaps combined: R, G, B channels
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderRgb3Screen(ctx, borderOffset) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  // Precompute 8 RGB3 colors from current palette.
  // Blend: direct RGB channel mapping — each plane controls its R/G/B channel.
  // Blend dark: average of 3 CRT frames (each shows one color against black),
  //   darkened by CRT_DARK_FACTOR for retrace blanking.
  const isBlendDark = rgb3Mode === 'blend_dark';
  const palBlue = ZX_PALETTE_RGB.BRIGHT[1];
  const palRed = ZX_PALETTE_RGB.BRIGHT[2];
  const palGreen = ZX_PALETTE_RGB.BRIGHT[4];
  const rgb3Lut = new Array(8);
  if (isBlendDark) {
    const black = ZX_PALETTE_RGB.BRIGHT[0];
    for (let i = 0; i < 8; i++) {
      const fR = (i & 2) ? palRed : black;
      const fG = (i & 4) ? palGreen : black;
      const fB = (i & 1) ? palBlue : black;
      rgb3Lut[i] = [
        Math.round((fR[0] + fG[0] + fB[0]) / 3 * CRT_DARK_FACTOR),
        Math.round((fR[1] + fG[1] + fB[1]) / 3 * CRT_DARK_FACTOR),
        Math.round((fR[2] + fG[2] + fB[2]) / 3 * CRT_DARK_FACTOR)
      ];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      rgb3Lut[i] = [
        (i & 2) ? palRed[0] : 0,
        (i & 4) ? palGreen[1] : 0,
        (i & 1) ? palBlue[2] : 0
      ];
    }
  }

  // Process each pixel line from 0 to 191
  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    // Calculate bitmap address using ZX Spectrum interleaved layout
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const bitmapOffset = third * 2048 + charRow * 32 + pixelLine * 256;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const redByte = screenData[RGB3.RED_OFFSET + bitmapOffset + col];
      const greenByte = screenData[RGB3.GREEN_OFFSET + bitmapOffset + col];
      const blueByte = screenData[RGB3.BLUE_OFFSET + bitmapOffset + col];

      const x = col * 8;
      for (let bit = 0; bit < 8; bit++) {
        const px = x + bit;
        const maskIdx = y * SCREEN.WIDTH + px;
        const pixelIndex = maskIdx * 4;

        if (isPixelTransparent(maskIdx)) {
          const checker = getCheckerboardColor(px, y);
          data[pixelIndex] = checker[0];
          data[pixelIndex + 1] = checker[1];
          data[pixelIndex + 2] = checker[2];
        } else {
          // Combine RGB channels using precomputed palette-based LUT
          const colorIdx = (isBitSet(redByte, bit) ? 2 : 0) |
                           (isBitSet(greenByte, bit) ? 4 : 0) |
                           (isBitSet(blueByte, bit) ? 1 : 0);
          const c = rgb3Lut[colorIdx];
          data[pixelIndex] = c[0];
          data[pixelIndex + 1] = c[1];
          data[pixelIndex + 2] = c[2];
        }
        data[pixelIndex + 3] = 255;
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders RGB3 format with a single bitplane (for flicker emulation)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {number} phase - Which bitplane to show: 0=R, 1=G, 2=B
 */
function renderRgb3ScreenFlicker(ctx, borderOffset, phase) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  // Determine which bitplane offset to use
  const bitplaneOffset = phase === 0 ? RGB3.RED_OFFSET :
                         phase === 1 ? RGB3.GREEN_OFFSET :
                         RGB3.BLUE_OFFSET;

  // Palette colors: phase 0=Red(2), 1=Green(4), 2=Blue(1)
  const onColor = phase === 0 ? ZX_PALETTE_RGB.BRIGHT[2] :
                  phase === 1 ? ZX_PALETTE_RGB.BRIGHT[4] :
                  ZX_PALETTE_RGB.BRIGHT[1];
  const offColor = ZX_PALETTE_RGB.BRIGHT[0];

  // Process each pixel line from 0 to 191
  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    // Calculate bitmap address using ZX Spectrum interleaved layout
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const bitmapOffset = third * 2048 + charRow * 32 + pixelLine * 256;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const planeByte = screenData[bitplaneOffset + bitmapOffset + col];

      const x = col * 8;
      for (let bit = 0; bit < 8; bit++) {
        const px = x + bit;
        const maskIdx = y * SCREEN.WIDTH + px;
        const pixelIndex = maskIdx * 4;

        if (isPixelTransparent(maskIdx)) {
          const checker = getCheckerboardColor(px, y);
          data[pixelIndex] = checker[0];
          data[pixelIndex + 1] = checker[1];
          data[pixelIndex + 2] = checker[2];
        } else {
          // Show palette color for this bitplane phase, or black
          const bitSet = isBitSet(planeByte, bit);
          const color = bitSet ? onColor : offColor;
          data[pixelIndex] = color[0];
          data[pixelIndex + 1] = color[1];
          data[pixelIndex + 2] = color[2];
        }
        data[pixelIndex + 3] = 255;
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders an RGB3 Picture from the internal linear layout.
 * Dispatches between average-blend and flicker modes.
 * Three planes: [0]=Red, [1]=Green, [2]=Blue, no attributes.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {Picture} pic - The currentPicture (planeCount=3, colorMode='rgb3')
 */
function renderPictureRgb3(ctx, borderOffset, pic) {
  // Sync from screenData so in-progress drawing is visible immediately
  if (typeof syncPictureFromScreenData === 'function') {
    syncPictureFromScreenData(screenData, pic);
  }

  const cols = pic.cols;
  const width = pic.width;
  const height = pic.height;

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const isFlicker = rgb3Mode === 'flicker' && rgb3FlickerFrameId !== null;
  const isBlendDark = rgb3Mode === 'blend_dark';

  if (isFlicker) {
    // Flicker: show one bitplane based on phase
    const plane = pic.planes[rgb3FlickerPhase];
    const planeBitmap = plane.bitmap;

    // Palette colors: phase 0=Red(2), 1=Green(4), 2=Blue(1)
    const onColor = rgb3FlickerPhase === 0 ? ZX_PALETTE_RGB.BRIGHT[2] :
                    rgb3FlickerPhase === 1 ? ZX_PALETTE_RGB.BRIGHT[4] :
                    ZX_PALETTE_RGB.BRIGHT[1];
    const offColor = ZX_PALETTE_RGB.BRIGHT[0];

    for (let y = 0; y < height; y++) {
      for (let col = 0; col < cols; col++) {
        const byte = planeBitmap[y * cols + col];
        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const maskIdx = y * width + px;
          const pixelIndex = maskIdx * 4;

          if (isPixelTransparent(maskIdx)) {
            const checker = getCheckerboardColor(px, y);
            data[pixelIndex] = checker[0];
            data[pixelIndex + 1] = checker[1];
            data[pixelIndex + 2] = checker[2];
          } else {
            const color = (byte & (0x80 >> bit)) ? onColor : offColor;
            data[pixelIndex] = color[0];
            data[pixelIndex + 1] = color[1];
            data[pixelIndex + 2] = color[2];
          }
          data[pixelIndex + 3] = 255;
        }
      }
    }
  } else {
    // Blend: direct RGB channel mapping. Blend dark: average of 3 CRT frames.
    const palBlue = ZX_PALETTE_RGB.BRIGHT[1];
    const palRed = ZX_PALETTE_RGB.BRIGHT[2];
    const palGreen = ZX_PALETTE_RGB.BRIGHT[4];
    const rgb3Lut = new Array(8);
    if (isBlendDark) {
      const black = ZX_PALETTE_RGB.BRIGHT[0];
      for (let i = 0; i < 8; i++) {
        const fR = (i & 2) ? palRed : black;
        const fG = (i & 4) ? palGreen : black;
        const fB = (i & 1) ? palBlue : black;
        rgb3Lut[i] = [
          Math.round((fR[0] + fG[0] + fB[0]) / 3 * CRT_DARK_FACTOR),
          Math.round((fR[1] + fG[1] + fB[1]) / 3 * CRT_DARK_FACTOR),
          Math.round((fR[2] + fG[2] + fB[2]) / 3 * CRT_DARK_FACTOR)
        ];
      }
    } else {
      for (let i = 0; i < 8; i++) {
        rgb3Lut[i] = [
          (i & 2) ? palRed[0] : 0,
          (i & 4) ? palGreen[1] : 0,
          (i & 1) ? palBlue[2] : 0
        ];
      }
    }

    const redBm = pic.planes[0].bitmap;
    const greenBm = pic.planes[1].bitmap;
    const blueBm = pic.planes[2].bitmap;

    for (let y = 0; y < height; y++) {
      for (let col = 0; col < cols; col++) {
        const rowOff = y * cols + col;
        const redByte = redBm[rowOff];
        const greenByte = greenBm[rowOff];
        const blueByte = blueBm[rowOff];

        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const maskIdx = y * width + px;
          const pixelIndex = maskIdx * 4;
          const mask = 0x80 >> bit;

          if (isPixelTransparent(maskIdx)) {
            const checker = getCheckerboardColor(px, y);
            data[pixelIndex] = checker[0];
            data[pixelIndex + 1] = checker[1];
            data[pixelIndex + 2] = checker[2];
          } else {
            const colorIdx = ((redByte & mask) ? 2 : 0) |
                             ((greenByte & mask) ? 4 : 0) |
                             ((blueByte & mask) ? 1 : 0);
            const c = rgb3Lut[colorIdx];
            data[pixelIndex] = c[0];
            data[pixelIndex + 1] = c[1];
            data[pixelIndex + 2] = c[2];
          }
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }

  const temp = getTempRenderCanvas(width, height);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, width * zoom, height * zoom);
}

/**
 * RGB3 flicker animation loop using requestAnimationFrame
 * @param {number} timestamp - Current timestamp from requestAnimationFrame
 */
function rgb3FlickerLoop(timestamp) {
  if (rgb3FlickerFrameId === null) return; // Animation stopped

  // Check if enough time has passed for next frame (50Hz = 20ms)
  const elapsed = timestamp - rgb3FlickerLastTime;
  if (elapsed >= FLICKER_INTERVAL_MS) {
    rgb3FlickerPhase = (rgb3FlickerPhase + 1) % 3;
    rgb3FlickerLastTime = timestamp - (elapsed % FLICKER_INTERVAL_MS); // Maintain timing accuracy
    renderScreen();
  }

  rgb3FlickerFrameId = requestAnimationFrame(rgb3FlickerLoop);
}

/**
 * Starts RGB3 flicker animation (50fps using requestAnimationFrame)
 */
function startRgb3Flicker() {
  if (rgb3FlickerFrameId !== null) return; // Already running

  rgb3FlickerPhase = 0;
  rgb3FlickerLastTime = performance.now();
  rgb3FlickerFrameId = requestAnimationFrame(rgb3FlickerLoop);
}

/**
 * Stops RGB3 flicker animation
 */
function stopRgb3Flicker() {
  if (rgb3FlickerFrameId !== null) {
    cancelAnimationFrame(rgb3FlickerFrameId);
    rgb3FlickerFrameId = null;
  }
  rgb3FlickerPhase = 0;
}

/**
 * Sets RGB3 display mode
 * @param {string} mode - 'blend', 'flicker', or 'blend_dark'
 */
function setRgb3Mode(mode) {
  stopRgb3Flicker();
  rgb3Mode = mode;
  if (mode === 'flicker' && currentFormat === FORMAT.RGB3) {
    startRgb3Flicker();
  } else if (currentFormat === FORMAT.RGB3) {
    renderScreen();
  }
}

/**
 * Renders a Gigascreen format screen
 * Two SCR frames combined based on current mode (average/opacity/flicker)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderGigascreen(ctx, borderOffset) {
  if (gigascreenMode === GIGASCREEN_MODE.FLICKER && gigascreenFlickerFrameId !== null) {
    renderGigascreenFrame(ctx, borderOffset, gigascreenFlickerPhase);
  } else {
    renderGigascreenAverage(ctx, borderOffset);
  }
}

/**
 * Renders a single Gigascreen frame (for flicker mode)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {number} frameIndex - Which frame to show (0 or 1)
 */
function renderGigascreenFrame(ctx, borderOffset, frameIndex) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;
  const frameOffset = frameIndex === 0 ? GIGASCREEN.FRAME1_OFFSET : GIGASCREEN.FRAME2_OFFSET;

  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const bitmapOffset = third * 2048 + charRow * 32 + pixelLine * 256;
    const attrRowOffset = third * 256 + charRow * 32;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const bitmapByte = screenData[frameOffset + bitmapOffset + col];
      const attr = screenData[frameOffset + SCREEN.BITMAP_SIZE + attrRowOffset + col];
      const { inkRgb, paperRgb } = getColorsRgb(attr);

      const x = col * 8;
      for (let bit = 0; bit < 8; bit++) {
        const px = x + bit;
        const pixelIndex = (y * SCREEN.WIDTH + px) * 4;
        const isInk = isBitSet(bitmapByte, bit);
        const rgb = isInk ? inkRgb : paperRgb;

        data[pixelIndex] = rgb[0];
        data[pixelIndex + 1] = rgb[1];
        data[pixelIndex + 2] = rgb[2];
        data[pixelIndex + 3] = 255;
      }
    }
  }

  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders Gigascreen with blended colors (average or dark blend)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderGigascreenAverage(ctx, borderOffset) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;
  const darkMul = gigascreenMode === GIGASCREEN_MODE.BLEND_DARK ? CRT_DARK_FACTOR : 1;

  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const bitmapOffset = third * 2048 + charRow * 32 + pixelLine * 256;
    const attrRowOffset = third * 256 + charRow * 32;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      // Frame 1
      const bitmap1 = screenData[GIGASCREEN.FRAME1_OFFSET + bitmapOffset + col];
      const attr1 = screenData[GIGASCREEN.FRAME1_OFFSET + SCREEN.BITMAP_SIZE + attrRowOffset + col];
      const colors1 = getColorsRgb(attr1);

      // Frame 2
      const bitmap2 = screenData[GIGASCREEN.FRAME2_OFFSET + bitmapOffset + col];
      const attr2 = screenData[GIGASCREEN.FRAME2_OFFSET + SCREEN.BITMAP_SIZE + attrRowOffset + col];
      const colors2 = getColorsRgb(attr2);

      const x = col * 8;
      for (let bit = 0; bit < 8; bit++) {
        const px = x + bit;
        const pixelIndex = (y * SCREEN.WIDTH + px) * 4;

        const isInk1 = isBitSet(bitmap1, bit);
        const rgb1 = isInk1 ? colors1.inkRgb : colors1.paperRgb;

        const isInk2 = isBitSet(bitmap2, bit);
        const rgb2 = isInk2 ? colors2.inkRgb : colors2.paperRgb;

        data[pixelIndex] = Math.round((rgb1[0] + rgb2[0]) / 2 * darkMul);
        data[pixelIndex + 1] = Math.round((rgb1[1] + rgb2[1]) / 2 * darkMul);
        data[pixelIndex + 2] = Math.round((rgb1[2] + rgb2[2]) / 2 * darkMul);
        data[pixelIndex + 3] = 255;
      }
    }
  }

  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders STL (Stellar) format: multicolor + gigascreen at 64×48 fat pixels.
 * De-interleaves 4-byte groups into two attribute frames, blends colors.
 * Fixed bitmap pattern 0x0F: left 4px = paper, right 4px = ink per cell.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderStlScreen(ctx, borderOffset) {
  if (gigascreenMode === GIGASCREEN_MODE.FLICKER && gigascreenFlickerFrameId !== null) {
    renderStlFrame(ctx, borderOffset, gigascreenFlickerPhase);
  } else {
    renderStlAverage(ctx, borderOffset);
  }
}

/**
 * Extracts the two STL attribute frames from screenData, handling both the
 * raw 3072-byte interleaved format and the gigascreen-layout editing format
 * (15360 bytes: [bm1][at1][bm2][at2] with 1536-byte attr sections).
 * @returns {{frame1: Uint8Array, frame2: Uint8Array}}
 */
function getStlAttrFrames() {
  const frame1 = new Uint8Array(STL.ATTRS_PER_FRAME);
  const frame2 = new Uint8Array(STL.ATTRS_PER_FRAME);

  if (screenData && screenData.length > STL.TOTAL_SIZE) {
    // Gigascreen layout: [bm1(6144)][at1(1536)][bm2(6144)][at2(1536)]
    const frameSize = 6144 + STL.ATTRS_PER_FRAME; // 7680
    for (let i = 0; i < STL.ATTRS_PER_FRAME; i++) {
      frame1[i] = screenData[6144 + i];
      frame2[i] = screenData[frameSize + 6144 + i];
    }
  } else if (screenData) {
    // Raw 3072-byte interleaved format
    for (let i = 0, j = 0; i < STL.TOTAL_SIZE; i += 4, j += 2) {
      frame1[j]     = screenData[i];
      frame1[j + 1] = screenData[i + 1];
      frame2[j]     = screenData[i + 2];
      frame2[j + 1] = screenData[i + 3];
    }
  }

  return { frame1, frame2 };
}

/**
 * Renders STL with blended gigascreen colors (average or dark blend)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderStlAverage(ctx, borderOffset) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;
  const darkMul = gigascreenMode === GIGASCREEN_MODE.BLEND_DARK ? CRT_DARK_FACTOR : 1;

  const { frame1, frame2 } = getStlAttrFrames();

  // Render 32 cols × 48 rows, each cell is 8px wide × 4px tall
  // Fixed bitmap 0x0F: left 4 pixels = paper, right 4 pixels = ink
  for (let row = 0; row < STL.ROWS; row++) {
    for (let col = 0; col < STL.COLS; col++) {
      const attrIdx = row * STL.COLS + col;
      const attr1 = frame1[attrIdx];
      const attr2 = frame2[attrIdx];

      const colors1 = getColorsRgb(attr1);
      const colors2 = getColorsRgb(attr2);

      // Left half (paper): blend paper colors from both frames
      const leftR = Math.round((colors1.paperRgb[0] + colors2.paperRgb[0]) / 2 * darkMul);
      const leftG = Math.round((colors1.paperRgb[1] + colors2.paperRgb[1]) / 2 * darkMul);
      const leftB = Math.round((colors1.paperRgb[2] + colors2.paperRgb[2]) / 2 * darkMul);

      // Right half (ink): blend ink colors from both frames
      const rightR = Math.round((colors1.inkRgb[0] + colors2.inkRgb[0]) / 2 * darkMul);
      const rightG = Math.round((colors1.inkRgb[1] + colors2.inkRgb[1]) / 2 * darkMul);
      const rightB = Math.round((colors1.inkRgb[2] + colors2.inkRgb[2]) / 2 * darkMul);

      const baseX = col * 8;
      const baseY = row * STL.CELL_HEIGHT;

      // Fill 8×4 cell: left 4 pixels = paper blend, right 4 pixels = ink blend
      for (let py = 0; py < STL.CELL_HEIGHT; py++) {
        const y = baseY + py;
        // Left 4 pixels (paper)
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (y * SCREEN.WIDTH + baseX + px) * 4;
          data[pixelIndex] = leftR;
          data[pixelIndex + 1] = leftG;
          data[pixelIndex + 2] = leftB;
          data[pixelIndex + 3] = 255;
        }
        // Right 4 pixels (ink)
        for (let px = 4; px < 8; px++) {
          const pixelIndex = (y * SCREEN.WIDTH + baseX + px) * 4;
          data[pixelIndex] = rightR;
          data[pixelIndex + 1] = rightG;
          data[pixelIndex + 2] = rightB;
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }

  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders a single STL frame (for flicker mode)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {number} frameIndex - Which frame to show (0 or 1)
 */
function renderStlFrame(ctx, borderOffset, frameIndex) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  const { frame1, frame2 } = getStlAttrFrames();
  const frame = frameIndex === 0 ? frame1 : frame2;

  for (let row = 0; row < STL.ROWS; row++) {
    for (let col = 0; col < STL.COLS; col++) {
      const attrIdx = row * STL.COLS + col;
      const attr = frame[attrIdx];
      const { inkRgb, paperRgb } = getColorsRgb(attr);

      const baseX = col * 8;
      const baseY = row * STL.CELL_HEIGHT;

      for (let py = 0; py < STL.CELL_HEIGHT; py++) {
        const y = baseY + py;
        // Left 4 pixels (paper)
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (y * SCREEN.WIDTH + baseX + px) * 4;
          data[pixelIndex] = paperRgb[0];
          data[pixelIndex + 1] = paperRgb[1];
          data[pixelIndex + 2] = paperRgb[2];
          data[pixelIndex + 3] = 255;
        }
        // Right 4 pixels (ink)
        for (let px = 4; px < 8; px++) {
          const pixelIndex = (y * SCREEN.WIDTH + baseX + px) * 4;
          data[pixelIndex] = inkRgb[0];
          data[pixelIndex + 1] = inkRgb[1];
          data[pixelIndex + 2] = inkRgb[2];
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }

  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders a Gigascreen Picture from the internal linear layout.
 * Dispatches between average-blend and flicker modes.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {Picture} pic - The currentPicture (planeCount=2, colorMode='gigascreen')
 */
function renderPictureGigascreen(ctx, borderOffset, pic) {
  // Sync from screenData so in-progress drawing is visible immediately
  if (typeof syncPictureFromScreenData === 'function') {
    syncPictureFromScreenData(screenData, pic);
  }

  const cols = pic.cols;
  const width = pic.width;
  const height = pic.height;
  const attrCellH = pic.attrCellHeight; // 8

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const isFlicker = gigascreenMode === GIGASCREEN_MODE.FLICKER && gigascreenFlickerFrameId !== null;

  if (isFlicker) {
    // Flicker: show one plane based on phase
    const plane = pic.planes[gigascreenFlickerPhase];
    const bitmap = plane.bitmap;
    const attrs = plane.attrs;

    for (let y = 0; y < height; y++) {
      const attrRow = attrCellH > 0 ? Math.floor(y / attrCellH) : (y >> 3);
      for (let col = 0; col < cols; col++) {
        const byte = bitmap[y * cols + col];
        const attr = attrs[attrRow * cols + col];
        const { inkRgb, paperRgb } = getColorsRgb(attr);

        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const pixelIndex = (y * width + px) * 4;
          const rgb = (byte & (0x80 >> bit)) ? inkRgb : paperRgb;
          data[pixelIndex] = rgb[0];
          data[pixelIndex + 1] = rgb[1];
          data[pixelIndex + 2] = rgb[2];
          data[pixelIndex + 3] = 255;
        }
      }
    }
  } else {
    // Blend: average both planes, optionally darkened for CRT simulation
    const darkMul = gigascreenMode === GIGASCREEN_MODE.BLEND_DARK ? CRT_DARK_FACTOR : 1;
    const bm1 = pic.planes[0].bitmap;
    const at1 = pic.planes[0].attrs;
    const bm2 = pic.planes[1].bitmap;
    const at2 = pic.planes[1].attrs;

    for (let y = 0; y < height; y++) {
      const attrRow = attrCellH > 0 ? Math.floor(y / attrCellH) : (y >> 3);
      for (let col = 0; col < cols; col++) {
        const byte1 = bm1[y * cols + col];
        const byte2 = bm2[y * cols + col];
        const colors1 = getColorsRgb(at1[attrRow * cols + col]);
        const colors2 = getColorsRgb(at2[attrRow * cols + col]);

        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const pixelIndex = (y * width + px) * 4;
          const mask = 0x80 >> bit;
          const rgb1 = (byte1 & mask) ? colors1.inkRgb : colors1.paperRgb;
          const rgb2 = (byte2 & mask) ? colors2.inkRgb : colors2.paperRgb;

          data[pixelIndex] = Math.round((rgb1[0] + rgb2[0]) / 2 * darkMul);
          data[pixelIndex + 1] = Math.round((rgb1[1] + rgb2[1]) / 2 * darkMul);
          data[pixelIndex + 2] = Math.round((rgb1[2] + rgb2[2]) / 2 * darkMul);
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }

  const temp = getTempRenderCanvas(width, height);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, width * zoom, height * zoom);
}

/**
 * Gigascreen flicker animation loop using requestAnimationFrame
 * @param {number} timestamp - Current timestamp from requestAnimationFrame
 */
function gigascreenFlickerLoop(timestamp) {
  if (gigascreenFlickerFrameId === null) return; // Animation stopped

  // Check if enough time has passed for next frame (50Hz = 20ms)
  const elapsed = timestamp - gigascreenFlickerLastTime;
  if (elapsed >= FLICKER_INTERVAL_MS) {
    gigascreenFlickerPhase = (gigascreenFlickerPhase + 1) % 2;
    gigascreenFlickerLastTime = timestamp - (elapsed % FLICKER_INTERVAL_MS); // Maintain timing accuracy
    renderScreen();
  }

  gigascreenFlickerFrameId = requestAnimationFrame(gigascreenFlickerLoop);
}

/**
 * Starts Gigascreen flicker animation (50fps using requestAnimationFrame)
 */
function startGigascreenFlicker() {
  if (gigascreenFlickerFrameId !== null) return; // Already running

  gigascreenFlickerPhase = 0;
  gigascreenFlickerLastTime = performance.now();
  gigascreenFlickerFrameId = requestAnimationFrame(gigascreenFlickerLoop);
}

/**
 * Stops Gigascreen flicker animation
 */
function stopGigascreenFlicker() {
  if (gigascreenFlickerFrameId !== null) {
    cancelAnimationFrame(gigascreenFlickerFrameId);
    gigascreenFlickerFrameId = null;
  }
  gigascreenFlickerPhase = 0;
}

/**
 * Sets Gigascreen display mode
 * @param {string} mode - 'average', 'flicker', or 'blend_dark'
 */
function setGigascreenMode(mode) {
  // Stop existing flicker if running
  stopGigascreenFlicker();

  gigascreenMode = mode;

  const isGiga = currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH ||
    currentFormat === FORMAT.HLR || currentFormat === FORMAT.STL ||
    (currentFormat === FORMAT.CHR && currentPicture && currentPicture.colorMode === 'gigascreen');
  if (mode === GIGASCREEN_MODE.FLICKER && isGiga) {
    startGigascreenFlicker();
  } else if (isGiga) {
    renderScreen();
  }
}

/**
 * Parses a CSS color string to RGB values
 * @param {string} color - CSS color (hex or rgb format)
 * @returns {{r: number, g: number, b: number}}
 */
function parseColorToRgb(color) {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  // Handle rgb() format
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
  }
  return { r: 0, g: 0, b: 0 };
}

/** @type {HTMLCanvasElement|null} */
let monoOffscreenCanvas = null;
/** @type {CanvasRenderingContext2D|null} */
let monoOffscreenCtx = null;

/**
 * Renders a monochrome screen (bitmap only, no attributes)
 * Supports full (6144), 2/3 (4096), and 1/3 (2048) screens
 * Uses ImageData for fast rendering
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {number} thirds - Number of thirds to render (1, 2, or 3)
 */
function renderMonoScreen(ctx, borderOffset, thirds) {
  // Use editor colors if in editor mode, otherwise use white on black
  let ink, paper;
  if (typeof editorActive !== 'undefined' && editorActive &&
      typeof editorInkColor !== 'undefined' && typeof editorPaperColor !== 'undefined') {
    const editorBrightVal = (typeof editorBright !== 'undefined') ? editorBright : false;
    const palette = editorBrightVal ? ZX_PALETTE.BRIGHT : ZX_PALETTE.REGULAR;
    ink = palette[editorInkColor];
    paper = palette[editorPaperColor];
  } else {
    // Use high-contrast white on black for viewer mode
    ink = '#FFFFFF';
    paper = '#000000';
  }

  const inkRgb = parseColorToRgb(ink);
  const paperRgb = parseColorToRgb(paper);

  const width = SCREEN.WIDTH;
  const height = thirds * 64;

  // Create/reuse offscreen canvas at 1:1 scale
  if (!monoOffscreenCanvas || monoOffscreenCanvas.width !== width || monoOffscreenCanvas.height !== height) {
    monoOffscreenCanvas = document.createElement('canvas');
    monoOffscreenCanvas.width = width;
    monoOffscreenCanvas.height = height;
    monoOffscreenCtx = monoOffscreenCanvas.getContext('2d');
  }

  const imageData = monoOffscreenCtx.createImageData(width, height);
  const data = imageData.data;

  for (let third = 0; third < thirds; third++) {
    const bitmapBase = third * 2048;

    for (let y = 0; y < 64; y++) {
      const charRow = Math.floor(y / 8);
      const pixelLine = y % 8;
      const bitmapOffset = bitmapBase + charRow * 32 + pixelLine * 256;
      const screenY = third * 64 + y;

      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const byte = screenData[bitmapOffset + col];
        const x = col * 8;

        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const maskIdx = screenY * width + px;
          const pixelIndex = maskIdx * 4;
          if (isPixelTransparent(maskIdx)) {
            const checker = getCheckerboardColor(px, screenY);
            data[pixelIndex] = checker[0];
            data[pixelIndex + 1] = checker[1];
            data[pixelIndex + 2] = checker[2];
          } else {
            const isSet = isBitSet(byte, bit);
            const rgb = isSet ? inkRgb : paperRgb;
            data[pixelIndex] = rgb.r;
            data[pixelIndex + 1] = rgb.g;
            data[pixelIndex + 2] = rgb.b;
          }
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }

  monoOffscreenCtx.putImageData(imageData, 0, 0);

  // Draw scaled to main canvas
  applyRenderSmoothing(ctx);
  ctx.globalAlpha = 1.0;  // Ensure full opacity for monochrome rendering
  ctx.drawImage(monoOffscreenCanvas, borderOffset, borderOffset, width * zoom, height * zoom);
}

/**
 * Renders a SPECSCII text screen using the current font
 * Parses escape codes for color changes and renders characters with proper colors
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderSpecsciiScreen(ctx, borderOffset) {
  // Fill background (black when attributes on, white when attributes off — matches SCR)
  ctx.fillStyle = showAttributes ? ZX_PALETTE.REGULAR[0] : ZX_PALETTE.REGULAR[7];
  ctx.fillRect(borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);

  // If editor grids are available, render directly from grids (avoids stream round-trip)
  if (typeof specsciiCharGrid !== 'undefined' && specsciiCharGrid &&
      typeof specsciiAttrGrid !== 'undefined' && specsciiAttrGrid) {

    // Multi-layer OVER (XOR) compositing: build pixel buffer from all layers
    const hasLayers = typeof layersEnabled !== 'undefined' && layersEnabled &&
                      typeof layers !== 'undefined' && layers.length > 1;

    if (hasLayers) {
      const W = SCREEN.WIDTH, H = SCREEN.HEIGHT;
      const pixBuf = new Uint8Array(W * H); // 0=paper, 1=ink
      const cellAttr = new Uint8Array(768);
      cellAttr.fill(0x38); // ink 0 (black), paper 7 (white)

      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        const layer = layers[layerIdx];
        if (!layer.visible || !layer.bitmap) continue;

        for (let crow = 0; crow < SPECSCII.CHAR_ROWS; crow++) {
          for (let ccol = 0; ccol < SPECSCII.CHAR_COLS; ccol++) {
            const ci = crow * 32 + ccol;
            // Upper layers: skip cells without mask
            if (layerIdx > 0 && (!layer.mask || !layer.mask[ci])) continue;

            const ch = layer.bitmap[ci];
            const attr = layer.attributes ? layer.attributes[ci] : 0x38;
            const cellInverse = layer.inverse ? layer.inverse[ci] : 0;
            // Top visible layer with content sets the attribute
            cellAttr[ci] = attr;

            // Render glyph pixels into buffer
            for (let line = 0; line < 8; line++) {
              for (let bit = 0; bit < 8; bit++) {
                let isSet = false;
                if (ch >= 0x20 && ch <= 0x7F) {
                  isSet = (fontData[(ch - SPECSCII.FIRST_CHAR) * 8 + line] & (0x80 >> bit)) !== 0;
                } else if (ch >= 0x80) {
                  const pat = ch & 0x0F;
                  const inTop = line < 4, inLeft = bit < 4;
                  if (inTop && inLeft) isSet = (pat & 0x02) !== 0;
                  else if (inTop && !inLeft) isSet = (pat & 0x01) !== 0;
                  else if (!inTop && inLeft) isSet = (pat & 0x08) !== 0;
                  else isSet = (pat & 0x04) !== 0;
                }
                // Apply per-cell inverse: flip the bit
                if (cellInverse) isSet = !isSet;
                if (isSet) {
                  const pi = (crow * 8 + line) * W + ccol * 8 + bit;
                  if (layerIdx === 0) {
                    pixBuf[pi] = 1;
                  } else {
                    pixBuf[pi] ^= 1; // XOR — OVER mode
                  }
                }
              }
            }
          }
        }
      }

      // Render composited pixel buffer to canvas
      for (let crow = 0; crow < SPECSCII.CHAR_ROWS; crow++) {
        for (let ccol = 0; ccol < SPECSCII.CHAR_COLS; ccol++) {
          const ci = crow * 32 + ccol;
          const attr = cellAttr[ci];
          const aInk = attr & 0x07, aPaper = (attr >> 3) & 0x07;
          const aBright = (attr & 0x40) !== 0, aFlash = (attr & 0x80) !== 0;
          const pal = aBright ? ZX_PALETTE.BRIGHT : ZX_PALETTE.REGULAR;
          let ink, paper;
          if (showAttributes) {
            if (aFlash && flashPhase && flashEnabled) {
              ink = pal[aPaper]; paper = pal[aInk];
            } else {
              ink = pal[aInk]; paper = pal[aPaper];
            }
          } else {
            // Match SCR attrs-off: pure black ink, bright white paper
            ink = ZX_PALETTE.BRIGHT[0]; paper = ZX_PALETTE.BRIGHT[7];
          }
          const x = ccol * 8, y = crow * 8;
          ctx.fillStyle = paper;
          ctx.fillRect(borderOffset + x * zoom, borderOffset + y * zoom, 8 * zoom, 8 * zoom);
          ctx.fillStyle = ink;
          for (let line = 0; line < 8; line++) {
            for (let bit = 0; bit < 8; bit++) {
              if (pixBuf[(y + line) * W + x + bit]) {
                ctx.fillRect(
                  borderOffset + (x + bit) * zoom,
                  borderOffset + (y + line) * zoom,
                  zoom, zoom
                );
              }
            }
          }
        }
      }
      return;
    }

    // Single layer or no layers: render directly from charGrid/attrGrid
    for (let row = 0; row < SPECSCII.CHAR_ROWS; row++) {
      for (let col = 0; col < SPECSCII.CHAR_COLS; col++) {
        const idx = row * 32 + col;
        const charCode = specsciiCharGrid[idx];
        const attr = specsciiAttrGrid[idx];
        const cellInverse = (typeof specsciiInverseGrid !== 'undefined' && specsciiInverseGrid) ? specsciiInverseGrid[idx] : 0;

        const inkIdx = attr & 0x07;
        const paperIdx = (attr >> 3) & 0x07;
        const bright = (attr & 0x40) !== 0;
        const flash = (attr & 0x80) !== 0;

        const palBright = bright ? ZX_PALETTE.BRIGHT : ZX_PALETTE.REGULAR;

        let ink, paper;
        if (showAttributes) {
          if (flash && flashPhase && flashEnabled) {
            ink = palBright[paperIdx];
            paper = palBright[inkIdx];
          } else {
            ink = palBright[inkIdx];
            paper = palBright[paperIdx];
          }
          // Apply per-cell inverse: swap ink and paper
          if (cellInverse) {
            const tmp = ink;
            ink = paper;
            paper = tmp;
          }
        } else {
          ink = ZX_PALETTE.REGULAR[0];
          paper = ZX_PALETTE.REGULAR[7];
          // Apply per-cell inverse: swap monochrome colors
          if (cellInverse) {
            const tmp = ink;
            ink = paper;
            paper = tmp;
          }
        }

        const x = col * 8;
        const y = row * 8;

        // Fill paper background
        ctx.fillStyle = paper;
        ctx.fillRect(borderOffset + x * zoom, borderOffset + y * zoom, 8 * zoom, 8 * zoom);

        // Render glyph
        if (charCode >= 0x20 && charCode <= 0x7F) {
          const glyphIndex = charCode - SPECSCII.FIRST_CHAR;
          const glyphOffset = glyphIndex * 8;
          for (let line = 0; line < 8; line++) {
            const glyphByte = fontData[glyphOffset + line];
            for (let bit = 0; bit < 8; bit++) {
              if (isBitSet(glyphByte, bit)) {
                ctx.fillStyle = ink;
                ctx.fillRect(
                  borderOffset + (x + bit) * zoom,
                  borderOffset + (y + line) * zoom,
                  zoom, zoom
                );
              }
            }
          }
        } else if (charCode >= 0x80) {
          renderBlockGraphic(ctx, borderOffset, x, y, charCode, ink, 0);
        }
      }
    }
    return;
  }

  if (!fontLoaded) {
    // Show message if no font loaded
    ctx.fillStyle = getThemeColors().foreground;
    ctx.font = '14px Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Loading font...', borderOffset + (SCREEN.WIDTH * zoom) / 2, borderOffset + (SCREEN.HEIGHT * zoom) / 2);
    return;
  }

  // Current attribute state
  let inkColor = 7;      // Default white ink
  let paperColor = 0;    // Default black paper
  let bright = 0;        // Default not bright
  let flash = 0;         // Default no flash
  let inverse = 0;       // Default not inverse
  let over = 0;          // Default not over (XOR) mode

  // Screen position
  let col = 0;
  let row = 0;

  // Parse the stream
  let i = 0;
  while (i < screenData.length && row < SPECSCII.CHAR_ROWS) {
    const byte = screenData[i];

    // Check for control codes
    // Enter (0x0D) - carriage return + line feed
    if (byte === SPECSCII.CC_ENTER) {
      col = 0;
      row++;
      i++;
      continue;
    }
    // Skip non-printable control codes:
    // 0x00-0x0C, 0x0E-0x0F: unused control codes
    // 0x18-0x1F: unused (CS/SS combinations)
    if ((byte < SPECSCII.CC_INK && byte !== SPECSCII.CC_ENTER) || (byte >= 0x18 && byte <= 0x1F)) {
      i++;
      continue;
    }
    // INK (0x10)
    if (byte === SPECSCII.CC_INK && i + 1 < screenData.length) {
      inkColor = screenData[i + 1] & 0x07;
      i += 2;
      continue;
    }
    // PAPER (0x11)
    if (byte === SPECSCII.CC_PAPER && i + 1 < screenData.length) {
      paperColor = screenData[i + 1] & 0x07;
      i += 2;
      continue;
    }
    // FLASH (0x12)
    if (byte === SPECSCII.CC_FLASH && i + 1 < screenData.length) {
      flash = screenData[i + 1] & 0x01;
      i += 2;
      continue;
    }
    // BRIGHT (0x13)
    if (byte === SPECSCII.CC_BRIGHT && i + 1 < screenData.length) {
      bright = screenData[i + 1] & 0x01;
      i += 2;
      continue;
    }
    // INVERSE (0x14)
    if (byte === SPECSCII.CC_INVERSE && i + 1 < screenData.length) {
      inverse = screenData[i + 1] & 0x01;
      i += 2;
      continue;
    }
    // OVER (0x15)
    if (byte === SPECSCII.CC_OVER && i + 1 < screenData.length) {
      over = screenData[i + 1] & 0x01;
      i += 2;
      continue;
    }
    // AT (0x16) - position cursor
    if (byte === SPECSCII.CC_AT && i + 2 < screenData.length) {
      row = screenData[i + 1];
      col = screenData[i + 2];
      // Clamp to valid range
      if (row >= SPECSCII.CHAR_ROWS) row = SPECSCII.CHAR_ROWS - 1;
      if (col >= SPECSCII.CHAR_COLS) col = SPECSCII.CHAR_COLS - 1;
      i += 3;
      continue;
    }
    // TAB (0x17) - move to column
    if (byte === SPECSCII.CC_TAB && i + 1 < screenData.length) {
      col = screenData[i + 1];
      if (col >= SPECSCII.CHAR_COLS) col = SPECSCII.CHAR_COLS - 1;
      i += 2;
      continue;
    }

    // Regular character - render it
    const charCode = byte;

    // Get colors based on bright flag and flash state
    let ink, paper;
    if (showAttributes) {
      const palette = bright ? ZX_PALETTE.BRIGHT : ZX_PALETTE.REGULAR;

      // Apply inverse mode (swaps ink and paper)
      let effectiveInk = inkColor;
      let effectivePaper = paperColor;
      if (inverse) {
        effectiveInk = paperColor;
        effectivePaper = inkColor;
      }

      // Apply flash (swaps colors during flash phase)
      if (flash && flashPhase && flashEnabled) {
        ink = palette[effectivePaper];
        paper = palette[effectiveInk];
      } else {
        ink = palette[effectiveInk];
        paper = palette[effectivePaper];
      }
    } else {
      // Match SCR attrs-off: pure black ink, bright white paper
      ink = ZX_PALETTE.BRIGHT[0];
      paper = ZX_PALETTE.BRIGHT[7];
    }

    // Calculate screen position
    const x = col * 8;
    const y = row * 8;

    // Fill paper background for this character cell (skip if OVER mode)
    if (!over) {
      ctx.fillStyle = paper;
      ctx.fillRect(borderOffset + x * zoom, borderOffset + y * zoom, 8 * zoom, 8 * zoom);
    }

    // Render the glyph if it's in the font range
    // Characters 0x20-0x7F map to font glyphs 0-95
    // Characters 0x80-0xFF are block graphics (rendered separately)
    if (charCode >= 0x20 && charCode <= 0x7F) {
      const glyphIndex = charCode - SPECSCII.FIRST_CHAR;
      if (glyphIndex >= 0 && glyphIndex < SPECSCII.FONT_CHARS) {
        const glyphOffset = glyphIndex * 8;

        // Render 8 rows of the glyph
        for (let line = 0; line < 8; line++) {
          const glyphByte = fontData[glyphOffset + line];
          for (let bit = 0; bit < 8; bit++) {
            if (isBitSet(glyphByte, bit)) {
              ctx.fillStyle = ink;
              ctx.fillRect(
                borderOffset + (x + bit) * zoom,
                borderOffset + (y + line) * zoom,
                zoom,
                zoom
              );
            }
          }
        }
      }
    } else if (charCode >= 0x80) {
      // Block graphics character (0x80-0xFF)
      // Each character is a 2x2 grid of quadrants
      // Bits 0-3 control which quadrants are filled
      renderBlockGraphic(ctx, borderOffset, x, y, charCode, ink, over);
    }

    // Move to next position
    col++;
    if (col >= SPECSCII.CHAR_COLS) {
      col = 0;
      row++;
    }

    i++;
  }
}

/**
 * Renders a block graphics character (0x80-0xFF)
 * Block graphics are 2x2 grids where bits control which quadrants are filled
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in pixels
 * @param {number} x - X position in pixels
 * @param {number} y - Y position in pixels
 * @param {number} charCode - Character code (0x80-0xFF)
 * @param {string} ink - Ink color
 * @param {number} [over=0] - OVER mode (XOR) - not fully implemented due to Canvas limitations
 */
function renderBlockGraphic(ctx, borderOffset, x, y, charCode, ink, over = 0) {
  // Block graphics: character code 0x80 + pattern
  // ZX Spectrum block graphic encoding (from character table):
  // 0x81 = ▝ (top-right)     -> bit 0 = top-right
  // 0x82 = ▘ (top-left)      -> bit 1 = top-left
  // 0x84 = ▗ (bottom-right)  -> bit 2 = bottom-right
  // 0x88 = ▖ (bottom-left)   -> bit 3 = bottom-left
  const pattern = charCode & 0x0F;
  const halfWidth = 4 * zoom;
  const halfHeight = 4 * zoom;

  ctx.fillStyle = ink;

  // Top-left quadrant (bit 1)
  if (pattern & 0x02) {
    ctx.fillRect(borderOffset + x * zoom, borderOffset + y * zoom, halfWidth, halfHeight);
  }
  // Top-right quadrant (bit 0)
  if (pattern & 0x01) {
    ctx.fillRect(borderOffset + x * zoom + halfWidth, borderOffset + y * zoom, halfWidth, halfHeight);
  }
  // Bottom-left quadrant (bit 3)
  if (pattern & 0x08) {
    ctx.fillRect(borderOffset + x * zoom, borderOffset + y * zoom + halfHeight, halfWidth, halfHeight);
  }
  // Bottom-right quadrant (bit 2)
  if (pattern & 0x04) {
    ctx.fillRect(borderOffset + x * zoom + halfWidth, borderOffset + y * zoom + halfHeight, halfWidth, halfHeight);
  }
}

/**
 * Renders a BMC4 format screen (border + 8x4 multicolor)
 * Like BSC but with 8x4 attributes instead of 8x8
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function renderBmc4Screen(ctx) {
  // BMC4 uses same frame size as BSC
  const frameWidth = BSC.FRAME_WIDTH * zoom;
  const frameHeight = BSC.FRAME_HEIGHT * zoom;

  // Update canvas size
  screenCanvas.width = frameWidth;
  screenCanvas.height = frameHeight;

  // Fill with black initially
  ctx.fillStyle = ZX_PALETTE.REGULAR[0];
  ctx.fillRect(0, 0, frameWidth, frameHeight);

  // Render border (same as BSC but with different data offset)
  renderBmc4Border(ctx);

  // Render main screen with 8x4 multicolor
  renderBmc4MainScreen(ctx, BSC.BORDER_LEFT_PX * zoom, BSC.BORDER_TOP_PX * zoom);
}

/**
 * Creates the border-rendering helpers shared by BMC4 and BSC renderers.
 * Both formats use identical per-byte segment painting (24 px per color),
 * optional clipping to the border region (outside the 256×192 main bitmap)
 * and a checkerboard pattern for transparent cells when a layer mask is active.
 * @param {CanvasRenderingContext2D} ctx
 * @returns {{
 *   drawColorSegment: (color: string, startX: number, endX: number, screenY: number, clipToBorder: boolean, maskIdx: number) => void,
 *   drawBorderLine:   (lineOffset: number, screenY: number, clipToBorder: boolean, byteCount: number, maskBaseIdx: number) => void,
 *   drawSideBorderLine: (lineOffset: number, screenY: number, maskBaseIdx: number) => void
 * }}
 */
function createBorderRenderers(ctx) {
  const pxPerColor = BSC.PIXELS_PER_COLOR;
  const bitmapLeft = BSC.BORDER_LEFT_PX;
  const bitmapRight = bitmapLeft + SCREEN.WIDTH;
  const hasBorderMask = typeof borderTransparencyMask !== 'undefined' && borderTransparencyMask &&
                        typeof layersEnabled !== 'undefined' && layersEnabled;

  function drawColorSegment(color, startX, endX, screenY, clipToBorder, maskIdx) {
    let drawStartX = startX;
    let drawEndX = endX;

    if (clipToBorder) {
      if (endX <= bitmapLeft) {
        // Fully in left border
      } else if (startX >= bitmapRight) {
        // Fully in right border
      } else if (startX < bitmapLeft && endX > bitmapLeft) {
        drawEndX = bitmapLeft;
      } else if (startX < bitmapRight && endX > bitmapRight) {
        drawStartX = bitmapRight;
      } else {
        // Entirely under bitmap - skip
        return;
      }
    }

    if (hasBorderMask && !borderTransparencyMask[maskIdx]) {
      drawBorderCheckerboard(ctx, drawStartX, screenY, drawEndX - drawStartX);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(drawStartX * zoom, screenY * zoom, (drawEndX - drawStartX) * zoom, zoom);
    }
  }

  function drawBorderLine(lineOffset, screenY, clipToBorder, byteCount, maskBaseIdx) {
    let x = 0;
    for (let byteIdx = 0; byteIdx < byteCount; byteIdx++) {
      const byte = screenData[lineOffset + byteIdx];
      const { color1, color2 } = getBscColors(byte);
      const maskIdx = maskBaseIdx + byteIdx * 2;

      drawColorSegment(color1, x, x + pxPerColor, screenY, clipToBorder, maskIdx);
      x += pxPerColor;
      drawColorSegment(color2, x, x + pxPerColor, screenY, clipToBorder, maskIdx + 1);
      x += pxPerColor;
    }
  }

  function drawSideBorderLine(lineOffset, screenY, maskBaseIdx) {
    // Left border: 4 bytes = 64 pixels
    let x = 0;
    for (let byteIdx = 0; byteIdx < 4; byteIdx++) {
      const byte = screenData[lineOffset + byteIdx];
      const { color1, color2 } = getBscColors(byte);
      const maskIdx = maskBaseIdx + byteIdx * 2;

      drawColorSegment(color1, x, x + pxPerColor, screenY, false, maskIdx);
      x += pxPerColor;
      drawColorSegment(color2, x, x + pxPerColor, screenY, false, maskIdx + 1);
      x += pxPerColor;
    }
    // Right border: 4 bytes = 64 pixels at x = bitmapRight
    x = bitmapRight;
    for (let byteIdx = 4; byteIdx < 8; byteIdx++) {
      const byte = screenData[lineOffset + byteIdx];
      const { color1, color2 } = getBscColors(byte);
      const maskIdx = maskBaseIdx + byteIdx * 2;

      drawColorSegment(color1, x, x + pxPerColor, screenY, false, maskIdx);
      x += pxPerColor;
      drawColorSegment(color2, x, x + pxPerColor, screenY, false, maskIdx + 1);
      x += pxPerColor;
    }
  }

  return { drawColorSegment, drawBorderLine, drawSideBorderLine };
}

/**
 * Renders the border for BMC4 format (same structure as BSC)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function renderBmc4Border(ctx) {
  const borderDataStart = BMC4.BORDER_OFFSET;
  const bitmapTop = BSC.BORDER_TOP_PX;
  const { drawBorderLine, drawSideBorderLine } = createBorderRenderers(ctx);

  let dataOffset = 0;
  let maskOffset = 0;

  // Top border: 64 lines × 24 bytes
  for (let screenY = 0; screenY < BSC.BORDER_TOP_PX; screenY++) {
    drawBorderLine(borderDataStart + dataOffset, screenY, false, BSC.BYTES_PER_FULL_LINE, maskOffset);
    dataOffset += BSC.BYTES_PER_FULL_LINE;
    maskOffset += BSC.BYTES_PER_FULL_LINE * 2;
  }

  // Side borders: 192 lines × 8 bytes
  for (let screenY = 0; screenY < BSC.BORDER_SIDE_PX; screenY++) {
    drawSideBorderLine(borderDataStart + dataOffset, bitmapTop + screenY, maskOffset);
    dataOffset += BSC.BYTES_PER_SIDE_LINE;
    maskOffset += BSC.BYTES_PER_SIDE_LINE * 2;
  }

  // Bottom border: 48 lines × 24 bytes
  const bottomStartY = bitmapTop + SCREEN.HEIGHT;
  for (let screenY = 0; screenY < BSC.BORDER_BOTTOM_PX; screenY++) {
    drawBorderLine(borderDataStart + dataOffset, bottomStartY + screenY, false, BSC.BYTES_PER_FULL_LINE, maskOffset);
    dataOffset += BSC.BYTES_PER_FULL_LINE;
    maskOffset += BSC.BYTES_PER_FULL_LINE * 2;
  }
}

/**
 * Renders the main screen for BMC4 with 8x4 multicolor attributes
 * Layout: bitmap + attr1 (lines 0-3) + border + attr2 (lines 4-7)
 * Both attr blocks use standard SCR attribute layout (768 bytes, 24 rows × 32 cols)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} offsetX - X offset in canvas pixels
 * @param {number} offsetY - Y offset in canvas pixels
 */
function renderBmc4MainScreen(ctx, offsetX, offsetY) {
  // Create ImageData at 1:1 scale
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  // Process each pixel line from 0 to 191
  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    // Calculate bitmap address using ZX Spectrum interleaved layout
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const bitmapBase = third * 2048 + charRow * 32 + pixelLine * 256;

    // Character row in screen (0-23)
    const screenCharRow = third * 8 + charRow;

    // Which attribute block: lines 0-3 use attr1, lines 4-7 use attr2
    const attrOffset = (pixelLine < 4) ? BMC4.ATTR1_OFFSET : BMC4.ATTR2_OFFSET;
    // Standard attribute address within block
    const attrBase = attrOffset + screenCharRow * 32;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const byte = screenData[bitmapBase + col];
      const attr = screenData[attrBase + col];
      let inkRgb, paperRgb;
      if (showAttributes) {
        ({ inkRgb, paperRgb } = getColorsRgb(attr));
      } else {
        inkRgb = [0, 0, 0];
        paperRgb = [255, 255, 255];
      }

      const x = col * 8;
      for (let bit = 0; bit < 8; bit++) {
        const px = x + bit;
        const maskIdx = y * SCREEN.WIDTH + px;
        const rgb = isPixelTransparent(maskIdx)
          ? getCheckerboardColor(px, y)
          : (isBitSet(byte, bit) ? inkRgb : paperRgb);
        const pixelIndex = maskIdx * 4;
        data[pixelIndex] = rgb[0];
        data[pixelIndex + 1] = rgb[1];
        data[pixelIndex + 2] = rgb[2];
        data[pixelIndex + 3] = 255;
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, offsetX, offsetY, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Gets two border colors from a BSC byte
 * Bits 2-0: first color (8 pixels), bits 5-3: second color (next 8 pixels)
 * @param {number} byte - Border data byte
 * @returns {{color1: string, color2: string}} Two color CSS values
 */
function getBscColors(byte) {
  const color1Index = byte & 0x07;          // bits 2-0 (first)
  const color2Index = (byte >> 3) & 0x07;   // bits 5-3 (second)
  // Use regular (non-bright) palette for border
  return {
    color1: ZX_PALETTE.REGULAR[color1Index],
    color2: ZX_PALETTE.REGULAR[color2Index]
  };
}

/**
 * Renders BSC format screen with per-line border colors
 * BSC = standard SCR (6912 bytes) + border data (4224 bytes)
 * Border data: 176 lines × 24 bytes per line
 * Each byte: bits 2-0 = first color (8px), bits 5-3 = second color (8px)
 * So each byte covers 16 pixels, 24 bytes = 384 pixels per line
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function renderBscScreen(ctx) {
  // BSC uses full frame size
  const frameWidth = BSC.FRAME_WIDTH * zoom;
  const frameHeight = BSC.FRAME_HEIGHT * zoom;

  // Update canvas size for BSC
  screenCanvas.width = frameWidth;
  screenCanvas.height = frameHeight;

  // Fill with black initially
  ctx.fillStyle = ZX_PALETTE.REGULAR[0];
  ctx.fillRect(0, 0, frameWidth, frameHeight);

  const borderDataStart = BSC.BORDER_OFFSET;
  const bitmapLeft = BSC.BORDER_LEFT_PX;   // 64 pixels
  const bitmapTop = BSC.BORDER_TOP_PX;     // 64 pixels

  const { drawBorderLine, drawSideBorderLine } = createBorderRenderers(ctx);

  let dataOffset = 0;
  let maskOffset = 0;

  // === TOP BORDER: 64 lines × 24 bytes, 1:1 mapping ===
  for (let screenY = 0; screenY < BSC.BORDER_TOP_PX; screenY++) {
    const lineOffset = borderDataStart + dataOffset;
    drawBorderLine(lineOffset, screenY, false, BSC.BYTES_PER_FULL_LINE, maskOffset);
    dataOffset += BSC.BYTES_PER_FULL_LINE;
    maskOffset += BSC.BYTES_PER_FULL_LINE * 2;
  }

  // === SIDE BORDERS: 192 lines × 8 bytes (4 left + 4 right), 1:1 mapping ===
  for (let screenY = 0; screenY < BSC.BORDER_SIDE_PX; screenY++) {
    const lineOffset = borderDataStart + dataOffset;
    drawSideBorderLine(lineOffset, bitmapTop + screenY, maskOffset);
    dataOffset += BSC.BYTES_PER_SIDE_LINE;
    maskOffset += BSC.BYTES_PER_SIDE_LINE * 2;
  }

  // === BOTTOM BORDER: 48 lines × 24 bytes, 1:1 mapping ===
  const bottomStartY = bitmapTop + SCREEN.HEIGHT;
  for (let screenY = 0; screenY < BSC.BORDER_BOTTOM_PX; screenY++) {
    const lineOffset = borderDataStart + dataOffset;
    drawBorderLine(lineOffset, bottomStartY + screenY, false, BSC.BYTES_PER_FULL_LINE, maskOffset);
    dataOffset += BSC.BYTES_PER_FULL_LINE;
    maskOffset += BSC.BYTES_PER_FULL_LINE * 2;
  }

  // === MAIN SCREEN (drawn on top of border) ===
  renderBscMainScreen(ctx, bitmapLeft * zoom, bitmapTop * zoom);
}

/**
 * Renders the main screen area for BSC at specified offset
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} offsetX - X offset in canvas pixels
 * @param {number} offsetY - Y offset in canvas pixels
 */
function renderBscMainScreen(ctx, offsetX, offsetY) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  // Render three thirds of the screen
  for (let third = 0; third < 3; third++) {
    const bitmapAddr = third * 2048;
    const attrAddr = 6144 + third * 256;
    const yOffset = third * 64;

    for (let line = 0; line < 8; line++) {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
          const bitmapOffset = bitmapAddr + col + row * 32 + line * 256;
          const byte = screenData[bitmapOffset];

          const attrOffset = attrAddr + col + row * 32;
          const attr = screenData[attrOffset];
          let inkRgb, paperRgb;
          if (showAttributes) {
            ({ inkRgb, paperRgb } = getColorsRgb(attr));
          } else {
            inkRgb = [0, 0, 0];
            paperRgb = [255, 255, 255];
          }

          const x = col * 8;
          const y = yOffset + row * 8 + line;
          for (let bit = 0; bit < 8; bit++) {
            const px = x + bit;
            const maskIdx = y * SCREEN.WIDTH + px;
            const rgb = isPixelTransparent(maskIdx)
              ? getCheckerboardColor(px, y)
              : (isBitSet(byte, bit) ? inkRgb : paperRgb);
            const pixelIndex = maskIdx * 4;
            data[pixelIndex] = rgb[0];
            data[pixelIndex + 1] = rgb[1];
            data[pixelIndex + 2] = rgb[2];
            data[pixelIndex + 3] = 255;
          }
        }
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  ctx.drawImage(temp.canvas, offsetX, offsetY, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders BSP gigascreen + border.
 * Draws BSC-style border frame (384×304) and renders main screen area (256×192)
 * using gigascreen average/flicker blending from the current Picture's two planes.
 * Border data comes from screenData[6912..] (BSC raw format).
 * @param {CanvasRenderingContext2D} ctx
 */
function renderBspGigaBorder(ctx) {
  if (!currentPicture) return;
  const pic = currentPicture;

  // Sync picture from screenData so edits are visible
  if (typeof syncPictureFromScreenData === 'function') {
    syncPictureFromScreenData(screenData, pic);
  }

  const frameWidth = BSC.FRAME_WIDTH * zoom;
  const frameHeight = BSC.FRAME_HEIGHT * zoom;
  screenCanvas.width = frameWidth;
  screenCanvas.height = frameHeight;

  ctx.fillStyle = ZX_PALETTE.REGULAR[0];
  ctx.fillRect(0, 0, frameWidth, frameHeight);

  // --- Draw border from picture.border (PictureBorder object) ---
  const border = pic.border;
  const pxPerColor = BSC.PIXELS_PER_COLOR;
  const bitmapLeft = BSC.BORDER_LEFT_PX;
  const bitmapRight = bitmapLeft + SCREEN.WIDTH;

  function drawBorderSegment(color, startX, endX, screenY) {
    if (startX >= endX) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(startX * zoom), Math.round(screenY * zoom),
                 Math.round((endX - startX) * zoom), zoom);
  }

  function drawFullBorderLineFromBuf(buf, bufOffset, screenY) {
    let x = 0;
    for (let byteIdx = 0; byteIdx < BSC.BYTES_PER_FULL_LINE; byteIdx++) {
      const byte = buf[bufOffset + byteIdx];
      const c1 = byte & 7;
      const c2 = (byte >> 3) & 7;
      drawBorderSegment(ZX_PALETTE.REGULAR[c1], x, x + pxPerColor, screenY);
      x += pxPerColor;
      drawBorderSegment(ZX_PALETTE.REGULAR[c2], x, x + pxPerColor, screenY);
      x += pxPerColor;
    }
  }

  function drawSideBorderLineFromBuf(buf, bufOffset, screenY) {
    let x = 0;
    for (let byteIdx = 0; byteIdx < 4; byteIdx++) {
      const byte = buf[bufOffset + byteIdx];
      const c1 = byte & 7;
      const c2 = (byte >> 3) & 7;
      drawBorderSegment(ZX_PALETTE.REGULAR[c1], x, x + pxPerColor, screenY);
      x += pxPerColor;
      drawBorderSegment(ZX_PALETTE.REGULAR[c2], x, x + pxPerColor, screenY);
      x += pxPerColor;
    }
    x = bitmapRight;
    for (let byteIdx = 4; byteIdx < 8; byteIdx++) {
      const byte = buf[bufOffset + byteIdx];
      const c1 = byte & 7;
      const c2 = (byte >> 3) & 7;
      drawBorderSegment(ZX_PALETTE.REGULAR[c1], x, x + pxPerColor, screenY);
      x += pxPerColor;
      drawBorderSegment(ZX_PALETTE.REGULAR[c2], x, x + pxPerColor, screenY);
      x += pxPerColor;
    }
  }

  if (border) {
    // Top border: 64 lines × 24 bytes
    for (let line = 0; line < 64; line++) {
      drawFullBorderLineFromBuf(border.top, line * 24, line);
    }
    // Side borders: 192 lines × 8 bytes
    for (let line = 0; line < 192; line++) {
      drawSideBorderLineFromBuf(border.sides, line * 8, 64 + line);
    }
    // Bottom border: 48 lines × 24 bytes
    for (let line = 0; line < 48; line++) {
      drawFullBorderLineFromBuf(border.bottom, line * 24, 256 + line);
    }
  }

  // --- Draw main screen as gigascreen ---
  const cols = pic.cols;
  const width = pic.width;
  const height = pic.height;
  const attrCellH = pic.attrCellHeight;
  const imageData = ctx.createImageData(width, height);
  const idata = imageData.data;

  const isFlicker = gigascreenMode === GIGASCREEN_MODE.FLICKER && gigascreenFlickerFrameId !== null;

  if (isFlicker) {
    const plane = pic.planes[gigascreenFlickerPhase];
    const bitmap = plane.bitmap;
    const attrs = plane.attrs;
    for (let y = 0; y < height; y++) {
      const attrRow = attrCellH > 0 ? Math.floor(y / attrCellH) : (y >> 3);
      for (let col = 0; col < cols; col++) {
        const byte = bitmap[y * cols + col];
        const attr = attrs[attrRow * cols + col];
        const { inkRgb, paperRgb } = getColorsRgb(attr);
        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const pixelIndex = (y * width + px) * 4;
          const rgb = (byte & (0x80 >> bit)) ? inkRgb : paperRgb;
          idata[pixelIndex] = rgb[0];
          idata[pixelIndex + 1] = rgb[1];
          idata[pixelIndex + 2] = rgb[2];
          idata[pixelIndex + 3] = 255;
        }
      }
    }
  } else {
    const darkMul = gigascreenMode === GIGASCREEN_MODE.BLEND_DARK ? CRT_DARK_FACTOR : 1;
    const bm1 = pic.planes[0].bitmap;
    const at1 = pic.planes[0].attrs;
    const bm2 = pic.planes[1].bitmap;
    const at2 = pic.planes[1].attrs;
    for (let y = 0; y < height; y++) {
      const attrRow = attrCellH > 0 ? Math.floor(y / attrCellH) : (y >> 3);
      for (let col = 0; col < cols; col++) {
        const byte1 = bm1[y * cols + col];
        const byte2 = bm2[y * cols + col];
        const colors1 = getColorsRgb(at1[attrRow * cols + col]);
        const colors2 = getColorsRgb(at2[attrRow * cols + col]);
        const x = col * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          const pixelIndex = (y * width + px) * 4;
          const mask = 0x80 >> bit;
          const rgb1 = (byte1 & mask) ? colors1.inkRgb : colors1.paperRgb;
          const rgb2 = (byte2 & mask) ? colors2.inkRgb : colors2.paperRgb;
          idata[pixelIndex] = Math.round((rgb1[0] + rgb2[0]) / 2 * darkMul);
          idata[pixelIndex + 1] = Math.round((rgb1[1] + rgb2[1]) / 2 * darkMul);
          idata[pixelIndex + 2] = Math.round((rgb1[2] + rgb2[2]) / 2 * darkMul);
          idata[pixelIndex + 3] = 255;
        }
      }
    }
  }

  const temp = getTempRenderCanvas(width, height);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  const offsetX = BSC.BORDER_LEFT_PX * zoom;
  const offsetY = BSC.BORDER_TOP_PX * zoom;
  ctx.drawImage(temp.canvas, offsetX, offsetY, width * zoom, height * zoom);
}

// ============================================================================
// SCA Animation Functions
// ============================================================================

/**
 * Parses SCA file header and validates format
 * @param {Uint8Array} data - Raw file data
 * @returns {{version: number, width: number, height: number, borderColor: number, frameCount: number, payloadType: number, payloadOffset: number, frameDataStart: number, frameSize: number, delays: Uint8Array, fillPattern: Uint8Array|null}|null} Parsed header or null if invalid
 */
function parseScaHeader(data) {
  if (data.length < SCA.HEADER_SIZE) {
    return null;
  }

  // Check signature "SCA"
  const sig = String.fromCharCode(data[0], data[1], data[2]);
  if (sig !== SCA.SIGNATURE) {
    return null;
  }

  const version = data[3];

  // Check version - v0 and v1 are supported
  if (version !== 0 && version !== 1) {
    alert(`Warning: This SCA file is version ${version}, but only versions 0 and 1 are supported. The animation may not display correctly.`);
  }
  const width = data[4] | (data[5] << 8);
  const height = data[6] | (data[7] << 8);
  const borderColorSuggestion = data[8] & 0x07;
  const frameCount = data[9] | (data[10] << 8);
  const payloadType = data[11];
  const payloadOffset = data[12] | (data[13] << 8);

  // Validate
  if (frameCount === 0 || (payloadType !== 0 && payloadType !== 1)) {
    return null; // Only payload types 0 and 1 are supported
  }

  // Delay table starts at payloadOffset
  const delayTableStart = payloadOffset;
  const delays = data.slice(delayTableStart, delayTableStart + frameCount);

  /** @type {Uint8Array|null} */
  let fillPattern = null;
  let frameDataStart;
  let frameSize;

  if (payloadType === 0) {
    // Type 0: Full screen frames (6912 bytes each)
    // Frame data starts after delay table
    frameDataStart = payloadOffset + frameCount;
    frameSize = SCA.FRAME_SIZE;
  } else {
    // Type 1: Attribute-only frames (768 bytes each)
    // Fill pattern (8 bytes) follows delay table, then frame data
    const fillPatternStart = payloadOffset + frameCount;
    fillPattern = data.slice(fillPatternStart, fillPatternStart + SCA.FILL_PATTERN_SIZE);
    frameDataStart = fillPatternStart + SCA.FILL_PATTERN_SIZE;
    frameSize = SCA.ATTR_FRAME_SIZE;
  }

  // Validate that we have enough data for all frames
  const expectedSize = frameDataStart + (frameCount * frameSize);
  if (data.length < expectedSize) {
    return null;
  }

  return {
    version,
    width,
    height,
    borderColor: borderColorSuggestion,
    frameCount,
    payloadType,
    payloadOffset,
    frameDataStart,
    frameSize,
    delays,
    fillPattern
  };
}

/**
 * Gets the data offset for a specific frame in SCA file
 * @param {number} frameIndex - Frame index (0-based)
 * @returns {number} Byte offset in screenData
 */
function getScaFrameOffset(frameIndex) {
  if (!scaHeader) return 0;
  return scaHeader.frameDataStart + (frameIndex * scaHeader.frameSize);
}

/**
 * Renders an SCA animation frame using the existing SCR rendering logic
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 * @param {number} frameIndex - Frame index to render
 */
function renderScaFrame(ctx, borderOffset, frameIndex) {
  if (!scaHeader) return;

  const frameOffset = getScaFrameOffset(frameIndex);

  // Create ImageData for the frame
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

  if (scaHeader.payloadType === 1 && scaHeader.fillPattern) {
    // Payload type 1: attribute-only frames with fill pattern
    // fillPattern is 8 bytes, one per row within each 8x8 cell
    // Frame data is 768 bytes of attributes (32x24 cells)
    const fillPattern = getSelectedPattern(scaHeader.fillPattern);

    // Precompute ink ratio for blend mode
    let inkRatio = 0;
    if (attr53cBlend) {
      let inkBitCount = 0;
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          if (fillPattern[py] & (1 << (7 - px))) inkBitCount++;
        }
      }
      inkRatio = inkBitCount / 64;
    }

    for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const attrOffset = frameOffset + col + row * 32;
        const attr = screenData[attrOffset];
        let inkRgb, paperRgb;
        if (showAttributes) {
          ({ inkRgb, paperRgb } = getColorsRgb(attr));
        } else {
          inkRgb = [0, 0, 0];
          paperRgb = [255, 255, 255];
        }

        // Draw 8x8 cell using fill pattern
        const cellX = col * 8;
        const cellY = row * 8;

        if (attr53cBlend) {
          // Blend mode: solid averaged color per cell
          const br = Math.round(inkRgb[0] * inkRatio + paperRgb[0] * (1 - inkRatio));
          const bg = Math.round(inkRgb[1] * inkRatio + paperRgb[1] * (1 - inkRatio));
          const bb = Math.round(inkRgb[2] * inkRatio + paperRgb[2] * (1 - inkRatio));
          for (let py = 0; py < 8; py++) {
            const rowOff = (cellY + py) * SCREEN.WIDTH;
            for (let px = 0; px < 8; px++) {
              const pixelIndex = (rowOff + cellX + px) * 4;
              data[pixelIndex] = br;
              data[pixelIndex + 1] = bg;
              data[pixelIndex + 2] = bb;
              data[pixelIndex + 3] = 255;
            }
          }
        } else {
          // Pattern mode: original per-pixel rendering
          for (let py = 0; py < 8; py++) {
            const patternByte = fillPattern[py];
            for (let px = 0; px < 8; px++) {
              const bit = 7 - px; // MSB first
              const isInk = (patternByte & (1 << bit)) !== 0;
              const rgb = isInk ? inkRgb : paperRgb;

              const pixelIndex = ((cellY + py) * SCREEN.WIDTH + cellX + px) * 4;
              data[pixelIndex] = rgb[0];
              data[pixelIndex + 1] = rgb[1];
              data[pixelIndex + 2] = rgb[2];
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  } else {
    // Payload type 0: full screen frames (standard SCR format)
    // Process all three screen thirds (same as renderScrFast but with offset)
    const sections = [
      { bitmapAddr: 0, attrAddr: 6144, yOffset: 0 },
      { bitmapAddr: 2048, attrAddr: 6400, yOffset: 64 },
      { bitmapAddr: 4096, attrAddr: 6656, yOffset: 128 }
    ];

    for (const section of sections) {
      const { bitmapAddr, attrAddr, yOffset } = section;

      for (let line = 0; line < 8; line++) {
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
            const bitmapOffset = frameOffset + bitmapAddr + col + row * 32 + line * 256;
            const byte = screenData[bitmapOffset];

            const attrOffset = frameOffset + attrAddr + col + row * 32;
            const attr = screenData[attrOffset];
            let inkRgb, paperRgb;
            if (showAttributes) {
              ({ inkRgb, paperRgb } = getColorsRgb(attr));
            } else {
              inkRgb = [0, 0, 0];
              paperRgb = [255, 255, 255];
            }

            const x = col * 8;
            const y = yOffset + row * 8 + line;

            for (let bit = 0; bit < 8; bit++) {
              const rgb = isBitSet(byte, bit) ? inkRgb : paperRgb;
              const pixelIndex = ((y * SCREEN.WIDTH) + x + bit) * 4;
              data[pixelIndex] = rgb[0];
              data[pixelIndex + 1] = rgb[1];
              data[pixelIndex + 2] = rgb[2];
              data[pixelIndex + 3] = 255;
            }
          }
        }
      }
    }
  }

  // Put the 1:1 image onto a temporary canvas (reused for performance)
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;

  temp.ctx.putImageData(imageData, 0, 0);

  // Scale and draw to main canvas
  applyRenderSmoothing(ctx);
  ctx.drawImage(
    temp.canvas,
    0, 0, SCREEN.WIDTH, SCREEN.HEIGHT,
    borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom
  );
}

/**
 * Starts SCA animation playback
 */
function startScaAnimation() {
  if (!scaHeader || scaPlaying) return;

  scaPlaying = true;
  scheduleNextScaFrame();
  updateScaControls();
}

/**
 * Stops SCA animation playback
 */
function stopScaAnimation() {
  scaPlaying = false;
  if (scaTimerId !== null) {
    clearTimeout(scaTimerId);
    scaTimerId = null;
  }
  updateScaControls();
}

/**
 * Toggles SCA animation playback
 */
function toggleScaAnimation() {
  if (scaPlaying) {
    stopScaAnimation();
  } else {
    startScaAnimation();
  }
}

/**
 * Schedules the next frame in SCA animation
 */
function scheduleNextScaFrame() {
  if (!scaHeader || !scaPlaying) return;

  // Get delay for current frame
  const delay = scaHeader.delays[scaCurrentFrame] * SCA.DELAY_UNIT_MS;

  scaTimerId = setTimeout(() => {
    // Advance to next frame
    scaCurrentFrame = (scaCurrentFrame + 1) % scaHeader.frameCount;
    renderScreen();
    updateScaControls();
    updateAnimationInfo();

    // Schedule next frame if still playing
    if (scaPlaying) {
      scheduleNextScaFrame();
    }
  }, delay || SCA.DELAY_UNIT_MS); // Use at least 1 delay unit if delay is 0
}

/**
 * Goes to a specific SCA frame
 * @param {number} frameIndex - Frame index to go to
 */
function goToScaFrame(frameIndex) {
  if (!scaHeader) return;

  // Clamp to valid range
  scaCurrentFrame = Math.max(0, Math.min(frameIndex, scaHeader.frameCount - 1));
  renderScreen();
  updateScaControls();
  updateAnimationInfo();
}

/**
 * Goes to previous SCA frame
 */
function prevScaFrame() {
  if (!scaHeader) return;
  goToScaFrame((scaCurrentFrame - 1 + scaHeader.frameCount) % scaHeader.frameCount);
}

/**
 * Goes to next SCA frame
 */
function nextScaFrame() {
  if (!scaHeader) return;
  goToScaFrame((scaCurrentFrame + 1) % scaHeader.frameCount);
}

/**
 * Updates SCA animation controls display
 */
function updateScaControls() {
  const playBtn = document.getElementById('scaPlayBtn');
  const frameSlider = /** @type {HTMLInputElement} */ (document.getElementById('scaFrameSlider'));
  const frameInfo = document.getElementById('scaFrameInfo');

  if (playBtn) {
    playBtn.textContent = scaPlaying ? 'Pause' : 'Play';
  }

  if (frameSlider && scaHeader) {
    frameSlider.max = String(scaHeader.frameCount - 1);
    frameSlider.value = String(scaCurrentFrame);
  }

  if (frameInfo && scaHeader) {
    frameInfo.textContent = `Frame ${scaCurrentFrame + 1}/${scaHeader.frameCount}`;
  }
}

/**
 * Shows/hides SCA controls based on current format
 */
function toggleScaControlsVisibility() {
  const scaControls = document.getElementById('scaControls');
  if (scaControls) {
    scaControls.style.display = (currentFormat === FORMAT.SCA) ? 'flex' : 'none';
  }
}

/**
 * Shows/hides format-specific controls (pattern, font, editor) based on current format
 */
function toggleFormatControlsVisibility() {
  const pattern53cControls = document.getElementById('pattern53cControls');
  if (pattern53cControls) {
    const isScaType1 = currentFormat === FORMAT.SCA && scaHeader && scaHeader.payloadType === 1;
    const showPattern = currentFormat === FORMAT.ATTR_53C || isScaType1;
    pattern53cControls.style.display = showPattern ? 'flex' : 'none';
    // Show/hide "File" option (only for SCA type 1 with embedded pattern)
    const patternSelect = /** @type {HTMLSelectElement} */ (document.getElementById('pattern53cSelect'));
    if (patternSelect) {
      const fileOption = patternSelect.querySelector('option[value="file"]');
      if (fileOption) {
        /** @type {HTMLElement} */ (fileOption).style.display = isScaType1 ? '' : 'none';
      }
      if (isScaType1 && patternSelect.value !== 'file') {
        patternSelect.value = 'file';
      }
    }
  }
  const rgb3Controls = document.getElementById('rgb3Controls');
  if (rgb3Controls) {
    rgb3Controls.style.display = (currentFormat === FORMAT.RGB3) ? 'flex' : 'none';
  }
  // Handle RGB3 mode: stop flicker when switching away, start if mode is flicker when switching to
  if (currentFormat !== FORMAT.RGB3) {
    if (rgb3FlickerFrameId !== null) {
      stopRgb3Flicker();
    }
  } else {
    // Switching to RGB3: sync mode from dropdown
    const modeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('rgb3ModeSelect'));
    if (modeSelect) {
      rgb3Mode = modeSelect.value;
    }
    if (rgb3Mode === 'flicker' && rgb3FlickerFrameId === null) {
      startRgb3Flicker();
    }
  }
  const isGigascreenFormat = currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH ||
    currentFormat === FORMAT.HLR || currentFormat === FORMAT.STL ||
    (currentFormat === FORMAT.CHR && currentPicture && currentPicture.colorMode === 'gigascreen');
  const gigascreenControls = document.getElementById('gigascreenControls');
  if (gigascreenControls) {
    gigascreenControls.style.display = isGigascreenFormat ? 'flex' : 'none';
  }
  // Handle Gigascreen flicker: stop when switching away, start if mode is flicker when switching to
  if (!isGigascreenFormat) {
    if (gigascreenFlickerFrameId !== null) {
      stopGigascreenFlicker();
    }
  } else {
    // Switching to Gigascreen: start flicker if mode is flicker
    const modeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('gigascreenModeSelect'));
    if (modeSelect) {
      gigascreenMode = modeSelect.value;
    }
    if (gigascreenMode === GIGASCREEN_MODE.FLICKER && gigascreenFlickerFrameId === null) {
      startGigascreenFlicker();
    }
  }
  const fontControls = document.getElementById('fontControls');
  if (fontControls) {
    fontControls.style.display = (currentFormat === FORMAT.SPECSCII) ? 'flex' : 'none';
  }
  const scrEditorControls = document.getElementById('scrEditorControls');
  if (scrEditorControls) {
    scrEditorControls.style.display = (currentFormat === FORMAT.SCR || currentFormat === FORMAT.SCR_ULAPLUS || currentFormat === FORMAT.ATTR_53C || currentFormat === FORMAT.BSC || currentFormat === FORMAT.IFL || currentFormat === FORMAT.MLT || currentFormat === FORMAT.BMC4 || currentFormat === FORMAT.RGB3 || currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3 || currentFormat === FORMAT.ZXP || currentFormat === FORMAT.CHR) ? 'flex' : 'none';
  }
  // Hide palette/flash/attrs controls for NXI/SL2 (no ZX attributes or palette)
  const isNextLayer2 = currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2 || currentFormat === FORMAT.LORES || currentFormat === FORMAT.LORES_RAD;
  const paletteLabel = document.getElementById('paletteLabel');
  if (paletteLabel) {
    paletteLabel.style.display = isNextLayer2 ? 'none' : '';
  }
  const flashLabel = document.getElementById('flashLabel');
  if (flashLabel) {
    flashLabel.style.display = isNextLayer2 ? 'none' : '';
  }
  const attrsLabel = document.getElementById('attrsLabel');
  if (attrsLabel) {
    attrsLabel.style.display = isNextLayer2 ? 'none' : '';
  }
  // Update ULA+ palette section visibility
  if (typeof updateUlaPlusSectionVisibility === 'function') {
    updateUlaPlusSectionVisibility();
  }
  // Update barcode section visibility (for border formats)
  if (typeof updateBarcodeVisibility === 'function') {
    updateBarcodeVisibility();
  }
  // Hide Sprites tab for formats that don't support ZX-style sprite extraction
  const spritesTab = document.querySelector('.panel-tab[data-tab="sprites"]');
  if (spritesTab) {
    const hideSprites = isNextLayer2 || currentFormat === FORMAT.SCA;
    /** @type {HTMLElement} */ (spritesTab).style.display = hideSprites ? 'none' : '';
    // If sprites tab was active and now hidden, switch to View tab
    if (hideSprites && spritesTab.classList.contains('active')) {
      const viewTab = document.querySelector('.panel-tab[data-tab="view"]');
      if (viewTab) /** @type {HTMLElement} */ (viewTab).click();
    }
  }
}

/**
 * Resets SCA animation state
 */
function resetScaState() {
  stopScaAnimation();
  scaHeader = null;
  scaCurrentFrame = 0;
}

/**
 * Initializes ULA+ mode from loaded screen data
 * @param {Uint8Array} data - The loaded file data
 * @param {string} format - The detected format
 */
function initUlaPlusMode(data, format) {
  if (format === FORMAT.SCR_ULAPLUS && data.length >= ULAPLUS.TOTAL_SIZE) {
    // Extract palette from the end of the file
    ulaPlusPalette = new Uint8Array(ULAPLUS.PALETTE_SIZE);
    for (let i = 0; i < ULAPLUS.PALETTE_SIZE; i++) {
      ulaPlusPalette[i] = data[ULAPLUS.PALETTE_OFFSET + i];
    }
    isUlaPlusMode = true;
    resetUlaNextMode(); // Mutual exclusion: ULA+ and ULANext cannot be active simultaneously
  } else {
    // Not ULA+ mode - reset state
    ulaPlusPalette = null;
    isUlaPlusMode = false;
  }

  // Update ULA+ palette UI if available
  if (typeof buildUlaPlusGrid === 'function') {
    buildUlaPlusGrid();
  }
  if (typeof buildUlaPlusClassic === 'function') {
    buildUlaPlusClassic();
  }
  if (typeof updateUlaPlusPalette === 'function') {
    updateUlaPlusPalette();
  }
}

/**
 * Resets ULA+ mode state
 */
function resetUlaPlusMode() {
  ulaPlusPalette = null;
  isUlaPlusMode = false;
}

/**
 * Resets ULANext mode state
 */
function resetUlaNextMode() {
  isUlaNextMode = false;
  ulaNextInkMask = 0;
  ulaNextInkBits = 0;
  ulaNextPalette = null;
  ulaNextInkCount = 0;
  ulaNextPaperCount = 0;
  ulaNextIs9bit = false;
}

/**
 * Counts the number of set bits (popcount) in a byte
 * @param {number} v - Byte value (0-255)
 * @returns {number} Number of set bits
 */
function popcount8(v) {
  v = v - ((v >> 1) & 0x55);
  v = (v & 0x33) + ((v >> 2) & 0x33);
  return (v + (v >> 4)) & 0x0F;
}

/**
 * Calculates the expected file size for a ULANext SCR with the given ink mask.
 * @param {number} mask - Ink mask byte
 * @returns {number} Expected total file size
 */
function getUlaNextFileSize(mask) {
  const inkBits = popcount8(mask);
  const inkCount = 1 << inkBits;
  const paperCount = 1 << (8 - inkBits);
  if (mask === 0xFF) {
    // Special case: 256 ink entries × 2 bytes + 1 paper entry × 1 byte = 513
    return 6912 + 1 + 256 * 2 + 1;
  }
  return 6912 + 1 + (inkCount + paperCount) * 2;
}

/**
 * Calculates the expected file size for a ULANext SCR with 1-byte (8-bit) palette entries.
 * @param {number} mask - Ink mask byte
 * @returns {number} Expected total file size
 */
function getUlaNextFileSize1b(mask) {
  const inkBits = popcount8(mask);
  const inkCount = 1 << inkBits;
  const paperCount = 1 << (8 - inkBits);
  // All entries are 1 byte (8-bit RRRGGGBB); for $FF paper is also 1 byte
  return 6912 + 1 + inkCount + paperCount;
}

/**
 * Decodes a single 8-bit RRRGGGBB palette byte to [r, g, b].
 * Blue is expanded from 2-bit to 3-bit using OR of the two bits (per Next spec).
 * @param {number} byte0 - 8-bit palette byte (RRRGGGBB)
 * @returns {number[]} RGB array [r, g, b] (0-255)
 */
function decodeUlaNext8bit(byte0) {
  const r3 = (byte0 >> 5) & 7;
  const g3 = (byte0 >> 2) & 7;
  const b2 = byte0 & 3;
  // Expand 2-bit blue to 3-bit: B1 B0 → B1 B0 (B1|B0)
  const b3 = (b2 << 1) | ((b2 >> 1) | (b2 & 1));
  return [
    Math.round(r3 * 255 / 7),
    Math.round(g3 * 255 / 7),
    Math.round(b3 * 255 / 7)
  ];
}

/**
 * Decodes a 9-bit RGB333 palette entry (2 bytes) to [r, g, b].
 * @param {number} byte0 - First byte (RRRGGGBB)
 * @param {number} byte1 - Second byte (LSB = B_lsb)
 * @returns {number[]} RGB array [r, g, b] (0-255)
 */
function decodeUlaNext9bit(byte0, byte1) {
  const r3 = (byte0 >> 5) & 7;
  const g3 = (byte0 >> 2) & 7;
  const b3 = ((byte0 & 3) << 1) | (byte1 & 1);
  return [
    Math.round(r3 * 255 / 7),
    Math.round(g3 * 255 / 7),
    Math.round(b3 * 255 / 7)
  ];
}

/**
 * Initializes ULANext mode from loaded screen data.
 * Parses the ink mask byte at offset 6912 and the palette that follows.
 * Supports both 1-byte (8-bit) and 2-byte (9-bit) palette entries.
 * @param {Uint8Array} data - The full file data (>6912 bytes)
 * @returns {boolean} True if ULANext mode was successfully initialized
 */
function initUlaNextMode(data) {
  resetUlaNextMode();
  resetUlaPlusMode();

  if (data.length < ULANEXT.MIN_FILE_SIZE) return false;

  const mask = data[ULANEXT.MASK_OFFSET];
  if (!ULANEXT.VALID_MASKS.includes(mask)) return false;

  // Determine if this is a 2-byte (9-bit) or 1-byte (8-bit) palette
  const expectedSize2b = getUlaNextFileSize(mask);
  const expectedSize1b = getUlaNextFileSize1b(mask);
  let is9bit;
  if (data.length === expectedSize2b) {
    is9bit = true;
  } else if (data.length === expectedSize1b) {
    is9bit = false;
  } else {
    return false; // File size doesn't match either format
  }

  const inkBits = popcount8(mask);
  const inkCount = 1 << inkBits;
  const paperCount = 1 << (8 - inkBits);

  ulaNextInkMask = mask;
  ulaNextInkBits = inkBits;
  ulaNextInkCount = inkCount;
  ulaNextPaperCount = paperCount;

  const totalEntries = inkCount + paperCount;
  ulaNextPalette = new Array(totalEntries);
  let offset = ULANEXT.PALETTE_OFFSET;

  if (mask === 0xFF && is9bit) {
    // 9-bit: 256 ink entries (2 bytes each) + 1 paper entry (1 byte, always 8-bit)
    for (let i = 0; i < 256; i++) {
      ulaNextPalette[i] = decodeUlaNext9bit(data[offset], data[offset + 1]);
      offset += 2;
    }
    ulaNextPalette[256] = decodeUlaNext8bit(data[offset]);
  } else if (is9bit) {
    // 9-bit: all entries are 2 bytes (RRRGGGBB + B_lsb)
    for (let i = 0; i < totalEntries; i++) {
      ulaNextPalette[i] = decodeUlaNext9bit(data[offset], data[offset + 1]);
      offset += 2;
    }
  } else {
    // 8-bit: all entries are 1 byte (RRRGGGBB)
    for (let i = 0; i < totalEntries; i++) {
      ulaNextPalette[i] = decodeUlaNext8bit(data[offset++]);
    }
  }

  isUlaNextMode = true;
  ulaNextIs9bit = is9bit;
  return true;
}

/**
 * Enables ULA+ mode with default or provided palette
 * @param {Uint8Array} [palette] - Optional palette, uses default if not provided
 */
function enableUlaPlusMode(palette) {
  ulaPlusPalette = palette || generateDefaultUlaPlusPalette();
  isUlaPlusMode = true;
  resetUlaNextMode(); // Mutual exclusion
}

/**
 * Gets the RGB color for a ULA+ palette entry
 * @param {number} index - Palette index (0-63)
 * @returns {number[]} RGB array [r, g, b]
 */
function getUlaPlusColor(index) {
  if (!ulaPlusPalette || index < 0 || index >= 64) {
    return [0, 0, 0];
  }
  return grb332ToRgb(ulaPlusPalette[index]);
}

/**
 * Gets the ULA+ palette index for a given attribute and pixel state
 * @param {number} attr - Attribute byte
 * @param {boolean} isInk - True for ink color, false for paper
 * @returns {number} Palette index (0-63)
 */
function getUlaPlusPaletteIndex(attr, isInk) {
  const ink = attr & 0x07;
  const paper = (attr >> 3) & 0x07;
  const bright = (attr >> 6) & 0x01;
  const flash = (attr >> 7) & 0x01;

  // CLUT selection: bits 7-6 of attribute (FLASH, BRIGHT)
  const clut = (flash << 1) | bright;
  const baseIdx = clut * ULAPLUS.CLUT_SIZE;

  // Within CLUT: 0-7 = INK colors, 8-15 = PAPER colors
  if (isInk) {
    return baseIdx + ink;
  } else {
    return baseIdx + 8 + paper;
  }
}

// ============================================================================
// ZIP File Handling
// ============================================================================

/** @type {string[]} - List of supported file extensions */
const SUPPORTED_EXTENSIONS = ['scr', 'rcs', '53c', 'atr', 'bsc', 'bsp', 'ifl', 'bmc4', 'mlt', 'mc', '3', 'img', 'mem', 'specscii', 'sca', 'sna', 'z80', 'btile', 'wtile', 'zxp', 'ch$', 'chr$', 'ch-', 'mg1', 'mg2', 'mg4', 'mg8', 'hlr', 'stl', 'nxi', 'sl2', 'slr', 'rad', 'zx7', 'zx7b', 'zx0', 'zx0b', 'lc', 'upk'];
const IMAGE_EXTENSIONS = ['png', 'gif', 'jpg', 'jpeg', 'webp', 'bmp'];

/** @type {JSZip|null} - Current loaded ZIP archive */
let currentZip = null;

/** @type {string} - Current ZIP file name */
let currentZipName = '';

/**
 * Checks if a filename has a supported extension
 * @param {string} fileName - The file name to check
 * @returns {boolean} True if the extension is supported
 */
function isSupportedFile(fileName) {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return SUPPORTED_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Checks if a file is an image file
 * @param {string} fileName - The file name to check
 * @returns {boolean} True if the file is an image
 */
function isImageFileExt(fileName) {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Checks if a file is a Nirvana tile file (.btile/.wtile)
 * @param {string} fileName - The file name to check
 * @returns {boolean} True if the file is a Nirvana tile file
 */
function isNirvanaTileFile(fileName) {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return ext === 'btile' || ext === 'wtile';
}

/**
 * Checks if a file is a ZIP archive
 * @param {string} fileName - The file name to check
 * @returns {boolean} True if the file is a ZIP
 */
function isZipFile(fileName) {
  return fileName.toLowerCase().endsWith('.zip');
}

/**
 * Gets supported files from a ZIP archive
 * @param {JSZip} zip - The JSZip instance
 * @returns {string[]} Array of supported file names in the archive
 */
function getSupportedFilesFromZip(zip) {
  const supportedFiles = [];
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && isSupportedFile(relativePath)) {
      supportedFiles.push(relativePath);
    }
  });
  // Sort alphabetically
  return supportedFiles.sort((a, b) => a.localeCompare(b));
}

/**
 * Shows the ZIP file selection modal with multi-select via ctrl/shift+click.
 * Click selects a single row; Ctrl+click toggles; Shift+click extends range;
 * double-click imports that row immediately. "Import" loads selected rows,
 * "Add All" loads everything listed.
 * @param {string[]} files - Array of file names to display
 * @param {function(string[]): void} onImportMany - Called with the list of file names to import
 */
function showZipFileModal(files, onImportMany) {
  const modal = document.getElementById('zipModal');
  const fileList = document.getElementById('zipFileList');
  const cancelBtn = document.getElementById('zipCancelBtn');
  const importBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('zipImportBtn'));
  const addAllBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('zipAddAllBtn'));

  if (!modal || !fileList || !cancelBtn || !importBtn || !addAllBtn) return;

  // Clear previous list
  fileList.innerHTML = '';

  /** @type {Set<number>} */
  const selected = new Set();
  /** @type {HTMLElement[]} */
  const rows = [];
  let lastClickedIndex = -1;

  const SELECTED_BG = 'var(--accent-primary, #3a7bd5)';
  const SELECTED_FG = '#fff';

  const paintRow = (i) => {
    const row = rows[i];
    if (!row) return;
    if (selected.has(i)) {
      row.style.background = SELECTED_BG;
      row.style.color = SELECTED_FG;
    } else {
      row.style.background = '';
      row.style.color = '';
    }
  };
  const paintAll = () => { for (let i = 0; i < rows.length; i++) paintRow(i); };

  const updateImportButton = () => {
    const count = selected.size;
    importBtn.disabled = count === 0;
    importBtn.textContent = count > 0 ? 'Import (' + count + ')' : 'Import';
  };

  files.forEach((fileName, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding: 6px 12px; cursor: pointer; border-bottom: 1px solid var(--border-secondary); user-select: none;';
    row.textContent = fileName;
    row.addEventListener('mouseenter', () => {
      if (!selected.has(idx)) row.style.background = 'var(--bg-secondary)';
    });
    row.addEventListener('mouseleave', () => {
      if (!selected.has(idx)) row.style.background = '';
    });
    row.addEventListener('click', (ev) => {
      if (ev.shiftKey && lastClickedIndex >= 0) {
        const lo = Math.min(lastClickedIndex, idx);
        const hi = Math.max(lastClickedIndex, idx);
        if (!ev.ctrlKey && !ev.metaKey) selected.clear();
        for (let i = lo; i <= hi; i++) selected.add(i);
      } else if (ev.ctrlKey || ev.metaKey) {
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
        lastClickedIndex = idx;
      } else {
        selected.clear();
        selected.add(idx);
        lastClickedIndex = idx;
      }
      paintAll();
      updateImportButton();
    });
    row.addEventListener('dblclick', () => {
      cleanup();
      if (typeof onImportMany === 'function') onImportMany([fileName]);
    });
    fileList.appendChild(row);
    rows.push(row);
  });

  updateImportButton();

  let isOpen = true;
  const cleanup = () => {
    if (!isOpen) return;
    isOpen = false;
    modal.style.display = 'none';
    cancelBtn.removeEventListener('click', handleCancel);
    importBtn.removeEventListener('click', handleImport);
    addAllBtn.removeEventListener('click', handleAddAll);
    document.removeEventListener('keydown', handleKey);
  };
  const handleCancel = () => cleanup();
  const handleImport = () => {
    const picks = Array.from(selected).sort((a, b) => a - b).map(i => files[i]);
    cleanup();
    if (picks.length > 0 && typeof onImportMany === 'function') onImportMany(picks);
  };
  const handleAddAll = () => {
    cleanup();
    if (files.length > 0 && typeof onImportMany === 'function') onImportMany(files);
  };
  const handleKey = (ev) => {
    if (!isOpen) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cleanup();
    } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'a' || ev.key === 'A')) {
      ev.preventDefault();
      for (let i = 0; i < files.length; i++) selected.add(i);
      paintAll();
      updateImportButton();
    } else if (ev.key === 'Enter' && selected.size > 0) {
      ev.preventDefault();
      handleImport();
    }
  };

  cancelBtn.addEventListener('click', handleCancel);
  importBtn.addEventListener('click', handleImport);
  addAllBtn.addEventListener('click', handleAddAll);
  document.addEventListener('keydown', handleKey);

  // Show modal
  modal.style.display = 'block';
}

/**
 * Loads a file from the current ZIP archive
 * @param {string} fileName - The file name within the ZIP
 */
async function loadFileFromZip(fileName) {
  if (!currentZip) return;

  try {
    const zipEntry = currentZip.file(fileName);
    if (!zipEntry) {
      console.error('File not found in ZIP:', fileName);
      return;
    }

    // Check if this is an image file - handle via import dialog
    if (isImageFileExt(fileName)) {
      const blob = await zipEntry.async('blob');
      const ext = fileName.toLowerCase().split('.').pop() || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                       ext === 'gif' ? 'image/gif' :
                       ext === 'webp' ? 'image/webp' :
                       ext === 'bmp' ? 'image/bmp' : 'image/png';
      const file = new File([blob], fileName, { type: mimeType });
      if (typeof openImportDialog === 'function') {
        openImportDialog(file);
      }
      return;
    }

    const arrayBuffer = await zipEntry.async('arraybuffer');
    const data = new Uint8Array(arrayBuffer);
    const fullName = `${currentZipName}/${fileName}`;

    // Handle snapshot files (.sna/.z80) from ZIP
    if (typeof isSnapshotFile === 'function' && isSnapshotFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadSnapshotFile === 'function') {
        loadSnapshotFile(file);
      }
      return;
    }

    // Handle Nirvana tile files (.btile/.wtile) from ZIP
    if (isNirvanaTileFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof importNirvanaTileFile === 'function') {
        importNirvanaTileFile(file);
      }
      return;
    }

    // Handle ZXP files from ZIP (needs text-based parsing)
    if (typeof isZxpFile === 'function' && isZxpFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadZxpFile === 'function') {
        loadZxpFile(file);
      }
      return;
    }

    // Handle chr$ files from ZIP (needs header-based parsing)
    if (typeof isChrFile === 'function' && isChrFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadChrFile === 'function') {
        loadChrFile(file);
      }
      return;
    }

    // Handle MGH files from ZIP (needs header-based parsing)
    if (typeof isMghFile === 'function' && isMghFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadMghFile === 'function') {
        loadMghFile(file);
      }
      return;
    }

    // Handle HLR files from ZIP (Gigascreen Lowres, fixed bitmap + 2 attr banks)
    if (typeof isHlrFile === 'function' && isHlrFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadHlrFile === 'function') {
        loadHlrFile(file);
      }
      return;
    }

    // Handle STL files from ZIP (Stellar 64×48 multicolor + gigascreen)
    if (typeof isStlFile === 'function' && isStlFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadStlFile === 'function') {
        loadStlFile(file);
      }
      return;
    }

    // Handle BSP files from ZIP (Border Screen with Header)
    if (typeof isBspFile === 'function' && isBspFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadBspFile === 'function') {
        loadBspFile(file);
      }
      return;
    }

    // Handle NXI files from ZIP (ZX Spectrum Next Layer 2 with palette)
    if (typeof isNxiFile === 'function' && isNxiFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadNxiFile === 'function') {
        loadNxiFile(file);
      }
      return;
    }

    // Handle SL2 files from ZIP (ZX Spectrum Next Layer 2 raw pixels)
    if (typeof isSl2File === 'function' && isSl2File(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadSl2File === 'function') {
        loadSl2File(file);
      }
      return;
    }

    // Handle LoRes Radastan files from ZIP (Next 128×96 16-color 4bpp)
    if (typeof isLoresRadFile === 'function' && isLoresRadFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadLoresRadFile === 'function') {
        loadLoresRadFile(file);
      }
      return;
    }

    // Handle LoRes files from ZIP (Next 128×96 256-color)
    if (typeof isLoresFile === 'function' && isLoresFile(fileName)) {
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], fileName);
      if (typeof loadLoresFile === 'function') {
        loadLoresFile(file);
      }
      return;
    }

    const format = detectFormat(fileName, data.length);

    // Check for invalid format (e.g., .img file with wrong size)
    if (format === FORMAT.UNKNOWN) {
      const ext = fileName.toLowerCase().split('.').pop();
      if (ext === 'img') {
        alert(`Invalid Gigascreen file: expected ${GIGASCREEN.TOTAL_SIZE} bytes (2×6912), got ${data.length} bytes.`);
        return;
      }
    }

    // Stop any existing timers
    stopFlashTimer();
    resetScaState();

    // Save current picture state BEFORE initUlaPlusMode clobbers ULA+ globals
    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    // Initialize ULA+ mode based on format
    initUlaPlusMode(data, format);

    // Handle SCA format
    if (format === FORMAT.SCA) {
      screenData = data;
      currentFileName = fullName;
      currentFormat = format;
      scaHeader = parseScaHeader(screenData);
      if (scaHeader) {
        borderColor = scaHeader.borderColor;
        if (borderColorSelect) {
          borderColorSelect.value = String(borderColor);
        }
        startScaAnimation();
      } else {
        currentFormat = FORMAT.UNKNOWN;
      }
    } else if (typeof addPicture === 'function') {
      // Handle MLT with appended ULA+ palette (12352 = 12288 + 64)
      let mltData = data;
      if (format === FORMAT.MLT && data.length === MLT.TOTAL_SIZE_ULAPLUS) {
        ulaPlusPalette = new Uint8Array(ULAPLUS.PALETTE_SIZE);
        for (let i = 0; i < ULAPLUS.PALETTE_SIZE; i++) {
          ulaPlusPalette[i] = data[MLT.TOTAL_SIZE + i];
        }
        isUlaPlusMode = true;
        resetUlaNextMode();
        mltData = data.slice(0, MLT.TOTAL_SIZE);
        if (typeof buildUlaPlusGrid === 'function') buildUlaPlusGrid();
        if (typeof buildUlaPlusClassic === 'function') buildUlaPlusClassic();
        if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();
      }

      // Create internal picture format for all supported formats
      let newInternalPicture = null;
      if (typeof importPicture === 'function') {
        let importOpts;
        const fileExt = fileName.toLowerCase().split('.').pop();
        if (format === FORMAT.ATTR_53C && typeof getSelectedPattern === 'function') {
          importOpts = { pattern: getSelectedPattern() };
        } else if (format === FORMAT.MLT && isUlaPlusMode) {
          importOpts = { timexHiColour: true };
        } else if (format === FORMAT.MLT && fileExt === 'mc') {
          importOpts = { linear: true };
        }
        newInternalPicture = importPicture(format, mltData, fullName, importOpts);
      }

      // Use multi-picture system for editable formats
      const result = addPicture(fullName, format, mltData, newInternalPicture, true);
      if (result >= 0) {
        // addPicture -> switchToPicture handles all rendering and UI updates
        updateFlashTimer();
        return;
      }
      // Failed to add (max pictures reached) - fall through to direct load
      screenData = data;
      currentFileName = fullName;
      currentFormat = format;
      currentPicture = newInternalPicture;
    } else {
      screenData = data;
      currentFileName = fullName;
      currentFormat = format;
    }

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();

    // Update convert dropdown if editor function exists
    if (typeof updateConvertOptions === 'function') {
      updateConvertOptions();
    }
    // Update export ASM button state
    if (typeof updateExportAsmButton === 'function') {
      updateExportAsmButton();
    }

    // Update editor state based on loaded file format
    if (typeof updateEditorState === 'function') {
      updateEditorState();
    }

    // Update editor preview if editor is active
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') {
      renderPreview();
    }

    if (currentFormat !== FORMAT.SCA) {
      updateFlashTimer();
    }
  } catch (error) {
    alert('Error loading file from archive: ' + error.message);
  }
}

/**
 * Loads a list of files from the current ZIP archive, respecting the
 * MAX_PICTURES cap. Images are fed through the standard import dialog with
 * the "Add All" batch queue; native formats are loaded sequentially.
 * @param {string[]} fileNames
 */
async function loadSelectedFilesFromZip(fileNames) {
  if (!currentZip || !fileNames || fileNames.length === 0) return;

  // Cap by available picture slots.
  let available = Infinity;
  if (typeof MAX_PICTURES !== 'undefined' && typeof openPictures !== 'undefined') {
    available = Math.max(0, MAX_PICTURES - openPictures.length);
  }
  if (available === 0) {
    if (typeof MAX_PICTURES !== 'undefined') {
      alert('Maximum ' + MAX_PICTURES + ' pictures already open. Close one to import more.');
    }
    return;
  }
  let selected = fileNames;
  if (selected.length > available) {
    if (!confirm('Only ' + available + ' of ' + selected.length + ' files fit (picture limit). Continue?')) return;
    selected = selected.slice(0, available);
  }

  // Split into raster images (use the import dialog + "Add All" queue) and
  // native formats (loaded directly through the existing routing).
  const imageNames = [];
  const nativeNames = [];
  for (const name of selected) {
    if (typeof isImageFileExt === 'function' && isImageFileExt(name)) {
      imageNames.push(name);
    } else {
      nativeNames.push(name);
    }
  }

  // Load native formats sequentially (each one falls through loadFileFromZip's
  // format routing and calls addPicture via the appropriate loader).
  for (const name of nativeNames) {
    try {
      await loadFileFromZip(name);
    } catch (e) {
      console.error('Failed to load ' + name + ' from ZIP:', e);
    }
  }

  // Queue raster images and open the import dialog for the first.
  if (imageNames.length > 0) {
    const files = [];
    for (const name of imageNames) {
      const zipEntry = currentZip.file(name);
      if (!zipEntry) continue;
      try {
        const blob = await zipEntry.async('blob');
        const ext = name.toLowerCase().split('.').pop() || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                         ext === 'gif' ? 'image/gif' :
                         ext === 'webp' ? 'image/webp' :
                         ext === 'bmp' ? 'image/bmp' : 'image/png';
        files.push(new File([blob], name, { type: mimeType }));
      } catch (e) {
        console.error('Failed to extract image ' + name + ' from ZIP:', e);
      }
    }
    if (files.length > 0) {
      if (typeof setImportQueue === 'function') {
        setImportQueue(files.slice(1));
      }
      if (typeof openImportDialog === 'function') {
        openImportDialog(files[0]);
      }
    }
  }
}

/**
 * Handles a ZIP file - extracts and processes contents
 * @param {File} file - The ZIP file to process
 */
async function handleZipFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    currentZip = zip;
    currentZipName = file.name;

    const supportedFiles = getSupportedFilesFromZip(zip);

    if (supportedFiles.length === 0) {
      alert('No supported files found in archive.');
      currentZip = null;
      currentZipName = '';
      return;
    }

    if (supportedFiles.length === 1) {
      // Only one file - load it directly
      await loadFileFromZip(supportedFiles[0]);
    } else {
      // Multiple files - show selection dialog with multi-select support
      showZipFileModal(supportedFiles, loadSelectedFilesFromZip);
    }
  } catch (error) {
    alert('Error reading archive: ' + error.message);
    currentZip = null;
    currentZipName = '';
  }
}

/**
 * Renders the full ZX Spectrum screen
 */
function renderScreen() {
  const ctx = screenCanvasCtx || (screenCanvas && screenCanvas.getContext('2d'));
  if (!ctx) return;

  // Ensure globalAlpha is reset to prevent faded rendering
  ctx.globalAlpha = 1.0;

  // Calculate border size in pixels (scaled by zoom)
  const borderPixels = borderSize * zoom;

  // Calculate full logical dimensions (image × zoom + borders)
  // BSC/BMC4 manage their own frame size (384×304) including borders
  const isBscLike = currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border);
  const defaultDims = getFormatDimensions(currentFormat);
  const picW = currentPicture ? currentPicture.width : defaultDims.width;
  const picH = currentPicture ? currentPicture.height : defaultDims.height;
  const scaleX = getPixelScaleX();
  const scaleY = getPixelScaleY();
  const logicalWidth = isBscLike ? BSC.FRAME_WIDTH * zoom : picW * scaleX * zoom + borderPixels * 2;
  const logicalHeight = isBscLike ? BSC.FRAME_HEIGHT * zoom : picH * scaleY * zoom + borderPixels * 2;

  // Canvas is capped to viewport size — never allocate huge canvases.
  // Wrapper div provides the logical size for scrollbars.
  // BSC/BMC4: always use full size (manageable, and they override canvas size anyway).
  const container = document.getElementById('canvasContainer');
  const wrapper = document.getElementById('canvasWrapper');

  // Set wrapper to full logical size FIRST — the container uses fit-content,
  // so it must reflow to the new wrapper dimensions before we read clientWidth/Height.
  if (wrapper) {
    wrapper.style.width = logicalWidth + 'px';
    wrapper.style.height = logicalHeight + 'px';
  }

  let canvasW, canvasH;
  // For images under the huge-canvas threshold, use full logical size
  // so scrolling is handled natively by the browser (no sticky + transform needed).
  // Above the threshold, cap to viewport size and use sticky + scroll transform.
  const HUGE_CANVAS_THRESHOLD = 8192 * 8192;
  const useFullCanvas = !isBscLike && (logicalWidth * logicalHeight) <= HUGE_CANVAS_THRESHOLD;
  if (isBscLike || useFullCanvas) {
    canvasW = Math.ceil(logicalWidth);
    canvasH = Math.ceil(logicalHeight);
  } else {
    const viewW = container ? container.clientWidth : logicalWidth;
    const viewH = container ? container.clientHeight : logicalHeight;
    canvasW = Math.ceil(Math.min(logicalWidth, viewW));
    canvasH = Math.ceil(Math.min(logicalHeight, viewH));
  }

  // Viewport div: use normal positioning when canvas is full-size,
  // sticky positioning when canvas is viewport-capped (very large images).
  const viewport = document.getElementById('canvasViewport');
  if (viewport) {
    if (isBscLike || useFullCanvas) {
      viewport.style.position = 'relative';
    } else {
      viewport.style.position = 'sticky';
      viewport.style.top = '0';
      viewport.style.left = '0';
    }
  }

  // Only resize canvas when dimensions actually change (expensive operation)
  // BSC/BMC4 renderers override canvas size themselves, so skip resize for them.
  if (!isBscLike && (screenCanvas.width !== canvasW || screenCanvas.height !== canvasH)) {
    screenCanvas.width = canvasW;
    screenCanvas.height = canvasH;
    lastCanvasWidth = canvasW;
    lastCanvasHeight = canvasH;
    if (typeof resizeFilterOverlay === 'function') resizeFilterOverlay();
  }

  // Scroll offset — canvas renders the visible viewport portion
  const scrollX = container ? container.scrollLeft : 0;
  const scrollY = container ? container.scrollTop : 0;

  // Apply scroll offset transform so all drawing uses logical coordinates unchanged.
  // ctx.drawImage, fillRect, strokeRect, lineTo etc. all respect this transform.
  // Full-size canvas (BSC/BMC4 or useFullCanvas): no scroll transform needed.
  if (isBscLike || useFullCanvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.setTransform(1, 0, 0, 1, -scrollX, -scrollY);
  }

  // Draw border (fill visible area with border color)
  ctx.fillStyle = ZX_PALETTE.REGULAR[borderColor];
  if (isBscLike || useFullCanvas) {
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else {
    ctx.fillRect(scrollX, scrollY, canvasW, canvasH);
  }

  if (screenData.length === 0 && currentFormat !== FORMAT.SPECSCII) {
    // Draw placeholder text (SPECSCII can have empty stream for blank screen)
    ctx.fillStyle = getThemeColors().foreground;
    const fontSize = Math.max(10, 14 * zoom / 2);
    ctx.font = fontSize + 'px Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Load a .scr or other', logicalWidth / 2, logicalHeight / 2 - fontSize * 0.6);
    ctx.fillText('file to display', logicalWidth / 2, logicalHeight / 2 + fontSize * 0.6);
    // Still draw reference image if loaded
    if (typeof drawReferenceOverlay === 'function' &&
        typeof showReference !== 'undefined' && showReference &&
        typeof referenceImage !== 'undefined' && referenceImage) {
      drawReferenceOverlay();
    }
    return;
  }

  // Render based on format — prefer Picture-based renderers when currentPicture exists
  let rendered = false;
  // BSP with border uses legacy BSC path; BSP without border uses Picture path
  const bspHasBorder = currentFormat === FORMAT.BSP && currentPicture && currentPicture.border;
  if (currentPicture &&
      currentFormat !== FORMAT.BSC && currentFormat !== FORMAT.BMC4 &&
      currentFormat !== FORMAT.SCA && !bspHasBorder && currentPicture.contentMode !== 'text') {
    // Unified Picture-based dispatch
    if (currentPicture.colorMode === 'gigascreen') {
      renderPictureGigascreen(ctx, borderPixels, currentPicture);
      rendered = true;
    } else if (currentPicture.colorMode === 'rgb3') {
      renderPictureRgb3(ctx, borderPixels, currentPicture);
      rendered = true;
    } else {
      renderPictureStandard(ctx, borderPixels, currentPicture,
        useFullCanvas ? null : { scrollX, scrollY, viewW: canvasW, viewH: canvasH });
      rendered = true;
    }
  }

  if (!rendered) {
    // Legacy format-based dispatch (BSC, BMC4, SPECSCII, SCA, fallbacks)
    if (currentFormat === FORMAT.BSC ||
        (currentFormat === FORMAT.BSP && bspHasBorder && currentPicture && currentPicture.colorMode !== 'gigascreen')) {
      // BSC / BSP-with-border format: standard screen + per-line border colors
      // Handles its own canvas size and border rendering
      renderBscScreen(ctx);
      if (typeof applyPostProcessFilters === 'function') applyPostProcessFilters();
      // Draw paper grid overlay if enabled (BSC has different dimensions)
      if (gridSize > 0 || subgridSize > 0) {
        drawCharGrid(ctx, BSC.BORDER_LEFT_PX * zoom, BSC.BORDER_TOP_PX * zoom);
      }
      // Draw border grid if enabled
      if (borderGridSize > 0 || borderSubgridSize > 0) {
        drawBscBorderGrid(ctx);
      }
      // Draw reference image overlay if loaded and visible
      if (typeof drawReferenceOverlay === 'function' &&
          typeof showReference !== 'undefined' && showReference &&
          typeof referenceImage !== 'undefined' && referenceImage) {
        drawReferenceOverlay();
      }
      if (typeof applyOverlayFilters === 'function') applyOverlayFilters();
      return; // BSC handles everything including grid
    } else if (currentFormat === FORMAT.BMC4) {
      // BMC4 format: border + 8x4 multicolor
      renderBmc4Screen(ctx);
      if (typeof applyPostProcessFilters === 'function') applyPostProcessFilters();
      // Draw paper grid overlay if enabled (BMC4 has same dimensions as BSC)
      if (gridSize > 0 || subgridSize > 0) {
        drawCharGrid(ctx, BSC.BORDER_LEFT_PX * zoom, BSC.BORDER_TOP_PX * zoom);
      }
      // Draw border grid if enabled
      if (borderGridSize > 0 || borderSubgridSize > 0) {
        drawBscBorderGrid(ctx);  // Border grid (same layout as BSC)
      }
      // Draw reference image overlay if loaded and visible
      if (typeof drawReferenceOverlay === 'function' &&
          typeof showReference !== 'undefined' && showReference &&
          typeof referenceImage !== 'undefined' && referenceImage) {
        drawReferenceOverlay();
      }
      if (typeof applyOverlayFilters === 'function') applyOverlayFilters();
      return; // BMC4 handles everything including grid
    } else if (currentFormat === FORMAT.BSP && bspHasBorder && currentPicture && currentPicture.colorMode === 'gigascreen') {
      // BSP gigascreen + border: render border frame + gigascreen main screen
      renderBspGigaBorder(ctx);
      if (typeof applyPostProcessFilters === 'function') applyPostProcessFilters();
      if (gridSize > 0 || subgridSize > 0) {
        drawCharGrid(ctx, BSC.BORDER_LEFT_PX * zoom, BSC.BORDER_TOP_PX * zoom);
      }
      if (borderGridSize > 0 || borderSubgridSize > 0) {
        drawBscBorderGrid(ctx);
      }
      if (typeof drawReferenceOverlay === 'function' &&
          typeof showReference !== 'undefined' && showReference &&
          typeof referenceImage !== 'undefined' && referenceImage) {
        drawReferenceOverlay();
      }
      if (typeof applyOverlayFilters === 'function') applyOverlayFilters();
      return;
    } else if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
      // NXI/SL2: ZX Spectrum Next Layer 2 (256-color indexed)
      renderNxiScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.LORES) {
      // LoRes: ZX Spectrum Next 128×96 256-color
      renderLoresScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.LORES_RAD) {
      // LoRes Radastan: ZX Spectrum Next 128×96 16-color 4bpp
      renderLoresRadScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.STL) {
      // STL format: Stellar multicolor + gigascreen 64×48
      renderStlScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.SPECSCII) {
      // SPECSCII text screen
      renderSpecsciiScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.SCA) {
      // SCA animation format
      if (scaHeader) {
        renderScaFrame(ctx, borderPixels, scaCurrentFrame);
      }
    } else if (currentFormat === FORMAT.IFL) {
      // IFL format: 8x2 multicolor (legacy fallback)
      renderIflScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.MLT) {
      // MLT format: 8x1 multicolor (legacy fallback)
      renderMltScreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.RGB3) {
      // RGB3 format: tricolor RGB (legacy fallback)
      if (rgb3Mode === 'flicker' && rgb3FlickerFrameId !== null) {
        renderRgb3ScreenFlicker(ctx, borderPixels, rgb3FlickerPhase);
      } else {
        renderRgb3Screen(ctx, borderPixels);
      }
    } else if (currentFormat === FORMAT.GIGASCREEN || currentFormat === FORMAT.MGH ||
               currentFormat === FORMAT.HLR) {
      // Gigascreen format: two alternating SCR frames (legacy fallback)
      renderGigascreen(ctx, borderPixels);
    } else if (currentFormat === FORMAT.MONO_FULL) {
      // Monochrome full screen (legacy fallback)
      renderMonoScreen(ctx, borderPixels, 3);
    } else if (currentFormat === FORMAT.MONO_2_3) {
      // Monochrome 2/3 screen (legacy fallback)
      renderMonoScreen(ctx, borderPixels, 2);
    } else if (currentFormat === FORMAT.MONO_1_3) {
      // Monochrome 1/3 screen (legacy fallback)
      renderMonoScreen(ctx, borderPixels, 1);
    } else if (currentFormat === FORMAT.ATTR_53C) {
      // 53c format: attribute-only with checkerboard (legacy fallback)
      render53cScreen(ctx, borderPixels);
    } else {
      // Standard SCR format - use optimized ImageData rendering
      renderScrFast(ctx, borderPixels);
    }
  }

  // Apply post-process display filters (composite, curvature) before grids
  if (typeof applyPostProcessFilters === 'function') applyPostProcessFilters();

  // Draw paper grid overlay if enabled
  if (gridSize > 0 || subgridSize > 0) {
    drawCharGrid(ctx, borderPixels);
  }
  // Draw mg1 inner section boundary markers (columns 8 and 24)
  if (currentFormat === FORMAT.MGH && currentPicture && currentPicture.attrCellHeight === 1) {
    drawMg1InnerBoundary(ctx, borderPixels);
  }
  // Draw border grid if border is visible and border grid is enabled
  if (borderSize > 0 && (borderGridSize > 0 || borderSubgridSize > 0)) {
    drawStandardBorderGrid(ctx, borderPixels);
  }

  // Draw reference image overlay if loaded and visible
  if (typeof drawReferenceOverlay === 'function' &&
      typeof showReference !== 'undefined' && showReference &&
      typeof referenceImage !== 'undefined' && referenceImage) {
    drawReferenceOverlay();
  }

  // Apply overlay display filters (scanlines, noise, glow, vignette)
  if (typeof applyOverlayFilters === 'function') applyOverlayFilters();

  // Update hidden pixel count after rendering
  updateInfoCounters();
}

/**
 * Draws character cell grid overlay
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} offsetX - X offset in canvas pixels
 * @param {number} [offsetY] - Y offset in canvas pixels (defaults to offsetX)
 */
function drawCharGrid(ctx, offsetX, offsetY = offsetX) {
  const isBscLike = currentFormat === FORMAT.BSC || currentFormat === FORMAT.BMC4 ||
    (currentFormat === FORMAT.BSP && currentPicture && currentPicture.border);
  const dims = getFormatDimensions(currentFormat);
  const width = isBscLike ? SCREEN.WIDTH : (currentPicture ? currentPicture.width : dims.width);
  const height = isBscLike ? SCREEN.HEIGHT : (currentPicture ? currentPicture.height : dims.height);
  const scaleX = getPixelScaleX();
  const scaleY = getPixelScaleY();
  const zoomX = zoom * scaleX;
  const zoomY = zoom * scaleY;

  ctx.lineWidth = 1;

  // Draw subgrid first (behind main grid)
  if (subgridSize > 0) {
    ctx.strokeStyle = getGridColor('subgrid');

    // Vertical subgrid lines
    for (let px = 0; px <= width; px += subgridSize) {
      // Skip if this line would be drawn by main grid
      if (gridSize > 0 && px % gridSize === 0) continue;
      ctx.beginPath();
      ctx.moveTo(offsetX + px * zoomX, offsetY);
      ctx.lineTo(offsetX + px * zoomX, offsetY + height * zoomY);
      ctx.stroke();
    }

    // Horizontal subgrid lines
    for (let py = 0; py <= height; py += subgridSize) {
      // Skip if this line would be drawn by main grid
      if (gridSize > 0 && py % gridSize === 0) continue;
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + py * zoomY);
      ctx.lineTo(offsetX + width * zoomX, offsetY + py * zoomY);
      ctx.stroke();
    }
  }

  // Draw main grid
  if (gridSize > 0) {
    ctx.strokeStyle = getGridColor('grid');

    // Vertical grid lines
    for (let px = 0; px <= width; px += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX + px * zoomX, offsetY);
      ctx.lineTo(offsetX + px * zoomX, offsetY + height * zoomY);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let py = 0; py <= height; py += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + py * zoomY);
      ctx.lineTo(offsetX + width * zoomX, offsetY + py * zoomY);
      ctx.stroke();
    }
  }
}

/**
 * Draws vertical boundary lines marking the mg1 inner attribute section (columns 8-23).
 * Inner columns have 8×1 per-row attrs; outer columns (0-7, 24-31) have 8×8 attrs.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} offset - Border offset in canvas pixels
 */
function drawMg1InnerBoundary(ctx, offset) {
  const height = currentPicture ? currentPicture.height : SCREEN.HEIGHT;
  const lineX1 = offset + 64 * zoom;   // Column 8 (8 × 8 pixels)
  const lineX2 = offset + 192 * zoom;  // Column 24 (24 × 8 pixels)

  const dashLen = Math.max(3, Math.round(zoom * 1.5));

  ctx.strokeStyle = 'rgba(255, 80, 0, 0.75)';
  ctx.lineWidth = Math.max(1, Math.round(zoom / 2));
  ctx.setLineDash([dashLen, dashLen]);

  // Top border: from top of canvas to top of paper
  ctx.beginPath();
  ctx.moveTo(lineX1, 0);
  ctx.lineTo(lineX1, offset);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(lineX2, 0);
  ctx.lineTo(lineX2, offset);
  ctx.stroke();

  // Bottom border: from bottom of paper to bottom of canvas
  const bottomEdge = offset + height * zoom;
  ctx.beginPath();
  ctx.moveTo(lineX1, bottomEdge);
  ctx.lineTo(lineX1, bottomEdge + offset);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(lineX2, bottomEdge);
  ctx.lineTo(lineX2, bottomEdge + offset);
  ctx.stroke();

  ctx.setLineDash([]);
}

/**
 * Draws grid over the border area for standard SCR/SCA formats.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} mainOffset - Offset to main screen area in canvas pixels
 */
function drawStandardBorderGrid(ctx, mainOffset) {
  const dims = getFormatDimensions(currentFormat);
  const gridW = currentPicture ? currentPicture.width : dims.width;
  const gridH = currentPicture ? currentPicture.height : dims.height;
  const scaleX = getPixelScaleX();
  const scaleY = getPixelScaleY();
  const zoomX = zoom * scaleX;
  const zoomY = zoom * scaleY;
  const totalWidth = gridW * zoomX + mainOffset * 2;
  const totalHeight = gridH * zoomY + mainOffset * 2;
  const mainRight = mainOffset + gridW * zoomX;
  const mainBottom = mainOffset + gridH * zoomY;

  // Helper to draw border grid lines with given step size
  const drawBorderGridLines = (step) => {
    // Horizontal lines across entire width, but skip main screen area vertically
    // Top border area
    for (let py = 0; py <= mainOffset; py += step) {
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(totalWidth, py);
      ctx.stroke();
    }
    // Bottom border area
    for (let py = mainBottom; py <= totalHeight; py += step) {
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(totalWidth, py);
      ctx.stroke();
    }
    // Left/right border areas (horizontal lines in the middle section)
    for (let py = mainOffset; py <= mainBottom; py += step) {
      // Left border
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(mainOffset, py);
      ctx.stroke();
      // Right border
      ctx.beginPath();
      ctx.moveTo(mainRight, py);
      ctx.lineTo(totalWidth, py);
      ctx.stroke();
    }

    // Vertical lines across entire height, but skip main screen area horizontally
    // Left border area
    for (let px = 0; px <= mainOffset; px += step) {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, totalHeight);
      ctx.stroke();
    }
    // Right border area
    for (let px = mainRight; px <= totalWidth; px += step) {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, totalHeight);
      ctx.stroke();
    }
    // Top/bottom border areas (vertical lines in the middle section)
    for (let px = mainOffset; px <= mainRight; px += step) {
      // Top border
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, mainOffset);
      ctx.stroke();
      // Bottom border
      ctx.beginPath();
      ctx.moveTo(px, mainBottom);
      ctx.lineTo(px, totalHeight);
      ctx.stroke();
    }
  };

  // Draw subgrid first (if enabled)
  if (borderSubgridSize > 0) {
    ctx.strokeStyle = getGridColor('subgrid');
    ctx.lineWidth = 1;
    drawBorderGridLines(borderSubgridSize * zoom);
  }

  // Draw main grid (if enabled)
  if (borderGridSize > 0) {
    ctx.strokeStyle = getGridColor('border');
    ctx.lineWidth = 1;
    drawBorderGridLines(borderGridSize * zoom);
  }
}

/**
 * Draws grid over BSC border areas with configurable grid/subgrid size.
 * Covers top, left, right, and bottom border regions only (skips main screen area).
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function drawBscBorderGrid(ctx) {
  const fw = BSC.FRAME_WIDTH;
  const fh = BSC.FRAME_HEIGHT;
  const mainLeft = BSC.BORDER_LEFT_PX;          // 64
  const mainTop = BSC.BORDER_TOP_PX;            // 64
  const mainRight = mainLeft + SCREEN.WIDTH;     // 320
  const mainBottom = mainTop + SCREEN.HEIGHT;    // 256

  // Hidden zone boundaries (2 columns = 16px on each side)
  const hiddenLeft = 16;                         // x <= 16 is hidden
  const hiddenRight = fw - 16;                   // x >= 368 is hidden

  const normalColor = getGridColor('border');
  const hiddenColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BSC_GRID_HIDDEN) || 'rgba(255, 0, 0, 0.35)';
  const hiddenOverlay = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BSC_HIDDEN_OVERLAY) || 'rgba(255, 0, 0, 0.12)';
  const subgridColor = getGridColor('subgrid');

  // --- Draw semi-transparent overlay on hidden zones ---
  ctx.fillStyle = hiddenOverlay;
  // Left hidden zone (2 columns = 16px)
  ctx.fillRect(0, 0, hiddenLeft * zoom, fh * zoom);
  // Right hidden zone (2 columns = 16px)
  ctx.fillRect(hiddenRight * zoom, 0, (fw - hiddenRight) * zoom, fh * zoom);

  ctx.lineWidth = 1;

  // Helper function to draw border grid lines with given step
  const drawBorderLines = (seg, useHiddenColors) => {
    // --- Vertical lines ---
    for (let px = 0; px <= fw; px += seg) {
      const cx = px * zoom;
      if (useHiddenColors) {
        ctx.strokeStyle = (px <= hiddenLeft || px >= hiddenRight) ? hiddenColor : normalColor;
      }

      // Top border strip (y: 0 → mainTop)
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, mainTop * zoom);
      ctx.stroke();
      // Bottom border strip (y: mainBottom → fh)
      ctx.beginPath();
      ctx.moveTo(cx, mainBottom * zoom);
      ctx.lineTo(cx, fh * zoom);
      ctx.stroke();
      // Left side strip (y: mainTop → mainBottom, x < mainLeft)
      if (px <= mainLeft) {
        ctx.beginPath();
        ctx.moveTo(cx, mainTop * zoom);
        ctx.lineTo(cx, mainBottom * zoom);
        ctx.stroke();
      }
      // Right side strip (y: mainTop → mainBottom, x >= mainRight)
      if (px >= mainRight) {
        ctx.beginPath();
        ctx.moveTo(cx, mainTop * zoom);
        ctx.lineTo(cx, mainBottom * zoom);
        ctx.stroke();
      }
    }

    // --- Horizontal lines ---
    for (let py = 0; py <= fh; py += seg) {
      const cy = py * zoom;
      // Top border strip (y < mainTop, full width)
      if (py <= mainTop) {
        if (useHiddenColors) {
          ctx.strokeStyle = hiddenColor;
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(hiddenLeft * zoom, cy);
          ctx.stroke();
          ctx.strokeStyle = normalColor;
          ctx.beginPath();
          ctx.moveTo(hiddenLeft * zoom, cy);
          ctx.lineTo(hiddenRight * zoom, cy);
          ctx.stroke();
          ctx.strokeStyle = hiddenColor;
          ctx.beginPath();
          ctx.moveTo(hiddenRight * zoom, cy);
          ctx.lineTo(fw * zoom, cy);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(fw * zoom, cy);
          ctx.stroke();
        }
      }
      // Bottom border strip (y >= mainBottom, full width)
      if (py >= mainBottom) {
        if (useHiddenColors) {
          ctx.strokeStyle = hiddenColor;
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(hiddenLeft * zoom, cy);
          ctx.stroke();
          ctx.strokeStyle = normalColor;
          ctx.beginPath();
          ctx.moveTo(hiddenLeft * zoom, cy);
          ctx.lineTo(hiddenRight * zoom, cy);
          ctx.stroke();
          ctx.strokeStyle = hiddenColor;
          ctx.beginPath();
          ctx.moveTo(hiddenRight * zoom, cy);
          ctx.lineTo(fw * zoom, cy);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(fw * zoom, cy);
          ctx.stroke();
        }
      }
      // Side strips (mainTop < y < mainBottom)
      if (py > mainTop && py < mainBottom) {
        if (useHiddenColors) {
          // Left side
          ctx.strokeStyle = hiddenColor;
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(hiddenLeft * zoom, cy);
          ctx.stroke();
          ctx.strokeStyle = normalColor;
          ctx.beginPath();
          ctx.moveTo(hiddenLeft * zoom, cy);
          ctx.lineTo(mainLeft * zoom, cy);
          ctx.stroke();
          // Right side
          ctx.strokeStyle = normalColor;
          ctx.beginPath();
          ctx.moveTo(mainRight * zoom, cy);
          ctx.lineTo(hiddenRight * zoom, cy);
          ctx.stroke();
          ctx.strokeStyle = hiddenColor;
          ctx.beginPath();
          ctx.moveTo(hiddenRight * zoom, cy);
          ctx.lineTo(fw * zoom, cy);
          ctx.stroke();
        } else {
          // Left side
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(mainLeft * zoom, cy);
          ctx.stroke();
          // Right side
          ctx.beginPath();
          ctx.moveTo(mainRight * zoom, cy);
          ctx.lineTo(fw * zoom, cy);
          ctx.stroke();
        }
      }
    }
  };

  // Draw subgrid first (if enabled)
  if (borderSubgridSize > 0) {
    ctx.strokeStyle = subgridColor;
    drawBorderLines(borderSubgridSize, false);
  }

  // Draw main grid (if enabled)
  if (borderGridSize > 0) {
    drawBorderLines(borderGridSize, true);
  }
}

/**
 * Gets a human-readable format name
 * @param {string} format - Format constant
 * @returns {string} Human-readable format name
 */
function getFormatName(format) {
  switch (format) {
    case FORMAT.ATTR_53C: return '53c (attributes only)';
    case FORMAT.SCR: return 'SCR (standard)';
    case FORMAT.SCR_ULAPLUS: return 'SCR (ULA+)';
    case FORMAT.BSC: return 'BSC (border screen)';
    case FORMAT.IFL: return 'IFL (8x2 multicolor)';
    case FORMAT.BMC4: return 'BMC4 (border + 8x4 multicolor)';
    case FORMAT.MLT: return currentPicture && currentPicture.sourceFormat === 'mlt_ula'
      ? 'MLT+ULA+ (8x1 multicolor)' : 'MLT (8x1 multicolor)';
    case FORMAT.RGB3: return '3 (tricolor RGB)';
    case FORMAT.GIGASCREEN: return 'IMG (Gigascreen)';
    case FORMAT.MONO_FULL: return 'SCR (monochrome)';
    case FORMAT.MONO_2_3: return 'SCR (monochrome 2/3)';
    case FORMAT.MONO_1_3: return 'SCR (monochrome 1/3)';
    case FORMAT.SPECSCII: return 'SPECSCII (text)';
    case FORMAT.SCA: return 'SCA (animation)';
    case FORMAT.ZXP: return currentPicture && currentPicture.nirvanaTileInfo
      ? (currentPicture.nirvanaTileInfo.isBtile ? 'Nirvana btile (8x2 multicolor)' : 'Nirvana wtile (8x2 multicolor)')
      : 'ZXP (variable-size)';
    case FORMAT.CHR: return currentPicture && currentPicture.colorMode === 'gigascreen' ? 'chr$ (gigascreen)' : 'chr$ (variable-size)';
    case FORMAT.MGH: {
      const ch = currentPicture ? currentPicture.attrCellHeight : 0;
      const mode = ch === 8 ? 'mg8' : ch === 4 ? 'mg4' : ch === 2 ? 'mg2' : ch === 1 ? 'mg1' : 'MGH';
      return mode + ' (Multiartist gigascreen)';
    }
    case FORMAT.HLR: return 'HLR (Gigascreen lowres)';
    case FORMAT.STL: return 'STL (Stellar 64×48)';
    case FORMAT.BSP: {
      const giga = currentPicture && currentPicture.colorMode === 'gigascreen';
      const border = currentPicture && currentPicture.border;
      return 'BSP (header' + (giga ? ' + gigascreen' : ' + screen') + (border ? ' + border' : '') + ')';
    }
    case FORMAT.NXI:
      if (nxiLayer2Mode === '320x256') return 'NXI (Next Layer 2 320\u00d7256)';
      if (nxiLayer2Mode === '640x256') return 'NXI (Next Layer 2 640\u00d7256)';
      return 'NXI (Next Layer 2 + palette)';
    case FORMAT.SL2:
      if (nxiLayer2Mode === '320x256') return 'SL2 (Next Layer 2 320\u00d7256)';
      if (nxiLayer2Mode === '640x256') return 'SL2 (Next Layer 2 640\u00d7256)';
      return 'SL2 (Next Layer 2)';
    case FORMAT.LORES:
      return 'SLR (Next LoRes 128\u00d796)';
    case FORMAT.LORES_RAD:
      return 'RAD (Next LoRes Radastan 128\u00d796)';
    case FORMAT.SCR_ULANEXT:
      return 'SCR (ULANext)';
    case FORMAT.GMX:
      return 'GMX (Scorpion 640\u00d7200)';
    case FORMAT.GMX160:
      return 'GMX (Scorpion 160\u00d7200)';
    default: return 'Unknown';
  }
}

/**
 * Gets the dimensions for a given format
 * @param {string} format - Format type
 * @returns {{width: number, height: number}} Dimensions in pixels
 */
function getFormatDimensions(format) {
  switch (format) {
    case FORMAT.BSC:
    case FORMAT.BMC4:
      return { width: BSC.FRAME_WIDTH, height: BSC.FRAME_HEIGHT };
    case FORMAT.BSP:
      if (currentPicture && currentPicture.border) {
        return { width: BSC.FRAME_WIDTH, height: BSC.FRAME_HEIGHT };
      }
      return { width: SCREEN.WIDTH, height: SCREEN.HEIGHT };
    case FORMAT.MONO_2_3:
      return { width: SCREEN.WIDTH, height: 128 };
    case FORMAT.MONO_1_3:
      return { width: SCREEN.WIDTH, height: 64 };
    case FORMAT.SCA:
      if (scaHeader) {
        return { width: scaHeader.width, height: scaHeader.height };
      }
      return { width: SCREEN.WIDTH, height: SCREEN.HEIGHT };
    case FORMAT.STL:
      return { width: SCREEN.WIDTH, height: SCREEN.HEIGHT };
    case FORMAT.NXI:
    case FORMAT.SL2:
      if (nxiLayer2Mode === '320x256') return { width: 320, height: 256 };
      if (nxiLayer2Mode === '640x256') return { width: 640, height: 256 };
      return { width: NXI.WIDTH, height: NXI.HEIGHT };
    case FORMAT.LORES:
      return { width: LORES.WIDTH, height: LORES.HEIGHT };
    case FORMAT.LORES_RAD:
      return { width: LORES_RAD.WIDTH, height: LORES_RAD.HEIGHT };
    case FORMAT.GMX:
      return { width: GMX.WIDTH, height: GMX.HEIGHT };
    case FORMAT.GMX160:
      return { width: 160, height: GMX.HEIGHT };
    case FORMAT.ZXP:
    case FORMAT.CHR:
      if (currentPicture) {
        return { width: currentPicture.width, height: currentPicture.height };
      }
      return { width: SCREEN.WIDTH, height: SCREEN.HEIGHT };
    default:
      return { width: SCREEN.WIDTH, height: SCREEN.HEIGHT };
  }
}

/**
 * Gets the short file name (without path)
 * @param {string} fileName - Full file name with possible path
 * @returns {string} Short file name
 */
function getShortFileName(fileName) {
  const parts = fileName.split('/');
  return parts[parts.length - 1];
}

/**
 * Count distinct colors used in the picture.
 * For attribute formats: counts unique (color index + bright) combinations used as ink or paper.
 * @returns {number} Number of distinct colors, or -1 if not applicable
 */
function countDistinctColors() {
  // NXI/SL2: count distinct palette indices in pixel data
  if (currentFormat === FORMAT.NXI || currentFormat === FORMAT.SL2) {
    if (!screenData || screenData.length === 0) return -1;
    const offset = getNxiPixelOffset();
    if (nxiLayer2Mode === '640x256') {
      // 4bpp: count distinct nibble values (0-15)
      const used = new Uint8Array(16);
      const w = 640, h = 256;
      for (let i = 0; i < (w * h) / 2; i++) {
        const b = screenData[offset + i];
        used[(b >> 4) & 0x0F] = 1;
        used[b & 0x0F] = 1;
      }
      let count = 0;
      for (let i = 0; i < 16; i++) count += used[i];
      return count;
    }
    // 8bpp: count distinct byte values (0-255)
    const used = new Uint8Array(256);
    const w = nxiLayer2Mode === '320x256' ? 320 : 256;
    const h = nxiLayer2Mode === '320x256' ? 256 : 192;
    for (let i = 0; i < w * h; i++) {
      used[screenData[offset + i]] = 1;
    }
    let count = 0;
    for (let i = 0; i < 256; i++) count += used[i];
    return count;
  }

  // LoRes: count distinct byte values (0-255)
  if (currentFormat === FORMAT.LORES) {
    if (!screenData || screenData.length === 0) return -1;
    const used = new Uint8Array(256);
    const len = LORES.WIDTH * LORES.HEIGHT;
    for (let i = 0; i < len; i++) {
      used[screenData[i]] = 1;
    }
    let count = 0;
    for (let i = 0; i < 256; i++) count += used[i];
    return count;
  }

  // LoRes Radastan: count distinct 4bpp values (0-15)
  if (currentFormat === FORMAT.LORES_RAD) {
    if (!screenData || screenData.length === 0) return -1;
    const used = new Uint8Array(16);
    const len = LORES_RAD.WIDTH * LORES_RAD.HEIGHT / 2;
    for (let i = 0; i < len; i++) {
      const b = screenData[i];
      used[(b >> 4) & 0x0F] = 1;
      used[b & 0x0F] = 1;
    }
    let count = 0;
    for (let i = 0; i < 16; i++) count += used[i];
    return count;
  }

  // Attribute-based formats: count distinct attribute byte values
  if (!currentPicture || !currentPicture.planes || !currentPicture.planes[0]) return -1;
  const cellH = currentPicture.attrCellHeight;
  if (cellH <= 0) return -1;
  const cols = currentPicture.cols;
  const attrs = currentPicture.planes[0].attrs;
  if (!attrs) return -1;
  const attrRows = currentPicture.attrRows;
  const used = new Uint8Array(256);
  for (let i = 0, len = attrRows * cols; i < len; i++) {
    used[attrs[i]] = 1;
  }
  let count = 0;
  for (let i = 0; i < 256; i++) count += used[i];
  return count;
}

/**
 * Count cells with hidden pixels: ink === paper but bitmap rows are not uniform.
 * @returns {number} Number of cells with hidden pixel data, or -1 if not applicable
 */
function countHiddenPixelCells() {
  // Attribute-only formats have a fixed bitmap — hidden cells are not meaningful
  if (currentFormat === FORMAT.GMX160 || currentFormat === FORMAT.HLR ||
      currentFormat === FORMAT.ATTR_53C || currentFormat === FORMAT.STL) return -1;
  if (!currentPicture || !currentPicture.planes || !currentPicture.planes[0]) return -1;
  const cellH = currentPicture.attrCellHeight;
  if (cellH <= 0) return -1; // no attributes (mono, RGB3, etc.)
  const cols = currentPicture.cols;
  const height = currentPicture.height;
  const bitmap = currentPicture.planes[0].bitmap;
  const attrs = currentPicture.planes[0].attrs;
  if (!bitmap || !attrs) return -1;
  const attrRows = currentPicture.attrRows;
  let count = 0;
  for (let ar = 0; ar < attrRows; ar++) {
    for (let col = 0; col < cols; col++) {
      const attr = attrs[ar * cols + col];
      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      if (ink !== paper) continue;
      // All-zero (pure paper) or all-FF (pure ink) cells are not hidden,
      // but any other bitmap content is invisible when ink=paper
      const y0 = ar * cellH;
      const yEnd = Math.min(y0 + cellH, height);
      let allZero = true, allFF = true;
      for (let y = y0; y < yEnd; y++) {
        const b = bitmap[y * cols + col];
        if (b !== 0x00) allZero = false;
        if (b !== 0xFF) allFF = false;
        if (!allZero && !allFF) break;
      }
      if (!allZero && !allFF) count++;
    }
  }
  return count;
}

/**
 * Lightweight update of just the hidden pixel count label.
 * Called after rendering so the count reflects current edits.
 */
function updateInfoCounters() {
  // Sync live edits from screenData into picture before counting
  if (currentPicture && screenData && screenData.length > 0 && typeof syncPictureFromScreenData === 'function') {
    syncPictureFromScreenData(screenData, currentPicture);
  }
  if (infoColorsRow && infoColorsUsed) {
    const colorCount = currentFileName ? countDistinctColors() : -1;
    if (colorCount >= 0) {
      infoColorsRow.style.display = '';
      infoColorsUsed.textContent = String(colorCount);
    } else {
      infoColorsRow.style.display = 'none';
    }
  }
  if (infoHiddenRow && infoHiddenCells) {
    const hiddenCount = currentFileName ? countHiddenPixelCells() : -1;
    if (hiddenCount >= 0) {
      infoHiddenRow.style.display = '';
      infoHiddenCells.textContent = String(hiddenCount);
    } else {
      infoHiddenRow.style.display = 'none';
    }
  }
}

/**
 * Updates the file info display and info panel
 */
function updateFileInfo() {
  const formatName = getFormatName(currentFormat);
  const dimensions = getFormatDimensions(currentFormat);

  // Update info panel elements
  if (infoFileName) {
    infoFileName.textContent = currentFileName ? getShortFileName(currentFileName) : '-';
    infoFileName.title = currentFileName || '';
  }
  if (infoFileSize) {
    infoFileSize.textContent = currentFileName ? `${screenData.length} bytes` : '-';
  }
  if (infoFormat) {
    let formatDisplay = formatName;
    if (currentFormat === FORMAT.SCA && scaHeader) {
      formatDisplay = `${formatName} (v${scaHeader.version})`;
    } else if (currentFormat === FORMAT.SCR_ULAPLUS && isUlaPlusMode) {
      formatDisplay = `${formatName} (64 colors)`;
    } else if (currentFormat === FORMAT.SCR_ULANEXT && isUlaNextMode) {
      const bits = ulaNextIs9bit ? '9-bit' : '8-bit';
      formatDisplay = `${formatName} (mask $${ulaNextInkMask.toString(16).toUpperCase().padStart(2, '0')}, ${ulaNextInkCount} ink / ${ulaNextPaperCount} paper, ${bits})`;
    }
    // Add BSP title/author if present
    if (currentFormat === FORMAT.BSP && currentPicture) {
      const title = currentPicture.bspTitle;
      const author = currentPicture.bspAuthor;
      if (title || author) {
        const parts = [];
        if (title) parts.push(title);
        if (author) parts.push('by ' + author);
        formatDisplay += ' — ' + parts.join(' ');
      }
    }
    infoFormat.textContent = currentFileName ? formatDisplay : '-';
  }
  if (infoDimensions) {
    if (currentFileName) {
      // For cell-based formats (HLR, 53c) individual pixels carry no
      // user-meaningful color, so show the dimensions in 8x8 cells instead.
      // STL is a special case: 64×48 fat pixels (each 4×4 real pixels).
      const useCells = (currentFormat === FORMAT.HLR || currentFormat === FORMAT.ATTR_53C);
      if (currentFormat === FORMAT.STL) {
        infoDimensions.textContent = '64 × 48 fat pixels';
      } else if (useCells) {
        const cellsW = Math.ceil(dimensions.width / 8);
        const cellsH = Math.ceil(dimensions.height / 8);
        infoDimensions.textContent = `${cellsW} × ${cellsH} cells`;
      } else {
        infoDimensions.textContent = `${dimensions.width} × ${dimensions.height} px`;
      }
    } else {
      infoDimensions.textContent = '-';
    }
  }

  // Colors used + hidden cells counters
  updateInfoCounters();

  // Animation section (only for SCA)
  if (infoAnimSection) {
    if (currentFormat === FORMAT.SCA && scaHeader) {
      infoAnimSection.style.display = '';
      if (infoFrameCount) {
        infoFrameCount.textContent = `${scaHeader.frameCount}`;
      }
      if (infoPayloadType) {
        const payloadDesc = scaHeader.payloadType === 1 ? 'attr-only' : 'full frames';
        infoPayloadType.textContent = `${payloadDesc} (v${scaHeader.payloadType})`;
      }
      updateAnimationInfo();
    } else {
      infoAnimSection.style.display = 'none';
    }
  }
}

/**
 * Updates the animation-specific info (current frame delay)
 */
function updateAnimationInfo() {
  if (currentFormat !== FORMAT.SCA || !scaHeader) return;

  if (infoFrameDelay) {
    const delayMs = scaHeader.delays[scaCurrentFrame] * SCA.DELAY_UNIT_MS;
    infoFrameDelay.textContent = `${delayMs} ms`;
  }
}

/**
 * Sets the zoom level and redraws
 * @param {number} newZoom - New zoom level (1-5)
 */
function setZoom(newZoom) {
  zoom = newZoom;
  // Use editorRender when in editor mode to preserve overlays
  if (typeof editorRender === 'function' && editorActive) {
    editorRender();
  } else {
    renderScreen();
  }
  saveSettings();
}

/**
 * Sets the border color and redraws
 * @param {number} colorIndex - Color index (0-7)
 */
function setBorderColor(colorIndex) {
  borderColor = colorIndex;
  if (typeof editorRender === 'function' && editorActive) {
    editorRender();
  } else {
    renderScreen();
  }
  saveSettings();
}

/**
 * Sets the border size and redraws
 * @param {number} size - Border size in pixels (0, 16, or 32)
 */
function setBorderSize(size) {
  borderSize = size;
  if (typeof editorRender === 'function' && editorActive) {
    editorRender();
  } else {
    renderScreen();
  }
  saveSettings();
}

// ============================================================================
// Settings Persistence
// ============================================================================

const SETTINGS_KEY = 'screenViewerSettings';

/**
 * Saves current settings to localStorage
 */
function saveSettings() {
  const settings = {
    zoom: zoom,
    borderColor: borderColor,
    borderSize: borderSize,
    flashEnabled: flashEnabled,
    gridSize: gridSize,
    subgridSize: subgridSize,
    borderGridSize: borderGridSize,
    borderSubgridSize: borderSubgridSize,
    gridColorPreset: gridColorPreset,
    showAttributes: showAttributes,
    pattern53c: pattern53cSelect ? pattern53cSelect.value : 'checker',
    attr53cBlend: attr53cBlend,
    attr53cSort: typeof attr53cSortMode !== 'undefined' ? attr53cSortMode : 'hue',
    attr53cSortReverse: typeof attr53cSortReverse !== 'undefined' ? attr53cSortReverse : false,
    nxiSort: typeof nxiSortMode !== 'undefined' ? nxiSortMode : 'index',
    nxiSortReverse: typeof nxiSortReverse !== 'undefined' ? nxiSortReverse : false,
    palette: document.getElementById('paletteSelect')?.value || 'default',
    editPreviewTrimmedOnly: typeof editPreviewTrimmedOnly !== 'undefined' ? editPreviewTrimmedOnly : true,
    editZoom: typeof editZoom !== 'undefined' ? editZoom : 2,
    ...(typeof getFilterSettings === 'function' ? getFilterSettings() : {})
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

/**
 * Loads settings from localStorage and applies them
 */
function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return;

    const settings = JSON.parse(stored);

    // Apply zoom
    if (settings.zoom !== undefined) {
      zoom = settings.zoom;
      if (zoomSelect) zoomSelect.value = String(zoom);
    }

    // Apply border color
    if (settings.borderColor !== undefined) {
      borderColor = settings.borderColor;
      if (borderColorSelect) borderColorSelect.value = String(borderColor);
    }

    // Apply border size
    if (settings.borderSize !== undefined) {
      borderSize = settings.borderSize;
      if (borderSizeSelect) borderSizeSelect.value = String(borderSize);
    }

    // Apply flash enabled
    if (settings.flashEnabled !== undefined) {
      flashEnabled = settings.flashEnabled;
      if (flashCheckbox) flashCheckbox.checked = flashEnabled;
    }

    // Apply grid size
    if (settings.gridSize !== undefined) {
      gridSize = settings.gridSize;
      if (gridSizeSelect) gridSizeSelect.value = String(gridSize);
    }
    // Apply subgrid size
    if (settings.subgridSize !== undefined) {
      subgridSize = settings.subgridSize;
      if (subgridSizeSelect) subgridSizeSelect.value = String(subgridSize);
    }
    // Apply border grid size
    if (settings.borderGridSize !== undefined) {
      borderGridSize = settings.borderGridSize;
      if (borderGridSizeSelect) borderGridSizeSelect.value = String(borderGridSize);
    }
    // Apply border subgrid size
    if (settings.borderSubgridSize !== undefined) {
      borderSubgridSize = settings.borderSubgridSize;
      if (borderSubgridSizeSelect) borderSubgridSizeSelect.value = String(borderSubgridSize);
    }

    // Apply grid color preset
    if (settings.gridColorPreset !== undefined) {
      gridColorPreset = settings.gridColorPreset;
      const gridColorSel = document.getElementById('gridColorSelect');
      if (gridColorSel) /** @type {HTMLSelectElement} */ (gridColorSel).value = gridColorPreset;
    }

    // Apply show attributes
    if (settings.showAttributes !== undefined) {
      showAttributes = settings.showAttributes;
      const attrsCb = document.getElementById('showAttrsCheckbox');
      if (attrsCb) /** @type {HTMLInputElement} */ (attrsCb).checked = showAttributes;
    }

    // Apply 53c pattern
    if (settings.pattern53c !== undefined && pattern53cSelect) {
      pattern53cSelect.value = settings.pattern53c;
    }

    // Apply 53c blend mode
    if (settings.attr53cBlend !== undefined) {
      attr53cBlend = settings.attr53cBlend;
      const blendCb = document.getElementById('attr53cBlendCheckbox');
      if (blendCb) /** @type {HTMLInputElement} */ (blendCb).checked = attr53cBlend;
    }

    // Apply 53c sort mode (variable declared in screen_editor.js, may not exist yet)
    if (settings.attr53cSort !== undefined) {
      if (typeof attr53cSortMode !== 'undefined') attr53cSortMode = settings.attr53cSort;
      const sortRadio = /** @type {HTMLInputElement|null} */ (document.querySelector(`input[name="attr53cSort"][value="${settings.attr53cSort}"]`));
      if (sortRadio) sortRadio.checked = true;
    }

    // Apply 53c sort reverse
    if (settings.attr53cSortReverse !== undefined) {
      if (typeof attr53cSortReverse !== 'undefined') attr53cSortReverse = settings.attr53cSortReverse;
      const reverseCb = document.getElementById('attr53cSortReverse');
      if (reverseCb) /** @type {HTMLInputElement} */ (reverseCb).checked = attr53cSortReverse;
    }

    // Apply Next palette sort mode (variable declared in screen_editor.js, may not exist yet)
    if (settings.nxiSort !== undefined) {
      if (typeof nxiSortMode !== 'undefined') nxiSortMode = settings.nxiSort;
      const sortRadio = /** @type {HTMLInputElement|null} */ (document.querySelector(`input[name="nxiSort"][value="${settings.nxiSort}"]`));
      if (sortRadio) sortRadio.checked = true;
    }

    // Apply Next palette sort reverse
    if (settings.nxiSortReverse !== undefined) {
      if (typeof nxiSortReverse !== 'undefined') nxiSortReverse = settings.nxiSortReverse;
      const reverseCb = document.getElementById('nxiSortReverse');
      if (reverseCb) /** @type {HTMLInputElement} */ (reverseCb).checked = nxiSortReverse;
    }

    // Apply palette
    if (settings.palette !== undefined) {
      const paletteSelect = document.getElementById('paletteSelect');
      if (paletteSelect) {
        /** @type {HTMLSelectElement} */ (paletteSelect).value = settings.palette;
        // Actually apply the palette colors
        setPalette(settings.palette);
      }
    }

    // Apply edit preview mode (for SCA editor)
    if (settings.editPreviewTrimmedOnly !== undefined) {
      // This will be used by sca_editor.js when it initializes
      window.savedEditPreviewTrimmedOnly = settings.editPreviewTrimmedOnly;
    }

    // Apply edit zoom (for SCA editor)
    if (settings.editZoom !== undefined) {
      // This will be used by sca_editor.js when it initializes
      window.savedEditZoom = settings.editZoom;
    }

    // Apply display filter settings
    if (typeof applyFilterSettings === 'function') {
      applyFilterSettings(settings);
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

/**
 * Checks if the screen data contains any flashing attributes
 * @returns {boolean} True if any attribute has flash bit set
 */
function hasFlashingAttributes() {
  if (screenData.length === 0) return false;

  // ULA+ and ULANext modes repurpose bits 6-7 for CLUT selection, not flash
  if (isUlaPlusMode || isUlaNextMode) return false;

  // SPECSCII format uses escape codes for flash
  if (currentFormat === FORMAT.SPECSCII) {
    // Look for CC_FLASH (0x12) followed by 0x01
    for (let i = 0; i < screenData.length - 1; i++) {
      if (screenData[i] === SPECSCII.CC_FLASH && screenData[i + 1] === 1) {
        return true;
      }
    }
    return false;
  }

  // Determine where attributes start based on format
  const attrStart = (currentFormat === FORMAT.ATTR_53C) ? 0 : SCREEN.BITMAP_SIZE;
  const attrEnd = attrStart + SCREEN.ATTR_SIZE;

  // Check if we have enough data
  if (screenData.length < attrEnd) return false;

  for (let i = attrStart; i < attrEnd; i++) {
    if ((screenData[i] & 0x80) !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Starts the flash animation timer
 */
function startFlashTimer() {
  if (flashTimerId !== null) return; // Already running

  flashTimerId = setInterval(() => {
    flashPhase = !flashPhase;
    // Use editorRender when editor is active so all overlays (tool preview, selection, etc.) persist
    if (typeof editorActive !== 'undefined' && editorActive && typeof editorRender === 'function') {
      editorRender();
    } else {
      renderScreen();
    }
  }, FLASH_INTERVAL);
}

/**
 * Stops the flash animation timer
 */
function stopFlashTimer() {
  if (flashTimerId !== null) {
    clearInterval(flashTimerId);
    flashTimerId = null;
    flashPhase = false;
  }
}

/**
 * Updates the flash timer based on current state
 */
function updateFlashTimer() {
  if (flashEnabled && hasFlashingAttributes()) {
    startFlashTimer();
  } else {
    stopFlashTimer();
    renderScreen(); // Re-render to show non-flashing state
  }
}

/**
 * Sets whether flash animation is enabled
 * @param {boolean} enabled - Whether flash is enabled
 */
function setFlashEnabled(enabled) {
  flashEnabled = enabled;
  updateFlashTimer();
  saveSettings();
}

/**
 * Detects screen format from file extension and size
 * @param {string} fileName - The file name
 * @param {number} fileSize - The file size in bytes
 * @returns {string} Format type constant
 */
function detectFormat(fileName, fileSize) {
  const ext = fileName.toLowerCase().split('.').pop();

  // Check by extension first
  if (ext === '53c' || ext === 'atr') {
    return FORMAT.ATTR_53C;
  }

  if (ext === 'bsc') {
    return FORMAT.BSC;
  }

  if (ext === 'bsp') {
    return FORMAT.BSP;
  }

  if (ext === 'ifl') {
    return FORMAT.IFL;
  }

  if (ext === 'bmc4') {
    return FORMAT.BMC4;
  }

  if (ext === 'mlt' || ext === 'mc') {
    return FORMAT.MLT;
  }

  if (ext === '3') {
    return FORMAT.RGB3;
  }

  if (ext === 'img') {
    // Gigascreen: must be exactly 13824 bytes (2 × 6912)
    if (fileSize === GIGASCREEN.TOTAL_SIZE) {
      return FORMAT.GIGASCREEN;
    }
    // Invalid size for .img - return UNKNOWN to trigger warning
    return FORMAT.UNKNOWN;
  }

  if (ext === 'hlr') {
    if (fileSize === HLR.TOTAL_SIZE) {
      return FORMAT.HLR;
    }
    return FORMAT.UNKNOWN;
  }

  if (ext === 'stl') {
    if (fileSize === STL.TOTAL_SIZE) {
      return FORMAT.STL;
    }
    return FORMAT.UNKNOWN;
  }

  if (ext === 'rcs') {
    if (fileSize === SCREEN.TOTAL_SIZE) {
      return FORMAT.SCR;
    }
    return FORMAT.UNKNOWN;
  }

  if (ext === 'specscii') {
    return FORMAT.SPECSCII;
  }

  if (ext === 'sca') {
    return FORMAT.SCA;
  }

  if (ext === 'nxi') {
    if (fileSize === NXI.TOTAL_SIZE || fileSize === NXI.TOTAL_SIZE_320 || fileSize === NXI.TOTAL_SIZE_640) {
      return FORMAT.NXI;
    }
    return FORMAT.UNKNOWN;
  }

  if (ext === 'sl2') {
    if (fileSize === SL2.RAW_SIZE || fileSize === SL2.HEADER_SIZE || fileSize === SL2.EXT_SIZE
        || fileSize === SL2.TOTAL_SIZE_WITH_PAL || fileSize === SL2.EXT_SIZE_WITH_PAL
        || fileSize === SL2.EXT_SIZE_WITH_PAL_4BPP) {
      return FORMAT.SL2;
    }
    return FORMAT.UNKNOWN;
  }

  if (ext === 'slr') {
    if (fileSize === LORES_RAD.PIXEL_DATA_SIZE || fileSize === LORES_RAD.TOTAL_SIZE_WITH_GRB_PAL || fileSize === LORES_RAD.TOTAL_SIZE_WITH_PAL) return FORMAT.LORES_RAD;
    return FORMAT.LORES; // Extension-only detection; 12288 conflicts with MLT by size
  }

  if (ext === 'rad') {
    return FORMAT.LORES_RAD;
  }

  if (ext === 'zx7' || ext === 'zx7b') {
    // ZX7 compressed — actual format determined after decompression in loadScreenFile
    return FORMAT.SCR;
  }

  if (ext === 'zx0' || ext === 'zx0b') {
    // ZX0 compressed — actual format determined after decompression in loadScreenFile
    return FORMAT.SCR;
  }

  if (ext === 'lc') {
    // LC compressed — actual format determined after decompression in loadScreenFile
    return FORMAT.SCR;
  }

  if (ext === 'upk') {
    // upkr compressed — actual format determined after decompression in loadScreenFile
    return FORMAT.SCR;
  }

  if (ext === 'c') {
    if (fileSize === GMX.TOTAL_SIZE) return FORMAT.GMX;
    if (fileSize === GMX160.TOTAL_SIZE) return FORMAT.GMX160;
    return FORMAT.UNKNOWN;
  }

  // Check by size
  if (fileSize === SCREEN.ATTR_SIZE) {
    return FORMAT.ATTR_53C;
  }

  if (fileSize === BSC.TOTAL_SIZE) {
    return FORMAT.BSC;
  }

  if (fileSize === IFL.TOTAL_SIZE) {
    return FORMAT.IFL;
  }

  if (fileSize === BMC4.TOTAL_SIZE) {
    return FORMAT.BMC4;
  }

  if (fileSize === MLT.TOTAL_SIZE || fileSize === MLT.TOTAL_SIZE_ULAPLUS) {
    return FORMAT.MLT;
  }

  if (fileSize === RGB3.TOTAL_SIZE) {
    return FORMAT.RGB3;
  }

  if (fileSize === GIGASCREEN.TOTAL_SIZE) {
    return FORMAT.GIGASCREEN;
  }

  if (fileSize === GMX160.TOTAL_SIZE) {
    return FORMAT.GMX160;
  }

  if (fileSize === HLR.TOTAL_SIZE) {
    return FORMAT.HLR;
  }

  if (fileSize === NXI.TOTAL_SIZE || fileSize === NXI.TOTAL_SIZE_320 || fileSize === NXI.TOTAL_SIZE_640) {
    return FORMAT.NXI;
  }

  // ULA+ is exactly 6976 bytes — check it before ULANext range (which now overlaps)
  if (fileSize === ULAPLUS.TOTAL_SIZE) {
    return FORMAT.SCR_ULAPLUS;
  }

  // ULANext: 6912 SCR + 1 mask byte + palette (1 or 2 bytes per entry)
  // Range 6945–7426 covers both 8-bit and 9-bit palettes for all valid masks.
  // ULA+ (6976) is excluded above; actual mask/size validation in initUlaNextMode().
  if (fileSize >= ULANEXT.MIN_FILE_SIZE && fileSize <= ULANEXT.MAX_FILE_SIZE) {
    return FORMAT.SCR_ULANEXT;
  }

  if (fileSize === SCREEN.TOTAL_SIZE) {
    return FORMAT.SCR;
  }

  // Monochrome formats (bitmap only)
  if (fileSize === SCREEN.BITMAP_SIZE) {
    return FORMAT.MONO_FULL;
  }

  if (fileSize === 4096) {
    return FORMAT.MONO_2_3;
  }

  if (fileSize === 2048) {
    return FORMAT.MONO_1_3;
  }

  // Default to SCR for unknown
  return FORMAT.SCR;
}

// ============================================================================
// ZXP (ZX-Paintbrush) format support
// ============================================================================

/**
 * Checks if a file is a ZXP file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isZxpFile(fileName) {
  return fileName.toLowerCase().endsWith('.zxp');
}

/**
 * Converts linear Y coordinate to ZX Spectrum SCR bitmap offset
 * @param {number} y - pixel row (0-191)
 * @param {number} x - byte column (0-31)
 * @returns {number} offset into 6144-byte bitmap
 */
function linearToScrOffset(y, x) {
  const third = y >> 6;                // 0-2 (which third of screen)
  const pixelRow = y & 7;             // 0-7 (pixel row within cell)
  const cellRow = (y >> 3) & 7;       // 0-7 (character row within third)
  return (third * 2048) + (pixelRow * 256) + (cellRow * 32) + x;
}

/**
 * Parses ZXP (ZX-Paintbrush) text format into binary screen data.
 * Supports variable dimensions (8–2048, divisible by 8).
 * Standard 256×192 maps to SCR/IFL/MLT; non-standard uses FORMAT.ZXP.
 * @param {string} text - ZXP file content
 * @returns {{ data: Uint8Array, format: string, width?: number, height?: number, attrCellHeight?: number, palette?: Uint8Array|null } | null}
 */
function parseZxpFile(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Validate header
  if (!lines[0] || lines[0].trim() !== 'ZX-Paintbrush extended image') {
    alert('Invalid ZXP file: missing header.');
    return null;
  }

  // Detect bitmap dimensions from first bitmap line (line index 2)
  const bitmapStart = 2;
  const firstLine = lines[bitmapStart];
  if (!firstLine) {
    alert('Invalid ZXP file: no bitmap data.');
    return null;
  }
  // Count binary digit chars (0/1) in first line
  let pixelWidth = 0;
  for (let i = 0; i < firstLine.length; i++) {
    if (firstLine[i] === '0' || firstLine[i] === '1') pixelWidth++;
    else break;
  }
  if (pixelWidth < 8 || pixelWidth > 2048 || (pixelWidth & 7) !== 0) {
    alert(`Invalid ZXP file: bitmap width ${pixelWidth} must be 8–2048 and divisible by 8.`);
    return null;
  }
  const cols = pixelWidth >> 3;

  // Count bitmap lines (until empty separator or EOF)
  let pixelHeight = 0;
  for (let i = bitmapStart; i < lines.length; i++) {
    const ln = lines[i];
    // A bitmap line must start with '0' or '1' and have at least pixelWidth chars
    if (ln && ln.length >= pixelWidth && (ln[0] === '0' || ln[0] === '1')) {
      pixelHeight++;
    } else {
      break;
    }
  }
  if (pixelHeight < 8 || pixelHeight > 2048 || (pixelHeight & 7) !== 0) {
    alert(`Invalid ZXP file: bitmap height ${pixelHeight} must be 8–2048 and divisible by 8.`);
    return null;
  }

  const isStandard = (pixelWidth === 256 && pixelHeight === 192);

  // Parse bitmap into linear row-major layout (or interleaved for standard)
  let bitmapData;
  if (isStandard) {
    bitmapData = new Uint8Array(SCREEN.BITMAP_SIZE); // 6144
  } else {
    bitmapData = new Uint8Array(cols * pixelHeight);
  }

  for (let y = 0; y < pixelHeight; y++) {
    const line = lines[bitmapStart + y];
    if (!line || line.length < pixelWidth) {
      alert(`Invalid ZXP file: bitmap line ${y + 1} is too short or missing.`);
      return null;
    }
    for (let byteCol = 0; byteCol < cols; byteCol++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (line[byteCol * 8 + bit] === '1') {
          byteVal |= (0x80 >> bit);
        }
      }
      if (isStandard) {
        bitmapData[linearToScrOffset(y, byteCol)] = byteVal;
      } else {
        bitmapData[y * cols + byteCol] = byteVal;
      }
    }
  }

  // Find attribute lines after bitmap separator
  let attrStart = bitmapStart + pixelHeight;
  while (attrStart < lines.length && lines[attrStart].trim() === '') {
    attrStart++;
  }

  // Count attribute lines
  const attrLines = [];
  for (let i = attrStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') break;
    attrLines.push(trimmed);
  }

  const attrCount = attrLines.length;
  if (attrCount === 0) {
    alert('Invalid ZXP file: no attribute lines found.');
    return null;
  }

  // Derive attrCellHeight
  if (pixelHeight % attrCount !== 0) {
    alert(`Invalid ZXP file: height ${pixelHeight} not divisible by ${attrCount} attribute lines.`);
    return null;
  }
  const attrCellHeight = pixelHeight / attrCount;

  // Validate standard sizes for 256×192
  if (isStandard && attrCellHeight !== 8 && attrCellHeight !== 4 && attrCellHeight !== 2 && attrCellHeight !== 1) {
    alert(`Invalid ZXP file: unsupported attribute cell height ${attrCellHeight} for standard 256×192.`);
    return null;
  }

  // Parse attribute bytes
  const attrData = new Uint8Array(attrCount * cols);
  for (let row = 0; row < attrCount; row++) {
    const parts = attrLines[row].split(/\s+/);
    if (parts.length < cols) {
      alert(`Invalid ZXP file: attribute line ${row + 1} has ${parts.length} values (expected ${cols}).`);
      return null;
    }
    for (let col = 0; col < cols; col++) {
      attrData[row * cols + col] = parseInt(parts[col], 16);
    }
  }

  // Check for optional ULA+ palette after attributes
  let paletteStart = attrStart + attrCount;
  while (paletteStart < lines.length && lines[paletteStart].trim() === '') {
    paletteStart++;
  }
  let ulaPlusPaletteData = null;
  if (paletteStart < lines.length) {
    const palLine = lines[paletteStart].trim();
    if (palLine !== '') {
      const palParts = palLine.split(/\s+/);
      if (palParts.length === 64) {
        ulaPlusPaletteData = new Uint8Array(64);
        for (let i = 0; i < 64; i++) {
          ulaPlusPaletteData[i] = parseInt(palParts[i], 16);
        }
      }
    }
  }

  // Non-standard dimensions → FORMAT.ZXP
  if (!isStandard) {
    // screenData = linear bitmap + attrs
    const totalSize = cols * pixelHeight + attrCount * cols;
    const outputData = new Uint8Array(totalSize);
    outputData.set(bitmapData, 0);
    outputData.set(attrData, cols * pixelHeight);
    return {
      data: outputData,
      format: FORMAT.ZXP,
      width: pixelWidth,
      height: pixelHeight,
      attrCellHeight: attrCellHeight,
      palette: ulaPlusPaletteData
    };
  }

  // Standard 256×192 — map to SCR/IFL/MLT as before
  let format;
  let outputData;

  if (attrCellHeight === 8) {
    // 8×8 mode → SCR (or SCR_ULAPLUS if palette present)
    if (ulaPlusPaletteData) {
      format = FORMAT.SCR_ULAPLUS;
      outputData = new Uint8Array(ULAPLUS.TOTAL_SIZE); // 6976
      outputData.set(bitmapData, 0);
      outputData.set(attrData, SCREEN.BITMAP_SIZE);
      outputData.set(ulaPlusPaletteData, ULAPLUS.PALETTE_OFFSET);
    } else {
      format = FORMAT.SCR;
      outputData = new Uint8Array(SCREEN.TOTAL_SIZE); // 6912
      outputData.set(bitmapData, 0);
      outputData.set(attrData, SCREEN.BITMAP_SIZE);
    }
  } else if (attrCellHeight === 4) {
    // 8×4 mode → duplicate each row to get 96 rows, treat as IFL
    format = FORMAT.IFL;
    outputData = new Uint8Array(IFL.TOTAL_SIZE); // 9216
    outputData.set(bitmapData, 0);
    for (let row = 0; row < 48; row++) {
      const srcOffset = row * 32;
      const dstRow1 = row * 2;
      const dstRow2 = row * 2 + 1;
      for (let col = 0; col < 32; col++) {
        outputData[SCREEN.BITMAP_SIZE + dstRow1 * 32 + col] = attrData[srcOffset + col];
        outputData[SCREEN.BITMAP_SIZE + dstRow2 * 32 + col] = attrData[srcOffset + col];
      }
    }
  } else if (attrCellHeight === 2) {
    // 8×2 mode → IFL
    format = FORMAT.IFL;
    outputData = new Uint8Array(IFL.TOTAL_SIZE); // 9216
    outputData.set(bitmapData, 0);
    outputData.set(attrData, SCREEN.BITMAP_SIZE);
  } else {
    // 8×1 mode (192 lines) → MLT
    format = FORMAT.MLT;
    outputData = new Uint8Array(MLT.TOTAL_SIZE); // 12288
    outputData.set(bitmapData, 0);
    outputData.set(attrData, SCREEN.BITMAP_SIZE);
  }

  return { data: outputData, format: format };
}

/**
 * Loads a ZXP (ZX-Paintbrush) file
 * @param {File} file - The ZXP file to load
 */
function loadZxpFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const text = event.target?.result;
    if (typeof text !== 'string') return;

    const result = parseZxpFile(text);
    if (!result) return;

    // Stop any existing timers
    stopFlashTimer();
    resetScaState();

    const { data, format } = result;

    // Handle non-standard ZXP (variable dimensions)
    if (format === FORMAT.ZXP) {
      const baseName = file.name.replace(/\.zxp$/i, '');
      const fileName = baseName + '.zxp';
      const cols = result.width >> 3;
      const bitmapSize = cols * result.height;
      const bitmap = data.subarray(0, bitmapSize);
      const attrs = data.subarray(bitmapSize);

      if (typeof saveCurrentPictureState === 'function') {
        saveCurrentPictureState();
      }

      // No ULA+ for non-standard ZXP
      initUlaPlusMode(data, FORMAT.UNKNOWN);

      const newInternalPicture = (typeof importZxp === 'function')
        ? importZxp(bitmap, attrs, fileName, result.width, result.height, result.attrCellHeight, result.palette || null)
        : null;

      if (typeof addPicture === 'function') {
        const pictureResult = addPicture(fileName, format, data, newInternalPicture, true);
        if (pictureResult >= 0) {
          updateFlashTimer();
          return;
        }
        screenData = data;
        currentFileName = fileName;
        currentFormat = format;
        currentPicture = newInternalPicture;
      } else {
        screenData = data;
        currentFileName = fileName;
        currentFormat = format;
        currentPicture = newInternalPicture;
      }

      toggleScaControlsVisibility();
      toggleFormatControlsVisibility();
      updateScaControls();
      updateFileInfo();
      renderScreen();
      if (typeof updateEditorState === 'function') updateEditorState();
      if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
      updateFlashTimer();
      if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
      return;
    }

    // Standard 256×192 — existing behavior
    // Strip .zxp extension and add appropriate extension for the detected format
    let baseName = file.name.replace(/\.zxp$/i, '');
    const extMap = {
      [FORMAT.SCR]: '.scr',
      [FORMAT.SCR_ULAPLUS]: '.scr',
      [FORMAT.IFL]: '.ifl',
      [FORMAT.MLT]: '.mlt'
    };
    const fileName = baseName + (extMap[format] || '.scr');

    // Save current picture state BEFORE initUlaPlusMode clobbers ULA+ globals
    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    // Initialize ULA+ mode based on format
    initUlaPlusMode(data, format);

    // Create internal picture format for SCR/ULA+ (passed to addPicture, not set globally)
    let newInternalPicture = null;
    if (typeof importScr === 'function') {
      if (format === FORMAT.SCR_ULAPLUS) {
        newInternalPicture = importScrUlaPlus(data, fileName);
      } else if (format === FORMAT.SCR) {
        newInternalPicture = importScr(data, fileName);
      }
    }

    // Use multi-picture system if available
    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(fileName, format, data, newInternalPicture, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
      // Failed to add - fall through to direct load
      screenData = data;
      currentFileName = fileName;
      currentFormat = format;
      currentPicture = newInternalPicture;
    } else {
      screenData = data;
      currentFileName = fileName;
      currentFormat = format;
      currentPicture = newInternalPicture;
    }

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();

    if (typeof updateConvertOptions === 'function') {
      updateConvertOptions();
    }
    if (typeof updateExportAsmButton === 'function') {
      updateExportAsmButton();
    }
    if (typeof layers !== 'undefined') {
      layers = [];
      activeLayerIndex = 0;
      layersEnabled = false;
    }
    if (typeof toggleLayerSectionVisibility === 'function') {
      toggleLayerSectionVisibility();
    }
    if (typeof updateLayerPanel === 'function') {
      updateLayerPanel();
    }
    if (typeof updateEditorState === 'function') {
      updateEditorState();
    }
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') {
      renderPreview();
    }
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') {
      updatePictureTabBar();
    }
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsText(file);
}

// ============================================================================
// chr$ format support
// ============================================================================

/**
 * Loads a Multiartist MGH file (.mg1/.mg2/.mg4/.mg8).
 * @param {File} file - The file to load
 */
function loadMghFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const result = parseMghFile(buffer);
    if (!result) {
      alert('Invalid MGH file: bad header or unexpected size.');
      return;
    }

    // Stop any existing timers
    stopFlashTimer();
    resetScaState();

    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    // Build screenData layout based on mode
    let data;
    {
      // All MGH modes: use interleaved gigascreen layout (same as .img)
      // so all gigascreen editor code works unchanged
      const attrSize = result.attrs1.length; // 768 for mg8, 1536 for mg4, 3072 for mg2, 6144 for mg1
      const frameSize = 6144 + attrSize;
      data = new Uint8Array(frameSize * 2);
      const bm1 = interleaveBitmap(result.bitmap1, 256, 192);
      data.set(bm1, 0);                                          // Frame 1 bitmap: 0-6143
      data.set(result.attrs1, 6144);                              // Frame 1 attrs: 6144+
      const bm2 = interleaveBitmap(result.bitmap2, 256, 192);
      data.set(bm2, frameSize);                                   // Frame 2 bitmap
      data.set(result.attrs2, frameSize + 6144);                  // Frame 2 attrs
    }

    initUlaPlusMode(data, FORMAT.UNKNOWN);

    let newInternalPicture = null;
    if (typeof importMgh === 'function') {
      newInternalPicture = importMgh(result, file.name);
    }

    // Apply border color from frame 1
    borderColor = result.border0;
    if (borderColorSelect) {
      borderColorSelect.value = String(borderColor);
    }

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.MGH, data, newInternalPicture, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
      screenData = data;
      currentFileName = file.name;
      currentFormat = FORMAT.MGH;
      currentPicture = newInternalPicture;
    } else {
      screenData = data;
      currentFileName = file.name;
      currentFormat = FORMAT.MGH;
      currentPicture = newInternalPicture;
    }

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Parses a Multiartist MGH file buffer.
 * Layout: 256-byte header + bitmap1 (6144) + bitmap2 (6144) + attrs1 + attrs2 [+ outerAttrs1 + outerAttrs2 for mg1]
 *
 * mg1 has two attr layers per frame, covering different COLUMNS:
 *   - inner: 3072 bytes = 192 rows × 16 cols — covers middle columns 8-23 at 1px cell height
 *   - outer: 384 bytes = 24 rows × 16 cols — covers side columns 0-7 and 24-31 at 8px cell height
 * The parser merges both into a single 192-row × 32-col attr array (cellHeight=1).
 *
 * @param {ArrayBuffer} buffer - File data
 * @returns {{bitmap1: Uint8Array, attrs1: Uint8Array, bitmap2: Uint8Array, attrs2: Uint8Array, cellHeight: number, border0: number, border1: number}|null}
 */
function parseMghFile(buffer) {
  if (buffer.byteLength < MGH.HEADER_SIZE + MGH.BITMAP_SIZE * 2) return null;

  const bytes = new Uint8Array(buffer);

  // Validate signature "MGH"
  if (bytes[0] !== 0x4D || bytes[1] !== 0x47 || bytes[2] !== 0x48) return null;

  // Version check
  const version = bytes[3];
  if (version !== 1) return null;

  // Mode: 1, 2, 4, or 8
  const mode = bytes[4];
  if (mode !== 1 && mode !== 2 && mode !== 4 && mode !== 8) return null;

  const border0 = bytes[5] & 7;
  const border1 = bytes[6] & 7;

  // Inner attr size: mode 1 has 3072 bytes (192 rows × 16 middle cols),
  // other modes use (192/mode) rows × 32 cols
  const innerAttrSize = mode === 1 ? 3072 : Math.floor(192 / mode) * 32;
  const outerAttrSize = mode === 1 ? 384 : 0;

  // Validate total size
  const expectedSize = MGH.HEADER_SIZE + MGH.BITMAP_SIZE * 2 + innerAttrSize * 2 + outerAttrSize * 2;
  if (buffer.byteLength < expectedSize) return null;

  let offset = MGH.HEADER_SIZE;

  // Deinterleave both bitmaps from SCR layout to linear
  const bitmap1 = deinterleaveBitmap(bytes, offset, 256, 192);
  offset += MGH.BITMAP_SIZE;

  const bitmap2 = deinterleaveBitmap(bytes, offset, 256, 192);
  offset += MGH.BITMAP_SIZE;

  let attrs1, attrs2, cellHeight;

  if (mode === 1) {
    // mg1: inner attrs cover middle 16 cols (8-23) at 1px resolution,
    // outer attrs cover side 16 cols (0-7, 24-31) at 8px resolution.
    // Merge into 192 rows × 32 cols = 6144 bytes per frame.
    cellHeight = 1;

    const innerAttrs1 = bytes.subarray(offset, offset + 3072);
    offset += 3072;
    const innerAttrs2 = bytes.subarray(offset, offset + 3072);
    offset += 3072;
    const outerAttrs1 = bytes.subarray(offset, offset + 384);
    offset += 384;
    const outerAttrs2 = bytes.subarray(offset, offset + 384);

    const mergedSize = 192 * 32;
    attrs1 = new Uint8Array(mergedSize);
    attrs2 = new Uint8Array(mergedSize);

    // Inner attrs: 3072 bytes stored as 192 rows × 16 cols (columns 8-23)
    let innerIdx = 0;
    for (let y = 0; y < 192; y++) {
      for (let col = 8; col < 24; col++) {
        attrs1[y * 32 + col] = innerAttrs1[innerIdx];
        attrs2[y * 32 + col] = innerAttrs2[innerIdx];
        innerIdx++;
      }
    }

    // Outer attrs: 384 bytes covering columns 0-7 then 24-31, each byte spans 8 pixel rows.
    // Layout: iterate cols 0-7, then cols 24-31, advancing y by 8 after col 31.
    let outerIdx = 0;
    for (let yBlock = 0; yBlock < 192; yBlock += 8) {
      // Left side: columns 0-7
      for (let col = 0; col < 8; col++) {
        const attr1 = outerAttrs1[outerIdx];
        const attr2 = outerAttrs2[outerIdx];
        outerIdx++;
        for (let dy = 0; dy < 8; dy++) {
          attrs1[(yBlock + dy) * 32 + col] = attr1;
          attrs2[(yBlock + dy) * 32 + col] = attr2;
        }
      }
      // Right side: columns 24-31
      for (let col = 24; col < 32; col++) {
        const attr1 = outerAttrs1[outerIdx];
        const attr2 = outerAttrs2[outerIdx];
        outerIdx++;
        for (let dy = 0; dy < 8; dy++) {
          attrs1[(yBlock + dy) * 32 + col] = attr1;
          attrs2[(yBlock + dy) * 32 + col] = attr2;
        }
      }
    }
  } else {
    // mg2/mg4/mg8: straightforward single-layer attrs
    cellHeight = mode;
    attrs1 = new Uint8Array(innerAttrSize);
    attrs1.set(bytes.subarray(offset, offset + innerAttrSize));
    offset += innerAttrSize;

    attrs2 = new Uint8Array(innerAttrSize);
    attrs2.set(bytes.subarray(offset, offset + innerAttrSize));
  }

  return { bitmap1, attrs1, bitmap2, attrs2, cellHeight, border0, border1 };
}

/**
 * Checks if a file is a Multiartist MGH file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isMghFile(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.mg1') || lower.endsWith('.mg2') || lower.endsWith('.mg4') || lower.endsWith('.mg8');
}

/**
 * Checks if a file is an HLR (Gigascreen Lowres) file by extension.
 * @param {string} fileName
 * @returns {boolean}
 */
function isHlrFile(fileName) {
  return fileName.toLowerCase().endsWith('.hlr');
}

/**
 * Parses an HLR (Gigascreen Lowres) file buffer.
 * Layout: 84 bytes loader code + 8 bytes pattern + 768 bytes attrs1 + 768 bytes attrs2.
 * The 8-byte pattern (one byte per scanline within a char) is read from the file.
 * @param {ArrayBuffer} buffer - File data
 * @returns {{pattern: Uint8Array, attrs1: Uint8Array, attrs2: Uint8Array}|null}
 */
function parseHlrFile(buffer) {
  if (buffer.byteLength !== HLR.TOTAL_SIZE) return null;

  const bytes = new Uint8Array(buffer);
  const pattern = new Uint8Array(HLR.PATTERN_SIZE);
  pattern.set(bytes.subarray(HLR.PATTERN_OFFSET, HLR.PATTERN_OFFSET + HLR.PATTERN_SIZE));
  const attrs1 = new Uint8Array(HLR.ATTRS_SIZE);
  const attrs2 = new Uint8Array(HLR.ATTRS_SIZE);
  attrs1.set(bytes.subarray(HLR.ATTRS1_OFFSET, HLR.ATTRS1_OFFSET + HLR.ATTRS_SIZE));
  attrs2.set(bytes.subarray(HLR.ATTRS2_OFFSET, HLR.ATTRS2_OFFSET + HLR.ATTRS_SIZE));

  return { pattern, attrs1, attrs2 };
}

/**
 * Loads an HLR (Gigascreen Lowres) file. Builds a gigascreen-layout screenData
 * by tiling the file's 8-byte fill pattern across both frames and copying the
 * two attribute banks, then creates a 2-plane gigascreen Picture via importHlr().
 * @param {File} file
 */
function loadHlrFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const result = parseHlrFile(buffer);
    if (!result) {
      alert('Invalid HLR file: expected ' + HLR.TOTAL_SIZE + ' bytes.');
      return;
    }

    stopFlashTimer();
    resetScaState();

    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    // Build gigascreen-layout screenData so existing editor/renderer code works.
    // Both frames share the same bitmap, tiled from the file's 8-byte pattern
    // (one byte per scanline within an 8x8 char cell).
    const data = new Uint8Array(GIGASCREEN.TOTAL_SIZE);
    const pattern = result.pattern;
    for (let third = 0; third < 3; third++) {
      const thirdBase = third * 2048;
      for (let pixelLine = 0; pixelLine < 8; pixelLine++) {
        const fill = pattern[pixelLine];
        for (let charRow = 0; charRow < 8; charRow++) {
          const rowOffset = thirdBase + charRow * 32 + pixelLine * 256;
          for (let col = 0; col < 32; col++) {
            data[rowOffset + col] = fill;
            data[GIGASCREEN.FRAME2_OFFSET + rowOffset + col] = fill;
          }
        }
      }
    }
    data.set(result.attrs1, 6144);
    data.set(result.attrs2, GIGASCREEN.FRAME2_OFFSET + 6144);

    initUlaPlusMode(data, FORMAT.UNKNOWN);

    let newInternalPicture = null;
    if (typeof importHlr === 'function') {
      newInternalPicture = importHlr(new Uint8Array(buffer), file.name);
    }

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.HLR, data, newInternalPicture, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.HLR;
    currentPicture = newInternalPicture;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Checks if a file is an STL (Stellar) file by extension.
 * @param {string} fileName
 * @returns {boolean}
 */
function isStlFile(fileName) {
  return fileName.toLowerCase().endsWith('.stl');
}

/**
 * Loads an STL (Stellar) file. De-interleaves the 3072-byte file into two
 * 1536-byte attr frames, builds a gigascreen-layout screenData with fixed
 * 0x0F bitmaps, and creates a 2-plane gigascreen Picture via importStl().
 * @param {File} file
 */
function loadStlFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    if (buffer.byteLength !== STL.TOTAL_SIZE) {
      alert('Invalid STL file: expected ' + STL.TOTAL_SIZE + ' bytes.');
      return;
    }

    stopFlashTimer();
    resetScaState();

    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    const fileBytes = new Uint8Array(buffer);

    // De-interleave 4-byte groups into two attr frames
    const frame1 = new Uint8Array(STL.ATTRS_PER_FRAME);
    const frame2 = new Uint8Array(STL.ATTRS_PER_FRAME);
    for (let i = 0, j = 0; i < STL.TOTAL_SIZE; i += 4, j += 2) {
      frame1[j]     = fileBytes[i];
      frame1[j + 1] = fileBytes[i + 1];
      frame2[j]     = fileBytes[i + 2];
      frame2[j + 1] = fileBytes[i + 3];
    }

    // Build gigascreen-layout screenData: [bm1(6144)][at1(1536)][bm2(6144)][at2(1536)]
    // attrCellHeight=4 → attrSize=1536, frameSize=7680, total=15360
    const frameSize = 6144 + STL.ATTRS_PER_FRAME; // 7680
    const data = new Uint8Array(frameSize * 2);    // 15360

    // Fill both frames' bitmaps with fixed 0x0F (interleaved SCR layout)
    for (let third = 0; third < 3; third++) {
      const thirdBase = third * 2048;
      for (let pixelLine = 0; pixelLine < 8; pixelLine++) {
        for (let charRow = 0; charRow < 8; charRow++) {
          const rowOffset = thirdBase + charRow * 32 + pixelLine * 256;
          for (let col = 0; col < 32; col++) {
            data[rowOffset + col] = 0x0F;
            data[frameSize + rowOffset + col] = 0x0F;
          }
        }
      }
    }

    // Copy attrs into screenData
    data.set(frame1, 6144);
    data.set(frame2, frameSize + 6144);

    initUlaPlusMode(data, FORMAT.UNKNOWN);

    let newInternalPicture = null;
    if (typeof importStl === 'function') {
      newInternalPicture = importStl(fileBytes, file.name);
    }

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.STL, data, newInternalPicture, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.STL;
    currentPicture = newInternalPicture;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Checks if a file is a BSP (Border Screen with Header) file by extension.
 * @param {string} fileName
 * @returns {boolean}
 */
function isBspFile(fileName) {
  return fileName.toLowerCase().endsWith('.bsp');
}

/**
 * Parses the 70-byte BSP header.
 * @param {Uint8Array} bytes - at least 70 bytes
 * @returns {{hasGiga: boolean, hasBorder: boolean, borderColor: number, title: string, author: string, config: number}|null}
 */
function parseBspHeader(bytes) {
  if (bytes.length < BSP.HEADER_SIZE) return null;
  if (bytes[0] !== BSP.MAGIC[0] || bytes[1] !== BSP.MAGIC[1] || bytes[2] !== BSP.MAGIC[2]) return null;
  const config = bytes[BSP.CONFIG_OFFSET];
  const hasGiga = !!(config & BSP.FLAG_GIGA);
  const hasBorder = !!(config & BSP.FLAG_BORDER);
  const borderColor = bytes[BSP.BORDER_COLOR_OFFSET] & 7;

  // Read null-terminated ASCII strings
  let title = '';
  for (let i = 0; i < BSP.TITLE_LENGTH; i++) {
    const ch = bytes[BSP.TITLE_OFFSET + i];
    if (ch === 0) break;
    title += String.fromCharCode(ch);
  }
  let author = '';
  for (let i = 0; i < BSP.AUTHOR_LENGTH; i++) {
    const ch = bytes[BSP.AUTHOR_OFFSET + i];
    if (ch === 0) break;
    author += String.fromCharCode(ch);
  }

  return { hasGiga, hasBorder, borderColor, title, author, config };
}

/**
 * Decodes BSP RLE border data into raw 4224-byte BSC border format.
 * Each RLE byte: color = byte & 7, tactsCode = (byte >> 3) & 0x1F.
 * tactsCode: 0=fill to end of segment, 1=next byte is count,
 *   2=count is 12, >=3=count is tactsCode+13. Final pixels = count*2.
 * RLE operates on individual pixels in 384×304 border space,
 * skipping the 256×192 center area on side rows.
 *
 * @param {Uint8Array} data - source buffer
 * @param {number} offset - start of RLE data in the buffer
 * @param {number} maxLen - maximum bytes to read from offset
 * @returns {Uint8Array} 4224-byte raw BSC border
 */
function decodeBspBorder(data, offset, maxLen) {
  // Decode BSP RLE border into 4224-byte BSC raw border format.
  // RLE operates on a 384×304 pixel canvas, skipping the 256×192 center.
  // Each RLE byte: bits[2:0]=color, bits[7:3]=tactsCode.
  // tactsCode: 0=fill to end of segment, 1=next byte is count,
  //   2=count is 12, >=3=count is tactsCode+13. Final pixels = count*2.
  const raw = new Uint8Array(BSC.BORDER_SIZE); // 4224

  const maxWidth = 384;  // 256 + 64*2
  const maxHeight = 304; // 192 + 64 + 48
  const borderLeft = 64;
  const borderTop = 64;
  const screenWidth = 256;

  // Build per-pixel color map for border area
  // Use x,y cursor like the reference implementation
  let x = 0;
  let y = 0;
  let inCenter = false;
  let pos = offset;
  const end = offset + maxLen;

  // borderData[y][x] = color (3-bit)
  // Instead of a full 384×304 array, write directly to BSC raw format
  // We'll collect pixels into a flat border pixel buffer first
  const borderPixels = new Uint8Array(384 * 304); // oversized, only border pixels used

  while (pos < end && y < maxHeight) {
    const b = data[pos++];
    const color = b & 7;
    const tactsCode = (b >> 3) & 0x1F;

    let count;
    let untilEnd = false;
    if (tactsCode === 0) {
      untilEnd = true;
      count = 0; // unused when untilEnd
    } else if (tactsCode === 1) {
      if (pos >= end) break;
      count = data[pos++] * 2;
    } else if (tactsCode === 2) {
      count = 12 * 2;
    } else {
      count = (tactsCode + 13) * 2;
    }

    let remaining = count;
    while ((untilEnd || remaining > 0) && y < maxHeight) {
      borderPixels[y * maxWidth + x] = color;
      x++;
      remaining--;

      // In center rows, skip from left border edge to right border edge
      if (inCenter && x === borderLeft) {
        x = borderLeft + screenWidth;
        if (untilEnd) {
          untilEnd = false;
          remaining = 0; // stop fill-to-end at center skip
        }
      }
      if (x >= maxWidth) {
        if (untilEnd) {
          untilEnd = false;
          remaining = 0;
        }
        x = 0;
        y++;
        inCenter = (y >= borderTop && y < maxHeight - 48);
      }
    }
  }

  // Convert pixel map to BSC raw format
  // BSC layout: top(64 lines × 24 bytes) + sides(192 lines × 8 bytes) + bottom(48 lines × 24 bytes)
  // Each byte: bits[2:0] = first 8-pixel color, bits[5:3] = second 8-pixel color

  // Top border: 64 lines, each 384 pixels = 24 bytes (each byte = 16px)
  for (let line = 0; line < 64; line++) {
    for (let col = 0; col < 24; col++) {
      const px = col * 16;
      const c1 = borderPixels[line * maxWidth + px] & 7;
      const c2 = borderPixels[line * maxWidth + px + 8] & 7;
      raw[line * 24 + col] = c1 | (c2 << 3);
    }
  }

  // Sides: 192 lines, left 64px (4 bytes) + right 64px (4 bytes) = 8 bytes per line
  const sidesOffset = 1536;
  for (let line = 0; line < 192; line++) {
    const srcY = 64 + line;
    // Left 4 bytes (64 pixels)
    for (let col = 0; col < 4; col++) {
      const px = col * 16;
      const c1 = borderPixels[srcY * maxWidth + px] & 7;
      const c2 = borderPixels[srcY * maxWidth + px + 8] & 7;
      raw[sidesOffset + line * 8 + col] = c1 | (c2 << 3);
    }
    // Right 4 bytes (64 pixels)
    for (let col = 0; col < 4; col++) {
      const px = (borderLeft + screenWidth) + col * 16;
      const c1 = borderPixels[srcY * maxWidth + px] & 7;
      const c2 = borderPixels[srcY * maxWidth + px + 8] & 7;
      raw[sidesOffset + line * 8 + 4 + col] = c1 | (c2 << 3);
    }
  }

  // Bottom border: 48 lines, each 384 pixels = 24 bytes
  const bottomOffset = 1536 + 1536;
  for (let line = 0; line < 48; line++) {
    const srcY = 64 + 192 + line;
    for (let col = 0; col < 24; col++) {
      const px = col * 16;
      const c1 = borderPixels[srcY * maxWidth + px] & 7;
      const c2 = borderPixels[srcY * maxWidth + px + 8] & 7;
      raw[bottomOffset + line * 24 + col] = c1 | (c2 << 3);
    }
  }

  return raw;
}

/**
 * Encodes raw 4224-byte BSC border data into BSP RLE format.
 * Reverse of decodeBspBorder. RLE operates on individual pixels in
 * 384×304 border coordinate space, skipping the 256×192 center area.
 * @param {Uint8Array} rawBorder - 4224-byte BSC border
 * @returns {Uint8Array} RLE-encoded bytes
 */
function encodeBspBorder(rawBorder) {
  const maxWidth = 384;
  const borderLeft = 64;
  const screenWidth = 256;

  // Build a pixel stream from BSC raw border (border-only pixels in scan order)
  // Each BSC byte: bits[2:0]=first 8px color, bits[5:3]=second 8px color
  const pixels = [];

  // Top: 64 lines, full width (384px = 24 bytes per line)
  for (let line = 0; line < 64; line++) {
    for (let col = 0; col < 24; col++) {
      const b = rawBorder[line * 24 + col];
      const c1 = b & 7;
      const c2 = (b >> 3) & 7;
      for (let p = 0; p < 8; p++) pixels.push(c1);
      for (let p = 0; p < 8; p++) pixels.push(c2);
    }
  }

  // Sides: 192 lines, left 64px (4 bytes) + right 64px (4 bytes)
  for (let line = 0; line < 192; line++) {
    // Left
    for (let col = 0; col < 4; col++) {
      const b = rawBorder[1536 + line * 8 + col];
      const c1 = b & 7;
      const c2 = (b >> 3) & 7;
      for (let p = 0; p < 8; p++) pixels.push(c1);
      for (let p = 0; p < 8; p++) pixels.push(c2);
    }
    // Right
    for (let col = 0; col < 4; col++) {
      const b = rawBorder[1536 + line * 8 + 4 + col];
      const c1 = b & 7;
      const c2 = (b >> 3) & 7;
      for (let p = 0; p < 8; p++) pixels.push(c1);
      for (let p = 0; p < 8; p++) pixels.push(c2);
    }
  }

  // Bottom: 48 lines, full width (384px = 24 bytes per line)
  for (let line = 0; line < 48; line++) {
    for (let col = 0; col < 24; col++) {
      const b = rawBorder[3072 + line * 24 + col];
      const c1 = b & 7;
      const c2 = (b >> 3) & 7;
      for (let p = 0; p < 8; p++) pixels.push(c1);
      for (let p = 0; p < 8; p++) pixels.push(c2);
    }
  }

  // Build segment boundaries (pixels per segment in the stream)
  // Top: 64 full lines of 384px, Sides: 192 lines of 128px (64+64),
  // Bottom: 48 full lines of 384px
  const segments = [];
  for (let i = 0; i < 64; i++) segments.push(384);
  for (let i = 0; i < 192; i++) segments.push(64, 64); // left strip, right strip
  for (let i = 0; i < 48; i++) segments.push(384);

  // RLE encode pixel stream using segment boundaries for tactsCode=0
  const result = [];
  let pixIdx = 0;
  let segIdx = 0;
  let segUsed = 0;

  while (pixIdx < pixels.length && segIdx < segments.length) {
    const segLen = segments[segIdx];
    const segRemaining = segLen - segUsed;
    if (segRemaining <= 0) {
      segUsed = 0;
      segIdx++;
      continue;
    }

    const color = pixels[pixIdx];
    // Count consecutive same-color pixels within current segment
    let run = 0;
    while (run < segRemaining && (pixIdx + run) < pixels.length && pixels[pixIdx + run] === color) {
      run++;
    }

    if (run >= segRemaining) {
      // Fill rest of segment: tactsCode=0
      result.push(color & 7); // tactsCode=0, color
      pixIdx += segRemaining;
      segUsed = 0;
      segIdx++;
    } else if (run >= 2) {
      // Encode as RLE. count = run (round down to even)
      const evenRun = run & ~1;
      if (evenRun < 2) {
        // Can't encode single pixel, use tactsCode=1, count=1 (2 pixels)
        result.push((1 << 3) | (color & 7));
        result.push(1);
        pixIdx += 2;
        segUsed += 2;
      } else {
        const half = evenRun >> 1; // pixels = half * 2
        // Find best encoding
        if (half === 12) {
          // tactsCode=2 → 12*2=24 pixels
          result.push((2 << 3) | (color & 7));
        } else if (half >= 16 && half <= 44) {
          // tactsCode=half-13 (3..31) → (tactsCode+13)*2 pixels
          const tc = half - 13;
          if (tc >= 3 && tc <= 31) {
            result.push((tc << 3) | (color & 7));
          } else {
            result.push((1 << 3) | (color & 7));
            result.push(half);
          }
        } else {
          // tactsCode=1, next byte=half
          result.push((1 << 3) | (color & 7));
          result.push(half);
        }
        pixIdx += evenRun;
        segUsed += evenRun;
      }
    } else {
      // Single pixel run — encode as 2 pixels (minimum)
      result.push((1 << 3) | (color & 7));
      result.push(1);
      pixIdx += Math.min(2, run);
      segUsed += Math.min(2, run);
    }

    if (segIdx < segments.length && segUsed >= segments[segIdx]) {
      segUsed = 0;
      segIdx++;
    }
  }

  return new Uint8Array(result);
}

/**
 * Loads a BSP (Border Screen with Header) file.
 * Supports 4 variants: screen-only, screen+border, gigascreen, gigascreen+border.
 * @param {File} file
 */
function loadBspFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const fileBytes = new Uint8Array(buffer);
    if (fileBytes.length < BSP.HEADER_SIZE) {
      alert('Invalid BSP file: too short.');
      return;
    }

    const header = parseBspHeader(fileBytes);
    if (!header) {
      alert('Invalid BSP file: bad magic or header.');
      return;
    }

    stopFlashTimer();
    resetScaState();

    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    const dataOffset = BSP.HEADER_SIZE; // 70
    const hasGiga = header.hasGiga;
    const hasBorder = header.hasBorder;

    let data;
    let newInternalPicture = null;

    if (!hasGiga && !hasBorder) {
      // Screen only: 6912 bytes
      data = new Uint8Array(SCREEN.TOTAL_SIZE);
      data.set(fileBytes.subarray(dataOffset, dataOffset + SCREEN.TOTAL_SIZE));

      if (typeof importBsp === 'function') {
        newInternalPicture = importBsp(fileBytes, file.name);
      }

    } else if (!hasGiga && hasBorder) {
      // Screen + border: use BSC layout (11136 bytes)
      data = new Uint8Array(BSC.TOTAL_SIZE);
      // Copy screen (6912 bytes)
      data.set(fileBytes.subarray(dataOffset, dataOffset + SCREEN.TOTAL_SIZE));
      // Decode RLE border → raw 4224 at offset 6912
      const borderRaw = decodeBspBorder(fileBytes, dataOffset + SCREEN.TOTAL_SIZE,
        fileBytes.length - dataOffset - SCREEN.TOTAL_SIZE);
      data.set(borderRaw, BSC.BORDER_OFFSET);

      if (typeof importBsp === 'function') {
        newInternalPicture = importBsp(fileBytes, file.name);
      }

    } else if (hasGiga && !hasBorder) {
      // Gigascreen: 2 × 6912 = 13824 bytes (IMG layout)
      const totalSize = SCREEN.TOTAL_SIZE * 2;
      data = new Uint8Array(totalSize);
      data.set(fileBytes.subarray(dataOffset, dataOffset + totalSize));

      if (typeof importBsp === 'function') {
        newInternalPicture = importBsp(fileBytes, file.name);
      }

    } else {
      // Gigascreen + border
      // Layout: [header:70][secondBorderOffset:2][screen1:6912][screen2:6912][border1_RLE][border2_RLE]
      const screensStart = dataOffset + 2; // offset 72, after 2-byte secondBorderOffset
      const totalSize = SCREEN.TOTAL_SIZE * 2;
      data = new Uint8Array(totalSize);
      data.set(fileBytes.subarray(screensStart, screensStart + totalSize));

      if (typeof importBsp === 'function') {
        newInternalPicture = importBsp(fileBytes, file.name);
      }
    }

    initUlaPlusMode(data, FORMAT.UNKNOWN);

    // Store BSP metadata on picture
    if (newInternalPicture) {
      newInternalPicture.bspTitle = header.title;
      newInternalPicture.bspAuthor = header.author;
      newInternalPicture.bspConfig = header.config;
      newInternalPicture.bspBorderColor = header.borderColor;
    }

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.BSP, data, newInternalPicture, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.BSP;
    currentPicture = newInternalPicture;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

// ============================================================================
// NXI / SL2 (ZX Spectrum Next Layer 2) format support
// ============================================================================

/**
 * Checks if a file is an NXI file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isNxiFile(fileName) {
  return fileName.toLowerCase().endsWith('.nxi');
}

/**
 * Checks if a file is an SL2 file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isSl2File(fileName) {
  return fileName.toLowerCase().endsWith('.sl2');
}

/**
 * Checks if a file is a LoRes file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isLoresFile(fileName) {
  return fileName.toLowerCase().endsWith('.slr');
}

/**
 * Checks if a file is a LoRes Radastan file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isLoresRadFile(fileName) {
  return fileName.toLowerCase().endsWith('.rad');
}

/**
 * Parses a 512-byte NXI palette into 256 [r,g,b] entries.
 * Each entry is 2 bytes: byte0 = RRRGGGBB, byte1 = P000000B (LSB of blue).
 * RGB333 → RGB888: Math.round(v * 255 / 7).
 * @param {Uint8Array} data - at least 512 bytes
 * @returns {number[][]} 256 entries of [r, g, b]
 */
function parseNxiPalette(data) {
  const palette = new Array(NXI.PALETTE_ENTRIES);
  for (let i = 0; i < NXI.PALETTE_ENTRIES; i++) {
    const byte0 = data[i * 2];
    const byte1 = data[i * 2 + 1];
    const r3 = (byte0 >> 5) & 7;
    const g3 = (byte0 >> 2) & 7;
    const b3 = ((byte0 & 3) << 1) | (byte1 & 1);
    palette[i] = [
      Math.round(r3 * 255 / 7),
      Math.round(g3 * 255 / 7),
      Math.round(b3 * 255 / 7)
    ];
  }
  return palette;
}

/**
 * Generates the default ZX Spectrum Next identity RGB332 palette (256 entries).
 * Index i = RRRGGGBB → r3 = (i>>5)&7, g3 = (i>>2)&7, b2 = i&3 → b3 = b2<<1|b2>>1.
 * @returns {number[][]} 256 entries of [r, g, b]
 */
function generateDefaultNextPalette() {
  const palette = new Array(256);
  for (let i = 0; i < 256; i++) {
    const r3 = (i >> 5) & 7;
    const g3 = (i >> 2) & 7;
    const b2 = i & 3;
    // Expand 2-bit blue to 3-bit: replicate top bit into bottom
    const b3 = (b2 << 1) | (b2 >> 1);
    palette[i] = [
      Math.round(r3 * 255 / 7),
      Math.round(g3 * 255 / 7),
      Math.round(b3 * 255 / 7)
    ];
  }
  return palette;
}

/**
 * Parses a 32-byte NXI 4bpp palette into 16 [r,g,b] entries.
 * Same RGB333 encoding as the standard palette but only 16 entries.
 * @param {Uint8Array} data - at least 32 bytes
 * @returns {number[][]} 16 entries of [r, g, b]
 */
function parseNxi4bppPalette(data) {
  const palette = new Array(NXI.PALETTE_ENTRIES_4BPP);
  for (let i = 0; i < NXI.PALETTE_ENTRIES_4BPP; i++) {
    const byte0 = data[i * 2];
    const byte1 = data[i * 2 + 1];
    const r3 = (byte0 >> 5) & 7;
    const g3 = (byte0 >> 2) & 7;
    const b3 = ((byte0 & 3) << 1) | (byte1 & 1);
    palette[i] = [
      Math.round(r3 * 255 / 7),
      Math.round(g3 * 255 / 7),
      Math.round(b3 * 255 / 7)
    ];
  }
  return palette;
}

/**
 * Parses a GRB332-encoded palette (1 byte per entry) into [r,g,b] arrays.
 * Used by ZX-Uno Radastan files with embedded 16-byte palette.
 * @param {Uint8Array} data - palette bytes
 * @param {number} count - number of entries
 * @returns {number[][]} entries of [r, g, b]
 */
function parseGrb332Palette(data, count) {
  const palette = new Array(count);
  for (let i = 0; i < count; i++) {
    const byte = data[i] || 0;
    const g3 = (byte >> 5) & 7;
    const r3 = (byte >> 2) & 7;
    const b2 = byte & 3;
    palette[i] = [
      Math.round(r3 * 255 / 7),
      Math.round(g3 * 255 / 7),
      Math.round(b2 * 255 / 3)
    ];
  }
  return palette;
}

/**
 * Generates the default 16-color palette for 4bpp mode (first 16 entries of RGB332).
 * @returns {number[][]} 16 entries of [r, g, b]
 */
function generateDefaultNext4bppPalette() {
  return generateDefaultNextPalette().slice(0, 16);
}

/**
 * Renders an NXI or SL2 screen using the resolved palette.
 * Supports three modes: 256×192 (row-major), 320×256 (column-major 8bpp),
 * 640×256 (column-major 4bpp packed).
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderNxiScreen(ctx, borderOffset) {
  if (!nxiResolvedPalette) return;

  let width, height;
  if (nxiLayer2Mode === '320x256') { width = 320; height = 256; }
  else if (nxiLayer2Mode === '640x256') { width = 640; height = 256; }
  else { width = 256; height = 192; }

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  const pixelOffset = getNxiPixelOffset();

  if (nxiLayer2Mode === '640x256') {
    // 4bpp column-major: 2 pixels per byte, address = (x/2)*256 + y
    for (let x = 0; x < 640; x += 2) {
      const col = (x >> 1) * 256;
      for (let y = 0; y < 256; y++) {
        const byteVal = screenData[pixelOffset + col + y] || 0;
        const idx0 = (byteVal >> 4) & 0x0F;
        const idx1 = byteVal & 0x0F;
        const rgb0 = nxiResolvedPalette[idx0];
        const rgb1 = nxiResolvedPalette[idx1];
        const dst0 = (y * 640 + x) * 4;
        const dst1 = (y * 640 + x + 1) * 4;
        pixels[dst0] = rgb0[0]; pixels[dst0 + 1] = rgb0[1]; pixels[dst0 + 2] = rgb0[2]; pixels[dst0 + 3] = 255;
        pixels[dst1] = rgb1[0]; pixels[dst1 + 1] = rgb1[1]; pixels[dst1 + 2] = rgb1[2]; pixels[dst1 + 3] = 255;
      }
    }
  } else if (nxiLayer2Mode === '320x256') {
    // 8bpp column-major: address = x*256 + y
    for (let x = 0; x < 320; x++) {
      const col = x * 256;
      for (let y = 0; y < 256; y++) {
        const colorIdx = screenData[pixelOffset + col + y] || 0;
        const rgb = nxiResolvedPalette[colorIdx];
        const dst = (y * 320 + x) * 4;
        pixels[dst] = rgb[0]; pixels[dst + 1] = rgb[1]; pixels[dst + 2] = rgb[2]; pixels[dst + 3] = 255;
      }
    }
  } else {
    // 256×192 row-major (original mode)
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const srcIdx = pixelOffset + y * 256 + x;
        const colorIdx = screenData[srcIdx] || 0;
        const rgb = nxiResolvedPalette[colorIdx];
        const dstIdx = (y * 256 + x) * 4;
        pixels[dstIdx] = rgb[0];
        pixels[dstIdx + 1] = rgb[1];
        pixels[dstIdx + 2] = rgb[2];
        pixels[dstIdx + 3] = 255;
      }
    }
  }

  const temp = getTempRenderCanvas(width, height);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  const scaleY = getPixelScaleY();
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, width * zoom, height * scaleY * zoom);
}

/**
 * Renders LoRes screen (128×96, 256-color, row-major pixel data).
 * Uses nxiResolvedPalette for color lookup.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} borderOffset
 */
function renderLoresScreen(ctx, borderOffset) {
  if (!nxiResolvedPalette) return;

  const W = LORES.WIDTH, H = LORES.HEIGHT;
  const imageData = ctx.createImageData(W, H);
  const pixels = imageData.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const colorIdx = screenData[y * W + x] || 0;
      const rgb = nxiResolvedPalette[colorIdx];
      const dst = (y * W + x) * 4;
      pixels[dst] = rgb[0];
      pixels[dst + 1] = rgb[1];
      pixels[dst + 2] = rgb[2];
      pixels[dst + 3] = 255;
    }
  }

  const temp = getTempRenderCanvas(W, H);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  const scaleY = getPixelScaleY();
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, W * zoom, H * scaleY * zoom);
}

/**
 * Renders a LoRes Radastan 128×96 16-color 4bpp screen.
 * Packed nibbles: high nibble = left pixel, low nibble = right pixel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} borderOffset
 */
function renderLoresRadScreen(ctx, borderOffset) {
  if (!nxiResolvedPalette) return;

  const W = LORES_RAD.WIDTH, H = LORES_RAD.HEIGHT;
  const imageData = ctx.createImageData(W, H);
  const pixels = imageData.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const byteOffset = y * LORES_RAD.BYTES_PER_ROW + (x >> 1);
      const byteVal = screenData[byteOffset] || 0;
      const colorIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      const rgb = nxiResolvedPalette[colorIdx] || [0, 0, 0];
      const dst = (y * W + x) * 4;
      pixels[dst] = rgb[0];
      pixels[dst + 1] = rgb[1];
      pixels[dst + 2] = rgb[2];
      pixels[dst + 3] = 255;
    }
  }

  const temp = getTempRenderCanvas(W, H);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  applyRenderSmoothing(ctx);
  const scaleY = getPixelScaleY();
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, W * zoom, H * scaleY * zoom);
}

/**
 * Loads an NXI file (ZX Spectrum Next Layer 2 with embedded palette).
 * Supports 256×192 (49664), 320×256 (82432), and 640×256 (81952) modes.
 * @param {File} file
 */
function loadNxiFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const sz = buffer.byteLength;
    if (sz !== NXI.TOTAL_SIZE && sz !== NXI.TOTAL_SIZE_320 && sz !== NXI.TOTAL_SIZE_640) {
      alert('Invalid NXI file: unexpected size ' + sz + ' bytes.');
      return;
    }

    stopFlashTimer();
    resetScaState();

    // Determine mode from file size (unambiguous)
    if (sz === NXI.TOTAL_SIZE_320) nxiLayer2Mode = '320x256';
    else if (sz === NXI.TOTAL_SIZE_640) nxiLayer2Mode = '640x256';
    else nxiLayer2Mode = '256x192';

    const data = new Uint8Array(buffer);
    if (nxiLayer2Mode === '640x256') {
      nxiResolvedPalette = parseNxi4bppPalette(data);
    } else {
      nxiResolvedPalette = parseNxiPalette(data);
    }
    initUlaPlusMode(data, FORMAT.UNKNOWN);

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.NXI, data, null, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    // Fallback if editor not loaded or max pictures reached
    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.NXI;
    currentPicture = null;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Loads an SL2 file (ZX Spectrum Next Layer 2 raw pixels, default palette).
 * Supports 256×192 (49152/49280) and extended (81920, ambiguous) modes.
 * @param {File} file
 */
function loadSl2File(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const sz = buffer.byteLength;
    const validSizes = [SL2.RAW_SIZE, SL2.HEADER_SIZE, SL2.EXT_SIZE,
      SL2.TOTAL_SIZE_WITH_PAL, SL2.EXT_SIZE_WITH_PAL, SL2.EXT_SIZE_WITH_PAL_4BPP];
    if (validSizes.indexOf(sz) === -1) {
      alert('Invalid SL2 file: unsupported size ' + sz + ' bytes.');
      return;
    }

    if (sz === SL2.EXT_SIZE || sz === SL2.EXT_SIZE_WITH_PAL || sz === SL2.EXT_SIZE_WITH_PAL_4BPP) {
      // Extended SL2: disambiguation dialog (extract palette if present)
      const fullData = new Uint8Array(buffer);
      if (sz === SL2.EXT_SIZE_WITH_PAL) {
        // 8bpp 320×256 with 256-entry palette (512 bytes)
        const palData = fullData.slice(SL2.EXT_SIZE);
        nxiResolvedPalette = parseNxiPalette(palData);
        showSl2DisambiguationDialog(fullData.slice(0, SL2.EXT_SIZE), file.name);
      } else if (sz === SL2.EXT_SIZE_WITH_PAL_4BPP) {
        // 4bpp 640×256 with 16-entry palette (32 bytes) — skip disambiguation
        const palData = fullData.slice(SL2.EXT_SIZE);
        nxiResolvedPalette = parseNxi4bppPalette(palData);
        finishLoadSl2Extended(fullData.slice(0, SL2.EXT_SIZE), file.name, '640x256');
      } else {
        nxiResolvedPalette = null;  // Reset so previews use default palette
        showSl2DisambiguationDialog(fullData, file.name);
      }
      return;
    }

    // 256×192 path
    stopFlashTimer();
    resetScaState();

    nxiLayer2Mode = '256x192';
    const fullData = new Uint8Array(buffer);
    const data = sz === SL2.TOTAL_SIZE_WITH_PAL
      ? fullData.slice(0, SL2.RAW_SIZE)
      : fullData;

    // Use embedded palette if present (512 bytes after pixel data), otherwise default
    if (sz === SL2.TOTAL_SIZE_WITH_PAL) {
      const palData = fullData.slice(SL2.RAW_SIZE);
      nxiResolvedPalette = parseNxiPalette(palData);
    } else {
      nxiResolvedPalette = generateDefaultNextPalette();
    }
    initUlaPlusMode(data, FORMAT.UNKNOWN);

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.SL2, data, null, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    // Fallback if editor not loaded or max pictures reached
    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.SL2;
    currentPicture = null;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Loads a LoRes (.slr) file — 12288-byte raw pixel dump, 128×96, 256-color.
 * @param {File} file
 */
function loadLoresFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const sz = buffer.byteLength;

    // Redirect Radastan-sized .slr files (6144, 6160, or 6176 bytes) to loadLoresRadFile
    if (sz === LORES_RAD.PIXEL_DATA_SIZE || sz === LORES_RAD.TOTAL_SIZE_WITH_GRB_PAL || sz === LORES_RAD.TOTAL_SIZE_WITH_PAL) {
      loadLoresRadFile(file);
      return;
    }

    if (sz !== LORES.PIXEL_DATA_SIZE && sz !== LORES.TOTAL_SIZE_WITH_PAL) {
      alert('Invalid SLR file: expected ' + LORES.PIXEL_DATA_SIZE + ' or ' + LORES.TOTAL_SIZE_WITH_PAL + ' bytes, got ' + sz + '.');
      return;
    }

    stopFlashTimer();
    resetScaState();

    nxiLayer2Mode = '256x192'; // not used for LoRes but reset to default
    const fullData = new Uint8Array(buffer);
    const data = sz === LORES.TOTAL_SIZE_WITH_PAL
      ? fullData.slice(0, LORES.PIXEL_DATA_SIZE)
      : fullData;

    // Use embedded palette if present (512 bytes after pixel data), otherwise default
    if (sz === LORES.TOTAL_SIZE_WITH_PAL) {
      const palData = fullData.slice(LORES.PIXEL_DATA_SIZE);
      nxiResolvedPalette = parseNxiPalette(palData);
    } else {
      nxiResolvedPalette = generateDefaultNextPalette();
    }
    initUlaPlusMode(data, FORMAT.UNKNOWN);

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.LORES, data, null, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    // Fallback if editor not loaded or max pictures reached
    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.LORES;
    currentPicture = null;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Loads a LoRes Radastan 128×96 16-color 4bpp file (.rad)
 * @param {File} file - The file to load
 */
function loadLoresRadFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const sz = buffer.byteLength;
    if (sz !== LORES_RAD.PIXEL_DATA_SIZE && sz !== LORES_RAD.TOTAL_SIZE_WITH_GRB_PAL && sz !== LORES_RAD.TOTAL_SIZE_WITH_PAL) {
      alert('Invalid RAD file: expected ' + LORES_RAD.PIXEL_DATA_SIZE + ', ' + LORES_RAD.TOTAL_SIZE_WITH_GRB_PAL + ', or ' + LORES_RAD.TOTAL_SIZE_WITH_PAL + ' bytes, got ' + sz + '.');
      return;
    }

    stopFlashTimer();
    resetScaState();

    nxiLayer2Mode = '256x192';
    const fullData = new Uint8Array(buffer);
    const data = sz > LORES_RAD.PIXEL_DATA_SIZE
      ? fullData.slice(0, LORES_RAD.PIXEL_DATA_SIZE)
      : fullData;

    // Use embedded palette if present, otherwise default
    if (sz === LORES_RAD.TOTAL_SIZE_WITH_PAL) {
      // ZX Next: 32-byte RGB333 palette (16 entries × 2 bytes)
      const palData = fullData.slice(LORES_RAD.PIXEL_DATA_SIZE);
      nxiResolvedPalette = parseNxi4bppPalette(palData);
      radPaletteSize = 32;
    } else if (sz === LORES_RAD.TOTAL_SIZE_WITH_GRB_PAL) {
      // ZX-Uno Radastan: 16-byte GRB332 palette (16 entries × 1 byte)
      const palData = fullData.slice(LORES_RAD.PIXEL_DATA_SIZE);
      nxiResolvedPalette = parseGrb332Palette(palData, 16);
      radPaletteSize = 16;
    } else {
      nxiResolvedPalette = generateDefaultNext4bppPalette();
      radPaletteSize = 0;
    }
    initUlaPlusMode(data, FORMAT.UNKNOWN);

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(file.name, FORMAT.LORES_RAD, data, null, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
    }

    // Fallback if editor not loaded or max pictures reached
    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    screenData = data;
    currentFileName = file.name;
    currentFormat = FORMAT.LORES_RAD;
    currentPicture = null;

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Shows the SL2 disambiguation dialog for 81920-byte files.
 * Renders preview images for both 320×256 and 640×256 interpretations.
 * @param {Uint8Array} data - Raw pixel data (81920 bytes)
 * @param {string} fileName - Original file name
 */
function showSl2DisambiguationDialog(data, fileName) {
  const overlay = document.getElementById('sl2DisambiguationOverlay');
  if (!overlay) {
    // Dialog not present in HTML — default to 320×256
    finishLoadSl2Extended(data, fileName, '320x256');
    return;
  }

  // Render 320×256 preview (8bpp column-major)
  const canvas320 = /** @type {HTMLCanvasElement|null} */ (document.getElementById('sl2Preview320'));
  if (canvas320) {
    const ctx = canvas320.getContext('2d');
    if (ctx) {
      const pal = nxiResolvedPalette || generateDefaultNextPalette();
      const img = ctx.createImageData(320, 256);
      const px = img.data;
      for (let x = 0; x < 320; x++) {
        const col = x * 256;
        for (let y = 0; y < 256; y++) {
          const colorIdx = data[col + y] || 0;
          const rgb = pal[colorIdx];
          const dst = (y * 320 + x) * 4;
          px[dst] = rgb[0]; px[dst + 1] = rgb[1]; px[dst + 2] = rgb[2]; px[dst + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  // Render 640×256 preview (4bpp column-major, drawn at half width into 320×256 canvas)
  const canvas640 = /** @type {HTMLCanvasElement|null} */ (document.getElementById('sl2Preview640'));
  if (canvas640) {
    const ctx = canvas640.getContext('2d');
    if (ctx) {
      const pal = nxiResolvedPalette || generateDefaultNext4bppPalette();
      // Render at full 640×256, then scale down
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 640;
      tempCanvas.height = 256;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        const img = tempCtx.createImageData(640, 256);
        const px = img.data;
        for (let x = 0; x < 640; x += 2) {
          const col = (x >> 1) * 256;
          for (let y = 0; y < 256; y++) {
            const byteVal = data[col + y] || 0;
            const idx0 = (byteVal >> 4) & 0x0F;
            const idx1 = byteVal & 0x0F;
            const rgb0 = pal[idx0];
            const rgb1 = pal[idx1];
            const dst0 = (y * 640 + x) * 4;
            const dst1 = (y * 640 + x + 1) * 4;
            px[dst0] = rgb0[0]; px[dst0 + 1] = rgb0[1]; px[dst0 + 2] = rgb0[2]; px[dst0 + 3] = 255;
            px[dst1] = rgb1[0]; px[dst1 + 1] = rgb1[1]; px[dst1 + 2] = rgb1[2]; px[dst1 + 3] = 255;
          }
        }
        tempCtx.putImageData(img, 0, 0);
        // Scale to 320×256 for display
        canvas640.width = 320;
        canvas640.height = 256;
        ctx.drawImage(tempCanvas, 0, 0, 320, 256);
      }
    }
  }

  // Show dialog
  overlay.style.display = '';

  // Wire up click handlers (replace to avoid stacking listeners)
  const choice320 = document.getElementById('sl2Choice320');
  const choice640 = document.getElementById('sl2Choice640');
  const cancelBtn = document.getElementById('sl2DisambiguationCancel');

  function closeDialog() {
    overlay.style.display = 'none';
    if (choice320) choice320.onclick = null;
    if (choice640) choice640.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;
  }

  if (choice320) {
    choice320.onclick = function() {
      closeDialog();
      finishLoadSl2Extended(data, fileName, '320x256');
    };
  }
  if (choice640) {
    choice640.onclick = function() {
      closeDialog();
      finishLoadSl2Extended(data, fileName, '640x256');
    };
  }
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeDialog();
    };
  }
}

/**
 * Completes loading an extended SL2 file after mode disambiguation.
 * @param {Uint8Array} data - Raw pixel data (81920 bytes)
 * @param {string} fileName - Original file name
 * @param {'320x256'|'640x256'} mode - Selected Layer 2 mode
 */
function finishLoadSl2Extended(data, fileName, mode) {
  stopFlashTimer();
  resetScaState();

  nxiLayer2Mode = mode;
  // Keep embedded palette if already set by loadSl2File, otherwise use default
  if (!nxiResolvedPalette) {
    if (mode === '640x256') {
      nxiResolvedPalette = generateDefaultNext4bppPalette();
    } else {
      nxiResolvedPalette = generateDefaultNextPalette();
    }
  }
  initUlaPlusMode(data, FORMAT.UNKNOWN);

  if (typeof addPicture === 'function') {
    const pictureResult = addPicture(fileName, FORMAT.SL2, data, null, true);
    if (pictureResult >= 0) {
      updateFlashTimer();
      return;
    }
  }

  // Fallback if editor not loaded or max pictures reached
  if (typeof saveCurrentPictureState === 'function') {
    saveCurrentPictureState();
  }

  screenData = data;
  currentFileName = fileName;
  currentFormat = FORMAT.SL2;
  currentPicture = null;

  toggleScaControlsVisibility();
  toggleFormatControlsVisibility();
  updateScaControls();
  updateFileInfo();
  renderScreen();
  if (typeof updateEditorState === 'function') updateEditorState();
  if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
  updateFlashTimer();
  if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
}

/**
 * Renders an MLT preview into a canvas for the disambiguation dialog.
 * Uses standard ZX palette only (no ULA+/ULANext).
 * @param {HTMLCanvasElement} canvas - Target 256×192 canvas
 * @param {Uint8Array} data - 12288-byte MLT data
 * @param {boolean} linear - true = linear bitmap, false = ZX-interleaved
 */
function renderMltPreview(canvas, data, linear) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(256, 192);
  const px = img.data;
  for (let y = 0; y < 192; y++) {
    let bitmapBase;
    if (linear) {
      bitmapBase = y * 32;
    } else {
      const third = Math.floor(y / 64);
      const charRow = Math.floor((y % 64) / 8);
      const pixelLine = y % 8;
      bitmapBase = third * 2048 + charRow * 32 + pixelLine * 256;
    }
    for (let col = 0; col < 32; col++) {
      const byte = data[bitmapBase + col];
      const attr = data[6144 + y * 32 + col];
      const ink = attr & 0x07;
      const paper = (attr >> 3) & 0x07;
      const bright = (attr & 0x40) ? 1 : 0;
      const palInk = bright ? ZX_PALETTE_RGB.BRIGHT[ink] : ZX_PALETTE_RGB.REGULAR[ink];
      const palPaper = bright ? ZX_PALETTE_RGB.BRIGHT[paper] : ZX_PALETTE_RGB.REGULAR[paper];
      for (let bit = 0; bit < 8; bit++) {
        const isInk = (byte >> (7 - bit)) & 1;
        const rgb = isInk ? palInk : palPaper;
        const dst = (y * 256 + col * 8 + bit) * 4;
        px[dst] = rgb[0]; px[dst + 1] = rgb[1]; px[dst + 2] = rgb[2]; px[dst + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Shows the MLT disambiguation dialog for 12288-byte files that could be
 * either standard MLT (ZX-interleaved bitmap) or multicolor (linear bitmap).
 * Renders preview images for both interpretations.
 * @param {Uint8Array} data - Raw 12288-byte data
 * @param {string} fileName - Original file name
 */
function showMltDisambiguationDialog(data, fileName) {
  const overlay = document.getElementById('mltDisambiguationOverlay');
  if (!overlay) {
    // Dialog not present — default to standard interleaved MLT
    finishLoadMlt(data, fileName, false);
    return;
  }

  const canvasInterleaved = /** @type {HTMLCanvasElement|null} */ (document.getElementById('mltPreviewInterleaved'));
  if (canvasInterleaved) renderMltPreview(canvasInterleaved, data, false);

  const canvasLinear = /** @type {HTMLCanvasElement|null} */ (document.getElementById('mltPreviewLinear'));
  if (canvasLinear) renderMltPreview(canvasLinear, data, true);

  overlay.style.display = '';

  const choiceInterleaved = document.getElementById('mltChoiceInterleaved');
  const choiceLinear = document.getElementById('mltChoiceLinear');
  const cancelBtn = document.getElementById('mltDisambiguationCancel');

  function closeDialog() {
    overlay.style.display = 'none';
    if (choiceInterleaved) choiceInterleaved.onclick = null;
    if (choiceLinear) choiceLinear.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;
  }

  if (choiceInterleaved) {
    choiceInterleaved.onclick = function() {
      closeDialog();
      finishLoadMlt(data, fileName, false);
    };
  }
  if (choiceLinear) {
    choiceLinear.onclick = function() {
      closeDialog();
      finishLoadMlt(data, fileName, true);
    };
  }
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeDialog();
    };
  }
}

/**
 * Completes loading an MLT file after disambiguation.
 * @param {Uint8Array} data - 12288-byte MLT data
 * @param {string} fileName - Original file name
 * @param {boolean} linear - true = linear bitmap (multicolor), false = ZX-interleaved (standard MLT)
 */
function finishLoadMlt(data, fileName, linear) {
  stopFlashTimer();
  resetScaState();
  initUlaPlusMode(data, FORMAT.MLT);

  let newInternalPicture = null;
  if (typeof importPicture === 'function') {
    const importOpts = linear ? { linear: true } : undefined;
    newInternalPicture = importPicture(FORMAT.MLT, data, fileName, importOpts);
  }

  if (typeof addPicture === 'function') {
    const result = addPicture(fileName, FORMAT.MLT, data, newInternalPicture, true);
    if (result >= 0) {
      updateFlashTimer();
      return;
    }
  }

  // Fallback if editor not loaded or max pictures reached
  if (typeof saveCurrentPictureState === 'function') {
    saveCurrentPictureState();
  }

  screenData = data;
  currentFileName = fileName;
  currentFormat = FORMAT.MLT;
  currentPicture = newInternalPicture;

  toggleScaControlsVisibility();
  toggleFormatControlsVisibility();
  updateScaControls();
  updateFileInfo();
  renderScreen();
  if (typeof updateEditorState === 'function') updateEditorState();
  if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
  updateFlashTimer();
  if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
}

/**
 * Checks if a file is a chr$ file by extension
 * @param {string} fileName
 * @returns {boolean}
 */
function isChrFile(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.ch$') || lower.endsWith('.chr$') || lower.endsWith('.ch-');
}

/**
 * Parses a chr$ binary file into linear screenData.
 * chr$ format: 7-byte header + interleaved cell data, row-major.
 * Header: "chr$" (4 bytes) + width_cells (1 byte) + height_cells (1 byte) + bytes_per_cell (1 byte).
 * bpc=9:  standard (8 bitmap + 1 attr per cell)  → screenData = bitmap + attrs
 * bpc=18: gigascreen (2 × (8 bitmap + 1 attr))   → screenData = bm1 + at1 + bm2 + at2
 * @param {ArrayBuffer} buffer - Raw file content
 * @returns {{ data: Uint8Array, width: number, height: number, gigascreen: boolean } | null}
 */
function parseChrFile(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 7) {
    alert('Invalid chr$ file: too small.');
    return null;
  }

  // Validate magic "chr$"
  if (bytes[0] !== 0x63 || bytes[1] !== 0x68 || bytes[2] !== 0x72 || bytes[3] !== 0x24) {
    alert('Invalid chr$ file: missing "chr$" magic header.');
    return null;
  }

  const widthCells = bytes[4];
  const heightCells = bytes[5];
  const bytesPerCell = bytes[6];

  if (widthCells === 0 || heightCells === 0) {
    alert('Invalid chr$ file: zero dimensions.');
    return null;
  }

  if (bytesPerCell !== 9 && bytesPerCell !== 18) {
    alert('Invalid chr$ file: unsupported bytes-per-cell value ' + bytesPerCell + ' (expected 9 or 18).');
    return null;
  }

  const expectedDataSize = widthCells * heightCells * bytesPerCell;
  if (bytes.length < 7 + expectedDataSize) {
    alert('Invalid chr$ file: data truncated (expected ' + (7 + expectedDataSize) + ' bytes, got ' + bytes.length + ').');
    return null;
  }

  const pixelWidth = widthCells * 8;
  const pixelHeight = heightCells * 8;
  const cols = widthCells;
  const bitmapSize = cols * pixelHeight;
  const attrSize = widthCells * heightCells;
  const isGigascreen = bytesPerCell === 18;
  const frameCount = isGigascreen ? 2 : 1;

  // Layout: frame1_bitmap + frame1_attrs [+ frame2_bitmap + frame2_attrs]
  const screenData = new Uint8Array((bitmapSize + attrSize) * frameCount);

  let srcOffset = 7; // skip header
  for (let cellRow = 0; cellRow < heightCells; cellRow++) {
    for (let cellCol = 0; cellCol < widthCells; cellCol++) {
      for (let frame = 0; frame < frameCount; frame++) {
        const frameOffset = frame * (bitmapSize + attrSize);
        // 8 bitmap bytes (one per pixel row in the cell)
        for (let line = 0; line < 8; line++) {
          const y = cellRow * 8 + line;
          screenData[frameOffset + y * cols + cellCol] = bytes[srcOffset++];
        }
        // 1 attribute byte
        screenData[frameOffset + bitmapSize + cellRow * cols + cellCol] = bytes[srcOffset++];
      }
    }
  }

  return {
    data: screenData,
    width: pixelWidth,
    height: pixelHeight,
    gigascreen: isGigascreen
  };
}

/**
 * Exports a chr$ Picture back to binary chr$ format.
 * Re-interleaves linear bitmap + attrs into cell-based layout.
 * Supports both standard (bpc=9) and gigascreen (bpc=18) Pictures.
 * @param {Picture} picture - Source picture
 * @returns {Uint8Array} chr$ binary data
 */
function exportChrFile(picture) {
  const width = picture.width;
  const height = picture.height;
  const cols = picture.cols;
  const widthCells = cols;
  const heightCells = height >> 3;
  const isGigascreen = picture.planeCount === 2 && picture.colorMode === 'gigascreen';
  const bytesPerCell = isGigascreen ? 18 : 9;
  const frameCount = isGigascreen ? 2 : 1;

  const totalSize = 7 + widthCells * heightCells * bytesPerCell;
  const output = new Uint8Array(totalSize);

  // Header
  output[0] = 0x63; // 'c'
  output[1] = 0x68; // 'h'
  output[2] = 0x72; // 'r'
  output[3] = 0x24; // '$'
  output[4] = widthCells;
  output[5] = heightCells;
  output[6] = bytesPerCell;

  // Interleave cell data
  let dstOffset = 7;
  for (let cellRow = 0; cellRow < heightCells; cellRow++) {
    for (let cellCol = 0; cellCol < widthCells; cellCol++) {
      for (let frame = 0; frame < frameCount; frame++) {
        const bitmap = picture.planes[frame].bitmap;
        const attrs = picture.planes[frame].attrs;
        // 8 bitmap bytes
        for (let line = 0; line < 8; line++) {
          const y = cellRow * 8 + line;
          output[dstOffset++] = bitmap[y * cols + cellCol];
        }
        // 1 attribute byte
        output[dstOffset++] = attrs[cellRow * cols + cellCol];
      }
    }
  }

  return output;
}

/**
 * Loads a chr$ file
 * @param {File} file - The chr$ file to load
 */
function loadChrFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const result = parseChrFile(buffer);
    if (!result) return;

    // Stop any existing timers
    stopFlashTimer();
    resetScaState();

    const { data, width, height, gigascreen } = result;
    const baseName = file.name.replace(/\.(ch\$|chr\$|ch-)$/i, '');
    const fileName = baseName + '.ch$';
    const cols = width >> 3;
    const bitmapSize = cols * height;
    const attrSize = cols * (height >> 3);
    const frameSize = bitmapSize + attrSize;

    if (typeof saveCurrentPictureState === 'function') {
      saveCurrentPictureState();
    }

    initUlaPlusMode(data, FORMAT.UNKNOWN);

    let newInternalPicture = null;
    if (gigascreen) {
      // Gigascreen chr$: two frames, each with linear bitmap + attrs
      if (typeof makePicture === 'function') {
        // Create a 2-plane Picture with linear bitmaps
        newInternalPicture = makePicture({
          sourceFormat: 'ch$',
          fileName: fileName,
          width: width,
          height: height,
          attrCellHeight: 8,
          planeCount: 2,
          contentMode: 'pixel',
          colorMode: 'gigascreen'
        });
        // Frame 1: data[0..frameSize)
        newInternalPicture.planes[0].bitmap.set(data.subarray(0, bitmapSize));
        newInternalPicture.planes[0].attrs.set(data.subarray(bitmapSize, frameSize));
        // Frame 2: data[frameSize..2*frameSize)
        newInternalPicture.planes[1].bitmap.set(data.subarray(frameSize, frameSize + bitmapSize));
        newInternalPicture.planes[1].attrs.set(data.subarray(frameSize + bitmapSize, frameSize * 2));
      }
    } else {
      // Standard chr$: single frame
      const bitmap = data.subarray(0, bitmapSize);
      const attrs = data.subarray(bitmapSize);
      if (typeof importZxp === 'function') {
        newInternalPicture = importZxp(bitmap, attrs, fileName, width, height, 8, null);
      }
      // Override sourceFormat to 'ch$' so sync/export use correct format
      if (newInternalPicture) {
        newInternalPicture.sourceFormat = 'ch$';
      }
    }

    if (typeof addPicture === 'function') {
      const pictureResult = addPicture(fileName, FORMAT.CHR, data, newInternalPicture, true);
      if (pictureResult >= 0) {
        updateFlashTimer();
        return;
      }
      screenData = data;
      currentFileName = fileName;
      currentFormat = FORMAT.CHR;
      currentPicture = newInternalPicture;
    } else {
      screenData = data;
      currentFileName = fileName;
      currentFormat = FORMAT.CHR;
      currentPicture = newInternalPicture;
    }

    toggleScaControlsVisibility();
    toggleFormatControlsVisibility();
    updateScaControls();
    updateFileInfo();
    renderScreen();
    if (typeof updateEditorState === 'function') updateEditorState();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') renderPreview();
    updateFlashTimer();
    if (typeof updatePictureTabBar === 'function') updatePictureTabBar();
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

/**
 * Loads screen data from a file
 * @param {File} file - The file to load
 */
function loadScreenFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', function(event) {
    const buffer = event.target?.result;
    if (buffer instanceof ArrayBuffer) {
      // Stop any existing timers
      stopFlashTimer();
      resetScaState();

      let data = new Uint8Array(buffer);
      const fileName = file.name;
      let format = detectFormat(fileName, data.length);

      // Handle SCA format separately (animations don't participate in multi-picture)
      if (format === FORMAT.SCA) {
        // Mark that we're leaving multi-picture mode (prevents saving SCA data over previous picture)
        if (typeof activePictureIndex !== 'undefined') {
          activePictureIndex = -1;
        }

        screenData = data;
        currentFileName = fileName;
        currentFormat = format;
        currentPicture = null;
        scaHeader = parseScaHeader(screenData);
        if (scaHeader) {
          // Use border color from SCA header
          borderColor = scaHeader.borderColor;
          if (borderColorSelect) {
            borderColorSelect.value = String(borderColor);
          }
          // Auto-start animation
          startScaAnimation();
        } else {
          // Invalid SCA file, fall back to unknown
          currentFormat = FORMAT.UNKNOWN;
        }

        // Hide picture tab bar when viewing SCA
        if (typeof updatePictureTabBar === 'function') {
          updatePictureTabBar();
        }

        toggleScaControlsVisibility();
        toggleFormatControlsVisibility();
        updateScaControls();
        updateFileInfo();
        renderScreen();
        // Update export ASM button state
        if (typeof updateExportAsmButton === 'function') {
          updateExportAsmButton();
        }
        // Disable editor for SCA (non-editable format)
        if (typeof updateEditorState === 'function') {
          updateEditorState();
        }
        return;
      }

      // Check for invalid format (e.g., .img file with wrong size)
      if (format === FORMAT.UNKNOWN) {
        const ext = fileName.toLowerCase().split('.').pop();
        if (ext === 'img') {
          alert(`Invalid Gigascreen file: expected ${GIGASCREEN.TOTAL_SIZE} bytes (2×6912), got ${data.length} bytes.`);
          return;
        }
      }

      // ZX7 compressed files — decompress before further processing
      const fileExt = fileName.toLowerCase().split('.').pop();
      if ((fileExt === 'zx7' || fileExt === 'zx7b') && typeof ZX7 !== 'undefined') {
        try {
          data = fileExt === 'zx7b' ? ZX7.decompressBackwards(data) : ZX7.decompress(data);
        } catch (e) {
          alert('Failed to decompress ZX7 file: ' + e.message);
          return;
        }
        // Strip .zx7/.zx7b and re-detect format from inner extension + decompressed size
        const innerName = fileName.replace(/\.zx7b?$/i, '');
        format = detectFormat(innerName, data.length);
        // Check if RCS reordering needs reversing (.rcs.zx7/.rcs.zx7b → inner ext is .rcs)
        const innerExt = innerName.toLowerCase().split('.').pop();
        if (innerExt === 'rcs' && format === FORMAT.SCR && typeof reorderRcsToScr === 'function') {
          data = reorderRcsToScr(data);
        }
      }

      // ZX0 compressed files — decompress before further processing
      if ((fileExt === 'zx0' || fileExt === 'zx0b') && typeof ZX0 !== 'undefined') {
        try {
          data = fileExt === 'zx0b' ? ZX0.decompress(data, true) : ZX0.decompress(data);
        } catch (e) {
          alert('Failed to decompress ZX0 file: ' + e.message);
          return;
        }
        // Strip .zx0/.zx0b and re-detect format from inner extension + decompressed size
        const innerName = fileName.replace(/\.zx0b?$/i, '');
        format = detectFormat(innerName, data.length);
        // Check if RCS reordering needs reversing (.rcs.zx0/.rcs.zx0b → inner ext is .rcs)
        const innerExt = innerName.toLowerCase().split('.').pop();
        if (innerExt === 'rcs' && format === FORMAT.SCR && typeof reorderRcsToScr === 'function') {
          data = reorderRcsToScr(data);
        }
      }

      // LC compressed files — decompress before further processing
      if (fileExt === 'lc' && typeof LC !== 'undefined') {
        try {
          data = LC.decompressScreen(data);
        } catch (e) {
          alert('Failed to decompress LC file: ' + e.message);
          return;
        }
        const innerName = fileName.replace(/\.lc$/i, '');
        format = detectFormat(innerName, data.length);
      }

      // upkr compressed files — decompress before further processing
      if (fileExt === 'upk' && typeof UPKR !== 'undefined') {
        try {
          data = UPKR.decompress(data, UPKR.configZ80());
        } catch (e) {
          alert('Failed to decompress upkr file: ' + e.message);
          return;
        }
        const innerName = fileName.replace(/\.upk$/i, '');
        format = detectFormat(innerName, data.length);
      }

      // RCS files are SCR data with reordered bitmap bytes — reverse on load
      if (fileExt === 'rcs' && format === FORMAT.SCR && typeof reorderRcsToScr === 'function') {
        data = reorderRcsToScr(data);
      }

      // Save current picture state BEFORE initUlaPlusMode clobbers ULA+ globals
      if (typeof saveCurrentPictureState === 'function') {
        saveCurrentPictureState();
      }

      // Handle ULANext SCR (6912 + 1 mask + RGB333 palette)
      if (format === FORMAT.SCR_ULANEXT) {
        if (initUlaNextMode(data)) {
          // Trim to standard SCR 6912 bytes for rendering
          data = data.slice(0, SCREEN.TOTAL_SIZE);
        } else {
          // Validation failed — fall back to standard SCR
          resetUlaNextMode();
          format = FORMAT.SCR;
          data = data.slice(0, Math.min(data.length, SCREEN.TOTAL_SIZE));
        }
      }

      // Handle MLT with appended ULA+ palette (12352 = 12288 + 64)
      if (format === FORMAT.MLT && data.length === MLT.TOTAL_SIZE_ULAPLUS) {
        // Extract ULA+ palette from the last 64 bytes
        ulaPlusPalette = new Uint8Array(ULAPLUS.PALETTE_SIZE);
        for (let i = 0; i < ULAPLUS.PALETTE_SIZE; i++) {
          ulaPlusPalette[i] = data[MLT.TOTAL_SIZE + i];
        }
        isUlaPlusMode = true;
        resetUlaNextMode(); // Mutual exclusion

        // MLT+ULA+ is Timex Hi-Colour: both bitmap and attrs use ZX-interleaved layout.
        // Trim to 12288 bytes (strip the appended 64-byte ULA+ palette).
        data = data.slice(0, MLT.TOTAL_SIZE);

        // Update ULA+ palette UI
        if (typeof buildUlaPlusGrid === 'function') buildUlaPlusGrid();
        if (typeof buildUlaPlusClassic === 'function') buildUlaPlusClassic();
        if (typeof updateUlaPlusPalette === 'function') updateUlaPlusPalette();
      } else {
        // Initialize ULA+ mode based on format
        initUlaPlusMode(data, format);
      }

      // MLT disambiguation: if 12288-byte file detected as MLT by size but not by
      // a known extension (.mlt or .mc), show a dialog to let the user choose
      // between standard interleaved MLT and linear multicolor.
      if (format === FORMAT.MLT && data.length === MLT.TOTAL_SIZE && !isUlaPlusMode) {
        const fileExt = fileName.toLowerCase().split('.').pop();
        if (fileExt !== 'mlt' && fileExt !== 'mc') {
          showMltDisambiguationDialog(data, fileName);
          return;
        }
      }

      // Create internal picture format for all supported formats
      let newInternalPicture = null;
      if (typeof importPicture === 'function') {
        // For 53c format, pass the currently selected pattern
        // For MLT+ULA+, signal Timex Hi-Colour layout (both bitmap and attrs ZX-interleaved)
        // For .mc multicolor, signal linear bitmap layout
        let importOpts;
        const fileExt = fileName.toLowerCase().split('.').pop();
        if (format === FORMAT.ATTR_53C && typeof getSelectedPattern === 'function') {
          importOpts = { pattern: getSelectedPattern() };
        } else if (format === FORMAT.MLT && isUlaPlusMode) {
          importOpts = { timexHiColour: true };
        } else if (format === FORMAT.MLT && fileExt === 'mc') {
          importOpts = { linear: true };
        }
        newInternalPicture = importPicture(format, data, fileName, importOpts);
      }

      // For editable formats, use multi-picture system if available
      if (typeof addPicture === 'function') {
        const result = addPicture(fileName, format, data, newInternalPicture, true);
        if (result >= 0) {
          // addPicture -> switchToPicture handles all rendering and UI updates
          updateFlashTimer();
          return;
        }
        // Failed to add (max pictures reached) - fall through to direct load
        screenData = data;
        currentFileName = fileName;
        currentFormat = format;
        currentPicture = newInternalPicture;
      } else {
        // Editor not loaded - use direct assignment
        screenData = data;
        currentFileName = fileName;
        currentFormat = format;
        currentPicture = newInternalPicture;
      }

      toggleScaControlsVisibility();
      toggleFormatControlsVisibility();
      updateScaControls();
      updateFileInfo();
      renderScreen();

      // Update convert dropdown if editor function exists
      if (typeof updateConvertOptions === 'function') {
        updateConvertOptions();
      }
      // Update export ASM button state
      if (typeof updateExportAsmButton === 'function') {
        updateExportAsmButton();
      }

      // Reset layer system for new file
      if (typeof layers !== 'undefined') {
        layers = [];
        activeLayerIndex = 0;
        layersEnabled = false;
      }
      if (typeof toggleLayerSectionVisibility === 'function') {
        toggleLayerSectionVisibility();
      }
      if (typeof updateLayerPanel === 'function') {
        updateLayerPanel();
      }

      // Update editor state based on loaded file format
      if (typeof updateEditorState === 'function') {
        updateEditorState();
      }

      // Update editor preview if editor is active
      if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') {
        renderPreview();
      }

      // Start flash timer if needed
      updateFlashTimer();

      // Update tab bar if available
      if (typeof updatePictureTabBar === 'function') {
        updatePictureTabBar();
      }
    }
  });

  reader.onerror = () => console.warn('FileReader error:', reader.error);
  reader.readAsArrayBuffer(file);
}

// ============================================================================
// Initialize
// ============================================================================

// cacheElements() is called from screen_viewer_ui.js
