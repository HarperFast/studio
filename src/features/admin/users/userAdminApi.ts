// Central manager's staff-only `/Admin/User` endpoint. The generated SDK types the paths but not the membership preview
// or the deactivation result, so those are hand-typed. The endpoint enforces every permission the page gates on.
import { apiClient } from '@/config/apiClient';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export interface OrganizationMembership {
	organizationId: string;
	organizationName: string | null;
	roleNames: string[];
}

/** `lastAdmin`: the user is the organization's only admin who could sign in, so a deactivation keeps them there. */
export interface MembershipPreview extends OrganizationMembership {
	lastAdmin: boolean;
}

export interface AdminUser {
	id: string;
	email: string;
	firstname?: string | null;
	lastname?: string | null;
	status?: string | null;
	organizations: MembershipPreview[];
}

export interface DeactivateUserResult {
	id: string;
	status: string;
	removedFrom: OrganizationMembership[];
	retainedIn: OrganizationMembership[];
}

const BASE = '/Admin/User/';

const userAdminQueryKey = ['fabric-admin', 'users'] as const;

/** Matches how central manager stores addresses, so the exact-match lookup finds mixed-case input. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function findUser(email: string): Promise<AdminUser | null> {
	const { data } = await apiClient.get(`${BASE}?email=${encodeURIComponent(email)}` as '/Admin/User/');
	const live = (data as unknown as Array<{ id: string; status?: string }>).filter((user) => user.status !== 'DELETED');
	// The address stays out of error text: query errors reach the console, and from there RUM.
	if (live.length > 1) { throw new Error('More than one live account uses this address.'); }
	if (!live.length) { return null; }

	const { data: user } = await apiClient.get(
		`${BASE}${encodeURIComponent(live[0].id)}?previewMembershipRemoval=true` as '/Admin/User/{id}',
	);
	// A central manager without the preview answers the plain record; refuse it rather than offer a deactivation
	// whose effect can't be shown.
	if (!Array.isArray((user as unknown as Partial<AdminUser>).organizations)) {
		throw new Error('This central manager cannot preview organization memberships yet.');
	}
	return user as unknown as AdminUser;
}

/** Callers never send a blank address: the endpoint would answer every user instead of a match. */
export function adminUserQueryOptions(email: string) {
	return queryOptions({
		queryKey: [...userAdminQueryKey, email],
		queryFn: () => findUser(email),
		enabled: email.length > 0,
	});
}

/**
 * Failures toast through the global MutationCache handler, which already words an unanswered write as "outcome
 * unknown". Every settle refetches, because a failed answer can still be a committed write.
 */
export function useDeactivateUserMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (userId: string) => {
			const { data } = await apiClient.patch(`${BASE}${encodeURIComponent(userId)}` as '/Admin/User/{id}', {
				status: 'DEACTIVATED',
			});
			return data as unknown as DeactivateUserResult;
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: userAdminQueryKey }),
	});
}
