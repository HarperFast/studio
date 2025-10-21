import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { CreateNewTableModal } from '@/features/instance/databases/modals/CreateNewTableModal';
import { DeleteDatabaseModal } from '@/features/instance/databases/modals/DeleteDatabaseModal';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/lib/api.patch';
import { useLoaderData, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export function DatabasesSidebar() {
	const router = useRouter();

	const params: { databaseName?: string; tableName?: string; } = useParams({ strict: false });
	const instanceDatabaseMap = useLoaderData({ strict: false }) as InstanceDatabaseMap;
	const navigate = useNavigate();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const { databaseNames, tableNames } = useMemo(() => {
		const databaseNames = Object.keys(instanceDatabaseMap || {}).sort();
		const tableNames = params.databaseName ? Object.keys(instanceDatabaseMap[params.databaseName] || []).sort() : [];
		return {
			databaseNames,
			tableNames,
		};
	}, [instanceDatabaseMap, params.databaseName]);

	const onSelectDatabase = useCallback((newDatabaseName: string | undefined) => {
		const tableNames = newDatabaseName ? Object.keys(instanceDatabaseMap[newDatabaseName] || []).sort() : [];
		if (!params.databaseName) {
			router.invalidate();
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

	const onDatabaseDeleted = useCallback(() => {
		onSelectDatabase(undefined);
	}, [onSelectDatabase]);

	const onSelectTable = useCallback((newDatabaseName: string | undefined, newTableName: string | undefined) => {
		void navigate({
			to: buildAbsoluteLinkToDatabasePage({
				...params,
				databaseName: newDatabaseName,
				tableName: newTableName,
			}),
		});
	}, [navigate, params]);

	return (
		<div className="pl-3">
			<h1 className="pt-3 pb-3 text-3xl">Databases</h1>
			<div className="">
				{databaseNames?.length > 0 && (<div className="flex space-x-2">
					<Select
						name="databaseSelect"
						value={params.databaseName || ''}
						onValueChange={(selectedDatabaseName) => {
							onSelectDatabase(selectedDatabaseName);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select a Database" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{databaseNames?.map((databaseName) => (
									<SelectItem key={databaseName} value={databaseName}>
										{databaseName}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>)}
			</div>
			<Tabs defaultValue="tables" className="py-6">
				<TabsList className="w-full">
					<TabsTrigger value="tables">Tables</TabsTrigger>
				</TabsList>
				<ScrollArea className="border rounded-md h-80 border-grey-700">
					<TabsContent value="tables" className="h-full">
						{(tableNames ?? []).length === 0 && params.databaseName?.length ? (
							<div className="w-full h-full text-center">
								<p className="py-6">No tables found in this database.</p>
								{canManageBrowseInstance && (<p>
									Tap "Create a Table" below!
								</p>)}
							</div>
						) : (tableNames ?? []).length === 0 && !params.databaseName?.length ? (
							// If no database is selected, show a message
							<p className="pt-2 text-sm text-center">Please {databaseNames?.length === 0 ? 'create' : 'select'} a
								table.</p>
						) : (
							''
						)}
						<ul>
							{(tableNames ?? []).map((tableName) => (
								<li key={tableName} className="flex items-center p-2 border-b hover:bg-grey-700/80 border-grey-700">
									<Button
										onClick={() => onSelectTable(params.databaseName, tableName)}
										size="lg"
										className="items-center justify-between w-full bg-transparent border-none shadow-none hover:bg-transparent"
									>
										{tableName}
										<span>
											{params.tableName === tableName && <ArrowRight />}
										</span>
									</Button>
								</li>
							))}
						</ul>
					</TabsContent>
				</ScrollArea>
			</Tabs>
			{canManageBrowseInstance && (<div className="flex flex-col gap-2">
				<CreateNewTableModal
					databaseName={params.databaseName}
					onSelectTable={onSelectTable}
				/>

				{params.databaseName?.length && (<>
					<div aria-hidden="true" className="w-full border-t border-gray-700 dark:border-white/15 my-4" />
					<DeleteDatabaseModal
						databaseName={params.databaseName}
						onDeleted={onDatabaseDeleted}
					/>
				</>)}
			</div>)}
		</div>
	);
}
