# SpectraLab Help — UI Reference Guide

## 1. Introduction

**SpectraLab** is a web-based ZX Spectrum graphics editor and viewer. It supports multiple ZX Spectrum graphics formats for viewing, editing, converting, and importing external images with advanced dithering algorithms.

- **Version:** 1.59.3
- **License:** MIT
- **Browser:** Any modern browser (Chrome, Firefox, Edge, Safari)
- **No installation required** — runs entirely in the browser

![Main application window](screenshots/main_window.png)

---

## 2. Application Layout

SpectraLab uses a two-panel layout:

- **Left sidebar** (225px) — all controls, organized in tabs
- **Main canvas area** — the image display and editing area

Additional floating panels appear as needed:

- **Preview panel** — fixed-position miniature preview (bottom-right corner)
- **Sprite Editor panel** — floating pixel editor for sprites
- **Memory Viewer panel** — browse snapshot memory as 1-bit graphics
- **Floating Palette** — tool/color palette shown in fullscreen mode (Tab to toggle)

### Picture Tab Bar

When multiple pictures are open, a tab bar appears above the canvas. Each tab shows the file name. A dot indicator marks modified (unsaved) pictures. Click a tab to switch between pictures; click the close button (×) to close a picture.

![Application layout overview](screenshots/layout_overview.png)

---

## 3. File Operations

### Open File

Click the file input at the top of the left sidebar or **drag and drop** a file onto the canvas.

**Supported input formats:**
`.scr`, `.53c`, `.atr`, `.bsc`, `.bsp`, `.bmc4`, `.ifl`, `.mlt`, `.mc`, `.3`, `.img`, `.hlr`, `.stl`, `.nxi`, `.sl2`, `.specscii`, `.sca`, `.btile`, `.wtile`, `.ch$`, `.chr$`, `.ch-`, `.zxp`, `.slp`, `.slw`, `.sna`, `.z80`, `.zip`, `.png`, `.gif`, `.jpg`, `.jpeg`, `.webp`, `.bmp`

### New Picture

Click the **New** button to open the New Picture dialog. Select a format from the dropdown:

| Format | Extension | Description |
|--------|-----------|-------------|
| Screen | .scr | 256×192, bitmap + attributes |
| ULA+ | .scr | 256×192, 64-color palette |
| IFL | .ifl | 256×192, 8×2 multicolor attributes |
| MLT | .mlt | 256×192, 8×1 multicolor attributes |
| Border Screen | .bsc | 384×304, bitmap + attributes + border |
| Border Screen+ | .bsp | 384×304, bitmap + attributes + border (with header) |
| BMC4 | .bmc4 | 384×304, 8×4 multicolor + border |
| RGB3 | .3 | 256×192, tricolor RGB (8 colors) |
| Gigascreen | .img | 256×192, two-frame blend |
| Monochrome | .scr | 256×192, bitmap only |
| Monochrome 2/3 | .scr | 256×128, bitmap only |
| Monochrome 1/3 | .scr | 256×64, bitmap only |
| Attributes | .atr | 32×24 color cells |
| SPECSCII | .specscii | 32×24 text mode |
| chr$ | .ch$ | Variable-size, interleaved 8×8 cells |
| HLR | .hlr | 256×192, High Lores (32×24 gigascreen) |
| STL | .stl | 256×192, Stellar (64×48 multicolor gigascreen) |
| ZXP | .zxp | Variable-size (8-2048px), ULA or ULA+ palette |

### Save

Click the **Save** button or press **Ctrl+S**. The file is saved in its native format and downloaded by the browser.

### ZIP File Handling

When opening a `.zip` file, a modal dialog appears listing all files inside the archive. Click any file to extract and open it.

![New picture dialog](screenshots/new_picture_dialog.png)

---

## 4. Main Tabs

The left sidebar has four tabs: **View**, **Edit**, **Xform** (Transform), and **Sprites**.

---

## 5. View Tab

The View tab controls how the image is displayed.

### Zoom

Select zoom level from the dropdown: **x1/8, x1/4, x1/2, x1, x2, x3, x4, x5, x6, x8, x10, x20** (fractional levels x1/8, x1/4, x1/2 are available for large images). You can also use **Ctrl+Mouse Wheel** to zoom in/out (works anywhere in the canvas panel area), or press number keys **1-5** for quick zoom. Ctrl+Mouse Wheel over the left sidebar performs normal browser zoom.

### View Settings (collapsible)

Click the "View Settings" header to expand/collapse.

#### 53c Pattern (shown only for `.53c` / `.atr` attribute-only formats)
Appears at the top of View Settings when a 53c/atr picture is loaded:
- **Pattern:** select the fill pattern — **Checker**, **Stripes**, or **Pattern** (DD/77)
- **Blend colors** checkbox — when checked, each cell renders as a solid averaged color instead of a dither pattern

#### Border
- **Color:** Black, Blue, Red, Magenta, Green, Cyan, Yellow, White
- **Size:** None, Small (16px), Medium (32px)

#### Palette
Select display palette from the dropdown. Available palettes depend on the loaded palette definitions.

Click the 📂 button next to the dropdown to load a custom 16-color palette from a text file (`.txt`, `.pal`, `.csv`). The file should contain 16 lines, one color per line (indices 0-7 = regular, 8-15 = bright). Each line can be either `#RRGGBB` hex or three space/comma-separated decimal `R G B` values (0-255). Lines starting with `;` or `//` and blank lines are treated as comments and skipped. The loaded palette appears as "Custom (loaded)" in the dropdown. It is not persisted — page reload reverts to the default palette.

#### Toggles
- **Flash** — enable/disable flash animation (also toggle with **F** key)
- **Attrs** — show/hide attribute overlay. When attributes are off, the bitmap is displayed as black ink on white paper (1 bits = black, 0 bits = white)
- **Preview** — show/hide preview panel (also toggle with **~** key)

#### Paper Grid
- **Grid size:** None, 8px, 16px, 24px, 32px
- **Subgrid size:** None, 1px, 2px, 4px, 8px, 16px

#### Border Grid
- **Border grid size:** None, 8px, 16px, 24px, 32px
- **Border subgrid size:** None, 1px, 2px, 4px, 8px, 16px

