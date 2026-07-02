/**
 * @vitest-environment jsdom
 */
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EnvEditorView } from './index';

/*
 The view is exercised against a mocked per-instance operations client, so both Harper behaviors
 are covered: older versions returning the raw `.env` text (plaintext mode: click-to-reveal,
 whole-file writes) and >= 5.2 returning `protected: true` (protected mode: key-level operations,
 nothing revealable).
 */

const openedEntry: FileEntry = {
	name: '.env',
	path: 'myapp/.env',
	project: 'myapp',
};

const post = vi.fn();
const instanceClient = { post } as unknown as AxiosInstance;

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient, entityId: 'test-instance', entityType: 'instance' }),
}));

vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({ openedEntry }),
}));

// Avoids the router dependency of the real sessionStorage-backed hook; the raw-buffer
// interplay it powers isn't under test here.
const setContent = vi.fn();
vi.mock('@/features/instance/applications/context/editorFileContent', () => ({
	useEditorFileContent: () => ({ content: undefined, setContent }),
}));

vi.mock('@/hooks/usePermissions', () => ({
	useInstanceBrowseManagePermission: () => true,
}));

// The raw-text escape hatch mounts Monaco; a marker div is enough to assert the handoff.
vi.mock('@/features/instance/applications/components/TextEditorView', () => ({
	TextEditorView: () => <div data-testid="raw-text-editor" />,
}));

// Radix dialogs rely on a couple of DOM APIs jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const PLAINTEXT_FILE = '# note\nAPI_KEY=secret123\nDB_URL=postgres://x\n';

/** Routes mocked operation calls; returns the calls recorded for later assertions. */
function mockOperations({ fileResponse }: { fileResponse: Record<string, unknown> }) {
	post.mockImplementation((_url: string, body: { operation: string; key?: string }) => {
		switch (body.operation) {
			case 'get_component_file':
				return Promise.resolve({ data: fileResponse });
			case 'set_component_file':
				return Promise.resolve({ data: { message: 'ok' } });
			case 'set_env_value':
				return Promise.resolve({ data: { message: 'ok', keys: ['API_KEY', 'DB_URL', body.key] } });
			case 'delete_env_value':
				return Promise.resolve({ data: { message: 'ok', keys: ['DB_URL'] } });
			default:
				return Promise.reject(new Error(`Unexpected operation ${body.operation}`));
		}
	});
}

function renderView() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<EnvEditorView />
		</QueryClientProvider>,
	);
}

function operationCalls(operation: string) {
	return post.mock.calls.filter(([, body]) => body.operation === operation).map(([, body]) => body);
}

describe('EnvEditorView (plaintext mode — Harper < 5.2 returns raw text)', () => {
	function mockPlaintext() {
		mockOperations({
			fileResponse: { message: PLAINTEXT_FILE, size: PLAINTEXT_FILE.length, mtime: 'x', birthtime: 'x' },
		});
	}

	it('lists keys with masked values and reveals one only on demand', async () => {
		mockPlaintext();
		renderView();

		expect(await screen.findByText('API_KEY')).toBeTruthy();
		expect(screen.getByText('DB_URL')).toBeTruthy();
		// No value is in the document until deliberately revealed.
		expect(screen.queryByText('secret123')).toBeNull();

		fireEvent.click(screen.getAllByTitle('Reveal value')[0]);
		expect(screen.getByText('secret123')).toBeTruthy();

		// And it can be hidden again.
		fireEvent.click(screen.getByTitle('Hide value'));
		expect(screen.queryByText('secret123')).toBeNull();
	});

	it('adds a secret by rewriting the whole file, preserving comments and other keys', async () => {
		mockPlaintext();
		renderView();
		await screen.findByText('API_KEY');

		fireEvent.click(screen.getByRole('button', { name: /add/i }));
		fireEvent.change(await screen.findByLabelText('Key'), { target: { value: 'NEW_KEY' } });
		fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'two words' } });

		const submit = screen.getByRole('button', { name: /add secret/i });
		await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
		fireEvent.click(submit);

		await waitFor(() => expect(operationCalls('set_component_file')).toHaveLength(1));
		expect(operationCalls('set_component_file')[0]).toMatchObject({
			project: 'myapp',
			file: '.env',
			payload: `# note\nAPI_KEY=secret123\nDB_URL=postgres://x\nNEW_KEY='two words'\n`,
		});
	});

	it('edits a secret in place after click-to-reveal pre-fills the current value', async () => {
		mockPlaintext();
		renderView();

		fireEvent.click(await screen.findByText('API_KEY'));
		const revealButton = await screen.findByRole('button', { name: /reveal current value/i });
		fireEvent.click(revealButton);

		const textarea = screen.getByLabelText('Value') as HTMLTextAreaElement;
		expect(textarea.value).toBe('secret123');
		fireEvent.change(textarea, { target: { value: 'rotated' } });

		const save = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
		fireEvent.click(save);

		await waitFor(() => expect(operationCalls('set_component_file')).toHaveLength(1));
		expect(operationCalls('set_component_file')[0]).toMatchObject({
			payload: '# note\nAPI_KEY=rotated\nDB_URL=postgres://x\n',
		});
	});

	it('deletes a secret through the edit dialog with a two-click confirm', async () => {
		mockPlaintext();
		renderView();

		fireEvent.click(await screen.findByText('DB_URL'));
		const deleteButton = await screen.findByRole('button', { name: /delete/i });
		fireEvent.click(deleteButton);
		// First click arms the confirmation; nothing is written yet.
		expect(operationCalls('set_component_file')).toHaveLength(0);
		fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

		await waitFor(() => expect(operationCalls('set_component_file')).toHaveLength(1));
		expect(operationCalls('set_component_file')[0]).toMatchObject({
			payload: '# note\nAPI_KEY=secret123\n',
		});
	});

	it('offers the raw text editor as an escape hatch', async () => {
		mockPlaintext();
		renderView();
		await screen.findByText('API_KEY');

		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		expect(screen.getByTestId('raw-text-editor')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /secrets view/i }));
		expect(await screen.findByText('API_KEY')).toBeTruthy();
	});
});

