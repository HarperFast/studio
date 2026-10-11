/**
 * @vitest-environment jsdom
 */
import { ConfigTrustPoliciesIndex } from '@/features/instance/config/trustPolicies';
import type { OidcTrustPolicy } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, setEnabled, dropPolicy, refetch, queryOptionsSeen } = vi.hoisted(() => ({
	state: {
		canManage: true,
		version: '5.3.0' as string | undefined,
		policies: [] as unknown[] | undefined,
		isError: false,
	},
	setEnabled: vi.fn(async () => ({ message: 'ok' })),
	dropPolicy: vi.fn(async () => ({ message: 'ok' })),
	refetch: vi.fn(async () => undefined),
	queryOptionsSeen: [] as Array<{ queryKey: readonly unknown[]; enabled?: boolean }>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		queryOptionsSeen.push(options);
		if (options.queryKey[0] === 'registration_info') {
			return { data: state.version === undefined ? undefined : { version: state.version } };
		}
		return { data: state.policies, isFetching: false, isError: state.isError, refetch };
	},
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1' }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/integrations/api/instance/oidcTrust/oidcTrust', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/oidcTrust/oidcTrust')>()),
	useSetTrustPolicyEnabled: () => ({ mutateAsync: setEnabled, isPending: false }),
	useDropTrustPolicy: () => ({ mutateAsync: dropPolicy, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), loading: vi.fn() } }));

function policy(overrides: Partial<OidcTrustPolicy> = {}): OidcTrustPolicy {
	return {
		id: 'github-actions-my-app',
		issuer: 'https://token.actions.githubusercontent.com',
		audience: 'https://my-cluster.example.com:9925/',
		claims: { repository_id: '123456', environment: ['production', 'staging'] },
		user: 'my-app-ci-deploy',
		operations: ['deploy_component', 'get_job'],
		enabled: true,
		description: null,
		...overrides,
	};
}

function card(id: string) {
	return screen.getByRole('listitem', { name: `Trust policy ${id}` });
}

beforeEach(() => {
	state.canManage = true;
	state.version = '5.3.0';
	state.policies = [];
	state.isError = false;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	queryOptionsSeen.length = 0;
});

function listQueryEnabled() {
	return queryOptionsSeen.filter((options) => options.queryKey[1] === 'list_oidc_trust').at(-1)?.enabled;
}

describe('ConfigTrustPoliciesIndex', () => {
	it('never asks a non-super user instance for its trust policies', () => {
		state.canManage = false;
		render(<ConfigTrustPoliciesIndex />);
		expect(screen.getByText(/Only super users/)).toBeTruthy();
		expect(listQueryEnabled()).toBe(false);
	});

	it('says which Harper version it needs instead of listing on an older instance', () => {
		state.version = '5.2.15';
		render(<ConfigTrustPoliciesIndex />);
		expect(screen.getByText(/need Harper 5.3 or later\. This instance runs 5\.2\.15/)).toBeTruthy();
		expect(listQueryEnabled()).toBe(false);
	});

	it('lists what each policy trusts, who it signs in as, and what its token may run', () => {
		state.policies = [policy()];
		render(<ConfigTrustPoliciesIndex />);
		expect(listQueryEnabled()).toBe(true);
		const item = within(card('github-actions-my-app'));
		expect(item.getByText('Enabled')).toBeTruthy();
		expect(item.getByText('https://my-cluster.example.com:9925/')).toBeTruthy();
		expect(item.getByText('repository_id = 123456')).toBeTruthy();
		expect(item.getByText('environment = production or staging')).toBeTruthy();
		expect(item.getByText('my-app-ci-deploy')).toBeTruthy();
		expect(item.getByText('deploy_component, get_job')).toBeTruthy();
	});

	it("says an unscoped policy's token carries the user's whole role", () => {
		state.policies = [policy({ operations: null })];
		render(<ConfigTrustPoliciesIndex />);
		expect(within(card('github-actions-my-app')).getByText(/the token carries everything my-app-ci-deploy's role/))
			.toBeTruthy();
	});

	it('shows why Harper refuses a policy, and offers only Drop since re-saving would fail the same check', () => {
		state.policies = [policy({ invalid_reason: "names user 'my-app-ci-deploy', which does not exist" })];
		render(<ConfigTrustPoliciesIndex />);
		const item = within(card('github-actions-my-app'));
		expect(item.getByText("Can't match")).toBeTruthy();
		expect(item.getByText(/Harper refuses every token for this policy: names user/)).toBeTruthy();
		expect(item.queryByRole('button', { name: 'Disable' })).toBeNull();
		expect(item.getByRole('button', { name: 'Drop' })).toBeTruthy();
	});

	it('renders a malformed row as text instead of crashing the page', () => {
		state.policies = [
			policy({
				id: 'odd',
				claims: { repository_id: { nested: true } },
				operations: 'deploy_component',
				enabled: 'false',
			}),
		];
		render(<ConfigTrustPoliciesIndex />);
		const item = within(card('odd'));
		expect(item.getByText('repository_id = {"nested":true}')).toBeTruthy();
		// enabled is not a boolean, so the policy is neither shown as live nor offered a toggle.
		expect(item.getByText('Disabled')).toBeTruthy();
		expect(item.queryByRole('button', { name: /able$/ })).toBeNull();
	});

	it('disables an enabled policy from the row it was loaded as, then refetches', async () => {
		const loaded = policy();
		state.policies = [loaded];
		render(<ConfigTrustPoliciesIndex />);
		fireEvent.click(within(card('github-actions-my-app')).getByRole('button', { name: 'Disable' }));
		await waitFor(() => expect(refetch).toHaveBeenCalled());
		expect(setEnabled).toHaveBeenCalledWith(expect.objectContaining({ loaded, enabled: false }));
	});

	it('offers Enable on a disabled policy', () => {
		state.policies = [policy({ enabled: false })];
		render(<ConfigTrustPoliciesIndex />);
		expect(within(card('github-actions-my-app')).getByRole('button', { name: 'Enable' })).toBeTruthy();
	});

	it('drops a policy only after confirmation', async () => {
		state.policies = [policy()];
		render(<ConfigTrustPoliciesIndex />);
		fireEvent.click(within(card('github-actions-my-app')).getByRole('button', { name: 'Drop' }));
		expect(dropPolicy).not.toHaveBeenCalled();
		const dialog = await screen.findByRole('dialog');
		fireEvent.click(within(dialog).getByRole('button', { name: /Drop/ }));
		await waitFor(() =>
			expect(dropPolicy).toHaveBeenCalledWith(expect.objectContaining({ id: 'github-actions-my-app' }))
		);
		await waitFor(() => expect(refetch).toHaveBeenCalled());
	});

	it('says when there are no policies, and when they could not be loaded', () => {
		render(<ConfigTrustPoliciesIndex />);
		expect(screen.getByText(/No trust policies yet/)).toBeTruthy();
		cleanup();
		state.isError = true;
		render(<ConfigTrustPoliciesIndex />);
		expect(screen.getByText(/could not be loaded/)).toBeTruthy();
	});
});
