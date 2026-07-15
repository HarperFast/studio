/**
 * @vitest-environment jsdom
 */
/*
 The shared grants picker: suggesting the components the cluster reports, still allowing a typed
 name for a component that isn't reported, and reporting the choice through onAdd. Uses fireEvent
 (no @testing-library/user-event in this repo).
*/
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentGrantCombobox } from './ComponentGrantCombobox';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const COMPONENTS = ['auth-service', 'billing-service', 'web-app'];

function renderCombobox(overrides: Partial<Parameters<typeof ComponentGrantCombobox>[0]> = {}) {
	const onAdd = overrides.onAdd ?? vi.fn();
	render(
		<ComponentGrantCombobox
			components={COMPONENTS}
			granted={[]}
			onAdd={onAdd}
			{...overrides}
		/>,
	);
	return { onAdd };
}

/** The visible option rows (role=option) as their text. */
function optionTexts(): string[] {
	return screen.queryAllByRole('option').map((el) => el.textContent ?? '');
}

describe('ComponentGrantCombobox', () => {
	it('lists the reported components once focused, filtered by what you type', () => {
		renderCombobox();
		const input = screen.getByRole('combobox');

		fireEvent.focus(input);
		expect(optionTexts()).toEqual(['auth-service', 'billing-service', 'web-app']);

		fireEvent.change(input, { target: { value: 'auth' } });
		// The matching component is offered first; a partial that isn't itself a deployed component
		// also gets an explicit "use this name" row so it's clear it isn't a known application.
		expect(optionTexts()[0]).toBe('auth-service');
		expect(optionTexts().some((t) => t.includes('billing-service'))).toBe(false);
		expect(optionTexts().some((t) => t.includes('not a deployed application'))).toBe(true);
	});

	it('hides already-granted components from the suggestions', () => {
		renderCombobox({ granted: ['auth-service'] });
		fireEvent.focus(screen.getByRole('combobox'));
		expect(optionTexts()).toEqual(['billing-service', 'web-app']);
	});

	it('commits a picked component through onAdd', async () => {
		const { onAdd } = renderCombobox();
		fireEvent.focus(screen.getByRole('combobox'));
		// onMouseDown (not click) is what commits — it fires before the input blur.
		fireEvent.mouseDown(screen.getByText('billing-service'));
		await waitFor(() => expect(onAdd).toHaveBeenCalledWith('billing-service'));
	});

	it('lets you commit a typed name that is not a reported component', async () => {
		const { onAdd } = renderCombobox();
		const input = screen.getByRole('combobox');
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: 'not-deployed-yet' } });

		// The typed name is offered as an explicit "use this" option, not silently swallowed.
		expect(optionTexts().some((t) => t.includes('not-deployed-yet'))).toBe(true);

		fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(onAdd).toHaveBeenCalledWith('not-deployed-yet'));
	});

	it('commits the typed value from the action button', async () => {
		const { onAdd } = renderCombobox({ actionLabel: 'Grant' });
		const input = screen.getByRole('combobox');
		fireEvent.change(input, { target: { value: 'web-app' } });
		fireEvent.click(screen.getByRole('button', { name: /^grant$/i }));
		await waitFor(() => expect(onAdd).toHaveBeenCalledWith('web-app'));
	});

	it('Enter picks the keyboard-highlighted suggestion', async () => {
		const { onAdd } = renderCombobox();
		const input = screen.getByRole('combobox');
		fireEvent.focus(input);
		fireEvent.keyDown(input, { key: 'ArrowDown' }); // move off the first row to the second
		fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(onAdd).toHaveBeenCalledWith('billing-service'));
	});

	it('clears the field after a successful commit', async () => {
		renderCombobox();
		const input = screen.getByRole('combobox') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'web-app' } });
		fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(input.value).toBe(''));
	});

	it('keeps the typed text when onAdd rejects, so the user can retry', async () => {
		const onAdd = vi.fn().mockRejectedValue(new Error('grant failed'));
		renderCombobox({ onAdd });
		const input = screen.getByRole('combobox') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'web-app' } });
		fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(onAdd).toHaveBeenCalled());
		expect(input.value).toBe('web-app');
	});

	it('does not commit a name that is already granted', () => {
		const { onAdd } = renderCombobox({ granted: ['web-app'] });
		const input = screen.getByRole('combobox');
		fireEvent.change(input, { target: { value: 'web-app' } });
		fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
		expect(onAdd).not.toHaveBeenCalled();
	});

	describe('commitOnBlur', () => {
		it('commits a typed-but-not-added name on blur when enabled', async () => {
			const { onAdd } = renderCombobox({ commitOnBlur: true });
			const input = screen.getByRole('combobox');
			fireEvent.change(input, { target: { value: 'web-app' } });
			fireEvent.blur(input);
			await waitFor(() => expect(onAdd).toHaveBeenCalledWith('web-app'));
		});

		it('does not commit on blur by default', () => {
			const { onAdd } = renderCombobox();
			const input = screen.getByRole('combobox');
			fireEvent.change(input, { target: { value: 'web-app' } });
			fireEvent.blur(input);
			expect(onAdd).not.toHaveBeenCalled();
		});
	});

	describe('no components reported (older Harper / no permission)', () => {
		it('degrades to a free-text field that still commits a typed name', async () => {
			const onAdd = vi.fn();
			render(<ComponentGrantCombobox components={[]} granted={[]} onAdd={onAdd} />);
			const input = screen.getByRole('combobox') as HTMLInputElement;
			expect(input.getAttribute('placeholder')).toBe('application name');

			fireEvent.focus(input);
			expect(optionTexts()).toEqual([]); // nothing to suggest

			fireEvent.change(input, { target: { value: 'my-app' } });
			fireEvent.keyDown(input, { key: 'Enter' });
			await waitFor(() => expect(onAdd).toHaveBeenCalledWith('my-app'));
		});
	});
});
