// Single-select chip row used by the Requests / Database / Health
// renderers (DimensionSelectorRenderer, ConnectionRenderer, etc.). Visually
// matches TypeFilterChipRow used by the Traffic tab — minimal inline-flex
// text + a tiny colored bar — so chip selectors look the same across
// every analytics dashboard. Behaviorally still a radiogroup: one value
// active at a time, arrow keys move focus and selection
// (useRovingRadioGroup).

import { useRovingRadioGroup } from '../hooks/useRovingRadioGroup.ts';

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
	const { getRadioProps } = useRovingRadioGroup(dimensionValues, selected, onSelect);

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
						type="button"
						{...getRadioProps(idx)}
						data-testid="dimension-chip"
						data-value={value}
						title="Click to select"
						className="inline-flex items-center gap-1.5 cursor-pointer border-none bg-transparent p-0"
						style={{ color, opacity: isSelected ? 1 : 0.55 }}
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
				<button
					type="button"
					// Disabled radio, not a role-less span: SR users perceive it as
					// part of the group with an explicit disabled state. Kept out of
					// the roving tab order (tabIndex=-1) so the group stays a single
					// tab stop. Mirrors TableSizeChipRow's Other treatment.
					role="radio"
					aria-checked={false}
					aria-disabled="true"
					tabIndex={-1}
					data-testid="dimension-chip"
					data-value={otherKey}
					title="Aggregate of smaller buckets; not selectable."
					className="inline-flex items-center gap-1.5 cursor-not-allowed border-none bg-transparent p-0"
					style={{ color: DEFAULT_COLOR, opacity: 0.4 }}
				>
					<span
						className="inline-block h-[3px] w-3 rounded"
						style={{ backgroundColor: DEFAULT_COLOR }}
					/>
					<span>{otherKey}</span>
				</button>
			)}
		</div>
	);
}
