import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { AxiosError, type AxiosInstance } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fabricModelKeys } from './modelEntries';
import { ModelSaveError, saveModelChange } from './saveModelChange';

const { cluster } = vi.hoisted(() => ({
	cluster: { allInstances: [] as unknown[], targets: [] as unknown[] },
}));
vi.mock('@/hooks/getClusterRestartTargets', () => ({ getClusterRestartTargets: async () => cluster }));

type Body = { operation: string; models?: unknown; replicated?: unknown };

function instance(config: Record<string, unknown>, refuse?: unknown, reports = '5.4.0') {
	const writes: Body[] = [];
	const post = vi.fn(async (_path: string, body: Body) => {
		if (body.operation === 'registration_info') {
			return { data: { version: reports } };
		}
		if (body.operation === 'get_configuration') {
			return { data: structuredClone(config) };
		}
		writes.push(body);
		if (refuse) {
			throw refuse;
		}
		config.models = body.models;
		return { data: { message: 'Configuration successfully set.' } };
	});
	return { config, writes, client: { post } as unknown as AxiosInstance };
}

function single(node: ReturnType<typeof instance>): InstanceClientIdConfig & InstanceTypeConfig {
	return { instanceClient: node.client, entityId: 'ins-1', entityType: 'instance' } as
		& InstanceClientIdConfig
		& InstanceTypeConfig;
}

const mine = { backend: 'ollama', model: 'llama3.2' };

beforeEach(() => {
	cluster.allInstances = [];
	cluster.targets = [];
});

describe('saving to one instance', () => {
	it('merges the change into the block the instance holds now, not the one the page loaded', async () => {
		const node = instance({
			models: { embedding: { theirs: { backend: 'ollama' } }, calibration: { interval: 3_600_000 } },
			logging: { level: 'info' },
		});
		const outcome = await saveModelChange(single(node), { kind: 'generative', name: 'mine', entry: mine }, undefined);
		expect(outcome).toEqual({ saved: 1, notRunning: 0 });
		expect(node.writes).toEqual([{
			operation: 'set_configuration',
			models: {
				embedding: { theirs: { backend: 'ollama' } },
				calibration: { interval: 3_600_000 },
				generative: { mine },
			},
		}]);
	});

	it('asks the instance its version, and writes nothing to one that cannot take the write', async () => {
		const node = instance({}, undefined, '5.3.6');
		await expect(saveModelChange(single(node), { kind: 'generative', name: 'mine', entry: mine }, undefined))
			.rejects.toThrow('This instance runs 5.3.6, so nothing was changed.');
		expect(node.writes).toEqual([]);
	});

	it('refuses an edit of an entry that changed since the page loaded it, and writes nothing', async () => {
		const node = instance({ models: { generative: { mine: { backend: 'ollama', model: 'changed-by-someone' } } } });
		await expect(
			saveModelChange(single(node), { kind: 'generative', name: 'mine', entry: mine, loaded: mine }, undefined),
		).rejects.toThrow(/changed since this page loaded it/);
		expect(node.writes).toEqual([]);
	});

	it('refuses to add over an entry that appeared meanwhile', async () => {
		const node = instance({ models: { generative: { mine: { backend: 'openai', apiKey: 'k' } } } });
		await expect(saveModelChange(single(node), { kind: 'generative', name: 'mine', entry: mine }, undefined))
			.rejects.toThrow(/was added since this page loaded/);
		expect(node.writes).toEqual([]);
	});

	it("never writes over one of Fabric's entries, however the request got here", async () => {
		const fabric = { backend: 'openai', baseUrl: 'https://hub.example.com/v1', apiKey: 't', model: 'default' };
		const node = instance({ models: { embedding: { default: fabric } } });
		const keys = fabricModelKeys([{ modelsConfig: { embedding: { default: {} } } }]);
		for (const entry of [mine, undefined]) {
			await expect(
				saveModelChange(single(node), { kind: 'embedding', name: 'default', entry, loaded: fabric }, keys),
			).rejects.toThrow(/Fabric manages the embedding model 'default'/);
		}
		expect(node.writes).toEqual([]);
	});

	it('removes an entry, and writes nothing when it is already gone', async () => {
		const node = instance({ models: { generative: { mine, other: mine } } });
		await saveModelChange(single(node), { kind: 'generative', name: 'mine', loaded: mine }, undefined);
		expect(node.config.models).toEqual({ generative: { other: mine } });
		const gone = instance({ models: { generative: { other: mine } } });
		expect(await saveModelChange(single(gone), { kind: 'generative', name: 'mine' }, undefined)).toEqual({
			saved: 1,
			notRunning: 0,
		});
		expect(gone.writes).toEqual([]);
	});

	it("passes Harper's own refusal through", async () => {
		const refusal = Object.assign(new Error('Request failed with status code 409'), {
			response: { data: { error: 'Cannot set models: HARPER_SET_CONFIG defines models. Change that variable first.' } },
		});
		const node = instance({}, refusal);
		await expect(saveModelChange(single(node), { kind: 'generative', name: 'mine', entry: mine }, undefined))
			.rejects.toBe(refusal);
	});
});

