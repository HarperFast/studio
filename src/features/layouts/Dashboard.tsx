import { Outlet } from '@tanstack/react-router';
import { useAuthenticationContext } from '@/hooks/useAuthenticationContext';
import { Navbar } from '@/components/Navbar';
import { Loading } from '@/components/Loading';
// import { useUserInfoMutation } from '@/hooks/instance/useUserInfo';
// import { useEffect } from 'react';

export function Dashboard() {
	const { isLoading: isUserLoading } = useAuthenticationContext();
	// const { mutate: submitUserInfoData, data: userInfo, isPending: isUserInfoLoading } = useUserInfoMutation();

	// useEffect(() => {
	// 	if (isLocalStudio && !userInfo && !isUserInfoLoading) {
	// 		submitUserInfoData();
	// 	}
	// }, [isUserInfoLoading, submitUserInfoData, userInfo]);

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
