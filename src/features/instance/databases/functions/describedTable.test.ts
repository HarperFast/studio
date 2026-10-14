import type { SchemaRelationshipMap } from '@/features/instance/databases/functions/schemaRelationships';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { declaredRelationships, describedDatabase, describedTable, ownEntry } from './describedTable';

const dog = { attributes: [] };
const map = { data: { dog } } as unknown as InstanceDatabaseMap;
const relationships = [{ attribute: 'owner' }];
const relationshipMap = { data: { dog: relationships } } as unknown as SchemaRelationshipMap;

describe('describedDatabase and describedTable', () => {
	it('return the map’s own entries', () => {
		expect(describedDatabase(map, 'data')).toEqual({ dog });
		expect(describedTable(map, 'data', 'dog')).toBe(dog);
		expect(declaredRelationships(relationshipMap, 'data', 'dog')).toBe(relationships);
	});

	it('return nothing for a name the map lacks, or before the map loads', () => {
		expect(describedDatabase(undefined, 'data')).toBeUndefined();
		expect(describedTable(undefined, 'data', 'dog')).toBeUndefined();
		expect(describedTable(map, 'data', 'cat')).toBeUndefined();
		expect(describedTable(map, 'other', 'dog')).toBeUndefined();
		expect(declaredRelationships(undefined, 'data', 'dog')).toBeUndefined();
		expect(ownEntry(null, 'data')).toBeUndefined();
	});

	it('never find an Object.prototype member', () => {
		expect(describedDatabase(map, 'constructor')).toBeUndefined();
		expect(describedTable(map, 'data', 'toString')).toBeUndefined();
		expect(describedTable(map, 'constructor', 'name')).toBeUndefined();
		expect(declaredRelationships(relationshipMap, 'data', 'constructor')).toBeUndefined();
	});
});
