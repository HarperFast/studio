import {
	getStudioConfiguration,
	mayAnswerStudioConfiguration,
	STUDIO_CONFIGURATION_MIN_HARPER_VERSION,
} from '@/integrations/api/instance/studio/getStudioConfiguration';
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

describe('mayAnswerStudioConfiguration', () => {
	it('starts at 5.4, its prereleases included', () => {
		expect(STUDIO_CONFIGURATION_MIN_HARPER_VERSION).toBe('5.4.0-0');
	});

	it.each(['5.4.0-0', '5.4.0-alpha.2', '5.4.0-beta.2', '5.4.0', '5.4.1', '5.10.0', '6.0.0-alpha.1'])(
		'asks %s',
		(version) => {
			expect(mayAnswerStudioConfiguration(version)).toBe(true);
		},
	);

	it.each(['5.3.99', '5.3.4', '5.3.0-beta.1', '4.7.40'])('does not ask %s, which predates the operation', (version) => {
		expect(mayAnswerStudioConfiguration(version)).toBe(false);
	});

	it.each([undefined, '', 'unknown', 'v5.4.0'])('asks when it cannot read the version (%s), as before', (version) => {
		expect(mayAnswerStudioConfiguration(version)).toBe(true);
	});
});
