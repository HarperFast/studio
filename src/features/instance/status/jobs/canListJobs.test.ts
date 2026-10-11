import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canListJobs } from './canListJobs';

const gate = vi.hoisted(() => ({ inert: true }));

vi.mock('@/features/instance/config/roles/operations/operationsCatalog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/features/instance/config/roles/operations/operationsCatalog')>();
	return {
		...actual,
		isGrantGateInert: (name: string) =>
			name === 'search_jobs_by_start_date' ? gate.inert : actual.isGrantGateInert(name),
	};
});

const perm = (value: Record<string, unknown>) => value as unknown as LocalRolePermission;

afterEach(() => {
	gate.inert = true;
});

describe('canListJobs', () => {
	it('is undecided while the permission is still loading', () => {
		expect(canListJobs(undefined)).toBeUndefined();
	});

	it('allows a super user', () => {
		expect(canListJobs(perm({ super_user: true }))).toBe(true);
	});

	it('denies a role with neither super_user nor an allowlist', () => {
		expect(canListJobs(perm({ super_user: false, data: { tables: {} } }))).toBe(false);
	});

	it('denies a listed grant while the role catalog calls it inert', () => {
		expect(canListJobs(perm({ operations: ['search_jobs_by_start_date'] }))).toBe(false);
	});

	describe('once the catalog no longer calls the grant inert', () => {
		it('allows an allowlist that lists the operation', () => {
			gate.inert = false;
			expect(canListJobs(perm({ operations: ['read_only', 'search_jobs_by_start_date'] }))).toBe(true);
		});

		it('denies an allowlist that does not list it', () => {
			gate.inert = false;
			expect(canListJobs(perm({ operations: ['read_only'] }))).toBe(false);
		});

		it('denies an absent or malformed allowlist instead of reading it as unrestricted', () => {
			gate.inert = false;
			expect(canListJobs(perm({}))).toBe(false);
			expect(canListJobs(perm({ operations: 'search_jobs_by_start_date' }))).toBe(false);
			expect(canListJobs(perm({ operations: { tables: {} } }))).toBe(false);
		});
	});
});
