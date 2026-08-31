/** How an edited payload broke the identity of the records the editor loaded. */
export type PrimaryKeyMismatch =
	/** A loaded record's key is gone from the payload, so that record has no edit to apply. */
	| { kind: 'lost'; keys: unknown[] }
	/** The payload carries a key the editor never loaded, so it targets some other record. */
	| { kind: 'unknown'; keys: unknown[] }
	/**
	 * The payload's keyless records don't match the loaded ones. Adding is unwritable — `update`
	 * skips a record it can't address and `put` cannot create one without a key. Dropping is
	 * ambiguous in the same way a dropped keyed record is: omitting a record from the JSON doesn't
	 * delete it, so a save would report success having changed nothing about it.
	 */
	| { kind: 'keyless'; added: number; dropped: number };

/**
 * Whether an edited payload still identifies the records the editor loaded.
 *
 * The primary key is the record's identity, so editing it isn't an edit to that record, and neither
 * failure is visible as an attribute removal:
 *
 * - **A loaded key is gone** (deleted, nulled, or changed). `update` requires an existing record, so
 *   the write silently does nothing while the modal reports success — the studio#1643 failure again,
 *   inside its own fix.
 * - **The payload names a key that wasn't loaded.** Worse: if something is stored under it, `update`
 *   patches a record the user never opened.
 *
 * Deliberately keyed on the LOADED records' keys, not on every edited record having one. A stored
 * record with no value for the declared key is #1199 (the table isn't really keyed by that
 * attribute); the parent renders such a row read-only, and treating its keyless edit as a mismatch
 * would refuse a whole batch over a row that was never addressable in the first place. There is no early
 * exit when _no_ loaded record has a key, though: the remaining rules still apply, and without them
 * an edit that added someone else's key to a keyless record would route to `update` and patch a
 * record the user never opened.
 *
 * Reported rather than repaired: moving a record to a new key means an insert plus a delete, which is
 * not what the row editor was asked to do.
 */
export function primaryKeyMismatch(
	storedRecords: readonly Record<string, unknown>[] | undefined,
	editedRecords: readonly Record<string, unknown>[],
	primaryKey: string,
): PrimaryKeyMismatch | undefined {
	if (!primaryKey || !storedRecords?.length) {
		return undefined;
	}
	const loadedKeys = new Set<unknown>();
	for (const stored of storedRecords) {
		const id = stored[primaryKey];
		if (id != null) {
			loadedKeys.add(id);
		}
	}
	const editedKeys = new Set<unknown>();
	for (const edited of editedRecords) {
		const id = edited[primaryKey];
		if (id != null) {
			editedKeys.add(id);
		}
	}
	const lost = [...loadedKeys].filter(id => !editedKeys.has(id));
	if (lost.length) {
		return { kind: 'lost', keys: lost };
	}
	const unknownKeys = [...editedKeys].filter(id => !loadedKeys.has(id));
	if (unknownKeys.length) {
		return { kind: 'unknown', keys: unknownKeys };
	}
	const loadedKeyless = storedRecords.filter(record => record[primaryKey] == null).length;
	const editedKeyless = editedRecords.filter(record => record[primaryKey] == null).length;
	if (editedKeyless === loadedKeyless) {
		return undefined;
	}
	return {
		kind: 'keyless',
		added: Math.max(0, editedKeyless - loadedKeyless),
		dropped: Math.max(0, loadedKeyless - editedKeyless),
	};
}
