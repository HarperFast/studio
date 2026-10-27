import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
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
import { checkPageRequest, getTableCapabilities } from '@/features/instance/extensions/access';
import { defaultValues, ExtensionFields, findMissingField } from '@/features/instance/extensions/content/fields';
import type { ExtensionDataSource, ExtensionRecord } from '@/features/instance/extensions/dataSource';
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
} from '@/features/instance/extensions/manifest';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import type { ColumnDef } from '@/lib/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, EyeIcon, MinusIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface SectionProps {
	dataSource: ExtensionDataSource;
	permission: LocalRolePermission | undefined;
	/** The page's declared access, which bounds what its actions may send. */
	access: ExtensionAccess | undefined;
}

/**
 * Draws a page from its description with Studio's own components, so a component gets a consistent,
 * accessible, themed UI without shipping any code to the browser.
 */
export function SectionsContent({ sections, ...props }: SectionProps & { sections: ExtensionSection[] }) {
	return (
		<div className="flex flex-col gap-6">
			{sections.map((section, index) => <SectionView key={index} section={section} {...props} />)}
		</div>
	);
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
	}
}

function tableQueryKey(dataSource: ExtensionDataSource, database: string, table: string) {
	return [dataSource.id, 'extension-table', database, table] as const;
}

function useTableRows(dataSource: ExtensionDataSource, database: string, table: string, primaryKey = 'id') {
	return useQuery({
		queryKey: tableQueryKey(dataSource, database, table),
		queryFn: () => dataSource.list(database, table, primaryKey),
	});
}

function StatsView({ section, dataSource }: SectionProps & { section: StatsSection }) {
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
									: <CountValue value={item.value} dataSource={dataSource} />}
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function CountValue({ value, dataSource }: {
	value: Extract<StatsSection['items'][number]['value'], { kind: 'count' }>;
	dataSource: ExtensionDataSource;
}) {
	const { data } = useTableRows(dataSource, value.database, value.table);
	if (!data) {
		return <span className="text-muted-foreground">…</span>;
	}
	const where = Object.entries(value.where ?? {});
	return data.filter((record) => where.every(([key, expected]) => record[key] === expected)).length.toLocaleString();
}

function TableView({ section, dataSource, permission }: SectionProps & { section: TableSection }) {
	const primaryKey = section.primaryKey ?? 'id';
	const capabilities = getTableCapabilities(permission, section.database, section.table);
	const editable = section.fields !== undefined;
	const canAdd = editable && capabilities.insert;
	const canEdit = editable && capabilities.update;
	const canDelete = editable && capabilities.delete;
	const readOnlyForRole = editable && !canAdd && !canEdit && !canDelete;
	const itemName = section.itemName ?? 'record';

	const { data, isFetching, refetch } = useTableRows(dataSource, section.database, section.table, primaryKey);
	const [editing, setEditing] = useState<ExtensionRecord | 'new' | null>(null);

	const columns = useMemo<ColumnDef<ExtensionRecord>[]>(() =>
		section.columns.map((column) => ({
			id: column.attribute,
			header: column.label,
			accessorFn: (record: ExtensionRecord) => record[column.attribute] as string | number | undefined,
			cell: ({ row }) => <FormattedCell column={column} value={row.original[column.attribute]} />,
		})), [section.columns]);

	return (
		<section>
			<SectionHeading title={section.title} description={section.description}>
				{readOnlyForRole && (
					<Badge variant="outline" className="gap-1">
						<EyeIcon className="size-3" /> Read-only for your role
					</Badge>
				)}
			</SectionHeading>
			<SimpleBrowseDataTable
				columns={columns}
				data={data ?? []}
				isFetching={isFetching}
				filter={{ label: `Search ${section.title?.toLowerCase() ?? 'records'}` }}
				paginated
				onRowClick={canEdit || canDelete ? (row) => setEditing(row.original) : undefined}
			>
				<Button variant="defaultOutline" onClick={() => refetch()} disabled={isFetching}>
					<RefreshCwIcon />
					<span className="hidden lg:inline-block">Refresh</span>
				</Button>
				{canAdd && (
					<Button variant="positiveOutline" onClick={() => setEditing('new')}>
						<PlusIcon />
						<span className="capitalize">Add {itemName}</span>
					</Button>
				)}
			</SimpleBrowseDataTable>
			{editing && section.fields && (
				<RecordDialog
					key={editing === 'new' ? 'new' : String(editing[primaryKey])}
					section={section}
					fields={section.fields}
					record={editing === 'new' ? undefined : editing}
					dataSource={dataSource}
					canSave={editing === 'new' ? canAdd : canEdit}
					canDelete={editing !== 'new' && canDelete}
					onClose={() => setEditing(null)}
				/>
			)}
		</section>
	);
}

