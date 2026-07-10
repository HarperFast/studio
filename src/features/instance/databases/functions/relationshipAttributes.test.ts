import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import {
	buildRelationshipGetAttributes,
	collapsedForeignKeyNames,
	getRelationshipInfo,
	getRelationshipInfoMap,
	isSyntheticAttribute,
	relationshipForeignKeyName,
	syntheticAttributeNames,
} from './relationshipAttributes';

// Shapes copied from a Harper 4.7 describe_table response for:
//   type RelProduct @table { id: ID! @primaryKey ... reviews: [RelReview] @relationship(to: "productId") }
//   type RelReview @table { id: ID! @primaryKey productId: ID @indexed product: RelProduct @relationship(from: "productId") }
const relProduct = {
	schema: 'data',
	name: 'RelProduct',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'name', type: 'String', indexed: {} },
		{ attribute: 'price', type: 'Float' },
		{ attribute: 'tags', type: 'array', elements: 'String' },
		{ attribute: 'reviews', type: 'array', elements: 'RelReview' },
	],
} as InstanceTable;

const relReview = {
	schema: 'data',
	name: 'RelReview',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'productId', type: 'ID', indexed: {} },
		{ attribute: 'rating', type: 'Int', indexed: {} },
		{
			attribute: 'product',
			type: 'RelProduct',
			properties: [{ name: 'id', type: 'ID' }, { name: 'name', type: 'String' }],
		},
	],
} as InstanceTable;

const tables: InstanceDatabaseTableMap = { RelProduct: relProduct, RelReview: relReview };

describe('getRelationshipInfo', () => {
	it('detects a to-one relationship by its table-named type', () => {
		const info = getRelationshipInfo(relReview.attributes[3], tables);
		expect(info).toMatchObject({ relatedTableName: 'RelProduct', relatedPrimaryKey: 'id', isToMany: false });
		// The related table's own relationship attribute (reviews) is not offered as a sub-property.
		expect(info?.relatedAttributes.map((a) => a.attribute)).toEqual(['id', 'name', 'price', 'tags']);
	});

	it('detects a to-many relationship by its table-named array elements', () => {
		const info = getRelationshipInfo(relProduct.attributes[4], tables);
		expect(info).toMatchObject({ relatedTableName: 'RelReview', relatedPrimaryKey: 'id', isToMany: true });
		expect(info?.relatedAttributes.map((a) => a.attribute)).toEqual(['id', 'productId', 'rating']);
	});

	it('ignores scalar, scalar-array, and primary key attributes', () => {
		expect(getRelationshipInfo(relProduct.attributes[0], tables)).toBeUndefined(); // ID pk
		expect(getRelationshipInfo(relProduct.attributes[1], tables)).toBeUndefined(); // String
		expect(getRelationshipInfo(relProduct.attributes[3], tables)).toBeUndefined(); // [String]
	});

	it('ignores computed attributes even if their type matches a table', () => {
		expect(getRelationshipInfo({ attribute: 'x', type: 'RelProduct', computed: true }, tables)).toBeUndefined();
	});

	it('returns undefined without the database table map', () => {
		expect(getRelationshipInfo(relReview.attributes[3], undefined)).toBeUndefined();
	});

	it('falls back to hash_attribute for the related primary key', () => {
		const legacy = { ...tables, RelProduct: { ...relProduct, primary_key: undefined, hash_attribute: 'id' } };
		expect(getRelationshipInfo(relReview.attributes[3], legacy)?.relatedPrimaryKey).toBe('id');
	});
});

describe('getRelationshipInfoMap', () => {
	it('maps only relationship attributes', () => {
		expect(Object.keys(getRelationshipInfoMap(relProduct, tables))).toEqual(['reviews']);
		expect(Object.keys(getRelationshipInfoMap(relReview, tables))).toEqual(['product']);
	});
});

