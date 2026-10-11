import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
import { CircleIcon } from 'lucide-react';

/**
 * A deploy that failed because the *instance* couldn't reach a private repository over SSH is
 * fixed in Config > SSH Keys (install a key, grant it access to the repo, add the git host to
 * `known_hosts`), so link the user there instead of leaving them to find it. Harper's message
 * already spells out the remediation, and only the deploy UI reports the failure: it's an
 * instance configuration state, not a Studio bug, so `shouldKeepEvent` drops the RUM event
 * (which also kept the customer's private repo URL out of Error Tracking).
 */
const SSH_ACCESS_FAILURE = /Failed to deploy private repository\b|SSH access failed/i;

/** A failed deploy's message, persistent beside the form that started it. */
export function DeployFailure({
	title,
	message,
	onNavigateAway,
}: {
	title?: string;
	message: string;
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
		</div>
	);
}
