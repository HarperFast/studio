import { getStudioConfiguration } from '@/integrations/api/instance/studio/getStudioConfiguration';
import { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

function clientFailingWith(status: number) {
	const config = { headers: new AxiosHeaders() };
	const error = new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error: 'Operation not found' },
	});
	return { post: vi.fn().mockRejectedValue(error) } as unknown as AxiosInstance;
}

const params = (instanceClient: AxiosInstance) => ({ instanceClient, entityId: 'clu-1' as const });

describe('getStudioConfiguration', () => {
	it('parses what the cluster returns', async () => {
		const instanceClient = {
			post: vi.fn().mockResolvedValue({ data: { navigation: { logs: 'tucked' }, pages: [] } }),
		} as unknown as AxiosInstance;
		await expect(getStudioConfiguration(params(instanceClient))).resolves.toEqual({
			navigation: { logs: 'tucked' },
			landing: undefined,
			pages: [],
		});
		expect(instanceClient.post).toHaveBeenCalledWith('/', { operation: 'get_studio_configuration' });
	});

	// An older Harper (unknown operation) and an allowlisted role without it both mean "plain Studio".
	it.each([400, 403, 404])('treats %i as no configuration the cluster can give', async (status) => {
		await expect(getStudioConfiguration(params(clientFailingWith(status)))).resolves.toEqual({
			navigation: {},
			pages: [],
			unavailable: true,
		});
	});

	it.each([401, 408, 429, 500])('still fails on %i', async (status) => {
		await expect(getStudioConfiguration(params(clientFailingWith(status)))).rejects.toBeInstanceOf(AxiosError);
	});
});
