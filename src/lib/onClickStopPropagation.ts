import { BaseSyntheticEvent } from 'react';

export function onClickStopPropagation(e: BaseSyntheticEvent) {
	e.stopPropagation();
}
