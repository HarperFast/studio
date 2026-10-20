import { toMs } from '@/features/notifications/notificationHelpers';

export const WINDOW_INPUT_MIN = '1970-01-01T00:00';
// Also what stops Chromium's year field at four digits; without a `max` it takes up to six.
export const WINDOW_INPUT_MAX = '9999-12-31T23:59';

const DATETIME_LOCAL_VALUE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;
const BOUND_LABEL = { start: 'Start', end: 'End' } as const;

type WindowBound = keyof typeof BOUND_LABEL;

type ParsedWindowBound = { ok: true; iso: string | null } | { ok: false; error: string };

export function toInputValue(value: string | number | null | undefined): string {
	const ms = toMs(value);
	if (ms === null) { return ''; }
	const date = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${
		pad(date.getHours())
	}:${pad(date.getMinutes())}`;
}

/**
 * Anything the user typed must never come back as `iso: null`, which saves as "no bound". That is why
 * `badInput` (the input's `validity.badInput`) is needed: a half-typed control exposes an empty `value`.
 */
export function parseWindowBound(value: string, bound: WindowBound, badInput = false): ParsedWindowBound {
	if (badInput) {
		return { ok: false, error: `${BOUND_LABEL[bound]} time is incomplete. Finish the date and time, or clear it.` };
	}
	if (!value) { return { ok: true, iso: null }; }
	const ms = Date.parse(value);
	if (!DATETIME_LOCAL_VALUE.test(value) || Number.isNaN(ms)) {
		return { ok: false, error: `${BOUND_LABEL[bound]} time needs a valid date with a 4-digit year.` };
	}
	if (ms < Date.parse(WINDOW_INPUT_MIN)) {
		return { ok: false, error: `${BOUND_LABEL[bound]} time cannot be before 1970.` };
	}
	return { ok: true, iso: new Date(ms).toISOString() };
}
