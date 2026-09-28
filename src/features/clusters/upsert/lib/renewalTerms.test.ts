import { describe, expect, it } from 'vitest';
import { renewalTerms } from './renewalTerms';

const on = (day: number) => new Date(2026, 8, day, 12);

describe('renewalTerms', () => {
	it('names the day of the month the cluster renews on', () => {
		expect(renewalTerms(1, on(1))).toBe('It renews automatically on the 1st of each month.');
		expect(renewalTerms(1, on(22))).toBe('It renews automatically on the 22nd of each month.');
		expect(renewalTerms(1, on(23))).toBe('It renews automatically on the 23rd of each month.');
	});

	it('uses th for the teens', () => {
		expect(renewalTerms(1, on(11))).toBe('It renews automatically on the 11th of each month.');
		expect(renewalTerms(1, on(12))).toBe('It renews automatically on the 12th of each month.');
		expect(renewalTerms(1, on(13))).toBe('It renews automatically on the 13th of each month.');
	});

	it('says what happens in shorter months for a day some months lack', () => {
		expect(renewalTerms(1, on(28))).toBe('It renews automatically on the 28th of each month.');
		expect(renewalTerms(1, on(29))).toBe(
			'It renews automatically on the 29th of each month (around the last day in shorter months).',
		);
	});

	it('warns about shorter months when the UTC day is past the 28th even if the local one is not', () => {
		const lateOn28th = new Date(2026, 0, 28, 12);
		const utc29th = { getDate: () => 28, getUTCDate: () => 29 } as Date;
		expect(renewalTerms(1, lateOn28th)).toBe('It renews automatically on the 28th of each month.');
		expect(renewalTerms(1, utc29th)).toBe(
			'It renews automatically on the 28th of each month (around the last day in shorter months).',
		);
	});

	it('states a longer term, and falls back when the plan has none', () => {
		expect(renewalTerms(3, on(5))).toBe('It renews automatically every 3 months, on the 5th.');
		expect(renewalTerms(false, on(5))).toBe('It renews automatically.');
	});

	// An edit keeps the old renewal day unless it charges for something, and only the server decides that.
	it('names no day when the start of the period is not known', () => {
		expect(renewalTerms(1, null)).toBe('It renews automatically each month.');
		expect(renewalTerms(3, null)).toBe('It renews automatically every 3 months.');
	});
});
