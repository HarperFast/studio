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
 * block exists, and `set_configuration` writes leaves only, so nothing it accepts removes a block.
 */
const MCP_ENABLED_FLAG_MIN_VERSION = '5.4.0-alpha.2';

/** The first tagged build whose built-in agent takes its tools from the operations part's list (harper 37a043854). */
const MCP_AGENT_SHARES_LIST_MIN_VERSION = '5.2.0-alpha.6';

const MCP_DEFAULT_MOUNT_PATH = '/mcp';

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
const DEFAULT_ONLY_EXCLUSIONS: ReadonlySet<string> = new Set([
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
]);

export function isMcpDefaultOnlyExclusion(name: string): boolean {
	return DEFAULT_ONLY_EXCLUSIONS.has(name);
}

export type McpPart = 'operations' | 'application';

export interface McpPartState {
	configured: boolean;
	/** Whether Harper serves this part after its next restart. */
	on: boolean;
	mountPath: string;
}

export interface McpStoredList {
	allow?: readonly string[];
	deny?: readonly string[];
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
export function isMcpOperationIncluded(name: string, { allow, deny }: McpStoredList): boolean {
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
	/** Names, or `*` patterns written elsewhere. */
	added: string[];
	/** Everything in `deny` except the default-only exclusions Studio maintains itself. */
	removed: string[];
}

function sortedUnique(entries: Iterable<string>): string[] {
	return [...new Set(entries)].sort();
}

export function readMcpCommandList({ allow, deny }: McpStoredList): McpCommandList {
	const explicit = allow ?? [];
	if (explicit.length === 0 && deny?.includes('*')) {
		// How `writeMcpCommandList` stores a list emptied of everything: no defaults, nothing added.
		return { includesDefaults: false, added: [], removed: sortedUnique(deny.filter((entry) => entry !== '*')) };
	}
	const includesDefaults = explicit.length === 0 || MCP_DEFAULT_ALLOW.every((entry) => explicit.includes(entry));
	const added = includesDefaults ? explicit.filter((entry) => !MCP_DEFAULT_ALLOW.includes(entry)) : [...explicit];
	const named = new Set(added);
	return {
		includesDefaults,
		added: sortedUnique(added),
		// A default-only exclusion the list also names is the customer's to keep, not Studio's.
		removed: sortedUnique((deny ?? []).filter((entry) => !DEFAULT_ONLY_EXCLUSIONS.has(entry) || named.has(entry))),
	};
}

export function writeMcpCommandList({ includesDefaults, added, removed }: McpCommandList): {
	allow: string[];
	deny: string[];
} {
	const extra = sortedUnique(added);
	if (extra.length === 0) {
		// Harper reads an empty `allow` as its default set, so a list emptied of everything has to deny it all.
		return { allow: [], deny: sortedUnique(includesDefaults ? removed : ['*', ...removed]) };
	}
	const allow = includesDefaults ? [...MCP_DEFAULT_ALLOW, ...extra] : extra;
	const named = new Set(extra);
	const kept = [...DEFAULT_ONLY_EXCLUSIONS].filter((name) => !named.has(name) && matchesMcpPattern(name, allow));
	return { allow, deny: sortedUnique([...removed, ...kept]) };
}

function patternsOf(entries: readonly string[]): string {
	return sortedUnique(entries.filter((entry) => entry.includes('*'))).join('\n');
}

/**
 * Whether two stored lists give the same commands. Not a text comparison: Studio's write of a list read from
 * elsewhere can differ in order and still give the same commands, and the same text can give different ones once
 * Studio adds the default-only exclusions. The patterns themselves must match, since one sample name per pattern
 * can't prove two different patterns equal; beyond that it compares the answers for every name either list
 * mentions, every exclusion, and a sample name per pattern.
 */
export function sameMcpCommandAccess(a: McpStoredList, b: McpStoredList): boolean {
	const effectiveAllow = ({ allow }: McpStoredList) => allow?.length ? allow : MCP_DEFAULT_ALLOW;
	if (
		patternsOf(effectiveAllow(a)) !== patternsOf(effectiveAllow(b))
		|| patternsOf(a.deny ?? []) !== patternsOf(b.deny ?? [])
	) {
		return false;
	}
	const entries = [...(a.allow ?? []), ...(a.deny ?? []), ...(b.allow ?? []), ...(b.deny ?? []), ...MCP_DEFAULT_ALLOW];
	const probes = new Set([
		...DEFAULT_ONLY_EXCLUSIONS,
		...entries.filter((entry) => !entry.includes('*')),
		...entries.filter((entry) => entry.includes('*')).map((pattern) => pattern.replace(/\*/g, 'zz')),
	]);
	return [...probes].every((name) => isMcpOperationIncluded(name, a) === isMcpOperationIncluded(name, b));
}

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
 * The flat `set_configuration` parameters that move a cluster from `saved` (one member's answer) to `draft`, or
 * `undefined` when nothing changes. `canDisable` says every member honors `mcp.<part>.enabled`; without it,
 * writing any key under a part creates its block on a member that has none, which turns the part on there, so a
 * change that could leave a part on against the draft throws instead. `listLocked` leaves the command list as it is.
 */
export function buildMcpConfigWrite(
	saved: McpState,
	draft: McpDraft,
	{ canDisable, listLocked = false }: { canDisable: boolean; listLocked?: boolean },
): Record<string, unknown> | undefined {
	const write: Record<string, unknown> = {};
	const needsFlag = (what: string) =>
		new Error(`${what} needs every instance on Harper ${MCP_ENABLED_FLAG_MIN_VERSION} or later.`);

	const parts: Array<[McpPart, boolean, McpPartState]> = [
		['operations', draft.operationsOn, saved.operations],
		['application', draft.applicationOn, saved.application],
	];
	for (const [part, wanted, state] of parts) {
		if (wanted && !state.on) {
			if (!canDisable && state.configured) {
				// Only the flag keeps a present block off, and an instance without the flag can't be sent one.
				throw needsFlag(`Turning the MCP ${part} part back on`);
			}
			if (!state.configured) {
				write[`mcp_${part}_mountPath`] = state.mountPath;
			}
			if (canDisable) {
				write[`mcp_${part}_enabled`] = true;
			}
		} else if (!wanted && state.on) {
			if (!canDisable) {
				throw needsFlag(`Turning the MCP ${part} part off`);
			}
			write[`mcp_${part}_enabled`] = false;
		}
	}

	const stored = writeMcpCommandList(draft.commands);
	if (!listLocked && !sameMcpCommandAccess(stored, saved.operations)) {
		if (!canDisable && !draft.operationsOn) {
			throw needsFlag('Changing the commands while the MCP operations part is off');
		}
		write.mcp_operations_allow = stored.allow;
		write.mcp_operations_deny = stored.deny;
		if (canDisable) {
			// `saved` is one member's answer; a member with no block would otherwise turn the part on.
			write.mcp_operations_enabled = draft.operationsOn;
		}
	}

	return Object.keys(write).length > 0 ? write : undefined;
}
