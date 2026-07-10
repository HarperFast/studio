import type { TreeItem } from 'react-complex-tree';
import type { DbTreeData } from './buildItems';

export function getItemTitle(item: TreeItem<DbTreeData>): string {
	switch (item.data.kind) {
		case 'createTable':
			return 'Create a Table';
		case 'database':
			return item.data.databaseName;
		case 'table':
			return item.data.tableName;
		default:
			return '';
	}
}