describe('EnvEditorView (protected mode — Harper >= 5.2 masks values)', () => {
	const MASKED = 'API_KEY=********\nDB_URL=********\n';

	function mockProtected() {
		mockOperations({
			fileResponse: {
				protected: true,
				keys: ['API_KEY', 'DB_URL'],
				message: MASKED,
				size: MASKED.length,
				mtime: 'x',
				birthtime: 'x',
			},
		});
	}

	it('lists key names with nothing revealable and no raw-text escape hatch', async () => {
		mockProtected();
		renderView();

		expect(await screen.findByText('API_KEY')).toBeTruthy();
		expect(screen.getByText('DB_URL')).toBeTruthy();
		expect(screen.queryByTitle('Reveal value')).toBeNull();
		expect(screen.queryByRole('button', { name: /edit as text/i })).toBeNull();
	});

	it('adds a secret through set_env_value and shows the returned key list', async () => {
		mockProtected();
		renderView();
		await screen.findByText('API_KEY');

		fireEvent.click(screen.getByRole('button', { name: /add/i }));
		fireEvent.change(await screen.findByLabelText('Key'), { target: { value: 'NEW_KEY' } });
		fireEvent.change(screen.getByLabelText('Value'), { target: { value: 's3cret' } });

		const submit = screen.getByRole('button', { name: /add secret/i });
		await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
		fireEvent.click(submit);

		await waitFor(() => expect(operationCalls('set_env_value')).toHaveLength(1));
		expect(operationCalls('set_env_value')[0]).toMatchObject({
			project: 'myapp',
			file: '.env',
			key: 'NEW_KEY',
			value: 's3cret',
			replicated: false,
		});
		// The key list from the operation response lands in the table without a refetch.
		expect(await screen.findByText('NEW_KEY')).toBeTruthy();
		expect(operationCalls('get_component_file')).toHaveLength(1);
		// The whole-file write path is never used against a protected file.
		expect(operationCalls('set_component_file')).toHaveLength(0);
	});

	it('replaces a value through set_env_value without offering a reveal', async () => {
		mockProtected();
		renderView();

		fireEvent.click(await screen.findByText('API_KEY'));
		await screen.findByRole('button', { name: /save/i });
		expect(screen.queryByRole('button', { name: /reveal current value/i })).toBeNull();

		fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'rotated' } });
		const save = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
		fireEvent.click(save);

		await waitFor(() => expect(operationCalls('set_env_value')).toHaveLength(1));
		expect(operationCalls('set_env_value')[0]).toMatchObject({ key: 'API_KEY', value: 'rotated' });
	});

	it('deletes a secret through delete_env_value and drops it from the table', async () => {
		mockProtected();
		renderView();

		fireEvent.click(await screen.findByText('API_KEY'));
		const deleteButton = await screen.findByRole('button', { name: /delete/i });
		fireEvent.click(deleteButton);
		fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

		await waitFor(() => expect(operationCalls('delete_env_value')).toHaveLength(1));
		expect(operationCalls('delete_env_value')[0]).toMatchObject({ key: 'API_KEY', replicated: false });
		await waitFor(() => expect(screen.queryByText('API_KEY')).toBeNull());
	});
});
