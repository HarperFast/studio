import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { parseJsonRecords } from '@/features/instance/databases/functions/parseJsonRecords';
import { sampleDatasets } from '@/features/instance/databases/sampleDatasets';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { databaseNameSchema } from '@/integrations/api/instance/database/databaseNameSchema';
import { ImportSource, useImportDataMutation } from '@/integrations/api/instance/database/importData';
import { tableNameSchema } from '@/integrations/api/instance/database/tableNameSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { CloudUploadIcon, FileUpIcon, GlobeIcon, InfoIcon, LoaderCircleIcon, PackageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const ImportDataFormSchema = z
	.object({
		method: z.enum(['sample', 'file', 'url']),
		database: databaseNameSchema,
		table: tableNameSchema,
		datasetId: z.string(),
		fileData: z.string(),
		fileName: z.string(),
		url: z.string(),
	})
	.superRefine((values, ctx) => {
		if (values.method === 'sample' && !values.datasetId) {
			ctx.addIssue({ code: 'custom', path: ['datasetId'], message: 'Please choose a sample dataset.' });
		}
		if (values.method === 'file' && !values.fileData) {
			ctx.addIssue({ code: 'custom', path: ['fileData'], message: 'Please choose a CSV or JSON file.' });
		}
		if (values.method === 'url') {
			let valid = false;
			try {
				valid = /^https?:$/.test(new URL(values.url).protocol);
			} catch {
				// fall through with valid=false
			}
			if (!valid) {
				ctx.addIssue({ code: 'custom', path: ['url'], message: 'Please enter a valid http(s) URL to a CSV file.' });
			}
		}
	});

type ImportDataFormValues = z.infer<typeof ImportDataFormSchema>;

const importMethods = [
	{
		value: 'sample',
		title: 'Sample Datasets',
		description: 'Choose from pre-loaded sample datasets to get started quickly',
		Icon: PackageIcon,
	},
	{
		value: 'file',
		title: 'Import from File',
		description: 'Upload a CSV or JSON file',
		Icon: FileUpIcon,
	},
	{
		value: 'url',
		title: 'Load from URL',
		description: 'Import a CSV file from a URL the instance can reach',
		Icon: GlobeIcon,
	},
] as const;

