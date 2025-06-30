import { createRootRouteWithContext } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { AuthenticationContextType } from '@/contexts/authentication-context';
import { StudioCloud } from '@/StudioCloud';

export const rootRoute = createRootRouteWithContext<{
	queryClient: QueryClient;
	authentication: AuthenticationContextType;
}>()({
	component: StudioCloud,
});
