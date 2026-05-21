/**
 * ZX0 compression/decompression library (v2 format)
 * Based on zx0-js by Bedazzle (https://github.com/Bedazzle/zx0-js)
 * Original algorithm by Einar Saukas (https://github.com/einar-saukas/ZX0)
 * @ts-check
 */
"use strict";

const ZX0 = (() => {
  const MAX_OFFSET_ZX0 = 32640;
  const MAX_OFFSET_ZX7 = 2176;
  const INITIAL_OFFSET = 1;

  function elias_gamma_bits(value) {
    let bits = 1;
    while (value >>= 1)
      bits += 2;
    return bits;
  }

  function offset_ceiling(index, offset_limit) {
    return index > offset_limit ? offset_limit : index < INITIAL_OFFSET ? INITIAL_OFFSET : index;
  }

  function optimize(input_data, input_size, skip, offset_limit) {
    const max_offset_start = offset_ceiling(input_size - 1, offset_limit);

    const last_literal = new Array(max_offset_start + 1).fill(null);
    const last_match = new Array(max_offset_start + 1).fill(null);
    const optimal = new Array(input_size).fill(null);
    const match_length = new Int32Array(max_offset_start + 1);
    const best_length = new Int32Array(input_size);

    if (input_size > 2)
      best_length[2] = 2;

    function allocate(bits, index, offset, chain) {
      return { bits, index, offset, chain };
    }

    last_match[INITIAL_OFFSET] = allocate(-1, skip - 1, INITIAL_OFFSET, null);

    for (let index = skip; index < input_size; index++) {
      let best_length_size = 2;
      const max_offset = offset_ceiling(index, offset_limit);
      for (let offset = 1; offset <= max_offset; offset++) {
        if (index !== skip && index >= offset && input_data[index] === input_data[index - offset]) {
          /* copy from last offset */
          if (last_literal[offset]) {
            const length = index - last_literal[offset].index;
            const bits = last_literal[offset].bits + 1 + elias_gamma_bits(length);
            last_match[offset] = allocate(bits, index, offset, last_literal[offset]);
            if (!optimal[index] || optimal[index].bits > bits)
              optimal[index] = last_match[offset];
          }
          /* copy from new offset */
          match_length[offset]++;
          if (match_length[offset] > 1) {
            if (best_length_size < match_length[offset]) {
              let bits = optimal[index - best_length[best_length_size]].bits + elias_gamma_bits(best_length[best_length_size] - 1);
              do {
                best_length_size++;
                const bits2 = optimal[index - best_length_size].bits + elias_gamma_bits(best_length_size - 1);
                if (bits2 <= bits) {
                  best_length[best_length_size] = best_length_size;
                  bits = bits2;
                } else {
                  best_length[best_length_size] = best_length[best_length_size - 1];
                }
              } while (best_length_size < match_length[offset]);
            }
            const length = best_length[match_length[offset]];
            const bits = optimal[index - length].bits + 8 + elias_gamma_bits(((offset - 1) / 128 | 0) + 1) + elias_gamma_bits(length - 1);
            if (!last_match[offset] || last_match[offset].index !== index || last_match[offset].bits > bits) {
              last_match[offset] = allocate(bits, index, offset, optimal[index - length]);
              if (!optimal[index] || optimal[index].bits > bits)
                optimal[index] = last_match[offset];
            }
          }
        } else {
          /* copy literals */
          match_length[offset] = 0;
          if (last_match[offset]) {
            const length = index - last_match[offset].index;
            const bits = last_match[offset].bits + 1 + elias_gamma_bits(length) + length * 8;
            last_literal[offset] = allocate(bits, index, 0, last_match[offset]);
            if (!optimal[index] || optimal[index].bits > bits)
              optimal[index] = last_literal[offset];
          }
        }
      }
    }

    return optimal[input_size - 1];
  }

  function compress(input_data, skip, backwards_mode, classic_mode, quick_mode) {
    const input_size = input_data.length;
    const offset_limit = quick_mode ? MAX_OFFSET_ZX7 : MAX_OFFSET_ZX0;
    const invert_mode = !classic_mode && !backwards_mode;

    const optimal_block = optimize(input_data, input_size, skip, offset_limit);

    /* calculate output size and allocate buffer */
    const output_size = ((optimal_block.bits + 25) / 8) | 0;
    const output_data = new Uint8Array(output_size);

    /* un-reverse optimal sequence */
    let prev = null;
    let cur = optimal_block;
    while (cur) {
      const next = cur.chain;
      cur.chain = prev;
      prev = cur;
      cur = next;
    }

    /* initialize state */
    let diff = output_size - input_size + skip;
    let delta = 0;
    let input_index = skip;
    let output_index = 0;
    let bit_mask = 0;
    let bit_index = 0;
    let backtrack = true;
    let last_offset = INITIAL_OFFSET;

    function read_bytes(n) {
      input_index += n;
      diff += n;
      if (delta < diff) delta = diff;
    }

    function write_byte(value) {
      output_data[output_index++] = value;
      diff--;
    }

    function write_bit(value) {
      if (backtrack) {
        if (value)
          output_data[output_index - 1] |= 1;
        backtrack = false;
      } else {
        if (!bit_mask) {
          bit_mask = 128;
          bit_index = output_index;
          write_byte(0);
        }
        if (value)
          output_data[bit_index] |= bit_mask;
        bit_mask >>= 1;
      }
    }

    function write_interlaced_elias_gamma(value, invert) {
      let i;
      for (i = 2; i <= value; i <<= 1)
        ;
      i >>= 1;
      while (i >>= 1) {
        write_bit(backwards_mode ? 1 : 0);
        write_bit(invert ? !(value & i) ? 1 : 0 : (value & i) ? 1 : 0);
      }
      write_bit(backwards_mode ? 0 : 1);
    }

    /* generate output */
    let node = prev;
    for (let opt = node.chain; opt; node = opt, opt = opt.chain) {
      const length = opt.index - node.index;

      if (!opt.offset) {
        /* copy literals */
        write_bit(0);
        write_interlaced_elias_gamma(length, false);
        for (let i = 0; i < length; i++) {
          write_byte(input_data[input_index]);
          read_bytes(1);
        }
      } else if (opt.offset === last_offset) {
        /* copy from last offset */
        write_bit(0);
        write_interlaced_elias_gamma(length, false);
        read_bytes(length);
      } else {
        /* copy from new offset */
        write_bit(1);
        write_interlaced_elias_gamma(((opt.offset - 1) / 128 | 0) + 1, invert_mode);

        if (backwards_mode)
          write_byte(((opt.offset - 1) % 128) << 1);
        else
          write_byte((127 - (opt.offset - 1) % 128) << 1);

        backtrack = true;
        write_interlaced_elias_gamma(length - 1, false);
        read_bytes(length);

        last_offset = opt.offset;
      }
    }

    /* end marker */
    write_bit(1);
    write_interlaced_elias_gamma(256, invert_mode);

    return { data: output_data, delta };
  }

  function decompress(input_data, backwards_mode, classic_mode) {
    const input_size = input_data.length;
    const output = [];

    let input_index = 0;
    let bit_mask = 0;
    let bit_value = 0;
    let backtrack = false;
    let last_byte = 0;
    let last_offset = INITIAL_OFFSET;

    function read_byte() {
      if (input_index >= input_size)
        throw new Error('Truncated input');
      last_byte = input_data[input_index++];
      return last_byte;
    }

    function read_bit() {
      if (backtrack) {
        backtrack = false;
        return last_byte & 1;
      }
      bit_mask >>= 1;
      if (bit_mask === 0) {
        bit_mask = 128;
        bit_value = read_byte();
      }
      return (bit_value & bit_mask) ? 1 : 0;
    }

    function read_interlaced_elias_gamma(inverted) {
      let value = 1;
      if (backwards_mode) {
        while (read_bit()) {
          value = value << 1 | (read_bit() ^ inverted);
        }
      } else {
        while (!read_bit()) {
          value = value << 1 | (read_bit() ^ inverted);
        }
      }
      return value;
    }

    function write_bytes(offset, length) {
      for (let i = 0; i < length; i++) {
        output.push(output[output.length - offset]);
      }
    }

    const invert_offset = !classic_mode && !backwards_mode ? 1 : 0;
    let length;

    function copy_from_new_offset() {
      let msb = read_interlaced_elias_gamma(invert_offset);
      if (msb === 256) return false;
      if (backwards_mode)
        last_offset = (msb - 1) * 128 + (read_byte() >> 1) + 1;
      else
        last_offset = msb * 128 - (read_byte() >> 1);
      backtrack = true;
      length = read_interlaced_elias_gamma(0) + 1;
      write_bytes(last_offset, length);
      return true;
    }

    /* state machine matching dzx0.c goto structure */
    let state = 0; /* 0=COPY_LITERALS, 1=COPY_FROM_LAST_OFFSET, 2=COPY_FROM_NEW_OFFSET */
    while (true) {
      if (state === 0) {
        /* COPY_LITERALS */
        length = read_interlaced_elias_gamma(0);
        for (let i = 0; i < length; i++)
          output.push(read_byte());
        if (read_bit()) state = 2;
        else state = 1;
      } else if (state === 1) {
        /* COPY_FROM_LAST_OFFSET */
        length = read_interlaced_elias_gamma(0);
        write_bytes(last_offset, length);
        if (!read_bit()) state = 0;
        else state = 2;
      } else {
        /* COPY_FROM_NEW_OFFSET */
        if (!copy_from_new_offset()) break;
        if (read_bit()) state = 2;
        else state = 0;
      }
    }

    return new Uint8Array(output);
  }

  function reverse(arr, start, end) {
    while (start < end) {
      const tmp = arr[start];
      arr[start] = arr[end];
      arr[end] = tmp;
      start++;
      end--;
    }
  }

  function compressData(inputData, skip, backwards, classic, quick) {
    const data = inputData instanceof Uint8Array ? inputData : new Uint8Array(inputData);
    if (backwards) {
      const reversed = new Uint8Array(data);
      reverse(reversed, 0, reversed.length - 1);
      const result = compress(reversed, skip || 0, true, classic, quick);
      reverse(result.data, 0, result.data.length - 1);
      return result;
    }
    return compress(data, skip || 0, false, classic, quick);
  }

  function decompressData(inputData, backwards, classic) {
    const data = inputData instanceof Uint8Array ? inputData : new Uint8Array(inputData);
    if (backwards) {
      const reversed = new Uint8Array(data);
      reverse(reversed, 0, reversed.length - 1);
      const result = decompress(reversed, true, classic);
      reverse(result, 0, result.length - 1);
      return result;
    }
    return decompress(data, false, classic);
  }

  /**
   * Decompress and return both output data and number of input bytes consumed.
   * Used when decompressing from a stream where subsequent data follows.
   */
  function decompressTracked(input_data, backwards_mode, classic_mode) {
    const input_size = input_data.length;
    const output = [];

    let input_index = 0;
    let bit_mask = 0;
    let bit_value = 0;
    let backtrack = false;
    let last_byte = 0;
    let last_offset = INITIAL_OFFSET;

    function read_byte() {
      if (input_index >= input_size)
        throw new Error('Truncated input');
      last_byte = input_data[input_index++];
      return last_byte;
    }

    function read_bit() {
      if (backtrack) {
        backtrack = false;
        return last_byte & 1;
      }
      bit_mask >>= 1;
      if (bit_mask === 0) {
        bit_mask = 128;
        bit_value = read_byte();
      }
      return (bit_value & bit_mask) ? 1 : 0;
    }

    function read_interlaced_elias_gamma(inverted) {
      let value = 1;
      if (backwards_mode) {
        while (read_bit()) {
          value = value << 1 | (read_bit() ^ inverted);
        }
      } else {
        while (!read_bit()) {
          value = value << 1 | (read_bit() ^ inverted);
        }
      }
      return value;
    }

    function write_bytes(offset, length) {
      for (let i = 0; i < length; i++) {
        output.push(output[output.length - offset]);
      }
    }

    const invert_offset = !classic_mode && !backwards_mode ? 1 : 0;
    let length;

    function copy_from_new_offset() {
      let msb = read_interlaced_elias_gamma(invert_offset);
      if (msb === 256) return false;
      if (backwards_mode)
        last_offset = (msb - 1) * 128 + (read_byte() >> 1) + 1;
      else
        last_offset = msb * 128 - (read_byte() >> 1);
      backtrack = true;
      length = read_interlaced_elias_gamma(0) + 1;
      write_bytes(last_offset, length);
      return true;
    }

    let state = 0;
    while (true) {
      if (state === 0) {
        length = read_interlaced_elias_gamma(0);
        for (let i = 0; i < length; i++)
          output.push(read_byte());
        if (read_bit()) state = 2;
        else state = 1;
      } else if (state === 1) {
        length = read_interlaced_elias_gamma(0);
        write_bytes(last_offset, length);
        if (!read_bit()) state = 0;
        else state = 2;
      } else {
        if (!copy_from_new_offset()) break;
        if (read_bit()) state = 2;
        else state = 0;
      }
    }

    return { data: new Uint8Array(output), bytesRead: input_index };
  }

  function decompressDataTracked(inputData, backwards, classic) {
    const data = inputData instanceof Uint8Array ? inputData : new Uint8Array(inputData);
    if (backwards) {
      const reversed = new Uint8Array(data);
      reverse(reversed, 0, reversed.length - 1);
      const result = decompressTracked(reversed, true, classic);
      reverse(result.data, 0, result.data.length - 1);
      return result;
    }
    return decompressTracked(data, false, classic);
  }

  return {
    compress: compressData,
    decompress: decompressData,
    decompressTracked: decompressDataTracked,
    MAX_OFFSET_ZX0,
    MAX_OFFSET_ZX7
  };
})();
