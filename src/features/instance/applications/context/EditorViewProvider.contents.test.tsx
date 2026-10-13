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
import { afterEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => {
	const files: Record<string, string> = {};
	/** While set, file writes wait on it, so a test can act while a save is in flight. */
	const writes = { pending: undefined as Promise<void> | undefined };
	const instanceClient = {
		post: async (_url: string, body: { operation: string; file?: string; payload?: string }) => {
			if (body.operation === 'get_component_file') {
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
	return {
		files,
		writes,
		params: {
			entityId: 'instance-1',
			entityType: 'instance' as const,
			instanceClient: instanceClient as unknown as AxiosInstance,
		},
	};
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => server.params }));
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => 'https://instance.example.com:9925' }));
vi.mock('@tanstack/react-router', () => {
	const navigate = () => {};
	const search = {};
	const params = { instanceId: 'instance-1' };
	return { useNavigate: () => navigate, useSearch: () => search, useParams: () => params };
});

import { EditorViewProvider } from './EditorViewProvider';

const README = '# Schemas\n\nYour schemas are defined in `.graphql` files.\n';
const SCRIPT = 'export const answer = 42;\n';

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

/** Every render's opened entry and the contents handed out with it. */
let renders: Array<{ path: string | undefined; contents: string | undefined }>;
let editorView: ReturnType<typeof useEditorView>;
let buffer: ReturnType<typeof useEditorFileContent>;

function Probe() {
	editorView = useEditorView();
	buffer = useEditorFileContent(editorView.openedEntry?.path);
	renders.push({ path: editorView.openedEntry?.path, contents: editorView.openedEntryContents });
	return null;
}

function renderProvider() {
	server.files['schemas/README.md'] = README;
	server.files['resources.js'] = SCRIPT;
	server.files['schemas/thing.graphql'] = '';
	renders = [];
	render(
		<QueryClientProvider client={new QueryClient()}>
			<EditorViewProvider>
				<Probe />
			</EditorViewProvider>
		</QueryClientProvider>,
	);
}

async function openEntry(entry: DirectoryEntry | FileEntry, contents: string) {
	act(() => editorView.setOpenedEntry(entry));
	await waitFor(() => expect(editorView.openedEntryContents).toBe(contents));
}

afterEach(() => {
	cleanup();
	sessionStorage.clear();
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

		act(() =>
			editorView.saveFile({ ...server.params, file: 'resources.js', payload: '', project: 'punch' }, script.path)
		);
		await waitFor(() => expect(editorView.openedEntryContents).toBe(''));

		expect(renders.slice(before).map(r => r.contents).filter(contents => contents !== SCRIPT)).not.toContain(undefined);
	});

	it('leaves the entry opened while a save was in flight alone when the save lands', async () => {
		renderProvider();
		await openEntry(script, SCRIPT);
		let finishWrite!: () => void;
		server.writes.pending = new Promise(resolve => (finishWrite = resolve));
		act(() =>
			editorView.saveFile({
				...server.params,
				file: 'resources.js',
				payload: 'export const answer = 43;\n',
				project: 'punch',
			}, script.path)
		);

		await openEntry(newSchema, '');
		act(() => buffer.setContent('type Draft @table {\n\tid: ID @primaryKey\n}\n'));
		await act(async () => finishWrite());
		await waitFor(() => expect(server.files['resources.js']).toBe('export const answer = 43;\n'));
		await act(async () => {});

		expect(editorView.openedEntryContents).toBe('');
		expect(buffer.content).toBe('type Draft @table {\n\tid: ID @primaryKey\n}\n');
	});
});
