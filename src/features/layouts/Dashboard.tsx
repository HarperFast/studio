import { Outlet, Navigate } from '@tanstack/react-router';
import { useGetCurrentUser } from '@/hooks/useGetCurrentUser';
import { NavBar } from '@/components/Navbar';
import Loading from '@/components/Loading';
// import { useUserInfoMutation } from '@/hooks/instance/useUserInfo';
// import { useEffect } from 'react';

// const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';

function Dashboard() {
	const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
	// const { mutate: submitUserInfoData, data: userInfo, isPending: isUserInfoLoading } = useUserInfoMutation();

	// useEffect(() => {
	// 	if (isLocalStudio && !userInfo && !isUserInfoLoading) {
	// 		submitUserInfoData();
	// 	}
	// }, [isUserInfoLoading, submitUserInfoData, userInfo]);

	if (!user && !isUserLoading) {
		return <Navigate to="/" />;
	}

	if (isUserLoading) {
		return <Loading className="fixed z-50 translate-1/2" />;
	}

	return (
		<div>
			<header className="sticky top-0 z-40 w-full h-20 px-4 py-4 bg-black-dark dark:bg-black-dark dark:border-b dark:border-black md:px-12">
				<NavBar />
			</header>
			<main className="min-h-[calc(100vh-theme(spacing.20))]">
				<Outlet />
			</main>
		</div>
	);
}

export default Dashboard;
