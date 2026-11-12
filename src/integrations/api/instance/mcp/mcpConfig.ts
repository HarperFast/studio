import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * Harper's built-in MCP server (HarperFast/studio#2011). Two parts, each turned on by the presence of its block
 * under `mcp` in Harper's config — `mcp.operations` (admin commands as tools, on the operations port) and
 * `mcp.application` (exported tables and resources as tools, on the application port). Harper source:
 * `components/mcp/index.ts` (`registerMcpProfile`, `handleApplication`), `validation/configValidator.ts`.
 */

/** The first tagged build carrying the MCP transport and the `harper mcp` CLI (harper `components/mcp/`, `bin/mcp/`). */
export const MCP_MIN_VERSION = '5.1.0-beta.1';

/**
 * The first tagged build that honors `mcp.<part>.enabled` (harper 199e53603). Before it a part is on whenever its
 * block exists, and `set_configuration` can only write leaves, never remove a block: `mcp`, `mcp_operations` and
 * `mcp_operations_enabled` are all refused as unrecognized parameters (verified on 5.3.6). So below this version a
 * part Studio turns on cannot be turned off again from Studio.
 */
export const MCP_ENABLED_FLAG_MIN_VERSION = '5.4.0-alpha.2';

/** The first tagged build whose built-in agent takes its tools from the operations part's list (harper 37a043854). */
export const MCP_AGENT_SHARES_LIST_MIN_VERSION = '5.2.0-alpha.6';

export const MCP_DEFAULT_MOUNT_PATH = '/mcp';

export function supportsMcp(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(MCP_MIN_VERSION, version);
}

export function supportsMcpEnabledFlag(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(MCP_ENABLED_FLAG_MIN_VERSION, version);
}

export function agentSharesMcpOperationsList(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(MCP_AGENT_SHARES_LIST_MIN_VERSION, version);
}

/**
 * The read-only set the operations part serves when `allow` is absent or empty (harper
 * `components/mcp/tools/operations.ts` `DEFAULT_ALLOW`, the same from 5.1.0 to 5.4). Entries use `*` globs.
 */
export const MCP_DEFAULT_ALLOW: readonly string[] = [
	'describe_*',
	'list_*',
	'search_*',
	'get_job',
	'get_status',
	'get_analytics',
	'get_metrics',
	'system_information',
	'read_log',
	'read_audit_log',
];

/**
 * Commands Harper keeps out of the DEFAULT set only (`DEFAULT_EXCLUDED`: secrets from 5.2, OIDC trust policies from
 * 5.3, PR previews from 5.4). An explicit `allow` list is not filtered by it, so copying `list_*` into one would
 * expose `list_secrets` and `list_oidc_trust`. Studio denies these whenever it writes an explicit list, unless the
 * customer adds one by name. A command the instance does not have is denied harmlessly.
 */
export const MCP_DEFAULT_ONLY_EXCLUSIONS: readonly string[] = [
	'set_secret',
	'grant_secret',
	'revoke_secret',
	'list_secrets',
	'delete_secret',
	'get_secrets_public_key',
	'add_oidc_trust',
	'list_oidc_trust',
	'drop_oidc_trust',
	'exchange_oidc_token',
	'enable_previews',
	'disable_previews',
	'fence_preview_releases',
	'get_preview_policy',
];

const DEFAULT_ONLY_EXCLUSIONS = new Set(MCP_DEFAULT_ONLY_EXCLUSIONS);

export type McpPart = 'operations' | 'application';

export interface McpPartState {
	/** Whether the block exists in the config at all. */
	configured: boolean;
	/** Whether Harper serves this part after its next restart. */
	on: boolean;
	mountPath: string;
}

export interface McpOperationsState extends McpPartState {
	allow: string[] | undefined;
	deny: string[] | undefined;
}

