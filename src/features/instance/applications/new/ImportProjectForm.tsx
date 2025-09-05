import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { getGitHubRepo } from '@/features/instance/applications/new/functions/getGitHubRepo';
import { isValidTarballUrl } from '@/features/instance/applications/new/functions/isValidTarballUrl';
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

const ImportProjectSchema = z.object({
	newApplicationName: z
		.string()
		.min(1, { error: 'Project name is required' })
		.max(75, { error: 'Project name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9-_]+$/, { error: 'Can only contain letters, numbers, dashes and underscores' }),
	applicationUrl: z.string(),
	replicated: z.boolean(),
});

export function ImportProjectForm({
	isRestartPending,
}: {
	isRestartPending: boolean;
}) {
	const instanceParams = useInstanceClientParams();
	const form = useForm({
		resolver: zodResolver(ImportProjectSchema),
		defaultValues: {
			newApplicationName: '',
			applicationUrl: '',
			replicated: instanceParams.entityType === 'cluster',
		},
	});

	const { mutate: deployNewApplication, isPending: isDeployComponentPending } = useDeployComponentMutation();
	const submitForm = async (formData: DeployComponentFormData) => {
		deployNewApplication({ ...formData, ...instanceParams }, {
			onSuccess: () => {
				toast.success(`Application ${formData.newApplicationName} created successfully`);
			},
		});
	};
	const handleFetchApplication = async (url: string) => {
		if (url.includes('github.com')) {
			const response = await getGitHubRepo(new URL(url));
			if (response) {
				form.setValue('newApplicationName', response);
				toast.success(`Application "${response}" found successfully`);
			} else {
				toast.error('Invalid GitHub repository URL');
			}
		} else {
			if (url && isValidTarballUrl(url)) {
				form.setValue('newApplicationName', url);
			}
		}
	};

	return (
		<div className="mx-auto max-w-96">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="flex flex-col gap-4 text-white">
					<FormField
						control={form.control}
						name="newApplicationName"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">New Project Name</FormLabel>
								<FormControl>
									<Input type="text" placeholder="e-commerce-store" className="bg-black " {...field} />
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
								<FormLabel className="pb-1">Project URL</FormLabel>
								<FormControl>
									<Input
										type="url"
										placeholder="https://github.com/HarperDB/nextjs-example"
										className="bg-black"
										{...field}
										onChange={(e: FormEvent<HTMLInputElement>) => {
											// field.onChange(handleFetchApplication(e.currentTarget.value));
											field.onChange(e.currentTarget.value);
											handleFetchApplication(e.currentTarget.value);
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						className="w-full mt-4"
						variant="submit"
						type="submit"
						disabled={!form.formState.isDirty || isDeployComponentPending || isRestartPending}
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
