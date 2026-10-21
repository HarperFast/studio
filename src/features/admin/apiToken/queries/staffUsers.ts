import { apiClient } from '@/config/apiClient';
import { SchemaUser } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';

/** Just what the owner picker and the token table need from a user record. */
export type StaffUserSummary = Pick<SchemaUser, 'id' | 'email' | 'firstname' | 'lastname'>;

/**
 * The one domain central-manager treats as Harper staff (its isHarperEmail). The mint refuses any
 * other owner, so the picker offers no one else.
 */
export const STAFF_EMAIL_DOMAIN = 'harperdb.io';

/** Matches rendered at once; the rest stay reachable by typing more of the address. */
export const STAFF_USER_SEARCH_LIMIT = 20;

export function isStaffEmail(email: string): boolean {
	return email.split('@')[1]?.toLowerCase() === STAFF_EMAIL_DOMAIN;
}

function toSummary(user: SchemaUser): StaffUserSummary {
	return { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname };
}

/**
 * GET /Admin/User/?email=<prefix>* → active, verified users whose address starts with `prefix`,
 * narrowed to the staff domain. Only a staff member can own a token, and nothing in the user record
 * says which role an account holds, so the domain is the closest filter the API offers; the server
 * still has the last word on the mint.
 */
export async function searchStaffUsers(prefix: string): Promise<StaffUserSummary[]> {
	const query = [
		// A trailing `*` is Harper's prefix match; the rest of the value is URL-encoded as usual.
		`email=${encodeURIComponent(prefix.trim().toLowerCase())}*`,
		'status=ACTIVE',
		'isVerified=true',
		'sort(email)',
		`limit(0,${STAFF_USER_SEARCH_LIMIT})`,
	].join('&');
	// Trailing slash required to get the records array rather than the collection descriptor.
	const { data } = await apiClient.get(`/Admin/User/?${query}` as '/Admin/User/');
	return (data as unknown as SchemaUser[]).filter((user) => isStaffEmail(user.email)).map(toSummary);
}

export const staffUsersQueryKey = ['fabric-admin', 'users'];

export function searchStaffUsersQueryOptions(prefix: string) {
	return queryOptions({
		queryKey: [...staffUsersQueryKey, 'search', prefix.trim().toLowerCase()],
		queryFn: () => searchStaffUsers(prefix),
		retry: false,
	});
}

/** GET /Admin/User/:id → one user, for naming a token's owner and minter. */
export async function getStaffUser(id: string): Promise<StaffUserSummary> {
	const { data } = await apiClient.get(`/Admin/User/${encodeURIComponent(id)}` as '/Admin/User/{id}');
	return toSummary(data as unknown as SchemaUser);
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
