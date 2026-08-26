import { isLocalStudio } from '@/config/constants';
import { ClusterExpiryStrip } from '@/features/cluster/components/ClusterExpiryStrip';
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

// The chat widget pulls in the AI SDK and motion. It's a floating overlay that
// isn't needed on first paint, so load it lazily to keep both off the initial
// bundle; a null fallback is fine while its chunk fetches.
const FloatingChat = lazy(() =>
	import('./applications/components/Chat/FloatingChat').then((m) => ({ default: m.FloatingChat }))
);

export function InstanceLayout() {
	return (
		<>
			<nav className="fixed top-20 w-full z-39 h-12 md:px-12 bg-violet-50 border-b border-violet-100 dark:bg-grey-700 dark:border-none">
				<InstanceNavBar />
			</nav>
			<div className="mt-32 min-h-[calc(100vh-(--spacing(32)))]">
				<ClusterExpiryStrip />
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
