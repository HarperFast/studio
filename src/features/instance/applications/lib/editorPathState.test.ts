/** @vitest-environment jsdom */
import {
	discardEditorFileContentIfSaved,
	editorFileContentKey,
} from '@/features/instance/applications/context/editorFileContent';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { readSessionValue } from '@/lib/storage/sessionStorageStore';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const monaco = vi.hoisted(() => {
	interface Model {
		uri: { toString(): string };
		attached: boolean;
		disposed: boolean;
		isAttachedToEditor(): boolean;
		isDisposed(): boolean;
		onDidChangeAttached(listener: () => void): { dispose(): void };
		watches(): number;
		attach(): void;
		detach(): void;
		dispose(): void;
	}
	const models: Model[] = [];
	return {
		loaded: true,
		models,
		/** A model as the editor names it, `Uri.parse(path)`. */
		add(path: string, attached = false): Model {
			const listeners = new Set<() => void>();
			const model: Model = {
				uri: { toString: () => `file:///${path}` },
				attached,
				disposed: false,
				isAttachedToEditor: () => model.attached,
				isDisposed: () => model.disposed,
				onDidChangeAttached: listener => {
					listeners.add(listener);
					return { dispose: () => void listeners.delete(listener) };
				},
				watches: () => listeners.size,
				attach() {
					model.attached = true;
				},
				detach() {
					model.attached = false;
					for (const listener of listeners) {
						listener();
					}
					// Monaco's detach goes on to use the model after the event.
					if (model.disposed) {
						throw new Error('Model is disposed!');
					}
				},
				dispose() {
					model.disposed = true;
				},
			};
			models.push(model);
			return model;
		},
	};
});
vi.mock('@monaco-editor/react', () => ({
	loader: {
		__getMonacoInstance: () =>
			monaco.loaded
				? {
					Uri: { parse: (path: string) => ({ toString: () => `file:///${path}` }) },
					editor: { getModels: () => monaco.models.filter(model => !model.disposed) },
				}
				: null,
	},
}));

import { forgetDeletedPath, forgetReplacedPath, moveEditedPath } from './editorPathState';

const entityId = 'ins-1';

function bufferAt(path: string, entity = entityId) {
	return readSessionValue(editorFileContentKey(entity, path), undefined as string | undefined);
}

function buffer(paths: Record<string, string>, entity = entityId) {
	for (const [path, content] of Object.entries(paths)) {
		sessionStorage.setItem(editorFileContentKey(entity, path), JSON.stringify(content));
	}
}

/** A hook mounted on a path's buffer, the way an open editor or the tree's unsaved marker is. */
function mountBuffer(path: string) {
	return renderHook(() => useSessionStorage(editorFileContentKey(entityId, path), undefined as string | undefined));
}

let queryClient: QueryClient;
function cache(path: string, encoding?: string, entity = entityId) {
	const [project, ...file] = path.split('/');
	const key = [entity, 'get_component_file', project, file.join('/'), encoding];
	queryClient.setQueryData(key, { message: `contents of ${path}` });
	return key;
}

beforeEach(() => {
	clearSessionStorage();
	queryClient = new QueryClient();
	monaco.models.length = 0;
	monaco.loaded = true;
});

afterEach(() => {
	cleanup();
	queryClient?.clear();
});

