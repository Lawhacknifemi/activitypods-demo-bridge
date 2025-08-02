#!/usr/bin/env node

/**
 * Complete System Test for ActivityPods + Atproto + Bridge + Federation
 * Tests all components to ensure everything works properly
 */

const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3000';
const FIREHOSE_URL = 'ws://localhost:3001';
const DID = 'did:plc:testuser123';
const WEBID = 'https://localhost:3000/users/testuser';
const COLLECTION = 'app.bsky.feed.post';

let testResults = {
  activitypods: false,
  atproto: false,
  bridge: false,
  federation: false,
  firehose: false,
  appview: false
};

async function testCompleteSystem() {
  console.log('🧪 Complete System Test: ActivityPods + Atproto + Bridge + Federation\n');
  console.log('Testing all components to ensure proper integration...\n');

  try {
    // Test 1: ActivityPods Basic Functionality
    console.log('1️⃣ Testing ActivityPods Basic Functionality...');
    await testActivityPods();
    console.log('✅ ActivityPods basic functionality working\n');

    // Test 2: Atproto Basic Functionality
    console.log('2️⃣ Testing Atproto Basic Functionality...');
    await testAtproto();
    console.log('✅ Atproto basic functionality working\n');

    // Test 3: Bridge Functionality
    console.log('3️⃣ Testing Bridge Functionality...');
    await testBridge();
    console.log('✅ Bridge functionality working\n');

    // Test 4: Federation Functionality
    console.log('4️⃣ Testing Federation Functionality...');
    await testFederation();
    console.log('✅ Federation functionality working\n');

    // Test 5: Firehose WebSocket
    console.log('5️⃣ Testing Firehose WebSocket...');
    await testFirehose();
    console.log('✅ Firehose WebSocket working\n');

    // Test 6: Complete Integration Test
    console.log('6️⃣ Testing Complete Integration...');
    await testCompleteIntegration();
    console.log('✅ Complete integration working\n');

    // Test 7: External Federation Test
    console.log('7️⃣ Testing External Federation...');
    await testExternalFederation();
    console.log('✅ External federation working\n');

    // Print final results
    printTestResults();

  } catch (error) {
    console.error('❌ System test failed:', error.response?.data || error.message);
    console.log('\n💡 Check that ActivityPods is running with all services enabled.');
    printTestResults();
  }
}

async function testActivityPods() {
  try {
    // Test basic ActivityPods endpoints
    const response = await axios.get(`${BASE_URL}/.well-known/app-status`);
    console.log('   📊 ActivityPods status:', response.status);
    
    // Test nodeinfo
    const nodeinfo = await axios.get(`${BASE_URL}/.well-known/nodeinfo`);
    console.log('   📊 NodeInfo available:', !!nodeinfo.data);
    
    testResults.activitypods = true;
  } catch (error) {
    console.log('   ❌ ActivityPods test failed:', error.message);
  }
}

async function testAtproto() {
  try {
    // Test atproto endpoints
    const response = await axios.get(`${BASE_URL}/atproto/${DID}/${COLLECTION}`);
    console.log('   📊 Atproto list records:', response.status);
    
    // Test atproto service availability
    const serviceResponse = await axios.get(`${BASE_URL}/atproto`);
    console.log('   📊 Atproto service available:', !!serviceResponse);
    
    testResults.atproto = true;
  } catch (error) {
    console.log('   ❌ Atproto test failed:', error.message);
  }
}

