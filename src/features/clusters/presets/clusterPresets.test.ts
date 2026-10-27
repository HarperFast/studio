import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

async function findWith(flag: string) {
	vi.stubEnv('VITE_CLUSTER_PRESETS', flag);
	vi.resetModules();
	return (await import('@/features/clusters/presets/clusterPresets')).findClusterPreset('redirects');
}

describe('findClusterPreset', () => {
	it('finds nothing unless presets are switched on, so a build without them never offers or resumes one', async () => {
		expect(await findWith('')).toBeUndefined();
		expect((await findWith('true'))?.id).toBe('redirects');
	});
});
