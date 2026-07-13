import type { MetricSpec } from '../types/analytics';

// Per-field `crossNode` aggregator overrides (e.g. cpuUtilization's
// `crossNode: 'max'`) are honored by pipeline.ts as of Step 4.5: the
// temporal aggregator runs per (time, node), then the crossNode aggregator
// folds across nodes within each time bucket.
export const resourceUsageSpec: MetricSpec = {
	title: 'Resource usage',
	description: 'CPU + I/O + page faults + context switches per node — small-multiples view.',
	tab: 'health',
	primaryDimension: 'node',
	series: {
		kind: 'field',
		fields: [
			{
				field: 'cpuUtilization',
				// Cores-equivalent CPU consumption per process. 1.0 = one
				// core fully busy; saturating an N-core box means the value
				// approaches N. The previous `percent-of-core` transform (×100)
				// was cancelled by the cores formatter (÷100); both removed.
				label: 'Process CPU (cores used)',
				aggregator: { temporal: 'max', crossNode: 'max' },
				yAxis: { unit: '', formatter: 'cores' },
			},
			{
				field: 'fsWrite',
				label: 'Disk write (B/s)',
				transform: { kind: 'rate' },
				aggregator: { temporal: 'sum', crossNode: 'sum' },
				yAxis: { unit: '/s', formatter: 'bytes-si' },
			},
			{
				field: 'majorPageFault',
				label: 'Major page faults /s',
				transform: { kind: 'rate' },
				aggregator: { temporal: 'sum', crossNode: 'max' },
				yAxis: { unit: '/s', formatter: 'count-si' },
			},
			{
				field: {
					kind: 'op',
					op: '+',
					left: { kind: 'ref', field: 'voluntaryContextSwitches' },
					right: { kind: 'ref', field: 'involuntaryContextSwitches' },
				},
				label: 'Context switches /s',
				transform: { kind: 'rate' },
				aggregator: { temporal: 'sum', crossNode: 'max' },
				yAxis: { unit: '/s', formatter: 'count-si' },
			},
		],
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'small-multiples',
	yAxis: { unit: '', formatter: 'count' },
	layout: { colSpan: 2 },
};
