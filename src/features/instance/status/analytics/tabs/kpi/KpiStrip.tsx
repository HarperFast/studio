import { KpiTile } from './KpiTile';
import { KPI_TILES } from './kpiTiles';

/** The Health tab's at-a-glance vitals row: five stat tiles above the panel
 *  grid (see kpiTiles.ts for the metric definitions). */
export function KpiStrip() {
	return (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5" data-testid="kpi-strip">
			{KPI_TILES.map((def) => <KpiTile key={def.id} def={def} />)}
		</div>
	);
}
