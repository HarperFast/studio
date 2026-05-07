// Single-select chip row used by the Requests / Database / Health
// renderers (DimensionSelectorRenderer, ConnectionRenderer, etc.). Visually
// matches TypeFilterChipRow used by the Traffic tab — minimal inline-flex
// text + a tiny colored bar — so chip selectors look the same across
// every analytics dashboard. Behaviorally still a radiogroup: one value
// active at a time, arrow keys move focus and selection.

import { type KeyboardEvent, useEffect, useRef } from 'react';

interface DimensionChipRowProps {
	/** Selectable dimension values, in display order. */
	dimensionValues: readonly string[];
	/** Currently-selected value. */
	selected: string;
	/** Called on click, Enter/Space, or arrow-key traversal. Per the radiogroup
	 *  pattern, arrow keys move focus AND selection. */
	onSelect: (value: string) => void;
	/** When provided, renders a non-interactive trailing chip (e.g. 'Other'). */
	otherKey?: string;
	/** Optional palette callback — receives a dimension value and returns a CSS color. */
	colorFor?: (value: string) => string;
	/** ARIA label for the radiogroup. */
	ariaLabel?: string;
}

const DEFAULT_COLOR = 'var(--color-text-secondary)';

export function DimensionChipRow({
	dimensionValues,
	selected,
	onSelect,
	otherKey,
	colorFor,
	ariaLabel = 'Dimension selector',
}: DimensionChipRowProps) {
	const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

	useEffect(() => {
		chipRefs.current = chipRefs.current.slice(0, dimensionValues.length);
	}, [dimensionValues.length]);

	const activeIdx = dimensionValues.indexOf(selected);
	const tabbableIdx = activeIdx >= 0 ? activeIdx : 0;

	function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(dimensionValues[idx]);
			return;
		}
		if (
			e.key !== 'ArrowLeft'
			&& e.key !== 'ArrowRight'
			&& e.key !== 'ArrowDown'
			&& e.key !== 'ArrowUp'
		) {
			return;
		}
		e.preventDefault();
		const n = dimensionValues.length;
		if (n === 0) { return; }
		let next = idx;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = (idx + 1) % n; }
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = (idx - 1 + n) % n; }
		chipRefs.current[next]?.focus();
		onSelect(dimensionValues[next]);
	}

	if (dimensionValues.length === 0 && !otherKey) { return null; }

	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			data-testid="dimension-chip-row"
			className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-[11px]"
		>
			{dimensionValues.map((value, idx) => {
				const isSelected = value === selected;
				const color = colorFor ? colorFor(value) : DEFAULT_COLOR;
				return (
					<button
						key={value}
						ref={(el) => {
							chipRefs.current[idx] = el;
						}}
						type="button"
						role="radio"
						aria-checked={isSelected}
						tabIndex={idx === tabbableIdx ? 0 : -1}
						data-testid="dimension-chip"
						data-value={value}
						title="Click to select"
						onKeyDown={(e) => handleKeyDown(e, idx)}
						onClick={() => onSelect(value)}
						className="inline-flex items-center gap-1.5 cursor-pointer border-none bg-transparent p-0"
						style={{ color, opacity: isSelected ? 1 : 0.3 }}
					>
						<span
							className="inline-block h-[3px] w-3 rounded"
							style={{ backgroundColor: color }}
						/>
						<span>{value}</span>
					</button>
				);
			})}
			{otherKey && (
				<span
					data-testid="dimension-chip"
					data-value={otherKey}
					aria-disabled="true"
					title="Aggregate of smaller buckets; not selectable."
					className="inline-flex items-center gap-1.5 cursor-not-allowed"
					style={{ color: DEFAULT_COLOR, opacity: 0.4 }}
				>
					<span
						className="inline-block h-[3px] w-3 rounded"
						style={{ backgroundColor: DEFAULT_COLOR }}
					/>
					<span>{otherKey}</span>
				</span>
			)}
		</div>
	);
}
