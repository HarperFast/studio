import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitMergeIcon, LinkIcon, PackageIcon, RocketIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Control, FormState, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { z } from 'zod';
import { ImportAuthorization } from './ImportAuthorization';
import { NewApplicationSchema } from './schema';

export function ImportInstructions({
	control,
	formState,
	isImportingApplication,
	setValue,
	watch,
}: {
	control: Control<z.infer<typeof NewApplicationSchema>>;
	formState: FormState<z.infer<typeof NewApplicationSchema>>;
	isImportingApplication: boolean;
	setValue: UseFormSetValue<z.infer<typeof NewApplicationSchema>>;
	watch: UseFormWatch<z.infer<typeof NewApplicationSchema>>;
}) {
	const importSource = watch('contents.source');
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

				<Separator className="bg-border" />

				<Button
					className="w-full"
					disabled={!formState.isValid || isImportingApplication}
				>
					<RocketIcon className="w-4 h-4 mr-2" />
					Import Application
				</Button>
			</CardContent>
		</>
	);
}
