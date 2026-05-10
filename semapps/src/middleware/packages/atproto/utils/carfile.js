// carfile.js - CAR file serialization utility for SemApps atproto package

// leb128 - exact match to Python's varint_encode
function varint_encode(n) {
    const result = [];
    while (n) {
        const x = n % 128;
        n = Math.floor(n / 128);
        result.push(x | ((n !== 0) << 7));
    }
    return new Uint8Array(result);
}

// Helper function to concatenate Uint8Arrays
function concatUint8Arrays(...arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

// Cached dagCbor module (loaded once via dynamic import)
let _dagCbor = null;
async function getDagCbor() {
    if (!_dagCbor) {
        _dagCbor = await import('@ipld/dag-cbor');
    }
    return _dagCbor;
}

/**
 * Serialize roots and blocks into a CAR v1 file.
 * roots  - array of CID objects (not pre-serialized)
 * blocks - array of [cid_bytes, data_bytes] where both are Uint8Array/Buffer
 */
async function serialise(roots, blocks) {
    if (!Array.isArray(roots)) throw new Error('roots must be an array of CID objects');
    if (!Array.isArray(blocks)) throw new Error('blocks must be an array of [cid_bytes, data_bytes] tuples');

    const dagCbor = await getDagCbor();

    // Encode CAR v1 header: { version: 1, roots: [CID, ...] }
    const header = dagCbor.encode({ version: 1, roots });

    const headerLenBytes = varint_encode(header.length);
    let result = concatUint8Arrays(headerLenBytes, header);

    for (const [block_cid, block_data] of blocks) {
        // Accept both Buffer and Uint8Array
        const cidBytes = block_cid instanceof Uint8Array ? block_cid : new Uint8Array(block_cid);
        const dataBytes = block_data instanceof Uint8Array ? block_data : new Uint8Array(block_data);

        const totalLen = cidBytes.length + dataBytes.length;
        const lenBytes = varint_encode(totalLen);
        result = concatUint8Arrays(result, lenBytes, cidBytes, dataBytes);
    }

    return result;
}

module.exports = { varint_encode, serialise, concatUint8Arrays };
