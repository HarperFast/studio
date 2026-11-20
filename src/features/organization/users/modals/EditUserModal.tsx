import { Loading } from '@/components/Loading';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCancelUserInvite } from '@/features/organization/mutations/cancelUserInvite';
import { useRemoveUserFromOrganizationRole } from '@/features/organization/mutations/removeUserFromOrganizationRole';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { OrgUserRoleCheckbox } from '@/features/organization/users/components/OrgUserRoleCheckbox';
import { RemoveUserFromOrgButton } from '@/features/organization/users/components/RemoveUserFromOrgButton';
import { ResendInviteButton } from '@/features/organization/users/components/ResendInviteButton';
import { getOrgUserRemovalPolicy, isAdminRoleName } from '@/features/organization/users/orgUserRemovalPolicy';
import { useCloudAuth } from '@/hooks/useAuth';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaUser } from '@/integrations/api/api.gen';
import { keyBy } from '@/lib/keyBy';
import { shouldToastOwnFailure } from '@/react-query/queryClient';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { TriangleAlertIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function EditUserModal({
	closeModal,
	data,
	isModalOpen,
	onUserUpdated,
	orgUserCount,
	orgAdminCount,
}: {
	closeModal: () => void;
	data: SchemaUser;
	isModalOpen: boolean;
	onUserUpdated: () => void;
	orgUserCount: number;
	orgAdminCount: number;
}) {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const auth = useCloudAuth();
	const { update, remove } = useOrganizationRolePermissions(organizationId);
	const isSelf = auth.user?.email === data.email;
	// `!isSelf` keeps a cancellation, which deletes the user, away from your own account.
	const isPendingInvite = data.status === 'PENDING' && !isSelf;
	const [changesMade, setChangesMade] = useState<boolean>(false);

	const { canRemoveRoles, showRemovalAction, blockedReason } = getOrgUserRemovalPolicy({
		canDelete: remove,
		isSelf,
		orgUserCount,
		adminCount: orgAdminCount,
		isAdmin: (data.roles ?? []).some((role) => isAdminRoleName(role.roleName)),
		roleCount: data.roles?.length ?? 0,
	});

	const { mutateAsync: removeUserFromRole } = useRemoveUserFromOrganizationRole();
	const { mutateAsync: cancelUserInvite } = useCancelUserInvite();
	const [isRemoving, setIsRemoving] = useState(false);

	// `data.roles` comes from this org's roles payload (`collectOrgUsers`), so this never touches another
	// organization. A role that's already gone (404) counts as success, so a partial attempt can be retried.
	const unlinkOrgRoles = useCallback(async () => {
		const results = await Promise.allSettled(
			(data.roles ?? []).map((role) => removeUserFromRole({ userId: data.id, roleId: role.id })),
		);
		return results.flatMap((result) =>
			result.status === 'rejected' && (result.reason as AxiosError)?.response?.status !== 404 ? [result.reason] : []
		);
	}, [data.roles, data.id, removeUserFromRole]);

	const onRemoveFromOrg = useCallback(async () => {
		setIsRemoving(true);
		const failures = await unlinkOrgRoles();
		if (failures.some(shouldToastOwnFailure)) {
			toast.error(
				isSelf
					? 'Something went wrong leaving the organization. Please try again.'
					: `Couldn’t remove ${data.email} from the organization. Please try again.`,
			);
		} else if (failures.length === 0) {
			toast.success(
				isSelf
					? 'You’ve left the organization.'
					: `${data.email} was removed from the organization.`,
			);
		}
		// Refetch either way so the list reflects whatever actually changed, then close.
		setIsRemoving(false);
		onUserUpdated();
	}, [unlinkOrgRoles, data.email, isSelf, onUserUpdated]);

	// Not `unlinkOrgRoles`: that leaves the PENDING user holding the email's account claim, so a later
	// sign-up with the address would still resolve to this invitation.
	const onCancelInvite = useCallback(async () => {
		setIsRemoving(true);
		try {
			const outcome = await cancelUserInvite({ userId: data.id });
			if (outcome === 'cancelled') {
				toast.success(`The invitation to ${data.email} was cancelled.`);
			} else if (outcome === 'not-pending') {
				toast.info(`The invitation to ${data.email} is no longer pending. It was accepted or already cancelled.`);
			} else {
				const failures = await unlinkOrgRoles();
				if (failures.some(shouldToastOwnFailure)) {
					toast.error(`Couldn’t cancel the invitation to ${data.email}. Please try again.`);
				} else if (failures.length === 0) {
					toast.success(`The invitation to ${data.email} was removed from this organization.`, {
						description: 'They’re most likely also invited to an organization you don’t manage. Until that '
							+ 'invitation is accepted or cancelled, they can’t be invited here again.',
					});
				}
			}
		} catch (error) {
			if (shouldToastOwnFailure(error)) {
				toast.error(`Couldn’t cancel the invitation to ${data.email}. Please try again.`);
			}
		}
		setIsRemoving(false);
		onUserUpdated();
	}, [cancelUserInvite, unlinkOrgRoles, data.id, data.email, onUserUpdated]);

	return (
		<Dialog onOpenChange={changesMade ? onUserUpdated : closeModal} open={isModalOpen}>
			<DialogContent resizable>
				<DialogHeader>
					<DialogTitle>{update ? 'Edit ' : 'View '} {data.email} {isSelf ? '(yourself)' : ''}</DialogTitle>
				</DialogHeader>

				{update && (
					<DialogDescription>
						{isPendingInvite
							? 'This invitation hasn’t been accepted yet, so its role can’t be changed.'
								+ (showRemovalAction ? ' To invite them with a different role, cancel it and invite them again.' : '')
							: `Use the checkboxes to change which roles ${isSelf ? 'you have' : 'this user has'}.`
								+ (showRemovalAction
									? isSelf
										? ' To leave the organization entirely, use the button below.'
										: ' To remove this user from the organization entirely, use the button below.'
									: '')}
					</DialogDescription>
				)}

				{/* The role list loads behind its own boundary so the dialog opens (and stays closeable) immediately. */}
				<Suspense fallback={<Loading centered text="Loading roles…" className="flex-1 min-h-0" />}>
					<EditUserRolesList
						data={data}
						organizationId={organizationId}
						// Central manager refuses to add a role to a pending user, and unchecking its only role would
						// orphan the invitation (see onCancelInvite), so a pending invitation's role is read-only.
						update={update && !isPendingInvite}
						canRemove={canRemoveRoles}
						setChangesMade={setChangesMade}
					/>
				</Suspense>

				{/* Pending users haven't accepted their invite yet — offer the same resend action as the users table row. */}
				{data.status === 'PENDING' && (
					<div className="border-t border-border pt-4">
						<ResendInviteButton user={data} />
					</div>
				)}

				{showRemovalAction && (
					<div className="border-t border-border pt-4">
						<RemoveUserFromOrgButton
							kind={isPendingInvite ? 'cancel-invite' : isSelf ? 'leave' : 'remove'}
							isPending={isRemoving}
							onConfirm={isPendingInvite ? onCancelInvite : onRemoveFromOrg}
						/>
					</div>
				)}

				{blockedReason && (
					<p className="flex items-start gap-2 text-sm text-muted-foreground border border-amber-500/50 rounded-md p-3">
						<TriangleAlertIcon className="size-4 text-amber-500 shrink-0 mt-0.5" />
						<span>
							{blockedReason === 'sole-member'
								? `You’re the only member of this organization, so you can’t remove your roles or leave — it would be `
									+ `left with no one to manage it. If you no longer need this organization, terminate its clusters, then `
									+ `delete the organization from the ⋯ menu on the Organizations page.`
								: `You’re the only admin of this organization, so you can’t remove your roles or leave — it would be left `
									+ `with no one who can manage its members, roles, or clusters. Give another member the admin role first, `
									+ `then you can step back.`}
						</span>
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

function EditUserRolesList({
	data,
	organizationId,
	update,
	canRemove,
	setChangesMade,
}: {
	data: SchemaUser;
	organizationId: string;
	update: boolean;
	canRemove: boolean;
	setChangesMade: (value: boolean) => void;
}) {
	const { data: orgRoles } = useSuspenseQuery(getOrganizationRolesQueryOptions(organizationId));
	const selectedRoles = useMemo(() => data.roles ? keyBy(data.roles, 'id') : {}, [data]);

	return (
		<div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
			{orgRoles.map((orgRole) => (
				<OrgUserRoleCheckbox
					key={orgRole.id}
					readOnly={!update}
					canRemove={canRemove}
					data={data}
					orgRole={orgRole}
					selectedRoles={selectedRoles}
					setChangesMade={setChangesMade}
				/>
			))}
		</div>
	);
}
