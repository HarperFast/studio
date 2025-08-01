import { Outlet } from '@tanstack/react-router';
import { Navbar } from '@/components/Navbar';
import { Loading } from '@/components/Loading';
import { useOverallAuth } from '@/hooks/useAuth';

export function Dashboard() {
	const { isLoading: isUserLoading } = useOverallAuth();

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
			</main>
		</>
	);
}
