'use client';
import { NavigationMenu } from '@/components/ui/navigation/NavigationMenu';
import { NavigationMenuItem } from '@/components/ui/navigation/NavigationMenuItem';
import { NavigationMenuLink } from '@/components/ui/navigation/NavigationMenuLink';
import { NavigationMenuList } from '@/components/ui/navigation/NavigationMenuList';
import { Version } from '@/components/Version';
import { defaultInstanceRoute, isLocalStudio } from '@/config/constants';
import { useLogoutMutation } from '@/features/auth/hooks/useLogout';
import { useOverallAuth } from '@/hooks/useAuth';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
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
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

const activeLinkProps = { className: 'text-white' };

function MobileNav({ signOut }: { signOut: () => void }) {
	const { user } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	const { organizationId }: { organizationId: string; } = useParams({ strict: false });
	const { update: canUpdateOrganization } = useOrganizationPermissions(organizationId);
	const { view: showOrgUsersAndRoles } = useOrganizationRolePermissions(organizationId);
	const showBilling = canUpdateOrganization;
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	return (
		<div className="md:hidden" id="mobile-menu">
			<div className="flex items-center justify-between">
				<Link to={isLocalStudio ? defaultInstanceRoute : defaultCloudRoute}>
					<Logo />
					<Version />
				</Link>
				<button
					type="button"
					className="shadow-xs text-grey-400 hover:text-white hover:bg-black-dark"
					onClick={() => {
						setIsMenuOpen(!isMenuOpen);
					}}
				>
					<span className="sr-only">{isMenuOpen ? 'Close menu' : 'Open menu'}</span>
					{isMenuOpen ? <X /> : <Menu />}
				</button>
			</div>
			<div
				className={`${
					isMenuOpen ? 'block' : 'hidden'
				} md:hidden space-y-1 pb-3 bg-black-dark absolute left-0 top-full w-full rounded-b-md`}
			>
				{!isLocalStudio && (
					<>
						<Link
							to="/"
							className="flex flex-row px-3 py-2 text-base font-medium text-white bg-gray-900 rounded-md"
							activeProps={activeLinkProps}
						>
							<BuildingIcon className="mr-4" /> Organizations
						</Link>
						{(showOrgUsersAndRoles || showBilling) ? (
							<div className="bg-black rounded-2xl">
								{showOrgUsersAndRoles && (<Link
									to={`/${organizationId}/roles`}
									className="flex flex-row px-3 py-2 text-base text-gray-300 font-medium rounded-md"
									activeProps={activeLinkProps}
								>
									<HandshakeIcon className="mr-4" /> Roles
								</Link>)}
								{showOrgUsersAndRoles && (<Link
									to={`/${organizationId}/users`}
									className="flex flex-row px-3 py-2 text-base text-gray-300 font-medium rounded-md"
									activeProps={activeLinkProps}
								>
									<UsersIcon className="mr-4" /> Users
								</Link>)}
								{showBilling && (<Link
									to={`/${organizationId}/billing`}
									className="flex flex-row px-3 py-2 text-base text-gray-300 font-medium rounded-md"
									activeProps={activeLinkProps}
								>
									<ReceiptIcon className="mr-4" /> Billing
								</Link>)}
							</div>
						) : (
							''
						)}
					</>
				)}
				{!isLocalStudio && (
					<Link
						to="/profile"
						className="flex flex-row items-center px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
					>
						<UserIcon className="mr-4" />
						Profile
					</Link>
				)}
				<Link
					to="https://docs.harperdb.io/docs"
					target="_blank"
					rel="noreferrer noopener"
					className="flex flex-row px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					<BookOpenTextIcon className="mr-4" /> Docs
				</Link>
				<Link
					to={undefined}
					onClick={signOut}
					className="flex flex-row px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					<LogOutIcon className="mr-4" /> Sign Out
				</Link>
			</div>
		</div>
	);
}

