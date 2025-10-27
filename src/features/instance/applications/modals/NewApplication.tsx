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
import { useAddComponentMutation } from '@/features/instance/operations/mutations/addComponent';
import { useDeployComponentMutation } from '@/features/instance/operations/mutations/deployComponent';
import { Cluster, Instance, Organization } from '@/lib/api.patch';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouteContext } from '@tanstack/react-router';
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
import { CLISchema, ImportSchema, NewApplicationSchema, TemplateSchema } from './NewApplicationSchema';
import { templates } from './templates';
import { useCLISteps } from './useCLISteps';

export function NewApplication() {
	const { reloadRootEntries, rootEntries, setFocusedItem, setExpandedItems, setSelectedItems } = useEditorView();
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
			uniqueName = `${defaultName}-${number}`;
		}
		return uniqueName;
	}, [rootEntries, cluster, instance, organization]);

	const instanceParams = useInstanceClientParams();
	const methods = useForm({
		resolver: zodResolver(NewApplicationSchema),
		defaultValues: {
			applicationName: '',
			contents: {
				// Default to template
				...{
					type: 'template',
					id: templates[0].id,
				} satisfies z.infer<typeof TemplateSchema>,
				// But fill in defaults for the other choices too.
				...{
					source: 'git',
					ref: '',
					requiresAuth: false,
					installCommand: '',
				} satisfies Omit<z.infer<typeof ImportSchema>, 'type'>,
				...{
					completed: false,
				} satisfies Omit<z.infer<typeof CLISchema>, 'type'>,
			},
		},
	});
	const { watch, handleSubmit, control, setValue, formState, trigger } = methods;

	const [isReloading, setIsReloading] = useState(false);

	const applicationName = watch('applicationName') || defaultApplicationName;
	const cliSteps = useCLISteps(applicationName, instanceParams.instanceClient.defaults.baseURL);

	const { mutate: createFromTemplate, isPending: isCreatingFromTemplate } = useAddComponentMutation();
	const { mutate: importApplication, isPending: isImportingApplication } = useDeployComponentMutation();

	const submitForm = useCallback((formData: z.infer<typeof NewApplicationSchema>) => {
		const project = formData.applicationName || defaultApplicationName;
		switch (formData.contents.type) {
			case 'template': {
				const toastId = toast.loading(`Creating from template...`, {
					description: 'This may take a bit.',
					duration: 300_000,
				});
				createFromTemplate({
					project,
					template: 'https://github.com/HarperFast/application-template/tree/fabric',
					...instanceParams,
				}, {
					onSuccess: () => {
						toast.success(`Created successfully!`, {
							description: `${project} is now available!`,
							id: toastId,
							duration: 5_000,
						});
						setIsReloading(true);
						reloadRootEntries();
						setFocusedItem(project);
						setSelectedItems([project]);
						setExpandedItems([project]);
					},
				});
				break;
			}
			case 'import': {
				const toastId = toast.loading(`Importing application...`, {
					description: 'This may take a bit.',
					duration: 300_000,
				});
				importApplication({
					applicationName: project,
					applicationUrl: formData.contents.ref,
					installCommand: formData.contents.installCommand,
					...instanceParams,
				}, {
					onSuccess: () => {
						toast.success(`Imported successfully`, {
							description: `${project} is now available!`,
							id: toastId,
							duration: 5_000,
						});
						setIsReloading(true);
						reloadRootEntries();
						setFocusedItem(project);
						setSelectedItems([project]);
						setExpandedItems([project]);
					},
					onError: () => {
						toast.dismiss(toastId);
					},
				});
				break;
			}
			case 'cli':
				// TODO: Focus
				// TODO: Do I need to do reload? Or will we be looking for it automatically anyway?
				reloadRootEntries();
				break;
		}
	}, [createFromTemplate, instanceParams, reloadRootEntries]);

	const contentsType = watch('contents.type');
	const cliCompleted = watch('contents.completed');
	const setContentsType = useCallback((type: string) => {
		const wasValid = formState.isValid;
		setValue('contents.type', type as 'template' | 'import' | 'cli');
		if (!wasValid) {
			void trigger();
		}
	}, [setValue, formState, trigger]);

	const importSource = watch('contents.source');
	const setImportSource = useCallback((source: string) => {
		setValue('contents.source', source as 'git' | 'npm' | 'tarball');
	}, [setValue]);

	// TODO: Break this out a bit more, please.
	return (
		<div className="mx-auto max-w-4xl">
			<div className="text-center">
				<h1 className="text-4xl pt-4 pb-2">Bootstrap New API Application</h1>
				<p className="text-muted-foreground">
					Create a new application from templates, import existing code, or deploy with Harper CLI
				</p>
			</div>

			<Form {...methods}>
				<form onSubmit={handleSubmit(submitForm)} className="flex flex-col gap-4 p-4">
					<fieldset disabled={isImportingApplication || isCreatingFromTemplate || isReloading}>

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
										control={control}
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

						<Card className="bg-black-dark mt-4 pt-0">
							<Tabs defaultValue={contentsType} onValueChange={setContentsType}>
								<TabsList className="w-full grid grid-cols-3 mt-0">
									<TabsTrigger value="template">
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

								<Separator className="bg-black mx-6 mt-1" />

								<TabsContent value="template" className="space-y-4">
									<CardHeader>
										<CardTitle>Choose a Template</CardTitle>
										<CardDescription>
											Start with a pre-configured template for common use cases
										</CardDescription>
									</CardHeader>
									<CardContent>
										<FormField
											control={control}
											name="contents.id"
											render={({ field }) => (
												<RadioGroup value={field.value} onValueChange={field.onChange}>
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
											)} />


										<Separator className="my-6 bg-black" />
										<Button
											className="w-full"
											disabled={!formState.isValid || isCreatingFromTemplate}
										>
											<RocketIcon className="w-4 h-4 mr-2" />
											Create from Template
										</Button>
									</CardContent>
								</TabsContent>

								<TabsContent value="import" className="space-y-4">
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
													<FormField
														control={control}
														name="contents.ref"
														render={({ field }) => (
															<FormItem>
																<FormLabel className="pb-1">Git Repository URL</FormLabel>
																<FormControl>
																	<Input
																		type="url"
																		autoCapitalize="none"
																		autoComplete="off"
																		autoFocus={true}
																		{...field}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)} />
												</div>
											</TabsContent>

											<TabsContent value="npm" className="space-y-4 mt-4">
												<div className="space-y-2">
													<FormField
														control={control}
														name="contents.ref"
														render={({ field }) => (
															<FormItem>
																<FormLabel className="pb-1">NPM Package Reference</FormLabel>
																<FormControl>
																	<Input
																		type="text"
																		autoCapitalize="none"
																		autoComplete="off"
																		autoFocus={true}
																		{...field}
																	/>
																</FormControl>
																{/*placeholder="@org/package-name or package-name@version"*/}
																<FormMessage />
															</FormItem>
														)} />
												</div>
											</TabsContent>

											<TabsContent value="tarball" className="space-y-4 mt-4">
												<div className="space-y-2">
													<FormField
														control={control}
														name="contents.ref"
														render={({ field }) => (
															<FormItem>
																<FormLabel className="pb-1">Tarball URL</FormLabel>
																<FormControl>
																	<Input
																		type="url"
																		autoCapitalize="none"
																		autoComplete="off"
																		autoFocus={true}
																		{...field}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)} />
												</div>
											</TabsContent>
										</Tabs>

										<FormField
											control={control}
											name="contents.installCommand"
											render={({ field }) => (
												<FormItem>
													<FormLabel className="pb-1">Install Command</FormLabel>
													<FormControl>
														<Input
															type="text"
															autoCapitalize="none"
															autoComplete="off"
															placeholder="npm install"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)} />

										<FormLabel>Authorization</FormLabel>
										<FormField
											control={control}
											name="contents.requiresAuth"
											render={({ field }) => (
												<Tabs className="w-full pt-2 pb-0 mb-0" value={String(field.value)} onValueChange={value => field.onChange(value === 'true')}>
													<TabsList className="grid w-full grid-cols-2">
														<TabsTrigger value="false">
															Public Access
														</TabsTrigger>
														<TabsTrigger value="true">
															Requires Auth
														</TabsTrigger>
													</TabsList>

													<TabsContent value="false" className="space-y-4 mt-4">
													</TabsContent>

													<TabsContent value="true" className="space-y-4 mt-4">
														<Alert>
															<AlertDescription>
																<span>
																	Certificate management isn't supported by this website yet, but you
																	can <Link className="inline-block underline hover:text-white" to="https://docs.harperdb.io/docs/developers/security/certificate-management" target="_blank">use
																	your operations API</Link> to add them in the meantime.
																</span>
															</AlertDescription>
														</Alert>
													</TabsContent>
												</Tabs>
											)} />

										<Separator className="bg-black" />

										<Button
											className="w-full"
											disabled={!formState.isValid || isImportingApplication}
										>
											<RocketIcon className="w-4 h-4 mr-2" />
											Import Application
										</Button>
									</CardContent>
								</TabsContent>

								<TabsContent value="cli" className="space-y-4">
									<CardHeader>
										<CardTitle>Deploy with Harper CLI</CardTitle>
										<CardDescription>
											Follow these steps to deploy your application using the Harper CLI
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-6">

										{cliSteps.map((cliStep, index) => (
											<div key={cliStep.title} className="space-y-3">
												<div className="flex items-center gap-2">
													<div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
														{index + 1}
													</div>
													<h3>{cliStep.title}</h3>
												</div>
												<div className="ml-8">
													<div className="bg-black rounded-lg p-4 flex items-center justify-between group">
														<code className="text-sm whitespace-pre truncate">{cliStep.code}</code>
														<Button
															variant="default"
															size="sm"
															onClick={() => void navigator.clipboard.writeText(cliStep.code)}
														>
															<CopyIcon className="w-4 h-4" />
														</Button>
													</div>
													{cliStep.note && <p className="text-muted-foreground text-sm mt-2">{cliStep.note}</p>}

													{cliStep.alert && (<Alert className="mt-2">
														<TerminalIcon className="w-4 h-4" />
														<AlertDescription>{cliStep.alert}</AlertDescription>
													</Alert>)}
												</div>

												<Separator className="bg-black" />
											</div>
										))}


										{applicationName && (
											<div className="bg-accent rounded-lg p-4">
												<p className="text-sm">
													<strong>Application Name:</strong> {applicationName}
												</p>
												<p className="text-muted-foreground text-sm mt-2">
													Your application will be deployed with this name
												</p>
											</div>
										)}

										<Button
											className="w-full"
											variant="secondary"
											disabled={!formState.isValid || !cliCompleted}
										>
											<CheckIcon className="w-4 h-4 mr-2" />
											I Have Completed These Steps
										</Button>
									</CardContent>
								</TabsContent>

							</Tabs>
						</Card>

					</fieldset>
				</form>
			</Form>
		</div>
	);
}
