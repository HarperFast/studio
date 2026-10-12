import { z } from 'zod';

// A `datetime-local` value with the year pinned to four digits; the input itself accepts up to six.
const DATETIME_LOCAL_VALUE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;

function toDateTimeLocalValue(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${
		pad(date.getMinutes())
	}:${pad(date.getSeconds())}`;
}

function endOfDay(now: Date): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

/** The Unix epoch, as a local `datetime-local` value. */
export const LOG_DATE_MIN = toDateTimeLocalValue(new Date(0));

export function getLogDateMax(now: Date = new Date()): string {
	return toDateTimeLocalValue(endOfDay(now));
}

/** Why `value` cannot bound a log query, or `undefined` when it can. */
export function getLogDateError(value: string | null | undefined, now: Date = new Date()): string | undefined {
	if (!value) {
		return undefined;
	}
	const time = Date.parse(value);
	if (!DATETIME_LOCAL_VALUE.test(value) || Number.isNaN(time)) {
		return 'Enter a valid date and time with a 4-digit year';
	}
	if (time < 0) {
		return 'Date cannot be before 1970 (UTC)';
	}
	if (time > endOfDay(now).getTime()) {
		return 'Date cannot be after today';
	}
	return undefined;
}

const logDate = z.string().or(z.undefined()).or(z.null()).optional().superRefine((value, ctx) => {
	const message = getLogDateError(value);
	if (message) {
		ctx.addIssue({ code: 'custom', message });
	}
});

export const LogFiltersFormSchema = z.object({
	limit: z.string().or(z.undefined()).or(z.null()).optional(),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).or(z.undefined()).or(z.null())
		.optional(),
	from: logDate,
	until: logDate,
	log_name: z.enum(['hdb.log', 'system.log']).or(z.undefined()).or(z.null()).optional(),
	filter: z.string().or(z.undefined()).or(z.null()).optional(),
});
