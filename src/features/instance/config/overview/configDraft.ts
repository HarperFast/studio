import { stableJson } from '@/lib/stableJson';
import { isRestrictedConfigPath, RESTRICTED_CONFIG } from './configRestrictions';
import { describeFabricSetSetting, type FabricContext, fabricSetSettingFor } from './fabricManagedConfig';

export type ConfigObject = Record<string, unknown>;

export interface ConfigChange {
	path: readonly string[];
	/** `undefined` when the setting was not in the config. */
	before: unknown;
	/** `undefined` when the setting was removed. */
	after: unknown;
}

export interface RefusedChange extends ConfigChange {
	reason: 'removed' | 'studio' | 'fabric';
	message: string;
}

export function isPlainObject(value: unknown): value is ConfigObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown) {
	// `stableJson` writes `undefined` as `null`, and an absent setting is not a null one.
	if (a === undefined || b === undefined) {
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

/** A copy of `config` with `path` set to `value`, or removed when `value` is `undefined`. */
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
	next[head] = setIn(child, rest, value);
	return next;
}

/**
 * Every setting that differs, one entry per leaf: objects are compared key by key, and anything else (arrays
 * included) as a whole. A section added or removed whole lists each of its settings.
 */
export function listConfigChanges(before: unknown, after: unknown, path: readonly string[] = []): ConfigChange[] {
	const beforeIsSection = isPlainObject(before) || (before === undefined && isPlainObject(after));
	const afterIsSection = isPlainObject(after) || (after === undefined && isPlainObject(before));
	if (beforeIsSection && afterIsSection) {
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
	return sameValue(before, after) ? [] : [{ path, before, after }];
}

/** `listConfigChanges` from `oldBase` to `draft`, applied to `newBase`: the edits survive a refetch. */
export function rebaseDraft(oldBase: ConfigObject, draft: ConfigObject, newBase: ConfigObject): ConfigObject {
	return listConfigChanges(oldBase, draft).reduce(
		(rebased, change) => setIn(rebased, change.path, change.after),
		newBase,
	);
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

export function findRefusedChanges(changes: readonly ConfigChange[], context: FabricContext): RefusedChange[] {
	return changes.flatMap((change): RefusedChange[] => {
		const fabric = fabricSetSettingFor(change.path, context, { includeChildren: true });
		if (fabric) {
			return [{ ...change, reason: 'fabric', message: describeFabricSetSetting(fabric) }];
		}
		const dotted = change.path.join('.');
		if (
			isRestrictedConfigPath(dotted, change.after, change.before)
			|| (holdsRestrictedSettings(change.path) && !isPlainObject(change.after))
		) {
			return [{ ...change, reason: 'studio', message: 'Studio does not change this setting.' }];
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

/** The `set_configuration` fields for `changes`: each path joined with `_`, as Harper names them. */
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
