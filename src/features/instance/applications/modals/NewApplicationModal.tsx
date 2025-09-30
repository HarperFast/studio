import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstanceClientIdParams, useInstanceClientParams } from '@/config/useInstanceClient';
import { CreateNewApplicationForm } from '@/features/instance/applications/new/CreateNewApplicationForm';
import { ImportApplicationForm } from '@/features/instance/applications/new/ImportApplicationForm';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export function NewApplicationModal({
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
					<div>
						<Tabs defaultValue={appType} className="w-full" onValueChange={(value) => setAppType(value as 'create' | 'import')}>
							<TabsList>
								<TabsTrigger value="create">Create</TabsTrigger>
								<TabsTrigger value="import">Import</TabsTrigger>
							</TabsList>
							<TabsContent value="create"	className='mt-4'>
								<CreateNewApplicationForm triggerRestart={onRestartClick} isRestartPending={isRestartPending} />
							</TabsContent>
							<TabsContent value="import" className='mt-4'>
								<ImportApplicationForm onRestartedSuccessfully={onRestartedSuccessfully} />
							</TabsContent>
						</Tabs>
					</div>
			</DialogContent>
		</Dialog>
	);
}
