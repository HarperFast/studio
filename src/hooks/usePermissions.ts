import { EntityIds } from '@/features/auth/store/authStore';
import { useCloudAuth, useInstanceAuth } from '@/hooks/useAuth';
import {
	LocalLegacyRolePermissionTable,
	LocalRoleAttributePermissionAction,
	LocalRolePermissionAction,
	LocalRolePermissionTable,
	User,
} from '@/lib/api.patch';
import { useParams } from '@tanstack/react-router';

interface UR {
	update: boolean;
	remove: boolean;
}

interface CRUV {
	create: boolean;
	remove: boolean;
	update: boolean;
	view: boolean;
}

export function useOrganizationPermissions(orgId?: string): UR {
	const { user } = useCloudAuth();
	const { organizationId: orgIdFromRoute }: { organizationId: string; } = useParams({ strict: false });
	const role = user?.roles?.[orgId ?? orgIdFromRoute];
	if (!role?.permission && !role?.organization) {
		return { update: false, remove: false };
	}
	if (role.permission?.super_user) {
		return { update: true, remove: true };
	}
	return { update: role.organization.update, remove: role.organization.delete };
}

export function useOrganizationRolePermissions(orgId?: string): CRUV {
	const { user } = useCloudAuth();
	const { organizationId: orgIdFromRoute }: { organizationId: string; } = useParams({ strict: false });
	const role = user?.roles?.[orgId ?? orgIdFromRoute];
	if (!role?.permission && !role?.organization?.roles) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (role.permission?.super_user) {
		return { create: true, remove: true, update: true, view: true };
	}
	const roles = role.organization.roles;
	return { create: roles.create, remove: roles.delete, update: roles.update, view: roles.view };
}

export function useOrganizationClusterPermissions(orgId?: string, clusterId?: string): CRUV {
	const { user } = useCloudAuth();
	const { organizationId: orgIdFromRoute, clusterId: clusterIdFromRoute }: {
		organizationId: string;
		clusterId: string;
	} = useParams({ strict: false });

	return getOrganizationClusterPermissions(
		user,
		orgId ?? orgIdFromRoute,
		clusterId ?? clusterIdFromRoute,
	);
}

export function getOrganizationClusterPermissions(user: User | null, orgId: string, clusterId: string): CRUV {
	const role = user?.roles?.[orgId];
	if (!role?.permission && !role?.organization?.clusters) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (role.permission?.super_user) {
		return { create: true, remove: true, update: true, view: true };
	}
	const specificRoles = role.organization.clusters.resources?.find(r => r.id === clusterId);
	const genericRoles = role.organization.clusters;
	return {
		create: genericRoles.create,
		remove: specificRoles ? specificRoles.delete : genericRoles.delete,
		update: specificRoles ? specificRoles.update : genericRoles.update,
		view: specificRoles ? specificRoles.view : genericRoles.view,
	};
}

export function useOrganizationClusterInstancePermissions(orgId?: string, clusterId?: string): CRUV {
	const { user } = useCloudAuth();
	const { organizationId: orgIdFromRoute, clusterId: clusterIdFromRoute }: {
		organizationId: string;
		clusterId: string;
	} = useParams({ strict: false });

	return getOrganizationClusterInstancePermissions(
		user,
		orgId ?? orgIdFromRoute,
		clusterId ?? clusterIdFromRoute,
	);
}

export function getOrganizationClusterInstancePermissions(user: User | null, orgId: string, clusterId: string): CRUV {
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
	const genericRoles = role.organization.clusters;
	return {
		create: specificRoles ? specificRoles.create : genericRoles.create,
		remove: specificRoles ? specificRoles.delete : genericRoles.delete,
		update: specificRoles ? specificRoles.update : genericRoles.update,
		view: specificRoles ? specificRoles.view : genericRoles.view,
	};
}

export function useInstanceManagePermission(entityId?: EntityIds): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	return permission.super_user === true;
}

export function useInstanceBrowseManagePermission(entityId?: EntityIds): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	return permission.super_user === true || permission.structure_user === true;
}

export function useInstanceSchemaTablePermission(entityId: EntityIds | undefined, databaseName: string, tableName: string, action: LocalRolePermissionAction): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	const specificPermission = permission[databaseName];
	return specificPermission?.tables?.[tableName][action] === true;
}

export function useInstanceSchemaTableAttributePermission(entityId: EntityIds | undefined, databaseName: string, tableName: string, attributeName: string, action: LocalRoleAttributePermissionAction): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	const specificPermission = permission[databaseName];
	if (specificPermission?.tables?.[tableName][action] === true) {
		return true;
	}
	const table = specificPermission?.tables?.[tableName];
	const attributePermission = ((table as LocalRolePermissionTable).attribute_permissions || (table as LocalLegacyRolePermissionTable).attribute_restrictions).find(a => a.attribute_name === attributeName);
	return attributePermission?.[action] === true;
}
