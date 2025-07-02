import { Outlet } from '@tanstack/react-router';
import { Navbar } from '@/components/Navbar';

function ListItem({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<li className="list-image-(--checkmark-icon) mt-4">
			<h3 className="text-xl font-bold">{title}</h3>
			{children}
		</li>
	);
}

export function AuthLayout() {
	return <>
		<header
			className="fixed top-0 z-40 w-full h-20 p-4 bg-black-dark dark:bg-black-dark dark:border-b dark:border-black md:px-12">
			<Navbar />
		</header>
		<div className="mt-20 grid h-screen grid-cols-1 md:grid-cols-2">
			<section
				className="items-center justify-center hidden text-white md:flex bg-linear-(--blue-pink-gradient) px-6">
				<div>
					<h1 className="text-4xl font-bold">Harper Studio</h1>
					<span>Manage all your Harper instances.</span>
					<ul className="ps-5">
						<ListItem title="Manage All Instances">
							<span>View, create, and delete instances from one location.</span>
						</ListItem>
						<ListItem title="Embedded API Server">
							<span>Harper components give you unlimited application flexibility</span>
						</ListItem>

						<ListItem
							title="Fully Managed Cloud & 5G Instances"
							children={<span>Go from zero to code in minutes.</span>}
						/>
						<ListItem
							title="Deploy Anywhere"
							children={
								<div className="mt-6">
									<a
										href="https://hub.docker.com/r/harperdb/harperdb"
										target="_blank"
										rel="noreferrer noopener"
										className="p-2 mr-2 border-2 border-blue-100 rounded-md"
									>
										Docker
									</a>
									<a
										href="https://www.npmjs.com/package/harperdb"
										target="_blank"
										rel="noreferrer noopener"
										className="p-2 mr-2 border-2 border-blue-100 rounded-md"
									>
										npm
									</a>
									<a
										href="https://docs.harperdb.io/docs/deployments/install-harperdb"
										target="_blank"
										rel="noreferrer noopener"
										className="p-2 border-2 border-blue-100 rounded-md"
									>
										all options
									</a>
								</div>
							}
						/>
					</ul>
				</div>
			</section>
			<section
				className="flex items-center justify-center px-6 bg-linear-(--purple-gradient) dark:bg-linear-(--black-dark-gradient)">
				<Outlet />
			</section>
		</div>
	</>;
}


