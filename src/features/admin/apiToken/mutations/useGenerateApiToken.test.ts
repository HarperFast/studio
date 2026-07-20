import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

import { generateApiToken } from './useGenerateApiToken';

describe('generateApiToken', () => {
	beforeEach(() => post.mockReset());

	it('POSTs to /Admin/ApiToken and returns the token result', async () => {
		post.mockResolvedValue({ data: { operationToken: 'op-tok', expiresAt: '2026-01-01T00:00:00.000Z' } });

		const result = await generateApiToken();

		expect(post).toHaveBeenCalledWith('/Admin/ApiToken', {});
		expect(result).toEqual({ operationToken: 'op-tok', expiresAt: '2026-01-01T00:00:00.000Z' });
	});
});