function DesktopNav({ signOut }: { signOut: () => void }) {
	const { user } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	const { organizationId }: { organizationId: string; } = useParams({ strict: false });
	const { update: canUpdateOrganization } = useOrganizationPermissions(organizationId);
	const { view: showOrgUsersAndRoles } = useOrganizationRolePermissions(organizationId);
	const showBilling = canUpdateOrganization;

	return (
		<div className="hidden md:block">
			<div className="flex items-center justify-between">
				<div className="inline-block">
					<Link to={isLocalStudio ? defaultInstanceRoute : defaultCloudRoute}>
						<Logo />
						<Version />
					</Link>
				</div>
				<NavigationMenu>
					<NavigationMenuList className="text-grey-400">
						{!isLocalStudio && (
							<>
								<NavigationMenuItem>
									<NavigationMenuLink asChild>
										<Link to="/" className="flex-row items-center" activeProps={activeLinkProps}>
											<BuildingIcon />
											<span className="hidden xl:inline-block">Organizations</span>
										</Link>
									</NavigationMenuLink>
								</NavigationMenuItem>
								{(showOrgUsersAndRoles || showBilling) ? (
									<div className="bg-black rounded-2xl flex">
										{showOrgUsersAndRoles && (<NavigationMenuItem>
											<NavigationMenuLink asChild>
												<Link
													to={`/${organizationId}/roles`}
													className="flex-row items-center"
													activeProps={activeLinkProps}
												>
													<HandshakeIcon className="inline-block" />
													<span className="hidden xl:inline-block">Roles</span>
													<span className="xl:hidden">&nbsp;</span>
												</Link>
											</NavigationMenuLink>
										</NavigationMenuItem>)}
										{showOrgUsersAndRoles && (<NavigationMenuItem>
											<NavigationMenuLink asChild>
												<Link
													to={`/${organizationId}/users`}
													className="flex-row items-center"
													activeProps={activeLinkProps}
												>
													<UsersIcon className="inline-block" />
													<span className="hidden xl:inline-block">Users</span>
													<span className="xl:hidden">&nbsp;</span>
												</Link>
											</NavigationMenuLink>
										</NavigationMenuItem>)}
										{showBilling && (<NavigationMenuItem>
											<NavigationMenuLink asChild>
												<Link
													to={`/${organizationId}/billing`}
													className="flex-row items-center"
													activeProps={activeLinkProps}
												>
													<ReceiptIcon className="inline-block" />
													<span className="hidden xl:inline-block">Billing</span>
													<span className="xl:hidden">&nbsp;</span>
												</Link>
											</NavigationMenuLink>
										</NavigationMenuItem>)}
									</div>
								) : (
									''
								)}
							</>
						)}
						{!isLocalStudio && (
							<NavigationMenuItem>
								<NavigationMenuLink asChild>
									<Link to="/profile" className="flex-row items-center" activeProps={activeLinkProps}>
										<UserIcon /> <span className="hidden lg:inline-block">Profile</span>
									</Link>
								</NavigationMenuLink>
							</NavigationMenuItem>
						)}
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link
									to="https://docs.harperdb.io/docs"
									target="_blank"
									rel="noreferrer noopener"
									className="flex-row items-center"
								>
									<BookOpenTextIcon /> <span className="hidden lg:inline-block">Docs</span>
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to={undefined} onClick={signOut} className="flex-row items-center">
									<LogOutIcon /> <span className="hidden lg:inline-block">Sign Out</span>
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
					</NavigationMenuList>
				</NavigationMenu>
			</div>
		</div>
	);
}

function AnonymousNav() {
	return (
		<div className="flex items-center justify-between">
			<div className="inline-block">
				<Link to="/sign-in">
					<Logo />
					<Version />
				</Link>
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

function Logo() {
	return (
		<>
			{isLocalStudio ? (
				<img src="/harper-studio_white.png" alt="Harper Studio" className="w-64 hidden md:inline-block" />
			) : (
				<img src="/harper-fabric_white.png" alt="Harper Fabric" className="w-64 hidden md:inline-block" />
			)}
			<img src="/HDBDogOnly.svg" width="50px" height="44px" alt="Harper" className="inline-block md:hidden" />
		</>
	);
}

export function Navbar() {
	const { mutate: signOut } = useLogoutMutation();
	const navigate = useNavigate();
	const { user } = useOverallAuth();
	const router = useRouter();
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
	if (!user) {
		return <AnonymousNav />;
	}
	return (
		<>
			<MobileNav signOut={handleSignOut} />
			<DesktopNav signOut={handleSignOut} />
		</>
	);
}
