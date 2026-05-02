// upkr-js - LZ compression with rANS entropy coding
//
// Original Rust implementation by exoticorn (Dennis Ranke)
// https://github.com/exoticorn/upkr
//
(function() {
// JavaScript port by Bedazzle - 2026
//
// License: Unlicense (public domain)

// ============================================================================
// Configuration
// ============================================================================

function upkrDefaultConfig() {
    return {
        use_bitstream: false,
        parity_contexts: 1,
        invert_bit_encoding: false,
        is_match_bit: true,
        new_offset_bit: true,
        continue_value_bit: true,
        bitstream_is_big_endian: false,
        simplified_prob_update: false,
        no_repeated_offsets: false,
        eof_in_length: false,
        max_offset: 0x7FFFFFFF,
        max_length: 0x7FFFFFFF
    };
}

// ============================================================================
// Constants
// ============================================================================

const PROB_BITS = 8;
const ONE_PROB = 1 << PROB_BITS;
const PROB_MASK = ONE_PROB - 1;
const INIT_PROB = 1 << (PROB_BITS - 1); // 128
const UPDATE_RATE = 4;
const UPDATE_ADD = 8;

// ============================================================================
// Context State (adaptive probability contexts)
// ============================================================================

function createContextState(size, config) {
    const contexts = new Uint8Array(size);
    contexts.fill(INIT_PROB);
    return {
        contexts: contexts,
        invert_bit_encoding: config.invert_bit_encoding,
        simplified_prob_update: config.simplified_prob_update
    };
}

function contextProb(state, index) {
    return state.contexts[index];
}

function contextUpdate(state, index, bit) {
    const old = state.contexts[index];
    const effective = bit !== state.invert_bit_encoding; // XOR for booleans
    if (state.simplified_prob_update) {
        const offset = effective ? (ONE_PROB >> UPDATE_RATE) : 0;
        state.contexts[index] = (offset + old - ((old + UPDATE_ADD) >> UPDATE_RATE)) & 0xFF;
    } else {
        if (effective) {
            state.contexts[index] = old + ((ONE_PROB - old + UPDATE_ADD) >> UPDATE_RATE);
        } else {
            state.contexts[index] = old - ((old + UPDATE_ADD) >> UPDATE_RATE);
        }
    }
}

function contextStateSize(config) {
    return (1 + 255) * config.parity_contexts + 1 + 64 + 64;
}

// ============================================================================
// rANS Decoder
// ============================================================================

function createRansDecoder(data, config) {
    const decoder = {
        data: data,
        pos: 0,
        state: 0,
        use_bitstream: config.use_bitstream,
        byte: 0,
        bits_left: 0,
        invert_bit_encoding: config.invert_bit_encoding,
        bitstream_is_big_endian: config.bitstream_is_big_endian
    };
    ransRefill(decoder);
    return decoder;
}

function ransRefill(decoder) {
    if (decoder.use_bitstream) {
        while (decoder.state < 32768) {
            if (decoder.bits_left === 0) {
                if (decoder.pos >= decoder.data.length) {
                    throw new Error('Unexpected end of input');
                }
                decoder.byte = decoder.data[decoder.pos++];
                decoder.bits_left = 8;
            }
            if (decoder.bitstream_is_big_endian) {
                decoder.state = ((decoder.state << 1) | (decoder.byte >> 7)) >>> 0;
                decoder.byte = (decoder.byte << 1) & 0xFF;
            } else {
                decoder.state = ((decoder.state << 1) | (decoder.byte & 1)) >>> 0;
                decoder.byte = decoder.byte >> 1;
            }
            decoder.bits_left--;
        }
    } else {
        while (decoder.state < 4096) {
            if (decoder.pos >= decoder.data.length) {
                throw new Error('Unexpected end of input');
            }
            decoder.state = ((decoder.state << 8) | decoder.data[decoder.pos++]) >>> 0;
        }
    }
}

function ransDecodeBit(decoder, prob) {
    ransRefill(decoder);

    const p = prob;
    const bit = (decoder.state & PROB_MASK) < p;

    if (bit) {
        decoder.state = (p * (decoder.state >>> PROB_BITS) + (decoder.state & PROB_MASK)) >>> 0;
    } else {
        decoder.state = ((ONE_PROB - p) * (decoder.state >>> PROB_BITS) + (decoder.state & PROB_MASK) - p) >>> 0;
    }

    return bit !== decoder.invert_bit_encoding; // XOR for booleans
}

function ransDecodeWithContext(decoder, ctxState, ctxIndex) {
    const prob = contextProb(ctxState, ctxIndex);
    const bit = ransDecodeBit(decoder, prob);
    contextUpdate(ctxState, ctxIndex, bit);
    return bit;
}

// ============================================================================
// rANS Encoder
// ============================================================================

function createRansEncoder(config) {
    return {
        bits: [],
        use_bitstream: config.use_bitstream,
        bitstream_is_big_endian: config.bitstream_is_big_endian,
        invert_bit_encoding: config.invert_bit_encoding
    };
}

function ransEncodeBit(encoder, bit, prob) {
    const effectiveBit = (bit !== encoder.invert_bit_encoding) ? 1 : 0;
    encoder.bits.push((effectiveBit << 15) | (prob & 0x7FFF));
}

function ransEncodeWithContext(encoder, bit, ctxState, ctxIndex) {
    const prob = contextProb(ctxState, ctxIndex);
    ransEncodeBit(encoder, bit, prob);
    contextUpdate(ctxState, ctxIndex, bit);
}

function ransEncoderFinish(encoder) {
    const buffer = [];
    const l_bits = encoder.use_bitstream ? 15 : 12;
    let state = 1 << l_bits;

    let byteVal = 0;
    let bitPos = encoder.bitstream_is_big_endian ? 0 : 8;

    const num_flush_bits = encoder.use_bitstream ? 1 : 8;
    const max_state_factor = 1 << (l_bits + num_flush_bits - PROB_BITS);

    for (let i = encoder.bits.length - 1; i >= 0; i--) {
        const step = encoder.bits[i];
        const rawProb = step & 0x7FFF;
        let start, prob;
        if (step & 0x8000) {
            start = 0;
            prob = rawProb;
        } else {
            start = rawProb;
            prob = ONE_PROB - rawProb;
        }
        const max_state = max_state_factor * prob;
        while (state >= max_state) {
            if (encoder.use_bitstream) {
                if (encoder.bitstream_is_big_endian) {
                    byteVal |= (state & 1) << bitPos;
                    bitPos++;
                    if (bitPos === 8) {
                        buffer.push(byteVal);
                        byteVal = 0;
                        bitPos = 0;
                    }
                } else {
                    bitPos--;
                    byteVal |= (state & 1) << bitPos;
                    if (bitPos === 0) {
                        buffer.push(byteVal);
                        byteVal = 0;
                        bitPos = 8;
                    }
                }
                state >>>= 1;
            } else {
                buffer.push(state & 0xFF);
                state >>>= 8;
            }
        }
        state = Math.floor(state / prob) * ONE_PROB + (state % prob) + start;
    }

    while (state > 0) {
        if (encoder.use_bitstream) {
            if (encoder.bitstream_is_big_endian) {
                byteVal |= (state & 1) << bitPos;
                bitPos++;
                if (bitPos === 8) {
                    buffer.push(byteVal);
                    byteVal = 0;
                    bitPos = 0;
                }
            } else {
                bitPos--;
                byteVal |= (state & 1) << bitPos;
                if (bitPos === 0) {
                    buffer.push(byteVal);
                    byteVal = 0;
                    bitPos = 8;
                }
            }
            state >>>= 1;
        } else {
            buffer.push(state & 0xFF);
            state >>>= 8;
        }
    }

    if (encoder.use_bitstream && byteVal !== 0) {
        buffer.push(byteVal);
    }

    buffer.reverse();
    return new Uint8Array(buffer);
}

// ============================================================================
// Cost Counter (for optimal parsing)
// ============================================================================

function createCostCounter(config) {
    const log2_table = new Float64Array(ONE_PROB);
    for (let p = 0; p < ONE_PROB; p++) {
        log2_table[p] = Math.log2(ONE_PROB / p);
    }
    return {
        cost: 0.0,
        log2_table: log2_table,
        invert_bit_encoding: config.invert_bit_encoding
    };
}

function costCounterEncodeBit(counter, bit, prob) {
    const p = (bit !== counter.invert_bit_encoding) ? prob : (ONE_PROB - prob);
    counter.cost += counter.log2_table[p];
}

function costCounterEncodeWithContext(counter, bit, ctxState, ctxIndex) {
    const prob = contextProb(ctxState, ctxIndex);
    costCounterEncodeBit(counter, bit, prob);
    contextUpdate(ctxState, ctxIndex, bit);
}

function costCounterReset(counter) {
    counter.cost = 0.0;
}

// ============================================================================
// LZ Encode/Decode Operations
// ============================================================================

function minLength(config) {
    return config.eof_in_length ? 2 : 1;
}

// Encode a single bit through a context
function lzEncodeBit(coder, ctxState, ctxIndex, bit, useCostCounter) {
    if (useCostCounter) {
        costCounterEncodeWithContext(coder, bit, ctxState, ctxIndex);
    } else {
        ransEncodeWithContext(coder, bit, ctxState, ctxIndex);
    }
}

// Encode a length/offset value using interleaved Elias gamma
function lzEncodeLength(coder, ctxState, contextStart, value, config, useCostCounter) {
    let contextIndex = contextStart;
    while (value >= 2) {
        lzEncodeBit(coder, ctxState, contextIndex, config.continue_value_bit, useCostCounter);
        lzEncodeBit(coder, ctxState, contextIndex + 1, (value & 1) !== 0, useCostCounter);
        contextIndex += 2;
        value >>>= 1;
    }
    lzEncodeBit(coder, ctxState, contextIndex, !config.continue_value_bit, useCostCounter);
}

// Encode a literal byte
function lzEncodeLiteral(coder, ctxState, lit, state, config, useCostCounter) {
    const literalBase = state.pos % state.parity_contexts * 256;
    lzEncodeBit(coder, ctxState, literalBase, !config.is_match_bit, useCostCounter);
    let contextIndex = 1;
    for (let i = 7; i >= 0; i--) {
        const bit = ((lit >>> i) & 1) !== 0;
        lzEncodeBit(coder, ctxState, literalBase + contextIndex, bit, useCostCounter);
        contextIndex = (contextIndex << 1) | (bit ? 1 : 0);
    }
    state.prev_was_match = false;
    state.pos += 1;
}

// Encode a match (offset + length)
function lzEncodeMatch(coder, ctxState, offset, len, state, config, useCostCounter) {
    const literalBase = state.pos % state.parity_contexts * 256;
    lzEncodeBit(coder, ctxState, literalBase, config.is_match_bit, useCostCounter);
    let new_offset = true;
    if (!state.prev_was_match && !config.no_repeated_offsets) {
        new_offset = offset !== state.last_offset;
        lzEncodeBit(coder, ctxState, 256 * state.parity_contexts,
            new_offset === config.new_offset_bit, useCostCounter);
    }
    if (new_offset) {
        lzEncodeLength(coder, ctxState, 256 * state.parity_contexts + 1,
            offset + (config.eof_in_length ? 0 : 1), config, useCostCounter);
        state.last_offset = offset;
    }
    lzEncodeLength(coder, ctxState, 256 * state.parity_contexts + 65, len, config, useCostCounter);
    state.prev_was_match = true;
    state.pos += len;
}

// Encode EOF marker
function lzEncodeEof(coder, ctxState, state, config, useCostCounter) {
    lzEncodeBit(coder, ctxState,
        state.pos % state.parity_contexts * 256,
        config.is_match_bit, useCostCounter);
    if (!state.prev_was_match && !config.no_repeated_offsets) {
        lzEncodeBit(coder, ctxState, 256 * state.parity_contexts,
            config.new_offset_bit !== config.eof_in_length, useCostCounter);
    }
    if (!config.eof_in_length || state.prev_was_match || config.no_repeated_offsets) {
        lzEncodeLength(coder, ctxState, 256 * state.parity_contexts + 1, 1, config, useCostCounter);
    }
    if (config.eof_in_length) {
        lzEncodeLength(coder, ctxState, 256 * state.parity_contexts + 65, 1, config, useCostCounter);
    }
}

function createCoderState(config) {
    return {
        contexts: createContextState(contextStateSize(config), config),
        last_offset: 0,
        prev_was_match: false,
        pos: 0,
        parity_contexts: config.parity_contexts
    };
}

function cloneCoderState(state) {
    return {
        contexts: {
            contexts: new Uint8Array(state.contexts.contexts),
            invert_bit_encoding: state.contexts.invert_bit_encoding,
            simplified_prob_update: state.contexts.simplified_prob_update
        },
        last_offset: state.last_offset,
        prev_was_match: state.prev_was_match,
        pos: state.pos,
        parity_contexts: state.parity_contexts
    };
}

// ============================================================================
// Suffix Array construction for match finding
// ============================================================================

function buildSuffixArray(data) {
    const n = data.length;
    if (n === 0) return new Int32Array(0);
    if (n === 1) return new Int32Array([0]);

    // Simple O(n log^2 n) suffix array construction
    const sa = new Int32Array(n);
    const rank = new Int32Array(n);
    const tmp = new Int32Array(n);

    for (let i = 0; i < n; i++) {
        sa[i] = i;
        rank[i] = data[i];
    }

    for (let k = 1; k < n; k <<= 1) {
        const kk = k;
        const r = rank;
        const cmp = (a, b) => {
            if (r[a] !== r[b]) return r[a] - r[b];
            const ra = a + kk < n ? r[a + kk] : -1;
            const rb = b + kk < n ? r[b + kk] : -1;
            return ra - rb;
        };
        sa.sort(cmp);

        tmp[sa[0]] = 0;
        for (let i = 1; i < n; i++) {
            tmp[sa[i]] = tmp[sa[i - 1]] + (cmp(sa[i - 1], sa[i]) < 0 ? 1 : 0);
        }
        for (let i = 0; i < n; i++) {
            rank[i] = tmp[i];
        }
        if (rank[sa[n - 1]] === n - 1) break;
    }

    return sa;
}

function buildLCPArray(data, sa) {
    const n = data.length;
    const lcp = new Int32Array(n);
    const rev = new Int32Array(n);

    for (let i = 0; i < n; i++) {
        rev[sa[i]] = i;
    }

    let length = 0;
    for (let i = 0; i < n; i++) {
        const si = rev[i];
        if (si + 1 < n) {
            const j = sa[si + 1];
            while (i + length < n && j + length < n && data[i + length] === data[j + length]) {
                length++;
            }
            lcp[si] = length;
        }
        if (length > 0) length--;
    }

    return { lcp, rev };
}

// ============================================================================
// Match Finder
// ============================================================================

function createMatchFinder(data, config) {
    const sa = buildSuffixArray(data);
    const { lcp, rev } = buildLCPArray(data, sa);

    return {
        sa: sa,
        rev: rev,
        lcp: lcp,
        data: data,
        max_queue_size: 100,
        max_matches_per_length: 5,
        patience: 100,
        max_length_diff: 2
    };
}

function findMatches(finder, pos) {
    const index = finder.rev[pos];
    const matches = [];

    let leftIndex = index;
    let leftLength = 0x7FFFFFFF;
    let rightIndex = index;
    let rightLength = 0x7FFFFFFF;
    let currentLength = 0x7FFFFFFF;
    let maxLength = 0;
    let matchesLeft = 0;

    // Move left once
    {
        let patience = finder.patience;
        while (leftLength > 0 && patience > 0 && leftIndex > 0) {
            leftIndex--;
            leftLength = Math.min(leftLength, finder.lcp[leftIndex]);
            if (finder.sa[leftIndex] >= 0 && finder.sa[leftIndex] < pos) {
                break;
            }
            patience--;
        }
        if (patience === 0 || leftIndex <= 0) leftLength = 0;
        else if (finder.sa[leftIndex] < 0 || finder.sa[leftIndex] >= pos) leftLength = 0;
    }

    // Move right once
    {
        let patience = finder.patience;
        while (rightLength > 0 && patience > 0 && rightIndex + 1 < finder.sa.length) {
            rightIndex++;
            rightLength = Math.min(rightLength, finder.lcp[rightIndex - 1]);
            if (finder.sa[rightIndex] >= 0 && finder.sa[rightIndex] < pos) {
                break;
            }
            patience--;
        }
        if (patience === 0 || rightIndex + 1 >= finder.sa.length + 1) rightLength = 0;
        else if (finder.sa[rightIndex] < 0 || finder.sa[rightIndex] >= pos) rightLength = 0;
    }

    // Iterate matches by decreasing length
    while (true) {
        if (matchesLeft === 0) {
            currentLength = Math.min(currentLength - 1, Math.max(leftLength, rightLength));
            maxLength = Math.max(maxLength, currentLength);
            if (currentLength < 2 || currentLength + finder.max_length_diff < maxLength) {
                break;
            }

            const queue = [];
            let queueCount = 0;
            while (queueCount < finder.max_queue_size &&
                   (leftLength === currentLength || rightLength === currentLength)) {
                if (leftLength === currentLength) {
                    queue.push(finder.sa[leftIndex]);
                    queueCount++;
                    // move left
                    let patience = finder.patience;
                    let found = false;
                    while (leftLength > 0 && patience > 0 && leftIndex > 0) {
                        leftIndex--;
                        leftLength = Math.min(leftLength, finder.lcp[leftIndex]);
                        if (finder.sa[leftIndex] >= 0 && finder.sa[leftIndex] < pos) {
                            found = true;
                            break;
                        }
                        patience--;
                    }
                    if (!found) leftLength = 0;
                }
                if (rightLength === currentLength) {
                    queue.push(finder.sa[rightIndex]);
                    queueCount++;
                    // move right
                    let patience = finder.patience;
                    let found = false;
                    while (rightLength > 0 && patience > 0 && rightIndex + 1 < finder.sa.length) {
                        rightIndex++;
                        rightLength = Math.min(rightLength, finder.lcp[rightIndex - 1]);
                        if (finder.sa[rightIndex] >= 0 && finder.sa[rightIndex] < pos) {
                            found = true;
                            break;
                        }
                        patience--;
                    }
                    if (!found) rightLength = 0;
                }
            }

            // Sort by position descending (highest pos = smallest offset first)
            queue.sort((a, b) => b - a);

            matchesLeft = Math.min(finder.max_matches_per_length, queue.length);
            for (let i = 0; i < matchesLeft; i++) {
                matches.push({ pos: queue[i], length: currentLength });
            }
            matchesLeft = 0; // we already added them
            continue;
        }
    }

    return matches;
}

// ============================================================================
// Greedy Packer (level 0)
// ============================================================================

function greedyPack(data, config, progressCallback) {
    const finder = createMatchFinder(data, config);
    const encoder = createRansEncoder(config);
    const state = createCoderState(config);

    let pos = 0;
    while (pos < data.length) {
        if (progressCallback) progressCallback(pos);
        let encodedMatch = false;

        // Try suffix array match
        const matchList = findMatches(finder, pos);
        if (matchList.length > 0) {
            const m = matchList[0];
            const offset = pos - m.pos;
            const maxOff = Math.min(config.max_offset, 1 << Math.min(m.length * 3 - 1, 31));
            if (offset < maxOff && m.length >= minLength(config)) {
                const length = Math.min(m.length, config.max_length);
                lzEncodeMatch(encoder, state.contexts, offset, length, state, config, false);
                pos += length;
                encodedMatch = true;
            }
        }

        // Try repeated offset match
        if (!encodedMatch) {
            const lastOff = state.last_offset;
            if (lastOff !== 0 && lastOff <= pos) {
                let length = 0;
                while (pos + length < data.length &&
                       data[pos + length] === data[pos + length - lastOff] &&
                       length < config.max_length) {
                    length++;
                }
                if (length >= minLength(config)) {
                    lzEncodeMatch(encoder, state.contexts, lastOff, length, state, config, false);
                    pos += length;
                    encodedMatch = true;
                }
            }
        }

        if (!encodedMatch) {
            lzEncodeLiteral(encoder, state.contexts, data[pos], state, config, false);
            pos += 1;
        }
    }

    lzEncodeEof(encoder, state.contexts, state, config, false);
    return ransEncoderFinish(encoder);
}

// ============================================================================
// Optimal Parsing Packer (levels 1-9)
// ============================================================================

function parsingPackerConfig(level) {
    const max_arrivals = [0, 0, 2, 4, 8, 16, 32, 64, 96, 128][Math.min(level, 9)];
    const max_cost_delta = 16.0;
    const max_offset_cost_delta = level <= 4 ? 0.0 : (level <= 8 ? 4.0 : 8.0);
    const num_near_matches = Math.max(0, level - 1);
    const greedy_size = 4 + level * level * 3;
    const max_length_diff = level <= 1 ? 0 : (level <= 3 ? 1 : (level <= 5 ? 2 : (level <= 7 ? 3 : 4)));

    return {
        max_arrivals: max_arrivals,
        max_cost_delta: max_cost_delta,
        max_offset_cost_delta: max_offset_cost_delta,
        num_near_matches: num_near_matches,
        greedy_size: greedy_size,
        max_queue_size: level * 100,
        patience: level * 100,
        max_matches_per_length: level,
        max_length_diff: max_length_diff
    };
}

function optimalParse(data, level, config, progressCallback) {
    const pcfg = parsingPackerConfig(level);
    const finder = createMatchFinder(data, config);
    finder.max_queue_size = pcfg.max_queue_size;
    finder.patience = pcfg.patience;
    finder.max_matches_per_length = pcfg.max_matches_per_length;
    finder.max_length_diff = pcfg.max_length_diff;

    const near_matches = new Int32Array(1024).fill(-1);
    const last_seen = new Int32Array(256).fill(-1);
    const max_arrivals = pcfg.max_arrivals;

    const costCounter = createCostCounter(config);

    // Arrivals: Map from position -> array of { parse, state, cost }
    // parse is a linked list of ops: { prev, op_type, op_data }
    const arrivals = new Map();

    function sortArrivals(arr) {
        if (max_arrivals === 0) return;
        arr.sort((a, b) => a.cost - b.cost);
        const seenOffsets = new Set();
        const kept = [];
        const remaining = [];
        for (const a of arr) {
            if (seenOffsets.has(a.state.last_offset)) {
                remaining.push(a);
            } else {
                seenOffsets.add(a.state.last_offset);
                if (kept.length < max_arrivals) {
                    kept.push(a);
                } else {
                    remaining.push(a);
                }
            }
        }
        for (const a of remaining) {
            if (kept.length >= max_arrivals) break;
            kept.push(a);
        }
        arr.length = 0;
        for (const a of kept) arr.push(a);
    }

    function addArrival(pos, arrival) {
        let arr = arrivals.get(pos);
        if (!arr) {
            arr = [];
            arrivals.set(pos, arr);
        }
        if (max_arrivals === 0) {
            if (arr.length === 0) {
                arr.push(arrival);
            } else if (arr[0].cost > arrival.cost) {
                arr[0] = arrival;
            }
            return;
        }
        arr.push(arrival);
        if (arr.length > max_arrivals * 2) {
            sortArrivals(arr);
        }
    }

    function addMatch(pos, offset, length, arrival) {
        if (length < minLength(config)) return;
        length = Math.min(length, config.max_length);

        costCounterReset(costCounter);
        const stateCopy = cloneCoderState(arrival.state);
        // Simulate encoding the match using cost counter
        const literalBase = stateCopy.pos % stateCopy.parity_contexts * 256;
        costCounterEncodeWithContext(costCounter, config.is_match_bit, stateCopy.contexts, literalBase);
        let new_offset = true;
        if (!stateCopy.prev_was_match && !config.no_repeated_offsets) {
            new_offset = offset !== stateCopy.last_offset;
            costCounterEncodeWithContext(costCounter, new_offset === config.new_offset_bit,
                stateCopy.contexts, 256 * stateCopy.parity_contexts);
        }
        if (new_offset) {
            lzEncodeLength(costCounter, stateCopy.contexts, 256 * stateCopy.parity_contexts + 1,
                offset + (config.eof_in_length ? 0 : 1), config, true);
            stateCopy.last_offset = offset;
        }
        lzEncodeLength(costCounter, stateCopy.contexts, 256 * stateCopy.parity_contexts + 65,
            length, config, true);
        stateCopy.prev_was_match = true;
        stateCopy.pos += length;

        addArrival(pos + length, {
            parse: { prev: arrival.parse, type: 'match', offset: offset, length: length },
            state: stateCopy,
            cost: arrival.cost + costCounter.cost
        });
    }

    // Initial arrival at position 0
    addArrival(0, {
        parse: null,
        state: createCoderState(config),
        cost: 0.0
    });

    const best_per_offset = new Map();

    for (let pos = 0; pos < data.length; pos++) {
        const matchLength = (offset) => {
            let len = 0;
            while (pos + len < data.length && data[pos + len] === data[pos + len - offset] && len < config.max_length) {
                len++;
            }
            return len;
        };

        let hereArrivals = arrivals.get(pos);
        arrivals.delete(pos);
        if (!hereArrivals) continue;
        sortArrivals(hereArrivals);

        best_per_offset.clear();
        let bestCost = Infinity;
        for (const arrival of hereArrivals) {
            bestCost = Math.min(bestCost, arrival.cost);
            const existing = best_per_offset.get(arrival.state.last_offset);
            if (existing === undefined || existing > arrival.cost) {
                best_per_offset.set(arrival.state.last_offset, arrival.cost);
            }
        }

        let breakOuter = false;
        for (const arrival of hereArrivals) {
            if (breakOuter) break;
            const perOffset = best_per_offset.get(arrival.state.last_offset) || Infinity;
            if (arrival.cost > Math.min(bestCost + pcfg.max_cost_delta, perOffset + pcfg.max_offset_cost_delta)) {
                continue;
            }

            let foundLastOffset = false;
            let closestMatch = -1;

            const matchList = findMatches(finder, pos);
            for (const m of matchList) {
                if (closestMatch < m.pos) closestMatch = m.pos;
                const offset = pos - m.pos;
                if (offset <= config.max_offset) {
                    if (offset === arrival.state.last_offset) foundLastOffset = true;
                    addMatch(pos, offset, m.length, arrival);
                    if (m.length >= pcfg.greedy_size) {
                        breakOuter = true;
                        break;
                    }
                }
            }

            if (!breakOuter) {
                // Near matches
                let nearMatchesLeft = pcfg.num_near_matches;
                let matchPos = last_seen[data[pos]];
                while (nearMatchesLeft > 0 && matchPos !== -1 && (closestMatch === -1 || closestMatch < matchPos)) {
                    const offset = pos - matchPos;
                    if (offset > config.max_offset) break;
                    const length = matchLength(offset);
                    if (length > 0) {
                        addMatch(pos, offset, length, arrival);
                        if (offset === arrival.state.last_offset) foundLastOffset = true;
                    }
                    if (matchPos % near_matches.length >= 0) {
                        matchPos = near_matches[matchPos % near_matches.length];
                    } else {
                        break;
                    }
                    nearMatchesLeft--;
                }

                // Check repeated offset
                if (!foundLastOffset && arrival.state.last_offset > 0) {
                    const offset = arrival.state.last_offset;
                    if (offset <= pos) {
                        const length = matchLength(offset);
                        if (length > 0) {
                            addMatch(pos, offset, length, arrival);
                        }
                    }
                }

                // Literal
                costCounterReset(costCounter);
                const stateCopy = cloneCoderState(arrival.state);
                const literalBase = stateCopy.pos % stateCopy.parity_contexts * 256;
                costCounterEncodeWithContext(costCounter, !config.is_match_bit, stateCopy.contexts, literalBase);
                let contextIndex = 1;
                for (let i = 7; i >= 0; i--) {
                    const bit = ((data[pos] >>> i) & 1) !== 0;
                    costCounterEncodeWithContext(costCounter, bit, stateCopy.contexts, literalBase + contextIndex);
                    contextIndex = (contextIndex << 1) | (bit ? 1 : 0);
                }
                stateCopy.prev_was_match = false;
                stateCopy.pos += 1;

                addArrival(pos + 1, {
                    parse: { prev: arrival.parse, type: 'literal', value: data[pos] },
                    state: stateCopy,
                    cost: arrival.cost + costCounter.cost
                });
            }
        }

        near_matches[pos % near_matches.length] = last_seen[data[pos]];
        last_seen[data[pos]] = pos;

        if (progressCallback) progressCallback(pos + 1);
    }

    // Reconstruct ops from parse chain
    const finalArrivals = arrivals.get(data.length);
    if (!finalArrivals || finalArrivals.length === 0) {
        return [];
    }

    let parse = finalArrivals[0].parse;
    const ops = [];
    while (parse) {
        ops.push(parse);
        parse = parse.prev;
    }
    ops.reverse();
    return ops;
}

function optimalPack(data, level, config, progressCallback) {
    const ops = optimalParse(data, level, config, progressCallback);
    const encoder = createRansEncoder(config);
    const state = createCoderState(config);

    for (const op of ops) {
        if (op.type === 'literal') {
            lzEncodeLiteral(encoder, state.contexts, op.value, state, config, false);
        } else {
            lzEncodeMatch(encoder, state.contexts, op.offset, op.length, state, config, false);
        }
    }

    lzEncodeEof(encoder, state.contexts, state, config, false);
    return ransEncoderFinish(encoder);
}

// ============================================================================
// Reverse helper
// ============================================================================

function reverseArray(arr) {
    const result = new Uint8Array(arr);
    for (let i = 0, j = result.length - 1; i < j; i++, j--) {
        const tmp = result[i];
        result[i] = result[j];
        result[j] = tmp;
    }
    return result;
}

// ============================================================================
// Config presets
// ============================================================================

function upkrConfigZ80() {
    const config = upkrDefaultConfig();
    config.use_bitstream = true;
    config.bitstream_is_big_endian = true;
    config.invert_bit_encoding = true;
    config.simplified_prob_update = true;
    return config;
}

function upkrConfigX86() {
    const config = upkrDefaultConfig();
    config.use_bitstream = true;
    config.is_match_bit = false;
    config.continue_value_bit = false;
    config.new_offset_bit = false;
    return config;
}

function upkrConfigX86b() {
    const config = upkrDefaultConfig();
    config.use_bitstream = true;
    config.continue_value_bit = false;
    config.no_repeated_offsets = true;
    return config;
}

// ============================================================================
// Public API
// ============================================================================

function compress(data, level, config, reverse) {
    if (level === undefined || level === null) level = 1;
    if (!config) config = upkrDefaultConfig();
    let input = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (reverse) input = reverseArray(input);

    let result;
    if (level === 0) {
        result = greedyPack(input, config, null);
    } else {
        result = optimalPack(input, level, config, null);
    }

    if (reverse) result = reverseArray(result);
    return result;
}

function decompress(packedData, config, reverse) {
    if (!config) config = upkrDefaultConfig();
    let data = packedData instanceof Uint8Array ? packedData : new Uint8Array(packedData);

    if (reverse) data = reverseArray(data);

    const decoder = createRansDecoder(data, config);
    const ctxSize = contextStateSize(config);
    const contexts = createContextState(ctxSize, config);

    let offset = 0;
    let position = 0;
    let prev_was_match = false;
    const result = [];

    function decodeLength(contextIndex) {
        let length = 0;
        let bitPos = 0;
        while (ransDecodeWithContext(decoder, contexts, contextIndex) === config.continue_value_bit) {
            const bit = ransDecodeWithContext(decoder, contexts, contextIndex + 1);
            length |= (bit ? 1 : 0) << bitPos;
            bitPos++;
            if (bitPos >= 32) {
                throw new Error('Value overflow during decompression');
            }
            contextIndex += 2;
        }
        return length | (1 << bitPos);
    }

    for (;;) {
        const literalBase = position % config.parity_contexts * 256;
        if (ransDecodeWithContext(decoder, contexts, literalBase) === config.is_match_bit) {
            if (config.no_repeated_offsets || prev_was_match ||
                ransDecodeWithContext(decoder, contexts, 256 * config.parity_contexts) === config.new_offset_bit) {
                offset = decodeLength(256 * config.parity_contexts + 1) - (config.eof_in_length ? 0 : 1);
                if (offset === 0) {
                    break;
                }
            }
            const length = decodeLength(256 * config.parity_contexts + 65);
            if (config.eof_in_length && length === 1) {
                break;
            }
            if (offset > position) {
                throw new Error('Match offset out of range: ' + offset + ' > ' + position);
            }
            for (let i = 0; i < length; i++) {
                result.push(result[result.length - offset]);
            }
            position += length;
            prev_was_match = true;
        } else {
            let contextIndex = 1;
            let byte = 0;
            for (let i = 7; i >= 0; i--) {
                const bit = ransDecodeWithContext(decoder, contexts, literalBase + contextIndex);
                contextIndex = (contextIndex << 1) | (bit ? 1 : 0);
                byte |= (bit ? 1 : 0) << i;
            }
            result.push(byte);
            position += 1;
            prev_was_match = false;
        }
    }

    let out = new Uint8Array(result);
    if (reverse) out = reverseArray(out);
    return out;
}

function compressArray(inputArray, level, config, reverse) {
    const inputData = inputArray instanceof Uint8Array ? inputArray : new Uint8Array(inputArray);
    return compress(inputData, level, config, reverse);
}

function decompressArray(inputArray, config, reverse) {
    const inputData = inputArray instanceof Uint8Array ? inputArray : new Uint8Array(inputArray);
    return decompress(inputData, config, reverse);
}

// ============================================================================
// Export
// ============================================================================

if (typeof window !== 'undefined') {
    window.UPKR = {
        compress,
        decompress,
        compressArray,
        decompressArray,
        defaultConfig: upkrDefaultConfig,
        configZ80: upkrConfigZ80,
        configX86: upkrConfigX86,
        configX86b: upkrConfigX86b
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        compress,
        decompress,
        compressArray,
        decompressArray,
        defaultConfig: upkrDefaultConfig,
        configZ80: upkrConfigZ80,
        configX86: upkrConfigX86,
        configX86b: upkrConfigX86b
    };
}
})();
