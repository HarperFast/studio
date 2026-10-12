import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	InstanceDatabaseMap,
	InstanceTable,
	LocalRoleAttributePermissionAction,
	LocalRoleAttributePermissionTable,
	LocalRolePermission,
	LocalRolePermissionAction,
	LocalRolePermissionTable,
} from '@/integrations/api/api.patch';
import {
	classifyOperationsValue,
	getDatabasePermissionRecord,
	orderPermissionKeys,
	RESERVED_PERMISSION_KEYS,
} from '@/integrations/api/localRolePermission';
import { compareVersions } from '@/lib/string/wasAReleasedBeforeB';

/**
 * Every edit here is a copy-on-write patch of only the keys it touches, so content the visual editor
 * does not model survives a round-trip (see the roles DESIGN.md). Harper rules are traced to 5.3.1's
 * `validation/role_validation.ts` and `security/permissionsTranslator.js`.
 */

export const TABLE_ACTIONS: readonly LocalRolePermissionAction[] = ['read', 'insert', 'update', 'delete'];
export const ATTRIBUTE_ACTIONS: readonly LocalRoleAttributePermissionAction[] = ['read', 'insert', 'update'];

/** permissionsTranslator applies only `read` to these, whatever the entry says. */
const TIMESTAMP_ATTRIBUTES: ReadonlySet<string> = new Set(['__createdtime__', '__updatedtime__']);
const TABLE_ENTRY_KEYS: ReadonlySet<string> = new Set([...TABLE_ACTIONS, 'attribute_permissions']);
const ATTRIBUTE_ENTRY_KEYS: ReadonlySet<string> = new Set(['attribute_name', ...ATTRIBUTE_ACTIONS]);

export type RoleType = 'standard' | 'super_user' | 'cluster_user';

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Every key below may be a database, table or attribute name, and Harper permits `__proto__` for
// all three — so reads use hasOwn and writes rebuild with Object.fromEntries, never assignment.
function ownValue(record: PlainRecord, key: string): unknown {
	return Object.hasOwn(record, key) ? record[key] : undefined;
}

function withKey<T extends object>(record: T, key: string, value: unknown): T {
	let replaced = false;
	const entries = Object.entries(record).map(([existingKey, existing]): [string, unknown] => {
		if (existingKey === key) {
			replaced = true;
			return [existingKey, value];
		}
		return [existingKey, existing];
	});
	if (!replaced) {
		entries.push([key, value]);
	}
	return Object.fromEntries(entries) as T;
}

function withoutKeys<T extends object>(record: T, keys: ReadonlySet<string>): T {
	return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key))) as T;
}

/** The parsed permission document, or null when the text is not a JSON object. */
export function parseRolePermissionText(text: string | undefined): LocalRolePermission | null {
	if (!text) {
		return null;
	}
	try {
		// Not safeParse: it console.errors, and mid-edit text is invalid on most keystrokes.
		const parsed: unknown = JSON.parse(text);
		return isPlainRecord(parsed) ? parsed as LocalRolePermission : null;
	} catch {
		return null;
	}
}

export function serializeRolePermission(permission: LocalRolePermission): string {
	return JSON.stringify(orderPermissionKeys(permission), null, 2);
}

/**
 * Databases the editor offers, in describe_all order. A database named like a reserved permission
 * key cannot be granted in role JSON, except `operations` below the allowlist floor, where Harper
 * reserves nothing by that name.
 */
export function getEditableDatabaseNames(instanceDatabaseMap: InstanceDatabaseMap, version: string): string[] {
	const allowlistSupported = supportsOperationsAllowlist(version);
	return Object.keys(instanceDatabaseMap).filter((name) =>
		!RESERVED_PERMISSION_KEYS.has(name) || (name === 'operations' && !allowlistSupported)
	);
}

export function getTablePrimaryKey(table: InstanceTable): string | undefined {
	return table.primary_key ?? table.hash_attribute
		?? table.attributes?.find((attribute) => attribute.is_primary_key)?.attribute;
}

export function getTableAttributeNames(table: InstanceTable): string[] {
	return (table.attributes ?? []).map((attribute) => attribute.attribute);
}

