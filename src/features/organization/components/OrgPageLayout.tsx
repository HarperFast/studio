import { SubNavItem, SubNavRail } from '@/components/SubNavRail';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useParams } from '@tanstack/react-router';
import { CreditCardIcon, ServerIcon, SettingsIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import { ReactNode } from 'react';

/**
 * Shared shell for the org-level pages (clusters, users, roles, billing, settings). Renders a
 * responsive sub-nav — a left rail when there's room, a dropdown when small — so Users/Roles/Billing/
 * Settings are discoverable from the org page instead of only the global header. Items are gated by
 * the same permissions the org card menu uses; Billing expands to its sub-pages when active.
 */
export function OrgPageLayout({ children }: { children: ReactNode }) {
	const { organizationId } = useParams({ strict: false }) as { organizationId?: string };
	const { view: canViewUsersAndRoles } = useOrganizationRolePermissions(organizationId);
	const { update: canManageOrg } = useOrganizationPermissions(organizationId);
	const base = `/${organizationId}`;

	const items = [
		{ to: base, label: 'Clusters', icon: ServerIcon, exact: true },
		canViewUsersAndRoles && { to: `${base}/users`, label: 'Users', icon: UsersIcon },
		canViewUsersAndRoles && { to: `${base}/roles`, label: 'Roles', icon: ShieldCheckIcon },
		canManageOrg && {
			to: `${base}/billing`,
			label: 'Billing',
			icon: CreditCardIcon,
			children: [
				{ to: `${base}/billing`, label: 'Payment Method', exact: true },
				{ to: `${base}/billing/invoices`, label: 'Invoices' },
			],
		},
		canManageOrg && { to: `${base}/settings`, label: 'Settings', icon: SettingsIcon },
	].filter(Boolean) as SubNavItem[];

	return (
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
			<div className="md:grid gap-6 md:grid-cols-12">
				<aside className="md:col-span-3 lg:col-span-2 mb-4 md:mb-0">
					<SubNavRail items={items} ariaLabel="Organization sections" />
				</aside>
				<section className="md:col-span-9 lg:col-span-10 min-w-0">{children}</section>
			</div>
		</div>
	);
}
