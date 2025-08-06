// Federation service for atproto external federation
const { FederationService } = require('@semapps/atproto');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [FederationService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    firehosePort: 3001,
    appviewServer: 'bsky.social', // Bluesky's appview server
    enableFederation: true,
    enableFirehose: true,
    enableAppview: true,
    jwtSecret: process.env.JWT_SECRET || CONFIG.JWT_SECRET || 'activitypods-federation-secret'
  }
}; 