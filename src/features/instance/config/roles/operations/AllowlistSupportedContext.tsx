import { useOperationsAllowlistSupported } from '@/features/instance/config/roles/operations/useOperationsAllowlistSupported';
import { createContext, PropsWithChildren } from 'react';

/**
 * The instance's allowlist support, resolved once for a list rather than per row. The underlying
 * query is shared, but a hook call per row still allocates an observer and query options for every
 * row — including the ordinary case where no role carries an `operations` key.
 */
export const AllowlistSupportedContext = createContext<boolean | undefined>(undefined);

export function AllowlistSupportedProvider({ children }: PropsWithChildren) {
	return <AllowlistSupportedContext value={useOperationsAllowlistSupported()}>{children}</AllowlistSupportedContext>;
}
