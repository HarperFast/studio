/**
 * Harper-specific GraphQL schema metadata used to make the Applications editor
 * Harper-aware (hover docs + completion).
 *
 * Source of truth: node_modules/harper/schema.graphql. This file is a curated,
 * hand-maintained mirror of the custom directives and scalars defined there.
 * When the bundled `harper` package updates that schema, reconcile this file.
 */

export type HarperDirectiveLocation = 'OBJECT' | 'FIELD_DEFINITION';

export interface HarperDirectiveArg {
	name: string;
	/** GraphQL type of the argument, e.g. `String`, `Int`, `Boolean`. */
	type: string;
	description: string;
}

export interface HarperDirective {
	/** Directive name without the leading `@`. */
	name: string;
	locations: HarperDirectiveLocation[];
	description: string;
	args: HarperDirectiveArg[];
}

export interface HarperScalar {
	name: string;
	description: string;
	/** True for Harper extensions beyond the GraphQL built-in scalars. */
	harperSpecific: boolean;
}

export const harperDirectives: HarperDirective[] = [
	{
		name: 'table',
		locations: ['OBJECT'],
		description: 'Attach to an object type to persist it as a table.',
		args: [
			{
				name: 'table',
				type: 'String',
				description: 'Explicit table name. If omitted, a sensible default derived from the type name is used.',
			},
			{ name: 'database', type: 'String', description: 'Logical database/namespace to place this table in.' },
			{
				name: 'expiration',
				type: 'Int',
				description:
					'Default time-to-live (TTL) for records in seconds. Use a positive value to enable automatic expiration; omit or set to 0 to disable.',
			},
			{ name: 'audit', type: 'Boolean', description: 'Enable auditing for create/update/delete operations.' },
			{
				name: 'eviction',
				type: 'Int',
				description: 'The amount of time after expiration before a record can be evicted (defaults to zero).',
			},
			{
				name: 'scanInterval',
				type: 'Int',
				description:
					'The interval for scanning for expired records (defaults to one quarter of the total of expiration and eviction).',
			},
			{
				name: 'replicate',
				type: 'Boolean',
				description:
					'Configure replication for this individual table. Set to false to disable and exclude this table from a replicated database.',
			},
			{
				name: 'randomAccessFields',
				type: 'Boolean',
				description:
					"Encode records as typed random-access structures for fast field access and smaller records. Best for stable, homogeneous field types; pins this table's encoding, overriding the global storage.randomAccessFields config.",
			},
		],
	},
	{
		name: 'export',
		locations: ['OBJECT'],
		description:
			'Expose the table via the REST API. When applied to a @table type, routes are generated using the type name or the provided alias.',
		args: [
			{
				name: 'name',
				type: 'String',
				description: 'Optional alias to use for REST endpoints. If omitted, the type/table name is used.',
			},
			{
				name: 'rest',
				type: 'Boolean',
				description: 'REST support is on by default for any exported resource. Specify false to disable it.',
			},
			{
				name: 'mqtt',
				type: 'Boolean',
				description: 'MQTT support is on by default for any exported resource. Specify false to disable it.',
			},
		],
	},
	{
		name: 'sealed',
		locations: ['OBJECT'],
		description:
			'Restrict records to only the defined properties. By default Harper supports heterogeneous records, so you can freely add properties; add @sealed to forbid undefined properties.',
		args: [],
	},
	{
		name: 'primaryKey',
		locations: ['FIELD_DEFINITION'],
		description:
			'Marks the primary key field for the table. The value must be unique per record and is used for lookups, updates, and relationships.',
		args: [],
	},
	{
		name: 'enumerable',
		locations: ['FIELD_DEFINITION'],
		description:
			'Allows enumeration over a computed field, causing it to be included in serialized responses. (Non-computed fields are always enumerable.)',
		args: [],
	},
	{
		name: 'expiresAt',
		locations: ['FIELD_DEFINITION'],
		description: 'Flags the field as containing the expiration time of the entry.',
		args: [],
	},
	{
		name: 'allow',
		locations: ['FIELD_DEFINITION'],
		description: 'Permit access to the field based on the named roles, only.',
		args: [{ name: 'role', type: 'String', description: 'Role permitted to access the field.' }],
	},
	{
		name: 'indexed',
		locations: ['FIELD_DEFINITION'],
		description: 'Create an index for the annotated field. Supports traditional and vector/ANN index types.',
		args: [
			{ name: 'type', type: 'String', description: 'Optional index type, e.g. "HNSW".' },
			{
				name: 'distance',
				type: 'String',
				description:
					'Distance metric for vector indexes (e.g., "euclidean", "cosine"). Ignored for non-vector index types.',
			},
			{
				name: 'efConstruction',
				type: 'Int',
				description:
					'Construction effort/recall parameter (HNSW). Higher values improve recall at the cost of build time and memory.',
			},
			{
				name: 'M',
				type: 'Int',
				description: 'Maximum number of bi-directional connections per node (HNSW). Typical range: 4–64.',
			},
			{
				name: 'optimizeRouting',
				type: 'Int',
				description: 'Routing optimization level for search graphs (implementation-specific).',
			},
			{ name: 'mL', type: 'Int', description: 'Additional multiplier for graph links (implementation-specific).' },
			{
				name: 'efConstructionSearch',
				type: 'Int',
				description:
					'Search-time effort/recall parameter used during construction (implementation-specific). Larger values typically yield better accuracy.',
			},
		],
	},
	{
		name: 'computed',
		locations: ['FIELD_DEFINITION'],
		description:
			'Define a derived field whose value is computed from other fields. Useful for denormalized or presentation-friendly data.',
		args: [
			{
				name: 'from',
				type: 'String',
				description:
					'Computation expression or reference describing how to derive this field from other fields (engine-specific syntax).',
			},
			{
				name: 'version',
				type: 'Int',
				description: 'Increment when the computation changes to trigger recomputation.',
			},
		],
	},
	{
		name: 'createdTime',
		locations: ['FIELD_DEFINITION'],
		description:
			"Automatically sets this field to the record's creation timestamp. The server assigns the value on insert.",
		args: [],
	},
	{
		name: 'updatedTime',
		locations: ['FIELD_DEFINITION'],
		description: 'Automatically updates this field to the current timestamp whenever the record is updated.',
		args: [],
	},
	{
		name: 'relationship',
		locations: ['FIELD_DEFINITION'],
		description:
			'Declares a relationship to another record or records. Use on fields that should resolve to related entities by ID.',
		args: [
			{
				name: 'from',
				type: 'String',
				description: 'Name of field in THIS table containing foreign key(s) (for one-to-many or many-to-many).',
			},
			{
				name: 'to',
				type: 'String',
				description: 'Name of field in OTHER table containing foreign key (for one-to-one or many-to-one).',
			},
		],
	},
];

