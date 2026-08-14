/** @vitest-environment jsdom */
// jsdom: usePermissions imports useAuth, whose authStore touches localStorage at module load.
import type { User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { getOrganizationClusterInstancePermissions, getOrganizationClusterPermissions } from './usePermissions';

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
