/**
 * @vitest-environment jsdom
 */
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Monaco can't load in jsdom; stub the editor with a <textarea> that exposes the value and
// language it was given, is read-only when told, and forwards edits through `onChange` so a
// test can drive typing/pasting.
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: (
		{ value, language, options, onChange }: {
			value?: string;
			language?: string;
			options?: { readOnly?: boolean };
			onChange?: (value: string | undefined) => void;
		},
	) => (
		<textarea
			data-testid="editor"
			data-language={language}
			data-readonly={String(Boolean(options?.readOnly))}
			readOnly={Boolean(options?.readOnly)}
			value={value ?? ''}
			onChange={event => onChange?.(event.target.value)}
		/>
	),
}));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), loading: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

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

const noop = () => {};
const row = { name: 'Ada Lovelace', city: 'London', id: 'abc-123' };

function modal(overrides: Record<string, unknown> = {}) {
	const props = {
		canEditRecords: true,
		canDeleteRecords: true,
		setIsModalOpen: noop,
		isModalOpen: true,
		primaryKey: 'email',
		syntheticAttributes: [],
		data: [row],
		onSaveChanges: noop,
		onDeleteRecord: noop,
		isUpdateTableRecordsPending: false,
		isDeleteTableRecordsPending: false,
		...overrides,
	};
	return <EditTableRowModal {...props} />;
}

function renderModal(overrides: Record<string, unknown> = {}) {
	return render(modal(overrides));
}

function saveButton() {
	return screen.getByRole('button', { name: /Save Changes/i });
}

