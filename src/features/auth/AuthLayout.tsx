import { Navbar } from '@/components/Navbar';
import { Outlet } from '@tanstack/react-router';

function ListItem({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<li className="list-image-(--checkmark-icon) mt-4">
			<h3 className="text-xl font-bold">{title}</h3>
			{children}
		</li>
	);
}

export function AuthLayout() {
	return (
		<>
			<header className="fixed top-0 z-40 w-full h-20 p-4 bg-black-dark dark:bg-black-dark dark:border-b dark:border-black md:px-12">
				<Navbar />
			</header>
			<div className="pt-20 grid h-screen grid-cols-1 md:grid-cols-2">
				<section className="items-center justify-center hidden text-white md:flex bg-linear-(--blue-pink-gradient) px-6">
					<div>
						<h1 className="text-4xl font-bold">Harper Fabric</h1>
						<ul className="ps-5">

							<ListItem title="Global Deployments Managed as One">
								<span>Coordinate global environments as if they were a single node.</span>
							</ListItem>

							<ListItem title="Database, App, Cache, & Messaging">
								<span>Bring your stack together for reliable, ultra-fast performance.</span>
							</ListItem>

							<ListItem title="NoSQL, Vector, & Blob">
								<span>Store and serve modern data types with low latency and global reach.</span>
							</ListItem>

							<ListItem title="Simplified Operations">
								<span>Focus on what differentiates your app; leave infrastructure to us.</span>
							</ListItem>
						</ul>

						<span className="opacity-5">Bravo!</span>
					</div>
				</section>
				<section className="flex items-center justify-center px-6 bg-linear-(--purple-gradient) dark:bg-linear-(--black-dark-gradient)">
					<Outlet />
				</section>
			</div>
		</>
	);
}
