/**
 * @vitest-environment jsdom
 */
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Monaco can't load in jsdom; stub the editor with a plain element that exposes the value it was
// given and whether it was rendered read-only.
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: ({ value, options }: { value?: string; options?: { readOnly?: boolean } }) => (
		<div data-testid="editor" data-readonly={String(Boolean(options?.readOnly))}>{value}</div>
	),
}));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));

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

afterEach(() => cleanup());

const noop = () => {};
const row = { name: 'Ada Lovelace', city: 'London', id: 'abc-123' };

function renderModal(overrides: Record<string, unknown> = {}) {
	return render(
		<EditTableRowModal
			canEditRecords
			canDeleteRecords
			setIsModalOpen={noop}
			isModalOpen
			primaryKey="email"
			syntheticAttributes={[]}
			data={[row]}
			onSaveChanges={noop}
			onDeleteRecord={noop}
			isUpdateTableRecordsPending={false}
			isDeleteTableRecordsPending={false}
			{...overrides}
		/>,
	);
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

	it('lets a normal row be edited and deleted', () => {
		renderModal();

		expect(screen.queryByText('This row has no primary key value')).toBeNull();
		expect(screen.getByRole('heading').textContent).toContain('Edit');
		expect(screen.getByTestId('editor').getAttribute('data-readonly')).toBe('false');
		expect(screen.getByRole('button', { name: /Save Changes/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Delete Row/i })).toBeTruthy();
	});
});
