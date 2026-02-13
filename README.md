# SpectraLab

A pure JavaScript viewer and editor for ZX Spectrum graphics formats. No server required - runs directly in any browser, locally or hosted.

## Features

- **View** various ZX Spectrum screen formats
- **Edit** SCR screens with pixel-accurate tools (like Art Studio)
- **Edit** .53c/.atr attribute files with cell painting
- **Multi-picture editing**: Open and edit up to 8 pictures simultaneously with tab switching
- **Workspace files**: Save/load all open pictures as a single .slw file
- **Import** PNG/GIF/JPG images and convert to SCR format
- **Play** SCA animations with frame-by-frame control
- **Edit** SCA animations: click Edit tab to trim frames, adjust delays, remove duplicates
- **Customize** display: zoom (x1-x10), border color/size, palettes, grid overlay (separate for paper/border), monochrome mode
- **Tabbed UI**: View (display settings), Edit (drawing tools), Transform (undo/save/convert)
- **Load** files directly from ZIP archives
- **Custom fonts** for SPECSCII (standard 768-byte ZX Spectrum font format)
- Dark/light theme support

## Screen Editor

Edit standard 6912-byte .scr files with authentic ZX Spectrum color handling:

- **Tools**: Pixel, Line, Rectangle, Circle, Airbrush, Gradient, Flood Fill, Fill Cell, Recolor, Eraser, Text, Select
- **Eraser tool (E)**: Makes pixels transparent on upper layers; paints paper on background
- **Airbrush tool (G)**: Spray random pixels within a radius
  - Configurable radius (4-32px), density (0.03-1.0), and falloff (Uniform to Very Hard)
  - Higher falloff concentrates particles toward center
  - Continuous spray while mouse button held
- **Gradient tool (D)**: Fill screen with dithered monochrome gradients
  - Types: Linear, Radial, Diamond, Conical, Square, Spiral
  - Dithering: Bayer (ordered 8×8) or Blue Noise (16×16)
  - Drag from start to end point to define direction/size
- **Fill with patterns**: Fill tool uses selected brush - custom brush patterns tile across fill area for dithered fills
- **Brush**: Sizes 1-16px, shapes: Square, Round, Horizontal, Vertical, Stroke (/), Back stroke (\) (applies to Pixel, Line, Rectangle, Fill, Eraser)
- **Brush mode**: Replace (default), Set, Invert — persisted to localStorage
- **Custom Brushes**: 5 user-defined custom brushes (capture from screen, max 64x64)
  - Click=select, Shift+click=capture, Ctrl+click=clear
  - Rotate 90° CW, Mirror horizontal, Mirror vertical
- **Copy/Paste**: Select tool (S) to drag-select a region (auto-copies), Paste (Ctrl+V) to place with preview
  - Snap modes: Grid, Subgrid (use View tab sizes), Zero (tile from origin), Brush (tile from first paste), Off
- **Layers**: Add/remove/reorder layers with visibility toggles
  - Background layer is always opaque; upper layers support transparency
  - Shared attributes per cell across all layers (ZX Spectrum constraint)
  - Flatten button merges all layers into background
- **Drawing**: Left click = ink color, Right click = paper color
- **Colors**: Select ink (0-7), paper (0-7), toggle Bright
- **Undo/Redo**: 32 levels (Ctrl+Z / Ctrl+Y)
- **Preview panel**: Draggable, zoomable (x1-x4), shows full screen while editing
- **Text tool**: Add text using ZX Spectrum .768 bitmap fonts or TrueType/OpenType fonts
- **QR code generator**: Generate QR codes from text or URLs
  - Version picker: V1-V20 (20 to 970 letters capacity)
  - Module sizes: 1, 2, 3, 4, or 8 pixels
  - Auto-uppercase conversion for maximum capacity
  - Position control with grid snapping
  - Live preview before applying
- **Fullscreen mode** (F11): Maximizes canvas with floating tool palette (Tab to toggle)
- **Save**: Export as .scr file (Ctrl+S) - automatically flattens layers
- **Multi-picture**: Work with multiple pictures simultaneously
  - Tab bar appears when 2+ pictures are open
  - Each picture has independent undo/redo, layers, and zoom
  - Copy/paste works across pictures (same format)
  - Close button (×) on tabs with unsaved changes confirmation
- **Workspace**: Save/Load all open pictures as a single .slw file

The editor works like classic ZX Spectrum art programs (Art Studio, Artist 2) - when you draw in an 8x8 cell, the cell's attribute is set to your current ink/paper/bright.

## Attribute Editor

Edit 768-byte .53c/.atr attribute-only files:

- **Cell painting**: Click or drag to set cell attributes (ink/paper/bright/flash)
- **Pattern display**: Pattern selector (checker/stripes/dd77) remains visible during editing
- **Colors**: Same ink/paper/bright/flash selection as SCR editor
- **No bitmap tools**: Tools and brush sections are hidden (not applicable)
- **Undo/Redo**: 32 levels (Ctrl+Z / Ctrl+Y)
- **Save**: Export as .53c file (Ctrl+S)

## Image Import

Import standard image formats (PNG, GIF, JPG, WebP, BMP) and convert to ZX Spectrum SCR format:

