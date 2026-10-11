import { Deployment } from '@/integrations/api/instance/deployments/types';
import { describe, expect, it } from 'vitest';
import { deploymentSource } from './deploymentSource';
import { describePeerInstall } from './describePeerInstall';

const base = { deployment_id: 'd', project: 'web', status: 'success' } as Deployment;

describe('deploymentSource', () => {
	it('names the package a deploy came from', () => {
		expect(deploymentSource({ ...base, package_identifier: 'github:acme/web#v2' }))
			.toEqual({ label: 'github:acme/web#v2', title: 'github:acme/web#v2' });
	});

	it("names a payload deploy by its tarball's hash", () => {
		expect(deploymentSource({ ...base, package_identifier: null, payload_hash: 'abcdef0123456789abcdef' }))
			.toEqual({ label: 'Payload abcdef012345', title: 'abcdef0123456789abcdef' });
	});

	it('names the release an activation made live, which built nothing', () => {
		expect(deploymentSource({ ...base, activated_from: 'a1b2c3d4-0000-4000-8000-000000000001' }))
			.toEqual({ label: 'Activation of a1b2c3d4', title: 'a1b2c3d4-0000-4000-8000-000000000001' });
	});

	it('names nothing for a record that says nothing', () => {
		expect(deploymentSource(base)).toBeUndefined();
	});
});

// The comparison fields Harper records per peer: harper `components/deploymentRecorder.ts` installComparisonFields.
describe('describePeerInstall', () => {
	it('says nothing for a record from before installs were compared (pre-5.3.1)', () => {
		expect(describePeerInstall({ node: 'node-b', status: 'success' })).toBeUndefined();
	});

	it('names what a peer installed differently', () => {
		expect(describePeerInstall({
			node: 'node-b',
			install: { source: 'npm:web@1.5.0', lockfiles: {} },
			install_matches: false,
			install_differs: ['source', 'package-lock.json'],
		})).toEqual({ label: 'Installed differently: source npm:web@1.5.0, package-lock.json.', matches: false });
	});

	it('says a matching install matched', () => {
		expect(describePeerInstall({ node: 'node-b', install_matches: true, install_differs: [] })?.matches).toBe(true);
	});

	it('does not read missing evidence as a match', () => {
		expect(describePeerInstall({ node: 'node-b', install: null, install_matches: null, install_differs: [] }))
			.toEqual({ label: "Couldn't compare its install: a fingerprint is missing or unidentified.", matches: null });
	});
});
