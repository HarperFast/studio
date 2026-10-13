/** @vitest-environment jsdom */
/**
 * The schema editor against the real EditorViewProvider, query client and session-storage buffer, so
 * the order in which the provider loads contents and the editor seeds from them is the production
 * order. Only the network, the router, permissions and Monaco are stubbed.
 */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { emitToListeners } from '@/lib/events/listener';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => {
	const state = {
		files: {} as Record<string, string>,
		pendingRead: undefined as Promise<void> | undefined,
		failReads: false,
		pendingWrite: undefined as Promise<void> | undefined,
		saves: [] as Array<{ file: string; payload: string | undefined }>,
	};
	const instanceClient = {
		post: async (_url: string, body: { operation: string; file?: string; payload?: string }) => {
			if (body.operation === 'get_component_file') {
				await state.pendingRead;
				if (state.failReads) {
					throw new Error('Request failed with status code 503');
				}
				const message = state.files[body.file!];
				return { data: { message, size: message.length } };
			}
			if (body.operation === 'set_component_file') {
				await state.pendingWrite;
				state.saves.push({ file: body.file!, payload: body.payload });
				state.files[body.file!] = body.payload ?? '';
				return { data: { message: 'Successfully set component' } };
			}
			return { data: { name: 'components', entries: [] } };
		},
	};
	return {
		state,
		params: {
			entityId: 'instance-1',
			entityType: 'instance' as const,
			instanceClient: instanceClient as unknown as AxiosInstance,
		},
	};
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => server.params }));
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => 'https://instance.example.com:9925' }));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceBrowseManagePermission: () => true }));
vi.mock('@tanstack/react-router', () => {
	const navigate = () => {};
	const search = {};
	const params = { instanceId: 'instance-1' };
	return { useNavigate: () => navigate, useSearch: () => search, useParams: () => params };
});
// Edits and saves the buffer the way the Monaco-based editor does.
vi.mock('@/features/instance/applications/components/TextEditorView', async () => {
	const { useEditorView } = await import('@/features/instance/applications/hooks/useEditorView');
	const { useEditorFileContent } = await import('@/features/instance/applications/context/editorFileContent');
	const { useListener } = await import('@/lib/events/listener');
	return {
		TextEditorView: function TextEditorView() {
			const { openedEntry, openedEntryContents, saveFile } = useEditorView();
			const { content, setContent } = useEditorFileContent(!!openedEntry && openedEntry.path);
			useListener('SaveFile', () => {
				if (openedEntry && content !== undefined) {
					const file = openedEntry.path.split('/').slice(1).join('/');
					saveFile({ ...server.params, file, payload: content, project: openedEntry.project }, openedEntry.path);
				}
			}, [openedEntry, content, saveFile]);
			return (
				<textarea
					aria-label="Source"
					value={content ?? openedEntryContents ?? ''}
					onChange={event => setContent(event.target.value !== openedEntryContents ? event.target.value : undefined)}
				/>
			);
		},
	};
});

import { EditorViewProvider } from '../../context/EditorViewProvider';
import { ContentViewer } from '../ContentViewer';

const README = '# Schemas\n\nYour schemas are defined in `.graphql` files within this `schemas` directory.\n';
const DOG = 'type Dog @table @export {\n\tid: ID @primaryKey\n}\n';
const CAT = 'type Cat @table @export {\n\tid: ID @primaryKey\n}\n';

const readme: FileEntry = { name: 'README.md', path: 'punch/schemas/README.md', project: 'punch' };
const schemasFolder: DirectoryEntry = {
	name: 'schemas',
	path: 'punch/schemas',
	project: 'punch',
	entries: [readme],
	overviewEntry: readme,
};
const resources: FileEntry = { name: 'resources.js', path: 'punch/resources.js', project: 'punch' };
const newSchema: FileEntry = { name: 'thing.graphql', path: 'punch/schemas/thing.graphql', project: 'punch' };
const dogSchema: FileEntry = { name: 'schema.graphql', path: 'punch/schemas/schema.graphql', project: 'punch' };
const brokenSchema: FileEntry = { name: 'broken.graphql', path: 'punch/schemas/broken.graphql', project: 'punch' };

let queryClient: QueryClient;
let open: (entry: DirectoryEntry | FileEntry) => void;

function Opener() {
	open = useEditorView().setOpenedEntry;
	return null;
}

function renderEditor() {
	server.state.files = {
		'schemas/README.md': README,
		'resources.js': 'export const answer = 42;\n',
		'schemas/thing.graphql': '',
		'schemas/schema.graphql': DOG,
		'schemas/broken.graphql': 'type Broken @table {\n\tname: String "unterminated\n}\n',
	};
	queryClient = new QueryClient();
	render(
		<QueryClientProvider client={queryClient}>
			<EditorViewProvider>
				<Opener />
				<ContentViewer />
			</EditorViewProvider>
		</QueryClientProvider>,
	);
}

