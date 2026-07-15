import type { KpiPoint } from './kpiMath';

interface Props {
	points: KpiPoint[];
	/** Full current-window bounds, so a half-empty window draws half a line
	 *  instead of stretching the data to fill the tile. */
	xDomain: [number, number];
}

const VIEW_W = 120;
const VIEW_H = 32;
/** Inset so the stroke isn't clipped at the extremes. */
const PAD_Y = 2;

/** Axis-less inline-SVG sparkline for the KPI tiles. Decorative only
 *  (aria-hidden) — the tile's value + delta carry the information. Drawn in
 *  the muted de-emphasis hue with the final segment in the accent chart hue
 *  so "now" reads at a glance in both themes. */
export function KpiSparkline({ points, xDomain }: Props) {
	if (points.length < 2) { return <div className="h-8" aria-hidden="true" />; }

	const [x0, x1] = xDomain;
	const xSpan = x1 - x0 || 1;
	let yMin = Infinity;
	let yMax = -Infinity;
	for (const p of points) {
		if (p.y < yMin) { yMin = p.y; }
		if (p.y > yMax) { yMax = p.y; }
	}
	// Flat series: center the line rather than dividing by zero.
	const ySpan = yMax - yMin || 1;

	const toXY = (p: KpiPoint): [number, number] => [
		((p.x - x0) / xSpan) * VIEW_W,
		yMax === yMin
			? VIEW_H / 2
			: PAD_Y + (1 - (p.y - yMin) / ySpan) * (VIEW_H - 2 * PAD_Y),
	];

	const coords = points.map(toXY);
	const toPath = (cs: [number, number][]): string =>
		cs.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

	return (
		<svg
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			preserveAspectRatio="none"
			className="h-8 w-full text-muted-foreground/60"
			aria-hidden="true"
			focusable="false"
		>
			<path
				d={toPath(coords.slice(0, -1))}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<path
				d={toPath(coords.slice(-2))}
				fill="none"
				stroke="var(--chart-node-1)"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}
