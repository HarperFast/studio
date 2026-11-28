import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Button } from '@/components/ui/button';
import { ClusterSecretsKeyGap, useCreateClusterSecretsKey } from '@/integrations/api/instance/secrets/secrets';
import { KeyRoundIcon, LoaderCircleIcon } from 'lucide-react';
import { useState } from 'react';

export function ClusterSecretsKeySetup({ gap, clusterId, canUpdate }: {
	gap: ClusterSecretsKeyGap;
	clusterId: string;
	canUpdate: boolean;
}) {
	const [confirming, setConfirming] = useState(false);
	const { mutate, isPending } = useCreateClusterSecretsKey();

	if (gap === 'delivering') {
		return (
			<Alert variant="warning" role="status" aria-live="polite" className="mb-4">
				<LoaderCircleIcon className="animate-spin" />
				<AlertTitle>Setting up this cluster's secrets key</AlertTitle>
				<AlertDescription>
					<p>
						The instances restart one at a time to take the key. Secrets can be added once every instance has it; this
						page checks again by itself.
					</p>
					{canUpdate && (
						<p>
							If the restarts stopped part way,{' '}
							<button type="button" className="underline" disabled={isPending} onClick={() => mutate(clusterId)}>
								try again
							</button>
							: instances that already have the key are not restarted.
						</p>
					)}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<>
			<Alert className="mb-4">
				<KeyRoundIcon />
				<AlertTitle>This cluster has no secrets key yet</AlertTitle>
				<AlertDescription>
					<p>
						Secret values are encrypted with the cluster's secrets key, so none can be added until it has one. Creating
						the key restarts the cluster's instances one at a time.
					</p>
					{canUpdate
						? (
							<Button
								className="mt-2"
								size="sm"
								variant="positiveOutline"
								disabled={isPending}
								onClick={() => setConfirming(true)}
							>
								{isPending ? 'Sending…' : 'Create secrets key'}
							</Button>
						)
						: <p>Someone with permission to update this cluster can create it here.</p>}
				</AlertDescription>
			</Alert>
			<AlertDialog open={confirming && canUpdate} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Create this cluster's secrets key?</AlertDialogTitle>
						<AlertDialogDescription>
							Every instance in the cluster restarts to take the key, one at a time. Each is taken out of the load
							balancer first, and the next waits until it is running again.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={isPending} onClick={() => mutate(clusterId)}>Create key</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
