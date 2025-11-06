import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useToggler } from '@/hooks/useToggler';
import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';
import { MouseEvent, useCallback, useMemo } from 'react';

export function useSessionToggler<K extends keyof SessionStorageKeys>(key: K, defaultValue: boolean = false): ReturnType<typeof useToggler> {
	const [toggled, setToggled] = useSessionStorage(key, defaultValue);

	const toggle = useCallback((e?: MouseEvent | unknown) => {
		(e as MouseEvent)?.preventDefault?.();
		setToggled((checked: boolean) => {
			return !checked;
		});
	}, [setToggled]);
	const toggleOn = useCallback((e?: MouseEvent | unknown) => {
		(e as MouseEvent)?.preventDefault?.();
		setToggled(true);
	}, [setToggled]);
	const toggleOff = useCallback((e?: MouseEvent | unknown) => {
		(e as MouseEvent)?.preventDefault?.();
		setToggled(false);
	}, [setToggled]);

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
