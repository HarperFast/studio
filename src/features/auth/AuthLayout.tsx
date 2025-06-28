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
		<div className="grid h-screen grid-cols-1 md:grid-cols-2">
			<section className="items-center justify-center hidden text-white md:flex bg-linear-(--blue-pink-gradient) px-6">
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
			<section className="flex items-center justify-center px-6 bg-linear-(--purple-gradient) dark:bg-linear-(--black-dark-gradient)">
				<Outlet />
			</section>
			<button
				className="fixed p-2 text-white bg-blue-400 rounded-md bottom-4 right-4"
				onClick={() => {
					document.documentElement.classList.toggle('dark');
					localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
				}}
			>
				Toggle Theme
			</button>
		</div>
	);
}


