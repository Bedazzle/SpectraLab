# SpectraLab

A pure JavaScript viewer and editor for ZX Spectrum graphics formats. No server required — runs directly in any browser, locally or hosted. No build system, no bundler, no framework.

## Features

- **View** a wide range of ZX Spectrum screen formats (standard, multicolor, ULA+, ULANext, Gigascreen, tricolor RGB, SPECSCII, chr$, Nirvana tiles, MGH, HLR, STL, BSP, NXI, SL2, etc.)
- **Edit** SCR, ULA+, ULANext, 53c/127c, BSC, BSP, BMC4, IFL, MLT, Gigascreen, RGB3, SPECSCII, chr$, ZXP, MGH (mg1/mg2/mg4/mg8), HLR, STL, NXI and SL2 pictures with pixel-accurate tools
- **Multi-picture editing**: open and edit up to 15 pictures simultaneously with tab switching, per-picture undo, layers and zoom
- **Workspace files**: save/load all open pictures as a single .slw file (palette, filters, grid, reference image, sprite sheet, etc.)
- **Project files**: save a single picture with full layers/attributes/border/mask data as .slp
- **Import** PNG/GIF/JPG/WebP/BMP images with dithering, LAB color space matching, alignment controls and conversion to any editable format
- **Import animated GIF** directly as SCA animation — multi-frame GIFs are auto-detected, each frame converted to SCR with dithering, per-frame delays preserved
- **Tile to screens**: split a large image into a grid of output-format-sized pictures with automatic edge padding
- **Sprite editor**: floating multi-tile sprite sheet editor with mono / attributed / multicolour (8×1, 8×2, 8×4) modes, animation, onion skinning, grab from screen/memory, Nirvana .btile/.wtile export
- **Load** .sna and .z80 snapshots (48K and 128K, V1/V2/V3) and extract screens and sprites from snapshot RAM
- **Memory Viewer**: browse any memory bank as 1-bit graphics with sprite extraction, multiple addressing/grab modes
- **Play** SCA animations (type 0 full frames and type 1 attribute-only) with frame-by-frame control
- **Edit** SCA animations: trim, adjust delays, remove duplicates, export to SCA / SCR zip / 53c zip / animated GIF / PNG zip
- **Customize** display: fractional / x1–x20 zoom, border color/size, palettes (including 53c/127c pattern-blended palettes, ULA+ 64-color), grid and subgrid overlays (separate for paper/border), grid color presets, monochrome mode, flash animation
- **Display filters**: CRT scanlines, noise, composite chroma bleed, phosphor glow, vignette, CRT curvature, pixel smoothing, with built-in presets (CRT TV, Composite, VHS, Arcade)
- **Fullscreen mode (F11)** with floating tool palette in both viewer and editor
- **Tabbed UI**: View (display + filters), Edit (drawing tools + layers), Transform (undo / save / convert / workspace)
- **Load** files directly from ZIP archives (auto-extract) and drag-and-drop anywhere on the window
- **Custom fonts** for SPECSCII and Text tool (768/ch8 ZX Spectrum fonts plus TrueType/OpenType)
- **Export to PNG/GIF**: export any screen to PNG or animated GIF (gigascreen flicker) using current view settings (zoom, border, grid, palette, filters)
- **QR code generator**: V1–V20, module sizes 1/2/3/4/8, grid-snapped placement
- **Dark / light theme** (follows OS preference on first visit)

## Screen Editor

Edit SCR, ULA+, ULANext, BSC, BSP, BMC4, IFL, MLT, Gigascreen, RGB3, 53c/127c, SPECSCII, ZXP, chr$, MGH, HLR, STL, NXI and SL2 pictures with authentic ZX Spectrum color handling:

- **Tools**: Pixel (P), Line (L), Rectangle (R), Circle/Ellipse (O), Airbrush (G), Gradient (D), Flood Fill (I), Fill Cell (C), Recolor (A), Eraser (E), Text (T), Select (S), Color Picker (K)
- **Eraser (E)**: makes pixels transparent on upper layers; paints paper on background
- **Airbrush (G)**: sprays random pixels within a radius
  - Configurable radius (4–32px), density (0.03–1.0), falloff (Uniform → Very Hard)
  - Supports all brush paint modes including masked stencil modes
  - Continuous spray while mouse button held; path-distributed spray at high speeds
