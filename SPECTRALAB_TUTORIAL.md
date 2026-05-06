# SpectraLab Tutorial — Step-by-Step Walkthroughs

## 1. Getting Started

### Opening SpectraLab

Open `index.html` in any modern web browser (Chrome, Firefox, Edge, Safari). No installation or server is required — SpectraLab runs entirely in the browser.

### Interface Overview

When SpectraLab opens, you see:

- **Left sidebar** — all controls, file operations, and settings
- **Main canvas** — the image display and editing area (center)
- **Four tabs** at the top of the sidebar: **View**, **Edit**, **Xform**, **Sprites**

The **View** tab is active by default — this is where you control display settings.

### Loading Your First File

You can load a file in two ways:
1. Click the **file input** at the top of the sidebar and browse for a file
2. **Drag and drop** a file directly onto the canvas

SpectraLab supports many formats: `.scr`, `.53c`, `.atr`, `.bsc`, `.bsp`, `.bmc4`, `.ifl`, `.mlt`, `.mc`, `.3`, `.img`, `.hlr`, `.stl`, `.nxi`, `.sl2`, `.specscii`, `.sca`, `.sna`, `.z80`, `.zip`, `.png`, `.gif`, `.jpg`, `.webp`, `.bmp`.

![First launch](screenshots/tutorial_first_launch.png)

---

## 2. Viewing ZX Spectrum Images

### Open a .scr File

Load a standard `.scr` file by clicking the file input or dragging it anywhere onto the window. The image will appear at the default zoom of x2.

### Change Zoom Level

- Use the **Zoom** dropdown in the View tab (x1 through x20)
- Press keys **1-5** for quick zoom levels
- Use **Ctrl+Mouse Wheel** to zoom in/out (works anywhere in the canvas panel area; Ctrl+Wheel over the left sidebar performs normal browser zoom)

### Toggle Grid Overlay

1. Expand the **View Settings** section (click the header)
2. Set the **Paper grid** dropdown to **8px** to see the 8×8 character cell grid
3. Optionally set a **subgrid** (e.g., 2px or 4px) for finer divisions
4. Or press **G** to cycle through grid sizes (None → 8 → 16 → 24px)

### Change Grid Color

If the grid is hard to see against dark or light artwork:
1. In **View Settings**, find the **Grid color** dropdown
2. Select a color preset: **White**, **Gray**, **Black**, **Orange**, **Red**, or **Green**
3. **Default** uses the standard blue grid color

### Change Palette

Select a different display palette from the **Palette** dropdown in View Settings. Different palettes simulate different monitor characteristics and color profiles.

### Load Custom Palette from File

1. Click the 📂 button next to the **Palette** dropdown
2. Select a text file (`.txt`, `.pal`, or `.csv`) containing 15 or 16 color definitions
3. Each line defines one color: `#RRGGBB`, `RRGGBB`, `#AARRGGBB`, `AARRGGBB` (alpha ignored), or `R G B` decimal (0-255)
4. Lines 1-8 define regular colors, lines 9-16 define bright colors (with 15 colors, black is auto-prepended)
5. Comments (`;` or `//`) and blank lines are skipped
6. The palette appears as "Custom (loaded)" in the dropdown
7. To revert, select any built-in palette from the dropdown, or reload the page

### Change Border Color and Size

1. Select a **Border** color: Black, Blue, Red, Magenta, Green, Cyan, Yellow, or White
2. Select a **Border size**: None, Small (16px), or Medium (32px)

### Toggle Flash Animation

- Check/uncheck the **Flash** checkbox, or press **F**
- Flash causes ink and paper colors to swap on cells with the flash attribute enabled

### Display Filters (CRT Effects)

1. In **View Settings**, expand the **Display Filters** section
2. Check the **On** checkbox to enable
3. Choose a preset: **CRT TV**, **Composite**, **VHS**, or **Arcade**
4. Or adjust individual filters: Scanlines, Noise, Composite, Glow, Vignette, Curvature, Smoothing
5. Settings persist across sessions

### View File Info

Expand the **File Info** section to see the file name, size, format, and dimensions. Additional counters update live during editing: **Colors used** shows distinct colors (attribute values for ZX formats, palette indices for NXI/LoRes); **Hidden cells** shows cells where ink equals paper but the bitmap has an invisible pattern (not shown for attribute-only formats like GMX 160, HLR, 53c, STL).

![Viewing a SCR file](screenshots/tutorial_view_scr.png)

---

## 3. Creating a New Picture

1. Click the **New** button (next to Save)
2. In the New Picture dialog, select a format from the dropdown:
   - **Screen (.scr)** is the most common choice — 256×192 pixels with 8×8 color attributes
   - Choose other formats for specific needs (ULA+ for 64 colors, IFL/MLT for multicolor, HLR/STL for low-res gigascreen, etc.)
   - **chr$ (.ch$)** — variable-size interleaved 8x8 cell format
   - **ZXP (.zxp)** — variable-size picture (8-2048px) with ULA or ULA+ palette
3. Click **Create**

The editor automatically switches to the **Edit** tab with a blank canvas ready for drawing.

### Understanding the Blank Canvas

A standard SCR picture has:
- **256×192 pixels** of bitmap data
- **32×24 character cells** (each 8×8 pixels) for color attributes
- Each cell can have one **ink** color and one **paper** color (from 8 colors × 2 brightness levels)

![New picture](screenshots/tutorial_new_picture.png)

---

## 4. Basic Drawing

### Select Colors

1. In the **Edit** tab, click a color in the palette bar to set the **ink** (foreground) color
2. Right-click a color to set the **paper** (background) color
3. The selected ink is marked with **I**, paper with **P**

### Draw with the Pixel Tool

The **Pixel** tool (P) is selected by default:
- **Left-click** on the canvas to draw with ink
- **Right-click** to draw with paper

### Use Line, Rectangle, and Circle Tools

1. Press **L** for Line, **R** for Rectangle, or **O** for Circle/Ellipse
2. Click and drag on the canvas to draw the shape
3. **Left-click** draws with ink, **right-click** draws with paper

### Shape Modifiers

While drawing rectangles or circles:
- Hold **Ctrl** — constrain to perfect square or circle (1:1 ratio)
- Hold **Alt** — draw from center instead of corner
- Hold **Ctrl+Alt** — perfect square/circle from center

### Pick Colors from Canvas

Press **K** to select the Color Picker tool, then:
- **Left-click** on the canvas to pick the ink color from that cell
- **Right-click** to pick the paper color
- Or hold **Alt** and click with any tool for a quick eyedropper

### Understanding Attribute Cells

ZX Spectrum screens have a fundamental constraint: each 8×8 pixel cell can only use **two colors** (ink and paper). If you draw a third color into a cell, the entire cell changes its ink or paper attribute.

This is not a bug — it's how the original ZX Spectrum hardware works. The 8×8 grid overlay (enable it with **G**) helps you see cell boundaries.

![Basic drawing](screenshots/tutorial_basic_drawing.png)

---

## 5. Working with Colors

### Select Ink Color
Click a color in the palette bar. It will be marked with **I** (ink).

### Select Paper Color
Right-click a color in the palette bar. It will be marked with **P** (paper).

### Toggle Bright
Press **B** or check the **Bright** checkbox. Bright mode selects the high-intensity version of the 8 base colors, giving you 16 total colors (but bright applies to both ink and paper in each cell).

### Toggle Flash
Press **F** or check the **Flash** checkbox. Flash makes ink and paper colors swap periodically in the affected cell.

### Swap Ink and Paper
Press **X** to swap the current ink and paper colors.

### Eyedropper
Hold **Alt** and click on the canvas to pick up the ink and paper colors from that cell. This is very useful when you want to match existing colors.