describe('forgetDeletedPath', () => {
	it("discards a deleted file's unsaved edits and every cached copy of its contents", () => {
		buffer({ 'app/a.js': 'edits to a', 'app/b.js': 'edits to b' });
		const utf8 = cache('app/a.js');
		const base64 = cache('app/a.js', 'base64');
		const sibling = cache('app/b.js');

		forgetDeletedPath(queryClient, entityId, 'app/a.js');

		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(bufferAt('app/b.js')).toBe('edits to b');
		expect(queryClient.getQueryData(utf8)).toBeUndefined();
		expect(queryClient.getQueryData(base64)).toBeUndefined();
		expect(queryClient.getQueryData(sibling)).toBeDefined();
	});

	it('covers everything under a folder, but not a sibling whose name starts the same', () => {
		buffer({ 'app/lib/x.js': 'x', 'app/lib/deep/y.js': 'y', 'app/library.js': 'library', 'app/lib.js': 'lib' });
		const nested = cache('app/lib/deep/y.js');
		const sibling = cache('app/library.js');

		forgetDeletedPath(queryClient, entityId, 'app/lib');

		expect(bufferAt('app/lib/x.js')).toBeUndefined();
		expect(bufferAt('app/lib/deep/y.js')).toBeUndefined();
		expect(bufferAt('app/library.js')).toBe('library');
		expect(bufferAt('app/lib.js')).toBe('lib');
		expect(queryClient.getQueryData(nested)).toBeUndefined();
		expect(queryClient.getQueryData(sibling)).toBeDefined();
	});

	it('covers a whole project, and leaves other projects and other instances alone', () => {
		buffer({ 'app/a.js': 'a', 'app2/a.js': 'other project' });
		buffer({ 'app/a.js': 'other instance' }, 'ins-2');
		const inProject = cache('app/a.js');
		const otherProject = cache('app2/a.js');
		const otherInstance = cache('app/a.js', undefined, 'ins-2');
		const tree = [entityId, 'get_components'];
		queryClient.setQueryData(tree, { entries: [] });

		forgetDeletedPath(queryClient, entityId, 'app');

		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(bufferAt('app2/a.js')).toBe('other project');
		expect(bufferAt('app/a.js', 'ins-2')).toBe('other instance');
		expect(queryClient.getQueryData(inProject)).toBeUndefined();
		expect(queryClient.getQueryData(otherProject)).toBeDefined();
		expect(queryClient.getQueryData(otherInstance)).toBeDefined();
		expect(queryClient.getQueryData(tree)).toBeDefined();
	});

	it('tells a mounted hook, so an open editor stops showing the edits and cannot store them again', () => {
		buffer({ 'app/lib/x.js': 'x' });
		const exact = mountBuffer('app/a.js');
		const nested = mountBuffer('app/lib/x.js');
		act(() => exact.result.current[1]('edits to a'));

		act(() => forgetDeletedPath(queryClient, entityId, 'app/a.js'));
		act(() => forgetDeletedPath(queryClient, entityId, 'app/lib'));

		expect(exact.result.current[0]).toBeUndefined();
		expect(nested.result.current[0]).toBeUndefined();
		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(bufferAt('app/lib/x.js')).toBeUndefined();
	});
});

describe('forgetReplacedPath', () => {
	it("discards the replaced file's edits and its contents, so they are not shown while the new ones load", () => {
		buffer({ 'app/a.js': 'edits to a' });
		const key = cache('app/a.js');
		const mounted = mountBuffer('app/a.js');

		act(() => forgetReplacedPath(queryClient, entityId, 'app/a.js'));

		expect(mounted.result.current[0]).toBeUndefined();
		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(queryClient.getQueryData(key)).toBeUndefined();
	});
});

