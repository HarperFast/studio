import { OrganizationRoleUpdatePayloadType } from '@/features/organization/mutations/OrganizationRoleFormSchema';
import { z } from 'zod';

const crud = z.object({ create: z.boolean(), view: z.boolean(), update: z.boolean(), delete: z.boolean() });
const clusterResource = z.object({
	id: z.string().min(1),
	view: z.boolean(),
	update: z.boolean(),
	delete: z.boolean(),
	instances: crud,
});

/** Everything central manager stores for a role besides its name, in its own field names. */
const RolePermissionsSchema = z.strictObject({
	update: z.boolean(),
	delete: z.boolean(),
	roles: z.strictObject(crud.shape),
	clusters: z.strictObject({ ...crud.shape, resources: z.array(z.strictObject(clusterResource.shape)) }),
});

export type RolePermissions = z.infer<typeof RolePermissionsSchema>;
export type CrudFlags = z.infer<typeof crud>;
type ClusterResource = z.infer<typeof clusterResource>;

const ALL: CrudFlags = { create: true, view: true, update: true, delete: true };

export const NEW_ROLE_PERMISSIONS: RolePermissions = {
	update: false,
	delete: false,
	roles: ALL,
	clusters: { ...ALL, resources: [] },
};

/** The role record as GET /Role/:id returns it. */
export interface RoleInfo {
	organization: {
		update?: boolean;
		delete?: boolean;
		roles?: Partial<CrudFlags>;
		clusters?: Partial<CrudFlags> & { resources?: Array<Partial<ClusterResource> & { id: string }> };
	};
}

const flags = (value: Partial<CrudFlags> | undefined): CrudFlags => ({
	create: value?.create === true,
	view: value?.view === true,
	update: value?.update === true,
	delete: value?.delete === true,
});

export function fromRoleInfo({ organization }: RoleInfo): RolePermissions {
	return {
		update: organization.update === true,
		delete: organization.delete === true,
		roles: flags(organization.roles),
		clusters: {
			...flags(organization.clusters),
			resources: (organization.clusters?.resources ?? []).map((resource) => ({
				id: resource.id,
				view: resource.view === true,
				update: resource.update === true,
				delete: resource.delete === true,
				instances: flags(resource.instances),
			})),
		},
	};
}

export function toPayload(
	name: string,
	organizationId: string,
	permissions: RolePermissions,
): OrganizationRoleUpdatePayloadType {
	return { name, organizationId, ...permissions };
}

export function toJson(permissions: RolePermissions) {
	return JSON.stringify(permissions, null, 2);
}

type ParsedPermissions = { ok: true; permissions: RolePermissions } | { ok: false; error: string };

export function parsePermissionsJson(text: string): ParsedPermissions {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { ok: false, error: 'This isn’t valid JSON.' };
	}
	const result = RolePermissionsSchema.safeParse(value);
	if (!result.success) {
		const issue = result.error.issues[0];
		const at = issue.path.length ? issue.path.join('.') : 'the permissions';
		return { ok: false, error: `${at}: ${issue.message}` };
	}
	return { ok: true, permissions: result.data };
}

/*
 * Cluster access. Central manager checks a cluster's own entry in `clusters.resources` instead of the
 * organization-wide `clusters` flags, for view, update, delete and that cluster's instances; creating a
 * cluster is only ever organization-wide. So "selected clusters" is expressible exactly when the
 * organization-wide view/update/delete are off and every selected cluster carries the same flags, with
 * its instance flags following the cluster's the way they do without an entry.
 */
export type ClusterAccess =
	| { scope: 'all' }
	| { scope: 'selected'; clusterIds: string[] }
	| { scope: 'custom' };

const instanceFlagsFor = (create: boolean, cluster: Pick<ClusterResource, 'view' | 'update' | 'delete'>) => ({
	create,
	view: cluster.view,
	update: cluster.update,
	delete: cluster.delete,
});

export function readClusterAccess({ clusters }: RolePermissions): ClusterAccess {
	if (clusters.resources.length === 0) { return { scope: 'all' }; }
	const [first] = clusters.resources;
	const uniform = clusters.resources.every((resource) =>
		resource.view === first.view
		&& resource.update === first.update
		&& resource.delete === first.delete
		&& resource.instances.create === clusters.create
		&& resource.instances.view === resource.view
		&& resource.instances.update === resource.update
		&& resource.instances.delete === resource.delete
	);
	const orgWideOff = !clusters.view && !clusters.update && !clusters.delete;
	return uniform && orgWideOff
		? { scope: 'selected', clusterIds: clusters.resources.map((resource) => resource.id) }
		: { scope: 'custom' };
}

export function clusterRowFlags(permissions: RolePermissions, access: ClusterAccess): CrudFlags {
	const { clusters } = permissions;
	if (access.scope === 'selected' && clusters.resources.length > 0) {
		const [first] = clusters.resources;
		return { create: clusters.create, view: first.view, update: first.update, delete: first.delete };
	}
	return { create: clusters.create, view: clusters.view, update: clusters.update, delete: clusters.delete };
}

/** Writes the Clusters row and its access back as central manager's fields. Not for 'custom'. */
export function writeClusters(
	permissions: RolePermissions,
	row: CrudFlags,
	access: Exclude<ClusterAccess, { scope: 'custom' }>,
): RolePermissions {
	if (access.scope === 'all') {
		return { ...permissions, clusters: { ...row, resources: [] } };
	}
	const cluster = { view: row.view, update: row.update, delete: row.delete };
	return {
		...permissions,
		clusters: {
			create: row.create,
			view: false,
			update: false,
			delete: false,
			resources: access.clusterIds.map((id) => ({ id, ...cluster, instances: instanceFlagsFor(row.create, cluster) })),
		},
	};
}
