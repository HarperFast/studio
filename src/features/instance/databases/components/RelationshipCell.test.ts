import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { describe, expect, it } from 'vitest';
import { relationshipKeyValues } from './RelationshipCell';

const info: RelationshipAttributeInfo = {
	relatedTableName: 'RelProduct',
	relatedPrimaryKey: 'id',
	relatedAttributes: [],
	isToMany: false,
	resolvable: true,
};

describe('relationshipKeyValues', () => {
	it('reads the related primary key from a resolved to-one value', () => {
		expect(relationshipKeyValues({ id: 'p1' }, info)).toEqual(['p1']);
	});

	it('reads each related primary key from a resolved to-many value', () => {
		expect(relationshipKeyValues([{ id: 'r1' }, { id: 'r2' }], info)).toEqual(['r1', 'r2']);
	});

	it('is empty for unresolved values (older servers return null or omit the field)', () => {
		expect(relationshipKeyValues(null, info)).toEqual([]);
		expect(relationshipKeyValues(undefined, info)).toEqual([]);
		expect(relationshipKeyValues([null], info)).toEqual([]);
	});

	it('passes through scalar values defensively', () => {
		expect(relationshipKeyValues(['p1', 'p2'], info)).toEqual(['p1', 'p2']);
	});
});
