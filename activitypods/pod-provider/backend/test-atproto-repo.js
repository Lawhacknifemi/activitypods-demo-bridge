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
        // Return the latest commit for this specific DID
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
      
      return { success: true };
    },
    update: async () => ({ success: true })
  },
  commits: {}
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

async function testRepositoryImplementation() {
  try {
    console.log('🚀 Starting Repository implementation test...');
    await broker.start();

    console.log('✅ Broker started successfully');

    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';

    // Test 1: Create Record with Repository
    console.log('\n🧪 Test 1: Creating atproto record with repository...');
    const createResult = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Hello, atproto world with repository!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test123',
      did: testDid
    });
    console.log('✅ CreateRecord with repository result:', createResult);

    // Verify commit information is present
    if (createResult.commitCid) {
      console.log('✅ Commit CID generated:', createResult.commitCid);
    } else {
      console.log('❌ Commit CID missing');
    }

    if (createResult.commitSeq !== undefined) {
      console.log('✅ Commit sequence:', createResult.commitSeq);
    } else {
      console.log('❌ Commit sequence missing');
    }

    // Test 2: Create another record to test commit sequence
    console.log('\n🧪 Test 2: Creating second record to test commit sequence...');
    const createResult2 = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Second post with repository!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test456',
      did: testDid
    });
    console.log('✅ Second record with repository result:', createResult2);

    // Verify commit sequence is incrementing
    if (createResult2.commitSeq === createResult.commitSeq + 1) {
      console.log('✅ Commit sequence incrementing correctly');
    } else {
      console.log('❌ Commit sequence not incrementing correctly');
    }

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
    console.log('✅ Profile record with repository result:', createResult3);

    // Test 4: Create record for different DID to test repository isolation
    console.log('\n🧪 Test 4: Creating record for different DID...');
    const createResult4 = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Post from different user!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: 'test789',
      did: 'did:plc:testuser456'
    });
    console.log('✅ Different DID record result:', createResult4);

    // Verify different DID has its own commit sequence (should start at 1)
    if (createResult4.commitSeq === 1) {
      console.log('✅ Different DID has separate commit sequence (starts at 1)');
    } else {
      console.log('❌ Different DID should have separate commit sequence (should start at 1)');
    }

    console.log('\n🎉 Repository implementation test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testRepositoryImplementation(); 