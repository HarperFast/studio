import { describe, expect, it } from 'vitest';
import { humanFileSize } from './humanFileSize';

describe('humanFileSize', () => {
	it('should return bytes for values less than 1024', () => {
		expect(humanFileSize(500)).toBe('500 B');
		expect(humanFileSize(0)).toBe('0 B');
		expect(humanFileSize(1023)).toBe('1,023 B');
	});

	it('should convert to KiB for values between 1024 and 1048575', () => {
		expect(humanFileSize(1024)).toBe('1 KiB');
		expect(humanFileSize(2048)).toBe('2 KiB');
		expect(humanFileSize(1000000)).toBe('977 KiB');
		expect(humanFileSize(1023900)).toBe('1,000 KiB')
	});

	it('should convert to MiB for appropriate values', () => {
		expect(humanFileSize(1048576)).toBe('1 MiB');
		expect(humanFileSize(2097152)).toBe('2 MiB');
	});

	it('should convert to GiB for appropriate values', () => {
		expect(humanFileSize(1073741824)).toBe('1 GiB');
	});

	it('should apply the multiplier correctly', () => {
		expect(humanFileSize(2, 1024)).toBe('2 KiB');
		expect(humanFileSize(2, 1048576)).toBe('2 MiB');
	});
});
