import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import { describe, expect, it } from 'vitest';
import { schedulerApps } from './schedulerApps';

/** The shape harper 5.3.5's `get_components` answered with for one healthy app and one whose jobs failed to load. */
const TREE: APIDirectoryEntry = {
	name: 'components',
	entries: [
		{
			name: 'metrics-app',
			entries: [
				{ name: 'config.yaml', size: 387 },
				{ name: 'jobs.js', size: 191 },
				{ name: 'lib', entries: [{ name: 'util.ts', size: 10 }] },
			],
			status: { status: 'healthy', message: 'All components loaded successfully' },
		},
		{
			name: 'broken-app',
			entries: [{ name: 'config.yaml', size: 113 }, { name: 'jobs.js', size: 27 }],
			status: {
				status: 'error',
				message: "broken-app.scheduler: Could not load component 'broken-app.scheduler'",
				details: {
					'broken-app.scheduler': { status: 'error', message: "Could not load component 'broken-app.scheduler'" },
				},
			},
		},
		{
			name: 'from-github',
			package: 'github:acme/jobs#main',
			entries: [{ name: 'harperdb-config.yaml' }, { name: 'config.yaml' }],
		},
		{ name: 'status-check', package: 'github:HarperFast/status-check-fabric', entries: [] },
		{ name: 'stray-file.txt' },
	] as APIDirectoryEntry['entries'],
};

describe('schedulerApps', () => {
	it('lists each app with its files and the config file Harper reads', () => {
		const apps = schedulerApps(TREE);
		expect(apps.map((app) => app.name)).toEqual(['broken-app', 'from-github', 'metrics-app', 'status-check']);
		const metrics = apps.find((app) => app.name === 'metrics-app')!;
		expect(metrics).toMatchObject({ configFile: 'config.yaml', readOnly: undefined, schedulerFailed: false });
		expect([...metrics.files]).toEqual(['config.yaml', 'jobs.js', 'lib/util.ts']);
	});

	it('picks the config file Harper looks for first', () => {
		expect(schedulerApps(TREE).find((app) => app.name === 'from-github')?.configFile).toBe('harperdb-config.yaml');
	});

	it('marks an app whose scheduler failed to load', () => {
		expect(schedulerApps(TREE).find((app) => app.name === 'broken-app')?.schedulerFailed).toBe(true);
	});

	it("won't edit an app a deploy replaces, or one the platform manages", () => {
		const apps = schedulerApps(TREE);
		expect(apps.find((app) => app.name === 'from-github')?.readOnly).toMatch(/^Deployed from github:acme\/jobs#main/);
		expect(apps.find((app) => app.name === 'status-check')?.readOnly).toBe('Managed by the platform.');
	});
});
