/** How an edited payload broke the identity of the records the editor loaded. */
export type PrimaryKeyMismatch =
	/** A loaded record's key is gone from the payload, so that record has no edit to apply. */
	| { kind: 'lost'; keys: unknown[] }
	/** The payload carries a key the editor never loaded, so it targets some other record. */
	| { kind: 'unknown'; keys: unknown[] };

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
 * would refuse a whole batch over a row that was never addressable in the first place.
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
	if (!loadedKeys.size) {
		return undefined;
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
	return unknownKeys.length ? { kind: 'unknown', keys: unknownKeys } : undefined;
}
