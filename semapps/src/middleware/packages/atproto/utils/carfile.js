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

// note: this function expects block CIDS and values to be pre-serialised, but not roots!
// exact match to Python's serialise function
function serialise(roots, blocks) {
    // Ensure roots is an array of CID objects
    if (!Array.isArray(roots)) {
        throw new Error('roots must be an array of CID objects');
    }
    
    // Ensure blocks is an array of [cid_bytes, data_bytes] tuples
    if (!Array.isArray(blocks)) {
        throw new Error('blocks must be an array of [cid_bytes, data_bytes] tuples');
    }
    
    let result = new Uint8Array(0);
    
    // Import dagCbor dynamically
    const dagCbor = require('@ipld/dag-cbor');
    
    // Encode header exactly as in Python: { version: 1, roots: roots }
    const header = dagCbor.encode({
        version: 1,
        roots: roots
    });
    
    // Concatenate header length + header
    const headerLenBytes = varint_encode(header.length);
    result = concatUint8Arrays(result, headerLenBytes, header);
    
    // Process blocks exactly like Python version
    for (const [block_cid, block_data] of blocks) {
        if (!(block_cid instanceof Uint8Array) || !(block_data instanceof Uint8Array)) {
            throw new Error('block_cid and block_data must be Uint8Array instances');
        }
        const totalLen = block_cid.length + block_data.length;
        const lenBytes = varint_encode(totalLen);
        result = concatUint8Arrays(result, lenBytes, block_cid, block_data);
    }
    
    return result;
}

// Helper function to concatenate Uint8Arrays (since JS doesn't have Python's += for bytes)
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

module.exports = {
    varint_encode,
    serialise,
    concatUint8Arrays
}; 