# SpectraLab Version History

## v1.84
- Fix: image import brightness slider was silently set to a non-zero value by auto-brightness detection, causing incorrect bright/dark attribute assignment when re-importing ZX Spectrum screen exports as PNG. Brightness now defaults to 0 when the import dialog opens
- Fix: brightness and contrast value labels in the import dialog were not updating when moving the sliders (unlike saturation, gamma, sharpness, and smoothing which updated correctly)
- Fix: BSC/BMC4 image import — border color runs were snapped to a fixed 24px grid instead of starting at any 8px cell boundary. Now each 8px cell is color-matched independently, then short interior runs (< 24px) are merged into their longest neighbor
- Fix: BSC/BMC4 image import — border run merging could cause an infinite loop freezing the browser tab
- Fix: import preview size label now updates to show actual output dimensions when changing target format (e.g. "384x304" for BSC instead of always showing "256x192")


## v1.83
- Fix: Bright/Flash checkboxes in the Edit tab could disappear after editing NXI/SL2/LoRes formats and switching back to SCR

## v1.82
- Fix: paper grid no longer extends into the border area for BSC, BMC4, and BSP-with-border formats (grid now covers only the 256×192 paper region)
- Fix: painting on BSC border with a large brush no longer corrupts paper area pixels (brush strokes near border edges are now clamped to valid border coordinates)
- Load palette from text file: accept 15 colors (black auto-prepended as index 0) in addition to 16. Added `RRGGBB` (without `#`), `#AARRGGBB`, and `AARRGGBB` (alpha ignored) hex format support.

## v1.81
- Load external palette from text file: click the 📂 button next to the Palette dropdown to load a custom 16-color palette from a `.txt`, `.pal`, or `.csv` file. Supports `#RRGGBB` hex and `R G B` decimal formats (one color per line, comments with `;` or `//`). The custom palette appears as "Custom (loaded)" in the dropdown; reverts on page reload.

## v1.80
- Next palette color editing: **Ctrl+click** on any cell in the NXI/SL2/LoRes/LoRes Radastan palette grid to open the RGB333 color editor dialog (R: 0-7, G: 0-7, B: 0-7 sliders, original/new color preview, palette index display). Supports undo/redo.

## v1.79
- Save all pictures (Xform tab, visible when 2+ pictures are open):
  - **ZIP (originals)** — bundles every open picture in its native binary
    format into one `spectralab_pictures.zip`. Existing file extensions are
    preserved; duplicate names are disambiguated with " (2)", " (3)", …
  - **ZIP (PNG / GIF)** — bundles every picture rendered with current view
    settings (zoom, border, palette, filters) as PNG; flashing pictures
    become 2-frame animated GIFs at the FLASH_INTERVAL cadence
  - **Animated GIF** — combines all pictures into one animated GIF at
    500 ms / frame; flashing pictures contribute two frames (normal + swapped
    phase). Requires every picture to render to the same canvas size
  - **SCA** — combines all pictures into one SCA animation file at
    500 ms / frame; requires every picture to be in plain SCR format
    (256×192, 6912 bytes), border colour taken from current setting
- Image import: multi-select and "Add All" batch import
  - File open dialog and drag-and-drop now accept multiple images at once
  - First image opens in the standard import dialog; remaining images are queued
  - New "Add All (N)" button imports every queued image with the current dialog
    settings (dithering, format, levels, etc.), creating one Picture per file
  - If the number of selected images exceeds free picture slots, extras are
    skipped so the picture limit (15) is respected
  - Tile-to-screens mode is incompatible with Add All; a prompt asks the user
    to disable it first
- Fix: thin black line below the picture in the viewer
  - `#canvasWrapper` (inline-block) sat on the text baseline of its block
    parent `.editor-canvas-container`, leaving a ~3–4 px descender gap below
    it through which the container's `background: #000` showed as a black
    line. Added `font-size: 0; line-height: 0` to `.editor-canvas-container`
    to collapse the line-box descender.
- ZIP archive picker: multi-select and "Add All"
  - Click to select, Ctrl+click to toggle, Shift+click for range; double-click
    imports a single file immediately
  - Keyboard shortcuts: Escape cancels, Ctrl+A selects all, Enter imports
    selected
  - "Add All" button imports every file listed in the archive
  - Native formats (SCR, BSC, SCA, etc.) are loaded directly; image files route
    through the import dialog with the remaining files queued for "Add All"
  - Selection count shown on the Import button ("Import (N)")
  - MAX_PICTURES limit (15) is respected; a prompt warns if selection exceeds
    free slots

## v1.78
- Image import:
  - Error-diffusion Strength slider (0-100%) and Serpentine scanning checkbox
    - Strength scales how much quantization error is propagated (0 = pure quantize, 100 = classic diffusion)
    - Serpentine alternates row direction during error diffusion to reduce horizontal banding
    - Applies to all global error-diffusion methods (Floyd-Steinberg, Atkinson, Jarvis, Stucki, Burkes, Sierra variants, Serpentine, Riemersma)
    - For ordered/pattern/blue-noise methods: strength > 0 enables hybrid ordered+diffusion mode (GrafX2-style)
  - "Ordered 2x2" dither option (coarsest Bayer pattern, 4 levels per axis)
  - "Dizzy" dither option (Liam Appelbe, 2023)
    - Error diffusion with a dynamic denominator normalized over in-bounds unprocessed neighbors (orthogonal weight 1.0, diagonal 0.1)
    - Blue-noise-like patterns; no error lost at image edges; honors Strength / Serpentine
  - "a-dither" option (arithmetic dither, FFmpeg libswscale formula: `((x + y*236) * 119) & 0xff`)
    - Hash-based per-pixel threshold — spatially stable, blue-noise-like, no lookup table
    - Works as an ordered method (Strength = 0); Strength > 0 engages hybrid ordered+diffusion
  - Internal refactor unified 10+ dithering dispatch sites into a single `applyGlobalDither()` helper
- Internal: readability and maintainability refactor
  - BSC/BMC4 border renderers now share a single `createBorderRenderers(ctx)` factory
    - Eliminates ~100 lines of duplicated nested helpers (`drawColorSegment`, `drawBorderLine`, `drawSideBorderLine`)
  - New `ATTR` helper object centralizes ZX Spectrum attribute-byte bit layout
    - `ATTR.ink(b)`, `ATTR.paper(b)`, `ATTR.bright(b)`, `ATTR.flash(b)`, `ATTR.make(...)` with named mask/bit constants
    - Replaces scattered `& 0x07`, `>> 3`, `& 0x40`, `& 0x80` magic numbers
  - BMC4 attribute bank interleave extracted to `bmc4AttrsFromBanks()` / `bmc4AttrsToBanks()`
    - Deduplicates 3 identical inline loops (import, export, sync)
  - `export53c()` ink/paper normalization extracted to `normalizeAttrForPaint()` helper
  - ASM export download boilerplate unified into `runAsmExport(defaultName, generate)` helper
    - 7 export entry points across 7 files (BSC, ULA+, IFL, Gigascreen, RGB3, LoRes/Radastan, Next L2) collapsed to one-liners
  - Picture format dispatch replaced with `PICTURE_FORMAT_HANDLERS` registry table
    - Single source of truth maps format → import/export handlers; eliminates two parallel switch statements
  - `initEditor()` split: keyboard shortcuts (~183 lines) and attribute-preview flash loop (~27 lines) extracted to focused helpers
- Fix: SPECSCII preview with attrs display off now matches SCR (bright white paper, not muted)
  - Both paths (editor/multi-layer and stream-based) were using `ZX_PALETTE.REGULAR[7]` = rgb(215,215,215)
  - Now use `ZX_PALETTE.BRIGHT[7]` = rgb(255,255,255), matching SCR's hardcoded attrs-off color
- Fix: SPECSCII export no longer emits `INVERSE` control codes (0x14) unless the picture actually uses inverse
  - Previously a leading `14 00` was always written; now all inverse emissions are skipped if no cell uses inverse mode
  - If inverse is used anywhere, the stream emits codes as before
- Fix: Transform → Convert now correctly refreshes tool palette for every format combination
  - Tool/brush/snap visibility is re-applied after each conversion (was stale from previous format)
  - 53c and SPECSCII blocks now reset all tool buttons instead of only hiding their own excluded set
- Fix: snap control now visible (and adjustable) in Next modes (NXI/SL2/SLR/Radastan)
  - Previously hidden while snap still applied during pixel drawing — set Snap to Off for pixel-perfect editing
- Fix: Next/ULA+ palette swap and copy now preserve already drawn colors
  - Next (NXI/SL2/LoRes/Radastan): swap remaps all pixel indices idx1↔idx2; copy remaps
    pixels from the destination slot to any other slot holding the same color (so the
    destination can be safely overwritten without changing the picture visually)
  - ULA+: attribute cells are remapped within their existing CLUT to match the original
    ink/paper RGB values using the new palette (bright/flash untouched)
  - Picture appearance remains stable while reorganizing the palette
