import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import type { TreeItem } from 'react-complex-tree';
import { createTableId, rootId } from './specialItems';

/** Discriminated union carried as each tree item's `data`. */
export type DbTreeData =
	| { kind: 'root' }
	| { kind: 'createTable' }
	| { kind: 'database'; databaseName: string }
	| { kind: 'table'; databaseName: string; tableName: string };

/**
 * Composite id for a table row. A table name can repeat across databases, so the tree index must be
 * unique per (database, table). `/` is safe: `schemaRegex` forbids it in database/table names, and the
 * URL already joins `db/table` with `/`.
 */
export function tableItemId(databaseName: string, tableName: string): string {
	return `${databaseName}/${tableName}`;
}

/**
 * Convert the `describe_all` map into the flat `Record<id, TreeItem>` react-complex-tree consumes:
 * a synthetic root whose children are an optional "Create a Table" row (management only) followed by
 * each database (a folder of its tables).
 */
export function buildItems(
	instanceDatabaseMap: InstanceDatabaseMap | undefined,
	{ canManage }: { canManage: boolean },
): { items: Record<string, TreeItem<DbTreeData>>; rootId: string } {
	const items: Record<string, TreeItem<DbTreeData>> = {};
	const databaseNames = Object.keys(instanceDatabaseMap || {}).sort();

	for (const databaseName of databaseNames) {
		const tableNames = Object.keys(instanceDatabaseMap?.[databaseName] || {}).sort();
		items[databaseName] = {
			index: databaseName,
			isFolder: true,
			children: tableNames.map(tableName => tableItemId(databaseName, tableName)),
			data: { kind: 'database', databaseName },
			canMove: false,
			canRename: false,
		};
		for (const tableName of tableNames) {
			const id = tableItemId(databaseName, tableName);
			items[id] = {
				index: id,
				isFolder: false,
				data: { kind: 'table', databaseName, tableName },
				canMove: false,
				canRename: false,
			};
		}
	}

	items[createTableId] = {
		index: createTableId,
		isFolder: false,
		data: { kind: 'createTable' },
		canMove: false,
		canRename: false,
	};

	items[rootId] = {
		index: rootId,
		isFolder: true,
		children: [...(canManage ? [createTableId] : []), ...databaseNames],
		data: { kind: 'root' },
		canMove: false,
		canRename: false,
	};

	return { items, rootId };
}
