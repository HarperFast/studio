import { deploymentRecordPath } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
import { CircleIcon } from 'lucide-react';

// The instance's own SSH keys fix this, so the failure links to them.
const SSH_ACCESS_FAILURE = /Failed to deploy private repository\b|SSH access failed/i;

export function DeployFailure({
	title,
	message,
	deploymentId,
	onNavigateAway,
}: {
	title?: string;
	message: string;
	/** Only where the host shows no record link of its own. */
	deploymentId?: string;
	/** Called when a guidance link navigates away — lets a hosting modal close itself first. */
	onNavigateAway?: () => void;
}) {
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });

	return (
		<div role="alert" className="flex flex-col gap-2 text-sm text-destructive">
			<div className="flex items-start gap-2">
				<CircleIcon className="mt-0.5 size-4 shrink-0" />
				<div className="flex flex-col gap-1 break-words">
					{title && <span className="font-medium">{title}</span>}
					<span>{message}</span>
				</div>
			</div>
			{SSH_ACCESS_FAILURE.test(message) && (
				<Link
					to={buildAbsoluteLinkToPage(params, 'config/ssh-keys')}
					onClick={onNavigateAway}
					className="self-start pl-6 underline"
				>
					Manage SSH keys
				</Link>
			)}
			{deploymentId && (
				<Link
					to={deploymentRecordPath(params, deploymentId)}
					onClick={onNavigateAway}
					className="self-start pl-6 underline"
				>
					View this deployment's record
				</Link>
			)}
		</div>
	);
}
