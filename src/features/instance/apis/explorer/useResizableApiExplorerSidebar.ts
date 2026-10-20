import { type ResizableSidebarOptions, useResizableSidebar } from '@/hooks/useResizableSidebar';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';

/** Matches the previous fixed `lg:w-80` (320px), so first load looks unchanged. */
export const DEFAULT_SIDEBAR_WIDTH = 320;
/**
 * A touch wider than the databases sidebar's 200px because the endpoint tree nests deeper
 * (resource → path → method, each level indented), so labels need the room.
 */
export const MIN_SIDEBAR_WIDTH = 240;

/**
 * A global UI preference, not per-entity: unlike the server/auth settings it carries no credential, so
 * it's fine to share across instances.
 */
export const API_EXPLORER_SIDEBAR: ResizableSidebarOptions = {
	storageKey: LocalStorageKeys.ApiExplorerSidebarWidth,
	defaultWidth: DEFAULT_SIDEBAR_WIDTH,
	minWidth: MIN_SIDEBAR_WIDTH,
	cssVariable: '--api-sidebar-width',
};

export function useResizableApiExplorerSidebar() {
	return useResizableSidebar(API_EXPLORER_SIDEBAR);
}
