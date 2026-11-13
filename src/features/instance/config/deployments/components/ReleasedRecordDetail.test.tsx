/**
 * @vitest-environment jsdom
 */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleasedRecordDetail } from './ReleasedRecordDetail';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post }, entityId: 'entity-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('../hooks/useComponentReleases', () => ({
	useReleaseCheck: () => ({ kind: 'available', liveOn: [] }),
	useRecheckRelease: () => () => Promise.resolve(true),
}));
vi.mock('./ReleaseCheckNote', () => ({ ReleaseCheckNote: () => null }));
vi.mock('./ActivateRelease', () => ({
	ActivateRelease: ({ routing }: { routing?: Deployment['routing'] }) => (
		<span data-testid="routing">{routing === undefined ? 'unknown' : JSON.stringify(routing)}</span>
	),
}));

const RELEASE_ID = 'r1';
const routing = { host: null, urlPath: null, isolated: null, branchedDatabases: ['data'] };

afterEach(() => {
	cleanup();
	post.mockReset();
});

function renderActivation(activation: Partial<Deployment>) {
	post.mockResolvedValue({
		data: { deployment_id: RELEASE_ID, project: 'web', status: 'success', routing },
	});
	const deployment: Deployment = {
		deployment_id: 'a1',
		project: 'web',
		status: 'success',
		activated_from: RELEASE_ID,
		...activation,
	};
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<ReleasedRecordDetail deployment={deployment} />
		</QueryClientProvider>,
	);
}

describe('ReleasedRecordDetail', () => {
	it("gives the activation the release's own routing when the activation record carries none (harper#4077)", async () => {
		renderActivation({});
		expect(await screen.findByText(JSON.stringify(routing))).toBeTruthy();
		expect(post).toHaveBeenCalledWith(
			'/',
			expect.objectContaining({ operation: 'get_deployment', deployment_id: RELEASE_ID }),
		);
	});

	it('uses the routing the activation record carries, without asking for the release', () => {
		renderActivation({ routing: null });
		expect(screen.getByTestId('routing').textContent).toBe('null');
		expect(post).not.toHaveBeenCalled();
	});
});
