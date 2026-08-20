import {
	ApiAuth,
	buildFetchSnippet,
	buildRequest,
	executeRequest,
	formatResponseBody,
	isAuthorized,
	joinUrl,
	MAX_DISPLAY_BODY_CHARS,
	methodHasBody,
	prettyPrintIfJson,
	readCappedBody,
	RequestInputs,
} from '@/features/instance/apis/explorer/request';
import { FlatOperation, HttpMethod } from '@/features/instance/apis/explorer/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

function op(method: HttpMethod, path: string, overrides: Partial<FlatOperation> = {}): FlatOperation {
	return {
		id: `${method} ${path}`,
		method,
		path,
		tag: 'default',
		operation: {},
		parameters: [],
		searchText: `${method} ${path}`,
		...overrides,
	};
}

const emptyInputs: RequestInputs = { pathParams: {}, queryParams: {}, headerParams: {}, body: '' };
const noAuth: ApiAuth = { type: 'cookie' };

describe('methodHasBody', () => {
	it('is true only for post/put/patch', () => {
		expect(['post', 'put', 'patch'].map(m => methodHasBody(m as HttpMethod))).toEqual([true, true, true]);
		expect(['get', 'delete', 'options', 'head'].map(m => methodHasBody(m as HttpMethod))).toEqual([
			false,
			false,
			false,
			false,
		]);
	});
});

describe('joinUrl', () => {
	it('joins with exactly one slash regardless of trailing/leading slashes', () => {
		expect(joinUrl('http://h:9926/', '/leaderboard/')).toBe('http://h:9926/leaderboard/');
		expect(joinUrl('http://h:9926', 'leaderboard/')).toBe('http://h:9926/leaderboard/');
	});

	it('returns the path unchanged when there is no base', () => {
		expect(joinUrl('', '/leaderboard/')).toBe('/leaderboard/');
	});
});

describe('buildRequest', () => {
	const base = 'http://h:9926';

	it('substitutes path params into the URL', () => {
		const req = buildRequest(op('get', '/game/{id}'), base, { ...emptyInputs, pathParams: { id: '42' } }, noAuth);
		expect(req.url).toBe('http://h:9926/game/42');
		expect(req.missingPathParams).toEqual([]);
		expect(req.body).toBeUndefined();
	});

	it('reports missing required path params and leaves the placeholder in the URL', () => {
		const req = buildRequest(op('get', '/game/{id}'), base, emptyInputs, noAuth);
		expect(req.missingPathParams).toEqual(['id']);
		expect(req.url).toBe('http://h:9926/game/{id}');
	});

	it('appends only non-empty query params', () => {
		const req = buildRequest(op('get', '/leaderboard/'), base, {
			...emptyInputs,
			queryParams: { limit: '10', sort: '' },
		}, noAuth);
		expect(req.url).toBe('http://h:9926/leaderboard/?limit=10');
	});

	it('adds a JSON body and Content-Type for body methods, and omits both when the body is blank', () => {
		const withBody = buildRequest(op('post', '/game/{id}'), base, {
			...emptyInputs,
			pathParams: { id: '1' },
			body: '{"score":5}',
		}, noAuth);
		expect(withBody.body).toBe('{"score":5}');
		expect(withBody.headers['Content-Type']).toBe('application/json');

		const blankBody = buildRequest(op('post', '/game/{id}'), base, { ...emptyInputs, pathParams: { id: '1' } }, noAuth);
		expect(blankBody.body).toBeUndefined();
		expect(blankBody.headers['Content-Type']).toBeUndefined();
	});

	it('applies basic and bearer auth as an Authorization header', () => {
		const basic = buildRequest(op('get', '/x'), base, emptyInputs, { type: 'basic', username: 'u', password: 'p' });
		expect(basic.headers.Authorization).toBe(`Basic ${btoa('u:p')}`);

		const bearer = buildRequest(op('get', '/x'), base, emptyInputs, { type: 'bearer', token: 'tok' });
		expect(bearer.headers.Authorization).toBe('Bearer tok');

		const cookie = buildRequest(op('get', '/x'), base, emptyInputs, { type: 'cookie' });
		expect(cookie.headers.Authorization).toBeUndefined();
	});

	it('UTF-8-encodes non-Latin-1 Basic credentials instead of throwing', () => {
		const build = () =>
			buildRequest(op('get', '/x'), base, emptyInputs, { type: 'basic', username: 'u', password: 'pä🔑' });
		expect(build).not.toThrow();
		// Decodes back to the original UTF-8 bytes (btoa on raw would have thrown).
		const header = build().headers.Authorization!.replace('Basic ', '');
		const bytes = Uint8Array.from(atob(header), c => c.charCodeAt(0));
		expect(new TextDecoder().decode(bytes)).toBe('u:pä🔑');
	});

	it('includes custom header params', () => {
		const req = buildRequest(op('get', '/x'), base, {
			...emptyInputs,
			headerParams: { 'X-Trace': 'abc', 'X-Blank': '' },
		}, noAuth);
		expect(req.headers['X-Trace']).toBe('abc');
		expect(req.headers['X-Blank']).toBeUndefined();
	});
});

