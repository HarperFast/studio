/**
 * @vitest-environment jsdom
 *
 * A plan-ended cluster is not necessarily a stopped one. central-manager writes `suspendedReason`
 * BEFORE it stops the cluster and defers to a later pass if the cluster is mid-transition, so
 * RUNNING or PARTIAL with a lapsed grant is a real, persistent state — and its container gate
 * admits `stop` unconditionally. Hiding the whole group on "start is blocked" left a customer's
 * running, billing cluster with Terminate as its only control.
 */
import { Cluster } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterStateMenu } from './ClusterStateMenu';

vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, update: true, remove: true, create: true }),
}));
vi.mock('@/hooks/useClusterContainerOps', () => ({
	useClusterContainerOps: () => ({ run: vi.fn(), isPending: false }),
}));
vi.mock('@/features/clusters/mutations/terminateCluster', () => ({
	useTerminateClusterMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => cleanup());

function cluster(overrides: Partial<Cluster>): Cluster {
	return {
		id: 'clu-test',
		name: 'Test',
		organizationId: 'org-test',
		status: 'RUNNING',
		plans: [{ planId: 'fabric-block-trial', regionId: 'us-1' }],
		...overrides,
	} as Cluster;
}

const lapsedGrant = { isActive: false, status: 'EXPIRED', source: 'trial' } as Cluster['grant'];

async function openMenu(c: Cluster): Promise<string[]> {
	render(
		<TestProvider>
			<ClusterStateMenu cluster={c} />
		</TestProvider>,
	);
	await act(() => null);
	// DropdownMenu (unlike Select) opens on pointerDown in jsdom.
	fireEvent.pointerDown(
		screen.getByRole('button', { name: /Cluster actions/ }),
		{ button: 0, ctrlKey: false, pointerType: 'mouse' },
	);
	await act(() => null);
	return screen.getAllByRole('menuitem').map((node) => (node.textContent ?? '').trim());
}

describe('ClusterStateMenu — a suspended cluster that is still up', () => {
	it('keeps Stop and Restart on a RUNNING cluster whose plan has ended', async () => {
		const items = await openMenu(cluster({ status: 'RUNNING', suspendedReason: 'PLAN_ENDED', grant: lapsedGrant }));
		// The server admits `stop` unconditionally — taking it away strands a billing cluster.
		expect(items).toContain('Stop');
		expect(items).toContain('Restart');
		expect(items).toContain('Terminate');
	});

	it('keeps them on a PARTIAL cluster too', async () => {
		const items = await openMenu(cluster({ status: 'PARTIAL', suspendedReason: 'PLAN_ENDED', grant: lapsedGrant }));
		expect(items).toContain('Stop');
	});

	// Start is the one action the server refuses with a 402, so it is offered but not usable.
	it('disables Start rather than pretending it will work', async () => {
		await openMenu(cluster({ status: 'PARTIAL', suspendedReason: 'PLAN_ENDED', grant: lapsedGrant }));
		const start = screen.getAllByRole('menuitem').find((node) => node.textContent?.trim() === 'Start');
		expect(start?.getAttribute('data-disabled')).not.toBeNull();
	});
});

describe('ClusterStateMenu — a suspended cluster that is down', () => {
	// Here the group really would be a heading over two refused Starts, so it goes.
	it('drops the container group entirely, leaving Terminate', async () => {
		const items = await openMenu(cluster({ status: 'STOPPED', suspendedReason: 'PLAN_ENDED', grant: lapsedGrant }));
		expect(items).toEqual(['Terminate']);
	});

	it('keeps the full group for an ordinary stopped cluster', async () => {
		const items = await openMenu(cluster({ status: 'STOPPED' }));
		expect(items).toContain('Start');
		expect(items).toContain('Stop');
	});
});
