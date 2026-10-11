import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	isOperationsValueUnusable,
	RolePermissionEditor,
	useRoleEditorSchema,
} from '@/features/instance/config/roles/editor/RolePermissionEditor';
import { useRolePermissionDraft } from '@/features/instance/config/roles/editor/useRolePermissionDraft';
import { preparePermissionForSave } from '@/features/instance/config/roles/preparePermissionForSave';
import { useInstanceAuth } from '@/hooks/useAuth';
import { LocalRole } from '@/integrations/api/api.patch';
import { useAlterRole } from '@/integrations/api/instance/auth/alterRole';
import { useDeleteRoleMutation } from '@/integrations/api/instance/auth/deleteRole';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function EditRoleModal({
	data,
	instanceId,
	clusterId,
	isModalOpen,
	closeModal,
	onSelectRole,
	onChangesSaved,
}: {
	data: LocalRole;
	instanceId?: string;
	clusterId?: string;
	isModalOpen: boolean;
	closeModal: () => void;
	onSelectRole: (role?: string) => void;
	onChangesSaved: () => void;
}) {
	const { role } = data;
	const instanceParams = useInstanceClientIdParams();
	const schema = useRoleEditorSchema();
	const auth = useInstanceAuth(instanceId ?? clusterId);
	const isSelf = auth.user?.role?.id === data.id;

	// The stored permission, as it is — never a schema-derived template, which would rewrite what it
	// does not model. Seeded once: the roles list polls, and a refetch must not replace the draft.
	const draft = useRolePermissionDraft(data.permission);
	const { permission } = draft;
	const [loadedUpdatedTime, setLoadedUpdatedTime] = useState(data.__updatedtime__);
	const changedElsewhere = data.__updatedtime__ !== loadedUpdatedTime;

	const { mutate: alterRole, isPending } = useAlterRole();
	const { mutate: dropRole, isPending: isDeletePending } = useDeleteRoleMutation();
	const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);

	const operationsUnusable = isOperationsValueUnusable(permission, schema.version);

	const onSubmitClick = useCallback(() => {
		if (!permission || operationsUnusable) {
			return;
		}
		alterRole(
			{
				id: data.id,
				permission: preparePermissionForSave(permission),
				...instanceParams,
			},
			{
				onSuccess: () => {
					toast.success('Role updated successfully!');
					onSelectRole(undefined);
					onChangesSaved();
				},
			},
		);
	}, [alterRole, data.id, instanceParams, onChangesSaved, onSelectRole, operationsUnusable, permission]);

	const { setPermission } = draft;
	const onLoadLatestClick = useCallback(() => {
		setLoadedUpdatedTime(data.__updatedtime__);
		setPermission(data.permission);
	}, [data.__updatedtime__, data.permission, setPermission]);

	const onRoleDeleted = useCallback(() => {
		dropRole(
			{
				id: data.id,
				...instanceParams,
			},
			{
				onSuccess: () => {
					toast.success('Role deleted successfully!');
					onSelectRole(undefined);
					onChangesSaved();
				},
			},
		);
	}, [data.id, dropRole, instanceParams, onChangesSaved, onSelectRole]);

	return (
		<>
			<Dialog onOpenChange={closeModal} open={isModalOpen}>
				<DialogContent resizable>
					<DialogTitle>{isSelf ? 'View' : 'Edit'} Role "{role}"</DialogTitle>
					<DialogDescription>
						{isSelf
							? 'You can view your own role, but you cannot edit it. Please assign yourself a different'
								+ ' role to edit this role.'
							: 'Choose what this role can access, or remove the role entirely.'}
					</DialogDescription>
					{changedElsewhere && (
						<div className="flex flex-wrap items-center gap-2 text-xs text-warning" role="status">
							<span>
								This role was changed somewhere else after you opened it. Saving replaces that version with this one.
							</span>
							<Button type="button" size="sm" variant="defaultOutline" onClick={onLoadLatestClick}>
								Load the latest version
							</Button>
						</div>
					)}
					<RolePermissionEditor draft={draft} schema={schema} readOnly={isSelf} />
					<DialogFooter>
						{!isSelf && (
							<div className="flex justify-between w-full">
								<Button
									type="button"
									variant="destructiveOutline"
									onClick={() => setIsConfirmDeleteModalOpen(true)}
									disabled={isPending}
								>
									Delete Role
								</Button>
								<Button
									variant="submit"
									onClick={onSubmitClick}
									disabled={isPending || !permission || operationsUnusable}
								>
									Save Changes
								</Button>
							</div>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<ConfirmDeletionModal
				isModalOpen={isConfirmDeleteModalOpen}
				setIsModalOpen={setIsConfirmDeleteModalOpen}
				deletionConfirmed={onRoleDeleted}
				deletionPending={isDeletePending}
				typeOfThingBeingDeleted="role"
				nameOfThingBeingDeleted={role}
				hideDataLossWarning={true}
			/>
		</>
	);
}
