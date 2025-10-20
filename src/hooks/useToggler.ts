import { MouseEvent, useCallback, useMemo, useState } from 'react';

export function useToggler(defaultValue?: boolean) {
	const [toggled, setToggled] = useState<boolean>(defaultValue || false);
	const toggle = useCallback((e: MouseEvent) => {
		e.preventDefault();
		setToggled((checked: boolean) => {
			return !checked;
		});
		return false;
	}, []);
	const toggleOn = useCallback((e?: MouseEvent) => {
		e?.preventDefault();
		setToggled(true);
		return false;
	}, []);
	const toggleOff = useCallback((e?: MouseEvent) => {
		e?.preventDefault();
		setToggled(false);
		return false;
	}, []);
	return useMemo(() => {
		return {
			toggled,
			setToggled,
			toggle,
			toggleOn,
			toggleOff,
		};
	}, [toggle, setToggled, toggleOff, toggleOn, toggled]);
}
