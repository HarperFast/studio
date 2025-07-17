import { SchemaLocation, SchemaRegion } from '@/lib/api.gen';

// TODO: Once the server regions have region and latencyDescription tweaked, use them.
//       https://github.com/HarperDB/central-manager/pull/63
export const tempRegionsMock: SchemaRegion[] = [
	{
		'id': 'global-1',
		'region': 'Global',
		'latencyDescription': 'Low distribution, 250ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'global-2',
		'region': 'Global',
		'latencyDescription': 'Medium distribution, 200ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'global-3',
		'region': 'Global',
		'latencyDescription': 'High distribution, 160ms latency',
		'instanceCount': 6,
	},
	{
		'id': 'global-4',
		'region': 'Global',
		'latencyDescription': 'Very high distribution, 130ms latency',
		'instanceCount': 8,
	},
	{
		'id': 'global-5',
		'region': 'Global',
		'latencyDescription': 'Ultra distribution, 110ms latency',
		'instanceCount': 10,
	},
	{
		'id': 'us-1',
		'region': 'US',
		'latencyDescription': 'Low distribution, 250ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'us-2',
		'region': 'US',
		'latencyDescription': 'Medium distribution, 150ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'us-3',
		'region': 'US',
		'latencyDescription': 'High distribution, 100ms latency',
		'instanceCount': 6,
	},
	{
		'id': 'us-4',
		'region': 'US',
		'latencyDescription': 'Very high distribution, 80ms latency',
		'instanceCount': 8,
	},
	{
		'id': 'us-ne-1',
		'region': 'US-NE',
		'latencyDescription': 'Low distribution, 100ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'us-ne-2',
		'region': 'US-NE',
		'latencyDescription': 'Medium distribution, 80ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'us-nw-1',
		'region': 'US-NW',
		'latencyDescription': 'Low distribution, 100ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'us-nw-2',
		'region': 'US-NW',
		'latencyDescription': 'Medium distribution, 80ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'us-se-1',
		'region': 'US-SE',
		'latencyDescription': 'Low distribution, 100ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'us-se-2',
		'region': 'US-SE',
		'latencyDescription': 'Medium distribution, 80ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'us-sw-1',
		'region': 'US-SW',
		'latencyDescription': 'Low distribution, 100ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'us-sw-2',
		'region': 'US-SW',
		'latencyDescription': 'Medium distribution, 80ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'canada-1',
		'region': 'Canada',
		'latencyDescription': 'Low distribution, 150ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'canada-2',
		'region': 'Canada',
		'latencyDescription': 'Medium distribution, 120ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'canada-3',
		'region': 'Canada',
		'latencyDescription': 'Large distribution, 100ms latency',
		'instanceCount': 6,
	},
	{
		'id': 'canada-4',
		'region': 'Canada',
		'latencyDescription': 'Very large distribution, 90ms latency',
		'instanceCount': 8,
	},
	{
		'id': 'europe-1',
		'region': 'Europe',
		'latencyDescription': 'Low distribution, 200ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'europe-2',
		'region': 'Europe',
		'latencyDescription': 'Medium distribution, 150ms latency',
		'instanceCount': 4,
	},
	{
		'id': 'europe-3',
		'region': 'Europe',
		'latencyDescription': 'Large distribution, 100ms latency',
		'instanceCount': 6,
	},
	{
		'id': 'europe-4',
		'region': 'Europe',
		'latencyDescription': 'Very Large distribution, 100ms latency',
		'instanceCount': 8,
	},
	{
		'id': 'asia-pacific-1',
		'region': 'Asia Pacific',
		'latencyDescription': 'Low distribution, 120ms latency',
		'instanceCount': 2,
	},
	{
		'id': 'south-america-1',
		'region': 'South America',
		'latencyDescription': 'Low distribution, 1000ms latency',
		'instanceCount': 2,
	},
]
	.map(l => ({ locations: [] as SchemaLocation[], ...l }));