- **Gradient (D)**: fills with dithered monochrome gradients
  - Types: Linear, Radial, Diamond, Conical, Square, Spiral
  - Dithering: Bayer 8×8 or blue noise 16×16
  - Supports custom brushes and all paint modes
- **Color Picker (K)**: dedicated eyedropper tool, or Alt+click in any drawing tool
  - Works on SCR, BSC, BSP, IFL, MLT, BMC4, ULA+, Gigascreen, STL, 53c/127c, RGB3, NXI, SL2, SPECSCII
  - Left click picks ink/primary, right click picks paper/secondary
- **Fill with patterns**: Flood Fill uses the selected brush — custom brush patterns tile across the fill area for dithered fills
- **Brush**: sizes 1–16px, shapes Square / Round / Horizontal / Vertical / Stroke (/) / Back stroke (\) — applies to Pixel, Line, Rectangle, Circle, Eraser, Fill, Airbrush
- **Brush paint modes**: Replace (default), Set, Invert, Recolor, Retouch, Masked, Masked+ — persisted to localStorage
- **Custom Brushes & Tilesets**: tabbed interface with Custom, ROM, UDG, and user-loaded tabs
  - Custom tab: 12 user brush slots, capture from screen (max 64×64)
    - Click = select, Shift+click = capture, Ctrl+click = clear
    - Rotate 90° CW (R), Mirror H (H), Mirror V (V)
  - ROM tab: current font as 96 selectable 8×8 tiles
  - UDG tab: 96 built-in tiles (block graphics, dithers, borders, shapes, arrows, connectors)
  - Load tilesets via "+" button: 768-byte (96 tiles) or 2048-byte (256 tiles) formats, or .slb brush sets
  - Grab tileset from screen via crosshair: select area, tiles grabbed L→R, T→B
  - Click any tile to use as brush with all drawing tools
  - Up to 8 tabs total; user tabs persist in localStorage
- **Copy/Paste**: Select tool (S) drag-selects (auto-copies); Ctrl+V to paste with preview
  - Snap modes: Grid, Grid Center, Subgrid, Subgrid Center, Zero, Brush, Off
  - Paste respects brush paint mode; rotate / mirror clipboard during paste
- **Layers**: add/remove/reorder with visibility toggles, per-layer attributes (all formats except attribute-only)
  - Background layer always opaque, upper layers support transparency via eraser
  - Attribute compositing per cell from topmost visible layer that has pixel content
  - Layers include per-layer border data for BSC/BMC4
  - Flatten merges all layers into the background
  - Add/remove/move/flatten are undoable
- **Drawing**: Left click = ink, Right click = paper
- **Colors**: ink (0–7), paper (0–7), Bright and Flash toggles; persisted ink/paper across sessions
- **Undo/Redo**: 32 levels (Ctrl+Z / Ctrl+Y) with full state restoration (format, filename, ULA+ palette, layers, masks, HLR pattern, etc.)
- **Preview panel**: draggable, zoomable (x1–x4), shows full screen while editing
- **Text tool**: ZX Spectrum .768/.ch8 bitmap fonts or TrueType/OpenType fonts at any size
- **QR code generator**: V1–V20 (20–970 characters), module sizes 1/2/3/4/8px, grid-snapped placement, live preview
- **Fullscreen mode (F11)**: maximizes canvas with floating tool palette (Tab toggles palette)
- **Save**: export back to the original format (Ctrl+S); layers are automatically flattened
- **Format conversion**: SCR ↔ ATTR ↔ BSC ↔ BSP, SCR/ULA+ → NXI/SL2 (256/320/640), NXI ↔ SL2, NXI/SL2 cross-mode (256↔320↔640), NXI/SL2 → SCR; border color picker, 18 bitmap patterns for attr→bitmap
- **Multi-picture tab bar**: appears with 2+ pictures, independent undo/layers/zoom, unsaved-changes indicator (•)
- **Workspace**: save/load all open pictures as a single .slw file

The editor works like classic ZX Spectrum art programs (Art Studio, Artist II) — drawing in an 8×8 cell sets that cell's attribute to the current ink/paper/bright/flash.

## Attribute Editor (.53c / .127c / .atr)

