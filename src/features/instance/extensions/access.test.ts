import { OPERATION_CATALOG, OPERATION_GROUPS } from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	checkExtensionAccess,
	checkPageRequest,
	declaredDataSource,
	describePageRequest,
	getTableCapabilities,
	isDeclared,
	isTableWrite,
} from '@/features/instance/extensions/access';
import type { ExtensionDataSource } from '@/features/instance/extensions/dataSource';
import { HARPER_OPERATIONS } from '@/features/instance/extensions/harperOperations';
import type { ExtensionAccess } from '@/features/instance/extensions/manifest';
import { parseStudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import { DEMO_EXTENSIONS } from '@/features/instance/extensions/prototype/demoExtensions';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it, vi } from 'vitest';

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
const inserter: LocalRolePermission = {
	super_user: false,
	redirects: { tables: { Rule: { ...table(true, false), insert: true } } },
};

/** The access a page's declaration parses to. */
function parseAccess(access: unknown): ExtensionAccess | undefined {
	return parseStudioConfiguration({
		pages: [{
			component: 'harper-vault',
			id: 'vault',
			name: 'Vault',
			placement: 'tab',
			access,
			content: { kind: 'sections', sections: [{ type: 'text', body: 'Hi' }] },
		}],
	}).pages[0].access;
}

// The brief's named cases, then one from each corner of the list: DML outside the map, a token op, Pro.
const BUILT_INS = [
	'sql',
	'search',
	'drop_table',
	'alter_role',
	'add_user',
	'deploy_component',
	'set_configuration',
	'put',
	'describe_table',
	'create_authentication_tokens',
	'add_ssh_key',
];

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

	it('denies every role, super users included, a page whose access it could not read, and names it', () => {
		const access = parseAccess({ role: 'super_user', secrets: ['token'] });
		const verdict = {
			allowed: false,
			missing: [],
			problem: "Studio can't read its access.secrets. It may need a newer Studio.",
		};
		expect(checkExtensionAccess(superUser, access)).toEqual(verdict);
		expect(checkExtensionAccess(writer, access)).toEqual(verdict);
		expect(checkExtensionAccess({ super_user: false }, { unreadable: ['access.role', 'access.tables[0]'] }).problem)
			.toBe("Studio can't read its access.role, access.tables[0]. It may need a newer Studio.");
	});

	it.each(BUILT_INS)("denies every role a page that lists Harper's own %s in its operations", (operation) => {
		const access = parseAccess({ operations: ['cache_flush', operation] });
		expect(access).toEqual({ refused: [operation] });
		expect(checkExtensionAccess(superUser, access)).toEqual({
			allowed: false,
			missing: [],
			problem: `It lists ${operation}, one of Harper's own operations, which a page can't send.`,
		});
	});

	it("refuses Harper's own operations under optional too, and names every one", () => {
		const access = parseAccess({ optional: { operations: ['sql', 'cache_flush', 'drop_table'] } });
		expect(access).toEqual({ refused: ['sql', 'drop_table'] });
		expect(checkExtensionAccess(superUser, access).problem)
			.toBe("It lists sql, drop_table, Harper's own operations, which a page can't send.");
	});

	it('shows a page to roles that lack its optional grants, which it still declares', () => {
		const access = parseAccess({
			tables: [{ database: 'redirects', table: 'Rule', actions: ['read'] }],
			optional: {
				tables: [{ database: 'redirects', table: 'Rule', actions: ['insert', 'update', 'delete'] }],
				operations: ['redirect_import'],
			},
		});
		expect(checkExtensionAccess(reader, access)).toEqual({ allowed: true, missing: [] });
		expect(checkExtensionAccess({ super_user: false }, access).allowed).toBe(false);
		expect(isDeclared(access, 'redirects', 'Rule', 'delete')).toBe(true);
		expect(getTableCapabilities(reader, access, 'redirects', 'Rule'))
			.toEqual({ read: true, insert: false, update: false, delete: false });
		expect(getTableCapabilities(writer, access, 'redirects', 'Rule'))
			.toEqual({ read: true, insert: true, update: true, delete: true });
		expect(checkPageRequest(superUser, access, { operation: 'redirect_import' })).toEqual({ allowed: true });
		expect(checkPageRequest(reader, access, { operation: 'redirect_import' }))
			.toEqual({ allowed: false, reason: 'your role cannot run redirect_import' });
	});

	it.each([
		[{ optional: ['x'] }, ['access.optional']],
		[{ optional: { role: 'super_user' } }, ['access.optional.role']],
		[{ optional: { tables: [{ database: 'redirects', table: 'Rule', actions: ['drop'] }] } }, [
			'access.optional.tables[0].actions',
		]],
		[{ optional: { operations: 'cache_flush' } }, ['access.optional.operations']],
	])('denies every role when access.optional is unreadable: %j', (raw, unreadable) => {
		const access = parseAccess(raw);
		expect(access).toEqual({ unreadable });
		expect(checkExtensionAccess(superUser, access).allowed).toBe(false);
	});

	it("still shows the demo pages, which declare what they read, to the roles they're meant for", () => {
		const pages = parseStudioConfiguration({
			pages: DEMO_EXTENSIONS.flatMap((manifest) =>
				manifest.pages.map((page) => ({ ...page, component: manifest.component }))
			),
		}).pages;
		expect(pages.map((page) => checkExtensionAccess(superUser, page.access).allowed)).toEqual([true, true, true]);
		expect(checkExtensionAccess(reader, pages[0].access).allowed).toBe(true);
	});
});

