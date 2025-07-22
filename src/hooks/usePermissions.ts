import { useAuth } from '@/hooks/useAuth';
import {
	LocalLegacyRolePermissionTable,
	LocalRoleAttributePermissionAction,
	LocalRolePermissionAction,
	LocalRolePermissionTable,
} from '@/lib/api.patch';
import { AuthenticatedInstanceConnection, InstanceConnectionKey } from '@/lib/authStore';

export function useInstanceManagePermission(entity: InstanceConnectionKey): boolean {
	const { user } = useAuth(entity) as AuthenticatedInstanceConnection;
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	return permission.super_user === true;
}

export function useInstanceBrowseManagePermission(entity: InstanceConnectionKey): boolean {
	const { user } = useAuth(entity) as AuthenticatedInstanceConnection;
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	return permission.super_user === true || permission.structure_user === true;
}

export function useInstanceSchemaTablePermission(entity: InstanceConnectionKey, schemaName: string, tableName: string, action: LocalRolePermissionAction): boolean {
	const { user } = useAuth(entity) as AuthenticatedInstanceConnection;
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	const specificPermission = permission[schemaName];
	return specificPermission?.tables?.[tableName][action] === true;
}

export function useInstanceSchemaTableAttributePermission(entity: InstanceConnectionKey, schemaName: string, tableName: string, attributeName: string, action: LocalRoleAttributePermissionAction): boolean {
	const { user } = useAuth(entity) as AuthenticatedInstanceConnection;
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	const specificPermission = permission[schemaName];
	if (specificPermission?.tables?.[tableName][action] === true) {
		return true;
	}
	const table = specificPermission?.tables?.[tableName];
	const attributePermission = ((table as LocalRolePermissionTable).attribute_permissions || (table as LocalLegacyRolePermissionTable).attribute_restrictions).find(a => a.attribute_name === attributeName);
	return attributePermission?.[action] === true;
}
