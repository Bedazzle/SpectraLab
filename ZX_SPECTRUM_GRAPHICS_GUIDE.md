# ZX Spectrum Graphics Format Reference

A comprehensive reference for ZX Spectrum graphics formats.

---

## 1. Overview

The ZX Spectrum display is a **256 x 192 pixel** screen divided into **32 x 24 character cells** (each cell is 8 x 8 pixels).

| Property          | Value                      |
|-------------------|----------------------------|
| Resolution        | 256 x 192 pixels           |
| Character cells   | 32 columns x 24 rows       |
| Bitmap data       | 6144 bytes                 |
| Attribute data    | 768 bytes (1 per cell)     |
| Total screen      | 6912 bytes                 |
| Border            | Surrounds the main screen; single color set via port 0xFE |

Memory map (standard SCR):

```
Offset 0x0000 - 0x17FF  Bitmap data   (6144 bytes)
Offset 0x1800 - 0x1AFF  Attributes    (768 bytes)
```

---

## 2. Screen Memory Layout

### Bitmap Interleaving

The 192 pixel rows are divided into **3 thirds** of 64 lines each. Within each third, rows are interleaved in a non-linear pattern to simplify the ULA hardware.

```
Third 0: lines   0 -  63   (offset 0x0000)
Third 1: lines  64 - 127   (offset 0x0800)
Third 2: lines 128 - 191   (offset 0x1000)
```

Within each third, the 64 lines are ordered by **character row** (0-7) interleaved with **pixel line** (0-7):

```
Line order within a third:
  char row 0, pixel line 0    offset +0x000
  char row 1, pixel line 0    offset +0x020
  char row 2, pixel line 0    offset +0x040
  ...
  char row 7, pixel line 0    offset +0x0E0
  char row 0, pixel line 1    offset +0x100
  char row 1, pixel line 1    offset +0x120
  ...
  char row 7, pixel line 7    offset +0x7E0
```

### Address Calculation Formula

Given a screen position (x, y) where x = 0-255 and y = 0-191:

```
Bitmap byte address:
  third     = y >> 6                    (0, 1, or 2)
  charRow   = (y >> 3) & 0x07          (0-7 within third)
  pixelLine = y & 0x07                 (0-7 within character)
  col       = x >> 3                   (0-31 byte column)

  offset = (third * 2048) + (pixelLine * 256) + (charRow * 32) + col

Attribute byte address:
  attrRow = y >> 3                     (0-23)
  attrCol = x >> 3                     (0-31)

  offset = 6144 + (attrRow * 32) + attrCol
```

### Worked Example

Pixel at (72, 37):

```
  y = 37
  third     = 37 >> 6           = 0
  charRow   = (37 >> 3) & 0x07  = 4
  pixelLine = 37 & 0x07         = 5

  col = 72 >> 3 = 9

  bitmap offset = (0 * 2048) + (5 * 256) + (4 * 32) + 9
               = 0 + 1280 + 128 + 9
               = 1417  (0x0589)

  attribute offset = 6144 + (4 * 32) + 9
                   = 6144 + 128 + 9
                   = 6281  (0x1889)
```

### Snow Effect

The ULA fetches screen bytes from RAM continuously during the active 256 x 192 scan — two memory accesses every 8 T-states (one bitmap byte, one attribute byte). The Z80 and the ULA therefore share the lower 16 KB of RAM (`0x4000 - 0x7FFF` on a 48K machine, bank 5 on 128K). Most of the time the ULA wins the bus and the CPU is stalled by contention, but during the Z80's **memory-refresh** cycle the CPU actually drives the address bus with the current value of the `I` (interrupt vector) and `R` (refresh) registers — and if the high byte of that address lands in the ULA's display area, the two chips can end up driving the bus at the same time.

The visible result is **snow**: random single-byte corruption of the bitmap or attribute stream, appearing as bright speckles that sparkle along the raster for as long as the conflict persists. The rules on original Sinclair hardware are roughly:

- `I` < `0x40` → `I:R` points to ROM → no conflict, no snow
- `0x40` <= `I` <= `0x7F` → `I:R` points into contended screen RAM → snow
- `0x80` <= `I` <= `0xBF` on 48K → `I:R` points into uncontended RAM → no snow
- `0xC0` <= `I` <= `0xFF` on 128K → points into banked RAM; snow depends on which bank is currently paged at `0xC000` (snow appears if the visible screen bank is paged there)

The effect is tied to Sinclair's specific ULA arbitration. It varies noticeably between machines:

- **ZX Spectrum 48K / 128K / +2 / +3 (Sinclair / Amstrad)** — classic snow behavior as described above.
- **Pentagon 128K / Pentagon 1024** — uses a different memory-access scheme with no contention and no memory-refresh/ULA conflict. Snow does not occur; programs that *rely* on I pointing into contended RAM without causing snow (i.e. were only ever tested on a Pentagon) can ship with latent snow bugs on real Sinclair hardware.
- **Scorpion ZS-256** — similar to Pentagon: no contention, no snow.
- **Most Soviet/Eastern European clones** (Leningrad, Baltic, Krasnogorsk, Sintez, etc.) — clone-specific; many use discrete logic replacing the ULA and simply do not reproduce the bus-arbitration quirk, so no snow.
- **ZX Spectrum Next** — contention is emulated in configurable modes; snow is *not* emulated by default and programs that depend on it behave as if on a Pentagon-style machine.
- **Emulators** — many do not model snow at all; those that do (Fuse, ZXSpectrum4, CSpect in accurate modes, etc.) usually offer it as an option.

Programs have used snow both as a bug to avoid (keep `I < 0x40`, the BASIC ROM convention) and occasionally as an intentional effect in demos, where setting `I` into the display file produces free animated noise without any CPU cost.

---

## 3. Attribute Byte Format

Each 8 x 8 character cell has one attribute byte controlling its colors:

```
  Bit:  7       6       5  4  3       2  1  0
      +-------+-------+----------+-----------+
      | FLASH | BRIGHT|  PAPER   |    INK    |
      +-------+-------+----------+-----------+
```

| Bits  | Mask   | Field  | Values                          |
|-------|--------|--------|---------------------------------|
| 0-2   | `0x07` | INK    | Color index 0-7                 |
| 3-5   | `0x38` | PAPER  | Color index 0-7                 |
| 6     | `0x40` | BRIGHT | 0 = normal, 1 = bright          |
| 7     | `0x80` | FLASH  | 0 = steady, 1 = flash (swap ink/paper at ~3.125 Hz) |

### Encoding

```
attr = ink | (paper << 3) | (bright << 6) | (flash << 7)
```

### Decoding

```
ink    = attr & 0x07
paper  = (attr >> 3) & 0x07
bright = (attr >> 6) & 0x01
flash  = (attr >> 7) & 0x01
```

### Flash Timing

Setting the FLASH bit tells the ULA to periodically swap ink and paper for that cell. The toggle is driven by a free-running counter **inside the ULA itself**, not by any software timer: flash keeps alternating even with interrupts disabled (`DI:HALT` in assembly) and regardless of whether the ROM is maintaining the BASIC `FRAMES` system variable. The ULA increments its own frame counter on every video field and uses bit 4 of that counter as the flash-phase signal, so the phase flips once every 16 video frames whether or not the CPU is running.

The *visual* flash speed therefore depends on the frame rate of the host, which varies between machines:

| Machine                         | Frame rate  | Phase length | Full cycle |
|---------------------------------|-------------|--------------|------------|
| ZX Spectrum 48K (issue 2/3)     | ~50.08 Hz   | ~319 ms      | ~639 ms    |
| ZX Spectrum 128K / +2 / +3      | ~50.02 Hz   | ~320 ms      | ~640 ms    |
| Pentagon 128K                   | ~48.83 Hz   | ~328 ms      | ~655 ms    |
| Scorpion ZS-256                 | ~48.83 Hz   | ~328 ms      | ~655 ms    |
| Timex TS/TC 2068 (NTSC mode)    | ~59.0  Hz   | ~271 ms      | ~542 ms    |
| ZX Spectrum Next (50/60 Hz)     | 50 / 60 Hz  | 320 / 267 ms | 640 / 533 ms |

Because flash is tied to frame count, demos and intros that use FLASH as a *timing* aid (rather than just decoration) look noticeably different on Pentagon vs. original Sinclair hardware. A loader that blinks "PRESS ANY KEY" exactly two times per second on a 48K Speccy (~640 ms cycle ≈ 1.56 Hz, close enough) ends up slightly slower on Pentagon.

When some software exports a flashing picture as animated GIF (or similar PC-side format), it usually approximates the stock Sinclair behavior with a 320 ms per-phase frame delay. This matches the 48K/128K/+2/+3 timing; Pentagon-authentic playback would need ~328 ms per phase.

### Hidden Pixels (ink == paper)

When a cell's `ink` and `paper` fields hold the same color index, every pixel in that 8 x 8 block renders as the same color on screen, regardless of the underlying bitmap bits. The bitmap data is still in memory -- it just isn't *visible* until the attribute byte is changed to use two different colors.

ZX Spectrum authors exploited this as a side-channel for data that the player wasn't meant to see:

- **Signatures and credits.** Artists drew their name or initials in `black ink on black paper` so it stayed invisible during loading / gameplay but became readable the instant someone POKEd a different ink or paper into the attribute file, or loaded the `.scr` into an editor. Many commercial loader screens carry such hidden tags.
- **Cracker tags and re-release marks.** Scene crackers added their group name to pirated copies in the same way; competing groups would find each other's tags by cycling attributes.
- **Easter eggs.** Extra artwork or messages hidden behind an apparently plain area (sky, border of a title screen, solid UI panels). Some programs revealed them by flipping the paper attribute at runtime.
- **Copy-protection / fingerprinting.** A known hidden pattern can be used to verify that a file is the original, unmodified release. Tools that re-encode the screen (e.g. through PNG and back) destroy the watermark and so expose a tampered copy.
- **Compression quirks.** Two cells that look identical on screen can still have wildly different bitmap bytes, which changes how well RLE / delta encoders compress the `.scr`. Loaders that de-dup "solid" cells by attribute alone will corrupt such data.

**Loss during conversion to true-color formats.** Exporting a `.scr` to `.png`, `.jpg`, `.gif`, `.bmp`, etc. collapses each pixel to its rendered RGB value, so cells where `ink == paper` become uniform blocks of that single color. Round-tripping through any true-color format therefore **destroys the hidden bitmap data irreversibly**. The same happens when a screen is captured from an emulator/video signal or imported from a photo.

To preserve hidden pixels you must either stay in a native attribute-aware format (`.scr`, `.bsc`, `.ifl`, `.mlt`, `.specscii`, etc.) or carry the raw attribute + bitmap bytes through a lossless binary container (ZIP, TAP, SNA, Z80, a custom asset blob). When some software converts between native attribute-based formats it usually keeps the bitmap bytes unchanged, so hidden patterns survive the round-trip and reappear if the cell is later recolored; when converting a `.scr` to a text-mode format such as `.specscii`, a careful converter matches each hidden cell to the best-fitting glyph so the bitmap still survives into the character representation.

---

## 4. Color Palette

The ZX Spectrum has 15 unique colors (bright black = normal black).

There is no single "correct" set of RGB values for these colors. The actual appearance varied significantly between different hardware -- CRT monitors, TV sets, RF modulators, and composite video all produced different results. As a consequence, emulators offer a choice of alternative palettes, and users simply pick the one they prefer. The values below (D7/FF) are one widely used approximation.

### Normal Colors (brightness level 215)

| Index | Name    | Hex       | R   | G   | B   |
|-------|---------|-----------|-----|-----|-----|
| 0     | Black   | `#000000` | 0   | 0   | 0   |
| 1     | Blue    | `#0000D7` | 0   | 0   | 215 |
| 2     | Red     | `#D70000` | 215 | 0   | 0   |
| 3     | Magenta | `#D700D7` | 215 | 0   | 215 |
| 4     | Green   | `#00D700` | 0   | 215 | 0   |
| 5     | Cyan    | `#00D7D7` | 0   | 215 | 215 |
| 6     | Yellow  | `#D7D700` | 215 | 215 | 0   |
| 7     | White   | `#D7D7D7` | 215 | 215 | 215 |

### Bright Colors (brightness level 255)

| Index | Name    | Hex       | R   | G   | B   |
|-------|---------|-----------|-----|-----|-----|
| 0     | Black   | `#000000` | 0   | 0   | 0   |
| 1     | Blue    | `#0000FF` | 0   | 0   | 255 |
| 2     | Red     | `#FF0000` | 255 | 0   | 0   |
| 3     | Magenta | `#FF00FF` | 255 | 0   | 255 |
| 4     | Green   | `#00FF00` | 0   | 255 | 0   |
| 5     | Cyan    | `#00FFFF` | 0   | 255 | 255 |
| 6     | Yellow  | `#FFFF00` | 255 | 255 | 0   |
| 7     | White   | `#FFFFFF` | 255 | 255 | 255 |

### Dark Black vs Bright Black

On genuine Sinclair hardware **bright black and normal black are the same color**. The ULA produces each primary on a one-bit line that is gated together with the BRIGHT bit into the video DAC, so when R = G = B = 0 the BRIGHT line has nothing to act on — all three outputs are held at ground regardless of its state. The Spectrum therefore exposes 15 visually distinct colors, not 16, and `BRIGHT 0, PAPER 0, INK 0` and `BRIGHT 1, PAPER 0, INK 0` are indistinguishable.

On **several clones and third-party video mods** this equivalence did not survive. Typical causes:

