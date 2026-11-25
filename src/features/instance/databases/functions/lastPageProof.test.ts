import { describe, expect, it } from 'vitest';
import { lastPageProofHolds } from './lastPageProof';

// Page 1 at 20 a page: the proven page ends at record 40.
const pageSize = 20;
const provenAt = (totalRecords: number | undefined) => ({ pageIndex: 1, totalRecords });
const exact = (totalRecords: number | undefined) => ({ totalRecords, isEstimated: false });
const estimated = (totalRecords: number) => ({ totalRecords, isEstimated: true });

describe('lastPageProofHolds', () => {
	it('holds while the count is the one the step set out with', () => {
		expect(lastPageProofHolds(provenAt(40), exact(40), pageSize)).toBe(true);
		expect(lastPageProofHolds(provenAt(1000), estimated(1000), pageSize)).toBe(true);
		expect(lastPageProofHolds(provenAt(undefined), exact(undefined), pageSize)).toBe(true);
	});

	it('is retired by a count that goes away', () => {
		expect(lastPageProofHolds(provenAt(40), exact(undefined), pageSize)).toBe(false);
	});

	describe('a count that first arrives', () => {
		it('holds when it is exactly the records through the proven page', () => {
			expect(lastPageProofHolds(provenAt(undefined), exact(40), pageSize)).toBe(true);
		});

		it('is retired when it says records follow the page', () => {
			expect(lastPageProofHolds(provenAt(undefined), exact(41), pageSize)).toBe(false);
		});

		it('is retired when it disagrees with the full page the probe started from', () => {
			expect(lastPageProofHolds(provenAt(undefined), exact(39), pageSize)).toBe(false);
		});

		it('is retired when it is an estimate, even one that matches', () => {
			expect(lastPageProofHolds(provenAt(undefined), estimated(40), pageSize)).toBe(false);
		});
	});

	describe('a count that shrinks', () => {
		it('holds when it is still no more than the records through the proven page', () => {
			expect(lastPageProofHolds(provenAt(40), exact(39), pageSize)).toBe(true);
			expect(lastPageProofHolds(provenAt(45), exact(40), pageSize)).toBe(true);
			expect(lastPageProofHolds(provenAt(40), exact(0), pageSize)).toBe(true);
		});

		it('is retired when it still says records follow the page', () => {
			expect(lastPageProofHolds(provenAt(45), exact(42), pageSize)).toBe(false);
		});

		it('is retired when it is an estimate', () => {
			expect(lastPageProofHolds(provenAt(40), estimated(30), pageSize)).toBe(false);
		});
	});

	describe('a count that grows', () => {
		it('is retired past the proven page', () => {
			expect(lastPageProofHolds(provenAt(40), exact(41), pageSize)).toBe(false);
		});

		it('is retired even when the proven page could still hold it', () => {
			expect(lastPageProofHolds(provenAt(38), exact(40), pageSize)).toBe(false);
		});
	});
});