describe('moveEditedPath', () => {
	it("carries a file's unsaved edits to its new path, replacing any there", () => {
		buffer({ 'app/a.js': 'edits to a', 'app/lib/a.js': 'edits to the file the move replaced' });
		const from = cache('app/a.js');
		const to = mountBuffer('app/lib/a.js');

		act(() => moveEditedPath(queryClient, entityId, 'app/a.js', 'app/lib/a.js'));

		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(bufferAt('app/lib/a.js')).toBe('edits to a');
		expect(to.result.current[0]).toBe('edits to a');
		expect(queryClient.getQueryData(from)).toBeUndefined();
	});

	it("carries a folder's buffers to the same places under the new folder, merging into it", () => {
		buffer({
			'app/lib/x.js': 'x',
			'app/lib/deep/y.js': 'y',
			'app/library.js': 'library',
			'app/src/kept.js': 'a file the merge does not touch',
		});

		moveEditedPath(queryClient, entityId, 'app/lib', 'app/src');

		expect(bufferAt('app/src/x.js')).toBe('x');
		expect(bufferAt('app/src/deep/y.js')).toBe('y');
		expect(bufferAt('app/lib/x.js')).toBeUndefined();
		expect(bufferAt('app/lib/deep/y.js')).toBeUndefined();
		expect(bufferAt('app/library.js')).toBe('library');
		expect(bufferAt('app/src/kept.js')).toBe('a file the merge does not touch');
	});

	it('carries the edits in memory when storage refuses the destination', () => {
		buffer({ 'app/a.js': 'edits to a' });
		const destination = editorFileContentKey(entityId, 'app/lib/a.js');
		const setItem = Storage.prototype.setItem;
		const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
			function(this: Storage, key: string, value: string) {
				if (key === destination) {
					throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
				}
				setItem.call(this, key, value);
			},
		);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			moveEditedPath(queryClient, entityId, 'app/a.js', 'app/lib/a.js');
		} finally {
			full.mockRestore();
		}

		expect(sessionStorage.getItem(destination)).toBeNull();
		expect(bufferAt('app/lib/a.js')).toBe('edits to a');
		expect(bufferAt('app/a.js')).toBeUndefined();
	});

	it('leaves the destination without edits when the moved file had none', () => {
		buffer({ 'app/lib/a.js': 'edits to the file the move replaced' });

		moveEditedPath(queryClient, entityId, 'app/a.js', 'app/lib/a.js');

		expect(bufferAt('app/lib/a.js')).toBeUndefined();
	});
});

describe("the text editor's kept models", () => {
	it('are disposed at and under a forgotten path, and nowhere else', () => {
		const file = monaco.add('app/a.js');
		const nested = monaco.add('app/lib/x.js');
		const sibling = monaco.add('app/library.js');
		const other = monaco.add('app/b.js');

		forgetDeletedPath(queryClient, entityId, 'app/a.js');
		forgetReplacedPath(queryClient, entityId, 'app/lib');

		expect([file.disposed, nested.disposed, sibling.disposed, other.disposed]).toEqual([true, true, false, false]);
	});

	it('leave the old path of a moved file', () => {
		const from = monaco.add('app/a.js');
		const to = monaco.add('app/lib/a.js');

		moveEditedPath(queryClient, entityId, 'app/a.js', 'app/lib/a.js');

		expect([from.disposed, to.disposed]).toEqual([true, false]);
	});

	it('go only once the editor lets go of one still on screen, however often its path is forgotten', async () => {
		const open = monaco.add('app/a.js', true);

		forgetDeletedPath(queryClient, entityId, 'app/a.js');
		forgetReplacedPath(queryClient, entityId, 'app/a.js');
		expect(open.disposed).toBe(false);
		expect(open.watches()).toBe(1);

		open.detach();
		expect(open.disposed).toBe(false);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(open.disposed).toBe(true);
	});

	it('stay while an editor takes one back before the detach finishes, and go at its next detach', async () => {
		const open = monaco.add('app/a.js', true);

		forgetDeletedPath(queryClient, entityId, 'app/a.js');
		open.detach();
		open.attach();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(open.disposed).toBe(false);
		open.detach();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(open.disposed).toBe(true);
	});

	it('are left alone before any editor has loaded Monaco', () => {
		monaco.loaded = false;
		buffer({ 'app/a.js': 'edits to a' });

		expect(() => forgetDeletedPath(queryClient, entityId, 'app/a.js')).not.toThrow();
		expect(bufferAt('app/a.js')).toBeUndefined();
	});
});

describe('discardEditorFileContentIfSaved', () => {
	it('drops a buffer that is exactly what was saved, and tells a mounted hook', () => {
		buffer({ 'app/a.js': 'saved text' });
		const marker = mountBuffer('app/a.js');

		act(() => discardEditorFileContentIfSaved(editorFileContentKey(entityId, 'app/a.js'), 'saved text'));

		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(marker.result.current[0]).toBeUndefined();
	});

	it('keeps a buffer edited after the save began', () => {
		buffer({ 'app/a.js': 'saved text, edited again' });

		discardEditorFileContentIfSaved(editorFileContentKey(entityId, 'app/a.js'), 'saved text');

		expect(bufferAt('app/a.js')).toBe('saved text, edited again');
	});
});
