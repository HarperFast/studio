import { Navbar } from '@/components/Navbar';
import { Outlet } from '@tanstack/react-router';

export function AuthLayout() {
	return (
		<>
			<header className="fixed top-0 z-40 w-full h-20 p-4 bg-gradient-to-r from-violet-100 to-white border-b border-violet-200 dark:from-purple-950 dark:to-zinc-900 dark:border-purple-950 md:px-12">
				<Navbar />
			</header>
			<div className="pt-20 h-screen grid grid-cols-1 md:grid-cols-2">
				<section
					aria-label="Harper Fabric overview"
					className="items-center justify-center hidden text-white md:flex px-6 fabricSignupTextContainer"
				>
					<img
						className="object-scale-down max-h-[calc(100vh-80px-40px)] min-h-115"
						src="/fabric-signup-text.png"
						alt="One Runtime: App, database, Cache and Messaging. Distributed by design, free to deploy, and live in minutes. Deploy!"
					/>
				</section>
				<main className="overflow-y-auto px-6 bg-white dark:bg-linear-(--black-dark-gradient) border-l border-border dark:border-none">
					<div className="min-h-full flex items-start justify-center py-12">
						<Outlet />
					</div>
				</main>
			</div>
		</>
	);
}