describe('isSyntheticAttribute / syntheticAttributeNames', () => {
	it('marks computed and relationship attributes', () => {
		expect(isSyntheticAttribute({ attribute: 'totalPrice', type: 'Float', computed: true }, tables)).toBe(true);
		expect(isSyntheticAttribute(relReview.attributes[3], tables)).toBe(true);
		expect(isSyntheticAttribute(relReview.attributes[1], tables)).toBe(false);
	});

	it('collects the names', () => {
		expect(syntheticAttributeNames(relReview.attributes, tables)).toEqual(['product']);
		expect(syntheticAttributeNames(undefined, tables)).toEqual([]);
	});
});

describe('buildRelationshipGetAttributes', () => {
	it('selects each relationship by related primary key, with * last', () => {
		expect(buildRelationshipGetAttributes(relProduct, tables)).toEqual([
			{ name: 'reviews', select: ['id'] },
			'*',
		]);
	});

	it('returns undefined when the table has no relationships', () => {
		const plain = { ...relProduct, attributes: relProduct.attributes.slice(0, 4) };
		expect(buildRelationshipGetAttributes(plain, tables)).toBeUndefined();
		expect(buildRelationshipGetAttributes(undefined, tables)).toBeUndefined();
	});
});

describe('relationshipForeignKeyName / collapsedForeignKeyNames', () => {
	it('pairs a to-one relationship with its conventional foreign key', () => {
		const info = getRelationshipInfo(relReview.attributes[3], tables)!;
		expect(relationshipForeignKeyName('product', info, relReview.attributes, tables)).toBe('productId');
	});

	it('matches snake_case foreign keys case-insensitively', () => {
		const attributes = [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'product_id', type: 'ID', indexed: {} },
			{ attribute: 'product', type: 'RelProduct' },
		];
		const info = getRelationshipInfo(attributes[2], tables)!;
		expect(relationshipForeignKeyName('product', info, attributes, tables)).toBe('product_id');
	});

	it('pairs a many-to-many relationship with its plural/singular id-array key', () => {
		const attributes = [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'petIds', type: 'array', elements: 'ID', indexed: {} },
			{ attribute: 'pets', type: 'array', elements: 'RelReview' },
		];
		const info = getRelationshipInfo(attributes[2], tables)!;
		expect(relationshipForeignKeyName('pets', info, attributes, tables)).toBe('petIds');
	});

	it('finds nothing for reverse (to:) relationships whose key lives on the other table', () => {
		const info = getRelationshipInfo(relProduct.attributes[4], tables)!;
		expect(relationshipForeignKeyName('reviews', info, relProduct.attributes, tables)).toBeUndefined();
	});

	it('never pairs with the primary key or another relationship', () => {
		const attributes = [
			{ attribute: 'productId', type: 'ID', is_primary_key: true },
			{ attribute: 'product', type: 'RelProduct' },
		];
		const info = getRelationshipInfo(attributes[1], tables)!;
		expect(relationshipForeignKeyName('product', info, attributes, tables)).toBeUndefined();
	});

	it('collects collapsed keys from the relationship info map', () => {
		expect(collapsedForeignKeyNames(getRelationshipInfoMap(relReview, tables))).toEqual(['productId']);
		expect(collapsedForeignKeyNames(getRelationshipInfoMap(relProduct, tables))).toEqual([]);
		expect(collapsedForeignKeyNames({})).toEqual([]);
	});
});

