import {
	importedApplications,
	newApplication,
} from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';

// Platform-managed components: editing or deleting one takes the instance out of the Akamai
// load balancer. Matched on repo name rather than the full package URL so an org rename cannot
// silently drop the guard.
export const PROTECTED_COMPONENT_REPOS = ['status-check-fabric', 'akamai-status'];

// The name has to be a whole segment, so neither a customer package that merely contains one
// (`my-akamai-status-probe`) nor one that extends it (`akamai-status.dashboard`) is locked.
const PROTECTED_PATTERNS = PROTECTED_COMPONENT_REPOS.map(
	(repo) => new RegExp(`(?:^|[/@])${repo}(?:\\.git)?(?:[/#?@]|$)`),
);

export function isProtectedComponentPackage(packageSpec: string | undefined) {
	return Boolean(packageSpec) && PROTECTED_PATTERNS.some((pattern) => pattern.test(packageSpec!));
}

/**
 * Whether this entry may not be modified. Callers must pass the entry they are acting on —
 * the sidebar context menu targets a row without opening it, so anything keyed to the opened
 * entry offers Delete on a protected package the user merely right-clicked.
 */
export function isProtectedEntry(entry: DirectoryEntry | FileEntry | undefined) {
	if (!entry) {
		return false;
	}
	return (
		isProtectedComponentPackage(entry.package)
		|| entry.path === importedApplications
		|| entry.path === newApplication
	);
}
