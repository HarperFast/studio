import fastifyStatic4 from 'fastify4-static';
import fastifyStatic5 from 'fastify5-static';
import { join } from 'path';

// @fastify/static majors are pinned to fastify majors (v7 -> fastify 4, v8 -> fastify 5).
// harperdb 4.x embeds fastify 4 and Harper 5.x embeds fastify 5, and this template deploys
// to CMs on both, so pick the plugin build matching the running server. Collapse back to a
// single @fastify/static dependency once every CM is on Harper 5.x.
export default async (fastify) => {
	const fastifyStatic = (fastify.version && Number.parseInt(fastify.version, 10) >= 5) ? fastifyStatic5 : fastifyStatic4;

	fastify.register(fastifyStatic, {
		root: join(import.meta.dirname, '../web'),
		maxAge: '30d',
		immutable: true,
	});

	fastify.get('/', function(req, reply) {
		reply.header('Content-Security-Policy', "frame-ancestors 'none'");
		reply.header('X-Frame-Options', 'DENY');
		reply.sendFile('index.html', {
			maxAge: '1m',
			immutable: false,
		});
	});
};
