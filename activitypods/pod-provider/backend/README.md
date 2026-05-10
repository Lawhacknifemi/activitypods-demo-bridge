# ActivityPods Backend

A personal data pod provider that speaks [ActivityPub](https://www.w3.org/TR/activitypub/), [Solid](https://solidproject.org/), and [AT Protocol](https://atproto.com/) simultaneously. Each user gets their own pod — a self-contained data store with full ownership and access control — that federates with both the ActivityPub network (Mastodon, etc.) and the AT Protocol network (Bluesky).

Built on [Moleculer](https://moleculer.services/) microservices, [Apache Fuseki](https://jena.apache.org/documentation/fuseki2/) (RDF triplestore), and the [SemApps](https://semapps.org/) middleware stack.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   HTTP API (:3000)                   │
│              moleculer-web API Gateway               │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
    ┌──────▼──────┐            ┌──────▼──────┐
    │ ActivityPub │            │  AT Protocol │
    │  (Solid +   │            │  (ATProto +  │
    │   WebACL)   │            │   Firehose)  │
    └──────┬──────┘            └──────┬──────┘
           │                          │
           └──────────┬───────────────┘
                      │
              ┌───────▼───────┐
              │  Bridge Layer  │
              │ (bidirectional │
              │  conversion)   │
              └───────┬───────┘
                      │
         ┌────────────▼────────────┐
         │   Apache Fuseki (RDF)   │
         │   Redis (queues/cache)  │
         └─────────────────────────┘
```

### Key services

| Layer | Services |
|---|---|
| **Core** | `triplestore`, `ldp`, `webid`, `webacl`, `activitypub`, `auth`, `signature`, `jsonld` |
| **Solid** | `solid-oidc`, `solid-storage`, `type-indexes`, `notifications-provider` |
| **SAI** | `auth-agent`, `app-registrations`, `data-registrations`, `access-grants` |
| **AT Protocol** | `atproto`, `atproto.federation`, `atproto.bridge`, `atproto.identity` |
| **Social** | `contacts.request`, `contacts.manager`, `profiles.profile`, `announcer` |
| **Infra** | `management`, `mail-notifications`, `groups`, `nodeinfo` |

---

## Prerequisites

- **Node.js** ≥ 22.12.0
- **Yarn** (v4, via Corepack)
- **Docker** (OrbStack or Docker Desktop)
- **Go** ≥ 1.21 (only needed to run a local relay for ATProto testing)

---

## Local development

### 1. Start infrastructure

```bash
cd pod-provider
make start
```

This starts:

| Service | URL | Purpose |
|---|---|---|
| Fuseki (RDF DB) | http://localhost:3030 | Triplestore — user: `admin`, pass: `admin` |
| Redis | localhost:6379 | Job queues and caching |
| MailCatcher | http://localhost:1080 | Catches all outgoing emails |
| Arena | http://localhost:4567 | Redis job queue inspector |
| TripleAdmin | http://localhost:3033 | SPARQL query UI |

### 2. Install dependencies

```bash
cd pod-provider/backend
yarn install
```

> The backend links `@semapps/atproto` from the local `semapps/` sibling repo via `file:` protocol. If you don't have that repo, see [Linking local packages](#linking-local-packages).

### 3. Start the backend

```bash
yarn dev
```

The API is available at **http://localhost:3000**.

### 4. Start the frontend (optional)

```bash
cd pod-provider/frontend
yarn install
yarn start   # http://localhost:5001
```

> Make sure `SEMAPPS_FRONTEND_URL` in `backend/.env` matches the frontend port.

---

## Configuration

All config is read from `backend/.env` (and `.env.local`, `.env.test` etc. via [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow)).

Key variables:

```bash
# Server
SEMAPPS_HOME_URL=http://localhost:3000/
SEMAPPS_PORT=3000
SEMAPPS_FRONTEND_URL=http://localhost:5001/

# Fuseki
SEMAPPS_SPARQL_ENDPOINT=http://localhost:3030/
SEMAPPS_JENA_USER=admin
SEMAPPS_JENA_PASSWORD=admin

# Redis
SEMAPPS_QUEUE_SERVICE_URL=redis://localhost:6379/1
SEMAPPS_REDIS_OIDC_PROVIDER_URL=redis://localhost:6379/2

# OIDC
SEMAPPS_COOKIE_SECRET=COOKIE-SECRET

# Email (MailCatcher for local dev)
SEMAPPS_SMTP_HOST=localhost
SEMAPPS_SMTP_PORT=1025
```

---

## API overview

### ActivityPub

```bash
# Register a user
POST /auth/signup
{ "username": "alice", "password": "...", "email": "alice@example.com", "name": "Alice" }

# WebFinger lookup
GET /.well-known/webfinger?resource=acct:alice@localhost:3000

# Actor document (WebID)
GET /alice

# ActivityPub collections
GET /alice/outbox
GET /alice/inbox
GET /alice/followers
GET /alice/following
```

### AT Protocol

```bash
# Create a record
POST /atproto/record/:did/:collection/:rkey
{ "text": "Hello!", "createdAt": "2025-01-01T12:00:00.000Z" }

# Read a record
GET /atproto/record/:did/:collection/:rkey

# List records in a collection
GET /atproto/record/:did/:collection

# Update / delete
PUT  /atproto/record/:did/:collection/:rkey
DELETE /atproto/record/:did/:collection/:rkey
```

### AT Protocol federation (XRPC)

```bash
# PDS identity — required by relays
GET /xrpc/com.atproto.server.describeServer

# Repo status
GET /xrpc/com.atproto.sync.getRepoStatus?did=did:plc:xxx

# Full repo as CAR file
GET /xrpc/com.atproto.sync.getRepo?did=did:plc:xxx

# Firehose (WebSocket)
GET /xrpc/com.atproto.sync.subscribeRepos   # → 101 Switching Protocols

# Request crawl from a relay
POST /xrpc/com.atproto.sync.requestCrawl
{ "hostname": "relay.example.com" }
```

### Bridge (ActivityPub ↔ ATProto)

```bash
# Register a mapping between an ActivityPub actor and an ATProto DID
POST /bridge/registerMapping
{ "actorUri": "http://localhost:3000/alice", "did": "did:plc:xxx" }

# Lookup
POST /bridge/getDidForActor    { "actorUri": "..." }
POST /bridge/getActorForDid    { "did": "..." }

# Format conversion
POST /bridge/convertActivityPubToAtproto  { "activity": { ... } }
POST /bridge/convertAtprotoToActivityPub  { "record": { ... }, "did": "...", "collection": "..." }
```

---

## AT Protocol implementation

### What's implemented

| Feature | Status |
|---|---|
| Record CRUD (create, read, list) | ✅ |
| DAG-CBOR encoding with real CIDs | ✅ |
| Merkle Search Tree (MST) — canonical `{e, l}` format | ✅ |
| Repository commits with version 3 structure | ✅ |
| CAR v1 file export (`getRepo`) | ✅ |
| Firehose WebSocket (`subscribeRepos`) | ✅ |
| `#commit` events with proper CBOR framing | ✅ |
| Global monotonic sequence numbers | ✅ |
| `describeServer` / `requestCrawl` | ✅ |
| Relay compatibility (tested with indigo relay) | ✅ |
| Record update / delete | ⚠️ Partial (parameter validation bug) |
| DID registration on plc.directory | ❌ Local DIDs only |
| HTTP Signature verification for ATProto | ❌ Not yet |

### CAR file structure

Each `getRepo` response is a valid CAR v1 file containing:

1. **Commit block** — `{version: 3, did, rev, data: <MST root CID>, prev}`
2. **MST node block** — `{e: [{p, k, v, t}], l: null}` with prefix-compressed keys
3. **Record block** — the raw DAG-CBOR encoded record data

### Firehose format

Each event emitted on `subscribeRepos` is two concatenated CBOR values:

```
[header: {op: 1, t: "#commit"}][body: {ops, seq, rev, repo, time, blobs, blocks, commit, ...}]
```

---

## Testing with a local relay

The [indigo relay](https://github.com/bluesky-social/indigo) can be used to verify firehose compatibility. A patched build (allowing private IPs) is included in `indigo/`.

```bash
# Build the patched relay
cd indigo
go build -o /tmp/relay-local ./cmd/relay

# Start the relay
RELAY_ALLOW_PRIVATE_IPS=true /tmp/relay-local serve \
  --bind ":2470" \
  --db-url "sqlite://relay-data/relay/relay.sqlite" \
  --persist-dir "relay-data/persist" \
  --admin-password "localtest" \
  --allow-insecure-hosts \
  --lenient-sync-validation

# Register our PDS with the relay
curl -X POST http://localhost:2470/admin/pds/requestCrawl \
  -u "admin:localtest" \
  -H "Content-Type: application/json" \
  -d '{"hostname": "localhost:3000"}'

# Check relay stats
curl http://localhost:2470/admin/pds/list -u "admin:localtest"
```

After creating a record via `POST /atproto/record/...`, `EventsSeenSinceStartup` should increment in the relay stats.

> The relay will log `DID not found: PLC directory 404` for local DIDs — this is expected. The firehose protocol itself is working correctly; the relay just can't verify identity against the public PLC directory.

---

## Linking local packages

The backend depends on `@semapps/atproto` which is not published to npm. It's linked from the local `semapps/` repo via Yarn's `file:` protocol.

If you have the semapps repo at `../../semapps/src/middleware/packages/atproto` relative to the backend:

```bash
# Already configured in package.json — just install
yarn install
```

If your semapps repo is at a different path, update `package.json`:

```json
"@semapps/atproto": "file:/absolute/path/to/semapps/src/middleware/packages/atproto"
```

After changing any file in the `@semapps/atproto` package, run `yarn install` again to copy the changes into `node_modules`.

---

## Maintenance

### Compact Fuseki datasets

Fuseki datasets grow over time. Compact them periodically:

```bash
cd pod-provider
make compact-datasets
```

This stops Fuseki, runs compaction, and restarts it.

### Export a user's pod

```bash
curl -X POST http://localhost:3000/<username>/.account/<username>/export \
  -H "Authorization: Bearer <token>" \
  --output export.zip
```

### Delete a user's pod

```bash
curl -X DELETE http://localhost:3000/<username>/.account/<username> \
  -H "Authorization: Bearer <token>"
```

---

## Project structure

```
pod-provider/backend/
├── config/              # Config loading, OIDC, transport, error handler
├── jwt/                 # JWT signing keys
├── middlewares/
│   └── app-control.js   # Enforces SAI app permissions on every action
├── mixins/
│   └── websocket.js     # WebSocket route support for moleculer-web
├── services/
│   ├── api.js           # HTTP gateway — all routes defined here
│   ├── core/            # Triplestore, LDP, WebACL, ActivityPub, ATProto, auth
│   ├── solid/           # Solid OIDC, storage, type indexes, notifications
│   ├── sai/             # Solid Application Interoperability (permissions)
│   ├── contacts/        # Contact request/accept/reject flow
│   ├── profiles/        # vCard profiles
│   ├── sharing/         # Announce (repost) and sharing rights
│   ├── migration/       # Version migration scripts
│   └── utils/           # Backup, repair
├── static/              # favicon
├── templates/           # Handlebars email templates
├── moleculer.config.js  # Broker config — middlewares, logger, transporter
├── package.json
└── .env                 # Local config (not committed)
```

---

## Tech stack

| Component | Technology |
|---|---|
| Service framework | [Moleculer](https://moleculer.services/) v0.14 |
| HTTP gateway | [moleculer-web](https://github.com/moleculerjs/moleculer-web) |
| RDF database | [Apache Fuseki](https://jena.apache.org/documentation/fuseki2/) (via SemApps) |
| Job queues | [Bull](https://github.com/OptimalBits/bull) + Redis |
| OIDC provider | [node-oidc-provider](https://github.com/panva/node-oidc-provider) |
| ActivityPub | [@semapps/activitypub](https://semapps.org) |
| Linked Data Platform | [@semapps/ldp](https://semapps.org) |
| Web Access Control | [@semapps/webacl](https://semapps.org) |
| AT Protocol | `@semapps/atproto` (local package) |
| DAG-CBOR | [@ipld/dag-cbor](https://github.com/ipld/js-dag-cbor) |
| CID generation | [multiformats](https://github.com/multiformats/js-multiformats) |
| Email | [moleculer-mail](https://github.com/moleculerjs/moleculer-addons) + Handlebars |

---

## Related

- [ActivityPods website](https://activitypods.org)
- [Documentation](https://docs.activitypods.org)
- [SemApps](https://semapps.org) — the middleware stack powering this
- [AT Protocol spec](https://atproto.com/specs/atp)
- [ActivityPub spec](https://www.w3.org/TR/activitypub/)
- [Solid spec](https://solidproject.org/TR/protocol)
