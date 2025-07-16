import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { LocalRole } from '@/lib/api.patch';
import { Editor } from '@monaco-editor/react';
import { useCallback, useState } from 'react';

export function EditRoleModal({
	closeModal,
	isPending,
	data,
	isModalOpen,
	onRoleDeleted,
	onRoleUpdated,
}: {
	isModalOpen: boolean;
	isPending: boolean;
	closeModal: () => void;
	data: LocalRole;
	onRoleDeleted: () => void;
	onRoleUpdated: (updatedPermissions: string) => void;
}) {
	const { role, permission } = data;
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(JSON.stringify(permission, null, 2));
	const [isValidJSON, setIsValidJSON] = useState(true);

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON]
	);

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
