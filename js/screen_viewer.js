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
  SCA: 'sca'              // SCA animation (multiple frames with timing)
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
  TOTAL_SIZE: 12288,      // 6144 + 6144
  BITMAP_SIZE: 6144,      // Same as standard SCR
  ATTR_SIZE: 6144,        // 192 rows × 32 columns (one attr row per pixel line)
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
  FLICKER: 'flicker'      // Alternate frames at 50fps
};

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

// ZX Spectrum color palettes (prefixed to avoid conflict with shared constants.js)
const ZX_PALETTE = {
  BRIGHT: [
    'rgb(0,0,0)',         // 0 Black
    'rgb(0,0,255)',       // 1 Blue
    'rgb(255,0,0)',       // 2 Red
    'rgb(255,0,255)',     // 3 Magenta
    'rgb(0,255,0)',       // 4 Green
    'rgb(0,255,255)',     // 5 Cyan
    'rgb(255,255,0)',     // 6 Yellow
    'rgb(255,255,255)'    // 7 White
  ],
  REGULAR: [
    'rgb(0,0,0)',         // 0 Black
    'rgb(0,0,215)',       // 1 Blue
    'rgb(215,0,0)',       // 2 Red
    'rgb(215,0,215)',     // 3 Magenta
    'rgb(0,215,0)',       // 4 Green
    'rgb(0,215,215)',     // 5 Cyan
    'rgb(215,215,0)',     // 6 Yellow
    'rgb(215,215,215)'    // 7 White
  ]
};

// RGB values for ImageData rendering (optimized palette as arrays)
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

// ============================================================================
// State
// ============================================================================

/** @type {Uint8Array} */
let screenData = new Uint8Array(0);

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

/** @type {boolean} - Current flash phase (false = normal, true = swapped) */
let flashPhase = false;

/** @type {number|null} - Flash timer ID */
let flashTimerId = null;

/** @type {boolean} - Whether flash animation is enabled */
let flashEnabled = true;

/** @type {boolean} - Whether to show attributes (false = monochrome white on black) */
let showAttributes = true;

/** @type {Uint8Array} - Current font data (768 bytes = 96 chars × 8 bytes) */
let fontData = new Uint8Array(SPECSCII.FONT_SIZE);

/** @type {boolean} - Whether font has been loaded */
let fontLoaded = false;

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

/** @type {HTMLInputElement} */
let flashCheckbox;

/** @type {HTMLInputElement} */
let fontFileInput;

/** @type {HTMLElement} */
let fontInfo;

/** @type {HTMLSelectElement} */
let pattern53cSelect;

/** @type {boolean} - RGB3 flicker emulation enabled */
let rgb3FlickerEnabled = false;

/** @type {number} - Current RGB3 flicker phase (0=R, 1=G, 2=B) */
let rgb3FlickerPhase = 0;

/** @type {number|null} - RGB3 flicker animation frame ID */
let rgb3FlickerFrameId = null;

/** @type {number} - Last RGB3 flicker frame timestamp */
let rgb3FlickerLastTime = 0;

/** @type {string} - Gigascreen display mode: 'average', 'opacity', or 'flicker' */
let gigascreenMode = GIGASCREEN_MODE.AVERAGE;

/** @type {number} - Current Gigascreen flicker phase (0 or 1) */
let gigascreenFlickerPhase = 0;

/** @type {number|null} - Gigascreen flicker animation frame ID */
let gigascreenFlickerFrameId = null;

/** @type {number} - Last Gigascreen flicker frame timestamp */
let gigascreenFlickerLastTime = 0;

/** @type {number} - Flicker frame interval in ms (20ms = 50Hz) */
const FLICKER_INTERVAL_MS = 20;

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

/**
 * Gets ink and paper colors from attribute byte
 * @param {number} attr - Attribute byte
 * @returns {{ink: string, paper: string}} Color values
 */
