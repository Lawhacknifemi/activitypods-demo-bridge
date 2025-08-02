# ActivityPods Bridge Architecture

## 🏗️ System Overview

The ActivityPods Bridge creates a **unified federated platform** that supports both ActivityPub and atproto protocols simultaneously, with automatic cross-protocol synchronization.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ACTIVITYPODS BRIDGE ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ACTIVITYPUB   │    │     BRIDGE      │    │     ATPROTO     │
│    NETWORK      │◄──►│     SERVICE     │◄──►│    NETWORK      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  ActivityPub    │    │   Event Bus     │    │   Atproto       │
│   Services      │    │   (Moleculer)   │    │   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Triplestore   │    │   API Gateway   │    │   Triplestore   │
│   (Fuseki)      │    │   (moleculer-web)│   │   (Fuseki)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Core Components

### 1. **Protocol Services**

#### ActivityPub Services
```
┌─────────────────────────────────────────────────────────────┐
│                    ACTIVITYPUB LAYER                        │
├─────────────────────────────────────────────────────────────┤
│ • activitypub.outbox.posted (Event)                         │
│ • activitypub.outbox.post (Action)                          │
│ • activitypub.actor.get (Action)                            │
│ • activitypub.collection.add (Action)                       │
│ • JSON-LD Context & Processing                              │
└─────────────────────────────────────────────────────────────┘
```

#### Atproto Services
```
┌─────────────────────────────────────────────────────────────┐
│                     ATPROTO LAYER                           │
├─────────────────────────────────────────────────────────────┤
│ • atproto.record.created (Event)                            │
│ • atproto.createRecord (Action)                             │
│ • atproto.getRecord (Action)                                │
│ • atproto.updateRecord (Action)                             │
│ • atproto.deleteRecord (Action)                             │
│ • atproto.listRecords (Action)                              │
│ • MST (Merkle Search Tree) Storage                          │
│ • CID Generation & DAG-CBOR Encoding                        │
└─────────────────────────────────────────────────────────────┘
```

### 2. **Bridge Service**

```
┌─────────────────────────────────────────────────────────────┐
│                      BRIDGE SERVICE                         │
├─────────────────────────────────────────────────────────────┤
│ Event Listeners:                                             │
│ • activitypub.outbox.posted → handleActivityPubPost()       │
│ • atproto.record.created → handleAtprotoRecord()            │
│                                                             │
│ Actions:                                                     │
│ • registerMapping() - Actor URI ↔ DID mapping               │
│ • getDidForActor() - Lookup DID for ActivityPub actor       │
│ • getActorForDid() - Lookup ActivityPub actor for DID       │
│ • convertActivityPubToAtproto() - Format conversion         │
│ • convertAtprotoToActivityPub() - Format conversion         │
│                                                             │
│ Event Emitters:                                              │
│ • atproto.bridge.activitypub.to.atproto                     │
│ • atproto.bridge.atproto.to.activitypub                     │
└─────────────────────────────────────────────────────────────┘
```

### 3. **Storage Layer**

```
┌─────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                          │
├─────────────────────────────────────────────────────────────┤
│ ActivityPub Data:                                            │
│ • Triplestore (Fuseki) - RDF storage                        │
│ • JSON-LD format for ActivityPub objects                    │
│ • Graph-based relationships                                 │
│                                                             │
│ Atproto Data:                                                │
│ • Triplestore (Fuseki) - RDF metadata                       │
│ • MST (Merkle Search Tree) - Record storage                 │
│ • CID-based content addressing                              │
│ • DAG-CBOR encoding for records                             │
│                                                             │
│ Bridge Data:                                                 │
│ • In-memory mapping storage (Actor URI ↔ DID)               │
│ • Event logs for monitoring                                 │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Architecture

### ActivityPub → Atproto Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   User      │    │ ActivityPub │    │   Bridge    │    │   Atproto   │
│   Posts     │───►│   Service   │───►│   Service   │───►│   Service   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                    │  Emit Event │    │  Convert    │    │  Create     │
                    │outbox.posted│    │  Format     │    │  Record     │
                    └─────────────┘    └─────────────┘    └─────────────┘
```

**Step-by-step:**
1. **User creates ActivityPub post** via REST API
2. **ActivityPub service** processes and stores the post
3. **Event emitted**: `activitypub.outbox.posted`
4. **Bridge service** receives event and converts format
5. **Bridge service** calls `atproto.createRecord`
6. **Atproto service** creates record with CID and MST storage
7. **Event emitted**: `atproto.bridge.activitypub.to.atproto`

