import {
	instanceModelNames,
	localRestUrl,
	modelsGatewayEnabled,
	readModelsBlock,
	rootConfigServesRest,
	setModelsBlock,
	supportsDecisionModels,
	supportsModels,
	supportsModelsGateway,
	supportsModelsWrite,
} from '@/integrations/api/instance/models/models';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

describe('the release each model feature first shipped in', () => {
	it.each([
		['the models block', supportsModels, '5.1.0-beta.1', '5.0.9'],
		// 5.2.0 itself shipped without the gateway component.
		['the /v1 API', supportsModelsGateway, '5.2.1', '5.2.0'],
		['decision models', supportsDecisionModels, '5.3.0-beta.4', '5.3.0-beta.3'],
		// 5.3 refuses `models` as an unrecognized parameter.
		['writing models through set_configuration', supportsModelsWrite, '5.4.0-alpha.1', '5.3.6'],
	])('%s', (_name, supports, first, before) => {
		expect(supports(first)).toBe(true);
		expect(supports(before)).toBe(false);
		expect(supports('6.0.0')).toBe(true);
		expect(supports(undefined)).toBe(false);
		expect(supports('not-a-version')).toBe(false);
	});
});

describe('reading a get_configuration answer', () => {
	it('returns the models block only when it is an object', () => {
		const models = { embedding: { default: { backend: 'ollama' } } };
		expect(readModelsBlock({ models })).toBe(models);
		for (const configuration of [undefined, null, 'x', {}, { models: null }, { models: [] }, { models: 'x' }]) {
			expect(readModelsBlock(configuration)).toBeUndefined();
		}
	});

	it('lists the model names a schema directive can refer to', () => {
		const models = { embedding: { default: {}, multimodal: {} }, generative: { default: {} }, decision: { route: {} } };
		expect(instanceModelNames({ models })).toEqual({ embedding: ['default', 'multimodal'], decision: ['route'] });
		expect(instanceModelNames({ models: { embedding: 'nope' } })).toEqual({ embedding: [], decision: [] });
		expect(instanceModelNames(undefined)).toEqual({ embedding: [], decision: [] });
	});

	it('reads the /v1 switch as on only when it is exactly true', () => {
		expect(modelsGatewayEnabled({ modelsGateway: { enabled: true } })).toBe(true);
		for (const configuration of [{}, { modelsGateway: {} }, { modelsGateway: { enabled: 'true' } }, undefined]) {
			expect(modelsGatewayEnabled(configuration)).toBe(false);
		}
	});

	it('finds REST turned on by the root config under either spelling', () => {
		expect(rootConfigServesRest({ rest: true })).toBe(true);
		expect(rootConfigServesRest({ REST: { webSocket: false } })).toBe(true);
		expect(rootConfigServesRest({ rest: false })).toBe(false);
		expect(rootConfigServesRest({})).toBe(false);
	});
});

describe('localRestUrl', () => {
	it('is the operations host on the HTTP port the config names, not the operations port', () => {
		expect(localRestUrl({ http: { port: 9926, securePort: null } }, 'http://localhost:9925/')).toBe(
			'http://localhost:9926',
		);
	});

	it('prefers the secure port, over https', () => {
		expect(localRestUrl({ http: { port: 9926, securePort: 9927 } }, 'https://harper.example.com:9925')).toBe(
			'https://harper.example.com:9927',
		);
		expect(localRestUrl({ http: { port: null, securePort: 443 } }, 'https://[::1]:9925')).toBe('https://[::1]:443');
	});

	it('gives nothing rather than a guess when the port or the host is unknown', () => {
		expect(localRestUrl({ http: { port: null, securePort: null } }, 'http://localhost:9925')).toBeUndefined();
		expect(localRestUrl({}, 'http://localhost:9925')).toBeUndefined();
		expect(localRestUrl({ http: { port: 9926 } }, undefined)).toBeUndefined();
	});
});

it('sends the whole block as one models parameter, and never asks Harper to fan it out', async () => {
	const post = vi.fn(async () => ({ data: {} }));
	const models = { generative: { mine: { backend: 'ollama', model: 'llama3.2' } } };
	await setModelsBlock({ instanceClient: { post } as unknown as AxiosInstance, models });
	expect(post).toHaveBeenCalledWith('/', { operation: 'set_configuration', models });
});
