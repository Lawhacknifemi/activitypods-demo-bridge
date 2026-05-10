// mst.js - Canonical atproto MST implementation for SemApps
// Ported from demo-pds-js/mst.js (ES module) to CommonJS
// Spec: https://atproto.com/specs/repository#mst-structure

const { hashToCid } = require('./atproto-utils');

// ─── Helpers ────────────────────────────────────────────────────────────────

function countPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

async function leadingZerosOnHash(key) {
  const crypto = require('node:crypto');
  const hash = crypto.createHash('sha256').update(Buffer.from(key)).digest();
  let total = 0;
  for (const byte of hash) {
    if (byte & 0xc0) break;
    if (byte === 0x00) { total += 4; continue; }
    if ((byte & 0xfc) === 0x00)      total += 3;
    else if ((byte & 0xf0) === 0x00) total += 2;
    else                              total += 1;
    break;
  }
  return total;
}

function isValidMstKey(key) {
  if (key.length > 256) return false;
  const parts = key.split('/');
  if (parts.length !== 2 || parts[1].length === 0) return false;
  return /^[a-zA-Z0-9_:.-]+$/.test(parts[0]) && /^[a-zA-Z0-9_:.-]+$/.test(parts[1]);
}

function ensureValidMstKey(key) {
  if (!isValidMstKey(key)) throw new Error(`Not a valid MST key: ${key}`);
}

// ─── NodeEntry ───────────────────────────────────────────────────────────────

class NodeEntry {
  constructor(kind, key = '', val = null, tree = null) {
    this.kind = kind; // 'leaf' | 'tree' | 'undefined'
    this.key  = key;
    this.val  = val;
    this.tree = tree;
  }
  isLeaf()      { return this.kind === 'leaf'; }
  isTree()      { return this.kind === 'tree'; }
  isUndefined() { return this.kind === 'undefined'; }
}

// ─── MemoryStorage ───────────────────────────────────────────────────────────

class MemoryStorage {
  constructor() { this.data = new Map(); }

  async put(nodeData) {
    const { dagCbor } = require('./atproto-utils');
    const bytes = await dagCbor.encode(nodeData);
    const cid   = await hashToCid(bytes);
    this.data.set(cid.toString(), { data: nodeData, bytes });
    return cid;
  }

  async get(cid) {
    const key   = typeof cid === 'string' ? cid : cid.toString();
    const entry = this.data.get(key);
    if (!entry) throw new Error(`CID not found in MemoryStorage: ${key}`);
    return entry.data;
  }
}

// ─── MST ─────────────────────────────────────────────────────────────────────

class MST {
  constructor(storage = null, entries = [], layer = 0) {
    this.storage   = storage;
    this.entries   = entries;
    this.layer     = layer;
    this._pointer  = null;
    this._validPtr = false;
  }

  static create(storage) {
    return new MST(storage, [], 0);
  }

  static async load(storage, cid) {
    const mst = new MST(storage, null, -1);
    mst._pointer  = cid;
    mst._validPtr = true;
    return mst;
  }

  // ── Layer ──────────────────────────────────────────────────────────────────

  async getLayer() {
    if (this.layer >= 0) return this.layer;
    const entries = await this.getEntries();
    for (const e of entries) {
      if (e.isLeaf()) { this.layer = await leadingZerosOnHash(e.key); return this.layer; }
    }
    for (const e of entries) {
      if (e.isTree()) {
        const cl = await e.tree.getLayer();
        if (cl >= 0) { this.layer = cl + 1; return this.layer; }
      }
    }
    return 0;
  }

  // ── Entries ────────────────────────────────────────────────────────────────

  async getEntries() {
    if (this.entries !== null) return this.entries;
    if (this._pointer) {
      const data = await this.storage.get(this._pointer);
      this.entries = await this.deserializeNodeData(data);
      return this.entries;
    }
    throw new Error('MST: no entries or pointer available');
  }

  setEntries(entries) { this.entries = entries; }

  // ── Pointer / CID ──────────────────────────────────────────────────────────

  async getPointer() {
    if (this._validPtr && this._pointer) return this._pointer;
    const entries  = await this.getEntries();
    const nodeData = await this.serializeNodeData(entries);
    const { dagCbor } = require('./atproto-utils');
    const bytes    = await dagCbor.encode(nodeData);
    this._pointer  = await hashToCid(bytes);
    this._validPtr = true;
    return this._pointer;
  }

  // ── Serialization (canonical atproto format) ───────────────────────────────
  //
  // Node CBOR map: { e: [ {p, k, v, t} ... ], l: CID|null }
  //   l  = left-most subtree CID (or null)
  //   e  = array of entries, each:
  //     p = prefix length shared with previous key (int)
  //     k = key suffix bytes (Uint8Array)
  //     v = record CID
  //     t = right subtree CID (or null)

  async serializeNodeData(entries) {
    let i        = 0;
    let lastKey  = '';
    let eArr     = [];
    let leftPtr  = null;

    // Optional leading tree node becomes `l`
    if (entries.length > 0 && entries[0].isTree()) {
      leftPtr = await entries[0].tree.getPointer();
      i++;
    }

    for (; i < entries.length; i++) {
      const entry = entries[i];

      if (entry.isLeaf()) {
        const prefixLen  = countPrefixLen(lastKey, entry.key);
        const keySuffix  = entry.key.slice(prefixLen);
        const kBytes     = new TextEncoder().encode(keySuffix);

        // val: store as CID object if it looks like a CID string
        let v = entry.val;
        if (typeof v === 'string' && /^bafy[a-z2-7]+$/.test(v)) {
          try {
            const { CID } = await import('multiformats/cid');
            v = CID.parse(v);
          } catch (_) {}
        }

        eArr.push({ p: prefixLen, k: kBytes, v, t: null });
        lastKey = entry.key;

      } else if (entry.isTree()) {
        // Tree after a leaf → right subtree of the previous entry
        if (eArr.length === 0) throw new Error('MST serialize: tree in invalid position');
        eArr[eArr.length - 1].t = await entry.tree.getPointer();

      } else {
        throw new Error('MST serialize: undefined entry');
      }
    }

    return { e: eArr, l: leftPtr };
  }

