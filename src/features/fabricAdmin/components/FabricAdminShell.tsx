import { SubNavItem, SubNavRail } from '@/components/SubNavRail';
import { isFabricAdmin, useCloudAuth } from '@/hooks/useAuth';
import { Navigate, Outlet } from '@tanstack/react-router';
import { KeyRoundIcon } from 'lucide-react';

/**
 * Shell for the Fabric Admin section: a responsive sub-nav rail (so future admin
 * endpoints slot in as new items) plus the active page. Gated to fabric_admin
 * (matching the token endpoint's SSO-session contract — see isFabricAdmin); the
 * dashboard route guard already handles the unauthenticated redirect.
 */
const items: SubNavItem[] = [
	{ to: '/fabric-admin', label: 'API Token', icon: KeyRoundIcon, exact: true },
];

export function FabricAdminShell() {
	const { isLoading, user } = useCloudAuth();

	if (isLoading) { return null; }
	if (!isFabricAdmin(user)) { return <Navigate to="/" replace />; }

	return (
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
			<div className="md:grid gap-6 md:grid-cols-12">
				<aside className="md:col-span-3 lg:col-span-2 mb-4 md:mb-0">
					<SubNavRail items={items} ariaLabel="Fabric Admin sections" />
				</aside>
				<section className="md:col-span-9 lg:col-span-10 min-w-0">
					<Outlet />
				</section>
			</div>
		</div>
	);
}
