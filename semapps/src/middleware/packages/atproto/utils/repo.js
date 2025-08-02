// repo.js - Repository implementation for SemApps atproto package

const { EventEmitter } = require('events');
const { MST, MemoryStorage, tidNow, hashToCid, cleanObject } = require('./atproto-utils');

/**
 * Repository class for atproto
 * Manages commits, blocks, and record storage
 */
class Repo extends EventEmitter {
    constructor(did, storage, signingKey, tree) {
        super();
        this.did = did;
        this.storage = storage; // RDF storage instead of SQLite
        this.signingKey = signingKey;
        this.tree = tree || MST.create(new MemoryStorage());
        this.commitSeq = 0;
        this.logger = console; // Simple console logger for now
    }

    /**
     * Initialize a new repository
     * @param {string} did - The DID for the repository
     * @param {any} storage - Storage backend
     * @param {any} signingKey - Signing key for commits
     * @param {MST} tree - Optional MST instance
     * @returns {Repo} Initialized repository
     */
    static async initialize(did, storage, signingKey, tree) {
        const repo = new Repo(did, storage, signingKey, tree || MST.create(new MemoryStorage()));
        
        // Create dataset if it doesn't exist
        try {
            await repo.createDataset();
        } catch (error) {
            repo.logger.warn(`Failed to create dataset for ${did}:`, error.message);
        }
        
        // Create initial commit if needed
        const initialCommit = await repo.getLatestCommit();
        if (!initialCommit) {
            await repo.createInitialCommit();
        }
        
        return repo;
    }

    /**
     * Create the dataset for this DID if it doesn't exist
     */
    async createDataset() {
        this.logger.info('Creating dataset for DID:', this.did);
        
        // Check if dataset exists
        const datasetExists = await this.storage('query', {
            query: 'ASK WHERE { ?s ?p ?o }',
            dataset: this.did,
            webId: 'system'
        }).catch(() => false);
        
        if (!datasetExists) {
            // Create dataset using the dataset service
            // We need to call the dataset service directly since we're in a utility class
            // For now, we'll try to create it by inserting a simple triple
            const testRecord = {
                '@context': {
                    '@vocab': 'https://atproto.com/ns#'
                },
                '@id': `${this.did}/init`,
                '@type': ['Repository'],
                'hasDid': this.did,
                'createdAt': new Date().toISOString()
            };
            
            await this.storage('insert', {
                resource: testRecord,
                contentType: 'application/json',
                dataset: this.did,
                webId: 'system'
            });
            
            this.logger.info('Dataset created for DID:', this.did);
        } else {
            this.logger.info('Dataset already exists for DID:', this.did);
        }
    }

    /**
     * Create the initial commit for an empty repository
     */
    async createInitialCommit() {
        this.logger.info('Creating initial commit for repository:', this.did);
        
        // Get the root node's CID and serialized data
        const entries = await this.tree.getEntries();
        
        // For initial commit, data should be null if MST is empty
        let rootCid = null;
        let rootSerialized = null;
        
        if (entries.length > 0) {
            rootCid = await this.tree.getPointer();
            const nodeData = await this.tree.serializeNodeData(entries);
            rootSerialized = await this.tree.encodeNodeData(nodeData);
        }
        
        const commit = cleanObject({
            version: 3,
            data: rootCid,
            rev: tidNow(),
            did: this.did,
            prev: null
        });
        
        const commitBlob = await this.encodeCommit(commit);
        const commitCid = await hashToCid(commitBlob);
        
        // TODO: Add proper signing when signingKey is available
        // const sig = await this.signCommit(commit);
        // commit.sig = sig;
        
        // Store commit in RDF
        await this.storeCommit(0, commitCid.toString(), commit);
        
        // Store root block if it exists
        if (rootCid && rootSerialized) {
            await this.storeBlock(rootCid.toString(), rootSerialized);
        }
        
        // Store commit block
        await this.storeBlock(commitCid.toString(), commitBlob);
        
        this.commitSeq = 0;
        this.logger.info('Initial commit created:', commitCid.toString());
    }

