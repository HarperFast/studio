import { ChangeEvent, useCallback, useState } from 'react';

export function useCheckboxCallback(defaultValue?: boolean) {
	const [state, setState] = useState<boolean>(defaultValue || false);
	const onClick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		setState(e.target.checked);
	}, []);
	return [state, onClick] as const;
}
