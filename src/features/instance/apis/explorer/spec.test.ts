import {
	buildEndpointTree,
	buildServerOptions,
	derefSchema,
	fillPathTemplate,
	flattenOperations,
	generateExample,
	jsonSchemaFromContent,
	MAX_EXAMPLE_NODES,
	operationMatchesFilter,
	pathParametersFor,
	refName,
	resolveRef,
	resourceOf,
	schemaTypeLabel,
} from '@/features/instance/apis/explorer/spec';
import { JsonSchema, OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { describe, expect, it } from 'vitest';

const spec: OpenApiSpec = {
	openapi: '3.0.3',
	info: { title: 'Test API', version: '1.0.0' },
	servers: [{ url: 'http://localhost:9926/', description: 'REST API' }],
	paths: {
		'/leaderboard/': {
			// Path-level parameter — must merge onto the GET operation which declares none of its own.
			parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
			get: {
				description: 'list scores',
				tags: ['board'],
				responses: {
					'200': {
						description: 'ok',
						content: {
							'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Score' } } },
						},
					},
				},
			},
		},
		'/game/{id}': {
			get: {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				responses: {},
			},
			post: {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Score' } } } },
				responses: {},
			},
		},
	},
	components: {
		schemas: {
			Score: {
				type: 'object',
				properties: {
					id: { type: 'string', format: 'ID' },
					name: { type: 'string' },
					packs: { type: 'integer' },
					active: { type: 'boolean' },
					createdAt: { type: 'string', format: 'Date' },
				},
				required: ['name'],
			},
			// A self-referential model, to prove example generation and rendering can't loop.
			Node: {
				type: 'object',
				properties: { label: { type: 'string' }, self: { $ref: '#/components/schemas/Node' } },
			},
			Address: {
				type: 'object',
				properties: { street: { type: 'string' }, city: { type: 'string' } },
			},
			// Two sibling properties that reference the same schema — the cycle-detection regression case.
			Shipment: {
				type: 'object',
				properties: {
					shippingAddress: { $ref: '#/components/schemas/Address' },
					billingAddress: { $ref: '#/components/schemas/Address' },
				},
			},
		},
		securitySchemes: {
			basicAuth: { type: 'http', scheme: 'basic' },
			bearerAuth: { type: 'http', scheme: 'bearer' },
		},
	},
	tags: [{ name: 'board', description: 'Leaderboard operations' }],
};

describe('flattenOperations', () => {
	it('flattens paths × methods into document order with stable ids', () => {
		const ops = flattenOperations(spec);
		expect(ops.map(o => o.id)).toEqual(['get /leaderboard/', 'get /game/{id}', 'post /game/{id}']);
		expect(ops.map(o => o.method)).toEqual(['get', 'get', 'post']);
	});

	it('precomputes a lowercased searchText covering method, path, and description', () => {
		const ops = flattenOperations(spec);
		const leaderboardGet = ops.find(o => o.id === 'get /leaderboard/')!;
		expect(leaderboardGet.searchText).toContain('get /leaderboard/');
		expect(leaderboardGet.searchText).toContain('list scores');
		expect(leaderboardGet.searchText).toBe(leaderboardGet.searchText.toLowerCase());
	});

	it('groups by the operation\'s first tag, defaulting to "default"', () => {
		const ops = flattenOperations(spec);
		expect(ops.find(o => o.id === 'get /leaderboard/')?.tag).toBe('board');
		expect(ops.find(o => o.id === 'get /game/{id}')?.tag).toBe('default');
	});

	it('merges path-level parameters onto operations that lack their own', () => {
		const ops = flattenOperations(spec);
		const leaderboardGet = ops.find(o => o.id === 'get /leaderboard/');
		expect(leaderboardGet?.parameters).toEqual([{ name: 'limit', in: 'query', schema: { type: 'integer' } }]);
	});

	it('lets an operation parameter override a path parameter of the same name and location', () => {
		const overriding: OpenApiSpec = {
			paths: {
				'/x/{id}': {
					parameters: [{ name: 'id', in: 'path', required: true, description: 'path-level' }],
					get: { parameters: [{ name: 'id', in: 'path', required: true, description: 'op-level' }], responses: {} },
				},
			},
		};
		const [op] = flattenOperations(overriding);
		expect(op.parameters).toHaveLength(1);
		expect(op.parameters[0].description).toBe('op-level');
	});

	it('returns an empty list when there are no paths', () => {
		expect(flattenOperations(undefined)).toEqual([]);
		expect(flattenOperations({})).toEqual([]);
	});

	it('skips parameters lacking a name/in (e.g. an unresolved $ref) instead of colliding them', () => {
		const [op] = flattenOperations({
			paths: {
				'/x': {
					get: {
						parameters: [
							{ $ref: '#/components/parameters/Limit' } as never,
							{ $ref: '#/components/parameters/Offset' } as never,
							{ name: 'q', in: 'query', schema: { type: 'string' } },
						],
						responses: {},
					},
				},
			},
		});
		expect(op.parameters).toEqual([{ name: 'q', in: 'query', schema: { type: 'string' } }]);
	});
});

