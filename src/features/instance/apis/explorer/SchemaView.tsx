import { refName, resolveRef, schemaTypeLabel } from '@/features/instance/apis/explorer/spec';
import { JsonSchema, OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { cn } from '@/lib/cn';

const MAX_DEPTH = 6;

/**
 * Render an OpenAPI/JSON schema as a readable model tree: each property on its own row with a name,
 * a type label, a required marker, and a description. `$ref`s are resolved against the spec;
 * recursion is bounded by `MAX_DEPTH` and a `seen` set of resolved schemas so cyclic models
 * (a table that references itself) can't loop.
 */
export function SchemaView({
	spec,
	schema,
	className,
}: {
	spec: OpenApiSpec | undefined;
	schema: JsonSchema | undefined;
	className?: string;
}) {
	if (!schema) {
		return <p className={cn('text-muted-foreground text-sm', className)}>No schema provided.</p>;
	}
	return (
		<div className={cn('text-sm', className)}>
			<SchemaNode spec={spec} schema={schema} depth={0} seen={new Set()} />
		</div>
	);
}

function SchemaNode({
	spec,
	schema,
	depth,
	seen,
	required,
}: {
	spec: OpenApiSpec | undefined;
	schema: JsonSchema;
	depth: number;
	seen: Set<JsonSchema>;
	required?: boolean;
}) {
	// Follow a top-level $ref so we can show its properties, tracking the resolved node to stop cycles.
	let resolved = schema;
	if (schema.$ref) {
		const target = resolveRef(spec, schema.$ref);
		if (!target) {
			return <ScalarLine label={refName(schema.$ref)} note="(unresolved reference)" />;
		}
		if (seen.has(target) || depth >= MAX_DEPTH) {
			return <ScalarLine label={schemaTypeLabel(schema)} note="(nested)" />;
		}
		resolved = target;
	}

	const type = Array.isArray(resolved.type) ? resolved.type.find(t => t !== 'null') : resolved.type;

	if (type === 'object' || resolved.properties) {
		const properties = Object.entries(resolved.properties ?? {});
		const requiredSet = new Set(resolved.required ?? []);
		if (properties.length === 0) {
			return (
				<p className="text-muted-foreground">
					{schemaTypeLabel(schema)}
					{resolved.additionalProperties ? ' (open — any additional properties allowed)' : ''}
				</p>
			);
		}
		const nextSeen = new Set(seen).add(resolved);
		return (
			<ul className="border-border/70 flex flex-col gap-2 border-l pl-3">
				{properties.map(([name, propSchema]) => (
					<li key={name}>
						<PropertyRow
							name={name}
							schema={propSchema}
							spec={spec}
							required={requiredSet.has(name)}
						/>
						<NestedChildren spec={spec} schema={propSchema} depth={depth + 1} seen={nextSeen} />
					</li>
				))}
			</ul>
		);
	}

	if (type === 'array') {
		const itemSeen = new Set(seen).add(resolved);
		return (
			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground">array of {schemaTypeLabel(resolved.items)}</p>
				{resolved.items && depth < MAX_DEPTH && (
					<SchemaNode spec={spec} schema={resolved.items} depth={depth + 1} seen={itemSeen} />
				)}
			</div>
		);
	}

	return (
		<ScalarLine
			label={schemaTypeLabel(schema)}
			required={required}
			description={resolved.description}
			enumValues={resolved.enum}
		/>
	);
}

/** One property line: name, type, required marker, description, and enum values. */
function PropertyRow({
	name,
	schema,
	spec,
	required,
}: {
	name: string;
	schema: JsonSchema;
	spec: OpenApiSpec | undefined;
	required?: boolean;
}) {
	const resolved = schema.$ref ? resolveRef(spec, schema.$ref) ?? schema : schema;
	return (
		<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
			<code className="text-foreground font-medium">{name}</code>
			<span className="text-muted-foreground font-mono text-xs">{schemaTypeLabel(schema)}</span>
			{required && <span className="text-red text-xs font-medium">required</span>}
			{resolved.description && <span className="text-muted-foreground w-full text-xs">{resolved.description}</span>}
			{Array.isArray(resolved.enum) && resolved.enum.length > 0 && (
				<span className="text-muted-foreground w-full text-xs">
					allowed: {resolved.enum.map(v => JSON.stringify(v)).join(', ')}
				</span>
			)}
		</div>
	);
}

/** Recurse into a property's children when it's an object or an array of objects. */
function NestedChildren({
	spec,
	schema,
	depth,
	seen,
}: {
	spec: OpenApiSpec | undefined;
	schema: JsonSchema;
	depth: number;
	seen: Set<JsonSchema>;
}) {
	if (depth >= MAX_DEPTH) {
		return null;
	}
	const resolved = schema.$ref ? resolveRef(spec, schema.$ref) : schema;
	if (!resolved || seen.has(resolved)) {
		return null;
	}
	const type = Array.isArray(resolved.type) ? resolved.type.find(t => t !== 'null') : resolved.type;
	const isObject = type === 'object' || !!resolved.properties;
	const itemType = resolved.items?.$ref
		? resolveRef(spec, resolved.items.$ref)
		: resolved.items;
	const isArrayOfObject = type === 'array' && !!itemType && (itemType.type === 'object' || !!itemType.properties);

	if (!isObject && !isArrayOfObject) {
		return null;
	}
	const child = isArrayOfObject ? resolved.items! : resolved;
	return (
		<div className="mt-1">
			<SchemaNode spec={spec} schema={child} depth={depth} seen={seen} />
		</div>
	);
}

function ScalarLine({
	label,
	required,
	description,
	note,
	enumValues,
}: {
	label: string;
	required?: boolean;
	description?: string;
	note?: string;
	enumValues?: unknown[];
}) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
			<span className="text-muted-foreground font-mono text-xs">{label}</span>
			{note && <span className="text-muted-foreground text-xs">{note}</span>}
			{required && <span className="text-red text-xs font-medium">required</span>}
			{description && <span className="text-muted-foreground w-full text-xs">{description}</span>}
			{Array.isArray(enumValues) && enumValues.length > 0 && (
				<span className="text-muted-foreground w-full text-xs">
					allowed: {enumValues.map(v => JSON.stringify(v)).join(', ')}
				</span>
			)}
		</div>
	);
}