#### Grid Color
Select a grid color preset from the dropdown: **Default**, **White**, **Gray**, **Black**, **Orange**, **Red**, **Green**. Useful for improving grid visibility on dark or light artwork.

### Format-Specific Controls

#### RGB3 Controls
For `.3` tricolor format, select display mode:
- **Blend dark** — simulates perceived brightness on real CRT, accounting for vertical retrace blanking
- **Blend** — full-brightness direct RGB channel mapping (each R/G/B plane controls its channel at full palette intensity)
- **Emulate flicker** — alternating frame display to simulate real hardware

#### Gigascreen Controls
For `.img` gigascreen, `.hlr` (High Lores), and `.stl` (Stellar) formats, select display mode:
- **Blend dark** — simulates perceived brightness on real CRT, accounting for vertical retrace blanking
- **Blend** — blended view of both frames at full brightness
- **Emulate flicker** — alternating frame display to simulate real hardware

#### Font Controls
For SPECSCII format: click **Browse** to load a custom font file (`.bin`, `.SpecCHR`). The default font is the ZX Spectrum ROM font.

### Reference Image (collapsible)

Load an external image as a drawing reference behind the canvas.

- **Load** — select an image file
- **Clear** — remove the reference image
- **Show** — toggle visibility
- **Opacity** — adjust transparency (5% to 80%)
- **X / Y** — position offset (can be negative)
- **W / H** — custom dimensions (empty = fit to format)

Reference images are saved in workspace files.

### Display Filters (collapsible)

Click the "Display Filters" header to expand. Check the **On** checkbox to enable post-processing effects.

| Filter | Description |
|--------|-------------|
| Scanlines | Gaussian beam profile simulating CRT scanlines |
| Noise | Static film grain with optional animation |
| Composite | Chroma blur simulating composite video color bleed |
| Phosphor Glow | Blurred overlay simulating phosphor persistence |
| Vignette | Radial darkening at screen edges |
| CRT Curvature | Barrel distortion simulating curved CRT glass |
| Pixel Smoothing | Bilinear interpolation for softer pixel scaling |

**Presets:** None, CRT TV, Composite, VHS, Arcade

Settings persist to localStorage and workspace (.slw) files.

### File Info (collapsible)

Displays information about the loaded file:
- **Name** — file name
- **Size** — file size in bytes
- **Format** — detected format
- **Dimensions** — pixel dimensions
- **Frames** — number of frames (for SCA animations)
- **Type** — payload type (for SCA)
- **Delay** — frame delay (for SCA)

### Help & About

At the bottom of the View tab, click the **?** button to open the Help dialog with keyboard shortcuts and format information.

![View tab controls](screenshots/view_tab.png)

---

## 6. Edit Tab — Drawing Tools

When no picture is loaded, the Edit tab shows: "Load a picture or click this tab again to create a new one."

### Tools

| Tool | Key | Description |
|------|-----|-------------|
| Pixel | P | Free-draw individual pixels |
| Line | L | Draw straight lines |
| Rectangle | R | Draw rectangles |
| Circle/Ellipse | O | Draw circles and ellipses |
| Airbrush | G | Spray random pixels in a radius |
| Gradient | D | Draw dithered gradients |
| Flood Fill | I | Fill connected same-color pixels |
| Fill Cell | C | Fill an 8×8 character cell |
| Eraser | E | Erase pixels (makes transparent on non-BG layers) |
| Text | T | Place text on the canvas |
| Recolor | A | Change attributes only, keep bitmap (via keyboard shortcut) |
| Color Picker | K | Pick colors from canvas (left=ink, right=paper) |
| Select | S | Select rectangular area (in Xform tab) |

### Drawing Modifiers

| Action | Effect |
|--------|--------|
| Left click | Draw with ink color |
| Right click | Draw with paper color |
| Alt+click | Eyedropper — pick ink+paper from cell |

### Shape Modifiers (Rectangle, Circle/Ellipse)

| Modifier | Effect |
|----------|--------|
| Ctrl | Constrain to square/circle (1:1 ratio) |
| Alt | Draw from center instead of corner |
| Ctrl+Alt | Square/circle from center |

![Editor tools](screenshots/edit_tools.png)

---

## 7. Edit Tab — Color & Palette

### Standard Palette

The palette bar shows 8 ZX Spectrum colors (0-7). Click to select ink (marked **I**), right-click to select paper (marked **P**).

Below the palette:
- **Bright (B)** — toggle bright attribute
- **Flash (F)** — toggle flash attribute
- **X** key — swap ink and paper colors

### ULA+ Palette

Shown when editing ULA+ format pictures. Features 64 colors organized in 4 CLUTs (Color Look-Up Tables), 16 colors each.

- **Grid mode** — all 64 colors in an 8×8 grid
- **Classic mode** — single CLUT view with CLUT selector buttons (0, 1, 2, 3)
  - CLUT 0: FLASH=0 BRIGHT=0
  - CLUT 1: FLASH=0 BRIGHT=1
  - CLUT 2: FLASH=1 BRIGHT=0
  - CLUT 3: FLASH=1 BRIGHT=1
- **Toggle** — switch between Grid and Classic modes
- **Save palette** — export 64-byte `.pal` file (GRB332 encoding)
- **Load palette** — import `.pal` file
- **Ctrl+click** on a color — open the color editor dialog (R/G/B sliders, GRB332 format: 3-bit green, 3-bit red, 2-bit blue)
- **Shift+click** on a color — mark as copy source (animated border), then:
  - **Click** another color — copy source GRB value to target
  - **Shift+click** another color — swap both GRB values
  - **Click same cell** or **Escape** — cancel

Ink and paper must be from the same CLUT.

### ULANext Mode

Shown when viewing/editing ULANext format pictures (ZX Spectrum Next extended palette). ULANext uses a configurable ink mask to split each attribute byte between ink and paper palette indices, allowing up to 256 ink or 256 paper colors.

