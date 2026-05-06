// @ts-check
"use strict";

// ZGS ASM Player Library for sjasmplus.
// Contains zgs_draw, zgs_clear_screen, zgs_wait_key,
// all opcode handlers, drawing primitives, and variables.

// eslint-disable-next-line no-unused-vars
const ZGS_ASM_PLAYER = `
; --- Feature selection (comment out unused features to reduce binary size) ---
; NOTE: If ZGS_USE_RECTS is defined for outline rectangles, ZGS_USE_LINES
;       must also be defined (rect outlines use draw_line).
;       Same for ZGS_USE_POLYGONS outlines.
;
;   DEFINE ZGS_USE_LINES        ; ~443 bytes — line/hline/vline drawing (0x64-0x6A)
;   DEFINE ZGS_USE_RECTS        ; ~636 bytes — rectangle outline/fill, clear_region (0x6B-0x70, 0x7E)
;   DEFINE ZGS_USE_CIRCLES      ; ~612 bytes — circle outline/fill (0x73-0x76)
;   DEFINE ZGS_USE_ELLIPSES     ; ~800 bytes — ellipse outline/fill (0x89-0x8C)
;   DEFINE ZGS_USE_POLYGONS     ; ~666 bytes — polygon outline/fill (0x71-0x72)
;   DEFINE ZGS_USE_FLOOD        ; ~2300 bytes — flood fill (0x19, 0x77) — includes 512-byte stack + 768-byte visited bitmap
;   DEFINE ZGS_USE_TEXT         ; ~180 bytes — set_cursor, print_text (0x80-0x81)
;   DEFINE ZGS_USE_TEXT_42      ; ~200 bytes — 42-col text (6px wide), set_cursor_42, print_text_42 (0x83-0x84)
;   DEFINE ZGS_USE_TEXT_64      ; ~120 bytes — 64-col text (4px wide), set_cursor_64, print_text_64 (0x86-0x87)
;   DEFINE ZGS_USE_PACKED_TEXT  ; ~724 bytes — print_packed, dictionary-compressed text (0x82, requires ZGS_USE_TEXT) — includes ~520 byte dictionary
;   DEFINE ZGS_USE_STAMPS       ; ~146 bytes — stamp_abs, stamp_chain (0x78-0x79)

; --- Auto-derived: coordinate system needed when any drawing feature is enabled ---
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_LINES
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_RECTS
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_CIRCLES
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_ELLIPSES
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_POLYGONS
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_FLOOD
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF
    IFNDEF ZGS_HAS_DRAWING
    IFDEF ZGS_USE_STAMPS
    DEFINE ZGS_HAS_DRAWING
    ENDIF
    ENDIF

; zgs_draw — render a ZGS scene
;   Input: HL = address of ZGS binary data (10-byte header + payload)
;   Resets VM state, parses header, runs all opcodes until END.
;   Destroys: all registers.
;   Requires: zgs_font_addr (dw) and zgs_dict_addr (dw) defined by caller.
zgs_draw:
    ld (zgs_base), hl
    ; Reset VM state
    xor a
    ld (pen_x), a
    ld (pen_y), a
    ld (cur_pat), a
    ld (draw_mode), a
    ld (call_sp), a
    ld (cursor_col), a
    ld (cursor_row), a
    ld (cursor_col_42), a
    ld (cursor_row_42), a
    ld (cursor_col_64), a
    ld (cursor_row_64), a
    ld a, 0x07
    ld (cur_attr), a
    call parse_header
    jp vm_loop

; ==========================================================================
; CLEAR SCREEN
; ==========================================================================
zgs_clear_screen:
    ld a, (clear_color)
    ld hl, 0x4000
    ld de, 0x4001
    ld bc, 6144
    ld (hl), 0
    ldir
    ld (hl), a
    ld bc, 767
    ldir
    ret

; ==========================================================================
; WAIT FOR KEYPRESS
; ==========================================================================
zgs_wait_key:
.wait_release:
    xor a
    in a, (0xFE)
    and 0x1F
    cp 0x1F
    jr nz, .wait_release
.wait_press:
    xor a
    in a, (0xFE)
    and 0x1F
    cp 0x1F
    jr z, .wait_press
    ret

; ==========================================================================
; PARSE HEADER (10 bytes)
; ==========================================================================
parse_header:
    ld hl, (zgs_base)
    ld a, (hl)
    cp 'Z'
    ret nz
    inc hl
    ld a, (hl)
    cp 'G'
    ret nz
    inc hl
    inc hl                      ; skip version byte (offset 2, expected 0x01)
    ld a, (hl)                  ; flags (offset 3)
    ld (file_flags), a
    inc hl
    inc hl                      ; skip total size lo (offset 4)
    inc hl                      ; skip total size hi (offset 5)
    ld e, (hl)                  ; asset lib offset lo (offset 6)
    inc hl
    ld d, (hl)                  ; asset lib offset hi (offset 7)
    ld (asset_lib_off), de
    inc hl
    ld e, (hl)                  ; scene offset lo (offset 8)
    inc hl
    ld d, (hl)                  ; scene offset hi (offset 9)

    ; Set vm_pc
    ld hl, (zgs_base)
    add hl, de
    ld (vm_pc), hl

    ; Parse asset library if flag bit 0 set
    ld a, (file_flags)
    bit 0, a
    ret z

    ld de, (asset_lib_off)
    ld hl, (zgs_base)
    add hl, de                  ; HL = start of asset library

    ld a, (hl)                  ; asset count
    inc hl
    ld (num_assets), a
    ld b, a
    or a
    ret z

    ld ix, asset_table          ; each entry: 2 bytes addr
.parse_asset:
    push bc
    ld a, (hl)                  ; type byte (0=sprite, 1=shape script)
    inc hl
    ld e, (hl)                  ; data length lo
    inc hl
    ld d, (hl)                  ; data length hi
    inc hl
    ; HL now points to asset data — store address
    ld (ix+0), l
    ld (ix+1), h
    inc ix
    inc ix
    add hl, de                  ; skip past asset data
    pop bc
    djnz .parse_asset
    ret

; ==========================================================================
; VM MAIN LOOP
; ==========================================================================
vm_loop:
    call exec_one
    jr nz, vm_loop
    ret

; ==========================================================================
; EXECUTE ONE OPCODE
; Returns: Z = halt, NZ = continue
; ==========================================================================
exec_one:
    call read_u8

    ; 0x00..0x0F: SET_INK
    cp 0x10
    jp c, op_set_ink

    ; 0x10..0x17: SET_PATTERN
    cp 0x18
    jp c, op_set_pattern

    ; 0x18: END
    cp 0x18
    jp z, op_end

    ; 0x19: FLOOD_CHAIN
    cp 0x1A
    jp c, op_flood_chain        ; 1 byte, no operands

    ; 0x1A: DOT_CHAIN
    cp 0x1B
    jp c, op_dot_chain

    ; 0x1B: SET_MODE (1 operand byte)
    cp 0x1B
    jp z, op_set_mode

    ; 0x1C..0x1F: reserved (no operands)
    cp 0x20
    jp c, op_continue

    ; 0x20..0x5F: MOVE_SHORT
    cp 0x60
    jp c, op_move_short

    ; 0x60+: use skip table for opcodes we don't implement yet
    jp op_dispatch_60plus

; --- return NZ (continue) ---
op_continue:
    or 1
    ret

; ==========================================================================
; SET_INK (0x00..0x0F)
; bits 2..0 = ink, bit 3 = bright
; ==========================================================================
op_set_ink:
    ld b, a
    and 0x07                    ; ink colour
    ld c, a
    ld a, b
    and 0x08                    ; bright bit (bit 3)
    rlca
    rlca
    rlca                        ; shift to bit 6
    or c                        ; A = (bright<<6) | ink
    ld c, a
    ld a, (cur_attr)
    and 0x38                    ; keep paper bits only
    or c
    ld (cur_attr), a
    or 1
    ret

; ==========================================================================
; SET_PATTERN (0x10..0x17)
; ==========================================================================
    IFDEF ZGS_HAS_DRAWING
op_set_pattern:
    and 0x07
    ld (cur_pat), a
    or 1
    ret
    ELSE
op_set_pattern:
    or 1
    ret
    ENDIF

; ==========================================================================
; END (0x18) — halt or RET from CALL
; ==========================================================================
op_end:
    ld a, (call_sp)
    or a
    jr z, .halt
    ; Pop return address from call stack
    sub 2
    ld (call_sp), a
    ld c, a
    ld b, 0
    ld hl, call_stk
    add hl, bc
    ld e, (hl)
    inc hl
    ld d, (hl)
    ld (vm_pc), de
    or 1                        ; NZ = continue
    ret
.halt:
    xor a                       ; Z flag = halt
    ret

; ==========================================================================
; SET_MODE (0x1B) — set draw mode (0=SET, 1=XOR)
; ==========================================================================
op_set_mode:
    ld hl, (vm_pc)
    ld a, (hl)
    inc hl
    ld (vm_pc), hl
    and 1
    ld (draw_mode), a
    or 1                        ; NZ = continue
    ret

    IFDEF ZGS_USE_FLOOD
; ==========================================================================
; FLOOD_CHAIN (0x19) — flood fill from pen position
; ==========================================================================
op_flood_chain:
    ld a, (pen_x)
    ld (ff_seed_x), a
    ld a, (pen_y)
    ld (ff_seed_y), a
    call flood_fill
    or 1
    ret
    ELSE
op_flood_chain:
    or 1
    ret
    ENDIF

    IFDEF ZGS_HAS_DRAWING
; ==========================================================================
; DOT_CHAIN (0x1A) — plot at current pen
; ==========================================================================
op_dot_chain:
    ld a, (pen_x)
    ld e, a
    ld a, (pen_y)
    ld d, a
    call plot_pixel
    or 1
    ret

; ==========================================================================
; MOVE_SHORT (0x20..0x5F)
; value = byte - 0x20; dx = (value>>3)-4; dy = (value&7)-4; screen *= 2
; ==========================================================================
op_move_short:
    sub 0x20
    ld b, a                     ; save value
    srl a
    srl a
    srl a                       ; A = value >> 3
    sub 4                       ; signed dx logical
    add a, a                    ; *2 screen
    ld c, a
    ld a, (pen_x)
    add a, c
    ld (pen_x), a

    ld a, b                     ; restore value
    and 0x07                    ; A = value & 7
    sub 4                       ; signed dy logical
    add a, a                    ; *2 screen
    ld c, a
    ld a, (pen_y)
    add a, c
    ld (pen_y), a
    or 1
    ret
    ELSE
op_dot_chain:
op_move_short:
    or 1
    ret
    ENDIF

; ==========================================================================
; DISPATCH for 0x60+ opcodes
; ==========================================================================
op_dispatch_60plus:
    ; A still holds the opcode byte

    cp 0x60
    jp z, op_move_abs

    cp 0x61
    jp z, op_move_dmed

    cp 0x62
    jp z, op_dot_abs

    cp 0x63
    jp z, op_dot_batch

    cp 0x64
    jp z, op_line_dshort        ; LINE_DSHORT
    cp 0x65
    jp z, op_line_dmed          ; LINE_DMED
    cp 0x66
    jp z, op_line_batch         ; LINE_BATCH
    cp 0x67
    jp z, op_hline_chain        ; HLINE_CHAIN
    cp 0x68
    jp z, op_hline_abs          ; HLINE_ABS
    cp 0x69
    jp z, op_vline_chain        ; VLINE_CHAIN
    cp 0x6A
    jp z, op_vline_abs          ; VLINE_ABS
    cp 0x6B
    jp z, op_rect_out_abs       ; RECT_OUTLINE_ABS
    cp 0x6C
    jp z, op_rect_fill_abs      ; RECT_FILL_ABS
    cp 0x6D
    jp z, op_rect_out_chain     ; RECT_OUTLINE_CHAIN
    cp 0x6E
    jp z, op_rect_fill_chain    ; RECT_FILL_CHAIN
    cp 0x6F
    jp z, op_rect_out_batch     ; RECT_OUTLINE_BATCH
    cp 0x70
    jp z, op_rect_fill_batch    ; RECT_FILL_BATCH
    cp 0x71
    jp z, op_poly_outline       ; POLYGON_OUTLINE
    cp 0x72
    jp z, op_poly_fill          ; POLYGON_FILL
    cp 0x73
    jp z, op_circ_out_abs       ; CIRCLE_OUTLINE_ABS
    cp 0x74
    jp z, op_circ_fill_abs      ; CIRCLE_FILL_ABS
    cp 0x75
    jp z, op_circ_out_chain     ; CIRCLE_OUTLINE_CHAIN
    cp 0x76
    jp z, op_circ_fill_chain    ; CIRCLE_FILL_CHAIN
    cp 0x77
    jp z, op_flood_abs          ; FLOOD_ABS
    cp 0x78
    jp z, op_stamp_abs          ; STAMP_ABS
    cp 0x79
    jp z, op_stamp_chain        ; STAMP_CHAIN
    cp 0x7A
    jp z, op_repeat             ; REPEAT
    cp 0x7B
    jp z, op_call               ; CALL
    cp 0x7C
    jp z, op_set_paper          ; SET_PAPER
    cp 0x7D
    jp z, op_set_attr           ; SET_ATTR
    cp 0x7E
    jp z, op_clear_region       ; CLEAR_REGION
    cp 0x7F
    jp z, op_wait_key           ; WAIT_KEY

    cp 0x80
    jp z, op_set_cursor         ; SET_CURSOR
    cp 0x81
    jp z, op_print_text         ; PRINT_TEXT
    cp 0x82
    jp z, op_print_packed       ; PRINT_PACKED

    cp 0x83
    jp z, op_set_cursor_42      ; SET_CURSOR_42
    cp 0x84
    jp z, op_print_text_42      ; PRINT_TEXT_42
    cp 0x85
    jp z, op_print_packed_42    ; PRINT_PACKED_42
    cp 0x86
    jp z, op_set_cursor_64      ; SET_CURSOR_64
    cp 0x87
    jp z, op_print_text_64      ; PRINT_TEXT_64
    cp 0x88
    jp z, op_print_packed_64    ; PRINT_PACKED_64

    cp 0x89
    jp z, op_ellip_out_abs      ; ELLIPSE_OUTLINE_ABS
    cp 0x8A
    jp z, op_ellip_fill_abs     ; ELLIPSE_FILL_ABS
    cp 0x8B
    jp z, op_ellip_out_chain    ; ELLIPSE_OUTLINE_CHAIN
    cp 0x8C
    jp z, op_ellip_fill_chain   ; ELLIPSE_FILL_CHAIN

    ; 0x8D+: reserved
    jp op_continue

    IFDEF ZGS_HAS_DRAWING
; ==========================================================================
; MOVE_ABS (0x60) — +2 abs coord
; ==========================================================================
op_move_abs:
    call read_abs
    ld a, e
    ld (pen_x), a
    ld a, d
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; MOVE_DMED (0x61) — +2 signed dx, dy
; ==========================================================================
op_move_dmed:
    call read_u8
    add a, a                    ; dx * 2
    ld c, a
    ld a, (pen_x)
    add a, c
    ld (pen_x), a
    call read_u8
    add a, a                    ; dy * 2
    ld c, a
    ld a, (pen_y)
    add a, c
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; DOT_ABS (0x62) — +2 abs coord
; ==========================================================================
op_dot_abs:
    call read_abs
    ld a, e
    ld (pen_x), a
    ld a, d
    ld (pen_y), a
    call plot_pixel
    or 1
    ret

; ==========================================================================
; DOT_BATCH (0x63) — +1 count, +N*2 abs coords
; ==========================================================================
op_dot_batch:
    call read_u8
    or a
    jr z, .done
    ld b, a
.loop:
    push bc
    call read_abs
    ld a, e
    ld (pen_x), a
    ld a, d
    ld (pen_y), a
    call plot_pixel
    pop bc
    djnz .loop
.done:
    or 1
    ret
    ELSE
op_move_abs:
op_move_dmed:
op_dot_abs:
op_dot_batch:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_LINES
; ==========================================================================
; LINE_DSHORT (0x64) — +1 DSHORT delta
; ==========================================================================
op_line_dshort:
    call read_dshort            ; E = dx_screen, D = dy_screen
    ld a, (pen_x)
    add a, e
    ld (tmp_x2), a
    ld a, (pen_y)
    add a, d
    ld (tmp_y2), a
    call draw_line
    ld a, (tmp_x2)
    ld (pen_x), a
    ld a, (tmp_y2)
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; LINE_DMED (0x65) — +2 signed dx, dy
; ==========================================================================
op_line_dmed:
    call read_dmed              ; E = dx_screen, D = dy_screen
    ld a, (pen_x)
    add a, e
    ld (tmp_x2), a
    ld a, (pen_y)
    add a, d
    ld (tmp_y2), a
    call draw_line
    ld a, (tmp_x2)
    ld (pen_x), a
    ld a, (tmp_y2)
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; LINE_BATCH (0x66) — +1 count, +N*2 DMED deltas (polyline)
; ==========================================================================
op_line_batch:
    call read_u8
    or a
    jr z, .done
    ld b, a
.loop:
    push bc
    call read_dmed              ; E = dx_screen, D = dy_screen
    ld a, (pen_x)
    add a, e
    ld (tmp_x2), a
    ld a, (pen_y)
    add a, d
    ld (tmp_y2), a
    call draw_line
    ld a, (tmp_x2)
    ld (pen_x), a
    ld a, (tmp_y2)
    ld (pen_y), a
    pop bc
    djnz .loop
.done:
    or 1
    ret

; ==========================================================================
; HLINE_CHAIN (0x67) — +1 signed length
; ==========================================================================
op_hline_chain:
    call read_u8                ; signed length (logical)
    ; sign-extend and *2
    ld c, a
    bit 7, c
    jr z, .pos
    ; negative: A is already two's complement 8-bit
.pos:
    add a, a                    ; *2 screen pixels
    ld c, a
    ld a, (pen_x)
    add a, c
    ld (tmp_x2), a
    ld a, (pen_y)
    ld (tmp_y2), a              ; same Y
    call draw_line
    ld a, (tmp_x2)
    ld (pen_x), a
    or 1
    ret

; ==========================================================================
; HLINE_ABS (0x68) — +2 abs coord +1 signed length
; ==========================================================================
op_hline_abs:
    call read_abs               ; E = screen X, D = screen Y
    ld a, e
    ld (pen_x), a
    ld a, d
    ld (pen_y), a
    call read_u8                ; signed length (logical)
    add a, a                    ; *2 screen
    ld c, a
    ld a, (pen_x)
    add a, c
    ld (tmp_x2), a
    ld a, (pen_y)
    ld (tmp_y2), a
    call draw_line
    ld a, (tmp_x2)
    ld (pen_x), a
    or 1
    ret

; ==========================================================================
; VLINE_CHAIN (0x69) — +1 signed length
; ==========================================================================
op_vline_chain:
    call read_u8                ; signed length (logical)
    add a, a                    ; *2 screen
    ld c, a
    ld a, (pen_x)
    ld (tmp_x2), a              ; same X
    ld a, (pen_y)
    add a, c
    ld (tmp_y2), a
    call draw_line
    ld a, (tmp_y2)
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; VLINE_ABS (0x6A) — +2 abs coord +1 signed length
; ==========================================================================
op_vline_abs:
    call read_abs               ; E = screen X, D = screen Y
    ld a, e
    ld (pen_x), a
    ld a, d
    ld (pen_y), a
    call read_u8                ; signed length (logical)
    add a, a                    ; *2 screen
    ld c, a
    ld a, (pen_x)
    ld (tmp_x2), a
    ld a, (pen_y)
    add a, c
    ld (tmp_y2), a
    call draw_line
    ld a, (tmp_y2)
    ld (pen_y), a
    or 1
    ret
    ELSE
op_line_dshort:
op_line_dmed:
op_line_batch:
op_hline_chain:
op_hline_abs:
op_vline_chain:
op_vline_abs:
    or 1
    ret
    ENDIF

; ==========================================================================
; SET_PAPER (0x7C) — +1 byte: bit 6 = bright, bits 5..3 = paper
; ==========================================================================
op_set_paper:
    call read_u8
    ld b, a
    and 0x38                    ; paper bits
    ld c, a
    ld a, b
    and 0x40                    ; bright bit
    or c
    ld c, a
    ld a, (cur_attr)
    and 0x07                    ; keep ink only
    or c
    ld (cur_attr), a
    or 1
    ret

; ==========================================================================
; SET_ATTR (0x7D) — +1 full attribute byte
; ==========================================================================
op_set_attr:
    call read_u8
    ld (cur_attr), a
    or 1
    ret

; ==========================================================================
; WAIT_KEY (0x7F) — no operands, wait for keypress
; ==========================================================================
op_wait_key:
    call zgs_wait_key
    or 1
    ret

    IFDEF ZGS_USE_TEXT
; ==========================================================================
; SET_CURSOR (0x80) — +1 col +1 row
; ==========================================================================
op_set_cursor:
    call read_u8
    ld (cursor_col), a
    call read_u8
    ld (cursor_row), a
    or 1
    ret

; ==========================================================================
; PRINT_ONE_CHAR — shared subroutine for text rendering
; Input: A = ASCII char code (stored in txt_char)
; Renders the character at (cursor_col, cursor_row), sets attr, advances cursor.
; ==========================================================================
print_one_char:
    ld (txt_char), a

    ; Calculate font data address: (char - 32) * 8 + font_base
    sub 32
    jr nc, .poc_char_ok
    xor a                       ; clamp to space if < 32
.poc_char_ok:
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl                  ; HL = (char-32) * 8
    ld de, (zgs_font_addr)      ; ROM font base
    add hl, de                  ; HL = font data pointer
    ex de, hl                   ; DE = font data pointer

    ; Calculate screen address for (cursor_col, cursor_row)
    ; pixel_y = cursor_row * 8 → S2S1S0 = 0 (top of cell)
    ; High byte: 010 T1T0 00000
    ld a, (cursor_row)
    and 0x18                    ; T1T0 in bits 4-3
    or 0x40                     ; 010xxxxx
    ld h, a                     ; H = high byte (S2S1S0=0)

    ld a, (cursor_row)
    and 0x07                    ; R2R1R0
    rrca
    rrca
    rrca                        ; R2R1R0 now in bits 7-5
    ld l, a
    ld a, (cursor_col)
    and 0x1F
    or l
    ld l, a                     ; L = low byte

    ; HL = screen address, DE = font pointer
    ; Patch draw op: or (hl) = 0xB6, xor (hl) = 0xAE
    ld a, (draw_mode)
    or a
    ld a, 0xB6                  ; or (hl)
    jr z, .poc_mode_ok
    ld a, 0xAE                  ; xor (hl)
.poc_mode_ok:
    ld (.poc_smc), a

    ; Render 8 rows: inc h advances to next pixel row within cell
    ld b, 8
.poc_loop:
    ld a, (de)                  ; font byte
.poc_smc:
    or (hl)                     ; SMC: or (hl) / xor (hl)
    ld (hl), a
    inc h                       ; next pixel row
    inc de                      ; next font byte
    djnz .poc_loop

    ; Set attribute for this cell
    ; attr_addr = 0x5800 + cursor_row * 32 + cursor_col
    ld a, (cursor_row)
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl                  ; HL = row * 32
    ld a, (cursor_col)
    or l
    ld l, a
    ld a, h
    or 0x58
    ld h, a                     ; HL = 0x5800 + row*32 + col
    ld a, (cur_attr)
    ld (hl), a

    ; Advance cursor
    ld a, (cursor_col)
    inc a
    cp 32
    jr c, .poc_no_wrap
    xor a                       ; col = 0
    ld (cursor_col), a
    ld a, (cursor_row)
    inc a
    ld (cursor_row), a
    ret
.poc_no_wrap:
    ld (cursor_col), a
    ret

; ==========================================================================
; PRINT_TEXT (0x81) — +1 len +N ASCII bytes
; ==========================================================================
op_print_text:
    call read_u8
    ld (txt_len), a
    or a
    jp z, .pt_done

.pt_loop:
    call read_u8
    call print_one_char

    ld a, (txt_len)
    dec a
    ld (txt_len), a
    jp nz, .pt_loop
.pt_done:
    or 1
    ret
    ELSE
op_set_cursor:
op_print_text:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_TEXT_42
; ==========================================================================
; SET_CURSOR_42 (0x83) — +1 col(0-41) +1 row(0-23)
; ==========================================================================
op_set_cursor_42:
    call read_u8
    ld (cursor_col_42), a
    call read_u8
    ld (cursor_row_42), a
    or 1
    ret

; ==========================================================================
; PRINT_ONE_CHAR_42 — 6px wide character renderer (cross-byte)
; Input: A = ASCII char code
; Uses (zgs_font_42_addr) as font base, renders top 6 bits of each font byte.
; pixel_x = col * 6, byte_col = pixel_x >> 3, bit_offset = pixel_x & 7
; When bit_offset > 2, char spans two screen bytes.
; ==========================================================================
print_one_char_42:
    ld (txt_char), a
    sub 32
    jr nc, .p42_char_ok
    xor a
.p42_char_ok:
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl                  ; HL = (char-32) * 8
    ld de, (zgs_font_42_addr)
    add hl, de
    ex de, hl                   ; DE = font data pointer

    ; Calculate pixel_x = cursor_col_42 * 6
    ; Use multiply: col*6 = col*4 + col*2
    ld a, (cursor_col_42)
    ld c, a                     ; C = col
    add a, a                    ; A = col*2
    ld b, a                     ; B = col*2
    add a, a                    ; A = col*4
    add a, b                    ; A = col*6
    ld (p42_pixel_x), a
    ; bit_offset = pixel_x & 7
    and 0x07
    ld (p42_bit_off), a
    ; byte_col = pixel_x >> 3
    ld a, (p42_pixel_x)
    rrca
    rrca
    rrca
    and 0x1F
    ld (p42_byte_col), a

    ; Calculate screen address for (byte_col, cursor_row_42)
    ld a, (cursor_row_42)
    and 0x18
    or 0x40
    ld h, a
    ld a, (cursor_row_42)
    and 0x07
    rrca
    rrca
    rrca
    ld l, a
    ld a, (p42_byte_col)
    or l
    ld l, a                     ; HL = screen address

    ; Patch draw mode for all three SMC sites
    ld a, (draw_mode)
    or a
    ld a, 0xB6                  ; or (hl)
    jr z, .p42_mode_ok
    ld a, 0xAE                  ; xor (hl)
.p42_mode_ok:
    ld (.p42_smc1), a
    ld (.p42_smc1a), a
    ld (.p42_smc2), a

    ; Check if cross-byte needed (bit_offset > 2)
    ld a, (p42_bit_off)
    cp 3
    jr nc, .p42_cross_byte

    ; --- Single byte path: bit_offset 0-2 ---
    ld b, 8
.p42_single_loop:
    ld a, (de)
    and 0xFC                    ; top 6 bits only
    push bc
    ld b, a
    ld a, (p42_bit_off)
    or a
    jr z, .p42_no_shift1
    ld c, a
.p42_shift1:
    srl b
    dec c
    jr nz, .p42_shift1
.p42_no_shift1:
    ld a, b
.p42_smc1:
    or (hl)
    ld (hl), a
    pop bc
    inc h
    inc de
    djnz .p42_single_loop
    jr .p42_set_attr

    ; --- Cross-byte path: bit_offset 3-7 ---
.p42_cross_byte:
    ld b, 8
.p42_cross_loop:
    ld a, (de)
    and 0xFC                    ; top 6 bits
    ; First byte: shift right by bit_offset
    push bc
    push hl
    ld b, a
    ld a, (p42_bit_off)
    ld c, a
.p42_shift_r:
    srl b
    dec c
    jr nz, .p42_shift_r
    ld a, b
.p42_smc1a:
    or (hl)
    ld (hl), a
    ; Second byte: shift left by (8 - bit_offset)
    pop hl
    push hl
    inc l                       ; next byte column
    ld a, (de)
    and 0xFC
    ld b, a
    ld a, 8
    ld c, a
    ld a, (p42_bit_off)
    ld c, a
    ld a, 8
    sub c                       ; A = 8 - bit_offset
    ld c, a
    ld a, b
.p42_shift_l:
    add a, a                    ; shift left
    dec c
    jr nz, .p42_shift_l
.p42_smc2:
    or (hl)
    ld (hl), a
    pop hl
    pop bc
    inc h
    inc de
    djnz .p42_cross_loop

.p42_set_attr:
    ; Set attr for primary cell
    ld a, (cursor_row_42)
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl                  ; HL = row * 32
    ld a, (p42_byte_col)
    or l
    ld l, a
    ld a, h
    or 0x58
    ld h, a
    ld a, (cur_attr)
    ld (hl), a
    ; Check if second cell needs attr too (cross-byte)
    ld a, (p42_bit_off)
    cp 3
    jr c, .p42_advance
    ld a, (p42_byte_col)
    inc a
    cp 32
    jr nc, .p42_advance
    ; Set attr for second cell
    ld a, (cursor_row_42)
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    ld b, a
    ld a, (p42_byte_col)
    inc a
    or l
    ld l, a
    ld a, h
    or 0x58
    ld h, a
    ld a, (cur_attr)
    ld (hl), a

.p42_advance:
    ld a, (cursor_col_42)
    inc a
    cp 42
    jr c, .p42_no_wrap
    xor a
    ld (cursor_col_42), a
    ld a, (cursor_row_42)
    inc a
    ld (cursor_row_42), a
    ret
.p42_no_wrap:
    ld (cursor_col_42), a
    ret

; ==========================================================================
; PRINT_TEXT_42 (0x84) — +1 len +N ASCII bytes (42-col mode)
; ==========================================================================
op_print_text_42:
    call read_u8
    ld (txt_len), a
    or a
    jp z, .pt42_done
.pt42_loop:
    call read_u8
    call print_one_char_42
    ld a, (txt_len)
    dec a
    ld (txt_len), a
    jp nz, .pt42_loop
.pt42_done:
    or 1
    ret
    ELSE
op_set_cursor_42:
op_print_text_42:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_TEXT_64
; ==========================================================================
; SET_CURSOR_64 (0x86) — +1 col(0-63) +1 row(0-23)
; ==========================================================================
op_set_cursor_64:
    call read_u8
    ld (cursor_col_64), a
    call read_u8
    ld (cursor_row_64), a
    or 1
    ret

; ==========================================================================
; PRINT_ONE_CHAR_64 — 4px wide character renderer (nibble-based)
; Input: A = ASCII char code
; Uses (zgs_font_64_addr) as font base (4x8 font, top 4 bits).
; byte_col = col >> 1. Even cols: font nibble in high nibble; odd: low nibble.
; No byte boundary crossing (4 pixels fit in one nibble).
; ==========================================================================
print_one_char_64:
    ld (txt_char), a
    sub 32
    jr nc, .p64_char_ok
    xor a
.p64_char_ok:
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl                  ; HL = (char-32) * 8
    ld de, (zgs_font_64_addr)
    add hl, de
    ex de, hl                   ; DE = font data pointer

    ; byte_col = cursor_col_64 >> 1
    ld a, (cursor_col_64)
    srl a
    ld (p64_byte_col), a
    ; Check odd/even
    ld a, (cursor_col_64)
    and 0x01
    ld (p64_is_odd), a

    ; Calculate screen address for (byte_col, cursor_row_64)
    ld a, (cursor_row_64)
    and 0x18
    or 0x40
    ld h, a
    ld a, (cursor_row_64)
    and 0x07
    rrca
    rrca
    rrca
    ld l, a
    ld a, (p64_byte_col)
    or l
    ld l, a                     ; HL = screen address

    ; Patch draw mode for both even/odd SMC sites
    ld a, (draw_mode)
    or a
    ld a, 0xB6                  ; or (hl)
    jr z, .p64_mode_ok
    ld a, 0xAE                  ; xor (hl)
.p64_mode_ok:
    ld (.p64_smc), a
    ld (.p64_smc_odd), a

    ; Render 8 rows
    ld a, (p64_is_odd)
    or a
    jr nz, .p64_odd_path

    ; --- Even column: font top nibble goes to screen high nibble ---
    ld b, 8
.p64_even_loop:
    ld a, (de)                  ; font byte (top 4 bits populated)
    and 0xF0                    ; mask top nibble
.p64_smc:
    or (hl)
    ld (hl), a
    inc h
    inc de
    djnz .p64_even_loop
    jr .p64_set_attr

    ; --- Odd column: font top nibble shifted to low nibble ---
.p64_odd_path:
    ld b, 8
.p64_odd_loop:
    ld a, (de)                  ; font byte (top 4 bits)
    and 0xF0
    rrca
    rrca
    rrca
    rrca                        ; shift top nibble to bottom nibble
.p64_smc_odd:
    or (hl)
    ld (hl), a
    inc h
    inc de
    djnz .p64_odd_loop

.p64_set_attr:
    ; attr cell = (row, byte_col)
    ld a, (cursor_row_64)
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    ld a, (p64_byte_col)
    or l
    ld l, a
    ld a, h
    or 0x58
    ld h, a
    ld a, (cur_attr)
    ld (hl), a

    ; Advance cursor
    ld a, (cursor_col_64)
    inc a
    cp 64
    jr c, .p64_no_wrap
    xor a
    ld (cursor_col_64), a
    ld a, (cursor_row_64)
    inc a
    ld (cursor_row_64), a
    ret
.p64_no_wrap:
    ld (cursor_col_64), a
    ret

; ==========================================================================
; PRINT_TEXT_64 (0x87) — +1 len +N ASCII bytes (64-col mode)
; ==========================================================================
op_print_text_64:
    call read_u8
    ld (txt_len), a
    or a
    jp z, .pt64_done
.pt64_loop:
    call read_u8
    call print_one_char_64
    ld a, (txt_len)
    dec a
    ld (txt_len), a
    jp nz, .pt64_loop
.pt64_done:
    or 1
    ret
    ELSE
op_set_cursor_64:
op_print_text_64:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_PACKED_TEXT
; ==========================================================================
; PRINT_PACKED (0x82) — +1 len +N packed bytes (dictionary-compressed text)
; Byte ranges: 0=newline, 1-31=word, 32-127=literal, 128-223=bigram, 224-255=trigram
; SMC-dispatched: pp_char_call target is patched for 32/42/64-col mode.
; ==========================================================================
    IFDEF ZGS_USE_TEXT
op_print_packed:
    ; Patch all call/jp targets to print_one_char (32-col)
    ld hl, print_one_char
    call pp_patch_targets
    xor a
    ld (pp_mode), a             ; mode 0 = 32-col
    jr pp_shared_entry
    ELSE
op_print_packed:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_TEXT_42
op_print_packed_42:
    ld hl, print_one_char_42
    call pp_patch_targets
    ld a, 1
    ld (pp_mode), a             ; mode 1 = 42-col
    jr pp_shared_entry
    ELSE
op_print_packed_42:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_TEXT_64
op_print_packed_64:
    ld hl, print_one_char_64
    call pp_patch_targets
    ld a, 2
    ld (pp_mode), a             ; mode 2 = 64-col
    jr pp_shared_entry
    ELSE
op_print_packed_64:
    or 1
    ret
    ENDIF

; Patch all SMC call/jp targets to the function address in HL
pp_patch_targets:
    ld (pp_char_call + 1), hl
    ld (pp_char_call_2 + 1), hl
    ld (pp_char_call_3 + 1), hl
    ld (pp_char_call_4 + 1), hl
    ld (pp_char_call_5 + 1), hl
    ld (pp_char_call_6 + 1), hl
    ld (pp_char_call_7 + 1), hl
    ret

pp_shared_entry:
    call read_u8
    ld (pp_len), a
    or a
    jp z, pp_done

    ; Pre-calculate dictionary section pointers
    ld hl, (zgs_dict_addr)
    ld a, (hl)                  ; N = bigram count
    ld (pp_bi_count), a
    inc hl
    ld a, (hl)                  ; M = trigram count
    ld (pp_tri_count), a
    inc hl
    ld a, (hl)                  ; W = word count
    ld (pp_word_count), a
    inc hl
    ld (pp_bi_base), hl         ; bigrams start at offset 3

    ; Calculate trigram base = bi_base + N*2
    ld a, (pp_bi_count)
    ld e, a
    ld d, 0
    add hl, de
    add hl, de                  ; HL = bi_base + N*2
    ld (pp_tri_base), hl

    ; Calculate word offset table base = tri_base + M*3
    ld a, (pp_tri_count)
    ld e, a
    ld d, 0
    add hl, de
    add hl, de
    add hl, de                  ; HL = tri_base + M*3
    ld (pp_woff_base), hl

    ; Calculate word data base = woff_base + W*2
    ld a, (pp_word_count)
    ld e, a
    ld d, 0
    add hl, de
    add hl, de                  ; HL = woff_base + W*2
    ld (pp_wdata_base), hl

pp_loop:
    call read_u8                ; read next packed byte

    cp 32
    jr c, pp_special           ; 0-31
    cp 128
    jr c, pp_literal           ; 32-127
    cp 224
    jr c, pp_bigram            ; 128-223
    ; 224-255: trigram
    sub 224
    ; A = trigram index, multiply by 3
    ld c, a
    add a, a
    add a, c                    ; A = idx * 3
    ld hl, (pp_tri_base)
    ld e, a
    ld d, 0
    add hl, de                  ; HL = trigram data pointer
    ld a, (hl)
    push hl
pp_char_call:
    call pp_done                ; SMC: patched to print_one_char / _42 / _64
    pop hl
    inc hl
    ld a, (hl)
    push hl
    call pp_char_call_2
    pop hl
    inc hl
    ld a, (hl)
    call pp_char_call_3
    jr pp_next

pp_bigram:
    sub 128
    add a, a                    ; A = idx * 2
    ld hl, (pp_bi_base)
    ld e, a
    ld d, 0
    add hl, de                  ; HL = bigram data pointer
    ld a, (hl)
    push hl
    call pp_char_call_4
    pop hl
    inc hl
    ld a, (hl)
    call pp_char_call_5
    jr pp_next

pp_literal:
    call pp_char_call_6
    jr pp_next

pp_special:
    or a
    jr z, pp_newline           ; code 0 = newline
    ; codes 1-31 = word token
    dec a                       ; word index (0-based)
    add a, a                    ; A = idx * 2 (offset table entry)
    ld hl, (pp_woff_base)
    ld e, a
    ld d, 0
    add hl, de                  ; HL = pointer to word offset entry
    ld e, (hl)
    inc hl
    ld d, (hl)                  ; DE = relative offset to word string
    ld hl, (pp_wdata_base)
    add hl, de                  ; HL = pointer to null-terminated word

pp_word_loop:
    ld a, (hl)
    or a
    jr z, pp_next              ; null terminator
    push hl
    call pp_char_call_7
    pop hl
    inc hl
    jr pp_word_loop

pp_newline:
    ; Mode-aware newline: reset correct cursor_col, increment correct cursor_row
    ld a, (pp_mode)
    cp 1
    jr z, pp_nl_42
    cp 2
    jr z, pp_nl_64
    ; Mode 0: 32-col
    xor a
    ld (cursor_col), a
    ld a, (cursor_row)
    inc a
    ld (cursor_row), a
    jr pp_next
pp_nl_42:
    xor a
    ld (cursor_col_42), a
    ld a, (cursor_row_42)
    inc a
    ld (cursor_row_42), a
    jr pp_next
pp_nl_64:
    xor a
    ld (cursor_col_64), a
    ld a, (cursor_row_64)
    inc a
    ld (cursor_row_64), a
    jr pp_next

pp_next:
    ld a, (pp_len)
    dec a
    ld (pp_len), a
    jp nz, pp_loop
pp_done:
    or 1
    ret

; SMC call stubs — all patched to same target as pp_char_call
pp_char_call_2:
    jp pp_done                  ; patched at pp_shared_entry
pp_char_call_3:
    jp pp_done
pp_char_call_4:
    jp pp_done
pp_char_call_5:
    jp pp_done
pp_char_call_6:
    jp pp_done
pp_char_call_7:
    jp pp_done

    ELSE
op_print_packed:
op_print_packed_42:
op_print_packed_64:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_RECTS
; ==========================================================================
; CLEAR_REGION (0x7E) — +1 col +1 row +1 w_cells +1 h_cells +1 attr
; Clears pixels to zero and sets attribute for a character-cell rectangle.
; ==========================================================================
op_clear_region:
    call read_u8
    ld (cr_col), a              ; left column (0-31)
    call read_u8
    ld (cr_row), a              ; top row (0-23)
    call read_u8
    ld (cr_width), a            ; width in cells
    call read_u8
    ld (cr_height), a           ; height in cells
    call read_u8
    ld (cr_attr), a             ; attribute byte to fill
    call do_clear_region
    or 1
    ret

; ------------------------------------------------------------------
; do_clear_region — clear bitmap + set attributes for cell rectangle
; ------------------------------------------------------------------
do_clear_region:
    ; --- Phase 1: Clear bitmap (zero 8 bytes per cell row per cell) ---
    ; Outer loop over cell rows
    ld a, (cr_row)
    ld (cr_cur_row), a

.cr_row_loop:
    ; Compare cr_cur_row against cr_row + cr_height (one-past-end)
    ld a, (cr_row)
    ld c, a
    ld a, (cr_height)
    add a, c                    ; A = cr_row + cr_height
    ld b, a
    ld a, (cr_cur_row)
    cp b
    jr nc, .cr_attr_phase       ; done with all rows

    ; For this cell row, clear 8 pixel rows.
    ; Pixel Y = cr_cur_row * 8 + pixel_sub_row (0..7)
    ld a, (cr_cur_row)
    rlca
    rlca
    rlca                        ; A = cell_row * 8
    ld (cr_pixel_y), a

    ld b, 8                     ; 8 pixel rows per cell row
.cr_pxrow_loop:
    push bc

    ; Compute screen address for (cr_col * 8, cr_pixel_y)
    ; ZX Spectrum bitmap address from Y:
    ;   H = 0x40 | (Y & 0xC0)>>3 | (Y & 0x07)
    ;   L = (Y & 0x38)<<2 | column
    ld a, (cr_pixel_y)
    ld c, a                     ; save Y in C

    ; Build high byte: 010 T1T0 S2S1S0
    and 0x07                    ; S2S1S0
    ld h, a
    ld a, c
    and 0xC0
    rrca
    rrca
    rrca                        ; T1T0 in bits 4-3
    or h
    or 0x40
    ld h, a

    ; Build low byte: R2R1R0_C4C3C2C1C0
    ld a, c
    and 0x38                    ; R2R1R0 in bits 5-3
    rlca
    rlca                        ; R2R1R0 now in bits 7-5
    ld l, a
    ld a, (cr_col)
    or l                        ; combine column with row bits
    ld l, a                     ; HL = screen address for this pixel row

    ; Clear cr_width bytes starting at HL
    ld a, (cr_width)
    ld b, a
.cr_clear_byte:
    ld (hl), 0
    inc l                       ; next column byte (safe, stays within row)
    djnz .cr_clear_byte

    ; Advance to next pixel row
    ld a, (cr_pixel_y)
    inc a
    ld (cr_pixel_y), a

    pop bc
    djnz .cr_pxrow_loop

    ; Next cell row
    ld a, (cr_cur_row)
    inc a
    ld (cr_cur_row), a
    jr .cr_row_loop

    ; --- Phase 2: Set attribute cells ---
.cr_attr_phase:
    ; Attribute address = 0x5800 + row * 32 + col
    ld a, (cr_row)
    ld (cr_cur_row), a

.cr_attr_row:
    ld a, (cr_row)
    ld c, a
    ld a, (cr_height)
    add a, c
    ld b, a
    ld a, (cr_cur_row)
    cp b
    jr nc, .cr_done

    ; Compute attribute row address: 0x5800 + cr_cur_row * 32
    ld a, (cr_cur_row)
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl                  ; HL = cr_cur_row * 32
    ld a, (cr_col)
    add a, l
    ld l, a                     ; HL = cr_cur_row * 32 + cr_col
    ld a, h
    or 0x58                     ; add 0x5800 base
    ld h, a

    ; Fill cr_width attribute bytes
    ld a, (cr_attr)
    ld b, a                     ; B = attr value
    ld a, (cr_width)
    ld c, a                     ; C = count
.cr_attr_col:
    ld (hl), b
    inc l
    dec c
    jr nz, .cr_attr_col

    ld a, (cr_cur_row)
    inc a
    ld (cr_cur_row), a
    jr .cr_attr_row

.cr_done:
    ret

; ==========================================================================
; RECT_OUTLINE_ABS (0x6B) — +2 abs pos +1 width +1 height
; ==========================================================================
op_rect_out_abs:
    call read_abs               ; E = screen X, D = screen Y
    ld a, e
    ld (pen_x), a
    ld (rect_x), a
    ld a, d
    ld (pen_y), a
    ld (rect_y), a
    call read_u8
    add a, a                    ; *2 screen
    ld (rect_w), a
    call read_u8
    add a, a
    ld (rect_h), a
    call draw_rect_outline
    or 1
    ret

; ==========================================================================
; RECT_FILL_ABS (0x6C) — +2 abs pos +1 width +1 height
; ==========================================================================
op_rect_fill_abs:
    call read_abs
    ld a, e
    ld (pen_x), a
    ld (rect_x), a
    ld a, d
    ld (pen_y), a
    ld (rect_y), a
    call read_u8
    add a, a
    ld (rect_w), a
    call read_u8
    add a, a
    ld (rect_h), a
    call draw_rect_fill
    or 1
    ret

; ==========================================================================
; RECT_OUTLINE_CHAIN (0x6D) — +1 width +1 height (from pen)
; ==========================================================================
op_rect_out_chain:
    ld a, (pen_x)
    ld (rect_x), a
    ld a, (pen_y)
    ld (rect_y), a
    call read_u8
    add a, a
    ld (rect_w), a
    call read_u8
    add a, a
    ld (rect_h), a
    call draw_rect_outline
    or 1
    ret

; ==========================================================================
; RECT_FILL_CHAIN (0x6E) — +1 width +1 height (from pen)
; ==========================================================================
op_rect_fill_chain:
    ld a, (pen_x)
    ld (rect_x), a
    ld a, (pen_y)
    ld (rect_y), a
    call read_u8
    add a, a
    ld (rect_w), a
    call read_u8
    add a, a
    ld (rect_h), a
    call draw_rect_fill
    or 1
    ret

; ==========================================================================
; RECT_OUTLINE_BATCH (0x6F) — +1 count, +N*(2 abs + 1w + 1h)
; ==========================================================================
op_rect_out_batch:
    call read_u8
    or a
    jr z, .done
    ld b, a
.loop:
    push bc
    call read_abs
    ld a, e
    ld (pen_x), a
    ld (rect_x), a
    ld a, d
    ld (pen_y), a
    ld (rect_y), a
    call read_u8
    add a, a
    ld (rect_w), a
    call read_u8
    add a, a
    ld (rect_h), a
    call draw_rect_outline
    pop bc
    djnz .loop
.done:
    or 1
    ret

; ==========================================================================
; RECT_FILL_BATCH (0x70) — +1 count, +N*(2 abs + 1w + 1h)
; ==========================================================================
op_rect_fill_batch:
    call read_u8
    or a
    jr z, .done
    ld b, a
.loop:
    push bc
    call read_abs
    ld a, e
    ld (pen_x), a
    ld (rect_x), a
    ld a, d
    ld (pen_y), a
    ld (rect_y), a
    call read_u8
    add a, a
    ld (rect_w), a
    call read_u8
    add a, a
    ld (rect_h), a
    call draw_rect_fill
    pop bc
    djnz .loop
.done:
    or 1
    ret

; ==========================================================================
; draw_rect_outline — draw 4 lines forming a rectangle
; Uses rect_x, rect_y, rect_w, rect_h. Preserves pen.
; ==========================================================================
draw_rect_outline:
    ; Save pen
    ld a, (pen_x)
    ld (rect_save_px), a
    ld a, (pen_y)
    ld (rect_save_py), a

    ; Top edge: (x,y) → (x+w, y)
    ld a, (rect_x)
    ld (pen_x), a
    ld a, (rect_y)
    ld (pen_y), a
    ld a, (rect_x)
    ld b, a
    ld a, (rect_w)
    add a, b
    ld (tmp_x2), a
    ld a, (rect_y)
    ld (tmp_y2), a
    call draw_line

    ; Right edge: (x+w, y) → (x+w, y+h)
    ld a, (rect_x)
    ld b, a
    ld a, (rect_w)
    add a, b
    ld (pen_x), a
    ld (tmp_x2), a
    ld a, (rect_y)
    ld (pen_y), a
    ld a, (rect_y)
    ld b, a
    ld a, (rect_h)
    add a, b
    ld (tmp_y2), a
    call draw_line

    ; Bottom edge: (x+w, y+h) → (x, y+h)
    ld a, (rect_x)
    ld b, a
    ld a, (rect_w)
    add a, b
    ld (pen_x), a
    ld a, (rect_y)
    ld b, a
    ld a, (rect_h)
    add a, b
    ld (pen_y), a
    ld (tmp_y2), a
    ld a, (rect_x)
    ld (tmp_x2), a
    call draw_line

    ; Left edge: (x, y+h) → (x, y)
    ld a, (rect_x)
    ld (pen_x), a
    ld (tmp_x2), a
    ld a, (rect_y)
    ld b, a
    ld a, (rect_h)
    add a, b
    ld (pen_y), a
    ld a, (rect_y)
    ld (tmp_y2), a
    call draw_line

    ; Restore pen
    ld a, (rect_save_px)
    ld (pen_x), a
    ld a, (rect_save_py)
    ld (pen_y), a
    ret

; ==========================================================================
; draw_rect_fill — fill rectangle with pixels
; Uses rect_x, rect_y, rect_w, rect_h. Preserves pen.
; ==========================================================================
draw_rect_fill:
    ld a, (pen_x)
    ld (rect_save_px), a
    ld a, (pen_y)
    ld (rect_save_py), a

    ; Outer loop: rows (Y from rect_y to rect_y + rect_h)
    ld a, (rect_y)
    ld (rf_cur_y), a
    ld a, (rect_h)
    inc a                       ; inclusive
    ld (rf_rows), a

.row_loop:
    ld a, (rf_rows)
    or a
    jr z, .rf_done
    dec a
    ld (rf_rows), a

    ; Inner loop: columns (X from rect_x to rect_x + rect_w)
    ld a, (rect_x)
    ld (rf_cur_x), a
    ld a, (rect_w)
    inc a
    ld (rf_cols), a

.col_loop:
    ld a, (rf_cols)
    or a
    jr z, .next_row
    dec a
    ld (rf_cols), a

    ld a, (rf_cur_y)
    ld d, a
    ld a, (rf_cur_x)
    ld e, a
    call plot_pixel_pat

    ld a, (rf_cur_x)
    inc a
    ld (rf_cur_x), a
    jr .col_loop

.next_row:
    ld a, (rf_cur_y)
    inc a
    ld (rf_cur_y), a
    jr .row_loop

.rf_done:
    ld a, (rect_save_px)
    ld (pen_x), a
    ld a, (rect_save_py)
    ld (pen_y), a
    ret
    ELSE
op_clear_region:
op_rect_out_abs:
op_rect_fill_abs:
op_rect_out_chain:
op_rect_fill_chain:
op_rect_out_batch:
op_rect_fill_batch:
    or 1
    ret
    ENDIF

; ==========================================================================
; REPEAT (0x7A) — +1 count +1 sdx +1 sdy +1 body_len + body
; Semantics: base=pen; for i in 0..count-1: pen=base+i*stride; exec body
; ==========================================================================
op_repeat:
    call read_u8
    ld (rep_count), a
    call read_u8                ; signed stride dx (logical)
    add a, a                    ; *2 screen
    ld (rep_sdx), a
    call read_u8                ; signed stride dy (logical)
    add a, a
    ld (rep_sdy), a
    call read_u8
    ld (rep_blen), a

    ; Record body start/end addresses
    ld hl, (vm_pc)
    ld (rep_body_start), hl
    ld a, (rep_blen)
    ld e, a
    ld d, 0
    add hl, de
    ld (rep_body_end), hl

    ; Save base pen
    ld a, (pen_x)
    ld (rep_base_x), a
    ld a, (pen_y)
    ld (rep_base_y), a

    ld a, (rep_count)
    or a
    jr z, .done
    ld b, a

.iter:
    push bc

    ; Set pen = base (stride accumulates in base after each iteration)
    ld a, (rep_base_x)
    ld (pen_x), a
    ld a, (rep_base_y)
    ld (pen_y), a

    ; Reset vm_pc to body start
    ld hl, (rep_body_start)
    ld (vm_pc), hl

    ; Execute body opcodes until vm_pc >= body_end
.body_loop:
    ld hl, (vm_pc)
    ld de, (rep_body_end)
    or a
    sbc hl, de
    jr nc, .body_done           ; vm_pc >= body_end
    call exec_one
    jr .body_loop

.body_done:
    ; Advance base by stride
    ld a, (rep_base_x)
    ld b, a
    ld a, (rep_sdx)
    add a, b
    ld (rep_base_x), a
    ld a, (rep_base_y)
    ld b, a
    ld a, (rep_sdy)
    add a, b
    ld (rep_base_y), a

    pop bc
    djnz .iter

.done:
    ; Set pen to final base position and vm_pc past body
    ld a, (rep_base_x)
    ld (pen_x), a
    ld a, (rep_base_y)
    ld (pen_y), a
    ld hl, (rep_body_end)
    ld (vm_pc), hl
    or 1
    ret

    IFDEF ZGS_USE_POLYGONS
; ==========================================================================
; POLYGON_OUTLINE (0x71) — +1 count, +2 abs v0, +(N-1)*2 dmed deltas
; ==========================================================================
op_poly_outline:
    call read_polygon_verts

    ; Set pen to first vertex
    ld a, (poly_verts)
    ld (pen_x), a
    ld a, (poly_verts+1)
    ld (pen_y), a

    ; Draw edges between consecutive vertices
    ld a, (poly_count)
    dec a
    or a
    jr z, .close_only           ; 1 vertex, just close
    ld b, a
    ld ix, poly_verts

.edge_loop:
    push bc
    ; Line from current pen to next vertex
    ld a, (ix+2)
    ld (tmp_x2), a
    ld a, (ix+3)
    ld (tmp_y2), a
    call draw_line
    ; Move pen to endpoint
    ld a, (ix+2)
    ld (pen_x), a
    ld a, (ix+3)
    ld (pen_y), a
    inc ix
    inc ix
    pop bc
    djnz .edge_loop

.close_only:
    ; Close: line from last vertex back to first
    ld a, (poly_verts)
    ld (tmp_x2), a
    ld a, (poly_verts+1)
    ld (tmp_y2), a
    call draw_line

    ; Pen = first vertex
    ld a, (poly_verts)
    ld (pen_x), a
    ld a, (poly_verts+1)
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; POLYGON_FILL (0x72) — +1 count, +2 abs v0, +(N-1)*2 dmed deltas
; Scanline fill algorithm
; ==========================================================================
op_poly_fill:
    call read_polygon_verts
    call polygon_fill

    ; Pen = first vertex
    ld a, (poly_verts)
    ld (pen_x), a
    ld a, (poly_verts+1)
    ld (pen_y), a
    or 1
    ret

; ==========================================================================
; read_polygon_verts — parse vertex data into poly_verts buffer
; First vertex = ABS, subsequent = DMED deltas from previous
; ==========================================================================
read_polygon_verts:
    call read_u8
    ld (poly_count), a
    ld b, a
    ld ix, poly_verts
    ; First vertex: absolute
    call read_abs               ; E = screen X, D = screen Y
    ld (ix+0), e
    ld (ix+1), d
    inc ix
    inc ix
    dec b
    ret z
    ; Subsequent vertices: DMED deltas from previous
.loop:
    push bc
    call read_dmed              ; E = dx_screen, D = dy_screen
    ld a, (ix-2)               ; prev x
    add a, e
    ld (ix+0), a
    ld a, (ix-1)               ; prev y
    add a, d
    ld (ix+1), a
    inc ix
    inc ix
    pop bc
    djnz .loop
    ret

; ==========================================================================
; polygon_fill — scanline intersection fill
; Uses poly_verts, poly_count
; ==========================================================================
polygon_fill:
    ; Find min_y and max_y
    ld a, (poly_count)
    ld b, a
    ld ix, poly_verts
    ld c, 0xFF                  ; min_y = 255
    xor a
    ld (pf_max_y), a            ; max_y = 0

.minmax:
    ld a, (ix+1)               ; vertex Y
    cp c
    jr nc, .not_min
    ld c, a
.not_min:
    ld d, a
    ld a, (pf_max_y)
    cp d
    jr nc, .not_max
    ld a, d
    ld (pf_max_y), a
.not_max:
    inc ix
    inc ix
    djnz .minmax

    ld a, c
    ld (pf_min_y), a

    ; Clamp max_y to 191
    ld a, (pf_max_y)
    cp 192
    jr c, .max_ok
    ld a, 191
    ld (pf_max_y), a
.max_ok:

    ; For each scanline from min_y to max_y
    ld a, (pf_min_y)

.scanline_loop:
    ld (pf_cur_y), a
    ld b, a
    ld a, (pf_max_y)
    cp b
    jp c, .pf_done              ; cur_y > max_y

    ; Clear intersection count
    xor a
    ld (pf_isect_count), a

    ; Process each edge
    ld a, (poly_count)
    ld b, a
    ld iy, poly_verts

.edge_loop:
    push bc

    ; Current vertex (iy+0, iy+1)
    ld a, (iy+0)
    ld (pf_x0), a
    ld a, (iy+1)
    ld (pf_y0), a

    ; Next vertex: if last edge, wrap to vertex 0
    dec b
    jr nz, .not_closing
    ; Closing edge
    ld a, (poly_verts)
    ld (pf_x1), a
    ld a, (poly_verts+1)
    ld (pf_y1), a
    jr .process_edge
.not_closing:
    ld a, (iy+2)
    ld (pf_x1), a
    ld a, (iy+3)
    ld (pf_y1), a

.process_edge:
    ; Ensure y0 <= y1
    ld a, (pf_y0)
    ld b, a
    ld a, (pf_y1)
    cp b
    jr nc, .no_swap
    ; Swap
    ld a, (pf_x0)
    ld c, a
    ld a, (pf_x1)
    ld (pf_x0), a
    ld a, c
    ld (pf_x1), a
    ld a, (pf_y0)
    ld c, a
    ld a, (pf_y1)
    ld (pf_y0), a
    ld a, c
    ld (pf_y1), a
.no_swap:

    ; Skip horizontal edges (y0 == y1)
    ld a, (pf_y0)
    ld b, a
    ld a, (pf_y1)
    cp b
    jp z, .next_edge

    ; Check scanline in range [y0, y1)
    ld a, (pf_cur_y)
    ld c, a
    ld a, (pf_y0)
    cp c
    jr z, .in_range
    jp nc, .next_edge           ; y0 > cur_y
.in_range:
    ld a, (pf_y1)
    cp c
    jp z, .next_edge            ; y1 == cur_y (half-open)
    jp c, .next_edge            ; y1 < cur_y

    ; Compute intersection: x = x0 + (cur_y - y0) * (x1 - x0) / (y1 - y0)
    ; dy_num = cur_y - y0
    ld a, (pf_cur_y)
    ld b, a
    ld a, (pf_y0)
    ld c, a
    ld a, b
    sub c
    ld (pf_dy_num), a

    ; dx_edge = x1 - x0 (signed)
    ld a, (pf_x1)
    ld b, a
    ld a, (pf_x0)
    ld c, a
    ld a, b
    sub c
    ld (pf_dx_edge), a

    ; dy_edge = y1 - y0 (> 0)
    ld a, (pf_y1)
    ld b, a
    ld a, (pf_y0)
    ld c, a
    ld a, b
    sub c
    ld (pf_dy_edge), a

    ; Handle sign of dx_edge
    ld a, (pf_dx_edge)
    bit 7, a
    jr z, .dx_pos
    neg
    ld (pf_dx_abs), a
    ld a, 1
    ld (pf_dx_sign), a
    jr .do_mul
.dx_pos:
    ld (pf_dx_abs), a
    xor a
    ld (pf_dx_sign), a

.do_mul:
    ; HL = dy_num * dx_abs  (8x8 → 16 unsigned multiply)
    ld a, (pf_dy_num)
    ld h, a
    ld a, (pf_dx_abs)
    ld e, a
    call umul_he                ; HL = result

    ; HL / dy_edge → L = quotient
    ld a, (pf_dy_edge)
    ld c, a
    or a
    jr z, .next_edge            ; avoid div by 0
    call udiv_hlc               ; L = quotient

    ; Apply sign and add to x0
    ld a, (pf_dx_sign)
    or a
    jr z, .isect_pos
    ld a, (pf_x0)
    sub l
    jr .store_isect
.isect_pos:
    ld a, (pf_x0)
    add a, l

.store_isect:
    ; Store intersection X
    ld b, a
    ld a, (pf_isect_count)
    ld c, a
    push hl
    push iy
    ld hl, pf_isects
    ld e, c
    ld d, 0
    add hl, de
    ld (hl), b
    pop iy
    pop hl
    ld a, (pf_isect_count)
    inc a
    ld (pf_isect_count), a

.next_edge:
    inc iy
    inc iy
    pop bc
    dec b
    jp nz, .edge_loop
    ; (the last dec b + jr nz handles the closing edge being the last one)

    ; --- Sort intersections (bubble sort) ---
    ld a, (pf_isect_count)
    cp 2
    jp c, .next_scanline

    ld a, (pf_isect_count)
    dec a
    ld b, a
.sort_outer:
    push bc
    ld c, b
    ld hl, pf_isects
.sort_inner:
    ld a, (hl)
    inc hl
    cp (hl)
    jr c, .sort_ok
    jr z, .sort_ok
    ld b, (hl)
    ld (hl), a
    dec hl
    ld (hl), b
    inc hl
.sort_ok:
    dec c
    jr nz, .sort_inner
    pop bc
    djnz .sort_outer

    ; --- Fill between pairs ---
    ld a, (pf_isect_count)
    srl a
    or a
    jr z, .next_scanline
    ld b, a
    ld ix, pf_isects

.fill_pair:
    push bc
    ld a, (ix+0)               ; start X
    ld (pf_fill_x), a

.pf_fl:
    ld a, (pf_fill_x)
    ld b, a
    ld a, (ix+1)               ; end X
    cp b
    jr c, .pair_done            ; fill_x > end
    ld a, (pf_fill_x)
    ld e, a
    ld a, (pf_cur_y)
    ld d, a
    call plot_pixel_pat
    ld a, (pf_fill_x)
    inc a
    ld (pf_fill_x), a
    jr .pf_fl

.pair_done:
    inc ix
    inc ix
    pop bc
    djnz .fill_pair

.next_scanline:
    ld a, (pf_cur_y)
    inc a
    cp 192
    ret nc
    ld b, a
    ld a, (pf_max_y)
    cp b
    ret c
    ld a, b
    jp .scanline_loop

.pf_done:
    ret
    ELSE
op_poly_outline:
op_poly_fill:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_CIRCLES
; ==========================================================================
; CIRCLE_OUTLINE_ABS (0x73) — +2 abs centre +1 radius
; ==========================================================================
op_circ_out_abs:
    call read_abs               ; E = cx_screen, D = cy_screen
    ld a, e
    ld (pen_x), a
    ld (circ_cx), a
    ld a, d
    ld (pen_y), a
    ld (circ_cy), a
    call read_u8                ; radius (logical)
    add a, a                    ; *2 screen
    ld (circ_r), a
    call circle_outline
    or 1
    ret

; ==========================================================================
; CIRCLE_FILL_ABS (0x74) — +2 abs centre +1 radius
; ==========================================================================
op_circ_fill_abs:
    call read_abs
    ld a, e
    ld (pen_x), a
    ld (circ_cx), a
    ld a, d
    ld (pen_y), a
    ld (circ_cy), a
    call read_u8
    add a, a
    ld (circ_r), a
    call circle_fill
    or 1
    ret

; ==========================================================================
; CIRCLE_OUTLINE_CHAIN (0x75) — +1 radius (centre = pen)
; ==========================================================================
op_circ_out_chain:
    ld a, (pen_x)
    ld (circ_cx), a
    ld a, (pen_y)
    ld (circ_cy), a
    call read_u8
    add a, a
    ld (circ_r), a
    call circle_outline
    or 1
    ret

; ==========================================================================
; CIRCLE_FILL_CHAIN (0x76) — +1 radius (centre = pen)
; ==========================================================================
op_circ_fill_chain:
    ld a, (pen_x)
    ld (circ_cx), a
    ld a, (pen_y)
    ld (circ_cy), a
    call read_u8
    add a, a
    ld (circ_r), a
    call circle_fill
    or 1
    ret

; ==========================================================================
; circle_outline — midpoint algorithm with 8-way symmetry
; Uses circ_cx, circ_cy, circ_r
; ==========================================================================
circle_outline:
    ld a, (circ_r)
    ld (co_x), a               ; x = r
    xor a
    ld (co_y), a               ; y = 0
    ; err = 1 - r (signed 16-bit)
    ld a, (circ_r)
    ld l, a
    ld h, 0
    ex de, hl                   ; DE = r
    ld hl, 1
    or a
    sbc hl, de                  ; HL = 1 - r
    ld (co_err), hl

.loop:
    ; Check x >= y
    ld a, (co_x)
    ld b, a
    ld a, (co_y)
    cp b
    jr z, .plot8                ; y == x, do one more iteration
    jp nc, .done                ; y > x, done

.plot8:
    ; Plot 8 symmetric points: (cx±x, cy±y) and (cx±y, cy±x)
    ; Point 1: (cx+x, cy+y)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_x)
    add a, b
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_y)
    add a, b
    ld d, a
    call plot_pixel

    ; Point 2: (cx-x, cy+y)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_y)
    add a, b
    ld d, a
    call plot_pixel

    ; Point 3: (cx+x, cy-y)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_x)
    add a, b
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c
    ld d, a
    call plot_pixel

    ; Point 4: (cx-x, cy-y)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c
    ld d, a
    call plot_pixel

    ; Point 5: (cx+y, cy+x)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_y)
    add a, b
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_x)
    add a, b
    ld d, a
    call plot_pixel

    ; Point 6: (cx-y, cy+x)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_x)
    add a, b
    ld d, a
    call plot_pixel

    ; Point 7: (cx+y, cy-x)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_y)
    add a, b
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c
    ld d, a
    call plot_pixel

    ; Point 8: (cx-y, cy-x)
    ld a, (circ_cx)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c
    ld e, a
    ld a, (circ_cy)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c
    ld d, a
    call plot_pixel

    ; Check if x == y (we just did the last iteration)
    ld a, (co_x)
    ld b, a
    ld a, (co_y)
    cp b
    jr z, .done

    ; y += 1
    ld a, (co_y)
    inc a
    ld (co_y), a

    ; Update error
    ld hl, (co_err)
    bit 7, h
    jr z, .err_ge_0

    ; err < 0: err += 2*y + 1
    ld a, (co_y)
    ld e, a
    ld d, 0
    add hl, de
    add hl, de
    inc hl
    ld (co_err), hl
    jp .loop

.err_ge_0:
    ; err >= 0: x -= 1, err += 2*(y - x) + 1
    ld a, (co_x)
    dec a
    ld (co_x), a
    ld b, a                     ; b = new x
    ld a, (co_y)
    sub b                       ; a = y - x
    ld e, a
    ; sign-extend e to de
    bit 7, e
    jr z, .se_pos
    ld d, 0xFF
    jr .se_done
.se_pos:
    ld d, 0
.se_done:
    add hl, de
    add hl, de
    inc hl
    ld (co_err), hl
    jp .loop

.done:
    ret

; ==========================================================================
; circle_fill — midpoint algorithm with horizontal spans
; Uses circ_cx, circ_cy, circ_r
; ==========================================================================
circle_fill:
    ld a, (circ_r)
    ld (co_x), a               ; x = r
    xor a
    ld (co_y), a               ; y = 0
    ; err = 1 - r (signed 16-bit)
    ld a, (circ_r)
    ld l, a
    ld h, 0
    ex de, hl
    ld hl, 1
    or a
    sbc hl, de
    ld (co_err), hl

.loop:
    ld a, (co_x)
    ld b, a
    ld a, (co_y)
    cp b
    jr z, .draw_spans
    jp nc, .done                ; y > x

.draw_spans:
    ; Draw 4 horizontal spans:
    ; Span 1: (cx-x, cy+y) to (cx+x, cy+y)
    ld a, (circ_cy)
    ld b, a
    ld a, (co_y)
    add a, b
    ld d, a                     ; D = cy+y
    ld a, (circ_cx)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c                       ; A = cx-x (start)
    ld (cf_span_x), a
    ld a, b
    add a, c                    ; A = cx+x (end)
    ld (cf_span_end), a
    ld a, d
    ld (cf_span_y), a
    call draw_hspan

    ; Span 2: (cx-x, cy-y) to (cx+x, cy-y)
    ld a, (circ_cy)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c                       ; A = cy-y
    ld (cf_span_y), a
    ld a, (circ_cx)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_x), a
    ld a, b
    add a, c
    ld (cf_span_end), a
    call draw_hspan

    ; Span 3: (cx-y, cy+x) to (cx+y, cy+x)
    ld a, (circ_cy)
    ld b, a
    ld a, (co_x)
    add a, b
    ld (cf_span_y), a
    ld a, (circ_cx)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_x), a
    ld a, b
    add a, c
    ld (cf_span_end), a
    call draw_hspan

    ; Span 4: (cx-y, cy-x) to (cx+y, cy-x)
    ld a, (circ_cy)
    ld b, a
    ld a, (co_x)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_y), a
    ld a, (circ_cx)
    ld b, a
    ld a, (co_y)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_x), a
    ld a, b
    add a, c
    ld (cf_span_end), a
    call draw_hspan

    ; Check if x == y (last iteration)
    ld a, (co_x)
    ld b, a
    ld a, (co_y)
    cp b
    jr z, .done

    ; y += 1
    ld a, (co_y)
    inc a
    ld (co_y), a

    ; Update error (same logic as outline)
    ld hl, (co_err)
    bit 7, h
    jr z, .err_ge_0

    ld a, (co_y)
    ld e, a
    ld d, 0
    add hl, de
    add hl, de
    inc hl
    ld (co_err), hl
    jp .loop

.err_ge_0:
    ld a, (co_x)
    dec a
    ld (co_x), a
    ld b, a
    ld a, (co_y)
    sub b
    ld e, a
    bit 7, e
    jr z, .se_pos
    ld d, 0xFF
    jr .se_done
.se_pos:
    ld d, 0
.se_done:
    add hl, de
    add hl, de
    inc hl
    ld (co_err), hl
    jp .loop

.done:
    ret

; ==========================================================================
; draw_hspan — draw horizontal line from cf_span_x to cf_span_end at cf_span_y
; ==========================================================================
draw_hspan:
.loop:
    ld a, (cf_span_x)
    ld b, a
    ld a, (cf_span_end)
    cp b
    ret c                       ; span_x > span_end, done
    ld a, (cf_span_x)
    ld e, a
    ld a, (cf_span_y)
    ld d, a
    call plot_pixel_pat
    ld a, (cf_span_x)
    inc a
    ld (cf_span_x), a
    jr .loop
    ELSE
op_circ_out_abs:
op_circ_fill_abs:
op_circ_out_chain:
op_circ_fill_chain:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_ELLIPSES
; ==========================================================================
; ELLIPSE_OUTLINE_ABS (0x89) — +2 abs centre +1 rx +1 ry
; ==========================================================================
op_ellip_out_abs:
    call read_abs               ; E = cx_screen, D = cy_screen
    ld a, e
    ld (pen_x), a
    ld (ell_cx), a
    ld a, d
    ld (pen_y), a
    ld (ell_cy), a
    call read_u8                ; rx (logical)
    add a, a                    ; *2 screen
    ld (ell_rx), a
    call read_u8                ; ry (logical)
    add a, a
    ld (ell_ry), a
    call ellipse_outline
    or 1
    ret

; ==========================================================================
; ELLIPSE_FILL_ABS (0x8A) — +2 abs centre +1 rx +1 ry
; ==========================================================================
op_ellip_fill_abs:
    call read_abs
    ld a, e
    ld (pen_x), a
    ld (ell_cx), a
    ld a, d
    ld (pen_y), a
    ld (ell_cy), a
    call read_u8
    add a, a
    ld (ell_rx), a
    call read_u8
    add a, a
    ld (ell_ry), a
    call ellipse_fill
    or 1
    ret

; ==========================================================================
; ELLIPSE_OUTLINE_CHAIN (0x8B) — +1 rx +1 ry (centre = pen)
; ==========================================================================
op_ellip_out_chain:
    ld a, (pen_x)
    ld (ell_cx), a
    ld a, (pen_y)
    ld (ell_cy), a
    call read_u8
    add a, a
    ld (ell_rx), a
    call read_u8
    add a, a
    ld (ell_ry), a
    call ellipse_outline
    or 1
    ret

; ==========================================================================
; ELLIPSE_FILL_CHAIN (0x8C) — +1 rx +1 ry (centre = pen)
; ==========================================================================
op_ellip_fill_chain:
    ld a, (pen_x)
    ld (ell_cx), a
    ld a, (pen_y)
    ld (ell_cy), a
    call read_u8
    add a, a
    ld (ell_rx), a
    call read_u8
    add a, a
    ld (ell_ry), a
    call ellipse_fill
    or 1
    ret

; ==========================================================================
; ellipse_outline — midpoint ellipse algorithm with 4-way symmetry
; Uses ell_cx, ell_cy, ell_rx, ell_ry
; 16-bit arithmetic for error terms (rx^2, ry^2 can exceed 255)
; ==========================================================================
ellipse_outline:
    ; x = 0, y = ry
    xor a
    ld (eo_x), a
    ld a, (ell_ry)
    ld (eo_y), a

    ; Compute ry^2 -> (eo_ry2)
    ld a, (ell_ry)
    ld h, 0
    ld l, a
    call .sq16                  ; HL = ry^2
    ld (eo_ry2), hl

    ; Compute rx^2 -> (eo_rx2)
    ld a, (ell_rx)
    ld h, 0
    ld l, a
    call .sq16                  ; HL = rx^2
    ld (eo_rx2), hl

    ; px = 0
    ld hl, 0
    ld (eo_px), hl

    ; py = 2 * rx^2 * ry
    ld hl, (eo_rx2)
    add hl, hl                  ; 2*rx^2
    ld de, 0
    ld a, (ell_ry)
    or a
    jr z, .py_done
    ld b, a
    ld de, 0
.py_mul:
    ex de, hl
    add hl, de                  ; accumulate
    ex de, hl
    djnz .py_mul
.py_done:
    ld (eo_py), de              ; py = 2*rx^2*ry

    ; err = ry^2 - rx^2*ry + rx^2/4  (approx: use rx^2*ry - ry^2 negated trick)
    ; err = ry2 - rx2*ry + rx2/4
    ; For simplicity: err = ry2 + rx2/4 - rx2*ry  (all 16-bit)
    ld hl, (eo_ry2)             ; start with ry^2
    ld de, (eo_rx2)
    srl d
    rr e                        ; DE = rx^2/4 (integer approx)
    add hl, de                  ; HL = ry^2 + rx^2/4
    ; subtract rx^2 * ry
    ld a, (ell_ry)
    or a
    jr z, .r1_skip_sub
    ld b, a
    ld de, (eo_rx2)
.r1_sub_loop:
    or a
    sbc hl, de
    djnz .r1_sub_loop
.r1_skip_sub:
    ld (eo_err), hl

; Region 1: px < py
.r1_loop:
    ld hl, (eo_px)
    ld de, (eo_py)
    or a
    sbc hl, de
    jr nc, .r1_done             ; px >= py, switch to region 2

    ; Plot 4 points
    call .plot4

    ; x++
    ld a, (eo_x)
    inc a
    ld (eo_x), a

    ; px += 2*ry^2
    ld hl, (eo_px)
    ld de, (eo_ry2)
    add hl, de
    add hl, de
    ld (eo_px), hl

    ; if err < 0: err += ry^2 + px
    ld hl, (eo_err)
    bit 7, h
    jr z, .r1_err_ge0
    ld de, (eo_ry2)
    add hl, de
    ld de, (eo_px)
    add hl, de
    ld (eo_err), hl
    jr .r1_loop

.r1_err_ge0:
    ; y--
    ld a, (eo_y)
    dec a
    ld (eo_y), a
    ; py -= 2*rx^2
    ld hl, (eo_py)
    ld de, (eo_rx2)
    or a
    sbc hl, de
    sbc hl, de
    ld (eo_py), hl
    ; err += ry^2 + px - py
    ld hl, (eo_err)
    ld de, (eo_ry2)
    add hl, de
    ld de, (eo_px)
    add hl, de
    ld de, (eo_py)
    or a
    sbc hl, de
    ld (eo_err), hl
    jp .r1_loop

.r1_done:
    ; Region 2: step y down
    ; err = ry2*(x+0.5)^2 + rx2*(y-1)^2 - rx2*ry2
    ; Approximate: recalculate for region 2 start
    ; err2 = ry2*(x+1)*(x) + rx2*(y-1)^2 - rx2*ry2  (simpler approx)
    ld a, (eo_x)
    ld h, 0
    ld l, a
    call .sq16                  ; HL = x^2
    ld de, (eo_ry2)
    call .mul16                 ; HL = ry2 * x^2  (approximate (x+0.5)^2 as x^2+x)
    push hl
    ; + ry2 * x  (to approximate the +0.5 part)
    ld a, (eo_x)
    ld h, 0
    ld l, a
    ld de, (eo_ry2)
    call .mul16
    pop de
    add hl, de                  ; HL = ry2*(x^2+x) approx ry2*(x+0.5)^2
    push hl

    ld a, (eo_y)
    or a
    jr z, .r2_y_sq_zero
    dec a
    ld h, 0
    ld l, a
    call .sq16
    ld de, (eo_rx2)
    call .mul16                 ; HL = rx2*(y-1)^2
    jr .r2_y_sq_done
.r2_y_sq_zero:
    ld hl, (eo_rx2)             ; (y-1)^2 = 1 when y=0, but actually y=0 means done
.r2_y_sq_done:
    pop de
    add hl, de                  ; HL = ry2*(x+0.5)^2 + rx2*(y-1)^2

    ; subtract rx2*ry2
    ld de, (eo_rx2)
    ld a, (ell_ry)
    or a
    jr z, .r2_skip_prod
    ld b, a
    push hl
    ld hl, 0
.r2_prod_loop:
    add hl, de
    djnz .r2_prod_loop
    ; HL = rx2*ry  (need rx2*ry2 = rx2*ry * ry)
    ld a, (ell_ry)
    ld b, a
    ld de, 0
.r2_prod_loop2:
    ex de, hl
    add hl, de
    ex de, hl
    djnz .r2_prod_loop2
    ; DE = rx2*ry2
    pop hl
    or a
    sbc hl, de
    jr .r2_err_set
.r2_skip_prod:
    ; ry=0, done
    ret
.r2_err_set:
    ld (eo_err), hl

.r2_loop:
    ld a, (eo_y)
    or a
    ret m                       ; y < 0, done
    ; Plot 4 points
    call .plot4

    ; y--
    ld a, (eo_y)
    dec a
    ld (eo_y), a
    ; py -= 2*rx^2
    ld hl, (eo_py)
    ld de, (eo_rx2)
    or a
    sbc hl, de
    sbc hl, de
    ld (eo_py), hl

    ; if err > 0: err += rx^2 - py
    ld hl, (eo_err)
    bit 7, h
    jr nz, .r2_err_le0
    ld de, (eo_rx2)
    add hl, de
    ld de, (eo_py)
    or a
    sbc hl, de
    ld (eo_err), hl
    jr .r2_loop

.r2_err_le0:
    ; x++
    ld a, (eo_x)
    inc a
    ld (eo_x), a
    ; px += 2*ry^2
    ld hl, (eo_px)
    ld de, (eo_ry2)
    add hl, de
    add hl, de
    ld (eo_px), hl
    ; err += rx^2 - py + px
    ld hl, (eo_err)
    ld de, (eo_rx2)
    add hl, de
    ld de, (eo_py)
    or a
    sbc hl, de
    ld de, (eo_px)
    add hl, de
    ld (eo_err), hl
    jp .r2_loop

; Plot 4 symmetric points: (cx±x, cy±y)
.plot4:
    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    add a, c
    ld e, a                     ; E = cx+x
    ld a, (ell_cy)
    ld b, a
    ld a, (eo_y)
    add a, b
    ld d, a                     ; D = cy+y
    call plot_pixel

    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    sub c
    ld e, a                     ; E = cx-x
    ld a, (ell_cy)
    ld b, a
    ld a, (eo_y)
    add a, b
    ld d, a                     ; D = cy+y
    call plot_pixel

    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    add a, c
    ld e, a                     ; E = cx+x
    ld a, (ell_cy)
    ld b, a
    ld a, (eo_y)
    ld c, a
    ld a, b
    sub c
    ld d, a                     ; D = cy-y
    call plot_pixel

    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    sub c
    ld e, a                     ; E = cx-x
    ld a, (ell_cy)
    ld b, a
    ld a, (eo_y)
    ld c, a
    ld a, b
    sub c
    ld d, a                     ; D = cy-y
    call plot_pixel
    ret

; 16-bit square: HL = L * L  (input: HL with H=0, L=value)
.sq16:
    ld a, l
    ld d, 0
    ld e, a
    ld hl, 0
    or a
    ret z
    ld b, a
.sq16_loop:
    add hl, de
    djnz .sq16_loop
    ret

; 16-bit multiply: HL = HL * DE  (both 16-bit, result truncated to 16 bits)
.mul16:
    push bc
    ld b, h
    ld c, l
    ld hl, 0
    ld a, 16
.mul16_loop:
    add hl, hl
    rl c
    rl b
    jr nc, .mul16_skip
    add hl, de
.mul16_skip:
    dec a
    jr nz, .mul16_loop
    pop bc
    ret

; ==========================================================================
; ellipse_fill — midpoint ellipse with horizontal spans
; Uses ell_cx, ell_cy, ell_rx, ell_ry + halfW table
; ==========================================================================
ellipse_fill:
    ; Clear halfW table (ry+1 entries)
    ld a, (ell_ry)
    inc a
    ld b, a
    ld hl, ell_halfW
    ld a, 0
.clr_loop:
    ld (hl), a
    inc hl
    djnz .clr_loop

    ; x = 0, y = ry
    xor a
    ld (eo_x), a
    ld a, (ell_ry)
    ld (eo_y), a

    ; Compute ry^2 -> (eo_ry2), rx^2 -> (eo_rx2)
    ld a, (ell_ry)
    ld h, 0
    ld l, a
    call ellipse_outline.sq16
    ld (eo_ry2), hl
    ld a, (ell_rx)
    ld h, 0
    ld l, a
    call ellipse_outline.sq16
    ld (eo_rx2), hl

    ; px = 0, py = 2*rx^2*ry
    ld hl, 0
    ld (eo_px), hl
    ld hl, (eo_rx2)
    add hl, hl
    ld de, 0
    ld a, (ell_ry)
    or a
    jr z, .ef_py_done
    ld b, a
.ef_py_mul:
    ex de, hl
    add hl, de
    ex de, hl
    djnz .ef_py_mul
.ef_py_done:
    ld (eo_py), de

    ; err for region 1
    ld hl, (eo_ry2)
    ld de, (eo_rx2)
    srl d
    rr e
    add hl, de
    ld a, (ell_ry)
    or a
    jr z, .ef_r1_skip_sub
    ld b, a
    ld de, (eo_rx2)
.ef_r1_sub:
    or a
    sbc hl, de
    djnz .ef_r1_sub
.ef_r1_skip_sub:
    ld (eo_err), hl

; Region 1
.ef_r1_loop:
    ld hl, (eo_px)
    ld de, (eo_py)
    or a
    sbc hl, de
    jr nc, .ef_r1_done

    ; Record halfW[y] = max(halfW[y], x)
    ld a, (eo_y)
    ld e, a
    ld d, 0
    ld hl, ell_halfW
    add hl, de
    ld a, (eo_x)
    cp (hl)
    jr c, .ef_r1_no_update
    jr z, .ef_r1_no_update
    ld (hl), a
.ef_r1_no_update:

    ; x++
    ld a, (eo_x)
    inc a
    ld (eo_x), a
    ; px += 2*ry^2
    ld hl, (eo_px)
    ld de, (eo_ry2)
    add hl, de
    add hl, de
    ld (eo_px), hl

    ld hl, (eo_err)
    bit 7, h
    jr z, .ef_r1_err_ge0
    ld de, (eo_ry2)
    add hl, de
    ld de, (eo_px)
    add hl, de
    ld (eo_err), hl
    jr .ef_r1_loop

.ef_r1_err_ge0:
    ld a, (eo_y)
    dec a
    ld (eo_y), a
    ld hl, (eo_py)
    ld de, (eo_rx2)
    or a
    sbc hl, de
    sbc hl, de
    ld (eo_py), hl
    ld hl, (eo_err)
    ld de, (eo_ry2)
    add hl, de
    ld de, (eo_px)
    add hl, de
    ld de, (eo_py)
    or a
    sbc hl, de
    ld (eo_err), hl
    jp .ef_r1_loop

.ef_r1_done:
    ; Region 2: recalc err (same approach as outline)
    ; Simplified: just continue stepping y down, recording halfW
    ld a, (eo_x)
    ld h, 0
    ld l, a
    call ellipse_outline.sq16
    ld de, (eo_ry2)
    call ellipse_outline.mul16
    push hl
    ld a, (eo_x)
    ld h, 0
    ld l, a
    ld de, (eo_ry2)
    call ellipse_outline.mul16
    pop de
    add hl, de
    push hl
    ld a, (eo_y)
    or a
    jr z, .ef_r2_ysq_zero
    dec a
    ld h, 0
    ld l, a
    call ellipse_outline.sq16
    ld de, (eo_rx2)
    call ellipse_outline.mul16
    jr .ef_r2_ysq_done
.ef_r2_ysq_zero:
    ld hl, (eo_rx2)
.ef_r2_ysq_done:
    pop de
    add hl, de
    ld de, (eo_rx2)
    ld a, (ell_ry)
    or a
    jr z, .ef_r2_skip_prod
    ld b, a
    push hl
    ld hl, 0
.ef_r2_prod1:
    add hl, de
    djnz .ef_r2_prod1
    ld a, (ell_ry)
    ld b, a
    ld de, 0
.ef_r2_prod2:
    ex de, hl
    add hl, de
    ex de, hl
    djnz .ef_r2_prod2
    pop hl
    or a
    sbc hl, de
    jr .ef_r2_err_set
.ef_r2_skip_prod:
    jp .ef_draw_spans
.ef_r2_err_set:
    ld (eo_err), hl

.ef_r2_loop:
    ld a, (eo_y)
    or a
    jr z, .ef_r2_last
    bit 7, a
    jp nz, .ef_draw_spans

    ; Record halfW[y]
    ld e, a
    ld d, 0
    ld hl, ell_halfW
    add hl, de
    ld a, (eo_x)
    cp (hl)
    jr c, .ef_r2_no_upd
    jr z, .ef_r2_no_upd
    ld (hl), a
.ef_r2_no_upd:

    ld a, (eo_y)
    dec a
    ld (eo_y), a
    ld hl, (eo_py)
    ld de, (eo_rx2)
    or a
    sbc hl, de
    sbc hl, de
    ld (eo_py), hl

    ld hl, (eo_err)
    bit 7, h
    jr nz, .ef_r2_err_le0
    ld de, (eo_rx2)
    add hl, de
    ld de, (eo_py)
    or a
    sbc hl, de
    ld (eo_err), hl
    jr .ef_r2_loop

.ef_r2_err_le0:
    ld a, (eo_x)
    inc a
    ld (eo_x), a
    ld hl, (eo_px)
    ld de, (eo_ry2)
    add hl, de
    add hl, de
    ld (eo_px), hl
    ld hl, (eo_err)
    ld de, (eo_rx2)
    add hl, de
    ld de, (eo_py)
    or a
    sbc hl, de
    ld de, (eo_px)
    add hl, de
    ld (eo_err), hl
    jp .ef_r2_loop

.ef_r2_last:
    ; y == 0, record halfW[0]
    ld hl, ell_halfW
    ld a, (eo_x)
    cp (hl)
    jr c, .ef_draw_spans
    jr z, .ef_draw_spans
    ld (hl), a

; Draw horizontal spans from the halfW table
.ef_draw_spans:
    ld a, (ell_ry)
    or a
    ret z
    ld b, a
    ld c, 0                     ; dy counter starting at 0
    ; Draw dy=0 span
    ld hl, ell_halfW
    ld a, (hl)
    or a
    jr z, .ef_dy0_skip
    ld (eo_x), a               ; hw
    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_x), a
    ld a, b
    add a, c
    ld (cf_span_end), a
    ld a, (ell_cy)
    ld (cf_span_y), a
    call draw_hspan
.ef_dy0_skip:

    ld a, (ell_ry)
    ld b, a
    ld c, 1                     ; dy = 1..ry
.ef_span_loop:
    push bc
    ; Get halfW[dy]
    ld a, c
    ld e, a
    ld d, 0
    ld hl, ell_halfW
    add hl, de
    ld a, (hl)
    or a
    jr z, .ef_span_skip

    ld (eo_x), a               ; hw
    ; Span at cy + dy
    ld a, (ell_cy)
    ld b, a
    pop de
    push de
    ld a, e                     ; dy = C from stack
    add a, b
    ld (cf_span_y), a
    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_x), a
    ld a, b
    add a, c
    ld (cf_span_end), a
    call draw_hspan

    ; Span at cy - dy
    ld a, (ell_cy)
    ld b, a
    pop de
    push de
    ld a, e
    ld c, a
    ld a, b
    sub c
    ld (cf_span_y), a
    ld a, (ell_cx)
    ld b, a
    ld a, (eo_x)
    ld c, a
    ld a, b
    sub c
    ld (cf_span_x), a
    ld a, b
    add a, c
    ld (cf_span_end), a
    call draw_hspan

.ef_span_skip:
    pop bc
    inc c
    dec b
    jr nz, .ef_span_loop
    ret

    ELSE
op_ellip_out_abs:
op_ellip_fill_abs:
op_ellip_out_chain:
op_ellip_fill_chain:
    or 1
    ret
    ENDIF

    IFDEF ZGS_USE_FLOOD
; ==========================================================================
; FLOOD_ABS (0x77) — +2 abs seed coord
; ==========================================================================
op_flood_abs:
    call read_abs               ; E = screen X, D = screen Y
    ld a, e
    ld (pen_x), a
    ld (ff_seed_x), a
    ld a, d
    ld (pen_y), a
    ld (ff_seed_y), a
    call flood_fill
    or 1
    ret

; ==========================================================================
; flood_fill — scanline flood fill with column-level visited bitmap
; Uses separate visited bitmap so pattern can be applied directly during fill.
; ==========================================================================
flood_fill:
    ; Check seed in bounds and not already set
    ld a, (ff_seed_y)
    cp 192
    ret nc
    ld a, (ff_seed_x)
    ld e, a
    ld a, (ff_seed_y)
    ld d, a
    call check_pixel
    or a
    ret nz                      ; pixel already set, abort

    ; Clear visited bitmap
    call clear_visited

    ; Init stack pointer (index into flood_stack, each entry = 2 bytes)
    xor a
    ld (ff_sp), a
    ld (ff_sp+1), a

    ; Push seed
    ld a, (ff_seed_x)
    ld (ff_push_x), a
    ld a, (ff_seed_y)
    ld (ff_push_y), a
    call ff_push

.main_loop:
    ; Check if stack empty
    ld hl, (ff_sp)
    ld a, h
    or l
    ret z                       ; stack empty, done

    ; Pop (x, y)
    call ff_pop

    ; Check bounds and visited/pixel
    ld a, (ff_pop_y)
    cp 192
    jp nc, .main_loop
    ld a, (ff_pop_x)
    ld e, a
    ld a, (ff_pop_y)
    ld d, a
    call check_visited_or_pixel
    or a
    jp nz, .main_loop           ; already visited or boundary

    ; Find left extent of span
    ld a, (ff_pop_x)
    ld (ff_lx), a
.scan_left:
    ld a, (ff_lx)
    or a
    jr z, .left_done
    dec a
    ld e, a
    ld a, (ff_pop_y)
    ld d, a
    call check_visited_or_pixel
    or a
    jr nz, .left_done
    ld a, (ff_lx)
    dec a
    ld (ff_lx), a
    jr .scan_left
.left_done:

    ; Find right extent of span
    ld a, (ff_pop_x)
    ld (ff_rx), a
.scan_right:
    ld a, (ff_rx)
    cp 255
    jr z, .right_done
    inc a
    ld e, a
    ld a, (ff_pop_y)
    ld d, a
    call check_visited_or_pixel
    or a
    jr nz, .right_done
    ld a, (ff_rx)
    inc a
    ld (ff_rx), a
    jr .scan_right
.right_done:

    ; Fill span with pattern and mark visited
    call fill_span_fast
    call mark_visited_span

    ; --- Seed row above (y-1) ---
    ld a, (ff_pop_y)
    or a
    jr z, .skip_above
    dec a
    ld (ff_push_y), a
    ld a, (ff_lx)
    ld (ff_fill_x), a
    ld a, 1
    ld (ff_was_blocked), a      ; start as "blocked"
.above_loop:
    ld a, (ff_fill_x)
    ld b, a
    ld a, (ff_rx)
    cp b
    jr c, .skip_above           ; past end
    ld a, (ff_fill_x)
    ld e, a
    ld a, (ff_push_y)
    ld d, a
    call check_visited_or_pixel
    or a
    jr nz, .above_blocked
    ; Pixel is clear — if was_blocked, push this as seed
    ld a, (ff_was_blocked)
    or a
    jr z, .above_next           ; already in a clear run, skip
    ; Transition: blocked → clear — push seed
    ld a, (ff_fill_x)
    ld (ff_push_x), a
    call ff_push
    xor a
    ld (ff_was_blocked), a
    jr .above_next
.above_blocked:
    ld a, 1
    ld (ff_was_blocked), a
.above_next:
    ld a, (ff_fill_x)
    inc a
    jr z, .skip_above              ; wrapped 255→0, exit loop
    ld (ff_fill_x), a
    jr .above_loop
.skip_above:

    ; --- Seed row below (y+1) ---
    ld a, (ff_pop_y)
    cp 191
    jr nc, .skip_below
    inc a
    ld (ff_push_y), a
    ld a, (ff_lx)
    ld (ff_fill_x), a
    ld a, 1
    ld (ff_was_blocked), a
.below_loop:
    ld a, (ff_fill_x)
    ld b, a
    ld a, (ff_rx)
    cp b
    jr c, .skip_below
    ld a, (ff_fill_x)
    ld e, a
    ld a, (ff_push_y)
    ld d, a
    call check_visited_or_pixel
    or a
    jr nz, .below_blocked
    ld a, (ff_was_blocked)
    or a
    jr z, .below_next
    ld a, (ff_fill_x)
    ld (ff_push_x), a
    call ff_push
    xor a
    ld (ff_was_blocked), a
    jr .below_next
.below_blocked:
    ld a, 1
    ld (ff_was_blocked), a
.below_next:
    ld a, (ff_fill_x)
    inc a
    jr z, .skip_below              ; wrapped 255→0, exit loop
    ld (ff_fill_x), a
    jr .below_loop
.skip_below:

    jp .main_loop

; --- flood fill stack helpers ---
; ff_push: push (ff_push_x, ff_push_y) onto flood_stack
ff_push:
    ld hl, (ff_sp)
    ; Check stack overflow (max 256 entries = 512 bytes)
    ld a, h
    cp 2                        ; 512 = 0x0200
    ret nc                      ; overflow, drop
    ld de, flood_stack
    add hl, de
    ld a, (ff_push_x)
    ld (hl), a
    inc hl
    ld a, (ff_push_y)
    ld (hl), a
    ld hl, (ff_sp)
    inc hl
    inc hl
    ld (ff_sp), hl
    ret

; ff_pop: pop (x, y) into ff_pop_x, ff_pop_y
ff_pop:
    ld hl, (ff_sp)
    dec hl
    dec hl
    ld (ff_sp), hl
    ld de, flood_stack
    add hl, de
    ld a, (hl)
    ld (ff_pop_x), a
    inc hl
    ld a, (hl)
    ld (ff_pop_y), a
    ret

; ==========================================================================
; clear_visited — zero the 768-byte visited bitmap (4 bytes × 192 rows)
; ==========================================================================
clear_visited:
    ld hl, ff_visited
    ld de, ff_visited + 1
    ld bc, 767
    ld (hl), 0
    ldir
    ret

; ==========================================================================
; mark_visited_span — mark columns covering ff_lx..ff_rx at ff_pop_y
; Column-level visited bitmap: 4 bytes per row × 192 rows = 768 bytes.
; For column C (0-31) on row Y: byte at ff_visited + Y*4 + (C>>3),
; bit (C & 7) using bit_masks table.
; ==========================================================================
mark_visited_span:
    ld a, (ff_pop_y)
    cp 192
    ret nc

    ; Compute row base address: ff_visited + Y * 4
    ld l, a
    ld h, 0                         ; HL = Y
    add hl, hl
    add hl, hl                      ; HL = Y * 4
    ld de, ff_visited
    add hl, de                      ; HL = ff_visited + Y*4
    ld (mvs_row_base), hl

    ; Set bits for each column from ffs_left_col to ffs_right_col
    ld a, (ffs_left_col)
    ld c, a                         ; C = current column
.mvs_loop:
    ; Compute byte offset within row: C >> 3
    ld a, c
    rrca
    rrca
    rrca
    and 0x03                        ; byte index (0-3)
    ld e, a
    ld d, 0
    ld hl, (mvs_row_base)
    add hl, de                      ; HL = byte address

    ; Compute bit mask: bit_masks[C & 7]
    ld a, c
    and 0x07
    push hl
    push bc
    ld c, a
    ld b, 0
    ld hl, bit_masks
    add hl, bc
    ld a, (hl)                      ; A = bit mask
    pop bc
    pop hl

    ; Set bit
    or (hl)
    ld (hl), a

    ; Next column
    ld a, (ffs_right_col)
    cp c
    ret z                           ; done
    inc c
    jr .mvs_loop

; mark_visited_span temporaries
mvs_row_base:   dw 0

; ==========================================================================
; check_visited_or_pixel — test if pixel at (E=x, D=y) is set in screen
; OR in visited bitmap. Returns: A = 1 if either set, 0 if both clear.
; Column-level visited: byte at ff_visited + Y*4 + (col>>3), bit (col&7)
; where col = X >> 3.
; ==========================================================================
check_visited_or_pixel:
    ; First check screen pixel
    call check_pixel
    or a
    ret nz                          ; screen pixel set, return 1

    ; Check column-level visited bitmap
    ld a, d
    cp 192
    jr nc, .cvp_oob

    ; Row base address: ff_visited + Y * 4
    push de
    ld l, d
    ld h, 0                         ; HL = Y
    add hl, hl
    add hl, hl                      ; HL = Y * 4
    ld de, ff_visited
    add hl, de                      ; HL = ff_visited + Y*4
    pop de

    ; Byte offset within row: column >> 3 = (X >> 3) >> 3 = X >> 6
    ld a, e                         ; X
    rlca
    rlca
    and 0x03                        ; X >> 6 = byte index (0-3)
    ld c, a
    ld b, 0
    add hl, bc                      ; HL = byte address

    ; Bit mask: bit_masks[(X >> 3) & 7] = bit_masks[(col) & 7]
    ld a, e
    rrca
    rrca
    rrca
    and 0x07                        ; (X >> 3) & 7
    ld c, a
    ld b, 0
    push hl
    ld hl, bit_masks
    add hl, bc
    ld a, (hl)
    pop hl

    ; Test column bit
    and (hl)
    jr z, .cvp_clear
    ld a, 1
    ret
.cvp_clear:
    xor a
    ret
.cvp_oob:
    ld a, 1
    ret

; ==========================================================================
; fill_span_fast — fill span ff_lx..ff_rx at ff_pop_y with pattern
; Also sets attributes for the span.
; ==========================================================================
fill_span_fast:
    ld a, (ff_pop_y)
    cp 192
    ret nc

    ; Compute pattern row byte for this Y
    ld a, (cur_pat)
    rlca
    rlca
    rlca                            ; A = cur_pat * 8
    ld c, a
    ld a, (ff_pop_y)
    and 0x07                        ; Y & 7
    or c                            ; offset = pat*8 + (y&7)
    ld c, a
    ld b, 0
    ld hl, patterns
    add hl, bc
    ld a, (hl)
    ld (ffs_pat_row), a             ; save pattern row byte

    ; Compute screen row H byte
    ld a, (ff_pop_y)
    ld d, a
    and 0x07
    ld h, a
    ld a, d
    and 0xC0
    rrca
    rrca
    rrca
    or h
    or 0x40
    ld (ffs_h), a

    ; L row-base
    ld a, d
    and 0x38
    rlca
    rlca
    ld (ffs_l_base), a

    ; Compute left and right columns
    ld a, (ff_lx)
    rrca
    rrca
    rrca
    and 0x1F
    ld (ffs_left_col), a

    ld a, (ff_rx)
    rrca
    rrca
    rrca
    and 0x1F
    ld (ffs_right_col), a

    ; Check if single-column span
    ld a, (ffs_left_col)
    ld b, a
    ld a, (ffs_right_col)
    cp b
    jr nz, .fsf_multi

    ; Single column: combine left and right masks, AND with pattern
    ld a, (ff_lx)
    and 0x07
    ld c, a
    ld b, 0
    ld hl, left_masks
    add hl, bc
    ld a, (hl)
    ld (ffs_tmp), a

    ld a, (ff_rx)
    and 0x07
    ld c, a
    ld b, 0
    ld hl, right_masks
    add hl, bc
    ld a, (hl)
    ld b, a
    ld a, (ffs_tmp)
    and b                           ; combined mask
    ld b, a
    ld a, (ffs_pat_row)
    and b                           ; AND with pattern

    ; OR into screen byte
    ld b, a
    ld a, (ffs_h)
    ld h, a
    ld a, (ffs_l_base)
    ld c, a
    ld a, (ffs_left_col)
    or c
    ld l, a
    ld a, b
    or (hl)
    ld (hl), a
    jp .fsf_set_attrs

.fsf_multi:
    ; Left edge partial byte
    ld a, (ff_lx)
    and 0x07
    jr z, .fsf_left_full

    ld c, a
    ld b, 0
    ld hl, left_masks
    add hl, bc
    ld a, (hl)                      ; A = left mask
    ld b, a
    ld a, (ffs_pat_row)
    and b                           ; AND with pattern
    ld b, a                         ; B = masked pattern bits

    ld a, (ffs_h)
    ld h, a
    ld a, (ffs_l_base)
    ld c, a
    ld a, (ffs_left_col)
    or c
    ld l, a
    ld a, b
    or (hl)
    ld (hl), a

    ld a, (ffs_left_col)
    inc a
    ld (ffs_cur_col), a
    jr .fsf_middle

.fsf_left_full:
    ld a, (ffs_left_col)
    ld (ffs_cur_col), a

.fsf_middle:
    ; Fill middle full bytes with pattern row
    ld a, (ffs_cur_col)
    ld b, a
    ld a, (ffs_right_col)
    cp b
    jr z, .fsf_right_edge
    jr c, .fsf_right_edge

    ld a, (ffs_h)
    ld h, a
    ld a, (ffs_l_base)
    ld c, a
    ld a, (ffs_cur_col)
    or c
    ld l, a
    ld a, (ffs_pat_row)
    ld b, a                         ; B = pattern row byte
.fsf_mid_loop:
    ld a, b
    or (hl)                         ; OR pattern into screen byte
    ld (hl), a
    inc l
    ld a, (ffs_cur_col)
    inc a
    ld (ffs_cur_col), a
    ld c, a
    ld a, (ffs_right_col)
    cp c
    jr nz, .fsf_mid_loop

.fsf_right_edge:
    ; Right edge partial byte
    ld a, (ff_rx)
    and 0x07
    cp 7
    jr z, .fsf_right_full

    ld a, (ff_rx)
    and 0x07
    ld c, a
    ld b, 0
    ld hl, right_masks
    add hl, bc
    ld a, (hl)                      ; A = right mask
    ld b, a
    ld a, (ffs_pat_row)
    and b                           ; AND with pattern
    ld b, a                         ; B = masked pattern bits

    ld a, (ffs_h)
    ld h, a
    ld a, (ffs_l_base)
    ld c, a
    ld a, (ffs_right_col)
    or c
    ld l, a
    ld a, b
    or (hl)
    ld (hl), a
    jr .fsf_set_attrs

.fsf_right_full:
    ld a, (ffs_h)
    ld h, a
    ld a, (ffs_l_base)
    ld c, a
    ld a, (ffs_right_col)
    or c
    ld l, a
    ld a, (ffs_pat_row)
    or (hl)
    ld (hl), a

.fsf_set_attrs:
    ; Set attributes for columns in span
    ld a, (ff_pop_y)
    and 0xF8
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl                      ; HL = (Y/8)*32
    ld a, h
    or 0x58
    ld h, a
    ld a, (cur_attr)
    ld b, a
    ld a, (ffs_left_col)
    ld c, a
    ld a, l
    or c
    ld l, a
.fsf_attr_loop:
    ld (hl), b
    ld a, c
    cp 31
    jr z, .fsf_attr_done
    ld a, (ffs_right_col)
    cp c
    jr z, .fsf_attr_done
    inc c
    inc l
    jr .fsf_attr_loop
.fsf_attr_done:
    ret

; ==========================================================================
; check_pixel — test if pixel at (E=x, D=y) is set
; Returns: A = 1 if set, 0 if clear
; ==========================================================================
check_pixel:
    ld a, d
    cp 192
    jr nc, .oob
    ; Calculate screen address
    ld a, d
    and 0x07
    ld h, a
    ld a, d
    and 0xC0
    rrca
    rrca
    rrca
    or h
    or 0x40
    ld h, a
    ld a, d
    and 0x38
    rlca
    rlca
    ld l, a
    ld a, e
    rrca
    rrca
    rrca
    and 0x1F
    or l
    ld l, a
    ; Get bit mask
    ld a, e
    and 0x07
    push hl
    ld c, a
    ld b, 0
    ld hl, bit_masks
    add hl, bc
    ld a, (hl)
    pop hl
    ; Test pixel
    and (hl)
    jr z, .clear
    ld a, 1
    ret
.clear:
    xor a
    ret
.oob:
    ld a, 1                     ; out of bounds = "set" (boundary)
    ret
    ELSE
op_flood_abs:
    or 1
    ret
    ENDIF

; ==========================================================================
; CALL (0x7B) — +1 asset index
; Pushes return address, jumps to shape script asset
; ==========================================================================
op_call:
    call read_u8
    ld (sp_idx), a
    ; Look up asset address from asset_table
    ld a, (sp_idx)
    add a, a                    ; *2 (table entries are 2 bytes)
    ld c, a
    ld b, 0
    ld hl, asset_table
    add hl, bc
    ld e, (hl)
    inc hl
    ld d, (hl)                  ; DE = asset data address
    ; Push return address (current vm_pc)
    push de                     ; save asset address
    ld hl, (vm_pc)              ; HL = return address
    ex de, hl                   ; DE = return address
    ld a, (call_sp)
    ld c, a
    ld b, 0
    ld hl, call_stk
    add hl, bc                  ; HL = &call_stk[call_sp]
    ld (hl), e
    inc hl
    ld (hl), d
    ld a, (call_sp)
    add a, 2
    ld (call_sp), a
    pop de                      ; DE = asset data address
    ; Jump to asset
    ld (vm_pc), de
    or 1
    ret

    IFDEF ZGS_USE_STAMPS
; ==========================================================================
; STAMP_ABS (0x78) — +1 asset index +2 abs pos
; ==========================================================================
op_stamp_abs:
    call read_u8
    ld (sp_idx), a
    call read_abs               ; E = screen X, D = screen Y
    ld a, e
    ld (pen_x), a
    ld (sp_x), a
    ld a, d
    ld (pen_y), a
    ld (sp_y), a
    call stamp_asset
    or 1
    ret

; ==========================================================================
; STAMP_CHAIN (0x79) — +1 asset index (position = pen)
; ==========================================================================
op_stamp_chain:
    call read_u8
    ld (sp_idx), a
    ld a, (pen_x)
    ld (sp_x), a
    ld a, (pen_y)
    ld (sp_y), a
    call stamp_asset
    or 1
    ret

; ==========================================================================
; stamp_asset — render sprite asset at (sp_x, sp_y)
; Asset index in sp_idx. Only handles sprite type (type=0).
; For shape scripts, use CALL instead.
; ==========================================================================
stamp_asset:
    ; Look up asset address
    ld a, (sp_idx)
    add a, a
    ld c, a
    ld b, 0
    ld hl, asset_table
    add hl, bc
    ld e, (hl)
    inc hl
    ld d, (hl)                  ; DE = asset data start
    ; Read sprite header: width_chars, height_rows
    ld a, (de)
    ld (sp_wchars), a
    inc de
    ld a, (de)
    ld (sp_hrows), a
    inc de
    ; DE now points to bitmap data
    ; Render: for each row, for each char, for each bit
    ld a, (sp_y)
    ld (sp_cur_y), a
    ld a, (sp_hrows)
    or a
    ret z
    ld b, a
.row_loop:
    push bc
    ld a, (sp_x)
    ld (sp_cur_x), a
    ld a, (sp_wchars)
    ld b, a
.char_loop:
    push bc
    ld a, (de)                  ; byte
    inc de
    push de
    ; Process 8 bits
    ld b, 8
    ld c, a                     ; save byte
.bit_loop:
    bit 7, c
    jr z, .no_plot
    push bc                     ; save bit counter (B) and bitmap byte (C)
    ld a, (sp_cur_x)
    ld e, a
    ld a, (sp_cur_y)
    ld d, a
    call plot_pixel
    pop bc                      ; restore B and C
.no_plot:
    sla c
    ld a, (sp_cur_x)
    inc a
    ld (sp_cur_x), a
    djnz .bit_loop
    pop de
    pop bc
    djnz .char_loop
    ld a, (sp_cur_y)
    inc a
    ld (sp_cur_y), a
    pop bc
    djnz .row_loop
    ret
    ELSE
op_stamp_abs:
op_stamp_chain:
    or 1
    ret
    ENDIF

; ==========================================================================
; MATH HELPERS
; ==========================================================================

; Unsigned multiply: H * E → HL
umul_he:
    ld d, 0
    ld l, d
    ld b, 8
.loop:
    add hl, hl
    jr nc, .skip
    add hl, de
.skip:
    djnz .loop
    ret

; Unsigned divide: HL / C → L quotient, A remainder
udiv_hlc:
    xor a
    ld b, 16
.loop:
    add hl, hl
    rla
    cp c
    jr c, .skip
    sub c
    inc l
.skip:
    djnz .loop
    ret

; ==========================================================================
; BYTE STREAM READER
; ==========================================================================
read_u8:
    ld hl, (vm_pc)
    ld a, (hl)
    inc hl
    ld (vm_pc), hl
    ret

    IFDEF ZGS_HAS_DRAWING
; read_abs: returns E = screen X, D = screen Y
read_abs:
    call read_u8
    and 0x7F
    add a, a                    ; logical * 2 = screen
    ld e, a
    call read_u8
    and 0x7F
    add a, a
    ld d, a
    ret

; read_dshort: reads 1 DSHORT byte → E = dx_screen, D = dy_screen
;   high nibble = signed dx, low nibble = signed dy (each ±7)
read_dshort:
    call read_u8
    ld b, a                     ; save
    ; dx = high nibble, sign-extended
    sra a
    sra a
    sra a
    sra a                       ; A = signed high nibble (-8..+7)
    add a, a                    ; *2 screen
    ld e, a
    ; dy = low nibble, sign-extended
    ld a, b
    and 0x0F
    bit 3, a
    jr z, .dy_pos
    or 0xF0                     ; sign extend
.dy_pos:
    add a, a                    ; *2 screen
    ld d, a
    ret

; read_dmed: reads 2 signed bytes → E = dx_screen, D = dy_screen
read_dmed:
    call read_u8
    add a, a                    ; *2
    ld e, a
    call read_u8
    add a, a                    ; *2
    ld d, a
    ret
    ENDIF ; ZGS_HAS_DRAWING

    IFDEF ZGS_USE_LINES
; ==========================================================================
; BRESENHAM LINE from (pen_x, pen_y) to (tmp_x2, tmp_y2)
; Uses 16-bit signed error accumulator
; ==========================================================================
draw_line:
    ; Load endpoints
    ld a, (pen_x)
    ld (line_x), a
    ld a, (pen_y)
    ld (line_y), a

    ; dx = abs(x2 - x1), sx = sign
    ld a, (tmp_x2)
    ld b, a
    ld a, (line_x)
    sub b                       ; A = x1 - x2
    jr nc, .x1_ge_x2
    ; x1 < x2: dx = x2 - x1, sx = +1
    neg
    ld (line_dx), a
    ld a, 1
    ld (line_sx), a
    jr .calc_dy
.x1_ge_x2:
    ; x1 >= x2: dx = x1 - x2, sx = -1
    ld (line_dx), a
    ld a, 0xFF
    ld (line_sx), a

.calc_dy:
    ; dy = abs(y2 - y1), sy = sign
    ld a, (tmp_y2)
    ld b, a
    ld a, (line_y)
    sub b                       ; A = y1 - y2
    jr nc, .y1_ge_y2
    neg
    ld (line_dy), a
    ld a, 1
    ld (line_sy), a
    jr .calc_err
.y1_ge_y2:
    ld (line_dy), a
    ld a, 0xFF
    ld (line_sy), a

.calc_err:
    ; err = dx - dy (16-bit signed)
    ld a, (line_dx)
    ld l, a
    ld h, 0
    ld a, (line_dy)
    ld e, a
    ld d, 0
    or a
    sbc hl, de
    ld (line_err), hl

.pixel_loop:
    ; Plot current point
    ld a, (line_y)
    ld d, a
    ld a, (line_x)
    ld e, a
    call plot_pixel

    ; Check if we reached the endpoint
    ld a, (line_x)
    ld b, a
    ld a, (tmp_x2)
    cp b
    jr nz, .not_done
    ld a, (line_y)
    ld b, a
    ld a, (tmp_y2)
    cp b
    ret z                       ; done

.not_done:
    ; e2 = 2 * err
    ld hl, (line_err)
    add hl, hl
    ld (line_e2), hl

    ; if e2 > -dy: err -= dy, x += sx
    ;   equivalent to: e2 + dy > 0  (since -dy is negative)
    ld hl, (line_e2)
    ld a, (line_dy)
    ld e, a
    ld d, 0
    add hl, de                  ; HL = e2 + dy
    bit 7, h
    jr nz, .skip_x              ; e2 + dy < 0, skip
    ld a, h
    or l
    jr z, .skip_x               ; e2 + dy == 0, skip
    ; Apply X step
    ld hl, (line_err)
    ld a, (line_dy)
    ld e, a
    ld d, 0
    or a
    sbc hl, de
    ld (line_err), hl
    ld a, (line_x)
    ld b, a
    ld a, (line_sx)
    add a, b
    ld (line_x), a
.skip_x:

    ; if e2 < dx: err += dx, y += sy
    ;   equivalent to: e2 - dx < 0
    ld hl, (line_e2)
    ld a, (line_dx)
    ld e, a
    ld d, 0
    or a
    sbc hl, de                  ; HL = e2 - dx
    bit 7, h
    jr z, .skip_y               ; e2 - dx >= 0, skip
    ; Apply Y step
    ld hl, (line_err)
    ld a, (line_dx)
    ld e, a
    ld d, 0
    add hl, de
    ld (line_err), hl
    ld a, (line_y)
    ld b, a
    ld a, (line_sy)
    add a, b
    ld (line_y), a
.skip_y:
    jp .pixel_loop
    ENDIF

    IFDEF ZGS_USE_FLOOD
; fill_span_fast temporaries (used by flood_fill routines above)
ffs_h:          db 0
ffs_l_base:     db 0
ffs_left_col:   db 0
ffs_right_col:  db 0
ffs_cur_col:    db 0
ffs_tmp:        db 0
ffs_pat_row:    db 0
    ENDIF

    IFDEF ZGS_HAS_DRAWING
; ==========================================================================
; PLOT PIXEL with pattern check at (E=x, D=y)
; Used by fill operations. Skips pixel if pattern bit is 0.
; ==========================================================================
plot_pixel_pat:
    ; Look up pattern row byte: patterns[cur_pat*8 + (y & 7)]
    push de
    ld a, (cur_pat)
    rlca
    rlca
    rlca                            ; A = cur_pat * 8
    ld c, a
    ld a, d                         ; Y
    and 0x07                        ; y & 7
    or c                            ; offset = pat*8 + (y&7)
    ld c, a
    ld b, 0
    ld hl, patterns
    add hl, bc
    ld b, (hl)                      ; B = pattern row byte

    ; Get bit mask for X position: bit_masks[x & 7]
    ld a, e                         ; X
    and 0x07
    ld e, a
    ld d, 0
    ld hl, bit_masks
    add hl, de
    ld a, (hl)                      ; A = bit mask (0x80 >> (x&7))

    ; Test pattern bit
    and b
    pop de
    ret z                           ; pattern bit is 0, skip pixel
    jp plot_pixel                   ; pattern bit is 1, plot it

; ==========================================================================
; PLOT PIXEL at (E=x, D=y) + set attribute
; ==========================================================================
plot_pixel:
    ld a, d
    cp 192
    ret nc                      ; Y out of bounds

    ; --- Calculate screen byte address ---
    ; High byte: 010 T1T0 S2S1S0
    ;   Y bits 7-6 = T1T0, bits 2-0 = S2S1S0
    ; Low byte: R2R1R0 C4C3C2C1C0
    ;   Y bits 5-3 = R2R1R0, X>>3 = column

    ld a, d                     ; Y
    and 0x07                    ; S2S1S0
    ld h, a
    ld a, d
    and 0xC0                    ; T1T0 in bits 7-6
    rrca
    rrca
    rrca                        ; T1T0 now in bits 4-3
    or h
    or 0x40                     ; 010xxxxx
    ld h, a                     ; H = high byte

    ld a, d                     ; Y
    and 0x38                    ; R2R1R0 in bits 5-3
    rlca
    rlca                        ; R2R1R0 now in bits 7-5
    ld l, a
    ld a, e                     ; X
    rrca
    rrca
    rrca
    and 0x1F                    ; column = X >> 3
    or l
    ld l, a                     ; L = low byte

    ; --- Get bit mask ---
    ld a, e
    and 0x07
    ld c, a
    ld b, 0
    push hl
    ld hl, bit_masks
    add hl, bc
    ld a, (hl)
    pop hl

    ; --- Set pixel (respects draw_mode) ---
    ld c, a                     ; C = bit mask
    ld a, (draw_mode)
    or a
    ld a, c                     ; A = bit mask (flags unaffected by ld)
    jr nz, .xor_mode
    or (hl)                     ; SET mode: set the bit
    ld (hl), a
    jr .set_attr
.xor_mode:
    xor (hl)                    ; XOR mode: toggle the bit
    ld (hl), a
.set_attr:

    ; --- Set attribute ---
    ; attr address = 0x5800 + (Y/8)*32 + (X/8)
    push de
    ld a, d                     ; Y
    and 0xF8                    ; (Y & 0xF8)
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl                  ; HL = (Y/8) * 32 (since (Y&F8)*4 = Y/8*32)
    ld a, e                     ; X
    rrca
    rrca
    rrca
    and 0x1F                    ; X / 8
    or l
    ld l, a
    ld a, h
    or 0x58                     ; 0x5800 base
    ld h, a
    ld a, (cur_attr)
    ld (hl), a
    pop de
    ret

; ==========================================================================
; DATA — drawing tables
; ==========================================================================
bit_masks:
    db 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01

; ==========================================================================
; 8x8 fill patterns (8 bytes each, indexed by cur_pat 0..7)
; Each row byte: bit 7 = leftmost pixel, bit 0 = rightmost pixel
; ==========================================================================
patterns:
    ; 0: solid
    db 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
    ; 1: empty
    db 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ; 2: checker 50%
    db 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55
    ; 3: dots 25%
    db 0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22
    ; 4: dots 12%
    db 0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00
    ; 5: horizontal stripes
    db 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00
    ; 6: vertical stripes
    db 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA
    ; 7: diagonal
    db 0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81

; Left masks: bits from position X%8 to bit 0 (rightward)
; left_masks[n] = 0xFF >> n  (bits from n to 7 within byte are SET)
; e.g. n=0: 0xFF, n=1: 0x7F, n=3: 0x1F, n=7: 0x01
left_masks:
    db 0xFF, 0x7F, 0x3F, 0x1F, 0x0F, 0x07, 0x03, 0x01

; Right masks: bits from bit 7 to position X%8 (leftward)
; right_masks[n] = 0xFF << (7 - n)  (bits from 7 down to n are SET)
; e.g. n=0: 0x80, n=1: 0xC0, n=6: 0xFE, n=7: 0xFF
right_masks:
    db 0x80, 0xC0, 0xE0, 0xF0, 0xF8, 0xFC, 0xFE, 0xFF
    ENDIF ; ZGS_HAS_DRAWING

; ==========================================================================
; VARIABLES
; ==========================================================================
pen_x:      db 0
pen_y:      db 0
cur_attr:   db 0x07             ; default: white ink, black paper
cur_pat:    db 0
draw_mode:  db 0                ; 0 = SET, 1 = XOR
vm_pc:      dw 0
zgs_base:   dw 0                ; base address of current ZGS data

; Text cursor (32-col)
cursor_col: db 0
cursor_row: db 0
; Text cursor (42-col)
cursor_col_42: db 0
cursor_row_42: db 0
; Text cursor (64-col)
cursor_col_64: db 0
cursor_row_64: db 0
    IFDEF ZGS_USE_TEXT
txt_len:    db 0
txt_char:   db 0
    ENDIF
    IFDEF ZGS_USE_TEXT_42
; 42-col text temporaries
p42_pixel_x:    db 0
p42_bit_off:    db 0
p42_byte_col:   db 0
    ENDIF
    IFDEF ZGS_USE_TEXT_64
; 64-col text temporaries
p64_byte_col:   db 0
p64_is_odd:     db 0
    ENDIF
    IFDEF ZGS_USE_PACKED_TEXT
; Packed text temporaries
pp_len:         db 0
pp_mode:        db 0            ; 0=32col, 1=42col, 2=64col
pp_bi_count:    db 0
pp_tri_count:   db 0
pp_word_count:  db 0
pp_bi_base:     dw 0
pp_tri_base:    dw 0
pp_woff_base:   dw 0
pp_wdata_base:  dw 0
    ENDIF

    IFDEF ZGS_USE_LINES
; Line drawing temporaries
tmp_x2:     db 0
tmp_y2:     db 0
line_x:     db 0
line_y:     db 0
line_dx:    db 0
line_dy:    db 0
line_sx:    db 0
line_sy:    db 0
line_err:   dw 0
line_e2:    dw 0
    ENDIF

    IFDEF ZGS_USE_RECTS
; Rectangle temporaries
rect_x:         db 0
rect_y:         db 0
rect_w:         db 0
rect_h:         db 0
rect_save_px:   db 0
rect_save_py:   db 0
rf_cur_x:       db 0
rf_cur_y:       db 0
rf_cols:        db 0
rf_rows:        db 0
; Clear region temporaries
cr_col:         db 0
cr_row:         db 0
cr_width:       db 0
cr_height:      db 0
cr_attr:        db 0
cr_cur_row:     db 0
cr_pixel_y:     db 0
    ENDIF

; Repeat temporaries
rep_count:      db 0
rep_sdx:        db 0
rep_sdy:        db 0
rep_blen:       db 0
rep_body_start: dw 0
rep_body_end:   dw 0
rep_base_x:     db 0
rep_base_y:     db 0

    IFDEF ZGS_USE_POLYGONS
; Polygon temporaries
poly_count:     db 0
poly_verts:     ds 64           ; up to 32 vertices (x,y pairs)
pf_min_y:       db 0
pf_max_y:       db 0
pf_cur_y:       db 0
pf_x0:          db 0
pf_y0:          db 0
pf_x1:          db 0
pf_y1:          db 0
pf_dy_num:      db 0
pf_dx_edge:     db 0
pf_dy_edge:     db 0
pf_dx_abs:      db 0
pf_dx_sign:     db 0
pf_isect_count: db 0
pf_isects:      ds 32           ; up to 32 intersections per scanline
pf_fill_x:      db 0
    ENDIF

; Header / asset library
file_flags:     db 0
asset_lib_off:  dw 0
num_assets:     db 0
asset_table:    ds 32           ; up to 16 assets * 2 bytes (address)

; Call stack
call_stk:       ds 16           ; 8 levels * 2 bytes
call_sp:        db 0            ; stack pointer (byte offset)

    IFDEF ZGS_USE_CIRCLES
; Circle temporaries
circ_cx:        db 0
circ_cy:        db 0
circ_r:         db 0
co_x:           db 0
co_y:           db 0
co_err:         dw 0
; Circle fill span
cf_span_x:      db 0
cf_span_end:    db 0
cf_span_y:      db 0
    ENDIF

    IFDEF ZGS_USE_ELLIPSES
; Ellipse temporaries
ell_cx:         db 0
ell_cy:         db 0
ell_rx:         db 0
ell_ry:         db 0
eo_x:           db 0
eo_y:           db 0
eo_err:         dw 0
eo_rx2:         dw 0
eo_ry2:         dw 0
eo_px:          dw 0
eo_py:          dw 0
ell_halfW:      ds 192          ; max ry = 192 (screen height)
    ENDIF

    IFDEF ZGS_USE_FLOOD
; Flood fill
ff_seed_x:      db 0
ff_seed_y:      db 0
ff_sp:          dw 0            ; stack pointer (byte offset into flood_stack)
ff_push_x:      db 0
ff_push_y:      db 0
ff_pop_x:       db 0
ff_pop_y:       db 0
ff_lx:          db 0
ff_rx:          db 0
ff_fill_x:      db 0
ff_was_blocked: db 0
ff_visited:     ds 768          ; column-level visited bitmap (4 bytes × 192 rows)
    ENDIF

; Stamp/call temporaries
sp_idx:         db 0
sp_x:           db 0
sp_y:           db 0
    IFDEF ZGS_USE_STAMPS
sp_wchars:      db 0
sp_hrows:       db 0
sp_cur_x:       db 0
sp_cur_y:       db 0
    ENDIF
`;
