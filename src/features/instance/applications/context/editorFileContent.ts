import { isLocalStudio } from '@/config/constants';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { emitToListeners } from '@/lib/events/listener';
import { getSessionStorage } from '@/lib/storage/getSessionStorage';
import { setSessionStorage } from '@/lib/storage/setSessionStorage';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

/** The id the current route's unsaved edits are stored under. */
export function useEditorFileContentId() {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	return isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
}

export function editorFileContentKey(id: string | undefined, path: string | undefined | false) {
	return `EditorFileContent/${id}}/${path}` as 'EditorFileContent/{entityId}/{path}';
}

/** Drop the unsaved edits stored under `key` if they are exactly `saved`, telling every subscriber. */
export function discardEditorFileContentIfSaved(key: ReturnType<typeof editorFileContentKey>, saved: string) {
	if (getSessionStorage(key, undefined as string | undefined) !== saved) {
		return;
	}
	setSessionStorage(key, undefined);
	emitToListeners(`Session:${key}` as 'Session:{key}', undefined);
}

export function useEditorFileContent(path: string | undefined | false) {
	const id = useEditorFileContentId();
	const [updatedContent, setUpdatedContent] = useSessionStorage(
		editorFileContentKey(id, path),
		undefined as string | undefined,
	);

	return useMemo(() => ({
		content: path ? updatedContent : undefined,
		setContent: setUpdatedContent,
	}), [path, updatedContent, setUpdatedContent]);
}
