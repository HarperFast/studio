import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { CreateNewTableModal } from '@/features/instance/browse/modals/CreateNewTableModal';
import { useCreateDatabaseSubmitMutation } from '@/features/instance/operations/mutations/createDatabase';
import { useDeleteDatabaseMutation } from '@/features/instance/operations/mutations/deleteDatabase';
import { useDeleteTableMutation } from '@/features/instance/operations/mutations/deleteTable';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/lib/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight, Check, Minus, Plus, Trash } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const route = getRouteApi('');

const NewDatabaseSchema = z.object({
	databaseName: z
		.string({
			message: 'Please enter a valid database name.',
		})
		.min(1, { message: 'Database name is required' })
		.max(75, { message: 'Database name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9_]+$/, { message: 'Database name can only contain letters, numbers, and underscores' }),
});

export function BrowseSidebar() {
	const router = useRouter();
	const { databaseName: selectedDatabaseName, tableName: selectedTableName }: {
		databaseName?: string;
		tableName?: string;
	} = route.useParams();
	const instanceDatabaseMap = route.useLoaderData() as InstanceDatabaseMap;
	const instanceParams = useInstanceClientIdParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const [typeOfThingBeingDeleted, setTypeOfThingBeingDeleted] = useState('');
	const [nameOfThingBeingDeleted, setNameOfThingBeingDeleted] = useState('');
	const [deletionTarget, setDeletionTarget] = useState<{ databaseName?: string; tableName?: string; }>({});
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);

	const { mutate: createNewDatabase } = useCreateDatabaseSubmitMutation();
	const { mutate: deleteDatabase, isPending: isDeletingDatabase } = useDeleteDatabaseMutation();
	const { mutate: deleteTable, isPending: isDeletingTable } = useDeleteTableMutation();

	const { databaseNames, tableNames } = useMemo(() => {
		const databaseNames = Object.keys(instanceDatabaseMap || {}).sort();
		const tableNames = selectedDatabaseName ? Object.keys(instanceDatabaseMap[selectedDatabaseName] || []).sort() : [];
		return {
			databaseNames,
			tableNames,
		};
	}, [instanceDatabaseMap, selectedDatabaseName]);

	const form = useForm({
		resolver: zodResolver(NewDatabaseSchema),
		defaultValues: {
			databaseName: '',
		},
	});

	const onSelectDatabase = useCallback((newDatabaseName: string | undefined) => {
		const tableNames = newDatabaseName ? Object.keys(instanceDatabaseMap[newDatabaseName] || []).sort() : [];
		const parts = [selectedDatabaseName ? '..' : '', selectedTableName ? '..' : '', newDatabaseName, tableNames[0]].filter(Boolean);
		if (!selectedDatabaseName) {
			router.invalidate();
		} else {
			void navigate({ to: parts.join('/') });
		}
	}, [instanceDatabaseMap, selectedDatabaseName, selectedTableName, router, navigate]);

	const onSelectTable = useCallback((newTableName: string | undefined) => {
		const parts = [selectedTableName ? '..' : '', newTableName].filter(Boolean);
		void navigate({ to: parts.join('/') });
	}, [selectedTableName, navigate]);

	const submitNewDatabase = useCallback((formData: z.infer<typeof NewDatabaseSchema>) => {
		createNewDatabase({ ...formData, ...instanceParams }, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				await router.invalidate();
				setIsCreatingDatabase(false);
				form.reset();
				toast.success(`Database ${formData.databaseName} created successfully`);
				onSelectDatabase(formData.databaseName);
			},
		});
	}, [createNewDatabase, form, instanceParams, onSelectDatabase, queryClient, router]);

	const onDeleteTable = useCallback((targetDatabaseName: string, targetTableName: string) => {
		deleteTable({ databaseName: targetDatabaseName, tableName: targetTableName, ...instanceParams }, {
			onSuccess: async () => {
				setIsDeleteModalOpen(false);
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				await router.invalidate();
				toast.success(`Table ${targetTableName} deleted successfully`);
				if (targetTableName === selectedTableName) {
					onSelectTable(undefined);
				}
			},
		});
	}, [deleteTable, instanceParams, onSelectTable, queryClient, router, selectedTableName]);

	const onDeleteDatabase = useCallback((targetDatabaseName: string) => {
		deleteDatabase({ databaseName: targetDatabaseName, ...instanceParams }, {
			onSuccess: async () => {
				setIsDeleteModalOpen(false);
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				await router.invalidate();
				toast.success(`Database ${targetDatabaseName} deleted successfully`);
				onSelectDatabase(undefined);
			},
		});
	}, [deleteDatabase, instanceParams, onSelectDatabase, queryClient, router]);

	const onDeletionConfirmed = useCallback(() => {
		const targetDatabaseName = deletionTarget.databaseName;
		const targetTableName = deletionTarget.tableName;
		if (targetDatabaseName) {
			if (targetTableName) {
				onDeleteTable(targetDatabaseName, targetTableName);
			} else {
				onDeleteDatabase(targetDatabaseName);
			}
		}
	}, [deletionTarget.databaseName, deletionTarget.tableName, onDeleteDatabase, onDeleteTable]);

	return (
		<div>
			<h1 className="pb-6 text-3xl">Browse</h1>
			<div className="">
				<div className="flex space-x-2">
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
					{canManageBrowseInstance && (<>
						<Button
							className="inline-block"
							aria-label="Add a new database"
							variant="positiveOutline"
							onClick={() => setIsCreatingDatabase(!isCreatingDatabase)}
						>
							{!isCreatingDatabase ? <Plus /> : <Minus />}
						</Button>
						<Button
							className="inline-block"
							aria-label="Delete selected database"
							variant="destructiveOutline"
							disabled={!selectedDatabaseName}
							onClick={() => {
								if (selectedDatabaseName) {
									setTypeOfThingBeingDeleted('database');
									setNameOfThingBeingDeleted(selectedDatabaseName);
									setDeletionTarget({ databaseName: selectedDatabaseName });
									setIsDeleteModalOpen(true);
								}
							}}
						>
							<Trash />
						</Button>
					</>)}
				</div>
				{isCreatingDatabase ? (
					<Form {...form}>
						<form className="items-center pl-4 mt-2 space-x-2" onSubmit={form.handleSubmit(submitNewDatabase)}>
							<FormField
								control={form.control}
								name="databaseName"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel htmlFor="databaseName">New Database</FormLabel>
										<FormControl>
											<Input type="text" placeholder="Enter new database name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button type="submit" variant="positiveOutline" className="w-full">
								<Check />
								Create Database
							</Button>
						</form>
					</Form>
				) : (
					''
				)}
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
								{canManageBrowseInstance && (<div className="mx-auto max-w-48">
									<CreateNewTableModal databaseName={selectedDatabaseName} onSelectTable={onSelectTable} />
								</div>)}
							</div>
						) : (tableNames ?? []).length === 0 && !selectedDatabaseName?.length ? (
							// If no database is selected, show a message
							<p className="pt-2 text-sm text-center">Please select a database.</p>
						) : (
							''
						)}
						<ul>
							{(tableNames ?? []).map((tableName) => (
								<li key={tableName} className="flex items-center p-2 border-b hover:bg-grey-700/80 border-grey-700">
									{canManageBrowseInstance && (<Button
										variant="destructiveOutline"
										onClick={() => {
											if (tableName) {
												setTypeOfThingBeingDeleted('table');
												setNameOfThingBeingDeleted(tableName);
												setDeletionTarget({ databaseName: selectedDatabaseName, tableName });
												setIsDeleteModalOpen(true);
											}
										}}
									>
										<Trash className="inline-block " />
									</Button>)}
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
			{selectedDatabaseName?.length && canManageBrowseInstance && (
				<CreateNewTableModal databaseName={selectedDatabaseName} onSelectTable={onSelectTable} />
			)}
			<ConfirmDeletionModal
				typeOfThingBeingDeleted={typeOfThingBeingDeleted}
				nameOfThingBeingDeleted={nameOfThingBeingDeleted}
				isModalOpen={isDeleteModalOpen}
				setIsModalOpen={() => setIsDeleteModalOpen(false)}
				deletionConfirmed={onDeletionConfirmed}
				deletionPending={isDeletingDatabase || isDeletingTable}
			/>
		</div>
	);
}
