#!/usr/bin/env node

const axios = require('axios');

async function testServices() {
  console.log('🔍 Testing Available Services\n');

  try {
    // Test 1: Check if atproto service is working
    console.log('1️⃣ Testing atproto service...');
    const atprotoResponse = await axios.get('http://localhost:3000/atproto/did:plc:testuser123/app.bsky.feed.post');
    console.log('✅ Atproto service working:', atprotoResponse.status);
    
    // Test 2: Check if bridge service is available
    console.log('\n2️⃣ Testing bridge service...');
    try {
      const bridgeResponse = await axios.post('http://localhost:3000/bridge/registerMapping', {
        actorUri: 'https://localhost:3000/users/testuser',
        did: 'did:plc:testuser123'
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('✅ Bridge service working:', bridgeResponse.status, bridgeResponse.data);
    } catch (error) {
      console.log('❌ Bridge service error:', error.response?.status, error.response?.data);
    }
    
    // Test 3: Check what's actually at the /api endpoint
    console.log('\n3️⃣ Testing /api endpoint...');
    try {
      const apiResponse = await axios.get('http://localhost:3000/api');
      console.log('✅ /api endpoint working:', apiResponse.status);
    } catch (error) {
      console.log('❌ /api endpoint error:', error.response?.status);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testServices().catch(console.error); 