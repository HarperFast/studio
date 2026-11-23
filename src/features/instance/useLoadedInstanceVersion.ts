import type { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useLoaderData } from '@tanstack/react-router';

/**
 * The instance version a child route's `registrationInfoLoader` read, or `undefined` while it has none. When the
 * instance layout's loader fails and a later `router.invalidate()` recovers it, TanStack Router (1.171) renders the
 * child once before the child's own loader settles, with no loader data.
 */
export function useLoadedInstanceVersion(): string | undefined {
	const loaderData: Partial<RegistrationInfoResponse> | undefined = useLoaderData({ strict: false });
	return loaderData?.version;
}
