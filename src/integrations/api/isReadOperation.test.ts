import { isReadOperation, isReadRequest } from '@/integrations/api/isReadOperation';
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

describe('isReadRequest', () => {
	it.each([
		['a GET', { method: 'get' }],
		['an upper-case GET', { method: 'GET' }],
		['a read body', { method: 'post', data: { operation: 'describe_all' } }],
		['a read body under an upper-case POST', { method: 'POST', data: { operation: 'describe_all' } }],
		['a read body axios already serialized', { method: 'post', data: JSON.stringify({ operation: 'get_job' }) }],
	])('reads %s as a read', (_, config) => {
		expect(isReadRequest(config)).toBe(true);
	});

	it.each([
		['a write body', { method: 'post', data: { operation: 'insert' } }],
		['a serialized write body', { method: 'post', data: JSON.stringify({ operation: 'drop_table' }) }],
		['a body that is not JSON', { method: 'post', data: 'describe_all' }],
		['a JSON null body', { method: 'post', data: 'null' }],
		['no body', { method: 'post' }],
		['a DELETE', { method: 'delete' }],
		['a DELETE with a read body', { method: 'delete', data: { operation: 'describe_all' } }],
		['a PUT with a serialized read body', { method: 'put', data: JSON.stringify({ operation: 'get_job' }) }],
		['a PATCH with a read body', { method: 'patch', data: { operation: 'search_by_value' } }],
		['a read body with no method', { data: { operation: 'describe_all' } }],
		['a method that is not a string', { method: 42 }],
		['a read body under a method that is not a string', { method: 42, data: { operation: 'describe_all' } }],
	])('treats %s as able to change something', (_, config) => {
		expect(isReadRequest(config)).toBe(false);
	});
});
