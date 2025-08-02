// mst.js - MST implementation for SemApps atproto package

const { hashToCid } = require('./atproto-utils');

/**
 * Helper function to calculate shared prefix length between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Length of shared prefix
 */
function countPrefixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
        i++;
    }
    return i;
}

/**
 * Calculate leading zeros on hash for MST layering
 * @param {string} key - The key to hash
 * @returns {Promise<number>} Number of leading zero bits (in pairs for 4-bit fanout)
 */
async function leadingZerosOnHash(key) {
    const crypto = require('node:crypto');
    const keyBytes = new TextEncoder().encode(key);
    const hash = crypto.createHash('sha256').update(keyBytes).digest();
    let total = 0;
    
    for (const byte of hash) {
        if (byte & 0xC0) {
            // No leading pair of zero bits
            break;
        }
        if (byte === 0x00) {
            total += 4;
            continue;
        }
        if ((byte & 0xFC) === 0x00) {
            total += 3;
        } else if ((byte & 0xF0) === 0x00) {
            total += 2;
        } else {
            total += 1;
        }
        break;
    }
    return total;
}

/**
 * Validate MST key format
 * @param {string} key - The key to validate
 * @returns {boolean} Whether the key is valid
 */
function isValidMstKey(key) {
    if (key.length > 256) return false;
    const parts = key.split('/');
    if (parts.length !== 2) return false;
    if (parts[1].length === 0) return false;
    
    const validChars = /^[a-zA-Z0-9_:.-]+$/;
    return validChars.test(parts[0]) && validChars.test(parts[1]);
}

/**
 * Ensure MST key is valid
 * @param {string} key - The key to validate
 * @throws {Error} If key is invalid
 */
function ensureValidMstKey(key) {
    if (!isValidMstKey(key)) {
        throw new Error(`Not a valid MST key: ${key}`);
    }
}

/**
 * MST Node Entry - represents either a leaf or tree pointer
 */
class NodeEntry {
    constructor(kind, key = '', val = null, tree = null) {
        this.kind = kind; // 'leaf', 'tree', or 'undefined'
        this.key = key;
        this.val = val;
        this.tree = tree;
    }

    isLeaf() {
        return this.kind === 'leaf';
    }

    isTree() {
        return this.kind === 'tree';
    }

    isUndefined() {
        return this.kind === 'undefined';
    }
}

/**
 * MST (Merkle Search Tree) implementation
 * Adapted from demo-pds-js for SemApps
 */
class MST {
    constructor(storage = null, entries = [], layer = 0, fanout = 4) {
        this.storage = storage;
        this.entries = entries;
        this.layer = layer;
        this.fanout = fanout;
        this._pointer = null;
        this._validPtr = false;
    }

    /**
     * Create a new empty MST
     * @param {any} storage - Storage backend
     * @returns {MST} New empty MST
     */
    static create(storage) {
        return new MST(storage, [], 0, 4);
    }

    /**
     * Load MST from CID
     * @param {any} storage - Storage backend
     * @param {string} cid - Root CID string
     * @returns {MST} Loaded MST
     */
    static async load(storage, cid) {
        const mst = new MST(storage, null, -1, 4);
        mst._pointer = cid;
        mst._validPtr = true;
        return mst;
    }

    /**
     * Get the layer of this MST node
     * @returns {Promise<number>} Layer number
     */
    async getLayer() {
        if (this.layer >= 0) {
            return this.layer;
        }

        const entries = await this.getEntries();
        if (entries.length === 0) {
            return 0;
        }

        // Find first leaf to determine layer
        for (const entry of entries) {
            if (entry.isLeaf()) {
                this.layer = await leadingZerosOnHash(entry.key);
                return this.layer;
            }
        }

        // If no leaves, check subtrees
        for (const entry of entries) {
            if (entry.isTree()) {
                const childLayer = await entry.tree.getLayer();
                if (childLayer >= 0) {
                    this.layer = childLayer + 1;
                    return this.layer;
                }
            }
        }

        return 0;
    }

    /**
     * Get entries (lazy load if needed)
     * @returns {Promise<NodeEntry[]>} Array of entries
     */
    async getEntries() {
        if (this.entries !== null) {
            return this.entries;
        }

        if (this._pointer) {
            // Load from storage
            const data = await this.storage.get(this._pointer);
            this.entries = await this.deserializeNodeData(data);
            return this.entries;
        }

        throw new Error('No entries or pointer available');
    }

    /**
     * Set entries (for internal use after mutation)
     * @param {NodeEntry[]} entries - The new entries array
     */
    setEntries(entries) {
        this.entries = entries;
    }

    /**
     * Get pointer (CID) for this MST node
     * @returns {Promise<string>} Node CID string
     */
    async getPointer() {
        if (this._validPtr && this._pointer) {
            return this._pointer;
        }

        const entries = await this.getEntries();
        if (entries.length === 0) {
            return null;
        }

        const nodeData = await this.serializeNodeData(entries);
        const nodeBytes = await this.encodeNodeData(nodeData);
        this._pointer = await hashToCid(nodeBytes);
        this._validPtr = true;
        return this._pointer.toString();
    }

    /**
     * Add a key-value pair to the MST
     * @param {string} key - The key to add
     * @param {any} val - The value to add
     * @param {number} knownZeros - Known leading zeros (optional)
     * @returns {Promise<MST>} Updated MST
     */
    async add(key, val, knownZeros = -1) {
        ensureValidMstKey(key);
        
        const keyZeros = knownZeros >= 0 ? knownZeros : await leadingZerosOnHash(key);
        const newLeaf = new NodeEntry('leaf', key, val);
        
        return await this.addToLayer(newLeaf);
    }