- **Auto-detected** from file size (6945–7426 bytes) and ink mask validation
- **Ink mask** — determines the ink/paper split (8 valid values: $01–$FF)
- **Palette** — 8-bit (1-byte RRRGGGBB) or 9-bit (2-byte RGB333) entries, auto-detected
- **Flash disabled** — attribute bits 6-7 are repurposed for palette indexing
- **Format info** — displays mask value, ink/paper color counts, and palette bit depth
- Colors are rendered automatically; standard drawing tools work normally on the bitmap and attributes

### Next Palette (NXI / SL2 / LoRes)

Shown when editing ZX Next indexed-color formats (NXI, SL2, LoRes, LoRes Radastan). Displays 256 colors (or 16 for 4bpp modes) in a 16-column grid.

- **Left click** — select ink color
- **Right click** — select paper color
- **Ctrl+click** on a color — open the color editor dialog (R/G/B sliders, RGB333 format: 3-bit red, 3-bit green, 3-bit blue)
- **Shift+click** on a color — mark as copy source (animated border), then:
  - **Click** another color — copy source RGB value to target
  - **Shift+click** another color — swap both RGB values and remap pixels
  - **Click same cell** or **Escape** — cancel
- **Sort options** — None, Luminance, Hue, RGB; optional Reverse
- **Save palette** — export palette file
- **Load palette** — import palette file

### Gigascreen Palette

Shown for Gigascreen, HLR, and STL formats. A 16-column grid displays all virtual colors created by two-frame alternation.

- Left click = select ink
- Right click = select paper
- **Cell Colors** section shows the 4 available colors per cell
  - **L** = Left mouse button color
  - **R** = Right mouse button color

### 53c/127c Pattern Palette

Shown when editing 53c/atr attribute-only format. Displays a grid of unique dither-pattern color swatches representing all available ink/paper combinations through the selected pattern.

- Click a swatch to select the color combination for drawing
- **Sort mode:** Hue (default), RGB, or Color (attribute byte) — controls palette ordering
- **Reverse** checkbox — reverses the sort order
- Adapts to current pattern: Checker (~53 colors), DD77 (~127 colors)
- Selected color is preserved when changing sort mode or pattern

### RGB3 Palette

Shown for RGB3 (.3) tricolor format. 8-color palette with left/right click selection (no separate ink/paper). Palette colors depend on the display mode: Blend shows full-brightness RGB, Blend dark shows realistic perceived colors (1/3 brightness per channel × CRT dark factor), Flicker alternates frames.

![Palette controls](screenshots/palette_controls.png)

---

## 8. Edit Tab — Brushes

### Brush Shape

Six brush shapes available:

| Shape | Icon | Description |
|-------|------|-------------|
| Square | ■ | Square brush |
| Round | ● | Round brush |
| HLine | — | Horizontal line brush |
| VLine | \| | Vertical line brush |
| Stroke | / | Forward diagonal brush |
| BStroke | \\ | Back diagonal brush |

### Brush Size

Select size from 1 to 16 pixels using the dropdown, or use **[ ]** keys to decrease/increase brush size.

### Brush Preview

