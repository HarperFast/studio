import { Link, ParsedLocation, useLocation } from '@tanstack/react-router';
import { HomeIcon } from 'lucide-react';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBreadcrumbs(location: ParsedLocation<any>) {

	const route_history = location.pathname.split('/').filter((x) => x && x.length > 0);

	return route_history.map((route, index) => {
		const path = `/${route_history.slice(0, index + 1).join('/')}`;
		return { name: route, path };
	});
}

export function SubNavMenu({ children }: { children?: React.ReactNode }) {
	const location = useLocation();

	const breadcrumb_routes = createBreadcrumbs(location);
	
  //NOTE: Removes the organization id from the breadcrumb
	breadcrumb_routes.splice(1, 1);

	return (
		<nav className="fixed top-20 w-full  md:h-12 z-39 py-2 px-4 md:px-12 bg-grey-700">
			<div className="md:flex items-center h-full space-x-8">
				<ol role="list" className="flex items-center space-x-0 md:space-x-4 pb-2">
					<li>
						<div>
							<Link to="/">
								<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
								<span className="sr-only">Home</span>
							</Link>
						</div>
					</li>
					{breadcrumb_routes.map((page) => (
						<li key={page.name}>
							<div className="flex items-center">
								<svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-grey">
									<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
								</svg>
								<Link
									to={page.path}
									aria-current={page.name ? 'page' : undefined}
									className="ml-4 text-xs md:text-sm font-medium hover:text-grey"
								>
									{page.name}
								</Link>
							</div>
						</li>
					))}
				</ol>
				{children}
			</div>
		</nav>
	);
}
