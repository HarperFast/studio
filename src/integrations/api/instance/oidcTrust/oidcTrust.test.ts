import type { EntityIds } from '@/features/auth/store/authStore';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	dropTrustPolicy,
	OidcTrustPolicy,
	setTrustPolicyEnabled,
	supportsTrustPolicies,
	trustPolicyResaveRequest,
} from './oidcTrust';

function policy(overrides: Partial<OidcTrustPolicy> = {}): OidcTrustPolicy {
	return {
		id: 'github-actions-my-app',
		issuer: 'https://token.actions.githubusercontent.com',
		audience: 'https://my-cluster.example.com:9925/',
		claims: {
			repository_id: '123456',
			workflow_ref: 'acme/my-app/.github/workflows/deploy.yaml@refs/heads/main',
			environment: 'production',
		},
		user: 'my-app-ci-deploy',
		operations: ['deploy_component', 'get_job'],
		enabled: true,
		description: 'Deploys acme/my-app',
		updated_by: 'admin',
		__createdtime__: 1,
		__updatedtime__: 2,
		...overrides,
	};
}

function clientListing(policies: OidcTrustPolicy[]) {
	const post = vi.fn(async (_url: string, body: { operation: string }) =>
		body.operation === 'list_oidc_trust' ? { data: { policies } } : { data: { message: 'ok' } }
	);
	return {
		post,
		params: { instanceClient: { post } as unknown as AxiosInstance, entityId: 'entity-1' as EntityIds },
	};
}

describe('supportsTrustPolicies', () => {
	it('starts at the first 5.3 prerelease, which shipped the trust-policy operations', () => {
		expect(supportsTrustPolicies(undefined)).toBe(false);
		expect(supportsTrustPolicies('5.2.15')).toBe(false);
		expect(supportsTrustPolicies('5.3.0-alpha.1')).toBe(true);
		expect(supportsTrustPolicies('5.3.2')).toBe(true);
	});
});

describe('trustPolicyResaveRequest', () => {
	it('sends every stored field back, with only enabled changed', () => {
		expect(trustPolicyResaveRequest(policy(), false)).toEqual({
			operation: 'add_oidc_trust',
			id: 'github-actions-my-app',
			issuer: 'https://token.actions.githubusercontent.com',
			audience: 'https://my-cluster.example.com:9925/',
			claims: policy().claims,
			user: 'my-app-ci-deploy',
			operations: ['deploy_component', 'get_job'],
			enabled: false,
			description: 'Deploys acme/my-app',
		});
	});

	it('omits the nulls add_oidc_trust would reject, keeping an unscoped policy unscoped', () => {
		const request = trustPolicyResaveRequest(policy({ operations: null, description: null }), true);
		expect(request).not.toHaveProperty('operations');
		expect(request).not.toHaveProperty('description');
		expect(request.enabled).toBe(true);
	});

	it('carries a field a newer Harper stores, which a fixed field list would erase on re-save', () => {
		const withNewField = { ...policy(), max_token_lifetime: 900 } as OidcTrustPolicy;
		expect(trustPolicyResaveRequest(withNewField, false)).toMatchObject({ max_token_lifetime: 900, enabled: false });
	});

	it('refuses a malformed scope rather than dropping it, which would widen the token', () => {
		expect(() => trustPolicyResaveRequest(policy({ operations: 'deploy_component' }), false)).toThrow(
			/malformed operations scope/,
		);
		expect(() => trustPolicyResaveRequest(policy({ operations: ['deploy_component', 7] }), false)).toThrow(
			/malformed operations scope/,
		);
	});
});

describe('setTrustPolicyEnabled', () => {
	it('re-reads the policy and writes the fresh row with enabled flipped', async () => {
		const { post, params } = clientListing([policy()]);
		await setTrustPolicyEnabled({ ...params, loaded: policy(), enabled: false });
		expect(post).toHaveBeenCalledTimes(2);
		expect(post.mock.calls[0][1]).toEqual({ operation: 'list_oidc_trust' });
		expect(post.mock.calls[1][1]).toEqual(trustPolicyResaveRequest(policy(), false));
	});

	it('refuses when another administrator changed the policy after the page loaded it', async () => {
		// Re-saving the stale copy would quietly undo the narrowing.
		const narrowed = policy({ operations: ['deploy_component'], __updatedtime__: 3 });
		const { post, params } = clientListing([narrowed]);
		await expect(setTrustPolicyEnabled({ ...params, loaded: policy(), enabled: false })).rejects.toThrow(
			/changed since this page loaded it/,
		);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('refuses a change to a resent field even when the update time is unchanged', async () => {
		const { post, params } = clientListing([policy({ claims: { repository_id: '999' } })]);
		await expect(setTrustPolicyEnabled({ ...params, loaded: policy(), enabled: false })).rejects.toThrow(
			/changed since this page loaded it/,
		);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('accepts the same row with its claims listed in another order', async () => {
		const reordered = policy({ claims: Object.fromEntries(Object.entries(policy().claims).reverse()) });
		const { post, params } = clientListing([reordered]);
		await setTrustPolicyEnabled({ ...params, loaded: policy(), enabled: false });
		expect(post).toHaveBeenCalledTimes(2);
	});

	it('refuses when the policy has been dropped, rather than recreating it', async () => {
		const { post, params } = clientListing([]);
		await expect(setTrustPolicyEnabled({ ...params, loaded: policy(), enabled: true })).rejects.toThrow(
			/no longer exists/,
		);
		expect(post).toHaveBeenCalledTimes(1);
	});
});

describe('dropTrustPolicy', () => {
	it('drops the policy by id once it reads back unchanged', async () => {
		const { post, params } = clientListing([policy()]);
		await dropTrustPolicy({ ...params, loaded: policy() });
		expect(post.mock.calls[1][1]).toEqual({ operation: 'drop_oidc_trust', id: 'github-actions-my-app' });
	});

	it('refuses to drop a policy that was replaced under the same id after the page loaded it', async () => {
		const { post, params } = clientListing([policy({ user: 'someone-else', __updatedtime__: 9 })]);
		await expect(dropTrustPolicy({ ...params, loaded: policy() })).rejects.toThrow(/changed since this page loaded it/);
		expect(post).toHaveBeenCalledTimes(1);
	});
});
