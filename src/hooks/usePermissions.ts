import { EntityIds } from '@/features/auth/store/authStore';
import { useOperationsAllowlistSupported } from '@/features/instance/config/roles/operations/useOperationsAllowlistSupported';
import { checkSchemaTablePermission } from '@/hooks/checkSchemaTablePermission';
import { hasStaffPermission, useCloudAuth, useInstanceAuth } from '@/hooks/useAuth';
import {
	LocalLegacyRolePermissionTable,
	LocalRoleAttributePermissionAction,
	LocalRolePermissionAction,
	LocalRolePermissionTable,
	User,
} from '@/integrations/api/api.patch';
import { getDatabasePermissionRecord } from '@/integrations/api/localRolePermission';
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

// Staff permissions and an org membership are independent grants (a staff account can also be
// an org member), so every hook below unions the two rather than early-returning on staff.

export function useOrganizationPermissions(orgId?: string): UR {
	const { user } = useCloudAuth();
	const { organizationId: orgIdFromRoute }: { organizationId: string } = useParams({ strict: false });

	const member = memberOrganizationPermissions(user, orgId ?? orgIdFromRoute);
	return {
		update: hasStaffPermission(user, 'org:update') || member.update,
		remove: hasStaffPermission(user, 'org:delete') || member.remove,
	};
}

function memberOrganizationPermissions(user: User | null, orgId: string): UR {
	const role = user?.roles?.[orgId];
	if (!role || 'oauthProviders' in role) {
		return { update: false, remove: false };
	}
	if (!role.permission && !role.organization) {
		return { update: false, remove: false };
	}
	if (role.permission?.super_user) {
		return { update: true, remove: true };
	}
	return { update: role.organization.update, remove: role.organization.delete };
}

export function useOrganizationRolePermissions(orgId?: string): CRUV {
	const { user } = useCloudAuth();
	const { organizationId: orgIdFromRoute }: { organizationId: string } = useParams({ strict: false });

	const member = memberOrganizationRolePermissions(user, orgId ?? orgIdFromRoute);
	return {
		create: hasStaffPermission(user, 'role:create') || member.create,
		remove: hasStaffPermission(user, 'role:delete') || member.remove,
		update: hasStaffPermission(user, 'role:update') || member.update,
		view: hasStaffPermission(user, 'role:read') || member.view,
	};
}

function memberOrganizationRolePermissions(user: User | null, orgId: string): CRUV {
	const role = user?.roles?.[orgId];
	if (!role || 'oauthProviders' in role) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (!role.permission && !role.organization?.roles) {
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
	const member = memberClusterPermissions(user, orgId, clusterId);
	return {
		create: hasStaffPermission(user, 'cluster:create') || member.create,
		remove: hasStaffPermission(user, 'cluster:delete') || member.remove,
		update: hasStaffPermission(user, 'cluster:update') || member.update,
		view: hasStaffPermission(user, 'cluster:read') || member.view,
	};
}

function memberClusterPermissions(user: User | null, orgId: string, clusterId: string): CRUV {
	const role = user?.roles?.[orgId];
	if (!role || 'oauthProviders' in role) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (!role.permission && !role.organization?.clusters) {
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
	const member = memberClusterInstancePermissions(user, orgId, clusterId);
	return {
		// Instances are added/removed through cluster updates (there are no
		// instance:create / instance:delete permissions), so those verbs follow
		// the cluster grants.
		create: hasStaffPermission(user, 'cluster:update') || member.create,
		remove: hasStaffPermission(user, 'cluster:delete') || member.remove,
		update: hasStaffPermission(user, 'instance:update') || member.update,
		view: hasStaffPermission(user, 'instance:read') || member.view,
	};
}

function memberClusterInstancePermissions(user: User | null, orgId: string, clusterId: string): CRUV {
	const role = user?.roles?.[orgId];
	if (!role || 'oauthProviders' in role) {
		return { create: false, remove: false, update: false, view: false };
	}
	if (!role.permission && !role.organization?.clusters) {
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
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
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
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	return permission.super_user === true || permission.structure_user === true;
}

export function useInstanceSchemaTablePermission(
	entityId: EntityIds | undefined,
	databaseName: string,
	tableName: string,
	action: LocalRolePermissionAction,
): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const allowlistSupported = useOperationsAllowlistSupported();
	// Unresolved version fails closed: assuming the modern instance withholds a grant on a database
	// named `operations` rather than inventing one.
	return checkSchemaTablePermission(
		user?.role?.permission,
		databaseName,
		tableName,
		action,
		allowlistSupported ?? true,
	);
}

export function useInstanceSchemaTableAttributePermission(
	entityId: EntityIds | undefined,
	databaseName: string,
	tableName: string,
	attributeName: string,
	action: LocalRoleAttributePermissionAction,
): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const allowlistSupported = useOperationsAllowlistSupported();
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	// Fails closed while the version is unresolved, like the table-permission hook above.
	const specificPermission = getDatabasePermissionRecord(permission, databaseName, allowlistSupported ?? true);
	if (specificPermission?.tables?.[tableName]?.[action] === true) {
		return true;
	}
	const table = specificPermission?.tables?.[tableName];
	if (!table) {
		return false;
	}
	// attribute_permissions can be null (its declared shape) with no legacy attribute_restrictions
	// fallback present — a table entry exactly as defaultCalculator writes it with attributes off.
	const attributePermission = ((table as LocalRolePermissionTable).attribute_permissions
		|| (table as LocalLegacyRolePermissionTable).attribute_restrictions
		|| []).find(a => a.attribute_name === attributeName);
	return attributePermission?.[action] === true;
}
