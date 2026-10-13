/** @vitest-environment jsdom */
/**
 * What `openedEntryContents` is on every render, against the real query client. Editors seed from it as
 * they mount, so a single render that pairs one entry with another's contents is enough to corrupt a
 * file (#1929).
 */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import { ReactNode, startTransition, Suspense, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => {
	const reads = { pending: undefined as Promise<void> | undefined };
	const writes = { pending: undefined as Promise<void> | undefined };
	function instance(entityId: string) {
		const files: Record<string, string> = {};
		const instanceClient = {
			post: async (_url: string, body: { operation: string; file?: string; payload?: string }) => {
				if (body.operation === 'get_component_file') {
					await reads.pending;
					return { data: { message: files[body.file!], size: files[body.file!].length } };
				}
				if (body.operation === 'set_component_file') {
					await writes.pending;
					files[body.file!] = body.payload ?? '';
					return { data: { message: 'Successfully set component' } };
				}
				return { data: { name: 'components', entries: [] } };
			},
		};
		const params = {
			entityId,
			entityType: 'instance' as const,
			instanceClient: instanceClient as unknown as AxiosInstance,
		};
		return { files, params, route: { instanceId: entityId } };
	}
	const instances = { 'instance-1': instance('instance-1'), 'instance-2': instance('instance-2') };
	return { reads, writes, instances, current: instances['instance-1'] };
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => server.current.params }));
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => 'https://instance.example.com:9925' }));
vi.mock('@tanstack/react-router', () => {
	const navigate = () => {};
	const search = {};
	return { useNavigate: () => navigate, useSearch: () => search, useParams: () => server.current.route };
});

import { EditorViewProvider } from './EditorViewProvider';

const README = '# Schemas\n\nYour schemas are defined in `.graphql` files.\n';
const SCRIPT = 'export const answer = 42;\n';
const OTHER_SCRIPT = 'export const answer = 7;\n';
const SAVED_SCRIPT = 'export const answer = 43;\n';
const DRAFT = 'type Draft @table {\n\tid: ID @primaryKey\n}\n';

const readme: FileEntry = { name: 'README.md', path: 'punch/schemas/README.md', project: 'punch' };
const schemasFolder: DirectoryEntry = {
	name: 'schemas',
	path: 'punch/schemas',
	project: 'punch',
	entries: [readme],
	overviewEntry: readme,
};
const script: FileEntry = { name: 'resources.js', path: 'punch/resources.js', project: 'punch' };
const newSchema: FileEntry = { name: 'thing.graphql', path: 'punch/schemas/thing.graphql', project: 'punch' };

let renders: Array<{ entityId: string; path: string | undefined; contents: string | undefined }>;
let editorView: ReturnType<typeof useEditorView>;
let buffer: ReturnType<typeof useEditorFileContent>;

let committed: ReturnType<typeof useEditorView>;

function Probe() {
	const view = useEditorView();
	editorView = view;
	useLayoutEffect(() => {
		committed = view;
	});
	buffer = useEditorFileContent(editorView.openedEntry?.path);
	renders.push({
		entityId: server.current.params.entityId,
		path: editorView.openedEntry?.path,
		contents: editorView.openedEntryContents,
	});
	return null;
}

const neverSettles = new Promise<never>(() => {});

/** Suspends whenever `path` is the open entry, so a transition opening it renders but never commits. */
function SuspendWhileOpen({ path }: { path: string }) {
	if (useEditorView().openedEntry?.path === path) {
		throw neverSettles;
	}
	return null;
}

function renderProvider(extra?: ReactNode) {
	Object.assign(server.instances['instance-1'].files, {
		'schemas/README.md': README,
		'resources.js': SCRIPT,
		'schemas/thing.graphql': '',
	});
	server.instances['instance-2'].files['resources.js'] = OTHER_SCRIPT;
	server.current = server.instances['instance-1'];
	renders = [];
	const tree = (
		<QueryClientProvider client={new QueryClient()}>
			<EditorViewProvider>
				<Probe />
				{extra}
			</EditorViewProvider>
		</QueryClientProvider>
	);
	const view = render(tree);
	return { rerender: () => view.rerender(tree) };
}

async function openEntry(entry: DirectoryEntry | FileEntry, contents: string) {
	act(() => editorView.setOpenedEntry(entry));
	await waitFor(() => expect(editorView.openedEntryContents).toBe(contents));
}

function startSave(payload: string) {
	let finishWrite!: () => void;
	server.writes.pending = new Promise(resolve => (finishWrite = resolve));
	const { files, params } = server.current;
	const entry = editorView.openedEntry!;
	const file = entry.path.split('/').slice(1).join('/');
	act(() => editorView.saveFile({ ...params, file, payload, project: entry.project }, entry.path));
	return async () => {
		await act(async () => finishWrite());
		await waitFor(() => expect(files[file]).toBe(payload));
		await act(async () => {});
	};
}