/** Keys of the document that name databases rather than role flags or the allowlist. */
function getDatabaseKeys(permission: LocalRolePermission, allowlistSupported: boolean): string[] {
	return Object.keys(permission).filter((key) =>
		!RESERVED_PERMISSION_KEYS.has(key)
		|| (key === 'operations' && getDatabasePermissionRecord(permission, key, allowlistSupported) !== undefined)
	);
}

/**
 * Why the visual editor cannot show this document, or an empty list when it can. Anything listed
 * here is a shape the GUI could only render by guessing or would rewrite on its first edit, so the
 * JSON view stays authoritative until it is fixed. Most are shapes Harper's role validation
 * rejects anyway (`role_validation.ts` — flag types, table CRUD booleans, attribute_permissions
 * array-or-null, attribute entry shape); the operations kinds are the ones the existing notice
 * explains.
 */
export function getVisualEditorBlockers(
	permission: LocalRolePermission,
	instanceDatabaseMap: InstanceDatabaseMap,
	version: string,
): string[] {
	if (isLegacyRoleFormat(version)) {
		return ['This Harper version uses the role format from before 2.2, which only the JSON editor supports.'];
	}
	const blockers: string[] = [];
	const allowlistSupported = supportsOperationsAllowlist(version);
	for (const flag of ['super_user', 'cluster_user'] as const) {
		if (Object.hasOwn(permission, flag) && typeof permission[flag] !== 'boolean') {
			blockers.push(`"${flag}" must be true or false.`);
		}
	}
	if (permission.super_user === true && permission.cluster_user === true) {
		blockers.push('"super_user" and "cluster_user" cannot both be true.');
	}
	const structureUser = permission.structure_user;
	if (
		structureUser !== undefined && typeof structureUser !== 'boolean'
		&& !(Array.isArray(structureUser) && structureUser.every((name) => typeof name === 'string'))
	) {
		blockers.push('"structure_user" must be true, false, or a list of database names.');
	}
	const operationsKind = classifyOperationsValue(permission, allowlistSupported);
	if (operationsKind === 'breaks-auth' || operationsKind === 'malformed') {
		blockers.push('"operations" is not a list of operation names.');
	}

	for (const databaseName of getEditableDatabaseNames(instanceDatabaseMap, version)) {
		if (!Object.hasOwn(permission, databaseName)) {
			continue;
		}
		const record = permission[databaseName];
		if (!isPlainRecord(record)) {
			blockers.push(`The entry for database "${databaseName}" is not an object.`);
			continue;
		}
		const tables = ownValue(record, 'tables');
		if (tables === undefined) {
			continue;
		}
		if (!isPlainRecord(tables)) {
			blockers.push(`"${databaseName}.tables" is not an object.`);
			continue;
		}
		for (const tableName of Object.keys(instanceDatabaseMap[databaseName])) {
			const entry = ownValue(tables, tableName);
			if (entry !== undefined) {
				blockers.push(...getTableEntryBlockers(entry, `${databaseName}.${tableName}`));
			}
		}
	}
	return [...new Set(blockers)];
}

function getTableEntryBlockers(entry: unknown, label: string): string[] {
	if (!isPlainRecord(entry)) {
		return [`The entry for table "${label}" is not an object.`];
	}
	if (Object.hasOwn(entry, 'attribute_restrictions')) {
		return [`"${label}" uses "attribute_restrictions", the role format from before Harper 2.2.`];
	}
	const blockers: string[] = [];
	const nonBoolean = TABLE_ACTIONS.filter((action) => typeof entry[action] !== 'boolean');
	if (nonBoolean.length) {
		blockers.push(`"${label}": ${nonBoolean.join(', ')} must each be true or false.`);
	}
	const attributePermissions = ownValue(entry, 'attribute_permissions');
	if (attributePermissions === null) {
		return blockers;
	}
	if (attributePermissions === undefined) {
		blockers.push(
			`"${label}" needs an "attribute_permissions" list ([] applies the table's access to every attribute).`,
		);
		return blockers;
	}
	if (!Array.isArray(attributePermissions)) {
		blockers.push(`"${label}.attribute_permissions" must be a list.`);
		return blockers;
	}
	const seen = new Set<string>();
	for (const attributeEntry of attributePermissions) {
		if (!isPlainRecord(attributeEntry) || typeof attributeEntry.attribute_name !== 'string') {
			blockers.push(`"${label}.attribute_permissions" has an entry without an attribute_name.`);
			continue;
		}
		const name = attributeEntry.attribute_name;
		if (seen.has(name)) {
			blockers.push(`"${label}.attribute_permissions" lists "${name}" more than once.`);
		}
		seen.add(name);
		if (ATTRIBUTE_ACTIONS.some((action) => typeof attributeEntry[action] !== 'boolean')) {
			blockers.push(`"${label}.attribute_permissions": "${name}" needs read, insert and update set to true or false.`);
		}
	}
	return blockers;
}

