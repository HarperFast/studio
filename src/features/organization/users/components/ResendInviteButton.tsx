import { Button } from '@/components/ui/button';
import { useInviteUserToOrganizationRole } from '@/features/organization/mutations/inviteUserToOrganizationRole';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
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
	// Reads the org from the current route (same as the page's other permission checks).
	const { update } = useOrganizationRolePermissions();
	const { mutate: inviteUser, isPending } = useInviteUserToOrganizationRole();
	const roleId = user.roles?.[0]?.id;

	const onClick = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation();
			if (!user.email || !roleId) {
				toast.error('Cannot resend invite: this user has no email or role.');
				return;
			}
			// The global MutationCache.onError (react-query/queryClient) already surfaces failures with
			// the server's message, so only the success toast is local here — avoids double-toasting.
			inviteUser(
				{ email: user.email, roleId },
				{
					onSuccess: () => toast.success(`Invitation resent to ${user.email}.`),
				},
			);
		},
		[inviteUser, roleId, user.email],
	);

	// Resending an invite is a write; gate it on the same org-role update permission as the page's
	// other write affordances (Add user, edit) so view-only users don't see a clickable button.
	if (!update) {
		return null;
	}

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
