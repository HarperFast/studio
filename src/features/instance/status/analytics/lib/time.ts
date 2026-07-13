const axisFormatter = new Intl.DateTimeFormat(undefined, {
	hour: 'numeric',
	minute: '2-digit',
});

const tooltipFormatter = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	second: '2-digit',
});

const rangeFormatter = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
});

const tzFormatter = new Intl.DateTimeFormat(undefined, {
	timeZoneName: 'short',
});

export function formatAxisTick(timestamp: number): string {
	return axisFormatter.format(new Date(timestamp));
}

export function formatTooltipTime(timestamp: number): string {
	return tooltipFormatter.format(new Date(timestamp));
}

export function formatTimeRange(startTime: number, endTime: number): string {
	const start = rangeFormatter.format(new Date(startTime));
	const end = rangeFormatter.format(new Date(endTime));
	return `${start} – ${end}`;
}

export function getTimezoneAbbr(): string {
	const parts = tzFormatter.formatToParts(new Date());
	const tz = parts.find((p) => p.type === 'timeZoneName');
	return tz?.value ?? 'UTC';
}
