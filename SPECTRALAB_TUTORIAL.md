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

SpectraLab supports many formats: `.scr`, `.53c`, `.atr`, `.bsc`, `.bmc4`, `.ifl`, `.mlt`, `.mc`, `.3`, `.img`, `.specscii`, `.sca`, `.sna`, `.z80`, `.zip`, `.png`, `.gif`, `.jpg`, `.webp`, `.bmp`.

![First launch](screenshots/tutorial_first_launch.png)

---

## 2. Viewing ZX Spectrum Images

### Open a .scr File

Load a standard `.scr` file by clicking the file input or dragging it onto the canvas. The image will appear at the default zoom of x2.

### Change Zoom Level

- Use the **Zoom** dropdown in the View tab (x1 through x20)
- Press keys **1-5** for quick zoom levels
- Use **Ctrl+Mouse Wheel** to zoom in/out smoothly

### Toggle Grid Overlay

1. Expand the **View Settings** section (click the header)
2. Set the **Paper grid** dropdown to **8px** to see the 8×8 character cell grid
3. Optionally set a **subgrid** (e.g., 2px or 4px) for finer divisions
4. Or press **G** to cycle through grid sizes (None → 8 → 16 → 24px)

### Change Palette

Select a different display palette from the **Palette** dropdown in View Settings. Different palettes simulate different monitor characteristics and color profiles.

### Change Border Color and Size

1. Select a **Border** color: Black, Blue, Red, Magenta, Green, Cyan, Yellow, or White
2. Select a **Border size**: None, Small (16px), or Medium (32px)

### Toggle Flash Animation

- Check/uncheck the **Flash** checkbox, or press **F**
- Flash causes ink and paper colors to swap on cells with the flash attribute enabled

### View File Info

Expand the **File Info** section to see the file name, size, format, and dimensions.

![Viewing a SCR file](screenshots/tutorial_view_scr.png)

---

## 3. Creating a New Picture

1. Click the **New** button (next to Save)
2. In the New Picture dialog, select a format from the dropdown:
   - **Screen (.scr)** is the most common choice — 256×192 pixels with 8×8 color attributes
   - Choose other formats for specific needs (ULA+ for 64 colors, IFL/MLT for multicolor, etc.)
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

### Choose Target Format

In the **Output** section, select the target ZX Spectrum format (SCR, ULA+, IFL, MLT, etc.).

### Select Dithering Algorithm

In the **Transform** section, choose a dithering method. Default is **None** (nearest color). Recommended dithering options:
- **Cell Floyd** — good general-purpose cell-aware dithering
- **Cell Atkinson** — lighter dithering, retains more detail
- **Cell Ordered** — structured pattern dithering
- **Floyd-Steinberg** — classic error diffusion

### Set Paper Color Rule

The **Paper** dropdown controls how ink and paper colors are assigned per cell:
- **Auto** — default, determined by palette order
- **Darker color** — darker color becomes paper in each cell. For single-color cells, dark colors become paper (0 bits), light colors become ink (1 bits)
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

All adjustments update the preview in real time.

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

### Create a Sprite

1. Switch to the **Sprites** tab
2. Click **+ Add** to create a new sprite
3. Set the sprite properties:
   - **Name** — give it a descriptive name
   - **W / H** — dimensions in 8×8 cells (e.g., 2×2 = 16×16 pixels)
   - **Mode** — Mono (1-bit), Attributed (with colors), or Multicolour

### Open the Sprite Editor

Click **Edit** to open the floating Sprite Editor panel.

### Draw Sprite Pixels

In the Sprite Editor:
- Use the **Draw** tool (D) to set pixels — left click draws ink (sets bits), right click draws paper (clears bits)
- Use the **Erase** tool (E) to clear pixels — left click erases, right click sets
- Use **Fill** (F) — left click fills with ink, right click fills with paper
- Use **Line** (L) or **Rectangle** (R) for shapes — left click = ink, right click = paper
- For Attributed mode, select colors from the color palette

### Add Animation Frames

