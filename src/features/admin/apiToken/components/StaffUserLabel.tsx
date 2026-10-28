import { getStaffUserQueryOptions, StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { useQuery } from '@tanstack/react-query';

/**
 * A user id as their address, with the id behind a hover. The token API hands out ids only; every
 * staff role holds user:read, so the lookup works for whoever can see the list. Until it answers,
 * or if it never does, the id stands in.
 */
export function StaffUserLabel({ userId, self }: { userId: string; self: StaffUserSummary }) {
	const isSelf = userId === self.id;
	const { data } = useQuery({ ...getStaffUserQueryOptions(userId), enabled: !isSelf });
	const user = isSelf ? self : data;
	const suffix = isSelf ? ' (you)' : '';
	if (!user || user === 'removed') {
		return <span className="font-mono text-xs">{userId}{suffix}</span>;
	}
	return <span title={userId}>{user.email}{suffix}</span>;
}