function isLegacyRoleFormat(version: string): boolean {
	// compareVersions orders an unparseable version below everything; only a real pre-2.2 is legacy.
	return compareVersions(version, '0.0.0') >= 0 && compareVersions(version, '2.2.0') < 0;
}

export interface PreservedEntries {
	/** Databases and tables the role names that this instance's describe_all does not list. */
	notInSchema: string[];
	/** Other content the GUI does not render; kept exactly as it is. */
	notShown: string[];
}

/**
 * What the document holds that the visual editor does not render. `notInSchema` is separated
 * because Harper's role validation rejects a role naming a database or table that does not exist
 * (`role_validation.ts` SCHEMA_NOT_FOUND / TABLE_NOT_FOUND), so Harper refuses a save until they are
 * removed. The editor warns and offers to remove them but does not block Save: describe_all is
 * cached, so a database created a moment ago can read as missing here.
 * Attribute entries the schema does not list are only "not shown": describe_all omits `@computed`
 * attributes unless asked for them, so a missing name may well be a real attribute.
 */
export function getPreservedEntries(
	permission: LocalRolePermission,
	instanceDatabaseMap: InstanceDatabaseMap,
	version: string,
): PreservedEntries {
	const allowlistSupported = supportsOperationsAllowlist(version);
	const editable = new Set(getEditableDatabaseNames(instanceDatabaseMap, version));
	const notInSchema: string[] = [];
	const notShown: string[] = [];

	if (Array.isArray(permission.structure_user)) {
		for (const name of permission.structure_user) {
			if (!editable.has(name)) {
				notInSchema.push(`structure_user database "${name}"`);
			}
		}
	}
	if (
		!allowlistSupported && permission.operations !== undefined
		&& !getDatabaseKeys(permission, false).includes('operations')
	) {
		notShown.push('"operations" (has no effect before Harper 5.0)');
	}

	for (const databaseName of getDatabaseKeys(permission, allowlistSupported)) {
		if (!editable.has(databaseName)) {
			notInSchema.push(`database "${databaseName}"`);
			continue;
		}
		const record = permission[databaseName];
		if (!isPlainRecord(record)) {
			continue;
		}
		for (const key of Object.keys(record)) {
			if (key !== 'tables') {
				notShown.push(`"${databaseName}.${key}"`);
			}
		}
		const tables = ownValue(record, 'tables');
		if (!isPlainRecord(tables)) {
			continue;
		}
		const schemaTables = instanceDatabaseMap[databaseName];
		for (const tableName of Object.keys(tables)) {
			const schemaTable = Object.hasOwn(schemaTables, tableName) ? schemaTables[tableName] : undefined;
			if (!schemaTable) {
				notInSchema.push(`table "${databaseName}.${tableName}"`);
				continue;
			}
			const entry = tables[tableName];
			if (!isPlainRecord(entry)) {
				continue;
			}
			const label = `${databaseName}.${tableName}`;
			for (const key of Object.keys(entry)) {
				if (!TABLE_ENTRY_KEYS.has(key)) {
					notShown.push(`"${label}.${key}"`);
				}
			}
			const attributePermissions = ownValue(entry, 'attribute_permissions');
			if (!Array.isArray(attributePermissions)) {
				continue;
			}
			const schemaAttributes = new Set(getTableAttributeNames(schemaTable));
			for (const attributeEntry of attributePermissions) {
				if (!isPlainRecord(attributeEntry)) {
					continue;
				}
				const name = String(attributeEntry.attribute_name);
				if (!schemaAttributes.has(name)) {
					notShown.push(`attribute "${label}.${name}"`);
				}
				for (const key of Object.keys(attributeEntry)) {
					if (!ATTRIBUTE_ENTRY_KEYS.has(key)) {
						notShown.push(`"${key}" on attribute "${label}.${name}"`);
					}
				}
			}
		}
	}
	return { notInSchema, notShown };
}

