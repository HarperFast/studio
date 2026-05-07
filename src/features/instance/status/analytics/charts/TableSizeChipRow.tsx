import { type KeyboardEvent, useEffect, useRef } from 'react';
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
	const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

	useEffect(() => {
		chipRefs.current = chipRefs.current.slice(0, tableSet.length);
	}, [tableSet.length]);

	// Figure out which chip gets tabIndex=0. Default to the selected chip; if
	// selectedTable is not in tableSet (e.g. transient refetch gap, or selection
	// is `Other`), fall back to the first chip so the radiogroup stays reachable.
	const activeIdx = selectedTable === null ? -1 : tableSet.indexOf(selectedTable);
	const tabbableIdx = activeIdx >= 0 ? activeIdx : 0;

	function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelectTable(tableSet[idx]);
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
		const n = tableSet.length;
		if (n === 0) { return; }
		let next = idx;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = (idx + 1) % n; }
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = (idx - 1 + n) % n; }
		chipRefs.current[next]?.focus();
		onSelectTable(tableSet[next]);
	}

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
						ref={(el) => {
							chipRefs.current[idx] = el;
						}}
						role="radio"
						aria-checked={selected}
						tabIndex={idx === tabbableIdx ? 0 : -1}
						data-testid="table-size-chip"
						data-table={tableKey}
						onKeyDown={(e) => handleKeyDown(e, idx)}
						onClick={() => onSelectTable(tableKey)}
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
