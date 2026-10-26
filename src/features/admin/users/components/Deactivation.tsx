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
import { organizationLabel } from '@/features/admin/users/components/OrganizationCard';
import {
	AdminUser,
	DeactivateUserResult,
	normalizeEmail,
	OrganizationMembership,
	useDeactivateUserMutation,
} from '@/features/admin/users/userAdminApi';
import { cn } from '@/lib/cn';
import { Loader2Icon, LogOutIcon, ShieldCheckIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';

/**
 * Mount only while open. It holds the account as it was when Deactivate was pressed, so the refetch that follows the
 * PATCH can't change or unmount it, whatever that refetch finds.
 */
export function DeactivateDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
	const mutation = useDeactivateUserMutation();
	const [result, setResult] = useState<DeactivateUserResult | null>(null);
	const removed = user.organizations.filter((membership) => !membership.lastAdmin);
	const kept = user.organizations.filter((membership) => membership.lastAdmin);
	const [typedEmail, setTypedEmail] = useState('');
	const confirmed = normalizeEmail(typedEmail) === normalizeEmail(user.email);

	const deactivate = () => {
		if (!confirmed || mutation.isPending) { return; }
		mutation.mutate(user.id, { onSuccess: setResult, onError: onClose });
	};

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
							<div className="space-y-2 pt-1">
								<Label htmlFor="deactivate-confirm-email" className="block font-normal">
									Type <span className="font-mono font-medium">{user.email}</span> to confirm
								</Label>
								<Input
									id="deactivate-confirm-email"
									autoFocus
									autoComplete="off"
									spellCheck={false}
									value={typedEmail}
									disabled={mutation.isPending}
									onChange={(event) => setTypedEmail(event.target.value)}
									onKeyDown={(event) => event.key === 'Enter' && deactivate()}
								/>
							</div>
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
									disabled={!confirmed || mutation.isPending}
									onClick={deactivate}
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
