/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigPreviewsIndex } from '.';
import { validatePreviewsSearch } from './previewsSearch';

const { state, queriesSeen } = vi.hoisted(() => ({
	state: {
		canManage: true,
		version: '5.4.0' as string | undefined,
		versionError: false,
		project: undefined as string | undefined,
		tree: { entries: [] as unknown[] } as { entries: unknown[] } | undefined,
		treePending: false,
	},
	queriesSeen: [] as Array<{ queryKey: readonly unknown[]; enabled?: boolean }>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		queriesSeen.push(options);
		if (options.queryKey[0] === 'registration_info') {
			return {
				data: state.version === undefined ? undefined : { version: state.version },
				isError: state.versionError,
			};
		}
		return { data: state.tree, isFetching: false, isPending: state.treePending, refetch: vi.fn() };
	},
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => vi.fn(),
	useSearch: () => ({ project: state.project }),
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'clu-1' }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('./ApplicationPreviews', () => ({
	ApplicationPreviews: ({ app }: { app: string }) => <div>Panel for {app}</div>,
}));

const componentsQuery = () => queriesSeen.filter((options) => options.queryKey[1] === 'get_components').at(-1);

beforeEach(() => {
	queriesSeen.length = 0;
	Object.assign(state, {
		canManage: true,
		version: '5.4.0',
		versionError: false,
		project: undefined,
		tree: { entries: [{ name: 'shop', entries: [] }] },
		treePending: false,
	});
});

afterEach(cleanup);

describe('ConfigPreviewsIndex', () => {
	it('is for super users: a deep link shows no panel and reads nothing', () => {
		state.canManage = false;
		state.project = 'shop';
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText('Only super users can view or change previews.')).toBeTruthy();
		expect(screen.queryByText('Panel for shop')).toBeNull();
		expect(componentsQuery()?.enabled).toBe(false);
	});

	it.each(['5.3.4', '5.4.0-alpha.1'])('names the build it needs on %s', (version) => {
		state.version = version;
		state.project = 'shop';
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText(`PR previews need Harper 5.4.0-alpha.2 or later. This instance runs ${version}.`))
			.toBeTruthy();
		expect(screen.queryByText('Panel for shop')).toBeNull();
		expect(componentsQuery()?.enabled).toBe(false);
	});

	it('offers nothing while the version is unreadable', () => {
		state.version = undefined;
		state.versionError = true;
		state.project = 'shop';
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText(/version could not be read/)).toBeTruthy();
		expect(screen.queryByText('Panel for shop')).toBeNull();
	});

	it('asks which application until one is named', () => {
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText('Choose an application to see its previews.')).toBeTruthy();
	});

	it('shows the panel of the application in the URL', () => {
		state.project = 'shop';
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText('Panel for shop')).toBeTruthy();
	});

	it('waits for the tree before deciding a deep link is an application', () => {
		state.project = 'shop-pr-3';
		state.tree = undefined;
		state.treePending = true;
		render(<ConfigPreviewsIndex />);
		expect(screen.queryByText('Panel for shop-pr-3')).toBeNull();
	});

	it('still shows the panel when the tree could not be read', () => {
		state.project = 'shop';
		state.tree = undefined;
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText('Panel for shop')).toBeTruthy();
	});

	it('does not take a null preview for one', () => {
		state.project = 'shop';
		state.tree = { entries: [{ name: 'shop', entries: [], preview: null }] };
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText('Panel for shop')).toBeTruthy();
	});

	it('has no panel for a preview itself', () => {
		state.project = 'shop-pr-3';
		state.tree = { entries: [{ name: 'shop-pr-3', entries: [], preview: { app: 'shop', pr: 3 } }] };
		render(<ConfigPreviewsIndex />);
		expect(screen.getByText(/is itself a preview/)).toBeTruthy();
		expect(screen.queryByText('Panel for shop-pr-3')).toBeNull();
	});
});

describe('validatePreviewsSearch', () => {
	it('keeps a named project, and drops anything else', () => {
		expect(validatePreviewsSearch({ project: ' shop ' })).toEqual({ project: 'shop' });
		expect(validatePreviewsSearch({ project: '' })).toEqual({ project: undefined });
		expect(validatePreviewsSearch({ project: 3 })).toEqual({ project: undefined });
		expect(validatePreviewsSearch({})).toEqual({ project: undefined });
	});
});
