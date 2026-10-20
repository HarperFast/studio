import { type ResizableSidebarOptions, useResizableSidebar } from '@/hooks/useResizableSidebar';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';

/** Matches the previous fixed `w-56` (224px) so existing layouts are unchanged on first load. */
export const DEFAULT_SIDEBAR_WIDTH = 224;
/** Narrowest the file tray may be dragged — below this the tree labels are unusable. */
export const MIN_SIDEBAR_WIDTH = 180;

export const APPLICATIONS_SIDEBAR: ResizableSidebarOptions = {
	storageKey: LocalStorageKeys.ApplicationsSidebarWidth,
	defaultWidth: DEFAULT_SIDEBAR_WIDTH,
	minWidth: MIN_SIDEBAR_WIDTH,
	cssVariable: '--app-sidebar-width',
};

export function useResizableApplicationsSidebar() {
	return useResizableSidebar(APPLICATIONS_SIDEBAR);
}
