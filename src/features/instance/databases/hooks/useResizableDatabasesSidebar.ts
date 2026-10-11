import { type ResizableSidebarOptions, useResizableSidebar } from '@/hooks/useResizableSidebar';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';

/** Roughly the old fixed `lg:col-span-3` feel, so first load is close to unchanged. */
export const DEFAULT_DATABASES_SIDEBAR_WIDTH = 320;
/** Narrowest the sidebar may be dragged — below this the tree labels are unusable. */
export const MIN_SIDEBAR_WIDTH = 200;

export const DATABASES_SIDEBAR: ResizableSidebarOptions = {
	storageKey: LocalStorageKeys.DatabasesSidebarWidth,
	defaultWidth: DEFAULT_DATABASES_SIDEBAR_WIDTH,
	minWidth: MIN_SIDEBAR_WIDTH,
	cssVariable: '--db-sidebar-width',
};

export function useResizableDatabasesSidebar() {
	return useResizableSidebar(DATABASES_SIDEBAR);
}
