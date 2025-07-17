import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useAlterRole } from '@/features/instance/operations/mutations/alterRole';
import { useDeleteRoleMutation } from '@/features/instance/operations/mutations/deleteRole';
import { LocalRole } from '@/lib/api.patch';
import { Editor } from '@monaco-editor/react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function EditRoleModal({
	data,
	isModalOpen,
	closeModal,
	onSelectRole,
	onChangesSaved,
}: {
	data: LocalRole;
	isModalOpen: boolean;
	closeModal: () => void;
	onSelectRole: (role?: string) => void;
	onChangesSaved: () => void;
}) {
	const { role, permission } = data;
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(JSON.stringify(permission, null, 2));
	const [isValidJSON, setIsValidJSON] = useState(true);

	const { mutate: alterRole, isPending } = useAlterRole();
	const { mutate: dropRole } = useDeleteRoleMutation();

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON]
	);

	const onRoleUpdated = useCallback(
		(updatedPermissions: string) => {
			if (updatedPermissions) {
				const parsedPermissions = JSON.parse(updatedPermissions);
				alterRole(
					{
						id: data.id,
						permission: parsedPermissions,
					},
					{
						onSuccess: () => {
							toast.success('Role updated successfully!');
							onSelectRole(undefined);
							onChangesSaved();
						},
						onError: (error: Error) => {
							toast.error(`Failed to update role: ${error.message}`);
						},
					}
				);
			}
		},
		[alterRole, data.id, onChangesSaved, onSelectRole]
	);

	const onRoleDeleted = useCallback(() => {
		dropRole(
			{
				id: data.id,
			},
			{
				onSuccess: () => {
					toast.success('Role deleted successfully!');
					onSelectRole(undefined);
					onChangesSaved();
				},
				onError: (error: Error) => {
					toast.error(`Failed to delete role: ${error.message}`);
				},
			}
		);
	}, [onSelectRole, dropRole, data.id, onChangesSaved]);

	const onSubmitClick = useCallback(() => {
		if (updatedPermissions && isValidJSON) {
			onRoleUpdated(updatedPermissions);
		}
	}, [updatedPermissions, onRoleUpdated, isValidJSON]);

	const onRoleDeleteClick = useCallback(() => {
		onRoleDeleted();
	}, [onRoleDeleted]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Edit Role "{role}"</DialogTitle>
				<DialogDescription>Edit the role's permissions in JSON format or remove the role entirely.</DialogDescription>
				<Editor
					theme="vs-dark"
					height="400px"
					defaultLanguage="json"
					onValidate={onValidate}
					onChange={(value) => {
						if (value) {
							setUpdatedPermissions(value);
						}
					}}
					defaultValue={JSON.stringify(permission, null, 2)}
				/>
				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button
							variant="destructiveOutline"
							className="rounded-full"
							onClick={onRoleDeleteClick}
							disabled={isPending}
						>
							Delete Role
						</Button>
						<Button
							variant="submit"
							className="rounded-full"
							onClick={onSubmitClick}
							disabled={isPending || !isValidJSON}
						>
							Save Changes
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
