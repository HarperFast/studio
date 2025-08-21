import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import {
	CreateComponentFormData,
	useCreateComponentMutation,
} from '@/features/instance/operations/mutations/createComponent';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const NewProjectSchema = z.object({
	newApplicationName: z
		.string()
		.min(1, { message: 'Project name is required' })
		.max(75, { message: 'Project name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9-_]+$/, { message: 'Can only contain letters, numbers, dashes and underscores' }),
	replicated: z.boolean(),
});

export function CreateNewProjectForm({
	restartingInstanceOrCluster,
	isRestartInstanceOrClusterPending,
}: {
	restartingInstanceOrCluster: () => void;
	isRestartInstanceOrClusterPending: boolean;
}) {
	const instanceParams = useInstanceClientParams();
	const form = useForm<z.infer<typeof NewProjectSchema>>({
		resolver: zodResolver(NewProjectSchema),
		defaultValues: {
			newApplicationName: '',
			replicated: instanceParams.entityType === 'cluster',
		},
	});

	const { mutate: createNewProject } = useCreateComponentMutation();
	const submitForm = (formData: CreateComponentFormData) => {
		createNewProject({ ...formData, ...instanceParams }, {
			onSuccess: () => {
				toast.success(`Project ${formData.newApplicationName} created successfully`);
				restartingInstanceOrCluster();
			},
			onError: (error) => {
				toast.error(`Error creating project: ${error.message}`);
			},
		});
	};
	return (
		<div className="mx-auto max-w-96">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="text-white">
					<FormField
						control={form.control}
						name="newApplicationName"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1 text-center">New Project Name</FormLabel>
								<FormControl>
									<Input type="text" placeholder="e-commerce-store" className="text-center bg-black" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						className="w-full mt-4"
						variant="submit"
						type="submit"
						disabled={!form.formState.isDirty || isRestartInstanceOrClusterPending}
					>
						Create <ArrowRight />
					</Button>
				</form>
			</Form>
		</div>
	);
}
