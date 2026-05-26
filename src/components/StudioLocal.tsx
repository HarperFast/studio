import { HeadContent, Outlet } from '@tanstack/react-router';

export function StudioLocal() {
	return (
		<>
			<HeadContent />
			<Outlet />
		</>
	);
}