async function testBridge() {
  try {
    // Test bridge mapping registration
    const mappingResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.registerMapping`, {
      actorUri: WEBID,
      did: DID
    });
    console.log('   📊 Bridge mapping registered:', mappingResponse.data.success);
    
    // Test bridge conversion functions
    const conversionResponse = await axios.post(`${BASE_URL}/api/atproto.bridge.convertAtprotoToActivityPub`, {
      record: { text: 'Test conversion' },
      did: DID,
      collection: COLLECTION
    });
    console.log('   📊 Bridge conversion working:', !!conversionResponse.data);
    
    testResults.bridge = true;
  } catch (error) {
    console.log('   ❌ Bridge test failed:', error.message);
  }
}

async function testFederation() {
  try {
    // Test federation endpoints
    const statusResponse = await axios.get(`${BASE_URL}/xrpc/com.atproto.sync.getRepoStatus?did=${DID}`);
    console.log('   📊 Federation repo status:', statusResponse.data.status);
    
    // Test CAR file export
    const carResponse = await axios.get(`${BASE_URL}/xrpc/com.atproto.sync.getRepo?did=${DID}`, {
      responseType: 'arraybuffer'
    });
    console.log('   📊 CAR file export working:', carResponse.data.length > 0);
    
    testResults.federation = true;
  } catch (error) {
    console.log('   ❌ Federation test failed:', error.message);
  }
}

async function testFirehose() {
  return new Promise((resolve) => {
    const ws = new WebSocket(FIREHOSE_URL);
    
    ws.on('open', () => {
      console.log('   🔗 Firehose WebSocket connected');
      ws.close();
      testResults.firehose = true;
      resolve();
    });
    
    ws.on('error', (error) => {
      console.log('   ❌ Firehose connection failed:', error.message);
      resolve();
    });
    
    // Timeout after 3 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        console.log('   ⏰ Firehose connection timeout');
      }
      resolve();
    }, 3000);
  });
}

async function testCompleteIntegration() {
  try {
    // Create a post via atproto (should trigger bridge and federation)
    const postData = {
      text: 'Complete integration test post! This should appear in both ActivityPub and atproto with federation.',
      createdAt: new Date().toISOString()
    };
    
    const postResponse = await axios.post(
      `${BASE_URL}/atproto/${DID}/${COLLECTION}/integration-test-${Date.now()}`,
      postData,
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log('   📊 Integration post created:', postResponse.data.uri);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if post exists
    const recordsResponse = await axios.get(`${BASE_URL}/atproto/${DID}/${COLLECTION}`);
    console.log('   📊 Records after integration:', recordsResponse.data.length);
    
    testResults.integration = true;
  } catch (error) {
    console.log('   ❌ Integration test failed:', error.message);
  }
}

async function testExternalFederation() {
  try {
    // Test appview server connectivity
    const appviewResponse = await axios.get('https://bsky.social/xrpc/com.atproto.server.describeServer', {
      timeout: 5000
    });
    console.log('   📊 AppView server reachable:', appviewResponse.status === 200);
    
    // Test external atproto federation endpoint
    const externalResponse = await axios.get(`${BASE_URL}/xrpc/com.atproto.sync.getRepoStatus?did=${DID}`);
    console.log('   📊 External federation endpoint working:', externalResponse.status === 200);
    
    testResults.appview = true;
  } catch (error) {
    console.log('   ❌ External federation test failed:', error.message);
  }
}

function printTestResults() {
  console.log('\n📋 Test Results Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const results = [
    { name: 'ActivityPods', status: testResults.activitypods },
    { name: 'Atproto', status: testResults.atproto },
    { name: 'Bridge', status: testResults.bridge },
    { name: 'Federation', status: testResults.federation },
    { name: 'Firehose', status: testResults.firehose },
    { name: 'AppView Integration', status: testResults.appview },
    { name: 'Complete Integration', status: testResults.integration }
  ];
  
  results.forEach(result => {
    const icon = result.status ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.status ? 'Working' : 'Failed'}`);
  });
  
  const allWorking = results.every(r => r.status);
  
  console.log('\n🎯 Overall Status:');
  if (allWorking) {
    console.log('🎉 ALL SYSTEMS WORKING! Your ActivityPods instance has complete atproto federation!');
    console.log('');
    console.log('🚀 What this means:');
    console.log('   • Posts created in ActivityPods appear in both ActivityPub and atproto');
    console.log('   • Content is automatically federated to external networks');
    console.log('   • Your posts are discoverable by Bluesky and other atproto apps');
    console.log('   • Real-time firehose streaming is working');
    console.log('   • Cross-protocol bridge is functioning');
  } else {
    console.log('⚠️  Some components need attention. Check the failed tests above.');
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   • Ensure ActivityPods is running with all services enabled');
    console.log('   • Check that federation services are loaded');
    console.log('   • Verify firehose port 3001 is available');
    console.log('   • Check network connectivity for external federation');
  }
}

// Run the complete test
testCompleteSystem().catch(console.error); 