Edit 768-byte attribute-only files with full pattern-aware color selection:

- **Pattern palette**: unique dither-pattern swatches showing actual ink/paper colors through the selected pattern
  - Adapts to current pattern: Checker (~53 colors), Stripes (~53), DD/77 (~127)
  - Sort modes: Hue, RGB, Color (attribute byte); Reverse toggle
  - "Blend colors" mode renders each cell as a solid averaged color instead of a dither
- **Cell painting and drawing tools**: pixel, line, rectangle, circle, flood fill, recolor, eraser, color picker
- **Layers**: full layer support with per-cell masks
- **Undo/Redo**: 32 levels
- **Save**: normalized attribute bytes (ink ≥ paper) for ChunkyPaint compatibility

## ULA+ Support (64-color mode)

Full support for the ULA+ 64-color extension:

- **Format detection**: files of 6976 bytes (6912 SCR + 64-byte GRB332 palette) auto-detected as ULA+
- **Two palette views**: 8×8 grid of all 64 colors, or classic 16-color row with CLUT selector (0–3)
- **Editing**: Ctrl+click any palette color to edit R (0–7) / G (0–7) / B (0–3) with live preview and undo; Shift+click to copy/swap colors between palette slots
- **Import**: convert PNG/JPG/etc. to ULA+ with optimal palette generation or from a loaded .pal / ULA+ .scr
- **Eyedropper**: picks color and auto-selects the correct CLUT
- **Palette files**: save/load 64-byte .pal GRB332 files (12 bundled palettes in `palettes/`)
- **ASM export**: sjasmplus-compatible source for Pentagon 128K / ZX Spectrum 48K with I/O palette programming
- **Format conversion**: SCR ↔ ULA+ (add or strip palette)

## ULANext Support (ZX Spectrum Next extended palette)

View and edit SCR files with ULANext extended palettes:

- **Format detection**: files in the range 6945–7426 bytes auto-detected as ULANext (SCR + ink mask + palette)
- **Configurable ink mask**: 8 valid masks ($01–$FF) split the attribute byte between ink and paper indices, from 2/128 to 256/1
- **Dual palette sizes**: 9-bit RGB333 (2-byte entries, same as NXI) and 8-bit RRRGGGBB (1-byte entries), auto-detected by file size
- **Round-trip save**: preserves ink mask and palette in original format
- **Format info**: displays mask value, ink/paper color counts, and palette bit depth

## Image Import

Import PNG, GIF, JPG, WebP, BMP and convert to any editable format:

- **Output formats**: SCR, ULA+, IFL, MLT, BMC4, BSC, BSP, 53c/127c (attribute-only), Gigascreen (.img), MGH (mg1/mg2/mg4/mg8), STL, RGB3, NXI (256×192, 320×256, 640×256), SL2 (256×192, 320×256, 640×256), Monochrome, SPECSCII, ZXP (variable dimensions)
- **Automatic scaling** to the format's native dimensions (256×192, 320×256, 640×256, 384×304 for BSC/BMC4, 8–2048 custom for ZXP, etc.)
- **Dithering**:
  - Global: Floyd-Steinberg, Jarvis-Judice-Ninke, Stucki, Burkes, Sierra / Sierra Lite / Sierra 2-Row, Serpentine Floyd-Steinberg, Dizzy (adaptive error diffusion), Riemersma (Hilbert curve), Atkinson, Ordered (Bayer 2×2 / 4×4 / 8×8), Blue noise, a-dither (arithmetic), Pattern (clustered dots), Noise, None
  - **Strength slider (0-100%)** scales how much quantization error is diffused; for ordered / pattern / blue-noise methods, strength > 0 enables a hybrid ordered+diffusion mode
  - **Serpentine scanning** checkbox alternates row direction during error diffusion to reduce horizontal banding
  - Cell-aware variants (Floyd/Atkinson/Ordered/None) that dither inside each cell using its chosen colors
  - Per-channel dithering for RGB3 (each R/G/B bitplane dithered independently as 1-bit mono)
