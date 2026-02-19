// SpectraLab - User Configuration
// Change these values to customize the application behavior.
// @ts-check
"use strict";

const APP_VERSION = '1.48.0';

const APP_CONFIG = {
  // ============================================================================
  // General Settings
  // ============================================================================

  // Maximum number of undo/redo levels in the screen editor
  MAX_UNDO_LEVELS: 32,

  // Flash animation interval in milliseconds (ZX Spectrum ~1.56 Hz = 320ms)
  FLASH_INTERVAL: 320,

  // Default border size in pixels (0, 24, or 48)
  DEFAULT_BORDER_SIZE: 24,

  // Default zoom level (1-10)
  DEFAULT_ZOOM: 2,

  // Default grid size in pixels (0=none, 8, 16, 24)
  DEFAULT_GRID_SIZE: 8,

  // Default subgrid size in pixels (0=none, 1, 2, 4)
  DEFAULT_SUBGRID_SIZE: 0,

  // ============================================================================
  // Grid Colors
  // ============================================================================

  // Main grid color (8px/16px/24px cells)
  GRID_COLOR: 'rgba(0, 160, 255, 0.4)',

  // Subgrid color (1px/2px/4px subdivisions)
  SUBGRID_COLOR: 'rgba(128, 128, 128, 0.25)',

  // Border grid color (for BSC/BMC4 border areas)
  BORDER_GRID_COLOR: 'rgba(255, 160, 0, 0.35)',

  // BSC hidden zone colors (leftmost/rightmost 16px not visible on real hardware)
  BSC_GRID_HIDDEN: 'rgba(255, 0, 0, 0.35)',
  BSC_HIDDEN_OVERLAY: 'rgba(255, 0, 0, 0.12)',

  // ============================================================================
  // Editor Tool Colors
  // ============================================================================

  // Selection rectangle color (Select tool, copy/paste outline)
  SELECTION_COLOR: 'rgba(0, 255, 255, 0.9)',

  // Line/Rectangle/Circle preview color while drawing
  TOOL_PREVIEW_COLOR: 'rgba(255, 255, 0, 0.8)',

  // Custom brush capture rectangle color
  BRUSH_CAPTURE_COLOR: 'rgba(0, 255, 128, 0.9)',

  // Paste preview opacity (0.0 - 1.0)
  PASTE_PREVIEW_OPACITY: 0.5,

  // ============================================================================
  // Reference Image Settings
  // ============================================================================

  // Default reference image opacity (0.0 - 1.0)
  REFERENCE_DEFAULT_OPACITY: 0.3,

  // Reference opacity slider range (percentage values)
  REFERENCE_MIN_OPACITY: 5,
  REFERENCE_MAX_OPACITY: 80,

  // ============================================================================
  // ASM Export Settings
  // ============================================================================

  // Numeric base for bitmap values: 'hex', 'dec', 'oct'
  ASM_BITMAP_BASE: 'hex',

  // Numeric base for attribute values: 'hex', 'dec', 'oct'
  ASM_ATTR_BASE: 'hex',

  // ============================================================================
  // Brush Preview Settings
  // ============================================================================

  // Opacity for brush preview overlay (0.0 - 1.0)
  BRUSH_PREVIEW_OPACITY: 0.5,

  // Hotkey for toggling brush preview cursor (single character, default '`' backtick)
  BRUSH_PREVIEW_HOTKEY: '`',

  // ============================================================================
  // QR Code Settings
  // ============================================================================

  // Default QR module size in pixels (1, 2, 4, or 8 - must divide evenly into 8)
  QR_DEFAULT_MODULE_SIZE: 4,

  // ============================================================================
  // Transparency Checkerboard Settings
  // ============================================================================

  // Size of checkerboard squares in pixels (2, 4, 8, or 16)
  TRANSPARENCY_CELL_SIZE: 4,

  // Light square color (RGB gray value 0-255)
  TRANSPARENCY_LIGHT_COLOR: 68,

  // Dark square color (RGB gray value 0-255)
  TRANSPARENCY_DARK_COLOR: 34,

  // ============================================================================
  // .53c Attribute Fill Patterns (8 bytes per pattern, one per row, MSB = leftmost pixel)
  // ============================================================================

  // Checker pattern: alternating pixels
  // 0xAA = 10101010, 0x55 = 01010101
  PATTERN_53C_CHECKER: [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55],

  // Stripes pattern: 2-pixel horizontal bands, alternating each line
  // 0xCC = 11001100, 0x33 = 00110011
  PATTERN_53C_STRIPES: [0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33],

  // DD/77 pattern: classic ZX Spectrum dither
  // 0xDD = 11011101, 0x77 = 01110111
  PATTERN_53C_DD77: [0xDD, 0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD, 0x77]
};
