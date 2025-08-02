#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const DID = 'did:plc:testuser123';
const WEBID = 'https://localhost:3000/users/testuser';

async function testBridgeEndpoints() {
  console.log('🌉 Testing All Bridge Endpoints\n');

  try {
    // Test 1: Register mapping
    console.log('1️⃣ Testing registerMapping...');
    const mappingResponse = await axios.post(`${BASE_URL}/bridge/registerMapping`, {
      actorUri: WEBID,
      did: DID
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ registerMapping:', mappingResponse.data);

    // Test 2: Get DID for Actor
    console.log('\n2️⃣ Testing getDidForActor...');
    const didResponse = await axios.post(`${BASE_URL}/bridge/getDidForActor`, {
      actorUri: WEBID
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ getDidForActor:', didResponse.data);

    // Test 3: Get Actor for DID
    console.log('\n3️⃣ Testing getActorForDid...');
    const actorResponse = await axios.post(`${BASE_URL}/bridge/getActorForDid`, {
      did: DID
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ getActorForDid:', actorResponse.data);

    // Test 4: Convert ActivityPub to atproto
    console.log('\n4️⃣ Testing convertActivityPubToAtproto...');
    const apToAtprotoResponse = await axios.post(`${BASE_URL}/bridge/convertActivityPubToAtproto`, {
      activity: {
        type: 'Create',
        actor: WEBID,
        object: {
          type: 'Note',
          content: 'Test ActivityPub post for conversion!',
          published: new Date().toISOString()
        }
      }
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ convertActivityPubToAtproto:', apToAtprotoResponse.data);

    // Test 5: Convert atproto to ActivityPub
    console.log('\n5️⃣ Testing convertAtprotoToActivityPub...');
    const atprotoToApResponse = await axios.post(`${BASE_URL}/bridge/convertAtprotoToActivityPub`, {
      record: {
        text: 'Test atproto post for conversion!',
        createdAt: new Date().toISOString()
      },
      did: DID,
      collection: 'app.bsky.feed.post'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ convertAtprotoToActivityPub:', atprotoToApResponse.data);

    console.log('\n🎉 All bridge endpoints are working!');
    console.log('✅ Bridge service is fully functional');

  } catch (error) {
    console.error('❌ Bridge test failed:', error.response?.data || error.message);
  }
}

testBridgeEndpoints().catch(console.error); 