describe('resourceOf', () => {
	it('returns the first non-empty path segment', () => {
		expect(resourceOf('/leaderboard/')).toBe('leaderboard');
		expect(resourceOf('/game/{id}')).toBe('game');
		expect(resourceOf('/')).toBe('/');
	});
});

describe('buildEndpointTree', () => {
	it('nests resource → path → methods in document order', () => {
		const tree = buildEndpointTree(flattenOperations(spec));
		expect(tree.map(r => r.resource)).toEqual(['leaderboard', 'game']);

		const leaderboard = tree[0];
		expect(leaderboard.operationCount).toBe(1);
		expect(leaderboard.paths.map(p => p.path)).toEqual(['/leaderboard/']);
		expect(leaderboard.paths[0].operations.map(o => o.method)).toEqual(['get']);

		const game = tree[1];
		expect(game.operationCount).toBe(2);
		expect(game.paths.map(p => p.path)).toEqual(['/game/{id}']);
		expect(game.paths[0].operations.map(o => o.method)).toEqual(['get', 'post']);
	});

	it('groups multiple paths of the same resource together', () => {
		const multi = flattenOperations({
			paths: {
				'/t/': { get: { responses: {} } },
				'/t/{id}': { get: { responses: {} }, delete: { responses: {} } },
			},
		});
		const tree = buildEndpointTree(multi);
		expect(tree).toHaveLength(1);
		expect(tree[0].resource).toBe('t');
		expect(tree[0].operationCount).toBe(3);
		expect(tree[0].paths.map(p => p.path)).toEqual(['/t/', '/t/{id}']);
	});
});

describe('operationMatchesFilter', () => {
	const ops = flattenOperations(spec);
	const gameGet = ops.find(o => o.id === 'get /game/{id}')!;
	const leaderboardGet = ops.find(o => o.id === 'get /leaderboard/')!;

	it('matches on path, case-insensitively', () => {
		expect(operationMatchesFilter(gameGet, 'GAME')).toBe(true);
		expect(operationMatchesFilter(gameGet, 'leaderboard')).toBe(false);
	});

	it('matches on method and description', () => {
		expect(operationMatchesFilter(leaderboardGet, 'get')).toBe(true);
		expect(operationMatchesFilter(leaderboardGet, 'scores')).toBe(true);
	});

	it('treats an empty filter as matching everything', () => {
		expect(operationMatchesFilter(gameGet, '')).toBe(true);
		expect(operationMatchesFilter(gameGet, '   ')).toBe(true);
	});
});

describe('resolveRef / refName / derefSchema', () => {
	it('resolves local component refs and ignores external ones', () => {
		expect(resolveRef(spec, '#/components/schemas/Score')?.properties?.name).toEqual({ type: 'string' });
		expect(resolveRef(spec, '#/components/schemas/Missing')).toBeUndefined();
		expect(resolveRef(spec, 'https://example.com/schema')).toBeUndefined();
	});

	it('extracts the short name from a ref', () => {
		expect(refName('#/components/schemas/Player')).toBe('Player');
		expect(refName('Player')).toBe('Player');
	});

	it('follows a top-level ref once and passes non-refs through', () => {
		expect(derefSchema(spec, { $ref: '#/components/schemas/Score' })?.type).toBe('object');
		expect(derefSchema(spec, { type: 'string' })).toEqual({ type: 'string' });
	});
});

describe('jsonSchemaFromContent', () => {
	it('prefers an application/json media type', () => {
		const schema = jsonSchemaFromContent({
			'text/plain': { schema: { type: 'string' } },
			'application/json': { schema: { type: 'object' } },
		});
		expect(schema).toEqual({ type: 'object' });
	});

	it('falls back to the first entry when there is no json type', () => {
		expect(jsonSchemaFromContent({ 'text/csv': { schema: { type: 'string' } } })).toEqual({ type: 'string' });
		expect(jsonSchemaFromContent(undefined)).toBeUndefined();
	});
});