function getColors(attr) {
  // ULA+ mode uses 64-color palette
  if (isUlaPlusMode && ulaPlusPalette) {
    const inkIdx = getUlaPlusPaletteIndex(attr, true);
    const paperIdx = getUlaPlusPaletteIndex(attr, false);
    const inkRgb = getUlaPlusColor(inkIdx);
    const paperRgb = getUlaPlusColor(paperIdx);
    return {
      ink: `rgb(${inkRgb[0]},${inkRgb[1]},${inkRgb[2]})`,
      paper: `rgb(${paperRgb[0]},${paperRgb[1]},${paperRgb[2]})`
    };
  }

  // Standard ZX Spectrum mode
  const { inkIndex, paperIndex, isBright } = getColorIndices(attr);
  const palette = isBright ? ZX_PALETTE.BRIGHT : ZX_PALETTE.REGULAR;
  return { ink: palette[inkIndex], paper: palette[paperIndex] };
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
  } catch (error) {
    console.error('Error loading ROM font:', error);
    // Create a basic placeholder font (all zeros = blank)
    fontData = new Uint8Array(SPECSCII.FONT_SIZE);
    fontLoaded = false;
    currentFontName = 'No font';
    updateFontInfo();
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
      } else {
        alert(`Invalid font file size: ${data.length} bytes. Expected at least 768 bytes.`);
      }
    }
  });

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

/**
 * Renders standard SCR format using ImageData for better performance
 * Creates a 256x192 image and scales it using the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderScrFast(ctx, borderOffset) {
  // Create base image at 1:1 scale (256x192)
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

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
            inkRgb = [255, 255, 255];
            paperRgb = [0, 0, 0];
          }

          // Calculate Y position
          const x = col * 8;
          const y = yOffset + row * 8 + line;

          // Draw 8 pixels directly to ImageData
          for (let bit = 0; bit < 8; bit++) {
            const px = x + bit;
            const maskIdx = y * SCREEN.WIDTH + px;
            const pixelIndex = maskIdx * 4;

            // Check if this pixel is transparent
            const rgb = isPixelTransparent(maskIdx)
              ? getCheckerboardColor(px, y)
              : (isBitSet(byte, bit) ? inkRgb : paperRgb);
            data[pixelIndex] = rgb[0];     // R
            data[pixelIndex + 1] = rgb[1]; // G
            data[pixelIndex + 2] = rgb[2]; // B
            data[pixelIndex + 3] = 255;    // A
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
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    temp.canvas,
    0, 0, SCREEN.WIDTH, SCREEN.HEIGHT,
    borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom
  );
}

/**
 * Toggles attribute display on/off and re-renders
 */
function toggleAttributes() {
  showAttributes = !showAttributes;
  const cb = document.getElementById('showAttrsCheckbox');
  if (cb) /** @type {HTMLInputElement} */ (cb).checked = showAttributes;
  renderScreen();
}

/**
 * Renders a 53c format screen (attribute-only with pattern bitmap)
 * In 53c format, each 8x8 cell shows a dither pattern using ink and paper colors
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function render53cScreen(ctx, borderOffset) {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('pattern53cSelect'));
  const patternName = select?.value || 'checker';

  // Get pattern array from config (8 bytes, one per row, MSB = leftmost pixel)
  let patternArray;
  if (patternName === 'stripes') {
    patternArray = APP_CONFIG.PATTERN_53C_STRIPES;
  } else if (patternName === 'dd77') {
    patternArray = APP_CONFIG.PATTERN_53C_DD77;
  } else {
    patternArray = APP_CONFIG.PATTERN_53C_CHECKER;
  }

  for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const attrIndex = col + row * 32;
      const attr = screenData[attrIndex];
      let ink, paper;
      if (showAttributes) {
        ({ ink, paper } = getColors(attr));
      } else {
        ink = ZX_PALETTE.REGULAR[7]; // white
        paper = ZX_PALETTE.REGULAR[0]; // black
      }

      // Draw 8x8 pattern for this cell
      const cellX = col * 8;
      const cellY = row * 8;

      for (let py = 0; py < 8; py++) {
        const patternByte = patternArray[py];
        for (let px = 0; px < 8; px++) {
          const bit = 7 - px; // MSB first
          const isInk = (patternByte & (1 << bit)) !== 0;

          ctx.fillStyle = isInk ? ink : paper;
          ctx.fillRect(
            borderOffset + (cellX + px) * zoom,
            borderOffset + (cellY + py) * zoom,
            zoom,
            zoom
          );
        }
      }
    }
  }
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
            inkRgb = [255, 255, 255];
            paperRgb = [0, 0, 0];
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
  ctx.imageSmoothingEnabled = false;
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

  // Process each pixel line from 0 to 191
  for (let y = 0; y < SCREEN.HEIGHT; y++) {
    // Calculate bitmap address using ZX Spectrum interleaved layout
    const third = Math.floor(y / 64);
    const charRow = Math.floor((y % 64) / 8);
    const pixelLine = y % 8;
    const bitmapBase = third * 2048 + charRow * 32 + pixelLine * 256;

    // MLT attribute: one row per pixel line, stored linearly
    const attrBase = MLT.BITMAP_SIZE + y * 32;

    for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
      const byte = screenData[bitmapBase + col];
      const attr = screenData[attrBase + col];
      let inkRgb, paperRgb;
      if (showAttributes) {
        ({ inkRgb, paperRgb } = getColorsRgb(attr));
      } else {
        inkRgb = [255, 255, 255];
        paperRgb = [0, 0, 0];
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
  ctx.imageSmoothingEnabled = false;
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
          // Combine RGB channels - each channel contributes if its bit is set
          data[pixelIndex] = isBitSet(redByte, bit) ? 255 : 0;
          data[pixelIndex + 1] = isBitSet(greenByte, bit) ? 255 : 0;
          data[pixelIndex + 2] = isBitSet(blueByte, bit) ? 255 : 0;
        }
        data[pixelIndex + 3] = 255;
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
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
          // Show single color channel based on phase
          const bitSet = isBitSet(planeByte, bit);
          if (phase === 0) {
            // Red phase
            data[pixelIndex] = bitSet ? 255 : 0;
            data[pixelIndex + 1] = 0;
            data[pixelIndex + 2] = 0;
          } else if (phase === 1) {
            // Green phase
            data[pixelIndex] = 0;
            data[pixelIndex + 1] = bitSet ? 255 : 0;
            data[pixelIndex + 2] = 0;
          } else {
            // Blue phase
            data[pixelIndex] = 0;
            data[pixelIndex + 1] = 0;
            data[pixelIndex + 2] = bitSet ? 255 : 0;
          }
        }
        data[pixelIndex + 3] = 255;
      }
    }
  }

  // Put to temp canvas and scale to main canvas
  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
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
 * Toggles RGB3 flicker emulation
 * @param {boolean} enabled
 */