### Understanding Attribute Conflicts
Each 8×8 cell can only have one ink color and one paper color (plus one brightness state). When you draw across cells, the attribute (ink/paper/bright) is applied to each cell you touch. Planning your drawing around the 8×8 grid is a fundamental ZX Spectrum art skill.

![Working with colors](screenshots/tutorial_colors.png)

---

## 6. Using Brushes

### Change Brush Shape

In the **Brush** section of the Edit tab, click a shape button:
- ■ Square, ● Round, — HLine, | VLine, / Stroke, \\ BStroke

### Change Brush Size

- Use the **Size** dropdown (1 to 16 pixels)
- Or press **[** to decrease and **]** to increase brush size

### Capture Custom Brush from Screen

1. Expand the **Custom Brushes** section
2. **Shift+click** on an empty brush slot — this enters capture mode
3. Click and drag on the canvas to select the area to capture
4. The captured brush appears in the slot

### Use a Custom Brush

1. Click the slot with the captured brush to select it
2. Draw on the canvas — the custom brush pattern is used as a stamp

### Clear a Brush Slot

**Ctrl+click** on a brush slot to clear it.

### Save and Load Brush Sets

Use the **Save** (💾) and **Load** (📂) buttons above the brush slots:
- Save as `.slb` format (custom brushes)
- Load `.slb` files or `.768`/`.bin` tileset files

![Using brushes](screenshots/tutorial_brushes.png)

---

## 7. Flood Fill and Cell Fill

### Flood Fill (I)

1. Press **I** to select the Flood Fill tool
2. Click on a pixel — all connected pixels of the same color will be filled with the current ink
3. Right-click to fill with paper color

### Cell Fill (C)

1. Press **C** to select the Fill Cell tool
2. Click on any cell — the entire 8×8 character cell is filled with ink pixels
3. Right-click to fill the cell with paper pixels

### Attribute Recolor (A)

1. Press **A** to switch to Recolor mode
2. Click on cells to change their ink/paper/bright attributes without modifying the bitmap pixels
3. This is useful for recoloring existing artwork

### Cell Invert (J)

1. Press **J** to switch to Cell Invert mode
2. Click (or drag across) cells to swap their ink↔paper and invert the bitmap simultaneously
3. The displayed colors remain identical — only the polarity changes (which pixels are "ink" vs "paper")
4. Useful for manually fixing individual cells in converted images where ink/paper assignment is suboptimal

![Fill tools](screenshots/tutorial_fill.png)

---

## 8. Selection and Clipboard

### Select an Area

1. Press **S** or click the Select (⬚) button in the Xform tab
2. Click and drag on the canvas to define a selection rectangle
3. The selection is shown with a cyan outline

### Copy and Cut

- **Ctrl+C** — copy the selection to clipboard
- **Ctrl+X** — cut the selection (copy + erase original)

### Paste

1. Press **Ctrl+V** to enter paste mode
2. A semi-transparent preview follows your cursor
3. Click to place the pasted content
4. While pasting, use these keys to transform:
   - **R** — rotate 90° clockwise
   - **H** — flip horizontally
   - **V** — flip vertically
5. Press **Escape** to cancel paste mode

### Invert Selection

Press **N** to invert the selection — this swaps ink and paper colors.

### Snap to Grid

Enable **Snap to grid** in the Xform tab to align paste positions to the 8×8 grid.

![Selection and paste](screenshots/tutorial_selection.png)

---

## 9. Using Undo/Redo

- **Ctrl+Z** — undo the last action (up to 32 levels)
- **Ctrl+Y** — redo an undone action
- You can also click the **Undo** and **Redo** buttons in the Xform tab

The undo history is preserved as long as the picture is open. Creating a new picture or loading a different file resets the history.

---

## 10. Adding Text

1. Press **T** or click the Text tool button
2. The **Text** section appears in the Edit tab
3. Type your text in the input field
4. Select a font:
   - **ROM (Spectrum)** — the default ZX Spectrum 8×8 font
   - Click **.768** to load a ZX Spectrum bitmap font (`.768`, `.ch8` format)
   - Click **TTF** to load a TrueType/OpenType font
5. Select font size: 8, 12, 16, 20, 24, or 32
6. Click on the canvas to place the text at that position
7. Text is drawn with the current ink color on the current paper

![Adding text](screenshots/tutorial_text.png)

---

## 11. Importing External Images

### Open the Import Dialog

When you load a `.png`, `.gif`, `.jpg`, `.webp`, or `.bmp` file, the Image Import dialog opens automatically.

The dialog shows two canvases side by side — ORIGINAL (source) and PREVIEW (converted result). Each has a zoom dropdown (Fit, x1–x4 for source; Fit, x1–x5 for preview). The preview also has a **Grid** checkbox to overlay 8×8 attribute boundaries. Scrollbars appear when zoomed images exceed the available space.

### Choose Target Format

In the **Output** section, select the target ZX Spectrum format (SCR, ULA+, IFL, MLT, MLT+ULA+, Gigascreen, HLR, STL, GMX 640×200, GMX 160×200, SPECSCII, ZXP, btile, wtile, etc.).

For **SPECSCII** format, the **Charset** dropdown selects which glyphs are used: **Full** (ROM font + block graphics), **ASCII** (ROM font only), or **UDG** (block graphics only).

For **ZXP** format, you can specify custom width and height (8-2048 pixels, divisible by 8) and choose between ULA and ULA+ palette types.

For **btile** / **wtile** formats (Nirvana engine tiles), you can specify custom canvas size. Width snaps to tile-aligned values (multiples of 16 for btile, 24 for wtile) and height to multiples of 16. Uses 8×2 multicolor attribute cells.

For **MLT+ULA+** format, the ULA+ Palette controls appear — choose **Auto** to generate an optimal 64-color palette from the source image, or **Load .pal** to supply a custom palette file.

For **GMX 640×200** and **GMX 160×200** (Scorpion ZS 256 formats): GMX 640×200 imports at native 640×200 resolution, preserving fine detail (thin text, single-pixel lines) from high-resolution sources. All dithering methods are supported. GMX 160×200 is attribute-only (fixed bitmap pattern) — dithering is not applicable.

### Select Dithering Algorithm

In the **Transform** section, choose a dithering method. Default is **None** (nearest color). Recommended dithering options:
- **Cell Floyd** — good general-purpose cell-aware dithering
- **Cell Atkinson** — lighter dithering, retains more detail
- **Cell Ordered** — structured pattern dithering
- **Floyd-Steinberg** — classic error diffusion
- **Dizzy** — error diffusion with blue-noise-like output (no edge artifacts)
- **a-dither** — fast hash-based threshold dither, spatially stable

Below the dither dropdown:
- **Strength** (0–100%) scales error diffusion intensity; on ordered / pattern / blue-noise / a-dither methods, Strength > 0 engages a hybrid ordered+diffusion mode
- **Serpentine scan** alternates row direction during error diffusion to reduce horizontal banding

### Set Paper Color Rule

The **Paper** dropdown controls how ink and paper colors are assigned per cell (not applied to ULA+ format):
- **Darker color** — default; darker color becomes paper in each cell. For single-color cells, dark colors become paper (0 bits), light colors become ink (1 bits)
- **Lighter color** — lighter color becomes paper in each cell. For single-color cells, light colors become paper (0 bits), dark colors become ink (1 bits)
- **First pixel paper** — the top-left pixel's color in each cell becomes paper (useful for spritesheets where a frame pixel marks the background color)

### Adjust Crop and Fit

In the **Source** section:
- Adjust **X, Y, W, H** to crop the source image
- Click **Detect** to auto-find a 256×192 region
- Enable **4:3** to lock the aspect ratio

In the **Transform** section:
- **Stretch** — stretch to fill (may distort)
- **Letterbox** — fit within target, add black bars
- **Fill/crop** — fill target, crop excess
- **Fit width** / **Fit height** — fit to one dimension

### Fine-Tune with Adjustments