- **Brightness / Contrast / Saturation**: manual sliders with auto-detect
- **Color space**: LAB color matching for perceptually accurate quantization
- **Position / Size / Fit / Align**: 9-position alignment (Top-Left … Bottom-Right) for Letterbox / Fill-crop / Fit width / Fit height modes; explicit X/Y/W/H controls with optional aspect-ratio lock
- **Paper rule** (2-color cells): Darker color / Lighter color / First pixel paper
- **Palette source**: current display palette, generated ULA+ optimal palette, loaded .pal file, or extracted from an existing ULA+ picture; Ctrl+click palette entries to edit, eyedropper on preview picks a color
- **Cell-aware conversion**: respects 8×8 / 8×4 / 8×2 / 8×1 attribute constraints per format
- **BMC4 border**: encodes real border colors from the 384×304 source, respecting Spectrum timing constraints
- **Gigascreen / MGH**: per-cell brute-force search over ~2628 unique attribute-pair quads for up to 4 perceived colors per cell
- **Tile to screens**: split a large source image into a grid of output-format pictures
  - Auto-calculates grid from crop area and output format dimensions
  - Edge tiles padded with black; yellow dashed overlay on the source canvas
  - Per-tile preview with navigation; tile filenames `name_col_row.ext`
  - Works for all output formats including Gigascreen and MGH variants
- **Live preview**: side-by-side original and converted output with grid overlay and x1–x3 zoom

## BSC / BSP / BMC4 (border screen) Editor

Edit .bsc (11136-byte), .bsp (variable, with 70-byte header), and .bmc4 (11904-byte) files with full border editing:

- **Per-line border colors** for top, bottom, and side borders
- **Hidden zone indicator**: grid shows leftmost/rightmost 16px with red overlay (typically hidden on real hardware)
- **Border drawing**: click/drag with rectangle, flood fill and brush-sized vertical lines (left = ink, right = paper)
- **Barcodes**: vertical color patterns for border decoration — 8 slots, capture with Shift+click, stamp by clicking the border, save/load as .slbc
- **Layer system** preserves per-layer border data
- **BSP header**: 70-byte header with title/author metadata, 4 variants (screen, screen+border, gigascreen, gigascreen+border), RLE border compression
- **ASM export**: sjasmplus Pentagon 128K source with exact 224T/line cycle-accurate timing, 71680T/frame, OUT-on-change + NOPs, SAVESNA output

## Gigascreen Editor (.img / .mg1 / .mg2 / .mg4 / .mg8 / .hlr / .stl / gigascreen chr$)

Edit two-frame gigascreen formats with live blended preview:

- **Virtual color palette**: 136 unique blended colors from 16 ZX colors (8 normal + 8 bright)
- **4-color per cell**: each ink/paper pair gives 4 paintable blends (Ink+Ink, Ink+Paper, Paper+Ink, Paper+Paper)
  - Left-click a color → L mouse button; right-click → R mouse button
- **Attribute cell heights**: 8 (standard), 4 (mg4), 2 (mg2), 1 (mg1, with 8×8 outer columns) — editor adapts automatically
- **True dual-frame editing**: different pixel patterns per frame, layered with dual-frame attribute storage
- **Display modes**: Average (blended) or Flicker (50 fps alternating frames)
- **HLR fill pattern**: editable 8-byte mask defining ink/paper regions per cell, with presets (halves, checker, stripes, diagonals) or custom hex input, live 8×8 preview, undoable pattern changes
- **All drawing tools**, layers, eyedropper and clear work with virtual colors
- **Save**: preserves the full file format including MGH 256-byte header (mg*), HLR self-contained loader, or STL interleaved attrs
- **ASM export**: sjasmplus dual-screen banking (banks 5/7), 25 Hz alternation, SAVESNA output

## RGB3 Viewer / Editor (.3)

View and edit 18432-byte tricolor RGB files (three monochrome bitmaps shown in sequence):

- **Flicker emulation**: cycles R, G, B frames at ~16.7 Hz each for perceived full color
- **Blended view**: palette-aware averaged color from all three bitplanes (works with every bundled palette)
- **Dedicated 8-color palette** with L/R (left/right button) selection and bitplane tooltips
- **ASM export**: unrolled `LD HL,nn : PUSH HL` copy (21T per 2 bytes), tear-free 50 fps display, SAVESNA output

## IFL / MLT / Multicolor Viewers and Editors

