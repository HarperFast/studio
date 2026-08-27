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

/**
 * The staff permissions the UI gates on, matching the values `/User/current` returns in
 * `staffPermissions`. A subset — the API defines more, but only these drive UI decisions.
 */
export type StaffPermission =
	| 'org:read'
	| 'org:update'
	| 'org:delete'
	| 'role:read'
	| 'role:create'
	| 'role:update'
	| 'role:delete'
	| 'cluster:read'
	| 'cluster:create'
	| 'cluster:update'
	| 'cluster:delete'
	| 'instance:read'
	| 'instance:update'
	| 'billing:write'
	| 'region:read'
	| 'region:write'
	| 'grant:read'
	| 'grant:write'
	| 'systemStatus:write'
	| 'apiToken:create';

export interface User extends Omit<SchemaUser, 'roles'> {
	roles: Record<SchemaOrganization['id'], SchemaRole & OAuthLockedRole>;
	fabricRole:
		| 'fabric_admin'
		| 'fabric_support'
		| 'fabric_readonly'
		| 'fabric_staff'
		| 'super_user'
		| 'least_privileged';
	/**
	 * What this account may do across organizations. Empty for customers; absent when the API
	 * predates the field (hasStaffPermission then falls back to role names).
	 */
	staffPermissions?: string[];
	/** The oac-… config ID used to authenticate this session, or null if password/global OAuth. */
	oauthConfigId: string | null;
}

/** Response of POST /Admin/ApiToken — a short-lived Bearer token for programmatic API access. */
export interface ApiTokenResult {
	operationToken: string;
	expiresAt: string;
}

/**
 * A Fabric-managed region as returned by GET /Admin/Region. `organizationIds` is the customer
 * scope: when set, only those organizations can see/select the region; null/empty means it is
 * global (available to everyone). The `*PreferredLocations` values must match `location` values
 * in the Location table (see AdminLocation).
 */
export interface AdminRegion {
	id: string;
	region: string;
	instanceCount: number;
	purchasedBlockMultiplier: number;
	latencyDescription: string;
	linodePreferredLocations?: string[];
	gcpPreferredLocations?: string[];
	forceLocations?: boolean;
	/** false = retired: hidden from GET /Region (new provisioning). Absent/true = active. */
	active?: boolean;
	organizationIds?: string[] | null;
	createdByUserId?: string;
	updatedByUserId?: string;
	createdAt?: string;
	updatedAt?: string;
}

/** Payload for POST /Admin/Region (create) and PATCH /Admin/Region/:id (edit, all optional). */
export interface AdminRegionPayload {
	id: string;
	region: string;
	instanceCount: number;
	purchasedBlockMultiplier: number;
	latencyDescription: string;
	linodePreferredLocations?: string[];
	gcpPreferredLocations?: string[];
	forceLocations?: boolean;
	active?: boolean;
	organizationIds?: string[] | null;
}

/**
 * A deployment location as returned by GET /Location. `location` is the value stored in a region's
 * preferred-location arrays; `locationName` is the display label; `cloudProvider` splits the Linode
 * and GCP pickers.
 */
export interface AdminLocation {
	id: string;
	location: string;
	locationName: string;
	/** Only these two providers exist today (see central-manager's loadLocations). */
	cloudProvider: 'linode' | 'gcp';
	regions: string[];
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
	// `true` grants DDL everywhere; an array of database names scopes it to those databases, and
	// the role still relies on its explicit table permissions elsewhere.
	structure_user?: boolean | string[];
	// Optional operation allowlist (Harper 5.0+): operation/group names; when present, unlisted
	// operations are denied and listed super_user-only operations are granted to the role.
	operations?: string[];

