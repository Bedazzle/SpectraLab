# SpectraLab Help — UI Reference Guide

## 1. Introduction

**SpectraLab** is a web-based ZX Spectrum graphics editor and viewer. It supports multiple ZX Spectrum graphics formats for viewing, editing, converting, and importing external images with advanced dithering algorithms.

- **Version:** 1.53.0
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
`.scr`, `.53c`, `.atr`, `.bsc`, `.bmc4`, `.ifl`, `.mlt`, `.mc`, `.3`, `.img`, `.specscii`, `.sca`, `.btile`, `.wtile`, `.slp`, `.slw`, `.sna`, `.z80`, `.zip`, `.png`, `.gif`, `.jpg`, `.jpeg`, `.webp`, `.bmp`

### New Picture

Click the **New** button to open the New Picture dialog. Select a format from the dropdown:

| Format | Extension | Description |
|--------|-----------|-------------|
| Screen | .scr | 256×192, bitmap + attributes |
| ULA+ | .scr | 256×192, 64-color palette |
| IFL | .ifl | 256×192, 8×2 multicolor attributes |
| MLT | .mlt | 256×192, 8×1 multicolor attributes |
| Border Screen | .bsc | 384×304, bitmap + attributes + border |
| BMC4 | .bmc4 | 384×304, 8×4 multicolor + border |
| RGB3 | .3 | 256×192, tricolor RGB (8 colors) |
| Gigascreen | .img | 256×192, two-frame blend |
| Monochrome | .scr | 256×192, bitmap only |
| Monochrome 2/3 | .scr | 256×128, bitmap only |
| Monochrome 1/3 | .scr | 256×64, bitmap only |
| Attributes | .atr | 32×24 color cells |
| SPECSCII | .specscii | 32×24 text mode |

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

Select zoom level from the dropdown: **x1, x2, x3, x4, x5, x6, x8, x10, x20**. You can also use **Ctrl+Mouse Wheel** to zoom in/out, or press number keys **1-5** for quick zoom.

### View Settings (collapsible)

Click the "View Settings" header to expand/collapse.

#### Border
- **Color:** Black, Blue, Red, Magenta, Green, Cyan, Yellow, White
- **Size:** None, Small (16px), Medium (32px)

#### Palette
Select display palette from the dropdown. Available palettes depend on the loaded palette definitions.

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

### Format-Specific Controls

#### 53c Pattern Selector
For `.53c` / `.atr` attribute-only formats, select the fill pattern: **Checker**, **Stripes**, or **Pattern** (DD/77).

#### RGB3 Controls
For `.3` tricolor format: toggle **Emulate flicker** to simulate real hardware display.

#### Gigascreen Controls
For `.img` gigascreen format, select display mode:
- **Average** — blended view of both frames
- **Flicker** — alternating frame display

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

Ink and paper must be from the same CLUT.

### Gigascreen Palette

Shown for Gigascreen format. A 16-column grid displays all virtual colors created by two-frame alternation.

- Left click = select ink
- Right click = select paper
- **Cell Colors** section shows the 4 available colors per cell
  - **L** = Left mouse button color
  - **R** = Right mouse button color

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

Available for BSC/BMC4 formats. 8 barcode slots for border stripe patterns.

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

For SPECSCII format pictures, a character palette appears:

- **Character grid** — ROM font characters (0x20-0x7F) and block graphics (0x80-0x8F)
- Click a tile to select a character for drawing
- **Character preview** — shows the selected character enlarged with its code
- Right-click on canvas to pick character + attributes from screen

Available tools in SPECSCII mode: Pixel, Line, Rectangle, Circle, Flood Fill, Eraser, Text.

Paint modes: Set (place character), Invert (swap ink/paper), Recolor (attributes only). The Eraser clears the cell and removes it from the current layer.

SPECSCII supports OVER layers (XOR compositing) loaded from stream control codes. You can export SPECSCII to `.scr` bitmap via the Transform tab.

