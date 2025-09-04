import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useDeleteDatabaseMutation } from '@/features/instance/operations/mutations/deleteDatabase';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Trash } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function DeleteDatabaseModal({ databaseName, onDeleted }: {
	readonly databaseName: string;
	readonly onDeleted: () => void;
}) {
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const router = useRouter();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const { mutate: deleteDatabase, isPending: isDeletingDatabase } = useDeleteDatabaseMutation();

	const onDeleteDatabase = useCallback(() => {
		deleteDatabase({
			databaseName,
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
		}, {
			onSuccess: async () => {
				setIsModalOpen(false);
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				await router.invalidate();
				toast.success(`Database ${databaseName} deleted successfully`);
				onDeleted();
			},
		});
	}, [databaseName, deleteDatabase, instanceParams, onDeleted, queryClient, router]);

	if (!canManageBrowseInstance || !databaseName) {
		return <></>;
	}

	return (
		<ConfirmDeletionModal
			typeOfThingBeingDeleted="database"
			nameOfThingBeingDeleted={databaseName}
			transitiveVerb="Drop"
			presentParticiple="Dropping"
			isModalOpen={isModalOpen}
			setIsModalOpen={setIsModalOpen}
			deletionConfirmed={onDeleteDatabase}
			deletionPending={isDeletingDatabase}
			trigger={<Button
				className="w-full rounded-full"
				size="sm"
				aria-label="Delete selected database"
				variant="destructiveOutline"
				disabled={isDeletingDatabase}
				onClick={() => setIsModalOpen(true)}
			>
				<Trash /> Drop Database
			</Button>}
		/>
	);
}
