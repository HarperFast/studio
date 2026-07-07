import { describe, expect, it } from 'vitest';
import { detectEntityId } from './entityId';

describe('detectEntityId', () => {
	it('detects organization ids', () => {
		expect(detectEntityId('org-qpz5akmyrp1d0opj')).toEqual({ kind: 'organization', id: 'org-qpz5akmyrp1d0opj' });
		expect(detectEntityId('org-1')).toEqual({ kind: 'organization', id: 'org-1' });
	});

	it('detects cluster ids', () => {
		expect(detectEntityId('clu-tc9pqw20vrks2zik')).toEqual({ kind: 'cluster', id: 'clu-tc9pqw20vrks2zik' });
		expect(detectEntityId('clu-1333')).toEqual({ kind: 'cluster', id: 'clu-1333' });
	});

	it('detects instance ids', () => {
		expect(detectEntityId('ins-abc123')).toEqual({ kind: 'instance', id: 'ins-abc123' });
	});

	it('trims surrounding whitespace before matching', () => {
		expect(detectEntityId('  org-1  ')).toEqual({ kind: 'organization', id: 'org-1' });
	});

	it('returns null for titles that merely resemble an id', () => {
		const cases = [
			'',
			'Acme',
			'org', // no body
			'org-', // empty body
			'Org-1', // uppercase prefix is a title, not an id
			'ORG-1',
			'org 1', // space, not a hyphen
			'org-my org', // space in body
			'org-ABC', // uppercase body
			'organization', // no hyphen boundary
			'foo-1', // unknown prefix
			'my-org-1', // prefix not at the start
		];
		for (const value of cases) {
			expect(detectEntityId(value), value).toBeNull();
		}
	});

	it('returns null for non-string input', () => {
		expect(detectEntityId(undefined)).toBeNull();
		expect(detectEntityId(null)).toBeNull();
	});
});
