import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { LocalRole } from '@/lib/api.patch';
import { Editor } from '@monaco-editor/react';

export function EditRoleModal({
	closeModal,
	instanceId,
	clusterId,
	data,
	isModalOpen,
	onRoleDeleted,
	onRoleUpdated,
}: {
	instanceId: string;
	clusterId: string;
	isModalOpen: boolean;
	closeModal: () => void;
	data: LocalRole;
	onRoleDeleted: () => void;
	onRoleUpdated: () => void;
}) {
	// Make sure user cannot delete their own role.
	const { role, permission } = data;
	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Edit Role "{role}"</DialogTitle>
				<DialogDescription>Edit the role's permissions in JSON format or remove the role entirely.</DialogDescription>
				<Editor
					theme="vs-dark"
					height="400px"
					defaultLanguage="json"
					defaultValue={JSON.stringify(permission, null, 2)}
				/>
				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button variant="destructiveOutline" className="rounded-full" onClick={onRoleDeleted}>
							Delete Role
						</Button>
						<Button variant="submit" className="rounded-full" onClick={onRoleUpdated}>
							Save Changes
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
