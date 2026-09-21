/**
 * @vitest-environment jsdom
 *
 * Revoke is irreversible and save is a write: a second click while the first is in flight must
 * send nothing (#831). isPending only disables the buttons a tick after the click.
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrantFormModal } from './GrantFormModal';

// Never settles: the guard, not the callback, is what stops the second click.
const updateGrant = vi.fn();
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useUpdateGrantMutation: () => ({ mutate: updateGrant, isPending: false }),
}));
vi.mock('@/features/admin/plans/queries/getPlans', () => ({
	getPlansQueryOptions: () => ({
		queryKey: ['test-plans'],
		queryFn: async () => [
			{
				id: 'plan-hobby',
				name: 'Hobbyist',
				deploymentDescription: 'Colocated',
				performanceDescription: 'Small',
				priceUsd: 20,
			},
		],
		retry: false,
	}),
}));
vi.mock('@/features/admin/regions/queries/getRegions', () => ({
	getRegionsQueryOptions: () => ({
		queryKey: ['test-regions'],
		queryFn: async () => [{ id: 'us-east-1', region: 'US East' }],
		retry: false,
	}),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({ editableAtRuntime: false, policies: { 'consumer-trial': [], 'enterprise-grace': [] } }),
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	updateGrant.mockClear();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const grant: AdminClusterGrant = {
	id: 'cgr-a',
	organizationId: 'org-1',
	clusterId: 'clu-a',
	source: 'comped',
	status: 'ACTIVE',
	shape: [{ planId: 'plan-hobby', regionId: 'us-east-1' }],
	startsAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
	endsAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
	expiryPolicy: null,
	currentStage: null,
} as AdminClusterGrant;

async function mount() {
	render(
		<TestProvider>
			<GrantFormModal open onOpenChange={() => {}} grant={grant} />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('GrantFormModal — one write at a time', () => {
	it('a second click on Revoke while the first is in flight sends nothing', async () => {
		await mount();
		fireEvent.change(screen.getByPlaceholderText(/Why these terms/), { target: { value: 'ending the pilot' } });
		await act(() => null);
		const revoke = screen.getByRole('button', { name: 'Revoke grant' });
		fireEvent.click(revoke);
		fireEvent.click(revoke);
		await act(() => null);
		expect(updateGrant).toHaveBeenCalledTimes(1);
		expect(updateGrant.mock.calls[0][0]).toMatchObject({ id: 'cgr-a', changes: { status: 'REVOKED' } });
	});
});
