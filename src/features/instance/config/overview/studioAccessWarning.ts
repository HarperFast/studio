import { type ConfigChange, type ConfigObject, getIn } from './configDraft';

/** Harper's single-label wildcard origin, `https://*.example.com` (harper `utility/corsAccessList.ts`). */
const WILDCARD_ORIGIN = /^([a-z][a-z0-9+.-]*:\/\/)\*(\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?)$/i;
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

/** Mirrors harper's `corsAccessListAllows`: a string is a list of one, and an empty or missing list allows nothing. */
export function corsAccessListAllows(accessList: unknown, origin: string): boolean {
	const entries = typeof accessList === 'string' ? [accessList] : Array.isArray(accessList) ? accessList : [];
	return entries.some(entry => {
		if (typeof entry !== 'string') { return false; }
		if (entry === '*' || entry === origin) { return true; }
		const wildcard = WILDCARD_ORIGIN.exec(entry);
		if (!wildcard) { return false; }
		const [, prefix, suffix] = wildcard;
		const lower = origin.toLowerCase();
		if (!lower.startsWith(prefix.toLowerCase()) || !lower.endsWith(suffix.toLowerCase())) { return false; }
		return LABEL.test(lower.slice(prefix.length, lower.length - suffix.length));
	});
}

const CORS = ['operationsApi', 'network', 'cors'];
const CORS_ACCESS_LIST = ['operationsApi', 'network', 'corsAccessList'];

function touches(changes: readonly ConfigChange[], path: readonly string[]) {
	return changes.some(change => path.every((part, i) => change.path[i] === part) && change.path.length === path.length);
}

// Harper fills `operationsApi.network` from `http` (`flattenConfig`, harper `config/configUtils.ts`), and its default
// config always has that section (`static/defaultConfig.yaml`), even where Studio hides all of it.
function effective(draft: ConfigObject, path: readonly string[]): { value: unknown; path: readonly string[] } {
	const own = getIn(draft, path);
	if (own !== undefined) { return { value: own, path }; }
	const inherited = ['http', path[path.length - 1]];
	return { value: getIn(draft, inherited), path: inherited };
}

/**
 * The operations server's own rule (`getCORSOpts`, harper `server/operationsServer.ts`): no list, an empty one, or
 * one that starts with null or '*' registers CORS with `origin: true`, which answers every origin.
 */
function allowsEveryOrigin(list: unknown): boolean {
	if (typeof list === 'string') { return list === '' || list.startsWith('*'); }
	return !Array.isArray(list) || list.length === 0 || list[0] === null || list[0] === '*';
}

/**
 * A warning when the change would stop the operations API answering Studio's own origin, or would open it to every
 * origin by clearing a list that limited it. Studio reaches an instance
 * either through central manager or straight at the instance, and only the second needs CORS, so this warns rather
 * than refuses.
 */
export function describeStudioAccessWarnings(
	draft: ConfigObject,
	changes: readonly ConfigChange[],
	origin: string,
): string[] {
	const cors = effective(draft, CORS);
	const accessList = effective(draft, CORS_ACCESS_LIST);
	if (!touches(changes, cors.path) && !touches(changes, accessList.path)) {
		return [];
	}
	const consequence = 'If Studio connects to the instance directly, it loses access after the restart.';
	if (cors.value === false) {
		return [`This turns off CORS for the operations API. ${consequence}`];
	}
	if (allowsEveryOrigin(accessList.value)) {
		const before = changes.find(change => change.path.join('.') === accessList.path.join('.'))?.before;
		const wildcard = Array.isArray(accessList.value) ? accessList.value[0] === '*' : accessList.value === '*';
		return !wildcard && before !== undefined && !allowsEveryOrigin(before)
			? [`With this list empty, the operations API answers requests from every origin, not only the ones it listed.`]
			: [];
	}
	if (corsAccessListAllows(accessList.value, origin)) {
		return [];
	}
	return [`The operations API's CORS access list no longer includes ${origin}, where this Studio runs. ${consequence}`];
}
