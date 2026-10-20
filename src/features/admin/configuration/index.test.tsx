/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import { ConfigurationIndex, jsonType, parseConfigValue } from '@/features/admin/configuration/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(), patch: vi.fn() } }));
const auth = vi.hoisted(() => ({ fabricRole: 'fabric_admin' }));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => ({ user: { fabricRole: auth.fabricRole } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);
const mockedPatch = vi.mocked(apiClient.patch);

const ROWS = [
	{ name: 'OVERALLOCATED_CPU_MULTIPLIER', description: 'CPU overallocation', value: 20, superUserOnly: false },
	{ name: 'HOST_SSH_KEYS', description: 'SSH keys', value: ['ssh-ed25519 AAAA'], superUserOnly: true },
];

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	auth.fabricRole = 'fabric_admin';
	mockedGet.mockReset();
	mockedPatch.mockReset();
	mockedGet.mockResolvedValue({ data: ROWS } as never);
	mockedPatch.mockResolvedValue({ data: undefined } as never);
});
afterEach(cleanup);

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<ConfigurationIndex />
		</QueryClientProvider>,
	);
}

async function openEditor(name: string) {
	await screen.findByText(name);
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
	});
	return screen.getByLabelText('Value (JSON)');
}

async function type(textarea: HTMLElement, value: string) {
	await act(async () => {
		fireEvent.change(textarea, { target: { value } });
	});
}

describe('ConfigurationIndex', () => {
	it('lists every key with its value and marks the super-user-only ones', async () => {
		renderPage();
		expect(await screen.findByText('OVERALLOCATED_CPU_MULTIPLIER')).toBeTruthy();
		expect(screen.getByText('20')).toBeTruthy();
		expect(screen.getByText('["ssh-ed25519 AAAA"]')).toBeTruthy();
		expect(screen.getAllByText('Super user')).toHaveLength(1);
	});

	it('lets fabric_admin edit only the keys that are not super-user-only', async () => {
		renderPage();
		await screen.findByText('HOST_SSH_KEYS');
		expect(screen.queryByRole('button', { name: 'Edit OVERALLOCATED_CPU_MULTIPLIER' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Edit HOST_SSH_KEYS' })).toBeNull();
	});

	it('lets the core super user edit every key', async () => {
		auth.fabricRole = 'super_user';
		renderPage();
		await screen.findByText('HOST_SSH_KEYS');
		expect(screen.queryByRole('button', { name: 'Edit HOST_SSH_KEYS' })).toBeTruthy();
	});

	it('refuses to save JSON that does not parse', async () => {
		renderPage();
		const textarea = await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		await type(textarea, '{ nope');
		expect(screen.getByText(/Not valid JSON/)).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('warns when an edit changes the value type, and saves the parsed value', async () => {
		renderPage();
		const textarea = await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		await type(textarea, '"25"');
		expect(screen.getByText(/changes the value from number to string/)).toBeTruthy();

		await type(textarea, '25');
		expect(screen.queryByText(/changes the value from/)).toBeNull();
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(mockedPatch).toHaveBeenCalledWith('/Admin/Configuration/OVERALLOCATED_CPU_MULTIPLIER', { value: 25 });
		await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
	});

	it('shows a refused save in the dialog', async () => {
		mockedPatch.mockRejectedValue(new Error('Configuration key X can only be changed by the core super user'));
		renderPage();
		const textarea = await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		await type(textarea, '30');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(await within(screen.getByRole('dialog')).findByText(/can only be changed by the core super user/))
			.toBeTruthy();
	});

	it('refuses a number JSON would silently turn into null', async () => {
		renderPage();
		const textarea = await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		await type(textarea, '1e400');
		expect(screen.getByText('A number is too large to save exactly.')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
	});

	// Closing would unmount the dialog and drop the save's outcome, so it stays open until it settles.
	it('stays open while a save is in flight, then refreshes the list', async () => {
		let finish: () => void = () => {};
		mockedPatch.mockImplementation(() =>
			new Promise((resolve) => (finish = () => resolve({ data: undefined }))) as never
		);
		renderPage();
		const textarea = await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		await type(textarea, '25');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
		);
		await act(async () => {
			fireEvent.keyDown(textarea, { key: 'Escape' });
		});
		expect(screen.getByLabelText('Value (JSON)')).toBeTruthy();

		await act(async () => finish());
		await waitFor(() => expect(screen.queryByLabelText('Value (JSON)')).toBeNull());
		await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
	});

	it('clears a refused save once the value is edited again', async () => {
		mockedPatch.mockRejectedValue(new Error('refused by central-manager'));
		renderPage();
		const textarea = await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		await type(textarea, '30');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(await screen.findByText(/refused by central-manager/)).toBeTruthy();
		await type(textarea, '31');
		expect(screen.queryByText(/refused by central-manager/)).toBeNull();
	});

	it('disables Save until the value changes', async () => {
		renderPage();
		await openEditor('OVERALLOCATED_CPU_MULTIPLIER');
		expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('parseConfigValue / jsonType', () => {
	it('parses JSON and reports a parse failure', () => {
		expect(parseConfigValue('[1, 2]')).toEqual({ ok: true, value: [1, 2] });
		expect(parseConfigValue('false')).toEqual({ ok: true, value: false });
		expect(parseConfigValue('nope').ok).toBe(false);
	});

	it('rejects numbers that would not survive the round trip, nested ones too', () => {
		for (const text of ['1e400', '[1, -1e400]', '{"a": {"b": 9007199254740993}}']) {
			expect(parseConfigValue(text).ok).toBe(false);
		}
		expect(parseConfigValue('9007199254740991').ok).toBe(true);
		expect(parseConfigValue('0.1').ok).toBe(true);
	});

	it('names JSON types, telling null and arrays apart from objects', () => {
		expect([null, [], {}, 'x', 1, true].map(jsonType)).toEqual([
			'null',
			'array',
			'object',
			'string',
			'number',
			'boolean',
		]);
	});
});