describe('isDeclared and getTableCapabilities', () => {
	const access: ExtensionAccess = { tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'insert'] }] };

	it('reads a grant only for the database, table and action the page lists', () => {
		expect(isDeclared(access, 'redirects', 'Rule', 'read')).toBe(true);
		expect(isDeclared(access, 'redirects', 'Rule', 'update')).toBe(false);
		expect(isDeclared(access, 'redirects', 'Other', 'read')).toBe(false);
		expect(isDeclared(access, 'data', 'Rule', 'read')).toBe(false);
		expect(isDeclared(undefined, 'redirects', 'Rule', 'read')).toBe(false);
	});

	it('declares nothing for access it could not read', () => {
		expect(isDeclared({ ...access, unreadable: ['access.secrets'] }, 'redirects', 'Rule', 'read')).toBe(false);
	});

	it("allows a section only what its page declares and the viewer's role grants", () => {
		expect(getTableCapabilities(superUser, access, 'redirects', 'Rule')).toEqual({
			read: true,
			insert: true,
			update: false,
			delete: false,
		});
		expect(getTableCapabilities(reader, access, 'redirects', 'Rule')).toEqual({
			read: true,
			insert: false,
			update: false,
			delete: false,
		});
		expect(getTableCapabilities(superUser, undefined, 'redirects', 'Rule').read).toBe(false);
	});
});

