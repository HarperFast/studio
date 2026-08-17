import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	InstanceDatabaseMap,
	LocalLegacyRolePermissionTable,
	LocalRolePermission,
	LocalRolePermissionTable,
	LocalRoleSchemaRecord,
} from '@/integrations/api/api.patch';
import { getDatabasePermissionRecord, RESERVED_PERMISSION_KEYS } from '@/integrations/api/localRolePermission';
import { keyBy } from '@/lib/keyBy';

export function calculateDefaultPermissions({
	instanceDatabaseMap,
	currentRolePermissions,
	version,
	showAttributes,
}: {
	instanceDatabaseMap: InstanceDatabaseMap;
	currentRolePermissions: LocalRolePermission;
	version: string;
	showAttributes: boolean;
}): LocalRolePermission {
	const permissionStructure: LocalRolePermission = {
		...currentRolePermissions,
	};
	if (
		currentRolePermissions.super_user || currentRolePermissions.structure_user || currentRolePermissions.cluster_user
	) {
		return currentRolePermissions;
	}
	const [major, minor, patch] = version.split('.').map(number => parseInt(number, 10));
	const legacy = version !== '2.0.000' && major <= 2 && minor <= 1 && patch <= 2;

	// Plain assignment of a `__proto__` key would hit the prototype setter rather than create an own
	// property, so the database would vanish from the template. Harper permits the name, so define
	// the property instead of dropping the database.
	const setDatabase = (name: string, record: LocalRoleSchemaRecord) => {
		Object.defineProperty(permissionStructure, name, {
			value: record,
			writable: true,
			enumerable: true,
			configurable: true,
		});
		return record;
	};

	for (const databaseName in instanceDatabaseMap) {
		if (
			RESERVED_PERMISSION_KEYS.has(databaseName)
			&& (databaseName !== 'operations' || supportsOperationsAllowlist(version))
		) {
			// A database named like a reserved permission key cannot be expressed in role JSON —
			// writing it here would clobber the reserved value (e.g. a 5.0+ operations allowlist).
			// Pre-5.0 Harper has no reserved `operations`, so there a database by that name is real.
			continue;
		}
		const databaseRecord = setDatabase(databaseName, { tables: {} });
		const extantDatabasePermissions = currentRolePermissions
			&& getDatabasePermissionRecord(currentRolePermissions, databaseName);
		for (const tableName in instanceDatabaseMap[databaseName]) {
			const thisTable = instanceDatabaseMap[databaseName][tableName];
			const attributes = thisTable.attributes.map((a) => a.attribute).sort();
			const extantTablePermissions = extantDatabasePermissions
				&& extantDatabasePermissions.tables?.[tableName];
			if (legacy) {
				databaseRecord.tables[tableName] = buildLegacy(
					extantTablePermissions as LocalLegacyRolePermissionTable,
					attributes,
					showAttributes,
				);
			} else {
				databaseRecord.tables[tableName] = buildCurrent(
					extantTablePermissions as LocalRolePermissionTable,
					attributes,
					showAttributes,
				);
			}
		}
	}

	return permissionStructure;
}

function buildLegacy(
	extantTablePermissions: LocalLegacyRolePermissionTable | undefined,
	attributes: string[],
	showAttributes: boolean,
): LocalLegacyRolePermissionTable {
	const attributeRestrictionsMap = extantTablePermissions
		&& keyBy(extantTablePermissions.attribute_restrictions, 'attribute_name');
	return {
		read: extantTablePermissions ? extantTablePermissions.read : true,
		insert: extantTablePermissions ? extantTablePermissions.insert : true,
		update: extantTablePermissions ? extantTablePermissions.update : true,
		delete: extantTablePermissions ? extantTablePermissions.delete : true,
		attribute_restrictions: attributes
			.filter(() => showAttributes)
			.map((a) => {
				const extantAttributePermissions = attributeRestrictionsMap?.[a];

				return {
					attribute_name: a,
					read: extantAttributePermissions
						? extantAttributePermissions.read
						: extantTablePermissions
						? extantTablePermissions.read
						: true,
					insert: extantAttributePermissions
						? extantAttributePermissions.insert
						: extantTablePermissions
						? extantTablePermissions.insert
						: true,
					update: extantAttributePermissions
						? extantAttributePermissions.update
						: extantTablePermissions
						? extantTablePermissions.update
						: true,
					delete: extantAttributePermissions
						? extantAttributePermissions.delete
						: extantTablePermissions
						? extantTablePermissions.delete
						: true,
				};
			}),
	};
}

function buildCurrent(
	extantTablePermissions: LocalRolePermissionTable | undefined,
	attributes: string[],
	showAttributes: boolean,
): LocalRolePermissionTable {
	const attributePermissionsMap = extantTablePermissions
		&& keyBy(extantTablePermissions.attribute_permissions || [], 'attribute_name');
	return {
		read: extantTablePermissions ? extantTablePermissions.read : false,
		insert: extantTablePermissions ? extantTablePermissions.insert : false,
		update: extantTablePermissions ? extantTablePermissions.update : false,
		delete: extantTablePermissions ? extantTablePermissions.delete : false,
		attribute_permissions: showAttributes
			? attributes
				.map((a: string) => {
					const extantAttributePermissions = attributePermissionsMap?.[a];

					return {
						attribute_name: a,
						read: extantAttributePermissions
							? extantAttributePermissions.read
							: extantTablePermissions?.attribute_permissions?.length
							? false
							: extantTablePermissions?.read || false,
						insert: extantAttributePermissions
							? extantAttributePermissions.insert
							: extantTablePermissions?.attribute_permissions?.length
							? false
							: extantTablePermissions?.insert || false,
						update: extantAttributePermissions
							? extantAttributePermissions.update
							: extantTablePermissions?.attribute_permissions?.length
							? false
							: extantTablePermissions?.update || false,
					};
				})
			: null,
	};
}
