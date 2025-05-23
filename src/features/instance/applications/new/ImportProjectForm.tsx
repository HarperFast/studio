import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, FolderSymlink } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateComponentMutation } from '../../operations/mutations/createComponent';
import { toast } from 'sonner';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioButtonGroup } from '@/components/RadioButtonGroup';
import { useState } from 'react';

const ImportProjectSchema = z.object({
	projectName: z
		.string()
		.min(1, { message: 'Project name is required' })
		.max(75, { message: 'Project name must be less than 75 characters' })
		.regex(/^[a-zA-Z0-9-_]+$/, { message: 'Can only contain letters, numbers, dashes and underscores' }),
	deploymentTarget: z.string().optional(),
	githubProjectUrl: z.string().optional(),
	customProjectUrl: z.string().optional(),
});

const route = getRouteApi('');

function ImportProjectForm() {
	const navigate = useNavigate();
	const { organizationId, clusterId, instanceId } = route.useParams();
	const [projectUrlType, setProjectUrlType] = useState('');
	const form = useForm<z.infer<typeof ImportProjectSchema>>({
		resolver: zodResolver(ImportProjectSchema),
		defaultValues: {
			projectName: '',
			deploymentTarget: '',
			githubProjectUrl: '',
			customProjectUrl: '',
		},
	});

	const urlTypesList = [
		{
			value: 'github',
			label: 'GitHub',
			icon: <img className="h-6 p-0.5 text-white bg-white rounded" src="/github-icon.svg" alt="GitHub" />,
		},
		{ value: 'custom', label: 'Custom', icon: <FolderSymlink className="text-white" /> },
	];
	const { mutate: createNewProject } = useCreateComponentMutation();
	const submitForm = async (formData: typeof ImportProjectSchema) => {
		createNewProject(formData, {
			onSuccess: () => {
				toast.success(`Project ${formData} created successfully`);
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
				<form onSubmit={form.handleSubmit(submitForm)} className="flex flex-col gap-4 text-white">
					<FormField
						control={form.control}
						name="projectName"
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
						name="deploymentTarget"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1 ">Deployment Target</FormLabel>
								<FormControl>
									<Select {...field}>
										<SelectTrigger className="w-full bg-black">
											<SelectValue placeholder="Select deployment target" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="instanceName">Instance</SelectItem>
										</SelectContent>
									</Select>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<RadioButtonGroup
						options={urlTypesList}
						name="size"
						onChange={() => {
							setProjectUrlType((prev) => (prev === 'github' ? 'custom' : 'github'));
						}}
					/>
					{projectUrlType === 'github' ? (
						<FormField
							control={form.control}
							name="githubProjectUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1 ">GitHub Project URL</FormLabel>
									<FormControl>
										<Input type="url" placeholder="https://github.com/....." className="bg-black " {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : projectUrlType === 'custom' ? (
						<FormField
							control={form.control}
							name="customProjectUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1 ">Custom Project URL</FormLabel>
									<FormControl>
										<Input
											type="text"
											placeholder="https://custom.projecturl.com/projectName.tar"
											className="bg-black "
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : (
						''
					)}

					<Button className="w-full mt-4" variant="submit" type="submit" disabled={!form.formState.isDirty}>
						Create <ArrowRight />
					</Button>
				</form>
			</Form>
		</div>
	);
}
export default ImportProjectForm;