	[databaseName: string]: LocalRoleSchemaRecord | boolean | string[] | undefined;
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

/**
 * A cluster's commercial terms, as projected for customers by central-manager. Returned on
 * `GET /Cluster/:id` and on each cluster in `GET /Organization/:id`. Not in the generated OpenAPI
 * types yet, so declared here (see the note at the top of this file).
 *
 * When no grant is live this carries the last finished one instead, so a suspended cluster can say
 * what ended and when. Staff-only fields (reason, actor ids, origin) are deliberately not projected.
 */
export interface ClusterGrant {
	id: string;
	source: 'trial' | 'purchased' | 'enterprise' | 'gift' | 'comp' | string;
	status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | string;
	/**
	 * Server-computed. Use this rather than deriving from `status`: an ACTIVE row past its `endsAt`
	 * is not live until the expiry runner stamps it, so status alone reads as live when service
	 * has already been withdrawn.
	 */
	isActive: boolean;
	startsAt: string | null;
	endsAt: string | null;
	cycleAnchor: string | null;
	/** `conversion-pending` is a bounded conversion window, not the customer's terms. */
	expiryPolicy: 'consumer-trial' | 'enterprise-grace' | 'conversion-pending' | null;
	/** Last expiry-policy stage the runner applied; null before the first one. */
	currentStage: ExpiryStage | null;
	stageUpdatedAt: string | null;
	/**
	 * What an admin-issued grant covers, or null when unrestricted. Both are EXACT lists — an id not
	 * named is not covered, with no family or size inference. A picker should offer exactly these.
	 */
	allowedPlanIds: string[] | null;
	allowedRegionIds: string[] | null;
	/**
	 * The whole expiry schedule with each stage's due date. Computed by central-manager on every
	 * read, never stored, so editing a policy moves these immediately — don't cache them.
	 *
	 * Null when the policy has no stage table (`none`) or the grant has no usable `endsAt`. Length
	 * varies by policy: `enterprise-grace` has five stages, `consumer-trial` four — read the array,
	 * never assume a shape, and never infer the policy from `source`.
	 */
	timeline: ExpiryStageDue[] | null;
}

/**
 * A raw ClusterGrant row as `GET /Admin/ClusterGrant/` returns it — the full table row, staff-only
 * fields included, unlike the customer projection on Cluster. `isActive` and `timeline` are
 * computed by central-manager on the customer projection and requested for the admin rows too;
 * optional here so the page renders honestly against a CM that doesn't compute them yet.
 */
export interface AdminClusterGrant {
	id: string;
	organizationId: string;
	/** Null = an unbound voucher the cluster-create flow later claims. */
	clusterId: string | null;
	source: ClusterGrant['source'];
	status: ClusterGrant['status'];
	origin?: 'derived' | 'admin' | null;
	startsAt: string | null;
	cycleAnchor?: string | null;
	endsAt: string | null;
	expiryPolicy: ClusterGrant['expiryPolicy'];
	currentStage: ExpiryStage | null;
	stageUpdatedAt?: string | null;
	allowedPlanIds?: string[] | null;
	allowedRegionIds?: string[] | null;
	grantedByUserId?: string | null;
	updatedByUserId?: string | null;
	reason?: string | null;
	createdAt?: string;
	updatedAt?: string;
	isActive?: boolean;
	timeline?: ExpiryStageDue[] | null;
}

export interface ExpiryStageDue {
	stage: ExpiryStage;
	dueAt: string | null;
	applied: boolean;
}

export type ExpiryStage = 'AWAITING_PLAN' | 'WARNED' | 'FINAL_WARNING' | 'GRACE' | 'SHUTDOWN' | 'DELETED';

export interface Cluster extends Omit<SchemaCluster, 'instances'> {
	// TODO: Can we return enums from the server to make this easier?
	status?: string | 'PROVISIONING' | 'UPDATING' | 'RUNNING' | 'TERMINATED' | 'FAILED';
	// Use the patched Instance (adds status + safeMode) rather than the raw generated shape.
	instances?: Instance[];
	/** The governing grant, or null for a cluster that never had one (self-hosted, or pre-grant). */
	grant?: ClusterGrant | null;
	/** Set when service was deliberately withdrawn. Distinguishes an expiry stop from a user stop. */
	suspendedReason?: string | null;
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
