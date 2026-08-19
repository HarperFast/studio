import { ApiAuth } from '@/features/instance/apis/explorer/request';
import { getLocalStorage } from '@/lib/storage/getLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { setLocalStorage } from '@/lib/storage/setLocalStorage';

/** Per-entity server + auth selections, persisted under `LocalStorageKeys.ApiExplorerSettings`. */
export interface ExplorerEntitySettings {
	auth?: ApiAuth;
	server?: string;
}

/** The whole persisted map, guarded so a corrupted (non-object) value reads as empty rather than throwing. */
function readMap(): Record<string, ExplorerEntitySettings> {
	const map = getLocalStorage<Record<string, ExplorerEntitySettings>>(LocalStorageKeys.ApiExplorerSettings, {});
	return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

export function readEntitySettings(entityId: string): ExplorerEntitySettings {
	const map = readMap();
	return Object.hasOwn(map, entityId) ? map[entityId] ?? {} : {};
}

/**
 * Persist one entity's settings with a fresh read-merge-write against localStorage — never a stale
 * in-memory copy of the whole map. Another tab may have signed an entity out (deleting its key) since
 * this tab loaded; writing back a stale full map would resurrect that entity's credentials and break
 * the sign-out guarantee. Merging into a fresh read touches only this entity.
 */
export function writeEntitySettings(entityId: string, patch: Partial<ExplorerEntitySettings>): void {
	const map = readMap();
	map[entityId] = { ...map[entityId], ...patch };
	setLocalStorage(LocalStorageKeys.ApiExplorerSettings, map);
}