export interface McpState {
	operations: McpOperationsState;
	application: McpPartState;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function asStringList(value: unknown): string[] | undefined {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function readPart(block: unknown, version: string | undefined): McpPartState {
	const record = asRecord(block);
	// Harper's own test is `!profileConfig`; a scalar block is on with every setting at its default.
	const present = block !== undefined && block !== null && block !== false;
	// Below the flag's version `enabled` is not part of the schema, so `enabled: false` there leaves the part on.
	const disabled = supportsMcpEnabledFlag(version) && record?.enabled === false;
	const mountPath = typeof record?.mountPath === 'string' && record.mountPath.startsWith('/')
		? record.mountPath
		: MCP_DEFAULT_MOUNT_PATH;
	return { configured: present, on: present && !disabled, mountPath };
}

/** Reads the `mcp` block of a `get_configuration` answer, as the given Harper version interprets it. */
export function readMcpState(configuration: unknown, version: string | undefined): McpState {
	const mcp = asRecord(asRecord(configuration)?.mcp);
	const operationsBlock = asRecord(mcp?.operations);
	return {
		operations: {
			...readPart(mcp?.operations, version),
			allow: asStringList(operationsBlock?.allow),
			deny: asStringList(operationsBlock?.deny),
		},
		application: readPart(mcp?.application, version),
	};
}

function globToRegExp(pattern: string): RegExp {
	return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
}

export function matchesMcpPattern(name: string, patterns: readonly string[] | undefined): boolean {
	return !!patterns?.some((pattern) => globToRegExp(pattern).test(name));
}

/** Harper's `isOperationAllowed` (`components/mcp/tools/operations.ts`), against a stored allow/deny pair. */
export function isMcpOperationIncluded(
	name: string,
	{ allow, deny }: { allow?: readonly string[]; deny?: readonly string[] },
): boolean {
	const usingDefault = !allow || allow.length === 0;
	if (usingDefault && DEFAULT_ONLY_EXCLUSIONS.has(name)) {
		return false;
	}
	return matchesMcpPattern(name, usingDefault ? MCP_DEFAULT_ALLOW : allow) && !matchesMcpPattern(name, deny);
}

/**
 * The operations part's command list as the customer edits it: Harper's defaults (normally kept), commands added
 * on top, and commands removed. A list written elsewhere without every default entry is kept as it is
 * (`includesDefaults: false`) rather than quietly widened back to the defaults.
 */
export interface McpCommandList {
	includesDefaults: boolean;
	/** Entries beyond the defaults (names, or `*` patterns written elsewhere). */
	added: string[];
	/** Entries in `deny`, other than the default-only exclusions Studio maintains itself. */
	removed: string[];
}

function sortedUnique(entries: Iterable<string>): string[] {
	return [...new Set(entries)].sort();
}

export function readMcpCommandList({ allow, deny }: Pick<McpOperationsState, 'allow' | 'deny'>): McpCommandList {
	const explicit = allow ?? [];
	const includesDefaults = explicit.length === 0 || MCP_DEFAULT_ALLOW.every((entry) => explicit.includes(entry));
	const added = includesDefaults ? explicit.filter((entry) => !MCP_DEFAULT_ALLOW.includes(entry)) : [...explicit];
	const named = new Set(added);
	return {
		includesDefaults,
		added: sortedUnique(added),
		// A default-only exclusion is Studio's to maintain, unless the list also names it, where it is the customer's.
		removed: sortedUnique((deny ?? []).filter((entry) => !DEFAULT_ONLY_EXCLUSIONS.has(entry) || named.has(entry))),
	};
}

/** The `allow`/`deny` pair that stores a command list. */
export function writeMcpCommandList({ includesDefaults, added, removed }: McpCommandList): {
	allow: string[];
	deny: string[];
} {
	const extra = sortedUnique(added);
	if (includesDefaults && extra.length === 0) {
		// An empty `allow` is Harper's default set, with its exclusions; there is nothing to add to `deny`.
		return { allow: [], deny: sortedUnique(removed) };
	}
	const allow = includesDefaults ? [...MCP_DEFAULT_ALLOW, ...extra] : extra;
	const named = new Set(extra);
	const kept = MCP_DEFAULT_ONLY_EXCLUSIONS.filter((name) => !named.has(name) && matchesMcpPattern(name, allow));
	return { allow, deny: sortedUnique([...removed, ...kept]) };
}

export function mcpCommandListsEqual(a: McpCommandList, b: McpCommandList): boolean {
	const x = writeMcpCommandList(a);
	const y = writeMcpCommandList(b);
	return JSON.stringify(x) === JSON.stringify(y);
}

/** What the customer asks for; compared with the saved {@link McpState} to build a write. */
export interface McpDraft {
	operationsOn: boolean;
	applicationOn: boolean;
	commands: McpCommandList;
}

export function draftFromMcpState(state: McpState): McpDraft {
	return {
		operationsOn: state.operations.on,
		applicationOn: state.application.on,
		commands: readMcpCommandList(state.operations),
	};
}

/**
 * The flat `set_configuration` parameters that move an instance from `saved` to `draft`, or `undefined` when
 * nothing changes. Throws when the change needs `mcp.<part>.enabled` and `canDisable` says the instance lacks it:
 * there, writing any key under a part creates its block, which turns the part on.
 */
export function buildMcpConfigWrite(
	saved: McpState,
	draft: McpDraft,
	{ canDisable }: { canDisable: boolean },
): Record<string, unknown> | undefined {
	const write: Record<string, unknown> = {};

	const turnOn = (part: McpPart, state: McpPartState) => {
		if (!state.configured) {
			write[`mcp_${part}_mountPath`] = state.mountPath;
		}
		if (canDisable) {
			// A block holding `enabled: false` stays off until the flag says otherwise.
			write[`mcp_${part}_enabled`] = true;
		}
	};
	const turnOff = (part: McpPart) => {
		if (!canDisable) {
			throw new Error(`Turning the MCP ${part} part off needs Harper ${MCP_ENABLED_FLAG_MIN_VERSION} or later.`);
		}
		write[`mcp_${part}_enabled`] = false;
	};

	const parts: Array<[McpPart, boolean, McpPartState]> = [
		['operations', draft.operationsOn, saved.operations],
		['application', draft.applicationOn, saved.application],
	];
	for (const [part, wanted, state] of parts) {
		if (wanted && !state.on) {
			turnOn(part, state);
		} else if (!wanted && state.on) {
			turnOff(part);
		}
	}

	if (!mcpCommandListsEqual(draft.commands, readMcpCommandList(saved.operations))) {
		const { allow, deny } = writeMcpCommandList(draft.commands);
		write.mcp_operations_allow = allow;
		write.mcp_operations_deny = deny;
		if (!draft.operationsOn && !saved.operations.configured) {
			// Writing the list creates the block, and a present block is on unless it says otherwise.
			if (!canDisable) {
				throw new Error(
					`Changing the commands while the MCP operations part is off needs Harper ${MCP_ENABLED_FLAG_MIN_VERSION} or later.`,
				);
			}
			write.mcp_operations_enabled = false;
		}
	}

	return Object.keys(write).length > 0 ? write : undefined;
}
