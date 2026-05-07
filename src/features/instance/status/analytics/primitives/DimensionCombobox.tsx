// >12-value alternative to DimensionChipRow. Button-triggered popover with a
// search input + filtered listbox. Mirrors ChipRow's API so callers can swap
// based on cardinality. Step 6B ships the primitive; first in-tree consumer
// arrives with db-read/db-write/db-message in a later Step 6 phase.

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

interface DimensionComboboxProps {
	dimensionValues: readonly string[];
	selected: string;
	onSelect: (value: string) => void;
	otherKey?: string;
	colorFor?: (value: string) => string;
	ariaLabel?: string;
}

const DEFAULT_COLOR = 'var(--color-text-secondary)';

export function DimensionCombobox({
	dimensionValues,
	selected,
	onSelect,
	otherKey,
	colorFor,
	ariaLabel = 'Dimension selector',
}: DimensionComboboxProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [activeIdx, setActiveIdx] = useState(0);
	const listboxId = useId();
	const optionIdPrefix = useId();
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const searchRef = useRef<HTMLInputElement | null>(null);

	const filtered = dimensionValues.filter((v) => v.toLowerCase().includes(query.toLowerCase()));

	useEffect(() => {
		if (open) { searchRef.current?.focus(); }
		else { setQuery(''); }
	}, [open]);

	useEffect(() => {
		setActiveIdx(0);
	}, [query]);

	function commit(value: string) {
		onSelect(value);
		setOpen(false);
		triggerRef.current?.focus();
	}

	function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Escape') {
			e.preventDefault();
			setOpen(false);
			triggerRef.current?.focus();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIdx((i) => Math.max(0, i - 1));
			return;
		}
		if (e.key === 'Enter' && filtered[activeIdx] !== undefined) {
			e.preventDefault();
			commit(filtered[activeIdx]);
		}
	}

	const triggerColor = colorFor ? colorFor(selected) : DEFAULT_COLOR;

	return (
		<div className="relative pt-3">
			<button
				ref={triggerRef}
				type="button"
				// WAI-ARIA APG button-pattern combobox: the trigger has
				// aria-haspopup='listbox' but is NOT itself role='combobox'.
				// The searchbox below is the actual combobox element with
				// aria-activedescendant for option highlight tracking.
				aria-label={ariaLabel}
				aria-expanded={open}
				aria-controls={listboxId}
				aria-haspopup="listbox"
				onClick={() => setOpen((v) => !v)}
				className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-primary)"
			>
				<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: triggerColor }} />
				{selected || '— select —'}
				<span aria-hidden>▾</span>
			</button>
			{open && (
				<div className="absolute z-10 mt-1 w-72 rounded-md border border-(--color-border) bg-(--color-surface) p-2 shadow-lg">
					<input
						ref={searchRef}
						// WAI-ARIA APG combobox+listbox INPUT pattern: input is
						// the combobox; listbox is its popup; aria-activedescendant
						// announces the highlighted option as arrow keys navigate.
						role="combobox"
						type="text"
						aria-label={`Filter ${ariaLabel}`}
						aria-expanded={open}
						aria-controls={listboxId}
						aria-autocomplete="list"
						// Empty string instead of omitting the attribute so AT
						// caches don't keep a stale id reference between renders.
						aria-activedescendant={filtered[activeIdx] !== undefined
							? `${optionIdPrefix}-${activeIdx}`
							: ''}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleSearchKey}
						placeholder="Filter…"
						className="mb-2 w-full rounded border border-(--color-border) px-2 py-1 text-xs"
					/>
					{filtered.length === 0 && (
						<div role="status" aria-live="polite" className="px-2 py-1 text-xs text-(--color-text-secondary)">
							No matches
						</div>
					)}
					<ul id={listboxId} role="listbox" className="max-h-56 overflow-auto">
						{filtered.map((value, idx) => {
							const isSelected = value === selected;
							const isActive = idx === activeIdx;
							const color = colorFor ? colorFor(value) : DEFAULT_COLOR;
							return (
								<li
									key={value}
									id={`${optionIdPrefix}-${idx}`}
									role="option"
									aria-selected={isSelected}
									data-active={isActive ? 'true' : undefined}
									onMouseDown={(e) => {
										e.preventDefault();
										commit(value);
									}}
									className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${
										isActive ? 'bg-(--color-surface-alt)' : ''
									} ${isSelected ? 'font-semibold' : ''}`}
								>
									<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
									<span className="truncate">{value}</span>
								</li>
							);
						})}
					</ul>
					{otherKey && (
						<div
							className="mt-2 border-t border-(--color-border) pt-2 text-xs text-(--color-text-secondary)/60"
							title="Aggregate of smaller buckets; not selectable."
						>
							{otherKey} (aggregate; not selectable)
						</div>
					)}
				</div>
			)}
		</div>
	);
}
