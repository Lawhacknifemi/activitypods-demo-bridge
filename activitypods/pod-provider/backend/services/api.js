const fs = require('fs');
const path = require('path');
const ApiGatewayService = require('moleculer-web');
const { Errors: E } = require('moleculer-web');
const WebSocketMixin = require('../mixins/websocket');
const CONFIG = require('../config/config');

module.exports = {
  mixins: [ApiGatewayService, WebSocketMixin],
  settings: {
    httpServerTimeout: 300000,
    baseUrl: CONFIG.BASE_URL,
    port: CONFIG.PORT,
    cors: {
      origin: '*',
      methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
      exposedHeaders: '*'
    },
    bodyParsers: {
      json: {
        limit: '1mb'
      }
    },
    routes: [
      {
        name: 'favicon',
        path: '/favicon.ico',
        aliases: {
          'GET /': 'api.favicon'
        }
      },
      {
        name: 'redirectToFront',
        path: '/',
        aliases: {
          'GET /': 'api.redirectToFront'
        }
      },
      {
        name: 'atproto',
        path: '/atproto',
        bodyParsers: {
          json: {
            limit: '1mb'
          }
        },
        aliases: {
          // Create record
          'POST /:did/:collection/:rkey': 'atproto.createRecord',
          // Get record
          'GET /:did/:collection/:rkey': 'atproto.getRecord',
          // Update record
          'PUT /:did/:collection/:rkey': 'atproto.updateRecord',
          // Delete record
          'DELETE /:did/:collection/:rkey': 'atproto.deleteRecord',
          // List records
          'GET /:did/:collection': 'atproto.listRecords'
        },
        opts: {
          // Parse URL parameters
          parseParams: true
        }
      },
      {
        name: 'bridge',
        path: '/bridge',
        bodyParsers: {
          json: {
            limit: '1mb'
          }
        },
        aliases: {
          // Bridge mapping operations
          'POST /registerMapping': 'atproto.bridge.registerMapping',
          'POST /getDidForActor': 'atproto.bridge.getDidForActor',
          'POST /getActorForDid': 'atproto.bridge.getActorForDid',
          'POST /convertActivityPubToAtproto': 'atproto.bridge.convertActivityPubToAtproto',
          'POST /convertAtprotoToActivityPub': 'atproto.bridge.convertAtprotoToActivityPub'
        }
      },
      {
        name: 'federation',
        path: '/xrpc',
        bodyParsers: {
          json: {
            limit: '1mb'
          }
        },
        aliases: {
          // Atproto federation endpoints
          'GET /com.atproto.sync.getRepoStatus': 'atproto.federation.getRepoStatus',
          'GET /com.atproto.sync.getRepo': 'atproto.federation.getRepoCar',
          'GET /com.atproto.sync.getCheckout': 'atproto.federation.getRepoCar',
          'POST /com.atproto.repo.createRecord': 'atproto.federation.createRecordWithFederation',
          'POST /com.atproto.sync.notifyOfUpdate': 'atproto.federation.broadcastToFirehose',
          'GET /com.atproto.sync.subscribeRepos': 'atproto.federation.subscribeToFirehose'
        }
      }
    ]
  },
  actions: {
    favicon(ctx) {
      ctx.meta.$responseType = 'image/x-icon';
      return fs.readFileSync(path.resolve(__dirname, '../static/favicon.ico'));
    },
    redirectToFront(ctx) {
      ctx.meta.$statusCode = 302;
      ctx.meta.$location = CONFIG.FRONTEND_URL;
    }
  },
  methods: {
    async authenticate(ctx, route, req, res) {
      if (req.headers.signature) {
        return ctx.call('signature.authenticate', { route, req, res });
      }
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const payload = await ctx.call('auth.jwt.decodeToken', { token });
        if (payload?.azp) {
          // This is a OIDC provider-generated ID token
          return ctx.call('solid-oidc.authenticate', { route, req, res });
        }
        // Otherwise it is a custom JWT token (used by ActivityPods frontend)
        return ctx.call('auth.authenticate', { route, req, res });
      }

      ctx.meta.webId = 'anon';
      return null;
    },
    async authorize(ctx, route, req, res) {
      if (req.headers.signature) {
        return ctx.call('signature.authorize', { route, req, res });
      }
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const payload = await ctx.call('auth.jwt.decodeToken', { token });
        if (payload.azp) {
          // This is a OIDC provider-generated ID token
          return ctx.call('solid-oidc.authorize', { route, req, res });
        }
        // Otherwise it is a custom JWT token (used by ActivityPods frontend) or a VC capability
        return ctx.call('auth.authorize', { route, req, res });
      }
      ctx.meta.webId = 'anon';
      throw new E.UnAuthorizedError(E.ERR_NO_TOKEN);
    },
    // Overwrite optimization method to put catchAll routes at the end
    // See https://github.com/moleculerjs/moleculer-web/issues/335
    optimizeRouteOrder() {
      this.routes.sort(a => (a.opts.catchAll ? 1 : -1));
      this.aliases.sort(a => (a.route.opts.catchAll ? 1 : -1));
    }
  }
};