async function openEntry(
	entry: DirectoryEntry | FileEntry,
	loaded: string | RegExp,
	where: 'text' | 'source' = 'text',
) {
	act(() => open(entry));
	await (where === 'source' ? screen.findByDisplayValue(loaded) : screen.findByText(loaded));
}

// Clears are counted apart from writes: every subscriber also clears the key, harmlessly, when it mounts clean.
function watchBuffer(path: string) {
	const setItem = vi.spyOn(Storage.prototype, 'setItem');
	const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
	const ours = (key: string) => key.startsWith('EditorFileContent/') && key.endsWith(`/${path}`);
	return {
		stored: () => setItem.mock.calls.filter(([key]) => ours(key)).map(([, value]) => JSON.parse(value) as string),
		removed: () => removeItem.mock.calls.filter(([key]) => ours(key)).length,
	};
}

function buffered(path: string): string | undefined {
	const key = Object.keys(sessionStorage).find(k => k.startsWith('EditorFileContent/') && k.endsWith(`/${path}`));
	return key ? JSON.parse(sessionStorage.getItem(key)!) : undefined;
}

function type(label: string, text: string) {
	const input = screen.getByLabelText(label);
	for (let length = 1; length <= text.length; length++) {
		fireEvent.change(input, { target: { value: text.slice(0, length) } });
	}
}

async function save() {
	const before = server.state.saves.length;
	act(() => emitToListeners('SaveFile', true));
	await waitFor(() => expect(server.state.saves.length).toBe(before + 1));
	return server.state.saves.at(-1)!;
}

beforeAll(() => {
	// Radix's Switch reaches for pointer-capture APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	sessionStorage.clear();
	server.state.pendingRead = undefined;
	server.state.failReads = false;
	server.state.pendingWrite = undefined;
	server.state.saves = [];
});

