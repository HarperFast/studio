import { createRootRouteWithContext } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { AuthenticationContextType } from '@/contexts/authentication-context';
import { StudioCloud } from '@/StudioCloud';
import { isLocalStudio } from '@/config/constants';
import { StudioLocal } from '@/StudioLocal';

export const rootRoute = createRootRouteWithContext<{
	queryClient: QueryClient;
	authentication: AuthenticationContextType;
}>()({
	component: isLocalStudio ? StudioLocal : StudioCloud,
});
