import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * The settings Fabric's host manager gives a hosted instance, read from host-manager `src/templates/compose.yaml` and
 * `src/helpers/{agentConfig,wafConfig}.js` at origin/main `2ea9e25` (2026-11-18). Keep this file in step with them:
 * nothing reads them at runtime. DESIGN.md next to this file says how each one reaches Harper.
 */

/** How Fabric puts a value back. Both run at every start, so a change made with `set_configuration` doesn't last. */
type FabricSetSource = 'HARPER_SET_CONFIG' | 'environment';

interface FabricSetSetting {
	path: string;
	source: FabricSetSource;
	variable?: string;
	belowVersion?: string;
	note?: string;
}

interface FabricDefaultSetting {
	path: string;
	value?: unknown;
	/** Said instead of `value` when the value differs per instance. */
	valueDescription?: string;
	minVersion?: string;
	note?: string;
}

const SET_CONFIG: FabricSetSetting[] = [
	'threads.count',
	'tls',
	'operationsApi.sysInfo.disk',
	'operationsApi.network.http2',
	'logging.stdStreams',
	'logging.file',
	'logging.path',
	'logging.colors',
	'logging.external.path',
	'logging.external.stdStreams',
	'analytics.replicate',
].map(path => ({ path, source: 'HARPER_SET_CONFIG' }));

const ENVIRONMENT: FabricSetSetting[] = (
	[
		['OPERATIONSAPI_NETWORK_PORT', 'operationsApi.network.port'],
		['OPERATIONSAPI_NETWORK_SECUREPORT', 'operationsApi.network.securePort'],
		['OPERATIONSAPI_NETWORK_TIMEOUT', 'operationsApi.network.timeout'],
		['HTTP_PORT', 'http.port'],
		['HTTP_SECUREPORT', 'http.securePort'],
		['HTTP_KEEPALIVETIMEOUT', 'http.keepAliveTimeout'],
		['THREADS_DEBUG_HOST', 'threads.debug.host'],
		['THREADS_DEBUG_STARTINGPORT', 'threads.debug.startingPort'],
		['THREADS_MAXHEAPMEMORY', 'threads.maxHeapMemory'],
		['LOGGING_ROTATION_ENABLED', 'logging.rotation.enabled'],
		['LOGGING_ROTATION_MAXSIZE', 'logging.rotation.maxSize'],
		['LOGGING_ROTATION_COMPRESS', 'logging.rotation.compress'],
		['REPLICATION_HOSTNAME', 'replication.hostname'],
		['REPLICATION_SECUREPORT', 'replication.securePort'],
		['REPLICATION_ENABLEROOTCAS', 'replication.enableRootCAs'],
		['NODE_HOSTNAME', 'node.hostname'],
		['AUTHENTICATION_COOKIE_DOMAINS', 'authentication.cookie.domains'],
		['LICENSE_REGION', 'license.region'],
		['TLS_CERTIFICATEAUTHORITY', 'tls.certificateAuthority'],
		['STORAGE_RECLAMATION_THRESHOLD', 'storage.reclamation.threshold'],
		['STORAGE_ROCKS_BLOCKCACHESIZE', 'storage.rocks.blockCacheSize'],
		['STORAGE_ROCKS_WRITEBUFFERMANAGERSIZE', 'storage.rocks.writeBufferManagerSize'],
		['STORAGE_ROCKS_WRITEBUFFERMANAGERCOSTTOCACHE', 'storage.rocks.writeBufferManagerCostToCache'],
		['STORAGE_ROCKS_WRITEBUFFERMANAGERALLOWSTALL', 'storage.rocks.writeBufferManagerAllowStall'],
	] as const
).map(([variable, path]) => ({ path, source: 'environment', variable }));

const VERSION_GATED_SET: FabricSetSetting[] = [
	// From 5.3 host manager merges its entries into the file instead, and leaves the customer's alone.
	{ path: 'models', source: 'HARPER_SET_CONFIG', belowVersion: '5.3.0' },
];

const FABRIC_SET: FabricSetSetting[] = [...SET_CONFIG, ...ENVIRONMENT, ...VERSION_GATED_SET];

const FABRIC_CORS_DEFAULT = "Harper Fabric's and Studio's addresses";
const AGENT_HOST_NOTE =
	'A host can turn the built-in agent off for every instance on it, and then Fabric sets this to false at every start.';

