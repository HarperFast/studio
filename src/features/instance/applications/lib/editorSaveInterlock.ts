/** The rules are in `../DESIGN.md`, under "Saving a file". */
import type { SetComponentFileRequest } from '@/integrations/api/instance/applications/setComponentFile';
import type { QueryClient } from '@tanstack/react-query';

export const editorSaveKey = ['set_component_file', 'editor'] as const;

export function editorSavesInFlight(queryClient: QueryClient): SetComponentFileRequest[] {
	return queryClient.getMutationCache().findAll({ mutationKey: editorSaveKey, status: 'pending' })
		.map(mutation => mutation.state.variables as SetComponentFileRequest);
}

const renamesInFlight = new WeakMap<QueryClient, Map<string, number>>();

export function isRenaming(queryClient: QueryClient, entityId: string): boolean {
	return renamesInFlight.get(queryClient)?.has(entityId) ?? false;
}

type RenameScope = { readonly paths: readonly string[] } | 'instance';

/**
 * `undefined` at once while this tab is saving on the instance, or once `signal` aborts its wait for
 * other tabs; otherwise the function that ends the rename.
 */
export function startRename(
	queryClient: QueryClient,
	entityId: string,
	scope: RenameScope,
	signal?: AbortSignal,
): Promise<(() => void) | undefined> | undefined {
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
	return holdAcrossTabs(renameLocks(entityId, scope), signal).then(release => {
		if (signal?.aborted) {
			release();
			endInThisTab();
			return undefined;
		}
		return () => {
			release();
			endInThisTab();
		};
	});
}

export function holdForSave<T>(entityId: string, path: string, save: () => Promise<T>): Promise<T> {
	return whileHeldAcrossTabs([
		{ name: instanceLockName(entityId), mode: 'shared' },
		{ name: fileLockName(entityId, path), mode: 'shared' },
	], save);
}

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

async function whileHeldAcrossTabs<T>(
	locks: readonly LockSpec[],
	work: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
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
		return manager.request(name, { mode, signal }, () => take(index + 1));
	};
	try {
		return await take(0);
	} catch (error) {
		if (started) {
			throw error;
		}
		if (!signal?.aborted) {
			// Not console.error: RUM reports that, and this tab's own interlock still holds.
			console.debug('Web Locks refused; this save or rename is not held across tabs:', error);
		}
		return run();
	}
}

function holdAcrossTabs(locks: readonly LockSpec[], signal?: AbortSignal): Promise<() => void> {
	let release!: () => void;
	const released = new Promise<void>(resolve => {
		release = resolve;
	});
	return new Promise(resolve => {
		void whileHeldAcrossTabs(locks, () => {
			resolve(release);
			return released;
		}, signal);
	});
}