export function ImportDataModal({
	isModalOpen,
	setIsModalOpen,
	instanceDatabaseMap,
	databaseName,
	tableName,
	onImported,
}: {
	readonly isModalOpen: boolean;
	readonly setIsModalOpen: (open: boolean) => void;
	readonly instanceDatabaseMap?: InstanceDatabaseMap;
	readonly databaseName?: string;
	readonly tableName?: string;
	readonly onImported: (databaseName: string, tableName: string) => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const { mutate: importData, isPending } = useImportDataMutation();
	const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

	const form = useForm({
		resolver: zodResolver(ImportDataFormSchema),
		defaultValues: {
			// With a table already in context (table toolbar) the likely intent is loading
			// your own data; without one (sidebar, empty database) lead with samples.
			method: tableName ? ('file' as const) : ('sample' as const),
			database: databaseName || '',
			table: tableName || '',
			datasetId: '',
			fileData: '',
			fileName: '',
			url: '',
		},
	});

	// The modal stays mounted while the user navigates between tables, so re-seed the
	// form from the current context each time it opens.
	const { reset } = form;
	useEffect(() => {
		if (isModalOpen) {
			reset({
				method: tableName ? 'file' : 'sample',
				database: databaseName || '',
				table: tableName || '',
				datasetId: '',
				fileData: '',
				fileName: '',
				url: '',
			});
			setSelectedFileName(null);
		}
	}, [isModalOpen, databaseName, tableName, reset]);

	const method = form.watch('method');
	const datasetId = form.watch('datasetId');
	const watchedDatabase = form.watch('database');
	const watchedTable = form.watch('table');
	const selectedDataset = sampleDatasets.find((dataset) => dataset.id === datasetId);

	const tableExists = !!instanceDatabaseMap?.[watchedDatabase || 'data']?.[watchedTable];
	const tableWillBeCreated = !!instanceDatabaseMap && !!watchedTable && !tableExists;

	const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result;
			if (typeof text === 'string') {
				setSelectedFileName(file.name);
				form.setValue('fileData', text, { shouldValidate: true });
				form.setValue('fileName', file.name);
			}
		};
		reader.readAsText(file);
	};

	const onDatasetChange = (newDatasetId: string) => {
		form.setValue('datasetId', newDatasetId, { shouldValidate: true });
		const dataset = sampleDatasets.find((d) => d.id === newDatasetId);
		if (dataset) {
			form.setValue('table', dataset.table, { shouldValidate: true });
		}
	};

	const closeModal = () => {
		setIsModalOpen(false);
	};

	const submitForm = (values: ImportDataFormValues) => {
		const database = values.database || 'data';
		const table = values.table;

		let source: ImportSource;
		if (values.method === 'sample') {
			const dataset = sampleDatasets.find((d) => d.id === values.datasetId);
			if (!dataset) {
				return;
			}
			source = { kind: 'csv-data', data: dataset.csv };
		} else if (values.method === 'file') {
			if (values.fileName.toLowerCase().endsWith('.json')) {
				try {
					source = { kind: 'json-records', records: parseJsonRecords(values.fileData) };
				} catch (err) {
					form.setError('fileData', { message: (err as Error).message });
					return;
				}
			} else {
				source = { kind: 'csv-data', data: values.fileData };
			}
		} else {
			source = { kind: 'csv-url', url: values.url };
		}

		importData(
			{
				database,
				table,
				tableExists,
				replicated: instanceParams.entityType === 'cluster',
				source,
				...instanceParams,
			},
			{
				onSuccess: ({ message }) => {
					toast.success(message);
					closeModal();
					onImported(database, table);
				},
			},
		);
	};

	return (
		<Dialog
			open={isModalOpen}
			onOpenChange={(open) => {
				if (!open && !isPending) {
					closeModal();
				}
			}}
		>
			<DialogContent className="sm:max-w-[550px]">
				<DialogHeader>
					<DialogTitle>Import Data</DialogTitle>
					<DialogDescription>Choose how you want to import data into your database.</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="instance-import-data-form"
						name="instance-import-data-form"
						onSubmit={form.handleSubmit(submitForm)}
						className="grid gap-4"
					>
						<FormField
							control={form.control}
							name="method"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Select Import Method</FormLabel>
									<FormControl>
										<RadioGroup value={field.value} onValueChange={field.onChange} className="gap-3">
											{importMethods.map(({ value, title, description, Icon }) => (
												<FormLabel
													key={value}
													htmlFor={`import-method-${value}`}
													className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer font-normal hover:bg-accent/50 has-[[data-state=checked]]:border-primary"
												>
													<RadioGroupItem value={value} id={`import-method-${value}`} className="mt-1" />
													<div className="grid gap-1">
														<span className="flex items-center gap-2 font-medium">
															<Icon className="size-4" />
															{title}
														</span>
														<span className="text-sm text-muted-foreground">{description}</span>
													</div>
												</FormLabel>
											))}
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Separator />

						{method === 'sample' && (
							<FormField
								control={form.control}
								name="datasetId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Choose a Sample Dataset</FormLabel>
										<FormControl>
											<Select name={field.name} value={field.value} onValueChange={onDatasetChange}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a dataset..." />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{sampleDatasets.map((dataset) => (
															<SelectItem key={dataset.id} value={dataset.id}>
																{dataset.name}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
										{selectedDataset && <p className="text-sm text-muted-foreground">{selectedDataset.description}</p>}
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{method === 'file' && (
							<FormField
								control={form.control}
								name="fileData"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel
											htmlFor="import-data-file"
											className="flex flex-col items-center justify-center w-full h-40 border-2 border-border border-dashed rounded-lg cursor-pointer bg-muted dark:bg-grey-700 hover:bg-muted/80 dark:hover:bg-grey-700/80"
										>
											<FormControl>
												<div>
													<div className="flex flex-col items-center justify-center pt-5 pb-6">
														<CloudUploadIcon className="text-muted-foreground" size={40} />
														<p className="mt-2 text-sm text-muted-foreground">
															{selectedFileName ?? (
																<>
																	<span className="font-semibold">Click to upload</span>{' '}
																	or drag and drop a CSV or JSON file
																</>
															)}
														</p>
													</div>
													<Input
														id="import-data-file"
														type="file"
														className="opacity-0 w-full h-full absolute left-0 top-0 cursor-pointer"
														accept=".csv,.json,text/csv,application/json"
														name={field.name}
														ref={field.ref}
														onBlur={field.onBlur}
														disabled={field.disabled}
														onChange={onFileChange}
													/>
												</div>
											</FormControl>
										</FormLabel>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{method === 'url' && (
							<FormField
								control={form.control}
								name="url"
								render={({ field }) => (
									<FormItem>
										<FormLabel>CSV URL</FormLabel>
										<FormControl>
											<Input
												{...field}
												type="text"
												inputMode="url"
												placeholder="https://example.com/data.csv"
												autoCapitalize="off"
												autoComplete="off"
												autoCorrect="off"
											/>
										</FormControl>
										<p className="text-sm text-muted-foreground">
											The URL is fetched by the Harper instance, so it must be reachable from there.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="database"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Database</FormLabel>
										<FormControl>
											<Input
												{...field}
												type="text"
												placeholder="data"
												autoCapitalize="off"
												autoComplete="off"
												autoCorrect="off"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="table"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Table</FormLabel>
										<FormControl>
											<Input
												{...field}
												type="text"
												autoCapitalize="off"
												autoComplete="off"
												autoCorrect="off"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{tableWillBeCreated && (
							<Alert>
								<InfoIcon />
								<AlertTitle>New table</AlertTitle>
								<AlertDescription>
									The table &quot;{watchedTable}&quot; doesn&apos;t exist yet — it will be created with primary key
									&quot;id&quot; before the data is imported.
								</AlertDescription>
							</Alert>
						)}

						<DialogFooter>
							<Button type="button" variant="ghost" className="rounded-full" onClick={closeModal} disabled={isPending}>
								Cancel
							</Button>
							<Button type="submit" variant="submit" className="rounded-full" disabled={isPending}>
								{isPending ? <LoaderCircleIcon className="animate-spin" /> : <CloudUploadIcon />}
								{isPending ? 'Importing...' : 'Import Data'}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
