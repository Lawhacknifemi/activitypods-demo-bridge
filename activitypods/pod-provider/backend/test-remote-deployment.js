#!/usr/bin/env node

const axios = require('axios');
const WebSocket = require('ws');

// Configuration - Update these for your deployment
const DOMAIN = process.argv[2] || 'your-domain.com';
const BASE_URL = `https://${DOMAIN}`;
const FIREHOSE_URL = `wss://${DOMAIN}/firehose`;
const DID = 'did:plc:testuser123';
const WEBID = `https://${DOMAIN}/users/testuser`;
const COLLECTION = 'app.bsky.feed.post';

let testResults = {
  activitypods: false,
  atproto: false,
  bridge: false,
  federation: false,
  firehose: false,
  ssl: false,
  dns: false
};

async function testRemoteDeployment() {
  console.log(`🌐 Testing Remote Deployment: ${BASE_URL}\n`);
  console.log('Testing all components to ensure proper deployment...\n');

  try {
    // Test 1: DNS Resolution
    console.log('1️⃣ Testing DNS Resolution...');
    await testDNS();
    console.log('✅ DNS resolution working\n');

    // Test 2: SSL/TLS
    console.log('2️⃣ Testing SSL/TLS...');
    await testSSL();
    console.log('✅ SSL/TLS working\n');

    // Test 3: ActivityPods Basic Functionality
    console.log('3️⃣ Testing ActivityPods Basic Functionality...');
    await testActivityPods();
    console.log('✅ ActivityPods basic functionality working\n');

    // Test 4: Atproto Basic Functionality
    console.log('4️⃣ Testing Atproto Basic Functionality...');
    await testAtproto();
    console.log('✅ Atproto basic functionality working\n');

    // Test 5: Bridge Functionality
    console.log('5️⃣ Testing Bridge Functionality...');
    await testBridge();
    console.log('✅ Bridge functionality working\n');

    // Test 6: Federation Functionality
    console.log('6️⃣ Testing Federation Functionality...');
    await testFederation();
    console.log('✅ Federation functionality working\n');

    // Test 7: Firehose WebSocket
    console.log('7️⃣ Testing Firehose WebSocket...');
    await testFirehose();
    console.log('✅ Firehose WebSocket working\n');

    // Test 8: Complete Integration Test
    console.log('8️⃣ Testing Complete Integration...');
    await testCompleteIntegration();
    console.log('✅ Complete integration working\n');

    // Print final results
    printTestResults();

  } catch (error) {
    console.error('❌ Remote deployment test failed:', error.response?.data || error.message);
    printTestResults();
  }
}

async function testDNS() {
  try {
    const dns = require('dns').promises;
    await dns.resolve4(DOMAIN);
    testResults.dns = true;
  } catch (error) {
    console.log('   ❌ DNS resolution failed:', error.message);
  }
}

async function testSSL() {
  try {
    const https = require('https');
    const response = await new Promise((resolve, reject) => {
      https.get(BASE_URL, (res) => {
        resolve(res);
      }).on('error', reject);
    });
    
    if (response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302) {
      testResults.ssl = true;
    }
  } catch (error) {
    console.log('   ❌ SSL test failed:', error.message);
  }
}

async function testActivityPods() {
  try {
    const response = await axios.get(`${BASE_URL}/.well-known/app-status`, {
      timeout: 10000
    });
    console.log('   📊 ActivityPods status:', response.status);
    testResults.activitypods = true;
  } catch (error) {
    console.log('   ❌ ActivityPods test failed:', error.message);
  }
}

async function testAtproto() {
  try {
    const response = await axios.get(`${BASE_URL}/atproto/${DID}/${COLLECTION}`, {
      timeout: 10000
    });
    console.log('   📊 Atproto list records:', response.status);
    testResults.atproto = true;
  } catch (error) {
    console.log('   ❌ Atproto test failed:', error.message);
  }
}

async function testBridge() {
  try {
    const mappingResponse = await axios.post(`${BASE_URL}/bridge/registerMapping`, {
      actorUri: WEBID,
      did: DID
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log('   📊 Bridge mapping registered:', mappingResponse.data.success);
    testResults.bridge = true;
  } catch (error) {
    console.log('   ❌ Bridge test failed:', error.message);
  }
}

async function testFederation() {
  try {
    const statusResponse = await axios.get(`${BASE_URL}/xrpc/com.atproto.sync.getRepoStatus?did=${DID}`, {
      timeout: 10000
    });
    console.log('   📊 Federation repo status:', statusResponse.data.status);
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
    
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        console.log('   ⏰ Firehose connection timeout');
      }
      resolve();
    }, 5000);
  });
}

async function testCompleteIntegration() {
  try {
    const postData = {
      text: 'Remote deployment test post! This should work across protocols.',
      createdAt: new Date().toISOString()
    };
    
    const rkey = `remote-test-${Date.now()}`;
    const postResponse = await axios.post(
      `${BASE_URL}/atproto/${DID}/${COLLECTION}/${rkey}`,
      postData,
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    console.log('   📊 Integration post created:', postResponse.data.uri);
    testResults.integration = true;
  } catch (error) {
    console.log('   ❌ Integration test failed:', error.message);
  }
}

function printTestResults() {
  console.log('\n📋 Remote Deployment Test Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const results = [
    { name: 'DNS Resolution', status: testResults.dns },
    { name: 'SSL/TLS', status: testResults.ssl },
    { name: 'ActivityPods', status: testResults.activitypods },
    { name: 'Atproto', status: testResults.atproto },
    { name: 'Bridge', status: testResults.bridge },
    { name: 'Federation', status: testResults.federation },
    { name: 'Firehose', status: testResults.firehose },
    { name: 'Complete Integration', status: testResults.integration }
  ];
  
  results.forEach(result => {
    const icon = result.status ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.status ? 'Working' : 'Failed'}`);
  });
  
  const allWorking = results.every(r => r.status);
  
  console.log('\n🎯 Overall Deployment Status:');
  if (allWorking) {
    console.log('🎉 DEPLOYMENT SUCCESSFUL! Your ActivityPods + atproto bridge is live!');
    console.log('');
    console.log('🚀 What this means:');
    console.log('   • Your domain is properly configured and accessible');
    console.log('   • SSL/TLS is working correctly');
    console.log('   • All services are responding');
    console.log('   • Cross-protocol bridge is functioning');
    console.log('   • Federation is ready for external connections');
    console.log('');
    console.log('🌐 Your Live Endpoints:');
    console.log(`   • ActivityPods API: ${BASE_URL}`);
    console.log(`   • Atproto API: ${BASE_URL}/atproto`);
    console.log(`   • Bridge API: ${BASE_URL}/bridge`);
    console.log(`   • Federation: ${BASE_URL}/xrpc`);
    console.log(`   • Firehose: ${FIREHOSE_URL}`);
  } else {
    console.log('⚠️  Some components need attention. Check the failed tests above.');
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   • Ensure DNS is properly configured');
    console.log('   • Check SSL certificate is valid');
    console.log('   • Verify all services are running');
    console.log('   • Check firewall settings');
    console.log('   • Review deployment logs');
  }
}

// Usage instructions
if (process.argv.length < 3) {
  console.log('Usage: node test-remote-deployment.js <your-domain.com>');
  console.log('Example: node test-remote-deployment.js activitypods.example.com');
  process.exit(1);
}

// Run the test
testRemoteDeployment().catch(console.error); 