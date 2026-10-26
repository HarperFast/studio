import { Skeleton } from '@/components/ui/skeleton';
import { DeactivateDialog } from '@/features/admin/users/components/Deactivation';
import { EmptyState } from '@/features/admin/users/components/EmptyState';
import { OrganizationCard } from '@/features/admin/users/components/OrganizationCard';
import { UserProfileCard } from '@/features/admin/users/components/UserProfileCard';
import { AdminUser, userDetailsQueryOptions } from '@/features/admin/users/userAdminApi';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Building2Icon, TriangleAlertIcon, UserXIcon } from 'lucide-react';
import { useState } from 'react';

export function UserDetailsPage() {
	const { userId } = useParams({ strict: false }) as { userId: string };
	// Keyed so moving to another account drops everything held for the last one, an open confirmation included.
	return <UserDetailsView key={userId} userId={userId} />;
}

function UserDetailsView({ userId }: { userId: string }) {
	const { data: user, isPending, isError, error } = useQuery(userDetailsQueryOptions(userId));
	const [deactivating, setDeactivating] = useState<AdminUser | null>(null);

	return (
		<>
			{isPending
				? <DetailsSkeleton />
				: user
				? (
					<>
						{isError && <Callout>Could not refresh this account; showing the last one loaded.</Callout>}
						<UserDetails user={user} onDeactivate={() => setDeactivating(user)} />
					</>
				)
				: isError
				? <Callout>{error?.message || 'Could not load this account.'}</Callout>
				: (
					<EmptyState icon={<UserXIcon />} title="No such account">
						{`No account has the ID ${userId}.`}
					</EmptyState>
				)}

			{deactivating && <DeactivateDialog user={deactivating} onClose={() => setDeactivating(null)} />}
		</>
	);
}

function UserDetails({ user, onDeactivate }: { user: AdminUser; onDeactivate: () => void }) {
	return (
		<div className="space-y-8">
			<UserProfileCard user={user} onDeactivate={onDeactivate} />

			<section>
				<h2 className="mb-3 text-lg font-light">Organizations</h2>
				{user.organizations.length
					? (
						<ul className="space-y-3">
							{user.organizations.map((membership) => (
								<OrganizationCard key={membership.organizationId} membership={membership} />
							))}
						</ul>
					)
					: (
						<EmptyState icon={<Building2Icon />} title="No organizations">
							Not a member of any organization.
						</EmptyState>
					)}
			</section>
		</div>
	);
}

function Callout({ children }: { children: string }) {
	return (
		<p className="mb-4 flex items-center gap-2 rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
			<TriangleAlertIcon className="size-4 shrink-0" />
			{children}
		</p>
	);
}

function DetailsSkeleton() {
	return (
		<div className="space-y-8" aria-busy aria-label="Loading account">
			<Skeleton className="h-52 w-full rounded-xl" />
			<div className="space-y-3">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-28 w-full rounded-xl" />
				<Skeleton className="h-16 w-full rounded-xl" />
			</div>
		</div>
	);
}
