import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { chartCsv, type ChartCsvData, downloadCsv, makeCsvFilename } from '../lib/csvExport';

interface Props {
	/** Slug used as the filename prefix (e.g. metric id or panel title). */
	exportSlug: string;
	/** Lazily produces the chart data to serialize — called on click so the
	 *  CSV always reflects the panel's current records. Return null when
	 *  there is nothing to export (the button then shows an error toast). */
	getCsvData: () => ChartCsvData | null;
}

/** Downloads the panel's rendered data as CSV. Sits beside ChartCopyButton /
 *  ChartExportButton in the panel-header action row and shares their
 *  gating: the parent only renders the row when there is data on screen.
 *  Serialization is synchronous and recomputes from records already fetched
 *  — no network. */
export function ChartCsvButton({ exportSlug, getCsvData }: Props) {
	const { timeRange } = useAnalyticsContext();

	const onClick = () => {
		const filename = makeCsvFilename(exportSlug, timeRange);
		try {
			const data = getCsvData();
			if (!data) {
				toast.error('No data to export');
				return;
			}
			downloadCsv(chartCsv(data), filename);
			toast.success(`Saved ${filename}`);
		} catch (err) {
			console.error('[chart-csv] export failed', err);
			toast.error('Could not export CSV', {
				description: err instanceof Error ? err.message : 'Unknown error',
			});
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					aria-label={`Download ${exportSlug} as CSV`}
				>
					<FileSpreadsheet className="h-4 w-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">Download as CSV</TooltipContent>
		</Tooltip>
	);
}