- Next palette (NXI/SL2/SLR/Radastan):
  - Sort controls for palette grid display (Index / Hue / RGB + Reverse)
    - Display-only reorder; does not mutate palette bytes
    - Preference persists via localStorage
  - Shift+click copy/swap workflow (same as ULA+)
    - Shift+click a cell to mark source; click another cell to copy, Shift+click to swap
    - Escape cancels the operation
    - Undoable; for NXI the embedded palette bytes are kept in sync

## v1.77
- GIF import:
  - "Import as Flash" for 2-frame animated GIFs
    - Converts two frames into a single SCR with FLASH attributes (bit 7)
    - Brute-force per-cell optimization: tries all ink/paper/bright combinations across both frames
    - Identical cells remain static (no flash); differing cells use FLASH to alternate ink↔paper
    - Flash timer auto-starts on load
  - "Import as Animation" for multi-frame animated GIFs
    - Converts all frames to SCA animation format
    - All GIFs now open through the import dialog with mode dropdown
- Image import:
  - Consolidated import buttons into single Import button with mode dropdown
    - Dropdown shows Picture/Flash/Animation options based on GIF frame count
  - Stable dialog size when switching Image/Adjustments tabs
    - Tab panels use CSS grid overlap so both tabs contribute to container height
  - Reset button on adjustment tab
    - Resets all 11 controls (contrast, brightness, saturation, gamma, sharpness, smoothing, levels, color balance) to defaults
- Fix: SCR → SPECSCII conversion preserves hidden-pixel bitmap patterns
  - Cells with ink == paper now match the bitmap to the best glyph instead of forcing space
  - Character data is preserved for later editing when colors are changed
- Fix: image import as 53c/127c with asymmetric patterns (DD/77, stripes)
  - Paper rule (darker/lighter) no longer swaps ink/paper without inverting the pattern
  - Fixes wrong colors when using non-checker patterns
- UI: 53c Pattern / Blend colors controls moved to the top of View Settings
  - Previously shown as a separate section below Display Filters
  - Now grouped with other view-related controls when a 53c/atr picture is loaded

## v1.76
- SPECSCII character palette: sort by visual weight mode
  - Toggle button (Sort) switches between Code order and Weight order (default)
  - Weight mode sorts ROM characters by pixel popcount (lightest→heaviest)
  - Block graphics displayed in 5×3 symmetric grid
  - Character palette is collapsible (state persists via localStorage)
  - Sort preference persists via localStorage
- SCR → SPECSCII conversion (Transform tab)
  - Matches each 8×8 cell bitmap to best ROM character or block graphic
  - Preserves brightness and flash attributes
  - Handles hidden pixels (ink == paper) as solid color cells
  - Tries both normal and inverted (ink/paper swap) matching
- PNG/GIF export: flash attribute support
  - Pictures with flash attributes export as two-frame animated GIF
  - Frame timing matches ZX Spectrum flash interval (320ms per phase)
  - Export dialog shows mode selector when flash is detected (animated GIF or static PNG)
  - Works for all formats that support flash (SCR, SPECSCII, BSC, etc.)
- Image import: Nirvana btile/wtile target formats
  - btile: 16×16 pixel tiles (2×2 cells), variable canvas size divisible by 16
  - wtile: 24×16 pixel tiles (3×2 cells), variable canvas width divisible by 24
  - 8×2 multicolor attribute cells (Nirvana engine format)
  - Supports all dithering modes, brightness/contrast/saturation adjustments
  - Width and height snap to tile-aligned values automatically
- Image import: improved size input controls
  - Tile-aligned snapping deferred to Enter/blur (no longer fights user while typing)
  - Preview updates debounced (300ms) to avoid slow re-renders on every keystroke
- Fix: SPECSCII rendering with attributes off now shows black ink on white paper (matching SCR behavior)

## v1.75
- ULANext SCR support (ZX Spectrum Next extended palette mode)
  - View and edit `.scr` files with ULANext palette (6912 SCR + ink mask + RGB333 palette)
  - Configurable ink mask ($01–$FF) splits attribute byte between ink/paper indices
  - Supports all 8 valid masks: 2/128, 4/64, 8/32, 16/16, 32/8, 64/4, 128/2, 256/1 ink/paper
  - Dual palette sizes: 9-bit RGB333 (2-byte, same as NXI) and 8-bit RRRGGGBB (1-byte)
  - Auto-detects palette bit depth from file size; displays 8-bit/9-bit in format info
  - Special $FF mask: 256 ink colors + 1 paper color (257 entries)
  - Flash disabled (attribute bits fully used for palette indexing)
  - Round-trip save preserves ink mask and palette
  - Format info displays mask value and ink/paper color counts
- ZX Spectrum Next LoRes Radastan mode support (128×96, 16-color, 4bpp)
  - New format: `.rad` — 6144-byte packed pixel dump (2 pixels/byte, high nibble = left)
  - `.slr` files of exactly 6144 bytes auto-detected as Radastan (vs 12288 for standard LoRes)
  - View, edit, create new, save, and image import with dithering/quantization to 16 colors
  - Uses first 16 entries of default Next RGB332→RGB333 ULA palette with 16-color palette picker
  - Layer support (per-pixel indexed-color layers, unpacked internally, repacked on flatten)
  - Conversions: RAD↔SLR (expand/quantize), RAD→NXI/SL2/SCR (upscale), any→RAD (downscale+quantize)
  - ASM export: generates sjasmplus source building a `.nex` via SAVENEX
    - Enables Radastan mode via NEXTREG $6A,$20 (bit 5)
    - 16-entry palette programmed via NEXTREG $43/$40/$44 before enabling display
    - Pixel-doubled layout (nibble N → byte (N<<4)|N), split memory ($4000-$57FF + $6000-$77FF)
- Embedded palette support for multiple formats
  - `.rad`/`.slr` Radastan: 6176 bytes (6144 + 32-byte RGB333 16-entry palette)
  - `.slr` LoRes 8bpp: 12800 bytes (12288 + 512-byte RGB333 256-entry palette)
  - `.sl2` Layer 2 256×192: 49664 bytes (49152 + 512-byte palette)
  - `.sl2` Layer 2 320×256: 82432 bytes (81920 + 512-byte palette)
  - `.sl2` Layer 2 640×256: 81952 bytes (81920 + 32-byte 16-entry palette, auto-detected as 4bpp)
  - `.mlt` multicolor with ULA+: 12352 bytes (12288 + 64-byte GRB332 ULA+ palette)
  - Palette from file used in viewer, editor preview, ASM export, and SL2 disambiguation dialog

## v1.74
- ZX Spectrum Next LoRes mode support (128×96, 256-color, 8bpp)
  - New format: `.slr` — raw 12288-byte pixel dump (128×96 row-major)
  - View, edit, create new, save, and image import with dithering/quantization
  - Uses default Next RGB332→RGB333 ULA palette with full 256-color palette picker
  - Layer support (per-pixel indexed-color layers, same as NXI/SL2)
  - ASM export: generates sjasmplus source building a `.nex` via SAVENEX
    - Programs ULA palette via NEXTREG $43/$40/$44
    - Enables LoRes via NEXTREG $15, disables Layer 2 via port $123B
    - Pixel data placed into bank 5 (pages 10-11) respecting hardware memory split ($4000-$57FF + $6000-$77FF)
    - Clip window set via register $1A in ULA-equivalent coordinates

## v1.73
- ASM export for ZX Spectrum Next Layer 2 (NXI/SL2) — generates sjasmplus source that builds a .nex file via SAVENEX
  - Supports all three Layer 2 modes: 256×192 8bpp, 320×256 8bpp, 640×256 4bpp
  - Pixel data placed directly into L2 bank pages at assembly time (no runtime copy)
  - Palette programmed via NEXTREG $43/$40/$44 (9-bit RGB333)
  - Clip window configured for extended modes via NEXTREG $1C/$18
  - Embed data as DB lines or reference original file via INCBIN
  - For NXI: uses embedded palette from file; for SL2: generates default RGB332→RGB333 identity palette
- UI: moved PNG/GIF export button to separate row so ASM export dropdown has full width
- Documentation: added Format ASM Export section to help and tutorial (EN/RU) covering all format-level ASM exports

## v1.72
- Gigascreen and RGB3 display mode dropdown with three options:
  - **Blend dark** (default) — simulates perceived brightness on real CRT hardware, accounting for vertical retrace blanking (CRT dark factor 0.8)
  - **Blend** — full-brightness color mixing (Gigascreen: average of two frames; RGB3: direct RGB channel mapping at full palette intensity)
  - **Emulate flicker** — alternating frame display to simulate real hardware
