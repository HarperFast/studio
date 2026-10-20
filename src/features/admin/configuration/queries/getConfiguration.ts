import { apiClient } from '@/config/apiClient';
import { AdminConfigurationEntry } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/** Cast: the generated schema predates the computed `superUserOnly` flag. */
export async function getConfiguration(): Promise<AdminConfigurationEntry[]> {
	// Trailing slash required to get the records array rather than the collection descriptor.
	const { data } = await apiClient.get('/Admin/Configuration/');
	return [...(data as unknown as AdminConfigurationEntry[])].sort((a, b) => a.name.localeCompare(b.name));
}

export const configurationQueryKey = ['fabric-admin', 'configuration'];

export function getConfigurationQueryOptions() {
	return queryOptions({
		queryKey: configurationQueryKey,
		queryFn: getConfiguration,
		retry: false,
	});
}
