import { Loading } from '@/components/Loading';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRemoveUserFromOrganizationRole } from '@/features/organization/mutations/removeUserFromOrganizationRole';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { OrgUserRoleCheckbox } from '@/features/organization/users/components/OrgUserRoleCheckbox';
import { RemoveUserFromOrgButton } from '@/features/organization/users/components/RemoveUserFromOrgButton';
import { getOrgUserRemovalPolicy, isAdminRoleName } from '@/features/organization/users/orgUserRemovalPolicy';
import { useCloudAuth } from '@/hooks/useAuth';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaUser } from '@/integrations/api/api.gen';
import { keyBy } from '@/lib/keyBy';
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
	const [isRemoving, setIsRemoving] = useState(false);

	// Removing a user from the org means dropping every role they hold in it. We fire one removal
	// per role; a role that's already gone (404) is treated as success so a partially-completed
	// attempt can be retried cleanly.
	const onRemoveFromOrg = useCallback(async () => {
		const roles = data.roles ?? [];
		setIsRemoving(true);
		const results = await Promise.allSettled(
			roles.map((role) => removeUserFromRole({ userId: data.id, roleId: role.id })),
		);
		const failed = results.some(
			(result) => result.status === 'rejected' && (result.reason as AxiosError)?.status !== 404,
		);
		if (failed) {
			toast.error(
				isSelf
					? 'Something went wrong leaving the organization. Please try again.'
					: `Couldn’t remove ${data.email} from the organization. Please try again.`,
			);
		} else {
			toast.success(
				isSelf
					? 'You’ve left the organization.'
					: `${data.email} was removed from the organization.`,
			);
		}
		// Refetch either way so the list reflects whatever actually changed, then close.
		setIsRemoving(false);
		onUserUpdated();
	}, [data.roles, data.id, data.email, isSelf, removeUserFromRole, onUserUpdated]);

	// TODO: Cancel invite
	return (
		<Dialog onOpenChange={changesMade ? onUserUpdated : closeModal} open={isModalOpen}>
			<DialogContent resizable>
				<DialogHeader>
					<DialogTitle>{update ? 'Edit ' : 'View '} {data.email} {isSelf ? '(yourself)' : ''}</DialogTitle>
				</DialogHeader>

				{update && (
					<DialogDescription>
						Use the checkboxes to change which roles {isSelf ? 'you have' : 'this user has'}.
						{showRemovalAction
							&& (isSelf
								? ' To leave the organization entirely, use the button below.'
								: ' To remove this user from the organization entirely, use the button below.')}
					</DialogDescription>
				)}

				{/* The role list loads behind its own boundary so the dialog opens (and stays closeable) immediately. */}
				<Suspense fallback={<Loading centered text="Loading roles…" className="flex-1 min-h-0" />}>
					<EditUserRolesList
						data={data}
						organizationId={organizationId}
						update={update}
						canRemove={canRemoveRoles}
						setChangesMade={setChangesMade}
					/>
				</Suspense>

				{showRemovalAction && (
					<div className="border-t border-border pt-4">
						<RemoveUserFromOrgButton isSelf={isSelf} isPending={isRemoving} onConfirm={onRemoveFromOrg} />
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