Press **` (backtick)** to toggle brush preview mode, which shows a semi-transparent overlay of the brush at cursor position.

### Custom Brushes (collapsible)

12 custom brush slots arranged in two rows of 6. Each slot is a 64×64 pixel canvas.

| Action | Effect |
|--------|--------|
| Click slot | Select brush (empty slot starts capture mode) |
| Shift+click slot | Capture brush from screen |
| Ctrl+click slot | Clear slot |

The **↻ ↔ ↕** buttons in the Xform tab transform the clipboard while pasting, otherwise transform the selected custom brush.

#### Brush Tabs

Custom brushes support multiple tabs:
- **Custom brushes** — 12 free-form slots
- **Tileset** tabs — loaded from `.768`/`.bin` font/tileset files

Use **Save** and **Load** buttons to save/load brush sets (`.slb` format) or tilesets (`.768`/`.bin` format).

### Barcodes (Border Patterns)

Available for BSC/BSP/BMC4 formats. 8 barcode slots for border stripe patterns.

| Action | Effect |
|--------|--------|
| Shift+click slot | Start capture, then click border area |
| Click slot | Select/deselect barcode |
| Ctrl+click slot | Clear slot |

Width is auto-detected (8/16/24px). Selected barcodes can be stamped by clicking/dragging on the border area.

Save/load barcode sets with the **Save/Load** buttons (`.slbc` format).

![Custom brushes](screenshots/custom_brushes.png)

---

## 9. Edit Tab — Paint Modes

The **Mode** dropdown controls how pixels are applied:

| Mode | Description |
|------|-------------|
| Set | Draw ink or paper based on mouse button |
| Invert | Toggle pixels (ink ↔ paper) |
| Replace | Overwrite all pixels under brush |
| Recolor | Change attributes only, keep bitmap |
| Retouch | Change bitmap only, keep attributes |
| Masked | Use custom brush as tiled mask pattern (fixed origin) |
| Mask+ | Use custom brush as tiled mask (stroke-relative origin) |

**Masked modes:** Select a custom brush to use as a pattern/stencil, then choose any brush shape/size for drawing. In Masked mode the pattern is fixed to canvas origin; in Mask+ mode the pattern origin follows the stroke start.

### Snap Mode

The **Snap** dropdown controls cursor snapping:

| Mode | Description |
|------|-------------|
| Grid | Snap to grid size (from View tab) |
| Grid× | Snap to grid, corner alignment |
| Sub | Snap to subgrid size |
| Sub× | Snap to subgrid, corner alignment |
| Zero | Snap to clipboard-sized grid from origin |
| Brush | Snap to clipboard-sized grid from first paste |
| Off | Pixel-precise placement |

---

## 10. Edit Tab — Text Tool

When the Text tool (T) is selected, the Text section appears:

- **Text input field** — type the text to place
- **Font selector** — choose from loaded fonts (default: ROM/Spectrum)
- **Font size** — 8, 12, 16, 20, 24, or 32 pixels
- **.768** button — load a ZX Spectrum 8×8 bitmap font (`.768`, `.ch8`, `.bin`)
- **TTF** button — load a TrueType/OpenType font (`.ttf`, `.otf`, `.woff`, `.woff2`)
- Click the canvas to place text at that position

![Text tool](screenshots/text_tool.png)

---

## 11. Edit Tab — Airbrush Tool

When the Airbrush tool (G) is selected, additional controls appear:

- **Radius** — spray area size: 4, 8, 12, 16, 24, or 32 pixels
- **Density** — particles per spray: 0.03 to 1.0
- **Falloff** — distribution: Uniform, Soft, Medium, Hard, Very Hard (center bias)

Hold the mouse button for continuous spray. Works with Masked mode for spray through stencil patterns.

---

## 12. Edit Tab — Gradient Tool

When the Gradient tool (D) is selected, additional controls appear:

- **Type** — Linear, Radial, Diamond, Conical, Square, Spiral
- **Dither** — Bayer (ordered) or Noise (blue noise)
- **Reverse** — swap ink/paper direction

Drag from start to end point to create the gradient.

---

## 13. Edit Tab — Layers

The Layers section (collapsible) allows multi-layer editing:

- **Add** (+) — add a new layer (creates Background + new layer on first use)
- **Remove** (−) — remove selected layer
- **Move Up** (↑) / **Move Down** (↓) — reorder layers
- **Flatten** (⊟) — merge all layers into one

Save/load project files with layers using the **Save/Load** buttons (`.slp` format).

---

## 14. Edit Tab — SPECSCII Editor

For SPECSCII format pictures, a character palette appears (collapsible):

- **Character grid** — ROM font characters (0x20-0x7F) and block graphics (0x80-0x8F)
- Click a tile to select a character for drawing
- **Sort by weight** (Sort button) — toggles between Code order (sequential) and Weight order (sorted by pixel popcount, lightest→heaviest; default). Block graphics appear in a 5×3 symmetric grid in weight mode. Setting persists via localStorage
- **Character preview** — shows the selected character enlarged with its code
- Right-click on canvas to pick character + attributes from screen

Available tools in SPECSCII mode: Pixel, Line, Rectangle, Circle, Flood Fill, Eraser, Text.

Paint modes: Set (place character), Invert (swap ink/paper), Recolor (attributes only). The Eraser clears the cell and removes it from the current layer.

SPECSCII supports OVER layers (XOR compositing) loaded from stream control codes. You can export SPECSCII to `.scr` bitmap via the Transform tab.

![SPECSCII editor](screenshots/specscii_editor.png)

---

## 15. Transform Tab (Xform)

### Workspace

- **Save Workspace** — save all open pictures and sprites as a `.slw` file
- **Load Workspace** — load a workspace file (`.slw`)

Workspace buttons are always available, even without a loaded picture. The remaining transform tools require a picture to be loaded or created first.

### Save all pictures

Visible only when **two or more pictures are open**. All four bundles use the base file name `spectralab_pictures` (with `.zip` / `.gif` / `.sca` extension).

- **ZIP (originals)** — bundles every open picture in its native binary format into one `.zip`. Each entry keeps its original file extension (e.g. `.scr`, `.bsc`, `.ifl`, `.img`); duplicate names are disambiguated with ` (2)`, ` (3)`, …
- **ZIP (PNG / GIF)** — bundles every picture rendered with the current view settings (zoom, border, palette, display filters) as PNG. Pictures with flashing attributes are written as 2-frame animated GIFs at the standard FLASH cadence.
- **Animated GIF** — combines all pictures into one animated GIF at 500 ms per frame. Pictures with flashing attributes contribute two frames (normal + swapped phase). Requires every picture to render to the same canvas size — mix formats with different output sizes and the export aborts with an error.
- **SCA** — combines all pictures into one SCA animation file at 500 ms per frame. Requires every picture to be in plain SCR format (256×192, 6912 bytes); the border colour is taken from the current setting. Mixing in any non-SCR picture aborts the export with a list of offending names.

The active picture is preserved — saving briefly cycles through every open picture to render it, then restores the original tab.

### History

- **Undo** (Ctrl+Z) — undo last action (up to 32 levels)
- **Redo** (Ctrl+Y) — redo undone action
- **Clear** — clear the entire screen

### Format Conversion

Use the **Convert to...** dropdown to convert the current picture to a different format.

Available conversions include:
- **Lossless**: SCR ↔ ATTR, SCR ↔ BSC ↔ BSP, SCR ↔ ULA+, NXI ↔ SL2 (all modes: 256×192, 320×256, 640×256)
- **Lossy (render + re-quantize)**: SCR/ULA+ → NXI 320×256/640×256, NXI/SL2 cross-mode (256↔320↔640), NXI/SL2 → SCR
- **Character match**: SCR → SPECSCII — matches each 8×8 cell bitmap to the best ROM font character or block graphic, preserving brightness and flash; tries both normal and inverted (ink/paper swap) matching; hidden pixels (ink == paper) are matched to the best glyph so the bitmap pattern is preserved for editing

### Export

- **Export format** dropdown — select the export format (available options depend on the loaded format)
- **Embed** checkbox — embed data as DB lines in ASM output (unchecked = use INCBIN references)
- **Export** button — export to the selected format
- **PNG/GIF** button — export the current screen to PNG or animated GIF image
  - Uses all current View tab settings: zoom, border size/color, grid/subgrid, palette, filters
  - For gigascreen-family formats (Gigascreen, MGH, HLR, STL, BSP-gigascreen, chr$-gigascreen): a dialog lets you choose **Blended** (averaged colors → PNG) or **Flicker** (two alternating frames → animated GIF at ~50fps)
  - For pictures with flash attributes: a dialog lets you choose **Animated GIF** (two-frame flash animation at 320ms per phase) or **Static PNG** (normal phase only)
  - For all other formats: exports directly as PNG

### Format ASM Export

The Export dropdown generates self-contained sjasmplus-compatible ASM source files that display the loaded picture on real hardware. Each export produces a complete viewer program — just assemble and run.

Available format exports:

| Format | Export option | Target | Output |
|--------|-------------|--------|--------|
| BSC | ASM (Pentagon border) | Pentagon 128K | .sna — cycle-exact border color effects |
| Gigascreen / MGH | ASM (Pentagon dual-screen) | Pentagon 128K | .sna — alternating screen banks |
| RGB3 | ASM (Pentagon RGB flicker) | Pentagon 128K | .sna — RGB channel flicker |
| IFL | ASM (Pentagon 8x2 multicolor) | Pentagon 128K | .sna — 8×2 multicolor display |
| ULA+ | ASM (ULA+ palette) | ZX Spectrum 48K + ULA+ | .sna — 64-entry palette programming |
| NXI / SL2 | ASM (Next Layer 2 .nex) | ZX Spectrum Next | .nex — Layer 2 with palette, all modes (256×192, 320×256, 640×256) |

- **Embed** checkbox controls whether pixel data is included as DB lines (embedded) or as INCBIN references to the original file. Palette data is always embedded (small size). For RGB3, data is always embedded.
- All exports target the **sjasmplus** assembler. Pentagon exports produce .sna snapshots; Next Layer 2 exports produce .nex files via SAVENEX.

### Generate

- **QR Code** — open the QR Code generator dialog

### Clipboard

| Button | Key | Description |
|--------|-----|-------------|
| Select | S | Select rectangular area on canvas |
| Cut | Ctrl+X | Cut selection (copy + erase) |
| Paste | Ctrl+V | Paste clipboard content |
| Invert | N | Invert selection (swap ink ↔ paper) |
| Rotate | R | Rotate clipboard/brush 90° CW |
| Flip H | H | Flip clipboard/brush horizontally |
| Flip V | V | Flip clipboard/brush vertically |

- **Snap to grid** checkbox — snap paste position to grid
- While pasting, click to place the content; use R/H/V keys to transform

### Transform Selection

When a selection is active, additional transform buttons appear:
- **↻ Rotate** — rotate selection 90° clockwise
- **↔ Mirror H** — mirror selection horizontally
- **↕ Mirror V** — mirror selection vertically

### ASM Export

When a selection is active, the "Export Selection to ASM" section appears:

- **Include attributes** — include color attribute data
- **Attribute mode:** Attributes after bitmap, or Interleaved (byte + attr)
- **Line mode:** Line-based (full row per DEFB) or Block-based (8 bytes per DEFB)
- **Direction:** Left to right, Right to left, Zigzag (start L-R), Zigzag (start R-L)
- **Visual comments (█·)** — add visual block comments to the ASM output
- **Save ASM file** / **Copy** — save to file or copy to clipboard

### Reset to Defaults

Clear all saved settings and reload the application.

![Transform tab](screenshots/transform_tab.png)

---

## 16. Sprites Tab

A **spriteset** is a named entry in the list that holds one or more individual **sprites** (animation frames). Each spriteset has fixed dimensions (W × H) and a color mode.

### Spriteset List

Shows all defined spritesets. Click to select.

- **Click** — select a single spriteset
- **Ctrl+Click** — toggle a spriteset in/out of multi-selection
- **Shift+Click** — select a range of spritesets from the last clicked to the current
- **Double-click** — select and open in the sprite editor
- **Right-click** — open context menu with operations on selected spritesets
- **+ Add** — add a new spriteset
- **Delete** — delete selected spriteset(s)
- **Clear all** — delete all spritesets (with confirmation)

### Context Menu (right-click on spriteset list)

- **Merge selected to animation** — combine all selected spritesets (must have same dimensions and mode) into one spriteset with multiple sprites
- **Add frames to…** — copy sprites from selected spritesets to a chosen target spriteset
- **Move frames to…** — move sprites to a chosen target spriteset and remove the source spritesets
- **Split frames to sprites** — split a multi-sprite spriteset into separate single-sprite spritesets (e.g. `Name_f1`, `_f2`, …)
- **Delete selected** — remove all selected spritesets

### Spriteset Properties

When a spriteset is selected:

- **Name** — spriteset name (max 16 characters)
- **W / H** — dimensions in cells (1-8 × 1-8, each cell = 8×8 pixels); locked after drawing (clear all sprites to unlock)
- **Mode** — Mono, Attributed, or Multicolour (8×1 / 8×2 / 8×4 attribute cell height); locked after drawing
- **+ Add** — add a new empty spriteset
- **Edit** — open the floating sprite editor
- **Delete** — delete selected spriteset(s)
- **Use as Brush** — use the sprite as a custom brush on the main canvas

### Grab from Screen

Grab sprites directly from the loaded picture. Set **W / H** and **Mode** in Spriteset Properties before grabbing — the grab uses these values for cell size and color mode.

- **Grab** button — enter grab mode, drag a rectangle on the canvas
- **Stop** button / Escape — exit grab mode
- Each grab creates a **new spriteset** with the grabbed sprites
- **Grab mode:**
  - Single sprite — grab one sprite
  - Sprite phases — grab as animation sprites
  - Singles grid — grab grid of individual spritesets
  - Phases grid — grab grid of animation sprite sets
- **Grid options:** Size by cell size (uses W/H from Spriteset Properties) or count, with column/row settings and ordering (L→R,T→B or T→B,L→R)

### File

- **Save .sls** — save sprite sheet
- **Load .sls** — load sprite sheet
- **Export ASM** — export sprites as assembly code
- **Export BIN** — export sprites as binary data

### Memory Viewer

After loading a snapshot file (`.sna`, `.z80`), the **Memory Viewer** button appears. See section 19.

![Sprite editor](screenshots/sprite_editor.png)

---

## 17. Sprite Editor (Floating Panel)

The Sprite Editor opens as a floating, draggable panel.

### Drawing Tools

| Tool | Key | Description |
|------|-----|-------------|
| Draw | D | Draw pixels (left click = ink/set, right click = paper/clear) |
| Erase | E | Erase pixels (left click = clear, right click = set) |
| Fill | F | Flood fill (left click = fill ink, right click = fill paper) |
| Line | L | Draw lines (left click = ink, right click = paper) |
| Rectangle | R | Draw rectangles (left click = ink, right click = paper) |
| Select | S | Select area |
| Mask | M | Toggle mask editing |

Mouse buttons work the same as on the main canvas: **left button** draws ink (sets bits), **right button** draws paper (clears bits).

### Color Controls

For Attributed and Multicolour mode sprites:
- 8-color palette for ink/paper selection
- **Bright** checkbox

### Preview and Animation

- **Preview canvas** — 1× preview of the sprite
- **Onion skin** — show previous sprite as ghost overlay
- **Grid** — show pixel grid
- **Attributes** — show attribute colors (checked by default); when unchecked, displays black/white bitmap only (black = ink, white = paper)
- **Show mask** — display the sprite mask
- **Sprite navigation:** Previous (**<**), sprite counter, Next (**>**)
- **Frame bar** — animation sprite thumbnails (16 per row) with multi-select support
  - Click — select a single sprite
  - Ctrl+Click — toggle sprite in/out of multi-selection
  - Shift+Click — range select from anchor to clicked sprite
- **Move Left** (◄) / **Move Right** (►) — reorder selected sprite(s)
- **Add sprite** (+) — add new animation sprite
- **Duplicate sprite** (Dup) — duplicate current sprite
- **Delete sprite** (Del) — delete current or all selected sprites (keeps at least 1)
- **Play** — animate the sprites
- **Speed** — animation speed slider (1-30)

### Transform Buttons

- **FlipH** / **FlipV** — flip horizontally/vertically
- **RotCW** / **RotCCW** — rotate clockwise/counter-clockwise
- **Scroll attr** checkbox — when checked, shift arrows also scroll attributes; attributes roll when the accumulated pixel shift reaches an attribute cell boundary (e.g. every 2 pixels for 8×2, every 1 pixel for 8×1); hidden in Mono mode
- **← → ↑ ↓** — shift sprite 1 pixel in any direction (with optional attribute scrolling)
- **Inv** — invert all pixels
- **Clr** — clear the current sprite

---

## 18. Image Import

When loading a PNG, JPG, WebP, BMP, or GIF file, the Image Import dialog opens.

For multi-frame animated GIFs, a **mode dropdown** appears next to the Import button with the following options:
- **Picture** — import the first frame as a static picture using selected format/dithering/adjustments
- **Flash** (2-frame GIFs only) — convert both frames into a single SCR with FLASH attributes. Cells that differ between frames use the FLASH bit (0x80) to alternate ink↔paper every 320ms; identical cells remain static
- **Animation** — convert all frames to SCA animation. Each frame is converted to SCR format, per-frame delays from the GIF are preserved (converted to SCA 20ms units). After import, the full SCA editor is available (filmstrip, playback, trim, delay editing, optimize, export)

### Layout

The dialog shows two canvases side by side:
- **ORIGINAL** — the source image
- **PREVIEW** — the dithered ZX Spectrum result

### Image Tab

#### Source

Crop the source image:
- **X, Y, W, H** — crop rectangle
- **Reset** — reset to original size
- **Full** — use full image
- **Detect** — auto-detect 256×192 region
- **4:3** — lock aspect ratio to 4:3

#### Transform

- **Fit mode:**
  - Stretch — stretch to fill target
  - Letterbox — fit within target, add bars
  - Fill/crop — fill target, crop excess
  - Fit width — fit to target width
  - Fit height — fit to target height

- **Align:** Top-Left, Top, Top-Right, Left, Center, Right, Bottom-Left, Bottom, Bottom-Right

- **Dithering algorithms:**

  Cell-Aware (attribute-optimized):
  - Cell Floyd, Cell Atkinson, Cell Serpentine, Cell Sierra 2, Cell Riemersma, Cell Ordered, Cell Blue Noise, Cell Pattern, Cell None

  Global (classic):
  - Floyd-Steinberg, Jarvis, Stucki, Burkes, Sierra, Sierra Lite, Sierra 2-Row, Serpentine, Dizzy, Riemersma, Atkinson, Ordered 2×2, Ordered 4×4, Ordered 8×8, Blue Noise, a-dither, Pattern, Noise, None

  Default dithering is **None** (nearest color, no dithering applied).

  - **Strength** slider (0–100%) — scales how much quantization error is propagated during error diffusion. 0 = pure quantization (no diffusion), 100 = classic full-strength diffusion. For ordered / pattern / blue-noise / a-dither methods, Strength > 0 engages a hybrid ordered+diffusion mode (the ordered threshold is used as a bias, and the residual error is then diffused with a Floyd-Steinberg kernel).
  - **Serpentine scan** checkbox — alternates row direction during error diffusion (left-to-right on even rows, right-to-left on odd rows) to reduce horizontal banding artifacts. Applies to all global error-diffusion methods.
  - **Dizzy** dither (Liam Appelbe, 2023) — error diffusion with a dynamic denominator: per pixel, the algorithm sums weights of in-bounds *unprocessed* neighbors (orthogonal = 1.0, diagonal = 0.1) and distributes `error × weight / denom` proportionally. No error is lost at image edges; produces blue-noise-like patterns.
  - **a-dither** (arithmetic dither, FFmpeg formula `((x + y·236) · 119) & 0xff`) — hash-based per-pixel threshold. Spatially stable, blue-noise-like, no lookup table.

- **Paper color rule** — controls how ink and paper colors are assigned in each cell (not applied to ULA+ format, which uses independent CLUT halves):
  - **Darker color** — default; the darker of the two cell colors becomes paper (per cell, using perceptual luminance). For single-color cells (both ink and paper are the same), the color is checked against a midpoint: dark colors become paper (0 bits), light colors become ink (1 bits)
  - **Lighter color** — the lighter of the two cell colors becomes paper. For single-color cells, the color is checked against a midpoint: light colors become paper (0 bits), dark colors become ink (1 bits)
  - **First pixel paper** — the color of the top-left pixel in each cell becomes paper; useful for spritesheets where a frame pixel marks the background color

- **LAB colors** — use LAB color space for perceptual matching
- **Grayscale** — convert to grayscale before processing
- **Mono output** — output black and white only

#### Output

- **Format:** SCR, ULA+, 53c (attr), IFL (8×2), BMC4 (8×4), MLT (8×1), BSC, BSP, RGB3, Gigascreen, HLR, STL, NXI (256×192, 320×256, 640×256), SL2 (256×192, 320×256, 640×256), SPECSCII, Mono, Mono 2/3, Mono 1/3, LoRes, Radastan, ZXP, chr$, btile (Nirvana 16×16), wtile (Nirvana 24×16)
- **Palette** selector
- **53c Pattern** (for 53c format): Checker, Stripes, DD/77
- **SPECSCII Charset** (for SPECSCII format): Full (ROM font + block graphics, 112 glyphs), ASCII (ROM font only, 96 glyphs), UDG (block graphics only, 16 glyphs + space)
- **ULA+ Palette:** Auto, Load .pal, From picture
- **Position:** X, Y offset
- **Size:** W, H (with lock aspect ratio). For btile/wtile, values snap to tile-aligned multiples on Enter/blur (16px for btile, 24px width / 16px height for wtile)
- **Tile to screens** — split the cropped source into a grid of pictures:
  - Each tile is one full output format (e.g. 256×192 for SCR)
  - Grid size is calculated automatically (cols × rows = total pictures)
  - Edge tiles are padded with black
  - Files named `filename_col_row.ext`
  - Yellow dashed overlay shows tile boundaries on the original canvas
  - ◄/► buttons navigate between tiles; preview shows the actual converted output for each tile
  - Position/Size/Fit/Align controls are disabled when tiling is active

### Adjustments Tab

| Control | Range |
|---------|-------|
| Contrast | -100 to +100 |
| Brightness | -100 to +100 |
| Saturation | -100 to +100 |
| Gamma | 0.20 to 3.00 |
| Sharpness | 0 to 100 |
| Smoothing | 0 to 100 (bilateral filter — reduces noise while preserving edges) |
| Levels | Black point (0-127), White point (128-255) |
| Color balance | R, G, B channels (-50 to +50 each) |

**Reset** button — resets all adjustment controls to their default values.

### Bottom Controls

- **Zoom:** x1, x2, x3
- **Grid** — show 8×8 grid on output preview
- **Mode dropdown** (animated GIFs only) — select Picture, Flash, or Animation import mode
- **Cancel** / **Import** buttons

![Image import dialog](screenshots/image_import.png)

---

## 19. SCA Animation Editor

The SCA editor opens as a full-screen overlay when editing `.sca` animation files.

### Top Bar

- **← Back** — return to the main view
- **Save As...** — dropdown with export options: SCA, SCR zip, 53c zip, GIF (animated), PNG zip
- **Save** — save in the selected format

### Filmstrip

A scrollable strip of frame thumbnails at the top. Click a thumbnail to select that frame. Trimmed frames are visually distinguished.

### Sidebar Controls

#### Playback
- **|◀◀** — jump to start
- **|◀** — previous frame
- **▶** — play/pause
- **▶|** — next frame
- **▶▶|** — jump to end

Frame info displays: frame number, total frames, and delay in ms.

#### Preview Zoom
- x1, x2, x3

#### Trim from Start / Trim from End
Adjust trim controls with **−** / **+** buttons to remove frames from the beginning or end.

#### Frame Delay
- Adjust delay value with **−** / **+** buttons
- **Apply to Current** — set delay for current frame
- **Apply to All** — set delay for all frames

#### Optimize
- **Remove Duplicate Frames** — remove consecutive duplicate frames and combine delays
- **Remove loop frame** — optionally remove the last frame if it equals the first
- **Reset** — restore original delays

#### Result
Displays statistics:
- Original frames / Trimmed frames / Duplicates
- Original duration / Trimmed duration
- Original size / Trimmed size

#### Preview Mode
- **All frames** — play all frames
- **Trimmed only** — play only non-trimmed frames

### SCA Viewer Controls

When viewing (not editing) an SCA file, simple controls appear below the main tabs:

- **< / >** buttons — navigate frames
- **Play** button — start/stop playback
- **Frame slider** — scrub through frames
- Frame info display

![SCA editor](screenshots/sca_editor.png)

---

## 20. Memory Viewer (Floating Panel)

Available after loading a snapshot file (`.sna`, `.z80`). Browse raw memory as 1-bit graphics.

### Dump Canvas

A 256×384 pixel canvas showing memory contents rendered as monochrome bitmap.

### Controls

- **Bank** (128K snapshots) — select memory bank 0-7
- **Address** — starting address (0-16383)
- **Navigation:**
  - **< B / B >** — move by 1 byte
  - **< Line / Line >** — move by 1 line
  - **< Row / Row >** — move by 8 lines (1 character row)
  - **< Spr / Spr >** — move by 1 sprite
  - **< Page / Page >** — move by 1 page
- **Width** — display width in bytes (1-8)
- **Height** — display height in rows (1-64)
- **Invert** — invert pixel display
- **Grid** — show grid overlay
- **Char mode** — character-aligned display
- **Zoom** — x1, x2, x3, x4

### Preview

Shows a small preview of the currently highlighted sprite area.

### Grab

Grab sprites from memory view into the sprite list:
- **Grab** button — grab the displayed sprite
- **Mode:** Single sprite, Sprite phases, Singles grid, Phases grid
- Grid options: Size by cell size or count, column/row settings, ordering

![Memory viewer](screenshots/memory_viewer.png)

---

## 21. QR Code Generator

Open from Transform tab → QR Code button.

- **Text or URL** — input field (auto-uppercased for maximum capacity)
- **Size (version):** Auto, or V1 (21×21, 20 letters) through V20 (97×97, 970 letters)
- **Module size:** 1, 2, 3, 4, or 8 pixels
- **Position:** X, Y coordinates
- Click canvas to place the generated QR code

---

## 22. Fullscreen Mode

Press **F11** to toggle fullscreen mode from any tab — viewer or editor.

- **Viewer fullscreen** — shows only the canvas with active display filters; no side panel, no floating palette
- **Editor fullscreen** — shows the canvas with the floating tool palette and preview panel
- **Tab** — toggle the floating palette visibility (editor fullscreen only)
- **Escape** — exit fullscreen

The floating palette includes all drawing tools, selection/clipboard tools, color palette, and Bright toggle. It is only shown when fullscreen is entered from the Edit tab.

---

## 23. Keyboard Shortcuts Reference

### Viewer

| Key | Action |
|-----|--------|
| 1-5 | Set zoom level |
| Ctrl+Wheel | Zoom in/out |
| Arrows | Pan canvas when zoomed |
| F | Toggle flash animation |
| G | Cycle grid size (None/8/16/24px) |
| ~ | Toggle preview panel |
| Space | Play/Pause (SCA animation) |
| Left/Right | Prev/Next frame (SCA) |
| F11 | Toggle fullscreen mode |
| Escape | Exit fullscreen |

### Editor — Tools

| Key | Action |
|-----|--------|
| P | Pixel tool |
| L | Line tool |
| R | Rectangle tool |
| O | Circle/Ellipse tool |
| G | Airbrush tool |
| D | Gradient (dithered) tool |
| I | Flood fill tool |
| C | Fill cell tool |
| A | Recolor (attribute only) |
| E | Eraser tool |
| T | Text tool |
| K | Color Picker tool |
| S | Select tool |

### Editor — Drawing

| Key | Action |
|-----|--------|
| Left click | Draw with ink |
| Right click | Draw with paper (erase) |
| Alt+click | Eyedropper (pick ink+paper from cell) |
| B | Toggle bright |
| F | Toggle flash attribute |
| X | Swap ink/paper colors |
| [ / ] | Decrease/Increase brush size |
| ` (backtick) | Toggle brush preview mode |

