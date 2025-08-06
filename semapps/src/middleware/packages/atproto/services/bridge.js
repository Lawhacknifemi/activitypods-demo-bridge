const { cleanObject } = require('../utils/atproto-utils');

/**
 * Bridge service for cross-protocol synchronization between ActivityPub and atproto
 * This service listens to events from both protocols and automatically syncs content
 */
const BridgeService = {
  name: 'atproto.bridge',
  settings: {
    baseUri: null,
    // Mapping between ActivityPub actors and atproto DIDs
    actorToDidMapping: new Map(),
    // Enable/disable bridge functionality
    enabled: true
  },

  async started() {
    this.logger.info('Atproto Bridge service started');
  },

  events: {
    'activitypub.outbox.posted': {
      handler(payload) {
        return this.handleActivityPubPost(payload);
      }
    },
    'atproto.record.created': {
      handler(payload) {
        return this.handleAtprotoRecord(payload);
      }
    }
  },

  actions: {
    /**
     * Register a mapping between an ActivityPub actor and an atproto DID
     */
    async registerMapping(ctx) {
      const { actorUri, did } = ctx.params;
      
      if (!actorUri || !did) {
        throw new Error('Missing required parameters: actorUri, did');
      }
      
      this.settings.actorToDidMapping.set(actorUri, did);
      this.logger.info(`Registered mapping: ${actorUri} -> ${did}`);
      
      return { success: true, message: 'Mapping registered successfully' };
    },

    /**
     * Get the DID for an ActivityPub actor
     */
    async getDidForActor(ctx) {
      const { actorUri } = ctx.params;
      return this.settings.actorToDidMapping.get(actorUri);
    },

    /**
     * Get the ActivityPub actor for a DID
     */
    async getActorForDid(ctx) {
      const { did } = ctx.params;
      
      for (const [actorUri, mappedDid] of this.settings.actorToDidMapping.entries()) {
        if (mappedDid === did) {
          return actorUri;
        }
      }
      return null;
    },

    /**
     * Convert ActivityPub Note to atproto post format
     */
    async convertActivityPubToAtproto(ctx) {
      const { activity } = ctx.params;
      
      if (activity.type !== 'Create' || !activity.object || activity.object.type !== 'Note') {
        return null; // Not a post we can convert
      }
      
      const note = activity.object;
      const actorUri = activity.actor;
      
      // Get the DID for this actor
      const did = await this.broker.call('atproto.bridge.getDidForActor', { actorUri });
      if (!did) {
        this.logger.warn(`No DID mapping found for actor: ${actorUri}`);
        return null;
      }
      
      // Convert to atproto post format
      const atprotoPost = {
        text: note.content || '',
        createdAt: note.published || activity.published || new Date().toISOString(),
        // Add any additional fields that might be present
        ...(note.attachment && { attachment: note.attachment }),
        ...(note.tag && { tag: note.tag }),
        ...(note.inReplyTo && { reply: { root: note.inReplyTo } })
      };
      
      return {
        did,
        collection: 'app.bsky.feed.post',
        record: atprotoPost,
        rkey: this.generateRkeyFromActivity(activity)
      };
    },

    /**
     * Convert atproto post to ActivityPub Note format
     */
    async convertAtprotoToActivityPub(ctx) {
      const { record, did, collection } = ctx.params;
      
      if (collection !== 'app.bsky.feed.post') {
        return null; // Not a post we can convert
      }
      
      // Get the ActivityPub actor for this DID
      const actorUri = await this.broker.call('atproto.bridge.getActorForDid', { did });
      if (!actorUri) {
        this.logger.warn(`No ActivityPub actor mapping found for DID: ${did}`);
        return null;
      }
      
      // Convert to ActivityPub Note format
      const note = {
        '@context': await ctx.call('jsonld.context.get'),
        type: 'Note',
        content: record.text || '',
        published: record.createdAt || new Date().toISOString(),
        attributedTo: actorUri,
        // Add any additional fields
        ...(record.attachment && { attachment: record.attachment }),
        ...(record.tag && { tag: record.tag }),
        ...(record.reply && { inReplyTo: record.reply.root })
      };
      
      // Wrap in Create activity
      const activity = {
        '@context': await ctx.call('jsonld.context.get'),
        type: 'Create',
        actor: actorUri,
        object: note,
        published: record.createdAt || new Date().toISOString()
      };
      
      return activity;
    }
  },

  methods: {
    /**
     * Handle ActivityPub post events and create corresponding atproto records
     */
    async handleActivityPubPost(payload) {
      if (!this.settings.enabled) return;
      
      try {
        const { activity } = payload;
        this.logger.info('Bridge: Handling ActivityPub post:', activity.id);
        
        // Convert ActivityPub to atproto format
        const atprotoData = await this.broker.call('atproto.bridge.convertActivityPubToAtproto', {
          activity
        });
        
        if (!atprotoData) {
          this.logger.info('Bridge: Skipping ActivityPub post (not convertible)');
          return;
        }
        
        // Create atproto record
        const result = await this.broker.call('atproto.createRecord', atprotoData);
        this.logger.info('Bridge: Created atproto record from ActivityPub:', result.uri);
        
        // Emit event for successful bridge
        this.broker.emit('atproto.bridge.activitypub.to.atproto', {
          activityPubId: activity.id,
          atprotoUri: result.uri,
          direction: 'activitypub-to-atproto'
        });
        
      } catch (error) {
        this.logger.error('Bridge: Failed to handle ActivityPub post:', error);
      }
    },

    /**
     * Handle atproto record events and create corresponding ActivityPub posts
     */
    async handleAtprotoRecord(payload) {
      if (!this.settings.enabled) return;
      
      try {
        const { record, did, collection } = payload;
        this.logger.info('Bridge: Handling atproto record:', record.uri);
        
        // Convert atproto to ActivityPub format
        const activityPubData = await this.broker.call('atproto.bridge.convertAtprotoToActivityPub', {
          record: record.value,
          did,
          collection
        });
        
        if (!activityPubData) {
          this.logger.info('Bridge: Skipping atproto record (not convertible)');
          return;
        }
        
        // Get the actor's outbox
        const actorUri = await this.broker.call('atproto.bridge.getActorForDid', { did });
        if (!actorUri) {
          this.logger.warn('Bridge: No ActivityPub actor mapping found for DID:', did);
          return;
        }
        const outboxUri = `${actorUri}/outbox`;
        
        // Create ActivityPub post
        try {
          const result = await this.broker.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            ...activityPubData,
            transient: true // Don't persist the activity, just send it
          });
          
          this.logger.info('Bridge: Created ActivityPub post from atproto:', result.id);
          
          // Emit event for successful bridge
          this.broker.emit('atproto.bridge.atproto.to.activitypub', {
            atprotoUri: record.uri,
            activityPubId: result.id,
            direction: 'atproto-to-activitypub'
          });
        } catch (error) {
          this.logger.warn('Bridge: Failed to create ActivityPub post, but continuing:', error.message);
        }
        
      } catch (error) {
        this.logger.error('Bridge: Failed to handle atproto record:', error);
      }
    },

    /**
     * Generate a unique rkey from ActivityPub activity
     */
    generateRkeyFromActivity(activity) {
      // Use the activity ID or generate a timestamp-based key
      if (activity.id) {
        const url = new URL(activity.id);
        const pathParts = url.pathname.split('/');
        return pathParts[pathParts.length - 1] || `post-${Date.now()}`;
      }
      return `post-${Date.now()}`;
    }
  }
};

module.exports = BridgeService; 