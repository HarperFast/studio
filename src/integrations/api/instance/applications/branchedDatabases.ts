import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * An application's private database copies (Harper's `branchedDatabases`): the databases it forks, or `true` for
 * every database except `system`. Harper reads it only from the application's root-config entry, which a package
 * `deploy_component` writes whole: applications/DESIGN.md, "Private database copies".
 */
export type BranchedDatabases = string[] | true;

/**
 * 5.3.0 and 5.3.1 accept the setting on a package deploy and then ignore it at load, so the application keeps the
 * shared data (HarperFast/harper#3071, fixed for 5.3.x by harper#3123 in 5.3.2).
 */
const MIN_BRANCHED_DATABASES_VERSION = '5.3.2';

export function supportsBranchedDatabases(harperVersion: string | undefined): boolean {
	return !!harperVersion && wasAReleasedBeforeB(MIN_BRANCHED_DATABASES_VERSION, harperVersion);
}

/**
 * An application that isn't package-deployed gets the setting only from a payload deploy, which carries it from
 * HarperFast/harper#3505, first tagged 5.4.0-alpha.1. Before that a payload deploy ignores it.
 */
const MIN_PAYLOAD_BRANCHED_DATABASES_VERSION = '5.4.0-alpha.1';

export function supportsPayloadBranchedDatabases(harperVersion: string | undefined): boolean {
	return !!harperVersion && wasAReleasedBeforeB(MIN_PAYLOAD_BRANCHED_DATABASES_VERSION, harperVersion);
}

const MIN_DISCARDS_DROPPED_BRANCHES_VERSION = '5.4.0-alpha.2';

/**
 * From 5.4.0-alpha.2 Harper discards a dropped application's private copies by itself (harper
 * `resources/branchDatabase.ts` `recordPendingBranchRemoval`, `components/operations.ts` `retryBranchRemoval`):
 * applications/DESIGN.md, "Private database copies". `undefined` for a version that is missing or doesn't parse, which
 * `wasAReleasedBeforeB` would otherwise read as older.
 */
export function discardsDroppedBranches(harperVersion: string | undefined): boolean | undefined {
	if (!harperVersion) {
		return undefined;
	}
	if (wasAReleasedBeforeB(MIN_DISCARDS_DROPPED_BRANCHES_VERSION, harperVersion)) {
		return true;
	}
	return wasAReleasedBeforeB(harperVersion, MIN_DISCARDS_DROPPED_BRANCHES_VERSION) ? false : undefined;
}

export function entryHasPackage(configuration: unknown, project: string): boolean {
	if (!isRecord(configuration) || !Object.hasOwn(configuration, project)) {
		return false;
	}
	const entry = configuration[project];
	return isRecord(entry) && entry.package !== undefined;
}

/**
 * The setting on `project`'s entry in a `get_configuration` answer, or `undefined` when it has none. An empty list
 * branches nothing (harper `resources/branchDatabase.ts` `prepareBranches`), so it reads as none.
 */
export function readBranchedDatabases(configuration: unknown, project: string): BranchedDatabases | undefined {
	if (!isRecord(configuration) || !Object.hasOwn(configuration, project)) {
		return undefined;
	}
	const entry = configuration[project];
	if (!isRecord(entry)) {
		return undefined;
	}
	const value = entry.branchedDatabases;
	if (value === true) {
		return true;
	}
	if (!Array.isArray(value)) {
		return undefined;
	}
	const databases = value.filter((name): name is string => typeof name === 'string');
	return databases.length ? databases : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function describeBranchedDatabases(setting: BranchedDatabases): string {
	return setting === true ? 'all databases except system' : setting.join(', ');
}

/**
 * Harper's `drop_component` answer, when it says what became of the application's private copies: left on disk
 * (Studio drops without a restart, which on 5.3 always leaves them) or failed to remove. Every such answer names
 * "branched database storage" (harper `components/operations.js` `BRANCH_STORAGE_RETAINED`).
 */
export function branchStorageMessage(response: unknown): string | undefined {
	const message = isRecord(response) ? response.message : undefined;
	return typeof message === 'string' && message.includes('branched database storage') ? message : undefined;
}
