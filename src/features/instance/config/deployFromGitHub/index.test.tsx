/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigDeployFromGitHubIndex } from '.';
import { validateDeployFromGitHubSearch } from './deployFromGitHubSearch';

const { state, navigate } = vi.hoisted(() => ({
	state: {
		canManage: true,
		version: '5.3.4' as string | undefined,
		project: undefined as string | undefined,
		tree: { entries: [] as unknown[] },
	},
	navigate: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) =>
		options.queryKey[0] === 'registration_info'
			? { data: state.version === undefined ? undefined : { version: state.version }, isError: false }
			: { data: state.tree, isFetching: false, isPending: false, refetch: vi.fn() },
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useSearch: () => ({ project: state.project }),
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'clu-1' }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('./ApplicationDeploys', () => ({
	ApplicationDeploys: ({ app, names }: { app: string; names: { policy: string } }) => (
		<div>Panel for {app}, policy {names.policy}</div>
	),
}));

beforeEach(() => {
	Object.assign(state, {
		canManage: true,
		version: '5.3.4',
		project: undefined,
		tree: {
			entries: [
				{ name: 'shop', entries: [] },
				{ name: 'shop-pr-3', entries: [], preview: { app: 'shop', pr: 3 } },
			],
		},
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ConfigDeployFromGitHubIndex', () => {
	it('is for super users', () => {
		state.canManage = false;
		state.project = 'shop';
		render(<ConfigDeployFromGitHubIndex />);
		expect(screen.getByText('Only super users can set up deploys from GitHub.')).toBeTruthy();
		expect(screen.queryByText(/Panel for/)).toBeNull();
	});

	it('names the build it needs below the floor', () => {
		state.version = '5.3.0-beta.2';
		state.project = 'shop';
		render(<ConfigDeployFromGitHubIndex />);
		expect(screen.getByText('Deploys from GitHub need Harper 5.3.0-beta.3 or later. This instance runs 5.3.0-beta.2.'))
			.toBeTruthy();
	});

	it("opens an application's panel under the CLI's names", () => {
		state.project = 'shop';
		render(<ConfigDeployFromGitHubIndex />);
		expect(screen.getByText('Panel for shop, policy github-actions-shop')).toBeTruthy();
	});

	it("sets up an application that isn't on the cluster yet, which a new repository's first deploy needs", () => {
		render(<ConfigDeployFromGitHubIndex />);
		fireEvent.change(screen.getByLabelText('New application name'), { target: { value: ' my-new-app ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		expect(navigate).toHaveBeenCalledWith({ to: '.', search: { project: 'my-new-app' } });

		state.project = 'my-new-app';
		cleanup();
		render(<ConfigDeployFromGitHubIndex />);
		expect(screen.getByText('Panel for my-new-app, policy github-actions-my-new-app')).toBeTruthy();
	});

	it('offers a preview nothing, and refuses a name no application can have', () => {
		state.project = 'shop-pr-3';
		render(<ConfigDeployFromGitHubIndex />);
		expect(screen.getByText(/shop-pr-3 is a preview/)).toBeTruthy();
		cleanup();
		state.project = 'not valid';
		render(<ConfigDeployFromGitHubIndex />);
		expect(screen.getByText(/not valid can't be set up here/)).toBeTruthy();
		expect(screen.queryByText(/Panel for/)).toBeNull();
	});

	it('reads the application from the search, trimmed', () => {
		expect(validateDeployFromGitHubSearch({ project: ' shop ' })).toEqual({ project: 'shop' });
		expect(validateDeployFromGitHubSearch({ project: 3 })).toEqual({ project: undefined });
	});
});
