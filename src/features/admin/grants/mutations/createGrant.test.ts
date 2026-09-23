import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/config/apiClient', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

const { createGrant } = await import('@/features/admin/grants/mutations/useUpdateGrant');

const body = { organizationId: 'org-1', source: 'comped', reason: 'r' } as Parameters<typeof createGrant>[0];

describe('createGrant', () => {
	beforeEach(() => post.mockReset());

	it('wraps a single grant in a list', async () => {
		post.mockResolvedValue({ data: { id: 'cgr-1' } });
		expect((await createGrant(body)).map((g) => g.id)).toEqual(['cgr-1']);
	});

	it('returns every grant of a batch', async () => {
		post.mockResolvedValue({ data: { grants: [{ id: 'cgr-1' }, { id: 'cgr-2' }] } });
		expect((await createGrant(body)).map((g) => g.id)).toEqual(['cgr-1', 'cgr-2']);
	});

	it('yields an empty list rather than throwing on a body it cannot read', async () => {
		for (const data of ['', null, undefined, { grants: null }, { ok: true }]) {
			post.mockResolvedValue({ data });
			await expect(createGrant(body)).resolves.toEqual([]);
		}
	});
});
