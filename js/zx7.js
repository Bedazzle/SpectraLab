/**
 * ZX7 compression/decompression library
 * Based on zx7-js by Bedazzle (https://github.com/Bedazzle/zx7-js)
 * Original algorithm by Einar Saukas (https://spectrumcomputing.co.uk/entry/27996/ZX-Spectrum/ZX7)
 * @ts-check
 */
"use strict";

const ZX7 = (() => {
  const MAX_OFFSET = 2176;
  const MAX_LEN = 65536;

  function eliasGammaBits(value) {
    let bits = 1;
    while (value > 1) {
      bits += 2;
      value >>= 1;
    }
    return bits;
  }

  function countBits(offset, len) {
    return 1 + (offset > 128 ? 12 : 8) + eliasGammaBits(len - 1);
  }

  function optimize(inputData, skip = 0) {
    const inputSize = inputData.length;
    const min = new Array(MAX_OFFSET + 1).fill(0);
    const max = new Array(MAX_OFFSET + 1).fill(0);
    const matches = new Array(256 * 256).fill(0);
    const matchSlots = new Array(inputSize).fill(0);
    const optimal = [];

    for (let i = 0; i < inputSize; i++) {
      optimal.push({ bits: 0, offset: 0, len: 0 });
    }

    for (let i = 1; i <= skip; i++) {
      const matchIndex = (inputData[i - 1] << 8) | inputData[i];
      matchSlots[i] = matches[matchIndex];
      matches[matchIndex] = i;
    }

    optimal[skip].bits = 8;

    for (let i = skip + 1; i < inputSize; i++) {
      optimal[i].bits = optimal[i - 1].bits + 9;
      const matchIndex = (inputData[i - 1] << 8) | inputData[i];
      let bestLen = 1;
      let matchIdx = matches[matchIndex];

      while (matchIdx !== 0 && bestLen < MAX_LEN) {
        const offset = i - matchIdx;
        if (offset > MAX_OFFSET) {
          matchIdx = 0;
          break;
        }

        let testedLen = 2;
        let actualLen = 1;
        while (testedLen <= MAX_LEN && i >= skip + testedLen) {
          if (testedLen > bestLen) {
            bestLen = testedLen;
            const bits = optimal[i - testedLen].bits + countBits(offset, testedLen);
            if (optimal[i].bits > bits) {
              optimal[i].bits = bits;
              optimal[i].offset = offset;
              optimal[i].len = testedLen;
            }
          } else if (max[offset] !== 0 && i + 1 === max[offset] + testedLen) {
            testedLen = i - min[offset];
            if (testedLen > bestLen) {
              testedLen = bestLen;
            }
          }
          actualLen = testedLen;
          if (i < offset + testedLen || inputData[i - testedLen] !== inputData[i - testedLen - offset]) {
            break;
          }
          testedLen++;
        }
        min[offset] = i + 1 - actualLen;
        max[offset] = i;
        matchIdx = matchSlots[matchIdx];
      }
      matchSlots[i] = matches[matchIndex];
      matches[matchIndex] = i;
    }

    return optimal;
  }

  function compress(inputData, skip = 0) {
    const inputSize = inputData.length;
    const optimal = optimize(inputData, skip);

    let inputIndex = inputSize - 1;
    const outputSize = Math.floor((optimal[inputIndex].bits + 18 + 7) / 8);
    const outputData = new Uint8Array(outputSize);

    let diff = outputSize - inputSize + skip;
    let delta = 0;

    function readBytes(n) {
      diff += n;
      if (diff > delta) delta = diff;
    }

    let outputIndex = 0;
    let bitMask = 0;
    let bitIndex = 0;

    function writeByte(value) {
      outputData[outputIndex++] = value;
      diff--;
    }

    function writeBit(value) {
      if (bitMask === 0) {
        bitMask = 128;
        bitIndex = outputIndex;
        writeByte(0);
      }
      if (value > 0) {
        outputData[bitIndex] |= bitMask;
      }
      bitMask >>= 1;
    }

    function writeEliasGamma(value) {
      let i;
      for (i = 2; i <= value; i <<= 1) {
        writeBit(0);
      }
      while ((i >>= 1) > 0) {
        writeBit(value & i);
      }
    }

    optimal[inputIndex].bits = 0;
    while (inputIndex !== skip) {
      const inputPrev = inputIndex - (optimal[inputIndex].len > 0 ? optimal[inputIndex].len : 1);
      optimal[inputPrev].bits = inputIndex;
      inputIndex = inputPrev;
    }

    outputIndex = 0;
    bitMask = 0;

    writeByte(inputData[inputIndex]);
    readBytes(1);

    while ((inputIndex = optimal[inputIndex].bits) > 0) {
      if (optimal[inputIndex].len === 0) {
        writeBit(0);
        writeByte(inputData[inputIndex]);
        readBytes(1);
      } else {
        writeBit(1);
        writeEliasGamma(optimal[inputIndex].len - 1);

        let offset1 = optimal[inputIndex].offset - 1;
        if (offset1 < 128) {
          writeByte(offset1);
        } else {
          offset1 -= 128;
          writeByte((offset1 & 127) | 128);
          for (let mask = 1024; mask > 127; mask >>= 1) {
            writeBit(offset1 & mask);
          }
        }
        readBytes(optimal[inputIndex].len);
      }
    }

    writeBit(1);
    for (let i = 0; i < 16; i++) {
      writeBit(0);
    }
    writeBit(1);

    return { data: outputData, delta };
  }

  function decompress(inputData) {
    const inputSize = inputData.length;
    const outputData = [];

    let inputIndex = 0;
    let bitMask = 0;
    let bitValue = 0;

    function readByte() {
      if (inputIndex >= inputSize) {
        throw new Error('Truncated input file');
      }
      return inputData[inputIndex++];
    }

    function readBit() {
      bitMask >>= 1;
      if (bitMask === 0) {
        bitMask = 128;
        bitValue = readByte();
      }
      return (bitValue & bitMask) ? 1 : 0;
    }

    function readEliasGamma() {
      let i = 0;
      while (!readBit()) {
        i++;
      }
      if (i > 15) {
        return -1;
      }
      let value = 1;
      while (i--) {
        value = (value << 1) | readBit();
      }
      return value;
    }

    function readOffset() {
      let value = readByte();
      if (value < 128) {
        return value;
      } else {
        let i = readBit();
        i = (i << 1) | readBit();
        i = (i << 1) | readBit();
        i = (i << 1) | readBit();
        return (value & 127) | ((i << 7) + 128);
      }
    }

    outputData.push(readByte());

    while (true) {
      if (!readBit()) {
        outputData.push(readByte());
      } else {
        const length = readEliasGamma() + 1;
        if (length === 0) {
          break;
        }
        const offset = readOffset() + 1;
        for (let i = 0; i < length; i++) {
          outputData.push(outputData[outputData.length - offset]);
        }
      }
    }

    return new Uint8Array(outputData);
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

  function compressBackwards(inputData, skip = 0) {
    const reversed = new Uint8Array(inputData);
    reverse(reversed, 0, inputData.length - 1);
    const result = compress(reversed, skip);
    reverse(result.data, 0, result.data.length - 1);
    return result;
  }

  function decompressBackwards(inputData) {
    const reversed = new Uint8Array(inputData);
    reverse(reversed, 0, inputData.length - 1);
    const result = decompress(reversed);
    reverse(result, 0, result.length - 1);
    return result;
  }

  return {
    compress,
    decompress,
    compressBackwards,
    decompressBackwards,
    MAX_OFFSET,
    MAX_LEN
  };
})();
