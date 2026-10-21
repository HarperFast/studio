import { describe, expect, it } from 'vitest';
import { formatHours, isStaffTokenRole, STAFF_TOKEN_LIFETIMES, STAFF_TOKEN_ROLES } from './staffTokenRoles';

describe('STAFF_TOKEN_LIFETIMES', () => {
	// The numbers central-manager enforces (STAFF_API_TOKEN_LIFETIMES): a form that disagreed would
	// either ask for a lifetime the server refuses or hide one it allows.
	it.each(
		[
			['fabric_readonly', 336, 336],
			['fabric_support', 168, 168],
			['fabric_staff', 168, 168],
			['fabric_admin', 12, 1],
		] as const,
	)('%s: at most %i hours, %i by default', (role, maxHours, defaultHours) => {
		expect(STAFF_TOKEN_LIFETIMES[role]).toEqual({ maxHours, defaultHours });
	});

	it('covers every role the picker offers, with the default within the cap', () => {
		for (const role of STAFF_TOKEN_ROLES) {
			const { maxHours, defaultHours } = STAFF_TOKEN_LIFETIMES[role];
			expect(defaultHours).toBeGreaterThanOrEqual(1);
			expect(defaultHours).toBeLessThanOrEqual(maxHours);
		}
	});

	it('offers least privilege first', () => {
		expect(STAFF_TOKEN_ROLES[0]).toBe('fabric_readonly');
	});
});

describe('isStaffTokenRole', () => {
	it('accepts the four staff roles and nothing else', () => {
		expect(isStaffTokenRole('fabric_admin')).toBe(true);
		expect(isStaffTokenRole('super_user')).toBe(false);
		expect(isStaffTokenRole(undefined)).toBe(false);
	});
});

describe('formatHours', () => {
	it.each([
		[336, '14 days'],
		[24, '1 day'],
		[12, '12 hours'],
		[1, '1 hour'],
		[36, '36 hours'],
	])('%i → %s', (hours, label) => {
		expect(formatHours(hours)).toBe(label);
	});
});
