import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { schedulerApps } from './schedulerApps';
import { ConfigChangedError, saveAppJobs } from './useSaveAppJobs';

const ORIGINAL = 'rest: true\n';

function tree(files: string[], packageSpec?: string): APIDirectoryEntry {
	return {
		name: 'components',
		entries: [{ name: 'app', package: packageSpec, entries: files.map((name) => ({ name })) }],
	};
}

function fakeInstance({ files, text, packageSpec }: { files: string[]; text: string; packageSpec?: string }) {
	const post = vi.fn(async (_url: string, body: { operation: string }) => {
		switch (body.operation) {
			case 'get_components':
				return { data: tree(files, packageSpec) };
			case 'get_component_file':
				return { data: { message: text } };
			case 'set_component_file':
				return { data: { message: 'Successfully set component: config.yaml' } };
			default:
				throw new Error(`unexpected ${body.operation}`);
		}
	});
	const params = {
		instanceClient: { post } as unknown as AxiosInstance,
		entityId: 'instance-1',
		entityType: 'instance' as const,
	};
	return { post, params };
}

function writes(post: ReturnType<typeof fakeInstance>['post']) {
	return post.mock.calls.map(([, body]) => body).filter((body) => body.operation === 'set_component_file');
}

describe('saveAppJobs', () => {
	it('writes the changed text when the file still holds what the change was made against', async () => {
		const { post, params } = fakeInstance({ files: ['config.yaml'], text: ORIGINAL });
		const [app] = schedulerApps(tree(['config.yaml']));
		await expect(saveAppJobs(params, { app, baseText: ORIGINAL, change: (text) => `${text}more: 1\n` })).resolves
			.toEqual({ file: 'config.yaml' });
		expect(writes(post)).toEqual([
			expect.objectContaining({
				project: 'app',
				file: 'config.yaml',
				payload: 'rest: true\nmore: 1\n',
				replicated: false,
			}),
		]);
	});

	it('refuses to overwrite a file someone changed since the page read it', async () => {
		const { post, params } = fakeInstance({ files: ['config.yaml'], text: 'rest: false\n' });
		const [app] = schedulerApps(tree(['config.yaml']));
		await expect(saveAppJobs(params, { app, baseText: ORIGINAL, change: () => 'x' })).rejects.toBeInstanceOf(
			ConfigChangedError,
		);
		expect(writes(post)).toEqual([]);
	});

	it('refuses to create config.yaml once the app has gained a config file Harper reads instead', async () => {
		const { post, params } = fakeInstance({ files: ['harper-config.yaml'], text: '' });
		const [app] = schedulerApps(tree([]));
		await expect(saveAppJobs(params, { app, baseText: undefined, change: () => 'x' })).rejects.toBeInstanceOf(
			ConfigChangedError,
		);
		expect(writes(post)).toEqual([]);
	});

	it('refuses an app a deploy took over since the page loaded', async () => {
		const { post, params } = fakeInstance({ files: ['config.yaml'], text: ORIGINAL, packageSpec: 'github:acme/jobs' });
		const [app] = schedulerApps(tree(['config.yaml']));
		await expect(saveAppJobs(params, { app, baseText: ORIGINAL, change: () => 'x' })).rejects.toThrow(
			/Deployed from github:acme\/jobs/,
		);
		expect(writes(post)).toEqual([]);
	});

	it('refuses a job whose handler file was deleted since the dialog opened', async () => {
		const { post, params } = fakeInstance({ files: ['config.yaml'], text: ORIGINAL });
		const [app] = schedulerApps(tree(['config.yaml', 'jobs.js']));
		await expect(
			saveAppJobs(params, { app, baseText: ORIGINAL, handlerFile: 'jobs.js', change: () => 'x' }),
		).rejects.toThrow(/jobs.js is no longer in app/);
		expect(writes(post)).toEqual([]);
	});

	it('creates config.yaml for an app that still has no config file, replicated on a cluster', async () => {
		const { post, params } = fakeInstance({ files: ['jobs.js'], text: '' });
		const [app] = schedulerApps(tree(['jobs.js']));
		await saveAppJobs({ ...params, entityType: 'cluster' }, { app, baseText: undefined, change: () => 'new\n' });
		expect(writes(post)).toEqual([
			expect.objectContaining({ file: 'config.yaml', payload: 'new\n', replicated: true }),
		]);
	});
});
