import { MouseEvent, useCallback, useMemo, useState } from 'react';

export function useToggler(defaultValue?: boolean) {
	const [toggled, setToggled] = useState<boolean>(defaultValue || false);
	const toggle = useCallback((e?: MouseEvent | unknown) => {
		(e as MouseEvent)?.preventDefault?.();
		setToggled((checked: boolean) => {
			return !checked;
		});
	}, []);
	const toggleOn = useCallback((e?: MouseEvent | unknown) => {
		(e as MouseEvent)?.preventDefault?.();
		setToggled(true);
	}, []);
	const toggleOff = useCallback((e?: MouseEvent | unknown) => {
		(e as MouseEvent)?.preventDefault?.();
		setToggled(false);
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
