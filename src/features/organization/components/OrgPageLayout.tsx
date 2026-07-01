import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import { ChevronDown, CreditCardIcon, ServerIcon, SettingsIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import { ComponentType, ReactNode } from 'react';

interface OrgNavItem {
	to: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	exact?: boolean;
}

/**
 * Shared shell for the org-level pages (clusters, users, roles, billing, settings). Renders a
 * responsive sub-nav — a left rail when there's room, a dropdown when small — so Users/Roles/Billing/
 * Settings are discoverable from the org page instead of only the global header. Items are gated by
 * the same permissions the org card menu uses.
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
		canManageOrg && { to: `${base}/billing`, label: 'Billing', icon: CreditCardIcon },
		canManageOrg && { to: `${base}/settings`, label: 'Settings', icon: SettingsIcon },
	].filter(Boolean) as OrgNavItem[];

	return (
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
			<div className="md:grid gap-6 md:grid-cols-12">
				<aside className="md:col-span-3 lg:col-span-2 mb-4 md:mb-0">
					<OrgSubNav items={items} />
				</aside>
				<section className="md:col-span-9 lg:col-span-10 min-w-0">{children}</section>
			</div>
		</div>
	);
}

const linkClasses = 'flex items-center gap-3 p-2 rounded-lg text-sm transition-colors';
const inactiveProps = { className: 'text-foreground hover:bg-accent dark:text-white dark:hover:bg-grey-700' };
const activeProps = {
	className: 'font-medium text-primary bg-primary/10 dark:text-white dark:bg-white/10 pointer-events-none',
};

function OrgSubNav({ items }: { items: OrgNavItem[] }) {
	const { pathname } = useLocation();
	const active = items.find((item) => item.exact ? pathname === item.to : pathname.startsWith(item.to)) ?? items[0];
	const ActiveIcon = active.icon;

	return (
		<>
			<nav className="hidden md:flex flex-col gap-1" aria-label="Organization sections">
				{items.map((item) => {
					const Icon = item.icon;
					return (
						<Link
							key={item.to}
							to={item.to}
							className={linkClasses}
							activeOptions={{ exact: !!item.exact }}
							activeProps={activeProps}
							inactiveProps={inactiveProps}
						>
							<Icon className="size-4 shrink-0" />
							{item.label}
						</Link>
					);
				})}
			</nav>

			<div className="md:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="w-full justify-between">
							<span className="flex items-center gap-2">
								<ActiveIcon className="size-4" />
								{active.label}
							</span>
							<ChevronDown className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
						{items.map((item) => {
							const Icon = item.icon;
							return (
								<DropdownMenuItem key={item.to} asChild>
									<Link to={item.to} className="flex items-center gap-2">
										<Icon className="size-4" />
										{item.label}
									</Link>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
