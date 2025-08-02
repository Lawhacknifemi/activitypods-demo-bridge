const { ServiceBroker } = require('moleculer');
const ApiGatewayService = require('moleculer-web');

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
        console.log('ctx.request.headers:', JSON.stringify(ctx.request.headers, null, 2));
      }
      console.log('ctx.meta:', JSON.stringify(ctx.meta, null, 2));
      
      return {
        message: 'Debug info logged',
        params: ctx.params,
        hasRequest: !!ctx.request,
        requestBody: ctx.request?.body
      };
    }
  }
});

// Mock API Gateway service
broker.createService({
  mixins: [ApiGatewayService],
  settings: {
    port: 3001,
    routes: [
      {
        name: 'atproto',
        path: '/atproto',
        aliases: {
          'POST /:did/:collection/:rkey': 'atproto.createRecord'
        },
        opts: {
          parseParams: true
        }
      }
    ]
  }
});

async function testRestApi() {
  console.log('\n🧪 Testing actual REST API call...');
  
  try {
    // Start the broker
    await broker.start();
    
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('API Gateway should be running on port 3001');
    console.log('You can test with:');
    console.log('curl -X POST http://localhost:3001/atproto/did:plc:testuser123/app.bsky.feed.post/test-post-123 \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"text": "Hello world"}\'');
    
    // Keep running for manual testing
    console.log('\nPress Ctrl+C to stop...');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testRestApi();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await broker.stop();
  process.exit(0);
}); 