![SPECSCII editor](screenshots/specscii_editor.png)

---

## 15. Transform Tab (Xform)

### History

- **Undo** (Ctrl+Z) — undo last action (up to 32 levels)
- **Redo** (Ctrl+Y) — redo undone action
- **Clear** — clear the entire screen

### Workspace

- **Save Workspace** — save all open pictures as a `.slw` file
- **Load Workspace** — load a workspace file (`.slw`)

### Format Conversion

Use the **Convert to...** dropdown to convert the current picture to a different format.

### Export

- **Export format** dropdown — select the export format
- **Embed** checkbox — embed data in the export file
- **Export** button — export to the selected format

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

### Sprite List

Shows all defined sprites. Click to select.

- **Click** — select a single sprite
- **Ctrl+Click** — toggle a sprite in/out of multi-selection
- **Shift+Click** — select a range of sprites from the last clicked to the current
- **Double-click** — select and open in the sprite editor
- **Right-click** — open context menu with operations on selected sprites
- **+ Add** — add a new sprite
- **Delete** — delete selected sprite(s)

### Context Menu (right-click on sprite list)

- **Merge selected to animation** — combine all selected sprites (must have same dimensions and mode) into one sprite with multiple animation frames
- **Add frames to…** — copy frames from selected sprites to a chosen target sprite
- **Move frames to…** — move frames to a chosen target sprite and remove the source sprites
- **Split frames to sprites** — split a multi-frame sprite into separate single-frame sprites (e.g. `Name_f1`, `_f2`, …)
- **Delete selected** — remove all selected sprites

### Sprite Properties

When a sprite is selected:

- **Name** — sprite name (max 16 characters)
- **W / H** — dimensions in cells (1-8 × 1-8, each cell = 8×8 pixels)
- **Mode** — Mono, Attributed, or Multicolour
- **Edit** — open the floating sprite editor
- **Use as Brush** — use the sprite as a custom brush on the main canvas

### Grab from Screen

Grab sprites directly from the loaded picture:

- **Grab** button — enter grab mode, drag a rectangle on the canvas
- **Stop** button / Escape — exit grab mode
- **Grab mode:**
  - Single sprite — grab one sprite
  - Sprite phases — grab as animation frames
  - Singles grid — grab grid of individual sprites
  - Phases grid — grab grid of animation frame sets
- **Attr mode:** Mono, Attr, Multicolour
- **Grid options:** Size by cell size or count, with column/row settings and ordering (L→R,T→B or T→B,L→R)

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

For Attributed mode sprites:
- 8-color palette for ink/paper selection
- **Bright** checkbox

### Preview and Animation

- **Preview canvas** — 1× preview of the sprite
- **Onion skin** — show previous frame as ghost overlay
- **Grid** — show pixel grid
- **Show mask** — display the sprite mask
- **Frame navigation:** Previous (**<**), frame counter, Next (**>**)
- **Frame bar** — animation frame thumbnails with multi-select support
  - Click — select a single frame
  - Ctrl+Click — toggle frame in/out of multi-selection
  - Shift+Click — range select from anchor to clicked frame
- **Move Left** (◄) / **Move Right** (►) — reorder selected frame(s)
- **Add frame** (+) — add new animation frame
- **Duplicate frame** (Dup) — duplicate current frame
- **Delete frame** (Del) — delete current or all selected frames (keeps at least 1)
- **Play** — animate the sprite frames
- **Speed** — animation speed slider (1-30)

### Transform Buttons

- **FlipH** / **FlipV** — flip horizontally/vertically
- **RotCW** / **RotCCW** — rotate clockwise/counter-clockwise
- **← → ↑ ↓** — shift sprite 1 pixel in any direction
- **Inv** — invert all pixels
- **Clr** — clear the current frame

---

## 18. Image Import