- **IFL (.ifl)** — 8×2 multicolor, 9216 bytes; full editor support
  - ASM export uses POP/PUSH stack technique with dual-screen interlace (show one screen, write the other), 448T per 2-line attr row, compact sjasmplus macros, SAVESNA output
- **MLT / .mc** — 8×1 multicolor, 12288 bytes; full editor support
- **BMC4** — 8×4 multicolor with border, 11904 bytes; full editor and image-import support including border quantization

## SPECSCII Text Editor

Edit 32×24 character streams using the ZX Spectrum ROM font plus block graphics:

- **Character palette**: 112 tiles (96 ROM 0x20–0x7F + 16 block graphics 0x80–0x8F) with live theme-aware preview
- **Drawing tools**: pixel (place char), line, rectangle, circle, flood fill, eraser, text
- **Paint modes**: Set, Invert (swap ink/paper), Recolor (attributes only) — all tools respect the current mode
- **Layer support**: OVER (XOR) compositing with per-cell transparency masks, multiple layers
- **Attributes**: per-cell ink / paper / bright / flash; right-click picks attributes from the screen
- **Copy / cut / paste**: full clipboard with invert and recolor paste modes, snap-to-grid
- **Custom fonts**: load any 768-byte .768/.ch8 bitmap font
- **Export**: save as `.specscii` (stream format with embedded AT/INK/PAPER/BRIGHT/FLASH/OVER control codes), render to .scr via Transform tab, or export to self-running `.tap` BASIC program

## chr$ Editor

Support for ZX-based `.ch$` / `.chr$` / `.ch-` character-array files:

- **7-byte header**: "chr$" magic + width/height in cells + bytes-per-cell (9 = mono/attr, 18 = gigascreen)
- **Variable dimensions** with linear interleaved 8×8 cell layout
- **Gigascreen chr$** (18 bytes per cell): two frames per cell with blended rendering
- **Full editor**: drawing tools, attributes, layers, copy/paste, clear, save

## ZX-Paintbrush (.zxp) Editor

Variable-size ZX-Paintbrush text format, 8–2048 pixels per axis (÷8):

- **Load / save / drag-drop** .zxp text files from disk or ZIP archives
- **Auto-detected attribute mode** from line count: 8×8 (SCR), 8×4 (IFL-like), 8×2 (IFL), 8×1 (MLT)
- **ULA+ palette** support (64-byte palette extension)
- **New Picture dialog**: configurable width / height / palette type (ULA or ULA+), remembered via localStorage
- **Image import**: PNG/JPG/etc. → ZXP with custom dimensions
- **Fractional zoom** (×1/8, ×1/4, ×1/2) and viewport-clipped rendering for large images
- **Deferred Catmull-Rom stroke smoothing** for big pictures at fractional zoom

## Sprite Editor

Full-featured floating sprite sheet editor for ZX Spectrum game graphics:

- **Multi-tile sprites**: N×M cells of 8×8 pixels (up to 8×8 = 64×64 per frame)
- **Modes**: Monochrome, Attributed (8×8 cells), Multicolour 8×1 / 8×2 / 8×4
- **Drawing tools**: Draw (D), Erase (E), Flood Fill (F), Line (L), Rectangle (R), Selection (S), Mask (M)
- **Right-click = paper**: matches main canvas; Fill left=ink, right=paper
- **Mask editing**: toggleable mask layer with red overlay; per-sprite transparency
- **Transforms**: Flip H / V, Rotate CW/CCW (square only), Shift 1px any direction, Invert, Clear
- **Attributes**: unified color palette, left-click ink, right-click paper, bright toggle; attributes toggle for mono view
- **Animation**: multiple frames per sprite with onion skinning, adjustable playback speed, frame bar with multi-select (Ctrl/Shift), reorder, duplicate, delete
- **Attr scroll**: shift arrows scroll attributes along with pixels in multicolour modes
- **Spriteset list**: multi-select, right-click context menu — Merge to animation, Add/Move frames to another sprite, Split frames to sprites, Delete, Clear all
- **Grab from screen**: drag a rectangle on any loaded picture to extract sprites
  - Modes: Single sprite, Sprite phases, Singles grid, Phases grid
  - Grid by cell size (W×H) or column/row count; row-first or column-first ordering
  - Auto-detects multicolour source formats (IFL, MLT, BMC4, 8×2 btile/wtile)
