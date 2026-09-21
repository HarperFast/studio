import fastifyStatic from '@fastify/static';
import { join } from 'path';

const frameGuards = (reply) => {
	reply.header('Content-Security-Policy', "frame-ancestors 'none'");
	reply.header('X-Frame-Options', 'DENY');
};

export default async (fastify) => {
	fastify.register(fastifyStatic, {
		root: join(import.meta.dirname, '../web'),
		maxAge: '30d',
		immutable: true,
		// `wildcard: false` registers a route per file instead of one `GET /*`, which is what frees
		// `/*` for the not-found route below; `index: false` keeps the plugin off `GET /`, served
		// here. Both behave identically on the @fastify/static 7 (Harper v4) and 8 (v5) pairings
		// this template is deployed with.
		wildcard: false,
		index: false,
	});

	fastify.get('/', function(req, reply) {
		frameGuards(reply);
		reply.sendFile('index.html', {
			maxAge: '1m',
			immutable: false,
		});
	});

	/**
	 * Anything that matched no file and no central-manager route.
	 *
	 * Harper registers these fastify routes as a global fallback *after* its own resource routing
	 * (server/fastifyRoutes.ts), so this can't shadow `/oauth/*` or the REST API — it only sees
	 * what the native chain already declined. Without it those requests fall through to Harper's
	 * plain-text `Not found`, which is what a user gets today for any mistyped URL.
	 *
	 * It has to be a route rather than `setNotFoundHandler`: Harper already owns the instance's
	 * not-found handler (it re-emits `unhandled` so the request cascades to core), and fastify
	 * throws `Not found handler already set for Fastify instance with prefix: '/'` at load time if
	 * a component registers a second one — taking the whole component down with it.
	 *
	 * Studio is hash-routed, so an unmatched *path* is never an app route and serving index.html
	 * here would just drop the visitor on the dashboard with a 404 status. Non-HTML clients get
	 * JSON instead of a page.
	 */
	fastify.get('/*', function(req, reply) {
		reply.code(404);
		if (!String(req.headers.accept ?? '').includes('text/html')) {
			return reply.send({ error: 'Not found' });
		}
		frameGuards(reply);
		return reply.sendFile('404.html', { maxAge: 0, immutable: false });
	});
};