When loading a PNG, GIF, JPG, WebP, or BMP file, the Image Import dialog opens.

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
  - Floyd-Steinberg, Jarvis, Stucki, Burkes, Sierra, Sierra Lite, Sierra 2-Row, Serpentine, Riemersma, Atkinson, Ordered 4×4, Ordered 8×8, Blue Noise, Pattern, Noise, None

  Default dithering is **None** (nearest color, no dithering applied).

- **Paper color rule** — controls how ink and paper colors are assigned in each cell (not applied to ULA+ format, which uses independent CLUT halves):
  - **Darker color** — default; the darker of the two cell colors becomes paper (per cell, using perceptual luminance). For single-color cells (both ink and paper are the same), the color is checked against a midpoint: dark colors become paper (0 bits), light colors become ink (1 bits)
  - **Lighter color** — the lighter of the two cell colors becomes paper. For single-color cells, the color is checked against a midpoint: light colors become paper (0 bits), dark colors become ink (1 bits)
  - **First pixel paper** — the color of the top-left pixel in each cell becomes paper; useful for spritesheets where a frame pixel marks the background color

- **LAB colors** — use LAB color space for perceptual matching
- **Grayscale** — convert to grayscale before processing
- **Mono output** — output black and white only

#### Output

- **Format:** SCR, ULA+, 53c (attr), IFL (8×2), BMC4 (8×4), MLT (8×1), BSC, RGB3, Mono, Mono 2/3, Mono 1/3
- **Palette** selector
- **53c Pattern** (for 53c format): Checker, Stripes, DD/77
- **ULA+ Palette:** Auto, Load .pal, From picture
- **Position:** X, Y offset
- **Size:** W, H (with lock aspect ratio)
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

### Bottom Controls

- **Zoom:** x1, x2, x3
- **Grid** — show 8×8 grid on output preview
- **Cancel** / **Import** buttons

![Image import dialog](screenshots/image_import.png)

---

## 19. SCA Animation Editor

The SCA editor opens as a full-screen overlay when editing `.sca` animation files.

### Top Bar

- **← Back** — return to the main view
- **Save As...** — save the animation
- **Export SCR...** — export current frame as `.scr`
- **Export 53c...** — export current frame as `.53c`

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

- **F11** — toggle fullscreen editor mode
- **Tab** — toggle the floating palette (tools + colors) in fullscreen
- **Escape** — exit fullscreen or cancel current operation

The floating palette includes all drawing tools, selection/clipboard tools, color palette, and Bright toggle.

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
| F11 | Toggle fullscreen editor |
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
| .scr | 6144 bytes | Monochrome full |
| .scr | 4096 bytes | Monochrome 2/3 |
| .scr | 2048 bytes | Monochrome 1/3 |
| .53c / .atr | 768 bytes | Attributes only |
| .bsc | 11136 bytes | Border screen |
| .ifl | 9216 bytes | 8×2 multicolor |
| .mlt / .mc | 12288 bytes | 8×1 multicolor |
| .bmc4 | 11904 bytes | 8×4 multicolor + border |
| .3 | 18432 bytes | Tricolor RGB |
| .img | 13824 bytes | Gigascreen (2×SCR) |
| .sca | variable | Animation (full/attr-only frames) |
| .specscii | variable | Text mode (32×24 chars + OVER layers) |

### View-Only Formats

| Extension | Description |
|-----------|-------------|
| .zip | Archive (auto-extract, select file from list) |

### Import (Convert to ZX Spectrum)

`.png`, `.gif`, `.jpg`, `.jpeg`, `.webp`, `.bmp` — via the Image Import dialog with dithering and adjustments.

### Nirvana Tile Formats (import to IFL + spriteset)

| Extension | Description |
|-----------|-------------|
| .btile | Nirvana btile (2×2 cells, 16×16px, 48 bytes/tile) |
| .wtile | Nirvana wtile (3×2 cells, 24×16px, 72 bytes/tile) |

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