- A discrete-logic re-implementation of the ULA that mixes the BRIGHT line into the luminance path as a constant bias instead of as a true multiplier, so BRIGHT 1 lifts the output slightly even when all three RGB bits are 0.
- After-market PAL/composite encoder boards added to a stock machine: some of them AC-couple the RGB lines but DC-couple BRIGHT, so a "bright black" cell sits at a different black level than a "normal black" cell.
- Pentagon / Scorpion / Leningrad and similar Soviet clones using discrete TTL video: behavior varied between revisions and between factory/hobbyist builds. Some produced a clean black on both; others (especially early Leningrad-type schematics and various "kitchen-table" Baltic / Krasnogorsk / Sintez / Moscow clones) leaked a small amount of BRIGHT into the composite signal.
- Didaktik models built with non-Ferranti logic have been reported to show a faint difference in some revisions.
- Generic Eastern-European clones fed into a cheap PAL TV with an aggressive black-level clamp can amplify any small DC offset into a visible grey.

When `bright black != normal black`, pictures and demos authored on real Sinclair hardware can look noticeably worse:

- Cells that hide bitmap data as black-on-black (see [Hidden Pixels](#hidden-pixels-ink--paper)) show faint "ghost" shapes, because the hidden bits now map to two slightly different blacks rather than one.
- Backgrounds that were deliberately painted with a mix of `BRIGHT 0` and `BRIGHT 1` cells on a black paper (a common trick to pre-set the BRIGHT attribute of a region before sprites arrive there) develop visible rectangular seams along the character grid.
- `FLASH` on a `PAPER 0, INK 0` cell, which is completely stationary on real hardware, instead becomes a low-contrast flicker between the two blacks.
- Dithered gradients that use black + bright-black as a "safe" anchor pair collapse to a visible band instead of a smooth fade.

The effect is always a clone-side artifact: the byte on disk is correct, and the same `.scr` file will look clean on original Sinclair hardware (and on any accurate emulator) while looking ugly on an affected clone. There is no good way to "fix" a picture for such clones short of never using `BRIGHT 1` with a black paper or ink, which costs you half the attribute space.

---

## 5. Format Reference

### SCR (Standard Screen) -- 6912 bytes

The standard ZX Spectrum screen dump.

```
Offset  Size   Content
0       6144   Bitmap data (interleaved as described in section 2)
6144    768    Attribute data (1 byte per 8x8 cell, left-to-right, top-to-bottom)
```

- File extension: `.scr`
- One attribute per 8 x 8 cell, limiting each cell to 2 colors (ink + paper)

---

### ULA+ (Enhanced Palette) -- 6976 bytes

**Hardware extension** -- ULA+ is not part of the original ZX Spectrum hardware. It requires a special ULA+ compatible interface or an enhanced clone (e.g., Timex, ZX Spectrum Next). It cannot be displayed on a classic ZX Spectrum 48/128.

Standard SCR with an appended 64-byte palette using the GRB332 color encoding.

```
Offset  Size   Content
0       6912   Standard SCR data
6912    64     GRB332 palette (4 CLUTs x 16 colors)
```

- File extension: `.scr` (detected by size 6976)

#### GRB332 Byte Format

```
  Bit:  7  6  5    4  3  2    1  0
      +---------+---------+------+
      |  GREEN  |   RED   | BLUE |
      | (3 bit) | (3 bit) |(2bit)|
      +---------+---------+------+
```

Conversion to 8-bit RGB:

```
g3 = (byte >> 5) & 0x07     // 3-bit green
r3 = (byte >> 2) & 0x07     // 3-bit red
b2 = byte & 0x03            // 2-bit blue

R = round(r3 * 255 / 7)     // scale 0-7 to 0-255
G = round(g3 * 255 / 7)
B = round(b2 * 255 / 3)     // scale 0-3 to 0-255
```

#### CLUT Organization

The 64-byte palette is split into 4 Color Look-Up Tables of 16 entries each. Each CLUT contains 8 INK colors (indices 0-7) followed by 8 PAPER colors (indices 8-15).

| CLUT | Palette Bytes | FLASH | BRIGHT | Usage               |
|------|---------------|-------|--------|---------------------|
| 0    | 0-15          | 0     | 0      | Normal, no flash    |
| 1    | 16-31         | 0     | 1      | Bright, no flash    |
| 2    | 32-47         | 1     | 0      | Normal, flash       |
| 3    | 48-63         | 1     | 1      | Bright, flash       |

Palette index lookup:

```
clut      = (flash << 1) | bright
ink_idx   = (clut * 16) + (attr & 0x07)
paper_idx = (clut * 16) + 8 + ((attr >> 3) & 0x07)
```

---

### ULANext (ZX Spectrum Next Enhanced Palette) -- 6945–7426 bytes

**Hardware extension** -- ULANext is a display mode specific to the ZX Spectrum Next. It extends the standard ULA attribute scheme by allowing a configurable split of the attribute byte between ink and paper palette indices, enabling up to 256 ink or 256 paper colors from a programmable RGB palette. It cannot be displayed on a classic ZX Spectrum 48/128 or a ULA+ interface.

Standard SCR with an appended ink mask byte and palette entries.

```
Offset  Size     Content
0       6912     Standard SCR data (bitmap + attributes)
6912    1        Ink mask byte
6913    variable Palette entries (see table below)
```

- File extension: `.scr` (detected by size range 6945–7426)
- Flash is disabled — attribute bits 6-7 are used for palette indexing, not FLASH/BRIGHT

#### Ink Mask

The ink mask byte determines how each attribute byte is split between ink and paper indices:

- **inkBits** = number of set bits in the mask (popcount)
- **inkCount** = 2^inkBits (number of ink palette entries)
- **paperCount** = 2^(8 - inkBits) (number of paper palette entries)
- **totalEntries** = inkCount + paperCount

Color lookup from an attribute byte:

```
inkIndex   = attr & mask           → palette entry 0..(inkCount-1)
paperIndex = attr >>> inkBits      → palette entry inkCount..(inkCount+paperCount-1)
```

#### Valid Masks and File Sizes

Each mask supports two palette encodings: **9-bit** (2 bytes per entry, same RGB333 as NXI) and **8-bit** (1 byte per entry, RRRGGGBB).

| Mask | InkBits | Ink/Paper | Entries | 9-bit file size | 8-bit file size |
|------|---------|-----------|---------|-----------------|-----------------|
| $01  | 1       | 2/128     | 130     | 7173            | 7043            |
| $03  | 2       | 4/64      | 68      | 7049            | 6981            |
| $07  | 3       | 8/32      | 40      | 6993            | 6953            |
| $0F  | 4       | 16/16     | 32      | 6977            | 6945            |
| $1F  | 5       | 32/8      | 40      | 6993            | 6953            |
| $3F  | 6       | 64/4      | 68      | 7049            | 6981            |
| $7F  | 7       | 128/2     | 130     | 7173            | 7043            |
| $FF  | 8       | 256/1     | 257     | 7426            | 7170            |

Note: mask $FF is special — 256 ink entries plus 1 paper entry (257 total).

#### 9-bit Palette Entry Format (2 bytes)

Same encoding as NXI palette entries:

```
Byte 0:  RRRGGGBB  (bits 7-5 = Red, bits 4-2 = Green, bits 1-0 = Blue high)
Byte 1:  .......B  (bit 0 = Blue low)
```

Blue is 3 bits total: `(byte0 & 3) << 1 | (byte1 & 1)`.

Conversion to 8-bit RGB:

```
r3 = (byte0 >> 5) & 7
g3 = (byte0 >> 2) & 7
b3 = ((byte0 & 3) << 1) | (byte1 & 1)

R = round(r3 * 255 / 7)
G = round(g3 * 255 / 7)
B = round(b3 * 255 / 7)
```

#### 8-bit Palette Entry Format (1 byte)

```
  Bit:  7  6  5    4  3  2    1  0
      +---------+---------+------+
      |   RED   |  GREEN  | BLUE |
      | (3 bit) | (3 bit) |(2bit)|
      +---------+---------+------+
```

Note: this is **not** GRB332 like ULA+. ULANext 8-bit uses **RRRGGGBB** (red-green-blue order).

Blue expansion from 2 bits to 3 bits follows the Next hardware rule: `b3 = (b2 << 1) | ((b2 >> 1) | (b2 & 1))`.

Conversion to 8-bit RGB:

```
r3 = (byte >> 5) & 7
g3 = (byte >> 2) & 7
b2 = byte & 3
b3 = (b2 << 1) | ((b2 >> 1) | (b2 & 1))

R = round(r3 * 255 / 7)
G = round(g3 * 255 / 7)
B = round(b3 * 255 / 7)
```

---

### 53c / ATR (Attribute-Only) -- 768 bytes

Attribute-only format. The bitmap is generated from a fixed dither pattern rather than stored in the file.

```
Offset  Size   Content
0       768    Attribute data (32 x 24)
```

- File extensions: `.53c`, `.atr`
- The name "53c" comes from the number of distinct colors the checker pattern produces (53 colors). The DD77 pattern yields 127 colors
- The dither pattern is applied uniformly across all character cells

#### Dither Patterns

Each pattern is 8 bytes (one per pixel line in a character cell), tiled across the screen:

| Pattern  | Bytes (hex)                          | Visual                   |
|----------|--------------------------------------|--------------------------|
| Checker  | `AA 55 AA 55 AA 55 AA 55`           | Alternating pixels       |
| Stripes  | `CC 33 CC 33 CC 33 CC 33`           | 2-pixel horizontal bands |
| DD77     | `DD 77 DD 77 DD 77 DD 77`           | Classic ZX dither        |

Binary visualization:

```
Checker:            Stripes:            DD77:
10101010  (0xAA)    11001100  (0xCC)    11011101  (0xDD)
01010101  (0x55)    00110011  (0x33)    01110111  (0x77)
10101010  (0xAA)    11001100  (0xCC)    11011101  (0xDD)
01010101  (0x55)    00110011  (0x33)    01110111  (0x77)
10101010  (0xAA)    11001100  (0xCC)    11011101  (0xDD)
01010101  (0x55)    00110011  (0x33)    01110111  (0x77)
10101010  (0xAA)    11001100  (0xCC)    11011101  (0xDD)
01010101  (0x55)    00110011  (0x33)    01110111  (0x77)
```

---

### BSC (Border Screen) -- 11136 bytes

Full-frame screen including border areas. The total visible area is **384 x 304 pixels**.

**Hardware constraints**: On real hardware, there is no way to place a single dot on the border. The border color is changed by writing to port 0xFE, and the Z80 CPU timing determines what is possible. Each color change produces a horizontal stripe at least **24 pixels long** (the minimum time between consecutive OUT instructions), positioned at **2-pixel granularity** (1 T-state = 2 pixels at the 7 MHz pixel clock). The only exception is when a color stripe touches the edge of the border or the main screen paper area, where it can be shorter. The BSC format models this constraint with its per-line color pair encoding.

**Border size varies**: Different ZX Spectrum models and clones generate different numbers of border lines. Additionally, CRT television sets and monitors each overscan by different amounts, hiding part of the border. This is why emulators typically offer multiple border size options (e.g., none/tiny/small/medium/full, named differently across emulators). The BSC format uses 64 top / 48 bottom / 64 side pixels as one common representation.

```
Offset  Size   Content
0       6912   Standard SCR data (256 x 192 main screen)
6912    1536   Top border    (64 lines x 24 bytes)
8448    1536   Side borders  (192 lines x 8 bytes)
9984    1152   Bottom border (48 lines x 24 bytes)
```

Total border data: 4224 bytes. File extension: `.bsc`

#### Frame Layout

```
+------------------------------------------+
|              Top border                  |  64 lines
|            (384 x 64 px)                 |
+------+----------------------------+------+
| Left |                            | Right|
| 64px |     Main screen            | 64px |  192 lines
|      |     (256 x 192 px)         |      |
+------+----------------------------+------+
|             Bottom border                |  48 lines
|            (384 x 48 px)                 |
+------------------------------------------+
         384 pixels wide
```

#### Border Color Encoding

Each byte encodes two color blocks of 8 pixels each:

```
  Bit:  7  6    5  4  3       2  1  0
      +------+----------+-----------+
      |unused| Color 2  |  Color 1  |
      +------+----------+-----------+
```

- **Bits 0-2**: First color (0-7), covers 8 pixels
- **Bits 3-5**: Second color (0-7), covers next 8 pixels
- **Bits 6-7**: Unused

**Top/bottom border lines**: 24 bytes = 48 color pairs = 384 pixels
**Side border lines**: 8 bytes (4 left + 4 right) = 16 color pairs = 128 pixels

---

### IFL (8 x 2 Multicolor) -- 9216 bytes

Enhanced color resolution with one attribute per 8 x 2 pixel area instead of 8 x 8.

```
Offset  Size   Content
0       6144   Bitmap data (standard interleaved)
6144    3072   Attributes (96 rows x 32 columns)
```

- File extension: `.ifl`
- 96 attribute rows (192 / 2), allowing color changes every 2 pixel lines
- Attribute layout: row-major, 32 bytes per row

---

### MLT (8 x 1 Multicolor) -- 12288 bytes

Maximum color resolution with one attribute per 8 x 1 pixel area.

```
Offset  Size   Content
0       6144   Bitmap data (standard interleaved)
6144    6144   Attributes (192 rows x 32 columns)
```

- File extensions: `.mlt`, `.mc`
- 192 attribute rows, one per pixel line
- Each attribute byte uses the same format as standard (ink/paper/bright/flash)

---

### MLT+ULA+ (8 x 1 Multicolor with Enhanced Palette) -- 12352 bytes

**Hardware extension** -- requires a ULA+ compatible interface or enhanced clone (see ULA+ section above).

Combines the MLT 8×1 multicolor layout with a 64-byte ULA+ palette, allowing up to 64 unique colors instead of the standard 16. Uses the Timex Hi-Colour memory layout where both bitmap and attributes are stored in ZX-interleaved (third-based) format.

```
Offset  Size   Content
0       6144   Bitmap data (ZX-interleaved)
6144    6144   Attributes (ZX-interleaved, 192 rows x 32 columns)
12288   64     GRB332 palette (4 CLUTs x 16 colors)
```

- File extension: `.mlt` (detected by size 12352)
- Unlike standard MLT (which stores attributes in linear row-major order), MLT+ULA+ stores both bitmap and attributes using ZX-interleaved addressing (the same thirds-based interleaving used for the bitmap area in standard SCR)
- The attribute byte selects colors from the ULA+ palette instead of the fixed ZX Spectrum palette:

```
Attribute byte:  F  B  P2 P1 P0 I2 I1 I0

clut      = (F << 1) | B          // selects one of 4 CLUTs
ink_idx   = (clut * 16) + I       // ink color: palette[clut*16 + ink]
paper_idx = (clut * 16) + 8 + P   // paper color: palette[clut*16 + 8 + paper]
```

- With 192 attribute rows and 4 CLUTs, this format provides per-scanline color control with a 64-color palette
- The 64-byte palette uses the same GRB332 encoding and CLUT organization as the standard ULA+ format (see the ULA+ section for details)
- Flash bit selects CLUT group (not animation), same as ULA+

---

### BMC4 (8 x 4 Multicolor + Border) -- 11904 bytes

Dual-attribute format splitting each 8 x 8 cell into two 8 x 4 halves, plus full border data.

```
Offset  Size   Content
0       6144   Bitmap data
6144    768    Attribute bank 1 (top 4 lines of each cell)
6912    768    Attribute bank 2 (bottom 4 lines of each cell)
7680    4224   Border data (same format as BSC)
```

- File extension: `.bmc4`

#### Attribute Banks

The format stores two independent 768-byte attribute banks. How these banks map to pixel lines is not defined by the format itself -- it depends on the rendering code running on the Z80. Different implementations may assign the banks to different line ranges, or not use banking at all if faster drawing is possible another way.

Both banks use standard 32 x 24 layout (768 bytes each). The border data uses the same encoding as BSC format.

---

### BSP (Border Screen with Header) -- variable size

Extended border screen format with a 70-byte header containing metadata and optional RLE-compressed border data. Supports 4 variants via config flags.

```
Header (70 bytes):
Offset  Size   Content
0       3      Magic: "bsp" (0x62, 0x73, 0x70)
3       1      Config: bit7=hasGigaData, bit6=hasBorderData
4       1      Reserved (0)
5       1      Border color (0-7)
6       32     Title (null-terminated ASCII)
38      32     Author (null-terminated ASCII)
```

Data layout after header (offset 70):

| Config | Variant              | Data                                                              |
|--------|----------------------|-------------------------------------------------------------------|
| 0x00   | Screen only          | `[screen1: 6912]`                                                |
| 0x40   | Screen + border      | `[screen1: 6912][border1_RLE]`                                    |
| 0x80   | Gigascreen           | `[screen1: 6912][screen2: 6912]`                                  |
| 0xC0   | Gigascreen + border  | `[border2Offset: 2LE][screen1: 6912][screen2: 6912][b1_RLE][b2_RLE]` |

For gigascreen + border (0xC0), the 2-byte little-endian `border2Offset` at offset 70 is the absolute file position where the second border RLE stream begins. Screens start at offset 72.

#### RLE Border Encoding

Each RLE byte: `color = byte & 7`, `tactsCode = (byte >> 3) & 0x1F`.

The RLE operates on individual pixels in a 384×304 border coordinate space (256+64+64 wide, 192+64+48 tall). On side rows (y = 64..255), the cursor skips from x=64 to x=320, covering only the left and right 64-pixel border strips.

Decoding rules (pixel count = `line * 2`):
- `tactsCode = 0`: fill to end of current segment (end of line, or center skip on side rows)
- `tactsCode = 1`: next byte = `line`, pixels = `line × 2`
- `tactsCode = 2`: pixels = `12 × 2 = 24`
- `tactsCode >= 3`: pixels = `(tactsCode + 13) × 2`

Decoded border data is stored internally as 4224 bytes in the same raw format as BSC.

- File extension: `.bsp`

---

### RGB3 (Tricolor) -- 18432 bytes

Three separate monochrome bitmaps representing Red, Green, and Blue channels, combined additively.

```
Offset  Size   Content
0       6144   Red plane bitmap
6144    6144   Green plane bitmap
12288   6144   Blue plane bitmap
```

- File extension: `.3`
- Each plane uses standard ZX Spectrum bitmap interleaving
- No attribute data; colors are pure R, G, B combinations

#### Additive Color Mixing

Each pixel can be one of 8 colors based on which planes have the bit set:

| R | G | B | Color   |
|---|---|---|---------|
| 0 | 0 | 0 | Black   |
| 0 | 0 | 1 | Blue    |
| 0 | 1 | 0 | Green   |
| 0 | 1 | 1 | Cyan    |
| 1 | 0 | 0 | Red     |
| 1 | 0 | 1 | Magenta |
| 1 | 1 | 0 | Yellow  |
| 1 | 1 | 1 | White   |

**Flickering**: Like Gigascreen, this format relies on rapidly alternating frames and produces strong visible flicker on real hardware. See the flickering note under Gigascreen below.

---

### Gigascreen -- 13824 bytes

Two complete SCR frames alternated at 50 Hz to create the illusion of more colors through temporal dithering.

```
Offset  Size   Content
0       6912   Frame 1 (standard SCR)
6912    6912   Frame 2 (standard SCR)
```

- File extension: `.img` (must be exactly 13824 bytes)
- On real hardware, the two frames alternate at 50 Hz, relying on persistence of vision to blend the colors

With two frames, the theoretical maximum is 15 x 15 = 225 color combinations per cell (in practice, fewer distinct colors are perceivable).

**Flickering**: Both Gigascreen and RGB3 (tricolor) formats produce strong visible flicker on real hardware. In the CRT era, the slow phosphor decay of television sets partially blended the alternating frames, making the effect more tolerable to the human eye. Later, various hardware modifications appeared with different degrees of success at reducing the flicker. Regardless, on a classic ZX Spectrum 48/128 these formats are a real pain to watch.

---

### MGH / Multiartist (Multicolor Gigascreen) -- variable size

Two-frame gigascreen format with multicolor attributes, created by the Multiartist editor. Each file contains a 256-byte header, two SCR-interleaved bitmaps, and attribute data whose size depends on the attribute cell height (mode). Four modes are defined: mg8 (8x8), mg4 (8x4), mg2 (8x2), and mg1 (8x1 with split inner/outer regions).

- File extensions: `.mg8`, `.mg4`, `.mg2`, `.mg1`
- Like standard Gigascreen, the two frames alternate at 50 Hz to produce additional colors through temporal dithering

#### Header (256 bytes)

| Offset | Size | Field        | Description                              |
|--------|------|--------------|------------------------------------------|
| 0      | 3    | Signature    | ASCII `"MGH"` (bytes `4D 47 48`)         |
| 3      | 1    | Version      | Format version (1)                       |
| 4      | 1    | Mode         | Attribute cell height: 1, 2, 4, or 8    |
| 5      | 1    | Border 1     | Border color for frame 1 (0-7)          |
| 6      | 1    | Border 2     | Border color for frame 2 (0-7)          |
| 7-255  | 249  | Reserved     | Unused (zero-filled)                     |

#### Data Layout (mg2, mg4, mg8)

```
Offset  Size          Content
0       256           Header
256     6144          Bitmap 1 (SCR-interleaved)
6400    6144          Bitmap 2 (SCR-interleaved)
12544   attrSize      Attributes frame 1
12544+A attrSize      Attributes frame 2
```

Attribute sizes and file sizes per mode:

| Mode | Cell Height | Attr Rows | Attr Size | File Size    |
|------|-------------|-----------|-----------|--------------|
| mg8  | 8 x 8       | 24        | 768       | 14080 bytes  |
| mg4  | 8 x 4       | 48        | 1536      | 15616 bytes  |
| mg2  | 8 x 2       | 96        | 3072      | 18688 bytes  |

Attributes are stored row-major (left-to-right, top-to-bottom), 32 bytes per row, using the standard ZX Spectrum attribute byte format.

#### Data Layout (mg1)

Mode 1 has a **split attribute structure** with two distinct regions per frame:

- **Inner attributes**: cover the middle 16 columns (8-23) at 8 x 1 resolution. 192 rows x 16 columns = 3072 bytes per frame.
- **Outer attributes**: cover the side columns (0-7 and 24-31) at 8 x 8 resolution. 24 rows x 16 columns = 384 bytes per frame.

```
Offset  Size   Content
0       256    Header (mode = 1)
256     6144   Bitmap 1 (SCR-interleaved)
6400    6144   Bitmap 2 (SCR-interleaved)
12544   3072   Inner attributes frame 1 (cols 8-23, 192 rows x 16 cols)
15616   3072   Inner attributes frame 2
18688   384    Outer attributes frame 1 (cols 0-7 then 24-31, 24 blocks x 16 cols)
19072   384    Outer attributes frame 2
```

Total file size: **19456 bytes**.

Inner attributes are stored as 192 rows of 16 bytes each (one byte per column, columns 8 through 23).

Outer attributes are stored in 8-pixel-row blocks. Each block contains 16 bytes: 8 bytes for columns 0-7 (left side), then 8 bytes for columns 24-31 (right side). There are 24 blocks (192 / 8), so 24 x 16 = 384 bytes. Each byte covers an 8 x 8 pixel area.

---

### HLR (Gigascreen Lowres) -- 1628 bytes

A low-resolution gigascreen variant that trades bitmap detail for two blended colors per 8 x 8 char cell. The file is a self-extracting Z80 program that loads the two attribute banks and fills the bitmap area by tiling an 8-byte pattern stored inside the file. **The pattern varies from picture to picture** — different HLR files use different patterns (top/bottom split, left/right split, checkerboard, stripes, diagonals, ...) and the chosen pattern decides how each char cell is divided into an "ink region" and a "paper region".

- File extension: `.hlr` (exact size 1628 bytes, also loadable as a `.tap`/`.sna` payload)
- Effective resolution: depends on the fill pattern; with the most common top/bottom split it is 32 x 48 colored half-cells (each half-cell = 8 x 4 pixels). With a left/right split it is 64 x 24 half-cells (each half-cell = 4 x 8 pixels), and so on.

#### File layout (1628 bytes)

```
Offset  Size   Content
0x000   84     Z80 loader code
0x054   8      Bitmap fill pattern (8 bytes — varies per picture)
0x05C   768    Attribute bank 1 (standard 32 x 24)
0x35C   768    Attribute bank 2 (standard 32 x 24)
```

The 8-byte pattern at offset `0x054` is replicated by the loader to fill the full 6144-byte bitmap: every 8 x 8 cell on screen ends up with the same bit pattern. Wherever the pattern bit is 1 the cell shows its **ink** color, wherever it is 0 it shows its **paper** color. The loader then copies bank 1 to `0x5800` on one frame and bank 2 on the next, producing gigascreen flicker at 50 Hz.

The pattern is **not fixed** by the format — it is an arbitrary 8-byte bitmap chosen per picture and stored inline in the file. Different pictures use different patterns to suit their content.

#### Common fill patterns

HLR editors typically offer a set of named presets for convenience, but any 8-byte value is legal. Commonly seen presets:

| Preset key   | Bytes (hex)                  | Visual                                  |
|--------------|------------------------------|-----------------------------------------|
| `top-bottom` | `FF FF FF FF 00 00 00 00`   | Ink in top 4 rows, paper in bottom 4    |
| `left-right` | `F0 F0 F0 F0 F0 F0 F0 F0`   | Ink in left 4 columns, paper in right 4 |
| `checker1`   | `AA 55 AA 55 AA 55 AA 55`   | 1-pixel checkerboard                    |
| `checker2`   | `CC CC 33 33 CC CC 33 33`   | 2-pixel checkerboard                    |
| `hstripe1`   | `FF 00 FF 00 FF 00 FF 00`   | 1-pixel horizontal stripes              |
| `hstripe2`   | `FF FF 00 00 FF FF 00 00`   | 2-pixel horizontal stripes              |
| `vstripe1`   | `AA AA AA AA AA AA AA AA`   | 1-pixel vertical stripes                |
| `vstripe2`   | `CC CC CC CC CC CC CC CC`   | 2-pixel vertical stripes                |
| `diag-dr`    | `80 C0 E0 F0 F8 FC FE FF`   | Diagonal split, lower-right is ink      |
| `diag-ur`    | `FF 7F 3F 1F 0F 07 03 01`   | Diagonal split, upper-right is paper    |

The choice of pattern affects the spatial subdivision of each char cell but never its color count: each cell still shows exactly two colors per frame (ink + paper) and at most two blended colors after gigascreen mixing. `top-bottom` and `left-right` are the most common because they give two equal-area regions; the stripe and checker patterns interleave the two colors at finer scales for additive mixing.

#### Z80 loader disassembly

HLR files are self-extracting — they load at `$8000` (32768) and run as a code block. Standard BASIC loader stub: `CLEAR 32767: LOAD "" CODE: RANDOMIZE USR 32768`.

```
$8000  76        HALT                 ; sync to interrupt
$8001  AF        XOR  A               ; A = 0
$8002  D3 FE     OUT  ($FE),A         ; border = black
$8004  21 00 58  LD   HL,$5800        ; attribute area
$8007  11 01 58  LD   DE,$5801
$800A  01 FF 02  LD   BC,$02FF        ; 767
$800D  75        LD   (HL),L          ; L=0, seed first attr byte
$800E  ED B0     LDIR                 ; clear all 768 attrs to 0

$8010  21 00 40  LD   HL,$4000        ; bitmap third 1
$8013  CD 43 80  CALL $8043           ;   fill with pattern
$8016  21 00 48  LD   HL,$4800        ; bitmap third 2
$8019  CD 43 80  CALL $8043
$801C  21 00 50  LD   HL,$5000        ; bitmap third 3
$801F  CD 43 80  CALL $8043

frame_loop:
$8022  76        HALT                 ; wait for frame sync
$8023  21 5C 80  LD   HL,$805C        ; attribute bank 1 source
$8026  11 00 58  LD   DE,$5800
$8029  01 00 03  LD   BC,$0300        ; 768
$802C  ED B0     LDIR                 ; copy bank 1 → attrs

$802E  76        HALT                 ; wait for next frame
$802F  21 5C 83  LD   HL,$835C        ; attribute bank 2 source
$8032  11 00 58  LD   DE,$5800
$8035  01 00 03  LD   BC,$0300
$8038  ED B0     LDIR                 ; copy bank 2 → attrs

$803A  AF        XOR  A
$803B  DB FE     IN   A,($FE)         ; read keyboard row
$803D  F6 E0     OR   $E0             ; mask to 5 keyboard bits
$803F  3C        INC  A               ; $FF+1 = 0 iff no key pressed
$8040  28 E0     JR   Z,$8022         ; no key → keep flickering
$8042  C9        RET                  ; any key → back to BASIC

fill_third (HL = third base):
$8043  11 54 80  LD   DE,$8054        ; 8-byte pattern source
$8046  06 08     LD   B,8
$8048  4C        LD   C,H             ; save base high byte
inner:
$8049  1A        LD   A,(DE)          ; pattern byte
$804A  77        LD   (HL),A          ; write to screen
$804B  13        INC  DE
$804C  24        INC  H               ; +$100 = next scanline of char
$804D  10 FA     DJNZ inner           ; 8 scanlines of one column
$804F  61        LD   H,C             ; restore high byte
$8050  2C        INC  L               ; next column / char row
$8051  20 F0     JR   NZ,$8043        ; 256 L values → full third
$8053  C9        RET

$8054  FF FF FF FF 00 00 00 00        ; 8-byte bitmap pattern (example: top/bottom split)
```

The eight bytes at `$8054` are the **per-picture fill pattern**: this example shows a top/bottom split (`top-bottom` preset), but any 8-byte value is valid and different pictures use different patterns. See the [Common fill patterns](#common-fill-patterns) table above.

How it works:

1. **Clear attributes** (`$8004-$800E`): wipe the entire 768-byte attribute area at `$5800` to zero so the first visible frame doesn't flash junk.
2. **Fill bitmap** (`$8010-$8021`): call `fill_third` three times with `HL = $4000, $4800, $5000` — one call per screen third. `fill_third` exploits the ZX bitmap interleave: incrementing `H` (the high byte) advances by `$100`, which is exactly the distance between consecutive scanlines of the same char row. The inner `DJNZ` loop writes all 8 scanlines of one char column from the 8-byte pattern at `$8054`, then the outer `INC L` loop walks through the 256 `(char_row, column)` combinations inside the third. After all three thirds, every char cell on screen contains an exact copy of the 8-byte pattern from the file (whatever that picture chose — `FF FF FF FF 00 00 00 00`, `F0 F0 ...`, etc).
3. **Flicker loop** (`$8022-$8040`): `HALT` waits for the 50 Hz frame interrupt, then `LDIR` copies bank 1 over the attribute area. Another `HALT` waits one more frame, then bank 2 is copied. A quick keyboard poll on port `$FE` (`OR $E0` masks off the non-keyboard bits, `INC A` sets Z exactly when all 5 keyboard bits are high = no key pressed) loops back to keep the two banks alternating.
4. **Exit** (`$8042`): any keypress breaks out of the flicker loop and returns to BASIC, leaving the last displayed frame on screen.

Note that the loader addresses the two attribute banks as `$805C` and `$835C` — these are absolute addresses that assume the file was loaded at `$8000`. If the host code loads the file elsewhere, the two `LD HL` instructions at `$8023` and `$802F` would need to be patched.

#### How the two colors per cell are produced

Because the bitmap is fixed by the per-picture fill pattern, each char cell displays only two kinds of pixels:

- **Ink region** (pattern bits = 1): always shows the cell's **ink** color from the current frame's attribute byte.
- **Paper region** (pattern bits = 0): always shows the cell's **paper** color from the current frame's attribute byte.

The shape and area of these two regions depend on the pattern. With `top-bottom` they are top/bottom 8 x 4 halves; with `left-right` they are left/right 4 x 8 halves; with the checker and stripe patterns they are interleaved at 1- or 2-pixel granularity.

When the two frames alternate, each region shows a blend of the two frames' corresponding colors:

- ink region = blend(bank1.ink, bank2.ink)
- paper region = blend(bank1.paper, bank2.paper)

This gives two independently chosen blended colors per 8 x 8 cell. The effective color grid depends on the pattern: `top-bottom` yields a 32 x 48 grid of horizontal half-cells, `left-right` yields a 64 x 24 grid of vertical half-cells, and the finer interleaved patterns give two colors mixed within the same 8 x 8 area at sub-cell granularity.

#### Bright bit constraint

Each attribute byte has a single bright bit shared by its ink and paper nibbles. This means **within one frame**, ink and paper brightness are linked. For an HLR cell, that imposes a constraint on which (ink-blend, paper-blend) pairs are reachable: if bank1 is regular-bright and bank2 is bright-bright, the paper blend must share those same bright flags. In practice the picker auto-selects a legal paper attribute once the user picks an ink blend, so the constraint is mostly invisible while editing.

#### Color count

The ZX Spectrum attribute byte allows 16 (ink, bright) combinations, but bright-black and regular-black render as the same on-screen color (`#000000`), so the palette has only **15 visually distinct colors**. Each HLR region (ink or paper) is a gigascreen blend of two of those 15 colors with repetition allowed and order irrelevant (frame 1 vs frame 2 swap is invisible to the eye), which gives 15 x 16 / 2 = **120 visually distinct blended colors** per region.

#### Typical editor behavior

- Drawing tools usually never touch the bitmap in HLR mode; they only modify the two attribute banks. The per-picture 8-byte fill pattern is preserved at all times.
- Clicking on a pixel that the pattern marks as **ink** (bit = 1) updates the cell's ink blend; clicking on a **paper** pixel (bit = 0) updates the paper blend. With the `top-bottom` pattern this means click top-half for ink, bottom-half for paper; with `left-right` it means click left-half for ink, right-half for paper; and so on for other patterns. Fill-cell and recolor-cell tools typically apply the current selection to both regions at once.
- The fill pattern itself is usually editable through a dedicated dialog offering the named presets plus a custom hex editor and a live preview of the resulting cell shape.
- The Gigascreen 4-color picker is normally filtered in HLR mode: only the two physically displayable entries (Ink+Ink and Paper+Paper) are shown. The other two gigascreen quadrants (Ink+Paper / Paper+Ink) can't be drawn because the bitmap is fixed.
- When creating a new HLR picture, editors typically let the user pick the initial fill pattern and seed bank 1 and bank 2 from the currently selected gigascreen virtual ink/paper colors so a fresh HLR picture inherits the palette choices instead of a default blue/white.
- Internally, HLR is naturally represented as a 2-plane gigascreen picture (`planeCount: 2`, `colorMode: gigascreen`, `attrCellHeight: 8`) with the 8-byte fill pattern carried alongside; on export, only the fill pattern and the attribute arrays of the two planes are written.

---

### STL (Stellar) -- 3072 bytes

A compact gigascreen multicolor format with **64 x 48 fat pixels** (each fat pixel is 4 x 4 real pixels). Two attribute frames of 1536 bytes each are interleaved in the file; the bitmap is a **fixed** pattern `0x0F` for every byte, giving each 8 x 4 multicolor cell two halves: left 4 pixels show the cell's paper color, right 4 pixels show the cell's ink color.

- File extension: `.stl` (exact size 3072 bytes)
- Effective resolution: 64 x 48 colored half-cells (each half-cell = 4 x 4 pixels)
- Attribute cell height: 4 pixels (same as mg4 / BMC4)

#### File layout (3072 bytes)

The file stores two 1536-byte attribute frames interleaved in 4-byte groups:

```
For each pair index j = 0, 2, 4, ..., 1534:
  byte[j*2 + 0] = frame1[j]
  byte[j*2 + 1] = frame1[j + 1]
  byte[j*2 + 2] = frame2[j]
  byte[j*2 + 3] = frame2[j + 1]
```

Each attribute frame is a flat 32 x 48 grid (32 columns x 48 rows) of standard ZX attribute bytes. Row 0 is the top of the screen; column 0 is the left edge. The attribute byte format is the standard `FBPPPIII` (flash, bright, paper 3 bits, ink 3 bits).

#### How the two colors per cell are produced

The bitmap is **always** `0x0F` — the same value for every byte in every cell. In binary this is `00001111`, so within each 8-pixel horizontal span:

- Bits 7-4 (leftmost 4 pixels): **0** → paper color
- Bits 3-0 (rightmost 4 pixels): **1** → ink color

Combined with the 4-pixel attribute cell height, every 8 x 4 cell shows two independent 4 x 4 colored blocks side by side: paper on the left, ink on the right.

When the two gigascreen frames alternate at 50 Hz:

- Left half = blend(frame1.paper, frame2.paper)
- Right half = blend(frame1.ink, frame2.ink)

This gives two independently chosen blended colors per 8 x 4 cell, for a total grid of 64 x 48 fat pixels across the 256 x 192 display.

#### Comparison with HLR

| Property         | STL                         | HLR                                     |
|------------------|-----------------------------|------------------------------------------|
| File size        | 3072 bytes                  | 1628 bytes                               |
| Bitmap pattern   | Fixed `0x0F` (always)       | Per-picture 8-byte pattern (varies)      |
| Attr cell height | 4 px (multicolor)           | 8 px (standard)                          |
| Attr grid        | 32 x 48 (1536 bytes/frame)  | 32 x 24 (768 bytes/frame)               |
| Fat pixel grid   | 64 x 48                     | Depends on pattern (typically 32 x 48)   |
| File prefix      | None (attrs only)           | 84-byte Z80 loader + 8-byte pattern     |

STL trades the variable-pattern flexibility of HLR for a higher vertical resolution: 48 multicolor rows instead of 24, achieved by using 4-pixel-tall attribute cells. The fixed bitmap eliminates the need for a loader or pattern storage — the file contains only the two interleaved attribute frames.

#### Bright bit constraint

Same as standard gigascreen: each attribute byte's single bright bit applies to both ink and paper within the same frame. The blended color pair is constrained by the (bright1, bright2) combination across the two frames. In practice this limits which (ink-blend, paper-blend) pairs are simultaneously achievable in one cell.

#### Color count

Same as HLR: each fat pixel is a blend of two of the 15 visually distinct ZX colors (with repetition, order-independent), giving up to **120 blended colors** per half-cell position.

---

### NXI (ZX Spectrum Next Layer 2 with Palette)

A 256-color indexed-pixel format for the ZX Spectrum Next Layer 2 display. Unlike all classic ZX Spectrum formats, NXI uses **direct indexed color** — one byte per pixel mapping to an RGB333 palette — with no attributes, no color clash, and no bitmap interleaving.

Three Layer 2 modes are supported, each with a different file size:

```
Mode          Palette             Pixel Data                   Total Size
256×192 8bpp  512 bytes (256×2)   49152 bytes, row-major       49664
320×256 8bpp  512 bytes (256×2)   81920 bytes, column-major    82432
640×256 4bpp   32 bytes (16×2)    81920 bytes, column-major    81952
```

- File extension: `.nxi`
- Hardware: ZX Spectrum Next (not compatible with classic ZX Spectrum 48/128)

#### Palette Entry Format (RGB333, 9 bits in 2 bytes)

Each palette entry is 2 bytes encoding a 9-bit RGB333 color:

```
Byte 0:
  Bit 7-5: Red   (3 bits, 0-7)
  Bit 4-2: Green (3 bits, 0-7)
  Bit 1-0: Blue  (upper 2 bits of 3-bit value)

Byte 1:
  Bit 7-1: Unused (0)
  Bit 0:   Blue   (lower 1 bit of 3-bit value)
```

Decoding:

```
r3 = (byte0 >> 5) & 7
g3 = (byte0 >> 2) & 7
b3 = ((byte0 & 3) << 1) | (byte1 & 1)

R = round(r3 * 255 / 7)
G = round(g3 * 255 / 7)
B = round(b3 * 255 / 7)
```

The 9-bit palette gives 512 possible colors. The 256×192 and 320×256 modes use a 256-entry palette (512 bytes). The 640×256 mode uses only 16 entries (32 bytes) since each pixel is 4 bits.

#### Pixel Data — 256×192 (8bpp, row-major)

Pixels are stored in **linear row-major order** (left-to-right, top-to-bottom) with no interleaving:

```
Row   0: bytes 512-767      (pixels 0-255)
Row   1: bytes 768-1023     (pixels 256-511)
...
Row 191: bytes 49408-49663  (pixels 48896-49151)
```

Each byte is a palette index (0-255). The pixel at position (x, y) is at offset `512 + y * 256 + x`.

#### Pixel Data — 320×256 (8bpp, column-major)

Pixels are stored in **column-major order** (top-to-bottom, left-to-right). Each byte is a palette index (0-255):

```
Column   0: bytes 512-767       (y = 0-255)
Column   1: bytes 768-1023      (y = 0-255)
...
Column 319: bytes 82176-82431   (y = 0-255)
```

The pixel at position (x, y) is at offset `512 + x * 256 + y`.

#### Pixel Data — 640×256 (4bpp, column-major)

Pixels are stored in **column-major order** with 2 pixels packed per byte. Only the first 16 palette entries are used:

```
Column pair 0-1: bytes 32-287     (y = 0-255)
Column pair 2-3: bytes 288-543    (y = 0-255)
...
Column pair 638-639: bytes 81696-81951  (y = 0-255)
```

Each byte encodes two horizontally adjacent pixels:
- **High nibble** (bits 7-4): left pixel (even x)
- **Low nibble** (bits 3-0): right pixel (odd x)

The byte for pixel column pair (x, x+1) at row y is at offset `32 + (x/2) * 256 + y` (where x is even). Palette indices are 0-15.

---

### SL2 (ZX Spectrum Next Layer 2 Raw)

Same pixel format as NXI but with the palette **appended after pixel data** (optional). When no palette is present, the file uses the default identity RGB332 palette where the pixel byte value directly encodes the color.

Both NXI and SL2 use the same RGB333 palette encoding (2 bytes per entry: `byte0 = RRRGGGBB`, `byte1 = 0000000B`). The key difference is **layout order**: NXI stores palette first then pixels; SL2 stores pixels first with an optional palette appended at the tail.

```
Variant A — raw pixels, 256×192 (49152 bytes):
Offset  Size    Content
0       49152   Pixel data (256 × 192, 1 byte per pixel, linear row-major)

Variant B — with header, 256×192 (49280 bytes):
Offset  Size    Content
0       128     Header (contents unspecified)
128     49152   Pixel data (256 × 192, 1 byte per pixel, linear row-major)

Variant C — with palette, 256×192 (49664 bytes):
Offset  Size    Content
0       49152   Pixel data (256 × 192, 1 byte per pixel, linear row-major)
49152   512     Palette (256 entries × 2 bytes, RGB333 — same encoding as NXI)

Variant D — extended mode, no palette (81920 bytes):
Offset  Size    Content
0       81920   Pixel data, column-major (AMBIGUOUS — see below)

Variant E — extended 320×256 with palette (82432 bytes):
Offset  Size    Content
0       81920   Pixel data (320 × 256, 8bpp, column-major)
81920   512     Palette (256 entries × 2 bytes, RGB333)

Variant F — extended 640×256 with palette (81952 bytes):
Offset  Size    Content
0       81920   Pixel data (640 × 256, 4bpp, column-major)
81920   32      Palette (16 entries × 2 bytes, RGB333)
```

- File extension: `.sl2`
- Hardware: ZX Spectrum Next

#### Extended SL2 Ambiguity

An 81920-byte SL2 file contains raw pixel data without a palette and **is ambiguous**: it could be either 320×256 (8bpp, 1 byte/pixel, column-major) or 640×256 (4bpp, 2 pixels/byte, column-major). Both modes produce exactly 81920 bytes of pixel data. The correct interpretation depends on the intended Layer 2 mode and cannot be determined from the file alone.

- **320×256 (8bpp)**: Each byte is a palette index (0-255). Address = `x * 256 + y`. Uses the full 256-entry default palette.
- **640×256 (4bpp)**: Each byte packs two pixels (high nibble = left, low nibble = right). Address = `(x/2) * 256 + y`. Uses only the first 16 entries of the default palette.

#### Default RGB332 Identity Palette

Without an embedded palette, each pixel byte maps directly to a color via the RRRGGGBB bit layout:

```
Pixel byte:
  Bit 7-5: Red   (3 bits, 0-7)
  Bit 4-2: Green (3 bits, 0-7)
  Bit 1-0: Blue  (2 bits, 0-3)
```

Conversion to 8-bit RGB:

```
r3 = (byte >> 5) & 7
g3 = (byte >> 2) & 7
b2 = byte & 3
b3 = (b2 << 1) | (b2 >> 1)    // expand 2-bit blue to 3-bit by replicating MSB

R = round(r3 * 255 / 7)
G = round(g3 * 255 / 7)
B = round(b3 * 255 / 7)
```

The 2-bit blue channel limits SL2 to 256 fixed colors (vs NXI's 512 selectable colors). The blue expansion formula `(b2 << 1) | (b2 >> 1)` maps: 0→0, 1→3, 2→4, 3→7, distributing the 4 blue levels across the 0-7 range.

For the 640×256 (4bpp) mode, only the first 16 entries of this default palette are used.

#### Pixel Data

The 256×192 variants use linear row-major layout, same as NXI 256×192. The pixel at (x, y) is at offset `y * 256 + x` (raw variant) or `128 + y * 256 + x` (header variant).

The extended 81920-byte variant uses column-major layout as described above: `x * 256 + y` for 320×256 or `(x/2) * 256 + y` for 640×256.

#### NXI vs SL2 Palette Layout

Both formats use identical pixel data and the same 2-byte RGB333 palette encoding. The only structural difference is the palette position:

| Format | Layout                          |
|--------|---------------------------------|
| NXI    | `[palette] [pixels]` — palette always present, before pixel data |
| SL2    | `[pixels] [palette]?` — pixels first, palette optionally appended at the tail |

When an SL2 file has no embedded palette, the hardware uses the default RGB332 identity mapping. When a custom palette is needed, it can be appended after the pixel data — the file size distinguishes the variants (e.g. 49152 = raw, 49664 = with palette for 256×192).

Note that NXI palettes use full 9-bit RGB333 (512 possible colors), while the default SL2 identity palette is limited to 8-bit RGB332 (256 fixed colors, with only 2 bits for blue). Converting from a custom NXI palette to the default SL2 palette is therefore lossy.

---

### SLR (ZX Spectrum Next LoRes) -- 12288 bytes

A low-resolution 256-color mode for the ZX Spectrum Next. Unlike Layer 2 (NXI/SL2), LoRes uses the ULA display path at a reduced resolution of **128 x 96 pixels**, with one byte per pixel indexing the default ULA palette (256 entries, RGB332 encoding).

```
Offset  Size    Content
0       12288   Pixel data (128 x 96, 1 byte per pixel, row-major)
```

- File extension: `.slr`
- Hardware: ZX Spectrum Next (not compatible with classic ZX Spectrum 48/128)
- No embedded palette; uses the default RGB332 identity palette (same as SL2)

#### Pixel Data Layout

Pixels are stored in **linear row-major order** (left-to-right, top-to-bottom) with no interleaving:

```
Row  0: bytes 0-127      (pixels 0-127)
Row  1: bytes 128-255    (pixels 128-255)
...
Row 95: bytes 12160-12287 (pixels 12160-12287)
```

Each byte is a palette index (0-255). The pixel at position (x, y) is at offset `y * 128 + x`.

#### Hardware Memory Layout

LoRes mode uses bank 5 (pages 10-11) of the ZX Spectrum Next memory, split into two halves with a gap:

```
$4000-$57FF  Top 48 lines     (6144 bytes) — page 10
$5800-$5FFF  Gap               (2048 bytes, unused by LoRes)
$6000-$77FF  Bottom 48 lines  (6144 bytes) — page 11
```

The gap at `$5800-$5FFF` corresponds to the legacy ULA attribute area and is not used by LoRes mode. When assembling a `.nex` executable, pixel data must be placed respecting this split: the first 6144 bytes at `$4000` and the second 6144 bytes at `$6000`, with 2048 bytes of padding between them.

#### Next Registers

| Register | Value  | Description                                    |
|----------|--------|------------------------------------------------|
| `$15`    | `$80`  | Bit 7 = 1: enable LoRes mode                  |
| `$69`    | `$00`  | ULA palette offset = 0                         |
| `$6A`    | `$00`  | LoRes X scroll offset                          |
| `$6B`    | `$00`  | LoRes Y scroll offset                          |
| `$1C`    | `$02`  | Reset ULA/LoRes clip index (bit 1)             |
| `$1A`    | (4×)   | ULA/LoRes clip window (X1, X2, Y1, Y2)        |

The clip window register `$1A` uses **ULA-equivalent coordinates** (0-255 for X, 0-191 for Y), not LoRes pixel coordinates. For full visibility: X1=0, X2=255, Y1=0, Y2=191. Each LoRes pixel maps to a 2x2 area in ULA coordinates.

Layer 2 must be explicitly disabled (port `$123B` = 0) when using LoRes mode, as the NEX loader or emulator may have it active by default.

#### Default RGB332 Palette

LoRes uses the same default identity palette as SL2. Each pixel byte directly encodes its color via the RRRGGGBB bit layout:

```
Pixel byte:
  Bit 7-5: Red   (3 bits, 0-7)
  Bit 4-2: Green (3 bits, 0-7)
  Bit 1-0: Blue  (2 bits, 0-3)
```

Conversion to 8-bit RGB is identical to SL2 (see the SL2 section above).

#### Size Ambiguity with MLT

The SLR file size (12288 bytes) is identical to the MLT (8x1 multicolor) format. These two formats cannot be distinguished by size alone — file extension (`.slr` vs `.mlt`/`.mc`) must be used. Without an extension, 12288 bytes defaults to MLT for backwards compatibility with the older classic Spectrum format.

---

### RAD (ZX Spectrum Next LoRes Radastan) -- 6144, 6160, or 6176 bytes

A low-resolution 16-color mode originally from the **ZX-Uno** (Radastan mode), also supported by the ZX Spectrum Next. Uses the same 128 x 96 pixel resolution as standard LoRes but packs **two pixels per byte** (4 bits per pixel), reducing the data to 6144 bytes and using only the first 16 entries of the ULA palette.

Three file sizes are recognized:

```
Size    Content
6144    Pixel data only (no embedded palette)
6160    Pixel data + 16-byte GRB332 palette (ZX-Uno format, 1 byte/color)
6176    Pixel data + 32-byte RGB333 palette (ZX Next format, 2 bytes/color)
```

```
Offset  Size    Content
0       6144    Pixel data (128 x 96, 4bpp packed nibbles, row-major)
6144    0/16/32 Optional palette (see above)
```

- Primary file extension: `.rad`
- `.slr` files of 6144, 6160, or 6176 bytes are also auto-detected as Radastan
- Hardware: ZX-Uno, ZX Spectrum Next (not compatible with classic ZX Spectrum 48/128)
- Without an embedded palette, uses the first 16 entries of the default RGB332 identity palette
- The 16-byte GRB332 palette uses the same encoding as ULA+ (see the ULA+ section): GGGRRRBB, 1 byte per color
- The 32-byte RGB333 palette uses the same encoding as NXI/SL2: RRRGGGBB + 0000000B, 2 bytes per color

#### Pixel Packing

Each byte contains two horizontally adjacent pixels:

```
Bit:    7  6  5  4  3  2  1  0
        |  Left   |  |  Right  |
        High nibble  Low nibble
```

- **High nibble** (bits 7-4): left pixel (even x)
- **Low nibble** (bits 3-0): right pixel (odd x)
- Palette index range: 0-15

The byte at offset `y * 64 + (x >> 1)` contains the pixel at (x, y). For even x, the color is `(byte >> 4) & 0x0F`; for odd x, it is `byte & 0x0F`.

#### Hardware Memory Layout

The hardware LoRes engine reads 128 bytes per row even in 4bpp Radastan mode, using the same split layout as 8bpp LoRes. In 4bpp mode each byte represents 2 pixels, giving 256 pixels per row (filling the 256-pixel ULA width directly without horizontal pixel doubling).

For a 128×96 source image (64 bytes/row in the `.rad` file), each source pixel must be **doubled horizontally** for hardware display: source nibble N becomes output byte `(N<<4)|N`, expanding 64 source bytes to 128 hardware bytes per row.

```
$4000-$57FF  Top 48 lines     (6144 bytes, 128 bytes/row pixel-doubled) — page 10
$5800-$5FFF  Gap               (2048 bytes, unused)
$6000-$77FF  Bottom 48 lines  (6144 bytes, 128 bytes/row pixel-doubled) — page 11
```

The `.rad` file stores data contiguously at 64 bytes/row (6144 bytes total). The ASM export performs the pixel doubling and split placement automatically. Both pages 10 and 11 must be mapped via MMU.

The display file base can be $4000 or $6000, determined by the XOR of `$6A` bit 4 and IO `$xxFF` bit 0.

#### Next Registers

| Register | Value  | Description                                    |
|----------|--------|------------------------------------------------|
| `$15`    | `$80`  | Bit 7 = 1: enable LoRes mode                  |
| `$69`    | `$00`  | ULA palette offset = 0                         |
| `$6A`    | `$20`  | Bit 5 = 1: Radastan 4bpp mode; bits 3-0 = palette offset |
| `$6B`    | `$00`  | LoRes Y scroll offset                          |
| `$1C`    | `$02`  | Reset ULA/LoRes clip index (bit 1)             |
| `$1A`    | (4×)   | ULA/LoRes clip window (X1, X2, Y1, Y2)        |

Register `$6A` bit layout:
- Bits 7-6: Reserved (must be 0)
- Bit 5: Radastan mode enable (0 = 256-color 8bpp, 1 = 16-color 4bpp)
- Bit 4: Timex display file XOR (determines $4000 vs $6000 base)
- Bits 3-0: Radastan palette offset (combined with nibble value to index ULA palette)

#### Size Detection

The Radastan file size (6144 bytes) does **not** conflict with standard LoRes (12288 bytes) or MLT (12288 bytes). A `.slr` file of exactly 6144 bytes is detected as Radastan rather than standard LoRes.

---

### Monochrome Formats

Bitmap-only formats with no attribute data. Rendered as black-on-white (or user-selected ink/paper).

| Format   | Size       | Coverage            |
|----------|------------|---------------------|
| Full     | 6144 bytes | 256 x 192 (3 thirds)|
| 2/3      | 4096 bytes | 256 x 128 (2 thirds)|
| 1/3      | 2048 bytes | 256 x 64  (1 third) |

Each third is 2048 bytes using standard bitmap interleaving.

---

### SPECSCII (Text Mode)

Character-based screen format using the ZX Spectrum ROM character set.

- File extension: `.specscii`
- Font: 96 printable characters (0x20-0x7F), each 8 bytes tall

#### Two Logical Formats

SPECSCII exists in two forms:

1. **SCR-based**: A regular `.scr` file rendered using only ROM characters and block graphics. This looks like SPECSCII but is just a standard screen dump -- there is no way to prove it was truly built from characters only. Someone could create a convincing "nearly SPECSCII" image that subtly uses non-character pixel patterns.

2. **Text stream**: A sequence of printable characters and control codes (see table below) that can be fed directly into the ZX BASIC `PRINT` command and output to the screen. This format is editable as text and serves as proof that the picture is genuine SPECSCII, since every byte must map to a valid character or control code.

#### Character Ranges

| Range       | Type             | Description                                    |
|-------------|------------------|------------------------------------------------|
| 0x00 - 0x1F | Control codes   | Attribute and cursor commands (see table below) |
| 0x20 - 0x7F | Printable ASCII | Standard ROM font characters                   |
| 0x80 - 0xFF | Block graphics  | 2 x 2 quadrant block characters                |

#### Control Codes

| Code   | Name    | Parameters         | Description                          |
|--------|---------|--------------------|--------------------------------------|
| `0x0D` | ENTER   | none               | Carriage return + line feed          |
| `0x10` | INK     | 1 byte (0-7)       | Set ink color                        |
| `0x11` | PAPER   | 1 byte (0-7)       | Set paper color                      |
| `0x12` | FLASH   | 1 byte (0 or 1)    | Set flash on/off                     |
| `0x13` | BRIGHT  | 1 byte (0 or 1)    | Set bright on/off                    |
| `0x14` | INVERSE | 1 byte (0 or 1)    | Swap ink and paper                   |
| `0x15` | OVER    | 1 byte (0 or 1)    | XOR mode on/off                      |
| `0x16` | AT      | 2 bytes (row, col) | Position cursor                      |
| `0x17` | TAB     | 1 byte (column)    | Move to tab column                   |

#### Block Graphics (0x80 - 0xFF)

Block graphic characters divide the cell into 4 quadrants. The low 4 bits select which quadrants are filled:

```
  +---+---+
  | 1 | 0 |    Bit 0 = top-right
  +---+---+    Bit 1 = top-left
  | 3 | 2 |    Bit 2 = bottom-right
  +---+---+    Bit 3 = bottom-left
```

Example: `0x88` = bottom-left only, `0x8F` = all four quadrants filled.

---

### SCA (Animation)

Container format for animated sequences of SCR or attribute frames.

- File extension: `.sca`

#### Header (14 bytes)

| Offset | Size | Field          | Description                              |
|--------|------|----------------|------------------------------------------|
| 0      | 3    | Signature      | ASCII `"SCA"`                            |
| 3      | 1    | Version        | Format version (0 or 1)                  |
| 4      | 2    | Frame width    | Little-endian, max 384                   |
| 6      | 2    | Frame height   | Little-endian, max 192                   |
| 8      | 1    | Border color   | Suggested border color (0-7)             |
| 9      | 2    | Frame count    | Little-endian, total number of frames    |
| 11     | 1    | Payload type   | 0 = full frames, 1 = attribute-only      |
| 12     | 2    | Payload offset | Little-endian, offset to frame data area |

#### Payload Type 0 (Full Frames)

```
[Header 14 bytes]
[Delay table: 1 byte per frame]
[Frame 0: 6912 bytes (full SCR)]
[Frame 1: 6912 bytes]
...
[Frame N: 6912 bytes]
```

#### Payload Type 1 (Attribute-Only Frames)

```
[Header 14 bytes]
[Delay table: 1 byte per frame]
[Fill pattern: 8 bytes (bitmap pattern for all cells)]
[Frame 0: 768 bytes (attributes only)]
[Frame 1: 768 bytes]
...
[Frame N: 768 bytes]
```

The fill pattern is tiled across the bitmap as a background; only the attributes change per frame.

#### Timing

Each delay byte represents a duration in units of 20 ms (1/50 second):

```
frame_duration_ms = delay_byte * 20
```

A delay byte of 5 = 100 ms (10 fps). A delay byte of 1 = 20 ms (50 fps).

---

### ZXP (ZX-Paintbrush) -- text-based, variable size

A human-readable text format used by the ZX-Paintbrush editor. Stores bitmap as binary digit strings and attributes as hex values.

- File extension: `.zxp`
- Text file (not binary)
- Resolution: **W x H pixels**, where W is a multiple of 8 and H is a multiple of 8. Standard images use 256 x 192

#### File Structure

```
Line 1:     "ZX-Paintbrush extended image"        (header, must match exactly)
Line 2:     (empty)
Lines 3+:   H lines of W ASCII '0'/'1' chars      (bitmap, linear row order)
            (empty separator)
            N lines of (W/8) space-separated hex bytes  (attributes)
            (optional empty separator)
            (optional) 1 line of 64 space-separated hex bytes (ULA+ palette)
```

#### Bitmap Encoding

Each of the H bitmap lines contains exactly W characters ('0' or '1'), one per pixel, left to right. This is a **linear** row order (line 0 = top of screen), unlike the interleaved layout of the ZX Spectrum SCR format.

#### Attribute Modes

The number of attribute lines determines the color resolution. For a standard 256 x 192 image (32 columns, 192 rows):

| Attr Lines | Mode | Cell Size | Equivalent Binary Format |
|------------|------|-----------|--------------------------|
| 24         | 8x8  | 8 x 8    | SCR (6912 bytes)         |
| 48         | 8x4  | 8 x 4    | --                       |
| 96         | 8x2  | 8 x 2    | IFL (9216 bytes)         |
| 192        | 8x1  | 8 x 1    | MLT (12288 bytes)        |

Each attribute line contains W/8 hex bytes separated by spaces (e.g., `38 07 47 3F ...`). Attribute bytes use the standard format (see section 3).

#### Optional ULA+ Palette

After the attribute block (separated by an empty line), a single line of **64 space-separated hex bytes** may appear. This is a ULA+ palette in GRB332 format (see ULA+ section).

---

### chr$ (Character Array) — binary, variable size

A compact binary format that stores character cell graphics in cell-interleaved order. Supports both standard (8×8 attribute cells) and Gigascreen (two interleaved frames) modes.

- File extensions: `.ch$`, `.chr$`, `.ch-`
- Binary file
- Resolution: **W×8 × H×8 pixels** (W and H are cell counts, 1–255)

#### File Structure

| Offset | Size | Content |
|--------|------|---------|
| 0 | 4 | Magic: `chr$` (bytes `63 68 72 24`) |
| 4 | 1 | Width in cells (W) |
| 5 | 1 | Height in cells (H) |
| 6 | 1 | Bytes per cell: 9 (standard) or 18 (Gigascreen) |
| 7 | W×H×bpc | Cell data (interleaved) |

#### Cell Data Layout (bpc = 9, standard)

Cells are stored **row-major** (left-to-right, top-to-bottom). Each cell contains:

| Bytes | Content |
|-------|---------|
| 0–7 | 8 bitmap bytes (one per pixel row, MSB = leftmost pixel) |
| 8 | 1 attribute byte (standard ZX Spectrum format) |

Total file size: `7 + W × H × 9` bytes.

#### Gigascreen Mode (bpc = 18)

Each cell contains two interleaved frames (for Gigascreen/flicker display):

| Bytes | Content |
|-------|---------|
| 0–7 | Frame 1: 8 bitmap bytes |
| 8 | Frame 1: 1 attribute byte |
| 9–16 | Frame 2: 8 bitmap bytes |
| 17 | Frame 2: 1 attribute byte |

Total file size: `7 + W × H × 18` bytes.

#### Notes

The cell-interleaved layout is compact and efficient for character-oriented graphics (UDGs, tiles, fonts), but requires deinterleaving to linear row-major format for rendering or editing as a bitmap image.

---

### GMX 640×200 (Scorpion ZS 256 Hi-Res) -- 32768 bytes

A high-resolution graphics mode for the **Scorpion ZS 256 Turbo** computer. Provides 640×200 pixel resolution with per-pixel-row attributes (8×1 attribute cells), using standard ZX Spectrum color encoding. The display uses half-width pixels (PAR 2:1), so 640 source pixels appear as 320 physical pixels on screen.

```
Offset  Size    Content
0       16000   Bitmap data (linear, row-major: y * 80 + col, 80 bytes/row × 200 rows)
16000   384     Padding (unused, zeros)
16384   16000   Attribute data (linear, row-major: y * 80 + col, 1 byte per 8×1 cell)
32000   768     Padding (unused, zeros)
```

- File extension: `.c`
- Total size: 32768 bytes
- Bitmap layout: linear row-major (no ZX Spectrum-style interleaving)
- 80 attribute columns × 200 attribute rows = 16000 attributes
- Each attribute byte uses standard ZX format: `FBPPPIII` (flash, bright, paper, ink)
- Attribute cell: 8 pixels wide × 1 pixel tall (same granularity as MLT 8×1 multicolor)

#### Pixel Addressing

Unlike standard SCR which uses interleaved thirds, GMX uses simple linear addressing:

```
Bitmap byte offset = y * 80 + (x / 8)
Bit within byte    = 7 - (x % 8)       (MSB = leftmost pixel)
Attribute offset   = 16384 + y * 80 + (x / 8)
```

#### Display Aspect Ratio

The 640-pixel-wide image is displayed at half width (320 physical pixels) to maintain correct proportions on the Scorpion's display. Each source pixel is 0.5 display pixels wide.

---

### GMX 160×200 (Scorpion ZS 256 Attribute-Only) -- 16128 bytes

An attribute-only graphics mode for the **Scorpion ZS 256 Turbo**. The bitmap pattern is fixed (0x0F per byte), and only the color attributes are variable. This provides 160 color columns × 200 rows, where each "pixel" is an 8×1 attribute cell colored by a standard ZX Spectrum attribute byte.

```
Offset  Size    Content
0       4       Header: "GMX" + 0x0F (bytes: 47 4D 58 0F)
4       124     Padding (unused, zeros)
128     16000   Attribute data (linear, row-major: y * 80 + col, 1 byte per cell)
```

- File extension: `.c`
- Total size: 16128 bytes
- Identified by the `"GMX\x0F"` signature at offset 0
- Fixed bitmap pattern: every byte is `0x0F` (alternating 4 ink + 4 paper pixels per byte)
- 80 attribute columns × 200 rows = 16000 attributes
- Each attribute byte uses standard ZX format: `FBPPPIII`
- Display uses half-width pixels (PAR 2:1), same as GMX 640×200

#### Attribute Addressing

```
Attribute offset = 128 + y * 80 + (x / 8)
```

Since the bitmap is fixed, drawing in this format means changing attribute colors rather than setting individual pixels.

---

## 6. Fonts

### ROM Font

The ZX Spectrum ROM contains a built-in fixed-width **monochrome** font: **96 characters** (codes 0x20-0x7F), each **8 x 8 pixels**, stored as **8 bytes per character** (one byte per row, 1 bit per pixel, MSB = leftmost pixel). Total size: **768 bytes**. The font data contains no color information -- colors are determined by the attribute byte of the character cell where the glyph is printed.

The font occupies ROM addresses 15616-16383 (0x3D00-0x3FFF). The system variable `CHARS` at address 23606/7 (0x5C36/7) points **256 bytes below** the first character, so the address of any character glyph is:

```
glyph_address = PEEK(23606) + 256 * PEEK(23607) + 8 * char_code
```

The character set is based on ASCII but with three substitutions:

| Code | ASCII | Spectrum |
|------|-------|----------|
| 0x5E | `^`   | `↑`      |
| 0x60 | `` ` ``   | `£`      |
| 0x7F | DEL   | `©`      |

### Custom Fonts

Any 768-byte block in RAM can serve as a replacement font. Loading a custom font is done by copying the data into RAM and re-pointing the `CHARS` system variable. The common file format for custom fonts is `.ch8` -- a raw 768-byte dump of 96 characters.

### UDG (User Defined Graphics)

UDG characters use the same 8 x 8 format as the ROM font but are stored in RAM and freely redefinable via `POKE`.

| Model | Characters | Codes       | Default RAM address         |
|-------|------------|-------------|-----------------------------|
| 48K   | 21 (A-U)   | 0x90 - 0xA4 | 65368 - 65535 (0xFF58-0xFFFF) |
| 128K  | 19 (A-S)   | 0x90 - 0xA2 | (same, but 0xA3-0xA4 became SPECTRUM and PLAY tokens) |

The system variable `UDG` at address 23675/6 (0x5C7B/C) points to the UDG area. UDGs are initialized as copies of ROM characters A-U. A UDG character's address can be found in BASIC with `USR "A"` (for the first one).

### Non-Standard Fonts in Assembly

Games, demos, and applications written in assembly often bypass the ROM printing routines entirely and use custom font layouts optimized for their specific needs. There is no single standard for these -- each implementation defines its own character set, order, and storage format.

#### Extended Fonts (more than 96 characters)

Fonts containing up to **224 characters** (codes 32-255), stored as **1792 bytes**. The printing routine can treat codes 0-31 as control codes similar to BASIC (ink, paper, cursor positioning, etc.), while codes 32-255 map to glyphs. This allows a single font to cover multiple alphabets or include pseudographics.

#### Stripped Fonts (fewer than 96 characters)

For extreme memory optimization, many games included only the characters they actually needed -- for example, A-Z, 0-9, and a few punctuation marks. There is no defined standard for which characters are included or in what order. Some implementations went as far as having only digits and the handful of letters required to print messages like "GAME OVER" or "START GAME".

#### Multi-Charset Fonts

Some fonts packed multiple character sets into 96 positions. A common approach was to put uppercase Latin in the uppercase ASCII range and uppercase Cyrillic in place of lowercase Latin, allowing both alphabets to be used simultaneously within a single 96-character font.

#### Shared Glyphs (Latin/Cyrillic)

A related technique exploited the visual similarity between certain Latin and Cyrillic letters (A=А, K=К, O=О, M=М, etc.). By carefully choosing which glyphs to include, a single compact font could print text in both alphabets, with the printing code mapping characters to shared glyph positions.

#### Exploded Fonts (2048 bytes / 256 characters)

Full 256-character fonts (codes 0-255) use **2048 bytes** and are stored in an **exploded** (interleaved) layout rather than the linear layout of the ROM font:

```
Linear (ROM):      byte 0 of char 0, byte 1 of char 0, ... byte 7 of char 0,
                   byte 0 of char 1, byte 1 of char 1, ...

Exploded:          byte 0 of char 0, byte 0 of char 1, ... byte 0 of char 255,
                   byte 1 of char 0, byte 1 of char 1, ... byte 1 of char 255,
                   ...
                   byte 7 of char 0, byte 7 of char 1, ... byte 7 of char 255
```

This layout is specifically optimized for fast assembly printing. The font is placed at a **page-aligned address** (e.g., `0x8200`). To find the starting address of any character, the code simply places the character code as the **low byte** of the address, with the font base as the high byte. Each subsequent row of the glyph is reached by incrementing the **high byte** (adding 256), avoiding any multiplication:

```asm
; Print character in A at aligned font base 0x8200
; Entry: A = character code
  ld h, 0x82        ; font base high byte
  ld l, a           ; character code = low byte = offset to first row
  ; HL now points to byte 0 of the character
  ; byte 1 is at HL + 256 (inc h), byte 2 at HL + 512, etc.
```

#### Half-Width Fonts (4 px wide)

Font glyphs can be **4 pixels wide**, allowing two characters to be printed side by side within a single 8 x 8 cell. Glyphs occupy either the left nibble (bits 7-4) or the right nibble (bits 3-0) of each byte. The printing routine must either mask and OR the glyph into the existing screen data, or clear the target half-cell in advance.

```
Standard glyph "A" (4px, left-aligned):     Right-aligned:
  01100000  (0x60)                            00000110  (0x06)
  10010000  (0x90)                            00001001  (0x09)
  10010000  (0x90)                            00001001  (0x09)
  11110000  (0xF0)                            00001111  (0x0F)
  10010000  (0x90)                            00001001  (0x09)
  10010000  (0x90)                            00001001  (0x09)
  00000000  (0x00)                            00000000  (0x00)
  00000000  (0x00)                            00000000  (0x00)
```

As an optimization, some fonts stored each glyph **doubled** -- the same character in both the left and right nibble of each byte (e.g., `0x66` for both halves). This way a single 8-byte glyph definition could be used for either position by simply masking one half, or printed as-is to display the same letter twice (e.g., "AA").

Some fonts took this further by storing **different** characters in the left and right halves -- for example, a Latin letter in bits 7-4 and its Cyrillic equivalent in bits 3-0 (e.g., Latin "A" left, Cyrillic "А" right), or uppercase and lowercase variants of the same letter. This halved the memory required at the cost of a slightly more complex printing routine.

Another storage optimization packed two glyph rows per byte: bits 7-4 hold one pixel row, bits 3-0 hold the next. This reduces each 4 x 8 glyph to just **4 bytes**:

```
Byte 0:  0110 1001  (0x69)  ← row 0 in bits 7-4, row 1 in bits 3-0
Byte 1:  1001 1111  (0x9F)  ← row 2 in bits 7-4, row 3 in bits 3-0
Byte 2:  1001 1001  (0x99)  ← row 4 in bits 7-4, row 5 in bits 3-0
Byte 3:  0000 0000  (0x00)  ← row 6 in bits 7-4, row 7 in bits 3-0
```

#### 42-Column Fonts (6 px wide)

Font glyphs can be **6 pixels wide**, giving **42 characters per line** (252 pixels, with 4 pixels unused). Each glyph is stored in 8 bytes, with the 6-pixel pattern shifted either left or right within the byte.

For maximum printing speed, the font can be **expanded** into multiple pre-shifted copies, using two bytes per original byte, so the printing routine can avoid bit-shifting at runtime.

Four 6-pixel-wide letters pack tightly into three 8-pixel-wide cells:

```
Cell:        [  cell 0  ] [  cell 1  ] [  cell 2  ]
Bits:        7 6 5 4 3 2   1 0 7 6 5 4   3 2 1 0 7 6   5 4 3 2 1 0
Letter:      |  char A  | | char B      | | char C      | | char D  |
             6 px         6 px            6 px            6 px
```

Bit assignment per cell:

| Letter | Byte 1 bits | Byte 2 bits | Byte 3 bits |
|--------|-------------|-------------|-------------|
| 1st    | 7-2         |             |             |
| 2nd    | 1-0         | 7-4         |             |
| 3rd    |             | 3-0         | 7-6         |
| 4th    |             |             | 5-0         |

#### Variable-Width Fonts (9 bytes per character)

A simple approach to proportional text without a complex driver. Each character uses **9 bytes**: the first byte stores the **glyph width in pixels**, followed by the standard 8 bytes of bitmap data. The glyph is left-aligned (starting from bit 7), and the width byte tells the printing routine how many bits are actually used.

```
Example: letter "A" (width 5)     letter "I" (width 4)     letter "i" (width 2)
  Byte 0:  05 (width)               04 (width)               02 (width)
  Byte 1:  01100000                  11110000                  10000000
  Byte 2:  10010000                  01100000                  00000000
  Byte 3:  10010000                  01100000                  10000000
  Byte 4:  11110000                  01100000                  10000000
  Byte 5:  10010000                  01100000                  10000000
  Byte 6:  10010000                  01100000                  10000000
  Byte 7:  00000000                  11110000                  00000000
  Byte 8:  00000000                  00000000                  00000000
           |---|                     |--|                      ||
           5 px                      4 px                      2 px
```

The printing routine uses the width byte as a loop count for how many bits to copy from each row, and advances the cursor by that many pixels. This requires bit-level screen addressing and masking, making it slower than fixed-width printing but more compact on screen.

A more advanced technique keeps the font at **8 bytes per character** by embedding the width into the first byte of the glyph data itself. When printing, byte 0 is read as the width value but skipped when rendering the bitmap -- only bytes 1-7 are drawn to the screen. The "lost" top row effectively becomes a 1-pixel blank line between text rows, which is usually needed anyway for readability.

An even more compact technique uses all 8 bytes for the glyph bitmap with no lost rows. The width is encoded into **bits 1-0 of the first byte** (2 bits). Since no visible character is narrower than 3 pixels, the 2-bit value (0-3) is read with **+3 added**, giving a real width range of **3 to 6 pixels**. When rendering the first row, bits 1-0 are masked out so the width data does not appear on screen. Since glyphs are left-aligned and at most 6 pixels wide, bits 1-0 are always unused in the glyph data, making the first byte a natural place to store the width at no cost.

#### Double-Height Fonts (8 x 16)

Fonts taller than 8 pixels require custom printing routines since the ROM `PRINT` only handles 8 x 8 glyphs. Several storage layouts were used:

**1. Consecutive 16-byte glyphs**: Each character is stored as 16 bytes (top 8 + bottom 8) in a single block. The printing routine writes the top 8 bytes to one character row on screen and the bottom 8 bytes to the row below.

**2. Split across uppercase/lowercase**: The top half of each letter is stored in the uppercase character positions (e.g., codes 0x41-0x5A for A-Z), and the bottom half in the corresponding lowercase positions (e.g., codes 0x61-0x7A). The same text string is printed twice -- once on the first screen row (which renders the top halves), and again on the row below (which renders the bottom halves). This can even work with the ROM `PRINT` routine.

**3. Two separate fonts with CHARS switching**: The font occupies double the memory as two independent 768-byte fonts -- one containing the top halves, the other the bottom halves. The text is printed on the first screen row using the top-half font, then `CHARS` is re-pointed to the bottom-half font and the same text is printed again on the next row. This approach reuses the standard ROM printing routine without any custom rendering code.

**4. Runtime line doubling from ROM font**: Instead of storing a double-height font, the 8 x 8 ROM glyphs are stretched at runtime by duplicating each pixel row. A common trick exploited the **printer buffer** (addresses 23296-23551): output was redirected to the printer channel ("P"), causing `RST 16` to render each glyph's 8-byte bitmap into the printer buffer in simple linear format. The code then read back those bytes and wrote each row twice to screen memory, producing 8 x 16 characters. This avoided dealing with the Spectrum's interleaved screen layout during the glyph rendering step -- the ROM did the hard work, and the printer buffer provided clean linear access to the result.

### FZX (Proportional Fonts)

FZX is an open standard for proportional bitmap fonts on the ZX Spectrum, designed by Andrew Owen with a reference driver by Einar Saukas (2013). Unlike the fixed 8 x 8 ROM font, FZX supports variable character widths (1-16 pixels), configurable font height (1-255 pixels), per-character kerning and vertical shift, and global tracking. A font can contain up to 224 characters (codes 32-255). FZX requires a dedicated rendering driver and is not compatible with ROM printing routines.

#### File Structure

An FZX file consists of three sections: header, character table, and bitmap data.

```
Offset  Size    Content
------  ------  -------
0       1       Height (line spacing in pixels, 1-255)
1       1       Tracking (signed byte, extra pixels between characters)
2       1       Last char code (32-255; first char is always 32 = space)
3       varies  Character table: (lastchar - 31) entries x 3 bytes
varies  varies  Bitmap data
```

The character table has `(lastchar - 32 + 2)` entries -- one per character plus a sentinel entry at the end. Each entry is 3 bytes:

```
Byte 0-1:  16-bit word (little-endian)
           Bits 15-14: kern (0-3 pixels overlap with previous character)
           Bits 13-0:  offset to bitmap data, relative to this entry's position

Byte 2:    Info byte
           Bits 7-4:   shift (vertical offset from top, 0-15 pixels)
           Bits 3-0:   width - 1 (so actual width = value + 1, range 1-16)
```

#### Offset Calculation

The 14-bit offset in each entry is **relative to the entry's own position** in the file (not the file start). To get the absolute file position of a glyph's bitmap data:

```
absolute_address = entry_file_offset + (word & 0x3FFF)
```

This position-relative encoding makes the format independent of where the font is loaded in memory. The Z80 driver simply adds the offset to the entry's address in RAM.

#### Bitmap Data Size

Each glyph's bitmap contains `(height - shift)` rows. Rows above the shift line are implicitly blank (the shift value tells the renderer how far down from the top to start drawing). Each row is 1 byte wide for glyphs up to 8 pixels, or 2 bytes for glyphs 9-16 pixels wide. MSB = leftmost pixel.

```
bytes_per_row = (width > 8) ? 2 : 1
bitmap_size   = (height - shift) * bytes_per_row
```

However, optimized FZX files may **truncate trailing zero rows** from each glyph to save space. The actual stored size for glyph *i* is determined by the difference between consecutive offsets:

```
stored_size = absolute_offset[i+1] - absolute_offset[i]
```

The sentinel entry (after the last character) provides the end boundary for the last glyph. Any rows beyond the stored data are implicitly zero. Offsets are always monotonically non-decreasing.

#### Rendering Loop

The official FZX driver renders a glyph by reading bytes from the bitmap offset and incrementing the pointer until it reaches the next character's bitmap address. It determines the endpoint using only the **low byte** of the next entry's absolute offset (sufficient because glyphs are at most 32 bytes):

```asm
; Compute end marker from next char table entry
inc     hl              ; HL -> next entry's offset LSB
ld      a, (hl)         ; A = LSB of next entry's offset word
add     a, l            ; A = entry_addr_LSB + offset_LSB
ld      e, a            ; E = LSB of next char's bitmap address

; Main loop: render rows until bitmap pointer LSB matches E
MAIN_LOOP:
    ld      d, (hl)     ; read bitmap byte(s)
    inc     hl
    ; ... render row to screen ...
CHK_LOOP:
    ld      a, l
    cp      e           ; reached next char's data?
    jr      nz, MAIN_LOOP
```

#### Per-Character Properties

| Property | Range | Description |
|----------|-------|-------------|
| Width    | 1-16  | Pixel width of the glyph bitmap |
| Shift    | 0-15  | Vertical offset: number of blank pixel rows above the glyph |
| Kern     | 0-3   | Overlap with the previous character (pixels to move left before printing) |

Shift is commonly used for lowercase letters: in an 8-pixel-high font, lowercase letters with no ascenders (a, c, e, etc.) typically use shift=2, so their 6 rows of pixel data start 2 pixels below the top.

#### Space Character

The space character (code 32, index 0) is a special case. Its width defines the horizontal advance, but it has no visible bitmap. In optimized files, space's bitmap offset typically equals the next character's offset (zero stored bytes).

#### Example: Decoding a Glyph

Given a font with height=8 and this table entry for "A" (index 33):

```
Entry at file offset 0x0066:  D4 01 04

Word = 0x01D4, kern = (0x01D4 >> 14) & 3 = 0
Offset = 0x01D4 & 0x3FFF = 0x01D4 = 468
Absolute = 0x0066 + 468 = 0x023A

Info byte = 0x04: shift = 0, width = (4 & 0xF) + 1 = 5
```

Reading 8 bytes from 0x023A (next entry's offset is 8 bytes later):

```
Row 0: 20 = 00100000 → ..#..
Row 1: 50 = 01010000 → .#.#.
Row 2: 88 = 10001000 → #...#
Row 3: 88 = 10001000 → #...#
Row 4: F8 = 11111000 → #####
Row 5: 88 = 10001000 → #...#
Row 6: 88 = 10001000 → #...#
Row 7: 00 (implicit) → .....     ← trailing zero row omitted in file
```

#### Optimization

The FZX optimizer tool rearranges glyph data to minimize file size by:

1. **Truncating trailing zero rows** -- glyphs ending in blank rows store fewer bytes
2. **Sharing overlapping data** -- when one glyph's trailing bytes match another's leading bytes, they can share memory

Despite data sharing, offsets remain monotonically non-decreasing in the character table (required by the driver's single-byte endpoint comparison).

### Runtime Font Generation

A common technique in tape and disk loaders was to generate a new font algorithmically from the ROM font at startup, avoiding the need to store a custom font on tape. The generated font was written to RAM and the `CHARS` variable re-pointed to it. All techniques below operate on each 8-byte glyph row by row.

#### Bold

Shift each row by 1 pixel and OR with the original, widening all strokes:

```
original:   01111100     bold:       01111110
            01000010                 01100011
            01000010                 01100011
```

```asm
  ld a, (hl)       ; load glyph row
  ld b, a
  srl b            ; shift right by 1
  or b             ; OR with original
```

#### Shadow

Print the glyph shifted +1 pixel right and +1 pixel down in a dark ink color first, then overprint the original glyph on top in the foreground color. The offset copy creates a drop shadow effect.

#### Outline

Compute shifted copies in all four directions (left, right, up, down), OR them together, then XOR out the original glyph -- leaving only the border pixels:

```
original:   00111000     outline:    01000100
            01000100                 10111010
            01000100                 10000010
            01111100                 10000010
            01000100                 10111010
            01000100                 10000010
            00000000                 01111110
```

#### Italic / Slant

Progressively shift the top rows in one direction and the bottom rows in the other. For example, shift rows 0-1 right by 2, rows 2-3 right by 1, rows 4-5 unchanged, rows 6-7 left by 1.

#### Narrow / Condensed

Generate a thinner font by skipping one vertical column of pixels from each ROM glyph. For each row, the bits above and below the removed column are spliced together, producing a narrower character that is still printed in the standard 8 x 8 cell. Simple implementations removed the same bit position for all glyphs. More sophisticated ones defined an exclusion table for certain characters where dropping that particular column would damage the shape -- for those glyphs, a different column was removed instead.

---

## 7. Nirvana Engine Tile Format

The Nirvana engine is an established tile system for the ZX Spectrum. It defines two standard tile sizes with a specific data layout: **all bitmap bytes first, then all attribute bytes**.

Bitmaps use **1 bit per pixel**, packed 8 pixels per byte, **MSB-first** (bit 7 = leftmost pixel). Attributes use the standard ZX Spectrum attribute byte format.

### btile (2 x 2 cells = 16 x 16 pixels)

```
Bitmap:  32 bytes (2 cells wide x 2 cells tall x 8 lines)
Attrs:   16 bytes (2 x 2 cells x 4 attr rows per cell, 8x2 multicolour)
Total:   48 bytes
```

File extension: `.btile`

### wtile (3 x 2 cells = 24 x 16 pixels)

```
Bitmap:  48 bytes (3 cells wide x 2 cells tall x 8 lines)
Attrs:   24 bytes (3 x 2 cells x 4 attr rows per cell, 8x2 multicolour)
Total:   72 bytes
```

File extension: `.wtile`

Data order: bitmap is stored row-major (left-to-right, top-to-bottom). Attributes in btile are stored column-major (all attr rows of column 0, then column 1); attributes in wtile are stored row-major.

---

## 8. Custom Sprite Data Layouts

There is no universal sprite format on the ZX Spectrum — every game and engine defines its own. The layout is chosen to match the drawing routine for maximum speed. These layouts are unrelated to the Nirvana tile format described above.

### Row-First (Linear)

The most straightforward layout. Bytes are stored left-to-right across each pixel row, then the next row, and so on. For a 2-cell-wide (16 px) sprite:

```
Row 0: byte0, byte1
Row 1: byte0, byte1
...
Row 15: byte0, byte1
```

Simple to understand but requires address calculation when crossing character row boundaries on screen.

### Column-First

Data is stored one full column at a time (all 8 or 16 rows of a column before moving to the next). Optimized for vertical scrolling games, where column data is contiguous in memory. The scroll amount determines how many bytes need to be copied per column:

```
Col 0: row0, row1, row2, ... row15
Col 1: row0, row1, row2, ... row15
```

### Zig-Zag Column

A variant used in games like Ghosts 'n Goblins. Data is stored column-by-column, but alternating direction — first column top-to-bottom, next column bottom-to-top. This matches the screen traversal pattern where `INC L` moves right and `INC H` moves one pixel row down, allowing the drawing routine to snake through screen memory without resetting the address between columns:

```
Col 0: row0, row1, ... row15   (top to bottom)
Col 1: row15, row14, ... row0  (bottom to top)
Col 2: row0, row1, ... row15   (top to bottom)
...
```

### Pre-Shifted

Multiple copies of the same sprite, each shifted by 1 or 2 pixels, stored as separate data blocks. Eliminates runtime bit-shifting at the cost of 4x (2px steps) or 8x (1px steps) memory per sprite. A 16-pixel-wide sprite with 8 pre-shifted copies occupies 8 times the memory, but the drawing routine becomes a straight copy with no bit manipulation.

### Interleaved Mask + Sprite

When using masked drawing (AND mask, then OR sprite), storing mask and sprite bytes alternated per row keeps both in sequential memory, avoiding separate pointer tracking:

```
Row 0: mask0, sprite0, mask1, sprite1
Row 1: mask0, sprite0, mask1, sprite1
...
```

Alternatively, the mask can be stored as a completely separate block after all sprite data.

### Bit-Interleaved Zoom (2x)

A compact way to store sprites at half resolution and zoom them 2x at runtime. Each sprite byte has its bits interleaved across two screen bytes, doubling the horizontal size. Each pixel row is also written twice, doubling vertically:

```
Sprite byte:   76543210

Screen byte 1: 77553311   (odd bits, each doubled)
Screen byte 2: 66442200   (even bits, each doubled)
```

An 8 x 8 sprite stored in just 8 bytes produces a 16 x 16 image on screen. The bit separation can be done with a 16-byte lookup table (mapping each 4-bit nibble of extracted odd or even bits to its doubled 8-bit form), or computed directly with shifts and masks.

### Attribute Mixing

Sprite data can include attribute bytes (ink/paper/bright) arranged in different ways relative to the bitmap:

**All bitmap, then all attributes**: Bitmap data for the entire sprite is stored first, followed by all attribute bytes as a separate block. Simple layout, but the drawing routine needs two passes or two separate pointers.

**Attributes interleaved per cell column**: After each 8-byte vertical strip (one cell column of bitmap), its attribute byte follows immediately. The drawing routine handles bitmap and color in a single pass without jumping between data blocks:

```
col0: 8 bitmap bytes, 1 attr byte
col1: 8 bitmap bytes, 1 attr byte
...
```

**Attributes interleaved per cell row**: After a full horizontal row of bitmap cells, the attribute bytes for that row follow:

```
row 0: bitmap[col0], bitmap[col1], ..., attr[col0], attr[col1], ...
row 1: bitmap[col0], bitmap[col1], ..., attr[col0], attr[col1], ...
```

**No attributes (monochrome sprites)**: Sprite data is bitmap-only. The drawing routine deliberately does not touch the attribute area, avoiding attribute clash. The sprite takes whatever colors are already set in the cells it overlaps.

**Global attribute**: Sprite data is bitmap-only, but the drawing routine applies a single attribute value to all cells the sprite covers. Compact (no per-cell attribute storage), but the entire sprite is one color pair.

---

## 9. Bit Ordering

All ZX Spectrum bitmap data uses **MSB-first** (most significant bit first) ordering:

```
Bit:      7   6   5   4   3   2   1   0
Pixel:    0   1   2   3   4   5   6   7
          ←── leftmost          rightmost ──→
```

A set bit (1) represents **ink** color; a cleared bit (0) represents **paper** color.

This applies to:
- Screen bitmap data (SCR, IFL, MLT, etc.)
- Sprite bitmap data
- Monochrome format data
- Individual RGB3 plane data
- Dither pattern definitions
- SCA fill patterns

---

## 10. Format Detection by File Size

Quick-reference table for identifying formats by file size when no file extension is available:

| Size (bytes) | Format       | Description                        |
|--------------|--------------|------------------------------------|
| 768          | 53c / ATR    | Attribute-only                     |
| 1628         | HLR          | Gigascreen lowres (Z80 loader)    |
| 2048         | Mono 1/3     | Monochrome, 1 third               |
| 3072         | STL          | Stellar 64 x 48 gigascreen        |
| 4096         | Mono 2/3     | Monochrome, 2 thirds              |
| 6144         | Mono / RAD   | Monochrome full screen / Next LoRes Radastan 128×96 (ambiguous) |
| 6160         | RAD          | LoRes Radastan + 16-byte GRB332 palette (ZX-Uno) |
| 6912         | SCR          | Standard screen                    |
| 6976         | ULA+         | SCR + 64-byte palette              |
| 6945–7426    | ULANext      | SCR + ink mask + palette (variable) |
| 9216         | IFL          | 8 x 2 multicolor                  |
| 11136        | BSC          | Border screen (384 x 304)         |
| 11904        | BMC4         | 8 x 4 multicolor + border         |
| 12288        | MLT / SLR    | 8 x 1 multicolor / Next LoRes 128×96 (ambiguous) |
| 12352        | MLT+ULA+     | 8 x 1 multicolor + 64-byte palette |
| 13824        | Gigascreen   | Dual-frame 50 Hz                   |
| 16128        | GMX160       | Scorpion 160×200 attribute-only ("GMX\x0F" header) |
| 14080        | MGH (mg8)    | Multiartist gigascreen 8 x 8       |
| 15616        | MGH (mg4)    | Multiartist gigascreen 8 x 4       |
| 18432        | RGB3         | Tricolor (3 x 6144)               |
| 18688        | MGH (mg2)    | Multiartist gigascreen 8 x 2       |
| 19456        | MGH (mg1)    | Multiartist gigascreen 8 x 1       |
| 32768        | GMX          | Scorpion 640×200 hi-res            |
| 49152        | SL2          | Next Layer 2 256×192 raw pixels    |
| 49280        | SL2          | Next Layer 2 256×192 + 128b header |
| 49664        | NXI / SL2    | Next Layer 2 256×192 + palette     |
| 81920        | SL2          | Next Layer 2 extended (ambiguous)  |
| 81952        | NXI / SL2    | Next Layer 2 640×256 + palette     |
| 82432        | NXI / SL2    | Next Layer 2 320×256 + palette     |

**Note**: ULANext files overlap in size range with ULA+ (6976 bytes). ULA+ is detected first by exact size match; ULANext is then checked for the broader range (6945–7426) with mask byte validation. SCA, SPECSCII, ZXP, and chr$ files are variable-size, text-based, or extension-only and cannot be reliably detected by size alone. SCA files are identified by the `"SCA"` signature at offset 0. chr$ files are identified by the `chr$` signature (bytes `63 68 72 24`) at offset 0. ZXP files are text-based and identified by the `"ZX-Paintbrush extended image"` header line. MGH files are identified by the `"MGH"` signature at offset 0. NXI sizes (49664, 82432, 81952) are unique and don't collide with classic formats. SL2 256×192 sizes (49152, 49280) are also unique. SL2 extended size (81920) is ambiguous between 320×256 8bpp and 640×256 4bpp modes. SLR (Next LoRes) at 12288 bytes collides with MLT — the `.slr` extension is required to distinguish them. RAD (Radastan) at 6144 bytes collides with monochrome full-screen — the `.rad` extension or `.slr` extension with 6144-byte size is required to distinguish them.

### Detection Priority

1. Check file extension first (`.53c`, `.atr`, `.bsc`, `.ifl`, `.bmc4`, `.mlt`, `.mc`, `.3`, `.img`, `.mg1`, `.mg2`, `.mg4`, `.mg8`, `.hlr`, `.stl`, `.nxi`, `.sl2`, `.slr`, `.rad`, `.ch$`, `.chr$`, `.ch-`, `.specscii`, `.sca`, `.zxp`, `.c`)
2. For `.zxp` files, read as text and parse (see ZXP section)
3. For `.img` files, verify size is exactly 13824 bytes
4. For `.mg1`/`.mg2`/`.mg4`/`.mg8` files, verify `"MGH"` signature at offset 0
5. For `.hlr` files, verify size is exactly 1628 bytes
6. For `.stl` files, verify size is exactly 3072 bytes
7. For `.nxi` files, verify size is 49664 (256×192), 82432 (320×256), or 81952 (640×256) bytes
8. For `.sl2` files, verify size is 49152, 49280, or 81920 bytes
9. For `.slr` files: if size is 6144 bytes → Radastan (4bpp); if 12288 bytes → standard LoRes (8bpp)
10. For `.rad` files, detect as Radastan LoRes (extension-only; 6144 bytes expected)
11. For `.c` files: if size is 16128 bytes and header is "GMX\x0F" → GMX 160×200; if size is 32768 bytes → GMX 640×200
12. For `.ch$`/`.chr$`/`.ch-` files, verify `chr$` signature at offset 0
13. Fall back to file size lookup from the table above

---

## 11. References

- [World of Spectrum](https://worldofspectrum.org/) -- Archive of ZX Spectrum software and documentation
- [ZX Spectrum Screen Memory](http://www.breakintoprogram.co.uk/hardware/computers/zx-spectrum/screen-memory-layout) -- Screen layout technical reference
- [ULA+ Specification](https://sinclair.wiki.zxnet.co.uk/wiki/ULAplus) -- Extended palette hardware specification
- [ULANext (SpecNext Wiki)](https://wiki.specnext.dev/ULANext) -- ZX Spectrum Next ULANext mode reference
- [Nirvana Engine](https://github.com/einar-saukas/NIRVANA-ENGINE) -- Multicolor rendering engine for ZX Spectrum
- [SCA Format](https://github.com/moroz1999/sca) -- SCA animation format specification
- [ZX Spectrum Character Set](https://en.wikipedia.org/wiki/ZX_Spectrum_character_set) -- Character set overview (Wikipedia)
- [ZX Spectrum ROM Character Set](https://sinclair.wiki.zxnet.co.uk/wiki/Character_set) -- Font and block graphics reference
- [FZX Format](https://sinclair.wiki.zxnet.co.uk/wiki/FZX_format) -- Proportional font format specification
- [ZX Spectrum Bitmap Fonts](https://github.com/ZXSpectrumVault/zx-fonts) -- Collection of fonts extracted from games
- [Multiartist](https://multiartist.untergrund.net/) -- Multicolor gigascreen editor for ZX Spectrum
- [SpecNext Wiki — Layer 2](https://wiki.specnext.dev/Layer_2) -- ZX Spectrum Next Layer 2 hardware reference
- [SpecNext Wiki — LoRes](https://wiki.specnext.dev/LoRes) -- ZX Spectrum Next LoRes mode hardware reference
- [SpecNext Wiki — File Formats](https://wiki.specnext.dev/File_Formats) -- ZX Spectrum Next file format reference
- [SpecNext Wiki — Palettes](https://wiki.specnext.dev/Palettes) -- ZX Spectrum Next palette registers and formats
- [zxnext_bmp_tools](https://github.com/stefanbylund/zxnext_bmp_tools) -- BMP to NXI/SL2 conversion tools