### Editor — Editing

| Key | Action |
|-----|--------|
| Ctrl+C | Copy selection |
| Ctrl+X | Cut selection (copy + erase) |
| Ctrl+V | Paste |
| R / H / V | Rotate/Flip clipboard (while pasting) |
| N | Invert selection (swap ink ↔ paper) |
| Ctrl+Z | Undo (up to 32 levels) |
| Ctrl+Y | Redo |
| Ctrl+S | Save |
| F11 | Toggle fullscreen mode |
| Tab | Toggle floating palette (fullscreen) |
| Escape | Cancel selection/paste, exit fullscreen |

### Shape Modifiers (Rectangle, Circle/Ellipse)

| Key | Action |
|-----|--------|
| Ctrl | Constrain to square/circle (1:1 ratio) |
| Alt | Draw from center instead of corner |
| Ctrl+Alt | Square/circle from center |

### Custom Brushes

| Action | Effect |
|--------|--------|
| Click slot | Select (empty starts capture) |
| Shift+click | Capture from screen |
| Ctrl+click | Clear slot |

### Mouse

| Action | Effect |
|--------|--------|
| Drag | Pan canvas (when zoomed, in viewer mode) |
| Drop file | Load image |

> **Note:** Keyboard shortcuts work with any keyboard layout (Russian, German, etc.) — they are based on physical key position.

