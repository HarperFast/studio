import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { CreateNewApplicationForm } from '@/features/instance/applications/new/CreateNewApplicationForm';
import { ImportApplicationForm } from '@/features/instance/applications/new/ImportApplicationForm';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { useState } from 'react';

export function CreateOrImportAnApplication() {
	const { reloadRootEntries } = useEditorView();

	const { instanceClient } = useInstanceClientParams();
	const [appType, setAppType] = useState('create');

	const { onRestartClick, isRestartPending } = useRestartInstanceClick({
		operation: 'restart_service',
		instanceClient,
		onRestartedSuccessfully: reloadRootEntries,
	});

	return (
		<Tabs defaultValue={appType} className="w-xl" onValueChange={setAppType}>
			<TabsList>
				<TabsTrigger value="create">Create</TabsTrigger>
				<TabsTrigger value="import">Import</TabsTrigger>
			</TabsList>
			<TabsContent value="create" className="mt-4">
				<CreateNewApplicationForm triggerRestart={onRestartClick} isRestartPending={isRestartPending} />
			</TabsContent>
			<TabsContent value="import" className="mt-4">
				<ImportApplicationForm onRestartedSuccessfully={reloadRootEntries} />
			</TabsContent>
		</Tabs>
	);
}
