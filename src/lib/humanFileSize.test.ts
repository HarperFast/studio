import { describe, expect, it } from 'vitest';
import { humanFileSize } from './humanFileSize';

describe('humanFileSize', () => {
	it('should return bytes for values less than 1024', () => {
		expect(humanFileSize(500)).toBe('500 B');
		expect(humanFileSize(0)).toBe('0 B');
		expect(humanFileSize(1023)).toBe('1023 B');
	});

	it('should convert to KB for values between 1024 and 1048575', () => {
		expect(humanFileSize(1024)).toBe('1 KB');
		expect(humanFileSize(2048)).toBe('2 KB');
		expect(humanFileSize(1000000)).toBe('977 KB');
	});

	it('should convert to MB for appropriate values', () => {
		expect(humanFileSize(1048576)).toBe('1 MB');
		expect(humanFileSize(2097152)).toBe('2 MB');
	});

	it('should convert to GB for appropriate values', () => {
		expect(humanFileSize(1073741824)).toBe('1 GB');
	});

	it('should apply the multiplier correctly', () => {
		expect(humanFileSize(2, 1024)).toBe('2 KB');
		expect(humanFileSize(2, 1048576)).toBe('2 MB');
	});
});
