import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderPlus, Import } from 'lucide-react';
import { useCallback} from 'react';
import { useInstanceClientIdParams, useInstanceClientParams } from '@/config/useInstanceClient';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { CreateNewProjectForm } from '@/features/instance/applications/new/CreateNewProjectForm';
import { ImportProjectForm } from '@/features/instance/applications/new/ImportProjectForm';
import { useQueryClient } from '@tanstack/react-query';

export function NewProjectModal({
	isModalOpen = false,
	setIsModalOpen,
	appType,
	setAppType
}: {
	readonly isModalOpen: boolean;
	readonly setIsModalOpen: (value: boolean) => void;
	readonly appType: string;
	readonly setAppType: (value: 'create' | 'import') => void;
}) {
	const { instanceClient } = useInstanceClientParams();
    const queryClient = useQueryClient();
    const instanceParams = useInstanceClientIdParams();

    const onRestartedSuccessfully = useCallback(() => {
      void queryClient.invalidateQueries({queryKey:[instanceParams.entityId, 'get_components']});
      void setIsModalOpen(false);
    }, [setIsModalOpen, instanceParams.entityId, queryClient]);
    const { onRestartClick, isRestartPending } = useRestartInstanceClick({
      operation: 'restart_service',
      instanceClient,
      onRestartedSuccessfully,
    });

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Create/Import An Application</DialogTitle>
					<DialogDescription>Create a new application or import an existing one.</DialogDescription>
				</DialogHeader>
					<div className="flex justify-center my-4">
						<Button className="py-4" variant="positiveOutline" onClick={() => setAppType('create')}>
							<FolderPlus />
							Create
						</Button>

						<Button className="py-4 ml-4" variant="positiveOutline" onClick={() => setAppType('import')}>
							<Import />
							Import
						</Button>
					</div>
					<div>
						{appType === 'create' ? (
							<CreateNewProjectForm triggerRestart={onRestartClick} isRestartPending={isRestartPending} />
						) : appType === 'import' ? (
							<ImportProjectForm onRestartedSuccessfully={onRestartedSuccessfully} />
						) : (
							<p className="text-center">Please select an option to continue.</p>
						)}
					</div>
			</DialogContent>
		</Dialog>
	);
}
