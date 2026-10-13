import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import {
	ClusterAccess,
	clusterRowFlags,
	CrudFlags,
	parsePermissionsJson,
	readClusterAccess,
	RolePermissions,
	toJson,
	writeClusters,
} from '@/features/organization/roles/rolePermissions';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { useId, useRef, useState } from 'react';

const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
const ACTION_LABELS: Record<(typeof ACTIONS)[number], string> = {
	view: 'View',
	create: 'Create',
	update: 'Update',
	delete: 'Delete',
};

function Checkbox(
	{ checked, disabled, onChange, label, id, describedBy }: {
		checked: boolean;
		disabled?: boolean;
		onChange: (checked: boolean) => void;
		label?: string;
		id?: string;
		describedBy?: string;
	},
) {
	return (
		<input
			id={id}
			type="checkbox"
			aria-label={label}
			aria-describedby={describedBy}
			className="size-4 shrink-0 accent-primary dark:accent-violet-300 disabled:opacity-60"
			checked={checked}
			disabled={disabled}
			onChange={(event) => onChange(event.target.checked)}
		/>
	);
}

function OrganizationPermission(
	{ label, description, checked, disabled, onChange }: {
		label: string;
		description: string;
		checked: boolean;
		disabled: boolean;
		onChange: (checked: boolean) => void;
	},
) {
	const id = useId();
	return (
		<div className="flex items-start gap-3">
			<div className="pt-0.5">
				<Checkbox id={id} describedBy={`${id}-description`} checked={checked} disabled={disabled} onChange={onChange} />
			</div>
			<div className="text-sm">
				<label htmlFor={id} className="text-foreground">{label}</label>
				<p id={`${id}-description`} className="text-xs text-muted-foreground">{description}</p>
			</div>
		</div>
	);
}

type EditableAccess = Exclude<ClusterAccess, { scope: 'custom' }>;

