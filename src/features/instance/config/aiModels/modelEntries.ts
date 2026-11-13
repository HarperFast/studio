/** Nothing here returns a stored key: a summary says only where the key comes from. Design notes: ./DESIGN.md. */
import { isRecord, MODEL_KINDS, ModelKind, StoredRecord } from '@/integrations/api/instance/models/models';

/** Anthropic has no embedding API, so Harper refuses its `embed`. */
export const BACKENDS_BY_KIND: Record<ModelKind, readonly string[]> = {
	embedding: ['ollama', 'openai', 'bedrock'],
	generative: ['ollama', 'openai', 'anthropic', 'bedrock'],
	decision: ['generative'],
};

export const KIND_LABELS: Record<ModelKind, { title: string; one: string; purpose: string }> = {
	embedding: { title: 'Embedding models', one: 'embedding', purpose: 'Turn text into vectors for vector search.' },
	generative: { title: 'Generative models', one: 'generative', purpose: 'Write text.' },
	decision: {
		title: 'Decision models',
		one: 'decision',
		purpose: 'Pick a value from a set or a range, using a generative model.',
	},
};

type TextField = 'model' | 'apiKey' | 'baseUrl' | 'organization' | 'host' | 'region' | 'generative';

/** The fields the form edits for each backend. Every other stored field is carried through a save untouched. */
export const BACKEND_FIELDS: Record<string, readonly TextField[]> = {
	ollama: ['model', 'host'],
	openai: ['model', 'apiKey', 'baseUrl', 'organization'],
	anthropic: ['model', 'apiKey', 'baseUrl'],
	bedrock: ['model', 'region'],
	generative: ['generative'],
};

const KEY_BACKENDS = new Set(['openai', 'anthropic']);

/** The host a GPU host's own models are reached on from inside an instance (host-manager `buildHarperModelsConfig`). */
const FABRIC_LOCAL_MODEL_HOST = 'host.docker.internal';

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** Stricter than Harper's own rule (`${…}` with no space), so only a plain variable name is ever displayed. */
const ENV_VAR_PATTERN = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

/** Harper's rule for a value it reads from the environment (harper `utility/expandEnvVar.ts`). */
function isEnvPlaceholder(value: string): boolean {
	return value.startsWith('${') && value.endsWith('}') && !value.slice(2, -1).includes(' ');
}

function modelKey(kind: ModelKind, name: string): string {
	return `${kind}:${name}`;
}

function entriesOf(block: StoredRecord | undefined, kind: ModelKind): Array<[string, unknown]> {
	const entries = block?.[kind];
	return isRecord(entries) ? Object.entries(entries) : [];
}

export function storedEntry(block: StoredRecord | undefined, kind: ModelKind, name: string): unknown {
	const entries = block?.[kind];
	return isRecord(entries) && Object.hasOwn(entries, name) ? entries[name] : undefined;
}

export function modelNames(block: StoredRecord | undefined, kind: ModelKind): string[] {
	return entriesOf(block, kind).map(([name]) => name);
}

/**
 * The entries central manager set up for these instances, as `kind:name`. Central manager masks each
 * token before it answers, so only the names are read.
 */
export function fabricModelKeys(instances: ReadonlyArray<{ modelsConfig?: unknown }> | undefined): Set<string> {
	const keys = new Set<string>();
	for (const instance of instances ?? []) {
		const block = isRecord(instance.modelsConfig) ? instance.modelsConfig : undefined;
		for (const kind of MODEL_KINDS) {
			for (const name of modelNames(block, kind)) {
				keys.add(modelKey(kind, name));
			}
		}
	}
	return keys;
}

function hostOf(url: unknown): string | undefined {
	if (typeof url !== 'string') {
		return undefined;
	}
	try {
		return new URL(url).hostname;
	} catch {
		return undefined;
	}
}

