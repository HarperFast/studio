import { describe, expect, it } from 'vitest';
import { renewalTerms } from './renewalTerms';

// Stubbed rather than built from a local time, so the result does not depend on the machine's zone.
const on = (day: number, utcDay = day) => ({ getDate: () => day, getUTCDate: () => utcDay }) as Date;

describe('renewalTerms', () => {
	it('names the day of the month the cluster renews on', () => {
		expect(renewalTerms(1, on(1))).toBe('It renews automatically on the 1st of each month.');
		expect(renewalTerms(1, on(22))).toBe('It renews automatically on the 22nd of each month.');
		expect(renewalTerms(1, on(23))).toBe('It renews automatically on the 23rd of each month.');
		expect(renewalTerms(1, on(28))).toBe('It renews automatically on the 28th of each month.');
	});

	it('uses th for the teens', () => {
		expect(renewalTerms(1, on(11))).toBe('It renews automatically on the 11th of each month.');
		expect(renewalTerms(1, on(12))).toBe('It renews automatically on the 12th of each month.');
		expect(renewalTerms(1, on(13))).toBe('It renews automatically on the 13th of each month.');
	});

	it('names no day some months lack, since those renew earlier', () => {
		expect(renewalTerms(1, on(29))).toBe('It renews automatically each month.');
		expect(renewalTerms(1, on(31))).toBe('It renews automatically each month.');
	});

	// The cycle runs on the UTC calendar; when that is already a different date, the local day can drift.
	it('names no day when the local and UTC dates differ', () => {
		expect(renewalTerms(1, on(1, 30))).toBe('It renews automatically each month.');
		expect(renewalTerms(1, on(28, 29))).toBe('It renews automatically each month.');
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
