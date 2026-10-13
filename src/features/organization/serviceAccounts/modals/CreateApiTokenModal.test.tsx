/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsync, reset, invalidateQueries, copyText, revoke, toastWarning, pending } = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	reset: vi.fn(),
	invalidateQueries: vi.fn(),
	copyText: vi.fn(),
	revoke: vi.fn(),
	toastWarning: vi.fn(),
	pending: { value: false },
}));
const validationGate = vi.hoisted(() => ({ armed: false, calls: 0, release: null as null | (() => void) }));

// Holds the second validation once armed, to resume a submit after the first one's reveal.
vi.mock('@hookform/resolvers/zod', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@hookform/resolvers/zod')>();
	const zodResolver = actual.zodResolver as unknown as (...args: unknown[]) => (...args: unknown[]) => unknown;
	return {
		...actual,
		zodResolver: (...args: unknown[]) => {
			const resolve = zodResolver(...args);
			return async (...resolveArgs: unknown[]) => {
				if (validationGate.armed && ++validationGate.calls === 2) {
					await new Promise<void>((release) => (validationGate.release = release));
				}
				return resolve(...resolveArgs);
			};
		},
	};
});

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock('@/features/organization/serviceAccounts/mutations/createOrganizationApiToken', () => ({
	useCreateOrganizationApiTokenMutation: () => ({ mutateAsync, reset, isPending: pending.value }),
}));
vi.mock('@/features/organization/serviceAccounts/mutations/revokeOrganizationApiToken', () => ({
	revokeOrganizationApiToken: revoke,
}));
vi.mock('sonner', () => ({ toast: { warning: toastWarning, error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyTextToClipboard: () => copyText }));

import { CreateApiTokenModal } from './CreateApiTokenModal';

const TOKEN = 'fot_oat-abc_the-secret';
const created = {
	id: 'oat-abc',
	name: 'deploy',
	organizationId: 'org-1',
	createdAt: '2026-10-06T00:00:00.000Z',
	expiresAt: '2026-11-05T00:00:00.000Z',
	lastUsedAt: null,
	token: TOKEN,
};

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	Object.assign(validationGate, { armed: false, calls: 0, release: null });
	pending.value = false;
	mutateAsync.mockReset();
	revoke.mockReset();
	toastWarning.mockReset();
	reset.mockReset();
	invalidateQueries.mockReset();
	copyText.mockReset();
});

afterEach(cleanup);

const createButton = () => screen.getByRole('button', { name: 'Create Token' }) as HTMLButtonElement;

async function change(label: string, value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
	});
}

async function submit() {
	await act(async () => {
		fireEvent.click(createButton());
	});
}

