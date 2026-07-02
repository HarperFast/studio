/**
 * A secrets-style editor for an application's `.env` files, replacing the raw text editor so
 * values aren't flashed on screen (or clobbered) by accident. It adapts to what the connected
 * Harper can do, duck-typed off the `get_component_file` response rather than a version check:
 *
 *  - Older Harper returns the raw file text → keys and values are parsed client-side, values are
 *    masked behind a deliberate click-to-reveal, and every add/edit/delete rewrites the whole
 *    file through `set_component_file` (merge-preserving, comments intact). An "Edit as text"
 *    escape hatch keeps the raw Monaco editor available.
 *
 *  - Harper >= 5.2 protects `.env` files (`protected: true`, masked message, key names only) →
 *    values can never be read back, so there is no reveal and no raw editing (saving the masked
 *    rendering would destroy the real values); adds/edits/deletes go through the key-level
 *    `set_env_value` / `delete_env_value` operations instead.
 *
 * Template files (`.env.example` etc.) never reach this view — they aren't secret and keep the
 * plain text editor (see ContentViewer).
 */
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { SecretRow, SecretsManager } from '@/features/instance/secrets/SecretsManager';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useDeleteEnvValue, useSetEnvValue } from '@/integrations/api/instance/applications/envValues';
import {
	getComponentFileQueryKey,
	getComponentFileQueryOptions,
	GetComponentFileResponse,
} from '@/integrations/api/instance/applications/getComponentFile';
import { useSetComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { parseEnv, removeEnvKeys, renderMaskedEnv, upsertEnvValues } from '@/lib/env/envFile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeIcon, ShieldCheckIcon, Table2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { TextEditorView } from '../TextEditorView';

export function EnvEditorView() {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const { openedEntry } = useEditorView();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const path = openedEntry?.path ?? '';
	const project = openedEntry?.project ?? '';
	const file = path.split('/').slice(1).join('/');
	const fileQueryKey = getComponentFileQueryKey({ file, project, ...instanceParams });
	const { data, isFetching, refetch } = useQuery(
		getComponentFileQueryOptions({ file, project, ...instanceParams }),
	);

	// Unsaved edits from the raw text view. The secrets table is a GUI over the same buffer the
	// text editor shows, so it parses (and writes back) the dirty content when there is any.
	const { content: updatedFileContent, setContent } = useEditorFileContent(
		!!openedEntry && !openedEntry.package && path,
	);

	const isProtected = data?.protected === true;
	const rawText = updatedFileContent ?? data?.message;

	const rows = useMemo<SecretRow[]>(() => {
		if (!data) {
			return [];
		}
		if (isProtected) {
			return (data.keys ?? []).map((name) => ({ name }));
		}
		return Object.entries(parseEnv(rawText ?? '')).map(([name, value]) => ({ name, value }));
	}, [data, isProtected, rawText]);

	const canManage = !!openedEntry && !openedEntry.package && canManageBrowseInstance;

	/*
	 Persistence, per mode. Plaintext-mode writes go through the ordinary whole-file save and then
	 sync the query cache (the EditorViewProvider derives the opened contents from it). Protected-
	 mode writes go through the key-level operations, whose responses carry the resulting key list.
	 */
	const { mutateAsync: writeComponentFile } = useSetComponentFile();
	const { mutateAsync: setEnvValueAsync } = useSetEnvValue();
	const { mutateAsync: deleteEnvValueAsync } = useDeleteEnvValue();

	const writeWholeFile = useCallback(async (next: string) => {
		await writeComponentFile({ ...instanceParams, project, file, payload: next });
		queryClient.setQueryData<GetComponentFileResponse>(
			fileQueryKey,
			(old) => old && { ...old, message: next },
		);
		setContent(undefined); // the raw buffer (dirty edits included) is now saved
	}, [writeComponentFile, instanceParams, project, file, queryClient, fileQueryKey, setContent]);

	const applyProtectedKeys = useCallback((keys: string[]) => {
		queryClient.setQueryData<GetComponentFileResponse>(
			fileQueryKey,
			(old) => old && { ...old, keys, message: renderMaskedEnv(keys) },
		);
	}, [queryClient, fileQueryKey]);

	const onSet = useCallback(async (key: string, value: string) => {
		if (isProtected) {
			const response = await setEnvValueAsync({ ...instanceParams, project, file, key, value });
			applyProtectedKeys(response.keys);
		} else {
			await writeWholeFile(upsertEnvValues(rawText ?? '', { [key]: value }));
		}
	}, [isProtected, setEnvValueAsync, instanceParams, project, file, applyProtectedKeys, writeWholeFile, rawText]);

	const onDelete = useCallback(async (key: string) => {
		if (isProtected) {
			const response = await deleteEnvValueAsync({ ...instanceParams, project, file, key });
			applyProtectedKeys(response.keys);
		} else {
			await writeWholeFile(removeEnvKeys(rawText ?? '', key));
		}
	}, [isProtected, deleteEnvValueAsync, instanceParams, project, file, applyProtectedKeys, writeWholeFile, rawText]);

	const [selectedName, setSelectedName] = useState<string | undefined>(undefined);
	const onRefresh = useCallback(() => refetch(), [refetch]);

	// The raw-text escape hatch, for plaintext mode only: on a protected file the editor would
	// show the masked rendering, and saving that back would overwrite the real values.
	const [showRawEditor, setShowRawEditor] = useState(false);
	if (showRawEditor && !isProtected) {
		return (
			<>
				<TextEditorView />
				<Button
					type="button"
					variant="defaultOutline"
					size="sm"
					className="absolute top-11 right-4 z-10"
					onClick={() => setShowRawEditor(false)}
				>
					<Table2Icon /> Secrets view
				</Button>
			</>
		);
	}

	return (
		<div className="pt-12 px-4 pb-8 max-w-4xl">
			<div className="mb-4">
				<h2 className="text-lg font-semibold text-foreground">{openedEntry?.name}</h2>
				<p className="text-sm text-muted-foreground">
					{isProtected
						? (
							<>
								<ShieldCheckIcon className="inline-block size-4 me-1 align-text-bottom" />
								This Harper version protects environment secrets: values stay on the instance and are edited by key —
								they can be replaced or removed, but never read back.
							</>
						)
						: 'Values are masked to prevent accidental disclosure. Revealing one is a deliberate action.'}
				</p>
				{!isProtected && updatedFileContent !== undefined && (
					<p className="text-sm text-muted-foreground mt-1">
						Showing unsaved changes from the text editor — saving a secret writes those too.
					</p>
				)}
			</div>
			<SecretsManager
				rows={rows}
				isFetching={isFetching}
				onRefresh={onRefresh}
				canManage={canManage}
				selectedName={selectedName}
				onSelectName={setSelectedName}
				addDescription={isProtected
					? 'The value is written to this application’s env file on the instance. It can be replaced or removed later, but never read back.'
					: `The value is written to ${openedEntry?.name ?? 'this env file'} in this application.`}
				editDescription={isProtected
					? 'The current value can’t be shown — this Harper version never returns secret values. Enter a new value to replace it, or delete the secret.'
					: 'Reveal the current value, or enter a replacement.'}
				onSet={onSet}
				onDelete={canManage ? onDelete : undefined}
			>
				{!isProtected && (
					<Button variant="defaultOutline" onClick={() => setShowRawEditor(true)}>
						<CodeIcon />
						<span className="hidden lg:inline-block">Edit as text</span>
					</Button>
				)}
			</SecretsManager>
		</div>
	);
}