/**
 * Removes exactly the `notInSchema` entries from getPreservedEntries: database keys and table keys
 * the schema does not list, and structure_user names that are not databases here.
 */
export function removeEntriesNotInSchema(
	permission: LocalRolePermission,
	instanceDatabaseMap: InstanceDatabaseMap,
	version: string,
): LocalRolePermission {
	const allowlistSupported = supportsOperationsAllowlist(version);
	const editable = new Set(getEditableDatabaseNames(instanceDatabaseMap, version));
	const missingDatabases = new Set(
		getDatabaseKeys(permission, allowlistSupported).filter((name) => !editable.has(name)),
	);
	let next = withoutKeys(permission, missingDatabases);
	if (Array.isArray(next.structure_user)) {
		next = withKey(next, 'structure_user', next.structure_user.filter((name) => editable.has(name)));
	}
	for (const databaseName of editable) {
		const record = ownValue(next, databaseName);
		const tables = isPlainRecord(record) ? ownValue(record, 'tables') : undefined;
		if (!isPlainRecord(record) || !isPlainRecord(tables)) {
			continue;
		}
		const schemaTables = instanceDatabaseMap[databaseName];
		const missingTables = new Set(Object.keys(tables).filter((name) => !Object.hasOwn(schemaTables, name)));
		if (missingTables.size) {
			next = withKey(next, databaseName, withKey(record, 'tables', withoutKeys(tables, missingTables)));
		}
	}
	return next;
}

export function getRoleType(permission: LocalRolePermission): RoleType {
	if (permission.super_user === true) {
		return 'super_user';
	}
	return permission.cluster_user === true ? 'cluster_user' : 'standard';
}

/**
 * Sets the exclusive role flag. A flag being turned off is written as `false` only where the key
 * already exists, so a document that never carried it does not grow one. Everything else stays in
 * the document until save, where preparePermissionForSave drops what Harper refuses alongside
 * super_user/cluster_user — so flipping the type back within a session loses nothing.
 */
export function setRoleType(permission: LocalRolePermission, roleType: RoleType): LocalRolePermission {
	let next = permission;
	for (const flag of ['super_user', 'cluster_user'] as const) {
		if (roleType === flag) {
			next = withKey(next, flag, true);
		} else if (Object.hasOwn(next, flag)) {
			next = withKey(next, flag, false);
		}
	}
	return orderPermissionKeys(next);
}

export function setStructureUser(permission: LocalRolePermission, value: boolean | string[]): LocalRolePermission {
	if (value === false && !Object.hasOwn(permission, 'structure_user')) {
		return permission;
	}
	return orderPermissionKeys(withKey(permission, 'structure_user', value));
}

/**
 * The document's record for a database, typed loosely on purpose: it may carry keys beside
 * `tables` (Harper's translator honours `describe`), and every one of them is carried over.
 */
export function getDatabaseRecord(permission: LocalRolePermission, databaseName: string): PlainRecord | undefined {
	const record = ownValue(permission, databaseName);
	return isPlainRecord(record) ? record : undefined;
}

/** A table entry within a database record, when it is in a shape the editor accepts. */
export function getTableEntryInRecord(
	record: PlainRecord | undefined,
	tableName: string,
): LocalRolePermissionTable | undefined {
	const tables = record && ownValue(record, 'tables');
	const entry = isPlainRecord(tables) ? ownValue(tables, tableName) : undefined;
	return isPlainRecord(entry) ? entry as unknown as LocalRolePermissionTable : undefined;
}

export function getTableEntry(
	permission: LocalRolePermission,
	databaseName: string,
	tableName: string,
): LocalRolePermissionTable | undefined {
	return getTableEntryInRecord(getDatabaseRecord(permission, databaseName), tableName);
}