describe('CreateApiTokenModal', () => {
	it('enables Create once a name is entered (the lifetime defaults to 30 days)', async () => {
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />);
		expect(createButton().disabled).toBe(true);
		await change('Name', 'deploy');
		expect(createButton().disabled).toBe(false);
	});

	it('submits the trimmed name, the lifetime as a number, and the service account', async () => {
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />);
		await change('Name', '  deploy  ');
		await change('Expires in (days)', '7');
		await submit();
		expect(mutateAsync).toHaveBeenCalledTimes(1);
		expect(mutateAsync.mock.calls[0][0]).toEqual({ serviceAccountId: 'sva-1', name: 'deploy', expiresInDays: 7 });
	});

	it('refuses a lifetime over 90 days or a fraction of a day', async () => {
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />);
		await change('Name', 'deploy');
		await change('Expires in (days)', '91');
		expect(createButton().disabled).toBe(true);
		await change('Expires in (days)', '1.5');
		expect(createButton().disabled).toBe(true);
	});

	it('shows the token once after creating it, drops it from the mutation, and refreshes the list', async () => {
		mutateAsync.mockResolvedValue(created);
		const onClose = vi.fn();
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={onClose} />);
		await change('Name', 'deploy');
		await submit();

		expect((screen.getByLabelText('API token') as HTMLInputElement).value).toBe(TOKEN);
		expect(reset).toHaveBeenCalled();
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['org-1', 'apiTokens'], refetchType: 'active' });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['org-1', 'serviceAccounts'], refetchType: 'active' });

		fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
		expect(copyText).toHaveBeenCalledWith(TOKEN);

		fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(onClose).toHaveBeenCalled();
	});

	it('does not show a token when creation fails', async () => {
		mutateAsync.mockRejectedValue(new Error('403'));
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />);
		await change('Name', 'deploy');
		await submit();
		expect(screen.queryByLabelText('API token')).toBeNull();
		expect(createButton()).toBeTruthy();
	});

	it('revokes a token that arrived but was never rendered before the modal unmounted', async () => {
		let resolveCreate: (value: typeof created) => void = () => undefined;
		mutateAsync.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
		revoke.mockResolvedValue({ id: 'oat-abc', revoked: true });
		const { unmount } = render(
			<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />,
		);
		await change('Name', 'deploy');
		await submit();
		await act(async () => {
			resolveCreate(created);
			for (let i = 0; i < 5; i++) { await Promise.resolve(); }
			unmount();
		});
		expect(revoke).toHaveBeenCalledWith({ tokenId: 'oat-abc' });
		expect(reset).not.toHaveBeenCalled();
	});

	it('does not revoke a token once it has been shown', async () => {
		mutateAsync.mockResolvedValue(created);
		const { unmount } = render(
			<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />,
		);
		await change('Name', 'deploy');
		await submit();
		expect(screen.getByLabelText('API token')).toBeTruthy();
		unmount();
		expect(revoke).not.toHaveBeenCalled();
	});

	it('cannot be closed once the request is sent, before the pending state renders', async () => {
		mutateAsync.mockReturnValue(new Promise(() => undefined));
		const onClose = vi.fn();
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={onClose} />);
		await change('Name', 'deploy');
		await submit();
		expect(mutateAsync).toHaveBeenCalledTimes(1);
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Close' }));
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		});
		expect(onClose).not.toHaveBeenCalled();
	});

	it('sends nothing when the dialog unmounts while the form is still validating', async () => {
		const { unmount } = render(
			<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />,
		);
		await change('Name', 'deploy');
		await act(async () => {
			fireEvent.submit(createButton().closest('form')!);
			unmount();
		});
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it('creates one token for a double submit', async () => {
		mutateAsync.mockReturnValue(new Promise(() => undefined));
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />);
		await change('Name', 'deploy');
		await act(async () => {
			fireEvent.submit(createButton().closest('form')!);
			fireEvent.submit(createButton().closest('form')!);
		});
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});

	it('revokes a token that arrives after the modal unmounted, since nobody saw it', async () => {
		let resolveCreate: (value: typeof created) => void = () => undefined;
		mutateAsync.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
		revoke.mockResolvedValue({ id: 'oat-abc', revoked: true });
		const { unmount } = render(
			<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />,
		);
		await change('Name', 'deploy');
		await submit();
		unmount();
		await act(async () => {
			resolveCreate(created);
		});
		expect(revoke).toHaveBeenCalledWith({ tokenId: 'oat-abc' });
		expect(toastWarning).toHaveBeenCalled();
		expect(toastWarning.mock.calls[0][0]).not.toContain(created.name);
		expect(reset).not.toHaveBeenCalled();
	});

	it('mints one token even when a second submit finishes validating after the reveal', async () => {
		mutateAsync.mockResolvedValue(created);
		render(<CreateApiTokenModal organizationId="org-1" serviceAccountId="sva-1" onClose={vi.fn()} />);
		await change('Name', 'deploy');
		validationGate.armed = true;
		await act(async () => {
			const form = createButton().closest('form')!;
			fireEvent.submit(form);
			fireEvent.submit(form);
		});
		expect(screen.getByLabelText('API token')).toBeTruthy();
		expect(validationGate.release).not.toBeNull();
		await act(async () => {
			validationGate.release?.();
		});
		expect(mutateAsync).toHaveBeenCalledTimes(1);
		expect((screen.getByLabelText('API token') as HTMLInputElement).value).toBe(TOKEN);
	});
});
