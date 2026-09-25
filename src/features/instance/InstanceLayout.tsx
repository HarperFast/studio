import { isLocalStudio } from '@/config/constants';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { ClusterExpiryStrip } from '@/features/cluster/components/ClusterExpiryStrip';
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { RestartingNotice } from '@/features/restart/RestartingNotice';
import { Outlet, useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

// The chat widget pulls in the AI SDK and motion. It's a floating overlay that
// isn't needed on first paint, so load it lazily to keep both off the initial
// bundle; a null fallback is fine while its chunk fetches.
const FloatingChat = lazy(() =>
	import('./applications/components/Chat/FloatingChat').then((m) => ({ default: m.FloatingChat }))
);

export function InstanceLayout() {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	return (
		<>
			<nav className="studio-subnav fixed top-20 w-full z-39 h-12 md:px-12 bg-violet-50 border-b border-violet-100 dark:bg-grey-700 dark:border-none">
				<InstanceNavBar />
			</nav>
			<div className="mt-32 min-h-[calc(100vh-(--spacing(32)))]">
				<ClusterExpiryStrip />
				<RestartingNotice
					entityId={isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId}
					clusterId={clusterId}
					noun={isLocalStudio || instanceId ? 'instance' : 'cluster'}
					className="px-4 pt-4 md:px-12"
				/>
				<Outlet />
			</div>
			{!isLocalStudio && (
				<Suspense fallback={null}>
					<FloatingChat />
				</Suspense>
			)}
		</>
	);
}
