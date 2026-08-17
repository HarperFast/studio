import { calculateDefaultPermissions } from '@/features/instance/config/roles/defaultCalculator';
import { InstanceDatabaseMap, LocalRolePermission } from '@/integrations/api/api.patch';
import { orderPermissionKeys, withOperations } from '@/integrations/api/localRolePermission';
import { describe, expect, it } from 'vitest';

// JSON.parse, not an object literal: a literal `__proto__` key sets the prototype instead of
// creating an own property, so the fixture itself has to come from parsed JSON.
const databaseMap = (json: string) => JSON.parse(json) as InstanceDatabaseMap;
const oneTable = '{"dog":{"attributes":[{"attribute":"id"}]}}';

describe('calculateDefaultPermissions', () => {
	it('keeps a database named __proto__ as an own, serializable key', () => {
		// Plain assignment would hit the prototype setter: the database would vanish from the
		// template and from JSON.stringify, so the role could never be granted it.
		const result = calculateDefaultPermissions({
			instanceDatabaseMap: databaseMap(`{"__proto__":{"dog":{"attributes":[{"attribute":"id"}]}}}`),
			currentRolePermissions: {},
			version: '5.2.2',
			showAttributes: false,
		});

		expect(Object.hasOwn(result, '__proto__')).toBe(true);
		// Read the own property explicitly: `parsed.__proto__` would resolve the prototype instead.
		const serialized = JSON.parse(JSON.stringify(result)) as object;
		const record = Object.getOwnPropertyDescriptor(serialized, '__proto__')?.value as
			| { tables: Record<string, unknown> }
			| undefined;
		expect(record?.tables).toHaveProperty('dog');
		// The round trip the editor actually performs must preserve it too.
		const roundTripped = JSON.parse(JSON.stringify(withOperations(orderPermissionKeys(result), ['sql'])));
		expect(Object.hasOwn(roundTripped, '__proto__')).toBe(true);
	});

	it('skips a database named like a reserved key when the instance reserves it', () => {
		const map = databaseMap(`{"operations":{"dog":{"attributes":[{"attribute":"id"}]}}}`);
		// 5.2 reserves `operations` for the allowlist, so writing the database there would clobber it.
		expect(
			calculateDefaultPermissions({
				instanceDatabaseMap: map,
				currentRolePermissions: { operations: ['sql'] },
				version: '5.2.2',
				showAttributes: false,
			}).operations,
		).toEqual(['sql']);

		// Below the allowlist floor the same name is just a database, so it gets a permission record.
		const legacy = calculateDefaultPermissions({
			instanceDatabaseMap: map,
			currentRolePermissions: {},
			version: '4.7.3',
			showAttributes: false,
		}).operations as unknown as { tables: Record<string, unknown> };
		expect(legacy.tables).toHaveProperty('dog');
	});

	it('preserves an existing allowlist while rebuilding table permissions', () => {
		const permission: LocalRolePermission = { operations: ['read_only'] };
		const result = calculateDefaultPermissions({
			instanceDatabaseMap: databaseMap(`{"data":${oneTable}}`),
			currentRolePermissions: permission,
			version: '5.2.2',
			showAttributes: false,
		});
		expect(result.operations).toEqual(['read_only']);
		expect(result.data).toBeDefined();
	});
});
