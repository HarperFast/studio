#!/usr/bin/env node
/**
 * Exercises `fastify/static.js` the way central-manager does: behind Harper's own not-found
 * handler, against a real `web/` build. Nothing in CI evaluates `.github/`, and the two defects
 * this file now pins — a route table frozen at boot, and HTML served without frame guards — both
 * reached review because a fresh-boot spot check cannot show them.
 *
 *   cd .github/deploy-template && npm i --no-save fastify @fastify/static && node verify-static.mjs
 *
 * Point it at the pairing you care about: @fastify/static 7 with fastify 4 (Harper v4) and 8 with
 * fastify 5 (v5) are both deployed, per the `FASTIFY_STATIC_V5` override in studio-deploy.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const web = process.argv[2] ?? new URL('../../web', import.meta.url).pathname;

let Fastify, staticRoutes;
try {
	({ default: Fastify } = await import('fastify'));
	({ default: staticRoutes } = await import('./fastify/static.js'));
} catch (error) {
	console.error(`cannot load fastify from ${import.meta.dirname}: ${error.message}`);
	console.error('run `npm i --no-save fastify @fastify/static` in this directory first');
	process.exit(2);
}

const app = Fastify();
// Harper owns the instance's not-found handler and cascades unmatched requests back to core.
app.register(function(instance, options, done) {
	instance.setNotFoundHandler((req, reply) => reply.code(404).type('text/plain').send('Not found\n'));
	done();
});
await app.register(staticRoutes);
await app.ready();

const html = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const shell = await app.inject({ method: 'GET', url: '/' });
const asset = shell.body.match(/assets\/[\w.-]+\.js/)?.[0];
if (!asset) {
	console.error(`no hashed asset found in the app shell — is ${web} a real build?`);
	process.exit(2);
}

// A deploy lands a new web/ and does NOT restart the component, so routing must read disk per
// request rather than snapshot it at registration.
const afterBoot = 'assets/deployed-after-boot.js';
writeFileSync(join(web, afterBoot), 'console.log(1)');

const results = [];
async function expect(label, options, wanted) {
	const response = await app.inject(options);
	const actual = {
		status: response.statusCode,
		type: String(response.headers['content-type']).split(';')[0],
		frameGuard: response.headers['x-frame-options'] ?? '-',
		cache: response.headers['cache-control'] ?? '-',
	};
	const failed = Object.entries(wanted).filter(([key, value]) => String(actual[key]) !== String(value));
	results.push({ label, actual, failed });
}

await expect('app shell is guarded and short-cached', { method: 'GET', url: '/', headers: html }, {
	status: 200,
	frameGuard: 'DENY',
	cache: 'public, max-age=60',
});
await expect('/index.html is guarded too', { method: 'GET', url: '/index.html', headers: html }, {
	status: 200,
	frameGuard: 'DENY',
	cache: 'public, max-age=60',
});
await expect('hashed asset is immutable', { method: 'GET', url: `/${asset}`, headers: { accept: '*/*' } }, {
	status: 200,
	cache: 'public, max-age=2592000, immutable',
});
await expect(
	'asset deployed after boot is served',
	{ method: 'GET', url: `/${afterBoot}`, headers: { accept: '*/*' } },
	{
		status: 200,
	},
);
await expect('unknown path gets the page', { method: 'GET', url: '/organizations', headers: html }, {
	status: 404,
	type: 'text/html',
	frameGuard: 'DENY',
});
await expect('xhtml-only client gets the page', {
	method: 'GET',
	url: '/foo',
	headers: { accept: 'application/xhtml+xml' },
}, {
	status: 404,
	type: 'text/html',
});
await expect('non-HTML client gets JSON', { method: 'GET', url: '/foo', headers: { accept: 'application/json' } }, {
	status: 404,
	type: 'application/json',
});
await expect('q=0 is a refusal, not a request', {
	method: 'GET',
	url: '/foo',
	headers: { accept: 'application/json, text/html;q=0' },
}, {
	status: 404,
	type: 'application/json',
});
await expect('media type casing is not significant', { method: 'GET', url: '/foo', headers: { accept: 'TEXT/HTML' } }, {
	status: 404,
	type: 'text/html',
});
await expect('the page itself is never cached hard', { method: 'GET', url: '/404.html', headers: html }, {
	status: 200,
	frameGuard: 'DENY',
	cache: 'public, max-age=0',
});
await expect('traversal is refused', { method: 'GET', url: '/../../../../etc/passwd', headers: html }, {
	status: 404,
	type: 'text/html',
});
await expect('directory path is refused', { method: 'GET', url: '/assets/', headers: html }, {
	status: 404,
	type: 'text/html',
});
await expect('HEAD is answered', { method: 'HEAD', url: '/nope', headers: html }, { status: 404 });
await expect('POST cascades to Harper', { method: 'POST', url: '/nope', headers: html }, {
	status: 404,
	type: 'text/plain',
});

rmSync(join(web, afterBoot), { force: true });
await app.close();

for (const { label, actual, failed } of results) {
	const detail = `${actual.status} ${actual.type} guard=${actual.frameGuard} cache=${actual.cache}`;
	if (failed.length === 0) {
		console.log(`ok    ${label.padEnd(42)} ${detail}`);
	} else {
		console.log(`FAIL  ${label.padEnd(42)} ${detail}`);
		for (const [key, value] of failed) { console.log(`        expected ${key}=${value}`); }
	}
}

const failures = results.filter((result) => result.failed.length > 0).length;
console.log(
	failures === 0 ? `\nall ${results.length} checks passed` : `\n${failures} of ${results.length} checks FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
