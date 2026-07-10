/** @vitest-environment jsdom */
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { formatBrowseDataTableHeader } from './formatBrowseDataTableHeader';

const relReview = {
	schema: 'data',
	name: 'RelReview',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'productId', type: 'ID', indexed: {} },
		{ attribute: 'comments', type: 'String' },
		{ attribute: 'product', type: 'RelProduct' },
	],
} as InstanceTable;

const tables: InstanceDatabaseTableMap = {
	RelReview: relReview,
	RelProduct: {
		schema: 'data',
		name: 'RelProduct',
		primary_key: 'id',
		attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true }],
	} as InstanceTable,
};

describe('formatBrowseDataTableHeader', () => {
	it('marks relationship columns filterable and attaches relationship meta', () => {
		const { dataTableColumns } = formatBrowseDataTableHeader(relReview, tables);
		const byHeader = Object.fromEntries(dataTableColumns.map((column) => [column.header, column]));

		expect(byHeader.product.enableColumnFilter).toBe(true);
		expect(byHeader.product.enableSorting).toBe(false);
		expect(byHeader.product.meta?.relationshipInfo).toMatchObject({
			relatedTableName: 'RelProduct',
			relatedPrimaryKey: 'id',
			isToMany: false,
		});

		expect(byHeader.comments.enableColumnFilter).toBe(false);
		expect(byHeader.comments.meta).toBeUndefined();
	});

	it('does not attach relationship meta without the database table map', () => {
		const { dataTableColumns } = formatBrowseDataTableHeader(relReview);
		for (const column of dataTableColumns) {
			expect(column.meta).toBeUndefined();
		}
		const product = dataTableColumns.find((column) => column.header === 'product');
		expect(product?.enableColumnFilter).toBe(false);
	});
});
