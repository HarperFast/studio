import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link, useLocation, useRouteContext } from '@tanstack/react-router';
import { HomeIcon } from 'lucide-react';
import { useMemo } from 'react';

export function Breadcrumbs() {
	const location = useLocation();
	const routeContext = useRouteContext({ strict: false });
	const breadcrumbs = useMemo(() => {
		const routeHistory = location.pathname.split('/')
			.filter((x) => x && x.length > 0);

		const breadcrumbs = [
			<Link to="/">
				<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
				<span className="sr-only">Home</span>
			</Link>,
		];

		for (let index = 0; index < routeHistory.length; index++) {
			const route = routeHistory[index];
			if (route === 'instance') {
				continue;
			}

			const path = `/${routeHistory.slice(0, index + 1).join('/')}`;
			let name = capitalizeWords(route);
			let id: string | undefined;
			if (route === 'databases' && routeHistory.length === index + 3) {
				id = routeHistory[index + 1];
				name = routeHistory[index + 2];
				index += 2;
			} else if (name.startsWith('Org ')) {
				id = route.split('org-').pop();
				name = routeContext?.organization?.name || 'Org';
			} else if (name.startsWith('Clu ')) {
				id = route.split('clu-').pop();
				name = routeContext?.cluster?.name || 'Cluster';
			} else if (name.startsWith('Ins ')) {
				id = route.split('ins-').pop();
				name = 'Instance';
			}

			breadcrumbs.push(
				<svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-grey">
					<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
				</svg>,
				<Link
					to={path}
					className="text-xs md:text-sm font-medium hover:text-grey"
				>
					{name}
					{id && <div className="text-gray-500 text-xs hidden md:block">{id}</div>}
				</Link>,
			);
		}

		return breadcrumbs;
	}, [location.pathname, routeContext?.cluster?.name, routeContext?.organization?.name]);


	return (
		<div role="list" className="flex items-center space-x-0 lg:space-x-2 xl:space-x-4">
			{...breadcrumbs}
		</div>
	);
}
