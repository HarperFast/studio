import { isLocalStudio } from '@/config/constants';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { OverallAppSignIn } from '@/lib/authStore';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

export function useEditorFileContent(path: string | undefined | false) {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	const [updatedContent, setUpdatedContent] = useSessionStorage(`EditorFileContent/${id}}/${path}` as 'EditorFileContent/{entityId}/{path}', undefined as string | undefined);

	return useMemo(() => ({
		content: path ? updatedContent : undefined,
		setContent: setUpdatedContent,
	}), [path, updatedContent, setUpdatedContent]);
}
