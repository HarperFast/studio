import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

import { createRegion } from './useCreateRegion';

describe('createRegion', () => {
	beforeEach(() => post.mockReset());

	it('POSTs the payload to /Admin/Region and returns the created region', async () => {
		const payload = {
			id: 'us-east-1',
			region: 'US East',
			instanceCount: 2,
			purchasedBlockMultiplier: 1,
			latencyDescription: '280ms',
			organizationIds: null,
		};
		post.mockResolvedValue({ data: { ...payload, createdAt: '2026-01-01T00:00:00.000Z' } });

		const result = await createRegion(payload);

		expect(post).toHaveBeenCalledWith('/Admin/Region/', payload);
		expect(result).toMatchObject({ id: 'us-east-1', region: 'US East' });
	});
});
