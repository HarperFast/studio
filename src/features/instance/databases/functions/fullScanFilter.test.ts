import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { InstanceAttribute } from '@/integrations/api/api.patch';
import { SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';
import { describe, expect, it } from 'vitest';
import { fullScanAttributes, fullScanQuestion } from './fullScanFilter';

// harperdb 4.7.40 describe_table for `type Thing @table { id: ID @primaryKey name: String @indexed
// note: String category: String brand: Brand @relationship(from: brandId) }`: an indexed attribute
// carries `indexed: {}`, the rest nothing.
const attributesMap: Record<string, InstanceAttribute> = {
	id: { attribute: 'id', type: 'ID', is_primary_key: true },
	name: { attribute: 'name', type: 'String', indexed: {} },
	note: { attribute: 'note', type: 'String' },
	category: { attribute: 'category', type: 'String' },
};
const relationshipInfoMap: Record<string, RelationshipAttributeInfo> = {
	brand: {
		relatedTableName: 'Brand',
		relatedPrimaryKey: 'id',
		relatedAttributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String', indexed: {} },
			{ attribute: 'description', type: 'String' },
		],
		isToMany: false,
		resolvable: true,
	},
};

const where = (
	search_attribute: SearchCondition['search_attribute'],
	search_type: SearchCondition['search_type'] = 'equals',
): SearchCondition => ({ search_attribute, search_type, search_value: 'x' });
const scan = (conditions: SearchCondition[]) =>
	fullScanAttributes(conditions, attributesMap, relationshipInfoMap).map(({ attribute }) => attribute);

describe('fullScanAttributes', () => {
	it('names the unindexed attributes when no condition can use an index', () => {
		expect(scan([where('note')])).toEqual(['note']);
		expect(scan([where('note'), where('category'), where('note', 'starts_with')])).toEqual(['note', 'category']);
	});

	it('finds no scan when any condition can use an index', () => {
		expect(scan([where('name', 'starts_with')])).toEqual([]);
		expect(scan([where('id', 'greater_than')])).toEqual([]);
		expect(scan([where('note'), where('name')])).toEqual([]);
		expect(scan([])).toEqual([]);
	});

	it('counts a not-equal, ends-with or contains as a scan even on an indexed attribute', () => {
		expect(scan([where('name', 'not_equal')])).toEqual(['name']);
		expect(scan([where('id', 'ne')])).toEqual(['id']);
		expect(scan([where('name', 'ends_with')])).toEqual(['name']);
		expect(scan([where('name', 'contains')])).toEqual(['name']);
		expect(scan([where('name', 'contains'), where('id', 'equals')])).toEqual([]);
	});

	// A join is answered by searching the related table, so it's that table's index that counts.
	it('checks a relationship join against the related table’s attributes', () => {
		expect(scan([where(['brand', 'name'])])).toEqual([]);
		expect(scan([where(['brand', 'id'])])).toEqual([]);
		expect(fullScanAttributes([where(['brand', 'description'])], attributesMap, relationshipInfoMap)).toEqual([
			{ attribute: 'brand.description', relatedTableName: 'Brand' },
		]);
		expect(scan([where('note'), where(['brand', 'name'])])).toEqual([]);
	});
});

describe('fullScanQuestion', () => {
	it('names the attributes and the table they make Harper read', () => {
		const { title, description } = fullScanQuestion('Thing', [{ attribute: 'note' }, { attribute: 'category' }]);
		expect(title).toBe('Scan every record in "Thing"?');
		expect(description).toContain('"note", "category"');
		expect(description).toContain('every record in "Thing" to');
	});

	it('names the related table for a join', () => {
		const { title, description } = fullScanQuestion('Thing', [
			{ attribute: 'note' },
			{ attribute: 'brand.description', relatedTableName: 'Brand' },
		]);
		expect(title).toBe('Scan every record in "Thing" and "Brand"?');
		expect(description).toContain('every record in "Thing" and "Brand"');
	});
});
