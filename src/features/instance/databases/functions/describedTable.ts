import { SchemaRelationship, SchemaRelationshipMap } from '@/features/instance/databases/functions/schemaRelationships';
import { InstanceDatabaseMap, InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';

export function ownEntry<T>(record: Readonly<Record<string, T>> | null | undefined, key: string): T | undefined {
	return record && Object.hasOwn(record, key) ? (record[key] ?? undefined) : undefined;
}

export function describedDatabase(
	instanceDatabaseMap: InstanceDatabaseMap | undefined,
	databaseName: string,
): InstanceDatabaseTableMap | undefined {
	return ownEntry(instanceDatabaseMap, databaseName);
}

export function describedDatabaseNames(instanceDatabaseMap: InstanceDatabaseMap | undefined): string[] {
	return Object.keys(instanceDatabaseMap ?? {}).filter((name) => !!describedDatabase(instanceDatabaseMap, name)).sort();
}

export function describedTableNames(
	instanceDatabaseMap: InstanceDatabaseMap | undefined,
	databaseName: string,
): string[] {
	const databaseTables = describedDatabase(instanceDatabaseMap, databaseName);
	return Object.keys(databaseTables ?? {}).filter((name) => !!ownEntry(databaseTables, name)).sort();
}

export function describedTable(
	instanceDatabaseMap: InstanceDatabaseMap | undefined,
	databaseName: string,
	tableName: string,
): InstanceTable | undefined {
	return ownEntry(describedDatabase(instanceDatabaseMap, databaseName), tableName);
}

export function declaredRelationships(
	schemaRelationshipMap: SchemaRelationshipMap | undefined,
	databaseName: string,
	tableName: string,
): SchemaRelationship[] | undefined {
	return ownEntry(ownEntry(schemaRelationshipMap, databaseName), tableName);
}
