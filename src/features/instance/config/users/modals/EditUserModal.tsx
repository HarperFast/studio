import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { authStore } from '@/features/auth/store/authStore';
import { ActiveToggle, AlterUserForm } from '@/features/instance/config/users/components/AlterUserForm';
import { DeleteUserForm } from '@/features/instance/config/users/components/DeleteUserForm';
import { isOnlyActiveSuperUser } from '@/features/instance/config/users/isOnlyActiveSuperUser';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useInstanceOperationPermission } from '@/hooks/useInstanceOperationPermission';
import { LocalUser } from '@/integrations/api/api.patch';
import { Trash } from 'lucide-react';

function scrollIntoViewOnMount(node: HTMLDivElement | null) {
	node?.scrollIntoView({ block: 'nearest' });
}

export function EditUserModal({
	closeModal,
	clusterId,
	instanceId,
	data,
	users,
	isModalOpen,
	onUserDeleted,
	onUserUpdated,
}: {
	clusterId?: string;
	instanceId?: string;
	isModalOpen: boolean;
	closeModal: () => void;
	data: LocalUser;
	users: readonly LocalUser[];
	onUserDeleted: () => void;
	onUserUpdated: () => void;
}) {
	const isFabricConnect = authStore.checkForFabricConnect(instanceId ?? clusterId);
	const auth = useInstanceAuth(instanceId ?? clusterId);
	const canAlterUsers = useInstanceOperationPermission('alter_user');
	// The form cannot render without list_roles (HarperFast/studio#2111).
	const canListRoles = useInstanceOperationPermission('list_roles');
	const isSelf = !isFabricConnect && auth.user?.username === data.username;
	const canDelete = !isSelf;

	let activeToggle: ActiveToggle = 'hidden';
	if (canAlterUsers && canListRoles && !isSelf) {
		activeToggle = isOnlyActiveSuperUser(users, data.username) ? 'only-active-super-user' : 'editable';
	}

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent resizable>
				<div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
					<AlterUserForm data={data} activeToggle={activeToggle} onUserUpdated={onUserUpdated} />
					{canDelete && (
						<Accordion type="single" collapsible className="border-t">
							<AccordionItem value="delete">
								<AccordionTrigger className="ml-auto flex-none gap-2 text-destructive">
									<span className="flex items-center gap-2">
										<Trash className="size-4" /> Delete this user
									</span>
								</AccordionTrigger>
								<AccordionContent>
									<div ref={scrollIntoViewOnMount}>
										<p className="text-muted-foreground">
											This permanently deletes {data.username}'s account.
											{activeToggle === 'editable' && data.active
												&& ' To stop them signing in but keep the account, turn off Active instead.'}
										</p>
										<DeleteUserForm data={data} onUserDeleted={onUserDeleted} />
									</div>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
