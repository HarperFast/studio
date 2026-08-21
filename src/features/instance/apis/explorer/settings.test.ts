/** @vitest-environment jsdom */
import {
	forgetEntitySettings,
	readEntitySettings,
	scrubLegacySettings,
	writeEntitySettings,
} from '@/features/instance/apis/explorer/settings';
import { beforeEach, describe, expect, it } from 'vitest';

const KEY = 'ApiExplorerSettings';

describe('explorer settings persistence (sessionStorage)', () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
	});

	it('round-trips one entity in sessionStorage without touching others or localStorage', () => {
		writeEntitySettings('ins-a', { method: 'bearer', auth: { type: 'bearer', token: 'A' } });
		writeEntitySettings('ins-b', { server: 'http://b' });
		expect(readEntitySettings('ins-a')).toEqual({ method: 'bearer', auth: { type: 'bearer', token: 'A' } });
		expect(readEntitySettings('ins-b')).toEqual({ server: 'http://b' });
		expect(sessionStorage.getItem(KEY)).toBeTruthy();
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('forgetEntitySettings drops only the named entity', () => {
		writeEntitySettings('ins-a', { auth: { type: 'bearer', token: 'A' } });
		writeEntitySettings('ins-b', { auth: { type: 'bearer', token: 'B' } });
		forgetEntitySettings('ins-a');
		expect(readEntitySettings('ins-a')).toEqual({});
		expect(readEntitySettings('ins-b')).toEqual({ auth: { type: 'bearer', token: 'B' } });
	});

	it('reads a corrupted (non-object) stored value as empty and recovers on write', () => {
		sessionStorage.setItem(KEY, '5');
		expect(readEntitySettings('ins-a')).toEqual({});
		writeEntitySettings('ins-a', { server: 'http://a' });
		expect(readEntitySettings('ins-a')).toEqual({ server: 'http://a' });
	});

	it('normalizes unknown method/auth shapes and drops non-string fields', () => {
		sessionStorage.setItem(
			KEY,
			JSON.stringify({
				'ins-a': { method: 'nonsense', auth: { type: 'weird' }, server: 5 },
				'ins-b': { method: 'basic', auth: { type: 'basic', username: 'u', password: 2 } },
			}),
		);
		expect(readEntitySettings('ins-a')).toEqual({});
		expect(readEntitySettings('ins-b')).toEqual({
			method: 'basic',
			auth: { type: 'basic', username: 'u', password: '' },
		});
	});
});

describe('explorer settings legacy scrub', () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
	});

	it('drops the legacy localStorage secrets, never migrating them', () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({ 'ins-a': { auth: { type: 'basic', username: 'u', password: 'secret' } } }),
		);
		scrubLegacySettings();
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('removes a corrupted legacy value too', () => {
		localStorage.setItem(KEY, 'corrupt-not-json');
		scrubLegacySettings();
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('does not scrub on ordinary reads (bootstrap/installer-driven only)', () => {
		localStorage.setItem(KEY, 'legacy');
		readEntitySettings('ins-a');
		writeEntitySettings('ins-a', { server: 'http://a' });
		// A read/write must not touch the legacy localStorage key.
		expect(localStorage.getItem(KEY)).toBe('legacy');
	});
});

describe('explorer settings cleared on per-entity sign-out (cross-user leak guard)', () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
	});

	// User A authorizes the explorer, then the entity is disconnected (the path ClusterHome/ClusterCard
	// use, setUserForEntity(entity, null) → setUserForIdAndKey(..., null)); user B must not inherit A's
	// stored credential on the same entity.
	it('a sign-out through setUserForIdAndKey drops the stored explorer credential', async () => {
		const { authStore } = await import('@/features/auth/store/authStore');
		writeEntitySettings('ins-shared', { auth: { type: 'bearer', token: 'user-A-token' } });
		authStore.setUserForIdAndKey('ins-shared', 'ins-shared-fqdn', null);
		expect(readEntitySettings('ins-shared')).toEqual({});
	});

	it('a sign-out bumps the entity auth epoch (guards in-flight mints and cross-tab clears)', async () => {
		const { authStore } = await import('@/features/auth/store/authStore');
		const before = authStore.getExplorerAuthEpoch('ins-epoch');
		authStore.setUserForIdAndKey('ins-epoch', 'ins-epoch-fqdn', null);
		expect(authStore.getExplorerAuthEpoch('ins-epoch')).toBe(before + 1);
	});
});

describe('explorer legacy scrub (exported, re-runnable)', () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
	});

	it('removes the legacy key and re-runs (not one-shot) so a rewritten key is scrubbed again', async () => {
		const { scrubLegacySettings } = await import('@/features/instance/apis/explorer/settings');
		localStorage.setItem(KEY, JSON.stringify({ x: { auth: { type: 'bearer', token: 't' } } }));
		scrubLegacySettings();
		expect(localStorage.getItem(KEY)).toBeNull();
		// A concurrently-open pre-upgrade tab rewrites it; a later scrub removes it again.
		localStorage.setItem(KEY, 'rewritten');
		scrubLegacySettings();
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});
