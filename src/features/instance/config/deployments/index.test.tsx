/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
	releasesAsked: [] as Record<string, unknown>[],
	releases: undefined as object | undefined,
	canListReleases: true,
	retryReleases: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: (operation: string) => operation !== 'list_releases' || state.canListReleases,
}));
vi.mock('./hooks/useComponentReleases', async (importOriginal) => ({
	...(await importOriginal<typeof import('./hooks/useComponentReleases')>()),
	useRetryReleases: () => state.retryReleases,
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
		if (params.limit === 1) {
			return {
				queryKey: ['newest', params],
				queryFn: () => new Promise(() => {}),
				enabled: false,
				initialData: { deployments: [], total: 0 },
			};
		}
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
vi.mock('@/integrations/api/instance/deployments/listReleases', () => ({
	getReleasesQueryOptions: (params: { enabled?: boolean; project: string }) => {
		if (params.enabled !== false) {
			state.releasesAsked.push(params);
		}
		return {
			queryKey: ['list_releases', params.project],
			queryFn: () => new Promise(() => {}),
			enabled: params.enabled,
			...(state.releases ? { initialData: state.releases } : {}),
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
	state.releasesAsked = [];
	state.releases = undefined;
	state.canListReleases = true;
	state.retryReleases.mockClear();
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

describe('ConfigDeploymentsIndex on Harper 5.4', () => {
	const SHA = '0123456789abcdef0123456789abcdef01234567';

	it('filters by commit, and clears that filter on its own', () => {
		state.search = { project: 'web', sha: SHA, page: 2 };
		renderPage('5.4.0-alpha.1');
		expect(state.listParams.at(-1)).toMatchObject({ project: 'web', sha: SHA });
		fireEvent.click(screen.getByRole('button', { name: 'Clear the commit filter 0123456' }));
		const update = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object };
		expect(update.search({ project: 'web', sha: SHA, page: 2 })).toEqual({ project: 'web' });
	});

	it('drops a commit filter an older Harper would ignore, rather than list every deployment under it', () => {
		state.search = { sha: SHA };
		renderPage('5.3.5');
		expect(state.listParams.at(-1)?.sha).toBeUndefined();
		const update = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object; replace: boolean };
		expect(update.replace).toBe(true);
		expect(update.search({ sha: SHA, project: 'web' })).toEqual({ project: 'web' });
	});

	it.each([
		['abbreviated', '0123456'],
		['uppercase', SHA.toUpperCase()],
		['SHA-256 prefix', '0123456789abcdef0123456789abcdef0123456789abcdef'],
	])('says a commit filter matching nothing must be the full SHA, exactly as recorded: %s', (_name, filter) => {
		state.search = { sha: filter };
		state.listData = { deployments: [], total: 0 };
		renderPage('5.4.0-beta.2');
		expect(state.listParams.at(-1)?.sha).toBe(filter);
		expect(screen.getByText(/A commit filter matches only a full commit SHA, exactly as recorded\./)).toBeTruthy();
	});

	it('shows the commit a CI deploy was built from, and filters by it on click', () => {
		state.listData = {
			deployments: [row('d1', { source: { via: 'oidc', policy: 'p', repository: 'acme/web', sha: SHA } })],
			total: 1,
		};
		renderPage('5.4.0-beta.2');
		expect(screen.getByText('acme/web')).toBeTruthy();
		expect(screen.getByText('OIDC')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: '0123456' }));
		const update = state.navigate.mock.calls.at(-1)?.[0] as { search: (prev: object) => object };
		expect(update.search({ project: 'web', page: 3 })).toEqual({ project: 'web', sha: SHA, page: undefined });
	});

	it('shows the private copy each release puts back, once a record on the page says (harper#4077)', () => {
		const routing = (branchedDatabases: string[] | null) => ({
			host: null,
			urlPath: null,
			isolated: null,
			branchedDatabases,
		});
		state.listData = {
			deployments: [
				row('d1', { routing: routing(['data']) }),
				row('d2', { routing: routing(null) }),
				row('d3', { routing: null }),
				row('d4'),
			],
			total: 4,
		};
		renderPage('5.4.0-beta.2');
		const column = screen.getAllByRole('columnheader').findIndex((header) => header.textContent === 'Private copy');
		expect(column).toBeGreaterThan(-1);
		const shown = screen.getAllByRole('row').slice(1).map((tableRow) =>
			within(tableRow).getAllByRole('cell')[column].textContent
		);
		expect(shown).toEqual(['data', 'Off', 'Keeps current', '—']);
	});

	it('shows no private copy column when no record on the page says', () => {
		state.listData = { deployments: [row('d1')], total: 1 };
		renderPage('5.4.0-beta.2');
		expect(screen.queryByRole('columnheader', { name: 'Private copy' })).toBeNull();
	});

	it('shows a declared commit that is not a hash without offering to filter by it', () => {
		state.listData = {
			deployments: [row('d1', { source: { via: 'declared', repository: 'acme/web', sha: 'main' } })],
			total: 1,
		};
		renderPage('5.4.0-beta.2');
		expect(screen.getByText('main').tagName).toBe('SPAN');
		expect(screen.queryByRole('button', { name: 'main' })).toBeNull();
	});

	it('shows what each node holds of the component it is filtered to', () => {
		state.search = { project: 'web' };
		const at = Date.now() - 60_000;
		state.releases = {
			nodes: [
				{
					node: 'a',
					components: [{
						project: 'web',
						deployment_id: 'v3',
						releases: [{ deployment_id: 'v2', state: 'kept', at, size: 2048 }],
					}],
				},
				{ node: 'b', components: [{ project: 'web', deployment_id: 'v3', releases: [] }] },
				{ node: 'c', error: 'timed out' },
			],
		};
		renderPage('5.4.0-beta.2');
		const panel = screen.getByRole('region', { name: 'Releases of web' });
		expect(panel.textContent).toContain('Live on a, b');
		expect(panel.textContent).toContain('Kept on a · not on b');
		expect(panel.textContent).toContain("c couldn't say what it holds: timed out");
		expect(state.releasesAsked.at(-1)).toMatchObject({ project: 'web' });
	});

	it('asks no node what it holds before Harper 5.4, or without a component', () => {
		state.search = { project: 'web' };
		renderPage('5.3.5');
		cleanup();
		state.search = {};
		renderPage('5.4.0-beta.2');
		expect(state.releasesAsked).toEqual([]);
		expect(screen.queryByRole('region', { name: /Releases of/ })).toBeNull();
	});
});

describe('ConfigDeploymentsIndex refresh', () => {
	it('rechecks no releases on Refresh for a token that cannot list them, such as a read-only one', async () => {
		state.canListReleases = false;
		renderPage('5.4.0');
		fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(state.retryReleases).not.toHaveBeenCalled();
	});

	it('rechecks releases too where the token can list them', async () => {
		renderPage('5.4.0');
		fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(state.retryReleases).toHaveBeenCalled();
	});
});
