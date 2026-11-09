import { Instance } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { clusterBackupNodes } from './backupNodes';

function instance(overrides: Partial<Instance>): Instance {
	return {
		id: 'ins-1',
		name: 'node-1',
		clusterId: 'clu-1',
		instanceFqdn: 'node-1.example.harper.fast',
		operationsApiPort: 9925,
		operationsApiSecure: true,
		status: 'RUNNING',
		version: '5.3.4',
		...overrides,
	} as Instance;
}

describe('clusterBackupNodes', () => {
	it('lists every member that still has a disk, by name', () => {
		const nodes = clusterBackupNodes([
			instance({ id: 'ins-b', name: 'beta' }),
			instance({ id: 'ins-gone', name: 'gone', status: 'TERMINATED' }),
			instance({ id: 'ins-a', name: 'alpha' }),
			instance({ id: 'ins-removed', name: 'removed', status: 'REMOVED' }),
		]);
		expect(nodes.map((node) => node.instance.id)).toEqual(['ins-a', 'ins-b']);
		expect(nodes.every((node) => node.unavailable === undefined)).toBe(true);
	});

	it("says why a member's backups can't be read now", () => {
		const [stopped, failed, old, unaddressed] = clusterBackupNodes([
			instance({ id: 'ins-1', name: 'a', status: 'STOPPED' }),
			instance({ id: 'ins-2', name: 'b', status: 'FAILED' }),
			instance({ id: 'ins-3', name: 'c', version: '5.1.2' }),
			instance({ id: 'ins-4', name: 'd', instanceFqdn: undefined }),
		]);
		expect(stopped.unavailable).toMatch(/isn't running/);
		expect(failed.unavailable).toMatch(/failed/);
		expect(old.unavailable).toBe('This node runs Harper 5.1.2. Backups need Harper 5.2.0 or later.');
		expect(unaddressed.unavailable).toMatch(/address/);
	});

	it('leaves a node that reports no version to Harper, which refuses an operation it lacks by name', () => {
		const [node] = clusterBackupNodes([instance({ version: undefined })]);
		expect(node.unavailable).toBeUndefined();
	});

	it('falls back to the address, then the id, for a node with no name', () => {
		const nodes = clusterBackupNodes([
			instance({ id: 'ins-x', name: undefined }),
			instance({ id: 'ins-y', name: undefined, instanceFqdn: undefined }),
		]);
		expect(nodes.map((node) => node.label)).toEqual(['ins-y', 'node-1.example.harper.fast']);
	});
});
