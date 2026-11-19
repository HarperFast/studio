/** @vitest-environment jsdom */
// jsdom: usePermissions imports useAuth, whose authStore touches localStorage at module load.
import type { User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import {
	canManageServiceAccounts,
	getContainerOpsPermission,
	getOrganizationBillingPermissions,
	getOrganizationClusterInstancePermissions,
	getOrganizationClusterPermissions,
} from './usePermissions';

const ORG = 'org-1';
const CLUSTER = 'clu-1';

const staff = (staffPermissions: string[], roles: User['roles'] = {} as User['roles']) =>
	({ fabricRole: 'fabric_support', staffPermissions, roles }) as User;

const memberRoles = (clusters: object) =>
	({ [ORG]: { permission: null, organization: { clusters } } }) as unknown as User['roles'];

describe('getOrganizationClusterPermissions', () => {
	it('maps each verb to its own staff permission instead of granting all four', () => {
		expect(getOrganizationClusterPermissions(staff(['cluster:read']), ORG, CLUSTER)).toEqual({
			create: false,
			remove: false,
			update: false,
			view: true,
		});
		expect(getOrganizationClusterPermissions(staff(['cluster:update', 'cluster:read']), ORG, CLUSTER)).toEqual({
			create: false,
			remove: false,
			update: true,
			view: true,
		});
	});

	it('unions staff permissions with an org membership rather than shadowing it', () => {
		// The member role grants delete; the staff grant alone would not.
		const roles = memberRoles({ create: false, delete: true, update: false, view: true });
		const result = getOrganizationClusterPermissions(staff(['cluster:read'], roles), ORG, CLUSTER);
		expect(result).toEqual({ create: false, remove: true, update: false, view: true });
	});

	it('grants nothing to a customer with no role in the org', () => {
		const customer = { fabricRole: 'least_privileged', staffPermissions: [], roles: {} } as unknown as User;
		expect(getOrganizationClusterPermissions(customer, ORG, CLUSTER)).toEqual({
			create: false,
			remove: false,
			update: false,
			view: false,
		});
	});
});

describe('getOrganizationClusterInstancePermissions', () => {
	// There are no instance:create / instance:delete permissions — instances are
	// added and removed through cluster updates, so those verbs follow the
	// cluster grants.
	it('drives create/remove from the cluster grants and update/view from the instance ones', () => {
		expect(getOrganizationClusterInstancePermissions(staff(['instance:read', 'instance:update']), ORG, CLUSTER))
			.toEqual({ create: false, remove: false, update: true, view: true });
		expect(getOrganizationClusterInstancePermissions(staff(['cluster:update']), ORG, CLUSTER)).toEqual({
			create: true,
			remove: false,
			update: false,
			view: false,
		});
	});
});

describe('getContainerOpsPermission', () => {
	// Roles shaped as central manager's aggregateRoles() returns them in /User/current: the org admin
	// role is created with permission.super_user false, and a non-admin aggregate has no permission.
	const clusters = (grant: boolean) => ({ create: grant, view: true, update: grant, delete: grant, resources: [] });
	const orgAdmin = {
		role: 'admin',
		organization: { id: ORG, clusters: clusters(true) },
		permission: { super_user: false, structure_user: [] },
	};
	const clusterUpdater = { role: 'operators', organization: { id: ORG, clusters: clusters(true) } };
	const customer = (role: object) =>
		({ fabricRole: 'least_privileged', staffPermissions: [], roles: { [ORG]: role } }) as unknown as User;

	it('denies a role whose only grant is cluster update, which the container endpoints refuse', () => {
		const user = customer(clusterUpdater);
		expect(getOrganizationClusterPermissions(user, ORG, CLUSTER).update).toBe(true);
		expect(getOrganizationClusterInstancePermissions(user, ORG, CLUSTER).update).toBe(true);
		expect(getContainerOpsPermission(user, ORG)).toBe(false);
	});

	it('recognizes the org admin role by its exact name, as isOrgAdmin() does', () => {
		expect(getContainerOpsPermission(customer(orgAdmin), ORG)).toBe(true);
		expect(getContainerOpsPermission(customer({ ...clusterUpdater, role: 'Admin' }), ORG)).toBe(false);
		// Not a signal central manager consults for this, so it must not grant the ops on its own.
		expect(getContainerOpsPermission(customer({ ...clusterUpdater, permission: { super_user: true } }), ORG))
			.toBe(false);
	});

	it('only counts an admin role in the organization being acted on, and not behind an OAuth lock', () => {
		expect(getContainerOpsPermission(customer(orgAdmin), 'org-2')).toBe(false);
		const locked = { organizationName: 'Org', oauthProviders: [{ name: 'Okta', oauthConfigId: 'oac-1' }] };
		expect(getContainerOpsPermission(customer(locked), ORG)).toBe(false);
		expect(getContainerOpsPermission(customer({ ...locked, role: 'admin' }), ORG)).toBe(false);
	});

	it('allows staff holding instance:update, and no other staff grant', () => {
		expect(getContainerOpsPermission(staff(['instance:update']), ORG)).toBe(true);
		expect(getContainerOpsPermission(staff(['cluster:update', 'cluster:read', 'instance:read']), ORG)).toBe(false);
		// An API that predates staffPermissions: hasStaffPermission falls back to the role name.
		expect(getContainerOpsPermission({ fabricRole: 'super_user', roles: {} } as unknown as User, ORG)).toBe(true);
	});
});

describe('canManageServiceAccounts', () => {
	const withRole = (role: object | undefined, overrides: Partial<User> = {}) =>
		({
			fabricRole: 'least_privileged',
			staffPermissions: [],
			roles: role ? { [ORG]: role } : {},
			...overrides,
		}) as unknown as User;

	it('admits an admin of the organization, as central manager does', () => {
		expect(canManageServiceAccounts(withRole({ role: 'admin', organization: {} }), ORG)).toBe(true);
	});

	it('refuses a member whose role is not admin, and a non-member', () => {
		expect(canManageServiceAccounts(withRole({ role: 'developer', organization: {} }), ORG)).toBe(false);
		expect(canManageServiceAccounts(withRole({ role: 'admin', organization: {} }), 'org-other')).toBe(false);
		expect(canManageServiceAccounts(null, ORG)).toBe(false);
	});

	it('admits the core super user, and staff only as admins of the organization', () => {
		expect(canManageServiceAccounts(withRole(undefined, { fabricRole: 'super_user' }), ORG)).toBe(true);
		expect(canManageServiceAccounts(withRole(undefined, { fabricRole: 'fabric_admin' }), ORG)).toBe(false);
		expect(
			canManageServiceAccounts(withRole({ role: 'admin', organization: {} }, { fabricRole: 'fabric_admin' }), ORG),
		).toBe(true);
	});

	it("refuses an admin membership locked behind the organization's required OAuth", () => {
		expect(canManageServiceAccounts(withRole({ oauthProviders: [{ name: 'okta', oauthConfigId: 'oac-1' }] }), ORG))
			.toBe(
				false,
			);
	});
});

describe('getOrganizationBillingPermissions', () => {
	const fabricStaff = staff(['org:read', 'billing:read', 'billing:write']);

	it('opens the billing pages and the card to billing:write staff without org:update', () => {
		expect(getOrganizationBillingPermissions(fabricStaff, ORG)).toEqual({ view: true, manage: true });
	});

	it('shows billing:read staff the pages but not the card controls', () => {
		expect(getOrganizationBillingPermissions(staff(['org:read', 'billing:read']), ORG)).toEqual({
			view: true,
			manage: false,
		});
	});

	it('keeps staff org:update in both', () => {
		expect(getOrganizationBillingPermissions(staff(['org:update']), ORG)).toEqual({ view: true, manage: true });
	});

	it('keeps the org-update rule for members, and refuses a member without it', () => {
		const roles = (update: boolean) =>
			({ [ORG]: { permission: null, organization: { update, delete: false } } }) as unknown as User['roles'];
		const member = (update: boolean) =>
			({ fabricRole: 'least_privileged', staffPermissions: [], roles: roles(update) }) as unknown as User;
		expect(getOrganizationBillingPermissions(member(true), ORG)).toEqual({ view: true, manage: true });
		expect(getOrganizationBillingPermissions(member(false), ORG)).toEqual({ view: false, manage: false });
	});
});
