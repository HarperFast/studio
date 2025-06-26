import { getRouteApi } from '@tanstack/react-router';
import { ClusterCard } from '@/features/organization/components/ClusterCard';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { NewClusterModal } from '@/features/clusters/modals/NewClusterModal';
import { useSuspenseQuery } from '@tanstack/react-query';
import { notYetImplemented } from '@/lib/not-yet-implemented';

const route = getRouteApi('');

export function ClustersList() {
	const { organizationId } = route.useParams();
	const { data: orgInfo, isSuccess } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));

	return (<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				{isSuccess && orgInfo?.clusters?.length ? (
					<div className="flex items-center justify-between h-full text-sm text-white">
						<div className="w-full">
							<Input placeholder="Filter clusters by name" className="inline-block w-3/5 md:w-64" onChange={notYetImplemented} />
							<Button className="inline-block w-2/5 md:w-auto md:ml-4" onClick={notYetImplemented}>
								Sort by A-Z
								<span>
									<ChevronDown className="inline-block" />
								</span>
							</Button>
						</div>
						<NewClusterModal orgId={organizationId} />
					</div>) : null}
			</nav>
			<section className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				{isSuccess && orgInfo?.clusters?.length ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
						{orgInfo?.clusters.map((cluster) => (
							<div key={cluster.id} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
								<ClusterCard clusterName={cluster.name} clusterId={cluster.id} organizationId={cluster.organizationId}
														 status={cluster.status} />
							</div>))}
					</div>) : (<div className="flex-col space-y-5 items-center justify-center text-center">
						<h2 className="text-2xl text-center text-white">No clusters found. Create a new cluster.</h2>
						<NewClusterModal orgId={organizationId} />
					</div>)}
			</section>
		</>);
}


