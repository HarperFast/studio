import { isScopedOperationToken, withScopedTokenRole } from '@/features/auth/scopedOperationToken';
import type { LocalUser } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

const token = (claims: Record<string, unknown>) =>
	[
		'eyJhbGciOiJSUzI1NiJ9',
		btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
		'sig',
	]
		.join('.');

describe('isScopedOperationToken', () => {
	it('is true for a token core minted with an inline role', () => {
		expect(isScopedOperationToken(token({ sub: 'scoped-operation', username: 'fabric-connect:usr-1' }))).toBe(true);
	});

	it('is false for an ordinary operation token', () => {
		expect(isScopedOperationToken(token({ sub: 'operation', username: 'HDB_ADMIN' }))).toBe(false);
	});

	it('is false for anything that is not a token', () => {
		expect(isScopedOperationToken(undefined)).toBe(false);
		expect(isScopedOperationToken('')).toBe(false);
		expect(isScopedOperationToken('not.a-jwt.!!')).toBe(false);
		expect(isScopedOperationToken('opaque')).toBe(false);
	});
});

describe('withScopedTokenRole', () => {
	const permission = { super_user: false, operations: ['describe_all', 'read_log'] };
	// What Harper 5.4's user_info answers for a scoped token's holder: no role at all.
	const scopedUser = { active: true, username: 'fabric-connect:usr-1' } as LocalUser;

	it("takes a scoped token's allowlist from its claims when user_info names no role", () => {
		const user = withScopedTokenRole(scopedUser, token({ sub: 'scoped-operation', role: { permission } }));

		expect(user.role.permission).toEqual(permission);
		expect(user.username).toBe('fabric-connect:usr-1');
	});

	it('keeps a role user_info did name', () => {
		const named = { ...scopedUser, role: { permission: { super_user: true } } } as LocalUser;

		expect(withScopedTokenRole(named, token({ sub: 'scoped-operation', role: { permission } }))).toBe(named);
	});

	it('adds no role from any other token', () => {
		expect(withScopedTokenRole(scopedUser, token({ sub: 'operation', role: { permission } }))).toBe(scopedUser);
		expect(withScopedTokenRole(scopedUser, undefined)).toBe(scopedUser);
	});
});
