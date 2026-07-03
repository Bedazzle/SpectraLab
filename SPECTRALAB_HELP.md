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
`.scr`, `.rcs`, `.53c`, `.atr`, `.bsc`, `.bsp`, `.bmc4`, `.ifl`, `.mlt`, `.mc`, `.3`, `.img`, `.ga`, `.gap`, `.hlr`, `.stl`, `.nxi`, `.sl2`, `.specscii`, `.sca`, `.btile`, `.wtile`, `.ch$`, `.chr$`, `.ch-`, `.zxp`, `.slp`, `.slw`, `.sna`, `.z80`, `.zip`, `.png`, `.gif`, `.jpg`, `.jpeg`, `.webp`, `.bmp`

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
| Gigaattr | .ga | 256×192, shared bitmap + two attribute frames |
| Gigaattr pattern | .ga | 32×24 cells, pattern fill + two attribute frames |
| Gigaattr+ULA+ | .gap | 256×192, shared bitmap + two attribute frames + ULA+ palette |
| Gigaattr+ULA+ pattern | .gap | 32×24 cells, pattern fill + two attribute frames + ULA+ palette |
| Monochrome | .scr | 256×192, bitmap only (ink auto-adjusted if ink=paper) |
| Monochrome 2/3 | .scr | 256×128, bitmap only (ink auto-adjusted if ink=paper) |
| Monochrome 1/3 | .scr | 256×64, bitmap only (ink auto-adjusted if ink=paper) |
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

### Rotate

Select display rotation from the **Rotate** dropdown (next to Zoom): **0°, 90°, 180°, 270°**. This is a purely visual CSS rotation — all drawing tools, format renderers, load/save operations, and PNG export remain unaffected. Mouse coordinates are automatically inverse-mapped so pencil, brush, flood fill, and all other editor tools work correctly at any angle. The editor preview panel rotates to match. The setting persists across sessions via localStorage.

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

