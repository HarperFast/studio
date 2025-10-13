import { describe, expect, it } from 'vitest';
import { humanFileSize } from './humanFileSize';

describe('humanFileSize', () => {
	it('should return bytes for values less than 1000', () => {
		expect(humanFileSize(500)).toBe('500 B');
		expect(humanFileSize(0)).toBe('0 B');
		expect(humanFileSize(999)).toBe('999 B');
	});

	it('should convert to KiB for values between 1000 and 1000000', () => {
		expect(humanFileSize(1000)).toBe('1 KB');
		expect(humanFileSize(2000)).toBe('2 KB');
		expect(humanFileSize(900000)).toBe('900 KB');
	});

	it('should convert to MiB for appropriate values', () => {
		expect(humanFileSize(1000000)).toBe('1 MB');
		expect(humanFileSize(2000000)).toBe('2 MB');
	});

	it('should convert to GiB for appropriate values', () => {
		expect(humanFileSize(1000000000)).toBe('1 GB');
	});

	it('should apply the multiplier correctly', () => {
		expect(humanFileSize(2, 1000)).toBe('2 KB');
		expect(humanFileSize(2, 1000000)).toBe('2 MB');
	});
});
