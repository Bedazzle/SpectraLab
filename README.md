# SpectraLab

A pure JavaScript viewer and editor for ZX Spectrum graphics formats. No server required - runs directly in any browser, locally or hosted.

## Features

- **View** various ZX Spectrum screen formats
- **Play** SCA animations with frame-by-frame control
- **Edit** SCA animations: trim frames, adjust delays
- **Customize** display: zoom, border color/size, palettes, grid overlay
- **Load** files directly from ZIP archives
- **Custom fonts** for SPECSCII (standard 768-byte ZX Spectrum font format)
- Dark/light theme support

## Supported Formats

| Extension | Size | Description |
|-----------|------|-------------|
| `.scr` | 6912 bytes | Standard screen (bitmap + attributes) |
| `.scr` | 6144 bytes | Monochrome (bitmap only) |
| `.scr` | 4096 bytes | Monochrome 2/3 screen |
| `.scr` | 2048 bytes | Monochrome 1/3 screen |
| `.53c` / `.atr` | 768 bytes | Attributes only |
| `.bsc` | 11136 bytes | Border screen (SCR + border) |
| `.ifl` | 9216 bytes | 8x2 multicolor |
| `.bmc4` | 11904 bytes | Border + 8x4 multicolor |
| `.mlt` / `.mc` | 12288 bytes | 8x1 multicolor |
| `.3` | 18432 bytes | Tricolor RGB (3 bitmaps) |
| `.specscii` | variable | Text mode with colors |
| `.sca` | variable | Animation (multiple frames) |
| `.zip` | - | Archive (auto-extract) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-5` | Set zoom level (x1 to x5) |
| `F` | Toggle flash animation |
| `G` | Toggle grid overlay |
| `Space` | Play/Pause animation (SCA) |
| `Left/Right` | Previous/Next frame (SCA) |

## Usage

Open `index.html` in a web browser. No server required - runs entirely client-side.

## License

MIT