---

## 24. Supported Formats Reference

### Editable Formats

| Extension | Size | Description |
|-----------|------|-------------|
| .scr | 6912 bytes | Standard screen (bitmap + attributes) |
| .scr | 6976 bytes | ULA+ (64-color palette) |
| .scr | 6945–7426 bytes | ULANext (Next extended palette, up to 256 colors) |
| .scr | 6144 bytes | Monochrome full |
| .scr | 4096 bytes | Monochrome 2/3 |
| .scr | 2048 bytes | Monochrome 1/3 |
| .53c / .atr | 768 bytes | Attributes only |
| .bsc | 11136 bytes | Border screen |
| .bsp | variable | Border screen with header (70-byte header, screen/gigascreen ± border) |
| .ifl | 9216 bytes | 8×2 multicolor |
| .mlt / .mc | 12288 bytes | 8×1 multicolor |
| .bmc4 | 11904 bytes | 8×4 multicolor + border |
| .3 | 18432 bytes | Tricolor RGB |
| .img | 13824 bytes | Gigascreen (2×SCR) |
| .hlr | 1536 bytes | High Lores (32×24 fat pixels, gigascreen) |
| .stl | 3072 bytes | Stellar (64×48 fat pixels, multicolor gigascreen) |
| .sca | variable | Animation (full/attr-only frames) |
| .specscii | variable | Text mode (32×24 chars + OVER layers) |
| .ch$ / .chr$ / .ch- | variable | Character array (interleaved 8×8 cells) |
| .zxp | variable | ZX-Paintbrush (variable-size, ULA or ULA+ palette) |
| .btile | variable | Nirvana btile (variable-size, 8×2 multicolor) |
| .wtile | variable | Nirvana wtile (variable-size, 8×2 multicolor) |
| .nxi | 49664 bytes | ZX Next Layer 2 256×192 + embedded RGB333 palette (256-color indexed) |
| .nxi | 82432 bytes | ZX Next Layer 2 320×256 + embedded RGB333 palette (256-color, column-major) |
| .nxi | 81952 bytes | ZX Next Layer 2 640×256 + embedded RGB333 palette (16-color, 4bpp column-major) |
| .sl2 | 49152/49280 bytes | ZX Next Layer 2 256×192, default RGB332 palette (256-color indexed) |
| .sl2 | 81920 bytes | ZX Next Layer 2 320×256 or 640×256 (disambiguation dialog) |

### View-Only Formats

| Extension | Size | Description |
|-----------|------|-------------|
| .zip | var | Archive (auto-extract, select file from list) |

### Import (Convert to ZX Spectrum)

`.png`, `.gif`, `.jpg`, `.jpeg`, `.webp`, `.bmp` — via the Image Import dialog with dithering and adjustments. Multi-frame animated GIFs can be imported as static picture, flash SCR (2-frame), or SCA animation via the mode dropdown.

### Nirvana Tile Formats

`.btile` and `.wtile` are now fully editable (see Editable Formats above). They can also be imported to IFL + spriteset.

### Snapshot Formats (for Memory Viewer)

| Extension | Description |
|-----------|-------------|
| .sna | SNA snapshot |
| .z80 | Z80 snapshot |

### Project Formats

| Extension | Description |
|-----------|-------------|
| .slp | Project with layers |
| .slw | Workspace (multiple pictures) |
| .slb | Custom brush set |
| .slbc | Barcode brush set |
| .sls | Sprite sheet |
