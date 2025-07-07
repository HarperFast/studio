import { createRootRouteWithContext } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { StudioCloud } from '@/components/StudioCloud';
import { isLocalStudio } from '@/config/constants';
import { StudioLocal } from '@/components/StudioLocal';
import { AuthenticatedConnection } from '@/lib/authStore';

export const rootRoute = createRootRouteWithContext<{
	queryClient: QueryClient;
	authentication: AuthenticatedConnection;
}>()({
	component: isLocalStudio ? StudioLocal : StudioCloud,
});
