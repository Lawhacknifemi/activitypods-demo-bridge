const fs = require('fs');
const path = require('path');
const ApiGatewayService = require('moleculer-web');
const { Errors: E } = require('moleculer-web');
const { WebSocketServer } = require('ws');
const WebSocketMixin = require('../mixins/websocket');
const CONFIG = require('../config/config');

// Attach WebSocket upgrade handler for subscribeRepos to the HTTP server
// This fires BEFORE moleculer-web processes the request, so it cleanly hijacks the connection
function attachFirehoseUpgradeHandler(server, broker) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url?.split('?')[0];
    if (url !== '/xrpc/com.atproto.sync.subscribeRepos') return;

    wss.handleUpgrade(req, socket, head, ws => {
      broker.logger.info('Relay/client connected to atproto firehose');

      // Send #info frame on connect (atproto spec)
      import('@ipld/dag-cbor').then(dagCbor => {
        Promise.all([
          dagCbor.encode({ t: '#info', op: 1 }),
          dagCbor.encode({ name: 'OutdatedCursor' })
        ]).then(([h, b]) => {
          try { ws.send(Buffer.concat([h, b])); } catch (_) {}
        });
      });

      // Register with federation service firehose queue
      const fedService = broker.services.find(s => s.name === 'atproto.federation');
      if (fedService) {
        fedService.settings.firehoseQueues.add(ws);
        ws.firehoseQueue = [];
      }

      ws.on('close', () => {
        broker.logger.info('Relay/client disconnected from atproto firehose');
        const fed = broker.services.find(s => s.name === 'atproto.federation');
        if (fed) fed.settings.firehoseQueues.delete(ws);
      });
      ws.on('error', err => {
        broker.logger.warn('Firehose WebSocket error:', err.message);
        const fed = broker.services.find(s => s.name === 'atproto.federation');
        if (fed) fed.settings.firehoseQueues.delete(ws);
      });
    });
  });
}

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
        name: 'identity',
        path: '/identity',
        bodyParsers: { json: { limit: '1mb' } },
        aliases: {
          'GET /list': 'atproto.identity.listDids',
          'POST /create': 'atproto.identity.createDid',
          'GET /did/:did': 'atproto.identity.getDid'
        },
        opts: { parseParams: true }
      },
      {
        name: 'atproto',
        path: '/atproto',
        bodyParsers: { json: { limit: '1mb' } },
        aliases: {
          'POST /record/:did/:collection/:rkey': 'atproto.createRecord',
          'GET /record/:did/:collection/:rkey': 'atproto.getRecord',
          'PUT /record/:did/:collection/:rkey': 'atproto.updateRecord',
          'DELETE /record/:did/:collection/:rkey': 'atproto.deleteRecord',
          'GET /record/:did/:collection': 'atproto.listRecords'
        },
        opts: { parseParams: true }
      },
      {
        name: 'bridge',
        path: '/bridge',
        bodyParsers: { json: { limit: '1mb' } },
        aliases: {
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
        bodyParsers: { json: { limit: '1mb' } },
        aliases: {
          'GET /com.atproto.server.describeServer': 'atproto.federation.describeServer',
          'POST /com.atproto.sync.requestCrawl': 'atproto.federation.requestCrawl',
          'GET /com.atproto.sync.getRepoStatus': 'atproto.federation.getRepoStatus',
          'GET /com.atproto.sync.getRepo': 'atproto.federation.getRepoCar',
          'GET /com.atproto.sync.getCheckout': 'atproto.federation.getRepoCar',
          'POST /com.atproto.repo.createRecord': 'atproto.federation.createRecordWithFederation',
          'POST /com.atproto.sync.notifyOfUpdate': 'atproto.federation.broadcastToFirehose',
          'GET /com.atproto.sync.subscribeRepos': 'atproto.federation.subscribeToFirehose'
        },
        callOptions: { timeout: 0 }
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
  created() {
    // Attach the WebSocket upgrade handler once the HTTP server is created
    // We use a small poll because the server is created during moleculer-web's created() hook
    const attachWhenReady = () => {
      if (this.server) {
        attachFirehoseUpgradeHandler(this.server, this.broker);
        this.logger.info('Attached atproto firehose WebSocket upgrade handler');
      } else {
        setTimeout(attachWhenReady, 100);
      }
    };
    setTimeout(attachWhenReady, 100);
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
          return ctx.call('solid-oidc.authenticate', { route, req, res });
        }
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
          return ctx.call('solid-oidc.authorize', { route, req, res });
        }
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