export function isTableScopedToAttributes(entry: LocalRolePermissionTable | undefined): boolean {
	// permissionsTranslator scopes only on a non-empty array; `[]` and `null` both mean "every attribute".
	const attributePermissions = entry?.attribute_permissions;
	return Array.isArray(attributePermissions) && attributePermissions.length > 0;
}

function newTableEntry(): LocalRolePermissionTable {
	return { read: false, insert: false, update: false, delete: false, attribute_permissions: [] };
}

function withTableEntry(
	permission: LocalRolePermission,
	databaseName: string,
	tableName: string,
	entry: LocalRolePermissionTable,
): LocalRolePermission {
	const record = ownValue(permission, databaseName);
	const base = isPlainRecord(record) ? record : {};
	const tables = ownValue(base, 'tables');
	const nextTables = withKey(isPlainRecord(tables) ? tables : {}, tableName, entry);
	return withKey(permission, databaseName, withKey(base, 'tables', nextTables));
}

/**
 * The entry with one table action set. Turning a read/insert/update off also turns it off on every
 * attribute entry, because role validation rejects an attribute granting what its table does not
 * (MISMATCHED_TABLE_ATTR_PERMS).
 */
function withTableAction(
	entry: LocalRolePermissionTable,
	action: LocalRolePermissionAction,
	value: boolean,
): LocalRolePermissionTable {
	const next = { ...entry, [action]: value };
	if (!value && action !== 'delete' && Array.isArray(entry.attribute_permissions)) {
		next.attribute_permissions = entry.attribute_permissions.map((attribute) =>
			attribute[action] ? { ...attribute, [action]: false } : attribute
		);
	}
	return next;
}

export function setTableAction(
	permission: LocalRolePermission,
	databaseName: string,
	tableName: string,
	action: LocalRolePermissionAction,
	value: boolean,
): LocalRolePermission {
	const entry = getTableEntry(permission, databaseName, tableName);
	if (!entry && !value) {
		// A table the role does not mention already has no access (permissionsTranslator).
		return permission;
	}
	return withTableEntry(permission, databaseName, tableName, withTableAction(entry ?? newTableEntry(), action, value));
}

/** Sets one action on every listed table of a database in a single rebuild. */
export function setDatabaseAction(
	permission: LocalRolePermission,
	databaseName: string,
	tableNames: string[],
	action: LocalRolePermissionAction,
	value: boolean,
): LocalRolePermission {
	const record = ownValue(permission, databaseName);
	const base = isPlainRecord(record) ? record : {};
	const tables = ownValue(base, 'tables');
	const existing = isPlainRecord(tables) ? tables : {};
	const pending = new Map<string, LocalRolePermissionTable>();
	for (const tableName of tableNames) {
		const entry = getTableEntry(permission, databaseName, tableName);
		if (entry || value) {
			pending.set(tableName, withTableAction(entry ?? newTableEntry(), action, value));
		}
	}
	if (!pending.size) {
		return permission;
	}
	const entries = Object.entries(existing).map(([name, entry]): [string, unknown] => {
		const replacement = pending.get(name);
		pending.delete(name);
		return [name, replacement ?? entry];
	});
	entries.push(...pending.entries());
	return withKey(permission, databaseName, withKey(base, 'tables', Object.fromEntries(entries)));
}

export interface AttributeView {
	name: string;
	read: boolean;
	insert: boolean;
	update: boolean;
	isPrimaryKey: boolean;
	/** Only read applies (permissionsTranslator replaces the entry with a read-only one). */
	isTimestamp: boolean;
	/** An unlisted primary key, whose access Harper derives from the listed attributes. */
	derived: boolean;
}

/**
 * Effective attribute access for a scoped table, as permissionsTranslator's getTableAttrPerms
 * computes it: listed attributes as listed, unlisted ones get nothing, except an unlisted primary
 * key, which gets each action any listed attribute has.
 */
