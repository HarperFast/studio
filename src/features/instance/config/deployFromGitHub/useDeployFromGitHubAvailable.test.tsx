/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeployFromGitHubProject } from './useDeployFromGitHubAvailable';

const { state } = vi.hoisted(() => ({
	state: {
		canManage: true,
		version: '5.3.4',
		tree: undefined as { entries: unknown[] } | undefined,
	},
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) =>
		options.queryKey[0] === 'registration_info'
			? { data: options.enabled === false ? undefined : { version: state.version } }
			: { data: options.enabled === false ? undefined : state.tree },
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'clu-1' }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));

const projectFor = (project: string | undefined) =>
	renderHook(() => useDeployFromGitHubProject(project)).result.current;

beforeEach(() => {
	Object.assign(state, {
		canManage: true,
		version: '5.3.4',
		tree: {
			entries: [
				{ name: 'shop', entries: [] },
				{ name: 'shop-pr-12', entries: [], preview: { app: 'shop', pr: 12 } },
			],
		},
	});
});

describe('useDeployFromGitHubProject', () => {
	it('offers an application its own setup, and a preview none', () => {
		expect(projectFor('shop')).toBe('shop');
		expect(projectFor('shop-pr-12')).toBeUndefined();
	});

	it('offers nothing before the tree says which is which', () => {
		state.tree = undefined;
		expect(projectFor('shop')).toBeUndefined();
	});

	it('offers nothing to a role that is not a super user, or below 5.3.0-beta.3', () => {
		expect(projectFor(undefined)).toBeUndefined();
		state.version = '5.3.0-beta.2';
		expect(projectFor('shop')).toBeUndefined();
		state.version = '5.3.0-beta.3';
		expect(projectFor('shop')).toBe('shop');
		state.canManage = false;
		expect(projectFor('shop')).toBeUndefined();
	});
});
