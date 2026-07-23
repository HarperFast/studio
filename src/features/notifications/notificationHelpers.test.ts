import {
	getSeverity,
	getWindowStatus,
	isActive,
	parseNotificationLink,
	toMs,
} from '@/features/notifications/notificationHelpers';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

function notification(overrides: Partial<SystemStatusNotification>): SystemStatusNotification {
	return { id: 'sta-1', type: 'error', message: 'hi', ...overrides };
}

const NOW = Date.UTC(2026, 6, 23, 12, 0, 0); // 2026-07-23T12:00:00Z

describe('toMs', () => {
	it('passes through finite numbers and rejects non-finite', () => {
		expect(toMs(1000)).toBe(1000);
		expect(toMs(Number.NaN)).toBeNull();
	});

	it('parses ISO strings and epoch-ms strings', () => {
		expect(toMs('2026-07-23T12:00:00.000Z')).toBe(NOW);
		expect(toMs('1690113600000')).toBe(1690113600000);
	});

	it('treats null, undefined, empty, and garbage as null', () => {
		expect(toMs(null)).toBeNull();
		expect(toMs(undefined)).toBeNull();
		expect(toMs('')).toBeNull();
		expect(toMs('not a date')).toBeNull();
	});

	it('returns null for unexpected non-string/number types instead of throwing', () => {
		expect(toMs(true as unknown as string)).toBeNull();
		expect(toMs({} as unknown as string)).toBeNull();
	});
});

describe('isActive', () => {
	it('is active with open bounds (no start, no end)', () => {
		expect(isActive(notification({ startAt: null, endAt: null }), NOW)).toBe(true);
	});

	it('is inactive before the start', () => {
		expect(isActive(notification({ startAt: NOW + 1000 }), NOW)).toBe(false);
	});

	it('is inactive after the end', () => {
		expect(isActive(notification({ endAt: NOW - 1000 }), NOW)).toBe(false);
	});

	it('is active inside the window (inclusive bounds)', () => {
		expect(isActive(notification({ startAt: NOW - 1000, endAt: NOW + 1000 }), NOW)).toBe(true);
		expect(isActive(notification({ startAt: NOW, endAt: NOW }), NOW)).toBe(true);
	});
});

describe('getWindowStatus', () => {
	it('reports upcoming, active, and expired states', () => {
		expect(getWindowStatus(notification({ startAt: NOW + 1000 }), NOW).state).toBe('upcoming');
		expect(getWindowStatus(notification({ endAt: NOW - 1000 }), NOW).state).toBe('expired');
		expect(getWindowStatus(notification({ startAt: null, endAt: null }), NOW).state).toBe('active');
		expect(getWindowStatus(notification({ endAt: NOW + 1000 }), NOW).label).toContain('Active until');
	});
});

describe('getSeverity', () => {
	it('maps known types and defaults unknown types to serious (critical)', () => {
		expect(getSeverity('error')).toBe('critical');
		expect(getSeverity('OUTAGE')).toBe('critical');
		expect(getSeverity('maintenance')).toBe('warning');
		expect(getSeverity('info')).toBe('info');
		expect(getSeverity('something-else')).toBe('critical');
		expect(getSeverity('')).toBe('critical');
		expect(getSeverity(null)).toBe('critical');
	});
});

describe('parseNotificationLink', () => {
	it('returns null for empty links', () => {
		expect(parseNotificationLink(null)).toBeNull();
		expect(parseNotificationLink('   ')).toBeNull();
	});

	it('classifies safe-scheme and protocol-relative URLs as external', () => {
		expect(parseNotificationLink('https://status.harper.io')).toEqual({
			kind: 'external',
			href: 'https://status.harper.io',
		});
		expect(parseNotificationLink('//cdn.example.com/x')?.kind).toBe('external');
		expect(parseNotificationLink('mailto:ops@harper.io')?.kind).toBe('external');
	});

	it('rejects unsafe/unknown schemes (stored-XSS defense) rather than rendering them', () => {
		expect(parseNotificationLink('javascript:alert(1)')).toBeNull();
		expect(parseNotificationLink('JavaScript:alert(1)')).toBeNull();
		expect(parseNotificationLink('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(parseNotificationLink('vbscript:msgbox(1)')).toBeNull();
		expect(parseNotificationLink('ftp://example.com/file')).toBeNull();
	});

	it('classifies relative paths as internal and normalises the leading slash', () => {
		expect(parseNotificationLink('/organizations')).toEqual({ kind: 'internal', href: '/organizations' });
		expect(parseNotificationLink('organizations/abc')).toEqual({ kind: 'internal', href: '/organizations/abc' });
	});
});