describe('generateExample', () => {
	it('builds an object with a default value per property type/format', () => {
		const example = generateExample(spec, { $ref: '#/components/schemas/Score' }) as Record<string, unknown>;
		expect(example.id).toBe('');
		expect(example.name).toBe('');
		expect(example.packs).toBe(0);
		expect(example.active).toBe(false);
		expect(example.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // Date format → ISO string
	});

	it('wraps array items', () => {
		const example = generateExample(spec, { type: 'array', items: { $ref: '#/components/schemas/Score' } });
		expect(Array.isArray(example)).toBe(true);
		expect((example as unknown[]).length).toBe(1);
	});

	it('honors explicit example, default, const, and enum in precedence order', () => {
		expect(generateExample(spec, { type: 'string', example: 'ex' })).toBe('ex');
		expect(generateExample(spec, { type: 'string', default: 'def' })).toBe('def');
		expect(generateExample(spec, { const: 42 })).toBe(42);
		expect(generateExample(spec, { type: 'string', enum: ['a', 'b'] })).toBe('a');
	});

	it('does not loop on a self-referential schema', () => {
		expect(() => generateExample(spec, { $ref: '#/components/schemas/Node' })).not.toThrow();
		const example = generateExample(spec, { $ref: '#/components/schemas/Node' }) as Record<string, unknown>;
		expect(example.label).toBe('');
		expect(example.self).toEqual({}); // cycle stops with an empty object
	});

	it('expands two sibling properties that reference the same schema (not just the first)', () => {
		const example = generateExample(spec, { $ref: '#/components/schemas/Shipment' }) as Record<string, unknown>;
		// The bug this guards: a shared `seen` set truncated every sibling after the first to `{}`.
		expect(example.shippingAddress).toEqual({ street: '', city: '' });
		expect(example.billingAddress).toEqual({ street: '', city: '' });
	});

	it('bounds acyclic branching expansion (no 2^N blow-up)', () => {
		// 24 distinct levels, each referencing the next twice — 2^24 nodes without a budget. This is
		// acyclic, so cycle detection alone would not stop it.
		const schemas: Record<string, JsonSchema> = {};
		const levels = 24;
		for (let i = 0; i < levels; i++) {
			schemas[`L${i}`] = i === levels - 1
				? { type: 'object', properties: { leaf: { type: 'string' } } }
				: {
					type: 'object',
					properties: {
						a: { $ref: `#/components/schemas/L${i + 1}` },
						b: { $ref: `#/components/schemas/L${i + 1}` },
					},
				};
		}
		const branchingSpec: OpenApiSpec = { components: { schemas } };
		const example = generateExample(branchingSpec, { $ref: '#/components/schemas/L0' });
		const countNodes = (v: unknown): number =>
			v && typeof v === 'object'
				? 1 + Object.values(v as Record<string, unknown>).reduce<number>((sum, child) => sum + countNodes(child), 0)
				: 0;
		expect(countNodes(example)).toBeLessThanOrEqual(MAX_EXAMPLE_NODES + 50);
	});
});

describe('pathParametersFor', () => {
	it('derives an input per path placeholder, using declared metadata when present', () => {
		const [gameGet] = flattenOperations({
			paths: {
				'/game/{id}': {
					get: { parameters: [{ name: 'id', in: 'path', required: true, description: 'the game id' }], responses: {} },
				},
			},
		});
		const params = pathParametersFor(gameGet);
		expect(params).toHaveLength(1);
		expect(params[0].description).toBe('the game id');
	});

	it('synthesizes a required string input for a placeholder missing from the spec parameters', () => {
		const [op] = flattenOperations({ paths: { '/records/{recordId}': { get: { responses: {} } } } });
		const params = pathParametersFor(op);
		expect(params).toEqual([{ name: 'recordId', in: 'path', required: true, schema: { type: 'string' } }]);
	});
});

describe('schemaTypeLabel', () => {
	it('labels refs, arrays, formatted primitives, objects, and unions', () => {
		expect(schemaTypeLabel({ $ref: '#/components/schemas/Score' })).toBe('Score');
		expect(schemaTypeLabel({ type: 'array', items: { $ref: '#/components/schemas/Score' } })).toBe('Score[]');
		expect(schemaTypeLabel({ type: 'string', format: 'ID' })).toBe('string <ID>');
		expect(schemaTypeLabel({ type: 'object' })).toBe('object');
		expect(schemaTypeLabel({ oneOf: [{ type: 'string' }, { type: 'integer' }] })).toBe('string | integer');
		expect(schemaTypeLabel(undefined)).toBe('any');
	});
});

describe('fillPathTemplate', () => {
	it('substitutes provided values and URL-encodes them', () => {
		expect(fillPathTemplate('/game/{id}', { id: 'a b' })).toEqual({ path: '/game/a%20b', missing: [] });
	});

	it('reports blank and missing placeholders and leaves them in place', () => {
		expect(fillPathTemplate('/game/{id}', {})).toEqual({ path: '/game/{id}', missing: ['id'] });
		expect(fillPathTemplate('/a/{x}/b/{y}', { x: '1' })).toEqual({ path: '/a/1/b/{y}', missing: ['y'] });
	});
});

describe('buildServerOptions', () => {
	it('lists the Studio URL first, then spec servers, de-duplicated by URL', () => {
		expect(buildServerOptions(spec, 'http://localhost')).toEqual([
			{ url: 'http://localhost', label: 'Studio' },
			{ url: 'http://localhost:9926/', label: 'REST API' },
		]);
	});

	it('de-duplicates when the computed URL equals a spec server (ignoring a trailing slash)', () => {
		const options = buildServerOptions(spec, 'http://localhost:9926');
		expect(options).toEqual([{ url: 'http://localhost:9926', label: 'Studio' }]);
	});

	it('falls back to spec servers when there is no computed URL', () => {
		expect(buildServerOptions(spec, null)).toEqual([{ url: 'http://localhost:9926/', label: 'REST API' }]);
	});
});
