const { ServiceBroker } = require('moleculer');

// Connect to the running ActivityPods instance
const broker = new ServiceBroker({
  logger: console,
  logLevel: 'info',
  transporter: 'redis://localhost:6379'
});

async function testAtprotoService() {
  console.log('🧪 Testing atproto service directly...');
  
  try {
    await broker.start();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Testing atproto.hello...');
    const helloResult = await broker.call('atproto.hello');
    console.log('Hello result:', helloResult);
    
    console.log('\nTesting atproto.createRecord with direct call...');
    const createResult = await broker.call('atproto.createRecord', {
      did: 'did:plc:testuser123',
      collection: 'app.bsky.feed.post',
      rkey: 'test-post-123',
      record: {
        text: 'Hello from direct call!',
        createdAt: new Date().toISOString()
      }
    });
    console.log('Create result:', createResult);
    
  } catch (error) {
    console.error('Test error:', error.message);
    console.error('Full error:', error);
  } finally {
    await broker.stop();
  }
}

testAtprotoService(); 