describe('checkPageRequest', () => {
	const access: ExtensionAccess = {
		tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'insert'] }],
		operations: ['redirect_import'],
	};

	it('refuses an undeclared operation even for a super user', () => {
		expect(checkPageRequest(superUser, access, { operation: 'cache_flush' }))
			.toEqual({ allowed: false, reason: 'the cache_flush operation is not declared by this page' });
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

	it('needs both insert and update, declared and granted, for an upsert', () => {
		const upsert = { operation: 'upsert', database: 'redirects', table: 'Rule', records: [] };
		expect(checkPageRequest(superUser, access, upsert)).toEqual({
			allowed: false,
			reason: 'upsert on redirects.Rule is not declared by this page',
		});
		const both: ExtensionAccess = {
			tables: [{ database: 'redirects', table: 'Rule', actions: ['insert', 'update'] }],
		};
		const updateOnly: ExtensionAccess = { tables: [{ database: 'redirects', table: 'Rule', actions: ['update'] }] };
		expect(checkPageRequest(superUser, updateOnly, upsert).allowed).toBe(false);
		expect(checkPageRequest(inserter, both, upsert)).toEqual({
			allowed: false,
			reason: 'your role cannot update redirects.Rule',
		});
		const updater: LocalRolePermission = {
			super_user: false,
			redirects: { tables: { Rule: { ...table(true, false), update: true } } },
		};
		expect(checkPageRequest(updater, both, upsert)).toEqual({
			allowed: false,
			reason: 'your role cannot insert redirects.Rule',
		});
		expect(checkPageRequest(writer, both, upsert).allowed).toBe(true);
	});

	it("checks a role's operations allowlist for the operation sent, not for each table action's", () => {
		const both: ExtensionAccess = {
			tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'insert', 'update'] }],
		};
		const upsert = { operation: 'upsert', database: 'redirects', table: 'Rule', records: [] };
		// Harper refuses this upsert at the allowlist gate: `insert` and `update` entries grant it nothing.
		expect(checkPageRequest({ ...writer, operations: ['insert', 'update'] }, both, upsert)).toEqual({
			allowed: false,
			reason: 'your role cannot run upsert',
		});
		// And admits this one, though the role lists neither of them.
		expect(checkPageRequest({ ...writer, operations: ['upsert'] }, both, upsert).allowed).toBe(true);
		const search = { operation: 'search_by_value', database: 'redirects', table: 'Rule' };
		expect(checkPageRequest({ ...writer, operations: ['sql'] }, both, search).allowed).toBe(false);
		expect(checkPageRequest({ ...writer, operations: ['search_by_value'] }, both, search).allowed).toBe(true);
	});

	it('allows a declared operation only to a role that may run it', () => {
		const run = { operation: 'redirect_import' };
		expect(checkPageRequest(superUser, access, run).allowed).toBe(true);
		expect(checkPageRequest(writer, access, run)).toEqual({
			allowed: false,
			reason: 'your role cannot run redirect_import',
		});
		expect(checkPageRequest({ ...writer, operations: ['redirect_import'] }, access, run).allowed).toBe(true);
	});

	it.each(BUILT_INS)(
		"refuses Harper's own %s even to a super user, and even when the page lists it",
		(operation) => {
			// Built directly: the parser would deny a page listing it before any request is made.
			const listing: ExtensionAccess = { ...access, operations: [operation] };
			const request = { operation, database: 'redirects', table: 'Rule', sql: 'DELETE FROM data.User' };
			const refusal = {
				allowed: false,
				reason: `${operation} is one of Harper's own operations, which a page can't send`,
			};
			expect(checkPageRequest(superUser, listing, request)).toEqual(refusal);
			expect(checkPageRequest(superUser, access, request)).toEqual(refusal);
		},
	);

	it.each([
		'impersonate',
		'hdb_user',
		'hdbAuthHeader',
		'hdb_auth_header',
		'bypass_auth',
		'bypassAuth',
		'replicateTo',
		'replicatedConfirmation',
		'replicated',
		'expiresAt',
	])('refuses a request that sets %s, naming it', (key) => {
		const reason = `a page's request can't set ${key}`;
		const insert = { operation: 'insert', database: 'redirects', table: 'Rule', records: [], [key]: false };
		expect(checkPageRequest(superUser, access, insert)).toEqual({ allowed: false, reason });
		expect(checkPageRequest(superUser, access, { operation: 'redirect_import', [key]: ['node-1'] }))
			.toEqual({ allowed: false, reason });
	});

	it('looks for those keys only at the top level, where Harper reads them', () => {
		const insert = { operation: 'insert', database: 'redirects', table: 'Rule', records: [{ expiresAt: 1 }] };
		expect(checkPageRequest(superUser, access, insert).allowed).toBe(true);
	});

	it('refuses every request from a page whose access it could not read, even one it otherwise declares', () => {
		const unreadable: ExtensionAccess = { ...access, unreadable: ['access.secrets'] };
		expect(checkPageRequest(superUser, unreadable, { operation: 'redirect_import' })).toEqual({
			allowed: false,
			reason:
				"Studio won't send requests for this page. Studio can't read its access.secrets. It may need a newer Studio.",
		});
		expect(
			checkPageRequest(writer, unreadable, { operation: 'insert', database: 'redirects', table: 'Rule', records: [] })
				.allowed,
		).toBe(false);
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

describe('HARPER_OPERATIONS', () => {
	it("covers every operation the roles editor's catalog and groups name", () => {
		const named = [...OPERATION_CATALOG.map((entry) => entry.name), ...OPERATION_GROUPS.flatMap((g) => g.members)];
		expect(named.filter((name) => !HARPER_OPERATIONS.has(name))).toEqual([]);
	});
});

describe('describing a request for its confirmation', () => {
	it('knows which operations write to the table they name', () => {
		expect(['insert', 'update', 'upsert', 'delete'].map(isTableWrite)).toEqual([true, true, true, true]);
		expect(['search_by_value', 'sql', 'put', 'cache_flush'].map(isTableWrite)).toEqual([false, false, false, false]);
	});

	it('names the table for DML and the operation otherwise', () => {
		expect(describePageRequest({ operation: 'insert', database: 'redirects', table: 'Rule' }))
			.toBe('Studio will send insert to redirects.Rule:');
		expect(describePageRequest({ operation: 'delete', schema: 'redirects', table: 'Rule' }))
			.toBe('Studio will send delete to redirects.Rule:');
		expect(describePageRequest({ operation: 'update', table: 'Rule' })).toBe('Studio will send update to data.Rule:');
		expect(describePageRequest({ operation: 'cache_flush', table: 'Rule' }))
			.toBe('Studio will send the cache_flush operation:');
		expect(describePageRequest({ operation: 'update', database: 'a', schema: 'b', table: 'Rule' }))
			.toBe('Studio will send the update operation:');
	});
});

describe('declaredDataSource', () => {
	const access: ExtensionAccess = { tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'insert'] }] };
	const inner = (): ExtensionDataSource => ({
		id: 'test',
		list: vi.fn(async () => ({ records: [], truncated: false })),
		count: vi.fn(async () => ({ count: 0, bound: 'exact' as const })),
		get: vi.fn(async () => undefined),
		insert: vi.fn(async () => undefined),
		update: vi.fn(async () => undefined),
		remove: vi.fn(async () => undefined),
		send: vi.fn(async () => 'sent'),
	});

	it('keeps the inner id, so cached rows stay shared', () => {
		expect(declaredDataSource(inner(), superUser, access).id).toBe('test');
	});

	it.each(
		[
			['list', (source: ExtensionDataSource, t: string) => source.list('redirects', t, 'id', ['id']), 'reads'],
			['count', (source: ExtensionDataSource, t: string) => source.count('redirects', t), 'reads'],
			['get', (source: ExtensionDataSource, t: string) => source.get('redirects', t, 'id', 'a', ['id']), 'reads'],
			['insert', (source: ExtensionDataSource, t: string) => source.insert('redirects', t, {}, 'id'), 'inserts into'],
		] as const,
	)('passes a declared %s through and refuses one on a table it does not declare', async (method, call, verb) => {
		const source = inner();
		const declared = declaredDataSource(source, superUser, access);
		await call(declared, 'Rule');
		expect(source[method]).toHaveBeenCalledTimes(1);
		await expect(call(declared, 'Secret')).rejects.toThrow(
			`It ${verb} redirects.Secret, which this page doesn't declare.`,
		);
		expect(source[method]).toHaveBeenCalledTimes(1);
	});

	it("passes a record read's projection through", async () => {
		const source = inner();
		await declaredDataSource(source, superUser, access).get('redirects', 'Rule', 'id', 'a', ['id', 'origin']);
		expect(source.get).toHaveBeenCalledWith('redirects', 'Rule', 'id', 'a', ['id', 'origin']);
	});

	// The inner source proves a write by finding this key in Harper's answer, so a wrapper that drops it
	// turns every update into "couldn't confirm" and every insert into the weaker count-only proof.
	it("passes a write's primary key through", async () => {
		const source = inner();
		const declared = declaredDataSource(source, superUser, {
			tables: [{ database: 'redirects', table: 'Rule', actions: ['insert', 'update'] }],
		});
		await declared.insert('redirects', 'Rule', { id: 'a' }, 'id');
		await declared.update('redirects', 'Rule', { id: 'a', origin: 'x' }, 'id');
		expect(source.insert).toHaveBeenCalledWith('redirects', 'Rule', { id: 'a' }, 'id');
		expect(source.update).toHaveBeenCalledWith('redirects', 'Rule', { id: 'a', origin: 'x' }, 'id');
	});

	it.each(
		[
			['update', (source: ExtensionDataSource) => source.update('redirects', 'Rule', { id: 'a' }, 'id'), 'updates'],
			['remove', (source: ExtensionDataSource) => source.remove('redirects', 'Rule', 'a'), 'deletes from'],
		] as const,
	)('refuses a %s the page does not declare', async (method, call, verb) => {
		const source = inner();
		await expect(call(declaredDataSource(source, superUser, access))).rejects.toThrow(
			`It ${verb} redirects.Rule, which this page doesn't declare.`,
		);
		expect(source[method]).not.toHaveBeenCalled();
	});

	it('sends an action only when checkPageRequest allows it', async () => {
		const source = inner();
		const declared = declaredDataSource(source, superUser, access);
		await expect(declared.send({ operation: 'drop_table', database: 'redirects', table: 'Rule' })).rejects.toThrow(
			"drop_table is one of Harper's own operations, which a page can't send",
		);
		expect(source.send).not.toHaveBeenCalled();
		const insert = { operation: 'insert', database: 'redirects', table: 'Rule', records: [] };
		await expect(declared.send(insert)).resolves.toBe('sent');
		expect(source.send).toHaveBeenCalledWith(insert);
	});
});
