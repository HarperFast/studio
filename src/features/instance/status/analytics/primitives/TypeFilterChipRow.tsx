// Multi-select chip row for filtering records by a categorical field
// (`type` for traffic panels, `protocol` for connections, etc.). Default
// state = all chips active; click solos that chip; Ctrl-click toggles
// individual chips. Mirrors NodeLegend's interaction model so the panel
// has a consistent dual-legend pattern (TypeFilterChipRow above / below
// the chart, NodeLegend at the bottom). State lives in the shared
// useSoloToggleSelection hook (same one that backs useNodeSelection).

interface Props {
	values: readonly string[];
	colorFor?: (value: string) => string;
	ariaLabel?: string;
}

interface TypeFilterChipRowProps extends Props {
	isActive: (v: string) => boolean;
	onClick: (v: string, ctrlKey: boolean) => void;
}

export function TypeFilterChipRow({
	values,
	isActive,
	onClick,
	colorFor,
	ariaLabel = 'Type filter',
}: TypeFilterChipRowProps) {
	if (values.length === 0) { return null; }
	return (
		<div
			role="group"
			aria-label={ariaLabel}
			className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-[11px]"
		>
			{values.map((v) => {
				const active = isActive(v);
				const color = colorFor ? colorFor(v) : 'var(--color-text-secondary)';
				return (
					<button
						key={v}
						type="button"
						aria-pressed={active}
						data-testid="type-filter-chip"
						data-value={v}
						title="Click to solo · Ctrl-click to toggle"
						onClick={(e) => onClick(v, e.ctrlKey || e.metaKey)}
						className="inline-flex items-center gap-1.5 cursor-pointer border-none bg-transparent p-0"
						style={{ color, opacity: active ? 1 : 0.55 }}
					>
						<span
							className="inline-block h-[3px] w-3 rounded"
							style={{ backgroundColor: color }}
						/>
						<span>{v}</span>
					</button>
				);
			})}
		</div>
	);
}
