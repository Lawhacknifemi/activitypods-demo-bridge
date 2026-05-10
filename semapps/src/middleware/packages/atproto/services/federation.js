const WebSocket = require('ws');
const { createServer } = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Dynamic imports for ES modules
let CID;
let dagCbor;

/**
 * Atproto Federation Service
 * Implements firehose, appview integration, and external federation
 */
const FederationService = {
  name: 'atproto.federation',
  settings: {
    baseUri: null,
    // Firehose configuration
    firehosePort: 3001,
    firehoseQueues: new Set(),
    firehoseQueuesLock: null,
    // AppView configuration
    appviewServer: 'bsky.social', // Default Bluesky appview
    appviewAuthCache: new Map(),
    appviewAuthTTL: 60 * 60 * 1000, // 1 hour
    // JWT configuration
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    // Federation settings
    enableFederation: true,
    enableFirehose: true,
    enableAppview: true
  },

  async created() {
    this.settings.firehoseQueuesLock = new (require('async-lock'))();
    
    // Initialize dynamic imports
    try {
      const multiformats = await import('multiformats');
      CID = multiformats.CID;
      
      const dagCborModule = await import('@ipld/dag-cbor');
      dagCbor = dagCborModule;
      
      this.logger.info('Atproto Federation service created with dynamic imports');
    } catch (error) {
      this.logger.error('Failed to load dynamic imports:', error.message);
      throw error;
    }
  },

  async started() {
    this.logger.info('Starting Atproto Federation service...');
    
    if (this.settings.enableFirehose) {
      await this.startFirehoseServer();
    }
    
    if (this.settings.enableAppview) {
      await this.initializeAppviewAuth();
    }

    // Hook into the main HTTP server's upgrade event to handle subscribeRepos WebSocket
    // We wait for the api service to be ready, then attach to its server
    this.broker.waitForServices(['api']).then(() => {
      const apiService = this.broker.services.find(s => s.name === 'api');
      const httpServer = apiService?.server;

      if (!httpServer) {
        this.logger.warn('Could not find HTTP server on api service — subscribeRepos WebSocket unavailable');
        return;
      }

      const wss = new WebSocket.Server({ noServer: true });

      httpServer.on('upgrade', (req, socket, head) => {
        const url = req.url?.split('?')[0];
        if (url !== '/xrpc/com.atproto.sync.subscribeRepos') return;

        wss.handleUpgrade(req, socket, head, (ws) => {
          this.logger.info('Relay/client connected to firehose');
          this.settings.firehoseQueues.add(ws);
          ws.firehoseQueue = [];

          // Send #info frame on connect (atproto spec)
          const { dagCbor: dc } = require('../utils/atproto-utils');
          Promise.all([
            dc.encode({ t: '#info', op: 1 }),
            dc.encode({ name: 'OutdatedCursor' })
          ]).then(([h, b]) => {
            try { ws.send(Buffer.concat([h, b])); } catch (_) {}
          });

          ws.on('close', () => {
            this.logger.info('Relay/client disconnected from firehose');
            this.settings.firehoseQueues.delete(ws);
          });
          ws.on('error', (err) => {
            this.logger.warn('Firehose WebSocket error:', err.message);
            this.settings.firehoseQueues.delete(ws);
          });
        });
      });

      this.logger.info('Registered subscribeRepos WebSocket upgrade handler on main HTTP server');
    }).catch(e => {
      this.logger.warn('Could not attach WebSocket upgrade handler:', e.message);
    });
    
    this.logger.info('Atproto Federation service started');
  },

  actions: {
    /**
     * com.atproto.server.describeServer
     * Required by the relay to verify this is a valid PDS
     */
    async describeServer(ctx) {
      const baseUri = this.settings.baseUri || 'http://localhost:3000';
      const hostname = new URL(baseUri).hostname;

      // The PDS DID — for a local dev instance we use did:web
      const serverDid = `did:web:${hostname}`;

      return {
        did: serverDid,
        availableUserDomains: [hostname],
        inviteCodeRequired: false,
        links: {}
      };
    },

    /**
     * com.atproto.sync.requestCrawl
     * Called by relays to ask us to notify them of updates
     */
    async requestCrawl(ctx) {
      const { hostname } = ctx.params;
      this.logger.info(`Relay requested crawl from: ${hostname}`);
      // In a full implementation we'd subscribe to the relay's firehose
      // For now just acknowledge
      return {};
    },

    /**
     * Broadcast message to all firehose subscribers
     */
    async broadcastToFirehose(ctx) {
      const { message } = ctx.params;
      
      if (!this.settings.enableFirehose) {
        return { success: false, message: 'Firehose disabled' };
      }
      
      await this.firehoseBroadcast(message);
      return { success: true, message: 'Broadcasted to firehose' };
    },

    /**
     * Get repository status for federation
     */
    async getRepoStatus(ctx) {
      const { did } = ctx.params;
      
      // Try in-memory repo first
      const atprotoService = this.broker.services.find(s => s.name === 'atproto');
      const repo = atprotoService?.settings?.repositories?.get(did);

      if (repo) {
        const latestCommit = await repo.getLatestCommit();
        return {
          did,
          handle: did.replace('did:plc:', ''),
          service: this.settings.baseUri,
          status: 'active',
          type: 'repo',
          rev: latestCommit?.commit?.rev || null
        };
      }

      // Fall back to Fuseki — check if any blocks exist for this DID
      try {
        const result = await ctx.call('triplestore.query', {
          query: `
            PREFIX atproto: <https://atproto.com/ns#>
            SELECT ?cid WHERE {
              ?commit a atproto:Commit ;
                      atproto:hasCid ?cid ;
                      atproto:hasDid "${did}" .
            } LIMIT 1
          `,
          dataset: did,
          webId: 'system'
        });
        const bindings = Array.isArray(result) ? result : (result.results?.bindings || []);
        if (bindings.length > 0) {
          return {
            did,
            handle: did.replace('did:plc:', ''),
            service: this.settings.baseUri,
            status: 'active',
            type: 'repo'
          };
        }
      } catch (e) {
        // dataset doesn't exist
      }

      throw new Error('Repository not found');
    },

    /**
     * Get repository as CAR file for federation
     */
    async getRepoCar(ctx) {
      const { did, commit } = ctx.params;
      
      // Try in-memory repo first
      const atprotoService = this.broker.services.find(s => s.name === 'atproto');
      let repo = atprotoService?.settings?.repositories?.get(did);

      // If not in memory, reconstruct a lightweight repo shell that can query Fuseki
      if (!repo) {
        const { Repo } = require('../utils/repo');
        const storageCall = (action, params) => ctx.call(`triplestore.${action}`, params);
        // Check dataset exists first
        try {
          await ctx.call('triplestore.query', {
            query: 'ASK { ?s ?p ?o }',
            dataset: did,
            webId: 'system'
          });
        } catch (e) {
          throw new Error('Repository not found');
        }
        repo = new Repo(did, storageCall, null, null);
      }
      
      // Get CAR file data
      const carData = await repo.getCheckout(commit || null);
      
      // Set response headers for binary CAR file
      ctx.meta.$responseType = 'application/vnd.ipld.car';
      ctx.meta.$responseHeaders = {
        'Content-Type': 'application/vnd.ipld.car',
        'Content-Disposition': `attachment; filename="${did}.car"`
      };

      return Buffer.isBuffer(carData) ? carData : Buffer.from(carData);
    },

    /**
     * Create record with federation
     */
    async createRecordWithFederation(ctx) {
      const { collection, repo: repoDid, record } = ctx.params;
      
      // Create record locally
      const result = await ctx.call('atproto.createRecord', {
        collection,
        rkey: record.rkey,
        record: record.record,
        did: repoDid
      });
      
      // Broadcast to firehose
      if (this.settings.enableFirehose) {
        await this.firehoseBroadcast(result.firehoseMsg);
      }
      
      // Notify appview server
      if (this.settings.enableAppview) {
        await this.notifyAppviewServer(result.firehoseMsg);
      }
      
      return result;
    },

    /**
     * Subscribe to firehose — handles WebSocket upgrade via WebSocketMixin's request handler
     */
    async subscribeToFirehose(ctx) {
      const req = ctx.options?.parentCtx?.params?.req || ctx.params.req;

      // The WebSocketMixin sets req.webSocketRequestHandler when it's a WS upgrade
      if (req && req.webSocketRequestHandler) {
        this.logger.info('Relay/client connecting to atproto firehose via WebSocket upgrade');

        // Perform the WS handshake
        const ws = await req.webSocketRequestHandler();

        // Send #info frame on connect (atproto spec)
        try {
          const { dagCbor: dc } = require('../utils/atproto-utils');
          const [h, b] = await Promise.all([
            dc.encode({ t: '#info', op: 1 }),
            dc.encode({ name: 'OutdatedCursor' })
          ]);
          ws.send(Buffer.concat([h, b]));
        } catch (e) {
          this.logger.warn('Could not send #info frame:', e.message);
        }

        // Register with firehose queue
        this.settings.firehoseQueues.add(ws);
        ws.firehoseQueue = [];

        ws.on('close', () => {
          this.logger.info('Relay/client disconnected from atproto firehose');
          this.settings.firehoseQueues.delete(ws);
        });
        ws.on('error', err => {
          this.logger.warn('Firehose WebSocket error:', err.message);
          this.settings.firehoseQueues.delete(ws);
        });

        // Keep the connection open — return a never-resolving promise
        // The WebSocketMixin's delayConnectionClosing handles this
        return new Promise(() => {});
      }

      // Plain HTTP request — return info
      return {
        message: 'This endpoint requires a WebSocket connection',
        docs: 'https://atproto.com/specs/event-stream'
      };
    },

    /**
     * Unsubscribe from firehose
     */
    async unsubscribeFromFirehose(ctx) {
      const { websocket } = ctx.params;
      
      await this.settings.firehoseQueuesLock.acquire('firehose', () => {
        this.settings.firehoseQueues.delete(websocket);
      });
      
      this.logger.info('Client unsubscribed from firehose');
      
      return { success: true };
    }
  },

  methods: {
    /**
     * Start firehose WebSocket server
     */
    async startFirehoseServer() {
      const server = createServer();
      const wss = new WebSocket.Server({ server });
      
      wss.on('connection', (ws, req) => {
        this.logger.info('Firehose client connected');
        
        // Initialize firehose queue for this client
        ws.firehoseQueue = [];
        
        // Add to firehose queues
        this.settings.firehoseQueues.add(ws);
        
        // Send initial message
        ws.send(JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString()
        }));
        
        // Handle client disconnect
        ws.on('close', () => {
          this.settings.firehoseQueues.delete(ws);
          this.logger.info('Firehose client disconnected');
        });
        
        // Handle errors
        ws.on('error', (error) => {
          this.logger.error('Firehose WebSocket error:', error);
          this.settings.firehoseQueues.delete(ws);
        });
      });
      
      server.listen(this.settings.firehosePort, () => {
        this.logger.info(`Firehose server listening on port ${this.settings.firehosePort}`);
      });
    },

    /**
     * Broadcast message to all firehose subscribers
     */
    async firehoseBroadcast(message) {
      this.logger.info('Broadcasting firehose message to', this.settings.firehoseQueues.size, 'clients');
      
      await this.settings.firehoseQueuesLock.acquire('firehose', async () => {
        const messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(JSON.stringify(message));
        
        for (const ws of this.settings.firehoseQueues) {
          if (ws.readyState === WebSocket.OPEN && ws.firehoseQueue) {
            ws.firehoseQueue.push(messageBuffer);
            
            // Send the message
            try {
              ws.send(messageBuffer);
            } catch (error) {
              this.logger.error('Failed to send firehose message:', error);
            }
          }
        }
      });
    },

    /**
     * Initialize appview authentication
     */
    async initializeAppviewAuth() {
      // Generate a simple auth token for appview
      const payload = {
        iss: this.settings.baseUri,
        aud: `did:web:${this.settings.appviewServer}`,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24h
      };
      
      const token = jwt.sign(payload, this.settings.jwtSecret);
      
      this.settings.appviewAuthCache.set('auth', {
        token,
        timestamp: Date.now()
      });
      
      this.logger.info('AppView authentication initialized');
    },

    /**
     * Get appview auth headers
     */
    getAppviewAuth() {
      const cached = this.settings.appviewAuthCache.get('auth');
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < this.settings.appviewAuthTTL) {
        return {
          'Authorization': `Bearer ${cached.token}`,
          'Content-Type': 'application/json'
        };
      }
      
      // Refresh auth
      this.initializeAppviewAuth();
      const newCached = this.settings.appviewAuthCache.get('auth');
      
      return {
        'Authorization': `Bearer ${newCached.token}`,
        'Content-Type': 'application/json'
      };
    },

    /**
     * Notify appview server of updates
     */
    async notifyAppviewServer(message) {
      try {
        const response = await fetch(`https://${this.settings.appviewServer}/xrpc/com.atproto.sync.notifyOfUpdate`, {
          method: 'POST',
          headers: this.getAppviewAuth(),
          body: JSON.stringify(message)
        });
        
        if (!response.ok) {
          this.logger.warn('Failed to notify appview server:', response.status);
        } else {
          this.logger.info('Successfully notified appview server');
        }
      } catch (error) {
        this.logger.error('Error notifying appview server:', error);
      }
    },

    /**
     * Create firehose message for record operations
     */
    createFirehoseMessage(operation, record) {
      return {
        op: operation,
        path: record.uri,
        cid: record.cid,
        timestamp: new Date().toISOString()
      };
    }
  }
};

module.exports = FederationService; 