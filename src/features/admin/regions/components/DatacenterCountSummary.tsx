import { describeShape } from '@/features/clusters/upsert/lib/regionLookup';

/**
 * The per-datacenter counts a repeated-location list amounts to ("fr-par ×2 · it-mil"). The pickers
 * allow repeats but render one chip per entry, which is why the resulting count was never visible.
 */
export function DatacenterCountSummary({ datacenters, ariaLabel }: { datacenters: readonly string[]; ariaLabel: string }) {
	if (datacenters.length === 0) {
		return null;
	}
	return (
		<p className="text-xs text-muted-foreground" aria-label={ariaLabel}>
			{datacenters.length} {datacenters.length === 1 ? 'instance' : 'instances'}: {describeShape(datacenters)}
		</p>
	);
}
