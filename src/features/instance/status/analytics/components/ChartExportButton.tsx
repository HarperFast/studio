import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { toast } from 'sonner';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { downloadChart, makeExportFilename } from '../lib/chartExport';

interface Props {
	/** The DOM node that should be captured. Usually the chart's outer Card. */
	captureRef: RefObject<HTMLElement | null>;
	/** Slug used as the filename prefix (e.g. metric id or panel title). */
	exportSlug: string;
}

/** Renders a small icon-button that, when clicked, snapshots the referenced
 *  element to PNG and triggers a browser download. Filenames include an ISO
 *  timestamp of the panel's window end so multiple captures don't collide.
 *  Uses Radix Tooltip (keyboard-discoverable) over native title, and shows
 *  a sonner toast on success/error so the user gets feedback during the
 *  100–500 ms capture window. */
export function ChartExportButton({ captureRef, exportSlug }: Props) {
	const { timeRange } = useAnalyticsContext();
	const [busy, setBusy] = useState(false);

	const onClick = async () => {
		if (busy) { return; }
		const el = captureRef.current;
		if (!el) { return; }
		setBusy(true);
		const filename = makeExportFilename(exportSlug, timeRange);
		try {
			await downloadChart(el, filename);
			toast.success(`Saved ${filename}`);
		} catch (err) {
			console.error('[chart-export] capture failed', err);
			toast.error('Could not export chart', {
				description: err instanceof Error ? err.message : 'Unknown error',
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					aria-disabled={busy}
					aria-busy={busy}
					aria-label={`Download ${exportSlug} as PNG`}
				>
					<Download className="h-4 w-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">Download as PNG</TooltipContent>
		</Tooltip>
	);
}