describe('EditTableRowModal', () => {
	it('warns, goes read-only, and hides write actions when the primary key is missing', () => {
		renderModal({ missingPrimaryKey: true });

		expect(screen.getByText('This row has no primary key value')).toBeTruthy();
		// The banner names the missing primary-key attribute.
		expect(screen.getByText('email')).toBeTruthy();
		expect(screen.getByRole('heading').textContent).toContain('View');
		expect(screen.getByTestId('editor').getAttribute('data-readonly')).toBe('true');
		// No way to save or delete a row that can't be addressed.
		expect(screen.queryByRole('button', { name: /Save Changes/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Delete Row/i })).toBeNull();
	});

	it("warns and hides write actions when the record can't be loaded by its primary key", () => {
		renderModal({ recordUnavailable: true });

		expect(screen.getByText("This row couldn't be loaded")).toBeTruthy();
		expect(screen.getByText('email')).toBeTruthy();
		expect(screen.getByRole('heading').textContent).toContain('View');
		expect(screen.getByTestId('editor').getAttribute('data-readonly')).toBe('true');
		expect(screen.queryByRole('button', { name: /Save Changes/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Delete Row/i })).toBeNull();
	});

	it('does not throw when Delete Row is clicked before the record has loaded', () => {
		// The parent passes `data={searchByIdData?.data}`, which is undefined while the
		// record fetch is in flight — but the Delete Row button renders regardless. Clicking
		// it then used to do an unguarded `data[0]` and throw an unhandled
		// "Cannot read properties of undefined (reading '0')" (RUM, browse table view).
		const onDeleteRecord = vi.fn();
		renderModal({ data: undefined, onDeleteRecord });

		const deleteButton = screen.getByRole('button', { name: /Delete Row/i });
		expect(() => fireEvent.click(deleteButton)).not.toThrow();
		// Nothing to delete without a loaded record, so the delete is a no-op.
		expect(onDeleteRecord).not.toHaveBeenCalled();
	});

	it('lets a normal row be edited and deleted', () => {
		renderModal();

		expect(screen.queryByText('This row has no primary key value')).toBeNull();
		expect(screen.getByRole('heading').textContent).toContain('Edit');
		expect(screen.getByTestId('editor').getAttribute('data-readonly')).toBe('false');
		expect(screen.getByRole('button', { name: /Save Changes/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Delete Row/i })).toBeTruthy();
	});

	it('edits with the worker-free JSON language, so no language worker can OOM', () => {
		renderModal();
		expect(screen.getByTestId('editor').getAttribute('data-language')).toBe(WORKER_FREE_JSON_LANGUAGE_ID);
	});

	it('saves the parsed record when the edited JSON is valid', () => {
		const onSaveChanges = vi.fn();
		renderModal({ onSaveChanges });

		fireEvent.change(screen.getByTestId('editor'), { target: { value: '[{"name":"Grace"}]' } });
		fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

		expect(onSaveChanges).toHaveBeenCalledWith([{ name: 'Grace' }]);
		expect(toast.error).not.toHaveBeenCalled();
	});

	// Regression for the large-paste path: nothing validates the buffer as it is typed, so a
	// malformed oversized paste reaches Save — which must catch it and surface a toast rather than
	// throw an uncaught SyntaxError.
	it('shows an error and does not save an oversized, malformed record', () => {
		const onSaveChanges = vi.fn();
		renderModal({ onSaveChanges });

		const oversizedMalformed = `[{"blob":"${'x'.repeat(MAX_WORKER_MODEL_CHARS)}`; // unterminated
		fireEvent.change(screen.getByTestId('editor'), { target: { value: oversizedMalformed } });
		fireEvent.click(saveButton());

		expect(onSaveChanges).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledTimes(1);
	});

	// Regression for #1600: Save used to be gated on a validity flag, so a malformed edit left a
	// dead button and — since the worker-free language draws no squiggles — nothing said why.
	it('keeps Save clickable on a malformed record and reports where the syntax breaks', () => {
		const onSaveChanges = vi.fn();
		renderModal({ onSaveChanges });

		fireEvent.change(screen.getByTestId('editor'), {
			target: { value: '[\n    {\n        "name" "Grace"\n    }\n]' },
		});

		expect(saveButton().hasAttribute('disabled')).toBe(false);

		fireEvent.click(saveButton());

		expect(onSaveChanges).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(
			"This record isn't valid JSON",
			{ description: expect.stringContaining('Line 3') },
		);
	});

	// The reported symptom: the flag lived outside the dialog's contents, so an abandoned malformed
	// draft kept Save disabled after the modal was closed and re-opened on the same row — with the
	// stored record, which looks perfectly valid, back on screen.
	it('does not carry an abandoned draft into the next open of the same row', () => {
		const onSaveChanges = vi.fn();
		const setIsModalOpen = vi.fn();
		const { rerender } = renderModal({ onSaveChanges, setIsModalOpen });

		fireEvent.change(screen.getByTestId('editor'), { target: { value: '[{"name": "Grace' } }); // unterminated
		rerender(modal({ onSaveChanges, setIsModalOpen, isModalOpen: false }));
		rerender(modal({ onSaveChanges, setIsModalOpen }));

		expect(saveButton().hasAttribute('disabled')).toBe(false);
		// The draft went with the dialog, so Save has nothing of the user's to persist.
		fireEvent.click(saveButton());
		expect(onSaveChanges).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(setIsModalOpen).toHaveBeenCalledWith(false);
	});

	// The modal instance is reused across rows; opening a different record must not carry the
	// previous row's draft (which would otherwise be saved for the new row).
	it('resets the draft when a different record is opened', () => {
		const onSaveChanges = vi.fn();
		const setIsModalOpen = vi.fn();
		const { rerender } = renderModal({ onSaveChanges, setIsModalOpen, data: [{ id: 'a', name: 'A' }] });

		// Edit the first row, then open a different row without touching it.
		fireEvent.change(screen.getByTestId('editor'), { target: { value: '[{"name":"edited A"}]' } });
		rerender(modal({ onSaveChanges, setIsModalOpen, data: [{ id: 'b', name: 'B' }] }));
		fireEvent.click(saveButton());

		// The stale "edited A" draft was discarded, so Save just closes rather than persisting it.
		expect(onSaveChanges).not.toHaveBeenCalled();
		expect(setIsModalOpen).toHaveBeenCalledWith(false);
	});

	// Same reset, but from a refetch under an open editor: it used to take the unsaved edits with
	// it, and Save then just closed the modal — no save, no warning, edits gone.
	it('warns when a record that changed on the server discards unsaved edits', () => {
		const onSaveChanges = vi.fn();
		const { rerender } = renderModal({ onSaveChanges, data: [{ id: 'a', name: 'A' }] });

		fireEvent.change(screen.getByTestId('editor'), { target: { value: '[{"id":"a","name":"edited A"}]' } });
		rerender(modal({ onSaveChanges, data: [{ id: 'a', name: 'A (changed elsewhere)' }] }));

		expect(screen.getByText('This record changed while you were editing it')).toBeTruthy();
	});

	it('explains an emptied editor rather than closing as if there were nothing to save', () => {
		const onSaveChanges = vi.fn();
		const setIsModalOpen = vi.fn();
		renderModal({ onSaveChanges, setIsModalOpen });

		fireEvent.change(screen.getByTestId('editor'), { target: { value: '' } });
		fireEvent.click(saveButton());

		expect(onSaveChanges).not.toHaveBeenCalled();
		expect(setIsModalOpen).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledTimes(1);
	});
});
