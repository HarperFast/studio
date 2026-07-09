import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { ContainerStrategy } from '@/integrations/api/cluster/containerOperation';

/**
 * Dialogs for cluster-wide container ops:
 *  - Stop confirmation (whole cluster goes offline).
 *  - Restart strategy picker (parallel vs rolling) — clicking a strategy dispatches the restart.
 * State lives in the parent (ClusterCard), mirroring how the terminate modal is wired.
 */
export function ClusterContainerOpModals({
	clusterName,
	isPending,
	stopOpen,
	setStopOpen,
	onConfirmStop,
	restartOpen,
	setRestartOpen,
	onConfirmRestart,
}: {
	clusterName: string;
	isPending: boolean;
	stopOpen: boolean;
	setStopOpen: (open: boolean) => void;
	onConfirmStop: () => void;
	restartOpen: boolean;
	setRestartOpen: (open: boolean) => void;
	onConfirmRestart: (strategy: ContainerStrategy) => void;
}) {
	return (
		<>
			<Dialog open={stopOpen} onOpenChange={setStopOpen}>
				<DialogContent className="sm:max-w-[560px]">
					<DialogHeader>
						<DialogTitle>Stop cluster {clusterName}?</DialogTitle>
						<DialogDescription>
							This stops every instance in the cluster. It will be offline and stop serving traffic until you start it
							again.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<div className="flex justify-end gap-3">
							<Button type="button" variant="defaultOutline" onClick={() => setStopOpen(false)}>Cancel</Button>
							<Button type="button" variant="destructive" onClick={onConfirmStop} disabled={isPending}>
								Stop cluster
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={restartOpen} onOpenChange={setRestartOpen}>
				<DialogContent className="sm:max-w-[560px]">
					<DialogHeader>
						<DialogTitle>Restart cluster {clusterName}</DialogTitle>
						<DialogDescription>Choose how to restart the cluster&apos;s instances.</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 py-2">
						<button
							type="button"
							disabled={isPending}
							onClick={() => onConfirmRestart('rolling')}
							className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
						>
							<div className="font-medium">
								Rolling <span className="text-xs text-muted-foreground">(recommended)</span>
							</div>
							<div className="text-sm text-muted-foreground">
								One instance at a time, waiting for each to rejoin before moving on. No downtime.
							</div>
						</button>
						<button
							type="button"
							disabled={isPending}
							onClick={() => onConfirmRestart('parallel')}
							className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
						>
							<div className="font-medium">Parallel</div>
							<div className="text-sm text-muted-foreground">
								All instances at once. Faster, but the whole cluster is briefly offline.
							</div>
						</button>
					</div>
					<DialogFooter>
						<Button type="button" variant="defaultOutline" onClick={() => setRestartOpen(false)}>Cancel</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
