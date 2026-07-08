import { Button } from '@/components/ui/button';
import { useInviteUserToOrganizationRole } from '@/features/organization/mutations/inviteUserToOrganizationRole';
import { SchemaUser } from '@/integrations/api/api.gen';
import { MailIcon } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Resend a pending user's org invite. The backend treats a repeat POST /UserInvite for an
 * already-invited (still pending) user as a resend, so this reuses the same invite mutation and
 * payload ({ email, roleId }) — we just target the user's existing role.
 *
 * Rendered only for PENDING rows (see the users table definition). Stops row-click propagation so
 * clicking it doesn't also open the edit modal.
 */
export function ResendInviteButton({ user }: { user: SchemaUser }) {
	const { mutate: inviteUser, isPending } = useInviteUserToOrganizationRole();
	const roleId = user.roles?.[0]?.id;

	const onClick = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation();
			if (!user.email || !roleId) {
				toast.error('Cannot resend invite: this user has no email or role.');
				return;
			}
			inviteUser(
				{ email: user.email, roleId },
				{
					onSuccess: () => toast.success(`Invitation resent to ${user.email}.`),
					onError: () => toast.error(`Failed to resend invitation to ${user.email}.`),
				},
			);
		},
		[inviteUser, roleId, user.email],
	);

	return (
		<Button
			variant="ghost"
			size="sm"
			className="h-auto px-2 py-0 align-middle text-sm"
			onClick={onClick}
			disabled={isPending || !roleId}
		>
			<MailIcon /> Resend invite
		</Button>
	);
}