### Atproto → ActivityPub Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   User      │    │   Atproto   │    │   Bridge    │    │ ActivityPub │
│   Posts     │───►│   Service   │───►│   Service   │───►│   Service   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                    │  Emit Event │    │  Convert    │    │  Create     │
                    │record.created│   │  Format     │    │   Post      │
                    └─────────────┘    └─────────────┘    └─────────────┘
```

**Step-by-step:**
1. **User creates atproto post** via REST API
2. **Atproto service** processes and stores the record
3. **Event emitted**: `atproto.record.created`
4. **Bridge service** receives event and converts format
5. **Bridge service** calls `activitypub.outbox.post`
6. **ActivityPub service** creates post with JSON-LD
7. **Event emitted**: `atproto.bridge.atproto.to.activitypub`

## 🏛️ Service Architecture

### Moleculer Service Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    MOLECULER BROKER                         │
├─────────────────────────────────────────────────────────────┤
│ Services:                                                    │
│                                                             │
│ • api (API Gateway)                                         │
│   ├── /atproto/* (Atproto REST endpoints)                  │
│   ├── /api/atproto.bridge.* (Bridge REST endpoints)        │
│   └── /api/activitypub.* (ActivityPub REST endpoints)      │
│                                                             │
│ • atproto (Atproto Service)                                 │
│   ├── createRecord()                                        │
│   ├── getRecord()                                           │
│   ├── updateRecord()                                        │
│   ├── deleteRecord()                                        │
│   └── listRecords()                                         │
│                                                             │
│ • atproto.bridge (Bridge Service)                           │
│   ├── registerMapping()                                     │
│   ├── convertActivityPubToAtproto()                         │
│   ├── convertAtprotoToActivityPub()                         │
│   └── Event handlers                                        │
│                                                             │
│ • activitypub.* (ActivityPub Services)                      │
│   ├── outbox.post()                                         │
│   ├── actor.get()                                           │
│   └── collection.add()                                      │
│                                                             │
│ • triplestore (Storage Service)                             │
│   ├── insert()                                              │
│   ├── query()                                               │
│   └── dataset.create()                                      │
│                                                             │
│ • jsonld (JSON-LD Processing)                               │
│   └── parser.toRDF()                                        │
└─────────────────────────────────────────────────────────────┘
```

## 🔌 API Architecture

### REST API Endpoints

```
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY                            │
├─────────────────────────────────────────────────────────────┤
│ Atproto Endpoints:                                           │
│ • POST   /atproto/:did/:collection/:rkey                    │
│ • GET    /atproto/:did/:collection/:rkey                    │
│ • PUT    /atproto/:did/:collection/:rkey                    │
│ • DELETE /atproto/:did/:collection/:rkey                    │
│ • GET    /atproto/:did/:collection                          │
│                                                             │
│ Bridge Endpoints:                                            │
│ • POST   /api/atproto.bridge.registerMapping                │
│ • POST   /api/atproto.bridge.getDidForActor                 │
│ • POST   /api/atproto.bridge.getActorForDid                 │
│ • POST   /api/atproto.bridge.convertActivityPubToAtproto    │
│ • POST   /api/atproto.bridge.convertAtprotoToActivityPub    │
│                                                             │
│ ActivityPub Endpoints:                                       │
│ • POST   /api/activitypub.outbox.post                       │
│ • GET    /:actor/outbox                                      │
│ • GET    /:actor/inbox                                       │
│ • GET    /:actor/followers                                   │
│ • GET    /:actor/following                                   │
└─────────────────────────────────────────────────────────────┘
```

## 🗄️ Data Storage Architecture

### Triplestore Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      FUSEKI TRIPLESTORE                     │
├─────────────────────────────────────────────────────────────┤
│ Datasets:                                                    │
│                                                             │
│ • settings (System configuration)                           │
│ • did:plc:user1 (Atproto user data)                        │
│ • did:plc:user2 (Atproto user data)                        │
│ • user1 (ActivityPub user data)                             │
│ • user2 (ActivityPub user data)                             │
│                                                             │
│ Graph Structure:                                             │
│                                                             │
│ ActivityPub Graphs:                                          │
│ • <user>/outbox - User's outbox activities                  │
│ • <user>/inbox - User's inbox activities                    │
│ • <user>/followers - User's followers                       │
│ • <user>/following - User's following                       │
│                                                             │
│ Atproto Graphs:                                              │
│ • <did>/records - User's atproto records                    │
│ • <did>/commits - User's commit history                     │
│ • <did>/blocks - User's data blocks                         │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Event Architecture

