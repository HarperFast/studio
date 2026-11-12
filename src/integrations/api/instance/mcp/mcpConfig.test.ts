import { describe, expect, it } from 'vitest';
import {
	buildMcpConfigWrite,
	draftFromMcpState,
	isMcpOperationIncluded,
	MCP_DEFAULT_ALLOW,
	McpDraft,
	McpState,
	readMcpCommandList,
	readMcpState,
	supportsMcp,
	supportsMcpEnabledFlag,
	writeMcpCommandList,
} from './mcpConfig';

const V53 = '5.3.6';
const V54 = '5.4.0-beta.4';

function stateOf(mcp: unknown, version = V53): McpState {
	return readMcpState({ mcp }, version);
}

function draft(state: McpState, overrides: Partial<McpDraft>): McpDraft {
	return { ...draftFromMcpState(state), ...overrides };
}

describe('MCP version floors', () => {
	it('starts at the first build with the transport and the CLI', () => {
		expect(supportsMcp('5.0.14')).toBe(false);
		expect(supportsMcp('5.1.0-beta.1')).toBe(true);
		expect(supportsMcp('5.3.6')).toBe(true);
		expect(supportsMcp(undefined)).toBe(false);
	});

	it('honors the enabled flag only from 5.4.0-alpha.2, which alpha.1 predates', () => {
		expect(supportsMcpEnabledFlag('5.3.6')).toBe(false);
		expect(supportsMcpEnabledFlag('5.4.0-alpha.1')).toBe(false);
		expect(supportsMcpEnabledFlag('5.4.0-alpha.2')).toBe(true);
		expect(supportsMcpEnabledFlag('5.4.0')).toBe(true);
	});
});

describe('readMcpState', () => {
	it('reads a missing block as off, at the default mount path', () => {
		expect(readMcpState({}, V53)).toEqual({
			operations: { configured: false, on: false, mountPath: '/mcp', allow: undefined, deny: undefined },
			application: { configured: false, on: false, mountPath: '/mcp' },
		});
	});

	it('reads an empty block as on: presence alone turns a part on', () => {
		const state = stateOf({ operations: {}, application: {} });
		expect(state.operations.on).toBe(true);
		expect(state.application.on).toBe(true);
	});

	it('reads a null block as off, as Harper does', () => {
		expect(stateOf({ operations: null }).operations).toMatchObject({ configured: false, on: false });
	});

	it('reads enabled: false as off only where Harper honors it', () => {
		const block = { operations: { enabled: false } };
		expect(stateOf(block, V54).operations).toMatchObject({ configured: true, on: false });
		// 5.3 does not know the key: the block is present, so the part is on.
		expect(stateOf(block, V53).operations).toMatchObject({ configured: true, on: true });
	});

	it('keeps a custom mount path, and the allow and deny lists', () => {
		const state = stateOf({ operations: { mountPath: '/ai', allow: ['describe_*', 7], deny: ['read_log'] } });
		expect(state.operations).toMatchObject({ mountPath: '/ai', allow: ['describe_*'], deny: ['read_log'] });
	});
});

describe("isMcpOperationIncluded (Harper's isOperationAllowed)", () => {
	it('serves the read-only defaults when allow is absent or empty', () => {
		for (const allow of [undefined, []]) {
			expect(isMcpOperationIncluded('describe_table', { allow })).toBe(true);
			expect(isMcpOperationIncluded('read_log', { allow })).toBe(true);
			expect(isMcpOperationIncluded('insert', { allow })).toBe(false);
			expect(isMcpOperationIncluded('get_configuration', { allow })).toBe(false);
		}
	});

	it('keeps the secrets and trust policy commands out of the default set only', () => {
		expect(isMcpOperationIncluded('list_secrets', {})).toBe(false);
		expect(isMcpOperationIncluded('list_oidc_trust', {})).toBe(false);
		// An explicit allow list is not filtered by Harper's DEFAULT_EXCLUDED.
		expect(isMcpOperationIncluded('list_secrets', { allow: ['list_*'] })).toBe(true);
	});

	it('lets deny remove anything', () => {
		expect(isMcpOperationIncluded('read_log', { deny: ['read_*'] })).toBe(false);
		expect(isMcpOperationIncluded('insert', { allow: ['insert'], deny: ['insert'] })).toBe(false);
	});
});

