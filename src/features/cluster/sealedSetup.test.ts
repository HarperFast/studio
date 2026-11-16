import type { Cluster } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { sealedSetupCapability } from './sealedSetup';

function cluster(
	instances: Array<{ version?: string; status?: string; secretsKeyFingerprint?: string | null }>,
	planId = 'standard',
): Cluster {
	return {
		id: 'clu-1',
		plans: [{ planId }],
		instances: instances.map((instance, index) => ({
			id: `ins-${index}`,
			status: 'RUNNING',
			secretsKeyFingerprint: 'fp-1',
			...instance,
		})),
	} as unknown as Cluster;
}

describe(sealedSetupCapability, () => {
	it('names the key every live member holds once all of them run 5.4.0 or later', () => {
		expect(sealedSetupCapability(cluster([{ version: '5.4.0' }, { version: '5.5.1' }]))).toEqual({
			keyFingerprint: 'fp-1',
		});
		expect(sealedSetupCapability(cluster([{ version: '5.4.0' }, { version: '5.3.9' }]))).toBeNull();
	});

	it.each([
		['a prerelease of 5.4.0', { version: '5.4.0-beta.1' }],
		['no version', { version: undefined }],
		['a version that is not semver', { version: 'latest' }],
		['a member without the key', { version: '5.4.0', secretsKeyFingerprint: null }],
	])('fails closed on %s', (_, instance) => {
		expect(sealedSetupCapability(cluster([{ version: '5.4.0' }, instance]))).toBeNull();
	});

	it('fails closed when the members hold different keys', () => {
		expect(sealedSetupCapability(cluster([{ version: '5.4.0' }, { version: '5.4.0', secretsKeyFingerprint: 'fp-2' }])))
			.toBeNull();
	});

	it('ignores members that are being removed', () => {
		expect(
			sealedSetupCapability(
				cluster([{ version: '5.4.0' }, { version: '5.2.0', status: 'TERMINATED', secretsKeyFingerprint: null }]),
			),
		).toEqual({ keyFingerprint: 'fp-1' });
		expect(sealedSetupCapability(cluster([{ version: '5.4.0', status: 'TERMINATED' }]))).toBeNull();
	});

	it('is never on for a self-hosted cluster, which has no central manager key', () => {
		expect(sealedSetupCapability(cluster([{ version: '5.4.0' }], 'self-hosted-free'))).toBeNull();
	});

	it('is off until the cluster is loaded', () => {
		expect(sealedSetupCapability(undefined)).toBeNull();
		expect(sealedSetupCapability(cluster([]))).toBeNull();
	});
});
