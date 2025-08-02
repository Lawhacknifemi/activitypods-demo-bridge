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
    query: async () => ({ results: { bindings: [] } }),
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

async function testMSTImplementation() {
  try {
    console.log('🚀 Starting MST implementation test...');
    await broker.start();

    console.log('✅ Broker started successfully');

    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';

    // Test 1: Create Record with MST
    console.log('\n🧪 Test 1: Creating atproto record with MST...');
    const createResult = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Hello, atproto world with MST!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test123',
      did: testDid
    });
    console.log('✅ CreateRecord with MST result:', createResult);

    // Verify MST root CID is present
    if (createResult.mstRootCid) {
      console.log('✅ MST root CID generated:', createResult.mstRootCid);
    } else {
      console.log('❌ MST root CID missing');
    }

    // Test 2: Create another record to test MST tree structure
    console.log('\n🧪 Test 2: Creating second record to test MST tree...');
    const createResult2 = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Second post with MST!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test456',
      did: testDid
    });
    console.log('✅ Second record with MST result:', createResult2);

    // Test 3: Create a record in different collection
    console.log('\n🧪 Test 3: Creating record in different collection...');
    const createResult3 = await broker.call('atproto.createRecord', {
      collection: 'app.bsky.actor.profile',
      record: {
        displayName: 'Test User',
        description: 'A test user profile',
        createdAt: new Date().toISOString()
      },
      rkey: 'self',
      did: testDid
    });
    console.log('✅ Profile record with MST result:', createResult3);

    console.log('\n🎉 MST implementation test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testMSTImplementation(); 