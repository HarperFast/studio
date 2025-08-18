import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
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
import { useNavigate, useParams } from '@tanstack/react-router';
import { useUpdateRestartInstance } from '../../operations/mutations/updateRestartInstance';

const NewProjectSchema = z.object({
	newApplicationName: z
		.string()
		.min(1, { message: 'Project name is required' })
		.max(75, { message: 'Project name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9-_]+$/, { message: 'Can only contain letters, numbers, dashes and underscores' }),
});

export function CreateNewProjectFrom() {
	const { clusterId, instanceId } = useParams({ strict: false });
	const targetId = instanceId ?? clusterId;
	const { mutate: restartInstance, isPending: isRestartInstancePending } = useUpdateRestartInstance();
	const navigate = useNavigate();
	const targetNoun = instanceId ? 'Instance' : 'Cluster';
	const form = useForm<z.infer<typeof NewProjectSchema>>({
		resolver: zodResolver(NewProjectSchema),
		defaultValues: {
			newApplicationName: '',
		},
	});

	const restartingInstance = () => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 60000, // Keep the toast open until dismissed
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance(targetId, {
			onSuccess: () => {
				toast.dismiss(toastId);
				toast.success('Success', {
					description: `${targetNoun} restarted!`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				void navigate({ to: `../editor` });
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to restart ${targetNoun.toLowerCase()}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	};
	const { mutate: createNewProject } = useCreateComponentMutation();
	const submitForm = (formData: CreateComponentFormData) => {
		createNewProject(formData, {
			onSuccess: () => {
				toast.success(`Project ${formData.newApplicationName} created successfully`);
				restartingInstance();
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
						disabled={!form.formState.isDirty || isRestartInstancePending}
					>
						Create <ArrowRight />
					</Button>
				</form>
			</Form>
		</div>
	);
}