    /**
     * Create a new commit for a record operation
     * @param {string} collection - The collection name
     * @param {string} rkey - The record key
     * @param {string} valueCid - The record value CID
     * @param {Set} referencedBlobs - Set of referenced blob CIDs
     * @returns {Object} Commit result with firehose message
     */
    async createCommit(collection, rkey, valueCid, referencedBlobs = new Set()) {
        this.logger.info('Creating commit for record:', rkey);
        
        const latestCommit = await this.getLatestCommit();
        const prevCommitSeq = latestCommit ? latestCommit.seq : -1;
        const prevCommit = latestCommit ? latestCommit.commit : null;
        
        const newCommitRev = tidNow();
        
        // Create unsigned commit first (without signature)
        const unsignedCommit = {
            version: 3,
            data: (await this.tree.getPointer()).toString(),
            rev: newCommitRev,
            prev: prevCommit ? prevCommit.cid : null,
            did: this.did
        };
        
        // TODO: Add proper signing when signingKey is available
        // const signature = await this.signCommit(unsignedCommit);
        
        // Create the final commit with signature and clean any undefined values
        const commit = cleanObject({
            ...unsignedCommit,
            // sig: signature
        });
        
        const commitBytes = await this.encodeCommit(commit);
        const commitCid = await hashToCid(commitBytes);
        
        const recordKey = `${collection}/${rkey}`;
        const uri = `at://${this.did}/${recordKey}`;
        
        // Store commit in RDF
        await this.storeCommit(prevCommitSeq + 1, commitCid.toString(), commit);
        
        // Store commit block
        await this.storeBlock(commitCid.toString(), commitBytes);
        
        // Store record reference
        await this.storeRecord(recordKey, valueCid.toString(), commitCid.toString());
        
        // Update commit sequence
        this.commitSeq = prevCommitSeq + 1;
        
        // Create firehose message
        const firehoseMsg = await this.createFirehoseMessage(
            collection, rkey, valueCid, commitCid, this.commitSeq, newCommitRev, referencedBlobs
        );
        
        this.logger.info('Commit created successfully:', commitCid.toString());
        
        return { firehoseMsg, uri, cid: valueCid, commitCid: commitCid.toString(), commitSeq: this.commitSeq };
    }

    /**
     * Get the latest commit
     * @returns {Object|null} Latest commit or null
     */
    async getLatestCommit() {
        // Query RDF for latest commit
        const query = `
            PREFIX atproto: <https://atproto.com/ns#>
            
            SELECT ?seq ?commitCid ?commitData
            WHERE {
                ?commit a atproto:Commit ;
                        atproto:hasSeq ?seq ;
                        atproto:hasCid ?commitCid ;
                        atproto:hasData ?commitData .
            }
            ORDER BY DESC(?seq)
            LIMIT 1
        `;
        
        try {
            const result = await this.storage('query', { query, dataset: this.did, webId: 'system' });
            if (result.results && result.results.bindings.length > 0) {
                const binding = result.results.bindings[0];
                return {
                    seq: parseInt(binding.seq.value),
                    cid: binding.commitCid.value,
                    commit: JSON.parse(binding.commitData.value)
                };
            }
        } catch (error) {
            this.logger.warn('No commits found, repository may be empty');
        }
        
        return null;
    }

    /**
     * Store a commit in RDF
     * @param {number} seq - Commit sequence number
     * @param {string} cid - Commit CID
     * @param {Object} commit - Commit data
     */
    async storeCommit(seq, cid, commit) {
        const commitRecord = {
            '@context': {
                '@vocab': 'https://atproto.com/ns#'
            },
            '@id': `${this.did}/commits/${seq}`,
            '@type': ['Commit'],
            'hasSeq': seq,
            'hasCid': cid,
            'hasData': JSON.stringify(commit),
            'hasDid': this.did,
            'createdAt': new Date().toISOString()
        };
        
        await this.storage('insert', {
            resource: commitRecord,
            contentType: 'application/ld+json',
            dataset: this.did,
            webId: 'system'
        });
    }

    /**
     * Store a block in RDF
     * @param {string} cid - Block CID
     * @param {Uint8Array} data - Block data
     */
    async storeBlock(cid, data) {
        const blockRecord = {
            '@context': {
                '@vocab': 'https://atproto.com/ns#'
            },
            '@id': `${this.did}/blocks/${cid}`,
            '@type': ['Block'],
            'hasCid': cid,
            'hasData': Buffer.from(data).toString('base64'),
            'hasDid': this.did,
            'createdAt': new Date().toISOString()
        };
        
                    await this.storage('insert', {
                resource: blockRecord,
                contentType: 'application/ld+json',
                dataset: this.did,
                webId: 'system'
            });
    }

    /**
     * Store a record reference in RDF
     * @param {string} recordKey - Record key
     * @param {string} recordCid - Record CID
     * @param {string} commitCid - Commit CID
     */
    async storeRecord(recordKey, recordCid, commitCid) {
        const recordRef = {
            '@context': {
                '@vocab': 'https://atproto.com/ns#'
            },
            '@id': `${this.did}/records/${recordKey}`,
            '@type': ['RecordReference'],
            'hasKey': recordKey,
            'hasCid': recordCid,
            'hasCommitCid': commitCid,
            'hasDid': this.did,
            'createdAt': new Date().toISOString()
        };
        
        await this.storage('insert', {
            resource: recordRef,
            contentType: 'application/ld+json',
            dataset: this.did,
            webId: 'system'
        });
    }

