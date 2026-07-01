import { ClusterContentWithSubNavMenu } from '@/features/cluster/components/ClusterContentWithSubNavMenu';
import { DomainsManagement } from './Management';

export function DomainsPage() {
	return (
		<ClusterContentWithSubNavMenu className="flex flex-col justify-start max-w-4xl">
			<DomainsManagement />
		</ClusterContentWithSubNavMenu>
	);
}