    /**
     * Add a leaf to the current layer
     * @param {NodeEntry} newLeaf - The leaf to add
     * @returns {Promise<MST>} Updated MST
     */
    async addToLayer(newLeaf) {
        const entries = await this.getEntries();
        const insertIndex = this.findGtOrEqualLeafIndex(entries, newLeaf.key);
        
        // Insert the new leaf
        entries.splice(insertIndex, 0, newLeaf);
        
        // Check if we need to split
        if (entries.length > this.fanout) {
            const midIndex = Math.floor(entries.length / 2);
            const midKey = entries[midIndex].key;
            
            const [leftEntries, rightEntries] = await this.splitAround(midKey);
            
            // Create new tree with split entries
            const newTree = new MST(this.storage, leftEntries, this.layer + 1, this.fanout);
            const rightTree = new MST(this.storage, rightEntries, this.layer + 1, this.fanout);
            
            // Replace entries with tree pointers
            this.entries = [
                new NodeEntry('tree', '', null, newTree),
                new NodeEntry('tree', '', null, rightTree)
            ];
        }
        
        return this;
    }

    /**
     * Find the index of the first entry greater than or equal to the key
     * @param {NodeEntry[]} entries - Array of entries
     * @param {string} key - The key to search for
     * @returns {number} Index where the key should be inserted
     */
    findGtOrEqualLeafIndex(entries, key) {
        let low = 0;
        let high = entries.length;
        
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            const entry = entries[mid];
            
            if (entry.isLeaf()) {
                if (entry.key < key) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            } else {
                // For tree entries, we need to check the subtree
                low = mid + 1;
            }
        }
        
        return low;
    }

    /**
     * Split the tree around a key
     * @param {string} key - The key to split around
     * @returns {Promise<[NodeEntry[], NodeEntry[]]>} Left and right entries
     */
    async splitAround(key) {
        const entries = await this.getEntries();
        const splitIndex = this.findGtOrEqualLeafIndex(entries, key);
        
        return [
            entries.slice(0, splitIndex),
            entries.slice(splitIndex)
        ];
    }

    /**
     * Serialize node data for storage
     * @param {NodeEntry[]} entries - The entries to serialize
     * @returns {Promise<any>} Serialized data
     */
    async serializeNodeData(entries) {
        const serialized = [];
        
        for (const entry of entries) {
            if (entry.isLeaf()) {
                serialized.push({
                    type: 'leaf',
                    key: entry.key,
                    value: entry.val
                });
            } else if (entry.isTree()) {
                const pointer = await entry.tree.getPointer();
                serialized.push({
                    type: 'tree',
                    pointer: pointer
                });
            }
        }
        
        return serialized;
    }

    /**
     * Deserialize node data from storage
     * @param {any} data - The data to deserialize
     * @returns {Promise<NodeEntry[]>} Deserialized entries
     */
    async deserializeNodeData(data) {
        const entries = [];
        
        for (const item of data) {
            if (item.type === 'leaf') {
                entries.push(new NodeEntry('leaf', item.key, item.value));
            } else if (item.type === 'tree') {
                const tree = await MST.load(this.storage, item.pointer);
                entries.push(new NodeEntry('tree', '', null, tree));
            }
        }
        
        return entries;
    }

    /**
     * Encode node data for CID generation
     * @param {any} nodeData - The node data to encode
     * @returns {Promise<Uint8Array>} Encoded data
     */
    async encodeNodeData(nodeData) {
        const { dagCbor } = require('./atproto-utils');
        return await dagCbor.encode(nodeData);
    }

    /**
     * Walk through all leaves in the tree
     * @param {Function} callback - Callback function for each leaf
     */
    async walkLeaves(callback) {
        const entries = await this.getEntries();
        
        for (const entry of entries) {
            if (entry.isLeaf()) {
                await callback(entry.key, entry.val);
            } else if (entry.isTree()) {
                await entry.tree.walkLeaves(callback);
            }
        }
    }

    /**
     * Get all keys in the tree
     * @returns {Promise<string[]>} Array of keys
     */
    async getKeys() {
        const keys = [];
        await this.walkLeaves((key) => {
            keys.push(key);
        });
        return keys;
    }

    /**
     * Get a record by its key
     * @param {string} key - The key to look up
     * @returns {Promise<any|null>} The record value or null if not found
     */
    async get(key) {
        const entries = await this.getEntries();
        
        for (const entry of entries) {
            if (entry.isLeaf()) {
                if (entry.key === key) {
                    return entry.val;
                }
            } else if (entry.isTree()) {
                // Recursively search in subtree
                const result = await entry.tree.get(key);
                if (result !== null) {
                    return result;
                }
            }
        }
        
        return null;
    }
}

/**
 * Memory storage implementation for MST
 */
class MemoryStorage {
    constructor() {
        this.data = new Map();
    }

    async put(data) {
        const { dagCbor } = require('./atproto-utils');
        const bytes = await dagCbor.encode(data);
        const cid = await hashToCid(bytes);
        this.data.set(cid.toString(), data);
        return cid.toString();
    }

    async get(cid) {
        const data = this.data.get(cid);
        if (!data) {
            throw new Error(`Data not found for CID: ${cid}`);
        }
        return data;
    }
}

module.exports = {
    MST,
    MemoryStorage,
    NodeEntry,
    leadingZerosOnHash,
    isValidMstKey,
    ensureValidMstKey
}; 