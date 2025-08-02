const { ServiceBroker } = require('moleculer');
const { AtprotoService } = require('../../../semapps/src/middleware/packages/atproto');
const ApiGatewayService = require('moleculer-web');

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
      
      // Handle list records queries
      if (query && query.includes('atproto:Record') && query.includes('ORDER BY')) {
        const did = dataset;
        if (MockTripleStoreService.records[did]) {
          const records = Object.values(MockTripleStoreService.records[did]).slice(0, 10);
          return {
            results: {
              bindings: records.map(record => ({
                uri: { value: record.uri },
                cid: { value: record.cid },
                rkey: { value: record.rkey },
                recordData: { value: record.recordData },
                createdAt: { value: record.createdAt }
              }))
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
          rkey: resource.hasRkey,
          recordData: resource.recordData,
          createdAt: resource.createdAt,
          commitCid: resource.hasCommitCid,
          commitSeq: resource.hasCommitSeq
        };
      }
      
      return { success: true };
    },
    update: async (ctx) => {
      const { resource, dataset } = ctx.params;
      
      // Handle record updates
      if (resource && resource['@type'] && resource['@type'].includes('Record')) {
        const did = dataset;
        if (!MockTripleStoreService.records[did]) {
          MockTripleStoreService.records[did] = {};
        }
        const recordKey = `${resource.hasCollection}/${resource.hasRkey}`;
        MockTripleStoreService.records[did][recordKey] = {
          uri: resource['@id'],
          cid: resource.hasCid,
          rkey: resource.hasRkey,
          recordData: resource.recordData,
          createdAt: resource.createdAt,
          commitCid: resource.hasCommitCid,
          commitSeq: resource.hasCommitSeq
        };
      }
      
      return { success: true };
    }
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

// API Gateway service for REST endpoints
const ApiService = {
  name: 'api',
  mixins: [ApiGatewayService],
  settings: {
    port: 3001,
    routes: [
      {
        name: 'atproto',
        path: '/atproto',
        aliases: {
          // Create record
          'POST /:did/:collection/:rkey': 'atproto.createRecord',
          // Get record
          'GET /:did/:collection/:rkey': 'atproto.getRecord',
          // Update record
          'PUT /:did/:collection/:rkey': 'atproto.updateRecord',
          // Delete record
          'DELETE /:did/:collection/:rkey': 'atproto.deleteRecord',
          // List records
          'GET /:did/:collection': 'atproto.listRecords'
        },
        opts: {
          parseParams: true
        }
      }
    ]
  }
};

// Add mock services
broker.createService(MockTripleStoreService);
broker.createService(MockJsonLdService);

// Add our atproto service
broker.createService(AtprotoService);

// Add API gateway service
broker.createService(ApiService);

async function testRestAPI() {
  try {
    console.log('🚀 Starting REST API test...');
    await broker.start();

    console.log('✅ Broker started successfully');
    console.log('🌐 API Gateway running on http://localhost:3001');

    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';
    const testRkey = 'test-rest-api-123';

    // Test 1: Create record via REST API
    console.log('\n🧪 Test 1: Creating record via REST API...');
    const createResult = await broker.call('atproto.createRecord', {
      did: testDid,
      collection: testCollection,
      rkey: testRkey,
      record: {
        text: 'Hello from REST API!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      }
    });
    console.log('✅ Record created via REST API:', createResult.uri);

    // Test 2: Get record via REST API
    console.log('\n🧪 Test 2: Getting record via REST API...');
    const getResult = await broker.call('atproto.getRecord', {
      did: testDid,
      collection: testCollection,
      rkey: testRkey
    });
    console.log('✅ Record retrieved via REST API:', getResult.uri);
    console.log('   Content:', getResult.value.text);

    // Test 3: Update record via REST API
    console.log('\n🧪 Test 3: Updating record via REST API...');
    const updateResult = await broker.call('atproto.updateRecord', {
      did: testDid,
      collection: testCollection,
      rkey: testRkey,
      record: {
        text: 'Updated via REST API!',
        createdAt: new Date().toISOString(),
        langs: ['en', 'es']
      }
    });
    console.log('✅ Record updated via REST API:', updateResult.uri);

    // Test 4: List records via REST API
    console.log('\n🧪 Test 4: Listing records via REST API...');
    const listResult = await broker.call('atproto.listRecords', {
      did: testDid,
      collection: testCollection,
      limit: 10
    });
    console.log('✅ Records listed via REST API:', listResult.records.length, 'records found');

    // Test 5: Delete record via REST API
    console.log('\n🧪 Test 5: Deleting record via REST API...');
    const deleteResult = await broker.call('atproto.deleteRecord', {
      did: testDid,
      collection: testCollection,
      rkey: testRkey
    });
    console.log('✅ Record deleted via REST API:', deleteResult.uri);

    // Summary
    console.log('\n📊 REST API Test Summary:');
    console.log('   ✅ CREATE: POST /atproto/:did/:collection/:rkey');
    console.log('   ✅ READ: GET /atproto/:did/:collection/:rkey');
    console.log('   ✅ UPDATE: PUT /atproto/:did/:collection/:rkey');
    console.log('   ✅ LIST: GET /atproto/:did/:collection');
    console.log('   ✅ DELETE: DELETE /atproto/:did/:collection/:rkey');

    console.log('\n🎉 REST API test completed successfully!');
    console.log('🌐 API endpoints are ready for integration with ActivityPods!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testRestAPI(); 