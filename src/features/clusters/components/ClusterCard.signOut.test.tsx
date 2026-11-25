/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { storedSignInMarkers } from '@/features/auth/store/signInMarkersTestHelpers';
import { describeCluster } from '@/features/clusters/lib/clusterListModel';
import type { Cluster, Instance, LocalUser } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterCard } from './ClusterCard';

const { getClusterInfo, clusterClient } = vi.hoisted(() => ({
	getClusterInfo: vi.fn(),
	clusterClient: { post: vi.fn() },
}));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', async importOriginal => ({
	...await importOriginal<typeof import('@/features/cluster/queries/getClusterInfoQuery')>(),
	getClusterInfo,
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClient: () => clusterClient }));
vi.mock(
	'@tanstack/react-query',
	async importOriginal => ({
		...await importOriginal<typeof import('@tanstack/react-query')>(),
		useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	}),
);
vi.mock('@tanstack/react-router', () => {
	const router = { navigate: vi.fn(), invalidate: vi.fn() };
	return {
		useParams: () => ({}),
		useRouter: () => router,
		Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
	};
});
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, create: true, update: true, remove: true }),
	useContainerOpsPermission: () => false,
}));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [null, vi.fn()] }));
vi.mock(
	'@/hooks/useClusterContainerOps',
	() => ({ useClusterContainerOps: () => ({ run: vi.fn(), isPending: false }) }),
);
vi.mock(
	'@/features/clusters/mutations/terminateCluster',
	async importOriginal => ({
		...await importOriginal<typeof import('@/features/clusters/mutations/terminateCluster')>(),
		useTerminateClusterMutation: () => ({ mutate: vi.fn(), isPending: false }),
	}),
);
vi.mock('@/features/clusters/components/ClusterProgress', () => ({ ClusterProgress: () => null }));

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});

const user = { username: 'admin' } as LocalUser;
const cluster = {
	id: 'clu-a',
	name: 'Production',
	organizationId: 'org-a',
	status: 'RUNNING',
	fqdn: 'api.example.test',
	plans: [{ planId: 'shared', region: 'US East' }],
} as Cluster;
const instance = (id: string, instanceFqdn?: string) =>
	({ id, clusterId: 'clu-a', instanceFqdn, operationsApiPort: 9925, operationsApiSecure: true }) as Instance;

afterEach(() => {
	cleanup();
	for (const id of ['clu-a', 'ins-a', 'ins-b']) {
		authStore.signOutLocally(id);
	}
	localStorage.clear();
	vi.clearAllMocks();
});

function signedOut(id: string) {
	return {
		user: authStore.getConnectionById(id).user,
		marker: storedSignInMarkers()[id],
		fabricConnect: authStore.checkForFabricConnect(id),
		basicAuth: authStore.checkForBasicAuth(id),
	};
}

const cleared = { user: null, marker: undefined, fabricConnect: false, basicAuth: undefined };

function signInToClusterAndInstances() {
	authStore.flagForBasicAuth('clu-a', { username: 'admin', password: 'pw' });
	authStore.setUserForEntity(cluster, user);
	authStore.flagForFabricConnect('ins-a', true);
	authStore.setUserForEntity(instance('ins-a', 'node-a.example.test'), user);
	authStore.flagForBasicAuth('ins-b', { username: 'admin', password: 'pw' });
	authStore.setUserForEntity(instance('ins-b', 'node-b.example.test'), user);
}

const openMenu = () =>
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Cluster options' }), { button: 0, ctrlKey: false });

async function signOutOfCluster() {
	render(<ClusterCard item={describeCluster(cluster)} />);
	openMenu();
	fireEvent.click(screen.getByRole('menuitem', { name: 'Direct Sign Out' }));
	await vi.waitFor(() => expect(authStore.getConnectionById('clu-a').user).toBeNull());
}

describe('ClusterCard Direct Sign Out', () => {
	it('signs out an instance central manager now lists without an address (#2021)', async () => {
		signInToClusterAndInstances();
		expect(storedSignInMarkers()).toEqual({
			'clu-a': 'https://api.example.test:9925/',
			'ins-a': 'https://node-a.example.test:9925/',
			'ins-b': 'https://node-b.example.test:9925/',
		});
		getClusterInfo.mockResolvedValue({
			...cluster,
			instances: [instance('ins-a'), instance('ins-b', 'node-b.example.test')],
		});
		clusterClient.post.mockResolvedValue({ data: { message: 'Logout successful' } });

		await signOutOfCluster();

		expect(signedOut('ins-a')).toEqual(cleared);
		expect(signedOut('ins-b')).toEqual(cleared);
		expect(signedOut('clu-a')).toEqual(cleared);
		expect(clusterClient.post).toHaveBeenCalledExactlyOnceWith('/', { operation: 'logout' });
		expect(getClusterInfo).toHaveBeenCalledWith('clu-a');
	});

	it('signs out locally when the cluster logout fails', async () => {
		signInToClusterAndInstances();
		getClusterInfo.mockResolvedValue({
			...cluster,
			instances: [instance('ins-a', 'node-a.example.test'), instance('ins-b', 'node-b.example.test')],
		});
		clusterClient.post.mockRejectedValue(new Error('Network Error'));

		await signOutOfCluster();

		for (const id of ['clu-a', 'ins-a', 'ins-b']) {
			expect(signedOut(id), id).toEqual(cleared);
		}
	});

	it.each([
		['succeeds', () => clusterClient.post.mockResolvedValue({ data: { message: 'Logout successful' } })],
		['fails', () => clusterClient.post.mockRejectedValue(new Error('Network Error'))],
	])('gives the menu back once signed out, when the cluster logout %s', async (_, answer) => {
		authStore.setUserForEntity(cluster, user);
		getClusterInfo.mockResolvedValue({ ...cluster, instances: [] });
		answer();

		await signOutOfCluster();
		openMenu();

		await vi.waitFor(() =>
			expect(screen.getByRole('menuitem', { name: 'Direct Sign In' }).getAttribute('aria-disabled')).toBeNull()
		);
		expect(screen.getByRole('menuitem', { name: 'Instances' }).getAttribute('aria-disabled')).toBeNull();
	});

	it('signs out only the cluster when its instances cannot be read', async () => {
		authStore.setUserForEntity(cluster, user);
		authStore.setUserForEntity(instance('ins-b', 'node-b.example.test'), user);
		getClusterInfo.mockRejectedValue(new Error('offline'));
		clusterClient.post.mockResolvedValue({ data: { message: 'Logout successful' } });

		await signOutOfCluster();

		expect(storedSignInMarkers()).toEqual({ 'ins-b': 'https://node-b.example.test:9925/' });
	});
});
