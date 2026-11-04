import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { AdminUser, useReactivateUserMutation } from '@/features/admin/users/userAdminApi';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

export function ReactivateDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
	const mutation = useReactivateUserMutation();

	const reactivate = () =>
		mutation.mutate(user.id, {
			onSuccess: () => {
				toast.success('Account reactivated.');
				onClose();
			},
			onError: onClose,
		});

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{`Reactivate ${user.email}?`}</DialogTitle>
					<DialogDescription>
						They can sign in again. Organization memberships removed when they were deactivated are not restored.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
					<Button variant="submit" disabled={mutation.isPending} onClick={reactivate}>
						{mutation.isPending && <Loader2Icon className="animate-spin" />}
						{mutation.isPending ? 'Reactivating…' : 'Reactivate'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
