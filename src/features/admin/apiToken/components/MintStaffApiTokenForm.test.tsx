/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsync, reset, errorHandler, revokeApiToken, toast } = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	reset: vi.fn(),
	errorHandler: vi.fn(),
	revokeApiToken: vi.fn(),
	toast: { warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/features/admin/apiToken/mutations/useGenerateApiToken', () => ({
	useGenerateApiTokenMutation: () => ({ mutateAsync, reset, isPending: false }),
}));
vi.mock('@/features/admin/apiToken/mutations/useRevokeApiToken', () => ({ revokeApiToken }));
vi.mock(
	'@/features/admin/apiToken/queries/getStaffApiTokens',
	() => ({ staffApiTokensQueryKey: ['fabric-admin', 'apiTokens'] }),
);
vi.mock('@/react-query/queryClient', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/react-query/queryClient')>()),
	errorHandler,
}));

vi.mock('sonner', () => ({ toast }));

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
const refusal = "A fabric_admin token would exceed the owner's fabric_support role";

function axiosFailure(status: number, body: unknown, method = 'post'): AxiosError {
	const config = { headers: new AxiosHeaders(), method };
	return new AxiosError('Request failed', String(status), config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: body,
	});
}

function pendingMint() {
	let resolve!: (value: unknown) => void;
	let reject!: (reason: unknown) => void;
	mutateAsync.mockImplementationOnce(
		() =>
			new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			}),
	);
	return {
		succeed: () => act(async () => resolve(minted)),
		fail: (error: unknown) => act(async () => reject(error)),
	};
}

function renderForm(holdingSecret = false) {
	const onMinted = vi.fn();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const { unmount } = render(
		<QueryClientProvider client={client}>
			<MintStaffApiTokenForm self={self} onMinted={onMinted} holdingSecret={holdingSecret} />
		</QueryClientProvider>,
	);
	return { onMinted, unmount };
}

async function fillAndSubmit(name = 'nightly report') {
	fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
	await act(async () => {
		fireEvent.submit(screen.getByRole('button', { name: 'Mint token' }).closest('form')!);
	});
}

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	mutateAsync.mockReset();
	reset.mockReset();
	errorHandler.mockReset();
	revokeApiToken.mockReset();
	toast.warning.mockReset();
	toast.error.mockReset();
});

afterEach(cleanup);

describe('MintStaffApiTokenForm', () => {
	it('mints for the signed-in owner at read-only for 14 days by default', async () => {
		const mint = pendingMint();
		renderForm();

		await fillAndSubmit();
		await mint.succeed();

		expect(mutateAsync.mock.calls[0][0]).toEqual({
			ownerUserId: 'usr-me',
			role: 'fabric_readonly',
			name: 'nightly report',
			expiresInHours: 336,
		});
	});

	// The order matters: the page must hold the secret before the mutation forgets it.
	it('hands the minted token to the page, then clears the mutation and the form', async () => {
		const mint = pendingMint();
		const { onMinted } = renderForm();

		await fillAndSubmit();
		await mint.succeed();

		expect(onMinted).toHaveBeenCalledWith(minted);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(onMinted.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0]);
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
	});

	it('shows a role wider than the owner holds under the role field, and toasts anything else', async () => {
		const first = pendingMint();
		renderForm();

		await fillAndSubmit();
		await first.fail(axiosFailure(403, { code: 'Forbidden', title: refusal }));
		expect(screen.getByText(refusal)).toBeDefined();
		expect(errorHandler).not.toHaveBeenCalled();

		const second = pendingMint();
		const limit = axiosFailure(409, { title: 'Limit of 3 live API tokens per owner reached' });
		await fillAndSubmit();
		await second.fail(limit);
		expect(errorHandler).toHaveBeenCalledWith(limit);
	});

	it('clears the refusal once the owner changes', async () => {
		const mint = pendingMint();
		renderForm();
		await fillAndSubmit();
		await mint.fail(axiosFailure(403, { title: refusal }));
		expect(screen.getByText(refusal)).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Change owner' }));

		expect(screen.queryByText(refusal)).toBeNull();
	});

	it('revokes a token minted after the page was left', async () => {
		const mint = pendingMint();
		const { onMinted, unmount } = renderForm();
		await fillAndSubmit();

		unmount();
		revokeApiToken.mockResolvedValue({ id: 'sat-1', revoked: true });
		await mint.succeed();

		expect(onMinted).not.toHaveBeenCalled();
		expect(revokeApiToken).toHaveBeenCalledWith('sat-1');
		expect(toast.warning).toHaveBeenCalled();
		expect(reset).toHaveBeenCalledTimes(1);
	});

	// A revoke whose answer was lost may have landed; the shared handler words that, a flat
	// "could not be revoked" would not.
	it('reports a failed unseen-token revoke through the shared handler', async () => {
		const mint = pendingMint();
		const { unmount } = renderForm();
		await fillAndSubmit();
		unmount();
		const lost = axiosFailure(502, 'Bad Gateway', 'delete');
		revokeApiToken.mockRejectedValueOnce(lost);

		await mint.succeed();

		expect(errorHandler).toHaveBeenCalledWith(lost);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('says an unseen token is still live when its revoke is refused', async () => {
		const mint = pendingMint();
		const { unmount } = renderForm();
		await fillAndSubmit();
		unmount();
		revokeApiToken.mockRejectedValueOnce(axiosFailure(404, { title: 'API token not found' }));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await mint.succeed();

		expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('still live'));
		expect(errorHandler).not.toHaveBeenCalled();
	});

	it('toasts a mint that failed after the page was left', async () => {
		const mint = pendingMint();
		const { unmount } = renderForm();
		await fillAndSubmit();
		unmount();
		const lost = new Error('timeout');

		await mint.fail(lost);

		expect(errorHandler).toHaveBeenCalledWith(lost);
	});

	it('does not demand an owner the moment the picker is cleared', async () => {
		renderForm();

		fireEvent.click(screen.getByRole('button', { name: 'Change owner' }));

		expect(screen.queryByText('Pick an owner.')).toBeNull();
	});

	// A second mint would replace the card before its secret was copied, leaving a live token
	// nobody can use.
	it('does not mint while the page still shows a secret', async () => {
		renderForm(true);

		expect((screen.getByRole('button', { name: 'Mint token' }) as HTMLButtonElement).disabled).toBe(true);
		await fillAndSubmit();

		expect(mutateAsync).not.toHaveBeenCalled();
		expect(screen.getByText(/before minting another/)).toBeDefined();
	});

	it('refuses an empty name before asking the server', async () => {
		renderForm();

		await fillAndSubmit('   ');

		expect(mutateAsync).not.toHaveBeenCalled();
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
