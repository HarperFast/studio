import { apiClient } from '@/config/apiClient';
import { SchemaUser } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

export type StaffUserSummary = Pick<SchemaUser, 'id' | 'email' | 'firstname' | 'lastname'>;

/** The one domain central-manager treats as Harper staff (its isHarperEmail). */
const STAFF_EMAIL_DOMAIN = 'harperdb.io';

export const STAFF_USER_SEARCH_LIMIT = 20;
export const STAFF_USER_SEARCH_PAGE_SIZE = 100;
export const STAFF_USER_SEARCH_PAGE_LIMIT = 5;

export interface StaffUserSearch {
	staff: StaffUserSummary[];
	/** The page limit ended the search before the table ran out: a longer prefix may find more. */
	truncated: boolean;
}

export function isStaffEmail(email: string): boolean {
	return email.split('@')[1]?.toLowerCase() === STAFF_EMAIL_DOMAIN;
}

function toSummary(user: SchemaUser): StaffUserSummary {
	return { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname };
}

/**
 * GET /Admin/User/?email=<prefix>* → active, verified staff whose address starts with `prefix`.
 * The user table holds customers too and offers no suffix match, so pages are read until enough
 * staff turn up or the table runs out; the server still has the last word on the mint.
 */
export async function searchStaffUsers(prefix: string, signal?: AbortSignal): Promise<StaffUserSearch> {
	const staff: StaffUserSummary[] = [];
	for (let page = 0; page < STAFF_USER_SEARCH_PAGE_LIMIT; page++) {
		const start = page * STAFF_USER_SEARCH_PAGE_SIZE;
		const query = [
			// The FIQL comparator, not a trailing `*`: the deployed Harper line (5.3) reads `*` as literal.
			`email=starts_with=${encodeURIComponent(prefix.trim().toLowerCase())}`,
			'status=ACTIVE',
			'isVerified=true',
			'sort(email)',
			`limit(${start},${start + STAFF_USER_SEARCH_PAGE_SIZE})`,
		].join('&');
		// Trailing slash required to get the records array rather than the collection descriptor.
		const { data } = await apiClient.get(`/Admin/User/?${query}` as '/Admin/User/', { signal });
		const rows = data as unknown as SchemaUser[];
		staff.push(...rows.filter((user) => isStaffEmail(user.email)).map(toSummary));
		if (staff.length >= STAFF_USER_SEARCH_LIMIT || rows.length < STAFF_USER_SEARCH_PAGE_SIZE) {
			// Cut at the limit with a full page behind it: the next staff member may be past the cut.
			const truncated = staff.length > STAFF_USER_SEARCH_LIMIT || rows.length === STAFF_USER_SEARCH_PAGE_SIZE;
			return { staff: staff.slice(0, STAFF_USER_SEARCH_LIMIT), truncated };
		}
	}
	return { staff, truncated: true };
}

const staffUsersQueryKey = ['fabric-admin', 'users'];

export function searchStaffUsersQueryOptions(prefix: string) {
	return queryOptions({
		queryKey: [...staffUsersQueryKey, 'search', prefix.trim().toLowerCase()],
		queryFn: ({ signal }) => searchStaffUsers(prefix, signal),
		retry: false,
	});
}

/**
 * What naming a token's owner or minter found: the user, `removed` for an account that no longer
 * exists (a 404), or null when the lookup failed some other way.
 */
export type StaffUserLookup = StaffUserSummary | 'removed' | null;

/**
 * GET /Admin/User/:id → one user, for naming a token's owner and minter. A failure never throws:
 * the id stands in, and a label is not worth a toast or a RUM error per missing user.
 */
export async function getStaffUser(id: string): Promise<StaffUserLookup> {
	try {
		const { data } = await apiClient.get(`/Admin/User/${encodeURIComponent(id)}` as '/Admin/User/{id}');
		return toSummary(data as unknown as SchemaUser);
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 404) { return 'removed'; }
		console.debug('Could not name a token user; showing its id', id, error);
		return null;
	}
}

export function getStaffUserQueryOptions(id: string) {
	return queryOptions({
		queryKey: [...staffUsersQueryKey, id],
		queryFn: () => getStaffUser(id),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});
}
