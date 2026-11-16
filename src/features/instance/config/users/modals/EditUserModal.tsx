import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { authStore } from '@/features/auth/store/authStore';
import { ActiveToggle, AlterUserForm } from '@/features/instance/config/users/components/AlterUserForm';
import { DeleteUserForm } from '@/features/instance/config/users/components/DeleteUserForm';
import { isOnlyActiveSuperUser } from '@/features/instance/config/users/isOnlyActiveSuperUser';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useInstanceAlterUserPermission } from '@/hooks/usePermissions';
import { LocalUser } from '@/integrations/api/api.patch';
import { Trash } from 'lucide-react';

// Opening the section mounts this; the body may have to scroll to show the Delete button below the fold.
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
	/** Every user on the instance, to tell whether `data` is its only active super user. */
	users: readonly LocalUser[];
	onUserDeleted: () => void;
	onUserUpdated: () => void;
}) {
	const isFabricConnect = authStore.checkForFabricConnect(instanceId ?? clusterId);
	const auth = useInstanceAuth(instanceId ?? clusterId);
	const canAlterUsers = useInstanceAlterUserPermission(instanceId ?? clusterId);
	const isSelf = !isFabricConnect && auth.user?.username === data.username;
	const canDelete = !isSelf;

	// Like delete, your own account isn't offered: deactivating it would lock you out.
	let activeToggle: ActiveToggle = 'hidden';
	if (canAlterUsers && !isSelf) {
		activeToggle = isOnlyActiveSuperUser(users, data.username) ? 'only-active-super-user' : 'editable';
	}

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent resizable>
				{/* The resizable body clips at its saved height, so this scrolls instead. */}
				<div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
					<AlterUserForm data={data} activeToggle={activeToggle} onUserUpdated={onUserUpdated} />
					{canDelete && (
						// Collapsed by default, and closing it unmounts the form, so a half-typed confirmation doesn't linger.
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
											{activeToggle === 'editable'
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
