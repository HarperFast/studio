import type { PresetOption, TimeRange } from '../types/analytics.ts';

export const TIME_PRESETS: PresetOption[] = [
	{ label: '15m', value: '15m', durationMs: 15 * 60 * 1000 },
	{ label: '30m', value: '30m', durationMs: 30 * 60 * 1000 },
	{ label: '1h', value: '1h', durationMs: 60 * 60 * 1000 },
	{ label: '6h', value: '6h', durationMs: 6 * 60 * 60 * 1000 },
	{ label: '12h', value: '12h', durationMs: 12 * 60 * 60 * 1000 },
	{ label: '1d', value: '1d', durationMs: 24 * 60 * 60 * 1000 },
	{ label: '3d', value: '3d', durationMs: 3 * 24 * 60 * 60 * 1000 },
	{ label: '1w', value: '1w', durationMs: 7 * 24 * 60 * 60 * 1000 },
	{ label: '1mo', value: '1mo', durationMs: 30 * 24 * 60 * 60 * 1000 },
];

export function getTimeRangeFromPreset(preset: string, now: number = Date.now()): TimeRange {
	const found = TIME_PRESETS.find((p) => p.value === preset);
	if (!found) { throw new Error(`Unknown preset: ${preset}`); }
	return { startTime: now - found.durationMs, endTime: now };
}

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

export function formatBytes(bytes: number): string {
	if (bytes === 0) { return '0 B'; }
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const k = 1000; // SI
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const value = bytes / k ** i;
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatBytesPerMin(bytes: number): string {
	if (bytes === 0) { return '0 B/min'; }
	const units = ['B/min', 'KB/min', 'MB/min', 'GB/min', 'TB/min'];
	const k = 1000;
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const value = bytes / k ** i;
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
