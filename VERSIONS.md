# SpectraLab Version History

## v1.39.0
- ULA+ palette support (64-color mode)
  - Auto-detects ULA+ files by size (6976 bytes = 6912 SCR + 64 palette)
  - GRB332 color format: 3 bits green, 3 bits red, 2 bits blue per entry
  - 4 CLUTs (Color Look-Up Tables) × 16 colors each
  - Default palette generates standard ZX Spectrum colors
  - Two palette view modes with toggle checkbox:
    - Grid mode: 8×8 grid showing all 64 colors at once
    - Classic mode: 16-color row with CLUT selector (0-3)
  - Left-click to select ink color, right-click for paper color
  - Rendering uses ULA+ palette when in ULA+ mode
  - Format conversion: SCR ↔ ULA+ (add/strip palette)
  - PNG import: ULA+ target format with optimal palette generation
    - Extracts dominant colors from source image
    - Clusters colors into 4 CLUTs based on cell usage
    - Generates 64-color palette optimized for the image
  - Save/Load palette: 64-byte raw .pal files (GRB332 format)
    - Compatible with ZX emulators and tools
  - Color editor: Ctrl+click palette to edit individual colors
    - R/G/B sliders (0-7 for R/G, 0-3 for B)
    - Live preview while adjusting
    - Undo support for color changes
  - Color picker (eyedropper): Alt+click on canvas to pick colors
    - Picks both ink and paper from the clicked cell
    - For ULA+: automatically selects correct CLUT in palette UI
    - For standard SCR/BSC: also picks bright and flash attributes
    - Works with most tools (not rect/circle/gradient which use Alt for "from center")
  - File info shows "SCR (ULA+) (64 colors)" for ULA+ files
- Border editing: Rectangle tool now works on BSC/BMC4 border
  - Click and drag to fill rectangular region with current color
  - Left click = ink color, Right click = paper color
  - Preview shown while dragging
  - Can drag into paper area (only border portion painted)
- Barcodes: Vertical color patterns for border decoration
  - 8 barcode slots for storing patterns
  - Shift+click slot then click border to capture pattern
  - Click slot to select, click again to deselect
  - Ctrl+click to clear slot
  - Auto-detects width (8/16/24px) based on capture position
  - Click/drag on border to stamp selected barcode
  - Save/load barcodes to .slbc files
  - Palette data saved/loaded with picture state (multi-picture support)
  - Clear screen resets palette to default colors

## v1.38.0
- SCA animation payload type 1 support
  - Attribute-only animation format (768 bytes per frame vs 6912 for full frames)
  - Uses 8-byte fill pattern as bitmap template for all frames
  - Significantly smaller file sizes for attribute-based animations
  - Info panel shows format version and payload type (e.g., "SCA (v1)", "full frames (v0)")
  - SCA editor fully supports type 1: trim, optimize, save, export
  - Export to SCR series generates proper bitmaps from fill pattern
  - Export to 53c series extracts attributes only (works with both type 0 and type 1)
- Image import: 53c/127c (attribute-only) format
  - New "53c (attr)" output format option
  - Pattern selector: Checker (53c), Stripes, or DD/77 (127c)
  - Pattern-aware color detection for accurate ink/paper separation
  - Uses pattern mask to identify ink vs paper pixels in source image
  - Ideal for re-importing images that were originally 53c/127c format

## v1.37.0
- Airbrush now supports masked modes
  - Spray through custom brush pattern like a stencil
  - Only paints ink where mask pattern is set (gradual buildup without overwriting)
  - Works with both Masked (fixed origin) and Masked+ (stroke-relative origin)
- UI reorganization
  - Moved clipboard buttons (Select, Cut, Paste, Invert, Rotate, Flip H/V) to Transform tab
  - Combined rotate/mirror buttons: auto-detect target (clipboard while pasting, otherwise custom brush)
  - Compacted layer buttons: Save/Load Project now use 💾/📂 icons on same row
  - Moved Save/Load Brushes to Custom Brushes header with 💾/📂 icons
  - Snap and Mode dropdowns remain in Edit tab

## v1.36.0
- Masked paint modes for pattern drawing
  - Masked mode: use custom brush as tiled mask pattern with fixed origin (0,0)
  - Masked+ mode: use custom brush as tiled mask with stroke-relative origin (each stroke starts fresh)
  - In masked modes, custom brush defines the pattern, regular brush shape/size defines the tool
  - Custom brush transparency (mask) is respected in masked modes