- RGB3 preview in the editor now uses the same rendering as the main canvas, respecting the selected display mode
- Renamed Gigascreen "Average" mode to "Blend" for consistency with RGB3

## v1.71
- ZX Spectrum Next Layer 2 extended mode support:
  - NXI 320×256 (82432 bytes, 8bpp column-major with 256-color palette)
  - NXI 640×256 (81952 bytes, 4bpp column-major with 16-color palette)
  - SL2 extended (81920 bytes) with disambiguation dialog showing side-by-side previews
  - File size based auto-detection for NXI; interactive mode selection for ambiguous SL2
  - Full editing support for all three Layer 2 modes (256×192, 320×256, 640×256)
  - 640×256 mode displays with 2× vertical stretch (half-width pixels on real hardware)
  - Per-picture Layer 2 mode preserved when switching between open pictures
- Image Import: NXI 320×256, NXI 640×256, SL2 320×256, SL2 640×256 added as target formats
- Format conversions for Next Layer 2 extended modes:
  - Lossless: NXI 320×256 ↔ SL2 320×256, NXI 640×256 ↔ SL2 640×256 (strip/add palette)
  - Lossy cross-mode: NXI/SL2 256×192 ↔ 320×256 ↔ 640×256 (render + re-quantize)
  - Lossy from other formats: SCR → NXI 320/640, ULA+ → NXI 256/320/640
  - Lossy to SCR: NXI/SL2 any mode → SCR (downscale + ZX attribute quantization)

## v1.70
- Import animated GIF to SCA animation with frame delay preservation
  - Multi-frame GIFs are automatically detected and decoded with full GIF87a/GIF89a support
  - Each frame is converted to ZX Spectrum SCR format (Floyd-Steinberg dithering) and assembled into an SCA animation
  - Per-frame delays from the GIF are converted to SCA 20ms delay units
  - Supports disposal methods, transparency, interlaced frames, local color tables, and non-standard sizes
  - Single-frame GIFs continue to use the existing Image Import dialog
  - After import, full SCA editor access: filmstrip, playback, trim, delay editing, optimize, export
- Export to PNG/GIF: new "PNG/GIF" button next to Save opens a dialog to export the current screen
  - All ZX formats supported (SCR, BSC, BMC4, IFL, MLT, Gigascreen, MGH, HLR, STL, BSP, NXI, SL2, etc.)
  - Zoom options: 1x, 2x, 3x, 4x
  - Optional border with selectable ZX color (hidden for BSC/BMC4/BSP-border/NXI/SL2)
  - Gigascreen-family formats: choose Blended (PNG) or Flicker (animated GIF at ~50fps)
  - Output dimensions shown in dialog, updated dynamically

## v1.68
- Lossless cross-format conversions (Xform → Convert dropdown):
  - SCR → IFL (8×2 multicolor): replicate 8×8 attrs to 8×2
  - SCR → MLT (8×1 multicolor): replicate 8×8 attrs to 8×1
  - SCR → BMC4 (8×4 + border): attrs to both banks, border color dialog
  - SCR → Gigascreen (duplicate): duplicate SCR to both frames
  - SCR → NXI (Next Layer 2): convert 1-bit+attrs to 8-bit indexed with 16-color ZX palette
  - IFL → MLT (8×1 multicolor): replicate 8×2 attrs to 8×1
  - BSC → BMC4 (8×4 multicolor): attrs to both banks, preserve border
  - Gigascreen → BSP (add header): wrap with BSP metadata
  - NXI → SL2 (strip palette): remove 512-byte palette header
  - SL2 → NXI (add palette): embed current or default palette
- Refactored border color picker into shared `showBorderColorDialog()` helper

## v1.67
- NXI and SL2 (ZX Spectrum Next Layer 2) format support with pixel editing
  - NXI: 49664 bytes (512-byte RGB333 palette + 256×192 indexed pixels)
  - SL2: 49152 or 49280 bytes (raw pixels with default RGB332 palette)
  - 256-color palette grid (16×16), left click = ink, right click = paper
  - Drawing tools: Pixel, Line, Rectangle, Circle, Airbrush, Gradient, Flood Fill, Eraser, Color Picker
  - Undo/redo with palette state preservation; save back to .nxi/.sl2

## v1.66
- New Picture and Image Import format dropdowns grouped with `<optgroup>` dividers for better navigation
  - Standard (256×192), With border (384×304), Gigascreen, Tricolor/Monochrome, Text & attributes, Variable size
- Image Import improvements:
  - SPECSCII charset selector — choose which glyphs are used during conversion: Full (ROM + blocks, 112 glyphs), ASCII (ROM only, 96), UDG (blocks only, 16 + space)
  - Default preview zoom changed from x2 to x1
  - Fixed bottom controls (Zoom, Grid, Cancel/Import) being clipped on smaller screens

## v1.65
- BSP (Border Screen with Header) format support: load, view, edit, create, save, and image import
  - 4 variants: screen-only, screen+border, gigascreen, gigascreen+border
  - New Picture, Image Import, format conversions (BSC↔BSP, BSP→SCR), ZIP loading

## v1.64
- STL (Stellar) format support: view, edit, create, save — 64×48 fat-pixel gigascreen with fixed bitmap pattern; New Picture, ZIP loading
- Image Import: SPECSCII output format — converts images to 32×24 character grid using ROM font glyphs and block graphics
- ULA+ palette copy/swap: Shift+click to copy or swap palette cells; works in Grid and Classic views; undoable

## v1.63
- ULA+ palette import: added support for 176-byte `.tap` palette loaders (BASIC + MC programs, e.g. from sourcesolutions.itch.io/ulaplus10); 64-byte GRB332 palette is extracted from offset 110, validated by 0D 0A trailer
  - Works in both the editor palette Load button and the Image Import palette source file picker

## v1.62
- Memory Viewer button moved from the Sprites sidebar tab to the View tab (below File Info), so it's visible right after loading a snapshot without having to switch tabs
- New Picture dialog: added `chr$` (mono) and `chr$ gigascreen` formats with configurable width/height (8–2040 px per axis, 8×8 attribute cells); palette selector is hidden for chr$ since ULA+ is not supported

## v1.61
- HLR (Gigascreen Lowres) format support: read, view, edit, save, and create new .hlr files
  - 1628-byte self-contained ZX Spectrum loader with two attribute banks (768 bytes each) and an 8-byte bitmap fill pattern
  - Loader disassembly documented in ZX_SPECTRUM_GRAPHICS_GUIDE.md
  - Renders via the existing two-frame gigascreen renderer; default pattern FF FF FF FF 00 00 00 00 produces a 32×48 grid of 8×4 top/bottom half-cells
  - File detection by extension and by exact 1628-byte size; new HLR option in the New Picture dialog
  - Pattern-aware load/edit/save: the 8-byte pattern is read from file offset 0x54, stored on the picture, and written back on save
  - Custom fill patterns (non-default) are preserved across load/edit/save, enabling arbitrary 8×8 ink/paper masks per cell
  - Editor drawing tools read the pattern bit at (x%8, y%8) to decide whether a click targets the cell's ink or paper component
  - Fill and recolor tools set both ink and paper of the cell to a single color (solid mode)
  - Save writes the 84-byte Z80 loader, the picture's 8-byte pattern, and both attribute banks
- HLR fill pattern UI: full pattern picker for new and existing HLR pictures
  - New Picture dialog: when HLR is selected, a "Fill pattern" row offers presets (top/bottom halves, left/right halves, checkerboard 1×1 / 2×2, horizontal/vertical stripes 1px / 2px, diagonals) plus a custom 8-byte hex input and a live 8×8 preview
  - Last-used preset and custom hex are remembered via localStorage
  - Editor: "Edit HLR fill pattern..." button inside the Gigascreen color section opens a dialog with the same presets / hex input / preview, pre-filled from the current picture
  - Applying a new pattern rewrites the bitmap in all frames and plane buffers while leaving both attribute banks untouched, so only the ink/paper mask changes
  - Pattern changes go through the undo/redo stack (undo state now carries the 8-byte HLR pattern)

## v1.60
- Image import: added Gigascreen (.img) and MGH (.mg8/.mg4/.mg2/.mg1) output formats
  - PNG/JPG/GIF/WebP/BMP can now be converted directly to two-frame gigascreen with up to 4 perceived colors per cell
  - Per-cell brute-force search over ~2628 unique attribute-pair quads finds the best (attr1, attr2) blend for each cell
  - Supports both global dithering (Floyd-Steinberg, Atkinson, ordered, etc. against the 136-color blended palette) and cell-aware dithering (Floyd/Atkinson/Ordered/None inside each cell using its 4 chosen blend colors)
  - Tile import works for all gigascreen variants
  - Imported pictures open directly in the gigascreen editor as 2-plane pictures with the correct attrCellHeight (8/4/2/1)
