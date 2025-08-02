#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const DID = 'did:plc:testuser123';
const COLLECTION = 'app.bsky.feed.post';

async function testSimpleAtproto() {
  console.log('🧪 Simple Atproto Test\n');

  try {
    // Test 1: Create a record
    console.log('1️⃣ Creating a test record...');
    const postData = {
      text: 'Simple test post from ActivityPods!',
      createdAt: new Date().toISOString()
    };
    
    const createResponse = await axios.post(
      `${BASE_URL}/atproto/${DID}/${COLLECTION}/simple-test-${Date.now()}`,
      postData,
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log('✅ Record created:', createResponse.data.uri);
    console.log('   CID:', createResponse.data.cid);
    
    // Test 2: Get the specific record
    console.log('\n2️⃣ Getting the specific record...');
    const rkey = createResponse.data.uri.split('/').pop();
    const getResponse = await axios.get(`${BASE_URL}/atproto/${DID}/${COLLECTION}/${rkey}`);
    
    console.log('✅ Record retrieved:', getResponse.data.uri);
    console.log('   Content:', getResponse.data.value.text);
    
    console.log('\n🎉 Basic atproto functionality is working!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testSimpleAtproto().catch(console.error); 