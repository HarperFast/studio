import fastifyStatic from '@fastify/static';
import { join } from 'path';

export default async (fastify) => {
	fastify.register(fastifyStatic, {
		root: join(import.meta.dirname, '../web'),
		maxAge: '30d',
		immutable: true,
	});

	fastify.get('/', function(req, reply) {
		reply.sendFile('index.html', { maxAge: '1m', immutable: false });
	});
};
