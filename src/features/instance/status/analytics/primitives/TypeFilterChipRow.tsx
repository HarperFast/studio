// Multi-select chip row for filtering records by a categorical field
// (`type` for traffic panels, `protocol` for connections, etc.). Default
// state = all chips active; click solos that chip; Ctrl-click toggles
// individual chips. Mirrors NodeLegend's interaction model so the panel
// has a consistent dual-legend pattern (TypeFilterChipRow above / below
// the chart, NodeLegend at the bottom).

import { useCallback, useMemo, useState } from 'react';

interface Props {
	values: readonly string[];
	colorFor?: (value: string) => string;
	ariaLabel?: string;
}

export interface TypeFilterState {
	isActive: (value: string) => boolean;
	activeValues: readonly string[];
}

/** Hook holding active-set state + the click handler. Component below
 *  consumes both. Separating them lets the parent renderer use
 *  `isActive` to filter records in the same render pass. */
export function useTypeFilter(values: readonly string[]) {
	const [active, setActive] = useState<Set<string> | null>(null);

	const isActive = useCallback((v: string) => active === null || active.has(v), [active]);

	const handleClick = useCallback((v: string, ctrlKey: boolean) => {
		setActive((prev) => {
			if (ctrlKey) {
				if (prev === null) { return new Set(values.filter((x) => x !== v)); }
				const next = new Set(prev);
				if (next.has(v)) {
					next.delete(v);
					if (next.size === 0) { return null; }
				} else {
					next.add(v);
					if (next.size === values.length) { return null; }
				}
				return next;
			}
			// Plain click: solo (or reset if already soloed)
			if (prev !== null && prev.size === 1 && prev.has(v)) { return null; }
			return new Set([v]);
		});
	}, [values]);

	const activeValues = useMemo(
		() => (active === null ? values : values.filter((v) => active.has(v))),
		[active, values],
	);

	return { isActive, handleClick, activeValues };
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
						style={{ color, opacity: active ? 1 : 0.3 }}
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
