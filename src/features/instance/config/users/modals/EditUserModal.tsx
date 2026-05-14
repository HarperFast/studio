import { Dialog, DialogContent } from '@/components/ui/dialog';
import { authStore } from '@/features/auth/store/authStore';
import { AlterUserForm } from '@/features/instance/config/users/components/AlterUserForm';
import { DeleteUserForm } from '@/features/instance/config/users/components/DeleteUserForm';
import { useInstanceAuth } from '@/hooks/useAuth';
import { LocalUser } from '@/integrations/api/api.patch';

export function EditUserModal({
	closeModal,
	clusterId,
	instanceId,
	data,
	isModalOpen,
	onUserDeleted,
	onUserUpdated,
}: {
	clusterId?: string;
	instanceId?: string;
	isModalOpen: boolean;
	closeModal: () => void;
	data: LocalUser;
	onUserDeleted: () => void;
	onUserUpdated: () => void;
}) {
	const isFabricConnect = authStore.checkForFabricConnect(instanceId ?? clusterId);
	const auth = useInstanceAuth(instanceId ?? clusterId);
	const isSelf = !isFabricConnect && auth.user?.username === data.username;
	const canDelete = !isSelf;

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent className="sm:max-w-[750px]">
				<AlterUserForm data={data} onUserUpdated={onUserUpdated} />
				{canDelete && <DeleteUserForm data={data} onUserDeleted={onUserDeleted} />}
			</DialogContent>
		</Dialog>
	);
}