- **Automatic scaling**: Images are scaled to 256x192 pixels
- **Dithering options**: Floyd-Steinberg, Ordered (Bayer 4x4), Atkinson, or None
- **Brightness/Contrast**: Manual or auto-detected adjustment
- **Cell-aware conversion**: Respects 8x8 cell attribute constraints (2 colors per cell)
- **Palette support**: Uses the currently selected display palette
- **Live preview**: See the converted result before importing

The converter analyzes each 8x8 cell to find the optimal ink/paper combination from both normal and bright color sets, minimizing color error.

## BSC Editor

Edit 11136-byte .bsc border screen files:

- **Full border editing**: Edit per-line border colors for top/bottom/side borders
- **Hidden zone indicator**: Grid shows leftmost/rightmost 2 columns with red overlay (typically hidden on real hardware)
- **ASM export**: Generate sjasmplus-compatible source for Pentagon 128K
  - Exact cycle-accurate timing (224T/line, 71680T/frame)
  - SAVESNA output with original filename

## Gigascreen Editor

Edit 13824-byte .img Gigascreen files (two alternating SCR frames):

- **Virtual color palette**: 136 unique blended colors from 16 ZX colors (8 normal + 8 bright)
  - Click to set virtual ink, right-click to set virtual paper
  - Colors blend by averaging RGB values from both frames
- **4-color per cell**: Each ink/paper pair provides 4 paintable colors
  - Ink+Ink, Ink+Paper, Paper+Ink, Paper+Paper combinations
  - Left-click color to assign to left mouse button (L)
  - Right-click color to assign to right mouse button (R)
- **True dual-frame editing**: Each frame can have different pixel patterns
- **Eyedropper** (Alt+click): Picks virtual ink/paper from cell
  - Alt+left-click assigns pixel color to L button
  - Alt+right-click assigns pixel color to R button
- **Layer support**: Full layer system with dual-frame storage
  - Each layer stores bitmap and attributes for both frames
  - Flatten merges all layers correctly
- **All drawing tools**: Pixel, Line, Rectangle, Circle, Fill, etc.
- **Display modes**: Average (blended colors) or Flicker (50fps alternating frames)
- **Save**: Export as .img preserves full 13824-byte dual-frame format

## Supported Formats

| Extension | Size | Description |
|-----------|------|-------------|
| `.scr` | 6912 bytes | Standard screen (bitmap + attributes) - **editable** |
| `.scr` | 6144 bytes | Monochrome (bitmap only) |
| `.scr` | 4096 bytes | Monochrome 2/3 screen |
| `.scr` | 2048 bytes | Monochrome 1/3 screen |
| `.53c` / `.atr` | 768 bytes | Attributes only - **editable** |
| `.bsc` | 11136 bytes | Border screen (SCR + border) - **editable** |
| `.ifl` | 9216 bytes | 8x2 multicolor |
| `.bmc4` | 11904 bytes | Border + 8x4 multicolor |
| `.mlt` / `.mc` | 12288 bytes | 8x1 multicolor |
| `.3` | 18432 bytes | Tricolor RGB (3 bitmaps) — flicker emulation |
| `.img` | 13824 bytes | Gigascreen (2×SCR) — average/flicker modes - **editable** |
| `.specscii` | variable | Text mode with colors |
| `.sca` | variable | Animation (type 0: full frames, type 1: attr-only) |
| `.slp` | variable | Project file (single picture with layers) |
| `.slw` | variable | Workspace file (all open pictures) |
| `.zip` | - | Archive (auto-extract) |

## Keyboard Shortcuts

All letter shortcuts work with any keyboard layout (Russian, German, etc.) — based on physical key position.

### Viewer
| Key | Action |
|-----|--------|
| `1-5` | Set zoom level (x1 to x5, higher via menu) |
| `F` | Toggle flash animation |
| `G` | Toggle grid overlay |
| `~` | Toggle preview panel |
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
| `Alt` | Draw rect/circle from center; Eyedropper (pick color from canvas) |
| `G` | Airbrush tool |
| `D` | Gradient tool |
| `I` | Flood fill tool |
| `C` | Fill cell tool |
| `A` | Recolor tool (attribute only) |
| `E` | Eraser tool (transparent on upper layers, paper on background) |
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
| `Ctrl+C` | Copy selection |
| `Ctrl+X` | Cut selection |
| `Ctrl+V` | Paste (enter paste mode) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |
| `F11` | Toggle fullscreen editor |
| `Tab` | Toggle floating palette (in fullscreen) |
| `Escape` | Cancel selection/paste, exit fullscreen |

## Usage

Open `index.html` in a web browser. No server required - runs entirely client-side.

## Resources & References

Tools and documentation that inspired or informed SpectraLab development:

- [img2zxscr](https://gitverse.ru/nodeus/img2zxscr) - PNG to ZX Spectrum converter (Go)
- [PNG-to-SCR](https://github.com/MatejJan/PNG-to-SCR) - Online JavaScript converter
- [Image to ZX Spec](https://github.com/KodeMunkie/imagetozxspec) - Cross-platform converter with dithering
- [img2spec](https://github.com/jarikomppa/img2spec) - Image Spectrumizer tool
- [World of Spectrum](https://worldofspectrum.org/) - ZX Spectrum documentation and resources

## License

MIT