function setRgb3FlickerEnabled(enabled) {
  rgb3FlickerEnabled = enabled;
  if (enabled && currentFormat === FORMAT.RGB3) {
    startRgb3Flicker();
  } else {
    stopRgb3Flicker();
    if (currentFormat === FORMAT.RGB3) {
      renderScreen(); // Re-render with blended colors
    }
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
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
}

/**
 * Renders Gigascreen with averaged colors (pristine blend)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} borderOffset - Border offset in canvas pixels
 */
function renderGigascreenAverage(ctx, borderOffset) {
  const imageData = ctx.createImageData(SCREEN.WIDTH, SCREEN.HEIGHT);
  const data = imageData.data;

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

        // Average the two colors
        data[pixelIndex] = Math.round((rgb1[0] + rgb2[0]) / 2);
        data[pixelIndex + 1] = Math.round((rgb1[1] + rgb2[1]) / 2);
        data[pixelIndex + 2] = Math.round((rgb1[2] + rgb2[2]) / 2);
        data[pixelIndex + 3] = 255;
      }
    }
  }

  const temp = getTempRenderCanvas(SCREEN.WIDTH, SCREEN.HEIGHT);
  if (!temp) return;
  temp.ctx.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
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
 * @param {string} mode - 'average', 'opacity', or 'flicker'
 */
