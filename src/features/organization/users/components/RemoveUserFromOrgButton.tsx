import { Button } from '@/components/ui/button';
import { LogOut, MailX, TriangleAlertIcon, UserMinus } from 'lucide-react';
import { useState } from 'react';

type OrgRemovalKind = 'leave' | 'remove' | 'cancel-invite';

const COPY: Record<OrgRemovalKind, { idle: string; back: string; confirm: string; busy: string; warning: string }> = {
	leave: {
		idle: 'Leave organization',
		back: 'Cancel',
		confirm: 'Confirm leave',
		busy: 'Leaving…',
		warning:
			'You’ll lose access to this organization and everything in it. You won’t be able to return unless another member invites you back.',
	},
	remove: {
		idle: 'Remove from organization',
		back: 'Cancel',
		confirm: 'Confirm removal',
		busy: 'Removing…',
		warning:
			'This revokes their access to this organization and everything in it. Their Harper account isn’t deleted, and they can be added back later.',
	},
	// "Keep invite", not "Cancel": beside a button that cancels the invite, a bare "Cancel" is ambiguous.
	'cancel-invite': {
		idle: 'Cancel invite',
		back: 'Keep invite',
		confirm: 'Confirm cancellation',
		busy: 'Cancelling…',
		// Cancelling deletes the invitation itself, which central manager allows only when you manage every
		// organization it is for, so it can reach past this one.
		warning:
			'This cancels their invitation, so signing up with this address won’t add them to this organization. An invitation to another organization you manage may be cancelled with it.',
	},
};

const ICON = { leave: LogOut, remove: UserMinus, 'cancel-invite': MailX } satisfies Record<OrgRemovalKind, unknown>;

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
	kind,
	isPending,
	onConfirm,
}: {
	kind: OrgRemovalKind;
	isPending: boolean;
	onConfirm: () => void;
}) {
	const [confirming, setConfirming] = useState(false);

	const copy = COPY[kind];
	const Icon = ICON[kind];

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
					{copy.back}
				</Button>
				{/* Not autoFocused: focus on the destructive button would let a stray Enter or double-click confirm. */}
				<Button
					type="button"
					variant="destructive"
					disabled={isPending}
					onClick={onConfirm}
				>
					<Icon /> {isPending ? copy.busy : copy.confirm}
				</Button>
			</div>
		</div>
	);
}
