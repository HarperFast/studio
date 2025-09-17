import { DirectoryEntry } from '@/features/instance/operations/queries/getComponents';

interface DirectorySortComparatorEntry {
	name: string;
	entries?: DirectoryEntry[];
}

export function directorySortComparator(a: DirectorySortComparatorEntry, b: DirectorySortComparatorEntry): number {
	// NOTE: refactor.

	// directories first, then flat files sorted
	// ascending, alphanumerically
	const A = +Boolean(a.entries);
	const B = +Boolean(b.entries);

	return A === B ? a.name.localeCompare(b.name) : B - A;
}
