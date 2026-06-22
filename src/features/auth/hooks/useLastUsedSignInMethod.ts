import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { setLocalStorage } from '@/lib/storage/setLocalStorage';
import { useCallback } from 'react';

export type SignInMethod = 'google' | 'github';

/**
 * Remembers which OAuth provider was last used to sign in so we can surface a "Last used" badge
 * on the matching button. Backed entirely by local storage — the value never leaves the device.
 *
 * Privacy: recording is gated behind a `remember` flag (default on) that the user can switch off
 * from the sign-in page, e.g. when on a shared computer. Disabling also forgets the stored method.
 */
export function useLastUsedSignInMethod() {
	const [remember, setRemember] = useLocalStorage<boolean>(LocalStorageKeys.RememberSignInMethod, true);
	const [lastUsed, setLastUsed] = useLocalStorage<SignInMethod | null>(LocalStorageKeys.LastUsedSignInMethod, null);

	/**
	 * Persist the chosen method synchronously. The OAuth buttons navigate away on click, so we
	 * cannot rely on `useLocalStorage`'s effect-based write to flush before the redirect.
	 */
	const recordMethod = useCallback(
		(method: SignInMethod) => {
			if (remember) {
				setLocalStorage(LocalStorageKeys.LastUsedSignInMethod, method);
			}
		},
		[remember],
	);

	const disable = useCallback(() => {
		setLastUsed(null);
		setRemember(false);
	}, [setLastUsed, setRemember]);

	const enable = useCallback(() => {
		setRemember(true);
	}, [setRemember]);

	return {
		// When remembering is off there is nothing to show, regardless of any stale stored value.
		lastUsed: remember ? lastUsed : null,
		remember,
		recordMethod,
		disable,
		enable,
	};
}
