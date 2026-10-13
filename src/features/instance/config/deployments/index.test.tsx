/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigDeploymentsIndex } from './index';

const state = vi.hoisted(() => ({
	version: undefined as string | undefined,
	registrationFails: false,
	listEnabled: [] as (boolean | undefined)[],
	listParams: [] as Record<string, unknown>[],
	listData: undefined as { deployments: object[]; total: number } | undefined,
	historyParams: [] as Record<string, unknown>[],
	historyData: undefined as { deployments: object[]; total: number } | undefined,
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
	useNavigate: () => state.navigate,
	useParams: () => ({}),
	useSearch: () => state.search,
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => true }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({ entityId: 'ins-a' }) }));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['registration_info', 'ins-a'],
		queryFn: () => (state.registrationFails ? Promise.reject(new Error('unreachable')) : new Promise(() => {})),
		retry: false,
		...(state.version === undefined ? {} : { initialData: { version: state.version } }),
	}),
}));
vi.mock('@/integrations/api/instance/deployments/listDeployments', () => ({
	getDeploymentsQueryOptions: (params: { enabled?: boolean; limit?: number }) => {
		// The page asks for a page; what became of a staged record is asked of the component's whole history.
		if (params.limit === undefined) {
			state.historyParams.push(params);
			return {
				queryKey: ['history', params],
				queryFn: () => ({ deployments: [], total: 0 }),
				enabled: false,
				...(state.historyData ? { initialData: state.historyData } : {}),
			};
		}
		state.listEnabled.push(params.enabled);
		state.listParams.push(params);
		return {
			queryKey: ['list_deployments'],
			queryFn: () => ({ deployments: [], total: 0 }),
			enabled: false,
			...(state.listData ? { initialData: state.listData } : {}),
		};
	},
}));
vi.mock('./modals/DeploymentDetailModal', () => ({ DeploymentDetailModal: () => null }));

afterEach(() => {
	cleanup();
	state.version = undefined;
	state.registrationFails = false;
	state.listEnabled = [];
	state.listParams = [];
	state.listData = undefined;
	state.historyParams = [];
	state.historyData = undefined;
	state.search = {};
	state.navigate.mockClear();
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

	it('says it could not load, rather than spinning forever, when the version cannot be read', async () => {
		state.registrationFails = true;
		renderPage(undefined);
		expect(await screen.findByText(/Could not load deployments/)).toBeTruthy();
		expect(state.listEnabled.every(enabled => enabled === false)).toBe(true);
	});

	it('waits for the version instead of claiming either outcome', () => {
		renderPage(undefined);
		expect(state.listEnabled.every(enabled => enabled === false)).toBe(true);
		expect(screen.queryByText(/needs Harper 5\.1/)).toBeNull();
		expect(screen.queryByText('No deployments yet.')).toBeNull();
	});
});

const row = (id: string, extra: object = {}) => ({
	deployment_id: id,
	project: 'web',
	status: 'success',
	started_at: 1,
	...extra,
});

