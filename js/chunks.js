// SpectraLab - Chunk-based lossy compression for ZX Spectrum screens
// Divides 8×8 character cells into sub-chunks with static 4-pattern dictionary.
// Two modes: 4×4 (768B bitmap, fastest) and 4×2 (1536B bitmap, better quality).
// Z80 depacker uses nibble-pair lookup tables for fast reconstruction.
// @ts-check
"use strict";

window.CHUNKS = (function() {

    const MODE_4x4 = 0;  // 4×4 pixel chunks, 4 per cell, 1 byte/cell
    const MODE_4x2 = 1;  // 4×2 pixel chunks, 8 per cell, 2 bytes/cell

    const CODEBOOK_SIZE = 4;  // always 4 patterns (2 bits per index)

    // =========================================================================
    // ZX Spectrum screen address calculation
    // =========================================================================

    // Get byte offset in SCR bitmap for character row cr, pixel line within cell
    function scrAddress(cr, line) {
        const third = (cr >> 3);         // which third (0-2)
        const cellRow = cr & 7;          // row within third (0-7)
        return third * 2048 + line * 256 + cellRow * 32;
    }

    // =========================================================================
    // Chunk extraction
    // =========================================================================

    // Extract 4×4 chunk as a 16-bit pattern (4 nibbles, MSB = top row)
    // startRow: 0 or 4 (vertical half), startCol: 0 or 4 (horizontal half)
    function extract4x4(bitmap, cr, cc, startRow, startCol) {
        let pattern = 0;
        for (let r = 0; r < 4; r++) {
            const addr = scrAddress(cr, startRow + r) + cc;
            const byte = bitmap[addr];
            const nibble = startCol === 0 ? (byte >> 4) & 0x0F : byte & 0x0F;
            pattern = (pattern << 4) | nibble;
        }
        return pattern;
    }

    // Extract 4×2 chunk as an 8-bit pattern (2 nibbles, MSB = top row)
    // startRow: 0,2,4,6 (row-pair), startCol: 0 or 4 (horizontal half)
    function extract4x2(bitmap, cr, cc, startRow, startCol) {
        let pattern = 0;
        for (let r = 0; r < 2; r++) {
            const addr = scrAddress(cr, startRow + r) + cc;
            const byte = bitmap[addr];
            const nibble = startCol === 0 ? (byte >> 4) & 0x0F : byte & 0x0F;
            pattern = (pattern << 4) | nibble;
        }
        return pattern;
    }

    // Extract all chunks from a single cell, returns array of pattern values
    function extractCellChunks(bitmap, cr, cc, mode) {
        if (mode === MODE_4x4) {
            // 4 chunks: TL, TR, BL, BR
            return [
                extract4x4(bitmap, cr, cc, 0, 0),
                extract4x4(bitmap, cr, cc, 0, 4),
                extract4x4(bitmap, cr, cc, 4, 0),
                extract4x4(bitmap, cr, cc, 4, 4)
            ];
        } else {
            // 8 chunks: 4 row-pairs × (left, right)
            const result = [];
            for (let rp = 0; rp < 4; rp++) {
                result.push(extract4x2(bitmap, cr, cc, rp * 2, 0));
                result.push(extract4x2(bitmap, cr, cc, rp * 2, 4));
            }
            return result;
        }
    }

    // =========================================================================
    // Write chunks back to SCR bitmap
    // =========================================================================

    function write4x4(scrData, cr, cc, startRow, startCol, pattern) {
        for (let r = 0; r < 4; r++) {
            const addr = scrAddress(cr, startRow + r) + cc;
            const nibble = (pattern >> (12 - r * 4)) & 0x0F;
            if (startCol === 0) {
                scrData[addr] = (scrData[addr] & 0x0F) | (nibble << 4);
            } else {
                scrData[addr] = (scrData[addr] & 0xF0) | nibble;
            }
        }
    }

    function write4x2(scrData, cr, cc, startRow, startCol, pattern) {
        for (let r = 0; r < 2; r++) {
            const addr = scrAddress(cr, startRow + r) + cc;
            const nibble = (pattern >> (4 - r * 4)) & 0x0F;
            if (startCol === 0) {
                scrData[addr] = (scrData[addr] & 0x0F) | (nibble << 4);
            } else {
                scrData[addr] = (scrData[addr] & 0xF0) | nibble;
            }
        }
    }

    // =========================================================================
    // Hamming distance and pattern matching
    // =========================================================================

    function popcount(v) {
        let count = 0;
        while (v) {
            count += v & 1;
            v >>>= 1;
        }
        return count;
    }

    function hammingDistance(a, b) {
        return popcount(a ^ b);
    }

    // ZX Spectrum color luminance (0..1).
    // color: 0-7, bright: 0 or 1
    function colorLuminance(color, bright) {
        var scale = bright ? 1.0 : 205 / 255;
        var r = (color & 2) ? scale : 0;
        var g = (color & 4) ? scale : 0;
        var b = (color & 1) ? scale : 0;
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Find nearest codebook entry by visual density, accounting for ink/paper colors.
    // inkLum/paperLum: luminance of ink and paper colors (0=black, 1=white).
    // totalBits: number of pixels in the chunk (16 for 4×4, 8 for 4×2).
    function nearestEntryColor(pattern, codebook, totalBits, inkLum, paperLum) {
        // Compute visual darkness normalized to cell's own color range.
        // All lighter-color pixels → 0 (empty), all darker-color pixels → 1 (solid).
        var pc = popcount(pattern);
        var avgLum = (pc * inkLum + (totalBits - pc) * paperLum) / totalBits;
        var darkLum = Math.min(inkLum, paperLum);
        var lightLum = Math.max(inkLum, paperLum);
        var range = lightLum - darkLum;
        var targetDensity = range > 0.001 ? (lightLum - avgLum) / range : 0.5;

        // Precomputed densities for codebook entries (output is always black-on-white)
        var bestIdx = 0;
        var bestDiff = Math.abs(targetDensity - popcount(codebook[0]) / totalBits);
        for (var i = 1; i < CODEBOOK_SIZE; i++) {
            var diff = Math.abs(targetDensity - popcount(codebook[i]) / totalBits);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    // Find nearest codebook entry by popcount (for monochrome / no-attr use).
    function nearestEntry(pattern, codebook) {
        var pc = popcount(pattern);
        var bestIdx = 0;
        var bestDiff = Math.abs(pc - popcount(codebook[0]));
        for (var i = 1; i < CODEBOOK_SIZE; i++) {
            var diff = Math.abs(pc - popcount(codebook[i]));
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    // =========================================================================
    // K-means codebook optimization
    // =========================================================================

    // Compute majority-vote centroid from weighted patterns
    function computeWeightedCentroid(patterns, weights, bitCount) {
        if (patterns.length === 0) return 0;
        let totalWeight = 0;
        for (let i = 0; i < weights.length; i++) totalWeight += weights[i];
        if (totalWeight === 0) return patterns[0];

        let centroid = 0;
        for (let bit = 0; bit < bitCount; bit++) {
            let onesWeight = 0;
            for (let i = 0; i < patterns.length; i++) {
                if (patterns[i] & (1 << bit)) onesWeight += weights[i];
            }
            if (onesWeight * 2 > totalWeight) {
                centroid |= (1 << bit);
            }
        }
        return centroid;
    }

    // Collect chunk patterns with frequencies from one or more bitmaps
    function collectPatterns(bitmaps, mode) {
        const freq = new Map();
        for (let b = 0; b < bitmaps.length; b++) {
            const bitmap = bitmaps[b];
            for (let cr = 0; cr < 24; cr++) {
                for (let cc = 0; cc < 32; cc++) {
                    const chunks = extractCellChunks(bitmap, cr, cc, mode);
                    for (let i = 0; i < chunks.length; i++) {
                        freq.set(chunks[i], (freq.get(chunks[i]) || 0) + 1);
                    }
                }
            }
        }
        return freq;
    }

    // Find optimal 4-pattern codebook using weighted k-means
    // bitmaps: array of Uint8Array (6144-byte bitmaps)
    function findCodebook(bitmaps, mode, maxIterations) {
        maxIterations = maxIterations || 30;
        const bitCount = mode === MODE_4x4 ? 16 : 8;

        const freq = collectPatterns(bitmaps, mode);

        // Sort by frequency descending
        const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
        const uniquePatterns = sorted.map(e => e[0]);
        const uniqueWeights = sorted.map(e => e[1]);

        // Initialize codebook with 4 most frequent patterns
        const codebook = [];
        for (let i = 0; i < CODEBOOK_SIZE; i++) {
            codebook.push(i < sorted.length ? uniquePatterns[i] : 0);
        }

        // If 4 or fewer unique patterns, no iteration needed
        if (sorted.length <= CODEBOOK_SIZE) return codebook;

        // K-means iterations
        for (let iter = 0; iter < maxIterations; iter++) {
            // Assign each unique pattern to nearest codebook entry
            const clusterPatterns = [[], [], [], []];
            const clusterWeights = [[], [], [], []];

            for (let i = 0; i < uniquePatterns.length; i++) {
                const idx = nearestEntry(uniquePatterns[i], codebook);
                clusterPatterns[idx].push(uniquePatterns[i]);
                clusterWeights[idx].push(uniqueWeights[i]);
            }

            // Recompute centroids
            let changed = false;
            for (let i = 0; i < CODEBOOK_SIZE; i++) {
                if (clusterPatterns[i].length === 0) continue;
                const newCentroid = computeWeightedCentroid(
                    clusterPatterns[i], clusterWeights[i], bitCount
                );
                if (newCentroid !== codebook[i]) {
                    codebook[i] = newCentroid;
                    changed = true;
                }
            }

            if (!changed) break;
        }

        return codebook;
    }

    // Find shared codebook from multiple frames (6144+ bytes each, only bitmap used)
    function findSharedCodebook(frames, mode) {
        const bitmaps = frames.map(f => f.subarray(0, 6144));
        return findCodebook(bitmaps, mode);
    }

    // =========================================================================
    // Lookup table generation (for Z80 depacker)
    // =========================================================================

    // Generate nibble-pair lookup table
    // 4×4: 16 entries × 4 bytes = 64 bytes (pair → 4 screen rows)
    // 4×2: 16 entries × 2 bytes = 32 bytes (pair → 2 screen rows)
    function generateLookupTable(codebook, mode) {
        if (mode === MODE_4x4) {
            const table = new Uint8Array(64);
            for (let left = 0; left < 4; left++) {
                for (let right = 0; right < 4; right++) {
                    const idx = (left * 4 + right) * 4;
                    const lp = codebook[left];   // 16-bit pattern
                    const rp = codebook[right];  // 16-bit pattern
                    for (let row = 0; row < 4; row++) {
                        const lnib = (lp >> (12 - row * 4)) & 0x0F;
                        const rnib = (rp >> (12 - row * 4)) & 0x0F;
                        table[idx + row] = (lnib << 4) | rnib;
                    }
                }
            }
            return table;
        } else {
            const table = new Uint8Array(32);
            for (let left = 0; left < 4; left++) {
                for (let right = 0; right < 4; right++) {
                    const idx = (left * 4 + right) * 2;
                    const lp = codebook[left];   // 8-bit pattern
                    const rp = codebook[right];  // 8-bit pattern
                    for (let row = 0; row < 2; row++) {
                        const lnib = (lp >> (4 - row * 4)) & 0x0F;
                        const rnib = (rp >> (4 - row * 4)) & 0x0F;
                        table[idx + row] = (lnib << 4) | rnib;
                    }
                }
            }
            return table;
        }
    }

    // =========================================================================
    // Compression
    // =========================================================================

    // Compress bitmap data using chunk compression (monochrome only, no attributes)
    // Input: at least 6144 bytes of bitmap; if ≥6912, attributes are used for
    // color-aware density matching (ink/paper luminance → correct monochrome mapping).
    // Optional fixedCodebook: use this codebook instead of default (for animations)
    // Optional region: { startCharRow, charRows } for partial screen (default: full 24 rows)
    //   When region is specified, scrData must contain only the bitmap for that region
    //   (consecutive 2048-byte thirds), and attrs (if present) follow at charRows*32*8 offset.
    // Returns: { data, mode, codebook, lookupTable, encoded,
    //            totalDistortion, avgDistortion, maxCellDistortion }
    function compress(scrData, mode, fixedCodebook, region) {
        if (mode === undefined) mode = MODE_4x4;

        const startCharRow = region ? region.startCharRow : 0;
        const charRows = region ? region.charRows : 24;
        const thirdCount = charRows / 8;
        const bitmapSize = thirdCount * 2048;
        const hasAttrs = scrData.length >= bitmapSize + charRows * 32;

        if (scrData.length < bitmapSize) {
            throw new Error('CHUNKS: input must be at least ' + bitmapSize + ' bytes for ' + charRows + ' char rows');
        }

        // Build a full 6144-byte bitmap with region data at the correct absolute position,
        // so scrAddress() works correctly for the character rows in this region.
        const fullBitmap = new Uint8Array(6144);
        const startThird = startCharRow / 8;
        for (let t = 0; t < thirdCount; t++) {
            fullBitmap.set(scrData.subarray(t * 2048, (t + 1) * 2048), (startThird + t) * 2048);
        }

        // Use provided codebook or default static dictionary
        const codebook = fixedCodebook
            ? fixedCodebook.slice()
            : getPreset('standard', mode);
        const lookupTable = generateLookupTable(codebook, mode);

        const totalBits = mode === MODE_4x4 ? 16 : 8;

        // Encode cells in the specified region
        const bytesPerCell = mode === MODE_4x4 ? 1 : 2;
        const encodedSize = 32 * charRows * bytesPerCell;
        const encoded = new Uint8Array(encodedSize);

        let totalDist = 0;
        let maxCellDist = 0;
        let pos = 0;

        for (let cr = startCharRow; cr < startCharRow + charRows; cr++) {
            for (let cc = 0; cc < 32; cc++) {
                const cellChunks = extractCellChunks(fullBitmap, cr, cc, mode);
                let cellDist = 0;

                // Get ink/paper luminance from attributes
                var inkLum = 0, paperLum = 0.804;  // default: black ink, white paper (bright=0)
                if (hasAttrs) {
                    var attrIndex = (cr - startCharRow) * 32 + cc;
                    var attr = scrData[bitmapSize + attrIndex];
                    var bright = (attr >> 6) & 1;
                    inkLum = colorLuminance(attr & 7, bright);
                    paperLum = colorLuminance((attr >> 3) & 7, bright);
                }

                if (mode === MODE_4x4) {
                    const idx0 = nearestEntryColor(cellChunks[0], codebook, totalBits, inkLum, paperLum);
                    const idx1 = nearestEntryColor(cellChunks[1], codebook, totalBits, inkLum, paperLum);
                    const idx2 = nearestEntryColor(cellChunks[2], codebook, totalBits, inkLum, paperLum);
                    const idx3 = nearestEntryColor(cellChunks[3], codebook, totalBits, inkLum, paperLum);
                    encoded[pos++] = (idx0 << 6) | (idx1 << 4) | (idx2 << 2) | idx3;

                    cellDist += hammingDistance(cellChunks[0], codebook[idx0]);
                    cellDist += hammingDistance(cellChunks[1], codebook[idx1]);
                    cellDist += hammingDistance(cellChunks[2], codebook[idx2]);
                    cellDist += hammingDistance(cellChunks[3], codebook[idx3]);
                } else {
                    // 8 chunks → 2 bytes
                    const indices = [];
                    for (let i = 0; i < 8; i++) {
                        indices.push(nearestEntryColor(cellChunks[i], codebook, totalBits, inkLum, paperLum));
                        cellDist += hammingDistance(cellChunks[i], codebook[indices[i]]);
                    }
                    encoded[pos++] = (indices[0] << 6) | (indices[1] << 4) | (indices[2] << 2) | indices[3];
                    encoded[pos++] = (indices[4] << 6) | (indices[5] << 4) | (indices[6] << 2) | indices[7];
                }

                totalDist += cellDist;
                if (cellDist > maxCellDist) maxCellDist = cellDist;
            }
        }

        // Build output binary (monochrome, no attributes):
        // [mode:1] [codebook:4or8] [lookupTable:32or64] [encoded:768or1536]
        const codebookSize = mode === MODE_4x4 ? 8 : 4;
        const totalSize = 1 + codebookSize + lookupTable.length + encodedSize;
        const output = new Uint8Array(totalSize);
        let outPos = 0;

        // Mode byte
        output[outPos++] = mode;

        // Codebook
        for (let i = 0; i < CODEBOOK_SIZE; i++) {
            if (mode === MODE_4x4) {
                output[outPos++] = (codebook[i] >> 8) & 0xFF;
                output[outPos++] = codebook[i] & 0xFF;
            } else {
                output[outPos++] = codebook[i] & 0xFF;
            }
        }

        // Lookup table
        output.set(lookupTable, outPos);
        outPos += lookupTable.length;

        // Encoded bitmap
        output.set(encoded, outPos);

        const chunksPerCell = mode === MODE_4x4 ? 4 : 8;
        const chunksTotal = 32 * charRows * chunksPerCell;
        return {
            data: output,
            mode: mode,
            codebook: codebook,
            lookupTable: lookupTable,
            encoded: encoded,
            totalDistortion: totalDist,
            avgDistortion: totalDist / chunksTotal,
            maxCellDistortion: maxCellDist
        };
    }

    // =========================================================================
    // Decompression
    // =========================================================================

    // Decompress chunk-compressed data, returning result and bytes consumed.
    // Returns {data: Uint8Array(6912), bytesRead: number}
    function decompressTracked(compressedData) {
        let pos = 0;
        const mode = compressedData[pos++];

        // Read codebook
        const codebook = [];
        if (mode === MODE_4x4) {
            for (let i = 0; i < CODEBOOK_SIZE; i++) {
                codebook.push((compressedData[pos] << 8) | compressedData[pos + 1]);
                pos += 2;
            }
        } else {
            for (let i = 0; i < CODEBOOK_SIZE; i++) {
                codebook.push(compressedData[pos++]);
            }
        }

        // Skip lookup table
        const lookupSize = mode === MODE_4x4 ? 64 : 32;
        pos += lookupSize;

        // Decode bitmap
        const scrData = new Uint8Array(6912);

        for (let cr = 0; cr < 24; cr++) {
            for (let cc = 0; cc < 32; cc++) {
                if (mode === MODE_4x4) {
                    const byte = compressedData[pos++];
                    write4x4(scrData, cr, cc, 0, 0, codebook[(byte >> 6) & 3]);
                    write4x4(scrData, cr, cc, 0, 4, codebook[(byte >> 4) & 3]);
                    write4x4(scrData, cr, cc, 4, 0, codebook[(byte >> 2) & 3]);
                    write4x4(scrData, cr, cc, 4, 4, codebook[byte & 3]);
                } else {
                    const byte0 = compressedData[pos++];
                    const byte1 = compressedData[pos++];
                    write4x2(scrData, cr, cc, 0, 0, codebook[(byte0 >> 6) & 3]);
                    write4x2(scrData, cr, cc, 0, 4, codebook[(byte0 >> 4) & 3]);
                    write4x2(scrData, cr, cc, 2, 0, codebook[(byte0 >> 2) & 3]);
                    write4x2(scrData, cr, cc, 2, 4, codebook[byte0 & 3]);
                    write4x2(scrData, cr, cc, 4, 0, codebook[(byte1 >> 6) & 3]);
                    write4x2(scrData, cr, cc, 4, 4, codebook[(byte1 >> 4) & 3]);
                    write4x2(scrData, cr, cc, 6, 0, codebook[(byte1 >> 2) & 3]);
                    write4x2(scrData, cr, cc, 6, 4, codebook[byte1 & 3]);
                }
            }
        }

        // Fill attributes with default: ink=0 (black), paper=7 (white)
        for (let i = 0; i < 768; i++) {
            scrData[6144 + i] = 0x38;
        }

        return { data: scrData, bytesRead: pos };
    }

    // Decompress raw encoded bytes (no mode/codebook/LUT prefix) using static preset codebook.
    // encodedData: Uint8Array of encoded bytes (size depends on mode and region)
    // mode: MODE_4x4 or MODE_4x2
    // region (optional): { startCharRow, charRows } for partial screen (default: full 24 rows)
    //   When region is specified, output contains only the bitmap for that region
    //   (consecutive 2048-byte thirds) plus attrs at the end.
    // Returns: { data: Uint8Array, bytesRead: number }
    function decompressRaw(encodedData, mode, region) {
        const codebook = getPreset('standard', mode);
        const startCharRow = region ? region.startCharRow : 0;
        const charRows = region ? region.charRows : 24;
        const thirdCount = charRows / 8;
        const bitmapSize = thirdCount * 2048;
        const attrSize = charRows * 32;

        // Build into full 6144-byte buffer so scrAddress() works correctly,
        // then extract the relevant portion
        const fullScr = new Uint8Array(6912);
        let pos = 0;

        for (let cr = startCharRow; cr < startCharRow + charRows; cr++) {
            for (let cc = 0; cc < 32; cc++) {
                if (mode === MODE_4x4) {
                    const byte = encodedData[pos++];
                    write4x4(fullScr, cr, cc, 0, 0, codebook[(byte >> 6) & 3]);
                    write4x4(fullScr, cr, cc, 0, 4, codebook[(byte >> 4) & 3]);
                    write4x4(fullScr, cr, cc, 4, 0, codebook[(byte >> 2) & 3]);
                    write4x4(fullScr, cr, cc, 4, 4, codebook[byte & 3]);
                } else {
                    const byte0 = encodedData[pos++];
                    const byte1 = encodedData[pos++];
                    write4x2(fullScr, cr, cc, 0, 0, codebook[(byte0 >> 6) & 3]);
                    write4x2(fullScr, cr, cc, 0, 4, codebook[(byte0 >> 4) & 3]);
                    write4x2(fullScr, cr, cc, 2, 0, codebook[(byte0 >> 2) & 3]);
                    write4x2(fullScr, cr, cc, 2, 4, codebook[byte0 & 3]);
                    write4x2(fullScr, cr, cc, 4, 0, codebook[(byte1 >> 6) & 3]);
                    write4x2(fullScr, cr, cc, 4, 4, codebook[(byte1 >> 4) & 3]);
                    write4x2(fullScr, cr, cc, 6, 0, codebook[(byte1 >> 2) & 3]);
                    write4x2(fullScr, cr, cc, 6, 4, codebook[byte1 & 3]);
                }
            }
        }

        if (!region) {
            // Full screen: return classic 6912-byte buffer
            for (let i = 0; i < 768; i++) {
                fullScr[6144 + i] = 0x38;
            }
            return { data: fullScr, bytesRead: pos };
        }

        // Partial region: extract relevant thirds into compact output
        const output = new Uint8Array(bitmapSize + attrSize);
        const startThird = startCharRow / 8;
        for (let t = 0; t < thirdCount; t++) {
            output.set(fullScr.subarray((startThird + t) * 2048, (startThird + t + 1) * 2048), t * 2048);
        }
        // Fill attrs with default 0x38
        for (let i = 0; i < attrSize; i++) {
            output[bitmapSize + i] = 0x38;
        }

        return { data: output, bytesRead: pos };
    }

    // Decompress chunk-compressed data back to 6912-byte SCR (monochrome)
    // Bitmap is reconstructed from codebook, attributes default to 0x38 (ink=0, paper=7)
    function decompress(compressedData) {
        let pos = 0;
        const mode = compressedData[pos++];

        // Read codebook
        const codebook = [];
        if (mode === MODE_4x4) {
            for (let i = 0; i < CODEBOOK_SIZE; i++) {
                codebook.push((compressedData[pos] << 8) | compressedData[pos + 1]);
                pos += 2;
            }
        } else {
            for (let i = 0; i < CODEBOOK_SIZE; i++) {
                codebook.push(compressedData[pos++]);
            }
        }

        // Skip lookup table (reconstruct from codebook)
        const lookupSize = mode === MODE_4x4 ? 64 : 32;
        pos += lookupSize;

        // Decode bitmap
        const scrData = new Uint8Array(6912);

        for (let cr = 0; cr < 24; cr++) {
            for (let cc = 0; cc < 32; cc++) {
                if (mode === MODE_4x4) {
                    const byte = compressedData[pos++];
                    write4x4(scrData, cr, cc, 0, 0, codebook[(byte >> 6) & 3]);
                    write4x4(scrData, cr, cc, 0, 4, codebook[(byte >> 4) & 3]);
                    write4x4(scrData, cr, cc, 4, 0, codebook[(byte >> 2) & 3]);
                    write4x4(scrData, cr, cc, 4, 4, codebook[byte & 3]);
                } else {
                    const byte0 = compressedData[pos++];
                    const byte1 = compressedData[pos++];
                    write4x2(scrData, cr, cc, 0, 0, codebook[(byte0 >> 6) & 3]);
                    write4x2(scrData, cr, cc, 0, 4, codebook[(byte0 >> 4) & 3]);
                    write4x2(scrData, cr, cc, 2, 0, codebook[(byte0 >> 2) & 3]);
                    write4x2(scrData, cr, cc, 2, 4, codebook[byte0 & 3]);
                    write4x2(scrData, cr, cc, 4, 0, codebook[(byte1 >> 6) & 3]);
                    write4x2(scrData, cr, cc, 4, 4, codebook[(byte1 >> 4) & 3]);
                    write4x2(scrData, cr, cc, 6, 0, codebook[(byte1 >> 2) & 3]);
                    write4x2(scrData, cr, cc, 6, 4, codebook[byte1 & 3]);
                }
            }
        }

        // Fill attributes with default: ink=0 (black), paper=7 (white)
        for (let i = 0; i < 768; i++) {
            scrData[6144 + i] = 0x38;
        }

        return scrData;
    }

    // =========================================================================
    // Z80 depacker ASM generation
    // =========================================================================

    // Generate Z80 ASM depacker for 4×4 mode
    // HL = source (encoded data), DE = destination screen address
    // IX = lookup table address
    // Unpacks 768 bytes of encoded data to 6144 bytes of bitmap
    function getDepacker4x4() {
        return [
            '; Chunk 4x4 depacker',
            '; HL = encoded data, DE = screen bitmap address',
            '; IX = 64-byte lookup table, C = number of thirds (1-3)',
            '; Destroys: AF, BC, DE, HL',
            'DeChunks4x4:',
            '        ld      b, 0            ; cell counter (256 = 32*8 per third)',
            '.dc4_third:',
            '        push    de              ; save third start',
            '.dc4_cell:',
            '        push    de              ; save cell column start',
            '        ld      a, (hl)         ; encoded byte: TL|TR|BL|BR',
            '        inc     hl',
            '        push    hl',
            '        push    af              ; save for bottom half',
            '; --- top half (rows 0-3) ---',
            '        rrca',
            '        rrca',
            '        rrca',
            '        rrca',
            '        and     0x0F            ; (TL<<2)|TR',
            '        ld      l, a',
            '        ld      h, 0',
            '        add     hl, hl',
            '        add     hl, hl          ; *4 (bytes per entry)',
            '        push    bc              ; save counters',
            '        push    ix',
            '        pop     bc',
            '        add     hl, bc          ; HL = table + index*4',
            '        pop     bc              ; restore counters',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d              ; next pixel row (+256)',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     d',
            '; --- bottom half (rows 4-7) ---',
            '        pop     af              ; original byte',
            '        and     0x0F            ; (BL<<2)|BR',
            '        ld      l, a',
            '        ld      h, 0',
            '        add     hl, hl',
            '        add     hl, hl',
            '        push    bc              ; save counters',
            '        push    ix',
            '        pop     bc',
            '        add     hl, bc',
            '        pop     bc              ; restore counters',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '; --- advance to next cell ---',
            '        pop     hl              ; restore source pointer',
            '        pop     de              ; restore cell start',
            '        inc     e              ; next column (E=CCC_RRRRR wraps rows naturally)',
            '        djnz    .dc4_cell       ; 256 cells per third',
            '        pop     de              ; restore third start',
            '        ld      a, d',
            '        add     a, 8            ; next third (+2048)',
            '        ld      d, a',
            '        dec     c',
            '        jr      nz, .dc4_third',
            '        ret'
        ].join('\n');
    }

    // Generate Z80 ASM depacker for 4×2 mode
    function getDepacker4x2() {
        return [
            '; Chunk 4x2 depacker',
            '; HL = encoded data, DE = screen bitmap address',
            '; IX = 32-byte lookup table, C = number of thirds (1-3)',
            '; Destroys: AF, BC, DE, HL',
            'DeChunks4x2:',
            '        ld      b, 0            ; cell counter',
            '.dc2_third:',
            '        push    de',
            '.dc2_cell:',
            '        push    de',
            '        ld      a, (hl)         ; byte 0: row-pairs 0,1',
            '        inc     hl',
            '        push    hl',
            '        call    .dc2_byte       ; decode 4 rows',
            '        pop     hl',
            '        ld      a, (hl)         ; byte 1: row-pairs 2,3',
            '        inc     hl',
            '        push    hl',
            '        call    .dc2_byte       ; decode 4 more rows',
            '        pop     hl',
            '        pop     de',
            '        inc     e              ; next column (E=CCC_RRRRR wraps rows naturally)',
            '        djnz    .dc2_cell',
            '        pop     de',
            '        ld      a, d',
            '        add     a, 8',
            '        ld      d, a',
            '        dec     c',
            '        jr      nz, .dc2_third',
            '        ret',
            '',
            '; Decode one byte (2 nibbles = 2 row-pairs = 4 pixel rows)',
            '; A = encoded byte, DE = current screen address (updated)',
            '; IX = lookup table base',
            '.dc2_byte:',
            '        push    bc              ; save counters',
            '        push    af',
            '        rrca',
            '        rrca',
            '        rrca',
            '        rrca',
            '        and     0x0F            ; high nibble: (left0<<2)|right0',
            '        ld      l, a',
            '        ld      h, 0',
            '        add     hl, hl          ; *2 (bytes per entry)',
            '        push    ix',
            '        pop     bc',
            '        add     hl, bc',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     d',
            '; low nibble',
            '        pop     af',
            '        and     0x0F',
            '        ld      l, a',
            '        ld      h, 0',
            '        add     hl, hl',
            '        push    ix',
            '        pop     bc',
            '        add     hl, bc',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     hl',
            '        inc     d',
            '        ld      a, (hl)',
            '        ld      (de), a',
            '        inc     d',
            '        pop     bc              ; restore counters',
            '        ret'
        ].join('\n');
    }

    // =========================================================================
    // Preset codebooks
    // =========================================================================

    // 4×4 patterns (16-bit): 4 rows of 4 pixels, MSB = top-left
    // Row layout: bits 15-12 = row 0, bits 11-8 = row 1, etc.
    // Pixel layout within nibble: bit 3 = leftmost pixel
    var PRESETS_4x4 = {
        // Empty, solid, dither, sparse dots
        standard: [
            0x0000,  // ....  empty
                     // ....
                     // ....
                     // ....
            0xFFFF,  // ####  solid
                     // ####
                     // ####
                     // ####
            0x5F5F,  // .#.#  dither
                     // ####
                     // .#.#
                     // ####
            0x080A   // ....  sparse dots
                     // #...
                     // ....
                     // #.#.
        ],
        // Empty, solid, horizontal halves
        halves_h: [
            0x0000,  // empty
            0xFFFF,  // solid
            0xFF00,  // top half solid
            0x00FF   // bottom half solid
        ],
        // Empty, solid, vertical halves
        halves_v: [
            0x0000,  // empty
            0xFFFF,  // solid
            0xF0F0,  // left half solid
            0x0F0F   // right half solid
        ],
        // Empty, solid, horizontal stripes (2px)
        stripes_h: [
            0x0000,  // empty
            0xFFFF,  // solid
            0xFF00,  // ##..  (2-line stripe)
            0xF00F   // ##.. / .... / .... / ..##
        ],
        // Empty, solid, ZX Spectrum classic dithers
        dither: [
            0x0000,  // empty
            0xFFFF,  // solid
            0xA5A5,  // 50% checker
            0xEBBE   // 75% dot pattern (1110 1011 1011 1110)
        ]
    };

    // 4×2 patterns (8-bit): 2 rows of 4 pixels
    // Row layout: bits 7-4 = row 0, bits 3-0 = row 1
    var PRESETS_4x2 = {
        standard: [
            0x00,    // ....  empty
                     // ....
            0xFF,    // ####  solid
                     // ####
            0x5F,    // .#.#  dither
                     // ####
            0x0A     // ....  sparse dots
                     // #.#.
        ],
        halves_h: [
            0x00,    // empty
            0xFF,    // solid
            0xF0,    // top row solid
            0x0F     // bottom row solid
        ],
        halves_v: [
            0x00,    // empty
            0xFF,    // solid
            0xCC,    // ##..  left half
                     // ##..
            0x33     // ..##  right half
                     // ..##
        ],
        dither: [
            0x00,    // empty
            0xFF,    // solid
            0xA5,    // 50% checker
            0xEB     // 75% (1110 1011)
        ]
    };

    // =========================================================================
    // Codebook construction and serialization
    // =========================================================================

    // Build a codebook from 4 explicit pattern values
    // For 4×4: each value is 16-bit (0x0000..0xFFFF)
    // For 4×2: each value is 8-bit (0x00..0xFF)
    function makeCodebook(p0, p1, p2, p3) {
        return [p0, p1, p2, p3];
    }

    // Serialize codebook to hex string for storage/persistence
    // 4×4: "0000FFFFA5A55A5A" (16 hex chars)
    // 4×2: "00FFA55A" (8 hex chars)
    function codebookToHex(codebook, mode) {
        const digits = mode === MODE_4x4 ? 4 : 2;
        return codebook.map(p => p.toString(16).padStart(digits, '0')).join('');
    }

    // Deserialize codebook from hex string
    function codebookFromHex(hex, mode) {
        const digits = mode === MODE_4x4 ? 4 : 2;
        const codebook = [];
        for (let i = 0; i < CODEBOOK_SIZE; i++) {
            codebook.push(parseInt(hex.substr(i * digits, digits), 16));
        }
        return codebook;
    }

    // Get preset codebook by name and mode
    function getPreset(name, mode) {
        const presets = mode === MODE_4x4 ? PRESETS_4x4 : PRESETS_4x2;
        const preset = presets[name];
        if (!preset) return null;
        return preset.slice();
    }

    // List available preset names
    function getPresetNames() {
        return Object.keys(PRESETS_4x4);
    }

    // Render a single chunk pattern as a string grid (for UI/debug)
    // Returns array of strings, each row is e.g. "#.#."
    function patternToString(pattern, mode) {
        const rows = mode === MODE_4x4 ? 4 : 2;
        const result = [];
        for (let r = 0; r < rows; r++) {
            const nibble = (pattern >> ((rows - 1 - r) * 4)) & 0x0F;
            let row = '';
            for (let b = 3; b >= 0; b--) {
                row += (nibble & (1 << b)) ? '#' : '.';
            }
            result.push(row);
        }
        return result;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    return {
        MODE_4x4: MODE_4x4,
        MODE_4x2: MODE_4x2,
        PRESETS_4x4: PRESETS_4x4,
        PRESETS_4x2: PRESETS_4x2,
        compress: compress,
        decompress: decompress,
        decompressTracked: decompressTracked,
        decompressRaw: decompressRaw,
        findSharedCodebook: findSharedCodebook,
        makeCodebook: makeCodebook,
        codebookToHex: codebookToHex,
        codebookFromHex: codebookFromHex,
        getPreset: getPreset,
        getPresetNames: getPresetNames,
        patternToString: patternToString,
        generateLookupTable: generateLookupTable,
        getDepacker4x4: getDepacker4x4,
        getDepacker4x2: getDepacker4x2
    };

})();
