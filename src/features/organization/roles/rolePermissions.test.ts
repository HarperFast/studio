import { describe, expect, it } from 'vitest';
import {
	fromRoleInfo,
	NEW_ROLE_PERMISSIONS,
	parsePermissionsJson,
	readClusterAccess,
	RolePermissions,
	toJson,
	toPayload,
	writeClusters,
} from './rolePermissions';

const none = { create: false, view: false, update: false, delete: false };
const base = (clusters: RolePermissions['clusters']): RolePermissions => ({
	update: false,
	delete: false,
	roles: none,
	clusters,
});

describe('role permissions', () => {
	it('starts a new role with the defaults the create form always had', () => {
		expect(NEW_ROLE_PERMISSIONS).toEqual({
			update: false,
			delete: false,
			roles: { create: true, view: true, update: true, delete: true },
			clusters: { create: true, view: true, update: true, delete: true, resources: [] },
		});
	});

	it('reads a role central manager returns, treating anything missing as not allowed', () => {
		expect(fromRoleInfo({ organization: { update: true, clusters: { view: true } } })).toEqual({
			update: true,
			delete: false,
			roles: none,
			clusters: { ...none, view: true, resources: [] },
		});
	});

	it('sends exactly central manager’s fields, overrides untouched', () => {
		const resource = {
			id: 'clu-1',
			view: true,
			update: false,
			delete: true,
			instances: { create: true, view: false, update: false, delete: true },
		};
		const permissions = fromRoleInfo({ organization: { clusters: { resources: [resource] } } });
		expect(toPayload('ops', 'org-1', permissions)).toEqual({
			name: 'ops',
			organizationId: 'org-1',
			update: false,
			delete: false,
			roles: none,
			clusters: { ...none, resources: [resource] },
		});
	});

	describe('JSON', () => {
		it('round-trips', () => {
			const permissions = base({ ...none, view: true, resources: [] });
			expect(parsePermissionsJson(toJson(permissions))).toEqual({ ok: true, permissions });
		});

		it('refuses text that is not JSON, a missing field, and a field central manager does not know', () => {
			expect(parsePermissionsJson('{').ok).toBe(false);
			const missing = parsePermissionsJson(JSON.stringify({ update: false, delete: false, roles: none }));
			expect(missing).toEqual({ ok: false, error: expect.stringMatching(/^clusters:/) });
			const unknown = parsePermissionsJson(
				JSON.stringify({ ...base({ ...none, resources: [] }), superpowers: true }),
			);
			expect(unknown.ok).toBe(false);
		});
	});

	describe('cluster access', () => {
		it('is all clusters when no cluster has its own entry', () => {
			expect(readClusterAccess(base({ ...none, view: true, resources: [] }))).toEqual({ scope: 'all' });
		});

		it('writes selected clusters as per-cluster entries with the organization-wide view/update/delete off', () => {
			const written = writeClusters(
				base({ ...none, resources: [] }),
				{ create: true, view: true, update: true, delete: false },
				{ scope: 'selected', clusterIds: ['clu-a', 'clu-b'] },
			);
			const entry = {
				view: true,
				update: true,
				delete: false,
				instances: { create: true, view: true, update: true, delete: false },
			};
			expect(written.clusters).toEqual({
				create: true,
				view: false,
				update: false,
				delete: false,
				resources: [{ id: 'clu-a', ...entry }, { id: 'clu-b', ...entry }],
			});
			expect(readClusterAccess(written)).toEqual({ scope: 'selected', clusterIds: ['clu-a', 'clu-b'] });
		});

		it('writes all clusters back as organization-wide flags with no entries', () => {
			const written = writeClusters(
				base({ ...none, resources: [{ id: 'clu-a', ...none, instances: none }] }),
				{ create: false, view: true, update: false, delete: false },
				{ scope: 'all' },
			);
			expect(written.clusters).toEqual({ ...none, view: true, resources: [] });
		});

		it('is custom when entries differ, or sit beside organization-wide access', () => {
			const entry = (id: string, update: boolean) => ({
				id,
				view: true,
				update,
				delete: false,
				instances: { create: false, view: true, update, delete: false },
			});
			expect(readClusterAccess(base({ ...none, resources: [entry('a', true), entry('b', false)] }))).toEqual({
				scope: 'custom',
			});
			expect(readClusterAccess(base({ ...none, view: true, resources: [entry('a', true)] }))).toEqual({
				scope: 'custom',
			});
			const instancesDiffer = {
				...entry('a', true),
				instances: { create: false, view: false, update: true, delete: false },
			};
			expect(readClusterAccess(base({ ...none, resources: [instancesDiffer] }))).toEqual({ scope: 'custom' });
			// Studio reads instances.delete to offer deleting an instance, so the form must not rewrite it.
			const instanceDeleteDiffers = { ...entry('a', true), delete: true };
			expect(readClusterAccess(base({ ...none, resources: [instanceDeleteDiffers] }))).toEqual({ scope: 'custom' });
		});
	});
});
