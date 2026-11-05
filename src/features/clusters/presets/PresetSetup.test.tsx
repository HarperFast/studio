/** @vitest-environment jsdom */
import { CLUSTER_PRESETS } from '@/features/clusters/presets/clusterPresets';
import { PresetSetup } from '@/features/clusters/presets/PresetSetup';
import type { StudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { answer, runPresetSetup, stable } = vi.hoisted(() => ({
	answer: { read: undefined as (() => Promise<StudioConfiguration>) | undefined },
	runPresetSetup: vi.fn(),
	stable: {
		params: { organizationId: 'org-1', clusterId: 'clu-1' },
		context: { cluster: { id: 'clu-1', preset: 'redirects' } },
		instanceParams: { instanceClient: {}, entityId: 'clu-1', entityType: 'cluster' },
		navigate: () => Promise.resolve(),
	},
}));

vi.mock('@tanstack/react-router', () => ({
	Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
	useNavigate: () => stable.navigate,
	useParams: () => stable.params,
	useRouteContext: () => stable.context,
}));
vi.mock('@/features/clusters/presets/usePresetSetup', () => ({ useClusterPreset: () => CLUSTER_PRESETS[0] }));
vi.mock('@/features/clusters/presets/runPresetSetup', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/clusters/presets/runPresetSetup')>()),
	runPresetSetup,
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => true }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => stable.instanceParams }));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => false,
}));
vi.mock('@/features/instance/extensions/ExtensionIcon', () => ({ ExtensionIcon: () => null }));
vi.mock('@/integrations/api/instance/studio/getStudioConfiguration', () => ({
	getStudioConfigurationQueryOptions: ({ entityId, enabled }: { entityId: string; enabled?: boolean }) => ({
		queryKey: [entityId, 'get_studio_configuration'],
		queryFn: () => answer.read!(),
		retry: false,
		enabled: enabled !== false,
	}),
}));

function renderSetup(read: () => Promise<StudioConfiguration>) {
	answer.read = read;
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<PresetSetup />
		</QueryClientProvider>,
	);
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
	runPresetSetup.mockReset();
	runPresetSetup.mockReturnValue(new Promise(() => undefined));
});
afterEach(cleanup);

describe('PresetSetup', () => {
	it('starts by itself on a cluster with no Studio settings of its own', async () => {
		renderSetup(async () => ({ navigation: {}, pages: [] }));
		await waitFor(() => expect(runPresetSetup).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole('button', { name: /^Set up/ })).toBeNull();
	});

	it('waits for the cluster’s settings before starting', async () => {
		renderSetup(() => new Promise(() => undefined));
		await settled();
		expect(runPresetSetup).not.toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: /^Set up/ })).toBeNull();
	});

	it.each([
		[
			'a landing page',
			{ navigation: {}, landing: 'databases', pages: [] },
			/keeps the cluster's landing page \(databases\)/,
		],
		['a tab placement', { navigation: { logs: 'hidden' as const }, pages: [] }, /opens the cluster on HTTP redirects/],
	])(
		'waits for a click when the cluster already has %s, and says what setup will do',
		async (_case, configuration, says) => {
			renderSetup(async () => configuration);
			const button = await screen.findByRole('button', { name: 'Set up HTTP redirects' });
			expect(screen.getByText(says)).toBeTruthy();
			expect(runPresetSetup).not.toHaveBeenCalled();

			fireEvent.click(button);
			await waitFor(() => expect(runPresetSetup).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('button', { name: 'Set up HTTP redirects' })).toBeNull();
		},
	);

	it('waits for a click when it cannot read the cluster’s settings', async () => {
		renderSetup(() => Promise.reject(new Error('500')));
		await screen.findByRole('button', { name: 'Set up HTTP redirects' });
		expect(screen.getByText(/could not read this cluster's settings/)).toBeTruthy();
		expect(runPresetSetup).not.toHaveBeenCalled();
	});
});
