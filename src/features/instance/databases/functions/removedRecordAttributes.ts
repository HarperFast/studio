/** One edited record that drops at least one top-level attribute, by its index in the payload. */
export interface RecordAttributeRemoval {
	index: number;
	removed: string[];
}

/**
 * Which edited records drop top-level attributes relative to the record as stored, and which ones.
 *
 * `update` and `upsert` both merge (`ResourceBridge.updateRecords` → `upsertRecords` → `Table.patch`),
 * so an attribute the user deleted from the editor JSON is simply absent from the patch and keeps its
 * stored value; a `null` stores a null rather than removing the key (studio#1643). Removing one needs
 * `put`, which replaces the record — so the caller has to know exactly which records need that costlier
 * write, and which must keep merging.
 *
 * Reported per record, not as one flat list, because `put` is last-writer-wins over the whole record:
 * a caller that saw only "something was removed" would have to replace every record in the payload,
 * clobbering concurrent writes to records the edit never touched.
 *
 * Only top-level attributes count. A patch replaces a nested object wholesale rather than merging into
 * it (`resources/tracked.ts:441` assigns the submitted value for the key), so deleting a property
 * inside a nested object already works through a plain `update`.
 *
 * Records are paired by primary-key value, and an edited record matching no stored record reports
 * nothing: an edit that changed the primary key isn't the same record any more, and replacing it would
 * write a row the user didn't ask for (Harper's own `update` skips such a record too).
 */
export function removedRecordAttributes(
	storedRecords: readonly Record<string, unknown>[] | undefined,
	editedRecords: readonly Record<string, unknown>[],
	primaryKey: string,
): RecordAttributeRemoval[] {
	if (!primaryKey || !storedRecords?.length) {
		return [];
	}
	const storedById = new Map(storedRecords.map(record => [record[primaryKey], record]));
	const removals: RecordAttributeRemoval[] = [];
	for (const [index, edited] of editedRecords.entries()) {
		const id = edited[primaryKey];
		if (id == null) {
			continue;
		}
		const stored = storedById.get(id);
		if (!stored) {
			continue;
		}
		// `Object.hasOwn`, not `in`: `in` walks the prototype chain, so an attribute named for anything
		// on `Object.prototype` — `constructor`, `toString`, `valueOf` — would report as still present
		// on the edited object and its removal would silently take the merge path.
		const removed = Object.keys(stored).filter(attribute => !Object.hasOwn(edited, attribute));
		if (removed.length) {
			removals.push({ index, removed });
		}
	}
	return removals;
}

/** Every attribute name the edit removes, deduplicated — for messaging, where the record doesn't matter. */
export function removedAttributeNames(removals: readonly RecordAttributeRemoval[]): string[] {
	return [...new Set(removals.flatMap(removal => removal.removed))];
}
