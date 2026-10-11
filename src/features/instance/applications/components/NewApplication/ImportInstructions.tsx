import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeployFailure } from '@/features/instance/applications/components/DeployProgress/DeployFailure';
import { useStagedDeploymentsAvailable } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { GitMergeIcon, LinkIcon, PackageIcon, RocketIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Control, FormState, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { z } from 'zod';
import { ImportAuthorization } from './ImportAuthorization';
import { NewApplicationSchema } from './schema';
import { ImportFailure } from './useImportApplication';

export function ImportInstructions({
	control,
	formState,
	importFailure,
	isImportingApplication,
	setValue,
	watch,
}: {
	control: Control<z.infer<typeof NewApplicationSchema>>;
	formState: FormState<z.infer<typeof NewApplicationSchema>>;
	importFailure?: ImportFailure;
	isImportingApplication: boolean;
	setValue: UseFormSetValue<z.infer<typeof NewApplicationSchema>>;
	watch: UseFormWatch<z.infer<typeof NewApplicationSchema>>;
}) {
	const importSource = watch('contents.source');
	const canStage = useStagedDeploymentsAvailable();
	const setImportSource = useCallback((source: string) => {
		setValue('contents.source', source as 'git' | 'npm' | 'tarball');
	}, [setValue]);

	return (
		<>
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
							<GitMergeIcon className="w-4 h-4 mr-2" />
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
												type="text"
												autoCapitalize="none"
												autoComplete="off"
												autoFocus={true}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
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
								)}
							/>
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
								)}
							/>
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
					)}
				/>

				{importSource === 'git' && <ImportAuthorization control={control} setValue={setValue} watch={watch} />}

				{canStage && (
					<FormField
						control={control}
						name="contents.stageOnly"
						render={({ field }) => (
							<FormItem className="flex flex-row items-start gap-3">
								<FormControl>
									<Switch checked={!!field.value} onCheckedChange={field.onChange} />
								</FormControl>
								<div className="flex flex-col gap-1">
									<FormLabel>Stage only</FormLabel>
									<FormDescription>
										Install it on every node without making it live. Activate it later from Deployments.
									</FormDescription>
								</div>
							</FormItem>
						)}
					/>
				)}

				<Separator className="bg-border" />

				{importFailure && (
					<DeployFailure
						title={importFailure.title}
						message={importFailure.message}
						deploymentId={importFailure.deploymentId}
					/>
				)}

				<Button
					className="w-full"
					disabled={!formState.isValid || isImportingApplication}
				>
					<RocketIcon className="w-4 h-4 mr-2" />
					{canStage && watch('contents.stageOnly') ? 'Stage Application' : 'Import Application'}
				</Button>
			</CardContent>
		</>
	);
}
