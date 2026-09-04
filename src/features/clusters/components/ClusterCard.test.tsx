/**
 * @vitest-environment jsdom
 */
import { Cluster, ClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterCard } from './ClusterCard';

vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, update: true, remove: true, create: true }),
}));
vi.mock('@/hooks/useClusterContainerOps', () => ({
	useClusterContainerOps: () => ({ run: vi.fn(), isPending: false }),
}));
vi.mock('@/features/clusters/mutations/terminateCluster', () => ({
	useTerminateClusterMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Partial: the test router's error boundary reads useOverallAuth from the same module.
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/useAuth')>()),
	useInstanceAuth: () => ({ user: null, isLoading: false }),
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClient: () => ({}),
}));

afterEach(() => cleanup());

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function cluster(grant: Partial<ClusterGrant> | null): Cluster {
	return {
		id: 'clu-test',
		name: 'Test Cluster',
		organizationId: 'org-test',
		status: 'RUNNING',
		fqdn: 'test.example.harperfabric.com',
		plans: [{ planId: 'fabric-block-trial', regionId: 'us-1' }],
		grant: grant && {
			id: 'cgr-test',
			source: 'trial',
			status: 'ACTIVE',
			isActive: true,
			startsAt: daysFromNow(-1),
			endsAt: daysFromNow(29),
			cycleAnchor: null,
			expiryPolicy: 'consumer-trial',
			currentStage: null,
			stageUpdatedAt: null,
			allowedPlanIds: null,
			allowedRegionIds: null,
			timeline: null,
			...grant,
		},
	} as Cluster;
}

async function renderCard(c: Cluster) {
	render(
		<TestProvider>
			<ClusterCard cluster={c} />
		</TestProvider>,
	);
	await act(() => null);
}

describe('ClusterCard — trial reminder', () => {
	it('shows a Trial pill with the end date for a healthy trial', async () => {
		await renderCard(cluster({}));
		const pill = screen.getByText(/^Trial · ends /);
		expect(pill.getAttribute('title')).toMatch(/^Trial ends /);
	});

	it('shows nothing extra for a purchased plan', async () => {
		await renderCard(cluster({ source: 'purchased', expiryPolicy: null }));
		expect(screen.queryByText(/^Trial/)).toBeNull();
	});

	// The reminder and the countdown share a slot; once the runner stages the grant, only the
	// countdown is shown.
	it('gives way to the expiry countdown once the trial is staged', async () => {
		await renderCard(cluster({ currentStage: 'WARNED', endsAt: daysFromNow(5) }));
		expect(screen.queryByText(/^Trial/)).toBeNull();
		expect(screen.getByText('Ends in 5 days')).toBeTruthy();
	});
});
