import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link, useLocation } from '@tanstack/react-router';
import { HomeIcon } from 'lucide-react';
import { useMemo } from 'react';

export function Breadcrumbs() {
	const location = useLocation();
	const breadcrumbs = useMemo(() => {
		const routeHistory = location.pathname.split('/')
			.filter((x) => x && x.length > 0);

		const breadcrumbs = [
			<Link to="/">
				<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
				<span className="sr-only">Home</span>
			</Link>,
		];

		// Start at 1 to skip over the first top level route. The home icon will cover that.
		for (let index = 1; index < routeHistory.length; index++) {
			const route = routeHistory[index];
			const path = `/${routeHistory.slice(0, index + 1).join('/')}`;
			let name = capitalizeWords(route);
			let id: string | undefined;
			if (name.startsWith('Org ')) {
				id = route.split('org-').pop();
				name = 'Org';
			}
			else if (name.startsWith('Clu ')) {
				id = route.split('clu-').pop();
				name = 'Cluster';
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
					{id && <div className="text-gray-500 text-xs">{id}</div>}
				</Link>,
			);
		}

		return breadcrumbs;
	}, [location.pathname]);


	return (
		<div role="list" className="flex items-center space-x-0 lg:space-x-2 xl:space-x-4">
			{...breadcrumbs}
		</div>
	);
}
