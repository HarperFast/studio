import { isBuiltInRead } from '@/features/instance/operations/operationKinds';
import { describe, expect, it } from 'vitest';

describe('isBuiltInRead', () => {
	it.each(['describe_all', 'search_by_value', 'search_by_id', 'get_configuration', 'list_users', 'read_log'])(
		"lets Harper's own %s through without asking",
		(operation) => {
			expect(isBuiltInRead(operation)).toBe(true);
		},
	);

	it.each(['get_and_rotate_key', 'search_and_destroy', 'read_then_delete', 'list_and_purge'])(
		'asks about %s, a component operation that only looks like a read',
		(operation) => {
			expect(isBuiltInRead(operation)).toBe(false);
		},
	);

	it.each(['insert', 'sql', 'drop_table', 'restart'])('asks about %s, a built-in that is not a read', (operation) => {
		expect(isBuiltInRead(operation)).toBe(false);
	});
});
