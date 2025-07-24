import {
	SchemaCluster,
	SchemaHdbInstance,
	SchemaOrganization,
	SchemaOrganizationRole,
	SchemaPlan, SchemaRegionPlan,
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
	role: LocalRole;
	__updatedtime__: number;
	__createdtime__: number;
}

export interface LocalRole {
	permission: LocalRolePermission;
	role: string;
	id: string;
	__updatedtime__: number;
	__createdtime__: number;
}

export interface LocalRolePermission {
	super_user?: boolean;
	cluster_user?: boolean;
	structure_user?: boolean;

	[schemaName: string]: LocalRoleSchemaRecord;
}

export interface LocalRoleSchemaRecord {
	tables: Record<string, LocalRolePermissionTable | LocalLegacyRolePermissionTable>;
}

export interface LocalRolePermissionTable {
	read: boolean;
	insert: boolean;
	update: boolean;
	delete: boolean;
	attribute_permissions: LocalRoleAttributePermissionTable[];
}

export type LocalRolePermissionAction = keyof Omit<LocalRolePermissionTable, 'attribute_permissions'>;

export interface LocalRoleAttributePermissionTable {
	attribute_name: string;
	read: boolean;
	insert: boolean;
	update: boolean;
}

export interface LocalLegacyRolePermissionTable {
	read: boolean;
	insert: boolean;
	update: boolean;
	delete: boolean;
	attribute_restrictions: LocalLegacyRoleAttributePermissionTable[];
}

export interface LocalLegacyRoleAttributePermissionTable {
	attribute_name: string;
	read: boolean;
	insert: boolean;
	update: boolean;
	delete: boolean;
}

export type LocalRoleAttributePermissionAction = keyof Omit<LocalRoleAttributePermissionTable, 'attribute_name'>;

export interface Instance extends SchemaHdbInstance {
	status?: BadgeStatus;
}

export interface Plan extends SchemaPlan {
	priceUsd?: number; // TODO: Inc
	deploymentType: string; // TODO: Inc
	deploymentDescription: string; // TODO: Inc
	performanceDescription?: string; // TODO: Inc
	allowedRegionIds?: string[]; // TODO: Inc
}

export interface Cluster extends SchemaCluster {
	// TODO: Can we return enums from the server to make this easier?
	status?: string | 'PROVISIONING' | 'UPDATING' | 'RUNNING' | 'TERMINATED';
}

export interface ClusterDefinition extends Omit<SchemaCluster, 'id' | 'plans'> {
	autoRenew: boolean;
	regionPlans: ClusterDefinitionRegionPlan[];
}

export type ClusterDefinitionRegionPlan = Omit<SchemaRegionPlan, 'autoRenew'>;

export interface InstanceSchemaMap {
	[schemaName: string]: InstanceSchema;
}

export interface InstanceSchema {
	[tableName: string]: InstanceTable;
}

export interface InstanceTable {
	schema: string;
	name: string;
	hash_attribute: string;
	audit: boolean;
	schema_defined: boolean;
	db_size: number;
	sources: unknown[];
	record_count: number;
	table_size: number;
	db_audit_size: number;
	last_updated_record?: number;
	attributes: InstanceAttribute[];
}

export interface InstanceAttribute {
	attribute: string;
	type?: 'ID' | 'String' | 'Int' | 'Long' | 'Float' | 'BigInt' | 'Boolean' | 'Any' | 'Date' | 'Bytes' | 'Blob' | string;
	is_primary_key?: boolean;
	indexed?: boolean | unknown;
	nullable?: boolean;
}
