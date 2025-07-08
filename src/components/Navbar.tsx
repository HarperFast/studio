'use client';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { BookMarkedIcon, BuildingIcon, LogInIcon, LogOutIcon, Menu, MoonIcon, UserIcon, X } from 'lucide-react';

import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
} from '@/components/ui/navigationMenu';
import { useSignOutMutation } from '@/features/auth/hooks/useSignOut';
import { toast } from 'sonner';
import { notYetImplemented } from '@/lib/notYetImplemented';
import { isLocalStudio } from '@/config/constants';
import { useInstanceLogoutMutation } from '@/features/auth/hooks/useInstanceLogoutMutation';
import { useAuth } from '@/hooks/useAuth';

const activeLinkProps = { className: 'text-white' };

function MobileNav({ signOut }: { signOut: () => void }) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	return (
		<div className="md:hidden" id="mobile-menu">
			<div className="flex items-center justify-between">
				<Link to={ isLocalStudio ? "/browse" : "/orgs" }><Logo /></Link>
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
				{!isLocalStudio && <Link
									to="/orgs"
									className="flex flex-row px-3 py-2 text-base font-medium text-white bg-gray-900 rounded-md">
									<BuildingIcon className="mr-4" />
									Organizations
								</Link>}
				{!isLocalStudio && <Link
									to="/profile"
									className="flex flex-row items-center px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
								>
									<UserIcon className="mr-4" />
									Profile
								</Link>}
				<Link
					to="/docs"
					className="flex flex-row px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					<BookMarkedIcon className="mr-4" /> Resources
				</Link>
				<Link
					to="#"
					className="flex flex-row px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
					onClick={notYetImplemented}
				>
					<MoonIcon className="mr-4" /> Theme
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
	return (
		<div className="hidden md:block">
			<div className="flex items-center justify-between">
				<div className="inline-block">
					<Link to={ isLocalStudio ? "/browse" : "/orgs" }><Logo /></Link>
				</div>
				<NavigationMenu>
					<NavigationMenuList className="text-grey-400">
						{!isLocalStudio && <NavigationMenuItem>
													<NavigationMenuLink asChild>
														<Link to="/orgs" className="flex-row items-center" activeProps={activeLinkProps}>
															<BuildingIcon /> Organizations
														</Link>
													</NavigationMenuLink>
												</NavigationMenuItem>}
						{!isLocalStudio && <NavigationMenuItem>
													<NavigationMenuLink asChild>
														<Link to="/profile" className="flex-row items-center" activeProps={activeLinkProps}>
															<UserIcon /> <span className="hidden lg:inline-block">Profile</span>
														</Link>
													</NavigationMenuLink>
												</NavigationMenuItem>}
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to="https://docs.harperdb.io/docs" target="_blank" rel="noreferrer noopener"
									  className="flex-row items-center">
									<BookMarkedIcon /> <span className="hidden lg:inline-block">Resources</span>
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to={undefined} onClick={notYetImplemented} className="flex-row items-center">
									<MoonIcon /> <span className="hidden lg:inline-block">Theme</span>
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to={undefined} onClick={signOut} className="flex-row items-center">
									<LogOutIcon /> Sign Out
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
				<Link to="/"><Logo /></Link>
			</div>
			<NavigationMenu>
				<NavigationMenuList className="text-grey-400">
					<NavigationMenuItem>
						<NavigationMenuLink asChild>
							<Link to="https://docs.harperdb.io/docs" target="_blank" rel="noreferrer noopener"
								  className="flex-row items-center">
								<BookMarkedIcon /> <span className="hidden md:inline-block">Resources</span>
							</Link>
						</NavigationMenuLink>
					</NavigationMenuItem>
					<NavigationMenuItem>
						<NavigationMenuLink asChild>
							<Link to={undefined} onClick={toggleTheme} className="flex-row items-center">
								<MoonIcon /> <span className="hidden md:inline-block">Theme</span>
							</Link>
						</NavigationMenuLink>
					</NavigationMenuItem>
					<NavigationMenuItem>
						<NavigationMenuLink asChild>
							<Link to="/" className="flex-row items-center" activeProps={activeLinkProps}>
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
	return <>
		<img src="/logo_harper_db_studio.png" alt="logo" className="w-64 hidden md:block" />
		<img src="/HDBDogOnly.svg" width="50px" height="44px" alt="Harper" className="inline-block md:hidden" />
	</>;
}

const useSignOut = isLocalStudio ? useInstanceLogoutMutation : useSignOutMutation;

export function Navbar() {
	const { mutate: signOut } = useSignOut();
	const navigate = useNavigate();
	const { user } = useAuth();
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
				await navigate({ to: '/' });
				router.invalidate();
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

function toggleTheme() {
	document.documentElement.classList.toggle('dark');
	localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}
