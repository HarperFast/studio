/**
 * @vitest-environment jsdom
 */
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import type { InstanceTable } from '@/integrations/api/api.patch';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

// Monaco can't load in jsdom; stub the editor with a <textarea> that exposes the language it was
// given and forwards edits (including a pasted bulk array) through `onChange`.
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: (
		{ value, language, onChange }: {
			value?: string;
			language?: string;
			onChange?: (value: string | undefined) => void;
		},
	) => (
		<textarea
			data-testid="editor"
			data-language={language}
			value={value ?? ''}
			onChange={event => onChange?.(event.target.value)}
		/>
	),
}));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), loading: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));
vi.mock('@/integrations/api/instance/database/insertTableRecords', () => ({
	useInsertTableRecords: () => ({ mutate, isPending: false }),
}));
vi.mock(
	'@/features/instance/databases/functions/relationshipAttributes',
	() => ({ isSyntheticAttribute: () => false }),
);

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	window.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent() {
			return false;
		},
	})) as unknown as typeof window.matchMedia;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const instanceTable = {
	schema: 'dev',
	name: 'dog',
	primary_key: 'id',
	audit: false,
	schema_defined: true,
	db_size: 0,
	sources: [],
	table_size: 0,
	db_audit_size: 0,
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'name', type: 'String' },
		{ attribute: 'age', type: 'Int' },
	],
} as unknown as InstanceTable;

const noop = () => {};

function renderModal(overrides: Record<string, unknown> = {}) {
	return render(
		<AddTableRowModal
			isModalOpen
			instanceTable={instanceTable}
			setIsModalOpen={noop}
			refreshTable={noop}
			{...overrides}
		/>,
	);
}

describe('AddTableRowModal', () => {
	it('edits with the worker-free JSON language, so no language worker can OOM', () => {
		renderModal();
		expect(screen.getByTestId('editor').getAttribute('data-language')).toBe(WORKER_FREE_JSON_LANGUAGE_ID);
	});

	it('inserts the parsed records when the JSON is valid', () => {
		renderModal();

		fireEvent.change(screen.getByTestId('editor'), { target: { value: '[{"name":"Rex"},{"name":"Fido"}]' } });
		fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate.mock.calls[0][0]).toMatchObject({ records: [{ name: 'Rex' }, { name: 'Fido' }] });
		expect(toast.error).not.toHaveBeenCalled();
	});

	// Regression for the reported crash vector: a large bulk-insert array pasted into "Add row".
	// It stays on the worker-free language (no OOM), and a malformed one is caught at submit time
	// rather than throwing an uncaught SyntaxError.
	it('does not insert an oversized, malformed bulk paste, and shows an error', () => {
		renderModal();

		const oversizedMalformed = `[{"name":"${'x'.repeat(MAX_WORKER_MODEL_CHARS)}`; // unterminated
		fireEvent.change(screen.getByTestId('editor'), { target: { value: oversizedMalformed } });
		expect(screen.getByTestId('editor').getAttribute('data-language')).toBe(WORKER_FREE_JSON_LANGUAGE_ID);

		fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

		expect(mutate).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledTimes(1);
	});
});
