import { describe, expect, it } from 'vitest';
import { ENTERPRISE, isUnrestrictedOrgType, SELF_SERVICE, UNRESTRICTED } from './orgType';

// The one place both spellings are reconciled. Every paywall branch in studio reads this, so a
// value the backend treats as unrestricted but studio does not would demand a card the server
// never asks for.
describe('isUnrestrictedOrgType', () => {
	it('treats UNRESTRICTED and its legacy alias ENTERPRISE identically', () => {
		expect(isUnrestrictedOrgType(UNRESTRICTED)).toBe(true);
		expect(isUnrestrictedOrgType(ENTERPRISE)).toBe(true);
	});

	it('is false for self-service and for an absent type', () => {
		expect(isUnrestrictedOrgType(SELF_SERVICE)).toBe(false);
		expect(isUnrestrictedOrgType(undefined)).toBe(false);
		expect(isUnrestrictedOrgType(null)).toBe(false);
	});
});
