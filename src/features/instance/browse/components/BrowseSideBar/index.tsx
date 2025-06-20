import { useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreateNewTableModal } from '@/features/instance/modals/CreateNewTableModal';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Minus, Plus, Trash } from 'lucide-react';
import { useCreateDatabaseSubmitMutation } from '@/features/instance/operations/mutations/createDatabase';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { useDeleteDatabaseMutation } from '@/features/instance/operations/mutations/deleteDatabase';
import { DeleteTableData, useDeleteTableMutation } from '@/features/instance/operations/mutations/deleteTable';

type BrowseSidebarProps = {
	databases: string[];
	onSelectDatabase: (databaseName: string) => void;
	selectedDatabase?: string;
	tables?: string[];
	onSelectTable: (tableName: string) => void;
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

export function BrowseSidebar({ databases, onSelectDatabase, selectedDatabase, tables, onSelectTable }: BrowseSidebarProps) {
	const queryClient = useQueryClient();
	const { organizationId, clusterId, instanceId, schemaName } = route.useParams();
	const navigate = useNavigate();

	const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);

	const form = useForm({
		resolver: zodResolver(NewDatabaseSchema),
		defaultValues: {
			newDatabaseName: '',
		},
	});

	const handleSelectedTable = (selectedTableName: string) => {
		onSelectTable(selectedTableName);
		navigate({
			to: `/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/browse/${selectedDatabase}/${selectedTableName}`,
		});
	};

	const { mutate: createNewDatabase } = useCreateDatabaseSubmitMutation();
	const { mutate: deleteDatabase } = useDeleteDatabaseMutation();
	const { mutate: deleteTable } = useDeleteTableMutation();

	const submitNewDatabase = async (formData: z.infer<typeof NewDatabaseSchema>) => {
		await createNewDatabase(formData, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [instanceId, 'describe_all'] });
				toast.success(`Database ${formData.newDatabaseName} created successfully`);
				setIsCreatingDatabase(false);
				form.reset();
			},
		});
	};

	const deleteSelectedDatabase = async (databaseName: string) => {
		deleteDatabase(databaseName, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [instanceId] });
				toast.success(`Database ${databaseName} deleted successfully`);
				navigate({
					to: `/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/browse`,
				});
			},
		});
	};

	const deleteSelectedTable = async (data: DeleteTableData) => {
		deleteTable(data, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [instanceId, 'describe_all'] });
				navigate({
					to: `/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/browse/${schemaName}`,
				});
				toast.success(`Table ${data.tableName} deleted successfully`);
			},
		});
	};

	const handleDeleteTable = (tableName: string) => {
		if (!tableName) return;
		deleteSelectedTable({ databaseName: schemaName, tableName });
	};

	return (
		<div>
			<h1 className="pb-6 text-3xl">Browse</h1>
			<div className="">
				<div className="flex space-x-2">
					<Select
						name="databaseSelect"
						defaultValue={selectedDatabase}
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
						disabled={!selectedDatabase}
						onClick={() => {
							if (!selectedDatabase) return;
							deleteSelectedDatabase(selectedDatabase);
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
						{(tables ?? []).length === 0 && selectedDatabase?.length ? (
							<div className="w-full h-full text-center">
								<p className="py-6">No tables found in this database.</p>
								<div className="mx-auto max-w-48">
									<CreateNewTableModal databaseName={selectedDatabase || ''} instanceId={instanceId} />
								</div>
							</div>
						) : (tables ?? []).length === 0 && !selectedDatabase?.length ? (
							// If no database is selected, show a message
							<p className="pt-2 text-sm text-center">Please select a database.</p>
						) : (
							''
						)}
						<ul>
							{(tables ?? []).map((table) => (
								<li key={table} className="flex items-center p-2 border-b hover:bg-grey-700/80 border-grey-700">
									<Button
										variant="defaultOutline"
										onClick={() => {
											handleDeleteTable(table);
										}}
									>
										<Trash className="inline-block " />
									</Button>
									<Button
										onClick={() => handleSelectedTable(table)}
										size="lg"
										className="items-center justify-between w-full bg-transparent border-none shadow-none hover:bg-transparent"
									>
										<span>{table}</span>
										<span>
											<ArrowRight />
										</span>
									</Button>
								</li>
							))}
						</ul>
					</TabsContent>
				</ScrollArea>
			</Tabs>
			{selectedDatabase?.length && (
				<CreateNewTableModal databaseName={selectedDatabase || ''} instanceId={instanceId} />
			)}
		</div>
	);
}
