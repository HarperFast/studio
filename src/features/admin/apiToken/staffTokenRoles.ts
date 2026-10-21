import { StaffApiTokenRole } from '@/integrations/api/api.patch';

/** Least privilege first, so a picker's first option is the safest. */
export const STAFF_TOKEN_ROLES = [
	'fabric_readonly',
	'fabric_support',
	'fabric_staff',
	'fabric_admin',
] as const satisfies readonly StaffApiTokenRole[];

export const HOURS_PER_DAY = 24;

export interface StaffTokenLifetime {
	/** The longest lifetime POST /Admin/ApiToken accepts for the role, in whole hours. */
	maxHours: number;
	/** The lifetime the server applies when the request names none. */
	defaultHours: number;
}

/**
 * Mirrors central-manager's STAFF_API_TOKEN_LIFETIMES (src/constants/staffRoles.js). The server is
 * the authority and refuses anything longer; these only keep the form from asking for it. Lifetime
 * follows power: a read-only token can live for weeks, an admin token for hours.
 */
export const STAFF_TOKEN_LIFETIMES: Record<StaffApiTokenRole, StaffTokenLifetime> = {
	fabric_readonly: { maxHours: 14 * HOURS_PER_DAY, defaultHours: 14 * HOURS_PER_DAY },
	fabric_support: { maxHours: 7 * HOURS_PER_DAY, defaultHours: 7 * HOURS_PER_DAY },
	fabric_staff: { maxHours: 7 * HOURS_PER_DAY, defaultHours: 7 * HOURS_PER_DAY },
	fabric_admin: { maxHours: 12, defaultHours: 1 },
};

/** Days a token may go unused before it stops authenticating (central-manager's STAFF_API_TOKEN_IDLE_MS). */
export const STAFF_TOKEN_IDLE_DAYS = 5;

export function isStaffTokenRole(value: unknown): value is StaffApiTokenRole {
	return typeof value === 'string' && (STAFF_TOKEN_ROLES as readonly string[]).includes(value);
}

/** Whole days when the count divides evenly, otherwise hours: "14 days", "1 day", "36 hours", "1 hour". */
export function formatHours(hours: number): string {
	if (hours >= HOURS_PER_DAY && hours % HOURS_PER_DAY === 0) {
		const days = hours / HOURS_PER_DAY;
		return `${days} ${days === 1 ? 'day' : 'days'}`;
	}
	return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
