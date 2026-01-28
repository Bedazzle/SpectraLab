# SpectraLab Version History

## v1.20.0
- Added BSC format support in image import
  - Output format dropdown: SCR (256×192) or BSC (384×304 with borders)
  - Border colors quantized from source image
  - Respects ZX Spectrum timing: 24px minimum for interior segments
  - Edge segments (at screen edge or touching paper) can be 8px
  - Side borders use 8px granularity (no interior segments)
- Added format conversion in editor
  - Convert dropdown near Save button
  - SCR → ATTR (.53c): extract attributes only
  - SCR → BSC: add solid border with color picker
  - ATTR → SCR: add bitmap with pattern picker (18 patterns)
  - ATTR → BSC: add pattern + border color
  - BSC → SCR: strip border data
- Bitmap patterns for ATTR conversion:
  - Empty, Solid
  - Checkerboard: 1px, 2px, 4px
  - Horizontal stripes: 1px, 2px, 4px
  - Vertical stripes: 1px, 2px, 4px
  - Grid, Dots, Diagonal, Brick
  - Dither: 25%, 50%, 75%

## v1.19.0
- Added PNG/GIF/JPG/WebP/BMP image import
  - Converts images to ZX Spectrum SCR format (6912 bytes)
  - Automatic scaling to 256x192 pixels
  - Dithering options: Floyd-Steinberg, Ordered (Bayer 4x4), Atkinson, None
  - Brightness/Contrast adjustment with auto-detect option
  - Cell-aware conversion respecting 8x8 attribute constraints
  - Live preview with side-by-side original/converted view
  - Uses current display palette for color matching
  - Automatically enters editor mode after import
- Added Resources section to README with related tools/projects

## v1.18.0
- BSC editor improvements
  - Grid overlay shows hidden zones (leftmost/rightmost 2 columns) with red tint
  - These 16px margins are typically not visible on real hardware
  - Semi-transparent red overlay plus red grid lines indicate hidden areas
- Added ASM export for BSC files
  - Generates sjasmplus-compatible source for Pentagon 128K
  - OUT on color change only, NOPs fill same-color runs
  - Exact 71680T loop timing (224T/line × 320 lines)
  - Uses original filename for .asm and .sna output

## v1.17.0
- Moved Attrs checkbox to viewer controls (same row as Flash/Grid)
  - Now available in viewer mode, not just the editor
  - Toggles monochrome (white on black) display across all formats
  - Affects: SCR, 53c/ATR, IFL, MLT, BSC, BMC4, SPECSCII, SCA
  - Setting persisted to localStorage
- Fixed rectangle/line tool with custom brush in replace mode
  - Stamps now placed at brush-sized intervals instead of pixel-by-pixel
  - Prevents overlapping stamps from destroying each other
- Fixed pixel tool drag with snap active
  - Stamps only at discrete snapped positions, no intermediate Bresenham stamps
- Removed redundant "New" button from editor actions (already available near editor exit)

## v1.16.0
- Added copy/paste with region selection
  - Select tool (S): drag to select a rectangular region (auto-copies on release)
  - Paste (Ctrl+V or Paste button): enter paste mode, click to place
  - Semi-transparent paste preview follows cursor
  - Cyan dashed rectangle shows selection and paste outline
  - Snap modes for paste placement (persisted to localStorage):
    - Grid: snap to 8x8 cell boundaries (default)
    - Zero: snap to clipboard-sized grid from (0,0) — for seamless tiling
    - Brush: snap to clipboard-sized grid from first paste position
    - Off: pixel-precise placement
  - Works in both .scr and .53c/.atr editors
  - .scr: copies bitmap pixels (linear packed) + attributes
  - .53c: copies attributes only; snap always Grid (control hidden)
  - Paste respects brush paint mode (Replace/Set/Invert)
  - Preserves original clipboard colors (not current ink/paper)
  - Clipboard preserved after paste — multiple pastes supported
  - Escape cancels selection or paste mode
  - Undo supported for paste operations
- Custom brush improvements
  - Ctrl+click slot to clear a custom brush
  - Rotate 90° CW, Mirror horizontal, Mirror vertical buttons
  - Transforms update preview and persist to localStorage
- Changed default brush paint mode from Set to Replace
- Brush paint mode now persists to localStorage

## v1.15.0
- Added .53c / .atr attribute editor
  - Edit 768-byte attribute-only files with click/drag cell painting
  - Pattern selector remains visible during editing
  - Tools and brush sections hidden (not applicable to attribute-only editing)
  - Undo/redo, clear, and save work on 768-byte data
  - Save exports as .53c file

