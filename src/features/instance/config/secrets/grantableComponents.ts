import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';

/**
 * The component names a secret can be scoped to, derived from a `get_components` tree. A grant
 * targets a component by name, and every deployed component (local application or installed
 * package) is a top-level directory entry in the tree — so those directory names are exactly the
 * grantable targets. Stray top-level files (if any) aren't components and are dropped. Sorted for
 * a stable picker order; the tree can list the same name twice across reads, so it's de-duped.
 */
export function grantableComponentNames(tree: APIDirectoryEntry | undefined): string[] {
	if (!tree?.entries) {
		return [];
	}
	const names = new Set<string>();
	for (const entry of tree.entries) {
		if (isDirectory(entry)) {
			names.add(entry.name);
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}
