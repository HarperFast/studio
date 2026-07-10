import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useEffect, useMemo, useState } from 'react';
import type { TreeItemIndex } from 'react-complex-tree';
import { tableItemId } from './buildItems';

/**
 * Owns the controlled tree view state (focus / expansion / selection). Selection is derived from the
 * route (the open database/table is the selected row); expansion is persisted per instance in session
 * storage. Navigation itself lives in the tree component -- this hook only tracks state.
 */
export function useDatabaseTreeViewState({ databaseName, tableName }: {
	databaseName?: string;
	tableName?: string;
}) {
	const { entityId } = useInstanceClientIdParams();

	const selectedItems = useMemo<TreeItemIndex[]>(() => {
		if (databaseName && tableName) {
			return [tableItemId(databaseName, tableName)];
		}
		if (databaseName) {
			return [databaseName];
		}
		return [];
	}, [databaseName, tableName]);

	const [focusedItem, setFocusedItem] = useState<TreeItemIndex | undefined>(selectedItems[0]);
	// Re-sync keyboard focus to the open row whenever the route changes (deep link, nav from elsewhere).
	useEffect(() => {
		if (selectedItems[0] !== undefined) {
			setFocusedItem(selectedItems[0]);
		}
	}, [selectedItems]);

	const [expandedItems, setExpandedItems] = useSessionStorage(
		`DatabaseTreeExpanded/${entityId}` as 'DatabaseTreeExpanded/{entityId}',
		(databaseName ? [databaseName] : []) as TreeItemIndex[],
	);
	// The active database must always be expanded (e.g. deep-linking into a collapsed one).
	useEffect(() => {
		if (databaseName) {
			setExpandedItems(prev => (prev.includes(databaseName) ? prev : [...prev, databaseName]));
		}
	}, [databaseName, setExpandedItems]);

	return { focusedItem, setFocusedItem, expandedItems, setExpandedItems, selectedItems };
}
