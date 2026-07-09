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
 * use. Shared by the start-in-safe-mode and restart-in-safe-mode entries.
 */
export function SafeModeConfirmDialog({
	open,
	setOpen,
	action,
	clusterName,
	isPending,
	onConfirm,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	action: 'start' | 'restart';
	clusterName: string;
	isPending: boolean;
	onConfirm: () => void;
}) {
	const verb = action === 'start' ? 'Start' : 'Restart';
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<LifeBuoyIcon className="size-5 text-yellow" />
						{verb} {clusterName} in safe mode?
					</DialogTitle>
					<DialogDescription>
						Safe mode boots Harper{' '}
						<strong className="text-foreground">
							without loading your applications or components
						</strong>. Use it to recover a cluster that a bad app, component, or config is keeping from starting. Then
						fix or remove what&apos;s broken and {action === 'start' ? 'start' : 'restart'}{' '}
						normally to bring everything back.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					All instances are {action === 'start' ? 'started' : 'restarted'} at once (parallel){action === 'restart'
						? ', so expect a brief interruption while they come back.'
						: '.'}
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