- Undo/redo improvements
  - Undo now properly restores layer data, not just flattened screen
  - Fixed issue where undo appeared to work but layer content was preserved

## v1.35.0
- Per-layer attributes support
  - Each layer now stores its own attribute data (ink/paper/bright/flash colors)
  - Drawing on a layer sets attributes on that layer, not globally
  - Attribute compositing: each cell uses the topmost visible layer's attribute that has pixel content
  - Supports all attribute formats: SCR/BSC (8×8 cells), BMC4 (8×4 cells with dual banks), IFL (8×2 cells), MLT (8×1 cells)
  - Project file format updated to v3 with per-layer attributes
  - Backward compatible: v2 projects load with global attributes on background layer only
  - Workspace files also save/load per-layer attributes
- Editor color improvements
  - Ink/paper colors now persist to localStorage
  - New default colors: ink=black, paper=white, border=white
  - New pictures use current editor colors instead of hardcoded values
  - BSC/BMC4 borders use current border color when creating new pictures
  - Clear screen uses current border color for BSC/BMC4 border area
- Added x20 zoom level
- Preview panel default position changed to bottom-right

## v1.34.0
- Reference image improvements
  - Controls moved to collapsible block
  - Added Clear button to remove reference image
  - Added X/Y position controls (can be negative for offset)
  - Added W/H size controls (custom size or auto-fit to format)
  - Reference image now saved in workspace files
- UI improvements
  - View Settings (border, palette, grid, flash, attrs, preview) in collapsible block
  - File Info section in collapsible block
  - Collapsible block states persist in localStorage
  - Preview panel can be dragged to any position
  - Preview panel can be dragged up to 3/4 outside viewport
  - Renamed "Paper" to "Paper grid" and "Border" to "Border grid"
  - Added 32px to grid sizes, 8px/16px to subgrid sizes
- Fixed: Opening pictures no longer resets zoom level

## v1.33.0
- UI improvements
  - New and Save buttons at top of control panel (between Browse and tabs)
  - Palette, Bright, Flash moved to top of Edit tab for quick access
  - Renamed "Save file..." to "Save ASM file" in Transform tab
  - Reduced spacing between clipboard buttons
- Added Subgrid snap mode
  - Grid snap uses paper grid size from View tab
  - Subgrid snap uses paper subgrid size from View tab
- Fixed brush preview offset bug (preview now matches actual stamp position)
- QR code generator improvements
  - Added version picker (V1-V20) with dimensions and max capacity
  - Added 3px module size option
  - Auto-uppercase conversion for alphanumeric mode (max capacity)
  - Better error messages for size constraints

## v1.32.0
- Shape modifier keys for Rectangle and Circle tools
  - Ctrl: Constrain to square/circle (1:1 aspect ratio)
  - Alt: Draw from center instead of corner
  - Ctrl+Alt: Both combined
  - Works during preview and final drawing
- New pictures now open at zoom x2 by default

## v1.31.0
- Added Airbrush tool (G)
  - Sprays random pixels within configurable radius
  - Uses current brush size and shape for each spray point
  - Settings: Radius (4-32px), Density (0.03-1.0), Falloff
  - Falloff options: Uniform, Soft, Medium, Hard, Very Hard
  - Center-concentrated distribution with higher falloff values
  - Continuous spray while mouse button held (no movement required)
  - Right-click sprays paper color instead of ink
- Added Gradient tool (D)
  - Fills screen with dithered monochrome gradients
  - Six gradient types: Linear, Radial, Diamond, Conical, Square, Spiral
  - Two dithering methods: Bayer (ordered 8×8) and Noise (blue noise 16×16)
  - Reverse option to swap ink/paper direction
  - Drag from start to end point to define gradient direction/size
  - Right-click reverses gradient direction
- Updated Help dialog with new tools documentation

## v1.30.0
- Fixed mono output in image import
  - Now uses luminance (perceived brightness) instead of color distance
  - Yellow/orange colors now correctly show dithered detail instead of solid white
  - Applies to SCR, IFL, MLT, BMC4, and BSC formats with mono output enabled

