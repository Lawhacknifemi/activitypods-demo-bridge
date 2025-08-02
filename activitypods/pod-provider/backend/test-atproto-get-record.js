const { ServiceBroker } = require('moleculer');
const { AtprotoService } = require('../../../semapps/src/middleware/packages/atproto');

// Create a simple broker for testing
const broker = new ServiceBroker({
  logger: {
    type: 'Console',
    options: {
      colors: true,
      moduleColors: false,
      autoPadding: true
    }
  }
});

// Mock triplestore service (simplified for testing)
const MockTripleStoreService = {
  name: 'triplestore',
  actions: {
    query: async (ctx) => {
      const { query, dataset } = ctx.params;
      
      // Handle commit queries to track commit sequence per DID
      if (query && query.includes('atproto:Commit') && query.includes('ORDER BY DESC(?seq)')) {
        const did = dataset;
        if (MockTripleStoreService.commits[did] && MockTripleStoreService.commits[did].length > 0) {
          const latestCommit = MockTripleStoreService.commits[did][MockTripleStoreService.commits[did].length - 1];
          return {
            results: {
              bindings: [{
                seq: { value: latestCommit.seq.toString() },
                commitCid: { value: latestCommit.cid },
                commitData: { value: latestCommit.data }
              }]
            }
          };
        }
      }
      
      // Handle record queries for getRecord
      if (query && query.includes('atproto:Record') && query.includes('SELECT')) {
        const did = dataset;
        const recordKey = MockTripleStoreService.extractRecordKey(query);
        if (recordKey && MockTripleStoreService.records[did] && MockTripleStoreService.records[did][recordKey]) {
          const record = MockTripleStoreService.records[did][recordKey];
          return {
            results: {
              bindings: [{
                uri: { value: record.uri },
                cid: { value: record.cid },
                recordData: { value: record.recordData },
                createdAt: { value: record.createdAt },
                commitCid: { value: record.commitCid },
                commitSeq: { value: record.commitSeq.toString() }
              }]
            }
          };
        }
      }
      
      // Default empty result for other queries
      return { results: { bindings: [] } };
    },
    insert: async (ctx) => {
      const { resource, dataset } = ctx.params;
      
      // Track commits for sequence management per DID
      if (resource && resource['@type'] && resource['@type'].includes('Commit')) {
        const did = dataset;
        if (!MockTripleStoreService.commits[did]) {
          MockTripleStoreService.commits[did] = [];
        }
        MockTripleStoreService.commits[did].push({
          seq: resource.hasSeq,
          cid: resource.hasCid,
          data: resource.hasData
        });
      }
      
      // Track records for getRecord testing
      if (resource && resource['@type'] && resource['@type'].includes('Record')) {
        const did = dataset;
        if (!MockTripleStoreService.records[did]) {
          MockTripleStoreService.records[did] = {};
        }
        const recordKey = `${resource.hasCollection}/${resource.hasRkey}`;
        MockTripleStoreService.records[did][recordKey] = {
          uri: resource['@id'],
          cid: resource.hasCid,
          recordData: resource.recordData,
          createdAt: resource.createdAt,
          commitCid: resource.hasCommitCid,
          commitSeq: resource.hasCommitSeq
        };
      }
      
      return { success: true };
    },
    update: async () => ({ success: true })
  },
  commits: {},
  records: {},
  extractRecordKey: (query) => {
    // Simple extraction of collection/rkey from SPARQL query
    const collectionMatch = query.match(/atproto:hasCollection "([^"]+)"/);
    const rkeyMatch = query.match(/atproto:hasRkey "([^"]+)"/);
    if (collectionMatch && rkeyMatch) {
      return `${collectionMatch[1]}/${rkeyMatch[1]}`;
    }
    return null;
  }
};

// Mock jsonld service (simplified for testing)
const MockJsonLdService = {
  name: 'jsonld',
  actions: {
    'parser.toRDF': async () => ([]),
    'parser.frame': async (ctx) => ctx.params.input,
    'context.get': async () => ({ '@context': {} })
  }
};

// Add mock services
broker.createService(MockTripleStoreService);
broker.createService(MockJsonLdService);

// Add our atproto service
broker.createService(AtprotoService);

async function testGetRecord() {
  try {
    console.log('🚀 Starting Enhanced getRecord test...');
    await broker.start();

    console.log('✅ Broker started successfully');

    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';

    // Test 1: Create a record first
    console.log('\n🧪 Test 1: Creating a record to retrieve...');
    const createResult = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Hello, this is a test post for retrieval!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test-get-record',
      did: testDid
    });
    console.log('✅ Record created:', createResult.uri);

    // Test 2: Retrieve the record using getRecord
    console.log('\n🧪 Test 2: Retrieving the record with getRecord...');
    const getResult = await broker.call('atproto.getRecord', {
      collection: testCollection,
      rkey: 'test-get-record',
      did: testDid
    });
    console.log('✅ Record retrieved:', getResult);

    // Verify the retrieved record matches the created record
    if (getResult.uri === createResult.uri && getResult.cid === createResult.cid) {
      console.log('✅ Record URI and CID match between create and get');
    } else {
      console.log('❌ Record URI or CID mismatch');
    }

    if (getResult.value.text === 'Hello, this is a test post for retrieval!') {
      console.log('✅ Record content matches');
    } else {
      console.log('❌ Record content mismatch');
    }

    if (getResult.commitCid && getResult.commitSeq) {
      console.log('✅ Commit information present in retrieved record');
    } else {
      console.log('❌ Commit information missing in retrieved record');
    }

    // Test 3: Try to get a non-existent record
    console.log('\n🧪 Test 3: Testing getRecord for non-existent record...');
    try {
      await broker.call('atproto.getRecord', {
        collection: testCollection,
        rkey: 'non-existent-record',
        did: testDid
      });
      console.log('❌ Should have thrown an error for non-existent record');
    } catch (error) {
      console.log('✅ Correctly threw error for non-existent record:', error.message);
    }

    // Test 4: Try to get a record from non-existent DID
    console.log('\n🧪 Test 4: Testing getRecord for non-existent DID...');
    try {
      await broker.call('atproto.getRecord', {
        collection: testCollection,
        rkey: 'test-get-record',
        did: 'did:plc:nonexistent'
      });
      console.log('❌ Should have thrown an error for non-existent DID');
    } catch (error) {
      console.log('✅ Correctly threw error for non-existent DID:', error.message);
    }

    console.log('\n🎉 Enhanced getRecord test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testGetRecord(); 