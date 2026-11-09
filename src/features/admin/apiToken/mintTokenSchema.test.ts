import { describe, expect, it } from 'vitest';
import { MintTokenSchema, TOKEN_NAME_MAX_LENGTH } from './mintTokenSchema';

const valid = { ownerUserId: 'usr-1', role: 'fabric_readonly', name: 'nightly report', expiresInHours: 336 } as const;

function errorsOf(values: unknown): Record<string, string[]> {
	const result = MintTokenSchema.safeParse(values);
	if (result.success) { return {}; }
	const errors: Record<string, string[]> = {};
	for (const issue of result.error.issues) {
		const key = issue.path.join('.');
		(errors[key] ??= []).push(issue.message);
	}
	return errors;
}

describe('MintTokenSchema', () => {
	it('accepts a lifetime at the role cap and trims the name', () => {
		const result = MintTokenSchema.safeParse({ ...valid, name: '  nightly report  ' });
		expect(result.success).toBe(true);
		expect(result.data?.name).toBe('nightly report');
	});

	// The cap is the role's, not a fixed number: the same 336 hours is fine for read-only and
	// far over the line for admin.
	it.each(
		[
			['fabric_readonly', 337],
			['fabric_support', 169],
			['fabric_staff', 169],
			['fabric_admin', 13],
		] as const,
	)('refuses %s above its cap (%i hours)', (role, expiresInHours) => {
		expect(errorsOf({ ...valid, role, expiresInHours })).toHaveProperty('expiresInHours');
		expect(errorsOf({ ...valid, role, expiresInHours: expiresInHours - 1 })).toEqual({});
	});

	it('refuses zero, fractional and missing hours', () => {
		expect(errorsOf({ ...valid, expiresInHours: 0 })).toHaveProperty('expiresInHours');
		expect(errorsOf({ ...valid, expiresInHours: 1.5 })).toHaveProperty('expiresInHours');
		expect(errorsOf({ ...valid, expiresInHours: Number.NaN })).toHaveProperty('expiresInHours');
	});

	it('requires an owner, a staff role and a name within the server limit', () => {
		expect(errorsOf({ ...valid, ownerUserId: '' })).toHaveProperty('ownerUserId');
		expect(errorsOf({ ...valid, role: 'super_user' })).toHaveProperty('role');
		expect(errorsOf({ ...valid, name: '   ' })).toHaveProperty('name');
		expect(errorsOf({ ...valid, name: 'x'.repeat(TOKEN_NAME_MAX_LENGTH + 1) })).toHaveProperty('name');
		expect(errorsOf({ ...valid, name: 'x'.repeat(TOKEN_NAME_MAX_LENGTH) })).toEqual({});
	});
});