- **Grab from memory**: extract sprites from snapshot RAM via the Memory Viewer (same grab modes)
- **Load Nirvana tiles**: `.btile` (column-major attrs) and `.wtile` (row-major attrs) files open as single variable-size 8×2 multicolour images
- **Export ASM**: sjasmplus DB lines with visual binary comments (█·), labels, SpectraLab version header
- **Export BIN**: raw binary or Nirvana engine format (.btile / .wtile) for multicolour sprites
- **Save / Load**: sprite sheets as .sls files; included in project (.slp) and workspace (.slw) save/load
- **Use as Brush**: stamp current sprite frame onto the main canvas

## Font Editor

Standalone page (`font_editor.html`) for creating and editing ZX Spectrum bitmap fonts. Open via the **Font** link in the View tab bottom bar.

- **Fixed-width fonts**: 8×8 bitmap fonts with arbitrary glyph count (1–255), width modes (8/6/4/variable)
- **FZX proportional fonts**: variable glyph width (1–16px), configurable height (1–16px), per-glyph shift and kern, signed tracking
- **UDG support**: load, edit, and save UDG blocks (21 characters A–U, char codes 144–164)
- **File formats**: `.768`, `.ch8`, `.bin`, `.SpecCHR`, `.fnt`, `.fzx`; visual format chooser for 2048-byte files (normal vs interlaced)
- **New font dropdown**: 96 glyphs, 256 glyphs, 96+UDG, 256+UDG, custom glyph count, new FZX font
- **Save format dropdown**: choose output format per font type
- **Pixel editor**: 32× zoom, click/drag to toggle pixels; variable width mode protects width byte (row 0) with optional **Hide W** checkbox
- **Transforms**: 22 operations — bold (3), italic (6), shift (4), flip/rotate (5), align (4); applied to single glyph or whole font
- **Copy/paste glyphs**: Ctrl+C / Ctrl+V with cross-format conversion (fixed ↔ FZX)
- **Convert**: fixed ↔ FZX with visual bounding box detection and left-aligned bitmap
- **Undo/redo**: up to 50 levels (Ctrl+Z / Ctrl+Y), covers all modifications including FZX property edits
- **Character mapping**: map strings to glyph ranges, Cyrillic↔Latin remap, export/import `.metrics` JSON
- **Grid options**: pixel gap grid, glyph labels (mapped character under each glyph)
- **Whole font editing**: pixel changes and transforms apply to all glyphs at once (respects per-glyph variable width)
- **Arrow key navigation**: navigate glyphs in the grid
- **Theme**: synced with SpectraLab via localStorage

## Snapshot Support (.sna / .z80)

Load ZX Spectrum memory snapshots and extract pictures and sprites:

- **SNA**: 48K and 128K formats
- **Z80**: V1, V2, V3 with RLE decompression
- **Screen extraction**: 48K main screen, 128K normal (bank 5) + shadow (bank 7); empty screens skipped
- **Border color** set from snapshot header
- **ZIP-aware**: snapshot files inside .zip archives are detected automatically

## Memory Viewer

Floating panel for browsing snapshot RAM as 1-bit graphics:

- Renders any memory bank as green-on-black bitmap (16 bytes per row)
- Bank selector for 128K snapshots (empty banks filtered out)
- Navigation: byte / line / row (8 lines) / sprite / page steps, vertical scrollbar, mouse wheel
- **Mouse-driven selection**: click to position a red rectangle, drag to resize; W/H inputs update live
- Address label in decimal and hex
- Adjustable sprite size (W 1–8 bytes, H 1–64 rows)
- Preview canvas (2× zoom) shows the selected sprite
- **Linear and Char** addressing modes (Char = 8×8 tile layout)
- Invert display, per-byte vertical and per-8-row horizontal grid overlays
- Zoom x1–x4, draggable floating panel
- **Grab to Sprites**: four grab modes (Single, Phases, Singles grid, Phases grid) with cell-size or col/row grid sizing, row-first or column-first ordering

## SCA Animation (.sca)

Play and edit ZX Spectrum animation files:

