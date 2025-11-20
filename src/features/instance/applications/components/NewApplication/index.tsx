import { Card } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { Cluster, Instance, Organization } from '@/integrations/api/api.patch';
import { findBy } from '@/lib/arrays/findBy';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouteContext } from '@tanstack/react-router';
import { BoxesIcon, GitBranchIcon, TerminalIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CLIInstructions } from './CLIInstructions';
import { CommonInstructions } from './CommonInstructions';
import { ImportInstructions } from './ImportInstructions';
import { defaultCLIOptions, defaultImportOptions, defaultTemplateOptions, NewApplicationSchema } from './schema';
import { TemplateInstructions } from './TemplateInstructions';
import { useCheckCLI } from './useCheckCLI';
import { useCreateFromTemplate } from './useCreateFromTemplate';
import { useImportApplication } from './useImportApplication';

export function NewApplication() {
	const { rootEntries } = useEditorView();
	const { organization, instance, cluster }: {
		organization?: Organization;
		instance?: Instance;
		cluster?: Cluster
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
		}
	}, [defaultApplicationName]);

	const methods = useForm({
		resolver: zodResolver(NewApplicationSchema.superRefine(refineZod)),
		defaultValues: {
			applicationName: '',
			contents: {
				...defaultImportOptions,
				...defaultCLIOptions,
				// The last option will be the default selection.
				...defaultTemplateOptions,
			},
		},
	});
	const { watch, handleSubmit, control, setValue, formState, trigger } = methods;

	const [isReloading, setIsReloading] = useState(false);

	const { isCreatingFromTemplate, createFromTemplate } = useCreateFromTemplate(setIsReloading);
	const { isImportingApplication, importApplication } = useImportApplication(setIsReloading);
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
		const wasValid = formState.isValid;
		setValue('contents.type', type as 'template' | 'import' | 'cli');
		if (!wasValid) {
			void trigger();
		}
	}, [setValue, formState, trigger]);

	return (
		<div className="mx-auto max-w-4xl mt-6">
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
							<CommonInstructions
								control={control}
								defaultApplicationName={defaultApplicationName}
							/>
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
									<TemplateInstructions
										control={control}
										formState={formState}
										isCreatingFromTemplate={isCreatingFromTemplate}
									/>
								</TabsContent>

								<TabsContent value="import" className="space-y-4">
									<ImportInstructions
										control={control}
										formState={formState}
										isImportingApplication={isImportingApplication}
										setValue={setValue}
										watch={watch}
									/>
								</TabsContent>

								<TabsContent value="cli" className="space-y-4">
									<CLIInstructions
										defaultApplicationName={defaultApplicationName}
										formState={formState}
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
