import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LocalRole } from '@/lib/api.patch';

export function EditRoleModal({
	closeModal,
	// instanceId,
	// data,
	isModalOpen,
}: // onRoleDeleted,
// onRoleUpdated,
{
	instanceId: string;
	isModalOpen: boolean;
	closeModal: () => void;
	data: LocalRole;
	onRoleDeleted: () => void;
	onRoleUpdated: () => void;
}) {
	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Edit Role</DialogTitle>
				<DialogDescription>
					<p>Edit Role here</p>
				</DialogDescription>
			</DialogContent>
		</Dialog>
	);
}