    /**
     * Encode a commit object
     * @param {Object} commit - Commit object
     * @returns {Uint8Array} Encoded commit
     */
    async encodeCommit(commit) {
        const { dagCbor } = require('./atproto-utils');
        return await dagCbor.encode(commit);
    }

    /**
     * Create a firehose message
     * @param {string} collection - Collection name
     * @param {string} rkey - Record key
     * @param {string} valueCid - Value CID
     * @param {string} commitCid - Commit CID
     * @param {number} seq - Sequence number
     * @param {string} rev - Revision
     * @param {Set} referencedBlobs - Referenced blobs
     * @returns {Buffer} Firehose message
     */
    async createFirehoseMessage(collection, rkey, valueCid, commitCid, seq, rev, referencedBlobs) {
        const { dagCbor } = require('./atproto-utils');
        
        const ops = [{ action: 'create', cid: valueCid, path: `${collection}/${rkey}` }];
        const header = { t: '#commit', op: 1 };
        
        const body = {
            ops: ops,
            seq: seq,
            rev: rev,
            since: rev, // TODO: Get previous rev
            repo: this.did,
            time: new Date().toISOString(),
            blobs: Array.from(referencedBlobs),
            blocks: [], // TODO: Implement block serialization
            commit: commitCid,
            rebase: false,
            tooBig: false,
        };
        
        const headerBytes = await dagCbor.encode(header);
        const bodyBytes = await dagCbor.encode(body);
        
        return Buffer.concat([headerBytes, bodyBytes]);
    }

    /**
     * Get a record from the repository
     * @param {string} collection - Collection name
     * @param {string} rkey - Record key
     * @returns {Object|null} Record or null
     */
    async getRecord(collection, rkey) {
        const recordKey = `${collection}/${rkey}`;
        
        const query = `
            PREFIX atproto: <https://atproto.com/ns#>
            
            SELECT ?recordCid ?commitCid
            WHERE {
                ?ref a atproto:RecordReference ;
                     atproto:hasKey "${recordKey}" ;
                     atproto:hasCid ?recordCid ;
                     atproto:hasCommitCid ?commitCid .
            }
        `;
        
        try {
            const result = await this.storage('query', { query, dataset: this.did, webId: 'system' });
            if (result.results && result.results.bindings.length > 0) {
                const binding = result.results.bindings[0];
                return {
                    cid: binding.recordCid.value,
                    commitCid: binding.commitCid.value
                };
            }
        } catch (error) {
            this.logger.warn('Record not found:', recordKey);
        }
        
        return null;
    }

    /**
     * List records for a collection
     * @param {Object} params - Parameters
     * @param {string} params.collection - Collection name
     * @param {number} params.limit - Limit
     * @param {string} params.cursor - Cursor
     * @param {boolean} params.reverse - Reverse order
     * @returns {Object} Records list
     */
    async listRecordsForCollection({ collection, limit = 50, cursor = null, reverse = false }) {
        let query = `
            PREFIX atproto: <https://atproto.com/ns#>
            
            SELECT ?rkey ?recordCid ?commitCid
            WHERE {
                ?ref a atproto:RecordReference ;
                     atproto:hasKey ?recordKey ;
                     atproto:hasCid ?recordCid ;
                     atproto:hasCommitCid ?commitCid .
                FILTER(STRSTARTS(?recordKey, "${collection}/"))
                BIND(REPLACE(?recordKey, "${collection}/", "") AS ?rkey)
            }
        `;
        
        if (cursor) {
            if (reverse) {
                query += ` FILTER(?rkey > "${cursor}")`;
            } else {
                query += ` FILTER(?rkey < "${cursor}")`;
            }
        }
        
        query += ` ORDER BY ?rkey ${reverse ? 'ASC' : 'DESC'}`;
        query += ` LIMIT ${limit}`;
        
        try {
            const result = await this.storage('query', { query, dataset: this.did, webId: 'system' });
            const records = result.results.bindings.map(binding => ({
                rkey: binding.rkey.value,
                cid: binding.recordCid.value,
                commitCid: binding.commitCid.value
            }));
            
            const nextCursor = records.length > 0 ? records[records.length - 1].rkey : null;
            
            return {
                records,
                cursor: nextCursor
            };
        } catch (error) {
            this.logger.warn('Error listing records:', error);
            return { records: [], cursor: null };
        }
    }

    /**
     * Get the current MST tree
     * @returns {MST} Current MST tree
     */
    getTree() {
        return this.tree;
    }

    /**
     * Get the current commit sequence
     * @returns {number} Current commit sequence
     */
    getCommitSeq() {
        return this.commitSeq;
    }
}

module.exports = {
    Repo
}; 