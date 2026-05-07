import { useCallback, useState } from 'react';

export function useNodeSelection(nodeIds: string[]) {
	const [activeNodes, setActiveNodes] = useState<Set<string> | null>(null);

	const isActive = useCallback((nodeId: string) => {
		return activeNodes === null || activeNodes.has(nodeId);
	}, [activeNodes]);

	const handleLegendClick = useCallback((nodeId: string, ctrlKey: boolean) => {
		setActiveNodes((prev) => {
			if (ctrlKey) {
				if (prev === null) {
					return new Set(nodeIds.filter((id) => id !== nodeId));
				}
				const next = new Set(prev);
				if (next.has(nodeId)) {
					next.delete(nodeId);
					if (next.size === 0) { return null; }
				} else {
					next.add(nodeId);
					if (next.size === nodeIds.length) { return null; }
				}
				return next;
			}
			if (prev !== null && prev.size === 1 && prev.has(nodeId)) {
				return null;
			}
			return new Set([nodeId]);
		});
	}, [nodeIds]);

	return { isActive, handleLegendClick, activeNodes };
}
