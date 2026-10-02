import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/config/apiClient', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

const { switchGrantToPaid } = await import('@/features/admin/grants/mutations/useSwitchToPaid');

describe('switchGrantToPaid', () => {
	beforeEach(() => post.mockReset());

	// central-manager reads a paid switchover off the ordinary grant-create endpoint: `purchased` is
	// accepted there only together with the live grant it replaces.
	it('posts the switchover to the grant collection and returns what the server answers', async () => {
		const answer = { id: 'cgr-paid', clusterId: 'clu-a', source: 'purchased', replacedGrantId: 'cgr-a' };
		post.mockResolvedValue({ data: answer });
		await expect(switchGrantToPaid({ clusterId: 'clu-a', replaceGrantId: 'cgr-a', reason: 'contract ended' }))
			.resolves.toEqual(answer);
		expect(post).toHaveBeenCalledWith('/Admin/ClusterGrant', {
			clusterId: 'clu-a',
			source: 'purchased',
			replaceGrantId: 'cgr-a',
			reason: 'contract ended',
		});
	});
});
