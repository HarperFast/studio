import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { Switch } from '@/components/ui/switch';
import {
	ATTRIBUTE_ACTIONS,
	AttributeView,
	getAttributeViews,
	getDatabaseRecord,
	getEditableDatabaseNames,
	getPreservedEntries,
	getRoleType,
	getTableAttributeNames,
	getTableEntry,
	getTableEntryInRecord,
	getTablePrimaryKey,
	isTableScopedToAttributes,
	removeEntriesNotInSchema,
	RoleType,
	setAttributeAction,
	setAttributeScoping,
	setDatabaseAction,
	setRoleType,
	setStructureUser,
	setTableAction,
	TABLE_ACTIONS,
} from '@/features/instance/config/roles/editor/rolePermissionModel';
import { OperationsAllowlistEditor } from '@/features/instance/config/roles/operations/OperationsAllowlistEditor';
import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	InstanceDatabaseMap,
	InstanceDatabaseTableMap,
	InstanceTable,
	LocalRoleAttributePermissionTable,
	LocalRolePermission,
	LocalRolePermissionTable,
} from '@/integrations/api/api.patch';
import {
	getOperationsAllowlist,
	RESERVED_PERMISSION_KEYS,
	rolePreventsOperationsAllowlist,
	structureUserDdlScope,
	withOperations,
} from '@/integrations/api/localRolePermission';
import { cn } from '@/lib/cn';
import { compareVersions } from '@/lib/string/wasAReleasedBeforeB';
import { ChevronDownIcon, ChevronRightIcon, TriangleAlertIcon } from 'lucide-react';
import {
	type ComponentProps,
	Fragment,
	memo,
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

const ACTION_LABELS = { read: 'Read', insert: 'Insert', update: 'Update', delete: 'Delete' } as const;

/**
 * Renders what Harper would enforce, not only what is stored: a table the role does not mention
 * shows as no access, and a scoped table shows each attribute's effective access.
 */
export function RoleVisualEditor({
	permission,
	onChange,
	instanceDatabaseMap,
	version,
	readOnly,
}: {
	permission: LocalRolePermission;
	onChange: (next: LocalRolePermission) => void;
	instanceDatabaseMap: InstanceDatabaseMap;
	version: string;
	readOnly?: boolean;
}) {
	const roleType = getRoleType(permission);
	const structureUser = permission.structure_user;
	const operationsSupported = supportsOperationsAllowlist(version);
	const databaseNames = useMemo(
		() => getEditableDatabaseNames(instanceDatabaseMap, version),
		[instanceDatabaseMap, version],
	);
	const preserved = useMemo(
		() => getPreservedEntries(permission, instanceDatabaseMap, version),
		[permission, instanceDatabaseMap, version],
	);
	// Keyed on the serialized form so edits elsewhere keep the array identity, and with it the
	// picker's own state, stable.
	const operationsJson = JSON.stringify(getOperationsAllowlist(permission) ?? null);
	const operationsValue = useMemo(() => JSON.parse(operationsJson) as string[] | null ?? undefined, [operationsJson]);

	return (
		<div className="flex flex-col gap-6">
			{preserved.notInSchema.length > 0 && (
				<Alert variant="warning">
					<TriangleAlertIcon />
					<AlertTitle>This role names things this instance's schema doesn't have</AlertTitle>
					<AlertDescription>
						<p>
							{preserved.notInSchema.join(', ')}. Harper refuses to save a role that names a database or table that
							doesn't exist, so remove them before saving.
						</p>
						{!readOnly && (
							<Button
								type="button"
								size="sm"
								variant="defaultOutline"
								className="mt-2"
								onClick={() => onChange(removeEntriesNotInSchema(permission, instanceDatabaseMap, version))}
							>
								Remove them
							</Button>
						)}
					</AlertDescription>
				</Alert>
			)}

			<RoleTypeSection
				permission={permission}
				roleType={roleType}
				version={version}
				readOnly={readOnly}
				onChange={onChange}
			/>

			{roleType === 'standard' && (
				<StructureUserSection
					permission={permission}
					databaseNames={databaseNames}
					readOnly={readOnly}
					onChange={onChange}
				/>
			)}

			{operationsSupported && (
				<section className="flex flex-col gap-2" aria-label="Operations">
					<h3 className="text-sm font-medium">Operations</h3>
					<OperationsAllowlistEditor
						value={operationsValue}
						onChange={(next) => onChange(withOperations(permission, next))}
						version={version}
						allowlistRejected={rolePreventsOperationsAllowlist(permission)}
						structureUserDdl={structureUserDdlScope(permission)}
						disabled={readOnly}
					/>
				</section>
			)}

			{roleType === 'standard' && structureUser !== true && (
				<TablePermissionsSection
					permission={permission}
					instanceDatabaseMap={instanceDatabaseMap}
					databaseNames={databaseNames}
					structureDatabases={Array.isArray(structureUser) ? structureUser : []}
					readOnly={readOnly}
					onChange={onChange}
				/>
			)}

			{preserved.notShown.length > 0 && (
				<p className="text-xs text-muted-foreground italic">
					Also kept as they are, but not shown here:{' '}
					{preserved.notShown.join(', ')}. Use “Edit as JSON” to see or change them.
				</p>
			)}
		</div>
	);
}

/** Whether saving will drop anything beside the role's own flag (see preparePermissionForSave). */
function carriesOtherPermissions(permission: LocalRolePermission, flag: 'super_user' | 'cluster_user'): boolean {
	return Object.keys(permission).some((key) => key !== flag && permission[key] !== false);
}

function RoleTypeSection({
	permission,
	roleType,
	version,
	readOnly,
	onChange,
}: {
	permission: LocalRolePermission;
	roleType: RoleType;
	version: string;
	readOnly?: boolean;
	onChange: (next: LocalRolePermission) => void;
}) {
	const id = useId();
	// Only Harper 4 gives this flag a meaning: it marks the user clustering connects as, and that user's
	// password is then stored reversibly encrypted (harperdb security/user.ts). Its describe_all lists
	// everything (dataLayer/schemaDescribe.js:36), but it gets no table access: the operations gate and
	// REST short-circuit only on super_user (utility/operation_authorization.js:370,499,
	// resources/Table.ts:3643). Nothing in Harper 5 reads it, so it is offered there only to a role that
	// already has it. A 5.0.0 prerelease is Harper 5; an unparseable version is not taken for Harper 4.
	const harper4 = compareVersions(version, '0.0.0') >= 0 && compareVersions(version, '5.0.0-0') < 0;
	const offerClusterUser = roleType === 'cluster_user' || harper4;
	const dropsOthers = roleType !== 'standard' && carriesOtherPermissions(permission, roleType);
	return (
		<section className="flex flex-col gap-2" aria-labelledby={`${id}-heading`}>
			<h3 id={`${id}-heading`} className="text-sm font-medium">Role type</h3>
			<RadioGroup
				value={roleType}
				onValueChange={(value) => onChange(setRoleType(permission, value as RoleType))}
				disabled={readOnly}
				aria-labelledby={`${id}-heading`}
			>
				<RadioOption id={`${id}-standard`} value="standard" label="Standard">
					Access comes from the database and table permissions below.
				</RadioOption>
				<RadioOption id={`${id}-super`} value="super_user" label="Super user">
					Bypasses per-table permissions.
				</RadioOption>
				{offerClusterUser && (
					<RadioOption id={`${id}-cluster`} value="cluster_user" label="Cluster user">
						{harper4
							? 'For the user that connects cluster nodes. A user with this role can list every database, table and attribute, and Harper keeps its password in a recoverable form so clustering can use it.'
							: "Harper 5 doesn't use this role type. Harper 4 used it for the user that connects cluster nodes."}
					</RadioOption>
				)}
			</RadioGroup>
			{dropsOthers && (
				<p className="text-xs text-warning">
					Saving keeps only the <span className="font-mono">{roleType}</span> flag: Harper rejects a{' '}
					{roleType === 'super_user' ? 'super user' : 'cluster user'}{' '}
					role that carries any other permission, so this role's other settings are removed.
				</p>
			)}
		</section>
	);
}

function RadioOption({ id, value, label, children }: { id: string; value: string; label: string; children: string }) {
	return (
		<div className="flex items-start gap-2">
			<RadioGroupItem id={id} value={value} className="mt-0.5" />
			<Label htmlFor={id} className="flex flex-col items-start gap-1 font-normal">
				<span className="font-medium">{label}</span>
				<span className="text-xs text-muted-foreground">{children}</span>
			</Label>
		</div>
	);
}

function StructureUserSection({
	permission,
	databaseNames,
	readOnly,
	onChange,
}: {
	permission: LocalRolePermission;
	databaseNames: string[];
	readOnly?: boolean;
	onChange: (next: LocalRolePermission) => void;
}) {
	const id = useId();
	const structureUser = permission.structure_user;
	const mode = structureUser === true ? 'all' : Array.isArray(structureUser) ? 'selected' : 'off';
	const selected = Array.isArray(structureUser) ? structureUser : [];
	// Lets "Selected databases" → another mode → back restore the picks instead of starting empty.
	const lastSelectionRef = useRef<string[]>(selected);
	const listed = [...databaseNames, ...selected.filter((name) => !databaseNames.includes(name))];
	const hasTablePermissions = Object.keys(permission).some((key) => !RESERVED_PERMISSION_KEYS.has(key));

	const onModeChange = (next: string) => {
		if (Array.isArray(structureUser)) {
			lastSelectionRef.current = structureUser;
		}
		onChange(
			setStructureUser(permission, next === 'all' ? true : next === 'selected' ? lastSelectionRef.current : false),
		);
	};
	const toggleDatabase = (name: string) => {
		onChange(setStructureUser(
			permission,
			selected.includes(name) ? selected.filter((entry) => entry !== name) : [...selected, name],
		));
	};

	return (
		<section className="flex flex-col gap-2" aria-labelledby={`${id}-heading`}>
			<h3 id={`${id}-heading`} className="text-sm font-medium">Structure user</h3>
			<RadioGroup value={mode} onValueChange={onModeChange} disabled={readOnly} aria-labelledby={`${id}-heading`}>
				<RadioOption id={`${id}-off`} value="off" label="No">
					Creating and dropping databases, tables and attributes needs super user, or an operations list that grants it.
				</RadioOption>
				<RadioOption id={`${id}-all`} value="all" label="All databases">
					Can create and drop databases, tables and attributes, and can read, insert, update and delete in every table.
				</RadioOption>
				<RadioOption id={`${id}-selected`} value="selected" label="Selected databases">
					Can create and drop tables and attributes in the selected databases, and can read, insert, update and delete
					in their tables. Creating and dropping databases isn't included.
				</RadioOption>
			</RadioGroup>
			{mode !== 'off' && permission.operations !== undefined && (
				<p className="text-xs text-muted-foreground">The operations list below can still deny some of these.</p>
			)}
			{mode === 'all' && hasTablePermissions && (
				<p className="text-xs text-warning">
					Per-table permissions don't apply to this role, so they are removed when you save.
				</p>
			)}
			{mode === 'selected' && (
				<div className="ml-6 flex flex-col gap-1">
					{listed.length === 0 && <p className="text-xs text-muted-foreground">This instance has no databases.</p>}
					{listed.map((name) => (
						<Label key={name} className="flex items-center gap-2 font-normal">
							<PermissionCheckbox
								checked={selected.includes(name)}
								onChange={() => toggleDatabase(name)}
								disabled={readOnly}
								aria-label={`Structure user on ${name}`}
							/>
							<span className="font-mono text-xs">{name}</span>
							{!databaseNames.includes(name) && (
								<span className="text-xs text-muted-foreground">(not in this instance's schema)</span>
							)}
						</Label>
					))}
				</div>
			)}
		</section>
	);
}

type PermissionPatch = (permission: LocalRolePermission) => LocalRolePermission;

function TablePermissionsSection({
	permission,
	instanceDatabaseMap,
	databaseNames,
	structureDatabases,
	readOnly,
	onChange,
}: {
	permission: LocalRolePermission;
	instanceDatabaseMap: InstanceDatabaseMap;
	databaseNames: string[];
	structureDatabases: string[];
	readOnly?: boolean;
	onChange: (next: LocalRolePermission) => void;
}) {
	// One database opens, never all of them: an open database mounts its whole table grid, so a broad
	// role on a large instance would otherwise render every table before the modal appears.
	const [openDatabases, setOpenDatabases] = useState<string[]>(() => {
		const firstGranted = databaseNames.find((databaseName) =>
			Object.keys(instanceDatabaseMap[databaseName]).some((tableName) => {
				const entry = getTableEntry(permission, databaseName, tableName);
				return entry && TABLE_ACTIONS.some((action) => entry[action] === true);
			})
		);
		return [firstGranted ?? databaseNames[0]].filter((name) => name !== undefined);
	});
	// Survives turning attribute scoping off and on again within the session, like the operations
	// switch does for its allowlist.
	const scopingRestoreRef = useRef(new Map<string, LocalRoleAttributePermissionTable[]>());
	// One stable updater for every row, applied to the latest document: rows are memoized on their
	// own database record, so on a large schema an edit re-renders only the database it touched.
	const latestRef = useRef({ permission, onChange });
	latestRef.current = { permission, onChange };
	const update = useCallback((patch: PermissionPatch) => {
		latestRef.current.onChange(patch(latestRef.current.permission));
	}, []);

	return (
		<section className="flex flex-col gap-2" aria-label="Table permissions">
			<h3 className="text-sm font-medium">Table permissions</h3>
			<p className="text-xs text-muted-foreground">
				A table without a checked permission has no access. Delete always applies to whole records.
			</p>
			{databaseNames.length === 0 && <p className="text-sm text-muted-foreground">This instance has no databases.</p>}
			<Accordion type="multiple" value={openDatabases} onValueChange={setOpenDatabases} className="rounded-md border">
				{databaseNames.map((databaseName) => (
					<DatabaseSection
						key={databaseName}
						databaseName={databaseName}
						tables={instanceDatabaseMap[databaseName]}
						record={getDatabaseRecord(permission, databaseName)}
						structureScoped={structureDatabases.includes(databaseName)}
						readOnly={readOnly}
						update={update}
						scopingRestore={scopingRestoreRef.current}
					/>
				))}
			</Accordion>
		</section>
	);
}

const DatabaseSection = memo(function DatabaseSection({
	databaseName,
	tables,
	record,
	structureScoped,
	readOnly,
	update,
	scopingRestore,
}: {
	databaseName: string;
	tables: InstanceDatabaseTableMap;
	record: Record<string, unknown> | undefined;
	structureScoped: boolean;
	readOnly?: boolean;
	update: (patch: PermissionPatch) => void;
	scopingRestore: Map<string, LocalRoleAttributePermissionTable[]>;
}) {
	const tableNames = Object.keys(tables);
	const entries = tableNames.map((tableName) => getTableEntryInRecord(record, tableName));
	const grantedCount = entries.filter((entry) => entry && TABLE_ACTIONS.some((action) => entry[action] === true))
		.length;

	return (
		<AccordionItem value={databaseName} className="px-3">
			<AccordionTrigger className="py-3">
				<span className="flex flex-wrap items-baseline gap-2">
					<span className="font-mono">{databaseName}</span>
					<span className="text-xs font-normal text-muted-foreground">
						{structureScoped
							? 'full access (structure user)'
							: `${grantedCount} of ${tableNames.length} ${tableNames.length === 1 ? 'table' : 'tables'} with access`}
					</span>
				</span>
			</AccordionTrigger>
			<AccordionContent>
				{structureScoped
					? (
						<p className="text-xs text-muted-foreground">
							As a structure user on this database, the role can read, insert, update and delete in every table here, so
							per-table permissions don't apply to it.
						</p>
					)
					: tableNames.length === 0
					? <p className="text-xs text-muted-foreground">No tables.</p>
					: (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b text-xs text-muted-foreground">
										<th className="py-1 pr-2 text-left font-normal">Table</th>
										{TABLE_ACTIONS.map((action) => (
											<th key={action} className="px-2 py-1 text-center font-normal">{ACTION_LABELS[action]}</th>
										))}
										<th className="py-1 pl-2 text-left font-normal">Attributes</th>
									</tr>
								</thead>
								<tbody>
									<tr className="border-b">
										<td className="py-1 pr-2 text-xs text-muted-foreground">All tables</td>
										{TABLE_ACTIONS.map((action) => {
											const count = entries.filter((entry) => entry?.[action] === true).length;
											return (
												<td key={action} className="px-2 py-1 text-center">
													<PermissionCheckbox
														checked={count === tableNames.length}
														indeterminate={count > 0 && count < tableNames.length}
														disabled={readOnly}
														aria-label={`${ACTION_LABELS[action]} on every table in ${databaseName}`}
														onChange={() =>
															update((permission) =>
																setDatabaseAction(
																	permission,
																	databaseName,
																	tableNames,
																	action,
																	count < tableNames.length,
																)
															)}
													/>
												</td>
											);
										})}
										<td />
									</tr>
									{tableNames.map((tableName, index) => (
										<TableRows
											key={tableName}
											databaseName={databaseName}
											tableName={tableName}
											schemaTable={tables[tableName]}
											entry={entries[index]}
											readOnly={readOnly}
											update={update}
											scopingRestore={scopingRestore}
										/>
									))}
								</tbody>
							</table>
						</div>
					)}
			</AccordionContent>
		</AccordionItem>
	);
});

const TableRows = memo(function TableRows({
	databaseName,
	tableName,
	schemaTable,
	entry,
	readOnly,
	update,
	scopingRestore,
}: {
	databaseName: string;
	tableName: string;
	schemaTable: InstanceTable;
	entry: LocalRolePermissionTable | undefined;
	readOnly?: boolean;
	update: (patch: PermissionPatch) => void;
	scopingRestore: Map<string, LocalRoleAttributePermissionTable[]>;
}) {
	const attributeNames = useMemo(() => getTableAttributeNames(schemaTable), [schemaTable]);
	const primaryKey = getTablePrimaryKey(schemaTable);
	const scoped = isTableScopedToAttributes(entry);
	const [expanded, setExpanded] = useState(false);
	const label = `${databaseName}.${tableName}`;
	const views = scoped && entry ? getAttributeViews(entry, attributeNames, primaryKey) : [];
	const accessible = views.filter((view) => ATTRIBUTE_ACTIONS.some((action) => view[action])).length;
	const restoreKey = `${databaseName}\u0000${tableName}`;

	const onScopingChanged = (next: boolean) => {
		if (!next && entry?.attribute_permissions) {
			scopingRestore.set(restoreKey, entry.attribute_permissions);
		}
		update((permission) =>
			setAttributeScoping(
				permission,
				databaseName,
				tableName,
				next,
				attributeNames,
				next ? scopingRestore.get(restoreKey) : undefined,
			)
		);
	};

	return (
		<Fragment>
			<tr className="border-b last:border-0">
				<td className="py-1 pr-2 font-mono text-xs">{tableName}</td>
				{TABLE_ACTIONS.map((action) => (
					<td key={action} className="px-2 py-1 text-center">
						<PermissionCheckbox
							checked={entry?.[action] === true}
							disabled={readOnly}
							aria-label={`${ACTION_LABELS[action]} on ${label}`}
							onChange={(event) => {
								const { checked } = event.target;
								update((permission) => setTableAction(permission, databaseName, tableName, action, checked));
							}}
						/>
					</td>
				))}
				<td className="py-1 pl-2">
					<button
						type="button"
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						onClick={() => setExpanded((value) => !value)}
						aria-expanded={expanded}
						aria-label={`Attribute permissions for ${label}`}
					>
						{expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
						{scoped ? `${accessible} of ${attributeNames.length}` : 'All'}
					</button>
				</td>
			</tr>
			{expanded && (
				<tr className="border-b bg-muted/30">
					<td colSpan={TABLE_ACTIONS.length + 2} className="px-3 py-2">
						<AttributePanel
							label={label}
							scoped={scoped}
							views={views}
							disabled={readOnly || attributeNames.length === 0}
							onScopingChanged={onScopingChanged}
							onActionChanged={(attributeName, action, value) =>
								update((permission) =>
									setAttributeAction(
										permission,
										databaseName,
										tableName,
										attributeNames,
										primaryKey,
										attributeName,
										action,
										value,
									)
								)}
						/>
					</td>
				</tr>
			)}
		</Fragment>
	);
});

function AttributePanel({
	label,
	scoped,
	views,
	disabled,
	onScopingChanged,
	onActionChanged,
}: {
	label: string;
	scoped: boolean;
	views: AttributeView[];
	disabled?: boolean;
	onScopingChanged: (scoped: boolean) => void;
	onActionChanged: (attributeName: string, action: (typeof ATTRIBUTE_ACTIONS)[number], value: boolean) => void;
}) {
	const id = useId();
	const derivedKey = views.find((view) => view.derived);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Switch
					id={id}
					checked={scoped}
					onCheckedChange={onScopingChanged}
					disabled={disabled}
					aria-label={`Limit ${label} to specific attributes`}
				/>
				<Label htmlFor={id} className="font-normal">Limit to specific attributes</Label>
			</div>
			<p className="text-xs text-muted-foreground">
				{scoped
					? 'Only the access checked here applies. An attribute with nothing checked has no access, including attributes added to the table later. Computed and relationship attributes may be missing from this list; grant those in the JSON.'
					: "The table's read, insert and update apply to every attribute. Limiting lists only the attributes this instance's schema shows, which can leave out computed and relationship attributes, and those then have no access until granted in the JSON."}
			</p>
			{scoped && (
				<table className="w-full max-w-md text-xs">
					<thead>
						<tr className="text-muted-foreground">
							<th className="py-1 pr-2 text-left font-normal">Attribute</th>
							{ATTRIBUTE_ACTIONS.map((action) => (
								<th key={action} className="px-2 py-1 text-center font-normal">{ACTION_LABELS[action]}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{views.map((view) => (
							<tr key={view.name}>
								<td className="py-0.5 pr-2 font-mono">
									{view.name}
									{view.isPrimaryKey && <span className="ml-1 font-sans text-muted-foreground">(primary key)</span>}
								</td>
								{ATTRIBUTE_ACTIONS.map((action) => {
									const timestampOnlyRead = view.isTimestamp && action !== 'read';
									return (
										<td key={action} className="px-2 py-0.5 text-center">
											<PermissionCheckbox
												checked={view[action]}
												disabled={disabled || timestampOnlyRead}
												title={timestampOnlyRead ? 'Harper applies only read to this timestamp attribute.' : undefined}
												aria-label={`${ACTION_LABELS[action]} on ${label}.${view.name}`}
												onChange={(event) => onActionChanged(view.name, action, event.target.checked)}
											/>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			)}
			{scoped && derivedKey && (
				<p className="text-xs text-muted-foreground">
					The primary key <span className="font-mono">{derivedKey.name}</span>{' '}
					isn't listed, so it gets whatever access any other attribute has. Changing it here sets it explicitly.
				</p>
			)}
			{scoped && views.some((view) => view.isTimestamp) && (
				<p className="text-xs text-muted-foreground">Harper applies only read to timestamp attributes.</p>
			)}
		</div>
	);
}

/** `indeterminate` is a DOM property with no attribute behind it, so it has to be set on the node. */
function PermissionCheckbox({
	indeterminate = false,
	className,
	...props
}: ComponentProps<'input'> & { indeterminate?: boolean }) {
	const ref = useRef<HTMLInputElement>(null);
	useLayoutEffect(() => {
		if (ref.current) {
			ref.current.indeterminate = indeterminate;
		}
	}, [indeterminate]);
	return (
		<input
			ref={ref}
			type="checkbox"
			className={cn('size-4 cursor-pointer align-middle disabled:cursor-not-allowed disabled:opacity-50', className)}
			{...props}
		/>
	);
}
