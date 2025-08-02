// Local integration of atproto service
const { AtprotoService } = require('@semapps/atproto');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [AtprotoService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    podProvider: true
  }
}; 