export const harperScalars: HarperScalar[] = [
	{
		name: 'Any',
		harperSpecific: true,
		description:
			'A flexible JSON-like value. Accepts objects, arrays, strings, numbers, booleans, or null. Useful for schemaless or mixed content.',
	},
	{
		name: 'BigInt',
		harperSpecific: true,
		description:
			'Arbitrary-precision integer for values larger than 32-bit/64-bit ranges. Use `Long` for 64-bit integers when possible.',
	},
	{
		name: 'Blob',
		harperSpecific: true,
		description:
			'Binary large object. Represents binary data such as images or files. Typically encoded as Base64 in JSON.',
	},
	{
		name: 'Bytes',
		harperSpecific: true,
		description:
			'Raw bytes. Typically encoded/transported as Base64 in JSON. Use when you need deterministic binary data that is not a large file.',
	},
	{
		name: 'Date',
		harperSpecific: true,
		description:
			'Date/time scalar. Recommended format: RFC 3339/ISO-8601 (e.g., "2025-12-02T19:44:00Z"). Represents an absolute timestamp.',
	},
	{
		name: 'Long',
		harperSpecific: true,
		description:
			'64-bit signed integer. Some clients may serialize values as strings to preserve precision across environments.',
	},
	{ name: 'Boolean', harperSpecific: false, description: 'true or false' },
	{ name: 'Float', harperSpecific: false, description: 'A signed double-precision floating-point value.' },
	{
		name: 'ID',
		harperSpecific: false,
		description:
			'A unique identifier, serialized as a String, often used to refetch an object or as a cache key. Not intended to be human-readable.',
	},
	{ name: 'Int', harperSpecific: false, description: 'A signed 32-bit integer.' },
	{ name: 'String', harperSpecific: false, description: 'A UTF-8 character sequence.' },
];

export function findDirective(name: string): HarperDirective | undefined {
	return harperDirectives.find(directive => directive.name === name);
}

export function findScalar(name: string): HarperScalar | undefined {
	return harperScalars.find(scalar => scalar.name === name);
}
