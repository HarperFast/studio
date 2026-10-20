import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useDeleteOrganizationRole } from '@/features/organization/mutations/deleteOrganizationRole';
import { useUpdateOrganizationRole } from '@/features/organization/mutations/updateOrganizationRole';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { getOrganizationRoleInfoQueryOptions } from '@/features/organization/queries/getOrganizationRoleInfo';
import { RolePermissionsEditor } from '@/features/organization/roles/components/RolePermissionsEditor';
import { fromRoleInfo, RoleInfo, RolePermissions, toPayload } from '@/features/organization/roles/rolePermissions';
import { useCloudAuth } from '@/hooks/useAuth';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { shouldToastOwnFailure } from '@/react-query/queryClient';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeletionContent } from './ConfirmDeletionContent';

export function EditOrganizationRoleModal({
	data,
	isModalOpen,
	closeModal,
}: {
	data: SchemaOrganizationRole;
	isModalOpen: boolean;
	closeModal: (madeChanges: boolean) => void;
}) {
	const onOpenChanges = useCallback(() => closeModal(false), [closeModal]);
	return (
		<Dialog onOpenChange={onOpenChanges} open={isModalOpen}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
				{
					/*
					Render the dialog shell (overlay + close button) immediately and load the role's
					details behind an inner Suspense boundary. Opening a role now shows a loading state
					inside the modal — and stays closeable — instead of bubbling up and blanking the list.
				*/
				}
				<Suspense fallback={<EditOrganizationRoleModalLoading roleName={data.roleName} />}>
					<EditOrganizationRoleModalContent data={data} closeModal={closeModal} />
				</Suspense>
			</DialogContent>
		</Dialog>
	);
}

function EditOrganizationRoleModalLoading({ roleName }: { roleName: string }) {
	return (
		<>
			<DialogTitle>Role "{roleName}"</DialogTitle>
			<Loading centered text="Loading role…" className="flex-1 min-h-0" />
		</>
	);
}

function EditOrganizationRoleModalContent({
	data,
	closeModal,
}: {
	data: SchemaOrganizationRole;
	closeModal: (madeChanges: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { data: roleInfo } = useSuspenseQuery(
		getOrganizationRoleInfoQueryOptions({ roleId: data.id, organizationId: data.organizationId }),
	);
	const { data: organization } = useQuery(getOrganizationQueryOptions(data.organizationId));
	const auth = useCloudAuth();
	const isSelf = auth.user?.roles?.[data.organizationId]?.id === data.id;
	const isAdminRole = data.roleName === 'admin';
	const { update, remove } = useOrganizationRolePermissions(data.organizationId);
	const canEdit = update && !isSelf && !isAdminRole;
	const canDelete = remove && !isSelf && !isAdminRole;
	const { mutate: updateOrganizationRole, isPending: isRoleUpdatePending } = useUpdateOrganizationRole();
	const { mutate: deleteOrganizationRole, isPending: isRoleDeletionPending } = useDeleteOrganizationRole();
	const [isConfirmingRoleDeletion, setIsConfirmingRoleDeletion] = useState(false);

	// The role as this edit found it: the 10 s poll must not turn another admin's change into an edit here.
	const [initialPermissions] = useState(() => fromRoleInfo(roleInfo as unknown as RoleInfo));
	const [permissions, setPermissions] = useState<RolePermissions>(initialPermissions);
	const [isPermissionsValid, setIsPermissionsValid] = useState(true);
	const isDirty = JSON.stringify(permissions) !== JSON.stringify(initialPermissions);

	const onRoleDeleteClick = useCallback(() => {
		deleteOrganizationRole(
			{ roleId: data.id },
			{
				onSuccess: () => {
					toast.success('Role deleted.');
					closeModal(true);
				},
				onError: (error: Error | unknown) => {
					if (!shouldToastOwnFailure(error)) {
						return;
					}
					toast.error(`Failed to delete the role: ${error instanceof Error ? error.message : String(error)}`);
				},
			},
		);
	}, [data.id, deleteOrganizationRole, closeModal]);

	const onSave = () =>
		updateOrganizationRole(
			{ roleId: data.id, updatedRoleInfo: toPayload(data.roleName, data.organizationId, permissions) },
			{
				onSuccess: async () => {
					toast.success('Role updated. It applies to each member’s next request.');
					await queryClient.invalidateQueries({ queryKey: [data.organizationId, 'roles', data.id] });
					closeModal(false);
				},
				onError: (error: Error | unknown) => {
					if (!shouldToastOwnFailure(error)) {
						return;
					}
					toast.error(`Failed to update the role: ${error instanceof Error ? error.message : String(error)}`);
				},
			},
		);

	if (isConfirmingRoleDeletion) {
		return (
			<ConfirmDeletionContent
				onRoleDeleteClick={onRoleDeleteClick}
				setIsConfirmingRoleDeletion={setIsConfirmingRoleDeletion}
				isRoleDeletionPending={isRoleDeletionPending}
			/>
		);
	}

	return (
		<>
			<DialogTitle>{canEdit ? 'Edit role' : 'Role'} "{data.roleName}"</DialogTitle>
			<DialogDescription>
				{isAdminRole
					? 'The admin role is built in and can’t be edited.'
					: isSelf
					? 'This is your role. Another member who can update roles can change it.'
					: canEdit
					? 'Members and service accounts with this role get these permissions from their next request.'
					: 'What members and service accounts with this role can do.'}
			</DialogDescription>
			<div className="my-2">
				<RolePermissionsEditor
					value={permissions}
					onChange={setPermissions}
					onValidChange={setIsPermissionsValid}
					clusters={organization?.clusters ?? []}
					disabled={!canEdit}
				/>
			</div>
			{(canEdit || canDelete) && (
				<DialogFooter>
					<div className="flex justify-between w-full">
						{canDelete
							? (
								<Button
									type="button"
									variant="destructiveOutline"
									onClick={() => {
										// Cancelling remounts the editor on its last valid permissions.
										setIsPermissionsValid(true);
										setIsConfirmingRoleDeletion(true);
									}}
									disabled={isRoleUpdatePending}
								>
									Delete role
								</Button>
							)
							: <span />}
						{canEdit && (
							<Button
								variant="submit"
								type="button"
								onClick={onSave}
								disabled={isRoleUpdatePending || !isDirty || !isPermissionsValid}
							>
								{isRoleUpdatePending ? 'Saving…' : 'Save changes'}
							</Button>
						)}
					</div>
				</DialogFooter>
			)}
		</>
	);
}
