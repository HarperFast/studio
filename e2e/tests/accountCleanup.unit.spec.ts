import { expect, test } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { deleteSessionAccount, signupApiBase } from './accountCleanup';

test.describe('signupApiBase', () => {
	for (
		const [signupUrl, apiBase] of [
			['https://stage.example.test/User/', 'https://stage.example.test/'],
			['https://stage.example.test/User', 'https://stage.example.test/'],
			['https://cm.example.test/api/User/?source=studio', 'https://cm.example.test/api/'],
		]
	) {
		test(`${signupUrl} -> ${apiBase}`, () => {
			expect(signupApiBase(signupUrl)?.href).toBe(apiBase);
		});
	}

	for (
		const url of [
			'https://cm.example.test/Login/',
			'https://cm.example.test/Users/track',
			'https://cm.example.test/OrganizationUser/',
			'https://cm.example.test/User/usr-1/resend',
		]
	) {
		test(`${url} is not a signup`, () => {
			expect(signupApiBase(url)).toBeUndefined();
		});
	}
});

test.describe('deleteSessionAccount', () => {
	type Reply = { status: number; contentType?: string; body?: string };
	let server: Server;
	let origin: string;
	let replies: Record<string, Reply>;
	let received: string[];

	test.beforeAll(async () => {
		server = createServer((req: IncomingMessage, res: ServerResponse) => {
			const key = `${req.method} ${req.url}`;
			received.push(`${key} accept=${req.headers.accept}`);
			const { status, contentType, body } = replies[key] ?? { status: 404 };
			res.writeHead(status, contentType ? { 'content-type': contentType } : {});
			res.end(body);
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	test.afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	test.beforeEach(() => {
		replies = {};
		received = [];
	});

	const json = (value: unknown): Reply => ({
		status: 200,
		contentType: 'application/json; charset=utf-8',
		body: JSON.stringify(value),
	});

	test('deletes the account on the API base it is given, not on the origin root', async ({ request }) => {
		replies['GET /api/User/current'] = json({ id: 'usr-1' });
		replies['DELETE /api/User/usr-1'] = { status: 204 };

		await expect(deleteSessionAccount(request, new URL('/api/', origin))).resolves.toBe('usr-1');
		expect(received).toEqual([
			'GET /api/User/current accept=application/json',
			expect.stringMatching(/^DELETE \/api\/User\/usr-1 /),
		]);
	});

	test('fails on the empty 404 a local dev server answers for /User/current', async ({ request }) => {
		await expect(deleteSessionAccount(request, new URL('/', origin))).rejects.toThrow(/User\/current -> 404$/);
		expect(received).toHaveLength(1);
	});

	test('fails on an SPA shell served as 200 instead of JSON', async ({ request }) => {
		replies['GET /User/current'] = {
			status: 200,
			contentType: 'text/html',
			body: '<!doctype html><title>Studio</title>',
		};

		await expect(deleteSessionAccount(request, new URL('/', origin))).rejects.toThrow(
			/-> 200 text\/html, not JSON: that is not the central-manager API/,
		);
		expect(received).toHaveLength(1);
	});

	test('fails without a session', async ({ request }) => {
		replies['GET /User/current'] = { ...json({ error: 'Unauthorized' }), status: 401 };

		await expect(deleteSessionAccount(request, new URL('/', origin))).rejects.toThrow(/User\/current -> 401$/);
	});

	test('fails when the current user has no id', async ({ request }) => {
		replies['GET /User/current'] = json({ email: 'someone@example.test' });

		await expect(deleteSessionAccount(request, new URL('/', origin))).rejects.toThrow(/returned no account id/);
		expect(received).toHaveLength(1);
	});

	test('fails when the delete is refused', async ({ request }) => {
		replies['GET /User/current'] = json({ id: 'usr-1' });
		replies['DELETE /User/usr-1'] = { status: 403 };

		await expect(deleteSessionAccount(request, new URL('/', origin))).rejects.toThrow(/DELETE .*\/User\/usr-1 -> 403$/);
	});
});
