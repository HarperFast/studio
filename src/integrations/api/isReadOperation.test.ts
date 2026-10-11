import { isReadOperation } from '@/integrations/api/isReadOperation';
import { describe, expect, it } from 'vitest';

describe('isReadOperation', () => {
	it.each([
		'describe_all',
		'describe_table',
		'search_by_value',
		'search_by_conditions',
		'get_configuration',
		'list_users',
		'read_log',
		'user_info',
		'system_information',
		'cluster_status',
		'registration_info',
	])('reads %s as a read', (operation) => {
		expect(isReadOperation(operation)).toBe(true);
	});

	it.each([
		'insert',
		'update',
		'delete',
		'sql',
		'drop_table',
		'set_configuration',
		'restart',
		'add_user',
		'create_authentication_tokens',
		'approve_agent_action',
		'my_component_operation',
		'user_info_reset',
		'registration_information',
	])('treats %s as able to change something', (operation) => {
		expect(isReadOperation(operation)).toBe(false);
	});

	it.each([undefined, null, 42, {}, ['describe_all']])(
		'treats a non-string operation (%j) as not a read',
		(operation) => {
			expect(isReadOperation(operation)).toBe(false);
		},
	);
});
