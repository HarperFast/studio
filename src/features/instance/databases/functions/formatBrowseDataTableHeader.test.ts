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

		expect(byHeader.comments.enableColumnFilter).toBe(true);
		expect(byHeader.comments.meta).toMatchObject({ unindexed: true });
	});

	it('does not attach relationship meta without relationship info', () => {
		const { dataTableColumns } = formatBrowseDataTableHeader(relReview);
		for (const column of dataTableColumns) {
			expect(column.meta?.relationshipInfo).toBeUndefined();
		}
		const product = dataTableColumns.find((column) => column.header === 'product');
		expect(product?.meta).toMatchObject({ unindexed: true });
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

		expect(tracks.meta?.relationshipInfo).toBeUndefined();
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
		expect(constructorColumn.meta?.relationshipInfo).toBeUndefined();
		expect(constructorColumn.meta).toMatchObject({ unindexed: true });
		expect(dataTableColumns.some((column) => column.header === 'toString')).toBe(true);
	});
});

describe('formatBrowseDataTableHeader filters on columns no index covers', () => {
	const thing = {
		schema: 'data',
		name: 'Thing',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String', indexed: {} },
			{ attribute: 'note', type: 'String' },
			{ attribute: 'tags', type: 'array', elements: 'String' },
			{ attribute: 'photo', type: 'Blob' },
		],
	} as InstanceTable;
	const byHeader = () =>
		Object.fromEntries(formatBrowseDataTableHeader(thing).dataTableColumns.map((column) => [column.header, column]));

	it('offers a filter on an unindexed column and marks it, but keeps it unsortable', () => {
		for (const name of ['note', 'tags']) {
			expect(byHeader()[name].enableColumnFilter).toBe(true);
			expect(byHeader()[name].enableSorting).toBe(false);
			expect(byHeader()[name].meta).toMatchObject({ unindexed: true });
		}
	});

	it('leaves indexed columns unmarked', () => {
		expect(byHeader().id.meta?.unindexed).toBeUndefined();
		expect(byHeader().name.meta?.unindexed).toBeUndefined();
		expect(byHeader().name.enableColumnFilter).toBe(true);
	});

	it('offers no filter on binary content', () => {
		expect(byHeader().photo.enableColumnFilter).toBe(false);
		expect(byHeader().photo.meta).toBeUndefined();
	});
});

describe('formatBrowseDataTableHeader vector columns', () => {
	// `describe_table` from a real Harper 5.4.1. A sort or filter on `embedding` there answers
	// "A target vector must be provided for an HNSW query" / `Can not use "equals" comparator with HNSW`.
	const doc = {
		schema: 'vec',
		name: 'Doc',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'embedding', type: 'array', elements: 'Float', indexed: { type: 'HNSW', distance: 'cosine' } },
			{ attribute: 'category', type: 'String', indexed: {} },
		],
	} as InstanceTable;
	const columns = () =>
		Object.fromEntries(formatBrowseDataTableHeader(doc).dataTableColumns.map((column) => [column.header, column]));

	it('offers neither a sort nor a filter on an HNSW column', () => {
		expect(columns().embedding.enableSorting).toBe(false);
		expect(columns().embedding.enableColumnFilter).toBe(false);
		expect(columns().embedding.meta).toBeUndefined();
	});

	it('still sorts and filters on an ordinary index, which 4.7 describes as {}', () => {
		expect(columns().category.enableSorting).toBe(true);
		expect(columns().category.enableColumnFilter).toBe(true);
	});

	it('shows a vector as its length and first few numbers, and a short array as JSON', () => {
		const render = columns().embedding.cell as (context: { getValue: () => unknown }) => unknown;
		const embedding = Array.from({ length: 384 }, (_, index) => index / 1000 + 0.0001);
		expect(render({ getValue: () => embedding })).toBe('384 numbers: [0.0001, 0.0011, 0.0021, …]');
		expect(render({ getValue: () => [1, 2] })).toBe('[1,2]');
	});
});
