import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './timeText';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
	it.each([
		[30 * DAY, 'In 30 days'],
		[DAY, 'Tomorrow'],
		[3 * HOUR, 'In 3 hours'],
		[10 * MINUTE, 'In 10 minutes'],
		[-5 * MINUTE, '5 minutes ago'],
		[-2 * HOUR, '2 hours ago'],
		[-DAY, 'Yesterday'],
		[-12 * DAY, '12 days ago'],
	])('reads %d ms from now as "%s"', (offset, expected) => {
		expect(formatRelativeTime(at(offset), NOW)).toBe(expected);
	});
});
