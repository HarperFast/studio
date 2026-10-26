import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { organizationLabel } from '@/features/admin/users/components/OrganizationCard';
import {
	AdminUser,
	DeactivateUserResult,
	OrganizationMembership,
	useDeactivateUserMutation,
} from '@/features/admin/users/userAdminApi';
import { cn } from '@/lib/cn';
import { CircleSlashIcon, Loader2Icon, LogOutIcon, ShieldCheckIcon, UserXIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';

const organizations = (count: number) => (count === 1 ? '1 organization' : `${count} organizations`);

export function DeactivatePanel({ user, onDeactivate }: { user: AdminUser; onDeactivate: () => void }) {
	const removable = user.organizations.filter((membership) => !membership.lastAdmin).length;
	const kept = user.organizations.length - removable;
	const deactivated = user.status === 'DEACTIVATED';
	// Central manager answers a status change on a deleted account with 404.
	const deleted = user.status === 'DELETED';

	if (deleted || (deactivated && !removable)) {
		return (
			<section className="flex items-center gap-3 rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">
				<CircleSlashIcon className="size-5 shrink-0" />
				<p>
					{deleted
						? 'This account is deleted, so it cannot be deactivated.'
						: 'Deactivated, and in no organization it could leave.'}
				</p>
			</section>
		);
	}

	return (
		<section className="rounded-xl border border-red-600/40 bg-red-600/5 p-5">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
				<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-600/10 text-red-600 dark:text-red-400">
					<UserXIcon className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<h2 className="font-medium">{deactivated ? 'Finish deactivating' : 'Deactivate account'}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{deactivated
							? 'Already deactivated: deactivating again removes the memberships marked for removal.'
							: 'Ends every session and blocks sign-in.'} Leaves {organizations(removable)}
						{kept > 0 && `, and stays in ${organizations(kept)} as the last admin who can sign in`}.
					</p>
				</div>
				<Button variant="destructive" className="shrink-0" onClick={onDeactivate}>Deactivate</Button>
			</div>
		</section>
	);
}

/**
 * Mount only while open. It holds the account as it was when Deactivate was pressed, so the refetch that follows the
 * PATCH can't change or unmount it, whatever that refetch finds.
 */
export function DeactivateDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
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
						<div className="grid gap-3 sm:grid-cols-2">
							<MembershipList tone="leave" title="Removed from" memberships={result.removedFrom} />
							<MembershipList tone="stay" title="Kept in, as the last admin" memberships={result.retainedIn} />
						</div>
					)
					: (
						<div className="space-y-3">
							<div className="grid gap-3 sm:grid-cols-2">
								<MembershipList tone="leave" title="Will be removed from" memberships={removed} />
								<MembershipList tone="stay" title="Will stay in, as the last admin" memberships={kept} />
							</div>
							<p className="text-xs text-muted-foreground">
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
									{mutation.isPending && <Loader2Icon className="animate-spin" />}
									{mutation.isPending ? 'Deactivating…' : 'Deactivate'}
								</Button>
							</>
						)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const TONES: Record<'leave' | 'stay', { icon: ReactNode; box: string }> = {
	leave: { icon: <LogOutIcon className="size-3.5" />, box: 'bg-muted/40' },
	stay: { icon: <ShieldCheckIcon className="size-3.5" />, box: 'border-yellow/40 bg-yellow/10' },
};

function MembershipList({ tone, title, memberships }: {
	tone: 'leave' | 'stay';
	title: string;
	memberships: OrganizationMembership[] | null;
}) {
	return (
		<div className={cn('rounded-lg border p-3 text-sm', TONES[tone].box)}>
			<h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{TONES[tone].icon}{title}</h3>
			{memberships === null
				? <p className="mt-2 text-muted-foreground">Not reported by the server.</p>
				: memberships.length
				? (
					<ul className="mt-2 space-y-1">
						{memberships.map((membership) => <li key={membership.organizationId}>{organizationLabel(membership)}</li>)}
					</ul>
				)
				: <p className="mt-2 text-muted-foreground">No organization.</p>}
		</div>
	);
}
