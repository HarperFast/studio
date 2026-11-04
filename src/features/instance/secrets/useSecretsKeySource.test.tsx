/**
 * @vitest-environment jsdom
 */
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSecretsKeySource } from './useSecretsKeySource';

const { route, getCluster } = vi.hoisted(() => ({
	route: { clusterId: 'clu-1' as string | undefined },
	getCluster: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useParams: () => route }));
vi.mock('@/integrations/api/clusterIsSelfManaged', () => ({
	clusterIsSelfManaged: (cluster: { selfManaged: boolean }) => cluster.selfManaged,
}));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId?: string) => ({
		queryKey: [clusterId],
		queryFn: getCluster,
		enabled: !!clusterId,
		retry: false,
	}),
}));

const instanceParams = { instanceClient: {}, entityId: 'clu-1' } as unknown as InstanceClientIdConfig;

function renderKeySource() {
	const queryClient = new QueryClient();
	return renderHook(() => useSecretsKeySource(instanceParams), {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	}).result;
}

beforeEach(() => {
	route.clusterId = 'clu-1';
	getCluster.mockReset();
});

describe('useSecretsKeySource', () => {
	it('holds the key fetch until the cluster tier is known', () => {
		getCluster.mockReturnValue(new Promise(() => undefined));
		expect(renderKeySource().current).toMatchObject({ known: false, clusterInfoUnavailable: false });
	});

	it("asks central-manager for a managed cluster's key", async () => {
		getCluster.mockResolvedValue({ selfManaged: false });
		const result = renderKeySource();
		await waitFor(() => expect(result.current.known).toBe(true));
		expect(result.current.keySource.managedClusterId).toBe('clu-1');
	});

	it('asks the node on a self-managed cluster', async () => {
		getCluster.mockResolvedValue({ selfManaged: true });
		const result = renderKeySource();
		await waitFor(() => expect(result.current.known).toBe(true));
		expect(result.current.keySource.managedClusterId).toBeUndefined();
	});

	it('never guesses a key source when the cluster lookup failed', async () => {
		getCluster.mockRejectedValue(new Error('unavailable'));
		const result = renderKeySource();
		await waitFor(() => expect(result.current.clusterInfoUnavailable).toBe(true));
		expect(result.current.known).toBe(false);
		expect(result.current.keySource.managedClusterId).toBeUndefined();
	});

	it('needs no lookup in Local Studio, where the node is always right', () => {
		route.clusterId = undefined;
		expect(renderKeySource().current).toMatchObject({ known: true, clusterInfoUnavailable: false });
	});
});
