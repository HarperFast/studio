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
	DeployComponentFormData,
	useDeployComponentMutation,
} from '@/features/instance/operations/mutations/deployComponent';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader } from 'lucide-react';
import { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const ImportApplicationSchema = z.object({
	applicationName: z
		.string()
		.nonempty({ error: 'Application name is required.' })
		.max(75, { error: 'Application name cannot be longer than 75 characters.' })
		.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
	applicationUrl: z
		.string()
		.nonempty({ error: 'Please enter a Application URL.' }),
	replicated: z.boolean(),
});

export function ImportApplicationForm({
	onRestartedSuccessfully
}: {
	onRestartedSuccessfully: () => void;
}) {
	const instanceParams = useInstanceClientParams();
	const form = useForm({
		resolver: zodResolver(ImportApplicationSchema),
		defaultValues: {
			applicationName: '',
			applicationUrl: '',
			replicated: instanceParams.entityType === 'cluster',
		},
	});

	const { mutate: deployNewApplication, isPending: isDeployComponentPending } = useDeployComponentMutation();
	const submitForm = async (formData: DeployComponentFormData) => {
		const toastId = toast.loading(`Importing application...`, {
			description: 'This may take a bit.',
			duration: 300_000,
		});
		deployNewApplication({ ...formData, ...instanceParams }, {
			onSuccess: () => {
				toast.success(`Application imported successfully`, {
					description: `${formData.applicationName} is now available!`,
					id: toastId,
					duration: 5_000,
				});
				onRestartedSuccessfully();
			},
			onError: () => {
				toast.dismiss(toastId);
			}
		});
	};

	//NOTE - disabled for now until we build out OAuth to improve the experience from private repos/packages
	// const handleFetchApplication = async (url: string) => {
	// 	if (url.includes('github.com')) {
	// 		const response = await getGitHubRepo(new URL(url));
	// 		if (response) {
	// 			form.setValue('applicationName', response);
	// 			toast.success(`Application "${response}" found successfully`);
	// 		} else {
	// 			toast.error('Invalid GitHub repository URL');
	// 		}
	// 	} else {
	// 		if (url && isValidTarballUrl(url)) {
	// 			form.setValue('applicationName', url);
	// 		}
	// 	}
	// };

	return (
		<div className="mx-auto max-w-96">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="flex flex-col gap-4 text-white">
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
					<FormField
						control={form.control}
						name="applicationUrl"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Package Reference</FormLabel>
								<FormControl>
									<Input
										type="url"
										placeholder="https://github.com/HarperFast/status-check"
										{...field}
										onChange={(e: FormEvent<HTMLInputElement>) => {
											field.onChange(e.currentTarget.value);
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						className="w-full"
						variant="submit"
						type="submit"
						disabled={!form.formState.isDirty || isDeployComponentPending}
					>
						{!isDeployComponentPending ? (
							<>
								Create <ArrowRight />
							</>
						) : (
							<Loader className="animate-spin" />
						)}
					</Button>
				</form>
			</Form>
		</div>
	);
}
