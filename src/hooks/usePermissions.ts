import { useAuth, useCloudAuth } from '@/hooks/useAuth';
import {
	LocalLegacyRolePermissionTable,
	LocalRoleAttributePermissionAction,
	LocalRolePermissionAction,
	LocalRolePermissionTable,
} from '@/lib/api.patch';
import { AuthenticatedInstanceConnection, InstanceConnectionKey } from '@/lib/authStore';

export function useOrganizationPermissions(orgId: string): { update: boolean; remove: boolean; } {
	const { user } = useCloudAuth();
	const role = user?.roles?.[orgId];
	if (!role?.permission && !role?.organization) {
		return { update: false, remove: false };
	}
	if (role.permission?.super_user) {
		return { update: true, remove: true };
	}
	return { update: role.organization.update, remove: role.organization.delete };
}

export function useOrganizationRolePermissions(orgId: string): {
	create: boolean;
	remove: boolean;
	update: boolean;
	view: boolean;
} {
	const { user } = useCloudAuth();
	const role = user?.roles?.[orgId];
	if (!role?.permission && !role?.organization?.roles) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (role.permission?.super_user) {
		return { create: true, remove: true, update: true, view: true };
	}
	const roles = role.organization.roles;
	return { create: roles.create, remove: roles.delete, update: roles.update, view: roles.view };
}

export function useOrganizationClusterPermissions(orgId: string, clusterId?: string): {
	create: boolean;
	remove: boolean;
	update: boolean;
	view: boolean;
} {
	const { user } = useCloudAuth();
	const role = user?.roles?.[orgId];
	if (!role?.permission && !role?.organization?.clusters) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (role.permission?.super_user) {
		return { create: true, remove: true, update: true, view: true };
	}
	const specificRoles = !!clusterId && role.organization.clusters.resources?.find(r => r.id === clusterId);
	const roles = role.organization.clusters;
	return {
		create: roles.create,
		remove: specificRoles ? specificRoles.delete : roles.delete,
		update: specificRoles ? specificRoles.update : roles.update,
		view: specificRoles ? specificRoles.view : roles.view,
	};
}

export function useOrganizationClusterInstancePermissions(orgId: string, clusterId: string): {
	create: boolean;
	remove: boolean;
	update: boolean;
	view: boolean;
} {
	const { user } = useCloudAuth();
	const role = user?.roles?.[orgId];
	if (!role?.permission && !role?.organization?.clusters) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (role.permission?.super_user) {
		return { create: true, remove: true, update: true, view: true };
	}
	const specificRoles = role.organization.clusters
		.resources?.find(r => r.id === clusterId)
		?.instances;
	return { // TODO: Should these default to true or false when not specified?
		create: specificRoles ? specificRoles.create : true,
		remove: specificRoles ? specificRoles.delete : true,
		update: specificRoles ? specificRoles.update : true,
		view: specificRoles ? specificRoles.view : true,
	};
}

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
