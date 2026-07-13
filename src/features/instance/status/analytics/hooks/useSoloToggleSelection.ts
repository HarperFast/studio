// Solo / Ctrl-toggle selection over a categorical value set, shared by the
// node legend (useNodeSelection) and the type-filter chip rows. `null` is the
// default "everything active" state; plain click solos a value (or resets if
// it's already the solo), Ctrl/Cmd-click toggles individual values, and the
// set collapses back to `null` when it would become empty or complete.

import { useCallback, useRef, useState } from 'react';

export function useSoloToggleSelection(values: readonly string[]) {
	const [activeSet, setActiveSet] = useState<Set<string> | null>(null);
	// Read `values` through a ref so handleClick stays reference-stable even
	// when callers pass a freshly-derived array each render.
	const valuesRef = useRef(values);
	valuesRef.current = values;

	const isActive = useCallback(
		(value: string) => activeSet === null || activeSet.has(value),
		[activeSet],
	);

	const handleClick = useCallback((value: string, ctrlKey: boolean) => {
		const values = valuesRef.current;
		setActiveSet((prev) => {
			if (ctrlKey) {
				if (prev === null) { return new Set(values.filter((v) => v !== value)); }
				const next = new Set(prev);
				if (next.has(value)) {
					next.delete(value);
					if (next.size === 0) { return null; }
				} else {
					next.add(value);
					if (next.size === values.length) { return null; }
				}
				return next;
			}
			// Plain click: solo (or reset to all if already soloed)
			if (prev !== null && prev.size === 1 && prev.has(value)) { return null; }
			return new Set([value]);
		});
	}, []);

	return { isActive, handleClick, activeSet };
}
