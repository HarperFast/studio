import { describe, expect, it } from 'vitest';
import {
	buildModelEntry,
	emptyModelForm,
	fabricModelKeys,
	isFabricManaged,
	modelFormFromEntry,
	storedEntry,
	summarizeModels,
	validateModelForm,
	withModelEntry,
} from './modelEntries';

const SECRET = 'sk-live-do-not-show';
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.tenant-token';

const block = {
	embedding: {
		default: { backend: 'openai', baseUrl: 'https://hub-1.example.com/v1', apiKey: TOKEN, model: 'default' },
		multimodal: { backend: 'openai', baseUrl: 'http://host.docker.internal:8001/v1', apiKey: TOKEN, model: 'clip' },
		mine: { backend: 'ollama', host: 'ollama.internal:11434', model: 'nomic-embed-text' },
	},
	generative: {
		default: {
			backend: 'openai',
			apiKey: SECRET,
			baseUrl: 'https://user:hunter2@llm.example.com/v1',
			organization: 'org-1',
			model: 'gpt-x',
			requestTimeoutMs: 30_000,
			fallback: ['backup'],
		},
		backup: { backend: 'anthropic', apiKey: '${ANTHROPIC_API_KEY}', model: 'claude-x' },
		custom: { backend: './my-backend.js', anything: true },
	},
	decision: { classify: { backend: 'generative', samples: 3 } },
	calibration: { interval: 3_600_000 },
};

const fabricKeys = fabricModelKeys([{ modelsConfig: { embedding: { default: { apiKey: '[REDACTED]' } } } }]);

describe('summarizeModels', () => {
	const summaries = summarizeModels(block, fabricKeys);

	it('never carries a key or a token, whatever else it shows', () => {
		const everything = JSON.stringify(summaries);
		expect(everything).not.toContain(SECRET);
		expect(everything).not.toContain(TOKEN);
		expect(everything).not.toContain('hunter2');
	});

	it('says where a key comes from instead: the environment variable, or that one is saved', () => {
		const byName = Object.fromEntries(summaries.generative.map((model) => [model.name, model]));
		expect(byName.default.keyNote).toBe('Key saved');
		expect(byName.backup.keyNote).toBe('Key from ${ANTHROPIC_API_KEY}');
		expect(byName.custom.keyNote).toBeUndefined();
	});

	it('does not name a placeholder that is anything but a plain variable name', () => {
		const [model] = summarizeModels({ generative: { odd: { backend: 'openai', apiKey: '${a-secret}' } } }, undefined)
			.generative;
		expect(model.keyNote).toBe('Key saved');
	});

	it('lists each entry with its backend, model and non-secret settings', () => {
		expect(summaries.generative[0]).toMatchObject({
			name: 'default',
			backend: 'openai',
			model: 'gpt-x',
			fallback: ['backup'],
			editable: true,
			fabricManaged: false,
		});
		expect(summaries.generative[0].details).toEqual([
			{ label: 'Base URL', value: 'https://llm.example.com/v1' },
			{ label: 'Organization', value: 'org-1' },
		]);
		expect(summaries.decision[0].details).toEqual([{ label: 'Decides with', value: "generative model 'default'" }]);
	});

	it("marks Fabric's entries, by central manager's names and by the GPU host's own address", () => {
		const managed = Object.fromEntries(summaries.embedding.map((model) => [model.name, model.fabricManaged]));
		expect(managed).toEqual({ default: true, multimodal: true, mine: false });
	});

	it("shows nothing about where a Fabric entry points, and doesn't offer it for editing", () => {
		const fabric = summaries.embedding.filter((model) => model.fabricManaged);
		for (const model of fabric) {
			expect(model.details).toEqual([]);
			expect(model.keyNote).toBeUndefined();
			expect(model.editable).toBe(false);
		}
	});

	it('marks nothing as managed off Fabric, where the same address is just an address', () => {
		expect(summarizeModels(block, undefined).embedding.every((model) => !model.fabricManaged)).toBe(true);
		expect(isFabricManaged('embedding', 'multimodal', block.embedding.multimodal, undefined)).toBe(false);
	});

	it('lists an entry with a backend Studio has no form for, without offering to edit it', () => {
		const custom = summaries.generative.find((model) => model.name === 'custom');
		expect(custom).toMatchObject({ backend: './my-backend.js', editable: false });
	});

	it('survives a block or an entry that is not what Harper documents', () => {
		const odd = summarizeModels({ embedding: 'nope', generative: { broken: null, list: [] } }, undefined);
		expect(odd.embedding).toEqual([]);
		expect(odd.generative.map((model) => [model.name, model.backend, model.editable])).toEqual([
			['broken', undefined, false],
			['list', undefined, false],
		]);
		expect(summarizeModels(undefined, undefined)).toEqual({ embedding: [], generative: [], decision: [] });
	});
});