function RecordDialog({ section, fields, record, dataSource, canSave, canDelete, onClose }: {
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

	const save = useMutation({
		mutationFn: () => dataSource.upsert(section.database, section.table, values),
		onSuccess: async () => {
			await invalidate();
			toast.success(record ? `Saved the ${itemName}` : `Added the ${itemName}`);
			onClose();
		},
		onError: (failure) => setError(failure.message),
	});
	const remove = useMutation({
		mutationFn: () => dataSource.remove(section.database, section.table, record?.[primaryKey]),
		onSuccess: async () => {
			await invalidate();
			toast.success(`Deleted the ${itemName}`);
			onClose();
		},
	});

	const onSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		const missing = findMissingField(fields, values);
		if (missing) {
			setError(`${missing.label} is required.`);
			return;
		}
		save.mutate();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
				<form onSubmit={onSubmit} className="grid gap-4">
					<DialogTitle className="capitalize">{record ? `Edit ${itemName}` : `Add ${itemName}`}</DialogTitle>
					<ExtensionFields
						fields={fields}
						values={values}
						disabled={!canSave}
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
				nameOfThingBeingDeleted={String(record?.[section.columns[0]?.attribute ?? primaryKey] ?? '')}
				isModalOpen={confirmingDelete}
				setIsModalOpen={setConfirmingDelete}
				deletionConfirmed={() => remove.mutate()}
				deletionPending={remove.isPending}
			/>
		</Dialog>
	);
}

function FormView({ section, dataSource, permission }: SectionProps & { section: FormSection }) {
	const queryClient = useQueryClient();
	const primaryKey = section.primaryKey ?? 'id';
	const queryKey = [dataSource.id, 'extension-record', section.database, section.table, section.recordId];
	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: async () =>
			(await dataSource.get(section.database, section.table, primaryKey, section.recordId)) ?? {
				[primaryKey]: section.recordId,
			},
	});
	const canSave = getTableCapabilities(permission, section.database, section.table).update;
	const [values, setValues] = useState<ExtensionRecord>({});
	const [error, setError] = useState<string>();
	useEffect(() => {
		if (data) {
			setValues(data);
		}
	}, [data]);
	const dirty = data !== undefined && section.fields.some((field) => values[field.attribute] !== data[field.attribute]);

	const save = useMutation({
		mutationFn: () => dataSource.upsert(section.database, section.table, values),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey });
			toast.success(`Saved ${section.title?.toLowerCase() ?? 'settings'}`);
		},
		onError: (failure) => setError(failure.message),
	});

	return (
		<Card>
			<CardHeader>
				{section.title && <CardTitle>{section.title}</CardTitle>}
				{section.description && <CardDescription>{section.description}</CardDescription>}
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 max-w-xl"
					onSubmit={(event) => {
						event.preventDefault();
						const missing = findMissingField(section.fields, values);
						if (missing) {
							setError(`${missing.label} is required.`);
							return;
						}
						save.mutate();
					}}
				>
					<ExtensionFields
						fields={section.fields}
						values={values}
						disabled={!canSave || isLoading}
						idPrefix={`${section.table}-form`}
						onChange={(attribute, value) => {
							setError(undefined);
							setValues((current) => ({ ...current, [attribute]: value }));
						}}
					/>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{canSave && (
						<div className="flex gap-2">
							<Button type="submit" variant="submit" disabled={!dirty || save.isPending}>Save</Button>
							<Button type="button" variant="ghost" disabled={!dirty} onClick={() => data && setValues(data)}>
								Discard
							</Button>
						</div>
					)}
				</form>
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

function ActionButton({ action, dataSource, permission, access }: SectionProps & { action: ExtensionAction }) {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	const run = useMutation({
		mutationFn: () => {
			const verdict = checkPageRequest(permission, access, action.request);
			if (!verdict.allowed) {
				throw new Error(verdict.reason);
			}
			return dataSource.send(action.request);
		},
		onSuccess: async () => {
			// An action usually changes what the page's tables show.
			await queryClient.invalidateQueries({ queryKey: [dataSource.id] });
			toast.success(action.successMessage ?? `${action.label}: done`);
		},
		onError: (failure) => toast.error(`${action.label} failed`, { description: failure.message }),
	});
	const destructive = action.variant === 'destructive';

	return (
		<>
			<Button
				variant={destructive ? 'destructiveOutline' : 'defaultOutline'}
				disabled={run.isPending}
				onClick={() => action.confirm ? setConfirming(true) : run.mutate()}
			>
				{action.icon && <ExtensionIcon name={action.icon} />}
				{action.label}
			</Button>
			{action.confirm && (
				<AlertDialog open={confirming} onOpenChange={setConfirming}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{action.label}?</AlertDialogTitle>
							<AlertDialogDescription>{action.confirm}</AlertDialogDescription>
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
	switch (column.format) {
		case 'code':
			return <code className="text-xs">{String(value)}</code>;
		case 'badge':
			return <Badge variant={BADGE_VARIANTS[String(value)] ?? 'secondary'}>{String(value)}</Badge>;
		case 'boolean':
			return value === true
				? <CheckIcon className="size-4 text-green-600" aria-label="Yes" />
				: <MinusIcon className="size-4 text-muted-foreground" aria-label="No" />;
		case 'number':
			return typeof value === 'number' ? value.toLocaleString() : String(value);
		case 'datetime':
			return typeof value === 'number' || typeof value === 'string'
				? new Date(value).toLocaleString()
				: String(value);
		default:
			return String(value);
	}
}
