import { isLocalStudio } from '@/config/constants';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { writeSessionValue } from '@/lib/storage/sessionStorageStore';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

export function useEditorFileContentId() {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	return isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
}

export function editorFileContentKey(id: string | undefined, path: string | undefined | false) {
	return `EditorFileContent/${id}}/${path}` as 'EditorFileContent/{entityId}/{path}';
}

export function discardEditorFileContentIfSaved(key: ReturnType<typeof editorFileContentKey>, saved: string) {
	writeSessionValue(key, undefined as string | undefined, current => current === saved ? undefined : current);
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