Click the **Adjustments** tab to access:
- Contrast, Brightness, Saturation
- Gamma, Sharpness, Smoothing
- Levels (black/white point)
- Color balance (R, G, B)

All adjustments update the preview in real time. Click the **Reset** button (bottom-right of the panel) to reset all adjustment controls to their default values.

### Tile to Screens

To split a large image into a grid of ZX Spectrum pictures:

1. In the **Output** section, check **Tile to screens**
2. The info line shows the grid size (e.g. 3×4 = 12 pictures)
3. Yellow dashed lines on the original canvas show tile boundaries
4. Use the ◄/► buttons to navigate between tiles — the preview shows the actual converted output for each tile, and the current tile is highlighted on the original canvas
5. Click **Import** — each tile is added as a separate picture tab
6. Edge tiles (last column/row) are padded with black if the source doesn't divide evenly

Position, Size, Fit mode, and Align controls are disabled during tiling since each tile's placement is calculated automatically.

### Apply

Click **Import** to apply the conversion and load the result as an editable picture.

![Importing an image](screenshots/tutorial_import.png)

---

## 12. Working with Sprites

A **spriteset** is a named entry in the sprite list that holds one or more individual **sprites** (animation frames). Each spriteset has fixed dimensions (W × H) and a color mode.

### Create a Spriteset

1. Switch to the **Sprites** tab
2. Click **+ Add** to create a new spriteset
3. Set the spriteset properties:
   - **Name** — give it a descriptive name
   - **W / H** — dimensions in 8×8 cells (e.g., 2×2 = 16×16 pixels); these become locked once you draw content (clear all sprites to unlock)
   - **Mode** — Mono (1-bit), Attributed (with colors), or Multicolour (8×1 / 8×2 / 8×4 attribute cell height); locked after drawing

### Open the Sprite Editor

Click **Edit** (in the toolbar between Add and Delete) to open the floating Sprite Editor panel.

### Draw Sprite Pixels

In the Sprite Editor:
- Use the **Draw** tool (D) to set pixels — left click draws ink (sets bits), right click draws paper (clears bits)
- Use the **Erase** tool (E) to clear pixels — left click erases, right click sets
- Use **Fill** (F) — left click fills with ink, right click fills with paper
- Use **Line** (L) or **Rectangle** (R) for shapes — left click = ink, right click = paper
- For Attributed mode, select colors from the color palette

### Add Animation Sprites

1. Click **+** to add a new sprite (animation frame) to the current spriteset
2. Click **Dup** to duplicate the current sprite
3. Use **< / >** to navigate between sprites
4. Click **Play** to preview the animation
5. Adjust **Speed** slider for animation timing
6. Use the **frame bar** below the preview to click-select sprites
7. **Ctrl+Click** sprites to multi-select, **Shift+Click** for range select
8. Use **◄ / ►** to reorder selected sprites
9. **Del** removes all selected sprites (at least one sprite is always kept)

### Grab Sprites from Screen

1. Make sure you have a picture loaded on the main canvas
2. Set **W / H** and **Mode** in the Spriteset Properties section — these values are used for grab cell size and color mode
3. Click the **Grab** button in the Sprites tab
4. Select the grab mode (Single sprite, Sprite phases, etc.)
5. Drag a rectangle on the canvas to capture sprites — each grab creates a **new spriteset**
6. Press **Escape** or click **Stop** when done

### Multi-Select and Batch Operations

You can select multiple spritesets for batch operations:

1. **Ctrl+Click** spritesets to add/remove them from the selection
2. **Shift+Click** to select a contiguous range
3. **Right-click** on the sprite list to open the context menu:
   - **Merge selected to animation** — combine selected spritesets into one multi-sprite spriteset (must have the same dimensions and mode)
   - **Add frames to…** — copy sprites from selected spritesets to another spriteset
   - **Move frames to…** — move sprites to another spriteset, removing the source spritesets
   - **Split frames to sprites** — break a multi-sprite spriteset into individual single-sprite spritesets
   - **Delete selected** — remove all selected spritesets
   - **Clear all** — remove all spritesets (with confirmation)

### Export Sprites

- **Export ASM** — generate Z80 assembly code for sprite data
- **Export BIN** — export raw binary data
- **Use as Brush** — use the selected sprite as a drawing brush on the main canvas

![Sprite editing](screenshots/tutorial_sprites.png)

---

## 13. Working with ULA+ Format

### Create or Open a ULA+ Picture

1. Click **New** → select **ULA+ (.scr)** → **Create**
2. Or open an existing ULA+ `.scr` file (6976 bytes)

### Understanding ULA+ Colors

ULA+ provides **64 programmable colors** organized in 4 CLUTs (Color Look-Up Tables):
- Each CLUT has 8 ink + 8 paper colors
- Colors are encoded in GRB332 format (3-bit green, 3-bit red, 2-bit blue)
- Ink and paper must come from the same CLUT

### Switch CLUT Banks

In Classic mode, click the CLUT buttons (**0, 1, 2, 3**) to switch between banks:
- CLUT 0: FLASH=0 BRIGHT=0
- CLUT 1: FLASH=0 BRIGHT=1
- CLUT 2: FLASH=1 BRIGHT=0
- CLUT 3: FLASH=1 BRIGHT=1

Toggle between **Grid** mode (all 64 colors) and **Classic** mode with the checkbox.

### Edit Individual Colors

**Ctrl+click** on any palette color to open the color editor:
- Adjust **R** (0-7), **G** (0-7), **B** (0-3) sliders
- See the Original and New color side by side
- Click **Apply** to set the new color

### Copy and Swap Colors

**Shift+click** on any palette color to mark it as the copy source (animated border appears):
- **Click** another color to copy the source's GRB value to it
- **Shift+click** another color to swap both GRB values
- **Click the same cell** or press **Escape** to cancel
- All copy/swap operations support undo (Ctrl+Z)

### Save and Load Palettes

- Click 💾 to save the palette as a `.pal` file
- Click 📂 to load a `.pal` file

![ULA+ editing](screenshots/tutorial_ulaplus.png)

### Viewing ULANext Files (ZX Spectrum Next)

ULANext is an extended palette mode for the ZX Spectrum Next. Unlike ULA+ (which uses 4 CLUTs of 16 fixed-assignment colors), ULANext uses a configurable **ink mask** to split each attribute byte into ink and paper palette indices. This allows much larger palettes — up to 256 ink or 256 paper colors.

1. Open a `.scr` file with ULANext palette (file size 6945–7426 bytes)
2. SpectraLab auto-detects the ink mask and palette from the file
3. The format info panel shows:
   - The ink mask value (e.g., $0F for 16 ink / 16 paper)
   - The number of ink and paper colors
   - Whether the palette uses 8-bit or 9-bit color entries
4. Drawing tools work as usual — the bitmap and attributes are standard SCR format
5. Flash is not available (attribute bits 6-7 are used for palette indexing)
6. Saving preserves the original ink mask and palette

**Valid ink masks and their ink/paper splits:**

| Mask | Ink colors | Paper colors |
|------|-----------|--------------|
| $01  | 2         | 128          |
| $03  | 4         | 64           |
| $07  | 8         | 32           |
| $0F  | 16        | 16           |
| $1F  | 32        | 8            |
| $3F  | 64        | 4            |
| $7F  | 128       | 2            |
| $FF  | 256       | 1            |

### Editing Next Palette Colors (NXI / SL2 / LoRes)

When editing NXI, SL2, LoRes, or LoRes Radastan files, the palette grid supports color editing:

**Ctrl+click** on any palette color to open the color editor:
- Adjust **R** (0-7), **G** (0-7), **B** (0-7) sliders (RGB333 — 512 possible colors)
- See the Original and New color side by side
- The palette index and RGB333 value are displayed
- Click **Apply** to set the new color

