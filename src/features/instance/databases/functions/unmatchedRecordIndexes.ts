/**
 * Which edited records no longer identify a record the editor loaded, by index in the payload.
 *
 * The primary key is the record's identity, so editing it isn't an edit to that record. Both ways of
 * changing it are unsafe, and neither is visible as an attribute removal:
 *
 * - **Removed, or changed to a key nothing is stored under.** `update` requires an existing record
 *   and skips the rest, so the write silently does nothing while the modal reports success — the
 *   same class of bug as studio#1643, which is what this whole change set is fixing.
 * - **Changed to a key that does exist.** Worse: `update` patches *that* record, so the user edits a
 *   row they never opened.
 *
 * Reported rather than repaired, because the intent is ambiguous — moving a record to a new key means
 * an insert plus a delete, which is not what the row editor was asked to do.
 *
 * Empty when the comparison can't be made — no primary key, the record hasn't loaded, or the stored
 * record has no value for the declared key. That last case is #1199 (the table isn't really keyed by
 * the declared attribute); the parent detects it and renders the row read-only, so treating it as a
 * mismatch here would only mislabel it. Matches `removedRecordAttributes`, which skips the same rows.
 */
export function unmatchedRecordIndexes(
	storedRecords: readonly Record<string, unknown>[] | undefined,
	editedRecords: readonly Record<string, unknown>[],
	primaryKey: string,
): number[] {
	if (!primaryKey || !storedRecords?.length) {
		return [];
	}
	const storedKeys = new Set(storedRecords.map(record => record[primaryKey]).filter(id => id != null));
	if (!storedKeys.size) {
		return [];
	}
	const unmatched: number[] = [];
	for (const [index, edited] of editedRecords.entries()) {
		const id = edited[primaryKey];
		if (id == null || !storedKeys.has(id)) {
			unmatched.push(index);
		}
	}
	return unmatched;
}
