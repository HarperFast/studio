import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { buildItems, tableItemId } from './buildItems';
import { getItemTitle } from './getItemTitle';
import { createTableId, rootId } from './specialItems';

function table(schema: string, name: string): InstanceTable {
	return {
		schema,
		name,
		audit: false,
		schema_defined: true,
		db_size: 0,
		sources: [],
		table_size: 0,
		db_audit_size: 0,
		attributes: [],
	};
}

// One database with two tables (deliberately unsorted), a second database that shares a table NAME
// (`shared`) with the first, and an empty database.
const map: InstanceDatabaseMap = {
	beta: { shared: table('beta', 'shared') },
	alpha: { widgets: table('alpha', 'widgets'), shared: table('alpha', 'shared') },
	empty: {},
};

describe('buildItems', () => {
	it('sorts databases and tables, and mounts them under the synthetic root', () => {
		const { items, rootId: root } = buildItems(map, { canManage: true });
		expect(root).toBe(rootId);
		// createTable row first, then databases alphabetically.
		expect(items[rootId].children).toEqual([createTableId, 'alpha', 'beta', 'empty']);
		expect(items['alpha'].isFolder).toBe(true);
		expect(items['alpha'].children).toEqual([tableItemId('alpha', 'shared'), tableItemId('alpha', 'widgets')]);
		expect(items['empty'].children).toEqual([]);
	});

	it('gives tables composite ids so duplicate names across databases do not collide', () => {
		const { items } = buildItems(map, { canManage: true });
		expect(items['alpha/shared'].data).toEqual({ kind: 'table', databaseName: 'alpha', tableName: 'shared' });
		expect(items['beta/shared'].data).toEqual({ kind: 'table', databaseName: 'beta', tableName: 'shared' });
		expect(items['alpha/shared'].isFolder).toBe(false);
	});

	it('omits the create-table row when the user cannot manage the instance', () => {
		const { items } = buildItems(map, { canManage: false });
		expect(items[rootId].children).toEqual(['alpha', 'beta', 'empty']);
		// The item itself still exists (harmless), but it is not reachable from the root.
		expect(items[rootId].children).not.toContain(createTableId);
	});

	it('handles an undefined map as an empty tree', () => {
		const { items } = buildItems(undefined, { canManage: true });
		expect(items[rootId].children).toEqual([createTableId]);
	});
});

describe('getItemTitle', () => {
	it('titles each kind of row', () => {
		const { items } = buildItems(map, { canManage: true });
		expect(getItemTitle(items[createTableId])).toBe('Create a Table');
		expect(getItemTitle(items['alpha'])).toBe('alpha');
		expect(getItemTitle(items['alpha/widgets'])).toBe('widgets');
	});
});
