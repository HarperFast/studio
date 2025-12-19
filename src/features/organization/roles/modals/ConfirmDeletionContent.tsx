import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';

export function ConfirmDeletionContent({
	onRoleDeleteClick,
	setIsConfirmingRoleDeletion,
	isRoleDeletionPending,
}: {
	onRoleDeleteClick: () => void;
	setIsConfirmingRoleDeletion: (isOpen: boolean) => void;
	isRoleDeletionPending: boolean;
}) {
	return (
		<>
			<DialogTitle>Confirm Role Deletion</DialogTitle>
			<DialogDescription>Are you sure you want to delete this role? This action cannot be undone.</DialogDescription>
			<DialogFooter>
				<Button
					type="button"
					variant="defaultOutline"
					className="rounded-full"
					onClick={() => setIsConfirmingRoleDeletion(false)}
				>
					Cancel
				</Button>
				<Button
					variant="destructiveOutline"
					className="rounded-full"
					onClick={onRoleDeleteClick}
					disabled={isRoleDeletionPending}
				>
					{isRoleDeletionPending ? 'Deleting...' : 'Delete Role'}
				</Button>
			</DialogFooter>
		</>
	);
}
