/** The rules are in `../DESIGN.md`: call these only once the server confirms the operation. */
import {
	discardEditorFileContent,
	moveEditorFileContent,
} from '@/features/instance/applications/context/editorFileContent';
import { componentFilesAtOrUnder } from '@/integrations/api/instance/applications/getComponentFile';
import { loader } from '@monaco-editor/react';
import type { QueryClient } from '@tanstack/react-query';

export function forgetDeletedPath(queryClient: QueryClient, entityId: string, path: string) {
	discardEditorFileContent(entityId, path);
	forgetFilesThatAreGone(queryClient, entityId, path);
	disposeEditorModels(path);
}

export function forgetReplacedPath(queryClient: QueryClient, entityId: string, path: string) {
	discardEditorFileContent(entityId, path);
	// Reset rather than invalidate, so the replaced contents aren't handed out while the new ones load.
	void queryClient.resetQueries(componentFilesAtOrUnder(entityId, path));
	disposeEditorModels(path);
}

/** After `from` was copied to `to`, with `to` forgotten as replaced, and then dropped. */
export function moveEditedPath(queryClient: QueryClient, entityId: string, from: string, to: string) {
	moveEditorFileContent(entityId, from, to);
	forgetFilesThatAreGone(queryClient, entityId, from);
	disposeEditorModels(from);
}

// The open file's query is still observed until the editor moves off it, and removing that one would
// have the observer fetch a file that is gone at once, which fails into an error toast. Emptied in
// place, it is fetched only if a refetch trigger such as window focus fires before the editor moves off.
function forgetFilesThatAreGone(queryClient: QueryClient, entityId: string, path: string) {
	const files = componentFilesAtOrUnder(entityId, path);
	queryClient.removeQueries({ ...files, type: 'inactive' });
	for (const query of queryClient.getQueryCache().findAll({ ...files, type: 'active' })) {
		query.reset();
	}
}

const disposingOnDetach = new WeakSet<object>();

// Read through the loader, which holds an instance once an editor has loaded Monaco, so a chunk that
// only deletes files doesn't import it. A model still on screen goes once the editor lets go of it.
function disposeEditorModels(path: string) {
	const monaco = loader.__getMonacoInstance();
	if (!monaco) {
		return;
	}
	const exact = monaco.Uri.parse(path).toString();
	for (const model of monaco.editor.getModels()) {
		const uri = model.uri.toString();
		if (uri !== exact && !uri.startsWith(`${exact}/`)) {
			continue;
		}
		if (!model.isAttachedToEditor()) {
			model.dispose();
			continue;
		}
		if (disposingOnDetach.has(model)) {
			continue;
		}
		const watch = model.onDidChangeAttached(() => {
			if (model.isAttachedToEditor()) {
				return;
			}
			// Monaco fires this partway through the detach and still uses the model after it, so wait for
			// the detach to finish. If an editor took the model back by then, keep watching for the next one.
			setTimeout(() => {
				if (model.isDisposed()) {
					watch.dispose();
				} else if (!model.isAttachedToEditor()) {
					watch.dispose();
					model.dispose();
				}
			}, 0);
		});
		disposingOnDetach.add(model);
	}
}
