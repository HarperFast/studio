import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { getDescribeAll, getDescribeAllQueryOptions } from './getDescribeAll';

function client() {
	const post = vi.fn(async () => ({ data: {}, status: 200 }));
	return { post, instanceClient: { post } as unknown as AxiosInstance };
}

describe('getDescribeAll', () => {
	it('asks for computed attributes only when the caller opts in', async () => {
		const optedIn = client();
		await getDescribeAll({ entityId: 'instance-1', instanceClient: optedIn.instanceClient, includeComputed: true });
		expect(optedIn.post).toHaveBeenCalledWith('/', expect.objectContaining({ include_computed: true }));

		const plain = client();
		await getDescribeAll({ entityId: 'instance-1', instanceClient: plain.instanceClient });
		expect(plain.post).toHaveBeenCalledWith('/', expect.objectContaining({ include_computed: undefined }));
	});

	it('keeps results with and without computed attributes in separate cache entries', () => {
		const { instanceClient } = client();
		const base = { entityId: 'instance-1', instanceClient, skipRecordCount: true };
		expect(getDescribeAllQueryOptions({ ...base, includeComputed: true }).queryKey)
			.not.toEqual(getDescribeAllQueryOptions(base).queryKey);
	});
});
