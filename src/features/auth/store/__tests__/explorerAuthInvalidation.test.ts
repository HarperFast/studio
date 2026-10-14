/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'Studio:ExplorerAuthEpoch';

function signOutElsewhere(generations: Record<string, number>) {
	const raw = JSON.stringify(generations);
	localStorage.setItem(KEY, raw);
	window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: raw }));
}

describe('authStore.onExplorerAuthInvalidated', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('fires only for the entity it was given', () => {
		const mine = vi.fn();
		const stop = authStore.onExplorerAuthInvalidated('ins-a', mine);

		signOutElsewhere({ 'ins-b': 1 });
		expect(mine).not.toHaveBeenCalled();

		signOutElsewhere({ 'ins-b': 1, 'ins-a': 1 });
		expect(mine).toHaveBeenCalledTimes(1);
		stop();
	});

	it('fires for a global logout, which advances every entity', () => {
		const mine = vi.fn();
		const stop = authStore.onExplorerAuthInvalidated('ins-a', mine);
		signOutElsewhere({ '*': 1 });
		expect(mine).toHaveBeenCalledTimes(1);
		stop();
	});

	it('catches a sign-out that lands in the gap before the listener is registered', () => {
		// A revocation dispatched after the baseline read but before `addEventListener` reaches nobody:
		// the event is gone and no later one is coming. Only the re-check performed once subscribed can
		// find it. Staged by signing out from inside `addEventListener`, BEFORE registering for real —
		// registering first would let the event path catch it and prove nothing.
		const mine = vi.fn();
		const realAdd = window.addEventListener.bind(window);
		const spy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
			if (type === 'storage') {
				signOutElsewhere({ 'ins-a': 5 });
			}
			realAdd(type as 'storage', listener as EventListener, options as boolean);
		});

		const stop = authStore.onExplorerAuthInvalidated('ins-a', mine);
		spy.mockRestore();

		expect(mine).toHaveBeenCalledTimes(1);
		stop();
	});

	it('stops firing once unsubscribed', () => {
		const mine = vi.fn();
		authStore.onExplorerAuthInvalidated('ins-a', mine)();
		signOutElsewhere({ 'ins-a': 1 });
		expect(mine).not.toHaveBeenCalled();
	});
});

describe('authStore.signOutAllLocally and the explorer generation', () => {
	type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('moves every entity above its last generation, with one global slot and no entity id', () => {
		localStorage.setItem(KEY, JSON.stringify({ 'ins-a': 4, 'ins-b': 1, '*': 2 }));
		const entities = ['ins-a', 'ins-b', 'ins-never-signed-out'];
		const before = entities.map(id => authStore.getExplorerAuthEpoch(id));

		authStore.signOutAllLocally();

		expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ '*': 7 });
		entities.forEach((id, index) => expect(authStore.getExplorerAuthEpoch(id)).toBeGreaterThan(before[index]));
	});

	it('still moves every entity when an explorer subscriber throws', () => {
		authStore.setUserForIdAndKey('ins-a', 'https://ins-a', { username: 'u' } as SetArgs[2]);
		const failure = new Error('explorer subscriber failed');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const stop = authStore.onExplorerAuthInvalidated('ins-a', () => {
			throw failure;
		});
		const unrelated = authStore.getExplorerAuthEpoch('ins-b');

		expect(() => authStore.signOutAllLocally()).not.toThrow();
		stop();

		expect(consoleError).toHaveBeenCalledWith(failure);
		expect(authStore.getExplorerAuthEpoch('ins-b')).toBeGreaterThan(unrelated);
	});

	it('still collapses the record when a teardown step throws', () => {
		authStore.setUserForIdAndKey('ins-a', 'https://ins-a', { username: 'u' } as SetArgs[2]);
		localStorage.setItem(KEY, JSON.stringify({ 'ins-a': 1 }));
		const failure = new Error('teardown failed');
		const signOutLocally = vi.spyOn(authStore, 'signOutLocally').mockImplementation(() => {
			throw failure;
		});

		expect(() => authStore.signOutAllLocally()).toThrow(failure);
		signOutLocally.mockRestore();

		expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ '*': 2 });
		authStore.signOutAllLocally();
	});
});
