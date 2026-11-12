import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import {
	checkPageRequest,
	declaredDataSource,
	describePageRequest,
	describeUndeclared,
	getTableCapabilities,
	isDeclared,
	isTableWrite,
} from '@/features/instance/extensions/access';
import { attributeValue, displayText, primitiveValue } from '@/features/instance/extensions/content/displayText';
import { defaultValues, ExtensionFields, findMissingField } from '@/features/instance/extensions/content/fields';
import {
	EXTENSION_ROW_LIMIT,
	type ExtensionCount,
	type ExtensionDataSource,
	type ExtensionRecord,
	PartialWriteError,
	UnconfirmedWriteError,
} from '@/features/instance/extensions/dataSource';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import type {
	ActionsSection,
	ExtensionAccess,
	ExtensionAction,
	ExtensionColumn,
	ExtensionField,
	ExtensionSection,
	FormSection,
	StatsSection,
	TableSection,
	UnsupportedNotice,
} from '@/features/instance/extensions/manifest';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import type { ColumnDef } from '@/lib/table';
import { describeError } from '@/react-query/queryClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	CheckIcon,
	CircleAlertIcon,
	CircleArrowUpIcon,
	EyeIcon,
	FileWarningIcon,
	MinusIcon,
	PencilOffIcon,
	PlusIcon,
	RefreshCwIcon,
	ShieldOffIcon,
	TriangleAlertIcon,
} from 'lucide-react';
import { Component, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

interface SectionProps {
	dataSource: ExtensionDataSource;
	permission: LocalRolePermission | undefined;
	/** The page's declared access, which bounds every request its sections send. */
	access: ExtensionAccess | undefined;
}

/**
 * Draws a page from its description with Studio's own components, so a component gets a consistent,
 * accessible, themed UI without shipping any code to the browser.
 */
export function SectionsContent(
	{ sections, dataSource, permission, access }: SectionProps & { sections: ExtensionSection[] },
) {
	const declared = useMemo(() => declaredDataSource(dataSource, permission, access), [
		dataSource,
		permission,
		access,
	]);
	return (
		<div className="flex flex-col gap-6">
			{sections.map((section, index) => (
				<SectionErrorBoundary key={index} section={section}>
					<SectionView section={section} dataSource={declared} permission={permission} access={access} />
				</SectionErrorBoundary>
			))}
		</div>
	);
}

interface SectionErrorBoundaryState {
	failed: boolean;
	message?: string;
	section?: ExtensionSection;
}

/** One section that fails to render takes only itself down, and a new configuration gets a fresh try. */
class SectionErrorBoundary
	extends Component<{ section: ExtensionSection; children: ReactNode }, SectionErrorBoundaryState>
{
	state: SectionErrorBoundaryState = { failed: false };

	static getDerivedStateFromError(error: unknown): Partial<SectionErrorBoundaryState> {
		return { failed: true, message: error instanceof Error ? error.message : undefined };
	}

	static getDerivedStateFromProps(
		props: { section: ExtensionSection },
		state: SectionErrorBoundaryState,
	): Partial<SectionErrorBoundaryState> | null {
		return state.section === props.section ? null : { failed: false, message: undefined, section: props.section };
	}

	componentDidCatch(error: Error) {
		// Not `console.error`: the root `onCaughtError` already reports this to RUM, which would count it twice.
		console.warn('[extension section] render failed', error);
	}

	render() {
		if (!this.state.failed) {
			return this.props.children;
		}
		const { section } = this.props;
		return (
			<Card role="note" className="py-4 border border-dashed bg-muted/40 shadow-none ring-0">
				<CardContent className="flex items-start gap-3 px-4 text-muted-foreground">
					<TriangleAlertIcon className="size-5 shrink-0 mt-0.5" aria-hidden />
					<div className="grid gap-0.5 min-w-0">
						{'title' in section && section.title && (
							<h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
						)}
						<p className="text-sm font-medium">This section couldn't be shown</p>
						{this.state.message && <p className="text-xs break-words">{this.state.message}</p>}
					</div>
				</CardContent>
			</Card>
		);
	}
}

function SectionView({ section, ...props }: SectionProps & { section: ExtensionSection }) {
	switch (section.type) {
		case 'text':
			return (
				<div className="max-w-3xl">
					{section.title && <h2 className="text-lg font-semibold mb-1">{section.title}</h2>}
					{section.body.split(/\n{2,}/).map((paragraph, index) => (
						<p key={index} className="text-sm text-muted-foreground mb-2">{paragraph}</p>
					))}
				</div>
			);
		case 'stats':
			return <StatsView section={section} {...props} />;
		case 'table':
			return <TableView section={section} {...props} />;
		case 'form':
			return <FormView section={section} {...props} />;
		case 'actions':
			return <ActionsView section={section} {...props} />;
		case 'unsupported':
			return <UnsupportedNoticeCard notice={section} subject="section" title={section.title} />;
	}
}

/** The parser's stand-in for a page or section this Studio can't draw, saying why. */
export function UnsupportedNoticeCard({ notice, subject, title }: {
	notice: UnsupportedNotice;
	subject: 'page' | 'section';
	title?: string;
}) {
	const newer = notice.cause === 'newer-studio';
	const Icon = newer ? CircleArrowUpIcon : FileWarningIcon;
	return (
		<Card role="note" className="py-4 border border-dashed bg-muted/40 shadow-none ring-0">
			<CardContent className="flex items-start gap-3 px-4 text-muted-foreground">
				<Icon className="size-5 shrink-0 mt-0.5" aria-hidden />
				<div className="grid gap-0.5">
					{title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
					<p className="text-sm font-medium">
						{newer ? `This ${subject} needs a newer version of Studio` : `Studio couldn't read this ${subject}`}
					</p>
					<p className="text-xs">{notice.reason}</p>
				</div>
			</CardContent>
		</Card>
	);
}

/** In place of a section that reads a table its page doesn't declare, which Studio won't send. */
function UndeclaredReadCard({ title, database, table }: { title?: string; database: string; table: string }) {
	return (
		<Card role="note" className="py-4 border border-dashed bg-muted/40 shadow-none ring-0">
			<CardContent className="flex items-start gap-3 px-4 text-muted-foreground">
				<ShieldOffIcon className="size-5 shrink-0 mt-0.5" aria-hidden />
				<div className="grid gap-0.5 min-w-0">
					{title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
					<p className="text-sm font-medium break-words">{describeUndeclared(database, table, 'read')}</p>
					<p className="text-xs">Studio loads only the tables a page lists in its access.</p>
				</div>
			</CardContent>
		</Card>
	);
}

/** Everything read from one table, so a write refreshes its rows, its counts and its records together. */
function tableQueryKey(dataSource: ExtensionDataSource, database: string, table: string) {
	return [dataSource.id, 'extension-table', database, table] as const;
}

/**
 * Says why a write failed, inline while its form is on screen and as a toast once the user has closed or
 * left it. One that may have landed says so rather than inviting a retry, and reads the page's data again
 * so what the user is told to check is current. These writes skip the global toast, and with it the
 * `console.error` that is how a failed mutation reaches RUM, so this keeps that report.
 */
function reportWriteFailure(failure: unknown, { inline, failed, partly, unconfirmed, refresh }: {
	inline: ((message: string) => void) | undefined;
	/** The toast's title for a definite failure. */
	failed: string;
	/** The toast's title for a write Harper applied to only some of its records. */
	partly?: string;
	unconfirmed: string;
	refresh: () => Promise<unknown>;
}) {
	console.error(failure);
	const unknown = isUnansweredWrite(failure) || failure instanceof UnconfirmedWriteError;
	const partial = failure instanceof PartialWriteError;
	if (unknown || partial) {
		void refresh();
	}
	const message = unknown ? unconfirmed : describeError(failure).message;
	if (inline) {
		inline(message);
	} else if (unknown) {
		toast.warning(unconfirmed);
	} else if (partial) {
		toast.warning(partly ?? failed, { description: message });
	} else {
		toast.error(failed, { description: message });
	}
}

/** Whether a form is still mounted and open when a write settles, which may be after the user left it. */
function useShowing(open: boolean) {
	const showing = useRef(open);
	useEffect(() => {
		showing.current = open;
		return () => {
			showing.current = false;
		};
	}, [open]);
	return showing;
}

function useTableRows(
	dataSource: ExtensionDataSource,
	database: string,
	table: string,
	primaryKey: string,
	attributes: readonly string[],
) {
	return useQuery({
		queryKey: [...tableQueryKey(dataSource, database, table), 'rows', primaryKey, attributes],
		queryFn: () => dataSource.list(database, table, primaryKey, attributes),
		// As long as Browse's reads: up to 1,001 rows shouldn't be read again on every refocus. The page's own
		// writes invalidate it, and Refresh refetches regardless.
		staleTime: 60_000,
	});
}

/** What a table section shows or edits, so a row carries nothing else (a page cache's rendered HTML, say). */
function tableAttributes(primaryKey: string, section: TableSection): string[] {
	return [
		...new Set([
			primaryKey,
			...section.columns.map((column) => column.attribute),
			...(section.fields ?? []).map((field) => field.attribute),
		]),
	];
}

function fieldsDiffer(fields: ExtensionField[], a: ExtensionRecord, b: ExtensionRecord): boolean {
	return fields.some((field) => !Object.is(attributeValue(a, field.attribute), attributeValue(b, field.attribute)));
}

/**
 * Whether `record` holds every field the user changed from `opened`. Only those: a field they left alone
 * may differ for reasons that are no edit of theirs, such as another writer's change or a null that a
 * projected read returns for an attribute the form never set.
 */
function holdsEdits(
	fields: ExtensionField[],
	values: ExtensionRecord,
	opened: ExtensionRecord,
	record: ExtensionRecord,
): boolean {
	return fields.every((field) => {
		const value = attributeValue(values, field.attribute);
		return Object.is(value, attributeValue(opened, field.attribute))
			|| Object.is(value, attributeValue(record, field.attribute));
	});
}

/**
 * An update of only the fields the user changed from `record`, the one they opened, and its key. So an
 * attribute the record lacks (which a projected read returns as null) isn't written as null, and another
 * writer's change to a field the user left alone survives.
 */
function changedFields(
	fields: ExtensionField[],
	primaryKey: string,
	values: ExtensionRecord,
	record: ExtensionRecord,
): ExtensionRecord {
	return Object.fromEntries([
		[primaryKey, attributeValue(record, primaryKey)],
		...fields.filter((field) =>
			field.attribute !== primaryKey
			&& !Object.is(attributeValue(values, field.attribute), attributeValue(record, field.attribute))
		)
			.map((field) => [field.attribute, attributeValue(values, field.attribute)]),
	]);
}

/** A new record of the form's fields and its key, so an insert writes nothing the form didn't show. */
function pickFields(fields: ExtensionField[], primaryKey: string, values: ExtensionRecord): ExtensionRecord {
	return Object.fromEntries(
		[primaryKey, ...fields.map((field) => field.attribute)].filter((attribute) => attribute in values).map((
			attribute,
		) => [attribute, values[attribute]]),
	);
}

/** In place of what a read would have drawn, so a failed read never looks like an empty table or record. */
function ReadError({ error, database, table, retrying, onRetry }: {
	error: unknown;
	database: string;
	table: string;
	retrying: boolean;
	onRetry: () => void;
}) {
	return (
		<div
			role="alert"
			className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"
		>
			<div className="flex items-start gap-2 min-w-0">
				<CircleAlertIcon className="size-4 shrink-0 mt-0.5 text-destructive" aria-hidden />
				<div className="grid gap-0.5 min-w-0">
					<p className="text-sm font-medium text-destructive">Studio couldn't load {database}.{table}</p>
					<p className="text-xs text-muted-foreground break-words">{describeError(error).message}</p>
				</div>
			</div>
			<Button variant="defaultOutline" size="sm" onClick={onRetry} disabled={retrying}>
				<RefreshCwIcon />
				Retry
			</Button>
		</div>
	);
}

function formatCount({ count, bound }: ExtensionCount): string {
	const text = count.toLocaleString();
	return bound === 'at-least' ? `${text}+` : bound === 'estimate' ? `~${text}` : text;
}

function StatsView({ section, dataSource, access }: SectionProps & { section: StatsSection }) {
	return (
		<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
			{section.items.map((item) => (
				<Card key={item.label} className="py-4">
					<CardContent className="flex items-center gap-3 px-4">
						{item.icon && <ExtensionIcon name={item.icon} className="size-5 text-muted-foreground" />}
						<div>
							<div className="text-xs text-muted-foreground">{item.label}</div>
							<div className="text-2xl font-semibold">
								{item.value.kind === 'static'
									? item.value.value
									: item.value.kind === 'unsupported'
									? <StatDash reason={item.value.reason} />
									: isDeclared(access, item.value.database, item.value.table, 'read')
									? <CountValue value={item.value} dataSource={dataSource} />
									: <StatDash reason={describeUndeclared(item.value.database, item.value.table, 'read')} />}
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function StatDash({ reason }: { reason: string }) {
	return (
		<span className="text-muted-foreground" title={reason}>
			—<span className="sr-only">{reason}</span>
		</span>
	);
}

function CountValue({ value, dataSource }: {
	value: Extract<StatsSection['items'][number]['value'], { kind: 'count' }>;
	dataSource: ExtensionDataSource;
}) {
	const { data, isError } = useQuery({
		queryKey: [...tableQueryKey(dataSource, value.database, value.table), 'count', value.where ?? null],
		queryFn: () => dataSource.count(value.database, value.table, value.where),
	});
	if (!data) {
		return <span className="text-muted-foreground">{isError ? '—' : '…'}</span>;
	}
	return formatCount(data);
}

/** A section's table is loaded only when its page declares reading it. */
function TableView(props: SectionProps & { section: TableSection }) {
	const { section, access } = props;
	// Keyed by its table, so a configuration that points this section elsewhere doesn't carry an open editor across.
	return isDeclared(access, section.database, section.table, 'read')
		? <DeclaredTableView key={JSON.stringify([section.database, section.table])} {...props} />
		: <UndeclaredReadCard title={section.title} database={section.database} table={section.table} />;
}

const WRITE_ACTIONS = ['insert', 'update', 'delete'] as const;

function DeclaredTableView({ section, dataSource, permission, access }: SectionProps & { section: TableSection }) {
	const primaryKey = section.primaryKey ?? 'id';
	const capabilities = getTableCapabilities(permission, access, section.database, section.table);
	const editable = section.fields !== undefined;
	const canAdd = editable && capabilities.insert;
	const canEdit = editable && capabilities.update;
	const canDelete = editable && capabilities.delete;
	const readOnly = editable && !canAdd && !canEdit && !canDelete;
	// Read-only because the page declares no writes, not because of the viewer's role.
	const writesUndeclared = readOnly
		&& !WRITE_ACTIONS.some((action) => isDeclared(access, section.database, section.table, action));
	const undeclaredWrites =
		`This page doesn't declare insert, update or delete on ${section.database}.${section.table}.`;
	const itemName = section.itemName ?? 'record';

	const attributes = useMemo(() => tableAttributes(primaryKey, section), [primaryKey, section]);
	const { data, isFetching, isError, error, refetch } = useTableRows(
		dataSource,
		section.database,
		section.table,
		primaryKey,
		attributes,
	);
	// Kept after close so the dialog keeps its content while it animates out; `opened` gives each opening
	// fresh form state, even for the same record.
	const [editing, setEditing] = useState<ExtensionRecord | 'new' | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [opened, setOpened] = useState(0);
	const openEditor = (record: ExtensionRecord | 'new') => {
		setEditing(record);
		setOpened((count) => count + 1);
		setDialogOpen(true);
	};

	const columns = useMemo<ColumnDef<ExtensionRecord>[]>(() =>
		section.columns.map((column) => ({
			id: column.attribute,
			header: column.label,
			accessorFn: (record: ExtensionRecord) => primitiveValue(attributeValue(record, column.attribute)),
			cell: ({ row }) => <FormattedCell column={column} value={attributeValue(row.original, column.attribute)} />,
		})), [section.columns]);

	return (
		<section>
			<SectionHeading title={section.title} description={section.description}>
				{section.editingUnsupported && (
					<Badge variant="outline" className="gap-1" title={section.editingUnsupported.reason}>
						<PencilOffIcon className="size-3" />
						{section.editingUnsupported.cause === 'newer-studio'
							? 'Editing needs a newer Studio'
							: 'Editing unavailable'}
						<span className="sr-only">{section.editingUnsupported.reason}</span>
					</Badge>
				)}
				{readOnly && (writesUndeclared
					? (
						<Badge variant="outline" className="gap-1" title={undeclaredWrites}>
							<EyeIcon className="size-3" /> Read-only on this page
							<span className="sr-only">{undeclaredWrites}</span>
						</Badge>
					)
					: (
						<Badge variant="outline" className="gap-1">
							<EyeIcon className="size-3" /> Read-only for your role
						</Badge>
					))}
				{data?.truncated && (
					<Badge variant="outline" title="Search and paging cover only the rows loaded">
						First {EXTENSION_ROW_LIMIT.toLocaleString()} rows
					</Badge>
				)}
			</SectionHeading>
			{isError && (
				<div className={data ? 'mb-2' : undefined}>
					<ReadError
						error={error}
						database={section.database}
						table={section.table}
						retrying={isFetching}
						onRetry={() => refetch()}
					/>
				</div>
			)}
			{/* A later refetch that fails keeps the rows already shown, beneath the error. */}
			{(!isError || data) && (
				<SimpleBrowseDataTable
					columns={columns}
					data={data?.records ?? []}
					isFetching={isFetching}
					filter={{ label: `Search ${section.title?.toLowerCase() ?? 'records'}` }}
					paginated
					onRowClick={canEdit || canDelete ? (row) => openEditor(row.original) : undefined}
				>
					<Button variant="defaultOutline" onClick={() => refetch()} disabled={isFetching}>
						<RefreshCwIcon />
						<span className="hidden lg:inline-block">Refresh</span>
					</Button>
					{canAdd && (
						<Button variant="positiveOutline" onClick={() => openEditor('new')}>
							<PlusIcon />
							<span className="capitalize">Add {itemName}</span>
						</Button>
					)}
				</SimpleBrowseDataTable>
			)}
			{editing && section.fields && (
				<RecordDialog
					key={opened}
					open={dialogOpen}
					section={section}
					fields={section.fields}
					record={editing === 'new' ? undefined : editing}
					dataSource={dataSource}
					canSave={editing === 'new' ? canAdd : canEdit}
					canDelete={editing !== 'new' && canDelete}
					onClose={() => setDialogOpen(false)}
				/>
			)}
		</section>
	);
}

function RecordDialog({ open, section, fields, record, dataSource, canSave, canDelete, onClose }: {
	open: boolean;
	section: TableSection;
	fields: ExtensionField[];
	record: ExtensionRecord | undefined;
	dataSource: ExtensionDataSource;
	canSave: boolean;
	canDelete: boolean;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const primaryKey = section.primaryKey ?? 'id';
	const itemName = section.itemName ?? 'record';
	const [values, setValues] = useState<ExtensionRecord>(() => record ?? defaultValues(fields));
	const [error, setError] = useState<string>();
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: tableQueryKey(dataSource, section.database, section.table) });

	const showing = useShowing(open);
	const reportFailure = (failure: unknown, failed: string, unconfirmed: string) =>
		reportWriteFailure(failure, {
			inline: showing.current ? setError : undefined,
			failed,
			unconfirmed:
				`Studio couldn't confirm whether the ${itemName} was ${unconfirmed}. Check the table before you try again.`,
			refresh: invalidate,
		});
	const save = useMutation({
		meta: { skipGlobalErrorToast: true },
		// Add inserts, so a taken key fails instead of overwriting that row; Edit updates only the fields the
		// user changed. Each then needs just the permission its button was offered on.
		mutationFn: () =>
			record
				? dataSource.update(
					section.database,
					section.table,
					changedFields(fields, primaryKey, values, record),
					primaryKey,
				)
				: dataSource.insert(section.database, section.table, values, primaryKey),
		onSuccess: async () => {
			await invalidate();
			toast.success(record ? `Saved the ${itemName}` : `Added the ${itemName}`);
		},
		onError: (failure) =>
			record
				? reportFailure(failure, `The ${itemName} wasn't saved`, 'saved')
				: reportFailure(failure, `The ${itemName} wasn't added`, 'added'),
	});
	const remove = useMutation({
		meta: { skipGlobalErrorToast: true },
		mutationFn: () => dataSource.remove(section.database, section.table, attributeValue(record, primaryKey)),
		onSuccess: async () => {
			await invalidate();
			toast.success(`Deleted the ${itemName}`);
		},
		onError: (failure) => {
			setConfirmingDelete(false);
			reportFailure(failure, `The ${itemName} wasn't deleted`, 'deleted');
		},
	});

	const onSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		const missing = findMissingField(fields, values);
		if (missing) {
			setError(`${missing.label} is required.`);
			return;
		}
		// Closing from `mutate`, not the mutation: React Query skips these callbacks once this dialog has
		// unmounted, so a save left running after Cancel can't close the next record's dialog.
		save.mutate(undefined, { onSuccess: onClose });
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
				<form onSubmit={onSubmit} className="grid gap-4">
					<DialogTitle className="capitalize">{record ? `Edit ${itemName}` : `Add ${itemName}`}</DialogTitle>
					<ExtensionFields
						fields={fields}
						values={values}
						disabled={!canSave}
						lockedAttribute={record ? primaryKey : undefined}
						idPrefix={`${section.table}-record`}
						onChange={(attribute, value) => {
							setError(undefined);
							setValues((current) => ({ ...current, [attribute]: value }));
						}}
					/>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<DialogFooter className="gap-2 sm:justify-between">
						{canDelete
							? (
								<Button type="button" variant="destructiveOutline" onClick={() => setConfirmingDelete(true)}>
									Delete
								</Button>
							)
							: <span />}
						<div className="flex gap-2">
							<Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
							{canSave && <Button type="submit" variant="submit" disabled={save.isPending}>Save</Button>}
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
			<ConfirmDeletionModal
				typeOfThingBeingDeleted={itemName}
				nameOfThingBeingDeleted={displayText(attributeValue(record, section.columns[0]?.attribute ?? primaryKey))}
				isModalOpen={confirmingDelete}
				setIsModalOpen={setConfirmingDelete}
				deletionConfirmed={() => remove.mutate(undefined, { onSuccess: onClose })}
				deletionPending={remove.isPending}
			/>
		</Dialog>
	);
}

/** A form's record is loaded only when its page declares reading the table. */
function FormView(props: SectionProps & { section: FormSection }) {
	const { section, access } = props;
	// Keyed by its record, so unsaved edits never follow the section to another one.
	return isDeclared(access, section.database, section.table, 'read')
		? <DeclaredFormView key={JSON.stringify([section.database, section.table, section.recordId])} {...props} />
		: <UndeclaredReadCard title={section.title} database={section.database} table={section.table} />;
}

interface FormRecord {
	record: ExtensionRecord;
	stored: boolean;
}

function DeclaredFormView({ section, dataSource, permission, access }: SectionProps & { section: FormSection }) {
	const queryClient = useQueryClient();
	const primaryKey = section.primaryKey ?? 'id';
	const tableKey = tableQueryKey(dataSource, section.database, section.table);
	const attributes = useMemo(() => section.fields.map((field) => field.attribute), [section.fields]);
	const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
		queryKey: [...tableKey, 'record', section.recordId, primaryKey, attributes],
		queryFn: async (): Promise<FormRecord> => {
			const stored = await dataSource.get(section.database, section.table, primaryKey, section.recordId, attributes);
			return stored
				? { record: stored, stored: true }
				: { record: { ...defaultValues(section.fields), [primaryKey]: section.recordId }, stored: false };
		},
	});
	const capabilities = getTableCapabilities(permission, access, section.database, section.table);
	const canSave = data?.stored === false ? capabilities.insert : capabilities.update;
	const [values, setValues] = useState<ExtensionRecord>({});
	// The read the user's edits started from, which they are judged and saved against, and a later read
	// that would have replaced unsaved edits, held until the user asks for it.
	const [opened, setOpened] = useState<FormRecord>();
	const [newer, setNewer] = useState<FormRecord>();
	const [saveError, setSaveError] = useState<string>();
	const showing = useShowing(true);
	const open = (next: FormRecord) => {
		setOpened(next);
		setValues(next.record);
		setNewer(undefined);
	};
	if (data && data !== opened && data !== newer) {
		if (!opened || !fieldsDiffer(section.fields, values, opened.record)) {
			open(data);
		} else if (data.stored && holdsEdits(section.fields, values, opened.record, data.record)) {
			// As the user's own save reads back: loading it loses none of their edits, and settles a save Studio
			// couldn't confirm. A record that isn't stored holds no edits, however its defaults compare.
			open(data);
			setSaveError(undefined);
		} else if (data.stored === opened.stored && !fieldsDiffer(section.fields, data.record, opened.record)) {
			// Nothing the form shows changed, so the edits stay without a note.
			setOpened(data);
			setNewer(undefined);
		} else {
			setNewer(data);
		}
	}
	const dirty = opened !== undefined && (!opened.stored || fieldsDiffer(section.fields, values, opened.record));

	const save = useMutation({
		meta: { skipGlobalErrorToast: true },
		mutationFn: () =>
			data?.stored && opened
				? dataSource.update(section.database, section.table, {
					...changedFields(section.fields, primaryKey, values, opened.record),
					[primaryKey]: section.recordId,
				}, primaryKey)
				: dataSource.insert(
					section.database,
					section.table,
					pickFields(section.fields, primaryKey, { ...values, [primaryKey]: section.recordId }),
					primaryKey,
				),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: tableKey });
			toast.success(`Saved ${section.title?.toLowerCase() ?? 'settings'}`);
		},
		onError: (failure) =>
			reportWriteFailure(failure, {
				inline: showing.current ? setSaveError : undefined,
				failed: `Your changes to ${section.title?.toLowerCase() ?? 'the settings'} weren't saved`,
				unconfirmed: "Studio couldn't confirm whether your changes were saved. Check the record before you save again.",
				refresh: () => queryClient.invalidateQueries({ queryKey: tableKey }),
			}),
	});

	return (
		<Card>
			<CardHeader>
				{section.title && <CardTitle>{section.title}</CardTitle>}
				{section.description && <CardDescription>{section.description}</CardDescription>}
			</CardHeader>
			<CardContent className="grid gap-4">
				{isError && (
					<ReadError
						error={error}
						database={section.database}
						table={section.table}
						retrying={isFetching}
						onRetry={() => refetch()}
					/>
				)}
				{/* Nothing read is nothing to edit. A failed refetch keeps the record on show, but not Save. */}
				{(!isError || data) && (
					<form
						className="grid gap-4 max-w-xl"
						onSubmit={(event) => {
							event.preventDefault();
							if (isError) {
								return;
							}
							const missing = findMissingField(section.fields, values);
							if (missing) {
								setSaveError(`${missing.label} is required.`);
								return;
							}
							save.mutate();
						}}
					>
						{newer && (
							<Alert variant="warning" role="status">
								<AlertDescription>
									<p>
										{newer.stored
											? 'This record changed since you opened it.'
											: 'This record was removed since you opened it.'}
										{/* The newer record may need a write this viewer isn't offered, such as the insert that recreates it. */}
										{canSave && (newer.stored
											? ' Saving writes only the fields you changed.'
											: ' Saving creates it again from these values.')}
									</p>
									<Button type="button" variant="defaultOutline" size="sm" onClick={() => open(newer)}>
										Discard my changes and load it
									</Button>
								</AlertDescription>
							</Alert>
						)}
						<ExtensionFields
							fields={section.fields}
							values={values}
							disabled={!canSave || isLoading}
							lockedAttribute={primaryKey}
							idPrefix={`${section.table}-form`}
							onChange={(attribute, value) => {
								setSaveError(undefined);
								setValues((current) => ({ ...current, [attribute]: value }));
							}}
						/>
						{saveError && <p className="text-sm text-destructive">{saveError}</p>}
						{canSave && (
							<div className="flex gap-2">
								<Button type="submit" variant="submit" disabled={!dirty || isError || save.isPending}>Save</Button>
								<Button type="button" variant="ghost" disabled={!dirty} onClick={() => data && open(data)}>
									Discard
								</Button>
							</div>
						)}
					</form>
				)}
			</CardContent>
		</Card>
	);
}

function ActionsView({ section, ...props }: SectionProps & { section: ActionsSection }) {
	return (
		<section>
			<SectionHeading title={section.title} description={section.description} />
			<div className="flex flex-wrap gap-2">
				{section.actions.map((action) => <ActionButton key={action.label} action={action} {...props} />)}
			</div>
		</section>
	);
}

/** A reason from {@link checkPageRequest}, as the sentence written beside a button it disables. */
function asSentence(reason: string): string {
	const sentence = reason.charAt(0).toUpperCase() + reason.slice(1);
	return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function ActionButton({ action, dataSource, permission, access }: SectionProps & { action: ExtensionAction }) {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	// An action usually changes what the page's tables show.
	const refresh = () => queryClient.invalidateQueries({ queryKey: [dataSource.id] });
	const run = useMutation({
		// One toast that names the action, not the global one beside it.
		meta: { skipGlobalErrorToast: true },
		// The declared data source refuses anything checkPageRequest does.
		mutationFn: () => dataSource.send(action.request),
		onSuccess: async () => {
			await refresh();
			toast.success(action.successMessage ?? `${action.label}: done`);
		},
		onError: (failure) =>
			reportWriteFailure(failure, {
				inline: undefined,
				failed: `${action.label} failed`,
				partly: `${action.label} only partly took effect`,
				unconfirmed: `Studio couldn't confirm whether ${action.label} ran. Check whether it took effect before `
					+ 'you run it again, or it may run twice.',
				refresh,
			}),
	});
	// An action the viewer's role can't run, such as one needing a grant the page lists as optional, is not
	// offered: the data source would refuse it only after the viewer had confirmed it.
	const verdict = checkPageRequest(permission, access, action.request);
	const blocked = action.unsupported?.reason ?? (verdict.allowed ? undefined : asSentence(verdict.reason));
	const destructive = action.variant === 'destructive';
	// A write's author may not have thought to ask, and the request is all the viewer can judge it by.
	const needsConfirm = action.confirm !== undefined || destructive || isTableWrite(action.request.operation);
	const noteId = useId();

	return (
		<>
			<div className="grid gap-1">
				<Button
					variant={destructive ? 'destructiveOutline' : 'defaultOutline'}
					disabled={run.isPending || blocked !== undefined}
					aria-describedby={blocked && noteId}
					onClick={() => needsConfirm ? setConfirming(true) : run.mutate()}
				>
					{action.icon && <ExtensionIcon name={action.icon} />}
					{action.label}
				</Button>
				{/* A disabled button shows no tooltip, so the reason is written out. */}
				{blocked && <p id={noteId} className="text-xs text-muted-foreground max-w-60">{blocked}</p>}
			</div>
			{needsConfirm && (
				<AlertDialog open={confirming} onOpenChange={setConfirming}>
					<AlertDialogContent>
						<AlertDialogHeader className="min-w-0">
							<AlertDialogTitle>{action.label}?</AlertDialogTitle>
							{/* Drawn from the request itself, so the author's text can't misdescribe what is sent. */}
							<AlertDialogDescription asChild>
								<div className="grid gap-2">
									{action.confirm && <p>{action.confirm}</p>}
									<p className="font-medium text-foreground break-words">{describePageRequest(action.request)}</p>
								</div>
							</AlertDialogDescription>
							<pre
								aria-label="Request"
								className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-left text-xs font-mono"
							>
								{JSON.stringify(action.request, null, 2)}
							</pre>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
								onClick={() => run.mutate()}
							>
								{action.label}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</>
	);
}

function SectionHeading({ title, description, children }: {
	title?: string;
	description?: string;
	children?: React.ReactNode;
}) {
	if (!title && !description && !children) {
		return null;
	}
	return (
		<div className="flex items-start justify-between gap-4 mb-2">
			<div>
				{title && <h2 className="text-lg font-semibold">{title}</h2>}
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{children}
		</div>
	);
}

const BADGE_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> = {
	fresh: 'success',
	rendering: 'warning',
	stale: 'warning',
	purged: 'destructive',
};

function FormattedCell({ column, value }: { column: ExtensionColumn; value: unknown }) {
	if (value === undefined || value === null || value === '') {
		return <span className="text-muted-foreground">—</span>;
	}
	const text = displayText(value);
	switch (column.format) {
		case 'code':
			return <code className="text-xs">{text}</code>;
		case 'badge':
			// Own keys of strings only: `constructor` would otherwise find Object's.
			return (
				<Badge
					variant={typeof value === 'string' && Object.hasOwn(BADGE_VARIANTS, value)
						? BADGE_VARIANTS[value]
						: 'secondary'}
				>
					{text}
				</Badge>
			);
		case 'boolean':
			return value === true
				? <CheckIcon className="size-4 text-green-600" aria-label="Yes" />
				: <MinusIcon className="size-4 text-muted-foreground" aria-label="No" />;
		case 'number':
			return typeof value === 'number' ? value.toLocaleString() : text;
		case 'datetime': {
			const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : undefined;
			return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : text;
		}
		default:
			return text;
	}
}
