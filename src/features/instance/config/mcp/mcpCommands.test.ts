import { McpCommandList } from '@/integrations/api/instance/mcp/mcpConfig';
import { describe, expect, it } from 'vitest';
import {
	addMcpCommand,
	includedMcpCommands,
	isDefaultMcpCommand,
	knownMcpCommands,
	removeMcpCommand,
	restoreMcpCommand,
} from './mcpCommands';

const DEFAULTS: McpCommandList = { includesDefaults: true, added: [], removed: [] };

function names(list: McpCommandList, version = '5.3.6'): string[] {
	return includedMcpCommands(version, list).map((command) => command.name);
}

describe('includedMcpCommands', () => {
	it("matches the tools a 5.3.6 instance served by default, for the commands Studio's catalog knows", () => {
		// Live tools/list on 5.3.6 with an empty allow list, minus agent tools that need the agent running.
		expect(names(DEFAULTS)).toEqual([
			'describe_all',
			'describe_database',
			'describe_metric',
			'describe_schema',
			'describe_table',
			'get_analytics',
			'get_job',
			'get_status',
			'list_agent_sessions',
			'list_backups',
			'list_deployments',
			'list_metrics',
			'list_roles',
			'list_users',
			'read_audit_log',
			'read_log',
			'search_by_conditions',
			'search_by_hash',
			'search_by_id',
			'search_by_value',
			'search_jobs_by_start_date',
			'system_information',
		]);
	});

	it('marks what changes data by its own reading, not only Harper destructive hints', () => {
		const byName = new Map(knownMcpCommands('5.3.6', DEFAULTS).map((command) => [command.name, command]));
		expect(byName.get('drop_component')?.changesData).toBe(true);
		expect(byName.get('deploy_component')?.changesData).toBe(true);
		expect(byName.get('sql')?.changesData).toBe(true);
		expect(byName.get('describe_table')?.changesData).toBe(false);
		expect(includedMcpCommands('5.3.6', DEFAULTS).every((command) => !command.changesData)).toBe(true);
	});

	it('lists a command the list names that the catalog does not', () => {
		expect(names({ ...DEFAULTS, added: ['acme_deploy'] })).toContain('acme_deploy');
	});
});

describe('editing the list', () => {
	it('adds a command by name, keeping the defaults', () => {
		const list = addMcpCommand(DEFAULTS, 'insert');
		expect(list).toEqual({ includesDefaults: true, added: ['insert'], removed: [] });
		expect(names(list)).toContain('insert');
		expect(names(list)).toContain('describe_table');
		expect(names(list)).not.toContain('list_secrets');
	});

	it('removes a default command by denying it, and puts it back by lifting the denial', () => {
		const removed = removeMcpCommand(DEFAULTS, 'read_log');
		expect(removed).toEqual({ includesDefaults: true, added: [], removed: ['read_log'] });
		expect(names(removed)).not.toContain('read_log');
		expect(addMcpCommand(removed, 'read_log')).toEqual(DEFAULTS);
		expect(restoreMcpCommand(removed, 'read_log')).toEqual(DEFAULTS);
	});

	it('removes an added command by dropping it, not by denying it', () => {
		expect(removeMcpCommand(addMcpCommand(DEFAULTS, 'insert'), 'insert')).toEqual(DEFAULTS);
	});

	it('denies a command an added pattern brings in', () => {
		const list = removeMcpCommand({ ...DEFAULTS, added: ['get_*'] }, 'get_configuration');
		expect(list.removed).toEqual(['get_configuration']);
		expect(names(list)).not.toContain('get_configuration');
		expect(names(list)).toContain('get_components');
	});

	it('denies a name Studio does not list when a pattern already covers it', () => {
		const list = removeMcpCommand(DEFAULTS, 'describe_widget');
		expect(list.removed).toEqual(['describe_widget']);
		expect(names(list)).toContain('describe_table');
		expect(names(list)).not.toContain('describe_widget');
	});

	it('lifts a removed pattern that blocks a command being added, since a deny always wins', () => {
		const list = addMcpCommand({ ...DEFAULTS, removed: ['read_*'] }, 'read_log');
		expect(list.removed).toEqual([]);
		expect(names(list)).toContain('read_log');
	});

	it('tells default commands from added ones', () => {
		const list = addMcpCommand(DEFAULTS, 'insert');
		expect(isDefaultMcpCommand('describe_table', list)).toBe(true);
		expect(isDefaultMcpCommand('insert', list)).toBe(false);
	});
});
