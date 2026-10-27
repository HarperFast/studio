import { Loading } from '@/components/Loading';

import { useNavigationVisibility, useStudioConfiguration } from '@/features/instance/extensions/useStudioExtensions';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { lazyRouteComponent, Navigate, useParams } from '@tanstack/react-router';

/**
 * The local/instance index. Applications lives here, so a cluster that hides it sends this entry point
 * to its landing page instead of opening a tab its nav doesn't offer.
 */
export function ApplicationsIndex() {
	const params = useParams({ strict: false });
	const { isPending } = useStudioConfiguration();
	const visibilityOf = useNavigationVisibility();
	if (isPending) {
		return <Loading className="flex flex-col items-center justify-center py-24" text="Opening…" />;
	}
	if (visibilityOf('applications') === 'hidden') {
		return <Navigate to={buildAbsoluteLinkToPage(params, 'start')} replace />;
	}
	return <ApplicationsEditor />;
}

// Lazy: the applications editor pulls in Monaco, the AI SDK, motion and
// react-markdown. Loading it on demand keeps all of that off first paint.
export const ApplicationsEditor = lazyRouteComponent(
	() => import('@/features/instance/applications'),
	'ApplicationsEditor',
);
