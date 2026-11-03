import { getLocalStorage } from '@/lib/storage/getLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { setLocalStorage } from '@/lib/storage/setLocalStorage';

/**
 * central-manager's answer to who chose a new account's password (central-manager#781): every sign-up 202
 * carries one in this header, and only the request that set the password stored its hash. Kept here, the
 * verification link signs in without asking for the password again; any other browser has to type it.
 */
export const SIGN_UP_BROWSER_PROOF_HEADER = 'x-signup-browser-proof';

export const SIGN_UP_BROWSER_PROOF_TTL_MS = 24 * 60 * 60 * 1000;

export type SignUpBrowserProof = {
	proof: string;
	email: string;
	expiresAt: number;
};

function isSignUpBrowserProof(value: unknown): value is SignUpBrowserProof {
	const record = value as Partial<SignUpBrowserProof> | null;
	return typeof record?.proof === 'string' && !!record.proof && typeof record.email === 'string'
		&& typeof record.expiresAt === 'number';
}

function sameAddress(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The stored proof, unless it has expired. Storage that throws reads as none: the page asks for the password. */
export function readSignUpBrowserProof(now = Date.now()): SignUpBrowserProof | null {
	try {
		const stored = getLocalStorage<unknown>(LocalStorageKeys.SignUpBrowserProof, null);
		return isSignUpBrowserProof(stored) && stored.expiresAt > now ? stored : null;
	} catch (error) {
		console.debug('Could not read the sign-up browser proof:', error);
		return null;
	}
}

/**
 * Keeps the first unexpired proof for an address: a repeat sign-up finds the account already there, so its
 * proof is a throwaway, and replacing the first would make this browser type the password after all.
 */
export function storeSignUpBrowserProof(proof: string, email: string, now = Date.now()): void {
	const stored = readSignUpBrowserProof(now);
	if (stored && sameAddress(stored.email, email)) {
		return;
	}
	try {
		setLocalStorage<SignUpBrowserProof>(LocalStorageKeys.SignUpBrowserProof, {
			proof,
			email,
			expiresAt: now + SIGN_UP_BROWSER_PROOF_TTL_MS,
		});
	} catch (error) {
		// Private browsing or a full quota: verifying then asks for the password instead.
		console.debug('Could not store the sign-up browser proof:', error);
	}
}

export function clearSignUpBrowserProof(): void {
	try {
		setLocalStorage(LocalStorageKeys.SignUpBrowserProof, null);
	} catch (error) {
		console.debug('Could not clear the sign-up browser proof:', error);
	}
}
