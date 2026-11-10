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

type SignUpBrowserProof = {
	proof: string;
	email: string;
	expiresAt: number;
};

type SignUpBrowserProofs = Record<string, SignUpBrowserProof>;

function addressKey(email: string): string {
	return email.trim().toLowerCase();
}

function isSignUpBrowserProof(value: unknown): value is SignUpBrowserProof {
	const record = value as Partial<SignUpBrowserProof> | null;
	return typeof record?.proof === 'string' && !!record.proof && typeof record.email === 'string'
		&& typeof record.expiresAt === 'number';
}

function readProofs(now: number): SignUpBrowserProofs {
	let stored: unknown;
	try {
		stored = getLocalStorage<unknown>(LocalStorageKeys.SignUpBrowserProof, null);
	} catch (error) {
		console.debug('Could not read the sign-up browser proofs:', error);
		return {};
	}
	const proofs: SignUpBrowserProofs = {};
	if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
		for (const [key, value] of Object.entries(stored)) {
			if (isSignUpBrowserProof(value) && value.expiresAt > now) {
				proofs[key] = value;
			}
		}
	}
	return proofs;
}

function writeProofs(proofs: SignUpBrowserProofs): void {
	try {
		setLocalStorage(LocalStorageKeys.SignUpBrowserProof, Object.keys(proofs).length ? proofs : null);
	} catch (error) {
		// Private browsing or a full quota: verifying then asks for the password instead.
		console.debug('Could not write the sign-up browser proofs:', error);
	}
}

/**
 * Keeps the first unexpired proof for an address: a repeat sign-up finds the account already there, so its
 * proof is a throwaway, and replacing the first would make this browser type the password after all.
 */
export function storeSignUpBrowserProof(proof: string, email: string, now = Date.now()): void {
	const proofs = readProofs(now);
	const key = addressKey(email);
	if (proofs[key]) {
		return;
	}
	writeProofs({ ...proofs, [key]: { proof, email, expiresAt: now + SIGN_UP_BROWSER_PROOF_TTL_MS } });
}

/**
 * The most recent sign-up's proof. A verification link doesn't say whose account it is, so this is the
 * best guess; central-manager's answer names the account, and `readSignUpBrowserProofFor` finds its own.
 */
export function readNewestSignUpBrowserProof(now = Date.now()): SignUpBrowserProof | null {
	let newest: SignUpBrowserProof | null = null;
	for (const proof of Object.values(readProofs(now))) {
		if (!newest || proof.expiresAt > newest.expiresAt) {
			newest = proof;
		}
	}
	return newest;
}

export function readSignUpBrowserProofFor(email: string, now = Date.now()): SignUpBrowserProof | null {
	return readProofs(now)[addressKey(email)] ?? null;
}

/** Also drops every expired proof, never another address's live one. */
export function clearSignUpBrowserProof(email: string | undefined, now = Date.now()): void {
	const proofs = readProofs(now);
	if (email !== undefined) {
		delete proofs[addressKey(email)];
	}
	writeProofs(proofs);
}
