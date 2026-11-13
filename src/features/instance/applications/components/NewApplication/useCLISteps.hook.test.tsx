/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCLISteps } from './useCLISteps';

const { state } = vi.hoisted(() => ({
	state: { target: 'https://cluster.example.com:9925/', version: '5.3.4' as string | undefined, pending: false },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ data: state.version ? { version: state.version } : undefined, isPending: state.pending }),
}));
vi.mock('@tanstack/react-router', () => ({ useRouteContext: () => ({ cluster: {} }) }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: { defaults: {} }, entityId: 'clu-1' }),
}));
vi.mock('@/lib/urls/getOperationsUrlForCluster', () => ({ getOperationsUrlForCluster: () => state.target }));

const lastCode = () => renderHook(() => useCLISteps('my-app')).result.current.at(-1)?.code;

beforeEach(() => {
	Object.assign(state, { target: 'https://cluster.example.com:9925/', version: '5.3.4', pending: false });
});

describe('useCLISteps', () => {
	it('deploys on merge to main from a reachable cluster at the floor', () => {
		expect(lastCode()).toBe('git push origin main');
	});

	it("deploys from the laptop when GitHub's runners can't reach the cluster, or it is older", () => {
		state.target = 'http://10.0.3.7:9925/';
		expect(lastCode()).toBe('npm run deploy');
		state.target = 'https://cluster.example.com:9925/';
		state.version = '5.3.0-beta.2';
		expect(lastCode()).toBe('npm run deploy');
		state.version = undefined;
		expect(lastCode()).toBe('npm run deploy');
	});

	it('shows no deploy step while the version is loading', () => {
		state.pending = true;
		expect(lastCode()).toBe('cat AGENTS.md');
	});
});
