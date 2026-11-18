import { isHiddenConfigPath } from './configRestrictions';

/**
 * Turns Harper's config JSON Schema (`harper-config/configRootSchema.json`) into the forms' sections and fields. A
 * setting gets a field only when its type has a plain control: a switch, a choice, a number, text, or a list of text.
 * Anything else (a value that is either a boolean or an object, a list of objects) stays in the JSON editor.
 */

export type ConfigFieldKind = 'boolean' | 'enum' | 'integer' | 'number' | 'string' | 'stringOrNumber' | 'stringList';

export interface ConfigFieldDef {
	path: readonly string[];
	id: string;
	label: string;
	description?: string;
	harperDefault?: string;
	kind: ConfigFieldKind;
	nullable: boolean;
	enumValues?: readonly string[];
	minimum?: number;
	maximum?: number;
}

export interface ConfigGroupDef {
	path: readonly string[];
	label?: string;
	description?: string;
	fields: ConfigFieldDef[];
}

export interface ConfigSectionDef {
	key: string;
	label: string;
	description?: string;
	groups: ConfigGroupDef[];
}

interface SchemaNode {
	type?: string | string[];
	enum?: unknown[];
	const?: unknown;
	description?: string;
	default?: unknown;
	minimum?: number;
	maximum?: number;
	properties?: Record<string, SchemaNode>;
	items?: SchemaNode;
	oneOf?: SchemaNode[];
	anyOf?: SchemaNode[];
	allOf?: SchemaNode[];
	$ref?: string;
}

interface RootSchema extends SchemaNode {
	definitions?: Record<string, SchemaNode>;
}

const SECTION_LABELS: Record<string, string> = {
	http: 'HTTP',
	mqtt: 'MQTT',
	operationsApi: 'Operations API',
	localStudio: 'Local Studio',
};

/** The most often changed first; anything not named keeps the schema's order, after these. */
const SECTION_ORDER = ['logging', 'http', 'operationsApi', 'authentication', 'mqtt', 'analytics', 'agent', 'status'];

const WORDS: Record<string, string> = {
	api: 'API',
	ca: 'CA',
	cas: 'CAs',
	cors: 'CORS',
	cpu: 'CPU',
	http: 'HTTP',
	http2: 'HTTP/2',
	id: 'ID',
	ip: 'IP',
	ms: 'ms',
	mqtt: 'MQTT',
	mtls: 'mTLS',
	std: 'standard',
	tls: 'TLS',
	ttl: 'TTL',
	url: 'URL',
	urls: 'URLs',
	usd: 'USD',
	v8: 'V8',
};

export function humanizeConfigKey(key: string): string {
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]{2,})([A-Z][a-z]{2,})/g, '$1 $2')
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map(word => {
			const known = WORDS[word.toLowerCase()];
			if (known) { return known; }
			return /^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase();
		});
	if (words.length === 0) { return key; }
	const [first, ...rest] = words;
	return [first === first.toLowerCase() ? first[0].toUpperCase() + first.slice(1) : first, ...rest].join(' ');
}

/** Splits a closing `Default: X` sentence off a schema description, so the form can show the default on its own. */
export function splitHarperDefault(description: string | undefined): { description?: string; harperDefault?: string } {
	if (!description) { return {}; }
	const match = /^(.*?)\s*\bDefault: (.+)$/s.exec(description);
	// Only a closing sentence: one with more sentences after it says more than a value.
	if (!match || /\.\s/.test(match[2])) {
		return { description };
	}
	const harperDefault = match[2].replace(/\.$/, '').replace(/^'(.*)'$/, '$1').trim();
	return { description: match[1] || undefined, harperDefault };
}

/** Defaults Harper's schema states wrongly, with what Harper uses. */
const DEFAULT_CORRECTIONS: Record<string, string> = {
	// The schema says 1d; harper `static/defaultConfig.yaml` and `security/tokenAuthentication.ts` use 30d.
	'authentication.refreshTokenTimeout': '30d',
};

function describeSchemaDefault(value: unknown): string | undefined {
	if (value === undefined) { return undefined; }
	return typeof value === 'string' ? value : JSON.stringify(value);
}

class SchemaReader {
	constructor(private readonly root: RootSchema) {}

