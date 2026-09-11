import { describe, expect, it } from 'vitest';
import { describeIncompleteDelete } from './deleteTableRecords';

describe('describeIncompleteDelete', () => {
	it('reads a clean delete as complete', () => {
		expect(describeIncompleteDelete({ deleted_hashes: ['a', 'b'], skipped_hashes: [] }, 2)).toBeUndefined();
	});

	// `delete` runs against every version Studio manages back to 4.7; a legacy response that names no
	// hashes is not evidence the rows survived.
	it('reads an absent hash list as complete', () => {
		expect(describeIncompleteDelete({ message: 'deleted' }, 2)).toBeUndefined();
		expect(describeIncompleteDelete(undefined, 2)).toBeUndefined();
	});

	it('reports the records the server skipped', () => {
		const incomplete = describeIncompleteDelete({ deleted_hashes: ['a'], skipped_hashes: ['b'] }, 2);
		expect(incomplete?.message).toContain('deleted 1 of 2');
		expect(incomplete?.message).toContain('skipped 1');
		expect(incomplete?.wroteNothing).toBe(false);
	});

	// A responder that names skipped records is answering the operation, so the legacy "assume it
	// did what was asked" fallback must not also apply -- it produced "deleted 1 of 1 and skipped 1".
	it('does not credit the skipped records as deleted when the deleted list is absent', () => {
		const incomplete = describeIncompleteDelete({ skipped_hashes: ['b'] }, 2);
		expect(incomplete?.message).toContain('deleted 1 of 2');
		expect(incomplete?.message).toContain('skipped 1');
		expect(describeIncompleteDelete({ skipped_hashes: ['a'] }, 1)?.message).toContain('deleted 0 of 1');
	});

	it('reports a delete that removed nothing as having written nothing', () => {
		const incomplete = describeIncompleteDelete({ deleted_hashes: [], skipped_hashes: ['a'] }, 1);
		expect(incomplete?.wroteNothing).toBe(true);
	});

	// Present but not an array: that responder does answer `delete`, so its answer is unreadable
	// rather than absent -- and an unreadable answer must not be reported as a success.
	it('treats a present-but-unreadable hash list as unproven, not empty', () => {
		for (const response of [{ skipped_hashes: null }, { deleted_hashes: 'a,b' }, { skipped_hashes: 3 }]) {
			const incomplete = describeIncompleteDelete(response as never, 2);
			expect(incomplete).toBeDefined();
			// Undecidable, so the caller still refreshes: the delete may have landed and replicated.
			expect(incomplete?.wroteNothing).toBe(false);
		}
	});
});
