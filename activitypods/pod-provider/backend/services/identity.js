const crypto = require('crypto');
const base64url = require('base64url');

module.exports = {
  name: 'atproto.identity',
  
  settings: {
    plcServer: 'https://plc.directory',
    pdsServer: 'localhost:3000', // Default PDS server
    baseUrl: 'http://localhost:3000'
  },

  async started() {
    this.logger.info('Atproto Identity service started!');
  },

  actions: {
    /**
     * Create a new DID with the provided information
     */
    async createDid(ctx) {
      const { handle, pdsServer, displayName, description } = ctx.params;
      
      if (!handle) {
        throw new Error('Handle is required');
      }
      
      if (!pdsServer) {
        throw new Error('PDS server is required');
      }

      this.logger.info('Creating DID for handle:', handle);

      try {
        // Create the identities dataset if it doesn't exist
        try {
          await ctx.call('triplestore.dataset.create', { dataset: 'identities' });
          this.logger.info('Created identities dataset');
        } catch (error) {
          this.logger.info('Identities dataset already exists or creation failed:', error.message);
        }

        // Generate a simple DID using handle and timestamp
        const timestamp = Date.now();
        const didData = `${handle}:${pdsServer}:${timestamp}`;
        const didHash = crypto.createHash('sha256').update(didData).digest();
        
        // Create a simple DID format
        const didHex = didHash.toString('hex');
        const plcDid = 'did:plc:' + didHex.slice(0, 24);

        this.logger.info('Generated DID:', plcDid);

        // Store the DID information
        const keyData = {
          did: plcDid,
          handle: handle,
          pdsServer: pdsServer,
          displayName: displayName || '',
          description: description || '',
          createdAt: new Date().toISOString()
        };

        // Store in triplestore for persistence
        this.logger.info('Storing DID in triplestore:', plcDid);
        
        const insertResult = await ctx.call('triplestore.insert', {
          resource: `
            <${plcDid}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://atproto.com/ns#Identity> .
            <${plcDid}> <https://atproto.com/ns#hasHandle> "${handle}" .
            <${plcDid}> <https://atproto.com/ns#hasPdsServer> "${pdsServer}" .
            <${plcDid}> <https://atproto.com/ns#hasDisplayName> "${displayName || ''}" .
            <${plcDid}> <https://atproto.com/ns#hasDescription> "${description || ''}" .
            <${plcDid}> <https://atproto.com/ns#hasPrivateKey> "${base64url.encode(JSON.stringify(keyData))}" .
            <${plcDid}> <https://www.w3.org/ns/activitystreams#published> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
          `,
          contentType: 'application/n-triples',
          dataset: 'identities',
          webId: 'system'
        });
        
        this.logger.info('Triplestore insert result:', insertResult);

        return {
          did: plcDid,
          handle: handle,
          pdsServer: pdsServer,
          displayName: displayName,
          description: description,
          success: true,
          message: 'DID created successfully (simplified version)'
        };

      } catch (error) {
        this.logger.error('DID creation failed:', error);
        throw new Error(`DID creation failed: ${error.message}`);
      }
    },

    /**
     * List all created DIDs
     */
    async listDids(ctx) {
      try {
        // Create the identities dataset if it doesn't exist
        try {
          await ctx.call('triplestore.dataset.create', { dataset: 'identities' });
          this.logger.info('Created identities dataset');
        } catch (error) {
          this.logger.info('Identities dataset already exists or creation failed:', error.message);
        }

        const result = await ctx.call('triplestore.query', {
          query: `
            SELECT ?did ?handle ?pdsServer ?displayName ?description ?createdAt
            WHERE {
              ?did <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://atproto.com/ns#Identity> .
              ?did <https://atproto.com/ns#hasHandle> ?handle .
              ?did <https://atproto.com/ns#hasPdsServer> ?pdsServer .
              OPTIONAL { ?did <https://atproto.com/ns#hasDisplayName> ?displayName }
              OPTIONAL { ?did <https://atproto.com/ns#hasDescription> ?description }
              ?did <https://www.w3.org/ns/activitystreams#published> ?createdAt .
            }
            ORDER BY DESC(?createdAt)
          `,
          dataset: 'identities',
          webId: 'system'
        });

        // Handle different result formats
        const bindings = result.results?.bindings || result.bindings || result || [];
        
        this.logger.info('Query result:', JSON.stringify(result, null, 2));
        this.logger.info('Bindings:', bindings);
        
        return {
          dids: bindings.map(binding => ({
            did: binding.did?.value || binding.did,
            handle: binding.handle?.value || binding.handle,
            pdsServer: binding.pdsServer?.value || binding.pdsServer,
            displayName: binding.displayName?.value || binding.displayName || '',
            description: binding.description?.value || binding.description || '',
            createdAt: binding.createdAt?.value || binding.createdAt
          })),
          success: true
        };

      } catch (error) {
        this.logger.error('Failed to list DIDs:', error);
        throw new Error(`Failed to list DIDs: ${error.message}`);
      }
    },

    /**
     * Get DID details
     */
    async getDid(ctx) {
      const { did } = ctx.params;
      
      if (!did) {
        throw new Error('DID is required');
      }

      try {
        const result = await ctx.call('triplestore.query', {
          query: `
            SELECT ?handle ?pdsServer ?displayName ?description ?createdAt
            WHERE {
              <${did}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://atproto.com/ns#Identity> .
              <${did}> <https://atproto.com/ns#hasHandle> ?handle .
              <${did}> <https://atproto.com/ns#hasPdsServer> ?pdsServer .
              OPTIONAL { <${did}> <https://atproto.com/ns#hasDisplayName> ?displayName }
              OPTIONAL { <${did}> <https://atproto.com/ns#hasDescription> ?description }
              <${did}> <https://www.w3.org/ns/activitystreams#published> ?createdAt .
            }
          `,
          dataset: 'identities',
          webId: 'system'
        });

        // Handle different result formats
        const bindings = result.results?.bindings || result.bindings || result || [];
        
        this.logger.info('Get DID query result:', JSON.stringify(result, null, 2));
        this.logger.info('Get DID bindings:', bindings);
        
        if (bindings.length === 0) {
          throw new Error('DID not found');
        }

        const binding = bindings[0];
        return {
          did: did,
          handle: binding.handle?.value || binding.handle,
          pdsServer: binding.pdsServer?.value || binding.pdsServer,
          displayName: binding.displayName?.value || binding.displayName || '',
          description: binding.description?.value || binding.description || '',
          createdAt: binding.createdAt?.value || binding.createdAt,
          success: true
        };

      } catch (error) {
        this.logger.error('Failed to get DID:', error);
        throw new Error(`Failed to get DID: ${error.message}`);
      }
    }
  }
}; 