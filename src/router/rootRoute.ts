import { createRootRouteWithContext } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { AuthenticationContextType } from '@/contexts/authenticationContext';
import { StudioCloud } from '@/components/StudioCloud';
import { isLocalStudio } from '@/config/constants';
import { StudioLocal } from '@/components/StudioLocal';

export const rootRoute = createRootRouteWithContext<{
	queryClient: QueryClient;
	authentication: AuthenticationContextType;
}>()({
	component: isLocalStudio ? StudioLocal : StudioCloud,
});
