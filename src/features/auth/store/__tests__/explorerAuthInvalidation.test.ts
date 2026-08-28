/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

	it('still revokes within the tab when the epoch write fails', () => {
		// Storage disabled by policy, or full. Nothing durable can be recorded, but a sign-out still has
		// to revoke this tab's explorer credential rather than leaving it comparing as current forever.
		const mine = vi.fn();
		const stop = authStore.onExplorerAuthInvalidated('ins-a', mine);
		const before = authStore.getExplorerAuthEpoch('ins-a');
		const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError');
		});

		authStore.signOutLocally('ins-a');
		setItem.mockRestore();

		expect(authStore.getExplorerAuthEpoch('ins-a')).toBe(before + 1);
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
