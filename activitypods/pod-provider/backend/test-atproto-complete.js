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
    query: async () => ({ results: [] }),
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

async function testAtprotoService() {
  try {
    console.log('🚀 Starting Moleculer broker with dependencies...');
    await broker.start();
    
    console.log('✅ Broker started successfully');
    console.log('📋 Available services:', Object.keys(broker.services));
    
    // Test the hello action
    console.log('🧪 Testing atproto.hello action...');
    const result = await broker.call('atproto.hello');
    console.log('✅ Hello action result:', result);
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

testAtprotoService(); 