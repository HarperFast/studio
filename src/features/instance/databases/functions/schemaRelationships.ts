import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { parseSchema } from '@/features/instance/applications/lib/schema/parseSchema';
import {
	baseTypeName,
	findArg,
	findDirective,
	isListType,
	stringArgValue,
} from '@/features/instance/applications/lib/schema/types';
import { getComponentFile } from '@/integrations/api/instance/applications/getComponentFile';
import { APIDirectoryEntry, APIFileEntry, getComponents } from '@/integrations/api/instance/applications/getComponents';
import { queryOptions } from '@tanstack/react-query';

/**
 * Relationship declared in a component's `schema.graphql`.
 *
 * Harper 5.1 omits relationship attributes from `describe_table` entirely (they are runtime-only,
 * never persisted to the attribute registry), so on those servers the schema files are the only
 * place browse can learn that relationships exist — and they carry more than describe ever did:
 * the exact `@relationship(from:/to:)` key mappings.
 */
export interface SchemaRelationship {
	attribute: string;
	relatedTableName: string;
	isToMany: boolean;
	/** `@relationship(from:)` — the attribute on this table storing the related key(s). */
	from?: string;
	/** `@relationship(to:)` — the attribute on the related table pointing back at this table. */
	to?: string;
}

/** database → table → relationships declared for that table. */
export type SchemaRelationshipMap = Record<string, Record<string, SchemaRelationship[]>>;

const DEFAULT_DATABASE = 'data';
/** Backstop against pathological component trees; a real instance has a handful of schemas. */
const MAX_SCHEMA_FILES = 25;

export function getSchemaRelationshipsQueryOptions(params: InstanceClientIdConfig & { enabled?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'schema-relationships'] as const,
		staleTime: 60_000,
		retry: false,
		enabled: params.enabled !== false,
		queryFn: async (): Promise<SchemaRelationshipMap> => {
			// Best-effort: browse must keep working for users who can't read component files
			// (or on servers without these operations), so any failure yields an empty map.
			try {
				const tree = await getComponents(params);
				const files = collectGraphqlFiles(tree).slice(0, MAX_SCHEMA_FILES);
				const sources = await Promise.all(
					files.map(({ project, file }) =>
						getComponentFile({ ...params, project, file })
							.then((response) => response.message)
							.catch(() => undefined)
					),
				);
				return parseSchemaRelationships(sources.filter((source): source is string => typeof source === 'string'));
			} catch {
				return {};
			}
		},
	});
}

function collectGraphqlFiles(root: APIDirectoryEntry | undefined): Array<{ project: string; file: string }> {
	const files: Array<{ project: string; file: string }> = [];
	for (const component of root?.entries ?? []) {
		if (!('entries' in component)) {
			continue;
		}
		const walk = (entries: Array<APIDirectoryEntry | APIFileEntry>, prefix: string) => {
			for (const entry of entries) {
				if ('entries' in entry) {
					walk(entry.entries, `${prefix}${entry.name}/`);
				} else if (entry.name.endsWith('.graphql')) {
					files.push({ project: component.name, file: `${prefix}${entry.name}` });
				}
			}
		};
		walk(component.entries, '');
	}
	return files;
}

/** Parse schema sources into relationship declarations, resolving type names to table names. */
export function parseSchemaRelationships(sources: string[]): SchemaRelationshipMap {
	interface ParsedTable {
		typeName: string;
		tableName: string;
		database: string;
		relationships: Array<Omit<SchemaRelationship, 'relatedTableName'> & { relatedTypeName: string }>;
	}
	const tables: ParsedTable[] = [];
	for (const source of sources) {
		const { document, ok } = parseSchema(source);
		if (!ok) {
			continue;
		}
		for (const segment of document.segments) {
			if (segment.kind !== 'table') {
				continue;
			}
			const { table } = segment;
			const tableDirective = findDirective(table.directives, 'table');
			const tableName = stringArgValue(findArg(tableDirective, 'table')?.value) ?? table.typeName;
			const database = stringArgValue(findArg(tableDirective, 'database')?.value) ?? DEFAULT_DATABASE;
			const relationships: ParsedTable['relationships'] = [];
			for (const field of table.fields) {
				const relationship = findDirective(field.directives, 'relationship');
				if (!relationship) {
					continue;
				}
				relationships.push({
					attribute: field.name,
					relatedTypeName: baseTypeName(field.type),
					isToMany: isListType(field.type),
					from: stringArgValue(findArg(relationship, 'from')?.value),
					to: stringArgValue(findArg(relationship, 'to')?.value),
				});
			}
			tables.push({ typeName: table.typeName, tableName, database, relationships });
		}
	}

	const map: SchemaRelationshipMap = {};
	for (const table of tables) {
		if (!table.relationships.length) {
			continue;
		}
		const resolved: SchemaRelationship[] = [];
		for (const { relatedTypeName, ...relationship } of table.relationships) {
			// Related types live in the same database; resolve the GraphQL type name to the
			// (possibly @table(table:)-renamed) table name.
			const related = tables.find((candidate) =>
				candidate.typeName === relatedTypeName && candidate.database === table.database
			);
			if (related) {
				resolved.push({ ...relationship, relatedTableName: related.tableName });
			}
		}
		if (resolved.length) {
			(map[table.database] ??= {})[table.tableName] = resolved;
		}
	}
	return map;
}