## v1.14.0
- Added configurable brush/pen for the screen editor
  - Brush sizes 1-16 pixels
  - Six brush shapes: Square, Round, Horizontal line, Vertical line, Stroke (/), Back stroke (\)
  - Applies to Pixel, Line, and Rectangle tools
  - Cell-based tools (Fill Cell, Recolor) are unaffected
  - Keyboard shortcuts: `[` / `]` to decrease/increase brush size
- Brush UI section in editor panel with size dropdown and shape buttons
- Added 5 user-defined 16×16 custom brushes
  - Capture a 16×16 region from the current screen into a brush slot
  - Click empty slot to capture, Shift+click to recapture
  - Select a filled slot to paint with its bitmap pattern
  - Works with Pixel, Line, and Rectangle tools
  - Custom brushes persist to localStorage

## v1.13.0
- Added Recolor tool (A) for the screen editor
  - Changes only the attribute byte (ink/paper/bright/flash) without modifying bitmap data
  - Works like Fill Cell but preserves existing pixel patterns
- Added Attributes toggle checkbox in editor
  - Uncheck to view screen in monochrome (white on black)
  - Reveals hidden pixels where ink color equals paper color

## v1.12.0
- Multi-level undo/redo (32 levels, Ctrl+Z / Ctrl+Y)
- Added Redo button and keyboard shortcut
- Added Clear screen function
- Added draggable preview panel
  - Shows full screen while editing at high zoom
  - Zoomable preview (x1 to x4)
  - Scrollable when zoomed
  - Drag header to reposition
- Extended zoom levels (x1 to x10)
- Scrollable canvas area for high zoom levels

## v1.11.0
- Added SCR Screen Editor
  - Edit standard 6912-byte .scr files
  - Works like Art Studio / Artist 2
  - Left click = ink, Right click = paper
  - Automatic attribute setting per 8x8 cell
  - Tools: Pixel (P), Line (L), Rectangle (R), Fill Cell (C)
  - Ink/Paper color selection (0-7)
  - Bright toggle (B)
  - Single-level undo (Ctrl+Z)
  - Create new blank screen
  - Save edited screen as .scr file (Ctrl+S)
- Updated help dialog with editor shortcuts

## v1.10.0
- Added manual frame deletion in SCA Editor
  - Ctrl+click on filmstrip to toggle frame deletion
  - Delete/Backspace key to toggle current frame
  - Red overlay for manually deleted frames
- Added keyboard shortcuts for SCA Editor
  - Left/Right arrows for frame navigation (with wrap-around)
  - Space for play/pause
- Frame navigation now wraps around (last→first, first→last)
- Fixed playback loop when frames are deleted (finds first valid frame)
- Fixed "To Start"/"To End" buttons when first/last frames are deleted
- Added "Export SCR..." button to export frames as ZIP of SCR files
  - Filenames: basename_000.scr to basename_999.scr (or 0000-9999 for >1000 frames)

## v1.9.0
- Added frame optimization for SCA files
  - Remove consecutive duplicate frames (combines their delays)
  - Remove loop frame option (when last frame equals first)
  - Duplicate frame detection shown in Result section
  - Orange overlay for optimized-out frames in filmstrip
- Code cleanup
  - Removed redundant console.error calls
  - Removed unused renderScreenThird() function
  - Combined duplicate functions (adjustTrim, applyDelay, getColorIndices, drawCharGrid)
  - Cleaned up redundant local variables in UI code
- Updated help dialog with SCA Editor features

## v1.8.0
- SCA Editor with trim and delay editing
  - Trim frames from start/end
  - Per-frame and bulk delay adjustment
  - Filmstrip preview with frame thumbnails
  - Preview zoom levels (x1, x2, x3)
  - Save edited animations

## v1.7.0
- Added SCA animation playback support
- Frame-by-frame navigation
- Play/Pause controls

## v1.6.0
- Added SPECSCII text mode support
- Custom font loading

## v1.5.0
- Added ZIP archive support
- Auto-extract and file selection

## v1.4.0
- Added BMC4 border multicolor format
- Added BSC border screen format

## v1.3.0
- Added 8x1 multicolor (MLT/MC) format
- Added tricolor RGB (.3) format

## v1.2.0
- Added 8x2 multicolor (IFL) format
- Added flash animation toggle

## v1.1.0
- Added grid overlay
- Added palette selection
- Added border size options

## v1.0.0
- Initial release
- SCR format support (standard and monochrome)
- 53c/ATR attributes-only format
- Zoom levels 1-5
- Dark/light theme