describe('legacy elements-less relationships and reverse foreign keys', () => {
	// Shapes copied from a live 5.1.18 cluster whose Albums/Tracks tables were created under an
	// older Harper: the legacy attribute registry kept `tracks` but without its element type.
	const albums = {
		schema: 'data',
		name: 'Albums',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String', indexed: {} },
			{ attribute: 'tracks', type: 'array' },
		],
	} as InstanceTable;
	const tracksTable = {
		schema: 'data',
		name: 'Tracks',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'albumId', type: 'ID', indexed: {} },
			{ attribute: 'name', type: 'String', indexed: {} },
		],
	} as InstanceTable;
	const albumTables: InstanceDatabaseTableMap = { Albums: albums, Tracks: tracksTable };

	it('detects an elements-less array by matching its name against sibling tables', () => {
		const info = getRelationshipInfo(albums.attributes[2], albumTables, albums);
		expect(info).toMatchObject({
			relatedTableName: 'Tracks',
			isToMany: true,
			resolvable: false,
			reverseForeignKey: 'albumId',
		});
	});

	it('does not treat scalar arrays as relationships even if a table shares their name', () => {
		const withTagsTable: InstanceDatabaseTableMap = {
			...albumTables,
			Tags: tracksTable,
		};
		expect(getRelationshipInfo({ attribute: 'tags', type: 'array', elements: 'String' }, withTagsTable))
			.toBeUndefined();
	});

	it('omits unresolvable relationships from get_attributes', () => {
		expect(buildRelationshipGetAttributes(albums, albumTables)).toBeUndefined();
	});

	it('only infers the reverse key when the owner table is known', () => {
		expect(getRelationshipInfo(albums.attributes[2], albumTables)?.reverseForeignKey).toBeUndefined();
	});

	it('finds the reverse key through the related table back-reference relationship', () => {
		// RelProduct.reviews: RelReview carries `product` (to-one back at RelProduct) whose
		// foreign key is productId — the naming convention (relproductid) would never match.
		const info = getRelationshipInfo(relProduct.attributes[4], tables, relProduct);
		expect(info?.reverseForeignKey).toBe('productId');
		expect(info?.resolvable).toBe(true);
	});
});

describe('getRelationshipInfoMap with schema-declared relationships', () => {
	// Harper 5.1 regime: describe reports only stored attributes; the component schema declares
	// category/products with exact from/to mappings.
	const category = {
		schema: 'data',
		name: 'Category',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String', indexed: {} },
		],
	} as InstanceTable;
	const product = {
		schema: 'data',
		name: 'Product',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String', indexed: {} },
			{ attribute: 'categoryId', type: 'ID', indexed: {} },
		],
	} as InstanceTable;
	const catalogTables: InstanceDatabaseTableMap = { Category: category, Product: product };

	it('adds a to-one relationship with its exact stored key', () => {
		const map = getRelationshipInfoMap(product, catalogTables, [
			{ attribute: 'category', relatedTableName: 'Category', isToMany: false, from: 'categoryId' },
		]);
		expect(map.category).toMatchObject({
			relatedTableName: 'Category',
			relatedPrimaryKey: 'id',
			isToMany: false,
			resolvable: false,
			foreignKeyAttribute: 'categoryId',
		});
		expect(collapsedForeignKeyNames(map)).toEqual(['categoryId']);
	});

	it('adds a reverse to-many relationship with its exact reverse key', () => {
		const map = getRelationshipInfoMap(category, catalogTables, [
			{ attribute: 'products', relatedTableName: 'Product', isToMany: true, to: 'categoryId' },
		]);
		expect(map.products).toMatchObject({
			relatedTableName: 'Product',
			isToMany: true,
			resolvable: false,
			reverseForeignKey: 'categoryId',
		});
		expect(map.products.foreignKeyAttribute).toBeUndefined();
	});

	it('keeps resolvable=true when describe also reports the attribute (Harper 4.x)', () => {
		const describedProduct = {
			...product,
			attributes: [...product.attributes, { attribute: 'category', type: 'Category' }],
		};
		const map = getRelationshipInfoMap(describedProduct, catalogTables, [
			{ attribute: 'category', relatedTableName: 'Category', isToMany: false, from: 'categoryId' },
		]);
		expect(map.category.resolvable).toBe(true);
		expect(map.category.foreignKeyAttribute).toBe('categoryId');
	});

	it('skips declarations whose related table is unknown', () => {
		const map = getRelationshipInfoMap(product, catalogTables, [
			{ attribute: 'vendor', relatedTableName: 'Vendor', isToMany: false, from: 'vendorId' },
		]);
		expect(map.vendor).toBeUndefined();
	});
});
