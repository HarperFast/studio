import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
	AdminUser,
	DeactivateUserResult,
	MembershipDetails,
	OrganizationMembership,
	useDeactivateUserMutation,
	userDetailsQueryOptions,
} from '@/features/admin/users/userAdminApi';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

const formatTime = (value?: string | null) => (value == null ? '—' : new Date(value).toLocaleString());

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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
				? <Skeleton className="h-60 w-full" />
				: user
				? (
					<>
						{isError && (
							<p className="mb-3 text-sm text-destructive">
								Could not refresh this account; showing the last one loaded.
							</p>
						)}
						<UserDetails user={user} onDeactivate={() => setDeactivating(user)} />
					</>
				)
				: isError
				? <p className="text-sm text-destructive">{error?.message || 'Could not load this account.'}</p>
				: <p className="text-sm text-muted-foreground">No account has the ID {userId}.</p>}

			{deactivating && <DeactivateDialog user={deactivating} onClose={() => setDeactivating(null)} />}
		</>
	);
}

function UserDetails({ user, onDeactivate }: { user: AdminUser; onDeactivate: () => void }) {
	const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
	const removable = user.organizations.filter((membership) => !membership.lastAdmin);
	const deactivated = user.status === 'DEACTIVATED';
	// Central manager answers a status change on a deleted account with 404.
	const deleted = user.status === 'DELETED';
	const clusterCount = user.organizations.reduce((total, membership) => total + membership.clusters.length, 0);

	return (
		<div className="space-y-6">
			<div className="rounded-md border p-4">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<span className="block truncate">{name || user.email}</span>
						<span className="block truncate text-sm text-muted-foreground">{user.email}</span>
						<span className="block truncate font-mono text-xs text-muted-foreground">{user.id}</span>
					</div>
					<Badge variant={deactivated || deleted ? 'destructive' : 'outline'}>{user.status ?? 'unknown'}</Badge>
				</div>
				<dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
					<Fact label="Created" value={formatTime(user.createdAt)} />
					<Fact label="Last sign-in" value={formatTime(user.lastLoginDate)} />
					<Fact label="Last active" value={formatTime(user.lastAccessedAt)} />
					<Fact label="Email verified" value={user.isVerified ? 'Yes' : 'No'} />
				</dl>
			</div>

			<section>
				<h2 className="text-sm font-medium">
					{plural(user.organizations.length, 'organization')} · {plural(clusterCount, 'cluster')}
				</h2>
				{user.organizations.length
					? (
						<ul className="mt-2 space-y-3">
							{user.organizations.map((membership) => (
								<MembershipCard key={membership.organizationId} membership={membership} marked={!deleted} />
							))}
						</ul>
					)
					: <p className="mt-2 text-sm text-muted-foreground">Not a member of any organization.</p>}
			</section>

			<section className="space-y-3 rounded-md border p-4">
				<h2 className="text-sm font-medium">Deactivate</h2>
				<p className="text-sm text-muted-foreground">
					Deactivating an account ends its sessions and blocks sign-in. It also leaves every organization that keeps
					another admin who can sign in; where it is the last one, its membership stays so the organization is never
					left without an admin.
				</p>
				{deleted
					? <p className="text-sm text-muted-foreground">This account is deleted, so it cannot be deactivated.</p>
					: deactivated && !removable.length
					? <p className="text-sm text-muted-foreground">Deactivated, and in no organization it could leave.</p>
					: (
						<div className="flex items-center justify-end gap-3">
							{deactivated && (
								<span className="text-sm text-muted-foreground">
									Already deactivated: deactivating again removes the memberships marked for removal.
								</span>
							)}
							<Button variant="destructive" onClick={onDeactivate}>Deactivate</Button>
						</div>
					)}
			</section>
		</div>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="truncate">{value}</dd>
		</div>
	);
}

const clusterStatusVariant = (status: string | null) =>
	status === 'RUNNING' ? 'success' : status === 'FAILED' ? 'destructive' : 'outline';