function setGigascreenMode(mode) {
  // Stop existing flicker if running
  stopGigascreenFlicker();

  gigascreenMode = mode;

  if (mode === GIGASCREEN_MODE.FLICKER && currentFormat === FORMAT.GIGASCREEN) {
    startGigascreenFlicker();
  } else if (currentFormat === FORMAT.GIGASCREEN) {
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
  ctx.imageSmoothingEnabled = false;
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
  // Fill background with black initially
  ctx.fillStyle = ZX_PALETTE.REGULAR[0];
  ctx.fillRect(borderOffset, borderOffset, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);

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
      ink = ZX_PALETTE.REGULAR[7];
      paper = ZX_PALETTE.REGULAR[0];
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
 * Renders the border for BMC4 format (same structure as BSC)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function renderBmc4Border(ctx) {
  const borderDataStart = BMC4.BORDER_OFFSET;
  const pxPerColor = BSC.PIXELS_PER_COLOR;
  const bitmapLeft = BSC.BORDER_LEFT_PX;
  const bitmapRight = bitmapLeft + SCREEN.WIDTH;
  const bitmapTop = BSC.BORDER_TOP_PX;

  // Check if we have border transparency mask
  const hasBorderMask = typeof borderTransparencyMask !== 'undefined' && borderTransparencyMask &&
                        typeof layersEnabled !== 'undefined' && layersEnabled;

  /**
   * Draws a color segment, optionally clipping to border area
   * @param {string} color - CSS color string
   * @param {number} startX - Start X in screen pixels
   * @param {number} endX - End X in screen pixels
   * @param {number} screenY - Y position on screen
   * @param {boolean} clipToBorder - If true, only draw outside bitmap area
   * @param {number} maskIdx - Index into borderTransparencyMask
   */
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
        return;
      }
    }

    // Check if this segment is transparent
    if (hasBorderMask && !borderTransparencyMask[maskIdx]) {
      drawBorderCheckerboard(ctx, drawStartX, screenY, drawEndX - drawStartX);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(drawStartX * zoom, screenY * zoom, (drawEndX - drawStartX) * zoom, zoom);
    }
  }

  /**
   * Draws a full border line (top/bottom)
   * @param {number} lineOffset - Offset in screenData
   * @param {number} screenY - Y position on screen
   * @param {boolean} clipToBorder - If true, only draw outside bitmap area
   * @param {number} byteCount - Number of bytes in this line
   * @param {number} maskBaseIdx - Base index into borderTransparencyMask
   */
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

  /**
   * Draws side border line (4 bytes left + 4 bytes right)
   * @param {number} lineOffset - Offset in screenData
   * @param {number} screenY - Y position on screen
   * @param {number} maskBaseIdx - Base index into borderTransparencyMask
   */
  function drawSideBorderLine(lineOffset, screenY, maskBaseIdx) {
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
    x = bitmapLeft + SCREEN.WIDTH;
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
        inkRgb = [255, 255, 255];
        paperRgb = [0, 0, 0];
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
  ctx.imageSmoothingEnabled = false;
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
  const pxPerColor = BSC.PIXELS_PER_COLOR;  // 24 pixels per color

  // Main screen position (bitmap covers px 64-319 horizontally, lines 64-255 vertically)
  const bitmapLeft = BSC.BORDER_LEFT_PX;   // 64 pixels
  const bitmapRight = bitmapLeft + SCREEN.WIDTH; // 320 pixels
  const bitmapTop = BSC.BORDER_TOP_PX;     // 64 pixels

  // Check if we have border transparency mask
  const hasBorderMask = typeof borderTransparencyMask !== 'undefined' && borderTransparencyMask &&
                        typeof layersEnabled !== 'undefined' && layersEnabled;

  /**
   * Draws a full border line (top/bottom) from data
   * @param {number} lineOffset - Offset in screenData
   * @param {number} screenY - Y position on screen
   * @param {boolean} clipToBorder - If true, only draw outside bitmap area
   * @param {number} byteCount - Number of bytes in this line
   * @param {number} maskBaseIdx - Base index into borderTransparencyMask
   */
  function drawBorderLine(lineOffset, screenY, clipToBorder, byteCount, maskBaseIdx) {
    let x = 0;
    for (let byteIdx = 0; byteIdx < byteCount; byteIdx++) {
      const byte = screenData[lineOffset + byteIdx];
      const { color1, color2 } = getBscColors(byte);
      const maskIdx = maskBaseIdx + byteIdx * 2;

      // First color (bits 2-0): 24 pixels
      drawColorSegment(color1, x, x + pxPerColor, screenY, clipToBorder, maskIdx);
      x += pxPerColor;

      // Second color (bits 5-3): 24 pixels
      drawColorSegment(color2, x, x + pxPerColor, screenY, clipToBorder, maskIdx + 1);
      x += pxPerColor;
    }
  }

  /**
   * Draws side border line (4 bytes left + 4 bytes right)
   * @param {number} lineOffset - Offset in screenData
   * @param {number} screenY - Y position on screen
   * @param {number} maskBaseIdx - Base index into borderTransparencyMask
   */
  function drawSideBorderLine(lineOffset, screenY, maskBaseIdx) {
    // Left border: 4 bytes = 64 pixels (at x = 0-63)
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

    // Right border: 4 bytes = 64 pixels (at x = 320-383)
    x = bitmapLeft + SCREEN.WIDTH; // 64 + 256 = 320
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

  /**
   * Draws a color segment, optionally clipping to border area
   * @param {string} color - CSS color string
   * @param {number} startX - Start X in screen pixels
   * @param {number} endX - End X in screen pixels
   * @param {number} screenY - Y position on screen
   * @param {boolean} clipToBorder - If true, only draw outside bitmap area
   * @param {number} maskIdx - Index into borderTransparencyMask
   */
  function drawColorSegment(color, startX, endX, screenY, clipToBorder, maskIdx) {
    let drawStartX = startX;
    let drawEndX = endX;

    if (clipToBorder) {
      // Clip to visible border areas (outside bitmap)
      if (endX <= bitmapLeft) {
        // Fully in left border
      } else if (startX >= bitmapRight) {
        // Fully in right border
      } else if (startX < bitmapLeft && endX > bitmapLeft) {
        // Spans left edge - clip
        drawEndX = bitmapLeft;
      } else if (startX < bitmapRight && endX > bitmapRight) {
        // Spans right edge - clip
        drawStartX = bitmapRight;
      } else {
        // Entirely under bitmap - skip
        return;
      }
    }

    // Check if this segment is transparent
    if (hasBorderMask && !borderTransparencyMask[maskIdx]) {
      // Draw checkerboard pattern for transparent border
      drawBorderCheckerboard(ctx, drawStartX, screenY, drawEndX - drawStartX);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(drawStartX * zoom, screenY * zoom, (drawEndX - drawStartX) * zoom, zoom);
    }
  }

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
            inkRgb = [255, 255, 255];
            paperRgb = [0, 0, 0];
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
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp.canvas, offsetX, offsetY, SCREEN.WIDTH * zoom, SCREEN.HEIGHT * zoom);
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

  // Check version - only v1 is supported
  if (version !== 1) {
    alert(`Warning: This SCA file is version ${version}, but only version 1 is supported. The animation may not display correctly.`);
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
    const fillPattern = scaHeader.fillPattern;

    for (let row = 0; row < SCREEN.CHAR_ROWS; row++) {
      for (let col = 0; col < SCREEN.CHAR_COLS; col++) {
        const attrOffset = frameOffset + col + row * 32;
        const attr = screenData[attrOffset];
        let inkRgb, paperRgb;
        if (showAttributes) {
          ({ inkRgb, paperRgb } = getColorsRgb(attr));
        } else {
          inkRgb = [255, 255, 255];
          paperRgb = [0, 0, 0];
        }

        // Draw 8x8 cell using fill pattern
        const cellX = col * 8;
        const cellY = row * 8;

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
              inkRgb = [255, 255, 255];
              paperRgb = [0, 0, 0];
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
  ctx.imageSmoothingEnabled = false;
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
    pattern53cControls.style.display = (currentFormat === FORMAT.ATTR_53C) ? 'flex' : 'none';
  }
  const rgb3Controls = document.getElementById('rgb3Controls');
  if (rgb3Controls) {
    rgb3Controls.style.display = (currentFormat === FORMAT.RGB3) ? 'flex' : 'none';
  }
  // Handle RGB3 flicker: stop when switching away, start if checkbox is checked when switching to
  if (currentFormat !== FORMAT.RGB3) {
    if (rgb3FlickerFrameId !== null) {
      stopRgb3Flicker();
    }
  } else {
    // Switching to RGB3: start flicker if checkbox is checked
    const flickerCheckbox = /** @type {HTMLInputElement|null} */ (document.getElementById('flickerRgb3Checkbox'));
    if (flickerCheckbox && flickerCheckbox.checked && rgb3FlickerFrameId === null) {
      startRgb3Flicker();
    }
  }
  const gigascreenControls = document.getElementById('gigascreenControls');
  if (gigascreenControls) {
    gigascreenControls.style.display = (currentFormat === FORMAT.GIGASCREEN) ? 'flex' : 'none';
  }
  // Handle Gigascreen flicker: stop when switching away, start if mode is flicker when switching to
  if (currentFormat !== FORMAT.GIGASCREEN) {
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
    scrEditorControls.style.display = (currentFormat === FORMAT.SCR || currentFormat === FORMAT.SCR_ULAPLUS || currentFormat === FORMAT.ATTR_53C || currentFormat === FORMAT.BSC || currentFormat === FORMAT.IFL || currentFormat === FORMAT.MLT || currentFormat === FORMAT.BMC4 || currentFormat === FORMAT.RGB3 || currentFormat === FORMAT.MONO_FULL || currentFormat === FORMAT.MONO_2_3 || currentFormat === FORMAT.MONO_1_3) ? 'flex' : 'none';
  }
  // Update ULA+ palette section visibility
  if (typeof updateUlaPlusSectionVisibility === 'function') {
    updateUlaPlusSectionVisibility();
  }
  // Update barcode section visibility (for border formats)
  if (typeof updateBarcodeVisibility === 'function') {
    updateBarcodeVisibility();
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
 * Enables ULA+ mode with default or provided palette
 * @param {Uint8Array} [palette] - Optional palette, uses default if not provided
 */
function enableUlaPlusMode(palette) {
  ulaPlusPalette = palette || generateDefaultUlaPlusPalette();
  isUlaPlusMode = true;
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
const SUPPORTED_EXTENSIONS = ['scr', '53c', 'atr', 'bsc', 'ifl', 'bmc4', 'mlt', 'mc', '3', 'img', 'mem', 'specscii', 'sca'];
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
 * Shows the ZIP file selection modal
 * @param {string[]} files - Array of file names to display
 * @param {function(string): void} onSelect - Callback when a file is selected
 */
function showZipFileModal(files, onSelect) {
  const modal = document.getElementById('zipModal');
  const fileList = document.getElementById('zipFileList');
  const cancelBtn = document.getElementById('zipCancelBtn');

  if (!modal || !fileList || !cancelBtn) return;

  // Clear previous list
  fileList.innerHTML = '';

  // Create file buttons
  files.forEach(fileName => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-secondary);';
    item.textContent = fileName;
    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--bg-secondary)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
    });
    item.addEventListener('click', () => {
      modal.style.display = 'none';
      onSelect(fileName);
    });
    fileList.appendChild(item);
  });

  // Cancel button handler
  const handleCancel = () => {
    modal.style.display = 'none';
    cancelBtn.removeEventListener('click', handleCancel);
  };
  cancelBtn.addEventListener('click', handleCancel);

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

    // Stop any existing timers
    stopFlashTimer();
    resetScaState();

    screenData = new Uint8Array(arrayBuffer);
    currentFileName = `${currentZipName}/${fileName}`;
    currentFormat = detectFormat(fileName, screenData.length);

    // Check for invalid format (e.g., .img file with wrong size)
    if (currentFormat === FORMAT.UNKNOWN) {
      const ext = fileName.toLowerCase().split('.').pop();
      if (ext === 'img') {
        alert(`Invalid Gigascreen file: expected ${GIGASCREEN.TOTAL_SIZE} bytes (2×6912), got ${screenData.length} bytes.`);
        return;
      }
    }

    // Handle SCA format
    if (currentFormat === FORMAT.SCA) {
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
      // Multiple files - show selection dialog
      showZipFileModal(supportedFiles, loadFileFromZip);
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

  // Calculate required canvas dimensions
  const requiredWidth = SCREEN.WIDTH * zoom + borderPixels * 2;
  const requiredHeight = SCREEN.HEIGHT * zoom + borderPixels * 2;

  // Only resize canvas when dimensions actually change (expensive operation)
  if (screenCanvas.width !== requiredWidth || screenCanvas.height !== requiredHeight) {
    screenCanvas.width = requiredWidth;
    screenCanvas.height = requiredHeight;
    lastCanvasWidth = requiredWidth;
    lastCanvasHeight = requiredHeight;
  }

  // Draw border (fill entire canvas with border color)
  ctx.fillStyle = ZX_PALETTE.REGULAR[borderColor];
  ctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);

  if (screenData.length === 0) {
    // Draw placeholder text
    ctx.fillStyle = getThemeColors().foreground;
    ctx.font = '14px Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Load a .scr or other picture file to display', screenCanvas.width / 2, screenCanvas.height / 2);
    // Still draw reference image if loaded
    if (typeof drawReferenceOverlay === 'function' &&
        typeof showReference !== 'undefined' && showReference &&
        typeof referenceImage !== 'undefined' && referenceImage) {
      drawReferenceOverlay();
    }
    return;
  }

  // Render based on format
  if (currentFormat === FORMAT.ATTR_53C) {
    // 53c format: attribute-only with checkerboard
    render53cScreen(ctx, borderPixels);
  } else if (currentFormat === FORMAT.BSC) {
    // BSC format: standard screen + per-line border colors
    // BSC handles its own canvas size and border rendering
    renderBscScreen(ctx);
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
    return; // BSC handles everything including grid
  } else if (currentFormat === FORMAT.BMC4) {
    // BMC4 format: border + 8x4 multicolor
    renderBmc4Screen(ctx);
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
    return; // BMC4 handles everything including grid
  } else if (currentFormat === FORMAT.IFL) {
    // IFL format: 8x2 multicolor
    renderIflScreen(ctx, borderPixels);
  } else if (currentFormat === FORMAT.MLT) {
    // MLT format: 8x1 multicolor
    renderMltScreen(ctx, borderPixels);
  } else if (currentFormat === FORMAT.RGB3) {
    // RGB3 format: tricolor RGB
    if (rgb3FlickerEnabled && rgb3FlickerFrameId !== null) {
      renderRgb3ScreenFlicker(ctx, borderPixels, rgb3FlickerPhase);
    } else {
      renderRgb3Screen(ctx, borderPixels);
    }
  } else if (currentFormat === FORMAT.GIGASCREEN) {
    // Gigascreen format: two alternating SCR frames
    renderGigascreen(ctx, borderPixels);
  } else if (currentFormat === FORMAT.MONO_FULL) {
    // Monochrome full screen (6144 bytes)
    renderMonoScreen(ctx, borderPixels, 3);
  } else if (currentFormat === FORMAT.MONO_2_3) {
    // Monochrome 2/3 screen (4096 bytes)
    renderMonoScreen(ctx, borderPixels, 2);
  } else if (currentFormat === FORMAT.MONO_1_3) {
    // Monochrome 1/3 screen (2048 bytes)
    renderMonoScreen(ctx, borderPixels, 1);
  } else if (currentFormat === FORMAT.SPECSCII) {
    // SPECSCII text screen
    renderSpecsciiScreen(ctx, borderPixels);
  } else if (currentFormat === FORMAT.SCA) {
    // SCA animation format
    if (scaHeader) {
      renderScaFrame(ctx, borderPixels, scaCurrentFrame);
    }
  } else {
    // Standard SCR format - use optimized ImageData rendering
    renderScrFast(ctx, borderPixels);
  }

  // Draw paper grid overlay if enabled
  if (gridSize > 0 || subgridSize > 0) {
    drawCharGrid(ctx, borderPixels);
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
}

