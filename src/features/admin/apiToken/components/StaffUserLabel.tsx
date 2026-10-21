import { getStaffUserQueryOptions } from '@/features/admin/apiToken/queries/staffUsers';
import { useQuery } from '@tanstack/react-query';

/**
 * A user id as their address, with the id behind a hover. The token API hands out ids only; every
 * staff role holds user:read, so the lookup works for whoever can see the list. Until it answers,
 * or if it never does, the id stands in.
 */
export function StaffUserLabel({ userId, selfId }: { userId: string; selfId: string }) {
	const { data: user } = useQuery(getStaffUserQueryOptions(userId));
	const suffix = userId === selfId ? ' (you)' : '';
	if (!user) {
		return <span className="font-mono text-xs">{userId}{suffix}</span>;
	}
	return <span title={userId}>{user.email}{suffix}</span>;
}
