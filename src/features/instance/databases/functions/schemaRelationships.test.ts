import { describe, expect, it } from 'vitest';
import { parseSchemaRelationships } from './schemaRelationships';

// The live anvils app schema this feature was built against.
const anvilsSchema = `type Category @table @export @sealed {
	id: ID @primaryKey
	name: String! @indexed
	products: [Product] @relationship(to: "categoryId")
}

# Product catalog for the Anvils store
type Product @table @export @sealed {
	id: ID @primaryKey
	name: String! @indexed
	description: String
	priceCents: Int!
	tags: [String]
	embedding: [Float] @indexed(type: "HNSW", distance: "cosine", M: 16)
	categoryId: ID @indexed
	category: Category @relationship(from: "categoryId")
	createdAt: Date @createdTime
	updatedAt: Date @updatedTime
}
`;

describe('parseSchemaRelationships', () => {
	it('extracts relationships with exact from/to mappings', () => {
		const map = parseSchemaRelationships([anvilsSchema]);
		expect(map.data.Category).toEqual([
			{ attribute: 'products', relatedTableName: 'Product', isToMany: true, from: undefined, to: 'categoryId' },
		]);
		expect(map.data.Product).toEqual([
			{ attribute: 'category', relatedTableName: 'Category', isToMany: false, from: 'categoryId', to: undefined },
		]);
	});

	it('honors @table(table:, database:) overrides and same-database resolution', () => {
		const schema = `type Owner @table(table: "owners", database: "blog") {
	id: ID @primaryKey
	posts: [Post] @relationship(to: "ownerId")
}

type Post @table(database: "blog") {
	id: ID @primaryKey
	ownerId: ID @indexed
	owner: Owner @relationship(from: "ownerId")
}
`;
		const map = parseSchemaRelationships([schema]);
		expect(map.blog.owners[0]).toMatchObject({ attribute: 'posts', relatedTableName: 'Post' });
		expect(map.blog.Post[0]).toMatchObject({ attribute: 'owner', relatedTableName: 'owners' });
		expect(map.data).toBeUndefined();
	});

	it('resolves types across separate schema files, and skips unknown types', () => {
		const categoryOnly = `type Category @table {
	id: ID @primaryKey
	products: [Product] @relationship(to: "categoryId")
	ghosts: [Ghost] @relationship(to: "categoryId")
}
`;
		const productOnly = `type Product @table {
	id: ID @primaryKey
	categoryId: ID @indexed
}
`;
		const map = parseSchemaRelationships([categoryOnly, productOnly]);
		expect(map.data.Category).toEqual([
			{ attribute: 'products', relatedTableName: 'Product', isToMany: true, from: undefined, to: 'categoryId' },
		]);
	});

	it('ignores unparseable sources and tables without relationships', () => {
		expect(parseSchemaRelationships(['type Broken @table {'])).toEqual({});
		expect(parseSchemaRelationships(['type Plain @table { id: ID @primaryKey }'])).toEqual({});
	});
});
