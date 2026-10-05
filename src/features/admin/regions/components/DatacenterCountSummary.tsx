import { describeShape } from '@/features/clusters/upsert/lib/regionLookup';

// The pickers allow repeats but render one chip per entry; this is where the count shows.
export function DatacenterCountSummary(
	{ datacenters, ariaLabel }: { datacenters: readonly string[]; ariaLabel: string },
) {
	if (datacenters.length === 0) {
		return null;
	}
	return (
		<p className="text-xs text-muted-foreground" aria-label={ariaLabel}>
			{datacenters.length} {datacenters.length === 1 ? 'instance' : 'instances'}: {describeShape(datacenters)}
		</p>
	);
}
