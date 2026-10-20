import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { canListJobs } from './canListJobs';

const perm = (value: Record<string, unknown>) => value as unknown as LocalRolePermission;
const listing = perm({ operations: ['read_only', 'search_jobs_by_start_date'] });

describe('canListJobs', () => {
	it('is undecided while the permission is still loading', () => {
		expect(canListJobs(undefined, '5.3.2')).toBeUndefined();
	});

	it('allows a super user, whatever the version', () => {
		expect(canListJobs(perm({ super_user: true }), undefined)).toBe(true);
		expect(canListJobs(perm({ super_user: true }), '5.2.9')).toBe(true);
	});

	it('denies a role with neither super_user nor an allowlist', () => {
		expect(canListJobs(perm({ super_user: false, data: { tables: {} } }), '5.3.2')).toBe(false);
	});

	it('denies an allowlist that does not list it', () => {
		expect(canListJobs(perm({ operations: ['read_only'] }), '5.3.2')).toBe(false);
	});

	it('denies an absent or malformed allowlist instead of reading it as unrestricted', () => {
		expect(canListJobs(perm({}), '5.3.2')).toBe(false);
		expect(canListJobs(perm({ operations: 'search_jobs_by_start_date' }), '5.3.2')).toBe(false);
		expect(canListJobs(perm({ operations: { tables: {} } }), '5.3.2')).toBe(false);
	});

	describe('an allowlist that lists it', () => {
		it('is allowed from 5.3.0-beta.3, where Harper first honours the grant', () => {
			expect(canListJobs(listing, '5.3.0-beta.3')).toBe(true);
			expect(canListJobs(listing, '5.3.2')).toBe(true);
		});

		it('is denied on a version whose gate cannot match it', () => {
			expect(canListJobs(listing, '5.2.9')).toBe(false);
			expect(canListJobs(listing, '5.3.0-beta.2')).toBe(false);
		});

		it('waits for the version', () => {
			expect(canListJobs(listing, undefined)).toBeUndefined();
		});

		it('is tried when the version cannot be read, rather than refused for good', () => {
			expect(canListJobs(listing, null)).toBe(true);
		});
	});
});