describe('isAuthorized', () => {
	it('is true only for a Basic username or a non-empty Bearer token', () => {
		expect(isAuthorized({ type: 'basic', username: 'u', password: 'p' })).toBe(true);
		expect(isAuthorized({ type: 'bearer', token: 'tok' })).toBe(true);
	});

	it('is false for cookie and for empty explicit credentials', () => {
		expect(isAuthorized({ type: 'cookie' })).toBe(false);
		expect(isAuthorized({ type: 'basic', username: '', password: '' })).toBe(false);
		expect(isAuthorized({ type: 'bearer', token: '' })).toBe(false);
	});
});

describe('prettyPrintIfJson', () => {
	it('pretty-prints JSON payloads', () => {
		expect(prettyPrintIfJson('{"a":1}', 'application/json')).toBe('{\n\t"a": 1\n}');
	});

	it('leaves non-JSON content untouched', () => {
		expect(prettyPrintIfJson('plain text', 'text/plain')).toBe('plain text');
		expect(prettyPrintIfJson('not json', 'application/json')).toBe('not json');
		expect(prettyPrintIfJson('', null)).toBe('');
	});
});

describe('formatResponseBody', () => {
	it('pretty-prints JSON under the cap', () => {
		expect(formatResponseBody('{"a":1}', 'application/json')).toBe('{\n\t"a": 1\n}');
	});

	it('truncates and does not pretty-print an over-cap body', () => {
		const huge = 'x'.repeat(MAX_DISPLAY_BODY_CHARS + 100);
		const formatted = formatResponseBody(huge, 'application/json');
		expect(formatted.length).toBeLessThan(huge.length);
		expect(formatted).toContain('response truncated for display');
	});
});

describe('readCappedBody', () => {
	it('streams only up to the cap and cancels the reader so the tail is not consumed', async () => {
		const encoder = new TextEncoder();
		const chunk = encoder.encode('x'.repeat(200_000));
		let reads = 0;
		let cancelled = false;
		const reader = {
			read: () => {
				reads++;
				return Promise.resolve({ done: false, value: chunk }); // an endless stream
			},
			cancel: () => {
				cancelled = true;
				return Promise.resolve();
			},
		};
		const response = {
			body: { getReader: () => reader },
			text: () => Promise.reject(new Error('text() must not be called when a stream is available')),
		} as unknown as Response;

		const { text, truncated } = await readCappedBody(response, MAX_DISPLAY_BODY_CHARS);
		expect(truncated).toBe(true);
		expect(text.length).toBe(MAX_DISPLAY_BODY_CHARS);
		expect(cancelled).toBe(true);
		expect(reads).toBeLessThan(10); // stopped near the cap, did not drain the endless stream
	});

	it('falls back to text() when there is no readable body', async () => {
		const response = { body: null, text: () => Promise.resolve('{"a":1}') } as unknown as Response;
		expect(await readCappedBody(response, MAX_DISPLAY_BODY_CHARS)).toEqual({ text: '{"a":1}', truncated: false });
	});
});

describe('buildFetchSnippet', () => {
	it('renders a credentialed fetch with method, headers, and body', () => {
		const req = buildRequest(op('post', '/game/{id}'), 'http://h:9926', {
			...emptyInputs,
			pathParams: { id: '1' },
			body: '{"score":5}',
		}, { type: 'bearer', token: 'tok' });
		const snippet = buildFetchSnippet(req);
		expect(snippet).toContain('await fetch("http://h:9926/game/1"');
		expect(snippet).toContain('method: "POST"');
		expect(snippet).toContain('credentials: "include"');
		expect(snippet).toContain('"Authorization": "Bearer tok"');
		expect(snippet).toContain('body: `{"score":5}`');
	});

	it('omits the body line for bodyless requests', () => {
		const req = buildRequest(op('get', '/x'), 'http://h', emptyInputs, noAuth);
		expect(buildFetchSnippet(req)).not.toContain('body:');
	});
});

describe('executeRequest', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function fakeResponse({ status = 200, statusText = 'OK', body = '', contentType = 'application/json' }): Response {
		const headers = new Headers();
		if (contentType) {
			headers.set('content-type', contentType);
		}
		return {
			ok: status >= 200 && status < 300,
			status,
			statusText,
			headers,
			text: () => Promise.resolve(body),
		} as unknown as Response;
	}

	it('returns a structured result and pretty-prints a JSON body', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ body: '{"entries":[]}' })));
		let t = 1000;
		const result = await executeRequest(
			{ method: 'get', url: 'http://h/x', headers: {}, missingPathParams: [] },
			() => (t += 12),
		);
		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.body).toBe('{\n\t"entries": []\n}');
		expect(result.durationMs).toBe(12);
		expect(result.networkError).toBeUndefined();
	});

	it('captures a network/CORS failure instead of throwing', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		const result = await executeRequest({ method: 'get', url: 'http://h/x', headers: {}, missingPathParams: [] });
		expect(result.ok).toBe(false);
		expect(result.status).toBe(0);
		expect(result.networkError).toBe('Failed to fetch');
	});

	it('sends the request with credentials included', async () => {
		const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ body: '{}' }));
		vi.stubGlobal('fetch', fetchMock);
		await executeRequest({
			method: 'post',
			url: 'http://h/x',
			headers: { 'X-A': '1' },
			body: '{}',
			missingPathParams: [],
		});
		expect(fetchMock).toHaveBeenCalledWith('http://h/x', {
			method: 'POST',
			headers: { 'X-A': '1' },
			body: '{}',
			credentials: 'include',
		});
	});
});
