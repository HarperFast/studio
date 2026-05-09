// Shared tooltip surface for all analytics chart primitives. Resolves to
// Studio's --popover token (via --chart-tooltip-bg) so LineChart,
// StackedAreaChart, and HeatmapMatrix all hover with the same surface
// the rest of Studio uses for HoverCard/Tooltip, instead of Recharts'
// default white box or a stray --color-bg-secondary.

import type { CSSProperties } from 'react';

export const tooltipContentStyle: CSSProperties = {
	background: 'var(--chart-tooltip-bg)',
	color: 'var(--chart-tooltip-fg)',
	border: '1px solid var(--border)',
	borderRadius: 6,
	boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
	padding: 8,
	fontSize: 12,
};

export const tooltipLabelStyle: CSSProperties = {
	color: 'var(--chart-tooltip-fg)',
	opacity: 0.7,
	marginBottom: 4,
	fontSize: 11,
};

export const tooltipItemStyle: CSSProperties = {
	color: 'var(--chart-tooltip-fg)',
};
