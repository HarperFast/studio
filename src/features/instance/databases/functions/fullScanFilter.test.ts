import { InstanceAttribute } from '@/integrations/api/api.patch';
import { SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';
import { describe, expect, it } from 'vitest';
import { fullScanAttributes, fullScanWarning } from './fullScanFilter';

// harperdb 4.7.40 describe_table for `type Thing @table { id: ID @primaryKey name: String @indexed
// note: String category: String }`: an indexed attribute carries `indexed: {}`, the rest nothing.
const attributesMap: Record<string, InstanceAttribute> = {
	id: { attribute: 'id', type: 'ID', is_primary_key: true },
	name: { attribute: 'name', type: 'String', indexed: {} },
	note: { attribute: 'note', type: 'String' },
	category: { attribute: 'category', type: 'String' },
};

const where = (
	search_attribute: SearchCondition['search_attribute'],
	search_type: SearchCondition['search_type'] = 'equals',
): SearchCondition => ({ search_attribute, search_type, search_value: 'x' });

describe('fullScanAttributes', () => {
	it('names the unindexed attributes when no condition can use an index', () => {
		expect(fullScanAttributes([where('note')], attributesMap)).toEqual(['note']);
		expect(fullScanAttributes([where('note'), where('category'), where('note', 'starts_with')], attributesMap))
			.toEqual(['note', 'category']);
	});

	it('finds no scan when any condition can use an index', () => {
		expect(fullScanAttributes([where('name', 'starts_with')], attributesMap)).toEqual([]);
		expect(fullScanAttributes([where('id', 'greater_than')], attributesMap)).toEqual([]);
		expect(fullScanAttributes([where('note'), where('name')], attributesMap)).toEqual([]);
		expect(fullScanAttributes([], attributesMap)).toEqual([]);
	});

	it('counts a not-equal as a scan even on an indexed attribute', () => {
		expect(fullScanAttributes([where('name', 'not_equal')], attributesMap)).toEqual(['name']);
		expect(fullScanAttributes([where('id', 'ne')], attributesMap)).toEqual(['id']);
	});

	it('leaves a relationship join to the related table', () => {
		expect(fullScanAttributes([where('note'), where(['brand', 'name'])], attributesMap)).toEqual([]);
	});
});

describe('fullScanWarning', () => {
	it('names the attributes and the table', () => {
		const message = fullScanWarning('Thing', ['note', 'category']);
		expect(message).toContain('"note", "category"');
		expect(message).toContain('every record in "Thing"');
		expect(message).toMatch(/Run it anyway\?$/);
	});
});