describe('SchemaEditorView: a schema file only ever holds its own contents (#1929)', () => {
	it.each(
		[
			['a folder README', schemasFolder, /Your schemas are defined in/],
			['another file', resources, /export const answer/],
		] as const,
	)('opens a new, empty schema after %s with nothing in it', async (_, previous, previousShown) => {
		renderEditor();
		await openEntry(previous, previousShown);
		const buffer = watchBuffer(newSchema.path);

		await openEntry(newSchema, 'No tables yet.');

		expect(buffer.stored()).toEqual([]);
		expect(screen.queryByText(/This file has other content/)).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		expect(screen.getByLabelText<HTMLTextAreaElement>('Source').value).toBe('');
	});

	it('saves only the table added to a new schema opened from a folder, with its database', async () => {
		renderEditor();
		await openEntry(schemasFolder, /Your schemas are defined in/);
		await openEntry(newSchema, 'No tables yet.');

		fireEvent.click(screen.getByRole('button', { name: /add table/i }));
		type('Table (type) name', 'Thing');
		type('Database', 'punch');

		expect(await save()).toEqual({
			file: 'schemas/thing.graphql',
			payload: 'type Thing @table(database: "punch") @export @sealed {\n\tid: ID @primaryKey\n}\n',
		});
	});

	it('opens an existing schema without dirtying it', async () => {
		renderEditor();
		await openEntry(schemasFolder, /Your schemas are defined in/);
		const buffer = watchBuffer(dogSchema.path);

		await openEntry(dogSchema, 'Dog');

		expect(buffer.stored()).toEqual([]);
		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		expect(screen.getByLabelText<HTMLTextAreaElement>('Source').value).toBe(DOG);
	});

	it('shows nothing editable until the file loads, then falls back to text for a schema it cannot parse', async () => {
		renderEditor();
		let finishRead!: () => void;
		server.state.pendingRead = new Promise(resolve => (finishRead = resolve));

		act(() => open(brokenSchema));
		await act(async () => {});
		expect(screen.queryByRole('button', { name: /add table/i })).toBeNull();
		expect(screen.queryByText('No tables yet.')).toBeNull();

		act(() => finishRead());
		const source = await screen.findByLabelText<HTMLTextAreaElement>('Source');
		expect(source.value).toContain('type Broken');
		expect(screen.queryByRole('button', { name: /add table/i })).toBeNull();
	});

	it('falls back to text for a schema it cannot parse on every open, not only the first', async () => {
		renderEditor();
		await openEntry(brokenSchema, /type Broken/, 'source');
		await openEntry(schemasFolder, /Your schemas are defined in/);

		// The contents are cached now, so they are known the moment the schema is opened again.
		await openEntry(brokenSchema, /type Broken/, 'source');

		expect(screen.getByLabelText<HTMLTextAreaElement>('Source').value).toContain('type Broken');
		expect(screen.queryByText(/This file has other content/)).toBeNull();
	});

	it('reopens a schema emptied but not saved as empty', async () => {
		renderEditor();
		await openEntry(dogSchema, 'Dog');
		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		fireEvent.change(screen.getByLabelText('Source'), { target: { value: '' } });
		expect(buffered(dogSchema.path)).toBe('');
		await openEntry(schemasFolder, /Your schemas are defined in/);

		await openEntry(dogSchema, 'No tables yet.');
		await act(async () => {});

		expect(screen.queryByText('Dog')).toBeNull();
		expect(buffered(dogSchema.path)).toBe('');
	});

	it('keeps an unsaved draft through a failed read, and shows it once a read succeeds', async () => {
		renderEditor();
		await openEntry(dogSchema, 'Dog');
		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		fireEvent.change(screen.getByLabelText('Source'), { target: { value: CAT } });
		await openEntry(schemasFolder, /Your schemas are defined in/);
		const dogQuery = ['instance-1', 'get_component_file', 'punch', 'schemas/schema.graphql', undefined];
		queryClient.removeQueries({ queryKey: dogQuery });

		server.state.failReads = true;
		act(() => open(dogSchema));
		await waitFor(() => expect(queryClient.getQueryState(dogQuery)?.status).toBe('error'));
		expect(screen.queryByRole('button', { name: /add table/i })).toBeNull();
		expect(buffered(dogSchema.path)).toBe(CAT);

		server.state.failReads = false;
		await act(() => queryClient.refetchQueries({ queryKey: dogQuery }));
		expect(await screen.findByText('Cat')).toBeTruthy();
		expect(screen.queryByText('Dog')).toBeNull();
		expect(buffered(dogSchema.path)).toBe(CAT);
	});

	it('takes in refetched contents without writing the old schema into the buffer', async () => {
		renderEditor();
		await openEntry(dogSchema, 'Dog');
		const buffer = watchBuffer(dogSchema.path);

		server.state.files['schemas/schema.graphql'] = CAT;
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'get_component_file'] }));
		await screen.findByText('Cat');

		expect(screen.queryByText('Dog')).toBeNull();
		expect(buffer.stored()).toEqual([]);
		expect(buffered(dogSchema.path)).toBeUndefined();
	});

	it('keeps text edits when going back to the visual editor', async () => {
		renderEditor();
		await openEntry(dogSchema, 'Dog');
		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		const edited = `${DOG}\n${CAT}`;
		fireEvent.change(screen.getByLabelText('Source'), { target: { value: edited } });
		const buffer = watchBuffer(dogSchema.path);

		fireEvent.click(screen.getByRole('button', { name: /visual editor/i }));
		await screen.findByText('Cat');

		// The buffer may be rewritten with the same text, but never with the old schema, nor cleared.
		expect(buffer.stored().filter(value => value !== edited)).toEqual([]);
		expect(buffer.removed()).toBe(0);
		expect(buffered(dogSchema.path)).toBe(edited);
	});

	it.each([
		['an earlier edit', 'type Thing @table @export @sealed {\n\tid: ID\n}\n'],
		['nothing', undefined],
	])('saves the schema on screen even when the shared buffer trails it with %s', async (_, trailing) => {
		renderEditor();
		await openEntry(newSchema, 'No tables yet.');
		fireEvent.click(screen.getByRole('button', { name: /add table/i }));
		type('Table (type) name', 'Thing');
		type('Database', 'punch');

		// Another subscriber to the buffer echoes back a value from before the edits above.
		const key = Object.keys(sessionStorage).find(k => k.endsWith(`/${newSchema.path}`))!;
		act(() => emitToListeners(`Session:${key}` as 'Session:{key}', trailing));

		expect((await save()).payload).toBe(
			'type Thing @table(database: "punch") @export @sealed {\n\tid: ID @primaryKey\n}\n',
		);
	});

	it('keeps edits made while a save is in flight, and saves them next', async () => {
		renderEditor();
		await openEntry(newSchema, 'No tables yet.');
		fireEvent.click(screen.getByRole('button', { name: /add table/i }));
		type('Table (type) name', 'Thing');
		let finishWrite!: () => void;
		server.state.pendingWrite = new Promise(resolve => (finishWrite = resolve));
		act(() => emitToListeners('SaveFile', true));
		await waitFor(() => expect(screen.getByLabelText('Database')).toBeTruthy());

		type('Database', 'punch');
		await act(async () => finishWrite());
		await waitFor(() => expect(server.state.saves).toHaveLength(1));
		await waitFor(() => expect(buffered(newSchema.path)).toContain('database: "punch"'));

		expect(server.state.saves[0].payload).toBe('type Thing @table @export @sealed {\n\tid: ID @primaryKey\n}\n');
		expect(screen.getByLabelText<HTMLInputElement>('Database').value).toBe('punch');
		expect((await save()).payload).toBe(
			'type Thing @table(database: "punch") @export @sealed {\n\tid: ID @primaryKey\n}\n',
		);
	});
});
