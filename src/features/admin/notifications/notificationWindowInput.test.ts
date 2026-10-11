import { describe, expect, it } from 'vitest';
import { parseWindowBound, toInputValue, WINDOW_INPUT_MAX, WINDOW_INPUT_MIN } from './notificationWindowInput';

describe('parseWindowBound', () => {
	it('treats an empty value as an open bound', () => {
		expect(parseWindowBound('', 'start')).toEqual({ ok: true, iso: null });
		expect(parseWindowBound('', 'end')).toEqual({ ok: true, iso: null });
	});

	it('converts a local datetime-local value to the UTC instant it names', () => {
		expect(parseWindowBound('2026-10-11T09:30', 'start')).toEqual({
			ok: true,
			iso: new Date(2026, 9, 11, 9, 30).toISOString(),
		});
		expect(parseWindowBound('2026-10-11T09:30:15', 'end')).toEqual({
			ok: true,
			iso: new Date(2026, 9, 11, 9, 30, 15).toISOString(),
		});
	});

	it('accepts both ends of the input range', () => {
		expect(parseWindowBound(WINDOW_INPUT_MIN, 'start').ok).toBe(true);
		expect(parseWindowBound(WINDOW_INPUT_MAX, 'end').ok).toBe(true);
	});

	it('refuses the 5- and 6-digit years the native input lets a user type, instead of saving no bound', () => {
		expect(parseWindowBound('20266-01-01T10:00', 'end')).toEqual({
			ok: false,
			error: 'End time needs a valid date with a 4-digit year.',
		});
		expect(parseWindowBound('202666-01-01T10:00', 'start')).toEqual({
			ok: false,
			error: 'Start time needs a valid date with a 4-digit year.',
		});
	});

	it('refuses values that are not a datetime-local value', () => {
		expect(parseWindowBound('tomorrow', 'start').ok).toBe(false);
		expect(parseWindowBound('2026-10-11', 'end').ok).toBe(false);
		expect(parseWindowBound('+020266-01-01T10:00', 'end').ok).toBe(false);
		expect(parseWindowBound('2026-13-01T10:00', 'end').ok).toBe(false);
	});

	it('refuses a half-typed value, which the input reports as an empty value plus badInput', () => {
		expect(parseWindowBound('', 'end', true)).toEqual({
			ok: false,
			error: 'End time is incomplete. Finish the date and time, or clear it.',
		});
		expect(parseWindowBound('', 'start', false)).toEqual({ ok: true, iso: null });
	});

	it('refuses a time before 1970, which is what a 2-digit year typed into the input becomes', () => {
		expect(parseWindowBound('1969-12-31T23:59', 'start')).toEqual({
			ok: false,
			error: 'Start time cannot be before 1970.',
		});
		expect(parseWindowBound('0026-01-01T10:00', 'end').ok).toBe(false);
		expect(parseWindowBound('0226-01-01T10:00', 'end')).toEqual({
			ok: false,
			error: 'End time cannot be before 1970.',
		});
	});
});

describe('toInputValue', () => {
	it('renders a stored instant as local minutes, and empty for no value', () => {
		expect(toInputValue(new Date(2026, 9, 11, 9, 30, 45).toISOString())).toBe('2026-10-11T09:30');
		expect(toInputValue(null)).toBe('');
		expect(toInputValue('not a date')).toBe('');
	});

	it('pads a stored year below 1000 so the input shows it rather than blanking the field', () => {
		const stored = new Date(2026, 0, 1, 10, 0);
		stored.setFullYear(226);
		expect(toInputValue(stored.toISOString())).toBe('0226-01-01T10:00');
	});

	it('round-trips through parseWindowBound', () => {
		const iso = new Date(2026, 9, 11, 9, 30).toISOString();
		expect(parseWindowBound(toInputValue(iso), 'start')).toEqual({ ok: true, iso });
	});
});
