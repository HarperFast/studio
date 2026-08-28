/**
 * Which top-level attributes an edited record drops relative to the record as stored.
 *
 * Harper's operations API has no full-replace write for a record that already exists: `update`
 * and `upsert` both land on `Table.patch` (`dataLayer/harperBridge/ResourceBridge.ts`,
 * `updateRecords` → `upsertRecords` → `Table.patch`), which merges the submitted attributes onto
 * the stored record. An attribute the user deleted from the editor JSON is therefore simply
 * absent from the patch and keeps its stored value, and a `null` stores a null rather than
 * removing the key -- which is what studio#1643 reported. Dropping an attribute needs the record
 * written from scratch, so the record editor asks this what an edit removes and takes that
 * costlier path (delete, then insert) only when the answer isn't empty.
 *
 * Only top-level attributes count. A patch replaces a nested object wholesale instead of merging
 * into it (`resources/tracked.ts` `updateAndFreeze` assigns the submitted value for the key), so
 * deleting a property inside a nested object already works through a plain `update`.
 *
 * Records are paired by primary-key value, and an edited record that matches none of the stored
 * ones reports nothing: an edit that removed or changed the primary key isn't the same record any
 * more, and rewriting it as one would delete a row the user didn't ask to delete (Harper's own
 * `update` skips such a record, since it requires an existing one).
 */
export function removedRecordAttributes(
	storedRecords: readonly Record<string, unknown>[] | undefined,
	editedRecords: readonly Record<string, unknown>[],
	primaryKey: string,
): string[] {
	const removed = new Set<string>();
	for (const stored of storedRecords ?? []) {
		const id = primaryKey ? stored[primaryKey] : undefined;
		if (id == null) {
			continue;
		}
		const edited = editedRecords.find(record => record[primaryKey] === id);
		if (!edited) {
			continue;
		}
		for (const attribute of Object.keys(stored)) {
			if (!(attribute in edited)) {
				removed.add(attribute);
			}
		}
	}
	return [...removed];
}
