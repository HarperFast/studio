import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { CreateNewTableModal } from '@/features/instance/databases/modals/CreateNewTableModal';
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { ArrowRight, CloudUploadIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function DatabasesSidebar({ instanceDatabaseMap }: { instanceDatabaseMap?: InstanceDatabaseMap }) {
	const router = useRouter();

	const loading = !instanceDatabaseMap;

	const params: { databaseName?: string; tableName?: string } = useParams({ strict: false });
	const navigate = useNavigate();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const [isImportDataModalOpen, setIsImportDataModalOpen] = useState(false);

	const { databaseNames, tableNames } = useMemo(() => {
		const databaseNames = Object.keys(instanceDatabaseMap || {}).sort();
		const tableNames = params.databaseName ? Object.keys(instanceDatabaseMap?.[params.databaseName] || []).sort() : [];
		return {
			databaseNames,
			tableNames,
		};
	}, [instanceDatabaseMap, params.databaseName]);

	const onSelectDatabase = useCallback((newDatabaseName: string | undefined) => {
		const tableNames = newDatabaseName ? Object.keys(instanceDatabaseMap?.[newDatabaseName] || []).sort() : [];
		if (!params.databaseName) {
			void router.invalidate();
		} else {
			void navigate({
				to: buildAbsoluteLinkToDatabasePage({
					...params,
					databaseName: newDatabaseName,
					tableName: tableNames[0],
				}),
			});
		}
	}, [instanceDatabaseMap, params, router, navigate]);

	const onSelectTable = useCallback((newDatabaseName: string | undefined, newTableName: string | undefined) => {
		void navigate({
			to: buildAbsoluteLinkToDatabasePage({
				...params,
				databaseName: newDatabaseName,
				tableName: newTableName,
			}),
		});
	}, [navigate, params]);

	const onImported = useCallback(async (newDatabaseName: string, newTableName: string) => {
		await queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'describe_all'],
			refetchType: 'all',
		});
		onSelectTable(newDatabaseName, newTableName);
		await router.invalidate();
	}, [queryClient, instanceParams.entityId, onSelectTable, router]);

	return (
		<div className="pl-3 flex flex-col h-full min-h-0">
			<h1 className="pt-3 pb-3 text-3xl shrink-0">Databases</h1>
			{loading
				? <TextLoadingSkeleton className="w-full h-9 m-0 rounded-md shrink-0" />
				: (
					<div className="flex space-x-2 shrink-0">
						<Select
							name="databaseSelect"
							value={params.databaseName || ''}
							disabled={databaseNames.length === 0}
							onValueChange={onSelectDatabase}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a Database" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{databaseNames.map((databaseName) => (
										<SelectItem key={databaseName} value={databaseName}>
											{databaseName}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}
			{loading
				? <TextLoadingSkeleton className="w-full flex-1 min-h-0 rounded-md mb-0 mt-4" />
				: (
					<ScrollArea type="auto" className="flex-1 min-h-0 border rounded-md border-grey-700 mt-4">
						{tableNames.length === 0 && params.databaseName?.length
							? (
								<div className="w-full h-full text-center">
									<p className="py-6">No tables found in this database.</p>
									{canManageBrowseInstance && (
										<p>
											Tap "Create a Table" below!
										</p>
									)}
								</div>
							)
							: tableNames.length === 0 && !params.databaseName?.length
							? canManageBrowseInstance
								? (
									<p className="pt-2 text-sm text-center">
										Please {databaseNames.length === 0 ? 'create' : 'select'} a table.
									</p>
								)
								: (
									<p className="pt-2 text-sm text-center">
										Please {databaseNames.length === 0 ? 'ask your admin to create' : 'select'} a table.
									</p>
								)
							: (
								''
							)}
						<ul>
							{tableNames.map((tableName) => (
								<li
									key={tableName}
									className="flex items-center p-2 border-b hover:bg-accent border-border dark:hover:bg-grey-700/80 dark:border-grey-700"
								>
									<Button
										onClick={() => onSelectTable(params.databaseName, tableName)}
										size="lg"
										className="items-center justify-between w-full bg-transparent border-none shadow-none hover:bg-transparent text-foreground"
									>
										{tableName}
										<span>
											{params.tableName === tableName && <ArrowRight />}
										</span>
									</Button>
								</li>
							))}
						</ul>
					</ScrollArea>
				)}
			{canManageBrowseInstance && (
				<div className="shrink-0">
					<CreateNewTableModal
						databaseName={params.databaseName}
						onSelectTable={onSelectTable}
					/>
					<div className="shrink-0 pb-4">
						<Button
							variant="defaultOutline"
							className="w-full"
							size="lg"
							onClick={() => setIsImportDataModalOpen(true)}
							disabled={isImportDataModalOpen || loading}
						>
							<CloudUploadIcon />
							<span>Import Data</span>
						</Button>
					</div>
					<ImportDataModal
						isModalOpen={isImportDataModalOpen}
						setIsModalOpen={setIsImportDataModalOpen}
						instanceDatabaseMap={instanceDatabaseMap}
						databaseName={params.databaseName}
						onImported={onImported}
					/>
				</div>
			)}
		</div>
	);
}
