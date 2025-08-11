import { shallowCompareObjects } from '@/lib/arrays/shallowCompareObjects';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export function useEffectedState<S>(initialState: S, deps: unknown): [S, Dispatch<SetStateAction<S>>] {
	const [currentDeps, setDeps] = useState(deps);
	const [currentState, setCurrentState] = useState<S>(initialState);

	// Use the proper React hook so we can update the state more permanently.
	useEffect(() => {
		if (!shallowCompareObjects(currentDeps, deps)) {
			setDeps(deps);
			setCurrentState(initialState);
		}
	}, [currentDeps, deps, initialState]);

	// But also watch it so we can immediately patch the state.
	if (!shallowCompareObjects(currentDeps, deps)) {
		return [initialState, setCurrentState];
	}

	return [currentState, setCurrentState];
}