- Editing support for all Multiartist MGH modes: mg1, mg2, mg4, mg8 now fully editable
  - mg2 uses 8×2 attribute cells (3072 attrs per frame)
  - mg1 uses 8×1 attribute cells: inner columns 8-23 have per-pixel-row attrs, outer columns 0-7/24-31 use 8×8 cells
  - mg1 export correctly splits attrs into inner (3072 bytes) + outer (384 bytes) sections per frame
  - Editor enforces 8×8 attr constraint on mg1 outer columns (draw/fill/recolor replicate attrs across 8-row blocks)
  - All MGH modes use interleaved bitmap layout, all editor tools work correctly
  - Save produces valid .mg1/.mg2/.mg4/.mg8 files with 256-byte MGH header
- New Picture dialog: added mg8, mg4, mg2, mg1 format options for creating blank Multiartist gigascreen pictures
- mg1 viewer: dashed orange boundary lines in border area mark inner section (columns 8-23) vs outer (0-7, 24-31)
- Editing support for Multiartist mg4 format: .mg4 files now open in the editor with full gigascreen 4-color editing
  - mg4 uses 8×4 attribute cells (1536 attrs per frame) with standard gigascreen interleaved bitmap layout
  - All editor tools (draw, fill, recolor, color picker, layers, undo/redo) work with 8×4 cell height
  - Save produces valid .mg4 file with 256-byte MGH header
- Format info now shows specific MGH mode (mg1/mg2/mg4/mg8) instead of generic "MGH"
- Editing support for Multiartist mg8 format: .mg8 files now open in the editor with full gigascreen 4-color editing
  - mg8 screenData uses standard gigascreen interleaved layout, reusing all existing editor code
  - Save produces valid .mg8 file with 256-byte MGH header
  - ASM export (Pentagon dual-screen) available for mg8
- Multiartist MGH format support: read-only loading of .mg1/.mg2/.mg4/.mg8 multicolor gigascreen files
  - 256-byte header with "MGH" signature, mode byte selects attr cell height (1/2/4/8 lines)
  - Two-frame gigascreen with multicolor attributes, rendered via flicker or average blending
  - Gigascreen renderer now respects per-picture attrCellHeight instead of hardcoded 8×8
- Fix: ZXP and chr$ files (.ch$, .chr$, .ch-) now load correctly from ZIP archives

## v1.59.3
- 53c/127c palette: added sort mode controls (Hue, RGB, Color) and Reverse toggle
  - Hue: groups by hue bucket then luminance (previous default behavior)
  - RGB: sorts by blended R/G/B value
  - Color: sorts by attribute byte (ink, paper, bright)
  - Reverse checkbox flips the sort order
  - Selected color is preserved when changing sort mode or pattern
  - Sort preference persists via localStorage
- Grid color presets: added "Grid color" dropdown in View Settings (Default, White, Gray, Black, Orange, Red, Green)
  - Applies to paper grid, subgrid, and border grid on the main canvas
  - Useful for visibility on dark or light artwork
  - Setting persists via localStorage
- Fix: 53c editor preview thumbnail not updating while drawing (updated only on next stroke)
- 53c/127c/SCA type 1: added "Blend colors" checkbox next to pattern selector
  - When checked, each cell renders as a solid averaged color instead of a dither pattern
  - Palette swatches also display solid blended colors in blend mode
  - Works across all 53c rendering paths: standalone viewer, Picture-based renderer, and SCA type 1 animation frames
  - Setting persists via localStorage

## v1.59.2
- SCA editor: replaced Save/Export buttons with dropdown (SCA, SCR zip, 53c zip, GIF, PNG zip) + Save button
  - Added animated GIF export with per-frame delay from SCA timing
  - Added PNG series export (numbered PNGs in a ZIP archive)
  - Replaced JSZip dependency with built-in ZIP creator for SCR/53c/PNG exports
- Fix: editor mouse coordinate offset at zoom ×4+ when canvas exceeds viewport (affected .atr and other formats)
  - `canvasToScreenCoords` no longer double-counts scroll offset when canvas is full logical size
- Fix: .53c export now normalizes attributes so ink ≥ paper (ChunkyPaint compatibility)
  - Swaps ink/paper when paper > ink; checkerboard pattern is symmetric so visual result is identical

## v1.59.1
- Nirvana .btile/.wtile: open as single variable-size image instead of splitting into multiple 256×192 IFL screens
  - No tile-per-row cap — supports any count (was limited to 16/10)
  - Uses ZXP Picture internally with `attrCellHeight=2` (8×2 multicolor), full editor support
  - Save exports back to .btile/.wtile format (column-major attrs for btile, row-major for wtile)
  - Format info displays "Nirvana btile/wtile (8x2 multicolor)"
- Documentation: added chr$ (Character Array) format to ZX_SPECTRUM_GRAPHICS_GUIDE.md

## v1.59
- chr$ format support: open, view, edit, and save `.ch$`/`.chr$`/`.ch-` files (variable-size, interleaved 8×8 cell format)
  - 7-byte header: "chr$" magic + width/height in cells + bytes-per-cell (9 or 18)
  - Gigascreen chr$ support (bpc=18): two frames per cell, blended rendering
  - Full editor support: drawing, attributes, layers, copy/paste, clear, save
- Image import: added ZXP format with custom width/height (8–2048, ×8), ULA/ULA+ palette type selector
  - Import dialog preview constrained with max-height and scroll for large ZXP dimensions
- New Picture dialog: added ZXP (.zxp) format option with configurable width (8–2048, ×8), height (8–2048, ×8), and palette type (ULA / ULA+)
  - ZXP settings (width, height, palette) persist across dialog opens via localStorage
- Fix: canvas container sizing for non-standard image dimensions
  - Added `width/height: fit-content` to `.editor-canvas-container` — eliminates black gaps around images
  - Reordered `renderScreen()` to set wrapper dimensions before reading container client size

## v1.58.5
- Variable-size ZXP support: ZX-Paintbrush files with non-standard dimensions (8–2048 pixels, divisible by 8)
  - `parseZxpFile()` auto-detects width/height from bitmap line length and count
  - Standard 256×192 ZXP still maps to SCR/IFL/MLT as before
  - Non-standard sizes use new `FORMAT.ZXP` with linear screenData layout (bitmap + attrs)
- New `importZxp()` / `exportZxp()` in picture_format.js for ZXP Picture import/export
- Sync bridge: `syncPictureFromScreenData` / `syncScreenDataFromPicture` handle 'zxp' format (direct linear copy)
- Dynamic dimensions in viewer: `renderScreen()`, `drawCharGrid()`, `drawStandardBorderGrid()` use `currentPicture` dimensions
- Dynamic dimensions in editor: `getFormatWidth()` / `getFormatHeight()` read from `currentPicture`
  - Propagates to bounds checking, preview rendering, fullscreen zoom, clipboard operations
- ZXP save/export outputs text format via `exportZxp()`
- Fix: ZXP drawing placed pixels at wrong positions (drew in two places simultaneously)
  - `getBitmapAddress()` / `getAttributeAddress()` now return linear offsets for FORMAT.ZXP
  - All pixel operations (setPixel, getPixel, setPixelDirect, etc.) use correct addressing
  - Layer attribute updates, fillCell, recolorCell, clearScreen handle ZXP dimensions
  - Copy/paste uses `getAttributeAddress()` and dynamic bounds instead of hardcoded SCREEN constants
- Fix: ZXP editor preview showed black background
  - Added ZXP-specific rendering path in `renderPreview()` with linear bitmap/attr reads
- Fix: pixel info display rejected small ZXP files due to SCREEN.TOTAL_SIZE guard
- Fractional zoom levels (x1/8, x1/4, x1/2) for large images
  - Zoom dropdown, scroll-wheel zoom, and fullscreen zoom all support fractional values
- Performance: viewport-clipped rendering for large images (>512×512)
  - `renderPictureStandard()` only renders the visible viewport region, not the full image
  - ZXP renders directly from screenData, skipping redundant sync to Picture planes
  - Layer bitmap/attribute sizes computed dynamically for ZXP format
- Deferred stroke for big pictures (>512px): smooth curve drawing
  - Mouse path collected during drawing with live smooth Catmull-Rom preview overlay
  - On mouse release, spline interpolation generates a smooth curve through all points
  - Eliminates visible straight-line segments at fractional zoom levels
  - Affects pixel, eraser, and airbrush tools; standard 256×192 pictures use immediate drawing
- Fix: airbrush on normal pictures draws with gaps during fast mouse movement
  - Spray points distributed along movement path between consecutive mouse positions
