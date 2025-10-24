import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { templates } from '@/features/instance/applications/modals/templates';
import {
	CreateComponentFormData,
	useCreateComponentMutation,
} from '@/features/instance/operations/mutations/createComponent';
import { Cluster, Instance, Organization } from '@/lib/api.patch';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouteContext } from '@tanstack/react-router';
import {
	BoxesIcon,
	CheckIcon,
	CopyIcon,
	GitBranchIcon,
	GithubIcon,
	LinkIcon,
	PackageIcon,
	RocketIcon,
	TerminalIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const NewApplicationSchema = z.object({
	applicationName: z
		.string()
		.max(75, { error: 'Application name cannot be longer than 75 characters.' })
		.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
	applicationUrl: z
		.string()
		.nonempty({ error: 'Please enter a Application URL.' }),
	replicated: z.boolean(),
});

export function NewApplication() {
	const { reloadRootEntries, rootEntries } = useEditorView();
	const { organization, instance, cluster }: {
		organization?: Organization;
		instance?: Instance;
		cluster?: Cluster
	} = useRouteContext({ strict: false });

	const defaultApplicationName = useMemo(() => {
		const defaultName = cluster?.name || instance?.name || organization?.name || '';
		if (defaultName === '') {
			return defaultName;
		}
		let uniqueName = defaultName;
		let number = 1;
		while (rootEntries.find(re => re.name === uniqueName)) {
			number += 1;
			uniqueName = `${defaultName} ${number}`;
		}
		return uniqueName;
	}, [rootEntries, cluster, instance, organization]);

	const [appType, setAppType] = useState('templates');

	const instanceParams = useInstanceClientParams();
	const form = useForm({
		resolver: zodResolver(NewApplicationSchema),
		defaultValues: {
			applicationName: '',
			replicated: instanceParams.entityType === 'cluster',
		},
	});

	const appName = form.watch('applicationName');

	// TODO: Most of these will be in the form state instead.
	const [selectedTemplate, setSelectedTemplate] = useState(templates[0].id);
	const [importSource, setImportSource] = useState('git');
	const [gitUrl, setGitUrl] = useState('');
	const [needsAuth, setNeedsAuth] = useState(false);
	const [npmPackage, setNpmPackage] = useState('');
	const [tarballUrl, setTarballUrl] = useState('');

	const { mutate: createNewApplication, isPending: isCreateNewApplicationPending } = useCreateComponentMutation();
	const submitForm = useCallback((formData: CreateComponentFormData) => {
		createNewApplication({ ...formData, ...instanceParams }, {
			onSuccess: () => {
				toast.success(`Application ${formData.applicationName} created successfully`);
				reloadRootEntries();
			},
		});
	}, [createNewApplication, instanceParams, reloadRootEntries]);

	// const form = useForm({
	// 	resolver: zodResolver(ImportApplicationSchema),
	// 	defaultValues: {
	// 		applicationName: '',
	// 		applicationUrl: '',
	// 		replicated: instanceParams.entityType === 'cluster',
	// 	},
	// });
	//
	// const { mutate: deployNewApplication, isPending: isDeployComponentPending } = useDeployComponentMutation();
	// const submitForm = async (formData: DeployComponentFormData) => {
	// 	const toastId = toast.loading(`Importing application...`, {
	// 		description: 'This may take a bit.',
	// 		duration: 300_000,
	// 	});
	// 	deployNewApplication({ ...formData, ...instanceParams }, {
	// 		onSuccess: () => {
	// 			toast.success(`Application imported successfully`, {
	// 				description: `${formData.applicationName} is now available!`,
	// 				id: toastId,
	// 				duration: 5_000,
	// 			});
	// 			onRestartedSuccessfully();
	// 		},
	// 		onError: () => {
	// 			toast.dismiss(toastId);
	// 		}
	// 	});
	// };

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
		<div className="mx-auto max-w-4xl">
			<div className="text-center">
				<h1 className="text-4xl pt-4 pb-2">Bootstrap New API Application</h1>
				<p className="text-muted-foreground">
					Create a new application from templates, import existing code, or deploy with Harper CLI
				</p>
			</div>

			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitForm)} className="flex flex-col gap-4 m-4">

					<Card className="bg-black-dark">
						<CardHeader>
							<CardTitle>Application Name</CardTitle>
							<CardDescription>
								Choose a name for your new API application
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">

								<FormField
									control={form.control}
									name="applicationName"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">Name</FormLabel>
											<FormControl>
												<Input
													type="text"
													autoCapitalize="words"
													autoComplete="off"
													autoFocus={true}
													placeholder={defaultApplicationName}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<p className="text-muted-foreground text-sm">
									Use lowercase letters, numbers, underscores, and hyphens
								</p>

							</div>
						</CardContent>
					</Card>


					<Tabs defaultValue={appType} onValueChange={setAppType}>
						<TabsList className="w-full grid grid-cols-3">
							<TabsTrigger value="templates">
								<BoxesIcon />
								<span className="hidden sm:inline-block">Templates</span>
							</TabsTrigger>
							<TabsTrigger value="import">
								<GitBranchIcon />
								Import
							</TabsTrigger>
							<TabsTrigger value="cli">
								<TerminalIcon />
								<span className="hidden md:inline-block">Harper</span> CLI
							</TabsTrigger>
						</TabsList>

						<TabsContent value="templates" className="space-y-4">
							<Card>
								<CardHeader>
									<CardTitle>Choose a Template</CardTitle>
									<CardDescription>
										Start with a pre-configured template for common use cases
									</CardDescription>
								</CardHeader>
								<CardContent>
									<RadioGroup value={selectedTemplate} onValueChange={setSelectedTemplate}>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											{templates.map((template) => (
												<div key={template.id} className="relative">
													<RadioGroupItem
														value={template.id}
														id={template.id}
														className="peer sr-only"
													/>
													<Label
														htmlFor={template.id}
														className="flex flex-col gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-accent peer-data-[state=checked]:border-green peer-data-[state=checked]:bg-primary/5"
													>
														<div>
															<div className="mb-1 flex items-center gap-2">
																<span>{template.name}</span>
																<a
																	href={template.githubUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																	onClick={onClickStopPropagation}
																	className="text-muted-foreground hover:text-white transition-colors -m-4 p-4"
																>
																	<GithubIcon className="w-4 h-4" />
																</a>
															</div>
															<p className="text-muted-foreground text-sm">
																{template.description}
															</p>
														</div>
														<div className="flex flex-wrap gap-2">
															{template.tags.map((tag) => (
																<Badge key={tag} variant="outline">
																	{tag}
																</Badge>
															))}
														</div>
													</Label>
												</div>
											))}
										</div>
									</RadioGroup>
									<Separator className="my-6" />
									<Button
										className="w-full"
										// TODO: Bind with form
										disabled={!selectedTemplate || !appName.trim() || isCreateNewApplicationPending}
									>
										<RocketIcon className="w-4 h-4 mr-2" />
										Create from Template
									</Button>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="import" className="space-y-4">
							<Card>
								<CardHeader>
									<CardTitle>Import Existing Application</CardTitle>
									<CardDescription>
										Import from Git, NPM, or a tarball URL
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-6">
									<Tabs value={importSource} onValueChange={setImportSource}>
										<TabsList className="grid w-full grid-cols-3">
											<TabsTrigger value="git">
												<GithubIcon className="w-4 h-4 mr-2" />
												Git
											</TabsTrigger>
											<TabsTrigger value="npm">
												<PackageIcon className="w-4 h-4 mr-2" />
												NPM
											</TabsTrigger>
											<TabsTrigger value="tarball">
												<LinkIcon className="w-4 h-4 mr-2" />
												Tarball
											</TabsTrigger>
										</TabsList>

										<TabsContent value="git" className="space-y-4 mt-4">
											<div className="space-y-2">
												<Label htmlFor="git-url">Git Repository URL</Label>
												<Input
													id="git-url"
													placeholder="https://github.com/username/repo.git"
													value={gitUrl}
													onChange={(e) => setGitUrl(e.target.value)}
												/>
											</div>
											<div className="flex items-center space-x-2">
												<input
													type="checkbox"
													id="git-auth"
													checked={needsAuth}
													onChange={(e) => setNeedsAuth(e.target.checked)}
													className="w-4 h-4"
												/>
												<Label htmlFor="git-auth" className="cursor-pointer">
													Requires authentication (private repository)
												</Label>
											</div>
											{needsAuth && (
												<Alert>
													<AlertDescription>
														You will be prompted to authenticate with GitHub to access private repositories
													</AlertDescription>
												</Alert>
											)}
										</TabsContent>

										<TabsContent value="npm" className="space-y-4 mt-4">
											<div className="space-y-2">
												<Label htmlFor="npm-package">NPM Package Reference</Label>
												<Input
													id="npm-package"
													placeholder="@org/package-name or package-name@version"
													value={npmPackage}
													onChange={(e) => setNpmPackage(e.target.value)}
												/>
											</div>
											<div className="flex items-center space-x-2">
												<input
													type="checkbox"
													id="npm-auth"
													checked={needsAuth}
													onChange={(e) => setNeedsAuth(e.target.checked)}
													className="w-4 h-4"
												/>
												<Label htmlFor="npm-auth" className="cursor-pointer">
													Requires NPM authentication (private package)
												</Label>
											</div>
											{needsAuth && (
												<Alert>
													<AlertDescription>
														You will need to provide your NPM access token for private packages
													</AlertDescription>
												</Alert>
											)}
										</TabsContent>

										<TabsContent value="tarball" className="space-y-4 mt-4">
											<div className="space-y-2">
												<Label htmlFor="tarball-url">Tarball URL</Label>
												<Input
													id="tarball-url"
													placeholder="https://example.com/app.tar.gz"
													value={tarballUrl}
													onChange={(e) => setTarballUrl(e.target.value)}
												/>
											</div>
											<div className="flex items-center space-x-2">
												<input
													type="checkbox"
													id="tarball-cert"
													checked={needsAuth}
													onChange={(e) => setNeedsAuth(e.target.checked)}
													className="w-4 h-4"
												/>
												<Label htmlFor="tarball-cert" className="cursor-pointer">
													Requires private certificate
												</Label>
											</div>
											{needsAuth && (
												<Alert>
													<AlertDescription>
														You will be prompted to upload your certificate file for secure access
													</AlertDescription>
												</Alert>
											)}
										</TabsContent>
									</Tabs>

									<Separator />
									<Button className="w-full" disabled={!appName.trim()}>
										<RocketIcon className="w-4 h-4 mr-2" />
										Import Application
									</Button>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="cli" className="space-y-4">
							<Card>
								<CardHeader>
									<CardTitle>Deploy with Harper CLI</CardTitle>
									<CardDescription>
										Follow these steps to deploy your application using the Harper CLI
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-6">
									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
												1
											</div>
											<h3>Install Harper CLI</h3>
										</div>
										<div className="ml-8">
											<div className="bg-muted rounded-lg p-4 flex items-center justify-between group">
												<code className="text-sm">npm install -g harperdb</code>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => void navigator.clipboard.writeText('npm install -g harperdb')}
												>
													<CopyIcon className="w-4 h-4" />
												</Button>
											</div>
										</div>
									</div>

									<Separator />

									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
												2
											</div>
											<h3>Login to Harper</h3>
										</div>
										<div className="ml-8">
											<div className="bg-muted rounded-lg p-4 flex items-center justify-between group">
												<code className="text-sm">harperdb login</code>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => void navigator.clipboard.writeText('harperdb login')}
												>
													<CopyIcon className="w-4 h-4" />
												</Button>
											</div>
											<p className="text-muted-foreground text-sm mt-2">
												You will be prompted to enter your credentials
											</p>
										</div>
									</div>

									<Separator />

									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
												3
											</div>
											<h3>Deploy Application</h3>
										</div>
										<div className="ml-8 space-y-3">
											<div className="bg-muted rounded-lg p-4 flex items-center justify-between group">
												<code className="text-sm">harperdb deploy --cluster=name</code>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => void navigator.clipboard.writeText('harperdb deploy --cluster=name')}
												>
													<CopyIcon className="w-4 h-4" />
												</Button>
											</div>
											<p className="text-muted-foreground text-sm">
												Replace <code className="bg-muted px-1 py-0.5 rounded text-xs">name</code> with your cluster
												name
											</p>
											<Alert>
												<TerminalIcon className="w-4 h-4" />
												<AlertDescription>
													Make sure you are in your application directory before running the deploy command
												</AlertDescription>
											</Alert>
										</div>
									</div>

									<Separator />

									{appName && (
										<div className="bg-accent rounded-lg p-4">
											<p className="text-sm">
												<strong>Application Name:</strong> {appName}
											</p>
											<p className="text-muted-foreground text-sm mt-2">
												Your application will be deployed with this name
											</p>
										</div>
									)}

									<Button className="w-full" variant="secondary" disabled={!appName.trim()}>
										<CheckIcon className="w-4 h-4 mr-2" />
										I have Completed These Steps
									</Button>
								</CardContent>
							</Card>
						</TabsContent>


					</Tabs>
				</form>
			</Form>
		</div>
	);
}