  async deserializeNodeData(data) {
    const eArr    = data.e || [];
    const leftPtr = data.l || null;
    const entries = [];
    let lastKey   = '';

    if (leftPtr) {
      entries.push(new NodeEntry('tree', '', null, await MST.load(this.storage, leftPtr)));
    }

    for (const item of eArr) {
      const suffix = new TextDecoder().decode(item.k);
      const key    = lastKey.slice(0, item.p) + suffix;

      let v = item.v;
      if (v && typeof v === 'object' && v.asCID) v = v.toString();

      entries.push(new NodeEntry('leaf', key, v));

      if (item.t) {
        entries.push(new NodeEntry('tree', key, null, await MST.load(this.storage, item.t)));
      }

      lastKey = key;
    }

    return entries;
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  async add(key, val, knownZeros = -1) {
    ensureValidMstKey(key);
    if (val === null || val === undefined) throw new Error('MST.add: value cannot be null');

    const keyZeros = knownZeros >= 0 ? knownZeros : await leadingZerosOnHash(key);
    const layer    = await this.getLayer();
    const newLeaf  = new NodeEntry('leaf', key, val);

    if (keyZeros === layer)  return this._addToLayer(newLeaf);
    if (keyZeros < layer)    return this._addToLowerLayer(key, val, keyZeros);
    return this._addToHigherLayer(key, val, keyZeros);
  }

  async _addToLayer(newLeaf) {
    const entries = await this.getEntries();
    const idx     = this._findGtOrEqualLeafIndex(entries, newLeaf.key);

    if (idx < entries.length && entries[idx].isLeaf() && entries[idx].key === newLeaf.key) {
      throw new Error(`MST: key already exists: ${newLeaf.key}`);
    }

    const newEntries = [...entries];
    newEntries.splice(idx, 0, newLeaf);
    return new MST(this.storage, newEntries, this.layer);
  }

  async _addToLowerLayer(key, val, keyZeros) {
    const entries = await this.getEntries();
    const idx     = this._findGtOrEqualLeafIndex(entries, key);
    const prev    = idx > 0 ? entries[idx - 1] : new NodeEntry('undefined');

    let newEntries;
    if (prev.isTree()) {
      const newSub = await prev.tree.add(key, val, keyZeros);
      newEntries   = [...entries];
      newEntries[idx - 1] = new NodeEntry('tree', '', null, newSub);
    } else {
      const sub    = new MST(this.storage, [], this.layer - 1);
      const newSub = await sub.add(key, val, keyZeros);
      newEntries   = [...entries];
      newEntries.splice(idx, 0, new NodeEntry('tree', '', null, newSub));
    }
    return new MST(this.storage, newEntries, this.layer);
  }

  async _addToHigherLayer(key, val, keyZeros) {
    const [left, right] = await this._splitAround(key);
    const newLeaf       = new NodeEntry('leaf', key, val);
    const newEntries    = [];

    if (left)  newEntries.push(new NodeEntry('tree', '', null, left));
    newEntries.push(newLeaf);
    if (right) newEntries.push(new NodeEntry('tree', '', null, right));

    return new MST(this.storage, newEntries, keyZeros);
  }

  _findGtOrEqualLeafIndex(entries, key) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isLeaf() && entries[i].key >= key) return i;
    }
    return entries.length;
  }

  async _splitAround(key) {
    const entries = await this.getEntries();
    const idx     = this._findGtOrEqualLeafIndex(entries, key);
    const left    = idx > 0          ? new MST(this.storage, entries.slice(0, idx), this.layer) : null;
    const right   = idx < entries.length ? new MST(this.storage, entries.slice(idx),    this.layer) : null;
    return [left, right];
  }

  // ── Walk / Query ───────────────────────────────────────────────────────────

  async walkLeaves(callback) {
    const entries = await this.getEntries();
    for (const e of entries) {
      if (e.isLeaf())       await callback(e.key, e.val);
      else if (e.isTree())  await e.tree.walkLeaves(callback);
    }
  }

  async getKeys() {
    const keys = [];
    await this.walkLeaves(k => keys.push(k));
    return keys.sort();
  }

  async get(key) {
    const entries = await this.getEntries();
    for (const e of entries) {
      if (e.isLeaf() && e.key === key) return e.val;
      if (e.isTree()) {
        const r = await e.tree.get(key);
        if (r !== null) return r;
      }
    }
    return null;
  }

  // Collect all reachable nodes (for CAR completeness)
  async collectAllNodes() {
    const seen  = new Set();
    const nodes = [];
    const walk  = async node => {
      const ptr = await node.getPointer();
      const key = ptr.toString();
      if (seen.has(key)) return;
      seen.add(key);
      const entries  = await node.getEntries();
      const nodeData = await node.serializeNodeData(entries);
      nodes.push([ptr, nodeData]);
      for (const e of entries) {
        if (e.isTree()) await walk(e.tree);
      }
    };
    await walk(this);
    return nodes;
  }
}

module.exports = { MST, MemoryStorage, NodeEntry, leadingZerosOnHash, isValidMstKey, ensureValidMstKey };
