# Complete System Testing Guide

## 🧪 How to Test the Complete ActivityPods + Atproto + Bridge + Federation System

This guide will help you test all components to ensure everything works properly.

## 📋 Prerequisites

1. **ActivityPods is running** on `http://localhost:3000`
2. **All services are loaded** (atproto, bridge, federation)
3. **Dependencies are installed** (ws, jsonwebtoken, async-lock)
4. **Firehose port 3001** is available

## 🚀 Step-by-Step Testing

### Step 1: Install Dependencies

```bash
# Install federation dependencies
cd semapps/src/middleware/packages/atproto
npm install ws jsonwebtoken async-lock

# Go back to ActivityPods backend
cd ../../../../../activitypods/pod-provider/backend
```

### Step 2: Start ActivityPods

```bash
# Start ActivityPods with all services
npm run dev
```

**Expected output:**
```
[INFO] Atproto Federation service started
[INFO] Firehose server listening on port 3001
[INFO] Bridge service started
[INFO] Atproto service started
```

### Step 3: Run Complete System Test

```bash
# Make test script executable
chmod +x test-complete-system.js

# Run the complete test
node test-complete-system.js
```

**Expected output:**
```
🧪 Complete System Test: ActivityPods + Atproto + Bridge + Federation

1️⃣ Testing ActivityPods Basic Functionality...
   📊 ActivityPods status: 200
   📊 NodeInfo available: true
✅ ActivityPods basic functionality working

2️⃣ Testing Atproto Basic Functionality...
   📊 Atproto list records: 200
   📊 Atproto service available: true
✅ Atproto basic functionality working

3️⃣ Testing Bridge Functionality...
   📊 Bridge mapping registered: true
   📊 Bridge conversion working: true
✅ Bridge functionality working

4️⃣ Testing Federation Functionality...
   📊 Federation repo status: active
   📊 CAR file export working: true
✅ Federation functionality working

5️⃣ Testing Firehose WebSocket...
   🔗 Firehose WebSocket connected
✅ Firehose WebSocket working

6️⃣ Testing Complete Integration...
   📊 Integration post created: at://did:plc:testuser123/app.bsky.feed.post/...
   📊 Records after integration: 1
✅ Complete integration working

7️⃣ Testing External Federation...
   📊 AppView server reachable: true
   📊 External federation endpoint working: true
✅ External federation working

📋 Test Results Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ActivityPods: Working
✅ Atproto: Working
✅ Bridge: Working
✅ Federation: Working
✅ Firehose: Working
✅ AppView Integration: Working
✅ Complete Integration: Working

🎯 Overall Status:
🎉 ALL SYSTEMS WORKING! Your ActivityPods instance has complete atproto federation!
```

## 🔍 Individual Component Tests

### Test 1: ActivityPods Basic Functionality

```bash
# Test ActivityPods status
curl http://localhost:3000/.well-known/app-status

# Test nodeinfo
curl http://localhost:3000/.well-known/nodeinfo
```

### Test 2: Atproto Functionality

```bash
# Test atproto list records
curl http://localhost:3000/atproto/did:plc:testuser123/app.bsky.feed.post

# Test atproto service
curl http://localhost:3000/atproto
```

### Test 3: Bridge Functionality

```bash
# Register bridge mapping
curl -X POST http://localhost:3000/api/atproto.bridge.registerMapping \
  -H "Content-Type: application/json" \
  -d '{
    "actorUri": "https://localhost:3000/users/testuser",
    "did": "did:plc:testuser123"
  }'

# Test bridge conversion
curl -X POST http://localhost:3000/api/atproto.bridge.convertAtprotoToActivityPub \
  -H "Content-Type: application/json" \
  -d '{
    "record": {"text": "Test conversion"},
    "did": "did:plc:testuser123",
    "collection": "app.bsky.feed.post"
  }'
```

### Test 4: Federation Functionality

```bash
# Test federation repo status
curl "http://localhost:3000/xrpc/com.atproto.sync.getRepoStatus?did=did:plc:testuser123"

# Test CAR file export
curl "http://localhost:3000/xrpc/com.atproto.sync.getRepo?did=did:plc:testuser123" \
  --output repo.car
```