- Viewport-sized canvas: canvas is capped to the visible viewport area instead of full image × zoom
  - Eliminates huge canvas allocations (e.g., 2048px image at x20 zoom no longer creates a 40960px canvas)
  - Wrapper div provides full logical size for scrollbars; sticky viewport div keeps canvas in view
  - Scroll events trigger re-render via requestAnimationFrame throttling
  - BSC/BMC4 formats bypass viewport capping (always manageable size)

## v1.58.4
- Unified Picture-based renderers: `renderPictureStandard()`, `renderPictureGigascreen()`, `renderPictureRgb3()`
  - Read from `currentPicture` linear layout instead of format-specific `screenData` offsets
  - `renderPictureStandard()` covers SCR, SCR+/ULA+, IFL, MLT, 53c, and Mono formats via parametric `attrCellHeight`
  - `renderPictureGigascreen()` covers Gigascreen with average-blend and flicker modes from 2-plane Picture
  - `renderPictureRgb3()` covers RGB3 with palette LUT average and per-bitplane flicker from 3-plane Picture
- `renderScreen()` dispatcher prefers Picture-based renderers when `currentPicture` exists
  - BSC, BMC4, SPECSCII, and SCA fall through to legacy renderers
  - Legacy format-based renderers retained as fallback for when `currentPicture` is null
- Fix: ULA+ palette lost when loading a second file then closing it
  - `initUlaPlusMode()` was clobbering ULA+ globals before `addPicture()` saved old tab state
  - Now saves current picture state before `initUlaPlusMode` runs; `addPicture` skips redundant save
- Fix: changing 53c pattern dropdown did not refresh the picture
  - Pattern change handler now updates `currentPicture.pattern` before rendering

## v1.58.3
- Internal Picture format: all formats now populate `currentPicture` on load
  - Import converters: IFL, MLT, Mono (full/2-3/1-3), BSC, BMC4, Gigascreen, RGB3, 53c, SPECSCII
  - Export converters: matching export for all formats
  - Unified `importPicture()` / `exportPicture()` dispatchers
- Extended Picture typedef with `contentMode`, `colorMode`, `border`, `pattern`, text mode fields
- Generalized sync bridge (`syncPictureFromScreenData` / `syncScreenDataFromPicture`) handles all formats
- Loading pipeline uses `importPicture()` for all formats instead of only SCR/ULA+
- Save/export uses `exportPicture()` when `currentPicture` exists
- Undo/redo re-imports `currentPicture` using unified importer on format changes

## v1.58.2
- Color Picker tool: dedicated toolbar button (⊙) and keyboard shortcut (K)
  - Works across all editable formats: SCR, BSC, IFL, MLT, BMC4, ULA+, Gigascreen, 53c, RGB3, SPECSCII
  - Left-click picks ink/primary color; right-click picks paper/secondary color
  - BSC/BMC4: also picks colors from border area
  - RGB3: picks the actual 3-bit pixel color from R/G/B bitmaps
  - 53c: finds and selects the matching virtual palette entry
  - SPECSCII: picks ink/paper/bright/flash from character cell attributes
- RGB3: dedicated 8-color palette with L/R (left/right button) selection instead of ink/paper
  - Palette shows realistic perceived colors (1/3 brightness per channel due to flicker through black)
  - Tooltips show bitplane composition (e.g. "Cyan (R=0 G=1 B=1)")
- RGB3: canvas rendering now uses palette-aware blended colors instead of pure RGB
  - Non-flicker mode shows averaged color from 3 bitplane frames using current palette
  - Flicker mode uses current palette colors per frame (was hardcoded to default RGB)
  - Both palette and canvas update when switching palettes (Ocean, EmuzWin, etc.)
- Alt+Click color picker now works on all editable formats (was limited to SCR, ULA+, Gigascreen)
- 53c editor: restored drawing tools (line, rectangle, circle, flood fill, eraser, recolor)
  - Tools were incorrectly hidden — airbrush, gradient, text, fill_cell remain unavailable for attribute-only format
  - Shape tools (line, rect, circle) now apply attribute recoloring per cell instead of acting as freehand
  - Flood fill is layer-aware: reads from active layer so filling on empty layers works correctly
  - Keyboard shortcuts (P, L, R, O, A, I, E, K) now work in 53c mode
- 53c editor: layers fully supported — add/remove layers, per-cell mask compositing, flatten
  - Layer bitmap stores attribute bytes; mask tracks which cells are painted per layer
  - Upper layers override lower layers on cells where mask is set
  - Drawing tools write to active layer when layers are enabled
- Fix: 53c palette cell selection no longer causes layout shift (outline instead of border-width change)

## v1.58.1
- Fix: switching tabs showed blank canvas — `addPicture()` saved the NEW picture's `currentPicture` to the OLD tab
  - Root cause: callers set `currentPicture` globally before `addPicture()`, but `saveCurrentPictureState()` inside `addPicture()` captured it for the wrong tab
  - `addPicture()` now accepts an `internalPicture` parameter; `currentPicture` is set AFTER the old tab state is saved
  - All callers updated: `loadScreenFile`, `loadZxpFile`, `createNewPicture`, image import, snapshot loader, project load
- Fix: multiple new SCR screens shared the same internal picture by reference — editing one modified all
  - `saveCurrentPictureState`, `loadPictureState`, and `addPicture` now deep-clone `currentPicture` via `clonePicture()`
- Fix: creating a new blank SCR/ULA+ screen inherited stale `currentPicture` from previously loaded screen
  - `createNewPicture()` now creates a fresh `currentPicture` for SCR and SCR_ULAPLUS formats, and sets null for all others
- Fix: pixel and airbrush tools only showed changes when mouse button was released
  - `renderScrFromPicture` now syncs from `screenData` before rendering, so mid-stroke changes appear immediately
- Fix: flatten layers — undo did not work
  - `layersEnabled` was not saved in undo state; after flatten set it to false, undo restored layers but `layersEnabled` stayed false
- Fix: clear ULA+ screen — undo incorrect (palette not restored)
  - `ulaPlusPalette` was not saved in undo state; clear resets palette to default, but undo only restored `screenData`
- Fix: format conversion (e.g. .atr → .scr) — undo did not work
  - `currentFormat` and `currentFileName` were not saved in undo state; undo stack was cleared on conversion
  - All 7 conversion functions now call `saveUndoState()` before converting and no longer clear undo/redo stacks
  - Undo/redo restore format, filename, ULA+ mode, `currentPicture`, and update all format-dependent UI
- Fix: converting .atr → .scr did not switch color picker from pattern palette to standard palette
  - `toggle53cColorPicker(false)` was asymmetric — hid .53c palette but didn't restore standard color section
  - All conversion functions now call `updateEditorColorPickers()` to switch color pickers correctly
- Fix: after opening .sca via file picker, then loading a picture format file — editor tools not shown
  - SCA file picker path did not call `updateEditorState()`, leaving `editorActive = true`; subsequent picture load skipped `setEditorEnabled(true)`
- SCA type 1: pattern selector now shown — can switch between File (embedded), Checker, Stripes, and Pattern views
  - Reuses the 53c pattern dropdown; "File" option appears only for SCA type 1 and shows the embedded fill pattern
  - Pattern change updates both the main viewer and SCA editor preview

## v1.58.0
- Internal picture format (Step 1 — SCR proof of concept)
  - New `js/picture_format.js` module: linear row-major bitmap + attribute storage for ZX Spectrum screens
  - SCR deinterleave/interleave: converts between ZX Spectrum's interleaved memory layout and linear row-major order
  - Import/export for standard SCR (6912 bytes) and SCR+ULA+ (6976 bytes with 64-byte GRB332 palette)
  - New `renderScrFromPicture` renderer reads from linear bitmap — pixel-identical output to the original `renderScrFast`
  - Dual-representation with sync: editor still writes to `screenData`, `syncCurrentPicture()` copies changes to internal format after each action (draw, undo, redo, fill, paste, clear, flatten, format conversion)
  - `currentPicture` stored per tab in the multi-picture system — switching tabs preserves the internal format
  - Save/export path uses `exportScr`/`exportScrUlaPlus` when internal format is available
  - All entry points covered: file open, drag-drop, ZXP import, image import, snapshot extraction, project/workspace load
  - Non-SCR formats (IFL, MLT, BSC, BMC4, RGB3, Gigascreen, Mono, SPECSCII, SCA) unaffected — `currentPicture` is null, old renderers used

## v1.57.1
- ZXP (ZX-Paintbrush) file format support (partial — 256×192 only)
  - Load `.zxp` text-based image files via file picker or drag-and-drop
  - Auto-detects attribute mode from line count: 8×8 (SCR), 8×4 (IFL), 8×2 (IFL), 8×1 (MLT)
  - Converts linear bitmap rows to ZX Spectrum interleaved SCR layout
  - Supports optional ULA+ palette (64-byte) → loads as SCR_ULAPLUS
  - 8×4 attributes are expanded (row-doubled) to 8×2 IFL format

