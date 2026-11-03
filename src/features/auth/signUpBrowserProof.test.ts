/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearSignUpBrowserProof,
	readSignUpBrowserProof,
	SIGN_UP_BROWSER_PROOF_TTL_MS,
	storeSignUpBrowserProof,
} from './signUpBrowserProof';

const NOW = 1_800_000_000_000;

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('signUpBrowserProof', () => {
	it('reads back what it stored until it expires a day later', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);

		const stored = { proof: 'proof-1', email: 'ada@example.com', expiresAt: NOW + SIGN_UP_BROWSER_PROOF_TTL_MS };
		expect(readSignUpBrowserProof(NOW)).toEqual(stored);
		expect(readSignUpBrowserProof(NOW + SIGN_UP_BROWSER_PROOF_TTL_MS - 1)).toEqual(stored);
		expect(readSignUpBrowserProof(NOW + SIGN_UP_BROWSER_PROOF_TTL_MS)).toBeNull();
	});

	// A repeat sign-up finds the account already there, so central-manager's proof for it is a throwaway.
	it('keeps the first proof for an address over a repeat sign-up’s', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);
		storeSignUpBrowserProof('proof-2', ' Ada@Example.com', NOW + 1_000);

		expect(readSignUpBrowserProof(NOW + 1_000)).toMatchObject({
			proof: 'proof-1',
			expiresAt: NOW + SIGN_UP_BROWSER_PROOF_TTL_MS,
		});
	});

	it('replaces an expired proof for the same address', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);
		const later = NOW + SIGN_UP_BROWSER_PROOF_TTL_MS;
		storeSignUpBrowserProof('proof-2', 'ada@example.com', later);

		expect(readSignUpBrowserProof(later)).toMatchObject({ proof: 'proof-2' });
	});

	it('replaces the proof for another address', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);
		storeSignUpBrowserProof('proof-2', 'grace@example.com', NOW);

		expect(readSignUpBrowserProof(NOW)).toMatchObject({ proof: 'proof-2', email: 'grace@example.com' });
	});

	it.each([
		['malformed JSON', '{not json'],
		['an empty proof', JSON.stringify({ proof: '', email: 'ada@example.com', expiresAt: NOW + 1 })],
		['no expiry', JSON.stringify({ proof: 'proof-1', email: 'ada@example.com' })],
		['a bare string', JSON.stringify('proof-1')],
	])('reads %s as none', (_case, raw) => {
		localStorage.setItem('SignUpBrowserProof', raw);

		expect(readSignUpBrowserProof(NOW)).toBeNull();
	});

	it('clears it', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);
		clearSignUpBrowserProof();

		expect(localStorage.getItem('SignUpBrowserProof')).toBeNull();
	});

	it('reads none, and stores and clears nothing, without throwing, when storage refuses', () => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
			vi.spyOn(Storage.prototype, method).mockImplementation(() => {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			});
		}

		expect(readSignUpBrowserProof(NOW)).toBeNull();
		expect(() => storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW)).not.toThrow();
		expect(() => clearSignUpBrowserProof()).not.toThrow();
		expect(console.debug).toHaveBeenCalled();
	});
});
