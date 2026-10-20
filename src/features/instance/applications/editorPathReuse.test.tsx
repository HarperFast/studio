/** @vitest-environment jsdom */
/**
 * What the editor shows for a path after the file at that path is deleted, overwritten, renamed or
 * moved. A file's unsaved edits live in a session-storage buffer keyed by its path, and its loaded
 * contents in a query keyed by its path, so anything that changes which file a path names has to
 * change those two as well.
 *
 * Rendered against the real provider, file tree, content viewer and modals, with only the instance
 * client (an in-memory file system), the router, permissions and Monaco mocked. The Monaco double
 * keeps a model per path the way `keepCurrentModel` does, because that is where a reused path's old
 * text survives once the buffer and the query are gone.
 */
import { editorFileContentKey } from '@/features/instance/applications/context/editorFileContent';
import type { EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';
import { getComponentFileQueryKey } from '@/integrations/api/instance/applications/getComponentFile';
import { emitToListeners } from '@/lib/events/listener';
import { setWatchedValue } from '@/lib/events/watcher';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { readSessionValue } from '@/lib/storage/sessionStorageStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
	const post = vi.fn();
	class FakeModel {
		readonly uri: { toString(): string };
		disposed = false;
		private editors = 0;
		private readonly attachListeners = new Set<() => void>();
		private readonly contentListeners = new Set<(fromEdit: boolean) => void>();
		private readonly history: string[] = [];
		constructor(readonly path: string, public text: string) {
			this.uri = { toString: () => `file:///${path}` };
		}
		getValue() {
			harness.modelReads += 1;
			return this.text;
		}
		/** Clears the undo history, as Monaco's does. */
		setValue(text: string) {
			this.history.length = 0;
			this.change(text, true);
		}
		/** How @monaco-editor/react applies a changed `value`: an undoable edit that fires no `onChange`. */
		applyValue(text: string) {
			this.history.push(this.text);
			this.change(text, false);
		}
		type(text: string) {
			this.history.push(this.text);
			this.change(text, true);
		}
		undo() {
			const previous = this.history.pop();
			if (previous !== undefined) {
				this.change(previous, true);
			}
		}
		onDidChangeContent(listener: (fromEdit: boolean) => void) {
			this.contentListeners.add(listener);
			return { dispose: () => void this.contentListeners.delete(listener) };
		}
		private change(text: string, fromEdit: boolean) {
			this.text = text;
			for (const listener of this.contentListeners) {
				listener(fromEdit);
			}
		}
		isAttachedToEditor() {
			return this.editors > 0;
		}
		onDidChangeAttached(listener: () => void) {
			this.attachListeners.add(listener);
			return { dispose: () => void this.attachListeners.delete(listener) };
		}
		setAttached(change: 1 | -1) {
			this.editors += change;
			for (const listener of this.attachListeners) {
				listener();
			}
			// Monaco's detach goes on to clear the view's decorations on the model, which throws once disposed.
			if (this.disposed) {
				throw new Error('Model is disposed!');
			}
		}
		isDisposed() {
			return this.disposed;
		}
		dispose() {
			this.disposed = true;
			if (models.get(this.path) === this) {
				models.delete(this.path);
			}
		}
	}
	const models = new Map<string, FakeModel>();
	return {
		post,
		instanceParams: {
			instanceClient: { post } as unknown as AxiosInstance,
			entityId: 'ins-1',
			entityType: 'instance' as const,
		},
		routeParams: { instanceId: 'ins-1' },
		search: {},
		navigate: () => Promise.resolve(),
		tree: {} as { onDrop?: (items: Array<{ index: string }>, target: unknown) => Promise<unknown> },
		shown: [] as Array<{ path: string; value: string; incoming?: string; readOnly: boolean }>,
		/** Writes, keyed `operation:path`, that land and then fail as if no answer came back. */
		unanswered: new Set<string>(),
		/** Writes, keyed `operation:path`, that the instance refuses without applying them. */
		refused: new Set<string>(),
		modelReads: 0,
		holds: new Map<string, { promise: Promise<void>; release: () => void }>(),
		models,
		FakeModel,
		editor: { undo: () => undefined as void },
		monaco: {
			Uri: { parse: (path: string) => ({ toString: () => `file:///${path}` }) },
			editor: { getModels: () => [...models.values()] },
		},
	};
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => harness.instanceParams }));
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => '' }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => harness.routeParams,
	useSearch: () => harness.search,
	useNavigate: () => harness.navigate,
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceBrowseManagePermission: () => true }));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'vs' }));
vi.mock('@/features/instance/applications/hooks/useApplicationTypeIntelligence', () => ({
	useApplicationTypeIntelligence: () => ({ typeAcquisitionBudgetExhausted: false }),
}));
vi.mock('@/features/instance/applications/hooks/useCodeNavigation', () => ({ useCodeNavigation: () => undefined }));
vi.mock('@/features/instance/applications/components/TextEditorView/harper-language', () => ({
	configureHarperLanguageSupport: () => undefined,
}));
vi.mock('@/features/instance/applications/shortcuts', () => ({
	useGlobalShortcutKeys: () => undefined,
	registerWithEditor: () => () => undefined,
}));
// Every overwrite in these tests is one the user confirmed.
vi.mock('@/features/instance/applications/modals/confirmOverwrite', () => ({
	confirmOverwrite: () => Promise.resolve(true),
}));
vi.mock('@monaco-editor/react', () => ({ loader: { __getMonacoInstance: () => harness.monaco } }));
// A textarea over the path's model, with @monaco-editor/react 4.7.0's rules: an existing model is reused
// as it is, `value` seeds a new model and is applied only once it changes, never when undefined. A
// read-only editor takes it with `setValue` even when the text is unchanged; an editable one takes a
// different text as an undoable edit. Typing and Ctrl+Z are refused while read-only, and changes reach
// the last `onChange` subscribed, which a read-only editor's undefined prop doesn't drop.
vi.mock('@/lib/monaco/MonacoEditor', async () => {
	const { useEffect, useReducer, useRef } = await import('react');
	function Editor({ path, value, onChange, onMount, options }: {
		path: string;
		value?: string;
		onChange?: (value: string) => void;
		onMount?: (editor: unknown, monaco: unknown) => void;
		options?: { readOnly?: boolean };
	}) {
		const [, rerender] = useReducer((renders: number) => renders + 1, 0);
		let model = harness.models.get(path);
		if (!model) {
			model = new harness.FakeModel(path, value ?? '');
			harness.models.set(path, model);
		}
		const shownModel = model;
		const live = useRef({ model: shownModel, onChange, readOnly: !!options?.readOnly });
		live.current = { model: shownModel, onChange, readOnly: !!options?.readOnly };
		const subscribed = useRef(onChange);
		harness.editor.undo = () => {
			if (!live.current.readOnly) {
				live.current.model.undo();
			}
		};
		useEffect(() => {
			shownModel.setAttached(1);
			const subscription = shownModel.onDidChangeContent(fromEdit => {
				rerender();
				if (fromEdit) {
					subscribed.current?.(shownModel.text);
				}
			});
			return () => {
				subscription.dispose();
				shownModel.setAttached(-1);
			};
		}, [shownModel]);
		const mount = useRef(onMount);
		useEffect(() => {
			mount.current?.({
				getModel: () => live.current.model,
				setValue: (text: string) => live.current.model.setValue(text),
				focus: () => undefined,
				getAction: () => undefined,
			}, {});
		}, []);
		const appliedValue = useRef(value);
		useEffect(() => {
			if (appliedValue.current === value) {
				return;
			}
			appliedValue.current = value;
			if (value === undefined) {
				return;
			}
			if (live.current.readOnly) {
				shownModel.setValue(value);
			} else if (shownModel.text !== value) {
				shownModel.applyValue(value);
			}
		}, [value, shownModel]);
		// Declared after the `value` effect, as in @monaco-editor/react, so a commit that changes both hands
		// the change from `value` to the previous subscription.
		useEffect(() => {
			if (onChange) {
				subscribed.current = onChange;
			}
		}, [onChange]);
		harness.shown.push({ path, value: model.text, incoming: value, readOnly: !!options?.readOnly });
		return (
			<textarea
				aria-label="Editor"
				data-path={path}
				value={model.text}
				readOnly={options?.readOnly}
				onChange={event => {
					if (!live.current.readOnly) {
						shownModel.type(event.target.value);
					}
				}}
			/>
		);
	}
	return { Editor };
});
vi.mock('@/features/instance/applications/components/ApplicationsSidebar/FileTreeContextMenu', () => ({
	FileTreeContextMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('react-complex-tree', () => ({
	ControlledTreeEnvironment: ({ children, onDrop }: { children: ReactNode; onDrop: typeof harness.tree.onDrop }) => {
		harness.tree.onDrop = onDrop;
		return children;
	},
	InteractionMode: { DoubleClickItemToExpand: 'DoubleClickItemToExpand' },
	Tree: () => null,
}));

import { ApplicationsSidebar } from '@/features/instance/applications/components/ApplicationsSidebar';
import { ContentViewer } from '@/features/instance/applications/components/ContentViewer';
import { EditorViewProvider } from '@/features/instance/applications/context/EditorViewProvider';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddDirectoryOrFileModal } from '@/features/instance/applications/modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from '@/features/instance/applications/modals/DeleteDirectoryOrFileModal';
import { RenameFileModal } from '@/features/instance/applications/modals/RenameFileModal';

const files = new Map<string, string>();
const directories = new Set<string>();

function isAtOrUnder(path: string, target: string) {
	return path === target || path.startsWith(`${target}/`);
}

function addParents(path: string) {
	const parts = path.split('/');
	for (let i = 1; i < parts.length; i++) {
		directories.add(parts.slice(0, i).join('/'));
	}
}

type Node = { name: string; entries?: Node[] };
function buildTree(): Node[] {
	const root: Node = { name: '', entries: [] };
	const nodeAt = (path: string): Node => {
		let node = root;
		for (const name of path.split('/')) {
			let child = node.entries!.find(entry => entry.name === name);
			if (!child) {
				child = { name, entries: [] };
				node.entries!.push(child);
			}
			node = child;
		}
		return node;
	};
	for (const directory of [...directories].sort()) {
		nodeAt(directory);
	}
	for (const path of [...files.keys()].sort()) {
		const parts = path.split('/');
		nodeAt(parts.slice(0, -1).join('/')).entries!.push({ name: parts[parts.length - 1] });
	}
	return root.entries!;
}

function seed(contents: Record<string, string>) {
	files.clear();
	directories.clear();
	for (const [path, content] of Object.entries(contents)) {
		files.set(path, content);
		addParents(path);
	}
}

interface OperationBody {
	operation: string;
	project: string;
	file?: string;
	payload?: string;
	encoding?: string;
}

function answer(body: OperationBody) {
	const path = body.file ? `${body.project}/${body.file}` : body.project;
	switch (body.operation) {
		case 'get_components':
			return { name: 'components', entries: buildTree() };
		case 'get_component_file': {
			const content = files.get(path);
			if (content === undefined) {
				throw new Error(`ENOENT: no such file ${path}`);
			}
			return {
				message: body.encoding === 'base64' ? btoa(content) : content,
				size: content.length,
				mtime: 'x',
				birthtime: 'x',
			};
		}
		case 'set_component_file':
			addParents(path);
			if (body.payload === undefined) {
				directories.add(path);
			} else {
				files.set(path, body.encoding === 'base64' ? atob(body.payload) : body.payload);
			}
			return { message: 'Successfully set component' };
		case 'drop_component':
			for (const existing of files.keys()) {
				if (isAtOrUnder(existing, path)) {
					files.delete(existing);
				}
			}
			for (const existing of directories) {
				if (isAtOrUnder(existing, path)) {
					directories.delete(existing);
				}
			}
			return { message: 'Successfully dropped' };
		default:
			throw new Error(`Unexpected operation ${body.operation}`);
	}
}

/** The editor's own reads of a file, not the base64 read a rename copies it with. */
function readsOf(path: string) {
	return harness.post.mock.calls
		.map(([, body]) => body as OperationBody)
		.filter(body =>
			body.operation === 'get_component_file' && `${body.project}/${body.file}` === path && body.encoding !== 'base64'
		).length;
}

function writesOf(path: string) {
	return harness.post.mock.calls
		.map(([, body]) => body as OperationBody)
		.filter(body => body.operation === 'set_component_file' && `${body.project}/${body.file}` === path)
		.map(body => body.encoding === 'base64' && body.payload !== undefined ? atob(body.payload) : body.payload);
}

let view: EditorViewContextValue;
function ViewHandle() {
	view = useEditorView();
	return null;
}

let queryClient: QueryClient;
function editorTree() {
	return (
		<QueryClientProvider client={queryClient}>
			<EditorViewProvider>
				<ApplicationsSidebar />
				<ContentViewer />
				<AddDirectoryOrFileModal />
				<DeleteDirectoryOrFileModal />
				<RenameFileModal />
				<ViewHandle />
			</EditorViewProvider>
		</QueryClientProvider>
	);
}

function renderEditor() {
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(editorTree());
}

/** What the router does when the person goes to another instance: the same page, new params. */
function switchInstance(rerender: (ui: ReturnType<typeof editorTree>) => void, instanceId: string) {
	harness.instanceParams = { ...harness.instanceParams, entityId: instanceId };
	harness.routeParams = { instanceId };
	rerender(editorTree());
}

function editor() {
	return screen.getByRole('textbox', { name: 'Editor' }) as HTMLTextAreaElement;
}

/** Opens a path the way the tree does: focusing it is what opens it. */
async function open(path: string) {
	await waitFor(() => expect(view.entryExists(path)).toBe(true));
	act(() => {
		view.setFocusedItem(path);
		view.setSelectedItems([path]);
	});
	await waitFor(() => expect(view.openedEntry?.path).toBe(path));
}

async function openFile(path: string, expected: string) {
	await open(path);
	await waitFor(() => expect(editor().dataset.path).toBe(path));
	await waitFor(() => expect(editor().value).toBe(expected));
}

function type(text: string) {
	fireEvent.change(editor(), { target: { value: text } });
}

async function deleteSelection(paths: string[]) {
	act(() => view.setSelectedItems(paths));
	act(() => setWatchedValue('ShowDeleteDirectoryOrFileModal', true));
	fireEvent.click(await screen.findByRole('button', { name: /^Delete (File|Directory|items)$/ }));
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	await waitFor(() => {
		for (const path of paths) {
			expect(view.entryExists(path)).toBe(false);
		}
	});
}

/** New File / New Directory from whatever entry is open; the modal places it inside or beside that entry. */
async function newEntry(type: 'file' | 'directory', name: string) {
	act(() => setWatchedValue('ShowAddDirectoryOrFileModalType', type));
	fireEvent.change(await screen.findByLabelText('Name'), { target: { value: name } });
	fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add ${type}`) }));
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

const newFile = (name: string) => newEntry('file', name);

async function renameOpenedEntry(name: string) {
	act(() => setWatchedValue('ShowRenameFileModal', true));
	const input = await screen.findByLabelText('Name');
	fireEvent.change(input, { target: { value: name } });
	fireEvent.submit(input.closest('form')!);
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

function save() {
	act(() => emitToListeners('SaveFile', true));
}

async function upload(name: string, content: string) {
	const input = document.getElementById('dropTarget') as HTMLInputElement;
	await act(async () => {
		fireEvent.change(input, { target: { files: [new File([content], name, { type: 'text/javascript' })] } });
	});
	await waitFor(() => expect(writesOf(`app/${name}`)).toContain(content));
}

function cachedContents(path: string) {
	const [project, ...rest] = path.split('/');
	return queryClient.getQueryData(
		getComponentFileQueryKey({ ...harness.instanceParams, project, file: rest.join('/') }),
	);
}

// Each test walks several modal flows end to end, which a loaded machine can stretch past the defaults.
vi.setConfig({ testTimeout: 30_000 });
configure({ asyncUtilTimeout: 5_000 });

beforeAll(() => {
	// Radix dialogs rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

beforeEach(() => {
	clearSessionStorage();
	harness.models.clear();
	harness.shown.length = 0;
	harness.holds.clear();
	harness.unanswered.clear();
	harness.refused.clear();
	harness.instanceParams = { ...harness.instanceParams, entityId: 'ins-1' };
	harness.routeParams = { instanceId: 'ins-1' };
	harness.post.mockReset();
	harness.post.mockImplementation(async (_url: string, body: OperationBody) => {
		const key = `${body.operation}:${body.file ? `${body.project}/${body.file}` : body.project}`;
		const held = harness.holds.get(key);
		if (held) {
			harness.holds.delete(key);
			await held.promise;
		}
		if (harness.refused.delete(key)) {
			throw new Error(`Refused ${key}`);
		}
		const data = answer(body);
		if (harness.unanswered.delete(key)) {
			const sent = { method: 'post', data: JSON.stringify({ operation: body.operation }) };
			throw new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, sent as InternalAxiosRequestConfig);
		}
		return { data };
	});
});

/** Holds the next `operation` on `path` until the returned function is called. */
function hold(operation: string, path: string) {
	let release!: () => void;
	const promise = new Promise<void>(resolve => {
		release = resolve;
	});
	harness.holds.set(`${operation}:${path}`, { promise, release });
	return async () => {
		await act(async () => {
			release();
		});
	};
}

function bufferAt(path: string, entity = 'ins-1') {
	return readSessionValue(editorFileContentKey(entity, path), undefined as string | undefined);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('a deleted file re-created at the same path', () => {
	it('opens empty, and Save writes nothing of the deleted file into it', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const reads = readsOf('app/a.js');

		await deleteSelection(['app/a.js']);
		expect(readsOf('app/a.js')).toBe(reads);
		await open('app/b.js');
		await newFile('a.js');

		await waitFor(() => expect(view.openedEntry?.path).toBe('app/a.js'));
		await waitFor(() => expect(editor().value).toBe(''));
		save();
		expect(writesOf('app/a.js')).toEqual(['']);
	});

	it('shows nothing of the deleted file while the new one loads, and takes no typing until it has', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');

		await deleteSelection(['app/a.js']);
		expect(cachedContents('app/a.js')).toBeUndefined();
		await open('app/b.js');
		harness.shown.length = 0;
		const loaded = hold('get_component_file', 'app/a.js');
		await newFile('a.js');

		await waitFor(() => expect(editor().dataset.path).toBe('app/a.js'));
		expect(editor().readOnly).toBe(true);
		type('typed before it loaded');
		expect(bufferAt('app/a.js')).toBeUndefined();

		await loaded();
		await waitFor(() => expect(editor().readOnly).toBe(false));
		expect(editor().value).toBe('');
		const shownForNewFile = harness.shown.filter(shown => shown.path === 'app/a.js').map(shown => shown.value);
		expect(new Set(shownForNewFile)).toEqual(new Set(['']));
	});

	it('forgets every buffer under a deleted folder, and only under it', async () => {
		seed({ 'app/lib/x.js': 'saved x', 'app/lib/deep/y.js': 'saved y', 'app/library.js': 'saved library' });
		renderEditor();
		await openFile('app/lib/x.js', 'saved x');
		type('unsaved x');
		await openFile('app/lib/deep/y.js', 'saved y');
		type('unsaved y');
		await openFile('app/library.js', 'saved library');
		type('unsaved library');

		await open('app/lib');
		await deleteSelection(['app/lib']);
		expect(cachedContents('app/lib/x.js')).toBeUndefined();
		expect(cachedContents('app/lib/deep/y.js')).toBeUndefined();

		await openFile('app/library.js', 'unsaved library');

		await open('app');
		await newEntry('directory', 'lib');
		await open('app/lib');
		await newEntry('file', 'x.js');
		await waitFor(() => expect(view.openedEntry?.path).toBe('app/lib/x.js'));
		await waitFor(() => expect(editor().value).toBe(''));
	});
});

describe('a file overwritten through New File', () => {
	it('shows the now-empty file instead of its old contents', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');

		await newFile('a.js');

		expect(files.get('app/a.js')).toBe('');
		await waitFor(() => expect(editor().value).toBe(''));
	});

	it('drops the unsaved edits it had, so Save cannot write them over the new file', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');

		await newFile('a.js');

		await waitFor(() => expect(editor().value).toBe(''));
		save();
		expect(writesOf('app/a.js')).toEqual(['']);
	});
});

describe('undo in the text editor', () => {
	it('reads nothing back from the model while typing', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		harness.modelReads = 0;

		type('saved a, edited');
		type('saved a, edited twice');

		expect(harness.modelReads).toBe(0);
	});

	it('still undoes typing', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('saved a, edited');
		type('saved a, edited twice');

		act(() => harness.editor.undo());

		expect(editor().value).toBe('saved a, edited');
	});

	it("keeps a file's history across switching away and back", async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('saved a, edited');
		await openFile('app/b.js', 'saved b');
		await openFile('app/a.js', 'saved a, edited');

		act(() => harness.editor.undo());

		expect(editor().value).toBe('saved a');
	});
});

describe('a file typed back to its saved text', () => {
	it('has no unsaved edits, after another file was open first', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		await openFile('app/b.js', 'saved b');
		type('unsaved edits to b');
		expect(bufferAt('app/b.js')).toBe('unsaved edits to b');

		type('saved b');

		expect(bufferAt('app/b.js')).toBeUndefined();
	});
});

describe('a file overwritten while it is open', () => {
	it('takes no typing until the new contents load, so its old text cannot be saved back', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		const loaded = hold('get_component_file', 'app/a.js');

		await newFile('a.js');
		await waitFor(() => expect(editor().readOnly).toBe(true));
		type('saved a, edited');
		expect(bufferAt('app/a.js')).toBeUndefined();

		await loaded();
		await waitFor(() => expect(editor().value).toBe(''));
		save();
		expect(writesOf('app/a.js')).toEqual(['']);
	});

	it('cannot be undone back to the replaced file once the new contents load', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');

		await newFile('a.js');
		await waitFor(() => expect(editor().value).toBe(''));
		act(() => harness.editor.undo());

		expect(editor().value).toBe('');
		save();
		expect(writesOf('app/a.js')).toEqual(['']);
	});

	it('cannot be undone back to the replaced file when it had been emptied before', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('');

		await newFile('a.js');
		await waitFor(() => expect(view.openedEntry?.path).toBe('app/a.js'));
		act(() => harness.editor.undo());

		expect(editor().value).toBe('');
		save();
		expect(writesOf('app/a.js')).toEqual(['']);
	});

	it("forgets the old file's edits even when the editor closes before the write lands", async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const written = hold('set_component_file', 'app/a.js');

		act(() => setWatchedValue('ShowAddDirectoryOrFileModalType', 'file'));
		fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'a.js' } });
		fireEvent.click(screen.getByRole('button', { name: /Add file/ }));
		await waitFor(() => expect(harness.holds.size).toBe(0));
		cleanup();
		await written();

		await waitFor(() => expect(bufferAt('app/a.js')).toBeUndefined());
	});

	it('forgets the path on the instance it was written to, even after the page moved to another', async () => {
		seed({ 'app/a.js': 'saved a' });
		const { rerender } = renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		sessionStorage.setItem(editorFileContentKey('ins-2', 'app/a.js'), JSON.stringify('edits on another instance'));
		const written = hold('set_component_file', 'app/a.js');

		act(() => setWatchedValue('ShowAddDirectoryOrFileModalType', 'file'));
		fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'a.js' } });
		fireEvent.click(screen.getByRole('button', { name: /Add file/ }));
		await waitFor(() => expect(harness.holds.size).toBe(0));
		act(() => switchInstance(rerender, 'ins-2'));
		// Unmounted too, so only the mutation's own `onSuccess` runs, with the options of the last render.
		cleanup();
		await written();

		await waitFor(() => expect(bufferAt('app/a.js')).toBeUndefined());
		expect(bufferAt('app/a.js', 'ins-2')).toBe('edits on another instance');
	});
});

describe('a save that lands after another file was opened', () => {
	it('leaves the saved file with no unsaved edits, so the tree stops marking it', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');

		save();
		await openFile('app/b.js', 'saved b');
		expect(bufferAt('app/a.js')).toBe('edits to a');
		await landed();

		await waitFor(() => expect(files.get('app/a.js')).toBe('edits to a'));
		await waitFor(() => expect(bufferAt('app/a.js')).toBeUndefined());
		await openFile('app/a.js', 'edits to a');
	});
});

describe('a file opened while another is saving', () => {
	it('is not marked unsaved when its contents load', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');

		save();
		await open('app/b.js');
		await waitFor(() => expect(editor().value).toBe('saved b'));
		expect(bufferAt('app/b.js')).toBeUndefined();
		await landed();
	});
});

describe('a file saved while another is saving', () => {
	it('takes typing and saves without waiting for the other', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');
		save();
		await waitFor(() => expect(view.isSavingFile).toBe(true));
		await openFile('app/b.js', 'saved b');

		await waitFor(() => expect(editor().readOnly).toBe(false));
		expect(view.isSavingAnyFile).toBe(true);
		type('edits to b');
		save();

		await waitFor(() => expect(files.get('app/b.js')).toBe('edits to b'));
		expect(files.get('app/a.js')).toBe('saved a');
		await landed();
		await waitFor(() => expect(files.get('app/a.js')).toBe('edits to a'));
	});
});

describe('Save pressed again while that file is saving', () => {
	it('sends nothing more, and says nothing, when there is nothing newer to save', async () => {
		const notice = vi.spyOn(toast, 'info');
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');
		save();
		await waitFor(() => expect(view.isSavingFile).toBe(true));

		save();
		await landed();

		await waitFor(() => expect(files.get('app/a.js')).toBe('edits to a'));
		expect(writesOf('app/a.js')).toEqual(['edits to a']);
		expect(notice).not.toHaveBeenCalled();
	});
});

describe('a rename while a file is saving', () => {
	it('waits for the save to land, from any way of opening it', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');
		save();
		await waitFor(() => expect(view.isSavingFile).toBe(true));

		act(() => setWatchedValue('ShowRenameFileModal', true));
		const input = await screen.findByLabelText('Name');
		fireEvent.change(input, { target: { value: 'c.js' } });
		fireEvent.submit(input.closest('form')!);
		await act(async () => {});

		expect(screen.getByRole('button', { name: 'Rename' })).toHaveProperty('disabled', true);
		expect(writesOf('app/c.js')).toEqual([]);
		await landed();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Rename' })).toHaveProperty('disabled', false));
		fireEvent.submit(input.closest('form')!);
		await waitFor(() => expect(files.get('app/c.js')).toBe('edits to a'));
		expect(files.has('app/a.js')).toBe(false);
	});
});

describe('a save while a rename is in flight', () => {
	it('is refused, so the edits move with the file instead of being lost with the original', async () => {
		const notice = vi.spyOn(toast, 'info');
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const copied = hold('set_component_file', 'app/c.js');

		act(() => setWatchedValue('ShowRenameFileModal', true));
		const input = await screen.findByLabelText('Name');
		fireEvent.change(input, { target: { value: 'c.js' } });
		fireEvent.submit(input.closest('form')!);
		await waitFor(() => expect(harness.holds.size).toBe(0));
		save();
		await copied();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		expect(notice).toHaveBeenCalledWith('a.js was not saved', expect.anything());
		expect(writesOf('app/a.js')).toEqual([]);
		expect(files.has('app/a.js')).toBe(false);
		expect(bufferAt('app/c.js')).toBe('edits to a');
	});
});

describe('a save while a renamed folder is dropped', () => {
	it('is refused until the old folder is gone', async () => {
		const notice = vi.spyOn(toast, 'info');
		seed({ 'app/lib/x.js': 'saved x', 'app/b.js': 'saved b' });
		renderEditor();
		await open('app/lib');
		const dropped = hold('drop_component', 'app/lib');

		act(() => setWatchedValue('ShowRenameFileModal', true));
		const input = await screen.findByLabelText('Name');
		fireEvent.change(input, { target: { value: 'src' } });
		fireEvent.submit(input.closest('form')!);
		await waitFor(() => expect(harness.holds.size).toBe(0));
		act(() => view.saveFile({ ...harness.instanceParams, project: 'app', file: 'b.js', payload: 'edits to b' }));

		expect(notice).toHaveBeenCalledWith('b.js was not saved', expect.anything());
		await dropped();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(writesOf('app/b.js')).toEqual([]);
	});
});

describe('a move while a file is saving', () => {
	it('is refused until the save lands', async () => {
		const notice = vi.spyOn(toast, 'info');
		seed({ 'app/a.js': 'saved a', 'app/lib/z.js': 'saved z' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');
		save();
		await waitFor(() => expect(view.isSavingFile).toBe(true));

		await act(() => harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' }));

		expect(notice).toHaveBeenCalledWith('Nothing was renamed', expect.anything());
		expect(files.has('app/lib/a.js')).toBe(false);
		await landed();
		await waitFor(() => expect(view.isSavingAnyFile).toBe(false));
		await act(() => harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' }));
		expect(files.get('app/lib/a.js')).toBe('edits to a');
	});

	it('goes ahead on another instance', async () => {
		const notice = vi.spyOn(toast, 'info');
		seed({ 'app/a.js': 'saved a', 'app/lib/z.js': 'saved z' });
		const { rerender } = renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');
		const landed = hold('set_component_file', 'app/a.js');
		save();
		await waitFor(() => expect(view.isSavingFile).toBe(true));
		act(() => switchInstance(rerender, 'ins-2'));
		await waitFor(() => expect(view.entryExists('app/lib')).toBe(true));

		await act(() => harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' }));

		expect(notice).not.toHaveBeenCalledWith('Nothing was renamed', expect.anything());
		await waitFor(() => expect(files.has('app/lib/a.js')).toBe(true));
		await landed();
	});
});

describe('a .env file written from the secrets view', () => {
	async function addSecret(key: string, value: string) {
		fireEvent.click(screen.getByRole('button', { name: /add/i }));
		fireEvent.change(await screen.findByLabelText('Key'), { target: { value: key } });
		fireEvent.change(screen.getByLabelText('Value'), { target: { value } });
		const submit = screen.getByRole('button', { name: /add secret/i });
		await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
		fireEvent.click(submit);
	}

	it('counts as a save, so a move waits for it', async () => {
		const notice = vi.spyOn(toast, 'info');
		seed({ 'app/.env': 'API_KEY=secret123\n', 'app/lib/z.js': 'saved z' });
		renderEditor();
		await open('app/.env');
		await screen.findByText('API_KEY');
		const landed = hold('set_component_file', 'app/.env');

		await addSecret('NEW_KEY', 'value');
		await waitFor(() => expect(harness.holds.size).toBe(0));
		await waitFor(() => expect(view.isSavingFile).toBe(true));
		await act(() => harness.tree.onDrop!([{ index: 'app/.env' }], { targetType: 'item', targetItem: 'app/lib' }));

		expect(notice).toHaveBeenCalledWith('Nothing was renamed', expect.anything());
		expect(files.has('app/lib/.env')).toBe(false);
		await landed();
		await waitFor(() => expect(files.get('app/.env')).toBe('API_KEY=secret123\nNEW_KEY=value\n'));
	});

	it('is refused during a rename, with the reason', async () => {
		const failure = vi.spyOn(toast, 'error');
		seed({ 'app/.env': 'API_KEY=secret123\n', 'app/lib/z.js': 'saved z' });
		renderEditor();
		await open('app/.env');
		await screen.findByText('API_KEY');
		const copied = hold('set_component_file', 'app/lib/.env');
		let move: Promise<unknown> | undefined;
		act(() => {
			move = harness.tree.onDrop!([{ index: 'app/.env' }], { targetType: 'item', targetItem: 'app/lib' });
		});
		await waitFor(() => expect(harness.holds.size).toBe(0));

		await addSecret('NEW_KEY', 'value');

		await waitFor(() => expect(failure).toHaveBeenCalledWith(expect.stringContaining('.env was not saved')));
		expect(writesOf('app/.env')).toEqual([]);
		await copied();
		await act(() => move!);
	});
});

describe('Save pressed twice at once', () => {
	it('sends one write', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('edits to a');

		act(() => {
			emitToListeners('SaveFile', true);
			emitToListeners('SaveFile', true);
		});

		await waitFor(() => expect(files.get('app/a.js')).toBe('edits to a'));
		expect(writesOf('app/a.js')).toEqual(['edits to a']);
	});
});

describe('a renamed file', () => {
	it('takes its unsaved edits to the new name and leaves none at the old one', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const reads = readsOf('app/a.js');

		await renameOpenedEntry('c.js');
		expect(bufferAt('app/a.js')).toBeUndefined();

		await openFile('app/c.js', 'unsaved edits to a');
		expect(readsOf('app/a.js')).toBe(reads);
		save();
		await waitFor(() => expect(files.get('app/c.js')).toBe('unsaved edits to a'));
		await open('app/b.js');
		await newFile('a.js');
		await waitFor(() => expect(view.openedEntry?.path).toBe('app/a.js'));
		await waitFor(() => expect(editor().value).toBe(''));
	});

	it('completes and keeps the edits when session storage has no room for them', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const reads = readsOf('app/a.js');
		const moved = editorFileContentKey('ins-1', 'app/c.js');
		const setItem = Storage.prototype.setItem;
		const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
			function(this: Storage, key: string, value: string) {
				if (key === moved) {
					throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
				}
				setItem.call(this, key, value);
			},
		);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			await renameOpenedEntry('c.js');
			await openFile('app/c.js', 'unsaved edits to a');
		} finally {
			full.mockRestore();
		}

		expect(files.has('app/a.js')).toBe(false);
		expect(sessionStorage.getItem(moved)).toBeNull();
		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(cachedContents('app/a.js')).toBeUndefined();
		expect(readsOf('app/a.js')).toBe(reads);
	});

	it('keeps its unsaved edits at both names when the old one may not have been dropped', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		harness.unanswered.add('drop_component:app/a.js');

		act(() => setWatchedValue('ShowRenameFileModal', true));
		const input = await screen.findByLabelText('Name');
		fireEvent.change(input, { target: { value: 'c.js' } });
		fireEvent.submit(input.closest('form')!);
		await waitFor(() => expect(harness.unanswered.size).toBe(0));

		await waitFor(() => expect(bufferAt('app/c.js')).toBe('unsaved edits to a'));
		expect(bufferAt('app/a.js')).toBe('unsaved edits to a');
	});

	it('keeps its unsaved edits on the original only when the old one was not dropped', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		harness.refused.add('drop_component:app/a.js');

		act(() => setWatchedValue('ShowRenameFileModal', true));
		const input = await screen.findByLabelText('Name');
		fireEvent.change(input, { target: { value: 'c.js' } });
		fireEvent.submit(input.closest('form')!);
		await waitFor(() => expect(harness.refused.size).toBe(0));

		await waitFor(() => expect(files.has('app/c.js')).toBe(true));
		expect(bufferAt('app/a.js')).toBe('unsaved edits to a');
		expect(bufferAt('app/c.js')).toBeUndefined();
	});
});

describe('a file moved by drag and drop', () => {
	it('takes its unsaved edits along and leaves none at the old path', async () => {
		seed({ 'app/a.js': 'saved a', 'app/lib/z.js': 'saved z' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');

		await act(() => harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' }));
		await waitFor(() => expect(view.entryExists('app/a.js')).toBe(false));
		expect(bufferAt('app/a.js')).toBeUndefined();

		await openFile('app/lib/a.js', 'unsaved edits to a');
		await open('app');
		await newFile('a.js');
		await waitFor(() => expect(view.openedEntry?.path).toBe('app/a.js'));
		await waitFor(() => expect(editor().value).toBe(''));
	});

	it('onto a file that has unsaved edits replaces them', async () => {
		seed({ 'app/a.js': 'saved a', 'app/lib/a.js': 'saved lib a' });
		renderEditor();
		await openFile('app/lib/a.js', 'saved lib a');
		type('unsaved edits to lib a');
		await openFile('app/a.js', 'saved a');
		harness.shown.length = 0;

		await act(() => harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' }));
		await waitFor(() => expect(view.entryExists('app/a.js')).toBe(false));

		await openFile('app/lib/a.js', 'saved a');
		const shownAtDestination = harness.shown.filter(shown => shown.path === 'app/lib/a.js');
		expect(shownAtDestination.map(shown => shown.value)).not.toContain('saved lib a');
	});
});

describe('a file with unsaved edits moved onto the open file', () => {
	it('shows the moved edits, and Ctrl+Z cannot bring the replaced file back', async () => {
		seed({ 'app/a.js': 'saved a', 'app/lib/a.js': 'saved lib a' });
		renderEditor();
		await openFile('app/lib/a.js', 'saved lib a');
		type('unsaved edits to lib a');
		await openFile('app/a.js', 'saved a');

		await act(() => harness.tree.onDrop!([{ index: 'app/lib/a.js' }], { targetType: 'item', targetItem: 'app' }));
		await waitFor(() => expect(view.entryExists('app/lib/a.js')).toBe(false));
		await waitFor(() => expect(editor().value).toBe('unsaved edits to lib a'));
		act(() => harness.editor.undo());

		expect(editor().value).toBe('unsaved edits to lib a');
		save();
		await waitFor(() => expect(files.get('app/a.js')).toBe('unsaved edits to lib a'));
	});
});

describe('a destination edited while the move that replaced it is in flight', () => {
	it('keeps the edits typed into it', async () => {
		seed({ 'app/a.js': 'saved a', 'app/lib/a.js': 'saved lib a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const dropped = hold('drop_component', 'app/a.js');

		let move: Promise<unknown> | undefined;
		act(() => {
			move = harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' });
		});
		await waitFor(() => expect(harness.holds.size).toBe(0));
		await openFile('app/lib/a.js', 'unsaved edits to a');
		type('typed into the destination');
		await dropped();
		await act(() => move!);

		await waitFor(() => expect(view.entryExists('app/a.js')).toBe(false));
		expect(bufferAt('app/lib/a.js')).toBe('typed into the destination');
		expect(bufferAt('app/a.js')).toBeUndefined();
	});

	it('keeps the edits typed into it when the original is not dropped', async () => {
		seed({ 'app/a.js': 'saved a', 'app/lib/a.js': 'saved lib a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const dropped = hold('drop_component', 'app/a.js');
		harness.refused.add('drop_component:app/a.js');

		let move: Promise<unknown> | undefined;
		act(() => {
			move = harness.tree.onDrop!([{ index: 'app/a.js' }], { targetType: 'item', targetItem: 'app/lib' });
		});
		await waitFor(() => expect(harness.holds.size).toBe(0));
		await openFile('app/lib/a.js', 'unsaved edits to a');
		type('typed into the destination');
		await dropped();
		await act(() => move!);

		await waitFor(() => expect(harness.refused.size).toBe(0));
		expect(files.has('app/a.js')).toBe(true);
		expect(bufferAt('app/lib/a.js')).toBe('typed into the destination');
		expect(bufferAt('app/a.js')).toBe('unsaved edits to a');
	});
});

describe('a renamed folder', () => {
	it('takes the unsaved edits of every file in it along, and leaves nothing under its old name', async () => {
		seed({ 'app/lib/x.js': 'saved x', 'app/lib/deep/y.js': 'saved y', 'app/library.js': 'saved library' });
		sessionStorage.setItem(editorFileContentKey('ins-1', 'app/lib/gone.js'), JSON.stringify('stale edits'));
		renderEditor();
		await openFile('app/lib/x.js', 'saved x');
		type('unsaved x');
		await openFile('app/lib/deep/y.js', 'saved y');
		type('unsaved y');

		await open('app/lib');
		await renameOpenedEntry('src');
		await waitFor(() => expect(view.entryExists('app/lib')).toBe(false));

		await openFile('app/src/x.js', 'unsaved x');
		await openFile('app/src/deep/y.js', 'unsaved y');
		await openFile('app/library.js', 'saved library');
		const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i));
		expect(keys.filter(key => key?.startsWith(editorFileContentKey('ins-1', 'app/lib/')))).toEqual([]);
	});
});

describe('an upload', () => {
	it('over a file with unsaved edits opens with the uploaded contents', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		await openFile('app/b.js', 'saved b');

		await upload('a.js', 'uploaded a');

		await openFile('app/a.js', 'uploaded a');
	});

	it('over the open file with unsaved edits never leaves the replaced text editable', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		type('unsaved edits to a');
		const written = hold('set_component_file', 'app/a.js');

		const input = document.getElementById('dropTarget') as HTMLInputElement;
		await act(async () => {
			fireEvent.change(input, { target: { files: [new File(['uploaded a'], 'a.js', { type: 'text/javascript' })] } });
		});
		await waitFor(() => expect(harness.holds.size).toBe(0));
		harness.shown.length = 0;
		await written();

		await waitFor(() => expect(editor().value).toBe('uploaded a'));
		const editable = harness.shown.filter(shown => shown.path === 'app/a.js' && !shown.readOnly);
		expect(editable.map(shown => shown.incoming)).not.toContain('saved a');
	});

	it('over the open file shows the uploaded contents', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');

		await upload('a.js', 'uploaded a');

		await waitFor(() => expect(editor().value).toBe('uploaded a'));
	});
});

describe('a file replaced while open with the text it already shows', () => {
	async function typeAndSave(text: string) {
		type(text);
		save();
		await waitFor(() => expect(files.get('app/a.js')).toBe(text));
		await waitFor(() => expect(bufferAt('app/a.js')).toBeUndefined());
	}

	async function replacedAndLoaded(replace: () => Promise<void>, text: string) {
		const reads = readsOf('app/a.js');
		await replace();
		await waitFor(() => expect(readsOf('app/a.js')).toBeGreaterThan(reads));
		await loaded(text);
	}

	async function loaded(text: string) {
		await waitFor(() => expect(view.openedEntryContents).toBe(text));
		await waitFor(() => expect(editor().readOnly).toBe(false));
		await act(async () => {});
	}

	it.each([
		['an upload', 'uploaded a', () => upload('a.js', 'uploaded a')],
		['New File', '', () => newFile('a.js')],
		[
			'a move onto it',
			'moved a',
			async () => {
				await act(() => harness.tree.onDrop!([{ index: 'app/lib/a.js' }], { targetType: 'item', targetItem: 'app' }));
				await waitFor(() => expect(view.entryExists('app/lib/a.js')).toBe(false));
			},
		],
	])('cannot be undone back to the replaced file after %s', async (_, text, replace) => {
		seed({ 'app/a.js': 'saved a', 'app/lib/a.js': text });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		await typeAndSave(text);

		await replacedAndLoaded(replace, text);
		const writes = writesOf('app/a.js').length;
		act(() => harness.editor.undo());
		save();

		expect(editor().value).toBe(text);
		expect(bufferAt('app/a.js')).toBeUndefined();
		expect(writesOf('app/a.js')).toHaveLength(writes);
		expect(files.get('app/a.js')).toBe(text);
	});

	it('cannot be undone back when the new contents load before the editor ever sees them missing', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		await typeAndSave('uploaded a');
		harness.shown.length = 0;

		await replacedAndLoaded(() => upload('a.js', 'uploaded a'), 'uploaded a');
		act(() => harness.editor.undo());

		expect(harness.shown.filter(shown => shown.path === 'app/a.js').map(shown => shown.incoming)).not.toContain(
			undefined,
		);
		expect(editor().value).toBe('uploaded a');
	});

	it('cannot be undone back when the editor sees the contents missing while they reload', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		await typeAndSave('uploaded a');
		const reloaded = hold('get_component_file', 'app/a.js');
		harness.shown.length = 0;

		await upload('a.js', 'uploaded a');
		await waitFor(() => expect(view.openedEntryContents).toBeUndefined());
		await reloaded();
		await loaded('uploaded a');
		act(() => harness.editor.undo());

		expect(harness.shown.filter(shown => shown.path === 'app/a.js').map(shown => shown.incoming)).toContain(undefined);
		expect(editor().value).toBe('uploaded a');
	});

	it('cannot be undone back when the editor went to another file and returned before the reload', async () => {
		seed({ 'app/a.js': 'saved a', 'app/b.js': 'saved b' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		await typeAndSave('uploaded a');
		const reloaded = hold('get_component_file', 'app/a.js');

		await upload('a.js', 'uploaded a');
		// Back before the model left on the switch is disposed, which waits a tick after it detaches.
		act(() => view.setFocusedItem('app/b.js'));
		act(() => view.setFocusedItem('app/a.js'));
		expect(harness.models.get('app/a.js')?.disposed).toBe(false);
		await reloaded();
		await loaded('uploaded a');
		act(() => harness.editor.undo());

		expect(editor().value).toBe('uploaded a');
	});

	it("cannot be undone into another instance's file at the same path", async () => {
		seed({ 'app/a.js': 'saved a' });
		const { rerender } = renderEditor();
		await openFile('app/a.js', 'saved a');
		await typeAndSave('saved a, edited');

		act(() => switchInstance(rerender, 'ins-2'));
		await loaded('saved a, edited');
		act(() => harness.editor.undo());
		save();

		expect(editor().value).toBe('saved a, edited');
		expect(bufferAt('app/a.js', 'ins-2')).toBeUndefined();
	});

	it('still undoes typing and saving that came before nothing was replaced', async () => {
		seed({ 'app/a.js': 'saved a' });
		renderEditor();
		await openFile('app/a.js', 'saved a');
		await typeAndSave('saved a, edited');

		act(() => harness.editor.undo());

		expect(editor().value).toBe('saved a');
	});
});
