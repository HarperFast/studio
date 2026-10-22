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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
	AdminUser,
	adminUserQueryOptions,
	DeactivateUserResult,
	MembershipPreview,
	normalizeEmail,
	OrganizationMembership,
	useDeactivateUserMutation,
} from '@/features/admin/users/userAdminApi';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';

export function UsersAdminIndex() {
	const [input, setInput] = useState('');
	// Held in state, never in the URL: addresses must stay out of the page URL that RUM and third-party pixels read.
	const [email, setEmail] = useState('');
	const { data: user, isFetching, isError, error, refetch } = useQuery(adminUserQueryOptions(email));

	const lookUp = (event: FormEvent) => {
		event.preventDefault();
		const next = normalizeEmail(input);
		// The same address keeps the same query key, so it needs an explicit refetch to retry or refresh the preview.
		if (next === email) { void refetch(); }
		else { setEmail(next); }
	};

	return (
		<div className="max-w-4xl">
			<h1 className="text-2xl font-light">Users</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Deactivating an account ends its sessions and blocks sign-in. It also leaves every organization that keeps
				another admin who can sign in; where it is the last one, its membership stays so the organization is never left
				without an admin.
			</p>

			<form className="mt-6 flex items-end gap-3" onSubmit={lookUp}>
				<div className="flex-1 space-y-2">
					<Label htmlFor="admin-user-email">Email</Label>
					<Input
						id="admin-user-email"
						type="email"
						autoComplete="off"
						placeholder="name@example.com"
						value={input}
						onChange={(event) => setInput(event.target.value)}
					/>
				</div>
				<Button type="submit" variant="submit" disabled={!input.trim() || isFetching}>Look up</Button>
			</form>

			<div className="mt-6">
				{!email
					? null
					: isFetching && user === undefined
					? <Skeleton className="h-40 w-full" />
					: user
					? (
						// A failed refetch keeps the loaded account, so an open deactivation result stays mounted.
						<>
							{isError && (
								<p className="mb-3 text-sm text-destructive">
									Could not refresh this account; showing the last one loaded.
								</p>
							)}
							<UserDetails user={user} />
						</>
					)
					: isError
					? <p className="text-sm text-destructive">{error?.message || 'Could not look up that address.'}</p>
					: <p className="text-sm text-muted-foreground">No account uses {email}.</p>}
			</div>
		</div>
	);
}

function UserDetails({ user }: { user: AdminUser }) {
	const [confirming, setConfirming] = useState(false);
	const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
	const removable = user.organizations.filter((membership) => !membership.lastAdmin);
	const deactivated = user.status === 'DEACTIVATED';

	return (
		<div className="space-y-4 rounded-md border p-4">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<span className="block truncate">{name || user.email}</span>
					<span className="block truncate text-sm text-muted-foreground">{user.email}</span>
					<span className="block truncate font-mono text-xs text-muted-foreground">{user.id}</span>
				</div>
				<Badge variant={deactivated ? 'destructive' : 'outline'}>{user.status ?? 'unknown'}</Badge>
			</div>

			<div>
				<h2 className="text-sm font-medium">Organizations</h2>
				{user.organizations.length
					? (
						<ul className="mt-2 divide-y rounded-md border">
							{user.organizations.map((membership) => (
								<MembershipRow key={membership.organizationId} membership={membership} />
							))}
						</ul>
					)
					: <p className="mt-2 text-sm text-muted-foreground">Not a member of any organization.</p>}
			</div>

			{deactivated && !removable.length
				? <p className="text-sm text-muted-foreground">Deactivated, and in no organization it could leave.</p>
				: (
					<div className="flex items-center justify-end gap-3">
						{deactivated && (
							<span className="text-sm text-muted-foreground">
								Already deactivated: deactivating again removes the memberships marked for removal.
							</span>
						)}
						<Button variant="destructive" onClick={() => setConfirming(true)}>Deactivate</Button>
					</div>
				)}

			{confirming && <DeactivateDialog user={user} onClose={() => setConfirming(false)} />}
		</div>
	);
}

function MembershipRow({ membership }: { membership: MembershipPreview }) {
	return (
		<li className="flex items-center justify-between gap-3 p-3 text-sm">
			<span className="min-w-0">
				<span className="block truncate">{organizationLabel(membership)}</span>
				<span className="block truncate text-xs text-muted-foreground">{membership.roleNames.join(', ')}</span>
			</span>
			{membership.lastAdmin
				? <Badge variant="warning">Kept: last admin</Badge>
				: <Badge variant="outline">Will be removed</Badge>}
		</li>
	);
}

const organizationLabel = (membership: OrganizationMembership) =>
	membership.organizationName || membership.organizationId;

/** Mount only while open, so a result never outlives the session that produced it. */
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
									onClick={() => mutation.mutate(user.id, { onSuccess: setResult })}
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
	memberships: OrganizationMembership[];
	empty: string;
}) {
	return (
		<div>
			<h3 className="font-medium">{title}</h3>
			{memberships.length
				? (
					<ul className="mt-1 list-disc pl-5">
						{memberships.map((membership) => <li key={membership.organizationId}>{organizationLabel(membership)}</li>)}
					</ul>
				)
				: <p className="mt-1 text-muted-foreground">{empty}</p>}
		</div>
	);
}
