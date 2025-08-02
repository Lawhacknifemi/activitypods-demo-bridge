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
    
    this.logger.info('Atproto Federation service started');
  },

  actions: {
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
      
      // Get the repository from our storage
      const repo = this.broker.services.find(s => s.name === 'atproto')?.settings.repositories.get(did);
      
      if (!repo) {
        throw new Error('Repository not found');
      }
      
      return {
        did,
        handle: did.replace('did:plc:', ''), // Simple handle mapping
        service: this.settings.baseUri,
        status: 'active',
        type: 'repo'
      };
    },

    /**
     * Get repository as CAR file for federation
     */
    async getRepoCar(ctx) {
      const { did, commit } = ctx.params;
      
      // Get the repository
      const repo = this.broker.services.find(s => s.name === 'atproto')?.settings.repositories.get(did);
      
      if (!repo) {
        throw new Error('Repository not found');
      }
      
      // Get CAR file data
      const carData = await repo.getCheckout(commit ? CID.decode(commit) : null);
      
      return {
        contentType: 'application/vnd.ipld.car',
        data: carData
      };
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
     * Subscribe to firehose
     */
    async subscribeToFirehose(ctx) {
      const { websocket } = ctx.params;
      
      if (!this.settings.enableFirehose) {
        throw new Error('Firehose disabled');
      }
      
      // Add to firehose queues
      await this.settings.firehoseQueuesLock.acquire('firehose', () => {
        this.settings.firehoseQueues.add(websocket);
        websocket.firehoseQueue = [];
      });
      
      this.logger.info('Client subscribed to firehose');
      
      return { success: true };
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