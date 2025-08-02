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
      
      // Handle tombstone queries
      if (query && query.includes('atproto:Tombstone') && query.includes('SELECT')) {
        const did = dataset;
        const recordKey = MockTripleStoreService.extractRecordKey(query);
        if (recordKey && MockTripleStoreService.tombstones[did] && MockTripleStoreService.tombstones[did][recordKey]) {
          const tombstone = MockTripleStoreService.tombstones[did][recordKey];
          return {
            results: {
              bindings: [{
                uri: { value: tombstone.uri },
                cid: { value: tombstone.cid },
                deletedAt: { value: tombstone.deletedAt },
                commitCid: { value: tombstone.commitCid },
                commitSeq: { value: tombstone.commitSeq.toString() }
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
          recordData: resource.recordData,
          createdAt: resource.createdAt,
          commitCid: resource.hasCommitCid,
          commitSeq: resource.hasCommitSeq
        };
      }
      
      // Handle tombstone creation
      if (resource && resource['@type'] && resource['@type'].includes('Tombstone')) {
        const did = dataset;
        if (!MockTripleStoreService.tombstones[did]) {
          MockTripleStoreService.tombstones[did] = {};
        }
        const recordKey = `${resource.hasCollection}/${resource.hasRkey}`;
        MockTripleStoreService.tombstones[did][recordKey] = {
          uri: resource['@id'],
          cid: resource.hasCid,
          deletedAt: resource.hasDeletedAt,
          commitCid: resource.hasCommitCid,
          commitSeq: resource.hasCommitSeq
        };
        
        // Remove from records when tombstone is created
        if (MockTripleStoreService.records[did] && MockTripleStoreService.records[did][recordKey]) {
          delete MockTripleStoreService.records[did][recordKey];
        }
      }
      
      return { success: true };
    }
  },
  commits: {},
  records: {},
  tombstones: {},
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

async function testFullCRUD() {
  try {
    console.log('🚀 Starting Full CRUD Operations test...');
    await broker.start();

    console.log('✅ Broker started successfully');

    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';
    const testRkey = 'test-crud-123';

    // Test 1: CREATE - Create a new record
    console.log('\n🧪 Test 1: CREATE - Creating a new record...');
    const createResult = await broker.call('atproto.createRecord', {
      collection: testCollection,
      record: {
        text: 'Original post content for CRUD testing!',
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      rkey: testRkey,
      did: testDid
    });
    console.log('✅ Record created:', createResult.uri);
    console.log('   CID:', createResult.cid);
    console.log('   Commit Seq:', createResult.commitSeq);

    // Test 2: READ - Retrieve the created record
    console.log('\n🧪 Test 2: READ - Retrieving the created record...');
    const getResult = await broker.call('atproto.getRecord', {
      collection: testCollection,
      rkey: testRkey,
      did: testDid
    });
    console.log('✅ Record retrieved:', getResult.uri);
    console.log('   Content:', getResult.value.text);
    console.log('   CID:', getResult.cid);
    console.log('   Commit Seq:', getResult.commitSeq);

    // Verify create and get match
    if (getResult.uri === createResult.uri && getResult.cid === createResult.cid) {
      console.log('✅ Create and Get results match');
    } else {
      console.log('❌ Create and Get results mismatch');
    }

    // Test 3: UPDATE - Update the record
    console.log('\n🧪 Test 3: UPDATE - Updating the record...');
    const updateResult = await broker.call('atproto.updateRecord', {
      collection: testCollection,
      rkey: testRkey,
      did: testDid,
      record: {
        text: 'Updated post content after CRUD testing!',
        createdAt: new Date().toISOString(),
        langs: ['en', 'es']
      }
    });
    console.log('✅ Record updated:', updateResult.uri);
    console.log('   New CID:', updateResult.cid);
    console.log('   New Commit Seq:', updateResult.commitSeq);

    // Verify commit sequence incremented
    if (updateResult.commitSeq === createResult.commitSeq + 1) {
      console.log('✅ Commit sequence incremented correctly');
    } else {
      console.log('❌ Commit sequence not incremented correctly');
    }

    // Test 4: READ - Retrieve the updated record
    console.log('\n🧪 Test 4: READ - Retrieving the updated record...');
    const getUpdatedResult = await broker.call('atproto.getRecord', {
      collection: testCollection,
      rkey: testRkey,
      did: testDid
    });
    console.log('✅ Updated record retrieved:', getUpdatedResult.uri);
    console.log('   Updated content:', getUpdatedResult.value.text);
    console.log('   Updated CID:', getUpdatedResult.cid);
    console.log('   Updated Commit Seq:', getUpdatedResult.commitSeq);

    // Verify update was successful
    if (getUpdatedResult.value.text === 'Updated post content after CRUD testing!') {
      console.log('✅ Record content updated correctly');
    } else {
      console.log('❌ Record content not updated correctly');
    }

    if (getUpdatedResult.cid !== createResult.cid) {
      console.log('✅ Record CID changed after update (as expected)');
    } else {
      console.log('❌ Record CID should have changed after update');
    }

    // Test 5: DELETE - Delete the record
    console.log('\n🧪 Test 5: DELETE - Deleting the record...');
    const deleteResult = await broker.call('atproto.deleteRecord', {
      collection: testCollection,
      rkey: testRkey,
      did: testDid
    });
    console.log('✅ Record deleted:', deleteResult.uri);
    console.log('   Tombstone CID:', deleteResult.cid);
    console.log('   Delete Commit Seq:', deleteResult.commitSeq);

    // Verify commit sequence incremented again
    if (deleteResult.commitSeq === updateResult.commitSeq + 1) {
      console.log('✅ Delete commit sequence incremented correctly');
    } else {
      console.log('❌ Delete commit sequence not incremented correctly');
    }

    // Test 6: READ - Try to retrieve the deleted record
    console.log('\n🧪 Test 6: READ - Attempting to retrieve deleted record...');
    try {
      await broker.call('atproto.getRecord', {
        collection: testCollection,
        rkey: testRkey,
        did: testDid
      });
      console.log('❌ Should have thrown an error for deleted record');
    } catch (error) {
      console.log('✅ Correctly threw error for deleted record:', error.message);
    }

    // Summary
    console.log('\n📊 CRUD Operations Summary:');
    console.log('   Create Commit Seq:', createResult.commitSeq);
    console.log('   Update Commit Seq:', updateResult.commitSeq);
    console.log('   Delete Commit Seq:', deleteResult.commitSeq);
    console.log('   Total Commits:', deleteResult.commitSeq);

    console.log('\n🎉 Full CRUD Operations test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testFullCRUD(); 