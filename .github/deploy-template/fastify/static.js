import fastifyStatic from '@fastify/static';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const root = join(import.meta.dirname, '../web');

const wantsHtml = (accept) => accept.includes('text/html') || accept.includes('application/xhtml+xml');

async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

// index.html and 404.html are the only documents a browser renders here; assets are hashed.
function sendDocument(reply, file, maxAge) {
	reply.header('Content-Security-Policy', "frame-ancestors 'none'");
	reply.header('X-Frame-Options', 'DENY');
	return reply.sendFile(file, { maxAge, immutable: false });
}

export default async (fastify) => {
	// `serve: false` decorates `reply.sendFile` without registering routes. Routing must not be a
	// snapshot of the files present at boot: deploys land a new `web/` with `restart=false`, so a
	// per-file route table 404s every newly hashed bundle until something restarts the component.
	fastify.register(fastifyStatic, { root, serve: false });

	fastify.get('/', function(req, reply) {
		return sendDocument(reply, 'index.html', '1m');
	});

	// Anything that matched no file and no central-manager route. It has to be a route rather than
	// `setNotFoundHandler`: Harper owns that handler on this instance and fastify throws at load on
	// a second one for the same prefix, which would take Studio down with it. See AGENTS.md.
	fastify.get('/*', async function(req, reply) {
		const relative = req.params['*'] ?? '';
		const absolute = resolve(root, relative);
		if ((absolute === root || absolute.startsWith(root + sep)) && await isFile(absolute)) {
			return relative === 'index.html'
				? sendDocument(reply, relative, '1m')
				: reply.sendFile(relative, { maxAge: '30d', immutable: true });
		}

		reply.code(404);
		return wantsHtml(String(req.headers.accept ?? ''))
			? sendDocument(reply, '404.html', 0)
			: reply.send({ error: 'Not found' });
	});
};
