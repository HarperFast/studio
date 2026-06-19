import { describe, expect, it, vi } from 'vitest';
import { deleteSelectedItems } from './deleteSelectedItems';

describe('deleteSelectedItems', () => {
	it('splits each path into project + nested file and drops them in order', async () => {
		const dropItem = vi.fn().mockResolvedValue(undefined);

		const result = await deleteSelectedItems(['app/build/output.tgz', 'app'], { dropItem });

		expect(dropItem.mock.calls).toEqual([
			['app', 'build/output.tgz'],
			['app', undefined],
		]);
		expect(result).toEqual({ deleted: 2, canceled: false, lastSplit: ['app'] });
	});

	it('reports progress before each drop', async () => {
		const dropItem = vi.fn().mockResolvedValue(undefined);
		const onProgress = vi.fn();

		await deleteSelectedItems(['a/one', 'a/two'], { dropItem, onProgress });

		expect(onProgress.mock.calls).toEqual([[0], [1]]);
	});

	// The bug: a rejected drop used to escape the caller's await loop, leaving the
	// loading toast spinning forever. The helper must instead stop and report it.
	it('stops at the first failed drop and returns the error without throwing', async () => {
		const error = new Error('cannot drop component');
		const dropItem = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(error);

		const result = await deleteSelectedItems(['a/one', 'a/two', 'a/three'], { dropItem });

		expect(result.error).toBe(error);
		expect(result.canceled).toBe(false);
		expect(result.deleted).toBe(1);
		expect(result.lastSplit).toEqual(['a', 'two']);
		// Never attempts the item after the failure.
		expect(dropItem).toHaveBeenCalledTimes(2);
	});

	it('stops when canceled mid-run', async () => {
		const dropItem = vi.fn().mockResolvedValue(undefined);
		let canceled = false;
		const isCanceled = () => canceled;

		const result = await deleteSelectedItems(['a/one', 'a/two', 'a/three'], {
			dropItem,
			isCanceled,
			onProgress: () => {
				canceled = true;
			},
		});

		expect(result.canceled).toBe(true);
		// First item is dropped, then the cancel check halts the run.
		expect(dropItem).toHaveBeenCalledTimes(1);
		expect(result.deleted).toBe(0);
	});

	it('handles an empty selection', async () => {
		const dropItem = vi.fn();

		const result = await deleteSelectedItems([], { dropItem });

		expect(dropItem).not.toHaveBeenCalled();
		expect(result).toEqual({ deleted: 0, canceled: false, lastSplit: [] });
	});
});
