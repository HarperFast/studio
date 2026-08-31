import { EntityIds } from '@/features/auth/store/authStore';
import {
	checkImportDataOperationsAllowed,
	checkImportMethodAllowed,
	checkImportSourceAllowed,
	checkTableActionAllowed,
	IMPORT_METHODS,
	type ImportMethod,
} from '@/hooks/checkOperationPermission';
import {
	checkImportDataPermission,
	checkSchemaTablePermission,
	checkTablePutPermission,
} from '@/hooks/checkSchemaTablePermission';
import { hasStaffPermission, useCloudAuth, useInstanceAuth } from '@/hooks/useAuth';
import {
	LocalLegacyRolePermissionTable,
	LocalRoleAttributePermissionAction,
	LocalRolePermissionAction,
	LocalRolePermissionTable,
	User,
} from '@/integrations/api/api.patch';
import type { ImportSource } from '@/integrations/api/instance/database/importData';
import { getDatabasePermissionRecord } from '@/integrations/api/localRolePermission';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

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
	// Not gated on `operations`: verifyPerms clears a super_user before reaching the allowlist.
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
	// Not gated on `operations` either: structure_user is cleared for every DDL operation this covers.
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
	return checkSchemaTablePermission(user?.role?.permission, databaseName, tableName, action);
}

/**
 * Whether this role can `put` records in this table — the whole question, not a half of it. `put` has
 * its own authorization shape (raw table insert+update flags, a `put` allowlist entry, and no
 * attribute scoping), so it cannot be assembled from the per-action table checks; see
 * {@link checkTablePutPermission}.
 */
export function useInstanceTablePutPermission(
	entityId: EntityIds | undefined,
	databaseName: string,
	tableName: string,
): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	return checkTablePutPermission(user?.role?.permission, databaseName, tableName);
}

export function useInstanceImportDataPermission(
	entityId: EntityIds | undefined,
	databaseName: string,
	tableName: string,
): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	return checkImportDataPermission(user?.role?.permission, databaseName, tableName);
}

/**
 * The allowlist half of Import Data, for the database-scoped launcher that has no table yet (it
 * creates one, so there is no per-table grant to consult).
 */
export function useInstanceImportOperationsPermission(entityId?: EntityIds): boolean {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	return checkImportDataOperationsAllowed(user?.role?.permission);
}

/**
 * Per-method and per-source import capability, so the modal offers only what the role can run instead
 * of failing at submit.
 */
export function useInstanceImportCapabilities(entityId?: EntityIds): {
	methods: Record<ImportMethod, boolean>;
	allowsSource: (kind: ImportSource['kind']) => boolean;
	allowsDestination: (databaseName: string, tableName: string) => boolean;
} {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(entityId ?? instanceId ?? clusterId);
	const permission = user?.role?.permission;
	return useMemo(() => ({
		methods: Object.fromEntries(
			IMPORT_METHODS.map((method) => [method, checkImportMethodAllowed(permission, method)]),
		) as Record<ImportMethod, boolean>,
		allowsSource: (kind: ImportSource['kind']) => checkImportSourceAllowed(permission, kind),
		// The launcher checked the table it was launched from, but the modal lets the target change.
		allowsDestination: (databaseName: string, tableName: string) =>
			checkImportDataPermission(permission, databaseName, tableName),
	}), [permission]);
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
	const permission = user?.role?.permission;
	if (!permission) {
		// If we don't yet have record of their permission, deny access.
		// (We're probably still loading the user.)
		return false;
	}
	if (!checkTableActionAllowed(permission, action)) {
		return false;
	}
	if (permission.super_user === true || permission.structure_user === true) {
		return true;
	}
	// Version-blind for the same reason as checkSchemaTablePermission.
	const specificPermission = getDatabasePermissionRecord(permission, databaseName, false);
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
