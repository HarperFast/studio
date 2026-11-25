/** The rules are in `../DESIGN.md`, under "Saving a file". */
import type { SetComponentFileRequest } from '@/integrations/api/instance/applications/setComponentFile';
import type { QueryClient } from '@tanstack/react-query';

export const editorSaveKey = ['set_component_file', 'editor'] as const;

export function editorSavesInFlight(queryClient: QueryClient): SetComponentFileRequest[] {
	return queryClient.getMutationCache().findAll({ mutationKey: editorSaveKey, status: 'pending' })
		.map(mutation => mutation.state.variables as SetComponentFileRequest);
}

// Kept with the tab's query client, beside the saves its mutation cache tracks.
const renamesInFlight = new WeakMap<QueryClient, Map<string, number>>();

export function isRenaming(queryClient: QueryClient, entityId: string): boolean {
	return renamesInFlight.get(queryClient)?.has(entityId) ?? false;
}

/**
 * What a rename covers in other tabs: the paths it reads, writes and drops, or the whole instance for a
 * folder, whose drop also takes files that were never listed.
 */
export type RenameScope = { readonly paths: readonly string[] } | 'instance';

/**
 * Starts a rename, or refuses with `undefined` while this tab has an editor save in flight on the
 * instance. This tab's saves there are refused from the moment it starts. Other tabs' saves of what it
 * covers are waited for, and wait for it in turn: it resolves, with the function that ends it, once
 * they are done.
 */
export function startRename(
	queryClient: QueryClient,
	entityId: string,
	scope: RenameScope,
): Promise<() => void> | undefined {
	if (editorSavesInFlight(queryClient).some(saving => saving.entityId === entityId)) {
		return undefined;
	}
	const renames = renamesInFlight.get(queryClient) ?? new Map<string, number>();
	renamesInFlight.set(queryClient, renames);
	renames.set(entityId, (renames.get(entityId) ?? 0) + 1);
	const endInThisTab = () => {
		const remaining = (renames.get(entityId) ?? 1) - 1;
		if (remaining > 0) {
			renames.set(entityId, remaining);
		} else {
			renames.delete(entityId);
		}
	};
	return holdAcrossTabs(renameLocks(entityId, scope)).then(release => () => {
		release();
		endInThisTab();
	});
}

/**
 * Sends a save of `path` once no other tab is renaming it, and keeps other tabs from renaming it until
 * the save settles.
 */
export function holdForSave<T>(entityId: string, path: string, save: () => Promise<T>): Promise<T> {
	return whileHeldAcrossTabs([
		{ name: instanceLockName(entityId), mode: 'shared' },
		{ name: fileLockName(entityId, path), mode: 'shared' },
	], save);
}

/*
 Locks are taken in one order, the instance first and then the paths sorted, and all of them before any
 request is sent: that is what keeps two tabs from each holding what the other waits for. Names carry the
 instance id and the path and nothing more, since any script on the page can list them.
 */
interface LockSpec {
	name: string;
	mode: LockMode;
}

function instanceLockName(entityId: string) {
	return `Studio:EditorFiles:${encodeURIComponent(entityId)}`;
}

function fileLockName(entityId: string, path: string) {
	return `Studio:EditorFile:${encodeURIComponent(entityId)}:${path}`;
}

function renameLocks(entityId: string, scope: RenameScope): LockSpec[] {
	if (scope === 'instance') {
		return [{ name: instanceLockName(entityId), mode: 'exclusive' }];
	}
	return [
		{ name: instanceLockName(entityId), mode: 'shared' },
		...[...new Set(scope.paths)].sort().map(path => ({
			name: fileLockName(entityId, path),
			mode: 'exclusive' as const,
		})),
	];
}

function lockManager(): LockManager | undefined {
	return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

/**
 * Runs `work` holding `locks` in the order given, and lets them go once it settles. Without Web Locks
 * (an older browser, an insecure context), or when they refuse the request, it runs without them, and
 * only this tab's own interlock holds.
 */
async function whileHeldAcrossTabs<T>(locks: readonly LockSpec[], work: () => Promise<T>): Promise<T> {
	let started = false;
	const run = () => {
		started = true;
		return work();
	};
	const manager = lockManager();
	if (!manager) {
		return run();
	}
	const take = (index: number): Promise<T> => {
		if (index === locks.length) {
			return run();
		}
		const { name, mode } = locks[index];
		return manager.request(name, { mode }, () => take(index + 1));
	};
	try {
		return await take(0);
	} catch (error) {
		if (started) {
			throw error;
		}
		return run();
	}
}

/** Takes `locks` as `whileHeldAcrossTabs` does, and keeps them until the function it resolves with is called. */
function holdAcrossTabs(locks: readonly LockSpec[]): Promise<() => void> {
	let release!: () => void;
	const released = new Promise<void>(resolve => {
		release = resolve;
	});
	return new Promise(resolve => {
		void whileHeldAcrossTabs(locks, () => {
			resolve(release);
			return released;
		});
	});
}
