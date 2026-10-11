/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigDeploymentsIndex } from './index';

const state = vi.hoisted(() => ({
	version: undefined as string | undefined,
	listEnabled: [] as (boolean | undefined)[],
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => true }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({ entityId: 'ins-a' }) }));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['registration_info', 'ins-a'],
		queryFn: () => new Promise(() => {}),
		...(state.version === undefined ? {} : { initialData: { version: state.version } }),
	}),
}));
vi.mock('@/integrations/api/instance/deployments/listDeployments', () => ({
	getDeploymentsQueryOptions: ({ enabled }: { enabled?: boolean }) => {
		state.listEnabled.push(enabled);
		return { queryKey: ['list_deployments'], queryFn: () => ({ deployments: [], total: 0 }), enabled: false };
	},
}));
vi.mock('./modals/DeploymentDetailModal', () => ({ DeploymentDetailModal: () => null }));

afterEach(() => {
	cleanup();
	state.version = undefined;
	state.listEnabled = [];
});

function renderPage(version: string | undefined) {
	state.version = version;
	render(
		<QueryClientProvider client={new QueryClient()}>
			<ConfigDeploymentsIndex />
		</QueryClientProvider>,
	);
}

describe('ConfigDeploymentsIndex version gate', () => {
	it('lists deployments on Harper 5.1 and later', () => {
		renderPage('5.1.0');
		expect(state.listEnabled.at(-1)).toBe(true);
		expect(screen.queryByText(/needs Harper 5\.1/)).toBeNull();
	});

	it('never polls list_deployments on an older Harper reached by URL, and says why', () => {
		renderPage('5.0.13');
		expect(state.listEnabled.every(enabled => enabled === false)).toBe(true);
		expect(screen.getByText('Deployment history needs Harper 5.1 or later on this instance.')).toBeTruthy();
	});

	it('waits for the version instead of claiming either outcome', () => {
		renderPage(undefined);
		expect(state.listEnabled.every(enabled => enabled === false)).toBe(true);
		expect(screen.queryByText(/needs Harper 5\.1/)).toBeNull();
		expect(screen.queryByText('No deployments yet.')).toBeNull();
	});
});
