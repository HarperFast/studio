/** @vitest-environment jsdom */
import { createTable, hasDirective } from '@/features/instance/applications/lib/schema/mutations';
import { TableModel } from '@/features/instance/applications/lib/schema/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TableCard } from './TableCard';

beforeAll(() => {
	// Radix primitives poke at pointer-capture APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	Element.prototype.scrollIntoView ??= () => {};
	// @ts-expect-error jsdom lacks PointerEvent; MouseEvent carries the fields Radix reads.
	window.PointerEvent ??= class extends MouseEvent {};
});

function makeTable(): TableModel {
	return { ...createTable('t0'), typeName: 'Dog', edited: false };
}

/** Render expanded by default so body-focused assertions can see the form. */
function renderCard(overrides: Partial<Parameters<typeof TableCard>[0]> = {}) {
	return render(
		<TableCard
			table={makeTable()}
			typeNames={['Dog']}
			readOnly={false}
			defaultCollapsed={false}
			onChange={vi.fn()}
			onRemove={vi.fn()}
			{...overrides}
		/>,
	);
}

describe('TableCard', () => {
	it('renders the table name and its fields when expanded', () => {
		renderCard();
		expect((screen.getByLabelText('Table (type) name') as HTMLInputElement).value).toBe('Dog');
		expect((screen.getByLabelText('Field name') as HTMLInputElement).value).toBe('id');
	});

	it('edits the type name through onChange', () => {
		const onChange = vi.fn();
		renderCard({ onChange });
		fireEvent.change(screen.getByLabelText('Table (type) name'), { target: { value: 'Cat' } });
		expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ typeName: 'Cat' }));
	});

	it('toggles the @sealed directive off through onChange', () => {
		const onChange = vi.fn();
		renderCard({ onChange });
		fireEvent.click(screen.getByRole('switch', { name: /Sealed/ }));
		const next = onChange.mock.calls[0][0] as TableModel;
		expect(hasDirective(next.directives, 'sealed')).toBe(false);
	});

	it('disables mutation controls when read-only', () => {
		renderCard({ readOnly: true });
		expect((screen.getByLabelText('Table (type) name') as HTMLInputElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: /Remove table/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('starts collapsed (body hidden) and expands on header click', () => {
		renderCard({ defaultCollapsed: true });
		// The name summary and Remove stay visible; the editable body is hidden.
		expect(screen.queryByLabelText('Table (type) name')).toBeNull();
		expect(screen.getByText(/1 field/)).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /Dog/ }));
		expect((screen.getByLabelText('Table (type) name') as HTMLInputElement).value).toBe('Dog');
	});
});
