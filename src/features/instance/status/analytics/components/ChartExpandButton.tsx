import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Maximize2 } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { ChartCopyButton } from './ChartCopyButton.tsx';
import { ChartExportButton } from './ChartExportButton.tsx';

interface Props {
	/** Slug for the export filename if the user exports from the expanded view. */
	exportSlug: string;
	/** Title shown in the dialog header. */
	title: string;
	/** Optional description shown below the title in the dialog. */
	description?: ReactNode;
	/** A render function that produces the chart's content. Called twice in
	 *  practice — once inline by the parent panel, and once inside the
	 *  expanded dialog. We use a render function (not children) so the
	 *  inner ResponsiveContainer remeasures against the dialog's tall
	 *  parent and grows the chart. */
	renderChart: () => ReactNode;
}

/** Adds an "Expand" icon next to other panel-header actions. Click opens
 *  a near-fullscreen Radix Dialog containing the same chart re-rendered
 *  at full size, plus its own export button so the capture grabs the
 *  bigger DOM (and therefore produces a higher-resolution PNG). */
export function ChartExpandButton({ exportSlug, title, description, renderChart }: Props) {
	const [open, setOpen] = useState(false);
	const expandedRef = useRef<HTMLDivElement>(null);

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setOpen(true)}
						aria-label={`Expand ${exportSlug}`}
					>
						<Maximize2 className="h-4 w-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Expand</TooltipContent>
			</Tooltip>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent // Override the Card's max-width — we want a near-fullscreen
				 // canvas. Tailwind's sm:max-w-* utility wins specificity-wise
				// in some shadcn dialogs, so pin both.
				className="!max-w-[95vw] sm:!max-w-[95vw] h-[90vh] flex flex-col">
					<DialogHeader>
						<div className="flex items-start justify-between gap-2 pr-6">
							<div className="flex-1 min-w-0">
								<DialogTitle>{title}</DialogTitle>
								{description && <DialogDescription>{description}</DialogDescription>}
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<ChartCopyButton captureRef={expandedRef} exportSlug={`${exportSlug}-expanded`} />
								<ChartExportButton captureRef={expandedRef} exportSlug={`${exportSlug}-expanded`} />
							</div>
						</div>
					</DialogHeader>
					{
						/* The expanded chart renders into this region. ref captures
					    everything inside (including the chart's surrounding
					    chips/legend) so the export PNG matches the on-screen view. */
					}
					<div ref={expandedRef} className="flex-1 min-h-0 overflow-hidden">
						{renderChart()}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
