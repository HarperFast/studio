import { describe, expect, it } from 'vitest';
import { describeIncompleteDelete } from './deleteTableRecords';

describe('describeIncompleteDelete', () => {
	it('reads a clean delete as complete', () => {
		expect(describeIncompleteDelete({ deleted_hashes: ['a', 'b'], skipped_hashes: [] }, 2)).toBeUndefined();
	});

	it('treats absent hash lists as unproven', () => {
		for (const response of [{ message: 'deleted' }, undefined, { deleted_hashes: [] }, { skipped_hashes: [] }]) {
			const incomplete = describeIncompleteDelete(response, 2);
			expect(incomplete?.message).toContain("didn't report which records");
			expect(incomplete?.wroteNothing).toBe(false);
		}
	});

	it('reports the records the server skipped', () => {
		const incomplete = describeIncompleteDelete({ deleted_hashes: ['a'], skipped_hashes: ['b'] }, 2);
		expect(incomplete?.message).toContain('deleted 1 of 2');
		expect(incomplete?.message).toContain('skipped 1');
		expect(incomplete?.wroteNothing).toBe(false);
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
