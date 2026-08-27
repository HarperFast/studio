import { SubNavItem, SubNavRail } from '@/components/SubNavRail';
import { hasStaffPermission, useCloudAuth } from '@/hooks/useAuth';
import { LocalUser, StaffPermission, User } from '@/integrations/api/api.patch';
import { Navigate, Outlet, useLocation } from '@tanstack/react-router';
import { BellIcon, GlobeIcon, KeyRoundIcon, ReceiptTextIcon } from 'lucide-react';

/**
 * Shell for the Admin section: a responsive sub-nav rail (so future admin
 * endpoints slot in as new items) plus the active page. Each item names the
 * staff permission its page needs; the rail shows only the pages the account
 * holds, and holding any of them grants entry. The dashboard route guard
 * already handles the unauthenticated redirect.
 */
// Order matters: /admin redirects to the first item's route (see adminIndexRoute);
// anyone not permitted there is bounced to their first visible page below.
const items: Array<SubNavItem & { permission: StaffPermission; ssoAccountOnly?: boolean }> = [
	{ to: '/admin/notifications', label: 'Notifications', icon: BellIcon, permission: 'systemStatus:write' },
	{ to: '/admin/regions', label: 'Regions', icon: GlobeIcon, permission: 'region:read' },
	{ to: '/admin/grants', label: 'Grants', icon: ReceiptTextIcon, permission: 'grant:read' },
	// Minting a token requires the Google SSO session only staff sign-ins have;
	// super_user may password-login, so the mint would 403 for it.
	{
		to: '/admin/api-token',
		label: 'API Token',
		icon: KeyRoundIcon,
		permission: 'apiToken:create',
		ssoAccountOnly: true,
	},
];

export function visibleAdminItems(user: User | LocalUser | null) {
	const isSuperUser = user !== null && 'fabricRole' in user && user.fabricRole === 'super_user';
	return items.filter((item) => hasStaffPermission(user, item.permission) && !(item.ssoAccountOnly && isSuperUser));
}

/** Whether the account may enter /admin at all — drives the Navbar link too. */
export function canSeeAdminSection(user: User | LocalUser | null): boolean {
	return visibleAdminItems(user).length > 0;
}

export function AdminShell() {
	const { isLoading, user } = useCloudAuth();
	const { pathname } = useLocation();

	if (isLoading) { return null; }
	const visible = visibleAdminItems(user);
	if (!visible.length) { return <Navigate to="/" replace />; }

	// Deep links (and the /admin index redirect) may point at a page this account
	// doesn't hold — send it to its first visible page instead of a broken one.
	const current = items.find((item) => pathname.startsWith(item.to));
	if (current && !visible.includes(current)) { return <Navigate to={visible[0].to} replace />; }

	return (
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
			<div className="md:grid gap-6 md:grid-cols-12">
				<aside className="md:col-span-3 lg:col-span-2 mb-4 md:mb-0">
					<SubNavRail items={visible} ariaLabel="Admin sections" />
				</aside>
				<section className="md:col-span-9 lg:col-span-10 min-w-0">
					<Outlet />
				</section>
			</div>
		</div>
	);
}
