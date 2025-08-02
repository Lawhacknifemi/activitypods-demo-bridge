#!/usr/bin/env node

const { ServiceBroker } = require('moleculer');

async function testBridgeDirect() {
  console.log('🔍 Testing Bridge Service Directly\n');

  const broker = new ServiceBroker({
    nodeID: 'bridge-test',
    logger: false,
    metrics: false
  });

  try {
    // Connect to the running ActivityPods broker
    await broker.start();
    
    // Test 1: Check if bridge service is available
    console.log('1️⃣ Checking if bridge service is available...');
    const services = await broker.call('$node.list');
    const bridgeService = services.find(s => s.name === 'atproto.bridge');
    
    if (bridgeService) {
      console.log('✅ Bridge service found:', bridgeService.name);
    } else {
      console.log('❌ Bridge service not found');
      console.log('Available services:', services.map(s => s.name));
      return;
    }
    
    // Test 2: Call bridge service directly
    console.log('\n2️⃣ Testing bridge service directly...');
    try {
      const result = await broker.call('atproto.bridge.registerMapping', {
        actorUri: 'https://localhost:3000/users/testuser',
        did: 'did:plc:testuser123'
      });
      console.log('✅ Bridge service call successful:', result);
    } catch (error) {
      console.log('❌ Bridge service call failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await broker.stop();
  }
}

testBridgeDirect().catch(console.error); 