/**
 * Draws character cell grid overlay
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} offsetX - X offset in canvas pixels
 * @param {number} [offsetY] - Y offset in canvas pixels (defaults to offsetX)
 */
function drawCharGrid(ctx, offsetX, offsetY = offsetX) {
  const width = SCREEN.WIDTH;
  const height = SCREEN.HEIGHT;

  ctx.lineWidth = 1;

  // Draw subgrid first (behind main grid)
  if (subgridSize > 0) {
    ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUBGRID_COLOR) || 'rgba(128, 128, 128, 0.25)';

    // Vertical subgrid lines
    for (let px = 0; px <= width; px += subgridSize) {
      // Skip if this line would be drawn by main grid
      if (gridSize > 0 && px % gridSize === 0) continue;
      ctx.beginPath();
      ctx.moveTo(offsetX + px * zoom, offsetY);
      ctx.lineTo(offsetX + px * zoom, offsetY + height * zoom);
      ctx.stroke();
    }

    // Horizontal subgrid lines
    for (let py = 0; py <= height; py += subgridSize) {
      // Skip if this line would be drawn by main grid
      if (gridSize > 0 && py % gridSize === 0) continue;
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + py * zoom);
      ctx.lineTo(offsetX + width * zoom, offsetY + py * zoom);
      ctx.stroke();
    }
  }

  // Draw main grid
  if (gridSize > 0) {
    ctx.strokeStyle = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.GRID_COLOR) || 'rgba(0, 160, 255, 0.4)';

    // Vertical grid lines
    for (let px = 0; px <= width; px += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX + px * zoom, offsetY);
      ctx.lineTo(offsetX + px * zoom, offsetY + height * zoom);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let py = 0; py <= height; py += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + py * zoom);
      ctx.lineTo(offsetX + width * zoom, offsetY + py * zoom);
      ctx.stroke();
    }
  }
}

