import { isLocalStudio } from '@/config/constants';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { readSessionValue, writeSessionValue } from '@/lib/storage/sessionStorageStore';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

type EditorFileContentKey = 'EditorFileContent/{entityId}/{path}';

export function useEditorFileContentId() {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	return isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
}

/**
 * Keep the doubled `}` after the id: every buffer already stored in an open tab has it, and dropping
 * it would orphan their unsaved edits.
 */
export function editorFileContentKey(id: string | undefined, path: string | undefined | false) {
	return `EditorFileContent/${id}}/${path}` as EditorFileContentKey;
}

export function discardEditorFileContentIfSaved(key: EditorFileContentKey, saved: string) {
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

function writeEditorFileContent(key: EditorFileContentKey, content: string | undefined) {
	writeSessionValue(key, undefined as string | undefined, content);
}

function readEditorFileContent(key: EditorFileContentKey) {
	return readSessionValue(key, undefined as string | undefined);
}

// The store can't list its keys, so the keys under a folder come from what session storage persisted. A
// buffer the store holds only in memory, because storage refused it, is found at its exact path only.
function editorFileContentKeysAtOrUnder(entityId: string, path: string): EditorFileContentKey[] {
	const exact = editorFileContentKey(entityId, path);
	const under = editorFileContentKey(entityId, `${path}/`);
	const keys = new Set<string>([exact]);
	for (let i = 0; i < sessionStorage.length; i++) {
		const key = sessionStorage.key(i);
		if (key?.startsWith(under)) {
			keys.add(key);
		}
	}
	return [...keys] as EditorFileContentKey[];
}

export function discardEditorFileContent(entityId: string, path: string) {
	for (const key of editorFileContentKeysAtOrUnder(entityId, path)) {
		writeEditorFileContent(key, undefined);
	}
}

/**
 * A buffer at a moved file's new path belonged to the file the move replaced, so it goes. The rest
 * of a destination folder is merged into, not replaced, and keeps its buffers.
 */
export function moveEditorFileContent(entityId: string, from: string, to: string) {
	carryEditorFileContent(entityId, from, to, false);
}

/** As {@link moveEditorFileContent}, but the edits stay at `from` too. */
export function copyEditorFileContent(entityId: string, from: string, to: string) {
	carryEditorFileContent(entityId, from, to, true);
}

function carryEditorFileContent(entityId: string, from: string, to: string, keepSource: boolean) {
	const fromKey = editorFileContentKey(entityId, from);
	const toKey = editorFileContentKey(entityId, to);
	const moves = editorFileContentKeysAtOrUnder(entityId, from).map(key => ({
		from: key,
		to: toKey + key.slice(fromKey.length) as EditorFileContentKey,
		content: readEditorFileContent(key),
	}));
	for (const move of moves) {
		writeEditorFileContent(move.to, move.content);
	}
	if (!keepSource) {
		for (const move of moves) {
			writeEditorFileContent(move.from, undefined);
		}
	}
}
