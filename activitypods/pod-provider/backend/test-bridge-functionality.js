#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const DID = 'did:plc:testuser123';
const WEBID = 'https://localhost:3000/users/testuser';
const COLLECTION = 'app.bsky.feed.post';

async function testBridgeFunctionality() {
  console.log('🌉 Testing Bridge Functionality\n');

  try {
    // Test 1: Register bridge mapping
    console.log('1️⃣ Registering bridge mapping...');
    const mappingResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.registerMapping`, {
      actorUri: WEBID,
      did: DID
    });
    
    console.log('✅ Bridge mapping registered:', mappingResponse.data.success);
    
    // Test 2: Get DID for Actor
    console.log('\n2️⃣ Getting DID for Actor...');
    const didResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.getDidForActor`, {
      actorUri: WEBID
    });
    
    console.log('✅ DID for actor:', didResponse.data.did);
    
    // Test 3: Get Actor for DID
    console.log('\n3️⃣ Getting Actor for DID...');
    const actorResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.getActorForDid`, {
      did: DID
    });
    
    console.log('✅ Actor for DID:', actorResponse.data.actorUri);
    
    // Test 4: Test ActivityPub to atproto conversion
    console.log('\n4️⃣ Testing ActivityPub to atproto conversion...');
    const apToAtprotoResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.convertActivityPubToAtproto`, {
      activity: {
        type: 'Create',
        actor: WEBID,
        object: {
          type: 'Note',
          content: 'Test ActivityPub post that should be converted to atproto!',
          published: new Date().toISOString()
        }
      }
    });
    
    console.log('✅ ActivityPub to atproto conversion:', apToAtprotoResponse.data.success);
    console.log('   Converted record:', apToAtprotoResponse.data.record);
    
    // Test 5: Test atproto to ActivityPub conversion
    console.log('\n5️⃣ Testing atproto to ActivityPub conversion...');
    const atprotoToApResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.convertAtprotoToActivityPub`, {
      record: {
        text: 'Test atproto post that should be converted to ActivityPub!',
        createdAt: new Date().toISOString()
      },
      did: DID,
      collection: COLLECTION
    });
    
    console.log('✅ Atproto to ActivityPub conversion:', atprotoToApResponse.data.success);
    console.log('   Converted activity:', atprotoToApResponse.data.activity);
    
    console.log('\n🎉 Bridge functionality is working!');
    console.log('   ✅ Bridge mapping registration');
    console.log('   ✅ DID/Actor lookups');
    console.log('   ✅ ActivityPub → atproto conversion');
    console.log('   ✅ atproto → ActivityPub conversion');
    
  } catch (error) {
    console.error('❌ Bridge test failed:', error.response?.data || error.message);
  }
}

testBridgeFunctionality().catch(console.error); 