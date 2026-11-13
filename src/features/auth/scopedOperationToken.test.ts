import { isScopedOperationToken } from '@/features/auth/scopedOperationToken';
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
