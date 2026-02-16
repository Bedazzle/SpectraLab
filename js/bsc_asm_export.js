// ============================================================================
// BSC ASM Export — sjasmplus-compatible ASM source generation for BSC borders
// ============================================================================

/**
 * Generates sjasmplus-compatible ASM source for BSC border display.
 * Pentagon 128K timing: 224 T-states/line, 320 lines/frame.
 * All 8 colors pre-assigned to registers — no frequency counting needed.
 * C = #E6 (ULA port + yellow), A=7, B=1, D=2, E=3, H=4, L=5, OUT(C),0 for black.
 * OUTs emitted only on color change, NOPs fill same-color runs.
 * Color tracked across lines so hblank wrapping works naturally.
 * @param {string} baseName - Base filename for SAVESNA output
 * @returns {string} Complete ASM source code
 */
function generateBscAsm(baseName = 'border', embedData = true) {
  if (!screenData || screenData.length < BSC.TOTAL_SIZE) return null;

  // Fixed color-to-OUT mapping (all 8 ZX colors covered)
  // C=$E6 (port byte, $E6 & 7 = 6 = yellow), A=7, B=1, D=2, E=3, H=4, L=5
  const colorOut = [
    'OUT (C),0',  // 0 = black
    'OUT (C),B',  // 1 = blue
    'OUT (C),D',  // 2 = red
    'OUT (C),E',  // 3 = magenta
    'OUT (C),H',  // 4 = green
    'OUT (C),L',  // 5 = cyan
    'OUT (C),C',  // 6 = yellow
    'OUT (C),A'   // 7 = white
  ];

  // --- Read BSC segment color (3-bit, 8px per segment) ---
  function getSegColor(lineOffset, segIndex) {
    const byteIdx = Math.floor(segIndex / 2);
    const b = screenData[lineOffset + byteIdx];
    return (segIndex & 1) === 0 ? (b & 0x07) : ((b >> 3) & 0x07);
  }

  // --- Flush accumulated NOPs as DUP/NOP/EDUP or single NOP ---
  function flushNops(asm, count) {
    if (count <= 0) return;
    if (count === 1) {
      asm.push('    NOP');
    } else {
      asm.push('    DUP ' + count);
      asm.push('    NOP');
      asm.push('    EDUP');
    }
  }

  // --- Generate ASM for a full border line (48 segments = 192T visible + hblank) ---
  // OUT on color change (12T = 3 segments), NOP on same color (4T = 1 segment).
  // Total always 224T per line.
  function emitFullLine(asm, lineOffset, curColor) {
    let t = 0;
    let nops = 0;

    while (t < 192) {
      const seg = Math.floor(t / 4);
      const color = getSegColor(lineOffset, seg);
      if (color !== curColor) {
        flushNops(asm, nops);
        nops = 0;
        asm.push('    ' + colorOut[color]);
        curColor = color;
        t += 12;
      } else {
        nops++;
        t += 4;
      }
    }

    // Hblank — remaining T-states as NOPs
    nops += (224 - t) / 4;
    flushNops(asm, nops);
    return curColor;
  }

  // --- Generate ASM for a side border line ---
  // Left 8 segments (32T) + screen area (128T NOPs) + right 8 segments (32T) + hblank.
  // For right border: check seg 0 at t=152 (during screen area) so OUT takes effect
  // at t=160 (start of visible right border). This compensates for 8T OUT latency.
  // Total always 224T per line.
  function emitSideLine(asm, lineOffset, curColor) {
    let t = 0;
    let nops = 0;

    // Left border (8 segments = 32T)
    while (t < 32) {
      const seg = Math.floor(t / 4);
      const color = getSegColor(lineOffset, seg);
      if (color !== curColor) {
        flushNops(asm, nops);
        nops = 0;
        asm.push('    ' + colorOut[color]);
        curColor = color;
        t += 12;
      } else {
        nops++;
        t += 4;
      }
    }

    // Screen area — fill NOPs, but check right seg 0 at t=152
    // so OUT takes effect at t=160 (start of right border)
    if (t < 152) {
      nops += (152 - t) / 4;
      t = 152;
    }

    // At t=152, check right seg 0 (OUT here takes effect at t=160)
    const rightSeg0 = getSegColor(lineOffset + 4, 0);
    if (rightSeg0 !== curColor) {
      flushNops(asm, nops);
      nops = 0;
      asm.push('    ' + colorOut[rightSeg0]);
      curColor = rightSeg0;
      t = 164;
    } else {
      nops += (160 - t) / 4;
      t = 160;
    }

    // Right border (starting from t=160 or t=164)
    while (t < 192) {
      const seg = Math.floor((t - 160) / 4);
      const color = getSegColor(lineOffset + 4, seg);
      if (color !== curColor) {
        flushNops(asm, nops);
        nops = 0;
        asm.push('    ' + colorOut[color]);
        curColor = color;
        t += 12;
      } else {
        nops++;
        t += 4;
      }
    }

    // Hblank
    nops += (224 - t) / 4;
    flushNops(asm, nops);
    return curColor;
  }

  // --- Format DB lines for screen data ---
  function formatDbLines(data, bytesPerLine) {
    const lines = [];
    for (let i = 0; i < data.length; i += bytesPerLine) {
      const chunk = data.slice(i, Math.min(i + bytesPerLine, data.length));
      lines.push('    DB ' + chunk.map(b => '#' + b.toString(16).toUpperCase().padStart(2, '0')).join(','));
    }
    return lines.join('\n');
  }

  const scrData = Array.from(screenData.slice(0, SCREEN.TOTAL_SIZE));
  const asm = [];

  // === Header ===
  asm.push('; ============================================================================');
  asm.push('; BSC Border Screen viewer — Pentagon 128K');
  asm.push('; Generated by SpectraLab');
  asm.push('; sjasmplus compatible source');
  asm.push(';');
  asm.push('; Timing: 224 T-states/line, 320 lines/frame (71680T total)');
  asm.push('; All 8 colors pre-assigned: A=7 B=1 C=#E6(port+6) D=2 E=3 H=4 L=5');
  asm.push('; OUT on color change only, NOPs fill same-color runs.');
  asm.push('; Free-running loop: HALT for initial sync only, then');
  asm.push('; exact 71680T loop keeps phase without per-frame HALT jitter.');
  asm.push('; ============================================================================');
  asm.push('');
  asm.push('    DEVICE ZXSPECTRUM128');
  asm.push('    ORG #8000');
  asm.push('');

  // === Initialization ===
  asm.push('; ============================================================================');
  asm.push('; Initialization');
  asm.push('; ============================================================================');
  asm.push('Start:');
  asm.push('    DI');
  asm.push('    LD SP,#7FFE');
  asm.push('');
  asm.push('    ; Ensure standard 128K memory config: bank 0 in slot 3, screen bank 5');
  asm.push('    XOR A');
  asm.push('    LD BC,#7FFD');
  asm.push('    OUT (C),A');
  asm.push('');
  asm.push('    ; Copy screen data to video memory');
  asm.push('    LD HL,ScrData');
  asm.push('    LD DE,#4000');
  asm.push('    LD BC,6912');
  asm.push('    LDIR');
  asm.push('');
  asm.push('    ; Setup IM2 interrupt handler');
  asm.push('    ; Vector table at #FE00: 257 bytes of #FD');
  asm.push('    LD HL,#FE00');
  asm.push('    LD DE,#FE01');
  asm.push('    LD BC,256');
  asm.push('    LD (HL),#FD');
  asm.push('    LDIR');
  asm.push('');
  asm.push('    ; ISR at #FDFD: EI + RETI');
  asm.push('    LD A,#FB             ; EI opcode');
  asm.push('    LD (#FDFD),A');
  asm.push('    LD A,#ED             ; RETI prefix');
  asm.push('    LD (#FDFE),A');
  asm.push('    LD A,#4D             ; RETI suffix');
  asm.push('    LD (#FDFF),A');
  asm.push('');
  asm.push('    LD A,#FE');
  asm.push('    LD I,A');
  asm.push('    IM 2');
  asm.push('');

  // === Prefill color registers ===
  asm.push('    ; Prefill color registers (all 8 colors covered)');
  asm.push('    LD A,7               ; white');
  asm.push('    LD B,1               ; blue');
  asm.push('    LD DE,#0203          ; D=red, E=magenta');
  asm.push('    LD HL,#0405          ; H=green, L=cyan');
  asm.push('    LD C,#E6             ; ULA port (#E6 & 7 = 6 = yellow)');
  asm.push('    OUT (C),0            ; Initial border to black');
  asm.push('');

  // === Initial sync ===
  asm.push('; ============================================================================');
  asm.push('; Initial sync via HALT (one-time), then free-running loop');
  asm.push('; ============================================================================');
  asm.push('    EI');
  asm.push('    HALT                 ; Sync to INT (one-time, 0-3T jitter)');
  asm.push('    DI                   ; Interrupts stay disabled from now on');
  asm.push('');

  // Initial delay: from DI to FrameStart via JP
  // From INT: IM2 response (19T) + ISR EI+RETI (18T) + DI (4T) = 41T
  // Target: FrameStart at 3606T from INT (3584T line 16 + 22T phase offset)
  // Phase offset 22T = 44px to align OUTs with left edge of visible border
  // 41 + delay_init + 10(JP) = 3606 -> delay_init = 3555T
  // LD B,250(7T) + DJNZ x250(3245T) + 74xNOP(296T) + LD B,1(7T) = 3555T
  asm.push('    ; Initial delay: 41T(INT overhead) + 3555T(delay) + 10T(JP) = 3606T');
  asm.push('    LD B,250             ; 7T  (250 iterations)');
  asm.push('.idelay:');
  asm.push('    DJNZ .idelay         ; 3245T');
  asm.push('    DUP 74');
  asm.push('    NOP                  ; 74 x 4T = 296T');
  asm.push('    EDUP');
  asm.push('    LD B,1               ; 7T - restore B (blue)');
  asm.push('    JP FrameStart        ; 10T');
  asm.push('');

  // === Main Loop (free-running) ===
  // After bottom border: OUT(C),0 (12T) + JP MainLoop (10T) = 22T
  // MainLoop delay: 3584 - 22 = 3562T
  // LD B,253(7T) + DJNZ x253(3284T) + 66xNOP(264T) + LD B,1(7T) = 3562T
  // Full loop: 3584T + 68096T(frame) = 71680T = 320 lines
  asm.push('; ============================================================================');
  asm.push('; Main Loop - free-running, exactly 71680T per iteration');
  asm.push('; ============================================================================');
  asm.push('MainLoop:');
  asm.push('    ; Inter-frame delay: 3562T (+ 22T from OUT+JP = 3584T = 16 lines)');
  asm.push('    LD B,253             ; 7T  (253 iterations)');
  asm.push('.delay:');
  asm.push('    DJNZ .delay          ; 3284T');
  asm.push('    DUP 66');
  asm.push('    NOP                  ; 66 x 4T = 264T');
  asm.push('    EDUP');
  asm.push('    LD B,1               ; 7T - restore B (blue)');
  asm.push('');
  asm.push('FrameStart:');

  // === Frame: border color starts as black (set by OUT(C),0 before delay) ===
  let curColor = 0;

  // === Top border: 64 lines ===
  asm.push('    ; === Top border: 64 lines ===');
  for (let y = 0; y < 64; y++) {
    const lineOff = BSC.BORDER_OFFSET + y * BSC.BYTES_PER_FULL_LINE;
    curColor = emitFullLine(asm, lineOff, curColor);
  }
  asm.push('');

  // === Side borders: 192 lines ===
  asm.push('    ; === Side borders: 192 lines ===');
  const sideBase = BSC.BORDER_OFFSET + 64 * BSC.BYTES_PER_FULL_LINE;
  for (let y = 0; y < 192; y++) {
    const lineOff = sideBase + y * BSC.BYTES_PER_SIDE_LINE;
    curColor = emitSideLine(asm, lineOff, curColor);
  }
  asm.push('');

  // === Bottom border: 48 lines ===
  asm.push('    ; === Bottom border: 48 lines ===');
  const bottomBase = sideBase + 192 * BSC.BYTES_PER_SIDE_LINE;
  for (let y = 0; y < 48; y++) {
    const lineOff = bottomBase + y * BSC.BYTES_PER_FULL_LINE;
    curColor = emitFullLine(asm, lineOff, curColor);
  }
  asm.push('');

  // === End of frame ===
  // OUT(C),0 (12T) + JP MainLoop (10T) = 22T — part of inter-frame 3584T
  asm.push('    ; End of frame - 22T (part of inter-frame delay)');
  asm.push('    OUT (C),0            ; 12T - black border');
  asm.push('    JP MainLoop          ; 10T');
  asm.push('');

  // === Data section ===
  asm.push('; ============================================================================');
  asm.push('; Data');
  asm.push('; ============================================================================');
  asm.push('');
  asm.push('ScrData:                 ; 6912 bytes (bitmap + attributes)');
  if (embedData) {
    asm.push(formatDbLines(scrData, 16));
  } else {
    asm.push(`    INCBIN "${baseName}.bsc", 0, 6912`);
  }
  asm.push('');
  asm.push('    SAVESNA "' + baseName + '.sna",Start');
  asm.push('');

  return { asm: asm.join('\n') };
}

/**
 * Exports BSC as sjasmplus ASM source file.
 */
function exportBscAsm() {
  if (currentFormat !== FORMAT.BSC || !screenData || screenData.length < BSC.TOTAL_SIZE) {
    alert('Export ASM is only available for BSC format.');
    return;
  }

  // Extract just the filename (handle zip paths like "archive.zip/image.bsc")
  let baseName = 'border';
  if (currentFileName) {
    const fileName = currentFileName.includes('/')
      ? currentFileName.substring(currentFileName.lastIndexOf('/') + 1)
      : currentFileName;
    baseName = fileName.replace(/\.[^.]+$/, '');
  }

  const embedChk = document.getElementById('editorEmbedDataChk');
  const embedData = embedChk ? embedChk.checked : true;

  const result = generateBscAsm(baseName, embedData);
  if (!result) return;

  const blob = new Blob([result.asm], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = baseName + '.asm';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