## v1.29.0
- Multi-picture editor
  - Load and edit multiple pictures simultaneously
  - Tab bar appears when 2+ pictures are open
  - Switch between pictures by clicking tabs
  - Close button (×) on each tab
  - Modified indicator (•) shows unsaved changes
  - Confirmation dialog when closing modified pictures
  - Maximum 8 pictures open at once
  - Independent undo/redo history per picture
  - Independent layer state per picture
  - Independent zoom level per picture
  - Copy/paste works across pictures (same format)
- Workspace files (.slw)
  - Save Workspace: saves all open pictures to single file
  - Load Workspace: restores all pictures from workspace file
  - Preserves layers, zoom levels, and active picture
  - Per-picture settings: ink/paper colors, bright, tool, brush size/shape, scroll position
  - Workspace-level settings: palette, border color/size, grid settings, show attributes
  - Buttons in Transform tab
- SCA animations don't participate in multi-picture (separate workflow)

## v1.28.0
- QR code generation tool
  - Generate QR codes from text or URLs
  - Configurable size (64-192px) or auto-fit
  - Position control (X/Y offset on canvas)
  - Live preview before applying
  - Pure JavaScript implementation (no external dependencies)

## v1.27.0
- Fullscreen editor mode (F11)
  - Maximizes canvas to fill entire screen
  - Compact floating draggable palette with tools and colors
  - Tab key toggles floating palette visibility
  - ESC or close button to exit fullscreen
  - Use keyboard shortcuts for brush size ([ ]) and undo/redo (Ctrl+Z/Y)
- Fixed keyboard shortcuts for non-Latin keyboard layouts (Russian, etc.)
  - Shortcuts now work based on physical key position, not character produced
  - Affects all letter-based shortcuts (P, L, R, C, etc.) and Ctrl+key combinations
- Changed Preview panel hotkey from P to ~ (Shift+backtick) to avoid conflict with Pixel tool
- Fixed first click not drawing on canvas (focus issue)
- Image import dialog redesigned with better UI organization
  - Three logical groups: SOURCE, TRANSFORM, OUTPUT
  - Each group has bordered container with clear visual separation
  - Position (X/Y) and Size (W/H) now on separate rows for clarity
  - Color options (LAB, Grayscale, Mono) grouped together
- Image import dialog now has Width/Height controls
  - Specify exact output dimensions alongside X/Y offset
  - Defaults update automatically when format changes (256×192 for SCR, 384×304 for BSC, etc.)
  - Lock aspect ratio option (🔗): changing W auto-calculates H and vice versa
- Border brush size support
  - Brush size now controls vertical height when painting on BSC/BMC4 border
  - Size 1 = 24×1px line, Size 2 = 24×2px line, etc.
  - Width remains fixed at 24px (3 border cells)
- Brush preview updates immediately when changing size with [ ] hotkeys
  - No longer requires mouse movement to see new brush size
- Brush size hotkeys work in border area

## v1.26.0
- Text tool for adding text to images (T)
  - Supports .768/.ch8 ZX Spectrum bitmap fonts (8×8 characters)
  - Supports TrueType/OpenType fonts (.ttf/.otf/.woff) at any size
  - Load custom fonts or use system fonts (Arial, Courier New, etc.)
  - Live preview while positioning text
  - Click canvas to stamp text
- Tool buttons now use icons instead of text for a cleaner, more compact UI
  - Pixel (✎), Line (╱), Rectangle (□), Circle (○), Fill (◉), Cell (▦), Eraser (⌫), Text (T)
  - Select (⬚), Cut (✂), Paste (⧉), Invert (◐)
- Flood fill tool now works on BSC/BMC4 border area
  - Fills all connected 8px border cells with the same color
- Custom brushes expanded from 6 to 12 slots (2 rows of 6)
- Custom brushes section is now collapsible
  - Auto-expands when any brush is defined
  - Auto-collapses when all brushes are cleared
  - Shows indicator with brush count ("None" or "N defined")

## v1.25.0
- Fixed BSC/BMC4 layer system for main screen editing
  - Layers now work correctly for bitmap data (was only working for border)
  - Fixed getLayerBitmapSize() to use correct constants for each format
- Fixed Clear screen with layers enabled
  - Now properly reinitializes layers after clearing
  - Fixes issue where MLT format only cleared bitmap, leaving attributes
- Image import dialog enhancements
  - Added grid overlay checkbox for output preview (orange 8×8 grid)
  - Added X/Y offset controls for positioning imported image in output
  - Added x3 zoom option for output preview
  - Fixed original canvas zoom (no longer affected by preview zoom setting)