**Shift+click** on any palette color to mark it as the copy source (animated border appears):
- **Click** another color to copy the source color to it
- **Shift+click** another color to swap both colors (pixels are remapped automatically)
- **Click the same cell** or press **Escape** to cancel
- All operations support undo (Ctrl+Z)

> **Note:** NXI files embed the palette in the file header — palette edits are always saved. SL2 files with a non-default palette automatically embed the palette after the pixel data on save; files with the default RGB332 palette are saved as raw pixels only. LoRes and Radastan files without an embedded palette do not store the palette — if you edit colors, a warning will appear on save. Radastan files loaded with an embedded palette (6160 or 6176 bytes) will preserve palette changes.

---

## 14. Working with Multicolor Formats (IFL/MLT)

### Create an IFL or MLT Picture

1. Click **New**
2. Select **IFL (.ifl)** for 8×2 multicolor or **MLT (.mlt)** for 8×1 multicolor
3. Click **Create**

### Understanding Multicolor

Standard ZX Spectrum screens have 8×8 pixel attribute cells. Multicolor formats reduce the cell height:
- **IFL (8×2)** — each 8×2 pixel area can have its own ink/paper colors
- **MLT (8×1)** — each 8×1 pixel row can have its own ink/paper colors

This allows significantly more color detail at the cost of a larger file.

### Drawing

Drawing works the same as standard SCR — select ink/paper colors, use drawing tools. The difference is visible in the attribute grid (use **G** to cycle grid sizes) and in the number of available colors per area.

![Multicolor editing](screenshots/tutorial_multicolor.png)

---

## 15. Working with Gigascreen

### Create a Gigascreen Picture

1. Click **New** → select **Gigascreen (.img)** → **Create**

### Understanding Gigascreen

Gigascreen works by alternating two standard SCR frames at ~50Hz. The eye perceives the average of both frames, effectively doubling the available colors. Where a standard screen has 15 colors, Gigascreen can display many more virtual colors.

### Editing Both Frames

The Gigascreen palette shows all virtual colors as a 16-column grid:
- Left-click to select ink
- Right-click to select paper
- The **Cell Colors** section shows the 4 available colors for the current cell

### Preview with Blending

In the View tab, select the Gigascreen display mode:
- **Blend dark** — shows the perceived image as it appears on a real CRT, with darkening from vertical retrace blanking
- **Blend** — shows the blended image at full brightness
- **Emulate flicker** — alternates between frames to simulate real hardware

### Gigascreen Variants: HLR and STL

Two additional gigascreen-based formats offer low-resolution modes with large "fat" pixels:

**HLR (High Lores)** — 32×24 fat pixels (each 8×8 real pixels):
1. Click **New** → select **HLR (.hlr)** → **Create**
2. Each fat pixel is a full 8×8 attribute cell, using the gigascreen palette to blend two frames
3. A user-editable 8-byte fill pattern determines how ink and paper contribute to the perceived color
4. File size: 1536 bytes (two interleaved 768-byte attribute frames)

**STL (Stellar)** — 64×48 fat pixels (each 4×4 real pixels):
1. Click **New** → select **STL (.stl)** → **Create**
2. Uses multicolor attributes (8×4 cell height) with gigascreen blending
3. A fixed bitmap pattern splits each 8-pixel column into left half (paper) and right half (ink)
4. File size: 3072 bytes (two interleaved 1536-byte attribute frames)

Both formats use the same gigascreen palette and Blend dark/Blend/Emulate flicker display modes. Drawing tools (pencil, fill, color picker) work on the fat-pixel level. Only pure ink+ink and paper+paper virtual colors are available per cell half.

![Gigascreen editing](screenshots/tutorial_gigascreen.png)

---

## 16. Working with Scorpion GMX Formats

### Overview

The Scorpion ZS 256 Turbo computer features two extended graphics modes beyond the standard ZX Spectrum screen. Both use 8×1 attribute cells (one attribute per pixel row) with standard ZX Spectrum colors. The display preserves all 640 horizontal pixels and doubles each row vertically (640×400 on screen) to maintain the correct aspect ratio.

### GMX 640×200 (Hi-Res)

1. Open a `.c` file of 32768 bytes, or create a new one via **New** → **GMX 640×200 (.c)**
2. The screen is 640×200 pixels with 80 attribute columns and 200 attribute rows
3. Drawing works the same as standard SCR — pixel and attribute editing, all drawing tools (pencil, line, rectangle, circle, fill, text, brushes), layers, and undo/redo
4. The attribute grid shows 8×1 cells (press **G** to toggle grid visibility)
5. Save with **Ctrl+S** — exports as 32768-byte `.c` file

### GMX 160×200 (Attribute-Only)

1. Open a `.c` file of 16128 bytes (with "GMX\x0F" header)
2. The screen is 160×200 color cells (80 attribute columns × 200 rows, each cell 8 pixels wide × 1 pixel tall)
3. This is an **attribute-only** format — there is no bitmap to edit. Drawing tools recolor cells using the current ink/paper/bright settings
4. Use the **Recolor** tool or any drawing tool to paint attribute cells
5. **Flood fill** works on the attribute cell grid (fills contiguous cells with the same attribute)
6. Save with **Ctrl+S** — exports as 16128-byte `.c` file with the "GMX\x0F" header

### Tips

- Both formats display with doubled rows (640×400 on screen) to preserve all horizontal pixel detail. The grid and all preview overlays account for this automatically.
- The color picker (**I** key) reads the attribute under the cursor for both formats.
- Layers are supported for both formats.

---

## 17. Saving and Exporting

### Save in Native Format

Press **Ctrl+S** or click the **Save** button. The file is downloaded in its original format.

### Convert Between Formats

1. Go to the **Xform** tab
2. Use the **Convert to...** dropdown
3. Select the target format — the picture is converted in place

Conversions include lossless transformations (e.g. NXI ↔ SL2 moves the palette between header and tail) and lossy ones (e.g. SCR → NXI 320×256 renders and upscales the image, NXI/SL2 → SCR downscales and quantizes to ZX attributes). When converting NXI → SL2 with a custom palette, a dialog offers three options: keep palette (embed in SL2), quantize to default RGB332 (lossy), or strip palette (keep pixel indices unchanged). Cross-mode NXI/SL2 conversions between 256×192, 320×256, and 640×256 are also available. SCR → SPECSCII conversion matches each 8×8 cell bitmap to the best ROM font character or block graphic, preserving attributes.

### Optimize Attributes (SCR)

Pictures converted from other software sometimes have suboptimal ink/paper assignments — for example, paper is darker than ink in some cells. This doesn't affect the displayed colors, but makes the monochrome bitmap look worse and compresses poorly.

1. Load an SCR file (or import an image as SCR)
2. Go to the **Xform** tab → **Optimize Attributes** section
3. Choose a mode:
   - **Paper = lighter color** — ensures paper is always the brighter color (most natural look)
   - **Paper = majority pixels** — ensures paper covers more area than ink
   - **Combined** — applies both brightness and majority rules
   - **Minimize ink bits** — minimizes set bits for best compression
4. Click **Apply** — the info label shows how many cells were flipped
5. Undo with Ctrl+Z if needed

### Clean Hidden Cells

When ink equals paper in a cell, any bitmap pattern is invisible — but the non-uniform bytes remain in the file, wasting space and hurting compression. The "Clean Hidden Cells" tool fixes this automatically.

1. Load a file in any supported format (SCR, BSC, IFL, MLT, BMC4, GMX, Gigascreen, ULA+)
2. Go to the **Xform** tab → **Clean Hidden Cells** section
3. Click **Apply** — each hidden cell's bitmap is set to 0x00 or 0xFF based on what the surrounding cells look like (neighbor bitmap density)
4. The info label shows how many cells were cleaned
5. Undo with Ctrl+Z if needed

Check the File Info panel — the "Hidden cells" counter should drop to zero after cleaning.

### Export to Other Formats

