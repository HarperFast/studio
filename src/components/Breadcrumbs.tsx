import { RestartButton } from '@/components/RestartButton';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { Cluster, Instance, Organization } from '@/lib/api.patch';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link, useLocation, useParams, useRouteContext } from '@tanstack/react-router';
import { HomeIcon } from 'lucide-react';
import { useMemo } from 'react';

export function Breadcrumbs({ restartRequired }: { restartRequired?: boolean }) {
	const location = useLocation();
	const { instanceId }: { instanceId?: string; clusterId: string; } = useParams({ strict: false });
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientIdParams();

	const { organization, instance, cluster }: {
		organization?: Organization;
		instance?: Instance;
		cluster?: Cluster
	} = useRouteContext({ strict: false });

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

			let path = `/${routeHistory.slice(0, index + 1).join('/')}`;
			let name = capitalizeWords(route);
			let id: string | undefined;
			if (route === 'databases' && routeHistory.length === index + 3) {
				// id = routeHistory[index + 1];
				name = routeHistory[index + 2];
				index += 2;
			} else if (name.startsWith('Org ')) {
				// id = route.split('org-').pop();
				name = organization?.name || 'Org';
			} else if (name.startsWith('Clu ')) {
				// id = route.split('clu-').pop();
				name = cluster?.name || 'Cluster';
				if (routeHistory[index + 1] === 'instance') {
					path += '/instances';
				}
			} else if (name.startsWith('Ins ')) {
				// id = route.split('ins-').pop();
				name = instance?.name?.split('.')?.shift() || 'Instance';
			} else if (name === 'Apis') {
				name = 'APIs';
			}

			breadcrumbs.push(
				<svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-grey">
					<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
				</svg>,
				<Link
					to={path}
					className="text-xs md:text-sm font-medium hover:text-grey truncate max-w-48"
				>
					{name}
					{id && <div className="text-gray-500 text-xs hidden md:block">{id}</div>}
				</Link>,
			);
		}

		return breadcrumbs;
	}, [location.pathname, cluster?.name, instance?.name, organization?.name]);

	return (
		<div role="list" className="flex items-center space-x-0 lg:space-x-2 xl:space-x-4 sm:max-w-9/10 max-w-[calc(100%-56px)]">
			{...breadcrumbs}
			{restartRequired && <RestartButton
				className="animate-glow-pulse"
				targetNoun={targetNoun}
				instanceClient={instanceParams.instanceClient}
				operation="restart"
				hideText={true}
				tooltip={`This ${targetNoun} is requesting a restart, when convenient, to apply your latest changes.`}
			/>}
		</div>
	);
}
