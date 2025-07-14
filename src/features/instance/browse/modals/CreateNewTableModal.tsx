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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Table } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateTableMutation } from '@/features/instance/operations/mutations/createTable';
import { toast } from 'sonner';
import { useRouter } from '@tanstack/react-router';

const CreateTableSchema = z.object({
	tableName: z
		.string()
		.min(1, {
			message: 'Table name is required.',
		})
		.regex(/^[a-zA-Z0-9_]+$/, {
			message: 'Table name can only contain letters, numbers, and underscores.',
		})
		.max(30, {
			message: 'Table name must be less than 30 characters.',
		}),
	primaryKey: z
		.string()
		.min(1, {
			message: 'Primary key is required.',
		})
		.regex(/^[a-zA-Z0-9_]+$/, {
			message: 'Primary key can only contain letters, numbers, and underscores.',
		})
		.max(14, {
			message: 'Primary key must be less than 14 characters.',
		}),
});

export function CreateNewTableModal({ databaseName, instanceId, onSelectTable }: {
	readonly databaseName: string;
	readonly instanceId: string;
	readonly onSelectTable: (tableName: string | undefined) => void;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const form = useForm({
		resolver: zodResolver(CreateTableSchema),
		defaultValues: {
			tableName: '',
			primaryKey: '',
		},
	});

	const { mutate: submitNewTableData } = useCreateTableMutation();

	const submitForm = async (formData: z.infer<typeof CreateTableSchema>) => {
		const updatedFormData = {
			...formData,
			databaseName: databaseName,
		};
		submitNewTableData(updatedFormData, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: [instanceId, 'describe_all'], refetchType: 'all' });
				toast.success(`Table ${formData.tableName} created successfully`);
				setIsModalOpen(false);
				form.reset();
				onSelectTable(formData.tableName);
				await router.invalidate();
			},
		});
	};

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogTrigger asChild>
				<Button variant="positiveOutline" className="w-full rounded-full" size="lg">
					<Plus /> Create a Table
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create a New Table</DialogTitle>
					<DialogDescription>
						Create a new table for <strong>{databaseName}</strong>.
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
										<Input type="text" placeholder="ex. Users" {...field} />
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
										<Input type="text" placeholder="ex. id" {...field} />
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
