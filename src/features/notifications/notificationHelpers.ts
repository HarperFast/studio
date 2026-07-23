import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { BellIcon, InfoIcon, type LucideIcon, OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react';

/**
 * Notifications are backed by the central-manager `SystemStatus` table, whose `type` is a freeform
 * string. We normalise it to one of three severities for styling. Per the #1259 decision we assume a
 * *serious* severity by default, so an unrecognised `type` maps to `critical`.
 */
export type Severity = 'critical' | 'warning' | 'info';

export interface SeverityConfig {
	severity: Severity;
	label: string;
	Icon: LucideIcon;
	/** Badge variant used for the per-notification severity chip. */
	badgeVariant: 'destructive' | 'warning' | 'secondary';
	/** Banner strip classes (light + dark). */
	bannerClass: string;
	/** Accent colour for the severity icon. */
	iconClass: string;
}

export const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
	critical: {
		severity: 'critical',
		label: 'Critical',
		Icon: OctagonAlertIcon,
		badgeVariant: 'destructive',
		bannerClass: 'bg-destructive/10 border-destructive/40 text-foreground',
		iconClass: 'text-destructive',
	},
	warning: {
		severity: 'warning',
		label: 'Warning',
		Icon: TriangleAlertIcon,
		badgeVariant: 'warning',
		bannerClass: 'bg-yellow/10 border-yellow/40 text-foreground',
		iconClass: 'text-yellow',
	},
	info: {
		severity: 'info',
		label: 'Info',
		Icon: InfoIcon,
		badgeVariant: 'secondary',
		bannerClass: 'bg-secondary/20 border-secondary/50 text-foreground',
		iconClass: 'text-secondary-foreground',
	},
};

const CRITICAL_TYPES = new Set(['critical', 'error', 'outage', 'incident', 'down', 'danger']);
const WARNING_TYPES = new Set(['warning', 'warn', 'maintenance', 'degraded', 'notice']);
const INFO_TYPES = new Set(['info', 'information', 'informational', 'success', 'ok']);

/** Map a raw `SystemStatus.type` to a severity. Unknown types are treated as serious (`critical`). */
export function getSeverity(type: string | null | undefined): Severity {
	const normalised = (type ?? '').trim().toLowerCase();
	if (WARNING_TYPES.has(normalised)) { return 'warning'; }
	if (INFO_TYPES.has(normalised)) { return 'info'; }
	if (CRITICAL_TYPES.has(normalised)) { return 'critical'; }
	return 'critical';
}

export function getSeverityConfig(type: string | null | undefined): SeverityConfig {
	return SEVERITY_CONFIG[getSeverity(type)];
}

export { BellIcon };

/**
 * Harper's `Date` scalar can serialise as an ISO string or an epoch-ms number (and numeric strings
 * have been seen in the wild). Normalise any of those to epoch ms, or `null` when absent/unparseable.
 */
export function toMs(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) { return null; }
	if (typeof value === 'number') { return Number.isFinite(value) ? value : null; }
	const trimmed = value.trim();
	if (!trimmed) { return null; }
	if (/^\d+$/.test(trimmed)) { return Number(trimmed); }
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? null : parsed;
}

/** A notification is active when `now` falls within its [startAt, endAt] window (open bounds allowed). */
export function isActive(notification: SystemStatusNotification, nowMs: number): boolean {
	const start = toMs(notification.startAt);
	const end = toMs(notification.endAt);
	if (start !== null && nowMs < start) { return false; }
	if (end !== null && nowMs > end) { return false; }
	return true;
}

export type WindowState = 'active' | 'upcoming' | 'expired';

export interface WindowStatus {
	state: WindowState;
	label: string;
}

function formatAbsolute(ms: number): string {
	return new Date(ms).toLocaleString();
}

/** Human label describing where `now` sits relative to a notification's active window. */
export function getWindowStatus(notification: SystemStatusNotification, nowMs: number): WindowStatus {
	const start = toMs(notification.startAt);
	const end = toMs(notification.endAt);
	if (start !== null && nowMs < start) {
		return { state: 'upcoming', label: `Starts ${formatAbsolute(start)}` };
	}
	if (end !== null && nowMs > end) {
		return { state: 'expired', label: `Ended ${formatAbsolute(end)}` };
	}
	if (end !== null) {
		return { state: 'active', label: `Active until ${formatAbsolute(end)}` };
	}
	return { state: 'active', label: 'Active' };
}

export type NotificationLink =
	| { kind: 'external'; href: string }
	| { kind: 'internal'; href: string };

/**
 * Classify a notification's optional deep link. An absolute URL (any scheme, or protocol-relative) is
 * external and opens in a new tab; anything else is treated as an internal router path.
 */
export function parseNotificationLink(url: string | null | undefined): NotificationLink | null {
	if (!url) { return null; }
	const trimmed = url.trim();
	if (!trimmed) { return null; }
	// Protocol-relative (`//host`), or has an explicit scheme (`https:`, `mailto:`, …) → external.
	if (trimmed.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
		return { kind: 'external', href: trimmed };
	}
	// Internal router path — normalise to a leading slash.
	return { kind: 'internal', href: trimmed.startsWith('/') ? trimmed : `/${trimmed}` };
}
