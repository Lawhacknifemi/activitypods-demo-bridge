const { ServiceBroker } = require('moleculer');

// Simple test to check if atproto service loads
async function testAtprotoLoad() {
  try {
    console.log('🚀 Testing atproto service loading...');
    
    // Create a broker
    const broker = new ServiceBroker({
      logger: false // Disable logging for cleaner output
    });

    // Try to load just the atproto service
    try {
      const atprotoService = require('./services/core/atproto');
      broker.createService(atprotoService);
      console.log('✅ Atproto service loaded successfully');
    } catch (error) {
      console.log('❌ Failed to load atproto service:', error.message);
      console.log('   Error details:', error);
      return;
    }

    // Start the broker
    await broker.start();
    console.log('✅ Broker started successfully');
    
    // Check if atproto service is available
    if (broker.services.atproto) {
      console.log('✅ Atproto service is registered and available');
      console.log('   Available actions:', Object.keys(broker.services.atproto.actions));
    } else {
      console.log('❌ Atproto service not found in broker');
    }

    await broker.stop();
    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testAtprotoLoad(); 