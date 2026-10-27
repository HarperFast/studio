import { checkExtensionAccess, checkPageRequest } from '@/features/instance/extensions/access';
import { resolveClusterUrl } from '@/features/instance/extensions/dataSource';
import type { ExtensionAccess } from '@/features/instance/extensions/manifest';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

const table = (read: boolean, write: boolean) => ({
	read,
	insert: write,
	update: write,
	delete: write,
	attribute_permissions: [],
});

const superUser: LocalRolePermission = { super_user: true };
const reader: LocalRolePermission = { super_user: false, redirects: { tables: { Rule: table(true, false) } } };
const writer: LocalRolePermission = { super_user: false, redirects: { tables: { Rule: table(true, true) } } };

describe('checkExtensionAccess', () => {
	it('denies while the role is still loading', () => {
		expect(checkExtensionAccess(undefined, undefined).allowed).toBe(false);
	});

	it('admits any signed-in role when nothing is declared', () => {
		expect(checkExtensionAccess({ super_user: false }, undefined).allowed).toBe(true);
	});

	it('checks a super_user requirement', () => {
		const access: ExtensionAccess = { role: 'super_user' };
		expect(checkExtensionAccess(superUser, access).allowed).toBe(true);
		expect(checkExtensionAccess(writer, access)).toEqual({ allowed: false, missing: ['super user'] });
	});

	it('checks each declared table grant and names what is missing', () => {
		const access: ExtensionAccess = { tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'insert'] }] };
		expect(checkExtensionAccess(writer, access).allowed).toBe(true);
		expect(checkExtensionAccess(reader, access)).toEqual({ allowed: false, missing: ['insert on redirects.Rule'] });
	});

	it('admits a non-super role to an extra operation only through its allowlist', () => {
		const access: ExtensionAccess = { operations: ['restart_service'] };
		expect(checkExtensionAccess(writer, access).allowed).toBe(false);
		expect(checkExtensionAccess({ ...writer, operations: ['restart_service'] }, access).allowed).toBe(true);
		expect(checkExtensionAccess(superUser, access).allowed).toBe(true);
	});
});

describe('checkPageRequest', () => {
	const access: ExtensionAccess = {
		tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'insert'] }],
		endpoints: ['/Redirect/'],
	};

	it('refuses an undeclared operation even for a super user', () => {
		expect(checkPageRequest(superUser, access, { operation: 'drop_table', database: 'redirects', table: 'Rule' }))
			.toEqual({ allowed: false, reason: 'the drop_table operation is not declared by this page' });
	});

	it('refuses table DML the page did not declare', () => {
		expect(checkPageRequest(superUser, access, { operation: 'delete', database: 'redirects', table: 'Rule' }).allowed)
			.toBe(false);
	});

	it("allows declared DML only when the viewer's role can do it", () => {
		const insert = { operation: 'insert', database: 'redirects', table: 'Rule', records: [] };
		expect(checkPageRequest(writer, access, insert).allowed).toBe(true);
		expect(checkPageRequest(reader, access, insert)).toEqual({
			allowed: false,
			reason: 'your role cannot insert redirects.Rule',
		});
	});

	it('scopes REST calls to the declared endpoints', () => {
		expect(checkPageRequest(reader, access, { rest: { method: 'GET', path: '/Redirect/123' } }).allowed).toBe(true);
		expect(checkPageRequest(reader, access, { rest: { method: 'GET', path: '/Other/' } }).allowed).toBe(false);
	});

	it.each(['/Redirect/../Other/', '/Redirect/%2e%2e/Other/', '/Redirect/.%2E/Other/', '//evil.example/Redirect/'])(
		'refuses %j, which leaves the declared endpoint once resolved',
		(path) => {
			expect(checkPageRequest(superUser, access, { rest: { method: 'DELETE', path } }).allowed).toBe(false);
		},
	);

	it('refuses sql on a declared table, since its statement can reach any table', () => {
		const sql = { operation: 'sql', database: 'redirects', table: 'Rule', sql: 'DELETE FROM data.User' };
		expect(checkPageRequest(superUser, access, sql)).toEqual({
			allowed: false,
			reason: 'the sql operation is not declared by this page',
		});
	});

	it('reads a table request through the schema alias, and refuses one naming two databases', () => {
		const viaSchema = { operation: 'search_by_value', schema: 'other', table: 'Rule' };
		expect(checkPageRequest(superUser, access, viaSchema).allowed).toBe(false);
		expect(checkPageRequest(writer, access, { ...viaSchema, schema: 'redirects' }).allowed).toBe(true);
		expect(checkPageRequest(superUser, access, { ...viaSchema, database: 'redirects' })).toEqual({
			allowed: false,
			reason: 'search_by_value names two different databases',
		});
	});
});

describe('resolveClusterUrl', () => {
	it('resolves a path on the application URL', () => {
		expect(resolveClusterUrl('/Redirect/1', 'https://cluster.example.com').toString())
			.toBe('https://cluster.example.com/Redirect/1');
	});

	it.each(['//evil.example/x', 'https://evil.example/x', '/\t/evil.example/x'])('refuses %j', (path) => {
		expect(() => resolveClusterUrl(path, 'https://cluster.example.com')).toThrow(/not on this cluster/);
	});

	it('refuses when the cluster has no application URL', () => {
		expect(() => resolveClusterUrl('/x', null)).toThrow(/no application URL/);
	});
});
