import {
	EndpointResourceNode,
	FlatOperation,
	HTTP_METHODS,
	JsonSchema,
	OpenApiSpec,
	Operation,
	Parameter,
	PathItem,
} from '@/features/instance/apis/explorer/types';

const DEFAULT_TAG = 'default';

/** The resource a path belongs to — its first non-empty segment (`/game/{id}` → `game`). */
export function resourceOf(path: string): string {
	const segment = path.split('/').find(Boolean);
	return segment ?? '/';
}

/**
 * Whether an operation actually requires authentication. An OpenAPI security requirement is an array
 * of alternatives (OR): an empty object `{}` in it means "unauthenticated access is also allowed", and
 * an empty array `[]` at the operation level explicitly overrides a secured document root. So auth is
 * required only when every listed alternative is a non-empty requirement object. The spec is fetched
 * untyped, so a malformed entry (`null`, non-object) is treated as not requiring auth rather than
 * throwing.
 */
export function requiresAuth(operation: Operation, spec: OpenApiSpec | undefined): boolean {
	const security = operation.security ?? spec?.security;
	if (!Array.isArray(security) || security.length === 0) {
		return false;
	}
	return security.every(hasSecurityRequirement);
}

/** A single security alternative that actually demands a credential: a non-empty requirement object. */
function hasSecurityRequirement(requirement: unknown): boolean {
	if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
		return false;
	}
	for (const _ in requirement) {
		return true;
	}
	return false;
}

/** Flatten `spec.paths` into a flat, document-ordered list of operations. */
export function flattenOperations(spec: OpenApiSpec | undefined): FlatOperation[] {
	const paths = spec?.paths;
	if (!paths) {
		return [];
	}
	const operations: FlatOperation[] = [];
	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem) {
			continue;
		}
		for (const method of HTTP_METHODS) {
			const operation = (pathItem as PathItem)[method];
			if (!operation) {
				continue;
			}
			const parameters = mergeParameters(pathItem.parameters, operation.parameters);
			operations.push({
				id: `${method} ${path}`,
				method,
				path,
				operation,
				tag: operation.tags?.[0] ?? DEFAULT_TAG,
				parameters,
				// Precomputed once here so the sidebar filter doesn't rebuild it per operation per keystroke.
				searchText: `${method} ${path} ${operation.summary ?? ''} ${operation.description ?? ''} ${
					operation.operationId ?? ''
				}`
					.toLowerCase(),
			});
		}
	}
	return operations;
}

/**
 * Merge path-level parameters with operation-level ones. Per the OpenAPI spec, an operation
 * parameter overrides a path parameter that shares the same `name` + `in`. Parameters lacking a
 * `name`/`in` (e.g. an unresolved `$ref` parameter) are skipped — we can't render them, and they
 * would otherwise collide on one `undefined:undefined` key and drop each other.
 */
function mergeParameters(pathParams: Parameter[] = [], opParams: Parameter[] = []): Parameter[] {
	const byKey = new Map<string, Parameter>();
	for (const p of [...pathParams, ...opParams]) {
		if (p?.name && p?.in) {
			byKey.set(`${p.in}:${p.name}`, p);
		}
	}
	return [...byKey.values()];
}

/**
 * Build the sidebar's hierarchy from flattened operations: group by resource (first path segment),
 * then by path, keeping methods under their path. First-seen document order is preserved at every
 * level, so the tree reads in the same order as the spec.
 */
export function buildEndpointTree(operations: FlatOperation[]): EndpointResourceNode[] {
	// resource → (path → operations), all insertion-ordered Maps so document order is preserved.
	const resources = new Map<string, Map<string, FlatOperation[]>>();
	for (const op of operations) {
		const resource = resourceOf(op.path);
		let paths = resources.get(resource);
		if (!paths) {
			paths = new Map();
			resources.set(resource, paths);
		}
		let ops = paths.get(op.path);
		if (!ops) {
			ops = [];
			paths.set(op.path, ops);
		}
		ops.push(op);
	}
	return [...resources.entries()].map(([resource, paths]) => {
		const pathNodes = [...paths.entries()].map(([path, ops]) => ({ path, operations: ops }));
		return {
			resource,
			operationCount: pathNodes.reduce((count, node) => count + node.operations.length, 0),
			paths: pathNodes,
		};
	});
}

