# ActivityPods Atproto Federation

## 🌐 Complete Atproto Federation Implementation

This implementation provides **full atproto federation** capabilities, including firehose streaming, appview integration, and external network publishing. Your ActivityPods posts will now be **automatically published to the atproto network** and discoverable by Bluesky and other atproto applications.

## 🚀 What This Enables

### ✅ **External Network Publishing**
- **Posts published to atproto network** via firehose
- **Discoverable by Bluesky Social** and other atproto apps
- **Real-time federation** with other atproto instances
- **CAR file exports** for repository synchronization

### ✅ **Firehose Streaming**
- **WebSocket-based real-time streaming** of all repository updates
- **External clients can subscribe** to your firehose
- **Instant propagation** of posts across the atproto network
- **Standard atproto firehose protocol** implementation

### ✅ **AppView Integration**
- **Integration with Bluesky's appview server** (bsky.social)
- **Automatic notifications** of repository updates
- **Content indexing** for discovery and search
- **Federation with other atproto instances**

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE ATPROTO FEDERATION ARCHITECTURE                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ACTIVITYPODS  │    │     FIREHOSE    │    │   EXTERNAL      │
│   INSTANCE      │───►│   WEBSOCKET     │───►│   ATPROTO       │
│                 │    │   SERVER        │    │   NETWORK       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Internal      │    │   Real-time     │    │   Bluesky       │
│   Storage       │    │   Broadcasting  │    │   Social        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CAR File      │    │   AppView       │    │   Other         │
│   Exports       │    │   Integration   │    │   Atproto       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔄 Data Flow

### When You Create a Post

1. **User creates post** in ActivityPods
2. **Atproto record created** with CID and MST storage
3. **Firehose message generated** with operation details
4. **Message broadcast** to all firehose subscribers
5. **AppView server notified** of the update
6. **External atproto instances** receive the update
7. **Post appears** in Bluesky and other atproto apps

### Firehose Message Format

```json
{
  "op": "create",
  "path": "at://did:plc:user123/app.bsky.feed.post/abc123",
  "cid": "bafyreiabqccgfdyajo3c4baa326r5l7smuwtwbr4lkhshebuk6bjdbga7m",
  "timestamp": "2025-08-01T12:00:00.000Z"
}
```

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
cd semapps/src/middleware/packages/atproto
npm install ws jsonwebtoken async-lock
```

### 2. Configure Federation

```javascript
// In services/core/federation.js
module.exports = {
  mixins: [FederationService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    firehosePort: 3001,
    appviewServer: 'bsky.social',
    enableFederation: true,
    enableFirehose: true,
    enableAppview: true,
    jwtSecret: process.env.JWT_SECRET
  }
};
```

### 3. Start ActivityPods

```bash
npm run dev
```

The federation service will automatically start the firehose WebSocket server on port 3001.

## 📡 API Endpoints

### Federation Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/xrpc/com.atproto.sync.getRepoStatus` | GET | Get repository status |
| `/xrpc/com.atproto.sync.getRepo` | GET | Get repository as CAR file |
| `/xrpc/com.atproto.sync.getCheckout` | GET | Get repository checkout |
| `/xrpc/com.atproto.repo.createRecord` | POST | Create record with federation |
| `/xrpc/com.atproto.sync.notifyOfUpdate` | POST | Notify of repository updates |
| `/xrpc/com.atproto.sync.subscribeRepos` | GET | Subscribe to firehose |

### Firehose WebSocket

- **URL**: `ws://localhost:3001`
- **Protocol**: Standard atproto firehose protocol
- **Messages**: JSON format with operation details

## 🧪 Testing Federation

### Run the Federation Test

```bash
node test-federation.js
```

This will test:
- ✅ Repository status
- ✅ Record creation with federation
- ✅ Firehose WebSocket connection
- ✅ CAR file exports
- ✅ Bridge integration with federation

### Manual Testing

