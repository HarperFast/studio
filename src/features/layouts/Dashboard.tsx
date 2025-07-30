import { Outlet } from '@tanstack/react-router';
import { Navbar } from '@/components/Navbar';
import { Loading } from '@/components/Loading';
import { useAuth } from '@/hooks/useAuth';

export function Dashboard() {
	const { isLoading: isUserLoading } = useAuth();

	if (isUserLoading) {
		return <Loading className="fixed z-50 translate-1/2" />;
	}

	return (
		<>
			<header className="fixed top-0 z-40 w-full h-20 p-4 bg-black-dark dark:bg-black-dark dark:border-b dark:border-black md:px-12">
				<Navbar />
			</header>
			<main>
				<Outlet />
				<span className="absolute bottom-4 right-4 text-sm text-white-500">
					Harper Studio v{import.meta.env.VITE_STUDIO_VERSION}
				</span>
			</main>
		</>
	);
}
