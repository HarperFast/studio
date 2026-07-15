import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ReactNode } from 'react';

interface Props {
	/** Row label of the drilled cell — rendered as the left half of the
	 *  `source → target` dialog title. */
	source: string;
	/** Column label of the drilled cell — the right half of the title. */
	target: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Optional context line under the title (e.g. selected quantile + window). */
	description?: ReactNode;
	/** Chart body. Rendered inside a flex column sized like the expand
	 *  dialog's canvas, so primitives can use `fillParent`. */
	children: ReactNode;
}

/** Near-fullscreen dialog for drilling from a heatmap cell into the
 *  node-pair time series behind it. Same shell as ChartExpandButton's
 *  expanded view (95vw × 90vh flex column), but controlled by the
 *  parent renderer — the heatmap cell, not a header button, opens it. */
export function HeatmapDrilldownDialog({ source, target, open, onOpenChange, description, children }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent // Match ChartExpandButton: override the Card max-width for a
			 // near-fullscreen canvas; pin both plain and sm: variants.
			className="!max-w-[95vw] sm:!max-w-[95vw] h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>{`${source} → ${target}`}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<div className="flex-1 min-h-0 overflow-hidden flex flex-col">
					{children}
				</div>
			</DialogContent>
		</Dialog>
	);
}