- **Type 0 full frames** (6912 bytes per frame) and **type 1 attribute-only** (768 bytes per frame with 8-byte bitmap fill pattern)
- **Pattern selector** for type 1: File (embedded), Checker, Stripes, DD/77; optional "Blend colors" mode
- **Playback**: play/pause (Space), previous/next frame (←/→), frame-by-frame scrub with wrap-around
- **SCA Editor** (Edit tab): trim start/end, per-frame and bulk delay adjustment, manual frame deletion (Ctrl+click or Del/Backspace), duplicate frame detection and optimization, loop-frame removal
- **Filmstrip preview** with thumbnails and x1/x2/x3 zoom
- **Export dropdown**: SCA, SCR zip, 53c zip, animated GIF (with per-frame delays), PNG series zip

## Display Filters

Collapsible section in the View tab with CRT/retro post-processing effects:

- **Scanlines** — Gaussian beam profile with brightness-dependent width (modeled after crt-geom/crt-lottes)
- **Noise** — static film grain with optional animation (~12 fps)
- **Composite** — chroma blur simulating composite video color bleed (YCbCr horizontal box blur)
- **Phosphor Glow** — blurred screen-blend overlay
- **Vignette** — radial edge darkening
- **CRT Curvature** — barrel distortion
- **Pixel Smoothing** — bilinear interpolation toggle
- **Presets**: None, CRT TV, Composite, VHS, Arcade
- Master **On** bypass checkbox; settings persist to localStorage and workspace files
- Works in both viewer and editor fullscreen modes

## Supported Formats

| Extension | Size | Description |
|-----------|------|-------------|
| `.scr` | 6912 bytes | Standard screen (bitmap + attributes) — **editable** |
| `.scr` | 6976 bytes | SCR + ULA+ 64-color palette — **editable** |
| `.scr` | 6945–7426 bytes | SCR + ULANext palette (ZX Next, up to 256 colors) — **editable** |
| `.scr` | 6144 bytes | Monochrome (bitmap only) — **editable** |
| `.scr` | 4096 bytes | Monochrome 2/3 screen — **editable** |
| `.scr` | 2048 bytes | Monochrome 1/3 screen — **editable** |
| `.53c` / `.127c` / `.atr` | 768 bytes | Attribute-only with pattern palette — **editable** |
| `.bsc` | 11136 bytes | Border screen (SCR + per-line border) — **editable** |
| `.bmc4` | 11904 bytes | Border + 8×4 multicolor — **editable** |
| `.ifl` | 9216 bytes | 8×2 multicolor — **editable** |
| `.mlt` / `.mc` | 12288 bytes | 8×1 multicolor — **editable** |
| `.3` | 18432 bytes | Tricolor RGB (3 bitmaps), flicker or blended — **editable** |
| `.img` | 13824 bytes | Gigascreen (2×SCR), average/flicker modes — **editable** |
| `.mg1` / `.mg2` / `.mg4` / `.mg8` | variable | Multiartist MGH gigascreen with 256-byte header — **editable** |
| `.hlr` | 1628 bytes | Gigascreen Lowres with self-contained loader + 8-byte fill pattern — **editable** |
| `.stl` | 3072 bytes | Stellar (64×48 multicolor gigascreen) — **editable** |
| `.bsp` | variable | Border screen with 70-byte header (screen/gigascreen ± border) — **editable** |
| `.zxp` | variable | ZX-Paintbrush text format, 8–2048 px per axis (÷8), optional ULA+ — **editable** |
| `.ch$` / `.chr$` / `.ch-` | variable | chr$ character array, 8×8 cells, optional gigascreen — **editable** |
| `.btile` / `.wtile` | variable | Nirvana 8×2 multicolour tile sets — **editable** |
| `.specscii` | variable | Text mode with colors (stream + control codes) — **editable** |
| `.sca` | variable | Animation (type 0 full frames, type 1 attribute-only) — **editable** |
| `.nxi` | 49664 / 82432 / 81952 bytes | ZX Next Layer 2 (256×192, 320×256, 640×256) + palette — **editable** |
| `.sl2` | 49152 / 49280 / 81920 bytes | ZX Next Layer 2 (256×192, 320×256, 640×256), default palette — **editable** |
| `.sna` | 49179 / 131103 bytes | 48K / 128K ZX Spectrum snapshot — screen extraction |
| `.z80` | variable | Z80 snapshot (V1, V2, V3 with RLE) — screen extraction |
| `.pal` | 64 bytes | ULA+ palette (GRB332) |
| `.slp` | variable | Project file (single picture with layers, masks, per-layer attributes, border data) |
| `.slw` | variable | Workspace file (all open pictures + global settings + sprite sheet + filters) |
| `.sls` | variable | Sprite sheet (sprites with frames, attributes, modes) |
| `.slb` | variable | Brush set (loaded as a new tile tab) |
| `.slbc` | variable | Barcode set (border color patterns) |
| `.768` / `.ch8` / `.fnt` | 768–2048 bytes | ZX Spectrum bitmap font (96/256 glyphs, normal or exploded) |
| `.fzx` | variable | FZX proportional font |
| `.metrics` | variable | Font character mapping metadata (JSON) |
| `.zip` | — | Archive (auto-extract, recursive file detection) |

