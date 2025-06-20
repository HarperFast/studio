import { Link, Outlet, useParams } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Loading } from '@/components/Loading';
import { Cog, Handshake, Users } from 'lucide-react';

export function ConfigIndex() {
	const { organizationId, clusterId, instanceId } = useParams({ strict: false });
	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3 border-r-2">
				<h2>
					<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/config`}>
						<Cog className="inline-block" /> Config
					</Link>
				</h2>

				<ul>
					<li>
						<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/config/users`}>
							<Users className="inline-block" /> Users
						</Link>
					</li>
					<li>
						<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/config/roles`}>
							<Handshake className="inline-block" /> Roles
						</Link>
					</li>
				</ul>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				<Suspense
					fallback={
						<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />
					}
				>
					<Outlet />
				</Suspense>
			</section>
		</main>
	);
}
