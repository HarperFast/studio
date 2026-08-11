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

// The name has to be the spec's own trailing segment — not a prefix (`my-akamai-status-probe`),
// an extension (`akamai-status.dashboard`), or an owner (`github.com/akamai-status/theirs.git`).
// A trailing `/` counts only at the very end, which is what separates the last two. Case-insensitive
// because git hosts are: a spec that deploys need not match this regex's casing.
const PROTECTED_PATTERNS = PROTECTED_COMPONENT_REPOS.map(
	(repo) => new RegExp(`(?:^|[/@])${repo}(?:\\.git)?(?:[#?@]|/?$)`, 'i'),
);

export function isProtectedComponentPackage(packageSpec: string | undefined) {
	return Boolean(packageSpec) && PROTECTED_PATTERNS.some((pattern) => pattern.test(packageSpec!));
}

/**
 * Whether this entry may not be modified. Callers must pass the entry they are acting on: the
 * sidebar context menu targets a row without opening it, so anything keyed to the opened entry
 * gates on the wrong subject.
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

/**
 * Whether a tree path belongs to a protected component. Capability flags gate what renders; this
 * gates the mutation itself, which the delete modal reaches from the menu bar, the context menu
 * and a global keyboard shortcut alike — the latter two of which can act on a selection that was
 * never the entry whose capabilities were computed.
 */
export function isProtectedPath(rootEntries: Array<DirectoryEntry | FileEntry>, path: string) {
	const project = String(path).split('/')[0];
	return isProtectedEntry(rootEntries.find((entry) => entry.name === project));
}
