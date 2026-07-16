import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { LifeBuoyIcon } from 'lucide-react';

/**
 * Explain-and-confirm dialog for the safe-mode ops. "Safe mode" is jargon and a recovery action, so
 * rather than a hover tooltip (hover-only, easy to miss) we explain what it does at the moment of
 * use. Shared by the start-in-safe-mode and restart-in-safe-mode entries at both cluster and
 * instance scope — the explanation matters equally either way (see #1429 review).
 */
export function SafeModeConfirmDialog({
	open,
	setOpen,
	action,
	targetName,
	scope,
	isPending,
	onConfirm,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	action: 'start' | 'restart';
	targetName: string;
	scope: 'cluster' | 'instance';
	isPending: boolean;
	onConfirm: () => void;
}) {
	const verb = action === 'start' ? 'Start' : 'Restart';
	const verbed = action === 'start' ? 'starts' : 'restarts';
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<LifeBuoyIcon className="size-5 text-yellow" />
						{verb} {targetName} in safe mode?
					</DialogTitle>
					<DialogDescription>
						Safe mode boots Harper{' '}
						<strong className="text-foreground">
							without loading your applications or components
						</strong>. Use it to recover {scope === 'cluster' ? 'a cluster' : 'an instance'}{' '}
						that a bad app, component, or config is keeping from starting. Then fix or remove what&apos;s broken and
						{' '}
						{action === 'start' ? 'start' : 'restart'} normally to bring everything back.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					{scope === 'cluster'
						? `All instances are ${action === 'start' ? 'started' : 'restarted'} at once (parallel)${
							action === 'restart' ? ', so expect a brief interruption while they come back.' : '.'
						}`
						: `The instance ${verbed} in safe mode${
							action === 'restart' ? ', so expect a brief interruption while it comes back.' : '.'
						}`}
				</p>
				<DialogFooter>
					<div className="flex justify-end gap-3">
						<Button type="button" variant="defaultOutline" onClick={() => setOpen(false)}>Cancel</Button>
						<Button type="button" variant="warning" onClick={onConfirm} disabled={isPending}>
							<LifeBuoyIcon /> {verb} in safe mode
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