/**
 * Whether Fabric wrote and keeps this entry. `fabricKeys` is absent off Fabric, where nothing is
 * managed. On Fabric an entry is managed when central manager names it, or when it points at the GPU
 * host's own models.
 */
export function isFabricManaged(
	kind: ModelKind,
	name: string,
	entry: unknown,
	fabricKeys: ReadonlySet<string> | undefined,
): boolean {
	if (!fabricKeys) {
		return false;
	}
	return fabricKeys.has(modelKey(kind, name))
		|| (isRecord(entry) && hostOf(entry.baseUrl) === FABRIC_LOCAL_MODEL_HOST);
}

export interface ModelSummary {
	kind: ModelKind;
	name: string;
	/** Absent when the stored entry isn't something Harper could load. */
	backend?: string;
	model?: string;
	/** Never a key, and for a Fabric entry nothing about where it points. */
	details: Array<{ label: string; value: string }>;
	fallback: string[];
	/** Where the key comes from, never the key: the environment variable's name, or that one is saved. */
	keyNote?: string;
	fabricManaged: boolean;
	editable: boolean;
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * An address without the `user:password@` in front of its host. Matched as text, so the rest is shown
 * exactly as stored: Ollama's host needs no scheme, and an address can hold a `${VAR}` that `URL`
 * would refuse or rewrite. A password can hold an `@`, so everything up to the last one before the
 * path goes, after any number of slashes or backslashes. `URL` skips tabs and line breaks anywhere
 * and control characters at the start, so they are skipped here too. Empty when `URL` still finds a
 * sign-in in what is left: an address this can't read is hidden whole.
 */
function withoutCredentials(value: string): string {
	const unbroken = value.replace(/[\t\n\r]/g, '');
	let start = 0;
	while (start < unbroken.length && unbroken.charCodeAt(start) <= 0x20) {
		start += 1;
	}
	const read = unbroken.slice(start);
	const shown = read.replace(/^((?:[a-z][a-z0-9+.-]*:)?[\\/]+)?[^/\\?#]*@/i, '$1');
	if (carriesSignIn(shown)) {
		return '';
	}
	return shown === read ? value : shown;
}

function carriesSignIn(address: string): boolean {
	try {
		const url = new URL(address);
		return url.username !== '' || url.password !== '';
	} catch {
		return false;
	}
}

export function hidesUrlCredentials(value: unknown): boolean {
	return typeof value === 'string' && withoutCredentials(value) !== value;
}

function keyNote(entry: StoredRecord): string | undefined {
	const key = entry.apiKey;
	if (typeof key !== 'string' || key === '') {
		return undefined;
	}
	return ENV_VAR_PATTERN.test(key) ? `Key from ${key}` : 'Key saved';
}

function summarize(
	kind: ModelKind,
	name: string,
	entry: unknown,
	fabricKeys: ReadonlySet<string> | undefined,
): ModelSummary {
	const fabricManaged = isFabricManaged(kind, name, entry, fabricKeys);
	if (!isRecord(entry)) {
		return { kind, name, details: [], fallback: [], fabricManaged, editable: false };
	}
	const backend = text(entry.backend);
	const details: ModelSummary['details'] = [];
	if (kind === 'decision' && backend === 'generative') {
		details.push({ label: 'Decides with', value: `generative model '${text(entry.generative) ?? 'default'}'` });
	}
	if (!fabricManaged) {
		for (const [field, label] of [['host', 'Host'], ['baseUrl', 'Base URL'], ['region', 'Region']] as const) {
			const value = text(entry[field]);
			if (value) {
				details.push({ label, value: withoutCredentials(value) || 'Not shown: it includes a sign-in' });
			}
		}
		const organization = text(entry.organization);
		if (organization) {
			details.push({ label: 'Organization', value: organization });
		}
	}
	return {
		kind,
		name,
		backend,
		model: text(entry.model),
		details,
		fallback: Array.isArray(entry.fallback) ? entry.fallback.filter((item) => typeof item === 'string') : [],
		keyNote: fabricManaged ? undefined : keyNote(entry),
		fabricManaged,
		editable: !fabricManaged && !!backend && BACKENDS_BY_KIND[kind].includes(backend),
	};
}

export function summarizeModels(
	block: StoredRecord | undefined,
	fabricKeys: ReadonlySet<string> | undefined,
): Record<ModelKind, ModelSummary[]> {
	const summaries = {} as Record<ModelKind, ModelSummary[]>;
	for (const kind of MODEL_KINDS) {
		summaries[kind] = entriesOf(block, kind).map(([name, entry]) => summarize(kind, name, entry, fabricKeys));
	}
	return summaries;
}

export interface ModelForm {
	kind: ModelKind;
	name: string;
	backend: string;
	model: string;
	/** What was typed. Empty keeps the saved key: the form never holds one it was given by Harper. */
	apiKey: string;
	baseUrl: string;
	organization: string;
	host: string;
	region: string;
	/** A decision model's generative model. Empty means `default`. */
	generative: string;
	fallback: string;
}

export function emptyModelForm(kind: ModelKind, backend = BACKENDS_BY_KIND[kind][0]): ModelForm {
	return {
		kind,
		name: '',
		backend,
		model: '',
		apiKey: '',
		baseUrl: '',
		organization: '',
		host: '',
		region: '',
		generative: '',
		fallback: '',
	};
}

export function modelFormFromEntry(kind: ModelKind, name: string, entry: StoredRecord): ModelForm {
	const form = emptyModelForm(kind, text(entry.backend) ?? '');
	form.name = name;
	for (const field of ['model', 'baseUrl', 'organization', 'host', 'region', 'generative'] as const) {
		form[field] = text(entry[field]) ?? '';
	}
	// A sign-in inside an address is a secret like the key: an untouched field saves the stored one back.
	form.baseUrl = withoutCredentials(form.baseUrl);
	form.host = withoutCredentials(form.host);
	if (Array.isArray(entry.fallback) && entry.fallback.every((item) => typeof item === 'string')) {
		form.fallback = entry.fallback.join(', ');
	}
	return form;
}

function parseNames(list: string): string[] {
	return list.split(',').map((name) => name.trim()).filter((name) => name !== '');
}

function generativeName(typed: string): string {
	return typed.trim() || 'default';
}

function untouchedForm(form: ModelForm, stored: unknown): ModelForm {
	return isRecord(stored) && stored.backend === form.backend
		? modelFormFromEntry(form.kind, form.name, stored)
		: emptyModelForm(form.kind, form.backend);
}

/** Only what the user changed is checked, so an entry Harper already holds can be saved back as it is. */
export function validateModelForm(
	form: ModelForm,
	{ block, stored }: { block: StoredRecord | undefined; stored?: unknown },
): string | undefined {
	const name = form.name;
	if (stored === undefined) {
		if (!NAME_PATTERN.test(name)) {
			return "Name the model with letters, digits, '-' and '_', starting with a letter or digit.";
		}
		if (storedEntry(block, form.kind, name) !== undefined) {
			return `${form.kind === 'embedding' ? 'An' : 'A'} ${
				KIND_LABELS[form.kind].one
			} model named '${name}' already exists.`;
		}
	}
	if (!BACKENDS_BY_KIND[form.kind].includes(form.backend)) {
		return 'Choose a backend.';
	}
	const untouched = untouchedForm(form, stored);
	const keepsStored = isRecord(stored) && stored.backend === form.backend ? stored : undefined;
	const fields = BACKEND_FIELDS[form.backend];
	// Harper lets an entry omit its model, so one stored without it can be saved back that way.
	const mayOmitModel = keepsStored !== undefined && text(keepsStored.model) === undefined;
	if (fields.includes('model') && form.model.trim() === '' && !mayOmitModel) {
		return "Enter the provider's model id.";
	}
	if (KEY_BACKENDS.has(form.backend) && form.apiKey.trim() === '' && text(keepsStored?.apiKey) === undefined) {
		return 'Enter an API key, or a ${ENV_VAR} placeholder for one.';
	}
	const baseUrl = form.baseUrl.trim();
	if (
		fields.includes('baseUrl') && baseUrl !== '' && form.baseUrl !== untouched.baseUrl && !isEnvPlaceholder(baseUrl)
	) {
		const protocol = (() => {
			try {
				return new URL(baseUrl).protocol;
			} catch {
				return undefined;
			}
		})();
		if (protocol !== 'http:' && protocol !== 'https:') {
			return 'The base URL must start with http:// or https://.';
		}
	}
	if (form.kind === 'decision') {
		const generative = generativeName(form.generative);
		if (generative !== generativeName(untouched.generative) || stored === undefined) {
			if (storedEntry(block, 'generative', generative) === undefined) {
				return form.generative.trim() === '' && modelNames(block, 'generative').length > 0
					? 'Choose the generative model that makes the decision.'
					: `There is no generative model named '${generative}'. A decision model decides with one, so add it first.`;
			}
		}
	}
	if (form.fallback !== untouched.fallback) {
		for (const fallback of parseNames(form.fallback)) {
			if (fallback === name) {
				return "A model can't fall back to itself.";
			}
			if (storedEntry(block, form.kind, fallback) === undefined) {
				return `There is no ${KIND_LABELS[form.kind].one} model named '${fallback}' to fall back to.`;
			}
		}
	}
	return undefined;
}

/**
 * An edit that keeps the backend writes only the fields that were changed, so a saved key, and every
 * setting the form has no input for, goes back exactly as it was. Changing the backend starts over:
 * Harper refuses an entry carrying another backend's fields, and a key for one provider is no use to
 * another.
 */
export function buildModelEntry(form: ModelForm, stored?: unknown): StoredRecord {
	const keepsStored = isRecord(stored) && stored.backend === form.backend ? stored : undefined;
	const untouched = untouchedForm(form, stored);
	const entry: StoredRecord = { ...keepsStored, backend: form.backend };
	for (const field of BACKEND_FIELDS[form.backend] ?? []) {
		const unchanged = field === 'generative'
			? generativeName(form.generative) === generativeName(untouched.generative)
			: form[field] === untouched[field];
		const typed = form[field].trim();
		if (unchanged || (field === 'apiKey' && typed === '')) {
			continue;
		}
		if (typed === '') {
			delete entry[field];
		} else {
			entry[field] = typed;
		}
	}
	if (form.fallback !== untouched.fallback) {
		const names = parseNames(form.fallback);
		if (names.length === 0) {
			delete entry.fallback;
		} else {
			entry.fallback = names;
		}
	}
	return entry;
}

/**
 * The block with one entry set, or removed when `entry` is absent. Everything else in the block,
 * its other entries and settings such as `calibration`, is carried over. Entries are rebuilt with
 * `Object.fromEntries`, which defines a stored name such as `__proto__` as an ordinary key.
 */
export function withModelEntry(
	block: StoredRecord | undefined,
	kind: ModelKind,
	name: string,
	entry: StoredRecord | undefined,
): StoredRecord {
	const current = entriesOf(block, kind);
	const exists = current.some(([existing]) => existing === name);
	const next: Array<[string, unknown]> = entry === undefined
		? current.filter(([existing]) => existing !== name)
		: exists
		? current.map(([existing, value]) => [existing, existing === name ? entry : value])
		: [...current, [name, entry]];
	// The kind keeps its place in the block, so saving an entry back unchanged yields the same document.
	const sections = Object.entries(block ?? {});
	if (!sections.some(([key]) => key === kind)) {
		sections.push([kind, undefined]);
	}
	return Object.fromEntries(
		sections.flatMap(([key, value]): Array<[string, unknown]> =>
			key !== kind ? [[key, value]] : next.length > 0 ? [[key, Object.fromEntries(next)]] : []
		),
	);
}
