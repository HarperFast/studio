import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClipboardCopy } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { toast } from 'sonner';
import { copyChartToClipboard } from '../lib/chartExport';

interface Props {
	/** The DOM node that should be captured. Usually the chart's outer Card. */
	captureRef: RefObject<HTMLElement | null>;
	/** Slug used in the toast message and the aria-label. */
	exportSlug: string;
}

/** Copies the chart's PNG capture to the clipboard. Same capture pipeline
 *  as ChartExportButton (so the on-clipboard image matches what would be
 *  downloaded), but bypasses the file-system save and lets the user paste
 *  directly into Slack, Confluence, an issue tracker, etc.
 *
 *  Falls back gracefully when the browser doesn't expose `ClipboardItem`
 *  (Safari without permissions, http-served pages) — reports a friendly
 *  error toast instead of throwing. */
export function ChartCopyButton({ captureRef, exportSlug }: Props) {
	const [busy, setBusy] = useState(false);

	const onClick = async () => {
		if (busy) { return; }
		const el = captureRef.current;
		if (!el) { return; }
		setBusy(true);
		try {
			const ok = await copyChartToClipboard(el);
			if (ok) {
				toast.success('Chart copied to clipboard');
			} else {
				toast.error('Could not copy chart', {
					description: 'Your browser blocked the clipboard write. Try Download or check site permissions.',
				});
			}
		} catch (err) {
			console.error('[chart-copy] capture failed', err);
			toast.error('Could not copy chart', {
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
					aria-label={`Copy ${exportSlug} chart to clipboard`}
				>
					<ClipboardCopy className="h-4 w-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">Copy to clipboard</TooltipContent>
		</Tooltip>
	);
}
