import {
	InstanceSchemaMap,
	LocalLegacyRolePermissionTable,
	LocalRolePermission,
	LocalRolePermissionTable,
} from '@/lib/api.patch';
import { keyBy } from '@/lib/keyBy';

export function calculateDefaultPermissions({
	instanceSchema,
	currentRolePermissions,
	version,
	showAttributes,
}: {
	instanceSchema: InstanceSchemaMap,
	currentRolePermissions: LocalRolePermission;
	version: string;
	showAttributes: boolean;
}): LocalRolePermission {
	const permissionStructure: LocalRolePermission = {
		...currentRolePermissions,
	};
	const [major, minor, patch] = version.split('.').map(number => parseInt(number, 10));
	const legacy = version !== '2.0.000' && major <= 2 && minor <= 1 && patch <= 2;

	for (const schema in instanceSchema) {
		permissionStructure[schema] = {
			tables: {},
		};
		for (const table in instanceSchema[schema]) {
			const thisTable = instanceSchema[schema][table];
			const attributes = thisTable.attributes.map((a) => a.attribute).sort();
			if (legacy) {
				const extantTablePermissions =
					currentRolePermissions && currentRolePermissions[schema] && currentRolePermissions[schema].tables[table];
				permissionStructure[schema].tables[table] = buildLegacy(extantTablePermissions as LocalLegacyRolePermissionTable, attributes, showAttributes);
			} else {
				const extantTablePermissions =
					currentRolePermissions && currentRolePermissions[schema] && currentRolePermissions[schema].tables[table];
				permissionStructure[schema].tables[table] = buildCurrent(extantTablePermissions as LocalRolePermissionTable, attributes, showAttributes);
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
	const attributePermissionsMap = extantTablePermissions && keyBy(extantTablePermissions.attribute_permissions, 'attribute_name');
	return {
		read: extantTablePermissions ? extantTablePermissions.read : false,
		insert: extantTablePermissions ? extantTablePermissions.insert : false,
		update: extantTablePermissions ? extantTablePermissions.update : false,
		delete: extantTablePermissions ? extantTablePermissions.delete : false,
		attribute_permissions: attributes
			.filter(() => showAttributes)
			.map((a: string) => {
				const extantAttributePermissions = attributePermissionsMap?.[a];

				return {
					attribute_name: a,
					read: extantAttributePermissions
						? extantAttributePermissions.read
						: extantTablePermissions?.attribute_permissions.length
							? false
							: extantTablePermissions?.read || false,
					insert: extantAttributePermissions
						? extantAttributePermissions.insert
						: extantTablePermissions?.attribute_permissions.length
							? false
							: extantTablePermissions?.insert || false,
					update: extantAttributePermissions
						? extantAttributePermissions.update
						: extantTablePermissions?.attribute_permissions.length
							? false
							: extantTablePermissions?.update || false,
				};
			}),
	};
}
