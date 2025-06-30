'use client';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { Menu, X } from 'lucide-react';

import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
} from '@/components/ui/navigation-menu';
import { useSignOutMutation } from '@/features/auth/hooks/useSignOut';
import { useAuthenticationContext } from '@/hooks/use-authentication-context';
import { queryClient } from '@/react-query/queryClient';
import { toast } from 'sonner';

function MobileNav({ signOut }: { signOut: () => void }) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	return (
		<div className="md:hidden" id="mobile-menu">
			<div className="flex items-center justify-between">
				<Link to="/orgs">
					<img src="/logo_harper_db_studio.png" alt="logo" className="w-64" />
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
				<Link to="/orgs" className="block px-3 py-2 text-base font-medium text-white bg-gray-900 rounded-md">
					Organizations
				</Link>
				<Link
					to="/profile"
					className="block px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					Profile
				</Link>
				<Link
					to="/docs"
					className="block px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					Resources
				</Link>
				<Link
					to="#"
					className="block px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					Theme
				</Link>
				<Link
					to={undefined}
					onClick={signOut}
					className="block px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white"
				>
					Sign Out
				</Link>
			</div>
		</div>
	);
}

const DesktopNav = ({ signOut }: { signOut: () => void }) => {
	return (
		<div className="hidden md:block">
			<div className="flex items-center justify-between">
				<div className="inline-block">
					<Link to="/orgs">
						<img src="/logo_harper_db_studio.png" alt="logo" className="w-64" />
					</Link>
				</div>
				<NavigationMenu>
					<NavigationMenuList className="text-grey-400">
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to="/orgs" activeProps={{ className: 'font-bold text-white' }}>
									Organizations
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to="/profile" activeProps={{ className: 'font-bold text-white' }}>
									Profile
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to="https://docs.harperdb.io/docs" target="_blank" rel="noreferrer noopener">
									Resources
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink asChild>
								<Link to={undefined} onClick={signOut}>
									Sign Out
								</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
					</NavigationMenuList>
				</NavigationMenu>
			</div>
		</div>
	);
};

export function NavBar() {
	const { mutate: signOut } = useSignOutMutation();
	const navigate = useNavigate();
	const { setUser } = useAuthenticationContext();
	const router = useRouter();
	const handleSignOut = useCallback(() => {
		signOut(undefined, {
			onSuccess: async () => {
				const loadingId = toast.loading('Signing out');
				setUser(null);
				queryClient.getQueryCache().clear();
				await queryClient.invalidateQueries();
				router.invalidate();
				await navigate({ to: '/' });
				toast.dismiss(loadingId);
				toast.success('Success', {
					description: 'You have been signed out successfully.',
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	}, [signOut, setUser, router, navigate]);
	return (
		<>
			<MobileNav signOut={handleSignOut} />
			<DesktopNav signOut={handleSignOut} />
		</>
	);
}