function MembershipCard({ membership, marked }: { membership: MembershipDetails; marked: boolean }) {
	const { organizationId } = membership;
	return (
		<li className="rounded-md border">
			<div className="flex items-center justify-between gap-3 p-3 text-sm">
				<span className="min-w-0">
					<Link to={buildAbsoluteLinkToPage({ organizationId })} className="block truncate hover:underline">
						{organizationLabel(membership)}
					</Link>
					<span className="block truncate text-xs text-muted-foreground">{membership.roleNames.join(', ')}</span>
				</span>
				{marked && (membership.lastAdmin
					? <Badge variant="warning">Kept: last admin</Badge>
					: <Badge variant="outline">Removed on deactivation</Badge>)}
			</div>
			{membership.clusters.length
				? (
					<ul className="divide-y border-t">
						{membership.clusters.map((cluster) => (
							<li key={cluster.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
								<Link
									to={buildAbsoluteLinkToPage({ organizationId, clusterId: cluster.id })}
									className="min-w-0 truncate hover:underline"
								>
									{cluster.name}
								</Link>
								<Badge variant={clusterStatusVariant(cluster.status)}>{cluster.status ?? 'unknown'}</Badge>
							</li>
						))}
					</ul>
				)
				: <p className="border-t px-3 py-2 text-xs text-muted-foreground">No clusters.</p>}
		</li>
	);
}

const organizationLabel = (membership: OrganizationMembership) =>
	membership.organizationName || membership.organizationId;

/**
 * Mount only while open. It holds the account as it was when Deactivate was pressed, so the refetch that follows the
 * PATCH can't change or unmount it, whatever that refetch finds.
 */
function DeactivateDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
	const mutation = useDeactivateUserMutation();
	const [result, setResult] = useState<DeactivateUserResult | null>(null);
	const removed = user.organizations.filter((membership) => !membership.lastAdmin);
	const kept = user.organizations.filter((membership) => membership.lastAdmin);

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{result ? 'User deactivated' : `Deactivate ${user.email}?`}</DialogTitle>
					<DialogDescription>
						{result
							? 'Sessions ended and sign-in is blocked.'
							: 'Their sessions end now and they can no longer sign in.'}
					</DialogDescription>
				</DialogHeader>

				{result
					? (
						<div className="space-y-3 text-sm">
							<MembershipList title="Removed from" memberships={result.removedFrom} empty="No organization." />
							<MembershipList
								title="Kept in, as the last admin"
								memberships={result.retainedIn}
								empty="No organization."
							/>
						</div>
					)
					: (
						<div className="space-y-3 text-sm">
							<MembershipList title="Will be removed from" memberships={removed} empty="No organization." />
							<MembershipList
								title="Will stay in, as the last admin"
								memberships={kept}
								empty="No organization."
							/>
							<p className="text-muted-foreground">
								This preview can change before you confirm; the result lists what actually happened.
							</p>
						</div>
					)}

				<DialogFooter>
					{result
						? <Button variant="submit" onClick={onClose}>Done</Button>
						: (
							<>
								<Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
								<Button
									variant="destructive"
									disabled={mutation.isPending}
									onClick={() => mutation.mutate(user.id, { onSuccess: setResult, onError: onClose })}
								>
									{mutation.isPending ? 'Deactivating…' : 'Deactivate'}
								</Button>
							</>
						)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function MembershipList({ title, memberships, empty }: {
	title: string;
	memberships: OrganizationMembership[] | null;
	empty: string;
}) {
	return (
		<div>
			<h3 className="font-medium">{title}</h3>
			{memberships === null
				? <p className="mt-1 text-muted-foreground">Not reported by the server.</p>
				: memberships.length
				? (
					<ul className="mt-1 list-disc pl-5">
						{memberships.map((membership) => <li key={membership.organizationId}>{organizationLabel(membership)}</li>)}
					</ul>
				)
				: <p className="mt-1 text-muted-foreground">{empty}</p>}
		</div>
	);
}
