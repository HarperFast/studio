#!/usr/bin/env node
/**
 * Exercises `fastify/static.js` the way central-manager does: behind Harper's own not-found
 * handler, against a real `web/` build. Nothing in CI evaluates `.github/`, so this is the only
 * check that a deployed Studio still serves what it should.
 *
 * Both deployed pairings should pass — studio-deploy's `FASTIFY_STATIC_V5` override is what
 * selects between them — so run it twice, from `.github/deploy-template`:
 *
 *   npm i --no-save fastify@4 @fastify/static@7 && node verify-static.mjs   # Harper v4
 *   npm i --no-save fastify@5 @fastify/static@8 && node verify-static.mjs   # Harper v5
 *
 * A bare `npm i fastify @fastify/static` pairs the package.json's v7 pin with fastify 5 and fails
 * the plugin's own version check. Pass a build directory as argv[1] to test one other than `web/`.
 */
import { existsSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const build = resolve(process.argv[2] ?? join(import.meta.dirname, '../../web'));
// `static.js` serves `<template>/web`, which is the shape the deploy produces (`mv web deploy/`).
const served = join(import.meta.dirname, 'web');
const staged = !existsSync(served);
if (staged) { symlinkSync(build, served); }
process.on('exit', () => {
	if (staged) {
		try {
			unlinkSync(served);
		} catch {}
	}
});

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
try {
	await app.register(staticRoutes);
	await app.ready();
} catch (error) {
	console.error(`could not start the template: ${error.message}`);
	if (String(error.code) === 'FST_ERR_PLUGIN_VERSION_MISMATCH') {
		console.error('install a matching pairing: fastify@4 with @fastify/static@7, or fastify@5 with @fastify/static@8');
	}
	process.exit(2);
}

const html = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const shell = await app.inject({ method: 'GET', url: '/' });
const asset = shell.body.match(/assets\/[\w.-]+\.js/)?.[0];
if (!asset) {
	console.error(`no hashed asset found in the app shell — is ${build} a real build?`);
	process.exit(2);
}

// A deploy lands a new web/ without restarting the component, so routing must read disk per
// request rather than snapshot it at registration.
const afterBoot = 'assets/deployed-after-boot.js';
writeFileSync(join(build, afterBoot), 'console.log(1)');

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

rmSync(join(build, afterBoot), { force: true });
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
