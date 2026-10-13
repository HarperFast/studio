const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatCompactDate(value: string | Date) {
	return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatFullTimestamp(value: string | Date) {
	return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' });
}

/** "In 30 days", "3 hours ago", "Tomorrow": the largest whole unit, capitalized for a table cell. */
export function formatRelativeTime(value: string | Date, now = Date.now()) {
	const deltaMs = new Date(value).getTime() - now;
	const absMs = Math.abs(deltaMs);
	const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] = absMs < HOUR_MS
		? [deltaMs / MINUTE_MS, 'minute']
		: absMs < DAY_MS
		? [deltaMs / HOUR_MS, 'hour']
		: [deltaMs / DAY_MS, 'day'];
	const text = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(amount), unit);
	return text.charAt(0).toUpperCase() + text.slice(1);
}
