/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filenameTimestamp, triggerBlobDownload } from './download';

const { createObjectURL, revokeObjectURL } = URL;

afterEach(() => {
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('triggerBlobDownload', () => {
	it('clicks a download anchor for the blob and revokes its URL only later', () => {
		vi.useFakeTimers();
		URL.createObjectURL = vi.fn(() => 'blob:mock');
		URL.revokeObjectURL = vi.fn();
		const clicked: HTMLAnchorElement[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) {
			clicked.push(this);
		});
		const blob = new Blob(['x']);

		triggerBlobDownload(blob, 'logs.txt');

		expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
		expect(clicked.map((a) => [a.href, a.download])).toEqual([['blob:mock', 'logs.txt']]);
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();
		vi.advanceTimersByTime(10_000);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
	});
});

describe('filenameTimestamp', () => {
	it('dashes the characters a filename cannot hold', () => {
		expect(filenameTimestamp(Date.UTC(2026, 9, 10, 14, 30, 5, 123))).toBe('2026-10-10T14-30-05-123Z');
	});
});
