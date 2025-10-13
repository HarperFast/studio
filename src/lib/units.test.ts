import { describe, expect, it } from 'vitest';
import { determineUnits, scaleValueToUnits } from '@/lib/units.ts';

describe('determineUnits', () => {
	it('should return unsupported base units as-is', () => {
		expect(determineUnits('foos', 0)).toBe('foos');
	});

	it("should return 'B' for bytes < 1,024", () => {
		expect(determineUnits('bytes', 0)).toBe('B');
		expect(determineUnits('bytes', 100)).toBe('B');
		expect(determineUnits('bytes', 1023)).toBe('B');
	});

	it("should return 'KiB' for bytes >= 1,024 && < 1,048,576", () => {
		expect(determineUnits('bytes', 1024)).toBe('KiB');
		expect(determineUnits('bytes', 2048)).toBe('KiB');
		expect(determineUnits('bytes', 1048575)).toBe('KiB');
	});

	it("should return 'MiB' for bytes >= 1,048,576 && < 1,073,741,824", () => {
		expect(determineUnits('bytes', 1048576)).toBe('MiB');
		expect(determineUnits('bytes', 10000000)).toBe('MiB');
		expect(determineUnits('bytes', 1073741823)).toBe('MiB');
	});

	it("should return 'secs' for seconds < 60", () => {
		expect(determineUnits('secs', 0)).toBe('secs');
		expect(determineUnits('secs', 20)).toBe('secs');
		expect(determineUnits('secs', 59)).toBe('secs');
	});

	it("should return 'mins' for seconds >= 60 && < 3,600", () => {
		expect(determineUnits('secs', 60)).toBe('mins');
		expect(determineUnits('secs', 2345)).toBe('mins');
		expect(determineUnits('secs', 3599)).toBe('mins');
	});

	it("should return 'hrs' for seconds >= 3,600", () => {
		expect(determineUnits('secs', 3600)).toBe('hrs');
		expect(determineUnits('secs', 345679)).toBe('hrs');
	});
});

describe('scaleValueToUnits', () => {
	it('should leave values with unsupported units as-is', () => {
		expect(scaleValueToUnits(12345, 'bytes', 'bazs')).toBe(12345);
		expect(scaleValueToUnits(6789, 'secs', 'quxes')).toBe(6789);
	});

	it('should leave bytes scaled to bytes as-is', () => {
		expect(scaleValueToUnits(0, 'bytes', 'B')).toBe(0);
		expect(scaleValueToUnits(100, 'bytes', 'B')).toBe(100);
		expect(scaleValueToUnits(1024, 'bytes', 'B')).toBe(1024);
		expect(scaleValueToUnits(1000000, 'bytes', 'B')).toBe(1000000);
	});

	it('should scale bytes to KiB', () => {
		expect(scaleValueToUnits(0, 'bytes', 'KiB')).toBe(0);
		expect(scaleValueToUnits(1023, 'bytes', 'KiB')).toBeCloseTo(1);
		expect(scaleValueToUnits(1024, 'bytes', 'KiB')).toBe(1);
		expect(scaleValueToUnits(1024 * 2, 'bytes', 'KiB')).toBe(2);
		expect(scaleValueToUnits(1024 * 10, 'bytes', 'KiB')).toBe(10);
	});

	it('should scale bytes to MiB', () => {
		expect(scaleValueToUnits(0, 'bytes', 'MiB')).toBe(0);
		expect(scaleValueToUnits(1024, 'bytes', 'MiB')).toBeCloseTo(0.001);
		expect(scaleValueToUnits(1024 * 1024, 'bytes', 'MiB')).toBe(1);
		expect(scaleValueToUnits(1024 * 1024 * 2, 'bytes', 'MiB')).toBe(2);
		expect(scaleValueToUnits(1024 * 1024 * 10, 'bytes', 'MiB')).toBe(10);
	});

	it('should leave secs scaled to secs as-is', () => {
		expect(scaleValueToUnits(0, 'secs', 'secs')).toBe(0);
		expect(scaleValueToUnits(100, 'secs', 'secs')).toBe(100);
		expect(scaleValueToUnits(1024, 'secs', 'secs')).toBe(1024);
		expect(scaleValueToUnits(1000000, 'secs', 'secs')).toBe(1000000);
	});

	it('should scale secs to mins', () => {
		expect(scaleValueToUnits(0, 'secs', 'mins')).toBe(0);
		expect(scaleValueToUnits(59, 'secs', 'mins')).toBeLessThan(1);
		expect(scaleValueToUnits(60, 'secs', 'mins')).toBe(1);
		expect(scaleValueToUnits(600, 'secs', 'mins')).toBe(10);
		expect(scaleValueToUnits(3600, 'secs', 'mins')).toBe(60);
	});

	it('should scale secs to hrs', () => {
		expect(scaleValueToUnits(0, 'secs', 'hrs')).toBe(0);
		expect(scaleValueToUnits(60 * 59, 'secs', 'hrs')).toBeLessThan(1);
		expect(scaleValueToUnits(60 * 60, 'secs', 'hrs')).toBe(1);
		expect(scaleValueToUnits(60 * 600, 'secs', 'hrs')).toBe(10);
		expect(scaleValueToUnits(60 * 3600, 'secs', 'hrs')).toBe(60);
	});
});
