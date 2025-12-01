import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { Outlet } from '@tanstack/react-router';

export function InstanceLayout() {
	return (
		<>
			<nav className="fixed top-20 w-full z-39 h-12 md:px-12 bg-grey-700">
				<InstanceNavBar />
			</nav>
			<div className="mt-32 min-h-[calc(100vh-theme(spacing.32))]">
				<Outlet />
			</div>
		</>
	);
}