const FABRIC_DEFAULTS: FabricDefaultSetting[] = [
	{ path: 'logging.external.level', value: 'info' },
	{ path: 'logging.external.console', value: true },
	{ path: 'http.corsAccessList', valueDescription: FABRIC_CORS_DEFAULT },
	{ path: 'operationsApi.network.corsAccessList', valueDescription: FABRIC_CORS_DEFAULT },
	{ path: 'agent.enabled', value: true, minVersion: '5.2.0', note: AGENT_HOST_NOTE },
	{ path: 'agent.autoApprove', value: false, minVersion: '5.2.0' },
	{ path: 'agent.allowDestructive', value: false, minVersion: '5.2.0' },
	{ path: 'agent.maxTurns', value: 12, minVersion: '5.2.0' },
	{ path: 'waf.enabled', value: true, minVersion: '5.2.0' },
	{ path: 'waf.region', valueDescription: "the instance's region", minVersion: '5.2.0' },
	{ path: 'waf.nodeTags', value: ['fabric'], minVersion: '5.2.0' },
];

export interface FabricContext {
	/** False in Local Studio and on a self-managed cluster, where host manager sets nothing. */
	hosted: boolean;
	version?: string;
}

function atLeast(version: string, floor: string) {
	return wasAReleasedBeforeB(floor, version);
}

function splitPath(path: string | readonly string[]): readonly string[] {
	return typeof path === 'string' ? path.split('.') : path;
}

// Harper looks a setting up without regard to case (`CONFIG_PARAM_MAP`, harper `utility/hdbTerms.ts`).
function startsWith(path: readonly string[], prefix: readonly string[]) {
	return prefix.length <= path.length && prefix.every((part, i) => part.toLowerCase() === path[i].toLowerCase());
}

/**
 * The Fabric setting that covers `path`: the same setting, one it sits inside (`tls.certificate` under `tls`), or, with
 * `includeChildren`, one inside it (a change that replaces all of `logging` replaces `logging.file`).
 */
export function fabricSetSettingFor(
	path: string | readonly string[],
	context: FabricContext,
	{ includeChildren = false }: { includeChildren?: boolean } = {},
): FabricSetSetting | undefined {
	if (!context.hosted) {
		return undefined;
	}
	const parts = splitPath(path);
	return FABRIC_SET.find(setting => {
		// An unknown version is treated as the stricter case: a refusal names its reason, a lost change doesn't.
		if (setting.belowVersion && context.version && atLeast(context.version, setting.belowVersion)) {
			return false;
		}
		const settingParts = setting.path.split('.');
		return startsWith(parts, settingParts) || (includeChildren && startsWith(settingParts, parts));
	});
}

export function fabricDefaultFor(
	path: string | readonly string[],
	context: FabricContext,
): FabricDefaultSetting | undefined {
	if (!context.hosted) {
		return undefined;
	}
	const joined = splitPath(path).join('.');
	return FABRIC_DEFAULTS.find(setting =>
		setting.path === joined
		// A default only shows where Harper is known to take it: saying so where it doesn't would be wrong.
		&& (!setting.minVersion || (!!context.version && atLeast(context.version, setting.minVersion)))
	);
}

export function fabricSetSettings(context: FabricContext): FabricSetSetting[] {
	return context.hosted ? FABRIC_SET.filter(setting => fabricSetSettingFor(setting.path, context) === setting) : [];
}

export function fabricDefaultSettings(context: FabricContext): FabricDefaultSetting[] {
	return FABRIC_DEFAULTS.filter(setting => fabricDefaultFor(setting.path, context) === setting);
}

export function describeFabricSetSetting(setting: FabricSetSetting): string {
	const how = setting.source === 'environment'
		? `the ${setting.variable} environment variable`
		: 'HARPER_SET_CONFIG';
	return `Fabric sets this every time the instance starts (through ${how}), so a change here would be undone at the next restart.`;
}

export function describeFabricDefault(setting: FabricDefaultSetting): string {
	const value = setting.valueDescription ?? JSON.stringify(setting.value);
	return `Fabric starts this at ${value}. You can change it, and your value is kept.${
		setting.note ? ` ${setting.note}` : ''
	}`;
}
