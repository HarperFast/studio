/**
 * @vitest-environment jsdom
 */
import { AddSSHKeyModal } from '@/features/instance/config/sshKeys/modals/AddSSHKeyModal';
import { ED25519_PUBLIC_KEY, openSSHPrivateKey } from '@/integrations/api/instance/ssh/testHelpers';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), loading: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));
vi.mock('@/integrations/api/instance/ssh/addSSHKey', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/ssh/addSSHKey')>()),
	useAddSSHKey: () => ({ mutate, isPending: false }),
}));

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderModal() {
	return render(<AddSSHKeyModal isModalOpen onChangesSaved={() => {}} setIsModalOpen={() => {}} />);
}

async function type(label: string, value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
	});
}

function addButton() {
	return screen.getByRole('button', { name: /Add SSH Key/ }) as HTMLButtonElement;
}

async function submit() {
	await waitFor(() => expect(addButton().disabled).toBe(false));
	await act(async () => {
		fireEvent.click(addButton());
	});
}

describe('AddSSHKeyModal', () => {
	it('explains why a name with spaces and parentheses is refused (#1550)', async () => {
		renderModal();
		await type('Name', 'Spaces and (Parens)');

		expect(await screen.findByText('Can only contain letters, numbers, dashes and underscores.')).toBeTruthy();
		expect(addButton().disabled).toBe(true);
	});

	it('explains why a public key is refused', async () => {
		renderModal();
		await type('Key', ED25519_PUBLIC_KEY);

		expect(await screen.findByText(/This looks like a public key \("ssh-ed25519 …"\)/)).toBeTruthy();
	});

	it('sends the key as ssh reads it, even from an indented, double-spaced paste', async () => {
		renderModal();
		await type('Name', 'my-repo');
		await type('Key', `\n    ${openSSHPrivateKey().replaceAll('\n', '\n\n    ')}\n\n`);
		await type('Host', 'my-repo.git.example.com');
		await type('Hostname', 'git.example.com');
		await submit();

		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate.mock.calls[0][0]).toMatchObject({
			name: 'my-repo',
			key: openSSHPrivateKey() + '\n',
			host: 'my-repo.git.example.com',
			hostname: 'git.example.com',
			known_hosts: undefined,
		});
	});
});
