import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlterUserForm } from '@/features/organization/users/components/AlterUserForm';
import { SchemaUser } from '@/lib/api.gen';

export function EditUserModal({
	closeModal,
	data,
	isModalOpen,
	onUserUpdated,
}: {
	isModalOpen: boolean;
	closeModal: () => void;
	data: SchemaUser;
	onUserUpdated: () => void;
}) {
	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent className="sm:max-w-[750px]">
				<AlterUserForm data={data} onUserUpdated={onUserUpdated} />
			</DialogContent>
		</Dialog>
	);
}
