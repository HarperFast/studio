import { useMemo } from 'react';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { useAnalyticsRecords } from '../hooks/useAnalyticsRecords';
import { computeMetricCsvData } from '../lib/csvExport';
import { getSpecRequiredFields } from '../lib/specRequiredFields';
import { derivedRegistry } from '../pipeline/derived/index';
import { specRegistry } from '../pipeline/index';
import { MetricRenderer } from '../primitives/MetricRenderer';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { collectNodes, PanelCard, PanelStateOrChart } from './PanelShell';

interface Props {
	metric: string;
	titleOverride?: string;
}

/** Renders one Card with a metric chart inside, fetching its own data via
 *  the adapter. Used by every analytics tab except Storage's table-size
 *  panels (which compose their own custom charts). */
export function MetricPanel({ metric, titleOverride }: Props) {
	const { timeRange } = useAnalyticsContext();
	return (
		<PanelErrorBoundary metric={metric} resetKey={`${timeRange.startTime}-${timeRange.endTime}`}>
			<MetricPanelInner metric={metric} titleOverride={titleOverride} />
		</PanelErrorBoundary>
	);
}

function MetricPanelInner({ metric, titleOverride }: Props) {
	const { timeRange, bucketMs, instanceParams } = useAnalyticsContext();
	const sourceMetric = derivedRegistry[metric]?.sourceMetric ?? metric;
	const requiredFields = getSpecRequiredFields(metric);
	const { data, isLoading, isError, error, isEmpty, missingFields, isPlaceholderData, refetch } = useAnalyticsRecords({
		metric: sourceMetric,
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		bucketMs,
		requiredFields,
	});

	const specEntry = specRegistry[metric];
	const derivedEntry = derivedRegistry[metric];
	const title = titleOverride ?? specEntry?.spec?.title ?? derivedEntry?.title ?? metric;
	const description = specEntry?.spec?.description ?? derivedEntry?.subtitle;
	const nodes = useMemo(() => collectNodes(data), [data]);
	// Placeholder rows are the PREVIOUS window's data held on screen during a
	// window change — exporting them would pair old rows with a filename (and
	// PNG title) claiming the new window, so hide the export actions until the
	// requested window's rows arrive.
	const canExport = !isLoading && !isError && !isEmpty && !isPlaceholderData;

	const getCsvData = () => computeMetricCsvData(metric, data, timeRange, nodes);

	const renderChart = (opts: { fillParent: boolean } = { fillParent: false }) => (
		<MetricRenderer
			metric={metric}
			records={data}
			window={timeRange}
			nodes={nodes}
			fillParent={opts.fillParent}
		/>
	);

	return (
		<PanelCard
			title={title}
			description={description}
			exportSlug={metric}
			canExport={canExport}
			renderChart={renderChart}
			getCsvData={getCsvData}
		>
			<PanelStateOrChart
				isLoading={isLoading}
				isError={isError}
				error={error}
				isEmpty={isEmpty}
				missingFields={missingFields}
				onRetry={refetch}
			>
				{renderChart()}
			</PanelStateOrChart>
		</PanelCard>
	);
}