Click the 📂 button next to the dropdown to load a custom palette from a text file (`.txt`, `.pal`, `.csv`). The file should contain 15 or 16 lines, one color per line (indices 0-7 = regular, 8-15 = bright). If 15 colors are provided, black (#000000) is automatically prepended as index 0. Each line can be `#RRGGBB` hex, `RRGGBB` hex (without `#`), `#AARRGGBB` or `AARRGGBB` (alpha is ignored), or three space/comma-separated decimal `R G B` values (0-255). Lines starting with `;` or `//` and blank lines are treated as comments and skipped. The loaded palette appears as "Custom (loaded)" in the dropdown. It is not persisted — page reload reverts to the default palette.

#### Toggles
- **Flash** — enable/disable flash animation (also toggle with **F** key)
- **Attrs** — show/hide attribute overlay. When attributes are off, the bitmap is displayed as black ink on white paper (1 bits = black, 0 bits = white)
- **Preview** — show/hide preview panel (also toggle with **~** key)

### Grid (collapsible)

Click the "Grid" header to expand/collapse.

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
For `.img` gigascreen, `.ga` gigaattr, `.gap` gigaattr+ULA+, `.hlr` (High Lores), and `.stl` (Stellar) formats, select display mode:
- **Blend dark** — simulates perceived brightness on real CRT, accounting for vertical retrace blanking
- **Blend** — blended view of both frames at full brightness
- **Emulate flicker** — alternating frame display to simulate real hardware

#### Gigascreen Edit Mode
When a Gigascreen-family format is loaded, a mode selector appears in the editor sidebar:
- **Gigascreen** (default) — combined editing with the virtual 136-color palette. Drawing affects both frames simultaneously
- **Screen 1** — shows frame 1 only on the main canvas with the standard 16-color ZX palette. Drawing affects only frame 1
- **Screen 2** — shows frame 2 only on the main canvas with the standard 16-color ZX palette. Drawing affects only frame 2

In Screen 1/Screen 2 mode, the floating preview always shows the blended Gigascreen result, so you can see how per-frame edits affect the combined picture. All tools (pencil, line, fill, color picker, copy/paste, clear, undo/redo) work in split mode. The mode resets to Gigascreen on file or format change.

Keyboard shortcuts: **Alt+1** = Screen 1, **Alt+2** = Screen 2, **Alt+3** = Gigascreen (combined).

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

### File Info (collapsible)

Displays information about the loaded file:
- **Name** — file name
- **Size** — file size in bytes
- **Format** — detected format
- **Dimensions** — pixel dimensions
- **Colors used** — number of distinct colors in the picture. For attribute formats (SCR, IFL, MLT, BMC4, GMX, etc.): counts distinct attribute byte values (each unique ink+paper+bright+flash combination). For NXI/SL2 and LoRes: counts distinct palette indices. Updates live during editing.
- **Hidden cells** — number of cells where ink equals paper but bitmap is not all 0x00 or all 0xFF, indicating invisible pixel data. Shown for formats with editable bitmaps. Not shown for attribute-only formats with fixed bitmaps (GMX 160, HLR, 53c, STL). Updates live during editing.
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
| Cell Invert | J | Swap ink↔paper + invert bitmap (colors unchanged, polarity flips). Left-click: single cell (drag to paint). Right-click: invert all cells with the same attribute |
| Dither Brush | W | Re-dither cells with a different algorithm. Settings: method, round brush diameter (3–16 px), strength. Shift+W re-dithers the current selection |
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
- **Sort by usage** — physically reorders palette entries so used colors come first (sorted by pixel frequency, descending), followed by unused colors. Pixel indices are remapped to keep the image unchanged. Undoable with Ctrl+Z.
- **Save palette** — export palette file
- **Load palette** — import palette file

**Palette and saving:** NXI files embed the palette in the file header — palette changes are always saved. SL2 files with a non-default palette automatically embed the palette after the pixel data on save (producing larger files: 49664, 82432, or 81952 bytes); files with the default RGB332 palette are saved as raw pixels only. LoRes (SLR) and Radastan (RAD without embedded palette) do not store the palette in the file. If you edit palette colors in these formats, a warning will appear on save because custom colors will be lost on reload (the default palette will be used instead). Radastan files that were loaded with an embedded palette (6160-byte GRB332 or 6176-byte RGB333) preserve the palette on save.

### Gigascreen Palette

Shown for Gigascreen, Gigaattr, Gigaattr+ULA+, HLR, and STL formats in **Gigascreen** edit mode. A 16-column grid displays all virtual colors created by two-frame alternation.

- Left click = select ink
- Right click = select paper
- **Cell Colors** section shows the 4 available colors per cell
  - **L** = Left mouse button color
  - **R** = Right mouse button color

**CLUT page tabs** (dual-palette GAP only): when editing a GAP file with dual palettes in Gigascreen mode, the 1024-entry ink and paper grids are split into 4 pages of 256 entries each. Buttons **0–3** switch between CLUT pages (0 = bright=0/flash=0, 1 = bright=1/flash=0, 2 = bright=0/flash=1, 3 = bright=1/flash=1). Each page shows 8 frame 1 inks from one CLUT × all 32 frame 2 colors. Standard gigascreen (136 entries) has no pagination.

**Paper color strip** (dual-palette GAP only): a separate "PAPER COLORS" grid appears below the ink palette grid, showing all cross-blended paper colors from both palettes. Click a paper swatch to set the paper color. Ink and paper selections are independent — the ink grid controls ink, the paper strip controls paper. The Ink/Paper preview swatches at the top show the actual blended colors for each.

When switched to **Screen 1** or **Screen 2** mode, the standard 16-color ZX Spectrum palette is shown instead, allowing direct per-frame attribute editing with ink, paper, bright, and flash controls.

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
- **Save INVERSE codes** (checkbox) — controls how inverted cells are written to the `.specscii` stream. When **off** (default), inverted cells are baked in by swapping ink/paper — visually identical and compatible with viewers (e.g. the ZXArt online viewer) that don't support the `INVERSE` (`0x14`) control code, which would otherwise render a black screen. When **on**, `INVERSE` control codes are written into the stream (smaller for heavily inverted pictures, and preserves the inverse flag on reload). Applies to save and `.tap` export, single- and multi-layer. Setting persists via localStorage
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
- **Lossless**: SCR ↔ ATTR, SCR ↔ BSC ↔ BSP, SCR ↔ ULA+, GA ↔ GAP (add/strip ULA+ palette), NXI ↔ SL2 (all modes: 256×192, 320×256, 640×256). NXI → SL2 with a custom palette shows a dialog: keep palette (embed in SL2), quantize to default RGB332 (lossy), or strip palette (keep indices unchanged)
- **GAP palette toggle**: GAP shared palette → GAP dual palette (duplicates palette 1 into palette 2, enabling independent per-frame palettes); GAP dual palette → GAP shared palette (discards palette 2). No format change — only the palette count changes. Gigascreen ↔ GAP conversion also available (strips/adds palette + independent bitmaps)
- **53c → GA/GAP pattern**: converts ATTR (.53c) to pattern-based GA or GAP. Three options: "GA (Gigaattr pattern)", "GAP (Gigaattr+ULA+ pattern, shared)", "GAP (Gigaattr+ULA+ dual pattern)". Opens a combined settings dialog with: fill pattern grid (thumbnails of all available patterns), border color 1 and border color 2 selectors (8 ZX colors). For GAP variants, a default ULA+ palette is generated automatically. Output is a compact file (1546/1610/1674 bytes) with the selected pattern tile instead of a full bitmap
- **Lossy (render + re-quantize)**: SCR/ULA+ → NXI 320×256/640×256, NXI/SL2 cross-mode (256↔320↔640), NXI/SL2 → SCR
- **Character match**: SCR → SPECSCII — matches each 8×8 cell bitmap to the best ROM font character or block graphic, preserving brightness and flash; tries both normal and inverted (ink/paper swap) matching; hidden pixels (ink == paper) are matched to the best glyph so the bitmap pattern is preserved for editing

### Export

- **Export format** dropdown — select the export format (available options depend on the loaded format)
- **Embed** checkbox — embed data as DB lines in ASM output (unchecked = use INCBIN references)
- **Export** button — export to the selected format
- **PNG/GIF** button — export the current screen to PNG or animated GIF image
  - Uses all current View tab settings: zoom, border size/color, grid/subgrid, palette, filters
  - For gigascreen-family formats (Gigascreen, Gigaattr, Gigaattr+ULA+, MGH, HLR, STL, BSP-gigascreen, chr$-gigascreen): a dialog lets you choose **Blended** (averaged colors → PNG) or **Flicker** (two alternating frames → animated GIF at ~50fps)
  - For pictures with flash attributes: a dialog lets you choose **Animated GIF** (two-frame flash animation at 320ms per phase) or **Static PNG** (normal phase only)
  - For all other formats: exports directly as PNG

### RCS Export

For **SCR** format, the Export dropdown includes `.rcs (RCS reordered)` — exports the screen in [RCS (Re-ordered Compressed Screen)](https://github.com/einar-saukas/RCS) layout by Einar Saukas. The 6144 bitmap bytes are reordered using S→C→R→L nesting (sector → column → character row → pixel line) to group spatially related bytes together, producing significantly better compression ratios with packers like ZX7. The 768 attribute bytes are appended unchanged. Output: 6912-byte `.rcs` file.

RCS files can also be opened directly — the reordering is automatically reversed on load, converting back to standard SCR for viewing and editing.

### ZX7 / ZX0 Compression

For **SCR** format, the Export dropdown includes built-in [ZX7](https://spectrumcomputing.co.uk/entry/27996/ZX-Spectrum/ZX7) and [ZX0](https://github.com/einar-saukas/ZX0) (v2 format) compression options by Einar Saukas:

- **`.rcs.zx0 (RCS + ZX0)`** — applies RCS reordering first, then ZX0 compression
- **`.rcs.zx7 (RCS + ZX7)`** — applies RCS reordering first, then ZX7 compression
- **`.scr.lgk (LgK compressed)`** — compresses the screen data with LgK v1.1rs (tile-based XOR prediction with Huffman-coded transform modes, attribute RLE with palette optimization; 612-byte depacker)
- **`.scr.asc (ASC compressed)`** — compresses the screen data with ASC v2.9 (LZSS + RLE over an 8×8-character-cell reorder of the bitmap; self-extracting block with a 194-byte depacker stub). The saved file is the token stream; the stub is added by the ASM export and accounted for in the Compare "Total" column
- **`.scr.lc (LC compressed)`** — compresses the screen data with Laser Compact 5.2.1 (includes LCMP5 header; reordering and segment handling are built-in)
- **`.scr.c4 (Chunks 4×4)`** — lossy monochrome compression: divides each 8×8 cell into four 4×4 quadrants, encodes each as a 2-bit index into a 4-pattern dictionary. Fixed output: 841 bytes (768B encoded + 64B lookup table + 8B dictionary + 1B mode). Very fast Z80 depacker using nibble-pair lookup
- **`.scr.c2 (Chunks 4×2)`** — lossy monochrome compression: divides each 8×8 cell into eight 4×2 strips, encodes each as a 2-bit index. Fixed output: 1573 bytes (1536B encoded + 32B lookup table + 4B dictionary + 1B mode). Better quality than 4×4, still fast Z80 depacker
- **`.scr.lzf (ZXSC / LZF)`** — compresses the screen data with LZF (standard linear mode, 49-byte depacker)
- **`.scr.lzf (ZXSC screen-scan)`** — compresses using non-linear cell-scan reordering (attribute + 8 pixel rows per cell, top-left to bottom-right) then LZF. Produces visually pleasing decompression on the ZX Spectrum (80-byte depacker)
- **`.scr.rle (RLE compressed)`** — compresses the screen data with PackBits-style RLE (23-byte depacker, fast decompression)
- **`.scr.upk (upkr level 1)`** — compresses the screen data with upkr (rANS entropy coding, Z80 settings, fast compression)
- **`.scr.upk (upkr level 9)`** — compresses the screen data with upkr (rANS entropy coding, Z80 settings, best compression)
- **`.scr.zx0 (ZX0 compressed)`** — compresses the screen data with ZX0 (forward mode)
- **`.scr.zx7 (ZX7 compressed)`** — compresses the screen data with ZX7 (forward mode)
- **`Compare compressions...`** — opens a dialog showing compression variants side-by-side:
  - Plain SCR (6912 bytes, uncompressed baseline)
  - ZX7 / ZX7 backwards
  - RCS + ZX7 / RCS + ZX7 backwards
  - ZX0 / ZX0 backwards
  - RCS + ZX0 / RCS + ZX0 backwards
  - LgK / LgK (opt)
  - ASC (ASC v2.9, LZSS + RLE)
  - LC (Laser Compact 5.2.1)
  - upkr level 1 / upkr level 9
  - RLE
  - ZXSC (linear LZF) / ZXSC screen (cell-scan LZF)
  - Chunks 4×4 / Chunks 4×2 (lossy)

  The dialog opens with an empty table (all sizes shown as "—"). Click the **Compare** button to run compressions — results appear one by one, the best variant is highlighted and pre-selected. The dialog stays open after saving, so you can export multiple formats without re-running compression.

  **⚙ Format settings** (gear icon in the title bar) — toggle a settings panel to enable/disable format families (ZX7, ZX0, RCS variants, LgK, ASC, LC, upkr, RLE, ZXSC, Chunks). Disabled formats are excluded from the comparison table. The upkr depacker variant can be switched between Compact (130B code + 320B probs = 450B total) and Fast (155B code + 320B probs = 475B total, unrolled multiply loop). All settings are saved to localStorage and persist across sessions.

  **Data** dropdown — selects which portion of screen data to compress:
  - **Full SCR** (default) — full 6912 bytes (bitmap + attributes)
  - **Bitmap only** — 6144 bytes (bitmap without attributes)

  **Segment** dropdown (enabled only when Data = "Bitmap only") — selects a bitmap segment:
  - **Whole** — all 6144 bitmap bytes
  - **Third 1 / 2 / 3** — individual 2048-byte thirds of the bitmap
  - **Thirds 1+2 / 2+3** — two consecutive thirds (4096 bytes)

  RCS variants are only shown when Segment is "Whole" (RCS reorders the full 6144 bitmap; slicing after reorder is meaningless). For segment slices, only plain + ZX7/ZX0 forward/backward rows are shown.

  **Clean hidden cells** checkbox — when enabled, hidden cells (ink === paper with non-trivial bitmap) are cleaned on a temporary working copy before compression, using neighbor bitmap density to decide fill value. The original image is not modified.

  **Optimize attributes** checkbox — when enabled, ink/paper are swapped and bitmap inverted in cells where set bits exceed clear bits ("minimize ink bits" mode) on the same temporary copy. Both optimizations can be combined; toggling either checkbox resets the table to "—" (stale results).

  Changing any option (Data, Segment, checkboxes) resets the table — click Compare again to re-run.

  **Depacker** column — shows the Z80 depacker size in bytes for each method, including code and any required buffer: ZX7 forward/backward = 69 bytes, ZX0 forward = 68, ZX0 backward = 69. RCS variants use [smart integrated decoders](https://github.com/einar-saukas/RCS) that decompress and decode directly to screen without a temp buffer: RCS+ZX7 = 110, RCS+ZX7 backwards = 110, RCS+ZX0 = 112, RCS+ZX0 backwards = 113. LgK = 612 bytes (self-modifying depacker, decompresses directly to screen). LC = 209 bytes (decompresses directly to screen, no extra buffer). upkr = 450 bytes (130 code + 320-byte probs array). RLE = 23 bytes. ZXSC = 49 bytes (standard) / 80 bytes (screen-scan). Chunks 4×4 = 139 bytes (75 code + 64-byte lookup table), Chunks 4×2 = 97 bytes (65 code + 32-byte lookup table). Plain row has no depacker.

  **Total** column — shows real saving: saved bytes minus depacker overhead (saved − depacker). A positive value means compression is beneficial even accounting for the depacker. A negative value (highlighted in red) means the compressed data plus depacker exceeds the original size. For lossy Chunks variants, the "saved" value reflects size reduction only — bitmap quality is approximate. The upkr depacker variant can be switched between Compact (130B code + 320B probs = 450B total) and Fast (155B code + 320B probs = 475B total, unrolled multiply loop). All settings are saved to localStorage and persist across sessions.

  **Data** dropdown — selects which portion of screen data to compress:
  - **Full SCR** (default) — full 6912 bytes (bitmap + attributes)
  - **Bitmap only** — 6144 bytes (bitmap without attributes)

  **Segment** dropdown (enabled only when Data = "Bitmap only") — selects a bitmap segment:
  - **Whole** — all 6144 bitmap bytes
  - **Third 1 / 2 / 3** — individual 2048-byte thirds of the bitmap
  - **Thirds 1+2 / 2+3** — two consecutive thirds (4096 bytes)

  RCS variants are only shown when Segment is "Whole" (RCS reorders the full 6144 bitmap; slicing after reorder is meaningless). For segment slices, only plain + ZX7/ZX0 forward/backward rows are shown.

  **Clean hidden cells** checkbox — when enabled, hidden cells (ink === paper with non-trivial bitmap) are cleaned on a temporary working copy before compression, using neighbor bitmap density to decide fill value. The original image is not modified.

  **Optimize attributes** checkbox — when enabled, ink/paper are swapped and bitmap inverted in cells where set bits exceed clear bits ("minimize ink bits" mode) on the same temporary copy. Both optimizations can be combined; toggling either checkbox resets the table to "—" (stale results).

  Changing any option (Data, Segment, checkboxes) resets the table — click Compare again to re-run.

  **Depacker** column — shows the Z80 depacker size in bytes for each method, including code and any required buffer: ZX7 forward/backward = 69 bytes, ZX0 forward = 68, ZX0 backward = 69. RCS variants use [smart integrated decoders](https://github.com/einar-saukas/RCS) that decompress and decode directly to screen without a temp buffer: RCS+ZX7 = 110, RCS+ZX7 backwards = 110, RCS+ZX0 = 112, RCS+ZX0 backwards = 113. LgK = 612 bytes (self-modifying depacker, decompresses directly to screen). LC = 209 bytes (decompresses directly to screen, no extra buffer). upkr = 450 bytes (130 code + 320-byte probs array). RLE = 23 bytes. ZXSC = 49 bytes (standard) / 80 bytes (screen-scan). Chunks 4×4 = 139 bytes (75 code + 64-byte lookup table), Chunks 4×2 = 97 bytes (65 code + 32-byte lookup table). Plain row has no depacker.

  **Total** column — shows real saving: saved bytes minus depacker overhead (saved − depacker). A positive value means compression is beneficial even accounting for the depacker. A negative value (highlighted in red) means the compressed data plus depacker exceeds the original size.

**Create ASM** checkbox — when enabled, saving also generates a sjasmplus `.asm` file alongside the compressed data. ASM generation is only available for Full SCR + Whole mode. The ASM file is a complete working example: it decompresses the data directly to screen memory at `$4000`, includes the appropriate ZX7, ZX0, LgK, ASC, LC, or upkr decompressor (forward or backward where applicable) and RCS-to-SCR reorder routine where needed, uses `device zxspectrum48` and `savesna` to produce a `.sna` snapshot. The LgK variant uses the self-modifying depacker by Lethargeek which decompresses directly to screen (HL=compressed data). The ASC variant emits the 194-byte self-extracting stub inline followed by the token stream — the stub self-locates and paints the screen to `$4000`, so it is simply `call`ed with no input registers. The LC variant uses the Laser Compact 5.2 depacker by Hrumer which decompresses LCMP5-headered data directly to screen. The upkr variant uses the Z80 unpacker by Peter Helcmanovsky (IX=packed data, DE'=destination via EXX).

Forward-compressed files use `.zx7`/`.zx0` extensions, backward-compressed use `.zx7b`/`.zx0b`. LgK compressed files use `.lgk` extension. ASC compressed files use `.asc` extension. LC compressed files use `.lc` extension. upkr compressed files use `.upk` extension. All variants can be opened directly — decompression (and RCS reordering reversal where needed) is automatic on load.

### Format ASM Export

The Export dropdown generates self-contained sjasmplus-compatible ASM source files that display the loaded picture on real hardware. Each export produces a complete viewer program — just assemble and run.

Available format exports:

| Format | Export option | Target | Output |
|--------|-------------|--------|--------|
| BSC | ASM (Pentagon border) | Pentagon 128K | .sna — cycle-exact border color effects |
| Gigascreen / MGH | ASM (Pentagon dual-screen) | Pentagon 128K | .sna — alternating screen banks |
| Gigaattr | ASM (48K attr flicker) | ZX Spectrum 48K | .sna — LDIR bitmap once, alternate attrs each frame |
| Gigaattr+ULA+ | ASM (48K ULA+ flicker) | ZX Spectrum 48K + ULA+ | .sna — ULA+ palette programming + attr flicker (shared: program once; dual: reprogram each frame) |
| RGB3 | ASM (Pentagon RGB flicker) | Pentagon 128K | .sna — RGB channel flicker |
| IFL | ASM (Pentagon 8x2 multicolor) | Pentagon 128K | .sna — 8×2 multicolor display |
| ULA+ | ASM (ULA+ palette) | ZX Spectrum 48K + ULA+ | .sna — 64-entry palette programming |
| NXI / SL2 | ASM (Next Layer 2 .nex) | ZX Spectrum Next | .nex — Layer 2 with palette, all modes (256×192, 320×256, 640×256) |

- **Embed** checkbox controls whether pixel data is included as DB lines (embedded) or as INCBIN references to the original file. Palette data is always embedded (small size). For RGB3, data is always embedded.
- All exports target the **sjasmplus** assembler. Pentagon exports produce .sna snapshots; Next Layer 2 exports produce .nex files via SAVENEX.

### Optimize Attributes

Available for **SCR** format only. Automatically flips ink↔paper and inverts bitmap bits in 8×8 cells where the current assignment is suboptimal. The displayed colors remain identical — only the bitmap polarity and ink/paper roles change. Cells with ink == paper or flash are skipped.

Four modes:

| Mode | Rule | Best for |
|------|------|----------|
| Paper = lighter color | Flip if paper is darker than ink (by luminance) | Natural look — paper is always the lighter background |
| Paper = majority pixels | Flip if more than half the pixels are ink (set bits) | Reducing ink density — more white space in bitmap |
| Combined | Flip if paper is darker, or if equal brightness and ink is majority | General cleanup — covers both brightness and density |
| Minimize ink bits | Flip if set bits > clear bits | Best compression — fewer 1-bits means better RLE/LZ ratios |

The info label shows how many cells were flipped. The operation is undoable (Ctrl+Z).

### Clean Hidden Cells

Available for formats with both bitmap and attributes: **SCR**, **BSC**, **IFL**, **MLT**, **BMC4**, **GMX**, **Gigascreen**, **ULA+**. Hidden for attribute-only formats (GMX 160, HLR, 53c, STL, SPECSCII) and formats without attributes.

A "hidden cell" is one where ink equals paper but the bitmap is not uniform (not all-0x00 or all-0xFF). The pixel pattern is invisible on screen because both colors are the same, but it wastes bytes and inflates compressed size.

Click **Apply** to clean all hidden cells. For each hidden cell, the tool examines the bitmap density of the four neighbor cells (up, down, left, right):
- If the majority of neighbor bitmap bits are set → fill with 0xFF
- Otherwise → fill with 0x00
- If no neighbors exist (corner/edge with no valid neighbors) → fill with 0x00

This preserves visual continuity with surrounding cells. The info label shows how many cells were cleaned. The operation is undoable (Ctrl+Z). The File Info "Hidden cells" counter updates after cleaning.

### Clipboard

| Button | Key | Description |
|--------|-----|-------------|
| Select | S | Select rectangular area on canvas |
| Cut | Ctrl+X | Cut selection (copy + erase) |
| Paste | Ctrl+V | Paste clipboard content |
| Invert | N | Invert selection (swap ink ↔ paper) |
| Re-dither | Shift+W | Re-dither selection with current dither brush method |
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
- Two-row color palette: top row = 8 normal colors, bottom row = 8 bright colors
- Left-click a swatch to set ink, right-click to set paper
- Clicking a color in either row sets the bright flag to that row, keeping ink and paper in the same brightness
- Colors follow the **Palette** selection on the View tab — changing the display palette updates both the swatches and the sprite canvas rendering in real time

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
- **Picture** — import the currently previewed frame as a static picture using selected format/dithering/adjustments
- **Flash** (2-frame GIFs only) — convert both frames into a single SCR with FLASH attributes. Cells that differ between frames use the FLASH bit (0x80) to alternate ink↔paper every 320ms; identical cells remain static
- **Animation** — convert all frames to SCA animation. Per-frame delays from the GIF are preserved (converted to SCA 20ms units). After import, the full SCA editor is available (filmstrip, playback, trim, delay editing, optimize, export). The output format depends on the **Format** dropdown:
  - Any format except 53c and Chunks → SCA type 0 (full SCR frames, 6912 bytes per frame)
  - **53c** → SCA type 1 (attribute-only frames, 768 bytes per frame + embedded fill pattern). The pattern is taken from the **53c Pattern** selector (Checker, Stripes, DD/77, or Custom)
  - **Chunks 4×4** or **Chunks 4×2** → SCA type 2 (chunks-compressed monochrome frames). Each frame is dithered to monochrome and compressed using the static 4-pattern dictionary. Per-frame encoded size depends on the region (e.g. 768 bytes for 4×4 full screen, 256 for a single third) — no codebook stored per frame

### Layout

The dialog shows two canvases side by side:
- **ORIGINAL** — the source image with a zoom dropdown (Fit, x1–x4) and a **Grid** checkbox to overlay an 8×8 pixel grid within the crop rectangle. Fit scales to fill available space up to x2.
- **PREVIEW** — the dithered ZX Spectrum result with a zoom dropdown (Fit, x1–x5, default x2) and a **Grid** checkbox to overlay the 8×8 attribute grid.

Both canvases show scrollbars when the zoomed image exceeds the available space.

### Image Tab

#### Source

Crop the source image:
- **X, Y, W, H** — crop rectangle
- **Reset** — reset to original size
- **Full** — use full image
- **Detect** — auto-detect 256×192 region
- **4:3** — lock aspect ratio to 4:3
- **Colors** dropdown — select color space for perceptual matching: **RGB** (weighted Euclidean), **LAB** (CIE76 Delta E), or **OkLab** (default; Björn Ottosson 2020, more uniform for blues/purples). Disabled when Mono output is active
- **Pair fit** dropdown — select the strategy for choosing the best ink/paper color pair per cell/block:
  - **Best fit** — exhaustive search over all palette pairs, selecting the pair that minimizes total per-pixel nearest-color distance. The original default algorithm
  - **Blend fit** — evaluates each pair by projecting every pixel onto the ink–paper line segment and measuring perpendicular distance. Better models how dithering blends between two colors, often producing smoother results
  - **PCA gradient** — uses Principal Component Analysis to find the dominant color axis in each cell, then tests the top palette matches near the axis extremes using the line-projection metric. Good for cells with a clear color gradient
  - Works with all ZX block sizes (8×8, 8×2, 8×1, 8×4) and ULA+. Hidden for non-ink/paper formats (NXI, SL2, LoRes). Disabled when Mono output is active
- **Grayscale** — convert to grayscale before processing
- **Mono output** — output black and white only (ink 0, paper 7, bright). Works with all formats: SCR, IFL, MLT, BSC, BMC4, GMX, Gigascreen, Gigaattr, GAP, HLR, STL, RGB3, ULA+, GMX 160×200, 53c, SPECSCII, NXI, SL2, LoRes, Radastan, ZXP

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
  - **Pre-blur** slider (0–50) — blurs cell/block pixels before color pair selection to stabilize attribute colors on noisy or detailed images. Uses 3-pass separable box blur (Gaussian approximation) with edge clamping. Higher values produce more uniform attribute colors. The bitmap is always generated from original (unblurred) pixels, so pixel detail remains sharp. Works with all ZX block sizes: 8×8 (SCR), 8×2 (IFL), 8×1 (MLT), 8×4 (BMC4).
  - **Dizzy** dither (Liam Appelbe, 2023) — error diffusion with a dynamic denominator: per pixel, the algorithm sums weights of in-bounds *unprocessed* neighbors (orthogonal = 1.0, diagonal = 0.1) and distributes `error × weight / denom` proportionally. No error is lost at image edges; produces blue-noise-like patterns.
  - **a-dither** (arithmetic dither, FFmpeg formula `((x + y·236) · 119) & 0xff`) — hash-based per-pixel threshold. Spatially stable, blue-noise-like, no lookup table.

- **Dither Regions** (**Dither** tab) — draw lasso regions on the source or preview canvas to assign a different dithering algorithm and strength to each area. Up to 3 color-coded regions (red, green, blue), each with its own dithering method dropdown and **strength slider** (0–100%). Last used methods and strengths are saved to localStorage (defaults: Floyd-Steinberg, Ordered 2×2, Riemersma; all at 100%). Controls:
  - **Region radios** (1/2/3) — select which region to draw. Each has a color swatch, method dropdown, and strength slider.
  - **Strength slider** (0–100) — controls dither intensity for the region independently of the main Strength slider.
  - **Erase** radio — paint to remove region pixels (revert to default dithering).
  - **Show** dropdown — overlay visibility: Source, Preview, Both, or None. Switching this dropdown only repaints the overlay without re-running conversion.
  - **Clear All** — remove all regions and reset the mask.
  - **Lasso drawing:** switch to the **Dither** tab, then click on the source or preview canvas to place polygon vertices. Double-click or click near the first vertex to close the polygon. Right-click or **Escape** cancels the current polygon. The **Image** tab is for crop manipulation; the **Adjustments** tab is for color/levels; the **Dither** tab enables lasso drawing.
  - During conversion, each cell (for cell-based formats) or pixel (for pixel-based formats) uses the dithering method and strength of its region; unassigned areas use the main Dither dropdown and global Strength slider. If multiple regions overlap a cell, the region with the most pixels in that cell wins. Same method with different strengths produces separate conversion passes.
  - **Performance:** while dragging any adjustment slider, multi-pass region compositing is skipped to keep the preview responsive. The full-quality render with all dither regions runs on slider release.
  - Supported formats: SCR, IFL, MLT, BSC, BMC4, RGB3, Gigascreen/MG, GMX 640, ULA+, MLT+ULA+, ZXP ULA+, NXI (256, 320, 640), SL2 (256, 320, 640), LoRes, LoRes RAD.
  - The mask resets when the format changes or a new image is loaded.

- **Paper color rule** — controls how ink and paper colors are assigned in each cell (not applied to ULA+ format, which uses independent CLUT halves):
  - **Darker color** — default; the darker of the two cell colors becomes paper (per cell, using perceptual luminance). For single-color cells (both ink and paper are the same), the color is checked against a midpoint: dark colors become paper (0 bits), light colors become ink (1 bits)
  - **Lighter color** — the lighter of the two cell colors becomes paper. For single-color cells, the color is checked against a midpoint: light colors become paper (0 bits), dark colors become ink (1 bits)
  - **First pixel paper** — the color of the top-left pixel in each cell becomes paper; useful for spritesheets where a frame pixel marks the background color

#### Output

- **Format:** SCR, ULA+, 53c (attr), IFL (8×2), BMC4 (8×4), MLT (8×1), MLT+ULA+, BSC, BSP, RGB3, Gigascreen, Gigaattr, GAP, GAP Dual, GA Pattern, GAP Pattern, GAP Dual Pattern, HLR, STL, GMX 640×200, GMX 160×200, NXI (256×192, 320×256, 640×256), SL2 (256×192, 320×256, 640×256), SPECSCII, Mono, Mono 2/3, Mono 1/3, LoRes, Radastan, ZXP, chr$, btile (Nirvana 16×16), wtile (Nirvana 24×16)
- **Palette** selector
- **Palette strip** — clickable row of 16 color swatches (8 regular + 8 bright) below the Palette dropdown. Click a swatch to disable that color; disabled colors are marked with a white X cross and excluded from ink/paper pair search in all block sizes and from nearest-color lookup. Minimum 2 colors must remain enabled. Resets on palette or format change. Hidden for non-ZX formats (ULA+, NXI, SL2, LoRes)
- **53c Pattern** (for 53c format): Checker, Stripes, DD/77, Custom. When "Custom" is selected, a hex input field appears where you can enter 8 bytes separated by spaces (e.g. `0F 0F 0F 0F F0 F0 F0 F0`). Each byte defines one row of the 8×8 fill pattern (MSB = leftmost pixel). The custom pattern is used both for single-image 53c import and for animated GIF → SCA type 1 import
- **GA Pattern** (for GA/GAP pattern formats): fill pattern dropdown — select the 8×8 fill pattern tile used for the bitmap. Same presets as HLR (solid, top-bottom, left-right, checker, stripes, diagonal, DD/77, etc.). The pattern is fixed for the entire picture; drawing tools modify only attributes (ink/paper colors)
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
- **Frame navigation** (animated GIFs only) — ◄/► buttons and a slider to preview any individual frame with the current format, dithering, and adjustment settings. The label shows the current frame number and total (e.g. "3 / 48"). Animation mode still imports all frames regardless of which frame is previewed
- **Cancel** / **Import** buttons

![Image import dialog](screenshots/image_import.png)

### A/B Comparison

The import dialog includes an A/B comparison feature for evaluating different conversion settings side by side.

**View buttons** (right side of the tab bar):
- **A** — show slot A preview only (slot A is active for editing)
- **B** — show slot B preview only (slot B is active for editing)
- **A+B** — show both previews side by side; click a panel to select it for editing (highlighted with a blue outline)

**Per-slot settings** — each slot independently stores: dithering method and strength, serpentine scan, format, palette, disabled colors, color space, color strategy, pre-blur, paper rule, all adjustments (contrast, brightness, saturation, gamma, sharpness, smoothing, levels, color balance), grayscale/mono flags, dither region masks, and format-specific options (ULA+ palette, ZXP type, 53c pattern, HLR pattern, chr mode, specscii charset).

**Shared settings** — crop rectangle, fit mode, and alignment affect both slots equally. Changing these re-renders both previews.

**Copy A→B** button — duplicates all settings from the active slot to the other slot. The label updates to reflect the current direction (e.g. "Copy B→A" when B is active).

**Auto-labels** — a concise summary appears below each preview panel showing the key settings for that slot (e.g. "Floyd · SCR · Blend · blur:12 · C:+10").

**Zoom and Grid** — these controls are shared and affect both preview canvases simultaneously.

**Import** — imports the result of the currently active slot (whichever slot's controls are shown in the tabs below).

---

## 19. SCA Animation Editor

The SCA editor opens as a full-screen overlay when editing `.sca` animation files.

### Top Bar

- **← Back** — return to the main view
- **Save As...** — dropdown with export options: SCA, SCR zip, 53c zip, GIF (animated), PNG zip
- **Save** — save in the selected format

When saving as **SCA**, a settings window appears with options:
- **Compression** — select compression for SCA type 2: Uncompressed, ZX0, Laser Compact, or RLE. RLE uses a PackBits-style control-byte format optimized for fast Z80 decompression (~23-byte depacker). Compression ratio is between uncompressed and ZX0/LC, but decompression speed is significantly faster (LDIR for literals, DJNZ for repeats). Chunks 4×4/4×2 animations are always stored as type 2 with chunks compression (no additional compression selection needed)
- **Region** — select which screen thirds to include in type 2 frames: top, middle, bottom, top+middle, middle+bottom, or full screen. Applies to all compression types including Chunks. For Chunks, the encoded data size scales with the region (1 byte per cell for 4×4, 2 bytes per cell for 4×2)
- **ASM (zip)** — export SCA player as sjasmplus assembly source with frame data in a ZIP archive. Supports type 0 (full frames), type 1 (attr-only with fill pattern), and type 2 with chunks compression (embeds the static lookup table and DeChunks depacker). The player selects ROM 1 at startup for 128K compatibility

### Filmstrip

A scrollable strip of frame thumbnails at the top. Click a thumbnail to select that frame. **Ctrl+Click** or **Delete/Backspace** toggles manual deletion on the selected frame. Marked frames show a tooltip with their status (trimmed / manually deleted / duplicate) and a note that they will be excluded from the saved file.

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

## 21. Display Filters

Located in the Tools tab (collapsible section). Click the "Display Filters" header to expand. Check the **On** checkbox to enable post-processing effects.

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

---

## 22. QR Code Generator

Open from Tools tab → QR Code button.

- **Text or URL** — input field (auto-uppercased for maximum capacity)
- **Size (version):** Auto, or V1 (21×21, 20 letters) through V20 (97×97, 970 letters)
- **Module size:** 1, 2, 3, 4, or 8 pixels
- **Position:** X, Y coordinates
- Click canvas to place the generated QR code

---

## 23. Fullscreen Mode

Press **F11** to toggle fullscreen mode from any tab — viewer or editor.

- **Viewer fullscreen** — shows only the canvas with active display filters; no side panel, no floating palette
- **Editor fullscreen** — shows the canvas with the floating tool palette and preview panel
- **Tab** — toggle the floating palette visibility (editor fullscreen only)
- **Escape** — exit fullscreen

The floating palette includes all drawing tools, selection/clipboard tools, color palette, and Bright toggle. It is only shown when fullscreen is entered from the Edit tab.

---

## 24. Keyboard Shortcuts Reference

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
| J | Cell Invert tool |
| W | Dither Brush tool |
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
| Shift+W | Re-dither selection with current dither brush settings |
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

## 25. Font Editor

The Font Editor is a standalone page (`font_editor.html`) for creating and editing ZX Spectrum bitmap fonts. Supports fixed-width 8×8 fonts and FZX proportional fonts. Open it via the **Font** link in the bottom bar of the View tab, or navigate directly to `font_editor.html`.

### Header Controls

- **Load** — open a font file (`.768`, `.ch8`, `.bin`, `.SpecCHR`, `.fnt`, `.fzx`)
- **Save** — context-aware save. The action depends on the current glyph count: 96 glyphs saves `.768` directly; 21 glyphs saves `.udg`; 256 glyphs shows a Normal/Interlaced dialog; 117 glyphs (96+21) offers Single file, Font+UDG, or UDG+Font options; >256 glyphs shows a range export dialog; other counts save `.bin`. FZX fonts save `.fzx` directly.
- **Append** — load a font file and append its glyphs after existing ones (up to 1024 total)
- **New ▾** — create a new font: 96 glyphs, 256 glyphs, custom glyph count (up to 1024), exploded (256 interlaced), or new FZX font
- **?** — show keyboard shortcuts and help
- **Light / Dark** — toggle theme (synced with SpectraLab via `localStorage`)

### Glyph Grid (Left Panel)

Displays all glyphs at 4× zoom in a 16-column grid. Click a glyph to select it for editing. For FZX fonts, the grid uses flexbox layout with variable-width cells.

- Hover tooltip shows glyph index, hex code, and mapped character
- When width mode is not 8, inactive columns are dimmed with a dark overlay
- **Grid** checkbox controls pixel gap rendering in the grid
- **Labels** checkbox shows the mapped character below each glyph in the grid

### Drawing Tools

The toolbar above the editor provides five drawing tools:

| Tool | Button | Key | Left click | Right click |
|------|--------|-----|-----------|-------------|
| Pixel | ✎ | P | Toggle (XOR) | Clear |
| Line | ╱ | L | Draw line (set) | Clear line (erase) |
| Rectangle | ☐ | R | Draw outline | Draw filled |
| Circle | ○ | O | Draw outline | Draw filled |
| Eraser | ⌫ | E | Freehand erase | Erase rectangle area |

**Shape tools** (Line, Rectangle, Circle): click to set the start point, drag to preview the shape with a semi-transparent overlay, release to commit. Moving the mouse outside the canvas cancels the shape. Right-click Eraser works the same way — drag to select an area, release to clear it.

**Freehand tools** (Pixel, Eraser): click and drag for continuous drawing. The eraser uses Bresenham interpolation between mouse positions for smooth strokes without gaps.

All tools work in both regular (8×8) and FZX modes, and respect active columns, row 0 protection (variable width mode), and the "Whole font" checkbox.

### Pixel Editor (Center Panel)

The selected glyph is shown at large zoom (50× for 8×8, dynamic size for FZX — fits within ~400px). Click or drag to draw with the active tool.

- **Invert** — flip all bits in the glyph (shortcut: **I**)
- **Clear** — set all bits to zero (shortcut: **Delete**)
- **Whole font** checkbox — apply Invert/Clear/transforms and pixel editing to all glyphs at once. In variable width mode, respects per-glyph width boundaries.
- In variable width mode, row 0 (width byte) is protected from editing. The **Hide W** checkbox (default: checked) hides it from the grid, editor, and text sample preview.

### Controls Column (Right of Preview)

- **Glyphs** — set the number of glyphs (1–1024). Works for both fixed-width and FZX fonts. Changing the count preserves existing glyph data and character mapping.
- **→ FZX** / **→ Fixed** — convert the current font between fixed-width and FZX proportional format. Fixed→FZX calculates visual bounding box per glyph, sets width to actual content width, and left-aligns the bitmap. FZX→Fixed clips to 8×8 and applies shift offsets.

### Scroll (Wrap)

Arrow buttons scroll the glyph pixels with wrap-around (shifted-out pixels reappear on the opposite side).

### Transforms

The transform dropdown provides 22 operations, applied to the selected glyph or the whole font:

| Group | Transforms |
|-------|-----------|
| Bold | Bold Right, Bold Left, Bold Down |
| Italic | Italic 1/2/3 Right, Italic 1/2/3 Left |
| Shift (zero-fill) | Shift Right, Left, Up, Down |
| Flip / Rotate | Flip Horizontal, Flip Vertical, Rotate 90° CW, 90° CCW, 180° |
| Align | Align Left, Align Right, Align Top, Align Bottom |

Align transforms shift glyph pixels until the outermost non-empty row or column touches the corresponding edge. Works for both fixed-width and FZX glyphs.

### Width Mode

Select how many bits per glyph row are active:

| Mode | Active bits | Pixel width |
|------|------------|-------------|
| 8 (full) | Bits 7–0 | 8 |
| 6 (left) | Bits 7–2 | 6 |
| 6 (right) | Bits 5–0 | 6 |
| 4 (left) | Bits 7–4 | 4 |
| 4 (right) | Bits 3–0 | 4 |
| Variable | First byte = width | 1–8 |

Inactive columns are dimmed in both the grid and the pixel editor. Switching from 4 (right) or 6 (right) to variable mode sets width bytes to the corresponding value (4 or 6). The **Hide W** checkbox controls visibility of the width byte (row 0) in variable mode.

### Character Mapping

- **Characters** input + **Map** button — map a character string starting at the selected glyph
- **Clear** — remove the mapping for the current width mode
- **From (Cyr) / To (Lat)** — character remapping (e.g., Cyrillic to Latin lookalikes)

### Metrics Export/Import

- **Export .metrics** — save mappings, width mode, remap, and font metadata as JSON
- **Import .metrics** — load a previously exported `.metrics` file

### Text Sample

A live preview of the font rendering three pangram sentences. The text wraps character-by-character to fill the available panel width and reflows on window resize. Each sentence stays on its own line (wrapping within).

- **Zoom** — 1×, 2×, or 3× pixel scale
- **Grid** — show pixel gaps between glyph pixels (when zoom > 1×)
- **Uppercase** — render all text in uppercase
- **Timex** — render with 2:1 pixel aspect ratio (half-width pixels), simulating the Timex hi-res 512×192 display mode

### Copy / Paste Glyphs

- **Ctrl+C** — copy the selected glyph to the clipboard
- **Ctrl+V** — paste over the selected glyph
- Works within and across fixed/FZX modes. Cross-format paste automatically converts: fixed→FZX adjusts width and bitmap layout, FZX→fixed clips to 8×8.

### Undo / Redo

The Font Editor supports up to 50 levels of undo. Every modification is undoable: pixel editing, transforms, invert, clear, glyph count changes, width changes, and all FZX property edits (height, tracking, glyph width, shift, kern).

- **Ctrl+Z** — undo
- **Ctrl+Y** or **Ctrl+Shift+Z** — redo
- Loading a new font file or creating a new font clears the undo history
- Undo works across mode switches (fixed ↔ FZX)

### FZX Proportional Fonts

FZX is a proportional font format for ZX Spectrum with variable glyph widths (1–16px), configurable height (1–16px), per-glyph shift and kern properties, and signed tracking. In FZX mode:

- Per-glyph controls: **Width**, **Shift**, **Kern**
- Font-level controls: **Height**, **Tracking**
- The glyph grid uses flexible layout reflecting actual glyph widths
- All transforms adapt to variable-width bitmaps

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+C | Copy glyph |
| Ctrl+V | Paste glyph |
| Arrow keys | Navigate glyphs in grid |
| P | Pixel tool |
| L | Line tool |
| R | Rectangle tool |
| O | Circle / Ellipse tool |
| E | Eraser tool |
| B | Bold right |
| I | Invert glyph / font |
| Delete | Clear glyph / font |

### Visual Format Chooser

When loading a 2048-byte font file, a modal dialog shows side-by-side previews of both normal and interlaced (exploded) interpretations, rendered as 16 glyphs per row × 4 rows. Click the preferred interpretation to load it.

### Supported Font Formats

| Size | Glyphs | Format |
|------|--------|--------|
| 768 bytes | 96 | Standard ZX Spectrum font (ASCII 32–127) |
| 2048 bytes | 256 | Full 256-character font |
| 2048 bytes | 256 | Exploded format (row-interleaved) |
| 1–1024 × 8 bytes | Custom | Custom glyph count font |
| Variable | Variable | FZX proportional font (`.fzx`) |

---

## 26. ZGS Editor

The ZGS Editor is a standalone page (`zgs_editor.html`) for editing ZGS (ZX Graphics Script) vector scenes used in ZX Spectrum adventure games. ZGS uses a bytecode format with a 128x96 logical coordinate grid rendered to a 256x192 pixel display. Open it via the **ZGS Editor** link in the Tools tab, or navigate directly to `zgs_editor.html`.

### File Formats

| Extension | Type | Description |
|-----------|------|-------------|
| .zgs | Binary | ZGS bytecode with 10-byte header (magic `ZG`, version, flags, asset library, scene offset), optional LZ compression, asset library (sprites and shape scripts) |
| .zgt | Text | Human-readable assembly-like representation of ZGS bytecode |
| .zgp | Project | Multi-scene project file (JSON, v1/v2). Contains all scene names, source text, active scene index, and per-scene reference images with display settings (v2) |

### Header Controls

- **Open** — load a `.zgs` (binary, auto-disassembled to text), `.zgt` (text), or `.zgp` (project) file
- **New** — add a new blank scene tab if the project has existing content; reset the whole project if all scenes are empty/default
- **Save** — dropdown menu with format choices:
  - **Save .zgs** — assemble and save the active scene as binary `.zgs` file
  - **Save .zgt** — save the active scene as a `.zgt` text file
  - **Save .zgp** — save the multi-scene project as a `.zgp` file
  - **Save .asm** — export all scenes as a complete sjasmplus Z80 assembly. Downloads a `.zip` containing the `.asm` file, compiled `.zgs` binaries for each scene, a packed text dictionary (`.zdict`), and font binaries (`font_8x8.bin`, `font_6x8.bin`, `font_4x8.bin`). The exported file includes the 4-JP config block and conditional compilation flags (see below)
- **☾/☀** — toggle light/dark theme (synced with main SpectraLab via `localStorage`)

### Scene Tabs

The tab bar below the header shows all scenes in the project. Click a tab to switch scenes. Each scene has its own source text, undo/redo history, and compiled binary.

- **+** button — add a new scene
- **Double-click** a tab name — rename the scene
- **× button** on a tab — delete the scene (at least 1 must remain)

### ASM Config Block Layout

The exported `.asm` file places a poke-friendly config block at fixed addresses starting at ORG (0x8000 by default):

| Offset | Content | Description |
|--------|---------|-------------|
| +0x00 | `jp show_from_addr` | Clear screen, draw scene at `scene_addr`, wait key |
| +0x03 | `jp show_by_num` | Clear screen, draw `scene_num` from table, wait key |
| +0x06 | `jp zgs_clear_screen` | Clear screen using `clear_color` attribute |
| +0x09 | `jp zgs_wait_key` | Wait for keypress |
| +0x0C | `zgs_font_addr dw` | 32-col 8×8 font address (`font_8x8`, incbin) |
| +0x0E | `zgs_scene_addr dw` | Scene address for `show_from_addr` (patchable) |
| +0x10 | `zgs_dict_addr dw` | Packed text dictionary address (or 0) |
| +0x12 | `scene_num db` | Scene index for `show_by_num` (0-based, patchable) |
| +0x13 | `clear_color db` | Attribute byte for `zgs_clear_screen` (0 = black) |
| +0x14 | `zgs_font_42_addr dw` | 42-col 6×8 font address (`font_6x8`, incbin) |
| +0x16 | `zgs_font_64_addr dw` | 64-col 4×8 font address (`font_4x8`, incbin) |
| +0x18 | `scene_count db` | Total number of scenes |
| +0x19 | `scene_table dw×N` | Addresses of each scene |

To show a specific scene programmatically: poke the scene index into `scene_num` (ORG+0x12), then `CALL ORG+3`. To change the screen clear color: poke the attribute byte into `clear_color` (ORG+0x13).

### Conditional Compilation (ASM Export)

The exported `.asm` file includes eight `DEFINE` flags at the top that control which opcode groups are compiled in. Comment out unused DEFINEs to reduce the binary size — disabled features compile to minimal `or 1 : ret` stubs and their subroutines, data tables, and variables are excluded entirely.

| DEFINE | Opcodes | ~Bytes | Description |
|--------|---------|-------:|-------------|
| `ZGS_USE_LINES` | 0x64–0x6A | 443 | Line, hline, vline drawing |
| `ZGS_USE_RECTS` | 0x6B–0x70, 0x7E | 636 | Rectangle outline/fill, clear_region |
| `ZGS_USE_CIRCLES` | 0x73–0x76 | 612 | Circle outline/fill |
| `ZGS_USE_ELLIPSES` | 0x89–0x8C | 800 | Ellipse outline/fill |
| `ZGS_USE_POLYGONS` | 0x71–0x72 | 666 | Polygon outline/fill |
| `ZGS_USE_FLOOD` | 0x19, 0x77 | 2300 | Flood fill (includes 512-byte stack + 768-byte visited bitmap) |
| `ZGS_USE_TEXT` | 0x80–0x81 | 180 | set_cursor, print_text |
| `ZGS_USE_PACKED_TEXT` | 0x82 | 724 | print_packed (includes ~520 byte dictionary) |
| `ZGS_USE_TEXT_42` | 0x83–0x85 | 968 | set_cursor_42, print_text_42, print_packed_42 (42-col, 6px wide; includes 768-byte font_6x8.bin) |
| `ZGS_USE_TEXT_64` | 0x86–0x88 | 968 | set_cursor_64, print_text_64, print_packed_64 (64-col, 4px wide; includes 768-byte font_4x8.bin) |
| `ZGS_USE_STAMPS` | 0x78–0x79 | 146 | Stamp (sprite blit) |

`ZGS_USE_TEXT`, `ZGS_USE_TEXT_42`, `ZGS_USE_TEXT_64`, and `ZGS_USE_ELLIPSES` are auto-detected from scene content. Other DEFINEs are active by default. Font binaries are IFDEF-guarded: `font_8x8.bin` (32-col) requires `ZGS_USE_TEXT`, `font_6x8.bin` (42-col) requires `ZGS_USE_TEXT_42`, `font_4x8.bin` (64-col) requires `ZGS_USE_TEXT_64`. Users can replace any font binary with a custom design. When all drawing features are disabled (only text features remain), the coordinate system — dot/move handlers, `plot_pixel`, math helpers (`read_abs`, `read_dshort`, `read_dmed`), and pattern/mask tables — is automatically excluded via the internal `ZGS_HAS_DRAWING` flag.

Dependencies: `ZGS_USE_PACKED_TEXT` requires `ZGS_USE_TEXT` (uses `print_one_char`). `ZGS_USE_RECTS` (outline) and `ZGS_USE_POLYGONS` (outline) require `ZGS_USE_LINES` (they call `draw_line`). The user is responsible for ensuring disabled opcodes don't appear in the scene data.

### Text Editor (Left Panel)

A monospace textarea for editing `.zgt` assembly. Supports Tab key for indentation. Changes auto-render after 500ms of inactivity.

**Instruction categories:**

| Category | Examples |
|----------|---------|
| Attributes | `set_ink white bright`, `set_paper blue`, `set_attr 0x47`, `set_pattern checker`, `set_mode xor`/`set_mode set` |
| Movement | `move_abs 10, 20`, `move_short 2, -1`, `move_dmed -5, 3` |
| Drawing | `dot_abs`, `line_dmed`, `hline_chain`, `vline_abs`, `rect_fill_abs`, `circle_outline_abs`, `polygon_fill`, `flood_abs` |
| Batch ops | `dot_batch`, `line_batch`, `rect_fill_batch` |
| Assets | `.sub`/`.endsub` (shape scripts), `.sprite`/`.endsprite` (bitmap sprites), `call`, `stamp_abs`, `stamp_chain` |
| Text | `set_cursor col, row`, `print_text "string"`, `print_packed "string"`, `set_cursor_42 col, row`, `print_text_42 "string"`, `print_packed_42 "string"`, `set_cursor_64 col, row`, `print_text_64 "string"`, `print_packed_64 "string"` |
| Control | `.repeat`/`.endrepeat`, `wait_key`, `clear_region`, `end` |

### Preview (Right Panel)

A 256x192 canvas (CSS-scaled 2x with pixelated rendering) showing the rendered scene.

- **Render** — manually re-render the scene
- **Play** — animated step-by-step drawing (one opcode per tick)
- **Step** — execute a single opcode
- **Speed** slider — controls animation delay (5–500ms per opcode)
- **Pen** checkbox — toggle pen position crosshair on the overlay
- **Grid** checkbox — toggle 8×8 character cell grid overlay with screen third separators

### Status Bar

Shows assembler errors with line numbers, or success info (file size in bytes, opcode count).

### Drag and Drop

Drag a `.zgs`, `.zgt`, or `.zgp` file onto the page to open it.

---

## 27. Plugins — Custom Format Support

SpectraLab supports user-defined plugins that extract and patch pictures from arbitrary binary files (e.g., game snapshots). Plugins are managed in the **Tools** tab → **Plugins** section.

### Two Plugin Tiers

**JSON Descriptor Plugins (`.slplugin`)** — no programming required. Define picture locations as addresses/offsets in a JSON file. Best for extracting screens from known memory locations in snapshot files.

**JS Plugins (`.slpluginjs`)** — programmable plugins with custom extract/patch logic. Best for compressed formats or complex data layouts. Code is written as JavaScript inside a JSON wrapper.

### Loading a Plugin

Open a `.slplugin` or `.slpluginjs` file through the main browse button, or drag-and-drop it onto the application. The file extension is auto-detected and routed to the plugin loader.

Installed plugins persist across sessions (saved in localStorage).

### Using a Plugin

Each loaded plugin shows a row with buttons:

- **Open…** — select a file to open with this plugin. Extracts pictures according to the plugin definition and adds them to the picture tab bar
- **Export** (JS plugins only) — encode/compress the currently active picture through the plugin's patch function and download the result
- **×** — remove the plugin

### Plugin Session

When pictures are opened via a JSON descriptor plugin, a session bar appears above the picture tabs. JS plugins can also enable sessions by setting `"session": true` in the descriptor — this is useful for JS plugins that extract multiple pictures from a container file and need to write them back.

- **Replace Picture…** — replaces the currently active picture with a `.scr` file chosen from disk. The picture data is replaced immediately; undo history for that picture is cleared
- **Save Patched File** — writes all edited pictures back into the original file (at the defined addresses for JSON plugins, or via the `patch()` function for JS plugins) and downloads the patched file. JS plugins may show a progress window during compression
- **Save Raw** — exports each picture as a separate raw format file
- **×** — closes the session (pictures remain open but lose the link to the original file)

### JSON Descriptor Format

```json
{
  "id": "unique_plugin_id",
  "name": "Display Name",
  "version": 1,
  "description": "Short description",
  "fileExtensions": [".sna", ".z80"],
  "pictures": [
    {
      "name": "Picture Name",
      "format": "scr",
      "source": {
        "addressMode": "z80addr",
        "address": "0x4000",
        "length": 6912
      }
    }
  ],
  "fixups": []
}
```

**Address modes:**

| Mode | Description |
|------|-------------|
| `z80addr` | Z80 logical address (0x4000–0xFFFF). Auto-maps to memory banks: 0x4000–0x7FFF → bank 5, 0x8000–0xBFFF → bank 2, 0xC000–0xFFFF → currently paged bank. Optional `bank` field overrides auto-mapping. Requires .sna or .z80 file. |
| `offset` | Raw byte offset into the file. Works with any binary file. |

Numeric values accept hex strings (`"0x4000"`) or plain numbers (`16384`).

**Fixups** — optional byte patches applied after pictures are written back:

```json
"fixups": [
  { "addressMode": "offset", "offset": "0xC100", "value": [0, 27] }
]
```

### JS Plugin Format

```json
{
  "id": "unique_id",
  "name": "Display Name",
  "fileExtensions": [".bin"],
  "type": "js",
  "jsSource": [
    "plugin = {",
    "  extract: function(fileBytes, snapshot) {",
    "    // Return: array of {name, format, data}",
    "    return [{ name: 'Screen', format: 'scr', data: fileBytes.slice(0, 6912) }];",
    "  },",
    "  patch: function(originalBytes, pictures, snapshot) {",
    "    // Optional: encode/compress and return Uint8Array or Promise",
    "    return new Uint8Array(pictures[0].data);",
    "  }",
    "};"
  ]
}
```

`jsSource` can be a single string or an array of strings (one per line, joined with newlines). The array form is recommended for readability.

**Optional field:** `"session": true` — enables the session bar (Save Patched File / Save Raw) for JS plugins that extract from and write back to container files. Without this, JS plugins work as standalone codecs (Open to decode, Export to encode).

**Parameters:**
- `fileBytes` — `Uint8Array` of the entire file
- `snapshot` — parsed snapshot object `{banks: Uint8Array[8], machineType, pagingByte}` or `null` for non-snapshot files. Bank arrays are subarray views into `fileBytes` (zero-copy)
- `pictures` — array of `{name, format, data}` with the current edited screen data

**Return value:** `patch()` can return a `Uint8Array` (synchronous) or a `Promise<Uint8Array>` (asynchronous). Async return is useful for plugins that need to update the UI during long operations (e.g., progress bars). Return `null` to cancel the save.

**`SL` namespace** — JS plugins receive an `SL` object as a parameter, providing access to SpectraLab's compression modules. Plugins can check availability with `if (SL.ZX0)` before use:

| Property | Module | Key methods |
|----------|--------|-------------|
| `SL.ZX0` | ZX0 compressor | `compress(data)` → `{data, delta}`, `decompress(data)` → `Uint8Array` |
| `SL.ZX7` | ZX7 compressor | `compress(data)`, `decompress(data)` |
| `SL.RLE` | RLE (PackBits) | `compress(data)`, `decompress(data)` |
| `SL.ZXSC` | ZXSC (LZF) | `compress(data)`, `decompress(data)` |
| `SL.LC` | Laser Compact | `compress(data)`, `decompress(data)` |
| `SL.UPKR` | UPKR | `compress(data)`, `decompress(data)` |
| `SL.LgK` | LgK compressor | `compress(data)`, `decompress(data)` |
| `SL.ASC` | ASC screen compressor | `compress(screen)`, `compressTokens(screen)`, `decompress(block)`, `decompressTokens(tokens)` (6912-byte screens only) |

Example usage inside a plugin:
```javascript
"jsSource": [
    "plugin = {",
    "  extract: function(fileBytes) {",
    "    var decompressed = SL.ZX0.decompress(fileBytes);",
    "    return [{ name: 'Screen', format: 'scr', data: decompressed }];",
    "  },",
    "  patch: function(originalBytes, pictures) {",
    "    return SL.ZX0.compress(pictures[0].data).data;",
    "  }",
    "};"
]
```

### Example Plugins

Example plugins are provided in the `plugins/` directory:

- `example.slplugin` — JSON descriptor: extracts main and shadow screens from a 128K .sna snapshot
- `example_js.slpluginjs` — JS plugin: demonstrates extract/patch with snapshot bank access
- `rle_scr.slpluginjs` — JS plugin (codec): loads and saves RLE-compressed SCR files (0x00/0xFF + count encoding)
- `maria_sna.slpluginjs` — JS plugin (session): extracts loading screen + 5 compressed screens (ZX0/RLE auto-detected) from Maria's Christmas Box 48K .sna snapshot. On save-back, patches the Z80 depacker in the snapshot: replaces the inline RLE loop at `$9602` with `CALL $FE90`, injects the 112-byte `dzx0_smartRCS` depacker at `$FE90` (end of memory), and applies RCS bitmap reordering before ZX0 compression. The data block at `$A000` (header + compressed screens) is kept portable for sideloading. Falls back to RLE if `SL.ZX0` is unavailable. ZX0, RCS and `dzx0_smartRCS` by Einar Saukas. Demonstrates Z80 code patching, depacker relocation, cross-bank data handling, `SL` namespace usage, and memory overflow protection
- `heroquest_128k.slpluginjs` — JS plugin (session): extracts 11 graphics from Hero Quest 128K .sna snapshot across banks 3, 4, 6, and 7. Ten 128×64 px graphics in banks 3/4/7 use linear bitmap+attrs layout converted to/from ZX-interleaved SCR; bank 6 contains the full 256×192 playfield screen as a standard SCR. Unused screen area filled with bright/regular white checkerboard to mark the editable region
- `tape_loader.slpluginjs` — JS plugin (export): exports the current SCR screen with byte reordering for visual tape loading effects. A custom export dialog lets you choose the loading scheme and download format (ZIP archive with .scr + .asm + .inc, or .scr only). Six schemes: **Backward** reverses all 6912 bytes so the loader stores them from $5AFF down to $4000 — attrs appear first (bottom to top), then bitmap fills from bottom up. **Linear** reorders data in character-row order (8 bitmap lines + 32 attr bytes per row) — picture paints top to bottom with colors appearing after each character row. **Checkerboard 2×2** divides the screen into a 2×2 grid of 16×12 character blocks, loads even-positioned blocks (checkerboard pattern) first, then odd — each block loads bitmap data first then attributes. **Checkerboard 4×3** uses a 4×3 grid of 8×8 character blocks for a finer checkerboard effect. **Checkerboard 8×6** uses an 8×6 grid of 4×4 character blocks for the finest checkerboard pattern. **Turbo Linear (2× speed)** exports a `.tzx` file instead of `.tap` — the TZX contains a standard-speed BASIC block (Block $10) with a custom turbo loader machine code embedded in a REM line, followed by a turbo-speed data block (Block $11) at approximately 2× standard speed (halved pulse timings). The turbo MC copies itself to $8000 (uncontended RAM) and reads data via direct edge-detection on port $FE using a threshold-based bit discriminator (~52 T-states/iteration). Returns to BASIC via RST $08 ("0 OK" report). Based on turbo loading technique from zxctl by iratahack. ZIP export for the turbo scheme includes .tzx + reference .asm + .inc files. The first five schemes use ROM routines ($0562 for pilot/sync/flag detection, $05C6 for byte reading via the DE=0 trick) and save/restore all Z80 registers for clean return to BASIC. The loader include files are provided separately for reuse in other projects. **Disk emulator ASM**: for the five non-turbo schemes, when ZIP format is selected, a "Include disk emulator ASM" checkbox adds a standalone disk emulator to the archive — a `_disk.asm` wrapper and a `disk_*_loader.inc` file containing Z80 assembly that reproduces the same visual loading effect but reads from a RAM buffer (`INCBIN`) instead of tape. Uses the same reordered `.scr` file as the tape loader (monoloader concept — one `.scr` shared by both tape and disk ASMs). Timing matches real tape speed: 4 bytes are written to screen memory per frame via `HALT` (1728 HALTs = ~34.6 seconds at 50fps). Press any key during the reveal to show the remaining screen instantly — the `HALT` in the `check_key` subroutine is patched to `NOP` via self-modifying code (SMC). Assembles with sjasmplus at ORG $8000. Not available for the turbo scheme or non-ZIP formats
- `sca_diff_analyzer.slpluginjs` — JS plugin (export): opens Type 0 SCA animations and exports frame-to-frame cell-level diffs as a ZIP archive with sjasmplus `.asm` source and binary `.bin` files. Frame 0 is always exported as a full 6912-byte `.bin`. Subsequent frames are compared cell by cell against the previous frame: if the number of changed cells is within a user-defined threshold, the frame is encoded as `DB` directives with row, column, bitmap bytes, and attribute byte per changed cell; otherwise the full frame is exported as a `.bin` file with an `INCBIN` reference. The export dialog provides: **Diff unit** radio (Bitmap + attribute at 9 bytes/cell including 8 bitmap bytes in ZX-interleaved order + 1 attribute byte, or Attribute only at 1 byte/cell); **Threshold** input (1–768, max changed cells before falling back to full binary); **live statistics** showing diff vs full frame counts, estimated total size, and a color-coded histogram of changed cells per frame with a yellow threshold line. The ASM file includes `Frame_NNN:` labels, a `DelayTable:` with per-frame delay values (1/50s units), and a per-frame summary with byte counts and totals. ZIP structure: `animation_diff/animation.asm` + `animation_diff/frame_NNN.bin` for full frames
- `cursor_loader.slpluginjs` — JS plugin (export): exports the current SCR screen with interactive cell-order loading, a running cursor effect, and **multi-source** support. The export dialog displays the screen at 2× zoom (512×384) with a 32×24 character grid overlay. **Multiple sources**: the editor screen is source 1; click **+ Add** to load additional `.scr` files as numbered sources. A colored tab bar shows all sources — click to switch, × to remove. Cells from the active source show at full brightness with a colored border; cells from other sources appear tinted with their source color. Unassigned cells show a dimmed grayscale version of the source image with a diagonal cross overlay, keeping picture structure visible while placing cells. **Interaction**: left-click or drag to add cells from the active source (drag interpolates with Bresenham for smooth lines); right-click to set an anchor (shown with white corner brackets), right-click again to draw a Bresenham line from anchor to target. The same cell position can appear multiple times from different sources, creating picture-replacement effects. Five presets fill all 768 positions from the active source: **Typewriter** (L→R, T→B), **Columns** (T→B, L→R), **Zigzag** (alternating L→R and R→L per row), **Spiral In** (clockwise from border to center), **Random** (Fisher-Yates shuffle). Tools: **Clear** resets the entire order, **Fill remaining** fills uncovered cells from the active source, **Undo** / **Redo** (Ctrl+Z / Ctrl+Y), **Save** / **Load** (project state to/from `.json` file including all sources as base64), **Animate** checkbox (preview the loading animation at any time, even with partial coverage). **Initial colors**: Ink, Paper, and Bright controls set the initial attribute fill and border color before loading. A color swatch shows the ZX ROM "A" glyph in ink on paper. **Cursor toggle**: "Show cursor during loading" checkbox controls whether the bright white cursor cell ($78) appears ahead of the data. **Border stripes**: dropdown selects the border stripe color scheme — Blue/Yellow (standard), Red/Cyan, Magenta/Green, Black/White, or Solid (no stripes); solid mode copies the ROM byte reader to uncontended RAM via LDIR, patches absolute addresses for relocation, and replaces OUT ($FE),A with NOP NOP; a **Color** dropdown appears to choose any of the 8 ZX Spectrum colors for the solid border. Export is enabled once all 768 unique cell positions are covered. Status shows "Entries: N | Unique cells: M / 768". Each cell = 9 bytes (8 bitmap lines + 1 attribute byte). The Z80 loader machine code (~110 bytes) and cell order table (N × 2 bytes) are embedded in a REM line at $5CD0. For each cell the loader: (1) writes $78 (bright white paper) to the attribute address as a visible cursor, (2) reads 8 bitmap bytes from tape and writes them to the correct non-linear screen addresses, (3) reads 1 attribute byte and overwrites the cursor with the real color. Uses ROM routines ($0562 for pilot/sync/flag, $05C6 for byte reading with the DE=0 trick). Output: .tap file with BASIC program (auto-starting at line 10 with `RANDOMIZE USR 23760`) + headless data block (flag $FE, N×9 cell-ordered bytes). Download format: TAP only or ZIP archive with .tap + cell-ordered `.bin` + reference .asm (sjasmplus SAVETAP directives) + .inc (commented Z80 assembly with cell table as DB lines). **Disk emulator ASM**: when ZIP format is selected, a "Include disk emulator ASM" checkbox adds a standalone disk emulator to the archive — a `_disk.asm` wrapper and a `disk_cursor_loader.inc` file containing Z80 assembly that reproduces the same cell-by-cell visual loading effect with cursor, but reads from a RAM buffer (`INCBIN`) instead of tape. Uses the same compact stream `.bin` file as the tape loader (monoloader concept — one `.bin` shared by both tape and disk ASMs). Timing matches real tape speed: 3 HALTs per cell (~60ms ≈ tape's ~62ms); bitmap bytes appear progressively in monochrome (cursor attribute) across 3 frames, then the attribute byte snaps the color in. Press any key during the reveal to show the remaining screen instantly (HALT patched to NOP via SMC). Assembles with sjasmplus at ORG $8000. Checkbox hidden when TAP format is selected

---

## 28. Script Editor — Scripting Engine

The **Script Editor** is a resizable, draggable floating panel that provides an embedded BASIC-style scripting language for automating drawing operations, batch processing, and generative art. Open it from the **Tools** tab → **Script Editor** link. Drag the titlebar to move, drag the bottom-right corner to resize. Panel position and size persist across sessions.

### Script Editor

A monospace text editor with line numbers for entering scripts. Long lines scroll horizontally. Content is auto-saved to localStorage between sessions.

**Toolbar buttons:**

| Button | Action |
|--------|--------|
| **▶ Run** | Execute the script (also **Ctrl+Enter**) |
| **■ Stop** | Interrupt a running script |
| **Clear Log** | Clear the output log |
| **Load** | Load a `.slscript` / `.txt` / `.bas` file |
| **Save** | Download the script as a `.slscript` file |
| **?** | Open/close the inline language reference overlay |

**Examples dropdown** — loads one of 7 built-in demo scripts (Diagonal Line, Starfield, Gradient Bars, Checkerboard, Sine Wave, Circles, Sierpinski Triangle).

### Output Log

Displays `PRINT` output and status messages. Errors appear in red with line numbers.

### Language Reference

**Variables and assignment:**

```
LET x = 10
y = x + 5
```

Variables default to `0` if not previously assigned. Case-insensitive keywords — `setink`, `SETINK`, `SetInk` all work.

**Control flow:**

```
FOR i = 0 TO 255 STEP 2
  PIXEL i i
NEXT

IF x > 128 THEN
  SETINK 7
ELSE
  SETINK 0
ENDIF

REPEAT 100
  PIXEL RANDOM(256) RANDOM(192)
ENDREPEAT

WHILE x < 256
  PIXEL x 96
  x = x + 1
ENDWHILE
```

**User-defined functions:**

```
FUNC drawStar(cx, cy, size)
  LINE cx - size cy cx + size cy
  LINE cx cy - size cx cy + size
ENDFUNC

CALL drawStar(128, 96, 20)
```

**Comments:** `#` or `REM` — everything after is ignored until end of line.

### Drawing Commands

| Command | Parameters | Description |
|---------|-----------|-------------|
| `PIXEL` | x y | Set pixel using current ink color |
| `PIXELPAPER` | x y | Set pixel using current paper color |
| `PLOT` | x y | Alias for `PIXEL` |
| `LINE` | x0 y0 x1 y1 | Draw a line |
| `RECT` | x0 y0 x1 y1 | Draw rectangle outline |
| `FILLRECT` | x0 y0 w h | Draw filled rectangle |
| `CIRCLE` | cx cy rx ry | Draw ellipse (ry defaults to rx) |
| `FILL` | x y | Flood fill from point |
| `CLEAR` | [ink paper] | Clear screen (optionally set colors) |

### Attribute Commands

| Command | Parameters | Description |
|---------|-----------|-------------|
| `SETINK` | n | Set current ink color (0–7) |
| `SETPAPER` | n | Set current paper color (0–7) |
| `SETBRIGHT` | b | Set bright flag (0 or 1) |
| `SETFLASH` | b | Set flash flag (0 or 1) |
| `SETATTR` | col row ink paper bright flash | Set attribute at cell (col, row) |

### Screen Operations

| Command | Description |
|---------|-------------|
| `RENDER` | Force screen redraw (normally auto at end) |
| `UNDO` | Undo last change |
| `REDO` | Redo last undone change |

### Query Functions

| Function | Returns |
|----------|---------|
| `GETPIXEL(x, y)` | 1 if pixel set, 0 otherwise |
| `GETINK(col, row)` | Ink color at attribute cell |
| `GETPAPER(col, row)` | Paper color at attribute cell |
| `GETBRIGHT(col, row)` | 1 if bright, 0 otherwise |
| `WIDTH()` | Current format width in pixels |
| `HEIGHT()` | Current format height in pixels |

### Math Functions

`SIN(x)`, `COS(x)`, `TAN(x)`, `SQRT(x)`, `ABS(x)`, `FLOOR(x)`, `CEIL(x)`, `ROUND(x)`, `MIN(a,b)`, `MAX(a,b)`, `RANDOM(n)` (0 to n−1), `PI`.

### Operators

Arithmetic: `+`, `-`, `*`, `/`, `%`. Comparison: `=`, `<>`, `!=`, `<`, `>`, `<=`, `>=`. Logical: `AND`, `OR`, `NOT`.

### Execution Details

- Scripts run asynchronously, yielding every 1000 statements to keep the browser responsive
- A single undo checkpoint is saved before the script starts — the entire script is one undo step
- The screen renders once when the script finishes (use `RENDER` to force intermediate redraws)
- Brush size is temporarily set to 1 pixel during script execution
- The Stop button interrupts execution at the next yield point

---

## 29. Supported Formats Reference

### Editable Formats

| Extension | Size | Description |
|-----------|------|-------------|
| .scr | 6912 bytes | Standard screen (bitmap + attributes) |
| .rcs | 6912 bytes | [RCS](https://github.com/einar-saukas/RCS) reordered screen (auto-converted to SCR on load) |
| .scr.zx7 | variable | [ZX7](https://spectrumcomputing.co.uk/entry/27996/ZX-Spectrum/ZX7) compressed screen (auto-decompressed on load) |
| .scr.zx7b | variable | ZX7 backward compressed screen (auto-decompressed on load) |
| .rcs.zx7 | variable | RCS reordered + ZX7 compressed (auto-decompressed and un-reordered on load) |
| .rcs.zx7b | variable | RCS reordered + ZX7 backward compressed (auto-decompressed and un-reordered on load) |
| .scr.zx0 | variable | [ZX0](https://github.com/einar-saukas/ZX0) compressed screen (auto-decompressed on load) |
| .scr.zx0b | variable | ZX0 backward compressed screen (auto-decompressed on load) |
| .rcs.zx0 | variable | RCS reordered + ZX0 compressed (auto-decompressed and un-reordered on load) |
| .rcs.zx0b | variable | RCS reordered + ZX0 backward compressed (auto-decompressed and un-reordered on load) |
| .scr.lc | variable | Laser Compact 5.2.1 compressed screen with LCMP5 header (auto-decompressed on load) |
| .scr.c4 | 841 bytes | Chunks 4×4 lossy monochrome bitmap — 4-pattern dictionary, 1 byte/cell (768B encoded + 64B LUT + 8B dictionary + 1B mode) |
| .scr.c2 | 1573 bytes | Chunks 4×2 lossy monochrome bitmap — 4-pattern dictionary, 2 bytes/cell (1536B encoded + 32B LUT + 4B dictionary + 1B mode) |
| .scr.lzf | variable | [ZXSC](https://github.com/TomDDG/ZXSC---ZX-Spectrum-Screen-Compresser) LZF compressed screen — standard or screen-scan mode (auto-decompressed on load) |
| .scr.rle | variable | RLE (PackBits-style) compressed screen (auto-decompressed on load) |
| .scr.upk | variable | upkr compressed screen with Z80 settings (auto-decompressed on load) |
| .scr.lgk | variable | LgK v1.1rs compressed screen (auto-decompressed on load) |
| .scr.asc | variable | ASC v2.9 compressed screen — LZSS + RLE token stream, or a self-extracting block with 194-byte stub (auto-decompressed on load; stub auto-detected) |
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
| .ga | 7680 bytes | Gigaattr (shared bitmap + 2×attrs) |
| .gap | 7744 / 7808 bytes | Gigaattr+ULA+ (shared palette / dual palette) |
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
| .sl2 | 49664 bytes | ZX Next Layer 2 256×192 + embedded RGB333 palette |
| .sl2 | 81920 bytes | ZX Next Layer 2 320×256 or 640×256 (disambiguation dialog) |
| .sl2 | 82432 bytes | ZX Next Layer 2 320×256 + embedded RGB333 palette |
| .sl2 | 81952 bytes | ZX Next Layer 2 640×256 + embedded RGB333 palette (16-color, 4bpp) |
| .c | 32768 bytes | Scorpion GMX 640×200 hi-res (bitmap + 8×1 attributes, rows doubled for display) |
| .c | 16128 bytes | Scorpion GMX 160×200 attribute-only ("GMX\x0F" header, 8×1 attributes, pixels doubled horizontally + rows doubled for display = 640×400) |

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

---

## ZGS Editor

The ZGS Editor is a standalone tool (`zgs_editor.html`) for creating and editing ZGS (ZX Graphics Script) vector scenes. Open it via the **ZGS Editor** link in the Tools tab of the main application.

### Layout

- **Left panel** — text editor for `.zgt` assembly source
- **Right panel** — preview canvas, drawing toolbar, command toolbar, playback controls

### File Operations

| Button | Action |
|--------|--------|
| **Open** | Load `.zgs` (binary, auto-disassembled), `.zgt` (text), or `.zgp` (project) |
| **New** | Add a new blank scene tab (or reset if all scenes are empty/default) |
| **Save** | Dropdown menu: Save .zgs (binary), .zgt (text), .zgp (project), .asm (Z80 assembly ZIP) |

Files can also be dragged and dropped onto the page.

### Playback Controls

| Control | Action |
|---------|--------|
| **Render** | Assemble and render the full scene instantly |
| **Play** / **Pause** | Animate step-by-step playback |
| **Step** | Execute one opcode and re-render; highlights the corresponding source line |
| **Speed** slider | Delay between steps during Play (5–500 ms, default 37 ms) |
| **Zoom** | Canvas zoom: x1, x2, x3, x4, x5 |
| **Pen** checkbox | Toggle pen position crosshair on the overlay |
| **Grid** checkbox | Toggle 8×8 character cell grid overlay (orange lines, brighter third separators at y=64/128). Persists via localStorage |

### Reference Image (collapsible)

Load an external image as a drawing reference overlaid on the preview canvas. Each scene stores its own reference image and settings. The section header toggles open/closed (state persists via localStorage).

- **Load** — select an image file (any browser-supported format)
- **Clear** — remove the reference image from the active scene
- **Show** — toggle visibility without removing the image
- **Opacity** slider — adjust transparency (5% to 80%, default 30%)
- **X / Y** — position offset in pixels (default 0, 0)
- **W / H** — display size in pixels ("auto" = 256×192, matching the ZGS screen)

When adding a new scene, the current scene's reference image and settings are copied to the new scene. Reference images are saved in `.zgp` project files (v2 format), deduplicated across scenes to avoid bloat when multiple scenes share the same image. Version 1 `.zgp` files load normally (scenes have no reference).

### Theme Toggle

Click the **☾/☀** button in the header bar to switch between dark and light themes. The setting is shared with the main SpectraLab and Font Editor via the same `spectraLabTheme` localStorage key.

### Drawing Tools (Shape Toolbar)

Select a tool, then click or drag on the canvas. The generated instruction is inserted before the `end` statement and the canvas re-renders immediately.

| Tool | Action | Generated instruction |
|------|--------|-----------------------|
| **Cursor** | Left-click copies `lx, ly` to clipboard | — |
| **Dot** | Click to place a dot | `dot_abs lx, ly` |
| **Line** | Left-drag: single line. Right-drag: polyline (rubber band tracks from last endpoint; right-click/drag to add segments; left click or Esc to finish) | `move_abs x0, y0` + `line_dmed dx, dy` |
| **Rect** | Drag to define rectangle | `rect_outline_abs x, y, w, h` |
| **RectF** | Drag to define filled rectangle | `rect_fill_abs x, y, w, h` |
| **Circle** | Drag center→radius | `circle_outline_abs cx, cy, r` |
| **CircleF** | Drag center→radius | `circle_fill_abs cx, cy, r` |
| **Ellip** | Drag center→edge to define radii | `ellipse_outline_abs cx, cy, rx, ry` |
| **EllipF** | Drag center→edge to define radii | `ellipse_fill_abs cx, cy, rx, ry` |
| **Flood** | Click to fill | `flood_abs lx, ly` |
| **Text** | Click to set cursor position | `set_cursor col, row` |
| **ClearR** | Drag to select character cells | `clear_region col, row, w, h, attr` |

During drag, a yellow rubber-band overlay previews the shape. The ClearR tool snaps to the 8×8 character cell grid and shows a red dashed preview.

**Shape modifier keys:** Hold modifier keys while dragging Rect, RectF, Circle, CircleF, Ellip, or EllipF to constrain the shape:

| Modifier | Effect |
|----------|--------|
| **Ctrl** | Constrain to 1:1 ratio (square / circle) |
| **Alt** | Draw from center instead of corner |
| **Ctrl+Alt** | Both combined |

### Text Toolbar

When the **Text** tool is selected, a text toolbar appears with:

- **Cursor info** — shows the current cursor position after clicking the canvas
- **Text mode** — dropdown selector for character width: **32 col** (8px wide, standard), **42 col** (6px wide), **64 col** (4px wide). Each mode uses independent cursor tracking and font address
- **Text input** — type the text to print
- **Print** button — inserts `print_text "..."`, `print_text_42 "..."`, or `print_text_64 "..."` based on the selected text mode

Click the canvas first to place a `set_cursor` command (variant depends on text mode: `set_cursor col, row`, `set_cursor_42 col, row`, or `set_cursor_64 col, row`), then type text and click Print to insert the corresponding print command. The two operations are separate, allowing you to draw between cursor placement and text printing.

Text is rendered using the ZX Spectrum ROM font (8×8 for 32-col, 6×8 for 42-col, 4×8 for 64-col, characters 32–127) with the current attribute. The cursor advances after each character and wraps to the next row at the column limit (32, 42, or 64). The 6×8 font uses columns 0-5 from the 8×8 ROM font. The 4×8 font is derived by OR-ing column pairs from the 8×8 font (output_bit[n] = input_bit[2n] | input_bit[2n+1]).

#### Packed Text (`print_packed`)

`print_packed "string"` works identically to `print_text` visually, but uses dictionary compression to reduce bytecode size by 30–50% for English text. The encoder uses a dictionary of common bigrams, trigrams, and words. Use for longer text passages (adventure game descriptions, dialogue) where space savings matter. The `.dict` directive selects the encoding dictionary:

- `.dict lower` — built-in lowercase English dictionary (default)
- `.dict upper` — built-in uppercase English dictionary
- `.dict user` — custom dictionary loaded from a `.zdict` file

To use a custom dictionary, select "Dict: user" from the dropdown in the text toolbar and click "Load .zdict" to load your dictionary file. Custom dictionaries can be generated with the `zgs_mkdict.py` tool from game text files. The dictionary is locked once the first `print_packed` command is inserted to prevent encoding mismatches.

### Command Toolbar

Insert commands before the `end` statement via dropdowns and buttons:

| Control | Inserts |
|---------|---------|
| **Ink...** dropdown | `set_ink <color>` (+ `bright` if Brt checked). Label shows current selection (e.g., "Ink: red") |
| **Paper...** dropdown | `set_paper <color>` (+ `bright` if Brt checked). Label shows current selection |
| **Brt** checkbox | Appends `bright` to next Ink/Paper command |
| **Pattern...** dropdown | `set_pattern <name>`. Label shows current selection (e.g., "Pat: checker") |
| **XOR** button | `set_mode xor` |
| **SET** button | `set_mode set` |
| **Clear** button | `clear_region 0, 0, 32, 24, <attr>` (full screen, current attr) |
| **WaitKey** button | `wait_key` — skipped during instant render; pauses animated playback until keypress or canvas click |
| **End** button | `end` |

### Coordinate Display

Hover over the canvas to see the current position:
- **Tooltip** (top-right of canvas) — logical coordinates `lx, ly`
- **Status bar** — logical and pixel coordinates `x: lx  y: ly  (px: px, py)`

Right-click anywhere on the canvas to copy coordinates to clipboard.

### Pen Crosshair

When the **Pen** checkbox is enabled, a semi-transparent green crosshair marks the VM pen position on the overlay canvas. It updates after Render, Play steps, and Step.

### Source Line Sync

When using **Step**, the textarea highlights the source line corresponding to the current VM program counter. This is powered by a source map built during assembly.

### Text Editor

- Auto-render with 500 ms debounce on typing
- **Tab** key inserts two spaces
- Comments start with `;`
- Lines after `end` are ignored by the assembler

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Tab | Insert two spaces |
| Escape | Cancel active polyline |
| Alt+Arrow keys | Nudge selected lines — shift absolute coordinates by ±1 (select lines first) |
| Ctrl (during drag) | Constrain shape to 1:1 ratio (square/circle) |
| Alt (during drag) | Draw shape from center instead of corner |

> **Note:** Keyboard shortcuts work with any keyboard layout (Russian, German, etc.) — they are based on physical key position.

---

## Credits and Third-Party Libraries

- **ZX7** — compression by [Einar Saukas](https://spectrumcomputing.co.uk/entry/27996/ZX-Spectrum/ZX7)
- **ZX0** — compression by [Einar Saukas](https://github.com/einar-saukas/ZX0)
- **RCS** — screen reordering by [Einar Saukas](https://github.com/einar-saukas/RCS)
- **Laser Compact 5.2.1** — compression by Hrumer (packer/depacker, 1994–2014), Eugene Larchenko (buffer overflow fix, segment support)
- **upkr** — compression by phar/Loonies ([GitHub](https://github.com/exoticorn/upkr))
- **ZXSC** — LZF screen compressor with non-linear cell-scan ordering by [TomDDG](https://github.com/TomDDG/ZXSC---ZX-Spectrum-Screen-Compresser) (MIT license). Z80 depackers and algorithm design from the original project; compressor reimplemented in JavaScript with optimal DP parsing
- **LgK** — LgK v1.1rs (Lethargeek Kompakt, Row-Sequence edition) tile-based screen compressor by Lethargeek. JavaScript port by Bedazzle
- **ASC** — ASC v2.9 LZSS + RLE screen compressor by Andrew Strikes Code (Andrey Sendetsky), 1997. JavaScript port by Bedazzle, reconstructed from a byte-exact disassembly; output is byte-compatible with the original self-extracting depacker