### Event Flow Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ActivityPub   │    │   Event Bus     │    │     Atproto     │
│   Post Created  │───►│   (Moleculer)   │◄───│  Record Created │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ activitypub.    │    │ atproto.bridge. │    │ atproto.        │
│ outbox.posted   │───►│ activitypub.    │◄───│ record.created  │
└─────────────────┘    │ to.atproto      │    └─────────────────┘
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Bridge Service  │
                       │ Event Handlers  │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Format          │
                       │ Conversion      │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Cross-Protocol │
                       │ Post Creation   │
                       └─────────────────┘
```

## 🔐 Security Architecture

### Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYER                           │
├─────────────────────────────────────────────────────────────┤
│ Authentication:                                              │
│ • JWT tokens for API access                                 │
│ • OIDC integration for ActivityPub                          │
│ • DID-based authentication for atproto                      │
│                                                             │
│ Authorization:                                               │
│ • WebACL for ActivityPub resources                          │
│ • Actor-based permissions for atproto                       │
│ • Bridge mapping validation                                 │
│                                                             │
│ Data Protection:                                             │
│ • Encrypted storage for sensitive data                      │
│ • Secure event transmission                                 │
│ • Audit logging for bridge operations                       │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Monitoring Architecture

### Observability

```
┌─────────────────────────────────────────────────────────────┐
│                   MONITORING LAYER                          │
├─────────────────────────────────────────────────────────────┤
│ Metrics:                                                     │
│ • Bridge event counts                                        │
│ • Conversion success/failure rates                          │
│ • API response times                                         │
│ • Storage usage per protocol                                │
│                                                             │
│ Logging:                                                     │
│ • Bridge operation logs                                      │
│ • Event emission logs                                        │
│ • Error tracking and alerting                               │
│                                                             │
│ Health Checks:                                               │
│ • Service availability                                       │
│ • Bridge connectivity                                        │
│ • Storage health                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Deployment Architecture

### Container Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────┤
│ Services:                                                    │
│                                                             │
│ • activitypods-backend (Node.js)                            │
│   ├── Moleculer broker                                      │
│   ├── API Gateway                                           │
│   ├── Atproto services                                      │
│   ├── ActivityPub services                                  │
│   └── Bridge service                                        │
│                                                             │
│ • fuseki (Triplestore)                                      │
│   ├── RDF storage                                           │
│   ├── SPARQL endpoint                                       │
│   └── Dataset management                                    │
│                                                             │
│ • redis (Message broker)                                    │
│   ├── Event queuing                                         │
│   ├── Service discovery                                     │
│   └── Caching                                               │
│                                                             │
│ • mailcatcher (Email testing)                               │
│   └── Development email capture                             │
└─────────────────────────────────────────────────────────────┘
```

## 🔮 Future Architecture Extensions

### Scalability Considerations

1. **Horizontal Scaling**: Multiple ActivityPods instances
2. **Load Balancing**: Distribute bridge operations
3. **Database Scaling**: Separate storage for different protocols
4. **Event Streaming**: Use Kafka/RabbitMQ for high-volume events
5. **Microservices**: Split bridge into specialized services

### Federation Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ ActivityPods    │    │ ActivityPods    │    │ ActivityPods    │
│ Instance A      │◄──►│ Instance B      │◄──►│ Instance C      │
│ (ActivityPub)   │    │ (Bridge)        │    │ (Atproto)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ ActivityPub     │    │ Bridge Network  │    │ Atproto         │
│ Federation      │    │ (Cross-Instance)│    │ Federation      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

**🎯 Key Architectural Benefits:**

1. **Unified Platform**: Single codebase supporting both protocols
2. **Event-Driven**: Scalable, decoupled architecture
3. **Extensible**: Easy to add new protocols or features
4. **Fault-Tolerant**: Graceful handling of service failures
5. **Observable**: Comprehensive monitoring and logging
6. **Secure**: Multi-layer security and authorization
7. **Federated**: Supports cross-instance communication 