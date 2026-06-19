export interface DeleteSelectedItemsResult {
	/** Number of items successfully dropped before the run ended. */
	deleted: number;
	/** True when the user canceled partway through. */
	canceled: boolean;
	/**
	 * Set when a drop threw. The run stops at the first failure and surfaces the
	 * error so the caller can replace its progress spinner instead of leaving it
	 * spinning forever (the bug this helper exists to prevent).
	 */
	error?: unknown;
	/** The `/`-split path of the last item attempted, used to refocus the tree. */
	lastSplit: string[];
}

export interface DeleteSelectedItemsCallbacks {
	/** Drops a single component file: the project name and an optional nested file path. */
	dropItem: (project: string, file: string | undefined) => Promise<unknown>;
	/** Called before each drop so the caller can update its progress indicator. */
	onProgress?: (deletedSoFar: number) => void;
	/** Polled after each drop; returning true stops the run as canceled. */
	isCanceled?: () => boolean;
}

/**
 * Drops a list of selected file-tree paths one at a time. Each path is
 * `project/nested/file/path`; the first segment is the project and the rest (if
 * any) is the file within it.
 *
 * Unlike a bare `await` loop, a rejected drop does not escape this function — it
 * stops the run and is returned in {@link DeleteSelectedItemsResult.error} so the
 * UI can show a failure instead of hanging on the loading toast.
 */
export async function deleteSelectedItems(
	items: readonly string[],
	{ dropItem, onProgress, isCanceled }: DeleteSelectedItemsCallbacks,
): Promise<DeleteSelectedItemsResult> {
	let deleted = 0;
	let lastSplit: string[] = [];

	for (const item of items) {
		const split = item.split('/');
		lastSplit = split;
		const project = split[0];
		const file = split.length > 1 ? split.slice(1).join('/') : undefined;

		onProgress?.(deleted);

		try {
			await dropItem(project, file);
		} catch (error) {
			return { deleted, canceled: false, error, lastSplit };
		}

		if (isCanceled?.()) {
			return { deleted, canceled: true, lastSplit };
		}

		deleted += 1;
	}

	return { deleted, canceled: false, lastSplit };
}
