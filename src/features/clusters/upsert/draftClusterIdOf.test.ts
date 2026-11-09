import { describe, expect, it } from 'vitest';
import { draftClusterIdOf } from './draftClusterIdOf';

describe('draftClusterIdOf', () => {
	it('names the cluster a draft saved during an edit belongs to', () => {
		expect(draftClusterIdOf({ clusterId: 'clu-1', clusterName: 'Production' })).toBe('clu-1');
	});

	it.each([
		['no draft', null],
		['a new-cluster draft', { clusterName: 'Fresh' }],
		['a failed cluster being tried again', { id: 'clu-9', name: 'Failed one', organizationId: 'org-a' }],
		['a createCluster link', 'shared'],
		['an empty cluster id', { clusterId: '' }],
		['a cluster id that is not a string', { clusterId: 42 }],
	])('names none for %s', (_label, saved) => {
		expect(draftClusterIdOf(saved)).toBeUndefined();
	});
});