- Fixed layers not available after importing image
  - Layers now properly initialized after PNG/image import
- Simplified file input (removed label)

## v1.24.0
- Added BMC4 border editing
  - Same border structure as BSC (384×304 frame, per-line colors)
  - Click/drag to paint border colors with ink (left) or paper (right) color
- Added layer system for bitmap editing (all formats except .53c/.atr)
  - Add/remove/reorder layers with visibility toggles
  - Background layer cannot be deleted (always opaque)
  - Upper layers support transparency via eraser
  - Shared attributes per cell across all layers (ZX Spectrum constraint)
  - Automatic flattening on save/export
- Layer system now includes border data for BSC/BMC4 formats
  - Each layer stores separate border color data
  - Border changes are tracked per-layer with transparency mask
  - Project files (.slp v2) preserve border layer data
- Added Eraser tool (E key)
  - On background layer: paints with paper color
  - On upper layers: makes pixels transparent (reveals layers below)
  - Works with all brush shapes and sizes
- Layer panel in Edit tab (collapsible, default hidden)
  - Click header to expand/collapse controls
  - Active layer indicator shown in header
  - Click layer to select, eye icon to toggle visibility
  - Double-click layer to rename
  - Add, Remove, Move Up/Down, Flatten buttons
  - Flatten merges all layers and resets to initial state
- Project file format (.slp - SpectraLab Project)
  - Save Project: preserves all layers, masks, names, visibility
  - Load Project: restores complete layer structure
  - JSON-based format for easy inspection/editing

## v1.23.0
- UI reorganization with tabbed side panel
  - View tab: display settings (Zoom, Border, Palette, Flash, Grid, Attrs, Font, Reference Image, File Info)
  - Edit tab: drawing tools (Pixel, Line, Rectangle, Fill, Select, Colors, Brush)
  - Transform tab: Undo/Redo/Clear, Save, Convert
- Simplified workflow
  - Removed explicit Edit mode toggle - editing auto-enabled when editable picture loads
  - Removed New button - clicking Edit/Transform tab without picture shows New Picture dialog
  - File info moved into View tab (no separate panel)
- SCA animation editing integrated into Edit tab
  - Clicking Edit tab with SCA loaded opens animation editor (trim/delay)
  - Removed separate "Edit / Trim" button
  - Fixed SCA animation continuing after creating new picture
- Separate grid controls for Paper and Border areas
  - Independent grid size (None/8/16/24px) for each
  - Independent subgrid size (None/1/2/4px) for each
- Fill tool now uses selected brush pattern
  - Custom brush patterns tile across fill area for dithered fills
  - Standard brushes fill solid as before
- Renamed Tools tab to Edit

## v1.22.0
- Added editing and import support for multicolor formats
  - IFL (8×2 multicolor)
  - MLT (8×1 multicolor)
  - BMC4 (8×4 multicolor + border)
- Added RGB3 tricolor format editing and import
- Added Monochrome format editing and import
  - Full (256×192), 2/3 (256×128), 1/3 (256×64) screen sizes
- Performance optimization: all screen rendering uses ImageData
  - Replaced ~49k fillRect calls with single putImageData
  - Affects: Mono, RGB3, BMC4, IFL, MLT, BSC main screen
  - Dramatically faster rendering, smooth freehand drawing
- Fixed BMC4 drawing coordinate offset (border-aware mouse handling)
- Fixed preview thumbnail update delay after drawing
- Fixed New Picture dialog closing on double-click/long-click
  - Removed click-outside-to-close behavior
  - ESC key and Cancel button still work
- Redesigned Help window with tabbed interface
  - Tabs: Viewer, Editor, Formats, About
  - Added GitHub and License links

## v1.21.0
- Performance optimizations
  - DOM element caching in import dialog (30+ elements cached)
  - Reusable temporary canvases for rendering (eliminates per-frame allocation)
  - Optimized canvas resizing (only when dimensions change)
  - Faster slider response in image import dialog
- Added new dithering methods for image import
  - Two-row Sierra, Serpentine Floyd-Steinberg
  - Riemersma (Hilbert curve), Blue noise, Pattern dithering
- Added edge-preserving smoothing (bilateral filter) for image import
- Added mono output option for black & white only conversion
- Fixed ESC key to close import dialog

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
