import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
import { Table } from 'lucide-react';
import { useEffect } from 'react';
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

export function CreateNewTableModal({ isModalOpen, setIsModalOpen, databaseName, onCreated }: {
	readonly isModalOpen: boolean;
	readonly setIsModalOpen: (open: boolean) => void;
	readonly databaseName: string | undefined;
	readonly onCreated: (databaseName: string, tableName: string) => void;
}) {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const router = useRouter();
	const form = useForm({
		resolver: zodResolver(CreateTableSchema),
		defaultValues: {
			databaseName: databaseName || '',
			tableName: '',
			primaryKey: '',
		},
	});

	// This modal is mounted persistently (not remounted per trigger), so re-seed the form with the
	// target database each time it opens -- otherwise a right-click on a different database would keep
	// the previously-prefilled name.
	const { reset } = form;
	useEffect(() => {
		if (isModalOpen) {
			reset({ databaseName: databaseName || '', tableName: '', primaryKey: '' });
		}
	}, [isModalOpen, databaseName, reset]);

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
				onCreated(databaseName, tableName);
				await router.invalidate();
			},
		});
	};

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create a New Table</DialogTitle>
					<DialogDescription>
						What would you like to create?
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="instance-new-table-form"
						name="instance-new-table-form"
						onSubmit={form.handleSubmit(submitForm)}
						className="grid gap-6 text-popover-foreground"
					>
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
							<Button type="submit" variant="submit">
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
