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
		canReplaceRecords: true,
		setIsModalOpen: noop,
		isModalOpen: true,
		primaryKey: 'email',
		syntheticAttributes: [],
		data: [row],
		onSaveChanges: noop,
		onReplaceRecord: noop,
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

/** Renders the modal on a row addressable by its primary key, which is what the removal check
 * needs: an edit is only recognised as the same record when its primary-key value matches. */
function renderAddressableModal(overrides: Record<string, unknown> = {}) {
	return renderModal({ primaryKey: 'id', ...overrides });
}

function edit(json: string) {
	fireEvent.change(screen.getByTestId('editor'), { target: { value: json } });
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

	// `update` only takes a list of records, and the editor opens on an array of one — but an edit
	// that drops the brackets still means that record, so it must not go out as a bare object.
	it('saves a de-bracketed record as the one-record list the operation expects', () => {
		const onSaveChanges = vi.fn();
		renderModal({ onSaveChanges });

		fireEvent.change(screen.getByTestId('editor'), { target: { value: '{"name":"Grace"}' } });
		fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

		expect(onSaveChanges).toHaveBeenCalledWith([{ name: 'Grace' }]);
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

	// #1643: `update` merges what it is sent onto the stored record, so a deleted attribute used to
	// come back on the next read while the editor claimed the save had worked. Removing one needs
	// `put`, which replaces the record — so the modal routes those saves there instead.
	describe('an edit that removes an attribute', () => {
		it('replaces the record instead of sending an update that would keep the attribute', () => {
			const onSaveChanges = vi.fn();
			const onReplaceRecord = vi.fn();
			renderAddressableModal({ onSaveChanges, onReplaceRecord });

			edit('[{"name":"Ada Lovelace","id":"abc-123"}]');
			fireEvent.click(saveButton());

			expect(onReplaceRecord).toHaveBeenCalledWith([{ name: 'Ada Lovelace', id: 'abc-123' }]);
			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(toast.error).not.toHaveBeenCalled();
		});

		// No confirmation any more: a `put` is one atomic write that keeps `__createdtime__`, so there
		// is nothing left to warn about. The earlier delete-then-insert needed the prompt because it
		// could leave the record deleted.
		it('saves without asking for confirmation', () => {
			const onReplaceRecord = vi.fn();
			renderAddressableModal({ onReplaceRecord });

			edit('[{"name":"Ada Lovelace","id":"abc-123"}]');
			fireEvent.click(saveButton());

			expect(onReplaceRecord).toHaveBeenCalledTimes(1);
			expect(screen.queryByRole('alertdialog')).toBeNull();
		});

		// The gate: `put` arrived in Harper 5.3.0, so on an older instance the removal is impossible
		// rather than merely awkward. Refusing with an explanation beats sending an `update` that
		// would report success and silently keep the attribute — the original bug.
		it('refuses and explains when the instance predates the put operation', () => {
			const onSaveChanges = vi.fn();
			const onReplaceRecord = vi.fn();
			renderAddressableModal({ onSaveChanges, onReplaceRecord, canReplaceRecords: false });

			edit('[{"name":"Ada Lovelace","id":"abc-123"}]');
			fireEvent.click(saveButton());

			expect(onReplaceRecord).not.toHaveBeenCalled();
			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(toast.error).toHaveBeenCalledTimes(1);
		});

		// A replace is last-writer-wins over the whole record, so it must never reach a record the
		// user only lightly touched. The editor's JSON is free text, so a pasted batch can mix the
		// two — one removal used to send every record in it through `put`.
		it('refuses a batch where only some records drop an attribute', () => {
			const onSaveChanges = vi.fn();
			const onReplaceRecord = vi.fn();
			renderAddressableModal({
				onSaveChanges,
				onReplaceRecord,
				data: [row, { id: 'def-456', name: 'Grace Hopper', rank: 'Rear Admiral' }],
			});

			// First record drops `city`; second only changes a value.
			edit('[{"name":"Ada Lovelace","id":"abc-123"},{"id":"def-456","name":"Grace","rank":"Admiral"}]');
			fireEvent.click(saveButton());

			expect(onReplaceRecord).not.toHaveBeenCalled();
			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(toast.error).toHaveBeenCalledTimes(1);
		});

		// Every record being a deliberate rewrite is safe: there is no untouched record to clobber.
		it('replaces a batch where every record drops an attribute', () => {
			const onReplaceRecord = vi.fn();
			renderAddressableModal({
				onReplaceRecord,
				data: [row, { id: 'def-456', name: 'Grace Hopper', rank: 'Rear Admiral' }],
			});

			edit('[{"name":"Ada Lovelace","id":"abc-123"},{"id":"def-456","name":"Grace Hopper"}]');
			fireEvent.click(saveButton());

			expect(onReplaceRecord).toHaveBeenCalledTimes(1);
			expect(toast.error).not.toHaveBeenCalled();
		});

		// `put` needs insert as well as update, so an update-only role would get a 403. Telling that
		// user to upgrade their instance sends them somewhere that cannot help.
		it('explains a permission block differently from a version block', () => {
			renderAddressableModal({ canReplaceRecords: false, replaceBlockedReason: 'permission' });

			edit('[{"name":"Ada Lovelace","id":"abc-123"}]');
			fireEvent.click(saveButton());

			expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/permission/i);
		});

		it('names the release only when the version is genuinely too old', () => {
			renderAddressableModal({ canReplaceRecords: false, replaceBlockedReason: 'version' });

			edit('[{"name":"Ada Lovelace","id":"abc-123"}]');
			fireEvent.click(saveButton());

			expect((vi.mocked(toast.error).mock.calls[0][1] as { description: string }).description)
				.toMatch(/5\.3\.0/);
		});
	});

	// The primary key identifies the record, so editing it isn't an edit to that record: `update`
	// either skips it silently (reported as success — the #1643 failure again) or, if the new key
	// exists, patches a record the user never opened.
	describe('an edit that changes the primary key', () => {
		it('refuses a save that deleted the primary key', () => {
			const onSaveChanges = vi.fn();
			const onReplaceRecord = vi.fn();
			renderAddressableModal({ onSaveChanges, onReplaceRecord });

			edit('[{"name":"Ada Lovelace","city":"London"}]');
			fireEvent.click(saveButton());

			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(onReplaceRecord).not.toHaveBeenCalled();
			expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/is missing from the save/i);
		});

		it('refuses a save that changed the primary key to another value', () => {
			const onSaveChanges = vi.fn();
			const onReplaceRecord = vi.fn();
			renderAddressableModal({ onSaveChanges, onReplaceRecord });

			edit('[{"id":"def-456","name":"Ada Lovelace","city":"London"}]');
			fireEvent.click(saveButton());

			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(onReplaceRecord).not.toHaveBeenCalled();
			expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/is missing from the save/i);
		});

		// Checked ahead of the removal routing, so a payload that does both is refused for the key
		// rather than replacing a record under a key the user never opened.
		it('refuses a key change even when the edit also removes an attribute', () => {
			const onReplaceRecord = vi.fn();
			renderAddressableModal({ onReplaceRecord });

			edit('[{"id":"def-456","name":"Ada Lovelace"}]');
			fireEvent.click(saveButton());

			expect(onReplaceRecord).not.toHaveBeenCalled();
			expect(toast.error).toHaveBeenCalledTimes(1);
		});

		// Regression: the check is keyed on the LOADED keys, so a stored row with no primary-key value
		// (#1199) can't refuse the whole batch. An earlier rule flagged every keyless edited record and
		// blocked this valid edit.
		it('still saves when a co-loaded record has no primary-key value', () => {
			const onSaveChanges = vi.fn();
			renderAddressableModal({
				onSaveChanges,
				data: [row, { name: 'keyless row' }],
			});

			edit('[{"id":"abc-123","name":"Ada L","city":"Paris"},{"name":"keyless row"}]');
			fireEvent.click(saveButton());

			expect(onSaveChanges).toHaveBeenCalledTimes(1);
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('refuses an added record naming a key the editor never loaded', () => {
			const onSaveChanges = vi.fn();
			renderAddressableModal({ onSaveChanges });

			edit('[{"id":"abc-123","name":"Ada Lovelace","city":"London"},{"id":"def-456","name":"Grace"}]');
			fireEvent.click(saveButton());

			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/didn't load/i);
		});

		it('refuses a pasted record that has no primary key at all', () => {
			const onSaveChanges = vi.fn();
			renderAddressableModal({ onSaveChanges });

			edit('[{"id":"abc-123","name":"Ada Lovelace","city":"London"},{"name":"brand new"}]');
			fireEvent.click(saveButton());

			expect(onSaveChanges).not.toHaveBeenCalled();
			expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/adds a record with no id/i);
		});

		it('still saves an ordinary edit that leaves the primary key alone', () => {
			const onSaveChanges = vi.fn();
			renderAddressableModal({ onSaveChanges });

			edit('[{"id":"abc-123","name":"Ada L","city":"Paris"}]');
			fireEvent.click(saveButton());

			expect(onSaveChanges).toHaveBeenCalledTimes(1);
			expect(toast.error).not.toHaveBeenCalled();
		});
	});

	// The differ indexes edited records by primary key, which would throw on a null element. It
	// never sees one: the shared parser rejects a non-object entry first. Pinned because the crash
	// would be an unhandled TypeError in a click handler, not a toast.
	it('rejects an array containing a non-object before routing the save', () => {
		const onSaveChanges = vi.fn();
		const onReplaceRecord = vi.fn();
		renderAddressableModal({ onSaveChanges, onReplaceRecord });

		edit('[null]');
		fireEvent.click(saveButton());

		expect(onSaveChanges).not.toHaveBeenCalled();
		expect(onReplaceRecord).not.toHaveBeenCalled();
		expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/valid JSON/i);
	});

	// Delete and Save are cross-disabled in both directions. A delete that landed while a `put` was
	// still in flight would be undone by the replace re-creating the record, so neither action may
	// start while the other is going.
	it('disables Delete Row while a save is in flight', () => {
		renderModal({ isUpdateTableRecordsPending: true });

		expect(screen.getByRole('button', { name: /Delete Row/i }).hasAttribute('disabled')).toBe(true);
	});

	it('disables Save Changes while a delete is in flight', () => {
		renderModal({ isDeleteTableRecordsPending: true });

		expect(saveButton().hasAttribute('disabled')).toBe(true);
	});

	// The editor hides `__createdtime__`/`__updatedtime__` and read-only synthetic attributes, so
	// their absence from the edited JSON must never read as the user having removed them.
	it('does not treat the attributes it hides from the editor as removed', () => {
		const onSaveChanges = vi.fn();
		const onReplaceRecord = vi.fn();
		renderAddressableModal({
			onSaveChanges,
			onReplaceRecord,
			data: [{ id: 'abc-123', name: 'Ada', owner: { id: 'o-1' }, __createdtime__: 1, __updatedtime__: 2 }],
			syntheticAttributes: ['owner'],
		});

		edit('[{"id":"abc-123","name":"Ada Lovelace"}]');
		fireEvent.click(saveButton());

		expect(onSaveChanges).toHaveBeenCalledWith([{ id: 'abc-123', name: 'Ada Lovelace' }]);
		expect(onReplaceRecord).not.toHaveBeenCalled();
	});
});
