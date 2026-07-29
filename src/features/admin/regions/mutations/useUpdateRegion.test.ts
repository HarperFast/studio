import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { patch } }));

import { updateRegion } from './useUpdateRegion';

describe('updateRegion', () => {
	beforeEach(() => patch.mockReset());

	it('PATCHes changes to /Admin/Region/:id with the id in the path, not the body', async () => {
		const changes = { region: 'US East (renamed)', organizationIds: ['org-1'] };
		patch.mockResolvedValue({ data: { id: 'us-east-1', ...changes } });

		const result = await updateRegion({ id: 'us-east-1', changes });

		expect(patch).toHaveBeenCalledWith('/Admin/Region/us-east-1', changes);
		expect(result).toMatchObject({ id: 'us-east-1', region: 'US East (renamed)' });
	});
});
