import { Navbar } from '@/components/Navbar';
import { Outlet } from '@tanstack/react-router';

export function AuthLayout() {
	return (
		<>
			<header className="fixed top-0 z-40 w-full h-20 p-4 bg-black-dark dark:bg-black-dark dark:border-b dark:border-black md:px-12">
				<Navbar />
			</header>
			<div className="pt-20 grid h-screen grid-cols-1 md:grid-cols-2">
				<section className="items-center justify-center hidden text-white md:flex px-6 fabricSignupTextContainer">
					<img
						className="object-scale-down max-h-[calc(100vh-80px-40px)] min-h-115"
						src="/fabric-signup-text.png"
						alt="One Runtime: App, database, Cache and Messaging. Distributed by design, free to deploy, and live in minutes. Deploy!"
					/>
				</section>
				<section className="flex items-center justify-center px-6 bg-linear-(--purple-gradient) dark:bg-linear-(--black-dark-gradient)">
					<Outlet />
				</section>
			</div>
		</>
	);
}
