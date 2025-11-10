import { StudioCloud } from '@/components/StudioCloud';
import { StudioLocal } from '@/components/StudioLocal';
import { isLocalStudio } from '@/config/constants';
import { AuthenticatedConnection, EntityIds } from '@/features/auth/store/authStore';
import { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';

export const rootRoute = createRootRouteWithContext<{
	queryClient: QueryClient;
	authentication: Record<EntityIds, AuthenticatedConnection>;
}>()({
	component: isLocalStudio ? StudioLocal : StudioCloud,
});
