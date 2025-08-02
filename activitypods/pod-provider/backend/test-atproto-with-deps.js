const { ServiceBroker } = require('moleculer');

// Test atproto service with its dependencies
async function testWithDependencies() {
  let broker;
  
  try {
    console.log('🚀 Testing atproto service with dependencies...');
    
    // Create a broker
    broker = new ServiceBroker({
      logger: {
        type: 'Console',
        options: {
          colors: true,
          moduleColors: false,
          autoPadding: true,
          level: 'info'
        }
      }
    });

    // Load required services in dependency order
    console.log('📁 Loading jsonld service...');
    try {
      const jsonldService = require('./services/core/jsonld');
      broker.createService(jsonldService);
      console.log('✅ JSON-LD service loaded');
    } catch (error) {
      console.log('❌ Failed to load JSON-LD service:', error.message);
      return;
    }

    console.log('📁 Loading triplestore service...');
    try {
      const triplestoreService = require('./services/core/triplestore');
      broker.createService(triplestoreService);
      console.log('✅ Triplestore service loaded');
    } catch (error) {
      console.log('❌ Failed to load triplestore service:', error.message);
      return;
    }

    console.log('📁 Loading atproto service...');
    try {
      const atprotoService = require('./services/core/atproto');
      broker.createService(atprotoService);
      console.log('✅ Atproto service loaded');
    } catch (error) {
      console.log('❌ Failed to load atproto service:', error.message);
      return;
    }

    // Start the broker
    console.log('🚀 Starting broker...');
    await broker.start();
    console.log('✅ Broker started successfully');
    
    // Check if all services are available
    if (broker.services.atproto) {
      console.log('✅ Atproto service is available');
      console.log('   Available actions:', Object.keys(broker.services.atproto.actions));
    } else {
      console.log('❌ Atproto service not found');
      return;
    }

    if (broker.services.triplestore) {
      console.log('✅ Triplestore service is available');
    } else {
      console.log('❌ Triplestore service not found');
      return;
    }

    if (broker.services.jsonld) {
      console.log('✅ JSON-LD service is available');
    } else {
      console.log('❌ JSON-LD service not found');
      return;
    }

    // Test basic atproto functionality
    console.log('\n🧪 Testing atproto service with real triplestore...');
    
    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';
    const testRkey = 'test-with-deps-123';

    // Test 1: Create a record
    console.log('\n📝 Test 1: Creating a record...');
    try {
      const createResult = await broker.call('atproto.createRecord', {
        collection: testCollection,
        record: {
          text: 'Hello from ActivityPods with dependencies!',
          createdAt: new Date().toISOString(),
          langs: ['en']
        },
        rkey: testRkey,
        did: testDid
      });
      
      console.log('✅ Record created successfully:', createResult.uri);
      console.log('   CID:', createResult.cid);
      console.log('   Commit Seq:', createResult.commitSeq);
      
    } catch (error) {
      console.log('❌ Failed to create record:', error.message);
      console.log('   Error details:', error);
      return;
    }

    // Test 2: Retrieve the record
    console.log('\n📖 Test 2: Retrieving the record...');
    try {
      const getResult = await broker.call('atproto.getRecord', {
        collection: testCollection,
        rkey: testRkey,
        did: testDid
      });
      
      console.log('✅ Record retrieved successfully:', getResult.uri);
      console.log('   Content:', getResult.value.text);
      console.log('   CID:', getResult.cid);
      console.log('   Commit Seq:', getResult.commitSeq);
      
    } catch (error) {
      console.log('❌ Failed to retrieve record:', error.message);
      console.log('   Error details:', error);
      return;
    }

    console.log('\n🎉 Test with dependencies completed successfully!');
    console.log('✅ Atproto service is working with real triplestore');
    console.log('✅ All dependencies loaded correctly');
    console.log('✅ Real RDF storage working');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('   Stack trace:', error.stack);
  } finally {
    if (broker) {
      await broker.stop();
      console.log('🛑 Broker stopped');
    }
  }
}

// Run the test
testWithDependencies(); 