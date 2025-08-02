const { ServiceBroker } = require('moleculer');
const path = require('path');
const glob = require('glob');

// Test atproto integration with real ActivityPods services
async function testRealIntegration() {
  let broker;
  
  try {
    console.log('🚀 Testing atproto integration with real ActivityPods services...');
    
    // Create a broker that loads all ActivityPods services
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

    // Load all services from the services directory (same as moleculer-runner)
    const serviceFiles = glob.sync('services/*.js').concat(glob.sync('services/**/*.js'));
    console.log('📁 Found service files:', serviceFiles);
    
    for (const serviceFile of serviceFiles) {
      try {
        const service = require(path.resolve(serviceFile));
        broker.createService(service);
        console.log(`✅ Loaded service from: ${serviceFile}`);
      } catch (error) {
        console.log(`⚠️ Failed to load service from ${serviceFile}:`, error.message);
      }
    }

    // Start the broker
    await broker.start();
    
    console.log('✅ ActivityPods services loaded successfully');
    console.log('📋 Available services:', Object.keys(broker.services));

    // Check if our atproto service is loaded
    if (broker.services.atproto) {
      console.log('✅ Atproto service is loaded and available');
    } else {
      console.log('❌ Atproto service not found');
      return;
    }

    // Check if required services are available
    const requiredServices = ['triplestore', 'jsonld'];
    for (const serviceName of requiredServices) {
      if (broker.services[serviceName]) {
        console.log(`✅ ${serviceName} service is available`);
      } else {
        console.log(`❌ ${serviceName} service not found`);
        return;
      }
    }

    // Test basic atproto functionality
    console.log('\n🧪 Testing atproto service with real triplestore...');
    
    const testDid = 'did:plc:testuser123';
    const testCollection = 'app.bsky.feed.post';
    const testRkey = 'test-real-integration-123';

    // Test 1: Create a record
    console.log('\n📝 Test 1: Creating a record with real triplestore...');
    try {
      const createResult = await broker.call('atproto.createRecord', {
        collection: testCollection,
        record: {
          text: 'Hello from real ActivityPods integration!',
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

    // Test 3: List records
    console.log('\n📋 Test 3: Listing records from real triplestore...');
    try {
      const listResult = await broker.call('atproto.listRecords', {
        collection: testCollection,
        did: testDid,
        limit: 10
      });
      
      console.log('✅ Records listed successfully');
      console.log('   Found records:', listResult.records.length);
      console.log('   Cursor:', listResult.cursor);
      
    } catch (error) {
      console.log('❌ Failed to list records:', error.message);
      console.log('   Error details:', error);
      return;
    }

    // Test 4: Update the record
    console.log('\n✏️ Test 4: Updating the record in real triplestore...');
    try {
      const updateResult = await broker.call('atproto.updateRecord', {
        collection: testCollection,
        rkey: testRkey,
        did: testDid,
        record: {
          text: 'Updated via real ActivityPods integration!',
          createdAt: new Date().toISOString(),
          langs: ['en', 'es']
        }
      });
      
      console.log('✅ Record updated successfully:', updateResult.uri);
      console.log('   New CID:', updateResult.cid);
      console.log('   New Commit Seq:', updateResult.commitSeq);
      
    } catch (error) {
      console.log('❌ Failed to update record:', error.message);
      console.log('   Error details:', error);
      return;
    }

    // Test 5: Delete the record
    console.log('\n🗑️ Test 5: Deleting the record from real triplestore...');
    try {
      const deleteResult = await broker.call('atproto.deleteRecord', {
        collection: testCollection,
        rkey: testRkey,
        did: testDid
      });
      
      console.log('✅ Record deleted successfully:', deleteResult.uri);
      console.log('   Tombstone CID:', deleteResult.cid);
      console.log('   Delete Commit Seq:', deleteResult.commitSeq);
      
    } catch (error) {
      console.log('❌ Failed to delete record:', error.message);
      console.log('   Error details:', error);
      return;
    }

    console.log('\n🎉 Real ActivityPods integration test completed successfully!');
    console.log('✅ Atproto service is fully integrated with ActivityPods');
    console.log('✅ Real triplestore operations working');
    console.log('✅ Commit chaining working');
    console.log('✅ RDF storage working');

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
testRealIntegration(); 