## v1.57.0
- 53c/127c editor: pattern color palette
  - Replaces standard ink/paper picker when editing .53c/.atr files
  - Grid of unique dither-pattern swatches showing actual ink/paper colors through the selected pattern
  - Click a swatch to select that color combination for painting
  - Adapts to current pattern: Checker (~53 colors), DD77 (~127 colors), Stripes (~53 colors)
  - Rebuilds automatically when switching patterns or palettes
- New Picture dialog remembers last used format

## v1.56.1
- Light/Dark theme switching
  - Toggle button (&#9790;/&#9788;) next to the Help button
  - Respects OS `prefers-color-scheme` on first visit
  - Setting persists to localStorage
  - FOUC prevention via inline `<head>` script
  - Canvas viewer colors adapt per theme (grid, labels, backgrounds)
  - Editor canvas previews (brush slots, tile cells, barcode, SPECSCII palette) adapt to current theme

## v1.56.0
- Display Filters: new collapsible section in the View tab with CRT/retro post-processing effects
  - **Scanlines** — Gaussian beam profile with brightness-dependent width (modeled after crt-geom/crt-lottes emulator shaders)
  - **Noise** — static film grain with optional animation (~12 fps)
  - **Composite** — chroma blur simulating composite video color bleed (YCbCr horizontal box blur)
  - **Phosphor Glow** — blurred screen-blend overlay simulating phosphor persistence
  - **Vignette** — radial gradient darkening at screen edges
  - **CRT Curvature** — barrel distortion simulating curved CRT glass
  - **Pixel Smoothing** — toggle bilinear interpolation for softer pixel scaling
  - **Presets** — None, CRT TV, Composite, VHS, Arcade
  - Master **On** checkbox to bypass all filters without losing settings
  - Settings persist to localStorage and workspace (.slw) files
- Fullscreen mode
  - Now works in both viewer and editor modes (previously editor-only)
  - **F11** — toggle fullscreen from any tab
  - **Escape** — exit fullscreen
  - Viewer fullscreen shows only the canvas with active display filters
  - Editor fullscreen shows floating tool palette and preview panel
- Zoom: Ctrl+Mouse Wheel now zooms toward cursor position

## v1.55.0
- Drag-and-drop: drop any supported file anywhere on the window to open it (same as Browse — handles .scr, .png, .zip, .slp, .slw, snapshots, etc.)
- Nirvana tiles
  - Tiles-per-row dialog now defaults to the actual tile count instead of always 16
  - Large tile files that exceed one screen are split across multiple IFL pictures automatically
- Sprite editor
  - **Clear all** button to delete all spritesets at once (with confirmation)
  - W/H and Mode controls are always visible, so grab parameters are accessible even when no spriteset is selected
- Documentation
  - Clarified sprite/spriteset terminology (spriteset = named entry with frames, sprite = individual frame)
  - Separated Nirvana tile format from generic custom sprite data layouts in ZX_SPECTRUM_GRAPHICS_GUIDE.md

## v1.54.0
- Sprite editor
  - Multicolour sub-modes — **Multicolour 8×1**, **8×2**, and **8×4** attribute cell heights, selectable from the Mode dropdown
  - Switching between multicolour sub-modes resamples attributes to the new resolution
  - **Attr scroll** checkbox — when enabled, shift arrows (← → ↑ ↓) scroll attributes together with pixels; attributes roll when accumulated shift reaches a cell boundary
  - Attr scroll checkbox hidden in Mono mode
  - Nirvana export warns and skips sprites that are not 8×2 multicolour
  - Save/load preserves `attrCellH` property; old projects default to 8×2
  - Grab from screen respects selected multicolour sub-mode; auto-detect no longer overwrites an already-selected sub-mode
  - **Attributes** checkbox — toggle color display on/off; when unchecked shows black/white bitmap (black = ink, white = paper)
  - Renamed "Attr" checkbox to "Scroll attr" for clarity
- Zoom
  - Ctrl+Mouse Wheel now works anywhere in the right panel area (not just directly over the canvas), preventing accidental browser zoom
  - Ctrl+Mouse Wheel uses accumulator threshold to prevent trackpads from jumping multiple zoom levels at once
- Transform tab (Xform): workspace Save/Load buttons are now always accessible, even without a loaded picture

## v1.53.1
- Image import
  - Fixed ULA+ conversion producing wrong colors when Paper rule is Darker/Lighter (paper rule now skipped for ULA+ which uses independent CLUT halves)
  - Removed Auto option from Paper rule (Darker color is now the default)
- Nirvana tiles
  - Fixed `.btile` import producing wrong colors (attributes are column-major in btile format)
  - Fixed `.wtile` import/export (attributes are row-major, unlike btile which is column-major)
  - Loading `.btile`/`.wtile` now appends to existing sprites instead of replacing them
  - Auto-selects Nirvana export format when loading tile files
- Sprite editor
  - Edit button moved to sprite list toolbar (between Add and Delete) for quicker access
  - Frame bar now shows exactly 16 frames per row
  - Each new grab creates a new sprite instead of appending frames to the existing one
  - Grab reuses the selected sprite if it is empty and matches grab dimensions/mode
  - Grab rectangle snaps to sprite W/H cell dimensions (e.g. 3×2 cells → widths 24, 48, 72… and heights 16, 32, 48…)
  - W/H and Mode locked after drawing content (clear all frames to unlock)
  - Removed duplicate W/H and Mode controls from grab section (grab now uses sprite properties)
  - Cleaned up floating editor layout (Play/Speed aligned right, removed separator lines from tool palette)
  - Binary export warns and aborts when sprites have different sizes or color modes; when multiple sprites share the same size/mode, offers to join into one file or split into separate files
- Workspace: save/load (.slw) now preserves sprite sheet data

## v1.53.0
- Image import
  - **Tile to screens** — split a large source image into a grid of ZX Spectrum pictures covering the entire source
    - Checkbox in Output section enables tiling mode
    - Automatically calculates grid (cols × rows) based on crop area and output format dimensions
    - Edge tiles padded with black to fill full output dimensions
    - Tile naming: `filename_col_row.ext` (e.g. `image_0_0.scr`, `image_1_0.scr`, `image_2_3.scr`)
    - Yellow dashed grid overlay on original canvas shows tile boundaries and labels
    - Per-tile preview with ◄/► navigation — preview shows the actual converted output for each tile
    - Position/Size/Fit/Align controls disabled during tiling (overridden by tile logic)
    - Confirms with user if more tiles than available picture slots
  - Fixed ULA+ conversion producing wrong colors when Paper rule is set to Darker/Lighter
  - Removed Auto option from Paper rule (Darker color is now the default)
- Multi-picture: maximum pictures increased from 8 to 15
- Picture tab bar: fixed overflow when many tabs are open (tabs now shrink and scroll horizontally)

## v1.52.1
- Sprite editor
  - Fixed animation playback not working (stale closure in setInterval callback; fresh sprite reference now fetched each tick)
  - Animation stops when switching to a different sprite
  - Rearranged layout — preview canvas, play/speed, frame navigation and checkboxes moved under main editing canvas
  - Renamed "Spd:" label to "Speed"
- Screen viewer: fixed attributes-off rendering — ink (1 bits) now renders as black, paper (0 bits) as white, matching ZX Spectrum convention (was inverted)
- Image import: fixed paper color rule (Darker/Lighter) for single-color cells — when both ink and paper are the same color, luminance is checked against midpoint to determine if the color should be paper or ink; two-color cells still use relative luminance comparison

## v1.52.0
- Sprite editor
  - Frame bar moved from sidebar to floating editor panel
  - Multi-select frames with Ctrl+Click (toggle) and Shift+Click (range select)
  - Move Left/Right buttons (◄ / ►) to reorder selected frames
  - Del button deletes all selected frames (keeps at least 1)
- Sprite list
  - Multi-select with Ctrl+Click (toggle) and Shift+Click (range select)
  - Right-click context menu with operations:
    - Merge selected to animation — combine selected sprites (same dimensions/mode) into one sprite with multiple frames
    - Add frames to… — copy frames from selected sprites to a chosen target sprite
    - Move frames to… — move frames to a target sprite, removing source sprites
    - Split frames to sprites — split a multi-frame sprite into separate single-frame sprites
    - Delete selected — remove all selected sprites
  - Split/Merge buttons moved from sidebar into the context menu
- Import Nirvana tile files (`.btile`, `.wtile`): opens file, prompts for tiles per row, creates IFL picture with tiles laid out in a grid and a spriteset with each tile as a multicolour sprite

## v1.51.1
- Image import: fixed crash when using Darker/Lighter paper rule (analyzeCell and block analysis functions now return inkRgb/paperRgb needed by perceptual luminance calculation)
- Sprite editor: right mouse button now draws paper (clears pixels), matching main canvas behavior
  - Applies to all drawing tools: Draw, Erase, Line, Rectangle, Fill
  - Left click = ink (set bit), Right click = paper (clear bit)
  - Erase tool inverts: left = clear, right = set
  - Fill tool: left click fills with ink, right click fills with paper
- Sprite grab
  - Fixed black/white sprites when grabbing in multicolour mode (Firefox/Win7) — multicolour `<option>` was hidden from a previous session; Firefox refuses to set `<select>` value to a hidden option, so attr mode silently fell back to mono
  - Fixed drawing on main canvas while dragging grab rectangle — changed `stopPropagation()` to `stopImmediatePropagation()` to prevent editor mousedown from firing; added `spriteGrabMode` guard in screen editor's mousedown handler

## v1.51.0
- Image import
  - Default dithering changed to None (nearest color, no dithering)
  - Paper color rule control: Auto, Darker color, Lighter color, First pixel paper
  - Applied to all formats: SCR, ULA+, IFL, MLT, BMC4, 53c, BSC
  - Skipped for mono output (fixed ink=black, paper=white)

## v1.50.0
- Sprite editor: multicolour (8x2 attribute) mode
  - Full editing support: draw, erase, fill, line, rectangle with 8x2 cell attributes
  - Mode conversion between mono, attributed, and multicolour preserves pixel and attribute data
  - Attributed→multicolour replicates each 8x8 attr into four 8x2 sub-rows
  - Multicolour→attributed takes first sub-row of each group
  - Resize preserves multicolour attribute layout (4 attr rows per cell row)
  - Grid overlay shows 8x2 cell boundaries in multicolour mode
  - Flip H/V correctly reorders multicolour attribute rows
  - Rotation disabled for multicolour (8x2 cells cannot rotate 90°)
  - Undo/redo handles variable attribute array sizes
  - Export format selector (Raw / Nirvana) shown for multicolour sprites
  - Onion skin fix: now renders on top of current frame (was invisible due to draw order); previous frame's ink pixels only overlaid at 25% opacity (paper pixels skipped)
  - Animation playback fix: zoomed editor canvas now updates during animation (was static, only preview moved)
- Sprite grab from multicolour screens (IFL, MLT, BMC4)
  - Format-aware attribute extraction using correct attribute address functions
  - Attr mode dropdown auto-locked to Multicolour when source is a multicolour format
  - Multicolour option hidden from dropdown when source is non-multicolour
  - Phase grab converts existing frames when attr mode differs from sprite

## v1.49.0
- Image import: alignment control for fitted images
  - Align dropdown with 9 positions: Top-Left, Top, Top-Right, Left, Center, Right, Bottom-Left, Bottom, Bottom-Right
  - Applies to all fit modes: Letterbox, Fill/crop, Fit width, Fit height
  - Both main canvas and BSC canvas respect alignment setting
  - Stretch mode unaffected (fills entire area)
  - Resets to Center on new image load

## v1.48.0
- SNA/Z80 snapshot loading
  - Load .sna snapshot files (48K and 128K formats)
  - Load .z80 snapshot files (V1, V2, V3 formats with RLE decompression)
  - Extracts ZX Spectrum screen(s) from snapshot RAM and opens as SCR pictures
  - 128K snapshots: both normal screen (bank 5) and shadow screen (bank 7) extracted
  - Empty screens (all zeroes) skipped automatically
  - Border color set from snapshot header
  - Snapshot files detected inside .zip archives
- Memory Viewer — floating panel for browsing snapshot RAM as 1-bit graphics
  - Renders any memory bank as green-on-black bitmap (16 bytes per row)
  - Bank selector for 128K snapshots (empty banks filtered out)
  - Address navigation: byte, line, row (8 lines), sprite, page steps
  - Vertical scrollbar for fast navigation through memory
  - Mouse wheel scrolling through memory
  - Mouse-driven selection: click to position red rectangle, drag to resize
  - Width/height inputs update live during drag
  - Address label shows effective address of selection in decimal and hex
  - Adjustable sprite size: width (1-8 bytes) and height (1-64 rows)
  - Red selection rectangle movable anywhere within the dump viewport
  - Preview canvas shows selected sprite at 2x zoom
  - Linear and Char addressing modes (char mode uses 8x8 tile layout)
  - Invert display toggle (black on green)
  - Grid overlay (per byte vertical, per 8 rows horizontal)
  - Zoom levels: x1, x2, x3, x4 (default x3)
  - Draggable floating panel (same pattern as sprite editor)
- Grab to Sprites from memory viewer
  - Four grab modes matching picture grab: Single sprite, Sprite phases, Singles grid, Phases grid
  - Grid sizing: by cell size (W×H) or by column/row count
  - Grid ordering: row-first or column-first
  - Respects char/linear addressing mode
  - Sprite automatically added to sprite sheet

## v1.47.0
- Sprite editor — new "Sprites" sidebar tab with full-featured floating pixel editor
  - Multi-tile sprites: NxM cells of 8x8 pixels (up to 8x8 = 64x64)
  - Monochrome and attributed modes (per-cell ink/paper/bright)
  - Drawing tools: draw, erase, fill (flood), line, rectangle, selection
  - Mask editing layer with visual red overlay
  - Transform tools: flip H/V, rotate CW/CCW (square sprites), shift 1px in any direction, invert, clear
  - Animation frames: add, duplicate, delete, navigate, onion skinning
  - Animation playback with adjustable speed; no layout jitter during playback
  - Frame bar uses CSS grid for uniform thumbnail alignment
  - Undo/redo for all pixel operations (Ctrl+Z/Ctrl+Shift+Z)
  - Grid display with cell boundaries, toggleable
  - Double-click sprite in list to open editor
  - Save/load sprite sheets (.sls JSON format)
  - Export as ASM (sjasmplus DB lines with labels and visual binary comments █·) or raw binary (.bin)
  - ASM export includes SpectraLab version in header
  - "Use as Brush" stamps current sprite frame onto the main canvas
  - Sprite sheet included in project save/load (.slp)
  - Draggable floating editor panel with keyboard shortcuts (D/E/F/L/R/S/M)
- Grab from screen — rectangle-drag mode to extract sprites from loaded pictures
  - Four grab modes: Single sprite, Sprite phases, Singles grid, Phases grid
  - Single sprite: drag any rectangle, creates one sprite of that exact size
  - Sprite phases: drag scattered sprites one by one, each adds a frame to the same sprite
  - Singles grid: drag region, split into grid of separate sprites
  - Phases grid: drag region, split into grid of animation frames for one sprite
  - Grid sizing: by cell size (W×H) or by column/row count (divides evenly)
  - Grid ordering: left→right then top→bottom, or top→bottom then left→right
  - Mono or attributed mode per grab
  - Grab stays active for multiple drags; Cancel button or Escape to exit
- Xform tab: export section now appears immediately on selection (no longer requires clipboard copy)
- Selection ASM export includes SpectraLab version in header

## v1.46.0
- ASM export for ULA+ pictures
  - Programs 64-entry GRB332 palette via I/O ports (#BF3B register select, #FF3B data)
  - Copies 6912 bytes screen data to #4000, enables ULA+ palette mode (register 64)
  - Screen data supports embed (DB lines) or INCBIN; palette always embedded (64 bytes)
  - sjasmplus compatible, SAVESNA output, ZXSPECTRUM48 device
- Import dialog: dithering options filtered by format
  - Cell-Aware group hidden for RGB3 and Mono (no attribute cells)
  - Dithering row hidden for 53c format (uses pattern selector instead)
  - Auto-switches to global equivalent when switching from cell format to non-cell format
- Code deduplication
  - Shared ASM export utilities: formatDbLines, getAsmBaseName, getAsmEmbedData, downloadFile (asm_export_utils.js)
  - Shared downloadFile replaces 20+ copy-paste download patterns across all JS files
  - applyImageAdjustments and rgbaToFloat helpers replace 16 identical blocks in image_import.js

## v1.45.0
- ULA+ palette loading & editing in image import
  - Palette source dropdown: Auto (generate optimal), Load .pal file, From ULA+ picture (.scr)
  - 8×8 palette preview grid with CLUT gap separators
  - Ctrl+click any color to edit via the ULA+ color picker (R/G/B sliders, GRB332)
  - Eyedropper: click output preview to pick a color and open it for editing
  - Auto palette promotes to editable on first eyedropper click
  - Reset button reverts to auto-generated palette
  - State fully cleaned on dialog close or format switch
- RGB3 per-channel dithering
  - Each R/G/B bitplane now dithered independently as 1-bit monochrome
  - Produces much richer color blending than previous 8-color joint dithering
  - All dithering methods benefit (error diffusion, threshold-based, blue noise, etc.)
  - Simplified bitplane encoding via direct channel thresholding
- 12 ULA+ palette files in palettes/ folder
  - grayscale, sepia, c64, cga, vivid, warm_sunset, ocean, pastel, earth_tones, neon, skin_tones, spectrum_plus
  - 64-byte .pal files (GRB332), loadable via import dialog "Load .pal..." option
- Dithering bug fixes
  - Cell-aware dithering modes (cell-floyd, cell-none, etc.) now work correctly with non-cell formats (RGB3, Mono)
  - Fixed cell-floyd mapping: cell-floyd → floyd-steinberg (was incorrectly stripped to "floyd", missing the switch case)
  - Fixed ULA+ cell-none: default case was applying ordered dithering instead of no dithering
  - Added missing cell-pattern case to ULA+ converter
  - Removed duplicate ULA+ color dialog from HTML
- SPECSCII
  - Copy/cut/paste with full clipboard support for cells (characters, attributes, mask data)
  - Cut clears cells to space (0x20) with default attributes, syncs layers
  - Paste supports invert mode (swap ink/paper) and recolor mode (change attributes only)
  - Paste preview renders characters using font glyph data; snap-to-grid for paste positions
  - Export to .tap: self-running ZX BASIC program with embedded control codes (INK, PAPER, BRIGHT, FLASH, AT, OVER)
- BMC4 border support in image import
  - Encodes real border colors from the 384x304 source image
  - Respects ZX Spectrum timing: 24px minimum for interior segments, 8px granularity for side borders
  - Previously border data was all-black zeros
- .53c improvements
  - Attribute preview strip showing current ink/paper/pattern combination with flash animation
  - Pattern-aware import: finds ink/paper pair whose blended color is closest to cell average
  - Rendering performance: ImageData + drawImage fast path replaces per-pixel fillRect
- Unified export UI: single dropdown + button replaces separate per-format export buttons
- Image import module renamed from png_import.js to image_import.js

## v1.44.0
- SPECSCII text editor (.specscii format)
  - 32x24 character grid editor using ZX Spectrum ROM font (0x20-0x7F) + block graphics (0x80-0x8F)
  - Stream format with embedded control codes (INK, PAPER, BRIGHT, FLASH, AT, OVER) compatible with ZX BASIC PRINT
  - Dual data model: internal grids for random-access editing, stream format for save/load
  - Character palette with 112 tiles (96 ROM + 16 block graphics), 1px gap grid, zoomed preview
  - OVER (XOR) layer support: multi-layer compositing with per-cell transparency masks
  - Drawing tools: pixel (place char), line, rect, circle, flood fill, eraser, text
  - Paint modes: Set (place char), Invert (swap ink/paper), Recolor (change attributes only)
  - All tools respect paint mode including text tool (invert swaps ink/paper, recolor changes attributes only)
  - Right-click to pick character + attributes from screen
  - Eraser clears cell to default and removes from layer (transparent on non-background layers)
  - Transparent cell mask: new/cleared pictures start empty, only user-placed cells are exported to stream
  - AT positioning codes used for gaps between content cells (compact output)
  - Export to .scr via Transform tab: renders characters to standard 6912-byte bitmap
  - Full undo/redo support with grid and mask state preservation
  - Create new SPECSCII pictures via New Picture dialog
- SCA animation: version 0 files now supported without warning
- Performance: eliminated redundant rendering and double state saving during file/picture switching
- APP_VERSION constant in app_config.js: single source of truth for version number
- ASM exports now include version number in header comment ("; Generated by SpectraLab v1.44.0")
- App title link points to GitHub repository

## v1.43.0
- Built-in UDG tileset with 96 useful tiles
  - Block graphics (16 mosaic patterns), dither patterns, border/frame pieces
  - Shapes, arrows, line connectors, box drawing characters
  - Auto-loaded from fonts/udg.768 if present
  - Appears as "UDG" tab in brush panel (non-closeable)
- ASM export for Gigascreen (.img), RGB3 (.3), and IFL (.ifl) formats
  - Pentagon 128K compatible, sjasmplus assembler
  - "Embed data" checkbox: toggle between embedded DB lines or INCBIN mode
  - Gigascreen: dual-screen banking (banks 5/7), 25Hz alternation
    - INCBIN mode: `INCBIN "file.img", offset, length` for both frames
  - RGB3: ultra-fast unrolled copy (LD HL,nn : PUSH HL technique)
    - 64512T bitmap copy (under one frame!) + ~5000T attrs = ~70000T total
    - Tear-free 50fps display (71680T per frame on Pentagon 128K)
    - Bitmap data embedded as immediate values in code (~37KB total)
  - IFL: dual-screen interlace technique (from zxpress.ru)
    - BC=#7FFD, D=#1F (show bank 7), E=#17 (show bank 5)
    - OUT(C),D/E for fast 12T screen switching
    - Write to non-displayed screen while showing the other (no beam racing)
    - 448T per attr row: OUT(12T) + NOP(4T) + 16×POP+LD(416T) + DS 4(16T)
    - Compact DUP/IF macros with sjasmplus label variables
    - INCBIN mode: runtime attr reordering at startup (row1..95,row0)
  - BSC: INCBIN mode references original .bsc file
  - SAVESNA output for direct emulator testing

## v1.42.0
- Tileset support integrated with custom brushes
  - Tabbed interface in Custom Brushes section: Custom, ROM, and user-loaded tabs
  - ROM tab: Shows current font as 96 tiles (8x8 each), updates when font changes
  - Load tilesets via "+" button or load button:
    - 768-byte files: 96 tiles in linear format (tile T, row R at offset T*8+R)
    - 2048-byte files: 256 tiles in columnar/interleaved format (optimized for Z80)
    - .slb files: Load as editable brush set tabs
  - Grab tileset from screen via crosshair button:
    - Select rectangular area (snaps to 8px grid)
    - Tiles grabbed left-to-right, top-to-bottom from selection
    - Creates 96-tile set if ≤96 tiles selected, 256-tile set otherwise
    - Remaining slots filled with empty tiles
  - Click any tile to use as brush with all drawing tools
  - Rotation (R) and mirror (H/V) work on selected tiles
  - User tabs persist in localStorage, closeable with × button
  - Maximum 8 tabs total (Custom + ROM + up to 6 user tabs)
- New snap modes: Grid Center and Subgrid Center
  - Centers brush on grid/subgrid cells instead of aligning top-left corner
  - For 8px grid with 8x8 tile: top-left aligns at 0,8,16... instead of -4,4,12...
- Fixed: Gigascreen replace mode with tiles/custom brushes painted solid square instead of pattern

## v1.41.0
- Gigascreen (.img) format editing
  - Full editing support with live blended preview
  - Virtual color palette: 136 unique color blends from 16 ZX colors
    - 16 solid colors (8 normal + 8 bright)
    - 120 blended pairs (all combinations)
  - 4-color cell palette: each ink/paper pair gives 4 paintable blends
    - Left click color = assign to left mouse button (L)
    - Right click color = assign to right mouse button (R)
    - Ink+Ink, Ink+Paper, Paper+Ink, Paper+Paper combinations
    - True Gigascreen editing: different pixel patterns in each frame
  - Layer support: add/remove/reorder layers with dual-frame storage
  - Eyedropper (Alt+click): picks virtual ink/paper and assigns pixel color to L/R
  - Clear fills with selected virtual colors
  - Drawing automatically sets both frames simultaneously
  - Virtual ink/paper selection: click to set ink, right-click for paper
  - All drawing tools work with virtual colors (pixel, line, rect, fill, etc.)
  - Recolor tool updates attributes in both frames
  - Save as .img preserves full 13824-byte format
  - Create new Gigascreen picture from File > New dialog
- Fixed stroke/backstroke brush preview showing wrong diagonal
- Fixed Gigascreen palette remaining visible when switching to non-Gigascreen formats

## v1.40.0
- Gradient tool enhancements
  - Supports all brush paint modes (set, replace, invert, recolor, retouch, masked, masked+)
  - Custom brush support: stamps brush pattern at gradient-dithered positions
  - Snap support for gradient endpoints
- Layer operations now support undo/redo
  - Add layer, remove layer, move layer up/down all undoable
- RGB3 (.3) format: Flicker emulation mode
  - "Emulate flicker" checkbox shows bitplane switching effect
  - Cycles through Red, Green, Blue bitplanes at 50fps
  - Simulates how RGB3 images appear on real hardware
  - Blended view (default) shows pristine combined colors
- Gigascreen (.img) format support
  - Two alternating SCR frames (13824 bytes = 2×6912)
  - Two display modes via dropdown:
    - Average: Blends colors by averaging RGB values (pristine view)
    - Flicker: Alternates frames at 50fps (hardware emulation)
  - Validates file size on load (warns if not 13824 bytes)

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
  - Toggles monochrome (black on white) display across all formats
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
  - Uncheck to view screen in monochrome (black on white)
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
