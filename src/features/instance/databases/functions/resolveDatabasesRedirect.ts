import { InstanceDatabaseMap } from '@/integrations/api/api.patch';

/**
 * Decides where the Databases tab should redirect, given the loaded database map and the current
 * route params. Returns the `{ databaseName, tableName }` overrides to navigate to, or `null` to stay.
 *
 * - Nothing selected, or a database that no longer exists (stale link / just dropped) -> first database.
 * - A valid database but a table that no longer exists -> that database's overview (drop the table).
 * - Otherwise (valid db, valid-or-absent table, or no databases at all) -> stay put.
 *
 * Every redirect strictly narrows toward a valid target, so it can never loop.
 */
export function resolveDatabasesRedirect(
	instanceDatabaseMap: InstanceDatabaseMap | undefined,
	params: { databaseName?: string; tableName?: string },
): { databaseName: string; tableName: undefined } | null {
	if (!instanceDatabaseMap) {
		return null;
	}
	const databaseExists = !!(params.databaseName && instanceDatabaseMap[params.databaseName]);
	if (!databaseExists) {
		const firstDatabaseName = Object.keys(instanceDatabaseMap).sort()[0];
		// No redirect when there are no databases at all, or the fallback would land on the same
		// (nonexistent) name we're already on -- both would otherwise loop.
		if (firstDatabaseName && firstDatabaseName !== params.databaseName) {
			return { databaseName: firstDatabaseName, tableName: undefined };
		}
		return null;
	}
	if (params.tableName && !instanceDatabaseMap[params.databaseName!][params.tableName]) {
		return { databaseName: params.databaseName!, tableName: undefined };
	}
	return null;
}
