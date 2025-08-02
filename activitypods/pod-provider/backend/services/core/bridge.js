// Bridge service for cross-protocol synchronization
const { BridgeService } = require('@semapps/atproto');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [BridgeService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    enabled: true
  }
}; 