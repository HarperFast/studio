/**
 * The subset of OpenAPI 3.0/3.1 that the API explorer reads. The spec is fetched untyped from
 * the instance's `GET /api/openapi/rest` (see `getOpenAPI.ts`), so every field here is optional
 * and the parsing/rendering code treats the document defensively — a Harper-generated spec omits
 * `summary`, `tags`, and `operationId` entirely, and other producers may include far more.
 */

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface JsonSchema {
	$ref?: string;
	type?: string | string[];
	format?: string;
	title?: string;
	description?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	enum?: unknown[];
	const?: unknown;
	default?: unknown;
	example?: unknown;
	examples?: unknown[];
	nullable?: boolean;
	additionalProperties?: boolean | JsonSchema;
	oneOf?: JsonSchema[];
	anyOf?: JsonSchema[];
	allOf?: JsonSchema[];
	minimum?: number;
	maximum?: number;
	deprecated?: boolean;
}

export interface MediaType {
	schema?: JsonSchema;
	example?: unknown;
	examples?: Record<string, { value?: unknown; summary?: string }>;
}

export interface Parameter {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	schema?: JsonSchema;
	example?: unknown;
}

export interface RequestBody {
	description?: string;
	required?: boolean;
	content?: Record<string, MediaType>;
}

export interface ResponseObject {
	description?: string;
	headers?: Record<string, unknown>;
	content?: Record<string, MediaType>;
}

export interface Operation {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	parameters?: Parameter[];
	requestBody?: RequestBody;
	responses?: Record<string, ResponseObject>;
	security?: SecurityRequirement[];
}

export type PathItem = Partial<Record<HttpMethod, Operation>> & {
	summary?: string;
	description?: string;
	parameters?: Parameter[];
};

export type SecurityRequirement = Record<string, string[]>;

export interface SecurityScheme {
	type?: string;
	scheme?: string;
	bearerFormat?: string;
	name?: string;
	in?: string;
	description?: string;
}

export interface OpenApiSpec {
	openapi?: string;
	info?: { title?: string; version?: string; description?: string };
	servers?: Array<{ url: string; description?: string }>;
	paths?: Record<string, PathItem>;
	components?: {
		schemas?: Record<string, JsonSchema>;
		securitySchemes?: Record<string, SecurityScheme>;
	};
	tags?: Array<{ name: string; description?: string }>;
	security?: SecurityRequirement[];
}

/** One HTTP operation flattened out of the spec's nested `paths` → method structure. */
export interface FlatOperation {
	/** `${method} ${path}`, unique per operation. */
	id: string;
	method: HttpMethod;
	path: string;
	operation: Operation;
	/** The operation's first tag, or `default` when it has none. */
	tag: string;
	/** Path-level parameters merged with the operation's own (operation wins on name+in). */
	parameters: Parameter[];
	/** Lowercased method/path/summary/description, precomputed so the filter doesn't rebuild it. */
	searchText: string;
}

export interface EndpointPathNode {
	path: string;
	operations: FlatOperation[];
}

export interface EndpointResourceNode {
	resource: string;
	operationCount: number;
	paths: EndpointPathNode[];
}
