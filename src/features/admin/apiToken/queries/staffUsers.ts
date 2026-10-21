import { apiClient } from '@/config/apiClient';
import { SchemaUser } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';

/** Just what the owner picker and the token table need from a user record. */
export type StaffUserSummary = Pick<SchemaUser, 'id' | 'email' | 'firstname' | 'lastname'>;

/** The one domain central-manager treats as Harper staff (its isHarperEmail). */
const STAFF_EMAIL_DOMAIN = 'harperdb.io';

/** Matches rendered at once; the rest stay reachable by typing more of the address. */
export const STAFF_USER_SEARCH_LIMIT = 20;
/** Rows read per request while looking for staff among customers who share the prefix. */
export const STAFF_USER_SEARCH_PAGE_SIZE = 100;
/** Requests per search before giving up on a prefix that mostly matches customers. */
export const STAFF_USER_SEARCH_PAGE_LIMIT = 5;

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
export async function searchStaffUsers(prefix: string): Promise<StaffUserSummary[]> {
	const staff: StaffUserSummary[] = [];
	for (let page = 0; page < STAFF_USER_SEARCH_PAGE_LIMIT; page++) {
		const start = page * STAFF_USER_SEARCH_PAGE_SIZE;
		const query = [
			// A trailing `*` is Harper's prefix match; the rest of the value is URL-encoded as usual.
			`email=${encodeURIComponent(prefix.trim().toLowerCase())}*`,
			'status=ACTIVE',
			'isVerified=true',
			'sort(email)',
			`limit(${start},${start + STAFF_USER_SEARCH_PAGE_SIZE})`,
		].join('&');
		// Trailing slash required to get the records array rather than the collection descriptor.
		const { data } = await apiClient.get(`/Admin/User/?${query}` as '/Admin/User/');
		const rows = data as unknown as SchemaUser[];
		staff.push(...rows.filter((user) => isStaffEmail(user.email)).map(toSummary));
		if (staff.length >= STAFF_USER_SEARCH_LIMIT || rows.length < STAFF_USER_SEARCH_PAGE_SIZE) { break; }
	}
	return staff.slice(0, STAFF_USER_SEARCH_LIMIT);
}

const staffUsersQueryKey = ['fabric-admin', 'users'];

export function searchStaffUsersQueryOptions(prefix: string) {
	return queryOptions({
		queryKey: [...staffUsersQueryKey, 'search', prefix.trim().toLowerCase()],
		queryFn: () => searchStaffUsers(prefix),
		retry: false,
	});
}

/**
 * GET /Admin/User/:id → one user, for naming a token's owner and minter; null when the lookup
 * fails, since the id stands in and a label is not worth a toast or a RUM error per missing user.
 */
export async function getStaffUser(id: string): Promise<StaffUserSummary | null> {
	try {
		const { data } = await apiClient.get(`/Admin/User/${encodeURIComponent(id)}` as '/Admin/User/{id}');
		return toSummary(data as unknown as SchemaUser);
	} catch (error) {
		console.debug('Could not name a token user; showing its id', id, error);
		return null;
	}
}

export function getStaffUserQueryOptions(id: string) {
	return queryOptions({
		queryKey: [...staffUsersQueryKey, id],
		queryFn: () => getStaffUser(id),
		// An address rarely changes; the table asks for the same few ids on every render.
		staleTime: 5 * 60 * 1000,
		retry: false,
	});
}
