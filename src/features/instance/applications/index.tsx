import { Button } from '@/components/ui/button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Edit, FolderPlus } from 'lucide-react';

const route = getRouteApi('');

function ApplicationsIndex() {
	const { organizationId, clusterId, instanceId } = route.useParams();

	return (
		<div className="flex flex-col justify-center gap-4 min-h-[calc(80vh-theme(spacing.20))]">
			<h1 className="text-2xl font-bold text-center text-white">Applications</h1>
			<div className="flex flex-col items-center justify-center gap-8 md:flex-row">
				<Link
					to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications/editor`}
					className="w-full max-w-80"
				>
					<Button className="w-full py-10 text-lg" variant="positiveOutline">
						<Edit />
						Edit Applications
					</Button>
				</Link>
				<Link
					to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications/new`}
					className="w-full max-w-80"
				>
					<Button className="w-full py-10 text-lg" variant="positiveOutline">
						<FolderPlus />
						Create/Import A New Application
					</Button>
				</Link>
			</div>
		</div>
	);
}

export default ApplicationsIndex;
