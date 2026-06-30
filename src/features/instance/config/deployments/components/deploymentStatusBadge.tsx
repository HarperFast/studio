import { Badge } from '@/components/ui/badge';
import { DeploymentStatus } from '@/integrations/api/instance/deployments/types';

type BadgeVariant = 'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<DeploymentStatus, BadgeVariant> = {
	pending: 'warning',
	extracting: 'warning',
	installing: 'warning',
	loading: 'warning',
	replicating: 'warning',
	restarting: 'warning',
	success: 'success',
	failed: 'destructive',
	rolled_back: 'destructive',
};

const STATUS_LABEL: Record<DeploymentStatus, string> = {
	pending: 'Pending',
	extracting: 'Extracting',
	installing: 'Installing',
	loading: 'Loading',
	replicating: 'Replicating',
	restarting: 'Restarting',
	success: 'Success',
	failed: 'Failed',
	rolled_back: 'Rolled back',
};

export function DeploymentStatusBadge({ status }: { status: DeploymentStatus }) {
	return <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{STATUS_LABEL[status] ?? status}</Badge>;
}
