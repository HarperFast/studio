import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { formatValue } from '@/lib/formatValue';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AxisSpec, HeatmapCell, HeatmapData } from '../types/analytics';
import { warningBannerStyle } from './bannerStyle';
import { computeCellSize } from './computeCellSize';
export { computeCellSize } from './computeCellSize';

interface Props {
	data: HeatmapData;
	title?: string;
	height?: number;
}

/** Confidence-state greys — CSS tokens defined per theme in src/index.css
 *  (`--chart-heatmap-*`), so suppressed/absent/grey cells re-theme without a
 *  JS branch. Hex fallbacks are the light-theme values, for non-DOM tests. */
const MUTED_BG = 'var(--chart-heatmap-muted-bg, #f3f4f6)';
const MUTED_STROKE = 'var(--chart-heatmap-muted-stroke, #9ca3af)';
const GREY_STROKE = 'var(--chart-heatmap-grey-stroke, #9ca3af)';

type Confidence = 'ok' | 'grey' | 'suppress' | 'absent';

// Color-ramp stops stay literal hex (not CSS vars): the cell fill is
// interpolated between stops in JS (interpolateStops) and the focus-halo
// color is derived from the fill's WCAG relative luminance — both need
// concrete RGB values, which `var(--…)` strings can't provide. The
// light/dark ramp is selected via useResolvedTheme().
// Light theme: pale → deep red (low → high latency).
const LIGHT_STOPS = ['#fef3c7', '#fcd34d', '#f59e0b', '#dc2626', '#7f1d1d'];
// Dark theme: muted amber → cream.
const DARK_STOPS = ['#713f12', '#b45309', '#d97706', '#f59e0b', '#fef3c7'];

// contrast-table (WCAG 2.1 SC 1.4.11 — 3:1 minimum)
// Outer halo stroke computed dynamically from WCAG relative luminance:
// luminance > 0.5 → black (#000000); else white (#ffffff).
//
//  light theme stops (pale → deep red):
//   #fef3c7  L≈0.918 → black
//   #fcd34d  L≈0.693 → black
//   #f59e0b  L≈0.471 → white
//   #dc2626  L≈0.196 → white
//   #7f1d1d  L≈0.064 → white
//
//  dark theme stops (muted amber → cream):
//   #713f12  L≈0.068 → white
//   #b45309  L≈0.175 → white
//   #d97706  L≈0.330 → white
//   #f59e0b  L≈0.471 → white
//   #fef3c7  L≈0.918 → black
//
// Halo: inner stroke accent (1px) + outer stroke b/w (1px) = ≥3:1 against any fill.

function srgbToLinear(c: number): number {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
	const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
	return `#${h(r)}${h(g)}${h(b)}`;
}

function interpolateStops(stops: string[], t: number): string {
	if (t <= 0) { return stops[0]; }
	if (t >= 1) { return stops[stops.length - 1]; }
	const scaled = t * (stops.length - 1);
	const idx = Math.floor(scaled);
	const frac = scaled - idx;
	const [r1, g1, b1] = hexToRgb(stops[idx]);
	const [r2, g2, b2] = hexToRgb(stops[idx + 1]);
	return rgbToHex(r1 + (r2 - r1) * frac, g1 + (g2 - g1) * frac, b1 + (b2 - b1) * frac);
}

function classifyCell(
	cell: HeatmapCell | undefined,
	greyBelow: number,
	suppressBelow: number,
): Confidence {
	if (!cell || cell.value === null || cell.value === undefined) { return 'absent'; }
	const count = cell.count ?? 0;
	// grey: greyBelow ≤ count < suppressBelow. suppress: count < greyBelow.
	if (count < greyBelow) { return 'suppress'; }
	if (count < suppressBelow) { return 'grey'; }
	return 'ok';
}