## Keyboard Shortcuts

All letter shortcuts work with any keyboard layout (Russian, German, etc.) — based on physical key position.

### Viewer
| Key | Action |
|-----|--------|
| `1-5` | Set zoom level (x1 to x5, higher via menu) |
| `F` | Toggle flash animation |
| `G` | Toggle grid overlay |
| `~` | Toggle preview panel |
| `F11` | Toggle viewer fullscreen |
| `Space` | Play/Pause animation (SCA) |
| `Left/Right` | Previous/Next frame (SCA) |

### Screen Editor
| Key | Action |
|-----|--------|
| `P` | Pixel tool |
| `L` | Line tool |
| `R` | Rectangle tool (or Rotate when pasting/custom brush) |
| `O` | Circle/ellipse tool |
| `Ctrl` | Constrain rect/circle to square/circle (1:1) |
| `Alt` | Draw rect/circle from center; eyedropper (pick color from canvas) |
| `G` | Airbrush tool |
| `D` | Gradient tool |
| `I` | Flood fill tool |
| `C` | Fill cell tool |
| `A` | Recolor tool (attribute only) |
| `E` | Eraser tool (transparent on upper layers, paper on background) |
| `K` | Color picker tool |
| `T` | Text tool |
| `S` | Select tool (drag to select, auto-copies) |
| `H` | Mirror horizontal (when pasting/custom brush) |
| `V` | Mirror vertical (when pasting/custom brush) |
| `N` | Invert selection (swap ink ↔ paper) |
| `X` | Swap ink/paper colors |
| `B` | Toggle Bright |
| `F` | Toggle Flash attribute |
| `[` / `]` | Decrease/Increase brush size |
| `` ` `` | Toggle brush preview mode |
| `Ctrl+Wheel` | Zoom toward cursor |
| `Ctrl+C` | Copy selection |
| `Ctrl+X` | Cut selection |
| `Ctrl+V` | Paste (enter paste mode) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save |
| `F11` | Toggle fullscreen editor |
| `Tab` | Toggle floating palette (in fullscreen) |
| `Escape` | Cancel selection/paste, exit fullscreen |

### Sprite Editor
| Key | Action |
|-----|--------|
| `D` | Draw |
| `E` | Erase |
| `F` | Flood fill |
| `L` | Line |
| `R` | Rectangle |
| `S` | Selection |
| `M` | Toggle mask layer |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |

## Usage

Open `index.html` in any modern web browser. No server required — runs entirely client-side. Files can be loaded via the Browse button, dragged and dropped anywhere on the window, or selected from inside ZIP archives.

## Resources & References

Tools and documentation that inspired or informed SpectraLab development:

- [img2zxscr](https://gitverse.ru/nodeus/img2zxscr) — PNG to ZX Spectrum converter (Go)
- [PNG-to-SCR](https://github.com/MatejJan/PNG-to-SCR) — Online JavaScript converter
- [Image to ZX Spec](https://github.com/KodeMunkie/imagetozxspec) — Cross-platform converter with dithering
- [img2spec](https://github.com/jarikomppa/img2spec) — Image Spectrumizer tool
- [World of Spectrum](https://worldofspectrum.org/) — ZX Spectrum documentation and resources
- [FZX format](https://sinclair.wiki.zxnet.co.uk/wiki/FZX_format) — FZX proportional font format specification

## License

MIT
