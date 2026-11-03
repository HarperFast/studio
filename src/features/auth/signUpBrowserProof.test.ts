/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearSignUpBrowserProof,
	readNewestSignUpBrowserProof,
	readSignUpBrowserProofFor,
	SIGN_UP_BROWSER_PROOF_TTL_MS,
	storeSignUpBrowserProof,
} from './signUpBrowserProof';

const NOW = 1_800_000_000_000;
const TTL = SIGN_UP_BROWSER_PROOF_TTL_MS;

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('signUpBrowserProof', () => {
	it('reads back what it stored until it expires a day later', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);

		const stored = { proof: 'proof-1', email: 'ada@example.com', expiresAt: NOW + TTL };
		expect(readNewestSignUpBrowserProof(NOW)).toEqual(stored);
		expect(readSignUpBrowserProofFor('ada@example.com', NOW + TTL - 1)).toEqual(stored);
		expect(readNewestSignUpBrowserProof(NOW + TTL)).toBeNull();
		expect(readSignUpBrowserProofFor('ada@example.com', NOW + TTL)).toBeNull();
	});

	// A repeat sign-up finds the account already there, so central-manager's proof for it is a throwaway.
	it('keeps the first proof for an address over a repeat sign-up’s', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);
		storeSignUpBrowserProof('proof-2', ' Ada@Example.com', NOW + 1_000);

		expect(readSignUpBrowserProofFor('ADA@example.com', NOW + 1_000)).toMatchObject({
			proof: 'proof-1',
			expiresAt: NOW + TTL,
		});
	});

	it('replaces an expired proof for the same address', () => {
		storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW);
		storeSignUpBrowserProof('proof-2', 'ada@example.com', NOW + TTL);

		expect(readSignUpBrowserProofFor('ada@example.com', NOW + TTL)).toMatchObject({ proof: 'proof-2' });
	});

	it('keeps each address’s proof, and reads the newest as the guess for an unknown link', () => {
		storeSignUpBrowserProof('proof-ada', 'ada@example.com', NOW);
		storeSignUpBrowserProof('proof-grace', 'grace@example.com', NOW + 1_000);

		expect(readNewestSignUpBrowserProof(NOW + 1_000)).toMatchObject({ proof: 'proof-grace' });
		expect(readSignUpBrowserProofFor('ada@example.com', NOW + 1_000)).toMatchObject({ proof: 'proof-ada' });
	});

	it('clears only the address it is given, and drops expired proofs as it goes', () => {
		storeSignUpBrowserProof('proof-old', 'old@example.com', NOW - TTL + 1);
		storeSignUpBrowserProof('proof-ada', 'ada@example.com', NOW);
		storeSignUpBrowserProof('proof-grace', 'grace@example.com', NOW);

		clearSignUpBrowserProof('Ada@example.com', NOW + 1);

		expect(Object.keys(JSON.parse(localStorage.getItem('SignUpBrowserProof') ?? '{}'))).toEqual(['grace@example.com']);
	});

	it('removes the key once nothing is left, and prunes with no address', () => {
		storeSignUpBrowserProof('proof-ada', 'ada@example.com', NOW);

		clearSignUpBrowserProof(undefined, NOW + 1);
		expect(localStorage.getItem('SignUpBrowserProof')).not.toBeNull();

		clearSignUpBrowserProof(undefined, NOW + TTL);
		expect(localStorage.getItem('SignUpBrowserProof')).toBeNull();
	});

	it.each([
		['malformed JSON', '{not json'],
		[
			'an empty proof',
			JSON.stringify({ 'ada@example.com': { proof: '', email: 'ada@example.com', expiresAt: NOW + 1 } }),
		],
		['no expiry', JSON.stringify({ 'ada@example.com': { proof: 'proof-1', email: 'ada@example.com' } })],
		['a bare record', JSON.stringify({ proof: 'proof-1', email: 'ada@example.com', expiresAt: NOW + 1 })],
		['an array', JSON.stringify([{ proof: 'proof-1', email: 'ada@example.com', expiresAt: NOW + 1 }])],
	])('reads %s as none', (_case, raw) => {
		localStorage.setItem('SignUpBrowserProof', raw);

		expect(readNewestSignUpBrowserProof(NOW)).toBeNull();
		expect(readSignUpBrowserProofFor('ada@example.com', NOW)).toBeNull();
	});

	it('reads none, and stores and clears nothing, without throwing, when storage refuses', () => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
			vi.spyOn(Storage.prototype, method).mockImplementation(() => {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			});
		}

		expect(readNewestSignUpBrowserProof(NOW)).toBeNull();
		expect(() => storeSignUpBrowserProof('proof-1', 'ada@example.com', NOW)).not.toThrow();
		expect(() => clearSignUpBrowserProof('ada@example.com', NOW)).not.toThrow();
		expect(console.debug).toHaveBeenCalled();
	});
});