function PermissionsForm(
	{ value, onChange, clusters, disabled }: {
		value: RolePermissions;
		onChange: (value: RolePermissions) => void;
		clusters: Array<{ id: string; name?: string; status?: string }>;
		disabled: boolean;
	},
) {
	const [access, setAccess] = useState<ClusterAccess>(() => readClusterAccess(value));
	// Kept here as well as in `value`: with "selected clusters" and none chosen, central manager's fields
	// have nowhere to hold the row's flags.
	const [clusterRow, setClusterRow] = useState<CrudFlags>(() => clusterRowFlags(value, readClusterAccess(value)));
	const isCustom = access.scope === 'custom';
	const clustersLocked = disabled || isCustom;
	const selectedIds = access.scope === 'selected' ? access.clusterIds : [];
	// A deleted cluster stays listed while the role still names it, so unticking it is the only way it goes.
	const listedClusters = clusters.filter((cluster) =>
		!deletedClusterStatuses.includes(cluster.status ?? '') || selectedIds.includes(cluster.id)
	);

	const updateClusters = (row: CrudFlags, nextAccess: EditableAccess) => {
		setClusterRow(row);
		setAccess(nextAccess);
		onChange(writeClusters(value, row, nextAccess));
	};

	return (
		<div className="space-y-6">
			<section aria-labelledby="role-organization-heading">
				<h3 id="role-organization-heading" className="mb-3 font-medium text-foreground">Organization</h3>
				<div className="grid gap-4 sm:grid-cols-2">
					<OrganizationPermission
						label="Update organization"
						description="Change the organization’s settings and billing."
						checked={value.update}
						disabled={disabled}
						onChange={(checked) => onChange({ ...value, update: checked })}
					/>
					<OrganizationPermission
						label="Delete organization"
						description="Permanently delete the organization."
						checked={value.delete}
						disabled={disabled}
						onChange={(checked) => onChange({ ...value, delete: checked })}
					/>
				</div>
			</section>

			<section aria-labelledby="role-resources-heading">
				<h3 id="role-resources-heading" className="mb-3 font-medium text-foreground">Resource permissions</h3>
				<Table containerClassName="rounded-md border border-border dark:border-grey-700 bg-card dark:bg-black-dark">
					<TableHeader>
						<TableRow className="border-none">
							<TableHead className="w-1/3 px-2">Resource</TableHead>
							{ACTIONS.map((action) => (
								<TableHead key={action} className="px-2 text-center">{ACTION_LABELS[action]}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody className="bg-background dark:bg-black">
						<TableRow className="border-border dark:border-grey-700">
							<TableCell className="px-2 py-2.5 font-medium">Roles</TableCell>
							{ACTIONS.map((action) => (
								<TableCell key={action} className="px-2 py-2.5 text-center">
									<Checkbox
										label={`Roles: ${ACTION_LABELS[action]}`}
										checked={value.roles[action]}
										disabled={disabled}
										onChange={(checked) => onChange({ ...value, roles: { ...value.roles, [action]: checked } })}
									/>
								</TableCell>
							))}
						</TableRow>
						<TableRow className="border-border dark:border-grey-700">
							<TableCell className="px-2 py-2.5 font-medium">Clusters</TableCell>
							{ACTIONS.map((action) => (
								<TableCell key={action} className="px-2 py-2.5 text-center">
									<Checkbox
										label={`Clusters: ${ACTION_LABELS[action]}`}
										checked={clusterRow[action]}
										disabled={clustersLocked}
										onChange={(checked) =>
											updateClusters({ ...clusterRow, [action]: checked }, access as EditableAccess)}
									/>
								</TableCell>
							))}
						</TableRow>
					</TableBody>
				</Table>
				<ul className="mt-2 space-y-1 text-xs text-muted-foreground">
					<li>
						Role permissions also control membership: Create allows adding members and inviting people; Delete allows
						removing members.
					</li>
					<li>Cluster Update also allows running operations.</li>
				</ul>
			</section>

			<section aria-labelledby="role-cluster-access-heading" className="space-y-2">
				<h3 id="role-cluster-access-heading" className="font-medium text-foreground">Cluster access</h3>
				{isCustom
					? (
						<p className="text-sm text-muted-foreground">
							This role sets permissions cluster by cluster in a way this form can’t show. Edit them in Advanced JSON.
						</p>
					)
					: (
						<>
							<div className="max-w-xs">
								<Select
									value={access.scope}
									disabled={disabled}
									onValueChange={(scope) =>
										updateClusters(
											clusterRow,
											scope === 'selected' ? { scope: 'selected', clusterIds: [] } : { scope: 'all' },
										)}
								>
									<SelectTrigger className="w-full" aria-labelledby="role-cluster-access-heading">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All clusters</SelectItem>
										<SelectItem value="selected">Selected clusters</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<p className="text-xs text-muted-foreground">
								{access.scope === 'selected'
									? 'View, Update and Delete apply only to the clusters chosen here. Create always applies to the whole organization.'
									: 'The Clusters permissions apply to every cluster in the organization.'}
							</p>
							{access.scope === 'selected' && (
								listedClusters.length === 0
									? <p className="text-sm text-muted-foreground">This organization has no clusters yet.</p>
									: (
										<ul className="grid gap-2 pt-1 sm:grid-cols-2">
											{listedClusters.map((cluster) => (
												<li key={cluster.id}>
													<label className="flex items-center gap-2 text-sm">
														<Checkbox
															checked={selectedIds.includes(cluster.id)}
															disabled={disabled}
															onChange={(checked) =>
																updateClusters(clusterRow, {
																	scope: 'selected',
																	clusterIds: checked
																		? [...selectedIds, cluster.id]
																		: selectedIds.filter((id) => id !== cluster.id),
																})}
														/>
														{cluster.name ?? cluster.id}
														{deletedClusterStatuses.includes(cluster.status ?? '') && (
															<span className="text-muted-foreground">(deleted)</span>
														)}
													</label>
												</li>
											))}
										</ul>
									)
							)}
						</>
					)}
			</section>
		</div>
	);
}

/**
 * A role's permissions as a form, or as the JSON central manager stores. Both edit the same value; JSON that
 * doesn't parse or describe a role keeps you on that tab and is reported through `onValidChange`.
 */
export function RolePermissionsEditor(
	{ value, onChange, clusters, disabled = false, onValidChange }: {
		value: RolePermissions;
		onChange: (value: RolePermissions) => void;
		clusters: Array<{ id: string; name?: string; status?: string }>;
		disabled?: boolean;
		onValidChange?: (valid: boolean) => void;
	},
) {
	const monacoTheme = useMonacoTheme();
	const [tab, setTab] = useState<'form' | 'json'>('form');
	const [jsonText, setJsonText] = useState(() => toJson(value));
	const [jsonError, setJsonError] = useState<string | null>(null);
	// Remounting the form re-reads cluster access from whatever the JSON tab left behind.
	const [formVersion, setFormVersion] = useState(0);
	const formPanelRef = useRef<HTMLDivElement>(null);
	// The JSON tab takes the form's height, so switching tabs doesn't move the dialog's footer.
	const [jsonPanelHeight, setJsonPanelHeight] = useState<number>();

	const onTabChange = (next: string) => {
		if (next === 'json') {
			setJsonPanelHeight(formPanelRef.current?.offsetHeight);
			setJsonText(toJson(value));
			setJsonError(null);
			setTab('json');
		} else if (!jsonError) {
			setFormVersion((version) => version + 1);
			setTab('form');
		}
	};

	const onJsonChange = (text: string | undefined) => {
		const next = text ?? '';
		setJsonText(next);
		const parsed = parsePermissionsJson(next);
		setJsonError(parsed.ok ? null : parsed.error);
		onValidChange?.(parsed.ok);
		if (parsed.ok) { onChange(parsed.permissions); }
	};

	return (
		<Tabs value={tab} onValueChange={onTabChange}>
			<TabsList className="p-0.5 text-sm dark:bg-gray-800">
				<TabsTrigger value="form" className="px-3 py-0.5">Permissions</TabsTrigger>
				<TabsTrigger value="json" className="px-3 py-0.5">Advanced JSON</TabsTrigger>
			</TabsList>
			<TabsContent value="form" ref={formPanelRef} className="pt-2">
				<PermissionsForm key={formVersion} value={value} onChange={onChange} clusters={clusters} disabled={disabled} />
			</TabsContent>
			<TabsContent value="json" style={{ height: jsonPanelHeight }} className="flex min-h-80 flex-none flex-col pt-2">
				<div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
					<Editor
						className="h-full w-full"
						theme={monacoTheme}
						defaultLanguage="json"
						value={jsonText}
						onChange={onJsonChange}
						options={{ readOnly: disabled, automaticLayout: true, minimap: { enabled: false } }}
					/>
				</div>
				{jsonError && (
					<p role="alert" className="mt-2 text-sm text-red-500">
						{jsonError} Fix it to save or to go back to Permissions.
					</p>
				)}
			</TabsContent>
		</Tabs>
	);
}
