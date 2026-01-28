# SpectraLab

A pure JavaScript viewer and editor for ZX Spectrum graphics formats. No server required - runs directly in any browser, locally or hosted.

## Features

- **View** various ZX Spectrum screen formats
- **Edit** SCR screens with pixel-accurate tools (like Art Studio)
- **Edit** .53c/.atr attribute files with cell painting
- **Import** PNG/GIF/JPG images and convert to SCR format
- **Play** SCA animations with frame-by-frame control
- **Edit** SCA animations: trim frames, adjust delays, remove duplicates
- **Customize** display: zoom (x1-x10), border color/size, palettes, grid overlay, monochrome mode
- **Load** files directly from ZIP archives
- **Custom fonts** for SPECSCII (standard 768-byte ZX Spectrum font format)
- Dark/light theme support

## Screen Editor

Edit standard 6912-byte .scr files with authentic ZX Spectrum color handling:

- **Tools**: Pixel, Line, Rectangle, Fill Cell, Recolor (attribute only)
- **Brush**: Sizes 1-16px, shapes: Square, Round, Horizontal, Vertical, Stroke (/), Back stroke (\) (applies to Pixel, Line, Rectangle)
- **Brush mode**: Replace (default), Set, Invert — persisted to localStorage
- **Custom Brushes**: 5 user-defined custom brushes (capture from screen, max 64x64)
  - Click=select, Shift+click=capture, Ctrl+click=clear
  - Rotate 90° CW, Mirror horizontal, Mirror vertical
- **Copy/Paste**: Select tool (S) to drag-select a region (auto-copies), Paste (Ctrl+V) to place with preview
  - Snap modes: Grid (8x8), Zero (tile from origin), Brush (tile from first paste), Off
- **Drawing**: Left click = ink color, Right click = paper color
- **Colors**: Select ink (0-7), paper (0-7), toggle Bright
- **Undo/Redo**: 32 levels (Ctrl+Z / Ctrl+Y)
- **Preview panel**: Draggable, zoomable (x1-x4), shows full screen while editing
- **Save**: Export as .scr file (Ctrl+S)

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
| `.3` | 18432 bytes | Tricolor RGB (3 bitmaps) |
| `.specscii` | variable | Text mode with colors |
| `.sca` | variable | Animation (multiple frames) |
| `.zip` | - | Archive (auto-extract) |

## Keyboard Shortcuts

### Viewer
| Key | Action |
|-----|--------|
| `1-5` | Set zoom level (x1 to x5, higher via menu) |
| `F` | Toggle flash animation |
| `G` | Toggle grid overlay |
| `Space` | Play/Pause animation (SCA) |
| `Left/Right` | Previous/Next frame (SCA) |

### Screen Editor
| Key | Action |
|-----|--------|
| `P` | Pixel tool |
| `L` | Line tool |
| `R` | Rectangle tool (or Rotate brush 90° CW when custom brush active) |
| `C` | Fill cell tool |
| `A` | Recolor tool (attribute only) |
| `S` | Select tool (drag to select, auto-copies) |
| `H` | Mirror custom brush horizontal |
| `V` | Mirror custom brush vertical |
| `B` | Toggle Bright |
| `[` | Decrease brush size |
| `]` | Increase brush size |
| `Ctrl+C` | Copy selection |
| `Ctrl+V` | Paste (enter paste mode) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |
| `Escape` | Cancel selection / paste |

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
