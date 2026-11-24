// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	emailedFlowParam,
	forgetSignInRedirect,
	keepSignInRedirect,
	keptSignInRedirectSearch,
	PENDING_SIGN_IN_REDIRECT_TTL_MS,
	readSignInRedirect,
	restoreSignInRedirect,
} from './pendingSignInRedirect';

const MCP_AUTHORIZE = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';
const NOW = 1_800_000_000_000;
const PREFIX = 'Studio:PendingSignInRedirect:';
// central-manager's EMAILED_FLOW_REGEX, which it applies to `flow` before putting it in a link.
const CENTRAL_MANAGER_FLOW = /^[A-Za-z0-9_-]{22,64}$/;

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('pendingSignInRedirect', () => {
	it('keeps a target under a new flow id that central-manager accepts', () => {
		const flow = keepSignInRedirect(MCP_AUTHORIZE, NOW);

		expect(flow).toMatch(CENTRAL_MANAGER_FLOW);
		expect(readSignInRedirect(flow, NOW)?.redirect).toBe(MCP_AUTHORIZE);
	});

	it('gives every flow its own id, so one flow never reads another’s target', () => {
		const first = keepSignInRedirect(MCP_AUTHORIZE, NOW);
		const second = keepSignInRedirect('/org-1/clu-1/usage', NOW);

		expect(first).not.toBe(second);
		expect(readSignInRedirect(first, NOW)?.redirect).toBe(MCP_AUTHORIZE);
		expect(readSignInRedirect(second, NOW)?.redirect).toBe('/org-1/clu-1/usage');
	});

	it('keeps it until it expires', () => {
		const flow = keepSignInRedirect(MCP_AUTHORIZE, NOW);

		expect(readSignInRedirect(flow, NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS - 1)?.redirect).toBe(MCP_AUTHORIZE);
		expect(readSignInRedirect(flow, NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS)?.redirect).toBeUndefined();
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize'],
		['a protocol-relative host', '//evil.example'],
		['a value that is not text', 7],
		['nothing', undefined],
	])('starts no flow and keeps nothing for %s', (_label, redirect) => {
		expect(keepSignInRedirect(redirect, NOW)).toBeUndefined();
		expect(localStorage.length).toBe(0);
	});

	it.each([
		['too short', 'a'.repeat(21)],
		['too long', 'a'.repeat(65)],
		['characters a link would need escaped', 'a&b=c'.padEnd(22, 'x')],
		['a value that is not text', 12345],
		['nothing', undefined],
	])('reads no flow id from %s', (_label, value) => {
		expect(emailedFlowParam(value)).toBeUndefined();
		expect(readSignInRedirect(value as string | undefined, NOW)).toBeUndefined();
	});

	it('reads one central-manager would accept', () => {
		expect(emailedFlowParam('Fl0w_id-0123456789abcd')).toBe('Fl0w_id-0123456789abcd');
	});

	it('hands the flow’s target on as `?redirect=`', () => {
		const flow = keepSignInRedirect(MCP_AUTHORIZE);

		expect(keptSignInRedirectSearch(flow)).toEqual({ redirect: MCP_AUTHORIZE });
		expect(keptSignInRedirectSearch('Fl0w_id-0123456789abcd')).toBeUndefined();
		expect(keptSignInRedirectSearch(undefined)).toBeUndefined();
	});

	it('puts a target back only while the slot is empty, with its own expiry', () => {
		const flow = keepSignInRedirect('/org-1', NOW)!;
		restoreSignInRedirect(flow, { redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(readSignInRedirect(flow, NOW)?.redirect).toBe('/org-1');

		localStorage.clear();
		restoreSignInRedirect(flow, { redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(readSignInRedirect(flow, NOW)).toEqual({ redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(readSignInRedirect(flow, NOW + 5)).toBeUndefined();
	});

	it('puts nothing back under an id that is not one', () => {
		restoreSignInRedirect('short', { redirect: MCP_AUTHORIZE, expiresAt: NOW + 5 });
		expect(localStorage.length).toBe(0);
	});

	it('removes one it reads as expired or unfollowable', () => {
		const flow = keepSignInRedirect(MCP_AUTHORIZE, NOW)!;
		readSignInRedirect(flow, NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS);
		expect(localStorage.getItem(PREFIX + flow)).toBeNull();

		localStorage.setItem(PREFIX + flow, JSON.stringify({ redirect: '//evil.example', expiresAt: NOW + 1 }));
		readSignInRedirect(flow, NOW);
		expect(localStorage.getItem(PREFIX + flow)).toBeNull();
	});

	it('forgets a flow’s target and no other', () => {
		const flow = keepSignInRedirect(MCP_AUTHORIZE, NOW)!;
		const other = keepSignInRedirect(MCP_AUTHORIZE, NOW)!;

		forgetSignInRedirect(flow);

		expect(readSignInRedirect(flow, NOW)).toBeUndefined();
		expect(readSignInRedirect(other, NOW)?.redirect).toBe(MCP_AUTHORIZE);
	});

	it('prunes other flows’ expired targets when it keeps one', () => {
		const stale = keepSignInRedirect(MCP_AUTHORIZE, NOW)!;
		const fresh = keepSignInRedirect(MCP_AUTHORIZE, NOW + PENDING_SIGN_IN_REDIRECT_TTL_MS)!;

		expect(localStorage.getItem(PREFIX + stale)).toBeNull();
		expect(localStorage.getItem(PREFIX + fresh)).not.toBeNull();
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
		const flow = 'Fl0w_id-0123456789abcd';
		localStorage.setItem(PREFIX + flow, raw);
		expect(readSignInRedirect(flow, NOW)?.redirect).toBeUndefined();
	});

	it('never throws when storage refuses, and then starts no flow', () => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		const refuse = () => {
			throw new DOMException('denied', 'SecurityError');
		};
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse);
		const flow = 'Fl0w_id-0123456789abcd';

		expect(keepSignInRedirect(MCP_AUTHORIZE, NOW)).toBeUndefined();
		expect(() => restoreSignInRedirect(flow, { redirect: MCP_AUTHORIZE, expiresAt: NOW + 1 })).not.toThrow();
		expect(readSignInRedirect(flow, NOW)).toBeUndefined();
		expect(() => forgetSignInRedirect(flow)).not.toThrow();
	});
});
