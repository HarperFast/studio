import { useRovingRadioGroup } from '../hooks/useRovingRadioGroup.ts';
import { getTableColor, OTHER_COLOR } from '../lib/tableColors.ts';
import { OTHER_KEY } from '../lib/tableSize.ts';

interface TableSizeChipRowProps {
	/** Selectable table keys, in display order. */
	tableSet: string[];
	/** Whether to render a non-interactive "Other" chip. */
	hasOther: boolean;
	/** Currently-selected table key (or null). */
	selectedTable: string | null;
	/**
	 * Called when the user picks a chip via click, Enter, Space, or arrow-key
	 * traversal. Per the ARIA radiogroup pattern, arrow keys move focus AND
	 * selection — both routes pin `manualSelection=true` in Dashboard so the
	 * pick survives subsequent data refreshes until the selected table
	 * disappears from `tableSet`.
	 */
	onSelectTable: (tableKey: string) => void;
}

export function TableSizeChipRow({
	tableSet,
	hasOther,
	selectedTable,
	onSelectTable,
}: TableSizeChipRowProps) {
	// Roving tabindex: the selected chip gets tabIndex=0; if selectedTable is
	// not in tableSet (transient refetch gap, or selection is `Other`), the
	// hook falls back to the first chip so the radiogroup stays reachable.
	const { getRadioProps } = useRovingRadioGroup(tableSet, selectedTable, onSelectTable);

	if (tableSet.length === 0 && !hasOther) { return null; }

	return (
		<div
			role="radiogroup"
			aria-label="Table selector"
			data-testid="table-size-chip-row"
			className="flex flex-wrap gap-2 pt-3"
		>
			{tableSet.map((tableKey, idx) => {
				const selected = tableKey === selectedTable;
				const color = getTableColor(idx);
				return (
					<button
						key={tableKey}
						type="button"
						{...getRadioProps(idx)}
						data-testid="table-size-chip"
						data-table={tableKey}
						className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
							selected
								? 'font-semibold text-(--color-text-primary)'
								: 'border-(--color-border) text-(--color-text-secondary) hover:text-(--color-text-primary)'
						}`}
						style={{ borderColor: selected ? color : undefined }}
					>
						<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
						{tableKey}
					</button>
				);
			})}
			{hasOther && (
				<button
					type="button"
					role="radio"
					aria-checked={false}
					aria-disabled="true"
					tabIndex={-1}
					data-testid="table-size-chip"
					data-table={OTHER_KEY}
					title="Aggregate of smaller tables; not selectable."
					className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-dashed border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-secondary)/60 cursor-not-allowed"
				>
					<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: OTHER_COLOR }} />
					Other
				</button>
			)}
		</div>
	);
}