afterEach(() => {
	cleanup();
	sessionStorage.clear();
	server.reads.pending = undefined;
	server.writes.pending = undefined;
});

describe('EditorViewProvider openedEntryContents', () => {
	it('never hands an entry the contents of the entry opened before it', async () => {
		renderProvider();
		await openEntry(schemasFolder, README);
		await openEntry(script, SCRIPT);
		await openEntry(newSchema, '');

		const seen = (path: string) => new Set(renders.filter(r => r.path === path).map(r => r.contents));
		expect(seen(script.path)).toEqual(new Set([undefined, SCRIPT]));
		expect(seen(newSchema.path)).toEqual(new Set([undefined, '']));
	});

	it('keeps a file saved empty loaded, with contents of ""', async () => {
		renderProvider();
		await openEntry(script, SCRIPT);
		const before = renders.length;

		await startSave('')();

		expect(editorView.openedEntryContents).toBe('');
		expect(renders.slice(before).map(r => r.contents).filter(contents => contents !== SCRIPT)).not.toContain(undefined);
	});

	it('leaves the entry opened while a save was in flight alone when the save lands', async () => {
		renderProvider();
		await openEntry(script, SCRIPT);
		const finishSave = startSave(SAVED_SCRIPT);

		await openEntry(newSchema, '');
		act(() => buffer.setContent(DRAFT));
		await finishSave();

		expect(editorView.openedEntryContents).toBe('');
		expect(buffer.content).toBe(DRAFT);

		server.reads.pending = new Promise(() => {});
		const before = renders.length;
		await openEntry(script, SAVED_SCRIPT);
		expect(renders.slice(before).map(r => r.contents)).not.toContain(SCRIPT);
	});

	it('takes in a save that lands before the file was ever read', async () => {
		renderProvider();
		server.reads.pending = new Promise(() => {});
		act(() => editorView.setOpenedEntry(script));
		await act(async () => {});
		expect(editorView.openedEntryContents).toBeUndefined();

		await startSave(SAVED_SCRIPT)();

		expect(editorView.openedEntryContents).toBe(SAVED_SCRIPT);
	});

	it('still treats the committed entry as open while a transition to another is suspended', async () => {
		renderProvider(
			<Suspense fallback={null}>
				<SuspendWhileOpen path={newSchema.path} />
			</Suspense>,
		);
		await openEntry(script, SCRIPT);
		const { setOpenedEntry, setOpenedEntryContents } = committed;

		await act(async () => startTransition(() => setOpenedEntry(newSchema)));
		expect(committed.openedEntry?.path).toBe(script.path);
		act(() => setOpenedEntryContents(SAVED_SCRIPT));

		expect(committed.openedEntryContents).toBe(SAVED_SCRIPT);
	});

	it.each([
		['drops it when it is what was saved', undefined, undefined],
		[
			'keeps it when it was edited after the save started',
			'export const answer = 44;\n',
			'export const answer = 44;\n',
		],
	])("settles a saved file's unsaved copy after another file is opened: %s", async (_, editedDuringSave, left) => {
		renderProvider();
		await openEntry(script, SCRIPT);
		act(() => buffer.setContent(SAVED_SCRIPT));
		const finishSave = startSave(SAVED_SCRIPT);
		if (editedDuringSave) {
			act(() => buffer.setContent(editedDuringSave));
		}

		await openEntry(newSchema, '');
		await finishSave();

		const key = Object.keys(sessionStorage).find(k => k.endsWith(`/${script.path}`));
		expect(key && JSON.parse(sessionStorage.getItem(key)!)).toBe(left);
	});

	it('ignores a contents setter kept from an entry that is no longer open', async () => {
		renderProvider();
		await openEntry(script, SCRIPT);
		const setScriptContents = editorView.setOpenedEntryContents;
		await openEntry(newSchema, '');

		act(() => setScriptContents('export const answer = 0;\n'));

		expect(editorView.openedEntryContents).toBe('');
	});

	it('keeps the same path on another instance apart, through a switch and a save landing after it', async () => {
		const { rerender } = renderProvider();
		await openEntry(script, SCRIPT);
		const finishSave = startSave(SAVED_SCRIPT);

		// The router keeps the page mounted when another instance is picked, so the open path carries over.
		server.current = server.instances['instance-2'];
		rerender();
		await waitFor(() => expect(editorView.openedEntryContents).toBe(OTHER_SCRIPT));
		act(() => buffer.setContent(DRAFT));
		await finishSave();

		const onSecond = new Set(renders.filter(r => r.entityId === 'instance-2').map(r => r.contents));
		expect(onSecond).toEqual(new Set([undefined, OTHER_SCRIPT]));
		expect(buffer.content).toBe(DRAFT);
	});
});
