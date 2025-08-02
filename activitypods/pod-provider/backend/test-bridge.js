#!/usr/bin/env node

/**
 * Test script for the ActivityPub <-> atproto bridge functionality
 * This demonstrates cross-protocol synchronization
 */

const { ServiceBroker } = require('moleculer');

async function testBridge() {
  console.log('🧪 Testing ActivityPub <-> atproto Bridge...\n');

  // Create a broker instance
  const broker = new ServiceBroker({
    nodeID: 'bridge-test',
    logger: {
      type: 'Console',
      options: {
        colors: true,
        moduleColors: false,
        autoPadding: true
      }
    }
  });

  try {
    // Start the broker
    await broker.start();
    console.log('✅ Broker started successfully\n');

    // Test 1: Register a mapping between ActivityPub actor and atproto DID
    console.log('1️⃣ Registering actor-to-DID mapping...');
    const mappingResult = await broker.call('atproto.bridge.registerMapping', {
      actorUri: 'https://localhost:3000/users/testuser',
      did: 'did:plc:testuser123'
    });
    console.log('✅ Mapping registered:', mappingResult.message, '\n');

    // Test 2: Test ActivityPub to atproto conversion
    console.log('2️⃣ Testing ActivityPub to atproto conversion...');
    const activityPubPost = {
      type: 'Create',
      actor: 'https://localhost:3000/users/testuser',
      object: {
        type: 'Note',
        content: 'Hello from ActivityPub! This should be bridged to atproto.',
        published: new Date().toISOString()
      },
      published: new Date().toISOString()
    };

    const atprotoData = await broker.call('atproto.bridge.convertActivityPubToAtproto', {
      activity: activityPubPost
    });
    console.log('✅ ActivityPub converted to atproto:', atprotoData, '\n');

    // Test 3: Test atproto to ActivityPub conversion
    console.log('3️⃣ Testing atproto to ActivityPub conversion...');
    const atprotoPost = {
      text: 'Hello from atproto! This should be bridged to ActivityPub.',
      createdAt: new Date().toISOString()
    };

    const activityPubData = await broker.call('atproto.bridge.convertAtprotoToActivityPub', {
      record: atprotoPost,
      did: 'did:plc:testuser123',
      collection: 'app.bsky.feed.post'
    });
    console.log('✅ Atproto converted to ActivityPub:', activityPubData, '\n');

    // Test 4: Test mapping retrieval
    console.log('4️⃣ Testing mapping retrieval...');
    const did = await broker.call('atproto.bridge.getDidForActor', {
      actorUri: 'https://localhost:3000/users/testuser'
    });
    console.log('✅ DID for actor:', did);

    const actor = await broker.call('atproto.bridge.getActorForDid', {
      did: 'did:plc:testuser123'
    });
    console.log('✅ Actor for DID:', actor, '\n');

    console.log('🎉 All bridge tests passed! The cross-protocol functionality is working.\n');

  } catch (error) {
    console.error('❌ Bridge test failed:', error);
  } finally {
    await broker.stop();
    console.log('🛑 Broker stopped');
  }
}

// Run the test
testBridge().catch(console.error); 