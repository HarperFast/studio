import { useOnRouteLoadTracker } from '@/integrations/datadog/datadog';
import { Outlet } from '@tanstack/react-router';

export function StudioCloud() {
	useOnRouteLoadTracker();
	return <Outlet />;
}