export function getAttributeViews(
	entry: LocalRolePermissionTable,
	attributeNames: string[],
	primaryKey: string | undefined,
): AttributeView[] {
	const listed = new Map(
		(entry.attribute_permissions ?? []).map((attribute) => [attribute.attribute_name, attribute]),
	);
	const effective = (name: string, attribute: LocalRoleAttributePermissionTable | undefined) => {
		const timestamp = TIMESTAMP_ATTRIBUTES.has(name);
		return {
			read: attribute?.read === true,
			insert: !timestamp && attribute?.insert === true,
			update: !timestamp && attribute?.update === true,
		};
	};
	// Every listed attribute counts, including ones describe_all does not show (`@computed`, or
	// relationships on 5.x): Harper only stores an entry for an attribute its schema has.
	const derivedPrimaryKey = { read: false, insert: false, update: false };
	for (const [name, attribute] of listed) {
		if (name !== primaryKey) {
			const access = effective(name, attribute);
			for (const action of ATTRIBUTE_ACTIONS) {
				derivedPrimaryKey[action] ||= access[action];
			}
		}
	}
	return attributeNames.map((name) => {
		const attribute = listed.get(name);
		const isPrimaryKey = name === primaryKey;
		const derived = isPrimaryKey && !attribute;
		return {
			name,
			...(derived ? derivedPrimaryKey : effective(name, attribute)),
			isPrimaryKey,
			isTimestamp: TIMESTAMP_ATTRIBUTES.has(name),
			derived,
		};
	});
}

/**
 * Turns attribute scoping on or off for one table. Turning it on lists every attribute in
 * `attributeNames` with the table's own read/insert/update, so their access does not change at the
 * moment of switching. An attribute describe_all omits (`@computed`, a relationship) is not listed
 * and loses access until granted in the JSON, as do attributes added to the table later. Turning it
 * off writes `[]`; `restore` brings back a list the author turned off this session, less any action
 * the table has lost since, which role validation would reject on the attribute.
 */
export function setAttributeScoping(
	permission: LocalRolePermission,
	databaseName: string,
	tableName: string,
	scoped: boolean,
	attributeNames: string[],
	restore?: LocalRoleAttributePermissionTable[],
): LocalRolePermission {
	const entry = getTableEntry(permission, databaseName, tableName) ?? newTableEntry();
	const attributePermissions = scoped
		? restore?.length
			? restore.map((attribute) => ({
				...attribute,
				read: attribute.read && entry.read,
				insert: attribute.insert && entry.insert,
				update: attribute.update && entry.update,
			}))
			: attributeNames.map((name) => ({
				attribute_name: name,
				read: entry.read,
				insert: TIMESTAMP_ATTRIBUTES.has(name) ? false : entry.insert,
				update: TIMESTAMP_ATTRIBUTES.has(name) ? false : entry.update,
			}))
		: [];
	return withTableEntry(permission, databaseName, tableName, { ...entry, attribute_permissions: attributePermissions });
}

/**
 * Sets one action on one attribute of a scoped table. An unlisted attribute is added with its
 * effective access first (so a derived primary key keeps what it had), and granting an action the
 * table lacks also grants it on the table, which role validation requires.
 */
export function setAttributeAction(
	permission: LocalRolePermission,
	databaseName: string,
	tableName: string,
	attributeNames: string[],
	primaryKey: string | undefined,
	attributeName: string,
	action: LocalRoleAttributePermissionAction,
	value: boolean,
): LocalRolePermission {
	const entry = getTableEntry(permission, databaseName, tableName);
	if (!entry || !Array.isArray(entry.attribute_permissions)) {
		return permission;
	}
	const list = entry.attribute_permissions;
	const index = list.findIndex((attribute) => attribute.attribute_name === attributeName);
	let nextList: LocalRoleAttributePermissionTable[];
	if (index >= 0) {
		nextList = list.map((attribute, position) => position === index ? { ...attribute, [action]: value } : attribute);
	} else {
		const view = getAttributeViews(entry, attributeNames, primaryKey).find((item) => item.name === attributeName);
		nextList = [...list, {
			attribute_name: attributeName,
			read: view?.read ?? false,
			insert: view?.insert ?? false,
			update: view?.update ?? false,
			[action]: value,
		}];
	}
	const nextEntry = {
		...entry,
		attribute_permissions: nextList,
		...(value && !entry[action] ? { [action]: true } : {}),
	};
	return withTableEntry(permission, databaseName, tableName, nextEntry);
}