function truncate(s: string, max: number): string {
	return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function cellAriaLabel(
	row: string,
	col: string,
	cell: HeatmapCell | undefined,
	confidence: Confidence,
	unit: string,
	suppressBelow: number,
	approx: boolean,
	measureLabel: string,
): string {
	const prefix = `${row} → ${col}: `;
	const approxTag = approx ? ' (approx)' : '';
	if (confidence === 'absent') {
		return `${prefix}no data`;
	}
	if (confidence === 'suppress') {
		return `${prefix}insufficient samples (n<${suppressBelow}), value hidden`;
	}
	const value = cell?.value ?? 0;
	const count = cell?.count ?? 0;
	if (confidence === 'grey') {
		return `${prefix}${value} ${unit} ${measureLabel} (approx, low-confidence: ${count} samples below threshold)`;
	}
	return `${prefix}${value} ${unit} ${measureLabel}${approxTag}, ${count} samples`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color scale legend — horizontal gradient below the grid.
// ─────────────────────────────────────────────────────────────────────────────

interface LegendProps {
	stops: string[];
	vmin: number;
	vmax: number;
	width: number;
	axis?: AxisSpec;
	approx: boolean;
	/** What the cells measure (e.g. "p95 latency"). */
	measureLabel: string;
}

function HeatmapColorLegend({ stops, vmin, vmax, width, axis, approx, measureLabel }: LegendProps) {
	const gradientId = useId();
	const unit = axis?.unit ?? '';
	const fmt = (v: number) => formatValue(v, axis?.formatter);
	const median = (vmin + vmax) / 2;
	const stripWidth = Math.max(200, Math.min(width, 480));
	const stripHeight = 12;
	const labelPrefix = approx ? `${measureLabel} (count-weighted-mean, approx)` : measureLabel;
	const label = `${labelPrefix}: ${fmt(vmin)}–${fmt(vmax)} ${unit}. Higher value = worse latency.`;
	return (
		<svg
			role="img"
			aria-label={label}
			width={stripWidth + 80}
			height={40}
			style={{ overflow: 'visible' }}
		>
			<defs>
				<linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
					{stops.map((stop, i) => (
						<stop
							key={stop + i}
							offset={`${(i / (stops.length - 1)) * 100}%`}
							stopColor={stop}
						/>
					))}
				</linearGradient>
			</defs>
			<text
				x={0}
				y={stripHeight + 2}
				fontSize={10}
				fill={axis ? 'currentColor' : 'currentColor'}
				aria-hidden="true"
			>
				low
			</text>
			<rect
				x={30}
				y={0}
				width={stripWidth}
				height={stripHeight}
				fill={`url(#${gradientId})`}
				aria-hidden="true"
			/>
			<text
				x={30 + stripWidth + 4}
				y={stripHeight + 2}
				fontSize={10}
				fill="currentColor"
				aria-hidden="true"
			>
				high
			</text>
			<text x={30} y={stripHeight + 18} fontSize={10} fill="currentColor" aria-hidden="true">
				{fmt(vmin)}
			</text>
			<text
				x={30 + stripWidth / 2}
				y={stripHeight + 18}
				fontSize={10}
				fill="currentColor"
				textAnchor="middle"
				aria-hidden="true"
			>
				{fmt(median)}
			</text>
			<text
				x={30 + stripWidth}
				y={stripHeight + 18}
				fontSize={10}
				fill="currentColor"
				textAnchor="end"
				aria-hidden="true"
			>
				{fmt(vmax)}
			</text>
		</svg>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main HeatmapMatrix component
// ─────────────────────────────────────────────────────────────────────────────

const MIN_CELL_SIZE = 40;
const MAX_CELL_SIZE = 80;
const CELL_GAP = 4;
const HEADER_HEIGHT = 72; // reserved for rotated column headers
const ROW_LABEL_WIDTH = 200;

export function HeatmapMatrix({ data, title, height }: Props) {
	const titleId = useId();
	const descId = useId();
	const suppressPatternId = useId();
	const theme = useResolvedTheme();

	const greyBelow = data.confidence?.greyBelow ?? 0;
	const suppressBelow = data.confidence?.suppressBelow ?? 0;
	const stops = theme === 'dark' ? DARK_STOPS : LIGHT_STOPS;
	const approx = data.approx === true;
	const unit = data.axis?.unit ?? '';
	// What the cells measure. Falls back to the historical copy; renderers
	// can override via HeatmapData.measureLabel (e.g. when a quantile
	// selector swaps p95 for p50/p99).
	const measureLabel = data.measureLabel ?? 'p95 latency';

	// Build a (row,col) -> cell index for O(1) lookup.
	const cellMap = useMemo(() => {
		const m = new Map<string, HeatmapCell>();
		for (const c of data.cells) { m.set(`${c.row}|${c.col}`, c); }
		return m;
	}, [data.cells]);

	// Compute value range for color scaling.
	const [vmin, vmax] = useMemo(() => {
		if (data.valueRange) { return [data.valueRange.min, data.valueRange.max]; }
		let lo = Infinity;
		let hi = -Infinity;
		for (const c of data.cells) {
			if (c.value !== null && c.value !== undefined && Number.isFinite(c.value)) {
				if (c.value < lo) { lo = c.value; }
				if (c.value > hi) { hi = c.value; }
			}
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) { return [0, 1]; }
		if (lo === hi) { return [lo, lo + 1]; }
		return [lo, hi];
	}, [data.cells, data.valueRange]);

	const rows = data.rows;
	const cols = data.cols;

	// Responsive cell sizing: measure wrapper width, clamp to [MIN, MAX].
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [cellSize, setCellSize] = useState<number>(MAX_CELL_SIZE);
	const rafRef = useRef<number | null>(null);

	useLayoutEffect(() => {
		const w = wrapperRef.current?.clientWidth ?? 0;
		setCellSize(
			computeCellSize(w, cols.length, ROW_LABEL_WIDTH, CELL_GAP, MIN_CELL_SIZE, MAX_CELL_SIZE),
		);
	}, [cols.length]);

	useEffect(() => {
		const el = wrapperRef.current;
		if (!el) { return; }
		const ro = new ResizeObserver(() => {
			if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); }
			rafRef.current = requestAnimationFrame(() => {
				rafRef.current = null;
				const w = el.clientWidth;
				setCellSize(
					computeCellSize(w, cols.length, ROW_LABEL_WIDTH, CELL_GAP, MIN_CELL_SIZE, MAX_CELL_SIZE),
				);
			});
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
			if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); }
		};
	}, [cols.length]);

	const gridWidth = cols.length * cellSize + (cols.length - 1) * CELL_GAP;
	const gridHeight = rows.length * cellSize + (rows.length - 1) * CELL_GAP;
	const svgWidth = ROW_LABEL_WIDTH + gridWidth + 8;
	const svgHeight = HEADER_HEIGHT + gridHeight + 8;

	// Roving tabindex state: [rowIdx, colIdx]. Clamped at render time so the
	// active cell stays in range when rows/cols shrink after a data refresh
	// (otherwise no cell gets tabIndex=0 and the grid leaves the tab order).
	// The Math.max(0, …) keeps the derived indices valid positions even when
	// rows/cols are momentarily empty (Math.min alone would yield -1).
	const [active, setActive] = useState<[number, number]>([0, 0]);
	const activeRow = Math.max(0, Math.min(active[0], rows.length - 1));
	const activeCol = Math.max(0, Math.min(active[1], cols.length - 1));
	const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

	const focusCell = useCallback((r: number, c: number) => {
		const el = cellRefs.current.get(`${r}|${c}`);
		if (el) {
			setActive([r, c]);
			el.focus();
		}
	}, []);

	const handleKeyDown = useCallback(
		(e: ReactKeyboardEvent<SVGGElement>, r: number, c: number) => {
			const k = e.key;
			let handled = false;
			let nr = r;
			let nc = c;
			if (k === 'ArrowRight') {
				handled = true;
				nc = Math.min(cols.length - 1, c + 1);
			} else if (k === 'ArrowLeft') {
				handled = true;
				nc = Math.max(0, c - 1);
			} else if (k === 'ArrowDown') {
				handled = true;
				nr = Math.min(rows.length - 1, r + 1);
			} else if (k === 'ArrowUp') {
				handled = true;
				nr = Math.max(0, r - 1);
			} else if (k === 'Home') {
				handled = true;
				nc = 0;
			} else if (k === 'End') {
				handled = true;
				nc = cols.length - 1;
			} else if (k === 'PageUp') {
				handled = true;
				nr = Math.max(0, r - 5);
			} else if (k === 'PageDown') {
				handled = true;
				nr = Math.min(rows.length - 1, r + 5);
			}
			if (!handled) { return; }
			e.preventDefault();
			e.stopPropagation();
			if (nr !== r || nc !== c) { focusCell(nr, nc); }
		},
		[rows.length, cols.length, focusCell],
	);

	// Focus halo stroke color based on cell fill luminance.
	const haloOuter = (fill: string): string => {
		if (!fill.startsWith('#')) { return '#000000'; }
		return relativeLuminance(fill) > 0.5 ? '#000000' : '#ffffff';
	};

	return (
		<div style={{ position: 'relative' }}>
			{/* Skipped-records status banner */}
			{data.skippedRecordsCount > 0
				? (
					<div
						key={data.skippedRecordsCount}
						role="status"
						aria-atomic="true"
						style={warningBannerStyle}
					>
						{`${data.skippedRecordsCount} record(s) omitted — source node unrecognized (cluster node list may be outdated).`}
					</div>
				)
				: null}

			{/* Visually-hidden title + description */}
			<p
				id={titleId}
				style={{
					position: 'absolute',
					width: 1,
					height: 1,
					padding: 0,
					margin: -1,
					overflow: 'hidden',
					clip: 'rect(0, 0, 0, 0)',
					whiteSpace: 'nowrap',
					border: 0,
				}}
			>
				{title ?? 'Heatmap'}
			</p>
			<p
				id={descId}
				data-testid="heatmap-desc"
				style={{
					position: 'absolute',
					width: 1,
					height: 1,
					padding: 0,
					margin: -1,
					overflow: 'hidden',
					clip: 'rect(0, 0, 0, 0)',
					whiteSpace: 'nowrap',
					border: 0,
				}}
			>
				{(() => {
					const descPrefix = approx
						? `Cells show count-weighted-mean ${measureLabel} (approx).`
						: `Cells show ${measureLabel}.`;
					return `${descPrefix} Cells with fewer than ${suppressBelow} samples are blank; ${greyBelow}–${
						suppressBelow - 1
					} render grey.`;
				})()}
			</p>

			<div ref={wrapperRef} style={{ width: '100%', display: 'block', overflowX: 'auto' }}>
				<svg
					role="grid"
					aria-labelledby={titleId}
					aria-describedby={descId}
					width={svgWidth}
					height={height ?? svgHeight}
					viewBox={`0 0 ${svgWidth} ${svgHeight}`}
					data-cell-size={cellSize}
					style={{ overflow: 'visible', display: 'block' }}
				>
					<defs>
						<pattern
							id={suppressPatternId}
							patternUnits="userSpaceOnUse"
							width={8}
							height={8}
							patternTransform="rotate(45)"
						>
							<rect width={8} height={8} fill={MUTED_BG} />
							<line
								x1={0}
								y1={0}
								x2={0}
								y2={8}
								stroke={MUTED_STROKE}
								strokeWidth={2}
							/>
						</pattern>
					</defs>

					{/* Header row: corner spacer + column headers */}
					<g role="row">
						{/* corner spacer (no role) */}
						<rect
							x={0}
							y={0}
							width={ROW_LABEL_WIDTH}
							height={HEADER_HEIGHT}
							fill="transparent"
							aria-hidden="true"
						/>
						{cols.map((col, ci) => {
							const cx = ROW_LABEL_WIDTH + ci * (cellSize + CELL_GAP) + cellSize / 2;
							const cy = HEADER_HEIGHT - 8;
							const truncateLength = cellSize < 56 ? 8 : 20;
							return (
								<g key={col} role="columnheader" aria-label={col}>
									<text
										x={cx}
										y={cy}
										fontSize={11}
										textAnchor="end"
										transform={`rotate(-45, ${cx}, ${cy})`}
										fill="currentColor"
									>
										{truncate(col, truncateLength)}
										<title>{col}</title>
									</text>
								</g>
							);
						})}
					</g>

					{/* Data rows */}
					{rows.map((row, ri) => {
						const y = HEADER_HEIGHT + ri * (cellSize + CELL_GAP);
						return (
							<g key={row} role="row">
								{/* Row header */}
								<g role="rowheader" aria-label={row}>
									<text
										x={ROW_LABEL_WIDTH - 8}
										y={y + cellSize / 2 + 4}
										fontSize={12}
										textAnchor="end"
										fill="currentColor"
									>
										{truncate(row, 24)}
										<title>{row}</title>
									</text>
								</g>
								{cols.map((col, ci) => {
									const cell = cellMap.get(`${row}|${col}`);
									const confidence = classifyCell(cell, greyBelow, suppressBelow);
									const cx = ROW_LABEL_WIDTH + ci * (cellSize + CELL_GAP);
									const cy = y;
									const aria = cellAriaLabel(row, col, cell, confidence, unit, suppressBelow, approx, measureLabel);

									const isActive = activeRow === ri && activeCol === ci;

									// Visual fill
									let fill = 'transparent';
									let strokeDasharray: string | undefined;
									let opacity = 1;
									let stroke: string | undefined;
									let rectStrokeWidth = 0;

									if (confidence === 'absent') {
										fill = 'transparent';
										strokeDasharray = '3 3';
										stroke = MUTED_STROKE;
										rectStrokeWidth = 1;
									} else if (confidence === 'suppress') {
										fill = `url(#${suppressPatternId})`;
										strokeDasharray = '3 3';
										stroke = MUTED_STROKE;
										rectStrokeWidth = 1;
									} else {
										const t = vmax > vmin ? ((cell?.value ?? 0) - vmin) / (vmax - vmin) : 0;
										fill = interpolateStops(stops, t);
										if (confidence === 'grey') {
											opacity = 0.55;
											strokeDasharray = '4 2';
											stroke = GREY_STROKE;
											rectStrokeWidth = 1;
										}
									}

									const haloFill = confidence === 'ok' || confidence === 'grey'
										? interpolateStops(stops, vmax > vmin ? ((cell?.value ?? 0) - vmin) / (vmax - vmin) : 0)
										: '#808080';
									const outer = haloOuter(haloFill);

									const setRef = (el: SVGGElement | null) => {
										if (el) { cellRefs.current.set(`${ri}|${ci}`, el as unknown as HTMLElement); }
										else { cellRefs.current.delete(`${ri}|${ci}`); }
									};

									return (
										<g
											key={col}
											ref={setRef}
											role="gridcell"
											aria-label={aria}
											data-confidence={confidence}
											tabIndex={isActive ? 0 : -1}
											onKeyDown={(e) => handleKeyDown(e, ri, ci)}
											onFocus={() => setActive([ri, ci])}
											style={{ outline: 'none', cursor: 'default' }}
										>
											<rect
												x={cx}
												y={cy}
												width={cellSize}
												height={cellSize}
												rx={4}
												ry={4}
												style={{ fill }}
												opacity={opacity}
												stroke={stroke}
												strokeWidth={rectStrokeWidth}
												strokeDasharray={strokeDasharray}
											>
												<title>{aria}</title>
											</rect>
											{isActive
												? (
													<>
														<rect
															x={cx - 1}
															y={cy - 1}
															width={cellSize + 2}
															height={cellSize + 2}
															rx={5}
															ry={5}
															fill="none"
															stroke={outer}
															strokeWidth={1}
															pointerEvents="none"
														/>
														<rect
															x={cx}
															y={cy}
															width={cellSize}
															height={cellSize}
															rx={4}
															ry={4}
															fill="none"
															stroke="var(--color-accent, #3b82f6)"
															strokeWidth={1}
															pointerEvents="none"
														/>
													</>
												)
												: null}
										</g>
									);
								})}
							</g>
						);
					})}
				</svg>
			</div>

			{/* Color-scale legend below grid */}
			<div style={{ marginTop: 8 }}>
				<HeatmapColorLegend
					stops={stops}
					vmin={vmin}
					vmax={vmax}
					width={gridWidth}
					axis={data.axis}
					approx={approx}
					measureLabel={measureLabel}
				/>
			</div>
		</div>
	);
}