/** Case-insensitive substring match of a query against an operation's precomputed `searchText`. */
export function operationMatchesFilter(op: FlatOperation, filter: string): boolean {
	const needle = filter.trim().toLowerCase();
	return needle ? op.searchText.includes(needle) : true;
}

/** A server the try-it-out runner can target, shown in the explorer's server selector. */
export interface ServerOption {
	url: string;
	label: string;
}

/**
 * Build the list of servers the explorer offers, combining Studio's computed REST URL (`baseURL`)
 * with the servers the spec itself declares, de-duplicated by URL (ignoring a trailing slash).
 *
 * Studio's computed URL comes first so it stays the default (it is the proxy-aware URL for
 * cloud/cluster instances), but the spec's declared server is always available too — which is what
 * makes try-it-out work against instances whose REST API isn't on the port Studio guesses (e.g. a
 * local instance serving REST on `:9926`).
 */
export function buildServerOptions(spec: OpenApiSpec | undefined, baseURL: string | null): ServerOption[] {
	const options: ServerOption[] = [];
	const seen = new Set<string>();
	const add = (url: string | undefined, label: string) => {
		if (!url) {
			return;
		}
		const key = url.replace(/\/+$/, '');
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		options.push({ url, label });
	};
	add(baseURL ?? undefined, 'Studio');
	for (const server of spec?.servers ?? []) {
		add(server?.url, server?.description || 'Declared in spec');
	}
	return options;
}

const REF_PREFIX = '#/components/schemas/';

/**
 * Resolve a local component `$ref` (`#/components/schemas/Name`) against the spec. Returns
 * `undefined` for external or unrecognized refs — the renderer shows the raw ref name in that case
 * rather than following it.
 */
export function resolveRef(spec: OpenApiSpec | undefined, ref: string | undefined): JsonSchema | undefined {
	if (!spec || !ref || !ref.startsWith(REF_PREFIX)) {
		return undefined;
	}
	const name = ref.slice(REF_PREFIX.length);
	const schemas = spec.components?.schemas;
	// hasOwn so a ref name like `toString` can't resolve to an inherited prototype method.
	return schemas && Object.hasOwn(schemas, name) ? schemas[name] : undefined;
}

/** The short display name for a `$ref` (`#/components/schemas/Player` → `Player`). */
export function refName(ref: string): string {
	const slash = ref.lastIndexOf('/');
	return slash === -1 ? ref : ref.slice(slash + 1);
}

/** Follow a top-level `$ref` once so callers can read a schema's shape. Non-refs pass through. */
export function derefSchema(spec: OpenApiSpec | undefined, schema: JsonSchema | undefined): JsonSchema | undefined {
	if (schema?.$ref) {
		return resolveRef(spec, schema.$ref) ?? schema;
	}
	return schema;
}

/** The first `application/json`-ish media type's schema from a content map, or the first entry. */
export function jsonSchemaFromContent(
	content: Record<string, { schema?: JsonSchema }> | undefined,
): JsonSchema | undefined {
	if (!content) {
		return undefined;
	}
	const jsonKey = Object.keys(content).find(k => k.includes('json'));
	const key = jsonKey ?? Object.keys(content)[0];
	return key ? content[key]?.schema : undefined;
}

/** Depth and total-node bounds for example generation. */
export const MAX_EXAMPLE_DEPTH = 8;
export const MAX_EXAMPLE_NODES = 1000;

/**
 * Generate a representative example value for a schema, resolving `$ref`s and honoring explicit
 * `example`/`default`/`enum`/`const` when present. `seen` is the set of ancestor schema nodes on the
 * current path; a node already on the path is a real cycle and stops. Children receive a fresh copy,
 * so two sibling properties that reference the same schema each expand fully.
 *
 * `depth` and a shared `budget` bound the output: cycle detection alone doesn't stop *acyclic*
 * fan-out (a schema whose every level references the next level twice expands to ~2^N nodes), and
 * this runs synchronously during render — so past either bound we return a `null` placeholder rather
 * than freeze the tab on a relationship-heavy spec.
 */
