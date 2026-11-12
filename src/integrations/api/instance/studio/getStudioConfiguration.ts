import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import {
	EMPTY_STUDIO_CONFIGURATION,
	parseStudioConfiguration,
	StudioConfiguration,
} from '@/features/instance/extensions/parseStudioConfiguration';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { queryOptions } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/**
 * The first Harper that answers `get_studio_configuration` (HarperFast/harper#3656). `-0` sorts below every
 * other prerelease, so 5.4's alphas and betas count: the operation ships in them.
 */
export const STUDIO_CONFIGURATION_MIN_HARPER_VERSION = '5.4.0-0';

/**
 * Whether a Harper of this version may answer `get_studio_configuration`. Only a version known to be older
 * says no; one Studio can't read (absent, or not semver) says yes, so it is asked as before.
 */
export function mayAnswerStudioConfiguration(version: string | undefined): boolean {
	const known = version ?? '';
	// Both comparisons are false only when the version doesn't parse.
	return wasAReleasedBeforeB(STUDIO_CONFIGURATION_MIN_HARPER_VERSION, known)
		|| !wasAReleasedBeforeB(known, STUDIO_CONFIGURATION_MIN_HARPER_VERSION);
}

/**
 * The cluster's Studio settings and its components' pages. Open to every signed-in role, which is what
 * lets a read-only viewer find a page at all (`get_components` and `get_configuration` are super-user
 * only).
 *
 * A 4xx means "nothing to show" rather than a failure: an older Harper answers an unknown operation with
 * 400, and a role whose `operations` allowlist omits it gets 403. Either way Studio is just Studio, and
 * neither belongs in Error Tracking, so neither reaches the global error handler.
 */
// Others, such as a 408 or 429, are passing: caching them as "no configuration" would un-focus the cluster.
const UNANSWERABLE_STATUSES = new Set([400, 403, 404]);

export async function getStudioConfiguration({ instanceClient }: InstanceClientIdConfig): Promise<StudioConfiguration> {
	try {
		const { data } = await instanceClient.post('/', { operation: 'get_studio_configuration' });
		return parseStudioConfiguration(data);
	} catch (error) {
		const status = isAxiosError(error) ? error.response?.status : undefined;
		if (status !== undefined && UNANSWERABLE_STATUSES.has(status)) {
			return { ...EMPTY_STUDIO_CONFIGURATION, unavailable: true };
		}
		throw error;
	}
}

export function getStudioConfigurationQueryOptions(params: InstanceClientIdConfig & { enabled?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'get_studio_configuration'] as const,
		queryFn: () => getStudioConfiguration(params),
		// It changes on a deploy or a config edit, not from minute to minute.
		staleTime: 5 * 60_000,
		retry: false,
		enabled: params.enabled !== false,
	});
}
