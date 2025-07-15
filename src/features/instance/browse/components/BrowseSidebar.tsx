import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateNewTableModal } from '@/features/instance/browse/modals/CreateNewTableModal';
import { useCreateDatabaseSubmitMutation } from '@/features/instance/operations/mutations/createDatabase';
import { useDeleteDatabaseMutation } from '@/features/instance/operations/mutations/deleteDatabase';
import { useDeleteTableMutation } from '@/features/instance/operations/mutations/deleteTable';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import { ArrowRight, Check, Minus, Plus, Trash } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type BrowseSidebarProps = {
	databases: string[];
	onSelectDatabase: (schemaName: string | undefined) => void;
	onSelectTable: (tableName: string | undefined) => void;
	tables?: string[];
};

const route = getRouteApi('');

const NewDatabaseSchema = z.object({
	newDatabaseName: z
		.string({
			message: 'Please enter a valid database name.',
		})
		.min(1, { message: 'Database name is required' })
		.max(75, { message: 'Database name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9_]+$/, { message: 'Database name can only contain letters, numbers, and underscores' }),
});

export function BrowseSidebar({ databases, onSelectDatabase, tables, onSelectTable }: BrowseSidebarProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { instanceId, schemaName, tableName } = route.useParams();
	const [typeOfThingBeingDeleted, setTypeOfThingBeingDeleted] = useState("");
	const [nameOfThingBeingDeleted, setNameOfThingBeingDeleted] = useState("");
	const [deletionTarget, setDeletionTarget] = useState<{ databaseName?: string; tableName?: string; }>({});
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

	const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);

	const form = useForm({
		resolver: zodResolver(NewDatabaseSchema),
		defaultValues: {
			newDatabaseName: '',
		},
	});

	const { mutate: createNewDatabase } = useCreateDatabaseSubmitMutation();
	const { mutate: deleteDatabase, isPending: isDeletingDatabase } = useDeleteDatabaseMutation();
	const { mutate: deleteTable, isPending: isDeletingTable } = useDeleteTableMutation();

	const submitNewDatabase = (formData: z.infer<typeof NewDatabaseSchema>) => {
		createNewDatabase(formData, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: [instanceId, 'describe_all'], refetchType: 'all' });
				await router.invalidate();
				setIsCreatingDatabase(false);
				form.reset();
				toast.success(`Database ${formData.newDatabaseName} created successfully`);
				onSelectDatabase(formData.newDatabaseName);
			},
		});
	};

	const onDeletionConfirmed = useCallback(() => {
		const targetDatabaseName = deletionTarget.databaseName;
		const targetTableName = deletionTarget.tableName;
		if (targetDatabaseName) {
			if (targetTableName) {
				deleteTable({ databaseName: targetDatabaseName, tableName: targetTableName }, {
					onSuccess: async () => {
						setIsDeleteModalOpen(false);
						await queryClient.invalidateQueries({
							queryKey: [instanceId, 'describe_all'],
							refetchType: 'all',
						});
						await router.invalidate();
						toast.success(`Table ${targetTableName} deleted successfully`);
						if (targetTableName === tableName) {
							onSelectTable(undefined);
						}
					},
				});
			} else {
				deleteDatabase(targetDatabaseName, {
					onSuccess: async () => {
						setIsDeleteModalOpen(false);
						await queryClient.invalidateQueries({
							queryKey: [instanceId, 'describe_all'],
							refetchType: 'all',
						});
						await router.invalidate();
						toast.success(`Database ${targetDatabaseName} deleted successfully`);
						onSelectDatabase(undefined);
					},
				});
			}
		}
	}, [deleteDatabase, deleteTable, deletionTarget, instanceId, onSelectDatabase, onSelectTable, queryClient, router, tableName]);

	return (
		<div>
			<h1 className="pb-6 text-3xl">Browse</h1>
			<div className="">
				<div className="flex space-x-2">
					<Select
						name="databaseSelect"
						value={schemaName || ''}
						onValueChange={(selectedDatabaseName) => {
							onSelectDatabase(selectedDatabaseName);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select a Database" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{databases?.map((schema) => (
									<SelectItem key={schema} value={schema}>
										{schema}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
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
						disabled={!schemaName}
						onClick={() => {
							if (schemaName) {
								setTypeOfThingBeingDeleted("database");
								setNameOfThingBeingDeleted(schemaName);
								setDeletionTarget({ databaseName: schemaName });
								setIsDeleteModalOpen(true);
							}
						}}
					>
						<Trash />
					</Button>
				</div>
				{isCreatingDatabase ? (
					<Form {...form}>
						<form className="items-center pl-4 mt-2 space-x-2" onSubmit={form.handleSubmit(submitNewDatabase)}>
							<FormField
								control={form.control}
								name="newDatabaseName"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel htmlFor="newDatabaseName">New Database</FormLabel>
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
						{(tables ?? []).length === 0 && schemaName?.length ? (
							<div className="w-full h-full text-center">
								<p className="py-6">No tables found in this database.</p>
								<div className="mx-auto max-w-48">
									<CreateNewTableModal databaseName={schemaName} instanceId={instanceId} onSelectTable={onSelectTable} />
								</div>
							</div>
						) : (tables ?? []).length === 0 && !schemaName?.length ? (
							// If no database is selected, show a message
							<p className="pt-2 text-sm text-center">Please select a database.</p>
						) : (
							''
						)}
						<ul>
							{(tables ?? []).map((table) => (
								<li key={table} className="flex items-center p-2 border-b hover:bg-grey-700/80 border-grey-700">
									<Button
										variant="destructiveOutline"
										onClick={() => {
											if (table) {
												setTypeOfThingBeingDeleted("table");
												setNameOfThingBeingDeleted(table);
												setDeletionTarget({ databaseName: schemaName, tableName: table });
												setIsDeleteModalOpen(true);
											}
										}}
									>
										<Trash className="inline-block " />
									</Button>
									<Button
										onClick={() => onSelectTable(table)}
										size="lg"
										className="items-center justify-between w-full bg-transparent border-none shadow-none hover:bg-transparent"
									>
										{table}
										<span>
											{tableName === table && <ArrowRight />}
										</span>
									</Button>
								</li>
							))}
						</ul>
					</TabsContent>
				</ScrollArea>
			</Tabs>
			{schemaName?.length && (
				<CreateNewTableModal databaseName={schemaName} instanceId={instanceId} onSelectTable={onSelectTable} />
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
