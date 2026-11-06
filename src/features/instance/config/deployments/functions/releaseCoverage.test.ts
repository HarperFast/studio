import { ListReleasesResponse } from '@/integrations/api/instance/deployments/listReleases';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { describe, expect, it } from 'vitest';
import { missingReason, releaseAvailability, releasedId, summarizeReleases } from './releaseCoverage';

const release = (deployment_id: string, state: 'staged' | 'kept', at: number, size = 10) => ({
	deployment_id,
	state,
	at,
	size,
});

// Three nodes: `v3` live everywhere; `v2` kept on a and b, pruned on c; `v4` staged on a and b, c never staged it.
const response: ListReleasesResponse = {
	nodes: [
		{
			node: 'a',
			components: [
				{ project: 'other', deployment_id: 'x1', releases: [release('x0', 'kept', 1)] },
				{ project: 'web', deployment_id: 'v3', releases: [release('v4', 'staged', 400), release('v2', 'kept', 300)] },
			],
		},
		{
			node: 'b',
			components: [{
				project: 'web',
				deployment_id: 'v3',
				releases: [release('v4', 'staged', 410, 12), release('v2', 'kept', 310)],
			}],
		},
		{ node: 'c', components: [{ project: 'web', deployment_id: 'v3', releases: [] }] },
	],
};

describe('summarizeReleases', () => {
	it('lists each release with the nodes holding it each way, the live one first and then the newest', () => {
		const summary = summarizeReleases(response, 'web');
		expect(summary.nodes).toEqual(['a', 'b', 'c']);
		expect(summary.releases).toEqual([
			{ deploymentId: 'v3', live: ['a', 'b', 'c'], kept: [], staged: [], missing: [] },
			{ deploymentId: 'v4', live: [], kept: [], staged: ['a', 'b'], missing: ['c'], at: 410, size: 12 },
			{ deploymentId: 'v2', live: [], kept: ['a', 'b'], staged: [], missing: ['c'], at: 310, size: 10 },
		]);
	});

	it("leaves out other components' releases", () => {
		const summary = summarizeReleases(response, 'web');
		expect(summary.releases.map((entry) => entry.deploymentId)).not.toContain('x0');
		expect(summary.releases.map((entry) => entry.deploymentId)).not.toContain('x1');
	});

	it('keeps a node that could not answer apart, rather than counting it as holding nothing', () => {
		const summary = summarizeReleases({
			nodes: [
				{ node: 'a', components: [{ project: 'web', deployment_id: 'v3', releases: [] }] },
				{ node: 'b', error: 'timed out' },
				{ node: 'c' },
			],
		}, 'web');
		expect(summary.nodes).toEqual(['a']);
		expect(summary.unreadable).toEqual([
			{ node: 'b', error: 'timed out' },
			{ node: 'c', error: 'it answered without its releases' },
		]);
		expect(summary.releases[0]).toMatchObject({ deploymentId: 'v3', live: ['a'], missing: [] });
	});

	it('names the nodes whose live tree carries no id', () => {
		const summary = summarizeReleases({
			nodes: [
				{ node: 'a', components: [{ project: 'web', releases: [release('v1', 'staged', 1)] }] },
				{ node: 'b', components: [] },
			],
		}, 'web');
		expect(summary.unrecordedLive).toEqual(['a', 'b']);
		expect(summary.releases).toEqual([
			{ deploymentId: 'v1', live: [], kept: [], staged: ['a'], missing: ['b'], at: 1, size: 10 },
		]);
	});
});

describe('releaseAvailability', () => {
	const summary = summarizeReleases(response, 'web');

	it('has nothing to activate where the release is live on every node', () => {
		expect(releaseAvailability(summary, 'v3')).toEqual({ kind: 'live-everywhere' });
	});

	it('names the nodes that hold no copy, which would refuse the activation', () => {
		expect(releaseAvailability(summary, 'v2')).toEqual({
			kind: 'missing',
			liveOn: [],
			missing: ['c'],
			unreadable: [],
			held: true,
		});
	});

	it('is available where every node holds it, and says where it is already live', () => {
		const partly = summarizeReleases({
			nodes: [
				{ node: 'a', components: [{ project: 'web', deployment_id: 'v5', releases: [release('v3', 'kept', 2)] }] },
				{ node: 'b', components: [{ project: 'web', deployment_id: 'v3', releases: [release('v5', 'staged', 3)] }] },
			],
		}, 'web');
		expect(releaseAvailability(partly, 'v5')).toEqual({ kind: 'available', liveOn: ['a'] });
		expect(releaseAvailability(partly, 'v3')).toEqual({ kind: 'available', liveOn: ['b'] });
	});

	it('counts a node that could not answer against it', () => {
		const unanswered = summarizeReleases({
			nodes: [
				{ node: 'a', components: [{ project: 'web', deployment_id: 'v3', releases: [release('v2', 'kept', 1)] }] },
				{ node: 'b', error: 'timed out' },
			],
		}, 'web');
		expect(releaseAvailability(unanswered, 'v2')).toEqual({
			kind: 'missing',
			liveOn: [],
			missing: [],
			unreadable: [{ node: 'b', error: 'timed out' }],
			held: true,
		});
	});

	it('is missing everywhere for an id no node holds, and when no node answered', () => {
		expect(releaseAvailability(summary, 'v0')).toMatchObject({
			kind: 'missing',
			missing: ['a', 'b', 'c'],
			held: false,
		});
		expect(releaseAvailability(summarizeReleases({ nodes: [] }, 'web'), 'v3').kind).toBe('missing');
	});
});

describe('missingReason', () => {
	const record = (extra: Partial<Deployment>): Deployment => ({
		deployment_id: 'v2',
		project: 'web',
		status: 'success',
		...extra,
	});

	it('says the deploy failed on a node its record lists as failed', () => {
		const failed = record({ peer_results: [{ node: 'c', status: 'failed' }, { node: 'b', status: 'success' }] });
		expect(missingReason('c', failed)).toBe('failed-there');
		expect(missingReason('b', failed)).toBe('not-kept');
	});

	it('says a release from a local directory is never kept', () => {
		expect(missingReason('c', record({ package_identifier: 'file:/srv/web' }))).toBe('local-directory');
	});

	it('says a failed deploy may never have reached a node it recorded nothing for', () => {
		const failed = record({ status: 'failed', peer_results: [{ node: 'b', status: 'success' }] });
		expect(missingReason('c', failed)).toBe('not-reached');
		expect(missingReason('b', failed)).toBe('not-kept');
		expect(missingReason('c', record({ status: 'failed', package_identifier: 'file:/srv/web' }))).toBe(
			'local-directory',
		);
	});

	it('cannot tell the rest apart', () => {
		expect(missingReason('c', record({ package_identifier: 'npm:web@1.0.0' }))).toBe('not-kept');
	});

	it('knows nothing of why without the record that built it', () => {
		expect(missingReason('c', undefined)).toBe('unknown');
	});
});

describe('releasedId', () => {
	it("is an activation's source, and any other record's own id", () => {
		expect(releasedId({ deployment_id: 'a2', project: 'web', status: 'success', activated_from: 'v2' })).toBe('v2');
		expect(releasedId({ deployment_id: 'v3', project: 'web', status: 'partial', activated_from: null })).toBe('v3');
	});
});
