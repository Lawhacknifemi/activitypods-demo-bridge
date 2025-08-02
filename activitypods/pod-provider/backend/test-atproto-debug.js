const { ServiceBroker } = require('moleculer');

// Create a broker for testing
const broker = new ServiceBroker({
  logger: console,
  logLevel: 'info'
});

// Mock atproto service for debugging
broker.createService({
  name: 'atproto',
  actions: {
    createRecord(ctx) {
      console.log('=== DEBUG: createRecord called ===');
      console.log('ctx.params:', JSON.stringify(ctx.params, null, 2));
      console.log('ctx.request:', ctx.request ? 'exists' : 'undefined');
      if (ctx.request) {
        console.log('ctx.request.body:', JSON.stringify(ctx.request.body, null, 2));
      }
      console.log('ctx.meta:', JSON.stringify(ctx.meta, null, 2));
      
      return {
        message: 'Debug info logged',
        params: ctx.params,
        hasRequest: !!ctx.request,
        requestBody: ctx.request?.body
      };
    },
    
    getRecord(ctx) {
      console.log('=== DEBUG: getRecord called ===');
      console.log('ctx.params:', JSON.stringify(ctx.params, null, 2));
      
      return {
        message: 'Debug info logged',
        params: ctx.params
      };
    }
  }
});

async function testDirectCall() {
  console.log('\n🧪 Testing direct service call...');
  
  try {
    const result = await broker.call('atproto.createRecord', {
      did: 'did:plc:testuser123',
      collection: 'app.bsky.feed.post',
      rkey: 'test-post-123',
      record: { text: 'Hello world' }
    });
    
    console.log('Direct call result:', result);
  } catch (error) {
    console.error('Direct call error:', error.message);
  }
}

async function testRestSimulation() {
  console.log('\n🧪 Testing REST API simulation...');
  
  try {
    // Simulate how moleculer-web would call the service
    const result = await broker.call('atproto.createRecord', {
      did: 'did:plc:testuser123',
      collection: 'app.bsky.feed.post',
      rkey: 'test-post-123'
    }, {
      meta: {
        $responseType: 'application/json'
      }
    });
    
    console.log('REST simulation result:', result);
  } catch (error) {
    console.error('REST simulation error:', error.message);
  }
}

async function runTests() {
  try {
    await broker.start();
    
    await testDirectCall();
    await testRestSimulation();
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await broker.stop();
  }
}

runTests(); 