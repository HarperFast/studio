// The generated SDK types these paths but not the details view or the deactivation result, so those are typed here.
import { apiClient } from '@/config/apiClient';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

export interface OrganizationMembership {
	organizationId: string;
	organizationName: string | null;
	roleNames: string[];
}

interface AdminCluster {
	id: string;
	name: string;
	status: string | null;
}

/**
 * `lastAdmin`: the user is the organization's only admin who could sign in, so a deactivation keeps them there.
 * `clusters`: the organization's clusters that have not been torn down.
 */
export interface MembershipDetails extends OrganizationMembership {
	lastAdmin: boolean;
	clusters: AdminCluster[];
}

export interface AdminUser {
	id: string;
	email: string;
	firstname?: string | null;
	lastname?: string | null;
	status?: string | null;
	isVerified?: boolean | null;
	createdAt?: string | null;
	lastLoginDate?: string | null;
	lastAccessedAt?: string | null;
	organizations: MembershipDetails[];
}

/** Null when the server's answer did not say, though the write went through. */
export interface DeactivateUserResult {
	removedFrom: OrganizationMembership[] | null;
	retainedIn: OrganizationMembership[] | null;
}

const BASE = '/Admin/User/';

const userAdminQueryKey = ['fabric-admin', 'users'] as const;

export const userDetailsQueryKey = (userId: string) => [...userAdminQueryKey, userId] as const;

/** Matches how central manager stores addresses, so the exact-match lookup finds mixed-case input. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** An answer about the data, not a failure, so it is not reported. */
export class DuplicateAccountError extends Error {}

export async function findUserIdByEmail(email: string): Promise<string | null> {
	const address = normalizeEmail(email);
	// A blank address would match every user rather than none.
	if (!address) { throw new Error('Enter an address to look up.'); }
	const { data } = await apiClient.get(`${BASE}?email=${encodeURIComponent(address)}` as '/Admin/User/');
	if (!Array.isArray(data)) { throw new Error('Central manager did not answer with a list of accounts.'); }
	const live = (data as Array<{ id: string; status?: string }>).filter((user) => user.status !== 'DELETED');
	if (live.length > 1) { throw new DuplicateAccountError('More than one live account uses this address.'); }
	return live[0]?.id ?? null;
}

async function getUserDetails(userId: string): Promise<AdminUser | null> {
	let data: unknown;
	try {
		({ data } = await apiClient.get(`${BASE}${encodeURIComponent(userId)}?details=true` as '/Admin/User/{id}'));
	} catch (error) {
		if (error instanceof AxiosError && error.response?.status === 404) { return null; }
		throw error;
	}
	// A central manager without the details view answers the plain record; refuse it rather than offer a deactivation
	// whose effect can't be shown.
	const organizations = (data as Partial<AdminUser> | undefined)?.organizations;
	if (
		!Array.isArray(organizations)
		|| organizations.some((membership) => !Array.isArray(membership.clusters) || !Array.isArray(membership.roleNames))
	) {
		throw new Error('This central manager cannot show user details yet.');
	}
	return data as AdminUser;
}

export function userDetailsQueryOptions(userId: string) {
	return queryOptions({
		queryKey: userDetailsQueryKey(userId),
		queryFn: () => getUserDetails(userId),
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
			const result = data as unknown as Partial<DeactivateUserResult> | undefined;
			return {
				removedFrom: Array.isArray(result?.removedFrom) ? result.removedFrom : null,
				retainedIn: Array.isArray(result?.retainedIn) ? result.retainedIn : null,
			};
		},
		// Not returned: the dialog would wait on the refetch before showing what the write did.
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: userAdminQueryKey });
		},
	});
}
