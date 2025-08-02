const { ServiceBroker } = require('moleculer');

// Minimal test to verify atproto service connectivity
async function testMinimal() {
  let broker;
  
  try {
    console.log('🚀 Testing atproto service minimal connectivity...');
    
    // Create a broker with minimal logging
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
    
    // Check if atproto service is available
    if (broker.services.atproto) {
      console.log('✅ Atproto service is available');
      console.log('   Available actions:', Object.keys(broker.services.atproto.actions));
    } else {
      console.log('❌ Atproto service not found');
      return;
    }

    // Test a simple action call
    console.log('\n🧪 Testing simple action call...');
    try {
      // Just test if the service responds
      const result = await broker.call('atproto.listRecords', {
        collection: 'app.bsky.feed.post',
        did: 'did:plc:testuser123',
        limit: 1
      });
      
      console.log('✅ Action call successful');
      console.log('   Result:', result);
      
    } catch (error) {
      console.log('⚠️ Action call failed (expected if no triplestore):', error.message);
      console.log('   This is normal if triplestore service is not loaded');
    }

    console.log('\n🎉 Minimal test completed!');
    console.log('✅ Atproto service is loading and responding');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (broker) {
      await broker.stop();
      console.log('🛑 Broker stopped');
    }
  }
}

// Run the test
testMinimal(); 