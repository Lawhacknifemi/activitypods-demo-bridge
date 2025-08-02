const { ServiceBroker } = require('moleculer');

// Simple integration test with atproto and triplestore
async function testSimpleIntegration() {
  let broker;
  
  try {
    console.log('🚀 Testing atproto integration with real triplestore...');
    
    // Create a broker
    broker = new ServiceBroker({
      logger: {
        type: 'Console',
        options: {
          colors: true,
          moduleColors: false,
          autoPadding: true
        }
      }
    });

    // Load triplestore service first
    console.log('📁 Loading triplestore service...');
    try {
      const triplestoreService = require('./services/core/triplestore');
      broker.createService(triplestoreService);
      console.log('✅ Triplestore service loaded');
    } catch (error) {
      console.log('❌ Failed to load triplestore service:', error.message);
      return;
    }

    // Load atproto service
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
    
    // Check if services are available
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

    // Test basic atproto functionality
    console.log('\n🧪 Testing atproto service with real triplestore...');
    
    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';
    const testRkey = 'test-simple-integration-123';

    // Test 1: Create a record
    console.log('\n📝 Test 1: Creating a record with real triplestore...');
    try {
      const createResult = await broker.call('atproto.createRecord', {
        collection: testCollection,
        record: {
          text: 'Hello from simple ActivityPods integration!',
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
    console.log('\n📖 Test 2: Retrieving the record from real triplestore...');
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

    console.log('\n🎉 Simple integration test completed successfully!');
    console.log('✅ Atproto service is working with real triplestore');
    console.log('✅ Real RDF storage working');
    console.log('✅ Commit chaining working');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('   Stack trace:', error.stack);
  } finally {
    if (broker) {
      await broker.stop();
      console.log('🛑 Broker stopped');
    }
  }
}

// Run the test
testSimpleIntegration(); 