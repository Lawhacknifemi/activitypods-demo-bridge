const crypto = require('node:crypto');

// Dynamic imports for ES modules
let CID, dagCbor, sha256;

// Initialize ES modules dynamically
async function initModules() {
  if (!CID) {
    const multiformats = await import('multiformats');
    CID = multiformats.CID;
  }
  if (!dagCbor) {
    const dagCborModule = await import('@ipld/dag-cbor');
    dagCbor = dagCborModule;
  }
  if (!sha256) {
    const sha2Module = await import('multiformats/hashes/sha2');
    sha256 = sha2Module.sha256;
  }
}

const B32_CHARSET = "234567abcdefghijklmnopqrstuvwxyz";

function base32Encode(bytes) {
    let bits = 0;
    let value = 0;
    let output = '';
    
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;
        
        while (bits >= 5) {
            output += B32_CHARSET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    
    if (bits > 0) {
        output += B32_CHARSET[(value << (5 - bits)) & 31];
    }
    
    return output;
}

function tidNow() {
    // Generate a proper timestamp-based TID matching the Go implementation
    // TID format: 13 characters, base32 encoded timestamp with clock ID
    
    const now = Date.now();
    const micros = now * 1000; // Convert to microseconds
    const clockId = Math.floor(Math.random() * 1024); // 10-bit clock ID (0-1023)
    
    // Format: (timestamp << 10) | clockId
    // Use a smaller timestamp range to avoid truncation
    const timestamp = BigInt(micros) & BigInt(0x1F_FFFF_FFFF_FFFF); // 45 bits for timestamp
    const value = (timestamp << BigInt(10)) | BigInt(clockId);
    
    // Convert to base32 string
    let s = "";
    let v = value;
    for (let i = 0; i < 13; i++) {
        s = B32_CHARSET[Number(v & BigInt(0x1F))] + s;
        v = v >> BigInt(5);
    }
    
    return s;
}

async function hashToCid(data, codec = "dag-cbor") {
    await initModules();
    const hash = await sha256.digest(data);
    const cid = CID.create(1, codec === "dag-cbor" ? 0x71 : 0x55, hash);
    return cid;
}

function cleanObject(obj) {
    if (obj === null || obj === undefined) {
        return null;
    }
    if (typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(cleanObject);
    }
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            cleaned[key] = cleanObject(value);
        }
    }
    return cleaned;
}

function generateRkey() {
    const bytes = crypto.randomBytes(8);
    return base32Encode(bytes);
}

module.exports = {
    base32Encode,
    tidNow,
    hashToCid,
    cleanObject,
    generateRkey,
    dagCbor: {
        encode: async (obj) => {
            await initModules();
            return dagCbor.encode(obj);
        }
    }
};

// Export MST utilities
const { MST, MemoryStorage, NodeEntry, leadingZerosOnHash, isValidMstKey, ensureValidMstKey } = require('./mst');

module.exports.MST = MST;
module.exports.MemoryStorage = MemoryStorage;
module.exports.NodeEntry = NodeEntry;
module.exports.leadingZerosOnHash = leadingZerosOnHash;
module.exports.isValidMstKey = isValidMstKey;
module.exports.ensureValidMstKey = ensureValidMstKey;

// Export Repo utilities
const { Repo } = require('./repo');

module.exports.Repo = Repo; 