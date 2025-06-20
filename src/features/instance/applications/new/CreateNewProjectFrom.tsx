import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
	CreateComponentFormData,
	useCreateComponentMutation,
} from '@/features/instance/operations/mutations/createComponent';
import { toast } from 'sonner';
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const NewProjectSchema = z.object({
	newApplicationName: z
		.string()
		.min(1, { message: 'Project name is required' })
		.max(75, { message: 'Project name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9-_]+$/, { message: 'Can only contain letters, numbers, dashes and underscores' }),
});

const route = getRouteApi('');

export function CreateNewProjectFrom() {
	const navigate = useNavigate();
	const { organizationId, clusterId, instanceId } = route.useParams();
	const form = useForm<z.infer<typeof NewProjectSchema>>({
		resolver: zodResolver(NewProjectSchema),
		defaultValues: {
			newApplicationName: '',
		},
	});
	const { mutate: createNewProject } = useCreateComponentMutation();
	const submitForm = async (formData: CreateComponentFormData) => {
		createNewProject(formData, {
			onSuccess: () => {
				toast.success(`Project ${formData.newApplicationName} created successfully`);
				navigate({ to: `/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications/editor` });
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
					<Button className="w-full mt-4" variant="submit" type="submit" disabled={!form.formState.isDirty}>
						Create <ArrowRight />
					</Button>
				</form>
			</Form>
		</div>
	);
}