describe('command lists', () => {
	it('writes the defaults as an empty allow list', () => {
		expect(writeMcpCommandList({ includesDefaults: true, added: [], removed: [] })).toEqual({ allow: [], deny: [] });
		expect(writeMcpCommandList({ includesDefaults: true, added: [], removed: ['read_log'] })).toEqual({
			allow: [],
			deny: ['read_log'],
		});
	});

	it('keeps the defaults when adding a command, and keeps their exclusions out', () => {
		const stored = writeMcpCommandList({ includesDefaults: true, added: ['insert'], removed: [] });
		expect(stored.allow).toEqual([...MCP_DEFAULT_ALLOW, 'insert']);
		expect(stored.deny).toEqual(['list_oidc_trust', 'list_secrets']);
		expect(isMcpOperationIncluded('describe_table', stored)).toBe(true);
		expect(isMcpOperationIncluded('insert', stored)).toBe(true);
		expect(isMcpOperationIncluded('list_secrets', stored)).toBe(false);
		expect(isMcpOperationIncluded('list_oidc_trust', stored)).toBe(false);
	});

	it('lets a command Harper keeps out of the defaults in when it is added by name', () => {
		const stored = writeMcpCommandList({ includesDefaults: true, added: ['list_secrets'], removed: [] });
		expect(stored.deny).toEqual(['list_oidc_trust']);
		expect(isMcpOperationIncluded('list_secrets', stored)).toBe(true);
	});

	it('keeps the exclusions out of an added pattern too', () => {
		const stored = writeMcpCommandList({ includesDefaults: true, added: ['get_*'], removed: [] });
		expect(stored.deny).toEqual(
			expect.arrayContaining(['get_preview_policy', 'get_secrets_public_key', 'list_secrets']),
		);
		expect(isMcpOperationIncluded('get_configuration', stored)).toBe(true);
	});

	it('reads back what it writes', () => {
		const list = { includesDefaults: true, added: ['insert', 'update'], removed: ['read_log'] };
		expect(readMcpCommandList(writeMcpCommandList(list))).toEqual(list);
	});

	it('keeps a list written elsewhere without the defaults as it is', () => {
		const list = readMcpCommandList({ allow: ['describe_table', 'search_by_id'], deny: undefined });
		expect(list).toEqual({ includesDefaults: false, added: ['describe_table', 'search_by_id'], removed: [] });
		expect(writeMcpCommandList(list)).toEqual({ allow: ['describe_table', 'search_by_id'], deny: [] });
	});

	it("shows a default-only exclusion as removed when the list also names it, since it's the customer's", () => {
		const list = readMcpCommandList({ allow: [...MCP_DEFAULT_ALLOW, 'list_secrets'], deny: ['list_secrets'] });
		expect(list.removed).toEqual(['list_secrets']);
	});
});

describe('buildMcpConfigWrite', () => {
	const off = stateOf(undefined, V53);

	it('writes nothing when nothing changes', () => {
		expect(buildMcpConfigWrite(off, draftFromMcpState(off), { canDisable: false })).toBeUndefined();
	});

	it('turns a part on below 5.4 by creating its block with a leaf Harper registers', () => {
		expect(buildMcpConfigWrite(off, draft(off, { operationsOn: true }), { canDisable: false })).toEqual({
			mcp_operations_mountPath: '/mcp',
		});
		expect(buildMcpConfigWrite(off, draft(off, { applicationOn: true }), { canDisable: false })).toEqual({
			mcp_application_mountPath: '/mcp',
		});
	});

	it('also sets enabled where Harper reads it, so a block holding enabled: false comes back on', () => {
		const disabled = stateOf({ operations: { enabled: false, mountPath: '/ai' } }, V54);
		expect(buildMcpConfigWrite(disabled, draft(disabled, { operationsOn: true }), { canDisable: true })).toEqual({
			mcp_operations_enabled: true,
		});
	});

	it('turns a part off with enabled: false', () => {
		const on = stateOf({ application: {} }, V54);
		expect(buildMcpConfigWrite(on, draft(on, { applicationOn: false }), { canDisable: true })).toEqual({
			mcp_application_enabled: false,
		});
	});

	it('refuses to turn a part off where Harper has no way to', () => {
		const on = stateOf({ application: {} }, V53);
		expect(() => buildMcpConfigWrite(on, draft(on, { applicationOn: false }), { canDisable: false })).toThrow(
			'needs Harper 5.4.0-alpha.2 or later',
		);
	});

	it('writes the command list as allow and deny', () => {
		const on = stateOf({ operations: {} });
		const commands = { includesDefaults: true, added: ['insert'], removed: [] };
		expect(buildMcpConfigWrite(on, draft(on, { commands }), { canDisable: false })).toEqual({
			mcp_operations_allow: [...MCP_DEFAULT_ALLOW, 'insert'],
			mcp_operations_deny: ['list_oidc_trust', 'list_secrets'],
		});
	});

	it('keeps the part off when it writes the list of a part that has no block, since presence turns it on', () => {
		const offV54 = stateOf(undefined, V54);
		const commands = { includesDefaults: true, added: [], removed: ['read_log'] };
		expect(buildMcpConfigWrite(offV54, draft(offV54, { commands }), { canDisable: true })).toEqual({
			mcp_operations_allow: [],
			mcp_operations_deny: ['read_log'],
			mcp_operations_enabled: false,
		});
		expect(() => buildMcpConfigWrite(off, draft(off, { commands }), { canDisable: false })).toThrow(
			'while the MCP operations part is off',
		);
	});

	it('leaves enabled alone when the list changes on a block that already holds enabled: false', () => {
		const disabled = stateOf({ operations: { enabled: false } }, V54);
		const commands = { includesDefaults: true, added: [], removed: ['read_log'] };
		expect(buildMcpConfigWrite(disabled, draft(disabled, { commands }), { canDisable: true })).toEqual({
			mcp_operations_allow: [],
			mcp_operations_deny: ['read_log'],
		});
	});

	it('does not count reordering or Studio-kept exclusions as a change', () => {
		const on = stateOf({
			operations: { allow: [...MCP_DEFAULT_ALLOW, 'update', 'insert'], deny: ['list_secrets', 'list_oidc_trust'] },
		});
		expect(buildMcpConfigWrite(on, draftFromMcpState(on), { canDisable: false })).toBeUndefined();
	});
});
