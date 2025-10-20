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

const NewApplicationSchema = z.object({
	applicationName: z
		.string()
		.nonempty({ error: 'Application name is required.' })
		.max(75, { error: 'Application name cannot be longer than 75 characters.' })
		.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
	replicated: z.boolean(),
});

export function CreateNewApplicationForm({
	triggerRestart,
	isRestartPending,
}: {
	triggerRestart: () => void;
	isRestartPending: boolean;
}) {
	const instanceParams = useInstanceClientParams();
	const form = useForm({
		resolver: zodResolver(NewApplicationSchema),
		defaultValues: {
			applicationName: '',
			replicated: instanceParams.entityType === 'cluster',
		},
	});

	const { mutate: createNewApplication, isPending: isCreateNewApplicationPending } = useCreateComponentMutation();
	const submitForm = (formData: CreateComponentFormData) => {
		createNewApplication({ ...formData, ...instanceParams }, {
			onSuccess: () => {
				toast.success(`Application ${formData.applicationName} created successfully`);
				triggerRestart();
			},
		});
	};
	return (
		<div className="mx-auto max-w-96">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="text-white w-full flex flex-col gap-4">
					<FormField
						control={form.control}
						name="applicationName"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">New Application Name</FormLabel>
								<FormControl>
									<Input type="text" placeholder="e-commerce-store" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						className="w-full"
						variant="submit"
						type="submit"
						disabled={!form.formState.isDirty || isCreateNewApplicationPending || isRestartPending}
					>
						Create <ArrowRight />
					</Button>
				</form>
			</Form>
		</div>
	);
}
