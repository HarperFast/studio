import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useDeleteDatabaseMutation } from '@/integrations/api/instance/database/deleteDatabase';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function DeleteDatabaseModal({ databaseName, onDeleted }: {
	readonly databaseName: string;
	readonly onDeleted: (deleted: 'table' | 'database') => void;
}) {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowDeleteDatabase', false);
	const closeModal = useCallback(() => {
		setWatchedValue('ShowDeleteDatabase', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const router = useRouter();
	const { mutate: deleteDatabase, isPending: isDeletingDatabase } = useDeleteDatabaseMutation();

	const onDeleteDatabase = useCallback(() => {
		deleteDatabase({
			databaseName,
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
		}, {
			onSuccess: async () => {
				closeModal();
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				await router.invalidate();
				toast.success(`Database ${databaseName} dropped successfully`);
				onDeleted('database');
			},
		});
	}, [closeModal, databaseName, deleteDatabase, instanceParams, onDeleted, queryClient, router]);

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
			setIsModalOpen={closeModal}
			deletionConfirmed={onDeleteDatabase}
			deletionPending={isDeletingDatabase}
		/>
	);
}
