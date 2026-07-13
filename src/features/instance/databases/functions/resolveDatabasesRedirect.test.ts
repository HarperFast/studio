import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { resolveDatabasesRedirect } from './resolveDatabasesRedirect';

// Only key presence matters to the redirect logic, so minimal stand-ins suffice.
const map = {
	beta: { orders: {} },
	alpha: { widgets: {}, shared: {} },
	empty: {},
} as unknown as InstanceDatabaseMap;

describe('resolveDatabasesRedirect', () => {
	it('does not redirect before the map has loaded', () => {
		expect(resolveDatabasesRedirect(undefined, {})).toBeNull();
	});

	it('does not redirect when the instance has no databases', () => {
		expect(resolveDatabasesRedirect({} as InstanceDatabaseMap, {})).toBeNull();
	});

	it('lands on the first database (sorted) when nothing is selected', () => {
		expect(resolveDatabasesRedirect(map, {})).toEqual({ databaseName: 'alpha', tableName: undefined });
	});

	it('falls back to the first database when the selected one no longer exists', () => {
		expect(resolveDatabasesRedirect(map, { databaseName: 'ghost' })).toEqual({
			databaseName: 'alpha',
			tableName: undefined,
		});
	});

	it('drops a table that no longer exists, keeping the database', () => {
		expect(resolveDatabasesRedirect(map, { databaseName: 'alpha', tableName: 'ghost' })).toEqual({
			databaseName: 'alpha',
			tableName: undefined,
		});
	});

	it('stays put on a valid database with no table (its overview)', () => {
		expect(resolveDatabasesRedirect(map, { databaseName: 'alpha' })).toBeNull();
	});

	it('stays put on a valid database and table', () => {
		expect(resolveDatabasesRedirect(map, { databaseName: 'alpha', tableName: 'widgets' })).toBeNull();
	});

	it('stays put on an empty database (shows its overview, no redirect loop)', () => {
		expect(resolveDatabasesRedirect(map, { databaseName: 'empty' })).toBeNull();
	});
});
