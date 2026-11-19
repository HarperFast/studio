// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	forgetSignInRedirect,
	keepSignInRedirect,
	PENDING_SIGN_IN_REDIRECT_TTL_MS,
	readSignInRedirect,
	restoreSignInRedirect,
} from './pendingSignInRedirect';

const MCP_AUTHORIZE = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
const NOW = 1_800_000_000_000;
const KEY = 'Studio:PendingSignInRedirect:ada@example.com';

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('pendingSignInRedirect', () => {
	it('keeps a target per address, whatever its case and spacing', () => {
		keepSignInRedirect(' Ada@Example.com ', MCP_AUTHORIZE, NOW);

		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBe(MCP_AUTHORIZE);
		expect(readSignInRedirect('grace@example.com', NOW)?.redirect).toBeUndefined();
	});

	it('keeps it until it expires', () => {
		keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW);

		expect(readSignInRedirect('ada@example.com', NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS - 1)?.redirect).toBe(
			MCP_AUTHORIZE,
		);
		expect(readSignInRedirect('ada@example.com', NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS)?.redirect).toBeUndefined();
	});

	it('keeps an in-app target too', () => {
		keepSignInRedirect('ada@example.com', '/org-1/clu-1/usage', NOW);
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBe('/org-1/clu-1/usage');
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize'],
		['a protocol-relative host', '//evil.example'],
		['a value that is not text', 7],
		['nothing', undefined],
	])('keeps nothing for %s', (_label, redirect) => {
		keepSignInRedirect('ada@example.com', redirect, NOW);
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('leaves an earlier target alone without one of its own', () => {
		keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW);
		keepSignInRedirect('ada@example.com', undefined, NOW);
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBe(MCP_AUTHORIZE);
	});

	it('forgets only the target it was told about, when told one', () => {
		keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW);
		const read = readSignInRedirect('ada@example.com', NOW)!;
		keepSignInRedirect('ada@example.com', '/org-1', NOW + 1);

		forgetSignInRedirect('ada@example.com', read);
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBe('/org-1');

		forgetSignInRedirect('ada@example.com', readSignInRedirect('ada@example.com', NOW)!);
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('puts a target back only while the slot is empty', () => {
		keepSignInRedirect('ada@example.com', '/org-1', NOW);
		restoreSignInRedirect('ada@example.com', { redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBe('/org-1');
	});

	it('touches nothing when it has nothing to keep or forget', () => {
		localStorage.setItem('Studio:PendingSignInRedirect:grace@example.com', 'stale');
		keepSignInRedirect('ada@example.com', undefined, NOW);
		expect(localStorage.getItem('Studio:PendingSignInRedirect:grace@example.com')).toBe('stale');
	});

	it('puts a target back with its own expiry', () => {
		restoreSignInRedirect('Ada@example.com', { redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(readSignInRedirect('ada@example.com', NOW)).toEqual({ redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(readSignInRedirect('ada@example.com', NOW + 5)).toBeUndefined();
	});

	it('removes one it reads as expired or unfollowable', () => {
		keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW);
		readSignInRedirect('ada@example.com', NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS);
		expect(localStorage.getItem(KEY)).toBeNull();

		localStorage.setItem(KEY, JSON.stringify({ redirect: '//evil.example', expiresAt: NOW + 1 }));
		readSignInRedirect('ada@example.com', NOW);
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('forgets a target', () => {
		keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW);
		forgetSignInRedirect('ADA@example.com');
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBeUndefined();
	});

	it('prunes expired targets for other addresses when it keeps one', () => {
		keepSignInRedirect('grace@example.com', MCP_AUTHORIZE, NOW);
		keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS);

		expect(localStorage.getItem('Studio:PendingSignInRedirect:grace@example.com')).toBeNull();
		expect(localStorage.getItem(KEY)).not.toBeNull();
	});

	it.each([
		['text that is not JSON', 'not json'],
		['an array', JSON.stringify([MCP_AUTHORIZE])],
		['null', 'null'],
		['a bare number', '42'],
		['no expiry', JSON.stringify({ redirect: MCP_AUTHORIZE })],
		['an expiry that is not a number', JSON.stringify({ redirect: MCP_AUTHORIZE, expiresAt: 'later' })],
		['a target it would not follow', JSON.stringify({ redirect: '//evil.example', expiresAt: NOW + 1 })],
		['a target that is not text', JSON.stringify({ redirect: 7, expiresAt: NOW + 1 })],
	])('reads nothing from %s', (_label, raw) => {
		localStorage.setItem(KEY, raw);
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBeUndefined();
	});

	it('does nothing for an empty address', () => {
		keepSignInRedirect('  ', MCP_AUTHORIZE, NOW);
		expect(localStorage.length).toBe(0);
		expect(readSignInRedirect('', NOW)?.redirect).toBeUndefined();
	});

	it('never throws when storage refuses', () => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		const refuse = () => {
			throw new DOMException('denied', 'SecurityError');
		};
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse);

		expect(() => keepSignInRedirect('ada@example.com', MCP_AUTHORIZE, NOW)).not.toThrow();
		expect(() => restoreSignInRedirect('ada@example.com', { redirect: MCP_AUTHORIZE, expiresAt: NOW + 1 })).not
			.toThrow();
		expect(() => forgetSignInRedirect('ada@example.com', { redirect: MCP_AUTHORIZE, expiresAt: NOW + 1 })).not
			.toThrow();
		expect(readSignInRedirect('ada@example.com', NOW)?.redirect).toBeUndefined();
		expect(() => forgetSignInRedirect('ada@example.com')).not.toThrow();
	});
});
