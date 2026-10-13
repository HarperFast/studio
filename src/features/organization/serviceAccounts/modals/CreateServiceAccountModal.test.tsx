/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectStub } from '../__tests__/selectStub';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({
		data: [
			{ id: 'rol-ci', roleName: 'ci-preview' },
			{ id: 'rol-admin', roleName: 'admin' },
		],
		isLoading: false,
	}),
}));
vi.mock('@/features/organization/serviceAccounts/mutations/serviceAccounts', () => ({
	useCreateServiceAccountMutation: () => ({ mutate, isPending: false }),
}));
vi.mock('@/components/ui/select', () => selectStub);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CreateServiceAccountModal } from './CreateServiceAccountModal';

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	mutate.mockReset();
});

afterEach(cleanup);

const createButton = () => screen.getByRole('button', { name: 'Create Service Account' }) as HTMLButtonElement;

async function fill(name: string, roleId: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
		fireEvent.change(screen.getByLabelText('Role'), { target: { value: roleId } });
	});
}

describe('CreateServiceAccountModal', () => {
	it('needs both a name and a role', async () => {
		render(<CreateServiceAccountModal organizationId="org-1" onClose={vi.fn()} onCreated={vi.fn()} />);
		expect(createButton().disabled).toBe(true);
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'github-actions' } });
		});
		expect(createButton().disabled).toBe(true);
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'rol-ci' } });
		});
		await waitFor(() => expect(createButton().disabled).toBe(false));
	});

	it('creates the account in the organization with the trimmed name, then hands it back', async () => {
		const created = { id: 'sva-new', name: 'github-actions' };
		mutate.mockImplementation((_payload, { onSuccess }) => onSuccess(created));
		const onCreated = vi.fn();
		render(<CreateServiceAccountModal organizationId="org-1" onClose={vi.fn()} onCreated={onCreated} />);
		await fill('  github-actions ', 'rol-ci');
		await act(async () => {
			fireEvent.click(createButton());
		});
		expect(mutate.mock.calls[0][0]).toEqual({ organizationId: 'org-1', name: 'github-actions', roleId: 'rol-ci' });
		expect(onCreated).toHaveBeenCalledWith(created);
	});

	it('sends one create for two quick submits, and stays open while it is in flight', async () => {
		const onClose = vi.fn();
		render(<CreateServiceAccountModal organizationId="org-1" onClose={onClose} onCreated={vi.fn()} />);
		await fill('github-actions', 'rol-ci');
		await act(async () => {
			fireEvent.click(createButton());
			fireEvent.click(createButton());
		});
		expect(mutate).toHaveBeenCalledTimes(1);
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		});
		expect(onClose).not.toHaveBeenCalled();
	});

	it('lets a failed create be retried', async () => {
		mutate.mockImplementationOnce((_payload, { onError }) => onError(new Error('409')));
		render(<CreateServiceAccountModal organizationId="org-1" onClose={vi.fn()} onCreated={vi.fn()} />);
		await fill('github-actions', 'rol-ci');
		await act(async () => {
			fireEvent.click(createButton());
		});
		await act(async () => {
			fireEvent.click(createButton());
		});
		expect(mutate).toHaveBeenCalledTimes(2);
	});

	it('creates nothing when a submit resumes after the dialog has closed', async () => {
		const { unmount } = render(
			<CreateServiceAccountModal organizationId="org-1" onClose={vi.fn()} onCreated={vi.fn()} />,
		);
		await fill('github-actions', 'rol-ci');
		await act(async () => {
			fireEvent.click(createButton());
			unmount();
		});
		expect(mutate).not.toHaveBeenCalled();
	});
});
