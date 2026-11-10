import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { listReleases } from './listReleases';

function client(data: unknown) {
	const post = vi.fn().mockResolvedValue({ data });
	return { post, instanceClient: { post } as unknown as AxiosInstance };
}

describe('listReleases', () => {
	it('asks every node of a cluster', async () => {
		const nodes = [{ node: 'a', components: [] }, { node: 'b', error: 'timed out' }];
		const { post, instanceClient } = client({ nodes });
		const response = await listReleases({ instanceClient, entityId: 'clu-a', entityType: 'cluster', project: 'web' });
		expect(post).toHaveBeenCalledWith('/', { operation: 'list_releases', project: 'web', replicated: true });
		expect(response).toEqual({ nodes });
	});

	// A Harper without replication refuses `replicated: true` (harper `v5.4.0-beta.2:server/Server.ts:207`).
	it("asks a single instance for its own releases, and lists its answer like a cluster's", async () => {
		const answer = { node: 'solo', components: [{ project: 'web', deployment_id: 'v1', releases: [] }] };
		const { post, instanceClient } = client(answer);
		const response = await listReleases({ instanceClient, entityId: 'ins-a', entityType: 'instance', project: 'web' });
		expect(post).toHaveBeenCalledWith('/', { operation: 'list_releases', project: 'web', replicated: false });
		expect(response).toEqual({ nodes: [answer] });
	});

	it('lists no node for an answer in neither shape', async () => {
		const { instanceClient } = client('ok');
		expect(await listReleases({ instanceClient, entityId: 'ins-a', entityType: 'instance', project: 'web' }))
			.toEqual({ nodes: [] });
	});
});