```bash
# 1. Create a post (will trigger federation)
curl -X POST http://localhost:3000/atproto/did:plc:testuser123/app.bsky.feed.post/test-post \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello atproto network!", "createdAt": "2025-08-01T12:00:00.000Z"}'

# 2. Check repository status
curl http://localhost:3000/xrpc/com.atproto.sync.getRepoStatus?did=did:plc:testuser123

# 3. Get repository as CAR file
curl http://localhost:3000/xrpc/com.atproto.sync.getRepo?did=did:plc:testuser123 \
  --output repo.car
```

### WebSocket Testing

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to firehose');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
});
```

## 🌐 External Federation

### Connecting to Bluesky

Your ActivityPods instance will automatically:

1. **Notify Bluesky's appview server** of updates
2. **Broadcast posts** via firehose to the atproto network
3. **Make content discoverable** by Bluesky users
4. **Enable cross-instance federation** with other atproto servers

### Firehose Subscribers

External atproto instances can subscribe to your firehose:

```javascript
// Example: External atproto instance subscribing to your firehose
const ws = new WebSocket('ws://your-activitypods-instance:3001');

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.op === 'create' && message.path.includes('app.bsky.feed.post')) {
    // Process the new post
    console.log('New post from ActivityPods:', message);
  }
});
```

## 📊 Monitoring

### Firehose Metrics

Monitor firehose activity in the logs:

```
[INFO] Firehose server listening on port 3001
[INFO] Firehose client connected
[INFO] Broadcasting firehose message to 3 clients
[INFO] Successfully notified appview server
```

### Federation Events

Watch for these events:

- `Firehose client connected/disconnected`
- `Broadcasting firehose message to X clients`
- `Successfully notified appview server`
- `Failed to notify appview server`

## 🔧 Configuration Options

### Environment Variables

```bash
# JWT secret for federation authentication
JWT_SECRET=your-secret-key

# AppView server (default: bsky.social)
APPVIEW_SERVER=bsky.social

# Firehose port (default: 3001)
FIREHOSE_PORT=3001
```

### Federation Settings

```javascript
settings: {
  enableFederation: true,    // Enable federation
  enableFirehose: true,      // Enable firehose streaming
  enableAppview: true,       // Enable appview integration
  firehosePort: 3001,        // Firehose WebSocket port
  appviewServer: 'bsky.social', // AppView server URL
  jwtSecret: 'your-secret'   // JWT secret for auth
}
```

## 🚨 Troubleshooting

### Common Issues

1. **Firehose not starting**
   - Check if port 3001 is available
   - Verify WebSocket dependencies are installed

2. **AppView notifications failing**
   - Check network connectivity to bsky.social
   - Verify JWT secret is configured

3. **External clients can't connect**
   - Ensure firehose port is exposed
   - Check firewall settings

### Debug Mode

Enable debug logging:

```javascript
logger: {
  level: 'debug'
}
```

## 🔮 Future Enhancements

### Planned Features

1. **Multi-instance Federation**
   - Connect multiple ActivityPods instances
   - Cross-instance content sharing

2. **Advanced AppView Features**
   - Custom appview server support
   - Enhanced content indexing

3. **Federation Analytics**
   - Track federation metrics
   - Monitor network reach

4. **Enhanced Security**
   - Rate limiting for firehose
   - Authentication for federation

## 📚 Related Documentation

- [Atproto Specification](https://atproto.com/specs/atp)
- [Bluesky Federation Guide](https://docs.bsky.app/docs/advanced-guides/federation)
- [Firehose Protocol](https://atproto.com/specs/firehose)
- [CAR File Format](https://ipld.io/specs/transport/car/)

---

## 🎉 **You Now Have Complete Atproto Federation!**

Your ActivityPods instance now supports:

- ✅ **Full atproto federation** with external networks
- ✅ **Real-time firehose streaming** of all updates
- ✅ **Bluesky integration** via appview server
- ✅ **CAR file exports** for repository sync
- ✅ **Cross-protocol bridge** with ActivityPub
- ✅ **External discoverability** by atproto apps

**Your posts will automatically appear in the atproto network and be discoverable by Bluesky users!** 🌐✨ 