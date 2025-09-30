import { MouseEvent, useCallback, useState } from 'react';

export function useToggleCallback(defaultValue?: boolean) {
	const [state, setState] = useState<boolean>(defaultValue || false);
	const onClick = useCallback((e: MouseEvent) => {
		e.preventDefault();
		setState((checked: boolean) => {
			return !checked;
		});
		return false;
	}, []);
	return [state, onClick] as const;
}