describe('fabricModelKeys', () => {
	it('collects the names from every instance, and tolerates instances without any', () => {
		const keys = fabricModelKeys([
			{},
			{ modelsConfig: null },
			{ modelsConfig: { embedding: { default: {} }, generative: { default: {} } } },
		]);
		expect([...keys].sort()).toEqual(['embedding:default', 'generative:default']);
		expect(fabricModelKeys(undefined).size).toBe(0);
	});
});

describe('the edit form', () => {
	it('never holds the stored key', () => {
		const form = modelFormFromEntry('generative', 'default', block.generative.default);
		expect(JSON.stringify(form)).not.toContain(SECRET);
		expect(form.apiKey).toBe('');
		expect(form).toMatchObject({ backend: 'openai', model: 'gpt-x', organization: 'org-1', fallback: 'backup' });
	});

	it('saved untouched, sends back exactly what is stored', () => {
		for (const [name, stored] of Object.entries(block.generative)) {
			if (name === 'custom') {
				continue;
			}
			expect(buildModelEntry(modelFormFromEntry('generative', name, stored), stored)).toEqual(stored);
		}
		const classify = block.decision.classify;
		expect(buildModelEntry(modelFormFromEntry('decision', 'classify', classify), classify)).toEqual(classify);
	});

	it('keeps the saved key, and every setting it has no input for, when another field changes', () => {
		const stored = block.generative.default;
		const form = { ...modelFormFromEntry('generative', 'default', stored), model: ' gpt-y ' };
		expect(buildModelEntry(form, stored)).toEqual({ ...stored, model: 'gpt-y' });
	});

	it('replaces the key only when one is typed', () => {
		const stored = block.generative.default;
		const form = { ...modelFormFromEntry('generative', 'default', stored), apiKey: '${OPENAI_API_KEY}' };
		expect(buildModelEntry(form, stored).apiKey).toBe('${OPENAI_API_KEY}');
	});

	it('removes a setting whose input was cleared', () => {
		const stored = block.generative.default;
		const form = { ...modelFormFromEntry('generative', 'default', stored), organization: '', fallback: ' ' };
		const entry = buildModelEntry(form, stored);
		expect(Object.hasOwn(entry, 'organization')).toBe(false);
		expect(Object.hasOwn(entry, 'fallback')).toBe(false);
	});

	it("starts over when the backend changes, so no other backend's field or key is sent", () => {
		const stored = block.generative.default;
		const form = { ...modelFormFromEntry('generative', 'default', stored), backend: 'ollama', host: 'localhost:11434' };
		expect(buildModelEntry(form, stored)).toEqual({
			backend: 'ollama',
			model: 'gpt-x',
			host: 'localhost:11434',
			fallback: ['backup'],
		});
	});

	it('builds a new entry from only what was filled in', () => {
		const form = { ...emptyModelForm('embedding', 'bedrock'), name: 'titan', model: 'amazon.titan-embed-text-v2:0' };
		expect(buildModelEntry(form)).toEqual({ backend: 'bedrock', model: 'amazon.titan-embed-text-v2:0' });
		const decision = { ...emptyModelForm('decision'), name: 'route' };
		expect(buildModelEntry(decision)).toEqual({ backend: 'generative' });
	});
});

