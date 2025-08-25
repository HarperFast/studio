import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateNewDatabaseModal } from '@/features/instance/browse/modals/CreateNewDatabaseModal';
import { CreateNewTableModal } from '@/features/instance/browse/modals/CreateNewTableModal';
import { DeleteDatabaseModal } from '@/features/instance/browse/modals/DeleteDatabaseModal';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/lib/api.patch';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const route = getRouteApi('');

export function BrowseSidebar() {
	const router = useRouter();
	const { databaseName: selectedDatabaseName, tableName: selectedTableName }: {
		databaseName?: string;
		tableName?: string;
	} = route.useParams();
	const instanceDatabaseMap = route.useLoaderData() as InstanceDatabaseMap;
	const navigate = useNavigate();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);
	const [firstTime, setFirstTime] = useState(true);

	const { databaseNames, tableNames } = useMemo(() => {
		const databaseNames = Object.keys(instanceDatabaseMap || {}).sort();
		const tableNames = selectedDatabaseName ? Object.keys(instanceDatabaseMap[selectedDatabaseName] || []).sort() : [];
		return {
			databaseNames,
			tableNames,
		};
	}, [instanceDatabaseMap, selectedDatabaseName]);

	useEffect(() => {
		if (!databaseNames.length && firstTime) {
			setIsCreatingDatabase(canManageBrowseInstance);
		}
		setFirstTime(false);
	}, [canManageBrowseInstance, databaseNames.length, firstTime]);

	const onSelectDatabase = useCallback((newDatabaseName: string | undefined) => {
		const tableNames = newDatabaseName ? Object.keys(instanceDatabaseMap[newDatabaseName] || []).sort() : [];
		const parts = [selectedDatabaseName ? '..' : '', selectedTableName ? '..' : '', newDatabaseName, tableNames[0]].filter(Boolean);
		if (!selectedDatabaseName) {
			router.invalidate();
		} else {
			void navigate({ to: parts.join('/') });
		}
	}, [instanceDatabaseMap, selectedDatabaseName, selectedTableName, router, navigate]);

	const onDatabaseDeleted = useCallback(() => {
		onSelectDatabase(undefined);
	}, [onSelectDatabase]);

	const onSelectTable = useCallback((newTableName: string | undefined) => {
		const parts = [selectedTableName ? '..' : '', newTableName].filter(Boolean);
		void navigate({ to: parts.join('/') });
	}, [selectedTableName, navigate]);

	return (
		<div>
			<h1 className="pb-6 text-3xl">Browse</h1>
			<div className="">
				{databaseNames?.length > 0 && (<div className="flex space-x-2">
					<Select
						name="databaseSelect"
						value={selectedDatabaseName || ''}
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
						{(tableNames ?? []).length === 0 && selectedDatabaseName?.length ? (
							<div className="w-full h-full text-center">
								<p className="py-6">No tables found in this database.</p>
								{canManageBrowseInstance && (<p>
									Tap "Create a Table" below!
								</p>)}
							</div>
						) : (tableNames ?? []).length === 0 && !selectedDatabaseName?.length ? (
							// If no database is selected, show a message
							<p className="pt-2 text-sm text-center">Please {databaseNames?.length === 0 ? 'create' : 'select'} a
								database.</p>
						) : (
							''
						)}
						<ul>
							{(tableNames ?? []).map((tableName) => (
								<li key={tableName} className="flex items-center p-2 border-b hover:bg-grey-700/80 border-grey-700">
									<Button
										onClick={() => onSelectTable(tableName)}
										size="lg"
										className="items-center justify-between w-full bg-transparent border-none shadow-none hover:bg-transparent"
									>
										{tableName}
										<span>
											{tableName === tableName && <ArrowRight />}
										</span>
									</Button>
								</li>
							))}
						</ul>
					</TabsContent>
				</ScrollArea>
			</Tabs>
			{canManageBrowseInstance && (<div className="flex flex-col gap-2">
				{selectedDatabaseName?.length && (
					<CreateNewTableModal
						databaseName={selectedDatabaseName}
						onSelectTable={onSelectTable}
					/>)}

				<CreateNewDatabaseModal
					onSelectDatabase={onSelectDatabase}
					isCreatingDatabase={isCreatingDatabase}
					setIsCreatingDatabase={setIsCreatingDatabase}
				/>

				{selectedDatabaseName?.length && (<>
					<div aria-hidden="true" className="w-full border-t border-gray-700 dark:border-white/15 my-4" />
					<DeleteDatabaseModal
						databaseName={selectedDatabaseName}
						onDeleted={onDatabaseDeleted}
					/>
				</>)}
			</div>)}
		</div>
	);
}
