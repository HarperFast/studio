// @vitest-environment jsdom
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLastUsedSignInMethod } from './useLastUsedSignInMethod';

function clearKeys() {
	window.localStorage.removeItem(LocalStorageKeys.LastUsedSignInMethod);
	window.localStorage.removeItem(LocalStorageKeys.RememberSignInMethod);
}

beforeEach(clearKeys);
afterEach(clearKeys);

describe('useLastUsedSignInMethod', () => {
	it('defaults to remembering with no method recorded yet', () => {
		const { result } = renderHook(() => useLastUsedSignInMethod());
		expect(result.current.remember).toBe(true);
		expect(result.current.lastUsed).toBeNull();
	});

	it('persists the chosen method synchronously when remembering is on', () => {
		const { result } = renderHook(() => useLastUsedSignInMethod());
		act(() => result.current.recordMethod('github'));
		// Written straight to storage so it survives the OAuth redirect navigation.
		expect(window.localStorage.getItem(LocalStorageKeys.LastUsedSignInMethod)).toBe('"github"');
		// ...and reflected immediately in the hook state.
		expect(result.current.lastUsed).toBe('github');
	});

	it('does not record the method when remembering is disabled', () => {
		window.localStorage.setItem(LocalStorageKeys.RememberSignInMethod, 'false');
		const { result } = renderHook(() => useLastUsedSignInMethod());
		act(() => result.current.recordMethod('google'));
		expect(window.localStorage.getItem(LocalStorageKeys.LastUsedSignInMethod)).toBeNull();
		expect(result.current.lastUsed).toBeNull();
	});

	it('disable() forgets the stored method and stops remembering', () => {
		window.localStorage.setItem(LocalStorageKeys.LastUsedSignInMethod, '"google"');
		const { result } = renderHook(() => useLastUsedSignInMethod());
		expect(result.current.lastUsed).toBe('google');

		act(() => result.current.disable());
		expect(result.current.remember).toBe(false);
		expect(result.current.lastUsed).toBeNull();
		expect(window.localStorage.getItem(LocalStorageKeys.LastUsedSignInMethod)).toBeNull();
		expect(window.localStorage.getItem(LocalStorageKeys.RememberSignInMethod)).toBe('false');
	});

	it('enable() turns remembering back on', () => {
		window.localStorage.setItem(LocalStorageKeys.RememberSignInMethod, 'false');
		const { result } = renderHook(() => useLastUsedSignInMethod());
		expect(result.current.remember).toBe(false);

		act(() => result.current.enable());
		expect(result.current.remember).toBe(true);
		expect(window.localStorage.getItem(LocalStorageKeys.RememberSignInMethod)).toBe('true');
	});
});
