/** @vitest-environment jsdom */
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { formatBrowseDataTableHeader } from './formatBrowseDataTableHeader';
import { getRelationshipInfoMap } from './relationshipAttributes';

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
		const { dataTableColumns } = formatBrowseDataTableHeader(relReview, getRelationshipInfoMap(relReview, tables));
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

	it('does not attach relationship meta without relationship info', () => {
		const { dataTableColumns } = formatBrowseDataTableHeader(relReview);
		for (const column of dataTableColumns) {
			expect(column.meta).toBeUndefined();
		}
		const product = dataTableColumns.find((column) => column.header === 'product');
		expect(product?.enableColumnFilter).toBe(false);
	});

	it('renders an elements-less array named like a sibling table as plain JSON', () => {
		const albums = {
			schema: 'data',
			name: 'Albums',
			primary_key: 'id',
			attributes: [
				{ attribute: 'id', type: 'ID', is_primary_key: true },
				{ attribute: 'tracks', type: 'array' },
			],
		} as InstanceTable;
		const albumTables: InstanceDatabaseTableMap = {
			Albums: albums,
			Tracks: {
				schema: 'data',
				name: 'Tracks',
				primary_key: 'id',
				attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true }],
			} as InstanceTable,
		};
		const { dataTableColumns } = formatBrowseDataTableHeader(albums, getRelationshipInfoMap(albums, albumTables));
		const tracks = dataTableColumns.find((column) => column.header === 'tracks')!;

		expect(tracks.meta).toBeUndefined();
		const render = tracks.cell as (context: { getValue: () => unknown }) => unknown;
		expect(render({ getValue: () => [{ title: 'Intro' }] })).toBe('[{"title":"Intro"}]');
	});

	it('synthesizes columns for schema-declared relationships missing from describe', () => {
		// Harper 5.1 regime: describe carries only the stored attributes.
		const described = { ...relReview, attributes: relReview.attributes.slice(0, 3) };
		const infoMap = getRelationshipInfoMap(described, tables, [
			{ attribute: 'product', relatedTableName: 'RelProduct', isToMany: false, from: 'productId' },
		]);
		const { dataTableColumns } = formatBrowseDataTableHeader(described, infoMap);
		const product = dataTableColumns.find((column) => column.header === 'product');
		expect(product).toBeDefined();
		expect(product?.enableColumnFilter).toBe(true);
		expect(product?.enableSorting).toBe(false);
		expect(product?.meta?.relationshipInfo).toMatchObject({
			relatedTableName: 'RelProduct',
			foreignKeyAttribute: 'productId',
			resolvable: false,
		});
	});
});

describe('formatBrowseDataTableHeader with properties describe does not list', () => {
	const dynamicTable = {
		schema: 'data',
		name: 'Thing',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String', indexed: {} },
			{ attribute: 'note', type: 'String' },
			{ attribute: '__createdtime__', type: 'Float', indexed: {} },
		],
	} as InstanceTable;

	it('adds a display-only column per extra, after the declared ones and before the timestamps', () => {
		const { dataTableColumns } = formatBrowseDataTableHeader(dynamicTable, {}, [
			{ attribute: 'color', type: 'String' },
			{ attribute: 'size', type: 'Int' },
			{ attribute: '__updatedtime__', type: 'Float' },
		]);
		expect(dataTableColumns.map((column) => column.header)).toEqual([
			'id',
			'name',
			'note',
			'color',
			'size',
			'__createdtime__',
			'__updatedtime__',
		]);
		const size = dataTableColumns.find((column) => column.header === 'size')!;
		// Harper 4.7.40 refuses an undeclared attribute in a condition ("unknown attribute 'size'") and
		// in a sort ("size is not a defined attribute").
		expect(size.enableSorting).toBe(false);
		expect(size.enableColumnFilter).toBe(false);
		expect(size.size).toBe(120);
	});

	// A schema-only relationship's column is synthesized, and a record can still carry its name.
	it('never adds a second column for an attribute that already has one', () => {
		const described = { ...relReview, attributes: relReview.attributes.slice(0, 3) };
		const infoMap = getRelationshipInfoMap(described, tables, [
			{ attribute: 'product', relatedTableName: 'RelProduct', isToMany: false, from: 'productId' },
		]);
		const { dataTableColumns } = formatBrowseDataTableHeader(described, infoMap, [
			{ attribute: 'comments', type: 'String' },
			{ attribute: 'product', type: 'Any' },
		]);
		expect(dataTableColumns.filter((column) => column.header === 'comments')).toHaveLength(1);
		expect(dataTableColumns.filter((column) => column.header === 'product')).toHaveLength(1);
	});

	it('reads relationship info only from the map, never its prototype', () => {
		const withConstructor = {
			...dynamicTable,
			attributes: [...dynamicTable.attributes, { attribute: 'constructor', type: 'String' }],
		} as InstanceTable;
		const { dataTableColumns } = formatBrowseDataTableHeader(withConstructor, {}, [{
			attribute: 'toString',
			type: 'String',
		}]);
		const constructorColumn = dataTableColumns.find((column) => column.header === 'constructor')!;
		expect(constructorColumn.meta).toBeUndefined();
		expect(constructorColumn.enableColumnFilter).toBe(false);
		expect(dataTableColumns.some((column) => column.header === 'toString')).toBe(true);
	});
});
