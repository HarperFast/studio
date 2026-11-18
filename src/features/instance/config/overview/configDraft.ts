import { stableJson } from '@/lib/stableJson';
import { isHiddenConfigPath, isRestrictedConfigPath, RESTRICTED_CONFIG } from './configRestrictions';
import { describeFabricSetSetting, type FabricContext, fabricSetSettingFor } from './fabricManagedConfig';

export type ConfigObject = Record<string, unknown>;

export interface ConfigChange {
	path: readonly string[];
	before: unknown;
	after: unknown;
}

interface RefusedChange extends ConfigChange {
	reason: 'removed' | 'empty' | 'studio' | 'fabric';
	message: string;
}

export function isPlainObject(value: unknown): value is ConfigObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sameConfigValue(a: unknown, b: unknown): boolean {
	// `stableJson` writes `undefined` as `null`, and an absent setting is not a null one.
	if (a === b || a === undefined || b === undefined) {
		return a === b;
	}
	return stableJson(a) === stableJson(b);
}

export function getIn(config: unknown, path: readonly string[]): unknown {
	let current = config;
	for (const part of path) {
		if (!isPlainObject(current) || !Object.hasOwn(current, part)) {
			return undefined;
		}
		current = current[part];
	}
	return current;
}

export function setIn(config: ConfigObject, path: readonly string[], value: unknown): ConfigObject {
	if (path.length === 0) {
		return isPlainObject(value) ? value : config;
	}
	const [head, ...rest] = path;
	const next: ConfigObject = { ...config };
	if (rest.length === 0) {
		if (value === undefined) {
			delete next[head];
		} else {
			next[head] = value;
		}
		return next;
	}
	const child = Object.hasOwn(config, head) && isPlainObject(config[head]) ? config[head] : {};
	const updated = setIn(child, rest, value);
	// Clearing a setting takes the sections it emptied with it, rather than leaving `{}` behind.
	if (value === undefined && Object.keys(updated).length === 0) {
		delete next[head];
	} else {
		next[head] = updated;
	}
	return next;
}

/**
 * Every setting that differs, one entry per leaf: objects are compared key by key, and anything else (arrays
 * included) as a whole. A section added or removed whole lists each of its settings.
 */
export function listConfigChanges(before: unknown, after: unknown, path: readonly string[] = []): ConfigChange[] {
	if (before === after) { return []; }
	const beforeIsSection = isPlainObject(before) || (before === undefined && isPlainObject(after));
	const afterIsSection = isPlainObject(after) || (after === undefined && isPlainObject(before));
	if (beforeIsSection && afterIsSection) {
		if (before === undefined && path.length > 0 && Object.keys(after as ConfigObject).length === 0) {
			// Listed so it can be refused: an empty object added on its own would otherwise vanish without a word.
			return [{ path, before, after }];
		}
		const beforeObject = isPlainObject(before) ? before : {};
		const afterObject = isPlainObject(after) ? after : {};
		const keys = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]);
		return [...keys].flatMap(key =>
			listConfigChanges(
				Object.hasOwn(beforeObject, key) ? beforeObject[key] : undefined,
				Object.hasOwn(afterObject, key) ? afterObject[key] : undefined,
				[...path, key],
			)
		);
	}
	return sameConfigValue(before, after) ? [] : [{ path, before, after }];
}

/**
 * What Harper stores for a value it is sent: `castConfigValue`, harper `config/configUtils.ts` (`is-number` then
 * `parseFloat`, booleans, `undefined`/`null`, JSON-looking text). Anything but a string is stored as sent.
 */
export function storedByHarper(value: unknown): unknown {
	if (typeof value !== 'string') { return value; }
	if (value.trim() !== '' && Number.isFinite(Number(value))) { return Number.parseFloat(value); }
	const lower = value.toLowerCase();
	if (lower === 'true' || lower === 'false') { return lower === 'true'; }
	if (lower === 'undefined' || value === 'null' || value === 'NULL') { return null; }
	if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	return value;
}

export function rebaseDraft(oldBase: ConfigObject, draft: ConfigObject, newBase: ConfigObject): ConfigObject {
	return listConfigChanges(oldBase, draft).reduce((rebased, change) => {
		// An edit Harper stored as another type (`"3600"` as 3600) has landed, though it reads back differently.
		const sent = isPlainObject(change.after) ? listConfigChanges(undefined, change.after, change.path) : [change];
		const landed = sent.length > 0
			&& sent.every(leaf => sameConfigValue(getIn(newBase, leaf.path), storedByHarper(leaf.after)));
		return landed ? rebased : setIn(rebased, change.path, change.after);
	}, newBase);
}

/** Whether `path` names a section that holds restricted settings, so replacing it whole replaces them too. */
function holdsRestrictedSettings(path: readonly string[]) {
	let current: unknown = RESTRICTED_CONFIG;
	for (const part of path) {
		if (!isPlainObject(current) || !Object.hasOwn(current, part)) {
			return false;
		}
		current = current[part];
	}
	return isPlainObject(current) || current === 'blocked_except_databases';
}

function holdsEmptyObject(value: unknown): boolean {
	return isPlainObject(value) && (Object.keys(value).length === 0 || Object.values(value).some(holdsEmptyObject));
}

function refusalFor(
	change: ConfigChange,
	context: FabricContext,
): Pick<RefusedChange, 'reason' | 'message'> | undefined {
	// Harper reads `_` in a key as nesting, so a root key `http_keepAliveTimeout` sets `http.keepAliveTimeout`.
	const spelled = change.path.flatMap(part => part.split('_'));
	const fabric = fabricSetSettingFor(spelled, context, { includeChildren: true });
	if (fabric) {
		return { reason: 'fabric', message: describeFabricSetSetting(fabric) };
	}
	if (
		isRestrictedConfigPath(change.path.join('.'), change.after, change.before)
		|| (spelled.length > change.path.length && isHiddenConfigPath(spelled))
		|| (holdsRestrictedSettings(change.path) && !isPlainObject(change.after))
	) {
		return { reason: 'studio', message: 'Studio does not change this setting.' };
	}
	return undefined;
}

export function findRefusedChanges(changes: readonly ConfigChange[], context: FabricContext): RefusedChange[] {
	return changes.flatMap((change): RefusedChange[] => {
		const sent = isPlainObject(change.after) ? listConfigChanges(undefined, change.after, change.path) : [change];
		const refusal = sent.map(leaf => refusalFor(leaf, context)).find(Boolean);
		if (refusal) {
			return [{ ...change, ...refusal }];
		}
		if (sent.length === 0 || (isPlainObject(change.after) && holdsEmptyObject(change.after))) {
			// `set_configuration` takes settings one by one, so an empty object would send nothing and still restart.
			return [{
				...change,
				reason: 'empty',
				message: "Studio can't save an empty object. Give it a setting, or put it back.",
			}];
		}
		if (change.after === undefined) {
			return [{
				...change,
				reason: 'removed',
				message: "Studio can't remove a setting, only set one. Put it back, or give it the value you want.",
			}];
		}
		return [];
	});
}

export function toSetConfigurationParams(changes: readonly ConfigChange[]): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	const add = (path: readonly string[], value: unknown) => {
		if (isPlainObject(value)) {
			for (const [key, child] of Object.entries(value)) {
				add([...path, key], child);
			}
		} else if (value !== undefined) {
			params[path.join('_')] = value;
		}
	};
	for (const change of changes) {
		add(change.path, change.after);
	}
	return params;
}