/**
 * Draws grid over the border area for standard SCR/SCA formats.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} mainOffset - Offset to main screen area in canvas pixels
 */
function drawStandardBorderGrid(ctx, mainOffset) {
  const totalWidth = SCREEN.WIDTH * zoom + mainOffset * 2;
  const totalHeight = SCREEN.HEIGHT * zoom + mainOffset * 2;
  const mainRight = mainOffset + SCREEN.WIDTH * zoom;
  const mainBottom = mainOffset + SCREEN.HEIGHT * zoom;

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
    const subColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUBGRID_COLOR) || 'rgba(128, 128, 128, 0.25)';
    ctx.strokeStyle = subColor;
    ctx.lineWidth = 1;
    drawBorderGridLines(borderSubgridSize * zoom);
  }

  // Draw main grid (if enabled)
  if (borderGridSize > 0) {
    const gridColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BORDER_GRID_COLOR) || 'rgba(255, 160, 0, 0.35)';
    ctx.strokeStyle = gridColor;
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

  const normalColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BORDER_GRID_COLOR) || 'rgba(255, 160, 0, 0.35)';
  const hiddenColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BSC_GRID_HIDDEN) || 'rgba(255, 0, 0, 0.35)';
  const hiddenOverlay = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BSC_HIDDEN_OVERLAY) || 'rgba(255, 0, 0, 0.12)';
  const subgridColor = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUBGRID_COLOR) || 'rgba(128, 128, 128, 0.25)';

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
    case FORMAT.MLT: return 'MLT (8x1 multicolor)';
    case FORMAT.RGB3: return '3 (tricolor RGB)';
    case FORMAT.GIGASCREEN: return 'IMG (Gigascreen)';
    case FORMAT.MONO_FULL: return 'SCR (monochrome)';
    case FORMAT.MONO_2_3: return 'SCR (monochrome 2/3)';
    case FORMAT.MONO_1_3: return 'SCR (monochrome 1/3)';
    case FORMAT.SPECSCII: return 'SPECSCII (text)';
    case FORMAT.SCA: return 'SCA (animation)';
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
    case FORMAT.MONO_2_3:
      return { width: SCREEN.WIDTH, height: 128 };
    case FORMAT.MONO_1_3:
      return { width: SCREEN.WIDTH, height: 64 };
    case FORMAT.SCA:
      if (scaHeader) {
        return { width: scaHeader.width, height: scaHeader.height };
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
    }
    infoFormat.textContent = currentFileName ? formatDisplay : '-';
  }
  if (infoDimensions) {
    infoDimensions.textContent = currentFileName ? `${dimensions.width} × ${dimensions.height} px` : '-';
  }

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
    showAttributes: showAttributes,
    pattern53c: pattern53cSelect ? pattern53cSelect.value : 'checker',
    palette: document.getElementById('paletteSelect')?.value || 'default',
    editPreviewTrimmedOnly: typeof editPreviewTrimmedOnly !== 'undefined' ? editPreviewTrimmedOnly : true,
    editZoom: typeof editZoom !== 'undefined' ? editZoom : 2
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
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
  } catch (e) {
    // Ignore parse errors
  }
}

