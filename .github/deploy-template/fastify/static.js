import fastifyStatic from '@fastify/static';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const root = join(import.meta.dirname, '../web');

// `text/html;q=0` is an explicit refusal, not a request for HTML, so substring matching won't do.
const wantsHtml = (accept) =>
	accept.toLowerCase().split(',').some((range) => {
		const [type, ...params] = range.split(';').map((part) => part.trim());
		if (type !== 'text/html' && type !== 'application/xhtml+xml') { return false; }
		const quality = params.find((param) => param.startsWith('q='));
		return !quality || Number(quality.slice(2)) > 0;
	});

async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

// An HTML document can be framed and must not be pinned in a cache; a hashed asset is neither.
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

	// A route, not `setNotFoundHandler`: Harper owns that handler here — see AGENTS.md.
	fastify.get('/*', async function(req, reply) {
		const relative = req.params['*'] ?? '';
		const absolute = resolve(root, relative);
		if ((absolute === root || absolute.startsWith(root + sep)) && await isFile(absolute)) {
			return relative.endsWith('.html')
				? sendDocument(reply, relative, relative === 'index.html' ? '1m' : 0)
				: reply.sendFile(relative, { maxAge: '30d', immutable: true });
		}

		reply.code(404);
		return wantsHtml(String(req.headers.accept ?? ''))
			? sendDocument(reply, '404.html', 0)
			: reply.send({ error: 'Not found' });
	});
};