	resolve(node: SchemaNode | undefined): SchemaNode | undefined {
		if (!node) { return undefined; }
		let resolved = node;
		if (node.$ref) {
			const name = node.$ref.replace(/^#\/definitions\//, '');
			const { $ref: _ref, ...own } = node;
			resolved = { ...this.root.definitions?.[name], ...own };
		}
		if (resolved.allOf) {
			const { allOf, ...own } = resolved;
			const members = allOf.map(member => this.resolve(member) ?? {});
			resolved = {
				...Object.assign({}, ...members),
				...own,
				properties: Object.assign({}, ...members.map(member => member.properties), own.properties),
			};
		}
		return resolved;
	}

	/** The types a node takes, with `oneOf`/`anyOf` of plain types folded in; undefined when they can't be. */
	types(node: SchemaNode): string[] | undefined {
		const alternatives = node.oneOf ?? node.anyOf;
		if (alternatives) {
			const types = new Set<string>();
			for (const alternative of alternatives.map(member => this.resolve(member))) {
				if (!alternative || alternative.const !== undefined || alternative.enum || alternative.properties) {
					return undefined;
				}
				for (const type of this.types(alternative) ?? []) { types.add(type); }
			}
			return types.size > 0 ? [...types] : undefined;
		}
		if (node.type === undefined) {
			return node.properties ? ['object'] : undefined;
		}
		return Array.isArray(node.type) ? node.type : [node.type];
	}
}

function fieldKind(
	reader: SchemaReader,
	node: SchemaNode,
	types: string[],
): Pick<ConfigFieldDef, 'kind' | 'nullable' | 'enumValues'> | undefined {
	const nullable = types.includes('null');
	const rest = types.filter(type => type !== 'null').sort();
	const only = rest.length === 1 ? rest[0] : undefined;
	if (only === 'boolean') { return { kind: 'boolean', nullable }; }
	if (only === 'integer' || only === 'number') { return { kind: only, nullable }; }
	if (only === 'string') {
		const enumValues = node.enum?.filter((value): value is string => typeof value === 'string');
		return enumValues?.length ? { kind: 'enum', nullable, enumValues } : { kind: 'string', nullable };
	}
	if (rest.length === 2 && rest[1] === 'string' && (rest[0] === 'integer' || rest[0] === 'number')) {
		return { kind: 'stringOrNumber', nullable };
	}
	if (only === 'array') {
		const items = reader.resolve(node.items);
		const itemTypes = items && reader.types(items);
		return itemTypes?.length === 1 && itemTypes[0] === 'string' ? { kind: 'stringList', nullable } : undefined;
	}
	return undefined;
}

/**
 * Settings a form never offers: certificate and key paths and ports, where a wrong value takes the server down. (Ports
 * also because Harper's schema names `mqtt.port` and `mqtt.securePort`, where Harper reads `mqtt.network.port`.)
 */
function isFormExcluded(path: readonly string[]) {
	const key = path[path.length - 1];
	return path.includes('tls') || path[0] === 'databases' || key === 'port' || key === 'securePort';
}

export function buildConfigSections(schema: unknown): ConfigSectionDef[] {
	const root = schema as RootSchema;
	const reader = new SchemaReader(root);
	const sections: ConfigSectionDef[] = [];

	const collectGroups = (node: SchemaNode, path: readonly string[], groups: ConfigGroupDef[]) => {
		const fields: ConfigFieldDef[] = [];
		const children: [string, SchemaNode][] = [];
		for (const [key, raw] of Object.entries(node.properties ?? {})) {
			const childPath = [...path, key];
			if (isHiddenConfigPath(childPath) || isFormExcluded(childPath)) { continue; }
			const child = reader.resolve(raw);
			if (!child) { continue; }
			const types = reader.types(child);
			if (!types) { continue; }
			if (types.length === 1 && types[0] === 'object') {
				if (child.properties) { children.push([key, child]); }
				continue;
			}
			const kind = fieldKind(reader, child, types);
			if (!kind) { continue; }
			const { description, harperDefault } = splitHarperDefault(child.description);
			fields.push({
				path: childPath,
				id: `config-${childPath.join('-')}`,
				label: humanizeConfigKey(key),
				description,
				harperDefault: DEFAULT_CORRECTIONS[childPath.join('.')] ?? describeSchemaDefault(child.default)
					?? harperDefault,
				minimum: child.minimum,
				maximum: child.maximum,
				...kind,
			});
		}
		if (fields.length > 0) {
			groups.push({
				path,
				label: path.length > 1 ? path.slice(1).map(humanizeConfigKey).join(' › ') : undefined,
				description: path.length > 1 ? node.description : undefined,
				fields,
			});
		}
		for (const [key, child] of children) {
			collectGroups(child, [...path, key], groups);
		}
	};

	for (const [key, raw] of Object.entries(root.properties ?? {})) {
		if (isHiddenConfigPath([key]) || isFormExcluded([key])) { continue; }
		const node = reader.resolve(raw);
		if (!node?.properties) { continue; }
		const groups: ConfigGroupDef[] = [];
		collectGroups(node, [key], groups);
		if (groups.length > 0) {
			sections.push({
				key,
				label: SECTION_LABELS[key] ?? humanizeConfigKey(key),
				description: node.description,
				groups,
			});
		}
	}
	const rank = (key: string) => {
		const index = SECTION_ORDER.indexOf(key);
		return index === -1 ? SECTION_ORDER.length : index;
	};
	return sections.sort((a, b) => rank(a.key) - rank(b.key));
}
