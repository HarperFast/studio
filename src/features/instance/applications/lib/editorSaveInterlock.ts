/** The rules are in `../DESIGN.md`, under "Saving a file". */
import type { SetComponentFileRequest } from '@/integrations/api/instance/applications/setComponentFile';
import type { QueryClient } from '@tanstack/react-query';

export const editorSaveKey = ['set_component_file', 'editor'] as const;

export function editorSavesInFlight(queryClient: QueryClient): SetComponentFileRequest[] {
	return queryClient.getMutationCache().findAll({ mutationKey: editorSaveKey, status: 'pending' })
		.map(mutation => mutation.state.variables as SetComponentFileRequest);
}

const renamesInFlight = new Map<string, number>();

export function startRename(entityId: string): () => void {
	renamesInFlight.set(entityId, (renamesInFlight.get(entityId) ?? 0) + 1);
	return () => {
		const remaining = (renamesInFlight.get(entityId) ?? 1) - 1;
		if (remaining > 0) {
			renamesInFlight.set(entityId, remaining);
		} else {
			renamesInFlight.delete(entityId);
		}
	};
}

export function isRenaming(entityId: string): boolean {
	return renamesInFlight.has(entityId);
}
