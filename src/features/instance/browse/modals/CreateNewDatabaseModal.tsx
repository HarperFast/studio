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
import { useCreateDatabaseSubmitMutation } from '@/features/instance/operations/mutations/createDatabase';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Plus, Table } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const NewDatabaseSchema = z.object({
	databaseName: z
		.string({
			message: 'Please enter a valid database name.',
		})
		.min(1, { message: 'Database name is required' })
		.max(75, { message: 'Database name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9_]+$/, { message: 'Database name can only contain letters, numbers, and underscores' }),
});

export function CreateNewDatabaseModal({
	onSelectDatabase,
	isCreatingDatabase,
	setIsCreatingDatabase,
}: {
	readonly onSelectDatabase: (databaseName: string | undefined) => void;
	readonly isCreatingDatabase: boolean;
	readonly setIsCreatingDatabase: (isCreating: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const router = useRouter();
	const form = useForm({
		resolver: zodResolver(NewDatabaseSchema),
		defaultValues: {
			databaseName: '',
		},
	});

	const { mutate: createNewDatabase } = useCreateDatabaseSubmitMutation();

	const submitForm = async (formData: z.infer<typeof NewDatabaseSchema>) => {
		createNewDatabase({
			databaseName: formData.databaseName,
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
		}, {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				toast.success(`Database ${formData.databaseName} created successfully`);
				setIsCreatingDatabase(false);
				form.reset();
				onSelectDatabase(formData.databaseName);
				await router.invalidate();
			},
		});
	};

	return (
		<Dialog open={isCreatingDatabase} onOpenChange={setIsCreatingDatabase}>
			<DialogTrigger asChild>
				<Button variant="positiveOutline" className="w-full rounded-full" size="lg" accessKey="d">
					<Plus />
					<span>
						Create a <u>D</u>atabase
					</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create a New Database</DialogTitle>
					<DialogDescription>
						What would you like to name your first database?
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="grid gap-6 text-white">
						<FormField
							control={form.control}
							name="databaseName"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="pb-1">Database Name</FormLabel>
									<FormControl>
										<Input type="text" placeholder="ex. Data" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit" variant="submit" className="rounded-full">
								<Table />
								Create New Database
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