/**
 * Checks if the screen data contains any flashing attributes
 * @returns {boolean} True if any attribute has flash bit set
 */
function hasFlashingAttributes() {
  if (screenData.length === 0) return false;

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
    renderScreen();
    if (typeof editorActive !== 'undefined' && editorActive && typeof renderPreview === 'function') {
      renderPreview();
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

  if (ext === 'specscii') {
    return FORMAT.SPECSCII;
  }

  if (ext === 'sca') {
    return FORMAT.SCA;
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

  if (fileSize === MLT.TOTAL_SIZE) {
    return FORMAT.MLT;
  }

  if (fileSize === RGB3.TOTAL_SIZE) {
    return FORMAT.RGB3;
  }

  if (fileSize === GIGASCREEN.TOTAL_SIZE) {
    return FORMAT.GIGASCREEN;
  }

  if (fileSize === ULAPLUS.TOTAL_SIZE) {
    return FORMAT.SCR_ULAPLUS;
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

      const data = new Uint8Array(buffer);
      const fileName = file.name;
      const format = detectFormat(fileName, data.length);

      // Handle SCA format separately (animations don't participate in multi-picture)
      if (format === FORMAT.SCA) {
        // Mark that we're leaving multi-picture mode (prevents saving SCA data over previous picture)
        if (typeof activePictureIndex !== 'undefined') {
          activePictureIndex = -1;
        }

        screenData = data;
        currentFileName = fileName;
        currentFormat = format;
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

      // Initialize ULA+ mode based on format
      initUlaPlusMode(data, format);

      // For editable formats, use multi-picture system if available
      if (typeof addPicture === 'function') {
        const result = addPicture(fileName, format, data);
        if (result < 0) {
          // Failed to add (max pictures reached) - still load as current
          screenData = data;
          currentFileName = fileName;
          currentFormat = format;
        }
        // addPicture handles switching and rendering
      } else {
        // Editor not loaded - use direct assignment
        screenData = data;
        currentFileName = fileName;
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

  reader.readAsArrayBuffer(file);
}

// ============================================================================
// Initialize
// ============================================================================

// cacheElements() is called from screen_viewer_ui.js
