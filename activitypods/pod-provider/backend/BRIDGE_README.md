# ActivityPods Bridge: ActivityPub ↔ atproto Synchronization

## 🌉 Overview

The ActivityPods Bridge enables **automatic cross-protocol synchronization** between ActivityPub and atproto networks. When users post content to either protocol, it automatically appears on both networks, creating a seamless federated experience.

## 🚀 Features

- **Automatic Synchronization**: Posts created in ActivityPub automatically appear in atproto and vice versa
- **Real-time Bridge**: Uses Moleculer events for instant cross-protocol updates
- **Bidirectional**: Works in both directions (ActivityPub → atproto and atproto → ActivityPub)
- **Configurable Mappings**: Map ActivityPub actors to atproto DIDs
- **Protocol Conversion**: Automatically converts between ActivityPub Notes and atproto posts
- **Event-driven**: Uses Moleculer's event system for reliable message passing

## 📋 How It Works

### 1. Actor-to-DID Mapping
Users register a mapping between their ActivityPub actor URI and their atproto DID:

```javascript
// Register mapping
await broker.call('atproto.bridge.registerMapping', {
  actorUri: 'https://localhost:3000/users/testuser',
  did: 'did:plc:testuser123'
});
```

### 2. Automatic Event Handling
The bridge service listens to events from both protocols:

- **ActivityPub Events**: `activitypub.outbox.posted`
- **Atproto Events**: `atproto.record.created`

### 3. Cross-Protocol Conversion
When an event is received, the bridge:

1. **Converts** the content format between protocols
2. **Creates** the corresponding post in the other protocol
3. **Emits** success events for monitoring

## 🛠️ Setup

### 1. Enable Bridge Service
The bridge service is automatically loaded with ActivityPods. Ensure it's enabled in your configuration:

```javascript
// In services/core/bridge.js
module.exports = {
  mixins: [BridgeService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    enabled: true  // Set to false to disable bridge
  }
};
```

### 2. Register Actor Mappings
Before using the bridge, register mappings between ActivityPub actors and atproto DIDs:

```bash
# Via REST API
curl -X POST http://localhost:3000/api/atproto.bridge.registerMapping \
  -H "Content-Type: application/json" \
  -d '{
    "actorUri": "https://localhost:3000/users/testuser",
    "did": "did:plc:testuser123"
  }'
```

### 3. Test the Bridge
Use the provided demo scripts to test the functionality:

```bash
# Run the bridge demo
node demo-bridge.js

# Or use the shell script
./test-bridge-integration.sh
```

## 📡 API Endpoints

### Bridge Management
- `POST /api/atproto.bridge.registerMapping` - Register actor-to-DID mapping
- `POST /api/atproto.bridge.getDidForActor` - Get DID for ActivityPub actor
- `POST /api/atproto.bridge.getActorForDid` - Get ActivityPub actor for DID

### Conversion Functions
- `POST /api/atproto.bridge.convertActivityPubToAtproto` - Convert ActivityPub to atproto format
- `POST /api/atproto.bridge.convertAtprotoToActivityPub` - Convert atproto to ActivityPub format

## 🔄 Event Flow

### ActivityPub → atproto
1. User creates ActivityPub post
2. `activitypub.outbox.posted` event emitted
3. Bridge service receives event
4. Converts ActivityPub Note to atproto post format
5. Creates atproto record via `atproto.createRecord`
6. `atproto.bridge.activitypub.to.atproto` event emitted

### atproto → ActivityPub
1. User creates atproto post
2. `atproto.record.created` event emitted
3. Bridge service receives event
4. Converts atproto post to ActivityPub Note format
5. Creates ActivityPub post via `activitypub.outbox.post`
6. `atproto.bridge.atproto.to.activitypub` event emitted

## 📊 Monitoring

### Bridge Events
Monitor these events to track bridge activity:

```javascript
// Listen to bridge events
broker.on('atproto.bridge.activitypub.to.atproto', (payload) => {
  console.log('ActivityPub → atproto:', payload);
});

broker.on('atproto.bridge.atproto.to.activitypub', (payload) => {
  console.log('atproto → ActivityPub:', payload);
});
```

### Log Messages
Look for these log messages in ActivityPods:

```
[INFO] Bridge: Handling ActivityPub post: [activity-id]
[INFO] Bridge: Created atproto record from ActivityPub: [atproto-uri]
[INFO] Bridge: Handling atproto record: [atproto-uri]
[INFO] Bridge: Created ActivityPub post from atproto: [activity-id]
```

## 🔧 Configuration

### Bridge Settings
```javascript
settings: {
  baseUri: 'https://localhost:3000',
  enabled: true,  // Enable/disable bridge
  actorToDidMapping: new Map()  // In-memory mapping storage
}
```

### Advanced Configuration
For production use, consider:

1. **Persistent Storage**: Store mappings in database instead of memory
2. **Rate Limiting**: Add rate limiting to prevent spam
3. **Error Handling**: Implement retry logic for failed conversions
4. **Monitoring**: Add metrics and alerting for bridge failures

## 🧪 Testing

### Manual Testing
```bash
# 1. Register mapping
curl -X POST http://localhost:3000/api/atproto.bridge.registerMapping \
  -H "Content-Type: application/json" \
  -d '{"actorUri": "https://localhost:3000/users/testuser", "did": "did:plc:testuser123"}'

# 2. Create atproto post (should bridge to ActivityPub)
curl -X POST http://localhost:3000/atproto/did:plc:testuser123/app.bsky.feed.post/test-post \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from atproto!", "createdAt": "2025-08-01T12:00:00.000Z"}'

# 3. Create ActivityPub post (should bridge to atproto)
curl -X POST http://localhost:3000/api/activitypub.outbox.post \
  -H "Content-Type: application/json" \
  -d '{
    "collectionUri": "https://localhost:3000/users/testuser/outbox",
    "type": "Create",
    "actor": "https://localhost:3000/users/testuser",
    "object": {
      "type": "Note",
      "content": "Hello from ActivityPub!",
      "published": "2025-08-01T12:00:00.000Z"
    }
  }'
```

### Automated Testing
```bash
# Run the comprehensive test suite
node test-bridge.js

# Run the integration test
./test-bridge-integration.sh
```

## 🚨 Troubleshooting

### Common Issues

1. **Bridge not working**: Check if bridge service is enabled and mappings are registered
2. **Events not firing**: Verify ActivityPods is running and services are loaded
3. **Conversion failures**: Check log messages for specific error details
4. **Missing mappings**: Ensure actor-to-DID mappings are properly registered

### Debug Mode
Enable debug logging to see detailed bridge activity:

```javascript
// In your Moleculer configuration
logger: {
  level: 'debug'
}
```

## 🔮 Future Enhancements

- **Persistent Mappings**: Store mappings in triplestore/database
- **Advanced Conversion**: Support more content types (images, videos, etc.)
- **Bidirectional Replies**: Handle reply chains across protocols
- **Federation**: Bridge between different ActivityPods instances
- **Webhooks**: External notifications for bridge events
- **Analytics**: Track bridge usage and performance metrics

## 📚 Related Documentation

- [ActivityPods Documentation](https://activitypods.org)
- [ActivityPub Specification](https://www.w3.org/TR/activitypub/)
- [atproto Specification](https://atproto.com/specs/atp)
- [Moleculer Framework](https://moleculer.services)

---

**🎉 Congratulations!** Your ActivityPods instance now supports seamless cross-protocol synchronization between ActivityPub and atproto networks. 