import {
	InstanceDatabaseMap,
	LocalLegacyRolePermissionTable,
	LocalRolePermission,
	LocalRolePermissionTable,
} from '@/lib/api.patch';
import { keyBy } from '@/lib/keyBy';

export function calculateDefaultPermissions({
	instanceDatabaseMap,
	currentRolePermissions,
	version,
	showAttributes,
}: {
	instanceDatabaseMap: InstanceDatabaseMap,
	currentRolePermissions: LocalRolePermission;
	version: string;
	showAttributes: boolean;
}): LocalRolePermission {
	const permissionStructure: LocalRolePermission = {
		...currentRolePermissions,
	};
	if (currentRolePermissions.super_user || currentRolePermissions.structure_user || currentRolePermissions.cluster_user) {
		return currentRolePermissions;
	}
	const [major, minor, patch] = version.split('.').map(number => parseInt(number, 10));
	const legacy = version !== '2.0.000' && major <= 2 && minor <= 1 && patch <= 2;

	for (const databaseName in instanceDatabaseMap) {
		permissionStructure[databaseName] = {
			tables: {},
		};
		for (const tableName in instanceDatabaseMap[databaseName]) {
			const thisTable = instanceDatabaseMap[databaseName][tableName];
			const attributes = thisTable.attributes.map((a) => a.attribute).sort();
			if (legacy) {
				const extantTablePermissions =
					currentRolePermissions && currentRolePermissions[databaseName] && currentRolePermissions[databaseName].tables[tableName];
				permissionStructure[databaseName].tables[tableName] = buildLegacy(extantTablePermissions as LocalLegacyRolePermissionTable, attributes, showAttributes);
			} else {
				const extantTablePermissions =
					currentRolePermissions && currentRolePermissions[databaseName] && currentRolePermissions[databaseName].tables[tableName];
				permissionStructure[databaseName].tables[tableName] = buildCurrent(extantTablePermissions as LocalRolePermissionTable, attributes, showAttributes);
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
	const attributeRestrictionsMap = extantTablePermissions && keyBy(extantTablePermissions.attribute_restrictions, 'attribute_name');
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
	const attributePermissionsMap = extantTablePermissions && keyBy(extantTablePermissions.attribute_permissions || [], 'attribute_name');
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
