import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { branchStorageMessage } from '@/integrations/api/instance/applications/branchedDatabases';
import { DisablePreviewsResponse, DroppedPreview } from '@/integrations/api/instance/previews/previews';
import { ArrowLeft } from 'lucide-react';

export function DisablePreviewsDialog({
	app,
	open,
	onOpenChange,
	onConfirm,
}: {
	app: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Disable previews of {app}?</DialogTitle>
					<DialogDescription>
						This revokes the CI identity, so no workflow run can deploy, and drops every preview of{' '}
						{app}. If a drop fails partway the identity stays revoked, and running disable again resumes.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" onClick={() => onOpenChange(false)}>
						<ArrowLeft /> Cancel
					</Button>
					<Button variant="destructive" onClick={onConfirm}>Disable previews</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function describeDrop(drop: DroppedPreview): string {
	const outcome = drop.error ? `failed: ${drop.error}` : drop.componentRemoved ? 'dropped' : 'did not hold it';
	const storage = branchStorageMessage(drop);
	return `${drop.project} on ${drop.node}: ${outcome}${storage ? `. ${storage}` : ''}`;
}

export function DisablePreviewsResult(
	{ response, credentialStored }: { response: DisablePreviewsResponse; credentialStored: boolean },
) {
	const { message, dropped, removed, inProgress = [] } = response;
	return (
		<Alert>
			<AlertTitle>{message}</AlertTitle>
			<AlertDescription>
				<ul className="list-disc pl-4">
					{dropped.map((drop) => <li key={`${drop.project}:${drop.node}`}>{describeDrop(drop)}</li>)}
					{removed.length > 0 && <li>Removed {removed.join(', ')}.</li>}
					{inProgress.length > 0 && (
						<li>
							Still deploying when previews were revoked:{' '}
							{inProgress.join(', ')}. If one goes live, it is dropped when it expires, or you can delete it here.
						</li>
					)}
					{credentialStored && <li>The sealed GitHub token stays in Secrets until you delete it there.</li>}
				</ul>
			</AlertDescription>
		</Alert>
	);
}
