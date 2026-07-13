import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useDeleteTableMutation } from '@/integrations/api/instance/database/deleteTable';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function DeleteTableModal({ onDeleted }: {
	readonly onDeleted: (dropped: { databaseName: string; tableName: string }) => void;
}) {
	const { value: target } = useWatchedValue('ShowDeleteTable', false);
	const isModalOpen = !!target;
	const databaseName = target ? target.databaseName : '';
	const tableName = target ? target.tableName : '';
	// The confirmation dialog (Radix) restores focus to the invoking control on close on its own; no
	// manual trigger plumbing needed now that callers fire this via a target payload.
	const closeModal = useCallback(() => {
		setWatchedValue('ShowDeleteTable', false);
	}, []);

	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const router = useRouter();
	const { mutate: deleteTable, isPending: isDeletingTable } = useDeleteTableMutation();

	const onDeleteTable = useCallback(() => {
		deleteTable(
			{
				databaseName,
				tableName,
				...instanceParams,
				replicated: instanceParams.entityType === 'cluster',
			},
			{
				onSuccess: async () => {
					closeModal();
					await queryClient.invalidateQueries({
						queryKey: [instanceParams.entityId, 'describe_all'],
						refetchType: 'all',
					});
					await router.invalidate();
					toast.success(`Table ${tableName} dropped successfully`);
					onDeleted({ databaseName, tableName });
				},
			},
		);
	}, [closeModal, databaseName, deleteTable, instanceParams, onDeleted, queryClient, router, tableName]);

	if (!canManageBrowseInstance || !databaseName) {
		return <></>;
	}

	return (
		<ConfirmDeletionModal
			typeOfThingBeingDeleted="table"
			nameOfThingBeingDeleted={`${databaseName} > ${tableName}`}
			transitiveVerb="Drop"
			presentParticiple="Dropping"
			isModalOpen={isModalOpen}
			setIsModalOpen={closeModal}
			deletionConfirmed={onDeleteTable}
			deletionPending={isDeletingTable}
		/>
	);
}
