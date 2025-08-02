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
      // Mock SPARQL query results
      const { query } = ctx.params;
      
      if (query.includes('SELECT') && query.includes('atproto:Record')) {
        // Mock getRecord or listRecords query
        if (query.includes('hasRkey "test123"')) {
          // Mock getRecord result
          return {
            results: {
              bindings: [{
                uri: { value: 'https://example.com/atproto/did:plc:testuser123/app.bsky.feed.post/test123' },
                cid: { value: 'bafyreieccss4bdcq3fgblt5xyjfcmr5qpae4ugteq' },
                recordData: { value: JSON.stringify({ text: 'Hello, atproto world!', createdAt: '2025-07-31T22:21:54.346Z', langs: ['en'] }) },
                createdAt: { value: '2025-07-31T22:21:54.346Z' }
              }]
            }
          };
        } else {
          // Mock listRecords result
          return {
            results: {
              bindings: [
                {
                  uri: { value: 'https://example.com/atproto/did:plc:testuser123/app.bsky.feed.post/test123' },
                  cid: { value: 'bafyreieccss4bdcq3fgblt5xyjfcmr5qpae4ugteq' },
                  rkey: { value: 'test123' },
                  recordData: { value: JSON.stringify({ text: 'Hello, atproto world!', createdAt: '2025-07-31T22:21:54.346Z', langs: ['en'] }) },
                  createdAt: { value: '2025-07-31T22:21:54.346Z' }
                },
                {
                  uri: { value: 'https://example.com/atproto/did:plc:testuser123/app.bsky.feed.post/test456' },
                  cid: { value: 'bafyreieccss4bdcq3fgblt5xyjfcmr5qpae4ugteq' },
                  rkey: { value: 'test456' },
                  recordData: { value: JSON.stringify({ text: 'Another post!', createdAt: '2025-07-31T22:21:54.346Z', langs: ['en'] }) },
                  createdAt: { value: '2025-07-31T22:21:54.346Z' }
                }
              ]
            }
          };
        }
      } else if (query.includes('DELETE')) {
        // Mock delete operation
        return { success: true };
      }
      
      return { results: { bindings: [] } };
    },
    insert: async () => ({ success: true }),
    update: async () => ({ success: true })
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

async function testAllAtprotoActions() {
  try {
    console.log('🚀 Starting FULL atproto test with ALL actions...');
    await broker.start();

    console.log('✅ Broker started successfully');

    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';

    // Test 1: Create Record
    console.log('\n🧪 Test 1: Creating atproto record...');
    const createResult = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Hello, atproto world!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test123',
      did: testDid
    });
    console.log('✅ CreateRecord result:', createResult);

    // Test 2: Get Record
    console.log('\n🧪 Test 2: Getting atproto record...');
    const getResult = await broker.call('atproto.getRecord', {
      collection: testCollection,
      rkey: 'test123',
      did: testDid
    });
    console.log('✅ GetRecord result:', getResult);

    // Test 3: List Records
    console.log('\n🧪 Test 3: Listing atproto records...');
    const listResult = await broker.call('atproto.listRecords', {
      collection: testCollection,
      did: testDid,
      limit: 10
    });
    console.log('✅ ListRecords result:', listResult);

    // Test 4: Delete Record
    console.log('\n🧪 Test 4: Deleting atproto record...');
    const deleteResult = await broker.call('atproto.deleteRecord', {
      collection: testCollection,
      rkey: 'test123',
      did: testDid
    });
    console.log('✅ DeleteRecord result:', deleteResult);

    console.log('\n🎉 ALL atproto actions tested successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testAllAtprotoActions(); 