1. Click **+** to add a new frame
2. Click **Dup** to duplicate the current frame
3. Use **< / >** to navigate between frames
4. Click **Play** to preview the animation
5. Adjust **Speed** slider for animation timing
6. Use the **frame bar** below the preview to click-select frames
7. **Ctrl+Click** frames to multi-select, **Shift+Click** for range select
8. Use **◄ / ►** to reorder selected frames
9. **Del** removes all selected frames (at least one frame is always kept)

### Grab Sprites from Screen

1. Make sure you have a picture loaded on the main canvas
2. Click the **Grab** button in the Sprites tab
3. Select the grab mode (Single sprite, Sprite phases, etc.)
4. Drag a rectangle on the canvas to capture sprites
5. Press **Escape** or click **Stop** when done

### Multi-Select and Batch Operations

You can select multiple sprites for batch operations:

1. **Ctrl+Click** sprites to add/remove them from the selection
2. **Shift+Click** to select a contiguous range
3. **Right-click** on the sprite list to open the context menu:
   - **Merge selected to animation** — combine selected sprites into one multi-frame sprite (sprites must have the same dimensions and mode)
   - **Add frames to…** — copy frames from selected sprites to another sprite
   - **Move frames to…** — move frames to another sprite, removing the source sprites
   - **Split frames to sprites** — break a multi-frame sprite into individual single-frame sprites
   - **Delete selected** — remove all selected sprites

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

### Save and Load Palettes

- Click 💾 to save the palette as a `.pal` file
- Click 📂 to load a `.pal` file

![ULA+ editing](screenshots/tutorial_ulaplus.png)

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
- **Average** — shows the blended (perceived) image
- **Flicker** — alternates between frames to simulate real hardware

![Gigascreen editing](screenshots/tutorial_gigascreen.png)

---

## 16. Saving and Exporting

### Save in Native Format

Press **Ctrl+S** or click the **Save** button. The file is downloaded in its original format.

### Convert Between Formats

1. Go to the **Xform** tab
2. Use the **Convert to...** dropdown
3. Select the target format — the picture is converted in place

### Export to Other Formats

1. In the **Xform** tab, select an export format from the dropdown
2. Optionally check **Embed** to embed data
3. Click **Export**

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

## 17. Working with SCA Animations

### Open an SCA File

Load a `.sca` file. The animation controls appear below the main tabs.

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

- **Save As...** — save the edited animation as `.sca`
- **Export SCR...** — export the current frame as a standard `.scr`
- **Export 53c...** — export the current frame as `.53c` attributes

![SCA animation](screenshots/tutorial_sca.png)

---

## 18. Using Reference Images

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

## 19. Tips and Hidden Features

### Workspace Save/Load
Save all your open pictures at once with **Save Workspace** in the Xform tab. Load them back later — preserving layers, settings, and reference images.

### Barcode Brushes
For BSC/BMC4 border formats, use barcode slots to capture and stamp border stripe patterns. Shift+click a slot to capture from the border.

### Gradient Tool Dither Patterns
The Gradient tool (D) supports 6 gradient types (Linear, Radial, Diamond, Conical, Square, Spiral) with Bayer or Blue Noise dithering. Great for backgrounds.

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

### Fullscreen Editor Mode
Press **F11** to go fullscreen. Press **Tab** to show/hide the floating tool palette. Press **Escape** to exit.

### Layers
Use the Layers feature (Edit tab) for non-destructive editing. Add layers, reorder them, and flatten when done. Save projects with layers as `.slp` files.

### Keyboard Layout Independence
All keyboard shortcuts work based on physical key positions, so they function correctly with any keyboard layout (Russian, German, etc.).

### Brush Preview
Press **` (backtick)** to toggle a semi-transparent brush preview that follows your cursor, showing exactly where pixels will be placed.

### Snap Modes
The Snap dropdown in the Edit tab controls how the cursor aligns. Use **Zero** or **Brush** snap modes for pixel-perfect tile placement when pasting repeating patterns.
