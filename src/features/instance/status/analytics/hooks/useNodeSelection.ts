// Node-legend flavor of the shared solo/Ctrl-toggle hook. Kept as a named
// wrapper because many chart/renderer call sites destructure
// `handleLegendClick`.

import { useSoloToggleSelection } from './useSoloToggleSelection';

export function useNodeSelection(nodeIds: string[]) {
	const { isActive, handleClick, activeSet } = useSoloToggleSelection(nodeIds);
	return { isActive, handleLegendClick: handleClick, activeNodes: activeSet };
}