### Test 5: Firehose WebSocket

```bash
# Test firehose connection (using wscat if available)
wscat -c ws://localhost:3001

# Or use the test script
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001');
ws.on('open', () => console.log('Connected to firehose'));
ws.on('message', (data) => console.log('Received:', data.toString()));
"
```

### Test 6: Complete Integration

```bash
# Create a post that triggers everything
curl -X POST http://localhost:3000/atproto/did:plc:testuser123/app.bsky.feed.post/test-post \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Integration test post!",
    "createdAt": "2025-08-01T12:00:00.000Z"
  }'

# Check if post was created
curl http://localhost:3000/atproto/did:plc:testuser123/app.bsky.feed.post
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Issue 1: ActivityPods not starting
```bash
# Check if port 3000 is available
lsof -i :3000

# Kill any existing process
kill -9 $(lsof -t -i:3000)

# Restart ActivityPods
npm run dev
```

#### Issue 2: Firehose not starting
```bash
# Check if port 3001 is available
lsof -i :3001

# Check federation service logs
# Look for: "Firehose server listening on port 3001"
```

#### Issue 3: Federation dependencies missing
```bash
# Install missing dependencies
cd semapps/src/middleware/packages/atproto
npm install ws jsonwebtoken async-lock

# Restart ActivityPods
cd ../../../../../activitypods/pod-provider/backend
npm run dev
```

#### Issue 4: Bridge mapping not working
```bash
# Check bridge service is loaded
# Look for: "Bridge service started" in logs

# Test bridge endpoint directly
curl -X POST http://localhost:3000/api/atproto.bridge.registerMapping \
  -H "Content-Type: application/json" \
  -d '{"actorUri": "https://localhost:3000/users/testuser", "did": "did:plc:testuser123"}'
```

#### Issue 5: External federation failing
```bash
# Check network connectivity
curl https://bsky.social/xrpc/com.atproto.server.describeServer

# Check if JWT secret is configured
echo $JWT_SECRET
```

## 📊 Monitoring and Logs

### Key Log Messages to Watch For

```
✅ Success Messages:
- "Atproto Federation service started"
- "Firehose server listening on port 3001"
- "Bridge service started"
- "Broadcasting firehose message to X clients"
- "Successfully notified appview server"

❌ Error Messages:
- "Failed to start firehose server"
- "Bridge mapping not found"
- "Failed to notify appview server"
- "Firehose connection error"
```

### Debug Mode

Enable debug logging in ActivityPods:

```javascript
// In moleculer.config.js
logger: {
  level: 'debug'
}
```

## 🎯 Expected Test Results

### All Tests Passing ✅

If all tests pass, you have:

- ✅ **Complete ActivityPods functionality**
- ✅ **Full atproto support** with CID/MST storage
- ✅ **Cross-protocol bridge** between ActivityPub and atproto
- ✅ **Real-time firehose streaming** on port 3001
- ✅ **External federation** with Bluesky and other atproto instances
- ✅ **CAR file exports** for repository synchronization
- ✅ **AppView integration** for content discovery

### What This Means

Your ActivityPods instance now supports:

1. **Dual Protocol Support**: ActivityPub + atproto
2. **Automatic Cross-Protocol Sync**: Posts appear in both networks
3. **External Federation**: Content discoverable by external networks
4. **Real-time Streaming**: Firehose for instant updates
5. **Bluesky Integration**: Posts appear in Bluesky Social
6. **Repository Export**: CAR files for external sync

## 🚀 Next Steps

After successful testing:

1. **Configure production settings** (JWT secrets, domains, etc.)
2. **Set up external federation** with other atproto instances
3. **Monitor firehose activity** for external subscribers
4. **Test with real atproto clients** (Bluesky, etc.)
5. **Set up monitoring and alerting** for federation health

---

**🎉 Congratulations!** If all tests pass, you have a fully functional ActivityPods instance with complete atproto federation! 🌐✨ 