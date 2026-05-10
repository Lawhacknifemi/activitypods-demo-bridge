# ActivityPods × AT Protocol Bridge

> ⚠️ **This project is under heavy active development.** APIs, data formats, and behaviour will change without notice. Not production-ready.

A unified federated platform that runs [ActivityPub](https://www.w3.org/TR/activitypub/) and [AT Protocol](https://atproto.com/) simultaneously on a single personal data pod server, with automatic cross-protocol synchronization and a relay-compatible firehose.

Users own their data in a [Solid](https://solidproject.org/) pod. Their posts, contacts, and social graph are accessible to both the ActivityPub network (Mastodon, Pixelfed, etc.) and the AT Protocol network (Bluesky), without needing separate accounts.

---

## What's in this repo

```
activitypods-demo-bridge/
├── activitypods/          # Pod provider — backend + frontend + app framework
│   └── pod-provider/
│       └── backend/       # Main Node.js server (Moleculer microservices)
├── semapps/               # SemApps middleware — ActivityPub, LDP, WebACL, ATProto
│   └── src/middleware/
│       └── packages/
│           └── atproto/   # AT Protocol implementation (MST, CAR, firehose)
├── demo-pds-js/           # Reference ATProto PDS implementation (used for spec reference)
├── indigo/                # Bluesky's Go relay (patched to allow local IPs for testing)
└── test-*.js              # Integration test scripts
```

---

## How it works

### Single pod, two protocols

When a user registers, the server creates:
- A **WebID** document (Solid/ActivityPub identity)
- An **ActivityPub actor** with inbox, outbox, followers, following
- A **Solid pod** with per-resource access control (WebACL)
- **SAI registries** so third-party apps can request scoped data access

When a user creates an ATProto record, the server:
1. Encodes it as DAG-CBOR and generates a real content-addressed CID
2. Inserts it into a Merkle Search Tree (MST) in canonical `{e, l}` format
3. Creates a signed commit and stores all blocks in Apache Fuseki
4. Broadcasts a `#commit` event over the WebSocket firehose
5. Optionally mirrors it to ActivityPub via the bridge layer

### Bridge layer

The bridge maps ActivityPub actors to ATProto DIDs and converts between formats in both directions:

```
ActivityPub Note  ←→  app.bsky.feed.post
ActivityPub actor ←→  ATProto DID
```

### Relay compatibility

The server implements the full set of XRPC endpoints that an ATProto relay expects:

| Endpoint | Purpose |
|---|---|
| `GET /xrpc/com.atproto.server.describeServer` | PDS identity verification |
| `GET /xrpc/com.atproto.sync.getRepo` | Full repo as CAR v1 file |
| `GET /xrpc/com.atproto.sync.getRepoStatus` | Per-DID repo status |
| `GET /xrpc/com.atproto.sync.subscribeRepos` | WebSocket firehose (101 upgrade) |
| `POST /xrpc/com.atproto.sync.requestCrawl` | Relay registration |

Tested against the [indigo relay](https://github.com/bluesky-social/indigo) — events are received and cursor advances correctly.

---

## Quick start

### Prerequisites

- Node.js ≥ 22.12.0
- Yarn (v4 via Corepack)
- Docker (OrbStack or Docker Desktop)

### 1. Start infrastructure

```bash
cd activitypods/pod-provider
make start
```

Starts Fuseki (`:3030`), Redis (`:6379`), MailCatcher (`:1080`), Arena (`:4567`), TripleAdmin (`:3033`).

### 2. Install and run the backend

```bash
cd activitypods/pod-provider/backend
yarn install
yarn dev
```

Backend runs at **http://localhost:3000**.

### 3. Try it out

```bash
# Register a user
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123","email":"alice@test.com","name":"Alice"}'

# Check Alice's WebID / ActivityPub actor
curl -H "Accept: application/json" http://localhost:3000/alice

# Create an ATProto record
curl -X POST "http://localhost:3000/atproto/record/did:plc:alice1/app.bsky.feed.post/hello" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from ActivityPods!","createdAt":"2025-01-01T12:00:00.000Z"}'

# Fetch the repo as a CAR file
curl "http://localhost:3000/xrpc/com.atproto.sync.getRepo?did=did:plc:alice1" \
  -o alice.car

# Connect to the firehose
wscat -c "ws://localhost:3000/xrpc/com.atproto.sync.subscribeRepos"
```

---

## Testing with a local relay

```bash
# Build the patched relay (allows local IPs)
cd activitypods/indigo
go build -o /tmp/relay-local ./cmd/relay

# Start the relay
RELAY_ALLOW_PRIVATE_IPS=true /tmp/relay-local serve \
  --bind ":2470" \
  --db-url "sqlite://relay-data/relay/relay.sqlite" \
  --persist-dir "relay-data/persist" \
  --admin-password "localtest" \
  --allow-insecure-hosts \
  --lenient-sync-validation

# Register our PDS
curl -X POST http://localhost:2470/admin/pds/requestCrawl \
  -u "admin:localtest" \
  -H "Content-Type: application/json" \
  -d '{"hostname": "localhost:3000"}'

# Create a record and watch the relay pick it up
curl -X POST "http://localhost:3000/atproto/record/did:plc:test1/app.bsky.feed.post/post1" \
  -H "Content-Type: application/json" \
  -d '{"text":"Relay test","createdAt":"2025-01-01T12:00:00.000Z"}'

# Check relay received it
curl http://localhost:2470/admin/pds/list -u "admin:localtest"
# → "EventsSeenSinceStartup": 1, "Cursor": 1
```

---

## ATProto implementation status

| Feature | Status |
|---|---|
| Record create / read / list | ✅ |
| DAG-CBOR encoding with real CIDs | ✅ |
| Canonical MST (`{e, l}` CBOR format) | ✅ |
| CAR v1 file export | ✅ |
| Commit chain with `version: 3` structure | ✅ |
| Firehose WebSocket (`subscribeRepos`) | ✅ |
| Proper `#commit` CBOR framing | ✅ |
| Global monotonic sequence numbers | ✅ |
| Relay compatibility (indigo) | ✅ |
| Record update / delete | ⚠️ Partial |
| DID registration on plc.directory | ❌ Local DIDs only |
| HTTP Signature verification | ❌ Not yet |

---

## Tech stack

| Layer | Technology |
|---|---|
| Service framework | [Moleculer](https://moleculer.services/) |
| HTTP gateway | moleculer-web |
| RDF database | [Apache Fuseki](https://jena.apache.org/documentation/fuseki2/) |
| ActivityPub / Solid / WebACL | [SemApps](https://semapps.org/) |
| AT Protocol | `@semapps/atproto` (this repo) |
| DAG-CBOR / CIDs | [@ipld/dag-cbor](https://github.com/ipld/js-dag-cbor) + [multiformats](https://github.com/multiformats/js-multiformats) |
| OIDC provider | [node-oidc-provider](https://github.com/panva/node-oidc-provider) |
| Job queues | Bull + Redis |
| Relay (testing) | [indigo](https://github.com/bluesky-social/indigo) (Go) |

---

## Further reading

- [Backend README](activitypods/pod-provider/backend/README.md) — full API reference, config, and architecture details
- [ActivityPods docs](https://docs.activitypods.org)
- [AT Protocol spec](https://atproto.com/specs/atp)
- [Solid spec](https://solidproject.org/TR/protocol)
- [SemApps](https://semapps.org)
