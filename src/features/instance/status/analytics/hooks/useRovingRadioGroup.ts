// Shared roving-tabindex radiogroup behavior (WAI-ARIA APG "Radio Group"
// pattern): exactly one radio is in the tab order — the selected one, falling
// back to the first — arrow keys move focus AND selection with wrap-around,
// and Enter/Space select the focused radio. Used by every single-select
// chip/segmented selector in the Status analytics dashboards
// (DimensionChipRow, TableSizeChipRow, StackByToggle, quantile picker) so the
// keyboard contract can't drift between them.

import { type KeyboardEvent, useEffect, useRef } from 'react';

export function useRovingRadioGroup<T extends string, E extends HTMLElement = HTMLButtonElement>(
	values: readonly T[],
	selected: T | null,
	onSelect: (value: T) => void,
) {
	const radioRefs = useRef<Array<E | null>>([]);

	useEffect(() => {
		radioRefs.current = radioRefs.current.slice(0, values.length);
	}, [values.length]);

	const selectedIdx = selected === null ? -1 : values.indexOf(selected);
	// Default the tab stop to the selected radio; if the selection isn't in
	// `values` (transient refetch gap, or a non-selectable aggregate), fall
	// back to the first radio so the group stays keyboard-reachable.
	const tabbableIdx = selectedIdx >= 0 ? selectedIdx : 0;

	function handleKeyDown(e: KeyboardEvent<E>, idx: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(values[idx]);
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
		const n = values.length;
		if (n === 0) { return; }
		const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
		const next = (idx + dir + n) % n;
		radioRefs.current[next]?.focus();
		onSelect(values[next]);
	}

	/** ARIA + interaction props to spread onto each radio element, in
	 *  `values` order. The caller still owns rendering (element type,
	 *  className, children). */
	function getRadioProps(idx: number) {
		return {
			role: 'radio' as const,
			'aria-checked': idx === selectedIdx,
			tabIndex: idx === tabbableIdx ? 0 : -1,
			ref: (el: E | null) => {
				radioRefs.current[idx] = el;
			},
			onKeyDown: (e: KeyboardEvent<E>) => handleKeyDown(e, idx),
			onClick: () => onSelect(values[idx]),
		};
	}

	return { getRadioProps, selectedIdx };
}