describe('saving to a cluster', () => {
	const params = { instanceClient: {}, entityId: 'clu-1', entityType: 'cluster' } as
		& InstanceClientIdConfig
		& InstanceTypeConfig;

	function members(...nodes: Array<ReturnType<typeof instance> & { version?: string | null; name?: string }>) {
		cluster.targets = nodes.map((node, index) => ({
			instance: {
				id: `ins-${index + 1}`,
				name: node.name,
				version: node.version === null ? undefined : node.version ?? '5.4.0',
				status: 'RUNNING',
			},
			instanceClient: node.client,
		}));
		cluster.allInstances = cluster.targets.map((target) => (target as { instance: unknown }).instance);
	}

	it("writes each instance its own block, so one instance's Fabric entry never lands on another", async () => {
		const east = instance({ models: { embedding: { default: { backend: 'openai', baseUrl: 'https://east/v1' } } } });
		const west = instance({ models: { embedding: { default: { backend: 'openai', baseUrl: 'https://west/v1' } } } });
		members(east, west);
		const outcome = await saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, new Set());
		expect(outcome).toEqual({ saved: 2, notRunning: 0 });
		expect(east.config.models).toEqual({
			embedding: { default: { backend: 'openai', baseUrl: 'https://east/v1' } },
			generative: { mine },
		});
		expect(west.config.models).toEqual({
			embedding: { default: { backend: 'openai', baseUrl: 'https://west/v1' } },
			generative: { mine },
		});
		for (const write of [...east.writes, ...west.writes]) {
			expect(Object.hasOwn(write, 'replicated')).toBe(false);
		}
	});

	it('brings an instance that was behind level, instead of refusing it as changed', async () => {
		const current = instance({ models: { generative: { mine } } });
		const behind = instance({ models: { generative: { mine: { backend: 'ollama', model: 'older' } } } });
		members(current, behind);
		const entry = { backend: 'ollama', model: 'newer' };
		await saveModelChange(params, { kind: 'generative', name: 'mine', entry, loaded: mine }, undefined);
		expect(current.config.models).toEqual({ generative: { mine: entry } });
		expect(behind.config.models).toEqual({ generative: { mine: entry } });
	});

	it('changes nothing when any instance runs a Harper that cannot take the write', async () => {
		const ready = instance({});
		const old = Object.assign(instance({}), { version: '5.3.6', name: 'node-2' });
		members(ready, old);
		await expect(saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, undefined))
			.rejects.toThrow('node-2 runs 5.3.6, so nothing was changed.');
		expect(ready.writes).toEqual([]);
	});

	it('asks an instance its version when central manager has none, so an old one still stops the save', async () => {
		const ready = instance({});
		const old = Object.assign(instance({}, undefined, '5.3.6'), { version: null, name: 'node-2' });
		members(ready, old);
		await expect(saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, undefined))
			.rejects.toThrow('node-2 runs 5.3.6, so nothing was changed.');
		expect(ready.writes).toEqual([]);
	});

	it('says a later write that got no answer is unconfirmed, not refused', async () => {
		const unanswered = new AxiosError(
			'Gateway Timeout',
			AxiosError.ERR_BAD_RESPONSE,
			{ method: 'post', url: '/', data: JSON.stringify({ operation: 'set_configuration' }) } as never,
			undefined,
			{ status: 504 } as never,
		);
		const first = instance({});
		const second = Object.assign(instance({}, unanswered), { name: 'node-2' });
		members(first, second);
		const failure = await saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, undefined)
			.catch((error: unknown) => error);
		expect((failure as Error).message).toBe(
			"Saved on 1 of 2 instances, then node-2 didn't answer. Check whether the model changed there before you try again.",
		);
		expect((failure as Error).cause).toBe(unanswered);
	});

	it('says how far it got when an instance refuses part-way, and stops there', async () => {
		const first = instance({});
		const second = Object.assign(instance({}, new Error('disk full')), { name: 'node-2' });
		const third = instance({});
		members(first, second, third);
		const failure = await saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, undefined)
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(ModelSaveError);
		expect((failure as Error).message).toBe('Saved on 1 of 3 instances, then node-2 refused: disk full');
		expect((failure as Error).cause).toBeInstanceOf(Error);
		expect(third.writes).toEqual([]);
	});

	it('counts the live instances it could not reach, and refuses when none is running', async () => {
		const running = instance({});
		members(running);
		cluster.allInstances = [...cluster.allInstances, { id: 'ins-2', status: 'UPDATING' }, {
			id: 'ins-3',
			status: 'TERMINATED',
		}];
		expect(await saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, undefined)).toEqual({
			saved: 1,
			notRunning: 1,
		});
		cluster.targets = [];
		await expect(saveModelChange(params, { kind: 'generative', name: 'mine', entry: mine }, undefined))
			.rejects.toThrow(/No running instance/);
	});
});
