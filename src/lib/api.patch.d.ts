import {
	SchemaOrganizationRole,
	SchemaUser,
	SchemaHdbInstance,
	SchemaCluster,
	SchemaOrganization,
} from '@/lib/api.gen';

/*
 * Over time, it should be our goal to empty out this file. The types here should be described by our OpenAPI docs
 * instead of needing to be maintained on the client side. The types here are either described inaccurately or we have
 * not updated the client side yet to reflect the reality of the API.
 */

interface OrgRoles extends SchemaOrganizationRole {
	id: string;
	organizationId: string;
	organizationName: string; // TODO: SchemaOrganizationRole does NOT have an organizationName...
	roleName: 'admin' | 'member';
}

// TODO: The OpenAPI type isn't very exhaustive.
export interface Organization extends SchemaOrganization {
	id: string;
	name: string;
	subdomain: string;
	createdByUserId: string;
	clusters?: Cluster[];
}

// TODO: The OpenAPI SchemaUser has every property as optional.
export interface User extends SchemaUser {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	roles: OrgRoles[];
}

export interface LocalUser {
	active: boolean;
	username: string;
	role: {
		permission: {
			super_user: boolean;
		};
		role: string;
		id: string;
		__updatedtime__: number;
		__createdtime__: number;
	};
}

// TODO: The OpenAPI types aren't very comprehensive for these two types.
export interface Instance extends SchemaHdbInstance {
	cluster: Cluster;
	clusterId: string;
	cpuCores: string;
	createdByUserId: string;
	hostId: string;
	id: string;
	instanceFqdn: string;
	instanceType: InstanceType; // TODO: Not seeing this in the server types
	instanceTypeId: string; // TODO: Not seeing this in the server types
	memoryMb: string;
	name: string;
	operationsApiPort: number;
	operationsApiSecure: boolean;
	replicationHosts: string[];
	status: BadgeStatus;
	storageGb: string;
	tempPassword: string;
	version: string;
}

export interface Cluster extends SchemaCluster {
	id: string;
	organizationId: string;
	name: string;
	instances: Instance[];
	prefix: string;
	resetPassword?: boolean;
	status: 'PROVISIONING' | 'RUNNING' | 'UPDATING_HDB_NODES' | 'UPDATING' | 'ERROR' | 'TERMINATING' | 'REMOVED' | 'STOPPED' | 'CLONE_READY' | 'CLONE_PENDING' | 'UPDATED' | 'TERMINATED';
}

type InstanceType = {
	id: string;
	selfHosted: boolean;
	useSharedProcess: boolean;
	threads: number;
	cpu: number;
	memory: number;
	readIops: number;
	writeIops: number;
};
