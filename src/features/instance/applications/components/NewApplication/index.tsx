import { Card } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { Cluster, Instance, Organization } from '@/integrations/api/api.patch';
import { findBy } from '@/lib/arrays/findBy';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouteContext } from '@tanstack/react-router';
import { cx } from 'class-variance-authority';
import { BoxesIcon, GitBranchIcon, TerminalIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CLIInstructions } from './CLIInstructions';
import { CommonInstructions } from './CommonInstructions';
import { ImportInstructions } from './ImportInstructions';
import { defaultCLIOptions, defaultImportOptions, defaultTemplateOptions, NewApplicationSchema } from './schema';
import { TemplateInstructions } from './TemplateInstructions';
import { templates } from './templates';
import { useCheckCLI } from './useCheckCLI';
import { useCiDeployOutro } from './useCiDeployOutro';
import { useCreateFromTemplate } from './useCreateFromTemplate';
import { useImportApplication } from './useImportApplication';

export function NewApplication({ canCreateFromTemplate, canImport }: {
	canCreateFromTemplate: boolean;
	canImport: boolean;
}) {
	const { rootEntries } = useEditorView();
	const { organization, instance, cluster }: {
		organization?: Organization;
		instance?: Instance;
		cluster?: Cluster;
	} = useRouteContext({ strict: false });

	const defaultApplicationName = useMemo(() => {
		const defaultName = toKebabCase(cluster?.name || instance?.name || organization?.name || '');
		if (defaultName === '') {
			return defaultName;
		}
		let uniqueName = defaultName;
		let number = 1;
		while (findBy(rootEntries, 'name', uniqueName)) {
			number += 1;
			uniqueName = `${defaultName}-${number}`;
		}
		return uniqueName;
	}, [rootEntries, cluster, instance, organization]);

	const refineZod = useCallback((data: z.infer<typeof NewApplicationSchema>, ctx: z.RefinementCtx) => {
		if (!data.applicationName && !defaultApplicationName) {
			ctx.addIssue({
				code: 'custom',
				path: [`applicationName`],
				message: 'Please name your application!',
			});
		} else if (rootEntries.find(rootEntry => rootEntry.name === data.applicationName)) {
			ctx.addIssue({
				code: 'custom',
				path: [`applicationName`],
				message: 'That application name is already in use!',
			});
		}
	}, [defaultApplicationName, rootEntries]);

	const methods = useForm({
		resolver: zodResolver(NewApplicationSchema.superRefine(refineZod)),
		mode: 'onTouched',
		defaultValues: {
			applicationName: '',
			// The last option will be the default selection.
			contents: canCreateFromTemplate
				? { ...defaultImportOptions, ...defaultCLIOptions, ...defaultTemplateOptions }
				: { ...defaultTemplateOptions, ...defaultCLIOptions, ...defaultImportOptions },
		},
	});
	const { watch, handleSubmit, control, setValue, formState } = methods;

	const [isReloading, setIsReloading] = useState(false);

	const { isCreatingFromTemplate, createFromTemplate } = useCreateFromTemplate(setIsReloading);
	const { isImportingApplication, importApplication, importFailure } = useImportApplication(setIsReloading);
	const { checkCLI } = useCheckCLI(setIsReloading);

	const submitForm = useCallback((formData: z.infer<typeof NewApplicationSchema>) => {
		const project = formData.applicationName || defaultApplicationName;
		switch (formData.contents.type) {
			case 'template': {
				createFromTemplate({ contents: formData.contents, project });
				break;
			}
			case 'import': {
				importApplication({ contents: formData.contents, project });
				break;
			}
			case 'cli': {
				checkCLI({ contents: formData.contents, project });
				break;
			}
		}
	}, [checkCLI, createFromTemplate, defaultApplicationName, importApplication]);

	const contentsType = watch('contents.type');
	const setContentsType = useCallback((type: string) => {
		setValue('contents.type', type as 'template' | 'import' | 'cli', { shouldValidate: true });
	}, [setValue]);
	// Once the Templates tab sends someone to the CLI, its command follows whichever template is chosen there.
	const [templateForCLI, setTemplateForCLI] = useState(false);
	const cliTemplate = templateForCLI ? findBy(templates, 'id', watch('contents.id')) : undefined;
	const createWithCLI = useCallback(() => {
		setTemplateForCLI(true);
		setContentsType('cli');
	}, [setContentsType]);
	const { ciDeploy } = useCiDeployOutro();
	const project = watch('applicationName').trim() || defaultApplicationName;

	return (
		<div className="mx-auto max-w-4xl mt-6">
			<div className="text-center">
				<h1 className="text-4xl pt-4 pb-2">Bootstrap New API Application</h1>
				<p className="text-muted-foreground">
					{ciDeploy
						? 'Start from a template, import existing code, or create a project with the Harper CLI that deploys from GitHub'
						: 'Create a new application from templates, import existing code, or deploy with Harper CLI'}
				</p>
			</div>

			<Form {...methods}>
				<form
					id="instance-add-application-form"
					name="instance-add-application-form"
					onSubmit={handleSubmit(submitForm)}
					onKeyDown={revealFieldErrorOnEnter(methods)}
					className="flex flex-col gap-4 p-4"
				>
					<fieldset disabled={isImportingApplication || isCreatingFromTemplate || isReloading}>
						<Card className="dark:bg-black-dark">
							<CommonInstructions
								control={control}
								defaultApplicationName={defaultApplicationName}
							/>
						</Card>

						<Card className="dark:bg-black-dark mt-4 pt-0">
							<Tabs value={contentsType} onValueChange={setContentsType}>
								<TabsList
									className={cx('w-full grid mt-0', canCreateFromTemplate && canImport ? 'grid-cols-3' : 'grid-cols-2')}
								>
									{canCreateFromTemplate && (
										<TabsTrigger value="template">
											<BoxesIcon />
											<span className="hidden sm:inline-block">Templates</span>
										</TabsTrigger>
									)}
									{canImport && (
										<TabsTrigger value="import">
											<GitBranchIcon />
											Import
										</TabsTrigger>
									)}
									<TabsTrigger value="cli">
										<TerminalIcon />
										<span className="hidden md:inline-block">Harper</span> CLI
									</TabsTrigger>
								</TabsList>

								<div className="mx-6 mt-1">
									<Separator className="bg-border" />
								</div>

								<TabsContent value="template" className="space-y-4">
									<TemplateInstructions
										control={control}
										formState={formState}
										isCreatingFromTemplate={isCreatingFromTemplate}
										onCreateWithCLI={createWithCLI}
									/>
								</TabsContent>

								<TabsContent value="import" className="space-y-4">
									<ImportInstructions
										control={control}
										formState={formState}
										importFailure={importFailure}
										isImportingApplication={isImportingApplication}
										project={project}
										setValue={setValue}
										watch={watch}
									/>
								</TabsContent>

								<TabsContent value="cli" className="space-y-4">
									<CLIInstructions
										defaultApplicationName={defaultApplicationName}
										formState={formState}
										template={cliTemplate}
										watch={watch}
									/>
								</TabsContent>
							</Tabs>
						</Card>
					</fieldset>
				</form>
			</Form>
		</div>
	);
}
