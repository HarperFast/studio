import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { getComponentFileQueryOptions } from '@/integrations/api/instance/applications/getComponentFile';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { SaveIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ControllerRenderProps, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { isHandlerModule, readModuleExports } from './handlerExports';
import {
	AppJobsConfig,
	buildHandler,
	handlerExportName,
	handlerModulePath,
	JobDraft,
	ScheduledJobConfig,
} from './jobsConfig';
import { CRON_SHORTCUTS, cronProblem, intervalProblem, knownTimezones, timezoneProblem } from './schedule';
import { SchedulerApp } from './schedulerApps';

/** Radix's Select can't hold an empty value, and "no timezone" is the most common choice. */
const SERVER_TIMEZONE = '__server__';
const OTHER = '__other__';

export interface JobDialogTarget {
	app: SchedulerApp;
	job?: ScheduledJobConfig;
	/**
	 * The file and its jobs as the page showed them when the dialog opened. The save is checked against this text, so a
	 * refetch while the dialog is open can't pair `job.index` with a different file.
	 */
	baseText: string | undefined;
	config: AppJobsConfig | undefined;
}

function jobFormSchema(
	config: AppJobsConfig | undefined,
	editing: ScheduledJobConfig | undefined,
	files: ReadonlySet<string>,
) {
	const otherNames = new Set(
		(config?.jobs ?? []).filter((job) => job.index !== editing?.index).map((job) => job.name),
	);
	return z.object({
		name: z.string().trim().min(1, 'Every job needs a name.').refine(
			(name) => !otherNames.has(name),
			'Another job in this app already has this name.',
		),
		kind: z.enum(['cron', 'interval']),
		cron: z.string(),
		timezone: z.string(),
		interval: z.string(),
		file: z.string().min(1, 'Choose the file that exports the handler.').refine(
			(file) => files.has(file),
			'This app has no such file.',
		),
		exportName: z.string().trim().min(1, 'Name the export to call, or choose the default export.'),
	}).superRefine((values, context) => {
		if (values.kind === 'cron') {
			const problem = values.cron.trim() ? cronProblem(values.cron.trim()) : 'Enter a cron expression.';
			if (problem) {
				context.addIssue({ code: 'custom', path: ['cron'], message: problem });
			}
			const zoneProblem = values.timezone === SERVER_TIMEZONE
				? undefined
				: values.timezone.trim()
				? timezoneProblem(values.timezone.trim())
				: 'Enter an IANA timezone, like America/New_York.';
			if (zoneProblem) {
				context.addIssue({ code: 'custom', path: ['timezone'], message: zoneProblem });
			}
		} else {
			const problem = values.interval.trim()
				? intervalProblem(asInterval(values.interval))
				: 'Enter how often to run it, like 15m.';
			if (problem) {
				context.addIssue({ code: 'custom', path: ['interval'], message: problem });
			}
		}
	});
}

type JobFormValues = z.infer<ReturnType<typeof jobFormSchema>>;

/** A bare number of seconds is written as a number, which is how the docs write one. */
function asInterval(value: string): string | number {
	const trimmed = value.trim();
	return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function initialValues(job: ScheduledJobConfig | undefined, files: ReadonlySet<string>): JobFormValues {
	const modulePath = job?.handler ? handlerModulePath(job.handler) : undefined;
	const firstModule = [...files].find(isHandlerModule);
	return {
		name: job?.name ?? '',
		kind: job?.interval !== undefined ? 'interval' : 'cron',
		cron: job?.cron ?? '',
		timezone: job?.timezone ?? SERVER_TIMEZONE,
		interval: job?.interval !== undefined ? String(job.interval) : '',
		file: modulePath ?? (job ? '' : firstModule ?? ''),
		exportName: job?.handler ? handlerExportName(job.handler) : '',
	};
}

function toDraft(values: JobFormValues): JobDraft {
	return {
		name: values.name.trim(),
		schedule: values.kind === 'cron'
			? {
				cron: values.cron.trim(),
				timezone: values.timezone === SERVER_TIMEZONE ? undefined : values.timezone.trim(),
			}
			: { interval: asInterval(values.interval) },
		handler: buildHandler(values.file, values.exportName.trim()),
	};
}

function PickOrType({
	field,
	options,
	label,
	placeholder,
	otherLabel,
	optionLabel,
	pending = false,
}: {
	field: ControllerRenderProps<JobFormValues, 'exportName' | 'timezone'>;
	options: readonly string[];
	label: string;
	placeholder: string;
	otherLabel: string;
	optionLabel?: (option: string) => string;
	pending?: boolean;
}) {
	const [chosenOther, setChosenOther] = useState(false);
	const listed = pending || options.length > 0;
	const offList = !pending && field.value !== '' && !options.includes(field.value);
	// Once the field is free text it stays so: clearing it, or typing a listed name, mustn't swap the input away.
	useEffect(() => {
		if (offList) {
			setChosenOther(true);
		}
	}, [offList]);
	const typing = !listed || chosenOther || offList;
	const trigger = (
		<SelectTrigger className="w-full" aria-label={label}>
			<SelectValue placeholder={pending ? 'Reading the file…' : `Choose ${label.toLowerCase()}`} />
		</SelectTrigger>
	);
	return (
		<>
			{listed && (
				<Select
					value={typing ? OTHER : field.value}
					disabled={pending}
					onValueChange={(next) => {
						setChosenOther(next === OTHER);
						field.onChange(next === OTHER ? '' : next);
					}}
				>
					{typing ? trigger : <FormControl>{trigger}</FormControl>}
					<SelectContent>
						{options.map((option) => (
							<SelectItem key={option} value={option}>{optionLabel?.(option) ?? option}</SelectItem>
						))}
						<SelectItem value={OTHER}>{otherLabel}</SelectItem>
					</SelectContent>
				</Select>
			)}
			{typing && (
				<FormControl>
					<Input autoComplete="off" spellCheck={false} placeholder={placeholder} aria-label={label} {...field} />
				</FormControl>
			)}
		</>
	);
}

export function JobDialog({
	target,
	instanceParams,
	isSaving,
	saveError,
	onSave,
	onClose,
}: {
	target: JobDialogTarget;
	instanceParams: InstanceClientIdConfig;
	isSaving: boolean;
	saveError: unknown;
	onSave: (draft: JobDraft) => void;
	onClose: () => void;
}) {
	const { app, job, config } = target;
	const resolver = useMemo(() => zodResolver(jobFormSchema(config, job, app.files)), [app.files, config, job]);
	const form = useForm<JobFormValues>({ resolver, mode: 'onTouched', defaultValues: initialValues(job, app.files) });
	const { isDirty, isValid } = form.formState;
	const kind = useWatch({ control: form.control, name: 'kind' });
	const file = useWatch({ control: form.control, name: 'file' });
	const exportName = useWatch({ control: form.control, name: 'exportName' });

	const modules = useMemo(() => [...app.files].filter(isHandlerModule).sort(), [app.files]);
	const fileOptions = file && !modules.includes(file) ? [file, ...modules] : modules;
	const timezones = useMemo(() => {
		const known = knownTimezones();
		return [SERVER_TIMEZONE, ...(known.includes('UTC') ? [] : ['UTC']), ...known];
	}, []);

	const { data: moduleText, isLoading: moduleLoading, isError: moduleUnreadable } = useQuery(
		getComponentFileQueryOptions({
			...instanceParams,
			project: app.name,
			file: app.files.has(file) ? file : undefined,
			encoding: 'utf8',
		}),
	);
	const moduleSource = moduleText?.message;
	const moduleExports = useMemo(
		() => (moduleSource === undefined ? undefined : readModuleExports(moduleSource)),
		[moduleSource],
	);
	const exportMissing = !!moduleExports && moduleExports.names.length > 0 && !moduleExports.incomplete
		&& exportName !== '' && !moduleExports.names.includes(exportName);

	return (
		<Dialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<Form {...form}>
					<form
						id="scheduled-job-form"
						onSubmit={form.handleSubmit((values) => onSave(toDraft(values)))}
						onKeyDown={revealFieldErrorOnEnter(form)}
						className="grid gap-4"
					>
						<DialogHeader>
							<DialogTitle>{job ? `Change ${job.name ?? 'job'}` : 'Add a job'}</DialogTitle>
							<DialogDescription>
								{app.configFile
									? `Saved to ${app.name}/${app.configFile}. Harper runs it after the app restarts.`
									: `Saved to a new ${app.name}/config.yaml, which keeps Harper's defaults for the app. Harper runs it after the app restarts.`}
							</DialogDescription>
						</DialogHeader>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input autoComplete="off" autoCapitalize="off" spellCheck={false} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="kind"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Schedule</FormLabel>
									<FormControl>
										<RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
											<div className="flex items-center gap-2">
												<RadioGroupItem id="job-kind-cron" value="cron" />
												<Label htmlFor="job-kind-cron" className="font-normal">At set times (cron)</Label>
											</div>
											<div className="flex items-center gap-2">
												<RadioGroupItem id="job-kind-interval" value="interval" />
												<Label htmlFor="job-kind-interval" className="font-normal">Every so often (interval)</Label>
											</div>
										</RadioGroup>
									</FormControl>
								</FormItem>
							)}
						/>

						{kind === 'cron'
							? (
								<>
									<FormField
										control={form.control}
										name="cron"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Cron expression</FormLabel>
												<FormDescription>
													Five fields: minute, hour, day of month, month, day of week. <code>0 2 * * *</code>{' '}
													is 2:00 every day.
												</FormDescription>
												<FormControl>
													<Input
														autoComplete="off"
														spellCheck={false}
														className="font-mono"
														placeholder="0 2 * * *"
														{...field}
													/>
												</FormControl>
												<div className="flex flex-wrap gap-1">
													{CRON_SHORTCUTS.map((shortcut) => (
														<Button
															key={shortcut}
															type="button"
															size="sm"
															variant="ghostOutline"
															className="font-mono text-xs"
															onClick={() =>
																form.setValue('cron', shortcut, { shouldDirty: true, shouldValidate: true })}
														>
															{shortcut}
														</Button>
													))}
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="timezone"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Timezone</FormLabel>
												<PickOrType
													field={field}
													options={timezones}
													label="Timezone"
													placeholder="America/New_York"
													otherLabel="Another timezone…"
													optionLabel={(zone) => (zone === SERVER_TIMEZONE ? "The server's timezone" : zone)}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>
								</>
							)
							: (
								<FormField
									control={form.control}
									name="interval"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Interval</FormLabel>
											<FormDescription>
												A number of seconds, or a number with <code>s</code>, <code>m</code>, <code>h</code> or{' '}
												<code>d</code>: <code>90s</code>, <code>15m</code>, <code>1h</code>. From 1 second to 365 days.
											</FormDescription>
											<FormControl>
												<Input autoComplete="off" spellCheck={false} placeholder="15m" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

						<FormField
							control={form.control}
							name="file"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Handler file</FormLabel>
									<Select
										value={field.value}
										onValueChange={(next) => {
											field.onChange(next);
											form.setValue('exportName', '', { shouldValidate: true });
										}}
									>
										<FormControl>
											<SelectTrigger className="w-full" aria-label="Handler file">
												<SelectValue placeholder="Choose a file" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{fileOptions.map((path) => <SelectItem key={path} value={path}>{path}</SelectItem>)}
										</SelectContent>
									</Select>
									{modules.length === 0 && (
										<FormDescription>This app has no .js or .ts file yet. Add one in the editor first.</FormDescription>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="exportName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Export</FormLabel>
									<PickOrType
										key={file}
										field={field}
										options={moduleExports?.names ?? []}
										pending={moduleLoading}
										label="Export"
										placeholder="syncRates, or default"
										otherLabel="Another export…"
										optionLabel={(name) => (name === 'default' ? 'The default export' : name)}
									/>
									<FormDescription>
										{moduleUnreadable
											? 'Studio couldn’t read this file to list its exports: type the name of the one to call.'
											: moduleExports?.incomplete
											? 'This file re-exports another, so the list may be short.'
											: moduleExports && moduleExports.names.length === 0
											? 'Studio found no exports in this file: type the name of the one to call.'
											: 'Harper calls it with the job’s name, when it was due, and whether it is making up a missed run.'}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{exportMissing && (
							<Alert variant="warning">
								<TriangleAlertIcon />
								<AlertDescription>
									Studio didn’t find an export named {exportName} in {file}. If it isn’t there, the app fails to load.
								</AlertDescription>
							</Alert>
						)}

						{saveError != null && (
							<Alert variant="destructive" role="alert">
								<TriangleAlertIcon />
								<AlertDescription>{describeError(saveError).message}</AlertDescription>
							</Alert>
						)}

						<DialogFooter>
							<Button type="button" variant="ghostOutline" onClick={onClose} disabled={isSaving}>Cancel</Button>
							<Button
								type="submit"
								variant="submit"
								disabled={isSaving || !isValid || (!!job && !isDirty)}
							>
								<SaveIcon /> {isSaving ? 'Saving…' : job ? 'Save job' : 'Add job'}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
