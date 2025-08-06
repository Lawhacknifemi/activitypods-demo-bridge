const { tidNow, hashToCid, cleanObject, dagCbor, MST, MemoryStorage, Repo } = require('../utils/atproto-utils');

const AtprotoService = {
  name: 'atproto',
      settings: {
      baseUri: null,
      podProvider: false,
      mstStorage: null,
      repositories: new Map() // Store repositories by DID
    },
  dependencies: ['triplestore', 'jsonld'],
  
      async started() {
      // Initialize MST storage
      this.settings.mstStorage = new MemoryStorage();
      this.logger.info('Atproto service started with MST storage and repository support!');
    },


  
      actions: {
    // TODO: Add atproto-specific actions
    async hello(ctx) {
      return { message: 'Hello from atproto service!' };
    },


    
    // TODO: This is a basic implementation - will be enhanced later
    async createRecord(ctx) {
      // Handle both direct calls and REST API calls
      let { collection, record, rkey, did } = ctx.params;
      
      // Debug: Log what we're receiving
      this.logger.info('=== DEBUG: createRecord called ===');
      this.logger.info('ctx.params:', JSON.stringify(ctx.params, null, 2));
      this.logger.info('ctx.request:', ctx.request ? 'exists' : 'undefined');
      if (ctx.request) {
        this.logger.info('ctx.request.body:', JSON.stringify(ctx.request.body, null, 2));
        this.logger.info('ctx.request.headers:', JSON.stringify(ctx.request.headers, null, 2));
      }
      this.logger.info('ctx.meta:', JSON.stringify(ctx.meta, null, 2));
      
      // For REST API calls, moleculer-web merges URL params with request body
      // So ctx.params contains both URL parameters and the record data
      // We need to extract the record data by removing the URL parameters
      if (!record) {
        // Create a copy of ctx.params and remove the URL parameters
        const allParams = { ...ctx.params };
        delete allParams.did;
        delete allParams.collection;
        delete allParams.rkey;
        
        // If there are remaining parameters, they are the record data
        if (Object.keys(allParams).length > 0) {
          record = allParams;
        }
      }
      
      // URL parameters are already in ctx.params from moleculer-web
      did = ctx.params.did || did;
      collection = ctx.params.collection || collection;
      rkey = ctx.params.rkey || rkey;
      
      this.logger.info('Creating atproto record:', { collection, rkey, did });
      
      // Validation
      if (!collection || !record || !did) {
        throw new Error('Missing required parameters: collection, record, did');
      }
      
      // Generate rkey if not provided
      const recordKey = rkey || tidNow();
      
      // Clean the record to remove any undefined values
      const cleanedRecord = cleanObject(record);
      this.logger.info('Cleaned record:', cleanedRecord);
      
                          // Encode the record using DAG-CBOR (like demo-pds-js)
                    const recordBytes = await dagCbor.encode(cleanedRecord);
      const recordCid = await hashToCid(recordBytes);
      this.logger.info('Record CID:', recordCid.toString());
      
      // Get or create repository for this DID
      let repo = this.settings.repositories.get(did);
      if (!repo) {
        // Create dataset first if it doesn't exist
        try {
          await ctx.call('triplestore.dataset.create', { dataset: did });
          this.logger.info('Created dataset for DID:', did);
        } catch (error) {
          this.logger.warn(`Dataset creation failed for ${did}:`, error.message);
          // Continue anyway - the dataset might already exist
        }
        
        // Create new repository with proper context binding
        const storageCall = (action, params) => ctx.call(`triplestore.${action}`, params);
        repo = await Repo.initialize(did, storageCall, null, null);
        this.settings.repositories.set(did, repo);
        this.logger.info('Created new repository for DID:', did);
      }
      
      // Add record to repository's MST
      await repo.tree.add(`${collection}/${recordKey}`, {
        uri: `at://${did}/${collection}/${recordKey}`,
        cid: recordCid.toString(),
        value: cleanedRecord,
        createdAt: new Date().toISOString()
      });
      
      // Create commit for this record
      const commitResult = await repo.createCommit(collection, recordKey, recordCid.toString());
      this.logger.info('Commit created:', commitResult.commitCid);
      
      // Also store in RDF for compatibility - using simple RDF triples instead of JSON-LD
      const recordUri = `${this.settings.baseUri || 'https://example.com'}/atproto/${did}/${collection}/${recordKey}`;
      const atprotoRecord = `
        <${recordUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://atproto.com/ns#Record> .
        <${recordUri}> <https://atproto.com/ns#hasCollection> "${collection}" .
        <${recordUri}> <https://atproto.com/ns#hasRkey> "${recordKey}" .
        <${recordUri}> <https://atproto.com/ns#hasCid> "${recordCid.toString()}" .
        <${recordUri}> <https://atproto.com/ns#hasCommitCid> "${commitResult.commitCid}" .
        <${recordUri}> <https://atproto.com/ns#hasCommitSeq> "${commitResult.commitSeq}" .
        <${recordUri}> <https://www.w3.org/ns/activitystreams#published> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        <${recordUri}> <https://atproto.com/ns#did> "${did}" .
        <${recordUri}> <https://atproto.com/ns#recordData> "${JSON.stringify(cleanedRecord).replace(/"/g, '\\"')}" .
      `;
      
      try {
        // Store in triplestore
        await ctx.call('triplestore.insert', {
          resource: atprotoRecord,
          contentType: 'application/n-triples',
          dataset: did,
          webId: 'system'
        });
        
        this.logger.info('Record stored in triplestore and repository successfully');
        
        // Create firehose message for federation
        const firehoseMsg = {
          op: 'create',
          path: `at://${did}/${collection}/${recordKey}`,
          cid: recordCid.toString(),
          timestamp: new Date().toISOString()
        };
        
        // Emit event for bridge service
        const recordData = {
          uri: `at://${did}/${collection}/${recordKey}`,
          cid: recordCid.toString(),
          value: cleanedRecord,
          createdAt: new Date().toISOString(),
          firehoseMsg
        };
        
        ctx.emit('atproto.record.created', {
          record: recordData,
          did,
          collection,
          rkey: recordKey
        });
        
        // Broadcast to firehose if federation is enabled
        try {
          await ctx.call('atproto.federation.broadcastToFirehose', {
            message: firehoseMsg
          });
        } catch (error) {
          this.logger.warn('Failed to broadcast to firehose:', error.message);
        }
        
        return {
          uri: `at://${did}/${collection}/${recordKey}`,
          cid: recordCid.toString(),
          commitCid: commitResult.commitCid,
          commitSeq: commitResult.commitSeq,
          success: true,
          message: 'Record created with proper atproto CID and repository storage'
        };
        
      } catch (error) {
        this.logger.error('Failed to store record:', error);
        throw new Error(`Failed to store record: ${error.message}`);
      }
                      },

                  // Enhanced getRecord with MST lookup
                  async getRecord(ctx) {
                    // Handle both direct calls and REST API calls
                    let { collection, rkey, did } = ctx.params;
                    
                    // URL parameters are already in ctx.params from moleculer-web
                    did = ctx.params.did || did;
                    collection = ctx.params.collection || collection;
                    rkey = ctx.params.rkey || rkey;

                    this.logger.info('Getting atproto record:', { collection, rkey, did });

                    // Validation
                    if (!collection || !rkey || !did) {
                      throw new Error('Missing required parameters: collection, rkey, did');
                    }

                    try {
                      // Get repository for this DID
                      let repo = this.settings.repositories.get(did);
                      if (!repo) {
                        throw new Error(`Repository not found for DID: ${did}`);
                      }

                      // Look up record in MST
                      const recordKey = `${collection}/${rkey}`;
                      const mstEntry = await repo.tree.get(recordKey);
                      
                      if (!mstEntry) {
                        throw new Error(`Record not found: ${recordKey}`);
                      }

                      this.logger.info('Found record in MST:', mstEntry);

                      // Also get from RDF for additional metadata
                      const query = `
                        PREFIX atproto: <https://atproto.com/ns#>
                        PREFIX as: <https://www.w3.org/ns/activitystreams#>
                        
                        SELECT ?uri ?cid ?recordData ?createdAt ?commitCid ?commitSeq
                        WHERE {
                          ?uri a atproto:Record ;
                               atproto:hasCollection "${collection}" ;
                               atproto:hasRkey "${rkey}" ;
                               atproto:hasCid ?cid ;
                               atproto:recordData ?recordData ;
                               atproto:hasCommitCid ?commitCid ;
                               atproto:hasCommitSeq ?commitSeq ;
                               as:published ?createdAt .
                          FILTER(STRENDS(STR(?uri), "/${did}/${collection}/${rkey}"))
                        }
                      `;

                      const result = await ctx.call('triplestore.query', {
                        query,
                        dataset: did,
                        webId: 'system'
                      });

                      let rdfMetadata = {};
                      if (result.results && result.results.bindings.length > 0) {
                        const record = result.results.bindings[0];
                        rdfMetadata = {
                          createdAt: record.createdAt.value,
                          commitCid: record.commitCid.value,
                          commitSeq: parseInt(record.commitSeq.value)
                        };
                      }

                      return {
                        uri: `at://${did}/${recordKey}`,
                        cid: mstEntry.cid,
                        value: mstEntry.value,
                        createdAt: rdfMetadata.createdAt || mstEntry.createdAt,
                        commitCid: rdfMetadata.commitCid,
                        commitSeq: rdfMetadata.commitSeq,
                        success: true
                      };

                    } catch (error) {
                      this.logger.error('Failed to get record:', error);
                      throw new Error(`Failed to get record: ${error.message}`);
                    }
                  },

                  // Enhanced updateRecord with commit chaining
                  async updateRecord(ctx) {
                    // Handle both direct calls and REST API calls
                    let { collection, rkey, did, record } = ctx.params;
                    
                    // Debug: Log what we're receiving
                    this.logger.info('=== DEBUG: updateRecord called ===');
                    this.logger.info('ctx.params:', JSON.stringify(ctx.params, null, 2));
                    this.logger.info('ctx.request:', ctx.request ? 'exists' : 'undefined');
                    if (ctx.request) {
                      this.logger.info('ctx.request.body:', JSON.stringify(ctx.request.body, null, 2));
                      this.logger.info('ctx.request.headers:', JSON.stringify(ctx.request.headers, null, 2));
                    }
                    this.logger.info('ctx.meta:', JSON.stringify(ctx.meta, null, 2));
                    
                    // For REST API calls, moleculer-web merges URL params with request body
                    // So ctx.params contains both URL parameters and the record data
                    // We need to extract the record data by removing the URL parameters
                    if (!record) {
                      // Create a copy of ctx.params and remove the URL parameters
                      const allParams = { ...ctx.params };
                      delete allParams.did;
                      delete allParams.collection;
                      delete allParams.rkey;
                      
                      // If there are remaining parameters, they are the record data
                      if (Object.keys(allParams).length > 0) {
                        record = allParams;
                      }
                    }
                    
                    // URL parameters are already in ctx.params from moleculer-web
                    did = ctx.params.did || did;
                    collection = ctx.params.collection || collection;
                    rkey = ctx.params.rkey || rkey;

                    this.logger.info('Updating atproto record:', { collection, rkey, did });

                    // Validation
                    if (!collection || !rkey || !did || !record) {
                      throw new Error('Missing required parameters: collection, rkey, did, record');
                    }

                    try {
                      // Get repository for this DID
                      let repo = this.settings.repositories.get(did);
                      if (!repo) {
                        throw new Error(`Repository not found for DID: ${did}`);
                      }

                      // Check if record exists
                      const recordKey = `${collection}/${rkey}`;
                      const existingEntry = await repo.tree.get(recordKey);
                      if (!existingEntry) {
                        throw new Error(`Record not found: ${recordKey}`);
                      }

                      // Clean the record data
                      const cleanedRecord = cleanObject(record);
                      this.logger.info('Cleaned record for update:', cleanedRecord);

                      // Generate new CID for updated record
                      const { dagCbor, hashToCid } = require('../utils/atproto-utils');
                      const recordBytes = await dagCbor.encode(cleanedRecord);
                      const recordCid = await hashToCid(recordBytes);
                      this.logger.info('Updated record CID:', recordCid.toString());

                      // Update record in MST
                      await repo.tree.add(recordKey, {
                        uri: `at://${did}/${recordKey}`,
                        cid: recordCid.toString(),
                        value: cleanedRecord,
                        createdAt: new Date().toISOString()
                      });

                      // Create commit for this update
                      const commitResult = await repo.createCommit(collection, rkey, recordCid.toString());
                      this.logger.info('Update commit created:', commitResult.commitCid);

                      // Update RDF record
                      const atprotoRecord = {
                        '@context': {
                          '@vocab': 'https://atproto.com/ns#',
                          'as': 'https://www.w3.org/ns/activitystreams#'
                        },
                        '@id': `${this.settings.baseUri || 'https://example.com'}/atproto/${did}/${collection}/${rkey}`,
                        '@type': ['Record'],
                        'hasCollection': collection,
                        'hasRkey': rkey,
                        'hasCid': recordCid.toString(),
                        'hasCommitCid': commitResult.commitCid,
                        'hasCommitSeq': commitResult.commitSeq,
                        'createdAt': new Date().toISOString(),
                        'did': did,
                        'recordData': cleanedRecord
                      };

                      // Update in triplestore
                      await ctx.call('triplestore.update', {
                        resource: atprotoRecord,
                        contentType: 'application/json',
                        dataset: did,
                        webId: 'system'
                      });

                      this.logger.info('Record updated in triplestore and repository successfully');

                      return {
                        uri: `at://${did}/${collection}/${rkey}`,
                        cid: recordCid.toString(),
                        commitCid: commitResult.commitCid,
                        commitSeq: commitResult.commitSeq,
                        success: true,
                        message: 'Record updated with proper atproto CID and repository storage'
                      };

                    } catch (error) {
                      this.logger.error('Failed to update record:', error);
                      throw new Error(`Failed to update record: ${error.message}`);
                    }
                  },

                  // Enhanced deleteRecord with tombstone handling
                  async deleteRecord(ctx) {
                    // Handle both direct calls and REST API calls
                    let { collection, rkey, did } = ctx.params;
                    
                    // URL parameters are already in ctx.params from moleculer-web
                    did = ctx.params.did || did;
                    collection = ctx.params.collection || collection;
                    rkey = ctx.params.rkey || rkey;

                    this.logger.info('Deleting atproto record:', { collection, rkey, did });

                    // Validation
                    if (!collection || !rkey || !did) {
                      throw new Error('Missing required parameters: collection, rkey, did');
                    }

                    try {
                      // Get repository for this DID
                      let repo = this.settings.repositories.get(did);
                      if (!repo) {
                        throw new Error(`Repository not found for DID: ${did}`);
                      }

                      // Check if record exists
                      const recordKey = `${collection}/${rkey}`;
                      const existingEntry = await repo.tree.get(recordKey);
                      if (!existingEntry) {
                        throw new Error(`Record not found: ${recordKey}`);
                      }

                      // Create tombstone record (atproto deletion marker)
                      const tombstoneRecord = {
                        $type: 'com.atproto.repo.strongRef',
                        uri: `at://${did}/${recordKey}`,
                        cid: existingEntry.cid
                      };

                      // Generate CID for tombstone
                      const { dagCbor, hashToCid } = require('../utils/atproto-utils');
                      const tombstoneBytes = await dagCbor.encode(tombstoneRecord);
                      const tombstoneCid = await hashToCid(tombstoneBytes);
                      this.logger.info('Tombstone CID:', tombstoneCid.toString());

                      // Create commit for deletion
                      const commitResult = await repo.createCommit(collection, rkey, tombstoneCid.toString());
                      this.logger.info('Delete commit created:', commitResult.commitCid);

                      // Create tombstone RDF record
                      const tombstoneRdfRecord = {
                        '@context': {
                          '@vocab': 'https://atproto.com/ns#'
                        },
                        '@id': `${this.settings.baseUri || 'https://example.com'}/atproto/${did}/${collection}/${rkey}`,
                        '@type': ['Tombstone'],
                        'hasCollection': collection,
                        'hasRkey': rkey,
                        'hasCid': tombstoneCid.toString(),
                        'hasCommitCid': commitResult.commitCid,
                        'hasCommitSeq': commitResult.commitSeq,
                        'hasDeletedAt': new Date().toISOString(),
                        'hasOriginalCid': existingEntry.cid,
                        'did': did
                      };

                      // Update triplestore with tombstone
                      await ctx.call('triplestore.update', {
                        resource: tombstoneRdfRecord,
                        contentType: 'application/json',
                        dataset: did,
                        webId: 'system'
                      });

                      this.logger.info('Record deleted with tombstone successfully');

                      return {
                        uri: `at://${did}/${collection}/${rkey}`,
                        cid: tombstoneCid.toString(),
                        commitCid: commitResult.commitCid,
                        commitSeq: commitResult.commitSeq,
                        success: true,
                        message: 'Record deleted with proper tombstone and commit'
                      };

                    } catch (error) {
                      this.logger.error('Failed to delete record:', error);
                      throw new Error(`Failed to delete record: ${error.message}`);
                    }
                  },

                  // Enhanced listRecords with pagination
                  async listRecords(ctx) {
                    // Handle both direct calls and REST API calls
                    let { collection, did, limit = 50, cursor = null, reverse = false } = ctx.params;
                    
                    // URL parameters are already in ctx.params from moleculer-web
                    did = ctx.params.did || did;
                    collection = ctx.params.collection || collection;

                    this.logger.info('Listing atproto records:', { collection, did, limit, cursor, reverse });

                    // Validation
                    if (!collection || !did) {
                      throw new Error('Missing required parameters: collection, did');
                    }

                    try {
                      // Use a working SPARQL query approach
                      const query = `
                        PREFIX atproto: <https://atproto.com/ns#>
                        SELECT ?s ?p ?o WHERE { 
                          ?s a atproto:Record .
                          ?s ?p ?o 
                        } LIMIT 100
                      `;

                      let result;
                      try {
                        result = await ctx.call('triplestore.query', {
                          query,
                          dataset: did,
                          webId: 'system'
                        });
                        
                        this.logger.info('SPARQL query successful, processing results...');
                        
                      } catch (error) {
                        this.logger.error('SPARQL query failed:', error);
                        // If dataset doesn't exist, return empty records instead of error
                        if (error.message.includes("doesn't exist")) {
                          this.logger.info('Dataset does not exist yet, returning empty records');
                          return {
                            records: [],
                            cursor: null,
                            success: true,
                            message: 'No records found (dataset not created yet)'
                          };
                        }
                        return {
                          records: [],
                          cursor: null,
                          success: false,
                          message: `SPARQL query failed: ${error.message}`
                        };
                      }

                      // Handle the actual result structure (array of triples)
                      if (!Array.isArray(result)) {
                        this.logger.error('Unexpected result structure:', result);
                        return {
                          records: [],
                          cursor: null,
                          success: true,
                          message: 'No records found (unexpected result structure)'
                        };
                      }

                      // Group results by URI and filter for our collection
                      const uriGroups = {};
                      result.forEach(binding => {
                        const uri = binding.s.value;
                        const predicate = binding.p.value;
                        const object = binding.o.value;
                        
                        if (!uriGroups[uri]) {
                          uriGroups[uri] = {};
                        }
                        uriGroups[uri][predicate] = object;
                      });

                      // Filter for our collection and build records
                      let records = Object.entries(uriGroups)
                        .filter(([uri, data]) => {
                          return data['https://atproto.com/ns#hasCollection'] === collection;
                        })
                        .map(([uri, data]) => {
                          const recordData = JSON.parse(data['https://atproto.com/ns#recordData'] || '{}');
                          return {
                            uri: uri,
                            cid: data['https://atproto.com/ns#hasCid'],
                            rkey: data['https://atproto.com/ns#hasRkey'],
                            value: recordData,
                            createdAt: data['https://www.w3.org/ns/activitystreams#published']
                          };
                        })
                        .sort((a, b) => b.rkey.localeCompare(a.rkey)); // Sort by rkey descending

                      // Apply cursor-based pagination
                      if (cursor) {
                        if (reverse) {
                          records = records.filter(record => record.rkey > cursor);
                        } else {
                          records = records.filter(record => record.rkey < cursor);
                        }
                      }

                      // Apply limit
                      records = records.slice(0, limit);

                      // Calculate next cursor
                      const nextCursor = records.length > 0 ? records[records.length - 1].rkey : null;

                      return {
                        records,
                        cursor: nextCursor,
                        success: true,
                        message: `Found ${records.length} records`
                      };

                    } catch (error) {
                      this.logger.error('Failed to list records:', error);
                      throw new Error(`Failed to list records: ${error.message}`);
                    }
                  }
                }
              }

module.exports = AtprotoService; 