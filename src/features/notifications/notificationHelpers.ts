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

/** Sort weight by severity, most serious first. Single source of truth shared by the bell and center. */
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export { BellIcon };

/**
 * Result of parsing a Harper `Date` field: absent (null/empty), a valid instant, or present-but-
 * unreadable. Distinguishing "absent" from "invalid" lets the active-window checks fail *closed* on a
 * value we can't trust, rather than treating it as an open bound (which reads as "never expires").
 */
type ParsedInstant = { kind: 'absent' } | { kind: 'valid'; ms: number } | { kind: 'invalid' };

function parseInstant(value: string | number | null | undefined): ParsedInstant {
	if (value === null || value === undefined) { return { kind: 'absent' }; }
	if (typeof value === 'number') { return Number.isFinite(value) ? { kind: 'valid', ms: value } : { kind: 'invalid' }; }
	// Guard against unexpected API types (boolean/object) so `.trim()` can't throw.
	if (typeof value !== 'string') { return { kind: 'invalid' }; }
	const trimmed = value.trim();
	if (!trimmed) { return { kind: 'absent' }; }
	if (/^\d+$/.test(trimmed)) { return { kind: 'valid', ms: Number(trimmed) }; }
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? { kind: 'invalid' } : { kind: 'valid', ms: parsed };
}

/**
 * Harper's `Date` scalar can serialise as an ISO string or epoch-ms (or a numeric string). Normalise to
 * epoch ms, or `null` when absent *or* unparseable. Active-window logic uses `parseInstant` directly so
 * it can tell those apart; `toMs` is for display/sort callers that treat both as "no value".
 */
export function toMs(value: string | number | null | undefined): number | null {
	const parsed = parseInstant(value);
	return parsed.kind === 'valid' ? parsed.ms : null;
}

/**
 * A notification is active when `now` falls within its [startAt, endAt] window (open bounds allowed).
 * Fails **closed**: an unreadable bound makes the window untrustworthy, so we treat the notice as not
 * active rather than as "no bound" — otherwise a bad `endAt` would pin a stale notice on-screen forever.
 */
export function isActive(notification: SystemStatusNotification, nowMs: number): boolean {
	const start = parseInstant(notification.startAt);
	const end = parseInstant(notification.endAt);
	if (start.kind === 'invalid' || end.kind === 'invalid') { return false; }
	if (start.kind === 'valid' && nowMs < start.ms) { return false; }
	if (end.kind === 'valid' && nowMs > end.ms) { return false; }
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
	const start = parseInstant(notification.startAt);
	const end = parseInstant(notification.endAt);
	// Mirror isActive's fail-closed stance: never advertise an unreadable schedule as "Active".
	if (start.kind === 'invalid' || end.kind === 'invalid') {
		return { state: 'expired', label: 'Schedule unavailable' };
	}
	if (start.kind === 'valid' && nowMs < start.ms) {
		return { state: 'upcoming', label: `Starts ${formatAbsolute(start.ms)}` };
	}
	if (end.kind === 'valid' && nowMs > end.ms) {
		return { state: 'expired', label: `Ended ${formatAbsolute(end.ms)}` };
	}
	if (end.kind === 'valid') {
		return { state: 'active', label: `Active until ${formatAbsolute(end.ms)}` };
	}
	return { state: 'active', label: 'Active' };
}

export type NotificationLink =
	| { kind: 'external'; href: string }
	| { kind: 'internal'; href: string };

// Schemes we'll render in an href. Anything else with a scheme (javascript:, data:, vbscript:, …) is
// rejected outright — an allowlist rather than a blocklist so unsafe schemes can't slip through as a
// stored-XSS vector when a notification's URL is authored by an admin (or, later, an org/user).
const SAFE_EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Classify a notification's optional deep link. A protocol-relative URL or one with a safe scheme is
 * external (opens in a new tab); a scheme-less value is an internal router path; anything with an
 * unsafe/unknown scheme yields no link.
 */
export function parseNotificationLink(url: string | null | undefined): NotificationLink | null {
	if (!url) { return null; }
	const trimmed = url.trim();
	if (!trimmed) { return null; }
	// Protocol-relative (`//host`) resolves against https → external.
	if (trimmed.startsWith('//')) { return { kind: 'external', href: trimmed }; }
	const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
	if (scheme) {
		return SAFE_EXTERNAL_SCHEMES.has(scheme) ? { kind: 'external', href: trimmed } : null;
	}
	// No scheme → internal router path; normalise to a leading slash.
	return { kind: 'internal', href: trimmed.startsWith('/') ? trimmed : `/${trimmed}` };
}
