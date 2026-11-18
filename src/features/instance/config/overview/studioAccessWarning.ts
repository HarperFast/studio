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

/**
 * A warning when the change would stop the operations API answering Studio's own origin. Studio reaches an instance
 * either through central manager or straight at the instance, and only the second needs CORS, so this warns rather
 * than refuses.
 */
export function describeStudioAccessWarnings(
	draft: ConfigObject,
	changes: readonly ConfigChange[],
	origin: string,
): string[] {
	if (!touches(changes, CORS) && !touches(changes, CORS_ACCESS_LIST)) {
		return [];
	}
	const consequence = 'If Studio connects to the instance directly, it loses access after the restart.';
	if (getIn(draft, CORS) === false) {
		return [`This turns off CORS for the operations API. ${consequence}`];
	}
	const accessList = getIn(draft, CORS_ACCESS_LIST);
	if (accessList === undefined || corsAccessListAllows(accessList, origin)) {
		return [];
	}
	return [`The operations API's CORS access list no longer includes ${origin}, where this Studio runs. ${consequence}`];
}