describe('validateModelForm', () => {
	const valid = { ...emptyModelForm('generative', 'openai'), name: 'mine', model: 'gpt-x', apiKey: 'sk-1' };

	it('accepts a complete new entry', () => {
		expect(validateModelForm(valid, { block })).toBeUndefined();
	});

	it.each(['', ' mine', 'my model', '__proto__', '-x', 'a.b'])('refuses the name %j', (name) => {
		expect(validateModelForm({ ...valid, name }, { block })).toMatch(/Name the model/);
	});

	it('refuses a name the kind already has, including one of Fabric’s', () => {
		expect(validateModelForm({ ...valid, name: 'default' }, { block })).toBe(
			"A generative model named 'default' already exists.",
		);
		expect(validateModelForm({ ...valid, name: 'constructor' }, { block })).toBeUndefined();
	});

	it('refuses a backend the kind cannot use', () => {
		const embedding = { ...valid, name: 'claude', kind: 'embedding' as const, backend: 'anthropic' };
		expect(validateModelForm({ ...embedding, name: 'mine' }, { block })).toBe(
			"An embedding model named 'mine' already exists.",
		);
		expect(validateModelForm(embedding, { block })).toBe('Choose a backend.');
	});

	it('needs a model id and, for a keyed provider, a key', () => {
		expect(validateModelForm({ ...valid, model: ' ' }, { block })).toMatch(/model id/);
		expect(validateModelForm({ ...valid, apiKey: '' }, { block })).toMatch(/API key/);
		expect(validateModelForm({ ...valid, backend: 'ollama', apiKey: '' }, { block })).toBeUndefined();
	});

	it('lets an edit leave the key empty, but not once the backend changes', () => {
		const stored = block.generative.default;
		const form = modelFormFromEntry('generative', 'default', stored);
		expect(validateModelForm(form, { block, stored })).toBeUndefined();
		expect(validateModelForm({ ...form, backend: 'anthropic' }, { block, stored })).toMatch(/API key/);
	});

	it('checks a base URL only when it was changed, and accepts a placeholder for one', () => {
		expect(validateModelForm({ ...valid, baseUrl: 'llm.example.com' }, { block })).toMatch(/base URL/);
		expect(validateModelForm({ ...valid, baseUrl: '${LLM_URL}' }, { block })).toBeUndefined();
		const stored = { backend: 'openai', apiKey: 'k', model: 'm', baseUrl: 'not a url' };
		expect(validateModelForm(modelFormFromEntry('generative', 'odd', stored), { block, stored })).toBeUndefined();
	});

	it('needs the generative model a decision model decides with to exist', () => {
		const decision = { ...emptyModelForm('decision'), name: 'route' };
		expect(validateModelForm(decision, { block })).toBeUndefined();
		expect(validateModelForm({ ...decision, generative: 'missing' }, { block })).toMatch(
			/no generative model named 'missing'/,
		);
		expect(validateModelForm(decision, { block: { embedding: block.embedding } })).toMatch(
			/no generative model named 'default'/,
		);
	});

	it('needs each fallback to be another model of the same kind', () => {
		expect(validateModelForm({ ...valid, fallback: 'backup, default' }, { block })).toBeUndefined();
		expect(validateModelForm({ ...valid, fallback: 'mine' }, { block })).toMatch(/fall back to itself/);
		expect(validateModelForm({ ...valid, fallback: 'nomic' }, { block })).toMatch(/no generative model named 'nomic'/);
	});
});

describe('withModelEntry', () => {
	it('adds an entry and carries everything else over', () => {
		const entry = { backend: 'ollama', model: 'llama3.2' };
		const next = withModelEntry(block, 'generative', 'mine', entry);
		expect(next).toEqual({ ...block, generative: { ...block.generative, mine: entry } });
		expect(Object.keys(next)).toEqual(Object.keys(block));
		expect(next.calibration).toBe(block.calibration);
	});

	it('replaces an entry in place, so an unchanged save yields the same document', () => {
		const next = withModelEntry(block, 'generative', 'default', block.generative.default);
		expect(JSON.stringify(next)).toBe(JSON.stringify(block));
	});

	it('removes one entry, and the kind with its last one', () => {
		const next = withModelEntry(block, 'decision', 'classify', undefined);
		expect(Object.hasOwn(next, 'decision')).toBe(false);
		expect(next.generative).toEqual(block.generative);
		expect(withModelEntry(block, 'embedding', 'mine', undefined).embedding).toEqual({
			default: block.embedding.default,
			multimodal: block.embedding.multimodal,
		});
	});

	it('starts a block that has none', () => {
		expect(withModelEntry(undefined, 'embedding', 'mine', { backend: 'ollama' })).toEqual({
			embedding: { mine: { backend: 'ollama' } },
		});
		expect(withModelEntry(undefined, 'embedding', 'mine', undefined)).toEqual({});
	});

	it('keeps a stored entry named like an Object.prototype member as an ordinary key', () => {
		const stored = JSON.parse(
			'{"generative":{"__proto__":{"backend":"ollama"},"hasOwnProperty":{"backend":"ollama"}}}',
		);
		const next = withModelEntry(stored, 'generative', 'mine', { backend: 'ollama' });
		expect(Object.keys(next.generative as object)).toEqual(['__proto__', 'hasOwnProperty', 'mine']);
		expect(storedEntry(next, 'generative', '__proto__')).toEqual({ backend: 'ollama' });
		expect(storedEntry(next, 'generative', 'toString')).toBeUndefined();
	});
});
