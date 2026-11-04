/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The row cells and both instance menus are real; only the network, auth and layout chrome are faked.
const state = vi.hoisted(() => ({ cluster: undefined as unknown, statusRequests: [] as string[] }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterInstancePermissions: () => ({ update: true }),
	useContainerOpsPermission: () => true,
}));
vi.mock(
	'@/hooks/useAuth',
	async importOriginal => ({
		...await importOriginal<typeof import('@/hooks/useAuth')>(),
		useInstanceAuth: () => ({ user: undefined, isLoading: false }),
	}),
);
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClient: () => ({}),
	useInstanceClientIdParams: ({ instanceId }: { instanceId: string }) => ({
		entityId: instanceId,
		instanceClient: {
			post: async () => {
				state.statusRequests.push(instanceId);
				return { data: { systemStatus: [{ id: 'availability', status: 'Available' }], componentStatus: [] } };
			},
		},
	}),
}));
vi.mock('@/integrations/api/instance/status/setStatus', () => ({ useSetStatus: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useInstanceContainerOps', () => ({ useInstanceContainerOps: () => ({ run: vi.fn() }) }));
vi.mock('./queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: ['cluster', clusterId],
		queryFn: async () => state.cluster,
		retry: false,
	}),
}));

import { Instances } from './Instances';

const reachable = {
	id: 'ins-1',
	name: 'reachable',
	instanceFqdn: 'a.example.com',
	operationsApiPort: 9925,
	operationsApiSecure: true,
	status: 'RUNNING',
	version: '4.7.3',
};
const addressless = {
	id: 'ins-2',
	name: 'addressless',
	operationsApiPort: 9925,
	operationsApiSecure: true,
	status: 'RUNNING',
	version: '4.7.3',
};

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});
beforeEach(() => {
	vi.useFakeTimers();
	state.statusRequests = [];
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

async function renderInstances(cluster: Partial<Cluster>) {
	state.cluster = { id: 'clu-1', organizationId: 'org-1', ...cluster };
	const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
	render(
		<QueryClientProvider client={queryClient}>
			<Instances />
		</QueryClientProvider>,
	);
	// Past the status cells' per-row stagger and one 10s poll.
	await act(() => vi.advanceTimersByTimeAsync(12_000));
	return queryClient;
}

function rowContaining(text: string) {
	return screen.getByText(text).closest('tr')!;
}

describe('Instances with an instance that has no FQDN', () => {
	it('renders every row, and offers no sign-in or status for the one without an address', async () => {
		const queryClient = await renderInstances({ instances: [reachable, addressless] as Cluster['instances'] });

		const reachableRow = rowContaining('reachable');
		expect(within(reachableRow).getByText('Direct Sign In')).toBeTruthy();
		expect(state.statusRequests).toContain('ins-1');

		const addresslessRow = rowContaining('addressless');
		expect(within(addresslessRow).getByText('—')).toBeTruthy();
		expect(within(addresslessRow).queryByText('Direct Sign In')).toBeNull();
		expect(within(addresslessRow).queryByText('Fabric Connect')).toBeNull();
		expect(within(addresslessRow).getByLabelText('Status unavailable')).toBeTruthy();
		expect(state.statusRequests).not.toContain('ins-2');

		fireEvent.pointerDown(within(addresslessRow).getByRole('button', { name: 'Instance options' }), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getByRole('menuitem', { name: 'Restart' })).toBeTruthy();
		for (const name of ['Direct Sign In', 'Fabric Connect', 'Copy Instance FQDN', 'Copy API URL']) {
			expect(screen.queryByRole('menuitem', { name })).toBeNull();
		}
		expect(state.statusRequests).not.toContain('ins-2');
		queryClient.clear();
	});

	it('shows a placeholder URL for it on a self-hosted cluster', async () => {
		const queryClient = await renderInstances({
			plans: [{ planId: 'self-hosted-basic' }] as Cluster['plans'],
			instances: [reachable, addressless] as Cluster['instances'],
		});

		const rows = screen.getAllByRole('row').slice(1);
		expect(rows).toHaveLength(2);
		expect(within(rows[0]).getByText('https://a.example.com:9925')).toBeTruthy();
		expect(within(rows[1]).getAllByText('—')).toHaveLength(2);
		queryClient.clear();
	});
});
