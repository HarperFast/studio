import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useCreateTableMutation } from '@/integrations/api/instance/database/createTable';
import { databaseNameSchema } from '@/integrations/api/instance/database/databaseNameSchema';
import { schemaRegex } from '@/integrations/api/instance/database/schemaRegex';
import { tableNameSchema } from '@/integrations/api/instance/database/tableNameSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Plus, Table } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const CreateTableSchema = z.object({
	databaseName: databaseNameSchema,
	tableName: tableNameSchema,
	primaryKey: z
		.string()
		.regex(schemaRegex, {
			error: 'Primary key cannot include backticks or forward slashes.',
		})
		.max(250, {
			error: 'Primary key cannot be longer than 250 characters.',
		}),
});

export function CreateNewTableModal({ databaseName, onSelectTable }: {
	readonly databaseName: string | undefined;
	readonly onSelectTable: (databaseName: string | undefined, tableName: string | undefined) => void;
}) {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const router = useRouter();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const form = useForm({
		resolver: zodResolver(CreateTableSchema),
		defaultValues: {
			databaseName: databaseName || '',
			tableName: '',
			primaryKey: '',
		},
	});

	const { mutate: submitNewTableData } = useCreateTableMutation();

	const submitForm = async (formData: z.infer<typeof CreateTableSchema>) => {
		const databaseName = formData.databaseName || 'data';
		const tableName = formData.tableName;
		submitNewTableData({
			databaseName,
			tableName,
			primaryKey: formData.primaryKey || 'id',
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
		}, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				toast.success(`Table ${tableName} created successfully`);
				setIsModalOpen(false);
				form.reset();
				onSelectTable(databaseName, tableName);
				await router.invalidate();
			},
		});
	};

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogTrigger asChild>
				<div className="sticky bottom-0 py-4 bg-black/70 backdrop-blur-xs">
					<Button variant="positiveOutline" className="w-full rounded-full" size="lg" accessKey="t">
						<Plus />
						<span>
							Create a <u>T</u>able
						</span>
					</Button>
				</div>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create a New Table</DialogTitle>
					<DialogDescription>
						What would you like to create?
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="grid gap-6 text-white">
						<FormField
							control={form.control}
							name="tableName"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Table Name</FormLabel>
									<FormControl>
										<Input
											{...field}
											type="text"
											maxLength={CreateTableSchema.shape.tableName.maxLength!}
											autoFocus={true}
											autoCapitalize="off"
											autoComplete="off"
											autoCorrect="off"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="primaryKey"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Primary Key</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="id"
											type="text"
											maxLength={CreateTableSchema.shape.primaryKey.maxLength!}
											autoCapitalize="off"
											autoComplete="off"
											autoCorrect="off"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="databaseName"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Database Name</FormLabel>
									<FormControl>
										<Input
											{...field}
											type="text"
											placeholder="data"
											maxLength={CreateTableSchema.shape.databaseName.maxLength!}
											autoCapitalize="off"
											autoComplete="off"
											autoCorrect="off"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit" variant="submit" className="rounded-full">
								<Table />
								Create New Table
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