export function generateExample(
	spec: OpenApiSpec | undefined,
	schema: JsonSchema | undefined,
	seen: Set<JsonSchema> = new Set(),
	depth: number = 0,
	budget: { remaining: number } = { remaining: MAX_EXAMPLE_NODES },
): unknown {
	if (!schema || depth > MAX_EXAMPLE_DEPTH || budget.remaining <= 0) {
		return null;
	}
	const node = schema.$ref ? resolveRef(spec, schema.$ref) : schema;
	if (!node || seen.has(node)) {
		return {};
	}
	budget.remaining--;

	if (node.example !== undefined) {
		return node.example;
	}
	if (node.default !== undefined) {
		return node.default;
	}
	if (node.const !== undefined) {
		return node.const;
	}
	if (Array.isArray(node.enum) && node.enum.length > 0) {
		return node.enum[0];
	}

	const childSeen = new Set(seen).add(node);
	const composite = node.allOf ?? node.oneOf ?? node.anyOf;
	if (composite?.length) {
		if (node.allOf) {
			return node.allOf.reduce<Record<string, unknown>>((acc, sub) => {
				const value = generateExample(spec, sub, childSeen, depth + 1, budget);
				return value && typeof value === 'object' && !Array.isArray(value)
					? { ...acc, ...(value as Record<string, unknown>) }
					: acc;
			}, {});
		}
		return generateExample(spec, composite[0], childSeen, depth + 1, budget);
	}

	const type = Array.isArray(node.type) ? node.type.find(t => t !== 'null') : node.type;
	switch (type) {
		case 'object':
			return exampleObject(spec, node, childSeen, depth + 1, budget);
		case 'array':
			return [generateExample(spec, node.items, childSeen, depth + 1, budget)];
		case 'string':
			return exampleString(node);
		case 'integer':
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'null':
			return null;
		default:
			return node.properties ? exampleObject(spec, node, childSeen, depth + 1, budget) : null;
	}
}

function exampleObject(
	spec: OpenApiSpec | undefined,
	schema: JsonSchema,
	childSeen: Set<JsonSchema>,
	depth: number,
	budget: { remaining: number },
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema.properties ?? {})) {
		if (budget.remaining <= 0) {
			break;
		}
		result[key] = generateExample(spec, value, childSeen, depth, budget);
	}
	return result;
}

function exampleString(schema: JsonSchema): string {
	// Harper uses `format` to carry its attribute type (ID, Date, ...). Give date-ish formats a
	// realistic value; everything else gets an empty string the user can fill in.
	switch (schema.format) {
		case 'date-time':
		case 'Date':
			return new Date().toISOString();
		case 'date':
			return new Date().toISOString().slice(0, 10);
		case 'uuid':
			return '00000000-0000-0000-0000-000000000000';
		default:
			return '';
	}
}

/** A short one-line label for a schema's type, e.g. `string`, `Player[]`, `object`. */
export function schemaTypeLabel(schema: JsonSchema | undefined): string {
	if (!schema) {
		return 'any';
	}
	if (schema.$ref) {
		return refName(schema.$ref);
	}
	if (schema.allOf || schema.oneOf || schema.anyOf) {
		const list = schema.allOf ?? schema.oneOf ?? schema.anyOf ?? [];
		const joiner = schema.allOf ? ' & ' : ' | ';
		return list.map(s => schemaTypeLabel(s)).join(joiner) || 'object';
	}
	const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
	if (type === 'array') {
		return `${schemaTypeLabel(schema.items)}[]`;
	}
	if (schema.format && type) {
		return `${type} <${schema.format}>`;
	}
	return type ?? (schema.properties ? 'object' : 'any');
}

/** Substitute values into `{param}` placeholders and return the path plus any still-unfilled names. */
export function fillPathTemplate(
	path: string,
	values: Record<string, string>,
): { path: string; missing: string[] } {
	const missing: string[] = [];
	const filled = path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
		const value = values[name];
		// Only a real string value fills the slot — a name like `toString` must not pick up a
		// prototype method.
		if (typeof value !== 'string' || value === '') {
			missing.push(name);
			return `{${name}}`;
		}
		return encodeURIComponent(value);
	});
	return { path: filled, missing };
}

/**
 * The path parameters to render inputs for, derived from the `{...}` segments in the path itself so
 * every placeholder is fillable — using the declared parameter's metadata when present, and a plain
 * required string otherwise. A `{var}` missing from the spec's `parameters` would otherwise render no
 * input while keeping Send disabled forever.
 */
export function pathParametersFor(op: FlatOperation): Parameter[] {
	const declared = new Map(op.parameters.filter(p => p.in === 'path').map(p => [p.name, p]));
	const names = [...op.path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
	return names.map(name => declared.get(name) ?? { name, in: 'path', required: true, schema: { type: 'string' } });
}
