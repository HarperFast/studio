/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AddSecretModal, EditSecretModal } from './SecretModals';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

async function clearAndLeave(field: HTMLElement) {
	await act(async () => {
		fireEvent.change(field, { target: { value: 'x' } });
	});
	await act(async () => {
		fireEvent.change(field, { target: { value: '' } });
	});
	await act(async () => {
		fireEvent.blur(field);
	});
}

describe('AddSecretModal', () => {
	it('asks for a key and a value once each is left empty', async () => {
		render(
			<AddSecretModal
				description="Add a secret."
				existingKeys={[]}
				onSubmit={vi.fn()}
				isModalOpen
				setIsModalOpen={() => {}}
			/>,
		);
		await clearAndLeave(screen.getByRole('textbox', { name: /key/i }));
		await clearAndLeave(screen.getByRole('textbox', { name: /value/i }));

		expect(await screen.findByText('Enter a key.')).toBeTruthy();
		expect(await screen.findByText('Enter a value.')).toBeTruthy();
	});

	it('explains a refused key when Enter is pressed in it', async () => {
		render(
			<AddSecretModal
				description="Add a secret."
				existingKeys={['DATABASE_URL']}
				onSubmit={vi.fn()}
				isModalOpen
				setIsModalOpen={() => {}}
			/>,
		);
		const key = screen.getByRole('textbox', { name: /key/i });
		await act(async () => {
			fireEvent.change(key, { target: { value: 'MY KEY' } });
		});
		await act(async () => {
			fireEvent.keyDown(key, { key: 'Enter' });
		});

		expect(await screen.findByText('Letters, numbers, underscore, dash and dot only.')).toBeTruthy();
	});

	it.each([
		['a key with a space', 'MY KEY', 'Letters, numbers, underscore, dash and dot only.'],
		['a key that already exists', 'DATABASE_URL', 'This key already exists — edit it instead.'],
	])('explains why %s is refused once the field is left', async (_, key, message) => {
		render(
			<AddSecretModal
				description="Add a secret."
				existingKeys={['DATABASE_URL']}
				onSubmit={vi.fn()}
				isModalOpen
				setIsModalOpen={() => {}}
			/>,
		);
		await act(async () => {
			fireEvent.change(screen.getByRole('textbox', { name: /key/i }), { target: { value: key } });
		});
		expect(screen.queryByText(message)).toBeNull();

		await act(async () => {
			fireEvent.blur(screen.getByRole('textbox', { name: /key/i }));
		});

		expect(await screen.findByText(message)).toBeTruthy();
		expect((screen.getByRole('button', { name: /Add Secret/ }) as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('EditSecretModal', () => {
	it('asks for a value once the emptied field is left, while Save is disabled', async () => {
		render(<EditSecretModal name="API_KEY" description="Replace the value." onSave={vi.fn()} closeModal={() => {}} />);
		const value = screen.getByRole('textbox', { name: /value/i });
		await act(async () => {
			fireEvent.change(value, { target: { value: 'x' } });
		});
		await act(async () => {
			fireEvent.change(value, { target: { value: '' } });
		});
		expect(screen.queryByText('Enter a value.')).toBeNull();

		await act(async () => {
			fireEvent.blur(value);
		});

		expect(await screen.findByText('Enter a value.')).toBeTruthy();
		expect((screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
	});
});
