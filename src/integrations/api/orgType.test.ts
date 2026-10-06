import { describe, expect, it } from 'vitest';
import {
	billedThroughStripe,
	ENTERPRISE,
	isUnrestrictedOrgType,
	onContractedTerms,
	SELF_SERVICE,
	UNRESTRICTED,
} from './orgType';

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

describe('onContractedTerms', () => {
	const organization = {
		type: UNRESTRICTED,
		clusters: [{ id: 'clu-contract', commercialSource: null }, { id: 'clu-paid', commercialSource: 'purchased' }],
	};

	it("runs an unrestricted organization's clusters on its contract, except one moved onto paid terms", () => {
		expect(onContractedTerms(organization, 'clu-contract')).toBe(true);
		expect(onContractedTerms(organization, 'clu-paid')).toBe(false);
	});

	it('runs a cluster not created yet on the organization terms', () => {
		expect(onContractedTerms(organization)).toBe(true);
		expect(onContractedTerms({ ...organization, type: SELF_SERVICE })).toBe(false);
	});
});

describe('billedThroughStripe', () => {
	it('is always true for a self-service organization', () => {
		expect(billedThroughStripe({ type: SELF_SERVICE, clusters: [] })).toBe(true);
	});

	it('is true for an unrestricted organization only once a cluster of it is or was on paid terms', () => {
		expect(billedThroughStripe({ type: ENTERPRISE, clusters: [{ commercialSource: null }] })).toBe(false);
		expect(billedThroughStripe({ type: ENTERPRISE, clusters: [{ commercialSource: 'purchased' }] })).toBe(true);
		expect(billedThroughStripe({ type: UNRESTRICTED })).toBe(false);
	});
});
