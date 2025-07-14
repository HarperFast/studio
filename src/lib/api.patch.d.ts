import {
	SchemaCluster,
	SchemaHdbInstance,
	SchemaOrganization,
	SchemaOrganizationRole,
	SchemaPlan,
	SchemaUser,
} from '@/lib/api.gen';

/*
 * Over time, it should be our goal to empty out this file. The types here should be described by our OpenAPI docs
 * instead of needing to be maintained on the client side. The types here are either described inaccurately or we have
 * not updated the client side yet to reflect the reality of the API.
 */

interface OrganizationRole extends SchemaOrganizationRole {
	roleName: 'admin' | 'member';
	organizationName: string; // TODO: Not descried by the API. Is it computed?
}

export { SchemaOrganization as Organization };

export interface User extends SchemaUser {
	roles: OrganizationRole[];
}

export interface LocalUser {
	active: boolean;
	username: string;
	role: LocalUserRole;
	__updatedtime__: number;
	__createdtime__: number;
}

export interface LocalUserRole {
	permission: LocalUserRolePermission;
	role: string;
	id: string;
	__updatedtime__: number;
	__createdtime__: number;
}

export interface LocalUserRolePermission {
	super_user: boolean;

	[record: string]: LocalUserRolePermissionRecord;
}

export interface LocalUserRolePermissionRecord {
	tables: Record<string, LocalUserRolePermissionTable>;
}

export interface LocalUserRolePermissionTable {
	read: boolean;
	insert: boolean;
	update: boolean;
	delete: boolean;
	attribute_permissions: unknown[];
}

export interface Instance extends SchemaHdbInstance {
	status?: BadgeStatus;
}

export interface Plan extends SchemaPlan {
	price?: string; // TODO: Is this computed?
}

export interface Cluster extends SchemaCluster {
	// TODO: Can we return enums from the server to make this easier?
	status?: string | 'PROVISIONING' | 'RUNNING' | 'UPDATING_HDB_NODES' | 'UPDATING' | 'ERROR' | 'TERMINATING' | 'REMOVED' | 'STOPPED' | 'CLONE_READY' | 'CLONE_PENDING' | 'UPDATED' | 'TERMINATED';
}
