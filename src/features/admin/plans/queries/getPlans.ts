import { apiClient } from '@/config/apiClient';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';

/**
 * GET /Admin/Plan/ → every plan, including ones no customer can pick. Gated by `plan:read`, which
 * every staff role holds.
 */
export async function getPlans(): Promise<SchemaPlan[]> {
	// Trailing slash is required, as on /Admin/Region/: without it Harper answers with the
	// collection descriptor rather than the records.
	const { data } = await apiClient.get('/Admin/Plan/');
	return data as unknown as SchemaPlan[];
}

export const plansQueryKey = ['fabric-admin', 'plans'];

export function getPlansQueryOptions() {
	return queryOptions({
		queryKey: plansQueryKey,
		queryFn: getPlans,
		retry: false,
	});
}
