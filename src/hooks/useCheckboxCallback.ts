import { ChangeEvent, useCallback, useState } from 'react';

export function useCheckboxCallback(defaultValue?: boolean) {
	const [state, setState] = useState<boolean>(defaultValue || false);
	const onClick = useCallback((e: boolean | ChangeEvent<HTMLInputElement>) => {
		setState(typeof e === 'boolean' ? e : e.target.checked);
	}, []);
	return [state, onClick] as const;
}
