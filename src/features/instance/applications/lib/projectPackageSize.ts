/**
 * Sizing for the Download Application flow, so the modal can say how big a package is
 * *before* asking the instance to build it.
 *
 * The numbers come from the `get_components` tree Studio already has cached — Harper returns
 * a `size` on every file entry — so this costs no extra request. `get_components` also skips
 * `node_modules`, which makes the total an exact match for the modal's default
 * (`skip_node_modules: true`) and a floor for the include-node_modules case.
 *
 * Why it matters: `package_component` returns the whole archive as base64 inside JSON, and
 * decoding that costs roughly 5x the archive size in the renderer (response text, the parsed
 * string, the `atob` copy, the byte array, the Blob). Past a few hundred MB Chrome kills the
 * tab mid-download with a generic "Aw, Snap!" and no explanation — HarperFast/studio#1591.
 * Streaming the archive instead is HarperFast/harper#2150; until that lands (and for older
 * instances after it does) the honest fix is to tell the user the size up front.
 */
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';

type AnyEntry = DirectoryEntry | FileEntry;

export interface ProjectPackageSize {
	/** Total uncompressed bytes of the files Harper would pack, excluding `node_modules`. */
	bytes: number;
	fileCount: number;
	/**
	 * False when at least one file entry carried no `size` — Harper has sent one on every file
	 * for a long time, but an older instance (or a directory the walk failed to stat) would
	 * make `bytes` an undercount, and the modal should hedge its wording rather than state a
	 * total it can't stand behind.
	 */
	exact: boolean;
}

/**
 * Uncompressed bytes above which the modal warns before packaging. Decimal MB, matching
 * `humanFileSize`.
 *
 * 100 MB is well under anything that has actually failed (#1591 was ~800 MB) and well over a
 * normal application, so it catches the "I didn't realize how big this was" case — the one
 * that produced #1591 — without nagging about ordinary downloads. It is deliberately the only
 * tier: a hard ceiling would have to be guessed from an uncompressed total, and a large tree
 * of compressible source can still download fine, so the decision stays the user's.
 */
export const LARGE_PACKAGE_BYTES = 100_000_000;

/**
 * Total size of the files `package_component` would pack for `project`, or undefined when the
 * project isn't in the tree (nothing trustworthy to report — say nothing rather than "0 B").
 */
export function measureProjectPackage(
	rootEntries: AnyEntry[],
	project: string | undefined,
): ProjectPackageSize | undefined {
	if (!project) {
		return undefined;
	}
	const root = rootEntries.find(entry => entry.name === project);
	if (!root || !isDirectory(root)) {
		return undefined;
	}

	let bytes = 0;
	let fileCount = 0;
	let exact = true;
	const walk = (entries: AnyEntry[]) => {
		for (const entry of entries) {
			if (isDirectory(entry)) {
				walk(entry.entries);
				continue;
			}
			fileCount++;
			if (typeof entry.size === 'number') {
				bytes += entry.size;
			} else {
				exact = false;
			}
		}
	};
	walk(root.entries);

	return { bytes, fileCount, exact };
}
