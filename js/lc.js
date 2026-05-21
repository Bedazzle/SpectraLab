/*
 * Laser Compact 5.2.1 - JavaScript implementation
 *
 * ZX Spectrum version: packer, depacker by Hrumer, 1994-1999
 * PC version: Nikita Burnashev, 2005
 * Bug fixed, improved compression ratio, add depacker: Hrumer, 2014
 * Add -seg, -noattr options, fix buffer overflow: Eugene Larchenko, 2026
 * JavaScript port: Bedazzle, 2026
 */
(function() {

const MAX_OFFSET = 0x1700;
const MAX_LEN = 256;

function vlcLen(num) {
    if (num === 0) return 1;
    if (num <= 2) return 3;
    if (num <= 6) return 5;
    if (num <= 22) return 7;
    throw new Error('vlcLen: value out of range: ' + num);
}

function getPrice(len, mofs) {
    let price = 1; // flag bit for packed
    let msize = len;
    if (mofs > 0x300) msize--;
    if (msize >= 23) {
        price += vlcLen(6);
        price += 8;
    } else {
        if (msize < 7) msize--;
        price += vlcLen(msize);
    }
    price += vlcLen((mofs - 1) >> 8);
    price++; // direction bit
    price += 8; // low byte of offset
    return price;
}

function compress(inputData) {
    const datasize = inputData.length;
    if (datasize === 0) return { data: new Uint8Array(0) };

    // --- Optimal parsing pass ---
    const price = new Uint32Array(datasize + 1).fill(0xffff);
    const jumpfrom = new Int32Array(datasize + 1);
    const jumplen = new Int32Array(datasize + 1);
    const jumpoffset = new Int32Array(datasize + 1);
    const jumpdirect = new Int32Array(datasize + 1);

    price[1] = 8; // first byte stored literally

    for (let ii = 1; ii < datasize; ii++) {
        // literal byte option
        if ((price[ii] + 9) < price[ii + 1]) {
            price[ii + 1] = price[ii] + 9;
            jumpfrom[ii + 1] = ii;
            jumpdirect[ii + 1] = 0;
        }

        // find matches
        let msize = 0;
        let psStart = ii - MAX_OFFSET;
        if (psStart < 0) psStart = 0;

        for (let pw = ii - 1; pw >= psStart; pw--) {
            if (inputData[pw] !== inputData[ii]) continue;

            const mofs = ii - pw;

            // forward match
            let nsize = 0;
            let pwc = pw + 1;
            let pic = ii + 1;
            while (pic < datasize && nsize < 255 && inputData[pwc] === inputData[pic]) {
                pwc++;
                pic++;
                nsize++;
            }

            const minsize = mofs > 0x300 ? 2 : 1;
            if (nsize > msize && nsize >= minsize) {
                const startLen = msize ? msize + 1 : minsize;
                for (let i = startLen; i <= nsize; i++) {
                    const pricei = getPrice(i, mofs);
                    if ((price[ii] + pricei) < price[ii + i + 1]) {
                        price[ii + i + 1] = price[ii] + pricei;
                        jumpfrom[ii + i + 1] = ii;
                        jumplen[ii + i + 1] = i;
                        jumpoffset[ii + i + 1] = mofs;
                        jumpdirect[ii + i + 1] = 2; // forward
                    }
                }
                msize = nsize;
            }

            // backward match
            nsize = 0;
            let pwcb = pw - 1;
            pic = ii + 1;
            while (pic < datasize && pwcb >= 0 && nsize < 255 && inputData[pwcb] === inputData[pic]) {
                pwcb--;
                pic++;
                nsize++;
            }

            if (nsize > msize && nsize >= minsize) {
                const startLen = msize ? msize + 1 : minsize;
                for (let i = startLen; i <= nsize; i++) {
                    const pricei = getPrice(i, mofs);
                    if ((price[ii] + pricei) < price[ii + i + 1]) {
                        price[ii + i + 1] = price[ii] + pricei;
                        jumpfrom[ii + i + 1] = ii;
                        jumplen[ii + i + 1] = i;
                        jumpoffset[ii + i + 1] = mofs;
                        jumpdirect[ii + i + 1] = 3; // backward
                    }
                }
                msize = nsize;
            }
        }
    }

    // --- Trace back optimal path ---
    const offtype = new Uint8Array(datasize + 1);
    const offlen = new Int32Array(datasize + 1);
    const offoffset = new Int32Array(datasize + 1);

    for (let ii = datasize; ii !== 1;) {
        offtype[jumpfrom[ii]] = jumpdirect[ii];
        offlen[jumpfrom[ii]] = jumplen[ii];
        offoffset[jumpfrom[ii]] = jumpoffset[ii];
        ii = jumpfrom[ii];
    }

    // --- Encoding pass ---
    const output = new Uint8Array(datasize + 256); // worst case
    let po = 0;
    let bbuf = 1;
    let pb = 0;

    function bit(value) {
        if (bbuf === 1) pb = po++;
        bbuf = (bbuf << 1) | value;
        if (bbuf & 0x100) {
            output[pb] = bbuf & 0xff;
            bbuf = 1;
        }
    }

    function vlc(num) {
        if (num === 0) {
            bit(1);
        } else if (num <= 2) {
            bit(0);
            bit(num & 1);
            bit(1);
        } else if (num <= 6) {
            num = 6 - num;
            bit(0);
            bit(num >> 1);
            bit(0);
            bit(num & 1);
            bit(1);
        } else if (num <= 22) {
            num = 22 - num;
            bit(0);
            bit(num >> 3);
            bit(0);
            bit((num >> 2) & 1);
            bit(0);
            bit((num >> 1) & 1);
            bit(num & 1);
        }
    }

    // first byte literal
    output[po++] = inputData[0];

    for (let ii = 1; ii !== datasize;) {
        if (offtype[ii] === 0) {
            bit(1);
            output[po++] = inputData[ii++];
        } else {
            bit(0);
            let mofs = offoffset[ii];
            let msize = offlen[ii];
            const mtype = offtype[ii];

            if (mofs > 0x300) msize--;
            if (msize >= 23) {
                vlc(6);
                output[po++] = (-msize) & 0xff;
            } else {
                if (msize < 7) msize--;
                vlc(msize);
            }
            vlc((mofs - 1) >> 8);
            bit(mtype & 1);
            output[po++] = (-mofs) & 0xff;

            ii = ii + offlen[ii] + 1;
        }
    }

    // end marker
    bit(0);
    vlc(6);
    output[po++] = 0;

    // flush remaining bits
    if (bbuf !== 1) {
        while (!(bbuf & 0x100)) bbuf <<= 1;
        output[pb] = bbuf & 0xff;
    }

    return { data: output.slice(0, po) };
}

function decompress(inputData) {
    const inputSize = inputData.length;
    if (inputSize === 0) return new Uint8Array(0);

    const output = [];
    let ip = 0;
    let bitBuf = 0;
    let bitMask = 0;

    function readByte() {
        if (ip >= inputSize) throw new Error('Truncated input');
        return inputData[ip++];
    }

    function readBit() {
        if (bitMask === 0) {
            bitBuf = readByte();
            bitMask = 0x80;
        }
        const b = (bitBuf & bitMask) ? 1 : 0;
        bitMask >>= 1;
        return b;
    }

    function readVlc() {
        let num = 0;
        let bits = 0;
        while (true) {
            if (readBit()) {
                if (bits === 0) return 0;
                if (bits === 1) return 2 - num;           // 1..2
                if (bits === 2) return 6 - (num & 3);     // 3..6
                if (bits === 3) return 22 - (num & 15);   // 7..22
                throw new Error('VLC too long');
            }
            num = (num << 1) | readBit();
            bits++;
            if (bits === 3) {
                // 7-bit VLC: 4th data bit has no terminator
                num = (num << 1) | readBit();
                return 22 - (num & 15);
            }
        }
    }

    // first byte literal
    output.push(readByte());

    while (true) {
        if (readBit()) {
            // literal byte
            output.push(readByte());
        } else {
            // match
            let msize = readVlc();
            if (msize === 6) {
                // extended length
                msize = (-(readByte())) & 0xff;
                if (msize === 0) break; // end marker
            } else {
                if (msize < 6) msize++;
            }

            const mofsHi = readVlc();
            const direction = readBit(); // 0 = forward (type 2), 1 = backward (type 3)
            const mofs = ((mofsHi + 1) << 8) - readByte();

            if (mofs > 0x300) msize++;

            const pos = output.length;
            // first byte from match position
            output.push(output[pos - mofs]);
            // remaining bytes
            for (let i = 0; i < msize; i++) {
                if (direction) {
                    // backward: walk backwards from match point
                    output.push(output[pos - mofs - 1 - i]);
                } else {
                    // forward: walk forwards from match point
                    output.push(output[pos - mofs + 1 + i]);
                }
            }
        }
    }

    return new Uint8Array(output);
}

function reorder(scr, start, end, attrs) {
    const out = [];
    for (let i = start; i < end; i++) {
        out.push(scr[(i & 0xf800) | ((i & 7) << 8) | ((i & 0x38) << 2) | ((i & 0x7c0) >> 6)]);
    }
    if (attrs) {
        const attrStart = 6144 + (start >> 3);
        const attrLen = (end - start) >> 3;
        for (let i = 0; i < attrLen; i++) {
            out.push(scr[attrStart + i]);
        }
    }
    return new Uint8Array(out);
}

function deorder(data, start, end, attrs) {
    const pixelLen = end - start;
    const scr = new Uint8Array(6912);
    for (let i = start; i < end; i++) {
        scr[(i & 0xf800) | ((i & 7) << 8) | ((i & 0x38) << 2) | ((i & 0x7c0) >> 6)] = data[i - start];
    }
    if (attrs) {
        const attrStart = 6144 + (start >> 3);
        const attrLen = (end - start) >> 3;
        for (let i = 0; i < attrLen; i++) {
            scr[attrStart + i] = data[pixelLen + i];
        }
    }
    return scr;
}

function compressScreen(scrData, options) {
    const opts = options || {};
    const start = opts.start !== undefined ? opts.start : 0;
    const end = opts.end !== undefined ? opts.end : 6144;
    const attrs = opts.attrs !== undefined ? opts.attrs : true;
    const header = opts.header !== undefined ? opts.header : true;

    const reordered = reorder(scrData, start, end, attrs);
    const result = compress(reordered);

    if (!header) return result;

    const razryv = ((start / 8 + 6144) - end) / 256;
    const compSize = result.data.length;
    const payloadLen = compSize + 1; // +1 for razryv byte
    const out = new Uint8Array(9 + compSize);
    // "LCMP5"
    out[0] = 0x4C; out[1] = 0x43; out[2] = 0x4D; out[3] = 0x50; out[4] = 0x35;
    out[5] = payloadLen & 0xff;
    out[6] = (payloadLen >> 8) & 0xff;
    out[7] = 0; // extra info length
    out[8] = razryv;
    out.set(result.data, 9);
    return { data: out };
}

function decompressScreen(compData, options) {
    const opts = options || {};
    let data = compData instanceof Uint8Array ? compData : new Uint8Array(compData);
    let start = opts.start !== undefined ? opts.start : 0;
    let end = opts.end !== undefined ? opts.end : 6144;
    let attrs = opts.attrs !== undefined ? opts.attrs : true;
    let header = opts.header !== undefined ? opts.header : true;

    if (header) {
        // parse LCMP5 header
        if (data[0] !== 0x4C || data[1] !== 0x43 || data[2] !== 0x4D ||
            data[3] !== 0x50 || data[4] !== 0x35) {
            throw new Error('Invalid LCMP5 header');
        }
        const extraLen = data[7];
        const razryv = data[8 + extraLen];
        // recover start/end from razryv if not overridden
        if (opts.start === undefined && opts.end === undefined) {
            if (razryv === 0) { start = 0; end = 6144; }
            else {
                // razryv = ((start/8 + 6144) - end) / 256
                // for standard segments: seg1=16, seg2=16, seg3=16, seg12=8, seg23=8
                // use defaults, user should provide start/end for non-standard
            }
        }
        data = data.slice(9 + extraLen);
    }

    const decompressed = decompress(data);
    return deorder(decompressed, start, end, attrs);
}

function compressArray(inputArray) {
    const inputData = inputArray instanceof Uint8Array ? inputArray : new Uint8Array(inputArray);
    return compress(inputData);
}

function decompressArray(inputArray) {
    const inputData = inputArray instanceof Uint8Array ? inputArray : new Uint8Array(inputArray);
    return decompress(inputData);
}

/**
 * Decompress and return both output data and number of input bytes consumed.
 * Used when decompressing from a stream where subsequent data follows.
 * @param {Uint8Array} inputData
 * @returns {{data: Uint8Array, bytesRead: number}}
 */
function decompressTracked(inputData) {
    const inputSize = inputData.length;
    if (inputSize === 0) return { data: new Uint8Array(0), bytesRead: 0 };

    const output = [];
    let ip = 0;
    let bitBuf = 0;
    let bitMask = 0;

    function readByte() {
        if (ip >= inputSize) throw new Error('Truncated input');
        return inputData[ip++];
    }

    function readBit() {
        if (bitMask === 0) {
            bitBuf = readByte();
            bitMask = 0x80;
        }
        const b = (bitBuf & bitMask) ? 1 : 0;
        bitMask >>= 1;
        return b;
    }

    function readVlc() {
        let num = 0;
        let bits = 0;
        while (true) {
            if (readBit()) {
                if (bits === 0) return 0;
                if (bits === 1) return 2 - num;
                if (bits === 2) return 6 - (num & 3);
                if (bits === 3) return 22 - (num & 15);
                throw new Error('VLC too long');
            }
            num = (num << 1) | readBit();
            bits++;
            if (bits === 3) {
                num = (num << 1) | readBit();
                return 22 - (num & 15);
            }
        }
    }

    // first byte literal
    output.push(readByte());

    while (true) {
        if (readBit()) {
            output.push(readByte());
        } else {
            let msize = readVlc();
            if (msize === 6) {
                msize = (-(readByte())) & 0xff;
                if (msize === 0) break; // end marker
            } else {
                if (msize < 6) msize++;
            }

            const mofsHi = readVlc();
            const direction = readBit();
            const mofs = ((mofsHi + 1) << 8) - readByte();

            if (mofs > 0x300) msize++;

            const pos = output.length;
            output.push(output[pos - mofs]);
            for (let i = 0; i < msize; i++) {
                if (direction) {
                    output.push(output[pos - mofs - 1 - i]);
                } else {
                    output.push(output[pos - mofs + 1 + i]);
                }
            }
        }
    }

    return { data: new Uint8Array(output), bytesRead: ip };
}

if (typeof window !== 'undefined') {
    window.LC = {
        compress,
        decompress,
        decompressTracked,
        reorder,
        deorder,
        compressScreen,
        decompressScreen,
        compressArray,
        decompressArray,
        MAX_OFFSET,
        MAX_LEN
    };
}
})();
