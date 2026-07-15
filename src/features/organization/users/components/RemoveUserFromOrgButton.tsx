import { Button } from '@/components/ui/button';
import { LogOut, TriangleAlertIcon, UserMinus } from 'lucide-react';
import { useState } from 'react';

/**
 * A user belongs to an org purely by having org roles, so "removing" them means dropping all
 * of those roles at once. That's a destructive, non-obvious action (see issue #1505), so this
 * button makes it explicit and requires a second, deliberate click to confirm — the same inline
 * confirmation pattern used for deleting secrets (see `SecretModals`). Removing yourself is the
 * same action with gentler "leave" wording.
 *
 * The confirm control is intentionally right-aligned, away from the idle button's left-aligned
 * footprint, so a fast double-click can't land on "Confirm" and skip the confirmation step.
 */
export function RemoveUserFromOrgButton({
	isSelf,
	isPending,
	onConfirm,
}: {
	isSelf: boolean;
	isPending: boolean;
	onConfirm: () => void;
}) {
	const [confirming, setConfirming] = useState(false);

	const copy = isSelf
		? {
			idle: 'Leave organization',
			confirm: 'Confirm leave',
			busy: 'Leaving…',
			warning:
				'You’ll lose access to this organization and everything in it. You won’t be able to return unless another member invites you back.',
		}
		: {
			idle: 'Remove from organization',
			confirm: 'Confirm removal',
			busy: 'Removing…',
			warning:
				'This revokes their access to this organization and everything in it. Their Harper account isn’t deleted, and they can be added back later.',
		};
	const Icon = isSelf ? LogOut : UserMinus;

	if (!confirming) {
		return (
			<div className="flex justify-start">
				<Button
					type="button"
					variant="destructiveOutline"
					disabled={isPending}
					onClick={() => setConfirming(true)}
				>
					<Icon /> {copy.idle}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<p
				role="alert"
				className="flex items-start gap-2 text-sm text-muted-foreground border border-amber-500/50 rounded-md p-3"
			>
				<TriangleAlertIcon className="size-4 text-amber-500 shrink-0 mt-0.5" />
				<span>{copy.warning}</span>
			</p>
			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="ghostOutline"
					disabled={isPending}
					onClick={() => setConfirming(false)}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="destructive"
					disabled={isPending}
					onClick={onConfirm}
					autoFocus
				>
					<Icon /> {isPending ? copy.busy : copy.confirm}
				</Button>
			</div>
		</div>
	);
}
