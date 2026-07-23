import {
	SchemaCluster,
	SchemaClusterUpsert,
	SchemaHdbInstance,
	SchemaOrganization,
	SchemaRole,
	SchemaUser,
} from './api.gen';
import { ENTERPRISE, SELF_SERVICE } from './orgType';

/*
 * Over time, it should be our goal to empty out this file. The types here should be described by our OpenAPI docs
 * instead of needing to be maintained on the client side. The types here are either described inaccurately or we have
 * not updated the client side yet to reflect the reality of the API.
 */

export interface OAuthConfig {
	id?: string; // oac-… — omit on create, required on update
	provider: 'okta' | string; // required on every call (even updates — send existing value)
	domain?: string; // <tenant>.okta.com — optional on read (API may omit), required by the add/edit forms
	clientId: string; // masked to '****' on read; omit/blank on update = keep existing
	clientSecret?: string; // masked to '****' on read; omit/blank on update = keep existing
	scope?: string; // e.g. "openid email profile"
	enabled?: boolean; // defaults true on create
	required?: boolean; // defaults false on create; true = force SSO for the org
	configuredAt?: string;
	configuredByUserId?: string;
}

export interface OAuthLockedRole {
	organizationName?: string;
	// Present when the org requires OAuth and the current session isn't authenticated via it.
	// The frontend uses this to render sign-in buttons instead of org content.
	oauthProviders?: Array<{ name: string; oauthConfigId: string }>;
}

export interface User extends Omit<SchemaUser, 'roles'> {
	roles: Record<SchemaOrganization['id'], SchemaRole & OAuthLockedRole>;
	fabricRole: 'fabric_admin' | 'super_user' | 'least_privileged';
	/** The oac-… config ID used to authenticate this session, or null if password/global OAuth. */
	oauthConfigId: string | null;
}

/** Response of POST /Admin/ApiToken — a short-lived Bearer token for programmatic API access. */
export interface ApiTokenResult {
	operationToken: string;
	expiresAt: string;
}

/**
 * A row of the central-manager `SystemStatus` table — the backing store for the
 * notification center (issue #1259). Not in the generated OpenAPI types yet, so
 * declared here (see the note at the top of this file).
 */
export interface SystemStatusNotification {
	id: string;
	/** Freeform category, e.g. 'error' | 'warning' | 'maintenance' | 'info'. Treated as serious by default. */
	type: string;
	message: string;
	/** Optional deep link: an absolute URL (external, new tab) or a relative path (internal route). */
	url?: string | null;
	/** Start of the active window (UTC). Null/absent = active from the beginning of time. Harper `Date` → ISO string or epoch ms. */
	startAt?: string | number | null;
	/** End of the active window (UTC). Null/absent = never expires. Harper `Date` → ISO string or epoch ms. */
	endAt?: string | number | null;
}

export interface Organization extends SchemaOrganization {
	type: ENTERPRISE | SELF_SERVICE | string | undefined;
	settings?: {
		oauthConfigs?: OAuthConfig[];
	};
}

export interface SchemaOrganizationDomain {
	id: string;
	organizationId: string;
	clusterId: string;
	domain: string;
	status: string;
	challengeToken: string;
	challengeTxtRecord: string;
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

	[databaseName: string]: LocalRoleSchemaRecord;
}

export interface LocalRoleSchemaRecord {
	tables: Record<string, LocalRolePermissionTable | LocalLegacyRolePermissionTable>;
}

export interface LocalRolePermissionTable {
	read: boolean;
	insert: boolean;
	update: boolean;
	delete: boolean;
	attribute_permissions: LocalRoleAttributePermissionTable[] | null;
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
	// Returned by the CM but not yet in the generated OpenAPI schema. True when the instance was
	// (re)started in safe mode — Harper core is up but user apps/components are not loaded.
	safeMode?: boolean;
}

export interface Cluster extends Omit<SchemaCluster, 'instances'> {
	// TODO: Can we return enums from the server to make this easier?
	status?: string | 'PROVISIONING' | 'UPDATING' | 'RUNNING' | 'TERMINATED' | 'FAILED';
	// Use the patched Instance (adds status + safeMode) rather than the raw generated shape.
	instances?: Instance[];
}

export interface ClusterUpsert extends SchemaClusterUpsert {
	skipGtmWait?: boolean;
	version?: string;
}

export interface InstanceDatabaseMap {
	[databaseName: string]: InstanceDatabaseTableMap;
}

export interface InstanceDatabaseTableMap {
	[tableName: string]: InstanceTable;
}

export interface InstanceTable {
	schema: string;
	name: string;
	hash_attribute?: string;
	primary_key?: string;
	audit: boolean;
	schema_defined: boolean;
	db_size: number;
	sources: unknown[];
	/** Omitted when describe is requested with `skip_record_count` (the count scan is expensive). */
	record_count?: number;
	/** Present (alongside an estimated `record_count`) when the count exceeded the server's exact-count budget. */
	estimated_record_range?: [number, number];
	table_size: number;
	db_audit_size: number;
	last_updated_record?: number;
	attributes: InstanceAttribute[];
}

export interface InstanceAttribute {
	attribute: string;
	/** Scalar type name, `'array'`, or — for relationship attributes — the related table's type name. */
	type?: 'ID' | 'String' | 'Int' | 'Long' | 'Float' | 'BigInt' | 'Boolean' | 'Any' | 'Date' | 'Bytes' | 'Blob' | string;
	/** Element type of an `array` attribute: a scalar name, or a table name for to-many relationships. */
	elements?: string;
	is_primary_key?: boolean;
	indexed?: boolean | unknown;
	nullable?: boolean;
	/** True for `@computed` attributes (server only returns them when asked with `include_computed`). */
	computed?: boolean;
	/** Sub-fields of an object-typed attribute (includes to-one relationship targets on Harper 4.x). */
	properties?: Array<{ name: string; type?: string }>;
}
