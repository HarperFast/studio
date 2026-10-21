/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutate, reset, errorHandler } = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), errorHandler: vi.fn() }));
vi.mock('@/features/admin/apiToken/mutations/useGenerateApiToken', () => ({
	useGenerateApiTokenMutation: () => ({ mutate, reset, isPending: false }),
}));
vi.mock('@/react-query/queryClient', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/react-query/queryClient')>()),
	errorHandler,
}));

import { MintStaffApiTokenForm, roleRefusalMessage } from './MintStaffApiTokenForm';

const self = { id: 'usr-me', email: 'me@harperdb.io', firstname: 'Me', lastname: 'Myself' };
const minted = {
	operationToken: 'fat_sat-1_secret',
	id: 'sat-1',
	name: 'nightly report',
	role: 'fabric_readonly',
	ownerUserId: 'usr-me',
	createdByUserId: 'usr-me',
	createdAt: '2026-10-21T00:00:00.000Z',
	expiresAt: '2026-11-04T00:00:00.000Z',
	lastUsedAt: null,
	revokedAt: null,
	status: 'active',
} as const;

function axiosFailure(status: number, body: unknown): AxiosError {
	const config = { headers: new AxiosHeaders() };
	return new AxiosError('Request failed', String(status), config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: body,
	});
}

function renderForm() {
	const onMinted = vi.fn();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<MintStaffApiTokenForm self={self} onMinted={onMinted} />
		</QueryClientProvider>,
	);
	return onMinted;
}

async function fillAndSubmit(name = 'nightly report') {
	fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
	await act(async () => {
		fireEvent.submit(screen.getByRole('button', { name: 'Mint token' }).closest('form')!);
	});
	return mutate.mock.calls.at(-1)?.[1] as { onSuccess: (result: unknown) => void; onError: (error: unknown) => void };
}

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	mutate.mockReset();
	reset.mockReset();
	errorHandler.mockReset();
});

afterEach(cleanup);

describe('MintStaffApiTokenForm', () => {
	it('mints for the signed-in owner at read-only for 14 days by default', async () => {
		renderForm();

		await fillAndSubmit();

		expect(mutate.mock.calls[0][0]).toEqual({
			ownerUserId: 'usr-me',
			role: 'fabric_readonly',
			name: 'nightly report',
			expiresInHours: 336,
		});
	});

	// The order matters: the page must hold the secret before the mutation forgets it.
	it('hands the minted token to the page, then clears the mutation and the form', async () => {
		const onMinted = renderForm();
		const callbacks = await fillAndSubmit();

		await act(async () => callbacks.onSuccess(minted));

		expect(onMinted).toHaveBeenCalledWith(minted);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(onMinted.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0]);
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
	});

	it('shows a role wider than the owner holds under the role field, and toasts anything else', async () => {
		renderForm();
		const callbacks = await fillAndSubmit();
		const refusal = "A fabric_admin token would exceed the owner's fabric_support role";

		await act(async () => callbacks.onError(axiosFailure(403, { code: 'Forbidden', title: refusal })));
		expect(screen.getByText(refusal)).toBeDefined();
		expect(errorHandler).not.toHaveBeenCalled();

		const limit = axiosFailure(409, { title: 'Limit of 3 live API tokens per owner reached' });
		await act(async () => callbacks.onError(limit));
		expect(errorHandler).toHaveBeenCalledWith(limit);
	});

	it('refuses an empty name before asking the server', async () => {
		renderForm();

		await fillAndSubmit('   ');

		expect(mutate).not.toHaveBeenCalled();
		expect(screen.getByText('Enter a name.')).toBeDefined();
	});
});

describe('roleRefusalMessage', () => {
	it('returns the server message only for a role wider than the owner holds', () => {
		const message = "A fabric_support token would exceed the owner's fabric_readonly role";
		expect(roleRefusalMessage(axiosFailure(403, { code: 'Forbidden', title: message }))).toBe(message);
		expect(roleRefusalMessage(axiosFailure(403, message))).toBe(message);
		expect(roleRefusalMessage(axiosFailure(403, { title: 'API tokens can only be created from a Google SSO session' })))
			.toBeNull();
		expect(roleRefusalMessage(axiosFailure(409, { title: 'Limit of 3 live API tokens per owner reached' }))).toBeNull();
		expect(roleRefusalMessage(new Error("would exceed the owner's role"))).toBeNull();
	});
});
