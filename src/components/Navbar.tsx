import { MainLogo } from '@/components/MainLogo';
import { NavigationMenu } from '@/components/ui/navigation/NavigationMenu';
import { NavigationMenuItem } from '@/components/ui/navigation/NavigationMenuItem';
import { NavigationMenuLink } from '@/components/ui/navigation/NavigationMenuLink';
import { NavigationMenuList } from '@/components/ui/navigation/NavigationMenuList';
import { Version } from '@/components/Version';
import { defaultInstanceRoute, isLocalStudio } from '@/config/constants';
import { useLogoutMutation } from '@/features/auth/hooks/useLogout';
import { useOverallAuth } from '@/hooks/useAuth';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { Link, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import {
	BookOpenTextIcon,
	BuildingIcon,
	HandshakeIcon,
	LogInIcon,
	LogOutIcon,
	Menu,
	ReceiptIcon,
	UserIcon,
	UsersIcon,
	X,
} from 'lucide-react';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

const activeLinkProps = { className: 'text-white' };

export function Navbar() {
	const { mutate: signOut } = useLogoutMutation();
	const navigate = useNavigate();
	const { user } = useOverallAuth();
	const router = useRouter();
	const { organizationId }: { organizationId: string; } = useParams({ strict: false });
	const { update: canUpdateOrganization } = useOrganizationPermissions(organizationId);
	const { view: showOrgUsersAndRoles } = useOrganizationRolePermissions(organizationId);
	const showBilling = canUpdateOrganization;

	const handleSignOut = useCallback(() => {
		signOut(undefined, {
			onSuccess: async () => {
				toast.success('Success', {
					description: 'You have been signed out successfully.',
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				void navigate({ to: '/sign-in' });
				void router.invalidate();
			},
		});
	}, [signOut, router, navigate]);

	const menuItems: Array<MenuGroup | MenuItem> = useMemo(
		() => [
			!isLocalStudio && {
				to: '/',
				icon: <BuildingIcon />,
				text: 'Organizations',
				textBreakpoint: 'xl',
			},
			!isLocalStudio && {
				text: 'SubOrganizations',
				items: [
					showOrgUsersAndRoles && {
						to: `/${organizationId}/roles`,
						icon: <HandshakeIcon />,
						text: 'Roles',
						textBreakpoint: 'lg',
					},
					showOrgUsersAndRoles && {
						to: `/${organizationId}/users`,
						icon: <UsersIcon />,
						text: 'Users',
						textBreakpoint: 'lg',
					},
					showBilling && {
						to: `/${organizationId}/billing`,
						icon: <ReceiptIcon />,
						text: 'Billing',
						textBreakpoint: 'xl',
					},
				].filter(excludeFalsy),
			},
			!isLocalStudio && {
				to: '/profile',
				icon: <UserIcon />,
				text: 'Profile',
				textBreakpoint: 'xl',
			},
			{
				to: 'https://docs.harperdb.io/docs',
				target: '_blank',
				icon: <BookOpenTextIcon />,
				text: 'Docs',
				textBreakpoint: isLocalStudio ? 'md' : 'xl',
			},
			{
				onClick: handleSignOut,
				icon: <LogOutIcon />,
				text: 'Sign Out',
				textBreakpoint: isLocalStudio ? 'md' : 'xl',
			},
		].filter(excludeFalsy) satisfies Array<MenuGroup | MenuItem>,
		[organizationId, showBilling, showOrgUsersAndRoles, handleSignOut],
	);

	if (!user) {
		return <AnonymousNav />;
	}
	return (
		<>
			<MobileNav menuItems={menuItems} />
			<DesktopNav menuItems={menuItems} />
		</>
	);
}

interface MenuGroup {
	text: string;
	items: MenuItem[];
}

interface MenuItem {
	to?: string;
	onClick?: () => void;
	icon: ReactNode;
	text: string;
	textBreakpoint?: string;
}

function isMenuGroup(item: MenuGroup | MenuItem): item is MenuGroup {
	return (item as MenuGroup).items !== undefined;
}

function AnonymousNav() {
	return (
		<div className="flex items-center justify-between">
			<div className="inline-block">
				<Link to="/sign-in">
					<MainLogo />
				</Link>
				<Version />
			</div>
			<NavigationMenu>
				<NavigationMenuList className="text-grey-400">
					<NavigationMenuItem>
						<NavigationMenuLink asChild>
							<Link
								to="https://docs.harperdb.io/docs"
								target="_blank"
								rel="noreferrer noopener"
								className="flex-row items-center"
							>
								<BookOpenTextIcon /> <span className="hidden md:inline-block">Docs</span>
							</Link>
						</NavigationMenuLink>
					</NavigationMenuItem>
					<NavigationMenuItem>
						<NavigationMenuLink asChild>
							<Link to="/sign-in" className="flex-row items-center" activeProps={activeLinkProps}>
								<LogInIcon /> Sign In
							</Link>
						</NavigationMenuLink>
					</NavigationMenuItem>
				</NavigationMenuList>
			</NavigationMenu>
		</div>
	);
}

function DesktopNav({ menuItems }: { menuItems: Array<MenuGroup | MenuItem> }) {
	const { user } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);

	return (
		<div className="hidden md:block">
			<div className="flex items-center justify-between">
				<div className="inline-block">
					<Link to={isLocalStudio ? defaultInstanceRoute : defaultCloudRoute}>
						<MainLogo />
					</Link>
					<Version />
				</div>
				<NavigationMenu>
					<NavigationMenuList className="text-grey-400">
						{menuItems.map(menuItem => isMenuGroup(menuItem)
							? !!menuItem.items.length && (
							<div key={menuItem.text} className="bg-black rounded-2xl flex">
								{menuItem.items.map(innerMenuItem => (
									<DesktopNavItem key={innerMenuItem.text} menuItem={innerMenuItem} />
								))}
							</div>
						)
							: (
								<DesktopNavItem key={menuItem.text} menuItem={menuItem} />
							))}
					</NavigationMenuList>
				</NavigationMenu>
			</div>
		</div>
	);
}

function DesktopNavItem({ menuItem }: { menuItem: MenuItem }) {
	return (
		<NavigationMenuItem className="text-gray-400 hover:text-white">
			<NavigationMenuLink asChild>
				<Link
					to={menuItem.to}
					onClick={menuItem.onClick}
					className="flex-row items-center"
					activeProps={menuItem.to ? activeLinkProps : undefined}
				>
					{menuItem.icon}
					<span className={`hidden ${menuItem.textBreakpoint}:inline-block`}>{menuItem.text}</span>
					<span className={`${menuItem.textBreakpoint}:hidden`}>&nbsp;</span>
				</Link>
			</NavigationMenuLink>
		</NavigationMenuItem>
	);
}

function MobileNav({ menuItems }: { menuItems: Array<MenuGroup | MenuItem> }) {
	const { user } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const toggleMenu = useCallback(() => setIsMenuOpen(open => !open), []);
	const closeMenu = useCallback(() => setIsMenuOpen(false), []);

	return (
		<div className="md:hidden" id="mobile-menu">
			<div className="flex items-center justify-between">
				<Link to={isLocalStudio ? defaultInstanceRoute : defaultCloudRoute}>
					<MainLogo />
				</Link>
				<Version />
				<button
					type="button"
					className="shadow-xs text-grey-400 hover:text-white hover:bg-black-dark"
					onClick={toggleMenu}
				>
					<span className="sr-only">{isMenuOpen ? 'Close menu' : 'Open menu'}</span>
					{isMenuOpen ? <X /> : <Menu />}
				</button>
			</div>
			<div className={`${isMenuOpen ? 'fixed' : 'hidden'} top-40 bottom-0 left-0 right-0 bg-black-dark opacity-70`} onClick={closeMenu}></div>
			<div
				className={`${
					isMenuOpen ? 'block' : 'hidden'
				} md:hidden z-50 space-y-1 pb-3 bg-black-dark absolute left-0 top-full w-full rounded-b-md`}
			>
				{menuItems.map(menuItem => isMenuGroup(menuItem)
					? !!menuItem.items.length && (
					<div key={menuItem.text} className="bg-black pl-10 pr-2 py-2">
						{menuItem.items.map(innerMenuItem => (
							<MobileNavItem key={innerMenuItem.text} menuItem={innerMenuItem} onClick={closeMenu} />
						))}
					</div>
				)
					: (
						<MobileNavItem key={menuItem.text} menuItem={menuItem} onClick={closeMenu} />
					))}
			</div>
		</div>
	);
}

function MobileNavItem({ menuItem, onClick }: { menuItem: MenuItem, onClick: () => void }) {
	const linkOnClick = useCallback(() => {
		menuItem.onClick?.();
		onClick();
	}, [menuItem, onClick]);
	return (
		<Link
			to={menuItem.to}
			onClick={linkOnClick}
			className="flex flex-row px-3 py-2 text-base font-medium rounded-md text-gray-400 hover:text-white"
			activeProps={menuItem.to ? activeLinkProps : undefined}
		>
			{menuItem.icon}
			<span className="ml-4">
				{menuItem.text}
			</span>
		</Link>
	);
}