describe('ConfigDeploymentsIndex filters and paging', () => {
	it('asks list_deployments for the filtered page the URL names', () => {
		state.search = { project: 'web', status: 'staged', page: 3 };
		renderPage('5.3.0');
		expect(state.listParams.at(-1)).toMatchObject({ project: 'web', status: 'staged', limit: 25, offset: 50 });
	});

	it('does not ask a pre-5.3 instance for staged records a saved link names', () => {
		state.search = { status: 'staged' };
		renderPage('5.2.15');
		expect(state.listParams.at(-1)).toMatchObject({ status: undefined });
		// …and drops it from the URL, which would otherwise claim a filter the list is not applying.
		const update = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object; replace: boolean };
		expect(update.replace).toBe(true);
		expect(update.search({ status: 'staged', project: 'web' })).toEqual({ status: undefined, project: 'web' });
	});

	it('keeps a staged filter where staging exists', () => {
		state.search = { status: 'staged' };
		renderPage('5.3.0');
		expect(state.listParams.at(-1)).toMatchObject({ status: 'staged' });
		expect(state.navigate).not.toHaveBeenCalled();
	});

	it('applies the component filter on Enter only, so leaving the field does not move the page', () => {
		state.search = { page: 2 };
		renderPage('5.3.0');
		const input = screen.getByRole('textbox', { name: 'Component' });
		fireEvent.change(input, { target: { value: 'web' } });
		fireEvent.blur(input);
		expect(state.navigate).not.toHaveBeenCalled();
	});

	it('pages by the total the server reports, not by the rows it sent', () => {
		state.search = { page: 2 };
		state.listData = { deployments: Array.from({ length: 25 }, (_, i) => row(`d-${i}`)), total: 60 };
		renderPage('5.3.0');
		expect(screen.getByText('26–50 of 60')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		const update = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object };
		expect(update.search({ page: 2, project: 'web' })).toEqual({ page: 3, project: 'web' });
		fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
		const back = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object };
		expect(back.search({ page: 2 })).toEqual({ page: undefined });
	});

	it('filters by component on Enter, and starts again from the first page', () => {
		state.search = { page: 4 };
		renderPage('5.3.0');
		const input = screen.getByRole('textbox', { name: 'Component' });
		fireEvent.change(input, { target: { value: '  web ' } });
		fireEvent.submit(input.closest('form')!);
		const update = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object };
		expect(update.search({ page: 4 })).toEqual({ page: undefined, project: 'web' });
	});

	it('says the filters matched nothing rather than that there are no deployments', () => {
		state.search = { project: 'nope' };
		state.listData = { deployments: [], total: 0 };
		renderPage('5.3.0');
		expect(screen.getByText('No deployments match these filters.')).toBeTruthy();
	});

	it('shows a staged release nothing activated as waiting, and an activation by the release it made live', () => {
		state.listData = {
			deployments: [
				row('a1b2c3d4-0000-4000-8000-000000000001', { status: 'staged', package_identifier: 'npm:web@2.0.0' }),
				row('e5f6a7b8-0000-4000-8000-000000000002', { activated_from: 'ffffffff-0000-4000-8000-000000000009' }),
			],
			total: 2,
		};
		state.historyData = state.listData;
		renderPage('5.3.0');
		expect(screen.getByText('waiting to be activated')).toBeTruthy();
		expect(screen.getByText('npm:web@2.0.0')).toBeTruthy();
		expect(screen.getByText('Activation of ffffffff')).toBeTruthy();
	});

	// Harper never rewrites a staged record; its activation is a record of its own that may be on another page.
	it('shows an activated staged release as live by its activation, found in the history rather than on this page', () => {
		state.search = { status: 'staged' };
		const staged = row('4ac92da3-d8a0-423e-b145-5df107957dd4', { status: 'staged', started_at: 100 });
		state.listData = { deployments: [staged], total: 1 };
		state.historyData = {
			deployments: [
				row('5c12b89e-0000-4000-8000-000000000002', {
					started_at: 200,
					activated_from: staged.deployment_id,
				}),
				staged,
			],
			total: 2,
		};
		renderPage('5.3.0');
		expect(state.historyParams.at(-1)).toMatchObject({ project: 'web', since: 100 });
		expect(state.historyParams.at(-1)?.status).toBeUndefined();
		expect(screen.queryByText('waiting to be activated')).toBeNull();
		expect(screen.getByText(/live, activated by/).textContent).toBe('live, activated by 5c12b89e');
		expect(screen.getByRole('link', { name: '5c12b89e' }).getAttribute('href'))
			.toContain('config/deployments/5c12b89e-0000-4000-8000-000000000002');
	});

	it('asks no history when the page holds no staged record', () => {
		state.listData = { deployments: [row('e5f6a7b8-0000-4000-8000-000000000002')], total: 1 };
		renderPage('5.3.0');
		expect(state.historyParams).toEqual([]);
	});
});