1. In the **Xform** tab, select an export format from the dropdown
2. Optionally check **Embed** to embed data
3. Click **Export**

### Export to PNG / GIF

Use the **PNG/GIF** button in the Xform tab to export the current screen as a standard image file.

- The exported image uses all your current View tab settings — zoom, border size and color, grid/subgrid overlays, palette, and display filters — so what you see is what you get.
- For **gigascreen-family formats** (Gigascreen, MGH, HLR, STL, BSP-gigascreen, chr$-gigascreen), a dialog asks you to choose:
  - **Blended (PNG)** — averaged/blended colors in a single image
  - **Flicker (animated GIF)** — two alternating frames at ~50fps, just like real hardware
- For **pictures with flash attributes**, a dialog asks you to choose:
  - **Animated GIF** — two-frame flash animation (320ms per phase), matching ZX Spectrum timing
  - **Static PNG** — normal phase only, no animation
- For all other formats, clicking the button opens a confirmation dialog and exports a PNG directly.

### RCS Export (SCR only)

[RCS (Re-ordered Compressed Screen)](https://github.com/einar-saukas/RCS) by Einar Saukas rearranges SCR bitmap bytes for better compression. To export:

1. Load an SCR file
2. In the **Xform** tab, select `.rcs (RCS reordered)` from the **Export** dropdown
3. Click **Export** — downloads a 6912-byte `.rcs` file
4. Compress the `.rcs` file with ZX7 or another packer for optimal results

The reordering groups spatially related bytes together (sector → column → character row → pixel line), which typically yields significantly smaller compressed output than packing the standard SCR layout directly.

You can also open `.rcs` files directly in SpectraLab — the RCS reordering is automatically reversed on load, converting the data back to standard SCR for viewing and editing.

### ZX7 / ZX0 Compression (SCR only)

SpectraLab includes built-in [ZX7](https://spectrumcomputing.co.uk/entry/27996/ZX-Spectrum/ZX7) and [ZX0](https://github.com/einar-saukas/ZX0) (v2 format) compression by Einar Saukas. For SCR files, the Export dropdown offers:

**Direct export:**

1. Select `.scr.zx7` or `.scr.zx0` — compresses the screen with ZX7 or ZX0
2. Select `.rcs.zx7` or `.rcs.zx0` — applies RCS reordering first, then compression
3. Click **Export** — downloads the compressed file

**Compare all variants:**

1. Select `Compare compressions...` from the Export dropdown
2. Click **Export** — a dialog appears showing nine compression variants:
   - Plain SCR (uncompressed baseline)
   - ZX7 forward / ZX7 backwards
   - RCS + ZX7 forward / RCS + ZX7 backwards
   - ZX0 forward / ZX0 backwards
   - RCS + ZX0 forward / RCS + ZX0 backwards
3. The best (smallest) result is highlighted and pre-selected
4. Select the variant you want and click **Save**
5. Optional: check **Create ASM** before saving to also generate a sjasmplus `.asm` file that decompresses the data directly to screen memory (`device zxspectrum48`, `savesna`)

**Opening compressed files:**

Open `.scr.zx7`/`.scr.zx7b`/`.scr.zx0`/`.scr.zx0b` or `.rcs.zx7`/`.rcs.zx7b`/`.rcs.zx0`/`.rcs.zx0b` files directly — SpectraLab automatically decompresses the data (forward or backward) and reverses RCS reordering if needed.

### Format ASM Export

SpectraLab can generate complete viewer programs as sjasmplus ASM source for several formats. The Export dropdown in the Xform tab shows available options based on the loaded format:

1. Load a picture in a supported format (BSC, Gigascreen, MGH, RGB3, IFL, ULA+, NXI, or SL2)
2. In the **Xform** tab, the **Export** dropdown appears with the ASM option (e.g. "ASM (Next Layer 2 .nex)")
3. Optionally toggle **Embed** — checked embeds pixel data as DB lines, unchecked uses INCBIN references to the original file
4. Click **Export** to download the .asm file
5. Assemble with sjasmplus to produce a .sna (Pentagon) or .nex (Next) file ready to run in an emulator or on real hardware

Supported formats: BSC (border effects), Gigascreen/MGH (dual-screen), RGB3 (RGB flicker), IFL (8×2 multicolor), ULA+ (64-color palette), and NXI/SL2 (Next Layer 2 in all modes: 256×192, 320×256, 640×256).

### ASM Code Export

For game developers who need sprite/screen data as Z80 assembly:

1. Select an area using the **Select** tool (S)
2. In the Xform tab, the **Export Selection to ASM** section appears
3. Configure options:
   - **Include attributes** — include color data
   - **Attribute mode** — after bitmap or interleaved
   - **Line mode** — line-based or block-based DEFB statements
   - **Direction** — left-to-right, right-to-left, or zigzag
   - **Visual comments** — add █· block art comments
4. Click **Save ASM file** or **Copy** to clipboard

![Saving and exporting](screenshots/tutorial_export.png)

---

## 18. Working with SCA Animations

### Open an SCA File

Load a `.sca` file. The animation controls appear below the main tabs.

### Import Animated GIF

When you open a multi-frame animated GIF, the standard Image Import dialog opens. A **mode dropdown** appears next to the Import button:

1. Open an animated GIF file (via Open or drag-and-drop)
2. The import dialog opens with dithering/format/adjustment controls as usual
3. Select the import mode from the dropdown:
   - **Picture** — import the first frame as a static picture using the selected format and settings
   - **Flash** (2-frame GIFs only) — convert both frames into a single SCR with FLASH attributes. Cells that differ between the two frames use the FLASH bit to alternate ink↔paper every 320ms; identical cells remain static
   - **Animation** — convert all frames to an SCA animation. Per-frame delays from the GIF are preserved. After import, the full SCA editor is available (filmstrip, playback, trim, delay editing, optimize, export)
4. Click **Import** to apply

### Navigate Frames

- Click **<** / **>** to step through frames
- Use the **frame slider** to scrub
- Press **Space** to play/pause
- Press **Left/Right** arrow keys for frame-by-frame navigation

### Edit an SCA Animation

The SCA editor opens as a fullscreen overlay. Here you can:

1. **Trim frames** — remove frames from the start or end
2. **Adjust delays** — set frame timing, apply to current or all frames
3. **Optimize** — remove consecutive duplicate frames
4. **Preview** — play the animation with live preview

### Save and Export

- **Save As...** — dropdown with export options:
  - **SCA** — save as SCA animation
  - **SCR zip** — export all frames as SCR files in a ZIP
  - **53c zip** — export all frames as 53c attribute files in a ZIP
  - **GIF** — export as animated GIF with per-frame delay
  - **PNG zip** — export as numbered PNG images in a ZIP

![SCA animation](screenshots/tutorial_sca.png)

---

## 19. Using Reference Images

### Load a Reference Image

1. In the **View** tab, expand the **Reference Image** section
2. Click **Load** and select any image file
3. The reference image appears behind the canvas at reduced opacity

### Adjust the Reference

- **Opacity** slider — control transparency (5% to 80%)
- **X / Y** — position the reference relative to the canvas
- **W / H** — resize the reference (leave empty for auto-fit)
- **Show** checkbox — toggle visibility

### Draw Over the Reference

Switch to the **Edit** tab and draw normally. The reference image shows through the canvas, helping you trace or match proportions. This is especially useful when converting real-world images to ZX Spectrum format.

### Clear the Reference

Click **Clear** to remove the reference image.

> **Tip:** Reference images are preserved in workspace files (.slw).

![Reference image](screenshots/tutorial_reference.png)

---

## 20. Editing Fonts

The Font Editor lets you create and modify ZX Spectrum bitmap fonts — both fixed-width 8×8 fonts and FZX proportional fonts. Supports up to 1024 glyphs in a single unified buffer.

### Opening the Font Editor

1. In the View tab, find the bottom bar with "SpectraLab" and click the **Font** link
2. The Font Editor opens in a new browser tab
3. The ZX Spectrum ROM font (96 glyphs) is loaded by default

### Creating a New Font

1. Click the **New ▾** dropdown in the header
2. Choose from: 96 glyphs, 256 glyphs, custom glyph count (up to 1024), exploded (256 interlaced), or new FZX font

### Loading an Existing Font

1. Click **Load** in the header
2. Browse to a font file (`.768`, `.ch8`, `.bin`, `.SpecCHR`, `.fnt`, or `.fzx`)
3. The editor auto-detects the glyph count from the file size
4. For 2048-byte files, a visual chooser shows both normal and interlaced interpretations side by side — click the one that looks correct

### Editing Glyph Pixels

1. Click a glyph in the left grid to select it (or use **arrow keys** to navigate)
2. The glyph appears zoomed in the center panel (50× zoom for 8×8, dynamic for FZX)
3. Choose a drawing tool from the **Tools** row (or press **P** / **L** / **R** / **O** / **E**):
   - **Pixel** (P) — click/drag to toggle pixels (left click = XOR toggle, right click = clear)
   - **Line** (L) — drag to preview a line, release to draw (left = set, right = clear)
   - **Rectangle** (R) — drag to preview, release to draw (left = outline, right = filled)
   - **Circle** (O) — drag to preview, release to draw (left = outline, right = filled)
   - **Eraser** (E) — drag to erase pixels (left = freehand, right = erase rectangle area)
4. For shape tools, moving the mouse outside the canvas cancels the shape
5. Changes are reflected immediately in the grid
6. Check **Whole font** to apply pixel changes to all glyphs at once (respects per-glyph width in variable mode)
7. Use **Ctrl+C** to copy a glyph and **Ctrl+V** to paste (works across fixed/FZX modes)

### Applying Transforms

1. Select a glyph (or check **Whole font** for batch operation)
2. Use the **Scroll** arrows to shift pixels with wrap-around
3. Click **Invert** to flip all bits, or **Clear** to erase
4. Use the **Transform** dropdown for advanced operations: bold, italic, flip, rotate, and align (left/right/top/bottom)
5. Keyboard shortcuts: **B** = bold right, **I** = invert, **Delete** = clear
6. Use **Ctrl+Z** to undo any change, **Ctrl+Y** or **Ctrl+Shift+Z** to redo

### Managing Glyph Count

1. Use the **Glyphs** input (right of preview) to change the number of glyphs (1–1024)
2. Changing the count preserves existing glyph data and character mapping
3. Use the **Append** button to load a font file and add its glyphs after existing ones
4. This control works for both fixed-width and FZX fonts

### Converting Between Formats

1. Click the **→ FZX** button to convert a fixed-width font to FZX proportional format (calculates visual width per glyph and left-aligns the bitmap)
2. In FZX mode, click **→ Fixed** to convert back (clips to 8×8, applies shift offsets)

### Setting Up Character Mapping

1. Select a starting glyph in the grid
2. Type the characters to map in the **Characters** field (e.g., `ABCDEFGHIJ`)
3. Click **Map** — each character maps to consecutive glyphs
4. For Cyrillic fonts, use **From (Cyr) / To (Lat)** fields to remap lookalike characters

### Saving Your Font

1. Click **Save** — the editor automatically chooses the right action based on your font:
   - **96 glyphs** → saves `.768` directly (standard ZX Spectrum font)
   - **21 glyphs** → saves `.udg` directly
   - **256 glyphs** → a dialog asks Normal or Interlaced (pre-selects the current format)
   - **117 glyphs** (96+21) → choose between Single file, Font+UDG, or UDG+Font byte order
   - **>256 glyphs** → a range dialog lets you pick the first glyph and count to export
   - **Other counts** → saves `.bin` directly
   - **FZX fonts** → saves `.fzx` directly
2. Use **Export .metrics** to save character mappings as a JSON file
3. The `.metrics` file can be imported later to restore your mappings

> **Tip:** The Font Editor shares the same light/dark theme as SpectraLab. Toggle it in either window and the other picks it up on reload.

---

## 21. ZGS Scene Editor

The ZGS Editor lets you create and preview ZGS (ZX Graphics Script) vector scenes — a bytecode format used in ZX Spectrum adventure games for compact, resolution-independent graphics.

### Opening the ZGS Editor

1. In the Tools tab, click the **ZGS Editor** link
2. The editor opens in a new browser tab with a template scene
3. The preview canvas shows the rendered result immediately

### Creating a Scene from Scratch

1. Click **New** to start with a template
2. Edit the text in the left panel using ZGS assembly syntax:
   ```
   ; Set colors
   set_paper blue
   set_ink white bright
   clear_region 0, 0, 32, 24, 0x09

   ; Draw a house
   move_abs 30, 60
   rect_fill_abs 30, 60, 30, 25
   polygon_fill 30 60, 45 45, 60 60

   ; Done
   end
   ```
3. The preview auto-updates 500ms after you stop typing
4. Click **Render** to force an immediate re-render

### Working with ZGS Assembly

ZGS assembly uses logical coordinates (0–127 for X, 0–95 for Y) that map to screen pixels at 2x scale (256x192). Key instructions:

- **Colors:** `set_ink <color> [bright]`, `set_paper <color> [bright]`, `set_attr 0xNN`
  - Colors: `black`, `blue`, `red`, `magenta`, `green`, `cyan`, `yellow`, `white`
- **Patterns:** `set_pattern <name>` — `solid`, `empty`, `checker`, `dots25`, `dots12`, `horizontal`, `vertical`, `diagonal`
- **Draw mode:** `set_mode xor` (toggle pixels instead of setting), `set_mode set` (default — always set pixels)
- **Movement:** `move_abs x, y` (absolute), `move_short dx, dy` (small delta), `move_dmed dx, dy` (medium delta)
- **Lines:** `line_dmed dx, dy`, `hline_chain length`, `vline_abs x, y, length`
- **Shapes:** `rect_fill_abs x, y, w, h`, `circle_fill_abs cx, cy, r`, `polygon_fill x1 y1, x2 y2, ...`
- **Fill:** `flood_abs x, y` (flood fill from point), `flood_chain` (from current pen)
- **Regions:** `clear_region col, row, w, h, attr` (clear character cells)
- **Assets:** define reusable shape scripts (`.sub`/`.endsub`) and sprites (`.sprite`/`.endsprite`), invoke with `call N` or `stamp_abs N, x, y`
- **Text:** `set_cursor col, row` (set text cursor to character cell), `print_text "string"` (print ASCII text using ROM font), `print_packed "string"` (dictionary-compressed text, 30–50% smaller)
- **Loops:** `.repeat count, stride_x, stride_y` ... `.endrepeat`
- **Control:** `wait_key` (pause), `end` (halt)

### Adding Text to Scenes

ZGS supports printing text using the ZX Spectrum ROM font (8×8, characters 32–127). The text cursor uses character cell coordinates (col 0–31, row 0–23):

```
; Set colors for text
set_attr 0x47          ; white ink on black paper

; Place cursor and print
set_cursor 5, 10
print_text "Hello, Spectrum!"

; Print more text at a different position
set_ink yellow bright
set_cursor 5, 12
print_text "ZGS Text Demo"
```

The cursor advances after each character. When it reaches column 32, it wraps to the beginning of the next row. Text uses the current attribute for coloring.

### Mixing Text Modes (32-col, 42-col, 64-col)

ZGS supports three text widths for different density requirements. Each mode uses independent cursor tracking:

```
; Standard 32-column (8px wide)
set_cursor 0, 0
print_text "32-col: Standard width"

; 42-column (6px wide) for more text per line
set_cursor_42 0, 2
print_text_42 "42-col: Narrower characters, 42 per line"

; 64-column (4px wide) for maximum density
set_cursor_64 0, 4
print_text_64 "64-col: Very narrow, 64 chars/line, ideal for data tables"
```

Each text mode uses a separate font binary: `font_8x8.bin` (32-col), `font_6x8.bin` (42-col, top 6 bits of 8×8), `font_4x8.bin` (64-col, derived by OR-ing column pairs). You can replace any font binary with a custom design for each mode independently. Each mode has its own cursor position, so you can freely mix modes in one scene.

### Packed Text (Compressed)

For longer text passages (adventure game descriptions, dialogue), use `print_packed` to save space:

```
set_cursor 0, 0
print_packed "You are in a dark room. There is a door to the north."
```

`print_packed` looks identical to `print_text` when rendered, but the bytecode is 30–50% smaller for English text. It uses a dictionary of common bigrams (2-char pairs), trigrams (3-char sequences), and whole words. The `.dict` directive selects the dictionary:

```
.dict lower              ; lowercase English (default)
.dict upper              ; uppercase English
.dict user               ; custom dictionary loaded from .zdict file
```

To use a custom dictionary optimized for your game's text, select "Dict: user" from the dropdown and click "Load .zdict". You can generate custom dictionaries with `zgs_mkdict.py`:

```
python zgs_mkdict.py mytexts/*.zgt -o mygame.zdict
```

### Animated Playback

1. Click **Play** to watch the scene being drawn step by step (one opcode per tick)
2. Adjust the **Speed** slider to control animation speed (5ms = fast, 500ms = slow)
3. Click **Step** to execute a single opcode manually
4. Click **Pause** to stop the animation

### Using a Reference Image

You can load a reference image to trace or use as a drawing guide:

1. Click the **Reference Image** header below the playback controls to expand the panel
2. Click **Load** and select any image file (PNG, JPG, etc.)
3. The image appears semi-transparent over the preview canvas at 30% opacity
4. Adjust **Opacity** (5–80%), position (**X/Y**), and display size (**W/H**) as needed
5. Toggle **Show** to hide/reveal the reference without removing it
6. Click **Clear** to remove the reference image entirely

Each scene stores its own reference image. When you add a new scene, it inherits the current scene's reference image and settings. Reference images are saved in `.zgp` project files.

### Opening Existing Files

- Click **Open** to load a `.zgs` (binary) or `.zgt` (text) file
- Binary `.zgs` files are automatically disassembled to editable text
- Drag and drop a file onto the page to open it

### Saving Your Work

Click the **Save** button to open a dropdown menu with format choices:

- **Save .zgs** — assemble the text to binary ZGS format (reports errors if assembly fails)
- **Save .zgt** — save the text source as-is

### Error Handling

Assembler errors appear in the status bar with line numbers (e.g., "Line 15: Unknown mnemonic: rect_filll"). Fix the error and the preview updates automatically. The VM has a safety limit of 1M opcodes to prevent infinite loops.

---

## 22. Tips and Hidden Features

### Workspace Save/Load
Save all your open pictures at once with **Save Workspace** in the Xform tab. Load them back later — preserving layers, sprites, settings, and reference images. Workspace buttons are always available in the Xform tab, even without a loaded picture.

### Save All Pictures (ZIP / GIF / SCA)
When 2+ pictures are open, the Xform tab shows four extra buttons that bundle every open picture into one file:
- **ZIP (originals)** — every picture in its native binary format (`.scr`, `.bsc`, `.ifl`, …) inside a single zip.
- **ZIP (PNG / GIF)** — every picture rendered with current view settings (zoom, border, palette, filters); flashing pictures become animated GIFs.
- **Animated GIF** — one combined GIF with all pictures as frames at 500 ms each (flashing pictures contribute two phase frames). All pictures must render to the same canvas size.
- **SCA** — one SCA animation with all pictures as SCR frames at 500 ms each. Requires every picture to be plain SCR (256×192, 6912 bytes).

The active picture is restored after each save, so editing isn't disturbed.

### Barcode Brushes
For BSC/BSP/BMC4 border formats, use barcode slots to capture and stamp border stripe patterns. Shift+click a slot to capture from the border.

### Gradient Tool Dither Patterns
The Gradient tool (D) supports 6 gradient types (Linear, Radial, Diamond, Conical, Square, Spiral) with Bayer or Blue Noise dithering. Great for backgrounds.

### Dither Brush Tool
After importing an image, press **W** to activate the Dither Brush. Paint over cells to re-dither them with a different algorithm — useful for mixing dithering styles in one picture (e.g. ordered dithering for sky, Floyd-Steinberg for detailed areas). Choose the method, brush diameter (3–16 px), and strength in the settings panel. The brush is round and pixel-accurate. To re-dither a rectangular region at once, select an area first and press **Shift+W**.

### Tileset Brush Mode
Load a `.768` font file into the brush system to get a tileset tab. Each character becomes a stampable brush — ideal for tile-based game screens.

### Masked Paint Modes
Select a custom brush, set paint mode to **Masked** or **Mask+**, then draw with any brush shape/size. The custom brush acts as a repeating stencil pattern.

### QR Code Generation
Generate QR codes directly on the ZX Spectrum screen via the Xform tab. Supports V1-V20 with adjustable module size (1-8 pixels).

### Memory Viewer for Snapshots
After loading a `.sna` or `.z80` snapshot, use the Memory Viewer to browse raw memory as 1-bit graphics. Navigate by bytes, lines, rows, sprites, or pages. Grab sprites directly from memory into the sprite list.

### Multiple Pictures via Tab Bar
Open multiple files — each gets its own tab. Switch between them instantly. Modified files are marked with a dot.

### Fullscreen Mode
Press **F11** to toggle fullscreen from any tab. In viewer mode, only the canvas is shown (with active display filters). In editor mode, the floating tool palette and preview panel are also visible. Press **Tab** to show/hide the floating tool palette (editor only). Press **Escape** to exit.

### Layers
Use the Layers feature (Edit tab) for non-destructive editing. Add layers, reorder them, and flatten when done. Save projects with layers as `.slp` files.

### Keyboard Layout Independence
All keyboard shortcuts work based on physical key positions, so they function correctly with any keyboard layout (Russian, German, etc.).

### Brush Preview
Press **` (backtick)** to toggle a semi-transparent brush preview that follows your cursor, showing exactly where pixels will be placed.

### Snap Modes
The Snap dropdown in the Edit tab controls how the cursor aligns. Use **Zero** or **Brush** snap modes for pixel-perfect tile placement when pasting repeating patterns.

### 53c/127c Pattern Palette
When editing .53c or .atr files, a pattern color palette replaces the standard ink/paper picker. Sort colors by Hue, RGB value, or attribute byte. Use the "Blend colors" checkbox to see averaged solid colors instead of dither patterns.

### chr$ Format
Open, view, edit, and save `.ch$`/`.chr$`/`.ch-` files — a variable-size interleaved 8x8 cell format with optional Gigascreen support.

### Color Picker Tool
Press **K** to select the Color Picker tool. Works across all editable formats including 53c, ULA+, Gigascreen, and RGB3.

### Grid Color
If the grid overlay is hard to see on dark artwork, change the grid color preset in View Settings (White, Gray, Black, Orange, Red, Green).

### Light/Dark Theme
Click the moon/sun button (☽/☀) next to the Help button to toggle between light and dark themes. The theme is auto-detected from your OS preference on first visit.

### Display Filters
Apply CRT-style post-processing effects from the Display Filters section in the View tab. Choose from presets (CRT TV, Composite, VHS, Arcade) or customize individual effects. Filters are preserved in workspace files.

---

## ZGS Editor — Drawing Vector Scenes

The ZGS Editor lets you create vector graphics scenes using ZGS (ZX Graphics Script) — a compact bytecode format for ZX Spectrum. Open it from the **Tools** tab → **ZGS Editor**.

### Quick Start: Drawing a Simple Scene

1. Click **New** — you get a template with a blue background and a white rectangle.

2. **Set colors visually:** Use the **Ink...** dropdown on the command toolbar to pick `Yellow`, then check **Brt** for bright mode. This inserts `set_ink yellow bright` into the source.

3. **Draw a rectangle:** Click the **RectF** tool in the shape toolbar. Drag on the canvas to define a filled rectangle. A yellow rubber-band shows the preview. On release, `rect_fill_abs x, y, w, h` is inserted and the canvas updates instantly.

4. **Draw a circle:** Click **Circle**, drag from center outward. Release to insert `circle_outline_abs cx, cy, r`.

5. **Add a line:** Click **Line**, left-drag from start to end. This inserts `move_abs x0, y0` followed by `line_dmed dx, dy`. For multi-segment polylines, **right-drag** instead — after releasing, a rubber band continues from the endpoint; right-drag again to add more segments, left click or Esc to finish.

6. **Place dots:** Click **Dot**, then click individual points on the canvas.

7. **Clear a region:** Click **ClearR**, drag over the area you want to clear. The selection snaps to 8×8 character cells (shown as a red dashed rectangle). This inserts `clear_region col, row, w, h, attr`.

8. **Add text:** Click **Text**, then click a character cell on the canvas to place `set_cursor col, row`. Type your text in the toolbar input field and click **Print** to insert `print_text "..."`. Text is rendered using the ZX Spectrum ROM font (8×8). Cursor placement and text printing are separate commands, so you can draw between them.

### Using the Command Toolbar

The second toolbar row provides quick insertion of non-drawing commands:

- Pick **Ink** or **Paper** from the dropdowns to change colors. Check **Brt** for bright variants. The dropdown label updates to show the current selection (e.g., "Ink: red").
- Pick a **Pattern** (Solid, Empty, Checker, Dots25, Dots12, Horiz, Vert, Diag) for pattern-filled shapes.
- Click **XOR** to switch to XOR drawing mode (pixels toggle instead of being set). Click **SET** to go back.
- Click **Clear** to insert a full-screen clear with the current attribute.
- Click **WaitKey** to pause playback until a key is pressed (useful for multi-scene animations).

### Coordinate Picking

Hover over the canvas to see coordinates in the tooltip (top-right) and status bar. When you need to type coordinates manually:

- **Left-click** with the **Cursor** tool copies `lx, ly` to your clipboard
- **Right-click** anywhere also copies coordinates to clipboard

Paste them into your source code wherever needed.

### Step-by-Step Debugging

Click **Step** to execute one opcode at a time. The editor highlights the current source line in the textarea, and the pen crosshair (green, semi-transparent) shows where the pen is on the canvas.

Use **Play** for continuous animated playback. Adjust the **Speed** slider to control the delay between steps.

### Grid Overlay

Check the **Grid** checkbox to show an 8×8 character cell grid over the canvas. Thin orange lines mark every character cell boundary. Two brighter lines at y=64 and y=128 mark the screen third boundaries (important for ZX Spectrum screen memory layout). The grid state persists across sessions.

### Theme Toggle

Click the **☾/☀** button in the header bar to switch between dark and light themes. The theme syncs with the main SpectraLab and Font Editor — changing it in one place updates all editors.

### Multi-Scene Projects

The ZGS Editor supports multiple scenes in a single project. Use the tab bar below the header to manage scenes:

1. Click the **+** button to add a new scene
2. Click a tab to switch between scenes — each scene has its own source text, undo/redo history, and preview
3. Double-click a tab name to rename it
4. Click the **×** button on a tab to delete it (at least one scene must remain)

Save your multi-scene project by clicking **Save** and choosing **Save .zgp** to preserve all scenes. Load it later by opening a `.zgp` file or by dragging it onto the page.

### Saving Your Work

Click the **Save** button to open a dropdown menu with format choices:

- **Save .zgs** — assemble and save the active scene as compact binary (for use in ZX Spectrum programs)
- **Save .zgt** — save the active scene as human-readable text source (for continued editing)
- **Save .zgp** — save the entire multi-scene project for later editing
- **Save .asm** — export all scenes as a complete sjasmplus Z80 assembly file with the ZGS player library. Downloads a `.zip` containing the `.asm` file, compiled `.zgs` binaries for each scene, and a packed text dictionary. Run `sjasmplus project.asm` to produce a ready-to-run `.sna` snapshot

The exported `.asm` file uses a config block with 4 JP entry points at fixed addresses. You can programmatically select which scene to display by poking the scene index into `scene_num` (ORG+0x12) and calling `show_by_num` (ORG+0x03). The `clear_color` field (ORG+0x13) controls the attribute byte used when clearing the screen.

### Conditional Compilation

The exported `.asm` file includes `DEFINE` flags at the top for each optional feature group. All are enabled by default. Comment out any `DEFINE` line to exclude that feature from the binary, reducing size. Each comment shows the approximate byte savings:

| DEFINE | ~Bytes | Feature |
|--------|-------:|---------|
| `ZGS_USE_LINES` | 443 | Line, hline, vline drawing |
| `ZGS_USE_RECTS` | 636 | Rectangle outline/fill, clear_region |
| `ZGS_USE_CIRCLES` | 612 | Circle outline/fill |
| `ZGS_USE_POLYGONS` | 666 | Polygon outline/fill |
| `ZGS_USE_FLOOD` | 2166 | Flood fill (includes 1280 bytes of buffers) |
| `ZGS_USE_TEXT` | 180 | set_cursor, print_text (+ 768-byte font_8x8.bin) |
| `ZGS_USE_PACKED_TEXT` | 724 | print_packed (includes ~520 byte dictionary) |
| `ZGS_USE_TEXT_42` | 968 | 42-col text (+ 768-byte font_6x8.bin) |
| `ZGS_USE_TEXT_64` | 968 | 64-col text (+ 768-byte font_4x8.bin) |
| `ZGS_USE_STAMPS` | 146 | Stamp (sprite blit) |

`ZGS_USE_TEXT`, `ZGS_USE_TEXT_42`, and `ZGS_USE_TEXT_64` are auto-detected from the scene source — they are enabled only when the corresponding text opcodes are used. Other DEFINEs are active by default. Each text mode includes its font binary via `incbin`; you can replace any `font_*.bin` with a custom font.

For example, if your scene only uses lines and 42-col text:

```asm
    DEFINE ZGS_USE_LINES
;   DEFINE ZGS_USE_RECTS
;   DEFINE ZGS_USE_CIRCLES
;   DEFINE ZGS_USE_POLYGONS
;   DEFINE ZGS_USE_FLOOD
;   DEFINE ZGS_USE_TEXT
    DEFINE ZGS_USE_PACKED_TEXT
    DEFINE ZGS_USE_TEXT_42
;   DEFINE ZGS_USE_TEXT_64
;   DEFINE ZGS_USE_STAMPS
```

If you disable all drawing features (lines, rects, circles, polygons, flood, stamps) and keep only text, the coordinate system — dot/move handlers, `plot_pixel`, math helpers, and pattern/mask tables — is automatically excluded via the internal `ZGS_HAS_DRAWING` flag, saving additional space.

Dependencies: `ZGS_USE_PACKED_TEXT` requires `ZGS_USE_TEXT`. Rect outlines and polygon outlines call `draw_line`, so if you use those, keep `ZGS_USE_LINES` enabled too. The user is responsible for ensuring disabled opcodes don't appear in the scene data.

After assembling, the output shows `size: NNNN` — the total binary size in bytes, so you can see the effect of disabling features.

### Tips

- All drawing tools insert instructions **before** the `end` statement automatically.
- You can freely mix visual drawing with manual text editing — the text is always the source of truth.
- Lines after `end` are ignored by the assembler, so you can add notes there.
- The preview auto-renders 500 ms after you stop typing.
