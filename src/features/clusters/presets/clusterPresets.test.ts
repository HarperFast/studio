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

describe('harperSupportsPresets', () => {
	it.each([['5.4.0', true], ['5.10.1', true], ['5.3.9', false], ['5.4.0-beta.1', false], [undefined, false]])(
		'%s → %s',
		async (version, expected) => {
			const { harperSupportsPresets } = await import('@/features/clusters/presets/clusterPresets');
			expect(harperSupportsPresets(version)).toBe(expected);
		},
	);
});

describe('findClusterPreset', () => {
	it('finds nothing unless presets are switched on, so a build without them never offers or resumes one', async () => {
		expect(await findWith('')).toBeUndefined();
		expect((await findWith('true'))?.id).toBe('redirects');
	});
});
